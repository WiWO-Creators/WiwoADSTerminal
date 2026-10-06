/**
 * Sugerencias por cliente: evaluarlas (lectura + guardado en `decisions`),
 * listarlas y resolverlas. Nada de esto escribe en Google ni en Meta: aprobar
 * una sugerencia deja constancia de la firma; el cambio real se aplica después
 * desde el editor, con sus propios guardarraíles.
 */
import { getRawDb } from "@/db";
import { resolverDecision, type DecisionAction } from "@/lib/dashboard-store";
import type { CampanaBase, Metas } from "@/lib/contexto-cliente";
import { can, enAlcance, type Actor } from "@/lib/permisos";
import { getPerformanceSnapshot } from "@/lib/performance-store";
import { isActivePlatform } from "@/lib/plataformas";
import { enlacesDeSugerencia, type Enlace } from "@/lib/enlaces";
import { listPortfolios } from "@/lib/portafolios-store";
import { rangoAnterior, resolverRango } from "@/lib/rangos";
import { medirPropiedades } from "@/lib/medicion-store";
import { calcularPresupuesto } from "@/lib/presupuesto";
import {
  generarSugerencias,
  sugerenciasDeMedicion,
  sugerenciasDePresupuesto,
  type EntradaDeMedicion,
  type EntradaDePresupuesto,
  type AccionSugerida,
  type ClienteParaSugerir,
  type Sugerencia,
} from "@/lib/sugerencias";

export class ErrorDeSugerencias extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Cada cuánto se reevalúa un cliente cuando alguien abre su pantalla. */
const REEVALUAR_CADA_MS = 6 * 60 * 60 * 1000;
const RANGO_EVALUACION = "ultimos_14" as const;
/** Una campaña no recibe dos ajustes de presupuesto aprobados en menos de esto. */
const ENFRIAMIENTO_PRESUPUESTO_MS = 48 * 60 * 60 * 1000;

export type SugerenciaVista = {
  id: string;
  /** Cliente al que pertenece (las filas viejas, anteriores a la migración 0020, no lo traen). */
  clienteId: string | null;
  clienteNombre: string;
  version: number;
  estado: "pendiente" | "aprobada" | "descartada";
  severity: "critical" | "high" | "medium" | "info";
  rule: string;
  platform: string;
  provider: string | null;
  accountId: string | null;
  entityLevel: string | null;
  entityId: string | null;
  entityName: string | null;
  title: string;
  diagnosis: string;
  proposedAction: string;
  impact: string;
  confidence: string;
  before: string;
  after: string;
  guardrail: string;
  metric: string;
  delta: string;
  primaryLabel: string;
  /** Enlaces directos para revisarlo fuera de la app (Analytics, Tag Manager, la campaña). */
  enlaces: Enlace[];
  accion: AccionSugerida | null;
  generadaEn: number;
  venceEn: number;
  resueltaEn: number | null;
  motivo: string | null;
};

type Fila = {
  id: string;
  portfolio_id: string | null;
  client: string;
  version: number;
  status: string;
  severity: SugerenciaVista["severity"];
  rule: string;
  platform: string;
  provider: string | null;
  account_id: string | null;
  entity_level: string | null;
  entity_id: string | null;
  entity_name: string | null;
  title: string;
  diagnosis: string;
  proposed_action: string;
  impact: string;
  confidence: string;
  before_value: string;
  after_value: string;
  guardrail: string;
  metric: string;
  delta: string;
  primary_label: string;
  action_json: string | null;
  generated_at: number;
  expires_at: number;
  resolved_at: number | null;
  discard_reason: string | null;
};

function accionDe(json: string | null): AccionSugerida | null {
  if (!json) return null;
  try {
    const dato = JSON.parse(json) as AccionSugerida;
    if (dato.tipo === "pausar" || dato.tipo === "revisar") return dato;
    if (dato.tipo === "presupuesto" && Number.isFinite(dato.monto)) return dato;
  } catch {
    // Una acción ilegible se trata como "sin acción": se muestra, no se ejecuta.
  }
  return null;
}

type DatosDeClientes = Map<string, { ga4PropertyId: string | null; gtmContainerId: string | null }>;

async function datosDeClientes(): Promise<DatosDeClientes> {
  try {
    return new Map((await listPortfolios()).map((p) => [p.id, p]));
  } catch {
    // Sin la lista de clientes los enlaces de medición salen sin contenedor: nada más se pierde.
    return new Map();
  }
}

