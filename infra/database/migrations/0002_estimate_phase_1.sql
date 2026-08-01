-- Perfect Shade AWS estimate persistence, Phase 1.
-- Prerequisite (owned by the account conversion): app.organizations and
-- app.organization_memberships, whose user_id is the immutable Cognito sub (text).

create extension if not exists pgcrypto;
create schema if not exists app;
create schema if not exists app_private;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'perfect_shade_app_runtime') then
    create role perfect_shade_app_runtime
      login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  else
    alter role perfect_shade_app_runtime
      login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end
$roles$;

create table app.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  contact_information text not null default '',
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text,
  unique (organization_id, id),
  check ((deleted_at is null) = (deleted_by is null))
);

create table app.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete restrict,
  customer_id uuid not null,
  name text not null check (btrim(name) <> ''),
  location text not null default '',
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by text,
  unique (organization_id, id),
  foreign key (organization_id, customer_id)
    references app.customers(organization_id, id) on delete restrict,
  check ((deleted_at is null) = (deleted_by is null))
);

create table app.estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete restrict,
  project_id uuid not null,
  source_estimate_id uuid,
  revision_number integer not null default 1 check (revision_number >= 1),
  row_version bigint not null default 1 check (row_version >= 1),
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'accepted', 'declined', 'expired', 'void')),
  document_type text not null default 'Bid Proposal'
    check (document_type in ('Bid Proposal', 'Estimate')),
  estimate_number text not null default '',
  estimate_date text not null default '',
  valid_through text not null default '',
  bid_due text not null default '',
  project_name text not null check (btrim(project_name) <> ''),
  project_location text not null default '',
  prepared_for text not null check (btrim(prepared_for) <> ''),
  contact_information text not null default '',
  deposit_percent numeric not null default 0
    check (deposit_percent >= 0 and deposit_percent <= 100),
  tax_rate_percent numeric not null default 0 check (tax_rate_percent = 0),
  include_alternate_pricing boolean not null default false,
  include_prevailing_wage_statement boolean not null default false,
  prevailing_wage_statement text not null default
    'Applicable prevailing wage labor rates are included where required by the project.',
  lead_time text not null default '',
  pricing_valid_days text not null default '',
  project_notes text not null default '',
  authorized_signer text not null default '',
  signature_date text not null default '',
  subtotal_minor bigint not null default 0,
  sales_tax_minor bigint not null default 0 check (sales_tax_minor = 0),
  total_minor bigint not null default 0,
  required_deposit_minor bigint not null default 0,
  remaining_balance_minor bigint not null default 0,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issued_at timestamptz,
  deleted_at timestamptz,
  deleted_by text,
  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references app.projects(organization_id, id) on delete restrict,
  foreign key (organization_id, source_estimate_id)
    references app.estimates(organization_id, id) on delete restrict,
  check ((deleted_at is null) = (deleted_by is null)),
  check (total_minor = subtotal_minor),
  check (
    required_deposit_minor =
      round(total_minor::numeric * deposit_percent / 100)::bigint
  ),
  check (remaining_balance_minor = total_minor - required_deposit_minor),
  check (
    (status = 'issued' and issued_at is not null)
    or (status <> 'issued')
  )
);

create table app.estimate_scope_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete restrict,
  estimate_id uuid not null,
  sort_order integer not null check (sort_order >= 0),
  description text not null check (btrim(description) <> ''),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (estimate_id, sort_order),
  unique (organization_id, id),
  foreign key (organization_id, estimate_id)
    references app.estimates(organization_id, id) on delete restrict
);

create table app.estimate_pricing_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete restrict,
  estimate_id uuid not null,
  kind text not null check (kind in ('base', 'alternate')),
  sort_order integer not null check (sort_order >= 0),
  description text not null default '',
  amount_minor bigint not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (estimate_id, kind, sort_order),
  unique (organization_id, id),
  foreign key (organization_id, estimate_id)
    references app.estimates(organization_id, id) on delete restrict
);

create table app.estimate_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete restrict,
  estimate_id uuid not null,
  sort_order integer not null check (sort_order >= 0),
  description text not null check (btrim(description) <> ''),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (estimate_id, sort_order),
  unique (organization_id, id),
  foreign key (organization_id, estimate_id)
    references app.estimates(organization_id, id) on delete restrict
);

