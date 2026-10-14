# WiWO.ADS — Guía para llevarlo a un VPS y a producción

Documento para quien va a desplegar el proyecto. Cubre con qué está hecho, qué lo ata a Cloudflare y cómo se
resuelve, qué configuración necesita y cómo ejecutarlo en el VPS. Las tareas manuales recurrentes (reconectar
LinkedIn, tokens de Meta, cron, respaldos) están en [`OPERACION.md`](OPERACION.md).

**No contiene valores de claves**, solo sus nombres. Los valores los tiene
Amaro (o se generan; ver §5). Complementa a `docs/ARQUITECTURA.md` (flujo de lectura y escritura con Windsor) y a `PROYECTO.md` (visión de conjunto).

Rama de trabajo: `devAmaro`. El despliegue automático (`.github/workflows/deploy.yaml`)
se dispara al integrar un PR a `main`, así que los cambios deben llegar a `main` para desplegarse.

---

## 1. Qué es

Sistema de medios pagados de las agencias MGC y WiWO. Unifica Google Ads, Meta Ads y LinkedIn Ads en un
tablero (TikTok Ads solo en lectura), deja crear y editar campañas reales desde una sola interfaz, y tiene un
asistente de IA (Claude) que lee campañas, analiza CSV y deja propuestas.

Reglas de producto que no hay que romper: **ningún cambio llega a una plataforma sin que una persona con permiso lo
apruebe** (aplicar exige confirmar escribiendo `EDITAR` o `CREAR`), y **el asistente de IA solo propone**: los botones
ejecutan. Lo nuevo nace **activo** (desde el 2026-10-06): la revisión es la aprobación previa, no una pausa posterior.
Ver [`ROLES_Y_APROBACIONES.md`](ROLES_Y_APROBACIONES.md).

## 2. Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, React 19), ejecutado con **vinext 0.0.50** sobre Vite 8 |
| Runtime actual | **Cloudflare Worker** (`worker/index.ts`), pensado para ChatGPT Sites |
| Base de datos | **D1** (SQLite de Cloudflare) con Drizzle ORM. Esquema en `db/schema.ts`, migraciones en `drizzle/` (0000 a 0045) |
| Archivos | **R2** (binding `MEDIA`): creativos subidos (imágenes/video), máx. 50 MB |
| UI | Tailwind 4, shadcn/Radix, Sonner, Leaflet, Recharts |
| Datos de plataformas | **Windsor.ai** (lectura y buena parte de la escritura) + APIs directas de Meta, Google Ads y LinkedIn. Ver `docs/PLATAFORMAS.md` |
| Login | Google OAuth (única entrada), dominios `@mgcglobalgroup.com` y `@wiwo.me` |
| IA | Anthropic SDK (`@anthropic-ai/sdk`), modelo `claude-sonnet-5` |
| Tests | `node --test tests/*.test.mjs` (79 archivos de prueba), `tsc`, `eslint` |

Requiere **Node >= 22.13**.

## 3. Mapa del repo

```
app/                  pantallas (*.tsx) y rutas del servidor (app/api/*)
  api/acceso/         login con Google (start, callback, salida)
  api/anuncios/       pausar/activar y gestionar campañas ya publicadas
  api/constructor/    ejecutor del plan (crea campañas; nada nace pausado)
  api/asistente/      chat de IA en streaming (SSE)
  api/actualizar/     reconstruye el catálogo de campañas (manual y semanal)
  api/media/          sirve los creativos de R2 (SIN sesión, a propósito)
lib/                  lógica de negocio (windsor.ts, constructor.ts, asistente.ts…)
db/                   conexión y esquema Drizzle
drizzle/              migraciones SQL
config/portafolios.json   agrupa cuentas publicitarias en clientes (lo edita el equipo)
worker/index.ts       entrada del Worker de Cloudflare
docs/                 documentación
docs/THINKING_ORB.md, docs/thinking-orb.css   kit del orbe de carga
```

## 4. Correr en Node (VPS): resuelto con un puente

El build de vinext deja **una sola** importación de `cloudflare:workers` (un
esquema que solo existe en Cloudflare) y ningún otro global exclusivo de
Workers. Por eso no hace falta quitar vinext ni portar a Next estándar: basta un
módulo que ocupe ese lugar en Node. Está en `servidor/`:

