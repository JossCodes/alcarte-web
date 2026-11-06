# Preparación de despliegue y operación

**Estado: preparado, no desplegado.** No hay proyecto alojado, dominio ni cuentas de Cloudflare/Supabase autorizadas en este workspace. No ejecutar pasos que enlacen, creen o modifiquen recursos alojados sin aprobación expresa.

## Hosting estático — Cloudflare Pages

Archivos ya preparados en `public/`:

- `_redirects`: fallback SPA para abrir directamente `/panel`, `/admin`, `/reset-password` y `/m/:slug`.
- `_headers`: CSP y cabeceras de seguridad; `index.html` sin caché y assets versionados con caché larga.

Antes de elegir un dominio/proyecto, revisar la CSP de `public/_headers`: actualmente `connect-src`/`img-src` permiten el subdominio estándar `*.supabase.co`. Si Supabase usa hostname personalizado, añadir únicamente ese origen. `style-src 'unsafe-inline'` se necesita por los estilos dinámicos de React; no añadir `unsafe-eval`.

En Cloudflare Pages, crear un proyecto **solo con autorización**. La carpeta raíz del proyecto es la raíz del build; comando de build `pnpm install --frozen-lockfile && pnpm build:pages`, directorio de salida `dist`. Variables públicas necesarias **en el entorno de build**:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-o-anon-key>
```

Vite incrusta estas variables públicas en JavaScript; no son secretos de servidor. Nunca definir `SUPABASE_SERVICE_ROLE_KEY` en Pages ni en una variable `VITE_*`. Las variables para un sitio estático deben establecerse antes de compilar; no existe runtime server-side en esta app.

El proyecto no es un repositorio Git y Wrangler no está configurado. Para un primer despliegue, usar el flujo de Direct Upload de Pages o configurar Git/CI solo tras autorización. Si se usa Direct Upload, compilar con `.env.production.local` ignorado por Git, revisar `dist/` y subir exclusivamente `dist/`; no subir `.env*`, `node_modules/` ni credenciales.

Build local de preparación:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:integration
pnpm supabase test db
pnpm build:pages
```

La suite de integración requiere `.env.local` apuntando al Supabase local con usuarios demo. `pnpm build:pages` compila y verifica archivos SPA, cabeceras y ausencia de nombres de variables server-only en el bundle. Tras dividir módulos por vendor, el último build generó 7 assets JS con un máximo individual de 218.74 kB minificado (68.27 kB gzip); el total JS es aproximadamente 550.13 kB (161.85 kB gzip). Los imports son estáticos y el HTML los precarga: la división mejora caché por vendor, no reduce por sí sola la descarga inicial.

`Strict-Transport-Security` se aplica al hostname servido por Pages sin `includeSubDomains`; confirmar hostname HTTPS estable antes de la primera publicación. La CSP permite `*.supabase.co`; revisarla si se elige un hostname Supabase personalizado.

## Supabase alojado — pasos pendientes de aprobación

No ejecutar hasta tener proyecto autorizado, proyecto-ref confirmado, plan/región revisados y un respaldo del estado destino:

1. Crear/verificar el proyecto Supabase y guardar sus accesos en un gestor de secretos aprobado; no colocarlos en archivos del frontend.
2. Verificar que el proyecto destino esté vacío o que las migraciones/datos existentes hayan sido revisados; esta app no debe apropiarse de un proyecto desconocido.
3. Desde la raíz, vincular el proyecto y aplicar migraciones de forma explícita:

   ```sh
   pnpm supabase login
   pnpm supabase link --project-ref <project-ref-autorizado>
   pnpm supabase migration list
   pnpm supabase db push
   pnpm supabase functions deploy admin-operations
   ```

