-- Category deletion cascades product rows before storage cleanup. Allow a
-- platform admin to list/remove orphaned photo objects in active restaurants.
create policy "Platform admins list product images for cleanup" on storage.objects for select to authenticated
  using (bucket_id = 'menu-images'
    and name ~* '^[0-9a-f-]{36}/products/[0-9a-f-]{36}-[ab]\.(webp|jpg)$'
    and exists (select 1 from public.restaurants r where r.id::text = split_part(storage.objects.name, '/', 1)
      and r.is_active and exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))));
create policy "Platform admins remove product images for cleanup" on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images'
    and name ~* '^[0-9a-f-]{36}/products/[0-9a-f-]{36}-[ab]\.(webp|jpg)$'
    and exists (select 1 from public.restaurants r where r.id::text = split_part(storage.objects.name, '/', 1)
      and r.is_active and exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))));
