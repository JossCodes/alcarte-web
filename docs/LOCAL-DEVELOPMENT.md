# Desarrollo local

El backend de desarrollo es Supabase local. No vincula una cuenta ni modifica un proyecto alojado. El stack habitual incluye Storage API para las imágenes del menú; excluye Realtime, imgproxy, Mailpit, Studio, analytics, Edge Runtime y pooler. Así quedan Postgres, Auth, PostgREST, Kong y Storage. La primera ejecución descarga las imágenes de los servicios activos.

## Iniciar

Desde la raíz del proyecto:

```sh
pnpm install --frozen-lockfile
pnpm db:start
pnpm supabase status
```

Si Docker Desktop todavía muestra los contenedores del inicio anterior, detén **el grupo/proyecto `alcarte`** desde **Containers** antes de reiniciar con el comando reducido. No uses `Delete`, `Purge data` ni `down -v`.

En la salida de `status`, copiar el Project URL y la Publishable/anon key local a `.env.local`. El script local de cuentas también requiere la service-role key:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<clave-publica-local>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-local>
```

La tercera variable solo la lee el script local de alta de cuentas, que rechaza URLs ajenas a localhost. No anteponerle `VITE_`, no copiarla al frontend y no compartir su valor. `.env.local` está excluido de Git.

Si no están cargados el esquema y los dos restaurantes ficticios, inicializar el proyecto local:

```sh
pnpm supabase db reset
pnpm seed:demo-users
```

El reset elimina y vuelve a crear los datos de la base local, aplicando migraciones y seed; el segundo comando crea/repara las cuentas ficticias mediante Supabase Auth Admin API. No ejecutar estos comandos contra una base alojada.

Para aplicar nuevas migraciones sin borrar datos locales:

```sh
pnpm supabase migration up
```

Después, en otra terminal:

```sh
pnpm dev
```

Rutas útiles: `/login`, `/panel`, `/admin`, `/reset-password`, `/m/comal-de-prueba`, `/m/terraza-demo`.

## Cuentas ficticias solo para desarrollo local

- Comal de Prueba: `comal@example.com` / `Comal-Demo-2026!`
- Terraza Demo: `terraza@example.com` / `Terraza-Demo-2026!`
- Administrador local: `admin@example.com` / `Admin-Demo-2026!` (solo siembra identidad ficticia en `platform_admins`; no existe ascenso público).

No reutilizar estas claves para clientes ni cargar el seed en producción. En la base solo se guarda el hash bcrypt de la contraseña.

## Administración local y enlaces de acceso

La ruta `/admin` usa la Edge Function `admin-operations`. El stack reducido descrito arriba excluye Edge Runtime; por eso la función puede verificarse con `deno check`, pero no invocarse localmente hasta contar con un runtime Edge autorizado. No habilites ni inicies servicios por esta guía sin autorización explícita.

La función verifica el JWT con Supabase Auth, consulta el rol privado del usuario y realiza las operaciones con la clave de servicio solo después de autorizarlo. Para una instancia configurada, su entorno necesita `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (solo servidor) y `APP_BASE_URL` (URL HTTPS de la app; localhost HTTP solo en desarrollo). En alta o recuperación, la interfaz muestra un enlace de un solo uso para copiarlo manualmente; el token viaja en el fragmento del navegador (no en la petición HTTP), se limpia de la barra de dirección tras validarlo y la página usa `no-referrer`. No hay SMTP ni se escriben enlaces, tokens o contraseñas en logs.

El bootstrap ficticio solo corre con `pnpm seed:demo-users` y una URL localhost. Eliminar/reparar estas cuentas no debe usarse como procedimiento para crear administradores reales. No crear ni asignar identidades reales sin autorización e identificación verificadas.

## Imágenes de menú

La carta acepta logo y foto opcional desde el panel. El navegador decodifica JPG/PNG/WebP de entrada (máximo 20 MB), limita la dimensión a 1200 px y codifica las imágenes nuevas como JPEG hasta 100 KiB. Las áreas transparentes se rellenan de blanco al convertir a JPEG. Storage conserva WebP existentes y acepta JPEG nuevos; aplica un límite final de 100 KiB. No hay proveedor externo ni imgproxy.

El bucket `menu-images` es **público intencionalmente** porque solo contiene recursos publicados de cartas. Los nombres son fijos por restaurante y alternan dos ranuras por logo/portada; las políticas de Storage y RPC validan membresía, estado activo y pertenencia del path, evitando archivos entre restaurantes y acumulación de reemplazos. Los archivos no incluyen información privada. Un objeto publicado puede ser solicitado directamente mientras exista; quitarlo elimina el objeto actual, pero no borra copias/cachés que alguien ya haya descargado.

## Importación y respaldo

Desde `/panel`, el CSV UTF-8 usa `categoria,nombre,descripcion,precio_mxn,estado,orden_categoria,orden_producto`. La importación muestra filas válidas, errores y advertencias de duplicados antes de confirmar; es aditiva y transaccional, cuenta el límite actual más las altas y no reemplaza registros. Un lote inválido o que excede el límite no deja cambios parciales.

CSV y respaldo JSON se descargan desde el mismo panel. El respaldo JSON versión 1 contiene nombre/descripción, apariencia, categorías (incluida visibilidad), productos (incluidos agotados/ocultos) y su orden; no contiene imágenes ni credenciales. Restaurar es una acción explícita que reemplaza la carta y apariencia del restaurante activo del dueño, conservando slug/URL y los archivos de imagen que ya estén en destino. La operación es transaccional y respeta el límite; probar restauración primero en una cuenta/restaurante ficticio.

## Pruebas

```sh
pnpm typecheck
pnpm test
pnpm supabase test db
pnpm test:integration
pnpm build
```

Las pruebas de integración autentican al usuario ficticio, prueban edición de menú, aislamiento entre restaurantes, categorías ocultas y dos altas simultáneas al llegar al límite. Las pruebas requieren que Supabase esté iniciado y `.env.local` configurado. `pnpm supabase test db` prueba también grants/RLS, tope de productos y bloqueo de escritura tras desactivar el restaurante.

Para detener el stack sin borrar la base local:

```sh
pnpm db:stop
```

No uses `pnpm supabase start` sin `--exclude`: iniciaría el stack completo, incluyendo servicios que este MVP no necesita.

La configuración de Pages y los procedimientos de operación/despliegue están en [`DEPLOYMENT.md`](./DEPLOYMENT.md). Están preparados como guía; ningún comando alojado debe ejecutarse sin proyecto y autorización explícitos.
