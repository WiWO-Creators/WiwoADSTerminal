"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ImageOff, Sparkles } from "lucide-react";

import { OBJETIVO_LABELS } from "@/lib/objetivos";
import type { AdSummary, CampaignSummary } from "@/lib/performance-store";
import { platformLabel } from "@/lib/plataformas";
import { cn } from "@/lib/utils";
import {
  dinero,
  entradasDeAnuncios,
  entradasDeCampanas,
  MIN_IMPRESIONES,
  rankear,
  type ItemDeRanking,
} from "@/lib/mejores-peores-pura";
import { Tarjeta } from "./medicion-panel";

/**
 * Lo mejor y lo que peor va en un cliente: las 3 mejores y las 3 peores campañas, y lo mismo con los anuncios, cada una con su
 * porqué. Para decidir qué replicar y qué cortar. Los anuncios se leen aparte (son muchos); las campañas ya vienen en el tablero.
 */

const n = (v: number) => Math.round(v).toLocaleString("es-CL");

function Item({ item, posicion, bueno }: { item: ItemDeRanking; posicion: number; bueno: boolean }) {
  const [sinMiniatura, setSinMiniatura] = useState(false);
  const pedirAlOrb = () => {
    const que = item.tipo === "campana" ? "la campaña" : "el anuncio";
    const texto = bueno
      ? `Analiza por qué ${que} «${item.nombre}» (${platformLabel(item.provider)}, cuenta ${item.cuenta}${item.campana ? `, campaña «${item.campana}»` : ""}) rinde mejor que sus pares y dime cómo replicarlo en pocas líneas. No apliques nada.`
      : `Analiza por qué ${que} «${item.nombre}» (${platformLabel(item.provider)}, cuenta ${item.cuenta}${item.campana ? `, campaña «${item.campana}»` : ""}) rinde peor que sus pares y dime qué conviene cambiar o si conviene pausarlo, en pocas líneas. No apliques nada.`;
    window.dispatchEvent(new CustomEvent("wiwo:orb-pedir", { detail: { decisionId: "", texto } }));
  };
  return (
    <li className="flex gap-3 rounded-xl border border-foreground/10 bg-card/50 p-3">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
          bueno ? "bg-brand/20 text-brand" : "bg-danger/15 text-danger",
        )}
      >
        {posicion}
      </span>
      {item.tipo === "anuncio" && (
        <span className="hidden size-14 shrink-0 overflow-hidden rounded-lg bg-foreground/6 sm:flex sm:items-center sm:justify-center">
          {item.miniatura && !sinMiniatura ? (
            // Las miniaturas de Meta son firmadas y pueden caducar: si no cargan, queda el ícono.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.miniatura} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setSinMiniatura(true)} />
          ) : (
            <ImageOff className="size-4 text-foreground/30" />
          )}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div>
          <p className="truncate text-sm font-bold text-foreground" title={item.nombre}>
            {item.nombre}
          </p>
          <p className="truncate text-[0.7rem] text-foreground/50" title={item.campana ?? item.cuenta}>
            {item.campana ? `${item.campana} · ` : ""}
            {item.cuenta} · {platformLabel(item.provider).replace(" Ads", "")}
            {item.objetivo ? ` · ${OBJETIVO_LABELS[item.objetivo]}` : ""}
          </p>
        </div>
        <p className="text-xs tabular-nums text-foreground/65">
          {dinero(item.gasto, item.moneda)} invertidos
          {item.resultado !== null ? ` · ${n(item.resultado)} resultados` : ""}
          {item.costo !== null ? ` · ${dinero(item.costo, item.moneda)} c/u` : ""}
          {item.ctr !== null ? ` · CTR ${item.ctr.toLocaleString("es-CL", { maximumFractionDigits: 2 })} %` : ""}
        </p>
        <p className="text-xs leading-5 text-foreground/80">
          <strong className={bueno ? "text-brand" : "text-danger"}>Por qué: </strong>
          {item.porQue}
        </p>
        <button type="button" onClick={pedirAlOrb} className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-brand hover:underline">
          <Sparkles className="size-3" />
          {bueno ? "Pedirle al Orb cómo replicarlo" : "Pedirle al Orb qué cambiar"}
        </button>
      </div>
    </li>
  );
}