| Archivo | Qué hace |
|---|---|
| `registrar.mjs` + `hooks.mjs` | Hook de Node (`--import`) que resuelve `cloudflare:workers` hacia el puente |
| `cloudflare-workers.mjs` | Exporta el `env` que la app espera: variables + `DB` + `MEDIA` (+ `WIWO_RUNTIME=node`) |
| `d1.mjs` | Adaptador con la API de D1 (`prepare/bind/first/all/run/raw/batch/exec`) sobre **better-sqlite3** |
| `r2.mjs` | Adaptador con `put/get` de R2 sobre una carpeta en disco (rechaza claves con `..`) |
| `migrar.mjs` | Aplica `drizzle/*.sql` en orden, idempotente (tabla `_migraciones`) |

El código de la app **no cambia** y en Cloudflare sigue funcionando igual: el
puente solo se carga si se lo pides con `NODE_OPTIONS`.

**Probado** (Node 24, `vinext start` real): arranca, `/acceso` responde, las
14 migraciones se aplican y no se repiten, Drizzle lee y escribe en SQLite
(`/api/equipo`), un creativo se sube y se lee idéntico por `/api/media/...`
sin sesión, y el asistente de IA hace streaming desde Node.

Notas:
- `better-sqlite3` está como **dependencia opcional**: trae binario
  precompilado para Linux x64. Si falta, `npm rebuild better-sqlite3` (o
  instalar `build-essential` y `python3`).
- Las rutas por defecto (`./datos/...`) son relativas al directorio desde el
  que arranca el proceso. En producción usar **rutas absolutas fuera del
  repositorio** (`WIWO_DB_PATH=/var/lib/wiwo-ads/wiwo.sqlite`,
  `WIWO_MEDIA_DIR=/var/lib/wiwo-ads/creativos`), así un `git pull` o el
  despliegue automático nunca tocan los datos. `/datos/` ya está en `.gitignore`.
- Un solo proceso escribe en el SQLite (WAL activado). No correr varias
  instancias sobre el mismo archivo.

## 5. Variables de entorno

Local: archivo `.dev.vars` (**ignorado por git, no subir nunca**). En el VPS:
variables del proceso (systemd `EnvironmentFile`, con permisos `600`).

| Variable | Obligatoria | Para qué | Cómo se obtiene |
|---|---|---|---|
| `APP_ORIGIN` | Sí | URL pública, p. ej. `https://ads.midominio.com`. Se usa en redirecciones OAuth | Dominio del VPS |
| `OAUTH_ADMIN_EMAILS` | Sí | Administradores fundadores (coma). Sin esto nadie puede dar de alta al primer usuario | Lista de correos |
| `OAUTH_TOKEN_KEY` | Sí | Llave AES-GCM de 32 bytes en **base64url**; cifra los tokens de las plataformas. Sirve también de secreto de sesión si no defines `SESSION_SECRET` | `openssl rand -base64 32 \| tr '+/' '-_' \| tr -d '='` |
| `SESSION_SECRET` | Recomendada | Secreto con el que se firma la cookie de sesión (HMAC). Si falta, se usa `OAUTH_TOKEN_KEY`. **Sin ninguno de los dos nadie puede iniciar sesión** | `openssl rand -base64 32` |
| `WIWO_DB_PATH` | Sí en VPS | Archivo SQLite (ruta absoluta) | p. ej. `/var/lib/wiwo-ads/wiwo.sqlite` |
| `WIWO_MEDIA_DIR` | Sí en VPS | Carpeta de creativos (ruta absoluta) | p. ej. `/var/lib/wiwo-ads/creativos` |
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

## 6. Autenticación y seguridad

Los dos huecos que había están **cerrados** (`lib/sesion-firmada.ts`,
`app/chatgpt-auth.ts`) y se probaron atacando un servidor real en Node:

| Intento | Resultado |
|---|---|
| Cabecera `oai-authenticated-user-email` falsa | 403 |
| Cookie `wiwo-dev-user=<correo>` (la vieja, sin firma) | 403 |
| Cookie firmada con otro secreto | 403 |
| Sin credenciales | 403 |
| Cookie firmada por el servidor | 200 |

