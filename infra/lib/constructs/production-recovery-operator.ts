import { Duration } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export const PRODUCTION_RECOVERY_ACTIONS = [
  "cognito-idp:AdminGetUser",
  "cognito-idp:ListUsers",
  "cognito-idp:AdminSetUserPassword",
  "cognito-idp:AdminUpdateUserAttributes",
  "cognito-idp:AdminSetUserMFAPreference",
  "cognito-idp:AdminUserGlobalSignOut",
] as const;

export interface ProductionRecoveryOperatorConstructProps {
  readonly resourcePrefix: string;
  readonly userPool: cognito.IUserPool;
  readonly trustedOperatorPrincipalArn: string;
}

/**
 * Opt-in recovery role design. The production stack instantiates this construct only after an
 * exact trusted principal is supplied through reviewed CDK context. The MFA condition is suitable
 * for IAM-user temporary sessions; federated/Identity Center access needs a separately reviewed
 * MFA session-tag trust condition before this role is deployed.
 */
export class ProductionRecoveryOperatorConstruct extends Construct {
  readonly role: iam.Role;

  constructor(
    scope: Construct,
    id: string,
    props: ProductionRecoveryOperatorConstructProps,
  ) {
    super(scope, id);

    const trustedOperator = new iam.ArnPrincipal(
      props.trustedOperatorPrincipalArn,
    ).withConditions({
      Bool: { "aws:MultiFactorAuthPresent": "true" },
      NumericLessThanEquals: { "aws:MultiFactorAuthAge": "900" },
    });

    this.role = new iam.Role(this, "Role", {
      roleName: `${props.resourcePrefix}-cognito-recovery`,
      description:
        "Human-assumed, MFA-protected role for approved Perfect Shade Cognito recovery only",
      assumedBy: trustedOperator,
      maxSessionDuration: Duration.hours(1),
    });
    this.role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [...PRODUCTION_RECOVERY_ACTIONS],
      resources: [props.userPool.userPoolArn],
    }));
  }
}
