import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { listarAuditoria } from "@/lib/auditoria";
import { can } from "@/lib/permisos";

export const dynamic = "force-dynamic";

/** Auditoría unificada: todo lo que pasa en WiWO.ADS, con filtros. Solo lectura; cada persona ve lo de sus clientes. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!can(session.actor, "ver_operacion")) return fail("No tienes permiso para ver la auditoría", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  const p = new URL(request.url).searchParams;
  const dias = Number(p.get("dias") ?? 0);
  const datos = await listarAuditoria(session.actor, {
    categoria: p.get("categoria") || undefined,
    clienteId: p.get("clienteId") || undefined,
    actor: p.get("actor") || undefined,
    etiqueta: p.get("etiqueta") || undefined,
    texto: p.get("q") || undefined,
    desde: Number.isFinite(dias) && dias > 0 ? Date.now() - dias * 86_400_000 : undefined,
    soloImportantes: p.get("importantes") === "1",
    limite: 300,
  });
  return Response.json(datos, { headers: { "cache-control": "no-store" } });
}
