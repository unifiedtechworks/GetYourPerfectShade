import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { PerfectShadeProductionStack } from "../lib/perfect-shade-production-stack";
import {
  loadProductionConfig,
  type PerfectShadeProductionConfig,
} from "../lib/production-config";

const config: PerfectShadeProductionConfig = {
  environmentName: "production",
  region: "us-west-2",
  resourcePrefix: "perfect-shade-production",
  callbackUrls: ["https://www.getyourperfectshade.com/auth/callback"],
  logoutUrls: ["https://www.getyourperfectshade.com/sign-in"],
  allowedCorsOrigins: ["https://www.getyourperfectshade.com"],
  auroraEngineVersion: "16.14",
  auroraMinCapacity: 0.5,
  auroraMaxCapacity: 4,
  auroraAutoPauseMinutes: 0,
  mfaMode: "required",
  emailSenderMode: "ses",
  sesFromEmail: "no-reply@example.invalid",
  sesVerifiedDomain: "example.invalid",
  sesSenderDomain: "example.invalid",
  enableBudget: true,
  monthlyBudgetUsd: 200,
  budgetNotificationEmail: "budget@example.invalid",
  operationsNotificationEmail: "operations@example.invalid",
  cloudTrailDataEventsEnabled: false,
};

let cachedTemplate: Template | undefined;

function templateFor(): Template {
  if (cachedTemplate) return cachedTemplate;
  const app = new App();
  cachedTemplate = Template.fromStack(new PerfectShadeProductionStack(app, "TestProduction", {
    config,
    env: { account: "111111111111", region: "us-west-2" },
  }));
  return cachedTemplate;
}

describe("PerfectShadeProductionStack", { timeout: 120_000 }, () => {
  it("requires an explicit synth guard and rejects development URLs", () => {
    expect(() => loadProductionConfig(new App())).toThrow(/confirmProductionSynthesis/);
    expect(() => loadProductionConfig(new App({ context: {
      confirmProductionSynthesis: "true",
      callbackUrls: "http://localhost:3000/auth/callback",
      logoutUrls: "https://www.getyourperfectshade.com/sign-in",
      allowedCorsOrigins: "https://www.getyourperfectshade.com",
      sesFromEmail: "no-reply@example.invalid",
      sesVerifiedDomain: "example.invalid",
      operationsNotificationEmail: "operations@example.invalid",
      budgetNotificationEmail: "budget@example.invalid",
    } }))).toThrow(/production-only URLs/);
  });

  it("isolates production names, URLs, Cognito, and required TOTP MFA", () => {
    const template = templateFor();
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      UserPoolName: "perfect-shade-production-staff",
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      MfaConfiguration: "ON",
      EnabledMfas: ["SOFTWARE_TOKEN_MFA"],
      AutoVerifiedAttributes: ["email"],
      DeletionProtection: "ACTIVE",
    });
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      CallbackURLs: ["https://www.getyourperfectshade.com/auth/callback"],
      LogoutURLs: ["https://www.getyourperfectshade.com/sign-in"],
      GenerateSecret: false,
    });
    expect(JSON.stringify(template.toJSON())).not.toContain("localhost");
    expect(JSON.stringify(template.toJSON())).not.toContain("amplifyapp.com");
  });

  it("defines retained private Aurora 16.14 with PITR and separate runtime credentials", () => {
    const template = templateFor();
    template.hasResourceProperties("AWS::RDS::DBCluster", {
      DBClusterIdentifier: "perfect-shade-production-aurora",
      EngineVersion: "16.14",
      EnableHttpEndpoint: true,
      StorageEncrypted: true,
      DeletionProtection: true,
      BackupRetentionPeriod: 35,
      ServerlessV2ScalingConfiguration: { MinCapacity: 0.5, MaxCapacity: 4 },
    });
    const clusters = template.findResources("AWS::RDS::DBCluster");
    expect(JSON.stringify(clusters)).not.toContain("SecondsUntilAutoPause");
    template.hasResourceProperties("AWS::RDS::DBInstance", {
      DBInstanceClass: "db.serverless",
      PubliclyAccessible: false,
      EnablePerformanceInsights: true,
    });
    template.resourceCountIs("AWS::SecretsManager::Secret", 2);
    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      Name: "perfect-shade-production/aurora/runtime",
      GenerateSecretString: Match.objectLike({ GenerateStringKey: "password" }),
    });
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: { Variables: Match.objectLike({
        APP_ENVIRONMENT: "production",
        DATABASE_SECRET_ARN: Match.objectLike({ Ref: Match.stringLikeRegexp("RuntimeDatabaseSecret") }),
      }) },
    });
  });

  it("retains private versioned document and audit buckets", () => {
    const template = templateFor();
    template.resourceCountIs("AWS::S3::Bucket", 2);
    template.allResourcesProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      VersioningConfiguration: { Status: "Enabled" },
    });
    const buckets = template.findResources("AWS::S3::Bucket");
    for (const resource of Object.values(buckets)) {
      expect(resource.DeletionPolicy).toBe("Retain");
    }
  });

  it("wires protected routes, operational notifications, audit, and the production budget", () => {
    const template = templateFor();
    template.resourceCountIs("AWS::ApiGatewayV2::Route", 18);
    template.allResourcesProperties("AWS::ApiGatewayV2::Route", {
      AuthorizationType: "JWT",
      AuthorizerId: Match.anyValue(),
    });
    template.resourceCountIs("AWS::SNS::Topic", 1);
    template.resourceCountIs("AWS::SNS::Subscription", 1);
    template.hasResourceProperties("AWS::CloudTrail::Trail", {
      IsMultiRegionTrail: true,
      IncludeGlobalServiceEvents: true,
      EnableLogFileValidation: true,
    });
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      MetricName: "StalePendingDocuments",
      Namespace: "PerfectShade/Production",
      AlarmActions: Match.anyValue(),
    });
    template.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: Match.objectLike({
        BudgetLimit: { Amount: 200, Unit: "USD" },
        CostFilters: { TagKeyValue: ["user:Project$PerfectShade"] },
      }),
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({ Notification: Match.objectLike({ NotificationType: "FORECASTED" }) }),
      ]),
    });
  });

  it("publishes separate admin/runtime secret outputs and production application outputs", () => {
    const template = templateFor();
    for (const output of [
      "EnvironmentName",
      "ApiUrl",
      "CognitoUserPoolId",
      "AuroraAdminSecretArn",
      "AuroraRuntimeSecretArn",
      "DocumentBucketName",
      "OperationsAlarmTopicArn",
      "SesSenderDomain",
    ]) {
      template.hasOutput(output, {});
    }
  });
});
