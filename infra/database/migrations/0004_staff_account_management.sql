-- Internal staff administration and profile hardening.
-- Apply after 0003_initial_owner_bootstrap.sql with the controlled migration identity.

create unique index profiles_normalized_email_idx
  on app.profiles (lower(email_snapshot))
  where btrim(email_snapshot) <> '';

create policy profile_team_manager_select on app.profiles for select
using (
  app_private.current_organization_role() in ('owner', 'admin')
  and exists (
    select 1
    from app.organization_memberships m
    where m.user_id = profiles.user_id
      and m.organization_id = app_private.current_organization_id()
  )
);

create policy profile_self_update on app.profiles for update
using (user_id = app_private.current_actor_id())
with check (user_id = app_private.current_actor_id());

create policy profile_manager_insert on app.profiles for insert
with check (
  app_private.current_organization_role() in ('owner', 'admin')
  and user_id <> app_private.current_actor_id()
  and created_by = app_private.current_actor_id()
  and updated_by = app_private.current_actor_id()
);

create policy membership_manager_insert on app.organization_memberships for insert
with check (
  organization_id = app_private.current_organization_id()
  and user_id <> app_private.current_actor_id()
  and role in ('admin', 'staff')
  and (
    app_private.current_organization_role() = 'owner'
    or (
      app_private.current_organization_role() = 'admin'
      and role = 'staff'
    )
  )
  and created_by = app_private.current_actor_id()
  and updated_by = app_private.current_actor_id()
);

create policy membership_manager_update on app.organization_memberships for update
using (
  organization_id = app_private.current_organization_id()
  and user_id <> app_private.current_actor_id()
  and role <> 'owner'
  and app_private.current_organization_role() in ('owner', 'admin')
)
with check (
  organization_id = app_private.current_organization_id()
  and user_id <> app_private.current_actor_id()
  and role in ('admin', 'staff')
  and (
    app_private.current_organization_role() = 'owner'
    or (
      app_private.current_organization_role() = 'admin'
      and role = 'staff'
    )
  )
);

create or replace function app_private.membership_manager_context(caller_subject text)
returns table(actor_id text, organization_id uuid, actor_role text)
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
    return;
  end if;

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
  return query select caller_subject, resolved_organization_id, resolved_role;
end
$$;

create or replace function app_private.create_staff_membership(
  caller_subject text,
  cognito_subject text,
  staff_email text,
  target_role text,
  request_identifier text,
  recovery_invocation boolean
)
returns table(
  outcome text,
  membership_id uuid,
  membership_role text,
  membership_status text,
  membership_created_at timestamptz,
  membership_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_actor_id text;
  resolved_organization_id uuid;
  resolved_actor_role text;
  normalized_email text := lower(btrim(staff_email));
  existing_organization_id uuid;
  existing_membership_id uuid;
  existing_role text;
  existing_status text;
  existing_created_at timestamptz;
  existing_updated_at timestamptz;
  new_membership_id uuid;
  new_created_at timestamptz;
  new_updated_at timestamptz;
begin
  select c.actor_id, c.organization_id, c.actor_role
    into resolved_actor_id, resolved_organization_id, resolved_actor_role
  from app_private.membership_manager_context(caller_subject) c;

  if resolved_actor_id is null then
    return query select 'active_membership_required', null::uuid, null::text,
      null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  if resolved_actor_role not in ('owner', 'admin') then
    return query select 'membership_management_forbidden', null::uuid, null::text,
      null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  if target_role not in ('admin', 'staff')
     or (resolved_actor_role = 'admin' and target_role <> 'staff') then
    return query select 'target_role_forbidden', null::uuid, null::text,
      null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  if cognito_subject is null or btrim(cognito_subject) = ''
     or normalized_email = '' or position('@' in normalized_email) < 2 then
    return query select 'database_contract_error', null::uuid, null::text,
      null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  if cognito_subject = resolved_actor_id then
    return query select 'self_action_forbidden', null::uuid, null::text,
      null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('staff:' || cognito_subject, 0));

  select m.organization_id, m.id, m.role, m.status, m.created_at, m.updated_at
    into existing_organization_id, existing_membership_id, existing_role,
         existing_status, existing_created_at, existing_updated_at
  from app.organization_memberships m
  where m.user_id = cognito_subject
  order by m.created_at
  limit 1;

  if existing_membership_id is not null then
    if existing_organization_id = resolved_organization_id
       and existing_role = target_role
       and existing_status = 'active'
       and exists (
         select 1 from app.profiles p
         where p.user_id = cognito_subject
           and lower(p.email_snapshot) = normalized_email
       ) then
      return query select 'already_complete', existing_membership_id, existing_role,
        existing_status, existing_created_at, existing_updated_at;
    else
      return query select 'duplicate_membership', null::uuid, null::text,
        null::text, null::timestamptz, null::timestamptz;
    end if;
    return;
  end if;

  if exists (
    select 1 from app.profiles p
    where p.user_id = cognito_subject
       or lower(p.email_snapshot) = normalized_email
  ) then
    return query select 'duplicate_email', null::uuid, null::text,
      null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  insert into app.profiles (
    user_id, email_snapshot, display_name, created_by, updated_by
  ) values (
    cognito_subject, normalized_email, '', resolved_actor_id, resolved_actor_id
  );

  insert into app.organization_memberships (
    organization_id, user_id, role, status, created_by, updated_by
  ) values (
    resolved_organization_id, cognito_subject, target_role, 'active',
    resolved_actor_id, resolved_actor_id
  )
  returning id, created_at, updated_at
    into new_membership_id, new_created_at, new_updated_at;

  insert into app.audit_events (
    organization_id, actor_id, action, entity_type, entity_id,
    request_id, metadata, created_by, updated_by
  ) values (
    resolved_organization_id, resolved_actor_id, 'membership.invited',
    'organization_membership', new_membership_id, request_identifier,
    jsonb_build_object(
      'targetRole', target_role,
      'recoveryInvocation', coalesce(recovery_invocation, false)
    ),
    resolved_actor_id, resolved_actor_id
  );

  return query select 'created', new_membership_id, target_role, 'active',
    new_created_at, new_updated_at;
