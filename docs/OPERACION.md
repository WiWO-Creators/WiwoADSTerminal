# Operación: lo que hay que hacer a mano

Guía de tareas recurrentes y de puesta en marcha que **dependen de una persona** (quien administra las cuentas y el
servidor), porque no se pueden automatizar desde el código. Para el despliegue técnico ver
[`DESPLIEGUE_VPS.md`](DESPLIEGUE_VPS.md); para las variables, [`VARIABLES_DE_ENTORNO.md`](VARIABLES_DE_ENTORNO.md).

> Regla general: **los secretos nunca viajan por chat ni van al repo.** Se pegan solo en `.dev.vars` (local) y en el
> archivo de entorno del servidor, con permisos `600`.

## 1. Calendario de tareas recurrentes

| Cada… | Qué | Quién | Dónde |
|---|---|---|---|
| ~60 días | **Reconectar LinkedIn** (el token vence y no tiene refresh token) | Admin o supervisor | Gestión → Cuentas → LinkedIn |
| Al cambiar de persona en el equipo | Revisar quién tiene rol y quién conectó cada plataforma | Admin | Gestión → Cuentas y Equipo |
| Cuando lo pida el aviso | Reconectar Google si la tarjeta lo indica | Admin o supervisor | Gestión → Cuentas |
| Diario | Respaldo de la base SQLite y de la carpeta de creativos | Quien administra el VPS | Servidor |
| Cada vez que se publique algo grande | Revisar la bitácora y la plataforma real (no solo Windsor) | Admin | Auditoría, plataforma |
| Antes de cada versión de API que se retire | Revisar `LINKEDIN_API_VERSION` y `GOOGLE_ADS_API_VERSION` | Quien administra el VPS | Variables de entorno |

La tarjeta de LinkedIn en Cuentas muestra cuántos días quedan y avisa con tiempo; hoy **no hay aviso proactivo** a
los administradores fuera de esa pantalla.

## 2. Conexiones del equipo (una sola vez por plataforma)

Nadie del equipo inicia sesión en Meta, Google ni LinkedIn: hay una conexión compartida. Un **administrador o
supervisor** la hace desde Gestión → Cuentas y desde ese momento todos actúan según su rol; la bitácora registra quién
hizo cada cosa.

- **Google:** OAuth. La conexión de un administrador pasa a ser la del equipo. La cuenta de Google que se use debe
  tener permisos de edición sobre las cuentas de Google Ads de los clientes (si Google rechaza mutaciones, revisar
  primero el acceso de esa cuenta).
