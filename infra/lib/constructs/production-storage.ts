import { Aws, Duration, RemovalPolicy } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import type { PerfectShadeProductionConfig } from "../production-config";

export class ProductionStorageConstruct extends Construct {
  readonly documentBucket: s3.Bucket;

  constructor(scope: Construct, id: string, config: PerfectShadeProductionConfig) {
    super(scope, id);
    this.documentBucket = new s3.Bucket(this, "DocumentBucket", {
      bucketName: `${config.resourcePrefix}-documents-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      publicReadAccess: false,
      autoDeleteObjects: false,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{
        id: "abort-incomplete-uploads",
        abortIncompleteMultipartUploadAfter: Duration.days(7),
      }],
    });
  }
}
