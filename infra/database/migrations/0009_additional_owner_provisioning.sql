-- Controlled provisioning for an additional organization owner.
-- Apply after 0008_identity_recovery.sql with the administrative migration identity.

create or replace function app_private.provision_additional_owner(
  expected_organization_id uuid,
  new_owner_subject text,
  new_owner_email text,
  authorized_owner_subject text,
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
  normalized_email text := lower(btrim(new_owner_email));
  active_owner_count integer;
  authorizer_role text;
  authorizer_status text;
  existing_profile_subject text;
  existing_membership_id uuid;
  existing_membership_organization_id uuid;
  existing_membership_role text;
  existing_membership_status text;
  created_membership_id uuid;
begin
  if expected_organization_id is null
     or authorized_owner_subject is null or btrim(authorized_owner_subject) = ''
     or length(authorized_owner_subject) > 200
     or authorized_owner_subject ~ '[[:cntrl:]]'
     or normalized_email = ''
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(normalized_email) > 320
     or authorization_reference is null or btrim(authorization_reference) = ''
     or length(authorization_reference) > 200
     or authorization_reference ~ '[[:cntrl:]]'
     or request_identifier is null or btrim(request_identifier) = ''
     or length(request_identifier) > 200
     or request_identifier ~ '[[:cntrl:]]'
     or (new_owner_subject is not null and (
       length(new_owner_subject) > 200 or new_owner_subject ~ '[[:cntrl:]]'
     ))
     or (coalesce(apply_change, false)
       and (new_owner_subject is null or btrim(new_owner_subject) = '')) then
    return query select 'invalid_request', null::uuid, null::text, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'additional-owner:' || expected_organization_id::text || ':' || normalized_email,
      0
    )
  );

  if not exists (
    select 1 from app.organizations o where o.id = expected_organization_id
  ) then
    return query select 'organization_missing', null::uuid, null::text, null::text;
    return;
  end if;

  select count(*) into active_owner_count
  from app.organization_memberships m
  where m.organization_id = expected_organization_id
    and m.role = 'owner'
    and m.status = 'active';

  if active_owner_count < 1 then
    return query select 'no_active_owner', null::uuid, null::text, null::text;
    return;
  end if;

  select m.role, m.status
    into authorizer_role, authorizer_status
  from app.organization_memberships m
  where m.organization_id = expected_organization_id
    and m.user_id = authorized_owner_subject;

  if authorizer_role is distinct from 'owner'
     or authorizer_status is distinct from 'active' then
    return query select 'authorization_required', null::uuid, null::text, null::text;
    return;
  end if;

  if new_owner_subject is not null and btrim(new_owner_subject) <> '' then
    select m.id, m.organization_id, m.role, m.status
      into existing_membership_id, existing_membership_organization_id,
        existing_membership_role, existing_membership_status
    from app.organization_memberships m
    where m.user_id = new_owner_subject
    order by m.created_at
    limit 1;

    if existing_membership_id is not null then
      if existing_membership_organization_id <> expected_organization_id then
        return query select 'cross_organization_conflict', null::uuid, null::text, null::text;
        return;
      end if;
      if existing_membership_role = 'owner'
         and existing_membership_status = 'active'
         and exists (
           select 1 from app.profiles p
           where p.user_id = new_owner_subject
             and lower(p.email_snapshot) = normalized_email
         ) then
        return query select 'already_complete', existing_membership_id,
          existing_membership_role, existing_membership_status;
        return;
      end if;
      return query select 'identity_conflict', null::uuid, null::text, null::text;
      return;
    end if;

    if exists (
      select 1 from app.profiles p
      where p.user_id = new_owner_subject
        and lower(p.email_snapshot) <> normalized_email
    ) then
      return query select 'identity_conflict', null::uuid, null::text, null::text;
      return;
    end if;
  end if;

  select p.user_id into existing_profile_subject
  from app.profiles p
  where lower(p.email_snapshot) = normalized_email;

  if existing_profile_subject is not null then
    if exists (
      select 1 from app.organization_memberships m
      where m.user_id = existing_profile_subject
        and m.organization_id <> expected_organization_id
    ) then
      return query select 'cross_organization_conflict', null::uuid, null::text, null::text;
    else
      return query select 'identity_conflict', null::uuid, null::text, null::text;
    end if;
    return;
  end if;

  if not coalesce(apply_change, false) then
    return query select 'ready', null::uuid, 'owner'::text, 'active'::text;
    return;
  end if;

  insert into app.profiles (
    user_id, email_snapshot, display_name, created_by, updated_by
  ) values (
    new_owner_subject,
    normalized_email,
    split_part(normalized_email, '@', 1),
    authorized_owner_subject,
    authorized_owner_subject
  );

  insert into app.organization_memberships (
    organization_id, user_id, role, status, created_by, updated_by
  ) values (
    expected_organization_id,
    new_owner_subject,
    'owner',
    'active',
    authorized_owner_subject,
    authorized_owner_subject
  )
  returning id into created_membership_id;

  insert into app.audit_events (
    organization_id, actor_id, action, entity_type, entity_id,
    request_id, metadata, created_by, updated_by
  ) values (
    expected_organization_id,
    authorized_owner_subject,
    'organization.additional_owner_provisioned',
    'organization_membership',
    created_membership_id,
    request_identifier,
    jsonb_build_object(
      'role', 'owner',
      'source', 'admin_additional_owner_command',
      'authorizationReference', btrim(authorization_reference)
    ),
    authorized_owner_subject,
    authorized_owner_subject
  );

  return query select 'created', created_membership_id, 'owner'::text, 'active'::text;
end
$$;

revoke all on function app_private.provision_additional_owner(
  uuid, text, text, text, text, text, boolean
) from public;
revoke all on function app_private.provision_additional_owner(
  uuid, text, text, text, text, text, boolean
) from perfect_shade_app_runtime;
