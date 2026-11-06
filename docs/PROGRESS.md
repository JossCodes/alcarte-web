# Estado de implementación

Última actualización: 2026-11-05

## Resumen

- **Etapa 0 — Inspección y preparación: verificada.** Inventario, herramientas y prerrequisitos revisados; no se iniciaron servicios ni se tocaron proyectos externos.
- **Etapa 1 — Base ejecutable: verificada.** React + TypeScript + Vite, rutas base, estilos adaptables, cliente Supabase opcional y validaciones MXN.
- **Etapa 2 — Primer recorrido: verificada a nivel de integración/API.** El dueño inicia sesión, actualiza un precio y una consulta anónima de la carta por su slug ve el cambio; pgTAP e integración confirman aislamiento.
- **Etapa 3 — Gestión esencial del dueño: en curso.** CRUD de menú, orden de productos corregido para sort orders empatados, bloqueo por restaurante inactivo y límite atómico probados contra Supabase local. El panel se rediseñó con interacción mobile-first; falta que el usuario acepte visualmente en su navegador/dispositivo y probar el cambio de contraseña.
- **Etapa 4 — Administración y entrega segura de accesos: verificada localmente.** Migración, Edge Function, panel y recuperación manual probados en Supabase local. Sin despliegue ni pruebas con identidades reales.
- **Etapa 5 — Plantillas e imágenes: verificada localmente.** Tres estilos, color con contraste automático, vista previa, carga/compresión WebP de logo y portada, bucket público limitado y políticas por restaurante implementados y validados manualmente por el usuario en móvil.
- **Etapa 6 — Importación y respaldo: verificada localmente.** Parser/validador CSV, importación aditiva transaccional con vista previa/confirmación, exportación CSV segura, respaldo JSON versión 1 y restauración reemplazante transaccional implementados y pruebas manuales confirmadas por el usuario. Sin despliegue.
- **Etapa 7 — Demo completa y aceptación: en curso.** `docs/ACCEPTANCE.md` registra matriz, evidencias y guion. Unitarias (23), integración (6), pgTAP (61), typecheck y build pasan; bundle sin el identificador del secreto server-only, aunque el JS minificado supera 500 kB. Falta recorrido manual de escritorio/errores y revisión de logs/configuración.
- **Etapa 8 — Despliegue, costos y operación: en curso; preparado, no desplegado.** Fallback SPA, cabeceras Pages y checker de artefacto implementados; vendors separados para caché estable. `docs/DEPLOYMENT.md` contiene requisitos, variables, migraciones/Edge Function, bootstrap administrativo, respaldo de fotos y operación. No hay hostname, cuenta/proyecto alojado ni autorización para publicar; precios/planes quedan por revalidar antes de cualquier despliegue.
- El producto no está listo para restaurantes. `PLAN.md` define el alcance y las etapas; este documento registra qué está verificado.

## Inventario observado

- Archivos iniciales: `PLAN.md`; no se encontraron `AGENTS.md` aplicables dentro del proyecto.
- El directorio no es un repositorio Git (`git status`/`git rev-parse` devolvieron “not a git repository”).
- Node `v26.8.2`, npm `11.19.1`, pnpm `10.12.4`.
- Docker CLI y daemon `24.0.5` disponibles; `docker info --format '{{.ServerVersion}}'` respondió `24.0.5`.
- Supabase CLI `3.0.0` está instalada como dependencia de desarrollo; Wrangler no está disponible en `PATH`.
- No se proporcionaron credenciales ni proyecto alojado de Supabase o Cloudflare.

## Decisión de verificación

Usar **Supabase local con Docker** para las pruebas integradas cuando llegue la etapa 2; al comenzar esa etapa, instalar/ejecutar Supabase CLI según documentación oficial y verificar que Docker siga disponible. No se necesita crear un proyecto alojado para desarrollo local. Si la CLI o Docker local no funciona, detener solo las pruebas que dependan de backend y pedir acceso a un proyecto Supabase autorizado, sin usar infraestructura ajena.

## Estructura y comandos

Estructura mínima inicial creada:

