# WiWO.ADS — arquitectura y funcionamiento

> Este documento reemplaza al `README.md` del repo como fuente de verdad sobre
> el producto: ese README es el boilerplate del starter (`vinext`/Cloudflare)
> del que nació el proyecto y no describe qué es WiWO.ADS ni cómo está armado.
> Este archivo sí. Última actualización: 2026-10-05.

Documentos hermanos: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) (flujo de
lectura/escritura y variables de entorno), [`docs/DESPLIEGUE_VPS.md`](docs/DESPLIEGUE_VPS.md),
[`docs/MAPA_CLIENTES.md`](docs/MAPA_CLIENTES.md) (inventario de cuentas por cliente) y
[`docs/EVALUACION_ARQUITECTURA_OMNICANAL.md`](docs/EVALUACION_ARQUITECTURA_OMNICANAL.md).

## Qué es

WiWO.ADS es el panel interno con el que el equipo de la agencia arma, revisa,
publica y audita campañas de **Google Ads** y **Meta Ads** (Facebook +
Instagram) para sus clientes, y sigue el rendimiento de esas cuentas. **LinkedIn Ads** se lee y se administra en
parte (ver su sección); TikTok está declarado pero no activo. No es
un producto que use el cliente final: lo usa el equipo (administradores,
supervisores, analistas) y, con una vista recortada a su propio portafolio,
el cliente.

Dos decisiones de diseño explican casi todo lo demás:

1. **Nunca se escribe en una plataforma real a ciegas.** Crear o cambiar algo
   siempre pasa por un paso de simulación explícito (el Constructor arma un
   plan y lo muestra) o por una propuesta que otra persona con permiso debe
   aprobar. El único camino para publicar una campaña real es el Constructor,
   con una persona revisando cada campo.
2. **No se habla directo con Google Ads ni con Meta Ads.** Toda lectura y
   escritura pasa por [Windsor.ai](https://windsor.ai), que normaliza los
   datos de ambas plataformas (y TikTok/LinkedIn a futuro) en un esquema
   común y expone acciones de escritura ya autorizadas, evitando los trámites
   lentos de cada plataforma (developer token de Google Ads, App Review de
   Meta) para el desarrollo propio.

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
| IA | SDK de Anthropic (`@anthropic-ai/sdk`), modelo `claude-sonnet-5`, con `web_search` como server tool |
| Integración de ads | Windsor.ai (lectura y escritura) |
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

## Modelo de datos

SQLite con el esquema versionado en `drizzle/0000...sql` a `0026...sql`
(aplicados en orden, tanto en local como en producción, vía
`npm run db:migrate:local` o `servidor/migrar.mjs`). Las tablas centrales
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

**Ojo con el journal:** `drizzle/meta/_journal.json` solo llega a la 0017. Las migraciones
0018–0026 existen como SQL y las aplica `servidor/migrar.mjs` (lee la carpeta, no el journal),
pero `drizzle-kit` no las conoce (pendiente 16).

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

La **escritura** (crear/pausar campañas, conjuntos, anuncios) usa las
"write actions" que Windsor expone sobre `google_ads` y `facebook` —
`executeWindsorAction` detecta incluso los casos en los que Windsor responde
HTTP 200 pero con un error dentro del cuerpo, para no reportar éxito cuando
no lo hay.

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
   pantalla es lo que se ejecuta) y sí escribe, vía Windsor. Todo nace
   pausado: nunca empieza a gastar solo por haberse creado.

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
  segmentación cruda actual y solo toca las claves pedidas. Todo cambio que no sea un
  renombre deja lo editado pausado (regla del equipo, 24-09-2026). Puja, idiomas, horario,
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
drizzle/                Migraciones SQL versionadas (0000–0026), aplicadas en orden
docs/                   Arquitectura, despliegue, mapa de clientes y evaluación omnicanal
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

## Cambios del 2026-10-02
- **Carga rápida:** los anuncios del cliente se piden en cuanto se elige (no solo al abrir «Cliente») y se guardan en memoria del navegador (2 min); en el servidor, la lectura de anuncios y la del detalle de cuenta (editor / impulsar) se recuerdan 2–3 min en memoria del proceso. `lib/escrituras.ts` cuenta las escrituras (Windsor y Google nativo) e invalida esas memorias para que nunca se vea lo anterior a un cambio.
- **Edición unificada:** el lápiz de campañas, conjuntos y anuncios abre el mismo editor a pantalla completa; se quitó el panel de árbol de la tabla y el diálogo «Gestionar campaña» ya no se abre desde la tabla.
- **Enlaces directos:** alertas y sugerencias traen enlaces a Analytics, Tag Manager o la campaña en su plataforma (`lib/enlaces.ts`). El de Tag Manager abre la página principal (no hay deep link sin el id de cuenta).
- **Lookalike** en Gestión (admin/supervisor): carga de base desde Excel (.xlsx), CSV o TXT.
- **Colbún** (antes «Colbún Energía») es un solo cliente con dos segmentos, Comunicaciones (Meta + Google) y Marketing (LinkedIn); se unificó el 2026-10-05 con la migración 0026 (ver «Segmentos»). SQM: sus tres cuentas de Meta (SPN, LATAM, España) se filtran por cuenta; falta definir los países de cada una para segmentar.

## Pendientes y mejoras necesarias (2026-10-02)
**Riesgos que no son de código**
1. Una sola cuenta de Meta tiene acceso a todo y su dueña ya no trabaja con WiWO: pedirle que agregue a alguien de WiWO como admin del Business Manager y reconectar Windsor con una cuenta del equipo.
2. Developer token de Google Ads (nivel Explorador en revisión): sin él, la lectura nativa de Google da 403 y no se pueden editar anuncios RSA.
3. App de Meta: mover al Business Manager de WiWO, correo de contacto de empresa, revisión + verificación de empresa (`ads_management`), usuario del sistema.
4. Mucho trabajo sin commit en `devAmaro`: pedir commits por bloques y dejar un respaldo.

