import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import pg from 'pg';
import { HISTORY_BOOTSTRAP_SQL } from '../../infra/database/runner/history.mjs';
import { loadMigrationFiles } from '../../infra/database/runner/migration-files.mjs';
import { migrationPlan } from '../../infra/database/runner/runner.mjs';

const BASE = '4a0bcdf80b5f4428e2e88643b1ff7f54be67b1c0';
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'This rehearsal only runs on the disposable Actions runner.');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGDATABASE, 'perfectshade_0010_rehearsal');
assert.equal(process.env.PGUSER, 'postgres');
for (const name of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_PROFILE',
  'AWS_WEB_IDENTITY_TOKEN_FILE', 'DATABASE_URL', 'DATABASE_ADMIN_SECRET_ARN', 'DATABASE_RUNTIME_SECRET_ARN']) {
  assert(!process.env[name], `Production/remote credential input is forbidden: ${name}`);
}

const require = createRequire(import.meta.url);
const { EstimatePhase4Service } = require('../../node_modules/.cache/0010-phase4-service.cjs');
const admin = new pg.Pool({ max: 8, application_name: 'isolated-0010-admin', statement_timeout: 15000 });
const runtime = new pg.Pool({ user: 'perfect_shade_app_runtime', password: 'synthetic-runtime-only',
  max: 16, application_name: 'isolated-0010-runtime', statement_timeout: 15000 });
const report = { baseline: BASE, postgres: null, validations: [], failed: false,
  realPostgres: true, actualApplicationLifecycleService: true, awsDataApiExercised: false,
  awsCredentialsUsed: false, objectStorage: 'in-memory only', syntheticDataOnly: true };
const A = { org: '10000000-0000-4000-8000-000000000001', customer: '20000000-0000-4000-8000-000000000001',
  project: '30000000-0000-4000-8000-000000000001', subject: 'fixture-owner-alpha' };
const B = { org: '10000000-0000-4000-8000-000000000002', customer: '20000000-0000-4000-8000-000000000002',
  project: '30000000-0000-4000-8000-000000000002', subject: 'fixture-owner-beta' };
const migrations = await loadMigrationFiles('infra/database/migrations');
assert.deepEqual(migrations.map(m => m.version), Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(4, '0')));

async function check(name, callback) {
  try { await callback(); report.validations.push({ name, result: 'PASS' }); console.log('PASS ' + name); }
  catch (error) { report.failed = true; report.validations.push({ name, result: 'FAIL',
    code: error.code ?? null, message: String(error.message).slice(0, 1800) }); throw error; }
}
async function transaction(pool, body) {
  const client = await pool.connect();
  try { await client.query('begin'); const result = await body(client); await client.query('commit'); return result; }
  catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}
