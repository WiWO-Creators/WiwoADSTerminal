# Control total desde WiWO.ADS: qué se puede extraer y operar, y qué falta

Estado al 2026-10-05. «Windsor» = el conector actual; «API directa» = Marketing API de Meta / Google Ads API con credenciales propias.

## 1. Cómo se obtiene hoy la información

| Plataforma | Lectura | Escritura | Límite real |
|---|---|---|---|
| Meta | Windsor (campañas, conjuntos, anuncios, métricas, creatividades, orgánico FB/IG) | Windsor: crear campaña/conjunto/anuncio, boost_post, editar presupuesto, puja, segmentación, creatividad, `spend_cap` de campaña, pausar/activar | **Windsor no tiene acciones de audiencias** (ni personalizadas ni lookalike), ni de facturas, ni de borrar. `boost_post` solo funciona en conjuntos de campañas de **interacción** (ON_POST). |
| Google Ads | Windsor + API directa nativa (v25, token Básico) | Windsor: Búsqueda/Display, presupuesto, puja, keywords; API directa: Display con imagen, Performance Max, editar RSA, fechas, redes, rotación | Windsor crea solo Search/Display y presupuesto diario. Falta: App, Local, Shopping/feeds, Video, Demand Gen, IA Max. |
| TikTok / LinkedIn | Windsor (solo lectura) | nada | Windsor solo pausa/activa y presupuesto en estos conectores; creación no. |
| GA4 / GTM | Cuenta de servicio (solo lectura) | nada | Falta permiso por contenedor GTM. |

## 2. La mejor manera de extraer TODO (recomendación)

1. **Meta: pasar a Marketing API directa con un usuario del sistema** (System User) del portafolio comercial, en vez de depender del token personal. Da en un solo token: audiencias personalizadas y lookalike, reglas automatizadas, facturas/transacciones (`/{cuenta}/transactions`, `/{negocio}/business_invoices`), registro de actividad, píxeles y calidad de eventos (CAPI), catálogos, tests A/B y estudios de lift, biblioteca de anuncios, límites de gasto de cuenta y campaña, y creación de todos los objetivos (incl. App, Ventas por catálogo). El conector oficial de Meta Ads disponible en esta sesión expone justo esas herramientas, lo que confirma que el alcance existe en la API.
2. **Google: seguir ampliando la vía nativa** (ya probada): `AudienceService`/`UserListService` (listas, Customer Match, audiencias similares), `InvoiceService` (facturas, solo cuentas con facturación mensual), `BillingSetup`/`AccountBudget` (límites), `ConversionActionService` (conversiones), `Recommendation`, `KeywordPlan`, `Experiment`, y todos los tipos de campaña por mutación.
3. **Windsor se queda para lectura histórica unificada** (todas las plataformas en un formato) y para TikTok/LinkedIn; lo que Windsor no tenga se hace directo.
4. **Guardar lo extraído** en tablas propias (campañas, conjuntos, anuncios, audiencias, facturas, reglas) con histórico diario, para no depender de la velocidad de Windsor ni de su caché.

## 2b. Hecho en esta ronda
- **Impulsar** (menú; pensado para celular): cliente → campaña → conjunto → publicación de Facebook u anuncio existente → solicitud (analista: va a revisión; supervisor: «Aprobar y publicar pausado» al instante). Advierte cuando la campaña no es de interacción.
- **Filtros por columna** en la tabla de anuncios: cualquier métrica, «mayor o igual» / «menor o igual», acumulables.
- **Límite de gasto**: alertas del presupuesto mensual del cliente (excedido, casi agotado, ritmo por encima). Solo avisa, no pausa nada solo.
- **Facturas**: reglas de carpeta `INVOICE / CLIENTE / MES / EXTRACTO | FACTURA / archivos` y clasificación del tipo de documento (`lib/facturas-pura.ts`, con tests). Falta la descarga real (ver pendientes).

## 3. Pendientes que dependen de ti (accesos o decisiones)

