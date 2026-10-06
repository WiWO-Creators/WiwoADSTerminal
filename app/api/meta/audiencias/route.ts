import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import {
  crearAudienciaSimilar,
  crearAudienciaWeb,
  eliminarAudienciaDePrueba,
  ErrorDeMeta,
  listarAudienciasMeta,
  listarPixelesMeta,
  listarReglasNativasMeta,
  metaNativoConfigurado,
} from "@/lib/meta-nativo";
import { mismoOrigen } from "@/lib/origen-publico";
import { can, enAlcance } from "@/lib/permisos";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";
import { registrarEjecucion } from "@/lib/constructor-ejecutar";

/**
 * Audiencias de Meta por la API directa: leer (audiencias, píxeles y reglas nativas de la cuenta) y crear audiencias
 * similares o de sitio web. Crear exige `aprobar_cambios`; la cuenta debe ser de un cliente al alcance de quien pide.
 * Las audiencias no gastan dinero. Meta no permite validar sin crear, así que `simular` (el valor por defecto) solo comprueba los datos; crear de verdad exige `simular: false`. Todo queda en la auditoría.
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

async function cuentaPermitida(actor: Parameters<typeof enAlcance>[0], portfolioId: string, accountId: string): Promise<Response | null> {
  if (!portfolioId || !accountId) return fail("Falta identificar el cliente o la cuenta", 400);
  if (!enAlcance(actor, portfolioId)) return fail("Ese cliente no está en tu alcance", 403);
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio || duenio.id !== portfolioId) return fail("Esa cuenta no pertenece a este cliente", 403);
  return null;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!metaNativoConfigurado()) return fail("La conexión directa con Meta todavía no está configurada.", 503);
  const p = new URL(request.url).searchParams;
  const accountId = (p.get("accountId") ?? "").trim();
  // Sin cliente en el pedido (la pantalla de edición no lo conoce), se deduce de la cuenta; el alcance se comprueba igual.
  const portfolioId = p.get("portfolioId") || (await accountIndex()).get(normalizeAccountId(accountId))?.id || "";
  const bloqueo = await cuentaPermitida(session.actor, portfolioId, accountId);
  if (bloqueo) return bloqueo;
  try {
    const [audiencias, pixeles, reglas] = await Promise.all([
      listarAudienciasMeta(accountId),
      listarPixelesMeta(accountId).catch(() => []),
      listarReglasNativasMeta(accountId).catch(() => []),
    ]);
    return Response.json({ audiencias, pixeles, reglas }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ErrorDeMeta) return fail(error.message, error.status);
    console.error("WiWO.ADS audiencias Meta", error);
    return fail("No se pudieron leer las audiencias", 500);
  }
}

type Cuerpo = {
  portfolioId?: string;
  accountId?: string;
  tipo?: "similar" | "web";
  nombre?: string;
  origenId?: string;
  pais?: string;
  porcentaje?: number;
  pixelId?: string;
  dias?: number;
  simular?: boolean;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!can(session.actor, "aprobar_cambios")) return fail("Solo un supervisor o administrador crea audiencias.", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415, CODIGOS_ERROR.CONTENT_TYPE_INVALIDO);
  }
  if (!metaNativoConfigurado()) return fail("La conexión directa con Meta todavía no está configurada.", 503);
  const b = (await request.json()) as Cuerpo;
  const accountId = (b.accountId ?? "").trim();
  const bloqueo = await cuentaPermitida(session.actor, b.portfolioId ?? "", accountId);
  if (bloqueo) return bloqueo;
  const nombre = (b.nombre ?? "").trim();
  if (nombre.length < 3) return fail("Ponle un nombre a la audiencia (mínimo 3 letras).", 400);
  const simular = b.simular !== false; // por defecto solo valida; crear de verdad exige `simular: false`
  try {
    let resultado;
    if (b.tipo === "similar") {
      if (!b.origenId) return fail("Elige la audiencia de origen.", 400);
      resultado = await crearAudienciaSimilar(accountId, { nombre, origenId: b.origenId, pais: (b.pais ?? "").toUpperCase(), ratio: (b.porcentaje ?? 0) / 100, simular });
    } else if (b.tipo === "web") {
      if (!b.pixelId) return fail("Elige el píxel.", 400);
      resultado = await crearAudienciaWeb(accountId, { nombre, pixelId: b.pixelId, dias: b.dias ?? 30, simular });
    } else {
      return fail("Tipo de audiencia no válido", 400);
    }
    if (!simular) {
      await registrarEjecucion(
        { portfolioId: b.portfolioId!, name: `Audiencia ${b.tipo === "similar" ? "similar" : "de sitio web"}: ${nombre}`, platforms: ["meta"] },
        session.actor.email,
        [{ platform: "meta", action: `customaudiences:${b.tipo}`, label: nombre, ok: true, error: null, raw: { id: resultado.id } } as never],
        true,
      );
    }
    return Response.json(resultado, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ErrorDeMeta) return fail(error.message, error.status);
    console.error("WiWO.ADS crear audiencia Meta", error);
    return fail("No se pudo crear la audiencia", 500);
  }
}

/** Borra una audiencia de PRUEBA (nombre con el prefijo de prueba). Las de los clientes nunca se borran desde aquí. */
export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!can(session.actor, "aprobar_cambios")) return fail("Solo un supervisor o administrador.", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  const b = (await request.json()) as { portfolioId?: string; accountId?: string; audienciaId?: string };
  const accountId = (b.accountId ?? "").trim();
  const bloqueo = await cuentaPermitida(session.actor, b.portfolioId ?? "", accountId);
  if (bloqueo) return bloqueo;
  if (!/^\d+$/.test(b.audienciaId ?? "")) return fail("Falta el id de la audiencia.", 400);
  try {
    const propias = await listarAudienciasMeta(accountId);
    if (!propias.some((a) => a.id === b.audienciaId)) return fail("Esa audiencia no es de esta cuenta.", 404);
    await eliminarAudienciaDePrueba(b.audienciaId!);
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ErrorDeMeta) return fail(error.message, error.status);
    console.error("WiWO.ADS borrar audiencia de prueba", error);
    return fail("No se pudo borrar la audiencia", 500);
  }
}