**Verificar contra plataformas reales (nunca probado)**
5. Editar y impulsar en una cuenta de prueba; vía nativa de Google Ads; subida a Customer Match; abrir el .pptx en Google Slides; lectura de métricas por la conexión OAuth de Meta.

**Datos y modelo de clientes**
6. Cargar por cliente presupuesto mensual, GA4 y GTM (si no, presupuesto restante y medición salen vacíos).
7. Ficha con varias propiedades GA4 (ALO 8, SQM 6, Valor: Ébano, Corotú, Marea, Bijao).
8. Valor Development como cliente con proyectos; SQM por países. (Colbún con LinkedIn ya quedó resuelto por la 0026.)
9. Cuentas de Google/Meta que no están en `config/portafolios.json` salen como clientes sueltos.

**Automatización**
10. Cron real (o disparo desde la sesión) para sincronizar la conexión OAuth y elegir cuentas según la configuración.

**Producto y calidad**
11. Simulador: confianza que baje si el reparto se aleja del historial; tipo de cambio automático.
12. Tag Manager: enlace directo al contenedor (requiere el id de cuenta de GTM).
13. Partir `anuncios-view.tsx` (~2.000 líneas) y `constructor-view.tsx` (~3.000).
14. Pruebas de interfaz automáticas (hoy solo verificación manual con Playwright).
15. Plan de geo-targeting con la API oficial de Meta (pausado).
16. Migraciones 0018–0026 sin entrada en el journal de drizzle (llega hasta la 0017): ordenar antes de desplegar. Las 0015–0026 solo están aplicadas en local; producción las aplica `servidor/migrar.mjs` en el próximo deploy.

## Segmentos por cliente (2026-10-02)
`portfolios.segments` (migración 0024): JSON con proyectos o mercados de un cliente; filtro «Proyecto / país» en la tabla de Cliente (`lib/segmentos.ts`). La migración renombró Colbún a «Colbún Comunicaciones», creó TrueCaller (con su cuenta de Meta) y un cliente aparte «Colbún Marketing»; la **0026 (2026-10-05) los volvió a unir**: Colbún es un solo cliente con los segmentos «Comunicaciones» (Google y Meta) y «Marketing (LinkedIn)», y sus cuentas de LinkedIn pasaron al cliente `colbun`. Ver `docs/MAPA_CLIENTES.md`.

## LinkedIn Ads, solo lectura (2026-10-02)
LinkedIn se **lee** vía Windsor (conector `linkedin`) pero no se escribe: `soloLectura: true` en `lib/plataformas.ts`, nuevo `LECTURA_PLATFORMS` (lo que se lee) distinto de `ACTIVE_PLATFORMS` (lo que se puede crear/editar; el Constructor, el asistente, el simulador y las sugerencias siguen usando este). `lib/linkedin.ts` traduce las filas: el «campaign_group» de LinkedIn es la campaña de la app y su «campaign» es el conjunto. Un fallo de LinkedIn no tumba la lectura de Google/Meta. En la tabla de Cliente sus filas dicen «Solo lectura» y no tienen lápiz. Migración 0025: cuentas de LinkedIn de Colbún (Colbún Clientes 555900177, Colbun S.A 555950160; hoy bajo el segmento Marketing del cliente Colbún, por la 0026), Amipass, Cornerstone y Bodenor Flexcenter (nuevo cliente con su Google, LinkedIn y GA4).
Límite conocido: un cliente solo aparece en el selector si alguna cuenta tuvo actividad en el periodo elegido.

## Simulador, editor de Google y carga (2026-10-02)
- **Simulador:** monto máximo de 12 dígitos, 365 días y 50 campañas; mínimo operativo por plataforma y por días (`MINIMO_DIARIO_USD` en `lib/simulador.ts`: Meta 1, Google 1, LinkedIn 10, TikTok 20 USD por día; son referencias de trabajo, no garantías de la plataforma) con conversión aproximada a la moneda del cliente; un canal bajo su mínimo pasa a 0 y su parte va a los demás; fecha de inicio y de término.
- **Editor de anuncios de Google** (`app/editar-anuncio-google.tsx`): una fila por titular (hasta 15 × 30) y descripción (hasta 4 × 90), contadores, rutas visibles y vista previa tipo resultado de Google.
- **Carga:** las pantallas pesadas (Creador, Simulador, Equipo, Cuentas, Auditoría, Lookalike y el asistente) se bajan solo al abrirlas: el paquete principal pasó de ~700 KB a ~270 KB. `lib/fetch-reintento.ts` reintenta cortes de red y 429/502/503/504 en lecturas (detalle, simulador, selector de anuncios, dashboard). Lookalike lee/analiza archivos sin congelar la pantalla.

## LinkedIn administrable y presupuesto restante (2026-10-02)
- **LinkedIn** (`administraExistentes`): se pausa/activa (grupo, campaña, anuncio), y en campaña (conjunto) se cambia nombre, presupuesto diario o total y fecha de término; el grupo admite presupuesto total. Crear no (Windsor no lo permite). Pasa por el mismo flujo de simular → aprobar. Nunca se escribió contra una cuenta real: solo se simuló.
- **Presupuesto restante** (`lib/presupuesto-entidades.ts`, `lib/presupuesto-store.ts`, `/api/presupuesto`, `app/presupuesto-mes.tsx`): tres capas — el mensual de la ficha, lo asignado a cada campaña/conjunto (invertido y lo que sobra, con la suma; total = desde que empezó, diario = lo que se gastaría hasta fin de mes) y lo mismo por segmento (con presupuesto mensual propio opcional, editable en la ficha). Aparece en Dashboard, Cliente, y como línea en el Creador y el Simulador («Usar lo que sobra del mes»).
- **Corrección de lectura de Meta en USD:** `campaign_lifetime_budget` de Windsor viene en la unidad de la moneda (2524.64), no en centavos; el diario y los de conjunto sí en centavos. Un 0 es «no aplica», no «presupuesto cero».

