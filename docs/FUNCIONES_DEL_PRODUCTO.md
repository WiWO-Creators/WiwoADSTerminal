# Funciones del producto

Qué hace cada pantalla y cada pieza de WiWO.ADS, para quién es y qué necesita para funcionar. Pensado para entender
el producto sin leer el código; las rutas de archivo indican dónde mirar.

> WiWO.ADS es para **gestionar campañas y ver información**. Los reportes mensuales para clientes son de otra
> herramienta (wiwometriq): no describir WiWO.ADS como «plataforma de reportes».

Roles mencionados: **admin**, **supervisor** (Digital Lead), **analista** (Digital Creator) y **cliente**. Detalle en
[`ROLES_Y_APROBACIONES.md`](ROLES_Y_APROBACIONES.md).

## 1. Menú y pantallas

| Entrada | Quién | Qué es |
|---|---|---|
| **Decisiones** | admin, supervisor, analista | Pantalla de entrada: cola de tarjetas con lo que conviene hacer (ver §4) |
| **Inversión** | admin, supervisor, analista | Presupuesto del mes frente al gasto (ver §5) |
| **Salud de medición** | todos | Tablero de campañas por plataforma, resultados por objetivo y vigilancia de GA4/GTM (ver §6) |
| **Cliente** | admin, supervisor, analista | Ficha del cliente y tabla de campañas, conjuntos y anuncios con botones para crear y editar |
| **Creador de campañas** | admin, supervisor, analista | El Constructor (ver §2) |
| **Solicitudes** | admin, supervisor, analista | Lo que se pidió y lo que hay que revisar |
| **Simulador** | — | Construido pero **oculto («Próximamente»)** en el menú |
| **Gestión → Auditoría** | solo admin | Línea de tiempo unificada de todo lo que pasó |
| **Gestión → Diagnóstico** | solo admin | Qué llave de Meta ve cada cuenta y página; qué variables de entorno están cargadas (solo sí/no) |
| **Gestión → Cuentas** | solo admin | Conexiones de Google, Meta y LinkedIn y qué cuentas se leen |
| **Gestión → Reglas / Lookalike** | admin, supervisor | Construidas pero **ocultas («Próximamente»)** |

Piezas que no son entradas de menú: **Equipo** (engranaje junto al usuario), la **puerta de cliente** (modal para
elegir cliente, agrupado por empresa MGC o WIWO), la paleta de comandos (Ctrl+K), **Ver como** (admin, solo lectura),
las alertas del encabezado, el aviso de versión nueva, el **asistente flotante** y la autoactualización de datos cada
2 h con la app abierta. Las pantallas «bloqueadas» siguen funcionando si se llega a ellas; solo el menú las deshabilita.

## 2. El Constructor (crear campañas)

`lib/constructor.ts`, `constructor-ejecutar.ts`, `constructor-servicio.ts`, `app/constructor-view.tsx`.

- Formulario único **campaña → conjunto → anuncio** (con solo Google adopta la estructura de Google:
  campaña → grupo → anuncio). Funciona en dos fases: **simular** (arma el plan y lo muestra, no toca nada) y
  **ejecutar** (exige permiso de aprobar y confirmar escribiendo `CREAR`). El servidor rearma el plan: lo que se
  aprobó en pantalla es lo que corre.
- **Quién:** admin y supervisor publican; el analista arma y pulsa «Enviar a revisión»; el asistente también puede
  enviar a revisión.
- **Plataformas:** Google (Búsqueda, Display, Performance Max), Meta y LinkedIn (grupo y campaña en borrador). TikTok
  es solo lectura. Se puede crear en una, en varias a la vez, con presupuesto y objetivo propios por plataforma.
- **Objetivos:** Tráfico, Leads, Ventas, Alcance e Interacción; cada plataforma puede tener el suyo. El nombre final
  sigue la nomenclatura `[OBJETIVO] [PLATAFORMA] Nombre`.
