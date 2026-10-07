import { graphJson, metaNativoConfigurado } from "@/lib/meta-nativo";

/**
 * La Página de Facebook de una cuenta publicitaria de Meta cuando nadie la declaró en la ficha: se pregunta a Meta qué
 * páginas puede promocionar esa cuenta (`promote_pages`). Solo se usa si hay exactamente UNA: con varias no se adivina, la
 * persona la declara en la ficha del cliente. Solo lectura; el resultado se recuerda una hora.
 */
type Pagina = { id: string; name: string | null };
const VIGENCIA_MS = 60 * 60 * 1000;
const memoria = new Map<string, { ts: number; paginas: Pagina[] }>();

export async function paginasQuePuedePromocionar(accountId: string): Promise<Pagina[]> {
  const clave = accountId.replace(/^act_/, "");
  const guardada = memoria.get(clave);
  if (guardada && Date.now() - guardada.ts < VIGENCIA_MS) return guardada.paginas;
  const j = await graphJson<{ data?: Array<{ id?: string; name?: string }> }>(`act_${clave}/promote_pages`, "GET", { fields: "id,name", limit: 25 });
  const paginas = (j.data ?? []).filter((p): p is { id: string; name?: string } => typeof p.id === "string").map((p) => ({ id: p.id, name: p.name ?? null }));
  memoria.set(clave, { ts: Date.now(), paginas });
  return paginas;
}

/** La página declarada (de la cuenta o del cliente) y, si no hay, la única que Meta deja promocionar a esa cuenta. */
export async function paginaDeLaCuenta(cliente: { accountPages: Record<string, string | null>; pageId: string | null }, accountId: string): Promise<string | null> {
  const declarada = cliente.accountPages[accountId] ?? cliente.pageId;
  if (declarada) return declarada;
  if (!metaNativoConfigurado()) return null;
  try {
    const paginas = await paginasQuePuedePromocionar(accountId);
    return paginas.length === 1 ? paginas[0].id : null;
  } catch {
    return null;
  }
}

/** Completa, en las cuentas de Meta sin página declarada, la única página detectada. No toca nada guardado. */
export async function completarPaginasDeMeta<T extends { provider: string; externalId: string; pageId: string | null }>(cuentas: T[]): Promise<void> {
  if (!metaNativoConfigurado()) return;
  await Promise.all(
    cuentas
      .filter((c) => c.provider === "meta" && !c.pageId)
      .map(async (c) => {
        try {
          const paginas = await paginasQuePuedePromocionar(c.externalId);
          if (paginas.length === 1) c.pageId = paginas[0].id;
        } catch {
          // Sin lectura de Meta se queda como estaba: sin página.
        }
      }),
  );
}
