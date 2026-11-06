import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = new URL('../dist/', import.meta.url)
const assetsDirectory = fileURLToPath(new URL('assets/', dist))

async function requiredFile(name) {
  try {
    return await readFile(new URL(name, dist), 'utf8')
  } catch {
    throw new Error(`Falta dist/${name}; ejecuta pnpm build primero.`)
  }
}

const redirects = await requiredFile('_redirects')
const headers = await requiredFile('_headers')
const index = await requiredFile('index.html')

if (!/^\/\*\s+\/index\.html\s+200\s*$/m.test(redirects)) {
  throw new Error('El fallback SPA de Pages no apunta a /index.html con status 200.')
}

for (const directive of [
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: no-referrer',
  'Strict-Transport-Security: max-age=31536000',
  'X-Frame-Options: DENY',
  'Content-Security-Policy:',
  "frame-ancestors 'none'",
  'Cache-Control: public, max-age=31536000, immutable',
  'Cache-Control: no-cache',
]) {
  if (!headers.includes(directive)) throw new Error(`Falta directiva de Pages requerida: ${directive}`)
}

if (!/name="referrer"\s+content="no-referrer"/i.test(index)) {
  throw new Error('index.html debe conservar la política no-referrer usada en recuperación.')
}

const assets = await readdir(new URL('assets/', dist))
if (!assets.length) throw new Error('No se encontraron assets compilados en dist/assets.')
for (const asset of assets) {
  const content = await readFile(join(assetsDirectory, asset), 'utf8')
  if (/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE|service_role_key/i.test(content)) {
    throw new Error(`Se detectó un nombre de variable server-only en dist/assets/${asset}.`)
  }
}

console.log(`Pages artifacts OK: SPA fallback, headers, ${assets.length} asset(s), sin marcador server-only.`)