create table app.estimate_addenda (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete restrict,
  estimate_id uuid not null,
  sort_order integer not null check (sort_order >= 0),
  description text not null check (btrim(description) <> ''),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (estimate_id, sort_order),
  unique (organization_id, id),
  foreign key (organization_id, estimate_id)
    references app.estimates(organization_id, id) on delete restrict
);

create table app.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete restrict,
  actor_id text not null,
  action text not null check (btrim(action) <> ''),
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_id uuid,
  request_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table app.estimate_command_idempotency (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete restrict,
  command_name text not null,
  idempotency_key text not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  estimate_id uuid,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, command_name, idempotency_key),
  foreign key (organization_id, estimate_id)
    references app.estimates(organization_id, id) on delete restrict
);

create index customers_organization_name_idx
  on app.customers(organization_id, name) where deleted_at is null;
create index projects_organization_customer_idx
  on app.projects(organization_id, customer_id, created_at desc)
  where deleted_at is null;
create index estimates_organization_updated_idx
  on app.estimates(organization_id, updated_at desc, id desc)
  where deleted_at is null;
create index estimates_organization_project_idx
  on app.estimates(organization_id, project_id, created_at desc);
create index estimate_scope_items_organization_estimate_idx
  on app.estimate_scope_items(organization_id, estimate_id, sort_order);
create index estimate_pricing_lines_organization_estimate_idx
  on app.estimate_pricing_lines(organization_id, estimate_id, kind, sort_order);
create index estimate_terms_organization_estimate_idx
  on app.estimate_terms(organization_id, estimate_id, sort_order);
create index estimate_addenda_organization_estimate_idx
  on app.estimate_addenda(organization_id, estimate_id, sort_order);
create index audit_events_organization_entity_idx
  on app.audit_events(organization_id, entity_type, entity_id, created_at desc);

create or replace function app_private.current_actor_id()
returns text language sql stable set search_path = '' as $$
  select nullif(current_setting('app.actor_id', true), '')
$$;

create or replace function app_private.current_organization_id()
returns uuid language sql stable set search_path = '' as $$
  select nullif(current_setting('app.organization_id', true), '')::uuid
$$;

create or replace function app_private.current_organization_role()
returns text language sql stable set search_path = '' as $$
  select nullif(current_setting('app.organization_role', true), '')
$$;

create or replace function app_private.establish_estimate_context(caller_subject text)
returns table(actor_id text, organization_id uuid, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_count integer;
  resolved_organization_id uuid;
  resolved_role text;
begin
  if caller_subject is null or btrim(caller_subject) = '' then
    raise exception 'active_membership_required' using errcode = '28000';
  end if;

  -- This actor-only setting lets the account migration expose only the caller's
  -- membership during pre-tenant resolution. Organization and role still come
  -- exclusively from that database row.
  perform set_config('app.actor_id', caller_subject, true);

  select count(*) into membership_count
  from app.organization_memberships m
  where m.user_id = caller_subject and m.status::text = 'active';

  if membership_count <> 1 then
    return;
  end if;

  select m.organization_id, m.role::text
    into resolved_organization_id, resolved_role
  from app.organization_memberships m
  where m.user_id = caller_subject and m.status::text = 'active';

  perform set_config('app.actor_id', caller_subject, true);
  perform set_config('app.organization_id', resolved_organization_id::text, true);
  perform set_config('app.organization_role', resolved_role, true);
  return query select caller_subject, resolved_organization_id, resolved_role;
end
$$;

create or replace function app_private.set_audit_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  new.updated_by = app_private.current_actor_id();
  if tg_table_name = 'estimates' then
    new.row_version = old.row_version + 1;
  end if;
  return new;
end
$$;

create or replace function app_private.prevent_organization_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'organization_id cannot be changed';
  end if;
  return new;
end
$$;

create or replace function app_private.enforce_soft_delete_role()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.deleted_at, new.deleted_by) is distinct from
     (old.deleted_at, old.deleted_by)
     and coalesce(app_private.current_organization_role(), '') not in ('owner', 'admin') then
    raise exception 'soft_delete_requires_owner_or_admin' using errcode = '42501';
  end if;
  if new.deleted_at is not null then
    new.deleted_by = app_private.current_actor_id();
  end if;
  return new;
end
$$;

