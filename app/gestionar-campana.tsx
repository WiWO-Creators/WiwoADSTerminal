"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { parsearPalabraClave } from "@/lib/constructor";
import { unidadesMenoresMeta } from "@/lib/monedas";
import type { Platform } from "@/lib/plataformas";
import { cn } from "@/lib/utils";
import { OrbeDeBoton } from "./ui";

export type CampanaGestionable = {
  provider: Platform;
  accountId: string;
  /** "campana": campaign_id de Windsor. "conjunto": adset_id (Meta) o
   * ad_group_id (Google) — los dos son el mismo concepto de Windsor,
   * "conjunto", con nombre distinto por plataforma. */
  nivel: "campana" | "conjunto";
  id: string;
  nombre: string;
  currency: string | null;
};

/**
 * Panel de gestión de algo que ya existe — presupuesto, nombre y, solo en
 * Google a nivel de campaña, estrategia de puja, idiomas, horario, palabras
 * clave negativas y extensiones de anuncio. Cada tarjeta es una acción real
 * de Windsor (`app/api/anuncios/gestionar/route.ts` trae la lista exacta) e
 * independiente de las demás: guardar una no exige guardar el resto.
 *
 * Menos tarjetas en unas combinaciones que en otras es a propósito, no por
 * descuido: Google no tiene presupuesto a nivel de grupo de anuncios (solo
 * de campaña), y ninguna de las dos expone idioma, horario ni extensión a
 * nivel de conjunto — esas viven a nivel de campaña o en otra herramienta de
 * la cuenta.
 */
export function GestionarCampanaDialog({
  campana,
  open,
  onOpenChange,
}: {
  campana: CampanaGestionable | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!campana) return null;
  const esGoogle = campana.provider === "google";
  const esCampana = campana.nivel === "campana";
  // Google no tiene una acción de presupuesto a nivel de grupo de anuncios.
  const conPresupuesto = !esGoogle || esCampana;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Gestionar {esCampana ? "campaña" : "conjunto de anuncios"}
          </DialogTitle>
          <DialogDescription className="truncate" title={campana.nombre}>
            {campana.nombre}
          </DialogDescription>
        </DialogHeader>
        <Accordion type="multiple" defaultValue={["presupuesto"]}>
          {conPresupuesto && (
            <AccordionItem value="presupuesto">
              <AccordionTrigger>Presupuesto</AccordionTrigger>
              <AccordionContent>
                <TarjetaPresupuesto campana={campana} />
              </AccordionContent>
            </AccordionItem>
          )}
          <AccordionItem value="nombre">
            <AccordionTrigger>Nombre</AccordionTrigger>
            <AccordionContent>
              <TarjetaNombre campana={campana} />
            </AccordionContent>
          </AccordionItem>
          {esGoogle && esCampana && (
            <>
              <AccordionItem value="puja">
                <AccordionTrigger>Estrategia de puja</AccordionTrigger>
                <AccordionContent>
                  <TarjetaPuja campana={campana} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="idiomas">
                <AccordionTrigger>Idiomas</AccordionTrigger>
                <AccordionContent>
                  <TarjetaIdiomas campana={campana} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="horario">
                <AccordionTrigger>Horario de entrega</AccordionTrigger>
                <AccordionContent>
                  <TarjetaHorario campana={campana} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="negativas">
                <AccordionTrigger>Palabras clave negativas</AccordionTrigger>
                <AccordionContent>
                  <TarjetaNegativas campana={campana} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="extensiones">
                <AccordionTrigger>Extensiones de anuncio</AccordionTrigger>
                <AccordionContent>
                  <TarjetaExtensiones campana={campana} />
                </AccordionContent>
              </AccordionItem>
            </>
          )}
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}

async function ejecutar(
  campana: CampanaGestionable,
  action: string,
  params: Record<string, unknown>,
) {
  const response = await fetch("/api/anuncios/gestionar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: campana.provider,
      accountId: campana.accountId,
      action,
      params,
    }),
  });
  const body = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !body.ok) {
    throw new Error(body.error ?? "No se pudo aplicar el cambio");
  }
}

/** Botón de guardar compartido por cada tarjeta: mismo estado de carga y el
 * mismo manejo de error, para no repetir el try/catch siete veces. */
