import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { loadRecoveryAccessConfig, validateRecoveryAccessConfig, assignmentUsers, RECOVERY_ACCOUNT, RECOVERY_REGION, RECOVERY_POOL_ARN, type RecoveryAccessConfig } from "../lib/recovery-access-config";
import { verifyRootReadiness, hasVerifiedRootReadiness, type RootReadinessReader } from "../lib/root-break-glass-verification";
import { PerfectShadeRecoveryAccessStack } from "../lib/perfect-shade-recovery-access-stack";
import { PRODUCTION_RECOVERY_ACTIONS } from "../lib/constructs/production-recovery-operator";

const id = "11111111-1111-1111-1111-111111111111", eventId = "22222222-2222-2222-2222-222222222222";
const now = Date.parse("2026-10-17T12:00:00Z");
const config: RecoveryAccessConfig = {
  instanceArn: "arn:aws:sso:::instance/ssoins-1111111111111111", identityStoreId: "d-1111111111",
  assignments: { mode: "root-break-glass", primaryUserId: id,
    identityReviewReference: "identity-review-1", mfaReviewReference: "context-aware-review-1", emergencyReviewReference: "root-procedure-1",
    rootBreakGlass: { ownerReadinessConfirmed: true, rootCustodyReviewReference: "root-custody-1", rootRecoveryReviewReference: "root-recovery-1", primaryMfaEventId: eventId } },
};
function reader(change = (_operation: string, value: any) => value): RootReadinessReader {
  return { read: async ([service, operation], region) => {
    let value: any;
    switch (operation) {
      case "get-caller-identity": value = { Account: RECOVERY_ACCOUNT }; break;
      case "list-instances": value = { Instances: [{ InstanceArn: config.instanceArn, IdentityStoreId: config.identityStoreId, OwnerAccountId: RECOVERY_ACCOUNT, Status: "ACTIVE" }] }; break;
      case "describe-user": value = { UserId: id, IdentityStoreId: config.identityStoreId }; break;
      case "get-account-summary": value = { SummaryMap: { AccountMFAEnabled: 1, AccountAccessKeysPresent: 0 } }; break;
      case "lookup-events": value = { Events: region === RECOVERY_REGION ? [{ EventId: eventId, CloudTrailEvent: JSON.stringify({ eventID: eventId, recipientAccountId: RECOVERY_ACCOUNT,
        eventTime: new Date(now - 60_000).toISOString(), eventName: "UserAuthentication", eventSource: "signin.amazonaws.com",
        userIdentity: { type: "IdentityCenterUser", onBehalfOf: { userId: id, identityStoreArn: `arn:aws:identitystore::${RECOVERY_ACCOUNT}:identitystore/${config.identityStoreId}` } },
        serviceEventDetails: { UserAuthentication: "Success" }, additionalEventData: { CredentialType: "PASSWORD,TOTP" } }) }] : [] }; break;
      case "get-trail-status": value = { IsLogging: true }; break;
      case "get-topic-attributes": value = { Attributes: { SubscriptionsConfirmed: "1" } }; break;
      default: throw Error(`Unexpected read ${service}/${operation}`);
    }
    return change(operation!, structuredClone(value));
  } };
}
const stack = (value: RecoveryAccessConfig, token?: Awaited<ReturnType<typeof verifyRootReadiness>>) => new PerfectShadeRecoveryAccessStack(new App(), "Access", {
  config: value, rootReadinessVerification: token, env: { account: RECOVERY_ACCOUNT, region: RECOVERY_REGION },
});

