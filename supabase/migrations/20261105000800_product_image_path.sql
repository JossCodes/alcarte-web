-- Optional product photos. Existing menu rows remain valid and keep NULL.
alter table public.products
  add column image_path text,
  add constraint products_image_path_check
    check (
      image_path is null
      or image_path in (
        restaurant_id::text || '/products/' || id::text || '-a.webp',
        restaurant_id::text || '/products/' || id::text || '-b.webp'
      )
    );

grant select (image_path) on public.products to anon, authenticated;
