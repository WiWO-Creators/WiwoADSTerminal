import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { mismoOrigen } from "@/lib/origen-publico";
import { ALCANCE_EQUIPO, ErrorDeMemoria, notasVisibles, olvidarNota, puedeEscribirMemoria } from "@/lib/asistente-memoria";

/**
 * La memoria del asistente a la vista: el equipo ve qué recuerda y puede borrar lo que ya no sirve. Solo lectura y
 * borrado: guardar lo hace el asistente en la conversación (con las reglas de `asistente-memoria-pura.ts`).
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const cliente = new URL(request.url).searchParams.get("cliente");
  const { equipo, cliente: delCliente } = await notasVisibles(session.actor, cliente);
  const conPermiso = (scope: string) => puedeEscribirMemoria(session.actor, scope);
  return Response.json(
    {
      notas: [
        ...equipo.map((n) => ({ ...n, alcance: "equipo" as const, puedeBorrar: conPermiso(ALCANCE_EQUIPO) })),
        ...delCliente.map((n) => ({ ...n, alcance: "cliente" as const, puedeBorrar: cliente ? conPermiso(cliente) : false })),
      ],
    },
    { headers: NO_STORE },
  );
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  const cuerpo = (await request.json().catch(() => null)) as { id?: string; cliente?: string | null } | null;
  if (!cuerpo?.id) return fail("Falta la nota", 400);
  try {
    const r = await olvidarNota(session.actor, cuerpo.id, [ALCANCE_EQUIPO, ...(cuerpo.cliente ? [cuerpo.cliente] : [])]);
    return Response.json(r, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ErrorDeMemoria) return fail(error.message, error.status);
    console.error("WiWO.ADS memoria", error);
    return fail("No se pudo borrar la nota", 500);
  }
}
