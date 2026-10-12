import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { verifyEmergencyActivation, directoryFingerprint, hasVerifiedEmergency, type EmergencyActivationReader } from "../lib/emergency-activation-verification";
import { PerfectShadeRecoveryAccessStack } from "../lib/perfect-shade-recovery-access-stack";
import { EMERGENCY_USER_ARN, EMERGENCY_ROLE_ARN, EMERGENCY_USER_NAME, EMERGENCY_ROLE_NAME, RECOVERY_ACCOUNT, RECOVERY_REGION, RECOVERY_POOL,
  validateRecoveryAccessConfig, type RecoveryAccessConfig } from "../lib/recovery-access-config";
import { emergencyTrust, emergencyUserPolicy, emergencyRolePolicy } from "../lib/emergency-recovery-policy";
import { createHash } from "node:crypto";
import { cliAwsReader } from "../lib/recovery-directory-verification";

const now = Date.parse("2026-10-12T18:00:00Z");
const time = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const id = (n: number) => `11111111-1111-1111-1111-${String(n).padStart(12, "0")}`;
const primary = { UserId: id(1), IdentityStoreId: "d-1111111111", UserName: "fixture-owner", DisplayName: "Fixture", Emails: [{ Value: "fixture@example.invalid" }] };
const userId = `AIDA${"1".repeat(17)}`, roleId = `AROA${"2".repeat(17)}`;
const sessionArn = `arn:aws:sts::${RECOVERY_ACCOUNT}:assumed-role/${EMERGENCY_ROLE_NAME}/fixture-session`;
const roleIdentity = { arn: sessionArn, accessKeyId: "synthetic-session-not-a-credential", sessionContext: { attributes: { creationDate: time(9) }, sessionIssuer: { arn: EMERGENCY_ROLE_ARN, principalId: roleId } } };
const revokePolicy = { Version: "2012-10-17", Statement: [{ Effect: "Deny", Action: "*", Resource: "*", Condition: { DateLessThan: { "aws:TokenIssueTime": time(7) } } }] };
const evidence = { userArn: EMERGENCY_USER_ARN, roleArn: EMERGENCY_ROLE_ARN, userId, roleId, primaryDirectoryFingerprint: directoryFingerprint(primary),
  deviceSerialNumbers: [`arn:aws:iam::${RECOVERY_ACCOUNT}:u2f/user/key-a`, `arn:aws:iam::${RECOVERY_ACCOUNT}:u2f/user/key-b`],
  custodyReviewReference: "custody-1", cliAuthenticationReviewReference: "cli-1", primaryMfaEventId: id(10), consoleLoginEventIds: [id(11), id(12)],
  notificationSubscriptionArn: `arn:aws:sns:${RECOVERY_REGION}:${RECOVERY_ACCOUNT}:perfect-shade-production-operational-alarms:${id(20)}`,
  notificationRecipientFingerprint: createHash("sha256").update("fixture@example.invalid").digest("hex"), notificationReceiptReviewReference: "receipt-1",
  assumeRoleEventId: id(13), successfulReadEventId: id(14), revocationEventId: id(15), revokedReadEventId: id(16), noMfaDeniedEventId: id(17), staleMfaDeniedEventId: id(18) };
const config: RecoveryAccessConfig = { instanceArn: "arn:aws:sso:::instance/ssoins-1111111111111111", identityStoreId: primary.IdentityStoreId,
  assignments: { mode: "protected-emergency", primaryUserId: primary.UserId, emergency: evidence,
    identityReviewReference: "identity-1", mfaReviewReference: "mfa-1", emergencyReviewReference: "emergency-1" } };
