# Variables de entorno de WiWO.ADS

Qué hace cada variable, dónde se usa y **qué se expone si se filtra**. Este documento solo lista
**nombres**, nunca valores.

- **Local:** `.dev.vars` (lo lee `npm run dev`). Está en `.gitignore`.
- **Producción (VPS):** entorno de PM2 (`ecosystem.config.cjs`, `--update-env`).
- Todas se leen en el **servidor** (`env.NOMBRE`). Ninguna debe llegar al navegador ni a la respuesta de una API.

Leyenda de riesgo: 🔴 da acceso o permite actuar · 🟠 da acceso parcial o genera costo · 🟢 no es secreto.

## Identidad y sesión

| Variable | Qué hace | Dónde | Si se filtra |
|---|---|---|---|
| `OAUTH_ADMIN_EMAILS` 🟢 | Correos que se autoprovisionan como **administrador** la primera vez que entran. Es la única puerta de arranque en frío. | `lib/equipo.ts` | No es secreto, pero define quién puede volverse admin: quien controle uno de esos correos entra como admin. |
| `DEV_LOGIN_ENABLED` 🟠 | Si vale `"true"`, la app acepta las cabeceras de identidad de ChatGPT Sites. | `app/chatgpt-auth.ts` | En un servidor propio cualquiera podría mandar esas cabeceras y **suplantar a un usuario**. Debe estar apagada en el VPS. |
| `SESSION_SECRET` 🔴 | Clave HMAC con la que se firma la cookie `wiwo-dev-user`. Si falta, se usa `OAUTH_TOKEN_KEY`. | `app/chatgpt-auth.ts`, `lib/sesion-firmada.ts` | Permite **fabricar una sesión válida** de cualquier persona del equipo. |
| `OAUTH_TOKEN_KEY` 🔴 | Clave que **cifra** los tokens OAuth guardados en la base (Google/Meta) y respalda la firma de sesión. | `lib/integration-store.ts`, `lib/sesion-firmada.ts` | Con el archivo de la base, permite **descifrar todos los tokens** de las integraciones. Si cambia, los tokens guardados dejan de poder leerse. |
| `APP_ORIGIN` 🟢 | URL pública (`https://ads.wiwo.me`). Arma las URLs de retorno de OAuth. | `lib/origen-publico.ts`, `lib/integration-store.ts` | No es secreto. Si está mal, el login con Google/Meta falla por redirect inválido. |
| `APP_URL` 🟢 | Origen que usa el script de cron (`servidor/evaluar-reglas.mjs`). Por defecto `http://localhost:3030`. | `servidor/evaluar-reglas.mjs` | No es secreto. |
| `CRON_SECRET` 🔴 | Clave para disparar `/api/reglas/programado`. Sin ella o con una incorrecta, la ruta no hace nada. | `app/api/reglas/programado/route.ts` | Permite **ejecutar las reglas programadas** (cambios reales en cuentas, dentro de lo que una regla permite). |

## Google

