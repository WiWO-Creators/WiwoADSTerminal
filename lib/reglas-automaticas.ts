/**
 * Reglas automáticas: guardado y evaluación. Las reglas puras (métricas, cumplimiento, periodos) viven en
 * `reglas-automaticas-pura.ts`.
 *
 * Quién puede qué: crear, borrar y evaluar exige `aprobar_cambios` (administrador y supervisor) y el cliente a su alcance.
 * Una regla con acción «pausar» solo PAUSA (nunca activa, borra ni cambia presupuesto) y deja la ejecución en la
 * bitácora igual que una pausa manual. Una regla disparada no vuelve a dispararse en el mismo periodo.
 *
 * Ojo: no hay un proceso en segundo plano. Se evalúa cuando alguien con permiso tiene WiWO.ADS abierto (cada pocos
 * minutos) o al pulsar «Evaluar ahora»; y la lectura de gasto viene de Windsor, que puede ir minutos atrasada.
 */
import { getRawDb } from "@/db";
import { registrarEjecucion } from "@/lib/constructor-ejecutar";
import { ACCION, valoresDeParametros } from "@/lib/acciones-estado";
import { nombreDeEdicion, pasoDeEdicion } from "@/lib/edicion-registro";
import { activa } from "@/lib/estado-campana";
import { can, enAlcance, type Actor } from "@/lib/permisos";
import { fetchDetalleDeCuenta } from "@/lib/detalle-entidad-store";
import { planEdicion, type AntesDeEdicion } from "@/lib/edicion-plan";
import { accesoNativoGoogle } from "@/lib/integration-store";
import { getPerformanceSnapshot, type AdSummary } from "@/lib/performance-store";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";
import {
  ACCIONES_DE_REGLA,
  claveDePeriodo,
  rangoDeRegla,
  cumpleRegla,
  presupuestoReducido,
  problemaDeAccion,
  METRICAS_DE_REGLA,
  NIVELES_DE_REGLA,
  OPERADORES_DE_REGLA,
  PERIODOS_DE_REGLA,
  sumar,
  textoDeRegla,
  type AccionDeRegla,
  type MetricaDeRegla,
  type NivelDeRegla,
  type OperadorDeRegla,
  type PeriodoDeRegla,
} from "@/lib/reglas-automaticas-pura";
import { executeWindsorAction } from "@/lib/windsor";

export class ErrorDeRegla extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type Fila = {
  id: string; portfolio_id: string; provider: string; account_id: string; nivel: string; entity_id: string; entity_name: string;
  campaign_id: string | null; adset_id: string | null; metrica: string; operador: string; umbral: number; periodo: string;
  accion: string; moneda: string | null; accion_valor: number | null; activa: number; creada_por: string; created_at: number; disparada_clave: string | null;
  disparada_at: number | null; ultimo_valor: number | null; ultimo_resultado: string | null;
};

export type ReglaAutomatica = {
  id: string; clienteId: string; plataforma: string; cuenta: string; nivel: NivelDeRegla; entidadId: string; entidad: string;
  metrica: MetricaDeRegla; operador: OperadorDeRegla; umbral: number; periodo: PeriodoDeRegla; accion: AccionDeRegla;
  moneda: string | null; accionValor: number | null; activa: boolean; creadaPor: string; texto: string; disparadaAt: number | null; ultimoValor: number | null; ultimoResultado: string | null;
};

const aRegla = (f: Fila): ReglaAutomatica => ({
  id: f.id,
  clienteId: f.portfolio_id,
  plataforma: f.provider,
  cuenta: f.account_id,
  nivel: f.nivel as NivelDeRegla,
  entidadId: f.entity_id,
  entidad: f.entity_name,
  metrica: f.metrica as MetricaDeRegla,
  operador: f.operador as OperadorDeRegla,
  umbral: f.umbral,
  periodo: f.periodo as PeriodoDeRegla,
  accion: f.accion as AccionDeRegla,
  moneda: f.moneda,
  accionValor: f.accion_valor,
  activa: f.activa === 1,
  creadaPor: f.creada_por,
  texto: textoDeRegla({ metrica: f.metrica as MetricaDeRegla, operador: f.operador as OperadorDeRegla, umbral: f.umbral, periodo: f.periodo as PeriodoDeRegla, accion: f.accion as AccionDeRegla, moneda: f.moneda, accionValor: f.accion_valor }),
  disparadaAt: f.disparada_at,
  ultimoValor: f.ultimo_valor,
  ultimoResultado: f.ultimo_resultado,
});

