# Alcarte — plan de implementación por etapas

## 1. Objetivo y estado real

Construir un MVP compartido de menús digitales para restaurantes. El administrador da de alta cada restaurante y su carta; el dueño inicia sesión desde su celular y actualiza su propio menú. QR y NFC abren la misma dirección pública permanente.

- Demo objetivo: sábado 7 de noviembre de 2026.
- Primeras entregas objetivo: antes del 14 de noviembre de 2026.
- Estos objetivos no son una garantía: revisar avance y bloqueos al terminar cada etapa.
- Configuración inicial prevista como complemento de aproximadamente $600 MXN; no hay desarrollo personalizado por restaurante.
- Inspección inicial: el proyecto contenía solo `PLAN.md`; no es un repositorio Git.
- Entorno observado al ejecutar etapa 0: Node v26.8.2, npm 11.19.1, pnpm 10.12.4 y Docker CLI/daemon 24.0.5 disponibles. Supabase CLI y Wrangler no aparecieron en PATH. No se proporcionó proyecto Supabase ni acceso a Cloudflare. No hay despliegue ni pruebas del producto.
- Este documento describe trabajo pendiente, no funcionalidades existentes.

## 2. Instrucciones para el agente ejecutor

1. Leer este documento e inspeccionar archivos e instrucciones locales antes de modificar nada. El estado observado arriba puede haber cambiado.
2. Ejecutar **una etapa por encargo**, salvo que el usuario autorice expresamente continuar. No implementar todo el documento a partir de un pedido de una etapa.
3. No borrar ni sobrescribir trabajo ajeno; integrar los cambios existentes.
4. No delegar en otros agentes salvo petición explícita del usuario.
5. No crear cuentas, contratar servicios ni publicar datos reales sin autorización. Usar datos ficticios identificados.
6. No añadir herramientas, servicios ni dependencias fuera del alcance sin justificar su necesidad. Preferir versiones estables compatibles; no asumir compatibilidad por tener Node instalado.
7. No inventar credenciales, resultados de pruebas, URLs, documentación de APIs ni precios. Consultar documentación oficial cuando haga falta.
8. No usar autenticación casera, contraseñas en texto plano ni `localStorage` como sustituto de persistencia. Seguir el manejo de sesión del SDK oficial.
9. Mantener claves privilegiadas exclusivamente en backend o herramientas locales autorizadas; nunca en variables `VITE_*`, bundles, fixtures públicos, logs o Git.
10. Si una etapa depende de credenciales o infraestructura ausente, preparar lo que se pueda y reportar el bloqueo. No crear un backend falso para declararla completa.
11. Al terminar, informar: archivos cambiados, comandos ejecutados, resultados reales, pendientes y siguiente etapa habilitada. Registrar evidencia reproducible en `docs/PROGRESS.md`, sin secretos.
12. Marcar una etapa como terminada únicamente al cumplir sus criterios. Distinguir `pendiente`, `en curso`, `bloqueada` y `verificada`.
13. Si el usuario pide expresamente solo planificación, no ejecutar las etapas.

## 3. Arquitectura acordada

- Frontend: React + TypeScript + Vite; una aplicación para menú, dueño y administrador.
- Hosting: Cloudflare Pages Free, con rutas SPA configuradas.
- Backend compartido: un proyecto Supabase para PostgreSQL, Auth, Storage y Edge Functions.
- Autenticación: correo y contraseña con Supabase Auth, sin registro público.
- Autorización: RLS en base de datos y Storage; autorización explícita en operaciones administrativas.
- No se necesitan Next.js, servidores administrados por el usuario, Realtime ni servicio SMTP para este MVP.
- No crear una base de datos ni un despliegue por restaurante.
- Las tres plantillas comparten estructura y componentes; solo cambian variables CSS, tipografía y detalles visuales.

### Decisiones funcionales

- Menú público: `/m/<identificador-permanente>`. El identificador no cambia con nombre, precio, color o plantilla y no se recicla para otro negocio.
- Login con correo como usuario; un dueño puede estar limitado a un restaurante en el MVP. No ampliar a gestión de cadenas.
- Precios: enteros en centavos, formato MXN con dos decimales; validación también en backend.
- Productos: disponible, agotado u oculto. Agotado aparece identificado; oculto no aparece en consultas públicas.
- Categorías ocultas ocultan sus productos del menú público sin borrar su estado individual.
- Orden: controles subir/bajar accesibles en celular; no es obligatorio implementar arrastrar y soltar.
- Límite inicial: 40 productos totales, incluidos ocultos; solo el administrador puede configurarlo.
- Desactivación: bloquea el menú público y la edición del dueño, sin borrar datos ni cambiar su URL. El administrador conserva acceso.
- La vista previa usa los mismos componentes del menú; si muestra datos ocultos, requiere autorización y no se cachea públicamente.
- Los cambios se ven al abrir o recargar el menú y al volver a la pestaña. No prometer sincronización instantánea entre dispositivos.

