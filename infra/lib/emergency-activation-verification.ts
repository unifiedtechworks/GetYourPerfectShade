import { createHash } from "node:crypto";
import { cliAwsReader } from "./recovery-directory-verification";
import { EMERGENCY_USER_ARN, EMERGENCY_ROLE_ARN, EMERGENCY_USER_NAME, EMERGENCY_ROLE_NAME,
  RECOVERY_ACCOUNT, RECOVERY_REGION, RECOVERY_POOL, validateRecoveryAccessConfig, type RecoveryAccessConfig } from "./recovery-access-config";
import { emergencyTrust, emergencyUserPolicy, emergencyRolePolicy } from "./emergency-recovery-policy";

export interface EmergencyActivationReader {
  read(args: string[], region?: string): Promise<any>;
}
export interface VerifiedEmergency { readonly verified: true }
const verified = new WeakMap<object, string>();
const fingerprint = (config: RecoveryAccessConfig) => createHash("sha256").update(JSON.stringify(config)).digest("hex");
export function hasVerifiedEmergency(token: VerifiedEmergency | undefined, config: RecoveryAccessConfig): boolean {
  return !!token && verified.get(token) === fingerprint(config);
}
export function directoryFingerprint(user: any): string {
  return createHash("sha256").update(JSON.stringify([user.IdentityStoreId, user.UserId, user.UserName, user.DisplayName,
    (user.Emails ?? []).map((email: any) => [email.Type, email.Value, email.Primary]).sort()])).digest("hex");
}
function canonical(value: any): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function document(value: any): any { return typeof value === "string" ? JSON.parse(decodeURIComponent(value)) : value; }
function normalizedPolicy(value: any): any {
  const policy = document(value);
  const array = (item: any) => Array.isArray(item) ? item : [item];
  return { ...policy, Statement: array(policy.Statement).map((item: any) => {
    const { Sid, ...statement } = item;
    void Sid; // A statement label has no authorization effect.
    for (const key of ["Action", "Resource"]) if (statement[key] !== undefined) statement[key] = array(statement[key]);
    if (statement.Principal?.AWS !== undefined) statement.Principal = { ...statement.Principal, AWS: array(statement.Principal.AWS) };
    return statement;
  }) };
}
function same(value: any, expected: any) { if (canonical(normalizedPolicy(value)) !== canonical(normalizedPolicy(expected))) throw Error("policy"); }
function check(value: unknown) { if (!value) throw Error("evidence"); }

