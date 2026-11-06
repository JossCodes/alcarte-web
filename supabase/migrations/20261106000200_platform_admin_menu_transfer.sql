-- Transfer tools are privileged platform operations, not owner menu actions.
-- These RPCs are intentionally callable only by a signed-in platform admin.
create or replace function public.admin_import_menu(p_restaurant_id uuid, p_categories jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_limit integer;
  existing_total integer;
  incoming_total integer := 0;
  inserted_total integer := 0;
  category_item jsonb;
  product_item jsonb;
  new_category_id uuid;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.platform_admins a where a.user_id = (select auth.uid())
  ) then raise exception 'Platform administrator required' using errcode = '42501'; end if;
  if jsonb_typeof(p_categories) is distinct from 'array' or jsonb_array_length(p_categories) = 0 then
    raise exception 'Categories must be a non-empty JSON array' using errcode = '22023';
  end if;
  select r.product_limit into configured_limit from public.restaurants r
    where r.id = p_restaurant_id and r.is_active for update;
  if not found then raise exception 'Active restaurant required' using errcode = '42501'; end if;
  select count(*)::integer into existing_total from public.products p where p.restaurant_id = p_restaurant_id;
  for category_item in select value from jsonb_array_elements(p_categories) loop
    if jsonb_typeof(category_item) is distinct from 'object' or jsonb_typeof(category_item->'products') is distinct from 'array' then
      raise exception 'Invalid category data' using errcode = '22023';
    end if;
    if length(btrim(category_item->>'name')) not between 1 and 80
       or coalesce((category_item->>'sort_order')::integer, -1) < 0 then
      raise exception 'Invalid category name or order' using errcode = '22023';
    end if;
    incoming_total := incoming_total + jsonb_array_length(category_item->'products');
    for product_item in select value from jsonb_array_elements(category_item->'products') loop
      if length(btrim(product_item->>'name')) not between 1 and 120
         or length(coalesce(product_item->>'description','')) > 240
         or (product_item->>'price_cents')::integer not between 1 and 99999999
         or coalesce(product_item->>'status','available') not in ('available','sold_out','hidden')
         or coalesce((product_item->>'sort_order')::integer,-1) < 0 then
        raise exception 'Invalid product data' using errcode = '22023';
      end if;
    end loop;
  end loop;
  if existing_total + incoming_total > configured_limit then
    raise exception 'Product limit reached' using errcode = '23514';
  end if;
  for category_item in select value from jsonb_array_elements(p_categories) loop
    insert into public.categories(restaurant_id,name,sort_order,is_visible)
      values(p_restaurant_id,btrim(category_item->>'name'),(category_item->>'sort_order')::integer,true)
      returning id into new_category_id;
    for product_item in select value from jsonb_array_elements(category_item->'products') loop
      insert into public.products(restaurant_id,category_id,name,description,price_cents,status,sort_order)
        values(p_restaurant_id,new_category_id,btrim(product_item->>'name'),coalesce(product_item->>'description',''),
          (product_item->>'price_cents')::integer,coalesce(product_item->>'status','available')::public.product_status,
          (product_item->>'sort_order')::integer);
      inserted_total := inserted_total + 1;
    end loop;
  end loop;
  return inserted_total;
end;
$$;

