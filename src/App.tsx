import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { formatMXN, parsePriceToCents } from './lib/validation'
import { MENU_THEME_LABELS, MENU_THEMES, menuContrastRatio, normalizeHexColor, readableTextOn, type MenuTheme } from './lib/menu-theme'
import { isSupabaseConfigured, publicSupabase, recoverySupabase, supabase } from './lib/supabase'
import { parseMenuCsv, serializeMenuCsv, type MenuCsvRow } from './lib/menu-transfer'
import { authenticatedHome, isPublicMenuPath, privateRouteDecision } from './lib/auth-state'

interface Restaurant {
  id: string
  slug: string
  name: string
  description: string
  is_active: boolean
  menu_theme: MenuTheme
  menu_accent_color: string
  menu_logo_path: string | null
  menu_cover_path: string | null
}

interface Category {
  id: string
  restaurant_id: string
  name: string
  sort_order: number
  is_visible: boolean
}

interface Product {
  id: string
  restaurant_id: string
  category_id: string
  name: string
  description: string
  price_cents: number
  status: 'available' | 'sold_out' | 'hidden'
  sort_order: number
  image_path?: string | null
}

interface ProductDraft {
  draftKey: string
  id?: string
  name: string
  description: string
  price: string
  status: Product['status']
  imagePath?: string | null
  photoBlob?: Blob | null
  photoPreview?: string
  removeImage?: boolean
}

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark${small ? ' brand-mark--small' : ''}`} aria-hidden="true">
      a.
    </span>
  )
}

function TopBar() {
  const { session } = useAuth()
  return (
    <header className="topbar">
      <Link className="brand" to="/" aria-label="alcarte, inicio">
        <Mark />
        <span>alcarte</span>
      </Link>
      <span className="topbar-note">Menús públicos para restaurantes</span>
      <Link className="topbar-link" to="/login">
        {session ? 'Mi menú' : 'Acceso restaurantes'} <span aria-hidden="true">↗</span>
      </Link>
    </header>
  )
}

function StatusNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="status-card" role="status">
      <span className="status-icon" aria-hidden="true">i</span>
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </section>
  )
}

function useUnsavedChangesWarning(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])
}

function HomePage() {
  return (
    <main className="landing page-width">
      <div className="landing-copy">
        <div className="eyebrow"><span className="eyebrow-dot" /> HECHO PARA RESTAURANTES INDEPENDIENTES</div>
        <h1>Tu menú con<br /><em>fotos y precios</em> actualizados.</h1>
        <p className="lead">Publica los productos, categorías y precios de tu restaurante en un menú que tus clientes abren desde un enlace, un código QR o una etiqueta NFC.</p>
        <div className="landing-actions">
          <Link className="button button--dark" to="/login">Iniciar sesión <span aria-hidden="true">→</span></Link>
          <a className="quiet-link" href="#como-funciona">Cómo se consulta el menú <span aria-hidden="true">↓</span></a>
        </div>
        <div className="micro-proof"><span aria-hidden="true">✳</span> Un mismo enlace para compartir por QR o NFC</div>
      </div>

      <div className="menu-art" aria-label="Vista ilustrativa de un menú en un teléfono">
        <div className="art-orbit art-orbit--one" />
        <div className="art-orbit art-orbit--two" />
        <div className="floating-tag floating-tag--top"><span className="tag-spark">✳</span> Actualiza en segundos</div>
        <div className="phone">
          <div className="phone-island" />
          <div className="phone-screen">
            <div className="mock-status"><span>9:41</span><span>● ● ●</span></div>
            <div className="mock-cover">
              <span className="mock-cover-label">EJEMPLO FICTICIO · MENÚ</span>
              <span className="mock-flower" aria-hidden="true">✳</span>
              <span className="mock-word">Casa<br />Lumbre</span>
            </div>
            <div className="mock-content">
              <div className="mock-meta">ZAPOPAN · COCINA DE BARRIO</div>
              <div className="mock-category"><span>Para empezar</span><span>01</span></div>
              <div className="mock-dish"><span className="dish-dot dish-dot--green" /><div><b>Esquite de la casa</b><small>Elote tatemado, mayo de limón</small></div><strong>$89</strong></div>
              <div className="mock-dish"><span className="dish-dot dish-dot--orange" /><div><b>Tostada de aguachile</b><small>Pescado fresco, pepino y chile</small></div><strong>$145</strong></div>
              <div className="mock-category mock-category--second"><span>De la cocina</span><span>02</span></div>
              <div className="mock-dish"><span className="dish-dot dish-dot--red" /><div><b>Enchiladas de la abuela</b><small>Verdes, queso fresco, crema</small></div><strong>$178</strong></div>
              <div className="mock-footer"><span>Hecho con</span><b><Mark small /> alcarte</b></div>
            </div>
          </div>
        </div>
        <div className="floating-tag floating-tag--bottom"><span className="tag-check">✓</span> Se ve bien en cualquier celular</div>
      </div>

      <div className="landing-bottom" id="como-funciona">
        <span>01 / TU MENÚ EN LÍNEA</span>
        <span>02 / ACTUALIZA CUANDO QUIERAS</span>
        <span>03 / SIEMPRE EL MISMO ENLACE</span>
      </div>
    </main>
  )
}

function LoginPage() {
  const { session, ready, checkingError, notice, retrySessionCheck } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [roleCheck, setRoleCheck] = useState<'idle' | 'checking' | 'error'>('idle')
  const [roleError, setRoleError] = useState('')
  const [roleRetry, setRoleRetry] = useState(0)
  const userId = session?.user.id

  useEffect(() => {
    if (!ready || !userId || !supabase) return
    let active = true
    setRoleCheck('checking')
    setRoleError('')
    void (async () => {
      try {
        const { data, error: lookupError } = await supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle()
        if (!active) return
        if (lookupError) {
          setRoleError('Tu sesión sigue activa, pero no pudimos comprobar tu acceso. Inténtalo de nuevo.')
          setRoleCheck('error')
          return
        }
        navigate(authenticatedHome(Boolean(data)), { replace: true })
      } catch {
        if (active) {
          setRoleError('Tu sesión sigue activa, pero no pudimos comprobar tu acceso. Inténtalo de nuevo.')
          setRoleCheck('error')
        }
      }
    })()
    return () => { active = false }
  }, [ready, userId, navigate, roleRetry])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current) return
    setError('')
    if (!supabase) return
    busyRef.current = true
    setBusy(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) setError('No pudimos iniciar sesión. Revisa tu conexión, correo y contraseña.')
    } catch {
      setError('No pudimos iniciar sesión. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  if (!ready || checkingError) return <main className="simple-page page-width"><p role="status">{checkingError || 'Comprobando si ya tienes una sesión…'}</p>{checkingError && <button className="button button--outline" type="button" onClick={() => void retrySessionCheck()}>Volver a comprobar</button>}</main>
  if (session) return <main className="simple-page page-width"><p role="status">{roleCheck === 'error' ? roleError : 'Abriendo tu espacio…'}</p>{roleCheck === 'error' && <button className="button button--outline" type="button" onClick={() => setRoleRetry((value) => value + 1)}>Reintentar</button>}</main>

  return (
    <main className="simple-page page-width">
      <div className="simple-kicker">PORTAL DEL RESTAURANTE</div>
          <h1>Inicia sesión</h1>
          <p className="simple-lead">Usa el correo y la contraseña asignados a tu restaurante para editar productos, precios y la presentación del menú.</p>
      {notice && <p className="owner-notice" role="status">{notice}</p>}
      {!isSupabaseConfigured ? (
        <StatusNotice title="El acceso aún no está conectado">
          Esta base está lista para conectar Supabase, pero faltan sus variables públicas de proyecto. No hay inicio de sesión activo todavía.
        </StatusNotice>
      ) : (
        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button--dark login-submit" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Iniciar sesión'} <span aria-hidden="true">→</span></button>
        </form>
      )}
      <Link className="back-link" to="/">← Volver al inicio</Link>
    </main>
  )
}

function ResetPasswordPage() {
  const [params] = useSearchParams()
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    if (!recoverySupabase) return
    setBusy(true)
    const fragmentParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const tokenHash = fragmentParams.get('token_hash') ?? params.get('token_hash')
    const { error: verifyError } = tokenHash
      ? await recoverySupabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      : { error: new Error('missing token') }
    if (verifyError) {
      window.history.replaceState({}, '', '/reset-password')
      setBusy(false)
      setMessage('Este enlace no es válido, ya se utilizó o venció. Solicita uno nuevo al administrador.')
      return
    }
    window.history.replaceState({}, '', '/reset-password')
    const { error: updateError } = await recoverySupabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) {
      setMessage('No se pudo actualizar la contraseña. Intenta de nuevo con una contraseña de al menos 10 caracteres.')
      return
    }
    setCompleted(true)
    setMessage('Contraseña actualizada. Ya puedes iniciar sesión.')
  }

  return <main className="simple-page page-width"><div className="simple-kicker">ACCESO SEGURO</div><h1>Elige tu contraseña.</h1><p className="simple-lead">El enlace es de un solo uso y tiene vigencia limitada.</p>{!isSupabaseConfigured ? <StatusNotice title="Supabase no está configurado">No se puede validar este enlace.</StatusNotice> : completed ? <StatusNotice title="Listo">{message}</StatusNotice> : <form className="login-form" onSubmit={(event) => void submit(event)}><label htmlFor="new-password">Nueva contraseña</label><input id="new-password" type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(event) => setPassword(event.target.value)} />{message && <p className="form-error" role="alert">{message}</p>}<button className="button button--dark login-submit" disabled={busy}>{busy ? 'Validando…' : 'Guardar contraseña'}</button></form>}<Link className="back-link" to="/login">Ir a iniciar sesión</Link></main>
}

interface AdminRestaurant {
  id: string
  slug: string
  name: string
  description: string
  is_active: boolean
  product_limit: number
  owners: { id: string; email: string | null }[]
}

function AdminDashboard() {
  const navigate = useNavigate()
  const { signOutLocally } = useAuth()
  const [restaurants, setRestaurants] = useState<AdminRestaurant[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [recoveryUrl, setRecoveryUrl] = useState('')
  const [newRestaurant, setNewRestaurant] = useState({ name: '', slug: '', description: '', productLimit: '40', ownerEmail: '' })
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [transferData, setTransferData] = useState<{ restaurant: Restaurant; categories: Category[]; products: Product[] } | null>(null)
  const [signOutError, setSignOutError] = useState('')

  async function callAdmin<T>(body: Record<string, unknown>): Promise<T> {
    if (!supabase) throw new Error('Supabase no está configurado.')
    const { data, error: invokeError } = await supabase.functions.invoke('admin-operations', { body })
    if (invokeError) throw new Error('No se pudo contactar la administración.')
    if (data?.error) throw new Error(String(data.error))
    return data as T
  }

  async function load() {
    try {
      setError('')
      const result = await callAdmin<{ restaurants: AdminRestaurant[] }>({ action: 'listRestaurants' })
      setRestaurants(result.restaurants)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la administración.')
    }
  }

  useEffect(() => { void load() }, [])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setRecoveryUrl('')
    try {
      const result = await callAdmin<{ recoveryUrl: string }>({ action: 'createRestaurant', ...newRestaurant, productLimit: Number(newRestaurant.productLimit) })
      setRecoveryUrl(result.recoveryUrl)
      setMessage('Restaurante creado. Copia ahora el enlace de acceso; no se enviará por correo.')
      setNewRestaurant({ name: '', slug: '', description: '', productLimit: '40', ownerEmail: '' })
      await load()
    } catch (createError) { setError(createError instanceof Error ? createError.message : 'No se pudo crear el restaurante.') }
    finally { setBusy(false) }
  }

  async function update(restaurant: AdminRestaurant) {
    setBusy(true); setError('')
    try {
      await callAdmin({ action: 'updateRestaurant', restaurantId: restaurant.id, name: restaurant.name, description: restaurant.description, productLimit: restaurant.product_limit, isActive: !restaurant.is_active })
      setMessage(restaurant.is_active ? 'Restaurante desactivado. La carta se conserva.' : 'Restaurante reactivado.')
      await load()
    } catch (updateError) { setError(updateError instanceof Error ? updateError.message : 'No se pudo actualizar el restaurante.') }
    finally { setBusy(false) }
  }

  async function assign(restaurant: AdminRestaurant) {
    const ownerEmail = assignments[restaurant.id]?.trim()
    if (!ownerEmail) return
    setBusy(true); setError('')
    try {
      await callAdmin({ action: 'assignOwnerByEmail', restaurantId: restaurant.id, ownerEmail })
      setMessage('Acceso asignado. Genera un enlace de recuperación para entregarlo al dueño.')
      setAssignments((current) => ({ ...current, [restaurant.id]: '' }))
      await load()
    } catch (assignError) { setError(assignError instanceof Error ? assignError.message : 'No se pudo asignar el acceso.') }
    finally { setBusy(false) }
  }

  async function recover(restaurant: AdminRestaurant, ownerId: string) {
    setBusy(true); setError(''); setRecoveryUrl('')
    try {
      const result = await callAdmin<{ recoveryUrl: string }>({ action: 'generateRecoveryLink', restaurantId: restaurant.id, ownerUserId: ownerId })
      setRecoveryUrl(result.recoveryUrl)
      setMessage('Enlace temporal generado. Compártelo únicamente con el dueño y no lo registres.')
    } catch (recoverError) { setError(recoverError instanceof Error ? recoverError.message : 'No se pudo generar el enlace.') }
    finally { setBusy(false) }
  }

  async function openTransfer(restaurantId: string) {
    setBusy(true); setError('')
    try {
      const result = await callAdmin<{ restaurant: Restaurant; categories: Category[]; products: Product[] }>({ action: 'getRestaurantMenu', restaurantId })
      setTransferData(result)
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la carta.') }
    finally { setBusy(false) }
  }

  async function signOut() {
    setSignOutError('')
    const failure = await signOutLocally()
    if (failure) { setSignOutError(failure); return }
    navigate('/login', { replace: true })
  }

  return <main className="owner-page page-width admin-page"><div className="owner-heading"><div><div className="simple-kicker">ALCARTE · ADMINISTRACIÓN</div><h1>Centro de control.</h1></div><div className="admin-header-actions"><Link className="button button--outline" to="/panel">Ir a mi menú</Link><button className="button button--outline" type="button" onClick={() => void signOut()}>Cerrar sesión</button><small className="signout-scope">Solo en este navegador</small></div></div>{signOutError && <p className="form-error" role="alert">{signOutError}</p>}<p className="editor-hint">Herramientas administrativas locales. Las acciones quedan registradas sin guardar contraseñas ni enlaces.</p>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="owner-notice" role="status">{message}</p>}
    {recoveryUrl && <section className="admin-recovery"><strong>Enlace de un solo uso</strong><p>Se muestra una vez. Cópialo y entrégalo de forma segura.</p><input readOnly value={recoveryUrl} aria-label="Enlace temporal de acceso" /><button className="button button--outline" type="button" onClick={() => void navigator.clipboard.writeText(recoveryUrl)}>Copiar enlace</button><button type="button" className="text-button" onClick={() => setRecoveryUrl('')}>Ocultar enlace</button></section>}
    <details className="admin-create" open><summary>＋ Crear restaurante y acceso</summary><form className="admin-form" onSubmit={(event) => void create(event)}><label>Nombre del restaurante<input required maxLength={120} value={newRestaurant.name} onChange={(event) => setNewRestaurant({ ...newRestaurant, name: event.target.value })} /></label><label>Identificador de URL<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={60} placeholder="mi-restaurante" value={newRestaurant.slug} onChange={(event) => setNewRestaurant({ ...newRestaurant, slug: event.target.value })} /></label><label>Descripción<input maxLength={240} value={newRestaurant.description} onChange={(event) => setNewRestaurant({ ...newRestaurant, description: event.target.value })} /></label><label>Correo del dueño<input type="email" required value={newRestaurant.ownerEmail} onChange={(event) => setNewRestaurant({ ...newRestaurant, ownerEmail: event.target.value })} /></label><label>Límite de productos<input type="number" min="1" max="40" value={newRestaurant.productLimit} onChange={(event) => setNewRestaurant({ ...newRestaurant, productLimit: event.target.value })} /></label><button className="button button--dark" disabled={busy}>{busy ? 'Creando…' : 'Crear y generar acceso'}</button></form></details>
     <section className="admin-restaurants"><div className="owner-section-head"><div><span className="simple-kicker">CUENTAS</span><h2>Restaurantes</h2></div><button type="button" className="text-button" onClick={() => void load()}>Actualizar</button></div>{restaurants.map((restaurant) => <article className="admin-restaurant-card" key={restaurant.id}><div className="admin-restaurant-heading"><div><h3>{restaurant.name}</h3><p>/{restaurant.slug} · límite {restaurant.product_limit} productos</p></div><span className={restaurant.is_active ? 'admin-status active' : 'admin-status'}>{restaurant.is_active ? 'Activo' : 'Desactivado'}</span></div><p className="admin-owner-email">{restaurant.owners.map((owner) => owner.email ?? 'Cuenta sin correo').join(', ') || 'Sin dueño asignado'}</p><div className="admin-card-actions"><button type="button" className="button button--outline" disabled={busy} onClick={() => void update(restaurant)}>{restaurant.is_active ? 'Desactivar' : 'Reactivar'}</button><button type="button" className="button button--outline" disabled={busy} onClick={() => void openTransfer(restaurant.id)}>Importar / exportar / respaldar</button>{restaurant.owners.map((owner) => <button key={owner.id} type="button" className="text-button" disabled={busy} onClick={() => void recover(restaurant, owner.id)}>Generar recuperación</button>)}</div>{!restaurant.owners.length && <div className="admin-assign-row"><input type="email" placeholder="Correo de cuenta existente" value={assignments[restaurant.id] ?? ''} onChange={(event) => setAssignments({ ...assignments, [restaurant.id]: event.target.value })} /><button type="button" className="button button--outline" disabled={busy || !assignments[restaurant.id]} onClick={() => void assign(restaurant)}>Asignar acceso</button></div>}</article>)}</section>
     {transferData && <section className="admin-transfer-area"><button className="text-button" type="button" onClick={() => setTransferData(null)}>Cerrar herramientas</button><MenuTransferPanel restaurant={transferData.restaurant} categories={transferData.categories} products={transferData.products} onImported={async () => { await load(); await openTransfer(transferData.restaurant.id) }} /></section>}
  </main>
}

function PublicMenuPage() {
  const { slug } = useParams()
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!themeColor) return
    const previousColor = themeColor.content
    if (restaurant) {
      const colors: Record<MenuTheme, string> = {
        minimal: '#FFFFFF',
        classic: '#F5EDDF',
        night: '#191D1A',
      }
      themeColor.content = colors[restaurant.menu_theme] ?? colors.minimal
    }
    return () => { themeColor.content = previousColor }
  }, [restaurant])

  useEffect(() => {
    let active = true
    async function loadMenu() {
      setLoading(true)
      setError('')
      if (!publicSupabase || !slug) {
        setLoading(false)
        return
      }
      const { data: restaurantData, error: restaurantError } = await publicSupabase
        .from('restaurants').select('id,slug,name,description,is_active,menu_theme,menu_accent_color,menu_logo_path,menu_cover_path').eq('slug', slug).maybeSingle()
      if (restaurantError || !restaurantData) {
        if (active) {
          setError(restaurantError ? 'No se pudo cargar el menú. Intenta recargar.' : 'Este menú no está disponible.')
          setLoading(false)
        }
        return
      }
      const currentRestaurant = restaurantData as unknown as Restaurant
      const [{ data: categoryData, error: categoryError }, initialProducts] = await Promise.all([
        publicSupabase.from('categories').select('id,restaurant_id,name,sort_order,is_visible').eq('restaurant_id', currentRestaurant.id).order('sort_order'),
        publicSupabase.from('products').select('id,restaurant_id,category_id,name,description,price_cents,status,sort_order,image_path').eq('restaurant_id', currentRestaurant.id).order('sort_order').order('id'),
      ])
      // Keep menus readable on projects that have not applied the optional photo migration yet.
      const { data: productData, error: productError } = initialProducts.error?.code === '42703'
        ? await publicSupabase.from('products').select('id,restaurant_id,category_id,name,description,price_cents,status,sort_order').eq('restaurant_id', currentRestaurant.id).order('sort_order').order('id')
        : initialProducts
      if (!active) return
      if (categoryError || productError) {
        setError('No se pudo cargar el menú. Intenta recargar.')
      } else {
        setRestaurant(currentRestaurant)
        setCategories((categoryData ?? []) as unknown as Category[])
        setProducts((productData ?? []) as unknown as Product[])
      }
      setLoading(false)
    }
    void loadMenu()
    return () => { active = false }
  }, [slug])

  if (!isSupabaseConfigured) {
    return <main className="simple-page page-width"><div className="simple-kicker">CARTA DIGITAL</div><h1>Menú en preparación.</h1><StatusNotice title="Falta conectar la base de datos">No hay una carta publicada en esta instalación.</StatusNotice></main>
  }

  return (
    <main className={`public-menu menu-theme--${restaurant?.menu_theme ?? 'minimal'}`} style={menuStyle(restaurant)}>
      {loading ? <p className="menu-state" role="status">Cargando menú…</p> : error ? <StatusNotice title="Menú no disponible">{error}</StatusNotice> : restaurant && <>
        <MenuView restaurant={restaurant} categories={categories} products={products} />
        <div className="menu-credit">Menú digital · alcarte</div>
      </>}
    </main>
  )
}

function menuStyle(restaurant: Pick<Restaurant, 'menu_accent_color'> | null): React.CSSProperties {
  const accent = normalizeHexColor(restaurant?.menu_accent_color ?? '') ?? '#284D3B'
  return { '--menu-accent': accent, '--menu-accent-ink': readableTextOn(accent) } as React.CSSProperties
}

function MenuHeading({ restaurant }: { restaurant: Pick<Restaurant, 'name' | 'description' | 'menu_logo_path' | 'menu_cover_path'> }) {
  const logoUrl = restaurant.menu_logo_path && publicSupabase ? publicSupabase.storage.from('menu-images').getPublicUrl(restaurant.menu_logo_path).data.publicUrl : null
  const coverUrl = restaurant.menu_cover_path && publicSupabase ? publicSupabase.storage.from('menu-images').getPublicUrl(restaurant.menu_cover_path).data.publicUrl : null
  return <>{coverUrl && <div className="menu-cover"><img src={coverUrl} alt={`Portada de ${restaurant.name}`} /></div>}<header className={`public-menu-head${logoUrl ? ' has-logo' : ''}`}>
    {logoUrl && <img className="menu-logo" src={logoUrl} alt={`Logotipo de ${restaurant.name}`} loading="lazy" width="52" height="52" />}
    <h1>{restaurant.name}</h1>{restaurant.description && <p>{restaurant.description}</p>}
  </header></>
}

function MenuView({ restaurant, categories, products }: { restaurant: Pick<Restaurant, 'name' | 'description' | 'menu_theme' | 'menu_accent_color' | 'menu_logo_path' | 'menu_cover_path'>; categories: Category[]; products: Product[] }) {
  const usable = categories.filter((category) => category.is_visible && products.some((product) => product.category_id === category.id && product.status !== 'hidden'))
  const [active, setActive] = useState(0)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const start = useRef<{ x: number; y: number; target: EventTarget | null } | null>(null)
  const [detail, setDetail] = useState<Product | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  useEffect(() => { setActive(0) }, [categories])
  useEffect(() => {
    if (!detail) return
    const previous = document.activeElement as HTMLElement
    returnFocus.current = previous
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setDetail(null) }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); returnFocus.current?.focus() }
  }, [detail])
  const select = (index: number) => {
    const next = Math.max(0, Math.min(usable.length - 1, index))
    setActive(next)
    requestAnimationFrame(() => document.querySelector('.menu-view')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
    requestAnimationFrame(() => tabRefs.current[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }))
  }
  const activeCategory = usable[active]
  const visibleProducts = activeCategory ? products.filter((product) => product.category_id === activeCategory.id && product.status !== 'hidden') : []
  const themedRestaurant = { ...restaurant, menu_logo_path: restaurant.menu_logo_path }
  return <div className={`menu-view menu-view--${restaurant.menu_theme}`} onTouchStart={(event) => { start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, target: event.target } }} onTouchEnd={(event) => {
    const origin = start.current; start.current = null
    if (!origin || origin.x < 20 || origin.x > window.innerWidth - 20 || usable.length < 2 || (origin.target as Element | null)?.closest('.category-tabs, .product-detail')) return
    const dx = event.changedTouches[0].clientX - origin.x, dy = event.changedTouches[0].clientY - origin.y
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) select(active + (dx < 0 ? 1 : -1))
  }}>
    <MenuHeading restaurant={themedRestaurant} />
    {usable.length > 1 && <div className="category-tabs" role="tablist" aria-label="Categorías del menú">{usable.map((category, index) => <button ref={(node) => { tabRefs.current[index] = node }} role="tab" aria-selected={active === index} aria-controls={`menu-panel-${category.id}`} id={`menu-tab-${category.id}`} tabIndex={active === index ? 0 : -1} key={category.id} onClick={() => select(index)} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + usable.length) % usable.length; select(next); tabRefs.current[next]?.focus() } }}>{category.name}</button>)}</div>}
    {activeCategory ? <section className="menu-active-category" role={usable.length > 1 ? 'tabpanel' : undefined} id={`menu-panel-${activeCategory.id}`} aria-labelledby={usable.length > 1 ? `menu-tab-${activeCategory.id}` : undefined} key={activeCategory.id}><h2>{activeCategory.name}</h2><div className={`menu-product-list menu-product-list--${restaurant.menu_theme}${restaurant.menu_theme === 'night' && visibleProducts.some((product) => product.image_path) ? ' has-photos' : ''}`}>{visibleProducts.map((product) => <MenuProduct key={product.id} product={product} theme={restaurant.menu_theme} onDetail={(element) => { returnFocus.current = element; setDetail(product) }} />)}</div></section> : <p className="menu-empty">No hay productos disponibles.</p>}
    {detail && <div className="product-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null) }}><section className={`product-detail product-detail--${restaurant.menu_theme}`} role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="detail-close" onClick={() => setDetail(null)} aria-label="Cerrar detalle">Cerrar</button>{detail.image_path && <ProductImage path={detail.image_path} alt={detail.name} /> }<h2 id="detail-title">{detail.name}</h2><strong>{formatMXN(detail.price_cents)}</strong><p>{detail.description}</p><span>{detail.status === 'sold_out' ? 'Agotado' : 'Disponible'}</span></section></div>}
  </div>
}

function ProductImage({ path, alt }: { path: string; alt: string }) {
  const url = path.startsWith('demo/') ? `/${path.slice(5)}` : publicSupabase?.storage.from('menu-images').getPublicUrl(path).data.publicUrl
  return url ? <img className="menu-product-image" src={url} alt={alt} loading="lazy" /> : null
}

async function removeUnusedProductImages(paths: string[]): Promise<boolean> {
  if (!supabase || !paths.length) return true
  const uniquePaths = [...new Set(paths)]
  const { data: referenced, error: lookupError } = await supabase.from('products').select('image_path').in('image_path', uniquePaths)
  if (lookupError) return false
  const stillUsed = new Set((referenced ?? []).map((row) => row.image_path as string))
  const unused = uniquePaths.filter((path) => !stillUsed.has(path))
  if (!unused.length) return true
  const { error } = await supabase.storage.from('menu-images').remove(unused)
  return !error
}

function MenuProduct({ product, theme, onDetail }: { product: Product; theme: MenuTheme; onDetail: (element: HTMLElement) => void }) {
  const hasDetail = Boolean(product.description || product.image_path)
  const openTextDetail = theme === 'night' ? Boolean(product.description && !product.image_path) : theme === 'minimal' ? hasDetail : false
  const name = openTextDetail
    ? <button className="product-detail-trigger" onClick={(event) => onDetail(event.currentTarget)}><h3>{product.name}</h3></button>
    : <h3>{product.name}</h3>
  const photo = product.image_path && <button className="product-photo-button" aria-label={`Ver foto y detalles de ${product.name}`} onClick={(event) => onDetail(event.currentTarget)}><ProductImage path={product.image_path} alt={product.name} /></button>
  if (theme === 'classic') return <article className={`menu-product menu-product--classic${product.status === 'sold_out' ? ' is-sold-out' : ''}${product.image_path ? ' has-photo' : ''}`}>
    {photo}<div className="menu-product-copy"><div className="classic-product-heading">{name}<strong className="menu-product-price">{formatMXN(product.price_cents)}</strong></div>{product.description && <p>{product.description}</p>}{product.status === 'sold_out' && <span className="sold-out">Agotado</span>}</div>
  </article>
  if (theme === 'night') return <article className={`menu-product menu-product--visual${product.image_path ? ' has-photo' : ' no-photo'}${product.status === 'sold_out' ? ' is-sold-out' : ''}`}>
    {photo}<div className="menu-product-copy"><div className="visual-product-heading">{name}<strong className="menu-product-price">{formatMXN(product.price_cents)}</strong></div>{product.status === 'sold_out' && <span className="sold-out">Agotado</span>}</div>
  </article>
  return <article className={`menu-product menu-product--essential${product.status === 'sold_out' ? ' is-sold-out' : ''}${product.image_path ? ' has-photo' : ''}`}>
    {photo}<div className="menu-product-copy">{name}{product.description && <p>{product.description}</p>}{product.status === 'sold_out' && <span className="sold-out">Agotado</span>}</div><strong className="menu-product-price">{formatMXN(product.price_cents)}</strong>
  </article>
}

function ProtectedArea({ area }: { area: 'panel' | 'administración' }) {
  const { session, phase: authPhase, ready, checkingError, retrySessionCheck, signOutLocally } = useAuth()
  const navigate = useNavigate()
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [ownerLoadedFor, setOwnerLoadedFor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adminCheck, setAdminCheck] = useState<{ userId: string | null; phase: 'checking' | 'verified' | 'error'; message: string }>({ userId: null, phase: 'checking', message: '' })
  const [retry, setRetry] = useState(0)
  const [signOutError, setSignOutError] = useState('')
  const userId = session?.user.id

  useEffect(() => {
    let active = true
    async function loadOwnerMenu() {
      if (!ready || !userId || !supabase) {
        setLoading(false)
        return
      }
      if (area === 'administración') {
        setAdminCheck({ userId, phase: 'checking', message: '' })
        try {
          const { data, error: roleError } = await supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle()
          if (!active) return
          if (roleError) {
            setAdminCheck({ userId, phase: 'error', message: 'No pudimos comprobar tus permisos. Tu sesión sigue activa.' })
          } else if (!data) {
            navigate('/panel', { replace: true })
          } else {
            setAdminCheck({ userId, phase: 'verified', message: '' })
          }
        } catch {
          if (active) setAdminCheck({ userId, phase: 'error', message: 'No pudimos comprobar tus permisos. Tu sesión sigue activa.' })
        }
        return
      }
      setLoading(true)
      setOwnerLoadedFor(null)
      setRestaurant(null)
      setError('')
      const { data: membershipData, error: membershipError } = await supabase
        .from('restaurant_members').select('restaurant_id').limit(2)
      if (membershipError) {
        if (active) { setError('No se pudo verificar el acceso al restaurante.'); setOwnerLoadedFor(userId); setLoading(false) }
        return
      }
      const memberships = membershipData ?? []
      if (memberships.length !== 1) {
        if (active) { setError(memberships.length ? 'Esta cuenta tiene más de un restaurante asignado. Contacta al administrador.' : 'Esta cuenta no tiene un restaurante asignado. Contacta al administrador.'); setOwnerLoadedFor(userId); setLoading(false) }
        return
      }
      const restaurantId = (memberships[0] as { restaurant_id: string }).restaurant_id
      const { data: restaurantData, error: restaurantError } = await supabase
        .from('restaurants').select('id,slug,name,description,is_active,menu_theme,menu_accent_color,menu_logo_path,menu_cover_path').eq('id', restaurantId).maybeSingle()
      const { error: productError } = await Promise.all([
        supabase.from('products').select('id').eq('restaurant_id', restaurantId).limit(1),
        supabase.from('categories').select('id').eq('restaurant_id', restaurantId).limit(1),
      ]).then(([productsResult, categoriesResult]) => ({ error: productsResult.error ?? categoriesResult.error }))
      if (!active) return
      if (restaurantError || productError) setError('No se pudo cargar la carta. Intenta recargar.')
      else if (!restaurantData) setError('El restaurante está desactivado o ya no está disponible.')
      else {
        setRestaurant(restaurantData as unknown as Restaurant)
      }
      setOwnerLoadedFor(userId)
      setLoading(false)
    }
    void loadOwnerMenu()
    return () => { active = false }
  }, [area, ready, userId, navigate, retry])

  async function signOut() {
    setSignOutError('')
    const failure = await signOutLocally()
    if (failure) { setSignOutError(failure); return }
    navigate('/login', { replace: true })
  }

  const routeDecision = privateRouteDecision(checkingError ? 'error' : authPhase)
  if (routeDecision === 'wait' || !ready) return <main className="simple-page page-width"><p role="status">{checkingError || 'Verificando sesión…'}</p>{checkingError && <button className="button button--outline" type="button" onClick={() => void retrySessionCheck()}>Volver a comprobar</button>}</main>
  if (routeDecision === 'login' || !session) return <Navigate to="/login" replace />
  if (area !== 'panel') {
    if (adminCheck.userId !== userId || adminCheck.phase === 'checking') return <main className="simple-page page-width"><p role="status">Verificando permisos…</p></main>
    if (adminCheck.phase === 'error') return <main className="simple-page page-width"><StatusNotice title="No pudimos verificar el acceso">{adminCheck.message}</StatusNotice><button className="button button--outline" type="button" onClick={() => setRetry((value) => value + 1)}>Reintentar</button><button className="button button--outline" type="button" onClick={() => void signOut()}>Cerrar sesión</button>{signOutError && <p className="form-error" role="alert">{signOutError}</p>}</main>
    return <AdminDashboard key={userId} />
  }

  return (
    <main className="owner-page page-width">
      <div className="owner-heading"><div><div className="simple-kicker">PANEL DEL RESTAURANTE</div><h1>{restaurant?.name ?? 'Tu menú'}</h1>{restaurant && <Link className="owner-public-link" to={`/m/${restaurant.slug}`} target="_blank" rel="noreferrer">Ver menú ↗</Link>}</div><div className="owner-session-actions"><button className="button button--outline" type="button" onClick={() => void signOut()}>Cerrar sesión</button><small className="signout-scope">Solo en este navegador</small></div></div>
      {signOutError && <p className="form-error" role="alert">{signOutError}</p>}
      {!isSupabaseConfigured ? <StatusNotice title="Falta configurar Supabase">Agrega las variables locales para iniciar.</StatusNotice> : ownerLoadedFor !== userId || loading ? <p role="status">Cargando tu carta…</p> : error ? <><StatusNotice title="No pudimos cargar tu menú">{error}</StatusNotice><button type="button" className="button button--outline" onClick={() => setRetry((value) => value + 1)}>Reintentar</button></> : restaurant && <OwnerMenuManagement key={`${userId}:${restaurant.id}`} restaurant={restaurant} onRestaurantUpdated={(patch) => setRestaurant((current) => current ? { ...current, ...patch } : current)} />}
    </main>
  )
}

function OwnerMenuManagement({ restaurant, onRestaurantUpdated }: { restaurant: Restaurant; onRestaurantUpdated: (patch: Partial<Restaurant>) => void }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null)
  const [section, setSection] = useState<'menu' | 'restaurant' | 'appearance'>('menu')

  async function reload() {
    if (!supabase) return
    const [{ data: categoryData, error: categoryError }, productsWithImages] = await Promise.all([
      supabase.from('categories').select('id,restaurant_id,name,sort_order,is_visible').eq('restaurant_id', restaurant.id).order('sort_order').order('id'),
      supabase.from('products').select('id,restaurant_id,category_id,name,description,price_cents,status,sort_order,image_path').eq('restaurant_id', restaurant.id).order('sort_order').order('id'),
    ])
    const { data: productData, error: productError } = productsWithImages.error?.code === '42703'
      ? await supabase.from('products').select('id,restaurant_id,category_id,name,description,price_cents,status,sort_order').eq('restaurant_id', restaurant.id).order('sort_order').order('id')
      : productsWithImages
    if (categoryError || productError) throw new Error('No se pudo cargar la carta. Intenta recargar.')
    setCategories((categoryData ?? []) as unknown as Category[])
    setProducts((productData ?? []) as unknown as Product[])
    setOpenCategoryId((current) => current ?? (categoryData?.[0]?.id as string | undefined) ?? null)
  }

  useEffect(() => {
    let active = true
    void reload().then(() => { if (active) setLoading(false) }).catch((loadError: unknown) => {
      if (active) { setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la carta.'); setLoading(false) }
    })
    return () => { active = false }
  }, [restaurant.id])

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setCategoryBusy(true); setNotice('')
    const { error: insertError } = await supabase.from('categories').insert({ restaurant_id: restaurant.id, name: categoryName.trim(), sort_order: categories.length })
    setCategoryBusy(false)
    if (insertError) { setNotice('No se guardó la categoría. Revisa el nombre e intenta de nuevo.'); return }
    setCategoryName('')
    setNotice('Categoría creada.')
    await reload()
    setAddingCategory(false)
  }

  async function reorderCategory(index: number, direction: -1 | 1) {
    const otherIndex = index + direction
    if (otherIndex < 0 || otherIndex >= categories.length || !supabase) return
    const first = categories[index]; const second = categories[otherIndex]
    // The schema intentionally permits ties; swapping these two values is safe.
    const updates = await Promise.all([
      supabase.from('categories').update({ sort_order: second.sort_order }).eq('id', first.id),
      supabase.from('categories').update({ sort_order: first.sort_order }).eq('id', second.id),
    ])
    if (updates.some((result) => result.error)) setNotice('No se pudo cambiar el orden. Intenta de nuevo.')
    await reload()
  }

  async function deleteCategory(category: Category) {
    if (!supabase || categoryBusy) return
    const categoryProducts = products.filter((product) => product.category_id === category.id)
    const productText = categoryProducts.length === 1 ? '1 producto' : `${categoryProducts.length} productos`
    if (!window.confirm(`¿Eliminar la categoría “${category.name}” y sus ${productText}? Esta acción no se puede deshacer.`)) return
    setCategoryBusy(true)
    setNotice('')
    let deleted = false
    try {
      const { data, error: deleteError } = await supabase.from('categories').delete()
        .eq('id', category.id).eq('restaurant_id', restaurant.id).select('id')
      if (deleteError) throw new Error('No se pudo eliminar la categoría. Comprueba tu acceso e inténtalo de nuevo.')
      if (!data?.length) throw new Error('La categoría ya no existe o no tienes permiso para eliminarla.')
      deleted = true

      const imagePaths = categoryProducts.flatMap((product) => product.image_path ? [product.image_path] : [])
      let cleanupWarning = false
      if (imagePaths.length) {
        cleanupWarning = !(await removeUnusedProductImages(imagePaths))
      }
      setOpenCategoryId((current) => current === category.id ? null : current)
      try {
        await reload()
      } catch {
        setNotice('La categoría se eliminó, pero no se pudo actualizar la lista. Recarga el panel.')
        return
      }
      setNotice(`Categoría “${category.name}” y sus productos eliminados.${cleanupWarning ? ' No se pudieron limpiar todas sus fotos.' : ''}`)
    } catch (deleteError) {
      setNotice(deleted
        ? 'La categoría se eliminó, pero algo falló al completar la limpieza. Recarga el panel.'
        : deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar la categoría.')
    } finally {
      setCategoryBusy(false)
    }
  }

  const productCount = products.length
  const productsByCategory = useMemo(() => new Map(categories.map((category) => [
    category.id,
    products.filter((product) => product.category_id === category.id).sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
  ])), [categories, products])
  if (loading) return <p role="status">Cargando tu carta…</p>
  if (error) return <StatusNotice title="No pudimos cargar tu menú">{error}</StatusNotice>

  return <>
    <nav className="owner-tabs" aria-label="Secciones del restaurante">
      {([['menu', 'Mi menú'], ['restaurant', 'Mi restaurante'], ['appearance', 'Apariencia']] as const).map(([key, label]) => <button key={key} type="button" aria-current={section === key ? 'page' : undefined} onClick={() => setSection(key)}>{label}</button>)}
    </nav>
      <p className="editor-hint owner-publish-hint">Los cambios de cada sección aparecen en el menú público después de guardarlos.</p>
    {notice && <p className="owner-notice" role="status">{notice}</p>}
    {section === 'menu' && <section aria-labelledby="owner-menu-title">
      <div className="owner-section-head"><div><span className="simple-kicker">ADMINISTRA TU CARTA</span><h2 id="owner-menu-title">Mi menú</h2></div><span className="product-count">{productCount} / 40 productos</span></div>
      <p className="editor-hint">Cada producto pertenece a una categoría. Crea una categoría y después agrega ahí tus productos; puedes cambiar su precio o disponibilidad y guardar los cambios cuando termines.</p>
      <button className="add-category-trigger" type="button" onClick={() => setAddingCategory((current) => !current)}><span aria-hidden="true">＋</span> Agregar categoría</button>
      {addingCategory && <form className="category-create" onSubmit={(event) => void createCategory(event)}>
        <label htmlFor="new-category">Nombre de la categoría</label><input id="new-category" maxLength={80} required value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Ej. Bebidas" />
        <button className="button button--dark" disabled={categoryBusy || !categoryName.trim()}>{categoryBusy ? 'Guardando…' : 'Guardar categoría'}</button>
      </form>}
      {categories.length === 0 && <p className="editor-hint">Aún no hay categorías ni productos. Agrega una categoría, por ejemplo “Bebidas” o “Entradas”, para empezar.</p>}
      <div className="category-list">{categories.map((category, categoryIndex) => <CategoryEditor key={category.id} category={category} index={categoryIndex} categoryCount={categories.length} products={productsByCategory.get(category.id) ?? []} totalProductCount={productCount} isOpen={openCategoryId === category.id} deleting={categoryBusy} onToggle={() => setOpenCategoryId((current) => current === category.id ? null : category.id)} onMoveCategory={reorderCategory} onDelete={() => void deleteCategory(category)} onSaved={reload} />)}</div>
    </section>}
    {section === 'restaurant' && <section aria-labelledby="owner-restaurant-title"><div className="owner-section-head"><div><span className="simple-kicker">DATOS E IMÁGENES</span><h2 id="owner-restaurant-title">Mi restaurante</h2></div></div><RestaurantProfileEditor restaurant={restaurant} onSaved={(patch) => onRestaurantUpdated(patch)} /><MenuImageEditor restaurant={restaurant} onSaved={(patch) => onRestaurantUpdated(patch)} /><PasswordChangeForm /></section>}
    {section === 'appearance' && <section aria-labelledby="owner-appearance-title"><div className="owner-section-head"><div><span className="simple-kicker">PRESENTACIÓN</span><h2 id="owner-appearance-title">Apariencia</h2></div></div><MenuAppearanceEditor restaurant={restaurant} categories={categories} products={products} /></section>}
  </>
}

function downloadText(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function MenuTransferPanel({ restaurant, categories, products, onImported }: { restaurant: Restaurant; categories: Category[]; products: Product[]; onImported: () => Promise<void> }) {
  const [rows, setRows] = useState<MenuCsvRow[]>([])
  const [issues, setIssues] = useState<Array<{ row: number; message: string }>>([])
  const [duplicates, setDuplicates] = useState<string[]>([])
  const [backupToRestore, setBackupToRestore] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const hasPreview = rows.length > 0 || issues.length > 0

  async function readCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    setRows([]); setIssues([]); setDuplicates([]); setError(''); setMessage('')
    if (!file) return
    if (file.size > 1024 * 1024) { setError('El CSV debe pesar 1 MB o menos.'); return }
    try {
      const result = parseMenuCsv(await file.text())
      setRows(result.rows); setIssues(result.issues)
      const warnings = new Set<string>()
      const seenInFile = new Set<string>()
      result.rows.forEach((row) => {
        const incomingKey = `${row.category.toLocaleLowerCase()}\u0000${row.name.toLocaleLowerCase()}`
        if (seenInFile.has(incomingKey)) warnings.add(`Fila ${row.sourceRow}: “${row.name}” aparece más de una vez en el CSV; se agregará cada fila.`)
        seenInFile.add(incomingKey)
        const existingCategory = categories.find((category) => category.name.trim().toLocaleLowerCase() === row.category.toLocaleLowerCase())
        if (existingCategory && products.some((product) => product.category_id === existingCategory.id && product.name.trim().toLocaleLowerCase() === row.name.toLocaleLowerCase())) {
          warnings.add(`Fila ${row.sourceRow}: “${row.name}” ya existe en “${row.category}”. Se agregará de todas formas.`)
        }
      })
      setDuplicates([...warnings])
      if (!result.rows.length && !result.issues.length) setError('El CSV no contiene productos para importar.')
    } catch {
      setError('No se pudo leer el archivo como CSV UTF-8.')
    }
  }

  async function confirmImport() {
    if (!supabase || !rows.length || issues.length) return
    setBusy(true); setError(''); setMessage('')
    const grouped = new Map<string, { name: string; sort_order: number; products: Array<{ name: string; description: string; price_cents: number; status: string; sort_order: number }> }>()
    for (const row of rows) {
      const key = row.category.toLocaleLowerCase()
      const group = grouped.get(key) ?? { name: row.category, sort_order: row.categoryOrder, products: [] }
      group.sort_order = Math.min(group.sort_order, row.categoryOrder)
      group.products.push({ name: row.name, description: row.description, price_cents: row.priceCents, status: row.status, sort_order: row.productOrder })
      grouped.set(key, group)
    }
    const payload = [...grouped.values()].sort((a, b) => a.sort_order - b.sort_order)
    const { data, error: importError } = await supabase.rpc('admin_import_menu', { p_restaurant_id: restaurant.id, p_categories: payload })
    setBusy(false)
    if (importError) { setError('No se importó ningún producto. Revisa el límite y los datos del archivo.'); return }
    await onImported()
    setRows([]); setIssues([]); setDuplicates([])
    setMessage(`Importación completa: ${Number(data)} productos agregados. La carta existente se conservó.`)
  }

  function exportCsv() {
    const rowsForExport = categories.flatMap((category) => products.filter((product) => product.category_id === category.id).map((product) => ({
      category: category.name, name: product.name, description: product.description, priceCents: product.price_cents,
      status: product.status, categoryOrder: category.sort_order, productOrder: product.sort_order, sourceRow: 0,
    })))
    downloadText(`${restaurant.slug}-carta.csv`, serializeMenuCsv(rowsForExport), 'text/csv;charset=utf-8')
  }

  function exportBackup() {
    const backup = {
      format: 'alcarte-menu-backup', version: 1, created_at: new Date().toISOString(),
      restaurant: { slug: restaurant.slug, name: restaurant.name, description: restaurant.description, menu_theme: restaurant.menu_theme, menu_accent_color: restaurant.menu_accent_color },
      categories: categories.map((category) => ({ name: category.name, sort_order: category.sort_order, is_visible: category.is_visible,
        products: products.filter((product) => product.category_id === category.id).map(({ id, name, description, price_cents, status, sort_order, image_path }) => ({ id, name, description, price_cents, status, sort_order, image_path: image_path ?? null })) })),
      images_note: 'Las referencias de fotos de producto se conservan al restaurar en este mismo restaurante y proyecto. Los archivos de portada y logo no se incluyen.',
    }
    downloadText(`${restaurant.slug}-respaldo.json`, JSON.stringify(backup, null, 2), 'application/json;charset=utf-8')
  }

  async function chooseBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    setBackupToRestore(null); setError(''); setMessage('')
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('El respaldo JSON debe pesar 2 MB o menos.'); return }
    try {
      const value: unknown = JSON.parse(await file.text())
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape')
      const backup = value as Record<string, unknown>
      if (backup.format !== 'alcarte-menu-backup' || backup.version !== 1 || !backup.restaurant || typeof backup.restaurant !== 'object' || !Array.isArray(backup.categories)) throw new Error('format')
      setBackupToRestore(backup)
    } catch {
      setError('No se reconoce el archivo. Selecciona un respaldo JSON de Alcarte válido.')
    }
  }

  async function restoreBackup() {
    if (!supabase || !backupToRestore) return
    const categoryCount = (backupToRestore.categories as unknown[]).length
    if (!window.confirm(`Esto reemplazará la carta y apariencia actuales de ${restaurant.name} con ${categoryCount} categorías del respaldo. Las fotos de producto solo pueden vincularse si el respaldo corresponde a este mismo restaurante y proyecto. Esta acción no se puede deshacer. ¿Continuar?`)) return
    setBusy(true); setError(''); setMessage('')
    const { data, error: restoreError } = await supabase.rpc('admin_restore_menu_backup', { p_restaurant_id: restaurant.id, p_backup: backupToRestore })
    setBusy(false)
    if (restoreError) { setError('No se restauró el respaldo. La carta actual permanece intacta. Revisa el formato y el límite de productos.'); return }
    setBackupToRestore(null)
    setMessage(`Respaldo restaurado: ${Number(data)} productos. Actualizando la carta…`)
    await onImported()
    setMessage(`Respaldo restaurado: ${Number(data)} productos.`)
  }

  return <section className="menu-transfer-panel">
    <span className="simple-kicker">IMPORTAR Y RESPALDAR</span><h2>Importación y respaldo</h2>
    <p>Importa CSV como nuevas categorías y productos. No reemplaza ni borra tu carta actual.</p>
    <a className="text-button" href={`data:text/csv;charset=utf-8,${encodeURIComponent('categoria,nombre,descripcion,precio_mxn,estado,orden_categoria,orden_producto\nBebidas,Agua natural,Agua de mesa,25.00,disponible,0,0')}`} download="plantilla-alcarte.csv">Descargar plantilla CSV</a>
    <label className="image-file-button">Elegir CSV para previsualizar<input type="file" accept=".csv,text/csv" onChange={(event) => void readCsv(event)} /></label>
    {hasPreview && <div className="transfer-preview" aria-live="polite">
      <strong>Vista previa: {rows.length} filas válidas, {issues.length} errores</strong>
      {issues.slice(0, 12).map((issue, index) => <p className="form-error" key={`${issue.row}-${index}`}>Fila {issue.row}: {issue.message}</p>)}
      {issues.length > 12 && <p>Hay {issues.length - 12} errores adicionales.</p>}
      {duplicates.map((warning) => <p className="transfer-warning" key={warning}>{warning}</p>)}
      <ul>{rows.slice(0, 5).map((row) => <li key={`${row.sourceRow}-${row.name}`}>{row.category} · {row.name} · {formatMXN(row.priceCents)}</li>)}</ul>
      <button className="button button--dark" type="button" disabled={busy || !rows.length || issues.length > 0} onClick={() => void confirmImport()}>{busy ? 'Importando…' : `Confirmar e importar ${rows.length} productos`}</button>
    </div>}
    <div className="transfer-export-actions"><button className="button button--outline" type="button" onClick={exportCsv}>Exportar CSV</button><button className="button button--outline" type="button" onClick={exportBackup}>Descargar respaldo JSON</button></div>
    <label className="image-file-button">Seleccionar respaldo JSON<input type="file" accept=".json,application/json" onChange={(event) => void chooseBackup(event)} /></label>
    {backupToRestore && <div className="transfer-preview"><strong>Respaldo válido · {(backupToRestore.categories as unknown[]).length} categorías</strong><p>La restauración reemplazará la carta y la apariencia de este restaurante. Las fotos de producto se vinculan si sus archivos siguen en este proyecto.</p><button className="button button--dark" type="button" disabled={busy} onClick={() => void restoreBackup()}>{busy ? 'Restaurando…' : 'Restaurar respaldo…'}</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="owner-notice" role="status">{message}</p>}
    <p className="transfer-note">El respaldo incluye datos y referencias de fotos de producto, pero no contiene archivos de imagen, portada, logo ni contraseñas. Restaura fotos solo en el mismo restaurante y proyecto; guarda el archivo en un lugar seguro.</p>
  </section>
}

function MenuAppearanceEditor({ restaurant, categories, products }: { restaurant: Restaurant; categories: Category[]; products: Product[] }) {
  const [theme, setTheme] = useState<MenuTheme>(restaurant.menu_theme ?? 'minimal')
  const [accentColor, setAccentColor] = useState(normalizeHexColor(restaurant.menu_accent_color ?? '') ?? '#284D3B')
  const [savedAppearance, setSavedAppearance] = useState({ theme: restaurant.menu_theme, color: normalizeHexColor(restaurant.menu_accent_color ?? '') ?? '#284D3B' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const dirty = theme !== savedAppearance.theme || accentColor !== savedAppearance.color
  useUnsavedChangesWarning(dirty)
  const readableRatio = menuContrastRatio(accentColor)

  useEffect(() => {
    setTheme(restaurant.menu_theme ?? 'minimal')
    setAccentColor(normalizeHexColor(restaurant.menu_accent_color ?? '') ?? '#284D3B')
    setSavedAppearance({ theme: restaurant.menu_theme, color: normalizeHexColor(restaurant.menu_accent_color ?? '') ?? '#284D3B' })
  }, [restaurant.menu_theme, restaurant.menu_accent_color])

  async function saveAppearance() {
    if (!supabase || busy) return
    const normalizedColor = normalizeHexColor(accentColor)
    if (!normalizedColor || !MENU_THEMES.includes(theme)) {
      setError('Elige un color hexadecimal y una plantilla válidos.')
      return
    }
    setBusy(true); setMessage(''); setError('')
    const { error: saveError } = await supabase.rpc('update_owner_menu_appearance', { p_theme: theme, p_accent_color: normalizedColor })
    setBusy(false)
    if (saveError) {
      setError('No se guardó la apariencia. Comprueba la conexión e inténtalo de nuevo.')
      return
    }
    setSavedAppearance({ theme, color: normalizedColor })
    setMessage('Cambios guardados. Tu enlace y productos no cambian.')
  }

  return <section className="appearance-editor">
    <div className="appearance-heading"><div><span className="simple-kicker">DISEÑO DEL MENÚ</span><h2>Elige cómo se ve</h2><p>La vista previa muestra la plantilla y el color elegidos. Los cambios se publican al seleccionar “Guardar cambios”.</p></div></div>
    <div className="theme-options" role="radiogroup" aria-label="Estilo de menú">
      {MENU_THEMES.map((option) => <button key={option} type="button" role="radio" aria-checked={theme === option} className={`theme-option${theme === option ? ' selected' : ''}`} onClick={() => { setTheme(option); setMessage('') }}><span className={`theme-swatch menu-theme--${option}`} aria-hidden="true"><i /><i /><i /><i /></span><strong>{MENU_THEME_LABELS[option].title}</strong><small>{MENU_THEME_LABELS[option].description}</small></button>)}
    </div>
    <div className="accent-color-control"><span>Color de acento</span><div className="accent-presets" aria-label="Colores sugeridos">{['#284D3B', '#A64B32', '#315C83', '#7B5529', '#55446E'].map((color) => <button key={color} type="button" aria-label={`Usar color ${color}`} aria-pressed={accentColor === color} style={{ backgroundColor: color }} onClick={() => { setAccentColor(color); setMessage('') }} />)}</div><details className="accent-custom"><summary>Elegir otro color</summary><div className="accent-color-input"><input aria-label="Seleccionar color de acento" type="color" value={normalizeHexColor(accentColor) ?? '#284D3B'} onChange={(event) => { setAccentColor(event.target.value.toUpperCase()); setMessage('') }} /><input aria-label="Código hexadecimal de color" value={accentColor} maxLength={7} onChange={(event) => { setAccentColor(event.target.value); setMessage('') }} /></div><small>El contraste del texto sobre el color se ajusta automáticamente.</small></details></div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="owner-notice" role="status">{message}</p>}
    <div className="appearance-preview-heading"><span className="simple-kicker">VISTA PREVIA</span><span className="contrast-badge" style={{ backgroundColor: accentColor, color: readableTextOn(accentColor) }}>{readableRatio >= 4.5 ? 'Contraste AA' : 'Revisa el color'}</span></div>
    <MenuPreview restaurant={restaurant} categories={categories} products={products} theme={theme} accentColor={normalizeHexColor(accentColor) ?? '#284D3B'} />
    <button type="button" className="save-category-button appearance-save" disabled={!dirty || busy || !normalizeHexColor(accentColor)} onClick={() => void saveAppearance()}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
  </section>
}

function createWebpPreview(file: File): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('La foto debe pesar 5 MB o menos. Elige otra imagen.'))
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reject(new Error('Usa una imagen JPG, PNG o WebP.'))
      return
    }

    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      reject(new Error('El archivo no se pudo abrir como imagen. Comprueba que no esté dañado.'))
      return
    }
    if (!bitmap.width || !bitmap.height) {
      bitmap.close()
      reject(new Error('La imagen no tiene dimensiones válidas.'))
      return
    }

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
          reject(new Error('No pudimos preparar esta foto en el dispositivo. Prueba con otra imagen.'))
      return
    }

    let scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
    for (let resize = 0; resize < 8; resize += 1) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      for (let quality = 0.84; quality >= 0.42; quality -= 0.07) {
        const blob = await new Promise<Blob | null>((finish) => canvas.toBlob(finish, 'image/webp', quality))
        if (!blob) {
          bitmap.close()
          reject(new Error('No pudimos preparar esta foto. Prueba con otra imagen.'))
          return
        }
        if (blob.type !== 'image/webp') {
          bitmap.close()
          reject(new Error('No se pudo procesar esta foto en el dispositivo. Prueba con otra imagen.'))
          return
        }
        if (blob.size <= 100 * 1024) {
          bitmap.close()
          resolve(blob)
          return
        }
      }
      scale *= 0.82
    }
    bitmap.close()
    reject(new Error('La foto tiene demasiados detalles para procesarse. Prueba con otra imagen.'))
  })
}

function RestaurantProfileEditor({ restaurant, onSaved }: { restaurant: Restaurant; onSaved: (patch: Pick<Restaurant, 'name' | 'description'>) => void }) {
  const [name, setName] = useState(restaurant.name)
  const [description, setDescription] = useState(restaurant.description)
  const [savedProfile, setSavedProfile] = useState({ name: restaurant.name, description: restaurant.description })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const dirty = name.trim() !== savedProfile.name || description.trim() !== savedProfile.description
  useUnsavedChangesWarning(dirty)

  useEffect(() => { setName(restaurant.name); setDescription(restaurant.description); setSavedProfile({ name: restaurant.name, description: restaurant.description }) }, [restaurant.name, restaurant.description])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy || !dirty) return
    setBusy(true); setError(''); setMessage('')
    const { error: saveError } = await supabase.rpc('update_owner_restaurant_profile', { p_name: name.trim(), p_description: description.trim() })
    setBusy(false)
    if (saveError) { setError('No se guardaron los datos. Revisa los campos e inténtalo otra vez.'); return }
    setSavedProfile({ name: name.trim(), description: description.trim() })
    onSaved({ name: name.trim(), description: description.trim() })
    setMessage('Nombre y descripción actualizados en el menú público.')
  }

  return <form className="restaurant-profile-form" onSubmit={(event) => void save(event)}>
    <label>Nombre del restaurante<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>Descripción breve <span>(opcional)</span><textarea maxLength={240} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    <p className="editor-hint">Tu nombre y descripción se muestran en la parte superior del menú.</p>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="owner-notice" role="status">{message}</p>}
    <button className="save-category-button" type="submit" disabled={!dirty || busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
  </form>
}

function MenuImageEditor({ restaurant, onSaved }: { restaurant: Restaurant; onSaved: (patch: Pick<Restaurant, 'menu_logo_path' | 'menu_cover_path'>) => void }) {
  const [logoPath, setLogoPath] = useState(restaurant.menu_logo_path)
  const [coverPath, setCoverPath] = useState(restaurant.menu_cover_path)
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null)
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [removeCover, setRemoveCover] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const objectUrls = useRef<string[]>([])
  const dirty = logoBlob !== null || coverBlob !== null || removeLogo || removeCover
  useUnsavedChangesWarning(dirty)

  useEffect(() => {
    setLogoPath(restaurant.menu_logo_path)
    setCoverPath(restaurant.menu_cover_path)
  }, [restaurant.menu_logo_path, restaurant.menu_cover_path])

  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), [])

  function showPreview(blob: Blob, target: 'logo' | 'cover') {
    const url = URL.createObjectURL(blob)
    objectUrls.current.push(url)
    if (target === 'logo') {
      if (logoPreview) URL.revokeObjectURL(logoPreview)
      setLogoPreview(url)
    } else {
      if (coverPreview) URL.revokeObjectURL(coverPreview)
      setCoverPreview(url)
    }
  }

  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>, target: 'logo' | 'cover') {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setError(''); setMessage('')
    try {
      const blob = await createWebpPreview(file)
      showPreview(blob, target)
      if (target === 'logo') { setLogoBlob(blob); setRemoveLogo(false) }
      else { setCoverBlob(blob); setRemoveCover(false) }
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : 'No se pudo procesar la imagen.')
    }
  }

  function clearPreview(target: 'logo' | 'cover') {
    setError(''); setMessage('')
    if (target === 'logo') {
      if (logoPreview) URL.revokeObjectURL(logoPreview)
      setLogoPreview(null); setLogoBlob(null); setRemoveLogo(Boolean(logoPath))
    } else {
      if (coverPreview) URL.revokeObjectURL(coverPreview)
      setCoverPreview(null); setCoverBlob(null); setRemoveCover(Boolean(coverPath))
    }
  }

  async function uploadImage(blob: Blob, slot: 'logo' | 'cover', currentPath: string | null): Promise<string> {
    if (!supabase) throw new Error('Supabase no está configurado.')
    const currentSlot = currentPath?.match(/-([ab])\.webp$/)?.[1]
    const nextSlot = currentSlot === 'a' ? 'b' : 'a'
    const path = `${restaurant.id}/${slot}-${nextSlot}.webp`
    const bucket = supabase.storage.from('menu-images')
    const { error: staleSlotError } = await bucket.remove([path])
    if (staleSlotError) throw new Error('No se pudo preparar el reemplazo de la imagen. Intenta de nuevo.')
    const { error: uploadError } = await bucket.upload(path, blob, {
      contentType: 'image/webp', upsert: false, cacheControl: '60',
    })
    if (uploadError) throw new Error('No se pudo subir la imagen. Comprueba tu conexión e inténtalo de nuevo.')
    return path
  }

  async function saveImages() {
    if (!supabase || !dirty || busy) return
    setBusy(true); setError(''); setMessage('')
    const uploadedPaths: string[] = []
    try {
      let nextLogoPath = removeLogo ? null : logoPath
      let nextCoverPath = removeCover ? null : coverPath
      if (logoBlob) {
        nextLogoPath = await uploadImage(logoBlob, 'logo', logoPath)
        uploadedPaths.push(nextLogoPath)
      }
      if (coverBlob) {
        nextCoverPath = await uploadImage(coverBlob, 'cover', coverPath)
        uploadedPaths.push(nextCoverPath)
      }
      const { error: metadataError } = await supabase.rpc('update_owner_menu_images', {
        p_logo_path: nextLogoPath, p_cover_path: nextCoverPath,
      })
      if (metadataError) throw new Error('No se pudieron publicar las imágenes. Las referencias anteriores siguen activas.')

      const oldPaths = [
        logoPath && logoPath !== nextLogoPath ? logoPath : null,
        coverPath && coverPath !== nextCoverPath ? coverPath : null,
      ].filter((path): path is string => Boolean(path))
      if (logoPreview) URL.revokeObjectURL(logoPreview)
      if (coverPreview) URL.revokeObjectURL(coverPreview)
      setLogoPath(nextLogoPath); setCoverPath(nextCoverPath)
      onSaved({ menu_logo_path: nextLogoPath, menu_cover_path: nextCoverPath })
      setLogoBlob(null); setCoverBlob(null); setRemoveLogo(false); setRemoveCover(false)
      setLogoPreview(null); setCoverPreview(null)
      setMessage('Imágenes actualizadas.')
      if (oldPaths.length) {
        const { error: deleteError } = await supabase.storage.from('menu-images').remove(oldPaths)
        if (deleteError) setMessage('Imágenes publicadas. No se pudo limpiar una versión anterior; el almacenamiento sigue limitado a dos versiones por imagen.')
      }
    } catch (saveError) {
      if (uploadedPaths.length) await supabase.storage.from('menu-images').remove(uploadedPaths)
      setError(saveError instanceof Error ? saveError.message : 'No se pudieron guardar las imágenes.')
    } finally {
      setBusy(false)
    }
  }

  const storedLogoUrl = logoPath && !removeLogo && publicSupabase ? publicSupabase.storage.from('menu-images').getPublicUrl(logoPath).data.publicUrl : null
  const storedCoverUrl = coverPath && !removeCover && publicSupabase ? publicSupabase.storage.from('menu-images').getPublicUrl(coverPath).data.publicUrl : null

  return <section className="menu-image-editor">
    <div><span className="simple-kicker">IMÁGENES DEL RESTAURANTE</span><h2>Logo y portada</h2><p>El logo aparece junto al nombre y la portada encabeza el menú. Elegir o quitar una foto solo cambia esta vista; los cambios se publican al guardarlos.</p></div>
    <div className="image-upload-grid">
      <ImageUploadCard title="Logo" description="Cuadrado, con fondo transparente si lo necesitas." imageUrl={logoPreview ?? storedLogoUrl} alt={`Logo de ${restaurant.name}`} onFile={(event) => void chooseFile(event, 'logo')} onRemove={() => clearPreview('logo')} />
      <ImageUploadCard title="Foto de portada" description="Una imagen horizontal para encabezar la carta." imageUrl={coverPreview ?? storedCoverUrl} alt={`Foto de ${restaurant.name}`} onFile={(event) => void chooseFile(event, 'cover')} onRemove={() => clearPreview('cover')} />
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="owner-notice" role="status">{message}</p>}
    <button type="button" className="save-category-button appearance-save" disabled={!dirty || busy} onClick={() => void saveImages()}>{busy ? 'Subiendo imágenes…' : 'Guardar cambios'}</button>
  </section>
}

function ImageUploadCard({ title, description, imageUrl, alt, onFile, onRemove }: { title: string; description: string; imageUrl: string | null; alt: string; onFile: (event: React.ChangeEvent<HTMLInputElement>) => void; onRemove: () => void }) {
  return <div className={`image-upload-card image-upload-card--${title === 'Logo' ? 'logo' : 'cover'}`}><strong>{title}</strong><p>{description}</p><div className={`image-upload-preview${imageUrl ? ' has-image' : ''}`}>
    {imageUrl ? <img src={imageUrl} alt={alt} loading="lazy" width="320" height="180" /> : <span>Sin imagen</span>}
  </div><label className="image-file-button">{imageUrl ? 'Cambiar foto' : 'Subir foto'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} /></label>{imageUrl && <button type="button" className="text-button" onClick={onRemove}>Quitar foto</button>}</div>
}

function MenuPreview({ restaurant, categories, products, theme, accentColor }: { restaurant: Restaurant; categories: Category[]; products: Product[]; theme: MenuTheme; accentColor: string }) {
  const previewRestaurant = { ...restaurant, menu_theme: theme, menu_accent_color: accentColor }
  return <div className={`menu-preview public-menu menu-theme--${theme}`} style={menuStyle(previewRestaurant)}><MenuView restaurant={previewRestaurant} categories={categories} products={products} /><div className="menu-credit">Menú digital · alcarte</div></div>
}

function CategoryEditor({ category, index, categoryCount, products, totalProductCount, isOpen, deleting, onToggle, onMoveCategory, onDelete, onSaved }: { category: Category; index: number; categoryCount: number; products: Product[]; totalProductCount: number; isOpen: boolean; deleting: boolean; onToggle: () => void; onMoveCategory: (index: number, direction: -1 | 1) => Promise<void>; onDelete: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(category.name)
  const [visible, setVisible] = useState(category.is_visible)
  const [drafts, setDrafts] = useState<ProductDraft[]>([])
  const [addingProduct, setAddingProduct] = useState(false)
  const [editingProductKey, setEditingProductKey] = useState<string | null>(null)
  const [newProductPhoto, setNewProductPhoto] = useState<Blob | null>(null)
  const [newProductPhotoPreview, setNewProductPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const dragKey = useRef<string | null>(null)
  const hoverKey = useRef<string | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)

  useEffect(() => {
    setName(category.name)
    setVisible(category.is_visible)
    setDrafts(products.map((product) => ({ draftKey: product.id, id: product.id, name: product.name, description: product.description, price: (product.price_cents / 100).toFixed(2), status: product.status, imagePath: product.image_path ?? null })))
  }, [category, products])

  const dirty = name.trim() !== category.name || visible !== category.is_visible || drafts.length !== products.length || drafts.some((draft, position) => {
    const original = products[position]
    return !draft.id || !original || draft.id !== original.id || draft.name !== original.name || draft.description !== original.description || draft.price !== (original.price_cents / 100).toFixed(2) || draft.status !== original.status || Boolean(draft.photoBlob) || Boolean(draft.removeImage)
  })
  useUnsavedChangesWarning(dirty)

  function updateDraft(key: string, patch: Partial<ProductDraft>) {
    setMessage('')
    setDrafts((current) => current.map((draft) => draft.draftKey === key ? { ...draft, ...patch } : draft))
  }

  function moveDraft(key: string, targetKey: string) {
    if (key === targetKey) return
    setMessage('')
    setDrafts((current) => {
      const from = current.findIndex((draft) => draft.draftKey === key)
      const to = current.findIndex((draft) => draft.draftKey === targetKey)
      if (from < 0 || to < 0 || from === to) return current
      const next = [...current]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  function moveDraftBy(key: string, direction: -1 | 1) {
    setMessage('')
    setDrafts((current) => {
      const from = current.findIndex((draft) => draft.draftKey === key)
      const to = from + direction
      if (from < 0 || to < 0 || to >= current.length) return current
      const next = [...current]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  function onDragPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragKey.current) return
    if (event.clientY < 84) window.scrollBy({ top: -12, behavior: 'auto' })
    else if (event.clientY > window.innerHeight - 84) window.scrollBy({ top: 12, behavior: 'auto' })
    const underPointer = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-sortable-key]')
    const targetKey = underPointer?.dataset.sortableKey
    if (targetKey && targetKey !== hoverKey.current) {
      hoverKey.current = targetKey
      moveDraft(dragKey.current, targetKey)
    }
  }

  function stopDragging() {
    dragKey.current = null
    hoverKey.current = null
    setDraggingKey(null)
  }

  function addDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const newName = String(form.get('name') ?? '').trim()
    const description = String(form.get('description') ?? '').trim()
    const price = String(form.get('price') ?? '').trim()
    if (!newName || newName.length > 120 || description.length > 240 || parsePriceToCents(price) === null) {
      setMessage('Revisa nombre, descripción y precio del producto.')
      return
    }
    const draftKey = crypto.randomUUID()
    setDrafts((current) => [...current, { draftKey, name: newName, description, price, status: String(form.get('status') ?? 'available') as Product['status'], photoBlob: newProductPhoto, photoPreview: newProductPhotoPreview ?? undefined }])
    setEditingProductKey(draftKey)
    setNewProductPhoto(null); setNewProductPhotoPreview(null)
    setMessage('Producto agregado a los cambios pendientes.')
    setAddingProduct(false)
  }

  async function saveChanges() {
    setMessage('')
    if (!supabase || saving) return
    if (!name.trim() || name.trim().length > 80) { setMessage('El nombre de categoría debe tener entre 1 y 80 caracteres.'); return }
    if (drafts.some((draft) => !draft.name.trim() || draft.name.trim().length > 120 || draft.description.length > 240 || parsePriceToCents(draft.price) === null)) {
      setMessage('Revisa los campos y precios de los productos antes de guardar.')
      return
    }
    const payload = drafts.map((draft, sort_order) => ({ ...(draft.id ? { id: draft.id } : {}), name: draft.name.trim(), description: draft.description.trim(), price_cents: parsePriceToCents(draft.price)!, status: draft.status, sort_order }))
    setSaving(true)
    try {
      const { error: saveError } = await supabase.rpc('save_owner_category_menu', { p_category_id: category.id, p_name: name.trim(), p_is_visible: visible, p_products: payload })
      if (saveError) {
        setMessage(saveError.code === '23514' ? 'El límite de productos está completo; no se aplicaron cambios.' : 'No se guardaron los cambios. Revisa los datos e inténtalo de nuevo.')
        return
      }
      let mediaCleanupFailed = false
      const savedProducts = drafts.some((draft) => !draft.id && draft.photoBlob)
        ? await supabase.from('products').select('id,name,sort_order,image_path').eq('restaurant_id', category.restaurant_id).eq('category_id', category.id).order('sort_order')
        : null
      if (savedProducts?.error) throw new Error('El producto se guardó, pero no pudimos confirmar su foto. Vuelve a guardar para intentarlo otra vez.')
      const draftIds = new Map(drafts.filter((draft) => draft.id).map((draft) => [draft.draftKey, draft.id!]))
      if (savedProducts?.data) for (const draft of drafts.filter((item) => !item.id && item.photoBlob)) {
        const found = savedProducts.data.find((item) => item.sort_order === drafts.indexOf(draft) && item.name === draft.name)
        if (found) draftIds.set(draft.draftKey, found.id)
      }
      setDrafts((current) => current.map((draft) => draftIds.has(draft.draftKey) ? { ...draft, id: draftIds.get(draft.draftKey) } : draft))
      let photoSaveFailed = false
      for (const draft of drafts) {
        const productId = draftIds.get(draft.draftKey)
        if (!productId || (!draft.photoBlob && !draft.removeImage)) continue
        const oldPath = products.find((product) => product.id === productId)?.image_path ?? draft.imagePath ?? null
        let nextPath = draft.removeImage ? null : oldPath
        let uploadedPath: string | null = null
        let imageReferenceSaved = false
        try {
          if (draft.photoBlob) {
            const currentSlot = oldPath?.match(/-([ab])\.webp$/)?.[1]
            const slot = currentSlot === 'a' ? 'b' : 'a'
            uploadedPath = `${category.restaurant_id}/products/${productId}-${slot}.webp`
            const bucket = supabase.storage.from('menu-images')
            const { error: uploadError } = await bucket.upload(uploadedPath, draft.photoBlob, { contentType: 'image/webp', upsert: false, cacheControl: '60' })
            if (uploadError) throw new Error('No se pudo subir la foto del producto.')
            nextPath = uploadedPath
          }
          const { error: imageError } = await supabase.rpc('update_owner_product_image', { p_product_id: productId, p_image_path: nextPath })
          if (imageError) throw new Error('No se pudo guardar la foto del producto.')
          imageReferenceSaved = true
          if (oldPath && oldPath !== nextPath && !(await removeUnusedProductImages([oldPath]))) mediaCleanupFailed = true
          updateDraft(draft.draftKey, { id: productId, imagePath: nextPath, photoBlob: null, photoPreview: undefined, removeImage: false })
        } catch (photoError) {
          if (uploadedPath && !imageReferenceSaved) await supabase.storage.from('menu-images').remove([uploadedPath])
          mediaCleanupFailed = true
          photoSaveFailed = true
          setMessage(photoError instanceof Error ? `${photoError.message} Los demás cambios de la categoría sí se guardaron.` : 'No se guardó una foto; los demás cambios sí se guardaron.')
        }
      }
      const removedImagePaths = products.filter((product) => product.image_path && !drafts.some((draft) => draft.id === product.id)).map((product) => product.image_path!)
      if (removedImagePaths.length) {
        if (!(await removeUnusedProductImages(removedImagePaths))) mediaCleanupFailed = true
      }
      if (!photoSaveFailed) {
        if (!mediaCleanupFailed) setMessage('Cambios guardados.')
        else setMessage('Cambios guardados. No se pudo limpiar una foto anterior; el menú está actualizado.')
      }
      setAddingProduct(false)
      if (!photoSaveFailed) await onSaved()
    } catch {
      setMessage('No se guardaron los cambios. Comprueba tu conexión e inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return <section className={`category-card${isOpen ? ' is-open' : ''}`}>
    <div className="category-summary">
      <button className="category-disclosure" type="button" aria-expanded={isOpen} onClick={onToggle}>
        <span className="category-summary-copy"><span className="category-summary-name">{category.name}</span><span className="category-summary-meta">{products.length} {products.length === 1 ? 'producto' : 'productos'} · {category.is_visible ? 'Visible en menú' : 'Oculta del menú'}</span></span>
        <span className="category-chevron" aria-hidden="true">{isOpen ? '−' : '+'}</span>
      </button>
      <div className="category-order-actions"><button className="icon-button" type="button" aria-label={`Subir categoría ${category.name}`} disabled={index === 0} onClick={() => void onMoveCategory(index, -1)}>↑</button><button className="icon-button" type="button" aria-label={`Bajar categoría ${category.name}`} disabled={index === categoryCount - 1} onClick={() => void onMoveCategory(index, 1)}>↓</button></div>
    </div>
    {isOpen && <div className="category-editor-content">
      <div className="category-settings"><label className="category-name-field">Nombre de categoría<input value={name} maxLength={80} onChange={(event) => { setName(event.target.value); setMessage('') }} /></label><label className="switch-row"><input type="checkbox" checked={visible} onChange={(event) => { setVisible(event.target.checked); setMessage('') }} /><span className="switch-control" aria-hidden="true" /><span><strong>Mostrar en el menú</strong><small>Al apagarlo, tampoco se verán sus productos.</small></span></label></div>
      <div className="product-list-heading"><div><span className="simple-kicker">PRODUCTOS</span><p>Arrastra el asa; con teclado, usa ↑ o ↓.</p></div><span>{drafts.length}</span></div>
      <div className="sortable-products" onPointerUp={stopDragging} onPointerCancel={stopDragging}>
        {drafts.map((draft, productIndex) => <article className={`sortable-product${draggingKey === draft.draftKey ? ' is-dragging' : ''}`} data-sortable-key={draft.draftKey} key={draft.draftKey}>
          <div className="product-grip-column"><button type="button" className="drag-handle" aria-label={`Arrastrar ${draft.name || 'producto sin nombre'}`} onPointerDown={(event) => { dragKey.current = draft.draftKey; hoverKey.current = draft.draftKey; setDraggingKey(draft.draftKey); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={onDragPointerMove} onPointerUp={stopDragging} onPointerCancel={stopDragging} onKeyDown={(event) => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); moveDraftBy(draft.draftKey, event.key === 'ArrowUp' ? -1 : 1) } }}>⠿</button><span>{String(productIndex + 1).padStart(2, '0')}</span></div>
           <div className="sortable-product-fields">
              <div className="product-summary-row">
                <span className="product-summary-photo">{draft.photoPreview ? <img src={draft.photoPreview} alt="" /> : draft.imagePath ? <ProductImage path={draft.imagePath} alt="" /> : <span aria-hidden="true">Sin foto</span>}</span>
                <span className="product-summary-copy"><strong>{draft.name || 'Producto sin nombre'}</strong><span>{formatMXN(parsePriceToCents(draft.price) ?? 0)} · {draft.status === 'available' ? 'Disponible' : draft.status === 'sold_out' ? 'Agotado' : 'Oculto'}</span></span>
                <button type="button" className="product-edit-toggle" aria-expanded={editingProductKey === draft.draftKey} onClick={() => setEditingProductKey((current) => current === draft.draftKey ? null : draft.draftKey)}>{editingProductKey === draft.draftKey ? 'Cerrar' : 'Editar'}</button>
              </div>
              {editingProductKey === draft.draftKey && <div className="product-edit-form">
                <label className="product-name-field">Nombre<input value={draft.name} maxLength={120} onChange={(event) => updateDraft(draft.draftKey, { name: event.target.value })} /></label>
                <div className="product-detail-fields">
                  <label>Descripción opcional<input value={draft.description} maxLength={240} placeholder="Descripción" onChange={(event) => updateDraft(draft.draftKey, { description: event.target.value })} /></label>
                  <label>Precio en pesos<input inputMode="decimal" value={draft.price} placeholder="89.50" onChange={(event) => updateDraft(draft.draftKey, { price: event.target.value })} /></label>
                  <label>Disponibilidad<select value={draft.status} onChange={(event) => updateDraft(draft.draftKey, { status: event.target.value as Product['status'] })}><option value="available">Disponible</option><option value="sold_out">Agotado</option><option value="hidden">Oculto</option></select></label>
                </div>
                {draft.status === 'hidden' && <small className="hidden-status-help">Oculto: este producto no aparece en el menú para tus clientes.</small>}
                <div className="product-photo-edit">
                  <label>{draft.imagePath || draft.photoBlob ? 'Cambiar foto' : 'Subir foto'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => { const input = event.currentTarget; const file = input.files?.[0]; input.value = ''; if (!file) return; setMessage('Preparando la foto…'); try { const blob = await createWebpPreview(file); updateDraft(draft.draftKey, { photoBlob: blob, photoPreview: URL.createObjectURL(blob), removeImage: false }); setMessage('Foto lista. Guarda los cambios para aplicarla.') } catch (photoError) { setMessage(photoError instanceof Error ? photoError.message : 'No se pudo procesar la imagen. Prueba con otra foto.') } }} /></label>
                  {draft.photoBlob && draft.photoPreview ? <img src={draft.photoPreview} alt="Vista previa de la foto" /> : draft.imagePath ? <ProductImage path={draft.imagePath} alt={draft.name} /> : <span>Sin foto</span>}
                  {(draft.imagePath || draft.photoBlob) && <button type="button" className="text-button" onClick={() => updateDraft(draft.draftKey, { photoBlob: null, photoPreview: undefined, removeImage: true, imagePath: null })}>Quitar foto</button>}
                </div>
              </div>}
            </div>
           <div className="product-position-buttons"><button type="button" className="icon-button" aria-label={`Subir ${draft.name}`} disabled={productIndex === 0} onClick={() => moveDraftBy(draft.draftKey, -1)}>↑</button><button type="button" className="icon-button" aria-label={`Bajar ${draft.name}`} disabled={productIndex === drafts.length - 1} onClick={() => moveDraftBy(draft.draftKey, 1)}>↓</button></div>
        </article>)}
      </div>
      {totalProductCount + drafts.filter((draft) => !draft.id).length < 40 && <>
        <button className="add-product-trigger" type="button" onClick={() => { setMessage(''); setAddingProduct((current) => !current) }}><span aria-hidden="true">＋</span> Agregar producto</button>
        {addingProduct && <form className="new-product-form" onSubmit={addDraft}><div className="new-product-form-heading"><strong>Agregar producto</strong><button type="button" className="text-button" onClick={() => { setAddingProduct(false); if (newProductPhotoPreview) URL.revokeObjectURL(newProductPhotoPreview); setNewProductPhoto(null); setNewProductPhotoPreview(null) }}>Cancelar</button></div><label>Nombre<input name="name" maxLength={120} required autoFocus /></label><label>Descripción<input name="description" maxLength={240} placeholder="Opcional" /></label><div className="new-product-bottom"><label>Precio en pesos<input name="price" inputMode="decimal" placeholder="89.50" required /></label><label>Disponibilidad<select name="status" defaultValue="available"><option value="available">Disponible</option><option value="sold_out">Agotado</option><option value="hidden">Oculto</option></select></label></div><small className="hidden-status-help">Oculto: no aparece en el menú para tus clientes.</small><label className="new-product-photo">{newProductPhoto ? 'Foto lista' : 'Subir foto (opcional)'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => { const input = event.currentTarget; const file = input.files?.[0]; input.value = ''; if (!file) return; setMessage('Preparando la foto…'); try { const blob = await createWebpPreview(file); if (newProductPhotoPreview) URL.revokeObjectURL(newProductPhotoPreview); setNewProductPhoto(blob); setNewProductPhotoPreview(URL.createObjectURL(blob)); setMessage('Foto lista.') } catch (photoError) { setMessage(photoError instanceof Error ? photoError.message : 'No se pudo procesar la foto. Prueba con otra imagen.') } }} /></label>{newProductPhotoPreview && <img className="new-product-photo-preview" src={newProductPhotoPreview} alt="Vista previa del producto" />}<button className="button button--outline" type="submit">Agregar producto</button></form>}
      </>}
      {message && <p className="category-save-message" role="status">{message}</p>}
      <button className="delete-category-button" type="button" disabled={saving || deleting} onClick={onDelete}>{deleting ? 'Eliminando categoría…' : `Eliminar categoría y ${products.length} productos`}</button>
      <div className="category-save-bar"><span>{dirty ? 'Tienes cambios sin guardar' : 'Todo al día'}</span><button className="save-category-button" type="button" disabled={!dirty || saving} onClick={() => void saveChanges()}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </div>}
  </section>
}

function PasswordChangeForm() {
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage('')
    if (!supabase || !session?.user.email) return
    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get('current') ?? '')
    const nextPassword = String(form.get('next') ?? '')
    if (nextPassword.length < 10) { setMessage('La nueva contraseña debe tener al menos 10 caracteres.'); return }
    setBusy(true)
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: session.user.email, password: currentPassword })
    if (verifyError) { setBusy(false); setMessage('La contraseña actual no es correcta.'); return }
    const { error: changeError } = await supabase.auth.updateUser({ password: nextPassword })
    setBusy(false)
    if (changeError) { setMessage('No se pudo cambiar la contraseña. Intenta de nuevo.'); return }
    event.currentTarget.reset(); setMessage('Contraseña actualizada.')
  }
  return <details className="password-section"><summary>Cambiar contraseña</summary><div className="password-section-content"><p>Confirma tu contraseña actual para autorizar el cambio.</p><form className="password-form" onSubmit={(event) => void submit(event)}><label>Contraseña actual<input name="current" type="password" autoComplete="current-password" required /></label><label>Nueva contraseña<input name="next" type="password" autoComplete="new-password" minLength={10} required /></label><button className="button button--outline" disabled={busy}>{busy ? 'Actualizando…' : 'Cambiar contraseña'}</button></form>{message && <p className="owner-notice" role="status">{message}</p>}</div></details>
}

function MenuDevelopmentPreview() {
  const restaurant = { name: 'Café de la Esquina con un nombre largo', description: 'Café, pan recién hecho y cocina de temporada.', menu_theme: 'minimal' as MenuTheme, menu_accent_color: '#355B46', menu_logo_path: null, menu_cover_path: null }
  const categories: Category[] = ['Café', 'Desayunos', 'Pan dulce', 'Bebidas frías', 'Comida', 'Extras de temporada'].map((name, index) => ({ id: `demo-category-${index}`, restaurant_id: 'demo', name, sort_order: index, is_visible: true }))
  const products: Product[] = [
    { id: 'demo-1', restaurant_id: 'demo', category_id: categories[0].id, name: 'Americano', description: 'Espresso doble y agua caliente.', price_cents: 4500, status: 'available', sort_order: 0 },
    { id: 'demo-2', restaurant_id: 'demo', category_id: categories[0].id, name: 'Capuchino de la casa', description: 'Espresso, leche texturizada y cacao.', price_cents: 6200, status: 'available', sort_order: 1, image_path: 'demo/demo-menu-photo.svg' },
    { id: 'demo-3', restaurant_id: 'demo', category_id: categories[0].id, name: 'Latte de vainilla agotado', description: 'Leche, espresso y vainilla natural.', price_cents: 6800, status: 'sold_out', sort_order: 2 },
    { id: 'demo-4', restaurant_id: 'demo', category_id: categories[0].id, name: 'Chocolate caliente con canela de Ceilán', description: 'Chocolate de metate preparado al momento con leche de avena opcional.', price_cents: 7100, status: 'available', sort_order: 3 },
    { id: 'demo-5', restaurant_id: 'demo', category_id: categories[1].id, name: 'Pan francés', description: 'Brioche dorado, fruta fresca y miel.', price_cents: 12500, status: 'available', sort_order: 0 },
  ]
  return <main className="public-menu menu-theme--minimal" style={menuStyle(restaurant)}><MenuView restaurant={restaurant} categories={categories} products={products} /></main>
}

function NotFoundPage() {
  return (
    <main className="simple-page page-width">
      <div className="simple-kicker">404 · AQUÍ NO HAY MENÚ</div>
      <h1>Esta página se nos fue de la carta.</h1>
      <Link className="back-link" to="/">Volver al inicio →</Link>
    </main>
  )
}

export default function App() {
  const location = useLocation()
  const isPublicMenu = isPublicMenuPath(location.pathname) || (import.meta.env.DEV && location.pathname === '/__menu-preview')
  return (
    <div className="app-shell">
      {!isPublicMenu && <TopBar />}
      <Routes>
        <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/m/:slug" element={<PublicMenuPage />} />
        {import.meta.env.DEV && <Route path="/__menu-preview" element={<MenuDevelopmentPreview />} />}
        <Route path="/panel" element={<ProtectedArea area="panel" />} />
        <Route path="/admin" element={<ProtectedArea area="administración" />} />
        <Route path="*" element={<NotFoundPage />} />
        <Route path="/inicio" element={<Navigate to="/" replace />} />
      </Routes>
      {!isPublicMenu && <footer className="site-footer"><span>© 2026 alcarte</span><span>Menús digitales para negocios locales</span></footer>}
    </div>
  )
}
