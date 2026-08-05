import { describe, expect, it } from "vitest";
import {
  CognitoDirectoryError,
  CognitoStaffIdentityDirectory,
} from "./cognito-admin";

class FakeClient {
  readonly commands: unknown[] = [];
  constructor(readonly responses: unknown[]) {}

  async send(command: unknown) {
    this.commands.push(command);
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    return response;
  }
}

const attributes = [
  { Name: "sub", Value: "staff-sub" },
  { Name: "email", Value: "staff@example.com" },
  { Name: "email_verified", Value: "true" },
];

describe("Cognito staff identity directory", () => {
  it("uses AdminCreateUser email delivery without accepting or exposing a password", async () => {
    const client = new FakeClient([{
      User: {
        Attributes: attributes,
        UserStatus: "FORCE_CHANGE_PASSWORD",
        Enabled: true,
      },
    }]);
    const directory = new CognitoStaffIdentityDirectory("pool-id", client);

    await expect(directory.create("staff@example.com")).resolves.toMatchObject({
      subject: "staff-sub",
      status: "FORCE_CHANGE_PASSWORD",
    });
    const serialized = JSON.stringify(client.commands[0]);
    expect(client.commands[0]?.constructor?.name).toBe("AdminCreateUserCommand");
    expect(serialized).toContain("DesiredDeliveryMediums");
    expect(serialized).not.toContain("TemporaryPassword");
    expect(serialized.toLowerCase()).not.toContain("password");
  });

  it("detects an existing Cognito user safely", async () => {
    const client = new FakeClient([{
      UserAttributes: attributes,
      UserStatus: "CONFIRMED",
      Enabled: true,
    }]);
    const directory = new CognitoStaffIdentityDirectory("pool-id", client);
    await expect(directory.findByEmail("staff@example.com")).resolves.toMatchObject({
      subject: "staff-sub",
      emailVerified: true,
    });
    expect(client.commands[0]?.constructor?.name).toBe("AdminGetUserCommand");
  });

  it("returns null only for UserNotFoundException", async () => {
    const error = Object.assign(new Error("not found"), { name: "UserNotFoundException" });
    const client = new FakeClient([error]);
    const directory = new CognitoStaffIdentityDirectory("pool-id", client);
    await expect(directory.findByEmail("missing@example.com")).resolves.toBeNull();
  });

  it("fails closed with secret-safe errors when configuration or AWS is unavailable", async () => {
    const missing = new CognitoStaffIdentityDirectory("", new FakeClient([]));
    await expect(missing.list()).rejects.toMatchObject({
      code: "configuration",
      message: expect.not.stringContaining("pool"),
    });

    const unavailable = new CognitoStaffIdentityDirectory(
      "pool-id",
      new FakeClient([new Error("TemporaryPassword=DoNotExpose")]),
    );
    let caught: unknown;
    try {
      await unavailable.list();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CognitoDirectoryError);
    expect(String((caught as Error).message)).not.toContain("DoNotExpose");
  });
});
