-- Perfect Shade estimate editor, Phase 2.
-- Adds a narrowly controlled child-row replacement function without granting the
-- Lambda runtime role unrestricted physical-delete privileges.

create policy tenant_delete_draft_child
on app.estimate_scope_items
for delete
using (
  organization_id = app_private.current_organization_id()
  and exists (
    select 1
    from app.estimates e
    where e.organization_id = estimate_scope_items.organization_id
      and e.id = estimate_scope_items.estimate_id
      and e.status = 'draft'
      and e.deleted_at is null
  )
);

create policy tenant_delete_draft_child
on app.estimate_pricing_lines
for delete
using (
  organization_id = app_private.current_organization_id()
  and exists (
    select 1
    from app.estimates e
    where e.organization_id = estimate_pricing_lines.organization_id
      and e.id = estimate_pricing_lines.estimate_id
      and e.status = 'draft'
      and e.deleted_at is null
  )
);

create or replace function app_private.replace_estimate_phase_2_rows(
  target_estimate_id uuid,
  scope_items jsonb,
  pricing_lines jsonb,
  alternate_pricing_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $phase_2$
declare
  resolved_organization_id uuid := app_private.current_organization_id();
  resolved_actor_id text := app_private.current_actor_id();
begin
  if resolved_organization_id is null or resolved_actor_id is null then
    raise exception 'active_membership_required' using errcode = '28000';
  end if;

  if jsonb_typeof(scope_items) <> 'array'
     or jsonb_typeof(pricing_lines) <> 'array'
     or jsonb_typeof(alternate_pricing_lines) <> 'array' then
    raise exception 'estimate_rows_must_be_arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(scope_items) > 20 then
    raise exception 'scope_item_limit_exceeded' using errcode = '22023';
  end if;
  if jsonb_array_length(pricing_lines) < 1
     or jsonb_array_length(pricing_lines) > 50 then
    raise exception 'pricing_line_count_invalid' using errcode = '22023';
  end if;
  if jsonb_array_length(alternate_pricing_lines) > 20 then
    raise exception 'alternate_pricing_line_limit_exceeded' using errcode = '22023';
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
    from jsonb_array_elements(scope_items) item
    where jsonb_typeof(item) <> 'object'
       or btrim(coalesce(item ->> 'description', '')) = ''
  ) then
    raise exception 'invalid_scope_item' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(pricing_lines || alternate_pricing_lines) item
    where jsonb_typeof(item) <> 'object'
       or coalesce(item ->> 'amountMinor', '') !~ '^(0|-?[1-9][0-9]*)$'
       or (item ->> 'amountMinor')::numeric < -9223372036854775808
       or (item ->> 'amountMinor')::numeric > 9223372036854775807
  ) then
    raise exception 'invalid_pricing_line' using errcode = '22023';
  end if;

  delete from app.estimate_scope_items
  where organization_id = resolved_organization_id
    and estimate_id = target_estimate_id;

  delete from app.estimate_pricing_lines
  where organization_id = resolved_organization_id
    and estimate_id = target_estimate_id;

  insert into app.estimate_scope_items (
    id, organization_id, estimate_id, sort_order, description,
    created_by, updated_by
  )
  select gen_random_uuid(), resolved_organization_id, target_estimate_id,
         (item.ordinality - 1)::integer, btrim(item.value ->> 'description'),
         resolved_actor_id, resolved_actor_id
  from jsonb_array_elements(scope_items) with ordinality as item(value, ordinality);

  insert into app.estimate_pricing_lines (
    id, organization_id, estimate_id, kind, sort_order, description,
    amount_minor, created_by, updated_by
  )
  select gen_random_uuid(), resolved_organization_id, target_estimate_id,
         'base', (item.ordinality - 1)::integer,
         btrim(coalesce(item.value ->> 'description', '')),
         (item.value ->> 'amountMinor')::bigint,
         resolved_actor_id, resolved_actor_id
  from jsonb_array_elements(pricing_lines) with ordinality as item(value, ordinality);

  insert into app.estimate_pricing_lines (
    id, organization_id, estimate_id, kind, sort_order, description,
    amount_minor, created_by, updated_by
  )
  select gen_random_uuid(), resolved_organization_id, target_estimate_id,
         'alternate', (item.ordinality - 1)::integer,
         btrim(coalesce(item.value ->> 'description', '')),
         (item.value ->> 'amountMinor')::bigint,
         resolved_actor_id, resolved_actor_id
  from jsonb_array_elements(alternate_pricing_lines)
       with ordinality as item(value, ordinality);

  if exists (
    select 1
    from app.estimates e
    where e.organization_id = resolved_organization_id
      and e.id = target_estimate_id
      and e.subtotal_minor <> (
        select coalesce(sum(line.amount_minor), 0)::bigint
        from app.estimate_pricing_lines line
        where line.organization_id = resolved_organization_id
          and line.estimate_id = target_estimate_id
          and line.kind = 'base'
      )
  ) then
    raise exception 'estimate_pricing_totals_mismatch' using errcode = '23514';
  end if;

  if exists (
    select 1
    from app.estimates e
    where e.organization_id = resolved_organization_id
      and e.id = target_estimate_id
      and e.include_alternate_pricing
      and not exists (
        select 1
        from app.estimate_pricing_lines line
        where line.organization_id = resolved_organization_id
          and line.estimate_id = target_estimate_id
          and line.kind = 'alternate'
      )
  ) then
    raise exception 'enabled_alternate_pricing_requires_a_line'
      using errcode = '23514';
  end if;
end
$phase_2$;

revoke all on function app_private.replace_estimate_phase_2_rows(
  uuid, jsonb, jsonb, jsonb
) from public;
grant execute on function app_private.replace_estimate_phase_2_rows(
  uuid, jsonb, jsonb, jsonb
) to perfect_shade_app_runtime;

-- The runtime role still has no direct DELETE grant. Deletes are possible only through
-- the reviewed security-definer function, forced RLS, current-organization predicates,
-- and the draft-only delete policies above.