## Simulador por brief, versión nueva de anuncios y Lookalike (2026-10-05)
- **Simulador por brief** (`lib/estrategia.ts`): se escribe una idea («campaña de leads con $200.000 hasta mitad de octubre»); se interpreta objetivo, monto y fechas (sin inventar lo que no dice), se recomienda el reparto por canal según el costo por resultado histórico del cliente (tope: el doble de lo que ya invertía por día; mínimos por canal), y se muestra cuántos resultados se esperan, por qué ese reparto, escenarios con otros montos y el avance semana a semana. Avisa si el monto pasa del presupuesto restante del mes.
- **Anuncios de Meta que usan una publicación existente:** Meta no deja editar su contenido. En el editor ahora el contenido aparece bloqueado con el motivo; nombre y parámetros de URL (UTM) sí se editan, y «Crear una versión nueva con cambios» abre el Creador con su texto, destino y pieza para armar un anuncio NUEVO en el mismo conjunto (pierde reacciones y comentarios; el original se pausa a mano). Nunca probado contra una cuenta real.
- **Lookalike:** arrastrar y soltar el archivo, y pasos en pantalla para crear el público personalizado y el lookalike (1 % a 10 %) en Meta.

## Roles, presupuesto, mínimos y edición (2026-10-05, segunda ronda)
- **Roles** (`lib/permisos.ts`): nuevas capacidades `ver_cuentas` (Gestión → Cuentas, solo admin; `/api/integrations` responde 403 al resto) y `ver_plan_tecnico` (los pasos y parámetros crudos de «Lo que se ejecutaría», solo admin y plegado). El supervisor conserva crear, aprobar y actualizar datos. En Equipo hay una tabla «Qué puede hacer cada rol» generada desde las capacidades reales (`matrizDeRoles`).
- **Presupuesto en el Constructor:** la sección «Presupuesto y calendario» ahora elige tipo (diario o total con fecha de término) y nivel en Meta (campaña o conjunto). Google siempre vive en la campaña y por esta vía se crea diario: un total se reparte en los días hasta la fecha de término (Windsor tiene `set_campaign_budget` lifetime, pero exige una fecha de término que ninguna acción de Windsor fija). El asistente acepta `presupuesto_total` + `duracion_dias`. La sugerencia de presupuesto es ahora la **mediana del gasto diario por campaña** (no el total de la cuenta). Objetivo nuevo: «Interacción» (OUTCOME_ENGAGEMENT).
- **Presupuesto en Cliente:** tres cifras al inicio — invertido en el año, invertido este mes y lo que sobra del mes (del presupuesto mensual de la ficha o, si no hay, de lo asignado a las campañas).
- **Simulador:** el mínimo es por plataforma (no por canal: Facebook e Instagram comparten el conjunto), por objetivo, por días y por campañas (`MINIMO_DIARIO_USD_POR_OBJETIVO`, referencias de trabajo); tipo de cambio automático (`/api/cambio`, open.er-api.com, con respaldo a la tabla de referencia); los cinco objetivos se pueden elegir (sin historial se avisa); carga del brief desde .txt, .md, .csv, .docx o .xlsx; ayuda de cada canal (Audience Network, etc.).
- **Google con imagen:** Windsor no tiene ninguna acción para crear anuncios Display / Performance Max con imagen (solo búsqueda responsiva y extensiones); la vía nativa depende del developer token. El aviso del Constructor lo dice así.
- **Recién creado:** el árbol de edición se completa con lo que la bitácora sabe que se creó (marcado «no editable» hasta que Windsor lo entregue), y `boost_post` ya cuenta como anuncio pendiente (antes la campaña de Meta recién creada no aparecía en la tabla de Cliente).
- **Meta, edición:** estrategia de puja, meta de optimización, categoría especial y fecha de término del conjunto. Pendiente frente a Windsor: segmentación por intereses/audiencias, `update_ad` (dominio de conversión), mensaje de bienvenida (`set_page_welcome_message`).
- **Otros:** frases de espera rotativas en el asistente; mapa con `isolate` (ya no se pinta sobre los diálogos); en Cliente, la tabla de salud ahora es Cuenta · Campaña · Plataforma · Estado y las verificaciones técnicas quedan plegadas; «Impulsar publicación de la red» es el botón principal para boostear (el de anuncios de campaña se llama «Reutilizar un anuncio de campaña»).

## Anuncios de Display con imagen y conexión de Google del equipo (2026-10-05)
- **Display con imagen en Google** (`lib/google-ads-nativo.ts`: `crearAnuncioDisplay`): Windsor crea la campaña y el grupo de Display; la API de Google Ads sube las imágenes como recursos (`assets:mutate`) y crea el anuncio responsivo (`adGroupAds:mutate`), siempre PAUSADO. Al simular se descargan las imágenes y se valida formato (PNG/JPEG), peso (5 MB), tamaño y proporción (1,91:1 y 1:1; logo 1:1). Paso del plan con `via: "nativa"` (`ads:create_display_ad`). Probado de verdad en la cuenta Wiwo (671-563-3543): campaña 24316250382, grupo 202359046962, anuncio 202359046962~826939166388, todo pausado. Performance Max sigue pendiente. El 403 que se veía en Cuentas era solo la cuenta cancelada 731-375-6933 (las otras 18 sincronizan).
- **Conexión de Google del equipo:** el equipo trabaja con una sola cuenta de Google (hola@wiwo.me). En Cuentas, un admin pulsa «Usar para todo el equipo»: esa conexión pasa a ser la que usa `accesoNativoGoogle` para todos (lectura nativa, edición de anuncios, Display), en vez de la personal. La bitácora sigue registrando a la persona logueada. Clave `google_conexion_equipo_user` en `app_meta`; se libera sola si esa conexión se desconecta. Meta no cambia: todo pasa por Windsor, conectado con la cuenta de Coti; riesgo de cuenta única ya anotado (una cuenta de negocio con acceso a todos los clientes está en trabajo con la jefatura).

