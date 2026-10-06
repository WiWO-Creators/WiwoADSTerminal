"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Plus,
  Settings,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SemillaDeCampana } from "@/lib/constructor";
import { DEFINICION_KPI, KPIS_PRINCIPALES, type KpiPrincipal } from "@/lib/kpis-cliente";
import type { GtmEstado } from "@/lib/gtm";
import type { PerformanceSnapshot } from "@/lib/performance-store";
import { platformLabel } from "@/lib/plataformas";
import { cn } from "@/lib/utils";
import {
  AnunciosView,
  type AttachToCampana,
  type AttachToConjunto,
} from "./anuncios-view";
import { OrbeDeBoton, Surface } from "./ui";

type CuentaVinculada = {
  externalId: string;
  name: string;
  provider: string;
  currency: string | null;
  /** false: la cuenta existe, pero no reportó nada en el periodo actual. */
  conDatos: boolean;
  /**
   * Página de Facebook de esta cuenta puntual, no del cliente entero.
   *
   * SQM factura Meta desde tres cuentas —México, España, LATAM— y cada una
   * publica bajo su propia página: un solo campo por cliente no alcanzaba.
   */
  pageId: string | null;
  /**
   * Píxeles de Meta de esta cuenta puntual, para que el conjunto de anuncios
   * pueda optimizar a leads o ventas en vez de solo a clics — Meta lo exige
   * (`promoted_object.pixel_id`) y sin ninguno rechaza la creación del
   * conjunto. Puede haber más de uno (MGC: Converse y Coliseum en la misma
   * cuenta) — con más de uno, el Constructor exige elegir cuál usar en cada
   * campaña.
   */
  pixels: Array<{ id: string; pixelId: string; label: string | null }>;
  /**
   * Países de segmentación de esta cuenta puntual, no del cliente entero.
   *
   * ALO Group lo exige: seis cuentas de Google, una por país. Un solo campo
   * de países por cliente no dice cuál cuenta apunta a cuál.
   */
  countries: string[];
};

/** Lo que puede guardarse desde la ficha de un cliente. */
type CambiosPortfolio = Partial<Omit<Portfolio, "metas">> & CambiosMetas & {
  accountPageId?: { externalId: string; pageId: string | null };
  accountPixelAdd?: { externalId: string; pixelId: string; label?: string | null };
  accountPixelRemove?: { externalId: string; pixelRowId: string };
  accountCountries?: { externalId: string; countries: string[] };
};

type Portfolio = {
  id: string;
  name: string;
  pageId: string | null;
  instagramId: string | null;
  countries: string[];
  website: string | null;
  contactEmail: string | null;
  needsReview: boolean;
  reviewNote: string | null;
  notes: string | null;
  targetCpaMicros: number | null;
  targetRoas: number | null;
  /** Qué se mira primero en este cliente. */
  kpiPrincipal: KpiPrincipal | null;
  /** ¿Tiene Google Tag Manager? `null`: sin verificar. */
  gtmEstado: GtmEstado | null;
  gtmContainerId: string | null;
  monthlyBudgetMicros: number | null;
  monthlyBudgetCurrency: string | null;
  ga4PropertyId: string | null;
  empresa?: "mgc" | "wiwo" | null;
  archivado?: boolean;
  /** Proyectos o mercados del cliente, con su presupuesto mensual propio si lo tienen. */
  segmentos?: Array<{ id: string; nombre: string; presupuesto: { micros: number; moneda: string } | null }>;
  metas: {
    cpmMicros: number | null;
    /** Fracción (0,015 = 1,5 %). */
    ctrMinimo: number | null;
    frecuenciaMaxima: number | null;
  };
  accountIds: string[];
  accounts: CuentaVinculada[];
};

/** Lo que el formulario de la ficha manda al guardar las metas nuevas. */
type CambiosMetas = {
  kpiPrincipal?: KpiPrincipal | null;
  targetCpmMicros?: number | null;
  targetCtr?: number | null;
  maxFrequency?: number | null;
};

type Unassigned = {
  externalId: string;
  name: string;
  provider: string;
  currency: string | null;
};

type Respuesta = {
  portfolios: Portfolio[];
  unassigned: Unassigned[];
  canManage: boolean;
  canApprove: boolean;
};

async function fetchClientes(): Promise<Respuesta> {
  const response = await fetch("/api/clientes", { cache: "no-store" });
  const body = (await response.json()) as Respuesta & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "No se pudo cargar");
  return body;
}

/** Plataformas de un cliente, con cuántas cuentas tiene en cada una. */
function porPlataformaDe(portfolio: Portfolio) {
  return [
    ...portfolio.accounts
      .reduce((mapa, cuenta) => {
        if (!cuenta.provider) return mapa;
        mapa.set(cuenta.provider, (mapa.get(cuenta.provider) ?? 0) + 1);
        return mapa;
      }, new Map<string, number>())
      .entries(),
  ].sort((a, b) => b[1] - a[1]);
}

/** Qué le falta a un cliente para poder publicar, calculado una sola vez. */
function faltantesDe(portfolio: Portfolio) {
  const porPlataforma = porPlataformaDe(portfolio);
  const cuentasMeta = portfolio.accounts.filter((c) => c.provider === "meta");
  const paginaFaltante =
    cuentasMeta.length > 1
      ? cuentasMeta.some((c) => !c.pageId)
      : !portfolio.pageId;

  const necesitaDesglosePorPais = porPlataforma.some(([, total]) => total > 1);
  const cuentasSinPais = portfolio.accounts.filter(
    (c) => c.provider && c.countries.length === 0,
  );
  const paisesFaltantes = necesitaDesglosePorPais
    ? cuentasSinPais.length > 0
    : portfolio.countries.length === 0;

  return {
    porPlataforma,
    cuentasMeta,
    necesitaDesglosePorPais,
    cuentasSinPais,
    lista: [
      portfolio.contactEmail ? null : "Sin correo",
      paginaFaltante
        ? cuentasMeta.length > 1
          ? `${cuentasMeta.filter((c) => !c.pageId).length} de ${cuentasMeta.length} páginas de Meta`
          : "Sin página de Facebook"
        : null,
      paisesFaltantes
        ? necesitaDesglosePorPais
          ? `${cuentasSinPais.length} de ${portfolio.accounts.length} cuentas sin país`
          : "Sin países"
        : null,
    ].filter((x): x is string => x !== null),
  };
}

