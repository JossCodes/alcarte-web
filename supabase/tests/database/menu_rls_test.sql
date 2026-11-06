begin;
select plan(30);

-- Non-login identities are created only inside this rolled-back policy test.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-owner-a@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-owner-b@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.restaurants (id, slug, name, product_limit) values
  ('51000000-0000-4000-8000-000000000001', 'rls-owner-a', 'RLS Owner A', 10),
  ('51000000-0000-4000-8000-000000000002', 'rls-owner-b', 'RLS Owner B', 10);
insert into public.restaurant_members (restaurant_id, user_id) values
  ('51000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('51000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002');
insert into public.categories (id, restaurant_id, name, sort_order, is_visible) values
  ('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'RLS A', 0, true),
  ('52000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', 'RLS B', 0, true);
insert into public.products (id, restaurant_id, category_id, name, price_cents, status, sort_order) values
  ('53000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'A disponible', 8900, 'available', 0),
  ('53000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'A agotado', 14500, 'sold_out', 1),
  ('53000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'A disponible dos', 17800, 'available', 2),
  ('53000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'A oculto', 9900, 'hidden', 3),
  ('53000000-0000-4000-8000-000000000005', '51000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 'B visible', 4500, 'available', 0),
  ('53000000-0000-4000-8000-000000000006', '51000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 'B visible dos', 6500, 'available', 1),
  ('53000000-0000-4000-8000-000000000007', '51000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 'B oculto', 12000, 'hidden', 2);

-- Anonymous users see only public restaurant/menu data.
set local role anon;
select is((select count(*)::integer from public.restaurants where id in (
  '51000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000002'
)), 2, 'anonymous users read the two active fixture restaurants');
select ok(not has_column_privilege('anon', 'public.restaurants', 'product_limit', 'select'), 'anonymous users cannot read the administrative product limit');
select is((select count(*)::integer from public.products where id in (
  '53000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000002',
  '53000000-0000-4000-8000-000000000003', '53000000-0000-4000-8000-000000000005',
  '53000000-0000-4000-8000-000000000006'
)), 5, 'anonymous users read the listed fixture products');
select is_empty(
  $$select id from public.products where id = '53000000-0000-4000-8000-000000000004'$$,
  'anonymous users cannot read hidden products'
);
select is((select count(*)::integer from public.products where id in (
  '53000000-0000-4000-8000-000000000005', '53000000-0000-4000-8000-000000000006'
)), 2, 'anonymous users can read the other fixture restaurant public menu');
select results_eq(
  $$select status::text from public.products where id = '53000000-0000-4000-8000-000000000002'$$,
  array['sold_out'],
  'sold-out products remain visible with their status'
);
select ok(
  not has_table_privilege('anon', 'public.restaurant_members', 'select'),
  'anonymous users have no grant on private memberships'
);
select ok(
  not has_table_privilege('anon', 'public.platform_admins', 'select'),
  'anonymous users have no grant on administrator roles'
);
select throws_ok(
  $$insert into public.products (restaurant_id, category_id, name, price_cents)
    values ('51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'No autorizado', 100)$$,
  '42501', null, 'anonymous users cannot write products'
);

-- Owner A can see all their own products, including hidden ones, but never B's.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.restaurant_members), 1, 'owner reads only their own membership');
select ok(
  not has_table_privilege('authenticated', 'public.restaurant_members', 'insert,update,delete'),
  'owners cannot assign restaurants or edit membership rows'
);
select ok(
  not has_table_privilege('authenticated', 'public.platform_admins', 'insert,update,delete'),
  'owners cannot grant themselves platform administrator access'
);
select ok(
  has_column_privilege('authenticated', 'public.products', 'status', 'update')
    and has_column_privilege('authenticated', 'public.categories', 'is_visible', 'update'),
  'owners can update menu fields using column-scoped grants'
);
select is((select count(*)::integer from public.products where id in (
  '53000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000002',
  '53000000-0000-4000-8000-000000000003', '53000000-0000-4000-8000-000000000004'
)), 4, 'owner reads all their fixture products, including hidden ones');
select is_empty(
  $$select id from public.products where id = '53000000-0000-4000-8000-000000000007'$$,
  'owner A cannot read restaurant B hidden product'
);
select results_eq(
  $$update public.products set price_cents = 8999
    where id = '53000000-0000-4000-8000-000000000001'
    returning price_cents$$,
  array[8999],
  'owner updates own price'
);
select is_empty(
  $$update public.products set price_cents = 1
    where id = '53000000-0000-4000-8000-000000000005'
    returning id$$,
  'owner A cannot update restaurant B price'
);
select throws_ok(
  $$update public.products set restaurant_id = '51000000-0000-4000-8000-000000000002'
    where id = '53000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'owner cannot reassign a product to another restaurant'
);
select results_eq(
  $$delete from public.products where id = '53000000-0000-4000-8000-000000000001' returning id$$,
  array['53000000-0000-4000-8000-000000000001'::uuid],
  'owner permanently deletes a product from their restaurant'
);
select is_empty(
  $$delete from public.products where id = '53000000-0000-4000-8000-000000000005' returning id$$,
  'owner cannot delete another restaurant product'
);
reset role;
insert into public.restaurants (id, slug, name, product_limit) values
  ('50000000-0000-4000-8000-000000000001', 'rls-limit-test', 'RLS limit test', 1);
insert into public.restaurant_members (restaurant_id, user_id) values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');
insert into public.categories (id, restaurant_id, name) values
  ('50000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'RLS limit test');
set local role authenticated;
insert into public.products (restaurant_id, category_id, name, description, price_cents, status, sort_order)
values ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'Producto al límite', '', 100, 'available', 0);
select is((select count(*)::integer from public.products where restaurant_id = '50000000-0000-4000-8000-000000000001'), 1, 'owner can create products up to the configured limit');
select throws_ok(
  $$insert into public.products (restaurant_id, category_id, name, price_cents)
    values ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'Producto excedente', 100)$$,
  '23514', 'Product limit reached', 'database rejects products beyond the limit'
);
update public.categories set is_visible = false where id = '50000000-0000-4000-8000-000000000002';
reset role;
set local role anon;
select is_empty(
  $$select id from public.categories where id = '50000000-0000-4000-8000-000000000002'$$,
  'hidden category is not readable publicly'
);
select is_empty(
  $$select id from public.products where category_id = '50000000-0000-4000-8000-000000000002'$$,
  'products of a hidden category are not readable publicly'
);
reset role;
update public.restaurants set is_active = false where id = '50000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select throws_ok(
  $$insert into public.products (restaurant_id, category_id, name, price_cents)
    values ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'Restaurante cerrado', 100)$$,
  '42501', 'Restaurant is inactive', 'inactive restaurant rejects product writes despite an existing session'
);
select throws_ok(
  $$insert into public.categories (restaurant_id, name)
    values ('50000000-0000-4000-8000-000000000001', 'Categoría cerrada')$$,
  '42501', 'Restaurant is inactive or not owned by this user', 'inactive restaurant rejects category writes'
);
reset role;
set local role anon;
select is_empty(
  $$select id from public.restaurants where slug = 'rls-limit-test'$$,
  'inactive restaurant is not discoverable publicly'
);
select is_empty(
  $$select id from public.categories where id = '50000000-0000-4000-8000-000000000002'$$,
  'inactive restaurant categories are not readable publicly'
);
select is_empty(
  $$select id from public.products where restaurant_id = '50000000-0000-4000-8000-000000000001'$$,
  'inactive restaurant products are not readable publicly'
);
select results_eq(
  $$select price_cents from public.products where id = '53000000-0000-4000-8000-000000000005'$$,
  array[4500],
  'cross-restaurant update left B price unchanged'
);

select * from finish();
rollback;
