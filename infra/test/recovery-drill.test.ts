import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { PerfectShadeRecoveryDrillStack } from "../lib/perfect-shade-recovery-drill-stack";
import { RECOVERY_ACCOUNT, RECOVERY_REGION, RECOVERY_POOL_ARN } from "../lib/recovery-access-config";
const config = { instanceArn: "arn:aws:sso:::instance/ssoins-1111111111111111", identityStoreId: "d-1111111111",
  runId: "20261010-test01", sesFromEmail: "notifications@getyourperfectshade.com", sesReplyToEmail: "reply@example.invalid" };
function template() { return Template.fromStack(new PerfectShadeRecoveryDrillStack(new App(), "Drill", { config, env: { account: RECOVERY_ACCOUNT, region: RECOVERY_REGION } })); }
describe("disposable recovery drill definition", { timeout: 30_000 }, () => {
  it("contains only an isolated pool/client/permission set, with no users or backend resources", () => {
    expect(Object.values(template().toJSON().Resources).map((r: any) => r.Type).sort()).toEqual([
      "AWS::Cognito::UserPool", "AWS::Cognito::UserPoolClient", "AWS::SSO::PermissionSet",
    ]);
    const text = JSON.stringify(template().toJSON());
    expect(text).not.toContain(RECOVERY_POOL_ARN);
    expect(text).not.toContain("us-west-2_m3pQO05z8");
  }, 30_000);
  it("preserves required email/TOTP MFA, staff-only password-first authentication, and admin-only recovery", () => {
    const t = template();
    t.hasResourceProperties("AWS::Cognito::UserPool", { MfaConfiguration: "ON", EnabledMfas: ["EMAIL_OTP", "SOFTWARE_TOKEN_MFA"],
      UserPoolTier: "ESSENTIALS", UsernameAttributes: ["email"], AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      AccountRecoverySetting: { RecoveryMechanisms: [{ Name: "admin_only", Priority: 1 }] } });
    t.hasResourceProperties("AWS::Cognito::UserPoolClient", { GenerateSecret: false,
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"] });
    const pool = Object.values(t.findResources("AWS::Cognito::UserPool"))[0]!;
    expect(pool.DeletionPolicy).toBe("Delete");
    expect(pool.Properties?.EmailConfiguration.ConfigurationSet).toBeUndefined();
  });
  it("scopes recovery permissions to the disposable pool, not any existing pool", () => {
    const ps = Object.values(template().findResources("AWS::SSO::PermissionSet"))[0]!;
    expect(ps.Properties?.SessionDuration).toBe("PT1H");
    expect(ps.Properties?.InlinePolicy.Statement[0].Resource).toEqual({ "Fn::GetAtt": [expect.any(String), "Arn"] });
  });
});