async function asRuntime(subject, body) {
  return transaction(runtime, async c => {
    const context = await c.query('select * from app_private.establish_estimate_context($1)', [subject]);
    assert.equal(context.rows.length, 1); return body(c);
  });
}
async function expectPgError(callback, code, message) {
  await assert.rejects(callback, e => e.code === code && (!message || e.message.includes(message)));
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function recordMigration(c, m) {
  await c.query(`insert into public.perfect_shade_schema_migrations
    (version, filename, sha256_checksum, duration_ms, runner_version) values ($1,$2,$3,1,'postgres16-rehearsal')`,
  [m.version, m.filename, m.checksum]);
}
async function applyMigration(m, failBeforeCommit = false) {
  return transaction(admin, async c => {
    await c.query('lock table public.perfect_shade_schema_migrations in exclusive mode');
    // Execute every statement parsed from the exact committed migration file.
    for (const statement of m.statements) await c.query(statement);
    await recordMigration(c, m);
    if (failBeforeCommit) await c.query('select 1 / 0');
  });
}
const historyDatabase = {
  async historyTableExists() {
    const r = await admin.query("select to_regclass('public.perfect_shade_schema_migrations') is not null as present");
    return r.rows[0].present;
  },
  async loadHistory() {
    const r = await admin.query(`select version, filename, sha256_checksum::text as checksum,
      applied_at::text as "appliedAt", duration_ms::text as "durationMs", runner_version as "runnerVersion"
      from public.perfect_shade_schema_migrations order by version`);
    return r.rows;
  },
};

// Real PostgreSQL adapter for the existing application TransactionDatabase contract.
// No SQL results are mocked. Runtime connections authenticate as the restricted role.
class PostgresApplicationDatabase {
  sessions = new Map();
  reservationHook = null;
  async beginTransaction() {
    const c = await runtime.connect(), id = randomUUID();
    await c.query('begin'); this.sessions.set(id, c); return id;
  }
  async execute({ sql, parameters = [], transactionId }) {
    const c = this.sessions.get(transactionId); assert(c, 'Unknown transaction');
    const supplied = new Map(parameters.map(p => [p.name, p.value])), indexes = new Map(), values = [];
    const text = sql.replace(/(?<!:):([A-Za-z]\w*)/g, (_, name) => {
      assert(supplied.has(name), 'Missing application SQL parameter ' + name);
      if (!indexes.has(name)) { values.push(supplied.get(name)); indexes.set(name, values.length); }
      return '$' + indexes.get(name);
    });
    const result = await c.query(text, values);
    if (sql.includes('insert into app.estimate_documents') && result.rows.length && this.reservationHook) {
      await this.reservationHook(c, result.rows);
    }
    return result.rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
      [key, value === null ? null : typeof value === 'object' ? JSON.stringify(value) : String(value)])));
  }
  async finish(id, command) {
    const c = this.sessions.get(id); assert(c); this.sessions.delete(id);
    try { await c.query(command); } finally { c.release(); }
  }
  async commitTransaction(id) { return this.finish(id, 'commit'); }
  async rollbackTransaction(id) { return this.finish(id, 'rollback'); }
}
class MemoryStorage {
  objects = new Map(); puts = 0; failPut = false;
  async head(key) { return this.objects.get(key)?.metadata ?? null; }
  async put(input) {
    this.puts++;
    if (this.failPut) throw new Error('Synthetic storage failure');
    const metadata = { byteSize: input.body.byteLength, checksumSha256: input.checksumSha256, versionId: 'synthetic-version' };
    this.objects.set(input.key, { bytes: Buffer.from(input.body), metadata }); return metadata;
  }
  async presignDownload() { return 'https://example.invalid/not-a-live-download'; }
}
function syntheticGenerator(estimate, type, renderedAt) {
  const bytes = Buffer.from(JSON.stringify({ status: estimate.status, issuedAt: estimate.issuedAt,
    revision: estimate.revisionNumber, rowVersion: estimate.rowVersion, renderedAt: renderedAt.toISOString() }));
  return { bytes, type, contentType: 'application/pdf', filename: 'synthetic-rehearsal.pdf', checksumSha256: sha(bytes) };
}
function service(db = new PostgresApplicationDatabase(), storage = new MemoryStorage(), generator = syntheticGenerator) {
  return { db, storage, value: new EstimatePhase4Service(db, storage, randomUUID, () => new Date(), generator) };
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function waitUntil(callback, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) { if (await callback()) return; await new Promise(r => setTimeout(r, 25)); }
  throw new Error('Timed out waiting for ' + label);
}
async function seedTenant(t, label) {
  await admin.query(`insert into app.profiles (user_id,email_snapshot,display_name,created_by,updated_by)
    values ($1,$2,$3,'fixture','fixture')`, [t.subject, label + '@example.invalid', label]);
  await admin.query(`insert into app.organizations (id,name,created_by,updated_by) values ($1,$2,'fixture','fixture')`, [t.org, label]);
  await admin.query(`insert into app.organization_memberships (organization_id,user_id,role,status,created_by,updated_by)
    values ($1,$2,'owner','active','fixture','fixture')`, [t.org, t.subject]);
  await admin.query(`insert into app.customers (id,organization_id,name,created_by,updated_by)
    values ($1,$2,'Synthetic customer','fixture','fixture')`, [t.customer, t.org]);
  await admin.query(`insert into app.projects (id,organization_id,customer_id,name,created_by,updated_by)
    values ($1,$2,$3,'Synthetic project','fixture','fixture')`, [t.project, t.org, t.customer]);
}
async function seedEstimate(t = A) {
  const id = randomUUID();
  await admin.query(`insert into app.estimates
    (id,organization_id,project_id,project_name,prepared_for,lead_time,created_by,updated_by)
    values ($1,$2,$3,'Synthetic complete proposal','Synthetic architect','8 weeks by prior agreement',$4,$4)`,
  [id, t.org, t.project, t.subject]);
  await admin.query(`insert into app.estimate_scope_items (organization_id,estimate_id,sort_order,description,created_by,updated_by)
    values ($1,$2,0,'Synthetic installation scope',$3,$3)`, [t.org, id, t.subject]);
  await admin.query(`insert into app.estimate_pricing_lines
    (organization_id,estimate_id,kind,sort_order,description,amount_minor,created_by,updated_by)
    values ($1,$2,'base',0,'Synthetic line',0,$3,$3)`, [t.org, id, t.subject]);
  return id;
}
async function insertDocument(c, estimate, { generatedAs = 'draft', state = 'pending', includeLifecycle = true,
  actor = A.subject, org = A.org, idempotencyKey = randomUUID() } = {}) {
  const id = randomUUID();
  const fields = includeLifecycle ? ',generated_as' : '';
  const snapshot = includeLifecycle ? ',$9' : '';
  const values = [id, org, estimate, idempotencyKey, actor, state,
    state === 'ready' ? '2026-01-01T12:00:00Z' : null, state === 'failed' ? 'synthetic_failure' : null];
  if (includeLifecycle) values.push(generatedAs);
  await c.query(`insert into app.estimate_documents
    (id,organization_id,estimate_id,estimate_revision,document_type,state,object_key,original_filename,content_type,
     byte_size,checksum_sha256,source_row_version,idempotency_key,generator_version,generated_by,rendered_at,
     generated_at,failure_code,created_by,updated_by${fields})
    values ($1::uuid,$2::uuid,$3::uuid,1,'pdf',$6,'synthetic/'||($1::uuid)::text,'synthetic.pdf','application/pdf',10,
      repeat('a',64),1,$4,'synthetic/v1',$5,'2026-01-01T12:00:00Z',$7,$8,$5,$5${snapshot})`, values);
  return id;
}
const row = async id => (await admin.query('select * from app.estimate_documents where id=$1', [id])).rows[0];

