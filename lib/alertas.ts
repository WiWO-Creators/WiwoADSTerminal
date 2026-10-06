import type { CampaignSummary } from "@/lib/performance-store";
import { isActivePlatform, type Platform } from "@/lib/plataformas";
import type { Portfolio } from "@/lib/portafolios-store";

/**
 * Alertas proactivas — lo que el sistema vigila solo, sin que nadie pregunte.
 *
 * A diferencia de `lib/reglas.ts` (que persiste "decisiones" en una cola para
 * firmar, y nunca ejecuta nada por sí mismo), esto se calcula en vivo a cada
 * vez que se pide y, cuando hay una acción segura y reversible (pausar), trae
 * los ids reales para aplicarla con un solo clic — el mismo endpoint y los
 * mismos permisos que ya usa el resto de la app
 * (`POST /api/anuncios/estado`). No hay nada que firmar ni ejecución manual
 * pendiente: lo que se ve es lo que se puede hacer ahí mismo.
 *
 * Mismos umbrales que `lib/reglas.ts` (`UMBRAL_DESPERDICIO_X_CPA`,
 * `UMBRAL_DEGRADACION_X_CPA`, `CONVERSIONES_MINIMAS_DEGRADACION`) y las
 * mismas `activa`/`moneda`, todos repetidos acá en vez de importados: este
 * módulo se prueba con `node --test` corriendo el `.ts` crudo
 * (`tests/alertas.test.mjs`), sin el paso de build que resuelve el alias
 * `@/`. Un import de VALOR con ese alias (o incluso uno relativo sin
 * extensión) revienta ahí en tiempo de ejecución — comprobado en vivo al
 * intentar importar `activa`/`moneda` desde `lib/estado-campana.ts` y
 * `lib/monedas.ts` (donde sí viven para que `lib/reglas.ts`, que no se
 * prueba así, las importe de verdad). Los `import type` de arriba sí pueden
 * usar el alias: se borran enteros al compilar y nunca llegan a necesitar
 * resolverlo. Si cambia un umbral o una de estas dos funciones, cambia en
 * los dos lados. No incluye la regla de presupuesto (escalar/reducir): esa
 * no tiene una acción de un solo clic segura desde acá todavía.
 */
const UMBRAL_DESPERDICIO_X_CPA = 2;
const UMBRAL_DEGRADACION_X_CPA = 1.4;
const CONVERSIONES_MINIMAS_DEGRADACION = 3;

function activa(status: string | null): boolean {
  const valor = (status ?? "").toUpperCase();
  return valor === "ENABLED" || valor === "ACTIVE";
}

function moneda(valorMicros: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: currency ?? "CLP",
      maximumFractionDigits: 0,
    }).format(valorMicros / 1_000_000);
  } catch {
    // Un código de moneda que Intl no reconoce no debe tumbar la evaluación.
    return `${(valorMicros / 1_000_000).toLocaleString("es-CL")} ${currency ?? ""}`;
  }
}

export type Severidad = "critica" | "alta" | "media";

export type Alerta = {
  id: string;
  severidad: Severidad;
  clienteId: string;
  clienteNombre: string;
  /** `null` en las alertas del cliente entero (por ejemplo, la medición). */
  plataforma: Platform | null;
  cuenta: string;
  campana: string;
  diagnostico: string;
  accion: { tipo: "pausar"; cuentaId: string; campanaId: string } | null;
  /** Enlaces directos para revisarlo fuera de la app (los agrega la API). */
  enlaces?: Array<{ etiqueta: string; url: string }>;
};


function accionDePausar(
  c: CampaignSummary,
): { tipo: "pausar"; cuentaId: string; campanaId: string } | null {
  return c.campaignId ? { tipo: "pausar", cuentaId: c.accountId, campanaId: c.campaignId } : null;
}

/**
 * Recorre las campañas ya leídas (mismo snapshot que usa el resto de la app,
 * ya acotado por permisos) y arma la lista de alertas, ordenada de más a
 * menos urgente.
 */
