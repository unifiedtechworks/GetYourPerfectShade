import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as sso from "aws-cdk-lib/aws-sso";
import type { Construct } from "constructs";
import { PRODUCTION_RECOVERY_ACTIONS } from "./constructs/production-recovery-operator";
import {
  RECOVERY_ACCOUNT, RECOVERY_REGION, RECOVERY_PERMISSION_SET, RECOVERY_POOL_ARN,
  validateRecoveryAccessConfig, type RecoveryAccessConfig,
  assignmentUsers,
} from "./recovery-access-config";
import { hasVerifiedEmergency, type VerifiedEmergency } from "./emergency-activation-verification";

export class PerfectShadeRecoveryAccessStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { config: RecoveryAccessConfig; emergencyVerification?: VerifiedEmergency }) {
    if (props.env?.account !== RECOVERY_ACCOUNT || props.env?.region !== RECOVERY_REGION) {
      throw new Error("Recovery access must target the exact approved account and region.");
    }
    validateRecoveryAccessConfig(props.config);
    if (props.config.assignments?.mode === "protected-emergency" && !hasVerifiedEmergency(props.emergencyVerification, props.config)) {
      throw new Error("Actual emergency deployment/test verification is required before primary-only assignment.");
    }
    super(scope, id, props);
    const permissionSet = new sso.CfnPermissionSet(this, "RecoveryPermissionSet", {
      name: RECOVERY_PERMISSION_SET,
      instanceArn: props.config.instanceArn,
      description: "Human production Cognito recovery only; MFA enforcement is required upstream",
      sessionDuration: "PT1H",
      inlinePolicy: {
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Action: [...PRODUCTION_RECOVERY_ACTIONS], Resource: RECOVERY_POOL_ARN }],
      },
      tags: [{ key: "Project", value: "PerfectShade" }, { key: "Environment", value: "production" }, { key: "Purpose", value: "recovery-access" }],
    });
    if (props.config.assignments) {
      for (const [label, principalId] of Object.entries(assignmentUsers(props.config))) {
        new sso.CfnAssignment(this, `${label}RecoveryAssignment`, {
          instanceArn: props.config.instanceArn,
          permissionSetArn: permissionSet.attrPermissionSetArn,
          principalType: "USER", principalId,
          targetType: "AWS_ACCOUNT", targetId: RECOVERY_ACCOUNT,
        });
      }
    }
    new CfnOutput(this, "RecoveryPermissionSetArn", { value: permissionSet.attrPermissionSetArn });
    new CfnOutput(this, "AssignmentsActivated", { value: props.config.assignments ? "true" : "false" });
  }
}
