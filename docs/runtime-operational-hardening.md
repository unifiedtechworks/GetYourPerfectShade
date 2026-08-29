# Runtime database credentials and operational telemetry

## Scope

This source change separates the application database identity from the
administrative migration identity and provides secret-safe application logs and
CloudWatch Embedded Metric Format (EMF) records. It does not deploy resources,
connect to Aurora, rotate a live secret, change historical document rows, or
apply SQL.

No forward migration was added. A database login password is infrastructure
credential state, not tenant-schema history. The deployment-only runtime
credential provisioner synchronizes that state through an administrative Data
API transaction. Migrations `0001` through `0007` remain byte-for-byte
unchanged and continue to own role flags, forced RLS, grants, functions, and
tenant constraints.

## Runtime credential boundary

The two identities have separate Secrets Manager resources and IAM consumers:

| Identity | Allowed consumers | Purpose |
| --- | --- | --- |
| Aurora admin/migration | migration runner, owner bootstrap/recovery, deployment-only runtime-login provisioner | DDL, forward migrations, controlled recovery, runtime credential synchronization |
| `perfect_shade_app_runtime` | account Lambda and estimate Lambda | application transactions using only previously granted schema/function/table privileges |

Development and production instantiate this same credential construct. Resource
names, retention, cluster, secrets, and roles remain environment-specific;
credential semantics and provisioning behavior do not fork between stacks.

Application Lambdas no longer receive the admin secret and no longer begin as
the admin user before executing `SET LOCAL ROLE`. Every Data API begin,
statement, commit, and rollback uses the runtime secret directly. The existing
role remains `LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
NOREPLICATION NOBYPASSRLS`; forced RLS and all existing revocations remain in
effect.

The runtime secret is generated with this JSON contract:

```json
{
  "username": "perfect_shade_app_runtime",
  "password": "<generated-and-stored-only-in-secrets-manager>"
}
```

The deployment-only provisioner:

1. reads the runtime secret;
2. begins a Data API transaction with the admin secret;
3. passes the password as a Data API parameter to a transaction-local setting;
4. executes fixed SQL that creates or constrains the named runtime role and
   synchronizes its password;
5. commits only on success and rolls back on failure; and
6. performs no destructive action during CloudFormation deletion.

The password is never placed in source, CloudFormation properties, Lambda
environment variables, SQL text, or application logs. Application functions
have no IAM permission to read the admin secret. Explicit CloudFormation
dependencies require successful provisioning before either application Lambda
configuration is created or updated.

The source does not configure automatic rotation. When rotation is approved,
Chat 5 must update the runtime secret, deliberately re-invoke the provisioner
(currently by advancing its reviewed `ProvisionerVersion` property), verify a
runtime transaction, and retain the previous secret version until rollback is
no longer required.

## Stable environment and output contract

Application Lambda environment:

| Name | Required | Meaning |
| --- | --- | --- |
| `DATABASE_CLUSTER_ARN` | yes | Aurora Data API cluster resource |
| `DATABASE_RUNTIME_SECRET_ARN` | yes | restricted runtime-login secret; the adapter does not fall back to the admin secret |
| `DATABASE_NAME` | yes | application database name |
| `DOCUMENT_PENDING_STALE_MINUTES` | yes for estimate Lambda | whole minutes from 1 through 1440; CDK default is `15` |

Deployment-only provisioner environment adds
`DATABASE_ADMIN_SECRET_ARN`. That name must never be configured on an
application Lambda. Migration and bootstrap tools keep their existing operator
contract (`AURORA_CLUSTER_ARN`, `AURORA_SECRET_ARN`, and
`AURORA_DATABASE_NAME`).

Stable CloudFormation outputs:

- `AuroraAdminSecretArn`: canonical administrative/migration secret reference;
- `AuroraRuntimeSecretArn`: restricted application runtime secret reference;
- `AuroraSecretArn`: retained compatibility alias for the admin secret during
  deployment-script transition; and
- `AuroraClusterArn` and `AuroraDatabaseName`: unchanged.