function useAccion(campana: CampanaGestionable) {
  const [enviando, setEnviando] = useState(false);
  async function enviar(
    action: string,
    params: Record<string, unknown>,
    exito: string,
  ) {
    setEnviando(true);
    try {
      await ejecutar(campana, action, params);
      toast.success(exito);
    } catch (issue) {
      toast.error(
        issue instanceof Error ? issue.message : "No se pudo aplicar el cambio",
      );
    } finally {
      setEnviando(false);
    }
  }
  return { enviando, enviar };
}

function TarjetaPresupuesto({ campana }: { campana: CampanaGestionable }) {
  const { enviando, enviar } = useAccion(campana);
  const [monto, setMonto] = useState("");
  const [tipo, setTipo] = useState<"daily" | "lifetime">("daily");

  async function guardar() {
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }
    const esGoogle = campana.provider === "google";
    const esCampana = campana.nivel === "campana";
    await enviar(
      esCampana ? "set_campaign_budget" : "set_adset_budget",
      esGoogle
        ? {
            campaign_id: campana.id,
            budget_type: tipo,
            // Google trabaja en micros: 1.000.000 = una unidad de la moneda.
            amount_micros: Math.round(valor * 1_000_000),
          }
        : {
            [esCampana ? "campaign_id" : "adset_id"]: campana.id,
            budget_type: tipo,
            // Meta trabaja en la unidad menor: 5000 = 50,00 en USD; en CLP y
            // otras sin centavos, el monto va en pesos enteros.
            amount: Math.round(valor * unidadesMenoresMeta(campana.currency)),
          },
      "Presupuesto actualizado",
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="font-micro block text-[0.6rem] text-foreground/50">
            TIPO
          </label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as "daily" | "lifetime")}>
            <SelectTrigger className="mt-1.5 w-40 bg-field/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Diario</SelectItem>
              <SelectItem value="lifetime">Total (vitalicio)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 flex-1">
          <label className="font-micro block text-[0.6rem] text-foreground/50">
            MONTO {campana.currency ? `(${campana.currency})` : ""}
          </label>
          <Input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            className="mt-1.5 bg-field/60"
          />
        </div>
        <Button onClick={() => void guardar()} disabled={enviando}>
          {enviando ? <OrbeDeBoton /> : null}
          Guardar
        </Button>
      </div>
      {tipo === "lifetime" && campana.provider === "google" && (
        <p className="text-[0.68rem] leading-5 text-warn/80">
          Google solo aplica un presupuesto total a campañas con fecha de
          término fija; sin eso, esta acción se rechaza.
        </p>
      )}
    </div>
  );
}

function TarjetaNombre({ campana }: { campana: CampanaGestionable }) {
  const { enviando, enviar } = useAccion(campana);
  const [nombre, setNombre] = useState(campana.nombre);
  const esGoogle = campana.provider === "google";
  const esCampana = campana.nivel === "campana";

  async function guardar() {
    if (!nombre.trim()) {
      toast.error("El nombre no puede quedar vacío");
      return;
    }
    const action = esGoogle
      ? esCampana
        ? "rename_campaign"
        : "rename_ad_group"
      : esCampana
        ? "update_campaign"
        : "update_adset";
    const campoId = esGoogle
      ? esCampana
        ? "campaign_id"
        : "ad_group_id"
      : esCampana
        ? "campaign_id"
        : "adset_id";
    await enviar(
      action,
      { [campoId]: campana.id, name: nombre.trim() },
      "Nombre actualizado",
    );
  }

  return (
    <div className="flex items-end gap-3">
      <Input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="min-w-0 flex-1 bg-field/60"
      />
      <Button onClick={() => void guardar()} disabled={enviando}>
        {enviando ? <OrbeDeBoton /> : null}
        Guardar
      </Button>
    </div>
  );
}

