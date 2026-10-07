import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import {
  entidadConAncestros,
  fetchDetalleDeCuenta,
  VENTANA_DETALLE_DIAS,
} from "@/lib/detalle-entidad-store";
import { accesoNativoGoogle } from "@/lib/integration-store";
import { enAlcance } from "@/lib/permisos";
import { puedeAdministrar } from "@/lib/plataformas";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";
import { WindsorError } from "@/lib/windsor";

/**
 * Configuración completa de una campaña, conjunto o anuncio ya publicado, tal
 * como está hoy en la plataforma: es el "antes" del modo editar del
 * Constructor. Solo lectura — no escribe nada.
 *
 * Aplica el mismo alcance por cliente que las rutas de edición: la cuenta la
 * dice el navegador, así que se comprueba que pertenezca a un cliente que esta
 * persona puede ver.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const NIVELES = ["campana", "conjunto", "anuncio"] as const;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);

  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") ?? "";
  const accountId = (url.searchParams.get("accountId") ?? "").trim();
  const nivel = url.searchParams.get("nivel") ?? "";
  const id = (url.searchParams.get("id") ?? "").trim();

  if (!puedeAdministrar(provider)) {
    return fail("Plataforma no reconocida o todavía no activa", 400);
  }
  if (!accountId) return fail("Falta la cuenta", 400);
  if (!(NIVELES as readonly string[]).includes(nivel)) return fail("Nivel no reconocido", 400);
  if (!id) return fail("Falta el identificador de la entidad", 400);

  const portafolio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!portafolio) return fail("Esa cuenta no pertenece a ningún cliente", 403);
  if (!enAlcance(session.actor, portafolio.id)) {
    return fail("Ese cliente no está en tu alcance", 403);
  }

  try {
    const credencialesGoogle =
      provider === "google" ? await accesoNativoGoogle(session.actor, accountId) : null;
    const detalle = await fetchDetalleDeCuenta(provider, accountId, { credencialesGoogle });
    const entidad = entidadConAncestros(detalle, nivel as (typeof NIVELES)[number], id);
    const encontrada = entidad[nivel as (typeof NIVELES)[number]] !== null;
    return Response.json(
      {
        encontrada,
        // "No encontrada" solo dice "sin actividad en esta ventana", no que no exista.
        ventanaDias: VENTANA_DETALLE_DIAS,
        fuente: detalle.fuente,
        avisos: detalle.avisos,
        ...entidad,
        // Performance Max: el contenido vive en los grupos de recursos de la campaña (solo con la cuenta de Google conectada).
        ...(nivel === "campana" && detalle.gruposDeRecursos ? { gruposDeRecursos: detalle.gruposDeRecursos.filter((g) => g.campaignId === id) } : {}),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof WindsorError) {
      return fail("Windsor no respondió a tiempo. Intenta de nuevo en un momento.", 502);
    }
    console.error("WiWO.ADS detalle de entidad", error);
    return fail("No se pudo leer la configuración de la entidad", 500);
  }
}
