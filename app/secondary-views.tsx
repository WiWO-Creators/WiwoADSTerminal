"use client";

import type { CSSProperties } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  HeartPulse,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { platformLabel } from "@/lib/plataformas";
import type { PortfolioSummary } from "@/lib/portafolios";
import { cn } from "@/lib/utils";
import type {
  CurrencyTotal,
  PerformanceAccountSummary,
  PerformanceSnapshot,
} from "@/lib/performance-store";
import type { HealthCheck, HealthState } from "./data";
import {
  HealthBadge,
  StatCard,
  Surface,
} from "./ui";

export function ControlRoomView({
  nombre,
  performance,
  onOpenClientes,
  onOpenHealth,
  onOpenIntegrations,
}: {
  /** Primer nombre de quien entró, para el saludo. */
  nombre: string;
  performance: PerformanceSnapshot;
  onOpenClientes: () => void;
  onOpenHealth: (client: string) => void;
  onOpenIntegrations: () => void;
}) {
  const hasLiveData = performance.accountsWithData > 0;
  const isCurrent = performance.mode === "live";
  const monthLabel = etiquetaPeriodo(performance);
  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-micro mb-3 inline-flex items-center gap-2 text-[0.62rem] text-foreground/50">
            <span
              className={cn(
                "size-2 rounded-full",
                isCurrent ? "bg-ok-deep" : "bg-warn-deep",
              )}
            />
            {hasLiveData
              ? `${isCurrent ? "Datos reales" : "Datos reales · actualización pendiente"} · ${monthLabel}`
              : "Configuración · todavía sin métricas"}
          </p>
          <span className="mb-3 block h-1 w-9 rounded-full bg-gradient-to-r from-[#3bff00] to-[#4242ff]" aria-hidden="true" />
          <h2 className="neo-section-title">
            Hola, <span className="neo-gradient-text">{nombre}</span>
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Tu panel de WiWO.ADS — lo que necesita atención, primero.
          </p>
        </div>
        {hasLiveData ? (
          <Button onClick={onOpenClientes} className="h-10 font-extrabold">
            Ver clientes
            <ArrowRight />
          </Button>
        ) : (
          <Button onClick={onOpenIntegrations} className="h-10 font-extrabold">
            Conectar una fuente
            <ArrowRight />
          </Button>
        )}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label={`Inversión · ${etiquetaPeriodo(performance)}`}
          value={formatCurrencyTotals(performance)}
          note={
            hasLiveData
              ? `Cobertura común hasta ${formatDataDate(performance.dataThrough)}`
              : "Se calculará al sincronizar una cuenta"
          }
          icon={CircleDollarSign}
        />
        <StatCard
          label="Cuentas con datos"
          value={`${performance.accountsWithData} / ${performance.selectedAccountCount}`}
          note={
            performance.selectedAccountCount
              ? "Cobertura de la selección activa"
              : "Aún no hay cuentas seleccionadas"
          }
          icon={HeartPulse}
          tone="cyan"
        />
        <StatCard
          label={`Clics · ${monthLabel}`}
          value={formatInteger(performance.clicks)}
          note={
            performance.impressions === null
              ? "Sin lectura disponible"
              : `${formatInteger(performance.impressions)} impresiones`
          }
          icon={Activity}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Surface className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-foreground/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-foreground">Estado de cartera</h3>
              <p className="mt-1 text-xs text-foreground/58">
                Solo cuentas seleccionadas · cifras desde las APIs oficiales
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="bg-card text-foreground/66"
              onClick={onOpenIntegrations}
            >
              <RefreshCw />
              Abrir cuentas
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-foreground/[0.03] hover:bg-foreground/[0.04]">
                <TableHead className="pl-4 text-xs text-foreground/58">
                  Cuenta
                </TableHead>
                <TableHead className="text-xs text-foreground/58">
                  Estado
                </TableHead>
                <TableHead className="text-xs text-foreground/58">Plataforma</TableHead>
                <TableHead className="text-right text-xs text-foreground/58">
                  Impresiones
                </TableHead>
                <TableHead className="text-right text-xs text-foreground/58">
                  Clics
                </TableHead>
                <TableHead className="text-right text-xs text-foreground/58">
                  Resultados
                </TableHead>
                <TableHead className="text-right text-xs text-foreground/58">
                  Inversión
                </TableHead>
                <TableHead className="pr-4 text-right text-xs text-foreground/58">
                  Frescura
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance.accounts.map((client) => (
                <TableRow
                  key={client.id}
                  className="h-16 bg-card hover:bg-foreground/[0.04]"
                >
                  <TableCell className="pl-4">
                    <button
                      onClick={() => {
                        // "Salud" ahora se elige por cliente, no por cuenta
                        // suelta: se resuelve a qué cliente pertenece esta
                        // cuenta y se abre ese, no la cuenta en sí.
                        const dueno = performance.portfolios.find((item) =>
                          item.accounts.some((a) => a.id === client.id),
                        );
                        if (dueno) onOpenHealth(dueno.id);
                      }}
                      className="text-left outline-none focus-visible:ring-2 focus-visible:ring-[#4242FF]"
                    >
                      <span className="block text-sm font-bold text-foreground">
                        {client.name}
                      </span>
                      <span className="mt-1 block text-xs text-foreground/45">
                        {client.currency ?? "Moneda no informada"}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <HealthBadge
                      state={performanceHealth(client, performance.generatedAt)}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-semibold text-foreground/74">
                      {platformLabel(client.provider)}
                    </span>
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-foreground/66">
                    {formatInteger(client.impressions)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-foreground/66">
                    {formatInteger(client.clicks)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-foreground/66">
                    {formatDecimal(client.conversions)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm font-bold text-foreground/82">
                    {formatMoney(client.spendMicros, client.currency)}
                  </TableCell>
                  <TableCell className="pr-4 text-right text-xs text-foreground/45">
                    {formatFreshness(
                      client.lastSyncedAt,
                      performance.generatedAt,
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {performance.accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-56 text-center">
                    <p className="text-sm font-bold text-foreground">
                      Aún no hay cuentas activas con métricas
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-foreground/58">
                      Conecta Google o Meta, selecciona una cuenta publicitaria y
                      WiWO.ADS hará la primera lectura automáticamente.
                    </p>
                    <Button className="mt-4" onClick={onOpenIntegrations}>
                      Abrir cuentas
                    </Button>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Surface>

        <div className="space-y-4">
          <Surface className="overflow-hidden">
            <div className="border-b border-foreground/10 px-4 py-4">
              <h3 className="font-bold text-foreground">Cobertura de datos</h3>
              <p className="mt-1 text-xs text-foreground/58">
                Estado real de las cuentas seleccionadas
              </p>
            </div>
            <div className="p-4">
              <p className="metric-number text-3xl font-extrabold text-foreground">
                {performance.accountsWithData}
                <span className="ml-1 text-base font-semibold text-foreground/45">
                  / {performance.selectedAccountCount}
                </span>
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground/66">
                {performance.selectedAccountCount === 0
                  ? "Selecciona las cuentas que WiWO.ADS debe leer."
                  : performance.accountsWithData === performance.selectedAccountCount
                    ? "Todas las cuentas seleccionadas tienen datos del mes."
                    : "Hay cuentas seleccionadas que todavía no entregan métricas."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full"
                onClick={onOpenIntegrations}
              >
                Revisar fuentes
              </Button>
            </div>
          </Surface>
          <Surface className="p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-brand/8 text-brand">
                <Activity className="size-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-foreground">
                  {hasLiveData
                    ? isCurrent
                      ? "Lectura operacional"
                      : "Lectura pendiente de actualización"
                    : "Modo preparación"}
                </p>
                <p className="mt-0.5 text-xs text-foreground/58">
                  {hasLiveData
                    ? `Última sincronización ${formatFreshness(performance.lastSyncedAt, performance.generatedAt)}`
                    : "No se muestran ceros ni proyecciones inventadas"}
                </p>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-foreground/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#4242FF] via-[#3BFF00] to-[#3BFF00]"
                style={{
                  width: `${performance.selectedAccountCount ? Math.round((performance.accountsWithData / performance.selectedAccountCount) * 100) : 0}%`,
                }}
              />
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}

export function HealthView({
  client,
  portfolios,
  onOpenIntegrations,
  checks,
  score,
  okCount,
  totalCount,
  critical,
  warnings,
}: {
  /**
   * Id de cliente, no de cuenta: la salud se mira por cliente. Viene del
   * selector del navbar — no tiene su propio selector acá adentro, para no
   * repetir la misma elección en dos lugares que podían desincronizarse.
   */
  client: string | null;
  portfolios: PortfolioSummary[];
  onOpenIntegrations: () => void;
  checks: HealthCheck[];
  score: number;
  okCount: number;
  totalCount: number;
  critical: number;
  warnings: number;
}) {
  const portfolio = portfolios.find((item) => item.id === client) ?? null;

  // Sin cliente elegido no hay nada que medir: antes el selector arrancaba
  // solo en una de sus cuentas de Windsor, elegida al azar, sin decir a qué
  // cliente pertenecía ni qué pasaba con sus otras cuentas.
  if (!portfolio) {
    return (
      <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
        <div className="mb-5">
          <p className="font-micro mb-3 inline-flex items-center gap-2 text-[0.62rem] text-foreground/50">
            <HeartPulse className="size-3 text-brand" />
            Salud por cliente
          </p>
          <h2 className="neo-section-title">
            Elige un cliente
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/58">
            Por cada una de sus cuentas se revisan dos cosas: si la conexión de
            lectura sigue autorizada y si los datos llegaron al día.
          </p>
        </div>
        <Surface className="flex flex-col items-center gap-2 p-10 text-center">
          <p className="text-sm leading-6 text-foreground/60">
            Usa el selector de cliente de la barra superior para elegir a
            quién revisar.
          </p>
          {portfolios.length === 0 && (
            <p className="max-w-sm text-sm leading-6 text-foreground/50">
              Todavía no hay clientes con cuentas conectadas.
            </p>
          )}
        </Surface>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-micro mb-3 inline-flex items-center gap-2 text-[0.62rem] text-foreground/50">
            <span
              className={cn(
                "size-2 rounded-full",
                checks.length > 0 && critical === 0 && warnings === 0
                  ? "bg-ok-deep"
                  : "bg-warn-deep",
              )}
            />
            Salud real de conexiones y frescura
          </p>
          <h2 className="neo-section-title">
            {portfolio.name}
          </h2>
          <p className="mt-2 max-w-xl text-xs leading-5 text-foreground/50">
            Por cada cuenta: ¿sigue autorizada la conexión? ¿los datos llegaron
            al día? Esto no mide el rendimiento de las campañas.
          </p>
        </div>
      </div>

      {/*
        Antes esto era una fila más en la tabla, repetida idéntica por cada
        cuenta: "Cambios automáticos · inactivo". Un valor que nunca cambia no
        es una verificación de nada — es una regla del sistema entero, y va
        acá, una sola vez.
      */}
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
        <p className="text-xs leading-5 text-foreground/60">
          Este sistema no ejecuta cambios automáticos en ninguna cuenta: crear,
          pausar o activar algo siempre pasa primero por Decisiones, con
          aprobación explícita.
        </p>
      </div>

      {critical > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-danger-deep/25 bg-danger-deep/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 size-5 shrink-0 text-danger-deep" />
            <div>
              <p className="text-sm font-bold text-danger">
                La fuente requiere atención
              </p>
              <p className="mt-1 text-sm leading-6 text-danger">
                Los últimos datos válidos se conservan como históricos, pero no
                se consideran actuales. Las automatizaciones siguen deshabilitadas.
              </p>
            </div>
          </div>
          <Button
            onClick={onOpenIntegrations}
            className="h-10 shrink-0 font-extrabold"
          >
            <RefreshCw />
            Revisar conexión
          </Button>
        </div>
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
        <Surface className="p-5">
          <div className="flex items-center justify-between gap-5">
            <div>
              <p className="text-sm font-medium text-foreground/58">
                Verificaciones en verde · {portfolio.name}
              </p>
              <p className="metric-number mt-2 text-4xl font-extrabold text-foreground">
                {okCount}
                <span className="ml-1 text-lg font-semibold text-foreground/45">
                  de {totalCount}
                </span>
              </p>
            </div>
            <div
              className="relative grid size-20 place-items-center rounded-full before:absolute before:inset-2 before:rounded-full before:bg-card"
              style={
                {
                  // Antes el tramo sin llenar era #E8EBF2 —gris casi blanco,
                  // pensado para una tarjeta clara— y quedaba como un arco
                  // brillante encima de esta tarjeta oscura.
                  background:
                    "conic-gradient(#4242FF " +
                    String(score) +
                    "%, rgba(248, 250, 215, 0.12) 0)",
                } as CSSProperties
              }
            >
              <span className="relative text-xs font-bold text-brand">
                {score}%
              </span>
            </div>
          </div>
        </Surface>
        <StatCard
          label="Fallos críticos"
          value={String(critical)}
          note={critical ? "Requieren acción inmediata" : "Sin bloqueos activos"}
          icon={AlertTriangle}
          tone="red"
        />
        <StatCard
          label="Advertencias"
          value={String(warnings)}
          note="Deben revisarse durante el día"
          icon={Activity}
          tone="cyan"
        />
      </div>

      <Surface className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-foreground/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-foreground">
              Estado de la última lectura
            </h3>
            <p className="mt-1 text-xs text-foreground/58">
              Nunca se muestra cero cuando una métrica no existe
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-card"
            onClick={onOpenIntegrations}
          >
            <RefreshCw />
            Revisar fuentes
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-foreground/[0.03] hover:bg-foreground/[0.04]">
              <TableHead className="pl-4 text-xs text-foreground/58">
                Cuenta
              </TableHead>
              <TableHead className="text-xs text-foreground/58">
                Verificación
              </TableHead>
              <TableHead className="text-xs text-foreground/58">
                Plataforma
              </TableHead>
              <TableHead className="text-xs text-foreground/58">Estado</TableHead>
              <TableHead className="text-xs text-foreground/58">Lectura</TableHead>
              <TableHead className="text-xs text-foreground/58">
                Responsable
              </TableHead>
              <TableHead className="pr-4 text-right text-xs text-foreground/58">
                Última revisión
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {checks.map((check) => (
              <TableRow
                key={check.account + "-" + check.check}
                className="h-16"
              >
                <TableCell className="pl-4 text-sm font-bold text-foreground">
                  {check.account}
                </TableCell>
                <TableCell className="text-sm text-foreground/82">
                  {check.check}
                </TableCell>
                <TableCell>
                  <span className="rounded-md bg-foreground/[0.07] px-2 py-1 text-xs font-semibold text-foreground/66">
                    {check.platform}
                  </span>
                </TableCell>
                <TableCell>
                  <HealthBadge state={check.state} />
                </TableCell>
                <TableCell
                  className={cn(
                    "text-sm",
                    check.state === "critical"
                      ? "font-semibold text-danger"
                      : "text-foreground/66",
                  )}
                >
                  {check.detail}
                </TableCell>
                <TableCell className="text-sm text-foreground/66">
                  {check.owner}
                </TableCell>
                <TableCell className="pr-4 text-right text-xs text-foreground/45">
                  {check.lastCheck}
                </TableCell>
              </TableRow>
            ))}
            {checks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center">
                  <p className="text-sm font-bold text-foreground">
                    No hay verificaciones disponibles
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-foreground/58">
                    Este cliente todavía no tiene cuentas con métricas
                    sincronizadas.
                  </p>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Surface>
    </div>
  );
}

function formatCurrencyTotals(performance: PerformanceSnapshot): string {
  return formatCurrencyList(performance.currencyTotals);
}

/**
 * Lista los totales por moneda.
 *
 * Hasta dos monedas se muestran completas; de ahí en más solo el conteo, que
 * es lo único honesto que cabe en una tarjeta. Nunca se suman entre sí.
 */
function formatCurrencyList(totals: CurrencyTotal[]): string {
  if (totals.length === 0) return "—";
  if (totals.length > 2) return `${totals.length} monedas`;
  return totals
    .map((total) => formatMoney(total.spendMicros, total.currency))
    .join(" · ");
}

function formatMoney(value: number | null, currency: string | null): string {
  if (value === null) return "—";
  if (!currency || currency === "N/D") {
    return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value / 1_000_000)} N/D`;
  }
  try {
    // Código y no símbolo: CLP, ARS y USD comparten "$", y con cuentas en
    // varias monedas un "$2.629.875" no dice si son pesos chilenos o argentinos.
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits: currency === "CLP" ? 0 : 2,
    }).format(value / 1_000_000);
  } catch {
    return `${currency} ${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value / 1_000_000)}`;
  }
}

function formatInteger(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("es-CL").format(value);
}

function formatDecimal(value: number | null): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(value);
}

function formatFreshness(value: number | null, referenceTime: number): string {
  if (!value) return "Sin lectura";
  const minutes = Math.max(0, Math.floor((referenceTime - value) / 60_000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

/**
 * Cómo se nombra el periodo en pantalla.
 *
 * Un rango de mes se nombra por su mes —"septiembre de 2026" dice más que
 * "mes en curso"—, pero los demás **no**: con "últimos 90 días" el mes del
 * último día sería una etiqueta falsa, porque el periodo arranca tres meses
 * antes. Ahí se usa el nombre del rango.
 */
function etiquetaPeriodo(performance: PerformanceSnapshot): string {
  const id = performance.rango?.id;
  if (!id || id === "mes_actual" || id === "mes_anterior") {
    return formatMonth(performance.rangeEnd);
  }
  return performance.rango.label;
}

function formatMonth(value: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatDataDate(value: string | null): string {
  if (!value) return "sin fecha";
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function performanceHealth(
  account: PerformanceAccountSummary,
  referenceTime: number,
): HealthState {
  if (
    account.connectionStatus === "needs_attention" ||
    account.metricsStatus === "error" ||
    account.issue
  ) {
    return "critical";
  }
  if (!account.hasData || !account.lastSyncedAt) return "warning";
  return referenceTime - account.lastSyncedAt > 26 * 60 * 60 * 1000
    ? "warning"
    : "healthy";
}


