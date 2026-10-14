# WiWO.ADS

Sistema operativo de medios pagados de MGC y WiWO. Reúne **Google Ads, Meta Ads y LinkedIn Ads** (TikTok Ads, por
ahora solo lectura) en un solo tablero y permite **crear, editar y revisar campañas reales** desde una sola interfaz,
con un asistente de IA (Claude) que lee las campañas y recomienda.

Dos ideas ordenan todo:

1. **Nadie del equipo inicia sesión en Meta, Google ni LinkedIn.** Hay una conexión del equipo y cada persona hace lo
   que su rol permite.
2. **Ningún cambio llega a una plataforma sin que una persona con permiso lo apruebe.** Quien arma pero no aprueba
   (Digital Creator) deja una solicitud; quien aprueba (Digital Lead o Admin) la revisa. El asistente de IA solo
   propone.

WiWO.ADS sirve para **gestionar campañas y ver información**. Los reportes mensuales de clientes son de otra
herramienta (wiwometriq).

## Dónde leer qué

La documentación vive en [`docs/`](docs/README.md). Los más útiles para empezar:

| Si quieres… | Lee |
|---|---|
| Entender el producto de punta a punta | [`PROYECTO.md`](PROYECTO.md) |
| Saber qué hace cada pantalla | [`docs/FUNCIONES_DEL_PRODUCTO.md`](docs/FUNCIONES_DEL_PRODUCTO.md) |
| Saber qué se puede leer, crear y editar en cada plataforma | [`docs/PLATAFORMAS.md`](docs/PLATAFORMAS.md) |
| Entender roles, solicitudes y aprobaciones | [`docs/ROLES_Y_APROBACIONES.md`](docs/ROLES_Y_APROBACIONES.md) |
| Levantarlo y probarlo en tu máquina | [`docs/DESARROLLO_Y_PRUEBAS.md`](docs/DESARROLLO_Y_PRUEBAS.md) |
| Desplegarlo y operarlo | [`docs/DESPLIEGUE_VPS.md`](docs/DESPLIEGUE_VPS.md), [`docs/OPERACION.md`](docs/OPERACION.md) |

## Empezar en local

```bash
npm run install:ci          # instala dependencias (usa el lockfile)
npm run db:migrate:local    # crea el esquema local (la primera vez)
npm run dev                 # Vite en http://localhost:5173
```

- Requiere **Node 22.13 o superior**. En Windows usa **Git Bash o WSL** para los scripts de `scripts/`.
- Las credenciales de desarrollo van en `.dev.vars` en la raíz (nunca se sube a git). Los nombres de todas las
  variables están en [`docs/VARIABLES_DE_ENTORNO.md`](docs/VARIABLES_DE_ENTORNO.md); los valores se piden a quien
  administra el proyecto.
- Para **entrar** en local y para probar otros roles, ver
  [`docs/DESARROLLO_Y_PRUEBAS.md`](docs/DESARROLLO_Y_PRUEBAS.md#3-entrar-en-local). Estar autenticado no basta: hay
  que existir en la tabla `users` con un rol.

Antes de cualquier commit: `npm run lint`, `npx tsc --noEmit`, `node --test tests/*.test.mjs` y `npx vinext build`.

## Roles en una línea

| Rol | Etiqueta | Puede |
|---|---|---|
| `admin` | Admin / Directores | Todo, incluido aprobar presupuesto y administrar el equipo |
| `supervisor` | Digital Lead | Ver todo, crear y aprobar cambios, conectar cuentas |
| `analyst` | Digital Creator | Ver todo y **proponer**; no publica ni aprueba |
| `client` | Cliente | Ver su portafolio y sugerir |

El detalle está en [`docs/ROLES_Y_APROBACIONES.md`](docs/ROLES_Y_APROBACIONES.md).

## Cómo está armado

```
app/        pantallas (*.tsx) y rutas del servidor (app/api/*)
lib/        lógica de negocio; los módulos *-pura.ts no usan red ni entorno y se prueban solos
db/         esquema Drizzle      drizzle/   migraciones SQL (0000–0045)
servidor/   puente Cloudflare Workers ⇄ Node (SQLite y disco en el VPS)
worker/     entrada del Worker de Cloudflare
config/     definición de portafolios (clientes)
tests/      pruebas con node --test (sin mocks de plataformas)
docs/       documentación por tema e historial
```

Corre en **Cloudflare Workers** o en **Node/VPS** con el mismo código (ver
[`PROYECTO.md`](PROYECTO.md#el-runtime-dual-cloudflare-workers-y-nodevps)). Producción es el VPS: se despliega al
integrar un PR a `main`.

## Límites conocidos

Los límites vigentes de cada plataforma (qué campos no se pueden editar, qué exige permisos de la página, qué está
solo en lectura) están en [`docs/PLATAFORMAS.md`](docs/PLATAFORMAS.md). Los pendientes de producto, en
[`docs/FUNCIONES_DEL_PRODUCTO.md`](docs/FUNCIONES_DEL_PRODUCTO.md) y en el historial de rondas de
[`docs/historial/`](docs/historial/).