- **Cookie de sesión firmada** con HMAC-SHA256 y vencimiento de 12 h; con flag
  `Secure` cuando `APP_ORIGIN` (o la URL) es https. Al desplegar esto, las
  sesiones abiertas antes se invalidan: todos tendrán que volver a entrar.
- **Cabecera `oai-*` ignorada en el VPS**: cuando corre el puente
  (`WIWO_RUNTIME=node`) la app no confía en ella. En ChatGPT Sites sigue
  funcionando igual que antes.

Sigue pendiente de tu lado:

- Servir **solo por HTTPS** (Apache/Caddy/Nginx con certificado) y definir
  `APP_ORIGIN` con `https://`.
- `DEV_LOGIN_ENABLED` fuera o en `false`.
- Los dominios permitidos (`@mgcglobalgroup.com` y `@wiwo.me`) están fijos en
  el código (`DOMINIOS_PERMITIDOS`, callback de Google). Además hay que estar en el equipo:
  un correo del dominio que no esté invitado ni en `OAUTH_ADMIN_EMAILS` **no entra**.
- La ruta `/api/media/*` es **pública a propósito**: Google y Meta descargan los
  creativos desde sus servidores, sin cookies. Solo entrega objetos bajo el
  prefijo `creativos/`, con nombres UUID.
- Las rutas que escriben comprueban `origin` y permisos por rol
  (`lib/permisos.ts`: admin, supervisor, analyst, client; ver `ROLES_Y_APROBACIONES.md`).
- El asistente de IA **no tiene límite de consultas por persona**. Añadir un
  límite (por usuario y por día) antes de abrirlo a todo el equipo: cada
  pregunta cuesta dinero.

## 7. Configurar los servicios externos

**Google (login y Google Ads)**
- Crear credenciales OAuth tipo "Aplicación web".
- Redirect URI autorizada, exacta: `https://<dominio>/api/acceso/google/callback`.
- Pantalla de consentimiento: publicarla (o restringirla a usuarios internos del
  dominio) para que no caduquen los tokens.

**Meta**: app en developers.facebook.com con las URIs de retorno del dominio real, y un usuario del sistema cuyo token
va en `META_SYSTEM_USER_TOKEN` (ver `OPERACION.md`). La escritura de campañas va por Windsor y, para formularios,
eliminar y como respaldo, por Meta directo.

**LinkedIn**: app «WiwoAds» en LinkedIn Developers con la URL de redirección
`https://<dominio>/api/integrations/linkedin/callback` registrada en Auth, y las cuentas publicitarias agregadas en
«View Ad Accounts». Variables `LINKEDIN_*` en el servidor. Un administrador conecta desde Gestión → Cuentas.

**Windsor.ai**: las cuentas de Google y Meta deben estar conectadas en Windsor.
Limitación conocida: el **número de WhatsApp** de los anuncios no se puede ver
ni cambiar por Windsor.

**Creativos**: Meta y Google necesitan poder descargar la imagen desde una URL
pública. El VPS debe tener dominio público con HTTPS; el Constructor rechaza
`localhost` y hosts privados a propósito.

## 8. Base de datos

- Migraciones: `drizzle/0000` a `0045`. En Cloudflare se aplican con
  `wrangler d1 migrations apply` (`npm run db:migrate:local` en local).
  En el VPS hay que aplicarlas en orden sobre la base SQLite (por ejemplo, un
  script que ejecute los `.sql` y registre cuáles corrió).
- Tablas principales: `users`, `user_portfolios` (equipo y permisos por cliente),
  `app_meta` (caché de catálogo y métricas), `oauth_sessions`,
  `integration_connections/accounts` (conexiones cifradas), `account_metrics_daily`,
  `metric_sync_runs`, `decisions`, `audit_events`, y la bitácora de ejecuciones
  (`ejecuciones`, migración 0011).
- **Respaldar** la base y la carpeta de creativos (ver §11).

## 9. Ejecución en el VPS

