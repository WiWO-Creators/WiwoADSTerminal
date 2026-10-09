import { detalleClientes } from "@/lib/clientes-detalle";
import type { CredencialesGoogle } from "@/lib/google-ads-nativo";
import {
  entidadConAncestros,
  fetchDetalleDeCuenta,
} from "@/lib/detalle-entidad-store";
import type { DetalleDeCuenta } from "@/lib/detalle-entidad";
import {
  planEdicion,
  type AntesDeEdicion,
  type CambiosEdicion,
  type PlanEdicion,
} from "@/lib/edicion-plan";
import { accesoNativoGoogle } from "@/lib/integration-store";
import { accesoNativoLinkedin, type CredencialesLinkedin } from "@/lib/linkedin-conexion";
import { enAlcance, type Actor } from "@/lib/permisos";
import type { NivelEntidad, Platform } from "@/lib/plataformas";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";

/**
 * Prepara una edición: lee la entidad de la plataforma, comprueba el alcance y
 * arma el plan. Lo comparten la ruta del editor y el asistente de IA, para que
 * ninguno de los dos tenga su propia versión de estas reglas (y una no pueda
 * quedar más permisiva que la otra).
 *
 * No escribe nada.
 */
export class ErrorDeEdicion extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type EdicionPreparada = {
  plan: PlanEdicion;
  antes: AntesDeEdicion;
  portfolioId: string;
  currency: string | null;
  credencialesGoogle: CredencialesGoogle | null;
  /** Con esto LinkedIn se edita por su API directa; `null`: por Windsor (ver `accesoNativoLinkedin`). */
  credencialesLinkedin: CredencialesLinkedin | null;
  detalle: DetalleDeCuenta;
};

export function armarAntes(
  nivel: NivelEntidad,
  e: ReturnType<typeof entidadConAncestros>,
): AntesDeEdicion | null {
  if (nivel === "campana") return e.campana ? { nivel, entidad: e.campana } : null;
  if (nivel === "conjunto") return e.conjunto ? { nivel, entidad: e.conjunto, campana: e.campana } : null;
  return e.anuncio ? { nivel, entidad: e.anuncio } : null;
}

/** La cuenta debe pertenecer a un cliente que esta persona puede ver (y, si se fija, a ESE cliente). */
export async function clienteDeLaCuenta(
  actor: Actor,
  accountId: string,
  soloCliente?: string | null,
): Promise<string> {
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio) throw new ErrorDeEdicion("Esa cuenta no pertenece a ningún cliente", 403);
  if (!enAlcance(actor, duenio.id) || (soloCliente && duenio.id !== soloCliente)) {
    throw new ErrorDeEdicion("Ese cliente no está en tu alcance", 403);
  }
  return duenio.id;
}

export async function prepararEdicion({
  actor,
  provider,
  accountId,
  nivel,
  id,
  cambios,
  soloCliente,
}: {
  actor: Actor;
  provider: Platform;
  accountId: string;
  nivel: NivelEntidad;
  id: string;
  cambios: CambiosEdicion;
  /** Con un cliente elegido en pantalla, la cuenta debe ser suya. */
  soloCliente?: string | null;
}): Promise<EdicionPreparada> {
  const portfolioId = await clienteDeLaCuenta(actor, accountId, soloCliente);

  // La moneda sale del servidor, no del navegador ni del modelo: decide en qué
  // unidad se envía un presupuesto de Meta.
  const { clientes } = await detalleClientes(actor, new Date());
  const cuenta = clientes
    .find((c) => c.id === portfolioId)
    ?.accounts.find((a) => normalizeAccountId(a.externalId) === normalizeAccountId(accountId));
  const currency = cuenta?.currency ?? null;

  const credencialesGoogle =
    provider === "google" ? await accesoNativoGoogle(actor, accountId) : null;
  const credencialesLinkedin =
    provider === "linkedin" ? await accesoNativoLinkedin(actor, accountId) : null;
  const detalle = await fetchDetalleDeCuenta(provider, accountId, { credencialesGoogle, credencialesLinkedin });
  const antes = armarAntes(nivel, entidadConAncestros(detalle, nivel, id));
  if (!antes) {
    throw new ErrorDeEdicion(
      provider === "google" && !credencialesGoogle
        ? "No se encontró esta entidad. Windsor solo entrega lo que tuvo actividad reciente: conecta tu cuenta de Google en Integraciones para ver y editar también lo pausado o recién creado."
        : "No se encontró la entidad en la plataforma. Si está pausada hace mucho, Windsor no la entrega.",
      404,
    );
  }

  const plan = planEdicion(provider, antes, cambios, {
    currency,
    nativaGoogle: credencialesGoogle !== null,
    nativaLinkedin: credencialesLinkedin !== null,
  });
  return { plan, antes, portfolioId, currency, credencialesGoogle, credencialesLinkedin, detalle };
}
