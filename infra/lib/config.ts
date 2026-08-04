import type { App } from "aws-cdk-lib";

export type MfaMode = "off" | "optional";
export type EmailSenderMode = "cognito" | "ses";

export interface PerfectShadeDevelopmentConfig {
  readonly environmentName: "development";
  readonly region: "us-west-2";
  readonly resourcePrefix: string;
  readonly callbackUrls: string[];
  readonly logoutUrls: string[];
  readonly allowedCorsOrigins: string[];
  readonly auroraEngineVersion: string;
  readonly auroraMinCapacity: number;
  readonly auroraMaxCapacity: number;
  readonly auroraAutoPauseMinutes: number;
  readonly mfaMode: MfaMode;
  readonly emailSenderMode: EmailSenderMode;
  readonly sesFromEmail?: string;
  readonly sesVerifiedDomain?: string;
  readonly enableBudget: boolean;
  readonly monthlyBudgetUsd: number;
  readonly budgetNotificationEmail?: string;
}

function csv(value: unknown, fallback: string[]): string[] {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function loadDevelopmentConfig(app: App): PerfectShadeDevelopmentConfig {
  const environment = app.node.tryGetContext("perfectShadeEnvironment") ?? "development";
  if (environment !== "development") {
    throw new Error("This CDK application currently permits development infrastructure only.");
  }

  const mfaContext = app.node.tryGetContext("mfaMode") ?? "off";
  if (mfaContext !== "off" && mfaContext !== "optional") {
    throw new Error("mfaMode must be either 'off' or 'optional'.");
  }

  const emailSenderMode = app.node.tryGetContext("emailSenderMode") ?? "cognito";
  if (emailSenderMode !== "cognito" && emailSenderMode !== "ses") {
    throw new Error("emailSenderMode must be either 'cognito' or 'ses'.");
  }

  const sesFromEmail = optionalString(app.node.tryGetContext("sesFromEmail"));
  const sesVerifiedDomain = optionalString(app.node.tryGetContext("sesVerifiedDomain"));
  if (emailSenderMode === "ses" && (!sesFromEmail || !sesVerifiedDomain)) {
    throw new Error(
      "sesFromEmail and sesVerifiedDomain are required when emailSenderMode=ses.",
    );
  }

  const enableBudget = booleanValue(app.node.tryGetContext("enableBudget"), false);
  const budgetNotificationEmail = optionalString(
    app.node.tryGetContext("budgetNotificationEmail"),
  );
  if (enableBudget && !budgetNotificationEmail) {
    throw new Error(
      "budgetNotificationEmail is required when enableBudget=true.",
    );
  }

  return {
    environmentName: "development",
    region: "us-west-2",
    resourcePrefix: "perfect-shade-development",
    callbackUrls: csv(app.node.tryGetContext("callbackUrls"), [
      "http://localhost:3000/auth/callback",
    ]),
    logoutUrls: csv(app.node.tryGetContext("logoutUrls"), [
      "http://localhost:3000/sign-in",
    ]),
    allowedCorsOrigins: csv(app.node.tryGetContext("allowedCorsOrigins"), [
      "http://localhost:3000",
    ]),
    auroraEngineVersion: optionalString(app.node.tryGetContext("auroraEngineVersion")) ?? "16.14",
    auroraMinCapacity: numberValue(app.node.tryGetContext("auroraMinCapacity"), 0),
    auroraMaxCapacity: numberValue(app.node.tryGetContext("auroraMaxCapacity"), 1),
    auroraAutoPauseMinutes: numberValue(
      app.node.tryGetContext("auroraAutoPauseMinutes"),
      15,
    ),
    mfaMode: mfaContext,
    emailSenderMode,
    sesFromEmail,
    sesVerifiedDomain,
    enableBudget,
    monthlyBudgetUsd: numberValue(app.node.tryGetContext("monthlyBudgetUsd"), 50),
    budgetNotificationEmail,
  };
}
