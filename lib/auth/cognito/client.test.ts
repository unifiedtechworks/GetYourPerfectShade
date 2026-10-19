import { describe, expect, it } from "vitest";
import { ChallengeNameType, VerifySoftwareTokenResponseType } from "@aws-sdk/client-cognito-identity-provider";
import { createCognitoAuthService } from "./client";

class FakeCognitoClient {
  readonly commands: unknown[] = [];

  constructor(private readonly responses: Array<unknown | Error>) {}

  async send(command: unknown) {
    this.commands.push(command);
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    return response ?? {};
  }
}

const tokens = {
  AccessToken: "test-access-token",
  IdToken: "test-id-token",
  RefreshToken: "test-refresh-token",
  ExpiresIn: 3600,
};

describe("Cognito MFA challenge state machine", () => {
  it("requires a password as the first factor and completes native email MFA", async () => {
    const client = new FakeCognitoClient([
      { ChallengeName: ChallengeNameType.EMAIL_OTP, Session: "email-session" },
      { AuthenticationResult: tokens },
    ]);
    const service = createCognitoAuthService(client, "client-id");

    await expect(service.authenticateWithPassword(
      "staff@example.com",
      "not-recorded",
    )).resolves.toEqual({
      status: "email-mfa-code-required",
      username: "staff@example.com",
      session: "email-session",
      challengeName: "EMAIL_OTP",
    });
    await expect(service.completeEmailMfa(
      "staff@example.com",
      "email-session",
      "123456",
      "EMAIL_OTP",
    )).resolves.toEqual({ status: "authenticated", tokens });

    expect(client.commands[0]).toMatchObject({
      input: {
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: "staff@example.com",
          PASSWORD: "not-recorded",
        },
      },
    });
    expect(client.commands[0]).not.toMatchObject({
      input: { AuthFlow: "USER_AUTH" },
    });
    expect(client.commands[1]).toMatchObject({
      input: {
        ChallengeName: "EMAIL_OTP",
        ChallengeResponses: {
          USERNAME: "staff@example.com",
          EMAIL_OTP_CODE: "123456",
        },
      },
    });
  });

  it("supports the legacy EMAIL_MFA response name without enabling passwordless auth", async () => {
    const client = new FakeCognitoClient([
      { ChallengeName: "EMAIL_MFA", Session: "legacy-email-session" },
      { AuthenticationResult: tokens },
    ]);
    const service = createCognitoAuthService(client, "client-id");

    await expect(service.authenticateWithPassword(
      "staff@example.com",
      "not-recorded",
    )).resolves.toMatchObject({
      status: "email-mfa-code-required",
      challengeName: "EMAIL_MFA",
    });
    await expect(service.completeEmailMfa(
      "staff@example.com",
      "legacy-email-session",
      "654321",
      "EMAIL_MFA",
    )).resolves.toEqual({ status: "authenticated", tokens });
    expect(client.commands[1]).toMatchObject({
      input: {
        ChallengeName: "EMAIL_MFA",
        ChallengeResponses: { EMAIL_MFA_CODE: "654321" },
      },
    });
  });

  it.each(["CodeMismatchException", "ExpiredCodeException"])(
    "returns a secret-safe error for %s",
    async (name) => {
      const client = new FakeCognitoClient([
        new Error(`${name} code=DO-NOT-PRINT token=DO-NOT-PRINT`),
      ]);
      const result = await createCognitoAuthService(client, "client-id")
        .completeEmailMfa("staff@example.com", "email-session", "000000", "EMAIL_OTP");

      expect(result).toEqual({ status: "mfa-code-error" });
      expect(JSON.stringify(result)).not.toContain("DO-NOT-PRINT");
      expect(JSON.stringify(result)).not.toContain("000000");
    },
  );

  it("handles a NEW_PASSWORD_REQUIRED to email-MFA sequence", async () => {
    const client = new FakeCognitoClient([
      { ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED, Session: "password-session" },
      { ChallengeName: ChallengeNameType.EMAIL_OTP, Session: "email-session" },
      { AuthenticationResult: tokens },
    ]);
    const service = createCognitoAuthService(client, "client-id");

    await expect(service.authenticateWithPassword(
      "staff@example.com",
      "temporary-not-recorded",
    )).resolves.toMatchObject({ status: "new-password-required" });
    await expect(service.completeNewPassword(
      "staff@example.com",
      "password-session",
      "permanent-not-recorded",
    )).resolves.toMatchObject({
      status: "email-mfa-code-required",
      challengeName: "EMAIL_OTP",
    });
    await expect(service.completeEmailMfa(
      "staff@example.com",
      "email-session",
      "123456",
      "EMAIL_OTP",
    )).resolves.toEqual({ status: "authenticated", tokens });
  });

  it("reads the production MFAS_CAN_CHOOSE field and selects its EMAIL_OTP offer", async () => {
    const client = new FakeCognitoClient([
      {
        ChallengeName: ChallengeNameType.SELECT_MFA_TYPE,
        ChallengeParameters: {
          MFAS_CAN_CHOOSE: '["EMAIL_OTP","SOFTWARE_TOKEN_MFA"]',
        },
        Session: "selection-session",
      },
      { ChallengeName: ChallengeNameType.EMAIL_OTP, Session: "email-session" },
    ]);
    const service = createCognitoAuthService(client, "client-id");

    await expect(service.authenticateWithPassword(
      "staff@example.com",
      "not-recorded",
    )).resolves.toMatchObject({
      status: "mfa-selection-required",
      methods: [
        { method: "email", answer: "EMAIL_OTP" },
        { method: "software-token", answer: "SOFTWARE_TOKEN_MFA" },
      ],
    });
    await expect(service.selectMfaType(
      "staff@example.com",
      "selection-session",
      "EMAIL_OTP",
    )).resolves.toMatchObject({ status: "email-mfa-code-required" });
    expect(client.commands[1]).toMatchObject({
      input: {
        ChallengeName: "SELECT_MFA_TYPE",
        ChallengeResponses: { ANSWER: "EMAIL_OTP" },
      },
    });
  });

  it("keeps MFAS_CAN_SELECT compatibility and parses comma-delimited offers", async () => {
    const client = new FakeCognitoClient([{
      ChallengeName: ChallengeNameType.SELECT_MFA_TYPE,
      ChallengeParameters: {
        MFAS_CAN_SELECT: "EMAIL_OTP, SOFTWARE_TOKEN_MFA",
      },
      Session: "selection-session",
    }]);

    await expect(createCognitoAuthService(client, "client-id").authenticateWithPassword(
      "staff@example.com",
      "not-recorded",
    )).resolves.toMatchObject({
      status: "mfa-selection-required",
      methods: [
        { method: "email", answer: "EMAIL_OTP" },
        { method: "software-token", answer: "SOFTWARE_TOKEN_MFA" },
      ],
    });
  });

  it("preserves and submits the legacy EMAIL_MFA offer", async () => {
    const client = new FakeCognitoClient([
      {
        ChallengeName: ChallengeNameType.SELECT_MFA_TYPE,
        ChallengeParameters: { MFAS_CAN_CHOOSE: '["EMAIL_MFA"]' },
        Session: "selection-session",
      },
      { ChallengeName: "EMAIL_MFA", Session: "legacy-email-session" },
    ]);
    const service = createCognitoAuthService(client, "client-id");

    await expect(service.authenticateWithPassword(
      "staff@example.com",
      "not-recorded",
    )).resolves.toMatchObject({
      status: "mfa-selection-required",
      methods: [{ method: "email", answer: "EMAIL_MFA" }],
    });
    await expect(service.selectMfaType(
      "staff@example.com",
      "selection-session",
      "EMAIL_MFA",
    )).resolves.toMatchObject({
      status: "email-mfa-code-required",
      challengeName: "EMAIL_MFA",
    });
    expect(client.commands[1]).toMatchObject({
      input: { ChallengeResponses: { ANSWER: "EMAIL_MFA" } },
    });
  });

  it("selects the existing authenticator-app method", async () => {
    const client = new FakeCognitoClient([{
      ChallengeName: ChallengeNameType.SOFTWARE_TOKEN_MFA,
      Session: "totp-session",
    }]);
    const service = createCognitoAuthService(client, "client-id");

    await expect(service.selectMfaType(
      "staff@example.com",
      "selection-session",
      "SOFTWARE_TOKEN_MFA",
    )).resolves.toMatchObject({ status: "mfa-code-required" });
    expect(client.commands[0]).toMatchObject({
      input: {
        ChallengeName: "SELECT_MFA_TYPE",
        ChallengeResponses: { ANSWER: "SOFTWARE_TOKEN_MFA" },
      },
    });
  });

  it("treats TOTP enrollment as a Cognito challenge, not as a preference side effect", async () => {
    const client = new FakeCognitoClient([{
      ChallengeName: ChallengeNameType.MFA_SETUP,
      Session: "setup-session",
    }]);
    const service = createCognitoAuthService(client, "client-id");

    await expect(service.selectMfaType(
      "staff@example.com",
      "selection-session",
      "SOFTWARE_TOKEN_MFA",
    )).resolves.toEqual({
      status: "mfa-setup-required",
      username: "staff@example.com",
      session: "setup-session",
    });
  });
  it("recognizes the required TOTP setup challenge", async () => {
    const client = new FakeCognitoClient([{
      ChallengeName: ChallengeNameType.MFA_SETUP,
      Session: "setup-session",
    }]);
    const result = await createCognitoAuthService(client, "client-id")
      .authenticateWithPassword("staff@example.com", "not-recorded");

    expect(result).toEqual({
      status: "mfa-setup-required",
      username: "staff@example.com",
      session: "setup-session",
    });
  });

  it("associates and verifies a software token before completing MFA setup", async () => {
    const client = new FakeCognitoClient([
      { SecretCode: "TRANSIENTSEED", Session: "verify-session" },
      { Status: VerifySoftwareTokenResponseType.SUCCESS, Session: "complete-session" },
      { AuthenticationResult: tokens },
    ]);
    const service = createCognitoAuthService(client, "client-id");

    await expect(service.beginMfaSetup("setup-session")).resolves.toEqual({
      status: "setup-ready",
      secret: "TRANSIENTSEED",
      session: "verify-session",
    });
    await expect(service.completeMfaSetup(
      "staff@example.com",
      "verify-session",
      "123456",
    )).resolves.toEqual({ status: "authenticated", tokens });

    expect(client.commands.map((command) => command?.constructor?.name)).toEqual([
      "AssociateSoftwareTokenCommand",
      "VerifySoftwareTokenCommand",
      "RespondToAuthChallengeCommand",
    ]);
    const rendered = JSON.stringify(client.commands);
    expect(rendered).not.toContain("TRANSIENTSEED");
  });

  it("responds to subsequent software-token MFA sign-in", async () => {
    const client = new FakeCognitoClient([
      {
        ChallengeName: ChallengeNameType.SOFTWARE_TOKEN_MFA,
        Session: "mfa-session",
      },
      { AuthenticationResult: tokens },
    ]);
    const service = createCognitoAuthService(client, "client-id");

    await expect(service.authenticateWithPassword(
      "staff@example.com",
      "not-recorded",
    )).resolves.toMatchObject({ status: "mfa-code-required" });
    await expect(service.completeSoftwareMfa(
      "staff@example.com",
      "mfa-session",
      "654321",
    )).resolves.toEqual({ status: "authenticated", tokens });
  });

  it("returns a secret-safe MFA code error without exposing raw Cognito details", async () => {
    const client = new FakeCognitoClient([
      new Error("CodeMismatchException seed=DO-NOT-PRINT"),
    ]);
    const result = await createCognitoAuthService(client, "client-id")
      .completeSoftwareMfa("staff@example.com", "mfa-session", "000000");

    expect(result).toEqual({ status: "mfa-code-error" });
    expect(JSON.stringify(result)).not.toContain("DO-NOT-PRINT");
  });

  it("keeps development password-only authentication compatible", async () => {
    const client = new FakeCognitoClient([{ AuthenticationResult: tokens }]);
    await expect(createCognitoAuthService(client, "client-id")
      .authenticateWithPassword("staff@example.com", "not-recorded"))
      .resolves.toEqual({ status: "authenticated", tokens });
  });

  it("fails closed for unsupported challenges", async () => {
    const client = new FakeCognitoClient([{
      ChallengeName: ChallengeNameType.SELECT_CHALLENGE,
      Session: "unsupported-session",
    }]);
    await expect(createCognitoAuthService(client, "client-id")
      .authenticateWithPassword("staff@example.com", "not-recorded"))
      .resolves.toEqual({ status: "unsupported-challenge" });
  });

  it("fails closed when SELECT_MFA_TYPE lacks supported methods", async () => {
    const client = new FakeCognitoClient([{
      ChallengeName: ChallengeNameType.SELECT_MFA_TYPE,
      ChallengeParameters: { MFAS_CAN_SELECT: '["SMS_MFA"]' },
      Session: "unsupported-session",
    }]);
    await expect(createCognitoAuthService(client, "client-id")
      .authenticateWithPassword("staff@example.com", "not-recorded"))
      .resolves.toEqual({ status: "unsupported-challenge" });
  });

  describe.each(["MFAS_CAN_CHOOSE", "MFAS_CAN_SELECT"])("strict %s offers", (parameter) => {
    it.each([
      ["duplicate EMAIL_OTP JSON", '["EMAIL_OTP","EMAIL_OTP"]'],
      ["duplicate EMAIL_OTP comma list", "EMAIL_OTP, EMAIL_OTP"],
      ["duplicate SOFTWARE_TOKEN_MFA JSON", '["SOFTWARE_TOKEN_MFA","SOFTWARE_TOKEN_MFA"]'],
      ["duplicate SOFTWARE_TOKEN_MFA comma list", "SOFTWARE_TOKEN_MFA, SOFTWARE_TOKEN_MFA"],
      ["duplicate EMAIL_MFA JSON", '["EMAIL_MFA","EMAIL_MFA"]'],
      ["duplicate EMAIL_MFA comma list", "EMAIL_MFA, EMAIL_MFA"],
      ["whitespace-equivalent duplicates", '["EMAIL_OTP"," EMAIL_OTP "]'],
      ["nonadjacent JSON duplicates", '["EMAIL_OTP","SOFTWARE_TOKEN_MFA","EMAIL_OTP"]'],
      ["nonadjacent comma duplicates", "SOFTWARE_TOKEN_MFA, EMAIL_OTP, SOFTWARE_TOKEN_MFA"],
      ["ambiguous email JSON", '["EMAIL_OTP","EMAIL_MFA"]'],
      ["ambiguous email comma list", "EMAIL_OTP, EMAIL_MFA"],
    ])("rejects %s without issuing tokens or advancing authentication", async (_label, value) => {
      const client = new FakeCognitoClient([
        {
          ChallengeName: ChallengeNameType.SELECT_MFA_TYPE,
          ChallengeParameters: { [parameter]: value },
          Session: "selection-session",
        },
        { AuthenticationResult: tokens },
      ]);

      const result = await createCognitoAuthService(client, "client-id")
        .authenticateWithPassword("staff@example.com", "not-recorded");

      expect(result).toEqual({ status: "unsupported-challenge" });
      expect(result).not.toHaveProperty("tokens");
      expect(client.commands).toHaveLength(1);
    });

    it.each([
      ["EMAIL_OTP JSON", '["EMAIL_OTP","SOFTWARE_TOKEN_MFA"]', "EMAIL_OTP"],
      ["EMAIL_OTP comma list", "EMAIL_OTP, SOFTWARE_TOKEN_MFA", "EMAIL_OTP"],
      ["EMAIL_MFA JSON", '["EMAIL_MFA","SOFTWARE_TOKEN_MFA"]', "EMAIL_MFA"],
      ["EMAIL_MFA comma list", "EMAIL_MFA, SOFTWARE_TOKEN_MFA", "EMAIL_MFA"],
      ["TOTP JSON", '["EMAIL_OTP","SOFTWARE_TOKEN_MFA"]', "SOFTWARE_TOKEN_MFA"],
      ["TOTP comma list", "EMAIL_OTP, SOFTWARE_TOKEN_MFA", "SOFTWARE_TOKEN_MFA"],
    ] as const)("completes password, selection, and %s verification", async (_label, value, answer) => {
      const client = new FakeCognitoClient([
        {
          ChallengeName: ChallengeNameType.SELECT_MFA_TYPE,
          ChallengeParameters: { [parameter]: value },
          Session: "selection-session",
        },
        { ChallengeName: answer, Session: "verification-session" },
        { AuthenticationResult: tokens },
      ]);
      const service = createCognitoAuthService(client, "client-id");
      const emailAnswer = value.includes("EMAIL_MFA") ? "EMAIL_MFA" : "EMAIL_OTP";

      const selection = await service.authenticateWithPassword("staff@example.com", "not-recorded");
      expect(selection).toMatchObject({
        status: "mfa-selection-required",
        methods: [
          { method: "email", answer: emailAnswer },
          { method: "software-token", answer: "SOFTWARE_TOKEN_MFA" },
        ],
      });
      expect(selection).not.toHaveProperty("tokens");

      const challenge = await service.selectMfaType("staff@example.com", "selection-session", answer);
      expect(challenge).toMatchObject({
        status: answer === "SOFTWARE_TOKEN_MFA" ? "mfa-code-required" : "email-mfa-code-required",
        session: "verification-session",
      });
      expect(challenge).not.toHaveProperty("tokens");

      const authenticated = answer === "SOFTWARE_TOKEN_MFA"
        ? await service.completeSoftwareMfa("staff@example.com", "verification-session", "123456")
        : await service.completeEmailMfa("staff@example.com", "verification-session", "123456", answer);
      expect(authenticated).toEqual({ status: "authenticated", tokens });
      expect(client.commands).toHaveLength(3);
      expect(client.commands[0]).toMatchObject({ input: { AuthFlow: "USER_PASSWORD_AUTH" } });
      expect(client.commands[1]).toMatchObject({
        input: { ChallengeName: "SELECT_MFA_TYPE", ChallengeResponses: { ANSWER: answer } },
      });
      expect(client.commands[2]).toMatchObject({ input: { ChallengeName: answer } });
    });
  });

  it.each([
    ["duplicate production offers", {
      MFAS_CAN_CHOOSE: '["EMAIL_OTP","EMAIL_OTP"]',
      MFAS_CAN_SELECT: '["EMAIL_OTP"]',
    }],
    ["duplicate legacy offers", {
      MFAS_CAN_CHOOSE: '["SOFTWARE_TOKEN_MFA"]',
      MFAS_CAN_SELECT: "SOFTWARE_TOKEN_MFA, SOFTWARE_TOKEN_MFA",
    }],
    ["matching but duplicated fields", {
      MFAS_CAN_CHOOSE: '["EMAIL_OTP","EMAIL_OTP"]',
      MFAS_CAN_SELECT: "EMAIL_OTP, EMAIL_OTP",
    }],
    ["conflicting email variants", {
      MFAS_CAN_CHOOSE: '["EMAIL_OTP"]',
      MFAS_CAN_SELECT: '["EMAIL_MFA"]',
    }],
  ])("does not let a second metadata field rescue %s", async (_label, parameters) => {
    const client = new FakeCognitoClient([{
      ChallengeName: ChallengeNameType.SELECT_MFA_TYPE,
      ChallengeParameters: parameters,
      Session: "selection-session",
    }]);
    const result = await createCognitoAuthService(client, "client-id")
      .authenticateWithPassword("staff@example.com", "not-recorded");

    expect(result).toEqual({ status: "unsupported-challenge" });
    expect(result).not.toHaveProperty("tokens");
    expect(client.commands).toHaveLength(1);
  });

  it("accepts agreeing nonduplicate fields despite formatting and order differences", async () => {
    const client = new FakeCognitoClient([{
      ChallengeName: ChallengeNameType.SELECT_MFA_TYPE,
      ChallengeParameters: {
        MFAS_CAN_CHOOSE: '["SOFTWARE_TOKEN_MFA","EMAIL_OTP"]',
        MFAS_CAN_SELECT: "EMAIL_OTP, SOFTWARE_TOKEN_MFA",
      },
      Session: "selection-session",
    }]);

    await expect(createCognitoAuthService(client, "client-id")
      .authenticateWithPassword("staff@example.com", "not-recorded"))
      .resolves.toMatchObject({
        status: "mfa-selection-required",
        methods: [
          { method: "email", answer: "EMAIL_OTP" },
          { method: "software-token", answer: "SOFTWARE_TOKEN_MFA" },
        ],
      });
  });

  it.each([
    ["missing metadata", undefined],
    ["malformed JSON", { MFAS_CAN_CHOOSE: '["EMAIL_OTP"' }],
    ["non-array JSON", { MFAS_CAN_CHOOSE: '{"method":"EMAIL_OTP"}' }],
    ["unknown method", { MFAS_CAN_CHOOSE: '["EMAIL_OTP","CUSTOM_MFA"]' }],
    ["mixed SMS method", { MFAS_CAN_CHOOSE: '["EMAIL_OTP","SMS_MFA"]' }],
    ["conflicting email aliases", { MFAS_CAN_CHOOSE: '["EMAIL_OTP","EMAIL_MFA"]' }],
    ["conflicting fields", {
      MFAS_CAN_CHOOSE: '["EMAIL_OTP"]',
      MFAS_CAN_SELECT: '["SOFTWARE_TOKEN_MFA"]',
    }],
  ])("fails closed for %s", async (_label, parameters) => {
    const client = new FakeCognitoClient([{
      ChallengeName: ChallengeNameType.SELECT_MFA_TYPE,
      ChallengeParameters: parameters,
      Session: "selection-session",
    }]);

    await expect(createCognitoAuthService(client, "client-id")
      .authenticateWithPassword("staff@example.com", "not-recorded"))
      .resolves.toEqual({ status: "unsupported-challenge" });
  });

  it("rejects a caller-supplied unsupported selection before sending to Cognito", async () => {
    const client = new FakeCognitoClient([]);
    const service = createCognitoAuthService(client, "client-id");

    await expect(service.selectMfaType(
      "staff@example.com",
      "selection-session",
      "SMS_MFA" as never,
    )).resolves.toEqual({ status: "mfa-code-error" });
    expect(client.commands).toHaveLength(0);
  });
});
