# Account Architecture

The authoritative backend decision is [`aws-backend-architecture.md`](./aws-backend-architecture.md).
This document describes the application-side Cognito implementation.

## Account and identity model

Perfect Shade uses internal staff accounts only. Amazon Cognito User Pools authenticates staff;
public self-registration and customer-facing login are excluded. Administrators provision users,
and an administrator-created user completes Cognito's `NEW_PASSWORD_REQUIRED` challenge before
receiving an application session.

Cognito `sub` is the immutable actor identity. Cognito groups are not application roles. The AWS
account API resolves the actor's active database membership and returns one of:

- `owner`: full organization and membership control.
- `admin`: staff and business-record management, but no owner removal, demotion, replacement, or
  ownership transfer.
- `staff`: operational business-record access without membership administration or
  organization-level destructive actions.

The API and Aurora policies—not UI values or Cognito groups—must prevent privilege escalation.
Customer-facing identities remain intentionally excluded.

## Session design

Server actions call Cognito using the AWS SDK's public User Pool operations. Access, ID, and
refresh tokens are stored in `Secure` (production), `HttpOnly`, `SameSite=Lax` cookies and are
never stored in browser local storage. `proxy.ts` validates or server-refreshes the session before
protected navigation. Every protected server layout independently validates the access and ID
tokens again.

Validation checks the Cognito issuer, JWKS signature, expiry, token use, app client ID/audience,
and matching `sub`. The access token is sent as a bearer token to the AWS API. No AWS credentials,
client secret, database secret, or account ID is exposed to the browser.

Current custom flows:

- Email/password sign-in using `USER_PASSWORD_AUTH`.
- Administrator-created user's `NEW_PASSWORD_REQUIRED` response.
- Generic forgot-password response using `ForgotPassword`.
- Recovery-code confirmation using `ConfirmForgotPassword`.
- Cognito global sign-out where available plus unconditional local cookie removal.

Other Cognito challenges fail closed with a generic message. This preserves the state-machine
boundary needed for future MFA without pretending MFA is currently enabled.

## Route boundaries

| Area | Routes | Behavior |
| --- | --- | --- |
| Marketing | Existing public routes | Unchanged and public |
| Authentication | `/sign-in`, `/forgot-password`, `/reset-password`, `/auth/new-password` | Public flow endpoints; no `/sign-up` route |
| Application | `/app/*` | Cognito session required by proxy and server layout |

`safeNextPath` rejects external and scheme-relative redirect targets. Missing Cognito
configuration fails closed for `/app/*` while public routes continue to build and render.

## Account API contract

`GET {NEXT_PUBLIC_API_BASE_URL}/v1/account` receives the Cognito access token as
`Authorization: Bearer <token>`. A successful response is:

```json
{
  "organizationId": "organization-uuid",
  "organizationName": "Perfect Shade",
  "role": "owner"
}
```

Only `owner`, `admin`, and `staff` are accepted. A missing API configuration or unavailable API
does not fabricate membership: authenticated screens show an explicit unavailable state and
organization-required estimate routes remain inaccessible.

## Provider transition status

| Supabase artifact | Status after this conversion |
| --- | --- |
| Sign-in, recovery, reset, sign-out, proxy, identity, account context | Replaced by Cognito/AWS API |
| `app/auth/callback/route.ts` | Removed; Cognito recovery uses a confirmation code, not Supabase PKCE exchange |
| `lib/supabase/middleware.ts` | No longer referenced; retained temporarily for integration/parity history |
| `lib/supabase/server.ts` and Supabase packages | Temporarily retained only for Chat 3's estimate persistence |
| Supabase account/estimate migrations | Temporarily retained reference artifacts pending Aurora parity and Chat 4 removal |

The retained Supabase estimate bridge is not an account-authentication provider. Because Cognito
does not create a Supabase session, that legacy persistence path is not a production-compatible
mixed-provider design; Chat 3 must replace it with the AWS API before integrated estimate testing.
