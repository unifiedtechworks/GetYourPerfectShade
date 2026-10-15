/** Shared by the normal CDK definition and the deployed-template-only maintenance plan. */
export function operationsAlarmPublishStatement(
  topicArn: unknown,
  account: unknown,
  sourceAlarmArn: unknown,
) {
  return {
    Sid: "AllowProductionCloudWatchAlarms",
    Effect: "Allow",
    Principal: { Service: "cloudwatch.amazonaws.com" },
    Action: "sns:Publish",
    Resource: topicArn,
    Condition: {
      StringEquals: { "aws:SourceAccount": account },
      ArnLike: { "aws:SourceArn": sourceAlarmArn },
    },
  };
}
