import { getSession } from "@/app/sesion";
import { mismoOrigen } from "@/lib/origen-publico";
import { asistenteConfigurado } from "@/lib/asistente";
import { generarCopys, type EntradaCopiloto } from "@/lib/copiloto-creativos";
import { can, enAlcance } from "@/lib/permisos";
import { listPortfolios } from "@/lib/portafolios-store";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const MAX_TEXTO = 600;

type Cuerpo = {
  plataforma?: string;
  portfolioId?: string;
  objetivoLabel?: string;
  nombreCampana?: string;
  notaInterna?: string;
  landingUrl?: string;
  brief?: string;
  actual?: EntradaCopiloto["actual"];
};

/**
 * Copiloto de creativos del Constructor: sugiere títulos y textos para el
 * anuncio que se está armando. Solo lee (lo que ya escribió la persona en el
 * borrador, más el nombre real del cliente) y devuelve texto — no crea ni
 * cambia nada en ninguna plataforma. Mismo permiso que abrir el Constructor.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "crear_campanas")) {
    return fail("Tu rol no puede crear campañas", 403);
  }
  if (!mismoOrigen(request)) {
    return fail("Origen no permitido", 403);
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415);
  }
  if (!asistenteConfigurado()) {
    return fail("El asistente no está configurado (falta ANTHROPIC_API_KEY).", 503);
  }

  let cuerpo: Cuerpo;
  try {
    cuerpo = (await request.json()) as Cuerpo;
  } catch {
    return fail("Solicitud no válida", 400);
  }

  const plataforma = cuerpo.plataforma;
  if (plataforma !== "google" && plataforma !== "meta") {
    return fail("Plataforma no reconocida", 400);
  }
  if (!cuerpo.portfolioId || !enAlcance(session.actor, cuerpo.portfolioId)) {
    return fail("Ese cliente no existe o no tienes acceso", 403);
  }

  const portfolios = await listPortfolios();
  const cliente = portfolios.find((p) => p.id === cuerpo.portfolioId);
  if (!cliente) return fail("Ese cliente no existe", 404);

  const recorte = (valor: string | undefined) => (valor ?? "").slice(0, MAX_TEXTO);

  const resultado = await generarCopys({
    plataforma,
    clienteNombre: cliente.name,
    objetivoLabel: recorte(cuerpo.objetivoLabel) || "no indicado",
    nombreCampana: recorte(cuerpo.nombreCampana),
    notaInterna: recorte(cuerpo.notaInterna),
    landingUrl: recorte(cuerpo.landingUrl),
    brief: recorte(cuerpo.brief),
    actual: cuerpo.actual ?? {},
  });

  if (!resultado.ok) return fail(resultado.error, 502);
  return Response.json(resultado, { headers: NO_STORE });
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