| Variable | Qué hace | Dónde | Si se filtra |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` 🟢 | ID del cliente OAuth de Google (login corporativo y conexión de Google Ads). | `lib/integration-store.ts`, login | Es público: aparece en las URLs de login. |
| `GOOGLE_CLIENT_SECRET` 🔴 | Secreto de ese cliente OAuth. | `lib/integration-store.ts` | Alguien podría **hacerse pasar por la app** al canjear códigos OAuth. |
| `GOOGLE_ADS_DEVELOPER_TOKEN` 🔴 | Token de desarrollador de Google Ads; la lectura/edición nativa lo exige. | `lib/google-ads-nativo.ts`, `lib/integration-store.ts` | Se pueden hacer llamadas a la API de Google Ads **con la cuota y la reputación de WiWO**; Google puede suspenderlo. Necesita además un token de usuario para tocar cuentas. |
| `GOOGLE_ADS_API_VERSION` 🟢 | Versión de la API (por defecto `v25`). | `lib/integration-store.ts` | No es secreto. |

## Meta

| Variable | Qué hace | Dónde | Si se filtra |
|---|---|---|---|
| `META_APP_ID` 🟢 | ID de la app «WiwoAds» (`client_id` del OAuth). | `lib/integration-store.ts` | Es público: sale en cualquier URL de login. |
| `META_APP_SECRET` 🔴 | Clave secreta de la app. Canjea el código OAuth, forma el token de la app y firma `appsecret_proof`. | `lib/integration-store.ts` | Quien la tenga puede **canjear tokens como si fuera la app** y firmar llamadas. Si se filtra, **restablécela** en Configuración → Básica. |
| `META_SYSTEM_USER_TOKEN` 🔴 | Token del **usuario del sistema «WiwoAds»**. Admite varios, separados por coma (uno por portafolio dueño de cuentas). Es el que usa la lectura nativa de Meta. | `lib/meta-nativo.ts` | Es el más delicado: da acceso a los **activos asignados al usuario del sistema** (hoy ~44: cuentas publicitarias con acceso total, páginas, Instagram, WhatsApp) **sin depender de ninguna persona ni de 2FA**. Si se filtra, revócalo en Usuarios del sistema y genera otro. |
| `META_GRAPH_VERSION` 🟢 | Versión de la Graph API. | `lib/integration-store.ts` | No es secreto. |

## LinkedIn (opcional: LinkedIn también se lee por Windsor)

| Variable | Qué hace | Dónde | Si se filtra |
|---|---|---|---|
| `LINKEDIN_CLIENT_ID` 🟢 | ID de la app «WiwoAds» de LinkedIn (también vale `LINKEDIN_APP_ID`). | `lib/linkedin-nativo.ts` | Es público: sale en la URL de login. |
| `LINKEDIN_CLIENT_SECRET` 🔴 | Secreto de esa app (también vale `LINKEDIN_APP_SECRET`). Canjea el código OAuth y renueva tokens. | `lib/linkedin-nativo.ts` | Permite **hacerse pasar por la app** al canjear códigos. Regenerar en LinkedIn Developers → Auth. |
| `LINKEDIN_ESCRITURA_CLIENTES` 🟠 | Con `true`, WiWO.ADS puede **crear y modificar campañas en cuentas de clientes** de LinkedIn. Sin ella (por defecto) solo escribe en la cuenta de prueba. | `app/api/linkedin/escritura/route.ts` | No es secreto, pero activarla es una decisión de negocio: cambios reales en cuentas de clientes. Actívala solo tras probar. |
| `LINKEDIN_API_VERSION` 🟢 | Versión de la API REST (cabecera `Linkedin-Version`, `AAAAMM`). Por defecto `202609` (la 202510 se retira el 2026-10-15). | `lib/linkedin-nativo.ts` | No es secreto. LinkedIn retira versiones viejas: si responde 426, subirla. |

Sin las dos primeras, la vía nativa queda apagada y LinkedIn sigue leyéndose por Windsor.

## TikTok (preparado: todavía no hay código que las lea)

| Variable | Qué hace | Dónde | Si se filtra |
|---|---|---|---|
| `TIKTOK_APP_ID` 🟢 | ID de la app «WiwoAds» de TikTok for Business (Marketing API). Aparece como «--» en el portal hasta que la aprueben. | futuro `lib/tiktok-nativo.ts` | Es público: sale en la URL de autorización. |
| `TIKTOK_APP_SECRET` 🔴 | Secreto de esa app. Canjea el `auth_code` por el token del anunciante. | futuro `lib/tiktok-nativo.ts` | Permite **hacerse pasar por la app**. Regenerarlo en el portal de desarrolladores de TikTok. |

Los tokens de anunciante de TikTok no vencen ni se renuevan: si se pierde uno, el anunciante debe cancelar y volver a autorizar. La URL de retorno registrada es `https://ads.wiwo.me/api/integrations/tiktok/callback`.