const ESTRATEGIAS: Array<{
  id: string;
  label: string;
  campo: "target_cpa_micros" | "target_roas" | "cpc_bid_ceiling_micros" | null;
  etiquetaCampo: string;
}> = [
  { id: "manual_cpc", label: "CPC manual", campo: null, etiquetaCampo: "" },
  {
    id: "target_cpa",
    label: "CPA objetivo",
    campo: "target_cpa_micros",
    etiquetaCampo: "CPA objetivo",
  },
  {
    id: "target_roas",
    label: "ROAS objetivo",
    campo: "target_roas",
    etiquetaCampo: "ROAS objetivo (ej. 4.0 = 400%)",
  },
  {
    id: "maximize_conversions",
    label: "Maximizar conversiones",
    campo: "target_cpa_micros",
    etiquetaCampo: "CPA objetivo (opcional)",
  },
  {
    id: "maximize_conversion_value",
    label: "Maximizar valor de conversión",
    campo: "target_roas",
    etiquetaCampo: "ROAS objetivo (opcional, ej. 4.0 = 400%)",
  },
  {
    id: "maximize_clicks",
    label: "Maximizar clics",
    campo: "cpc_bid_ceiling_micros",
    etiquetaCampo: "Tope de CPC",
  },
  {
    id: "target_spend",
    label: "Gasto objetivo",
    campo: "cpc_bid_ceiling_micros",
    etiquetaCampo: "Tope de CPC",
  },
];

function TarjetaPuja({ campana }: { campana: CampanaGestionable }) {
  const { enviando, enviar } = useAccion(campana);
  const [estrategia, setEstrategia] = useState("manual_cpc");
  const [valor, setValor] = useState("");
  const config = ESTRATEGIAS.find((e) => e.id === estrategia)!;

  async function guardar() {
    const params: Record<string, unknown> = {
      campaign_id: campana.id,
      strategy: estrategia,
    };
    if (config.campo) {
      const numero = Number(valor);
      if (!Number.isFinite(numero) || numero <= 0) {
        toast.error(`Ingresa ${config.etiquetaCampo.toLowerCase()}`);
        return;
      }
      params[config.campo] =
        config.campo === "target_roas" ? numero : Math.round(numero * 1_000_000);
    }
    await enviar("set_campaign_bidding_strategy", params, "Estrategia de puja actualizada");
  }

  return (
    <div className="space-y-3">
      <Select value={estrategia} onValueChange={setEstrategia}>
        <SelectTrigger className="w-full bg-field/60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ESTRATEGIAS.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {config.campo && (
        <Input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          placeholder={config.etiquetaCampo}
          className="bg-field/60"
        />
      )}
      <Button onClick={() => void guardar()} disabled={enviando}>
        {enviando ? <OrbeDeBoton /> : null}
        Guardar
      </Button>
    </div>
  );
}

/** Los 51 códigos de idioma que Google Ads permite segmentar por esta vía
 * (enum real de `set_campaign_language_targeting`, no una lista propia). */
const IDIOMAS_GOOGLE: Record<string, string> = {
  ar: "Árabe",
  bn: "Bengalí",
  bg: "Búlgaro",
  ca: "Catalán",
  zh_CN: "Chino simplificado",
  zh_TW: "Chino tradicional",
  hr: "Croata",
  cs: "Checo",
  da: "Danés",
  nl: "Neerlandés",
  en: "Inglés",
  et: "Estonio",
  tl: "Filipino",
  fi: "Finlandés",
  fr: "Francés",
  de: "Alemán",
  el: "Griego",
  gu: "Guyaratí",
  iw: "Hebreo",
  hi: "Hindi",
  hu: "Húngaro",
  is: "Islandés",
  id: "Indonesio",
  it: "Italiano",
  ja: "Japonés",
  kn: "Canarés",
  ko: "Coreano",
  lv: "Letón",
  lt: "Lituano",
  ms: "Malayo",
  ml: "Malabar",
  mr: "Maratí",
  no: "Noruego",
  fa: "Persa",
  pl: "Polaco",
  pt: "Portugués",
  pa: "Panyabí",
  ro: "Rumano",
  ru: "Ruso",
  sr: "Serbio",
  sk: "Eslovaco",
  sl: "Esloveno",
  es: "Español",
  sv: "Sueco",
  ta: "Tamil",
  te: "Telugu",
  th: "Tailandés",
  tr: "Turco",
  uk: "Ucraniano",
  ur: "Urdu",
  vi: "Vietnamita",
};

