-- Perfect Shade Cognito account and organization foundation.
-- Apply before 0002_estimate_phase_1.sql with the controlled migration identity.

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

  -- The Data API begins with the cluster credential and immediately assumes this constrained
  -- role for every application transaction.
  execute format('grant perfect_shade_app_runtime to %I', current_user);
end
$roles$;

create table app.profiles (
  user_id text primary key,
  email_snapshot text not null default '',
  display_name text not null default '',
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(user_id) <> '')
);

create table app.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, name)
);

create table app.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete restrict,
  user_id text not null,
  role text not null check (role in ('owner', 'admin', 'staff')),
  status text not null default 'active'
    check (status in ('active', 'disabled', 'removed')),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, user_id)
);

create unique index organization_memberships_one_active_user_idx
  on app.organization_memberships(user_id) where status = 'active';
create index organization_memberships_organization_status_idx
  on app.organization_memberships(organization_id, status, role, user_id);

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

create or replace function app_private.establish_account_context(caller_subject text)
returns table(
  actor_id text,
  organization_id uuid,
  organization_name text,
  role text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_count integer;
  resolved_organization_id uuid;
  resolved_organization_name text;
  resolved_role text;
begin
  if caller_subject is null or btrim(caller_subject) = '' then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  -- Establish actor-only context first so the forced-RLS membership policy can expose only the
  -- caller's row during tenant resolution.
  perform set_config('app.actor_id', caller_subject, true);

  select count(*) into membership_count
  from app.organization_memberships m
  where m.user_id = caller_subject and m.status = 'active';

  if membership_count <> 1 then
    return;
  end if;

  select m.organization_id, m.role
    into resolved_organization_id, resolved_role
  from app.organization_memberships m
  where m.user_id = caller_subject and m.status = 'active';

  perform set_config('app.organization_id', resolved_organization_id::text, true);
  perform set_config('app.organization_role', resolved_role, true);

  select o.name into resolved_organization_name
  from app.organizations o
  where o.id = resolved_organization_id;

  return query select
    caller_subject,
    resolved_organization_id,
    resolved_organization_name,
    resolved_role;
end
$$;

create or replace function app_private.set_account_audit_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  new.updated_by = app_private.current_actor_id();
  return new;
end
$$;

create or replace function app_private.prevent_membership_organization_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'organization_id cannot be changed';
  end if;
  return new;
end
$$;

create trigger profiles_set_audit
before update on app.profiles for each row
execute function app_private.set_account_audit_fields();
create trigger organizations_set_audit
before update on app.organizations for each row
execute function app_private.set_account_audit_fields();
create trigger organization_memberships_set_audit
before update on app.organization_memberships for each row
execute function app_private.set_account_audit_fields();
create trigger organization_memberships_prevent_organization_change
before update on app.organization_memberships for each row
execute function app_private.prevent_membership_organization_change();

alter table app.profiles enable row level security;
alter table app.profiles force row level security;
alter table app.organizations enable row level security;
alter table app.organizations force row level security;
alter table app.organization_memberships enable row level security;
alter table app.organization_memberships force row level security;

create policy profile_self_select on app.profiles for select
using (user_id = app_private.current_actor_id());
create policy organization_tenant_select on app.organizations for select
using (id = app_private.current_organization_id());
create policy membership_actor_or_tenant_select on app.organization_memberships for select
using (
  user_id = app_private.current_actor_id()
  or organization_id = app_private.current_organization_id()
);

revoke all on schema app from public;
revoke all on schema app_private from public;
revoke all on all tables in schema app from public;
revoke all on all functions in schema app_private from public;
grant usage on schema app, app_private to perfect_shade_app_runtime;
grant select on app.profiles, app.organizations, app.organization_memberships
  to perfect_shade_app_runtime;
grant execute on function app_private.establish_account_context(text),
  app_private.current_actor_id(),
  app_private.current_organization_id(),
  app_private.current_organization_role()
  to perfect_shade_app_runtime;
revoke insert, update, delete on app.profiles, app.organizations,
  app.organization_memberships from perfect_shade_app_runtime;
revoke create on schema app, app_private from perfect_shade_app_runtime;
