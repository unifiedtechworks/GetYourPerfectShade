import { Aws, Duration, RemovalPolicy } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import type { PerfectShadeDevelopmentConfig } from "../config";

export interface IdentityConstructProps {
  readonly config: PerfectShadeDevelopmentConfig;
}

export class IdentityConstruct extends Construct {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly userPoolDomain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: IdentityConstructProps) {
    super(scope, id);

    const { config } = props;
    const email = config.sesFromEmail && config.sesVerifiedDomain
      ? cognito.UserPoolEmail.withSES({
          fromEmail: config.sesFromEmail,
          fromName: "Perfect Shade",
          replyTo: config.sesFromEmail,
          sesRegion: config.region,
          sesVerifiedDomain: config.sesVerifiedDomain,
        })
      : cognito.UserPoolEmail.withCognito();

    this.userPool = new cognito.UserPool(this, "StaffUserPool", {
      userPoolName: `${config.resourcePrefix}-staff`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      email,
      mfa: config.mfaMode === "optional" ? cognito.Mfa.OPTIONAL : cognito.Mfa.OFF,
      mfaSecondFactor: { otp: true, sms: false },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: true,
        requireUppercase: true,
        tempPasswordValidity: Duration.days(3),
      },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.userPoolDomain = this.userPool.addDomain("HostedDomain", {
      cognitoDomain: {
        domainPrefix: `${config.resourcePrefix}-${Aws.ACCOUNT_ID}`,
      },
    });

    this.userPoolClient = this.userPool.addClient("NextApplicationClient", {
      userPoolClientName: `${config.resourcePrefix}-nextjs`,
      generateSecret: false,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(7),
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: config.callbackUrls,
        logoutUrls: config.logoutUrls,
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });
  }
}
