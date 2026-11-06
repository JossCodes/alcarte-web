begin;
select plan(7);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('69000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'menu-admin@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('69000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'menu-owner@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.restaurants (id, slug, name, product_limit)
values ('6a000000-0000-4000-8000-000000000001', 'admin-edit-test', 'Admin Edit Test', 4);
insert into public.platform_admins (user_id) values ('69000000-0000-4000-8000-000000000001');
insert into public.categories (id, restaurant_id, name, sort_order)
values ('6b000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000001', 'Bebidas', 0);
insert into public.products (id, restaurant_id, category_id, name, description, price_cents, status, sort_order)
values ('6c000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000001', '6b000000-0000-4000-8000-000000000001', 'Agua', '', 2000, 'available', 0);

set local role authenticated;
set local request.jwt.claim.sub = '69000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.categories where restaurant_id = '6a000000-0000-4000-8000-000000000001'), 1, 'platform admin can read an active restaurant category');
select is((select count(*)::integer from public.products where restaurant_id = '6a000000-0000-4000-8000-000000000001'), 1, 'platform admin can read active restaurant products');
select lives_ok(
  $$select public.admin_save_category_menu('6a000000-0000-4000-8000-000000000001', '6b000000-0000-4000-8000-000000000001', 'Bebidas frías', true,
    '[{"id":"6c000000-0000-4000-8000-000000000001","name":"Agua mineral","description":"Fría","price_cents":2500,"status":"available","sort_order":0},{"name":"Limonada","description":"","price_cents":3500,"status":"sold_out","sort_order":1}]'::jsonb)$$,
  'platform admin can edit a category and add or modify its products'
);
select results_eq(
  $$select c.name || ':' || count(p.id)::text || ':' || string_agg(p.name, ',' order by p.sort_order) from public.categories c join public.products p on p.category_id = c.id where c.id = '6b000000-0000-4000-8000-000000000001' group by c.name$$,
  array['Bebidas frías:2:Agua mineral,Limonada'], 'admin menu edits are persisted'
);
select lives_ok(
  $$select public.admin_update_product_image('6a000000-0000-4000-8000-000000000001', '6c000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000001/products/6c000000-0000-4000-8000-000000000001-a.jpg')$$,
  'platform admin can associate a JPEG product photo'
);
select lives_ok(
  $$select public.admin_update_menu_images('6a000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000001/logo-a.jpg', null)$$,
  'platform admin can update restaurant image paths'
);
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '69000000-0000-4000-8000-000000000002';
select throws_ok(
  $$select public.admin_update_product_image('6a000000-0000-4000-8000-000000000001', '6c000000-0000-4000-8000-000000000001', null)$$,
  '42501', null, 'restaurant owner cannot call platform admin image RPC'
);
reset role;
select * from finish();
rollback;
