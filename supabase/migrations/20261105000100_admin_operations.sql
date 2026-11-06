create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'restaurant_created', 'restaurant_updated', 'owner_access_assigned',
    'recovery_link_generated', 'owner_provisioning_rollback_failed'
  )),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index admin_audit_events_created_idx on public.admin_audit_events(created_at desc);
alter table public.admin_audit_events enable row level security;
revoke all on public.admin_audit_events from anon, authenticated;
grant all on public.admin_audit_events to service_role;

create or replace function public.admin_create_restaurant(
  p_actor_user_id uuid,
  p_owner_user_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_product_limit integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_restaurant_id uuid;
begin
  if not exists (select 1 from public.platform_admins a where a.user_id = p_actor_user_id) then
    raise exception 'Administrator privileges required' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_owner_user_id) then
    raise exception 'Owner account not found' using errcode = '23503';
  end if;
  if exists (select 1 from public.restaurant_members m where m.user_id = p_owner_user_id) then
    raise exception 'Owner already has a restaurant assignment' using errcode = '23505';
  end if;

  insert into public.restaurants (slug, name, description, product_limit)
  values (p_slug, btrim(p_name), coalesce(p_description, ''), p_product_limit)
  returning id into new_restaurant_id;
  insert into public.restaurant_members (restaurant_id, user_id)
  values (new_restaurant_id, p_owner_user_id);
  insert into public.admin_audit_events (actor_user_id, action, restaurant_id, target_user_id)
  values (p_actor_user_id, 'restaurant_created', new_restaurant_id, p_owner_user_id);
  return new_restaurant_id;
end;
$$;

create or replace function public.admin_assign_owner(
  p_actor_user_id uuid, p_restaurant_id uuid, p_owner_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.platform_admins a where a.user_id = p_actor_user_id) then
    raise exception 'Administrator privileges required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.restaurants r where r.id = p_restaurant_id)
     or not exists (select 1 from auth.users u where u.id = p_owner_user_id) then
    raise exception 'Restaurant or owner account not found' using errcode = '23503';
  end if;
  if exists (select 1 from public.restaurant_members m where m.user_id = p_owner_user_id) then
    raise exception 'Owner already has a restaurant assignment' using errcode = '23505';
  end if;
  insert into public.restaurant_members (restaurant_id, user_id)
  values (p_restaurant_id, p_owner_user_id);
  insert into public.admin_audit_events (actor_user_id, action, restaurant_id, target_user_id)
  values (p_actor_user_id, 'owner_access_assigned', p_restaurant_id, p_owner_user_id);
end;
$$;

create or replace function public.admin_update_restaurant(
  p_actor_user_id uuid,
  p_restaurant_id uuid,
  p_name text,
  p_description text,
  p_product_limit integer,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_owner uuid;
  affected_rows integer;
begin
  if not exists (select 1 from public.platform_admins a where a.user_id = p_actor_user_id) then
    raise exception 'Administrator privileges required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.restaurants r where r.id = p_restaurant_id) then
    raise exception 'Restaurant not found' using errcode = '23503';
  end if;
  select m.user_id into target_owner
    from public.restaurant_members m where m.restaurant_id = p_restaurant_id limit 1;
  update public.restaurants
    set name = btrim(p_name), description = coalesce(p_description, ''),
        product_limit = p_product_limit, is_active = p_is_active
    where id = p_restaurant_id;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Restaurant not found' using errcode = '23503';
  end if;
  insert into public.admin_audit_events (actor_user_id, action, restaurant_id, target_user_id)
  values (p_actor_user_id, 'restaurant_updated', p_restaurant_id, target_owner);
end;
$$;

create or replace function public.admin_record_recovery_event(
  p_actor_user_id uuid, p_restaurant_id uuid, p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.platform_admins a where a.user_id = p_actor_user_id) then
    raise exception 'Administrator privileges required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.restaurant_members m
    where m.restaurant_id = p_restaurant_id and m.user_id = p_target_user_id
  ) then
    raise exception 'Owner is not assigned to this restaurant' using errcode = '42501';
  end if;
  insert into public.admin_audit_events (actor_user_id, action, restaurant_id, target_user_id)
  values (p_actor_user_id, 'recovery_link_generated', p_restaurant_id, p_target_user_id);
end;
$$;

revoke all on function public.admin_create_restaurant(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.admin_assign_owner(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_update_restaurant(uuid, uuid, text, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.admin_record_recovery_event(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_create_restaurant(uuid, uuid, text, text, text, integer) to service_role;
grant execute on function public.admin_assign_owner(uuid, uuid, uuid) to service_role;
grant execute on function public.admin_update_restaurant(uuid, uuid, text, text, integer, boolean) to service_role;
grant execute on function public.admin_record_recovery_event(uuid, uuid, uuid) to service_role;