function Lista({ titulo, items, bueno, vacio }: { titulo: string; items: ItemDeRanking[]; bueno: boolean; vacio: string }) {
  return (
    <div className="space-y-2">
      <h5 className="text-[0.7rem] font-bold uppercase tracking-wide text-foreground/50">{titulo}</h5>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-foreground/10 px-3 py-4 text-center text-xs text-foreground/50">{vacio}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <Item key={`${it.tipo}-${it.id}`} item={it} posicion={i + 1} bueno={bueno} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function MejoresYPeores({
  anuncios,
  cargandoAnuncios,
  campanas,
  cuentas,
  periodo,
}: {
  /** Los anuncios del cliente, ya leídos por el tablero. */
  anuncios: AdSummary[];
  cargandoAnuncios: boolean;
  campanas: CampaignSummary[];
  cuentas: Array<{ id: string; name: string }>;
  periodo: string;
}) {
  const delCliente = useMemo(() => {
    const cuentas = new Set(campanas.map((c) => c.accountKey));
    return anuncios.filter((a) => cuentas.has(a.accountKey));
  }, [anuncios, campanas]);

  const nombreDeCuenta = useMemo(() => {
    const por = new Map(cuentas.map((c) => [c.id, c.name]));
    return (id: string, porDefecto: string) => por.get(id) ?? porDefecto;
  }, [cuentas]);
  const topCampanas = useMemo(() => rankear(entradasDeCampanas(campanas, nombreDeCuenta)), [campanas, nombreDeCuenta]);
  const topAnuncios = useMemo(() => rankear(entradasDeAnuncios(delCliente, nombreDeCuenta, campanas)), [delCliente, nombreDeCuenta, campanas]);

  const vacioCampanas = `No hay campañas comparables: hacen falta al menos 2 del mismo objetivo y plataforma, con ${MIN_IMPRESIONES.toLocaleString("es-CL")} impresiones o más.`;
  const vacioAnuncios = cargandoAnuncios
    ? "Leyendo los anuncios del cliente en la plataforma (puede tardar un par de minutos)…"
    : anuncios.length === 0
      ? "No se pudieron leer los anuncios en este momento."
      : `No hay anuncios comparables: hacen falta al menos 2 del mismo objetivo y plataforma, con ${MIN_IMPRESIONES.toLocaleString("es-CL")} impresiones o más.`;

  return (
    <section className="mb-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-foreground">Lo mejor y lo que peor va · {periodo}</h3>
        <p className="mt-0.5 text-xs leading-5 text-foreground/55">
          Cada campaña y anuncio se compara con sus pares: mismo objetivo, misma plataforma y misma moneda (por costo por resultado; si el
          objetivo no trae resultados medidos, por CTR). Para decidir qué replicar y qué cortar.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Tarjeta className="space-y-4 !bg-none !border-brand/25">
          <h4 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-brand">
            <ArrowUpRight className="size-4" /> Lo que mejor va
          </h4>
          <Lista titulo="Top 3 campañas" items={topCampanas.mejores} bueno vacio={vacioCampanas} />
          <Lista titulo="Top 3 anuncios" items={topAnuncios.mejores} bueno vacio={vacioAnuncios} />
        </Tarjeta>
        <Tarjeta className="space-y-4 !bg-none !border-danger/25">
          <h4 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-danger">
            <ArrowDownRight className="size-4" /> Lo que peor va
          </h4>
          <Lista titulo="Top 3 campañas" items={topCampanas.peores} bueno={false} vacio={vacioCampanas} />
          <Lista titulo="Top 3 anuncios" items={topAnuncios.peores} bueno={false} vacio={vacioAnuncios} />
        </Tarjeta>
      </div>
    </section>
  );
}