- **Validaciones bloqueantes** (resumen): nombre, plataforma y cliente; presupuesto mayor que cero (y fecha de
  término si es total); URL de destino válida; en Meta, texto e imagen o video, y píxel si el objetivo es leads o
  ventas; en Google, 3 a 15 títulos de hasta 30 caracteres y 2 a 4 descripciones de hasta 90. Los avisos no
  bloqueantes se muestran aparte.
- **Seguridades:** antiduplicado de 6 horas; si un paso falla a mitad, la campaña queda marcada como incompleta y
  pausada; se detiene en el primer error; los ids de un paso alimentan al siguiente.
- **Extras:** copiloto de textos con IA, generador de variantes de imagen, plan de estrategia (hoy solo Colombia /
  Valor), formulario instantáneo de Meta, segmentación de Meta con intereses y audiencias reales, mapa geográfico,
  selector de publicaciones existentes e impulsos, retiro de anuncios viejos al renovar y presupuesto en línea.
- **Brechas conocidas al crear:** sin fecha de inicio ni horario de entrega; en Meta solo Feed, Historias y Reels y
  sin carrusel; en Google sin Video, Shopping ni App; en LinkedIn sin anuncios.

## 3. El editor (modificar lo ya publicado)

`app/detalle-entidad.tsx`, `editar-entidad.tsx`, `editor-meta.tsx`, `lib/edicion-*.ts`, `lib/detalle-entidad*.ts`.

- Panel a pantalla completa con el **árbol** campaña → conjunto → anuncio a la izquierda, secciones al centro y
  **vista previa** a la derecha. Pestañas **Editar** y **Desglose** (por edad, género, red, posición, dispositivo, día
  y hora). Pregunta antes de cerrar con cambios sin aplicar. La idea es que se parezca al administrador de anuncios
  de cada plataforma, con los campos bloqueados donde ella los bloquea.
- Calcula un **antes y después** y solo envía lo que cambió. Pausar es explícito: editar ya no pausa.
- **Flujo:** simular → aplicar. El servidor relee la plataforma, aplica, verifica y registra en las bitácoras. Un
  analista solo puede **solicitar** el cambio.
- Qué campos se pueden editar en cada plataforma: ver [`PLATAFORMAS.md`](PLATAFORMAS.md).
- También desde aquí: **Boostear anuncio** (impulsar publicaciones de Facebook e Instagram), **contenido nuevo**
  (imágenes o carrusel en un conjunto de Meta) y «qué reemplazar» (renovar anuncios viejos).

## 4. Decisiones, recomendaciones y alertas

- **Decisiones** (`app/sugerencias-tinder.tsx`, `lib/sugerencias*.ts`): tarjetas con severidad, confianza y
  vencimiento. Se **aprueban** (ejecuta por el flujo normal), se **descartan** con motivo o se **posponen**. Un
  analista propone; un supervisor o admin aprueba. Un Orb integrado responde en pocas líneas y un «sí» aplica por el
  mismo camino que el botón.
- **Qué detecta** (`lib/contexto-cliente.ts`, `lib/sugerencias.ts`): sin actividad, gasto sin resultados, CPA o ROAS
  fuera de la meta, frecuencia o CPM altos, CTR bajo, resultados que caen, ritmo de presupuesto, contenido
  desactualizado (20 días sin anuncios nuevos), campaña apagada, y carencias de la ficha del cliente (sin presupuesto,
  KPI, metas, página, Instagram, GA4 o GTM). Las de medición solo las ven los admins.
- **Descartes:** «ya no estará activa», «es de temporada» o «pausada a propósito» silencian para siempre; cualquier
  otro motivo silencia 30 días. Sin metas de CPA o ROAS en la ficha no se evalúan esas reglas.
- **Alertas** del encabezado (`lib/alertas.ts`): desperdicio (2× el CPA), degradación (1,4× con al menos 3
  conversiones), límite de gasto, cliente sin GTM y solicitudes pendientes, con un clic para pausar.
