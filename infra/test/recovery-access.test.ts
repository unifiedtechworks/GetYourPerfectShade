import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { PerfectShadeRecoveryAccessStack } from "../lib/perfect-shade-recovery-access-stack";
import { loadRecoveryAccessConfig, RECOVERY_ACCOUNT, RECOVERY_REGION, RECOVERY_POOL_ARN, type RecoveryAccessConfig } from "../lib/recovery-access-config";
import { verifyRecoveryDirectory } from "../lib/recovery-directory-verification";
import { PRODUCTION_RECOVERY_ACTIONS } from "../lib/constructs/production-recovery-operator";

const config: RecoveryAccessConfig = {
  instanceArn: "arn:aws:sso:::instance/ssoins-1111111111111111", identityStoreId: "d-1111111111",
};
const assignments = {
  primaryUserId: "11111111-1111-1111-1111-111111111111",
  backupUserId: "22222222-2222-2222-2222-222222222222",
  identityReviewReference: "identity-review-1", mfaReviewReference: "mfa-review-1", emergencyReviewReference: "emergency-review-1",
};
function template(value = config, account = RECOVERY_ACCOUNT) {
  return Template.fromStack(new PerfectShadeRecoveryAccessStack(new App(), "Access", { config: value, env: { account, region: RECOVERY_REGION } }));
}
function context(extra: Record<string, unknown> = {}) {
  return new App({ context: { confirmRecoveryAccessSynthesis: "true", recoveryTargetAccount: RECOVERY_ACCOUNT,
    recoveryIdentityCenterInstanceArn: config.instanceArn, recoveryIdentityStoreId: config.identityStoreId, ...extra } });
}
describe("isolated Identity Center recovery access", { timeout: 30_000 }, () => {
  it("creates only a six-action pool-scoped one-hour permission set by default", () => {
    const json = template().toJSON();
    expect(Object.values(json.Resources).map((r: any) => r.Type)).toEqual(["AWS::SSO::PermissionSet"]);
    const resource: any = Object.values(json.Resources)[0];
    expect(resource.Properties).toMatchObject({ Name: "PerfectShadeProductionRecovery", SessionDuration: "PT1H",
      InlinePolicy: { Statement: [{ Effect: "Allow", Action: [...PRODUCTION_RECOVERY_ACTIONS], Resource: RECOVERY_POOL_ARN }] } });
    expect(resource.Properties.ManagedPolicies).toBeUndefined();
    expect(resource.Properties.CustomerManagedPolicyReferences).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("AdministratorAccess");
    template().resourceCountIs("AWS::SSO::Assignment", 0);
  }, 30_000);
  it("assigns only two distinct reviewed USER IDs to its own permission set and fixed account", () => {
    const t = template({ ...config, assignments });
    t.resourceCountIs("AWS::SSO::Assignment", 2);
    for (const value of Object.values(t.findResources("AWS::SSO::Assignment"))) {
      expect(value.Properties).toMatchObject({ PrincipalType: "USER", TargetType: "AWS_ACCOUNT", TargetId: RECOVERY_ACCOUNT,
        PermissionSetArn: { "Fn::GetAtt": [expect.any(String), "PermissionSetArn"] } });
    }
  });
  it("rejects the wrong account and missing opt-in", () => {
    expect(() => template(config, "111111111111")).toThrow(/approved account/);
    expect(() => loadRecoveryAccessConfig(new App())).toThrow(/confirmRecoveryAccessSynthesis/);
    expect(() => loadRecoveryAccessConfig(context({ recoveryTargetAccount: "111111111111" }))).toThrow(/approved AWS account/);
  });
  it.each(["*", "arn:aws:sso:::instance/ins-1111111111111111", "not-an-instance"])("rejects unsafe instance %s", instanceArn => {
    expect(() => template({ ...config, instanceArn })).toThrow(/organization Identity Center/);
  });
  it.each(["*", assignments.primaryUserId, "unknown"])("rejects wildcard/duplicate/unknown backup %s", backupUserId => {
    expect(() => template({ ...config, assignments: { ...assignments, backupUserId } })).toThrow(/distinct/);
  });
  it("rejects assignments without reviews or with IDs supplied before activation", () => {
    expect(() => template({ ...config, assignments: { ...assignments, mfaReviewReference: "" } })).toThrow(/review references/);
    expect(() => loadRecoveryAccessConfig(context({ primaryRecoveryUserId: assignments.primaryUserId }))).toThrow(/unset/);
    expect(() => loadRecoveryAccessConfig(context({ activateRecoveryAssignments: "true" }))).toThrow(/distinct/);
  });
  it("requires all review fields even when a caller constructs the stack directly", () => {
    const { identityReviewReference, mfaReviewReference, emergencyReviewReference, ...unreviewed } = assignments;
    void identityReviewReference; void mfaReviewReference; void emergencyReviewReference;
    expect(() => template({ ...config, assignments: unreviewed as typeof assignments })).toThrow(/review references/);
  });
  it("checks actual directory IDs, instance ownership, and store before activation", async () => {
    const value = { ...config, assignments }; const seen: string[] = [];
    await verifyRecoveryDirectory(value, {
      instances: async () => [{ InstanceArn: config.instanceArn, IdentityStoreId: config.identityStoreId, OwnerAccountId: RECOVERY_ACCOUNT }],
      user: async (store, id) => { seen.push(id); return { UserId: id, IdentityStoreId: store }; },
    });
    expect(seen).toEqual([assignments.primaryUserId, assignments.backupUserId]);
    await expect(verifyRecoveryDirectory(value, { instances: async () => [], user: async () => ({}) })).rejects.toThrow(/verification failed/);
    await expect(verifyRecoveryDirectory(value, {
      instances: async () => [{ InstanceArn: config.instanceArn, IdentityStoreId: config.identityStoreId, OwnerAccountId: RECOVERY_ACCOUNT }],
      user: async () => { throw Error("private identity information"); },
    })).rejects.toThrow("Assignment activation denied: directory verification failed; no identity details printed.");
  });
  it("does not perform directory reads with assignments disabled", async () => {
    await verifyRecoveryDirectory(config, { instances: async () => { throw Error("must not call"); }, user: async () => { throw Error("must not call"); } });
  });
});
