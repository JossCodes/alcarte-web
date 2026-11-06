-- Platform administrators can manage menu content and media for active restaurants.
create policy "Platform admins read active categories" on public.categories for select to authenticated
  using (exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
    and exists (select 1 from public.restaurants r where r.id = categories.restaurant_id and r.is_active));
create policy "Platform admins manage active categories" on public.categories for all to authenticated
  using (exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
    and exists (select 1 from public.restaurants r where r.id = categories.restaurant_id and r.is_active))
  with check (exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
    and exists (select 1 from public.restaurants r where r.id = categories.restaurant_id and r.is_active));
create policy "Platform admins read active products" on public.products for select to authenticated
  using (exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
    and exists (select 1 from public.restaurants r where r.id = products.restaurant_id and r.is_active));
create policy "Platform admins manage active products" on public.products for all to authenticated
  using (exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
    and exists (select 1 from public.restaurants r where r.id = products.restaurant_id and r.is_active))
  with check (exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
    and exists (select 1 from public.restaurants r where r.id = products.restaurant_id and r.is_active));

create policy "Platform admins manage active restaurant menu images" on storage.objects for all to authenticated
  using (bucket_id = 'menu-images'
    and name ~* '^[0-9a-f-]{36}/(logo|cover)-[ab]\.(webp|jpg)$'
    and exists (select 1 from public.restaurants r where r.id::text = split_part(storage.objects.name, '/', 1)
      and r.is_active and exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))))
  with check (bucket_id = 'menu-images'
    and name ~* '^[0-9a-f-]{36}/(logo|cover)-[ab]\.(webp|jpg)$'
    and exists (select 1 from public.restaurants r where r.id::text = split_part(storage.objects.name, '/', 1)
      and r.is_active and exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))));

create policy "Platform admins manage active restaurant product images" on storage.objects for all to authenticated
  using (bucket_id = 'menu-images'
    and name ~* '^[0-9a-f-]{36}/products/[0-9a-f-]{36}-[ab]\.(webp|jpg)$'
    and exists (select 1 from public.products p join public.restaurants r on r.id = p.restaurant_id
      where p.id::text = regexp_replace(split_part(storage.objects.name, '/', 3), '-[ab]\.(webp|jpg)$', '')
        and p.restaurant_id::text = split_part(storage.objects.name, '/', 1) and r.is_active
        and exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))))
  with check (bucket_id = 'menu-images'
    and name ~* '^[0-9a-f-]{36}/products/[0-9a-f-]{36}-[ab]\.(webp|jpg)$'
    and exists (select 1 from public.products p join public.restaurants r on r.id = p.restaurant_id
      where p.id::text = regexp_replace(split_part(storage.objects.name, '/', 3), '-[ab]\.(webp|jpg)$', '')
        and p.restaurant_id::text = split_part(storage.objects.name, '/', 1) and r.is_active
        and exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))));