## Campaña completa de Colbún: correcciones (2026-10-05, tercera ronda)
- **Presupuesto de Google rechazado** («A money amount was not a multiple of a minimum unit»): el total repartido en días (800.000 / 27 = 29.629,63) daba micros no enteros. Ahora el diario de Google va siempre en unidades enteras de la moneda.
- **Presupuesto duplicado entre plataformas:** un total compartido se aplicaba COMPLETO a cada plataforma (800.000 a Google y 800.000 a Meta). Ahora el Constructor avisa cuando un mismo total se aplica a cada plataforma, y el asistente reparte el monto con `presupuesto_por_plataforma` (si no hay con qué decidir, en partes iguales, declarado) y deja una sola propuesta con todas las plataformas, no una por plataforma.
- **Instagram sin publicaciones:** el selector «Impulsar publicación de la red» solo mostraba Facebook porque la ficha no tenía la cuenta de Instagram. Ahora, si falta, se busca entre las cuentas de Instagram que Windsor tiene conectadas por el nombre del cliente (solo si coincide una; nombres de menos de 4 letras no se buscan) y se guarda en la ficha. Colbún: 62 publicaciones de Instagram más 73 de Facebook.
- El aviso de imagen en Google Búsqueda ahora dice que el anuncio de búsqueda no lleva imagen y manda a «Red de Display».
- **Puja de Google sin conversiones medidas (2026-10-05):** si la ficha del cliente dice «no tiene Tag Manager» (`gtmEstado = no_tiene`), la campaña de Google de un objetivo con conversiones (leads, ventas) parte con «Maximizar clics» (`target_spend`) en vez de «Maximizar conversiones», y el plan lo avisa. En Meta, impulsar una publicación nombra la campaña con la sigla [AE] (la campaña es de interacción). Los presupuestos existen a nivel de campaña y de conjunto (Meta) y solo de campaña (Google); ningún anuncio tiene presupuesto propio.

## Pendientes cerrados (2026-10-05, cuarta ronda)
- **Performance Max** (`crearCampanaPmax` en `lib/google-ads-nativo.ts`): una sola mutación atómica `googleAds:mutate` (presupuesto, campaña pausada, ubicación, textos, imágenes, grupo de recursos). Con las pautas de marca de Google, el nombre del negocio y el logo (1:1, obligatorio) se enlazan a la CAMPAÑA, no al grupo de recursos (lo descubrió la validación real de Google). Al simular, Google valida la mutación entera contra la cuenta (`validateOnly`, no crea nada); probado así con la cuenta Wiwo: aceptada. Falta una publicación real de prueba. Opción «Performance Max» en Ubicaciones de Google; solo optimiza por conversiones (avisa si el cliente no las mide).
- **Editar campañas de Google con la API nativa:** fechas de inicio y fin (`startDateTime`/`endDateTime`; «sin fin» = 2037-12-30), redes (Búsqueda, socios, Display; solo campañas de Búsqueda: Google lo rechaza en Display, verificado) y rotación de anuncios (`adServingOptimizationStatus`). La simulación valida con `validateOnly`. Siguen sin hacerse: IA Max, feeds de páginas, exclusiones de IP y listas de marcas.
- **Meta, edición de anuncios:** dominio de conversión (`update_ad`) y mensaje de bienvenida (`set_page_welcome_message`, solo anuncios de mensajes). Intereses y audiencias de un conjunto existente siguen fuera (Windsor no busca ids de interés).
- **TikTok en solo lectura** (`lib/tiktok.ts`, migración `0027_tiktok_cuentas.sql`): «USD Truecaller Colombia» → TrueCaller; «Soundcore Chile» → Anker · Soundcore. Aparecen cuentas y campañas (17 en TrueCaller). A nivel de anuncio el conector de TikTok tarda y se pasa del tiempo: hoy no llegan anuncios de TikTok. Sin escritura.
- **Varias propiedades de GA4 por cliente** (`lib/ga4.ts`): la ficha acepta una lista separada por comas; la medición junta los hallazgos de todas.
- **Tope de CPC** visible cuando la puja pasa a clics por falta de conversiones; aviso cuando se impulsa una publicación con objetivo de leads.
- **Pruebas:** `scripts/prueba_ui.py` (`npm run test:ui`) recorre las pantallas con Playwright. El test intermitente era el servidor de Vite de `ui-components.test.mjs`, que abría el puerto 24678 aunque `hmr` estuviera apagado: ahora `ws: false`. No se reprodujo en 6 corridas seguidas.
- **Accesos de GA4 y GTM:** `docs/ACCESOS_PENDIENTES.md` (qué cuenta agregar y a quién).

## Geo-targeting de Meta con la API oficial (2026-10-05)
La búsqueda de regiones y ciudades (`/api/geo-targets`) ahora consulta también `GET /search?type=adgeolocation` de Meta (`lib/meta-geo.ts`) y junta el resultado con el catálogo de Google por país y nombre (solo si el emparejamiento es inequívoco). El lugar elegido guarda su `metaKey` real (Maule = 672, Talca = 328738, Viña del Mar = 328976, verificados en vivo) y el plan de Meta usa `geo_locations.regions` / `geo_locations.cities` con ese key en vez de un círculo aproximado; los lugares sin key siguen con círculo y aviso. Lo que Google no tiene pero Meta sí se ofrece como «solo Meta» con su key real (reemplaza al respaldo aproximado por mapa cuando Meta responde). Token: primero el de la conexión de Meta del equipo; como esa cuenta personal de Facebook pide una verificación de seguridad («log in to www.facebook.com…»), se usa como respaldo el token de la propia app (`id|secreto`), que basta para este catálogo público. Falta: probar una campaña real con regiones por key; Quilicura no existe como ciudad en Meta y queda con círculo.

