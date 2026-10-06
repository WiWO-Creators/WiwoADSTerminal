# Accesos pendientes para la lectura de medición (GA4 y GTM)

Fecha: 2026-10-05. Qué cuenta agregar y dónde, para que WiWO.ADS pueda leer la medición de cada cliente.

## La cuenta que hay que agregar

**`wiwo-lectura-analytics@wiwo-ads.iam.gserviceaccount.com`** (cuenta de servicio del proyecto Google Cloud `wiwo-ads`).
Es solo de **lectura**: nunca escribe en GA4 ni en GTM. Las APIs de Analytics Data, Analytics Admin y Tag Manager ya están habilitadas en el proyecto.

## Cómo darle acceso

**GA4** (por propiedad o por cuenta, rol **Lector**):
1. Analytics → Administrar → *Acceso a la propiedad* (o *Acceso a la cuenta*, que cubre todas sus propiedades).
2. «+» → Agregar usuarios → pegar el correo de arriba → rol **Lector** → sin notificar por correo.

**GTM** (por cuenta o por contenedor, permiso **Leer**):
1. Tag Manager → Administrar → *Administración de usuarios* (a nivel de **cuenta** para que cubra todos sus contenedores).
2. «+» → Agregar usuarios → correo de arriba → *Permiso de cuenta: Usuario* y, en cada contenedor, *Leer*.

Conviene hacerlo a nivel de **cuenta** (GA4 y GTM): así los contenedores y propiedades nuevos quedan cubiertos solos.

## Lo que falta (según `docs/MAPA_CLIENTES.md`)

### GA4: propiedades que existen y la cuenta de servicio aún no ve
| Cliente | Propiedad | ID |
|---|---|---|
| Grupo Valor | WEB VALOR | 488612729 |
| SQM | sqmindustrialchemicals.com (1) | 328525394 |
| SQM | sqmindustrialchemicals.com (2) | 364807965 |
| SQM | sqmyodonutricionvegetal.com | 462304181 |
| SQM | sangral (1) | 328546165 |
| SQM | sangral (2) | 365116115 |
| Cornerstone | Cornerstone Perú | 429136856 |
| Cornerstone | CLSelection | 429653754 |

Además, de las 73 propiedades de GA4 solo 21 están visibles: el resto son de clientes que no están en la lista del equipo (Falabella, MSD Bravecto, Hendrick's, Codelco, etc.). Dar acceso solo si WiWO las va a medir.

### GTM: contenedores que faltan
Solo se ven 2 contenedores de 9 cuentas de GTM. Hay que dar **Leer** a nivel de cuenta en: Ébano, Corotú Santa María, Foundaxis, sqmnutrition, Bodenor Flexcenter, Funeraria María Ayuda (cuentas visibles pero sin contenedor accesible).

### Clientes sin GA4 ni GTM encontrados
Colbún (GA4 sí, **GTM no existe: hay que instalarlo**), TrueCaller, Anker/Soundcore, Cornerstone (GTM), ALO Group (GTM), Marea y Bijao (GA4).

## Después de agregar los accesos
En WiWO.ADS: Clientes → ficha del cliente → pegar el ID de la propiedad de GA4 y el contenedor de GTM. Los clientes con varias propiedades (ALO: 8, SQM: 6, Valor: 2+) admiten varias desde ahora.
