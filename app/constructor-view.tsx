"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Info,
  LoaderCircle,
  Megaphone,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { nombreCompuesto } from "@/lib/nomenclatura";
import {
  CALL_TO_ACTIONS,
  META_PLACEMENTS,
  OBJECTIVES,
  SPECIAL_AD_CATEGORIES,
  type CallToAction,
  type CampaignDraft,
  type Gender,
  type GoogleChannel,
  type Objective,
  type SpecialAdCategory,
} from "@/lib/constructor";
import { ACTIVE_PLATFORMS, platformLabel, type Platform } from "@/lib/plataformas";
import { cn } from "@/lib/utils";
import { Surface } from "./ui";

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
  countries: string[];
};

type Cliente = { id: string; name: string; accounts: Cuenta[] };

type Issue = { field: string; message: string; blocking: boolean };
type PlanStep = {
  platform: Platform;
  action: string;
  label: string;
  params: Record<string, unknown>;
  informativo?: boolean;
};
type Plan = {
  issues: Issue[];
  budget: { suggested: number | null; currency: string | null; basis: string };
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
  error?: string;
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

function borradorInicial(attachTo?: ConstructorAttachTo): CampaignDraft {
  // "Crear campaña para este cliente" llega con portfolioId pero sin
  // campaignId: ahí solo se precarga el cliente, no se adjunta a nada — una
  // campaña que todavía no existe no tiene id que adjuntarle.
  const adjuntando = Boolean(attachTo?.campaignId);
  return {
    portfolioId: attachTo?.portfolioId ?? "",
    platforms: attachTo ? [attachTo.platform] : ["google"],
    accountByPlatform:
      attachTo?.accountId ? { [attachTo.platform]: attachTo.accountId } : {},
    name: "",
    details: "",
    objective: "trafico",
    specialAdCategory: "ninguna",
    conversionLocation: "sitio_web",
    dailyBudget: null,
    budgetByPlatform: {},
    budgetMode: "diaria",
    endDate: null,
    landingUrl: "",
    headlines: [],
    descriptions: [],
    pathDisplay1: "",
    pathDisplay2: "",
    keywords: [],
    message: "",
    metaHeadline: "",
    metaDescription: "",
    metaBudgetLevel: "campana",
    mediaUrl: "",
    mediaType: "none",
    ageMin: 18,
    ageMax: 65,
    gender: "todos",
    googleChannel: "search",
    metaPlacements: [],
    callToAction: "LEARN_MORE",
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
}: {
  attachTo?: ConstructorAttachTo;
} = {}) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fase, setFase] = useState<Fase>(
    attachTo?.adsetId ? "anuncio" : attachTo?.campaignId ? "conjunto" : "campana",
  );
  const [draft, setDraft] = useState<CampaignDraft>(() => borradorInicial(attachTo));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Qué plataforma se ve en el selector tipo carrusel de Conjunto y Anuncio,
  // cuando hay más de una elegida. Orden estable: el de ACTIVE_PLATFORMS, no
  // el orden en que se fueron marcando los botones.
  const [plataformaActiva, setPlataformaActiva] = useState<Platform>(
    draft.platforms[0] ?? "google",
  );
  const plataformasElegidas = ACTIVE_PLATFORMS.filter((p) =>
    draft.platforms.includes(p),
  );

  useEffect(() => {
    // Si la pestaña activa deja de estar entre las elegidas —se destildó esa
    // plataforma, o todavía no hay ninguna— se cae a la primera disponible en
    // vez de quedar mostrando el formulario de algo que ya no aplica.
    if (!plataformasElegidas.includes(plataformaActiva)) {
      setPlataformaActiva(plataformasElegidas[0] ?? "google");
    }
  }, [plataformasElegidas, plataformaActiva]);

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

  function actualizar(cambios: Partial<CampaignDraft>) {
    setDraft((actual) => ({ ...actual, ...cambios }));
  }

  function alternarPlataforma(value: Platform) {
    setDraft((actual) => ({
      ...actual,
      platforms: actual.platforms.includes(value)
        ? actual.platforms.filter((item) => item !== value)
        : [...actual.platforms, value],
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
      if (body.budget.suggested !== null && draft.dailyBudget === null) {
        actualizar({ dailyBudget: body.budget.suggested });
      }
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
  async function publicar() {
    setPublicando(true);
    setError(null);
    try {
      const response = await fetch("/api/constructor/ejecutar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft, confirmacion: "CREAR" }),
      });
      const body = (await response.json()) as Resultado;
      setResultado(body);
      if (!response.ok && body.error) setError(body.error);
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

  const bloqueantes = plan?.issues.filter((i) => i.blocking) ?? [];
  const avisos = plan?.issues.filter((i) => !i.blocking) ?? [];
  const indiceFase = FASES.findIndex((f) => f.id === fase);

  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 md:p-6">
      <div className="mb-5">
        <p className="font-micro mb-3 inline-flex items-center gap-2 rounded-full border border-[#F8FAD7]/10 bg-[#323330]/55 px-3 py-1.5 text-[0.62rem] text-[#F8FAD7]/60 shadow-sm backdrop-blur-md">
          <Sparkles className="size-3 text-[#4242FF]" />
          Constructor · se revisa antes de publicar
        </p>
        <h2 className="font-editorial text-3xl leading-[0.98] tracking-[-0.035em] text-[#F8FAD7] md:text-[2.8rem]">
          {draft.existingAdset
            ? "Añade un anuncio, revísalo antes de publicar"
            : draft.existingCampaign
              ? "Añade un conjunto de anuncios, revísalo antes de publicar"
              : "Arma una campaña, revísala antes de publicar"}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#F8FAD7]/58">
          {draft.existingCampaign ? (
            <>
              Sobre <strong className="text-[#F8FAD7]/80">{draft.existingCampaign.campaignName}</strong>
              {draft.existingAdset ? (
                <>
                  {" "}
                  · <strong className="text-[#F8FAD7]/80">{draft.existingAdset.adsetName}</strong>
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
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#3BFF00]" />
        <p className="text-xs leading-5 text-[#F8FAD7]/70">
          <strong className="text-[#F8FAD7]">Nada sale sin que lo apruebes.</strong>{" "}
          Armar y revisar el plan no toca ninguna plataforma. Solo el botón de
          publicar, al final, crea de verdad — y todo nace pausado, así que no
          gasta hasta que lo actives en la plataforma.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_420px]">
        {/* Riel de fases, como el panel izquierdo del creador de anuncios de Meta. */}
        <Surface className="h-fit overflow-hidden p-2">
          {FASES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFase(item.id)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                fase === item.id
                  ? "bg-[#4242FF]/12 text-[#F8FAD7]"
                  : "text-[#F8FAD7]/55 hover:bg-[#F8FAD7]/6 hover:text-[#F8FAD7]",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.62rem] font-bold",
                  index < indiceFase
                    ? "border-[#3BFF00]/40 bg-[#3BFF00]/15 text-[#3BFF00]"
                    : fase === item.id
                      ? "border-[#4242FF] text-[#4242FF]"
                      : "border-[#F8FAD7]/20 text-[#F8FAD7]/40",
                )}
              >
                {index < indiceFase ? <Check className="size-3" /> : index + 1}
              </span>
              <span>
                <span className="block text-sm font-bold">{item.label}</span>
                <span className="mt-0.5 block text-[0.68rem] text-[#F8FAD7]/45">
                  {item.detalle}
                </span>
              </span>
            </button>
          ))}
        </Surface>

        {/* Formulario de la fase activa. */}
        <Surface className="p-5">
          {fase === "campana" && (
            <FaseCampana
              draft={draft}
              clientes={clientes}
              cargandoClientes={cargando}
              cuentas={cuentas}
              onChange={actualizar}
              onTogglePlatform={alternarPlataforma}
            />
          )}
          {fase === "conjunto" && (
            <FaseConjunto
              draft={draft}
              cuentas={cuentas}
              onChange={actualizar}
              plataformasElegidas={plataformasElegidas}
              plataformaActiva={plataformaActiva}
              onPlataformaActiva={setPlataformaActiva}
            />
          )}
          {fase === "anuncio" && (
            <FaseAnuncio
              draft={draft}
              cuentas={cuentas}
              onChange={actualizar}
              plataformasElegidas={plataformasElegidas}
              plataformaActiva={plataformaActiva}
              onPlataformaActiva={setPlataformaActiva}
            />
          )}

          <div className="mt-6 flex items-center justify-between border-t border-[#F8FAD7]/10 pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={indiceFase === 0}
              onClick={() => setFase(FASES[Math.max(0, indiceFase - 1)].id)}
              className="text-[#F8FAD7]/60"
            >
              Atrás
            </Button>
            {indiceFase < FASES.length - 1 ? (
              <Button
                type="button"
                onClick={() => setFase(FASES[indiceFase + 1].id)}
                className="font-extrabold"
              >
                Siguiente
                <ChevronRight />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void revisarPlan()}
                disabled={busy}
                className="font-extrabold"
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Wand2 />}
                Revisar el plan
              </Button>
            )}
          </div>
        </Surface>

        {/* Vista previa y plan, visibles durante todo el recorrido. */}
        <div className="space-y-4">
          <VistaPrevia draft={draft} cuentas={cuentas} />

          {error && (
            <div className="rounded-[16px] border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {plan && (
            <>
              {plan.budget.basis && (
                <Surface className="p-4">
                  <p className="font-micro text-[0.6rem] text-[#F8FAD7]/45">
                    PRESUPUESTO SUGERIDO
                  </p>
                  <p className="metric-number mt-1 text-2xl font-bold text-[#F8FAD7]">
                    {plan.budget.suggested === null
                      ? "Sin dato"
                      : `${plan.budget.currency ?? ""} ${plan.budget.suggested.toLocaleString("es-CL")}`}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#F8FAD7]/50">
                    {plan.budget.basis}
                  </p>
                </Surface>
              )}

              {bloqueantes.length > 0 && (
                <Surface className="border-red-500/25 bg-red-500/[0.06] p-4">
                  <p className="text-sm font-bold text-[#F8FAD7]">
                    Falta resolver {bloqueantes.length}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {bloqueantes.map((issue, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-xs leading-5 text-red-300"
                      >
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </Surface>
              )}

              {avisos.length > 0 && (
                <Surface className="border-amber-500/25 bg-amber-500/[0.06] p-4">
                  <ul className="space-y-1.5">
                    {avisos.map((issue, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-xs leading-5 text-amber-300"
                      >
                        <Info className="mt-0.5 size-3.5 shrink-0" />
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </Surface>
              )}

              <Surface className="overflow-hidden">
                <div className="border-b border-[#F8FAD7]/10 px-4 py-3">
                  <h3 className="font-bold text-[#F8FAD7]">
                    Lo que se ejecutaría
                  </h3>
                  <p className="mt-1 text-xs text-[#F8FAD7]/50">
                    {plan.steps.filter((s) => !s.informativo).length} pasos ·{" "}
                    {resultado ? "ya ejecutado" : "todavía sin enviar"}
                  </p>
                </div>
                <ol className="divide-y divide-[#F8FAD7]/8">
                  {plan.steps.map((step, index) => (
                    <li key={index} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-micro rounded-full border border-[#F8FAD7]/12 px-2 py-0.5 text-[0.55rem] text-[#F8FAD7]/50">
                          {platformLabel(step.platform).toUpperCase()}
                        </span>
                        <span className="text-sm font-bold text-[#F8FAD7]">
                          {step.label}
                        </span>
                        {step.informativo && (
                          <span className="font-micro rounded-full border border-[#4242FF]/25 bg-[#4242FF]/10 px-1.5 py-0.5 text-[0.52rem] text-[#4242FF]">
                            INFORMATIVO
                          </span>
                        )}
                      </div>
                      <pre className="metric-number mt-2 overflow-x-auto rounded-lg bg-[#292929]/70 p-2.5 text-[0.68rem] leading-5 text-[#F8FAD7]/62">
                        {JSON.stringify(step.params, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ol>

                {/*
                  El único punto del sistema que cambia algo fuera de acá.
                  Aparece solo cuando no queda nada bloqueante, y lo que se
                  ejecuta es este mismo plan: el servidor lo vuelve a armar
                  con el borrador, no confía en lo que mande el navegador.
                */}
                {bloqueantes.length === 0 && !resultado && (
                  <div className="border-t border-[#F8FAD7]/10 p-4">
                    <Button
                      type="button"
                      onClick={() => void publicar()}
                      disabled={publicando}
                      className="w-full font-extrabold"
                    >
                      {publicando ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Rocket />
                      )}
                      Publicar pausado en{" "}
                      {draft.platforms.map(platformLabel).join(" y ")}
                    </Button>
                    <p className="mt-2 text-center text-[0.68rem] leading-5 text-[#F8FAD7]/45">
                      Se crea de verdad en la cuenta del cliente, en estado
                      pausado. No empieza a gastar hasta que lo actives en la
                      plataforma.
                    </p>
                  </div>
                )}
              </Surface>

              {resultado && (
                <Surface
                  className={cn(
                    "overflow-hidden",
                    resultado.ok
                      ? "border-[#3BFF00]/25 bg-[#3BFF00]/[0.05]"
                      : "border-red-500/25 bg-red-500/[0.06]",
                  )}
                >
                  <div className="border-b border-[#F8FAD7]/10 px-4 py-3">
                    <h3 className="flex items-center gap-2 font-bold text-[#F8FAD7]">
                      {resultado.ok ? (
                        <Check className="size-4 text-[#3BFF00]" />
                      ) : (
                        <AlertCircle className="size-4 text-red-400" />
                      )}
                      {resultado.ok ? "Creado" : "Se detuvo"}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-[#F8FAD7]/62">
                      {resultado.error ?? resultado.aviso}
                    </p>
                  </div>
                  <ul className="divide-y divide-[#F8FAD7]/8">
                    {resultado.steps.map((paso, index) => (
                      <li key={index} className="flex items-start gap-2 px-4 py-2.5">
                        {paso.ok ? (
                          <Check className="mt-0.5 size-3.5 shrink-0 text-[#3BFF00]" />
                        ) : (
                          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-red-400" />
                        )}
                        <span className="min-w-0">
                          <span className="block text-sm text-[#F8FAD7]/82">
                            {paso.label}
                          </span>
                          {paso.error && (
                            <span className="mt-0.5 block text-xs leading-5 text-red-300">
                              {paso.error}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {Object.keys(resultado.ids).length > 0 && (
                    <div className="border-t border-[#F8FAD7]/10 px-4 py-3">
                      <p className="font-micro text-[0.58rem] text-[#F8FAD7]/45">
                        IDENTIFICADORES CREADOS
                      </p>
                      <pre className="metric-number mt-1.5 overflow-x-auto text-[0.68rem] leading-5 text-[#F8FAD7]/62">
                        {JSON.stringify(resultado.ids, null, 2)}
                      </pre>
                    </div>
                  )}
                </Surface>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Envoltorio de sección, igual en las tres fases. */
function Seccion({
  titulo,
  soloPlataforma,
  informativo,
  children,
}: {
  titulo: string;
  /** Chip "Solo X" cuando la sección no aplica a todas las plataformas elegidas. */
  soloPlataforma?: string;
  informativo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#F8FAD7]/8 py-4 first:pt-0 last:border-0 last:pb-0">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="text-sm font-bold text-[#F8FAD7]">{titulo}</h3>
        {soloPlataforma && (
          <span className="font-micro rounded-full border border-[#F8FAD7]/12 px-2 py-0.5 text-[0.55rem] text-[#F8FAD7]/45">
            SOLO {soloPlataforma.toUpperCase()}
          </span>
        )}
        {informativo && (
          <span className="font-micro rounded-full border border-[#4242FF]/25 bg-[#4242FF]/10 px-2 py-0.5 text-[0.55rem] text-[#4242FF]">
            INFORMATIVO
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Campo({
  etiqueta,
  className,
  children,
}: {
  etiqueta: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="font-micro mb-1.5 block text-[0.6rem] text-[#F8FAD7]/50">
        {etiqueta}
      </label>
      {children}
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
    <div className="mb-4 flex gap-1 rounded-full border border-[#F8FAD7]/10 p-1">
      {plataformas.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
            activa === p
              ? "bg-[#4242FF] text-[#F8FAD7]"
              : "text-[#F8FAD7]/55 hover:text-[#F8FAD7]",
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
      <p className="mt-2 text-xs text-amber-300">
        Este cliente no tiene cuentas de {platformLabel(platform)}.
      </p>
    );
  }
  if (delPlatform.length === 1) {
    return (
      <p className="mt-2 text-xs text-[#F8FAD7]/50">
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
        <SelectTrigger className="w-full bg-[#292929]/60">
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

function FaseCampana({
  draft,
  clientes,
  cargandoClientes,
  cuentas,
  onChange,
  onTogglePlatform,
}: {
  draft: CampaignDraft;
  clientes: Cliente[];
  cargandoClientes: boolean;
  cuentas: Cuenta[];
  onChange: (cambios: Partial<CampaignDraft>) => void;
  onTogglePlatform: (value: Platform) => void;
}) {
  // Adjuntando a una campaña que ya existe: el cliente, la plataforma, el
  // objetivo y la categoría ya quedaron decididos cuando esa campaña se creó.
  // Pedirlos de nuevo sería fingir una elección que no corresponde acá.
  if (draft.existingCampaign) {
    return (
      <Seccion titulo="Campaña existente">
        <p className="text-sm leading-6 text-[#F8FAD7]/70">
          {platformLabel(draft.existingCampaign.platform)} ·{" "}
          <strong className="text-[#F8FAD7]">
            {draft.existingCampaign.campaignName}
          </strong>
          {draft.existingAdset && (
            <>
              {" "}
              <ChevronRight className="inline size-3 text-[#F8FAD7]/30" />{" "}
              <strong className="text-[#F8FAD7]">
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
      <Seccion titulo="Cliente y objetivo">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="CLIENTE">
            <Select
              value={draft.portfolioId}
              onValueChange={(value) => onChange({ portfolioId: value })}
            >
              <SelectTrigger className="w-full bg-[#292929]/60">
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
          <Campo etiqueta="OBJETIVO">
            <Select
              value={draft.objective}
              onValueChange={(value) => onChange({ objective: value as Objective })}
            >
              <SelectTrigger className="w-full bg-[#292929]/60">
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
          </Campo>
        </div>

        <Campo etiqueta="PLATAFORMAS" className="mt-4">
          <div className="flex flex-wrap gap-2">
            {ACTIVE_PLATFORMS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onTogglePlatform(value)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-bold transition-colors",
                  draft.platforms.includes(value)
                    ? "border-[#4242FF] bg-[#4242FF]/12 text-[#F8FAD7]"
                    : "border-[#F8FAD7]/12 text-[#F8FAD7]/50 hover:border-[#F8FAD7]/25",
                )}
              >
                {platformLabel(value)}
              </button>
            ))}
          </div>
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
      </Seccion>

      <Seccion titulo="Nombre">
        <Input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Campaña Halloween 2026"
          className="bg-[#292929]/60"
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
              className="metric-number text-[0.68rem] text-[#F8FAD7]/45"
            >
              {platformLabel(platform)}:{" "}
              <span className="text-[#4242FF]">
                {nombreCompuesto(
                  OBJECTIVES[draft.objective].sigla,
                  platform,
                  draft.name || "Nombre de la campaña",
                )}
              </span>
            </p>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Detalles">
        <Textarea
          value={draft.details}
          onChange={(e) => onChange({ details: e.target.value })}
          rows={2}
          placeholder="Nota interna para el equipo — no se envía a ninguna plataforma"
          className="bg-[#292929]/60"
        />
      </Seccion>

      <Seccion titulo="Categoría" soloPlataforma="meta">
        <Select
          value={draft.specialAdCategory}
          onValueChange={(value) =>
            onChange({ specialAdCategory: value as SpecialAdCategory })
          }
        >
          <SelectTrigger className="w-full bg-[#292929]/60 sm:w-72">
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
        <p className="mt-2 text-[0.68rem] leading-5 text-[#F8FAD7]/40">
          Vivienda, empleo, crédito y temas sociales tienen reglas de
          segmentación distintas en Meta. Google no tiene este concepto.
        </p>
      </Seccion>
    </>
  );
}

function FaseConjunto({
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
  // Añadiendo un anuncio a un conjunto que ya existe: el conjunto ya trae su
  // presupuesto, público y ubicaciones. Nada de esto se crea de nuevo.
  if (draft.existingAdset) {
    return (
      <Seccion titulo="Conjunto de anuncios existente">
        <p className="text-sm leading-6 text-[#F8FAD7]/70">
          El presupuesto, el público y las ubicaciones de{" "}
          <strong className="text-[#F8FAD7]">{draft.existingAdset.adsetName}</strong>{" "}
          ya están definidos. El anuncio se añade directo ahí.
        </p>
      </Seccion>
    );
  }

  const conGoogle = plataformaActiva === "google";
  const conMeta = plataformaActiva === "meta";

  return (
    <>
      {draft.existingCampaign && (
        <Seccion titulo="Nombre del conjunto de anuncios">
          <Input
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Nombre del conjunto de anuncios"
            className="bg-[#292929]/60"
          />
        </Seccion>
      )}

      {/*
        Presupuesto: es lo único de esta fase que de verdad es de la campaña
        entera, no de una plataforma — por eso vive fuera del selector de
        abajo y se ve sin importar cuál pestaña esté activa.
      */}
      <Seccion titulo="Presupuesto y calendario">
        <PresupuestoPorPlataforma draft={draft} onChange={onChange} />
      </Seccion>

      <SelectorPlataforma
        plataformas={plataformasElegidas}
        activa={plataformaActiva}
        onChange={onPlataformaActiva}
      />

      {conMeta && (
        <>
          <Seccion titulo="Conversión">
            <RadioGroup
              value={draft.conversionLocation ?? "sitio_web"}
              onValueChange={(value) =>
                onChange({ conversionLocation: value as "sitio_web" | "mensajes" })
              }
              className="grid-flow-col justify-start gap-6"
            >
              <label className="flex items-center gap-2 text-sm text-[#F8FAD7]/80">
                <RadioGroupItem value="sitio_web" className="border-[#F8FAD7]/30" />
                Sitio web
              </label>
              <label className="flex items-center gap-2 text-sm text-[#F8FAD7]/80">
                <RadioGroupItem value="mensajes" className="border-[#F8FAD7]/30" />
                Mensajes
              </label>
            </RadioGroup>
          </Seccion>

          {!draft.existingCampaign && (
            <Seccion titulo="Presupuesto de campaña">
              <RadioGroup
                value={draft.metaBudgetLevel}
                onValueChange={(value) =>
                  onChange({ metaBudgetLevel: value as "campana" | "conjunto" })
                }
                className="gap-3"
              >
                <label className="flex items-start gap-2 text-sm text-[#F8FAD7]/80">
                  <RadioGroupItem
                    value="campana"
                    className="mt-0.5 border-[#F8FAD7]/30"
                  />
                  <span>
                    De campaña (Advantage Campaign Budget)
                    <span className="block text-[0.68rem] text-[#F8FAD7]/45">
                      La campaña reparte el gasto entre sus conjuntos. Es el
                      default real de Meta hoy.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-[#F8FAD7]/80">
                  <RadioGroupItem
                    value="conjunto"
                    className="mt-0.5 border-[#F8FAD7]/30"
                  />
                  <span>
                    De este conjunto
                    <span className="block text-[0.68rem] text-[#F8FAD7]/45">
                      Cada conjunto de la campaña tiene su propio monto, en vez
                      de compartir uno.
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </Seccion>
          )}

          <Seccion titulo="Calendario">
            <Campo etiqueta="TIPO DE PRESUPUESTO" className="sm:w-60">
              <Select
                value={draft.budgetMode}
                onValueChange={(value) =>
                  onChange({ budgetMode: value as "diaria" | "total" })
                }
              >
                <SelectTrigger className="w-full bg-[#292929]/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="diaria">Diaria</SelectItem>
                  <SelectItem value="total">Total (vitalicio)</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            {draft.budgetMode === "total" && (
              <Campo etiqueta="FECHA DE TÉRMINO" className="mt-3 sm:w-60">
                <Input
                  type="date"
                  value={draft.endDate ?? ""}
                  onChange={(e) => onChange({ endDate: e.target.value || null })}
                  className="bg-[#292929]/60"
                />
              </Campo>
            )}
          </Seccion>

          <Seccion titulo="Público">
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo etiqueta="EDAD MÍNIMA">
                <Input
                  type="number"
                  min={13}
                  max={65}
                  value={draft.ageMin}
                  onChange={(e) => onChange({ ageMin: Number(e.target.value) })}
                  className="bg-[#292929]/60"
                />
              </Campo>
              <Campo etiqueta="EDAD MÁXIMA">
                <Input
                  type="number"
                  min={13}
                  max={65}
                  value={draft.ageMax}
                  onChange={(e) => onChange({ ageMax: Number(e.target.value) })}
                  className="bg-[#292929]/60"
                />
              </Campo>
              <Campo etiqueta="GÉNERO">
                <Select
                  value={draft.gender}
                  onValueChange={(value) => onChange({ gender: value as Gender })}
                >
                  <SelectTrigger className="w-full bg-[#292929]/60">
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
            <p className="mt-2 text-[0.68rem] leading-5 text-[#F8FAD7]/40">
              Los países de segmentación se definen por cuenta en la ficha del
              cliente, no acá.
            </p>
          </Seccion>

          <Seccion titulo="Transparencia de anuncios" informativo>
            <p className="text-xs leading-5 text-[#F8FAD7]/55">
              Meta publica todo anuncio activo en su Biblioteca de Anuncios de
              forma automática. No es un ajuste que se pueda enviar desde acá.
            </p>
          </Seccion>

          <Seccion titulo="Ubicaciones">
            <p className="font-micro mb-1.5 text-[0.58rem] text-[#F8FAD7]/45">
              VACÍO ES AUTOMÁTICAS
            </p>
            <div className="flex flex-wrap gap-4">
              {Object.entries(META_PLACEMENTS).map(([id, label]) => (
                <label
                  key={id}
                  className="flex items-center gap-2 text-sm text-[#F8FAD7]/80"
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
                    className="border-[#F8FAD7]/30"
                  />
                  {label}
                </label>
              ))}
            </div>
          </Seccion>

          <Seccion titulo="Seguridad" informativo>
            <Select
              value={draft.brandSafety}
              onValueChange={(value) =>
                onChange({ brandSafety: value as CampaignDraft["brandSafety"] })
              }
            >
              <SelectTrigger className="w-full bg-[#292929]/60 sm:w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="estandar">Estándar</SelectItem>
                <SelectItem value="restringido">Restringido</SelectItem>
                <SelectItem value="ampliado">Ampliado</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-2 text-[0.68rem] leading-5 text-[#F8FAD7]/40">
              Queda como nota para el equipo: el filtro real se administra en
              la herramienta de Seguridad de Marca de Meta, no al crear el
              conjunto.
            </p>
          </Seccion>
        </>
      )}

      {conGoogle && (
        <Seccion titulo="Ubicaciones">
          <RadioGroup
            value={draft.googleChannel}
            onValueChange={(value) =>
              onChange({ googleChannel: value as GoogleChannel })
            }
            className="grid-flow-col justify-start gap-6"
          >
            <label className="flex items-center gap-2 text-sm text-[#F8FAD7]/80">
              <RadioGroupItem value="search" className="border-[#F8FAD7]/30" />
              Red de búsqueda
            </label>
            <label className="flex items-center gap-2 text-sm text-[#F8FAD7]/80">
              <RadioGroupItem value="display" className="border-[#F8FAD7]/30" />
              Red de Display
            </label>
          </RadioGroup>
          {draft.budgetMode === "total" && (
            <p className="mt-3 text-[0.68rem] leading-5 text-amber-300/80">
              Google, por esta vía, solo crea presupuesto diario: el modo
              total elegido en Meta no tiene efecto acá.
            </p>
          )}
        </Seccion>
      )}

      {conGoogle && draft.googleChannel === "search" && (
        <Seccion titulo="Palabras clave">
          <Textarea
            value={draft.keywords.join("\n")}
            onChange={(e) =>
              onChange({
                keywords: e.target.value.split("\n").filter((line) => line.trim()),
              })
            }
            rows={4}
            placeholder={'zapatillas running\n"zapatillas running mujer"\n[comprar zapatillas running]'}
            className="bg-[#292929]/60"
          />
          <p className="mt-2 text-[0.68rem] leading-5 text-[#F8FAD7]/40">
            Una por línea, con la sintaxis de Google Ads: <code>palabra</code>{" "}
            es concordancia amplia, <code>&quot;palabra&quot;</code> de frase,{" "}
            <code>[palabra]</code> exacta. Sin al menos una, el grupo de
            anuncios no tiene qué lo dispare.
          </p>
        </Seccion>
      )}
    </>
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
  onChange,
}: {
  draft: CampaignDraft;
  onChange: (cambios: Partial<CampaignDraft>) => void;
}) {
  const varias = draft.platforms.length > 1;
  const distinto = Object.keys(draft.budgetByPlatform).length > 0;

  if (!varias) {
    return (
      <Campo etiqueta="PRESUPUESTO DIARIO" className="sm:w-60">
        <Input
          value={draft.dailyBudget ?? ""}
          onChange={(e) =>
            onChange({ dailyBudget: e.target.value ? Number(e.target.value) : null })
          }
          inputMode="numeric"
          placeholder="0"
          className="bg-[#292929]/60"
        />
      </Campo>
    );
  }

  return (
    <div>
      {!distinto ? (
        <Campo etiqueta="PRESUPUESTO DIARIO · TODAS LAS PLATAFORMAS" className="sm:w-72">
          <Input
            value={draft.dailyBudget ?? ""}
            onChange={(e) =>
              onChange({ dailyBudget: e.target.value ? Number(e.target.value) : null })
            }
            inputMode="numeric"
            placeholder="0"
            className="bg-[#292929]/60"
          />
        </Campo>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {draft.platforms.map((platform) => (
            <Campo key={platform} etiqueta={`PRESUPUESTO DIARIO · ${platformLabel(platform).toUpperCase()}`}>
              <Input
                value={draft.budgetByPlatform[platform] ?? ""}
                onChange={(e) =>
                  onChange({
                    budgetByPlatform: {
                      ...draft.budgetByPlatform,
                      [platform]: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
                inputMode="numeric"
                placeholder="0"
                className="bg-[#292929]/60"
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
        className="mt-2 text-[0.68rem] font-bold text-[#4242FF] hover:underline"
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

  return (
    <>
      {draft.existingAdset && (
        <Seccion titulo="Nombre del anuncio">
          <Input
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Nombre del anuncio"
            className="bg-[#292929]/60"
          />
        </Seccion>
      )}

      {/* Destino: la misma URL alimenta el `final_url` de Google y el `link` de Meta. */}
      <Seccion titulo="Destino">
        <Campo etiqueta="URL DE DESTINO" className="sm:w-96">
          <Input
            value={draft.landingUrl}
            onChange={(e) => onChange({ landingUrl: e.target.value })}
            placeholder="https://"
            className="bg-[#292929]/60"
          />
        </Campo>
      </Seccion>

      <SelectorPlataforma
        plataformas={plataformasElegidas}
        activa={plataformaActiva}
        onChange={onPlataformaActiva}
      />

      {conMeta && (
        <>
          <Seccion titulo="Identidad">
            <p className="text-sm text-[#F8FAD7]/75">
              {cuentaMeta?.pageId
                ? `Publica como la página ${cuentaMeta.pageId}.`
                : "Elige la cuenta de Meta en el paso de Campaña para resolver su página."}
            </p>
          </Seccion>

          <Seccion titulo="Configuración del anuncio">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="FORMATO">
                <Select
                  value={draft.mediaType}
                  onValueChange={(value) =>
                    onChange({ mediaType: value as "none" | "image" | "video" })
                  }
                >
                  <SelectTrigger className="w-full bg-[#292929]/60">
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
                  <SelectTrigger className="w-full bg-[#292929]/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CALL_TO_ACTIONS) as CallToAction[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {CALL_TO_ACTIONS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            </div>
          </Seccion>

          <Seccion titulo="Contenido del anuncio">
            <Campo etiqueta="TEXTO PRINCIPAL">
              <Textarea
                value={draft.message}
                onChange={(e) => onChange({ message: e.target.value })}
                rows={3}
                className="bg-[#292929]/60"
              />
            </Campo>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="TÍTULO (OPCIONAL)">
                <Input
                  value={draft.metaHeadline}
                  onChange={(e) => onChange({ metaHeadline: e.target.value })}
                  placeholder="La línea en negrita bajo la imagen"
                  className="bg-[#292929]/60"
                />
              </Campo>
              <Campo etiqueta="DESCRIPCIÓN (OPCIONAL)">
                <Input
                  value={draft.metaDescription}
                  onChange={(e) => onChange({ metaDescription: e.target.value })}
                  placeholder="La línea chica bajo el título"
                  className="bg-[#292929]/60"
                />
              </Campo>
            </div>
            {draft.mediaType !== "none" && (
              <Campo etiqueta="URL PÚBLICA DE LA PIEZA" className="mt-3">
                <Input
                  value={draft.mediaUrl}
                  onChange={(e) => onChange({ mediaUrl: e.target.value })}
                  placeholder="https://"
                  className="bg-[#292929]/60"
                />
                <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-[#F8FAD7]/45">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  Meta va a buscar el archivo a esa dirección, no lo recibe
                  cargado. Subir desde el computador exige que WiWO.ADS lo
                  hospede primero — está pendiente.
                </p>
              </Campo>
            )}
          </Seccion>
        </>
      )}

      {conGoogle && (
        <>
          <Seccion titulo="Identidad">
            <p className="text-sm text-[#F8FAD7]/75">
              Google no tiene un concepto de identidad: publica desde la
              cuenta elegida en el paso de Campaña.
            </p>
          </Seccion>

          <Seccion titulo="Contenido del anuncio">
            <Campo etiqueta="TÍTULOS · UNO POR LÍNEA, 3 A 15, MÁX 30 CARACTERES">
              <Textarea
                value={draft.headlines.join("\n")}
                onChange={(e) =>
                  onChange({
                    headlines: e.target.value
                      .split("\n")
                      .filter((line) => line.trim()),
                  })
                }
                rows={4}
                placeholder={"Envío gratis en 24 horas\nCompra directa\nGarantía de un año"}
                className="bg-[#292929]/60"
              />
              <Contador lineas={draft.headlines} limite={30} minimo={3} maximo={15} />
            </Campo>
            <Campo etiqueta="DESCRIPCIONES · 2 A 4, MÁX 90 CARACTERES" className="mt-3">
              <Textarea
                value={draft.descriptions.join("\n")}
                onChange={(e) =>
                  onChange({
                    descriptions: e.target.value
                      .split("\n")
                      .filter((line) => line.trim()),
                  })
                }
                rows={3}
                className="bg-[#292929]/60"
              />
              <Contador lineas={draft.descriptions} limite={90} minimo={2} maximo={4} />
            </Campo>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="RUTA 1 (OPCIONAL) · MÁX 15 CARACTERES">
                <Input
                  value={draft.pathDisplay1}
                  onChange={(e) =>
                    onChange({ pathDisplay1: e.target.value.slice(0, 15) })
                  }
                  placeholder="servicios"
                  className="bg-[#292929]/60"
                />
              </Campo>
              <Campo etiqueta="RUTA 2 (OPCIONAL) · MÁX 15 CARACTERES">
                <Input
                  value={draft.pathDisplay2}
                  onChange={(e) =>
                    onChange({ pathDisplay2: e.target.value.slice(0, 15) })
                  }
                  placeholder="contacto"
                  className="bg-[#292929]/60"
                  disabled={!draft.pathDisplay1.trim()}
                />
              </Campo>
            </div>
            <p className="mt-2 text-[0.68rem] leading-5 text-[#F8FAD7]/40">
              Se ven pegadas al dominio en el anuncio: {dominioDe(draft.landingUrl)}
              {draft.pathDisplay1.trim() ? ` › ${draft.pathDisplay1.trim()}` : ""}
              {draft.pathDisplay2.trim() ? ` › ${draft.pathDisplay2.trim()}` : ""}
            </p>
          </Seccion>
        </>
      )}
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
function ImagenDeLaPieza({ url }: { url: string }) {
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">(
    url.trim() ? "cargando" : "error",
  );
  useEffect(() => {
    setEstado(url.trim() ? "cargando" : "error");
  }, [url]);

  if (estado === "error") {
    return (
      <div className="wa-m-media flex h-44 items-center justify-center px-4 text-center text-[0.68rem]">
        {url.trim()
          ? "No se pudo cargar la imagen desde esa URL"
          : "Falta la URL de la pieza"}
      </div>
    );
  }
  return (
    <div className="wa-m-media relative h-44">
      {estado === "cargando" && (
        <div className="absolute inset-0 flex items-center justify-center text-[0.68rem]">
          Cargando imagen…
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- vista previa de una URL externa arbitraria */}
      <img
        src={url}
        alt="Pieza del anuncio"
        className={cn("h-44 w-full object-cover", estado !== "ok" && "invisible")}
        onLoad={() => setEstado("ok")}
        onError={() => setEstado("error")}
      />
    </div>
  );
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
function VistaPrevia({ draft, cuentas }: { draft: CampaignDraft; cuentas: Cuenta[] }) {
  const conMeta = draft.platforms.includes("meta");
  const conGoogle = draft.platforms.includes("google");

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

  const cuentaMeta = cuentas.find(
    (c) =>
      c.provider === "meta" &&
      (draft.accountByPlatform.meta
        ? c.externalId === draft.accountByPlatform.meta
        : cuentas.filter((x) => x.provider === "meta").length === 1),
  );
  const dominio = dominioDe(draft.landingUrl);

  return (
    <Surface className="overflow-hidden p-4">
      <p className="font-micro mb-3 flex items-center gap-1.5 text-[0.6rem] text-[#F8FAD7]/45">
        <Megaphone className="size-3 text-[#4242FF]" />
        VISTA PREVIA · ASÍ SE VERÍA EN CADA RED
      </p>
      {!conMeta && !conGoogle ? (
        <p className="text-xs text-[#F8FAD7]/40">Elige al menos una plataforma.</p>
      ) : (
        <div className="space-y-4">
          {conGoogle && (
            <div>
              <p className="font-micro mb-1.5 text-[0.55rem] text-[#F8FAD7]/40">
                GOOGLE · RED DE BÚSQUEDA
              </p>
              {/*
                Colores propios de Google, no de Neo — ver `wa-preview-google`
                en globals.css. Cambia de claro a oscuro con el interruptor de
                arriba, pero siguiendo el modo oscuro real de Google, no el de
                WiWO.ADS.
              */}
              <div className="wa-preview-google rounded-lg p-3 font-sans">
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
            </div>
          )}
          {conMeta && (
            <div>
              <p className="font-micro mb-1.5 text-[0.55rem] text-[#F8FAD7]/40">
                META · FEED DE FACEBOOK O INSTAGRAM
              </p>
              {/* Colores propios de Meta — ver `wa-preview-meta` en globals.css. */}
              <div className="wa-preview-meta overflow-hidden rounded-lg font-sans">
                <div className="flex items-center gap-2 p-3">
                  <div className="wa-m-avatar grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold">
                    {(cuentaMeta?.name ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8rem] font-semibold">
                      {cuentaMeta?.name ?? "Elige la cuenta en el paso de Campaña"}
                    </p>
                    <p className="wa-m-sub text-[0.68rem]">Patrocinado</p>
                  </div>
                </div>
                <p className="px-3 pb-2 text-[0.82rem] leading-5 whitespace-pre-line line-clamp-4">
                  {draft.message || "El texto principal aparecerá acá."}
                </p>
                {draft.mediaType === "video" ? (
                  <div className="wa-m-media flex h-44 items-center justify-center text-[0.68rem]">
                    Vista previa de video no disponible acá — se revisa en la plataforma
                  </div>
                ) : (
                  <ImagenDeLaPieza url={draft.mediaUrl} />
                )}
                <div className="wa-m-footer flex items-center justify-between gap-3 px-3 py-2.5">
                  {/*
                    El pie real de un anuncio de Meta es dominio + título en
                    negrita —y la descripción chica, si hay— no el nombre de
                    la cuenta: eso ya se ve arriba, junto al avatar.
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
            </div>
          )}
        </div>
      )}
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
        excedidas || !enRango ? "text-amber-300" : "text-[#F8FAD7]/45",
      )}
    >
      {items.length} de {minimo}–{maximo}
      {excedidas > 0 &&
        ` · ${excedidas} ${excedidas === 1 ? "pasa" : "pasan"} los ${limite} caracteres`}
    </p>
  );
}
