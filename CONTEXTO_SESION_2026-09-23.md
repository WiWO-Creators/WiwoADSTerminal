# Contexto de sesión — WiWO.ADS, 23-09-2026

Documento de traspaso para retomar el trabajo en una conversación nueva. Escrito para Claude (o cualquiera que necesite ponerse al día rápido), no para presentar a un cliente.

## Qué es WiWO.ADS

Plataforma interna de la agencia para manejar campañas de Google Ads y Meta Ads de todos los clientes desde un solo lugar, conectada en vivo a las plataformas reales vía **Windsor.ai** (no un sandbox). Next.js/vinext sobre Vite, Cloudflare Workers + D1, rama de trabajo `devAmaro`. El README versionado es boilerplate del starter, no describe el producto real.

Piezas centrales:
- **Constructor** (`app/constructor-view.tsx` + `lib/constructor.ts`): arma campaña → conjunto → anuncio para Google y Meta, todo nace pausado, nunca publica sola. `lib/constructor-ejecutar.ts` es el bucle que de verdad escribe en Windsor.
- **Thinking Orb**: asistente de IA (`lib/asistente.ts`) que interpreta el pedido en lenguaje natural y deja el Constructor precargado (`abrir_constructor`) — nunca publica nada por su cuenta.
- **Anuncios** (`app/anuncios-view.tsx`): tabla tipo administrador de anuncios, 3 niveles (campaña/conjunto/anuncio), unificando Google y Meta.
- Todo lo que escribe de verdad en una plataforma pasa por `executeWindsorAction` (`lib/windsor.ts`) — es el único punto de escritura real del sistema.

## El evento que disparó esta sesión: auditoría real de Colbún "Plan Hogar"

El usuario (Amaro) armó una campaña de prueba para Colbún vía Thinking Orb → Constructor → publicar, y después la auditó **contra las cuentas reales** (Meta por API, Google Ads en vivo — no contra lo que dijo el chat). Encontró contradicciones graves entre lo que el chat afirmaba, lo que el JSON del plan mostraba, y lo que existía de verdad en las plataformas. Esto llevó a una ronda de fixes reales, verificados contra el código y contra `list_actions` de Windsor (nunca adivinados).

### Bugs reales encontrados y corregidos (todo en `devAmaro`, ver commits abajo)

1. **Geo-targeting: país + comunas juntos anulaban la segmentación fina.** `paisesEfectivos()` (compartida por Google y Meta) caía al país por defecto de la cuenta cada vez que no se elegía un país a mano, sin mirar si ya había comunas/radio elegidos. Como la segmentación de Windsor es una unión (no intersección), país + comunas = todo el país. Confirmado en vivo: Chile + 4 comunas de RM terminó segmentado a los 18,7 M de habitantes del país. **Arreglado**: el país solo se usa como default cuando no hay nada más fino.

2. **Meta: conjunto de anuncios fallaba en silencio para leads/ventas.** `OFFSITE_CONVERSIONS` exige `promoted_object` (pixel_id + custom_event_type) — verificado contra el schema real de `create_adset`. WiWO.ADS no tenía dónde guardar el píxel de una cuenta de Meta. **Arreglado con infraestructura nueva**: columna `pixel_id` por cuenta (migración `drizzle/0015_pixel_por_cuenta.sql`, **aplicada solo en LOCAL, no en remoto todavía**), editable en la ficha del cliente. Con píxel configurado, leads/ventas optimizan de verdad (LEAD/PURCHASE); sin píxel, ahora **bloquea antes de publicar** en vez de crear algo condenado a fallar (decisión explícita del usuario: bloquear, no degradar en silencio).

3. **"Alcance" (awareness) pedía mal el optimization_goal.** Nunca tuvo sentido pedir `OFFSITE_CONVERSIONS` para una campaña de reconocimiento — se corrigió a `REACH`, que no exige píxel.

4. **`boost_post` de Meta iba a fallar siempre.** Encontrado revisando el flujo (no en una prueba en vivo): el conjunto de anuncios para boostear una publicación no mandaba `promoted_object` con la página, y Windsor lo exige siempre para esa acción. Arreglado.

5. **Presupuesto sugerido, un solo número para dos plataformas.** El sistema calculaba un presupuesto sugerido para "la plataforma principal" nada más, lo autocompletaba en silencio sin volver a armar el plan, y eso dejaba mostrar "Falta presupuesto" y `budget_amount_micros: 0` a la vez que un número "ya puesto". Reproducido tal cual en la prueba real. **Arreglado**: presupuesto sugerido por plataforma, con botón "Usar" explícito por plataforma; ya no hay autocompletado invisible.

6. **502 en vivo durante la presentación real.** Causa: la pieza del anuncio de Meta era una URL firmada del CDN de Instagram (con vencimiento incluido en la URL) tomada vía "Elegir publicación existente" — Meta no siempre puede re-descargar su propio CDN firmado desde otro lado. No era un bug del código. Se agregó un aviso explícito sobre esto en el nuevo editor de anuncios.

7. **Google Display bloqueado a propósito.** Verificado contra `list_actions`: la única acción de creación de anuncio en Google es `create_responsive_search_ad` (texto puro para Búsqueda) — no existe ninguna acción para un anuncio de Display con imagen. Elegir "Red de Display" ahora bloquea con el motivo explícito, en vez de dejar crear algo que la API real rechazaría.

