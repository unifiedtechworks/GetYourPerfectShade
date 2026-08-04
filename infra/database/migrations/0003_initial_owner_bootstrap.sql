-- Controlled one-time bootstrap for the first Perfect Shade organization owner.
-- Execute only through the migration/admin database identity. The runtime role is not granted
-- access to this function.

create or replace function app_private.bootstrap_initial_owner(
  owner_subject text,
  owner_email text,
  organization_name text,
  bootstrap_request_id text,
  allow_create boolean
)
returns table(outcome text, organization_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_organization_id uuid;
  existing_owner_count integer;
  existing_owner_subject text;
  new_organization_id uuid;
begin
  if organization_name is null or btrim(organization_name) = '' then
    raise exception 'bootstrap_invalid_organization' using errcode = '22023';
  end if;
  if owner_subject is not null and btrim(owner_subject) = '' then
    raise exception 'bootstrap_invalid_subject' using errcode = '22023';
  end if;
  if allow_create and (
    owner_subject is null or owner_email is null or btrim(owner_email) = '' or
    bootstrap_request_id is null or btrim(bootstrap_request_id) = ''
  ) then
    raise exception 'bootstrap_incomplete_input' using errcode = '22023';
  end if;

  -- Serialize attempts for the same normalized organization name. This closes the race left by
  -- a read-then-insert bootstrap and prevents two initial owners from being created concurrently.
  perform pg_advisory_xact_lock(
    hashtextextended(lower(btrim(organization_name)), 0)
  );

  select o.id into existing_organization_id
  from app.organizations o
  where lower(btrim(o.name)) = lower(btrim(organization_name))
  order by o.created_at, o.id
  limit 1
  for update;

  if existing_organization_id is not null then
    select count(*), min(m.user_id)
      into existing_owner_count, existing_owner_subject
    from app.organization_memberships m
    where m.organization_id = existing_organization_id
      and m.role = 'owner'
      and m.status = 'active';

    if existing_owner_count > 0 then
      if existing_owner_count = 1
        and owner_subject is not null
        and existing_owner_subject = owner_subject
        and exists (
          select 1 from app.profiles p where p.user_id = owner_subject
        ) then
        return query select 'already_complete'::text, existing_organization_id;
      else
        return query select 'existing_owner'::text, existing_organization_id;
      end if;
      return;
    end if;

    return query select 'existing_organization'::text, existing_organization_id;
    return;
  end if;

  if owner_subject is not null and (
    exists (select 1 from app.profiles p where p.user_id = owner_subject)
    or exists (
      select 1 from app.organization_memberships m
      where m.user_id = owner_subject and m.status = 'active'
    )
  ) then
    return query select 'existing_membership'::text, null::uuid;
    return;
  end if;

  if not allow_create then
    return query select 'creation_required'::text, null::uuid;
    return;
  end if;

  insert into app.organizations (name, created_by, updated_by)
  values (btrim(organization_name), owner_subject, owner_subject)
  returning id into new_organization_id;

  insert into app.profiles (
    user_id, email_snapshot, display_name, created_by, updated_by
  ) values (
    owner_subject,
    lower(btrim(owner_email)),
    split_part(lower(btrim(owner_email)), '@', 1),
    owner_subject,
    owner_subject
  );

  insert into app.organization_memberships (
    organization_id, user_id, role, status, created_by, updated_by
  ) values (
    new_organization_id,
    owner_subject,
    'owner',
    'active',
    owner_subject,
    owner_subject
  );

  insert into app.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    request_id,
    metadata,
    created_by,
    updated_by
  ) values (
    new_organization_id,
    owner_subject,
    'organization.initial_owner_bootstrapped',
    'organization',
    new_organization_id,
    bootstrap_request_id,
    jsonb_build_object('role', 'owner', 'source', 'admin_bootstrap_command'),
    owner_subject,
    owner_subject
  );

  return query select 'created'::text, new_organization_id;
end
$$;

revoke all on function app_private.bootstrap_initial_owner(
  text, text, text, text, boolean
) from public;
revoke all on function app_private.bootstrap_initial_owner(
  text, text, text, text, boolean
) from perfect_shade_app_runtime;