function TarjetaIdiomas({ campana }: { campana: CampanaGestionable }) {
  const { enviando, enviar } = useAccion(campana);
  const [elegidos, setElegidos] = useState<string[]>(["es"]);

  async function guardar() {
    // `set_campaign_language_targeting` reemplaza TODA la segmentación de
    // idioma en cada llamada — no suma, sustituye.
    await enviar(
      "set_campaign_language_targeting",
      { campaign_id: campana.id, languages: elegidos },
      elegidos.length > 0
        ? "Idiomas actualizados"
        : "Segmentación de idioma despejada — la campaña ahora llega a todos",
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[0.68rem] leading-5 text-foreground/40">
        Este cambio reemplaza toda la segmentación de idioma de la campaña:
        incluye acá todos los idiomas que deben quedar activos, no solo el que
        quieras sumar.
      </p>
      <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
        {Object.entries(IDIOMAS_GOOGLE).map(([codigo, label]) => (
          <label
            key={codigo}
            className="flex items-center gap-1.5 text-xs text-foreground/75"
          >
            <Checkbox
              checked={elegidos.includes(codigo)}
              onCheckedChange={(checked) =>
                setElegidos((actual) =>
                  checked
                    ? [...actual, codigo]
                    : actual.filter((c) => c !== codigo),
                )
              }
              className="border-foreground/30"
            />
            {label}
          </label>
        ))}
      </div>
      <Button onClick={() => void guardar()} disabled={enviando}>
        {enviando ? <OrbeDeBoton /> : null}
        Guardar ({elegidos.length === 0 ? "todos los idiomas" : `${elegidos.length} elegido${elegidos.length === 1 ? "" : "s"}`})
      </Button>
    </div>
  );
}

const DIAS_SEMANA: Array<{ id: string; label: string }> = [
  { id: "MONDAY", label: "Lun" },
  { id: "TUESDAY", label: "Mar" },
  { id: "WEDNESDAY", label: "Mié" },
  { id: "THURSDAY", label: "Jue" },
  { id: "FRIDAY", label: "Vie" },
  { id: "SATURDAY", label: "Sáb" },
  { id: "SUNDAY", label: "Dom" },
];

/**
 * Versión simplificada de dayparting: una sola ventana horaria, igual todos
 * los días marcados — no un editor de varias ventanas por día. Cubre el caso
 * real más común ("solo de 8 a 20 h") sin la complejidad de una grilla
 * completa de siete días por seis ventanas cada uno.
 */
function TarjetaHorario({ campana }: { campana: CampanaGestionable }) {
  const { enviando, enviar } = useAccion(campana);
  const [dias, setDias] = useState<string[]>(DIAS_SEMANA.map((d) => d.id));
  const [desde, setDesde] = useState(8);
  const [hasta, setHasta] = useState(20);

  async function guardar() {
    if (dias.length === 0) {
      toast.error("Elige al menos un día, o quita el horario para servir todo el día");
      return;
    }
    if (hasta <= desde) {
      toast.error("La hora de término debe ser mayor que la de inicio");
      return;
    }
    await enviar(
      "set_ad_schedule",
      {
        campaign_id: campana.id,
        schedule: dias.map((day_of_week) => ({
          day_of_week,
          start_hour: desde,
          end_hour: hasta,
        })),
      },
      "Horario de entrega actualizado",
    );
  }

  async function quitar() {
    await enviar(
      "set_ad_schedule",
      { campaign_id: campana.id, schedule: [] },
      "Horario despejado — la campaña ahora entrega a toda hora",
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {DIAS_SEMANA.map((dia) => {
          const activo = dias.includes(dia.id);
          return (
            <button
              key={dia.id}
              type="button"
              onClick={() =>
                setDias((actual) =>
                  activo
                    ? actual.filter((d) => d !== dia.id)
                    : [...actual, dia.id],
                )
              }
              className={cn(
                "rounded-full border px-2.5 py-1 text-[0.7rem] font-medium transition-colors",
                activo
                  ? "border-brand/40 bg-brand/15 text-brand"
                  : "border-foreground/10 bg-field/50 text-foreground/60",
              )}
            >
              {dia.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-end gap-3">
        <div>
          <label className="font-micro block text-[0.6rem] text-foreground/50">
            DESDE
          </label>
          <Input
            value={desde}
            onChange={(e) => setDesde(Math.min(Math.max(Number(e.target.value) || 0, 0), 23))}
            inputMode="numeric"
            className="mt-1.5 w-20 bg-field/60"
          />
        </div>
        <div>
          <label className="font-micro block text-[0.6rem] text-foreground/50">
            HASTA
          </label>
          <Input
            value={hasta}
            onChange={(e) => setHasta(Math.min(Math.max(Number(e.target.value) || 0, 1), 24))}
            inputMode="numeric"
            className="mt-1.5 w-20 bg-field/60"
          />
        </div>
        <Button onClick={() => void guardar()} disabled={enviando}>
          {enviando ? <OrbeDeBoton /> : null}
          Guardar
        </Button>
        <Button variant="ghost" onClick={() => void quitar()} disabled={enviando}>
          Quitar horario
        </Button>
      </div>
      <p className="text-[0.65rem] leading-5 text-foreground/35">
        Una sola ventana igual todos los días marcados — no varias ventanas
        distintas por día. Reemplaza el horario completo de la campaña.
      </p>
    </div>
  );
}

function TarjetaNegativas({ campana }: { campana: CampanaGestionable }) {
  const { enviando, enviar } = useAccion(campana);
  const [texto, setTexto] = useState("");

  async function guardar() {
    const keywords = texto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map(parsearPalabraClave);
    if (keywords.length === 0) {
      toast.error("Escribe al menos una palabra clave negativa");
      return;
    }
    await enviar(
      "push_negative_keywords",
      { level: "campaign", campaign_id: campana.id, keywords },
      `${keywords.length} palabra${keywords.length === 1 ? "" : "s"} clave negativa añadida${keywords.length === 1 ? "" : "s"}`,
    );
    setTexto("");
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={4}
        placeholder={'competidor\n"marca ajena"\n[gratis]'}
        className="bg-field/60"
      />
      <p className="text-[0.68rem] leading-5 text-foreground/40">
        Misma sintaxis que las palabras clave del constructor: <code>palabra</code>{" "}
        amplia, <code>&quot;palabra&quot;</code> de frase, <code>[palabra]</code>{" "}
        exacta. Solo suma — quitar una negativa ya cargada se sigue haciendo
        desde Google Ads.
      </p>
      <Button onClick={() => void guardar()} disabled={enviando}>
        {enviando ? <OrbeDeBoton /> : null}
        Añadir
      </Button>
    </div>
  );
}

const CABECERAS_SNIPPET = [
  "Amenities",
  "Brands",
  "Courses",
  "Degree programs",
  "Destinations",
  "Featured hotels",
  "Insurance coverage",
  "Models",
  "Neighborhoods",
  "Service catalog",
  "Shows",
  "Styles",
  "Types",
];

type TipoExtension = "sitelink" | "callout" | "structured_snippet" | "call";

function TarjetaExtensiones({ campana }: { campana: CampanaGestionable }) {
  const { enviando, enviar } = useAccion(campana);
  const [tipo, setTipo] = useState<TipoExtension>("sitelink");
  const [linkText, setLinkText] = useState("");
  const [finalUrl, setFinalUrl] = useState("");
  const [descripcion1, setDescripcion1] = useState("");
  const [descripcion2, setDescripcion2] = useState("");
  const [calloutText, setCalloutText] = useState("");
  const [header, setHeader] = useState(CABECERAS_SNIPPET[0]);
  const [valores, setValores] = useState("");
  const [telefono, setTelefono] = useState("");
  const [paisTelefono, setPaisTelefono] = useState("CL");

  async function guardar() {
    const base = {
      level: "campaign" as const,
      campaign_id: campana.id,
      asset_type: tipo,
    };
    if (tipo === "sitelink") {
      if (!linkText.trim() || !finalUrl.trim()) {
        toast.error("El sitelink necesita texto y URL de destino");
        return;
      }
      await enviar(
        "create_ad_asset",
        {
          ...base,
          link_text: linkText.trim(),
          final_url: finalUrl.trim(),
          ...(descripcion1.trim() ? { description_1: descripcion1.trim() } : {}),
          ...(descripcion2.trim() ? { description_2: descripcion2.trim() } : {}),
        },
        "Sitelink añadido",
      );
      setLinkText("");
      setFinalUrl("");
      setDescripcion1("");
      setDescripcion2("");
      return;
    }
    if (tipo === "callout") {
      if (!calloutText.trim()) {
        toast.error("Escribe el texto del callout");
        return;
      }
      await enviar(
        "create_ad_asset",
        { ...base, callout_text: calloutText.trim() },
        "Callout añadido",
      );
      setCalloutText("");
      return;
    }
    if (tipo === "structured_snippet") {
      const lista = valores
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (lista.length < 3 || lista.length > 10) {
        toast.error("El fragmento estructurado necesita entre 3 y 10 valores");
        return;
      }
      await enviar(
        "create_ad_asset",
        { ...base, header, values: lista },
        "Fragmento estructurado añadido",
      );
      setValores("");
      return;
    }
    if (!telefono.trim() || !paisTelefono.trim()) {
      toast.error("Faltan el número y el país del teléfono");
      return;
    }
    await enviar(
      "create_ad_asset",
      {
        ...base,
        phone_number: telefono.trim(),
        country_code: paisTelefono.trim().toUpperCase(),
      },
      "Extensión de llamada añadida",
    );
    setTelefono("");
  }

  return (
    <div className="space-y-3">
      <Select value={tipo} onValueChange={(v) => setTipo(v as TipoExtension)}>
        <SelectTrigger className="w-full bg-field/60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="sitelink">Sitelink</SelectItem>
          <SelectItem value="callout">Callout</SelectItem>
          <SelectItem value="structured_snippet">Fragmento estructurado</SelectItem>
          <SelectItem value="call">Llamada</SelectItem>
        </SelectContent>
      </Select>

      {tipo === "sitelink" && (
        <div className="space-y-2">
          <Input
            value={linkText}
            onChange={(e) => setLinkText(e.target.value.slice(0, 25))}
            placeholder="Texto visible (máx. 25 caracteres)"
            className="bg-field/60"
          />
          <Input
            value={finalUrl}
            onChange={(e) => setFinalUrl(e.target.value)}
            placeholder="https://tusitio.com/destino"
            className="bg-field/60"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={descripcion1}
              onChange={(e) => setDescripcion1(e.target.value.slice(0, 35))}
              placeholder="Descripción 1 (opcional)"
              className="bg-field/60"
            />
            <Input
              value={descripcion2}
              onChange={(e) => setDescripcion2(e.target.value.slice(0, 35))}
              placeholder="Descripción 2 (opcional)"
              className="bg-field/60"
            />
          </div>
        </div>
      )}
      {tipo === "callout" && (
        <Input
          value={calloutText}
          onChange={(e) => setCalloutText(e.target.value.slice(0, 25))}
          placeholder="Ej. Envío gratis (máx. 25 caracteres)"
          className="bg-field/60"
        />
      )}
      {tipo === "structured_snippet" && (
        <div className="space-y-2">
          <Select value={header} onValueChange={setHeader}>
            <SelectTrigger className="w-full bg-field/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CABECERAS_SNIPPET.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={valores}
            onChange={(e) => setValores(e.target.value)}
            placeholder="3 a 10 valores separados por coma"
            className="bg-field/60"
          />
        </div>
      )}
      {tipo === "call" && (
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <Input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="(650) 253-0000"
            className="bg-field/60"
          />
          <Input
            value={paisTelefono}
            onChange={(e) => setPaisTelefono(e.target.value.slice(0, 2))}
            placeholder="CL"
            className="bg-field/60"
          />
        </div>
      )}

      <Button onClick={() => void guardar()} disabled={enviando}>
        {enviando ? <OrbeDeBoton /> : null}
        Añadir extensión
      </Button>
      <p className="text-[0.65rem] leading-5 text-foreground/35">
        Cada clic añade una extensión más a la campaña — no reemplaza las que
        ya existen. Los sitelinks y la llamada pasan por la revisión de
        políticas de Google antes de mostrarse.
      </p>
    </div>
  );
}
