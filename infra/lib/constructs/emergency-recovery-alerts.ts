import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { EMERGENCY_USER_ARN, EMERGENCY_ROLE_ARN, RECOVERY_ACCOUNT, RECOVERY_REGION, RECOVERY_POOL } from "../recovery-access-config";

/** Fixed-cardinality counters on the existing multi-region trail. No new trail, logs, subscriptions, or request logging. */
export class EmergencyRecoveryAlerts extends Construct {
  constructor(scope: Construct, id: string, props: { trailLogGroupName: string; operationsTopicArn: string }) {
    super(scope, id);
    if (!/^arn:aws:sns:us-west-2:906467472082:[A-Za-z0-9_-]+$/.test(props.operationsTopicArn) ||
      !/^[/A-Za-z0-9_.-]{1,512}$/.test(props.trailLogGroupName)) throw new Error("Exact existing production log group and SNS topic inputs required.");
    const baseAssume = `($.eventSource = "sts.amazonaws.com") && ($.eventName = "AssumeRole") && ($.requestParameters.roleArn = "${EMERGENCY_ROLE_ARN}")`;
    const mutations = ["AdminSetUserPassword", "AdminUpdateUserAttributes", "AdminSetUserMFAPreference", "AdminUserGlobalSignOut"]
      .map(name => `($.eventName = "${name}")`).join(" || ");
    for (const [name, filter] of [
      ["EmergencyLogin", `($.eventName = "ConsoleLogin") && ($.userIdentity.arn = "${EMERGENCY_USER_ARN}")`],
      ["EmergencyAssumption", `${baseAssume} && ($.errorCode NOT EXISTS)`],
      ["EmergencyAssumptionDenied", `${baseAssume} && ($.errorCode EXISTS)`],
      ["ProductionRecoveryMutation", `($.eventSource = "cognito-idp.amazonaws.com") && ($.awsRegion = "${RECOVERY_REGION}") && ($.recipientAccountId = "${RECOVERY_ACCOUNT}") && ($.requestParameters.userPoolId = "${RECOVERY_POOL}") && (${mutations})`],
      ["RootActivity", `($.userIdentity.type = "Root") && ($.eventType != "AwsServiceEvent")`],
    ] as const) {
      new logs.CfnMetricFilter(this, `${name}Metric`, { logGroupName: props.trailLogGroupName, filterPattern: `{ ${filter} }`,
        metricTransformations: [{ metricNamespace: "PerfectShade/RecoveryAccess", metricName: name, metricValue: "1", defaultValue: 0 }] });
      new cloudwatch.CfnAlarm(this, `${name}Alarm`, { alarmName: `perfect-shade-production-${name.toLowerCase()}`,
        namespace: "PerfectShade/RecoveryAccess", metricName: name, statistic: "Sum", period: 60,
        evaluationPeriods: 1, threshold: 1, comparisonOperator: "GreaterThanOrEqualToThreshold", treatMissingData: "notBreaching",
        alarmActions: [props.operationsTopicArn] });
    }
  }
}
