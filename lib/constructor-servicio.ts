/**
 * Armar y ejecutar un borrador del Constructor del lado del servidor: lo comparten la ruta de publicar directo
 * (supervisores y administradores) y la aprobación de una solicitud. Una sola definición de cómo se rearma el plan y
 * cómo se corre, para que lo que se aprobó sea exactamente lo que se ejecuta.
 */
import { cargarCompatibilidadBoost } from "@/lib/boost-compat-store";
import { cargarRetiradas } from "@/lib/renovar-piezas";
import { detalleClientes } from "@/lib/clientes-detalle";
import { buildPlan, normalizeDraft, type BuildResult, type CampaignDraft, type CuentaCliente } from "@/lib/constructor";
import {
  cuentaDe,
  ejecutarPasosDelPlan,
  nombresDeCampanasRecientes,
  registrarEjecucion,
  type ResultadoEjecucion,
} from "@/lib/constructor-ejecutar";
import { accesoNativoGoogle } from "@/lib/integration-store";
import { enAlcance, type Actor } from "@/lib/permisos";
import { getPerformanceSnapshot } from "@/lib/performance-store";

export class ErrorDeConstructor extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type PlanArmado = {
  draft: CampaignDraft;
  plan: BuildResult;
  cuentas: CuentaCliente[];
  clienteNombre: string;
};

/** Normaliza el borrador y arma el plan con los datos reales del cliente (alcance incluido). */
export async function armarPlanDeBorrador(actor: Actor, cuerpo: Partial<CampaignDraft>): Promise<PlanArmado> {
  const draft = normalizeDraft(cuerpo);
  if (!draft.portfolioId || !enAlcance(actor, draft.portfolioId)) {
    throw new ErrorDeConstructor("Ese cliente no está en tu alcance", 403);
  }
  const [snapshot, { clientes }] = await Promise.all([getPerformanceSnapshot(actor), detalleClientes(actor, new Date())]);
  const portfolio = snapshot.portfolios.find((p) => p.id === draft.portfolioId) ?? null;
  const cliente = clientes.find((c) => c.id === draft.portfolioId);
  const cuentas: CuentaCliente[] = cliente?.accounts ?? [];
  const excluir = await nombresDeCampanasRecientes(draft.portfolioId);
  const compat = await cargarCompatibilidadBoost(draft);
  const plan = buildPlan(draft, portfolio, cuentas, snapshot, excluir, compat, {
    sinConversionesMedidas: cliente?.gtmEstado === "no_tiene",
    retirar: await cargarRetiradas(draft, cuentas),
  });
  return { draft, plan, cuentas, clienteNombre: cliente?.name ?? portfolio?.name ?? draft.portfolioId };
}

/** Corre el plan ya armado contra las plataformas y lo deja en la bitácora. Quien llama ya verificó los permisos. */
export async function ejecutarPlanArmado(actor: Actor, armado: PlanArmado): Promise<ResultadoEjecucion> {
  const bloqueantes = armado.plan.issues.filter((i) => i.blocking);
  if (bloqueantes.length > 0) {
    throw new ErrorDeConstructor(`El plan todavía tiene problemas por resolver: ${bloqueantes.map((i) => i.message).join(" · ")}`, 422);
  }
  if (armado.plan.steps.filter((s) => !s.informativo).length === 0) {
    throw new ErrorDeConstructor("El plan no tiene ningún paso que ejecutar", 422);
  }
  let credencialesGoogle = null;
  if (armado.plan.steps.some((s) => s.via === "nativa")) {
    const cuentaGoogle = cuentaDe({ platform: "google" }, armado.draft, armado.cuentas);
    credencialesGoogle = cuentaGoogle ? await accesoNativoGoogle(actor, cuentaGoogle.externalId) : null;
  }
  const resultado = await ejecutarPasosDelPlan(armado.plan.steps, armado.draft, armado.cuentas, credencialesGoogle);
  await registrarEjecucion(armado.draft, actor.email, resultado.pasos, resultado.ok);
  return resultado;
}
