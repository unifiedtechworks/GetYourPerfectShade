import {
  AssociateSoftwareTokenCommand,
  AuthFlowType,
  ChallengeNameType,
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  VerifySoftwareTokenCommand,
  VerifySoftwareTokenResponseType,
  type AuthenticationResultType,
} from "@aws-sdk/client-cognito-identity-provider";
import { getCognitoConfiguration } from "./config";

type CognitoClient = Readonly<{ send(command: unknown): Promise<unknown> }>;

let cachedClient: CognitoIdentityProviderClient | undefined;
let cachedRegion: string | undefined;

function configuredClient() {
  const configuration = getCognitoConfiguration();
  if (!configuration) return null;
  if (!cachedClient || cachedRegion !== configuration.region) {
    cachedClient = new CognitoIdentityProviderClient({ region: configuration.region });
    cachedRegion = configuration.region;
  }
  return createCognitoAuthService(cachedClient, configuration.clientId);
}

export type SignInResult =
  | { status: "authenticated"; tokens: AuthenticationResultType }
  | { status: "new-password-required"; username: string; session: string }
  | { status: "mfa-setup-required"; username: string; session: string }
  | { status: "mfa-code-required"; username: string; session: string }
  | { status: "unsupported-challenge" }
  | { status: "configuration-error" }
  | { status: "credentials-error" }
  | { status: "mfa-code-error" };

export type MfaSetupResult =
  | { status: "setup-ready"; secret: string; session: string }
  | { status: "configuration-error" }
  | { status: "setup-error" };

type AuthenticationResponse = Readonly<{
  AuthenticationResult?: AuthenticationResultType;
  ChallengeName?: ChallengeNameType;
  Session?: string;
}>;

export function authenticationResponse(
  response: AuthenticationResponse,
  username: string,
): SignInResult {
  if (response.AuthenticationResult) {
    return { status: "authenticated", tokens: response.AuthenticationResult };
  }
  if (!response.Session) return { status: "unsupported-challenge" };
  if (response.ChallengeName === ChallengeNameType.NEW_PASSWORD_REQUIRED) {
    return { status: "new-password-required", username, session: response.Session };
  }
  if (response.ChallengeName === ChallengeNameType.MFA_SETUP) {
    return { status: "mfa-setup-required", username, session: response.Session };
  }
  if (response.ChallengeName === ChallengeNameType.SOFTWARE_TOKEN_MFA) {
    return { status: "mfa-code-required", username, session: response.Session };
  }
  return { status: "unsupported-challenge" };
}

