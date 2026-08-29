import {
  CfnOutput,
  Stack,
  Tags,
  type StackProps,
} from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import type { PerfectShadeDevelopmentConfig } from "./config";
import { ApiConstruct } from "./constructs/api";
import { DataConstruct } from "./constructs/data";
import { IdentityConstruct } from "./constructs/identity";
import { ObservabilityConstruct } from "./constructs/observability";
import { RuntimeDatabaseCredentialsConstruct } from "./constructs/runtime-database-credentials";
import { StorageConstruct } from "./constructs/storage";

export interface PerfectShadeDevelopmentStackProps extends StackProps {
  readonly config: PerfectShadeDevelopmentConfig;
}

export class PerfectShadeDevelopmentStack extends Stack {
  constructor(scope: Construct, id: string, props: PerfectShadeDevelopmentStackProps) {
    super(scope, id, props);

    const { config } = props;
    if (config.region !== "us-west-2" || config.environmentName !== "development") {
      throw new Error("Only the approved us-west-2 development environment is supported.");
    }
    if (config.auroraMinCapacity < 0 || config.auroraMaxCapacity <= 0.5) {
      throw new Error("Aurora capacity must use a nonnegative minimum and maximum above 0.5 ACU.");
    }
    if (config.auroraMinCapacity >= config.auroraMaxCapacity) {
      throw new Error("Aurora maximum capacity must be greater than its minimum capacity.");
    }
    if (config.auroraAutoPauseMinutes < 5 || config.auroraAutoPauseMinutes > 1440) {
      throw new Error("Aurora auto-pause must be between 5 minutes and 1 day.");
    }

    const identity = new IdentityConstruct(this, "Identity", { config });
    const data = new DataConstruct(this, "Data", { config });
    const storage = new StorageConstruct(this, "Storage", { config });
    if (!data.cluster.secret) {
      throw new Error("Aurora administrative credentials were not created.");
    }
    const runtimeCredentials = new RuntimeDatabaseCredentialsConstruct(
      this,
      "RuntimeDatabaseCredentials",
      {
        config,
        cluster: data.cluster,
        databaseName: data.databaseName,
        adminSecret: data.cluster.secret,
      },
    );
    const api = new ApiConstruct(this, "Api", {
      config,
      userPool: identity.userPool,
      userPoolClient: identity.userPoolClient,
      cluster: data.cluster,
      databaseName: data.databaseName,
      databaseRuntimeSecret: runtimeCredentials.runtimeSecret,
      documentBucket: storage.documentBucket,
    });
    api.accountFunction.node.addDependency(runtimeCredentials.resource);
    api.estimateFunction.node.addDependency(runtimeCredentials.resource);
    new ObservabilityConstruct(this, "Observability", {
      config,
      api: api.api,
      cluster: data.cluster,
      functions: [api.accountFunction, api.estimateFunction],
    });

    const parameterPrefix = `/perfect-shade/${config.environmentName}`;
    new ssm.StringParameter(this, "RegionParameter", {
      parameterName: `${parameterPrefix}/region`,
      stringValue: config.region,
    });
    new ssm.StringParameter(this, "ApiUrlParameter", {
      parameterName: `${parameterPrefix}/api-url`,
      stringValue: api.api.apiEndpoint,
    });
    new ssm.StringParameter(this, "UserPoolIdParameter", {
      parameterName: `${parameterPrefix}/cognito/user-pool-id`,
      stringValue: identity.userPool.userPoolId,
    });
    new ssm.StringParameter(this, "UserPoolClientIdParameter", {
      parameterName: `${parameterPrefix}/cognito/user-pool-client-id`,
      stringValue: identity.userPoolClient.userPoolClientId,
    });
    new ssm.StringParameter(this, "CognitoDomainParameter", {
      parameterName: `${parameterPrefix}/cognito/hosted-domain`,
      stringValue: identity.userPoolDomain.domainName,
    });

    this.output("EnvironmentName", config.environmentName);
    this.output("AwsRegion", config.region);
    this.output("ApiUrl", api.api.apiEndpoint);
    this.output("CognitoUserPoolId", identity.userPool.userPoolId);
    this.output("CognitoUserPoolClientId", identity.userPoolClient.userPoolClientId);
    this.output("CognitoHostedUiDomain", identity.userPoolDomain.domainName);
    this.output(
      "CognitoIssuer",
      `https://cognito-idp.${config.region}.amazonaws.com/${identity.userPool.userPoolId}`,
    );
    this.output("AuroraClusterArn", data.cluster.clusterArn);
    this.output("AuroraSecretArn", data.cluster.secret?.secretArn ?? "not-created");
    this.output("AuroraAdminSecretArn", data.cluster.secret.secretArn);
    this.output("AuroraRuntimeSecretArn", runtimeCredentials.runtimeSecret.secretArn);
    this.output("AuroraDatabaseName", data.databaseName);
    this.output("DocumentBucketName", storage.documentBucket.bucketName);
    this.output(
      "SesSenderStatus",
      config.emailSenderMode === "ses"
        ? "configured-from-context"
        : "cognito-default-development-sender",
    );
    this.output("BudgetStatus", config.enableBudget ? "enabled" : "disabled-pending-approval");

    Tags.of(this).add("Project", "PerfectShade");
    Tags.of(this).add("ManagedBy", "CDK");
    Tags.of(this).add("Environment", "development");
    Tags.of(this).add("Owner", "UnifiedTechworks");
    Tags.of(this).add("DataClassification", "synthetic");
  }

  private output(id: string, value: string): void {
    new CfnOutput(this, id, { value });
  }
}
