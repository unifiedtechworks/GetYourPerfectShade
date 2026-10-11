import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fromSSO } from "@aws-sdk/credential-provider-sso";
import { ACCOUNT, REGION, POOL, parseArguments, recoveryPreflight, runRecoveryCli,
  validateOperatorConfiguration, validateRecoveryRequest,
  type OperatorConfiguration, type RecoveryRequest, type RecoveryReaders, type SafeUserState } from "./cognito-recovery-preflight.mjs";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
vi.mock("@aws-sdk/credential-provider-sso", () => ({
  fromSSO: vi.fn(() => { throw Error("private credential details must never appear"); }),
}));

const now = 1_000_000;
const subject = "11111111-1111-1111-1111-111111111111";
const role = "AWSReservedSSO_PerfectShadeProductionRecovery_1111111111111111";
const config: OperatorConfiguration = { accountId: ACCOUNT, region: REGION, userPoolId: POOL, profile: "perfect-shade-recovery",
  approvedRecoveryRoleArn: `arn:aws:iam::${ACCOUNT}:role/aws-reserved/sso.amazonaws.com/us-west-2/${role}`,
  mfaReviewReference: "mfa-review-1", emergencyReviewReference: "emergency-review-1" };
const request: RecoveryRequest = { scenario: "password", targetUsername: subject, expectedSubject: subject,
  authorizationReference: "change-1", identityReviewReference: "identity-1", membershipReviewReference: "membership-1", factorControlReviewReference: "factor-1" };
