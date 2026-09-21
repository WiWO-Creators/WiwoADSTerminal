# WiWO.ADS — Guía para llevarlo a un VPS y a producción

Documento para quien va a desplegar el proyecto. Cubre qué es, con qué está
hecho, qué lo ata hoy a Cloudflare, qué configuración necesita, qué hay que
arreglar antes de exponerlo a internet y en qué orden hacerlo.

**No contiene valores de claves**, solo sus nombres. Los valores los tiene
Amaro (o se generan; ver §5). Complementa a `docs/ARQUITECTURA.md`, que explica
el flujo de lectura y escritura con las plataformas.

Rama de trabajo: `devAmaro`. (`main` está desactualizada.)

---

## 1. Qué es

Sistema de medios pagados de la agencia. Unifica Google Ads y Meta Ads en un
tablero, deja crear campañas reales desde una sola interfaz (todo nace
**pausado**), gestiona las ya publicadas y tiene un asistente de IA (Claude)
que lee campañas y analiza CSV. TikTok y LinkedIn están en el registro de
plataformas pero **desactivados**.

Regla de producto que no hay que romper: **nada se activa ni gasta dinero sin
que una persona lo apruebe.** El asistente de IA solo propone; los botones
ejecutan.

## 2. Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, React 19), ejecutado con **vinext 0.0.50** sobre Vite 8 |
| Runtime actual | **Cloudflare Worker** (`worker/index.ts`), pensado para ChatGPT Sites |
| Base de datos | **D1** (SQLite de Cloudflare) con Drizzle ORM. Esquema en `db/schema.ts`, migraciones en `drizzle/` (0000 a 0013) |
| Archivos | **R2** (binding `MEDIA`): creativos subidos (imágenes/video), máx. 50 MB |
| UI | Tailwind 4, shadcn/Radix, Sonner, Leaflet, Recharts |
| Datos de plataformas | **Windsor.ai** (lectura y escritura). Ver `docs/ARQUITECTURA.md` |
| Login | Google OAuth (única entrada), dominio `@mgcglobalgroup.com` |
| IA | Anthropic SDK (`@anthropic-ai/sdk`), modelo `claude-sonnet-5` |
| Tests | `node --test tests/*.test.mjs` (21 tests), `tsc`, `eslint` |

Requiere **Node >= 22.13**.

## 3. Mapa del repo

```
app/                  pantallas (*.tsx) y rutas del servidor (app/api/*)
  api/acceso/         login con Google (start, callback, salida)
  api/anuncios/       pausar/activar y gestionar campañas ya publicadas
  api/constructor/    ejecutor del plan (crea campañas; todo pausado)
  api/asistente/      chat de IA en streaming (SSE)
  api/actualizar/     reconstruye el catálogo de campañas (manual y semanal)
  api/media/          sirve los creativos de R2 (SIN sesión, a propósito)
lib/                  lógica de negocio (windsor.ts, constructor.ts, asistente.ts…)
db/                   conexión y esquema Drizzle
drizzle/              migraciones SQL
config/portafolios.json   agrupa cuentas publicitarias en clientes (lo edita el equipo)
worker/index.ts       entrada del Worker de Cloudflare
docs/                 documentación
thinking-orb.css, THINKING_ORB.md   kit del orbe de carga
```

## 4. El obstáculo principal: acoplamiento a Cloudflare

Hoy el código **no corre en Node normal**. Estos 10 archivos importan
`cloudflare:workers` (para leer variables y bindings):

```
app/chatgpt-auth.ts            app/acceso/page.tsx
app/api/acceso/google/route.ts app/api/acceso/google/callback/route.ts
db/index.ts                    lib/almacenamiento.ts
lib/equipo.ts                  lib/integration-store.ts
lib/windsor.ts                 lib/asistente.ts
```

Bindings que la plataforma inyecta y que en un VPS hay que reemplazar:

| Binding | Qué es | Reemplazo en VPS |
|---|---|---|
| `DB` | D1 | SQLite local (`better-sqlite3`) o Postgres |
| `MEDIA` | R2 | Carpeta en disco o S3-compatible |
| `IMAGES` | Optimización de imágenes (`/_vinext/image`) | `sharp`, o desactivar la ruta |
| `ASSETS` | Archivos estáticos (`dist/client`) | Los sirve el proxy o el servidor |
| `env.*` | Variables de entorno | `process.env` |

### Enfoque recomendado

Cortar el acoplamiento **en un solo punto**, sin tocar la lógica de negocio:

1. Crear un módulo `lib/runtime` que entregue `env`, la base y el almacenamiento.
2. Una implementación para Cloudflare (lo de hoy) y otra para Node:
   - **Adaptador tipo D1 sobre SQLite**: implementar `prepare/bind/first/all/run/batch/exec`
     sobre `better-sqlite3`. El código usa SQL crudo vía `getRawDb()` y Drizzle vía
     `getDb()`; con el adaptador **no hay que reescribir consultas**.
   - **Adaptador tipo R2 sobre disco**: `put(key, data, {httpMetadata})` y `get(key)`.