/**
 * Clientes y sus anuncios, en una sola pantalla.
 *
 * Antes eran dos vistas separadas —una para administrar página, países y
 * correo; otra para ver campañas y anuncios— y pasar de una a otra obligaba a
 * cambiar de sección y volver a elegir el cliente. Acá se elige una vez, a la
 * izquierda, y la derecha trae tanto la ficha del cliente como sus campañas,
 * igual que el panel de un Business Manager: una lista de carteras y, al
 * lado, el detalle de la que se abrió.
 */
export function ClientesView({
  performance,
  seleccionado,
  onSeleccionar,
  onCrearCampana,
  onAbrirImpulsar,
  onAgregarConjunto,
  onAgregarAnuncio,
  onImpulsar,
  onVersionNueva,
  onDatosCambiaron,
  cargandoAnuncios = false,
}: {
  performance: PerformanceSnapshot;
  /**
   * Controlado desde afuera (`Dashboard`), no local: esta vista se desmonta
   * al salir a cualquier otra y se vuelve a montar al volver, así que un
   * `useState` acá perdía la selección en cada ida y vuelta. Se elige tanto
   * desde el selector del navbar como desde la lista de acá abajo — las dos
   * vías escriben al mismo lugar.
   */
  seleccionado: string | null;
  onSeleccionar: (portfolioId: string | null) => void;
  /** Sin esta prop (rol sin crear_campanas), AnunciosView no ofrece el botón. */
  onCrearCampana?: (portfolioId: string) => void;
  onAbrirImpulsar?: () => void;
  onAgregarConjunto?: (attachTo: AttachToCampana) => void;
  onAgregarAnuncio?: (attachTo: AttachToConjunto) => void;
  onImpulsar?: (portfolioId: string, semilla: SemillaDeCampana) => void;
  /** Un anuncio nuevo, en el mismo conjunto, con el contenido de uno que no se puede editar. */
  onVersionNueva?: (attachTo: AttachToConjunto, semilla: SemillaDeCampana) => void;
  /** Se aplicó un cambio desde el editor: hay que volver a leer los anuncios. */
  onDatosCambiaron?: () => void;
  /** Los anuncios del cliente se están leyendo: se muestra eso en vez de una tabla vacía. */
  cargandoAnuncios?: boolean;
}) {
  const [data, setData] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [creando, setCreando] = useState(false);
  const [verSinCliente, setVerSinCliente] = useState(false);
  const [verFicha, setVerFicha] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchClientes());
      setError(null);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "No se pudo cargar");
    }
  }, []);

  useEffect(() => {
    // Cargar al montar es exactamente para lo que son los efectos; `load`
    // hace su propio setState adentro, el linter solo ve la llamada indirecta.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver nota de arriba
    void load();
  }, [load]);

  useEffect(() => {
    // Sin esto, abrir la ficha de un cliente y después cambiar a otro desde
    // el navbar dejaba la ficha del nuevo cliente abierta de entrada — que es
    // justo lo que se quitó: que aparezca sola en vez de pedirse.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver nota de arriba
    setVerFicha(false);
  }, [seleccionado]);

  async function crear() {
    if (!nuevo.trim()) return;
    setSaving("nuevo");
    try {
      const response = await fetch("/api/clientes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nuevo }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo crear");
      toast.success(`${nuevo} creado`);
      setNuevo("");
      setCreando(false);
      await load();
    } catch (issue) {
      toast.error(issue instanceof Error ? issue.message : "No se pudo crear");
    } finally {
      setSaving(null);
    }
  }

  async function guardar(id: string, cambios: CambiosPortfolio) {
    setSaving(id);
    try {
      const response = await fetch("/api/clientes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...cambios }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar");
      await load();
    } catch (issue) {
      toast.error(issue instanceof Error ? issue.message : "No se pudo guardar");
    } finally {
      setSaving(null);
    }
  }

  const portfolios = data?.portfolios ?? [];
  const seleccionadoObj = portfolios.find((p) => p.id === seleccionado) ?? null;
  const pendientes = portfolios.filter((p) => !p.archivado && faltantesDe(p).lista.length > 0);
  const porRevisar = portfolios.filter((p) => !p.archivado && p.needsReview);

  const anunciosPortfolios = performance.portfolios.map((item) => ({
    id: item.id,
    name: item.name,
    accountKeys: item.accounts.map((a) => a.id),
    segmentos: item.segmentos,
    // Clientes como SQM facturan desde varias cuentas de la misma
    // plataforma, una por país o mercado (SQM España, SQM SPN…). Sin esto,
    // AnunciosView solo podía sumarlas todas o separarlas por plataforma —
    // nunca ver "solo la cuenta de España".
    cuentas: item.accounts.map((a) => ({
      key: a.id,
      name: a.name,
      provider: a.provider,
    })),
  }));

  return (
    <div className="mx-auto w-full max-w-[1700px] p-4 md:p-6">
      <div className="mb-5">
        <h2 className="neo-section-title">
          Cliente
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/58">
          Usa el selector de cliente de la barra superior para abrir uno y ver
          sus campañas o crear nuevas. La página de Facebook y los países son
          obligatorios para publicar en Meta.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-[16px] border border-danger-deep/25 bg-danger-deep/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Crear cliente y cuentas sin dueño: antes vivían dentro de la lista
          de la izquierda; sin lista, se juntan acá arriba en una sola franja
          — siguen siendo las mismas dos acciones, solo que ya no dependen de
          un panel que ahora elige el selector del navbar. */}
      {(data?.canManage || (data && data.unassigned.length > 0)) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {creando ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={nuevo}
                onChange={(e) => setNuevo(e.target.value)}
                placeholder="Nombre del cliente"
                className="h-9 w-56 bg-field/60 text-xs"
              />
              <Button
                size="sm"
                onClick={() => void crear()}
                disabled={saving === "nuevo" || !nuevo.trim()}
                className="h-9 font-extrabold"
              >
                {saving === "nuevo" ? (
                  <OrbeDeBoton />
                ) : (
                  <Plus />
                )}
                Crear
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCreando(false)}
                className="h-9 text-foreground/50"
              >
                Cancelar
              </Button>
            </div>
          ) : (
            data?.canManage && (
              <button
                type="button"
                onClick={() => setCreando(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/8 px-3 py-1.5 text-xs font-bold text-brand transition-colors hover:bg-brand/15"
              >
                <Plus className="size-3.5" />
                Crear un cliente
              </button>
            )
          )}

          {data && data.unassigned.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setVerSinCliente(!verSinCliente)}
                className="inline-flex items-center gap-1.5 rounded-full bg-warn-deep/12 px-3 py-1.5 text-xs font-bold text-warn transition-colors hover:bg-warn-deep/20"
              >
                {data.unassigned.length} cuentas sin cliente
                {verSinCliente ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </button>
              {verSinCliente && (
                <Surface className="absolute top-full left-0 z-10 mt-1 max-h-64 w-72 space-y-0.5 overflow-y-auto p-1.5">
                  {data.unassigned.map((account) => (
                    <div
                      key={account.externalId}
                      className="rounded-lg px-2 py-1.5"
                    >
                      <p className="truncate text-xs font-semibold text-foreground/70">
                        {account.name}
                      </p>
                      <p className="metric-number mt-0.5 text-[0.6rem] text-foreground/40">
                        {platformLabel(account.provider)} · {account.externalId}
                      </p>
                    </div>
                  ))}
                </Surface>
              )}
            </div>
          )}
        </div>
      )}

      {(porRevisar.length > 0 || pendientes.length > 0) && !seleccionado && (
        <div className="mb-4 flex items-start gap-2 rounded-[16px] border border-brand/25 bg-brand/[0.07] px-4 py-3">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-brand" />
          <p className="text-xs leading-5 text-foreground/70">
            {porRevisar.length > 0 && (
              <>
                <strong className="text-foreground">
                  {porRevisar.length} con datos deducidos, no confirmados.
                </strong>{" "}
              </>
            )}
            {pendientes.length > 0 && (
              <>
                <strong className="text-foreground">
                  {pendientes.length}
                </strong>{" "}
                con página, país o correo pendiente.{" "}
              </>
            )}
            Ábrelo con el selector de cliente de arriba para revisar y
            completar lo que falte.
          </p>
        </div>
      )}

      {seleccionado !== null ? (
        <div className="mb-4 flex items-center justify-between gap-2">
          {/* Volver a "todos" — elegir un cliente puntual ya es trabajo del
              selector del navbar, no de un panel acá al lado. */}
          <button
            type="button"
            onClick={() => onSeleccionar(null)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand transition-colors hover:text-brand/75"
          >
            <ChevronLeft className="size-3.5" />
            Todos los clientes
          </button>
          {/* La ficha (página, países, correo, metas) ya no aparece sola al
              elegir un cliente — antes se sentía como un recuadro que se
              generaba solo cada vez, sin haberlo pedido. Ahora es un toggle:
              se abre cuando de verdad hace falta revisar o completar algo. */}
          {seleccionadoObj && (
            <button
              type="button"
              onClick={() => setVerFicha(!verFicha)}
              aria-expanded={verFicha}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-card/55 px-3 py-1.5 text-xs font-semibold text-foreground/65 transition-colors hover:text-foreground"
            >
              <Settings className="size-3.5" />
              Ficha del cliente
              {verFicha ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
          )}
        </div>
      ) : null}

      <div className="space-y-4">
        {seleccionadoObj && verFicha && (
          <Ficha
            // Prefijado para no colisionar con la key de <AnunciosView> de
            // abajo: las dos usaban el mismo id de cliente como key y, al
            // ser hijos del mismo div, React las trataba como la misma
            // entrada — "two children with the same key" — y terminaba
            // duplicando la Ficha en vez de reemplazarla al cerrar/abrir.
            key={`ficha-${seleccionadoObj.id}`}
            portfolio={seleccionadoObj}
            editable={Boolean(data?.canManage)}
            guardando={saving === seleccionadoObj.id}
            onGuardar={(cambios) => void guardar(seleccionadoObj.id, cambios)}
          />
        )}

        {/* Cuánto se invirtió y cuánto sobra: del mes, de las campañas y por segmento. */}

        {/* AnunciosView ya arma sus propias tarjetas (filtros, tabla); una
            tarjeta más envolviéndola solo agregaba un borde y una sombra
            extra alrededor de otras dos. */}
        {cargandoAnuncios ? (
          <Surface className="p-6 text-sm text-foreground/55">Leyendo las campañas y anuncios de este cliente…</Surface>
        ) : (
        <AnunciosView
          // Sin esto, cambiar de cliente en el selector del navbar no
          // reinicia el filtro interno de la tabla: `useState` solo lee
          // `portfolioIdFijo` en el primer montaje, así que el segundo
          // cliente elegido seguía mostrando las campañas del primero.
          key={`anuncios-${seleccionadoObj?.id ?? "todos"}`}
          performance={performance}
          portfolios={anunciosPortfolios}
          portfolioIdFijo={seleccionadoObj?.id}
          onCrearCampana={onCrearCampana}
          onAbrirImpulsar={onAbrirImpulsar}
          onAgregarConjunto={onAgregarConjunto}
          onAgregarAnuncio={onAgregarAnuncio}
          onImpulsar={onImpulsar}
          onVersionNueva={onVersionNueva}
          onDatosCambiaron={onDatosCambiaron}
          kpiPrincipal={seleccionadoObj?.kpiPrincipal ?? null}
          puedeAprobar={Boolean(data?.canApprove)}
        />
        )}
      </div>
    </div>
  );
}

