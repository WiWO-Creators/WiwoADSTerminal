# WiWO.ADS

Sistema operativo de medios pagados de MGC/WiWO: unifica Google Ads y Meta
Ads (TikTok y LinkedIn ya están en el registro de plataformas, pero
desactivados) en un solo tablero. Permite crear y gestionar campañas reales
desde una sola interfaz, y tiene un asistente de IA (Claude) que lee las
campañas, analiza CSV de MetriQ y recomienda. Nada se activa ni gasta dinero
sin que una persona lo apruebe: ni el sistema ni el asistente ejecutan un
cambio por sí solos.

> Si vienes de la plantilla original de este repo (vinext-starter): este
> README la reemplaza. Lo que describía la plantilla —scripts, bindings de
> Cloudflare, headers de auth— sigue siendo cierto por debajo, pero acá se
> explica en términos del producto, no del framework.

## Empezar

```bash
npm run install:ci   # instala dependencias (usa el lockfile, no reintenta)
npm run dev          # levanta vite en http://localhost:5173
```

Node `>=22.13.0`. En Windows, usa Git Bash o WSL para los scripts en `scripts/`
(están escritos para Linux).

**Llevarlo a un servidor propio (VPS)**: ver
[`docs/DESPLIEGUE_VPS.md`](docs/DESPLIEGUE_VPS.md). El código corre en Node con
un puente (`servidor/`) que reemplaza a Cloudflare D1/R2 por SQLite y disco.

### Variables de entorno

