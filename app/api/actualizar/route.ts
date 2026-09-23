import { getSession } from "@/app/sesion";
import { getRawDb } from "@/db";
import { generarAlertas } from "@/lib/alertas";
import { can } from "@/lib/permisos";
import { getPerformanceSnapshot } from "@/lib/performance-store";
import { listPortfolios } from "@/lib/portafolios-store";
import { construirResumenSemanal } from "@/lib/resumen-semanal";
import { guardarResumenSemanal } from "@/lib/resumen-semanal-store";
import {
  fetchWindsorCatalog,
  limpiarCacheDeMetricas,
  windsorConfigured,
} from "@/lib/windsor";

/**
 * Actualización de datos: manual (el botón "Actualizar" del encabezado) y
 * automática (la app la pide sola cuando el catálogo lleva más de
 * `INTERVALO_AUTOACTUALIZACION_MS`).
 *
 * Todo es lectura contra Windsor — no escribe nada en ninguna plataforma —
 * pero consume cuota y tarda: borra el caché de métricas para que la próxima
 * lectura vaya a la fuente y, si se pide, reconstruye el catálogo de campañas
 * completo (rango de 3 años, ~11-12 s medido en vivo tras comprimir el
 * caché). Por eso queda en manos de quien administra conexiones, como ya
 * estaba `POST /api/catalogo`.
 *
 * Era semanal (7 días) hasta que se detectó en vivo que una campaña borrada
 * de verdad en la plataforma seguía mostrándose en WiWO.ADS durante todo ese
 * tiempo. Ahora es cada 2 horas — el barrido completo (el único con rango lo
 * bastante ancho como para notar un borrado sin arriesgarse a esconder una
 * campaña real que lleva más de 45 días pausada, ver
 * `actualizarCatalogoDeCuentas` en lib/windsor.ts) ya es lo bastante rápido
 * como para no esperar una semana entre uno y el siguiente. No hay un cron:
 * este hosting no lo trae, así que la dispara la primera sesión con permiso
 * que abre la app pasado ese intervalo.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/** Cada cuánto se reconstruye solo el catálogo completo. */
const INTERVALO_AUTOACTUALIZACION_MS = 2 * 60 * 60 * 1000;

/**
 * Con la automática bajada a 2 h en vez de 7 días, es mucho más probable que
 * dos personas —o la misma persona en dos pestañas— tengan la app abierta
 * justo cuando el catálogo se puso viejo, y las dos disparen el barrido
 * completo a la vez. Este candado (una fila de `app_meta` con vencimiento
 * corto) hace que la segunda espere el resultado de la primera en vez de
 * pedirle a Windsor el mismo barrido dos veces.
 */
const CANDADO_KEY = "windsor_actualizar_candado";
const CANDADO_TTL_MS = 3 * 60 * 1000;

async function tomarCandado(): Promise<boolean> {
  const db = getRawDb();
  const ahora = Date.now();
  await db
    .prepare(
      `DELETE FROM app_meta WHERE key = ? AND CAST(value AS INTEGER) < ?`,
    )
    .bind(CANDADO_KEY, ahora - CANDADO_TTL_MS)
    .run();
  try {
    await db
      .prepare(`INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)`)
      .bind(CANDADO_KEY, String(ahora), ahora)
      .run();
    return true;
  } catch {
    // Choque de clave primaria: ya hay un candado vigente, no es un error.
    return false;
  }
}

async function soltarCandado(): Promise<void> {
  try {
    await getRawDb().prepare(`DELETE FROM app_meta WHERE key = ?`).bind(CANDADO_KEY).run();
  } catch (error) {
    console.error("WiWO.ADS soltarCandado", error);
  }
}

/** Estado: cuándo se construyó por última vez el catálogo y si toca refrescarlo solo. */
export async function GET() {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);

  const hoy = new Date().toISOString().slice(0, 10);
  const catalogo = await fetchWindsorCatalog(hoy);
  const edad = catalogo.construidoEn === null ? null : Date.now() - catalogo.construidoEn;
  return Response.json(
    {
      construidoEn: catalogo.construidoEn,
      tocaAutoActualizar: edad === null || edad > INTERVALO_AUTOACTUALIZACION_MS,
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

  if (!(await tomarCandado())) {
    return Response.json(
      {
        ok: true,
        yaEnCurso: true,
        campanas: 0,
        anuncios: 0,
        cacheBorrado: 0,
        fallos: [],
        tardoMs: 0,
      },
      { headers: NO_STORE },
    );
  }

  const inicio = Date.now();
  let cacheBorrado: number;
  let catalogo: Awaited<ReturnType<typeof fetchWindsorCatalog>>;
  try {
    try {
      cacheBorrado = await limpiarCacheDeMetricas();
      const hoy = new Date().toISOString().slice(0, 10);
      catalogo = await fetchWindsorCatalog(hoy, { construir: true, forzar: true });
    } catch (error) {
      // Sin este try/catch, cualquier error acá (por ejemplo, el catálogo
      // completo pesando más de lo que D1 admite guardar en una fila) tumbaba
      // la ruta entera: la plataforma devolvía su propia página de error, no
      // JSON, y el navegador mostraba un mensaje de parseo que no decía nada
      // del problema real. Este sí dice qué pasó.
      console.error("WiWO.ADS actualizar", error);
      return fail(
        error instanceof Error
          ? `No se pudo actualizar: ${error.message}`
          : "No se pudo actualizar: error inesperado",
        500,
      );
    }

    // El resumen semanal se recalcula acá, no en cada lectura: es la misma
    // ocasión en la que ya se pagó el costo de traer todo de nuevo. Si falla,
    // no debe tumbar la actualización real — solo faltará el resumen hasta la
    // próxima vez.
    try {
      const [snap, portfolios] = await Promise.all([
        getPerformanceSnapshot(session.actor, new Date(), {
          incluirCampanas: true,
          incluirAnuncios: false,
        }),
        listPortfolios(),
      ]);
      const alertas = generarAlertas(portfolios, snap.campaigns);
      await guardarResumenSemanal(construirResumenSemanal(snap, alertas));
    } catch (error) {
      console.error("WiWO.ADS resumen semanal", error);
    }

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
  } finally {
    await soltarCandado();
  }
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