create or replace function public.admin_restore_menu_backup(p_restaurant_id uuid, p_backup jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  backup_restaurant jsonb;
  category_data jsonb;
  product_data jsonb;
  new_category_id uuid;
  product_id uuid;
  product_image_path text;
  configured_limit integer;
  incoming_total integer := 0;
  restored_total integer := 0;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.platform_admins a where a.user_id = (select auth.uid())
  ) then raise exception 'Platform administrator required' using errcode = '42501'; end if;
  if jsonb_typeof(p_backup) is distinct from 'object' or p_backup->>'format' <> 'alcarte-menu-backup'
     or p_backup->>'version' <> '1' or jsonb_typeof(p_backup->'restaurant') <> 'object'
     or jsonb_typeof(p_backup->'categories') <> 'array' then
    raise exception 'Unsupported or malformed backup' using errcode = '22023';
  end if;
  backup_restaurant := p_backup->'restaurant';
  if length(btrim(backup_restaurant->>'name')) not between 1 and 120
     or length(coalesce(backup_restaurant->>'description','')) > 240
     or backup_restaurant->>'menu_theme' not in ('minimal','classic','night')
     or backup_restaurant->>'menu_accent_color' !~* '^#[0-9a-f]{6}$' then
    raise exception 'Invalid restaurant configuration in backup' using errcode = '22023';
  end if;
  select r.product_limit into configured_limit from public.restaurants r
    where r.id = p_restaurant_id and r.is_active for update;
  if not found then raise exception 'Active restaurant required' using errcode = '42501'; end if;
  for category_data in select value from jsonb_array_elements(p_backup->'categories') loop
    if jsonb_typeof(category_data) is distinct from 'object'
       or jsonb_typeof(category_data->'products') is distinct from 'array'
       or length(btrim(category_data->>'name')) not between 1 and 80 then
      raise exception 'Invalid category in backup' using errcode = '22023';
    end if;
    incoming_total := incoming_total + jsonb_array_length(category_data->'products');
    for product_data in select value from jsonb_array_elements(category_data->'products') loop
      product_id := nullif(product_data->>'id','')::uuid;
      product_image_path := nullif(product_data->>'image_path','null');
      if length(btrim(product_data->>'name')) not between 1 and 120
         or length(coalesce(product_data->>'description','')) > 240
         or (product_data->>'price_cents')::integer not between 1 and 99999999
         or coalesce(product_data->>'status','available') not in ('available','sold_out','hidden') then
        raise exception 'Invalid product in backup' using errcode = '22023';
      end if;
      if product_image_path is not null and (product_id is null or product_image_path not in (
        p_restaurant_id::text || '/products/' || product_id::text || '-a.webp',
        p_restaurant_id::text || '/products/' || product_id::text || '-b.webp'
      )) then raise exception 'Product image path does not belong to this restaurant and product' using errcode = '42501'; end if;
    end loop;
  end loop;
  if incoming_total > configured_limit then raise exception 'Product limit reached' using errcode = '23514'; end if;
  delete from public.categories c where c.restaurant_id = p_restaurant_id;
  update public.restaurants set name=btrim(backup_restaurant->>'name'),
    description=coalesce(backup_restaurant->>'description',''), menu_theme=backup_restaurant->>'menu_theme',
    menu_accent_color=upper(backup_restaurant->>'menu_accent_color') where id=p_restaurant_id;
  for category_data in select value from jsonb_array_elements(p_backup->'categories') loop
    insert into public.categories(restaurant_id,name,sort_order,is_visible)
      values(p_restaurant_id,btrim(category_data->>'name'),coalesce((category_data->>'sort_order')::integer,0),
        coalesce((category_data->>'is_visible')::boolean,true)) returning id into new_category_id;
    for product_data in select value from jsonb_array_elements(category_data->'products') loop
      product_id := nullif(product_data->>'id','')::uuid;
      product_image_path := nullif(product_data->>'image_path','null');
      insert into public.products(id,restaurant_id,category_id,name,description,price_cents,status,sort_order,image_path)
      values(coalesce(product_id,gen_random_uuid()),p_restaurant_id,new_category_id,btrim(product_data->>'name'),coalesce(product_data->>'description',''),
        (product_data->>'price_cents')::integer,coalesce(product_data->>'status','available')::public.product_status,
        coalesce((product_data->>'sort_order')::integer,0),product_image_path);
      restored_total := restored_total + 1;
    end loop;
  end loop;
  return restored_total;
end;
$$;

revoke all on function public.admin_import_menu(uuid,jsonb) from public, anon;
revoke all on function public.admin_restore_menu_backup(uuid,jsonb) from public, anon;
grant execute on function public.admin_import_menu(uuid,jsonb) to authenticated;
grant execute on function public.admin_restore_menu_backup(uuid,jsonb) to authenticated;

-- Remove owner access to the old transfer RPCs. Explicit admin RPCs above are
-- the only supported import/restore path; ordinary menu writes remain governed
-- by their owner-scoped policies and functions.
revoke all on function public.import_owner_menu(jsonb) from public, anon, authenticated;
revoke all on function public.restore_owner_menu_backup(jsonb) from public, anon, authenticated;
