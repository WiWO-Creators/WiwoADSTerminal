"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Columns3,
  Pencil,
  Search,
  Settings2,
  X,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { OBJETIVO_CORTO, OBJETIVOS } from "@/lib/objetivos";
import type { AdSummary, PerformanceSnapshot } from "@/lib/performance-store";
import { ACTIVE_PLATFORMS, platformLabel, type Platform } from "@/lib/plataformas";
import { cn } from "@/lib/utils";
import { EditarAnuncioDialog, type AnuncioEditable } from "./editar-anuncio";
import { GestionarCampanaDialog, type CampanaGestionable } from "./gestionar-campana";
import { OrbeDeBoton, Surface } from "./ui";

type Nivel = "campana" | "conjunto" | "anuncio";

const NIVELES: Array<{ id: Nivel; label: string }> = [
  { id: "campana", label: "Campañas" },
  { id: "conjunto", label: "Conjuntos" },
  { id: "anuncio", label: "Anuncios" },
];

type EstadoFiltro = "todos" | "activo" | "pausado" | "sin_actividad";

/**
 * Columnas de métrica, personalizables — la persona elige cuáles ver y en
 * qué orden se ofrecen (siempre en el orden de este arreglo). "Nombre" no
 * entra acá: es estructural (miniatura, ruta, cuenta), no una métrica, y
 * siempre se muestra.
 *
 * Solo se ofrecen métricas que Windsor ya trae de verdad en esta tabla (ver
 * `camposAnuncio` en `lib/plataformas.ts`) — Meta y Google Ads exponen
 * decenas de métricas más (ROAS, video, visibilidad, atribución…) que esta
 * tabla todavía no pide, no porque no importen sino porque agregarlas exige
 * primero verificar cada nombre de campo contra Windsor antes de pedirlo.
 * `null` es "esta plataforma no la trae" (por ejemplo, Alcance en Google) —
 * se muestra "—", nunca se ordena como si fuera cero.
 */
type ColumnaMetricaId =
  | "invertido"
  | "impresiones"
  | "clics"
  | "ctr"
  | "cpc"
  | "cpm"
  | "resultados"
  | "costo"
  | "alcance"
  | "clicsEnlace"
  | "interacciones"
  | "leads"
  | "compras"
  | "conversiones";

type ColumnaOrden = "nombre" | ColumnaMetricaId;

type DefinicionColumnaMetrica = {
  id: ColumnaMetricaId;
  label: string;
  /** Visible la primera vez que alguien abre esta pantalla. */
  porDefecto: boolean;
  /** Invertido y Resultados llevan más peso visual: son las dos cifras que definen si algo va bien. */
  destacada?: boolean;
  valor: (fila: Fila) => number | null;
  formato: (valor: number, fila: Fila) => string;
};