const puede = (actor: Actor) => actor.isActive && can(actor, "aprobar_cambios");
const incluye = <T extends string>(lista: readonly T[], v: unknown): v is T => typeof v === "string" && (lista as readonly string[]).includes(v);

export type EntradaDeRegla = {
  clienteId: string; plataforma: string; cuenta: string; nivel: string; entidadId: string; entidad: string;
  campaignId?: string | null; adsetId?: string | null; metrica: string; operador: string; umbral: number; periodo: string; accion: string; moneda?: string | null; accionValor?: number | null;
};

export async function crearRegla(actor: Actor, e: EntradaDeRegla): Promise<ReglaAutomatica> {
  if (!puede(actor)) throw new ErrorDeRegla("Solo un supervisor o administrador puede crear reglas.", 403);
  if (!enAlcance(actor, e.clienteId)) throw new ErrorDeRegla("Ese cliente no está en tu alcance.", 403);
  if (!incluye(NIVELES_DE_REGLA, e.nivel) || !incluye(METRICAS_DE_REGLA, e.metrica) || !incluye(OPERADORES_DE_REGLA, e.operador) || !incluye(PERIODOS_DE_REGLA, e.periodo) || !incluye(ACCIONES_DE_REGLA, e.accion)) {
    throw new ErrorDeRegla("La regla tiene un campo no válido.");
  }
  if (!Number.isFinite(e.umbral) || e.umbral <= 0) throw new ErrorDeRegla("El umbral debe ser un número mayor que cero.");
  if (!ACCION[e.plataforma]?.[e.nivel]?.pause) throw new ErrorDeRegla("Esa plataforma todavía no permite pausar a ese nivel.");
  const problema = problemaDeAccion(e.accion as AccionDeRegla, e.nivel as NivelDeRegla, e.accionValor);
  if (problema) throw new ErrorDeRegla(problema);
  if (!e.entidadId) throw new ErrorDeRegla("Falta elegir qué campaña, conjunto o anuncio vigilar.");
  // La cuenta la manda el navegador: debe ser de ese cliente.
  const duenio = (await accountIndex()).get(normalizeAccountId(e.cuenta));
  if (!duenio || duenio.id !== e.clienteId) throw new ErrorDeRegla("Esa cuenta no pertenece a este cliente.", 403);
  const id = crypto.randomUUID();
  await getRawDb()
    .prepare(
      `INSERT INTO reglas_automaticas (id, portfolio_id, provider, account_id, nivel, entity_id, entity_name, campaign_id, adset_id,
         metrica, operador, umbral, periodo, accion, moneda, accion_valor, activa, creada_por, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(id, e.clienteId, e.plataforma, e.cuenta, e.nivel, e.entidadId, e.entidad.slice(0, 200), e.campaignId ?? null, e.adsetId ?? null, e.metrica, e.operador, e.umbral, e.periodo, e.accion, e.moneda ?? null, e.accionValor ?? null, actor.email, Date.now())
    .run();
  return aRegla((await filaDe(id))!);
}

async function filaDe(id: string): Promise<Fila | null> {
  return (await getRawDb().prepare("SELECT * FROM reglas_automaticas WHERE id = ? LIMIT 1").bind(id).first<Fila>()) ?? null;
}

export async function listarReglas(actor: Actor): Promise<ReglaAutomatica[]> {
  if (!puede(actor)) return [];
  const { results } = await getRawDb().prepare("SELECT * FROM reglas_automaticas ORDER BY created_at DESC LIMIT 300").all<Fila>();
  return (results ?? []).filter((f) => enAlcance(actor, f.portfolio_id)).map(aRegla);
}

export async function cambiarRegla(actor: Actor, id: string, cambio: { activa?: boolean; rearmar?: boolean; borrar?: boolean }): Promise<void> {
  const f = await filaDe(id);
  if (!puede(actor) || !f || !enAlcance(actor, f.portfolio_id)) throw new ErrorDeRegla("No encontré esa regla.", 404);
  const db = getRawDb();
  if (cambio.borrar) {
    await db.prepare("DELETE FROM reglas_automaticas WHERE id = ?").bind(id).run();
    return;
  }
  if (typeof cambio.activa === "boolean") await db.prepare("UPDATE reglas_automaticas SET activa = ? WHERE id = ?").bind(cambio.activa ? 1 : 0, id).run();
  if (cambio.rearmar) await db.prepare("UPDATE reglas_automaticas SET disparada_clave = NULL WHERE id = ?").bind(id).run();
}

const filasDeEntidad = (r: Fila, ads: AdSummary[]): AdSummary[] =>
  ads.filter((a) => {
    if (a.provider !== r.provider || normalizeAccountId(a.accountId) !== normalizeAccountId(r.account_id)) return false;
    if (r.nivel === "campana") return a.campaignId === r.entity_id;
    if (r.nivel === "conjunto") return a.adsetId === r.entity_id;
    return a.adId === r.entity_id;
  });

/** Baja el presupuesto diario de una campaña o conjunto. Solo baja (nunca sube ni pausa). */
async function bajarPresupuesto(actor: Actor, r: Fila): Promise<{ ok: boolean; texto: string }> {
  const credencialesGoogle = r.provider === "google" ? await accesoNativoGoogle(actor, r.account_id) : null;
  const detalle = await fetchDetalleDeCuenta(r.provider as never, r.account_id, { credencialesGoogle });
  const campana = r.nivel === "campana" ? detalle.campanas.find((c) => c.id === r.entity_id) : null;
  const conjunto = r.nivel === "conjunto" ? detalle.conjuntos.find((c) => c.id === r.entity_id) : null;
  const entidad = campana ?? conjunto;
  if (!entidad) return { ok: false, texto: "No pude leer la entidad para bajar su presupuesto." };
  const diario = entidad.presupuesto.diario;
  if (diario === null || diario === undefined) {
    return { ok: false, texto: "No tiene presupuesto diario propio (es de la campaña, es total o no se pudo leer): no se cambió nada." };
  }
  const nuevo = presupuestoReducido(diario, r.accion_valor ?? 0);
  if (nuevo >= diario) return { ok: true, texto: "El presupuesto ya está en su mínimo: no se cambió." };
  const antes: AntesDeEdicion = campana
    ? { nivel: "campana", entidad: campana }
    : { nivel: "conjunto", entidad: conjunto!, campana: detalle.campanas.find((c) => c.id === conjunto!.campaignId) ?? null };
  const plan = planEdicion(r.provider as never, antes, { presupuesto: { tipo: "daily", monto: nuevo } }, { currency: r.moneda });
  const bloqueo = plan.problemas.find((p) => p.bloqueante);
  if (bloqueo) return { ok: false, texto: `No se pudo bajar el presupuesto: ${bloqueo.mensaje}` };
  const pasos = plan.pasos.filter((p) => p.via === "windsor");
  if (pasos.length === 0) return { ok: false, texto: "No hay forma de bajar el presupuesto de esta entidad desde aquí." };
  for (const paso of pasos) {
    const ejecucion = await executeWindsorAction(r.provider as never, r.account_id, paso.action, paso.params);
    await registrarEjecucion(
      { portfolioId: r.portfolio_id, name: `Regla: bajar el presupuesto ${r.accion_valor} %`, platforms: [r.provider as never] },
      actor.email,
      [pasoDeEdicion(r.provider as never, paso.action, paso.params, ejecucion, r.account_id)],
      ejecucion.ok,
    );
    if (!ejecucion.ok) return { ok: false, texto: `No se pudo bajar el presupuesto: ${ejecucion.error ?? "error de la plataforma"}` };
  }
  return { ok: true, texto: `Presupuesto diario bajado de ${diario} a ${nuevo}.` };
}

export type ResultadoDeEvaluacion = { revisadas: number; disparadas: Array<{ regla: string; entidad: string; valor: number; resultado: string }> };

/** Evalúa las reglas activas a su alcance y ejecuta las que se cumplen. */
export async function evaluarReglas(actor: Actor, ahora = new Date()): Promise<ResultadoDeEvaluacion> {
  if (!puede(actor)) return { revisadas: 0, disparadas: [] };
  const { results } = await getRawDb().prepare("SELECT * FROM reglas_automaticas WHERE activa = 1 LIMIT 300").all<Fila>();
  const reglas = (results ?? []).filter((f) => enAlcance(actor, f.portfolio_id));
  const salida: ResultadoDeEvaluacion = { revisadas: reglas.length, disparadas: [] };
  const periodos = [...new Set(reglas.map((r) => r.periodo))];
  for (const periodo of periodos) {
    const snap = await getPerformanceSnapshot(actor, ahora, { incluirCampanas: false, incluirAnuncios: true, rango: rangoDeRegla(periodo as PeriodoDeRegla, ahora) });
    for (const r of reglas.filter((x) => x.periodo === periodo)) {
      const clave = claveDePeriodo(periodo as PeriodoDeRegla, ahora);
      if (r.disparada_clave === clave) continue;
      const filas = filasDeEntidad(r, snap.ads);
      if (filas.length === 0) continue;
      const { cumple, valor } = cumpleRegla({ metrica: r.metrica as MetricaDeRegla, operador: r.operador as OperadorDeRegla, umbral: r.umbral }, sumar(filas));
      if (!cumple || valor === null) continue;
      let resultado = "Aviso registrado.";
      if (r.accion === "bajar_presupuesto") {
        const b = await bajarPresupuesto(actor, r);
        resultado = b.texto;
        if (!b.ok) {
          // Una falla no se da por disparada: se reintenta en la próxima evaluación.
          await getRawDb().prepare("UPDATE reglas_automaticas SET ultimo_valor = ?, ultimo_resultado = ? WHERE id = ?").bind(valor, resultado, r.id).run();
          continue;
        }
      } else if (r.accion === "pausar") {
        // Solo se pausa lo que sigue activo; una pausa a mano posterior no se pisa.
        if (!filas.some((f) => activa(f.status))) {
          resultado = "Ya estaba pausado.";
        } else {
          const receta = ACCION[r.provider][r.nivel as NivelDeRegla];
          const valores = valoresDeParametros(r.provider, { campaignId: r.nivel === "campana" ? r.entity_id : r.campaign_id, adsetId: r.nivel === "conjunto" ? r.entity_id : r.adset_id, adId: r.nivel === "anuncio" ? r.entity_id : null });
          const params: Record<string, unknown> = {};
          let falta = false;
          for (const k of receta.params) {
            if (!valores[k]) falta = true;
            else params[k] = valores[k];
          }
          if (falta) {
            resultado = "No se pudo pausar: falta el identificador del conjunto o la campaña de esta regla.";
          } else {
            const ejecucion = await executeWindsorAction(r.provider as never, r.account_id, receta.pause, params);
            await registrarEjecucion(
              { portfolioId: r.portfolio_id, name: `Regla: ${nombreDeEdicion(receta.pause, params)}`, platforms: [r.provider as never] },
              actor.email,
              [pasoDeEdicion(r.provider as never, receta.pause, params, ejecucion, r.account_id)],
              ejecucion.ok,
            );
            resultado = ejecucion.ok ? "Pausado por la regla." : `No se pudo pausar: ${ejecucion.error ?? "error de la plataforma"}`;
            if (!ejecucion.ok) {
              // Fallo de la plataforma: se reintenta en la próxima evaluación, no se da por disparada.
              await getRawDb().prepare("UPDATE reglas_automaticas SET ultimo_valor = ?, ultimo_resultado = ? WHERE id = ?").bind(valor, resultado, r.id).run();
              continue;
            }
          }
        }
      }
      await getRawDb().prepare("UPDATE reglas_automaticas SET disparada_clave = ?, disparada_at = ?, ultimo_valor = ?, ultimo_resultado = ? WHERE id = ?").bind(clave, ahora.getTime(), valor, resultado, r.id).run();
      salida.disparadas.push({ regla: aRegla(r).texto, entidad: r.entity_name, valor, resultado });
    }
  }
  return salida;
}

/** Reglas disparadas en los últimos 2 días, para mostrarlas como alertas. */
export async function reglasDisparadasRecientes(actor: Actor, ahora = new Date()): Promise<ReglaAutomatica[]> {
  const desde = ahora.getTime() - 2 * 86400000;
  return (await listarReglas(actor)).filter((r) => r.disparadaAt !== null && r.disparadaAt >= desde);
}