- **LinkedIn:** OAuth. Debe hacerlo una **persona real** que siga en la empresa y con acceso a las cuentas
  publicitarias (LinkedIn no admite perfiles compartidos). Si cambia, hay que reconectar con otra persona. Para
  **crear anuncios** esa cuenta necesita además un rol en la página de empresa del cliente
  (ver [`PLATAFORMAS.md`](PLATAFORMAS.md#6-linkedin)). Para que la app **escriba en cuentas de clientes**, hay que
  poner `LINKEDIN_ESCRITURA_CLIENTES=true` en el servidor y haber agregado esas cuentas en «View Ad Accounts» del
  Developer Portal de LinkedIn (límite de 5 cuentas en el nivel actual).
- **Meta:** no hay botón; se usa el token de un usuario del sistema guardado en el servidor (§3).

## 3. Meta: token del usuario del sistema

Una cuenta de empresa, no personal, para que no dependa de ninguna persona.

1. En el administrador comercial del portafolio → **Configuración del negocio → Usuarios → Usuarios del sistema →
   Agregar** (rol Administrador).
2. **Cuentas → Aplicaciones → Agregar**: conecta la app «WiwoAds» al negocio (si pide aprobación, la da otro
   administrador).
3. En el usuario del sistema → **Agregar activos** con control total: cuentas publicitarias, Páginas, cuentas de
   Instagram, conjuntos de datos (píxeles) y catálogos que se usen.
4. **Generar token** → app WiwoAds → vencimiento **Nunca** → los permisos que usa la app (`ads_management`,
   `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`,
   `instagram_basic`, `leads_retrieval`, `read_insights`). Sin ellos, la lectura
   de formularios, audiencias o facturas falla con un error de permisos.
5. Pégalo **solo** como `META_SYSTEM_USER_TOKEN` en `.dev.vars` y en el entorno del servidor.
6. **Varios portafolios:** `META_SYSTEM_USER_TOKEN` acepta **varios tokens separados por coma, sin espacios**
   (`TOKEN_UNO,TOKEN_DOS`), uno por portafolio. Para cada cuenta la app prueba los tokens hasta que uno la ve.
   Hoy hay dos usuarios del sistema «WiwoAds» (el de MG y el de WiWO), que se llaman igual: no se distinguen por nombre.
7. Los clientes dueños de sus propias cuentas las **comparten** con el portafolio: en el negocio del cliente →
   Cuentas publicitarias → seleccionar la cuenta → **Asignar socios**.
8. Para **leer leads** de formularios, el token necesita `leads_retrieval` y el usuario del sistema debe administrar
   la página.

> **Antes de quitar el acceso de una persona** que hoy sostiene la conexión de Windsor con Meta, asignar sus cuentas y
> páginas al usuario del sistema correspondiente y verificar la lectura. Windsor depende de esa persona; la lectura
> directa no.

## 4. Reglas automáticas 24/7 (cron)

La app tiene `POST /api/reglas/programado`, protegido por una clave, y el script `servidor/evaluar-reglas.mjs` que lo
llama. Sin el cron, las reglas solo se evalúan cuando un admin o supervisor tiene la app abierta.

1. Genera una clave larga (32+ caracteres) y agrégala al entorno del servidor como `CRON_SECRET`. Reinicia con
   `pm2 reload ecosystem.config.cjs --update-env`.
2. En el servidor, `crontab -e`:
   `*/5 * * * * cd /root/wiwo-ads && node --env-file=.env servidor/evaluar-reglas.mjs >> /var/log/wiwo-reglas.log 2>&1`
   (si el puerto no es 3030, define `APP_URL=http://localhost:PUERTO`).
3. Revisa `/var/log/wiwo-reglas.log`: debe mostrar `200` y cuántas reglas revisó.

## 5. Alta de personas en el servidor

Normalmente se invita desde la pantalla **Equipo**. Para el primer administrador (o si nadie puede entrar) hay una
puerta: los correos de `OAUTH_ADMIN_EMAILS` entran como administrador. Además, `servidor/sembrar-equipo.mjs
correo:rol …` da de alta personas directo en SQLite. Los roles válidos son los del código (`admin`, `supervisor`,
`analyst`, `client`); el script puede aceptar nombres antiguos, así que conviene revisar lo que crea.

## 6. Facturas en Drive (si se usa)

Para que la app **escriba** extractos y facturas, comparte la carpeta de facturas como **Editor** con el correo de la
cuenta de servicio de la app (la que lee GA4; termina en `iam.gserviceaccount.com`) y habilita la **Google Drive API**
en el proyecto de Google Cloud. Estructura: `INVOICE / CLIENTE / AAAA-MM / EXTRACTO` y `/ FACTURA`, solo con lo que
cada plataforma entregue. Conviene que la carpeta esté en una **unidad compartida** de la empresa y no en la cuenta de
una persona. Las facturas de Google dependen de que el token de desarrollador de Google Ads esté aprobado.

## 7. Impulsar publicaciones de Instagram

Cada cuenta de Instagram debe ser **profesional**, estar vinculada a la Página del cliente y estar asignada a la
cuenta publicitaria en Configuración del negocio. La app crea el anuncio a partir de la publicación (por su id de
medio y el usuario de Instagram).

## 8. TikTok (cuando aprueben la app)

Mientras la aplicación esté en revisión no hay credenciales: TikTok se lee solo por Windsor. Cuando la aprueben:

1. Guardar `TIKTOK_APP_ID` (público) y `TIKTOK_APP_SECRET` (secreto) **solo** en `.dev.vars` y en el servidor.
2. La URL de retorno registrada en el portal es `https://ads.wiwo.me/api/integrations/tiktok/callback`.
3. Construir la conexión del equipo, la lectura, la edición y la creación (hoy solo existe el módulo puro
   `lib/tiktok-nativo-pura.ts`), y probar primero en el sandbox.
4. El token del anunciante de TikTok **no vence ni se renueva**: si se pierde, el anunciante debe cancelar y volver
   a autorizar.
5. Los Términos para Desarrolladores de TikTok exigen proteger los tokens, tener con cada anunciante un acuerdo donde
   WiWO figure como encargado del tratamiento de sus datos, y poder entregar a TikTok la lista de anunciantes si lo
   pide.

## 9. Solicitudes a las plataformas

- **LinkedIn:** la API de publicidad está en nivel de desarrollo. Pasar a Standard Tier se pide con un ticket de
  soporte y un **video** del producto creando y editando campañas. Lead Sync, Matched Audiences y Conversions API son
  productos aparte: pedirlos solo cuando haya un caso real de un cliente, y declarar exactamente lo que la
  herramienta hace (LinkedIn contrasta lo declarado con el uso). Para las solicitudes se usa la razón social
  registrada de la empresa solicitante.
- **Google:** el token de desarrollador de Google Ads debe estar aprobado para las funciones que lo exigen.
- **Meta:** la app «WiwoAds» debe estar en modo Live y con acceso avanzado a los permisos que se usen.

## 10. Antes de dar por lista una producción nueva

- [ ] HTTPS y `APP_ORIGIN` con el dominio real; redirect URI de Google y de LinkedIn registradas.
- [ ] `DEV_LOGIN_ENABLED` en `false` o ausente.
- [ ] Migraciones aplicadas (`node servidor/migrar.mjs`) y respaldos con restauración probada.
- [ ] Un administrador conecta Google y LinkedIn desde Cuentas.
- [ ] `LINKEDIN_ESCRITURA_CLIENTES` en el valor que se quiera (por defecto, cerrada).
- [ ] Entrar con un correo invitado y con otro que no lo esté (debe rechazarlo).
- [ ] `/api/media/...` accesible desde fuera (Meta y Google descargan los creativos).
- [ ] Una campaña de prueba en un cliente chico, verificada en la plataforma real y borrada después.
- [ ] `npx tsc --noEmit`, `npm run lint` y `node --test tests/*.test.mjs` en verde.
