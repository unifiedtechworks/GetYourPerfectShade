# Business contact and Reply-To corrections

## Scope and authority

The approved business contact and transactional Reply-To address is
`ps.perfectshade@gmail.com`. The SES From remains
`Perfect Shade <notifications@getyourperfectshade.com>`. The From domain is send-only;
do not create an inbox, MX record, or forwarding configuration for this correction.

Business contact configuration is independent of Cognito login identity. Do not change
Sheri's Cognito email, immutable subject, or sole Owner membership, Seth's Admin membership,
MFA/recovery settings, or the synthetic user's isolation to match a business address.

This is **source integration only**. It authorizes no deployment, CloudFormation change set,
AWS configuration update, database query/mutation, email send, invitation, or DNS change.
Each live rollout below requires separate approval.

## Source provenance and exclusions

The reviewed email source is commit `56fd54570db9def7f9004ff3079bfc4047ab526e` on
`codex/post-onboarding-email-corrections`. Its contact, test, offline maintenance, and relevant
documentation changes are selectively incorporated onto security baseline
`9c768af451e107dd735abc53178fe2f094963acd`; the whole commit is not cherry-picked.

The original branch/worktree is preserved. The following are intentionally excluded:

- The profile-email reconciliation CLI and its tests.
- The `reconcile:profile-email` package command.
- The operator-only `@aws-sdk/client-cloudtrail` dependency and its lockfile additions.
- Instructions/configuration for executing the excluded administrative-SQL implementation.

That implementation uses the Aurora administrative secret for direct SQL with unfiltered
visibility. CLI checks are not a database-enforced least-privilege boundary. It is not approved
for operation or deployment. No replacement reconciliation mechanism is implemented here.

The root manifest and lockfile remain identical to the security baseline: Next.js 16.4.2,
React/React DOM 19.2.8, and Next's resolved Sharp 0.35.5. No historical migration is changed,
no forward migration is added, and no migration is applied.

## A. Frontend business contact

`data/business.ts` supplies the public contact text, mailto links, and LocalBusiness schema.
The protected saved-estimate preview has its own explicit business contact block. Both use
the approved address. The canonical origin remains `https://www.getyourperfectshade.com`;
public routes, `/products` redirect, `/events` retirement, styling, and authentication are unchanged.

Deployment requires a separately authorized release of the exact integrated main commit to
the existing production Amplify branch. Keep auto-build disabled. The release-approval marker
must remain absent except during the separately approved release, and be removed afterward.
Preserve all existing production environment variables and the development branch.

## B. Newly generated DOCX/PDF documents

The shared Node document renderer uses the same business address. Pricing, canonical money
strings, calculations, conditional sections, lifecycle/idempotency behavior, layout, and JSON
schema remain unchanged. JSON export does not contain company contact details.

This requires a separately reviewed estimate-Lambda **code-asset-only** deployment. Do not
bundle a broad infrastructure drift update into that release. Preserve the existing private
signature asset and approved `ESTIMATE_INCLUDE_COMPANY_SIGNATURE=true` configuration. The
browser preview, JSON, public assets, and frontend artifacts must remain signature-free.

Only future document generation uses the new contact block. Do not overwrite or regenerate
ready historical objects, edit issued estimates, or rewrite saved customer/estimate records.
Any approved output acceptance fixture must be explicitly authorized and retained as required.

## C. One-property Cognito transactional Reply-To maintenance

Future production context must use `sesReplyToEmail=ps.perfectshade@gmail.com` while preserving
`sesFromEmail=notifications@getyourperfectshade.com`. Existing production configuration already
supports these separate inputs; no new infrastructure resource or IAM policy is introduced.

The offline preparer consists of `infra/bin/prepare-profile-email-reply-to.ts` and
`infra/lib/profile-email-reply-to-maintenance.ts`. It reads an operator-supplied deployed
`get-template --template-stage Original` JSON envelope/body on stdin. It makes no AWS call and
does not create, upload, or execute a change set.

It validates the expected retained/deletion-protected production pool, required email/TOTP MFA,
administrator-only recovery, signup restriction, SES sender/domain, and configuration set.
It clones the entire deployed template and changes exactly:

```text
Resources.IdentityStaffUserPoolF63BA8C7.Properties.EmailConfiguration.ReplyToEmailAddress
ps.getyourperfectshade@gmail.com -> ps.perfectshade@gmail.com
```

Reversing that leaf change must restore identical template JSON. All other resources, MFA and
recovery properties, sender identity, app clients, SES feedback configuration, parameters, and
outputs remain unchanged. It refuses changed baselines, transforms, and output-directory reuse.

Local offline invocation from `infra/`, after an authorized operator supplies the deployed template:

```text
npx --no-install ts-node bin/prepare-profile-email-reply-to.ts cdk.out/<NEW-maintenance-directory> < <saved-get-template.json>
```

