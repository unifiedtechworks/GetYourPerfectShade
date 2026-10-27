-- Perfect Shade estimate document lifecycle snapshots and proposal policy v2.
-- Existing estimates retain policy v1 so previously issued commitments continue
-- to render with their saved lead-time wording. New estimates use policy v2.

alter table app.estimates
  add column proposal_policy_version smallint not null default 1
  check (proposal_policy_version in (1, 2));

alter table app.estimates
  alter column proposal_policy_version set default 2;

comment on column app.estimates.proposal_policy_version is
  'Immutable proposal wording policy. Version 1 preserves legacy saved lead time; version 2 uses the permanent Lead Times clause.';

alter table app.estimate_documents
  add column generated_as text
  check (generated_as is null or generated_as in ('draft', 'issued'));

comment on column app.estimate_documents.generated_as is
  'Immutable estimate lifecycle snapshot at reservation time. Null is reserved for unclassified legacy rows.';

create or replace function app_private.prevent_estimate_lineage_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.source_estimate_id, new.revision_number) is distinct from
     (old.source_estimate_id, old.revision_number) then
    raise exception 'estimate_lineage_is_immutable' using errcode = '55000';
  end if;
  if new.proposal_policy_version is distinct from old.proposal_policy_version then
    raise exception 'proposal_policy_version_is_immutable' using errcode = '55000';
  end if;
  if new.issued_by is distinct from old.issued_by and old.status <> 'draft' then
    raise exception 'issued_identity_is_immutable' using errcode = '55000';
  end if;
  return new;
end
$$;

create or replace function app_private.require_estimate_document_generated_as()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.generated_as is null then
    raise exception 'estimate_document_generated_as_is_required' using errcode = '23502';
  end if;
  return new;
end
$$;

create trigger estimate_documents_require_generated_as
before insert on app.estimate_documents for each row
execute function app_private.require_estimate_document_generated_as();

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

  -- A controlled administrative classification may set an ambiguous legacy
  -- null exactly once. Runtime RLS still limits updates to pending rows, while
  -- table owners can classify a verified ready/failed row by exact checksum.
  if new.generated_as is distinct from old.generated_as then
    if old.generated_as is not null or new.generated_as is null then
      raise exception 'estimate_document_generated_as_is_immutable' using errcode = '55000';
    end if;
    if (
      new.state, new.byte_size, new.checksum_sha256, new.object_version_id,
      new.generated_at, new.failure_code
    ) is distinct from (
      old.state, old.byte_size, old.checksum_sha256, old.object_version_id,
      old.generated_at, old.failure_code
    ) then
      raise exception 'legacy_document_classification_must_be_isolated' using errcode = '55000';
    end if;
    return new;
  end if;

  if old.state <> 'pending' or new.state not in ('ready', 'failed') then
    raise exception 'estimate_document_history_is_immutable' using errcode = '55000';
  end if;
  return new;
end
$$;

drop policy tenant_insert on app.estimate_documents;

create policy tenant_insert
on app.estimate_documents for insert
with check (
  organization_id = app_private.current_organization_id()
  and generated_by = app_private.current_actor_id()
  and created_by = app_private.current_actor_id()
  and updated_by = app_private.current_actor_id()
  and generated_as in ('draft', 'issued')
  and exists (
    select 1 from app.estimates e
    where e.organization_id = estimate_documents.organization_id
      and e.id = estimate_documents.estimate_id
      and e.revision_number = estimate_documents.estimate_revision
      and e.deleted_at is null
  )
);

revoke all on function app_private.require_estimate_document_generated_as()
  from public;
