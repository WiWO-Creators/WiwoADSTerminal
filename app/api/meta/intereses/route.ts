import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { buscarInteresesMeta, ErrorDeMeta, metaNativoConfigurado } from "@/lib/meta-nativo";
import { puedeArmarCampanas } from "@/lib/permisos";

/** Búsqueda de intereses de Meta por palabra, para segmentar sin tener que conocer sus ids. Solo lectura. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!puedeArmarCampanas(session.actor)) return fail("Tu rol no puede construir campañas", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  if (!metaNativoConfigurado()) return fail("La conexión directa con Meta todavía no está configurada.", 503);
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return Response.json({ intereses: await buscarInteresesMeta(q) }, { headers: { "cache-control": "private, max-age=300" } });
  } catch (error) {
    if (error instanceof ErrorDeMeta) return fail(error.message, error.status);
    console.error("WiWO.ADS intereses Meta", error);
    return fail("No se pudieron buscar los intereses", 500);
  }
}
