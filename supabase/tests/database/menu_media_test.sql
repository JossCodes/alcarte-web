begin;
select plan(13);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('63000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'media-owner@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('63000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'media-other@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.restaurants (id, slug, name, product_limit)
values ('64000000-0000-4000-8000-000000000001', 'media-test', 'Media Test', 40);
insert into public.restaurant_members (restaurant_id, user_id)
values ('64000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001');
insert into public.categories (id, restaurant_id, name, sort_order)
values ('65000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', 'Platos', 0);
insert into public.products (id, restaurant_id, category_id, name, description, price_cents, status, sort_order)
values ('66000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000001', 'Prueba', '', 1000, 'available', 0);

select ok((select public from storage.buckets where id = 'menu-images'), 'menu image bucket is publicly readable for published menu assets');
select is((select file_size_limit from storage.buckets where id = 'menu-images'), 102400::bigint, 'Storage API enforces a 100 KiB final file limit');
select is((select allowed_mime_types from storage.buckets where id = 'menu-images'), array['image/webp', 'image/jpeg']::text[], 'bucket accepts legacy WebP and new JPEG uploads');
select is(
  (select count(*)::integer from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in (
    'Owners upload menu images for their active restaurant',
    'Owners replace menu images for their active restaurant',
    'Owners remove menu images for their active restaurant',
    'Owners view menu image objects for their active restaurant'
  )),
  4,
  'listing, upload, replacement and deletion use separate owner policies'
);

set local role authenticated;
set local request.jwt.claim.sub = '63000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.update_owner_menu_images('64000000-0000-4000-8000-000000000001/logo-a.webp', '64000000-0000-4000-8000-000000000001/cover-b.webp')$$,
  'owner can publish image paths for their own active restaurant'
);
select lives_ok(
  $$select public.update_owner_menu_images('64000000-0000-4000-8000-000000000001/logo-a.jpg', '64000000-0000-4000-8000-000000000001/cover-b.webp')$$,
  'owner can publish a JPEG path while retaining an existing WebP path'
);
select throws_ok(
  $$select public.update_owner_menu_images('20000000-0000-4000-8000-000000000002/logo-a.webp', null)$$,
  '42501', null, 'owner cannot reference another restaurant image path'
);
select is((select count(*)::integer from pg_policies where schemaname='storage' and tablename='objects'
  and policyname in ('Owners upload product images for their active restaurant', 'Owners view product images for their active restaurant', 'Owners remove product images for their active restaurant')),
  3, 'product object policies are separately scoped to owner restaurant and product');
select lives_ok(
  $$select public.update_owner_product_image('66000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001/products/66000000-0000-4000-8000-000000000001-a.webp')$$,
  'owner can associate an image path with their own product'
);
select lives_ok(
  $$select public.update_owner_product_image('66000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001/products/66000000-0000-4000-8000-000000000001-b.jpg')$$,
  'owner can associate a JPEG path with their own product'
);
select throws_ok(
  $$select public.update_owner_product_image('66000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001/products/66000000-0000-4000-8000-000000000099-a.webp')$$,
  '42501', null, 'owner cannot associate a path belonging to another product'
);
reset role;
select results_eq(
  $$select menu_logo_path || '|' || menu_cover_path from public.restaurants where id = '64000000-0000-4000-8000-000000000001'$$,
  array['64000000-0000-4000-8000-000000000001/logo-a.jpg|64000000-0000-4000-8000-000000000001/cover-b.webp'],
  'valid image paths are persisted'
);
select is((select image_path from public.products where id='66000000-0000-4000-8000-000000000001'),
  '64000000-0000-4000-8000-000000000001/products/66000000-0000-4000-8000-000000000001-b.jpg',
  'valid product image path is persisted');

select * from finish();
rollback;
