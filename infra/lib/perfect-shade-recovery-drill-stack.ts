import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as sso from "aws-cdk-lib/aws-sso";
import type { Construct } from "constructs";
import { PRODUCTION_RECOVERY_ACTIONS } from "./constructs/production-recovery-operator";
import { RECOVERY_ACCOUNT, RECOVERY_REGION, assignmentUsers, validateRecoveryAccessConfig, type RecoveryAccessConfig } from "./recovery-access-config";
import { EmergencyRecoveryConstruct } from "./constructs/emergency-recovery";

export interface RecoveryDrillConfig extends RecoveryAccessConfig {
  readonly runId: string;
  readonly sesFromEmail: string;
  readonly sesReplyToEmail: string;
  readonly prepareEmergencyPath?: boolean;
  readonly emergencyConsoleCliLogin?: boolean;
  readonly emergencyCliAuthenticationReviewReference?: string;
}

/** Disposable Cognito-only definition. Never imports or alters either existing User Pool. */
export class PerfectShadeRecoveryDrillStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { config: RecoveryDrillConfig }) {
    const config = props.config;
    if (props.env?.account !== RECOVERY_ACCOUNT || props.env?.region !== RECOVERY_REGION) {
      throw new Error("Recovery drill must target the exact approved account and region.");
    }
    validateRecoveryAccessConfig(config);
    if (config.emergencyConsoleCliLogin && !config.prepareEmergencyPath) throw new Error("Drill CLI grant needs an explicitly prepared emergency path.");
    if (config.assignments?.mode === "protected-emergency") throw new Error("Drill primary-only assignments need separate test-pool-specific activation review; production evidence must never authorize a drill.");
    if (!/^\d{8}-[a-z0-9]{6}$/.test(config.runId) ||
      config.sesFromEmail !== "notifications@getyourperfectshade.com" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.sesReplyToEmail)) {
      throw new Error("Explicit unique drill ID and approved SES sender/Reply-To are required.");
    }
    super(scope, id, props);
    const pool = new cognito.CfnUserPool(this, "DisposableUserPool", {
      userPoolName: `perfect-shade-recovery-drill-${config.runId}`,
      userPoolTier: "ESSENTIALS", deletionProtection: "INACTIVE",
      adminCreateUserConfig: { allowAdminCreateUserOnly: true },
      usernameAttributes: ["email"], usernameConfiguration: { caseSensitive: false },
      schema: [{ name: "email", attributeDataType: "String", required: true, mutable: true }],
      autoVerifiedAttributes: ["email"],
      userAttributeUpdateSettings: { attributesRequireVerificationBeforeUpdate: [] },
      accountRecoverySetting: { recoveryMechanisms: [{ name: "admin_only", priority: 1 }] },
      mfaConfiguration: "ON", enabledMfas: ["EMAIL_OTP", "SOFTWARE_TOKEN_MFA"],
      policies: { passwordPolicy: { minimumLength: 12, requireLowercase: true, requireUppercase: true,
        requireNumbers: true, requireSymbols: true, temporaryPasswordValidityDays: 3 } },
      emailConfiguration: { emailSendingAccount: "DEVELOPER",
        sourceArn: `arn:aws:ses:${RECOVERY_REGION}:${RECOVERY_ACCOUNT}:identity/getyourperfectshade.com`,
        from: `Perfect Shade Recovery Drill <${config.sesFromEmail}>`, replyToEmailAddress: config.sesReplyToEmail },
      userPoolTags: { Project: "PerfectShade", Environment: "recovery-drill", Purpose: "disposable-recovery-test" },
    });
    pool.applyRemovalPolicy(RemovalPolicy.DESTROY);
    const client = new cognito.CfnUserPoolClient(this, "DisposableClient", {
      userPoolId: pool.ref, clientName: `recovery-drill-${config.runId}`, generateSecret: false,
      explicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
      preventUserExistenceErrors: "ENABLED", enableTokenRevocation: true,
      accessTokenValidity: 1, idTokenValidity: 1, refreshTokenValidity: 7, authSessionValidity: 3,
      tokenValidityUnits: { accessToken: "hours", idToken: "hours", refreshToken: "days" },
    });
    const permissionSet = new sso.CfnPermissionSet(this, "DisposableRecoveryPermissionSet", {
      instanceArn: config.instanceArn, name: `PSRecoveryDrill-${config.runId}`, sessionDuration: "PT1H",
      inlinePolicy: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: [...PRODUCTION_RECOVERY_ACTIONS], Resource: pool.attrArn }] },
      tags: [{ key: "Project", value: "PerfectShade" }, { key: "Environment", value: "recovery-drill" }],
    });
    if (config.assignments) {
      for (const [name, principalId] of Object.entries(assignmentUsers(config))) {
        new sso.CfnAssignment(this, `${name}DisposableAssignment`, {
          instanceArn: config.instanceArn, permissionSetArn: permissionSet.attrPermissionSetArn,
          principalId, principalType: "USER", targetId: RECOVERY_ACCOUNT, targetType: "AWS_ACCOUNT",
        });
      }
    }
    if (config.prepareEmergencyPath) {
      new EmergencyRecoveryConstruct(this, "DisposableEmergency", {
        userName: `ps-drill-emergency-${config.runId}`, roleName: `ps-drill-recovery-${config.runId}`, poolArn: pool.attrArn,
        consoleCliLogin: config.emergencyConsoleCliLogin, cliAuthenticationReviewReference: config.emergencyCliAuthenticationReviewReference,
      });
    }
    new CfnOutput(this, "DisposableUserPoolId", { value: pool.ref });
    new CfnOutput(this, "DisposableClientId", { value: client.ref });
    new CfnOutput(this, "DisposableRecoveryPermissionSetArn", { value: permissionSet.attrPermissionSetArn });
  }
}