- `lib/reglas.ts` (kill switch, degradación, escalar o reducir presupuesto) existe y tiene API, pero **no se llama
  desde la interfaz**: la pantalla Decisiones se alimenta de `lib/sugerencias.ts`.

## 5. Presupuesto

`lib/presupuesto*.ts`, `app/presupuesto-mes.tsx`. Presupuesto mensual del cliente contra el gasto del mes: restante,
ritmo diario disponible y proyección de cierre. Estados: en ritmo, adelantado (+10 %), atrasado (−20 % con al menos 7
días), agotado (98 %) y excedido. También por campaña y conjunto, histórico del año y segmentos. Cambiar presupuestos
de entidades lo aprueba solo un admin. Usa Windsor y Meta directo.

## 6. Medición y salud

- **Tablero de salud:** campañas por plataforma y estado, resultados por objetivo, mejores y peores campañas y
  anuncios, y resumen semanal (admin y supervisor).
- **Medición GA4 y GTM** (`lib/medicion*.ts`, `lib/ga4.ts`, `lib/gtm.ts`): detecta eventos de navegación marcados
  como clave, leads que no cuentan o dejaron de llegar y eventos duplicados. Hasta 12 propiedades de GA4 por cliente y
  el estado de GTM. **Solo vigila, no corrige.** Los hallazgos alimentan Decisiones (solo admin). Usa una cuenta de
  servicio de lectura.

## 7. Simulador, audiencias y reglas (construidos, hoy ocultos)

- **Simulador** (`lib/simulador*.ts`, `lib/estrategia.ts`): dado monto, días, objetivo y reparto, proyecta
  impresiones, clics y resultados con 90 días de historial del cliente, con rango y nivel de confianza. Interpreta un
  brief y exporta un .pptx de 3 láminas. No escribe en ninguna plataforma.
- **Audiencias** (`lib/contactos.ts`, `lib/meta-publicos*.ts`): carga de contactos (CSV o lista pegada, validada en
  el navegador y **nunca guardada**). Google: Customer Match en lotes de 10.000 con casilla de autorización
  obligatoria. Meta: audiencias similares y de visitantes del sitio por API directa (crear es solo de supervisores) y
  descarga de CSV con hash SHA-256. También **mensajería** (anuncios de WhatsApp, llamadas y Messenger).
- **Reglas automáticas** (`lib/reglas-automaticas*.ts`): «si [gasto, CPC, CTR, frecuencia, CPL o CPA] [≥ o ≤]
  umbral en [hoy, 7 días, mes o total], entonces [pausar, avisar o bajar presupuesto]». **Solo pausan**: nunca
  activan, borran ni suben presupuesto, y una regla disparada no se repite en el mismo periodo. Se evalúan con la app
  abierta o por un cron (`servidor/evaluar-reglas.mjs` llama a `/api/reglas/programado`, protegido por `CRON_SECRET`).
  Además hay lectura y copia de **reglas nativas de Meta**.

## 8. Estrategia y formularios de Meta

- **Plan de estrategia** (`lib/estrategia-pura.ts`): convierte una estrategia aprobada en borradores del Constructor,
  públicos por crear y un calendario de hitos. Hoy hay un solo plan (Colombia / Valor Development). Nada se publica
  solo.
- **Formularios instantáneos** (`lib/meta-formularios*.ts`, `lib/meta-lead-ads*.ts`): leer, crear, archivar y leer
  leads, con la regla de lead «calificado» y los modos «más volumen» y «mayor intención». Crear pide simular antes y
  no se puede borrar después. Falta el permiso `leads_retrieval` en el token de Meta para leer leads.

## 9. Creatividades

- **Copiloto de textos** (`lib/copiloto-creativos.ts`): Claude propone títulos y textos recortados a los límites
  reales de cada plataforma. No aplica nada solo. Necesita `ANTHROPIC_API_KEY`.
