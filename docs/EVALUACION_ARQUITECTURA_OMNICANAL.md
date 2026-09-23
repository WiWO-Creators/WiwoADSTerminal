# Evaluación de la propuesta de arquitectura omnicanal

Este documento responde a una propuesta técnica recibida ("Especificación
Técnica y Arquitectura de Sistema — evolución omnicanal") que describe un
rediseño de WiWO.ADS: SDKs nativos por plataforma en vez de Windsor.ai,
esquema Zod, tabla de geotargets multiplataforma, publicación en dos fases
(dry-run + Saga con rollback), hub de facturación y un motor de detección de
anomalías.

La propuesta no está escrita contra este repositorio — describe una
arquitectura genérica de "plataforma omnicanal de medios pagados" que podría
aplicar a cualquier proyecto del rubro, no a este. El objetivo de este
documento es separar, sección por sección, qué es real hoy, qué es una buena
idea con un camino de implementación concreto, y qué requiere primero una
decisión de negocio (presupuesto, tiempo, revisión de plataformas) antes de
que tenga sentido diseñarlo en código. Cita [`docs/ARQUITECTURA.md`](ARQUITECTURA.md)
para el detalle de cómo funciona el sistema real hoy; no lo repite.

## 1. Punto de partida real (lo que la propuesta no ve)

- **Framework**: vinext (Next.js App Router) sobre **Vite**, no "Next.js 16"
  standalone — ver `vite.config.ts`. El estado del Constructor es `useState`
  de React normal, **no Zustand** — no hay ninguna dependencia de Zustand en
  `package.json`.
- **Validación de datos**: `normalizeDraft` en [`lib/constructor.ts`](../lib/constructor.ts)
  es una función a mano, campo por campo. El proyecto **no usa Zod** en
  ningún lado hoy.
- **Todo el rendimiento y todas las escrituras reales pasan por Windsor.ai**
  — no hay ningún cliente nativo de Google Ads API, Meta Graph API, TikTok
  Business API ni LinkedIn Marketing API en el repo. Es la única integración
  externa de escritura que existe (`lib/windsor.ts`, `executeWindsorAction`).
- **TikTok y LinkedIn** ya están en el registro de plataformas
  (`lib/plataformas.ts`) pero **desactivados** — no es que falte conectarlos
  en código, es una decisión ya tomada de no activarlos todavía.
- **No hay Zustand, no hay Saga, no hay cron de detección de anomalías, no
  hay hub de facturación.** Ninguno de los cuatro existe hoy en ninguna
  forma parcial.

## 2. Sección por sección

### 2.1 "Arquitectura de desacoplamiento" (SDKs nativos reemplazando a Windsor)

Es el cambio más grande de la propuesta y el que más determina todo lo
demás (la tabla de geotargets multiplataforma, el hub de facturación y el
Saga de rollback solo tienen sentido si esto se hace primero).

**Lo que la propuesta no dice, y que cambia si vale la pena**: cada API
nativa exige su propio proceso de habilitación, no solo una librería:

| Plataforma | Qué exige para escribir de verdad |
|---|---|
| Google Ads API | Developer token propio, aprobado por Google (nivel "Standard" para producción, revisión de uso) |
| Meta Marketing API | App propia en Meta for Developers + **App Review** para el permiso `ads_management` (revisión manual de Meta, con video de uso, puede tardar semanas y ser rechazada) |
| TikTok Business API | Cuenta de partner aprobada por TikTok |
| LinkedIn Marketing API | Ingreso al Marketing Developer Platform, también con revisión |

Hoy WiWO.ADS evita las cuatro revisiones a la vez porque Windsor ya las
tiene resueltas de su lado — es la razón real, documentada en
`docs/ARQUITECTURA.md` §2, de por qué se eligió Windsor para leer. Reemplazar
la escritura por SDKs nativos **repite ese mismo costo, multiplicado por
cuatro**, y agrega mantenimiento continuo de compliance con cada plataforma
(cambios de versión de API, políticas de anuncios, renovación de tokens).

**Veredicto**: no es una decisión de arquitectura de software, es un
proyecto de negocio con presupuesto y tiempo propios (semanas a meses por
plataforma, sin garantía de aprobación). No debería tratarse como una
sección más de un documento técnico — necesita una decisión explícita de a
qué plataforma vale la pena dedicarle ese costo, y por qué (¿qué no se puede
hacer hoy por Windsor que sí se necesita?).

### 2.2 Esquema Zod unificado

La forma del schema (`UniversalCampaignDraftSchema`) es razonable como
ejercicio de diseño, pero asume el resultado de 2.1: campos como
`platformKeys.tiktokId` o `.linkedinUrn` no tienen ninguna fuente de datos
real hoy (Windsor no expone esas plataformas para escritura), así que
declararlos en un schema no los hace existir — quedarían siempre vacíos o,
peor, alguien terminaría completándolos a mano, que es exactamente lo que la
regla de oro del proyecto prohíbe (`docs/ARQUITECTURA.md`, nunca se adivina
un id).

Adoptar Zod en sí (sin el resto de la propuesta) es una mejora legítima y
acotada sobre `normalizeDraft` — pero es una decisión de estilo de código,
no de arquitectura, y se puede hacer sola, cuando se quiera, sin depender de
nada más de este documento.

### 2.3 Tabla `geo_targets_multiplatform`

Ya existe una versión de esto para Google: [`drizzle/0014_geo_targets.sql`](../drizzle/0014_geo_targets.sql),
sembrada desde la tabla oficial de geo targets de Google Ads (219 países +
~99.700 regiones y ciudades, verificado dato por dato contra esa fuente, no
inventado). Se agregó esta sesión y ya está integrada en el Constructor
(pestaña "Región / Ciudad").

Las columnas `metaKey`, `tiktokLocationId` y `linkedinUrn` que propone la
tabla multiplataforma **no tienen hoy ninguna fuente verificada**: se
confirmó recién, contra el propio `list_actions` de Windsor, que el
conector `facebook` no expone una forma de buscar sus propios ids de
región/ciudad (es un sistema de ids completamente distinto al de Google, y
Meta no publica una tabla estática descargable como Google — sus ids salen
de un endpoint de búsqueda en vivo de su Marketing API, `Targeting Search`,
al que hoy no se tiene acceso sin el punto 2.1 resuelto para Meta). Lo mismo
aplica, sin verificar todavía, a TikTok y LinkedIn.

**Veredicto**: la idea de una tabla federada es correcta y ya está en marcha
para Google. Agregar columnas para plataformas sin fuente de datos real hoy
sería la primera excepción a la regla de oro del proyecto — no se recomienda
hasta que 2.1 esté resuelto para esa plataforma específica.

### 2.4 Publicación en dos fases: dry-run + Saga con rollback

Esta es la idea más valiosa de todo el documento, y llega en buen momento:
**hoy mismo se encontró un caso real** donde `execute_action` de Windsor
devolvió éxito (200, con un id de campaña) para una campaña de Meta que
nunca llegó a existir en la cuenta real — confirmado contra Meta
directamente (ni en el listado de campañas de la cuenta, ni en su historial
de cambios). El sistema no tiene forma de distinguir ese caso de un éxito
real, porque confía en el código de estado HTTP de Windsor
(`executeWindsorAction`, `docs/ARQUITECTURA.md` §3.1).

El problema real, sin embargo, es distinto al que resuelve un dry-run de
SDK nativo: **Windsor no expone un modo `validate_only`** en ninguna de sus
acciones de escritura (se revisó el schema completo de `create_campaign`,
`create_adset`, `create_ad_group` de Google y Meta vía `list_actions` — no
existe ese parámetro). Un dry-run de verdad, tal como lo describe la
propuesta, solo es posible si se resuelve 2.1 para esa plataforma.

**Lo que sí se puede hacer hoy, sin esperar a 2.1**: una verificación de
*lectura* después de cada creación — antes de decirle a la persona "se
creó", releer la entidad recién creada (por su id) contra Windsor y
confirmar que existe de verdad, en vez de confiar ciegamente en el `ok` de
la respuesta de escritura. No es un dry-run ni dispara `PAUSE`/`DELETE`
automático (eso sí exigiría 2.1: hoy no hay ninguna acción de rollback que
no sea pausar, y pausar algo que nunca se llegó a crear no tiene sentido) —
es una verificación de "lo que digo que pasó, pasó", que habría evitado el
caso de hoy sin rediseñar nada.

### 2.5 Hub de facturación

Funcionalidad completamente nueva, sin ningún antecedente en el sistema
actual (ni la tabla `billing_invoices`, ni ningún endpoint de facturación).
Depende por completo de 2.1: los cuatro endpoints que cita
(`InvoiceService.ListInvoices` de Google, `/transactions` de Meta,
`/transaction/get/` de TikTok, `/adInvoices` de LinkedIn) son APIs nativas,
no algo que Windsor exponga — no se verificó porque no aplica hasta que
exista una integración directa con al menos una de esas plataformas.

**Veredicto**: es un producto aparte, no una sección de arquitectura. Vale
la pena evaluarlo como iniciativa propia, con su propio alcance, el día que
2.1 esté resuelto para al menos una plataforma.

### 2.6 Asistente de IA — `producir_borrador_campana`

Funcionalmente es lo mismo que ya existe hoy como `abrir_constructor`
(`lib/asistente.ts`): deja un borrador precargado, nunca publica, la persona
decide. El texto de restricciones que propone ("nunca inventes ids de
geolocalización", "la confirmación final es responsabilidad exclusiva del
humano") ya es exactamente la regla vigente — de hecho, más estricta hoy que
antes: esta misma semana se sacó del asistente la única excepción que tenía
para crear campañas reales directamente (`crear_campana_real`), justo
porque permitió el caso descrito en 2.4 donde el asistente confirmó una
creación que no era real. Cualquier rediseño del asistente debería partir
de ese incidente, no solo del catálogo de herramientas.

### 2.7 Motor de detección de anomalías

Idea razonable (spend velocity, caída de tracking de conversiones) y ya hay
una base parcial, aunque más desconectada de lo que parece: `lib/reglas.ts`
evalúa 4 reglas de optimización (kill switch por desperdicio, degradación de
eficiencia, subir/bajar presupuesto) comparando contra metas por cliente,
siempre en modo lectura (`autonomy: "N0"`, nunca llama a
`executeWindsorAction`). Pero **su pantalla de cola de decisiones se sacó de
la interfaz** — hoy no tiene ninguna entrada de menú; las recomendaciones
que sí ve la persona vienen del asistente de IA, que lee los datos en vivo
por su cuenta, no de este motor (`docs/ARQUITECTURA.md` §4). Un cron de
detección de anomalías necesitaría, además del trigger, decidir dónde
aparece esa alerta — resucitar la cola, o mandarla por otro canal — no es
solo "agregar un Cron Trigger de Cloudflare Workers" sobre lo que ya existe.
El webhook a WhatsApp Business API es, aparte, su propia integración con
revisión propia — Slack o email son mucho más simples: webhook o SMTP sin
revisión.

### 2.8 Motor de UTMs

La única sección sin dependencias de las anteriores. Encaja directo con
`nombreCompuesto` (`lib/nomenclatura.ts`), que ya resuelve el mismo problema
para el nombre de campaña. Es el ítem de menor costo y menor riesgo de todo
el documento.

## 3. Qué haría ahora, en orden

1. **Verificación de lectura tras escribir** (§2.4, la mitad "sin esperar a
   2.1"). Responde directo al incidente de hoy, no depende de ninguna
   decisión de negocio, y es un cambio acotado sobre
   `lib/constructor-ejecutar.ts`.
2. **Motor de UTMs** (§2.8). Bajo riesgo, reutiliza el patrón que ya existe.
3. **Cron de reglas** (§2.7, sin el webhook de WhatsApp todavía). Reutiliza
   `lib/reglas.ts`, pero primero hay que decidir dónde se ve la alerta
   (¿se resucita la cola de decisiones, o va por un canal nuevo tipo
   Slack/email?) — no es solo agregar el trigger.

## 4. Qué necesita una decisión de negocio antes de diseñarse en código

- **Reemplazar Windsor por SDKs nativos** (§2.1), plataforma por
  plataforma: ¿cuál, primero, y por qué (qué no se puede hacer hoy que se
  necesita)?
- **Activar TikTok y LinkedIn** de verdad (ya están en el registro,
  desactivados a propósito) — es la misma pregunta que arriba, acotada a
  esas dos.
- **Hub de facturación** (§2.5): producto aparte, depende de al menos una
  integración nativa.
- **Geotargets para Meta/TikTok/LinkedIn** (§2.3): depende de que esa
  plataforma tenga integración nativa con acceso a su propio endpoint de
  búsqueda geográfica.
