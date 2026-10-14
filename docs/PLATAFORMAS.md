# Plataformas: qué se puede leer, crear y editar

Matriz de lo que WiWO.ADS hace hoy con cada plataforma de anuncios, leída del código. Si necesitas saber **por qué
vía** (Windsor o API directa), **con qué credencial** y **qué límite tiene la plataforma**, está aquí.

> Estado: 2026-10-14. Fuente: `lib/windsor.ts`, `lib/meta-nativo*.ts`, `lib/google-ads-nativo.ts`,
> `lib/linkedin-*.ts`, `lib/edicion-plan.ts`, `lib/edicion-ejecutar.ts`, `lib/constructor*.ts`, `lib/plataformas.ts`.
> Los límites propios de cada plataforma están documentados en los comentarios del código; ahí se verifican.

## 1. Las dos vías de acceso

- **Windsor.ai** es la vía por defecto para **leer** (métricas, catálogo, desglose) y para la mayoría de
  **pausar/activar**. Una sola clave (`WINDSOR_API_KEY`). Nunca reintenta una escritura y detecta los «200 con error
  dentro del cuerpo».
- **API directa (nativa)** se usa para lo que Windsor no cubre (crear estructuras avanzadas, editar contenido, leer
  entidades pausadas o recién creadas, eliminar) y como respaldo de Meta cuando Windsor falla.

**La lectura de Windsor va atrasada respecto a las escrituras.** Para comprobar que un cambio quedó hecho, mira la
plataforma real o la lectura directa, no Windsor.

## 2. Credenciales por plataforma

| Plataforma | Cómo se autentica | Variables (solo nombres) |
|---|---|---|
| Windsor | Clave de API en la URL del conector | `WINDSOR_API_KEY` |
| Meta directo | Usuario del sistema «WiwoAds»; acepta **varios tokens separados por coma**, uno por portafolio, y prueba cada uno hasta que uno vea la cuenta | `META_SYSTEM_USER_TOKEN` |
| Meta OAuth por persona | Conecta cuentas y sincroniza métricas; búsqueda de ubicaciones | `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` |
| Google Ads directo | OAuth de la **conexión del equipo**: un administrador conecta una vez y manda sobre las personales | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_API_VERSION` |
| LinkedIn directo | OAuth de 3 patas, **conexión del equipo**; token cifrado, dura ~60 días, sin refresh token | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_API_VERSION`, `LINKEDIN_ESCRITURA_CLIENTES` |
| TikTok | Solo Windsor (solo lectura). La app de TikTok está en revisión | ninguna propia |

Todos los tokens OAuth se guardan **cifrados** (AES-GCM) con `OAUTH_TOKEN_KEY`. El detalle de cada variable y qué
pasa si se filtra está en [`VARIABLES_DE_ENTORNO.md`](VARIABLES_DE_ENTORNO.md).

## 3. Resumen por plataforma

| | Leer | Crear (Constructor) | Editar | Pausar/activar | Eliminar |
|---|---|---|---|---|---|
| **Meta** | Windsor + directa | Campaña, conjunto, anuncio, formularios, boost | Amplio (ver §4) | Windsor (+ respaldo directo) | Directo (irreversible) |
| **Google** | Windsor + directa (GAQL) | Búsqueda, PMax, Display (directa) | Amplio (ver §5) | Windsor | Directo |
| **LinkedIn** | Windsor + directa (grupos y campañas) | Grupo + campaña **en borrador**; anuncio no | Nombre, presupuesto, estado | Windsor o directa | **Bloqueado** |
| **TikTok** | Solo Windsor | Nada | Nada | Nada | Nada |

## 4. Meta

**Leer.** Windsor es la vía principal. Las cuentas que Windsor no entrega (Agencia Palta, SQM Perú, SQM Ecuador…) se
leen por la API directa con caché de 10 minutos. El detalle para editar suma campañas y conjuntos pausados o recién
creados, leídos directo. También hay lecturas directas de audiencias, píxeles, reglas, medios de Instagram,
formularios y leads, vistas previas e intereses.

**Crear.** Campaña, conjunto y anuncio por Windsor; subida de video, `boost_post` (impulsar una publicación) y
anuncios desde Instagram. Por **API directa**: formularios instantáneos (conjunto y anuncio) y el retiro de un anuncio
viejo al renovar (lo pausa). Los públicos (similares, de visitantes, de interacción) y los formularios se gestionan
también fuera del Constructor y exigen `aprobar_cambios`; por defecto solo simulan.

**Editar.**

| Nivel | Campos |
|---|---|
| Campaña | Nombre, presupuesto diario o total (solo si lo tiene la campaña), límite de gasto, estrategia de puja, categoría especial |
| Conjunto | Nombre, puja y estrategia, optimización, fin (menos de 1 año), horario (solo con presupuesto total), atribución, presupuesto (si no lo reparte la campaña) y segmentación: edad 13–65, países, género, redes, formatos, ubicaciones, intereses y audiencias a incluir/excluir |
| Anuncio | Nombre, dominio, mensaje de bienvenida, texto, título, descripción, URL, imagen por URL, botón, parámetros de URL |
| Cuenta | — |

