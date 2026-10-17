import { createHash } from "node:crypto";
import { cliAwsReader } from "./recovery-directory-verification";
import { RECOVERY_ACCOUNT, RECOVERY_REGION, validateRecoveryAccessConfig, type RecoveryAccessConfig } from "./recovery-access-config";

export interface RootReadinessReader { read(args: string[], region?: string): Promise<any> }
export interface VerifiedRootReadiness { readonly verified: true }
const verified = new WeakMap<object, string>();
const fingerprint = (config: RecoveryAccessConfig) => createHash("sha256").update(JSON.stringify(config)).digest("hex");
export function hasVerifiedRootReadiness(token: VerifiedRootReadiness | undefined, config: RecoveryAccessConfig): boolean {
  return !!token && verified.get(token) === fingerprint(config);
}
function check(value: unknown) { if (!value) throw Error("readiness"); }

/** Root remains a privately controlled administrative fallback, never this tool's caller/provider.
 * Reads public indicators, actual primary MFA evidence and existing logging/notification health.
 * Custody and recovery-channel control are owner attestations, not claims derived from AWS APIs. */
export async function verifyRootReadiness(config: RecoveryAccessConfig, reader: RootReadinessReader, now = Date.now()): Promise<VerifiedRootReadiness> {
  try {
    validateRecoveryAccessConfig(config);
    const assignment = config.assignments;
    check(assignment?.mode === "root-break-glass");
    const read = reader.read.bind(reader);
    check((await read(["sts", "get-caller-identity"])).Account === RECOVERY_ACCOUNT);
    const instances = (await read(["sso-admin", "list-instances"])).Instances;
    check(instances?.some((value: any) => value.InstanceArn === config.instanceArn && value.IdentityStoreId === config.identityStoreId &&
      value.OwnerAccountId === RECOVERY_ACCOUNT && value.Status === "ACTIVE"));
    const user = await read(["identitystore", "describe-user", "--identity-store-id", config.identityStoreId, "--user-id", assignment!.primaryUserId]);
    check(user.UserId === assignment!.primaryUserId && user.IdentityStoreId === config.identityStoreId);
    const summary = (await read(["iam", "get-account-summary"])).SummaryMap;
    check(summary?.AccountMFAEnabled === 1 && summary.AccountAccessKeysPresent === 0);
    const events: any[] = [];
    const eventId = assignment!.rootBreakGlass!.primaryMfaEventId;
    for (const region of [RECOVERY_REGION, "us-east-1"]) {
      const result = await read(["cloudtrail", "lookup-events", "--lookup-attributes", `AttributeKey=EventId,AttributeValue=${eventId}`], region);
      for (const item of result.Events ?? []) if (item.EventId === eventId) events.push(JSON.parse(item.CloudTrailEvent));
    }
    check(events.length > 0 && events.every(value => JSON.stringify(value) === JSON.stringify(events[0])));
    const event = events[0], identity = event.userIdentity?.onBehalfOf ?? event.userIdentity;
    const factors = String(event.additionalEventData?.CredentialType ?? "").split(",").map(value => value.trim());
    const time = Date.parse(event.eventTime);
    check(event.eventID === eventId && event.recipientAccountId === RECOVERY_ACCOUNT && !event.errorCode &&
      event.userIdentity?.type === "IdentityCenterUser" && event.serviceEventDetails?.UserAuthentication === "Success" &&
      event.eventName === "UserAuthentication" && ["signin.amazonaws.com", "signin.amazon.com"].includes(event.eventSource) &&
      identity?.userId === assignment!.primaryUserId && identity?.identityStoreArn === `arn:aws:identitystore::${RECOVERY_ACCOUNT}:identitystore/${config.identityStoreId}` &&
      factors.includes("PASSWORD") && (factors.includes("TOTP") || factors.includes("WEBAUTHN")) &&
      Number.isFinite(time) && time <= now && now - time <= 30 * 86_400_000);
    const trail = await read(["cloudtrail", "get-trail-status", "--name", "perfect-shade-production-management"]);
    check(trail.IsLogging === true && !trail.LatestDeliveryError && !trail.LatestCloudWatchLogsDeliveryError);
    const topic = (await read(["sns", "get-topic-attributes", "--topic-arn", `arn:aws:sns:${RECOVERY_REGION}:${RECOVERY_ACCOUNT}:perfect-shade-production-operational-alarms`])).Attributes;
    check(Number(topic?.SubscriptionsConfirmed) > 0);
    const token = Object.freeze({ verified: true as const });
    verified.set(token, fingerprint(config));
    return token;
  } catch {
    throw new Error("Root break-glass activation denied: identity, primary MFA, root indicators, audit, or owner review failed; no private details printed.");
  }
}
export const cliRootReadinessReader = (profile: string): RootReadinessReader => ({ read: cliAwsReader(profile) });
