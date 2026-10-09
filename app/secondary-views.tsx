"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
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
import { cn } from "@/lib/utils";
import { platformLabel } from "@/lib/plataformas";
import { OBJETIVO_LABELS, RESULTADO_POR_OBJETIVO, summarizeObjectives, type Objetivo, type ObjectiveTotal } from "@/lib/objetivos";
import type { PerformanceSnapshot } from "@/lib/performance-store";
import type { HealthCheck, ViewKey } from "./data";
import { TarjetaResumenSemanal } from "./resumen-semanal";
import { SaludDeMedicion } from "./salud-medicion";
import { CLIENTES_SOLO_PROYECTOS_ASIGNADOS, coincideConSegmento, enProyectosAsignados, nombresDeProyectos } from "@/lib/segmentos";
import { MejoresYPeores } from "./mejores-peores";
import { TableroDeSalud } from "./tablero-salud";
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
  /** Misma agrupación que el menú lateral: "gestion" es administración de
   * cuenta, no el trabajo de campaña del día a día. Separarlas acá también
   * evita que las dos se lean como una sola lista pareja de siete opciones. */
  grupo: "principal" | "gestion";
};

/**
 * Inicio es un vestíbulo, no un tablero: saluda, dice en qué estado están
 * los datos y reparte hacia los módulos. Las cifras no se repiten acá —
 * viven en el Dashboard C-Level, que es donde se las va a buscar.
 */
type Atencion = { decisiones: number | null; porRevisar: number | null };

