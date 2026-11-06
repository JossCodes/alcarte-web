begin;
select plan(7);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('65000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'import-owner@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('65000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'import-other@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.restaurants (id, slug, name, product_limit)
values ('66000000-0000-4000-8000-000000000001', 'import-test', 'Import Test', 2);
insert into public.restaurant_members (restaurant_id, user_id)
values ('66000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000001');
insert into public.platform_admins (user_id) values ('65000000-0000-4000-8000-000000000002');

set local role authenticated;
set local request.jwt.claim.sub = '65000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.import_owner_menu('[{"name":"Bebidas","sort_order":0,"products":[{"name":"Agua","description":"","price_cents":2500,"status":"available","sort_order":0}]}]'::jsonb)$$,
  '42501', null, 'owner cannot call the legacy import RPC'
);
set local request.jwt.claim.sub = '65000000-0000-4000-8000-000000000002';
select is(public.admin_import_menu('66000000-0000-4000-8000-000000000001', '[{"name":"Bebidas","sort_order":0,"products":[{"name":"Agua","description":"","price_cents":2500,"status":"available","sort_order":0},{"name":"Té","description":"","price_cents":3500,"status":"sold_out","sort_order":1}]}]'::jsonb), 2, 'platform admin imports all rows into selected restaurant');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '65000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.products where restaurant_id='66000000-0000-4000-8000-000000000001'), 2, 'admin import creates all products for the restaurant');
set local request.jwt.claim.sub = '65000000-0000-4000-8000-000000000002';
select throws_ok(
  $$select public.admin_import_menu('66000000-0000-4000-8000-000000000001','[{"name":"Postres","sort_order":1,"products":[{"name":"Flan","description":"","price_cents":1000,"status":"available","sort_order":0}]}]'::jsonb)$$,
  '23514', null, 'product limit rejects the whole additional batch'
);
select throws_ok(
  $$select public.admin_import_menu('66000000-0000-4000-8000-000000000001','[{"name":"Válida","sort_order":1,"products":[{"name":"Pan","description":"","price_cents":1000,"status":"available","sort_order":0}]},{"name":"Inválida","sort_order":2,"products":[{"name":"Café","description":"","price_cents":1200,"status":"not-a-status","sort_order":0}]}]'::jsonb)$$,
  '22023', null, 'invalid data in a later category rejects the complete batch'
);
reset role;
select is((select count(*)::integer from public.categories where restaurant_id='66000000-0000-4000-8000-000000000001'), 1, 'failed batches leave no partial categories');
set local role authenticated;
set local request.jwt.claim.sub = '65000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.admin_import_menu('66000000-0000-4000-8000-000000000001','[{"name":"No","sort_order":0,"products":[{"name":"No","description":"","price_cents":1000,"status":"available","sort_order":0}]}]'::jsonb)$$,
  '42501', null, 'owner cannot invoke the platform admin import RPC'
);
reset role;

select * from finish();
rollback;
