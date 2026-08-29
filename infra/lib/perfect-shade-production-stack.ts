import { CfnOutput, Stack, Tags, type StackProps } from "aws-cdk-lib";
import * as ses from "aws-cdk-lib/aws-ses";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { ApiConstruct } from "./constructs/api";
import { IdentityConstruct } from "./constructs/identity";
import { ProductionAuditConstruct } from "./constructs/production-audit";
import { ProductionDataConstruct } from "./constructs/production-data";
import { ProductionObservabilityConstruct } from "./constructs/production-observability";
import { ProductionStorageConstruct } from "./constructs/production-storage";
import type { PerfectShadeProductionConfig } from "./production-config";

export interface PerfectShadeProductionStackProps extends StackProps {
  readonly config: PerfectShadeProductionConfig;
}

export class PerfectShadeProductionStack extends Stack {
  constructor(scope: Construct, id: string, props: PerfectShadeProductionStackProps) {
    super(scope, id, props);
    const { config } = props;
    if (config.environmentName !== "production" || config.region !== "us-west-2") {
      throw new Error("PerfectShadeProduction supports only the approved us-west-2 production design.");
    }
    if (config.auroraMinCapacity !== 0.5 || config.auroraMaxCapacity !== 4) {
      throw new Error("Production Aurora must initially use the approved 0.5-4 ACU range.");
    }
    if (config.mfaMode !== "required" || config.emailSenderMode !== "ses") {
      throw new Error("Production requires TOTP MFA and the approved SES sender configuration.");
    }

    const senderIdentity = new ses.EmailIdentity(this, "SenderIdentity", {
      identity: ses.Identity.domain(config.sesSenderDomain),
    });
    const identity = new IdentityConstruct(this, "Identity", { config });
    identity.userPool.node.addDependency(senderIdentity);
    const data = new ProductionDataConstruct(this, "Data", config);
    const storage = new ProductionStorageConstruct(this, "Storage", config);
    const api = new ApiConstruct(this, "Api", {
      config,
      userPool: identity.userPool,
      userPoolClient: identity.userPoolClient,
      cluster: data.cluster,
      databaseName: data.databaseName,
      documentBucket: storage.documentBucket,
      databaseRuntimeSecret: data.runtimeSecret,
    });
    const observability = new ProductionObservabilityConstruct(this, "Observability", {
      config,
      api: api.api,
      cluster: data.cluster,
      functions: [api.accountFunction, api.estimateFunction],
    });
    new ProductionAuditConstruct(
      this,
      "Audit",
      config,
      storage.documentBucket,
    );

    const parameterPrefix = "/perfect-shade/production";
    for (const [id, suffix, value] of [
      ["RegionParameter", "region", config.region],
      ["ApiUrlParameter", "api-url", api.api.apiEndpoint],
      ["UserPoolIdParameter", "cognito/user-pool-id", identity.userPool.userPoolId],
      ["UserPoolClientIdParameter", "cognito/user-pool-client-id", identity.userPoolClient.userPoolClientId],
      ["CognitoDomainParameter", "cognito/hosted-domain", identity.userPoolDomain.domainName],
    ] as const) {
      new ssm.StringParameter(this, id, {
        parameterName: `${parameterPrefix}/${suffix}`,
        stringValue: value,
      });
    }

    this.output("EnvironmentName", "production");
    this.output("AwsRegion", config.region);
    this.output("ApiUrl", api.api.apiEndpoint);
    this.output("CognitoUserPoolId", identity.userPool.userPoolId);
    this.output("CognitoUserPoolClientId", identity.userPoolClient.userPoolClientId);
    this.output("CognitoHostedUiDomain", identity.userPoolDomain.domainName);
    this.output("CognitoIssuer", `https://cognito-idp.${config.region}.amazonaws.com/${identity.userPool.userPoolId}`);
    this.output("AuroraClusterArn", data.cluster.clusterArn);
    this.output("AuroraAdminSecretArn", data.cluster.secret?.secretArn ?? "not-created");
    this.output("AuroraRuntimeSecretArn", data.runtimeSecret.secretArn);
    this.output("AuroraDatabaseName", data.databaseName);
    this.output("DocumentBucketName", storage.documentBucket.bucketName);
    this.output("OperationsAlarmTopicArn", observability.alarmTopic.topicArn);
    this.output("SesSenderDomain", config.sesSenderDomain);
    this.output("BudgetStatus", "configured-on-production-deploy");

    Tags.of(this).add("Project", "PerfectShade");
    Tags.of(this).add("ManagedBy", "CDK");
    Tags.of(this).add("Environment", "production");
    Tags.of(this).add("Owner", "UnifiedTechworks");
    Tags.of(this).add("DataClassification", "confidential");
  }

  private output(id: string, value: string): void {
    new CfnOutput(this, id, { value });
  }
}
