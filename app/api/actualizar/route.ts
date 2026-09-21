import { getSession } from "@/app/sesion";
import { can } from "@/lib/permisos";
import {
  fetchWindsorCatalog,
  limpiarCacheDeMetricas,
  windsorConfigured,
} from "@/lib/windsor";

/**
 * Actualización de datos: manual (el botón "Actualizar" del encabezado) y
 * semanal (la app la pide sola cuando el catálogo lleva más de siete días).
 *
 * Todo es lectura contra Windsor — no escribe nada en ninguna plataforma —
 * pero consume cuota y tarda: borra el caché de métricas para que la próxima
 * lectura vaya a la fuente y, si se pide, reconstruye el catálogo de campañas
 * (minutos). Por eso queda en manos de quien administra conexiones, como ya
 * estaba `POST /api/catalogo`.
 *
 * No hay un cron: este hosting no lo trae. La actualización semanal ocurre
 * la primera vez que alguien con permiso abre la app pasada la semana.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/** Cada cuánto se reconstruye solo el catálogo completo. */
const INTERVALO_SEMANAL_MS = 7 * 24 * 60 * 60 * 1000;

/** Estado: cuándo se construyó por última vez el catálogo y si toca la semanal. */
export async function GET() {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);

  const hoy = new Date().toISOString().slice(0, 10);
  const catalogo = await fetchWindsorCatalog(hoy);
  const edad = catalogo.construidoEn === null ? null : Date.now() - catalogo.construidoEn;
  return Response.json(
    {
      construidoEn: catalogo.construidoEn,
      tocaSemanal: edad === null || edad > INTERVALO_SEMANAL_MS,
      puedeActualizar: can(session.actor, "administrar_conexiones"),
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "administrar_conexiones")) {
    return fail("No tienes permiso para actualizar los datos", 403);
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return fail("Origen no permitido", 403);
  }
  if (!windsorConfigured()) return fail("Falta configurar WINDSOR_API_KEY", 503);

  const inicio = Date.now();
  const cacheBorrado = await limpiarCacheDeMetricas();
  const hoy = new Date().toISOString().slice(0, 10);
  const catalogo = await fetchWindsorCatalog(hoy, { construir: true, forzar: true });

  return Response.json(
    {
      ok: catalogo.fallos.length === 0,
      construidoEn: catalogo.construidoEn,
      campanas: catalogo.campanas.length,
      anuncios: catalogo.anuncios.length,
      cacheBorrado,
      fallos: catalogo.fallos.map((f) => `${f.provider}: ${f.mensaje}`),
      tardoMs: Date.now() - inicio,
    },
    { headers: NO_STORE },
  );
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
