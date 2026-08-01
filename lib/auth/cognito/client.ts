import {
  AuthFlowType,
  ChallengeNameType,
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  type AuthenticationResultType,
} from "@aws-sdk/client-cognito-identity-provider";
import { getCognitoConfiguration } from "./config";

let cachedClient: CognitoIdentityProviderClient | undefined;
let cachedRegion: string | undefined;

function configuredClient() {
  const configuration = getCognitoConfiguration();
  if (!configuration) return null;
  if (!cachedClient || cachedRegion !== configuration.region) {
    cachedClient = new CognitoIdentityProviderClient({ region: configuration.region });
    cachedRegion = configuration.region;
  }
  return { client: cachedClient, configuration };
}

export type SignInResult =
  | { status: "authenticated"; tokens: AuthenticationResultType }
  | { status: "new-password-required"; username: string; session: string }
  | { status: "unsupported-challenge" }
  | { status: "configuration-error" }
  | { status: "credentials-error" };

export async function authenticateWithPassword(email: string, password: string): Promise<SignInResult> {
  const configured = configuredClient();
  if (!configured) return { status: "configuration-error" };
  try {
    const response = await configured.client.send(new InitiateAuthCommand({
      ClientId: configured.configuration.clientId,
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }));
    if (response.AuthenticationResult) {
      return { status: "authenticated", tokens: response.AuthenticationResult };
    }
    if (
      response.ChallengeName === ChallengeNameType.NEW_PASSWORD_REQUIRED &&
      response.Session
    ) {
      return { status: "new-password-required", username: email, session: response.Session };
    }
    return { status: "unsupported-challenge" };
  } catch {
    return { status: "credentials-error" };
  }
}

export async function completeNewPassword(
  username: string,
  session: string,
  password: string,
): Promise<SignInResult> {
  const configured = configuredClient();
  if (!configured) return { status: "configuration-error" };
  try {
    const response = await configured.client.send(new RespondToAuthChallengeCommand({
      ClientId: configured.configuration.clientId,
      ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
      Session: session,
      ChallengeResponses: { USERNAME: username, NEW_PASSWORD: password },
    }));
    if (response.AuthenticationResult) {
      return { status: "authenticated", tokens: response.AuthenticationResult };
    }
    return { status: "unsupported-challenge" };
  } catch {
    return { status: "credentials-error" };
  }
}

export async function startPasswordRecovery(username: string) {
  const configured = configuredClient();
  if (!configured) return false;
  try {
    await configured.client.send(new ForgotPasswordCommand({
      ClientId: configured.configuration.clientId,
      Username: username,
    }));
  } catch {
    // Always return the same result to avoid account enumeration.
  }
  return true;
}

export async function confirmPasswordRecovery(username: string, code: string, password: string) {
  const configured = configuredClient();
  if (!configured) return { status: "configuration-error" as const };
  try {
    await configured.client.send(new ConfirmForgotPasswordCommand({
      ClientId: configured.configuration.clientId,
      Username: username,
      ConfirmationCode: code,
      Password: password,
    }));
    return { status: "complete" as const };
  } catch {
    return { status: "recovery-error" as const };
  }
}

export async function revokeSession(accessToken: string | undefined) {
  const configured = configuredClient();
  if (!configured || !accessToken) return;
  try {
    await configured.client.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
  } catch {
    // Local cookie removal still signs this browser out if Cognito is unavailable.
  }
}

export async function refreshSession(refreshToken: string) {
  const configured = configuredClient();
  if (!configured) return null;
  try {
    const response = await configured.client.send(new InitiateAuthCommand({
      ClientId: configured.configuration.clientId,
      AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }));
    return response.AuthenticationResult ?? null;
  } catch {
    return null;
  }
}
