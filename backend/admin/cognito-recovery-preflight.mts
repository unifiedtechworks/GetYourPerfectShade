import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { fromSSO } from "@aws-sdk/credential-provider-sso";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { AdminGetUserCommand, ListUsersCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

export const ACCOUNT = "906467472082";
export const REGION = "us-west-2";
export const POOL = "us-west-2_M76kmqH14";
export const PERMISSION_SET = "PerfectShadeProductionRecovery";
const referencePattern = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
const subjectPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export class RecoveryPreflightError extends Error {
  readonly code: string;
  constructor(code: string) { super("Recovery preflight denied. Review the documented safety gates."); this.code = code; }
}

export type OperatorConfiguration = Readonly<{
  accountId: string; region: string; userPoolId: string; profile: string;
  approvedRecoveryRoleArn: string;
  mfaReviewReference: string; emergencyReviewReference: string;
}>;
export type RecoveryRequest = Readonly<{
  scenario: "password" | "totp" | "email";
  targetUsername: string; expectedSubject: string;
  authorizationReference: string; identityReviewReference: string;
  membershipReviewReference: string; factorControlReviewReference: string;
  replacementEmail?: string;
}>;
export type SafeUserState = Readonly<{
  username: string; subject: string; enabled: boolean; status: string;
  email: string; emailVerified: boolean; enrolledFactors: readonly string[];
}>;
export interface RecoveryReaders {
  session(): Promise<{ account: string; arn: string; temporary: boolean; expiresAt: number }>;
  user(username: string): Promise<SafeUserState>;
  emailUsers(email: string): Promise<readonly SafeUserState[]>;
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) {
    throw new RecoveryPreflightError("invalid_configuration");
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new RecoveryPreflightError("invalid_configuration");
  return value;
}
export function validateOperatorConfiguration(value: unknown): OperatorConfiguration {
  const v = record(value, ["accountId", "region", "userPoolId", "profile", "approvedRecoveryRoleArn", "mfaReviewReference", "emergencyReviewReference"]);
  if (v.accountId !== ACCOUNT || v.region !== REGION || v.userPoolId !== POOL) throw new RecoveryPreflightError("wrong_production_target");
  const profile = text(v.profile, /^[A-Za-z0-9_-]{1,64}$/);
  if (profile.toLowerCase() === "default") throw new RecoveryPreflightError("ordinary_credentials_rejected");
  const role = text(v.approvedRecoveryRoleArn,
    /^arn:aws:iam::906467472082:role\/aws-reserved\/sso\.amazonaws\.com\/us-west-2\/AWSReservedSSO_PerfectShadeProductionRecovery_[0-9a-f]{16}$/);
  return { accountId: ACCOUNT, region: REGION, userPoolId: POOL, profile,
    approvedRecoveryRoleArn: role,
    mfaReviewReference: text(v.mfaReviewReference, referencePattern),
    emergencyReviewReference: text(v.emergencyReviewReference, referencePattern) };
}
export function validateRecoveryRequest(value: unknown): RecoveryRequest {
  const v = record(value, ["scenario", "targetUsername", "expectedSubject", "authorizationReference", "identityReviewReference", "membershipReviewReference", "factorControlReviewReference", "replacementEmail"]);
  if (!["password", "totp", "email"].includes(String(v.scenario))) throw new RecoveryPreflightError("invalid_scenario");
  const scenario = v.scenario as RecoveryRequest["scenario"];
  const replacementEmail = scenario === "email" ? text(v.replacementEmail, /^[^\s@"\\]{1,64}@[^\s@"\\]+\.[^\s@"\\]+$/).toLowerCase() : undefined;
  if (scenario !== "email" && v.replacementEmail !== undefined) throw new RecoveryPreflightError("unexpected_email_change");
  return { scenario, targetUsername: text(v.targetUsername, /^[A-Za-z0-9_+=,.@-]{1,128}$/),
    expectedSubject: text(v.expectedSubject, subjectPattern),
    authorizationReference: text(v.authorizationReference, referencePattern),
    identityReviewReference: text(v.identityReviewReference, referencePattern),
    membershipReviewReference: text(v.membershipReviewReference, referencePattern),
    factorControlReviewReference: text(v.factorControlReviewReference, referencePattern),
    replacementEmail };
}

export async function recoveryPreflight(config: OperatorConfiguration, request: RecoveryRequest, readers: RecoveryReaders, now = Date.now()) {
  config = validateOperatorConfiguration(config);
  request = validateRecoveryRequest(request);
  try {
    const session = await readers.session();
    const roleName = config.approvedRecoveryRoleArn.split("/").at(-1)!;
    const prefix = `arn:aws:sts::${ACCOUNT}:assumed-role/${roleName}/`;
    if (session.account !== ACCOUNT || !session.arn.startsWith(prefix) ||
      !/^[A-Za-z0-9_+=,.@-]{1,64}$/.test(session.arn.slice(prefix.length)) || !session.temporary ||
      !Number.isFinite(session.expiresAt) || session.expiresAt <= now || session.expiresAt - now > 3_600_000) {
      throw new RecoveryPreflightError("unapproved_session");
    }
    const user = await readers.user(request.targetUsername);
    if (user.username !== request.targetUsername || user.subject !== request.expectedSubject || !user.enabled ||
      !["CONFIRMED", "FORCE_CHANGE_PASSWORD"].includes(user.status) || !user.emailVerified || !user.email) {
      throw new RecoveryPreflightError("target_identity_mismatch");
    }
    if (request.scenario === "totp" && !user.enrolledFactors.includes("SOFTWARE_TOKEN_MFA")) {
      throw new RecoveryPreflightError("totp_not_enrolled");
    }
    let emailUpdateAlreadyComplete = false;
    if (request.scenario === "email") {
      const matches = await readers.emailUsers(request.replacementEmail!);
      if (matches.length > 1 || matches.some(match => match.subject !== request.expectedSubject || match.username !== user.username)) {
        throw new RecoveryPreflightError("replacement_email_collision");
      }
      emailUpdateAlreadyComplete = user.email.toLowerCase() === request.replacementEmail;
    }
    return { mode: "preflight", scenario: request.scenario, readOnly: true,
      targetSubjectVerified: true, temporarySsoSessionVerified: true,
      membershipVerifiedByTool: false, executionEnabled: false, passwordTransferApproved: false,
      emailSnapshotReconciliationRequired: request.scenario === "email", emailUpdateAlreadyComplete };
  } catch (error) {
    if (error instanceof RecoveryPreflightError) throw error;
    throw new RecoveryPreflightError("aws_read_failed");
  }
}

function userState(value: { Username?: string; Enabled?: boolean; UserStatus?: string; UserAttributes?: { Name?: string; Value?: string }[]; Attributes?: { Name?: string; Value?: string }[]; UserMFASettingList?: string[] }): SafeUserState {
  const attributes = Object.fromEntries((value.UserAttributes ?? value.Attributes ?? []).map(a => [a.Name, a.Value]));
  return { username: value.Username ?? "", subject: attributes.sub ?? "", enabled: value.Enabled === true,
    status: value.UserStatus ?? "", email: attributes.email ?? "", emailVerified: attributes.email_verified === "true",
    enrolledFactors: value.UserMFASettingList ?? [] };
}

/** Explicit SSO provider only: never fall back to environment keys, the default profile, or browser tokens. */
export function awsRecoveryReaders(config: OperatorConfiguration): RecoveryReaders {
  validateOperatorConfiguration(config);
  const provider = fromSSO({ profile: config.profile });
  const credentials = async () => {
    const value = await provider();
    if (!value.sessionToken || !value.expiration || value.expiration.getTime() <= Date.now() ||
      value.expiration.getTime() - Date.now() > 3_600_000) throw new RecoveryPreflightError("unapproved_session");
    return value;
  };
  const sts = new STSClient({ region: REGION, credentials });
  const cognito = new CognitoIdentityProviderClient({ region: REGION, credentials });
  return {
    session: async () => {
      const value = await credentials();
      const caller = await sts.send(new GetCallerIdentityCommand({}));
      return { account: caller.Account ?? "", arn: caller.Arn ?? "", temporary: true, expiresAt: value.expiration!.getTime() };
    },
    user: async username => userState(await cognito.send(new AdminGetUserCommand({ UserPoolId: POOL, Username: username }))),
    emailUsers: async email => {
      const users: SafeUserState[] = []; let token: string | undefined;
      for (let page = 0; page < 10; page++) {
        const response = await cognito.send(new ListUsersCommand({ UserPoolId: POOL,
          Filter: `email = ${JSON.stringify(email)}`, Limit: 60, PaginationToken: token }));
        users.push(...(response.Users ?? []).map(userState)); token = response.PaginationToken;
        if (!token) return users;
      }
      throw new RecoveryPreflightError("ambiguous_collision_check");
    },
  };
}

export function parseArguments(argv: readonly string[]) {
  let configPath: string | undefined, requestPath: string | undefined, mode: "dry-run" | "preflight" | undefined;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--") continue;
    if (flag === "--help") return { help: true as const };
    if (flag === "--dry-run" || flag === "--preflight") {
      if (mode) throw new RecoveryPreflightError("invalid_arguments"); mode = flag.slice(2) as "dry-run" | "preflight";
    } else if (flag === "--config" || flag === "--request") {
      const path = argv[++i];
      if (!path || path.startsWith("--")) throw new RecoveryPreflightError("invalid_arguments");
      if (flag === "--config") { if (configPath) throw new RecoveryPreflightError("invalid_arguments"); configPath = path; }
      else { if (requestPath) throw new RecoveryPreflightError("invalid_arguments"); requestPath = path; }
    } else throw new RecoveryPreflightError("execution_not_available");
  }
  if (!configPath || !requestPath || !mode) throw new RecoveryPreflightError("invalid_arguments");
  return { configPath, requestPath, mode };
}

export async function runRecoveryCli(argv: readonly string[], output: (message: string) => void = console.log) {
  try {
    const args = parseArguments(argv);
    if ("help" in args) {
      output("pnpm recover:account -- --config <private-json> --request <private-json> --dry-run|--preflight\nPreflight only. No passwords, mutation flags, database operations, user creation/deletion, or public recovery API. Execution requires separately approved delivery/tooling and an isolated drill.");
      return 0;
    }
    async function json(path: string) {
      const content = await readFile(path, "utf8");
      if (content.length > 16_384) throw new RecoveryPreflightError("invalid_configuration");
      return JSON.parse(content) as unknown;
    }
    const config = validateOperatorConfiguration(await json(args.configPath));
    const request = validateRecoveryRequest(await json(args.requestPath));
    output(JSON.stringify(args.mode === "dry-run" ? { mode: "dry-run", readOnly: true, awsCalls: false, executionEnabled: false }
      : await recoveryPreflight(config, request, awsRecoveryReaders(config))));
    return 0;
  } catch (error) {
    output(JSON.stringify({ status: "denied", code: error instanceof RecoveryPreflightError ? error.code : "private_configuration_unavailable", executionEnabled: false }));
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRecoveryCli(process.argv.slice(2)).then(code => { process.exitCode = code; });
}