function Ficha({
  portfolio,
  editable,
  guardando,
  onGuardar,
}: {
  portfolio: Portfolio;
  editable: boolean;
  guardando: boolean;
  onGuardar: (cambios: CambiosPortfolio) => void;
}) {
  const [mostrarAjustes, setMostrarAjustes] = useState(false);
  const [pageId, setPageId] = useState(portfolio.pageId ?? "");
  const [countries, setCountries] = useState(portfolio.countries.join(", "));
  const [website, setWebsite] = useState(portfolio.website ?? "");
  const [email, setEmail] = useState(portfolio.contactEmail ?? "");
  const [metaCpa, setMetaCpa] = useState(
    portfolio.targetCpaMicros !== null
      ? String(portfolio.targetCpaMicros / 1_000_000)
      : "",
  );
  const [metaRoas, setMetaRoas] = useState(
    portfolio.targetRoas !== null ? String(portfolio.targetRoas) : "",
  );
  const [kpiPrincipal, setKpiPrincipal] = useState<string>(portfolio.kpiPrincipal ?? "");
  const [presupuestoMes, setPresupuestoMes] = useState(
    portfolio.monthlyBudgetMicros !== null ? String(portfolio.monthlyBudgetMicros / 1_000_000) : "",
  );
  const [monedaPresupuesto, setMonedaPresupuesto] = useState(portfolio.monthlyBudgetCurrency ?? "");
  // Presupuesto mensual de cada segmento (texto, en la moneda de arriba).
  const presupuestoInicialDeSegmento = (id: string) => {
    const p = portfolio.segmentos?.find((x) => x.id === id)?.presupuesto;
    return p ? String(p.micros / 1_000_000) : "";
  };
  const [presupuestoSegmento, setPresupuestoSegmento] = useState<Record<string, string>>(() =>
    Object.fromEntries((portfolio.segmentos ?? []).map((x) => [x.id, x.presupuesto ? String(x.presupuesto.micros / 1_000_000) : ""])),
  );
  const [ga4Propiedad, setGa4Propiedad] = useState(portfolio.ga4PropertyId ?? "");
  const [empresa, setEmpresa] = useState<string>(portfolio.empresa ?? "");
  const [archivado, setArchivado] = useState<boolean>(portfolio.archivado === true);
  const [gtmEstado, setGtmEstado] = useState<string>(portfolio.gtmEstado ?? "");
  const [gtmContenedor, setGtmContenedor] = useState(portfolio.gtmContainerId ?? "");
  const [metaCpm, setMetaCpm] = useState(
    portfolio.metas.cpmMicros !== null ? String(portfolio.metas.cpmMicros / 1_000_000) : "",
  );
  // El CTR se muestra y se escribe en % (1,5), no como fracción.
  const [metaCtr, setMetaCtr] = useState(
    portfolio.metas.ctrMinimo !== null ? String(Math.round(portfolio.metas.ctrMinimo * 10_000) / 100) : "",
  );
  const [maxFrecuencia, setMaxFrecuencia] = useState(
    portfolio.metas.frecuenciaMaxima !== null ? String(portfolio.metas.frecuenciaMaxima) : "",
  );
  const cambiado =
    empresa !== (portfolio.empresa ?? "") ||
    archivado !== (portfolio.archivado === true) ||
    ga4Propiedad !== (portfolio.ga4PropertyId ?? "") ||
    presupuestoMes !== (portfolio.monthlyBudgetMicros !== null ? String(portfolio.monthlyBudgetMicros / 1_000_000) : "") ||
    monedaPresupuesto !== (portfolio.monthlyBudgetCurrency ?? "") ||
    (portfolio.segmentos ?? []).some((x) => (presupuestoSegmento[x.id] ?? "") !== presupuestoInicialDeSegmento(x.id)) ||
    gtmEstado !== (portfolio.gtmEstado ?? "") ||
    gtmContenedor !== (portfolio.gtmContainerId ?? "") ||
    kpiPrincipal !== (portfolio.kpiPrincipal ?? "") ||
    metaCpm !== (portfolio.metas.cpmMicros !== null ? String(portfolio.metas.cpmMicros / 1_000_000) : "") ||
    metaCtr !== (portfolio.metas.ctrMinimo !== null ? String(Math.round(portfolio.metas.ctrMinimo * 10_000) / 100) : "") ||
    maxFrecuencia !== (portfolio.metas.frecuenciaMaxima !== null ? String(portfolio.metas.frecuenciaMaxima) : "") ||
    pageId !== (portfolio.pageId ?? "") ||
    countries !== portfolio.countries.join(", ") ||
    website !== (portfolio.website ?? "") ||
    email !== (portfolio.contactEmail ?? "") ||
    metaCpa !== (portfolio.targetCpaMicros !== null ? String(portfolio.targetCpaMicros / 1_000_000) : "") ||
    metaRoas !== (portfolio.targetRoas !== null ? String(portfolio.targetRoas) : "");

  const {
    porPlataforma,
    cuentasMeta,
    necesitaDesglosePorPais,
    lista: faltantes,
  } = faltantesDe(portfolio);
  const sinResolver = portfolio.accounts.filter((c) => !c.provider).length;

  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-foreground/10 p-4">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-bold text-foreground">
            {portfolio.name}
            {portfolio.needsReview && (
              <span className="font-micro rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[0.55rem] text-brand">
                POR CONFIRMAR
              </span>
            )}
          </h3>
          <p className="metric-number mt-1 text-[0.62rem] text-foreground/40">
            {portfolio.id}
            {portfolio.contactEmail ? ` · ${portfolio.contactEmail}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {porPlataforma.length === 0 ? (
            <span className="font-micro rounded-full border border-foreground/12 px-2.5 py-1 text-[0.58rem] text-foreground/45">
              SIN CUENTAS
            </span>
          ) : (
            porPlataforma.map(([provider, total]) => (
              <span
                key={provider}
                className="rounded-full border border-brand/30 bg-brand/12 px-2.5 py-1 text-[0.62rem] font-bold text-brand"
              >
                {platformLabel(provider)} · {total}
              </span>
            ))
          )}
          {sinResolver > 0 && (
            <span className="rounded-full border border-warn-deep/25 bg-warn-deep/[0.08] px-2.5 py-1 text-[0.62rem] font-bold text-warn">
              {sinResolver} sin identificar
            </span>
          )}
          {editable && (
            <button
              type="button"
              onClick={() => setMostrarAjustes(!mostrarAjustes)}
              title="Ajustes del cliente"
              aria-label="Ajustes del cliente"
              aria-expanded={mostrarAjustes}
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                mostrarAjustes
                  ? "border-brand/40 bg-brand/12 text-brand"
                  : "border-foreground/12 text-foreground/55 hover:border-foreground/30 hover:text-foreground",
              )}
            >
              <Settings className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {faltantes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {faltantes.map((falta) => (
            <span
              key={falta}
              className="rounded-full border border-warn-deep/25 bg-warn-deep/[0.08] px-2 py-0.5 text-[0.6rem] font-bold text-warn"
            >
              {falta}
            </span>
          ))}
        </div>
      )}

      {mostrarAjustes && (
        <div className="p-4">
          <ul className="divide-y divide-foreground/8 rounded-xl border border-foreground/10 bg-field/40">
            {portfolio.accounts.length === 0 ? (
              <li className="px-3 py-2 text-xs text-foreground/45">
                Sin cuentas vinculadas
              </li>
            ) : (
              portfolio.accounts.map((cuenta) => (
                <li key={cuenta.externalId} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate text-xs text-foreground/78">
                        {cuenta.name}
                      </span>
                      {!cuenta.conDatos && (
                        <span className="font-micro shrink-0 rounded-full border border-foreground/12 px-1.5 py-0.5 text-[0.52rem] text-foreground/40">
                          SIN DATOS ESTE MES
                        </span>
                      )}
                    </span>
                    <span className="metric-number shrink-0 text-[0.62rem] text-foreground/45">
                      {cuenta.provider
                        ? `${platformLabel(cuenta.provider)} · `
                        : ""}
                      {cuenta.externalId}
                    </span>
                  </div>
                  {/*
                    Con más de una cuenta de Meta, cada una necesita su propia
                    página: el campo único de más abajo no distingue cuál es
                    cuál.
                  */}
                  {cuenta.provider === "meta" && cuentasMeta.length > 1 && (
                    <PaginaDeCuenta
                      cuenta={cuenta}
                      editable={editable}
                      onGuardar={(pageId) =>
                        onGuardar({
                          accountPageId: {
                            externalId: cuenta.externalId,
                            pageId,
                          },
                        })
                      }
                    />
                  )}
                  {cuenta.provider === "meta" && (
                    <PixelesDeCuenta
                      cuenta={cuenta}
                      editable={editable}
                      onAgregar={(pixelId, label) =>
                        onGuardar({
                          accountPixelAdd: {
                            externalId: cuenta.externalId,
                            pixelId,
                            label,
                          },
                        })
                      }
                      onQuitar={(pixelRowId) =>
                        onGuardar({
                          accountPixelRemove: {
                            externalId: cuenta.externalId,
                            pixelRowId,
                          },
                        })
                      }
                    />
                  )}
                  {necesitaDesglosePorPais && cuenta.provider && (
                    <PaisesDeCuenta
                      cuenta={cuenta}
                      editable={editable}
                      onGuardar={(countries) =>
                        onGuardar({
                          accountCountries: {
                            externalId: cuenta.externalId,
                            countries,
                          },
                        })
                      }
                    />
                  )}
                </li>
              ))
            )}
          </ul>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="font-micro mb-1 block text-[0.58rem] text-foreground/45">
                SITIO WEB
              </label>
              <Input
                value={website}
                disabled={!editable}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://ejemplo.cl"
                className="h-9 bg-field/60 text-xs"
              />
              <p className="mt-1 text-[0.62rem] leading-4 text-foreground/38">
                El Orb la usa como URL de destino por defecto al proponer una
                campaña nueva, si nadie da una explícita.
              </p>
            </div>
            <div>
              <label className="font-micro mb-1 block text-[0.58rem] text-foreground/45">
                CORREO DE CONTACTO
              </label>
              <Input
                value={email}
                disabled={!editable}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Sin correo"
                className="h-9 bg-field/60 text-xs"
              />
            </div>
            {cuentasMeta.length <= 1 && (
              <div>
                <label className="font-micro mb-1 block text-[0.58rem] text-foreground/45">
                  PÁGINA DE FACEBOOK
                </label>
                <Input
                  value={pageId}
                  disabled={!editable}
                  onChange={(e) => setPageId(e.target.value)}
                  placeholder="Sin página"
                  className="h-9 bg-field/60 text-xs"
                />
              </div>
            )}
            {!necesitaDesglosePorPais && (
              <div>
                <label className="font-micro mb-1 block text-[0.58rem] text-foreground/45">
                  DÓNDE SE MUESTRAN LOS ANUNCIOS
                </label>
                <Input
                  value={countries}
                  disabled={!editable}
                  onChange={(e) => setCountries(e.target.value)}
                  placeholder="Sin definir"
                  className="h-9 bg-field/60 text-xs"
                />
                <p className="mt-1 text-[0.62rem] leading-4 text-foreground/38">
                  Países de segmentación. No tiene relación con la moneda de la
                  cuenta.
                </p>
              </div>
            )}
          </div>
          {necesitaDesglosePorPais && (
            <p className="mt-3 text-[0.62rem] leading-4 text-foreground/38">
              Este cliente tiene más de una cuenta en la misma plataforma: los
              países se definen por cuenta, en la lista de arriba.
            </p>
          )}

          {/*
            Sin esto el motor de reglas no tiene con qué comparar: un CPA de
            $8.000 es excelente para un cliente y pésimo para otro. Vacío a
            propósito por defecto — sin meta, este cliente simplemente no
            genera recomendaciones de presupuesto, en vez de usar un umbral
            inventado.
          */}
          <div className="mt-3 grid gap-3 border-t border-foreground/8 pt-3 sm:grid-cols-2">
            <div>
              <label className="font-micro mb-1 block text-[0.58rem] text-foreground/45">
                META DE CPA (EN LA MONEDA DE LA CUENTA)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={metaCpa}
                disabled={!editable}
                onChange={(e) => setMetaCpa(e.target.value)}
                placeholder="Sin meta definida"
                className="h-9 bg-field/60 text-xs"
              />
            </div>
            <div>
              <label className="font-micro mb-1 block text-[0.58rem] text-foreground/45">
                META DE ROAS (EJ. 3.5)
              </label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={metaRoas}
                disabled={!editable}
                onChange={(e) => setMetaRoas(e.target.value)}
                placeholder="Sin meta definida"
                className="h-9 bg-field/60 text-xs"
              />
            </div>
          </div>
          <p className="mt-1 text-[0.62rem] leading-4 text-foreground/38">
            Sin estas dos metas, este cliente no genera recomendaciones en la
            cola de Decisiones.
          </p>

          {/*
            Qué es "buen rendimiento" depende del cliente: uno de awareness se
            juzga por alcance y CPM, no por CPA. El KPI principal decide qué
            columnas se ven primero en sus tablas y cómo lo lee el asistente;
            las metas de abajo son contra qué se le compara.
          */}
          <div className="mt-3 border-t border-foreground/8 pt-3">
            <label className="font-micro mb-1 block text-[0.58rem] text-foreground/45">
              PRESUPUESTO MENSUAL
            </label>
            <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
              <input
                value={presupuestoMes}
                disabled={!editable}
                inputMode="decimal"
                onChange={(e) => setPresupuestoMes(e.target.value)}
                placeholder="Ej: 3000000"
                className="h-9 w-full rounded-md border border-input bg-field/60 px-3 text-xs"
              />
              <input
                value={monedaPresupuesto}
                disabled={!editable}
                maxLength={3}
                onChange={(e) => setMonedaPresupuesto(e.target.value.toUpperCase())}
                placeholder="CLP"
                className="h-9 w-full rounded-md border border-input bg-field/60 px-3 text-xs"
              />
            </div>
            <p className="mt-1 text-[0.62rem] leading-4 text-foreground/38">
              Con esto la pantalla del cliente muestra cuánto queda del mes, a qué ritmo va y cómo cerraría. Sin presupuesto mensual se
              muestra la suma de lo asignado a sus campañas.
            </p>
            {(portfolio.segmentos ?? []).length > 0 && (
              <div className="mt-2 space-y-1.5">
                <p className="font-micro text-[0.58rem] text-foreground/45">PRESUPUESTO MENSUAL POR SEGMENTO (EN LA MISMA MONEDA)</p>
                {(portfolio.segmentos ?? []).map((x) => (
                  <div key={x.id} className="grid grid-cols-[1fr_9rem] items-center gap-2">
                    <span className="truncate text-xs text-foreground/75">{x.nombre}</span>
                    <input
                      value={presupuestoSegmento[x.id] ?? ""}
                      disabled={!editable}
                      inputMode="decimal"
                      aria-label={`Presupuesto mensual de ${x.nombre}`}
                      onChange={(e) => setPresupuestoSegmento((actual) => ({ ...actual, [x.id]: e.target.value.replace(/[^\d.,]/g, "") }))}
                      placeholder="Sin presupuesto"
                      className="h-8 w-full rounded-md border border-input bg-field/60 px-3 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-3 border-t border-foreground/8 pt-3">
            <label className="font-micro mb-1 block text-[0.58rem] text-foreground/45">
              PROPIEDADES DE GOOGLE ANALYTICS 4
            </label>
            <input
              value={ga4Propiedad}
              disabled={!editable}
              onChange={(e) => setGa4Propiedad(e.target.value)}
              placeholder="Ej: 307451372 — o varias separadas por coma"
              className="h-9 w-full rounded-md border border-input bg-field/60 px-3 text-xs"
            />
            <p className="mt-1 text-[0.62rem] leading-4 text-foreground/38">
              Con el ID de la propiedad (o de varias, separadas por coma), la pantalla del cliente vigila la salud de la medición: eventos clave mal marcados,
              leads que no cuentan o que dejaron de llegar. Lo ves en GA4 → Administrar → Detalles de la propiedad.
            </p>
          </div>
          <div className="mt-3 border-t border-foreground/8 pt-3">
            <label className="font-micro mb-1 block text-[0.58rem] text-foreground/45">EMPRESA DEL GRUPO</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={empresa}
                disabled={!editable}
                onChange={(e) => setEmpresa(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-field/60 px-3 text-xs"
              >
                <option value="">Sin asignar</option>
                <option value="mgc">MGC</option>
                <option value="wiwo">WIWO</option>
              </select>
              <label className="flex items-center gap-2 text-xs text-foreground/70">
                <input type="checkbox" checked={archivado} disabled={!editable} onChange={(e) => setArchivado(e.target.checked)} />
                Ya no es cliente (archivar)
              </label>
            </div>
            <p className="mt-1 text-[0.62rem] leading-4 text-foreground/38">
              Solo ordena los selectores: las dos empresas trabajan juntas y todos ven a todos. Archivar lo saca de los selectores sin
              borrar sus datos.
            </p>
          </div>
          {/* Medición: sin GTM la plataforma avisa "NO cuenta con GTM". */}
          <div className="mt-3 border-t border-foreground/8 pt-3">
            <label className="font-micro mb-1 block text-[0.58rem] text-foreground/45">
              GOOGLE TAG MANAGER
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={gtmEstado}
                disabled={!editable}
                onChange={(e) => setGtmEstado(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-field/60 px-3 text-xs"
              >
                <option value="">Sin verificar</option>
                <option value="tiene">Cuenta con GTM</option>
                <option value="no_tiene">NO cuenta con GTM</option>
              </select>
              {gtmEstado === "tiene" && (
                <input
                  value={gtmContenedor}
                  disabled={!editable}
                  onChange={(e) => setGtmContenedor(e.target.value)}
                  placeholder="GTM-ABC1234"
                  className="h-9 w-full rounded-md border border-input bg-field/60 px-3 text-xs"
                />
              )}
            </div>
            <p className="mt-1 text-[0.62rem] leading-4 text-foreground/38">
              Un cliente marcado sin GTM aparece en Alertas y con un aviso en su pantalla. «Sin verificar» no genera ninguna alerta.
            </p>
          </div>
          <div className="mt-3 border-t border-foreground/8 pt-3">
            <label className="font-micro mb-1 block text-[0.58rem] text-foreground/45">
              KPI PRINCIPAL DE ESTE CLIENTE
            </label>
            <select
              value={kpiPrincipal}
              disabled={!editable}
              onChange={(e) => setKpiPrincipal(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-field/60 px-3 text-xs"
            >
              <option value="">Sin definir</option>
              {KPIS_PRINCIPALES.map((k) => (
                <option key={k} value={k}>
                  {DEFINICION_KPI[k].etiqueta}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[0.62rem] leading-4 text-foreground/38">
              {kpiPrincipal && (KPIS_PRINCIPALES as readonly string[]).includes(kpiPrincipal)
                ? DEFINICION_KPI[kpiPrincipal as KpiPrincipal].descripcion
                : "Define qué se mira primero en las tablas y en las recomendaciones de este cliente."}
            </p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="font-micro mb-1 block text-[0.58rem] text-foreground/45">
                CPM OBJETIVO
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={metaCpm}
                disabled={!editable}
                onChange={(e) => setMetaCpm(e.target.value)}
                placeholder="Sin meta"
                className="h-9 bg-field/60 text-xs"
              />
            </div>
            <div>
              <label className="font-micro mb-1 block text-[0.58rem] text-foreground/45">
                CTR MÍNIMO (%)
              </label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={metaCtr}
                disabled={!editable}
                onChange={(e) => setMetaCtr(e.target.value)}
                placeholder="Ej. 1.5"
                className="h-9 bg-field/60 text-xs"
              />
            </div>
            <div>
              <label className="font-micro mb-1 block text-[0.58rem] text-foreground/45">
                FRECUENCIA MÁXIMA
              </label>
              <Input
                type="number"
                min="1"
                max="20"
                step="0.1"
                value={maxFrecuencia}
                disabled={!editable}
                onChange={(e) => setMaxFrecuencia(e.target.value)}
                placeholder="Ej. 3.5"
                className="h-9 bg-field/60 text-xs"
              />
            </div>
          </div>

          {portfolio.needsReview && portfolio.reviewNote && (
            <p className="mt-3 rounded-xl border border-brand/20 bg-brand/[0.06] px-3 py-2 text-[0.68rem] leading-5 text-foreground/62">
              {portfolio.reviewNote}
              {editable && (
                <button
                  type="button"
                  onClick={() => onGuardar({ needsReview: false })}
                  className="ml-2 font-bold text-brand underline-offset-2 hover:underline"
                >
                  Confirmar
                </button>
              )}
            </p>
          )}

          {editable && (
            <Button
              size="sm"
              variant="outline"
              disabled={!cambiado || guardando}
              onClick={() =>
                onGuardar({
                  pageId: pageId.trim() || null,
                  website: website.trim() || null,
                  contactEmail: email.trim() || null,
                  countries: countries
                    .split(",")
                    .map((c) => c.trim())
                    .filter(Boolean),
                  targetCpaMicros: metaCpa.trim()
                    ? Math.round(Number(metaCpa) * 1_000_000)
                    : null,
                  targetRoas: metaRoas.trim() ? Number(metaRoas) : null,
                  kpiPrincipal: kpiPrincipal ? (kpiPrincipal as KpiPrincipal) : null,
                  ga4PropertyId: ga4Propiedad.trim() || null,
                  empresa: empresa ? (empresa as "mgc" | "wiwo") : null,
                  archivado,
                  monthlyBudgetMicros: presupuestoMes.trim() ? Math.round(Number(presupuestoMes) * 1_000_000) : null,
                  monthlyBudgetCurrency: presupuestoMes.trim() ? monedaPresupuesto.trim().toUpperCase() || null : null,
                  ...((portfolio.segmentos ?? []).length > 0
                    ? {
                        segmentBudgets: Object.fromEntries(
                          (portfolio.segmentos ?? []).map((x) => {
                            const n = Number((presupuestoSegmento[x.id] ?? "").replace(",", "."));
                            return [x.id, (presupuestoSegmento[x.id] ?? "").trim() && n > 0 ? Math.round(n * 1_000_000) : null];
                          }),
                        ),
                        segmentBudgetCurrency: monedaPresupuesto.trim().toUpperCase() || null,
                      }
                    : {}),
                  gtmEstado: gtmEstado ? (gtmEstado as GtmEstado) : null,
                  gtmContainerId: gtmEstado === "tiene" && gtmContenedor.trim() ? gtmContenedor.trim() : null,
                  targetCpmMicros: metaCpm.trim() ? Math.round(Number(metaCpm) * 1_000_000) : null,
                  targetCtr: metaCtr.trim() ? Number(metaCtr) / 100 : null,
                  maxFrequency: maxFrecuencia.trim() ? Number(maxFrecuencia) : null,
                })
              }
              className="mt-3 border-foreground/12 bg-transparent text-foreground/70"
            >
              {guardando ? <OrbeDeBoton /> : null}
              Guardar
            </Button>
          )}
        </div>
      )}
    </Surface>
  );
}

/**
 * Página de Facebook de una cuenta de Meta puntual, con su propio guardado.
 *
 * Vive aparte del botón "Guardar" del cliente porque edita un dato distinto
 * —una fila de `portfolio_accounts`, no una columna de `portfolios`— y varias
 * cuentas del mismo cliente se editan de forma independiente.
 */
function PaginaDeCuenta({
  cuenta,
  editable,
  onGuardar,
}: {
  cuenta: CuentaVinculada;
  editable: boolean;
  onGuardar: (pageId: string | null) => void;
}) {
  const [valor, setValor] = useState(cuenta.pageId ?? "");
  const cambiado = valor.trim() !== (cuenta.pageId ?? "");

  return (
    <div className="mt-2 flex items-center gap-2 pl-1">
      <span className="font-micro shrink-0 text-[0.55rem] text-foreground/40">
        PÁGINA
      </span>
      <Input
        value={valor}
        disabled={!editable}
        onChange={(e) => setValor(e.target.value)}
        placeholder="Sin página"
        className="h-7 bg-field/60 text-[0.68rem]"
      />
      {editable && cambiado && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onGuardar(valor.trim() || null)}
          className="h-7 shrink-0 border-foreground/12 bg-transparent px-2.5 text-[0.62rem] text-foreground/70"
        >
          Guardar
        </Button>
      )}
    </div>
  );
}

/**
 * Píxeles de Meta de una cuenta puntual, con su propio guardado.
 *
 * A diferencia de la página, no tiene un campo de respaldo a nivel cliente
 * —nunca existió uno— así que se muestra siempre para cada cuenta de Meta,
 * no solo cuando el cliente tiene más de una. Puede haber más de un píxel
 * (MGC: Converse y Coliseum en la misma cuenta) — de ahí la lista en vez de
 * un solo campo.
 */
function PixelesDeCuenta({
  cuenta,
  editable,
  onAgregar,
  onQuitar,
}: {
  cuenta: CuentaVinculada;
  editable: boolean;
  onAgregar: (pixelId: string, label: string | null) => void;
  onQuitar: (pixelRowId: string) => void;
}) {
  const [nuevoId, setNuevoId] = useState("");
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");

  return (
    <div className="mt-2 pl-1">
      <span className="font-micro block text-[0.55rem] text-foreground/40">
        PÍXELES
      </span>
      {cuenta.pixels.length === 0 && (
        <p className="mt-1 text-[0.65rem] text-foreground/40">
          Sin píxel: no se puede publicar leads/ventas en esta cuenta.
        </p>
      )}
      {cuenta.pixels.length > 0 && (
        <ul className="mt-1 space-y-1">
          {cuenta.pixels.map((pixel) => (
            <li key={pixel.id} className="flex items-center gap-2">
              <span className="metric-number min-w-0 flex-1 truncate text-[0.68rem] text-foreground/70">
                {pixel.label ? `${pixel.label} · ${pixel.pixelId}` : pixel.pixelId}
              </span>
              {editable && (
                <button
                  type="button"
                  onClick={() => onQuitar(pixel.id)}
                  className="shrink-0 text-[0.62rem] font-semibold text-foreground/40 hover:text-danger"
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            value={nuevoId}
            onChange={(e) => setNuevoId(e.target.value)}
            placeholder="Id del píxel"
            className="h-7 bg-field/60 text-[0.68rem]"
          />
          <Input
            value={nuevaEtiqueta}
            onChange={(e) => setNuevaEtiqueta(e.target.value)}
            placeholder="Etiqueta (ej. Converse)"
            className="h-7 bg-field/60 text-[0.68rem]"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!nuevoId.trim()}
            onClick={() => {
              onAgregar(nuevoId.trim(), nuevaEtiqueta.trim() || null);
              setNuevoId("");
              setNuevaEtiqueta("");
            }}
            className="h-7 shrink-0 border-foreground/12 bg-transparent px-2.5 text-[0.62rem] text-foreground/70"
          >
            Agregar
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Países de un país-por-cuenta que se guessa desde el nombre y se confirma.
 *
 * ALO Group nombra cada cuenta con su país: "ALO Group Chile", "ALO Group
 * Panamá". Ese nombre es una pista, no un dato confirmado —la regla del
 * proyecto es no inventar—, así que solo sirve para **prellenar** el campo
 * vacío; nada se guarda hasta que alguien aprieta "Guardar".
 */
const PAIS_POR_PALABRA: Record<string, string> = {
  chile: "CL",
  argentina: "AR",
  peru: "PE",
  perú: "PE",
  colombia: "CO",
  ecuador: "EC",
  panama: "PA",
  panamá: "PA",
  mexico: "MX",
  méxico: "MX",
  espana: "ES",
  españa: "ES",
  bolivia: "BO",
  uruguay: "UY",
  paraguay: "PY",
  venezuela: "VE",
  brasil: "BR",
  "costa rica": "CR",
  guatemala: "GT",
  honduras: "HN",
  "el salvador": "SV",
  nicaragua: "NI",
  "republica dominicana": "DO",
  "república dominicana": "DO",
};

/** Sugerencia de país a partir del nombre de la cuenta. Vacía si no reconoce nada. */
function sugerirPaisesDesdeNombre(nombre: string): string {
  const normalizado = nombre.toLowerCase();
  const encontrados = Object.entries(PAIS_POR_PALABRA)
    .filter(([palabra]) => normalizado.includes(palabra))
    .map(([, codigo]) => codigo);
  return [...new Set(encontrados)].join(", ");
}

function PaisesDeCuenta({
  cuenta,
  editable,
  onGuardar,
}: {
  cuenta: CuentaVinculada;
  editable: boolean;
  onGuardar: (countries: string[]) => void;
}) {
  const guardado = cuenta.countries.join(", ");
  // Sin país guardado, se ofrece una sugerencia leída del nombre de la
  // cuenta —marcada como tal— en vez de dejar el campo en blanco sin pistas.
  const sugerencia = guardado ? "" : sugerirPaisesDesdeNombre(cuenta.name);
  const [valor, setValor] = useState(guardado || sugerencia);
  const esSugerencia = !guardado && valor === sugerencia && sugerencia !== "";
  const cambiado = valor.trim() !== guardado;

  return (
    <div className="mt-1.5 flex items-center gap-2 pl-1">
      <span className="font-micro shrink-0 text-[0.55rem] text-foreground/40">
        PAÍSES
      </span>
      <Input
        value={valor}
        disabled={!editable}
        onChange={(e) => setValor(e.target.value)}
        placeholder="Sin definir"
        className={cn(
          "h-7 bg-field/60 text-[0.68rem]",
          esSugerencia && "text-brand/70",
        )}
      />
      {esSugerencia && (
        <span className="font-micro shrink-0 text-[0.52rem] text-brand/60">
          SUGERIDO DEL NOMBRE
        </span>
      )}
      {editable && cambiado && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onGuardar(
              valor
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean),
            )
          }
          className="h-7 shrink-0 border-foreground/12 bg-transparent px-2.5 text-[0.62rem] text-foreground/70"
        >
          Guardar
        </Button>
      )}
    </div>
  );
}
