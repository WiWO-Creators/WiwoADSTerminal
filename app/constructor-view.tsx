"use client";

import { PresupuestoEnLinea } from "./presupuesto-mes";
import { SegmentacionMeta } from "./segmentacion-meta";
import { Campo, Seccion } from "./constructor-ui";
import { LimiteDeGastoMeta, OptimizacionMeta } from "./meta-avanzado";
import { CampanaDeLinkedin } from "./linkedin-avanzado";
import { LINKEDIN_POR_DEFECTO } from "@/lib/constructor-linkedin";
import { CampanaGoogleBusqueda, GrupoGoogleBusqueda, RecursosGoogleBusqueda } from "./google-busqueda";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Flame,
  ImageOff,
  Images,
  Info,
  Lock,
  Maximize2,
  Megaphone,
  Rocket,
  ShieldCheck,
  Upload,
  Wand2,
} from "lucide-react";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CTA_CODIGOS, CTA_COMUNES, esCta } from "@/lib/cta";
import { Textarea } from "@/components/ui/textarea";
import { nombreCompuesto } from "@/lib/nomenclatura";
import {
  CALL_TO_ACTIONS,
  META_OBJECTIVE_LABELS,
  META_PLACEMENTS,
  META_SURFACES,
  CONFIG_BUSQUEDA_POR_DEFECTO,
  OBJECTIVES,
  objetivoDe,
  diasHastaFin,
  SPECIAL_AD_CATEGORIES,
  type CallToAction,
  type CampaignDraft,
  type Gender,
  type GoogleChannel,
  type MetaObjectiveOverride,
  type Objective,
  type SemillaDeCampana,
  type SpecialAdCategory,
} from "@/lib/constructor";
import { CONSTRUCTOR_PLATFORMS, LECTURA_PLATFORMS, nombreDeNivel, platformLabel, type Platform } from "@/lib/plataformas";
import { cn } from "@/lib/utils";
import {
  precargarPublicaciones,
  SelectorDePublicaciones,
} from "./selector-publicaciones";
import { SelectorDeAnuncios } from "./selector-anuncios";
import { CopilotoDeCreativos } from "./copiloto-creativos";
import { GeneradorDeVariantes } from "./generador-variantes";
import { Surface, ThinkingOrb, OrbeDeBoton } from "./ui";

/**
 * El mapa de segmentación carga Leaflet, que toca `window`/`document` al
 * importarse — inservible durante el renderizado en el servidor (acá corre
 * en Cloudflare Workers, sin DOM). `ssr: false` lo deja fuera del render de
 * servidor y solo lo pide el navegador, cuando ya existe uno.
 */
const SegmentacionGeografica = dynamic(
  () => import("./geo-map").then((mod) => mod.SegmentacionGeografica),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-foreground/10 bg-field/40 text-xs text-foreground/40">
        <ThinkingOrb size="md" state="thinking" label="" />
        Cargando mapa…
      </div>
    ),
  },
);

/**
 * Cuenta de un cliente, tal como la sirve `/api/clientes` — mismo `pageId` y
 * `countries` por cuenta que ya usa la ficha del cliente.
 */
type Cuenta = {
  externalId: string;
  name: string;
  provider: string;
  currency: string | null;
  pageId: string | null;
  /** Puede haber más de uno por cuenta (MGC: Converse y Coliseum). */
  pixels: Array<{ id: string; pixelId: string; label: string | null }>;
  countries: string[];
};

type Cliente = { id: string; name: string; accounts: Cuenta[]; gtmEstado?: string | null };

/** Contenido real ya publicado, tal como lo sirve `/api/creatividades`. */

type Issue = { field: string; message: string; blocking: boolean };
type PlanStep = {
  platform: Platform;
  action: string;
  label: string;
  params: Record<string, unknown>;
  informativo?: boolean;
};
type BudgetAdvice = { suggested: number | null; currency: string | null; basis: string };
type Plan = {
  issues: Issue[];
  budgets: Partial<Record<Platform, BudgetAdvice>>;
  steps: PlanStep[];
  simulation: true;
};

/** Lo que devuelve la ejecución real: paso a paso, con lo que respondió cada plataforma. */
type Resultado = {
  ok: boolean;
  aviso: string;
  steps: Array<{
    platform: string;
    action: string;
    label: string;
    ok: boolean;
    error: string | null;
  }>;
  ids: Record<string, string>;
  /** Campañas, conjuntos o anuncios que Windsor confirmó como creados, pero
   * que al releer la cuenta real (justo después, en el mismo pedido) no
   * aparecieron — ver la nota en `app/api/constructor/ejecutar/route.ts`.
   * Vacío en el caso normal; ya viene descrito en `aviso`. */
  campanasSinConfirmar?: Array<{ platform: string; nivel: string; id: string }>;
  /** Si un paso hijo falló después de crear la campaña: qué quedó huérfano y
   * si se pudo marcar en la plataforma real. Ya viene descrito en `aviso`. */
  campanaIncompleta?: {
    platform: string;
    campaignId: string;
    nombreOriginal: string;
    marcada: boolean;
  } | null;
  error?: string;
  /** "duplicado": ya se publicó algo igual hace poco (respuesta 409). */
  codigo?: string;
  creado?: string[];
  hace?: number;
};

type Fase = "campana" | "conjunto" | "anuncio";

const FASES: Array<{ id: Fase; label: string; detalle: string }> = [
  { id: "campana", label: "Campaña", detalle: "Objetivo, cliente y categoría" },
  {
    id: "conjunto",
    label: "Conjunto de anuncios",
    detalle: "Presupuesto, público y ubicaciones",
  },
  { id: "anuncio", label: "Anuncio", detalle: "Identidad, destino y contenido" },
];

/** Las mismas tres fases con el nombre y el contenido que les da Google Ads. */
const FASES_GOOGLE: Array<{ id: Fase; label: string; detalle: string }> = [
  { id: "campana", label: "Campaña", detalle: "Objetivo, tipo, presupuesto, puja, redes y alcance" },
  { id: "conjunto", label: "Grupo de anuncios", detalle: "Nombre, puja del grupo y palabras clave" },
  { id: "anuncio", label: "Anuncio", detalle: "Anuncio de búsqueda responsivo y recursos" },
];

/**
 * Check del riel de índice: orientativo, no una validación real (esa sigue
 * viviendo en `validateDraft`, del lado del servidor). Solo dice si lo
 * mínimo de ese grupo ya está puesto, para saber dónde falta mirar.
 */
function grupoResuelto(id: Fase, draft: CampaignDraft): boolean {
  if (id === "campana") {
    if (draft.existingCampaign) return true;
    return Boolean(draft.portfolioId) && draft.platforms.length > 0 && draft.name.trim() !== "";
  }
  if (id === "conjunto") {
    if (draft.existingAdset) return true;
    return draft.dailyBudget !== null || Object.keys(draft.budgetByPlatform).length > 0;
  }
  return draft.landingUrl.trim() !== "";
}

/**
 * Contexto para abrir el constructor ya apuntando a algo que existe —viene
 * del botón "+ Añadir conjunto" o "+ Añadir anuncio" sobre una fila real del
 * administrador de anuncios—, en vez de partir de una campaña en blanco.
 */
export type ConstructorAttachTo = {
  portfolioId: string;
  platform: Platform;
  accountId: string;
  campaignId: string;
  campaignName: string;
  adsetId?: string;
  adsetName?: string;
};

/**
 * Convierte lo que se tipeó en un campo numérico opcional, sin dejar pasar
 * `NaN` al estado. `Number(e.target.value)` a secas (el patrón que ya usaban
 * presupuesto diario y tope de CPC) deja `NaN` en el draft si se tipea algo
 * no numérico — y como `NaN ?? ""` no cae en el `??` (`NaN` no es nullish),
 * el campo controlado queda mostrando literalmente "NaN" en pantalla, sin
 * forma de corregirlo tecleando encima.
 */
function numeroOVacio(texto: string): number | null {
  if (!texto.trim()) return null;
  const valor = Number(texto);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Campo de dinero: `type="number"` traía las flechas nativas del navegador
 * para subir o bajar de a uno —inútiles en montos de miles de pesos— y
 * mostraba el número pelado, sin puntos de miles, hasta que se hacía la
 * cuenta a mano. Este es `type="text"` por dentro (sin flechas posible) y
 * formatea con puntos de miles y el signo "$" en cada tecleo, guardando en
 * el draft solo el número.
 */
function CampoDinero({
  value,
  onChange,
  placeholder = "0",
  className,
  moneda,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
  /**
   * Código real de la cuenta elegida (CLP, USD, PEN…) — nunca se infiere del
   * país: Truecaller Colombia, por ejemplo, factura en USD. `null` cuando
   * todavía no se puede resolver una sola cuenta (ninguna elegida y la
   * plataforma tiene varias) — ahí se cae al "$" genérico de antes.
   */
  moneda?: string | null;
}) {
  const prefijo = moneda ?? "$";
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground/40">
        {prefijo}
      </span>
      <Input
        type="text"
        inputMode="numeric"
        value={value === null ? "" : value.toLocaleString("es-CL")}
        onChange={(e) => {
          const digitos = e.target.value.replace(/[^\d]/g, "");
          onChange(digitos === "" ? null : Number(digitos));
        }}
        placeholder={placeholder}
        className="bg-field/60 pl-12"
      />
    </div>
  );
}

/** Dónde se guarda el borrador mientras la app se actualiza (ver app/actualizacion.tsx). */
const CLAVE_PROGRESO_CONSTRUCTOR = "wiwo_progreso_constructor";

function borradorInicial(
  attachTo?: ConstructorAttachTo,
  clienteGlobal?: string | null,
  semilla?: SemillaDeCampana,
): CampaignDraft {
  // "Crear campaña para este cliente" llega con portfolioId pero sin
  // campaignId: ahí solo se precarga el cliente, no se adjunta a nada — una
  // campaña que todavía no existe no tiene id que adjuntarle.
  const adjuntando = Boolean(attachTo?.campaignId);
  return {
    // `attachTo` manda cuando existe —es un destino concreto, no una
    // preferencia—; sin eso, se parte del cliente marcado en el selector del
    // navbar, para no pedir elegirlo de nuevo acá adentro.
    portfolioId: attachTo?.portfolioId ?? clienteGlobal ?? "",
    // `attachTo` de "nueva campaña" también llega con un `platform` fijo
    // (placeholder), así que lo que de verdad distingue un destino real es
    // `adjuntando` — solo ahí el `platform` de `attachTo` es información y
    // no un relleno.
    platforms: adjuntando
      ? [attachTo!.platform]
      : semilla?.platforms.length
        ? semilla.platforms
        : ["google"],
    accountByPlatform: attachTo?.accountId
      ? { [attachTo.platform]: attachTo.accountId }
      : semilla?.boost
        ? { meta: semilla.boost.accountId }
        : {},
    metaPixelId: null,
    name: semilla?.name ?? "",
    details: semilla?.details ?? "",
    objective: semilla?.objective ?? "trafico",
    objectiveByPlatform: semilla?.objectiveByPlatform ?? {},
    // Una campaña nueva con Google nace con su estructura propia; adjuntar a algo existente no la usa.
    googleBusqueda: !adjuntando && (semilla?.platforms.length ? semilla.platforms : ["google"]).includes("google") ? CONFIG_BUSQUEDA_POR_DEFECTO : null,
    metaObjective: null,
    specialAdCategory: "ninguna",
    conversionLocation: "sitio_web",
    dailyBudget: semilla?.dailyBudget ?? null,
    budgetByPlatform: semilla?.budgetByPlatform ?? {},
    budgetMode: semilla?.budgetMode ?? "diaria",
    endDate: semilla?.endDate ?? null,
    landingUrl: semilla?.landingUrl ?? "",
    headlines: semilla?.headlines ?? [],
    descriptions: semilla?.descriptions ?? [],
    pathDisplay1: "",
    pathDisplay2: "",
    displaySquareUrl: "",
    displayLogoUrl: "",
    displayLongHeadline: "",
    displayBusinessName: "",
    keywords: semilla?.keywords ?? [],
    negativeKeywords: [],
    cpcCeiling: null,
    targetLanguages: semilla?.targetLanguages ?? [],
    message: semilla?.metaMessage ?? "",
    metaHeadline: semilla?.metaHeadline ?? "",
    metaDescription: semilla?.metaDescription ?? "",
    metaBudgetLevel: "campana",
    // Impulsando un anuncio ya publicado, la pieza es la suya: se muestra para
    // la vista previa y `boost_post` reutiliza la publicación real.
    mediaUrl: semilla?.boost?.mediaUrl ?? semilla?.versionDeAnuncio?.mediaUrl ?? "",
    mediaType: semilla?.boost?.mediaUrl || semilla?.versionDeAnuncio?.mediaUrl ? "image" : "none",
    boostPostId: semilla?.boost?.postId ?? null,
    ageMin: 18,
    ageMax: 65,
    gender: "todos",
    googleChannel: "search",
    metaPlacements: [],
    metaSurfaces: [],
    metaInterests: [],
    metaBidStrategy: "LOWEST_COST_WITHOUT_CAP",
    metaBidAmount: null,
    metaSpendCap: null,
    metaAttribution: "default",
    metaCustomAudiences: [],
    metaExcludedAudiences: [],
    targetCountries: semilla?.targetCountries ?? [],
    targetPlaces: semilla?.targetPlaces ?? [],
    geoRadius: null,
    excludedCountries: [],
    callToAction:
      semilla?.versionDeAnuncio?.cta && esCta(semilla.versionDeAnuncio.cta) ? semilla.versionDeAnuncio.cta : "LEARN_MORE",
    brandSafety: "estandar",
    existingCampaign:
      adjuntando && attachTo
        ? {
            platform: attachTo.platform,
            accountId: attachTo.accountId,
            campaignId: attachTo.campaignId,
            campaignName: attachTo.campaignName,
          }
        : null,
    existingAdset:
      adjuntando && attachTo?.adsetId && attachTo.adsetName
        ? { adsetId: attachTo.adsetId, adsetName: attachTo.adsetName }
        : null,
    // Default true: el ahorro de pasos vale para campaña nueva. En modo
    // "adjuntar" no tiene efecto de todos modos (ver `buildPlan`), pero
    // dejarlo en true igual es más simple que bifurcar acá.
    activarConjuntoYAnuncio: true,
    linkedin: { ...LINKEDIN_POR_DEFECTO, ubicacionesGeo: [] },
  };
}

/**
 * Constructor de campañas.
 *
 * La estructura sigue la de Meta a propósito —Campaña, Conjunto de anuncios,
 * Anuncio, con las mismas secciones dentro de cada una— porque de las
 * plataformas activas es la que declara más detalle, y ese detalle cubre lo
 * que Google también necesita sin tener que inventarle un campo aparte a cada
 * plataforma. Donde Google no tiene equivalente real, la sección lo dice.
 *
 * Arma el plan y lo muestra; no publica nada.
 */
