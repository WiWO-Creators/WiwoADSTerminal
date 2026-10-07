import { graphJson, metaNativoConfigurado } from "@/lib/meta-nativo";
import { esFalloDeWindsor, llamadaDeMetaParaAccion } from "@/lib/respaldo-meta-pura";
import { executeWindsorAction } from "@/lib/windsor";

type Resultado = Awaited<ReturnType<typeof executeWindsorAction>>;

/**
 * Ejecuta una acción de Windsor y, si Windsor falla por su cuenta (5xx) en Meta, la repite por la API directa de Meta con la
 * misma acción traducida. Un rechazo de Meta o de las reglas del cambio nunca se reintenta: solo los fallos del propio Windsor.
 */
export async function ejecutarConRespaldo(
  provider: Parameters<typeof executeWindsorAction>[0],
  accountId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<Resultado> {
  const r = await executeWindsorAction(provider, accountId, action, params);
  if (r.ok || provider !== "meta" || !esFalloDeWindsor(r.error) || !metaNativoConfigurado()) return r;
  const llamada = llamadaDeMetaParaAccion(action, params);
  if (!llamada) return r;
  try {
    const respuesta = await graphJson<Record<string, unknown>>(llamada.id, "POST", llamada.params as Record<string, string | number | boolean | object>);
    return { ok: true, raw: { via: "meta-directo", motivo: r.error, respuesta }, error: null } as Resultado;
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Meta rechazó el cambio";
    return { ok: false, raw: { via: "meta-directo", motivo: r.error }, error: mensaje } as Resultado;
  }
}