end
$$;

create or replace function app_private.update_staff_membership_role(
  caller_subject text,
  target_membership_id uuid,
  target_role text,
  request_identifier text
)
returns table(
  outcome text,
  membership_id uuid,
  membership_role text,
  membership_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_actor_id text;
  resolved_organization_id uuid;
  resolved_actor_role text;
  target_user_id text;
  current_role text;
  current_status text;
  active_owner_count integer;
begin
  select c.actor_id, c.organization_id, c.actor_role
    into resolved_actor_id, resolved_organization_id, resolved_actor_role
  from app_private.membership_manager_context(caller_subject) c;

  if resolved_actor_id is null then
    return query select 'active_membership_required', null::uuid, null::text, null::text;
    return;
  end if;
  if resolved_actor_role <> 'owner' then
    return query select 'membership_management_forbidden', null::uuid, null::text, null::text;
    return;
  end if;
  if target_role not in ('admin', 'staff') then
    return query select 'target_role_forbidden', null::uuid, null::text, null::text;
    return;
  end if;

  select m.user_id, m.role, m.status
    into target_user_id, current_role, current_status
  from app.organization_memberships m
  where m.id = target_membership_id
    and m.organization_id = resolved_organization_id;

  if target_user_id is null then
    return query select 'target_not_found', null::uuid, null::text, null::text;
    return;
  end if;
  if target_user_id = resolved_actor_id then
    return query select 'self_action_forbidden', null::uuid, null::text, null::text;
    return;
  end if;
  if current_role = 'owner' then
    select count(*) into active_owner_count
    from app.organization_memberships m
    where m.organization_id = resolved_organization_id
      and m.role = 'owner' and m.status = 'active';
    return query select
      case when active_owner_count <= 1 then 'last_owner_protected' else 'owner_protected' end,
      null::uuid, null::text, null::text;
    return;
  end if;
  if current_status = 'removed' then
    return query select 'membership_state_conflict', null::uuid, null::text, null::text;
    return;
  end if;
  if current_role = target_role then
    return query select 'already_complete', target_membership_id, current_role, current_status;
    return;
  end if;

  update app.organization_memberships
  set role = target_role, updated_by = resolved_actor_id
  where id = target_membership_id and organization_id = resolved_organization_id;

  insert into app.audit_events (
    organization_id, actor_id, action, entity_type, entity_id,
    request_id, metadata, created_by, updated_by
  ) values (
    resolved_organization_id, resolved_actor_id, 'membership.role_changed',
    'organization_membership', target_membership_id, request_identifier,
    jsonb_build_object('fromRole', current_role, 'toRole', target_role),
    resolved_actor_id, resolved_actor_id
  );

  return query select 'updated', target_membership_id, target_role, current_status;
end
$$;

create or replace function app_private.update_staff_membership_status(
  caller_subject text,
  target_membership_id uuid,
  requested_action text,
  request_identifier text
)
returns table(
  outcome text,
  membership_id uuid,
  membership_role text,
  membership_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_actor_id text;
  resolved_organization_id uuid;
  resolved_actor_role text;
  target_user_id text;
  target_role text;
  current_status text;
  desired_status text;
  audit_action text;
  active_owner_count integer;
begin
  select c.actor_id, c.organization_id, c.actor_role
    into resolved_actor_id, resolved_organization_id, resolved_actor_role
  from app_private.membership_manager_context(caller_subject) c;

  if resolved_actor_id is null then
    return query select 'active_membership_required', null::uuid, null::text, null::text;
    return;
  end if;
  if resolved_actor_role not in ('owner', 'admin') then
    return query select 'membership_management_forbidden', null::uuid, null::text, null::text;
    return;
  end if;
  desired_status := case requested_action
    when 'disable' then 'disabled'
    when 'enable' then 'active'
    when 'remove' then 'removed'
    else null
  end;
  audit_action := case requested_action
    when 'disable' then 'membership.disabled'
    when 'enable' then 'membership.enabled'
    when 'remove' then 'membership.removed'
    else null
  end;
  if desired_status is null then
    return query select 'membership_state_conflict', null::uuid, null::text, null::text;
    return;
  end if;

  select m.user_id, m.role, m.status
    into target_user_id, target_role, current_status
  from app.organization_memberships m
  where m.id = target_membership_id
    and m.organization_id = resolved_organization_id;

  if target_user_id is null then
    return query select 'target_not_found', null::uuid, null::text, null::text;
    return;
  end if;
  if target_user_id = resolved_actor_id then
    return query select 'self_action_forbidden', null::uuid, null::text, null::text;
    return;
  end if;
  if target_role = 'owner' then
    select count(*) into active_owner_count
    from app.organization_memberships m
    where m.organization_id = resolved_organization_id
      and m.role = 'owner' and m.status = 'active';
    return query select
      case when active_owner_count <= 1 then 'last_owner_protected' else 'owner_protected' end,
      null::uuid, null::text, null::text;
    return;
  end if;
  if resolved_actor_role = 'admin' and target_role <> 'staff' then
    return query select 'membership_management_forbidden', null::uuid, null::text, null::text;
    return;
  end if;
  if current_status = desired_status then
    return query select 'already_complete', target_membership_id, target_role, current_status;
    return;
  end if;
  if current_status = 'removed'
     or (requested_action = 'disable' and current_status <> 'active')
     or (requested_action = 'enable' and current_status <> 'disabled')
     or (requested_action = 'remove' and current_status not in ('active', 'disabled')) then
    return query select 'membership_state_conflict', null::uuid, null::text, null::text;
    return;
  end if;
  if desired_status = 'active' and exists (
    select 1 from app.organization_memberships m
    where m.user_id = target_user_id and m.status = 'active'
      and m.id <> target_membership_id
  ) then
    return query select 'duplicate_membership', null::uuid, null::text, null::text;
    return;
  end if;

  update app.organization_memberships
  set status = desired_status, updated_by = resolved_actor_id
  where id = target_membership_id and organization_id = resolved_organization_id;

  insert into app.audit_events (
    organization_id, actor_id, action, entity_type, entity_id,
    request_id, metadata, created_by, updated_by
  ) values (
    resolved_organization_id, resolved_actor_id, audit_action,
    'organization_membership', target_membership_id, request_identifier,
    jsonb_build_object(
      'previousStatus', current_status,
      'newStatus', desired_status,
      'targetRole', target_role
    ),
    resolved_actor_id, resolved_actor_id
  );

  return query select 'updated', target_membership_id, target_role, desired_status;
end
$$;

create or replace function app_private.update_own_profile(
  caller_subject text,
  requested_display_name text,
  request_identifier text
)
returns table(outcome text, display_name text, email_snapshot text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_actor_id text;
  resolved_organization_id uuid;
  resolved_role text;
  normalized_display_name text := btrim(requested_display_name);
  resolved_email text;
begin
  select c.actor_id, c.organization_id, c.actor_role
    into resolved_actor_id, resolved_organization_id, resolved_role
  from app_private.membership_manager_context(caller_subject) c;

  if resolved_actor_id is null then
    return query select 'active_membership_required', null::text, null::text;
    return;
  end if;
  if normalized_display_name = '' or length(normalized_display_name) > 120 then
    return query select 'database_contract_error', null::text, null::text;
    return;
  end if;

  update app.profiles as p
  set display_name = normalized_display_name, updated_by = resolved_actor_id
  where p.user_id = resolved_actor_id
  returning p.email_snapshot into resolved_email;

  if resolved_email is null then
    return query select 'database_contract_error', null::text, null::text;
    return;
  end if;

  insert into app.audit_events (
    organization_id, actor_id, action, entity_type, entity_id,
    request_id, metadata, created_by, updated_by
  ) values (
    resolved_organization_id, resolved_actor_id, 'profile.display_name_updated',
    'profile', null, request_identifier,
    jsonb_build_object('field', 'display_name'),
    resolved_actor_id, resolved_actor_id
  );

  return query select 'updated', normalized_display_name, resolved_email;
end
$$;

revoke all on function app_private.membership_manager_context(text) from public;
revoke all on function app_private.create_staff_membership(text, text, text, text, text, boolean) from public;
revoke all on function app_private.update_staff_membership_role(text, uuid, text, text) from public;
revoke all on function app_private.update_staff_membership_status(text, uuid, text, text) from public;
revoke all on function app_private.update_own_profile(text, text, text) from public;

grant execute on function app_private.membership_manager_context(text),
  app_private.create_staff_membership(text, text, text, text, text, boolean),
  app_private.update_staff_membership_role(text, uuid, text, text),
  app_private.update_staff_membership_status(text, uuid, text, text),
  app_private.update_own_profile(text, text, text)
  to perfect_shade_app_runtime;

revoke insert, update, delete on app.profiles, app.organization_memberships
  from perfect_shade_app_runtime;
revoke delete on app.audit_events from perfect_shade_app_runtime;
revoke create on schema app, app_private from perfect_shade_app_runtime;
