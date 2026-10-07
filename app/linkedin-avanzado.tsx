"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CampaignDraft } from "@/lib/constructor";
import { LINKEDIN_GEO_IDS, OBJETIVO_LINKEDIN, type IntencionPolitica, type LinkedinDraft } from "@/lib/constructor-linkedin";
import { Campo, Seccion } from "./constructor-ui";

type Cambios = Partial<CampaignDraft>;

const numero = (v: string): number | null => {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

const INTENCIONES: Record<IntencionPolitica, { etiqueta: string; detalle: string }> = {
  NOT_POLITICAL: { etiqueta: "No es publicidad política", detalle: "Confirmo que ninguno de los anuncios califica como publicidad política." },
  POLITICAL: { etiqueta: "Es publicidad política", detalle: "Los anuncios son políticos según la ley de los países segmentados." },
  NOT_DECLARED: { etiqueta: "Sin declarar", detalle: "LinkedIn lo permite, pero para segmentar la Unión Europea hay que confirmar que no es política." },
};

/**
 * Lo que LinkedIn pide y los demás no: la declaración política (legal, sin valor por defecto), la página que firma, la puja
 * y, si hace falta, ubicaciones a mano. Se pone junto al resto de ajustes de la campaña, como «Solo Meta» y «Solo Google».
 */
export function CampanaDeLinkedin({
  draft,
  onChange,
  moneda,
  paginaDeLaCuenta,
}: {
  draft: CampaignDraft;
  onChange: (c: Cambios) => void;
  moneda: string | null;
  paginaDeLaCuenta: string | null;
}) {
  const li = draft.linkedin;
  const cambiar = (c: Partial<LinkedinDraft>) => onChange({ linkedin: { ...li, ...c } });
  const tipoPorObjetivo = OBJETIVO_LINKEDIN[draft.objectiveByPlatform.linkedin ?? draft.objective]?.tipoCosto ?? "CPC";
  const paises = draft.targetCountries;
  const sinIdDePais = paises.filter((p) => !LINKEDIN_GEO_IDS[p]);

  return (
    <>
      <div className="flex items-baseline gap-2 pt-3">
        <h4 className="font-micro text-[0.65rem] tracking-wide text-foreground/60">SOLO LINKEDIN</h4>
        <span className="hidden text-[0.68rem] text-foreground/40 sm:inline">Declaración, página, puja y ubicaciones</span>
        <span className="h-px flex-1 bg-foreground/10" />
      </div>

      <Seccion titulo="Publicidad política" soloPlataforma="LinkedIn" completa={li.intencionPolitica !== ""}>
        <Select value={li.intencionPolitica || undefined} onValueChange={(value) => cambiar({ intencionPolitica: value as IntencionPolitica })}>
          <SelectTrigger className="w-full bg-field/60 sm:w-80">
            <SelectValue placeholder="Elige una declaración…" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(INTENCIONES) as IntencionPolitica[]).map((key) => (
              <SelectItem key={key} value={key}>
                {INTENCIONES[key].etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
          {li.intencionPolitica
            ? INTENCIONES[li.intencionPolitica].detalle
            : "LinkedIn exige esta declaración al crear una campaña. Es una declaración legal del anunciante: WiWO.ADS no la completa por ti."}
        </p>
      </Seccion>

      <Seccion titulo="Página y puja" soloPlataforma="LinkedIn" completa={li.costoUnitario !== null && (li.organizacionId !== "" || Boolean(paginaDeLaCuenta))}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="PÁGINA DE EMPRESA (ID)">
            <Input
              inputMode="numeric"
              value={li.organizacionId}
              onChange={(e) => cambiar({ organizacionId: e.target.value.replace(/\D/g, "").slice(0, 15) })}
              placeholder={paginaDeLaCuenta ? `La de la cuenta: ${paginaDeLaCuenta}` : "Ej. 329866"}
              className="bg-field/60"
            />
          </Campo>
          <Campo etiqueta={`COSTO POR ${(li.tipoCosto || tipoPorObjetivo) === "CPC" ? "CLIC" : "MIL IMPRESIONES"}${moneda ? ` (${moneda})` : ""}`}>
            <Input
              inputMode="decimal"
              value={li.costoUnitario ?? ""}
              onChange={(e) => cambiar({ costoUnitario: numero(e.target.value) })}
              placeholder="Obligatorio"
              className="bg-field/60"
            />
          </Campo>
          <Campo etiqueta="TIPO DE COSTO">
            <Select value={li.tipoCosto || "auto"} onValueChange={(value) => cambiar({ tipoCosto: value === "auto" ? "" : (value as "CPC" | "CPM") })}>
              <SelectTrigger className="w-full bg-field/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Según el objetivo ({tipoPorObjetivo})</SelectItem>
                <SelectItem value="CPC">Por clic (CPC)</SelectItem>
                <SelectItem value="CPM">Por mil impresiones (CPM)</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
        </div>
        <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
          La página firma la campaña y debe ser la de la cuenta publicitaria; quien publica necesita un rol sobre ella. La puja es lo que se paga por
          cada clic o por cada mil impresiones: LinkedIn la exige y WiWO.ADS no la inventa.
        </p>
      </Seccion>

      <Seccion titulo="Ubicaciones de LinkedIn" soloPlataforma="LinkedIn" completa>
        <Campo etiqueta="IDS DE UBICACIÓN · OPCIONAL" className="sm:w-96">
          <Input
            value={li.ubicacionesGeo.join(", ")}
            onChange={(e) => cambiar({ ubicacionesGeo: e.target.value.split(/[\s,]+/).filter((id) => /^\d{1,15}$/.test(id)) })}
            placeholder="Vacío: los países elegidos"
            className="bg-field/60"
          />
        </Campo>
        <p className="mt-2 text-[0.68rem] leading-5 text-foreground/40">
          {li.ubicacionesGeo.length > 0
            ? "Se usarán estas ubicaciones en lugar de los países."
            : sinIdDePais.length > 0
              ? `No tengo el id de LinkedIn para ${sinIdDePais.join(", ")}: escríbelo aquí, o no se segmenta a ciegas.`
              : "Se usan los países elegidos. LinkedIn segmenta por país aquí: las comunas y el radio del mapa no se envían."}
        </p>
        {paises.length === 0 && <p className="mt-1 text-[0.68rem] leading-5 text-foreground/40">Aún no hay países elegidos.</p>}
      </Seccion>
    </>
  );
}
