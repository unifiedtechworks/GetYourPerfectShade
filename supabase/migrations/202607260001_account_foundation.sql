create extension if not exists pgcrypto;
create type public.organization_role as enum ('owner', 'admin', 'staff');
create type public.membership_status as enum ('invited', 'active', 'disabled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'staff',
  status public.membership_status not null default 'invited',
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_memberships_user_id_idx on public.organization_memberships(user_id, status);

create or replace function public.set_updated_fields()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;
create trigger organizations_set_updated_fields before update on public.organizations
for each row execute function public.set_updated_fields();
create trigger memberships_set_updated_fields before update on public.organization_memberships
for each row execute function public.set_updated_fields();
create trigger profiles_set_updated_fields before update on public.profiles
for each row execute function public.set_updated_fields();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, created_by, updated_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.id,
    new.id
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships
    where organization_id = target_organization_id and user_id = auth.uid() and status = 'active'
  );
$$;
create or replace function public.has_organization_role(
  target_organization_id uuid, allowed_roles public.organization_role[]
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships
    where organization_id = target_organization_id and user_id = auth.uid()
      and status = 'active' and role = any(allowed_roles)
  );
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
create policy "users read own profile" on public.profiles for select using (id = auth.uid());
create policy "users update own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy "members read organization" on public.organizations for select
  using (public.is_organization_member(id));
create policy "owners and admins update organization" on public.organizations for update
  using (public.has_organization_role(id, array['owner', 'admin']::public.organization_role[]))
  with check (public.has_organization_role(id, array['owner', 'admin']::public.organization_role[]));
create policy "members read memberships" on public.organization_memberships for select
  using (public.is_organization_member(organization_id));
create policy "owners and admins manage memberships" on public.organization_memberships for all
  using (public.has_organization_role(organization_id, array['owner', 'admin']::public.organization_role[]))
  with check (public.has_organization_role(organization_id, array['owner', 'admin']::public.organization_role[]));
revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.has_organization_role(uuid, public.organization_role[]) from public;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.has_organization_role(uuid, public.organization_role[]) to authenticated;
