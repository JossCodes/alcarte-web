-- Essential owner-managed menu operations. The limit is enforced while holding
-- the restaurant row lock, so concurrent inserts cannot exceed it.
alter table public.restaurants
  add column product_limit integer not null default 40
    check (product_limit between 1 and 40);

grant insert (restaurant_id, name, sort_order, is_visible),
      update (name, sort_order, is_visible), delete
  on public.categories to authenticated;
grant insert (restaurant_id, category_id, name, description, price_cents, status, sort_order),
      update (category_id, name, description, price_cents, status, sort_order), delete
  on public.products to authenticated;

create policy "Owners manage categories in their active restaurant"
  on public.categories for all to authenticated
  using (
    exists (
      select 1 from public.restaurant_members m
      join public.restaurants r on r.id = m.restaurant_id
      where m.restaurant_id = categories.restaurant_id
        and m.user_id = (select auth.uid())
        and r.is_active
    )
  )
  with check (
    exists (
      select 1 from public.restaurant_members m
      join public.restaurants r on r.id = m.restaurant_id
      where m.restaurant_id = categories.restaurant_id
        and m.user_id = (select auth.uid())
        and r.is_active
    )
  );

create policy "Owners manage products in their active restaurant"
  on public.products for all to authenticated
  using (
    exists (
      select 1 from public.restaurant_members m
      join public.restaurants r on r.id = m.restaurant_id
      where m.restaurant_id = products.restaurant_id
        and m.user_id = (select auth.uid())
        and r.is_active
    )
  )
  with check (
    exists (
      select 1 from public.restaurant_members m
      join public.restaurants r on r.id = m.restaurant_id
      where m.restaurant_id = products.restaurant_id
        and m.user_id = (select auth.uid())
        and r.is_active
    )
  );

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

  -- Seed/migrations and trusted backend administration run without an end-user
  -- JWT. Client roles still need grants and RLS, so this is not a client bypass.
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

create trigger categories_owner_write_guard
  before insert or update or delete on public.categories
  for each row execute function public.guard_owner_category_write();

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

  -- Seed/migrations and trusted backend administration run without an end-user
  -- JWT. Client roles still need grants and RLS, so this is not a client bypass.
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

  -- This lock serializes concurrent product creation for this restaurant and
  -- also ensures a deactivation cannot race with an owner mutation.
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

create trigger products_owner_write_guard
  before insert or update or delete on public.products
  for each row execute function public.guard_owner_product_write();

revoke all on function public.guard_owner_category_write() from public, anon, authenticated;
revoke all on function public.guard_owner_product_write() from public, anon, authenticated;