Límites propios de Meta, ya conocidos:

- `update_adset` **reemplaza** la segmentación completa: por eso se parte siempre de la segmentación actual y no se
  edita a ciegas.
- El horario de entrega solo vale con presupuesto total y fecha de fin. Quitarlo exige vaciar también las franjas.
- Si un anuncio reutiliza una publicación existente (como un «boost»), solo se edita `url_tags`.
- Meta no ofrece «validar sin crear» para todo: en audiencias, «simular» solo comprueba los datos.
- Los formularios exigen el token **de la página**, y que el usuario del sistema la administre. Meta no borra
  formularios, solo los archiva.
- Eliminar pone el estado `DELETED` y es irreversible.

## 5. Google Ads

**Leer.** Windsor para métricas, catálogo y desglose de conversiones. La **API directa (GAQL)** se usa para el
detalle editable cuando quien edita tiene conexión: anuncios pausados, palabras clave, extensiones, grupos de recursos
de Performance Max y contenido de anuncios de búsqueda responsivos. Si falla, cae a Windsor con un aviso. Windsor solo
entrega entidades con actividad en el rango.

**Crear.** Por API directa: campaña de **Búsqueda con estructura propia** (un solo paso atómico), **Performance Max**
y **Display responsivo con imagen**. Windsor para la Búsqueda simple y para añadir grupos, anuncios, palabras clave,
geografía e idioma a una campaña existente. Los pasos directos exigen la conexión de Google del equipo.

**Editar.**

| Nivel | Campos |
|---|---|
| Campaña | Nombre y presupuesto diario (Windsor). Directos: inicio, fin, redes (solo Búsqueda), rotación, estrategia de puja, presencia, plantilla de seguimiento; enlaces de sitio y destacados (solo Búsqueda); en PMax, textos y URL de **un** grupo de recursos |
| Grupo de anuncios | Nombre, CPC máximo, palabras clave (agregar, pausar, activar, quitar) |
| Anuncio | Solo **Búsqueda responsiva**: titulares, descripciones, URL final, rutas, sufijo de URL. Los demás tipos se bloquean. No hay renombre de anuncio |
| Cuenta | — |

Otros campos (estrategia de puja con CPA/ROAS objetivo, idiomas, horario, negativas, assets, listas Customer Match)
pasan por una lista blanca de acciones de Windsor.

Límites propios de Google:

- Windsor **no edita anuncios existentes**: es un límite del intermediario, no de Google.
- Una campaña que ya empezó no permite cambiar su inicio.
- Presupuesto total no se admite en Búsqueda; las redes solo se editan en Búsqueda.
- En PMax, las imágenes y videos se leen pero no se editan.
- Eliminar pone el estado `REMOVED`.

## 6. LinkedIn

Equivalencia de nombres (se mantiene en toda la app): la **«campaña»** de la interfaz de LinkedIn es el **grupo de
campañas** de la API; el **«conjunto»** (ad set) es la **campaña** de la API; los **anuncios** son los creativos.

**Cómo está conectada.** Una **conexión del equipo**: un admin o supervisor autoriza una vez (OAuth) y todos actúan
según su rol. El token vence a los ~60 días y no tiene refresh token: **un administrador debe reconectar** (la tarjeta
de Cuentas avisa con tiempo). La cuenta con la que se autoriza debe ser una persona real que siga en la empresa.

**Guarda de escritura.** Mientras `LINKEDIN_ESCRITURA_CLIENTES` no valga `true`, la app solo escribe en la cuenta
de prueba. Con ella activa, escribe también en las cuentas de cliente que estén agregadas en el Developer Portal.

**Nivel de acceso.** La API de publicidad está aprobada en **Development Tier**: leer sin límite, **editar hasta 5
cuentas** agregadas en «View Ad Accounts» del portal, y una cuenta de prueba. Hoy: Colbún S.A (555950160), Colbún
Clientes (555900177) y la cuenta de prueba. Pasar a Standard Tier se pide por ticket de soporte con un video del
producto.

| | Estado |
|---|---|
| Leer | Windsor para métricas; directa para grupos y campañas (sus valores mandan). **Los anuncios no se leen de forma directa.** |
| Crear en el Constructor | Un grupo y una campaña **siempre en borrador** (`DRAFT`). El anuncio no se crea ahí: sale un paso informativo |
| Editar | Grupo: nombre y presupuesto total (exige fecha de fin). Campaña: nombre, presupuesto diario o total. Cada cambio es un `PARTIAL_UPDATE` que se **lee de vuelta**. La **fecha de término va siempre por Windsor** |
| Anuncio | Pausar y activar. **No se edita ni se crea con contenido nuevo**, hasta que la cuenta que conecta tenga rol en la página de empresa |
| Eliminar | Bloqueado: se pausa o se archiva en Campaign Manager |

