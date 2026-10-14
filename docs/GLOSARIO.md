# Glosario

Términos propios de WiWO.ADS y equivalencias entre plataformas.

## Estructura de una campaña en cada plataforma

La interfaz de WiWO.ADS usa tres niveles: **campaña → conjunto → anuncio**. Cada plataforma los llama distinto:

| WiWO.ADS | Meta | Google Ads | LinkedIn (interfaz) | LinkedIn (API) |
|---|---|---|---|---|
| Campaña | Campaña | Campaña | «Campaign» | **Grupo de campañas** (`campaignGroup`) |
| Conjunto | Conjunto de anuncios | Grupo de anuncios (o grupo de recursos en Performance Max) | «Ad set» | **Campaña** (`campaign`) |
| Anuncio | Anuncio | Anuncio | «Ad» | **Creativo** (`creative`) |

Con solo Google elegido, el Constructor usa los nombres propios de Google (campaña → grupo → anuncio).

## Términos del producto

| Término | Significado |
|---|---|
| **Cliente / portafolio** | Un cliente de las agencias y sus cuentas publicitarias en cada plataforma. Un cliente puede tener varias cuentas por plataforma (por ejemplo, una por país). Definidos en `config/portafolios.json` y en la ficha del cliente. |
| **Empresa del grupo** | MGC o WiWO: a cuál de las dos agencias pertenece un cliente. |
| **Constructor** («Creador de campañas») | Formulario para crear campañas. Simula primero, ejecuta después. |
| **Editor** | Panel con el árbol de la cuenta para modificar lo ya publicado. |
| **Simular** | Calcular el plan y mostrar los pasos exactos sin escribir nada. En Google además se valida contra la cuenta real. |
| **Plan / pasos** | La lista ordenada de acciones que se enviarán a las plataformas. El servidor siempre lo rearma antes de ejecutar. |
| **Solicitud** | Pedido de crear o cambiar algo que espera aprobación. Estados: pendiente, rechazada, cancelada, publicada, activa y fallida. |
| **Aprobar** | Revisar una solicitud y ejecutarla. Los cambios de presupuesto solo los aprueba un admin. |
| **Verificar / leer de vuelta** | Volver a leer la plataforma después de escribir y comparar con lo que se quería. |
| **Bitácora de ejecuciones** | Registro de cada escritura real: quién, qué pasos y qué respondió la plataforma. |
| **Auditoría** | Línea de tiempo unificada de todo lo que pasó (asistente, solicitudes, decisiones, cambios, creaciones, reglas, equipo). |
| **Decisión / sugerencia** | Tarjeta con una acción recomendada para un cliente; se aprueba, descarta o pospone. |
| **Regla automática** | «Si [métrica] [cruza un umbral], pausar o avisar». Solo pausa; nunca activa ni sube presupuesto. |
| **Conexión del equipo** | Autorización OAuth hecha una vez por un administrador y usada por todos según su rol. |
| **Usuario del sistema (Meta)** | Cuenta de empresa de Meta, sin persona detrás, cuyo token permite a la app operar las cuentas compartidas. |
| **Vía nativa / API directa** | Hablar directo con la API de Meta, Google o LinkedIn en vez de pasar por Windsor. |
| **Windsor** | Servicio intermediario que normaliza los datos de las plataformas y expone algunas acciones de escritura. Su lectura va retrasada. |
| **Ver como** | Función de admin para ver la app como otra persona, solo lectura. |
| **Orb** | Indicador visual «pensando» (ver `THINKING_ORB.md`); también nombra la respuesta breve de IA en Decisiones. |
| **Boost / impulsar** | Convertir una publicación existente en anuncio. Su texto no se puede cambiar, como en Meta. |
| **Renovar** | Crear anuncios nuevos en un conjunto y retirar (pausar) los viejos para no saturarlo. |
| **Formulario instantáneo** | Formulario de captación de leads dentro de Meta («Lead Ads»). |
| **Customer Match** | Lista de contactos subida a Google para segmentar. Los contactos nunca se guardan en WiWO.ADS. |
| **Nombre estándar** | Convención `[OBJETIVO] [PLATAFORMA] Nombre` con siglas por objetivo (TRF tráfico, LDS leads, VTA ventas, AE alcance e interacción). |

## Siglas de estados que se ven en la app

- **Nace activo:** desde el 2026-10-06 lo creado queda activo. LinkedIn nace en **borrador**.
- **Incompleta:** una campaña cuya creación falló a mitad; se renombra con un prefijo y se pausa para que nadie la use.
