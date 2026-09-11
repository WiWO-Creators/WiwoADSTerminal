"use client";

import { useState, type CSSProperties } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  CircleDollarSign,
  FileChartColumnIncreasing,
  Gauge,
  HeartPulse,
  Inbox,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OBJETIVO_CORTO } from "@/lib/objetivos";
import { platformLabel } from "@/lib/plataformas";
import type { PortfolioSummary } from "@/lib/portafolios";
import { cn } from "@/lib/utils";
import type {
  CampaignSummary,
  CurrencyTotal,
  ObjectiveTotal,
  PerformanceAccountSummary,
  PerformanceSnapshot,
  ProviderTotal,
} from "@/lib/performance-store";
import type { AuditEvent, HealthCheck, HealthState } from "./data";
import {
  HealthBadge,
  StatCard,
  Surface,
} from "./ui";

export function ControlRoomView({
  pending,
  performance,
  onOpenQueue,
  onOpenHealth,
  onOpenIntegrations,
}: {
  pending: number;
  performance: PerformanceSnapshot;
  onOpenQueue: () => void;
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
          <p className="font-micro mb-3 inline-flex items-center gap-2 rounded-full border border-[#F8FAD7]/10 bg-[#323330]/55 px-3 py-1.5 text-[0.62rem] text-[#F8FAD7]/60 shadow-sm backdrop-blur-md">
            <span
              className={cn(
                "size-2 rounded-full",
                isCurrent ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            {hasLiveData
              ? `${isCurrent ? "Datos reales" : "Datos reales · actualización pendiente"} · ${monthLabel}`
              : "Configuración · todavía sin métricas"}
          </p>
          <h2 className="font-editorial text-3xl leading-[0.98] tracking-[-0.035em] text-[#F8FAD7] md:text-[2.8rem]">
            Lo que necesita atención, primero
          </h2>
        </div>
        {hasLiveData ? (
          <Button onClick={onOpenQueue} className="h-10 font-extrabold">
            Abrir cola
            <ArrowRight />
          </Button>
        ) : (
          <Button onClick={onOpenIntegrations} className="h-10 font-extrabold">
            Conectar una fuente
            <ArrowRight />
          </Button>
        )}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          label="Decisiones abiertas"
          value={String(pending)}
          note="Solo lectura · no ejecuta cambios"
          icon={Inbox}
          tone="red"
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
          <div className="flex flex-col gap-3 border-b border-[#F8FAD7]/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-[#F8FAD7]">Estado de cartera</h3>
              <p className="mt-1 text-xs text-[#F8FAD7]/58">
                Solo cuentas seleccionadas · cifras desde las APIs oficiales
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="bg-[#323330] text-[#F8FAD7]/66"
              onClick={onOpenIntegrations}
            >
              <RefreshCw />
              Abrir cuentas
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F8FAD7]/[0.03] hover:bg-[#F8FAD7]/[0.04]">
                <TableHead className="pl-4 text-xs text-[#F8FAD7]/58">
                  Cuenta
                </TableHead>
                <TableHead className="text-xs text-[#F8FAD7]/58">
                  Estado
                </TableHead>
                <TableHead className="text-xs text-[#F8FAD7]/58">Plataforma</TableHead>
                <TableHead className="text-right text-xs text-[#F8FAD7]/58">
                  Impresiones
                </TableHead>
                <TableHead className="text-right text-xs text-[#F8FAD7]/58">
                  Clics
                </TableHead>
                <TableHead className="text-right text-xs text-[#F8FAD7]/58">
                  Resultados
                </TableHead>
                <TableHead className="text-right text-xs text-[#F8FAD7]/58">
                  Inversión
                </TableHead>
                <TableHead className="pr-4 text-right text-xs text-[#F8FAD7]/58">
                  Frescura
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance.accounts.map((client) => (
                <TableRow
                  key={client.id}
                  className="h-16 bg-[#323330] hover:bg-[#F8FAD7]/[0.04]"
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
                      <span className="block text-sm font-bold text-[#F8FAD7]">
                        {client.name}
                      </span>
                      <span className="mt-1 block text-xs text-[#F8FAD7]/45">
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
                    <span className="text-sm font-semibold text-[#F8FAD7]/74">
                      {platformLabel(client.provider)}
                    </span>
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-[#F8FAD7]/66">
                    {formatInteger(client.impressions)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-[#F8FAD7]/66">
                    {formatInteger(client.clicks)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-[#F8FAD7]/66">
                    {formatDecimal(client.conversions)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm font-bold text-[#F8FAD7]/82">
                    {formatMoney(client.spendMicros, client.currency)}
                  </TableCell>
                  <TableCell className="pr-4 text-right text-xs text-[#F8FAD7]/45">
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
                    <p className="text-sm font-bold text-[#F8FAD7]">
                      Aún no hay cuentas activas con métricas
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#F8FAD7]/58">
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
            <div className="border-b border-[#F8FAD7]/10 px-4 py-4">
              <h3 className="font-bold text-[#F8FAD7]">Cobertura de datos</h3>
              <p className="mt-1 text-xs text-[#F8FAD7]/58">
                Estado real de las cuentas seleccionadas
              </p>
            </div>
            <div className="p-4">
              <p className="metric-number text-3xl font-extrabold text-[#F8FAD7]">
                {performance.accountsWithData}
                <span className="ml-1 text-base font-semibold text-[#F8FAD7]/45">
                  / {performance.selectedAccountCount}
                </span>
              </p>
              <p className="mt-2 text-sm leading-6 text-[#F8FAD7]/66">
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
              <span className="grid size-10 place-items-center rounded-xl bg-[#4242FF]/8 text-[#4242FF]">
                <Activity className="size-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#F8FAD7]">
                  {hasLiveData
                    ? isCurrent
                      ? "Lectura operacional"
                      : "Lectura pendiente de actualización"
                    : "Modo preparación"}
                </p>
                <p className="mt-0.5 text-xs text-[#F8FAD7]/58">
                  {hasLiveData
                    ? `Última sincronización ${formatFreshness(performance.lastSyncedAt, performance.generatedAt)}`
                    : "No se muestran ceros ni proyecciones inventadas"}
                </p>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#F8FAD7]/[0.07]">
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
  onClient,
  portfolios,
  onOpenIntegrations,
  checks,
  score,
  okCount,
  totalCount,
  critical,
  warnings,
}: {
  /** Id de cliente, no de cuenta: la salud se mira por cliente. */
  client: string;
  onClient: (value: string) => void;
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
          <p className="font-micro mb-3 inline-flex items-center gap-2 rounded-full border border-[#F8FAD7]/10 bg-[#323330]/55 px-3 py-1.5 text-[0.62rem] text-[#F8FAD7]/60 shadow-sm backdrop-blur-md">
            <HeartPulse className="size-3 text-[#4242FF]" />
            Salud por cliente
          </p>
          <h2 className="font-editorial text-3xl leading-[0.98] tracking-[-0.035em] text-[#F8FAD7] md:text-[2.8rem]">
            Elige un cliente
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#F8FAD7]/58">
            Por cada una de sus cuentas se revisan dos cosas: si la conexión de
            lectura sigue autorizada y si los datos llegaron al día. No mide
            qué tan bien rinde una campaña — eso está en Inversión.
          </p>
        </div>
        <Surface className="flex flex-col items-center gap-4 p-10 text-center">
          <Select
            value={client || undefined}
            onValueChange={onClient}
            disabled={portfolios.length === 0}
          >
            <SelectTrigger
              aria-label="Seleccionar cliente para revisar su salud"
              className="w-full bg-[#323330]/65 sm:w-72"
            >
              <SelectValue placeholder="Selecciona un cliente" />
            </SelectTrigger>
            <SelectContent>
              {portfolios.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {portfolios.length === 0 && (
            <p className="max-w-sm text-sm leading-6 text-[#F8FAD7]/50">
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
          <p className="font-micro mb-3 inline-flex items-center gap-2 rounded-full border border-[#F8FAD7]/10 bg-[#323330]/55 px-3 py-1.5 text-[0.62rem] text-[#F8FAD7]/60 shadow-sm backdrop-blur-md">
            <span
              className={cn(
                "size-2 rounded-full",
                checks.length > 0 && critical === 0 && warnings === 0
                  ? "bg-emerald-500"
                  : "bg-amber-500",
              )}
            />
            Salud real de conexiones y frescura
          </p>
          <h2 className="font-editorial text-3xl leading-[0.98] tracking-[-0.035em] text-[#F8FAD7] md:text-[2.8rem]">
            {portfolio.name}
          </h2>
          <p className="mt-2 max-w-xl text-xs leading-5 text-[#F8FAD7]/50">
            Por cada cuenta: ¿sigue autorizada la conexión? ¿los datos llegaron
            al día? Esto no mide el rendimiento de las campañas.
          </p>
        </div>
        <Select value={client} onValueChange={onClient}>
          <SelectTrigger
            aria-label="Seleccionar cliente para revisar su salud"
            className="h-10 w-full bg-[#323330]/65 md:w-56"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {portfolios.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/*
        Antes esto era una fila más en la tabla, repetida idéntica por cada
        cuenta: "Cambios automáticos · inactivo". Un valor que nunca cambia no
        es una verificación de nada — es una regla del sistema entero, y va
        acá, una sola vez.
      */}
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#F8FAD7]/10 bg-[#F8FAD7]/[0.03] px-4 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#3BFF00]" />
        <p className="text-xs leading-5 text-[#F8FAD7]/60">
          Este sistema no ejecuta cambios automáticos en ninguna cuenta: crear,
          pausar o activar algo siempre pasa primero por Decisiones, con
          aprobación explícita.
        </p>
      </div>

      {critical > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 size-5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-bold text-red-200">
                La fuente requiere atención
              </p>
              <p className="mt-1 text-sm leading-6 text-red-300">
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
              <p className="text-sm font-medium text-[#F8FAD7]/58">
                Verificaciones en verde · {portfolio.name}
              </p>
              <p className="metric-number mt-2 text-4xl font-extrabold text-[#F8FAD7]">
                {okCount}
                <span className="ml-1 text-lg font-semibold text-[#F8FAD7]/45">
                  de {totalCount}
                </span>
              </p>
            </div>
            <div
              className="relative grid size-20 place-items-center rounded-full before:absolute before:inset-2 before:rounded-full before:bg-[#323330]"
              style={
                {
                  background:
                    "conic-gradient(#4242FF " +
                    String(score) +
                    "%, #E8EBF2 0)",
                } as CSSProperties
              }
            >
              <span className="relative text-xs font-bold text-[#4242FF]">
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
        <div className="flex flex-col gap-3 border-b border-[#F8FAD7]/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-[#F8FAD7]">
              Estado de la última lectura
            </h3>
            <p className="mt-1 text-xs text-[#F8FAD7]/58">
              Nunca se muestra cero cuando una métrica no existe
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-[#323330]"
            onClick={onOpenIntegrations}
          >
            <RefreshCw />
            Revisar fuentes
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F8FAD7]/[0.03] hover:bg-[#F8FAD7]/[0.04]">
              <TableHead className="pl-4 text-xs text-[#F8FAD7]/58">
                Cuenta
              </TableHead>
              <TableHead className="text-xs text-[#F8FAD7]/58">
                Verificación
              </TableHead>
              <TableHead className="text-xs text-[#F8FAD7]/58">
                Plataforma
              </TableHead>
              <TableHead className="text-xs text-[#F8FAD7]/58">Estado</TableHead>
              <TableHead className="text-xs text-[#F8FAD7]/58">Lectura</TableHead>
              <TableHead className="text-xs text-[#F8FAD7]/58">
                Responsable
              </TableHead>
              <TableHead className="pr-4 text-right text-xs text-[#F8FAD7]/58">
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
                <TableCell className="pl-4 text-sm font-bold text-[#F8FAD7]">
                  {check.account}
                </TableCell>
                <TableCell className="text-sm text-[#F8FAD7]/82">
                  {check.check}
                </TableCell>
                <TableCell>
                  <span className="rounded-md bg-[#F8FAD7]/[0.07] px-2 py-1 text-xs font-semibold text-[#F8FAD7]/66">
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
                      ? "font-semibold text-red-300"
                      : "text-[#F8FAD7]/66",
                  )}
                >
                  {check.detail}
                </TableCell>
                <TableCell className="text-sm text-[#F8FAD7]/66">
                  {check.owner}
                </TableCell>
                <TableCell className="pr-4 text-right text-xs text-[#F8FAD7]/45">
                  {check.lastCheck}
                </TableCell>
              </TableRow>
            ))}
            {checks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center">
                  <p className="text-sm font-bold text-[#F8FAD7]">
                    No hay verificaciones disponibles
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#F8FAD7]/58">
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

export function PacingView({
  performance,
  onOpenIntegrations,
}: {
  performance: PerformanceSnapshot;
  onOpenIntegrations: () => void;
}) {
  // Sin cliente elegido, no hay vista: antes el total mezclaba la inversión de
  // clientes en monedas distintas bajo un solo número, que es exactamente lo
  // que esta pantalla dice no hacer. Ahora hay que elegir uno primero.
  const [portfolioId, setPortfolioId] = useState("");
  const portfolio =
    performance.portfolios.find((item) => item.id === portfolioId) ?? null;

  if (!portfolio) {
    return (
      <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
        <div className="mb-5">
          <p className="font-micro mb-3 inline-flex items-center gap-2 rounded-full border border-[#F8FAD7]/10 bg-[#323330]/55 px-3 py-1.5 text-[0.62rem] text-[#F8FAD7]/60 shadow-sm backdrop-blur-md">
            <CircleDollarSign className="size-3 text-[#4242FF]" />
            Inversión por cliente
          </p>
          <h2 className="font-editorial text-3xl leading-[0.98] tracking-[-0.035em] text-[#F8FAD7] md:text-[2.8rem]">
            Elige un cliente
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#F8FAD7]/58">
            La inversión se mira cliente por cliente, nunca sumada entre
            todos: cada uno factura en su propia moneda, y mezclarlas daría un
            total que no significa nada.
          </p>
        </div>
        <Surface className="flex flex-col items-center gap-4 p-10 text-center">
          <Select value={portfolioId} onValueChange={setPortfolioId}>
            <SelectTrigger className="w-full bg-[#323330]/65 sm:w-72">
              <SelectValue placeholder="Selecciona un cliente" />
            </SelectTrigger>
            <SelectContent>
              {performance.portfolios.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {performance.portfolios.length === 0 && (
            <p className="max-w-sm text-sm leading-6 text-[#F8FAD7]/50">
              Todavía no hay clientes con cuentas conectadas.
            </p>
          )}
        </Surface>
      </div>
    );
  }

  const scope = portfolio;
  const scopeAccountKeys = new Set(scope.accounts.map((item) => item.id));
  const campaigns = performance.campaigns.filter((item) =>
    scopeAccountKeys.has(item.accountKey),
  );
  const objetivos = performance.byObjective.filter((item) =>
    campaigns.some((c) => c.objetivo === item.objetivo),
  );
  const sinSigla = campaigns.filter((item) => !item.objetivo).length;
  const hasLiveData = scope.accountsWithData > 0;
  const isCurrent = performance.mode === "live";
  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-micro mb-3 inline-flex items-center gap-2 rounded-full border border-[#F8FAD7]/10 bg-[#323330]/55 px-3 py-1.5 text-[0.62rem] text-[#F8FAD7]/60 shadow-sm backdrop-blur-md">
            <span
              className={cn(
                "size-2 rounded-full",
                isCurrent ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            {hasLiveData
              ? `${isCurrent ? "Inversión real" : "Inversión real · actualización pendiente"} · ${etiquetaPeriodo(performance)}`
              : "Sin datos de inversión"}
          </p>
          <h2 className="font-editorial text-3xl leading-[0.98] tracking-[-0.035em] text-[#F8FAD7] md:text-[2.8rem]">
            {portfolio.name}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={portfolioId} onValueChange={setPortfolioId}>
            <SelectTrigger className="w-full bg-[#323330]/65 sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {performance.portfolios.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={onOpenIntegrations} className="h-10 font-extrabold">
            Abrir cuentas
            <ArrowRight />
          </Button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Inversión · ${etiquetaPeriodo(performance)}`}
          value={formatCurrencyList(scope.currencyTotals)}
          note="Agrupada por moneda de cuenta"
          icon={CircleDollarSign}
        />
        <StatCard
          label="Cuentas con datos"
          value={String(scope.accountsWithData)}
          note={`${portfolio.accountCount} en el portafolio`}
          icon={Gauge}
          tone="cyan"
        />
        <StatCard
          label="Clics"
          value={formatInteger(scope.clicks)}
          note={`${formatInteger(scope.impressions)} impresiones`}
          icon={Activity}
        />
        <StatCard
          label="Campañas"
          value={String(campaigns.length)}
          note={
            objetivos.length
              ? `${objetivos.length} objetivos · el resultado de cada uno, abajo`
              : "Sin campañas con datos"
          }
          icon={BadgeCheck}
        />
      </div>

      <PlatformComparison byProvider={scope.byProvider} />

      <ObjectiveBreakdown objetivos={objetivos} sinSigla={sinSigla} />

      <CampaignTable campaigns={campaigns} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Surface className="overflow-hidden">
          <div className="border-b border-[#F8FAD7]/10 px-4 py-4">
            <h3 className="font-bold text-[#F8FAD7]">Lectura por cuenta</h3>
            <p className="mt-1 text-xs text-[#F8FAD7]/58">
              Mes en curso · datos informados por cada plataforma
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F8FAD7]/[0.03] hover:bg-[#F8FAD7]/[0.04]">
                <TableHead className="pl-4 text-xs text-[#F8FAD7]/58">
                  Cuenta
                </TableHead>
                <TableHead className="text-right text-xs text-[#F8FAD7]/58">
                  Invertido
                </TableHead>
                <TableHead className="text-right text-xs text-[#F8FAD7]/58">
                  Impresiones
                </TableHead>
                <TableHead className="text-right text-xs text-[#F8FAD7]/58">
                  Clics
                </TableHead>
                <TableHead className="pr-4 text-right text-xs text-[#F8FAD7]/58">
                  Resultados
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scope.accounts.map((row) => (
                <TableRow key={row.id} className="h-16">
                  <TableCell className="pl-4 text-sm font-bold text-[#F8FAD7]">
                    <span className="block">{row.name}</span>
                    <span className="mt-1 block text-xs font-medium text-[#F8FAD7]/45">
                      {platformLabel(row.provider)}
                    </span>
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-[#F8FAD7]/66">
                    {formatMoney(row.spendMicros, row.currency)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-[#F8FAD7]/66">
                    {formatInteger(row.impressions)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm font-bold text-[#F8FAD7]/82">
                    {formatInteger(row.clicks)}
                  </TableCell>
                  <TableCell className="metric-number pr-4 text-right text-sm font-bold text-[#F8FAD7]/82">
                    {formatDecimal(row.conversions)}
                  </TableCell>
                </TableRow>
              ))}
              {performance.accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center">
                    <p className="text-sm font-bold text-[#F8FAD7]">
                      No hay inversión disponible
                    </p>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#F8FAD7]/58">
                      Activa y sincroniza una cuenta publicitaria para reemplazar
                      esta vista por cifras reales.
                    </p>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Surface>

        <div className="space-y-4">
          <Surface className="overflow-hidden">
            <div className="border-b border-[#F8FAD7]/10 px-4 py-4">
              <h3 className="font-bold text-[#F8FAD7]">Pacing contractual</h3>
              <p className="mt-1 text-xs text-[#F8FAD7]/58">
                Siguiente capa de configuración
              </p>
            </div>
            <div className="p-4">
              <div className="rounded-lg bg-[#F8FAD7]/[0.03] p-3">
                <p className="text-xs font-semibold text-[#F8FAD7]/74">
                  Sin presupuesto configurado
                </p>
                <p className="mt-1 text-sm leading-6 text-[#F8FAD7]/66">
                  WiWO.ADS ya puede leer inversión real. Para calcular pacing y
                  proyección necesita el presupuesto mensual autorizado de cada
                  cuenta; hasta entonces no inventará una meta.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full"
                onClick={onOpenIntegrations}
              >
                Administrar cuentas
              </Button>
            </div>
          </Surface>
          <Surface className="p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-[#4242FF] text-[#292929]">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#F8FAD7]">
                  Operación protegida
                </p>
                <p className="mt-0.5 text-xs text-[#F8FAD7]/58">
                  Lectura únicamente · sin cambios automáticos
                </p>
              </div>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}

export function AuditView({ events }: { events: AuditEvent[] }) {
  const [query, setQuery] = useState("");
  const filteredEvents = events.filter((event) =>
    (event.user + " " + event.action + " " + event.client + " " + event.origin)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const approved = events.filter(
    (event) => event.eventType === "approved",
  ).length;
  const reopened = events.filter(
    (event) => event.eventType === "reopened",
  ).length;

  function exportCsv() {
    const columns = ["Fecha", "Usuario", "Acción", "Cliente", "Origen", "Resultado"];
    const rows = filteredEvents.map((event) => [
      event.time,
      event.user,
      event.action,
      event.client,
      event.origin,
      event.result,
    ]);
    const csv = [columns, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wiwo-ads-bitacora-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Bitácora exportada", {
      description: `${rows.length} eventos incluidos en el CSV.`,
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-micro mb-3 inline-flex items-center gap-2 rounded-full border border-[#F8FAD7]/10 bg-[#323330]/55 px-3 py-1.5 text-[0.62rem] text-[#F8FAD7]/60 shadow-sm backdrop-blur-md">
            <span className="size-2 rounded-full bg-[#4242FF]" />
            Bitácora persistente · acciones registradas
          </p>
          <h2 className="font-editorial text-3xl leading-[0.98] tracking-[-0.035em] text-[#F8FAD7] md:text-[2.8rem]">
            El sistema recuerda
          </h2>
        </div>
        <Button
          variant="outline"
          className="h-10 bg-[#323330]"
          onClick={exportCsv}
        >
          <FileChartColumnIncreasing />
          Exportar registro
        </Button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Eventos guardados"
          value={String(events.length)}
          note="Persisten entre sesiones y recargas"
          icon={BadgeCheck}
        />
        <StatCard
          label="Firmas registradas"
          value={String(approved)}
          note="Atribuidas al usuario autenticado"
          icon={CheckCircle2}
          tone="cyan"
        />
        <StatCard
          label="Reversiones"
          value={String(reopened)}
          note="Sin eliminar el historial anterior"
          icon={Undo2}
          tone="red"
        />
      </div>

      <Surface className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#F8FAD7]/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-[#F8FAD7]">Actividad reciente</h3>
            <p className="mt-1 text-xs text-[#F8FAD7]/58">
              Cada decisión conserva responsable, origen y resultado
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#F8FAD7]/45" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar en la bitácora"
              className="h-9 w-full bg-[#323330] pl-9 sm:w-64"
            />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F8FAD7]/[0.03] hover:bg-[#F8FAD7]/[0.04]">
              <TableHead className="pl-4 text-xs text-[#F8FAD7]/58">
                Fecha
              </TableHead>
              <TableHead className="text-xs text-[#F8FAD7]/58">Usuario</TableHead>
              <TableHead className="text-xs text-[#F8FAD7]/58">Acción</TableHead>
              <TableHead className="text-xs text-[#F8FAD7]/58">Cliente</TableHead>
              <TableHead className="text-xs text-[#F8FAD7]/58">Origen</TableHead>
              <TableHead className="pr-4 text-right text-xs text-[#F8FAD7]/58">
                Resultado
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEvents.map((event) => (
              <TableRow key={event.id} className="h-16">
                <TableCell className="pl-4">
                  <span className="block text-sm font-semibold text-[#F8FAD7]/74">
                    {event.time}
                  </span>
                  <span className="mt-1 block text-[0.68rem] text-[#F8FAD7]/45">
                    {event.id}
                  </span>
                  <span className="mt-1.5 inline-flex rounded-full bg-[#4242FF]/8 px-2 py-0.5 text-[0.62rem] font-bold text-[#4242FF]">
                    Acción registrada
                  </span>
                </TableCell>
                <TableCell className="text-sm font-semibold text-[#F8FAD7]/82">
                  {event.user}
                </TableCell>
                <TableCell className="max-w-[280px] whitespace-normal text-sm font-medium leading-5 text-[#F8FAD7]/74">
                  {event.action}
                </TableCell>
                <TableCell className="text-sm text-[#F8FAD7]/66">
                  {event.client}
                </TableCell>
                <TableCell className="text-xs text-[#F8FAD7]/58">
                  {event.origin}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                      event.result.includes("Ejecut")
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-[#F8FAD7]/[0.07] text-[#F8FAD7]/66",
                    )}
                  >
                    {event.result.includes("Ejecut") && (
                      <Check className="size-3" />
                    )}
                    {event.result}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filteredEvents.length === 0 && (
          <div className="flex min-h-44 flex-col items-center justify-center p-6 text-center">
            <Search className="mb-3 size-6 text-[#F8FAD7]/38" />
            <p className="text-sm font-bold text-[#F8FAD7]/74">
              No encontramos registros
            </p>
            <p className="mt-1 text-xs text-[#F8FAD7]/45">
              Prueba con otro cliente, usuario o acción.
            </p>
          </div>
        )}
      </Surface>
    </div>
  );
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
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

/**
 * Comparativa entre plataformas: dónde está el dinero y qué rinde cada una.
 *
 * Dos reglas que sostienen la lectura: el gasto nunca se suma entre monedas
 * distintas, y un costo derivado solo aparece si su denominador existe. Un
 * CPC de 0 se leería como "gratis" y sería mentira.
 */
function PlatformComparison({
  byProvider,
}: {
  byProvider: ProviderTotal[];
}) {
  const providers = byProvider;
  if (providers.length === 0) return null;

  const currencies = new Set(
    providers.flatMap((provider) =>
      provider.currencyTotals.map((total) => total.currency),
    ),
  );
  const comparable = currencies.size === 1;
  const totalSpend = comparable
    ? providers.reduce(
        (sum, provider) => sum + (provider.currencyTotals[0]?.spendMicros ?? 0),
        0,
      )
    : 0;

  return (
    <Surface className="mb-4 overflow-hidden">
      <div className="border-b border-[#F8FAD7]/10 px-4 py-4">
        <h3 className="font-bold text-[#F8FAD7]">Comparativa por plataforma</h3>
        <p className="mt-1 text-xs text-[#F8FAD7]/58">
          {comparable
            ? "Mes en curso · misma moneda, comparables entre sí"
            : "Mes en curso · monedas distintas, no se comparan directamente"}
        </p>
      </div>
      <div className="grid gap-px bg-[#F8FAD7]/12 sm:grid-cols-2">
        {providers.map((provider) => {
          const single =
            provider.currencyTotals.length === 1
              ? provider.currencyTotals[0]
              : null;
          const share =
            comparable && totalSpend > 0 && single
              ? (single.spendMicros / totalSpend) * 100
              : null;
          const cpc = ratio(single?.spendMicros ?? null, provider.clicks);
          const cpa = ratio(single?.spendMicros ?? null, provider.conversions);

          return (
            <div key={provider.provider} className="bg-[#323330]/60 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-[#F8FAD7]">
                  {provider.label}
                </span>
                <span className="text-xs font-medium text-[#F8FAD7]/45">
                  {provider.accountsWithData} de {provider.accountCount}{" "}
                  {provider.accountCount === 1 ? "cuenta" : "cuentas"}
                </span>
              </div>

              {provider.accountsWithData === 0 ? (
                <p className="mt-3 text-sm text-[#F8FAD7]/45">
                  Todavía sin métricas sincronizadas
                </p>
              ) : (
                <>
                  <div className="metric-number mt-2 text-2xl font-bold text-[#F8FAD7]">
                    {provider.currencyTotals
                      .map((total) =>
                        formatMoney(total.spendMicros, total.currency),
                      )
                      .join(" · ")}
                  </div>
                  {share !== null && (
                    <div className="mt-2">
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#F8FAD7]/[0.07]">
                        <div
                          className="h-full rounded-full bg-[#4242FF]"
                          style={{ width: `${share.toFixed(1)}%` }}
                        />
                      </div>
                      <span className="mt-1 block text-xs text-[#F8FAD7]/58">
                        {share.toFixed(1)}% de la inversión
                      </span>
                    </div>
                  )}
                  <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs">
                    <PlatformFact
                      label="Impresiones"
                      value={formatInteger(provider.impressions)}
                    />
                    <PlatformFact
                      label="Clics"
                      value={formatInteger(provider.clicks)}
                    />
                    <PlatformFact
                      label="Resultados"
                      value={
                        provider.conversions === null
                          ? "Según objetivo"
                          : formatDecimal(provider.conversions)
                      }
                    />
                    <PlatformFact
                      label="CPC"
                      value={derived(cpc, single?.currency ?? null, !single)}
                    />
                    <PlatformFact
                      label="Costo por resultado"
                      value={derived(cpa, single?.currency ?? null, !single)}
                    />
                  </dl>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Surface>
  );
}

function PlatformFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[#F8FAD7]/45">{label}</dt>
      <dd className="metric-number font-bold text-[#F8FAD7]/82">{value}</dd>
    </div>
  );
}

/**
 * Un costo derivado sin moneda única no se puede promediar: mezclar CLP con
 * USD daría un número sin significado. Se dice eso, no "sin dato".
 */
function derived(
  value: number | null,
  currency: string | null,
  multiCurrency: boolean,
): string {
  if (multiCurrency) return "Varias monedas";
  return value === null ? "Sin dato" : formatMoney(value, currency);
}

/** Divide solo si el denominador existe y no es cero. Si no, no hay dato. */
function ratio(numerator: number | null, denominator: number | null) {
  if (numerator === null || !denominator) return null;
  return numerator / denominator;
}

/**
 * Campañas de Google Ads y Meta en una sola tabla, ordenadas por inversión.
 *
 * Las cifras vienen agregadas del mes; no hay serie diaria por campaña porque
 * pedirla multiplicaría la respuesta por treinta sin agregar información a esta
 * lectura.
 */
function CampaignTable({ campaigns }: { campaigns: CampaignSummary[] }) {
  const [soloActivas, setSoloActivas] = useState(false);
  const visibles = soloActivas
    ? campaigns.filter((item) => isActive(item.status))
    : campaigns;

  return (
    <Surface className="mb-4 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#F8FAD7]/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-[#F8FAD7]">Campañas</h3>
          <p className="mt-1 text-xs text-[#F8FAD7]/58">
            Mes en curso · Google Ads y Meta juntos, ordenadas por inversión
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSoloActivas((value) => !value)}
          className="shrink-0 border-[#F8FAD7]/12 bg-transparent text-[#F8FAD7]/70"
        >
          {soloActivas ? "Ver todas" : "Solo activas"}
        </Button>
      </div>

      {visibles.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-[#F8FAD7]/45">
          {campaigns.length === 0
            ? "Sin campañas con datos en el rango."
            : "Ninguna campaña activa con los filtros actuales."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F8FAD7]/[0.03] hover:bg-[#F8FAD7]/[0.04]">
                <TableHead className="pl-4 text-xs text-[#F8FAD7]/58">
                  Campaña
                </TableHead>
                <TableHead className="text-xs text-[#F8FAD7]/58">
                  Objetivo
                </TableHead>
                <TableHead className="text-xs text-[#F8FAD7]/58">Estado</TableHead>
                <TableHead className="text-right text-xs text-[#F8FAD7]/58">
                  Invertido
                </TableHead>
                <TableHead className="text-right text-xs text-[#F8FAD7]/58">
                  Impresiones
                </TableHead>
                <TableHead className="text-right text-xs text-[#F8FAD7]/58">
                  Clics
                </TableHead>
                <TableHead className="pr-4 text-right text-xs text-[#F8FAD7]/58">
                  Resultados
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((item) => (
                <TableRow
                  key={`${item.accountKey}:${item.name}`}
                  className="h-16 bg-[#323330] hover:bg-[#F8FAD7]/[0.04]"
                >
                  <TableCell className="pl-4">
                    <span className="block max-w-[340px] truncate text-sm font-bold text-[#F8FAD7]">
                      {item.name}
                    </span>
                    <span className="mt-1 block text-xs text-[#F8FAD7]/45">
                      {platformLabel(item.provider)} ·{" "}
                      {item.accountName}
                    </span>
                  </TableCell>
                  <TableCell>
                    {item.objetivo ? (
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[0.62rem] font-bold",
                          item.objetivoDeducido
                            ? "bg-amber-500/12 text-amber-300"
                            : "bg-[#4242FF]/12 text-[#4242FF]",
                        )}
                        title={
                          item.objetivoDeducido
                            ? "Deducido del objetivo de la plataforma: falta la sigla en el nombre"
                            : `Sigla [${item.objetivo}] en el nombre`
                        }
                      >
                        {OBJETIVO_CORTO[item.objetivo]}
                        {item.objetivoDeducido ? " ?" : ""}
                      </span>
                    ) : (
                      <span
                        className="text-[0.62rem] text-[#F8FAD7]/38"
                        title="La campaña no sigue la convención [SIGLA] Cliente · Plataforma · Detalle"
                      >
                        Sin sigla
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[0.62rem] font-bold",
                        isActive(item.status)
                          ? "bg-emerald-500/12 text-emerald-300"
                          : "bg-[#F8FAD7]/8 text-[#F8FAD7]/50",
                      )}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm font-bold text-[#F8FAD7]/82">
                    {formatMoney(item.spendMicros, item.currency)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-[#F8FAD7]/66">
                    {formatInteger(item.impressions)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-[#F8FAD7]/66">
                    {formatInteger(item.clicks)}
                  </TableCell>
                  <TableCell className="metric-number pr-4 text-right text-sm font-bold text-[#F8FAD7]/82">
                    {formatDecimal(item.conversions)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Surface>
  );
}

/** Cada plataforma nombra distinto lo mismo: activa es activa en ambas. */
function isActive(status: string | null): boolean {
  const value = (status ?? "").toUpperCase();
  return value === "ENABLED" || value === "ACTIVE";
}

function statusLabel(status: string | null): string {
  const value = (status ?? "").toUpperCase();
  if (value === "ENABLED" || value === "ACTIVE") return "Activa";
  if (value === "PAUSED" || value === "CAMPAIGN_PAUSED") return "Pausada";
  if (value === "REMOVED" || value === "DELETED" || value === "ARCHIVED") {
    return "Eliminada";
  }
  return status ? status.toLowerCase() : "Sin estado";
}


/**
 * Resultados por objetivo de negocio.
 *
 * Cada familia se mide con su propia métrica: no existe un "resultado" único
 * que sirva para awareness y para ventas a la vez. La cifra sale de la métrica
 * que corresponde en cada plataforma — en Google, de las categorías de acción
 * de conversión que pertenecen a ese objetivo.
 */
function ObjectiveBreakdown({
  objetivos,
  sinSigla,
}: {
  objetivos: ObjectiveTotal[];
  sinSigla: number;
}) {
  if (objetivos.length === 0) return null;

  return (
    <Surface className="mb-4 overflow-hidden">
      <div className="border-b border-[#F8FAD7]/10 px-4 py-4">
        <h3 className="font-bold text-[#F8FAD7]">Resultados por objetivo</h3>
        <p className="mt-1 text-xs text-[#F8FAD7]/58">
          Cada familia con su propia métrica · clasificadas por la sigla del
          nombre
          {sinSigla > 0 && (
            <span className="text-amber-300">
              {" "}
              · {sinSigla}{" "}
              {sinSigla === 1 ? "campaña sin sigla queda" : "campañas sin sigla quedan"}{" "}
              fuera
            </span>
          )}
        </p>
      </div>
      <div className="grid gap-px bg-[#F8FAD7]/8 sm:grid-cols-2 xl:grid-cols-3">
        {objetivos.map((item) => (
          <div key={item.objetivo} className="bg-[#323330] p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold text-[#F8FAD7]">
                {item.label}
              </span>
              <span className="font-micro shrink-0 text-[0.58rem] text-[#F8FAD7]/40">
                {item.campaigns}{" "}
                {item.campaigns === 1 ? "CAMPAÑA" : "CAMPAÑAS"}
              </span>
            </div>
            <p className="metric-number mt-2 text-xl font-bold text-[#F8FAD7]">
              {item.currencyTotals
                .map((total) => formatMoney(total.spendMicros, total.currency))
                .join(" · ")}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
              <PlatformFact
                label={item.resultLabel}
                value={
                  item.result === null
                    ? "No se mide así"
                    : formatDecimal(item.result)
                }
              />
              <PlatformFact
                label="Clics"
                value={formatInteger(item.clicks)}
              />
            </dl>
          </div>
        ))}
      </div>
    </Surface>
  );
}
