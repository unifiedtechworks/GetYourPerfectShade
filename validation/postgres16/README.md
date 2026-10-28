# Disposable PostgreSQL 16 rehearsal

Validation branch only: `codex/validate-migration-0010-postgres16`, based on
`4a0bcdf80b5f4428e2e88643b1ff7f54be67b1c0`. Do not merge the temporary workflow
or harness into main without separate review.

The branch-scoped GitHub Actions workflow starts a fresh `postgres:16` service
on an Ubuntu runner. It uses fixed synthetic-only credentials, a read-only
repository token, no repository secrets, no deployment environment, and no AWS
credentials. The harness refuses remote/production connection inputs. PostgreSQL
reports its precise version in the run log and summary.

The rehearsal executes the committed migration parser's actual statements in
real PostgreSQL transactions, using the committed migration history schema and
history validation logic. It applies 0001-0009, seeds synthetic legacy fixtures,
injects a rollback failure, then applies 0010 and exercises constraints, triggers,
forced RLS, restricted login permissions, lifecycle transitions, and actual
application issuance/duplication/revision/document-reservation SQL. Concurrent
tests use separate connections and observe actual PostgreSQL row-lock blocking.

The application lifecycle service is bundled unchanged for this test. Its
database adapter executes SQL against PostgreSQL, not mocks. Object storage and
document bytes are synthetic in-memory test doubles: no S3, presigned live URLs,
real client documents, or business data are accessed. A concurrent finalization
loser may return the service's existing retryable `document_finalize_pending`;
the test verifies the same-key retry recovers the original reservation.
It also injects an adapter interruption after a real finalization UPDATE but
before commit, verifies transaction/audit rollback, then issues the estimate and
recovers the original pending Draft snapshot without rewriting the stored bytes.

This does **not** exercise Aurora, the AWS RDS Data API transport/administrative
identity, AWS IAM or Secrets Manager, the deployed migration CLI's credentials,
S3, PDF/DOCX rendering, or production deployment orchestration. Those are distinct
operational checks and must not be claimed as validated by this rehearsal.

Results are printed in the Actions log and job summary. No database or generated
test output is committed; the disposable runner/container is discarded by Actions.
