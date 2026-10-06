"use client";

import { Input } from "@/components/ui/input";
import {
  atribucionesAdmitidas,
  META_ATTRIBUTION,
  META_BID_STRATEGIES,
  type CampaignDraft,
  type MetaAttribution,
  type MetaBidStrategy,
} from "@/lib/constructor";
import { objetivoDe } from "@/lib/constructor";
import { cn } from "@/lib/utils";
import { Campo, Seccion } from "./constructor-ui";

type Cambios = Partial<CampaignDraft>;

const numero = (v: string): number | null => {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

/** «Límite de gasto de la campaña» de Meta: la campaña deja de entregar al llegar a este total. */
export function LimiteDeGastoMeta({ draft, onChange, moneda }: { draft: CampaignDraft; onChange: (c: Cambios) => void; moneda: string | null }) {
  return (
    <Seccion titulo="Límite de gasto de la campaña" soloPlataforma="Meta" completa>
      <Campo etiqueta={`LÍMITE DE GASTO${moneda ? ` (${moneda})` : ""} · OPCIONAL`} className="sm:w-64">
        <Input inputMode="decimal" value={draft.metaSpendCap ?? ""} onChange={(e) => onChange({ metaSpendCap: numero(e.target.value) })} placeholder="Sin límite" className="bg-field/60" />
      </Campo>
      <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
        Es un tope sobre todo lo que gaste la campaña durante su vida: al alcanzarlo, Meta deja de entregar aunque queden días. Se aplica justo después de crearla.
      </p>
    </Seccion>
  );
}

/** «Optimización y entrega» del conjunto de anuncios de Meta: estrategia de puja, control de costo y atribución. */
export function OptimizacionMeta({ draft, onChange, moneda }: { draft: CampaignDraft; onChange: (c: Cambios) => void; moneda: string | null }) {
  const estrategia = META_BID_STRATEGIES[draft.metaBidStrategy];
  const esRoas = draft.metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS";
  return (
    <Seccion titulo="Optimización y entrega" soloPlataforma="Meta" completa>
      <p className="font-micro text-[0.6rem] text-foreground/50">ESTRATEGIA DE PUJA</p>
      <div className="mt-1.5 space-y-2">
        {(Object.keys(META_BID_STRATEGIES) as MetaBidStrategy[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange({ metaBidStrategy: id, metaBidAmount: META_BID_STRATEGIES[id].pideImporte ? draft.metaBidAmount : null })}
            className={cn("block w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors", draft.metaBidStrategy === id ? "border-brand bg-brand/10" : "border-foreground/10 hover:border-foreground/25")}
          >
            <span className="block text-xs font-bold text-foreground">{META_BID_STRATEGIES[id].label}</span>
            <span className="mt-0.5 block text-[0.68rem] leading-5 text-foreground/50">{META_BID_STRATEGIES[id].detalle}</span>
          </button>
        ))}
      </div>
      {estrategia.pideImporte && (
        <Campo etiqueta={esRoas ? "ROAS MÍNIMO (EJ. 2,5)" : `IMPORTE${moneda ? ` (${moneda})` : ""} · OBLIGATORIO`} className="mt-3 sm:w-64">
          <Input inputMode="decimal" value={draft.metaBidAmount ?? ""} onChange={(e) => onChange({ metaBidAmount: numero(e.target.value) })} className="bg-field/60" />
        </Campo>
      )}
      <Campo etiqueta="VENTANA DE ATRIBUCIÓN" className="mt-4">
        <select
          className="h-10 w-full rounded-lg border border-border bg-field/60 px-2 text-sm"
          value={draft.metaAttribution}
          onChange={(e) => onChange({ metaAttribution: e.target.value as MetaAttribution })}
        >
          {atribucionesAdmitidas(objetivoDe(draft, "meta")).map((id) => (
            <option key={id} value={id}>{META_ATTRIBUTION[id].label}</option>
          ))}
        </select>
      </Campo>
      <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
        Define cuánto tiempo después de ver o hacer clic en el anuncio se cuenta un resultado. No cambia a quién se muestra, solo cómo se mide.
      </p>
    </Seccion>
  );
}
