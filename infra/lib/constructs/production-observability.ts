import { Duration } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import type * as lambda from "aws-cdk-lib/aws-lambda";
import type * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import type * as rds from "aws-cdk-lib/aws-rds";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import { Construct } from "constructs";
import type { PerfectShadeProductionConfig } from "../production-config";

export interface ProductionObservabilityProps {
  readonly config: PerfectShadeProductionConfig;
  readonly api: apigwv2.HttpApi;
  readonly cluster: rds.DatabaseCluster;
  readonly functions: lambda.Function[];
}

export class ProductionObservabilityConstruct extends Construct {
  readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: ProductionObservabilityProps) {
    super(scope, id);
    const { config } = props;
    this.alarmTopic = new sns.Topic(this, "AlarmTopic", {
      topicName: `${config.resourcePrefix}-operational-alarms`,
      displayName: "Perfect Shade production operational alarms",
    });
    this.alarmTopic.addSubscription(
      new subscriptions.EmailSubscription(config.operationsNotificationEmail),
    );
    const alarmAction = new actions.SnsAction(this.alarmTopic);
    const attach = (alarm: cloudwatch.Alarm): cloudwatch.Alarm => {
      alarm.addAlarmAction(alarmAction);
      alarm.addOkAction(alarmAction);
      return alarm;
    };

    const dashboard = new cloudwatch.Dashboard(this, "Dashboard", {
      dashboardName: `${config.resourcePrefix}-operations`,
    });
    for (const fn of props.functions) {
      attach(new cloudwatch.Alarm(this, `${fn.node.id}ErrorAlarm`, {
        alarmName: `${fn.functionName}-errors`,
        metric: fn.metricErrors({ period: Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }));
      attach(new cloudwatch.Alarm(this, `${fn.node.id}ThrottleAlarm`, {
        alarmName: `${fn.functionName}-throttles`,
        metric: fn.metricThrottles({ period: Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }));
      dashboard.addWidgets(new cloudwatch.GraphWidget({
        title: `${fn.functionName} errors, throttles, and duration`,
        left: [fn.metricErrors(), fn.metricThrottles()],
        right: [fn.metricDuration()],
      }));
    }

    const apiErrors = new cloudwatch.Metric({
      namespace: "AWS/ApiGateway",
      metricName: "5xx",
      dimensionsMap: { ApiId: props.api.apiId },
      statistic: "Sum",
      period: Duration.minutes(5),
    });
    attach(new cloudwatch.Alarm(this, "ApiServerErrorAlarm", {
      alarmName: `${config.resourcePrefix}-api-5xx`,
      metric: apiErrors,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }));

    const acu = new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "ACUUtilization",
      dimensionsMap: { DBClusterIdentifier: props.cluster.clusterIdentifier },
      statistic: "Average",
      period: Duration.minutes(5),
    });
    attach(new cloudwatch.Alarm(this, "DatabaseCapacityAlarm", {
      alarmName: `${config.resourcePrefix}-aurora-capacity`,
      metric: acu,
      threshold: 85,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }));
    attach(new cloudwatch.Alarm(this, "DatabaseConnectionsAlarm", {
      alarmName: `${config.resourcePrefix}-aurora-connections`,
      metric: new cloudwatch.Metric({
        namespace: "AWS/RDS",
        metricName: "DatabaseConnections",
        dimensionsMap: { DBClusterIdentifier: props.cluster.clusterIdentifier },
        statistic: "Average",
        period: Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }));

    for (const [idSuffix, metricName, threshold] of [
      ["SesBounce", "Reputation.BounceRate", 0.05],
      ["SesComplaint", "Reputation.ComplaintRate", 0.001],
    ] as const) {
      attach(new cloudwatch.Alarm(this, `${idSuffix}Alarm`, {
        alarmName: `${config.resourcePrefix}-${idSuffix.toLowerCase()}`,
        metric: new cloudwatch.Metric({
          namespace: "AWS/SES",
          metricName,
          statistic: "Average",
          period: Duration.minutes(5),
        }),
        threshold,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }));
    }

    const appMetric = (
      metricName: string,
      dimensionsMap: Record<string, string>,
      statistic = "Sum",
    ) => new cloudwatch.Metric({
      namespace: "PerfectShade/Application",
      metricName,
      dimensionsMap,
      statistic,
      period: Duration.minutes(5),
    });
    for (const service of ["account", "estimate"] as const) {
      attach(new cloudwatch.Alarm(this, `${service}UnexpectedHandlerAlarm`, {
        alarmName: `${config.resourcePrefix}-${service}-unexpected-handler`,
        metric: appMetric("UnexpectedHandlerError", { Service: service }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }));
    }

    for (const documentType of ["docx", "pdf", "json"] as const) {
      const dimensions = {
        Service: "estimate",
        Operation: "generate_document",
        DocumentType: documentType,
      };
      attach(new cloudwatch.Alarm(this, `${documentType}GenerationFailureAlarm`, {
        alarmName: `${config.resourcePrefix}-${documentType}-generation-failure`,
        metric: appMetric("DocumentGenerationFailure", dimensions),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }));
      attach(new cloudwatch.Alarm(this, `${documentType}GenerationDurationAlarm`, {
        alarmName: `${config.resourcePrefix}-${documentType}-generation-duration`,
        metric: appMetric(
          "DocumentGenerationDurationMs",
          dimensions,
          "p95",
        ),
        threshold: 55_000,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }));
    }

    for (const [id, metricName, operation] of [
      ["IssueFailure", "IssueFailure", "issue_estimate"],
      ["RevisionFailure", "RevisionFailure", "create_revision"],
      ["DuplicateFailure", "DuplicateFailure", "duplicate_estimate"],
    ] as const) {
      attach(new cloudwatch.Alarm(this, `${id}Alarm`, {
        alarmName: `${config.resourcePrefix}-${metricName}`,
        metric: appMetric(metricName, {
          Service: "estimate",
          Operation: operation,
        }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }));
    }

    const stalePendingDocuments = appMetric("StalePendingDocumentCount", {
      Service: "estimate",
      Operation: "list_documents",
    }, "Maximum");
    attach(new cloudwatch.Alarm(this, "StalePendingDocumentAlarm", {
      alarmName: `${config.resourcePrefix}-stale-pending-documents`,
      metric: stalePendingDocuments,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }));

    dashboard.addWidgets(new cloudwatch.GraphWidget({
      title: "API, Aurora, and document workflow health",
      left: [apiErrors, stalePendingDocuments],
      right: [
        acu,
        appMetric("DocumentGenerationDurationMs", {
          Service: "estimate",
          Operation: "generate_document",
          DocumentType: "pdf",
        }, "p95"),
      ],
    }));

    new budgets.CfnBudget(this, "ProductionBudget", {
      budget: {
        budgetName: `${config.resourcePrefix}-monthly`,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: config.monthlyBudgetUsd, unit: "USD" },
        costFilters: { TagKeyValue: ["user:Project$PerfectShade"] },
      },
      notificationsWithSubscribers: [
        ...[50, 80, 100].map((threshold) => ({
          notification: {
            comparisonOperator: "GREATER_THAN",
            notificationType: "ACTUAL",
            threshold,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{
            address: config.budgetNotificationEmail!,
            subscriptionType: "EMAIL",
          }],
        })),
        ...[80, 100].map((threshold) => ({
          notification: {
            comparisonOperator: "GREATER_THAN",
            notificationType: "FORECASTED",
            threshold,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{
            address: config.budgetNotificationEmail!,
            subscriptionType: "EMAIL",
          }],
        })),
      ],
    });
  }
}
