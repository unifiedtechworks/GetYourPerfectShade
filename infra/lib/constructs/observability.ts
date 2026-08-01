import { Duration } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import type * as lambda from "aws-cdk-lib/aws-lambda";
import type * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import type * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";
import type { PerfectShadeDevelopmentConfig } from "../config";

export interface ObservabilityConstructProps {
  readonly config: PerfectShadeDevelopmentConfig;
  readonly api: apigwv2.HttpApi;
  readonly cluster: rds.DatabaseCluster;
  readonly functions: lambda.Function[];
}

export class ObservabilityConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ObservabilityConstructProps) {
    super(scope, id);

    const dashboard = new cloudwatch.Dashboard(this, "Dashboard", {
      dashboardName: `${props.config.resourcePrefix}-operations`,
    });

    for (const fn of props.functions) {
      new cloudwatch.Alarm(this, `${fn.node.id}ErrorAlarm`, {
        alarmName: `${fn.functionName}-errors`,
        metric: fn.metricErrors({ period: Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      dashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: `${fn.functionName} errors and duration`,
          left: [fn.metricErrors()],
          right: [fn.metricDuration()],
        }),
      );
    }

    const apiServerErrors = new cloudwatch.Metric({
      namespace: "AWS/ApiGateway",
      metricName: "5xx",
      dimensionsMap: { ApiId: props.api.apiId },
      statistic: "Sum",
      period: Duration.minutes(5),
    });
    new cloudwatch.Alarm(this, "ApiServerErrorAlarm", {
      alarmName: `${props.config.resourcePrefix}-api-5xx`,
      metric: apiServerErrors,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const acuUtilization = new cloudwatch.Metric({
      namespace: "AWS/RDS",
      metricName: "ACUUtilization",
      dimensionsMap: { DBClusterIdentifier: props.cluster.clusterIdentifier },
      statistic: "Average",
      period: Duration.minutes(5),
    });
    new cloudwatch.Alarm(this, "DatabaseCapacityAlarm", {
      alarmName: `${props.config.resourcePrefix}-aurora-capacity`,
      metric: acuUtilization,
      threshold: 90,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "API and Aurora health",
        left: [apiServerErrors],
        right: [acuUtilization],
      }),
    );

    if (props.config.enableBudget) {
      if (!props.config.budgetNotificationEmail) {
        throw new Error("budgetNotificationEmail is required when enableBudget=true.");
      }
      new budgets.CfnBudget(this, "DevelopmentBudget", {
        budget: {
          budgetName: `${props.config.resourcePrefix}-monthly`,
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: {
            amount: props.config.monthlyBudgetUsd,
            unit: "USD",
          },
          costFilters: {
            TagKeyValue: ["user:Project$PerfectShade"],
          },
        },
        notificationsWithSubscribers: [80, 100].map((threshold) => ({
          notification: {
            comparisonOperator: "GREATER_THAN",
            notificationType: "ACTUAL",
            threshold,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [
            {
              address: props.config.budgetNotificationEmail!,
              subscriptionType: "EMAIL",
            },
          ],
        })),
      });
    }
  }
}
