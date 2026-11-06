import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.')
}

const hostname = new URL(url).hostname
if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) {
  throw new Error('Por seguridad, el seed de usuarios solo se ejecuta contra Supabase local.')
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const fixtures = [
  { email: 'comal@example.com', password: 'Comal-Demo-2026!', slug: 'comal-de-prueba' },
  { email: 'terraza@example.com', password: 'Terraza-Demo-2026!', slug: 'terraza-demo' },
  { email: 'admin@example.com', password: 'Admin-Demo-2026!', role: 'platform-admin' },
]

const { data: userPage, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 })
if (listError) throw listError

for (const fixture of fixtures) {
  let user = userPage.users.find((candidate) => candidate.email === fixture.email)

  if (user) {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password: fixture.password,
      email_confirm: true,
    })
    if (error) throw error
    user = data.user
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: fixture.email,
      password: fixture.password,
      email_confirm: true,
    })
    if (error) throw error
    user = data.user
  }

  if (fixture.role === 'platform-admin') {
    const { error: adminError } = await supabase
      .from('platform_admins')
      .upsert({ user_id: user.id })
    if (adminError) throw adminError
    continue
  }

  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .select('id')
    .eq('slug', fixture.slug)
    .single()
  if (restaurantError) throw restaurantError

  const { error: membershipError } = await supabase
    .from('restaurant_members')
    .upsert({ restaurant_id: restaurant.id, user_id: user.id })
  if (membershipError) throw membershipError
}

console.log('Cuentas ficticias y accesos locales listos. No se han enviado correos.')