function events(): Record<string, any> {
  const wrap = (n: number, minutes: number, value: any) => ({ eventID: id(n), recipientAccountId: RECOVERY_ACCOUNT, eventTime: time(minutes), ...value });
  const login = (n: number, minutes: number) => wrap(n, minutes, { eventSource: "signin.amazonaws.com", eventName: "ConsoleLogin", userIdentity: { arn: EMERGENCY_USER_ARN, principalId: userId }, additionalEventData: { MFAUsed: "Yes" }, responseElements: { ConsoleLogin: "Success" } });
  const read = (n: number, minutes: number, errorCode?: string) => wrap(n, minutes, { eventSource: "cognito-idp.amazonaws.com", eventName: "ListUsers", awsRegion: RECOVERY_REGION,
    requestParameters: { userPoolId: RECOVERY_POOL }, userIdentity: structuredClone(roleIdentity), ...(errorCode ? { errorCode } : {}) });
  return {
    [id(10)]: wrap(10, 14, { eventName: "UserAuthentication", eventSource: "signin.amazonaws.com", additionalEventData: { CredentialType: "PASSWORD,WEBAUTHN" }, userIdentity: { onBehalfOf: { userId: primary.UserId, identityStoreArn: `arn:aws:identitystore::${RECOVERY_ACCOUNT}:identitystore/${primary.IdentityStoreId}` } } }),
    [id(11)]: login(11, 25), [id(12)]: login(12, 10),
    [id(13)]: wrap(13, 9, { eventSource: "sts.amazonaws.com", eventName: "AssumeRole", userIdentity: { arn: EMERGENCY_USER_ARN, principalId: userId, sessionContext: { attributes: { mfaAuthenticated: "true" } } },
      requestParameters: { roleArn: EMERGENCY_ROLE_ARN }, responseElements: { assumedRoleUser: { arn: sessionArn } } }),
    [id(14)]: read(14, 8), [id(15)]: wrap(15, 6, { eventSource: "iam.amazonaws.com", eventName: "PutRolePolicy", requestParameters: { roleName: EMERGENCY_ROLE_NAME, policyName: "AWSRevokeOlderSessions", policyDocument: revokePolicy } }),
    [id(16)]: read(16, 5, "AccessDeniedException"),
    [id(17)]: wrap(17, 26, { eventSource: "sts.amazonaws.com", eventName: "AssumeRole", errorCode: "AccessDenied", requestParameters: { roleArn: EMERGENCY_ROLE_ARN },
      userIdentity: { arn: EMERGENCY_USER_ARN, principalId: userId, sessionContext: { attributes: { mfaAuthenticated: "false", creationDate: time(27) } } } }),
    [id(18)]: wrap(18, 1, { eventSource: "sts.amazonaws.com", eventName: "AssumeRole", errorCode: "AccessDenied", requestParameters: { roleArn: EMERGENCY_ROLE_ARN },
      userIdentity: { arn: EMERGENCY_USER_ARN, principalId: userId, sessionContext: { attributes: { mfaAuthenticated: "true", creationDate: time(25) } } } }),
  };
}
function reader(change: (args: string[], value: any) => any = (_, value) => value, eventValues = events()): EmergencyActivationReader {
  return { read: async (args, region) => {
    const [service, operation] = args;
    let value: any;
    if (service === "cloudtrail") {
      const key = args.at(-1)!.split("AttributeValue=")[1]!;
      value = { Events: region === RECOVERY_REGION && eventValues[key] ? [{ EventId: key, CloudTrailEvent: JSON.stringify(eventValues[key]) }] : [] };
    } else if (service === "identitystore") value = primary;
    else if (service === "sns") value = operation === "get-topic-attributes" ? { Attributes: { SubscriptionsConfirmed: "1" } } :
      { Attributes: { TopicArn: `arn:aws:sns:${RECOVERY_REGION}:${RECOVERY_ACCOUNT}:perfect-shade-production-operational-alarms`, Owner: RECOVERY_ACCOUNT,
        PendingConfirmation: "false", Protocol: "email", Endpoint: "fixture@example.invalid" } };
    else if (service === "sso-admin") value = { Instances: [{ InstanceArn: config.instanceArn, IdentityStoreId: config.identityStoreId, OwnerAccountId: RECOVERY_ACCOUNT, Status: "ACTIVE" }] };
    else if (service === "sts") value = { Account: RECOVERY_ACCOUNT };
    else switch (operation) {
      case "get-user": value = { User: { Arn: EMERGENCY_USER_ARN, UserId: userId, PermissionsBoundary: { PermissionsBoundaryArn: `arn:aws:iam::${RECOVERY_ACCOUNT}:policy/user-boundary` } } }; break;
      case "get-role": value = { Role: { Arn: EMERGENCY_ROLE_ARN, RoleId: roleId, MaxSessionDuration: 3600, AssumeRolePolicyDocument: emergencyTrust(), PermissionsBoundary: { PermissionsBoundaryArn: `arn:aws:iam::${RECOVERY_ACCOUNT}:policy/role-boundary` } } }; break;
      case "get-login-profile": value = { LoginProfile: { UserName: EMERGENCY_USER_NAME, PasswordResetRequired: false } }; break;
      case "list-access-keys": value = { AccessKeyMetadata: [] }; break;
      case "list-groups-for-user": value = { Groups: [] }; break;
      case "list-attached-user-policies": case "list-attached-role-policies": value = { AttachedPolicies: [] }; break;
      case "list-user-policies": value = { PolicyNames: ["AssumeEmergencyRecovery"] }; break;
      case "list-role-policies": value = { PolicyNames: ["RecoveryOperations", "AWSRevokeOlderSessions"] }; break;
      case "get-user-policy": value = { PolicyDocument: emergencyUserPolicy(undefined, true) }; break;
      case "get-role-policy": value = { PolicyDocument: args.at(-1) === "AWSRevokeOlderSessions" ? revokePolicy : emergencyRolePolicy() }; break;
      case "get-policy": value = { Policy: { DefaultVersionId: "v1" } }; break;
      case "get-policy-version": value = { PolicyVersion: { Document: args.includes(`arn:aws:iam::${RECOVERY_ACCOUNT}:policy/user-boundary`) ? emergencyUserPolicy(undefined, true) : emergencyRolePolicy() } }; break;
      case "list-mfa-devices": value = { MFADevices: evidence.deviceSerialNumbers.map(SerialNumber => ({ SerialNumber })) }; break;
      case "get-mfa-device": value = { UserName: EMERGENCY_USER_NAME, SerialNumber: args.at(-1), Certifications: { FIDO: "L1" } }; break;
      default: throw Error("Unexpected read");
    }
    return change(args, structuredClone(value));
  } };
}
describe("primary-only activation requires actual readback and tests", () => {
  it("blocks mutating CLI operations before launching a process", async () => {
    const read = cliAwsReader("review-reader");
    for (const args of [["sts", "assume-role"], ["iam", "create-access-key"], ["iam", "put-role-policy"], ["sns", "publish"], ["cognito-idp", "admin-set-user-password"]]) {
      await expect(read(args)).rejects.toThrow(/read-only inspection/);
    }
  });
  it("creates exactly one assignment only with a verifier-issued token tied to all inputs", async () => {
    validateRecoveryAccessConfig(config);
    const token = await verifyEmergencyActivation(config, reader(), now);
    expect(hasVerifiedEmergency(token, config)).toBe(true);
    const t = Template.fromStack(new PerfectShadeRecoveryAccessStack(new App(), "Access", { config, emergencyVerification: token, env: { account: RECOVERY_ACCOUNT, region: RECOVERY_REGION } }));
    t.resourceCountIs("AWS::SSO::Assignment", 1);
    t.resourceCountIs("AWS::IAM::User", 0); t.resourceCountIs("AWS::IAM::Role", 0);
    expect(hasVerifiedEmergency(token, { ...config, identityStoreId: "d-2222222222" })).toBe(false);
  }, 30_000);
  it("rejects a fabricated verification object, backup, unknown mode, unknown identity and missing evidence", () => {
    expect(() => new PerfectShadeRecoveryAccessStack(new App(), "Access", { config, emergencyVerification: { verified: true }, env: { account: RECOVERY_ACCOUNT, region: RECOVERY_REGION } })).toThrow(/Actual emergency/);
    expect(() => validateRecoveryAccessConfig({ ...config, assignments: { ...config.assignments!, backupUserId: id(2) } })).toThrow(/fabricated backup/);
    expect(() => validateRecoveryAccessConfig({ ...config, assignments: { ...config.assignments!, emergency: undefined } })).toThrow(/real CloudTrail/);
    expect(() => validateRecoveryAccessConfig({ ...config, assignments: { ...config.assignments!, emergency: { ...evidence, userArn: "*" } } })).toThrow();
  });
  it.each(["get-user", "get-role", "get-login-profile", "list-access-keys", "list-groups-for-user", "list-attached-user-policies", "list-attached-role-policies", "get-user-policy", "get-policy-version", "list-mfa-devices", "get-mfa-device", "sts", "identitystore", "get-topic-attributes", "get-subscription-attributes"])("denies unsafe/absent live state for %s without exposing raw details", async operation => {
    await expect(verifyEmergencyActivation(config, reader((args, value) => { if (args[1] === operation || args[0] === operation) throw Error("private credentials and custody details"); return value; }), now)).rejects.toThrow(/no private details/);
  });
  it("rejects actual keys, groups, broad grants, incomplete console setup, and MFA/device drift", async () => {
    for (const [operation, corrupt] of [
      ["list-access-keys", { AccessKeyMetadata: [{ Status: "Inactive" }] }],
      ["list-groups-for-user", { Groups: [{}] }],
      ["list-attached-role-policies", { AttachedPolicies: [{ PolicyArn: "AdministratorAccess" }] }],
      ["get-user-policy", { PolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }] } }],
      ["get-login-profile", { LoginProfile: { UserName: EMERGENCY_USER_NAME, PasswordResetRequired: true } }],
      ["list-mfa-devices", { MFADevices: [{ SerialNumber: evidence.deviceSerialNumbers[0] }] }],
      ["get-mfa-device", { UserName: EMERGENCY_USER_NAME, SerialNumber: evidence.deviceSerialNumbers[0], Certifications: {} }],
      ["get-topic-attributes", { Attributes: { SubscriptionsConfirmed: "0" } }],
    ] as const) {
      await expect(verifyEmergencyActivation(config, reader((args, value) => args[1] === operation ? corrupt : value), now)).rejects.toThrow(/failed verification/);
    }
  });
  it.each([10, 11, 12, 13, 14, 15, 16, 17, 18])("requires real, recent, correctly bound event %s", async n => {
    const values = events(); delete values[id(n)];
    await expect(verifyEmergencyActivation(config, reader(undefined, values), now)).rejects.toThrow(/failed verification/);
  });
  it("accepts documented IAM policy JSON forms and the console's short future revocation cutoff without expanding scope", async () => {
    const values = events();
    const cutoff = new Date(Date.parse(values[id(15)].eventTime) + 30_000).toISOString();
    const consolePolicy = { Version: "2012-10-17", Statement: { Sid: "RevokeOlderSessions", Effect: "Deny", Action: ["*"], Resource: ["*"], Condition: { DateLessThan: { "aws:TokenIssueTime": cutoff } } } };
    values[id(15)].requestParameters.policyDocument = consolePolicy;
    const token = await verifyEmergencyActivation(config, reader((args, value) => args[1] === "get-role-policy" && args.at(-1) === "AWSRevokeOlderSessions"
      ? { PolicyDocument: consolePolicy } : value, values), now);
    expect(hasVerifiedEmergency(token, config)).toBe(true);
    consolePolicy.Statement.Condition.DateLessThan["aws:TokenIssueTime"] = new Date(Date.parse(values[id(15)].eventTime) + 61_000).toISOString();
    await expect(verifyEmergencyActivation(config, reader((args, value) => args[1] === "get-role-policy" && args.at(-1) === "AWSRevokeOlderSessions"
      ? { PolicyDocument: consolePolicy } : value, values), now)).rejects.toThrow(/failed verification/);
  });
  it("denies missing MFA, wrong pool, unrevoked tokens, recreated roles, and stale evidence", async () => {
    for (const mutate of [
      (v: Record<string, any>) => { v[id(13)].userIdentity.sessionContext.attributes.mfaAuthenticated = "false"; },
      (v: Record<string, any>) => { v[id(14)].requestParameters.userPoolId = "us-west-2_other"; },
      (v: Record<string, any>) => { delete v[id(16)].errorCode; },
      (v: Record<string, any>) => { v[id(16)].userIdentity.sessionContext.sessionIssuer.principalId = "recreated-role"; },
      (v: Record<string, any>) => { v[id(10)].eventTime = new Date(now - 31 * 86_400_000).toISOString(); },
      (v: Record<string, any>) => { v[id(18)].userIdentity.sessionContext.attributes.creationDate = time(2); },
    ]) {
      const values = events(); mutate(values);
      await expect(verifyEmergencyActivation(config, reader(undefined, values), now)).rejects.toThrow(/failed verification/);
    }
  });
});
