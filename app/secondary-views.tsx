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
import { cn } from "@/lib/utils";
import type {
  PerformanceAccountSummary,
  PerformanceSnapshot,
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
  const monthLabel = formatMonth(performance.rangeEnd);
  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-micro mb-3 inline-flex items-center gap-2 rounded-full border border-[#F5F3FF]/10 bg-[#16161d]/55 px-3 py-1.5 text-[0.62rem] text-[#F5F3FF]/60 shadow-sm backdrop-blur-md">
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
          <h2 className="font-editorial text-3xl leading-[0.98] tracking-[-0.035em] text-[#F5F3FF] md:text-[2.8rem]">
            Lo que necesita atención, primero
          </h2>
        </div>
        {hasLiveData ? (
          <Button onClick={onOpenQueue} className="h-10 font-extrabold">
            Abrir cola piloto
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
          label="Inversión del mes"
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
          note="Cola piloto · no ejecuta cambios"
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
          label="Clics del mes"
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
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-slate-950">Estado de cartera</h3>
              <p className="mt-1 text-xs text-slate-500">
                Solo cuentas seleccionadas · cifras desde las APIs oficiales
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="bg-[#16161d] text-slate-600"
              onClick={onOpenIntegrations}
            >
              <RefreshCw />
              Abrir integraciones
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                <TableHead className="pl-4 text-xs text-slate-500">
                  Cuenta
                </TableHead>
                <TableHead className="text-xs text-slate-500">
                  Estado
                </TableHead>
                <TableHead className="text-xs text-slate-500">Plataforma</TableHead>
                <TableHead className="text-right text-xs text-slate-500">
                  Impresiones
                </TableHead>
                <TableHead className="text-right text-xs text-slate-500">
                  Clics
                </TableHead>
                <TableHead className="text-right text-xs text-slate-500">
                  Resultados
                </TableHead>
                <TableHead className="text-right text-xs text-slate-500">
                  Inversión
                </TableHead>
                <TableHead className="pr-4 text-right text-xs text-slate-500">
                  Frescura
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance.accounts.map((client) => (
                <TableRow
                  key={client.id}
                  className="h-16 bg-[#16161d] hover:bg-slate-50"
                >
                  <TableCell className="pl-4">
                    <button
                      onClick={() => onOpenHealth(client.id)}
                      className="text-left outline-none focus-visible:ring-2 focus-visible:ring-[#4A43FF]"
                    >
                      <span className="block text-sm font-bold text-slate-900">
                        {client.name}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
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
                    <span className="text-sm font-semibold text-slate-700">
                      {client.provider === "google" ? "Google Ads" : "Meta Ads"}
                    </span>
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-slate-600">
                    {formatInteger(client.impressions)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-slate-600">
                    {formatInteger(client.clicks)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-slate-600">
                    {formatDecimal(client.conversions)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm font-bold text-slate-800">
                    {formatMoney(client.spendMicros, client.currency)}
                  </TableCell>
                  <TableCell className="pr-4 text-right text-xs text-slate-400">
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
                    <p className="text-sm font-bold text-slate-900">
                      Aún no hay cuentas activas con métricas
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                      Conecta Google o Meta, selecciona una cuenta publicitaria y
                      WiWO.ADS hará la primera lectura automáticamente.
                    </p>
                    <Button className="mt-4" onClick={onOpenIntegrations}>
                      Abrir integraciones
                    </Button>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Surface>

        <div className="space-y-4">
          <Surface className="overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-4">
              <h3 className="font-bold text-slate-950">Cobertura de datos</h3>
              <p className="mt-1 text-xs text-slate-500">
                Estado real de las cuentas seleccionadas
              </p>
            </div>
            <div className="p-4">
              <p className="metric-number text-3xl font-extrabold text-slate-950">
                {performance.accountsWithData}
                <span className="ml-1 text-base font-semibold text-slate-400">
                  / {performance.selectedAccountCount}
                </span>
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
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
              <span className="grid size-10 place-items-center rounded-xl bg-[#4A43FF]/8 text-[#4A43FF]">
                <Activity className="size-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {hasLiveData
                    ? isCurrent
                      ? "Lectura operacional"
                      : "Lectura pendiente de actualización"
                    : "Modo preparación"}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {hasLiveData
                    ? `Última sincronización ${formatFreshness(performance.lastSyncedAt, performance.generatedAt)}`
                    : "No se muestran ceros ni proyecciones inventadas"}
                </p>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#4A43FF] via-[#42FF00] to-[#42FF00]"
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
  accounts,
  onOpenIntegrations,
  checks,
  score,
  critical,
  warnings,
}: {
  client: string;
  onClient: (value: string) => void;
  accounts: PerformanceAccountSummary[];
  onOpenIntegrations: () => void;
  checks: HealthCheck[];
  score: number;
  critical: number;
  warnings: number;
}) {
  const selectedName =
    accounts.find((account) => account.id === client)?.name ?? "sin cuenta";
  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-micro mb-3 inline-flex items-center gap-2 rounded-full border border-[#F5F3FF]/10 bg-[#16161d]/55 px-3 py-1.5 text-[0.62rem] text-[#F5F3FF]/60 shadow-sm backdrop-blur-md">
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
          <h2 className="font-editorial text-3xl leading-[0.98] tracking-[-0.035em] text-[#F5F3FF] md:text-[2.8rem]">
            Medir bien antes de optimizar
          </h2>
        </div>
        <Select
          value={client || undefined}
          onValueChange={onClient}
          disabled={accounts.length === 0}
        >
          <SelectTrigger
            aria-label="Seleccionar cuenta para revisar su salud"
            className="h-10 w-full bg-[#16161d]/65 md:w-56"
          >
            <SelectValue placeholder="Sin cuentas activas" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {critical > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 size-5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-bold text-red-950">
                La fuente requiere atención
              </p>
              <p className="mt-1 text-sm leading-6 text-red-800">
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
              <p className="text-sm font-medium text-slate-500">
                Índice de disponibilidad · {selectedName}
              </p>
              <p className="metric-number mt-2 text-4xl font-extrabold text-slate-950">
                {score}
                <span className="ml-1 text-lg font-semibold text-slate-400">
                  / 100
                </span>
              </p>
            </div>
            <div
              className="relative grid size-20 place-items-center rounded-full before:absolute before:inset-2 before:rounded-full before:bg-[#16161d]"
              style={
                {
                  background:
                    "conic-gradient(#4A43FF " +
                    String(score) +
                    "%, #E8EBF2 0)",
                } as CSSProperties
              }
            >
              <span className="relative text-xs font-bold text-[#4A43FF]">
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
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-950">
              Estado de la última lectura
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Nunca se muestra cero cuando una métrica no existe
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-[#16161d]"
            onClick={onOpenIntegrations}
          >
            <RefreshCw />
            Revisar fuentes
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead className="pl-4 text-xs text-slate-500">
                Verificación
              </TableHead>
              <TableHead className="text-xs text-slate-500">
                Plataforma
              </TableHead>
              <TableHead className="text-xs text-slate-500">Estado</TableHead>
              <TableHead className="text-xs text-slate-500">Lectura</TableHead>
              <TableHead className="text-xs text-slate-500">
                Responsable
              </TableHead>
              <TableHead className="pr-4 text-right text-xs text-slate-500">
                Última revisión
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {checks.map((check) => (
              <TableRow
                key={check.platform + "-" + check.check}
                className="h-16"
              >
                <TableCell className="pl-4 text-sm font-bold text-slate-900">
                  {check.check}
                </TableCell>
                <TableCell>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
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
                      ? "font-semibold text-red-700"
                      : "text-slate-600",
                  )}
                >
                  {check.detail}
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {check.owner}
                </TableCell>
                <TableCell className="pr-4 text-right text-xs text-slate-400">
                  {check.lastCheck}
                </TableCell>
              </TableRow>
            ))}
            {checks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center">
                  <p className="text-sm font-bold text-slate-900">
                    No hay verificaciones disponibles
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                    Selecciona una cuenta publicitaria y sincroniza sus métricas
                    para comenzar a medir frescura y disponibilidad.
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
  const hasLiveData = performance.accountsWithData > 0;
  const isCurrent = performance.mode === "live";
  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-micro mb-3 inline-flex items-center gap-2 rounded-full border border-[#F5F3FF]/10 bg-[#16161d]/55 px-3 py-1.5 text-[0.62rem] text-[#F5F3FF]/60 shadow-sm backdrop-blur-md">
            <span
              className={cn(
                "size-2 rounded-full",
                isCurrent ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            {hasLiveData
              ? `${isCurrent ? "Inversión real" : "Inversión real · actualización pendiente"} · ${formatMonth(performance.rangeEnd)}`
              : "Sin datos de inversión"}
          </p>
          <h2 className="font-editorial text-3xl leading-[0.98] tracking-[-0.035em] text-[#F5F3FF] md:text-[2.8rem]">
            Inversión real, sin mezclar monedas
          </h2>
        </div>
        <Button onClick={onOpenIntegrations} className="h-10 font-extrabold">
          Abrir integraciones
          <ArrowRight />
        </Button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Inversión del mes"
          value={formatCurrencyTotals(performance)}
          note="Agrupada por moneda de cuenta"
          icon={CircleDollarSign}
        />
        <StatCard
          label="Cuentas con datos"
          value={String(performance.accountsWithData)}
          note={`${performance.selectedAccountCount} seleccionadas`}
          icon={Gauge}
          tone="cyan"
        />
        <StatCard
          label="Clics"
          value={formatInteger(performance.clicks)}
          note={`${formatInteger(performance.impressions)} impresiones`}
          icon={Activity}
        />
        <StatCard
          label="Resultados"
          value={formatDecimal(performance.conversions)}
          note="Google Ads · Meta requiere definir el KPI"
          icon={BadgeCheck}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Surface className="overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-4">
            <h3 className="font-bold text-slate-950">Lectura por cuenta</h3>
            <p className="mt-1 text-xs text-slate-500">
              Mes en curso · datos informados por cada plataforma
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                <TableHead className="pl-4 text-xs text-slate-500">
                  Cuenta
                </TableHead>
                <TableHead className="text-right text-xs text-slate-500">
                  Invertido
                </TableHead>
                <TableHead className="text-right text-xs text-slate-500">
                  Impresiones
                </TableHead>
                <TableHead className="text-right text-xs text-slate-500">
                  Clics
                </TableHead>
                <TableHead className="pr-4 text-right text-xs text-slate-500">
                  Resultados
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance.accounts.map((row) => (
                <TableRow key={row.id} className="h-16">
                  <TableCell className="pl-4 text-sm font-bold text-slate-900">
                    <span className="block">{row.name}</span>
                    <span className="mt-1 block text-xs font-medium text-slate-400">
                      {row.provider === "google" ? "Google Ads" : "Meta Ads"}
                    </span>
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-slate-600">
                    {formatMoney(row.spendMicros, row.currency)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm text-slate-600">
                    {formatInteger(row.impressions)}
                  </TableCell>
                  <TableCell className="metric-number text-right text-sm font-bold text-slate-800">
                    {formatInteger(row.clicks)}
                  </TableCell>
                  <TableCell className="metric-number pr-4 text-right text-sm font-bold text-slate-800">
                    {formatDecimal(row.conversions)}
                  </TableCell>
                </TableRow>
              ))}
              {performance.accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-48 text-center">
                    <p className="text-sm font-bold text-slate-900">
                      No hay inversión disponible
                    </p>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
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
            <div className="border-b border-slate-200 px-4 py-4">
              <h3 className="font-bold text-slate-950">Pacing contractual</h3>
              <p className="mt-1 text-xs text-slate-500">
                Siguiente capa de configuración
              </p>
            </div>
            <div className="p-4">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">
                  Sin presupuesto configurado
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
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
              <span className="grid size-9 place-items-center rounded-xl bg-[#4A43FF] text-[#080808]">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  Operación protegida
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
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
          <p className="font-micro mb-3 inline-flex items-center gap-2 rounded-full border border-[#F5F3FF]/10 bg-[#16161d]/55 px-3 py-1.5 text-[0.62rem] text-[#F5F3FF]/60 shadow-sm backdrop-blur-md">
            <span className="size-2 rounded-full bg-[#4A43FF]" />
            Bitácora persistente · acciones y datos piloto
          </p>
          <h2 className="font-editorial text-3xl leading-[0.98] tracking-[-0.035em] text-[#F5F3FF] md:text-[2.8rem]">
            El sistema recuerda
          </h2>
        </div>
        <Button
          variant="outline"
          className="h-10 bg-[#16161d]"
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
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-950">Actividad reciente</h3>
            <p className="mt-1 text-xs text-slate-500">
              Cada decisión conserva responsable, origen y resultado
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar en la bitácora"
              className="h-9 w-full bg-[#16161d] pl-9 sm:w-64"
            />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead className="pl-4 text-xs text-slate-500">
                Fecha
              </TableHead>
              <TableHead className="text-xs text-slate-500">Usuario</TableHead>
              <TableHead className="text-xs text-slate-500">Acción</TableHead>
              <TableHead className="text-xs text-slate-500">Cliente</TableHead>
              <TableHead className="text-xs text-slate-500">Origen</TableHead>
              <TableHead className="pr-4 text-right text-xs text-slate-500">
                Resultado
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEvents.map((event) => (
              <TableRow key={event.id} className="h-16">
                <TableCell className="pl-4">
                  <span className="block text-sm font-semibold text-slate-700">
                    {event.time}
                  </span>
                  <span className="mt-1 block text-[0.68rem] text-slate-400">
                    {event.id}
                  </span>
                  <span
                    className={cn(
                      "mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[0.62rem] font-bold",
                      event.dataOrigin === "pilot"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-[#4A43FF]/8 text-[#4A43FF]",
                    )}
                  >
                    {event.dataOrigin === "pilot"
                      ? "Piloto"
                      : "Acción registrada"}
                  </span>
                </TableCell>
                <TableCell className="text-sm font-semibold text-slate-800">
                  {event.user}
                </TableCell>
                <TableCell className="max-w-[280px] whitespace-normal text-sm font-medium leading-5 text-slate-700">
                  {event.action}
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {event.client}
                </TableCell>
                <TableCell className="text-xs text-slate-500">
                  {event.origin}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                      event.result.includes("Ejecut")
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600",
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
            <Search className="mb-3 size-6 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">
              No encontramos registros
            </p>
            <p className="mt-1 text-xs text-slate-400">
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
  if (performance.currencyTotals.length === 0) return "—";
  if (performance.currencyTotals.length > 1) {
    return `${performance.currencyTotals.length} monedas`;
  }
  const total = performance.currencyTotals[0];
  return formatMoney(total.spendMicros, total.currency);
}

function formatMoney(value: number | null, currency: string | null): string {
  if (value === null) return "—";
  if (!currency || currency === "N/D") {
    return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value / 1_000_000)} N/D`;
  }
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
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
