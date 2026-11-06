-- Trigger guards must inspect membership/restaurant rows even when the caller
-- has no direct grants on those protected tables. Identity still comes from
-- auth.uid(), and client execution privileges remain revoked.
create or replace function public.guard_owner_category_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_restaurant uuid;
begin
  target_restaurant := case when tg_op = 'DELETE' then old.restaurant_id else new.restaurant_id end;
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if not exists (
    select 1 from public.restaurant_members m
    join public.restaurants r on r.id = m.restaurant_id
    where m.restaurant_id = target_restaurant
      and m.user_id = (select auth.uid())
      and r.is_active
  ) then
    raise exception 'Restaurant is inactive or not owned by this user' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.guard_owner_product_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_restaurant uuid;
  configured_limit integer;
  active_restaurant boolean;
  current_count integer;
begin
  target_restaurant := case when tg_op = 'DELETE' then old.restaurant_id else new.restaurant_id end;
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if not exists (
    select 1 from public.restaurant_members m
    where m.restaurant_id = target_restaurant and m.user_id = (select auth.uid())
  ) then
    raise exception 'Restaurant is not owned by this user' using errcode = '42501';
  end if;
  select r.product_limit, r.is_active into configured_limit, active_restaurant
    from public.restaurants r where r.id = target_restaurant for update;
  if not coalesce(active_restaurant, false) then
    raise exception 'Restaurant is inactive' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    select count(*)::integer into current_count
      from public.products p where p.restaurant_id = target_restaurant;
    if current_count >= configured_limit then
      raise exception 'Product limit reached' using errcode = '23514', constraint = 'products_restaurant_product_limit';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.guard_owner_category_write() from public, anon, authenticated;
revoke all on function public.guard_owner_product_write() from public, anon, authenticated;
