create or replace function public.save_owner_category_menu(
  p_category_id uuid,
  p_name text,
  p_is_visible boolean,
  p_products jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_restaurant uuid;
  active_restaurant boolean;
  configured_limit integer;
  existing_total integer;
  new_total integer;
  item jsonb;
  item_id uuid;
  item_name text;
  item_description text;
  item_price integer;
  item_status public.product_status;
  item_order integer;
  changed_rows integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Category name must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if jsonb_typeof(p_products) <> 'array' then
    raise exception 'Products must be a JSON array' using errcode = '22023';
  end if;

  select c.restaurant_id into target_restaurant
    from public.categories c where c.id = p_category_id;
  if not found then
    raise exception 'Category not found' using errcode = '42501';
  end if;

  select r.is_active, r.product_limit into active_restaurant, configured_limit
    from public.restaurants r where r.id = target_restaurant for update;
  if not coalesce(active_restaurant, false) or not exists (
    select 1 from public.restaurant_members m
    where m.restaurant_id = target_restaurant and m.user_id = (select auth.uid())
  ) then
    raise exception 'Restaurant is inactive or not owned by this user' using errcode = '42501';
  end if;

  select count(*)::integer into existing_total
    from public.products p where p.restaurant_id = target_restaurant;
  select count(*)::integer into new_total
    from jsonb_array_elements(p_products) as elements(value)
    where nullif(elements.value->>'id', '') is null;
  if existing_total + new_total > configured_limit then
    raise exception 'Product limit reached' using errcode = '23514', constraint = 'products_restaurant_product_limit';
  end if;

  update public.categories
    set name = btrim(p_name), is_visible = p_is_visible
    where id = p_category_id and restaurant_id = target_restaurant;

  for item in select elements.value from jsonb_array_elements(p_products) as elements(value)
  loop
    item_id := nullif(item->>'id', '')::uuid;
    item_name := btrim(item->>'name');
    item_description := coalesce(item->>'description', '');
    if item_name is null or length(item_name) not between 1 and 120 then
      raise exception 'Product name must be between 1 and 120 characters' using errcode = '22023';
    end if;
    if length(item_description) > 240 then
      raise exception 'Product description cannot exceed 240 characters' using errcode = '22023';
    end if;
    if jsonb_typeof(item->'price_cents') <> 'number' then
      raise exception 'Product price must be integer cents' using errcode = '22023';
    end if;
    item_price := (item->>'price_cents')::integer;
    item_status := (item->>'status')::public.product_status;
    item_order := (item->>'sort_order')::integer;

    if item_id is null then
      insert into public.products (restaurant_id, category_id, name, description, price_cents, status, sort_order)
      values (target_restaurant, p_category_id, item_name, item_description, item_price, item_status, item_order);
    else
      update public.products
        set name = item_name,
            description = item_description,
            price_cents = item_price,
            status = item_status,
            sort_order = item_order
        where id = item_id
          and restaurant_id = target_restaurant
          and category_id = p_category_id;
      get diagnostics changed_rows = row_count;
      if changed_rows <> 1 then
        raise exception 'Product does not belong to this category' using errcode = '42501';
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.save_owner_category_menu(uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.save_owner_category_menu(uuid, text, boolean, jsonb) to authenticated;
