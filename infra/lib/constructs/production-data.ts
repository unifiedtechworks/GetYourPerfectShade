import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import type { PerfectShadeProductionConfig } from "../production-config";

export class ProductionDataConstruct extends Construct {
  readonly vpc: ec2.Vpc;
  readonly cluster: rds.DatabaseCluster;
  readonly runtimeSecret: secretsmanager.Secret;
  readonly databaseName = "perfectshade";

  constructor(scope: Construct, id: string, config: PerfectShadeProductionConfig) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, "DatabaseVpc", {
      vpcName: `${config.resourcePrefix}-data`,
      ipAddresses: ec2.IpAddresses.cidr("10.43.0.0/20"),
      availabilityZones: ["us-west-2a", "us-west-2b"],
      natGateways: 0,
      subnetConfiguration: [{
        name: "isolated",
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        cidrMask: 24,
      }],
      restrictDefaultSecurityGroup: true,
    });

    const databaseSecurityGroup = new ec2.SecurityGroup(this, "DatabaseSecurityGroup", {
      vpc: this.vpc,
      securityGroupName: `${config.resourcePrefix}-aurora`,
      allowAllOutbound: false,
      description: "No-ingress security group for production Data API Aurora access",
    });

    this.cluster = new rds.DatabaseCluster(this, "Database", {
      clusterIdentifier: `${config.resourcePrefix}-aurora`,
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.of(config.auroraEngineVersion, "16"),
      }),
      writer: rds.ClusterInstance.serverlessV2("Writer", {
        publiclyAccessible: false,
        enablePerformanceInsights: true,
        performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
      }),
      credentials: rds.Credentials.fromGeneratedSecret("perfectshade_admin", {
        secretName: `${config.resourcePrefix}/aurora/admin`,
      }),
      defaultDatabaseName: this.databaseName,
      enableDataApi: true,
      serverlessV2MinCapacity: config.auroraMinCapacity,
      serverlessV2MaxCapacity: config.auroraMaxCapacity,
      storageEncrypted: true,
      backup: { retention: Duration.days(35) },
      deletionProtection: true,
      cloudwatchLogsExports: ["postgresql"],
      cloudwatchLogsRetention: logs.RetentionDays.THREE_MONTHS,
      securityGroups: [databaseSecurityGroup],
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      removalPolicy: RemovalPolicy.SNAPSHOT,
    });
    this.cluster.secret?.applyRemovalPolicy(RemovalPolicy.RETAIN);

    this.runtimeSecret = new secretsmanager.Secret(this, "RuntimeDatabaseSecret", {
      secretName: `${config.resourcePrefix}/aurora/runtime`,
      description: "Restricted Perfect Shade application database login; never used for migrations",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "perfect_shade_app_login" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 40,
      },
    });
    this.runtimeSecret.applyRemovalPolicy(RemovalPolicy.RETAIN);
  }
}
