# WiWO.ADS — arquitectura y funcionamiento

> Este documento es la **visión de conjunto**: qué es WiWO.ADS, cómo está armado y cómo se conectan sus piezas.
> Cada tema tiene su propio documento en [`docs/`](docs/README.md); aquí se resume y se enlaza.
> Última actualización: 2026-10-14. Si algo de aquí contradice al código, manda el código.

Para ir directo a lo que buscas:

| Quiero saber… | Documento |
|---|---|
| Qué hace cada pantalla y función | [`docs/FUNCIONES_DEL_PRODUCTO.md`](docs/FUNCIONES_DEL_PRODUCTO.md) |
| Qué se puede leer, crear y editar en Meta, Google, LinkedIn y TikTok | [`docs/PLATAFORMAS.md`](docs/PLATAFORMAS.md) |
| Quién puede hacer qué y cómo se aprueba un cambio | [`docs/ROLES_Y_APROBACIONES.md`](docs/ROLES_Y_APROBACIONES.md) |
| Cómo levantarlo y probarlo en local | [`docs/DESARROLLO_Y_PRUEBAS.md`](docs/DESARROLLO_Y_PRUEBAS.md) |
| Cómo se despliega y se opera en el servidor | [`docs/DESPLIEGUE_VPS.md`](docs/DESPLIEGUE_VPS.md) |
| Qué variables de entorno hay y qué pasa si se filtran | [`docs/VARIABLES_DE_ENTORNO.md`](docs/VARIABLES_DE_ENTORNO.md) |
| Cómo se lee y se escribe con Windsor (caché, unidades, encadenado de pasos) | [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) |
| Estado de cada cliente y qué falta por conectar | [`docs/ESTADO_POR_CLIENTE.md`](docs/ESTADO_POR_CLIENTE.md) |
| Cómo llegamos hasta aquí | [`docs/historial/`](docs/historial/) |

## Qué es

WiWO.ADS es el panel interno con el que el equipo de las agencias MGC y WiWO arma, revisa, publica y audita
campañas de **Google Ads**, **Meta Ads** (Facebook + Instagram) y **LinkedIn Ads** para sus clientes, y sigue el
rendimiento de esas cuentas. **TikTok Ads** hoy solo se lee; su integración directa está preparada y a la espera de
que TikTok apruebe la aplicación. Sirve para **gestionar campañas y ver información**: los reportes mensuales son de
otra herramienta (wiwometriq). No es un producto que use el cliente final: lo usa el equipo (administradores,
supervisores, analistas) y, con una vista recortada a su propio portafolio, el cliente.

Dos decisiones de diseño explican casi todo lo demás:

1. **Nunca se escribe en una plataforma real a ciegas.** Crear o cambiar algo
   siempre pasa por un paso de simulación explícito (el Constructor arma un
   plan y lo muestra) o por una propuesta que otra persona con permiso debe
   aprobar. El único camino para publicar una campaña real es el Constructor,
   con una persona revisando cada campo.
