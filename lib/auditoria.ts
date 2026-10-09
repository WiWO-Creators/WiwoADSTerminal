/**
 * Auditoría unificada: registrar y leer. `registrarAuditoria` nunca tumba lo que audita: si no se puede escribir, se
 * deja constancia en el log del servidor y la operación sigue. La lectura respeta el alcance de cada persona.
 */
import { getRawDb } from "@/db";
import {
  importanciaDe,
  recortar,
  type CategoriaDeAuditoria,
  type EventoDeAuditoria,
  type ImportanciaDeAuditoria,
  type ResultadoDeAuditoria,
} from "@/lib/auditoria-pura";
import { can, enAlcance, type Actor } from "@/lib/permisos";

export async function registrarAuditoria(e: EventoDeAuditoria): Promise<void> {
  try {
    const etiquetas = e.etiquetas ?? [];
    const resultado: ResultadoDeAuditoria = e.resultado ?? "ok";
    const importancia = importanciaDe({ categoria: e.categoria, accion: e.accion, resultado, etiquetas });
    await getRawDb()
      .prepare(
        `INSERT INTO auditoria (id, created_at, categoria, accion, actor_email, actor_nombre, portfolio_id, portfolio_nombre, plataforma,
           entidad_tipo, entidad_id, entidad_nombre, titulo, resultado, importancia, etiquetas, detalle_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        Date.now(),
        e.categoria,
        e.accion,
        e.actorEmail,
        e.actorNombre ?? null,
        e.portfolioId ?? null,
        e.portfolioNombre ?? null,
        e.plataforma ?? null,
        e.entidadTipo ?? null,
        e.entidadId ?? null,
        e.entidadNombre ?? null,
        recortar(e.titulo, 300),
        resultado,
        importancia,
        etiquetas.join(","),
        e.detalle === undefined ? null : JSON.stringify(e.detalle).slice(0, 20_000),
      )
      .run();
  } catch (error) {
    console.error("WiWO.ADS auditoría: no se pudo registrar", e.categoria, e.accion, error instanceof Error ? error.message : "error");
  }
}

type Fila = {
  id: string; created_at: number; categoria: string; accion: string; actor_email: string; actor_nombre: string | null;
  portfolio_id: string | null; portfolio_nombre: string | null; plataforma: string | null; entidad_tipo: string | null;
  entidad_id: string | null; entidad_nombre: string | null; titulo: string; resultado: string; importancia: string;
  etiquetas: string; detalle_json: string | null;
};

export type EventoLeido = {
  id: string;
  cuando: number;
  categoria: CategoriaDeAuditoria;
  accion: string;
  actor: { email: string; nombre: string | null };
  cliente: { id: string; nombre: string | null } | null;
  plataforma: string | null;
  entidad: { tipo: string | null; id: string | null; nombre: string | null } | null;
  titulo: string;
  resultado: ResultadoDeAuditoria;
  importancia: ImportanciaDeAuditoria;
  etiquetas: string[];
  detalle: unknown;
};

export type FiltrosDeAuditoria = {
  categoria?: string;
  clienteId?: string;
  actor?: string;
  etiqueta?: string;
  texto?: string;
  desde?: number;
  soloImportantes?: boolean;
  /** Id de una conversación con el bot: devuelve todo lo de ese chat. */
  conversacion?: string;
  limite?: number;
};

/** Categorías que solo ven supervisores y administradores (lo que se le pide al bot y los cambios del equipo). */
const CATEGORIAS_RESERVADAS = new Set(["asistente", "equipo"]);

function aEvento(f: Fila): EventoLeido {
  let detalle: unknown = null;
  try {
    detalle = f.detalle_json ? JSON.parse(f.detalle_json) : null;
  } catch {
    detalle = null;
  }
  return {
    id: f.id,
    cuando: Number(f.created_at),
    categoria: f.categoria as CategoriaDeAuditoria,
    accion: f.accion,
    actor: { email: f.actor_email, nombre: f.actor_nombre },
    cliente: f.portfolio_id ? { id: f.portfolio_id, nombre: f.portfolio_nombre } : null,
    plataforma: f.plataforma,
    entidad: f.entidad_id || f.entidad_nombre ? { tipo: f.entidad_tipo, id: f.entidad_id, nombre: f.entidad_nombre } : null,
    titulo: f.titulo,
    resultado: (["ok", "error", "pendiente", "rechazado"].includes(f.resultado) ? f.resultado : "ok") as ResultadoDeAuditoria,
    importancia: f.importancia === "alta" ? "alta" : "normal",
    etiquetas: f.etiquetas.split(",").filter(Boolean),
    detalle,
  };
}

/** ¿Esta persona puede ver este evento? Alcance por cliente y categorías reservadas; lo propio siempre se ve. */
export function puedeVerEvento(actor: Actor, e: Pick<EventoLeido, "categoria" | "cliente" | "actor">): boolean {
  if (!actor.isActive || !can(actor, "ver_operacion")) return false;
  if (e.actor.email === actor.email) return true;
  if (CATEGORIAS_RESERVADAS.has(e.categoria) && !can(actor, "aprobar_cambios")) return false;
  if (e.cliente && !enAlcance(actor, e.cliente.id)) return false;
  return true;
}

export async function listarAuditoria(actor: Actor, filtros: FiltrosDeAuditoria = {}): Promise<{ eventos: EventoLeido[]; resumen: ResumenDeAuditoria }> {
  if (!actor.isActive || !can(actor, "ver_operacion")) return { eventos: [], resumen: resumenVacio() };
  const condiciones: string[] = [];
  const valores: unknown[] = [];
  if (filtros.categoria) { condiciones.push("categoria = ?"); valores.push(filtros.categoria); }
  if (filtros.clienteId) { condiciones.push("portfolio_id = ?"); valores.push(filtros.clienteId); }
  if (filtros.actor) { condiciones.push("actor_email = ?"); valores.push(filtros.actor); }
  if (filtros.etiqueta) { condiciones.push("(',' || etiquetas || ',') LIKE ?"); valores.push(`%,${filtros.etiqueta},%`); }
  if (filtros.desde) { condiciones.push("created_at >= ?"); valores.push(filtros.desde); }
  if (filtros.soloImportantes) condiciones.push("importancia = 'alta'");
  if (filtros.conversacion && /^[A-Za-z0-9-]{8,64}$/.test(filtros.conversacion)) {
    condiciones.push("instr(detalle_json, ?) > 0");
    valores.push(`"conversacion":"${filtros.conversacion}"`);
  }
  if (filtros.texto?.trim()) {
    condiciones.push("(titulo LIKE ? OR entidad_nombre LIKE ? OR actor_email LIKE ? OR portfolio_nombre LIKE ?)");
    const q = `%${filtros.texto.trim()}%`;
    valores.push(q, q, q, q);
  }
  const donde = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";
  const limite = Math.min(Math.max(filtros.limite ?? 200, 1), 500);
  const { results } = await getRawDb()
    .prepare(`SELECT * FROM auditoria ${donde} ORDER BY created_at DESC LIMIT ?`)
    .bind(...valores, limite * 3)
    .all<Fila>();
  const eventos = (results ?? []).map(aEvento).filter((e) => puedeVerEvento(actor, e)).slice(0, limite);
  return { eventos, resumen: await resumir(actor) };
}

export type ResumenDeAuditoria = {
  hoy: number;
  importantesEstaSemana: number;
  rechazosEstaSemana: number;
  fallosEstaSemana: number;
  cambiosDePresupuesto30d: number;
  porCategoria: Record<string, number>;
};

const resumenVacio = (): ResumenDeAuditoria => ({ hoy: 0, importantesEstaSemana: 0, rechazosEstaSemana: 0, fallosEstaSemana: 0, cambiosDePresupuesto30d: 0, porCategoria: {} });

/** Los números de arriba de la pantalla, sobre lo que esta persona puede ver. */
async function resumir(actor: Actor): Promise<ResumenDeAuditoria> {
  const ahora = Date.now();
  const { results } = await getRawDb()
    .prepare("SELECT * FROM auditoria WHERE created_at >= ? ORDER BY created_at DESC LIMIT 3000")
    .bind(ahora - 30 * 86_400_000)
    .all<Fila>();
  const resumen = resumenVacio();
  const inicioDeHoy = new Date(); inicioDeHoy.setHours(0, 0, 0, 0);
  for (const f of results ?? []) {
    const e = aEvento(f);
    if (!puedeVerEvento(actor, e)) continue;
    resumen.porCategoria[e.categoria] = (resumen.porCategoria[e.categoria] ?? 0) + 1;
    if (e.cuando >= inicioDeHoy.getTime()) resumen.hoy += 1;
    if (e.etiquetas.includes("presupuesto") && e.categoria === "cambio") resumen.cambiosDePresupuesto30d += 1;
    if (e.cuando >= ahora - 7 * 86_400_000) {
      if (e.importancia === "alta") resumen.importantesEstaSemana += 1;
      if (e.resultado === "rechazado") resumen.rechazosEstaSemana += 1;
      if (e.resultado === "error") resumen.fallosEstaSemana += 1;
    }
  }
  return resumen;
}
