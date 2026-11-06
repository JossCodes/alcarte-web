create or replace function public.update_owner_restaurant_profile(
  p_name text,
  p_description text
)
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
  if p_name is null or length(btrim(p_name)) not between 1 and 120
     or length(coalesce(p_description, '')) > 240 then
    raise exception 'Invalid restaurant name or description' using errcode = '22023';
  end if;
  select m.restaurant_id into target_restaurant
    from public.restaurant_members m
    join public.restaurants r on r.id = m.restaurant_id
    where m.user_id = (select auth.uid()) and r.is_active;
  if not found or (select count(*) from public.restaurant_members m
      join public.restaurants r on r.id = m.restaurant_id
      where m.user_id = (select auth.uid()) and r.is_active) <> 1 then
    raise exception 'Exactly one active restaurant membership required' using errcode = '42501';
  end if;
  update public.restaurants
    set name = btrim(p_name), description = coalesce(p_description, '')
    where id = target_restaurant;
end;
$$;

revoke all on function public.update_owner_restaurant_profile(text, text) from public, anon;
grant execute on function public.update_owner_restaurant_profile(text, text) to authenticated;