/** Lo que necesita atención, primero: cuántas decisiones y solicitudes esperan, con un clic a su ventana. No repite cifras de inversión. */
function AtencionPrimero({ onNavigate, accountsWithData }: { onNavigate: (key: ViewKey) => void; accountsWithData: number }) {
  const [atencion, setAtencion] = useState<Atencion>({ decisiones: null, porRevisar: null });
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const decisiones = await fetch("/api/sugerencias", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j: { pendientes?: unknown[] } | null) => (j?.pendientes ? j.pendientes.length : null)).catch(() => null);
      const porRevisar = await fetch("/api/solicitudes", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j: { porRevisar?: unknown[] } | null) => (j?.porRevisar ? j.porRevisar.length : null)).catch(() => null);
      if (vivo) setAtencion({ decisiones, porRevisar });
    })();
    return () => {
      vivo = false;
    };
  }, []);
  const tarjetas: Array<{ titulo: string; valor: string; nota: string; destino: ViewKey }> = [
    { titulo: "Decisiones abiertas", valor: atencion.decisiones === null ? "—" : String(atencion.decisiones), nota: "Cambios que se pueden hacer ahora", destino: "decisiones" },
    { titulo: "Solicitudes por revisar", valor: atencion.porRevisar === null ? "—" : String(atencion.porRevisar), nota: "Esperan una aprobación", destino: "solicitudes" },
    { titulo: "Cuentas con datos", valor: String(accountsWithData), nota: "Leyendo en este momento", destino: "integrations" },
    { titulo: "Salud de medición", valor: "Revisar", nota: "¿Se mide bien lo que se paga?", destino: "medicion" },
  ];
  return (
    <section className="mb-7">
      <p className="font-micro mb-3 text-[0.68rem] text-foreground/40">LO QUE NECESITA ATENCIÓN, PRIMERO</p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tarjetas.map((t) => (
          <li key={t.titulo}>
            <button type="button" onClick={() => onNavigate(t.destino)} className="block w-full text-left">
              <Surface className="neo-card-accent p-4 transition-colors hover:border-brand/40">
                <p className="text-xs font-semibold text-foreground/60">{t.titulo}</p>
                <p className="metric-number mt-1 text-2xl font-extrabold text-foreground">{t.valor}</p>
                <p className="mt-0.5 text-xs text-foreground/50">{t.nota}</p>
              </Surface>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ControlRoomView({
  nombre,
  performance,
  modulos,
  onNavigate,
  onOpenIntegrations,
}: {
  /** Primer nombre de quien entró, para el saludo. */
  nombre: string;
  performance: PerformanceSnapshot;
  /** Solo los módulos que el rol de esta persona puede abrir. */
  modulos: ModuloInicio[];
  onNavigate: (key: ViewKey) => void;
  onOpenIntegrations: () => void;
}) {
  const hasLiveData = performance.accountsWithData > 0;

  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 md:p-6">
      <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span
            className="mb-3 block h-1 w-9 rounded-full bg-gradient-to-r from-[#3bff00] to-[#4242ff]"
            aria-hidden="true"
          />
          <h2 className="neo-section-title">
            Hola, <span className="neo-nombre-animado">{nombre}</span>
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            {hasLiveData
              ? "Sala de control: lo que espera tu atención y cada ventana, cada una para algo específico."
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

      <AtencionPrimero onNavigate={onNavigate} accountsWithData={performance.accountsWithData} />

      <nav aria-label="Módulos" className="space-y-7">
        <GrupoDeModulos
          modulos={modulos.filter((m) => m.grupo === "principal")}
          onNavigate={onNavigate}
        />
        {modulos.some((m) => m.grupo === "gestion") && (
          <div>
            <p className="font-micro mb-3 text-[0.68rem] text-foreground/40">
              GESTIÓN
            </p>
            <GrupoDeModulos
              modulos={modulos.filter((m) => m.grupo === "gestion")}
              onNavigate={onNavigate}
            />
          </div>
        )}
      </nav>
    </div>
  );
}

/* auto-rows-fr iguala el alto de TODAS las filas, no solo el de las tarjetas
   de una misma fila: así el bloque se lee como una grilla pareja aunque los
   resúmenes tengan largos distintos. */
function GrupoDeModulos({
  modulos,
  onNavigate,
}: {
  modulos: ModuloInicio[];
  onNavigate: (key: ViewKey) => void;
}) {
  return (
    <ul className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {modulos.map((modulo) => (
        <li key={modulo.key}>
          <TarjetaDeModulo
            modulo={modulo}
            onOpen={() => onNavigate(modulo.key)}
          />
        </li>
      ))}
    </ul>
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
      className="group flex h-full w-full flex-col items-start rounded-[16px] border border-border bg-card p-5 text-left shadow-[var(--shadow-1)] transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--acento-tema)] hover:bg-foreground/[0.04] hover:shadow-[0_0_0_1px_var(--acento-tema),var(--shadow-2)] focus-visible:ring-2 focus-visible:ring-[var(--acento-tema)] focus-visible:outline-none active:translate-y-0 active:scale-[0.99]"
    >
      <span
        aria-hidden="true"
        className="mb-4 block h-1 w-8 rounded-full bg-gradient-to-r from-[#3bff00] to-[#4242ff] opacity-70 transition-opacity group-hover:opacity-100"
      />
      <span className="flex w-full min-w-0 flex-1 items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-foreground/[0.06] text-foreground transition-colors group-hover:bg-[var(--acento-tema)] group-hover:text-[var(--acento-tema-contenido)]"
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
      </span>
    </button>
  );
}

const ESTADO_DE_CAMPANA: Record<string, { texto: string; clase: string }> = {
  ACTIVE: { texto: "Activa", clase: "bg-[#3BFF00]/12 text-brand" },
  ENABLED: { texto: "Activa", clase: "bg-[#3BFF00]/12 text-brand" },
  PAUSED: { texto: "Pausada", clase: "bg-foreground/[0.07] text-foreground/60" },
  REMOVED: { texto: "Eliminada", clase: "bg-danger/10 text-danger" },
  DELETED: { texto: "Eliminada", clase: "bg-danger/10 text-danger" },
  ARCHIVED: { texto: "Archivada", clase: "bg-foreground/[0.07] text-foreground/50" },
  WITH_ISSUES: { texto: "Con problemas", clase: "bg-warn/12 text-warn" },
  IN_PROCESS: { texto: "En revisión", clase: "bg-warn/12 text-warn" },
};

function estadoDeCampana(status: string | null) {
  const clave = (status ?? "").toUpperCase();
  return ESTADO_DE_CAMPANA[clave] ?? { texto: status ? status.toLowerCase() : "Sin estado", clase: "bg-foreground/[0.07] text-foreground/55" };
}

/**
 * Lo que importa de un vistazo: cuenta, campaña, plataforma y estado. Las campañas son las que tuvieron actividad
 * en el período elegido (lo que Windsor entrega); una pausada hace tiempo no aparece hasta que se pide el catálogo.
 */
function TablaDeCampanas({
  campanas,
  cuentas,
  onOpenIntegrations,
}: {
  campanas: PerformanceSnapshot["campaigns"];
  cuentas: Array<{ id: string; name: string; provider: string }>;
  onOpenIntegrations: () => void;
}) {
  const nombreDeCuenta = new Map(cuentas.map((a) => [a.id, a.name]));
  return (
    <Surface className="mb-4 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-foreground/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-foreground">Campañas del cliente</h3>
          <p className="mt-1 text-xs text-foreground/58">
            {campanas.length} {campanas.length === 1 ? "campaña" : "campañas"} con actividad en el período elegido
          </p>
        </div>
        <Button variant="outline" size="sm" className="bg-card" onClick={onOpenIntegrations}>
          <RefreshCw />
          Revisar fuentes
        </Button>
      </div>
      <div className="max-h-[28rem] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-foreground/[0.03] hover:bg-foreground/[0.04]">
              <TableHead className="pl-4 text-xs text-foreground/58">Cuenta</TableHead>
              <TableHead className="text-xs text-foreground/58">Campaña</TableHead>
              <TableHead className="text-xs text-foreground/58">Plataforma</TableHead>
              <TableHead className="pr-4 text-xs text-foreground/58">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campanas.map((c) => {
              const estado = estadoDeCampana(c.status);
              return (
                <TableRow key={`${c.accountKey}-${c.campaignId ?? c.name}`} className="h-12">
                  <TableCell className="pl-4 text-sm font-bold text-foreground">{nombreDeCuenta.get(c.accountKey) ?? c.accountName}</TableCell>
                  <TableCell className="max-w-[28rem] truncate text-sm text-foreground/82" title={c.name}>
                    {c.name}
                  </TableCell>
                  <TableCell>
                    <span className="rounded-md bg-foreground/[0.07] px-2 py-1 text-xs font-semibold text-foreground/66">
                      {platformLabel(c.provider)}
                    </span>
                  </TableCell>
                  <TableCell className="pr-4">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", estado.clase)}>{estado.texto}</span>
                  </TableCell>
                </TableRow>
              );
            })}
            {campanas.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-sm text-foreground/58">
                  Este cliente no tuvo campañas con actividad en el período elegido.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Surface>
  );
}

export function HealthView({
  client,
  performance,
  onOpenIntegrations,
  checks,
  score,
  okCount,
  totalCount,
  critical,
  warnings,
  puedeVerResumen,
  cargandoAnuncios = false,
}: {
  /** Los anuncios del cliente (casi tres mil filas en toda la cartera) se leen aparte y pueden tardar. */
  cargandoAnuncios?: boolean;
  /**
   * Id de cliente, no de cuenta: la salud se mira por cliente. Viene del
   * selector del navbar — no tiene su propio selector acá adentro, para no
   * repetir la misma elección en dos lugares que podían desincronizarse.
   */
  client: string | null;
  performance: PerformanceSnapshot;
  onOpenIntegrations: () => void;
  checks: HealthCheck[];
  score: number;
  okCount: number;
  totalCount: number;
  critical: number;
  warnings: number;
  /** Solo admin/lead ven el resumen semanal: es un agregado de toda la cartera. */
  puedeVerResumen: boolean;
}) {
  const portfolios = performance.portfolios;
  const portfolio = portfolios.find((item) => item.id === client) ?? null;
  const monthLabel = etiquetaPeriodo(performance);
  // Proyectos o mercados del cliente (Valor: Ébano, Corotú…; SQM: México…): un filtro para ver cada uno por separado.
  const [segmentoElegido, setSegmentoElegido] = useState<{ cliente: string; id: string } | null>(null);
  const segmentos = portfolio?.segmentos ?? [];
  const segmento = segmentoElegido && segmentoElegido.cliente === portfolio?.id ? (segmentos.find((x) => x.id === segmentoElegido.id) ?? null) : null;
  // Grupo Valor: la cuenta trae proyectos de otros equipos; solo se ven los que llevamos.
  const soloAsignados = portfolio ? CLIENTES_SOLO_PROYECTOS_ASIGNADOS.has(portfolio.id) && segmentos.length > 0 : false;
  // Resultado de "Resultados" mezclando ventas, leads y awareness en una
  // sola cifra: cada objetivo se mide con su propia métrica (ver
  // `summarizeObjectives`), así que acá se recalcula solo con las campañas
  // de este cliente — `byObjective` en el snapshot es de toda la cartera.
  const cuentasDelCliente = new Set(portfolio?.accounts.map((a) => a.id) ?? []);
  // Solo los objetivos que ese cliente de verdad movió: uno con campañas pero
  // sin ningún resultado no aporta nada y se lee como un dato roto ("—").
  const todasDelCliente = portfolio ? performance.campaigns.filter((c) => cuentasDelCliente.has(c.accountKey)) : [];
  const delAlcance = soloAsignados && portfolio ? todasDelCliente.filter((c) => enProyectosAsignados(portfolio.id, segmentos, [c.name])) : todasDelCliente;
  const ocultasPorProyecto = todasDelCliente.length - delAlcance.length;
  // Las campañas de este cliente (y del proyecto elegido), para el tablero y la tabla de estado.
  const campanasDelCliente = (segmento ? delAlcance.filter((c) => coincideConSegmento([c.name, c.accountName], segmento)) : delAlcance).sort((a, b) => b.spendMicros - a.spendMicros);
  const resumenPorObjetivo = portfolio ? summarizeObjectives(campanasDelCliente) : [];
  const filtrado = soloAsignados || segmento !== null;
  const clicsMostrados = portfolio ? (filtrado ? campanasDelCliente.reduce((t, c) => t + (c.clicks ?? 0), 0) : portfolio.clicks) : null;
  const impresionesMostradas = portfolio ? (filtrado ? campanasDelCliente.reduce((t, c) => t + (c.impressions ?? 0), 0) : portfolio.impressions) : null;
  const anunciosDelAlcance = (performance.ads ?? []).filter((a) => {
    if (!cuentasDelCliente.has(a.accountKey)) return false;
    const textos = [a.campaignName, a.adsetName, a.adName];
    if (soloAsignados && portfolio && !enProyectosAsignados(portfolio.id, segmentos, textos)) return false;
    return segmento ? coincideConSegmento([...textos, a.accountName], segmento) : true;
  });

  // Sin cliente elegido no hay nada que medir: antes el selector arrancaba
  // solo en una de sus cuentas de Windsor, elegida al azar, sin decir a qué
  // cliente pertenecía ni qué pasaba con sus otras cuentas. El resumen de la
  // cartera completa no depende de elegir uno, así que se muestra igual.
  if (!portfolio) {
    return (
      <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
        <div className="mb-5">
          <h2 className="neo-section-title">
            Elige un cliente
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/58">
            Por cada una de sus cuentas se revisan dos cosas: si la conexión de
            lectura sigue autorizada y si los datos llegaron al día.
          </p>
        </div>
        <Surface className="mb-6 flex flex-col items-center gap-2 p-10 text-center">
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
        <TarjetaResumenSemanal puedeVer={puedeVerResumen} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="neo-section-title">
            {portfolio.name}
          </h2>
          <p className="mt-2 max-w-xl text-xs leading-5 text-foreground/50">
            Resultados y estado de las campañas. La inversión está en Inversión; la medición, en Salud de medición; lo que conviene hacer, en Decisiones.
          </p>
        </div>
      </div>

      {segmentos.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-foreground/55">{soloAsignados ? "Proyecto" : "Segmento"}</span>
            {[{ id: "", nombre: soloAsignados ? "Todos los míos" : "Todos" }, ...segmentos].map((x) => (
              <button
                key={x.id || "todos"}
                type="button"
                onClick={() => setSegmentoElegido(x.id ? { cliente: portfolio.id, id: x.id } : null)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  (segmento?.id ?? "") === x.id ? "border-brand bg-brand/15 text-brand" : "border-foreground/15 text-foreground/65 hover:border-brand/40",
                )}
              >
                {x.nombre}
              </button>
            ))}
          </div>
          {soloAsignados && (
            <p className="text-[0.7rem] leading-4 text-foreground/50">
              Se muestran solo los proyectos que llevamos ({nombresDeProyectos(segmentos)}).{ocultasPorProyecto > 0 ? ` ${ocultasPorProyecto} ${ocultasPorProyecto === 1 ? "campaña de otro proyecto de la cuenta no se muestra" : "campañas de otros proyectos de la cuenta no se muestran"}.` : ""}
            </p>
          )}
        </div>
      )}

      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
        <StatCard
          label={`Clics · ${monthLabel}`}
          value={clicsMostrados === null ? "—" : formatInteger(clicsMostrados)}
          note={
            impresionesMostradas === null
              ? "Sin lectura disponible"
              : `${formatInteger(impresionesMostradas)} impresiones`
          }
          icon={Activity}
        />
        <TarjetaResultadosPorObjetivo objetivos={resumenPorObjetivo} monthLabel={monthLabel} />
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

      <TableroDeSalud
        campanas={campanasDelCliente.map((c) => ({ name: c.name, provider: c.provider, status: c.status, accountKey: c.accountKey, accountName: c.accountName, currency: c.currency, spendMicros: c.spendMicros, objetivo: c.objetivo }))}
        checks={checks}
        periodo={monthLabel}
      />

      <MejoresYPeores
        anuncios={anunciosDelAlcance}
        cargandoAnuncios={cargandoAnuncios}
        campanas={campanasDelCliente}
        cuentas={portfolio.accounts}
        periodo={monthLabel}
      />

      {/* Medición de GA4 (solo la ven quienes pueden: la lectura responde 403 al resto y la tarjeta no aparece). */}
      <SaludDeMedicion key={`ga4-${portfolio.id}`} portfolioId={portfolio.id} puedeEditar={false} />

      <TablaDeCampanas
        campanas={campanasDelCliente}
        cuentas={portfolio.accounts.map((a) => ({ id: a.id, name: a.name, provider: a.provider }))}
        onOpenIntegrations={onOpenIntegrations}
      />

      <details className="group mb-4">
      <summary className="mb-3 cursor-pointer list-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-sm font-semibold text-foreground/70 hover:text-foreground">
        Verificaciones de lectura por cuenta ({checks.length}) — ver el detalle técnico
      </summary>
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
                // Antes sin `platform`: Google Ads y Meta Ads de la misma
                // cuenta compartían key ("Colbún Energía-Autorización e
                // inventario" x2), React lo advertía en consola como "two
                // children with the same key" y la tabla quedaba expuesta al
                // mismo bug de reconciliación que ya se vio en Clientes.
                key={`${check.account}-${check.platform}-${check.check}`}
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
      </details>
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
          pausar o activar algo siempre lo confirma una persona — desde el
          Constructor, el botón de una campaña o una propuesta del asistente.
        </p>
      </div>

    </div>
  );
}

/**
 * Reemplaza la tarjeta genérica de "Resultados": una sola cifra mezclando
 * ventas, leads, tráfico y awareness no dice nada, porque cada objetivo se
 * mide con una métrica distinta (una compra no es un clic). Una fila por
 * objetivo que el cliente de verdad corrió en el rango — el que no tuvo
 * campañas activas simplemente no aparece, no hace falta un caso especial
 * para ocultarlo.
 */
/** Los objetivos que el cliente tiene en el periodo, en el orden de siempre. */
const OBJETIVOS_FIJOS: Objetivo[] = ["AE", "VTA", "LDS", "TRF", "OCV"];

const COLUMNAS_POR_CANTIDAD: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

function TarjetaResultadosPorObjetivo({
  objetivos,
  monthLabel,
}: {
  objetivos: ObjectiveTotal[];
  monthLabel: string;
}) {
  const por = new Map(objetivos.map((o) => [o.objetivo, o]));
  // Solo los objetivos que el cliente de verdad tiene en el periodo: no se muestran Ventas o Leads vacíos si no hay campañas de eso.
  const lista = OBJETIVOS_FIJOS.filter((o) => por.has(o));
  if (lista.length === 0) return null;
  return (
    <Surface className="neo-card-accent p-5">
      <p className="font-micro text-[0.62rem] text-foreground/45">
        RESULTADOS POR OBJETIVO · {monthLabel.toUpperCase()}
      </p>
      <div className={cn("mt-3 grid grid-cols-2 gap-3", COLUMNAS_POR_CANTIDAD[lista.length] ?? "lg:grid-cols-5")}>
        {lista.map((clave) => {
          const obj = por.get(clave);
          const gasto = obj?.currencyTotals.filter((t) => t.spendMicros > 0).map((t) => dineroCorto(t.spendMicros / 1_000_000, t.currency)).join(" · ");
          return (
            <div key={clave} className={cn("rounded-xl border border-foreground/10 p-3", !obj && "opacity-60")}>
              <p className="truncate text-[0.7rem] font-semibold text-foreground/65" title={OBJETIVO_LABELS[clave]}>
                {OBJETIVO_LABELS[clave]}
              </p>
              <p className="metric-number mt-1 text-2xl font-extrabold text-foreground">
                {obj && obj.result !== null ? formatConversiones(obj.result) : "—"}
              </p>
              <p className="text-[0.62rem] text-foreground/45">{RESULTADO_POR_OBJETIVO[clave].toLowerCase()}</p>
              <p className="mt-1.5 text-[0.65rem] leading-4 text-foreground/55">
                {obj ? `${obj.campaigns} ${obj.campaigns === 1 ? "campaña con actividad" : "campañas con actividad"}${gasto ? ` · ${gasto}` : ""}` : "sin campañas en el periodo"}
              </p>
            </div>
          );
        })}
      </div>
    </Surface>
  );
}

function dineroCorto(valor: number, moneda: string): string {
  try {
    return valor.toLocaleString("es-CL", { style: "currency", currency: moneda, maximumFractionDigits: 0 });
  } catch {
    return `${Math.round(valor).toLocaleString("es-CL")} ${moneda}`;
  }
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


function formatInteger(valor: number): string {
  return valor.toLocaleString("es-CL");
}

/** Las conversiones pueden venir fraccionadas (atribución repartida entre
 * varios puntos de contacto) — "12.9983" se lee como un error, no precisión. */
function formatConversiones(valor: number): string {
  return valor % 1 === 0
    ? formatInteger(valor)
    : valor.toLocaleString("es-CL", { maximumFractionDigits: 1 });
}

function formatMonth(value: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