create or replace function app_private.prevent_issued_estimate_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'issued' then
    raise exception 'issued_estimate_is_immutable' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create or replace function app_private.prevent_issued_child_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from app.estimates e
    where e.organization_id = old.organization_id
      and e.id = old.estimate_id
      and e.status = 'issued'
  ) then
    raise exception 'issued_estimate_is_immutable' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create or replace function app_private.prevent_audit_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_events_are_append_only' using errcode = '55000';
end
$$;

do $triggers$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers', 'projects', 'estimates', 'estimate_scope_items',
    'estimate_pricing_lines', 'estimate_terms', 'estimate_addenda',
    'estimate_command_idempotency'
  ] loop
    execute format(
      'create trigger %I_set_audit before update on app.%I
       for each row execute function app_private.set_audit_fields()',
      table_name, table_name
    );
    execute format(
      'create trigger %I_prevent_organization_change before update on app.%I
       for each row execute function app_private.prevent_organization_change()',
      table_name, table_name
    );
  end loop;
end
$triggers$;

create trigger customers_enforce_soft_delete_role
before update on app.customers for each row
execute function app_private.enforce_soft_delete_role();
create trigger projects_enforce_soft_delete_role
before update on app.projects for each row
execute function app_private.enforce_soft_delete_role();
create trigger estimates_enforce_soft_delete_role
before update on app.estimates for each row
execute function app_private.enforce_soft_delete_role();
create trigger estimates_prevent_issued_mutation
before update or delete on app.estimates for each row
execute function app_private.prevent_issued_estimate_mutation();

do $issued_child_triggers$
declare
  table_name text;
begin
  foreach table_name in array array[
    'estimate_scope_items', 'estimate_pricing_lines',
    'estimate_terms', 'estimate_addenda'
  ] loop
    execute format(
      'create trigger %I_prevent_issued_mutation before update or delete on app.%I
       for each row execute function app_private.prevent_issued_child_mutation()',
      table_name, table_name
    );
  end loop;
end
$issued_child_triggers$;

create trigger audit_events_prevent_mutation
before update or delete on app.audit_events for each row
execute function app_private.prevent_audit_mutation();

do $rls$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers', 'projects', 'estimates', 'estimate_scope_items',
    'estimate_pricing_lines', 'estimate_terms', 'estimate_addenda',
    'audit_events', 'estimate_command_idempotency'
  ] loop
    execute format('alter table app.%I enable row level security', table_name);
    execute format('alter table app.%I force row level security', table_name);
    execute format(
      'create policy tenant_select on app.%I for select
       using (organization_id = app_private.current_organization_id())',
      table_name
    );
    execute format(
      'create policy tenant_insert on app.%I for insert
       with check (
         organization_id = app_private.current_organization_id()
         and created_by = app_private.current_actor_id()
         and updated_by = app_private.current_actor_id()
       )',
      table_name
    );
  end loop;
end
$rls$;

do $update_policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers', 'projects', 'estimates', 'estimate_scope_items',
    'estimate_pricing_lines', 'estimate_terms', 'estimate_addenda',
    'estimate_command_idempotency'
  ] loop
    execute format(
      'create policy tenant_update on app.%I for update
       using (organization_id = app_private.current_organization_id())
       with check (
         organization_id = app_private.current_organization_id()
         and updated_by = app_private.current_actor_id()
       )',
      table_name
    );
  end loop;
end
$update_policies$;

revoke all on schema app from public;
revoke all on schema app_private from public;
revoke all on all tables in schema app from public;
revoke all on all functions in schema app_private from public;
grant usage on schema app, app_private to perfect_shade_app_runtime;
grant execute on function app_private.establish_estimate_context(text)
  to perfect_shade_app_runtime;
grant execute on function app_private.current_actor_id(),
  app_private.current_organization_id(),
  app_private.current_organization_role()
  to perfect_shade_app_runtime;
grant select, insert, update on app.customers, app.projects, app.estimates,
  app.estimate_scope_items, app.estimate_pricing_lines, app.estimate_terms,
  app.estimate_addenda, app.estimate_command_idempotency
  to perfect_shade_app_runtime;
grant select, insert on app.audit_events to perfect_shade_app_runtime;
revoke delete on all tables in schema app from perfect_shade_app_runtime;
revoke create on schema app, app_private from perfect_shade_app_runtime;
