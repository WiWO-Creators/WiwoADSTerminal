# Paso a paso: lo que depende de ti

## 1. Token de Meta con un usuario del sistema (una cuenta de empresa, no personal)
1. Entra a business.facebook.com → **Configuración del negocio** del portafolio **MG Consulting**.
2. **Usuarios → Usuarios del sistema → Agregar**. Nombre «WiWO ADS», rol **Administrador**.
3. **Cuentas → Aplicaciones → Agregar → Conectar un ID de app**: `2191105014789445` (WiwoAds). Si pide aprobación, apruébala con el otro administrador del negocio.
4. Vuelve al usuario del sistema → **Agregar activos** y asígnale con control total: todas las **cuentas publicitarias**, las **Páginas**, las **cuentas de Instagram**, los **conjuntos de datos (píxeles)** y los catálogos que uses.
5. **Generar token nuevo** → elige la app WiwoAds → vencimiento **Nunca** → permisos: `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `instagram_basic`, `leads_retrieval`, `read_insights`. Copia el token.
6. Pégalo **solo** en `.dev.vars` (local) y en el `.env` del servidor como `META_SYSTEM_USER_TOKEN=…`. Nunca en el chat ni en el repo.
7. Cuentas de clientes que pertenecen a otros portafolios (Grupo Valor, Primeros Pueblos, SQM LATAM, Foundaxis, Funeraria…): en cada uno, **Configuración del negocio → Cuentas → Cuentas publicitarias → seleccionar la cuenta → Asignar socios** y agrega el ID de MG Consulting con control total. Así un solo usuario del sistema las ve todas. (Si prefieres no compartirlas, se crea un usuario del sistema por portafolio y se pegan varios tokens separados por coma.)
8. Dime «token puesto» y pruebo en solo lectura: listar cuentas, audiencias y facturas. No se escribe nada hasta que lo autorices.

Nota honesta: no sé todavía si, con la app en acceso estándar, Meta deja operar cuentas compartidas como socio. Lo confirmo con la primera prueba; si no, hay que pedir acceso avanzado a `ads_management` (revisión de la app).

## 2. Evaluar las reglas 24/7 (ya está el código)
La app tiene `POST /api/reglas/programado` protegido por clave y el script `servidor/evaluar-reglas.mjs`.
1. Genera una clave larga (32+ caracteres) y agrégala al `.env` del servidor: `CRON_SECRET=…`. Reinicia con `pm2 reload ecosystem.config.cjs --update-env`.
2. En el servidor: `crontab -e` y agrega
   `*/5 * * * * cd /root/wiwo-ads && node --env-file=.env servidor/evaluar-reglas.mjs >> /var/log/wiwo-reglas.log 2>&1`
   (ajusta el puerto con `APP_URL=http://localhost:PUERTO` si no es 3030).
3. Revisa `/var/log/wiwo-reglas.log`: debe mostrar `200` y cuántas reglas revisó.
Mientras no esté el cron, las reglas se evalúan cuando un admin o supervisor tiene la app abierta.

## 3. Facturas y extractos en Drive
1. La carpeta INVOICE ya la puedo ver. Para que la app **escriba**, compártela como **Editor** con el correo de la cuenta de servicio de la app (la misma que lee GA4; termina en `iam.gserviceaccount.com`). El acceso «cualquiera con el link» no es fiable para escribir por API.
2. En Google Cloud, proyecto `wiwo-ads`: habilita **Google Drive API**.
3. Estructura que crearé: `INVOICE / CLIENTE / AAAA-MM / EXTRACTO` y `INVOICE / CLIENTE / AAAA-MM / FACTURA`, solo con lo que cada plataforma entregue (si un cliente solo trae factura, no se crea la carpeta de extractos).
4. Recomendado: mover INVOICE a una **unidad compartida** de la empresa; hoy pertenece a aveas@ y se perdería el acceso si esa cuenta cambia.

## 4. Impulsar publicaciones de Instagram (después del token)
1. Cada cuenta de Instagram debe ser **profesional** y estar vinculada a la Página del cliente.
2. En Configuración del negocio, la cuenta de Instagram debe estar asignada a la cuenta publicitaria (Cuentas → Cuentas de Instagram → Agregar activos).
3. Yo construyo la creación del anuncio con la publicación de Instagram (`source_instagram_media_id` + `instagram_user_id` en la API de Meta) y la vista Impulsar la ofrecerá igual que las de Facebook.
4. Prueba controlada: un anuncio **pausado** en la cuenta `WiWO_Ads` (3305419739762154) con una publicación tuya. Necesito tu «sí» explícito antes de crear nada.

## 5. Segundo token (opción B): usuario del sistema en Meetwiwo.com
La app acepta varios tokens en `META_SYSTEM_USER_TOKEN`, separados por coma: `TOKEN_MG,TOKEN_MEETWIWO`. Para cada cuenta prueba los tokens hasta que uno la vea y recuerda cuál funcionó.
1. En Meetwiwo.com → Usuarios → Usuarios del sistema → Agregar: nombre `WiWO ADS Meetwiwo`, rol Administrador.
2. Agregar activos: cuentas publicitarias (WiWO_Ads, Acaiberry, Funeraria ×2, y las de Anker Chile, Anker Argentina y ALO cuando se compartan con Meetwiwo.com), Páginas e Instagram de esos clientes.
3. Generar token: la app **WiwoAds** debe aparecer en el desplegable (se ve «Pertenece a MG Consulting»). Si no aparece, la opción B no funciona y se vuelve a compartir con MG Consulting.
4. Permisos: los mismos nueve de siempre. Vencimiento «Nunca».
5. En `.dev.vars`, deja la misma línea y agrega el segundo token al final después de una coma (sin espacios).