### Recuperación de acceso sin SMTP

- El dueño contacta al administrador mediante el canal previamente registrado.
- El administrador verifica la identidad fuera de la aplicación y genera un enlace de recuperación temporal y de un solo uso mediante Supabase Auth.
- Entregarlo por ese canal, nunca por un endpoint público sin autenticación ni en logs.
- El dueño establece su contraseña. El administrador no necesita conocerla ni almacenarla.
- Implementar el canje siguiendo el flujo oficial vigente; restringir destinos de redirección y comprobar expiración y reutilización.
- Documentar revocación de sesiones y sus límites reales: no asumir que cambiar una contraseña invalida inmediatamente todos los JWT existentes.
- Recuperación automática por correo no forma parte de esta entrega. El SMTP predeterminado de Supabase no es apto para clientes de producción.

## 4. Requisitos externos y bloqueos

No hay decisiones de producto bloqueantes antes de iniciar. Se necesita resolver lo siguiente cuando corresponda:

| Requisito | Etapa que depende de él | Si falta |
| --- | --- | --- |
| Docker funcionando para Supabase local, o proyecto Supabase autorizado | 2 y pruebas integradas posteriores | Preparar código/migraciones y dejar integración como bloqueada |
| Secretos y claves del backend proporcionados por un canal local seguro | 2–4 y despliegue | No solicitarlos en un archivo público ni inventarlos |
| Identidad del administrador inicial y autorización para crearla | 4 en entorno alojado | Usar únicamente administrador ficticio local |
| Cuenta/proyecto Cloudflare y autorización para publicar demo ficticia | 8 | Dejar build y pasos reproducibles, sin declarar despliegue |
| Dominio propio o hostname definitivo bajo control del usuario | Antes de grabar NFC/QR de clientes | Demo con URL provisional claramente identificada |
| Contacto registrado de cada dueño y procedimiento de verificación | Alta real y recuperación | No activar recuperación para contactos sin verificar |
| Aprobación expresa de cualquier plan de pago | Antes de contratar | Mantenerse en el plan autorizado y comunicar sus límites |

No instalar ni iniciar servicios del sistema sin comprobar necesidad y alcance. No tocar proyectos alojados ajenos.

## 5. Etapas

### Etapa 0 — Inspección y preparación

**Trabajo**
- Revisar archivos, `AGENTS.md` aplicables, herramientas y estado del repositorio si existe.
- Comprobar compatibilidad del entorno y disponibilidad real de Docker sin modificar proyectos.
- Definir comandos y estructura mínima para frontend, migraciones, funciones, pruebas y documentación.
- Crear `docs/PROGRESS.md` con estado real y bloqueos. No incluir secretos.

**Cierre**
- Hay un inventario breve y se conoce si la integración se probará localmente o en un proyecto autorizado.
- Si falta backend, declararlo; no marcar como bloqueado trabajo independiente del frontend.

### Etapa 1 — Base ejecutable, sin simular funcionalidades

**Trabajo**
- Inicializar React, TypeScript y Vite con pocas dependencias.
- Configurar rutas del menú público, login, panel del dueño y administración.
- Añadir CSS base móvil, validaciones compartidas y formato de moneda.
- Preparar `.env.example`, exclusión de secretos y cliente oficial de Supabase.
- Mostrar un error de configuración comprensible si falta conexión; sin datos falsos presentados como persistencia real.
- Definir comandos de desarrollo, build, comprobación de tipos y pruebas.

**Cierre**
- Instalación reproducible con lockfile, build y comprobación de tipos exitosos.
- La aplicación arranca y las rutas base funcionan. Esto todavía no demuestra login ni aislamiento.

### Etapa 2 — Primer recorrido completo: login → precio → menú público