## Structured logs

Account and estimate runtime operations emit one secret-safe completion event.
Fields are intentionally allow-listed:

- `service`, `operation`, route template, request ID, outcome, duration, and
  HTTP status;
- safe application error code and `handled` or `unexpected` category;
- validated estimate/document UUIDs only on estimate-scoped operations; and
- document type only as `docx`, `pdf`, or `json`.

The logger API cannot accept an exception, SQL text, request/response body,
customer content, token, secret, ARN, object key, document bytes, or presigned
URL. Unexpected failures remain the client-safe `internal_error`; no stack is
returned. A telemetry sink failure is swallowed so logging cannot change the
application response path.

## Metrics

EMF namespace: `PerfectShade/Application`.

Dimensions are limited to `Service` and finite `Operation`; document-generation
metrics add the three-value `DocumentType`. Request IDs, estimate IDs, document
IDs, error codes, and tenant values are never metric dimensions.

| Metric | Unit | Emission |
| --- | --- | --- |
| `OperationSuccess`, `OperationFailure` | Count | every observed account/estimate operation |
| `OperationDurationMs` | Milliseconds | every observed operation |
| `UnexpectedHandlerError` | Count | unexpected account/estimate runtime failures |
| `DocumentGenerationSuccess`, `DocumentGenerationFailure` | Count | document generation completion/failure |
| `DocumentGenerationDurationMs` | Milliseconds | DOCX/PDF/JSON generation request duration, separated by finite document-type dimension |
| `IssueFailure` | Count | handled or unexpected issue failure |
| `RevisionFailure` | Count | handled or unexpected revision failure |
| `DuplicateFailure` | Count | handled or unexpected duplicate failure |
| `PendingDocumentCount` | Count | successful document-history read |
| `StalePendingDocumentCount` | Count | pending history older than the configured threshold |
| `OldestPendingDocumentAgeSeconds` | Seconds | oldest pending history age on a successful history read |

The production stack defines SNS-backed alarms directly from these metrics for
service-level unexpected errors, each finite document type, issue/revision/
duplicate failures, and `StalePendingDocumentCount >= 1`. Production log
retention, notification subscription confirmation, and alarm delivery still
require deployment-time operational acceptance.

## Pending-document handling

Pending history becomes stale after 15 minutes by default. Detection is
read-only:

- API document records receive `isStale` calculated from trusted `created_at`;
- the estimate screen labels `pending (stale)` and instructs staff to generate
  a new file;
- old rows remain immutable and are not silently failed, deleted, or repaired;
- recent pending rows are not warned; and
- list-time health metrics expose count and age.

This safely surfaces the two historical development records without modifying
them. A new generation uses the existing collision-safe independent history
path. Continuous detection without user traffic requires a future scheduled
health invocation; Chat 5 may add that operational schedule while reusing the
same threshold and metric contract rather than inventing separate business
rules.

## Chat 5 deployment requirements

1. Review the CDK diff, including the generated runtime secret, deployment-only
   provisioner, its two-secret IAM access, and explicit application-function
   dependencies.
2. Confirm only the provisioner can read the admin secret. Confirm account and
   estimate roles can read only the runtime secret and use Data API against the
   intended cluster.
3. Deploy through the approved non-production sequence first. The provisioner
   must succeed before Lambda updates; a failure must stop the stack update.
4. Verify migrations `0001` through `0007` are unchanged and fully applied. Do
   not add or apply a credential migration.
5. Run a runtime Data API smoke test under `perfect_shade_app_runtime`, verify
   `current_user`, forced RLS, denied DDL/role/schema operations, and normal
   account/estimate behavior.
6. Confirm EMF extraction and the synthesized production alarms in CloudWatch,
   then test notification delivery without adding high-cardinality dimensions.
7. Inspect the two historical pending records through the application, confirm
   the stale warning/metrics, and generate replacement documents if desired;
   do not rewrite the old rows.
8. For production, use retained secrets/logs, approved KMS keys and retention,
   rotation/recovery procedures, and a separate production stack/configuration.