## Estado por cliente y carga de GA4/GTM (2026-10-05)
`docs/ESTADO_POR_CLIENTE.md` cruza la lista del equipo (MGC y WIWO) con lo que Windsor lee y con lo cargado en la ficha. La migración `0028_ga4_gtm_por_cliente.sql` crea AIMA (con su Google, GA4 y GTM-NCWP7W48) y carga GA4/GTM donde no había dudas (Valor, Palta con GTM-5FL5C3Z5, Foundaxis, SQM, Cornerstone, María Ayuda, Primeros Pueblos, Skydive, Amipass); solo llena campos vacíos. ALO (más de 20 propiedades) y el resto de Valor/SQM quedan por confirmar. Pendiente de definir: a qué empresa (MGC o WIWO) pertenece cada cliente dentro de la app.

## Empresa del grupo, archivados y TikTok (2026-10-05, quinta ronda)
- **Empresa (MGC / WIWO)** y **archivado** por cliente (migración `0029_empresa_y_archivado.sql`, `lib/empresas.ts`): solo ordena. El selector y la puerta de entrada agrupan por empresa; en la ficha se elige y se puede archivar. Archivado = sale de selectores, alertas y sugerencias, pero sus cuentas e historial se conservan. Asignado: MGC = Valor, AIMA, Palta, Foundaxis, SQM, Cornerstone, TrueCaller, Colbún, Primeros Pueblos y MGC; WIWO = Anker·Soundcore, ALO, Bodenor, María Ayuda. Archivados (ya no son clientes): Skydive Andes, Amipass, Wildsty.
- **TikTok, anuncios:** llegaban vacíos porque la lectura a nivel de anuncio pedía demasiados campos y se pasaba del tiempo. Con menos campos llegan (TrueCaller: 86 anuncios del mes, 93 en 90 días; ~40-50 s).
- **Cuenta de servicio de lectura, verificada hoy (solo lectura):** GA4 21 propiedades visibles; GTM 9 cuentas visibles pero solo 2 contenedores. «Sin contenedor visible» significa permiso de cuenta sin permiso de contenedor: GTM exige darle «Leer» en cada contenedor.

## Solicitudes de publicación y aprobación (2026-10-05, sexta ronda)
- **Flujo:** el analista arma el borrador en el Creador de campañas y pulsa «Enviar a revisión» (no publica, no crea nada en la plataforma). Queda una **solicitud** pendiente (`drizzle/0031_solicitudes.sql`, `lib/solicitudes.ts`, reglas puras en `lib/solicitudes-pura.ts`). Se rechaza si el plan tiene problemas bloqueantes.
- **Supervisores/admin:** ven «X quiere subir un anuncio a Y» con Aprobar / Rechazar (con motivo) en el panel de Alertas y en **Solicitudes** (menú con contador). Aprobar rearma el plan en el servidor y lo ejecuta con la misma regla de siempre (todo nace pausado), con candado para que dos aprobaciones simultáneas no publiquen dos veces; deja enlace a la plataforma para revisarlo. Si un paso falla queda «fallida» con el motivo.
- **Analista:** «Tu creación fue enviada a revisión (supervisores: nombres)». Al aprobarse: «aprobada y creada, pausada; te avisamos cuando esté activa». Solo cuando la plataforma muestra los anuncios ACTIVOS (`revisarActivaciones`, al abrir Solicitudes) pasa a «activa» → «Aprobada y funcionando». Puede retirar una solicitud mientras esté pendiente. Una ruta manual `marcar_activa` existe para revisores.
- **Impulsar con links:** `lib/links-meta-pura.ts` casa links de Facebook con las publicaciones reales de la Página (por `posts/ID`, `pfbid`, `story_fbid`, reel…); `lib/impulsos.ts` busca el conjunto de Meta por nombre (no adivina si hay varios) y crea una solicitud con un impulso por publicación dentro de ese conjunto. El asistente lo usa con la herramienta `impulsar_publicaciones`. **Instagram queda fuera** (el impulso por id solo está verificado para Facebook).
- **Permisos:** nueva `puedeArmarCampanas` (publica o es analista): permite simular/leer lugares y creatividades; publicar directo sigue siendo `aprobar_cambios`. Migración 0031 pendiente en producción (junto a 0024–0030).
- **No verificado:** aprobar una solicitud real contra Meta/Google (probado crear → rechazar → guardas de estado en local), impulso real con links de Anker, y la detección de «activa» contra una cuenta real.

## Impulsar, filtros, límite de gasto y facturas (2026-10-05, séptima ronda)
Vista **Impulsar** (`app/impulsar-view.tsx`, `/api/entidades/arbol`), filtros por métrica en la tabla de anuncios, alertas de límite de gasto (`lib/alertas-gasto.ts`) y reglas de carpeta de facturas (`lib/facturas-pura.ts`). Análisis de extracción, alcance y pendientes que dependen de acceso: `docs/CONTROL_TOTAL.md`. Hallazgo: Windsor no tiene acciones de audiencias ni facturas; `boost_post` solo en campañas de interacción (el giveaway de Anker Chile está en una de Tráfico).

