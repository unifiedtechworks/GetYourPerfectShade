import type { App } from "aws-cdk-lib";

export const RECOVERY_ACCOUNT = "906467472082";
export const RECOVERY_REGION = "us-west-2";
export const RECOVERY_POOL = "us-west-2_M76kmqH14";
export const RECOVERY_PERMISSION_SET = "PerfectShadeProductionRecovery";
export const RECOVERY_POOL_ARN = `arn:aws:cognito-idp:${RECOVERY_REGION}:${RECOVERY_ACCOUNT}:userpool/${RECOVERY_POOL}`;
export const USER_ID_PATTERN = /^(?:[0-9a-f]{10}-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface RecoveryAccessConfig {
  readonly instanceArn: string;
  readonly identityStoreId: string;
  readonly assignments?: Readonly<{
    primaryUserId: string;
    backupUserId: string;
    identityReviewReference: string;
    mfaReviewReference: string;
    emergencyReviewReference: string;
  }>;
}

export function validateRecoveryAccessConfig(config: RecoveryAccessConfig): void {
  if (!/^arn:aws:sso:::instance\/ssoins-[A-Za-z0-9-.]{16}$/.test(config.instanceArn)) {
    throw new Error("An exact organization Identity Center instance ARN is required.");
  }
  if (!/^(?:d-[0-9a-f]{10}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/.test(config.identityStoreId)) {
    throw new Error("An exact Identity Store ID is required.");
  }
  if (config.assignments) {
    const { primaryUserId, backupUserId, identityReviewReference, mfaReviewReference, emergencyReviewReference } = config.assignments;
    if (!USER_ID_PATTERN.test(primaryUserId) || !USER_ID_PATTERN.test(backupUserId) || primaryUserId === backupUserId) {
      throw new Error("Two distinct, explicitly confirmed Identity Center USER IDs are required.");
    }
    if ([identityReviewReference, mfaReviewReference, emergencyReviewReference].some(value =>
      typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{2,63}$/.test(value))) {
      throw new Error("Non-sensitive identity, MFA, and emergency review references are required.");
    }
  }
}

export function loadRecoveryAccessConfig(app: App): RecoveryAccessConfig {
  const context = (key: string) => app.node.tryGetContext(key);
  if (context("confirmRecoveryAccessSynthesis") !== "true") {
    throw new Error("confirmRecoveryAccessSynthesis=true is required; synthesis is not deployment approval.");
  }
  if (context("recoveryTargetAccount") !== RECOVERY_ACCOUNT) {
    throw new Error("recoveryTargetAccount must be the exact approved AWS account.");
  }
  const activate = context("activateRecoveryAssignments") ?? "false";
  if (!["true", "false"].includes(activate)) throw new Error("activateRecoveryAssignments must be true or false.");
  const primary = context("primaryRecoveryUserId"), backup = context("backupRecoveryUserId");
  if (activate === "false" && (primary !== undefined || backup !== undefined)) {
    throw new Error("Leave operator IDs unset until assignment activation is separately approved.");
  }
  const assignments = activate === "true" ? {
    primaryUserId: primary,
    backupUserId: backup,
    identityReviewReference: context("recoveryIdentityReviewReference"),
    mfaReviewReference: context("recoveryMfaReviewReference"),
    emergencyReviewReference: context("recoveryEmergencyReviewReference"),
  } : undefined;
  const config: RecoveryAccessConfig = {
    instanceArn: context("recoveryIdentityCenterInstanceArn") ?? "",
    identityStoreId: context("recoveryIdentityStoreId") ?? "",
    assignments,
  };
  validateRecoveryAccessConfig(config);
  return config;
}
