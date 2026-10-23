import { createHash } from "node:crypto";

type Json = Record<string, unknown>;
const poolId = "IdentityStaffUserPoolF63BA8C7";
export const APPROVED_BUSINESS_EMAIL = "ps.perfectshade@gmail.com";
export const PREVIOUS_REPLY_TO = "ps.getyourperfectshade@gmail.com";
const canonical = (value: unknown): string => JSON.stringify(value, (_, v: unknown) => v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v as Json).sort(([a], [b]) => a.localeCompare(b))) : v);
const object = (value: unknown): Json => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected JSON object.");
  return value as Json;
};
export const templateHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value, null, 2) + "\n").digest("hex");

/** Offline only: baseline MUST be the deployed get-template result, never a fresh CDK synth. */
export function prepareReplyToMaintenance(input: unknown) {
  const envelope = object(input), body = envelope.TemplateBody ?? envelope;
  const original = object(typeof body === "string" ? JSON.parse(body) : body);
  if (original.Transform) throw new Error("Transformed templates require separate review.");
  const resources = object(original.Resources);
  const pool = object(resources[poolId]);
  if (pool.Type !== "AWS::Cognito::UserPool" || pool.Condition) throw new Error("Unexpected production pool resource.");
  const properties = object(pool.Properties), email = object(properties.EmailConfiguration);
  const sourceArn = { "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, ":ses:us-west-2:",
    { Ref: "AWS::AccountId" }, ":identity/getyourperfectshade.com"]] };
  if (properties.UserPoolName !== "perfect-shade-production-staff" || properties.MfaConfiguration !== "ON" ||
      properties.DeletionProtection !== "ACTIVE" || pool.DeletionPolicy !== "Retain" ||
      pool.UpdateReplacePolicy !== "Retain" ||
      !Array.isArray(properties.EnabledMfas) || canonical([...properties.EnabledMfas].sort()) !== canonical(["EMAIL_OTP", "SOFTWARE_TOKEN_MFA"]) ||
      properties.UserPoolTier !== "ESSENTIALS" ||
      object(properties.AdminCreateUserConfig).AllowAdminCreateUserOnly !== true ||
      canonical(properties.AccountRecoverySetting) !== canonical({ RecoveryMechanisms: [{ Name: "admin_only", Priority: 1 }] }) ||
      email.ReplyToEmailAddress !== PREVIOUS_REPLY_TO || email.From !== "Perfect Shade <notifications@getyourperfectshade.com>" ||
      email.EmailSendingAccount !== "DEVELOPER" ||
      canonical(email.ConfigurationSet) !== canonical({ Ref: "TransactionalMailConfigurationSetD6E1AB28" }) ||
      canonical(email.SourceArn) !== canonical(sourceArn)) {
    throw new Error("Production email/MFA baseline differs; stop for live state review.");
  }
  const updated = JSON.parse(JSON.stringify(original)) as Json;
  const changedProperties = object(object(object(updated.Resources)[poolId]).Properties);
  object(changedProperties.EmailConfiguration).ReplyToEmailAddress = APPROVED_BUSINESS_EMAIL;
  // Prove there is exactly one leaf difference, including all top-level stack template settings.
  const reverse = JSON.parse(JSON.stringify(updated)) as Json;
  object(object(object(object(reverse.Resources)[poolId]).Properties).EmailConfiguration).ReplyToEmailAddress = PREVIOUS_REPLY_TO;
  if (JSON.stringify(reverse) !== JSON.stringify(original)) throw new Error("Unexpected template change.");
  return { original, updated, logicalId: poolId,
    propertyPath: `Resources.${poolId}.Properties.EmailConfiguration.ReplyToEmailAddress`,
    before: PREVIOUS_REPLY_TO, after: APPROVED_BUSINESS_EMAIL,
    originalSha256: templateHash(original), updatedSha256: templateHash(updated) };
}