**Trabajo**
- Crear migraciones para restaurantes, membresías, administradores, categorías y productos.
- Separar datos privados de los campos públicos; no dar lectura pública indiscriminada a tablas con contactos o permisos.
- Implementar RLS para dueño, administrador y lectura pública limitada a restaurantes activos y contenido visible.
- Garantizar que categoría y producto pertenezcan al mismo restaurante mediante restricciones de base de datos.
- Impedir que el dueño altere membresías, privilegios, identificadores permanentes, activación o límite.
- Cargar dos restaurantes ficticios, dos dueños y datos mínimos mediante un seed repetible solo en entornos de demostración autorizados.
- Login, logout, ruta protegida y edición de un precio guardada en PostgreSQL.
- Menú público sin registro, con nombre, categoría, producto y precio desde backend.
- Consultas públicas frescas al abrir/recargar; evitar cachear indefinidamente precios.

**Cierre obligatorio antes de ampliar funciones**
- Dueño A inicia sesión, cambia un precio y lo ve en la misma URL pública tras recargar.
- El precio persiste al cerrar sesión y reabrir la aplicación.
- A no puede leer datos privados ni editar B alterando solicitudes directas al backend.
- Una persona anónima puede consultar la carta publicada de ambos negocios: esto es intencional, no una fuga de datos privados.
- Las pruebas usan Supabase real local o alojado autorizado, no mocks como evidencia de RLS.
- No publicar credenciales de edición de la demo en la interfaz pública.

### Etapa 3 — Gestión esencial del dueño

**Trabajo**
- Crear, editar, ordenar y ocultar categorías y productos.
- Editar nombre, descripción breve y precio; disponible, agotado u oculto.
- Validar longitudes, valores permitidos, precios y pertenencia en backend además de la interfaz.
- Aplicar el límite de productos de forma atómica en base de datos, también ante creaciones concurrentes.
- Bloquear edición para restaurantes desactivados aunque el dueño conserve una sesión vigente.
- Implementar cambio de contraseña autenticado con las verificaciones del flujo oficial.
- Estados claros de carga, error y guardado; no afirmar que se guardó si el backend falló.

**Cierre**
- Flujo completo usable en viewport móvil, incluyendo orden y estados.
- Categorías ocultas y sus productos no son legibles mediante consultas públicas.
- No es posible exceder el límite mediante llamadas directas ni solicitudes simultáneas.
- Crear y editar nunca permite vincular registros de otro restaurante.

### Etapa 4 — Administración y entrega segura de accesos

**Trabajo**
- Panel para crear, editar y desactivar restaurantes y modificar su límite.
- Alta de dueños, asignación de acceso y recuperación mediante API administrativa de Supabase desde Edge Functions.
- Verificar token e identidad del solicitante con mecanismos oficiales y comprobar privilegio administrativo en backend en cada operación; no confiar en roles enviados por el navegador.
- Resolver altas parciales: rollback cuando sea posible o estado recuperable documentado, sin dejar accesos huérfanos inadvertidos.
- Proteger el administrador inicial con procedimiento local explícito, sin endpoint público de autoascenso.
- Completar recuperación sin SMTP, cambio de contraseña y manejo de enlaces inválidos/usados/expirados.
- Registrar solo metadatos mínimos de acciones sensibles; no contraseñas, enlaces de recuperación ni tokens.

**Cierre**
- El administrador crea un restaurante y entrega acceso a un dueño ficticio.
- Un dueño y un anónimo no pueden invocar altas, asignaciones o recuperación administrativa manipulando solicitudes.
- El dueño no puede elevarse a administrador modificando su perfil o metadatos.
- Enlace de recuperación probado una vez, intento de reutilización rechazado y comportamiento de expiración comprobado.
- Desactivar conserva carta y URL y bloquea las operaciones previstas.

### Etapa 5 — Plantillas e imágenes

**Trabajo**
- Tres estilos: minimalista claro, clásico y oscuro para bares/terrazas; componentes y estructura únicos.
- Selección de color con validación y contraste legible; fuentes del sistema o locales pequeñas.
- Vista previa reutilizando componentes del menú público.
- Subida/reemplazo de logo y foto opcional, sin proveedores externos de imágenes.
- Punto de partida: entrada máxima de 5 MB; redimensionar hasta 1200 px y comprimir a WebP con objetivo máximo de 100 KB por imagen. Rechazar o explicar formatos no compatibles, sin añadir conversores pesados silenciosamente.
- Definir y aplicar límite al archivo final también en backend/Storage; comprobar formato real donde corresponda, no confiar solo en extensión/MIME del cliente.
- Políticas de Storage por restaurante para lectura/escritura/borrado; evitar sobrescritura cruzada y acumulación ilimitada de reemplazos.
- Decidir y documentar exposición de archivos: preferir bucket privado y acceso público controlado solo a imágenes publicadas. No afirmar que ocultar un producto revoca enlaces ya emitidos; documentar su vigencia.
- Imágenes con carga diferida, dimensiones reservadas y textos alternativos; carta completamente funcional sin fotos.

