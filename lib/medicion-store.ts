/**
 * Lee los eventos de GA4 de un cliente (vía Windsor) y los evalúa con las
 * reglas de `lib/medicion.ts`. Solo lectura, acotada al alcance de quien pregunta.
 */
import { getRawDb } from "@/db";
import { evaluarMedicion, type EventoGa4, type ResultadoMedicion } from "@/lib/medicion";
import type { GtmEstado } from "@/lib/gtm";
import { can, enAlcance, type Actor } from "@/lib/permisos";
import { propiedadesDeGa4 } from "@/lib/ga4";
import { listPortfolios } from "@/lib/portafolios-store";
import { resolverRango } from "@/lib/rangos";
import { requestWindsorConnector, windsorConfigured } from "@/lib/windsor";

export class ErrorDeMedicion extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type EstadoDeMedicion =
  | { estado: "sin_propiedad" }
  | { estado: "error"; mensaje: string }
  | { estado: "ok"; propiedad: string; resultado: ResultadoMedicion; desde: string; hasta: string };

/** Lo que ve el panel: la lectura de GA4 y si el cliente tiene Tag Manager. */
export type MedicionDelCliente = EstadoDeMedicion & { gtm: GtmEstado | null };

const CAMPOS = ["account_id", "event_name", "event_count", "conversions"];

function aEventos(filas: Array<Record<string, unknown>>): EventoGa4[] {
  const porNombre = new Map<string, EventoGa4>();
  for (const f of filas) {
    const nombre = typeof f.event_name === "string" ? f.event_name : "";
    if (!nombre) continue;
    const actual = porNombre.get(nombre) ?? { nombre, eventos: 0, clave: 0 };
    actual.eventos += Number(f.event_count) || 0;
    actual.clave += Number(f.conversions) || 0;
    porNombre.set(nombre, actual);
  }
  return [...porNombre.values()];
}

/** Cuánto vale una lectura de GA4 antes de volver a pedirla: los eventos no cambian minuto a minuto. */
const VIGENCIA_MS = 15 * 60 * 1000;

async function leerCache(propiedad: string): Promise<EstadoDeMedicion | null> {
  try {
    const fila = await getRawDb()
      .prepare("SELECT value, updated_at FROM app_meta WHERE key = ? LIMIT 1")
      .bind(`medicion_ga4:${propiedad}`)
      .first<{ value: string; updated_at: number }>();
    if (fila && Date.now() - Number(fila.updated_at) < VIGENCIA_MS) return JSON.parse(fila.value) as EstadoDeMedicion;
  } catch {
    // Sin caché se lee de Windsor: es más lento, no un error.
  }
  return null;
}

async function guardarCache(propiedad: string, estado: EstadoDeMedicion): Promise<void> {
  try {
    const ahora = Date.now();
    await getRawDb()
      .prepare(
        `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(`medicion_ga4:${propiedad}`, JSON.stringify(estado), ahora)
      .run();
  } catch {
    // No poder guardar el caché no debe tumbar la lectura.
  }
}

/** Evalúa una propiedad de GA4 (últimos 30 días, y los últimos 7 para detectar caídas). */
export async function medirPropiedad(propiedad: string): Promise<EstadoDeMedicion> {
  if (!windsorConfigured()) return { estado: "error", mensaje: "Falta configurar WINDSOR_API_KEY" };
  const guardado = await leerCache(propiedad);
  if (guardado) return guardado;
  const ahora = new Date();
  const r30 = resolverRango("ultimos_30", ahora);
  const r7 = resolverRango("ultimos_7", ahora);
  try {
    const [f30, f7] = await Promise.all([
      requestWindsorConnector("googleanalytics4", CAMPOS, r30.desde, r30.hasta, { selectAccounts: propiedad }),
      requestWindsorConnector("googleanalytics4", CAMPOS, r7.desde, r7.hasta, { selectAccounts: propiedad }).catch(() => null),
    ]);
    const medido: EstadoDeMedicion = {
      estado: "ok",
      propiedad,
      resultado: evaluarMedicion(aEventos(f30), f7 ? aEventos(f7) : null),
      desde: r30.desde,
      hasta: r30.hasta,
    };
    await guardarCache(propiedad, medido);
    return medido;
  } catch (error) {
    console.error("WiWO.ADS medición GA4", error);
    return { estado: "error", mensaje: "No se pudo leer GA4 por Windsor en este momento." };
  }
}

/**
 * Mide todas las propiedades de un cliente y las junta en una sola lectura: los hallazgos se suman (con la propiedad
 * a la vista cuando hay varias), «sano» solo si todas lo están, y si ninguna se pudo leer es un error. Con una sola
 * propiedad devuelve exactamente lo de siempre.
 */
export async function medirPropiedades(lista: string | null | undefined): Promise<EstadoDeMedicion> {
  const ids = propiedadesDeGa4(lista);
  if (ids.length === 0) return { estado: "sin_propiedad" };
  if (ids.length === 1) return medirPropiedad(ids[0]);
  const medidas = await Promise.all(ids.map((id) => medirPropiedad(id)));
  const buenas = medidas.flatMap((m, i) => (m.estado === "ok" ? [{ id: ids[i], m }] : []));
  if (buenas.length === 0) {
    const error = medidas.find((m) => m.estado === "error");
    return error ?? { estado: "error", mensaje: "No se pudo leer ninguna propiedad de GA4." };
  }
  const resultado: ResultadoMedicion = {
    hallazgos: buenas.flatMap(({ id, m }) =>
      m.resultado.hallazgos.map((h) => ({ ...h, id: `${h.id}:${id}`, titulo: `${h.titulo} (propiedad ${id})` })),
    ),
    resumen: {
      eventosClave: buenas.reduce((s, { m }) => s + m.resultado.resumen.eventosClave, 0),
      eventosDeLead: buenas.reduce((s, { m }) => s + m.resultado.resumen.eventosDeLead, 0),
      leadsMarcadosComoClave: buenas.reduce((s, { m }) => s + m.resultado.resumen.leadsMarcadosComoClave, 0),
    },
    sano: buenas.every(({ m }) => m.resultado.sano),
  };
  return { estado: "ok", propiedad: ids.join(", "), resultado, desde: buenas[0].m.desde, hasta: buenas[0].m.hasta };
}

export async function medicionDelCliente(actor: Actor, portfolioId: string): Promise<MedicionDelCliente> {
  if (!can(actor, "aprobar_cambios")) throw new ErrorDeMedicion("La medición la ven administradores y supervisores", 403);
  if (!enAlcance(actor, portfolioId)) throw new ErrorDeMedicion("Ese cliente no está en tu alcance", 403);
  const portafolio = (await listPortfolios()).find((p) => p.id === portfolioId);
  if (!portafolio) throw new ErrorDeMedicion("Ese cliente no existe", 404);
  const gtm = portafolio.gtmEstado;
  if (!portafolio.ga4PropertyId) return { estado: "sin_propiedad", gtm };
  return { ...(await medirPropiedades(portafolio.ga4PropertyId)), gtm };
}
