# Roles, permisos y flujo de cambios

Quién puede hacer qué en WiWO.ADS y cómo viaja un cambio desde que alguien lo pide hasta que queda en la
plataforma y en la bitácora. Todo esto está leído del código; las rutas de archivo apuntan a la fuente de cada regla.

> Fuente de verdad: `lib/permisos.ts` (roles y capacidades), `lib/equipo.ts` (personas y cargos),
> `lib/solicitudes.ts` (ciclo de vida de las solicitudes). Si este documento y el código se contradicen, manda el código.

## 1. Dos ejes independientes

- **El rol** dice qué puede hacer una persona.
- **El alcance** dice sobre qué clientes puede hacerlo. Un rol con `ver_todos_los_clientes` ve a todos; el rol
  `client` solo ve los portafolios que tiene asignados (`enAlcance()` en `lib/permisos.ts`).

Tener un rol alto no da acceso a un cliente fuera del alcance, y tener todos los clientes asignados no
convierte a nadie en aprobador.

## 2. Los cuatro roles

Las etiquetas que ve el equipo en pantalla están en `ROLE_LABELS`:

| Rol (código) | Etiqueta en pantalla | Para qué sirve |
|---|---|---|
| `admin` | Admin / Directores | Todo: aprobar, presupuesto, administrar equipo y conexiones. |
| `supervisor` | Digital Lead | Ve todo, crea y aprueba cambios, conecta cuentas. No aprueba presupuesto. |
| `analyst` | Digital Creator | Ve todos los clientes y **propone**; no publica ni aprueba. |
| `client` | Cliente | Ve solo su propio portafolio y puede sugerir cambios. |

El **cargo** (Director, Director Digital, Paid Media, Digital Lead, Digital Creator…) es informativo y ordena la
jerarquía del equipo, pero **lo que decide los permisos es el rol**.

### Capacidades por rol

| Capacidad | admin | supervisor | analyst | client |
|---|:-:|:-:|:-:|:-:|
| Ver todos los clientes | sí | sí | sí | no |
| Crear y publicar campañas (Constructor) | sí | sí | no | no |
| Sugerir campañas (asistente) | sí* | sí* | sí | sí |
| Aprobar y aplicar cambios | sí | sí | no | no |
| **Aprobar cambios de presupuesto** | **sí** | no | no | no |
| Ver operación (bitácora de ejecuciones, cola de decisiones) | sí | sí | sí | no |
| Ver el equipo | sí | sí | sí | no |
| Administrar conexiones de datos | sí | sí | no | no |
| Ver Gestión → Cuentas | sí | no | no | no |
| Ver el plan técnico (pasos y parámetros crudos de la API) | sí | no | no | no |

\* Quien ya puede crear campañas no necesita la capacidad de sugerir: está cubierta.

Dos detalles que conviene recordar:

- Armar borradores (`puedeArmarCampanas`) lo hace quien puede crear campañas **o** un analista que puede sugerir.
  El rol `client` no arma ni envía a revisión: solo sugiere con el asistente.
- Toda escritura se comprueba con `can()`, que además exige que la persona esté activa. No usar `roleCan()` para
  decidir escrituras.

## 3. Quién entra y quién puede modificar a quién

- **Sin registro abierto.** Un correo que no esté en la tabla `users` (o esté inactivo) no entra, aunque se
  autentique bien con Google (`lib/equipo.ts`).
- **Fundador.** Los correos de `OAUTH_ADMIN_EMAILS` son siempre administradores activos y no se pueden modificar
  desde la app.
- **Quién invita a quién (`rolesAsignables`).** Admin asigna cualquier rol; supervisor asigna analista o cliente;
  analista asigna cliente; cliente no invita.
- **Modificar a alguien que ya está** (rol, estado, clientes): solo admin.
- **Cargos protegidos:** «Super Admin», «Director» y «Director creativo» no se pueden modificar desde la app.
- **Jerarquía por cargo** (`lib/jerarquia-pura.ts`): Admin > Director > Director Digital o Paid Media >
  Digital Lead > Digital Creator. Solo se modifica a quien está estrictamente por debajo.
