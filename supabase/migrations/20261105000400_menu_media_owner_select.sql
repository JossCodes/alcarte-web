-- Storage's remove endpoint must be able to find the object through SELECT
-- before the DELETE policy can remove it. Keep this listing scoped to the owner.
create policy "Owners view menu image objects for their active restaurant"
  on storage.objects for select to authenticated
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