## Meta directo con usuario del sistema (2026-10-05, octava ronda)
Token del usuario del sistema «WiwoAds» (MG Consulting, app WiwoAds 2191105014789445) en `META_SYSTEM_USER_TOKEN`; `lib/meta-nativo.ts` (Graph v21). Probado en solo lectura: 16 cuentas publicitarias, audiencias (Colbún tiene un lookalike 2 %), reglas nativas (Palta: 5 de Madgicx). Pestaña «Audiencias de Meta» (similar y visitantes del sitio, solo supervisores). **Verificado: `validate_only` NO existe para audiencias; crea de verdad** (una prueba mía dejó la audiencia «PRUEBA similar 1% Engagers», id 52532384738237, en la cuenta de Colbún 2006250736667023: borrarla a mano). Facturas de Meta: sin campo `transactions` y `business_invoices` vacío (cuentas con tarjeta). Excluidas por decisión del equipo: Soundcore Chile 950480761100481, Grupo Valor 577064993829231, Colbún 876569965108408. Migración 0035: Palta, SQM Perú y SQM Ecuador.

## Lectura directa de Meta y facturas (2026-10-05, novena ronda)
- **Lectura directa** (`lib/meta-nativo-lectura.ts`, enganchada en `fetchWindsorDaily/Campaigns/Ads`): las cuentas de Meta asociadas a un cliente que Windsor no entrega (Palta, SQM Perú, SQM Ecuador) se leen con la API de Meta y se devuelven en las mismas formas que Windsor; las que Windsor ya lee no se duplican. Caché 10 min en `app_meta`; solo se pide la parte necesaria (diarias / campañas / anuncios). **La app de Meta está en `development_access`: límites de peticiones bajos** («User request limit reached» al leer el histórico); pedir acceso estándar a la API de marketing.
- **Facturas de Google** (`listarFacturasGoogle`, `/api/facturas/google`): probado con Colbún, Primeros Pueblos y María Ayuda: Google responde `DEVELOPER_TOKEN_NOT_APPROVED — método no permitido con acceso explorer`. El token de desarrollador no puede usar facturación hasta aprobar el acceso Estándar. Meta: sin API de recibos para cuentas con tarjeta.

## Pruebas con Colbún en Meta directo (2026-10-06)
Todo lo creado para probar lleva el prefijo `PRUEBA-WIWOADS`. `lib/meta-nativo.ts`: `eliminarAudienciaDePrueba` (solo borra audiencias con ese prefijo), `crearAnuncioDesdeInstagram` (anuncio siempre PAUSADO, `/api/meta/instagram`). Verificado: crear y borrar audiencia similar; anuncio pausado desde un reel de energiacolbun en el conjunto «AS | Broad Advantage+ | 18-45 | CL» de la campaña de Awareness ThruPlay. Hallazgos: los conjuntos de «Concurso Maule» caducaron el 30-sep (Meta no deja crear anuncios en ellos); el conjunto de Engagement de perfil de IG rechaza el anuncio por la llamada a la acción («no puede usarse para el objetivo de rendimiento»): hay que fijar el botón de perfil. Meta tiene dos tokens (coma en `META_SYSTEM_USER_TOKEN`). Impulsar ya ofrece publicaciones de Instagram (solo supervisores y administradores; se crean al instante, pausadas, con enlace a Meta).

## Cliente como centro y asistente más autónomo (2026-10-06)
- **Impulsar** ya no es una entrada del menú: es un botón junto a «+ Crear campaña» en la tabla de Cliente (panel sobre la tabla). Acepta publicaciones de Facebook (solicitud, por Windsor) y de Instagram (supervisor: se crea al instante, pausada, API directa; analista: solicitud que al aprobarse crea el anuncio pausado, `crearSolicitudDeInstagram`).
- **Asistente:** `impulsar_publicaciones` acepta links de Facebook e Instagram y basta la campaña o el conjunto (elige el conjunto activo y lo declara en `supuestos`). El prompt ahora pide deducir (objetivo, plataformas, presupuesto, destino), no preguntar uno por uno, y cerrar con «Lo que asumí».
- **Brechas del creador unificado (por construir):** objetivos propios por plataforma (App, Tiendas locales, Shopping, Video, Demand Gen, sin objetivo), pasos guiados de conjunto distintos para Meta/Google/LinkedIn, creación en LinkedIn (Windsor trae `create_creative`, `set_campaign_targeting`; TikTok es solo lectura), y que el asistente cree campañas completas de varias plataformas sin pasar por el Constructor.

## Creador por plataforma (2026-10-06, segunda parte)
- **Objetivo por plataforma** (`objectiveByPlatform`, `objetivoDe(draft, plataforma)` en `lib/constructor.ts`): cada plataforma puede tener su propio objetivo en la misma campaña (ej. Reconocimiento en Meta y Oportunidades de venta en Google); nombres, optimización y puja se calculan por plataforma (tests en `constructor-plan.test.mjs`). La pantalla muestra los objetivos con los nombres de cada plataforma; «Promoción de la aplicación» (Meta y Google) y «Visitas a tiendas locales» (Google) salen bloqueados con el motivo. El asistente puede fijarlos (`objetivo_por_plataforma`).
- **Segmentación de Meta sin ids a mano** (`app/segmentacion-meta.tsx`, `/api/meta/intereses`): intereses buscados por palabra (la API directa de Meta devuelve los ids reales) y audiencias de la cuenta para incluir o excluir (`metaCustomAudiences`, `metaExcludedAudiences` → `custom_audiences` / `excluded_custom_audiences` del conjunto).
- **Asistente → campaña completa:** `enviar_campana_a_revision` toma la propuesta de `abrir_constructor` y la envía como solicitud (todas las plataformas a la vez, pausadas al aprobar). Meta exige imagen: la IA no la inventa.
- **Corregido:** desmarcar la única plataforma elegida dejaba el Constructor en «Too many re-renders».
- **LinkedIn:** Windsor solo trae `create_creative`, `set_campaign_targeting`, presupuestos y pausa; no crea grupos ni campañas. Crear exige la API de publicidad de LinkedIn directa (aplicación con producto «Advertising API» aprobado + autorización de un administrador de cada Campaign Manager).

