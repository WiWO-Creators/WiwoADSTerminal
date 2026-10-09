import { paginaDeLaCuenta, paginaEInstagramDeLaCampana } from "@/lib/pagina-de-cuenta";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { puedeArmarCampanas, enAlcance } from "@/lib/permisos";
import { listarMediosInstagram, metaNativoConfigurado } from "@/lib/meta-nativo";
import { listPortfolios, updatePortfolio } from "@/lib/portafolios-store";
import {
  fetchFacebookPosts,
  fetchIdentidadMeta,
  fetchInstagramMedia,
  instagramDelCliente,
  listarCuentasDeInstagram,
  WindsorError,
  type OrganicPost,
} from "@/lib/windsor";

/**
 * Contenido real ya publicado en la Página de Facebook y la cuenta de
 * Instagram de un cliente, para elegirlo como pieza de un anuncio — el mismo
 * flujo que "usar publicación existente" en Meta Ads Manager.
 *
 * Se resuelve por `portfolioId` + cuenta de Meta, no recibiendo el pageId
 * directo del navegador: así el alcance por permisos sigue siendo el mismo
 * que en el resto del Constructor, y la relación cuenta → página vive en un
 * solo lugar (`lib/portafolios-store.ts`).
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
/** Ventana por defecto: suficiente para encontrar algo reciente sin obligar
 * a esperar un barrido largo en cada apertura del selector. */
const DIAS_POR_DEFECTO = 90;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!puedeArmarCampanas(session.actor)) {
    return fail("Tu rol no puede construir campañas", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  }

  const params = new URL(request.url).searchParams;
  const portfolioId = params.get("portfolioId") ?? "";
  const accountId = params.get("accountId") ?? "";
  if (!portfolioId || !accountId) {
    return fail("Falta identificar el cliente o la cuenta de Meta", 400);
  }
  if (!enAlcance(session.actor, portfolioId)) {
    return fail("Ese cliente no está en tu alcance", 403);
  }

  const hasta = params.get("hasta") ?? isoHoy();
  const desde = params.get("desde") ?? isoHaceNDias(DIAS_POR_DEFECTO, hasta);

  try {
    // Solo la lista de clientes guardada: antes cada apertura del selector
    // armaba el resumen de rendimiento completo y leía el catálogo de
    // años (1,6 MB de JSON) nada más para saber qué página de Facebook tiene
    // una cuenta — la respuesta tardaba más en eso que en traer las
    // publicaciones.
    const cliente = (await listPortfolios()).find((item) => item.id === portfolioId);
    if (!cliente) return fail("Cliente no encontrado", 404);

    const claveCuenta = accountId.toLowerCase();
    const idCuenta = cliente.accountIds.find(
      (item) => item.toLowerCase() === claveCuenta,
    );
    if (!idCuenta || cliente.accountProviders[idCuenta] === "google") {
      return fail("Esa cuenta de Meta no pertenece a este cliente", 404);
    }
    // La página propia de la cuenta si la tiene; si no, la del cliente — el
    // mismo orden que ya usa el resto del Constructor.
    const pageId = await paginaDeLaCuenta(cliente, idCuenta);
    if (!pageId) {
      return Response.json(
        {
          posts: [],
          aviso:
            "Esta cuenta de Meta no tiene una Página de Facebook asociada, así que no hay contenido que mostrar.",
        },
        { headers: NO_STORE },
      );
    }

    // Sin cuenta de Instagram declarada se busca entre las que Windsor tiene conectadas, por el nombre del cliente
    // (solo si coincide una). Si se encuentra, se guarda en la ficha para no volver a buscarla.
    // En clientes con varios países (SQM) el Instagram de la ficha puede ser de otra cuenta: manda el que ya usan los anuncios de ESTA
    // cuenta con esta misma Página.
    const usadoPorLaCuenta = await paginaEInstagramDeLaCampana("act_" + idCuenta.replace(/^act_/, ""));
    let instagramId = usadoPorLaCuenta?.pageId === pageId && usadoPorLaCuenta.instagramId ? usadoPorLaCuenta.instagramId : cliente.instagramId;
    let instagramAutomatico = false;
    if (!instagramId) {
      try {
        const encontrada = instagramDelCliente(await listarCuentasDeInstagram(), cliente.name);
        if (encontrada) {
          instagramId = encontrada;
          instagramAutomatico = true;
          await updatePortfolio(session.actor, cliente.id, { instagramId: encontrada }).catch(() => {
            // Sin permiso para guardar en la ficha: se usa igual en esta lectura.
          });
        }
      } catch (error) {
        console.error("WiWO.ADS creatividades: no se pudo buscar el Instagram del cliente", error);
      }
    }

    // Que Facebook falle (la Página puede no estar conectada a Windsor) no esconde lo de Instagram.
    let avisoDeFacebook: string | null = null;
    const [posts, instagram] = await Promise.all([
      fetchFacebookPosts(pageId, desde, hasta).catch((error: unknown) => {
        console.error("WiWO.ADS creatividades: Facebook", error instanceof Error ? error.message : error);
        avisoDeFacebook = "No se pudieron leer las publicaciones de Facebook de esta Página (Windsor no la entrega).";
        return [] as OrganicPost[];
      }),
      instagramId ? instagramRapido(instagramId, desde, hasta) : Promise.resolve<OrganicPost[]>([]),
    ]);
    // Recién después: `fetchIdentidadMeta` solo lee lo que las dos llamadas
    // de arriba acaban de guardar de paso (nunca golpea Windsor por su
    // cuenta) — en paralelo con ellas todavía no habría nada que leer.
    const identidad = await fetchIdentidadMeta(pageId, instagramId ?? null);

    const todo = [...posts, ...instagram].sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );

    // El enlace público de cada publicación no se usa en el selector y en un
    // año de contenido pesaba decenas de KB de más.
    // Se conserva el enlace: sirve para pedirle al Orb que use esa publicación (impulso con vista previa).
    const liviano = todo;

    return Response.json(
      {
        posts: liviano,
        identidad,
        aviso: avisoDeFacebook ?? (instagramId
          ? instagramAutomatico
            ? "Se encontró la cuenta de Instagram de este cliente por su nombre. Revisa que sea la correcta (Clientes → ficha del cliente → Instagram)."
            : null
          : "Este cliente no tiene su cuenta de Instagram declarada, así que solo se muestra Facebook. Declárala en Clientes → ficha del cliente → Instagram para ver también sus publicaciones y reels."),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    const mensaje =
      error instanceof WindsorError
        ? error.message
        : "No pudimos leer el contenido publicado";
    console.error("WiWO.ADS creatividades", error);
    return fail(mensaje, 502);
  }
}

/**
 * Instagram directo de Meta (segundos) y, si no está configurado o falla, Windsor (puede tardar minutos la primera vez).
 * Se queda con lo publicado dentro del periodo pedido.
 */
async function instagramRapido(instagramId: string, desde: string, hasta: string): Promise<OrganicPost[]> {
  if (metaNativoConfigurado()) {
    try {
      const medios = await listarMediosInstagram(instagramId);
      return medios.filter((m) => {
        const dia = m.createdAt?.slice(0, 10) ?? "";
        return dia >= desde && dia <= hasta;
      });
    } catch (error) {
      console.error("WiWO.ADS creatividades: Instagram directo falló, se usa Windsor", error);
    }
  }
  return fetchInstagramMedia(instagramId, desde, hasta);
}

function isoHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoHaceNDias(dias: number, ancla: string): string {
  const fecha = new Date(`${ancla}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return fecha.toISOString().slice(0, 10);
}

