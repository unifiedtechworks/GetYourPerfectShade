import { describe, expect, it } from "vitest";
import { prepareReplyToMaintenance, PREVIOUS_REPLY_TO, APPROVED_BUSINESS_EMAIL, templateHash } from "../lib/profile-email-reply-to-maintenance";

function fixture() {
  return { Parameters: { BootstrapVersion: { Type: "String", Default: "preserve" } },
    Outputs: { PoolId: { Value: { Ref: "IdentityStaffUserPoolF63BA8C7" } } },
    Resources: {
      IdentityStaffUserPoolF63BA8C7: { Type: "AWS::Cognito::UserPool", DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain",
        Properties: { UserPoolName: "perfect-shade-production-staff", MfaConfiguration: "ON", DeletionProtection: "ACTIVE",
          UserPoolTier: "ESSENTIALS", EnabledMfas: ["SOFTWARE_TOKEN_MFA", "EMAIL_OTP"],
          AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
          AccountRecoverySetting: { RecoveryMechanisms: [{ Name: "admin_only", Priority: 1 }] },
          Policies: { PasswordPolicy: { TemporaryPasswordValidityDays: 3, MinimumLength: 12 } },
          EmailConfiguration: { ReplyToEmailAddress: PREVIOUS_REPLY_TO, EmailSendingAccount: "DEVELOPER",
            From: "Perfect Shade <notifications@getyourperfectshade.com>",
            ConfigurationSet: { Ref: "TransactionalMailConfigurationSetD6E1AB28" },
            SourceArn: { "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, ":ses:us-west-2:",
              { Ref: "AWS::AccountId" }, ":identity/getyourperfectshade.com"]] } } } },
      PoolClient: { Type: "AWS::Cognito::UserPoolClient", Properties: { CallbackURLs: ["https://main.example.invalid/auth/callback"] } },
      Aurora: { Type: "AWS::RDS::DBCluster", Properties: { EngineVersion: "16.14", DeletionProtection: true } },
      SignatureLambda: { Type: "AWS::Lambda::Function", Properties: { Code: { S3Key: "unchanged" }, Environment: { Variables: { ESTIMATE_INCLUDE_COMPANY_SIGNATURE: "true" } } } },
      Feedback: { Type: "AWS::SNS::Topic", Properties: { TopicName: "preserve-feedback" } },
      Documents: { Type: "AWS::S3::Bucket", DeletionPolicy: "Retain", Properties: { BucketName: "preserve-private-bucket" } },
    } };
}

describe("offline one-property production Reply-To correction", () => {
  it("preserves the baseline and every property except Reply-To", () => {
    const original = fixture(), snapshot = JSON.stringify(original);
    const plan = prepareReplyToMaintenance({ TemplateBody: JSON.stringify(original) });
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(plan.logicalId).toBe("IdentityStaffUserPoolF63BA8C7");
    expect(plan.before).toBe(PREVIOUS_REPLY_TO); expect(plan.after).toBe(APPROVED_BUSINESS_EMAIL);
    expect(plan.originalSha256).toBe(templateHash(original));
    expect(plan.updatedSha256).not.toBe(plan.originalSha256);
    const expected = fixture();
    expected.Resources.IdentityStaffUserPoolF63BA8C7.Properties.EmailConfiguration.ReplyToEmailAddress = APPROVED_BUSINESS_EMAIL;
    expect(plan.updated).toEqual(expected);
    expect(plan.original).toEqual(original);
  });
  it("accepts semantic key/MFA ordering without changing the original order", () => {
    const original = fixture();
    original.Resources.IdentityStaffUserPoolF63BA8C7.Properties.EnabledMfas.reverse();
    original.Resources.IdentityStaffUserPoolF63BA8C7.Properties.AccountRecoverySetting.RecoveryMechanisms = [{ Priority: 1, Name: "admin_only" }];
    const plan = prepareReplyToMaintenance(original);
    expect(plan.original).toEqual(original);
  });
  it("rejects a changed pool, sender, mailbox, sending account, identity, configuration set, or MFA posture", () => {
    const changes = [
      (f: ReturnType<typeof fixture>) => { f.Resources.IdentityStaffUserPoolF63BA8C7.Type = "AWS::IAM::User"; },
      (f: ReturnType<typeof fixture>) => { f.Resources.IdentityStaffUserPoolF63BA8C7.Properties.UserPoolName = "perfect-shade-development-staff"; },
      (f: ReturnType<typeof fixture>) => { f.Resources.IdentityStaffUserPoolF63BA8C7.Properties.MfaConfiguration = "OFF"; },
      (f: ReturnType<typeof fixture>) => { f.Resources.IdentityStaffUserPoolF63BA8C7.Properties.EnabledMfas = ["SOFTWARE_TOKEN_MFA"]; },
      (f: ReturnType<typeof fixture>) => { f.Resources.IdentityStaffUserPoolF63BA8C7.Properties.UserPoolTier = "LITE"; },
      (f: ReturnType<typeof fixture>) => { f.Resources.IdentityStaffUserPoolF63BA8C7.Properties.DeletionProtection = "INACTIVE"; },
      (f: ReturnType<typeof fixture>) => { f.Resources.IdentityStaffUserPoolF63BA8C7.Properties.EmailConfiguration.ReplyToEmailAddress = APPROVED_BUSINESS_EMAIL; },
      (f: ReturnType<typeof fixture>) => { f.Resources.IdentityStaffUserPoolF63BA8C7.Properties.EmailConfiguration.From = "other@example.invalid"; },
      (f: ReturnType<typeof fixture>) => { f.Resources.IdentityStaffUserPoolF63BA8C7.Properties.EmailConfiguration.EmailSendingAccount = "COGNITO_DEFAULT"; },
      (f: ReturnType<typeof fixture>) => { f.Resources.IdentityStaffUserPoolF63BA8C7.Properties.EmailConfiguration.ConfigurationSet.Ref = "OtherConfigSet"; },
      (f: ReturnType<typeof fixture>) => { f.Resources.IdentityStaffUserPoolF63BA8C7.Properties.AdminCreateUserConfig.AllowAdminCreateUserOnly = false; },
      (f: ReturnType<typeof fixture>) => { f.Resources.IdentityStaffUserPoolF63BA8C7.Properties.AccountRecoverySetting.RecoveryMechanisms[0]!.Name = "verified_email"; },
    ];
    for (const change of changes) { const f = fixture(); change(f); expect(() => prepareReplyToMaintenance(f)).toThrow(); }
    expect(() => prepareReplyToMaintenance({ ...fixture(), Transform: "Anything" })).toThrow(/Transformed/);
  });
});
