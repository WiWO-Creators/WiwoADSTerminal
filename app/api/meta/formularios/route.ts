import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { registrarEjecucion } from "@/lib/constructor-ejecutar";
import { crearFormularioMeta, listarFormulariosMeta } from "@/lib/meta-formularios";
import { cuerpoDelFormulario, problemasDelFormulario, type DatosDeFormulario } from "@/lib/meta-formularios-pura";
import { ErrorDeMeta, metaNativoConfigurado } from "@/lib/meta-nativo";
import { mismoOrigen } from "@/lib/origen-publico";
import { paginaDeLaCuenta } from "@/lib/pagina-de-cuenta";
import { can, enAlcance } from "@/lib/permisos";
import { accountIndex, listPortfolios, normalizeAccountId } from "@/lib/portafolios-store";

/**
 * Formularios instantáneos de Meta de la página de una cuenta: listarlos y crear uno nuevo (con sus preguntas que filtran).
 * Crear exige `aprobar_cambios`. Meta no deja borrar un formulario, solo archivarlo, así que `simular` (por defecto) solo valida y
 * devuelve lo que se crearía; crear de verdad exige `simular: false`. La cuenta debe ser de un cliente al alcance de quien pide.
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

async function resolver(actor: Parameters<typeof enAlcance>[0], accountId: string): Promise<{ pageId: string; portfolioId: string } | Response> {
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio || !enAlcance(actor, duenio.id)) return fail("Esa cuenta no está en tu alcance", 403);
  const cliente = (await listPortfolios()).find((p) => p.id === duenio.id);
  if (!cliente) return fail("Ese cliente no existe", 404);
  const pageId = await paginaDeLaCuenta(cliente, accountId);
  if (!pageId) return fail("Esta cuenta no tiene una página de Facebook asociada: asígnala en la ficha del cliente.", 422);
  return { pageId, portfolioId: duenio.id };
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!metaNativoConfigurado()) return fail("La conexión directa con Meta todavía no está configurada.", 503);
  const accountId = (new URL(request.url).searchParams.get("accountId") ?? "").trim();
  if (!accountId) return fail("Falta la cuenta", 400);
  const r = await resolver(session.actor, accountId);
  if (r instanceof Response) return r;
  try {
    return Response.json({ pageId: r.pageId, formularios: await listarFormulariosMeta(r.pageId) }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ErrorDeMeta) return fail(`Meta no dejó leer los formularios de la página: ${e.message}`, e.status);
    console.error("WiWO.ADS formularios", e instanceof Error ? e.message : "error");
    return fail("No se pudieron leer los formularios", 500);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  if (!can(session.actor, "aprobar_cambios")) return fail("Crear un formulario requiere permiso de aprobación", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  if (!metaNativoConfigurado()) return fail("La conexión directa con Meta todavía no está configurada.", 503);
  const body = (await request.json().catch(() => null)) as { accountId?: string; formulario?: DatosDeFormulario; simular?: boolean } | null;
  if (!body?.accountId || !body.formulario) return fail("Faltan la cuenta o el formulario", 400);
  const problemas = problemasDelFormulario(body.formulario);
  if (problemas.length > 0) return Response.json({ error: "El formulario tiene problemas", problemas }, { status: 422, headers: NO_STORE });
  const r = await resolver(session.actor, body.accountId);
  if (r instanceof Response) return r;
  const cuerpo = cuerpoDelFormulario(body.formulario);
  if (body.simular !== false) return Response.json({ simulado: true, pageId: r.pageId, seCrearia: cuerpo }, { headers: NO_STORE });
  try {
    const id = await crearFormularioMeta(r.pageId, cuerpo);
    await registrarEjecucion(
      { portfolioId: r.portfolioId, name: `Formulario: ${body.formulario.nombre}`, platforms: ["meta"] },
      session.actor.email,
      [{ platform: "meta", action: "leadgen_forms:crear", label: body.formulario.nombre, ok: true, error: null, raw: { id, pageId: r.pageId } } as never],
      true,
    );
    return Response.json({ simulado: false, pageId: r.pageId, id }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ErrorDeMeta) return fail(`Meta no creó el formulario: ${e.message}`, e.status);
    console.error("WiWO.ADS crear formulario", e instanceof Error ? e.message : "error");
    return fail("No se pudo crear el formulario", 500);
  }
}
