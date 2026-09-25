"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ESTRATEGIAS, PROPORCIONES } from "@/lib/formatos-creativos";
import { ThinkingOrb } from "./ui";

const LISTA_PROPORCIONES = Object.entries(PROPORCIONES).map(([id, v]) => ({ id, ...v }));
const LISTA_ESTRATEGIAS = Object.entries(ESTRATEGIAS).map(([id, v]) => ({ id, ...v }));

/**
 * Genera, con IA (Gemini), una variante de formato de la pieza ya cargada —
 * para no tener que rediagramar a mano cada proporción que pide cada
 * ubicación (ver Guia_Meta-Ads_y_Google-Ads.md, 2.5). Solo Meta: Google no
 * tiene ningún anuncio con imagen por esta vía.
 *
 * No reemplaza la pieza actual por su cuenta — igual que el Copiloto de
 * creativos, la persona ve el resultado y decide si lo usa.
 */
export function GeneradorDeVariantes({
  portfolioId,
  mediaUrl,
  onUsar,
}: {
  portfolioId: string;
  mediaUrl: string;
  onUsar: (url: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [proporcion, setProporcion] = useState("4:5");
  const [estrategia, setEstrategia] = useState("adapt");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  async function generar() {
    setCargando(true);
    setError(null);
    setResultado(null);
    try {
      const response = await fetch("/api/creatividades/generar-variante", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portfolioId, sourceUrl: mediaUrl, proporcion, estrategia }),
      });
      const body = (await response.json()) as { error?: string; url?: string };
      if (!response.ok || !body.url) throw new Error(body.error ?? "No se pudo generar la variante");
      setResultado(body.url);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "No se pudo generar la variante");
    } finally {
      setCargando(false);
    }
  }

  if (!mediaUrl) return null;

  return (
    <div className="mt-3 rounded-xl border border-dashed border-border p-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-bold text-brand"
      >
        <Wand2 className="size-3.5" />
        Generar variante de formato
      </button>

      {abierto && (
        <div className="mt-2.5 space-y-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={proporcion} onValueChange={setProporcion}>
              <SelectTrigger className="bg-field/60 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LISTA_PROPORCIONES.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={estrategia} onValueChange={setEstrategia}>
              <SelectTrigger className="bg-field/60 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LISTA_ESTRATEGIAS.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[0.68rem] leading-4 text-foreground/45">
            {LISTA_PROPORCIONES.find((p) => p.id === proporcion)?.nota} ·{" "}
            {LISTA_ESTRATEGIAS.find((e) => e.id === estrategia)?.nota}
          </p>

          <Button
            type="button"
            size="sm"
            onClick={() => void generar()}
            disabled={cargando}
            className="font-bold"
          >
            {cargando ? (
              <>
                <ThinkingOrb size="xs" state="generating" label="" />
                Generando…
              </>
            ) : (
              "Generar con IA"
            )}
          </Button>

          {error && <p className="text-xs text-danger">{error}</p>}

          {resultado && (
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card/60 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- resultado de IA, sin dominio conocido de antemano */}
              <img
                src={resultado}
                alt="Variante generada"
                className="h-24 w-24 shrink-0 rounded-md object-cover"
              />
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-foreground/70">
                  Reemplaza la pieza actual por esta — podés seguir editándola generando otra variante.
                </p>
                <Button type="button" size="sm" onClick={() => onUsar(resultado)} className="self-start">
                  Usar esta variante
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
