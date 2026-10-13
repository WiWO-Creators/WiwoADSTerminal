import { ErrorDeMeta, graphJson } from "@/lib/meta-nativo";

const VERSION = "v21.0";

/**
 * Formularios instantáneos (lead ads) de Meta por la API directa: leerlos, crearlos en la página, archivarlos y leer sus leads.
 * Necesita que el usuario del sistema administre la página y tenga el permiso de leads. Lo puro (cuerpo del formulario, regla de
 * calificado) está en `meta-formularios-pura.ts`.
 */

export type FormularioDeMeta = {
  id: string;
  nombre: string;
  estado: string;
  creado: string | null;
  /** Cuántos leads tiene en total, según Meta. */
  leads: number | null;
  preguntas: string[];
  mayorIntencion: boolean | null;
};

type Params = Record<string, string | number | boolean | object | undefined>;

/**
 * Los formularios de una página exigen el token DE LA PÁGINA (no el del usuario del sistema): se pide con `/{page}?fields=access_token`
 * y solo funciona si el usuario del sistema administra esa página. El token de página nunca se devuelve ni se registra.
 */
async function conTokenDePagina<T>(pageId: string, ruta: string, metodo: "GET" | "POST", params: Params = {}): Promise<T> {
  const t = await graphJson<{ access_token?: string }>(soloDigitos(pageId, "página"), "GET", { fields: "access_token" }).catch((e: unknown) => {
    throw new ErrorDeMeta(`El usuario del sistema no puede administrar esta página (necesita acceso de administrador a la página): ${e instanceof Error ? e.message : "error"}`, 422);
  });
  if (!t.access_token) throw new ErrorDeMeta("Meta no entregó acceso a la página: el usuario del sistema debe ser administrador de la página de Facebook.", 422);
  const cuerpo = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) cuerpo.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  cuerpo.set("access_token", t.access_token);
  const url = `https://graph.facebook.com/${VERSION}/${ruta}`;
  const r = metodo === "GET" ? await fetch(`${url}?${cuerpo}`, { cache: "no-store" }) : await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: cuerpo });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string; error_user_msg?: string } };
  if (!r.ok || j.error) throw new ErrorDeMeta(j.error?.error_user_msg ?? j.error?.message ?? `Meta respondió ${r.status}`, r.status === 400 ? 422 : 502);
  return j;
}

const soloDigitos = (id: string, que: string): string => {
  if (!/^\d+$/.test(id)) throw new ErrorDeMeta(`Identificador de ${que} no válido.`, 400);
  return id;
};

/** Los formularios de una página de Facebook (solo lectura). */
export async function listarFormulariosMeta(pageId: string): Promise<FormularioDeMeta[]> {
  const j = await conTokenDePagina<{
    data: Array<{ id: string; name: string; status?: string; created_time?: string; leads_count?: number; is_optimized_for_quality?: boolean; questions?: Array<{ key?: string; type?: string; label?: string }> }>;
  }>(pageId, `${soloDigitos(pageId, "página")}/leadgen_forms`, "GET", {
    fields: "id,name,status,created_time,leads_count,is_optimized_for_quality,questions",
    limit: 100,
  });
  return (j.data ?? []).map((f) => ({
    id: f.id,
    nombre: f.name,
    estado: f.status ?? "",
    creado: f.created_time ?? null,
    leads: f.leads_count ?? null,
    preguntas: (f.questions ?? []).map((q) => q.label ?? q.key ?? q.type ?? "").filter(Boolean),
    mayorIntencion: typeof f.is_optimized_for_quality === "boolean" ? f.is_optimized_for_quality : null,
  }));
}

/** Crea el formulario en la página. Meta no permite borrarlo después, solo archivarlo: quien llama simula primero. */
export async function crearFormularioMeta(pageId: string, cuerpo: Record<string, unknown>): Promise<string> {
  const j = await conTokenDePagina<{ id?: string }>(pageId, `${soloDigitos(pageId, "página")}/leadgen_forms`, "POST", cuerpo as Params);
  if (!j.id) throw new ErrorDeMeta("Meta no devolvió el identificador del formulario.");
  return j.id;
}

/** Archiva un formulario (la forma de «borrarlo» en Meta). */
export async function archivarFormularioMeta(pageId: string, formularioId: string): Promise<void> {
  await conTokenDePagina(pageId, soloDigitos(formularioId, "formulario"), "POST", { status: "ARCHIVED" });
}

type LeadCrudo = { id: string; created_time?: string; field_data?: Array<{ name: string; values?: string[] }> };

/** Los leads de un formulario con sus respuestas, desde un instante (unix). Pagina hasta `maximo`. */
export async function leadsDeFormularioMeta(pageId: string, formularioId: string, o: { desdeUnix?: number; maximo?: number } = {}): Promise<LeadCrudo[]> {
  const id = soloDigitos(formularioId, "formulario");
  const salida: LeadCrudo[] = [];
  let despues: string | undefined;
  const maximo = o.maximo ?? 2000;
  while (salida.length < maximo) {
    const j = await conTokenDePagina<{ data?: LeadCrudo[]; paging?: { cursors?: { after?: string }; next?: string } }>(pageId, `${id}/leads`, "GET", {
      fields: "id,created_time,field_data",
      limit: 100,
      ...(o.desdeUnix ? { filtering: [{ field: "time_created", operator: "GREATER_THAN", value: o.desdeUnix }] } : {}),
      ...(despues ? { after: despues } : {}),
    });
    salida.push(...(j.data ?? []));
    despues = j.paging?.next ? j.paging.cursors?.after : undefined;
    if (!despues || (j.data ?? []).length === 0) break;
  }
  return salida.slice(0, maximo);
}