const user: SafeUserState = { username: subject, subject, enabled: true, status: "CONFIRMED", email: "fixture@example.invalid", emailVerified: true, enrolledFactors: ["SOFTWARE_TOKEN_MFA"] };
function readers(overrides: Partial<RecoveryReaders> = {}): RecoveryReaders {
  return { session: async () => ({ account: ACCOUNT, arn: `arn:aws:sts::${ACCOUNT}:assumed-role/${role}/operator`, temporary: true, expiresAt: now + 3_000_000 }),
    user: async () => user, emailUsers: async () => [], ...overrides };
}
describe("production Cognito recovery preflight", () => {
  it.each(["password", "totp", "email"] as const)("preflights %s without enabling execution or verifying membership by inference", async scenario => {
    const result = await recoveryPreflight(config, { ...request, scenario,
      ...(scenario === "email" ? { replacementEmail: "replacement@example.invalid" } : {}) }, readers(), now);
    expect(result).toMatchObject({ readOnly: true, executionEnabled: false, passwordTransferApproved: false, membershipVerifiedByTool: false });
    expect(JSON.stringify(result)).not.toContain(user.email);
    expect(JSON.stringify(result)).not.toContain(subject);
  });
  it.each(["default", "DEFAULT"])("rejects ordinary profile %s", profile => {
    expect(() => validateOperatorConfiguration({ ...config, profile })).toThrow();
  });
  it.each([{ accountId: "111111111111" }, { region: "us-east-1" }, { userPoolId: "us-west-2_development" },
    { approvedRecoveryRoleArn: "*" }, { approvedRecoveryRoleArn: config.approvedRecoveryRoleArn.replace("PerfectShadeProductionRecovery", "AdministratorAccess") },
    { mfaReviewReference: "" }, { emergencyReviewReference: "" }, { secretAccessKey: "never-log-this" }])("rejects unsafe operator configuration", extra => {
    expect(() => validateOperatorConfiguration({ ...config, ...extra })).toThrow();
  });
  it.each([{ temporary: false }, { expiresAt: now }, { expiresAt: now + 3_600_001 }, { expiresAt: NaN },
    { account: "111111111111" }, { arn: `arn:aws:iam::${ACCOUNT}:user/not-recovery` },
    { arn: `arn:aws:sts::${ACCOUNT}:assumed-role/AdministratorAccess/operator` }])("rejects unapproved credential/session state", async extra => {
    const session = await readers().session();
    await expect(recoveryPreflight(config, request, readers({ session: async () => ({ ...session, ...extra }) }), now)).rejects.toMatchObject({ code: "unapproved_session" });
  });
  it.each([{ subject: "22222222-2222-2222-2222-222222222222" }, { username: "wrong" }, { enabled: false },
    { status: "EXTERNAL_PROVIDER" }, { emailVerified: false }])("rejects target mismatch", async extra => {
    await expect(recoveryPreflight(config, request, readers({ user: async () => ({ ...user, ...extra }) }), now)).rejects.toMatchObject({ code: "target_identity_mismatch" });
  });
  it("does not treat a preferred factor as enrollment", async () => {
    await expect(recoveryPreflight(config, { ...request, scenario: "totp" }, readers({ user: async () => ({ ...user, enrolledFactors: [] }) }), now)).rejects.toMatchObject({ code: "totp_not_enrolled" });
  });
  it("rejects replacement collision and ambiguous duplicate results", async () => {
    for (const matches of [[{ ...user, subject: "different" }], [user, user]]) {
      await expect(recoveryPreflight(config, { ...request, scenario: "email", replacementEmail: "replacement@example.invalid" },
        readers({ emailUsers: async () => matches }), now)).rejects.toMatchObject({ code: "replacement_email_collision" });
    }
  });
  it("allows read-only inspection of an already completed replacement for the same subject", async () => {
    const result = await recoveryPreflight(config, { ...request, scenario: "email", replacementEmail: user.email }, readers({ emailUsers: async () => [user] }), now);
    expect(result.emailUpdateAlreadyComplete).toBe(true);
    expect(result.emailSnapshotReconciliationRequired).toBe(true);
  });
  it("requires authorization, identity, membership and factor-control references", () => {
    for (const field of ["authorizationReference", "identityReviewReference", "membershipReviewReference", "factorControlReviewReference"]) {
      expect(() => validateRecoveryRequest({ ...request, [field]: "" })).toThrow();
    }
    expect(() => validateRecoveryRequest({ ...request, scenario: "email", replacementEmail: 'bad"filter@example.invalid' })).toThrow();
  });
  it("redacts arbitrary SDK errors including private details", async () => {
    const error = await recoveryPreflight(config, request, readers({ user: async () => { throw Error("private-email session secret password"); } }), now).catch(value => value);
    expect(error.code).toBe("aws_read_failed");
    expect(error.message).not.toMatch(/private-email|session secret password/);
  });
  it.each(["--execute", "--password", "--create-user", "--delete-user"])("has no mutation/password CLI surface %s", async flag => {
    const messages: string[] = [];
    expect(await runRecoveryCli([flag, "private-secret"], value => messages.push(value))).toBe(1);
    expect(messages.join()).not.toContain("private-secret");
    expect(() => parseArguments([flag, "private-secret"])).toThrow();
  });
  it("provides safe help and requires an explicit mode", async () => {
    expect(await runRecoveryCli(["--help"], () => {})).toBe(0);
    expect(() => parseArguments(["--config", "x", "--request", "y"])).toThrow();
    expect(() => parseArguments(["--dry-run", "--preflight", "--config", "x", "--request", "y"])).toThrow();
  });
  it("runs CLI dry-run without constructing an SSO provider or making AWS calls", async () => {
    vi.mocked(fromSSO).mockClear();
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(config)).mockResolvedValueOnce(JSON.stringify(request));
    const messages: string[] = [];
    expect(await runRecoveryCli(["--config", "private-config", "--request", "private-request", "--dry-run"], value => messages.push(value))).toBe(0);
    expect(fromSSO).not.toHaveBeenCalled();
    expect(messages).toEqual([JSON.stringify({ mode: "dry-run", readOnly: true, awsCalls: false, executionEnabled: false })]);
    expect(messages.join()).not.toContain(subject);
    expect(messages.join()).not.toContain(request.authorizationReference);
  });
  it("redacts credential-provider failure at the CLI boundary", async () => {
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(config)).mockResolvedValueOnce(JSON.stringify(request));
    const messages: string[] = [];
    expect(await runRecoveryCli(["--config", "private-config", "--request", "private-request", "--preflight"], value => messages.push(value))).toBe(1);
    expect(messages.join()).not.toContain("private credential details");
    expect(messages.join()).not.toContain(subject);
    expect(JSON.parse(messages[0])).toMatchObject({ status: "denied", executionEnabled: false });
  });
  it("contains only SDK read commands and an explicit SSO provider, never a default credential chain or database adapter", () => {
    const source = readFileSync(new URL("./cognito-recovery-preflight.mts", import.meta.url), "utf8");
    expect(source).toContain("fromSSO({ profile: config.profile })");
    expect(source).not.toMatch(/new (AdminSet|AdminUpdate|AdminCreate|AdminDelete|AdminUserGlobalSignOut|ExecuteStatement|RDSData)\w*/);
    expect(source).not.toContain("defaultProvider");
  });
});
