create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  contact_information text not null default '',
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid not null,
  name text not null check (btrim(name) <> ''),
  location text not null default '',
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, customer_id)
    references public.customers(organization_id, id) on delete restrict
);

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null,
  source_estimate_id uuid,
  revision_number integer not null default 1 check (revision_number >= 1),
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
  tax_rate_percent numeric not null default 0,
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
  sales_tax_minor bigint not null default 0,
  total_minor bigint not null default 0,
  required_deposit_minor bigint not null default 0,
  remaining_balance_minor bigint not null default 0,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issued_at timestamptz,
  archived_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, project_id)
    references public.projects(organization_id, id) on delete restrict,
  foreign key (organization_id, source_estimate_id)
    references public.estimates(organization_id, id) on delete restrict,
  check (sales_tax_minor = 0),
  check (total_minor = subtotal_minor),
  check (required_deposit_minor =
    round(total_minor::numeric * deposit_percent / 100)::bigint),
  check (remaining_balance_minor = total_minor - required_deposit_minor)
);

create table public.estimate_scope_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  estimate_id uuid not null,
  sort_order integer not null check (sort_order >= 0),
  description text not null check (btrim(description) <> ''),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (estimate_id, sort_order),
  unique (organization_id, id),
  foreign key (organization_id, estimate_id)
    references public.estimates(organization_id, id) on delete cascade
);

create table public.estimate_pricing_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  estimate_id uuid not null,
  kind text not null check (kind in ('base', 'alternate')),
  sort_order integer not null check (sort_order >= 0),
  description text not null default '',
  amount_minor bigint not null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (estimate_id, kind, sort_order),
  unique (organization_id, id),
  foreign key (organization_id, estimate_id)
    references public.estimates(organization_id, id) on delete cascade
);

create table public.estimate_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  estimate_id uuid not null,
  sort_order integer not null check (sort_order >= 0),
  description text not null check (btrim(description) <> ''),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (estimate_id, sort_order),
  unique (organization_id, id),
  foreign key (organization_id, estimate_id)
    references public.estimates(organization_id, id) on delete cascade
);

create table public.estimate_addenda (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  estimate_id uuid not null,
  sort_order integer not null check (sort_order >= 0),
  description text not null check (btrim(description) <> ''),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (estimate_id, sort_order),
  unique (organization_id, id),
  foreign key (organization_id, estimate_id)
    references public.estimates(organization_id, id) on delete cascade
);

create index customers_organization_name_idx on public.customers(organization_id, name);
create index projects_organization_customer_idx
  on public.projects(organization_id, customer_id, created_at desc);
create index estimates_organization_status_idx
  on public.estimates(organization_id, status, updated_at desc);
create index estimates_organization_project_idx
  on public.estimates(organization_id, project_id, created_at desc);
create index estimate_scope_items_organization_estimate_idx
  on public.estimate_scope_items(organization_id, estimate_id, sort_order);
create index estimate_pricing_lines_organization_estimate_idx
  on public.estimate_pricing_lines(organization_id, estimate_id, kind, sort_order);
create index estimate_terms_organization_estimate_idx
  on public.estimate_terms(organization_id, estimate_id, sort_order);
create index estimate_addenda_organization_estimate_idx
  on public.estimate_addenda(organization_id, estimate_id, sort_order);

create or replace function public.prevent_organization_id_change()
returns trigger language plpgsql as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'organization_id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger customers_set_updated_fields before update on public.customers
for each row execute function public.set_updated_fields();
create trigger projects_set_updated_fields before update on public.projects
for each row execute function public.set_updated_fields();
create trigger estimates_set_updated_fields before update on public.estimates
for each row execute function public.set_updated_fields();
create trigger estimate_scope_items_set_updated_fields
before update on public.estimate_scope_items
for each row execute function public.set_updated_fields();
create trigger estimate_pricing_lines_set_updated_fields
before update on public.estimate_pricing_lines
for each row execute function public.set_updated_fields();
create trigger estimate_terms_set_updated_fields before update on public.estimate_terms
for each row execute function public.set_updated_fields();
create trigger estimate_addenda_set_updated_fields before update on public.estimate_addenda
for each row execute function public.set_updated_fields();

