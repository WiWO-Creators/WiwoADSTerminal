import { cuerpoDelPublico, problemasDelPublico, type DatosDePublico } from "@/lib/meta-publicos-pura";
import { ErrorDeMeta, graphJson } from "@/lib/meta-nativo";

/**
 * Crea públicos de interacción (retargeting) con la API directa de Meta. Un público no gasta dinero, pero Meta no ofrece validar sin
 * crear: `simular` solo comprueba los datos y devuelve la regla que se mandaría. Quien llama registra la creación en la auditoría.
 */
export async function crearPublicoDeInteraccion(accountId: string, d: DatosDePublico, o: { simular: boolean }): Promise<{ simulado: boolean; id: string | null; regla: unknown }> {
  const problemas = problemasDelPublico(d);
  if (problemas.length > 0) throw new ErrorDeMeta(problemas.join(" "), 400);
  const cuerpo = cuerpoDelPublico(d);
  if (o.simular) return { simulado: true, id: null, regla: cuerpo.rule };
  const j = await graphJson<{ id?: string }>(`act_${accountId.replace(/\D/g, "")}/customaudiences`, "POST", cuerpo as never);
  if (!j.id) throw new ErrorDeMeta("Meta no devolvió el identificador del público.");
  return { simulado: false, id: j.id, regla: cuerpo.rule };
}
