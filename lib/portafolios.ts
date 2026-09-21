import { ACTIVE_PLATFORMS, PLATFORM } from "@/lib/plataformas";
import type { Portfolio } from "@/lib/portafolios-store";
import { normalizeAccountId } from "@/lib/portafolios-store";

import type {
  CurrencyTotal,
  PerformanceAccountSummary,
  ProviderTotal,
} from "@/lib/performance-store";

/**
 * Agrupa cuentas publicitarias en portafolios (clientes).
 *
 * El mapa vive en la base y lo administra el equipo desde la pantalla de
 * Clientes. No se empareja por nombre: "Amipass Companies" en Google es
 * "Amipass Chile" en Meta, y ALO Group son seis cuentas de Google contra una
 * de Meta. Adivinar produciría portafolios equivocados, y un portafolio mal
 * armado reparte mal el presupuesto.
 *
 * Una cuenta que no figure en el mapa forma su propio portafolio: así una
 * cuenta nueva aparece sola en vez de desaparecer del tablero.
 */

/** Índice cuenta normalizada -> portafolio, resuelto una vez por consulta. */
export type PortfolioIndex = Map<string, Portfolio>;

export type PortfolioSummary = {
  id: string;
  name: string;
  /** true cuando el portafolio está declarado y no es una cuenta suelta. */
  declared: boolean;
  /** Página de Facebook. Sin ella Meta no puede publicar. */
  pageId: string | null;
  /** Países ISO-2 para la segmentación mínima que Meta exige. */
  countries: string[];
  accountCount: number;
  accountsWithData: number;
  currencyTotals: CurrencyTotal[];
  byProvider: ProviderTotal[];
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  accounts: PerformanceAccountSummary[];
};


/**
 * A qué portafolio pertenece una cuenta.
 *
 * Misma resolución que usa buildPortfolios, expuesta aparte para poder filtrar
 * por permisos antes de agrupar.
 */
export function portfolioIdFor(
  account: PerformanceAccountSummary,
  index: PortfolioIndex,
): string {
  const declared = index.get(normalizeAccountId(externalId(account)));
  return declared?.id ?? `cuenta:${account.id}`;
}

export function buildPortfolios(
  accounts: PerformanceAccountSummary[],
  index: PortfolioIndex,
): PortfolioSummary[] {
  const groups = new Map<
    string,
    {
      name: string;
      declared: boolean;
      pageId: string | null;
      countries: string[];
      accounts: PerformanceAccountSummary[];
    }
  >();

  for (const account of accounts) {
    const declared = index.get(normalizeAccountId(externalId(account)));
    const key = declared?.id ?? `cuenta:${account.id}`;
    const group = groups.get(key) ?? {
      name: declared?.name ?? account.name,
      declared: Boolean(declared),
      pageId: declared?.pageId ?? null,
      countries: declared?.countries ?? [],
      accounts: [],
    };
    group.accounts.push(account);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([id, group]) => summarize(id, group))
    .sort((a, b) => {
      // Primero los que tienen datos; dentro de eso, alfabético.
      if ((b.accountsWithData > 0 ? 1 : 0) !== (a.accountsWithData > 0 ? 1 : 0)) {
        return (b.accountsWithData > 0 ? 1 : 0) - (a.accountsWithData > 0 ? 1 : 0);
      }
      return a.name.localeCompare(b.name, "es");
    });
}

function summarize(
  id: string,
  group: {
    name: string;
    declared: boolean;
    pageId: string | null;
    countries: string[];
    accounts: PerformanceAccountSummary[];
  },
): PortfolioSummary {
  const accounts = group.accounts;
  const withData = accounts.filter((account) => account.hasData);

  return {
    id,
    name: group.name,
    declared: group.declared,
    pageId: group.pageId,
    countries: group.countries,
    accountCount: accounts.length,
    accountsWithData: withData.length,
    currencyTotals: sumByCurrency(withData),
    byProvider: ACTIVE_PLATFORMS
      .map((provider) => {
        const own = accounts.filter((a) => a.provider === provider);
        const ownWithData = own.filter((a) => a.hasData);
        return {
          provider,
          label: PLATFORM[provider].label,
          accountCount: own.length,
          accountsWithData: ownWithData.length,
          currencyTotals: sumByCurrency(ownWithData),
          impressions: nullableSum(ownWithData.map((a) => a.impressions)),
          clicks: nullableSum(ownWithData.map((a) => a.clicks)),
          conversions: nullableSum(ownWithData.map((a) => a.conversions)),
          conversionValueMicros: nullableSum(
            ownWithData.map((a) => a.conversionValueMicros),
          ),
        };
      })
      .filter((total) => total.accountCount > 0),
    impressions: nullableSum(withData.map((a) => a.impressions)),
    clicks: nullableSum(withData.map((a) => a.clicks)),
    conversions: nullableSum(withData.map((a) => a.conversions)),
    accounts: [...accounts].sort((a, b) => a.name.localeCompare(b.name, "es")),
  };
}

/** El gasto se agrupa por moneda. Sumar CLP con USD daría un número falso. */
function sumByCurrency(
  accounts: PerformanceAccountSummary[],
): CurrencyTotal[] {
  const totals = new Map<string, CurrencyTotal>();
  for (const account of accounts) {
    const currency = account.currency ?? "N/D";
    const current = totals.get(currency) ?? {
      currency,
      spendMicros: 0,
      conversionValueMicros: null,
    };
    current.spendMicros += account.spendMicros ?? 0;
    if (account.conversionValueMicros !== null) {
      current.conversionValueMicros =
        (current.conversionValueMicros ?? 0) + account.conversionValueMicros;
    }
    totals.set(currency, current);
  }
  return [...totals.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
}

function nullableSum(values: Array<number | null>): number | null {
  if (values.length === 0 || values.some((value) => value === null)) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

/**
 * El id externo viene embebido en el id interno de la cuenta
 * ("windsor:google:832-810-5693"). Se toma el último segmento.
 */
function externalId(account: PerformanceAccountSummary): string {
  const parts = account.id.split(":");
  return parts.at(-1) ?? account.id;
}