### Feature nueva: edición de anuncios de Meta (no existía antes)

`app/editar-anuncio.tsx` (nuevo) — diálogo para editar mensaje, título, descripción, enlace, botón de acción e imagen de un anuncio de Meta **ya publicado**, vía `update_ad_creative` (verificado real). También permite renombrarlo (`update_ad`). Botón (lápiz) en `anuncios-view.tsx`, solo a nivel de anuncio y solo en Meta.

**Solo Meta** — confirmado que Google no tiene ninguna acción de escritura para editar el contenido de un anuncio ya creado; para Google hay que crear uno nuevo y pausar el viejo. El prompt de Thinking Orb (`lib/asistente.ts`) se corrigió para reflejar esto (antes decía, incorrectamente, que "editar textos" no existía en ninguna plataforma).

### Feature nueva: columnas personalizables + filtro por objetivo en Anuncios

Botón "Columnas" en la tabla de Anuncios (`app/anuncios-view.tsx`): elegís qué métricas mostrar (checkboxes), se recuerda en el navegador (localStorage, es preferencia de vista). Nuevas columnas: CTR, CPC, CPM (derivadas), Alcance, Clics al enlace, Interacciones, Leads, Compras (Meta), Conversiones (Google) — todas con datos que Windsor **ya trae hoy** para esta tabla (verificado contra `camposAnuncio` en `lib/plataformas.ts`). Más un filtro por Objetivo.

**Pendiente, no prometido a ciegas:** el usuario pasó el catálogo completo de métricas de Meta Ads Manager y Google Ads (ROAS, video, visibilidad, atribución, cobertura, diagnóstico…). Windsor no trae todo eso por esta vía automáticamente — cada métrica nueva necesita verificarse antes contra `get_fields` de Windsor. **No se pudo hacer en esta sesión porque el MCP de Windsor.ai se desconectó** (ver más abajo). Es la continuación natural cuando el MCP vuelva a estar disponible.

### Otras correcciones menores de esta sesión (commits `0a1a4b1`, `dd420b0`)

- Auto-actualización del catálogo: de 7 días a 2 horas, con candado (`app_meta`) para evitar barridos duplicados si dos personas actualizan a la vez.
- `CampoDinero`: campos de presupuesto sin las flechas nativas de `type="number"`, con puntos de miles y "$" automáticos.
- Timeout de `fetchFacebookPosts`/`fetchInstagramMedia` subido a 110s (antes 60s) — la primera lectura de una cuenta nueva es lenta de verdad, y el timeout corto forzaba un reintento que duplicaba la espera.
- Los toasts (Sonner) ya no tapan el botón flotante de Thinking Orb (mismo rincón, offset agregado).

## Estado de git — importante

- Rama `devAmaro`. **2 commits locales sin pushear**: `c0c39d6` (boost fix + edición de anuncios) y `11f8543` (columnas personalizables). El resto (hasta `5ed3680`, que incluye el merge con el menú lateral compacto de un compañero) **ya está pusheado**.
- El usuario no ha pedido subir este último lote — confirmar antes de hacerlo.
- Migración `drizzle/0015_pixel_por_cuenta.sql` aplicada **solo en local** (`--local`). Falta aplicarla en remoto para que el píxel de Meta funcione en producción. Mismo patrón que las migraciones 12–14 anteriores: se aplican a remoto a propósito, no en automático.

## Windsor.ai MCP — desconectado en esta sesión, pero la cuenta está bien

El MCP `claude.ai Windsor.ai` se desconectó durante esta conversación (sesión muy larga). **No es un problema de la cuenta**: el usuario confirmó con captura que Windsor.ai figura con ✓ (conectado) en la configuración de conectores de claude.ai, igual que Meta Ads — no aparece en la lista de "Reconectar" (a diferencia de Semrush o Vista Social, que sí tenían el problema real de autorización). La solución es abrir una conversación nueva, que reinicializa las herramientas MCP desde cero.

## Aprendizaje clave de toda la sesión (ya guardado en memoria también)

**Windsor tiene dos lados independientes: escritura (`execute_action`, confiable) y lectura (`get_data` y todo lo construido sobre eso, como el catálogo). La lectura va horas atrás de la escritura.** Nunca declarar "verificado, no falta nada" solo mirando la lectura de Windsor — hay que chequear la plataforma real (API directa de Meta, o pedirle al usuario que mire la plataforma) o la bitácora propia (`ejecuciones` en D1). Esto costó dos veces en esta sesión antes de aprenderlo bien.

## Ideas discutidas, no implementadas (roadmap, no bugs)

- Reread post-ejecución más profundo (comparar geo/idioma/presupuesto reales, no solo "existe/no existe") — limitado porque Windsor no expone fácil esos detalles por lectura, y su lectura lags de todos modos.
- Resumen del chat generado directamente desde el JSON del plan (no redactado aparte por el LLM) — evitaría que el chat afirme algo que el plan no contiene.
- Verificación HTTP real (200/404) de la URL de destino antes de publicar.
- Selección de una acción de conversión de lead específica en Google Ads — **confirmado imposible**, no existe esa acción de escritura en Windsor para `google_ads`.
- Fecha de término explícita: imposible en Google (no hay acción), y en Meta exige cambiar a presupuesto total (vitalicio) en vez de diario — decisión de producto pendiente, no un bug.
