"use client";

import type { CSSProperties } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  HeartPulse,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
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
import type { PortfolioSummary } from "@/lib/portafolios";
import { cn } from "@/lib/utils";
import type { PerformanceSnapshot } from "@/lib/performance-store";
import type { HealthCheck, ViewKey } from "./data";
import { TarjetaResumenSemanal } from "./resumen-semanal";
import {
  HealthBadge,
  StatCard,
  Surface,
} from "./ui";

/** Un módulo tal como lo muestra Inicio. Lo arma `dashboard.tsx` a partir de
 *  las mismas entradas del menú, para que renombrar un módulo sea un solo
 *  cambio y las dos superficies no puedan discrepar. */
export type ModuloInicio = {
  key: ViewKey;
  label: string;
  icono: LucideIcon;
  resumen: string;
};

/**
 * Inicio es un vestíbulo, no un tablero: saluda, dice en qué estado están
 * los datos y reparte hacia los módulos. Las cifras no se repiten acá —
 * viven en el Dashboard C-Level, que es donde se las va a buscar.
 */
export function ControlRoomView({
  nombre,
  performance,
  modulos,
  onNavigate,
  onOpenIntegrations,
  puedeVerResumen,
}: {
  /** Primer nombre de quien entró, para el saludo. */
  nombre: string;
  performance: PerformanceSnapshot;
  /** Solo los módulos que el rol de esta persona puede abrir. */
  modulos: ModuloInicio[];
  onNavigate: (key: ViewKey) => void;
  onOpenIntegrations: () => void;
  /** Solo admin/lead ven el resumen semanal: es un agregado de toda la cartera. */
  puedeVerResumen: boolean;
}) {
  const hasLiveData = performance.accountsWithData > 0;
  const isCurrent = performance.mode === "live";
  const monthLabel = etiquetaPeriodo(performance);

  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 md:p-6">
      <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
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
          <span
            className="mb-3 block h-1 w-9 rounded-full bg-gradient-to-r from-[#3bff00] to-[#4242ff]"
            aria-hidden="true"
          />
          <h2 className="neo-section-title">
            Hola, <span className="neo-nombre-animado">{nombre}</span>
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            {hasLiveData
              ? "Tu panel de WiWO.ADS — elige por dónde seguir."
              : "Conecta una fuente para empezar a ver datos reales."}
          </p>
        </div>
        {!hasLiveData && (
          <Button onClick={onOpenIntegrations} className="h-10 font-extrabold">
            Conectar una fuente
            <ArrowRight />
          </Button>
        )}
      </div>

      <TarjetaResumenSemanal puedeVer={puedeVerResumen} />

      <nav aria-label="Módulos">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modulos.map((modulo) => (
            <li key={modulo.key}>
              <TarjetaDeModulo
                modulo={modulo}
                onOpen={() => onNavigate(modulo.key)}
              />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/**
 * La tarjeta entera es el botón, no solo el título: un objetivo grande se
 * acierta sin apuntar, y de paso evita el enlace escondido dentro de una
 * caja que igual parecía clickeable.
 */
function TarjetaDeModulo({
  modulo,
  onOpen,
}: {
  modulo: ModuloInicio;
  onOpen: () => void;
}) {
  const Icono = modulo.icono;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full items-start gap-4 rounded-[16px] border border-border bg-card p-5 text-left shadow-[var(--shadow-1)] transition-colors hover:border-foreground/25 hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-[#4242FF] focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-foreground/[0.06] text-brand"
      >
        <Icono className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[1.02rem] font-bold text-foreground">
            {modulo.label}
          </span>
          <ArrowRight
            aria-hidden="true"
            className="size-4 shrink-0 text-foreground/35 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground/70"
          />
        </span>
        <span className="mt-1.5 block text-sm leading-6 text-foreground/58">
          {modulo.resumen}
        </span>
      </span>
    </button>
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

