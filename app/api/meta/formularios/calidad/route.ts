import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { leadsDeFormularioMeta, listarFormulariosMeta } from "@/lib/meta-formularios";
import { leadDesdeApi, REGLA_COLOMBIA, resumenDeLeads, type ReglaDeCalificacion } from "@/lib/meta-formularios-pura";
import { ErrorDeMeta, metaNativoConfigurado } from "@/lib/meta-nativo";
import { mismoOrigen } from "@/lib/origen-publico";
import { paginaDeLaCuenta } from "@/lib/pagina-de-cuenta";
import { can, enAlcance } from "@/lib/permisos";
import { accountIndex, listPortfolios, normalizeAccountId } from "@/lib/portafolios-store";

/**
 * ¿Cuántos de los leads de un formulario son calificados? Lee los leads de Meta, aplica la regla (por defecto la del plan de Colombia)
 * y devuelve SOLO los totales: nunca los nombres, correos ni teléfonos. Lo ven quienes aprueban cambios.
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

type Cuerpo = { accountId?: string; formularioId?: string; regla?: ReglaDeCalificacion | "colombia"; dias?: number };

function reglaValida(r: unknown): r is ReglaDeCalificacion {
  return (
    Array.isArray(r) &&
    r.length > 0 &&
    r.every((c) => c && typeof c.pregunta === "string" && (c.aceptadas === undefined || (Array.isArray(c.aceptadas) && c.aceptadas.every((x: unknown) => typeof x === "string"))) && (c.rechazadas === undefined || (Array.isArray(c.rechazadas) && c.rechazadas.every((x: unknown) => typeof x === "string"))))
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  if (!can(session.actor, "aprobar_cambios")) return fail("Solo quien aprueba cambios ve la calidad de los leads", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  if (!metaNativoConfigurado()) return fail("La conexión directa con Meta todavía no está configurada.", 503);
  const b = (await request.json().catch(() => null)) as Cuerpo | null;
  if (!b?.accountId || !/^\d+$/.test(b.formularioId ?? "")) return fail("Faltan la cuenta o el formulario", 400);
  const regla = b.regla === undefined || b.regla === "colombia" ? REGLA_COLOMBIA : b.regla;
  if (!reglaValida(regla)) return fail("La regla de calificación no es válida", 400);
  const duenio = (await accountIndex()).get(normalizeAccountId(b.accountId));
  if (!duenio || !enAlcance(session.actor, duenio.id)) return fail("Esa cuenta no está en tu alcance", 403);
  const cliente = (await listPortfolios()).find((p) => p.id === duenio.id);
  const pageId = cliente ? await paginaDeLaCuenta(cliente, b.accountId) : null;
  if (!pageId) return fail("Esta cuenta no tiene una página de Facebook asociada.", 422);
  try {
    // El formulario debe ser de la página de esta cuenta: el id lo manda el navegador.
    const formularios = await listarFormulariosMeta(pageId);
    const formulario = formularios.find((f) => f.id === b.formularioId);
    if (!formulario) return fail("Ese formulario no es de la página de esta cuenta", 403);
    const dias = Math.min(Math.max(Math.round(b.dias ?? 0), 0), 365);
    const crudos = await leadsDeFormularioMeta(pageId, formulario.id, dias > 0 ? { desdeUnix: Math.floor(Date.now() / 1000) - dias * 86_400 } : {});
    const leads = crudos.map(leadDesdeApi);
    return Response.json({ formulario: { id: formulario.id, nombre: formulario.nombre }, ...resumenDeLeads(leads, regla), dias: dias || null }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ErrorDeMeta) return fail(`Meta no dejó leer los leads: ${e.message}`, e.status);
    console.error("WiWO.ADS calidad de leads", e instanceof Error ? e.message : "error");
    return fail("No se pudo calcular la calidad de los leads", 500);
  }
}
