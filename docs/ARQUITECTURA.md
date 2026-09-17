# WiWO.ADS — Arquitectura técnica

Este documento explica cómo el sistema lee datos, cómo escribe cambios en las
plataformas publicitarias, qué variables de entorno necesita y con qué
tecnologías está construido. Está pensado para alguien del equipo que necesite
entender el flujo completo sin tener que leer todo el código fuente.

No incluye valores de credenciales ni claves — solo nombres de variables y el
razonamiento detrás de cada decisión.

## 1. Qué es

WiWO.ADS es el sistema operativo de medios pagados de la agencia: unifica
Google Ads y Meta Ads (con TikTok y LinkedIn ya soportados en el registro de
plataformas pero desactivados) en un solo tablero, permite crear campañas
reales desde una sola interfaz, y evalúa reglas de optimización que dejan
recomendaciones para que una persona las apruebe — nunca ejecuta un cambio de
presupuesto o una pausa por sí solo.

## 2. Cómo se lee la información (Windsor.ai — lectura)

Todo el dato de rendimiento (gasto, clics, conversiones, presupuestos,
catálogo de campañas y anuncios) se lee desde **Windsor.ai**, un
normalizador que expone Google Ads, Meta, TikTok y LinkedIn bajo un único
esquema de campos. Esto evita depender directamente de los trámites lentos de
cada plataforma (developer token de Google Ads, App Review de Meta) para leer
— esos trámites solo hacen falta para escribir.

Toda la lógica de lectura vive en [`lib/windsor.ts`](../lib/windsor.ts).

### 2.1 Endpoint de lectura

```
GET https://connectors.windsor.ai/{conector}
    ?api_key=...
    &date_from=YYYY-MM-DD
    &date_to=YYYY-MM-DD
    &fields=campo1,campo2,...
    &select_accounts=<id>        (opcional, acota a una cuenta)
```

Cada conector (`google`, `facebook`, `facebook_organic`, `instagram`, etc.) y
su lista de campos por caso de uso (métricas diarias, campaña, catálogo,
anuncio) están centralizados en [`lib/plataformas.ts`](../lib/plataformas.ts).
Nunca se adivina un nombre de campo: pedir uno equivocado no da error, solo
devuelve la columna en `null`, que es la peor forma de fallar — todos los
campos se verifican primero contra el MCP de Windsor (`get_fields`,
`list_actions`) antes de usarse.

Deliberadamente **no se usa el conector `all`**: mezcla plataformas
publicitarias con fuentes de tráfico de GA4 y produciría comparativas falsas.
Cada plataforma se pide por su propio conector, en paralelo.

### 2.2 El problema del catálogo y cómo se resuelve

La API REST de Windsor solo devuelve entidades con actividad en el rango
pedido. Una cuenta con 3 campañas activas y 22 pausadas devuelve solo 3, dando
a entender que las otras no existen. Las opciones documentadas para esto
(`include_inactive` en Google Ads, `include_objects_without_insights` en Meta)
existen y funcionan por la interfaz de Windsor y por su MCP, **pero la API
REST las ignora en silencio** — se probó exhaustivamente (distintas grafías,
prefijos, con y sin `select_accounts`) y siempre devuelve las mismas filas.

La solución (`fetchWindsorCatalog`): `campaign_status` y `effective_status`
son el estado **de hoy**, no del rango consultado. Un barrido de 36 meses sin
pedir campos de métrica devuelve cada entidad una vez, con su estado actual,
sin importar qué tan viejo sea el rango. Es la consulta más lenta del sistema
(hasta ~4 minutos en frío) así que nunca corre en el camino de una página:
se construye aparte y se cachea un día en `app_meta`; el tablero solo lee lo
ya guardado.

### 2.3 Caché

Todo lo leído de Windsor se cachea en la tabla `app_meta` (clave/valor +
timestamp) dentro de D1:

| Qué | TTL | Por qué |
|---|---|---|
| Métricas diarias / campañas / anuncios | 15 min | Evita golpear la API en cada carga de página |
| Catálogo (campañas y anuncios inactivos) | 1 día | Es la consulta más lenta; una campaña pausada hace un mes sigue pausada |
| Contenido orgánico (posts de Facebook/Instagram) | 2 horas | No exige la frescura del gasto, pero tampoco debe hacer esperar a alguien que publicó hace un minuto |

### 2.4 Conversión de unidades

La app guarda montos de dinero en **micros** (entero, × 1.000.000) para no
perder precisión con floats. Windsor entrega la mayoría de los campos de gasto
(`spend`, `cost`, `budget_amount`) en la unidad completa de la moneda, así que
se convierte × 1.000.000. La excepción es el presupuesto diario de Meta
(`campaign_daily_budget`), que Windsor entrega en centavos — se convierte
× 10.000, no × 1.000.000, porque además es la misma unidad que la acción de
escritura exige de vuelta al fijar un presupuesto nuevo.

### 2.5 Contenido orgánico ("usar publicación existente")