4. Configurar `APP_BASE_URL=https://<hostname-definitivo>` como secreto de Edge Functions. Verificar en runtime que `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` existan como variables proporcionadas por Supabase; la última solo se consume en la Edge Function. No copiarla a Pages.
5. En Auth, fijar Site URL al origen HTTPS definitivo y permitir solo las redirecciones necesarias, en especial `https://<hostname-definitivo>/reset-password`; eliminar URLs temporales que no se utilicen. La URL debe coincidir con `APP_BASE_URL`.
6. Crear un usuario administrador de plataforma solo después de verificar identidad/contacto mediante el procedimiento operativo aprobado. La concesión es una operación privilegiada hecha desde SQL Editor por un operador autorizado, nunca desde la app. No usar `scripts/seed-demo-users.mjs` ni contraseñas ficticias en el proyecto alojado.
7. Bootstrap ilustrativo (reemplazar el correo por el de una identidad previamente verificada; revisar el `SELECT` antes de ejecutar):

   ```sql
   insert into public.platform_admins (user_id)
   select id from auth.users
   where lower(email) = lower('<correo-verificado>')
     and email_confirmed_at is not null;
   ```

   Para revocar acceso, borrar esa fila por el `user_id` verificado. Registrar operador/fecha por el proceso interno; nunca registrar contraseñas o tokens.

## Costos, cuotas y limitaciones

- No se contrató ni se eligió plan. Los precios y cuotas cambian; consultar documentación oficial vigente de Supabase y Cloudflare **el día que se autorice el despliegue** y documentar URLs/fecha/escenario antes de aceptar gastos.
- Medir usuarios/almacenamiento/egress previstos contra cuotas del plan elegido. Alertas/límites que el proveedor ofrezca deben configurarse en su consola por una persona autorizada; no hay presupuesto ni cuota alojada configurados desde este código.
- Restricciones del producto actuales: hasta 40 productos según configuración, import CSV ≤1 MiB, respaldo JSON ≤2 MiB y cada imagen final ≤100 KiB; se aceptan fuentes JPG/PNG/WebP de hasta 20 MiB, se reducen a 1200 px y las nuevas cargas se guardan como JPEG. Los objetos WebP existentes siguen siendo compatibles.
- Bucket `menu-images` es público a propósito para recursos publicados. Esto no sirve para documentos privados; las copias ya descargadas o cacheadas no se revocan al quitar el archivo.
- JSON de menú respalda configuración y productos, no fotos, usuarios, contraseñas, auditoría ni una copia completa de PostgreSQL. Para recuperación de base de datos y Storage, establecer un procedimiento separado según capacidades/plan del proyecto, verificar restauración y guardar copias fuera del proyecto solo en un destino autorizado.
- Respaldo manual de imágenes mientras no exista exportación de archivos: abrir la carta pública, guardar cada logo/portada publicada desde el navegador con su formato/extensión real (`.jpg` o `.webp`), guardarlos junto al JSON en un destino aprobado y comprobar que los archivos abren. Para restaurar, iniciar sesión en ese mismo restaurante y volver a cargarlos desde `/panel`; no restaurar paths del JSON porque no contiene archivos ni paths.
- Tareas recurrentes: comprobar respaldos/restaurabilidad, vigilar cuotas/egress/almacenamiento, mantener dominios/redirecciones Auth, revisar estado de funciones/migraciones, verificar contactos de dueños y atender recuperación asistida.

## Verificación después de publicar (aún no ejecutada)

1. HTTPS y cabeceras en el hostname final; acceso directo y recarga de `/`, `/login`, `/panel`, `/admin`, `/reset-password` y `/m/comal-de-prueba`.
2. Login/logout, precio persistido, vista pública anónima, menú oculto/agotado, estilo e imágenes.
3. Recuperación de contraseña de un solo uso con origen/fragmento y `no-referrer`; comprobar CORS de Edge Function desde el origen autorizado y rechazo desde origen ajeno.
4. Migraciones, Storage policies/RPC, admin bootstrap, logs y errores sin secretos; confirmar ausencia de cuentas/fixtures de demo no deseadas.
5. Documentar URL publicada, fecha, resultados y límites; fijar el hostname antes de producir QR/NFC.

Ninguna prueba de esta sección debe marcarse PASS hasta ejecutarla en el entorno alojado autorizado. Mientras no exista ese permiso, el estado es **preparado, no desplegado**.
