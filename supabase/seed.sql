-- Fictional local-only restaurant data. Auth users are provisioned separately
-- through Supabase Auth's local Admin API; never seed customer passwords in SQL.
insert into public.restaurants (id, slug, name, description, is_active) values
  ('20000000-0000-4000-8000-000000000001', 'comal-de-prueba', 'Comal de Prueba', 'Cocina de barrio para una demo ficticia.', true),
  ('20000000-0000-4000-8000-000000000002', 'terraza-demo', 'Terraza Demo', 'Bebidas y antojitos de una terraza ficticia.', true)
on conflict (id) do nothing;

insert into public.categories (id, restaurant_id, name, sort_order, is_visible) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Para empezar', 0, true),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'De la cocina', 1, true),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'Bebidas', 0, true)
on conflict (id) do nothing;

insert into public.products (id, restaurant_id, category_id, name, description, price_cents, status, sort_order) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Esquite de la casa', 'Elote tatemado, mayo de limón.', 8900, 'available', 0),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Tostada de aguachile', 'Pescado fresco, pepino y chile.', 14500, 'sold_out', 1),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Enchiladas de la abuela', 'Salsa verde, queso y crema.', 17800, 'available', 0),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Receta secreta', 'Producto oculto de prueba.', 9900, 'hidden', 1),
  ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Agua fresca del día', 'Jamaica o limón.', 4500, 'available', 0),
  ('40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Limonada mineral', 'Con limón recién exprimido.', 6500, 'available', 1),
  ('40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Bebida de prueba oculta', 'Producto oculto del segundo restaurante.', 12000, 'hidden', 2)
on conflict (id) do nothing;
