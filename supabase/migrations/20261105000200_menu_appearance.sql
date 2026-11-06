alter table public.restaurants
  add column menu_theme text not null default 'minimal'
    check (menu_theme in ('minimal', 'classic', 'night')),
  add column menu_accent_color text not null default '#284D3B'
    check (menu_accent_color ~* '^#[0-9a-f]{6}$');

grant select (menu_theme, menu_accent_color)
  on public.restaurants to anon, authenticated;

create or replace function public.update_owner_menu_appearance(
  p_theme text,
  p_accent_color text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_restaurant uuid;
  membership_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_theme is null or p_theme not in ('minimal', 'classic', 'night') then
    raise exception 'Unsupported menu theme' using errcode = '22023';
  end if;
  if p_accent_color is null or p_accent_color !~* '^#[0-9a-f]{6}$' then
    raise exception 'Accent color must be a six-digit hex color' using errcode = '22023';
  end if;

  select count(*)::integer into membership_count
    from public.restaurant_members m
    join public.restaurants r on r.id = m.restaurant_id
    where m.user_id = (select auth.uid()) and r.is_active;
  if membership_count <> 1 then
    raise exception 'Exactly one active restaurant membership required' using errcode = '42501';
  end if;
  select m.restaurant_id into target_restaurant
    from public.restaurant_members m
    join public.restaurants r on r.id = m.restaurant_id
    where m.user_id = (select auth.uid()) and r.is_active;

  update public.restaurants
    set menu_theme = p_theme, menu_accent_color = upper(p_accent_color)
    where id = target_restaurant;
end;
$$;

revoke all on function public.update_owner_menu_appearance(text, text) from public, anon;
grant execute on function public.update_owner_menu_appearance(text, text) to authenticated;