- **Generador de variantes** (`lib/generador-creativos.ts`): Gemini adapta una imagen a otras proporciones. Solo Meta,
  base de hasta 4 MB. Necesita `GEMINI_API_KEY`; sin ella responde 503.
- **Orb** (`THINKING_ORB.md`, `thinking-orb.css`): indicador visual de «pensando», con estados y tamaños. Es una pieza
  de interfaz, no una función; aparece en el asistente, en Decisiones y en los botones de carga.

## 10. El asistente de IA

`lib/asistente*.ts`, `app/asistente.tsx`. Chat con Claude en streaming (hasta 6 vueltas de herramientas, 24 mensajes
de historial). Con un cliente elegido solo habla de ese cliente. Acepta un CSV adjunto y lo trata como dato, no como
instrucción. Necesita `ANTHROPIC_API_KEY`.

- **Lee:** listar clientes, buscar campañas, resumen y detalle de cliente o campaña, desglose, piezas de un conjunto y
  reglas de Meta. Busca en la web solo contexto público del negocio, nunca datos operativos.
- **Propone, sin aplicar:** ediciones (tarjeta con antes y después), cambios de estado, impulsos y precarga del
  Constructor. **Crea solicitudes pendientes** de aprobación para enviar campañas a revisión, impulsar publicaciones
  por enlace y subir contenido.
- **Escribe solo dentro de WiWO.ADS:** notas de memoria (visibles y borrables por el equipo), solicitudes y registros
  de auditoría sin secretos.
- **No puede:** escribir por sí mismo en Google, Meta o LinkedIn, inventar cifras o ids, mezclar monedas ni guardar en
  memoria datos personales o claves. El cambio real lo aplican los endpoints de siempre, que revalidan rol, alcance y
  bitácora. Al analista se le indica que solo aconseje.

## 11. Otras pantallas

- **Cliente:** ficha (KPI principal, metas, presupuesto mensual, GA4, GTM, página, Instagram, píxeles, países,
  segmentos, empresa, archivado) y tabla con comparación contra el periodo anterior y columna «Creador».
- **Solicitudes:** «por revisar» y «mías», con antes y después. Tipos: campañas, ediciones, contenido nuevo e impulsos
  de Instagram. Aprobar, rechazar con motivo o cancelar.
- **Auditoría:** categorías asistente, solicitud, decisión, cambio, creación, regla y equipo; filtros por categoría,
  cliente, persona, periodo y texto; «solo importantes»; detalle técnico con los pasos crudos. La app solo escribe: no
  edita ni borra eventos.
- **Cuentas:** conexión del equipo de Google, Meta y LinkedIn, y elección de qué cuentas se leen.
- **Diagnóstico:** estado de las llaves de Meta y de las variables de entorno (solo sí/no).

## 12. Qué necesita cada función para funcionar

| Función | Necesita |
|---|---|
| Casi todo (lectura, pausar, crear en Meta y Google simple) | `WINDSOR_API_KEY` |
| Lectura y escritura directa de Meta, formularios, audiencias | `META_SYSTEM_USER_TOKEN` (y `META_APP_ID`/`META_APP_SECRET` para conectar por OAuth) |
| Google directo (Búsqueda estructurada, PMax, Display, editar contenido) | Conexión de Google del equipo + `GOOGLE_*` |
| LinkedIn directo | Conexión del equipo + `LINKEDIN_*` (y `LINKEDIN_ESCRITURA_CLIENTES` para clientes) |
| Asistente, copiloto, Decisiones con Orb | `ANTHROPIC_API_KEY` |
| Variantes de imagen | `GEMINI_API_KEY` |
| Reglas por cron | `CRON_SECRET` y `APP_URL` |
| Sesión y tokens cifrados | `SESSION_SECRET`, `OAUTH_TOKEN_KEY` |