const COLUMNAS_METRICA: DefinicionColumnaMetrica[] = [
  {
    id: "invertido",
    label: "Invertido",
    porDefecto: true,
    destacada: true,
    valor: (f) => f.spendMicros,
    formato: (v, f) => dinero(v, f.currency),
  },
  {
    id: "impresiones",
    label: "Impresiones",
    porDefecto: true,
    valor: (f) => f.impressions,
    formato: (v) => entero(v),
  },
  {
    id: "clics",
    label: "Clics",
    porDefecto: true,
    valor: (f) => f.clicks,
    formato: (v) => entero(v),
  },
  {
    id: "ctr",
    label: "CTR",
    porDefecto: false,
    valor: (f) => (f.impressions > 0 ? (f.clicks / f.impressions) * 100 : null),
    formato: (v) => `${decimal(v)}%`,
  },
  {
    id: "cpc",
    label: "CPC",
    porDefecto: false,
    valor: (f) => (f.clicks > 0 ? f.spendMicros / 1_000_000 / f.clicks : null),
    formato: (v, f) => dinero(Math.round(v * 1_000_000), f.currency),
  },
  {
    id: "cpm",
    label: "CPM",
    porDefecto: false,
    valor: (f) =>
      f.impressions > 0 ? (f.spendMicros / 1_000_000 / f.impressions) * 1000 : null,
    formato: (v, f) => dinero(Math.round(v * 1_000_000), f.currency),
  },
  {
    id: "resultados",
    label: "Resultados",
    porDefecto: true,
    destacada: true,
    valor: (f) => f.resultado,
    formato: (v) => decimal(v),
  },
  {
    id: "costo",
    label: "Costo/resultado",
    porDefecto: true,
    valor: (f) => f.costo,
    formato: (v, f) => dinero(Math.round(v * 1_000_000), f.currency),
  },
  {
    id: "alcance",
    label: "Alcance",
    porDefecto: false,
    valor: (f) => f.reach,
    formato: (v) => entero(v),
  },
  {
    id: "clicsEnlace",
    label: "Clics al enlace",
    porDefecto: false,
    valor: (f) => f.linkClicks,
    formato: (v) => entero(v),
  },
  {
    id: "interacciones",
    label: "Interacciones",
    porDefecto: false,
    valor: (f) => f.engagement,
    formato: (v) => entero(v),
  },
  {
    id: "leads",
    label: "Leads",
    porDefecto: false,
    valor: (f) => f.leads,
    formato: (v) => entero(v),
  },
  {
    id: "compras",
    label: "Compras",
    porDefecto: false,
    valor: (f) => f.purchases,
    formato: (v) => entero(v),
  },
  {
    id: "conversiones",
    label: "Conversiones",
    porDefecto: false,
    valor: (f) => f.conversions,
    formato: (v) => decimal(v),
  },
];

/** Recordado por navegador, no por cuenta: es una preferencia de vista, no un dato del cliente. */
const CLAVE_COLUMNAS = "wiwo_anuncios_columnas_v1";

function columnasPorDefecto(): Set<ColumnaMetricaId> {
  return new Set(COLUMNAS_METRICA.filter((c) => c.porDefecto).map((c) => c.id));
}

