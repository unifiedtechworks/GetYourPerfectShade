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

  for (const [name, values, expected] of [
    [
      "callbackUrls",
      callbackUrls,
      "https://www.getyourperfectshade.com/auth/callback",
    ],
    [
      "logoutUrls",
      logoutUrls,
      "https://www.getyourperfectshade.com/sign-in",
    ],
    [
      "allowedCorsOrigins",
      allowedCorsOrigins,
      "https://www.getyourperfectshade.com",
    ],
  ] as const) {
    if (values.length !== 1 || values[0] !== expected) {
      throw new Error(`${name} must contain the exact canonical production URL.`);
    }
  }
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sesFromEmail) ||
    sesFromEmail.toLowerCase().split("@")[1] !== sesSenderDomain.toLowerCase()
  ) {
    throw new Error("sesFromEmail must belong to the verified SES domain.");
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