## Windsor

| Variable | Qué hace | Dónde | Si se filtra |
|---|---|---|---|
| `WINDSOR_API_KEY` 🔴 | Clave de la cuenta de Windsor. **Lectura y escritura** de campañas, conjuntos y anuncios de Google y Meta. | `lib/windsor.ts` | Permite **leer los datos de todos los clientes y ejecutar las acciones de escritura** que Windsor expone. Es el único punto de escritura del sistema. Restablécela en Windsor. |

## IA

| Variable | Qué hace | Dónde | Si se filtra |
|---|---|---|---|
| `ANTHROPIC_API_KEY` 🟠 | Clave para el asistente y el copiloto de creativos (Claude). | `lib/asistente.ts`, `lib/copiloto-creativos.ts` | No toca ads, pero **gasta crédito** de Anthropic. Ponle un límite de gasto mensual. |
| `ANTHROPIC_MODEL` 🟢 | Modelo que usa el asistente. Por defecto, `MODELO_POR_DEFECTO`. | `lib/asistente.ts`, `lib/copiloto-creativos.ts` | No es secreto. |
| `GEMINI_API_KEY` 🟠 | Clave de Gemini para generar imágenes de creativos. | `lib/generador-creativos.ts` | **Gasta crédito** de Google. Sin ella, el generador queda desactivado. |

## Infraestructura (no son secretos)

| Variable | Qué hace |
|---|---|
| `WIWO_RUNTIME` | Vale `"node"` en el VPS; hace que se ignoren las cabeceras de ChatGPT Sites. |
| `WIWO_DB_PATH` | Ruta del archivo SQLite en el VPS. **El archivo en sí es sensible** (contiene tokens cifrados y datos del equipo). |
| `WIWO_MEDIA_DIR` | Carpeta donde se guardan los creativos subidos (reemplaza a R2). |

## Qué se expone hacia afuera

- **Nada de lo anterior debería llegar al navegador.** Son lecturas de `env` del lado del servidor. No revisé una a una las respuestas de las rutas API, así que antes de dar por cerrado el tema conviene una prueba de que ninguna ruta devuelve valores de `env`.
- Lo que **sí es público por diseño:** `META_APP_ID`, `GOOGLE_CLIENT_ID`, `APP_ORIGIN` y las versiones de API.
- La base SQLite guarda tokens cifrados con `OAUTH_TOKEN_KEY`. Quien tenga **el archivo y la clave** tiene todos los tokens; con solo uno de los dos no.

## Si algo se filtró

| Variable | Qué hacer |
|---|---|
| `META_SYSTEM_USER_TOKEN` | Revocar en Configuración del negocio → Usuarios del sistema, y generar uno nuevo. |
| `META_APP_SECRET` | Restablecer en la app → Configuración → Básica. |
| `WINDSOR_API_KEY` | Regenerar en Windsor y actualizar el VPS. |
| `GOOGLE_CLIENT_SECRET` | Regenerar en Google Cloud Console. |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | Revocar en la consola del proveedor y crear otra. |
| `SESSION_SECRET` / `OAUTH_TOKEN_KEY` | Cambiar: cierra todas las sesiones. Cambiar `OAUTH_TOKEN_KEY` obliga a reconectar las integraciones (los tokens guardados ya no se pueden descifrar). |
| `CRON_SECRET` | Cambiar en la app y en el cron. |

## Buenas prácticas

- `.dev.vars` ya está en `.gitignore`. No lo copies a otras carpetas ni lo pegues en chats.
- En el VPS, que cada clave tenga solo el permiso que necesita: el token de Meta con `ads_read`, salvo que decidas escribir con la propia app.
- Guarda una copia de las claves en un gestor de contraseñas de la empresa, para que no dependan de una sola persona.
