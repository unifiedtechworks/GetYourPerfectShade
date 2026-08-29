import { Aws, RemovalPolicy } from "aws-cdk-lib";
import * as cloudtrail from "aws-cdk-lib/aws-cloudtrail";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import type { PerfectShadeProductionConfig } from "../production-config";

export class ProductionAuditConstruct extends Construct {
  readonly trail: cloudtrail.Trail;

  constructor(
    scope: Construct,
    id: string,
    config: PerfectShadeProductionConfig,
    documentBucket: s3.Bucket,
  ) {
    super(scope, id);
    const auditBucket = new s3.Bucket(this, "AuditBucket", {
      bucketName: `${config.resourcePrefix}-audit-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });
    this.trail = new cloudtrail.Trail(this, "ManagementTrail", {
      trailName: `${config.resourcePrefix}-management`,
      bucket: auditBucket,
      isMultiRegionTrail: true,
      includeGlobalServiceEvents: true,
      enableFileValidation: true,
      sendToCloudWatchLogs: true,
      cloudWatchLogsRetention: logs.RetentionDays.THREE_MONTHS,
    });
    if (config.cloudTrailDataEventsEnabled) {
      this.trail.addS3EventSelector([{ bucket: documentBucket }], {
        readWriteType: cloudtrail.ReadWriteType.ALL,
      });
    }
  }
}