/** Reads actual AWS state/events. Never assumes a role, generates credentials, or tests mutations itself. */
export async function verifyEmergencyActivation(config: RecoveryAccessConfig, reader: EmergencyActivationReader, now = Date.now()): Promise<VerifiedEmergency> {
  try {
    validateRecoveryAccessConfig(config);
    const assignment = config.assignments;
    check(assignment?.mode === "protected-emergency");
    const proof = assignment!.emergency!;
    const read = (args: string[], region?: string) => reader.read(args, region);
    const caller = await read(["sts", "get-caller-identity"]);
    check(caller.Account === RECOVERY_ACCOUNT);
    const instances = (await read(["sso-admin", "list-instances"])).Instances;
    check(Array.isArray(instances) && instances.some((instance: any) => instance.InstanceArn === config.instanceArn &&
      instance.IdentityStoreId === config.identityStoreId && instance.OwnerAccountId === RECOVERY_ACCOUNT && instance.Status === "ACTIVE"));
    const primary = await read(["identitystore", "describe-user", "--identity-store-id", config.identityStoreId, "--user-id", assignment!.primaryUserId]);
    check(primary.UserId === assignment!.primaryUserId && primary.IdentityStoreId === config.identityStoreId && directoryFingerprint(primary) === proof.primaryDirectoryFingerprint);
    const user = (await read(["iam", "get-user", "--user-name", EMERGENCY_USER_NAME])).User;
    const role = (await read(["iam", "get-role", "--role-name", EMERGENCY_ROLE_NAME])).Role;
    check(user.Arn === EMERGENCY_USER_ARN && user.UserId === proof.userId && role.Arn === EMERGENCY_ROLE_ARN && role.RoleId === proof.roleId && role.MaxSessionDuration === 3600);
    same(role.AssumeRolePolicyDocument, emergencyTrust());
    const login = (await read(["iam", "get-login-profile", "--user-name", EMERGENCY_USER_NAME])).LoginProfile;
    check(login?.UserName === EMERGENCY_USER_NAME && login.PasswordResetRequired === false);
    check((await read(["iam", "list-access-keys", "--user-name", EMERGENCY_USER_NAME])).AccessKeyMetadata?.length === 0);
    check((await read(["iam", "list-groups-for-user", "--user-name", EMERGENCY_USER_NAME])).Groups?.length === 0);
    for (const entity of ["user", "role"]) {
      const name = entity === "user" ? EMERGENCY_USER_NAME : EMERGENCY_ROLE_NAME;
      check((await read(["iam", `list-attached-${entity}-policies`, `--${entity}-name`, name])).AttachedPolicies?.length === 0);
      const names: string[] = (await read(["iam", `list-${entity}-policies`, `--${entity}-name`, name])).PolicyNames;
      const expected = entity === "user" ? "AssumeEmergencyRecovery" : "RecoveryOperations";
      check(names.includes(expected) && names.every(key => key === expected || entity === "role" && key === "AWSRevokeOlderSessions"));
      const policy = await read(["iam", `get-${entity}-policy`, `--${entity}-name`, name, "--policy-name", expected]);
      // The CLI bootstrap grant is an explicit, separately reviewed exception. Assume-only cannot execute all six operations.
      const expectedPolicy = entity === "user" ? emergencyUserPolicy(undefined, true) : emergencyRolePolicy();
      same(policy.PolicyDocument, expectedPolicy);
      const boundaryArn = (entity === "user" ? user : role).PermissionsBoundary?.PermissionsBoundaryArn;
      check(typeof boundaryArn === "string" && boundaryArn.startsWith(`arn:aws:iam::${RECOVERY_ACCOUNT}:policy/`));
      const managed = (await read(["iam", "get-policy", "--policy-arn", boundaryArn])).Policy;
      const version = (await read(["iam", "get-policy-version", "--policy-arn", boundaryArn, "--version-id", managed.DefaultVersionId])).PolicyVersion;
      same(version.Document, expectedPolicy);
    }
    const devices = (await read(["iam", "list-mfa-devices", "--user-name", EMERGENCY_USER_NAME])).MFADevices;
    check(Array.isArray(devices) && devices.length === proof.deviceSerialNumbers.length &&
      new Set(devices.map((device: any) => device.SerialNumber)).size === devices.length &&
      devices.every((device: any) => proof.deviceSerialNumbers.includes(device.SerialNumber)));
    if (proof.mfaMode === "hardware-fido") {
      for (const serial of proof.deviceSerialNumbers) {
        const device = await read(["iam", "get-mfa-device", "--user-name", EMERGENCY_USER_NAME, "--serial-number", serial]);
        check(device.UserName === EMERGENCY_USER_NAME && device.SerialNumber === serial && !!device.Certifications?.FIDO);
      }
    } else {
      // User-scoped assigned metadata only; never request virtual enrollment seed/QR responses.
      check(devices.every((device: any) => device.UserName === EMERGENCY_USER_NAME &&
        Number.isFinite(Date.parse(device.EnableDate)) && Date.parse(device.EnableDate) <= now));
    }
    // Event history is region-local. IAM/console/global STS evidence may be in us-east-1.
    async function event(id: string) {
      const candidates: any[] = [];
      for (const region of [RECOVERY_REGION, "us-east-1"]) {
        const result = await read(["cloudtrail", "lookup-events", "--lookup-attributes", `AttributeKey=EventId,AttributeValue=${id}`], region);
        for (const item of result.Events ?? []) if (item.EventId === id) candidates.push(JSON.parse(item.CloudTrailEvent));
      }
      check(candidates.length >= 1 && candidates.every(item => canonical(item) === canonical(candidates[0])));
      const value = candidates[0];
      const time = Date.parse(value.eventTime);
      check(value.eventID === id && value.recipientAccountId === RECOVERY_ACCOUNT && Number.isFinite(time) && time <= now && now - time <= 30 * 86_400_000);
      return value;
    }
    const mfa = await event(proof.primaryMfaEventId);
    const factors = String(mfa.additionalEventData?.CredentialType ?? "").split(",").map(value => value.trim());
    const identity = mfa.userIdentity?.onBehalfOf ?? mfa.userIdentity;
    check(mfa.eventName === "UserAuthentication" && ["signin.amazonaws.com", "signin.amazon.com"].includes(mfa.eventSource) && !mfa.errorCode &&
      identity?.userId === assignment!.primaryUserId && String(identity?.identityStoreArn ?? "").endsWith(`:identitystore/${config.identityStoreId}`) &&
      factors.includes("PASSWORD") && (factors.includes("TOTP") || factors.includes("WEBAUTHN")));
    const logins = await Promise.all(proof.consoleLoginEventIds.map(event));
    for (const value of logins) check(value.eventName === "ConsoleLogin" && value.eventSource === "signin.amazonaws.com" && value.userIdentity?.arn === proof.userArn &&
      value.userIdentity?.principalId === proof.userId && value.responseElements?.ConsoleLogin === "Success" && value.additionalEventData?.MFAUsed === "Yes" && !value.errorCode);
    if (proof.mfaMode === "virtual-totp") {
      check(logins[1].eventID === proof.virtualTotpRecovery?.recoveryConsoleLoginEventId &&
        Date.parse(logins[1].eventTime) > Date.parse(logins[0].eventTime) &&
        devices.every((device: any) => Date.parse(device.EnableDate) <= Date.parse(logins[0].eventTime)));
      // AWS proves sign-in/use, not restoration or physical/password separation. Private reviews
      // must attest those facts for this separately identified real recovery login.
    }
    const assumption = await event(proof.assumeRoleEventId);
    const assumedArn = assumption.responseElements?.assumedRoleUser?.arn;
    const newestLogin = Math.max(...logins.map(value => Date.parse(value.eventTime)));
    check(assumption.eventName === "AssumeRole" && assumption.eventSource === "sts.amazonaws.com" && !assumption.errorCode &&
      assumption.userIdentity?.arn === proof.userArn && assumption.userIdentity?.principalId === proof.userId && assumption.requestParameters?.roleArn === proof.roleArn &&
      assumption.userIdentity?.sessionContext?.attributes?.mfaAuthenticated === "true" && Date.parse(assumption.eventTime) >= newestLogin &&
      Date.parse(assumption.eventTime) - newestLogin <= 900_000 &&
      typeof assumedArn === "string" && assumedArn.startsWith(`arn:aws:sts::${RECOVERY_ACCOUNT}:assumed-role/${EMERGENCY_ROLE_NAME}/`));
    const success = await event(proof.successfulReadEventId), revocation = await event(proof.revocationEventId), denied = await event(proof.revokedReadEventId);
    const noMfa = await event(proof.noMfaDeniedEventId), staleMfa = await event(proof.staleMfaDeniedEventId);
    const deniedAssumption = (value: any) => value.eventName === "AssumeRole" && value.eventSource === "sts.amazonaws.com" &&
      /^AccessDenied/.test(value.errorCode ?? "") && value.userIdentity?.arn === proof.userArn && value.userIdentity?.principalId === proof.userId &&
      value.requestParameters?.roleArn === proof.roleArn && !value.responseElements?.assumedRoleUser;
    check(deniedAssumption(noMfa) && noMfa.userIdentity?.sessionContext?.attributes?.mfaAuthenticated === "false");
    check(deniedAssumption(staleMfa) && staleMfa.userIdentity?.sessionContext?.attributes?.mfaAuthenticated === "true" &&
      Date.parse(staleMfa.eventTime) - Date.parse(staleMfa.userIdentity.sessionContext.attributes.creationDate) > 900_000);
    const isPoolRead = (value: any) => value.eventSource === "cognito-idp.amazonaws.com" && value.awsRegion === RECOVERY_REGION &&
      ["AdminGetUser", "ListUsers"].includes(value.eventName) && value.requestParameters?.userPoolId === RECOVERY_POOL &&
      value.userIdentity?.arn === assumedArn && value.userIdentity?.sessionContext?.sessionIssuer?.arn === proof.roleArn &&
      value.userIdentity?.sessionContext?.sessionIssuer?.principalId === proof.roleId;
    check(isPoolRead(success) && !success.errorCode && isPoolRead(denied) && /^AccessDenied/.test(denied.errorCode ?? "") &&
      !!success.userIdentity?.accessKeyId && success.userIdentity.accessKeyId === denied.userIdentity?.accessKeyId &&
      Date.parse(success.eventTime) >= Date.parse(assumption.eventTime) && Date.parse(revocation.eventTime) > Date.parse(success.eventTime) && Date.parse(denied.eventTime) > Date.parse(revocation.eventTime));
    check(revocation.eventSource === "iam.amazonaws.com" && revocation.eventName === "PutRolePolicy" && !revocation.errorCode &&
      revocation.requestParameters?.roleName === EMERGENCY_ROLE_NAME && revocation.requestParameters?.policyName === "AWSRevokeOlderSessions");
    const revokePolicy = normalizedPolicy(revocation.requestParameters.policyDocument);
    const cutoff = revokePolicy.Statement?.[0]?.Condition?.DateLessThan?.["aws:TokenIssueTime"];
    check(typeof cutoff === "string" && Number.isFinite(Date.parse(cutoff)) && Date.parse(cutoff) <= Date.parse(revocation.eventTime) + 60_000 &&
      Date.parse(success.userIdentity.sessionContext.attributes.creationDate) < Date.parse(cutoff));
    same(revokePolicy, { Version: "2012-10-17", Statement: [{ Effect: "Deny", Action: "*", Resource: "*", Condition: { DateLessThan: { "aws:TokenIssueTime": cutoff } } }] });
    same((await read(["iam", "get-role-policy", "--role-name", EMERGENCY_ROLE_NAME, "--policy-name", "AWSRevokeOlderSessions"])).PolicyDocument, revokePolicy);
    const topicArn = `arn:aws:sns:${RECOVERY_REGION}:${RECOVERY_ACCOUNT}:perfect-shade-production-operational-alarms`;
    const topic = (await read(["sns", "get-topic-attributes", "--topic-arn", topicArn])).Attributes;
    const subscription = (await read(["sns", "get-subscription-attributes", "--subscription-arn", proof.notificationSubscriptionArn])).Attributes;
    check(Number(topic?.SubscriptionsConfirmed) > 0 && subscription?.TopicArn === topicArn && subscription.Owner === RECOVERY_ACCOUNT &&
      subscription.PendingConfirmation === "false" && subscription.Protocol === "email" &&
      typeof subscription.Endpoint === "string" && createHash("sha256").update(subscription.Endpoint.toLowerCase()).digest("hex") === proof.notificationRecipientFingerprint);
    // Recipient receipt/control is a mandatory private manual review; SNS confirmation is not end-to-end proof.
    const token = Object.freeze({ verified: true as const });
    verified.set(token, fingerprint(config));
    return token;
  } catch { throw new Error("Protected emergency activation denied: AWS state, MFA, identity, or live test evidence failed verification; no private details printed."); }
}
export const cliEmergencyActivationReader = (profile: string): EmergencyActivationReader => ({ read: cliAwsReader(profile) });