```bash
node -v                          # >= 22.13
npm ci
npx vinext build                 # no `npm run build`: ese script usa sites-env.sh (ChatGPT Sites)
node servidor/migrar.mjs         # crea/actualiza la base (idempotente)
NODE_OPTIONS="--import /ruta/absoluta/servidor/registrar.mjs" npx vinext start -p 3030
```

Con **PM2** (`ecosystem.config.cjs`), el puente va en `NODE_OPTIONS` y las
variables en `env` (o cargadas desde un archivo con permisos `600`):

```js
module.exports = {
  apps: [{
    name: "wiwo-ads",
    cwd: "/root/wiwo-ads",
    script: "node_modules/.bin/vinext",
    args: "start -p 3030",
    env: {
      NODE_OPTIONS: "--import /root/wiwo-ads/servidor/registrar.mjs",
      WIWO_DB_PATH: "/var/lib/wiwo-ads/wiwo.sqlite",
      WIWO_MEDIA_DIR: "/var/lib/wiwo-ads/creativos",
      // + el resto de variables de la sección 5
    },
  }],
};
```

**Despliegue automático** (`.github/workflows/deploy.yaml`): al cerrar con merge un PR hacia `main`, entra por SSH al VPS y
hace `git pull`, `npm ci`, `npx vinext build`, `node servidor/migrar.mjs` (con `WIWO_DB_PATH`) y `pm2 reload` o `pm2 start`,
seguido de `pm2 save`. El archivo `ecosystem.config.cjs` vive en el VPS, no en el repo. Hay un solo proceso escritor de
SQLite, así que **no se puede usar el modo cluster de PM2**.

- Proxy inverso (Apache/Nginx/Caddy) con HTTPS hacia el puerto de la app,
  **sin buffering** en `/api/asistente` (es streaming SSE) y pasando
  `X-Forwarded-Proto`.
- Timeouts del proxy holgados (>= 120 s) para `/api/constructor/ejecutar`,
  `/api/actualizar` y `/api/clientes` (en frío puede tardar ~15 s).

## 10. Tareas de fondo

**Reglas automáticas:** `servidor/evaluar-reglas.mjs` llama a `POST /api/reglas/programado` con la cabecera
`x-cron-secret` (variable `CRON_SECRET`; `APP_URL` si el puerto no es 3030). Está pensado para un cron cada 5 minutos;
pasos en [`OPERACION.md`](OPERACION.md#4-reglas-automáticas-247-cron).

**Catálogo de campañas:** la actualización la dispara la primera sesión admin o supervisor que abre la app pasados 7
días (`app/api/actualizar/route.ts`) y la app se autoactualiza cada 2 horas con la pestaña abierta. Un cron real para
eso sigue pendiente y no es bloqueante.

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

- [x] Arranque en Node resuelto con `servidor/` (probado).
- [x] Cookie de sesión firmada; cabecera `oai-*` ignorada en el VPS (probado).
- [ ] Iniciar sesión con Google de verdad en el dominio final (no se puede probar sin el dominio y el redirect URI).
- [ ] `DEV_LOGIN_ENABLED` en `false`; claves nuevas (Anthropic rotada).
- [ ] HTTPS y `APP_ORIGIN` con el dominio real; redirect URI de Google registrada.
- [ ] Migraciones aplicadas; backups configurados y restauración probada.
- [ ] Entrar con un correo `@mgcglobalgroup.com` invitado y con otro que no lo esté
      (debe rechazarlo).
- [ ] Probar `/api/media/...` desde fuera (Meta/Google deben poder descargarlo).
- [ ] Publicar una campaña de prueba en un cliente chico, verificar en la plataforma real que quedó como se esperaba y
      borrar la de prueba a mano.
- [ ] Límite de consultas del asistente de IA.
- [ ] `npx tsc --noEmit`, `npx eslint app lib components tests` y
      `node --test tests/*.test.mjs` en verde.

## 13. Pendiente de producto (no bloquea el despliegue)

- TikTok: solo lectura; la integración directa está preparada y espera la aprobación de la app (ver `PLATAFORMAS.md`).
- LinkedIn: faltan los anuncios (necesitan un rol en la página de empresa) y varias secciones de edición.
- El asistente no escribe por sí solo en las plataformas: deja propuestas y solicitudes que una persona aprueba.
- Cron real para la actualización del catálogo.