3. Que `cloudflare:workers` se resuelva a ese módulo en el build para Node
   (alias de Vite), o cambiar los 10 imports a `lib/runtime`.

Ventaja: la app sigue corriendo también en Cloudflare, así se puede comparar.

### Antes de comprometerse: prueba de arranque (spike)

`vinext` trae `vinext start` (servidor de producción) pero **no está verificado**
que genere una salida ejecutable en Node sin los bindings. Hacer primero:

1. `npx vinext build` con el alias puesto.
2. `npx vinext start` con las variables cargadas.
3. Abrir `/acceso` y comprobar que la base y el login responden.

Si vinext no lo permite, el plan B es quitar vinext y usar **Next.js estándar**
(más trabajo, pero más estable en producción). Decidirlo con el resultado del spike.

Alternativa que ya existe: `vinext deploy` publica en Cloudflare Workers sin
tocar código (no es VPS).

## 5. Variables de entorno

Local: archivo `.dev.vars` (**ignorado por git, no subir nunca**). En el VPS:
variables del proceso (systemd `EnvironmentFile`, con permisos `600`).

| Variable | Obligatoria | Para qué | Cómo se obtiene |
|---|---|---|---|
| `APP_ORIGIN` | Sí | URL pública, p. ej. `https://ads.midominio.com`. Se usa en redirecciones OAuth | Dominio del VPS |
| `OAUTH_ADMIN_EMAILS` | Sí | Administradores fundadores (coma). Sin esto nadie puede dar de alta al primer usuario | Lista de correos |
| `OAUTH_TOKEN_KEY` | Sí | Llave AES-GCM de 32 bytes en **base64url**; cifra los tokens de las plataformas | `openssl rand -base64 32 \| tr '+/' '-_' \| tr -d '='` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Sí | Login con Google y OAuth de Google Ads | Google Cloud Console |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Solo para OAuth directo de Google Ads | Token de desarrollador | Google Ads API Center |
| `META_APP_ID` / `META_APP_SECRET` | Solo para OAuth directo de Meta | App de Meta | developers.facebook.com |
| `WINDSOR_API_KEY` | Sí | Lectura y escritura de plataformas | Cuenta de Windsor.ai |
| `ANTHROPIC_API_KEY` | Para el asistente | Clave de la API de Claude | console.anthropic.com |
| `ANTHROPIC_MODEL` | No | Por defecto `claude-sonnet-5` | — |
| `DEV_LOGIN_ENABLED` | **Debe ser `false` o ausente en producción** | Modo local sin ChatGPT Sites | — |
| `GOOGLE_ADS_API_VERSION` | No | Por defecto `v25` | — |
| `META_GRAPH_VERSION` | No | Versión de Graph API | — |

La clave de Anthropic que se compartió por chat durante el desarrollo debe
**rotarse**: usar una clave nueva en producción.

## 6. Autenticación y seguridad — bloqueantes antes de exponerlo

Hay dos huecos reales que hay que cerrar **antes** de abrir el puerto a internet:

1. **La cookie de sesión es el correo en texto plano** (`wiwo-dev-user`), sin
   firma y sin flag `Secure` (ver `app/api/acceso/google/callback/route.ts`).
   Cualquiera puede escribir esa cookie con un correo de admin y entrar.
   **Arreglo:** firmarla con HMAC (secreto nuevo, p. ej. `SESSION_SECRET`),
   agregar `Secure`, y verificar la firma en `getCookieSessionUser`
   (`app/chatgpt-auth.ts`).
2. **La app confía en la cabecera `oai-authenticated-user-email`**
   (`getChatGPTUser`): si existe, tiene prioridad sobre la cookie. Esa cabecera
   la pone ChatGPT Sites; **en un VPS cualquiera puede mandarla** y suplantar a
   un admin. **Arreglo:** ignorarla cuando no se corre en ChatGPT Sites, y
   además borrarla en el proxy inverso (`request_header -oai-*` en Caddy).

Además:

- Servir **solo por HTTPS** (Caddy o Nginx con certificado).
- `DEV_LOGIN_ENABLED` fuera o en `false`.
- El dominio permitido (`@mgcglobalgroup.com`) está fijo en el código
  (`DOMINIO_PERMITIDO`, callback de Google). Además hay que estar en el equipo:
  un correo del dominio que no esté invitado ni en `OAUTH_ADMIN_EMAILS` **no entra**.
- La ruta `/api/media/*` es **pública a propósito**: Google y Meta descargan los
  creativos desde sus servidores, sin cookies. Solo entrega objetos bajo el
  prefijo `creativos/`, con nombres UUID.
- Las rutas que escriben comprueban `origin` y permisos por rol
  (`lib/permisos.ts`: admin, lead, buyer, analyst, client).
- El asistente de IA **no tiene límite de consultas por persona**. Añadir un
  límite (por usuario y por día) antes de abrirlo a todo el equipo: cada
  pregunta cuesta dinero.

