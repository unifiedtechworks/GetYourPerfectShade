import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { RECOVERY_ACCOUNT, RECOVERY_REGION, assignmentUsers, type RecoveryAccessConfig } from "./recovery-access-config";

export interface DirectoryReader {
  instances(): Promise<readonly { InstanceArn?: string; IdentityStoreId?: string; OwnerAccountId?: string }[]>;
  user(store: string, id: string): Promise<{ UserId?: string; IdentityStoreId?: string }>;
}

/** Read-only activation guard. Existence is not proof of the human: owner review is also mandatory. */
export async function verifyRecoveryDirectory(config: RecoveryAccessConfig, reader: DirectoryReader): Promise<void> {
  if (!config.assignments) return;
  try {
    const instance = (await reader.instances()).find(item => item.InstanceArn === config.instanceArn);
    if (!instance || instance.IdentityStoreId !== config.identityStoreId || instance.OwnerAccountId !== RECOVERY_ACCOUNT) {
      throw new Error("scope");
    }
    for (const id of Object.values(assignmentUsers(config))) {
      const user = await reader.user(config.identityStoreId, id);
      if (user.UserId !== id || user.IdentityStoreId !== config.identityStoreId) throw new Error("identity");
    }
  } catch {
    throw new Error("Assignment activation denied: directory verification failed; no identity details printed.");
  }
}

export function cliAwsReader(profile: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(profile)) throw new Error("An explicit provisioning-reader profile is required.");
  const run = promisify(execFile);
  return async function read(args: string[], region = RECOVERY_REGION) {
    const allowed: Record<string, readonly string[]> = {
      sts: ["get-caller-identity"], "sso-admin": ["list-instances"], identitystore: ["describe-user"],
      cloudtrail: ["lookup-events", "get-trail-status"], sns: ["get-topic-attributes", "get-subscription-attributes"],
      iam: ["get-user", "get-role", "get-login-profile", "list-access-keys", "list-groups-for-user", "list-attached-user-policies",
        "list-attached-role-policies", "list-user-policies", "list-role-policies", "get-user-policy", "get-role-policy", "get-policy",
        "get-policy-version", "list-mfa-devices", "get-mfa-device", "get-account-summary"],
    };
    if (!args[0] || !args[1] || !allowed[args[0]]?.includes(args[1])) throw new Error("Only the reviewed read-only inspection operations are allowed.");
    if (![RECOVERY_REGION, "us-east-1"].includes(region)) throw new Error("Unapproved read region.");
    const { stdout } = await run("aws", [...args, "--profile", profile, "--region", region, "--output", "json"], {
      encoding: "utf8", maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", AWS_PAGER: "" },
    });
    return JSON.parse(stdout);
  };
}

export function cliDirectoryReader(profile: string): DirectoryReader {
  const read = cliAwsReader(profile);
  return {
    instances: async () => (await read(["sso-admin", "list-instances"])).Instances,
    user: (store, id) => read(["identitystore", "describe-user", "--identity-store-id", store, "--user-id", id]),
  };
}
