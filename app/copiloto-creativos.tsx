"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CampaignDraft } from "@/lib/constructor";
import type { SugerenciaGoogle, SugerenciaMeta } from "@/lib/copiloto-creativos";
import { ThinkingOrb } from "./ui";

type Actual = {
  titulos?: string[];
  descripciones?: string[];
  textoPrincipal?: string;
  titulo?: string;
  descripcion?: string;
};

/**
 * Copiloto de creativos: le pide a Claude títulos y textos para el anuncio
 * que se está armando, ya recortados a los límites reales de la plataforma.
 * No aplica nada solo: la persona ve la sugerencia y elige si la usa.
 */
export function CopilotoDeCreativos({
  plataforma,
  portfolioId,
  objetivoLabel,
  nombreCampana,
  notaInterna,
  landingUrl,
  actual,
  onAplicar,
}: {
  plataforma: "google" | "meta";
  portfolioId: string;
  objetivoLabel: string;
  nombreCampana: string;
  notaInterna: string;
  landingUrl: string;
  actual: Actual;
  onAplicar: (cambios: Partial<CampaignDraft>) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [brief, setBrief] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sugerenciaGoogle, setSugerenciaGoogle] = useState<SugerenciaGoogle | null>(null);
  const [sugerenciaMeta, setSugerenciaMeta] = useState<SugerenciaMeta | null>(null);

  async function generar() {
    if (!portfolioId) {
      setError("Elige el cliente en el paso de Campaña antes de generar textos.");
      return;
    }
    setCargando(true);
    setError(null);
    setSugerenciaGoogle(null);
    setSugerenciaMeta(null);
    try {
      const response = await fetch("/api/creatividades/copiloto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plataforma,
          portfolioId,
          objetivoLabel,
          nombreCampana,
          notaInterna,
          landingUrl,
          brief,
          actual,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        google?: SugerenciaGoogle;
        meta?: SugerenciaMeta;
      };
      if (!response.ok) throw new Error(body.error ?? "No se pudo generar");
      if (plataforma === "google" && body.google) setSugerenciaGoogle(body.google);
      if (plataforma === "meta" && body.meta) setSugerenciaMeta(body.meta);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "No se pudo generar");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-dashed border-border p-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-bold text-brand"
      >
        <Sparkles className="size-3.5" />
        Copiloto de creativos
      </button>

      {abierto && (
        <div className="mt-2.5 space-y-2.5">
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={2}
            placeholder="¿Algo que quieras destacar? Promoción, producto, tono — opcional."
            className="bg-field/60 text-sm"
          />
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

          {sugerenciaGoogle && (
            <div className="rounded-lg border border-border bg-card/60 p-2.5 text-sm">
              <p className="font-micro text-[0.6rem] text-muted-foreground">Títulos sugeridos</p>
              <ul className="mt-1 space-y-0.5 text-foreground">
                {sugerenciaGoogle.titulos.map((t, i) => (
                  <li key={i}>· {t}</li>
                ))}
              </ul>
              <p className="font-micro mt-2 text-[0.6rem] text-muted-foreground">
                Descripciones sugeridas
              </p>
              <ul className="mt-1 space-y-0.5 text-foreground">
                {sugerenciaGoogle.descripciones.map((d, i) => (
                  <li key={i}>· {d}</li>
                ))}
              </ul>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    onAplicar({
                      headlines: sugerenciaGoogle.titulos,
                      descriptions: sugerenciaGoogle.descripciones,
                    })
                  }
                >
                  Reemplazar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onAplicar({
                      headlines: [...(actual.titulos ?? []), ...sugerenciaGoogle.titulos].slice(0, 15),
                      descriptions: [...(actual.descripciones ?? []), ...sugerenciaGoogle.descripciones].slice(0, 4),
                    })
                  }
                >
                  Agregar a lo existente
                </Button>
              </div>
            </div>
          )}

          {sugerenciaMeta && (
            <div className="rounded-lg border border-border bg-card/60 p-2.5 text-sm">
              <p className="text-foreground">{sugerenciaMeta.textoPrincipal}</p>
              <p className="mt-1.5 font-bold text-foreground">{sugerenciaMeta.titulo}</p>
              <p className="text-muted-foreground">{sugerenciaMeta.descripcion}</p>
              <Button
                type="button"
                size="sm"
                className="mt-2.5"
                onClick={() =>
                  onAplicar({
                    message: sugerenciaMeta.textoPrincipal,
                    metaHeadline: sugerenciaMeta.titulo,
                    metaDescription: sugerenciaMeta.descripcion,
                  })
                }
              >
                Usar esta versión
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
