"use client";

import { fetchConReintento } from "@/lib/fetch-reintento";
import { useEffect, useMemo, useState } from "react";
import { Flame, ImageOff } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ThinkingOrb } from "./ui";

export type AnuncioImpulsable = {
  id: string;
  nombre: string | null;
  estado: string | null;
  /** `{page_id}_{post_id}`: lo que pide `boost_post`. */
  postId: string;
  reusaPublicacion: boolean;
  miniatura: string | null;
  texto: string | null;
  campana: string | null;
  conjunto: string | null;
};

/**
 * Elegir un anuncio que ya está publicado para impulsarlo: se reutiliza su
 * misma publicación, así conserva reacciones, comentarios y compartidos. Sirve
 * tanto para una campaña nueva como para meterlo en una que ya existe (el
 * servidor confirma después con datos reales que esa campaña lo admita).
 */
export function SelectorDeAnuncios({
  open,
  onOpenChange,
  portfolioId,
  accountId,
  nombreCuenta,
  onSeleccionar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolioId: string;
  accountId: string;
  nombreCuenta: string;
  onSeleccionar: (anuncio: AnuncioImpulsable) => void;
}) {
  const clave = `${portfolioId}:${accountId}`;
  const [resultado, setResultado] = useState<{
    clave: string;
    anuncios: AnuncioImpulsable[];
    error: string | null;
  } | null>(null);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    if (!open) return;
    const control = new AbortController();
    const params = new URLSearchParams({ portfolioId, accountId });
    fetchConReintento(`/api/entidades/anuncios?${params}`, { signal: control.signal }, 3, 45_000)
      .then(async (r) => {
        const cuerpo = await r.json().catch(() => null);
        if (!r.ok) throw new Error(cuerpo?.error ?? "No se pudieron leer los anuncios");
        setResultado({ clave, anuncios: cuerpo.anuncios as AnuncioImpulsable[], error: null });
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setResultado({
          clave,
          anuncios: [],
          error: e instanceof Error ? e.message : "No se pudieron leer los anuncios",
        });
      });
    return () => control.abort();
  }, [open, portfolioId, accountId, clave]);

  const actual = resultado && resultado.clave === clave ? resultado : null;
  const cargando = open && actual === null;

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    const lista = actual?.anuncios ?? [];
    if (!q) return lista;
    return lista.filter((a) =>
      [a.nombre, a.texto, a.campana, a.conjunto].some((t) => (t ?? "").toLowerCase().includes(q)),
    );
  }, [actual, filtro]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Reutilizar un anuncio de campaña</DialogTitle>
          <DialogDescription>
            Anuncios que ya corren en campañas de {nombreCuenta}. El nuevo anuncio reutiliza la misma publicación, así que
            conserva sus reacciones, comentarios y compartidos. Para boostear una publicación normal de Facebook o Instagram
            (que no está en ninguna campaña), usa «Boostear publicación de la red».
          </DialogDescription>
        </DialogHeader>

        <Input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar por nombre, texto o campaña…"
        />

        {cargando && (
          <div className="flex items-center gap-2 py-6 text-sm text-foreground/50">
            <ThinkingOrb /> Leyendo los anuncios de la cuenta…
          </div>
        )}
        {actual?.error && (
          <p className="rounded-xl border border-danger/25 bg-danger/8 p-3 text-sm text-danger">
            {actual.error}
          </p>
        )}
        {actual && !actual.error && visibles.length === 0 && (
          <p className="py-6 text-sm text-foreground/55">
            No hay anuncios para mostrar. Windsor solo entrega lo que tuvo actividad reciente.
          </p>
        )}

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((a) => (
            <li key={a.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSeleccionar(a)}
                className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-foreground/10 bg-card text-left transition-colors hover:border-brand/50 hover:bg-brand/5"
              >
                <span className="relative block aspect-[1.6/1] w-full overflow-hidden bg-foreground/6">
                  {a.miniatura ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.miniatura} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.03]" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-foreground/25">
                      <ImageOff className="size-6" />
                    </span>
                  )}
                  {a.estado && (
                    <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[0.6rem] font-bold text-white">
                      {a.estado === "ACTIVE" ? "Activo" : a.estado === "PAUSED" ? "Pausado" : a.estado}
                    </span>
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1 p-3">
                  <span className="line-clamp-1 text-sm font-semibold text-foreground">{a.nombre ?? a.id}</span>
                  <span className="line-clamp-1 text-[0.7rem] text-foreground/50">
                    {[a.campana, a.conjunto].filter(Boolean).join(" · ") || "—"}
                  </span>
                  {a.texto && <span className="line-clamp-2 text-xs leading-5 text-foreground/65">{a.texto}</span>}
                  <span className="mt-auto inline-flex items-center gap-1 pt-1.5 text-xs font-bold text-brand">
                    <Flame className="size-3.5" /> Boostear este anuncio
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