2. **Dos vías hacia las plataformas.** [Windsor.ai](https://windsor.ai) sigue siendo la vía por defecto para
   **leer** y para la mayoría de **pausar/activar**: normaliza los datos de todas las plataformas en un esquema común.
   Para lo que Windsor no cubre (crear estructuras avanzadas, editar contenido, eliminar, leer lo recién creado) y
   como respaldo, la app habla **directo** con las APIs de Meta, Google Ads y LinkedIn, usando una **conexión del
   equipo** (nadie del equipo inicia sesión en las plataformas). Ver [`docs/PLATAFORMAS.md`](docs/PLATAFORMAS.md).
3. **Nada nace pausado.** Desde el 2026-10-06 lo que se crea nace activo: la revisión es la aprobación previa, no
   una pausa posterior (LinkedIn nace en borrador). Ver [`docs/ROLES_Y_APROBACIONES.md`](docs/ROLES_Y_APROBACIONES.md).

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, React Server Components) |
| Runtime de build/dev | [vinext](https://www.npmjs.com/package/vinext) sobre **Vite 8** — no `next build`/`next dev` |
| Runtime de producción | Doble: Cloudflare Workers **o** Node.js puro (ver más abajo) |
| Base de datos | SQLite vía **D1** (binding de Cloudflare) — el mismo esquema corre embebido con `better-sqlite3` cuando el runtime es Node |
| Archivos/creativos | R2 (Cloudflare) en Workers; carpeta en disco cuando el runtime es Node |
| ORM / migraciones | Drizzle (`db/schema.ts`, SQL crudo versionado en `drizzle/*.sql`) |
| UI | React 19, Tailwind CSS 4, componentes de `shadcn`/Radix (`components/ui`), Recharts, Leaflet (mapa de segmentación) |
| Archivos de oficina | `pptxgenjs` (exporta la simulación a .pptx, cargada solo al pulsar el botón) y `read-excel-file` (lee .xlsx en Audiencias/Lookalike, en un web worker) |
| IA | SDK de Anthropic (`@anthropic-ai/sdk`), modelo `claude-sonnet-5` por defecto (se cambia con `ANTHROPIC_MODEL`), con `web_search` como server tool; Gemini solo para variantes de imagen |
| Integración de ads | Windsor.ai (lectura y gran parte de la escritura) + APIs directas de Meta, Google Ads y LinkedIn |
| Autenticación | OAuth de Google (dominio corporativo) + cabeceras de identidad de ChatGPT Sites, según dónde corra |
| Despliegue | GitHub Actions → SSH al VPS → PM2 |

## El runtime dual: Cloudflare Workers y Node/VPS

Esta es la pieza más particular del proyecto. La app hoy corre en un **VPS
propio** (`server.wiwo.center`), no en Cloudflare — pero el código está
escrito contra las APIs de Cloudflare Workers (`cloudflare:workers`, `env.DB`
como D1, `env.MEDIA` como R2) porque así nació con el starter. En vez de
reescribir todo ese código para Node, hay un **puente** en `servidor/` que
sustituye esas APIs:

- `servidor/registrar.mjs` — se carga con
  `NODE_OPTIONS='--import .../servidor/registrar.mjs'` y registra un *loader*
  de módulos de Node.
- `servidor/hooks.mjs` — ese loader intercepta cualquier `import` de
  `cloudflare:workers` (que solo existe de verdad dentro de un Worker) y lo
  redirige a `servidor/cloudflare-workers.mjs`.
- `servidor/cloudflare-workers.mjs` — expone un `env` compatible: `env.DB` es
  SQLite real en disco (`servidor/d1.mjs`, con `better-sqlite3`, modo WAL —
  un solo proceso puede escribir, por eso el deploy nunca usa el modo
  "cluster" de PM2) y `env.MEDIA` es una carpeta en disco (`servidor/r2.mjs`)
  en vez de un bucket R2. También fija `env.WIWO_RUNTIME = "node"`, que el
  código de autenticación usa para saber que las cabeceras de ChatGPT Sites
  no son de fiar ahí (ver más abajo).
- `servidor/migrar.mjs` — aplica en orden los `.sql` de `drizzle/` sobre ese
  SQLite, anotando cada uno en una tabla `_migraciones` (idempotente).

El resultado: el mismo código fuente corre sin cambios en local con
Miniflare/Wrangler (D1 y R2 emulados) o en el VPS con SQLite y disco reales.
`npm run dev` usa el primer camino; el deploy de producción usa el segundo.

## Autenticación e identidad

Hay tres formas de resolver "quién es esta persona", según el contexto
(`app/chatgpt-auth.ts`):

1. **Cabeceras de ChatGPT Sites** (`oai-authenticated-user-*`) — cuando la
   app corre embebida ahí, la plataforma las agrega y son de fiar. Se
   ignoran explícitamente cuando `env.WIWO_RUNTIME === "node"` (VPS): en un
   servidor propio esas cabeceras las podría mandar cualquiera.
2. **Cookie propia firmada** (`wiwo-dev-user`) — la deja `/acceso` tras un
   login real con **Google OAuth + PKCE**, restringido al dominio corporativo.
   Es el camino real de producción en el VPS y el que se usa en desarrollo
   local (con un script que simula las cabeceras de ChatGPT Sites para
   probar ese otro camino sin desplegar). La cookie se firma con HMAC
   (`lib/sesion-firmada.ts`) usando `SESSION_SECRET`/`OAUTH_TOKEN_KEY`.
3. Sin ninguna de las dos → sin sesión, se redirige a `/acceso`.

Encima de "quién es" hay una segunda pregunta que resuelve
`lib/equipo.ts::resolveActor`: si esa persona *pertenece al equipo*. No hay
registro abierto — un correo desconocido no entra aunque autentique bien con
Google. Hay una única puerta de arranque en frío: los correos listados en
`OAUTH_ADMIN_EMAILS` se auto-provisionan como administrador la primera vez
que entran (si no, nadie podría dar de alta a la primera persona). El resto
entra solo si fue invitado desde la pantalla Equipo.

`app/sesion.ts` junta ambas preguntas en un único `getSession()`/
`requireSession()` que el resto de la app usa siempre — nunca se vuelve a
leer una lista de correos suelta en otro lado.

## Roles y permisos (`lib/permisos.ts`)

Dos ejes independientes:

- **Rol** — qué puede hacer: `admin`, `supervisor`, `analyst`, `client`.
- **Alcance** — sobre qué clientes puede hacerlo (`portfolioIds`, o "todos"
  si el rol trae la capability `ver_todos_los_clientes`).

| Rol | Ve | Crea/publica campañas | Aprueba cambios | Equipo |
|---|---|---|---|---|
| `admin` | Todos los clientes | Sí | Sí | Administra a cualquiera |
| `supervisor` | Todos los clientes | Sí | Sí | Invita analista/cliente, no modifica a quien ya está |
| `analyst` | Todos los clientes | No (solo *sugiere*, vía el asistente) | No | Invita clientes, da de alta clientes nuevos con su portafolio |
| `client` | Su propio portafolio | No (solo sugiere) | No | — |

`can(actor, capability)` es el único punto de verdad para autorizar una
escritura real; `roleCan(role, capability)` es su versión sin `Actor`
completo, solo para decisiones de interfaz (mostrar/ocultar algo).

En pantalla los roles se llaman Admin/Directores, Digital Lead, Digital Creator y Cliente. Las capacidades
completas (incluida la de aprobar presupuesto, que es solo de admin), el flujo de solicitudes y las bitácoras están
en [`docs/ROLES_Y_APROBACIONES.md`](docs/ROLES_Y_APROBACIONES.md).

## Modelo de datos

SQLite con el esquema versionado en `drizzle/0000...sql` a `0045...sql`
(aplicados en orden, tanto en local como en producción, vía
`npm run db:migrate:local` o `servidor/migrar.mjs`). Las migraciones recientes incluyen también datos de
clientes y del equipo (por ejemplo cargos y roles). Las tablas centrales
(`db/schema.ts`, Drizzle):

- `users` / `user_portfolios` — equipo y qué portafolio ve cada quien.
- `integration_connections` / `integration_accounts` — credenciales OAuth
  cifradas hacia Windsor y las cuentas de Google/Meta que cada conexión trae.
- `account_metrics_daily` — métricas diarias ya normalizadas (gasto,
  impresiones, clics, conversiones) por cuenta, para no golpear a Windsor en
  cada carga de pantalla.
- `metric_sync_runs` — bitácora de cada sincronización de métricas.
- `geo_targets` — catálogo propio de regiones/ciudades reales de Google Ads
  (demasiadas filas para vivir como constante en código), usado para resolver
  el id real de segmentación geográfica que pide el Constructor.
- `decisions` / `audit_events` — cola de decisiones sugeridas y bitácora de
  auditoría de cada acción real ejecutada.
- `oauth_sessions` — estado de PKCE en vuelo durante el login de Google.
- `portfolios` / `portfolio_accounts` — clientes y las cuentas de cada plataforma que les
  pertenecen, con sus metas y KPI (0013, 0019), GTM (0021), presupuesto mensual (0022), GA4
  (0023) y segmentos (0024); es lo que edita la ficha del cliente, además de
  `config/portafolios.json`.
- `ejecuciones` — bitácora de cada escritura real (quién, qué pasos, resultado); de ahí sale
  también la columna Creador.
- `decisions` guarda además las sugerencias por cliente (0020).

Tablas que **solo existen como SQL** (no están en `db/schema.ts` y se usan con SQL crudo): `portfolios` y
`portfolio_accounts`, `ejecuciones` (0011), `account_pixels` (0017), `asistente_memoria` (0030),
`solicitudes` (0031), `reglas_automaticas` (0033) y `auditoria` (0043). `app_meta` es una tabla clave/valor para
cachés y banderas, y guarda también quién conectó Google y LinkedIn para el equipo.

**Ojo con el journal:** `drizzle/meta/_journal.json` solo llega a la 0017 (18 entradas). Las migraciones
0018–0045 existen como SQL y las aplica `servidor/migrar.mjs` (lee la carpeta, no el journal),
pero `drizzle-kit` no las conoce.

Los tokens OAuth se guardan **cifrados** (AES-GCM, formato `v1.<iv>.<cifrado>`) con `OAUTH_TOKEN_KEY`.

Los **portafolios** (qué es cada cliente, sus cuentas conectadas) no viven
solo en SQLite: hay una capa en `config/portafolios.json` + `lib/portafolios.ts`
/ `lib/portafolios-store.ts` que los define y los cruza con las cuentas reales
de Windsor.

## Integración con las plataformas de ads (Windsor.ai)

`lib/windsor.ts` es la capa de **lectura**: pega contra
`https://connectors.windsor.ai`, un conector por plataforma (nunca el
conector `"all"`, que mezclaría ads con tráfico orgánico de GA4 y ensuciaría
cualquier comparación). Tiene reintentos, timeouts largos para lecturas en
frío (hasta 280 s para reconstruir el catálogo completo) y cachés en D1 con
TTL propio por tipo de dato (15 min para métricas, 24 h para el catálogo).

La **escritura** por Windsor (crear/pausar campañas, conjuntos, anuncios) usa las
"write actions" que Windsor expone sobre `google_ads` y `facebook` —
`executeWindsorAction` detecta incluso los casos en los que Windsor responde
HTTP 200 pero con un error dentro del cuerpo, para no reportar éxito cuando
no lo hay, y **nunca reintenta** una escritura. Lo que Windsor no puede hacer se hace por las APIs directas
(`lib/meta-nativo.ts`, `lib/google-ads-nativo.ts`, `lib/linkedin-nativo.ts`), siempre con la lectura de vuelta como
verificación. La lectura de Windsor va **retrasada** respecto a las escrituras: para comprobar un cambio hay que
mirar la plataforma real. Qué hace cada vía en cada plataforma: [`docs/PLATAFORMAS.md`](docs/PLATAFORMAS.md).

## El Constructor de campañas (`lib/constructor.ts` + `app/constructor-view.tsx`)

Un formulario único que sigue la estructura de Meta a propósito (Campaña →
Conjunto de anuncios → Anuncio, con las mismas secciones dentro de cada una)
porque, entre las plataformas activas, es la que declara más detalle — ese
detalle cubre lo que Google también necesita sin inventarle un campo aparte.
Donde una plataforma no tiene equivalente real (transparencia de anuncios y
seguridad de marca en Meta; edad/género en Google), la sección queda marcada
como informativa o "solo esa plataforma", nunca fingiendo que aplica a las
dos.

Funciona en dos fases estrictamente separadas:

1. **Simular** (`buildPlan`, endpoint `POST /api/constructor`) — traduce el
   borrador a los pasos exactos que se ejecutarían, con los nombres de
   parámetro reales de las acciones de escritura de Windsor (no inventados),
   y valida límites propios de cada plataforma (`validateDraft`). No toca
   ninguna plataforma.
2. **Ejecutar** (`POST /api/constructor/ejecutar`) — solo tras aprobación
   explícita, vuelve a armar el plan del lado del servidor (lo que se ve en
   pantalla es lo que se ejecuta) y sí escribe, por Windsor o por las APIs directas. Nada nace pausado: la
   revisión (o quien aprueba) es el control previo; si un paso falla a mitad, la campaña queda marcada como
   incompleta y pausada. Además del formulario hay creación en **Google** (Búsqueda estructurada, Performance Max y
   Display), **Meta** (incluidos formularios instantáneos) y **LinkedIn** (grupo y campaña en borrador).

La interfaz muestra **una parte a la vez** (Campaña, Conjunto de anuncios,
Anuncio), con "Siguiente" y "Atrás" y el riel de la izquierda para saltar a
cualquiera; cada sección dentro de una parte se abre y cierra por su cuenta y
muestra un check cuando ya tiene lo mínimo puesto. Las partes ocultas siguen
montadas (para no perder lo llenado) y se avisa a los mapas que recalculen su
tamaño al cambiar de parte. Desde "+ Añadir conjunto/anuncio" se parte por lo
que falta. Antes (2026-09-28) era un solo scroll con todo junto; se cambió por
pedido del equipo. Incluye una vista previa en vivo fiel a cómo se ve
cada plataforma (colores y tipografía reales de Google/Meta, no un recuadro
genérico).

## Editar, impulsar y desglosar lo ya publicado

Todo lo que ya existe en una plataforma se ve y se cambia desde un **editor a pantalla
completa** (`app/detalle-entidad.tsx`, con el ojo o el lápiz de cada fila de Anuncios, o
desde una sugerencia): el árbol Campaña → Conjunto → Anuncio de la cuenta ocupa todo el
costado izquierdo (como en Meta), arriba van las migas de pan y las pestañas **Editar** y
**Desglose**, y a la derecha la vista previa. En **Editar** va el formulario con los campos
que se pueden cambiar y, debajo, la **configuración completa** que hoy tiene la entidad
(editable o no) de campaña, conjunto y anuncio. Cerrar (X o Esc) o saltar a otra entidad
con cambios sin aplicar pregunta antes: seguir editando, descartar o "Revisar y confirmar"
(simula el cambio). Mismos guardarraíles que el
Constructor: simular antes de aplicar, el servidor vuelve a leer y a armar el plan
(lo aprobado en pantalla es lo que corre), alcance por cliente, bitácora en
`ejecuciones` y verificación posterior contra la plataforma (el «ok» de Windsor ya
confirmó una vez algo que nunca existió).

- **Lectura completa** (`lib/detalle-entidad.ts`, `detalle-entidad-store.ts`): campañas,
  conjuntos y anuncios con presupuesto, puja, fechas, segmentación completa, textos,
  imágenes, URLs y botón. Ruta `GET /api/entidades/detalle`.
- **Edición** (`lib/edicion-plan.ts`, `edicion-servicio.ts`, `edicion-ejecutar.ts`,
  `app/editar-entidad.tsx`, ruta `POST /api/entidades/editar`): solo viaja lo que cambió,
  con un diff antes/después. Meta: nombre, presupuesto, puja, término, límite de gasto,
  segmentación (edad, género, países, redes) y todo el contenido del anuncio. Google:
  nombre, presupuesto, CPC, palabras clave y el contenido del anuncio de búsqueda.
  `update_adset` de Meta REEMPLAZA la segmentación entera: el plan parte siempre de la
  segmentación cruda actual y solo toca las claves pedidas. Editar ya no pausa lo
  editado: pausar es una acción explícita (decisión del 2026-10-06; antes, el 24-09-2026, todo cambio que no fuera un
  renombre dejaba la campaña pausada). Puja, idiomas, horario,
  negativas y extensiones se cambian con «Más opciones» (`gestionar-campana.tsx`).
- **Botones (CTA)** (`lib/cta.ts`): los más de 70 que acepta Meta, en español, comparados
  contra el enum real de Windsor en un test.
- **Vía nativa de Google** (`lib/google-ads-nativo.ts`, `accesoNativoGoogle` en
  `integration-store.ts`): Windsor no tiene ninguna acción para editar un anuncio existente
  ni entrega lo pausado o recién creado por REST, pero la API de Google sí. Se lee con GAQL
  y se edita el anuncio de búsqueda EN el mismo anuncio (`AdService.mutate`, con
  `validateOnly` para simular contra la cuenta real). Requiere que quien edita tenga
  conectada su cuenta de Google en Integraciones; sin ella se cae a Windsor y se avisa.
- **Impulsar un anuncio ya publicado** (`boost_post`): botón «Impulsar» en cada anuncio de
  Meta y selector en el Constructor. Se reutiliza la misma publicación (conserva reacciones
  y comentarios). Un anuncio armado desde una publicación existente se reconoce por
  `source_instagram_media_id`, y su contenido no se edita desde el anuncio (límite de Meta).
  Dentro de una campaña o conjunto ya existente solo se admite si Meta lo permite (campaña
  de interacción, conjunto `ON_POST`/`POST_ENGAGEMENT` de la misma página): lo decide el
  servidor con datos reales (`lib/boost-compat.ts`) y, si no se puede, bloquea con el motivo
  en vez de crear en silencio un anuncio distinto.
- **Desglose** (`lib/desglose.ts`, ruta `GET /api/entidades/desglose`): por edad, género,
  red, posición, dispositivo y región en Meta; por dispositivo, red, día y hora en Google.
  Los desgloses de Meta no admiten campos «omni» (Windsor responde 400): se usan las compras
  directas, que pueden diferir un poco del total de la tabla principal.
- **Comparación de periodos** (`lib/comparacion.ts`): en la tabla, contra el periodo
  anterior del MISMO largo. Cada columna declara si subir es bueno o malo (el costo que
  sube es malo, el gasto es neutro) y un conteo con base menor a 5 no se compara.

### KPIs por cliente

Qué es «buen rendimiento» depende del cliente: uno de awareness se juzga por alcance y CPM,
no por CPA. Cada cliente define su **KPI principal** (leads, ventas, tráfico, alcance o
mensajes) y metas de CPA, ROAS, CPM, CTR mínimo y frecuencia máxima (`lib/kpis-cliente.ts`,
migración 0019, ficha del cliente). El KPI decide qué columnas muestra su tabla si nadie
eligió otras, y alimenta las señales del asistente. Awareness y tráfico nunca se juzgan por
conversiones (`seMidePorResultados` en `lib/contexto-cliente.ts`).

## Sugerencias por cliente (`lib/sugerencias.ts`, `sugerencias-store.ts`, `app/sugerencias-cliente.tsx`)

Cada cliente tiene, arriba de su tabla de campañas, un panel de **Sugerencias**
automáticas por rendimiento. Salen de las mismas señales que usa el asistente
(`senalesDeCampana`, con las metas y el KPI de ese cliente, y la comparación con el
periodo anterior): gasto sin resultados, CPA o ROAS fuera de meta, resultados que caen,
fatiga (frecuencia), CPM o CTR fuera de meta, campañas activas que no entregan y
oportunidades de escalar. Awareness y tráfico nunca se juzgan por conversiones. Cada una
lleva la cifra que la respalda y, cuando corresponde, el cambio exacto: pausar, o subir
20 % / bajar 15 % el presupuesto diario (si el presupuesto vive en los conjuntos, queda
como "revisar", sin inventar un monto).

- Se guardan en la tabla `decisions` (migración 0020 agrega cliente, plataforma, cuenta,
  campaña y `action_json`). El id es determinístico (regla + campaña + día): reevaluar no
  duplica. Se evalúan solas al abrir el cliente (cada 6 h como máximo) y tras
  "Actualizar datos"; "Reevaluar" fuerza una lectura.
- **Solo administrador o supervisor** (`aprobar_cambios`) puede aprobar, descartar o
  posponer; el resto las ve. La revisión global es `app/sugerencias-tinder.tsx`: una tarjeta
  a la vez (✕ descartar, ⏱ posponer, ✓ aprobar, o arrastrarla), accesible desde las vistas
  secundarias. La ruta `/api/dashboard` también exige ese permiso ahora.
- Aprobar **no aplica nada por sí solo**: "Aprobar y pausar" pide confirmación y usa la
  ruta de estado; "Aprobar y abrir en el editor" abre la campaña con el presupuesto ya
  cargado para revisarlo y aplicarlo con los guardarraíles del editor (que pausa lo
  editado, regla del equipo). Un ajuste de presupuesto aprobado bloquea otro para la
  misma campaña durante 48 h.

## Google Tag Manager por cliente (`lib/gtm.ts`)

Cada cliente puede estar marcado **Cuenta con GTM** (con su contenedor `GTM-XXXXXXX`),
**NO cuenta con GTM** o **Sin verificar** (por defecto), desde la ficha del cliente
(migración 0021). Solo «NO cuenta con GTM» genera aviso: una alerta en el panel de
Alertas ("NO cuenta con GTM…", severidad alta, sin plataforma porque es del cliente
entero) y un banner rojo en su pantalla. «Sin verificar» no alerta: no se afirma que falte
algo que nadie confirmó. La ruta de alertas solo devuelve clientes dentro del alcance de
quien pregunta, porque estas alertas no dependen de campañas y el snapshot no las filtra.

## Pantalla del cliente: presupuesto, distribución, medición y creador

Arriba de la tabla de campañas de cada cliente (y también en su Dashboard C-Level), en este orden:
aviso de GTM, resumen, **presupuesto del mes**, **distribución del gasto**, **salud de medición**
y **sugerencias**. Cada tarjeta se oculta sola si no tiene con qué mostrarse: nunca hay una
métrica vacía.

- **Presupuesto del mes** (`lib/presupuesto.ts`, `/api/presupuesto`, migración 0022): el cliente
  tiene un presupuesto mensual (monto + moneda, en la ficha). Se muestra cuánto se gastó, cuánto
  queda, cuánto se puede gastar por día sin pasarse y cómo cerraría el mes al ritmo actual. El
  gasto es el del MES en curso aunque la tabla mire otro periodo, y solo de la moneda del
  presupuesto. Estados: en ritmo, va a pasarse (proyección +10 %), va corto (−20 %, con 7+ días),
  casi agotado, excedido. Un ritmo fuera de lo acordado genera una sugerencia del cliente, y el
  asistente lo recibe en `resumen_cliente` (`presupuesto_mensual`).
- **Distribución del gasto** (`lib/distribucion.ts`): adónde se fue el dinero del periodo por
  plataforma, por objetivo (con el resultado propio de cada objetivo y su costo, que no se suma
  entre objetivos) y por campaña. Una sola moneda; si hay otras, lo avisa.
- **Columna Creador** (`lib/creadores.ts`, `/api/creadores`): quién publicó cada campaña, conjunto
  y anuncio, leído de la bitácora de `ejecuciones`. Solo cuentan los pasos de CREACIÓN: agregar un
  conjunto a una campaña ajena no te hace su creador. Lo creado directo en Google/Meta no tiene
  autor conocido y se ve «—» (ninguna plataforma lo entrega por Windsor). No expone correos.
- **Salud de medición** (`lib/medicion.ts`, `medicion-store.ts`, `/api/medicion`, migración 0023):
  con el ID de la propiedad de GA4 del cliente (ficha), lee sus eventos por Windsor
  (`googleanalytics4`; `conversions` = eventos clave) y detecta: eventos de navegación marcados como
  clave (`page_view`, `user_engagement`… inflan las conversiones y, si se importan a Google Ads,
  lo que se optimiza), interacciones dudosas como clave, leads que no cuentan, leads que dejaron
  de llegar esta semana, el mismo evento escrito de dos maneras y propiedad sin datos. Cada
  problema también entra a las Sugerencias del cliente. Se corrige en GTM/GA4; desde acá solo se vigila.

## Simulador (`lib/simulador.ts`, `app/simulador-view.tsx`)

Entrada «Simulador» del menú. Con monto, días, número de campañas, objetivo y reparto entre
plataformas, proyecta impresiones, clics y resultados con el rendimiento de los últimos 90 días del
MISMO cliente (`/api/simulador` entrega el historial; la proyección se calcula en el navegador, así
cambia al instante). Da un **rango** (del costo por resultado real entre campañas), no una cifra;
dice la confianza (alta/media/baja/sin historial), avisa cuando se simula mucho más de lo que se
invertía (rendimientos decrecientes) y nunca inventa cifras donde no hay historial. Exporta una
presentación `.pptx` de 3 láminas (`pptxgenjs`, cargada solo al pulsar el botón); Google Slides la abre
desde Drive con «Abrir con». No escribe nada en ninguna plataforma.

## Audiencias: cargar una base de clientes (`lib/contactos.ts`, `app/audiencias-view.tsx`)

Se sube un CSV (coma, punto y coma o tabulación, con o sin encabezados) o se pega una lista. Se
valida en el navegador: correos, teléfonos (E.164; Chile por defecto, otros países con «+»),
duplicados e inválidos, con ejemplos enmascarados. Después:

- **Google (Customer Match):** crear la lista y subir en lotes de 10.000 vía Windsor, que normaliza y
  hashea (SHA-256). Exige marcar que hay autorización de los titulares y confirmar; no hay forma de
  deshacer desde acá. **Los contactos nunca se guardan**: la bitácora registra solo cuántos
  (`paramsParaBitacora`). Antes de esta corrección la bitácora de edición guardaba los `params` tal
  cual, o sea los contactos.
- **Meta:** Windsor no tiene acciones de audiencias personalizadas ni lookalike. Se descarga un CSV con
  `email,phone` ya hasheados (SHA-256) para subirlo en el Administrador de anuncios, donde se crea el
  público similar.

## El asistente de IA (`lib/asistente.ts` + `app/api/asistente/route.ts`)

Chat con Claude que ayuda a leer campañas y a armar propuestas, gobernado por
una única regla de diseño: **el modelo nunca escribe en una plataforma por su
cuenta.** Sus herramientas:

- `listar_clientes`, `buscar_campanas` — solo lectura.
- `resumen_cliente`, `detalle_campana`, `desglose_campana` — solo lectura. El resumen
  (`lib/contexto-cliente.ts`) trae KPIs, comparación con el periodo anterior, las metas del
  cliente y **señales calculadas por código** con las cifras que las respaldan (CPA sobre la
  meta, frecuencia alta, resultados que caen, oportunidades de escalar…): el modelo cita esos
  números, no hace cuentas ni decide umbrales. El detalle trae la configuración y el contenido
  reales; el desglose, dónde se va el dinero por segmento.
- `proponer_edicion`, `proponer_impulso` — dejan una tarjeta con el antes y el después (o un
  botón que abre el Constructor con la publicación cargada). Al aplicar, el servidor vuelve a
  validar todo con los mismos permisos y bitácora que el editor: el modelo nunca escribe.
- `proponer_cambio` — para pausar/activar algo que ya existe: deja una
  propuesta en pantalla (tarjeta con botón), la persona decide y el cambio lo
  aplica el endpoint real de siempre (`/api/anuncios/estado`), con sus
  propios permisos y bitácora.
- `abrir_constructor` — para una campaña nueva: precarga el Constructor
  (objetivo, plataformas, segmentación, contenido del anuncio cuando ya sabe
  qué se promociona) para que la persona lo revise y publique ella misma.
  Nunca crea nada real directamente.
- `web_search` (server tool de Anthropic) — solo para contexto público del
  negocio del cliente (a qué se dedica, su momento) o para encontrar su sitio
  oficial cuando falta la URL; nunca para datos operativos, que siempre salen
  de las herramientas propias.

Hubo una herramienta que sí creaba campañas reales directamente
(`crear_campana_real`) y se quitó: en una prueba real, Windsor confirmó como
creada una campaña que nunca llegó a existir en la cuenta real, y el modelo
reportó éxito sin que lo hubiera. Mientras eso no esté resuelto del lado de
Windsor, el único camino para crear algo real es el Constructor con revisión
humana.

## Estructura de carpetas

```
app/                    Next.js App Router — páginas, vistas de cliente y rutas API
  api/                  Endpoints REST (uno por carpeta, route.ts)
  <vista>.tsx           Cada pantalla grande del dashboard (dashboard, clientes,
                         constructor, equipo, integraciones, ejecuciones...)
  chatgpt-auth.ts        Resolución de identidad (ver Autenticación)
  sesion.ts              getSession()/requireSession() — punto único de sesión
lib/                    Lógica de negocio pura, sin JSX — el "backend" de la app
  permisos.ts            Roles y capabilities
  equipo.ts               Alta/consulta de personas del equipo
  windsor.ts               Lectura desde Windsor.ai
  constructor.ts            Simulación de campañas
  constructor-ejecutar.ts     Ejecución real de campañas
  asistente.ts                Asistente de IA
  dashboard-store.ts, performance-store.ts, portafolios-store.ts, ...
                              "Stores" que arman los snapshots de cada pantalla
db/                     Esquema Drizzle (schema.ts) + acceso a la conexión (index.ts)
drizzle/                Migraciones SQL versionadas (0000–0045), aplicadas en orden
docs/                   Documentación por tema (índice en docs/README.md) e historial
public/deck/            Fondos y logos (mgc, wiwo) para las láminas exportadas
servidor/               Puente Cloudflare Workers ⇄ Node (ver runtime dual)
scripts/                Scripts de desarrollo (build verificado, entorno CI,
                         abrir Chrome simulando ChatGPT Sites, semillas de datos)
config/                 Definición de portafolios/clientes
components/ui/          Componentes shadcn/Radix genéricos, sin lógica de negocio
tests/                  node --test — unitarios, sin mocks de plataforma
.github/workflows/      Deploy automático a producción
```

## Desarrollo local

1. `npm run dev` — levanta Vite + Miniflare (D1 y R2 emulados en
   `.wrangler/state`). La primera vez (o tras limpiar ese estado) hace falta
   `npm run db:migrate:local` para crear el esquema.
2. El login normal (Google OAuth) funciona en local, pero para probar el
   camino de las cabeceras de ChatGPT Sites hace falta simularlas —
   `scripts/open-in-chrome.py` abre una ventana de Chrome real con Playwright
   inyectando esas cabeceras contra `http://localhost:<puerto>`.
3. `npm run lint`, `npx tsc --noEmit`, `node --test tests/*.test.mjs` y
   `npx vinext build` son la batería de verificación antes de cualquier
   commit — no hay mocks de Google/Meta en los tests: lo que se prueba es
   lógica pura (parseo de CSV, firmas de sesión, reglas de alertas, contratos
   de métricas).

## Despliegue

No hay ambiente de staging: `main` es producción. El flujo
(`.github/workflows/deploy.yaml`) se dispara al mergear un PR contra `main`
y, por SSH, en el VPS (`server.wiwo.center`):

```
git pull origin main
npm ci
NODE_OPTIONS='--import .../servidor/registrar.mjs' npx vinext build
node servidor/migrar.mjs      # aplica migraciones nuevas antes de reiniciar
pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
pm2 save
```

Apache corre como proxy reverso delante del proceso Node/PM2. El flujo de
trabajo del equipo acumula varios cambios en la rama de trabajo (`devAmaro`)
antes de abrir el PR hacia `main`, en vez de desplegar por cada cambio chico.

## Convenciones propias de este repo

- **Identificadores y comentarios en español** — nombres de función, tipos y
  comentarios; solo palabras clave del lenguaje/librerías quedan en inglés.
- **Comentarios explican el porqué, no el qué** — casi todo comentario del
  código documenta una decisión, una corrección de un bug real o una
  limitación de una plataforma, no lo que la línea de abajo hace.
- **La UI nunca decide sola qué es un límite de la plataforma** — cuando algo
  no se puede hacer, el código y el asistente distinguen si el límite es de
  Google/Meta, de Windsor (el intermediario) o del Constructor de WiWO.ADS
  específicamente, en vez de decir "no se puede" en general.
