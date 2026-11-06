-- New uploads are JPEG so Safari can encode them natively. Keep WebP paths
-- valid for existing objects and backups during the format transition.
alter table public.restaurants
  drop constraint restaurants_menu_logo_path_check,
  drop constraint restaurants_menu_cover_path_check,
  add constraint restaurants_menu_logo_path_check check (
    menu_logo_path is null or menu_logo_path in (
      id::text || '/logo-a.webp', id::text || '/logo-b.webp',
      id::text || '/logo-a.jpg', id::text || '/logo-b.jpg'
    )
  ),
  add constraint restaurants_menu_cover_path_check check (
    menu_cover_path is null or menu_cover_path in (
      id::text || '/cover-a.webp', id::text || '/cover-b.webp',
      id::text || '/cover-a.jpg', id::text || '/cover-b.jpg'
    )
  );

alter table public.products drop constraint products_image_path_check;
alter table public.products add constraint products_image_path_check check (
  image_path is null or image_path in (
    restaurant_id::text || '/products/' || id::text || '-a.webp',
    restaurant_id::text || '/products/' || id::text || '-b.webp',
    restaurant_id::text || '/products/' || id::text || '-a.jpg',
    restaurant_id::text || '/products/' || id::text || '-b.jpg'
  )
);

update storage.buckets
  set file_size_limit = 102400, allowed_mime_types = array['image/webp', 'image/jpeg']
  where id = 'menu-images';

drop policy "Owners upload menu images for their active restaurant" on storage.objects;
create policy "Owners upload menu images for their active restaurant"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(logo|cover)-[ab]\.(webp|jpg)$'
    and exists (
      select 1 from public.restaurant_members m join public.restaurants r on r.id = m.restaurant_id
      where m.user_id = (select auth.uid())
        and m.restaurant_id::text = split_part(storage.objects.name, '/', 1) and r.is_active
    )
  );

drop policy "Owners replace menu images for their active restaurant" on storage.objects;
create policy "Owners replace menu images for their active restaurant"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(logo|cover)-[ab]\.(webp|jpg)$'
    and exists (
      select 1 from public.restaurant_members m join public.restaurants r on r.id = m.restaurant_id
      where m.user_id = (select auth.uid())
        and m.restaurant_id::text = split_part(storage.objects.name, '/', 1) and r.is_active
    )
  )
  with check (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(logo|cover)-[ab]\.(webp|jpg)$'
    and exists (
      select 1 from public.restaurant_members m join public.restaurants r on r.id = m.restaurant_id
      where m.user_id = (select auth.uid())
        and m.restaurant_id::text = split_part(storage.objects.name, '/', 1) and r.is_active
    )
  );

drop policy "Owners remove menu images for their active restaurant" on storage.objects;
create policy "Owners remove menu images for their active restaurant"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(logo|cover)-[ab]\.(webp|jpg)$'
    and exists (
      select 1 from public.restaurant_members m join public.restaurants r on r.id = m.restaurant_id
      where m.user_id = (select auth.uid())
        and m.restaurant_id::text = split_part(storage.objects.name, '/', 1) and r.is_active
    )
  );

drop policy "Owners view menu image objects for their active restaurant" on storage.objects;
create policy "Owners view menu image objects for their active restaurant"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(logo|cover)-[ab]\.(webp|jpg)$'
    and exists (
      select 1 from public.restaurant_members m join public.restaurants r on r.id = m.restaurant_id
      where m.user_id = (select auth.uid())
        and m.restaurant_id::text = split_part(storage.objects.name, '/', 1) and r.is_active
    )
  );

drop policy "Owners upload product images for their active restaurant" on storage.objects;
create policy "Owners upload product images for their active restaurant"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/products/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[ab]\.(webp|jpg)$'
    and exists (
      select 1 from public.products p
      join public.restaurant_members m on m.restaurant_id = p.restaurant_id
      join public.restaurants r on r.id = p.restaurant_id
      where p.id::text = regexp_replace(split_part(storage.objects.name, '/', 3), '-[ab]\.(webp|jpg)$', '')
        and p.restaurant_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = (select auth.uid()) and r.is_active
    )
  );

drop policy "Owners view product images for their active restaurant" on storage.objects;
create policy "Owners view product images for their active restaurant"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/products/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[ab]\.(webp|jpg)$'
    and exists (
      select 1 from public.restaurant_members m join public.restaurants r on r.id = m.restaurant_id
      where m.restaurant_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = (select auth.uid()) and r.is_active
    )
  );

drop policy "Owners remove product images for their active restaurant" on storage.objects;
create policy "Owners remove product images for their active restaurant"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/products/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[ab]\.(webp|jpg)$'
    and exists (
      select 1 from public.restaurant_members m join public.restaurants r on r.id = m.restaurant_id
      where m.restaurant_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = (select auth.uid()) and r.is_active
    )
  );

-- Existing RPCs keep their authorization logic; normalize a candidate JPEG
-- path only for the existing exact path whitelist comparison.
do $$
declare
  signature regprocedure;
  definition text;
begin
  foreach signature in array array[
    'public.update_owner_menu_images(text,text)'::regprocedure,
    'public.update_owner_product_image(uuid,text)'::regprocedure,
    'public.import_owner_menu(jsonb)'::regprocedure,
    'public.admin_restore_menu_backup(uuid,jsonb)'::regprocedure
  ] loop
    definition := pg_get_functiondef(signature);
    definition := replace(definition, 'p_logo_path not in (', 'regexp_replace(p_logo_path, ''[.]jpg$'', ''.webp'') not in (');
    definition := replace(definition, 'p_cover_path not in (', 'regexp_replace(p_cover_path, ''[.]jpg$'', ''.webp'') not in (');
    definition := replace(definition, 'p_image_path not in (', 'regexp_replace(p_image_path, ''[.]jpg$'', ''.webp'') not in (');
    definition := replace(definition, 'product_image_path not in (', 'regexp_replace(product_image_path, ''[.]jpg$'', ''.webp'') not in (');
    execute definition;
  end loop;
end;
$$;
