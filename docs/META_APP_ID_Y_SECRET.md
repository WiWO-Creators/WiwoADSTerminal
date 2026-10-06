# `META_APP_ID` y `META_APP_SECRET`

Las dos credenciales de la app de Meta «WiwoAds» (propiedad de MG Consulting). Este documento solo habla
de **nombres y usos**: ningún valor está escrito aquí ni debe estarlo.

| | `META_APP_ID` | `META_APP_SECRET` |
|---|---|---|
| Qué es | Identificador público de la app | Clave secreta de la app |
| ¿Es secreto? | **No** | **Sí** |
| Dónde se ve en Meta | Configuración de la app → Básica | Misma pantalla, botón «Mostrar» |
| Dónde vive aquí | `.dev.vars` (local) · entorno de PM2 (VPS) | Igual |
| Si se filtra | Nada grave: sale en cualquier URL de login | Restablecer de inmediato (ver abajo) |

Sin las dos, la app no puede conectar Meta por OAuth: la pantalla de Integraciones lo avisa como
«credenciales de la app de Meta» faltantes ([lib/integration-store.ts:205](../lib/integration-store.ts#L205)).

## Qué hace `META_APP_ID`
Es el `client_id` con el que Meta identifica a la app.

1. **Abrir el diálogo de permisos.** Se manda en la URL de autorización de Facebook
   ([lib/integration-store.ts:500](../lib/integration-store.ts#L500)), junto con el permiso `ads_read`.
2. **Canjear el código por un token.** Se manda otra vez al volver el usuario de Meta
   ([lib/integration-store.ts:945](../lib/integration-store.ts#L945)).
3. **Ampliar la vida del token.** Se manda al cambiar el token corto por uno largo
   ([lib/integration-store.ts:972](../lib/integration-store.ts#L972)).
4. **Formar el token de la propia app** (`ID|SECRETO`), ver abajo.

## Qué hace `META_APP_SECRET`
Es la prueba de que quien habla es de verdad la app. Se usa en cuatro cosas:

1. **Canjear el código OAuth** por un token de usuario, junto con el ID
   ([lib/integration-store.ts:946](../lib/integration-store.ts#L946)).
2. **Cambiar el token corto por uno largo** (`fb_exchange_token`)
   ([lib/integration-store.ts:973](../lib/integration-store.ts#L973)).
3. **Firmar cada llamada con `appsecret_proof`**: un HMAC-SHA256 del token de acceso usando el secreto.
   Se usa al leer el perfil, al descubrir cuentas publicitarias y al leer métricas diarias
   ([989](../lib/integration-store.ts#L989), [1167](../lib/integration-store.ts#L1167),
   [1485](../lib/integration-store.ts#L1485)). Así, un token robado no sirve sin el secreto
   *si* se activa «Requerir clave secreta de la app» en Meta.
4. **Token de la propia app** (`ID|SECRETO`): se usa para buscar lugares (`adgeolocation`), un catálogo
   público de Meta que no depende de que una cuenta personal esté libre de verificaciones de seguridad
   ([lib/integration-store.ts:241](../lib/integration-store.ts#L241)).

## Qué NO hacen
- **No leen datos de clientes por sí solas.** Eso lo hace un token de usuario (OAuth) o el
  `META_SYSTEM_USER_TOKEN` del usuario del sistema. El ID y el secreto solo prueban que la app es la app.
- **No participan en Windsor.** Windsor lee y escribe con su propia conexión y `WINDSOR_API_KEY`.
- **No son el token del usuario del sistema.** Ese es otra variable, más sensible aún.

## Qué se expone
**`META_APP_ID` (público por diseño)**
- Aparece en la URL del diálogo de login de Facebook y en el panel de Meta.
- Cualquiera puede verlo; no da acceso por sí solo.

**`META_APP_SECRET` (secreto)**
- Quien lo tenga puede **canjear códigos OAuth como si fuera la app** y firmar `appsecret_proof`.
- Con el token de la app (`ID|SECRETO`) puede hacer llamadas públicas con la reputación de WiWO.
- No da acceso por sí solo a los datos de los clientes: hace falta además un token de usuario.
- Solo vive en el servidor. Nunca debe llegar a una respuesta de API, a un log, al chat ni al repo.

## Si el secreto se filtra
1. En Meta: app → Configuración → Básica → **Restablecer** la clave secreta.
2. Actualizar `META_APP_SECRET` en `.dev.vars` y en el entorno del VPS (`pm2 reload ... --update-env`).
3. Las conexiones OAuth ya guardadas siguen funcionando mientras sus tokens sean válidos, pero las
   llamadas firmadas con el secreto anterior fallarán hasta actualizar la variable.
4. Revisar en Meta si hubo actividad rara.

## Pendiente relacionado
- **«Requerir clave secreta de la app»** está apagado en Meta (Configuración → Avanzada → Seguridad).
  El código ya firma las llamadas con `appsecret_proof`, así que activarlo probablemente es compatible.
  No lo actives sin antes probar una conexión y una lectura de Meta después.
- Con el **modo Live** y la **verificación de empresa** de MG Consulting pendientes, el ID y el secreto
  siguen siendo los de una app en estado de desarrollo para quien no es administrador, tester o desarrollador.