create trigger customers_prevent_organization_change before update on public.customers
for each row execute function public.prevent_organization_id_change();
create trigger projects_prevent_organization_change before update on public.projects
for each row execute function public.prevent_organization_id_change();
create trigger estimates_prevent_organization_change before update on public.estimates
for each row execute function public.prevent_organization_id_change();
create trigger estimate_scope_items_prevent_organization_change
before update on public.estimate_scope_items
for each row execute function public.prevent_organization_id_change();
create trigger estimate_pricing_lines_prevent_organization_change
before update on public.estimate_pricing_lines
for each row execute function public.prevent_organization_id_change();
create trigger estimate_terms_prevent_organization_change
before update on public.estimate_terms
for each row execute function public.prevent_organization_id_change();
create trigger estimate_addenda_prevent_organization_change
before update on public.estimate_addenda
for each row execute function public.prevent_organization_id_change();

alter table public.customers enable row level security;
alter table public.projects enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_scope_items enable row level security;
alter table public.estimate_pricing_lines enable row level security;
alter table public.estimate_terms enable row level security;
alter table public.estimate_addenda enable row level security;

create policy "members read customers" on public.customers for select
  using (public.is_organization_member(organization_id));
create policy "members create customers" on public.customers for insert
  with check (
    public.is_organization_member(organization_id)
    and created_by = auth.uid() and updated_by = auth.uid()
  );
create policy "members update customers" on public.customers for update
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
create policy "owners and admins delete customers" on public.customers for delete
  using (public.has_organization_role(
    organization_id, array['owner', 'admin']::public.organization_role[]
  ));

create policy "members read projects" on public.projects for select
  using (public.is_organization_member(organization_id));
create policy "members create projects" on public.projects for insert
  with check (
    public.is_organization_member(organization_id)
    and created_by = auth.uid() and updated_by = auth.uid()
  );
create policy "members update projects" on public.projects for update
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
create policy "owners and admins delete projects" on public.projects for delete
  using (public.has_organization_role(
    organization_id, array['owner', 'admin']::public.organization_role[]
  ));

create policy "members read estimates" on public.estimates for select
  using (public.is_organization_member(organization_id));
create policy "members create estimates" on public.estimates for insert
  with check (
    public.is_organization_member(organization_id)
    and created_by = auth.uid() and updated_by = auth.uid()
  );
create policy "members update estimates" on public.estimates for update
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
create policy "owners and admins delete estimates" on public.estimates for delete
  using (public.has_organization_role(
    organization_id, array['owner', 'admin']::public.organization_role[]
  ));

create policy "members read estimate scope" on public.estimate_scope_items for select
  using (public.is_organization_member(organization_id));
create policy "members create estimate scope" on public.estimate_scope_items for insert
  with check (
    public.is_organization_member(organization_id)
    and created_by = auth.uid() and updated_by = auth.uid()
  );
create policy "members update estimate scope" on public.estimate_scope_items for update
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
create policy "owners and admins delete estimate scope"
  on public.estimate_scope_items for delete
  using (public.has_organization_role(
    organization_id, array['owner', 'admin']::public.organization_role[]
  ));

create policy "members read estimate pricing" on public.estimate_pricing_lines for select
  using (public.is_organization_member(organization_id));
create policy "members create estimate pricing" on public.estimate_pricing_lines for insert
  with check (
    public.is_organization_member(organization_id)
    and created_by = auth.uid() and updated_by = auth.uid()
  );
create policy "members update estimate pricing" on public.estimate_pricing_lines for update
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
create policy "owners and admins delete estimate pricing"
  on public.estimate_pricing_lines for delete
  using (public.has_organization_role(
    organization_id, array['owner', 'admin']::public.organization_role[]
  ));

create policy "members read estimate terms" on public.estimate_terms for select
  using (public.is_organization_member(organization_id));
create policy "members create estimate terms" on public.estimate_terms for insert
  with check (
    public.is_organization_member(organization_id)
    and created_by = auth.uid() and updated_by = auth.uid()
  );
create policy "members update estimate terms" on public.estimate_terms for update
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
create policy "owners and admins delete estimate terms" on public.estimate_terms for delete
  using (public.has_organization_role(
    organization_id, array['owner', 'admin']::public.organization_role[]
  ));