Para armar un anuncio con un post real (en vez de subir un archivo nuevo), se
leen las publicaciones reales de Facebook (`facebook_organic`) e Instagram
(`instagram`) vía Windsor — mismo patrón de lectura, filtrado por
`select_accounts` a la cuenta del cliente. Facebook solo entrega miniatura de
sus videos/reels (nunca el archivo), así que el selector lo marca
explícitamente en vez de dejar que se use algo roto; Instagram no tiene esa
limitación.

## 3. Cómo se envían datos (Windsor.ai — escritura)

Windsor también expone acciones de escritura sobre las plataformas
conectadas. Es el **único** punto de todo el sistema que cambia algo fuera de
WiWO.ADS — todo lo demás es lectura.

### 3.1 Endpoint de escritura

```
POST https://connectors.windsor.ai/{conector}/actions?api_key=...
Content-Type: application/json

{ "account": "<id de cuenta>", "action": "<id de acción>", "params": {...} }
```

Implementado en `executeWindsorAction()` (`lib/windsor.ts`). No está
documentado formalmente por Windsor — se descubrió probando con una acción
inexistente hasta que el error dejó de quejarse de la ruta y empezó a quejarse
de campos faltantes.

Reglas duras de esta función:
- **Nunca reintenta.** Un timeout es ambiguo — la plataforma puede haber
  creado el objeto igual — y reintentar sobre eso duplicaría la creación. Se
  informa el fallo y se detiene ahí.
- Solo se llama desde una ruta protegida por la capacidad `aprobar_cambios` y
  con confirmación explícita del usuario (`app/api/constructor/ejecutar/route.ts`).

### 3.2 El flujo de publicación de una campaña

Ruta: `POST /api/constructor/ejecutar` (`app/api/constructor/ejecutar/route.ts`).

1. El plan que aprobó la persona en pantalla **no se confía**: el servidor
   recibe el mismo borrador (`draft`) que alimentó la simulación y vuelve a
   construir el plan de pasos (`buildPlan`) él mismo. Lo que se ve en pantalla
   es exactamente lo que corre.
2. Si el plan tiene algún problema bloqueante (faltan headlines, keywords,
   etc.) no se ejecuta nada.
3. Exige el campo `confirmacion: "CREAR"` explícito en el body — una petición
   perdida o repetida por error no puede crear una campaña.
4. Ejecuta los pasos del plan **en orden y se detiene en el primer error**,
   devolviendo qué se llegó a crear, para que nadie tenga que adivinar en qué
   estado quedó la cuenta real.
5. Todo lo creado nace **pausado** — lo pone `buildPlan` y Windsor lo respeta.
   Activar la campaña es un paso manual, deliberadamente fuera de esta ruta.

### 3.3 Encadenar pasos (campaña → grupo de anuncios → anuncio → keywords)

Crear una campaña completa es una secuencia de llamadas donde cada paso
necesita el id que devolvió el paso anterior (el id de la campaña para crear
su grupo de anuncios, el id del grupo para el anuncio y las keywords, etc.).
`buildPlan` deja un marcador (`MARCADOR_PASO_ANTERIOR`) en los campos que
todavía no tienen ese id porque se van a crear en este mismo plan; si el campo
ya trae un id real (por ejemplo, agregar un conjunto a una campaña que ya
existía antes de este plan), no se toca.

Tras cada paso de creación, `idDeResultado()` busca el id que dejó la
plataforma en la respuesta cruda de Windsor, siguiendo una lista de claves
conocidas (`campaign_id`, `id`, etc.) y recorriendo el objeto recursivamente.
Si no lo encuentra, el ejecutor se detiene ahí en vez de encadenar el
siguiente paso con un id inventado.

**Caso especial verificado con una ejecución real**: a diferencia de Meta,
la acción `create_campaign` de Google Ads no siempre devuelve el id en un
campo estructurado — a veces viene solo dentro de un texto libre, por ejemplo
`"result": "Search campaign '...' (id 24257873743) created successfully..."`.
`idDeResultado()` primero busca en los campos estructurados y, solo si eso
falla, aplica un regex de último recurso (`/\(id[:\s]+(\d+)\)/i`) sobre
cualquier string anidada en la respuesta.

### 3.4 Registro de auditoría

Cada intento de publicación (exitoso o no) se guarda en la tabla `ejecuciones`
de D1: cliente, quién lo hizo, nombre de campaña, plataformas, y el detalle
completo de cada paso (incluida la respuesta cruda de Windsor) como JSON. Este
registro es lo que permite reconstruir exactamente qué pasó cuando una
ejecución se detiene a mitad de camino — es lectura local, nunca requiere
volver a golpear la plataforma para saber qué se llegó a crear.

## 4. Motor de reglas (recomendaciones, fase 1)

`lib/reglas.ts` evalúa 4 reglas de optimización sobre las campañas activas de
cada cliente, comparando contra metas (`targetCpaMicros` / `targetRoas`) que
el equipo carga por cliente. **No ejecuta nada**: cada candidato que genera
nace con `autonomy: "N0"` — una persona tiene que aprobarlo manualmente antes
de que cualquier cosa se toque en la plataforma real. Nada en este motor llama
a `executeWindsorAction`.

