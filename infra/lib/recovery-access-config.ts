import type { App } from "aws-cdk-lib";
import { readFileSync } from "node:fs";

export const RECOVERY_ACCOUNT = "906467472082";
export const RECOVERY_REGION = "us-west-2";
export const RECOVERY_POOL = "us-west-2_M76kmqH14";
export const RECOVERY_PERMISSION_SET = "PerfectShadeProductionRecovery";
export const RECOVERY_POOL_ARN = `arn:aws:cognito-idp:${RECOVERY_REGION}:${RECOVERY_ACCOUNT}:userpool/${RECOVERY_POOL}`;
export const USER_ID_PATTERN = /^(?:[0-9a-f]{10}-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const EMERGENCY_USER_NAME = "perfect-shade-emergency-recovery";
export const EMERGENCY_ROLE_NAME = "perfect-shade-production-emergency-recovery";
export const EMERGENCY_USER_ARN = `arn:aws:iam::${RECOVERY_ACCOUNT}:user/${EMERGENCY_USER_NAME}`;
export const EMERGENCY_ROLE_ARN = `arn:aws:iam::${RECOVERY_ACCOUNT}:role/${EMERGENCY_ROLE_NAME}`;
export const REVIEW_REFERENCE_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{2,63}$/;
export interface RootBreakGlassReview {
  readonly ownerReadinessConfirmed: boolean;
  readonly rootCustodyReviewReference: string;
  readonly rootRecoveryReviewReference: string;
  readonly primaryMfaEventId: string;
}
export interface EmergencyEvidence {
  readonly mfaMode: "hardware-fido" | "virtual-totp";
  readonly virtualTotpRecovery?: Readonly<{
    method: "escrow-restore" | "independent-device";
    recoveryReviewReference: string;
    passwordSeparationReviewReference: string;
    recoveryConsoleLoginEventId: string;
  }>;
  readonly userArn: string; readonly roleArn: string;
  readonly userId: string; readonly roleId: string;
  readonly primaryDirectoryFingerprint: string;
  readonly deviceSerialNumbers: readonly string[];
  readonly custodyReviewReference: string; readonly cliAuthenticationReviewReference: string;
  readonly notificationSubscriptionArn: string; readonly notificationRecipientFingerprint: string;
  readonly notificationReceiptReviewReference: string;
  readonly primaryMfaEventId: string;
  readonly consoleLoginEventIds: readonly string[];
  readonly assumeRoleEventId: string; readonly successfulReadEventId: string;
  readonly noMfaDeniedEventId: string; readonly staleMfaDeniedEventId: string;
  readonly revocationEventId: string; readonly revokedReadEventId: string;
}

export interface RecoveryAccessConfig {
  readonly instanceArn: string;
  readonly identityStoreId: string;
  readonly assignments?: Readonly<{
    primaryUserId: string;
    backupUserId?: string;
    mode?: "two-human" | "protected-emergency" | "root-break-glass";
    emergency?: EmergencyEvidence;
    rootBreakGlass?: RootBreakGlassReview;
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
    const mode = config.assignments.mode ?? "two-human";
    if (!["two-human", "protected-emergency", "root-break-glass"].includes(mode)) throw new Error("Unknown recovery operator mode.");
    if (mode === "two-human" && (!USER_ID_PATTERN.test(primaryUserId) || !USER_ID_PATTERN.test(backupUserId ?? "") || primaryUserId === backupUserId)) {
      throw new Error("Two distinct, explicitly confirmed Identity Center USER IDs are required.");
    }
    if (mode === "two-human" && config.assignments.emergency) throw new Error("Do not mix recovery operator models.");
    if (mode === "protected-emergency") {
      if (!USER_ID_PATTERN.test(primaryUserId) || backupUserId !== undefined) throw new Error("Protected emergency mode requires one exact primary USER ID, never a fabricated backup.");
      validateEmergencyEvidence(config.assignments.emergency);
    }
    if (mode !== "root-break-glass" && config.assignments.rootBreakGlass !== undefined) throw new Error("Do not mix recovery operator models.");
    if (mode === "root-break-glass") {
      const root = config.assignments.rootBreakGlass;
      if (!USER_ID_PATTERN.test(primaryUserId) || backupUserId !== undefined || config.assignments.emergency !== undefined) {
        throw new Error("Root break-glass requires one reviewed primary USER ID, no backup user or emergency IAM evidence.");
      }
      if (!root || typeof root !== "object" || Array.isArray(root) ||
        Object.keys(root).some(key => !["ownerReadinessConfirmed", "rootCustodyReviewReference", "rootRecoveryReviewReference", "primaryMfaEventId"].includes(key)) ||
        root.ownerReadinessConfirmed !== true ||
        [root.rootCustodyReviewReference, root.rootRecoveryReviewReference].some(value => typeof value !== "string" || !REVIEW_REFERENCE_PATTERN.test(value)) ||
        typeof root.primaryMfaEventId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(root.primaryMfaEventId)) {
        throw new Error("Explicit root readiness/custody review and a real primary MFA event ID are required; never include secrets.");
      }
    }
    if ([identityReviewReference, mfaReviewReference, emergencyReviewReference].some(value =>
      typeof value !== "string" || !REVIEW_REFERENCE_PATTERN.test(value))) {
      throw new Error("Non-sensitive identity, MFA, and emergency review references are required.");
    }
  }
}

export function assignmentUsers(config: RecoveryAccessConfig): Record<string, string> {
  if (!config.assignments) return {};
  return ["protected-emergency", "root-break-glass"].includes(config.assignments.mode ?? "two-human")
    ? { Primary: config.assignments.primaryUserId }
    : { Primary: config.assignments.primaryUserId, Backup: config.assignments.backupUserId! };
}

export function validateEmergencyEvidence(value: EmergencyEvidence | undefined): asserts value is EmergencyEvidence {
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  const fields = ["mfaMode", "virtualTotpRecovery", "userArn", "roleArn", "userId", "roleId", "primaryDirectoryFingerprint", "deviceSerialNumbers", "custodyReviewReference", "cliAuthenticationReviewReference",
    "notificationSubscriptionArn", "notificationRecipientFingerprint", "notificationReceiptReviewReference",
    "primaryMfaEventId", "consoleLoginEventIds", "assumeRoleEventId", "successfulReadEventId", "revocationEventId", "revokedReadEventId", "noMfaDeniedEventId", "staleMfaDeniedEventId"];
  if (!value || Object.keys(value).some(key => !fields.includes(key)) || value.userArn !== EMERGENCY_USER_ARN || value.roleArn !== EMERGENCY_ROLE_ARN ||
    !/^AIDA[A-Z0-9]{17}$/.test(value.userId) || !/^AROA[A-Z0-9]{17}$/.test(value.roleId) ||
    !/^[0-9a-f]{64}$/.test(value.primaryDirectoryFingerprint) ||
    !REVIEW_REFERENCE_PATTERN.test(value.custodyReviewReference ?? "") ||
    !REVIEW_REFERENCE_PATTERN.test(value.cliAuthenticationReviewReference ?? "") ||
    !REVIEW_REFERENCE_PATTERN.test(value.notificationReceiptReviewReference ?? "") ||
    !/^[0-9a-f]{64}$/.test(value.notificationRecipientFingerprint ?? "") ||
    !/^arn:aws:sns:us-west-2:906467472082:perfect-shade-production-operational-alarms:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value.notificationSubscriptionArn ?? "") ||
    !Array.isArray(value.deviceSerialNumbers) ||
    !["hardware-fido", "virtual-totp"].includes(value.mfaMode) ||
    new Set(value.deviceSerialNumbers).size !== value.deviceSerialNumbers.length ||
    !Array.isArray(value.consoleLoginEventIds) || value.consoleLoginEventIds.length !== 2 ||
    new Set(value.consoleLoginEventIds).size !== 2 ||
    [...value.consoleLoginEventIds, value.primaryMfaEventId, value.assumeRoleEventId, value.successfulReadEventId, value.revocationEventId, value.revokedReadEventId, value.noMfaDeniedEventId, value.staleMfaDeniedEventId]
      .some(id => typeof id !== "string" || !uuid.test(id))) {
    throw new Error("Exact emergency identities, device registrations, private reviews, and real CloudTrail test event IDs are required.");
  }
  if (value.mfaMode === "hardware-fido") {
    if (value.virtualTotpRecovery !== undefined || value.deviceSerialNumbers.length !== 2 ||
      value.deviceSerialNumbers.some(serial => typeof serial !== "string" || !/^arn:aws:iam::906467472082:u2f\/[A-Za-z0-9+=,.@_\/-]+$/.test(serial))) {
      throw new Error("Hardware mode requires two exact FIDO registrations and no virtual recovery fields.");
    }
  } else {
    const recovery = value.virtualTotpRecovery;
    const keys = ["method", "recoveryReviewReference", "passwordSeparationReviewReference", "recoveryConsoleLoginEventId"];
    if (!recovery || Object.keys(recovery).some(key => !keys.includes(key)) ||
      !["escrow-restore", "independent-device"].includes(recovery.method) ||
      typeof recovery.recoveryReviewReference !== "string" ||
      typeof recovery.passwordSeparationReviewReference !== "string" ||
      !REVIEW_REFERENCE_PATTERN.test(recovery.recoveryReviewReference ?? "") ||
      !REVIEW_REFERENCE_PATTERN.test(recovery.passwordSeparationReviewReference ?? "") ||
      recovery.recoveryConsoleLoginEventId !== value.consoleLoginEventIds[1] ||
      value.deviceSerialNumbers.length !== (recovery.method === "escrow-restore" ? 1 : 2) ||
      value.deviceSerialNumbers.some(serial => typeof serial !== "string" || !/^arn:aws:iam::906467472082:mfa\/[A-Za-z0-9+=,.@_\/-]+$/.test(serial))) {
      throw new Error("Virtual TOTP requires explicit enrolled devices, separate custody reviews, and a real recovery sign-in event; never include secrets.");
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
  const mode = context("recoveryOperatorMode") ?? "two-human";
  if (!["two-human", "protected-emergency", "root-break-glass"].includes(mode)) throw new Error("Unknown recovery operator mode.");
  if (activate === "false" && (primary !== undefined || backup !== undefined || context("recoveryEmergencyEvidencePath") !== undefined)) {
    throw new Error("Leave operator IDs unset until assignment activation is separately approved.");
  }
  let emergency: EmergencyEvidence | undefined;
  if (activate === "true" && mode === "two-human" && context("recoveryEmergencyEvidencePath") !== undefined) throw new Error("Do not mix recovery operator models.");
  const rootKeys = ["confirmRootBreakGlassReadiness", "rootCustodyReviewReference", "rootRecoveryReviewReference", "recoveryPrimaryMfaEventId"];
  if ((activate !== "true" || mode !== "root-break-glass") && rootKeys.some(key => context(key) !== undefined)) throw new Error("Root readiness inputs require explicit root-break-glass assignment activation.");
  if (mode === "root-break-glass" && context("recoveryEmergencyEvidencePath") !== undefined) throw new Error("Root break-glass does not use emergency IAM evidence.");
  if (activate === "true" && mode === "protected-emergency") {
    const path = context("recoveryEmergencyEvidencePath");
    if (typeof path !== "string" || !path) throw new Error("Private emergency test evidence is required.");
    const raw = readFileSync(path, "utf8");
    if (raw.length > 16_384) throw new Error("Invalid emergency evidence.");
    emergency = JSON.parse(raw);
    validateEmergencyEvidence(emergency);
  }
  const assignments = activate === "true" ? {
    mode,
    primaryUserId: primary,
    backupUserId: backup,
    emergency,
    rootBreakGlass: mode === "root-break-glass" ? {
      ownerReadinessConfirmed: context("confirmRootBreakGlassReadiness") === "true",
      rootCustodyReviewReference: context("rootCustodyReviewReference"),
      rootRecoveryReviewReference: context("rootRecoveryReviewReference"),
      primaryMfaEventId: context("recoveryPrimaryMfaEventId"),
    } : undefined,
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
