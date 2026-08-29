-- Controlled Cognito subject relinking for disaster or accidental identity recreation.
-- This function is migration/operator-only and is never granted to the application runtime.

create or replace function app_private.relink_staff_identity(
  authorized_owner_subject text,
  expected_organization_id uuid,
  old_cognito_subject text,
  new_cognito_subject text,
  expected_email text,
  authorization_reference text,
  request_identifier text,
  apply_change boolean
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
  normalized_email text := lower(btrim(expected_email));
  owner_role text;
  owner_status text;
  target_membership_id uuid;
  target_role text;
  target_status text;
  target_email text;
  completed_membership_id uuid;
  completed_role text;
  completed_status text;
  updated_profile_count integer;
begin
  if authorized_owner_subject is null or btrim(authorized_owner_subject) = ''
     or expected_organization_id is null
     or old_cognito_subject is null or btrim(old_cognito_subject) = ''
     or new_cognito_subject is null or btrim(new_cognito_subject) = ''
     or old_cognito_subject = new_cognito_subject
     or normalized_email = '' or position('@' in normalized_email) < 2
     or authorization_reference is null or btrim(authorization_reference) = ''
     or length(authorization_reference) > 200
     or request_identifier is null or btrim(request_identifier) = '' then
    return query select 'invalid_recovery_request', null::uuid, null::text, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'identity-relink:' || least(old_cognito_subject, new_cognito_subject) || ':' ||
      greatest(old_cognito_subject, new_cognito_subject),
      0
    )
  );

  -- Establish only actor context before resolving authorization. This also keeps the function
  -- compatible with the account tables' forced-RLS posture when invoked by a constrained
  -- administrative recovery identity.
  perform set_config('app.actor_id', authorized_owner_subject, true);

  select m.role, m.status
    into owner_role, owner_status
  from app.organization_memberships m
  where m.organization_id = expected_organization_id
    and m.user_id = authorized_owner_subject;

  if owner_role is distinct from 'owner' or owner_status is distinct from 'active' then
    -- An owner who recovered their own identity is no longer addressable by the old authorizing
    -- subject. Permit only the exact completed old-to-new transition to report idempotent success.
    if authorized_owner_subject = old_cognito_subject then
      perform set_config('app.actor_id', new_cognito_subject, true);
      select m.id, m.role, m.status
        into completed_membership_id, completed_role, completed_status
      from app.organization_memberships m
      join app.profiles p on p.user_id = m.user_id
      where m.organization_id = expected_organization_id
        and m.user_id = new_cognito_subject
        and m.role = 'owner'
        and m.status = 'active'
        and lower(p.email_snapshot) = normalized_email;

      if completed_membership_id is not null then
        return query select 'already_complete', completed_membership_id,
          completed_role, completed_status;
        return;
      end if;
    end if;
    return query select 'authorization_required', null::uuid, null::text, null::text;
    return;
  end if;

  perform set_config('app.organization_id', expected_organization_id::text, true);
  perform set_config('app.organization_role', 'owner', true);

  select m.id, m.role, m.status, lower(p.email_snapshot)
    into target_membership_id, target_role, target_status, target_email
  from app.organization_memberships m
  join app.profiles p on p.user_id = m.user_id
  where m.organization_id = expected_organization_id
    and m.user_id = old_cognito_subject;

  if target_membership_id is null then
    select m.id, m.role, m.status
      into completed_membership_id, completed_role, completed_status
    from app.organization_memberships m
    join app.profiles p on p.user_id = m.user_id
    where m.organization_id = expected_organization_id
      and m.user_id = new_cognito_subject
      and lower(p.email_snapshot) = normalized_email;

    if completed_membership_id is not null then
      return query select 'already_complete', completed_membership_id,
        completed_role, completed_status;
    else
      return query select 'target_not_found', null::uuid, null::text, null::text;
    end if;
    return;
  end if;

  if target_email <> normalized_email then
    return query select 'identity_mismatch', null::uuid, null::text, null::text;
    return;
  end if;

  if exists (select 1 from app.profiles p where p.user_id = new_cognito_subject)
     or exists (
       select 1 from app.organization_memberships m where m.user_id = new_cognito_subject
     ) then
    return query select 'replacement_conflict', null::uuid, null::text, null::text;
    return;
  end if;

  if not coalesce(apply_change, false) then
    return query select 'ready', target_membership_id, target_role, target_status;
    return;
  end if;

  update app.profiles
  set user_id = new_cognito_subject, updated_by = authorized_owner_subject
  where user_id = old_cognito_subject;

  get diagnostics updated_profile_count = row_count;
  if updated_profile_count <> 1 then
    raise exception 'identity_relink_concurrent_profile_change' using errcode = '40001';
  end if;

  update app.organization_memberships
  set user_id = new_cognito_subject, updated_by = authorized_owner_subject
  where id = target_membership_id
    and organization_id = expected_organization_id
    and user_id = old_cognito_subject;

  if not found then
    raise exception 'identity_relink_concurrent_change' using errcode = '40001';
  end if;

  insert into app.audit_events (
    organization_id, actor_id, action, entity_type, entity_id,
    request_id, metadata, created_by, updated_by
  ) values (
    expected_organization_id,
    authorized_owner_subject,
    'identity.relinked',
    'organization_membership',
    target_membership_id,
    request_identifier,
    jsonb_build_object(
      'oldCognitoSubject', old_cognito_subject,
      'newCognitoSubject', new_cognito_subject,
      'authorizationReference', btrim(authorization_reference),
      'preservedRole', target_role,
      'preservedStatus', target_status
    ),
    authorized_owner_subject,
    authorized_owner_subject
  );

  return query select 'relinked', target_membership_id, target_role, target_status;
end
$$;

revoke all on function app_private.relink_staff_identity(
  text, uuid, text, text, text, text, text, boolean
) from public;
revoke all on function app_private.relink_staff_identity(
  text, uuid, text, text, text, text, text, boolean
) from perfect_shade_app_runtime;
