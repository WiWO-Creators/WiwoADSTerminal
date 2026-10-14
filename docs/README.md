# Documentación de WiWO.ADS

Índice de la documentación. Cada documento responde a **una** pregunta; si un dato aparece en dos lugares, uno de
ellos remite al otro. Si un documento contradice al código, manda el código (y conviene corregir el documento).

> Última revisión general: 2026-10-14.

## Para entender el producto

| Documento | Responde a |
|---|---|
| [`../PROYECTO.md`](../PROYECTO.md) | ¿Qué es WiWO.ADS y cómo está armado? Visión de conjunto: stack, runtime dual, autenticación, modelo de datos, Constructor, editor, asistente |
| [`FUNCIONES_DEL_PRODUCTO.md`](FUNCIONES_DEL_PRODUCTO.md) | ¿Qué hace cada pantalla y función, para quién y qué necesita? |
| [`PLATAFORMAS.md`](PLATAFORMAS.md) | ¿Qué se puede leer, crear y editar en Meta, Google, LinkedIn y TikTok, por qué vía y con qué límites? |
| [`ROLES_Y_APROBACIONES.md`](ROLES_Y_APROBACIONES.md) | ¿Quién puede hacer qué? ¿Cómo viaja un cambio desde que se pide hasta que queda en la plataforma? |
| [`ARQUITECTURA.md`](ARQUITECTURA.md) | ¿Cómo se lee y se escribe con Windsor: catálogo, caché, unidades y encadenado de pasos? |
| [`GLOSARIO.md`](GLOSARIO.md) | ¿Qué significa cada término propio del proyecto? |

## Para trabajar en el código

| Documento | Responde a |
|---|---|
| [`DESARROLLO_Y_PRUEBAS.md`](DESARROLLO_Y_PRUEBAS.md) | ¿Cómo lo levanto, lo pruebo y simulo roles sin tocar nada real? |
| [`THINKING_ORB.md`](THINKING_ORB.md) y [`thinking-orb.css`](thinking-orb.css) | Kit portable del indicador visual «pensando» |

## Para desplegar y operar

| Documento | Responde a |
|---|---|
| [`DESPLIEGUE_VPS.md`](DESPLIEGUE_VPS.md) | ¿Cómo corre en el servidor propio y cómo se despliega? |
| [`OPERACION.md`](OPERACION.md) | ¿Qué tareas manuales hay (reconectar LinkedIn, tokens de Meta, cron, solicitudes a plataformas)? |
| [`VARIABLES_DE_ENTORNO.md`](VARIABLES_DE_ENTORNO.md) | ¿Qué hace cada variable y qué se expone si se filtra? Es la **única** lista de variables |
| [`META_APP_ID_Y_SECRET.md`](META_APP_ID_Y_SECRET.md) | Detalle de las dos credenciales de la app de Meta y qué hacer si se filtran |

## Estado por cliente

| Documento | Responde a |
|---|---|
| [`ESTADO_POR_CLIENTE.md`](ESTADO_POR_CLIENTE.md) | Fotografía (2026-10-05) de qué se lee de cada cliente y qué falta por conectar |

## Historial

[`historial/`](historial/) conserva la crónica de cómo se llegó hasta aquí. **Es historia, no referencia**: varias
decisiones allí quedaron superadas (por ejemplo «todo nace pausado» o «todo por Windsor»).

| Documento | Qué es |
|---|---|
| [`HISTORIAL_DE_RONDAS.md`](historial/HISTORIAL_DE_RONDAS.md) | Cambios, decisiones y pendientes por ronda, del 2026-10-02 al 2026-10-07 |
| [`CONTEXTO_SESION_2026-09-23.md`](historial/CONTEXTO_SESION_2026-09-23.md) | Traspaso de una sesión de trabajo |
| [`CONTROL_TOTAL.md`](historial/CONTROL_TOTAL.md) | Análisis de alcance de la fase «solo Windsor» |
| [`EVALUACION_ARQUITECTURA_OMNICANAL.md`](historial/EVALUACION_ARQUITECTURA_OMNICANAL.md) | Respuesta a una propuesta externa de reemplazar Windsor (su premisa ya no vale: hay clientes nativos) |
| [`MAPA_CLIENTES.md`](historial/MAPA_CLIENTES.md), [`ACCESOS_PENDIENTES.md`](historial/ACCESOS_PENDIENTES.md) | Inventarios de cuentas y accesos, superados por `ESTADO_POR_CLIENTE.md` |
| [`PASO_A_PASO.md`](historial/PASO_A_PASO.md) | Pasos manuales de la primera puesta en marcha; lo vigente está en `OPERACION.md` |

## Cómo mantener esto al día

- **Un tema, un documento.** Antes de escribir una tabla de variables, de roles o de pasos de despliegue en otro
  sitio, enlaza al documento que ya la tiene.
- **Fecha y fuente.** Los datos que cambian en semanas (accesos, cuentas, estado de aprobaciones) llevan fecha; los que
  salen del código citan el archivo, no el número de línea (que se desfasa).
- **Al cambiar una regla de negocio**, actualiza el documento de su tema: roles → `ROLES_Y_APROBACIONES.md`, qué se
  puede editar o crear → `PLATAFORMAS.md`, pantallas → `FUNCIONES_DEL_PRODUCTO.md`, variables → `VARIABLES_DE_ENTORNO.md`.
- **Las rondas largas** de cambios se anotan en el historial y se resumen en el documento de tema; `PROYECTO.md` no
  vuelve a ser una crónica.
