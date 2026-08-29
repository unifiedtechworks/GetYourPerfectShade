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

describe("Cognito TOTP challenge state machine", () => {
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
});
