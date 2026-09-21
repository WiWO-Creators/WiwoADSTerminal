import { getSession } from "@/app/sesion";
import { can, enAlcance } from "@/lib/permisos";
import { listPortfolios } from "@/lib/portafolios-store";
import {
  fetchFacebookPosts,
  fetchInstagramMedia,
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
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "crear_campanas")) {
    return fail("Tu rol no puede construir campañas", 403);
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
    const pageId = cliente.accountPages[idCuenta] ?? cliente.pageId;
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

    const [posts, instagram] = await Promise.all([
      fetchFacebookPosts(pageId, desde, hasta),
      cliente.instagramId
        ? fetchInstagramMedia(cliente.instagramId, desde, hasta)
        : Promise.resolve<OrganicPost[]>([]),
    ]);

    const todo = [...posts, ...instagram].sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );

    // El enlace público de cada publicación no se usa en el selector y en un
    // año de contenido pesaba decenas de KB de más.
    const liviano = todo.map((post) => ({ ...post, permalink: undefined }));

    return Response.json(
      {
        posts: liviano,
        aviso: cliente.instagramId
          ? null
          : "Este cliente no tiene una cuenta de Instagram declarada, así que solo se muestra Facebook.",
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

function isoHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoHaceNDias(dias: number, ancla: string): string {
  const fecha = new Date(`${ancla}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return fecha.toISOString().slice(0, 10);
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