describe("explicit sole-primary / protected root administrative fallback", () => {
  it("creates only the same one-hour six-operation permission set and one reviewed USER assignment", async () => {
    validateRecoveryAccessConfig(config);
    expect(assignmentUsers(config)).toEqual({ Primary: id });
    const token = await verifyRootReadiness(config, reader(), now);
    const t = Template.fromStack(stack(config, token));
    t.resourceCountIs("AWS::SSO::PermissionSet", 1); t.resourceCountIs("AWS::SSO::Assignment", 1);
    expect(Object.values(t.toJSON().Resources).map((r: any) => r.Type).sort()).toEqual(["AWS::SSO::Assignment", "AWS::SSO::PermissionSet"]);
    t.hasResourceProperties("AWS::SSO::PermissionSet", { Name: "PerfectShadeProductionRecovery", SessionDuration: "PT1H", InlinePolicy: {
      Statement: [{ Effect: "Allow", Action: [...PRODUCTION_RECOVERY_ACTIONS], Resource: RECOVERY_POOL_ARN }] } });
    t.hasResourceProperties("AWS::SSO::Assignment", { PrincipalType: "USER", PrincipalId: id, TargetId: RECOVERY_ACCOUNT });
    expect(hasVerifiedRootReadiness(token, config)).toBe(true);
    expect(hasVerifiedRootReadiness(token, { ...config, identityStoreId: "d-2222222222" })).toBe(false);
  }, 30_000);
  it("rejects fabricated verification tokens and never silently activates assignments", () => {
    expect(() => stack(config)).toThrow(/actual primary MFA/);
    expect(() => stack(config, { verified: true })).toThrow(/actual primary MFA/);
    const inactive = Template.fromStack(stack({ instanceArn: config.instanceArn, identityStoreId: config.identityStoreId }));
    inactive.resourceCountIs("AWS::SSO::Assignment", 0);
  });
  it("rejects fabricated backups, mixed emergency evidence, absent root consent, and secret-shaped fields", () => {
    for (const patch of [
      { backupUserId: "33333333-3333-3333-3333-333333333333" }, { emergency: {} }, { rootBreakGlass: undefined },
      { rootBreakGlass: { ...config.assignments!.rootBreakGlass!, ownerReadinessConfirmed: false } },
      { rootBreakGlass: { ...config.assignments!.rootBreakGlass!, rootCustodyReviewReference: "" } },
      { rootBreakGlass: { ...config.assignments!.rootBreakGlass!, primaryMfaEventId: "not-an-event" } },
      { rootBreakGlass: { ...config.assignments!.rootBreakGlass!, password: "never-store-secrets" } },
    ]) expect(() => validateRecoveryAccessConfig({ ...config, assignments: { ...config.assignments!, ...patch } as any })).toThrow();
    expect(() => validateRecoveryAccessConfig({ ...config, assignments: { ...config.assignments!, mode: "two-human" } })).toThrow();
  });
  it.each([
    ["get-caller-identity", { Account: "111122223333" }], ["list-instances", { Instances: [] }],
    ["describe-user", { UserId: "other", IdentityStoreId: config.identityStoreId }],
    ["get-account-summary", { SummaryMap: { AccountMFAEnabled: 0, AccountAccessKeysPresent: 0 } }],
    ["get-account-summary", { SummaryMap: { AccountMFAEnabled: 1, AccountAccessKeysPresent: 1 } }],
    ["lookup-events", { Events: [] }], ["get-trail-status", { IsLogging: false }],
    ["get-topic-attributes", { Attributes: { SubscriptionsConfirmed: "0" } }],
  ])("fails closed for unsafe %s", async (operation, bad) => {
    await expect(verifyRootReadiness(config, reader((op, value) => op === operation ? bad : value), now)).rejects.toThrow(/no private details/);
  });
  it.each(["wrong-user", "wrong-store", "wrong-store-account", "wrong-account", "wrong-type", "failed", "no-mfa", "external-idp", "expired", "future"])("requires actual bound primary MFA evidence: %s", async condition => {
    await expect(verifyRootReadiness(config, reader((op, value) => {
      if (op !== "lookup-events" || !value.Events.length) return value;
      const event = JSON.parse(value.Events[0].CloudTrailEvent);
      if (condition === "wrong-user") event.userIdentity.onBehalfOf.userId = "other";
      if (condition === "wrong-store") event.userIdentity.onBehalfOf.identityStoreArn = "wrong-store";
      if (condition === "wrong-store-account") event.userIdentity.onBehalfOf.identityStoreArn = `arn:aws:identitystore::111122223333:identitystore/${config.identityStoreId}`;
      if (condition === "wrong-account") event.recipientAccountId = "111122223333";
      if (condition === "wrong-type") event.userIdentity.type = "IAMUser";
      if (condition === "failed") event.serviceEventDetails.UserAuthentication = "Failure";
      if (condition === "no-mfa") event.additionalEventData.CredentialType = "PASSWORD";
      if (condition === "external-idp") event.additionalEventData.CredentialType = "EXTERNAL_IDP";
      if (condition === "expired") event.eventTime = new Date(now - 31 * 86_400_000).toISOString();
      if (condition === "future") event.eventTime = new Date(now + 60_000).toISOString();
      value.Events[0].CloudTrailEvent = JSON.stringify(event); return value;
    }), now)).rejects.toThrow(/activation denied/);
  });
  it("requires explicit activation, root review inputs, and no legacy emergency evidence file", () => {
    const context = { confirmRecoveryAccessSynthesis: "true", recoveryTargetAccount: RECOVERY_ACCOUNT, recoveryIdentityCenterInstanceArn: config.instanceArn,
      recoveryIdentityStoreId: config.identityStoreId, recoveryOperatorMode: "root-break-glass", activateRecoveryAssignments: "true", primaryRecoveryUserId: id,
      recoveryIdentityReviewReference: "identity-1", recoveryMfaReviewReference: "mfa-1", recoveryEmergencyReviewReference: "root-1",
      confirmRootBreakGlassReadiness: "true", rootCustodyReviewReference: "custody-1", rootRecoveryReviewReference: "recovery-1", recoveryPrimaryMfaEventId: eventId };
    expect(loadRecoveryAccessConfig(new App({ context })).assignments?.mode).toBe("root-break-glass");
    for (const patch of [{ confirmRootBreakGlassReadiness: "false" }, { activateRecoveryAssignments: "false" }, { recoveryEmergencyEvidencePath: "do-not-read" }]) {
      expect(() => loadRecoveryAccessConfig(new App({ context: { ...context, ...patch } }))).toThrow();
    }
  });
  it("redacts private reader failures", async () => {
    await expect(verifyRootReadiness(config, reader(() => { throw Error("private root custody details"); }), now)).rejects.toThrow(
      "Root break-glass activation denied: identity, primary MFA, root indicators, audit, or owner review failed; no private details printed.");
  });
});
