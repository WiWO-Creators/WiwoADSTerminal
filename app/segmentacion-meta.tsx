"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Interes = { id: string; nombre: string; tamano: number | null };
type Audiencia = { id: string; nombre: string; tipo: string; tamanoMinimo: number | null };

const tamanoCorto = (n: number | null): string => (n === null ? "" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} M` : n >= 1_000 ? `${Math.round(n / 1_000)} mil` : String(n));

/**
 * Segmentación fina de Meta con datos reales: intereses buscados por palabra (la API de Meta devuelve los ids) y las
 * audiencias de la cuenta para incluirlas o excluirlas. Nada se escribe a mano.
 */
export function SegmentacionMeta({
  portfolioId = "",
  accountId,
  nombresIniciales,
  intereses,
  incluidas,
  excluidas,
  onChange,
}: {
  /** Opcional: sin él, el servidor lo deduce de la cuenta. */
  portfolioId?: string;
  accountId: string | null;
  /** Nombres ya conocidos de lo elegido (para mostrar chips legibles al editar). */
  nombresIniciales?: Record<string, string>;
  intereses: string[];
  incluidas: string[];
  excluidas: string[];
  onChange: (cambios: { metaInterests?: string[]; metaCustomAudiences?: string[]; metaExcludedAudiences?: string[] }) => void;
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Interes[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [audiencias, setAudiencias] = useState<Audiencia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Nombres de lo ya elegido en esta sesión, para mostrar chips legibles.
  const [nombres, setNombres] = useState<Record<string, string>>(nombresIniciales ?? {});

  // Búsqueda con espera: no se consulta a Meta en cada tecla.
  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2) return;
    let vivo = true;
    const t = window.setTimeout(() => {
      setBuscando(true);
      fetch(`/api/meta/intereses?q=${encodeURIComponent(q)}`)
        .then(async (r) => {
          const j = (await r.json()) as { intereses?: Interes[]; error?: string };
          if (!r.ok) throw new Error(j.error ?? "No se pudo buscar");
          if (vivo) {
            setResultados(j.intereses ?? []);
            setError(null);
          }
        })
        .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudo buscar"))
        .finally(() => vivo && setBuscando(false));
    }, 400);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [texto]);

  // Audiencias de la cuenta de Meta elegida.
  useEffect(() => {
    if (!accountId) return;
    let vivo = true;
    fetch(`/api/meta/audiencias?${portfolioId ? `portfolioId=${encodeURIComponent(portfolioId)}&` : ""}accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as { audiencias?: Audiencia[]; error?: string };
        if (!r.ok) throw new Error(j.error ?? "No se pudieron leer las audiencias");
        if (vivo) setAudiencias(j.audiencias ?? []);
      })
      .catch(() => vivo && setAudiencias([]));
    return () => {
      vivo = false;
    };
  }, [portfolioId, accountId]);

  const agregar = (i: Interes) => {
    setNombres((n) => ({ ...n, [i.id]: i.nombre }));
    if (!intereses.includes(i.id)) onChange({ metaInterests: [...intereses, i.id] });
    setTexto("");
    setResultados([]);
  };
  const estadoDe = (id: string): "incluir" | "excluir" | null => (incluidas.includes(id) ? "incluir" : excluidas.includes(id) ? "excluir" : null);
  const fijar = (id: string, estado: "incluir" | "excluir" | null) =>
    onChange({
      metaCustomAudiences: estado === "incluir" ? [...incluidas.filter((x) => x !== id), id] : incluidas.filter((x) => x !== id),
      metaExcludedAudiences: estado === "excluir" ? [...excluidas.filter((x) => x !== id), id] : excluidas.filter((x) => x !== id),
    });

  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="font-micro text-[0.65rem] text-foreground/45">INTERESES (OPCIONAL)</p>
        {intereses.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {intereses.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onChange({ metaInterests: intereses.filter((x) => x !== id) })}
                className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-xs font-semibold text-foreground"
                aria-label="Quitar este interés"
              >
                {nombres[id] ?? id}
                <X className="size-3" />
              </button>
            ))}
          </div>
        )}
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Busca por palabra: energía solar, running, seguros…" className="mt-2 bg-field/60" />
        {buscando && <p className="mt-1 text-[0.68rem] text-foreground/40">Buscando en Meta…</p>}
        {error && <p className="mt-1 text-[0.68rem] text-danger">{error}</p>}
        {texto.trim().length >= 2 && resultados.length > 0 && (
          <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-xl border border-foreground/10 p-1.5">
            {resultados.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => agregar(i)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-foreground/5">
                  <span className="min-w-0 truncate font-semibold text-foreground">{i.nombre}</span>
                  <span className="shrink-0 text-foreground/40">{tamanoCorto(i.tamano)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[0.68rem] leading-5 text-foreground/40">Llega a quien tenga al menos uno de los intereses elegidos.</p>
      </div>

      {accountId && audiencias !== null && audiencias.length > 0 && (
        <div>
          <p className="font-micro text-[0.65rem] text-foreground/45">AUDIENCIAS DE LA CUENTA</p>
          <ul className="mt-2 space-y-1.5">
            {audiencias.map((a) => {
              const estado = estadoDe(a.id);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-foreground/10 px-3 py-2 text-xs">
                  <span className="min-w-0">
                    <span className="font-semibold text-foreground">{a.nombre}</span>{" "}
                    <span className="text-foreground/40">· {a.tipo}{a.tamanoMinimo !== null ? ` · ${tamanoCorto(a.tamanoMinimo)}+` : ""}</span>
                  </span>
                  <span className="flex gap-1">
                    {(["incluir", "excluir"] as const).map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => fijar(a.id, estado === e ? null : e)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 font-semibold",
                          estado === e ? (e === "incluir" ? "border-brand bg-brand/12 text-foreground" : "border-danger/50 bg-danger/10 text-danger") : "border-foreground/12 text-foreground/50 hover:border-foreground/25",
                        )}
                      >
                        {e === "incluir" ? "Incluir" : "Excluir"}
                      </button>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