function aVista(f: Fila, clientes: DatosDeClientes): SugerenciaVista {
  return {
    id: f.id,
    clienteId: f.portfolio_id,
    clienteNombre: f.client,
    version: Number(f.version),
    estado: f.status === "approved" ? "aprobada" : f.status === "discarded" ? "descartada" : "pendiente",
    severity: f.severity,
    rule: f.rule,
    platform: f.platform,
    provider: f.provider,
    accountId: f.account_id,
    entityLevel: f.entity_level,
    entityId: f.entity_id,
    entityName: f.entity_name,
    title: f.title,
    diagnosis: f.diagnosis,
    proposedAction: f.proposed_action,
    impact: f.impact,
    confidence: f.confidence,
    before: f.before_value,
    after: f.after_value,
    guardrail: f.guardrail,
    metric: f.metric,
    delta: f.delta,
    primaryLabel: f.primary_label,
    enlaces: enlacesDeSugerencia(f.rule, f.portfolio_id ? clientes.get(f.portfolio_id) : undefined, {
      provider: f.provider,
      accountId: f.account_id,
      entityId: f.entity_id,
    }),
    accion: accionDe(f.action_json),
    generadaEn: Number(f.generated_at),
    venceEn: Number(f.expires_at),
    resueltaEn: f.resolved_at === null ? null : Number(f.resolved_at),
    motivo: f.discard_reason,
  };
}

const COLUMNAS = `id, portfolio_id, client, version, status, severity, rule, platform, provider, account_id,
  entity_level, entity_id, entity_name, title, diagnosis, proposed_action, impact,
  confidence, before_value, after_value, guardrail, metric, delta, primary_label,
  action_json, generated_at, expires_at, resolved_at, discard_reason`;

/* -------------------------------------------------------------------------- */

function claveDeEvaluacion(portfolioId: string): string {
  return `sugerencias_evaluadas:${portfolioId}`;
}

async function ultimaEvaluacion(portfolioId: string): Promise<number | null> {
  const fila = await getRawDb()
    .prepare("SELECT value FROM app_meta WHERE key = ? LIMIT 1")
    .bind(claveDeEvaluacion(portfolioId))
    .first<{ value: string }>();
  return fila ? Number(fila.value) : null;
}