## Estructura propia de cada plataforma al crear y editar (2026-10-06, tercera parte)
- **Google (Búsqueda) con su estructura nativa** (`crearCampanaBusqueda` en `lib/google-ads-nativo.ts`): una sola mutación atómica de la API de Google Ads con presupuesto, campaña (pausada), puja (automática según objetivo, clics con CPC máximo, conversiones con CPA, valor de conversión con ROAS, CPC manual, cuota de impresiones), redes, opciones de ubicación, ubicaciones/idiomas/círculo, programación de anuncios, fechas, seguimiento, grupo (CPC y rotación en el grupo), palabras clave y negativas, anuncio responsivo con rutas y recursos (enlaces de sitio, textos destacados, fragmento estructurado, llamada). `ConfigBusquedaGoogle` en el borrador; sin ella se usa la vía simple de Windsor. Verificado contra Google con `validateOnly` y con una creación real en Colbún (campaña de prueba creada, leída y borrada). Aprendido de Google: la rotación de anuncios ya no va en la campaña al crear (va en el grupo) y la opción de ubicación negativa debe ser `PRESENCE`. Los rechazos de Google ahora muestran sus motivos.
- **Formulario de solo Google**: cuando se elige únicamente Google, el Constructor sigue la estructura de Google Ads: Campaña (tipo, presupuesto, puja, redes, ubicaciones, idiomas, programación, seguimiento) → Grupo de anuncios (nombre, CPC, palabras clave, negativas) → Anuncio (anuncio responsivo y recursos). Con Meta o varias plataformas sigue la estructura de Meta.
- **Meta**: estrategia de puja y costo objetivo (`META_BID_STRATEGIES`), límite de gasto de la campaña (paso `update_campaign`), ventana de atribución (`attribution_spec`, con las ventanas que Meta admite según el objetivo: para tráfico solo 1 día tras el clic, verificado), intereses por palabra y audiencias incluidas/excluidas. Verificado con una creación real en Colbún (campaña PAUSED, spend_cap, COST_CAP y atribución leídos de vuelta) y borrada.
- **Edición con la misma estructura**: Google campaña (puja, opciones de ubicación, plantilla de seguimiento; validadas contra Google) y Meta conjunto (intereses, audiencias, atribución; verificado solo en simulación con datos reales, no se aplicó a campañas de clientes).
- **Reglas**: nueva acción «bajar el presupuesto X %» (campaña o conjunto; no sube ni aplica a anuncios). La creación está probada; el disparo contra una plataforma real no.
- **Borrado seguro de pruebas**: audiencias, campañas de Google y campañas de Meta solo se borran si su nombre lleva `PRUEBA-WIWOADS`.
- **Pendiente**: Display y Performance Max siguen con su flujo anterior; Meta no tiene aún su formulario propio separado (ya tiene la estructura de Meta); intereses/idiomas de Meta al crear por idioma; recursos de Google al editar (agregar/quitar enlaces de sitio); programación de anuncios al editar.

## Decisiones, cambios con aprobación y política sin pausa (2026-10-06/07)
- **Nada nace pausado** (decisión del equipo): lo aprobado queda corriendo. Cambió `buildPlan` (campañas, conjuntos y anuncios en `enabled`/`active`), la creación nativa de Google (Búsqueda, Display, Performance Max), `crearAnuncioDesdeInstagram` (activo por defecto; las pruebas piden `estado: "PAUSED"`) y `planEdicion` (`pausaAlAplicar = false`: solo se pausa lo que se pide con `pausar`). Red de seguridad: si un paso falla a mitad, la campaña incompleta se marca y se pausa. La revisión ocurre ANTES, en la aprobación.
- **Cambios con aprobación**: un Creator propone una edición (`/api/entidades/editar` con `modo: "solicitar"`, incluida la pausa); queda como solicitud con su antes y después. Aprobar vuelve a leer la plataforma y aplica el plan de ese momento. Los cambios de presupuesto solo los ve y aprueba quien tiene `aprobar_presupuesto` (administradores). Rechazar deja todo como estaba. Probado contra Meta (Colbún, prefijo PRUEBA).
- **Decisiones** es la pantalla de entrada: cola con filtros y detalle; lo que se aprueba se ejecuta. Nueva tarjeta «No has actualizado el contenido de [campaña]» (Meta: fecha del último anuncio por Graph; Google: historial de cambios de 30 días, cota «más de 30 días»).
- **Reglas dentro de Meta**: lectura de las reglas nativas (solo lectura), copia de una regla para varios anuncios y regla nueva de tope de gasto (`/api/reglas/meta`); Meta las evalúa sola. Las reglas de Google (acciones en bloque) no tienen API: solo registro manual.
- **Meta nativo en la lectura**: campañas y conjuntos que Windsor no entrega (pausados o recién creados) se suman leyendo Meta directo (`leerEstructuraMeta`), para poder editarlos.
- **Diagnóstico de permisos** (solo administradores): qué llave de Meta ve cada cuenta y página y con qué permisos. **Inversión** como ventana propia.
- **Equipo** (migraciones 0039–0042): cargos y roles; Super Admin/Director/Director creativo protegidos; Digital Creators y Leads dados de alta; jdiaz@ como Director.

## Recomendaciones con sentido (2026-10-07)
- **Época de la campaña** (`lib/vigencia-campana-pura.ts`): si el nombre trae un mes que terminó hace más de un mes («Leads | junio» en octubre), no se le recomienda renovar contenido. Un mes futuro sin año se asume campaña por venir.
- **Contenido repetido**: se sugiere cambiarlo desde los **20 días** sin anuncios nuevos, máximo 5 tarjetas por cliente (las más viejas primero).
- **«"X" dejó de correr»** (`campana_apagada`): gastó el mes pasado, hoy está apagada y sin gasto en 14 días. Se pregunta si debía seguir; «Reactivar» la enciende (Lead o superior) o se propone (Creator).
- **Descartar con motivo**: «Ya no estará activa», «Es una campaña de temporada» o «Está pausada a propósito» silencian la recomendación para siempre; cualquier otro descarte, 30 días.
- **Activar** también es un cambio proponible (`CambiosEdicion.activar`), igual que pausar.

