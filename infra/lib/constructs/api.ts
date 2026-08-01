import * as path from "node:path";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import type * as rds from "aws-cdk-lib/aws-rds";
import type * as s3 from "aws-cdk-lib/aws-s3";
import type * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import type { PerfectShadeDevelopmentConfig } from "../config";

export interface ApiConstructProps {
  readonly config: PerfectShadeDevelopmentConfig;
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly cluster: rds.DatabaseCluster;
  readonly databaseName: string;
  readonly documentBucket: s3.Bucket;
}

export class ApiConstruct extends Construct {
  readonly api: apigwv2.HttpApi;
  readonly accountFunction: lambda.Function;
  readonly estimateFunction: lambda.Function;
  readonly accessLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    const commonEnvironment = {
      APP_ENVIRONMENT: props.config.environmentName,
      AWS_REGION_NAME: props.config.region,
      DATABASE_CLUSTER_ARN: props.cluster.clusterArn,
      DATABASE_SECRET_ARN: props.cluster.secret?.secretArn ?? "",
      DATABASE_NAME: props.databaseName,
      DOCUMENT_BUCKET_NAME: props.documentBucket.bucketName,
    };

    this.accountFunction = this.createPlaceholderFunction(
      "AccountFunction",
      `${props.config.resourcePrefix}-account`,
      "account-placeholder",
      commonEnvironment,
    );
    this.estimateFunction = this.createPlaceholderFunction(
      "EstimateFunction",
      `${props.config.resourcePrefix}-estimates`,
      "estimate-placeholder",
      commonEnvironment,
    );

    for (const fn of [this.accountFunction, this.estimateFunction]) {
      props.cluster.grantDataApiAccess(fn);
      props.cluster.secret?.grantRead(fn);
    }
    props.documentBucket.grantRead(this.estimateFunction);
    props.documentBucket.grantPut(this.estimateFunction);

    this.accessLogGroup = new logs.LogGroup(this, "ApiAccessLogs", {
      logGroupName: `/aws/apigateway/${props.config.resourcePrefix}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.api = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: `${props.config.resourcePrefix}-api`,
      description: "Perfect Shade development account and estimate API",
      corsPreflight: {
        allowCredentials: true,
        allowHeaders: ["authorization", "content-type", "idempotency-key"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: props.config.allowedCorsOrigins,
        maxAge: Duration.hours(1),
      },
      createDefaultStage: true,
    });

    const issuer = `https://cognito-idp.${Stack.of(this).region}.amazonaws.com/${props.userPool.userPoolId}`;
    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer("CognitoJwtAuthorizer", issuer, {
      authorizerName: `${props.config.resourcePrefix}-cognito-jwt`,
      jwtAudience: [props.userPoolClient.userPoolClientId],
    });

    this.api.addRoutes({
      path: "/v1/account",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        "AccountIntegration",
        this.accountFunction,
      ),
      authorizer: jwtAuthorizer,
    });
    this.api.addRoutes({
      path: "/v1/estimates",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        "ListEstimatesIntegration",
        this.estimateFunction,
      ),
      authorizer: jwtAuthorizer,
    });
    this.api.addRoutes({
      path: "/v1/estimates/drafts",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        "CreateEstimateDraftIntegration",
        this.estimateFunction,
      ),
      authorizer: jwtAuthorizer,
    });

    const defaultStage = this.api.defaultStage?.node.defaultChild as
      | apigwv2.CfnStage
      | undefined;
    if (!defaultStage) throw new Error("The HTTP API default stage was not created.");
    defaultStage.accessLogSettings = {
      destinationArn: this.accessLogGroup.logGroupArn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        routeKey: "$context.routeKey",
        status: "$context.status",
        responseLatency: "$context.responseLatency",
        integrationError: "$context.integrationErrorMessage",
      }),
    };
    this.accessLogGroup.grantWrite(new iam.ServicePrincipal("apigateway.amazonaws.com"));
  }

  private createPlaceholderFunction(
    id: string,
    functionName: string,
    handlerDirectory: string,
    environment: Record<string, string>,
  ): lambda.Function {
    const logGroup = new logs.LogGroup(this, `${id}Logs`, {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    return new lambda.Function(this, id, {
      functionName,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../handlers", handlerDirectory)),
      timeout: Duration.seconds(15),
      memorySize: 256,
      environment,
      loggingFormat: lambda.LoggingFormat.JSON,
      applicationLogLevelV2: lambda.ApplicationLogLevel.INFO,
      systemLogLevelV2: lambda.SystemLogLevel.INFO,
      logGroup,
    });
  }
}
