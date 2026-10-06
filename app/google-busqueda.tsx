"use client";

import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONFIG_BUSQUEDA_POR_DEFECTO, type CampaignDraft, type ConfigBusquedaGoogle } from "@/lib/constructor";
import { cn } from "@/lib/utils";
import { Campo, Seccion } from "./constructor-ui";

type Cambios = Partial<CampaignDraft>;

const DIAS: Array<{ id: ConfigBusquedaGoogle["programacion"][number]["dias"][number]; corto: string }> = [
  { id: "MONDAY", corto: "L" },
  { id: "TUESDAY", corto: "M" },
  { id: "WEDNESDAY", corto: "X" },
  { id: "THURSDAY", corto: "J" },
  { id: "FRIDAY", corto: "V" },
  { id: "SATURDAY", corto: "S" },
  { id: "SUNDAY", corto: "D" },
];

/** Encabezados que Google admite en un fragmento estructurado (en español, como los muestra su interfaz). */
const ENCABEZADOS_DE_FRAGMENTO = ["Servicios", "Marcas", "Modelos", "Tipos", "Estilos", "Destinos", "Cursos", "Barrios", "Comodidades", "Programas de estudio", "Categorías", "Facilidades"];

const numero = (v: string): number | null => {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

function useConfig(draft: CampaignDraft, onChange: (c: Cambios) => void) {
  const cfg = draft.googleBusqueda ?? CONFIG_BUSQUEDA_POR_DEFECTO;
  return { cfg, fijar: (cambios: Partial<ConfigBusquedaGoogle>) => onChange({ googleBusqueda: { ...cfg, ...cambios } }) };
}

const OPCIONES_DE_PUJA: Array<{ id: ConfigBusquedaGoogle["puja"]; titulo: string; detalle: string }> = [
  { id: "auto", titulo: "Automática según el objetivo", detalle: "Conversiones si el cliente las mide; si no, clics. Es lo recomendado para empezar." },
  { id: "clics", titulo: "Maximizar clics", detalle: "Consigue los clics que permita el presupuesto. Puedes fijar un CPC máximo." },
  { id: "conversiones", titulo: "Maximizar conversiones", detalle: "Optimiza para el mayor número de conversiones. Puedes fijar un CPA objetivo." },
  { id: "valor_conversion", titulo: "Maximizar el valor de conversión", detalle: "Optimiza para el mayor valor (ventas). Puedes fijar un ROAS objetivo." },
  { id: "cpc_manual", titulo: "CPC manual", detalle: "Tú decides cuánto pagar por clic en cada grupo y palabra clave." },
  { id: "cuota_impresiones", titulo: "Cuota de impresiones objetivo", detalle: "Aparece en una posición de la página un porcentaje de las veces." },
];

/** Ajustes de CAMPAÑA de Google (Búsqueda): puja, redes, presencia, programación, fechas y seguimiento. */
export function CampanaGoogleBusqueda({ draft, onChange, moneda }: { draft: CampaignDraft; onChange: (c: Cambios) => void; moneda: string | null }) {
  const { cfg, fijar } = useConfig(draft, onChange);
  const sufijo = moneda ? ` (${moneda})` : "";
  return (
    <>
      <Seccion titulo="Puja" soloPlataforma="Google" completa>
        <div className="space-y-2">
          {OPCIONES_DE_PUJA.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => fijar({ puja: o.id })}
              className={cn("block w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors", cfg.puja === o.id ? "border-brand bg-brand/10" : "border-foreground/10 hover:border-foreground/25")}
            >
              <span className="block text-xs font-bold text-foreground">{o.titulo}</span>
              <span className="mt-0.5 block text-[0.68rem] leading-5 text-foreground/50">{o.detalle}</span>
            </button>
          ))}
        </div>
        {(cfg.puja === "clics" || cfg.puja === "cuota_impresiones") && (
          <Campo etiqueta={`CPC MÁXIMO${sufijo}${cfg.puja === "cuota_impresiones" ? " · OBLIGATORIO" : " · OPCIONAL"}`} className="mt-3 sm:w-64">
            <Input inputMode="decimal" value={cfg.cpcMaximo ?? ""} onChange={(e) => fijar({ cpcMaximo: numero(e.target.value) })} className="bg-field/60" />
          </Campo>
        )}
        {cfg.puja === "conversiones" && (
          <Campo etiqueta={`CPA OBJETIVO${sufijo} · OPCIONAL`} className="mt-3 sm:w-64">
            <Input inputMode="decimal" value={cfg.cpaObjetivo ?? ""} onChange={(e) => fijar({ cpaObjetivo: numero(e.target.value) })} className="bg-field/60" />
          </Campo>
        )}
        {cfg.puja === "valor_conversion" && (
          <Campo etiqueta="ROAS OBJETIVO (EJ. 4 = 400 %) · OPCIONAL" className="mt-3 sm:w-64">
            <Input inputMode="decimal" value={cfg.roasObjetivo ?? ""} onChange={(e) => fijar({ roasObjetivo: numero(e.target.value) })} className="bg-field/60" />
          </Campo>
        )}
        {cfg.puja === "cpc_manual" && (
          <label className="mt-3 flex items-center gap-2 text-xs text-foreground/70">
            <input type="checkbox" checked={cfg.mejorarCpc} onChange={(e) => fijar({ mejorarCpc: e.target.checked })} />
            Mejorar el CPC (Google ajusta tu puja cuando es más probable que convierta)
          </label>
        )}
        {cfg.puja === "cuota_impresiones" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="DÓNDE APARECER">
              <select className="h-10 w-full rounded-lg border border-border bg-field/60 px-2 text-sm" value={cfg.cuotaUbicacion} onChange={(e) => fijar({ cuotaUbicacion: e.target.value as ConfigBusquedaGoogle["cuotaUbicacion"] })}>
                <option value="ANYWHERE_ON_PAGE">En cualquier parte de la página</option>
                <option value="TOP_OF_PAGE">En la parte superior</option>
                <option value="ABSOLUTE_TOP_OF_PAGE">En la posición más alta</option>
              </select>
            </Campo>
            <Campo etiqueta="CUOTA OBJETIVO (%)">
              <Input inputMode="numeric" value={cfg.cuotaPorcentaje} onChange={(e) => fijar({ cuotaPorcentaje: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })} className="bg-field/60" />
            </Campo>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Redes" soloPlataforma="Google" completa>
        <div className="space-y-2 text-xs text-foreground/75">
          <label className="flex items-center gap-2"><input type="checkbox" checked disabled /> Búsqueda de Google (siempre incluida)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.redSocios} onChange={(e) => fijar({ redSocios: e.target.checked })} /> Incluir socios de búsqueda de Google</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.redDisplay} onChange={(e) => fijar({ redDisplay: e.target.checked })} /> Incluir la Red de Display de Google</label>
        </div>
        <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">Google recomienda dejar la Red de Display desmarcada en campañas de Búsqueda: el rendimiento y el presupuesto se reparten distinto.</p>
        <Campo etiqueta="OPCIONES DE UBICACIÓN" className="mt-3">
          <div className="space-y-1.5 text-xs text-foreground/75">
            <label className="flex items-start gap-2"><input type="radio" className="mt-0.5" checked={cfg.presencia === "presencia"} onChange={() => fijar({ presencia: "presencia" })} /><span><b>Presencia</b>: personas que están en las ubicaciones elegidas (recomendado).</span></label>
            <label className="flex items-start gap-2"><input type="radio" className="mt-0.5" checked={cfg.presencia === "presencia_o_interes"} onChange={() => fijar({ presencia: "presencia_o_interes" })} /><span><b>Presencia o interés</b>: también quienes muestran interés en esas ubicaciones.</span></label>
          </div>
        </Campo>
      </Seccion>

      <Seccion titulo="Programación de anuncios" soloPlataforma="Google" completa>
        <p className="text-[0.68rem] leading-5 text-foreground/45">Sin programación, los anuncios salen todos los días a cualquier hora. Añade bloques para limitarlos o ajustar la puja.</p>
        <div className="mt-2 space-y-2">
          {cfg.programacion.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-foreground/10 p-2.5">
              <div className="flex gap-1">
                {DIAS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => fijar({ programacion: cfg.programacion.map((x, j) => (j === i ? { ...x, dias: x.dias.includes(d.id) ? x.dias.filter((y) => y !== d.id) : [...x.dias, d.id] } : x)) })}
                    className={cn("size-7 rounded-full border text-[0.68rem] font-bold", b.dias.includes(d.id) ? "border-brand bg-brand/12 text-foreground" : "border-foreground/12 text-foreground/45")}
                  >
                    {d.corto}
                  </button>
                ))}
              </div>
              <Input inputMode="numeric" aria-label="Desde la hora" value={b.desde} onChange={(e) => fijar({ programacion: cfg.programacion.map((x, j) => (j === i ? { ...x, desde: Math.min(23, Math.max(0, Number(e.target.value) || 0)) } : x)) })} className="h-8 w-14 bg-field/60 text-center" />
              <span className="text-xs text-foreground/45">a</span>
              <Input inputMode="numeric" aria-label="Hasta la hora" value={b.hasta} onChange={(e) => fijar({ programacion: cfg.programacion.map((x, j) => (j === i ? { ...x, hasta: Math.min(24, Math.max(1, Number(e.target.value) || 1)) } : x)) })} className="h-8 w-14 bg-field/60 text-center" />
              <span className="text-xs text-foreground/45">h · puja ×</span>
              <Input inputMode="decimal" aria-label="Ajuste de puja" placeholder="1" value={b.ajuste ?? ""} onChange={(e) => fijar({ programacion: cfg.programacion.map((x, j) => (j === i ? { ...x, ajuste: numero(e.target.value) } : x)) })} className="h-8 w-16 bg-field/60 text-center" />
              <button type="button" aria-label="Quitar bloque" onClick={() => fijar({ programacion: cfg.programacion.filter((_, j) => j !== i) })} className="ml-auto text-foreground/40 hover:text-danger"><X className="size-4" /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => fijar({ programacion: [...cfg.programacion, { dias: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"], desde: 9, hasta: 18, ajuste: null }] })} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          <Plus className="size-3.5" /> Añadir bloque horario
        </button>
      </Seccion>

      <Seccion titulo="Fechas y seguimiento" soloPlataforma="Google" completa>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="FECHA DE INICIO (VACÍO: HOY)">
            <Input type="date" value={cfg.inicio ?? ""} onChange={(e) => fijar({ inicio: e.target.value || null })} className="bg-field/60" />
          </Campo>
          <Campo etiqueta="ROTACIÓN DE ANUNCIOS">
            <select className="h-10 w-full rounded-lg border border-border bg-field/60 px-2 text-sm" value={cfg.rotacion} onChange={(e) => fijar({ rotacion: e.target.value as ConfigBusquedaGoogle["rotacion"] })}>
              <option value="optimizar">Optimizar: priorizar los de mejor rendimiento</option>
              <option value="indefinida">Rotar indefinidamente</option>
            </select>
          </Campo>
        </div>
        <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">La fecha de fin se define en «Presupuesto y calendario».</p>
        <Campo etiqueta="PLANTILLA DE URL DE SEGUIMIENTO (OPCIONAL)" className="mt-3">
          <Input value={cfg.plantillaSeguimiento} onChange={(e) => fijar({ plantillaSeguimiento: e.target.value })} placeholder="{lpurl}?utm_source=google" className="bg-field/60" />
        </Campo>
        <Campo etiqueta="SUFIJO DE URL FINAL (OPCIONAL)" className="mt-3">
          <Input value={cfg.sufijoUrl} onChange={(e) => fijar({ sufijoUrl: e.target.value })} placeholder="utm_campaign=verano" className="bg-field/60" />
        </Campo>
      </Seccion>
    </>
  );
}

/** Ajustes del GRUPO DE ANUNCIOS de Google: nombre y puja del grupo (las palabras clave van aparte). */
export function GrupoGoogleBusqueda({ draft, onChange, moneda }: { draft: CampaignDraft; onChange: (c: Cambios) => void; moneda: string | null }) {
  const { cfg, fijar } = useConfig(draft, onChange);
  return (
    <Seccion titulo="Grupo de anuncios" soloPlataforma="Google" completa>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="NOMBRE DEL GRUPO (OPCIONAL)">
          <Input value={cfg.grupoNombre} onChange={(e) => fijar({ grupoNombre: e.target.value })} placeholder="Se arma solo si lo dejas vacío" className="bg-field/60" />
        </Campo>
        <Campo etiqueta={`CPC DEL GRUPO${moneda ? ` (${moneda})` : ""} · OPCIONAL`}>
          <Input inputMode="decimal" value={cfg.cpcGrupo ?? ""} onChange={(e) => fijar({ cpcGrupo: numero(e.target.value) })} className="bg-field/60" />
        </Campo>
      </div>
      <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">El CPC del grupo se usa con «CPC manual». Con una puja automática Google lo ignora.</p>
    </Seccion>
  );
}

/** Recursos del anuncio de Google: enlaces de sitio, textos destacados, fragmento estructurado y llamada. */
export function RecursosGoogleBusqueda({ draft, onChange }: { draft: CampaignDraft; onChange: (c: Cambios) => void }) {
  const { cfg, fijar } = useConfig(draft, onChange);
  return (
    <Seccion titulo="Recursos del anuncio" soloPlataforma="Google" completa>
      <p className="text-[0.68rem] leading-5 text-foreground/45">Los recursos hacen más grande tu anuncio. Todos son opcionales; Google decide cuándo mostrarlos.</p>

      <p className="font-micro mt-3 text-[0.6rem] text-foreground/50">ENLACES DE SITIO</p>
      <div className="mt-1.5 space-y-2">
        {cfg.enlaces.map((e, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-foreground/10 p-2.5 sm:grid-cols-2">
            <Input placeholder="Texto (máx. 25)" maxLength={25} value={e.texto} onChange={(ev) => fijar({ enlaces: cfg.enlaces.map((x, j) => (j === i ? { ...x, texto: ev.target.value } : x)) })} className="h-9 bg-field/60" />
            <Input placeholder="https://… (URL final del enlace)" value={e.url} onChange={(ev) => fijar({ enlaces: cfg.enlaces.map((x, j) => (j === i ? { ...x, url: ev.target.value } : x)) })} className="h-9 bg-field/60" />
            <Input placeholder="Descripción 1 (máx. 35)" maxLength={35} value={e.descripcion1} onChange={(ev) => fijar({ enlaces: cfg.enlaces.map((x, j) => (j === i ? { ...x, descripcion1: ev.target.value } : x)) })} className="h-9 bg-field/60" />
            <div className="flex gap-2">
              <Input placeholder="Descripción 2 (máx. 35)" maxLength={35} value={e.descripcion2} onChange={(ev) => fijar({ enlaces: cfg.enlaces.map((x, j) => (j === i ? { ...x, descripcion2: ev.target.value } : x)) })} className="h-9 bg-field/60" />
              <button type="button" aria-label="Quitar enlace" onClick={() => fijar({ enlaces: cfg.enlaces.filter((_, j) => j !== i) })} className="text-foreground/40 hover:text-danger"><X className="size-4" /></button>
            </div>
          </div>
        ))}
      </div>
      {cfg.enlaces.length < 6 && (
        <button type="button" onClick={() => fijar({ enlaces: [...cfg.enlaces, { texto: "", descripcion1: "", descripcion2: "", url: draft.landingUrl }] })} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          <Plus className="size-3.5" /> Añadir enlace de sitio
        </button>
      )}
      <p className="mt-1 text-[0.68rem] leading-5 text-foreground/40">Las dos descripciones van juntas: pon ambas o ninguna.</p>

      <Campo etiqueta="TEXTOS DESTACADOS · UNO POR LÍNEA, MÁX. 25 CARACTERES" className="mt-4">
        <Textarea rows={3} value={cfg.destacados.join("\n")} onChange={(e) => fijar({ destacados: e.target.value.split("\n").map((x) => x.slice(0, 25)) })} placeholder={"Envío gratis\nAtención 24/7"} className="bg-field/60 field-sizing-fixed max-h-28 resize-none overflow-y-auto" />
      </Campo>

      <p className="font-micro mt-4 text-[0.6rem] text-foreground/50">FRAGMENTO ESTRUCTURADO</p>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        <select className="h-9 rounded-lg border border-border bg-field/60 px-2 text-sm" value={cfg.fragmentoEncabezado} onChange={(e) => fijar({ fragmentoEncabezado: e.target.value })}>
          <option value="">Sin fragmento</option>
          {ENCABEZADOS_DE_FRAGMENTO.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <Textarea rows={3} value={cfg.fragmentoValores.join("\n")} onChange={(e) => fijar({ fragmentoValores: e.target.value.split("\n").map((x) => x.slice(0, 25)) })} placeholder={"Un valor por línea (mínimo 3)"} className="bg-field/60 field-sizing-fixed max-h-24 resize-none overflow-y-auto" />
      </div>

      <p className="font-micro mt-4 text-[0.6rem] text-foreground/50">LLAMADA</p>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-[6rem_1fr]">
        <Input placeholder="País (CL)" maxLength={2} value={cfg.llamadaPais} onChange={(e) => fijar({ llamadaPais: e.target.value.toUpperCase() })} className="h-9 bg-field/60" />
        <Input placeholder="Teléfono (+56 2 1234 5678)" value={cfg.llamadaTelefono} onChange={(e) => fijar({ llamadaTelefono: e.target.value })} className="h-9 bg-field/60" />
      </div>
    </Seccion>
  );
}
