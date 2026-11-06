alter table public.restaurants
  add column menu_logo_path text,
  add column menu_cover_path text,
  add constraint restaurants_menu_logo_path_check
    check (menu_logo_path is null or menu_logo_path in (id::text || '/logo-a.webp', id::text || '/logo-b.webp')),
  add constraint restaurants_menu_cover_path_check
    check (menu_cover_path is null or menu_cover_path in (id::text || '/cover-a.webp', id::text || '/cover-b.webp'));

grant select (menu_logo_path, menu_cover_path)
  on public.restaurants to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 102400, array['image/webp'])
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Owners upload menu images for their active restaurant"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(logo|cover)-[ab]\.webp$'
    and exists (
      select 1 from public.restaurant_members m
      join public.restaurants r on r.id = m.restaurant_id
      where m.user_id = (select auth.uid())
        and m.restaurant_id::text = split_part(storage.objects.name, '/', 1)
        and r.is_active
    )
  );

create policy "Owners replace menu images for their active restaurant"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(logo|cover)-[ab]\.webp$'
    and exists (
      select 1 from public.restaurant_members m
      join public.restaurants r on r.id = m.restaurant_id
      where m.user_id = (select auth.uid())
        and m.restaurant_id::text = split_part(storage.objects.name, '/', 1)
        and r.is_active
    )
  )
  with check (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(logo|cover)-[ab]\.webp$'
    and exists (
      select 1 from public.restaurant_members m
      join public.restaurants r on r.id = m.restaurant_id
      where m.user_id = (select auth.uid())
        and m.restaurant_id::text = split_part(storage.objects.name, '/', 1)
        and r.is_active
    )
  );

create policy "Owners remove menu images for their active restaurant"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(logo|cover)-[ab]\.webp$'
    and exists (
      select 1 from public.restaurant_members m
      join public.restaurants r on r.id = m.restaurant_id
      where m.user_id = (select auth.uid())
        and m.restaurant_id::text = split_part(storage.objects.name, '/', 1)
        and r.is_active
    )
  );

create or replace function public.update_owner_menu_images(
  p_logo_path text,
  p_cover_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_restaurant uuid;
  membership_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select count(*)::integer into membership_count
    from public.restaurant_members m
    join public.restaurants r on r.id = m.restaurant_id
    where m.user_id = (select auth.uid()) and r.is_active;
  if membership_count <> 1 then
    raise exception 'Exactly one active restaurant membership required' using errcode = '42501';
  end if;

  select m.restaurant_id into target_restaurant
    from public.restaurant_members m
    join public.restaurants r on r.id = m.restaurant_id
    where m.user_id = (select auth.uid()) and r.is_active;

  if p_logo_path is not null and p_logo_path not in (
    target_restaurant::text || '/logo-a.webp', target_restaurant::text || '/logo-b.webp'
  ) then
    raise exception 'Logo path does not belong to this restaurant' using errcode = '42501';
  end if;
  if p_cover_path is not null and p_cover_path not in (
    target_restaurant::text || '/cover-a.webp', target_restaurant::text || '/cover-b.webp'
  ) then
    raise exception 'Cover path does not belong to this restaurant' using errcode = '42501';
  end if;

  update public.restaurants
    set menu_logo_path = p_logo_path, menu_cover_path = p_cover_path
    where id = target_restaurant;
end;
$$;

revoke all on function public.update_owner_menu_images(text, text) from public, anon;
grant execute on function public.update_owner_menu_images(text, text) to authenticated;
