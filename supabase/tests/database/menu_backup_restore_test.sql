begin;
select plan(8);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('67000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'restore-owner@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('67000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'restore-other@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.restaurants (id, slug, name, description, product_limit)
values ('68000000-0000-4000-8000-000000000001', 'restore-test', 'Destino', 'Carta original', 2);
insert into public.restaurant_members (restaurant_id, user_id)
values ('68000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000001');
insert into public.platform_admins (user_id) values ('67000000-0000-4000-8000-000000000002');

set local role authenticated;
set local request.jwt.claim.sub = '67000000-0000-4000-8000-000000000002';
select is(public.admin_restore_menu_backup('68000000-0000-4000-8000-000000000001',
  '{"format":"alcarte-menu-backup","version":1,"restaurant":{"name":"Restaurado","description":"Descripción","menu_theme":"night","menu_accent_color":"#345678"},"categories":[{"name":"Especiales","sort_order":0,"is_visible":false,"products":[{"id":"68000000-0000-4000-8000-000000000003","image_path":"68000000-0000-4000-8000-000000000001/products/68000000-0000-4000-8000-000000000003-b.webp","name":"Uno","description":"","price_cents":1000,"status":"available","sort_order":0},{"name":"Dos","description":"","price_cents":1200,"status":"hidden","sort_order":1}]},{"name":"Vacía","sort_order":1,"is_visible":true,"products":[]}]}'::jsonb
), 2, 'platform admin restores a versioned backup');
reset role;
select results_eq(
  $$select r.name || ':' || r.menu_theme || ':' || c.is_visible::text || ':' || count(p.id)::text
    from public.restaurants r join public.categories c on c.restaurant_id=r.id
    left join public.products p on p.category_id=c.id where r.id='68000000-0000-4000-8000-000000000001'
    group by r.name,r.menu_theme,c.is_visible order by c.is_visible$$,
  array['Restaurado:night:false:2','Restaurado:night:true:0'],
  'restore includes appearance, category visibility, an empty category and all products'
);
select is((select count(*)::integer from public.categories where restaurant_id='68000000-0000-4000-8000-000000000001'), 2, 'empty categories are preserved in a JSON restore');
select results_eq(
  $$select id::text || ':' || image_path from public.products where id='68000000-0000-4000-8000-000000000003'$$,
  array['68000000-0000-4000-8000-000000000003:68000000-0000-4000-8000-000000000001/products/68000000-0000-4000-8000-000000000003-b.webp'],
  'backup restore preserves product UUID and optional image reference'
);
select throws_ok(
  $$select public.admin_restore_menu_backup('68000000-0000-4000-8000-000000000001','{"format":"alcarte-menu-backup","version":1,"restaurant":{"name":"No debe aplicar","description":"","menu_theme":"classic","menu_accent_color":"#123456"},"categories":[{"name":"Muchos","sort_order":0,"products":[{"name":"A","description":"","price_cents":100,"status":"available","sort_order":0},{"name":"B","description":"","price_cents":100,"status":"available","sort_order":1},{"name":"C","description":"","price_cents":100,"status":"available","sort_order":2}]}]}')$$,
  '23514', null, 'over-limit restore is rejected atomically'
);
reset role;
select results_eq(
  $$select r.name || ':' || r.menu_theme || ':' || count(p.id)::text from public.restaurants r
    join public.categories c on c.restaurant_id=r.id left join public.products p on p.category_id=c.id
    where r.id='68000000-0000-4000-8000-000000000001' group by r.name,r.menu_theme order by r.name$$,
  array['Restaurado:night:2'],
  'failed restore leaves the previous menu and appearance unchanged'
);
set local role authenticated;
set local request.jwt.claim.sub = '67000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.admin_restore_menu_backup('68000000-0000-4000-8000-000000000001','{"format":"alcarte-menu-backup","version":1,"restaurant":{"name":"X","description":"","menu_theme":"minimal","menu_accent_color":"#000000"},"categories":[]}')$$,
  '42501', null, 'a restaurant owner without platform admin role cannot restore'
);
select throws_ok(
  $$select public.restore_owner_menu_backup('{"format":"alcarte-menu-backup","version":1,"restaurant":{"name":"X","description":"","menu_theme":"minimal","menu_accent_color":"#000000"},"categories":[]}')$$,
  '42501', null, 'owner access to the legacy restore RPC is revoked'
);
reset role;
select * from finish();
rollback;
