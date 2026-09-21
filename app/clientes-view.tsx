"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
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
   * Países de segmentación de esta cuenta puntual, no del cliente entero.
   *
   * ALO Group lo exige: seis cuentas de Google, una por país. Un solo campo
   * de países por cliente no dice cuál cuenta apunta a cuál.
   */
  countries: string[];
};

/** Lo que puede guardarse desde la ficha de un cliente. */
type CambiosPortfolio = Partial<Portfolio> & {
  accountPageId?: { externalId: string; pageId: string | null };
  accountCountries?: { externalId: string; countries: string[] };
};

type Portfolio = {
  id: string;
  name: string;
  pageId: string | null;
  instagramId: string | null;
  countries: string[];
  contactEmail: string | null;
  needsReview: boolean;
  reviewNote: string | null;
  notes: string | null;
  targetCpaMicros: number | null;
  targetRoas: number | null;
  accountIds: string[];
  accounts: CuentaVinculada[];
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
  onAgregarConjunto,
  onAgregarAnuncio,
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
  onCrearCampana: (portfolioId: string) => void;
  onAgregarConjunto: (attachTo: AttachToCampana) => void;
  onAgregarAnuncio: (attachTo: AttachToConjunto) => void;
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
  const pendientes = portfolios.filter((p) => faltantesDe(p).lista.length > 0);
  const porRevisar = portfolios.filter((p) => p.needsReview);

  const anunciosPortfolios = performance.portfolios.map((item) => ({
    id: item.id,
    name: item.name,
    accountKeys: item.accounts.map((a) => a.id),
  }));

  return (
    <div className="mx-auto w-full max-w-[1700px] p-4 md:p-6">
      <div className="mb-5">
        <p className="font-micro mb-3 inline-flex items-center gap-2 text-[0.62rem] text-foreground/50">
          <Building2 className="size-3 text-brand" />
          Cartera · clientes y sus anuncios
        </p>
        <h2 className="neo-section-title">
          Clientes
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
            key={seleccionadoObj.id}
            portfolio={seleccionadoObj}
            editable={Boolean(data?.canManage)}
            guardando={saving === seleccionadoObj.id}
            onGuardar={(cambios) => void guardar(seleccionadoObj.id, cambios)}
          />
        )}

        {/* AnunciosView ya arma sus propias tarjetas (filtros, tabla); una
            tarjeta más envolviéndola solo agregaba un borde y una sombra
            extra alrededor de otras dos. */}
        <AnunciosView
          // Sin esto, cambiar de cliente en el selector del navbar no
          // reinicia el filtro interno de la tabla: `useState` solo lee
          // `portfolioIdFijo` en el primer montaje, así que el segundo
          // cliente elegido seguía mostrando las campañas del primero.
          key={seleccionadoObj?.id ?? "todos"}
          performance={performance}
          portfolios={anunciosPortfolios}
          portfolioIdFijo={seleccionadoObj?.id}
          onCrearCampana={onCrearCampana}
          onAgregarConjunto={onAgregarConjunto}
          onAgregarAnuncio={onAgregarAnuncio}
          puedeAprobar={Boolean(data?.canApprove)}
        />
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
  const [email, setEmail] = useState(portfolio.contactEmail ?? "");
  const [metaCpa, setMetaCpa] = useState(
    portfolio.targetCpaMicros !== null
      ? String(portfolio.targetCpaMicros / 1_000_000)
      : "",
  );
  const [metaRoas, setMetaRoas] = useState(
    portfolio.targetRoas !== null ? String(portfolio.targetRoas) : "",
  );
  const cambiado =
    pageId !== (portfolio.pageId ?? "") ||
    countries !== portfolio.countries.join(", ") ||
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
                  contactEmail: email.trim() || null,
                  countries: countries
                    .split(",")
                    .map((c) => c.trim())
                    .filter(Boolean),
                  targetCpaMicros: metaCpa.trim()
                    ? Math.round(Number(metaCpa) * 1_000_000)
                    : null,
                  targetRoas: metaRoas.trim() ? Number(metaRoas) : null,
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
