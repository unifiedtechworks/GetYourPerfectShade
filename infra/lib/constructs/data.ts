import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import type { PerfectShadeDevelopmentConfig } from "../config";

export interface DataConstructProps {
  readonly config: PerfectShadeDevelopmentConfig;
}

export class DataConstruct extends Construct {
  readonly vpc: ec2.Vpc;
  readonly cluster: rds.DatabaseCluster;
  readonly databaseName = "perfectshade";

  constructor(scope: Construct, id: string, props: DataConstructProps) {
    super(scope, id);

    const { config } = props;

    this.vpc = new ec2.Vpc(this, "DatabaseVpc", {
      vpcName: `${config.resourcePrefix}-data`,
      ipAddresses: ec2.IpAddresses.cidr("10.42.0.0/20"),
      availabilityZones: ["us-west-2a", "us-west-2b"],
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
      restrictDefaultSecurityGroup: true,
    });

    const databaseSecurityGroup = new ec2.SecurityGroup(this, "DatabaseSecurityGroup", {
      vpc: this.vpc,
      securityGroupName: `${config.resourcePrefix}-aurora`,
      allowAllOutbound: false,
      description: "No-ingress security group for Data API-only Aurora access",
    });

    this.cluster = new rds.DatabaseCluster(this, "Database", {
      clusterIdentifier: `${config.resourcePrefix}-aurora`,
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.of(config.auroraEngineVersion, "16"),
      }),
      writer: rds.ClusterInstance.serverlessV2("Writer", {
        publiclyAccessible: false,
        enablePerformanceInsights: false,
      }),
      credentials: rds.Credentials.fromGeneratedSecret("perfectshade_admin", {
        secretName: `${config.resourcePrefix}/aurora/admin`,
      }),
      defaultDatabaseName: this.databaseName,
      enableDataApi: true,
      serverlessV2MinCapacity: config.auroraMinCapacity,
      serverlessV2MaxCapacity: config.auroraMaxCapacity,
      serverlessV2AutoPauseDuration: Duration.minutes(config.auroraAutoPauseMinutes),
      storageEncrypted: true,
      backup: { retention: Duration.days(1) },
      deletionProtection: false,
      cloudwatchLogsExports: ["postgresql"],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_WEEK,
      securityGroups: [databaseSecurityGroup],
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.cluster.secret?.applyRemovalPolicy(RemovalPolicy.DESTROY);
  }
}
