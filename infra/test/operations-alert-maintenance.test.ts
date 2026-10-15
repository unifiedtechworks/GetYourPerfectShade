import { describe, expect, it } from "vitest";
import { prepareOperationsAlertMaintenance } from "../lib/operations-alert-maintenance";

function fixture() {
  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Parameters: { BootstrapVersion: { Type: "AWS::SSM::Parameter::Value<String>", Default: "/bootstrap/version" } },
    Outputs: { OperationsAlarmTopicArn: { Value: { Ref: "Operations" } } },
    Resources: {
      Operations: { Type: "AWS::SNS::Topic", Properties: { TopicName: "perfect-shade-production-operational-alarms" } },
      Feedback: { Type: "AWS::SNS::Topic", Properties: { TopicName: "perfect-shade-production-ses-feedback" } },
      OperationsSubscription: { Type: "AWS::SNS::Subscription", Properties: {
        TopicArn: { Ref: "Operations" }, Protocol: "email", Endpoint: "operations@example.invalid" } },
      FeedbackSubscription: { Type: "AWS::SNS::Subscription", Properties: {
        TopicArn: { Ref: "Feedback" }, Protocol: "email", Endpoint: "operations@example.invalid" } },
      OperationsPolicy: { Type: "AWS::SNS::TopicPolicy", Properties: {
        Topics: [{ Ref: "Operations" }], PolicyDocument: { Version: "2012-10-17", Statement: [{
          Sid: "0", Effect: "Allow", Principal: { Service: "events.amazonaws.com" },
          Action: "sns:Publish", Resource: { Ref: "Operations" },
        }] } } },
      FeedbackPolicy: { Type: "AWS::SNS::TopicPolicy", Properties: {
        Topics: [{ Ref: "Feedback" }], PolicyDocument: { Statement: [{ Principal: { Service: "ses.amazonaws.com" } }] } } },
      // Pending source Cognito changes must NEVER enter the maintenance template.
      Cognito: { Type: "AWS::Cognito::UserPool", Properties: { EnabledMfas: ["SOFTWARE_TOKEN_MFA"], MfaConfiguration: "ON" } },
      Aurora: { Type: "AWS::RDS::DBCluster", Properties: { EngineVersion: "16.14", DeletionProtection: true } },
      Bucket: { Type: "AWS::S3::Bucket", Properties: { BucketName: "preserve-existing" } },
      Rule: { Type: "AWS::Events::Rule", Properties: { Targets: [{ Arn: { Ref: "Operations" }, Id: "Target0" }] } },
    },
  };
}

describe("offline production operations maintenance plan", () => {
  it("changes the same managed policy and only the two absent subscriptions; preserves all other JSON", () => {
    const original = fixture();
    const snapshot = JSON.stringify(original);
    const plan = prepareOperationsAlertMaintenance({ TemplateBody: original }, "operations@example.invalid");
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(plan.subscriptionIds).toEqual(["OperationsSubscription", "FeedbackSubscription"]);
    for (const [id, resource] of Object.entries(original.Resources)) {
      if (!plan.allowedResourceChanges.includes(id)) {
        expect(plan.detach.Resources[id]).toEqual(resource);
        expect(plan.restore.Resources[id]).toEqual(resource);
      }
    }
    expect(plan.detach.Resources.OperationsSubscription).toBeUndefined();
    expect(plan.detach.Resources.FeedbackSubscription).toBeUndefined();
    expect(plan.restore.Resources.OperationsSubscription).toEqual(original.Resources.OperationsSubscription);
    expect(plan.restore.Resources.FeedbackSubscription).toEqual(original.Resources.FeedbackSubscription);
    expect(Object.keys(plan.restore.Resources)).toEqual(Object.keys(original.Resources));
    const document = plan.restore.Resources.OperationsPolicy!.Properties.PolicyDocument as { Statement: unknown[] };
    expect(document.Statement).toHaveLength(2);
    expect(document.Statement[0]).toEqual(original.Resources.OperationsPolicy.Properties.PolicyDocument.Statement[0]);
    expect(document.Statement[1]).toMatchObject({
      Principal: { Service: "cloudwatch.amazonaws.com" }, Action: "sns:Publish", Resource: { Ref: "Operations" },
      Condition: { StringEquals: { "aws:SourceAccount": { Ref: "AWS::AccountId" } },
        ArnLike: { "aws:SourceArn": { "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" },
          ":cloudwatch:us-west-2:", { Ref: "AWS::AccountId" }, ":alarm:perfect-shade-production-*"]] } } },
    });
    for (const key of ["Parameters", "Outputs", "AWSTemplateFormatVersion"] as const) {
      expect(plan.detach[key]).toEqual(original[key]);
      expect(plan.restore[key]).toEqual(original[key]);
    }
  });

  it("accepts the AWS string TemplateBody representation", () => {
    expect(prepareOperationsAlertMaintenance({ TemplateBody: JSON.stringify(fixture()) }, "operations@example.invalid").policyId)
      .toBe("OperationsPolicy");
  });

  it("rejects wrong recipient, non-email subscriptions, development topics and transformed templates", () => {
    expect(() => prepareOperationsAlertMaintenance(fixture(), "other@example.invalid")).toThrow(/reviewed email/);
    expect(() => prepareOperationsAlertMaintenance(fixture(), "*")).toThrow(/mailbox/);
    const wrongProtocol = fixture(); wrongProtocol.Resources.OperationsSubscription.Properties.Protocol = "https";
    expect(() => prepareOperationsAlertMaintenance(wrongProtocol, "operations@example.invalid")).toThrow(/reviewed email/);
    const development = fixture(); development.Resources.Operations.Properties.TopicName = "perfect-shade-development-operational-alarms";
    expect(() => prepareOperationsAlertMaintenance(development, "operations@example.invalid")).toThrow(/one existing/);
    expect(() => prepareOperationsAlertMaintenance({ ...fixture(), Transform: "Anything" }, "operations@example.invalid")).toThrow(/transforms/);
  });

  it("rejects conflicting ownership, policy changes, missing/duplicate subscriptions and dependent resources", () => {
    const original = fixture();
    const duplicatePolicy = { ...original, Resources: { ...original.Resources, OtherPolicy: original.Resources.OperationsPolicy } };
    expect(() => prepareOperationsAlertMaintenance(duplicatePolicy, "operations@example.invalid")).toThrow(/one existing operations-only/);
    const altered = fixture(); altered.Resources.OperationsPolicy.Properties.PolicyDocument.Statement[0]!.Action = "sns:*";
    expect(() => prepareOperationsAlertMaintenance(altered, "operations@example.invalid")).toThrow(/re-review/);
    const missing = fixture(); const missingResources = missing.Resources as Record<string, unknown>;
    delete missingResources.OperationsSubscription;
    expect(() => prepareOperationsAlertMaintenance(missing, "operations@example.invalid")).toThrow(/one managed subscription/);
    const duplicate = { ...original, Resources: { ...original.Resources, OtherSubscription: original.Resources.OperationsSubscription } };
    expect(() => prepareOperationsAlertMaintenance(duplicate, "operations@example.invalid")).toThrow(/one managed subscription/);
    const dependent = { ...original, Outputs: { Sub: { Value: { Ref: "OperationsSubscription" } } } };
    expect(() => prepareOperationsAlertMaintenance(dependent, "operations@example.invalid")).toThrow(/references a missing subscription/);
    const repaired = prepareOperationsAlertMaintenance(original, "operations@example.invalid").restore;
    expect(() => prepareOperationsAlertMaintenance(repaired, "operations@example.invalid")).toThrow(/re-review/);
  });
});
