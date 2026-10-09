import { getRawDb } from "@/db";

/**
 * Cuando alguien sube o cambia el contenido de una campaña desde WiWO.ADS, se recuerda en el momento: así la decisión
 * «no has actualizado el contenido de…» desaparece enseguida y la evaluación posterior no depende de que la plataforma ya
 * haya publicado el cambio en su historial (Google tarda; en Meta editar un anuncio no cambia su fecha de creación).
 */
const clave = (provider: string, campaignId: string) => `contenido_renovado:${provider}:${campaignId}`;

/** Campos de una edición que cuentan como contenido nuevo (texto, título, imagen, URL, botón, titulares, extensiones…). */
export const CAMPOS_DE_CONTENIDO = new Set<string>([
  "textoPrincipal", "titulo", "descripcion", "urlDestino", "imagenUrl", "cta", "urlTags",
  "titulares", "descripciones", "urlsFinales", "path1", "path2", "grupoDeRecursos", "extensiones",
]);

/** Marca la campaña como renovada ahora y quita sus decisiones de contenido pendientes. Nunca tumba lo que está haciendo. */
export async function marcarContenidoRenovado(provider: string, campaignId: string | null | undefined): Promise<void> {
  if (!campaignId) return;
  try {
    const db = getRawDb();
    const ahora = Date.now();
    await db
      .prepare(
        `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(clave(provider, campaignId), String(ahora), ahora)
      .run();
    await db
      .prepare("DELETE FROM decisions WHERE status = 'pending' AND rule = 'contenido_desactualizado' AND entity_id = ? AND provider = ?")
      .bind(campaignId, provider)
      .run();
  } catch (error) {
    console.error("WiWO.ADS contenido renovado: no se pudo registrar", error instanceof Error ? error.message : "error");
  }
}

/** Cuándo se renovó el contenido de la campaña desde WiWO.ADS (ms), o `null`. */
export async function contenidoRenovadoEn(provider: string, campaignId: string): Promise<number | null> {
  try {
    const fila = await getRawDb().prepare("SELECT value FROM app_meta WHERE key = ? LIMIT 1").bind(clave(provider, campaignId)).first<{ value: string }>();
    const t = Number(fila?.value);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}