**Cierre**
- Cambiar de estilo/color conserva productos y URL.
- Tres estilos probados en móvil, sin aplicaciones duplicadas.
- Archivos sobredimensionados/no admitidos y subidas cruzadas rechazados.
- La carta sin fotografías se ve completa; no hay peticiones a imágenes inexistentes.
- Medir tamaño de assets y de una carga representativa; informar valores reales sin inventar puntajes.

### Etapa 6 — Importación y respaldo

**Trabajo**
- Plantilla CSV UTF-8: `categoria,nombre,descripcion,precio_mxn,estado,orden_categoria,orden_producto`.
- Usar un parser probado que admita comillas, comas y saltos de línea; no separar líneas/campos manualmente.
- Importación solo para administrador: vista previa, errores por fila y confirmación antes de escribir.
- Importación inicial en modo agregar; advertir sobre duplicados y no borrar ni sobrescribir la carta existente silenciosamente. No construir sincronización avanzada.
- Validar todo y aplicar el lote en una transacción; contar productos existentes y nuevos al verificar el límite.
- Exportar JSON versionado de carta/configuración y CSV; neutralizar fórmulas peligrosas en CSV exportado.
- Proveer descarga o procedimiento de respaldo de archivos. Aclarar que un JSON con URLs no respalda las fotos.
- Documentar restauración de carta/configuración y verificarla en un restaurante ficticio; no exportar contraseñas ni prometer restaurarlas.

**Cierre**
- CSV válido se importa completo; uno inválido o superior al límite no deja escrituras parciales.
- Exportación incluye agotados, ocultos, orden y apariencia.
- Se demuestra restauración en destino ficticio y se comprueba que no afecta al original.
- Dueño A no puede obtener respaldos privados de B mediante cambios de identificador.

### Etapa 7 — Demo completa y validación de aceptación

**Trabajo**
- Preparar Comal de Prueba y Terraza Demo, etiquetados como negocios ficticios; uno sin fotos.
- Crear guion breve: administrador crea negocio/acceso → dueño entra → cambia precio → abre mismo enlace → cambia plantilla → exporta.
- Automatizar el recorrido crítico y casos negativos donde sea viable; registrar también pruebas manuales reales.
- Probar móvil y escritorio; distinguir emulación de prueba en teléfono físico.
- Revisar errores de red, sesión vencida, restaurante inexistente/desactivado y archivos/CSV inválidos.
- Revisar bundle, logs, fixtures y documentación para evitar filtración de secretos.

**Matriz de aceptación: registrar resultado y evidencia por caso**
- Alta de restaurante y dueño.
- Login, logout, cambio y recuperación de contraseña.
- Cambio de precio desde móvil y persistencia tras nueva sesión.
- Misma URL tras cambiar carta, nombre y plantilla.
- Acceso anónimo solo a contenido publicado.
- Rechazo de lectura/escritura privada cruzada en tablas, funciones, archivos y exportaciones.
- Rechazo de autoascenso, reasignación de restaurante y edición del límite por dueño.
- Límite concurrente e importación atómica.
- Ocultos no expuestos; agotados identificados; desactivación efectiva.
- Menú sin fotografías.
- Exportación y restauración verificadas.

**Cierre**
- Cada caso está aprobado, fallido o pendiente, con evidencia; nunca asumir éxito por compilar.
- Si falla aislamiento, autenticación o persistencia, no presentar el producto como listo para clientes.

### Etapa 8 — Despliegue, costos y operación

**Trabajo**
- Preparar build de Pages, rutas SPA, cabeceras de seguridad y variables públicas mínimas.
- Preparar migraciones, Storage, funciones y secretos del backend con pasos reproducibles.
- Documentar bootstrap administrativo, URLs permitidas de Auth y redirecciones de recuperación.
- Configurar límites de uso/gasto disponibles y documentar consecuencias de alcanzar cuotas.
- Revalidar condiciones comerciales, precios y límites en documentación oficial en la fecha del despliegue.
- Publicar solo con acceso y autorización explícitos; usar datos ficticios en demo.
- Verificar las rutas por acceso directo, login, cambio de precio y recuperación en el entorno publicado.
- Fijar hostname definitivo antes de grabar NFC/QR de clientes; no hace falta programar NFC desde la web.
- Entregar README corto y guías de operación, respaldo/restauración y costos/limitaciones.

