import { getSession } from "@/app/sesion";
import { getRawDb } from "@/db";
import { can } from "@/lib/permisos";
import { listPortfolios } from "@/lib/portafolios-store";

/**
 * Lee la bitácora de `ejecuciones`: lo único que WiWO.ADS alguna vez publicó
 * de verdad en Google o Meta.
 *
 * Antes de esta ruta, esa tabla existía pero era de solo escritura — nadie
 * del equipo podía verla desde la interfaz. Ninguna decisión de negocio
 * distinta acá; solo exponer lo que `/api/constructor/ejecutar` ya registra.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

type FilaEjecucion = {
  id: string;
  portfolio_id: string;
  actor_email: string;
  campaign_name: string;
  platforms: string;
  steps_json: string;
  ok: number;
  created_at: number;
};

export async function GET() {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "ver_operacion")) {
    return fail("No tienes permiso para ver la bitácora", 403);
  }

  const alcance = can(session.actor, "ver_todos_los_clientes")
    ? null
    : session.actor.portfolioIds;

  const db = getRawDb();
  const { results } = await db
    .prepare(
      `SELECT id, portfolio_id, actor_email, campaign_name, platforms,
              steps_json, ok, created_at
         FROM ejecuciones
        ORDER BY created_at DESC
        LIMIT 200`,
    )
    .all<FilaEjecucion>();

  const filas = (alcance === null
    ? results
    : results.filter((fila) => alcance.includes(fila.portfolio_id))
  ) as FilaEjecucion[];

  const portafolios = await listPortfolios();
  const nombrePorId = new Map(portafolios.map((p) => [p.id, p.name]));

  return Response.json(
    {
      ejecuciones: filas.map((fila) => ({
        id: fila.id,
        portfolioId: fila.portfolio_id,
        portfolioName: nombrePorId.get(fila.portfolio_id) ?? fila.portfolio_id,
        actorEmail: fila.actor_email,
        campaignName: fila.campaign_name,
        platforms: fila.platforms.split(",").filter(Boolean),
        ok: fila.ok === 1,
        createdAt: fila.created_at,
        steps: parseSteps(fila.steps_json),
      })),
    },
    { headers: NO_STORE },
  );
}

function parseSteps(raw: string): Array<{
  platform: string;
  action: string;
  label: string;
  params: Record<string, unknown>;
  ok: boolean;
  error: string | null;
  raw: unknown;
}> {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Un registro con JSON corrupto no debería tumbar toda la lista.
    return [];
  }
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
