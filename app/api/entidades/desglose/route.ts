import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { dimensionesDe, type Dimension } from "@/lib/desglose";
import { ErrorDeDesglose, fetchDesglose } from "@/lib/desglose-store";
import { clienteDeLaCuenta, ErrorDeEdicion } from "@/lib/edicion-servicio";
import { isActivePlatform } from "@/lib/plataformas";
import { esRango, RANGO_POR_DEFECTO, resolverRango } from "@/lib/rangos";
import { WindsorError } from "@/lib/windsor";

/**
 * Desglose de una campaña, conjunto o anuncio (edad, género, red, dispositivo…).
 * Solo lectura. Mismo alcance por cliente que el resto: la cuenta la dice el
 * navegador, así que se comprueba que sea de un cliente que esta persona ve.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const NIVELES = ["campana", "conjunto", "anuncio"] as const;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);

  const params = new URL(request.url).searchParams;
  const provider = params.get("provider") ?? "";
  const accountId = (params.get("accountId") ?? "").trim();
  const nivel = params.get("nivel") ?? "";
  const id = (params.get("id") ?? "").trim();
  const por = params.get("por") ?? "";
  const pedido = params.get("rango") ?? "";

  if (!isActivePlatform(provider)) return fail("Plataforma no reconocida o todavía no activa", 400);
  if (!accountId) return fail("Falta la cuenta", 400);
  if (!(NIVELES as readonly string[]).includes(nivel)) return fail("Nivel no reconocido", 400);
  if (!id) return fail("Falta el identificador de la entidad", 400);
  if (!dimensionesDe(provider).some((d) => d.id === por)) {
    return fail("Ese desglose no está disponible para esta plataforma", 400);
  }

  try {
    await clienteDeLaCuenta(session.actor, accountId);
    const rango = resolverRango(esRango(pedido) ? pedido : RANGO_POR_DEFECTO, new Date());
    const filas = await fetchDesglose({
      provider,
      accountId,
      nivel: nivel as (typeof NIVELES)[number],
      id,
      dimension: por as Dimension,
      desde: rango.desde,
      hasta: rango.hasta,
    });
    return Response.json(
      {
        filas,
        periodo: { label: rango.label, desde: rango.desde, hasta: rango.hasta, enCurso: rango.enCurso },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof ErrorDeEdicion || error instanceof ErrorDeDesglose) {
      return Response.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    }
    if (error instanceof WindsorError) {
      return fail("Windsor no respondió a tiempo. Intenta de nuevo en un momento.", 502);
    }
    console.error("WiWO.ADS desglose", error);
    return fail("No se pudo leer el desglose", 500);
  }
}