Reglas:
1. **Kill switch por desperdicio** — gastó el doble de la meta de CPA sin
   ninguna conversión → sugiere pausar.
2. **Degradación de eficiencia** — con 3+ conversiones (volumen suficiente
   para confiar en el número), el CPA real ya es 40% peor que la meta.
3. **Escalar presupuesto** — el ROAS real supera la meta con margen sostenido
   (≥20%) → sugiere subir el presupuesto diario 20%.
4. **Reducir presupuesto** — el ROAS real cae bajo el 75% de la meta → sugiere
   bajarlo 15%.

Ventana de evaluación: **7 días terminados 2 días atrás**
(`rangoL7DConRezago`), no los últimos 7 días hasta hoy. El rezago de reporte
de conversiones de Meta y Google hace que los días más recientes subestimen
conversiones reales — decidir sobre eso leería una caída que todavía no
terminó de reportarse.

Las reglas de presupuesto (3 y 4) requieren conocer el presupuesto diario
actual; si la campaña de Meta usa presupuesto compartido a nivel de campaña
(Advantage Campaign Budget), Windsor no lo expone a ese nivel y esas
recomendaciones simplemente no se generan para ella — no se calcula a ciegas.

Cada recomendación tiene un id determinístico
(`{regla}-{proveedor}:{cuenta}:{campaña}-{fecha}`) insertado con
`INSERT OR IGNORE`: evaluar dos veces el mismo día no duplica la
recomendación, pero un día nuevo sí puede generar otra si el problema sigue.

## 5. Variables de entorno

Definidas en `.dev.vars` en desarrollo local (nunca en el repo). Solo se listan
los nombres — los valores viven fuera del control de versiones.

| Variable | Para qué |
|---|---|
| `OAUTH_ADMIN_EMAILS` | Lista de correos con acceso de administrador |
| `DEV_LOGIN_ENABLED` | Habilita el login simplificado de desarrollo |
| `OAUTH_TOKEN_KEY` | Clave para cifrar tokens de sesión/OAuth guardados en D1 |
| `GOOGLE_CLIENT_ID` | OAuth2 de Google (login) |
| `GOOGLE_CLIENT_SECRET` | OAuth2 de Google (login) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Requerido por Google Ads para llamadas de API (vía Windsor) |
| `META_APP_ID` | App de Meta for Developers |
| `META_APP_SECRET` | App de Meta for Developers |
| `WINDSOR_API_KEY` | Autenticación contra todos los endpoints de Windsor.ai (lectura y escritura) |

## 6. Tecnologías

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) sobre **vinext**, corriendo en el runtime de **Cloudflare Workers** |
| UI | React 19, Tailwind CSS v4, shadcn/ui (Radix UI / `radix-ui`), Sonner (toasts) |
| Formularios | react-hook-form + zod |
| Build / dev server | Vite 8 (`@vitejs/plugin-react`, `@vitejs/plugin-rsc`, `@cloudflare/vite-plugin`) |
| Base de datos | Cloudflare D1 (SQLite) + Drizzle ORM (`drizzle-orm`, migraciones con `drizzle-kit`) |
| Almacenamiento de archivos | Cloudflare R2 (binding `MEDIA`) — creativos subidos manualmente |
| Autenticación | Google OAuth2 con PKCE, sesión propia respaldada en D1 |
| Integración de datos de anuncios | Windsor.ai (normaliza Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads) |
| Lenguaje | TypeScript |
| Linting | ESLint 9 (`eslint-config-next`) |

## 7. Esquema de base de datos (D1 / Drizzle)

Definido en [`db/schema.ts`](../db/schema.ts), con migraciones versionadas en
[`drizzle/`](../drizzle/). Tablas principales:

- **`users`** / **`user_portfolios`** — cuentas del equipo y qué cliente
  (portfolio) puede ver cada una. Vacío para un rol que ve todo; para el
  resto, la ausencia de una fila significa que ese cliente no existe para esa
  persona.
- **`portfolios`** / **`portfolio_accounts`** — clientes de la agencia y las
  cuentas publicitarias (Google/Meta) que le pertenecen a cada uno, más sus
  metas de CPA/ROAS opcionales.
- **`decisions`** — recomendaciones generadas por el motor de reglas o por
  revisión humana, con su ciclo de vida (`pending` → aprobada / descartada /
  vencida).
- **`audit_events`** — bitácora de cada acción tomada sobre una decisión
  (firmar, descartar, posponer), con idempotencia.
- **`ejecuciones`** — bitácora de cada intento de publicación real de una
  campaña vía el Constructor (ver §3.4).
- **`integration_connections`** / **`integration_accounts`** — conexiones
  OAuth propias (no vía Windsor) y las cuentas publicitarias descubiertas por
  ellas.
- **`account_metrics_daily`** / **`metric_sync_runs`** — métricas diarias
  sincronizadas y el estado de cada corrida de sincronización.
- **`oauth_sessions`** — estado de PKCE en tránsito durante el login.
- **`app_meta`** — almacén clave/valor genérico, usado sobre todo como caché
  de las respuestas de Windsor (ver §2.3).