- Invitar y modificar dejan registro en la auditoría, categoría «equipo».

## 4. Cómo viaja un cambio

Hay dos formas de cambiar algo en una plataforma real: **aplicar directo** (quien tiene permiso de aprobar) o
**pedirlo** (quien arma pero no aprueba). En ambas, el servidor **recalcula el plan** y nunca confía en los pasos que
manda el navegador.

```
Quien arma un cambio o una creación
  │   (el rol cliente solo sugiere con el asistente)
  │
  ├─ Admin o supervisor (puede aprobar) ─► aplicar directo
  │      · editar:  modo «aplicar» + confirmar con la palabra EDITAR
  │      · crear:   Constructor + confirmar con la palabra CREAR
  │      · si toca presupuesto → solo admin; si no, «envíalo a revisión»
  │
  └─ Analista (o quien prefiera revisión) ─► solicitar ─► solicitud PENDIENTE
         │  quien la creó puede cancelarla mientras esté pendiente
         ▼
   Revisor (aprobar cambios + cliente en su alcance;
            si toca presupuesto, solo admin)
     ├─ rechazar (motivo obligatorio) ─► RECHAZADA ─► aviso al creador
     └─ aprobar ─► el servidor relee la plataforma, rearma el plan y ejecuta
            ├─ todo bien ─► PUBLICADA ─► (se confirma que quedó activa) ─► ACTIVA
            └─ falla un paso ─► FALLIDA (se detiene en el primer error)
         siempre: bitácora de ejecuciones + auditoría + aviso al creador
```

### Estados de una solicitud

`pendiente`, `rechazada`, `cancelada`, `publicada`, `activa` y `fallida`. **No existe un estado «aprobada»**: aprobar
lleva a `publicada` (creada en la plataforma) o, si la plataforma rechaza un paso, a `fallida`.

| Transición | Quién |
|---|---|
| Crear | Quien puede armar o sugerir; el cliente debe estar en su alcance y el plan no puede tener problemas bloqueantes |
| Cancelar | Solo quien la creó, y solo mientras está pendiente |
| Aprobar / rechazar | Quien tiene `aprobar_cambios` y el cliente en su alcance; si toca presupuesto o límite de gasto, solo quien tiene `aprobar_presupuesto` (admin) |
| `publicada` → `activa` | Automático al releer la plataforma (todos los anuncios activos) o a mano |

Tipos de solicitud: campañas nuevas (1 a 20 piezas), cambio sobre algo existente, contenido nuevo en conjuntos de
Meta (1 a 10 piezas) y publicaciones de Instagram (1 a 20 piezas).

Reglas que importan:

- **Rechazar exige motivo** (máximo 500 caracteres). Aprobar no pide nota.
- **Aprobar es atómico.** Si dos personas aprueban a la vez, la segunda recibe 409 («otra persona ya la revisó»).
- **Una edición aprobada falla si ya no queda nada que cambiar** (por ejemplo, alguien la hizo a mano antes).
- **Avisos al creador** cuando pasa a rechazada, publicada, activa o fallida (`sinLeer` hasta que la marque leída).
- Un supervisor **no ve** en su cola las solicitudes que tocan presupuesto.
- **No hay prohibición de autoaprobación:** un supervisor o admin que crea una solicitud podría aprobarla él mismo.
  Hoy se confía en el equipo; si esto debe cambiar, es una decisión de producto.

### Guardarraíles al aplicar (edición y creación)