async function marcarEvaluado(portfolioIds: string[], ahora: number): Promise<void> {
  const db = getRawDb();
  await db.batch(
    portfolioIds.map((id) =>
      db
        .prepare(
          `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
        .bind(claveDeEvaluacion(id), String(ahora), ahora),
    ),
  );
}

/**
 * Lee el rendimiento reciente y guarda las sugerencias nuevas. Sin `portfolioId`
 * evalúa todos los clientes a los que la persona tiene acceso.
 *
 * Con `soloSiVencio`, un cliente evaluado hace poco se salta: abrir su pantalla
 * no debería pagar una lectura completa cada vez.
 */
export async function evaluarSugerencias(
  actor: Actor,
  opciones: { portfolioId?: string; soloSiVencio?: boolean } = {},
): Promise<{ generadas: number; evaluados: number }> {
  const ahora = new Date();
  exigirVerOperacion(actor);
  if (opciones.portfolioId && !enAlcance(actor, opciones.portfolioId)) {
    throw new ErrorDeSugerencias("Ese cliente no está en tu alcance", 403);
  }

  if (opciones.portfolioId && opciones.soloSiVencio) {
    const ultima = await ultimaEvaluacion(opciones.portfolioId);
    if (ultima !== null && ahora.getTime() - ultima < REEVALUAR_CADA_MS) {
      return { generadas: 0, evaluados: 0 };
    }
  }

  const rango = resolverRango(RANGO_EVALUACION, ahora);
  const previo = rangoAnterior(rango, ahora);
  const [actual, anterior, portafolios, mesActual] = await Promise.all([
    getPerformanceSnapshot(actor, ahora, { incluirCampanas: true, incluirAnuncios: false, rango: rango.id }),
    getPerformanceSnapshot(actor, ahora, { incluirCampanas: true, incluirAnuncios: false, rango: previo.id }).catch(
      () => null,
    ),
    listPortfolios(),
    // El presupuesto es del MES en curso, no del rango de la evaluación.
    getPerformanceSnapshot(actor, ahora, { incluirCampanas: false, incluirAnuncios: false, rango: "mes_actual" }).catch(
      () => null,
    ),
  ]);

  const metasPorId = new Map(portafolios.map((p) => [p.id, p]));
  const clientes: ClienteParaSugerir[] = [];
  for (const resumen of actual.portfolios) {
    if (!resumen.declared || resumen.archivado) continue;
    if (opciones.portfolioId && resumen.id !== opciones.portfolioId) continue;
    if (!enAlcance(actor, resumen.id)) continue;
    const p = metasPorId.get(resumen.id);
    const metas: Metas = {
      cpaMicros: p?.targetCpaMicros ?? null,
      roas: p?.targetRoas ?? null,
      cpmMicros: p?.metas.cpmMicros ?? null,
      ctrMinimo: p?.metas.ctrMinimo ?? null,
      frecuenciaMaxima: p?.metas.frecuenciaMaxima ?? null,
    };
    clientes.push({ id: resumen.id, nombre: resumen.name, metas, cuentas: new Set(resumen.accounts.map((a) => a.id)) });
  }

  const entradasDePresupuesto: EntradaDePresupuesto[] = [];
  for (const c of clientes) {
    const p = metasPorId.get(c.id);
    if (!p?.monthlyBudgetMicros || !p.monthlyBudgetCurrency || !mesActual) continue;
    const gastado =
      mesActual.portfolios.find((x) => x.id === c.id)?.currencyTotals.find((t) => t.currency === p.monthlyBudgetCurrency)
        ?.spendMicros ?? 0;
    const resumen = calcularPresupuesto(p.monthlyBudgetMicros, gastado, ahora);
    if (resumen) entradasDePresupuesto.push({ cliente: { id: c.id, nombre: c.nombre }, resumen, moneda: p.monthlyBudgetCurrency });
  }

  // Medición: solo clientes con propiedad de GA4; una falla de lectura no tumba la evaluación.
  const entradasDeMedicion: EntradaDeMedicion[] = [];
  for (const c of clientes) {
    const propiedad = metasPorId.get(c.id)?.ga4PropertyId;
    if (!propiedad) continue;
    const medido = await medirPropiedades(propiedad);
    if (medido.estado === "ok" && medido.resultado.hallazgos.length > 0) {
      entradasDeMedicion.push({ cliente: { id: c.id, nombre: c.nombre }, hallazgos: medido.resultado.hallazgos });
    }
  }

  const candidatas = [
    ...generarSugerencias(
    clientes,
    // Solo plataformas donde el cambio se puede aplicar: LinkedIn se lee, pero no se escribe.
    actual.campaigns.filter((c) => isActivePlatform(c.provider)) as unknown as CampanaBase[],
    anterior ? (anterior.campaigns.filter((c) => isActivePlatform(c.provider)) as unknown as CampanaBase[]) : null,
    ahora,
    ),
    ...sugerenciasDePresupuesto(entradasDePresupuesto, ahora),
    ...sugerenciasDeMedicion(entradasDeMedicion, ahora),
  ];

  const db = getRawDb();
  const aInsertar: Sugerencia[] = [];
  for (const s of candidatas) {
    if (
      s.accion.tipo === "presupuesto" &&
      s.provider &&
      s.accountId &&
      s.entityId &&
      (await ajusteReciente(s.provider, s.accountId, s.entityId, ahora.getTime()))
    ) {
      continue;
    }
    aInsertar.push(s);
  }

  let generadas = 0;
  if (aInsertar.length > 0) {
    const resultados = await db.batch(
      aInsertar.map((c) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO decisions
               (id, status, severity, client, platform, owner_label, autonomy,
                title, diagnosis, proposed_action, impact, confidence, agent, rule,
                age_label, expires_label, before_value, after_value, guardrail,
                metric, delta, primary_label, execution_status, generated_at,
                expires_at, version, created_at, updated_at,
                portfolio_id, provider, account_id, entity_level, entity_id, entity_name, action_json)
             VALUES (?, 'pending', ?, ?, ?, 'Sin asignar', 'N0', ?, ?, ?, ?, ?, 'Sugerencias', ?, '', '', ?, ?, ?, ?, ?, ?,
                     'not_requested', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            c.id,
            c.severity,
            c.client,
            c.platform,
            c.title,
            c.diagnosis,
            c.proposedAction,
            c.impact,
            c.confidence,
            c.rule,
            c.before,
            c.after,
            c.guardrail,
            c.metric,
            c.delta,
            c.primaryLabel,
            c.generatedAt,
            c.expiresAt,
            c.generatedAt,
            c.generatedAt,
            c.portfolioId,
            c.provider,
            c.accountId,
            c.entityLevel,
            c.entityId,
            c.entityName,
            JSON.stringify(c.accion),
          ),
      ),
    );
    generadas = resultados.filter((r) => (r.meta?.changes ?? 0) > 0).length;
  }

  await marcarEvaluado(
    clientes.map((c) => c.id),
    ahora.getTime(),
  );
  return { generadas, evaluados: clientes.length };
}

/** ¿Ya se aprobó un ajuste de presupuesto de esta campaña hace menos de 48 horas? */
async function ajusteReciente(provider: string, accountId: string, entityId: string, ahora: number): Promise<boolean> {
  const fila = await getRawDb()
    .prepare(
      `SELECT id FROM decisions
       WHERE provider = ? AND account_id = ? AND entity_id = ? AND status = 'approved'
         AND action_json LIKE '%"presupuesto"%' AND resolved_at >= ? LIMIT 1`,
    )
    .bind(provider, accountId, entityId, ahora - ENFRIAMIENTO_PRESUPUESTO_MS)
    .first<{ id: string }>();
  return fila !== null;
}

/* -------------------------------------------------------------------------- */

/** Ver sugerencias es de todo el equipo menos el cliente (la misma capacidad que la bitácora interna). */
function exigirVerOperacion(actor: Actor): void {
  if (!can(actor, "ver_operacion")) throw new ErrorDeSugerencias("Tu rol no ve las sugerencias", 403);
}

/**
 * Las sugerencias pendientes de todos los clientes que la persona puede ver,
 * para el flujo de revisión del Dashboard C-Level.
 */
export async function listarPendientesDeAlcance(
  actor: Actor,
): Promise<{ pendientes: SugerenciaVista[]; puedeResolver: boolean }> {
  exigirVerOperacion(actor);
  const ahora = Date.now();
  const todos = can(actor, "ver_todos_los_clientes");
  const propios = actor.portfolioIds;
  if (!todos && propios.length === 0) return { pendientes: [], puedeResolver: can(actor, "aprobar_cambios") };
  const filtroAlcance = todos ? "" : `AND portfolio_id IN (${propios.map(() => "?").join(",")})`;
  const filas = await getRawDb()
    .prepare(
      `SELECT ${COLUMNAS} FROM decisions
       WHERE status = 'pending' AND expires_at > ?
         AND (snoozed_until IS NULL OR snoozed_until <= ?)
         ${filtroAlcance}
       ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         generated_at DESC`,
    )
    .bind(ahora, ahora, ...(todos ? [] : propios))
    .all<Fila>();
  const clientes = await datosDeClientes();
  return { pendientes: filas.results.map((f) => aVista(f, clientes)), puedeResolver: can(actor, "aprobar_cambios") };
}

export async function listarSugerencias(
  actor: Actor,
  portfolioId: string,
  clienteNombre: string,
): Promise<{ pendientes: SugerenciaVista[]; resueltas: SugerenciaVista[]; puedeResolver: boolean }> {
  exigirVerOperacion(actor);
  if (!enAlcance(actor, portfolioId)) throw new ErrorDeSugerencias("Ese cliente no está en tu alcance", 403);
  const db = getRawDb();
  const ahora = Date.now();
  // Las filas anteriores a la migración no tienen `portfolio_id`: se reconocen por el nombre.
  const dueno = "(portfolio_id = ? OR (portfolio_id IS NULL AND client = ?))";

  const [pendientes, resueltas] = await Promise.all([
    db
      .prepare(
        `SELECT ${COLUMNAS} FROM decisions
         WHERE ${dueno} AND status = 'pending' AND expires_at > ?
           AND (snoozed_until IS NULL OR snoozed_until <= ?)
         ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
           generated_at DESC`,
      )
      .bind(portfolioId, clienteNombre, ahora, ahora)
      .all<Fila>(),
    db
      .prepare(
        `SELECT ${COLUMNAS} FROM decisions
         WHERE ${dueno} AND status IN ('approved', 'discarded')
         ORDER BY resolved_at DESC LIMIT 8`,
      )
      .bind(portfolioId, clienteNombre)
      .all<Fila>(),
  ]);

  const clientes = await datosDeClientes();
  return {
    pendientes: pendientes.results.map((f) => aVista(f, clientes)),
    resueltas: resueltas.results.map((f) => aVista(f, clientes)),
    puedeResolver: can(actor, "aprobar_cambios"),
  };
}

export async function resolverSugerencia(
  actor: Actor,
  accion: Pick<DecisionAction, "type" | "id" | "expectedVersion" | "idempotencyKey" | "reason">,
): Promise<void> {
  if (!can(actor, "aprobar_cambios")) {
    throw new ErrorDeSugerencias("Solo un administrador o supervisor puede resolver sugerencias.", 403);
  }
  if (accion.type !== "approve" && accion.type !== "discard" && accion.type !== "postpone") {
    throw new ErrorDeSugerencias("Acción no reconocida", 400);
  }
  const fila = await getRawDb()
    .prepare("SELECT portfolio_id, client FROM decisions WHERE id = ? LIMIT 1")
    .bind(accion.id)
    .first<{ portfolio_id: string | null; client: string }>();
  if (!fila) throw new ErrorDeSugerencias("Sugerencia no encontrada", 404);
  if (fila.portfolio_id) {
    if (!enAlcance(actor, fila.portfolio_id)) throw new ErrorDeSugerencias("Ese cliente no está en tu alcance", 403);
  } else if (!can(actor, "ver_todos_los_clientes")) {
    // Sin dueño registrado no hay forma de comprobar el alcance: solo quien ve todo.
    throw new ErrorDeSugerencias("Ese cliente no está en tu alcance", 403);
  }
  await resolverDecision(actor, accion);
}