create policy "members read estimate addenda" on public.estimate_addenda for select
  using (public.is_organization_member(organization_id));
create policy "members create estimate addenda" on public.estimate_addenda for insert
  with check (
    public.is_organization_member(organization_id)
    and created_by = auth.uid() and updated_by = auth.uid()
  );
create policy "members update estimate addenda" on public.estimate_addenda for update
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
create policy "owners and admins delete estimate addenda" on public.estimate_addenda for delete
  using (public.has_organization_role(
    organization_id, array['owner', 'admin']::public.organization_role[]
  ));

create or replace function public.create_estimate_draft(
  target_organization_id uuid,
  customer_name text,
  project_name text,
  project_location text,
  prepared_for text,
  contact_information text,
  document_type text,
  estimate_number text,
  pricing_description text,
  pricing_amount_minor bigint,
  deposit_percent numeric
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  new_customer_id uuid;
  new_project_id uuid;
  new_estimate_id uuid;
  deposit_minor bigint;
begin
  if actor_id is null
    or not public.is_organization_member(target_organization_id) then
    raise exception 'An active organization membership is required';
  end if;
  if btrim(customer_name) = '' then raise exception 'Customer Name is required'; end if;
  if btrim(project_name) = '' then raise exception 'Project Name is required'; end if;
  if btrim(prepared_for) = '' then raise exception 'Architect is required'; end if;
  if document_type not in ('Bid Proposal', 'Estimate') then
    raise exception 'Unsupported document type';
  end if;
  if deposit_percent < 0 or deposit_percent > 100 then
    raise exception 'Deposit %% must be between 0 and 100';
  end if;

  deposit_minor :=
    round(pricing_amount_minor::numeric * deposit_percent / 100)::bigint;

  insert into public.customers (
    organization_id, name, contact_information, created_by, updated_by
  ) values (
    target_organization_id, btrim(customer_name), btrim(contact_information),
    actor_id, actor_id
  ) returning id into new_customer_id;

  insert into public.projects (
    organization_id, customer_id, name, location, created_by, updated_by
  ) values (
    target_organization_id, new_customer_id, btrim(project_name),
    btrim(project_location), actor_id, actor_id
  ) returning id into new_project_id;

  insert into public.estimates (
    organization_id, project_id, document_type, estimate_number,
    project_name, project_location, prepared_for, contact_information,
    deposit_percent, tax_rate_percent, subtotal_minor, sales_tax_minor,
    total_minor, required_deposit_minor, remaining_balance_minor,
    created_by, updated_by
  ) values (
    target_organization_id, new_project_id, document_type, btrim(estimate_number),
    btrim(project_name), btrim(project_location), btrim(prepared_for),
    btrim(contact_information), deposit_percent, 0, pricing_amount_minor, 0,
    pricing_amount_minor, deposit_minor, pricing_amount_minor - deposit_minor,
    actor_id, actor_id
  ) returning id into new_estimate_id;

  insert into public.estimate_pricing_lines (
    organization_id, estimate_id, kind, sort_order, description, amount_minor,
    created_by, updated_by
  ) values (
    target_organization_id, new_estimate_id, 'base', 0,
    btrim(pricing_description), pricing_amount_minor, actor_id, actor_id
  );

  return new_estimate_id;
end;
$$;

revoke all on table public.customers from anon;
revoke all on table public.projects from anon;
revoke all on table public.estimates from anon;
revoke all on table public.estimate_scope_items from anon;
revoke all on table public.estimate_pricing_lines from anon;
revoke all on table public.estimate_terms from anon;
revoke all on table public.estimate_addenda from anon;
grant select, insert, update, delete on table public.customers to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.estimates to authenticated;
grant select, insert, update, delete on table public.estimate_scope_items to authenticated;
grant select, insert, update, delete on table public.estimate_pricing_lines to authenticated;
grant select, insert, update, delete on table public.estimate_terms to authenticated;
grant select, insert, update, delete on table public.estimate_addenda to authenticated;
revoke all on function public.create_estimate_draft(
  uuid, text, text, text, text, text, text, text, text, bigint, numeric
) from public;
grant execute on function public.create_estimate_draft(
  uuid, text, text, text, text, text, text, text, text, bigint, numeric
) to authenticated;
