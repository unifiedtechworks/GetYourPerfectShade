import { existsSync } from "node:fs";
import { join } from "node:path";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import {
  loadDevelopmentConfig,
  type PerfectShadeDevelopmentConfig,
} from "../lib/config";
import { PerfectShadeDevelopmentStack } from "../lib/perfect-shade-development-stack";

const baseConfig: PerfectShadeDevelopmentConfig = {
  environmentName: "development",
  region: "us-west-2",
  resourcePrefix: "perfect-shade-development",
  callbackUrls: ["http://localhost:3000/auth/callback"],
  logoutUrls: ["http://localhost:3000/sign-in"],
  allowedCorsOrigins: ["http://localhost:3000"],
  auroraEngineVersion: "16.14",
  auroraMinCapacity: 0,
  auroraMaxCapacity: 1,
  auroraAutoPauseMinutes: 15,
  mfaMode: "off",
  emailSenderMode: "cognito",
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
  it("uses localhost-only deployment defaults and keeps hosted URLs configurable", () => {
    const config = loadDevelopmentConfig(new App());

    expect(config).toMatchObject({
      callbackUrls: ["http://localhost:3000/auth/callback"],
      logoutUrls: ["http://localhost:3000/sign-in"],
      allowedCorsOrigins: ["http://localhost:3000"],
      auroraEngineVersion: "16.14",
      emailSenderMode: "cognito",
      enableBudget: false,
    });
  });

  it("requires complete SES and budget configuration before enabling them", () => {
    expect(() => loadDevelopmentConfig(new App({
      context: { emailSenderMode: "ses" },
    }))).toThrow(/sesFromEmail and sesVerifiedDomain/);

    expect(() => loadDevelopmentConfig(new App({
      context: { enableBudget: true },
    }))).toThrow(/budgetNotificationEmail/);
  });

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
      EmailConfiguration: { EmailSendingAccount: "COGNITO_DEFAULT" },
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
      EngineVersion: "16.14",
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
      LifecycleConfiguration: {
        Rules: [Match.objectLike({
          Id: "abort-incomplete-uploads",
          Status: "Enabled",
        })],
      },
    });
    const buckets = template.findResources("AWS::S3::Bucket");
    expect(JSON.stringify(buckets)).not.toContain("NoncurrentVersionExpiration");
  });

  it("protects all approved application API routes with the Cognito JWT authorizer", () => {
    const template = templateFor();

    template.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
    template.resourceCountIs("AWS::ApiGatewayV2::Authorizer", 1);
    template.resourceCountIs("AWS::ApiGatewayV2::Route", 18);
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
    for (const routeKey of [
      "GET /v1/account/team",
      "POST /v1/account/team/invitations",
      "POST /v1/account/team/{membershipId}/role",
      "POST /v1/account/team/{membershipId}/disable",
      "POST /v1/account/team/{membershipId}/enable",
      "POST /v1/account/team/{membershipId}/remove",
      "POST /v1/account/profile",
    ]) {
      template.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: routeKey });
    }
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "GET /v1/estimates/{estimateId}",
    });
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "PUT /v1/estimates/{estimateId}",
    });
    for (const routeKey of [
      "POST /v1/estimates/{estimateId}/documents",
      "GET /v1/estimates/{estimateId}/documents",
      "GET /v1/estimates/{estimateId}/documents/{documentId}/download",
      "POST /v1/estimates/{estimateId}/issue",
      "POST /v1/estimates/{estimateId}/duplicate",
      "POST /v1/estimates/{estimateId}/revisions",
    ]) {
      template.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: routeKey });
    }
    template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      CorsConfiguration: Match.objectLike({
        AllowMethods: Match.arrayWith(["PUT"]),
      }),
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
          COGNITO_USER_POOL_ID: Match.anyValue(),
        }),
      },
    });
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "perfect-shade-development-estimates",
      Runtime: "nodejs22.x",
      Architectures: ["arm64"],
      MemorySize: 1024,
      Timeout: 60,
      EphemeralStorage: { Size: 1024 },
      Environment: {
        Variables: Match.objectLike({
          DOCUMENT_BUCKET_NAME: Match.anyValue(),
          DOCUMENT_KEY_PREFIX: "organizations/",
          ESTIMATE_INCLUDE_COMPANY_SIGNATURE: "false",
        }),
      },
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
    const serializedEstimatePolicy = JSON.stringify(estimatePolicy);
    expect(serializedEstimatePolicy).toContain("s3:GetObject");
    expect(serializedEstimatePolicy).toContain("s3:PutObject");
    expect(serializedEstimatePolicy).toContain("/organizations/*");
    expect(serializedEstimatePolicy).not.toContain("s3:ListBucket");
    expect(serializedEstimatePolicy).not.toContain("s3:DeleteObject");

    const accountPolicy = Object.values(policies).find((policy) =>
      JSON.stringify(policy).includes("ApiAccountFunctionServiceRole"),
    );
    expect(accountPolicy).toBeDefined();
    const serializedAccountPolicy = JSON.stringify(accountPolicy);
    expect(serializedAccountPolicy).toContain("cognito-idp:AdminCreateUser");
    expect(serializedAccountPolicy).toContain("cognito-idp:AdminGetUser");
    expect(serializedAccountPolicy).toContain("cognito-idp:ListUsers");
    expect(serializedAccountPolicy).not.toContain("cognito-idp:AdminDeleteUser");
    expect(serializedAccountPolicy).not.toContain("s3:");
  });

  it("alarms on Lambda throttles and slow estimate execution", () => {
    const template = templateFor();
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      MetricName: "Duration",
      Namespace: "AWS/Lambda",
      ExtendedStatistic: "p95",
      Threshold: 55000,
      EvaluationPeriods: 2,
    });
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      MetricName: "Throttles",
      Namespace: "AWS/Lambda",
      Threshold: 1,
    });
  });

  it("uses stable application-owned account and estimate entry points", () => {
    const repositoryRoot = join(__dirname, "../..");
    expect(existsSync(join(repositoryRoot, "backend/runtime/account-handler.ts"))).toBe(true);
    expect(existsSync(join(repositoryRoot, "backend/runtime/estimate-handler.ts"))).toBe(true);
    expect(existsSync(join(
      repositoryRoot,
      "backend/estimates/assets/sheri_signature.pssig",
    ))).toBe(true);
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
