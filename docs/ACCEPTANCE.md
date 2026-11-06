# Matriz de aceptación — demo local

Solo datos ficticios locales. **PASS no significa despliegue ni aprobación para clientes.** Evidencia manual solo se marca cuando el usuario la confirma; no se infiere de compilar o de pruebas API.

| Caso | Estado | Evidencia / pendiente |
|---|---|---|
| Alta de restaurante y acceso de dueño | PASS manual local | Confirmado por el usuario en etapa 4; operaciones administrativas también tienen pgTAP. |
| Login/logout de dueño | PASS API; UI pendiente | `tests/integration/menu-flow.integration.test.ts`; probar visualmente flujo completo. |
| Cambio y recuperación de contraseña | Recuperación PASS manual; cambio pendiente | Confirmación de etapa 4 para recuperación de un solo uso. Cambio de contraseña aún no ejercitado para no alterar cuenta demo. |
| Cambio de precio y persistencia en la misma URL pública | PASS API; móvil pendiente | Integración actualiza y consulta por slug; falta realizarlo desde la UI en móvil y abrir el enlace tras nueva sesión. |
| Apariencia e imágenes en URL pública | PASS manual móvil | Usuario confirmó la validación de etapa 5; backend Storage también tiene pruebas de integración. |
| Anónimo solo ve contenido publicado; ocultos no visibles y agotados identificados | PASS API/DB | Integración de lectura pública y pgTAP/RLS. |
| Aislamiento entre restaurantes en tablas y RPC | PASS API/DB | Integración y pgTAP; incluye lectura/escritura cruzada y referencias inválidas. |
| Aislamiento de imágenes públicas y cargas | PASS API/DB | Bucket público por diseño; carga autenticada y rutas cruzadas/anónimas rechazadas. No se usa para archivos privados. |
| Aislamiento de exportaciones/respaldo | PASS por autorización de panel/RPC; verificación manual pendiente | RPC requiere dueño activo; restauración manual se probó según confirmación, falta revisión específica de intento cruzado de A→B. |
| Autoascenso, reasignación y edición del límite por dueño | PASS DB; recorrido manual pendiente | Grants/RLS y RPC administrativa cubiertos por pgTAP. |
| Límite de productos, concurrencia e importación atómica | PASS API/DB | Integración para concurrencia; pgTAP para importación, límite, rechazo y rollback. |
| Restaurante desactivado | PASS DB; ruta visual pendiente | Tests de guards/RLS; falta revisar respuesta pública y panel con restaurante desactivado desde navegador. |
| Menú sin fotos | PASS manual móvil según validación de etapa 5 | Verificar también escritorio durante esta etapa. |
| CSV válido/inválido, duplicados; exportación y restauración | PASS manual local | Confirmado por el usuario en etapa 6; pgTAP cubre rollback, límite y restauración. |
| Móvil y escritorio | Móvil PASS en etapas 5/6; escritorio pendiente | Registrar dispositivo o viewport; no asumir prueba en teléfono físico. |
| Errores de red, sesión vencida, slug inexistente y CSV inválido | Parcial | CSV inválido está cubierto manualmente; sesión/red/slug necesitan recorrido manual y evidencia. |
| Bundle, logs, fixtures y documentación sin secretos | Pendiente de revisión final | Sin auditoría dedicada registrada todavía. |

## Guion breve de demo

1. En `/admin`, crear únicamente un restaurante ficticio y entregar acceso local.
2. Como ese dueño, entrar a `/panel`, cambiar un precio y comprobarlo en `/m/<slug>`.
3. Cerrar sesión, abrir el mismo enlace público y comprobar persistencia/visibilidad.
4. Cambiar plantilla/color y, si corresponde, cargar imágenes ficticias; comprobar móvil y escritorio.
5. Importar un CSV de prueba, exportar y restaurar en el otro restaurante ficticio; revisar que el origen no cambie.

No repetir alta, restauración, desactivación o cambio de contraseña sobre las cuentas demo sin guardar antes su estado o tener claro el efecto. Nunca incluir datos reales ni secretos en capturas.

## Registro de ejecuciones

| Fecha | Suite | Resultado | Evidencia |
|---|---|---|---|
| 2026-11-05 | Unitarias, integración, pgTAP y build | PASS | 23 unitarias, 6 integración, 61 pgTAP; build PASS con JS 550.48 kB minificado y aviso >500 kB. |
| 2026-11-05 | Verificación estática del bundle | PASS parcial | Sin el identificador `SUPABASE_SERVICE_ROLE_KEY` en `dist/assets`; esto no sustituye revisión de logs/configuración de despliegue. |
| 2026-11-05 | Pruebas de aceptación iniciales | Ajustes aplicados | La prueba pgTAP RLS se aisló en restaurantes temporales porque las pruebas manuales de etapa 6 alteraron legítimamente el menú demo. Integración ahora consulta datos demo por slug/ID dinámico y ya no asume el seed intacto. |
| Pendiente | Recorrido de aceptación etapa 7 | PENDIENTE | Completar pruebas de escritorio, errores de red/sesión/slug, cambio de contraseña y revisión de logs/fixtures/configuración. |
