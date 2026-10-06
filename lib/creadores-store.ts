/**
 * Lee la bitácora de ejecuciones y arma «quién creó qué» para un cliente.
 * Solo lectura. Ver `lib/creadores.ts` para las reglas.
 */
import { getRawDb } from "@/db";
import { mapaDeCreadores, type Creador, type PasoGuardado } from "@/lib/creadores";
import { enAlcance, type Actor } from "@/lib/permisos";

export class ErrorDeCreadores extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Sin el correo: quien ve la tabla (incluido un cliente) no necesita el de sus colegas. */
export type CreadorPublico = Pick<Creador, "nombre" | "creadoEn">;

export async function creadoresDelCliente(
  actor: Actor,
  portfolioId: string,
): Promise<Record<string, CreadorPublico>> {
  if (!enAlcance(actor, portfolioId)) throw new ErrorDeCreadores("Ese cliente no está en tu alcance", 403);
  const db = getRawDb();
  const [filas, usuarios] = await Promise.all([
    db
      .prepare(
        `SELECT actor_email, steps_json, created_at FROM ejecuciones
         WHERE portfolio_id = ? AND ok >= 0 ORDER BY created_at ASC LIMIT 2000`,
      )
      .bind(portfolioId)
      .all<{ actor_email: string; steps_json: string; created_at: number }>(),
    db.prepare("SELECT email, display_name FROM users").all<{ email: string; display_name: string }>(),
  ]);

  const nombres = new Map(usuarios.results.map((u) => [u.email.toLowerCase(), u.display_name]));
  const ejecuciones = filas.results.map((f) => {
    let pasos: PasoGuardado[] = [];
    try {
      const dato = JSON.parse(f.steps_json);
      if (Array.isArray(dato)) pasos = dato as PasoGuardado[];
    } catch {
      // Una fila ilegible simplemente no aporta creadores.
    }
    return { actorEmail: f.actor_email, creadaEn: Number(f.created_at), pasos };
  });

  const completo = mapaDeCreadores(ejecuciones, nombres);
  const publico: Record<string, CreadorPublico> = {};
  for (const [clave, c] of Object.entries(completo)) publico[clave] = { nombre: c.nombre, creadoEn: c.creadoEn };
  return publico;
}