The example uses Bash stdin redirection. It emits private local JSON artifacts and normalized
SHA-256 hashes without deployment. Preserve the raw response and both reviewed templates.
Never replace the deployed baseline with a fresh CDK synthesis.

A later, separately authorized UPDATE change set must show exactly one in-place UserPool
property modification, with no replacement/addition/deletion, IAM expansion, Lambda update,
or MFA/recovery/client/URL change. Preserve parameters with UsePreviousValue and existing
stack role, policy, notifications, tags, and termination protection. Recheck live baseline/hashes
before execution; retain the original artifact for rollback. Sender identity, DKIM, feedback,
SNS subscriptions, and DNS must remain unchanged. Reply-delivery tests need separate approval.

## D. Unresolved saved profile-email discrepancy

The prior approved read-only review reported a saved profile email differing from the verified
Cognito identity email. This integration does not re-query private identity records or correct
that snapshot; the discrepancy remains unresolved, not reconciled or waived.

The owner reported successful fresh password-plus-email-MFA sign-in for both Sheri and Seth,
correct Owner/Admin roles, functioning Team Management, and a working Estimates page. Source
review also shows identity/session validation uses Cognito subjects and claims and organization
authorization uses active membership, not equality with the profile email snapshot. There is no
demonstrated blocker to those normal business workflows from this discrepancy.

The stale snapshot can still appear in profile/team API data, team labels, and email-based staff
lookups. Do not infer that every email-dependent administrative workflow is unaffected. Treat
this as a separate data-quality/security maintenance item and do not blindly reinvite, bootstrap,
relink an identity, or change a login to work around it.

A future separately reviewed design must enforce restricted database authority, exact tenant and
subject validation against independently verified Cognito identity, collision protection, active
owner authorization, atomic audited updates, idempotency, and safe uncertain-outcome handling.
Any new forward migration/credential permission and execution each require separate authorization.

## Coordinated future rollout and acceptance

1. Obtain explicit approval for the exact frontend commit, estimate-Lambda code artifact, and
   independent one-property Reply-To maintenance. Source integration is not that approval.
2. Review/deploy the estimate-Lambda code-only update, preserving signature configuration and
   existing historical documents. Validate only separately authorized newly generated fixtures.
3. Perform the controlled Amplify release; verify public contact/mailto/schema, protected preview,
   fresh Owner/Admin sign-in, team authorization, estimate save/reload, and print behavior.
4. Execute only the separately approved one-property Cognito maintenance after change-set review;
   verify the new Reply-To and unchanged identity/MFA/recovery/sender configuration.
5. Address profile reconciliation later through its own restricted design and authorization.

Keep the previously observed Next.js TLS/redirect-forwarding warnings as a separate open hosting
issue. Neither the security upgrade nor successful sign-in/GET checks prove those warnings fixed.
No TLS bypass, hosting redesign, domain association, or DNS cutover is included.

Root production audit must remain clean. Existing development-only Vitest/Vite findings and the
accepted HIGH CDK/brace-expansion tooling advisory are reported separately; this task neither
fixes them nor extends the CDK exception to other findings. Do not run forced audit fixes.

## Narrowed integration verification — 2026-10-23

- Frozen installation with strict peers passed. All four dependency manifest/lockfiles are
  unchanged from the security baseline; the excluded command and CloudTrail SDK are absent.
- 496 application tests passed, including two additional checks of the actual DOCX XML and PDF
  content streams, source-estimate immutability, JSON stability, and Letter page dimensions.
  Focused contact/preview/auth/account/estimate tests passed; 77 migration-runner tests passed.
- Infrastructure type checking and all 202 tests passed, including one-property preparer tests.
  Development and production syntheses passed with credentials/lookups disabled and synthetic
  notification/hosted-development inputs. These are not authoritative live diffs or deployments.
- Type checking/lint and the Next.js 16.4.2 production build passed. Public pages remain static;
  protected account/estimate routes remain dynamic. Localhost smoke checks passed contact links,
  schema, canonical metadata, legacy route behavior, sign-in, signup absence, protected SSR,
  and hardened Server Action redirects. No live authentication was attempted.
- All nine migration files and identity/authorization source remain unchanged. No migration,
  profile correction, membership change, or historical-document rewrite occurred.
- Credential-pattern scanning found no matches; exact signature bytes/base64 were absent from
  962 public/frontend artifact files. The signature remains a backend asset.
- Root production audit: zero findings. Root full audit: seven existing development-only
  findings (one HIGH, five MODERATE, one LOW). Infrastructure production audit: the accepted HIGH
  CDK/brace-expansion vulnerable package; infrastructure full audit: four vulnerable packages
  (two HIGH, two MODERATE), including the separate Vite/Vitest development tooling findings.
  Full-tree audits are not clean; no finding was suppressed or silently accepted.
- Read-only Amplify checks found production job 49 successful at the security baseline, main
  auto-build disabled, and the release marker absent at app and branch scope. Production settings
  were not changed. Preserve these safeguards after source push and recheck before any release.
