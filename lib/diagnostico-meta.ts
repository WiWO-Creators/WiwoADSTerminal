/**
 * Diagnóstico de permisos de Meta: por cada cuenta publicitaria y página de los clientes, qué llave (usuario del sistema)
 * la ve y con qué permisos. Solo lectura; nunca muestra ni guarda el valor de una llave.
 * Para crear un anuncio desde una publicación hace falta UNA llave que pueda anunciar en la cuenta Y en la página.
 */
import { TAREAS_CUENTA_QUE_EDITAN, TAREAS_PAGINA_QUE_ANUNCIAN, veredicto, type DiagnosticoDeCuenta, type PermisoDeLlave } from "@/lib/diagnostico-meta-pura";
import { tokensDeMeta } from "@/lib/meta-nativo";
import { listPortfolios } from "@/lib/portafolios-store";
import { enAlcance, type Actor } from "@/lib/permisos";

const VERSION = "v21.0";

async function leer<T>(ruta: string, llave: string, campos: string): Promise<T | null> {
  try {
    const r = await fetch(`https://graph.facebook.com/${VERSION}/${ruta}?fields=${encodeURIComponent(campos)}&limit=100&access_token=${encodeURIComponent(llave)}`, { cache: "no-store" });
    const j = (await r.json()) as T & { error?: unknown };
    return j && !("error" in (j as object) && (j as { error?: unknown }).error) ? j : null;
  } catch {
    return null;
  }
}

export async function diagnosticoDePermisosMeta(actor: Actor, clienteId: string | null): Promise<{ llaves: number; cuentas: DiagnosticoDeCuenta[] }> {
  const llaves = tokensDeMeta();
  const paginasPorLlave = await Promise.all(
    llaves.map(async (t) => {
      const j = await leer<{ data?: Array<{ id: string; tasks?: string[] }> }>("me/accounts", t, "id,tasks");
      return new Map((j?.data ?? []).map((p) => [p.id, p.tasks ?? []]));
    }),
  );
  const salida: DiagnosticoDeCuenta[] = [];
  for (const c of await listPortfolios()) {
    if ((clienteId && c.id !== clienteId) || !enAlcance(actor, c.id)) continue;
    for (const cuenta of c.accountIds.filter((a) => c.accountProviders[a] === "meta")) {
      const paginaId = c.accountPages[cuenta] ?? c.pageId ?? null;
      const cuentaPorLlave: PermisoDeLlave[] = [];
      for (const [i, t] of llaves.entries()) {
        const j = await leer<{ name?: string; user_tasks?: string[] }>(`act_${cuenta.replace(/^act_/, "")}`, t, "name,user_tasks");
        const tareas = j?.user_tasks ?? [];
        cuentaPorLlave.push({ llave: i + 1, ve: j !== null, tareas, puede: tareas.some((x) => TAREAS_CUENTA_QUE_EDITAN.includes(x)) });
      }
      const paginaPorLlave: PermisoDeLlave[] = llaves.map((_, i) => {
        const tareas = paginaId ? (paginasPorLlave[i].get(paginaId) ?? []) : [];
        return { llave: i + 1, ve: tareas.length > 0, tareas, puede: tareas.some((x) => TAREAS_PAGINA_QUE_ANUNCIAN.includes(x)) };
      });
      salida.push({ clienteId: c.id, cliente: c.name, cuenta, paginaId, cuentaPorLlave, paginaPorLlave, ...veredicto(cuentaPorLlave, paginaPorLlave, Boolean(paginaId)) });
    }
  }
  return { llaves: llaves.length, cuentas: salida };
}
