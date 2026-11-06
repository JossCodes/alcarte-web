import { afterEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const configured = Boolean(url && anonKey)

const comalEmail = 'comal@example.com'
const comalPassword = 'Comal-Demo-2026!'

const publicClient = configured
  ? createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
  : null

afterEach(async () => {
  if (publicClient) await publicClient.auth.signOut()
})

describe.skipIf(!configured)('recorrido de menú en Supabase local', () => {
  it('el dueño actualiza un precio y la URL pública devuelve el cambio', async () => {
    const owner = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: loginError } = await owner.auth.signInWithPassword({ email: comalEmail, password: comalPassword })
    expect(loginError).toBeNull()

    const { data: restaurant, error: restaurantError } = await owner
      .from('restaurants').select('id,slug').eq('slug', 'comal-de-prueba').single()
    expect(restaurantError).toBeNull()

    const { data: product, error: productError } = await owner
      .from('products').select('id,price_cents').eq('restaurant_id', restaurant!.id).order('sort_order').limit(1).single()
    expect(productError).toBeNull()
    const originalPrice = product!.price_cents
    const updatedPrice = originalPrice + 123

    const { data: updated, error: updateError } = await owner
      .from('products').update({ price_cents: updatedPrice }).eq('id', product!.id).select('price_cents').single()
    expect(updateError).toBeNull()
    expect(updated?.price_cents).toBe(updatedPrice)

    const { data: publicRestaurant, error: publicRestaurantError } = await publicClient!
      .from('restaurants').select('id').eq('slug', restaurant!.slug).single()
    expect(publicRestaurantError).toBeNull()
    const { data: publicProduct, error: publicProductError } = await publicClient!
      .from('products').select('price_cents').eq('restaurant_id', publicRestaurant!.id).eq('id', product!.id).single()
    expect(publicProductError).toBeNull()
    expect(publicProduct?.price_cents).toBe(updatedPrice)

    const { error: restoreError } = await owner.from('products').update({ price_cents: originalPrice }).eq('id', product!.id)
    expect(restoreError).toBeNull()
    await owner.auth.signOut()
  })

  it('el dueño A lee el menú publicado de B pero no modifica sus productos ni usa sus RPC', async () => {
    const owner = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: loginError } = await owner.auth.signInWithPassword({ email: comalEmail, password: comalPassword })
    expect(loginError).toBeNull()

    const { data: otherRestaurant, error: restaurantError } = await owner
      .from('restaurants').select('id,name').eq('slug', 'terraza-demo').maybeSingle()
    expect(restaurantError).toBeNull()
    // Restaurant names and published menus are public by design.
    expect(otherRestaurant?.name).toBe('Terraza Demo')

    const { data: otherProduct, error: otherProductError } = await publicClient!
      .from('products').select('id,price_cents').eq('restaurant_id', otherRestaurant!.id).order('sort_order').limit(1).single()
    expect(otherProductError).toBeNull()
    const { data: unreadableProducts, error: readError } = await owner
      .from('products').select('id,price_cents').eq('id', otherProduct!.id)
    expect(readError).toBeNull()
    expect(unreadableProducts).toEqual([{ id: otherProduct!.id, price_cents: otherProduct!.price_cents }])

    const { data: changedProducts, error: updateError } = await owner
      .from('products').update({ price_cents: 1 }).eq('id', otherProduct!.id).select('id')
    expect(updateError).toBeNull()
    expect(changedProducts).toEqual([])

    const { data: unchangedProduct, error: publicReadError } = await publicClient!
      .from('products').select('price_cents').eq('id', otherProduct!.id).single()
    expect(publicReadError).toBeNull()
    expect(unchangedProduct?.price_cents).toBe(otherProduct!.price_cents)

    const { data: otherCategory, error: otherCategoryError } = await publicClient!
      .from('categories').select('id').eq('restaurant_id', otherRestaurant!.id).limit(1).single()
    expect(otherCategoryError).toBeNull()

    const { error: moveOtherOwnerError } = await owner.rpc('move_owner_product', {
      p_product_id: otherProduct!.id, p_direction: -1,
    })
    expect(moveOtherOwnerError?.code).toBe('42501')
    const { error: saveOtherOwnerError } = await owner.rpc('save_owner_category_menu', {
      p_category_id: otherCategory!.id, p_name: 'Manipulada', p_is_visible: true, p_products: [],
    })
    expect(saveOtherOwnerError?.code).toBe('42501')
    await owner.auth.signOut()
  })

  it('la lectura anónima oculta productos ocultos y mantiene los agotados', async () => {
    const { data: publicProducts, error } = await publicClient!
      .from('products').select('id,status').eq('restaurant_id', '20000000-0000-4000-8000-000000000001')
    expect(error).toBeNull()
    expect(publicProducts?.some((product) => product.status === 'hidden')).toBe(false)
    expect(publicProducts?.some((product) => product.status === 'sold_out')).toBe(true)
  })

  it('el dueño crea y edita categorías/productos sin exponer categorías ocultas', async () => {
    const owner = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: loginError } = await owner.auth.signInWithPassword({ email: comalEmail, password: comalPassword })
    expect(loginError).toBeNull()
    const slug = `integration-${Date.now()}`
    const { data: otherCategory, error: otherCategoryReadError } = await publicClient!
      .from('categories').select('id').eq('restaurant_id', '20000000-0000-4000-8000-000000000002').limit(1).single()
    expect(otherCategoryReadError).toBeNull()
    const { data: category, error: categoryError } = await owner.from('categories')
      .insert({ restaurant_id: '20000000-0000-4000-8000-000000000001', name: slug, sort_order: 50 })
      .select('id').single()
    expect(categoryError).toBeNull()
    expect(category).not.toBeNull()

    try {
      const { error: rejectedBatchError } = await owner.rpc('save_owner_category_menu', {
        p_category_id: category!.id,
        p_name: `${slug}-no-aplicar`,
        p_is_visible: false,
        p_products: [{ name: 'Precio inválido', description: '', price_cents: 0, status: 'available', sort_order: 0 }],
      })
      expect(rejectedBatchError?.code).toBe('23514')
      const { data: unchangedCategory } = await owner.from('categories').select('name,is_visible').eq('id', category!.id).single()
      expect(unchangedCategory).toEqual({ name: slug, is_visible: true })

      const { error: batchSaveError } = await owner.rpc('save_owner_category_menu', {
        p_category_id: category!.id,
        p_name: `${slug}-editado`,
        p_is_visible: true,
        p_products: [
          { name: 'Empate A', description: 'Descripción A', price_cents: 100, status: 'available', sort_order: 0 },
          { name: 'Empate B', description: 'Descripción B', price_cents: 200, status: 'sold_out', sort_order: 0 },
        ],
      })
      expect(batchSaveError).toBeNull()
      const { data: tiedOrder, error: tiedOrderError } = await owner.from('products').select('id,name,sort_order').eq('category_id', category!.id).order('sort_order').order('id')
      expect(tiedOrderError).toBeNull()
      expect(tiedOrder).toHaveLength(2)
      const firstBeforeMove = tiedOrder![0].id
      const { data: moved, error: moveError } = await owner.rpc('move_owner_product', { p_product_id: firstBeforeMove, p_direction: 1 })
      expect(moveError).toBeNull()
      expect(moved).toBe(true)
      const { data: orderedAfterMove, error: orderReadError } = await owner.from('products').select('id,sort_order').eq('category_id', category!.id).order('sort_order').order('id')
      expect(orderReadError).toBeNull()
      expect(orderedAfterMove?.[0].id).not.toBe(firstBeforeMove)
      expect(orderedAfterMove?.[1].id).toBe(firstBeforeMove)
      expect(orderedAfterMove?.map((item) => item.sort_order)).toEqual([0, 1])

      const { error: crossRestaurantError } = await owner.from('products').insert({
        restaurant_id: '20000000-0000-4000-8000-000000000001',
        category_id: otherCategory!.id,
        name: 'No debe vincularse', price_cents: 100,
      })
      expect(crossRestaurantError?.code).toBe('23503')

      const { error: hideError } = await owner.rpc('save_owner_category_menu', {
        p_category_id: category!.id,
        p_name: `${slug}-editado`,
        p_is_visible: false,
        p_products: orderedAfterMove!.map((product, sort_order) => ({ ...product, name: `Editado ${sort_order}`, description: '', price_cents: 100, status: 'available', sort_order })),
      })
      expect(hideError).toBeNull()
      const { data: hiddenCategory } = await publicClient!.from('categories').select('id').eq('id', category!.id)
      const { data: hiddenProduct } = await publicClient!.from('products').select('id').eq('category_id', category!.id)
      expect(hiddenCategory).toEqual([])
      expect(hiddenProduct).toEqual([])
    } finally {
      await owner.from('categories').delete().eq('id', category!.id)
      await owner.auth.signOut()
    }
  })

  it('Storage admite imágenes WebP solo para el restaurante propio y las sirve públicamente', async () => {
    const owner = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: loginError } = await owner.auth.signInWithPassword({ email: comalEmail, password: comalPassword })
    expect(loginError).toBeNull()

    const { data: restaurant, error: restaurantError } = await owner.from('restaurants')
      .select('id,menu_logo_path').eq('slug', 'comal-de-prueba').single()
    expect(restaurantError).toBeNull()
    const slot = restaurant!.menu_logo_path?.endsWith('logo-a.webp') ? 'b' : 'a'
    // Avoid reusing the fixed slot that may contain a leftover unpublished object from a prior run.
    const testSlot = slot === 'a' ? 'b' : 'a'
    const path = `${restaurant!.id}/logo-${testSlot}.webp`
    const webp = Uint8Array.from(
      atob('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA=='),
      (character) => character.charCodeAt(0),
    )

    try {
      // Repeated local runs may leave the inactive test slot behind if teardown was interrupted.
      const { error: staleSlotError } = await owner.storage.from('menu-images').remove([path])
      expect(staleSlotError).toBeNull()
      const { error: uploadError } = await owner.storage.from('menu-images').upload(
        path,
        new Blob([webp], { type: 'image/webp' }),
        { contentType: 'image/webp', upsert: false },
      )
      expect(uploadError).toBeNull()

      const publicUrl = owner.storage.from('menu-images').getPublicUrl(path).data.publicUrl
      const publicResponse = await fetch(publicUrl)
      expect(publicResponse.status).toBe(200)
      expect(publicResponse.headers.get('content-type')).toContain('image/webp')

      const { error: crossRestaurantError } = await owner.storage.from('menu-images').upload(
        '20000000-0000-4000-8000-000000000002/logo-a.webp',
        new Blob([webp], { type: 'image/webp' }),
        { contentType: 'image/webp', upsert: true },
      )
      expect(crossRestaurantError).not.toBeNull()

      const { error: anonymousUploadError } = await publicClient!.storage.from('menu-images').upload(
        path,
        new Blob([webp], { type: 'image/webp' }),
        { contentType: 'image/webp', upsert: true },
      )
      expect(anonymousUploadError).not.toBeNull()
    } finally {
      await owner.storage.from('menu-images').remove([path])
      await owner.auth.signOut()
    }
  })

  it('serializa altas simultáneas y nunca permite pasar el límite de 40', async () => {
    const owner = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: loginError } = await owner.auth.signInWithPassword({ email: comalEmail, password: comalPassword })
    expect(loginError).toBeNull()
    const { data: restaurant, error: restaurantError } = await owner.from('restaurants').select('id').eq('slug', 'comal-de-prueba').single()
    expect(restaurantError).toBeNull()
    const restaurantId = restaurant!.id
    const { data: category, error: categoryError } = await owner.from('categories').select('id').eq('restaurant_id', restaurantId).limit(1).single()
    expect(categoryError).toBeNull()
    const categoryId = category!.id
    const prefix = `limit-test-${Date.now()}`
    try {
      const { count, error: countError } = await owner.from('products').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId)
      expect(countError).toBeNull()
      const fillCount = 39 - (count ?? 0)
      if (fillCount > 0) {
        const fixtures = Array.from({ length: fillCount }, (_, index) => ({ restaurant_id: restaurantId, category_id: categoryId, name: `${prefix}-${index}`, price_cents: 100, sort_order: 20 + index }))
        const { error: fillError } = await owner.from('products').insert(fixtures)
        expect(fillError).toBeNull()
      }

      const concurrent = await Promise.all([
        owner.from('products').insert({ restaurant_id: restaurantId, category_id: categoryId, name: `${prefix}-a`, price_cents: 100 }),
        owner.from('products').insert({ restaurant_id: restaurantId, category_id: categoryId, name: `${prefix}-b`, price_cents: 100 }),
      ])
      expect(concurrent.filter((result) => !result.error)).toHaveLength(1)
      expect(concurrent.filter((result) => result.error?.code === '23514')).toHaveLength(1)
      const { count: finalCount, error: finalCountError } = await owner.from('products').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId)
      expect(finalCountError).toBeNull()
      expect(finalCount).toBe(40)
    } finally {
      await owner.from('products').delete().eq('restaurant_id', restaurantId).like('name', `${prefix}%`)
      await owner.auth.signOut()
    }
  })
})
