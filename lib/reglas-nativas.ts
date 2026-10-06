/**
 * Reglas que ya existen DENTRO de las plataformas (hoy: Meta), de cada cliente. Solo lectura: nunca se modifican desde aquí.
 * Google Ads, TikTok y LinkedIn no exponen sus reglas automáticas por API, así que no se pueden listar.
 */
import { can, enAlcance, type Actor } from "@/lib/permisos";
import { listPortfolios } from "@/lib/portafolios-store";
import { listarReglasMeta, metaNativoConfigurado } from "@/lib/meta-nativo";
import { interpretarReglaMeta, type ReglaDeMeta } from "@/lib/reglas-meta-pura";

export type ReglasNativasDeCuenta = { clienteId: string; cliente: string; cuenta: string; plataforma: "meta"; reglas: ReglaDeMeta[]; error: string | null };

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { en: number; valor: ReglasNativasDeCuenta["reglas"] }>();

export async function listarReglasNativas(actor: Actor, clienteId: string | null): Promise<{ cuentas: ReglasNativasDeCuenta[]; nota: string }> {
  const nota = "Solo lectura. Google Ads, TikTok y LinkedIn no entregan sus reglas automáticas por API, así que no aparecen aquí.";
  if (!actor.isActive || !can(actor, "aprobar_cambios") || !metaNativoConfigurado()) return { cuentas: [], nota };
  const salida: ReglasNativasDeCuenta[] = [];
  for (const c of await listPortfolios()) {
    if ((clienteId && c.id !== clienteId) || !enAlcance(actor, c.id)) continue;
    for (const cuenta of c.accountIds.filter((a) => c.accountProviders[a] === "meta")) {
      const guardada = cache.get(cuenta);
      if (guardada && Date.now() - guardada.en < CACHE_MS) {
        salida.push({ clienteId: c.id, cliente: c.name, cuenta, plataforma: "meta", reglas: guardada.valor, error: null });
        continue;
      }
      try {
        const { moneda, reglas } = await listarReglasMeta(cuenta);
        const valor = reglas.map((r) => interpretarReglaMeta(r, moneda));
        cache.set(cuenta, { en: Date.now(), valor });
        salida.push({ clienteId: c.id, cliente: c.name, cuenta, plataforma: "meta", reglas: valor, error: null });
      } catch {
        salida.push({ clienteId: c.id, cliente: c.name, cuenta, plataforma: "meta", reglas: [], error: "No pude leer las reglas de esta cuenta." });
      }
    }
  }
  return { cuentas: salida, nota };
}
