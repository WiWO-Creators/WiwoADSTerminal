# WiWO.ADS

Sistema operativo de medios pagados de MGC/WiWO: unifica Google Ads y Meta
Ads (TikTok y LinkedIn ya están en el registro de plataformas, pero
desactivados) en un solo tablero. Permite crear y gestionar campañas reales
desde una sola interfaz, y evalúa reglas de optimización que dejan
recomendaciones para que una persona las apruebe — nunca ejecuta un cambio de
presupuesto o una pausa por sí solo.

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

### Variables de entorno

Van en `.dev.vars` en la raíz del repo (nunca se sube a git). La lista
completa de nombres —sin valores— está en
[`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md#5-variables-de-entorno).
Pide los valores reales a alguien del equipo que ya tenga acceso.

### Iniciar sesión en local

En producción, la identidad la inyecta el hosting por la cabecera
`oai-authenticated-user-email` (ChatGPT Sites) — eso no existe corriendo
`npm run dev` a pelo. Dos formas de entrar en local:

- **Simulando esa cabecera** (recomendado, se comporta como producción):
  ```bash
  pip install playwright && playwright install chromium
  python scripts/open-in-chrome.py        # abre Chrome como techlab@mgcglobalgroup.com
  ```
- **Con Google** (`/acceso`): funciona siempre, pero solo entran correos
  `@mgcglobalgroup.com`.

Es la única puerta: el formulario de "escribe cualquier correo" que existía
en `/acceso` se quitó, porque dejaba entrar sin probar identidad.

Estar autenticado no basta: además hay que existir en la tabla `users` con un
rol asignado (ver [Roles](#roles-y-permisos)). Sin eso, la app muestra "no
estás en el equipo" aunque el login haya funcionado.

## Qué hay en la app

La navegación tiene dos grupos, en el sidebar:

**Operación** (trabajo de campaña, día a día):
| Sección | Qué hace |
|---|---|
| **Clientes** | Cartera de clientes, cuentas conectadas por cliente, tabla de campañas/conjuntos/anuncios con pausar/activar y gestión (ver abajo) |
| **Constructor** | Wizard paso a paso para crear campañas reales en Google y/o Meta a la vez: objetivo, presupuesto, segmentación (edad, género, país, radio en mapa, exclusiones, intereses de Meta, palabras clave de Google), pieza creativa, vista previa por plataforma. Todo nace **pausado** |
| **Sala de control** | Resumen ejecutivo de la cartera completa |
| **Salud de medición** | Diagnóstico de calidad de datos por cliente (píxeles, conversiones, cuentas sin sincronizar) |
| **Audiencias** | Customer Match de Google Ads: crear listas, subir contactos, adjuntarlas o excluirlas de un grupo de anuncios. Meta no tiene equivalente todavía — ver [Límites conocidos](#límites-conocidos) |

**Gestión** (administración de cuenta, no campaña):
| Sección | Qué hace |
|---|---|
| **Publicaciones** | Bitácora de cada intento real de publicación (éxito o error), con el detalle completo de cada paso |
| **Cuentas** | Conexión de cuentas publicitarias por cliente |
| **Equipo** | Alta/baja de personas, rol y qué clientes puede ver cada una (solo admin) |
| **Ajustes** | Preferencias personales: vista inicial, rango de fechas por defecto, tema |

El selector de cliente vive **solo en el navbar superior** — cambiar ahí
cambia el cliente activo en toda la app (Clientes, Salud de medición,
Constructor). Ninguna vista debería tener su propio selector aparte; si ves
uno, es un bug.

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
- **Edición de creativo de un anuncio ya publicado**: no implementada
  todavía, aunque Windsor sí expone la acción (`update_ad_creative` en
  Meta) — quedó fuera por alcance, no por imposibilidad.

## Seguir leyendo

[`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) tiene el detalle técnico
completo: cómo se lee cada dato de Windsor, el flujo exacto de publicación
de una campaña (encadenado de ids, auditoría, reintentos — o más bien, por
qué nunca reintenta), el motor de reglas, y el esquema completo de base de
datos.