**Por qué no hay anuncios nuevos todavía.** Crear un anuncio exige una publicación hecha **a nombre de la página** de
empresa. LinkedIn solo lo permite si la cuenta que conectó tiene en esa página el rol de **Administrador**,
**Publicador de contenido patrocinado directo** o **Administrador de contenido**. La cuenta conectada hoy no tiene
ninguno (la creación respondió 403). Ya existe el código, probado en unitarios pero no contra la API real:
`lib/linkedin-anuncios-pura.ts` (publicación y anuncio) y la ruta `/api/linkedin/escritura`.
Pausar, activar, presupuestos, fechas, público y puja **no** necesitan ese rol.

**Reglas de LinkedIn que el código ya respeta:**

- La campaña necesita `politicalIntent` (declaración legal que una persona debe marcar, sin valor por defecto) y
  `associatedEntity` (la organización de la cuenta; una persona no vale).
- Solo un idioma de interfaz por campaña. El presupuesto total exige fecha de fin; un grupo solo admite total.
- El inicio no puede estar en el pasado (se mueve a «ahora» + 2 min). Una campaña no puede estar pausada si su grupo
  está en borrador.
- Los países se traducen a ids de LinkedIn verificados (Chile, Perú, Colombia, México, Argentina, España, Ecuador,
  Panamá, Brasil, Uruguay, Paraguay, Costa Rica, Venezuela y EE. UU.). Bolivia, Guatemala y República Dominicana se
  retiraron por apuntar a lugares equivocados.
- La versión de la API (`LINKEDIN_API_VERSION`, por defecto `202609`) cambia: LinkedIn retira versiones viejas
  (la `202510` el 2026-10-15). Si responde 426, subir la versión.

**Pendientes conocidos de LinkedIn:** la edición del público, la puja, las ubicaciones de entrega, las conversiones y
los parámetros URL; la lectura de anuncios; crear anuncios de imagen, video y documento (con subida de archivos); el
aviso proactivo de vencimiento del token; y activar un anuncio **desde el editor** (el botón de tabla sí lo hace).

## 7. TikTok

- **Hoy:** solo lectura por Windsor. En `lib/plataformas.ts` está `activa: false`, `soloLectura: true`.
- **Preparado, sin conectar:** `lib/tiktok-nativo-pura.ts` (Marketing API v1.3) con el canje del código de
  autorización, el mapa de objetivos WiWO → TikTok, los presupuestos mínimos por moneda, la regla del 105 % para subir
  presupuesto, los planes de campaña, grupo y edición, y la consulta de reportes. **Ningún archivo lo importa** y todo
  sale de la documentación oficial, sin verificar contra la API real.
- **La app de TikTok** («WiwoAds») está en revisión. Hasta que la aprueben no hay credenciales. Cuando lleguen, el
  plan es repetir el camino de LinkedIn: conexión del equipo por OAuth, lectura, edición, creación y Constructor,
  probando primero en un sandbox y con lectura de vuelta de cada cambio.
- Las campañas de TikTok nacerían **activas**, como en el resto de plataformas.
- Datos de la API a tener presentes: los ids son texto; las fechas de grupos van en UTC; CLP no admite decimales; el
  presupuesto de una campaña no baja ni cambia de modo después de creada; el token del anunciante no vence ni se
  renueva (si se pierde, el anunciante debe volver a autorizar).

## 8. Reglas generales de escritura

- **Nada nace pausado** (decisión del equipo, 2026-10-06): la revisión es la aprobación previa. Excepciones:
  LinkedIn nace en borrador, y las campañas de prueba que crea la API se piden pausadas.
- **Simular antes de aplicar**; el servidor rearma el plan; los pasos se detienen en el primer error; se **lee de
  vuelta** para verificar. Ver [`ROLES_Y_APROBACIONES.md`](ROLES_Y_APROBACIONES.md).
- **Nunca se reintenta una escritura de Windsor** (podría duplicarse).
- Un paso de edición solo se emite si el campo **difiere de lo actual**.

## 9. Incoherencias conocidas en el código (para quien lo toque)

- `lib/plataformas.ts` marca LinkedIn con `activa: false` y `soloLectura: true`, pero también `administraExistentes` y
  `creaEnConstructor`. Hay comentarios que aún dicen «no hay forma de crear campañas» o «LinkedIn es de lectura».
- El comentario de `lib/google-ads-nativo.ts` dice que una campaña de PMax «nace pausada», pero el código la crea
  activa.
- Algunos comentarios de `lib/solicitudes.ts` conservan «todo nace pausado».
- Activar un anuncio de LinkedIn dentro del editor falla (no hay receta); el botón de la tabla sí funciona.
