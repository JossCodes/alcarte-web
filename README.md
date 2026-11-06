# Alcarte

Plataforma en desarrollo para menús digitales de restaurantes. Demo únicamente local y con datos ficticios; **no está desplegada ni lista para restaurantes reales**.

## Desarrollo local

Requisitos: Node.js, pnpm y Docker.

```sh
pnpm install --frozen-lockfile
pnpm db:start
pnpm supabase migration up
pnpm seed:demo-users
pnpm dev
```

Configura antes `.env.local` con la URL y clave pública local de Supabase. Para `seed:demo-users` también hace falta `SUPABASE_SERVICE_ROLE_KEY` local; nunca le pongas prefijo `VITE_` ni la incluyas en el frontend. Consulta [`docs/LOCAL-DEVELOPMENT.md`](docs/LOCAL-DEVELOPMENT.md) para configuración, cuentas ficticias, pruebas y datos. **No uses `supabase db reset` si quieres conservar cambios manuales**: ese comando recrea la base local.

## Verificaciones

```sh
pnpm typecheck
pnpm test
pnpm test:integration
pnpm supabase test db
pnpm build:pages
```

## Despliegue y operación

El artefacto de Pages se prepara, pero no se publica automáticamente. Hosting, migraciones alojadas, secretos, costos, cuotas, backups y autorización están descritos en [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). El estado de implementación y la matriz de aceptación están en [`docs/PROGRESS.md`](docs/PROGRESS.md) y [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md).

Las imágenes de las cartas publicadas son públicas. El respaldo JSON de menú no incluye fotos, cuentas ni secretos. No guardes información privada en el bucket de imágenes ni publiques sin autorización expresa.