export function generarAlertas(portfolios: Portfolio[], campanas: CampaignSummary[]): Alerta[] {
  const portfolioPorCuenta = new Map<string, Portfolio>();
  for (const p of portfolios) {
    for (const accId of p.accountIds) portfolioPorCuenta.set(accId, p);
  }

  const alertas: Alerta[] = [];

  for (const c of campanas) {
    // Las plataformas declaradas pero desactivadas no generan alertas.
    if (!isActivePlatform(c.provider)) continue;
    if (!activa(c.status)) continue;
    const portfolio = portfolioPorCuenta.get(c.accountId);
    if (!portfolio) continue;
    const base = `${c.provider}:${c.accountId}:${c.campaignId ?? c.name}`;

    // Activa pero sin ningún dato en el periodo: no necesita meta — es una
    // señal de que algo no está entregando (sin presupuesto, rechazada,
    // mal segmentada), sin importar el objetivo del cliente.
    if (!c.conActividad) {
      alertas.push({
        id: `sin-actividad-${base}`,
        severidad: "media",
        clienteId: portfolio.id,
        clienteNombre: portfolio.name,
        plataforma: c.provider,
        cuenta: c.accountName,
        campana: c.name,
        diagnostico:
          "Está activa pero no gastó nada en el periodo. Revisa en la plataforma si le falta presupuesto, si la rechazaron o si el público es demasiado cerrado.",
        accion: null,
      });
      continue;
    }

    if (portfolio.targetCpaMicros === null) continue;
    const spend = c.spendMicros;
    const conversions = c.conversions ?? 0;

    if (
      spend > 0 &&
      spend >= UMBRAL_DESPERDICIO_X_CPA * portfolio.targetCpaMicros &&
      conversions === 0
    ) {
      alertas.push({
        id: `desperdicio-${base}`,
        severidad: "critica",
        clienteId: portfolio.id,
        clienteNombre: portfolio.name,
        plataforma: c.provider,
        cuenta: c.accountName,
        campana: c.name,
        diagnostico: `Gastó ${moneda(spend, c.currency)} sin lograr ningún resultado (cada resultado debería costar ${moneda(portfolio.targetCpaMicros, c.currency)}). Conviene pausarla y revisar su público o su anuncio.`,
        accion: accionDePausar(c),
      });
      continue;
    }

    if (conversions >= CONVERSIONES_MINIMAS_DEGRADACION) {
      const cpaReal = spend / conversions;
      if (cpaReal > UMBRAL_DEGRADACION_X_CPA * portfolio.targetCpaMicros) {
        alertas.push({
          id: `degradacion-${base}`,
          severidad: "alta",
          clienteId: portfolio.id,
          clienteNombre: portfolio.name,
          plataforma: c.provider,
          cuenta: c.accountName,
          campana: c.name,
          diagnostico: `Cada resultado le está costando ${moneda(cpaReal, c.currency)}, un ${Math.round((cpaReal / portfolio.targetCpaMicros - 1) * 100)}% más que la meta de ${moneda(portfolio.targetCpaMicros, c.currency)}. Revisa su público y sus anuncios antes de seguir invirtiendo.`,
          accion: accionDePausar(c),
        });
      }
    }
  }

  // Medición: un cliente marcado sin GTM lo muestra siempre, tenga o no campañas
  // activas. "Sin verificar" (null) no alerta: no se afirma lo que nadie confirmó.
  for (const p of portfolios) {
    if (p.gtmEstado !== "no_tiene") continue;
    alertas.push({
      id: `sin-gtm-${p.id}`,
      severidad: "alta",
      clienteId: p.id,
      clienteNombre: p.name,
      plataforma: null,
      cuenta: "Medición",
      campana: "Google Tag Manager",
      diagnostico:
        "NO cuenta con GTM. Sin Tag Manager, los leads y las conversiones pueden medirse mal o no medirse. Instálalo en el sitio y registra el contenedor en la ficha del cliente.",
      accion: null,
    });
  }

  const orden: Record<Severidad, number> = { critica: 0, alta: 1, media: 2 };
  return alertas.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}
