"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Search, Settings2, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import type { AdSummary, PerformanceSnapshot } from "@/lib/performance-store";
import { ACTIVE_PLATFORMS, platformLabel, type Platform } from "@/lib/plataformas";
import { cn } from "@/lib/utils";
import { GestionarCampanaDialog, type CampanaGestionable } from "./gestionar-campana";
import { Surface } from "./ui";

type Nivel = "campana" | "conjunto" | "anuncio";

const NIVELES: Array<{ id: Nivel; label: string }> = [
  { id: "campana", label: "Campañas" },
  { id: "conjunto", label: "Conjuntos" },
  { id: "anuncio", label: "Anuncios" },
];

type EstadoFiltro = "todos" | "activo" | "pausado" | "sin_actividad";

const ESTADOS: Array<{ id: EstadoFiltro; label: string }> = [
  { id: "todos", label: "Todo estado" },
  { id: "activo", label: "Solo activos" },
  { id: "pausado", label: "Solo pausados" },
  { id: "sin_actividad", label: "Sin actividad en el rango" },
];

type Fila = {
  clave: string;
  nombre: string;
  contexto: string;
  provider: string;
  accountKey: string;
  accountName: string;
  /** Ruta completa, para poder bajar un nivel. */
  campaignName: string;
  /** Id nativo de la plataforma. Lo exige Windsor para escribir sobre esto. */
  campaignId: string | null;
  adsetName: string | null;
  adsetId: string | null;
  adId: string | null;
  /** Id de la cuenta en la plataforma, no el de WiWO.ADS. Windsor lo exige para escribir. */
  accountId: string;
  currency: string | null;
  objetivo: string | null;
  status: string | null;
  /** false: existe, pero la plataforma no reporta nada en el rango. */
  conActividad: boolean;
  spendMicros: number;
  impressions: number;
  clicks: number;
  resultado: number | null;
};

/** Qué campaña y qué conjunto están abiertos. */
type Seleccion = {
  accountKey: string;
  provider: string;
  accountName: string;
  campana: string;
  conjunto: string | null;
};

/**
 * Vista tipo administrador de anuncios, con todas las plataformas juntas.
 *
 * Los tres niveles son los mismos en Google y en Meta aunque cada una los llame
 * distinto: campaña, conjunto (grupo de anuncios en Google) y anuncio. Se
 * agregan desde una única lectura a nivel de anuncio.
 *
 * La navegación copia la de Meta, que es la que el equipo ya tiene en la mano:
 * se abre una campaña y la tabla pasa a mostrar **solo sus conjuntos**; se abre
 * un conjunto y quedan **solo sus anuncios**. Los filtros no se ajustan a mano
 * —la plataforma y la cuenta salen de lo que se abrió— y la ruta de migas
 * permite subir.
 *
 * Dos casos que la vista no esconde: Performance Max no tiene conjunto ni
 * anuncio, y los anuncios responsivos de búsqueda de Google traen todos sus
 * títulos concatenados como nombre.
 */
export type AttachToCampana = {
  portfolioId: string;
  platform: Platform;
  accountId: string;
  campaignId: string;
  campaignName: string;
};
export type AttachToConjunto = AttachToCampana & {
  adsetId: string;
  adsetName: string;
};

