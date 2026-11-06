begin;
select plan(8);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('61000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'appearance-owner@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('61000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'appearance-other@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.restaurants (id, slug, name, product_limit)
values ('62000000-0000-4000-8000-000000000001', 'appearance-test', 'Appearance Test', 40);
insert into public.restaurant_members (restaurant_id, user_id)
values ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001');

select ok(has_column_privilege('anon', 'public.restaurants', 'menu_theme', 'select'), 'public can read the selected menu theme');
select ok(has_column_privilege('anon', 'public.restaurants', 'menu_accent_color', 'select'), 'public can read the published accent color');
select ok(not has_column_privilege('authenticated', 'public.restaurants', 'menu_theme', 'update'), 'owners cannot bypass the appearance RPC');

set local role authenticated;
set local request.jwt.claim.sub = '61000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.update_owner_menu_appearance('night', '#A65E32')$$,
  'owner can update the appearance of their active restaurant'
);
select throws_ok(
  $$select public.update_owner_menu_appearance('neon', '#A65E32')$$,
  '22023', null, 'unsupported template is rejected'
);
select throws_ok(
  $$select public.update_owner_menu_appearance('classic', 'red')$$,
  '22023', null, 'malformed accent color is rejected'
);
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '61000000-0000-4000-8000-000000000002';
select throws_ok(
  $$select public.update_owner_menu_appearance('classic', '#A65E32')$$,
  '42501', null, 'a user without an active restaurant cannot change its appearance'
);
reset role;
select results_eq(
  $$select menu_theme || ':' || menu_accent_color from public.restaurants where id = '62000000-0000-4000-8000-000000000001'$$,
  array['night:#A65E32'],
  'valid appearance was persisted'
);

select * from finish();
rollback;
