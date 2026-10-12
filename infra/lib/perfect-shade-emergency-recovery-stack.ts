import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";
import { EmergencyRecoveryConstruct } from "./constructs/emergency-recovery";
import { EmergencyRecoveryAlerts } from "./constructs/emergency-recovery-alerts";
import { RECOVERY_ACCOUNT, RECOVERY_REGION, REVIEW_REFERENCE_PATTERN } from "./recovery-access-config";

export class PerfectShadeEmergencyRecoveryStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & {
    enabled?: boolean; accountAuthorizationReference?: string;
    consoleCliLogin?: boolean; cliAuthenticationReviewReference?: string;
    prepareAlerts?: boolean; trailLogGroupName?: string; operationsTopicArn?: string;
  }) {
    if (props.env?.account !== RECOVERY_ACCOUNT || props.env?.region !== RECOVERY_REGION) throw new Error("Wrong emergency recovery account/region.");
    super(scope, id, props);
    if (!props.enabled) return;
    if (!REVIEW_REFERENCE_PATTERN.test(props.accountAuthorizationReference ?? "")) throw new Error("Explicit access-only account authorization reference required.");
    const access = new EmergencyRecoveryConstruct(this, "Emergency", props);
    if (props.prepareAlerts) new EmergencyRecoveryAlerts(this, "Alerts", {
      trailLogGroupName: props.trailLogGroupName ?? "", operationsTopicArn: props.operationsTopicArn ?? "",
    });
    new CfnOutput(this, "EmergencyUserArn", { value: access.user.attrArn });
    new CfnOutput(this, "EmergencyRoleArn", { value: access.role.attrArn });
  }
}