export function ConstructorView({
  attachTo,
  clienteGlobal,
  onCambiarClienteGlobal,
  onPublicado,
  semillaIA,
  verPlanTecnico = false,
  soloEnviaARevision = false,
}: {
  attachTo?: ConstructorAttachTo;
  /** Analistas: arman el borrador pero no publican; lo envían a un supervisor para que lo apruebe. */
  soloEnviaARevision?: boolean;
  /** Solo administración ve los pasos y parámetros crudos del plan (y aun así, cerrados). */
  verPlanTecnico?: boolean;
  /** Se llama cuando algo llegó a crearse, para que el resto de la app
   * relea sus datos y la campaña nueva aparezca sin recargar. */
  onPublicado?: () => void;
  /** El cliente marcado en el selector del navbar — punto de partida cuando
   * no se llega con un destino concreto ya elegido. */
  clienteGlobal?: string | null;
  /** Sin esto, elegir otro cliente acá adentro no se reflejaba en el navbar
   * ni en el resto de la app — cada uno vivía su propia selección. */
  onCambiarClienteGlobal?: (portfolioId: string) => void;
  /** Con qué precargar una campaña nueva, cuando se llega desde una
   * propuesta del asistente de IA. Se ignora si `attachTo` ya trae un
   * destino concreto — ahí manda lo que se está adjuntando, no la sugerencia. */
  semillaIA?: SemillaDeCampana;
} = {}) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [draft, setDraft] = useState<CampaignDraft>(() => {
    // Tras una actualización de la app, se retoma el borrador que se estaba armando (solo si se guardó hace menos de 5 minutos).
    if (typeof window !== "undefined") {
      try {
        const crudo = window.sessionStorage.getItem(CLAVE_PROGRESO_CONSTRUCTOR);
        if (crudo) {
          window.sessionStorage.removeItem(CLAVE_PROGRESO_CONSTRUCTOR);
          const p = JSON.parse(crudo) as { draft?: CampaignDraft; ts?: number };
          if (p.draft && p.ts && Date.now() - p.ts < 5 * 60_000) return { ...borradorInicial(attachTo, clienteGlobal, semillaIA), ...p.draft };
        }
      } catch {
        // Un borrador ilegible se ignora: se parte de cero.
      }
    }
    return borradorInicial(attachTo, clienteGlobal, semillaIA);
  });
  // Antes de que la app se actualice, se guarda el borrador para recuperarlo al volver.
  const borradorRef = useRef(draft);
  useEffect(() => {
    borradorRef.current = draft;
  }, [draft]);
  useEffect(() => {
    const guardar = () => {
      try {
        window.sessionStorage.setItem(CLAVE_PROGRESO_CONSTRUCTOR, JSON.stringify({ draft: borradorRef.current, ts: Date.now() }));
      } catch {
        // Sin almacenamiento del navegador no se puede recordar: la actualización sigue.
      }
    };
    window.addEventListener("wiwo:guardar-progreso", guardar);
    return () => window.removeEventListener("wiwo:guardar-progreso", guardar);
  }, []);
  // Qué parte del formulario se ve (0 campaña, 1 conjunto, 2 anuncio): una a la
  // vez, como en Meta. Si se viene de "+ Añadir conjunto/anuncio", la campaña (y
  // el conjunto) ya existen y se parte por lo que falta.
  const [paso, setPaso] = useState<0 | 1 | 2>(() => {
    const inicial = borradorInicial(attachTo, clienteGlobal, semillaIA);
    return inicial.existingAdset ? 2 : inicial.existingCampaign ? 1 : 0;
  });
  // Los mapas (Leaflet) se miden al crearse: los de una parte oculta nacen sin
  // tamaño. Al cambiar de parte se les avisa que recalculen.
  useEffect(() => {
    const t = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    return () => window.clearTimeout(t);
  }, [paso]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planAbierto, setPlanAbierto] = useState(false);
  // Con qué borrador se armó `plan` — si `draft` cambió desde entonces (se
  // tocó el presupuesto, la segmentación, etc.), el plan queda desactualizado
  // y no hay que confiar en su lista de bloqueantes ni mostrar "Publicar"
  // con un estado que ya no es el real.
  const [planDraftJson, setPlanDraftJson] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [duplicado, setDuplicado] = useState<{ creado: string[]; hace: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Qué plataforma se ve en el selector tipo carrusel de Conjunto y Anuncio,
  // cuando hay más de una elegida. Orden estable: el de CONSTRUCTOR_PLATFORMS, no
  // el orden en que se fueron marcando los botones.
  const [plataformaActiva, setPlataformaActiva] = useState<Platform>(
    draft.platforms[0] ?? "google",
  );
  const plataformasElegidas = CONSTRUCTOR_PLATFORMS.filter((p) =>
    draft.platforms.includes(p),
  );
  // Solo Google (campaña nueva): el formulario sigue la estructura de Google Ads, no la de Meta.
  const soloGoogle = plataformasElegidas.length === 1 && plataformasElegidas[0] === "google" && !draft.existingCampaign;
  const fases = soloGoogle ? FASES_GOOGLE : FASES;

  // Si la pestaña activa deja de estar entre las elegidas —se destildó esa
  // plataforma, o todavía no hay ninguna— se cae a la primera disponible acá
  // mismo, durante el render (React lo soporta y lo prefiere para esto), en
  // vez de confirmar un render con el formulario de algo que ya no aplica y
  // recién corregirlo un instante después en un efecto.
  // Solo si hay alguna elegida: con ninguna (se desmarcó la única) no hay a cuál caer, y volver a fijar «google» en el
  // render dejaba la condición cumplida para siempre → bucle de renders («Too many re-renders»).
  if (plataformasElegidas.length > 0 && !plataformasElegidas.includes(plataformaActiva)) {
    setPlataformaActiva(plataformasElegidas[0]);
  }

  // Llegando a añadir un anuncio o un conjunto sobre algo que ya existe, el
  // formulario entero sigue visible (ya no hay pasos que ocultar), pero
  // conviene arrancar el scroll en el grupo que de verdad hace falta llenar,
  // no arriba del todo en "Campaña" (que acá ya viene resuelta).
  useEffect(() => {
    const grupoInicial = attachTo?.adsetId
      ? "grupo-anuncio"
      : attachTo?.campaignId
        ? "grupo-conjunto"
        : null;
    if (grupoInicial) {
      document.getElementById(grupoInicial)?.scrollIntoView({ block: "start" });
    }
    // Solo al montar: es el punto de entrada, no algo que deba repetirse si
    // `attachTo` cambiara de identidad después (no cambia en la práctica).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const response = await fetch("/api/clientes", { cache: "no-store" });
        const body = (await response.json()) as { portfolios?: Cliente[] };
        if (!cancelado) setClientes(body.portfolios ?? []);
      } catch {
        // El selector de cliente queda vacío; el resto del formulario sigue usable.
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const cliente = clientes.find((c) => c.id === draft.portfolioId) ?? null;
  const cuentas = cliente?.accounts ?? [];

  // Apenas se sabe con qué cuenta de Meta se va a publicar, se trae en
  // segundo plano el contenido ya publicado: cuando alguien llega al anuncio y
  // abre "Elegir publicación", ya está ahí.
  const cuentasMeta = cuentas.filter((c) => c.provider === "meta");
  const cuentaMetaId = draft.platforms.includes("meta")
    ? (cuentasMeta.find((c) => c.externalId === draft.accountByPlatform.meta) ??
        (cuentasMeta.length === 1 ? cuentasMeta[0] : undefined))?.externalId
    : undefined;
  useEffect(() => {
    if (draft.portfolioId && cuentaMetaId) {
      precargarPublicaciones(draft.portfolioId, cuentaMetaId);
    }
  }, [draft.portfolioId, cuentaMetaId]);

  function actualizar(cambios: Partial<CampaignDraft>) {
    setDraft((actual) => ({ ...actual, ...cambios }));
  }

  /**
   * Aplica la sugerencia de una plataforma puntual, nunca el total: dos
   * plataformas casi nunca gastan lo mismo, así que un botón que rellenara un
   * único presupuesto compartido terminaría siendo tan engañoso como el
   * número general que reemplaza.
   */
  function usarPresupuestoSugerido(platform: Platform, sugeridoDiario: number) {
    // La sugerencia es por día; en modo total se multiplica por los días que quedan hasta el término.
    const dias = draft.budgetMode === "total" && draft.endDate ? diasHastaFin(draft.endDate) : 0;
    if (draft.budgetMode === "total" && dias === 0) {
      toast.info("Elige primero la fecha de término para convertir lo diario en total.");
      return;
    }
    const monto = draft.budgetMode === "total" ? sugeridoDiario * dias : sugeridoDiario;
    if (draft.platforms.length > 1) {
      actualizar({ budgetByPlatform: { ...draft.budgetByPlatform, [platform]: monto } });
    } else {
      actualizar({ dailyBudget: monto });
    }
  }

  function alternarPlataforma(value: Platform) {
    setDraft((actual) => ({
      ...actual,
      platforms: actual.platforms.includes(value)
        ? actual.platforms.filter((item) => item !== value)
        : [...actual.platforms, value],
      // Google se crea con su propia estructura (puja, redes, programación, recursos) desde que se elige.
      googleBusqueda: value === "google" && !actual.googleBusqueda ? CONFIG_BUSQUEDA_POR_DEFECTO : actual.googleBusqueda,
    }));
  }

  async function revisarPlan() {
    setBusy(true);
    setError(null);
    // Un plan nuevo deja obsoleto el resultado de la publicación anterior.
    setResultado(null);
    try {
      const response = await fetch("/api/constructor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await response.json()) as Plan & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo armar");
      setPlan(body);
      setPlanDraftJson(JSON.stringify(draft));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "No se pudo armar");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Publica de verdad. El servidor vuelve a armar el plan con este mismo
   * borrador, así que lo que se ve en pantalla es lo que se ejecuta.
   */
  async function publicar(duplicar = false) {
    setPublicando(true);
    setError(null);
    try {
      const response = await fetch("/api/constructor/ejecutar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft, confirmacion: "CREAR", duplicar }),
      });
      const body = (await response.json()) as Resultado;
      if (response.status === 409 && body.codigo === "duplicado") {
        // No es un fallo: es una pregunta. Nada se envió todavía.
        setDuplicado({ creado: body.creado ?? [], hace: body.hace ?? 0 });
        return;
      }
      setResultado(body);
      if (!response.ok && body.error) setError(body.error);
      if (body.steps?.some((paso) => paso.ok)) onPublicado?.();
    } catch (issue) {
      setError(
        issue instanceof Error
          ? issue.message
          : "No se pudo contactar al servidor. Revisa en la plataforma si alcanzó a crearse algo.",
      );
    } finally {
      setPublicando(false);
    }
  }

  /** Analistas: deja el borrador en la cola de un supervisor. No se crea nada en las plataformas. */
  async function enviarARevision() {
    setPublicando(true);
    setError(null);
    try {
      const response = await fetch("/api/solicitudes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ drafts: [draft] }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; solicitud?: { mensaje: string } };
      if (!response.ok) throw new Error(body.error ?? "No se pudo enviar a revisión");
      setEnviado(body.solicitud?.mensaje ?? "Tu creación fue enviada a revisión.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "No se pudo enviar a revisión");
    } finally {
      setPublicando(false);
    }
  }

  const planVigente = plan !== null && planDraftJson === JSON.stringify(draft);
  const bloqueantes = planVigente ? (plan?.issues.filter((i) => i.blocking) ?? []) : [];
  const avisos = planVigente ? (plan?.issues.filter((i) => !i.blocking) ?? []) : [];

  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 md:p-6">
      <div className="mb-5">
        <h2 className="neo-section-title">
          {draft.existingAdset
            ? "Añade un anuncio, revísalo antes de publicar"
            : draft.existingCampaign
              ? "Añade un conjunto de anuncios, revísalo antes de publicar"
              : "Arma una campaña, revísala antes de publicar"}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/58">
          {draft.existingCampaign ? (
            <>
              Sobre <strong className="text-foreground/80">{draft.existingCampaign.campaignName}</strong>
              {draft.existingAdset ? (
                <>
                  {" "}
                  · <strong className="text-foreground/80">{draft.existingAdset.adsetName}</strong>
                </>
              ) : null}
              . Lo que ya está definido en la campaña no se vuelve a pedir.
            </>
          ) : (
            "Los mismos pasos de Meta —Campaña, Conjunto de anuncios, Anuncio— traducidos a lo que cada plataforma elegida realmente admite."
          )}
        </p>
      </div>

      <div className="mb-4 flex items-start gap-3 rounded-[16px] border border-[#3BFF00]/25 bg-[#3BFF00]/[0.06] px-4 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
        <p className="text-xs leading-5 text-foreground/70">
          <strong className="text-foreground">Nada sale sin que lo apruebes.</strong>{" "}
          Armar y revisar el plan no toca ninguna plataforma. Solo el botón de
          publicar, al final, crea de verdad — y lo aprobado queda corriendo,
          así que revisa bien el plan antes de enviarlo.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_420px]">
        {/* Las tres partes de Meta (Campaña, Conjunto, Anuncio): se ve una a la
            vez y se puede saltar a cualquiera. El check dice si lo mínimo de
            esa parte ya está puesto. */}
        <Surface className="h-fit overflow-hidden p-2">
          {fases.map((item, indiceFase) => {
            const completo = grupoResuelto(item.id, draft);
            const actual = paso === indiceFase;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={actual ? "step" : undefined}
                onClick={() => {
                  setPaso(indiceFase as 0 | 1 | 2);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-foreground/6 hover:text-foreground",
                  actual ? "bg-brand/10 text-foreground ring-1 ring-brand/30" : "text-foreground/55",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                    completo
                      ? "border-[#3BFF00]/40 bg-[#3BFF00]/15 text-brand"
                      : "border-foreground/20 text-transparent",
                  )}
                >
                  <Check className="size-3" />
                </span>
                <span>
                  <span className="block text-sm font-bold">{item.label}</span>
                  <span className="mt-0.5 block text-[0.68rem] text-foreground/45">
                    {item.detalle}
                  </span>
                </span>
              </button>
            );
          })}
        </Surface>

        {/* Una parte a la vez. Las otras quedan ocultas, no desmontadas, para no
            perder lo que ya se llenó dentro de ellas. */}
        <div className="space-y-6">
          <div className={paso === 0 ? "" : "hidden"}>
          <GrupoDeSecciones
            id="grupo-campana"
            titulo={fases[0].label}
            detalle={fases[0].detalle}
          >
            <FaseCampana
              soloGoogle={soloGoogle}
              draft={draft}
              clientes={clientes}
              cargandoClientes={cargando}
              cuentas={cuentas}
              onChange={actualizar}
              onTogglePlatform={alternarPlataforma}
              onCambiarClienteGlobal={onCambiarClienteGlobal}
            />
          </GrupoDeSecciones>
          </div>

          <div className={paso === 1 ? "" : "hidden"}>
          <GrupoDeSecciones
            id="grupo-conjunto"
            titulo={fases[1].label}
            detalle={fases[1].detalle}
          >
            <FaseConjunto
              soloGoogle={soloGoogle}
              sinConversionesMedidas={clientes.find((c) => c.id === draft.portfolioId)?.gtmEstado === "no_tiene"}
              draft={draft}
              cuentas={cuentas}
              onChange={actualizar}
              plataformasElegidas={plataformasElegidas}
              plataformaActiva={plataformaActiva}
              onPlataformaActiva={setPlataformaActiva}
            />
          </GrupoDeSecciones>
          </div>

          <div className={paso === 2 ? "" : "hidden"}>
          <GrupoDeSecciones
            id="grupo-anuncio"
            titulo={fases[2].label}
            detalle={fases[2].detalle}
          >
            <FaseAnuncio
              draft={draft}
              cuentas={cuentas}
              onChange={actualizar}
              plataformasElegidas={plataformasElegidas}
              plataformaActiva={plataformaActiva}
              onPlataformaActiva={setPlataformaActiva}
            />
          </GrupoDeSecciones>
          </div>


          <div className="flex items-center justify-between gap-3 border-t border-foreground/10 pt-4">
            {paso > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPaso((paso - 1) as 0 | 1 | 2);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <ChevronLeft /> {fases[paso - 1].label}
              </Button>
            ) : (
              <span />
            )}
            {paso < 2 ? (
              <Button
                type="button"
                onClick={() => {
                  setPaso((paso + 1) as 0 | 1 | 2);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="font-extrabold"
              >
                Siguiente: {fases[paso + 1].label} <ChevronRight />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void revisarPlan()}
                disabled={busy}
                className="font-extrabold"
              >
                {busy ? <ThinkingOrb size="xs" state="thinking" label="" /> : <Wand2 />}
                Revisar el plan
              </Button>
            )}
          </div>
        </div>

        {/* Vista previa y plan, visibles durante todo el recorrido. */}
        <div className="space-y-4">
          <VistaPrevia draft={draft} cuentas={cuentas} />

          {error && (
            <div className="rounded-[16px] border border-danger-deep/25 bg-danger-deep/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          {plan && (
            <>
              {!planVigente && (
                <Surface className="border-warn-deep/25 bg-warn-deep/[0.06] p-4">
                  <p className="text-sm font-bold text-foreground">
                    Cambiaste algo después de revisar el plan
                  </p>
                  <p className="mt-1 text-xs leading-5 text-foreground/60">
                    Lo de abajo quedó desactualizado. Tocá &quot;Revisar el
                    plan&quot; de nuevo para ver el estado real antes de
                    publicar.
                  </p>
                </Surface>
              )}

              {planVigente && Object.keys(plan.budgets).length > 0 && (
                <Surface className="divide-y divide-foreground/8 p-0">
                  <p className="font-micro px-4 pt-3.5 text-[0.6rem] text-foreground/45">
                    PRESUPUESTO SUGERIDO
                  </p>
                  {draft.platforms.map((platform) => {
                    const advice = plan.budgets[platform];
                    if (!advice) return null;
                    return (
                      <div
                        key={platform}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="font-micro text-[0.6rem] text-foreground/45">
                            {platformLabel(platform).toUpperCase()}
                          </p>
                          <p className="metric-number mt-0.5 text-xl font-bold text-foreground">
                            {advice.suggested === null
                              ? "Sin dato"
                              : `${advice.currency ?? ""} ${advice.suggested.toLocaleString("es-CL")}`}
                          </p>
                          <p className="mt-0.5 text-[0.68rem] leading-4 text-foreground/50">
                            {advice.basis}
                          </p>
                        </div>
                        {advice.suggested !== null && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => usarPresupuestoSugerido(platform, advice.suggested as number)}
                            className="shrink-0"
                          >
                            Usar
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </Surface>
              )}

              {planVigente && bloqueantes.length > 0 && (
                <Surface className="border-danger-deep/25 bg-danger-deep/[0.06] p-4">
                  <p className="text-sm font-bold text-foreground">
                    Falta resolver {bloqueantes.length}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {bloqueantes.map((issue, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-xs leading-5 text-danger"
                      >
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </Surface>
              )}

              {planVigente && avisos.length > 0 && (
                <Surface className="border-warn-deep/25 bg-warn-deep/[0.06] p-4">
                  <ul className="space-y-1.5">
                    {avisos.map((issue, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-xs leading-5 text-warn"
                      >
                        <Info className="mt-0.5 size-3.5 shrink-0" />
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </Surface>
              )}

              {planVigente && (
                <Surface className="overflow-hidden">
                  {verPlanTecnico && (<>
                  <button
                    type="button"
                    onClick={() => setPlanAbierto((v) => !v)}
                    aria-expanded={planAbierto}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span>
                      <span className="block font-bold text-foreground">Lo que se ejecutaría</span>
                      <span className="mt-1 block text-xs text-foreground/50">
                        {plan.steps.filter((s) => !s.informativo).length} pasos ·{" "}
                        {resultado ? "ya ejecutado" : "todavía sin enviar"}
                      </span>
                    </span>
                    <ChevronDown className={cn("size-4 shrink-0 text-foreground/50 transition-transform", planAbierto && "rotate-180")} />
                  </button>
                  <ol className={cn("divide-y divide-foreground/8 border-t border-foreground/10", !planAbierto && "hidden")}>
                    {plan.steps.map((step, index) => (
                      <li key={index} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-micro rounded-full border border-foreground/12 px-2 py-0.5 text-[0.55rem] text-foreground/50">
                            {platformLabel(step.platform).toUpperCase()}
                          </span>
                          <span className="text-sm font-bold text-foreground">
                            {step.label}
                          </span>
                          {step.informativo && (
                            <span className="font-micro rounded-full border border-brand/25 bg-brand/10 px-1.5 py-0.5 text-[0.52rem] text-brand">
                              INFORMATIVO
                            </span>
                          )}
                        </div>
                        <pre className="metric-number mt-2 overflow-x-auto rounded-lg bg-field/70 p-2.5 text-[0.68rem] leading-5 text-foreground/62">
                          {JSON.stringify(step.params, null, 2)}
                        </pre>
                      </li>
                    ))}
                  </ol>
                  </>)}

                  {/*
                    El único punto del sistema que cambia algo fuera de acá.
                    Aparece solo cuando no queda nada bloqueante, y lo que se
                    ejecuta es este mismo plan: el servidor lo vuelve a armar
                    con el borrador, no confía en lo que mande el navegador.
                  */}
                  {bloqueantes.length === 0 && !resultado && soloEnviaARevision && (
                    <div className="border-t border-foreground/10 p-4">
                      {enviado ? (
                        <p className="text-sm font-semibold text-foreground">{enviado} Mira su estado en «Solicitudes».</p>
                      ) : (
                        <>
                          <Button type="button" onClick={() => void enviarARevision()} disabled={publicando} className="w-full font-extrabold">
                            {publicando ? <OrbeDeBoton /> : <Rocket />}
                            Enviar a revisión
                          </Button>
                          <p className="mt-2 text-center text-[0.68rem] leading-5 text-foreground/45">
                            Un supervisor lo revisa y lo aprueba. Hasta entonces no se crea nada en la plataforma.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  {bloqueantes.length === 0 && !resultado && !soloEnviaARevision && (
                    <div className="border-t border-foreground/10 p-4">
                      <Button
                        type="button"
                        onClick={() => void publicar(false)}
                        disabled={publicando}
                        className="w-full font-extrabold"
                      >
                        {publicando ? (
                          <OrbeDeBoton />
                        ) : (
                          <Rocket />
                        )}
                        Publicar en{" "}
                        {draft.platforms.map(platformLabel).join(" y ")}
                      </Button>
                      <p className="mt-2 text-center text-[0.68rem] leading-5 text-foreground/45">
                        Se crea de verdad en la cuenta del cliente y queda
                        corriendo. Si eres analista, primero pasa por aprobación.
                      </p>
                    </div>
                  )}
                </Surface>
              )}

              {resultado && (() => {
                const sinConfirmar = Boolean(
                  resultado.ok && resultado.campanasSinConfirmar?.length,
                );
                return (
                <Surface
                  className={cn(
                    "overflow-hidden",
                    !resultado.ok
                      ? "border-danger-deep/25 bg-danger-deep/[0.06]"
                      : sinConfirmar
                        ? "border-warn-deep/30 bg-warn-deep/[0.06]"
                        : "border-[#3BFF00]/25 bg-[#3BFF00]/[0.05]",
                  )}
                >
                  <div className="border-b border-foreground/10 px-4 py-3">
                    <h3 className="flex items-center gap-2 font-bold text-foreground">
                      {!resultado.ok ? (
                        <AlertCircle className="size-4 text-danger" />
                      ) : sinConfirmar ? (
                        <AlertCircle className="size-4 text-warn" />
                      ) : (
                        <Check className="size-4 text-brand" />
                      )}
                      {resultado.ok ? (sinConfirmar ? "Creado — sin confirmar" : "Creado") : "Se detuvo"}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-foreground/62">
                      {resultado.error ?? resultado.aviso}
                    </p>
                  </div>
                  <JerarquiaCreada
                    pasosEsperados={plan.steps.filter((paso) => !paso.informativo)}
                    resultado={resultado}
                  />
                  <ul className="divide-y divide-foreground/8">
                    {resultado.steps.map((paso, index) => (
                      <li key={index} className="flex items-start gap-2 px-4 py-2.5">
                        {paso.ok ? (
                          <Check className="mt-0.5 size-3.5 shrink-0 text-brand" />
                        ) : (
                          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-danger" />
                        )}
                        <span className="min-w-0">
                          <span className="block text-sm text-foreground/82">
                            {paso.label}
                          </span>
                          {paso.error && (
                            <span className="mt-0.5 block text-xs leading-5 text-danger">
                              {paso.error}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {Object.keys(resultado.ids).length > 0 && (
                    <div className="border-t border-foreground/10 px-4 py-3">
                      <p className="font-micro text-[0.58rem] text-foreground/45">
                        IDENTIFICADORES CREADOS
                      </p>
                      <pre className="metric-number mt-1.5 overflow-x-auto text-[0.68rem] leading-5 text-foreground/62">
                        {JSON.stringify(resultado.ids, null, 2)}
                      </pre>
                    </div>
                  )}
                </Surface>
                );
              })()}
            </>
          )}
        </div>
      </div>

      <AlertDialog
        open={duplicado !== null}
        onOpenChange={(abierto) => !abierto && setDuplicado(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esto ya se publicó hace poco</AlertDialogTitle>
            <AlertDialogDescription>
              Una campaña con este nombre se publicó hace{" "}
              {duplicado ? Math.max(1, Math.round(duplicado.hace / 60_000)) : 0} min
              y algo quedó creado en la plataforma. Publicarla otra vez la
              duplica, y no hay forma de borrarla desde acá.
            </AlertDialogDescription>
            {duplicado && duplicado.creado.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-foreground/70">
                {duplicado.creado.map((linea, indice) => (
                  <li key={indice}>· {linea}</li>
                ))}
              </ul>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No publicar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDuplicado(null);
                void publicar(true);
              }}
            >
              Publicar igual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Qué nivel de cada plataforma llegó a crearse: campaña → conjunto → anuncio.
 *
 * El detalle paso a paso ya estaba, pero un plan que se cortaba a mitad de
 * camino dejaba campañas sin conjunto ni anuncio y había que descubrirlo
 * leyendo la lista. Sin el conjunto de anuncios (grupo de anuncios en Google)
 * una campaña no puede entregar nada, así que ese es el nivel que se marca
 * más fuerte cuando falta.
 */
const NIVELES_DE_CREACION: Array<{
  id: "campana" | "conjunto" | "anuncio";
  acciones: string[];
  etiqueta: (plataforma: string) => string;
}> = [
  { id: "campana", acciones: ["create_campaign"], etiqueta: () => "Campaña" },
  {
    id: "conjunto",
    acciones: ["create_adset", "create_ad_group"],
    etiqueta: (plataforma) => nombreDeNivel(plataforma, "conjunto"),
  },
  {
    id: "anuncio",
    acciones: ["create_ad", "create_responsive_search_ad", "boost_post"],
    etiqueta: () => "Anuncio",
  },
];

function JerarquiaCreada({
  pasosEsperados,
  resultado,
}: {
  pasosEsperados: Array<{ platform: string; action: string }>;
  resultado: Resultado;
}) {
  const plataformas = [...new Set(pasosEsperados.map((paso) => paso.platform))];
  return (
    <div className="space-y-3 border-b border-foreground/10 px-4 py-3">
      {plataformas.map((plataforma) => {
        const niveles = NIVELES_DE_CREACION.filter((nivel) =>
          pasosEsperados.some(
            (paso) => paso.platform === plataforma && nivel.acciones.includes(paso.action),
          ),
        ).map((nivel) => {
          const hechos = resultado.steps.filter(
            (paso) => paso.platform === plataforma && nivel.acciones.includes(paso.action),
          );
          const estado: "listo" | "fallo" | "pendiente" =
            hechos.length === 0
              ? "pendiente"
              : hechos.every((paso) => paso.ok)
                ? "listo"
                : "fallo";
          return { ...nivel, estado };
        });
        const faltaConjunto = niveles.some(
          (nivel) => nivel.id === "conjunto" && nivel.estado !== "listo",
        );
        return (
          <div key={plataforma}>
            <p className="font-micro text-[0.58rem] text-foreground/45">
              {platformLabel(plataforma).toUpperCase()}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {niveles.map((nivel, indice) => (
                <span key={nivel.id} className="flex items-center gap-1.5">
                  {indice > 0 && <ChevronRight className="size-3 text-foreground/25" />}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold",
                      nivel.estado === "listo" &&
                        "border-[#3BFF00]/30 bg-[#3BFF00]/10 text-brand",
                      nivel.estado === "fallo" &&
                        "border-danger-deep/40 bg-danger-deep/15 text-danger",
                      nivel.estado === "pendiente" &&
                        "border-foreground/12 text-foreground/40",
                    )}
                  >
                    {nivel.estado === "listo" ? (
                      <Check className="size-3" />
                    ) : nivel.estado === "fallo" ? (
                      <AlertCircle className="size-3" />
                    ) : null}
                    {nivel.etiqueta(plataforma)}
                    <span className="font-medium opacity-70">
                      {nivel.estado === "listo"
                        ? "creado"
                        : nivel.estado === "fallo"
                          ? "falló"
                          : "no se llegó"}
                    </span>
                  </span>
                </span>
              ))}
            </div>
            {faltaConjunto && (
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-danger">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                El {nombreDeNivel(plataforma, "conjunto").toLowerCase()} no se
                creó: sin él la campaña no puede entregar nada. Usa &quot;+ Conjunto&quot; sobre la
                campaña, o vuelve a publicar tras borrar la que quedó.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Envoltorio de sección, igual en las tres fases. */
/**
 * Cada sección es su propia tarjeta, colapsable, con el check verde de
 * "resuelta" a la izquierda del título — el mismo patrón visual y de
 * navegación del creador de anuncios de Meta (todas las secciones visibles
 * en un solo scroll, en vez del asistente de pasos que tenía antes esta
 * pantalla). El check es una guía, no un bloqueo: lo calcula cada llamado a
 * `Seccion` con una regla simple sobre `draft`, la publicación real sigue
 * validándose aparte, en el servidor (`validateDraft`).
 */
/**
 * Objetivos tal como los nombra cada plataforma. Cada opción dice a qué objetivo interno corresponde; las que todavía no
 * se pueden crear desde aquí salen bloqueadas con el motivo (no se ocultan, para que se vea qué falta).
 */
const OBJETIVOS_DE_PLATAFORMA: Partial<
  Record<Platform, Array<{ label: string; objetivo: Objective | null; motivo?: string }>>
> = {
  meta: [
    { label: "Reconocimiento", objetivo: "alcance" },
    { label: "Tráfico", objetivo: "trafico" },
    { label: "Interacción", objetivo: "interaccion" },
    { label: "Clientes potenciales", objetivo: "leads" },
    { label: "Ventas", objetivo: "ventas" },
    { label: "Promoción de la aplicación", objetivo: null, motivo: "Necesita una app registrada en Meta (tienda y evento de la app). Todavía no se puede crear desde aquí." },
  ],
  google: [
    { label: "Ventas", objetivo: "ventas" },
    { label: "Oportunidades de venta", objetivo: "leads" },
    { label: "Tráfico al sitio web", objetivo: "trafico" },
    { label: "Notoriedad y consideración", objetivo: "alcance" },
    { label: "Promoción de la aplicación", objetivo: null, motivo: "Las campañas de app necesitan la app en una tienda y su registro de conversiones. Todavía no se pueden crear desde aquí." },
    { label: "Visitas a tiendas locales", objetivo: null, motivo: "Necesita una ficha de Google Business Profile vinculada a la cuenta. Todavía no se puede crear desde aquí." },
  ],
  // Los cinco objetivos de LinkedIn que se comprobaron contra su API (2026-10-07), con los nombres de su interfaz.
  linkedin: [
    { label: "Notoriedad de marca", objetivo: "alcance" },
    { label: "Visitas al sitio web", objetivo: "trafico" },
    { label: "Interacción", objetivo: "interaccion" },
    { label: "Generación de clientes potenciales", objetivo: "leads" },
    { label: "Conversiones en el sitio web", objetivo: "ventas" },
    { label: "Visualizaciones de video", objetivo: null, motivo: "LinkedIn lo ofrece, pero todavía no se puede crear desde aquí." },
  ],
};

function ObjetivosPorPlataforma({
  draft,
  onChange,
}: {
  draft: CampaignDraft;
  onChange: (cambios: Partial<CampaignDraft>) => void;
}) {
  const plataformas = draft.platforms.filter((p) => OBJETIVOS_DE_PLATAFORMA[p]);
  if (plataformas.length === 0) return null;
  const fijar = (plataforma: Platform, objetivo: Objective) => {
    // Con una sola plataforma, el objetivo general es el de esa plataforma.
    if (draft.platforms.length === 1) {
      onChange({ objective: objetivo, objectiveByPlatform: {} });
      return;
    }
    const siguiente = { ...draft.objectiveByPlatform };
    if (objetivo === draft.objective) delete siguiente[plataforma];
    else siguiente[plataforma] = objetivo;
    onChange({ objectiveByPlatform: siguiente });
  };
  return (
    <div className="mt-4 space-y-3">
      <p className="font-micro text-[0.65rem] text-foreground/45">OBJETIVO DE CADA PLATAFORMA</p>
      {plataformas.map((plataforma) => {
        const actual = objetivoDe(draft, plataforma);
        return (
          <div key={plataforma} className="rounded-xl border border-foreground/10 p-3">
            <p className="text-xs font-bold text-foreground">{platformLabel(plataforma)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {OBJETIVOS_DE_PLATAFORMA[plataforma]!.map((opcion) => {
                const activa = opcion.objetivo !== null && opcion.objetivo === actual;
                return (
                  <button
                    key={opcion.label}
                    type="button"
                    disabled={opcion.objetivo === null}
                    title={opcion.motivo}
                    onClick={() => opcion.objetivo && fijar(plataforma, opcion.objetivo)}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      opcion.objetivo === null
                        ? "cursor-not-allowed border-dashed border-foreground/12 text-foreground/30"
                        : activa
                          ? "border-brand bg-brand/12 text-foreground"
                          : "border-foreground/12 text-foreground/55 hover:border-foreground/25",
                    )}
                  >
                    {opcion.objetivo === null && <Lock className="size-3" />}
                    {opcion.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">{OBJECTIVES[actual].description}</p>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Separa, dentro de una parte del formulario, lo que vale para TODAS las
 * plataformas elegidas de lo que existe solo en una (Meta, Google y, más
 * adelante, TikTok o LinkedIn). Primero va siempre lo general.
 */
function EncabezadoDeBloque({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <div className="flex items-baseline gap-2 pt-3">
      <h4 className="font-micro text-[0.65rem] tracking-wide text-foreground/60">{titulo.toUpperCase()}</h4>
      {detalle && <span className="hidden text-[0.68rem] text-foreground/40 sm:inline">{detalle}</span>}
      <span className="h-px flex-1 bg-foreground/10" />
    </div>
  );
}

/** Encabezado de grupo (Campaña / Conjunto de anuncios / Anuncio) sobre sus
 * secciones — separa visualmente los tres bloques dentro del scroll único. */
function GrupoDeSecciones({
  id,
  titulo,
  detalle,
  children,
}: {
  id: string;
  titulo: string;
  detalle: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-4">
      <div className="mb-3">
        <h2 className="text-base font-extrabold text-foreground">{titulo}</h2>
        <p className="text-xs text-foreground/45">{detalle}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/**
 * Selector de plataforma para Conjunto y Anuncio: cuando se publica en varias
 * a la vez, cada una tiene su propio formulario y esto cambia entre uno y
 * otro, en vez de apilarlos con una etiqueta "SOLO X" arriba de cada bloque.
 *
 * Con una sola plataforma elegida no aparece: no hay entre qué elegir.
 */
function SelectorPlataforma({
  plataformas,
  activa,
  onChange,
}: {
  plataformas: Platform[];
  activa: Platform;
  onChange: (value: Platform) => void;
}) {
  if (plataformas.length <= 1) return null;
  return (
    <div className="mb-4 flex gap-1 rounded-full bg-field/40 p-1">
      {plataformas.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
            activa === p
              ? "bg-primary text-primary-foreground"
              : "text-foreground/55 hover:text-foreground",
          )}
        >
          {platformLabel(p)}
        </button>
      ))}
    </div>
  );
}

/** Selector de cuenta cuando el cliente tiene más de una en esa plataforma. */
function SelectorCuenta({
  platform,
  cuentas,
  draft,
  onChange,
}: {
  platform: Platform;
  cuentas: Cuenta[];
  draft: CampaignDraft;
  onChange: (cambios: Partial<CampaignDraft>) => void;
}) {
  const delPlatform = cuentas.filter((c) => c.provider === platform);
  if (delPlatform.length === 0) {
    return (
      <p className="mt-2 text-xs text-warn">
        Este cliente no tiene cuentas de {platformLabel(platform)}.
      </p>
    );
  }
  if (delPlatform.length === 1) {
    return (
      <p className="mt-2 text-xs text-foreground/50">
        Se publica en {delPlatform[0].name} — es la única cuenta de{" "}
        {platformLabel(platform)}.
      </p>
    );
  }
  return (
    <Campo etiqueta={`CUENTA DE ${platformLabel(platform).toUpperCase()}`} className="mt-2">
      <Select
        value={draft.accountByPlatform[platform] ?? ""}
        onValueChange={(value) =>
          onChange({
            accountByPlatform: { ...draft.accountByPlatform, [platform]: value },
          })
        }
      >
        <SelectTrigger className="w-full bg-field/60">
          <SelectValue placeholder={`Elige entre ${delPlatform.length} cuentas`} />
        </SelectTrigger>
        <SelectContent>
          {delPlatform.map((cuenta) => (
            <SelectItem key={cuenta.externalId} value={cuenta.externalId}>
              {cuenta.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Campo>
  );
}

/**
 * Selector de píxel de Meta, solo cuando hace falta: la cuenta elegida tiene
 * más de un píxel (MGC: Converse y Coliseum en la misma cuenta) y el
 * objetivo de verdad necesita uno (leads o ventas con destino sitio web —
 * ver `necesitaPixel` en `lib/constructor.ts`). Con exactamente uno no hay
 * nada que elegir: se usa directo, sin mostrar este selector.
 */
function SelectorPixel({
  cuentas,
  draft,
  onChange,
}: {
  cuentas: Cuenta[];
  draft: CampaignDraft;
  onChange: (cambios: Partial<CampaignDraft>) => void;
}) {
  const necesitaPixel =
    (draft.objective === "leads" || draft.objective === "ventas") &&
    draft.conversionLocation !== "mensajes";
  if (!necesitaPixel) return null;

  const cuentasMeta = cuentas.filter((c) => c.provider === "meta");
  const cuentaMeta =
    cuentasMeta.length === 1
      ? cuentasMeta[0]
      : draft.accountByPlatform.meta
        ? cuentasMeta.find((c) => c.externalId === draft.accountByPlatform.meta)
        : undefined;
  const pixeles = cuentaMeta?.pixels ?? [];
  if (pixeles.length <= 1) return null;

  return (
    <Campo etiqueta="PÍXEL DE META A USAR" className="mt-2">
      <Select
        value={draft.metaPixelId ?? ""}
        onValueChange={(value) => onChange({ metaPixelId: value })}
      >
        <SelectTrigger className="w-full bg-field/60">
          <SelectValue placeholder={`Elige entre ${pixeles.length} píxeles`} />
        </SelectTrigger>
        <SelectContent>
          {pixeles.map((pixel) => (
            <SelectItem key={pixel.id} value={pixel.pixelId}>
              {pixel.label ? `${pixel.label} · ${pixel.pixelId}` : pixel.pixelId}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Campo>
  );
}

function FaseCampana({
  soloGoogle = false,
  draft,
  clientes,
  cargandoClientes,
  cuentas,
  onChange,
  onTogglePlatform,
  onCambiarClienteGlobal,
}: {
  /** Solo Google: aquí van también los ajustes de campaña propios de Google (presupuesto, ubicaciones, tipo, puja, redes…). */
  soloGoogle?: boolean;
  draft: CampaignDraft;
  clientes: Cliente[];
  cargandoClientes: boolean;
  cuentas: Cuenta[];
  onChange: (cambios: Partial<CampaignDraft>) => void;
  onTogglePlatform: (value: Platform) => void;
  onCambiarClienteGlobal?: (portfolioId: string) => void;
}) {
  // Adjuntando a una campaña que ya existe: el cliente, la plataforma, el
  // objetivo y la categoría ya quedaron decididos cuando esa campaña se creó.
  // Pedirlos de nuevo sería fingir una elección que no corresponde acá.
  if (draft.existingCampaign) {
    return (
      <Seccion id="grupo-campana-existente" titulo="Campaña existente" completa>
        <p className="text-sm leading-6 text-foreground/70">
          {platformLabel(draft.existingCampaign.platform)} ·{" "}
          <strong className="text-foreground">
            {draft.existingCampaign.campaignName}
          </strong>
          {draft.existingAdset && (
            <>
              {" "}
              <ChevronRight className="inline size-3 text-foreground/30" />{" "}
              <strong className="text-foreground">
                {draft.existingAdset.adsetName}
              </strong>
            </>
          )}
        </p>
        {/*
          El nombre de lo nuevo se pide en la fase donde realmente se crea
          —Conjunto o Anuncio—, no acá: con una campaña existente, el
          recorrido empieza más adelante y este campo nunca llegaba a verse.
        */}
      </Seccion>
    );
  }

  return (
    <>
      <EncabezadoDeBloque titulo="General" detalle="Vale para todas las plataformas que elijas" />
      <Seccion
        id="grupo-campana-cliente"
        titulo="Cliente y objetivo"
        completa={Boolean(draft.portfolioId) && draft.platforms.length > 0}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="CLIENTE">
            <Select
              value={draft.portfolioId}
              onValueChange={(value) => {
                onChange({ portfolioId: value });
                // Elegir cliente acá también mueve el selector del navbar —
                // una sola selección para toda la app, no una por vista.
                onCambiarClienteGlobal?.(value);
              }}
            >
              <SelectTrigger className="w-full bg-field/60">
                <SelectValue
                  placeholder={cargandoClientes ? "Cargando…" : "Elige un cliente"}
                />
              </SelectTrigger>
              <SelectContent>
                {clientes.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo etiqueta={draft.platforms.length > 1 ? "OBJETIVO GENERAL (PUNTO DE PARTIDA)" : "OBJETIVO"}>
            <Select
              value={draft.objective}
              onValueChange={(value) => onChange({ objective: value as Objective, objectiveByPlatform: {} })}
            >
              <SelectTrigger className="w-full bg-field/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(OBJECTIVES) as Objective[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {OBJECTIVES[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
              {OBJECTIVES[draft.objective].description}
            </p>
          </Campo>
        </div>

        {draft.portfolioId && <PresupuestoEnLinea portfolioId={draft.portfolioId} className="mt-4" />}

        <Campo etiqueta="PLATAFORMAS" className="mt-4">
          <div className="flex flex-wrap gap-2">
            {CONSTRUCTOR_PLATFORMS.map((value) => {
              // Sin cliente elegido todavía no hay nada que evaluar — el
              // bloqueo es sobre las cuentas DE ESE cliente, no una regla
              // general de la plataforma.
              const sinCuenta =
                Boolean(draft.portfolioId) &&
                !cuentas.some((c) => c.provider === value);
              const activa = draft.platforms.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  // Bloquea sumarla si no hay cuenta, pero deja quitarla si
                  // ya estaba activa (por ejemplo, al cambiar de cliente a
                  // uno sin cuenta en esta red) — nunca deja a alguien
                  // atrapado sin poder deshacer su propia elección.
                  disabled={sinCuenta && !activa}
                  onClick={() => onTogglePlatform(value)}
                  title={
                    sinCuenta
                      ? `Este cliente no tiene ninguna cuenta de ${platformLabel(value)} conectada — hay que vincular una primero, en la ficha del cliente.`
                      : undefined
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition-colors",
                    sinCuenta && !activa
                      ? "cursor-not-allowed border-foreground/8 text-foreground/25"
                      : activa
                        ? "border-brand bg-brand/12 text-foreground"
                        : "border-foreground/12 text-foreground/50 hover:border-foreground/25",
                  )}
                >
                  {sinCuenta && !activa && <Lock className="size-3.5" />}
                  {platformLabel(value)}
                </button>
              );
            })}
            {/* Plataformas que se leen pero no se pueden crear desde acá (LinkedIn): visibles y bloqueadas, con el motivo. */}
            {LECTURA_PLATFORMS.filter((value) => !CONSTRUCTOR_PLATFORMS.includes(value)).map((value) => (
              <span
                key={value}
                title={`${platformLabel(value)} se lee en la tabla de Cliente, pero no se pueden crear campañas desde acá: Windsor solo permite pausar, activar, cambiar presupuesto, nombre, fechas y público de las que ya existen.`}
                className="flex cursor-not-allowed items-center gap-1.5 rounded-full border border-dashed border-foreground/12 px-4 py-2 text-sm font-bold text-foreground/30"
              >
                <Lock className="size-3.5" />
                {platformLabel(value)}
                <span className="text-[0.62rem] font-semibold text-foreground/35">solo lectura</span>
              </span>
            ))}
          </div>
          {CONSTRUCTOR_PLATFORMS.some(
            (value) =>
              draft.portfolioId &&
              !cuentas.some((c) => c.provider === value) &&
              !draft.platforms.includes(value),
          ) && (
            <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-foreground/40">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Las plataformas bloqueadas no tienen ninguna cuenta conectada
              para este cliente. Vincúlala primero en la ficha del cliente
              para poder elegirla acá.
            </p>
          )}
        </Campo>

        {draft.portfolioId &&
          draft.platforms.map((platform) => (
            <SelectorCuenta
              key={platform}
              platform={platform}
              cuentas={cuentas}
              draft={draft}
              onChange={onChange}
            />
          ))}
        {draft.portfolioId && draft.platforms.includes("meta") && (
          <SelectorPixel cuentas={cuentas} draft={draft} onChange={onChange} />
        )}
        {draft.platforms.length > 0 && <ObjetivosPorPlataforma draft={draft} onChange={onChange} />}
      </Seccion>

      <Seccion titulo="Nombre" completa={draft.name.trim() !== ""}>
        <Input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Campaña Halloween 2026"
          className="bg-field/60"
        />
        {/*
          Las siglas no se escriben acá: el sistema las antepone al publicar,
          una por plataforma, para que una campaña de Meta nunca pueda salir
          con la sigla de Google ni al revés.
        */}
        <div className="mt-2 space-y-1">
          {draft.platforms.map((platform) => (
            <p
              key={platform}
              className="metric-number text-[0.68rem] text-foreground/45"
            >
              {platformLabel(platform)}:{" "}
              <span className="text-brand">
                {nombreCompuesto(
                  OBJECTIVES[objetivoDe(draft, platform)].sigla,
                  platform,
                  draft.name || "Nombre de la campaña",
                )}
              </span>
            </p>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Detalles (nota interna)" completa>
        <Textarea
          value={draft.details}
          onChange={(e) => onChange({ details: e.target.value })}
          rows={2}
          placeholder="Ej. a quién apunta, contexto de la oferta, algo a tener en cuenta al revisar"
          className="bg-field/60"
        />
        <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
          Solo la ve el equipo acá adentro — no se publica ni se envía a
          ninguna plataforma. Es para dejar contexto, no un campo obligatorio.
        </p>
      </Seccion>

      {draft.platforms.includes("meta") && (
        <>
      <EncabezadoDeBloque titulo="Solo Meta" detalle="Ajustes que existen únicamente en Meta" />
      <Seccion titulo="Categoría" soloPlataforma="meta" completa>
        <Select
          value={draft.specialAdCategory}
          onValueChange={(value) =>
            onChange({ specialAdCategory: value as SpecialAdCategory })
          }
        >
          <SelectTrigger className="w-full bg-field/60 sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SPECIAL_AD_CATEGORIES) as SpecialAdCategory[]).map(
              (key) => (
                <SelectItem key={key} value={key}>
                  {SPECIAL_AD_CATEGORIES[key].label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
          Vivienda, empleo, crédito y temas sociales tienen reglas de
          segmentación distintas en Meta. Google no tiene este concepto.
        </p>
      </Seccion>

      <Seccion titulo="Objetivo de Meta" soloPlataforma="meta" completa>
        <Select
          value={draft.metaObjective ?? "default"}
          onValueChange={(value) =>
            onChange({
              metaObjective: value === "default" ? null : (value as MetaObjectiveOverride),
            })
          }
        >
          <SelectTrigger className="w-full bg-field/60 sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">
              Automático — {OBJECTIVES[objetivoDe(draft, "meta")].label}
            </SelectItem>
            {(Object.keys(META_OBJECTIVE_LABELS) as MetaObjectiveOverride[]).map((key) => (
              <SelectItem key={key} value={key}>
                {META_OBJECTIVE_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
          &quot;Automático&quot; ya traduce el objetivo de arriba a uno de
          estos cinco por su cuenta — acá solo hace falta elegir uno a mano
          si el que corresponde de verdad no es el que esa traducción asume
          (por ejemplo, una campaña de &quot;Tráfico&quot; pensada en
          realidad para Interacción). No cambia nada en Google: ese concepto
          no existe ahí, es puramente de Meta.
        </p>
      </Seccion>
          <LimiteDeGastoMeta draft={draft} onChange={onChange} moneda={monedaDeMeta(draft, cuentas)} />
        </>
      )}
      {draft.platforms.includes("linkedin") && (
        <CampanaDeLinkedin
          draft={draft}
          onChange={onChange}
          moneda={cuentaDeLinkedin(draft, cuentas)?.currency ?? null}
          paginaDeLaCuenta={cuentaDeLinkedin(draft, cuentas)?.pageId ?? null}
        />
      )}
      {soloGoogle && <CampanaDeGoogle draft={draft} cuentas={cuentas} onChange={onChange} />}
    </>
  );
}

/** La cuenta de LinkedIn elegida (o la única que tiene el cliente). */
function cuentaDeLinkedin(draft: CampaignDraft, cuentas: Cuenta[]): Cuenta | null {
  const deLinkedin = cuentas.filter((c) => c.provider === "linkedin");
  const elegida = draft.accountByPlatform.linkedin;
  if (elegida) return deLinkedin.find((c) => c.externalId === elegida) ?? null;
  return deLinkedin.length === 1 ? deLinkedin[0] : null;
}

/** Todo lo que en Google Ads se define en la CAMPAÑA, en el orden en que Google lo muestra. */
function CampanaDeGoogle({ draft, cuentas, onChange }: { draft: CampaignDraft; cuentas: Cuenta[]; onChange: (cambios: Partial<CampaignDraft>) => void }) {
  return (
    <>
      <EncabezadoDeBloque titulo="Ajustes de campaña de Google" detalle="Tipo, presupuesto, puja, redes, ubicaciones e idiomas" />
      <SeccionTipoGoogle draft={draft} onChange={onChange} />
      <SeccionPresupuesto draft={draft} cuentas={cuentas} onChange={onChange} />
      {draft.googleChannel === "search" && draft.googleBusqueda && <CampanaGoogleBusqueda draft={draft} onChange={onChange} moneda={monedaDeGoogle(draft, cuentas)} />}
      <SeccionGeografica draft={draft} onChange={onChange} />
      <SeccionIdiomasGoogle draft={draft} onChange={onChange} />
    </>
  );
}

/** Moneda real de la cuenta de Meta elegida (o la única que tiene el cliente). */
function monedaDeMeta(draft: CampaignDraft, cuentas: Cuenta[]): string | null {
  const deMeta = cuentas.filter((c) => c.provider === "meta");
  const elegida = draft.accountByPlatform.meta ? deMeta.find((c) => c.externalId === draft.accountByPlatform.meta) : deMeta.length === 1 ? deMeta[0] : undefined;
  return elegida?.currency ?? null;
}

/** Moneda real de la cuenta de Google elegida (o la única que tiene el cliente). */
function monedaDeGoogle(draft: CampaignDraft, cuentas: Cuenta[]): string | null {
  const deGoogle = cuentas.filter((c) => c.provider === "google");
  const elegida = draft.accountByPlatform.google ? deGoogle.find((c) => c.externalId === draft.accountByPlatform.google) : deGoogle.length === 1 ? deGoogle[0] : undefined;
  return elegida?.currency ?? null;
}

function FaseConjunto({
  soloGoogle = false,
  sinConversionesMedidas = false,
  draft,
  cuentas,
  onChange,
  plataformasElegidas,
  plataformaActiva,
  onPlataformaActiva,
}: {
  /** Solo Google: esta fase es el GRUPO DE ANUNCIOS de Google (lo de la campaña ya se definió antes). */
  soloGoogle?: boolean;
  /** El cliente no mide conversiones: Google parte con «Maximizar clics», así que el tope de CPC aplica. */
  sinConversionesMedidas?: boolean;
  draft: CampaignDraft;
  cuentas: Cuenta[];
  onChange: (cambios: Partial<CampaignDraft>) => void;
  plataformasElegidas: Platform[];
  plataformaActiva: Platform;
  onPlataformaActiva: (value: Platform) => void;
}) {
  // Añadiendo un anuncio a un conjunto que ya existe: el conjunto ya trae su
  // presupuesto, público y ubicaciones. Nada de esto se crea de nuevo.
  if (draft.existingAdset) {
    return (
      <Seccion titulo="Conjunto de anuncios existente" completa>
        <p className="text-sm leading-6 text-foreground/70">
          El presupuesto, el público y las ubicaciones de{" "}
          <strong className="text-foreground">{draft.existingAdset.adsetName}</strong>{" "}
          ya están definidos. El anuncio se añade directo ahí.
        </p>
      </Seccion>
    );
  }

  if (soloGoogle) {
    return draft.googleChannel === "search" ? (
      <>
        {draft.googleBusqueda && <GrupoGoogleBusqueda draft={draft} onChange={onChange} moneda={monedaDeGoogle(draft, cuentas)} />}
        <SeccionPalabrasGoogle draft={draft} onChange={onChange} />
        <SeccionNegativasGoogle draft={draft} onChange={onChange} />
      </>
    ) : (
      <Seccion titulo="Grupo de anuncios" soloPlataforma="Google" completa>
        <p className="text-sm leading-6 text-foreground/70">
          {draft.googleChannel === "pmax"
            ? "Performance Max no usa grupos de anuncios ni palabras clave: Google arma las combinaciones con el grupo de recursos (textos, imágenes y logo) que defines en el paso Anuncio."
            : "La Red de Display no usa palabras clave en esta creación: el público lo elige Google según el contenido del anuncio. Pasa al paso Anuncio."}
        </p>
      </Seccion>
    );
  }

  const conGoogle = plataformaActiva === "google";
  const conMeta = plataformaActiva === "meta";

  return (
    <>
      <EncabezadoDeBloque titulo="General" detalle="Vale para todas las plataformas que elijas" />
      {draft.existingCampaign && (
        <Seccion titulo="Nombre del conjunto de anuncios" completa={draft.name.trim() !== ""}>
          <Input
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Nombre del conjunto de anuncios"
            className="bg-field/60"
          />
        </Seccion>
      )}

      {/*
        Presupuesto: es lo único de esta fase que de verdad es de la campaña
        entera, no de una plataforma — por eso vive fuera del selector de
        abajo y se ve sin importar cuál pestaña esté activa.
      */}
      <SeccionPresupuesto draft={draft} cuentas={cuentas} onChange={onChange} />

      {/*
        Igual que el presupuesto: la ubicación geográfica es del conjunto
        entero, no de una plataforma — el mismo país o círculo se traduce a
        Meta y a Google en `buildPlan`, así que se ve sin importar cuál
        pestaña esté activa abajo.
      */}
      <SeccionGeografica draft={draft} onChange={onChange} />

      <SelectorPlataforma
        plataformas={plataformasElegidas}
        activa={plataformaActiva}
        onChange={onPlataformaActiva}
      />

      <EncabezadoDeBloque
        titulo={`Solo ${platformLabel(plataformaActiva)}`}
        detalle="Ajustes que existen únicamente en esta plataforma"
      />
      {plataformaActiva === "linkedin" && (
        <NotaDeLinkedin>
          En LinkedIn el presupuesto, el calendario y el país de arriba se aplican a la campaña. La declaración política, la página, la puja y las ubicaciones
          están en la fase Campaña, en «Solo LinkedIn».
        </NotaDeLinkedin>
      )}
      {conMeta && (
        <>
          <Seccion titulo="Conversión" completa>
            <RadioGroup
              value={draft.conversionLocation ?? "sitio_web"}
              onValueChange={(value) =>
                onChange({ conversionLocation: value as "sitio_web" | "mensajes" })
              }
              className="grid-flow-col justify-start gap-6"
            >
              <label className="flex items-center gap-2 text-sm text-foreground/80">
                <RadioGroupItem value="sitio_web" className="border-foreground/30" />
                Sitio web
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground/80">
                <RadioGroupItem value="mensajes" className="border-foreground/30" />
                Mensajes
              </label>
            </RadioGroup>
          </Seccion>

          <Seccion titulo="Público" completa>
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo etiqueta="EDAD MÍNIMA">
                <Input
                  type="number"
                  min={13}
                  max={65}
                  value={draft.ageMin}
                  onChange={(e) => onChange({ ageMin: Number(e.target.value) })}
                  className="bg-field/60"
                />
              </Campo>
              <Campo etiqueta="EDAD MÁXIMA">
                <Input
                  type="number"
                  min={13}
                  max={65}
                  value={draft.ageMax}
                  onChange={(e) => onChange({ ageMax: Number(e.target.value) })}
                  className="bg-field/60"
                />
              </Campo>
              <Campo etiqueta="GÉNERO">
                <Select
                  value={draft.gender}
                  onValueChange={(value) => onChange({ gender: value as Gender })}
                >
                  <SelectTrigger className="w-full bg-field/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="hombres">Hombres</SelectItem>
                    <SelectItem value="mujeres">Mujeres</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>
            </div>
            <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
              Los países de segmentación se definen por cuenta en la ficha del
              cliente, no acá.
            </p>
            <SegmentacionMeta
              portfolioId={draft.portfolioId}
              accountId={
                cuentas.find(
                  (c) =>
                    c.provider === "meta" &&
                    (draft.accountByPlatform.meta
                      ? c.externalId === draft.accountByPlatform.meta
                      : cuentas.filter((x) => x.provider === "meta").length === 1),
                )?.externalId ?? null
              }
              intereses={draft.metaInterests}
              incluidas={draft.metaCustomAudiences}
              excluidas={draft.metaExcludedAudiences}
              onChange={onChange}
            />
          </Seccion>

          <Seccion titulo="Transparencia de anuncios" informativo completa>
            <p className="text-xs leading-5 text-foreground/55">
              Meta publica todo anuncio activo en su Biblioteca de Anuncios de
              forma automática. No es un ajuste que se pueda enviar desde acá.
            </p>
          </Seccion>

          <Seccion titulo="Ubicaciones" completa>
            <p className="text-xs leading-5 text-foreground/55">
              Sin marcar nada acá, Meta reparte el anuncio solo entre
              Facebook, Instagram, Messenger y Audience Network — es la
              ubicación automática de Meta (Advantage+), no que falte
              elegir. Marcá una o más solo si querés limitarlo a esas.
            </p>
            <div className="mt-2 flex flex-wrap gap-4">
              {Object.entries(META_PLACEMENTS).map(([id, label]) => (
                <label
                  key={id}
                  className="flex items-center gap-2 text-sm text-foreground/80"
                >
                  <Checkbox
                    checked={draft.metaPlacements.includes(id)}
                    onCheckedChange={(checked) =>
                      onChange({
                        metaPlacements: checked
                          ? [...draft.metaPlacements, id]
                          : draft.metaPlacements.filter((p) => p !== id),
                      })
                    }
                    className="border-foreground/30"
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-foreground/55">
              Igual con el formato — sin marcar nada, Meta usa Feed,
              Historias y Reels según cuál rinda mejor para cada persona.
            </p>
            <div className="flex flex-wrap gap-4">
              {Object.entries(META_SURFACES).map(([id, item]) => (
                <label
                  key={id}
                  className="flex items-center gap-2 text-sm text-foreground/80"
                >
                  <Checkbox
                    checked={draft.metaSurfaces.includes(id)}
                    onCheckedChange={(checked) =>
                      onChange({
                        metaSurfaces: checked
                          ? [...draft.metaSurfaces, id]
                          : draft.metaSurfaces.filter((p) => p !== id),
                      })
                    }
                    className="border-foreground/30"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </Seccion>

          <OptimizacionMeta draft={draft} onChange={onChange} moneda={monedaDeMeta(draft, cuentas)} />

          <Seccion titulo="Seguridad" informativo completa>
            <Select
              value={draft.brandSafety}
              onValueChange={(value) =>
                onChange({ brandSafety: value as CampaignDraft["brandSafety"] })
              }
            >
              <SelectTrigger className="w-full bg-field/60 sm:w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="estandar">Estándar</SelectItem>
                <SelectItem value="restringido">Restringido</SelectItem>
                <SelectItem value="ampliado">Ampliado</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
              Queda como nota para el equipo: el filtro real se administra en
              la herramienta de Seguridad de Marca de Meta, no al crear el
              conjunto.
            </p>
          </Seccion>
        </>
      )}

      {conGoogle && (
        <SeccionTipoGoogle draft={draft} onChange={onChange} />
      )}

      {conGoogle && draft.googleChannel === "search" && draft.googleBusqueda && (
        <>
          <CampanaGoogleBusqueda draft={draft} onChange={onChange} moneda={monedaDeGoogle(draft, cuentas)} />
          <GrupoGoogleBusqueda draft={draft} onChange={onChange} moneda={monedaDeGoogle(draft, cuentas)} />
        </>
      )}

      {conGoogle && draft.googleChannel === "search" && (
        <SeccionPalabrasGoogle draft={draft} onChange={onChange} />
      )}

      {conGoogle && draft.googleChannel === "search" && (
        <SeccionNegativasGoogle draft={draft} onChange={onChange} />
      )}

      {conGoogle && !(draft.googleChannel === "search" && draft.googleBusqueda) && (OBJECTIVES[objetivoDe(draft, "google")].google !== "maximize_conversions" || sinConversionesMedidas) && (
        <Seccion titulo="Tope de CPC" completa>
          <Input
            type="number"
            inputMode="decimal"
            value={draft.cpcCeiling ?? ""}
            onChange={(e) => onChange({ cpcCeiling: numeroOVacio(e.target.value) })}
            placeholder="Sin tope"
            className="bg-field/60 sm:w-40"
          />
          <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
            Opcional. Con Maximizar clics, Google puede pujar caro por pocos
            clics y agotar el presupuesto del día — esto le pone un techo por
            clic. Vacío deja la puja sin tope, como hasta ahora.
          </p>
        </Seccion>
      )}

      {conGoogle && (
        <SeccionIdiomasGoogle draft={draft} onChange={onChange} />
      )}
    </>
  );
}

function SeccionPresupuesto({ draft, cuentas, onChange }: { draft: CampaignDraft; cuentas: Cuenta[]; onChange: (cambios: Partial<CampaignDraft>) => void }) {
  return (
    <Seccion
  titulo="Presupuesto y calendario"
  completa={draft.dailyBudget !== null || Object.keys(draft.budgetByPlatform).length > 0}
>
  <OpcionesDePresupuesto draft={draft} onChange={onChange} />
  <PresupuestoPorPlataforma draft={draft} cuentas={cuentas} onChange={onChange} />
</Seccion>
  );
}

function SeccionGeografica({ draft, onChange }: { draft: CampaignDraft; onChange: (cambios: Partial<CampaignDraft>) => void }) {
  return (
    <Seccion
  titulo="Segmentación geográfica"
  completa={
    draft.targetCountries.length > 0 ||
    (draft.targetPlaces?.length ?? 0) > 0 ||
    Boolean(draft.geoRadius)
  }
>
  <SegmentacionGeografica
    targetCountries={draft.targetCountries}
    onTargetCountriesChange={(targetCountries) =>
      onChange({ targetCountries })
    }
    targetPlaces={draft.targetPlaces}
    onTargetPlacesChange={(targetPlaces) => onChange({ targetPlaces })}
    geoRadius={draft.geoRadius}
    onGeoRadiusChange={(geoRadius) => onChange({ geoRadius })}
    excludedCountries={draft.excludedCountries}
    onExcludedCountriesChange={(excludedCountries) =>
      onChange({ excludedCountries })
    }
  />
</Seccion>
  );
}

function SeccionTipoGoogle({ draft, onChange }: { draft: CampaignDraft; onChange: (cambios: Partial<CampaignDraft>) => void }) {
  return (
    <Seccion soloPlataforma="Google" titulo="Tipo de campaña" completa>
    <RadioGroup
      value={draft.googleChannel}
      onValueChange={(value) =>
        onChange({ googleChannel: value as GoogleChannel })
      }
      className="grid-flow-col justify-start gap-6"
    >
      <label className="flex items-center gap-2 text-sm text-foreground/80">
        <RadioGroupItem value="search" className="border-foreground/30" />
        Red de búsqueda
      </label>
      <label className="flex items-center gap-2 text-sm text-foreground/80">
        <RadioGroupItem value="display" className="border-foreground/30" />
        Red de Display
      </label>
      <label className="flex items-center gap-2 text-sm text-foreground/80">
        <RadioGroupItem value="pmax" className="border-foreground/30" />
        Performance Max
      </label>
    </RadioGroup>
  </Seccion>
  );
}

function SeccionPalabrasGoogle({ draft, onChange }: { draft: CampaignDraft; onChange: (cambios: Partial<CampaignDraft>) => void }) {
  return (
    <Seccion titulo="Palabras clave" completa={draft.keywords.some((k) => k.trim())}>
    <Textarea
      value={draft.keywords.join("\n")}
      onChange={(e) => onChange({ keywords: e.target.value.split("\n") })}
      rows={4}
      placeholder={'zapatillas running\n"zapatillas running mujer"\n[comprar zapatillas running]'}
      className="bg-field/60 field-sizing-fixed max-h-32 resize-none overflow-y-auto"
    />
    <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
      Una por línea, con la sintaxis de Google Ads: <code>palabra</code>{" "}
      es concordancia amplia, <code>&quot;palabra&quot;</code> de frase,{" "}
      <code>[palabra]</code> exacta. Sin al menos una, el grupo de
      anuncios no tiene qué lo dispare.
    </p>
  </Seccion>
  );
}

function SeccionNegativasGoogle({ draft, onChange }: { draft: CampaignDraft; onChange: (cambios: Partial<CampaignDraft>) => void }) {
  return (
    <Seccion titulo="Palabras clave negativas" completa>
    <Textarea
      value={draft.negativeKeywords.join("\n")}
      onChange={(e) => onChange({ negativeKeywords: e.target.value.split("\n") })}
      rows={3}
      placeholder={"boleta\ntrabajo\nenel"}
      className="bg-field/60 field-sizing-fixed max-h-28 resize-none overflow-y-auto"
    />
    <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
      Opcional, misma sintaxis que las palabras clave de arriba. Van a
      nivel de campaña — evitan que el anuncio salga en búsquedas de
      soporte, empleo o de la competencia que nadie pidió pautar.
    </p>
  </Seccion>
  );
}

function SeccionIdiomasGoogle({ draft, onChange }: { draft: CampaignDraft; onChange: (cambios: Partial<CampaignDraft>) => void }) {
  return (
    <Seccion titulo="Idiomas" completa>
    <div className="flex flex-wrap gap-4">
      {(
        [
          ["es", "Español"],
          ["en", "Inglés"],
          ["pt", "Portugués"],
        ] as const
      ).map(([codigo, etiqueta]) => (
        <label key={codigo} className="flex items-center gap-2 text-sm text-foreground/80">
          <Checkbox
            checked={draft.targetLanguages.includes(codigo)}
            onCheckedChange={(checked) =>
              onChange({
                targetLanguages: checked
                  ? [...draft.targetLanguages, codigo]
                  : draft.targetLanguages.filter((l) => l !== codigo),
              })
            }
            className="border-foreground/30"
          />
          {etiqueta}
        </label>
      ))}
    </div>
    <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
      Vacío es el default real de Google: todos los idiomas. Marcar
      uno o más restringe a esos — útil en Chile porque hay
      navegadores configurados en inglés que igual buscan en español.
    </p>
  </Seccion>
  );
}

/**
 * Cómo se entiende el monto: por día o total de todo el flight, y dónde vive (campaña o conjunto). Vale para todas
 * las plataformas elegidas; cada una lo traduce a lo que su API admite y el plan lo dice en vez de fingir.
 *
 * - Meta: diario o total, en la campaña (Advantage Campaign Budget) o en cada conjunto.
 * - Google: el presupuesto siempre vive en la campaña (un grupo de anuncios no tiene) y por esta vía se crea
 *   diario: un total se reparte en los días que quedan hasta la fecha de término.
 */
function OpcionesDePresupuesto({
  draft,
  onChange,
}: {
  draft: CampaignDraft;
  onChange: (cambios: Partial<CampaignDraft>) => void;
}) {
  const conMeta = draft.platforms.includes("meta");
  const conGoogle = draft.platforms.includes("google");
  const total = draft.budgetMode === "total";
  const hoy = new Date().toISOString().slice(0, 10);
  const dias = total && draft.endDate ? Math.max(0, diasHastaFin(draft.endDate)) : null;
  return (
    <div className="mb-4 space-y-3">
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo etiqueta="TIPO DE PRESUPUESTO">
          <Select value={draft.budgetMode} onValueChange={(value) => onChange({ budgetMode: value as "diaria" | "total" })}>
            <SelectTrigger className="w-full bg-field/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="diaria">Diario (por día)</SelectItem>
              <SelectItem value="total">Total (toda la campaña)</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        {total && (
          <Campo etiqueta="FECHA DE TÉRMINO">
            <Input
              type="date"
              min={hoy}
              value={draft.endDate ?? ""}
              onChange={(e) => onChange({ endDate: e.target.value || null })}
              className="bg-field/60"
            />
          </Campo>
        )}
        {conMeta && !draft.existingCampaign && (
          <Campo etiqueta="NIVEL DEL PRESUPUESTO · META">
            <Select
              value={draft.metaBudgetLevel}
              onValueChange={(value) => onChange({ metaBudgetLevel: value as "campana" | "conjunto" })}
            >
              <SelectTrigger className="w-full bg-field/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="campana">De la campaña</SelectItem>
                <SelectItem value="conjunto">De cada conjunto</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
        )}
      </div>
      <ul className="space-y-1 text-[0.68rem] leading-5 text-foreground/45">
        {conMeta && (
          <li>
            Meta: {total ? "el total se gasta hasta la fecha de término" : "el monto es por día"}; el presupuesto vive en la{" "}
            {draft.metaBudgetLevel === "campana" || draft.existingCampaign ? "campaña, que lo reparte entre sus conjuntos" : "conjunto, cada uno con el suyo"}.
          </li>
        )}
        {conGoogle && (
          <li>
            Google: el presupuesto vive en la campaña (un grupo de anuncios no tiene) y por esta vía se crea por día
            {total && dias !== null && dias > 0 ? `; el total se reparte en ${dias} ${dias === 1 ? "día" : "días"} hasta el ${draft.endDate}` : ""}.
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * Un presupuesto compartido por defecto, o uno distinto por plataforma si se
 * activa. Sin esto, publicar a la vez en dos cuentas de tamaños muy distintos
 * —una que gasta $5.000 al día y otra que gasta $50.000— obligaba a usar el
 * mismo monto en las dos.
 */
function PresupuestoPorPlataforma({
  draft,
  cuentas,
  onChange,
}: {
  draft: CampaignDraft;
  cuentas: Cuenta[];
  onChange: (cambios: Partial<CampaignDraft>) => void;
}) {
  const varias = draft.platforms.length > 1;
  const distinto = Object.keys(draft.budgetByPlatform).length > 0;
  const tipo = draft.budgetMode === "total" ? "PRESUPUESTO TOTAL" : "PRESUPUESTO DIARIO";

  // Misma cuenta que ya resuelven FaseAnuncio y VistaPrevia: la elegida a
  // mano, o la única que tiene esa plataforma si no hay más que una — nunca
  // se infiere del país, siempre es la moneda real de la cuenta.
  function monedaDe(platform: Platform): string | null {
    const cuenta = cuentas.find(
      (c) =>
        c.provider === platform &&
        (draft.accountByPlatform[platform]
          ? c.externalId === draft.accountByPlatform[platform]
          : cuentas.filter((x) => x.provider === platform).length === 1),
    );
    return cuenta?.currency ?? null;
  }

  if (!varias) {
    return (
      <Campo etiqueta={tipo} className="sm:w-60">
        <CampoDinero
          value={draft.dailyBudget}
          moneda={monedaDe(draft.platforms[0])}
          onChange={(valor) => onChange({ dailyBudget: valor })}
        />
      </Campo>
    );
  }

  const monedasCompartido = new Set(draft.platforms.map(monedaDe).filter(Boolean));
  const monedaCompartida = monedasCompartido.size === 1 ? [...monedasCompartido][0] : null;

  return (
    <div>
      {!distinto ? (
        <>
          <Campo etiqueta={`${tipo} · TODAS LAS PLATAFORMAS`} className="sm:w-72">
            <CampoDinero
              value={draft.dailyBudget}
              moneda={monedaCompartida}
              onChange={(valor) => onChange({ dailyBudget: valor })}
            />
          </Campo>
          {monedasCompartido.size > 1 && (
            <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-warn">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Las cuentas elegidas usan monedas distintas ({[...monedasCompartido].join(" y ")}) —
              usa &ldquo;presupuesto distinto por plataforma&rdquo; para no cargar el mismo número en dos monedas.
            </p>
          )}
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {draft.platforms.map((platform) => (
            <Campo key={platform} etiqueta={`${tipo} · ${platformLabel(platform).toUpperCase()}`}>
              <CampoDinero
                value={draft.budgetByPlatform[platform] ?? null}
                moneda={monedaDe(platform)}
                onChange={(valor) =>
                  onChange({
                    budgetByPlatform: {
                      ...draft.budgetByPlatform,
                      [platform]: valor ?? undefined,
                    },
                  })
                }
              />
            </Campo>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() =>
          onChange({
            budgetByPlatform: distinto
              ? {}
              : Object.fromEntries(
                  draft.platforms.map((p) => [p, draft.dailyBudget ?? 0]),
                ),
          })
        }
        className="mt-2 text-[0.68rem] font-bold text-brand hover:underline"
      >
        {distinto
          ? "Usar el mismo presupuesto para todas"
          : "Usar un presupuesto distinto por plataforma"}
      </button>
    </div>
  );
}

function FaseAnuncio({
  draft,
  cuentas,
  onChange,
  plataformasElegidas,
  plataformaActiva,
  onPlataformaActiva,
}: {
  draft: CampaignDraft;
  cuentas: Cuenta[];
  onChange: (cambios: Partial<CampaignDraft>) => void;
  plataformasElegidas: Platform[];
  plataformaActiva: Platform;
  onPlataformaActiva: (value: Platform) => void;
}) {
  const conMeta = plataformaActiva === "meta";
  const conGoogle = plataformaActiva === "google";
  const cuentaMeta = cuentas.find(
    (c) =>
      c.provider === "meta" &&
      (draft.accountByPlatform.meta
        ? c.externalId === draft.accountByPlatform.meta
        : cuentas.filter((x) => x.provider === "meta").length === 1),
  );
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [selectorAnunciosAbierto, setSelectorAnunciosAbierto] = useState(false);

  return (
    <>
      <EncabezadoDeBloque titulo="General" detalle="Vale para todas las plataformas que elijas" />
      {draft.existingAdset && (
        <Seccion titulo="Nombre del anuncio" completa={draft.name.trim() !== ""}>
          <Input
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Nombre del anuncio"
            className="bg-field/60"
          />
        </Seccion>
      )}

      {/* Destino: la misma URL alimenta el `final_url` de Google y el `link` de Meta. */}
      <Seccion titulo="Destino" completa={draft.landingUrl.trim() !== ""}>
        <Campo etiqueta="URL DE DESTINO" className="sm:w-96">
          <Input
            value={draft.landingUrl}
            onChange={(e) => onChange({ landingUrl: e.target.value })}
            placeholder="https://"
            className="bg-field/60"
          />
        </Campo>
      </Seccion>

      <SelectorPlataforma
        plataformas={plataformasElegidas}
        activa={plataformaActiva}
        onChange={onPlataformaActiva}
      />

      <EncabezadoDeBloque
        titulo={`Solo ${platformLabel(plataformaActiva)}`}
        detalle="Ajustes que existen únicamente en esta plataforma"
      />
      {plataformaActiva === "linkedin" && (
        <NotaDeLinkedin>
          El anuncio de LinkedIn todavía no se crea desde aquí: necesita una publicación de la página de empresa y un rol de publicador sobre ella. Al publicar, se crea el
          grupo de campañas y la campaña en BORRADOR (no sirven ni gastan) y queda esperando su anuncio.
        </NotaDeLinkedin>
      )}
      {conMeta && (
        <>
          <Seccion titulo="Identidad" completa>
            {cuentaMeta ? (
              cuentaMeta.pageId ? (
                <IdentidadMeta
                  portfolioId={draft.portfolioId}
                  accountId={cuentaMeta.externalId}
                  pageId={cuentaMeta.pageId}
                />
              ) : (
                <p className="text-sm text-foreground/75">
                  Publica desde {cuentaMeta.name}.
                </p>
              )
            ) : (
              <SelectorCuenta
                platform="meta"
                cuentas={cuentas}
                draft={draft}
                onChange={onChange}
              />
            )}
          </Seccion>

          <Seccion titulo="Configuración del anuncio" completa>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="FORMATO">
                <Select
                  value={draft.mediaType}
                  onValueChange={(value) =>
                    onChange({ mediaType: value as "none" | "image" | "video" })
                  }
                >
                  <SelectTrigger className="w-full bg-field/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin pieza</SelectItem>
                    <SelectItem value="image">Imagen</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>
              <Campo etiqueta="BOTÓN">
                <Select
                  value={draft.callToAction}
                  onValueChange={(value) =>
                    onChange({ callToAction: value as CallToAction })
                  }
                >
                  <SelectTrigger className="w-full bg-field/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Más usados</SelectLabel>
                      {CTA_COMUNES.map((key) => (
                        <SelectItem key={key} value={key}>
                          {CALL_TO_ACTIONS[key]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Todos los demás</SelectLabel>
                      {CTA_CODIGOS.filter((key) => !(CTA_COMUNES as readonly string[]).includes(key)).map((key) => (
                        <SelectItem key={key} value={key}>
                          {CALL_TO_ACTIONS[key]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Campo>
            </div>
          </Seccion>

          <Seccion
            titulo="Contenido del anuncio"
            completa={
              draft.message.trim() !== "" &&
              (draft.mediaType === "none" || draft.mediaUrl.trim() !== "")
            }
          >
            <Campo etiqueta="TEXTO PRINCIPAL">
              <Textarea
                value={draft.message}
                onChange={(e) => onChange({ message: e.target.value })}
                rows={3}
                className="bg-field/60"
              />
            </Campo>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="TÍTULO (OPCIONAL)">
                <Input
                  value={draft.metaHeadline}
                  onChange={(e) => onChange({ metaHeadline: e.target.value })}
                  placeholder="La línea en negrita bajo la imagen"
                  className="bg-field/60"
                />
              </Campo>
              <Campo etiqueta="DESCRIPCIÓN (OPCIONAL)">
                <Input
                  value={draft.metaDescription}
                  onChange={(e) => onChange({ metaDescription: e.target.value })}
                  placeholder="La línea chica bajo el título"
                  className="bg-field/60"
                />
              </Campo>
            </div>
            <CopilotoDeCreativos
              plataforma="meta"
              portfolioId={draft.portfolioId}
              objetivoLabel={OBJECTIVES[objetivoDe(draft, "meta")].label}
              nombreCampana={draft.name}
              notaInterna={draft.details}
              landingUrl={draft.landingUrl}
              actual={{
                textoPrincipal: draft.message,
                titulo: draft.metaHeadline,
                descripcion: draft.metaDescription,
              }}
              onAplicar={onChange}
            />
            {draft.mediaType !== "none" && (
              <Campo etiqueta="URL PÚBLICA DE LA PIEZA" className="mt-3">
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={draft.mediaUrl}
                    onChange={(e) =>
                      // Escribir la URL a mano reemplaza la pieza: ya no es
                      // la publicación elegida, así que deja de boostearse.
                      onChange({ mediaUrl: e.target.value, boostPostId: null })
                    }
                    placeholder="https://"
                    className="min-w-0 flex-1 bg-field/60"
                  />
                  <SubidaDeArchivo
                    portfolioId={draft.portfolioId}
                    onSubido={(url, tipo) =>
                      onChange({ mediaUrl: url, mediaType: tipo, boostPostId: null })
                    }
                  />
                  {cuentaMeta && draft.portfolioId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectorAbierto(true)}
                      className="shrink-0 border-foreground/15 bg-card/60"
                    >
                      <Images className="size-4" />
                      Boostear publicación de la red
                    </Button>
                  )}
                  {cuentaMeta && draft.portfolioId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectorAnunciosAbierto(true)}
                      className="shrink-0 border-foreground/15 bg-card/60"
                    >
                      <Flame className="size-4" />
                      Reutilizar un anuncio de campaña
                    </Button>
                  )}
                </div>
                {draft.boostPostId ? (
                  <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-ok">
                    <Flame className="mt-0.5 size-3.5 shrink-0" />
                    Este anuncio va a boostear esa publicación real — conserva
                    sus likes, comentarios y compartidos actuales, en vez de
                    crear una pieza nueva desde cero.
                  </p>
                ) : (
                  <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-foreground/45">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    Meta va a buscar el archivo en esta dirección. Si el sitio
                    todavía no está publicado en un dominio real, un archivo
                    recién subido no será alcanzable para Meta ni para Google —
                    solo se verá en esta vista previa.
                  </p>
                )}
                {draft.mediaType === "image" && draft.mediaUrl && (
                  <GeneradorDeVariantes
                    portfolioId={draft.portfolioId}
                    mediaUrl={draft.mediaUrl}
                    onUsar={(url) => onChange({ mediaUrl: url, boostPostId: null })}
                  />
                )}
              </Campo>
            )}
          </Seccion>

          {cuentaMeta && draft.portfolioId && (
            <SelectorDeAnuncios
              open={selectorAnunciosAbierto}
              onOpenChange={setSelectorAnunciosAbierto}
              portfolioId={draft.portfolioId}
              accountId={cuentaMeta.externalId}
              nombreCuenta={cuentaMeta.name}
              onSeleccionar={(anuncio) => {
                onChange({
                  mediaUrl: anuncio.miniatura ?? draft.mediaUrl,
                  mediaType: anuncio.miniatura ? "image" : draft.mediaType,
                  message: draft.message.trim() ? draft.message : (anuncio.texto ?? draft.message),
                  // El id de la publicación del anuncio, en el formato que pide
                  // `boost_post`. Si se está dentro de una campaña o conjunto ya
                  // existente, el servidor confirma con datos reales que lo admita.
                  boostPostId: anuncio.postId,
                });
                setSelectorAnunciosAbierto(false);
              }}
            />
          )}

          {cuentaMeta && draft.portfolioId && (
            <SelectorDePublicaciones
              open={selectorAbierto}
              onOpenChange={setSelectorAbierto}
              portfolioId={draft.portfolioId}
              accountId={cuentaMeta.externalId}
              nombreCuenta={cuentaMeta.name}
              onSeleccionar={(post) => {
                onChange({
                  mediaUrl: post.mediaUrl,
                  mediaType:
                    post.format === "video" || post.format === "reel"
                      ? "video"
                      : "image",
                  message: draft.message.trim() ? draft.message : (post.caption ?? draft.message),
                  // Solo Facebook: es el único donde Windsor confirma que el
                  // id de la publicación viene en el formato que boost_post
                  // exige (`{page_id}_{post_id}`). Con esto puesto, el plan
                  // impulsa la publicación real —conserva sus likes,
                  // comentarios y compartidos— en vez de armar un anuncio
                  // nuevo con la imagen como pieza. Instagram sigue el
                  // camino de siempre hasta confirmar su formato de id.
                  boostPostId: post.platform === "facebook" ? post.id : null,
                });
                setSelectorAbierto(false);
              }}
            />
          )}
        </>
      )}

      {conGoogle && (
        <>
          <Seccion titulo="Identidad" completa>
            <p className="text-sm text-foreground/75">
              Google no tiene un concepto de identidad: publica desde la
              cuenta elegida en el paso de Campaña.
            </p>
          </Seccion>

          <Seccion
            titulo="Contenido del anuncio"
            completa={
              draft.headlines.filter((h) => h.trim()).length >= 3 &&
              draft.descriptions.filter((d) => d.trim()).length >= 2
            }
          >
            <Campo etiqueta={draft.googleChannel === "display" ? "TÍTULOS CORTOS · UNO POR LÍNEA, 1 A 5, MÁX 30 CARACTERES" : "TÍTULOS · UNO POR LÍNEA, 3 A 15, MÁX 30 CARACTERES"}>
              <Textarea
                value={draft.headlines.join("\n")}
                onChange={(e) =>
                  // Sin filtrar acá: filtrar la línea vacía que deja un Enter
                  // recién apretado hacía que ese salto de línea desapareciera
                  // al instante, y tipear Enter dejaba de funcionar. Lo vacío
                  // se descarta recién al usar la lista (Contador, buildPlan).
                  onChange({ headlines: e.target.value.split("\n") })
                }
                rows={4}
                placeholder={"Envío gratis en 24 horas\nCompra directa\nGarantía de un año"}
                className="bg-field/60 field-sizing-fixed max-h-32 resize-none overflow-y-auto"
              />
              <Contador lineas={draft.headlines} limite={30} minimo={draft.googleChannel === "display" ? 1 : 3} maximo={draft.googleChannel === "display" ? 5 : 15} />
            </Campo>
            <Campo etiqueta={draft.googleChannel === "display" ? "DESCRIPCIONES · 1 A 5, MÁX 90 CARACTERES" : "DESCRIPCIONES · 2 A 4, MÁX 90 CARACTERES"} className="mt-3">
              <Textarea
                value={draft.descriptions.join("\n")}
                onChange={(e) =>
                  onChange({ descriptions: e.target.value.split("\n") })
                }
                rows={3}
                className="bg-field/60 field-sizing-fixed max-h-28 resize-none overflow-y-auto"
              />
              <Contador lineas={draft.descriptions} limite={90} minimo={draft.googleChannel === "display" ? 1 : 2} maximo={draft.googleChannel === "display" ? 5 : 4} />
            </Campo>
            {(draft.googleChannel === "display" || draft.googleChannel === "pmax") && (
              <BloqueDisplay draft={draft} onChange={onChange} />
            )}
            <CopilotoDeCreativos
              plataforma="google"
              portfolioId={draft.portfolioId}
              objetivoLabel={OBJECTIVES[objetivoDe(draft, "google")].label}
              nombreCampana={draft.name}
              notaInterna={draft.details}
              landingUrl={draft.landingUrl}
              actual={{ titulos: draft.headlines, descripciones: draft.descriptions }}
              onAplicar={onChange}
            />
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="RUTA 1 (OPCIONAL) · MÁX 15 CARACTERES">
                <Input
                  value={draft.pathDisplay1}
                  onChange={(e) =>
                    onChange({ pathDisplay1: e.target.value.slice(0, 15) })
                  }
                  placeholder="servicios"
                  className="bg-field/60"
                />
              </Campo>
              <Campo etiqueta="RUTA 2 (OPCIONAL) · MÁX 15 CARACTERES">
                <Input
                  value={draft.pathDisplay2}
                  onChange={(e) =>
                    onChange({ pathDisplay2: e.target.value.slice(0, 15) })
                  }
                  placeholder="contacto"
                  className="bg-field/60"
                  disabled={!draft.pathDisplay1.trim()}
                />
              </Campo>
            </div>
            <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
              Se ven pegadas al dominio en el anuncio: {dominioDe(draft.landingUrl)}
              {draft.pathDisplay1.trim() ? ` › ${draft.pathDisplay1.trim()}` : ""}
              {draft.pathDisplay2.trim() ? ` › ${draft.pathDisplay2.trim()}` : ""}
            </p>
          </Seccion>
          {draft.googleChannel === "search" && draft.googleBusqueda && <RecursosGoogleBusqueda draft={draft} onChange={onChange} />}
        </>
      )}
    </>
  );
}

/**
 * Sube un archivo real a R2 y deja lista su URL pública.
 *
 * La condición real está en el aviso de arriba, no acá: esta ruta sirve el
 * archivo desde `/api/media/...`, y esa dirección solo es alcanzable para
 * Google o Meta si el sitio está publicado en un dominio real — en
 * `localhost` sirve para previsualizar, no para publicar de verdad.
 */
/**
 * El nombre real de la página de Facebook (y de la cuenta de Instagram, si
 * el cliente tiene una) detrás del `pageId` numérico — en vez de mostrar
 * solo el id crudo. Reutiliza `/api/creatividades`: ya resuelve pageId e
 * instagramId del lado del servidor y ahora también trae el nombre
 * (`fetchIdentidadMeta`, cacheado 7 días — un nombre de página no cambia
 * casi nunca). Sin nombre encontrado (cuenta sin ninguna publicación
 * orgánica todavía), se cae de vuelta al id crudo — nunca se inventa uno.
 */
function IdentidadMeta({
  portfolioId,
  accountId,
  pageId,
}: {
  portfolioId: string;
  accountId: string;
  pageId: string;
}) {
  const [identidad, setIdentidad] = useState<{
    pageName: string | null;
    instagramName: string | null;
    instagramUsername: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelado = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- vuelve a resolver al cambiar de cuenta
    setIdentidad(null);
    const params = new URLSearchParams({ portfolioId, accountId });
    fetch(`/api/creatividades?${params}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body: { identidad?: typeof identidad }) => {
        if (!cancelado) setIdentidad(body.identidad ?? null);
      })
      .catch(() => {
        // Sin nombre, queda el id crudo — no es un dato crítico para publicar.
      });
    return () => {
      cancelado = true;
    };
  }, [portfolioId, accountId]);

  const partes: string[] = [];
  if (identidad?.pageName) partes.push(`la página ${identidad.pageName}`);
  else partes.push(`la página ${pageId}`);
  if (identidad?.instagramUsername) partes.push(`@${identidad.instagramUsername} en Instagram`);

  return (
    <p className="text-sm text-foreground/75">
      Publica como {partes.join(" y ")}.
    </p>
  );
}

/**
 * Lo que un anuncio de Display responsivo necesita además de títulos y descripciones: título largo, nombre del
 * negocio y las imágenes (horizontal 1,91:1 y cuadrada 1:1 obligatorias; logo opcional). Se crea con la API de
 * Google Ads; las imágenes deben estar en una dirección pública https y se revisan (tamaño y proporción) al
 * simular, antes de publicar.
 */
function BloqueDisplay({
  draft,
  onChange,
}: {
  draft: CampaignDraft;
  onChange: (cambios: Partial<CampaignDraft>) => void;
}) {
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3">
      <p className="text-xs font-semibold text-foreground/80">
        {draft.googleChannel === "pmax" ? "Performance Max (grupo de recursos)" : "Anuncio de Display (con imagen)"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="TÍTULO LARGO · MÁX 90 CARACTERES">
          <Input
            value={draft.displayLongHeadline}
            maxLength={90}
            onChange={(e) => onChange({ displayLongHeadline: e.target.value })}
            className="bg-field/60"
          />
        </Campo>
        <Campo etiqueta="NOMBRE DEL NEGOCIO · MÁX 25 CARACTERES">
          <Input
            value={draft.displayBusinessName}
            maxLength={25}
            onChange={(e) => onChange({ displayBusinessName: e.target.value })}
            className="bg-field/60"
          />
        </Campo>
      </div>
      <Campo etiqueta="IMAGEN HORIZONTAL 1,91:1 (EJ. 1200×628) · OBLIGATORIA">
        <div className="flex flex-wrap gap-2">
          <Input
            value={draft.mediaUrl}
            placeholder="https://"
            onChange={(e) => onChange({ mediaUrl: e.target.value, mediaType: e.target.value.trim() ? "image" : "none", boostPostId: null })}
            className="min-w-0 flex-1 bg-field/60"
          />
          <SubidaDeArchivo portfolioId={draft.portfolioId} onSubido={(url) => onChange({ mediaUrl: url, mediaType: "image", boostPostId: null })} />
        </div>
      </Campo>
      <Campo etiqueta="IMAGEN CUADRADA 1:1 (EJ. 1200×1200) · OBLIGATORIA">
        <div className="flex flex-wrap gap-2">
          <Input
            value={draft.displaySquareUrl}
            placeholder="https://"
            onChange={(e) => onChange({ displaySquareUrl: e.target.value })}
            className="min-w-0 flex-1 bg-field/60"
          />
          <SubidaDeArchivo portfolioId={draft.portfolioId} onSubido={(url) => onChange({ displaySquareUrl: url })} />
        </div>
      </Campo>
      <Campo etiqueta={draft.googleChannel === "pmax" ? "LOGO 1:1 (OBLIGATORIO, MÍN 128×128)" : "LOGO 1:1 (OPCIONAL, MÍN 128×128)"}>
        <div className="flex flex-wrap gap-2">
          <Input
            value={draft.displayLogoUrl}
            placeholder="https://"
            onChange={(e) => onChange({ displayLogoUrl: e.target.value })}
            className="min-w-0 flex-1 bg-field/60"
          />
          <SubidaDeArchivo portfolioId={draft.portfolioId} onSubido={(url) => onChange({ displayLogoUrl: url })} />
        </div>
      </Campo>
      <p className="text-[0.68rem] leading-5 text-foreground/45">
        PNG o JPEG de hasta 5 MB, en una dirección pública https (Google las descarga desde ahí). Si la proporción o el tamaño no
        cumplen, el plan lo avisa antes de publicar. El anuncio queda activo.
      </p>
    </div>
  );
}

function SubidaDeArchivo({
  portfolioId,
  onSubido,
}: {
  portfolioId: string;
  onSubido: (url: string, tipo: "image" | "video") => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subir(archivo: File) {
    setSubiendo(true);
    setError(null);
    try {
      const response = await fetch("/api/creatividades/subir", {
        method: "POST",
        headers: {
          "content-type": archivo.type,
          "x-portfolio-id": encodeURIComponent(portfolioId),
        },
        body: archivo,
      });
      // Un rechazo de más abajo (límite del servidor, proxy) puede volver como
      // texto plano, no JSON: se lee como texto para no mostrar un error de
      // parseo en vez del motivo real.
      const texto = await response.text();
      let body: { url?: string; error?: string } = {};
      try {
        body = JSON.parse(texto) as typeof body;
      } catch {
        body = {
          error:
            response.status === 413
              ? "El archivo pesa demasiado para subirlo. Prueba con uno más liviano o pega su URL."
              : `El servidor rechazó el archivo (${response.status}).`,
        };
      }
      if (!response.ok || !body.url) {
        throw new Error(body.error ?? "No se pudo subir el archivo");
      }
      onSubido(body.url, archivo.type.startsWith("video/") ? "video" : "image");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "No se pudo subir el archivo");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
        className="hidden"
        onChange={(event) => {
          const archivo = event.target.files?.[0];
          event.target.value = "";
          if (archivo) void subir(archivo);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={subiendo || !portfolioId}
        onClick={() => inputRef.current?.click()}
        className="shrink-0 border-foreground/15 bg-card/60"
      >
        {subiendo ? (
          <OrbeDeBoton />
        ) : (
          <Upload className="size-4" />
        )}
        Subir archivo
      </Button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </>
  );
}

/** Vista previa liviana, para orientarse mientras se completa el formulario. */
/** El dominio limpio de una URL, para las migas de Google y el pie de Meta. */
function dominioDe(url: string): string {
  const limpio = url.trim();
  if (!limpio) return "tusitio.com";
  try {
    const conEsquema = /^https?:\/\//i.test(limpio) ? limpio : "https://" + limpio;
    return new URL(conEsquema).hostname;
  } catch {
    return limpio;
  }
}

/**
 * Imagen real si la URL carga, un aviso claro si no.
 *
 * La pieza de Meta tiene que vivir en una URL pública — Meta la va a buscar
 * ahí, igual que hace esta vista previa. Si la URL está rota, es mejor
 * mostrarlo acá, antes de publicar, que descubrirlo cuando Meta la rechace.
 */
function ImagenDeLaPieza({ url, alto = "aspect-[1.91/1] w-full" }: { url: string; alto?: string }) {
  // Sin efecto: si la URL cambió desde el render anterior, el estado se
  // ajusta acá mismo (React lo soporta y lo prefiere para esto) en vez de
  // confirmar un render con el estado viejo y recién corregirlo un instante
  // después en un efecto.
  const [urlAnterior, setUrlAnterior] = useState(url);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">(
    url.trim() ? "cargando" : "error",
  );
  if (url !== urlAnterior) {
    setUrlAnterior(url);
    setEstado(url.trim() ? "cargando" : "error");
  }

  if (estado === "error") {
    return (
      <div
        className={cn(
          "wa-m-media flex flex-col items-center justify-center gap-1.5 px-4 text-center text-[0.68rem] opacity-80",
          alto,
        )}
      >
        <ImageOff className="size-5 opacity-60" />
        {url.trim()
          ? "No se pudo cargar la imagen desde esa URL"
          : "Aquí irá la imagen del anuncio"}
      </div>
    );
  }
  return (
    <div className={cn("wa-m-media relative overflow-hidden", alto)}>
      {estado === "cargando" && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-[0.68rem]">
          <ThinkingOrb size="sm" state="thinking" label="" />
          Cargando imagen…
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- vista previa de una URL externa arbitraria */}
      <img
        src={url}
        alt="Pieza del anuncio"
        className={cn("absolute inset-0 size-full object-cover", estado !== "ok" && "invisible")}
        onLoad={() => setEstado("ok")}
        onError={() => setEstado("error")}
      />
    </div>
  );
}

/** Una vista previa posible: qué red, con qué presentación. */
type VarianteVista = {
  id: string;
  plataforma: "google" | "meta";
  etiqueta: string;
};

/**
 * Todas las vistas que de verdad aplican al borrador actual — ninguna se
 * inventa. Google solo aporta Búsqueda (lo único que Windsor puede crear
 * hoy); Meta aporta Feed e Historias por cada red elegida en "Ubicaciones".
 * "Vacío es automáticas" ahí significa Facebook e Instagram, así que sin
 * nada marcado se muestran las dos.
 */
function listaDeVistas(draft: CampaignDraft): VarianteVista[] {
  const vistas: VarianteVista[] = [];
  if (draft.platforms.includes("google")) {
    vistas.push({
      id: "google:busqueda",
      plataforma: "google",
      etiqueta: "Google · Búsqueda",
    });
  }
  if (draft.platforms.includes("meta")) {
    const elegidas = draft.metaPlacements.filter(
      (p): p is "facebook" | "instagram" => p === "facebook" || p === "instagram",
    );
    const redes = elegidas.length > 0 ? elegidas : (["facebook", "instagram"] as const);
    for (const red of redes) {
      const nombre = red === "facebook" ? "Facebook" : "Instagram";
      vistas.push({
        id: `meta:feed:${red}`,
        plataforma: "meta",
        etiqueta: `Meta · Feed de ${nombre}`,
      });
      vistas.push({
        id: `meta:historia:${red}`,
        plataforma: "meta",
        etiqueta: `Meta · Historias de ${nombre}`,
      });
    }
  }
  return vistas;
}

/**
 * Vista previa fiel a cómo se ve cada plataforma, no un recuadro genérico.
 *
 * El objetivo es que quien revisa el plan reconozca el anuncio de un vistazo
 * —tipografía y colores del buscador de Google, tarjeta de feed de Meta— en
 * vez de tener que imaginárselo a partir de campos sueltos. Por eso las
 * tarjetas van en claro: son el fondo real de cada plataforma, no el tema
 * oscuro del resto del sistema.
 */
function TarjetaDeVista({
  id,
  draft,
  cuentaMeta,
}: {
  id: string;
  draft: CampaignDraft;
  cuentaMeta: Cuenta | undefined;
}) {
  const [plataforma, formato] = id.split(":");

  if (plataforma === "google") {
    // Google combina los títulos que entran en el espacio disponible; acá se
    // muestran los dos primeros unidos con " | ", que es lo que se ve la
    // mayoría de las veces en un resultado real.
    const titulosGoogle = draft.headlines.filter((t) => t.trim()).slice(0, 2);
    const tituloGoogle = titulosGoogle.length
      ? titulosGoogle.join(" | ")
      : "Título del anuncio";
    const descripcionGoogle = draft.descriptions.find((d) => d.trim()) ?? "";
    // La URL visible real es dominio + rutas, no solo el dominio.
    const urlVisibleGoogle = [
      dominioDe(draft.landingUrl),
      draft.pathDisplay1.trim(),
      draft.pathDisplay2.trim(),
    ]
      .filter(Boolean)
      .join(" › ");

    // Colores propios de Google, no de Neo — ver `wa-preview-google` en
    // globals.css. Cambia de claro a oscuro con el interruptor de arriba,
    // pero siguiendo el modo oscuro real de Google, no el de WiWO.ADS.
    return (
      <div className="wa-preview-google mx-auto w-full max-w-[420px] rounded-xl p-3.5 font-sans">
        <div className="wa-g-domain flex items-center gap-1.5 text-[0.72rem]">
          <span className="wa-g-label rounded-[3px] border px-1 text-[0.6rem] font-bold">
            Anuncio
          </span>
          {/* Dominio + rutas, tal como se ven pegadas en un resultado real. */}
          <span className="truncate">{urlVisibleGoogle}</span>
        </div>
        <p className="wa-g-title mt-0.5 truncate text-[1.05rem] leading-snug">
          {tituloGoogle}
        </p>
        <p className="wa-g-desc mt-0.5 line-clamp-2 text-[0.8rem] leading-5">
          {descripcionGoogle || "La descripción aparecerá acá."}
        </p>
      </div>
    );
  }

  // Meta: Feed e Historias comparten cuenta, texto y pieza — solo cambia
  // cómo se enmarcan, igual que en la plataforma real.
  const dominio = dominioDe(draft.landingUrl);
  const nombreCuenta = cuentaMeta?.name ?? "Elige la cuenta en el paso de Campaña";
  const inicial = (cuentaMeta?.name ?? "?").charAt(0).toUpperCase();

  if (formato === "historia") {
    return (
      <div className="wa-preview-meta relative mx-auto aspect-[9/16] w-full max-w-[230px] overflow-hidden rounded-xl font-sans">
        {draft.mediaType === "video" ? (
          <div className="wa-m-media flex h-full items-center justify-center px-3 text-center text-[0.68rem]">
            Vista previa de video no disponible acá — se revisa en la plataforma
          </div>
        ) : (
          <ImagenDeLaPieza url={draft.mediaUrl} alto="h-full w-full" />
        )}
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/65 to-transparent p-3">
          <div className="wa-m-avatar grid size-7 shrink-0 place-items-center rounded-full text-[0.65rem] font-bold ring-2 ring-white/70">
            {inicial}
          </div>
          <p className="truncate text-[0.75rem] font-semibold text-white">
            {nombreCuenta}
          </p>
        </div>
        <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/75 to-transparent p-3">
          <p className="line-clamp-2 text-[0.78rem] leading-5 text-white/95">
            {draft.message || "El texto principal aparecerá acá."}
          </p>
          <span className="inline-flex w-full items-center justify-center rounded-md bg-white/95 px-3 py-1.5 text-[0.72rem] font-bold text-[#050505]">
            {CALL_TO_ACTIONS[draft.callToAction]}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="wa-preview-meta mx-auto w-full max-w-[360px] overflow-hidden rounded-xl font-sans">
      <div className="flex items-center gap-2 p-3">
        <div className="wa-m-avatar grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold">
          {inicial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8rem] font-semibold">{nombreCuenta}</p>
          <p className="wa-m-sub text-[0.68rem]">Patrocinado</p>
        </div>
      </div>
      <div className="px-3 pb-2">
        <p className="line-clamp-3 text-[0.82rem] leading-5 whitespace-pre-line">
          {draft.message || "El texto principal aparecerá acá."}
        </p>
      </div>
      {draft.mediaType === "video" ? (
        <div className="wa-m-media flex aspect-[1.91/1] w-full items-center justify-center text-[0.68rem]">
          Vista previa de video no disponible acá — se revisa en la plataforma
        </div>
      ) : (
        <ImagenDeLaPieza url={draft.mediaUrl} />
      )}
      <div className="wa-m-footer flex items-center justify-between gap-3 px-3 py-2.5">
        {/*
          El pie real de un anuncio de Meta es dominio + título en negrita
          —y la descripción chica, si hay— no el nombre de la cuenta: eso ya
          se ve arriba, junto al avatar.
        */}
        <div className="min-w-0">
          <p className="wa-m-domain truncate text-[0.65rem] uppercase tracking-wide">
            {dominio}
          </p>
          <p className="truncate text-[0.82rem] font-semibold">
            {draft.metaHeadline.trim() || "Tu marca"}
          </p>
          {draft.metaDescription.trim() && (
            <p className="wa-m-sub truncate text-[0.72rem]">
              {draft.metaDescription.trim()}
            </p>
          )}
        </div>
        <span className="wa-m-cta shrink-0 rounded-md px-3 py-1.5 text-[0.78rem] font-semibold">
          {CALL_TO_ACTIONS[draft.callToAction]}
        </span>
      </div>
    </div>
  );
}

/** Aviso dentro de una fase cuando la plataforma activa es LinkedIn y esa fase no tiene ajustes propios. */
function NotaDeLinkedin({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-foreground/10 bg-card/40 p-3 text-xs leading-5 text-foreground/55">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

const FILTROS_VISTA = [
  { id: "todas", label: "Todas" },
  { id: "google", label: "Google" },
  { id: "meta", label: "Meta" },
] as const;

function VistaPrevia({ draft, cuentas }: { draft: CampaignDraft; cuentas: Cuenta[] }) {
  const [ampliada, setAmpliada] = useState(false);
  const [filtro, setFiltro] = useState<(typeof FILTROS_VISTA)[number]["id"]>("todas");

  const cuentaMeta = cuentas.find(
    (c) =>
      c.provider === "meta" &&
      (draft.accountByPlatform.meta
        ? c.externalId === draft.accountByPlatform.meta
        : cuentas.filter((x) => x.provider === "meta").length === 1),
  );

  const vistas = listaDeVistas(draft);
  const vistasFiltradas = vistas.filter(
    (v) => filtro === "todas" || v.plataforma === filtro,
  );

  return (
    <Surface className="overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-micro flex items-center gap-1.5 text-[0.6rem] text-foreground/45">
          <Megaphone className="size-3 text-brand" />
          VISTA PREVIA · ASÍ SE VERÍA EN CADA RED
        </p>
        {vistas.length > 0 && (
          <button
            type="button"
            onClick={() => setAmpliada(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand/20 bg-brand/8 px-2.5 py-1 text-[0.62rem] font-bold text-brand transition-colors hover:bg-brand/15"
          >
            <Maximize2 className="size-3" />
            Ampliar vista previa
          </button>
        )}
      </div>

      {vistas.length === 0 ? (
        <p className="text-xs text-foreground/40">
          {draft.platforms.includes("linkedin")
            ? "LinkedIn todavía no tiene vista previa aquí: el anuncio se crea aparte, con una publicación de la página."
            : "Elige al menos una plataforma."}
        </p>
      ) : (
        <>
          {/* Apiladas hacia abajo, no en tira horizontal: en la columna
              angosta del Constructor, dos tarjetas lado a lado quedaban
              cortadas y pisándose. Con esta columna alcanza para mostrar dos
              completas; el resto se ve en "Ampliar vista previa". */}
          <div className="space-y-4">
            {vistas.slice(0, 2).map((v) => (
              <div key={v.id}>
                <p className="font-micro mb-1.5 truncate text-[0.55rem] text-foreground/40">
                  {v.etiqueta.toUpperCase()}
                </p>
                <TarjetaDeVista id={v.id} draft={draft} cuentaMeta={cuentaMeta} />
              </div>
            ))}
          </div>
          {vistas.length > 2 && (
            <button
              type="button"
              onClick={() => setAmpliada(true)}
              className="mt-3 w-full text-center text-xs font-semibold text-foreground/45 transition-colors hover:text-foreground/70"
            >
              +{vistas.length - 2} vista{vistas.length - 2 === 1 ? "" : "s"} más
              en &ldquo;Ampliar vista previa&rdquo;
            </button>
          )}
        </>
      )}

      <Dialog open={ampliada} onOpenChange={setAmpliada}>
        <DialogContent className="border-foreground/12 bg-card sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Vista previa</DialogTitle>
            <DialogDescription>
              Así se vería este anuncio en cada red, con las redes y formatos
              que ya quedaron elegidos.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 border-b border-foreground/10 pb-3">
            {FILTROS_VISTA.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFiltro(item.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  filtro === item.id
                    ? "border-brand bg-brand/12 text-brand"
                    : "border-foreground/12 text-foreground/55 hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="scrollbar-thin grid max-h-[68vh] justify-items-center gap-6 overflow-y-auto pt-2 sm:grid-cols-2 sm:items-start">
            {vistasFiltradas.length === 0 && (
              <p className="py-6 text-center text-sm text-foreground/45 sm:col-span-2">
                No hay vistas para ese filtro.
              </p>
            )}
            {vistasFiltradas.map((v) => (
              <div key={v.id} className="w-full min-w-0">
                <p className="font-micro mb-2 text-center text-[0.6rem] text-foreground/50">
                  {v.etiqueta.toUpperCase()}
                </p>
                <TarjetaDeVista id={v.id} draft={draft} cuentaMeta={cuentaMeta} />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Surface>
  );
}

/** Cuenta líneas y avisa cuáles pasan el límite de la plataforma. */
function Contador({
  lineas,
  limite,
  minimo,
  maximo,
}: {
  lineas: string[];
  limite: number;
  minimo: number;
  maximo: number;
}) {
  const items = lineas.filter((line) => line.trim());
  const excedidas = items.filter((line) => line.length > limite).length;
  const enRango = items.length >= minimo && items.length <= maximo;

  return (
    <p
      className={cn(
        "mt-1.5 text-xs",
        excedidas || !enRango ? "text-warn" : "text-foreground/45",
      )}
    >
      {items.length} de {minimo}–{maximo}
      {excedidas > 0 &&
        ` · ${excedidas} ${excedidas === 1 ? "pasa" : "pasan"} los ${limite} caracteres`}
    </p>
  );
}
