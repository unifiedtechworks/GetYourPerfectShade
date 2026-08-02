import { existsSync } from "node:fs";
import { join } from "node:path";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import type { PerfectShadeDevelopmentConfig } from "../lib/config";
import { PerfectShadeDevelopmentStack } from "../lib/perfect-shade-development-stack";

const baseConfig: PerfectShadeDevelopmentConfig = {
  environmentName: "development",
  region: "us-west-2",
  resourcePrefix: "perfect-shade-development",
  callbackUrls: ["http://localhost:3000/auth/callback"],
  logoutUrls: ["http://localhost:3000/sign-in"],
  allowedCorsOrigins: ["http://localhost:3000"],
  auroraEngineVersion: "16.6",
  auroraMinCapacity: 0,
  auroraMaxCapacity: 1,
  auroraAutoPauseMinutes: 15,
  mfaMode: "off",
  enableBudget: false,
  monthlyBudgetUsd: 50,
};

function templateFor(
  overrides: Partial<PerfectShadeDevelopmentConfig> = {},
): Template {
  const app = new App();
  const stack = new PerfectShadeDevelopmentStack(app, "TestStack", {
    config: { ...baseConfig, ...overrides },
    env: { account: "111111111111", region: "us-west-2" },
  });
  return Template.fromStack(stack);
}

describe("PerfectShadeDevelopmentStack", { timeout: 30_000 }, () => {
  it("defines a staff-only Cognito pool and public Next.js app client", () => {
    const template = templateFor();

    template.hasResourceProperties("AWS::Cognito::UserPool", {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      UsernameAttributes: ["email"],
      AutoVerifiedAttributes: ["email"],
      MfaConfiguration: "OFF",
      AccountRecoverySetting: {
        RecoveryMechanisms: [{ Name: "verified_email", Priority: 1 }],
      },
      Policies: {
        PasswordPolicy: Match.objectLike({ MinimumLength: 12 }),
      },
    });
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      GenerateSecret: false,
      PreventUserExistenceErrors: "ENABLED",
      EnableTokenRevocation: true,
      AllowedOAuthFlows: ["code"],
      CallbackURLs: ["http://localhost:3000/auth/callback"],
      LogoutURLs: ["http://localhost:3000/sign-in"],
    });
    template.resourceCountIs("AWS::Cognito::UserPoolDomain", 1);
  });

  it("defines private encrypted Aurora Serverless v2 with Data API and scale-to-zero", () => {
    const template = templateFor();

    template.hasResourceProperties("AWS::RDS::DBCluster", {
      Engine: "aurora-postgresql",
      EngineVersion: "16.6",
      EnableHttpEndpoint: true,
      StorageEncrypted: true,
      DeletionProtection: false,
      BackupRetentionPeriod: 1,
      ServerlessV2ScalingConfiguration: {
        MinCapacity: 0,
        MaxCapacity: 1,
        SecondsUntilAutoPause: 900,
      },
    });
    template.hasResourceProperties("AWS::RDS::DBInstance", {
      DBInstanceClass: "db.serverless",
      PubliclyAccessible: false,
    });
    template.resourceCountIs("AWS::EC2::NatGateway", 0);
  });

  it("defines a private encrypted versioned development document bucket", () => {
    const template = templateFor();

    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
        ],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      VersioningConfiguration: { Status: "Enabled" },
    });
  });

  it("protects all approved application API routes with the Cognito JWT authorizer", () => {
    const template = templateFor();

    template.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
    template.resourceCountIs("AWS::ApiGatewayV2::Authorizer", 1);
    template.resourceCountIs("AWS::ApiGatewayV2::Route", 3);
    template.allResourcesProperties("AWS::ApiGatewayV2::Route", {
      AuthorizationType: "JWT",
      AuthorizerId: Match.anyValue(),
    });
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "GET /v1/account",
    });
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "GET /v1/estimates",
    });
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "POST /v1/estimates/drafts",
    });
  });

  it("uses bundled application Lambdas with structured logging and least-privilege service grants", () => {
    const template = templateFor();

    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "perfect-shade-development-account",
      Runtime: "nodejs22.x",
      Architectures: ["arm64"],
      LoggingConfig: {
        ApplicationLogLevel: "INFO",
        LogFormat: "JSON",
        SystemLogLevel: "INFO",
      },
      Environment: {
        Variables: Match.objectLike({
          DATABASE_RUNTIME_ROLE: "perfect_shade_app_runtime",
        }),
      },
    });
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "perfect-shade-development-estimates",
      Runtime: "nodejs22.x",
      Architectures: ["arm64"],
      LoggingConfig: {
        ApplicationLogLevel: "INFO",
        LogFormat: "JSON",
        SystemLogLevel: "INFO",
      },
    });
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              "rds-data:BeginTransaction",
              "rds-data:CommitTransaction",
              "rds-data:ExecuteStatement",
              "rds-data:RollbackTransaction",
            ]),
            Effect: "Allow",
          }),
        ]),
      },
    });

    const policies = template.findResources("AWS::IAM::Policy");
    const estimatePolicy = Object.values(policies).find((policy) =>
      JSON.stringify(policy).includes("ApiEstimateFunctionServiceRole"),
    );
    expect(estimatePolicy).toBeDefined();
    expect(JSON.stringify(estimatePolicy)).toContain("s3:PutObject");
    expect(JSON.stringify(estimatePolicy)).not.toContain("s3:DeleteObject");
  });

  it("uses stable application-owned account and estimate entry points", () => {
    const repositoryRoot = join(__dirname, "../..");
    expect(existsSync(join(repositoryRoot, "backend/runtime/account-handler.ts"))).toBe(true);
    expect(existsSync(join(repositoryRoot, "backend/runtime/estimate-handler.ts"))).toBe(true);
    expect(existsSync(join(
      repositoryRoot,
      "infra/handlers/account-placeholder/index.js",
    ))).toBe(false);
    expect(existsSync(join(
      repositoryRoot,
      "infra/handlers/estimate-placeholder/index.js",
    ))).toBe(false);
  });

  it("does not create a budget or email subscription without explicit configuration", () => {
    templateFor().resourceCountIs("AWS::Budgets::Budget", 0);
  });

  it("creates configurable budget alerts only when explicitly enabled", () => {
    const template = templateFor({
      enableBudget: true,
      monthlyBudgetUsd: 75,
      budgetNotificationEmail: "budget-owner@example.invalid",
    });

    template.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: Match.objectLike({
        BudgetLimit: { Amount: 75, Unit: "USD" },
        BudgetType: "COST",
        TimeUnit: "MONTHLY",
      }),
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Subscribers: [
            {
              Address: "budget-owner@example.invalid",
              SubscriptionType: "EMAIL",
            },
          ],
        }),
      ]),
    });
  });

  it("publishes stable stack outputs and SSM application configuration", () => {
    const template = templateFor();

    for (const output of [
      "EnvironmentName",
      "AwsRegion",
      "ApiUrl",
      "CognitoUserPoolId",
      "CognitoUserPoolClientId",
      "CognitoHostedUiDomain",
      "CognitoIssuer",
      "AuroraClusterArn",
      "AuroraSecretArn",
      "AuroraDatabaseName",
      "DocumentBucketName",
      "SesSenderStatus",
      "BudgetStatus",
    ]) {
      template.hasOutput(output, {});
    }
    template.resourceCountIs("AWS::SSM::Parameter", 5);
  });
});