### Accesos y credenciales
1. **Meta, usuario del sistema** en cada portafolio comercial (MG Consulting con 14 cuentas, ALO GROUP, Anker Argentina y Chile, Funeraria María Ayuda, Meetwiwo, Pacífico, Primeros Pueblos), con permisos `ads_management`, `ads_read`, `business_management`, `pages_read_engagement`, `instagram_basic`, `leads_retrieval`. Un solo token con acceso a todos los clientes es lo que ya se estaba conversando con tu jefatura. Sin esto no se puede: audiencias, lookalike, facturas, reglas, CAPI.
2. **App de Meta**: pasar de modo Desarrollo a Producción y pedir **Advanced Access** para esos permisos (revisión de Meta; requiere política de privacidad y video del uso).
3. **Google Ads**: confirmar que la conexión del equipo es hola@wiwo.me, y desactivar la cuenta cancelada 731-375-6933 en Cuentas → Administrar. Para facturas: decir qué cuentas tienen **facturación mensual** (las de tarjeta no tienen facturas por API).
4. **Carpeta de destino de facturas**: Google Drive (o similar) con una cuenta de servicio con permiso de editor sobre la carpeta raíz INVOICE, o decirme otro destino.
5. **GTM/GA4**: dar «Leer» a la cuenta de servicio en cada contenedor GTM (Ébano, Corotú, Foundaxis, SQM, Bodenor, Funeraria, Primeros Pueblos) y GA4 (WEB VALOR, 5 de SQM, CLSelection); instalar GTM en Colbún; decidir cuáles de las más de 20 propiedades de ALO importan.
6. **Palta Meta** (1645720452948877): Windsor no la lista; hay que conectarla ahí o resolverla con el usuario del sistema.
7. **ANTHROPIC_API_KEY** en el entorno para probar en vivo la memoria del asistente y `impulsar_publicaciones`.
8. **Producción**: aplicar migraciones 0024–0031 y desplegar (no se ha hecho; los commits los pides tú).

### Decisiones tuyas
9. **Facturas**: confirmar que «extracto» = estado de cuenta / recibo de pago y «factura» = documento fiscal. Cuando un documento diga ambas cosas queda «SIN_CLASIFICAR» para que lo revises, no se adivina.
10. **Límite de gasto**: ¿solo alertas (hoy) o también pausar solo al llegar al tope? Lo segundo contradice la regla «la IA solo propone»; necesito tu OK explícito y qué nivel (cuenta, campaña).
11. **Instagram en impulsos**: el impulso por id solo está verificado para Facebook; para Instagram hay que decidir si se arma un anuncio nuevo con la imagen (más trabajo) o se usa el API directo de Meta (`boost_ig_post`) cuando exista el token del punto 1.

### Implementación grande que falta (requiere el acceso de arriba)
- **Audiencias y lookalike en Meta** (personalizada de sitio/lista de clientes/video/Instagram/formulario, similar 1–10 %, guardada): necesita el punto 1. Hoy la pantalla Audiencias solo opera Google.
- **Facturas reales**: leer de Meta (`business_invoices`/`transactions`) y Google (`InvoiceService`), clasificar, y subir a la carpeta de Drive con `rutaDeDocumento`. Necesita puntos 1, 3 y 4.
- **Todos los objetivos por plataforma**: hoy el Constructor tiene Tráfico, Leads, Ventas, Alcance e Interacción. Faltan **Promoción de aplicación** (Meta y Google), **Visitas a tiendas locales** y **campaña sin objetivo** (Google), Shopping/Video/Demand Gen. Windsor no las crea; se hacen por API directa.
- **Reglas automáticas** (pausar, escalar presupuesto, cambiar puja por condición): decisión del punto 10 + token Meta/Google.
- **Impulsar en un conjunto de tráfico/otra campaña**: Meta solo lo permite en campañas de interacción. El conjunto «GIVEAWAY | HIG-QUALITY UGC SEP» de Anker Chile está en una campaña de **Tráfico** (aunque se llama [AE]), así que por Windsor no se puede impulsar ahí; hay que crear un conjunto de interacción o resolverlo con API directa.
- **Probar con cuentas reales**: aprobar una solicitud, la detección de «activa», Performance Max real, ediciones nuevas de Meta/Google.
