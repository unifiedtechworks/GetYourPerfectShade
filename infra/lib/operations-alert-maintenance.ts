import { operationsAlarmPublishStatement } from "./operations-alarm-publishing";

type JsonObject = Record<string, unknown>;
interface Resource extends JsonObject { Type: string; Properties: JsonObject }
interface Template extends JsonObject { Resources: Record<string, Resource> }

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON CloudFormation object.");
  }
  return value as JsonObject;
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * OFFLINE preparation only: no AWS SDK, CLI, credentials, deployment, or notifications.
 * Preserve the deployed template, NOT a current synth containing gated Cognito changes.
 * A separately approved operator must revalidate identity, snapshots, and live missing subscriptions.
 */
export function prepareOperationsAlertMaintenance(input: unknown, approvedRecipient: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(approvedRecipient)) {
    throw new Error("An explicitly reviewed notification mailbox is required.");
  }
  const envelope = object(input);
  const body = envelope.TemplateBody ?? envelope;
  const original = object(typeof body === "string" ? JSON.parse(body) : body) as Template;
  const resources = object(original.Resources) as Record<string, Resource>;
  if (original.Transform) throw new Error("Templates with transforms require separate review.");

  function topic(name: string): string {
    const found = Object.entries(resources).filter(([, resource]) =>
      resource.Type === "AWS::SNS::Topic" && resource.Properties?.TopicName === name);
    if (found.length !== 1) throw new Error(`Expected one existing ${name} topic.`);
    return found[0]![0];
  }
  const operationsId = topic("perfect-shade-production-operational-alarms");
  const feedbackId = topic("perfect-shade-production-ses-feedback");
  const operationsRef = { Ref: operationsId };
  const subscriptionIds = [operationsId, feedbackId].map(topicId => {
    const found = Object.entries(resources).filter(([, resource]) =>
      resource.Type === "AWS::SNS::Subscription" && equal(resource.Properties?.TopicArn, { Ref: topicId }));
    if (found.length !== 1) throw new Error("Expected one managed subscription per existing topic.");
    const [id, resource] = found[0]!;
    if (resource.Properties.Protocol !== "email" || resource.Properties.Endpoint !== approvedRecipient) {
      throw new Error("Deployed subscription does not match the reviewed email recipient; stop.");
    }
    return id;
  });
  const policies = Object.entries(resources).filter(([, resource]) =>
    resource.Type === "AWS::SNS::TopicPolicy" &&
    Array.isArray(resource.Properties?.Topics) &&
    (resource.Properties.Topics as unknown[]).some(value => equal(value, operationsRef)));
  if (policies.length !== 1 || !equal(policies[0]![1].Properties.Topics, [operationsRef])) {
    throw new Error("Exactly one existing operations-only topic policy is required; do not add another owner.");
  }
  const [policyId, policy] = policies[0]!;
  const document = object(policy.Properties.PolicyDocument);
  const statements = document.Statement;
  if (!Array.isArray(statements) || statements.length !== 1 ||
    !equal(object(statements[0]).Principal, { Service: "events.amazonaws.com" }) ||
    object(statements[0]).Effect !== "Allow" || object(statements[0]).Action !== "sns:Publish" ||
    !equal(object(statements[0]).Resource, operationsRef)) {
    throw new Error("Operations policy differs from the reviewed EventBridge-only baseline; re-review it.");
  }

  const restore = JSON.parse(JSON.stringify(original)) as Template;
  const restoredDocument = object(restore.Resources[policyId]!.Properties.PolicyDocument);
  (restoredDocument.Statement as unknown[]).push(operationsAlarmPublishStatement(
    operationsRef,
    { Ref: "AWS::AccountId" },
    { "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, ":cloudwatch:us-west-2:",
      { Ref: "AWS::AccountId" }, ":alarm:perfect-shade-production-*"]] },
  ));
  const detach = JSON.parse(JSON.stringify(restore)) as Template;
  for (const id of subscriptionIds) delete detach.Resources[id];
  if (subscriptionIds.some(id => JSON.stringify(detach).includes(id))) {
    throw new Error("Another resource references a missing subscription; separate review is required.");
  }
  return {
    detach,
    restore,
    policyId,
    subscriptionIds,
    // Everything outside this allowlist must be byte-equivalent JSON in both stages.
    allowedResourceChanges: [policyId, ...subscriptionIds],
  };
}