create or replace function public.admin_save_category_menu(
  p_restaurant_id uuid, p_category_id uuid, p_name text, p_is_visible boolean, p_products jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  configured_limit integer;
  existing_total integer;
  new_total integer;
  item jsonb;
  item_id uuid;
  changed_rows integer;
begin
  if (select auth.uid()) is null or not exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid())) then
    raise exception 'Platform administrator required' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 or jsonb_typeof(p_products) is distinct from 'array' then
    raise exception 'Invalid category or products' using errcode = '22023';
  end if;
  select r.product_limit into configured_limit from public.restaurants r where r.id = p_restaurant_id and r.is_active for update;
  if not found or not exists (select 1 from public.categories c where c.id = p_category_id and c.restaurant_id = p_restaurant_id) then
    raise exception 'Active restaurant or category required' using errcode = '42501';
  end if;
  select count(*)::integer into existing_total from public.products p where p.restaurant_id = p_restaurant_id;
  select count(*)::integer into new_total from jsonb_array_elements(p_products) as rows(value) where nullif(rows.value->>'id', '') is null;
  if existing_total + new_total > configured_limit then
    raise exception 'Product limit reached' using errcode = '23514', constraint = 'products_restaurant_product_limit';
  end if;
  update public.categories set name = btrim(p_name), is_visible = p_is_visible where id = p_category_id and restaurant_id = p_restaurant_id;
  for item in select rows.value from jsonb_array_elements(p_products) as rows(value) loop
    item_id := nullif(item->>'id', '')::uuid;
    if length(btrim(item->>'name')) not between 1 and 120 or length(coalesce(item->>'description', '')) > 240
       or jsonb_typeof(item->'price_cents') is distinct from 'number'
       or (item->>'price_cents')::integer not between 1 and 99999999
       or coalesce(item->>'status', '') not in ('available', 'sold_out', 'hidden')
       or (item->>'sort_order')::integer < 0 then
      raise exception 'Invalid product fields' using errcode = '22023';
    end if;
    if item_id is null then
      insert into public.products (restaurant_id, category_id, name, description, price_cents, status, sort_order)
      values (p_restaurant_id, p_category_id, btrim(item->>'name'), coalesce(item->>'description', ''),
        (item->>'price_cents')::integer, (item->>'status')::public.product_status, (item->>'sort_order')::integer);
    else
      update public.products set name = btrim(item->>'name'), description = coalesce(item->>'description', ''),
        price_cents = (item->>'price_cents')::integer, status = (item->>'status')::public.product_status,
        sort_order = (item->>'sort_order')::integer
        where id = item_id and restaurant_id = p_restaurant_id and category_id = p_category_id;
      get diagnostics changed_rows = row_count;
      if changed_rows <> 1 then raise exception 'Product does not belong to this category' using errcode = '42501'; end if;
    end if;
  end loop;
end;
$$;

create or replace function public.admin_update_product_image(p_restaurant_id uuid, p_product_id uuid, p_image_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid())) then
    raise exception 'Platform administrator required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.restaurants r where r.id = p_restaurant_id and r.is_active)
     or not exists (select 1 from public.products p where p.id = p_product_id and p.restaurant_id = p_restaurant_id) then
    raise exception 'Active restaurant and product required' using errcode = '42501';
  end if;
  if p_image_path is not null and p_image_path not in (
    p_restaurant_id::text || '/products/' || p_product_id::text || '-a.webp',
    p_restaurant_id::text || '/products/' || p_product_id::text || '-b.webp',
    p_restaurant_id::text || '/products/' || p_product_id::text || '-a.jpg',
    p_restaurant_id::text || '/products/' || p_product_id::text || '-b.jpg'
  ) then raise exception 'Image path does not belong to this product' using errcode = '42501'; end if;
  update public.products set image_path = p_image_path where id = p_product_id and restaurant_id = p_restaurant_id;
end;
$$;

create or replace function public.admin_update_menu_images(p_restaurant_id uuid, p_logo_path text, p_cover_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid())) then
    raise exception 'Platform administrator required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.restaurants r where r.id = p_restaurant_id and r.is_active) then
    raise exception 'Active restaurant required' using errcode = '42501';
  end if;
  if p_logo_path is not null and p_logo_path not in (
    p_restaurant_id::text || '/logo-a.webp', p_restaurant_id::text || '/logo-b.webp',
    p_restaurant_id::text || '/logo-a.jpg', p_restaurant_id::text || '/logo-b.jpg'
  ) then raise exception 'Logo path does not belong to this restaurant' using errcode = '42501'; end if;
  if p_cover_path is not null and p_cover_path not in (
    p_restaurant_id::text || '/cover-a.webp', p_restaurant_id::text || '/cover-b.webp',
    p_restaurant_id::text || '/cover-a.jpg', p_restaurant_id::text || '/cover-b.jpg'
  ) then raise exception 'Cover path does not belong to this restaurant' using errcode = '42501'; end if;
  update public.restaurants set menu_logo_path = p_logo_path, menu_cover_path = p_cover_path where id = p_restaurant_id;
end;
$$;

revoke all on function public.admin_save_category_menu(uuid,uuid,text,boolean,jsonb) from public, anon;
revoke all on function public.admin_update_product_image(uuid,uuid,text) from public, anon;
revoke all on function public.admin_update_menu_images(uuid,text,text) from public, anon;
grant execute on function public.admin_save_category_menu(uuid,uuid,text,boolean,jsonb) to authenticated;
grant execute on function public.admin_update_product_image(uuid,uuid,text) to authenticated;
grant execute on function public.admin_update_menu_images(uuid,text,text) to authenticated;