- **Simular no escribe nada.** En Google, además, el cambio se valida contra la cuenta real sin aplicarlo.
- **Aplicar exige permiso, alcance y confirmación escrita** (`EDITAR` o `CREAR`).
- **El plan se rearma en el servidor** a partir de lo que hay hoy en la plataforma.
- **Los pasos se detienen en el primer error.**
- **Se verifica después**: se relee la plataforma y se compara (nombre y contenido de anuncios hoy; el resto queda
  como «no se puede comprobar»). La lectura de Windsor va retrasada: para verificar un cambio hay que mirar la
  plataforma real.
- **Anti-duplicado:** si en las últimas 6 horas ya se publicó una campaña con el mismo nombre para el mismo
  cliente, responde 409, salvo que se confirme duplicar.
- **Campaña incompleta:** si una creación queda a medias, se renombra con un prefijo y se pausa.
- **Nace activo.** Desde el 2026-10-06 lo nuevo nace activo: la revisión es la aprobación previa, no una pausa
  posterior. (Algunos comentarios viejos en `lib/solicitudes.ts` aún dicen «nace pausado»; están desactualizados.)

## 5. Bitácoras

| Bitácora | Qué guarda | Quién la ve |
|---|---|---|
| **`ejecuciones`** | Cada escritura real: pasos crudos, parámetros y respuesta de la plataforma. No guarda contactos de listas Customer Match, solo cuántos son. | `ver_operacion` (admin, supervisor, analista), filtrado por alcance |
| **`auditoria`** | Línea de tiempo unificada con categorías: asistente, solicitud, decisión, cambio, creación, regla y equipo. Resultados: ok, error, pendiente, rechazado. | Solo admin (`aprobar_presupuesto`); además cada persona ve lo suyo y se filtra por alcance |

- La auditoría **nunca tumba la operación**: si falla el registro, solo escribe en el log.
- Se omiten claves que parezcan token, secreto o contraseña.
- Se marca importancia «alta» cuando hay error, rechazo, presupuesto, cambios de equipo o decisión descartada.

## 6. Conexiones del equipo

Nadie del equipo inicia sesión en Meta, Google ni LinkedIn: hay **una conexión del equipo** y cada persona actúa
según su rol. La bitácora de WiWO.ADS registra quién actuó, aunque en la plataforma figure la cuenta conectada.

| Plataforma | Cómo se conecta | Quién conecta |
|---|---|---|
| Google | OAuth; la conexión de un administrador pasa a ser la del equipo (y si nadie la fijó, se adopta la más reciente) | Admin o supervisor |
| LinkedIn | OAuth; la conexión se fija como la del equipo. El token dura ~60 días y no se renueva solo | Admin o supervisor |
| Meta | Token de usuario del sistema guardado en el servidor, no por persona | Quien administra el servidor |

Todo el equipo ve cuándo una conexión no está activa, sin ver tokens ni el correo de quien conectó. Los nombres de
las variables que faltan solo se muestran a quien administra.

## 7. Sesión y «Ver como»

- **Autenticación.** En ChatGPT Sites se confía en las cabeceras `oai-authenticated-user-*`. En el VPS (modo Node)
  esas cabeceras **se ignoran** (cualquiera podría falsificarlas) y solo vale la cookie firmada, que dura 12 horas.
- **Google OAuth** solo acepta los dominios `@mgcglobalgroup.com` y `@wiwo.me`. Prueba identidad, no permiso: quien
  puede entrar lo decide la tabla de equipo.
- **Ver como** (solo admin): permite ver la app con los ojos de otra persona. Es **solo lectura**: cualquier
  escritura con esa cookie se rechaza con 403. No se puede ver como un usuario inactivo.

## 8. Reglas de bolsillo

1. Un correo que no está invitado o está inactivo no entra.
2. Los cambios de presupuesto solo los aprueba o aplica un admin.
3. Aplicar exige escribir `EDITAR`; publicar una creación exige `CREAR`.
4. El servidor siempre recalcula el plan.
5. Rechazar exige motivo.
6. El fundador y los cargos protegidos no se modifican desde la app.
7. «Ver como» no puede escribir.
8. La auditoría no bloquea nada y no guarda secretos.
