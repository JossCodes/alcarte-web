-- Product photo objects remain inside the existing bucket, scoped to the
-- owning restaurant and product. Storage itself enforces WebP and 100 KB.
create policy "Owners upload product images for their active restaurant"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/products/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[ab]\.webp$'
    and exists (
      select 1 from public.products p
      join public.restaurant_members m on m.restaurant_id = p.restaurant_id
      join public.restaurants r on r.id = p.restaurant_id
      where p.id::text = regexp_replace(split_part(storage.objects.name, '/', 3), '-[ab]\.webp$', '')
        and p.restaurant_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = (select auth.uid()) and r.is_active
    )
  );

create policy "Owners view product images for their active restaurant"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/products/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[ab]\.webp$'
    and exists (
      select 1 from public.restaurant_members m join public.restaurants r on r.id = m.restaurant_id
      where m.restaurant_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = (select auth.uid()) and r.is_active
    )
  );

create policy "Owners remove product images for their active restaurant"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'menu-images'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/products/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[ab]\.webp$'
    and exists (
      select 1 from public.restaurant_members m join public.restaurants r on r.id = m.restaurant_id
      where m.restaurant_id::text = split_part(storage.objects.name, '/', 1)
        and m.user_id = (select auth.uid()) and r.is_active
    )
  );

create or replace function public.update_owner_product_image(p_product_id uuid, p_image_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_restaurant uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select p.restaurant_id into target_restaurant
    from public.products p
    join public.restaurant_members m on m.restaurant_id = p.restaurant_id
    join public.restaurants r on r.id = p.restaurant_id
    where p.id = p_product_id and m.user_id = (select auth.uid()) and r.is_active;
  if target_restaurant is null then
    raise exception 'Product is inactive or not owned by this user' using errcode = '42501';
  end if;
  if p_image_path is not null and p_image_path not in (
    target_restaurant::text || '/products/' || p_product_id::text || '-a.webp',
    target_restaurant::text || '/products/' || p_product_id::text || '-b.webp'
  ) then
    raise exception 'Image path does not belong to this product' using errcode = '42501';
  end if;
  update public.products set image_path = p_image_path
    where id = p_product_id and restaurant_id = target_restaurant;
end;
$$;

revoke all on function public.update_owner_product_image(uuid, text) from public, anon;
grant execute on function public.update_owner_product_image(uuid, text) to authenticated;