export function AnunciosView({
  performance,
  portfolios,
  portfolioIdFijo,
  onCrearCampana,
  onAgregarConjunto,
  onAgregarAnuncio,
  puedeAprobar,
}: {
  performance: PerformanceSnapshot;
  portfolios: Array<{ id: string; name: string; accountKeys: string[] }>;
  /**
   * Cuando viene de la ficha de un cliente: fija el filtro a ese cliente y
   * esconde el selector, porque ya está claro de quién es esta tabla.
   */
  portfolioIdFijo?: string;
  /** "+ Crear campaña" para el cliente elegido. Sin esto, el botón no aparece. */
  onCrearCampana?: (portfolioId: string) => void;
  /** "+ Añadir conjunto" sobre una campaña real, con su id nativo. */
  onAgregarConjunto?: (attachTo: AttachToCampana) => void;
  /** "+ Añadir anuncio" sobre un conjunto real, con su id nativo. */
  onAgregarAnuncio?: (attachTo: AttachToConjunto) => void;
  /** Sin esto, la columna de pausar/activar no aparece: es una escritura real. */
  puedeAprobar?: boolean;
}) {
  const [nivel, setNivel] = useState<Nivel>("campana");
  const [enVuelo, setEnVuelo] = useState<Set<string>>(new Set());
  const [estadosLocales, setEstadosLocales] = useState<Record<string, string>>({});
  // Sin setter: esta vista siempre vive dentro de Clientes, que ya resuelve
  // qué cliente mirar (su propia lista) y remonta este componente por `key`
  // cuando cambia. Un segundo selector acá adentro solo duplicaba al primero.
  const [portfolioId] = useState(portfolioIdFijo ?? "all");
  const [provider, setProvider] = useState("all");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [confirmando, setConfirmando] = useState<{
    fila: Fila;
    activar: boolean;
  } | null>(null);
  const [gestionando, setGestionando] = useState<CampanaGestionable | null>(null);

  const permitidas = useMemo(
    () =>
      portfolioId === "all"
        ? null
        : new Set(
            portfolios.find((p) => p.id === portfolioId)?.accountKeys ?? [],
          ),
    [portfolioId, portfolios],
  );

  // La plataforma de lo abierto manda sobre el selector: al abrir una campaña
  // de Meta no tiene sentido seguir "filtrando" por Google.
  const providerEfectivo = seleccion?.provider ?? provider;

  const ads = useMemo(
    () =>
      performance.ads.filter((ad) => {
        if (permitidas && !permitidas.has(ad.accountKey)) return false;
        if (providerEfectivo !== "all" && ad.provider !== providerEfectivo) {
          return false;
        }
        if (seleccion) {
          if (ad.accountKey !== seleccion.accountKey) return false;
          if (ad.campaignName !== seleccion.campana) return false;
          if (
            seleccion.conjunto !== null &&
            (ad.adsetName ?? "") !== seleccion.conjunto
          ) {
            return false;
          }
        }
        return true;
      }),
    [performance.ads, permitidas, providerEfectivo, seleccion],
  );

  const filas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return agrupar(ads, nivel).filter((fila) => {
      if (estadoFiltro === "activo" && !activo(fila.status)) return false;
      if (estadoFiltro === "pausado" && !pausado(fila.status)) return false;
      if (estadoFiltro === "sin_actividad" && fila.conActividad) return false;
      if (!texto) return true;
      return `${fila.nombre} ${fila.contexto}`.toLowerCase().includes(texto);
    });
  }, [ads, nivel, estadoFiltro, busqueda]);

  const sinActividad = filas.filter((fila) => !fila.conActividad).length;

  /** Abre una fila y baja un nivel, como el clic en Meta. */
  function abrir(fila: Fila) {
    if (nivel === "campana") {
      setSeleccion({
        accountKey: fila.accountKey,
        provider: fila.provider,
        accountName: fila.accountName,
        campana: fila.campaignName,
        conjunto: null,
      });
      setNivel("conjunto");
      return;
    }
    if (nivel === "conjunto" && seleccion) {
      setSeleccion({ ...seleccion, conjunto: fila.adsetName ?? "" });
      setNivel("anuncio");
    }
  }

  function verNivel(id: Nivel) {
    setNivel(id);
    // Subir de nivel suelta lo que ya no corresponde, para que la tabla nunca
    // muestre un subconjunto sin decir de qué.
    if (id === "campana") setSeleccion(null);
    else if (id === "conjunto" && seleccion) {
      setSeleccion({ ...seleccion, conjunto: null });
    }
  }

  const puedeAbrir = nivel === "campana" || (nivel === "conjunto" && seleccion);

  /** El id nativo que hace falta para pausar o activar esta fila, según el nivel. */
  function idParaEstado(fila: Fila): string | null {
    if (nivel === "campana") return fila.campaignId;
    if (nivel === "conjunto") return fila.adsetId;
    return fila.adId;
  }

  /**
   * Pausa o activa de verdad. Windsor exige ids distintos según nivel y
   * plataforma (ver `app/api/anuncios/estado/route.ts`); acá solo se arma el
   * cuerpo del pedido con lo que ya trae la fila.
   */
  async function cambiarEstado(fila: Fila, activar: boolean) {
    setEnVuelo((actual) => new Set(actual).add(fila.clave));
    try {
      const response = await fetch("/api/anuncios/estado", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: fila.provider,
          nivel,
          accountId: fila.accountId,
          campaignId: fila.campaignId,
          adsetId: fila.adsetId,
          adId: fila.adId,
          activar,
        }),
      });
      const body = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "No se pudo cambiar el estado");
      }
      // Reflejo local inmediato: el snapshot que trae `performance` es del
      // momento en que se cargó la página y no se releerá solo. La próxima
      // sincronización de Windsor va a confirmar (o corregir) este valor.
      setEstadosLocales((actual) => ({
        ...actual,
        [fila.clave]: activar ? "ENABLED" : "PAUSED",
      }));
    } catch (issue) {
      // Antes esto era un alert() nativo: la única ventana del navegador en
      // toda la app, rompiendo el diseño de golpe. El resto del sistema
      // reporta errores con toast; esto solo lo alinea.
      toast.error(
        issue instanceof Error
          ? issue.message
          : "No se pudo contactar al servidor",
      );
    } finally {
      setEnVuelo((actual) => {
        const siguiente = new Set(actual);
        siguiente.delete(fila.clave);
        return siguiente;
      });
    }
  }

  const mostrarColumnaAgregar =
    (nivel === "campana" && Boolean(onAgregarConjunto)) ||
    (nivel === "conjunto" && Boolean(onAgregarAnuncio));

  /**
   * Botón "+ Añadir" de una fila, cuando corresponde.
   *
   * Solo aparece con el id nativo en mano: sin `campaignId`/`adsetId` no hay
   * a qué campaña o conjunto adjuntar lo nuevo, y ofrecer el botón igual
   * llevaría a un plan que Windsor rechazaría al ejecutarlo.
   */
  /** Pausar o activar una fila. Requiere el id nativo del nivel abierto. */
  function botonEstado(fila: Fila) {
    const id = idParaEstado(fila);
    if (!id) {
      return (
        <span
          className="text-[0.6rem] text-[#F8FAD7]/25"
          title="Falta el identificador nativo para esta fila"
        >
          —
        </span>
      );
    }
    const activaAhora = activo(estadosLocales[fila.clave] ?? fila.status);
    const cargando = enVuelo.has(fila.clave);
    return (
      <button
        type="button"
        disabled={cargando}
        onClick={(e) => {
          e.stopPropagation();
          setConfirmando({ fila, activar: !activaAhora });
        }}
        className={cn(
          "rounded-full border px-2.5 py-1 text-[0.62rem] font-bold transition-colors disabled:opacity-40",
          activaAhora
            ? "border-warn-deep/30 text-warn hover:bg-warn-deep/10"
            : "border-ok-deep/30 text-ok hover:bg-ok-deep/10",
        )}
      >
        {cargando ? "…" : activaAhora ? "Pausar" : "Activar"}
      </button>
    );
  }

  /**
   * Presupuesto, nombre, estrategia de puja y el resto de `gestionar-campana`
   * — solo a nivel de campaña, que es donde vive cada una de esas acciones en
   * Windsor. Exige el id nativo, igual que pausar/activar.
   */
  function botonGestionar(fila: Fila) {
    if (nivel !== "campana" && nivel !== "conjunto") return null;
    const id = nivel === "campana" ? fila.campaignId : fila.adsetId;
    if (!id) return null;
    return (
      <button
        type="button"
        title={nivel === "campana" ? "Gestionar campaña" : "Gestionar conjunto"}
        onClick={(e) => {
          e.stopPropagation();
          setGestionando({
            provider: fila.provider as Platform,
            accountId: fila.accountId,
            nivel,
            id,
            nombre: fila.nombre,
            currency: fila.currency,
          });
        }}
        className="rounded-full border border-[#F8FAD7]/12 p-1.5 text-[#F8FAD7]/50 transition-colors hover:border-[#4242FF]/30 hover:text-[#4242FF]"
      >
        <Settings2 className="size-3.5" />
      </button>
    );
  }

  function botonAgregar(fila: Fila) {
    const accountId = fila.accountKey.split(":").slice(2).join(":");
    if (nivel === "campana" && onAgregarConjunto) {
      const campaignId = fila.campaignId;
      if (!campaignId) {
        return (
          <span className="text-[0.6rem] text-[#F8FAD7]/30" title="Falta el id nativo de esta campaña">
            —
          </span>
        );
      }
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAgregarConjunto({
              portfolioId: portfolioIdFijo ?? portfolioId,
              platform: fila.provider as Platform,
              accountId,
              campaignId,
              campaignName: fila.campaignName,
            });
          }}
          className="rounded-full border border-[#4242FF]/25 px-2.5 py-1 text-[0.62rem] font-bold text-[#4242FF] transition-colors hover:bg-[#4242FF]/10"
        >
          + Conjunto
        </button>
      );
    }
    if (nivel === "conjunto" && onAgregarAnuncio) {
      const campaignId = fila.campaignId;
      const adsetId = fila.adsetId;
      if (!campaignId || !adsetId) {
        return (
          <span className="text-[0.6rem] text-[#F8FAD7]/30" title="Falta el id nativo de este conjunto">
            —
          </span>
        );
      }
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAgregarAnuncio({
              portfolioId: portfolioIdFijo ?? portfolioId,
              platform: fila.provider as Platform,
              accountId,
              campaignId,
              campaignName: fila.campaignName,
              adsetId,
              adsetName: fila.nombre,
            });
          }}
          className="rounded-full border border-[#4242FF]/25 px-2.5 py-1 text-[0.62rem] font-bold text-[#4242FF] transition-colors hover:bg-[#4242FF]/10"
        >
          + Anuncio
        </button>
      );
    }
    return null;
  }

  return (
    <div className="w-full">
      <Surface className="mb-4 flex flex-wrap items-center gap-3 p-3">
        {/* Sin borde propio: ya vive dentro de una tarjeta con su propio
            contorno — ponerle uno más adentro se leía como una caja adentro
            de otra. El fondo del grupo alcanza para distinguir los botones. */}
        <div className="flex gap-1 rounded-full bg-[#292929]/40 p-1">
          {NIVELES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => verNivel(item.id)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-bold transition-colors",
                nivel === item.id
                  ? "bg-[#4242FF] text-[#F8FAD7]"
                  : "text-[#F8FAD7]/55 hover:text-[#F8FAD7]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex min-w-40 flex-1 items-center gap-2 sm:min-w-52">
          <Search className="ml-1 size-4 shrink-0 text-[#4242FF]" />
          <Input
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar por nombre"
            className="h-9 bg-[#292929]/60 text-xs"
          />
        </div>

        {onCrearCampana && portfolioId !== "all" && (
          <button
            type="button"
            onClick={() => onCrearCampana(portfolioId)}
            className="shrink-0 rounded-full bg-[#4242FF] px-4 py-2 text-xs font-bold text-[#F8FAD7] transition-colors hover:bg-[#4242FF]/85"
          >
            + Crear campaña
          </button>
        )}

        <Select
          value={estadoFiltro}
          onValueChange={(valor) => setEstadoFiltro(valor as EstadoFiltro)}
        >
          <SelectTrigger size="sm" className="w-full bg-[#292929]/60 lg:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESTADOS.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {seleccion ? (
          // Con una campaña abierta la plataforma ya está determinada: se
          // muestra en vez de ofrecerse.
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#4242FF]/30 bg-[#4242FF]/12 px-3 py-1.5 text-[0.68rem] font-bold text-[#4242FF]">
            {platformLabel(seleccion.provider)}
          </span>
        ) : (
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger size="sm" className="w-full bg-[#292929]/60 lg:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda plataforma</SelectItem>
              {ACTIVE_PLATFORMS.map((id) => (
                <SelectItem key={id} value={id}>
                  {platformLabel(id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Surface>

      {seleccion ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => verNivel("campana")}
            className="rounded-full px-2.5 py-1 text-[#F8FAD7]/50 transition-colors hover:bg-[#F8FAD7]/8 hover:text-[#F8FAD7]"
          >
            Todas las campañas
          </button>
          <ChevronRight className="size-3 text-[#F8FAD7]/25" />
          <button
            type="button"
            onClick={() => verNivel("conjunto")}
            className={cn(
              "max-w-[340px] truncate rounded-full px-2.5 py-1 font-bold transition-colors",
              seleccion.conjunto === null
                ? "bg-[#F8FAD7]/10 text-[#F8FAD7]"
                : "text-[#F8FAD7]/55 hover:bg-[#F8FAD7]/8 hover:text-[#F8FAD7]",
            )}
            title={`${seleccion.accountName} · ${seleccion.campana}`}
          >
            {seleccion.campana}
          </button>
          {seleccion.conjunto !== null ? (
            <>
              <ChevronRight className="size-3 text-[#F8FAD7]/25" />
              <span className="max-w-[340px] truncate rounded-full bg-[#F8FAD7]/10 px-2.5 py-1 font-bold text-[#F8FAD7]">
                {seleccion.conjunto || "Sin conjunto"}
              </span>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => verNivel("campana")}
            className="ml-1 inline-flex items-center gap-1 rounded-full border border-[#F8FAD7]/12 px-2.5 py-1 text-[0.62rem] text-[#F8FAD7]/50 transition-colors hover:text-[#F8FAD7]"
          >
            <X className="size-3" />
            Quitar
          </button>
        </div>
      ) : null}

      <Surface className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F8FAD7]/10 px-4 py-3">
          <h3 className="font-bold text-[#F8FAD7]">
            {NIVELES.find((n) => n.id === nivel)?.label}
            {seleccion ? (
              <span className="ml-2 text-xs font-normal text-[#F8FAD7]/45">
                de {seleccion.conjunto || seleccion.campana}
              </span>
            ) : null}
          </h3>
          <span className="font-micro text-[0.58rem] text-[#F8FAD7]/40">
            {filas.length} FILAS
            {sinActividad > 0
              ? ` · ${sinActividad} SIN ACTIVIDAD EN EL RANGO`
              : ""}
          </span>
        </div>

        {filas.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[#F8FAD7]/45">
            Sin filas con los filtros actuales.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F8FAD7]/[0.03] hover:bg-[#F8FAD7]/[0.04]">
                  <TableHead className="pl-4 text-xs text-[#F8FAD7]/58">
                    Nombre
                  </TableHead>
                  <TableHead className="text-xs text-[#F8FAD7]/58">
                    Objetivo
                  </TableHead>
                  <TableHead className="text-xs text-[#F8FAD7]/58">
                    Estado
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
                  {puedeAprobar && (
                    <TableHead className="text-right text-xs text-[#F8FAD7]/58" />
                  )}
                  {mostrarColumnaAgregar && (
                    <TableHead className="pr-4 text-right text-xs text-[#F8FAD7]/58" />
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((fila) => (
                  <TableRow
                    key={fila.clave}
                    onClick={puedeAbrir ? () => abrir(fila) : undefined}
                    className={cn(
                      "h-16 bg-[#323330] hover:bg-[#F8FAD7]/[0.04]",
                      puedeAbrir && "cursor-pointer",
                      !fila.conActividad && "opacity-70",
                    )}
                  >
                    <TableCell className="pl-4">
                      <span
                        className="block max-w-[420px] truncate text-sm font-bold text-[#F8FAD7]"
                        title={fila.nombre}
                      >
                        {fila.nombre}
                      </span>
                      <span className="mt-1 block max-w-[420px] truncate text-xs text-[#F8FAD7]/45">
                        {platformLabel(fila.provider)} · {fila.contexto}
                      </span>
                    </TableCell>
                    <TableCell>
                      {fila.objetivo ? (
                        <span className="inline-flex rounded-full bg-[#4242FF]/12 px-2 py-0.5 text-[0.62rem] font-bold text-[#4242FF]">
                          {OBJETIVO_CORTO[
                            fila.objetivo as keyof typeof OBJETIVO_CORTO
                          ] ?? fila.objetivo}
                        </span>
                      ) : (
                        <span className="text-[0.62rem] text-[#F8FAD7]/38">
                          Sin sigla
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[0.62rem] font-bold",
                          activo(estadosLocales[fila.clave] ?? fila.status)
                            ? "bg-ok-deep/12 text-ok"
                            : "bg-[#F8FAD7]/8 text-[#F8FAD7]/50",
                        )}
                      >
                        {estado(estadosLocales[fila.clave] ?? fila.status)}
                      </span>
                    </TableCell>
                    {/*
                      Sin actividad en el rango se escribe "—", nunca 0: un cero
                      se lee como "no rindió", y lo que ocurre es que la
                      plataforma no reporta nada para algo que estuvo apagado.
                    */}
                    <TableCell className="metric-number text-right text-sm font-bold text-[#F8FAD7]/82">
                      {fila.conActividad
                        ? dinero(fila.spendMicros, fila.currency)
                        : "—"}
                    </TableCell>
                    <TableCell className="metric-number text-right text-sm text-[#F8FAD7]/66">
                      {fila.conActividad ? entero(fila.impressions) : "—"}
                    </TableCell>
                    <TableCell className="metric-number text-right text-sm text-[#F8FAD7]/66">
                      {fila.conActividad ? entero(fila.clicks) : "—"}
                    </TableCell>
                    <TableCell className="metric-number pr-4 text-right text-sm font-bold text-[#F8FAD7]/82">
                      {!fila.conActividad || fila.resultado === null
                        ? "—"
                        : decimal(fila.resultado)}
                    </TableCell>
                    {puedeAprobar && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {botonGestionar(fila)}
                          {botonEstado(fila)}
                        </div>
                      </TableCell>
                    )}
                    {mostrarColumnaAgregar && (
                      <TableCell className="pr-4 text-right">
                        {botonAgregar(fila)}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Surface>

      {/*
        Antes esto era un confirm() nativo del navegador: la única ventana
        del sistema en toda la app, incluso para la acción más consecuente
        de esta pantalla (escribe de verdad en la plataforma). Mismo texto,
        ahora con el diálogo que ya usa el resto de WiWO.ADS.
      */}
      <AlertDialog
        open={Boolean(confirmando)}
        onOpenChange={(open) => !open && setConfirmando(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmando &&
                `¿${confirmando.activar ? "Activar" : "Pausar"} "${confirmando.fila.nombre}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmando &&
                `Esto escribe de verdad en ${platformLabel(confirmando.fila.provider)}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmando) return;
                void cambiarEstado(confirmando.fila, confirmando.activar);
                setConfirmando(null);
              }}
            >
              {confirmando?.activar ? "Activar" : "Pausar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GestionarCampanaDialog
        campana={gestionando}
        open={Boolean(gestionando)}
        onOpenChange={(open) => !open && setGestionando(null)}
      />
    </div>
  );
}

/**
 * Agrupa las filas de anuncio al nivel pedido.
 *
 * Performance Max no tiene conjunto ni anuncio: en esos niveles se muestra la
 * campaña con una marca, en vez de desaparecer sin explicación.
 */
function agrupar(ads: AdSummary[], nivel: Nivel): Fila[] {
  const grupos = new Map<string, Fila>();

  for (const ad of ads) {
    let nombre: string;
    let contexto: string;
    // La identidad es la ruta completa, no el nombre.
    //
    // Agrupar solo por nombre fusionaba anuncios distintos que se llaman igual
    // en conjuntos distintos: 270 anuncios colapsaban en 233 filas, sumando
    // inversión de piezas que no tienen nada que ver.
    let ruta: string;

    if (nivel === "campana") {
      nombre = ad.campaignName;
      contexto = ad.accountName;
      ruta = ad.campaignName;
    } else if (nivel === "conjunto") {
      nombre = ad.adsetName ?? `${ad.campaignName} · sin conjunto`;
      contexto = `${ad.accountName} · ${ad.campaignName}`;
      ruta = `${ad.campaignName}::${ad.adsetName ?? ""}`;
    } else {
      nombre = ad.adName
        ? primerTitulo(ad.adName)
        : `${ad.campaignName} · sin anuncio`;
      contexto = `${ad.accountName} · ${ad.adsetName ?? ad.campaignName}`;
      ruta = `${ad.campaignName}::${ad.adsetName ?? ""}::${ad.adName ?? ""}`;
    }

    const clave = `${ad.accountKey}::${nivel}::${ruta}`;
    const actual = grupos.get(clave);
    const resultado = resultadoDe(ad);

    if (!actual) {
      grupos.set(clave, {
        clave,
        nombre,
        contexto,
        provider: ad.provider,
        accountKey: ad.accountKey,
        accountName: ad.accountName,
        campaignName: ad.campaignName,
        campaignId: ad.campaignId,
        adsetName: ad.adsetName,
        adsetId: ad.adsetId,
        adId: ad.adId,
        accountId: ad.accountId,
        currency: ad.currency,
        objetivo: ad.objetivo,
        status: ad.status,
        conActividad: ad.conActividad,
        spendMicros: ad.spendMicros,
        impressions: ad.impressions,
        clicks: ad.clicks,
        resultado,
      });
      continue;
    }

    actual.spendMicros += ad.spendMicros;
    actual.impressions += ad.impressions;
    actual.clicks += ad.clicks;
    actual.resultado =
      actual.resultado === null || resultado === null
        ? (actual.resultado ?? resultado)
        : actual.resultado + resultado;
    // Basta un elemento con actividad para que el grupo tenga cifras reales.
    if (ad.conActividad) actual.conActividad = true;
    // Basta un elemento activo para que el grupo esté entregando.
    if (activo(ad.status)) actual.status = ad.status;
    actual.campaignId = actual.campaignId ?? ad.campaignId;
    actual.adsetId = actual.adsetId ?? ad.adsetId;
    actual.adId = actual.adId ?? ad.adId;
  }

  return [...grupos.values()].sort((a, b) => {
    // Primero lo que entregó; entre iguales, por inversión.
    if (a.conActividad !== b.conActividad) return a.conActividad ? -1 : 1;
    return b.spendMicros - a.spendMicros;
  });
}

/** El resultado según el objetivo, igual que en la vista de inversión. */
function resultadoDe(ad: AdSummary): number | null {
  if (ad.provider === "google") return ad.conversions;
  if (ad.objetivo === "AE") return ad.engagement;
  if (ad.objetivo === "TRF") return ad.linkClicks;
  if (ad.objetivo === "LDS") return ad.leads;
  if (ad.objetivo === "VTA") return ad.purchases;
  return null;
}

/**
 * Primer título de un anuncio responsivo.
 *
 * Google devuelve los quince títulos concatenados con "|" como nombre del
 * anuncio. Mostrarlos todos hace la tabla ilegible.
 */
function primerTitulo(nombre: string): string {
  const partes = nombre
    .split("|")
    .map((parte) => parte.trim())
    .filter(Boolean);
  if (partes.length <= 1) return nombre;
  return `${partes[0]} · +${partes.length - 1} títulos`;
}

function activo(status: string | null): boolean {
  const valor = (status ?? "").toUpperCase();
  return valor === "ENABLED" || valor === "ACTIVE";
}

function pausado(status: string | null): boolean {
  return (status ?? "").toUpperCase().includes("PAUSED");
}

/**
 * Estado en castellano.
 *
 * Meta distingue dónde está la pausa —`CAMPAIGN_PAUSED` es "la campaña está
 * apagada", `ADSET_PAUSED` es "el conjunto"— y esa diferencia dice qué hay que
 * reactivar, así que no se colapsan en un solo "Pausado".
 */
const ESTADO_LABELS: Record<string, string> = {
  ENABLED: "Activo",
  ACTIVE: "Activo",
  PAUSED: "Pausado",
  CAMPAIGN_PAUSED: "Campaña pausada",
  ADSET_PAUSED: "Conjunto pausado",
  ARCHIVED: "Archivado",
  WITH_ISSUES: "Con problemas",
  DISAPPROVED: "Rechazado",
  PENDING_REVIEW: "En revisión",
  IN_PROCESS: "En proceso",
  PREAPPROVED: "Preaprobado",
};

function estado(status: string | null): string {
  if (!status) return "Sin estado";
  return ESTADO_LABELS[status.toUpperCase()] ?? status.toLowerCase();
}

function dinero(micros: number, currency: string | null): string {
  const valor = micros / 1_000_000;
  if (!currency) {
    return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(
      valor,
    );
  }
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits: currency === "CLP" ? 0 : 2,
    }).format(valor);
  } catch {
    return `${currency} ${Math.round(valor)}`;
  }
}

function entero(valor: number): string {
  return new Intl.NumberFormat("es-CL").format(valor);
}

function decimal(valor: number): string {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(
    valor,
  );
}