Van en `.dev.vars` en la raíz del repo (nunca se sube a git). La lista
completa de nombres —sin valores— está en
[`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md#5-variables-de-entorno).
Pide los valores reales a alguien del equipo que ya tenga acceso.

### Iniciar sesión en local

En ChatGPT Sites, la identidad la inyecta el hosting por la cabecera
`oai-authenticated-user-email`; eso no existe corriendo `npm run dev` a pelo.
Dos formas de entrar en local:

- **Simulando esa cabecera** (se comporta como ChatGPT Sites):
  ```bash
  pip install playwright && playwright install chromium
  python scripts/open-in-chrome.py        # abre Chrome como techlab@mgcglobalgroup.com
  ```
- **Con Google** (`/acceso`): solo entran correos `@mgcglobalgroup.com`. La
  sesión es una cookie **firmada** (HMAC, vence a las 12 h), así que hace falta
  `SESSION_SECRET` u `OAUTH_TOKEN_KEY` en `.dev.vars`; sin ninguno no se abre
  sesión. Es la única puerta: el formulario de "escribe cualquier correo" se
  quitó porque dejaba entrar sin probar identidad.

En un servidor propio (VPS) la cabecera `oai-*` **se ignora** (cualquiera
podría mandarla): solo vale la cookie firmada.

Estar autenticado no basta: además hay que existir en la tabla `users` con un
rol asignado (ver [Roles](#roles-y-permisos)). Sin eso, la app muestra "no
estás en el equipo" aunque el login haya funcionado.

## Qué hay en la app

**Inicio** es un vestíbulo: una tarjeta por módulo, según el rol. La barra
lateral tiene dos grupos:

**Operación** (trabajo de campaña, día a día):
| Sección | Qué hace |
|---|---|
| **Clientes** | Cartera de clientes, cuentas conectadas por cliente, tabla de campañas/conjuntos/anuncios con pausar/activar y gestión (ver abajo) |
| **Creador de campañas** | Wizard paso a paso para crear campañas reales en Google y/o Meta a la vez: objetivo, presupuesto, segmentación (edad, género, país, radio en mapa, exclusiones, intereses de Meta, palabras clave de Google), pieza creativa (o publicación existente), vista previa por plataforma. Todo nace **pausado** |
| **Audiencias** | Dos pestañas. **Mensajería**: anuncios de Meta con botón de WhatsApp, llamada o mensaje, agrupados por campaña y conjunto, con pausa/activación en bloque. **Listas de contactos**: Customer Match de Google Ads (crear listas, subir contactos, adjuntarlas o excluirlas de un grupo de anuncios) |
| **Dashboard C-Level** | Lectura ejecutiva: inversión, resultados, estado de cartera y calidad del dato |

**Gestión** (administración de cuenta, no campaña):
| Sección | Qué hace |
|---|---|
| **Auditoría** | Bitácora de cada intento real de publicación (éxito o error), con el detalle de cada paso |
| **Cuentas** | Conexión de cuentas publicitarias por cliente. Incluye una tabla "Estado por cliente y plataforma": un cliente puede estar bien en Google y con problemas en Meta a la vez, y esto lo muestra por separado en vez de mezclar todos los clientes de una plataforma en un solo estado |
| **Equipo** (engranaje junto a tu ficha) | Alta/baja de personas, rol y qué clientes puede ver cada una (solo admin) |

Transversal a todo:

- **Puerta de cliente al entrar**: la primera vez en cada sesión de navegador,
  antes de ver nada más, hay que elegir un cliente (como el selector de
  cuenta de Google Ads Manager). Después de elegir, el resto de la app sigue
  igual — incluido poder volver a "Todos los clientes" desde el selector del
  encabezado.
- **Selector de cliente** solo en el encabezado: cambiar ahí cambia el cliente
  activo en toda la app y **no cambia de pantalla**. Ninguna vista debería
  tener su propio selector; si ves uno, es un bug.
- **Periodo** con calendario (presets y rango libre) donde cambia lo que se ve.
- **Actualizar** (encabezado): relee Windsor y reconstruye el catálogo de
  campañas. Se hace solo cada semana (la primera sesión admin/lead que abra la
  app pasados 7 días); no hay cron en el hosting original. Tras publicar, las
  campañas nuevas se suman al catálogo sin esperar.
- **Búsqueda ⌘K / Ctrl+K**: saltar a una sección o cambiar de cliente.
- **Tema claro/oscuro** con la paleta de MetriQ, y el Thinking Orb en todas las
  cargas.

### Asistente de IA

El orbe flotante (abajo a la derecha) abre un chat con **Claude Sonnet**
(`claude-sonnet-5`, configurable con `ANTHROPIC_MODEL`). Puede:

- Responder sobre campañas y clientes (gasto, CTR, resultados, costo por
  resultado) con datos reales, respetando el cliente activo y los permisos.
- Recomendar según cómo le fue a una campaña.
- Analizar un **CSV** (por ejemplo de MetriQ): las sumas y rankings los calcula
  el servidor en código, y al modelo solo le llegan el resumen y una muestra.

Regla de diseño: **el asistente nunca escribe en una plataforma.** Los cambios
llegan como tarjetas con botón (pausar/activar una campaña, o abrir el Creador
de campañas con el cliente elegido) y la persona decide; el cambio lo aplica el
mismo endpoint de siempre, con sus permisos y su bitácora. Antes de mostrar una
tarjeta se comprueba que la campaña exista en los datos reales.

Todavía no hay límite de consultas por persona (cada respuesta cuesta dinero).
Detalle en [`lib/asistente.ts`](lib/asistente.ts).

## Gestionar campañas ya publicadas

Desde **Clientes → tabla de campañas**, el ícono de ajustes junto a
pausar/activar abre un panel por campaña o conjunto:

- **Las dos plataformas**: presupuesto, nombre.
- **Solo Google** (Windsor no expone estas acciones para Meta): estrategia
  de puja (CPC manual / CPA objetivo / ROAS objetivo / maximizar
  conversiones-valor-clics / gasto objetivo), idiomas, horario de entrega
  (una ventana diaria por día marcado), palabras clave negativas,
  extensiones de anuncio (sitelinks, callouts, fragmentos estructurados,
  llamada).

## Roles y permisos

Definidos en [`lib/permisos.ts`](lib/permisos.ts). Dos ejes separados: el
**rol** define qué se puede hacer, los **clientes asignados** definen sobre
qué (vacío para admin/lead: ven todo).

| Rol | Puede |
|---|---|
| `admin` | Todo, incluida la administración del equipo |
| `lead` | Ve todos los clientes, aprueba cambios (publicar, pausar, gestionar) |
| `buyer` | Trabaja los clientes asignados, propone cambios |
| `analyst` | Solo lectura sobre los clientes asignados |
| `client` | Solo ve el rendimiento de su propio portafolio |

## Cómo está armado por dentro

```
app/                   vistas (Next.js App Router, "use client" casi todo)
  dashboard.tsx         shell: sidebar, header, switch de vistas
  asistente.tsx         orbe flotante y chat del asistente de IA
  paleta-comandos.tsx   búsqueda ⌘K
  mensajeria-view.tsx   anuncios de WhatsApp/llamada/mensaje de Meta
  constructor-view.tsx  wizard de creación de campañas
  gestionar-campana.tsx panel de gestión de campaña/conjunto ya publicado
  geo-map.tsx           mapa Leaflet de segmentación (país / radio / excluir)
  audiencias-view.tsx   Customer Match de Google
  clientes-view.tsx     cartera de clientes + ficha de cada uno
  api/                  rutas de servidor (lectura de sesión, escritura real)
lib/
  windsor.ts            TODA la lectura y escritura contra Windsor.ai
  constructor.ts        arma el plan de una campaña (buildPlan) sin ejecutarlo
  geo.ts                países segmentables + su id de Google verificado
  permisos.ts           roles y capacidades
  reglas.ts             motor de recomendaciones (fase 1, sin autonomía)
  asistente.ts          agente de IA: herramientas de lectura y propuestas
  asistente-csv.ts      perfil de un CSV calculado en código
  sesion-firmada.ts     cookie de sesión firmada (HMAC)
servidor/               puente para correr en Node/VPS (SQLite, disco, migrador)
db/                     esquema Drizzle + bindings de D1
docs/ARQUITECTURA.md    arquitectura técnica completa (lectura/escritura,
                        variables de entorno, esquema de base de datos)
```

**Regla de oro del proyecto**: nunca se adivina un campo o una acción de
Windsor. Antes de usar cualquiera, se verifica contra el MCP de Windsor
(`get_fields`, `list_actions`) o su documentación oficial. Pedir un campo
inexistente no da error — devuelve `null` en silencio, que es la peor forma
de fallar. Lo mismo aplica a cualquier id de segmentación (país, idioma,
extensión): si no hay una fuente verificada para un valor, la función
correspondiente queda fuera de la interfaz en vez de inventarlo.

## Límites conocidos

No son bugs — son huecos reales de la integración actual, documentados para
no tener que redescubrirlos:

- **Meta no tiene Customer Match / audiencias personalizadas** en esta app.
  Windsor no expone esa acción para el conector `facebook` (verificado
  directamente contra su `list_actions`, no es un supuesto). Conectarlo de
  verdad exigiría una integración aparte, directa contra la API de Meta
  (app propia en Meta for Developers, credenciales nuevas, revisión de
  permisos `ads_management`) — una decisión de infraestructura distinta a
  todo lo que corre hoy sobre Windsor.
- **Segmentación por ciudad o región** (Google y Meta) no está disponible:
  las dos exigen buscar un id mediante un endpoint de búsqueda geográfica
  que Windsor no expone. Sí está disponible por **país** y por **radio**
  (círculo en el mapa, con coordenadas crudas — eso no exige buscar nada).
- **Palabras clave negativas**: solo se pueden añadir desde acá, no quitar
  las que ya existen (eso todavía se hace en Google Ads directamente).
- **Borrar campañas**: no existe esa acción en Windsor; solo se pausan. El
  asistente lo sabe y no lo ofrece.
- **Número de WhatsApp de un anuncio**: Windsor no lo expone ni tiene acción
  para cambiarlo (el destino llega vacío). Solo se ve el tipo de botón. Cambiarlo
  en bloque exigiría una integración directa con la API de WhatsApp Business.
- **Edición de creativo de un anuncio ya publicado**: no implementada
  todavía, aunque Windsor sí expone la acción (`update_ad_creative` en
  Meta) — quedó fuera por alcance, no por imposibilidad.

## Seguir leyendo

[`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) tiene el detalle técnico
completo: cómo se lee cada dato de Windsor, el flujo exacto de publicación
de una campaña (encadenado de ids, auditoría, reintentos — o más bien, por
qué nunca reintenta), el motor de reglas, y el esquema completo de base de
datos.
