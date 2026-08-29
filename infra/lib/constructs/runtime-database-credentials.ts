import * as path from "node:path";
import {
  CustomResource,
  Duration,
  RemovalPolicy,
} from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import type * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as customResources from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import type { PerfectShadeApplicationConfig } from "../config";

export interface RuntimeDatabaseCredentialsConstructProps {
  readonly config: PerfectShadeApplicationConfig;
  readonly cluster: rds.DatabaseCluster;
  readonly databaseName: string;
  readonly adminSecret: secretsmanager.ISecret;
}

export class RuntimeDatabaseCredentialsConstruct extends Construct {
  readonly resource: CustomResource;
  readonly runtimeSecret: secretsmanager.Secret;

  constructor(
    scope: Construct,
    id: string,
    props: RuntimeDatabaseCredentialsConstructProps,
  ) {
    super(scope, id);

    const production = props.config.environmentName === "production";
    const removalPolicy = production
      ? RemovalPolicy.RETAIN
      : RemovalPolicy.DESTROY;
    this.runtimeSecret = new secretsmanager.Secret(
      this,
      "RuntimeDatabaseSecret",
      {
        secretName: `${props.config.resourcePrefix}/aurora/runtime`,
        description:
          "Restricted Perfect Shade application runtime database login; never used for migrations",
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            username: "perfect_shade_app_runtime",
          }),
          generateStringKey: "password",
          passwordLength: 40,
          excludePunctuation: true,
        },
      },
    );
    this.runtimeSecret.applyRemovalPolicy(removalPolicy);

    const functionName = `${props.config.resourcePrefix}-runtime-db-credentials`;
    const logGroup = new logs.LogGroup(this, "ProvisionerLogs", {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: production
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
      removalPolicy,
    });
    const projectRoot = path.join(__dirname, "../../..");
    const provisioner = new lambdaNodejs.NodejsFunction(this, "Provisioner", {
      functionName,
      entry: path.join(
        projectRoot,
        "backend/admin/runtime-database-credentials.ts",
      ),
      depsLockFilePath: path.join(projectRoot, "pnpm-lock.yaml"),
      projectRoot,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "handler",
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        DATABASE_CLUSTER_ARN: props.cluster.clusterArn,
        DATABASE_ADMIN_SECRET_ARN: props.adminSecret.secretArn,
        DATABASE_RUNTIME_SECRET_ARN: this.runtimeSecret.secretArn,
        DATABASE_NAME: props.databaseName,
      },
      bundling: {
        target: "node22",
        minify: false,
        sourceMap: true,
        externalModules: [],
      },
      loggingFormat: lambda.LoggingFormat.JSON,
      applicationLogLevelV2: lambda.ApplicationLogLevel.INFO,
      systemLogLevelV2: lambda.SystemLogLevel.INFO,
      logGroup,
    });
    provisioner.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "rds-data:BeginTransaction",
        "rds-data:CommitTransaction",
        "rds-data:ExecuteStatement",
        "rds-data:RollbackTransaction",
      ],
      resources: [props.cluster.clusterArn],
    }));
    props.adminSecret.grantRead(provisioner);
    this.runtimeSecret.grantRead(provisioner);

    const provider = new customResources.Provider(this, "Provider", {
      onEventHandler: provisioner,
    });
    this.resource = new CustomResource(this, "Resource", {
      serviceToken: provider.serviceToken,
      resourceType: "Custom::PerfectShadeRuntimeDatabaseCredentials",
      properties: {
        ProvisionerVersion: "1",
      },
    });
  }
}
