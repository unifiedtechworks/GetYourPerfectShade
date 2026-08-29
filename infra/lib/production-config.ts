import type { App } from "aws-cdk-lib";
import type { PerfectShadeApplicationConfig } from "./config";

export interface PerfectShadeProductionConfig extends PerfectShadeApplicationConfig {
  readonly environmentName: "production";
  readonly operationsNotificationEmail: string;
  readonly sesSenderDomain: string;
  readonly cloudTrailDataEventsEnabled: boolean;
}

function requiredContext(app: App, key: string): string {
  const value = app.node.tryGetContext(key);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required for production synthesis.`);
  }
  return value.trim();
}

function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function loadProductionConfig(app: App): PerfectShadeProductionConfig {
  if (app.node.tryGetContext("confirmProductionSynthesis") !== "true") {
    throw new Error(
      "Production synthesis requires --context confirmProductionSynthesis=true; this does not authorize deployment.",
    );
  }

  const callbackUrls = csv(requiredContext(app, "callbackUrls"));
  const logoutUrls = csv(requiredContext(app, "logoutUrls"));
  const allowedCorsOrigins = csv(requiredContext(app, "allowedCorsOrigins"));
  const sesFromEmail = requiredContext(app, "sesFromEmail");
  const sesSenderDomain = requiredContext(app, "sesVerifiedDomain");
  const operationsNotificationEmail = requiredContext(
    app,
    "operationsNotificationEmail",
  );
  const budgetNotificationEmail = requiredContext(app, "budgetNotificationEmail");

  for (const [name, values] of [
    ["callbackUrls", callbackUrls],
    ["logoutUrls", logoutUrls],
    ["allowedCorsOrigins", allowedCorsOrigins],
  ] as const) {
    if (values.some((value) => value.includes("localhost") || value.includes("amplifyapp.com"))) {
      throw new Error(`${name} must contain production-only URLs.`);
    }
  }

  return {
    environmentName: "production",
    region: "us-west-2",
    resourcePrefix: "perfect-shade-production",
    callbackUrls,
    logoutUrls,
    allowedCorsOrigins,
    auroraEngineVersion: "16.14",
    auroraMinCapacity: 0.5,
    auroraMaxCapacity: 4,
    auroraAutoPauseMinutes: 0,
    mfaMode: "required",
    emailSenderMode: "ses",
    sesFromEmail,
    sesVerifiedDomain: sesSenderDomain,
    sesSenderDomain,
    enableBudget: true,
    monthlyBudgetUsd: 200,
    budgetNotificationEmail,
    operationsNotificationEmail,
    cloudTrailDataEventsEnabled:
      app.node.tryGetContext("cloudTrailDataEventsEnabled") === "true",
  };
}