## 7. Configurar los servicios externos

**Google (login y Google Ads)**
- Crear credenciales OAuth tipo "Aplicación web".
- Redirect URI autorizada, exacta: `https://<dominio>/api/acceso/google/callback`.
- Pantalla de consentimiento: publicarla (o restringirla a usuarios internos del
  dominio) para que no caduquen los tokens.

**Meta** (solo si se usa el OAuth directo): app en developers.facebook.com con
las URIs de retorno del dominio real. La escritura de campañas hoy pasa por
Windsor, no por Meta directo.

**Windsor.ai**: las cuentas de Google y Meta deben estar conectadas en Windsor.
Limitación conocida: el **número de WhatsApp** de los anuncios no se puede ver
ni cambiar por Windsor.

**Creativos**: Meta y Google necesitan poder descargar la imagen desde una URL
pública. El VPS debe tener dominio público con HTTPS; el Constructor rechaza
`localhost` y hosts privados a propósito.

## 8. Base de datos

- Migraciones: `drizzle/0000` a `0013`. En Cloudflare se aplican con
  `wrangler d1 migrations apply` (`npm run db:migrate:local` en local).
  En el VPS hay que aplicarlas en orden sobre la base SQLite (por ejemplo, un
  script que ejecute los `.sql` y registre cuáles corrió).
- Tablas principales: `users`, `user_portfolios` (equipo y permisos por cliente),
  `app_meta` (caché de catálogo y métricas), `oauth_sessions`,
  `integration_connections/accounts` (conexiones cifradas), `account_metrics_daily`,
  `metric_sync_runs`, `decisions`, `audit_events`, y la bitácora de ejecuciones
  (`ejecuciones`, migración 0011).
- **Respaldar** la base y la carpeta de creativos (ver §11).

## 9. Ejecución en el VPS (esbozo, a validar con el spike)

```bash
node -v                       # >= 22.13
npm ci
npx vinext build              # usar esto y no `npm run build`: ese script usa
                              # scripts/sites-env.sh, propio de ChatGPT Sites
npx vinext start              # revisar `--help` para puerto/host
```

- Proceso gestionado con **systemd** o **pm2**, con reinicio automático.
- Proxy inverso (Caddy/Nginx) con HTTPS hacia el puerto de la app, **desactivando
  el buffering** en `/api/asistente` (es streaming SSE).
- Timeouts del proxy holgados (>= 120 s) para `/api/constructor/ejecutar` y
  `/api/actualizar` (la reconstrucción del catálogo tarda ~1 minuto).

## 10. Tareas de fondo

No hay cron en el hosting actual. La actualización semanal del catálogo la
dispara **la primera sesión admin/lead que abre la app pasados 7 días**
(`app/api/actualizar/route.ts`). En un VPS se puede reemplazar por un cron real
que llame a `POST /api/actualizar` (hoy exige sesión; habría que darle un token
de servicio). No es bloqueante.

## 11. Operación

- **Backups**: base SQLite (o Postgres) y carpeta de creativos, diarios y
  probando la restauración.
- **Logs**: guardar la salida del proceso; hay `console.error` en el asistente y
  en el ejecutor del Constructor.
- **Portafolios (clientes)**: se editan en `config/portafolios.json` y se
  despliegan con el código.
- **Costo de IA**: revisar el uso en la consola de Anthropic; el evento `done`
  del asistente devuelve los tokens de cada respuesta.

## 12. Verificación antes de dar por lista la producción

- [ ] Spike de arranque en Node resuelto (o decisión de pasar a Next estándar).
- [ ] Cookie de sesión firmada + `Secure`; cabecera `oai-*` ignorada/borrada.
- [ ] `DEV_LOGIN_ENABLED` en `false`; claves nuevas (Anthropic rotada).
- [ ] HTTPS y `APP_ORIGIN` con el dominio real; redirect URI de Google registrada.
- [ ] Migraciones aplicadas; backups configurados y restauración probada.
- [ ] Entrar con un correo `@mgcglobalgroup.com` invitado y con otro que no lo esté
      (debe rechazarlo).
- [ ] Probar `/api/media/...` desde fuera (Meta/Google deben poder descargarlo).
- [ ] Publicar una campaña de prueba en un cliente chico y confirmar que nace
      **pausada**; borrar la de prueba a mano en la plataforma.
- [ ] Límite de consultas del asistente de IA.
- [ ] `npx tsc --noEmit`, `npx eslint app lib components tests` y
      `node --test tests/*.test.mjs` en verde.

## 13. Pendiente de producto (no bloquea el despliegue)

- TikTok y LinkedIn: apagados en `lib/plataformas.ts`; Windsor sí tiene acciones
  de escritura para ambos.
- El asistente no crea campañas por sí solo: deja una sugerencia que abre el
  Constructor. Tampoco cambia presupuestos ni borra (Windsor no expone borrado).
- Cron real para la actualización semanal.