export function createCognitoAuthService(client: CognitoClient, clientId: string) {
  return {
    async authenticateWithPassword(email: string, password: string): Promise<SignInResult> {
      try {
        const response = await client.send(new InitiateAuthCommand({
          ClientId: clientId,
          AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
          AuthParameters: { USERNAME: email, PASSWORD: password },
        })) as AuthenticationResponse;
        return authenticationResponse(response, email);
      } catch {
        return { status: "credentials-error" };
      }
    },

    async completeNewPassword(
      username: string,
      session: string,
      password: string,
    ): Promise<SignInResult> {
      try {
        const response = await client.send(new RespondToAuthChallengeCommand({
          ClientId: clientId,
          ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
          Session: session,
          ChallengeResponses: { USERNAME: username, NEW_PASSWORD: password },
        })) as AuthenticationResponse;
        return authenticationResponse(response, username);
      } catch {
        return { status: "credentials-error" };
      }
    },

    async beginMfaSetup(session: string): Promise<MfaSetupResult> {
      try {
        const response = await client.send(new AssociateSoftwareTokenCommand({
          Session: session,
        })) as { SecretCode?: string; Session?: string };
        if (!response.SecretCode || !response.Session) return { status: "setup-error" };
        return {
          status: "setup-ready",
          secret: response.SecretCode,
          session: response.Session,
        };
      } catch {
        return { status: "setup-error" };
      }
    },

    async completeMfaSetup(
      username: string,
      session: string,
      code: string,
    ): Promise<SignInResult> {
      try {
        const verified = await client.send(new VerifySoftwareTokenCommand({
          Session: session,
          UserCode: code,
          FriendlyDeviceName: "Perfect Shade staff authenticator",
        })) as { Status?: VerifySoftwareTokenResponseType; Session?: string };
        if (
          verified.Status !== VerifySoftwareTokenResponseType.SUCCESS ||
          !verified.Session
        ) return { status: "mfa-code-error" };

        const response = await client.send(new RespondToAuthChallengeCommand({
          ClientId: clientId,
          ChallengeName: ChallengeNameType.MFA_SETUP,
          Session: verified.Session,
          ChallengeResponses: { USERNAME: username },
        })) as AuthenticationResponse;
        return authenticationResponse(response, username);
      } catch {
        return { status: "mfa-code-error" };
      }
    },

    async completeSoftwareMfa(
      username: string,
      session: string,
      code: string,
    ): Promise<SignInResult> {
      try {
        const response = await client.send(new RespondToAuthChallengeCommand({
          ClientId: clientId,
          ChallengeName: ChallengeNameType.SOFTWARE_TOKEN_MFA,
          Session: session,
          ChallengeResponses: {
            USERNAME: username,
            SOFTWARE_TOKEN_MFA_CODE: code,
          },
        })) as AuthenticationResponse;
        return authenticationResponse(response, username);
      } catch {
        return { status: "mfa-code-error" };
      }
    },

    async startPasswordRecovery(username: string) {
      try {
        await client.send(new ForgotPasswordCommand({ ClientId: clientId, Username: username }));
      } catch {
        // Always return the same result to avoid account enumeration.
      }
      return true;
    },

    async confirmPasswordRecovery(username: string, code: string, password: string) {
      try {
        await client.send(new ConfirmForgotPasswordCommand({
          ClientId: clientId,
          Username: username,
          ConfirmationCode: code,
          Password: password,
        }));
        return { status: "complete" as const };
      } catch {
        return { status: "recovery-error" as const };
      }
    },

    async revokeSession(accessToken: string | undefined) {
      if (!accessToken) return;
      try {
        await client.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
      } catch {
        // Local cookie removal still signs this browser out if Cognito is unavailable.
      }
    },

    async refreshSession(refreshToken: string) {
      try {
        const response = await client.send(new InitiateAuthCommand({
          ClientId: clientId,
          AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
          AuthParameters: { REFRESH_TOKEN: refreshToken },
        })) as { AuthenticationResult?: AuthenticationResultType };
        return response.AuthenticationResult ?? null;
      } catch {
        return null;
      }
    },
  };
}

export async function authenticateWithPassword(email: string, password: string) {
  return configuredClient()?.authenticateWithPassword(email, password) ??
    { status: "configuration-error" as const };
}

export async function completeNewPassword(username: string, session: string, password: string) {
  return configuredClient()?.completeNewPassword(username, session, password) ??
    { status: "configuration-error" as const };
}

export async function beginMfaSetup(session: string) {
  return configuredClient()?.beginMfaSetup(session) ??
    { status: "configuration-error" as const };
}

export async function completeMfaSetup(username: string, session: string, code: string) {
  return configuredClient()?.completeMfaSetup(username, session, code) ??
    { status: "configuration-error" as const };
}

export async function completeSoftwareMfa(username: string, session: string, code: string) {
  return configuredClient()?.completeSoftwareMfa(username, session, code) ??
    { status: "configuration-error" as const };
}

export async function startPasswordRecovery(username: string) {
  return configuredClient()?.startPasswordRecovery(username) ?? false;
}

export async function confirmPasswordRecovery(username: string, code: string, password: string) {
  return configuredClient()?.confirmPasswordRecovery(username, code, password) ??
    { status: "configuration-error" as const };
}

export async function revokeSession(accessToken: string | undefined) {
  return configuredClient()?.revokeSession(accessToken);
}

export async function refreshSession(refreshToken: string) {
  return configuredClient()?.refreshSession(refreshToken) ?? null;
}
