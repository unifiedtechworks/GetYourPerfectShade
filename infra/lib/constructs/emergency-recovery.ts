import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { EMERGENCY_USER_NAME, EMERGENCY_ROLE_NAME, EMERGENCY_ROLE_ARN, REVIEW_REFERENCE_PATTERN } from "../recovery-access-config";
import { emergencyTrust, emergencyUserPolicy, emergencyRolePolicy } from "../emergency-recovery-policy";

/** Inert until separately deployed AND manually given console access/MFA. Never creates a password/key. */
export class EmergencyRecoveryConstruct extends Construct {
  readonly user: iam.CfnUser;
  readonly role: iam.CfnRole;
  constructor(scope: Construct, id: string, props: {
    readonly userName?: string; readonly roleName?: string; readonly poolArn?: unknown;
    readonly consoleCliLogin?: boolean; readonly cliAuthenticationReviewReference?: string;
  } = {}) {
    super(scope, id);
    if (props.consoleCliLogin && !REVIEW_REFERENCE_PATTERN.test(props.cliAuthenticationReviewReference ?? "")) {
      throw new Error("Separately reviewed local CLI authentication exception required.");
    }
    const roleName = props.roleName ?? EMERGENCY_ROLE_NAME;
    const roleArn = props.roleName ? `arn:aws:iam::906467472082:role/${roleName}` : EMERGENCY_ROLE_ARN;
    const userPolicy = emergencyUserPolicy(roleArn, props.consoleCliLogin);
    const rolePolicy = emergencyRolePolicy(props.poolArn);
    const userBoundary = new iam.CfnManagedPolicy(this, "UserBoundary", { policyDocument: userPolicy });
    const roleBoundary = new iam.CfnManagedPolicy(this, "RoleBoundary", { policyDocument: rolePolicy });
    this.user = new iam.CfnUser(this, "User", {
      userName: props.userName ?? EMERGENCY_USER_NAME, permissionsBoundary: userBoundary.ref,
      policies: [{ policyName: "AssumeEmergencyRecovery", policyDocument: userPolicy }],
      tags: [{ key: "Project", value: "PerfectShade" }, { key: "Purpose", value: "protected-emergency-recovery" }],
    });
    this.role = new iam.CfnRole(this, "Role", {
      roleName, maxSessionDuration: 3600, permissionsBoundary: roleBoundary.ref,
      assumeRolePolicyDocument: emergencyTrust(this.user.attrArn),
      policies: [{ policyName: "RecoveryOperations", policyDocument: rolePolicy }],
      tags: [{ key: "Project", value: "PerfectShade" }, { key: "Purpose", value: "protected-emergency-recovery" }],
    });
  }
}
