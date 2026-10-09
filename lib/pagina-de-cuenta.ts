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
    if (paginas.length === 1) return paginas[0].id;
    // Varias páginas posibles: solo se elige si casi todos los anuncios recientes de la cuenta ya usan una (y es promocionable).
    if (paginas.length > 1) {
      const dominante = await paginaEInstagramDeLaCampana("act_" + accountId.replace(/^act_/, ""));
      if (dominante?.pageId && dominante.parte >= 0.7 && paginas.some((p) => p.id === dominante.pageId)) return dominante.pageId;
    }
    return null;
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

/**
 * Cuando la cuenta puede promocionar VARIAS páginas (por ejemplo, SQM México y SQM Global en una misma cuenta) no se adivina por
 * la cuenta: se mira qué Página e Instagram usan ya los anuncios de ESA campaña y se toma el más frecuente. Solo lectura.
 * Si la campaña no tiene anuncios con esos datos, devuelve `null` y la persona la declara en la ficha del cliente.
 */
export async function paginaEInstagramDeLaCampana(campaignId: string): Promise<{ pageId: string | null; instagramId: string | null; parte: number } | null> {
  if (!metaNativoConfigurado() || !/^(act_)?\d+$/.test(campaignId)) return null;
  try {
    const j = await graphJson<{
      data?: Array<{
        creative?: {
          effective_object_story_id?: string;
          instagram_actor_id?: string;
          instagram_user_id?: string;
          object_story_spec?: { page_id?: string; instagram_user_id?: string; instagram_actor_id?: string };
        };
      }>;
    }>(`${campaignId}/ads`, "GET", {
      fields: "creative{effective_object_story_id,instagram_actor_id,instagram_user_id,object_story_spec{page_id,instagram_user_id,instagram_actor_id}}",
      limit: 50,
    });
    const paginas = new Map<string, number>();
    const instagrams = new Map<string, number>();
    const sumar = (m: Map<string, number>, v: string | undefined) => {
      if (v && /^\d+$/.test(v)) m.set(v, (m.get(v) ?? 0) + 1);
    };
    for (const a of j.data ?? []) {
      const c = a.creative;
      sumar(paginas, c?.object_story_spec?.page_id ?? c?.effective_object_story_id?.split("_")[0]);
      sumar(instagrams, c?.object_story_spec?.instagram_user_id ?? c?.object_story_spec?.instagram_actor_id ?? c?.instagram_user_id ?? c?.instagram_actor_id);
    }
    const masFrecuente = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const pageId = masFrecuente(paginas);
    const totalPaginas = [...paginas.values()].reduce((a, b) => a + b, 0);
    const parte = pageId && totalPaginas > 0 ? (paginas.get(pageId) ?? 0) / totalPaginas : 0;
    let instagramId: string | null = masFrecuente(instagrams);
    if (!instagramId && pageId) {
      const p = await graphJson<{ instagram_business_account?: { id?: string } }>(pageId, "GET", { fields: "instagram_business_account" }).catch(() => null);
      instagramId = p?.instagram_business_account?.id ?? null;
    }
    return pageId || instagramId ? { pageId, instagramId, parte } : null;
  } catch {
    return null;
  }
}
