create or replace function public.move_owner_product(p_product_id uuid, p_direction integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_restaurant uuid;
  target_category uuid;
  restaurant_active boolean;
  product_ids uuid[];
  current_position integer;
  swap_id uuid;
begin
  if p_direction not in (-1, 1) then
    raise exception 'Direction must be -1 or 1' using errcode = '22023';
  end if;
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.restaurant_id, p.category_id into target_restaurant, target_category
    from public.products p where p.id = p_product_id;
  if not found then return false; end if;

  -- Serialize ordering and other owner writes against restaurant deactivation.
  select r.is_active into restaurant_active
    from public.restaurants r where r.id = target_restaurant for update;
  if not coalesce(restaurant_active, false) or not exists (
    select 1 from public.restaurant_members m
    where m.restaurant_id = target_restaurant and m.user_id = (select auth.uid())
  ) then
    raise exception 'Restaurant is inactive or not owned by this user' using errcode = '42501';
  end if;

  perform p.id from public.products p
    where p.restaurant_id = target_restaurant and p.category_id = target_category
    order by p.sort_order, p.id for update;

  select array_agg(p.id order by p.sort_order, p.id) into product_ids
    from public.products p
    where p.restaurant_id = target_restaurant and p.category_id = target_category;

  current_position := array_position(product_ids, p_product_id);
  if current_position is null or current_position + p_direction < 1
     or current_position + p_direction > coalesce(array_length(product_ids, 1), 0) then
    return false;
  end if;

  swap_id := product_ids[current_position + p_direction];
  product_ids[current_position + p_direction] := p_product_id;
  product_ids[current_position] := swap_id;

  update public.products p
    set sort_order = ordered.position - 1
    from unnest(product_ids) with ordinality as ordered(id, position)
    where p.id = ordered.id;
  return true;
end;
$$;

revoke all on function public.move_owner_product(uuid, integer) from public, anon;
grant execute on function public.move_owner_product(uuid, integer) to authenticated;
