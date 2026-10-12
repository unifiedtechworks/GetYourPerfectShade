import { PRODUCTION_RECOVERY_ACTIONS } from "./constructs/production-recovery-operator";
import { EMERGENCY_USER_ARN, EMERGENCY_ROLE_ARN, RECOVERY_POOL_ARN, RECOVERY_ACCOUNT, RECOVERY_REGION } from "./recovery-access-config";

export const emergencyTrust = (principal: unknown = EMERGENCY_USER_ARN) => ({
  Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { AWS: principal }, Action: "sts:AssumeRole",
    Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" }, NumericLessThanEquals: { "aws:MultiFactorAuthAge": "900" } } }],
});
export const emergencyUserPolicy = (roleArn: unknown = EMERGENCY_ROLE_ARN, consoleCliLogin = false) => ({
  Version: "2012-10-17", Statement: [
    { Effect: "Allow", Action: "sts:AssumeRole", Resource: roleArn,
      Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" }, NumericLessThanEquals: { "aws:MultiFactorAuthAge": "900" } } },
    ...(consoleCliLogin ? [{ Effect: "Allow", Action: ["signin:AuthorizeOAuth2Access", "signin:CreateOAuth2Token"],
      Resource: `arn:aws:signin:${RECOVERY_REGION}:${RECOVERY_ACCOUNT}:oauth2/public-client/localhost` }] : []),
  ],
});
export const emergencyRolePolicy = (poolArn: unknown = RECOVERY_POOL_ARN) => ({
  Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: [...PRODUCTION_RECOVERY_ACTIONS], Resource: poolArn }],
});
