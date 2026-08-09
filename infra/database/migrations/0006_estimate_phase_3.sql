-- Perfect Shade estimate editor, Phase 3.
-- Adds controlled draft replacement for ordered terms and addenda without granting
-- the Lambda runtime role unrestricted physical-delete privileges.

create policy tenant_delete_draft_child
on app.estimate_terms
for delete
using (
  organization_id = app_private.current_organization_id()
  and exists (
    select 1
    from app.estimates e
    where e.organization_id = estimate_terms.organization_id
      and e.id = estimate_terms.estimate_id
      and e.status = 'draft'
      and e.deleted_at is null
  )
);

create policy tenant_delete_draft_child
on app.estimate_addenda
for delete
using (
  organization_id = app_private.current_organization_id()
  and exists (
    select 1
    from app.estimates e
    where e.organization_id = estimate_addenda.organization_id
      and e.id = estimate_addenda.estimate_id
      and e.status = 'draft'
      and e.deleted_at is null
  )
);

create or replace function app_private.replace_estimate_phase_3_content(
  target_estimate_id uuid,
  terms jsonb,
  addenda jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $phase_3$
declare
  resolved_organization_id uuid := app_private.current_organization_id();
  resolved_actor_id text := app_private.current_actor_id();
begin
  if resolved_organization_id is null or resolved_actor_id is null then
    raise exception 'active_membership_required' using errcode = '28000';
  end if;

  if jsonb_typeof(terms) <> 'array' or jsonb_typeof(addenda) <> 'array' then
    raise exception 'estimate_content_must_be_arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(terms) > 20 then
    raise exception 'additional_term_limit_exceeded' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from app.estimates e
    where e.organization_id = resolved_organization_id
      and e.id = target_estimate_id
      and e.status = 'draft'
      and e.deleted_at is null
  ) then
    raise exception 'editable_estimate_not_found' using errcode = '55000';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(terms || addenda) item
    where jsonb_typeof(item) <> 'object'
       or btrim(coalesce(item ->> 'description', '')) = ''
  ) then
    raise exception 'invalid_estimate_text_item' using errcode = '22023';
  end if;

  delete from app.estimate_terms
  where organization_id = resolved_organization_id
    and estimate_id = target_estimate_id;

  delete from app.estimate_addenda
  where organization_id = resolved_organization_id
    and estimate_id = target_estimate_id;

  insert into app.estimate_terms (
    id, organization_id, estimate_id, sort_order, description,
    created_by, updated_by
  )
  select gen_random_uuid(), resolved_organization_id, target_estimate_id,
         (item.ordinality - 1)::integer, btrim(item.value ->> 'description'),
         resolved_actor_id, resolved_actor_id
  from jsonb_array_elements(terms) with ordinality as item(value, ordinality);

  insert into app.estimate_addenda (
    id, organization_id, estimate_id, sort_order, description,
    created_by, updated_by
  )
  select gen_random_uuid(), resolved_organization_id, target_estimate_id,
         (item.ordinality - 1)::integer, btrim(item.value ->> 'description'),
         resolved_actor_id, resolved_actor_id
  from jsonb_array_elements(addenda) with ordinality as item(value, ordinality);
end
$phase_3$;

revoke all on function app_private.replace_estimate_phase_3_content(
  uuid, jsonb, jsonb
) from public;
grant execute on function app_private.replace_estimate_phase_3_content(
  uuid, jsonb, jsonb
) to perfect_shade_app_runtime;

-- The runtime role still has no direct DELETE grant. Replacements are constrained by
-- forced RLS, current-organization context, the parent draft state, and this reviewed function.
