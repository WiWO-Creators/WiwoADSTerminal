import { getSession } from "@/app/sesion";
import type { Actor } from "@/lib/permisos";
import {
  IntegrationError,
  listIntegrations,
  userCanManageIntegrations,
} from "@/lib/integration-store";
import { getPerformanceSnapshot } from "@/lib/performance-store";
import { windsorConfigured } from "@/lib/windsor";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: "Tu cuenta no tiene acceso a WiWO.ADS" },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  const user = session.actor;

  try {
    return Response.json(
      {
        integrations: await listIntegrations(user),
        canManage: userCanManageIntegrations(user),
        windsor: await windsorStatus(user),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: safeMessage(error) },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

/**
 * Estado de la fuente de lectura.
 *
 * Sin esto la pantalla de Cuentas decía "0 autorizadas" mientras el tablero
 * mostraba 31 cuentas con datos: la vista solo conocía el camino OAuth y era
 * ciega a Windsor, que es de donde salen las métricas hoy.
 */
async function windsorStatus(actor: Actor) {
  if (!windsorConfigured()) return { configured: false as const };
  try {
    const performance = await getPerformanceSnapshot(actor, new Date(), {
      incluirCampanas: false,
      incluirAnuncios: false,
    });
    const porProveedor = (provider: "google" | "meta") =>
      performance.accounts
        .filter((account) => account.provider === provider && account.hasData)
        .map((account) => ({
          name: account.name,
          currency: account.currency,
        }));

    return {
      configured: true as const,
      accountCount: performance.accountsWithData,
      google: performance.byProvider.find((p) => p.provider === "google")
        ?.accountsWithData ?? 0,
      meta: performance.byProvider.find((p) => p.provider === "meta")
        ?.accountsWithData ?? 0,
      // Las cuentas que cada plataforma está alimentando hoy. Sin esto la
      // tarjeta dice "sin conexión" mientras entran datos de 17 cuentas.
      accounts: {
        google: porProveedor("google"),
        meta: porProveedor("meta"),
      },
      lastSyncedAt: performance.lastSyncedAt,
      dataThrough: performance.dataThrough,
    };
  } catch {
    return {
      configured: true as const,
      accountCount: 0,
      google: 0,
      meta: 0,
      accounts: { google: [], meta: [] },
      lastSyncedAt: null,
      dataThrough: null,
    };
  }
}

function safeMessage(error: unknown) {
  return error instanceof IntegrationError
    ? error.message
    : "No pudimos cargar las conexiones";
}
