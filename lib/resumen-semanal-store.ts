import { getRawDb } from "@/db";
import type { ResumenSemanal } from "@/lib/resumen-semanal";

/**
 * Persistencia del resumen semanal en `app_meta` — una fila, se reescribe
 * cada vez que se reconstruye el catálogo. No es un historial: es "lo último
 * que se calculó", igual que el resto de lo que vive en esta tabla.
 */
const CLAVE = "resumen_semanal_v1";

export async function guardarResumenSemanal(resumen: ResumenSemanal): Promise<void> {
  const db = getRawDb();
  await db
    .prepare(
      `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(CLAVE, JSON.stringify(resumen), Date.now())
    .run();
}

export async function leerResumenSemanal(): Promise<ResumenSemanal | null> {
  const db = getRawDb();
  const fila = await db
    .prepare("SELECT value FROM app_meta WHERE key = ? LIMIT 1")
    .bind(CLAVE)
    .first<{ value: string }>();
  if (!fila) return null;
  try {
    return JSON.parse(fila.value) as ResumenSemanal;
  } catch {
    return null;
  }
}
