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

  it("offers only supported methods from SELECT_MFA_TYPE and selects email", async () => {
    const client = new FakeCognitoClient([
      {
        ChallengeName: ChallengeNameType.SELECT_MFA_TYPE,
        ChallengeParameters: {
          MFAS_CAN_SELECT: '["EMAIL_OTP","SOFTWARE_TOKEN_MFA","SMS_MFA"]',
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
      methods: ["email", "software-token"],
    });
    await expect(service.selectMfaType(
      "staff@example.com",
      "selection-session",
      "email",
    )).resolves.toMatchObject({ status: "email-mfa-code-required" });
    expect(client.commands[1]).toMatchObject({
      input: {
        ChallengeName: "SELECT_MFA_TYPE",
        ChallengeResponses: { ANSWER: "EMAIL_OTP" },
      },
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
      "software-token",
    )).resolves.toMatchObject({ status: "mfa-code-required" });
    expect(client.commands[0]).toMatchObject({
      input: {
        ChallengeName: "SELECT_MFA_TYPE",
        ChallengeResponses: { ANSWER: "SOFTWARE_TOKEN_MFA" },
      },
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
});