**Cierre**
- Si se publicó: URL real y verificaciones ejecutadas, sin compartir secretos.
- Si no se publicó: comandos exactos, variables necesarias y pasos pendientes; etiquetar como preparado, no desplegado.
- Dejar explícitas las tareas manuales recurrentes: contactos verificados, recuperación asistida, revisión de cuotas y respaldos.

## 6. Presupuesto de referencia — no equivale a contratación

Documentación consultada el 4 de noviembre de 2026. Revalidar antes de publicar o contratar.

Supuestos mensuales: 1,000 aperturas por restaurante; hasta 40 productos; aproximadamente 40 KB de datos y 400 KB de imágenes descargadas por apertura; hasta 4 MB de fotos almacenadas por restaurante; base de datos estimada inferior a 100 MB en ambos escenarios. Son supuestos, no mediciones ni garantías.

| Concepto | 10 restaurantes | 30 restaurantes |
| --- | --- | --- |
| Aperturas | 10,000 | 30,000 |
| Transferencia estimada de Supabase | 4.4 GB | 13.2 GB |
| Imágenes almacenadas | 40 MB | 120 MB |
| Cloudflare Pages Free | US$0 | US$0 |
| Demo/operación en Supabase Free | US$0 si cabe en cuotas; poco margen | No presupuestar este tráfico en Free |
| Operación recomendada: Pages Free + un proyecto Supabase Pro Micro | Desde US$25/mes | Desde US$25/mes |

- No sumar proyectos por restaurante. El importe Pro presupone un solo proyecto Micro y los créditos incluidos, sin add-ons ni excesos.
- Importes antes de impuestos, tipo de cambio/comisiones y dominio. No hay cotización de dominio: se necesita elegirlo primero.
- Supabase Free: 500 MB de base de datos, 1 GB de archivos, 5 GB de egress y 5 GB de egress cacheado, cuotas separadas. No asumir que todo tráfico de fotos será cacheado.
- Supabase Free puede pausarse tras una semana sin actividad y no incluye backups automáticos. No prometer disponibilidad comercial sobre esa base.
- Supabase Pro: desde US$25/mes, con 8 GB de disco, 100 GB de archivos y cuotas de transferencia superiores a estos supuestos. Las imágenes requieren respaldo separado de los backups de base de datos.
- Pages Free: 500 builds mensuales y límites de archivos; no recompilar por cada cambio de precio. Los datos se consultan en ejecución.
- Las funciones previstas corren en Supabase; no añadir Workers de pago a esta arquitectura sin necesidad demostrada.
- Los términos consultados no mostraron una limitación exclusivamente no comercial para los planes propuestos. Revisar términos vigentes y el uso concreto, no presentar esto como dictamen jurídico ni gratuidad perpetua.
- El precio de alta de $600 MXN no financia alojamiento indefinido: documentar quién cubre los costos recurrentes y no prometer servicio vitalicio. La decisión comercial no bloquea el desarrollo de la demo.

Fuentes oficiales:
- https://supabase.com/pricing
- https://supabase.com/terms
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/reference/javascript/auth-admin-generatelink
- https://developers.cloudflare.com/pages/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://www.cloudflare.com/service-specific-terms-application-services/

## 7. Fuera de alcance

Carrito, cobros, suscripciones automáticas, pedidos por mesa, cocina, POS, inventario, reservas, fidelización, analítica avanzada, app móvil, generación de imágenes con IA, programación NFC desde la web y diseño personalizado por cliente.

No añadir una alternativa de infraestructura ni migraciones entre proveedores salvo bloqueo demostrado y explicación breve al usuario.

## 8. Prompt breve para ejecutar cada etapa

> Lee `PLAN.md`, las instrucciones locales y `docs/PROGRESS.md` si existe. Ejecuta únicamente la etapa N, comprobando primero sus prerrequisitos. No rehagas etapas verificadas ni amplíes el alcance. Si falta acceso o una decisión irreversible, informa el bloqueo y completa solo el trabajo independiente. No simules backend ni declares pruebas/despliegues sin evidencia. Actualiza el progreso con archivos cambiados, comandos y resultados reales; termina indicando qué falta y si la siguiente etapa está habilitada. No delegues.

Para comenzar, sustituir N por **0**. Para avanzar, revisar primero el cierre de la etapa anterior.
