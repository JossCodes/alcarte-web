-- The configured product cap is an administrative setting, not public menu data.
revoke select on public.restaurants from anon, authenticated;
grant select (id, slug, name, description, is_active, created_at)
  on public.restaurants to anon, authenticated;
