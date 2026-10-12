import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { PerfectShadeEmergencyRecoveryStack } from "../lib/perfect-shade-emergency-recovery-stack";
import { EMERGENCY_USER_ARN, EMERGENCY_ROLE_ARN, RECOVERY_POOL_ARN, RECOVERY_ACCOUNT, RECOVERY_REGION } from "../lib/recovery-access-config";
import { emergencyTrust, emergencyUserPolicy, emergencyRolePolicy } from "../lib/emergency-recovery-policy";
import { PRODUCTION_RECOVERY_ACTIONS } from "../lib/constructs/production-recovery-operator";

function template(extra = {}) { return Template.fromStack(new PerfectShadeEmergencyRecoveryStack(new App(), "Emergency", {
  env: { account: RECOVERY_ACCOUNT, region: RECOVERY_REGION }, ...extra,
})); }
const enabled = { enabled: true, accountAuthorizationReference: "owner-access-change-1" };
describe("protected emergency IAM design", () => {
  it("is empty by default, and enabled resources have no password/access-key provisioning", () => {
    expect(Object.keys(template().toJSON().Resources ?? {})).toHaveLength(0);
    const t = template(enabled);
    t.resourceCountIs("AWS::IAM::User", 1); t.resourceCountIs("AWS::IAM::Role", 1);
    t.resourceCountIs("AWS::IAM::ManagedPolicy", 2); t.resourceCountIs("AWS::IAM::AccessKey", 0);
    const user: any = Object.values(t.findResources("AWS::IAM::User"))[0];
    expect(user.Properties.LoginProfile).toBeUndefined();
    expect(user.Properties.ManagedPolicyArns).toBeUndefined();
    expect(user.Properties.Policies[0].PolicyDocument).toEqual(emergencyUserPolicy());
    const role: any = Object.values(t.findResources("AWS::IAM::Role"))[0];
    expect(role.Properties.AssumeRolePolicyDocument.Statement[0].Principal.AWS).toEqual({ "Fn::GetAtt": [Object.keys(t.findResources("AWS::IAM::User"))[0], "Arn"] });
    expect(role.Properties.AssumeRolePolicyDocument.Statement[0].Condition).toEqual(emergencyTrust().Statement[0]!.Condition);
    expect(Object.values(t.findResources("AWS::IAM::ManagedPolicy")).map(value => value.Properties?.PolicyDocument)).toEqual(expect.arrayContaining([emergencyUserPolicy(), emergencyRolePolicy()]));
    t.hasResourceProperties("AWS::IAM::Role", { MaxSessionDuration: 3600, Policies: [{ PolicyName: "RecoveryOperations", PolicyDocument: emergencyRolePolicy() }] });
    expect(JSON.stringify(t.toJSON())).not.toMatch(/AdministratorAccess|PowerUserAccess|CreateAccessKey|PassRole|cloudshell:/);
  }, 30_000);
  it("requires explicit account approval and rejects the wrong account", () => {
    expect(() => template({ enabled: true })).toThrow(/authorization/);
    expect(() => template({ ...enabled, env: { account: "111111111111", region: RECOVERY_REGION } })).toThrow(/account/);
  });
  it("keeps the optional CLI grant separately reviewed, local-only, and absent from the recovery role", () => {
    expect(() => template({ ...enabled, consoleCliLogin: true })).toThrow(/authentication exception/);
    const t = template({ ...enabled, consoleCliLogin: true, cliAuthenticationReviewReference: "cli-review-1" });
    const user: any = Object.values(t.findResources("AWS::IAM::User"))[0];
    expect(user.Properties.Policies[0].PolicyDocument).toEqual(emergencyUserPolicy(undefined, true));
    const role: any = Object.values(t.findResources("AWS::IAM::Role"))[0];
    expect(role.Properties.Policies[0].PolicyDocument.Statement[0]).toEqual({ Effect: "Allow", Action: [...PRODUCTION_RECOVERY_ACTIONS], Resource: RECOVERY_POOL_ARN });
  });
  it("reuses exact existing logs/topic only when explicitly opted in, with five fixed counters", () => {
    const t = template({ ...enabled, prepareAlerts: true, trailLogGroupName: "/aws/cloudtrail/production", operationsTopicArn: `arn:aws:sns:${RECOVERY_REGION}:${RECOVERY_ACCOUNT}:production-ops` });
    t.resourceCountIs("AWS::Logs::MetricFilter", 5); t.resourceCountIs("AWS::CloudWatch::Alarm", 5);
    t.resourceCountIs("AWS::SNS::Topic", 0); t.resourceCountIs("AWS::SNS::Subscription", 0); t.resourceCountIs("AWS::CloudTrail::Trail", 0);
    for (const filter of Object.values(t.findResources("AWS::Logs::MetricFilter"))) expect(filter.Properties?.MetricTransformations[0].Dimensions).toBeUndefined();
    expect(() => template({ ...enabled, prepareAlerts: true, trailLogGroupName: "*", operationsTopicArn: "*" })).toThrow(/existing production/);
  });
  // Local semantic fixtures, not live AWS AssumeRole evidence. The activation gate separately requires real events.
  it.each([
    [EMERGENCY_USER_ARN, true, 0, true], [EMERGENCY_USER_ARN, true, 900, true],
    [EMERGENCY_USER_ARN, false, 0, false], [EMERGENCY_USER_ARN, true, 901, false],
    [`arn:aws:iam::${RECOVERY_ACCOUNT}:user/default`, true, 0, false],
    [`arn:aws:iam::${RECOVERY_ACCOUNT}:user/other`, true, 0, false],
    [`arn:aws:sts::${RECOVERY_ACCOUNT}:assumed-role/AWSReservedSSO_AdministratorAccess_example/operator`, true, 0, false],
    ["arn:aws:iam::111111111111:user/perfect-shade-emergency-recovery", true, 0, false],
  ])("trust allows %s / MFA %s / age %s => %s", (principal, mfa, age, allowed) => {
    const s = emergencyTrust().Statement[0]!;
    const result = principal === s.Principal.AWS && String(mfa) === s.Condition.Bool["aws:MultiFactorAuthPresent"] &&
      typeof age === "number" && age >= 0 && age <= Number(s.Condition.NumericLessThanEquals["aws:MultiFactorAuthAge"]);
    expect(result).toBe(allowed);
    expect(emergencyUserPolicy().Statement[0]!.Resource).toBe(EMERGENCY_ROLE_ARN);
    expect(emergencyRolePolicy().Statement[0]!.Resource).toBe(RECOVERY_POOL_ARN);
    expect(emergencyRolePolicy().Statement[0]!.Action).not.toContain("sts:AssumeRole");
  });
});
