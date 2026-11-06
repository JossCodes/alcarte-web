create or replace function public.import_owner_menu(p_categories jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_restaurant uuid;
  configured_limit integer;
  existing_total integer;
  incoming_total integer := 0;
  inserted_total integer := 0;
  category_item jsonb;
  product_item jsonb;
  new_category_id uuid;
  category_name text;
  category_order integer;
  product_name text;
  product_description text;
  product_price integer;
  product_status public.product_status;
  product_order integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_categories) <> 'array' or jsonb_array_length(p_categories) = 0 then
    raise exception 'Categories must be a non-empty JSON array' using errcode = '22023';
  end if;

  select r.id, r.product_limit into target_restaurant, configured_limit
    from public.restaurants r
    join public.restaurant_members m on m.restaurant_id = r.id
    where m.user_id = (select auth.uid()) and r.is_active
    for update of r;
  if not found then
    raise exception 'Active restaurant membership required' using errcode = '42501';
  end if;
  if (select count(*) from public.restaurant_members m join public.restaurants r on r.id=m.restaurant_id
      where m.user_id=(select auth.uid()) and r.is_active) <> 1 then
    raise exception 'Exactly one active restaurant membership required' using errcode = '42501';
  end if;

  select count(*)::integer into existing_total from public.products p where p.restaurant_id = target_restaurant;
  for category_item in select value from jsonb_array_elements(p_categories)
  loop
    if jsonb_typeof(category_item) <> 'object'
       or jsonb_typeof(category_item->'products') <> 'array'
       or jsonb_array_length(category_item->'products') = 0 then
      raise exception 'Each category must contain a non-empty products array' using errcode = '22023';
    end if;
    incoming_total := incoming_total + jsonb_array_length(category_item->'products');
    category_name := btrim(category_item->>'name');
    category_order := (category_item->>'sort_order')::integer;
    if category_name is null or length(category_name) not between 1 and 80
       or category_order is null or category_order < 0 then
      raise exception 'Invalid category name or order' using errcode = '22023';
    end if;
    for product_item in select value from jsonb_array_elements(category_item->'products')
    loop
      product_name := btrim(product_item->>'name');
      product_description := coalesce(product_item->>'description', '');
      product_price := (product_item->>'price_cents')::integer;
      product_status := (product_item->>'status')::public.product_status;
      product_order := (product_item->>'sort_order')::integer;
      if product_name is null or length(product_name) not between 1 and 120
         or length(product_description) > 240
         or product_price not between 1 and 99999999
         or product_status not in ('available', 'sold_out', 'hidden')
         or product_order is null or product_order < 0 then
        raise exception 'Invalid product name, description, price, status or order' using errcode = '22023';
      end if;
    end loop;
  end loop;

  if existing_total + incoming_total > configured_limit then
    raise exception 'Product limit reached' using errcode = '23514', constraint = 'products_restaurant_product_limit';
  end if;

  for category_item in select value from jsonb_array_elements(p_categories)
  loop
    insert into public.categories (restaurant_id, name, sort_order, is_visible)
    values (target_restaurant, btrim(category_item->>'name'), (category_item->>'sort_order')::integer, true)
    returning id into new_category_id;
    for product_item in select value from jsonb_array_elements(category_item->'products')
    loop
      insert into public.products (restaurant_id, category_id, name, description, price_cents, status, sort_order)
      values (
        target_restaurant, new_category_id, btrim(product_item->>'name'), coalesce(product_item->>'description', ''),
        (product_item->>'price_cents')::integer, (product_item->>'status')::public.product_status,
        (product_item->>'sort_order')::integer
      );
      inserted_total := inserted_total + 1;
    end loop;
  end loop;
  return inserted_total;
end;
$$;

revoke all on function public.import_owner_menu(jsonb) from public, anon;
grant execute on function public.import_owner_menu(jsonb) to authenticated;
