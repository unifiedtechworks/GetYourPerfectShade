-- Perfect Shade document output and estimate lifecycle, Phase 4.
-- Adds issued identity, immutable revision lineage, and recoverable generated
-- document metadata without weakening existing tenant or runtime restrictions.

alter table app.estimates
  add column issued_by text;

alter table app.estimates
  add constraint estimates_issued_by_required
  check (status <> 'issued' or issued_by is not null);

create unique index estimates_source_revision_unique
  on app.estimates(organization_id, source_estimate_id, revision_number)
  where source_estimate_id is not null and deleted_at is null;

alter table app.estimate_command_idempotency
  add column result_id uuid;

create table app.estimate_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete restrict,
  estimate_id uuid not null,
  estimate_revision integer not null check (estimate_revision >= 1),
  document_type text not null check (document_type in ('docx', 'pdf', 'json')),
  state text not null default 'pending' check (state in ('pending', 'ready', 'failed')),
  object_key text not null check (btrim(object_key) <> ''),
  original_filename text not null check (btrim(original_filename) <> ''),
  content_type text not null check (btrim(content_type) <> ''),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  checksum_sha256 text check (
    checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  object_version_id text,
  source_row_version bigint not null check (source_row_version >= 1),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  generator_version text not null check (btrim(generator_version) <> ''),
  generated_by text not null,
  rendered_at timestamptz not null,
  generated_at timestamptz,
  failure_code text,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, object_key),
  unique (organization_id, estimate_id, document_type, idempotency_key),
  foreign key (organization_id, estimate_id)
    references app.estimates(organization_id, id) on delete restrict,
  check (
    (state = 'pending' and generated_at is null and failure_code is null)
    or (
      state = 'ready'
      and generated_at is not null
      and byte_size is not null
      and checksum_sha256 is not null
      and failure_code is null
    )
    or (
      state = 'failed'
      and generated_at is null
      and failure_code is not null
    )
  )
);

create index estimate_documents_organization_estimate_idx
  on app.estimate_documents(
    organization_id, estimate_id, estimate_revision, created_at desc, id desc
  );

create or replace function app_private.prevent_estimate_lineage_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.source_estimate_id, new.revision_number) is distinct from
     (old.source_estimate_id, old.revision_number) then
    raise exception 'estimate_lineage_is_immutable' using errcode = '55000';
  end if;
  if new.issued_by is distinct from old.issued_by and old.status <> 'draft' then
    raise exception 'issued_identity_is_immutable' using errcode = '55000';
  end if;
  return new;
end
$$;

create trigger estimates_prevent_lineage_mutation
before update on app.estimates for each row
execute function app_private.prevent_estimate_lineage_mutation();

create or replace function app_private.enforce_estimate_document_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (
    new.organization_id, new.estimate_id, new.estimate_revision,
    new.document_type, new.object_key, new.original_filename,
    new.content_type, new.source_row_version, new.idempotency_key,
    new.generator_version, new.generated_by, new.rendered_at,
    new.created_by, new.created_at
  ) is distinct from (
    old.organization_id, old.estimate_id, old.estimate_revision,
    old.document_type, old.object_key, old.original_filename,
    old.content_type, old.source_row_version, old.idempotency_key,
    old.generator_version, old.generated_by, old.rendered_at,
    old.created_by, old.created_at
  ) then
    raise exception 'estimate_document_identity_is_immutable' using errcode = '55000';
  end if;
  if old.state <> 'pending' or new.state not in ('ready', 'failed') then
    raise exception 'estimate_document_history_is_immutable' using errcode = '55000';
  end if;
  return new;
end
$$;

create trigger estimate_documents_enforce_update
before update on app.estimate_documents for each row
execute function app_private.enforce_estimate_document_update();

create trigger estimate_documents_set_audit
before update on app.estimate_documents for each row
execute function app_private.set_audit_fields();

create trigger estimate_documents_prevent_organization_change
before update on app.estimate_documents for each row
execute function app_private.prevent_organization_change();

alter table app.estimate_documents enable row level security;
alter table app.estimate_documents force row level security;

create policy tenant_select
on app.estimate_documents for select
using (organization_id = app_private.current_organization_id());

create policy tenant_insert
on app.estimate_documents for insert
with check (
  organization_id = app_private.current_organization_id()
  and generated_by = app_private.current_actor_id()
  and created_by = app_private.current_actor_id()
  and updated_by = app_private.current_actor_id()
  and exists (
    select 1 from app.estimates e
    where e.organization_id = estimate_documents.organization_id
      and e.id = estimate_documents.estimate_id
      and e.revision_number = estimate_documents.estimate_revision
      and e.deleted_at is null
  )
);

create policy tenant_update_pending
on app.estimate_documents for update
using (
  organization_id = app_private.current_organization_id()
  and state = 'pending'
)
with check (
  organization_id = app_private.current_organization_id()
  and updated_by = app_private.current_actor_id()
);

-- Existing Phase 1 insert policies are permissive. These restrictive policies
-- close the insertion gap so an issued estimate cannot gain new child content.
create policy issued_parent_insert_guard
on app.estimate_scope_items as restrictive for insert
with check (
  exists (
    select 1 from app.estimates e
    where e.organization_id = estimate_scope_items.organization_id
      and e.id = estimate_scope_items.estimate_id
      and e.status = 'draft'
      and e.deleted_at is null
  )
);

create policy issued_parent_insert_guard
on app.estimate_pricing_lines as restrictive for insert
with check (
  exists (
    select 1 from app.estimates e
    where e.organization_id = estimate_pricing_lines.organization_id
      and e.id = estimate_pricing_lines.estimate_id
      and e.status = 'draft'
      and e.deleted_at is null
  )
);

create policy issued_parent_insert_guard
on app.estimate_terms as restrictive for insert
with check (
  exists (
    select 1 from app.estimates e
    where e.organization_id = estimate_terms.organization_id
      and e.id = estimate_terms.estimate_id
      and e.status = 'draft'
      and e.deleted_at is null
  )
);

create policy issued_parent_insert_guard
on app.estimate_addenda as restrictive for insert
with check (
  exists (
    select 1 from app.estimates e
    where e.organization_id = estimate_addenda.organization_id
      and e.id = estimate_addenda.estimate_id
      and e.status = 'draft'
      and e.deleted_at is null
  )
);

revoke all on app.estimate_documents from public;
grant select, insert, update on app.estimate_documents
  to perfect_shade_app_runtime;
revoke delete on app.estimate_documents from perfect_shade_app_runtime;
revoke all on function app_private.prevent_estimate_lineage_mutation(),
  app_private.enforce_estimate_document_update() from public;
