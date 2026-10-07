import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { diagnosticoDePermisosMeta } from "@/lib/diagnostico-meta";
import { metaNativoConfigurado } from "@/lib/meta-nativo";
import { can } from "@/lib/permisos";

export const dynamic = "force-dynamic";

/** Qué llave de Meta ve cada cuenta y página de los clientes, y con qué permisos. Solo administradores; solo lectura. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!can(session.actor, "ver_cuentas")) return fail("Solo un administrador.", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  if (!metaNativoConfigurado()) return fail("La conexión directa con Meta todavía no está configurada.", 503);
  const clienteId = new URL(request.url).searchParams.get("clienteId");
  try {
    return Response.json(await diagnosticoDePermisosMeta(session.actor, clienteId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("WiWO.ADS diagnóstico de permisos", error instanceof Error ? error.message : "error");
    return fail("No se pudo hacer el diagnóstico", 500);
  }
}