function columnasIniciales(): Set<ColumnaMetricaId> {
  // Se renderiza también en el servidor (vinext): `window` no existe ahí.
  if (typeof window === "undefined") return columnasPorDefecto();
  try {
    const guardado = window.localStorage.getItem(CLAVE_COLUMNAS);
    if (!guardado) return columnasPorDefecto();
    const ids: unknown = JSON.parse(guardado);
    if (!Array.isArray(ids)) return columnasPorDefecto();
    const validos = ids.filter((id): id is ColumnaMetricaId =>
      COLUMNAS_METRICA.some((c) => c.id === id),
    );
    return validos.length > 0 ? new Set(validos) : columnasPorDefecto();
  } catch {
    // Privado/bloqueado/corrupto: se cae de vuelta al set por defecto, nunca rompe la pantalla.
    return columnasPorDefecto();
  }
}

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
  /** Se publicó de verdad hace poco y Windsor todavía no la sincronizó —
   * ver `WindsorCampaign.pendienteSincronizacion`. */
  pendienteSincronizacion: boolean;
  spendMicros: number;
  impressions: number;
  clicks: number;
  resultado: number | null;
  /** Invertido / resultado, en la moneda de la cuenta. Sin resultado, no hay costo que mostrar. */
  costo: number | null;
  /**
   * Métricas crudas de Meta, además del "resultado" ya elegido según el
   * objetivo — para quien quiera ver el desglose real (por ejemplo, los
   * clics al enlace de una campaña de leads) en vez de solo la que cuenta
   * como resultado. `null` cuando la plataforma no la trae (Google no tiene
   * alcance ni clics al enlace por esta vía).
   */
  reach: number | null;
  linkClicks: number | null;
  engagement: number | null;
  leads: number | null;
  purchases: number | null;
  /** Conversiones de Google. `null` en Meta — ahí el desglose real es leads/compras/interacciones de arriba. */
  conversions: number | null;
  /** Miniatura real de la pieza (solo Meta, ver `WindsorAd.thumbnailUrl`).
   * A nivel de campaña o conjunto es la del primer anuncio del grupo — una
   * referencia visual, no "la" pieza del conjunto entero. */
  thumbnailUrl: string | null;
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
  portfolios: Array<{
    id: string;
    name: string;
    accountKeys: string[];
    cuentas: Array<{ key: string; name: string; provider: string }>;
  }>;
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
  // Ids (campaña o anuncio) marcados "no la sigas mostrando como pendiente"
  // — ver `descartarPendiente` en lib/publicaciones-pendientes.ts. Reflejo
  // local inmediato, igual que `estadosLocales`: el snapshot no se relee solo.
  const [descartadas, setDescartadas] = useState<Set<string>>(new Set());
  const [estadosLocales, setEstadosLocales] = useState<Record<string, string>>({});
  // Sin setter: esta vista siempre vive dentro de Clientes, que ya resuelve
  // qué cliente mirar (su propia lista) y remonta este componente por `key`
  // cuando cambia. Un segundo selector acá adentro solo duplicaba al primero.
  const [portfolioId] = useState(portfolioIdFijo ?? "all");
  const [provider, setProvider] = useState("all");
  const [accountKey, setAccountKey] = useState("all");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("todos");
  const [objetivoFiltro, setObjetivoFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [columnasVisibles, setColumnasVisibles] = useState<Set<ColumnaMetricaId>>(columnasIniciales);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [confirmando, setConfirmando] = useState<{
    fila: Fila;
    activar: boolean;
  } | null>(null);
  const [gestionando, setGestionando] = useState<CampanaGestionable | null>(null);
  const [editandoAnuncio, setEditandoAnuncio] = useState<AnuncioEditable | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [soloMarcadas, setSoloMarcadas] = useState(false);
  const [orden, setOrden] = useState<{ columna: ColumnaOrden; asc: boolean } | null>(null);

  // Las claves de fila son por nivel (campaña/conjunto/anuncio): al bajar o
  // subir un nivel las marcas de antes ya no corresponden a nada visible acá.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver nota de arriba
    setMarcadas(new Set());
    setSoloMarcadas(false);
  }, [nivel, seleccion?.campana, seleccion?.conjunto]);

  // Preferencia de vista, no dato del cliente: por eso vive en el navegador,
  // no en el servidor. Si falla (privado, bloqueado), la tabla sigue andando
  // con las columnas por defecto — nunca rompe la pantalla por esto.
  useEffect(() => {
    try {
      window.localStorage.setItem(CLAVE_COLUMNAS, JSON.stringify([...columnasVisibles]));
    } catch {
      // No es crítico: la próxima carga vuelve a las columnas por defecto.
    }
  }, [columnasVisibles]);

  function alternarColumna(id: ColumnaMetricaId) {
    setColumnasVisibles((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  const columnasEnOrden = useMemo(
    () => COLUMNAS_METRICA.filter((columna) => columnasVisibles.has(columna.id)),
    [columnasVisibles],
  );

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

  // Clientes con más de una cuenta en la misma plataforma (SQM: SPN, España…)
  // — solo aparece el selector cuando de verdad hay más de una entre las que
  // ya pasaron el filtro de plataforma, si no es ruido para el resto. Con
  // "Toda plataforma" no se muestra nada: antes contaba Google + Meta juntas
  // (ej. Colbún, 1 cuenta de cada una) y el selector aparecía sin que hubiera
  // ninguna ambigüedad real — elegir "cuál cuenta" solo tiene sentido una vez
  // que ya se sabe de qué plataforma.
  const cuentasDelCliente = useMemo(() => {
    if (portfolioId === "all" || providerEfectivo === "all") return [];
    const cuentas = portfolios.find((p) => p.id === portfolioId)?.cuentas ?? [];
    return cuentas.filter((c) => c.provider === providerEfectivo);
  }, [portfolioId, portfolios, providerEfectivo]);

  // Si cambia la plataforma (o se abre una campaña de otra) la cuenta elegida
  // puede haber dejado de existir en la lista filtrada; sin esto quedaba
  // "elegida" una cuenta que ya no se ve en el selector.
  useEffect(() => {
    if (accountKey === "all") return;
    if (cuentasDelCliente.some((c) => c.key === accountKey)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver nota de arriba
    setAccountKey("all");
  }, [cuentasDelCliente, accountKey]);

  const ads = useMemo(
    () =>
      performance.ads.filter((ad) => {
        if (ad.campaignId && descartadas.has(ad.campaignId)) return false;
        if (ad.adId && descartadas.has(ad.adId)) return false;
        if (permitidas && !permitidas.has(ad.accountKey)) return false;
        if (providerEfectivo !== "all" && ad.provider !== providerEfectivo) {
          return false;
        }
        if (accountKey !== "all" && ad.accountKey !== accountKey) return false;
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
    [performance.ads, permitidas, providerEfectivo, accountKey, seleccion, descartadas],
  );

  const filas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const base = agrupar(ads, nivel).filter((fila) => {
      if (estadoFiltro === "activo" && !activo(fila.status)) return false;
      if (estadoFiltro === "pausado" && !pausado(fila.status)) return false;
      if (estadoFiltro === "sin_actividad" && fila.conActividad) return false;
      if (objetivoFiltro !== "todos" && fila.objetivo !== objetivoFiltro) return false;
      if (soloMarcadas && !marcadas.has(fila.clave)) return false;
      if (!texto) return true;
      return `${fila.nombre} ${fila.contexto}`.toLowerCase().includes(texto);
    });
    if (!orden) return base;
    const factor = orden.asc ? 1 : -1;
    if (orden.columna === "nombre") {
      return [...base].sort((a, b) => factor * a.nombre.localeCompare(b.nombre, "es"));
    }
    const columna = COLUMNAS_METRICA.find((c) => c.id === orden.columna);
    if (!columna) return base;
    return [...base].sort(
      (a, b) => factor * ((columna.valor(a) ?? -Infinity) - (columna.valor(b) ?? -Infinity)),
    );
  }, [ads, nivel, estadoFiltro, objetivoFiltro, busqueda, soloMarcadas, marcadas, orden]);

  const sinActividad = filas.filter((fila) => !fila.conActividad).length;

  function alternarOrden(columna: ColumnaOrden) {
    setOrden((actual) => {
      if (!actual || actual.columna !== columna) return { columna, asc: columna === "nombre" };
      return { columna, asc: !actual.asc };
    });
  }

  function alternarMarcada(clave: string, marcar: boolean) {
    setMarcadas((actual) => {
      const siguiente = new Set(actual);
      if (marcar) siguiente.add(clave);
      else siguiente.delete(clave);
      return siguiente;
    });
  }

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

  /**
   * "Ya la borré, dejá de mostrarla" — el escape manual para una fila
   * "pendiente de sincronizar" que en realidad se borró en la plataforma
   * real. Esta app no tiene su propia acción para borrar campañas, así que
   * no hay forma de saberlo sola (ver `lib/publicaciones-pendientes.ts`).
   * No toca ninguna plataforma: solo dos ids sintéticos dejan de ofrecerse.
   */
  async function descartarFila(fila: Fila) {
    const ids = [fila.campaignId, fila.adId].filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    setEnVuelo((actual) => new Set(actual).add(fila.clave));
    try {
      const response = await fetch("/api/publicaciones-pendientes/descartar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const body = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "No se pudo descartar");
      }
      setDescartadas((actual) => new Set([...actual, ...ids]));
    } catch (issue) {
      toast.error(
        issue instanceof Error ? issue.message : "No se pudo contactar al servidor",
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
          className="text-[0.6rem] text-foreground/25"
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
        {cargando ? (
          <OrbeDeBoton className="mx-3" />
        ) : activaAhora ? (
          "Pausar"
        ) : (
          "Activar"
        )}
      </button>
    );
  }

  /** Solo aparece en una fila "pendiente de sincronizar" — ver `descartarFila`. */
  function botonDescartar(fila: Fila) {
    if (!fila.pendienteSincronizacion) return null;
    const cargando = enVuelo.has(fila.clave);
    return (
      <button
        type="button"
        disabled={cargando}
        title="Marcala así si ya la borraste en la plataforma real — deja de mostrarse acá, no toca nada más."
        onClick={(e) => {
          e.stopPropagation();
          void descartarFila(fila);
        }}
        className="rounded-full border border-foreground/15 px-2.5 py-1 text-[0.62rem] font-bold text-foreground/50 transition-colors hover:bg-foreground/8 disabled:opacity-40"
      >
        {cargando ? <OrbeDeBoton className="mx-3" /> : "Descartar"}
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
        className="rounded-full border border-foreground/12 p-1.5 text-foreground/50 transition-colors hover:border-brand/30 hover:text-brand"
      >
        <Settings2 className="size-3.5" />
      </button>
    );
  }

  /**
   * Editar el contenido de un anuncio ya publicado — solo Meta (Google no
   * tiene ninguna acción de escritura para esto, ver `editar-anuncio.tsx`) y
   * solo a nivel de anuncio, con el id nativo en mano.
   */
  function botonEditarAnuncio(fila: Fila) {
    if (nivel !== "anuncio" || fila.provider !== "meta" || !fila.adId) return null;
    return (
      <button
        type="button"
        title="Editar anuncio"
        onClick={(e) => {
          e.stopPropagation();
          setEditandoAnuncio({
            accountId: fila.accountId,
            adId: fila.adId!,
            nombre: fila.nombre,
          });
        }}
        className="rounded-full border border-foreground/12 p-1.5 text-foreground/50 transition-colors hover:border-brand/30 hover:text-brand"
      >
        <Pencil className="size-3.5" />
      </button>
    );
  }

  function botonAgregar(fila: Fila) {
    const accountId = fila.accountKey.split(":").slice(2).join(":");
    if (nivel === "campana" && onAgregarConjunto) {
      const campaignId = fila.campaignId;
      if (!campaignId) {
        return (
          <span className="text-[0.6rem] text-foreground/30" title="Falta el id nativo de esta campaña">
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
          className="rounded-full border border-brand/25 px-2.5 py-1 text-[0.62rem] font-bold text-brand transition-colors hover:bg-brand/10"
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
          <span className="text-[0.6rem] text-foreground/30" title="Falta el id nativo de este conjunto">
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
          className="rounded-full border border-brand/25 px-2.5 py-1 text-[0.62rem] font-bold text-brand transition-colors hover:bg-brand/10"
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
        <div className="flex gap-1 rounded-full bg-field/40 p-1">
          {NIVELES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => verNivel(item.id)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-bold transition-colors",
                nivel === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/55 hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex min-w-40 flex-1 items-center gap-2 sm:min-w-52">
          <Search className="ml-1 size-4 shrink-0 text-brand" />
          <Input
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar por nombre"
            className="h-9 bg-field/60 text-xs"
          />
        </div>

        {onCrearCampana && portfolioId !== "all" && (
          <button
            type="button"
            onClick={() => onCrearCampana(portfolioId)}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/85"
          >
            + Crear campaña
          </button>
        )}

        <Select
          value={estadoFiltro}
          onValueChange={(valor) => setEstadoFiltro(valor as EstadoFiltro)}
        >
          <SelectTrigger size="sm" className="w-full bg-field/60 lg:w-52">
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
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand/30 bg-brand/12 px-3 py-1.5 text-[0.68rem] font-bold text-brand">
            {platformLabel(seleccion.provider)}
          </span>
        ) : (
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger size="sm" className="w-full bg-field/60 lg:w-40">
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

        {/* Solo aparece con más de una cuenta detrás del cliente en la
            plataforma elegida — el caso SQM (España, SPN…) o ALO Group (una
            cuenta de Google por país): sin esto, esas cuentas solo se podían
            ver todas juntas o abriendo campaña por campaña. */}
        {!seleccion && cuentasDelCliente.length > 1 && (
          <Select value={accountKey} onValueChange={setAccountKey}>
            <SelectTrigger size="sm" className="w-full bg-field/60 lg:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las cuentas</SelectItem>
              {cuentasDelCliente.map((cuenta) => (
                <SelectItem key={cuenta.key} value={cuenta.key}>
                  {cuenta.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={objetivoFiltro} onValueChange={setObjetivoFiltro}>
          <SelectTrigger size="sm" className="w-full bg-field/60 lg:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo objetivo</SelectItem>
            {OBJETIVOS.map((id) => (
              <SelectItem key={id} value={id}>
                {OBJETIVO_CORTO[id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Surface>

      {seleccion ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => verNivel("campana")}
            className="rounded-full px-2.5 py-1 text-foreground/50 transition-colors hover:bg-foreground/8 hover:text-foreground"
          >
            Todas las campañas
          </button>
          <ChevronRight className="size-3 text-foreground/25" />
          <button
            type="button"
            onClick={() => verNivel("conjunto")}
            className={cn(
              "max-w-[340px] truncate rounded-full px-2.5 py-1 font-bold transition-colors",
              seleccion.conjunto === null
                ? "bg-foreground/10 text-foreground"
                : "text-foreground/55 hover:bg-foreground/8 hover:text-foreground",
            )}
            title={`${seleccion.accountName} · ${seleccion.campana}`}
          >
            {seleccion.campana}
          </button>
          {seleccion.conjunto !== null ? (
            <>
              <ChevronRight className="size-3 text-foreground/25" />
              <span className="max-w-[340px] truncate rounded-full bg-foreground/10 px-2.5 py-1 font-bold text-foreground">
                {seleccion.conjunto || "Sin conjunto"}
              </span>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => verNivel("campana")}
            className="ml-1 inline-flex items-center gap-1 rounded-full border border-foreground/12 px-2.5 py-1 text-[0.62rem] text-foreground/50 transition-colors hover:text-foreground"
          >
            <X className="size-3" />
            Quitar
          </button>
        </div>
      ) : null}

      <Surface className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/10 px-4 py-3">
          <h3 className="font-bold text-foreground">
            {NIVELES.find((n) => n.id === nivel)?.label}
            {seleccion ? (
              <span className="ml-2 text-xs font-normal text-foreground/45">
                de {seleccion.conjunto || seleccion.campana}
              </span>
            ) : null}
          </h3>
          <div className="flex items-center gap-2">
            {marcadas.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setSoloMarcadas((actual) => !actual)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[0.62rem] font-bold transition-colors",
                    soloMarcadas
                      ? "border-brand/30 bg-brand/12 text-brand"
                      : "border-foreground/12 text-foreground/55 hover:text-foreground",
                  )}
                >
                  {soloMarcadas ? "Viendo solo marcadas" : "Ver solo marcadas"} ({marcadas.size})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMarcadas(new Set());
                    setSoloMarcadas(false);
                  }}
                  className="text-[0.62rem] font-semibold text-foreground/40 hover:text-foreground/70"
                >
                  Quitar marcas
                </button>
              </>
            )}
            <span className="font-micro text-[0.58rem] text-foreground/40">
              {filas.length} FILAS
              {sinActividad > 0
                ? ` · ${sinActividad} SIN ACTIVIDAD EN EL RANGO`
                : ""}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 border-foreground/12 bg-transparent px-2.5 text-[0.62rem] text-foreground/60"
                >
                  <Columns3 className="size-3.5" />
                  Columnas
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[0.62rem] text-foreground/50">
                  Métricas visibles
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {COLUMNAS_METRICA.map((columna) => (
                  <DropdownMenuCheckboxItem
                    key={columna.id}
                    checked={columnasVisibles.has(columna.id)}
                    onCheckedChange={() => alternarColumna(columna.id)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {columna.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {filas.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-foreground/45">
            Sin filas con los filtros actuales.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-foreground/[0.03] hover:bg-foreground/[0.04]">
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={
                        filas.length > 0 && filas.every((fila) => marcadas.has(fila.clave))
                      }
                      onCheckedChange={(marcado) =>
                        setMarcadas(
                          marcado ? new Set(filas.map((fila) => fila.clave)) : new Set(),
                        )
                      }
                      aria-label="Marcar todas las filas visibles"
                    />
                  </TableHead>
                  <TableHead className="text-xs text-foreground/58">
                    <button
                      type="button"
                      onClick={() => alternarOrden("nombre")}
                      className={cn(
                        "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                        orden?.columna === "nombre" && "text-foreground",
                      )}
                    >
                      Nombre
                      {orden?.columna === "nombre" ? (
                        orden.asc ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-30" />
                      )}
                    </button>
                  </TableHead>
                  {columnasEnOrden.map((columna) => (
                    <TableHead key={columna.id} className="text-right text-xs text-foreground/58">
                      <button
                        type="button"
                        onClick={() => alternarOrden(columna.id)}
                        className={cn(
                          "inline-flex flex-row-reverse items-center gap-1 transition-colors hover:text-foreground",
                          orden?.columna === columna.id && "text-foreground",
                        )}
                      >
                        {columna.label}
                        {orden?.columna === columna.id ? (
                          orden.asc ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 opacity-30" />
                        )}
                      </button>
                    </TableHead>
                  ))}
                  <TableHead className="text-xs text-foreground/58">
                    Objetivo
                  </TableHead>
                  <TableHead className="pr-4 text-xs text-foreground/58">
                    Estado
                  </TableHead>
                  {puedeAprobar && (
                    <TableHead className="text-right text-xs text-foreground/58" />
                  )}
                  {mostrarColumnaAgregar && (
                    <TableHead className="pr-4 text-right text-xs text-foreground/58" />
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((fila) => (
                  <TableRow
                    key={fila.clave}
                    onClick={puedeAbrir ? () => abrir(fila) : undefined}
                    className={cn(
                      "h-16 bg-card hover:bg-foreground/[0.04]",
                      puedeAbrir && "cursor-pointer",
                      !fila.conActividad && "opacity-70",
                    )}
                  >
                    <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={marcadas.has(fila.clave)}
                        onCheckedChange={(marcado) => alternarMarcada(fila.clave, Boolean(marcado))}
                        aria-label={`Marcar ${fila.nombre}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        {nivel === "anuncio" &&
                          (fila.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- viene de la CDN de Meta, con firma y expiración: no es un asset local que Next pueda optimizar
                            <img
                              src={fila.thumbnailUrl}
                              alt=""
                              className="size-9 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <span
                              className="size-9 shrink-0 rounded-md bg-foreground/8"
                              title={
                                fila.provider === "google"
                                  ? "Google no entrega miniatura de la pieza por esta vía"
                                  : "Sin miniatura disponible"
                              }
                            />
                          ))}
                        <div className="min-w-0">
                          <span
                            className="block max-w-[380px] truncate text-sm font-bold text-foreground"
                            title={fila.nombre}
                          >
                            {fila.nombre}
                          </span>
                          <span className="mt-1 block max-w-[380px] truncate text-xs text-foreground/45">
                            {platformLabel(fila.provider)} · {fila.contexto} ·{" "}
                            <span
                              className="metric-number"
                              title="Id de la cuenta publicitaria: el mismo que ves en la barra del administrador de anuncios de la plataforma"
                            >
                              {idDeCuentaVisible(fila.provider, fila.accountId)}
                            </span>
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    {/*
                      Sin actividad en el rango se escribe "—", nunca 0: un cero
                      se lee como "no rindió", y lo que ocurre es que la
                      plataforma no reporta nada para algo que estuvo apagado.
                      Columnas dinámicas: mismo arreglo que arma el encabezado,
                      así que nunca pueden desalinearse entre sí.
                    */}
                    {columnasEnOrden.map((columna) => {
                      const valor = fila.conActividad ? columna.valor(fila) : null;
                      return (
                        <TableCell
                          key={columna.id}
                          className={cn(
                            "metric-number text-right text-sm",
                            columna.destacada ? "font-bold text-foreground/82" : "text-foreground/66",
                          )}
                        >
                          {valor === null ? <SinDato /> : columna.formato(valor, fila)}
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      {fila.objetivo ? (
                        <span className="inline-flex rounded-full bg-brand/12 px-2 py-0.5 text-[0.62rem] font-bold text-brand">
                          {OBJETIVO_CORTO[
                            fila.objetivo as keyof typeof OBJETIVO_CORTO
                          ] ?? fila.objetivo}
                        </span>
                      ) : (
                        <span className="text-[0.62rem] text-foreground/38">
                          Sin sigla
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="pr-4">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[0.62rem] font-bold",
                            activo(estadosLocales[fila.clave] ?? fila.status)
                              ? "bg-ok-deep/12 text-ok"
                              : "bg-foreground/8 text-foreground/50",
                          )}
                        >
                          {estado(estadosLocales[fila.clave] ?? fila.status)}
                        </span>
                        {fila.pendienteSincronizacion && (
                          <span
                            title="Se publicó de verdad hace poco — Windsor todavía no la sincronizó, así que las cifras siguen en cero acá hasta que lo haga."
                            className="inline-flex rounded-full bg-warn-deep/12 px-2 py-0.5 text-[0.62rem] font-bold text-warn"
                          >
                            Publicada, sincronizando
                          </span>
                        )}
                      </span>
                    </TableCell>
                    {puedeAprobar && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {botonDescartar(fila)}
                          {botonGestionar(fila)}
                          {botonEditarAnuncio(fila)}
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
      <EditarAnuncioDialog
        anuncio={editandoAnuncio}
        open={Boolean(editandoAnuncio)}
        onOpenChange={(open) => !open && setEditandoAnuncio(null)}
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
        pendienteSincronizacion: ad.pendienteSincronizacion === true,
        spendMicros: ad.spendMicros,
        impressions: ad.impressions,
        clicks: ad.clicks,
        resultado,
        costo: null,
        reach: ad.reach,
        linkClicks: ad.linkClicks,
        engagement: ad.engagement,
        leads: ad.leads,
        purchases: ad.purchases,
        conversions: ad.conversions,
        thumbnailUrl: ad.thumbnailUrl ?? null,
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
    actual.reach = sumarNullable(actual.reach, ad.reach);
    actual.linkClicks = sumarNullable(actual.linkClicks, ad.linkClicks);
    actual.engagement = sumarNullable(actual.engagement, ad.engagement);
    actual.leads = sumarNullable(actual.leads, ad.leads);
    actual.purchases = sumarNullable(actual.purchases, ad.purchases);
    actual.conversions = sumarNullable(actual.conversions, ad.conversions);
    // Basta un elemento con actividad para que el grupo tenga cifras reales.
    if (ad.conActividad) actual.conActividad = true;
    if (ad.pendienteSincronizacion) actual.pendienteSincronizacion = true;
    // Basta un elemento activo para que el grupo esté entregando.
    if (activo(ad.status)) actual.status = ad.status;
    actual.campaignId = actual.campaignId ?? ad.campaignId;
    actual.adsetId = actual.adsetId ?? ad.adsetId;
    actual.adId = actual.adId ?? ad.adId;
    actual.thumbnailUrl = actual.thumbnailUrl ?? ad.thumbnailUrl ?? null;
  }

  for (const fila of grupos.values()) {
    fila.costo =
      fila.resultado && fila.resultado > 0
        ? fila.spendMicros / 1_000_000 / fila.resultado
        : null;
  }

  return [...grupos.values()].sort((a, b) => {
    // Primero lo que entregó; entre iguales, por inversión.
    if (a.conActividad !== b.conActividad) return a.conActividad ? -1 : 1;
    return b.spendMicros - a.spendMicros;
  });
}

/** Suma dos métricas que pueden no aplicar: null solo si ninguna de las dos aplicó nunca. */
function sumarNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
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

/**
 * El id de la cuenta como lo muestra la plataforma. Un cliente puede tener
 * varias cuentas con el mismo nombre (Colbún tiene una en Meta con campañas y
 * otra vacía): sin el id, es imposible saber a cuál de las dos se refiere una
 * fila al abrir el administrador de anuncios.
 */
function idDeCuentaVisible(provider: string, id: string): string {
  const soloDigitos = id.replace(/\D/g, "");
  if (provider === "google" && soloDigitos.length === 10) {
    return `${soloDigitos.slice(0, 3)}-${soloDigitos.slice(3, 6)}-${soloDigitos.slice(6)}`;
  }
  return id;
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

/**
 * "Sin actividad en el rango" — siempre "—", nunca 0 (ver la nota más
 * arriba). Antes heredaba el mismo peso visual que un número real (negrita
 * incluida en Invertido/Resultados), así que una fila sin actividad se leía
 * casi igual que una con datos. Su propio tono apagado, sin negrita,
 * distingue "no hay dato" de "el dato es esto" de un vistazo, sin dejar de
 * mostrarlo.
 */
function SinDato() {
  return <span className="font-normal text-foreground/25">—</span>;
}
