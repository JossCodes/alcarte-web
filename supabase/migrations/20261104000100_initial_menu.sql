-- Multi-tenant menu foundation. Public schema contains no owner contact data.
create type public.product_status as enum ('available', 'sold_out', 'hidden');

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) between 2 and 60),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 240),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.restaurant_members (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create index restaurant_members_user_id_idx on public.restaurant_members(user_id);

-- Privileged identities are separate from restaurant ownership. No client
-- role receives INSERT/UPDATE/DELETE privileges; bootstrap is an operator task.
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, id)
);
create index categories_restaurant_order_idx on public.categories(restaurant_id, sort_order);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 240),
  price_cents integer not null check (price_cents between 1 and 99999999),
  status public.product_status not null default 'available',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  constraint products_category_same_restaurant_fk
    foreign key (restaurant_id, category_id)
    references public.categories(restaurant_id, id) on delete cascade
);
create index products_restaurant_category_order_idx
  on public.products(restaurant_id, category_id, sort_order);

alter table public.restaurants enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.platform_admins enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;

-- Explicit least-privilege grants: RLS does not replace SQL privileges.
revoke all on public.restaurants, public.restaurant_members, public.platform_admins, public.categories, public.products
  from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.restaurants to anon, authenticated;
grant select on public.restaurant_members to authenticated;
grant select on public.platform_admins to authenticated;
grant select on public.categories to anon, authenticated;
grant select on public.products to anon, authenticated;
grant update (price_cents) on public.products to authenticated;

create policy "Public can read active restaurants"
  on public.restaurants for select to anon, authenticated
  using (is_active);

create policy "Users can read their own memberships"
  on public.restaurant_members for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Platform administrators can read only their own role row"
  on public.platform_admins for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Public can read visible categories of active restaurants"
  on public.categories for select to anon, authenticated
  using (
    is_visible
    and exists (
      select 1 from public.restaurants r
      where r.id = categories.restaurant_id and r.is_active
    )
  );

create policy "Owners can read all categories in their active restaurant"
  on public.categories for select to authenticated
  using (
    exists (
      select 1 from public.restaurant_members m
      join public.restaurants r on r.id = m.restaurant_id
      where m.restaurant_id = categories.restaurant_id
        and m.user_id = (select auth.uid())
        and r.is_active
    )
  );

create policy "Public can read listed products in visible categories"
  on public.products for select to anon, authenticated
  using (
    status <> 'hidden'
    and exists (
      select 1 from public.restaurants r
      join public.categories c on c.restaurant_id = r.id
      where r.id = products.restaurant_id
        and r.is_active
        and c.id = products.category_id
        and c.is_visible
    )
  );

create policy "Owners can read all products in their active restaurant"
  on public.products for select to authenticated
  using (
    exists (
      select 1 from public.restaurant_members m
      join public.restaurants r on r.id = m.restaurant_id
      where m.restaurant_id = products.restaurant_id
        and m.user_id = (select auth.uid())
        and r.is_active
    )
  );

create policy "Owners can change prices in their active restaurant"
  on public.products for update to authenticated
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
