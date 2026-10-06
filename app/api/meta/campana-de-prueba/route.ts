import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { eliminarCampanaMetaDePrueba, ErrorDeMeta, metaNativoConfigurado } from "@/lib/meta-nativo";
import { mismoOrigen } from "@/lib/origen-publico";
import { can, enAlcance } from "@/lib/permisos";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";

/** Borra una campaña de Meta de PRUEBA (nombre con el prefijo de prueba). Las campañas de los clientes nunca se borran desde aquí. */
export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!can(session.actor, "aprobar_cambios")) return fail("Solo un supervisor o administrador.", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  if (!metaNativoConfigurado()) return fail("La conexión directa con Meta todavía no está configurada.", 503);
  const b = (await request.json()) as { portfolioId?: string; accountId?: string; campaignId?: string };
  const accountId = (b.accountId ?? "").trim();
  if (!b.portfolioId || !accountId || !b.campaignId) return fail("Faltan datos.", 400);
  if (!enAlcance(session.actor, b.portfolioId)) return fail("Ese cliente no está en tu alcance", 403);
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio || duenio.id !== b.portfolioId) return fail("Esa cuenta no pertenece a este cliente", 403);
  try {
    await eliminarCampanaMetaDePrueba(b.campaignId);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ErrorDeMeta) return fail(error.message, error.status);
    console.error("WiWO.ADS borrar campaña Meta de prueba", error);
    return fail("No se pudo borrar la campaña", 500);
  }
}
