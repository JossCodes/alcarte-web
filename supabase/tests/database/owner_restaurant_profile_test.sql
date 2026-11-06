begin;
select plan(4);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('69000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'profile-owner@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('69000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'profile-other@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.restaurants(id,slug,name,description) values
  ('6a000000-0000-4000-8000-000000000001','profile-one','Restaurant One','One'),
  ('6a000000-0000-4000-8000-000000000002','profile-two','Restaurant Two','Two'),
  ('6a000000-0000-4000-8000-000000000003','profile-three','Restaurant Three','Three');
insert into public.restaurant_members(restaurant_id,user_id) values
  ('6a000000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000001'),
  ('6a000000-0000-4000-8000-000000000003','69000000-0000-4000-8000-000000000001');

set local role authenticated;
set local request.jwt.claim.sub = '69000000-0000-4000-8000-000000000002';
select throws_ok(
  $$select public.update_owner_restaurant_profile('No autorizado','')$$,
  '42501', null, 'an account without restaurant membership cannot edit restaurant details'
);

set local request.jwt.claim.sub = '69000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.update_owner_restaurant_profile('No debe cambiar','')$$,
  '42501', null, 'a user with multiple restaurant memberships cannot edit either restaurant'
);
reset role;
delete from public.restaurant_members where user_id='69000000-0000-4000-8000-000000000001' and restaurant_id='6a000000-0000-4000-8000-000000000003';
set local role authenticated;
set local request.jwt.claim.sub = '69000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.update_owner_restaurant_profile('Updated name','Updated description')$$,
  'a user with exactly one active restaurant can update its name and description'
);
reset role;
select results_eq(
  $$select id::text || ':' || name || ':' || description from public.restaurants where id in ('6a000000-0000-4000-8000-000000000001','6a000000-0000-4000-8000-000000000002') order by id$$,
  array['6a000000-0000-4000-8000-000000000001:Updated name:Updated description','6a000000-0000-4000-8000-000000000002:Restaurant Two:Two'],
  'profile edits do not change another restaurant'
);

select * from finish();
rollback;
