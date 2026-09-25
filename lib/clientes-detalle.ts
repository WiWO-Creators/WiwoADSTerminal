import type { Actor } from "@/lib/permisos";
import { getPerformanceSnapshot } from "@/lib/performance-store";
import { listPortfolios, type Portfolio } from "@/lib/portafolios-store";
import { fetchWindsorCatalog } from "@/lib/windsor";

/**
 * Cliente con sus cuentas resueltas: nombre, plataforma, moneda, página de
 * Meta y países — cada uno por cuenta, no por cliente. Ver el porqué en
 * `lib/portafolios-store.ts`: SQM y ALO Group necesitan varias páginas o
 * varios países bajo un mismo cliente.
 *
 * Vive aparte de `/api/clientes` porque el Constructor también lo necesita
 * —para saber en qué cuenta publicar— y antes esta misma mezcla de fuentes se
 * repetía en cada ruta que quisiera esa lista.
 */
export type CuentaDetalle = {
  externalId: string;
  name: string;
  provider: string;
  currency: string | null;
  pageId: string | null;
  /**
   * Píxeles de Meta de esta cuenta, para que el conjunto de anuncios pueda
   * optimizar a conversiones (leads, ventas) en vez de solo a clics. Puede
   * haber más de uno (ver `portafolios-store.ts`) — sin fallback a nivel
   * cliente, a diferencia de `pageId`, porque nunca existió un campo así en
   * `portfolios`.
   */
  pixels: Array<{ id: string; pixelId: string; label: string | null }>;
  countries: string[];
  /** false: la cuenta existe, pero no reportó nada en el periodo actual. */
  conDatos: boolean;
};

export type ClienteDetalle = Portfolio & { accounts: CuentaDetalle[] };

export async function detalleClientes(
  actor: Actor,
  now: Date,
): Promise<{
  clientes: ClienteDetalle[];
  sueltas: Array<{
    externalId: string;
    name: string;
    provider: string;
    currency: string | null;
  }>;
}> {
  const [portfolios, snapshot, catalogo] = await Promise.all([
    listPortfolios(),
    getPerformanceSnapshot(actor, now, {
      incluirCampanas: false,
      incluirAnuncios: false,
    }),
    // Solo lee lo ya guardado: no golpea Windsor ni retrasa la pantalla.
    fetchWindsorCatalog(now.toISOString().slice(0, 10)),
  ]);

  // Cuentas que Windsor ve pero que todavía no pertenecen a ningún cliente.
  const asignadas = new Set(
    portfolios.flatMap((p) => p.accountIds.map((a) => a.toLowerCase())),
  );
  const sueltas = snapshot.accounts
    .map((account) => ({
      externalId: account.id.split(":").at(-1) ?? account.id,
      name: account.name,
      provider: account.provider,
      currency: account.currency,
    }))
    .filter((account) => !asignadas.has(account.externalId.toLowerCase()));

  const detalle = new Map(
    snapshot.accounts.map((account) => [
      (account.id.split(":").at(-1) ?? account.id).toLowerCase(),
      { name: account.name, provider: account.provider, currency: account.currency },
    ]),
  );
  // Respaldo para las cuentas que no facturaron este mes: el catálogo cubre
  // años de historial y sí las conoce.
  const historico = new Map<
    string,
    { name: string; provider: string; currency: string | null }
  >();
  for (const campana of catalogo.campanas) {
    const clave = campana.accountId.toLowerCase();
    if (historico.has(clave)) continue;
    historico.set(clave, {
      name: campana.accountName,
      provider: campana.provider,
      currency: campana.currency,
    });
  }

  const clientes = portfolios.map((portfolio) => {
    // Con una sola cuenta por plataforma, la página y los países del cliente
    // —el campo único de siempre— siguen siendo el dato correcto: nunca se
    // migraron a la fila de esa cuenta porque hasta ahora no hacía falta.
    // ALO Group lo prueba: su única cuenta de Meta declaraba el campo nuevo
    // vacío mientras el campo antiguo del cliente sí tenía la página.
    // La plataforma sale de lo guardado; las métricas son solo respaldo.
    //
    // Deducirla de la actividad fallaba en el único caso donde el dato
    // importa de verdad: una cuenta recién conectada, sin una sola impresión,
    // no figura en ninguna métrica. Foundaxis tiene su cuenta de Meta
    // conectada y sin historial, y el constructor juraba que no existía.
    const proveedorDe = (externalId: string): string => {
      const guardado = portfolio.accountProviders[externalId];
      if (guardado) return guardado;
      const clave = externalId.toLowerCase();
      return (
        detalle.get(clave)?.provider ??
        historico.get(clave)?.provider ??
        proveedorPorFormatoDeId(externalId)
      );
    };

    const porProveedor = new Map<string, number>();
    for (const id of portfolio.accountIds) {
      const proveedor = proveedorDe(id);
      if (!proveedor) continue;
      porProveedor.set(proveedor, (porProveedor.get(proveedor) ?? 0) + 1);
    }

    return {
    ...portfolio,
    accounts: portfolio.accountIds.map((externalId): CuentaDetalle => {
      const clave = externalId.toLowerCase();
      const proveedor = proveedorDe(externalId);
      const unicaDeSuProveedor = (porProveedor.get(proveedor) ?? 0) <= 1;
      const pageId =
        portfolio.accountPages[externalId] ??
        (unicaDeSuProveedor ? portfolio.pageId : null);
      const pixels = portfolio.accountPixels[externalId] ?? [];
      const countriesPropias = portfolio.accountCountries[externalId] ?? [];
      const countries =
        countriesPropias.length > 0
          ? countriesPropias
          : unicaDeSuProveedor
            ? portfolio.countries
            : [];
      const actual = detalle.get(clave);
      if (actual) {
        return {
          externalId,
          ...actual,
          provider: proveedor,
          conDatos: true,
          pageId,
          pixels,
          countries,
        };
      }
      const previo = historico.get(clave);
      if (previo) {
        return {
          externalId,
          ...previo,
          provider: proveedor,
          conDatos: false,
          pageId,
          pixels,
          countries,
        };
      }
      return {
        externalId,
        // Sin métricas no hay nombre: la API de Windsor solo nombra cuentas
        // que entregaron algo. Se muestra el identificador, que al menos
        // identifica, en vez de un "Sin datos en Windsor" que en una frase
        // como "se publica en …" queda ilegible.
        name: `Cuenta ${externalId}`,
        provider: proveedor,
        currency: null,
        conDatos: false,
        pageId,
        pixels,
        countries,
      };
    }),
  };
  });

  return { clientes, sueltas };
}

/**
 * Último recurso para saber la plataforma de una cuenta sin dato guardado ni
 * historial: el formato del identificador.
 *
 * Google Ads usa `NNN-NNN-NNNN`, con guiones, y es inconfundible. Meta,
 * TikTok y LinkedIn usan números pelados entre sí indistinguibles, así que
 * para esos devuelve vacío en vez de adivinar — el dato correcto se graba al
 * vincular la cuenta.
 */
function proveedorPorFormatoDeId(externalId: string): string {
  return /^\d{3}-\d{3}-\d{4}$/.test(externalId.trim()) ? "google" : "";
}