```text
src/                         React + TypeScript + Vite
  App.tsx                    rutas y pantallas base
  lib/                       cliente Supabase y validaciones compartidas
  styles.css                 presentación adaptable
  lib/validation.test.ts     pruebas unitarias de precios
supabase/
  migrations/                esquema, restricciones y políticas RLS
  functions/                 operaciones administrativas autorizadas
  seed.sql                   datos ficticios solo para demo/local
tests/                       pruebas unitarias, integración y acceso
docs/                        progreso, uso, despliegue y operaciones
```

Comandos definidos en `package.json`:

```text
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

Dependencias fijadas mediante `pnpm-lock.yaml`. Supabase CLI se seleccionará/instalará en la etapa 2; no se instaló en esta etapa.

## Bloqueos y requisitos futuros

- Para etapa 1: ninguno.
- Para etapas integradas: conservar acceso a Docker y obtener una versión compatible de Supabase CLI o acceso autorizado a Supabase alojado.
- La integración de Supabase local y las políticas RLS todavía no están verificadas contra un servidor activo.
- Para despliegue: cuenta/proyecto Cloudflare y autorización expresa.
- Antes de grabar etiquetas NFC/QR de clientes: elegir dominio/hostname definitivo bajo control del usuario.
- Para alta y recuperación reales: canal de contacto verificado de cada dueño y procedimiento de identificación.
- No se autorizaron compras, creación de cuentas ni publicación.

## Evidencia de etapa 0

Comprobaciones realizadas el 2026-11-04:

```text
node --version                         -> v26.8.2
npm --version                          -> 11.19.1
pnpm --version                         -> 10.12.4
docker --version                       -> Docker version 24.0.5, build ced0996
docker info --format '{{.ServerVersion}}' -> 24.0.5
command -v supabase                    -> sin resultado
command -v wrangler                    -> sin resultado
git status --short --branch            -> error: no es repositorio Git
```

En etapa 0 no se ejecutaron migraciones, no se levantaron servicios Supabase, no se configuraron credenciales y no se desplegó nada.

## Evidencia de etapa 1

Trabajo realizado el 2026-11-04:

- Inicializado React 19 + TypeScript + Vite 8 y React Router; instalado el cliente oficial `@supabase/supabase-js`.
- Rutas de inicio, acceso, menú público, panel, administración y no encontrado. Las vistas sin backend no simulan sesión ni menú.
- `.env.example` solo contempla URL y clave pública/anon; `.gitignore` protege archivos `.env` y builds.
- La tipografía usa alternativas locales del sistema; la aplicación no solicita fuentes a un tercero.
- Cliente Supabase opcional y estado visible si falta configuración. No hay credenciales ni instancia configurada.
- Utilidades de conversión a centavos y formato `es-MX`; presentación responsive y respeta movimiento reducido.
- 13 pruebas unitarias de validación de precios.

Comandos ejecutados:

```text
pnpm install   -> correcto; generó pnpm-lock.yaml
pnpm typecheck -> correcto
pnpm test      -> correcto; 13 pruebas aprobadas
pnpm build     -> correcto; Vite 8.3.5 generó dist/
pnpm dev + curl -> Vite listo en localhost:5174 (5173 estaba ocupado); /, /login y /m/demo respondieron HTTP 200
```

El servidor local de desarrollo se detuvo después de las comprobaciones. Las respuestas 200 verifican el fallback SPA, no el renderizado de componentes en un navegador. No se probó integración con Supabase, login, RLS, persistencia ni sitio en dispositivo móvil; permanecen pendientes para sus respectivas etapas.

## Evidencia parcial de etapa 2

Trabajo realizado el 2026-11-04:

- Instalada Supabase CLI `3.0.0` como dependencia local, siguiendo la guía oficial. No se inició sesión ni se enlazó proyecto remoto.
- Inicializado `supabase/config.toml`; registro público deshabilitado y política de contraseña local configurada.
- Añadidos esquema multi-restaurante, membresías, rol administrativo privado, categorías, productos, límites de campos, relaciones que impiden referencias cruzadas y políticas/grants RLS explícitos.
- Añadidos dos restaurantes ficticios locales. El seed SQL solo crea cartas; `scripts/seed-demo-users.mjs` provisiona cuentas ficticias mediante Supabase Auth Admin API y se niega a ejecutarse contra una URL no local. La clave privilegiada se guarda solo en `.env.local` ignorado por Git, no tiene prefijo `VITE_` y no se incluye en el bundle.
- Añadidos login/logout con Supabase Auth, menú público vía cliente anónimo, panel para editar solo precios y pruebas pgTAP/API de aislamiento.
- Comprobaciones locales actuales: `pnpm typecheck`, `pnpm test` (15 aprobadas) y `pnpm build` pasan.
- Provisión local de las cuentas ficticias mediante Supabase Auth Admin API (`pnpm seed:demo-users`) ejecutada correctamente; no se enviaron correos.
- `pnpm supabase test db` -> PASS, 17 assertions pgTAP para acceso público, permisos de escritura y RLS entre restaurantes.
- `pnpm test:integration` -> PASS, 3 casos: login de Comal, cambio de precio confirmado desde el cliente público y lectura/escritura cruzada restringida.
- El stack reducido está arriba con Postgres, Auth, PostgREST y Kong. Los servicios excluidos no aparecen en el stack activo. Los comandos `pnpm db:start` y `pnpm db:stop` documentan esta configuración; no se usó `db:stop` durante esta reanudación.
- Build y typecheck pasan; pruebas unitarias: 15 PASS.
- La ruta de UI que consume este flujo está implementada, pero no se hizo prueba visual en navegador/dispositivo físico. Eso permanece para la etapa 7. No se probó Supabase alojado ni despliegue.

## Evidencia de etapa 3

Trabajo realizado el 2026-11-04, usando el stack local reducido que el usuario ya había iniciado:

- `supabase/migrations/20261104000200_owner_menu_management.sql`: límite por restaurante (máximo 40), permisos de escritura por columna y políticas de edición del dueño.
- `supabase/migrations/20261104000300_owner_guard_privileges.sql`: guards `SECURITY DEFINER` con `search_path` vacío, verifican el usuario vía `auth.uid()`, dueño y estado activo. Función de producto bloquea la fila del restaurante para serializar altas y contar ocultos incluidos.
- `supabase/migrations/20261104000400_private_product_limit.sql`: limita grants públicos para que `product_limit` no sea visible a anónimos.
- `supabase/migrations/20261104000500_atomic_product_reordering.sql`: RPC autorizada y atómica para mover un producto arriba/abajo, desempatar orden y normalizar `sort_order` por categoría. Nuevos productos se agregan al final de su categoría.
- `supabase/migrations/20261104000600_atomic_category_menu_save.sql` y `20261104000700_fix_category_save_json_alias.sql`: guardado transaccional de nombre/visibilidad de categoría y campos/estados/orden/productos nuevos con una sola llamada por categoría. La migración 007 corrige un alias SQL ambiguo encontrado en el primer test de integración.
- `src/App.tsx` / `src/styles.css`: alta y edición de categorías/productos, orden arriba/abajo, ocultar categoría, estados disponible/agotado/oculto, validaciones de interfaz y cambio de contraseña tras verificar la actual con Auth. Los errores del backend no muestran guardado exitoso.
- UX refinada por solicitud: categorías cerradas inicialmente y una abierta a la vez; resumen con recuento/visibilidad; ajustes y productos dentro de la categoría; un botón "Guardar cambios" por categoría; formulario de producto aparece solo al tocar "Agregar producto"; arrastre táctil con autodesplazamiento, botones/teclas de orden como alternativa, controles más grandes y campos distribuidos para móvil.
- Guardado de toda la categoría (categoría, campos de productos y orden) ocurre en una transacción PostgreSQL: si falla una validación, se revierte el lote completo. Alta de una categoría sigue teniendo su propia acción de creación.
- Primer pase de pgTAP encontró que el trigger necesitaba permisos de lectura sobre filas protegidas; se corrigió usando funciones `SECURITY DEFINER` revocadas a roles cliente y se volvió a probar.
- `pnpm supabase migration up` -> aplicó las tres migraciones nuevas en la base local, sin reset ni reinicio de contenedores.
- `pnpm supabase test db` -> PASS, 25 pruebas: permisos, tope de productos, categorías/productos de categorías ocultas y bloqueo de inserciones en restaurante inactivo. Los fixtures del límite usan un restaurante temporal dentro de la transacción, no dependen del total de filas manuales en la demo.
- `pnpm test:integration` -> PASS, 5 casos; incluye guardado transaccional de categoría/productos, rollback de lote inválido, rechazo de categoría de otro restaurante, orden con `sort_order` repetido y dos altas concurrentes al llegar a 40 (solo una puede entrar).
- El primer pgTAP posterior al test concurrente falló al ejecutarse en paralelo contra la misma BD local y coincidió con datos manuales existentes. Se ajustó para comprobar IDs de seed y usar un restaurante aislado transaccional; re-ejecutado en solitario -> PASS. No se borraron filas manuales.
- `pnpm typecheck`, `pnpm test` (15), `pnpm build` -> PASS. El build muestra aviso de chunk principal >500 kB minificado (bundle JS 502.21 kB); no se añadió dependencia de drag-and-drop.
- **Pendiente para cierre de etapa:** no se ejecutó prueba visual/manual en navegador con viewport móvil; el cambio de contraseña está implementado con reautenticación, pero no se ejercitó contra la cuenta demo para no alterar credenciales. No se ha desplegado nada.

## Evidencia de cierre de etapa 4

Trabajo realizado el 2026-11-05; solo usa datos ficticios y la instancia Supabase local que ya estaba activa:

- `supabase/migrations/20261105000100_admin_operations.sql`: tabla de auditoría sin lectura para clientes y RPC service-role para altas, asignación, edición/desactivación y auditoría de recuperación. Las altas de restaurante + membresía + evento son atómicas en PostgreSQL.
- `supabase/functions/admin-operations/index.ts`: valida identidad mediante `auth.getUser`, verifica `platform_admins` en el servidor, aplica CORS por origen exacto, usa Admin API únicamente tras autorización y no registra payloads, correo, enlaces, tokens ni contraseñas. La contraseña temporal es aleatoria y no se devuelve. En fallos parciales intenta borrar al usuario creado y registra únicamente IDs/acción si falla el rollback.
- `src/App.tsx`: panel de administración y canje de recuperación por `verifyOtp` seguido de `updateUser`; alta/edición/desactivación, asignación por correo ya registrado y recuperación asistida.
- `scripts/seed-demo-users.mjs`: añade administrador local ficticio `admin@example.com`; comprobado con `pnpm seed:demo-users`, sin correo saliente.
- `docs/LOCAL-DEVELOPMENT.md`: bootstrap local, variables servidor, y procedimiento seguro de enlaces; no se usa configuración alojada.
- `deno fmt --check` y `deno check` para Edge Function/shared validation -> PASS. `pnpm typecheck`, `pnpm test` -> PASS (18 unitarias); `pnpm build` -> PASS (aviso existente/actualizado de bundle JS >500 kB, 510.62 kB).
- `pnpm supabase migration up` aplicó la migración sin resetear base ni iniciar/detener Docker. `pnpm supabase test db` -> PASS, 31 assertions en 2 archivos, incluidos grants administrativos y auditoría privada.
- La función se sirvió localmente con `pnpm supabase functions serve admin-operations --env-file .env.local`; el primer proceso terminó al alcanzar el límite de la sesión de shell y se reinició en segundo plano. El endpoint exige JWT. No se inició ni detuvo el resto del stack Docker.
- El usuario confirmó que completó satisfactoriamente las pruebas manuales: acceso administrativo, rechazo de operaciones de dueño/anónimo, creación y entrega de acceso, recuperación de un solo uso y desactivación conservando los datos del restaurante.
- **Etapa 4 cerrada para la demo local ficticia.** No se ha desplegado ni modificado un proyecto alojado. Identidad administrativa real, correo de contacto verificado y entrega de accesos reales siguen requiriendo autorización independiente.

## Evidencia parcial de etapa 5

Trabajo realizado el 2026-11-05:

- `supabase/migrations/20261105000200_menu_appearance.sql`: columnas de estilo/color y RPC `update_owner_menu_appearance`, que solo permite un restaurante activo del dueño; valida plantillas y HEX en backend. El color es público para que la carta mantenga el estilo, pero `product_limit` continúa privado.
- `supabase/migrations/20261105000300_menu_media_storage.sql`: Storage bucket público `menu-images`, límite backend 100 KiB/WebP, dos ranuras alternadas por logo/portada, políticas de carga/reemplazo/borrado y RPC que valida pertenencia y estado activo del restaurante.
- `supabase/migrations/20261105000400_menu_media_owner_select.sql`: permite al dueño consultar solo los metadatos de objetos de sus imágenes activas. Storage necesita encontrar el objeto bajo SELECT antes de ejecutar `remove`; sin esta política la API respondía 200 pero dejaba la ranura ocupada, causando `409 KeyAlreadyExists` al cargar después.
- `src/lib/menu-theme.ts`: estilos minimalista, clásico y nocturno; validación de HEX y cálculo de contraste para elegir texto legible en badges.
- `src/App.tsx` / `src/styles.css`: editor mobile-first, preview que reutiliza componentes del menú público, carga de logo/portada, conversión a WebP en navegador, dimensión máxima de 1200 px y archivo final ≤100 KiB.
- Migración aplicada a Supabase local sin resetear datos. Se corrigió una prueba de RLS que contaba globalmente restaurantes; ahora se restringe a los IDs del seed, preservando restaurantes de pruebas manuales.
- Storage API se añadió al stack reducido con autorización expresa. Se reinició sin `--no-backup` y se restauraron los volúmenes; quedan fuera Realtime, imgproxy, Mailpit, Studio, analytics y pooler.
- Verificación final tras el ajuste de carga: `pnpm typecheck` PASS, `pnpm build` PASS, `pnpm test:integration` PASS (6). `pnpm test` (20) y `pnpm supabase test db` (46) también pasaron previamente. Build: JS 522.66 kB minificado, con aviso de chunk >500 kB.
- Integración verifica lectura pública del objeto y rechazos de carga cruzada/anónima. El bucket público es intencional para imágenes de cartas publicadas; no almacenar contenido privado y tener presente que copias/cachés externas pueden persistir tras quitar un objeto.
- Se reprodujo el `409` del usuario en navegador móvil. Se añadió la policy SELECT limitada al dueño/restaurante activo; la integración pasa de nuevo después de aplicar la migración local y confirma que se puede limpiar una ranura y volver a cargar. pgTAP: 46 PASS.
- El usuario confirmó que las pruebas manuales ya están validadas. **Etapa 5 verificada para la demo local ficticia.** No se ha desplegado nada ni se han usado imágenes/identidades reales.

## Inicio de etapa 6 — Importación y respaldo

- Contrato CSV según `PLAN.md`: `categoria,nombre,descripcion,precio_mxn,estado,orden_categoria,orden_producto`.
- Añadido `papaparse` como parser CSV probado. `src/lib/menu-transfer.ts` maneja comillas, comas y saltos de línea, valida campos/estado/orden, conserva precios en centavos y neutraliza celdas peligrosas al exportar CSV.
- `/panel` incluye plantilla descargable, vista previa con errores de fila y avisos de duplicados, confirmación explícita, importación aditiva, exportación CSV y JSON; restaurar un JSON versión 1 pide confirmación y reemplaza la carta/configuración del restaurante actual. No restaura imágenes/credenciales ni cambia slug/URL.
- Migraciones `20261105000500_atomic_menu_import.sql` y `20261105000600_menu_backup_restore.sql` agregan importación aditiva y restauración transaccionales. `20261105000700_import_empty_categories.sql` conserva también categorías sin productos al restaurar JSON. Las RPC validan límite/propiedad/estado activo y toda la estructura antes de confirmar; los errores revierten el lote completo.
- JSON no contiene imagen binaria, paths de Storage ni secretos. CSV de entrada limitado a 1 MB; respaldo JSON a 2 MB en cliente. Importación aditiva muestra duplicados y no modifica registros existentes; restauración sí reemplaza la carta y avisa antes de hacerlo.
- `src/lib/menu-transfer.test.ts`: 3 pruebas de parsing con comas/saltos, validación por fila y neutralización de fórmulas. pgTAP verifica importación, rechazo de límite, rollback, aislamiento y restauración de configuración/visibilidad.
- `pnpm typecheck`, `pnpm test` (23), `pnpm test:integration` (6), `pnpm supabase test db` (58), `pnpm build` -> PASS. Bundle JS 550.48 kB minificado, aviso >500 kB.
- El usuario confirmó la validación manual de importación, exportación y restauración. **Etapa 6 verificada para la demo local ficticia.** No desplegado.

## Inicio de etapa 7 — Demo completa y validación de aceptación

- `docs/ACCEPTANCE.md` registra la matriz por caso (PASS, parcial o pendiente), evidencia automática/manual y guion breve de demostración; separa validación en móvil de escritorio y no reclama que la demo esté lista para clientes.
- Los fixtures ya incluyen Comal de Prueba y Terraza Demo, ambos marcados como ficticios en el seed. En la instancia local observada el 2026-11-05 ambos estaban activos y sin paths de imágenes; sus cartas contienen estados disponibles, agotados y ocultos.
- La aceptación detectó supuestos de seed inmutable. `supabase/tests/database/menu_rls_test.sql` ahora crea restaurantes/categorías/productos dentro de la transacción, y la integración deriva restaurante/categoría/producto de slugs/datos actuales. No requiere restaurar ni resetear los restaurantes demo.
- Suites reejecutadas: `pnpm test` 23 PASS, `pnpm test:integration` 6 PASS, `pnpm supabase test db` 61 PASS, `pnpm typecheck` PASS, `pnpm build` PASS (bundle JS 550.48 kB; aviso >500 kB). Revisión estática encontró que `SUPABASE_SERVICE_ROLE_KEY` no aparece en `dist/assets`; no se inspeccionó todavía el conjunto de logs/configuración.
- **Pendiente:** completar la matriz de errores de red/sesión/slug, probar escritorio, cambio de contraseña y recorrido físico/emulado claramente identificado; revisión final de bundle, logs, fixtures y secretos. No desplegado.

## Inicio de etapa 8 — Preparación, no despliegue

- `public/_redirects`: fallback `/* /index.html 200` para rutas SPA directas; `public/_headers`: CSP, `nosniff`, referrer policy, protección de frame, permissions policy y caché separada de assets/HTML.
- `scripts/check-pages-artifacts.mjs` + `pnpm build:pages`: valida fallback, directivas de seguridad, `no-referrer`, assets emitidos y ausencia de marcadores de variables server-only en el bundle. `pnpm build:pages` -> PASS; `_redirects`/`_headers` aparecen en `dist/`.
- `vite.config.ts` divide React, router, Supabase y dependencias restantes en chunks para caché por vendor. Build final: 7 assets JS; el mayor es 218.74 kB (68.27 kB gzip), total JS 550.13 kB (161.85 kB gzip), sin aviso de chunk >500 kB. Todos siguen siendo import estático/precarga; no se afirma que reduzca el payload inicial.
- Búsqueda del nombre `SUPABASE_SERVICE_ROLE_KEY` en `dist/assets` -> sin coincidencias. Esto no sustituye auditoría de logs/variables en el proyecto alojado.
- `docs/DEPLOYMENT.md`: pasos de build/Pages, migraciones Supabase, deploy de `admin-operations`, Auth redirects, secreto `APP_BASE_URL`, bootstrap/revocación del administrador, respaldo de fotos, cuotas y verificaciones pospublicación. Los comandos remotos están documentados como pasos futuros y **no se ejecutaron**.
- `README.md` ofrece quick start local, pruebas, advertencias de datos/reset y enlaces a guías; señala el secreto local requerido por el seed sin exponerlo ni enviarlo al bundle.
- No hay proyecto-ref, hostname final, cuenta Cloudflare/Supabase autorizada ni Wrangler/Git remoto configurados. No se publicó ni se modificó una infraestructura alojada. Precios/cuotas de `PLAN.md` no se consideran validados para el día del despliegue.
- **Pendiente:** autorizar proyecto/hostname y revisar CSP para el hostname concreto; completar etapa 7; revalidar precios/cuotas oficiales, configurar respaldos de PostgreSQL/Storage y probar Pages/Supabase alojado antes de presentar esta etapa como lista.