try {
  await check('Actual isolated PostgreSQL server is version 16', async () => {
    const r = await admin.query("select version() as version, current_setting('server_version_num')::int as number");
    assert(r.rows[0].number >= 160000 && r.rows[0].number < 170000); report.postgres = r.rows[0].version;
    assert.equal((await admin.query("select count(*)::int as n from pg_namespace where nspname in ('app','app_private')")).rows[0].n, 0);
  });
  await check('Committed migrations 0001-0009 execute on PostgreSQL and record checksums atomically', async () => {
    for (const m of migrations.slice(0, 9)) {
      const actual = await readFile('infra/database/migrations/' + m.filename);
      const baseline = execFileSync('git', ['show', BASE + ':infra/database/migrations/' + m.filename]);
      assert(actual.equals(baseline), m.filename + ' differs from committed baseline bytes');
    }
    await admin.query(HISTORY_BOOTSTRAP_SQL);
    for (const m of migrations.slice(0, 9)) await applyMigration(m);
    assert.equal((await historyDatabase.loadHistory()).length, 9);
    assert.deepEqual((await migrationPlan(historyDatabase, migrations)).pending.map(m => m.version), ['0010']);
    await admin.query("alter role perfect_shade_app_runtime password 'synthetic-runtime-only'");
    await seedTenant(A, 'Fixture Alpha'); await seedTenant(B, 'Fixture Beta');
  });
  const legacyDraft = await seedEstimate(), legacyIssued = await seedEstimate(), otherTenant = await seedEstimate(B);
  await service().value.issue(A.subject, legacyIssued, 'seed-issued', 'seed-issued');
  const legacyDocs = [];
  for (const state of ['pending', 'ready', 'failed']) legacyDocs.push(await insertDocument(admin, legacyIssued, { state, includeLifecycle: false }));
  const oldDocuments = (await admin.query('select * from app.estimate_documents order by id')).rows;
  const oldEstimates = (await admin.query('select * from app.estimates order by id')).rows;

  await check('Injected 0010 failure rolls back DDL, triggers, history, and existing data', async () => {
    await expectPgError(() => applyMigration(migrations[9], true), '22012');
    assert.equal((await admin.query("select count(*)::int as n from information_schema.columns where table_schema='app' and column_name in ('generated_as','proposal_policy_version')")).rows[0].n, 0);
    assert.equal((await admin.query("select to_regprocedure('app_private.require_estimate_document_generated_as()') is null as absent")).rows[0].absent, true);
    assert.equal((await historyDatabase.loadHistory()).length, 9);
    assert.deepEqual((await admin.query('select * from app.estimate_documents order by id')).rows, oldDocuments);
  });
  await check('Migration 0010 applies exactly once in one real transaction', async () => {
    await applyMigration(migrations[9]);
    assert.equal((await historyDatabase.loadHistory()).length, 10);
  });
  await check('Existing draft and issued estimates retain policy v1 and every saved value', async () => {
    const current = (await admin.query('select * from app.estimates order by id')).rows;
    for (const estimate of current) { assert.equal(estimate.proposal_policy_version, 1); delete estimate.proposal_policy_version; }
    assert.deepEqual(current, oldEstimates);
  });
  await check('Historical document identity, relationships, download keys, metadata and unknown lifecycle are preserved', async () => {
    const current = (await admin.query('select * from app.estimate_documents order by id')).rows;
    for (const document of current) { assert.equal(document.generated_as, null); delete document.generated_as; }
    assert.deepEqual(current, oldDocuments);
    const listed = await service().value.listDocuments(A.subject, legacyIssued);
    assert(listed.data.length === 3 && listed.data.every(d => d.generatedAs === 'unknown'));
    const ready = await service().value.download(A.subject, legacyIssued, legacyDocs[1]);
    assert(ready);
  });
  await check('New estimates, actual application duplicates and revisions default to policy v2', async () => {
    const fresh = await seedEstimate();
    const copyService = service();
    const duplicate = await copyService.value.duplicate(A.subject, legacyIssued, 'duplicate-v2', 'duplicate-v2');
    const revision = await copyService.value.createRevision(A.subject, legacyIssued, 'revision-v2', 'revision-v2');
    for (const id of [fresh, duplicate.data.estimateId, revision.data.estimateId]) {
      assert.equal((await admin.query('select proposal_policy_version from app.estimates where id=$1', [id])).rows[0].proposal_policy_version, 2);
    }
    assert.equal((await admin.query('select proposal_policy_version from app.estimates where id=$1', [legacyIssued])).rows[0].proposal_policy_version, 1);
  });
  await check('New document snapshots reject null, omitted, and invalid states; draft/issued values are accepted', async () => {
    for (const value of [null, 'accepted', 'Draft', '']) {
      // BEFORE INSERT rejects null; runtime RLS rejects invalid nonnull values
      // before CHECK constraints. Also test the table CHECK as administrative owner.
      await expectPgError(() => asRuntime(A.subject, c => insertDocument(c, legacyDraft, { generatedAs: value })), value === null ? '23502' : '42501');
      if (value !== null) await expectPgError(() => insertDocument(admin, legacyDraft, { generatedAs: value }), '23514');
    }
    await expectPgError(() => asRuntime(A.subject, c => insertDocument(c, legacyDraft, { includeLifecycle: false })), '23502');
    for (const generatedAs of ['draft', 'issued']) assert(await asRuntime(A.subject, c => insertDocument(c, legacyDraft, { generatedAs })));
  });
  await check('Lifecycle snapshots and proposal policy are immutable under runtime and admin connections', async () => {
    const id = await asRuntime(A.subject, c => insertDocument(c, legacyDraft));
    await expectPgError(() => asRuntime(A.subject, c => c.query("update app.estimate_documents set generated_as='issued' where id=$1", [id])), '55000', 'generated_as_is_immutable');
    await expectPgError(() => admin.query("update app.estimate_documents set generated_as=null where id=$1", [id]), '55000', 'generated_as_is_immutable');
    await expectPgError(() => asRuntime(A.subject, c => c.query('update app.estimates set proposal_policy_version=2 where id=$1', [legacyDraft])), '55000', 'proposal_policy_version_is_immutable');
    assert.equal((await row(id)).generated_as, 'draft');
  });
  await check('Actual runtime login remains restricted; forced RLS, tenant isolation and issued guards stay effective', async () => {
    const roles = (await admin.query("select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls from pg_roles where rolname='perfect_shade_app_runtime'")).rows[0];
    assert(Object.values(roles).every(v => v === false));
    const rls = await admin.query("select relrowsecurity,relforcerowsecurity from pg_class where oid in ('app.estimates'::regclass,'app.estimate_documents'::regclass)");
    assert(rls.rows.length === 2 && rls.rows.every(r => r.relrowsecurity && r.relforcerowsecurity));
    await asRuntime(A.subject, async c => {
      assert.equal((await c.query('select current_user as u')).rows[0].u, 'perfect_shade_app_runtime');
      assert.equal((await c.query('select * from app.estimates where id=$1', [otherTenant])).rows.length, 0);
      assert.equal((await c.query('update app.estimates set project_notes=$1 where id=$2', ['denied', otherTenant])).rowCount, 0);
    });
    await expectPgError(() => asRuntime(A.subject, c => insertDocument(c, otherTenant, { org: B.org })), '42501');
    await expectPgError(() => asRuntime(A.subject, c => c.query('delete from app.estimate_documents')), '42501');
    await expectPgError(() => asRuntime(A.subject, c => c.query("update app.estimates set project_notes='denied' where id=$1", [legacyIssued])), '55000', 'issued_estimate_is_immutable');
    await expectPgError(() => asRuntime(A.subject, c => c.query(`insert into app.estimate_scope_items
      (organization_id,estimate_id,sort_order,description,created_by,updated_by) values ($1,$2,9,'denied',$3,$3)`, [A.org, legacyIssued, A.subject])), '42501');
    await assert.rejects(service().value.generate(B.subject, legacyDraft, 'pdf', 'cross-tenant-denied', 'cross-tenant-denied'));
  });
  await check('Real Pending-to-Ready and Pending-to-Failed transitions work without changing lifecycle or identity', async () => {
    await asRuntime(A.subject, c => c.query("update app.estimate_documents set state='ready',generated_at=now() where id=$1", [legacyDocs[0]]));
    const legacyReady = await row(legacyDocs[0]);
    assert.equal(legacyReady.state, 'ready'); assert.equal(legacyReady.generated_as, null);
    assert.equal(legacyReady.object_key, oldDocuments.find(d => d.id === legacyDocs[0]).object_key);
    for (const state of ['ready', 'failed']) {
      const id = await asRuntime(A.subject, c => insertDocument(c, legacyDraft));
      const before = await row(id);
      await asRuntime(A.subject, c => c.query(state === 'ready'
        ? "update app.estimate_documents set state='ready',generated_at=now(),object_version_id='synthetic-ready' where id=$1"
        : "update app.estimate_documents set state='failed',failure_code='synthetic_failure' where id=$1", [id]));
      const after = await row(id); assert.equal(after.state, state); assert.equal(after.generated_as, before.generated_as);
      for (const key of ['id', 'estimate_id', 'object_key', 'checksum_sha256', 'idempotency_key']) assert.equal(after[key], before[key]);
      await expectPgError(() => admin.query("update app.estimate_documents set state='pending' where id=$1", [id]), '55000', 'history_is_immutable');
      assert.equal((await asRuntime(A.subject, c => c.query("update app.estimate_documents set failure_code='denied' where id=$1", [id]))).rowCount, 0);
    }
    const failed = service(); failed.storage.failPut = true;
    await assert.rejects(failed.value.generate(A.subject, legacyDraft, 'pdf', 'storage-failure', 'storage-failure'));
    assert.equal((await admin.query("select state from app.estimate_documents where idempotency_key='storage-failure'")).rows[0].state, 'failed');
  });
  await check('Issuance winning a real race makes actual application generation reject stale lifecycle before insertion/storage', async () => {
    const id = await seedEstimate(), entered = deferred(), release = deferred();
    const generation = service(undefined, undefined, async (...args) => { entered.resolve(); await release.promise; return syntheticGenerator(...args); });
    const result = generation.value.generate(A.subject, id, 'pdf', 'issue-wins', 'issue-wins');
    // Attach rejection handling before releasing the intentional race barrier.
    const rejected = assert.rejects(result, e => e.code === 'document_source_changed');
    await entered.promise;
    try { await service().value.issue(A.subject, id, 'issue-race-a', 'issue-race-a'); }
    finally { release.resolve(); }
    await rejected;
    assert.equal((await admin.query("select count(*)::int as n from app.estimate_documents where estimate_id=$1", [id])).rows[0].n, 0);
    assert.equal(generation.storage.puts, 0);
  });
  await check('Reservation winning a real row-lock race preserves Draft after concurrent issuance; a separate Issued file is independent', async () => {
    const id = await seedEstimate(), locked = deferred(), release = deferred(), db = new PostgresApplicationDatabase();
    db.reservationHook = async c => { locked.resolve(c.processID); await release.promise; };
    const generation = service(db); const generated = generation.value.generate(A.subject, id, 'pdf', 'reserve-wins', 'reserve-wins');
    const blockerPid = await locked.promise;
    const issuing = service().value.issue(A.subject, id, 'issue-race-b', 'issue-race-b');
    try {
      await waitUntil(async () => (await admin.query('select exists(select 1 from pg_stat_activity where $1::int=any(pg_blocking_pids(pid))) as blocked', [blockerPid])).rows[0].blocked, 'issuance blocked by reservation row lock');
    } finally { release.resolve(); }
    const draft = await generated; await issuing;
    assert.equal(draft.data.generatedAs, 'draft'); assert.equal(draft.data.state, 'ready');
    const original = await row(draft.data.id), issued = await generation.value.generate(A.subject, id, 'pdf', 'issued-independent', 'issued-independent');
    assert.equal(issued.data.generatedAs, 'issued'); assert.notEqual(issued.data.id, draft.data.id);
    assert.deepEqual(await row(draft.data.id), original);
    const snapshot = JSON.parse(generation.storage.objects.get(original.object_key).bytes.toString()); assert.equal(snapshot.status, 'draft');
  });
  await check('Idempotent retries and concurrent same-key requests preserve the original real database reservation', async () => {
    const id = await seedEstimate(), generation = service();
    const first = await generation.value.generate(A.subject, id, 'pdf', 'replay-key', 'replay-key');
    const before = await row(first.data.id), writes = generation.storage.puts;
    await service().value.issue(A.subject, id, 'issue-before-replay', 'issue-before-replay');
    const replay = await generation.value.generate(A.subject, id, 'pdf', 'replay-key', 'replay-key');
    assert.equal(replay.data.id, first.data.id); assert.equal(replay.data.generatedAs, 'draft'); assert.equal(replay.data.replayed, true);
    assert.equal(generation.storage.puts, writes); assert.deepEqual(await row(first.data.id), before);
    const simultaneous = await seedEstimate(), sharedStorage = new MemoryStorage();
    const both = await Promise.allSettled([service(undefined, sharedStorage).value.generate(A.subject, simultaneous, 'pdf', 'same-key', 'same-key'),
      service(undefined, sharedStorage).value.generate(A.subject, simultaneous, 'pdf', 'same-key', 'same-key')]);
    // Two finalizers may race after the one reservation commits. The existing
    // service explicitly returns retryable 503/document_finalize_pending to the
    // loser. Verify its documented same-key retry, not an invented both-200 contract.
    const recovered = [];
    for (const result of both) {
      if (result.status === 'fulfilled') recovered.push(result.value);
      else {
        assert.equal(result.reason.code, 'document_finalize_pending');
        recovered.push(await service(undefined, sharedStorage).value.generate(A.subject, simultaneous, 'pdf', 'same-key', 'same-key'));
      }
    }
    assert.equal(recovered[0].data.id, recovered[1].data.id);
    assert(recovered.every(r => r.data.generatedAs === 'draft' && r.data.state === 'ready'));
    assert.equal((await admin.query('select count(*)::int as n from app.estimate_documents where estimate_id=$1', [simultaneous])).rows[0].n, 1);
  });
  await check('Matching applied history recognizes 0010; changed checksum fails; migration ledger is append-only', async () => {
    const plan = await migrationPlan(historyDatabase, migrations); assert.equal(plan.pending.length, 0); assert.equal(plan.applied.length, 10);
    const modified = migrations.map(m => m.version === '0010' ? { ...m, checksum: '0'.repeat(64) } : m);
    await assert.rejects(migrationPlan(historyDatabase, modified), /Checksum mismatch/);
    await expectPgError(() => admin.query("update public.perfect_shade_schema_migrations set runner_version='denied' where version='0010'"), '55000', 'migration_history_is_immutable');
    await expectPgError(() => admin.query('truncate public.perfect_shade_schema_migrations'), '55000', 'migration_history_is_immutable');
    assert.equal((await historyDatabase.loadHistory()).length, 10);
  });
} catch (error) {
  report.failed = true; process.exitCode = 1;
  console.error('REHEARSAL FAILED:', error.code ?? error.name, error.message);
} finally {
  // No remote resources exist. Closing pools lets the disposable service container be discarded.
  await Promise.allSettled([runtime.end(), admin.end()]);
  await writeFile(new URL('./results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