## Auditoría unificada (2026-10-07)
- **Una sola bitácora** (`auditoria`, migración 0043; `lib/auditoria.ts`, `lib/auditoria-pura.ts`): se registra lo que se le pide al bot (cada pregunta y cada herramienta que usa, con sus datos sin secretos), las solicitudes (pedidas, aprobadas, rechazadas, retiradas, activas), las decisiones (aprobadas, descartadas con su motivo, pospuestas), los cambios aplicados con su **antes y después** (presupuesto, títulos, contenido, estado, segmentación, puja, fechas), las creaciones (campañas, impulsos, contenido nuevo), las reglas (creadas, activadas, borradas, disparadas) y los cambios del equipo.
- **Importante** = tocar presupuesto, rechazos, fallos, cambios del equipo y descartar una decisión. Se marca y se cuenta arriba.
- **Pantalla Auditoría** (`app/auditoria-view.tsx`): resumen, pestañas por categoría, filtros por tipo de cambio, cliente, persona, periodo y texto, «solo importantes», detalle desplegable y refresco cada 30 s. «Detalle técnico» conserva la vista de ejecuciones con cada paso crudo.
- **Quién ve qué**: lo del bot y el equipo, solo supervisores y administradores; el resto, por cliente a su alcance; cada persona siempre ve lo suyo. La auditoría solo se escribe: la app no edita ni borra eventos.

## Cada ventana para algo específico (2026-10-07)
- **Decisiones** (entrada): lo que se puede hacer ahora, con impacto, confianza y vencimiento. **Sala de control**: lo que necesita atención primero (decisiones, solicitudes, cuentas con datos) y acceso a cada ventana; sin cifras de inversión. **Salud de medición**: ventana propia (antes pegada a Cliente). **Inversión**: única ventana con presupuesto del mes, distribución del gasto y gasto por cliente (se quitó de Dashboard C-Level; el presupuesto «en línea» del Constructor y del Simulador es contextual y se queda). **Dashboard C-Level**: solo resultados y estado de campañas y fuentes. **Auditoría**, **Reglas**, **Diagnóstico** y **Cuentas** en Gestión.
- La barra de la tabla de Cliente sigue la pestaña: «+ Crear campaña», «+ Crear conjunto» o «+ Crear anuncio» (los dos últimos piden primero la campaña y, para un anuncio, el conjunto). «Impulsar» pasó a «Boostear anuncio».

## LinkedIn por su API directa (2026-10-07)
Además de leer por Windsor, WiWO.ADS puede hablar con la **Advertising API de LinkedIn** (app «WiwoAds», nivel de desarrollo). Convive con Windsor: si no hay credenciales o conexión, todo sigue por Windsor como antes.

- **Conexión:** cada persona conecta su LinkedIn por OAuth (`/api/integrations/linkedin/authorize` y `/callback`; `lib/linkedin-conexion.ts`). El token se guarda cifrado como los de Google y Meta y dura ~60 días; no hay `refresh_token`, así que hay que reconectar al vencer. Se piden los permisos de lectura, administración y anuncios.
- **Módulos:** `lib/linkedin-nativo-pura.ts` (rutas, formatos y validaciones, sin red), `lib/linkedin-nativo.ts` (llamadas HTTP, nunca reintenta), `lib/linkedin-escritura-pura.ts` (planes para renombrar, cambiar estado y presupuesto, crear grupos y campañas) y `lib/linkedin-anuncios-pura.ts` (publicación patrocinada y creativo).
- **Vocabulario:** la «campaña» de WiWO.ADS es el *grupo de campañas* de LinkedIn (`adCampaignGroups`) y el «conjunto» es la *campaña* de LinkedIn (`adCampaigns`).
- **En el editor:** con la vía nativa, renombrar (también grupos, que Windsor no permite), cambiar el presupuesto, pausar y reactivar se envían como un `PARTIAL_UPDATE` y se **leen de vuelta de LinkedIn** (no de Windsor, que va con retraso). La fecha de término y los anuncios siguen por Windsor.
- **Guarda de seguridad:** una cuenta de CLIENTE solo se escribe por la vía nativa si `LINKEDIN_ESCRITURA_CLIENTES=true`; por defecto solo la cuenta de prueba (`test: true`). La misma regla (`accesoNativoLinkedin`) vale para el editor, las solicitudes aprobadas y `/api/linkedin/escritura`.
- **Rutas de apoyo (solo administradores):** `GET /api/linkedin/cuentas` (cuentas, y con `?cuenta=ID` un resumen de lectura), `GET /api/linkedin/paginas` (páginas con rol), `POST /api/linkedin/escritura` (simular y confirmar) y `POST /api/linkedin/cuenta-de-prueba`.
- **Cuenta de prueba:** única por app e irreversible (id 558457797). Nada que se cree en ella se sirve ni se cobra.
- **Límites de LinkedIn:** el nivel de desarrollo permite escribir en hasta 5 cuentas agregadas en el portal de desarrolladores (leer no tiene límite). `politicalIntent` es obligatorio al crear campañas y es una declaración legal: no tiene valor por defecto.
- **Pendiente:** crear anuncios exige un rol sobre la página de empresa (hoy el usuario no tiene ninguno: LinkedIn responde 403); el Constructor aún no ofrece LinkedIn; no hay botón de conectar en Integraciones; la vía nativa del editor no se probó de punta a punta porque la cuenta de prueba no es un cliente de la app y Windsor no la ve.
