"use client";

import { useEffect, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Seccion } from "./constructor-ui";

type PiezaVieja = { id: string; nombre: string; dias: number | null; impresiones: number; ctr: number | null };

/** Días desde que se creó el anuncio a partir de los cuales se propone retirarlo al marcar «los más viejos». */
const DIAS_PARA_PROPONER = 30;

/**
 * Al subir un anuncio nuevo a un conjunto de Meta que ya existe: elegir cuáles de los anuncios activos de ese conjunto se retiran
 * (se pausan) cuando el nuevo ya esté publicado, para que el conjunto no se sature. Pausar no borra: se reactivan cuando se quiera.
 */
export function RetirarAnunciosViejos({
  accountId,
  conjuntoId,
  elegidos,
  onChange,
}: {
  accountId: string;
  conjuntoId: string;
  elegidos: Array<{ id: string; nombre: string }>;
  onChange: (lista: Array<{ id: string; nombre: string }>) => void;
}) {
  const [lectura, setLectura] = useState<{ conjuntoId: string; piezas: PiezaVieja[] | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/entidades/piezas?accountId=${encodeURIComponent(accountId)}&conjuntoId=${encodeURIComponent(conjuntoId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ piezas: PiezaVieja[] }>) : null))
      .then((j) => vivo && setLectura({ conjuntoId, piezas: j?.piezas ?? null }))
      .catch(() => vivo && setLectura({ conjuntoId, piezas: null }));
    return () => {
      vivo = false;
    };
  }, [accountId, conjuntoId]);

  const cargando = lectura?.conjuntoId !== conjuntoId;
  const piezas = cargando ? null : (lectura?.piezas ?? null);
  const marcados = new Set(elegidos.map((e) => e.id));
  const alternar = (p: PiezaVieja, marcar: boolean) =>
    onChange(marcar ? [...elegidos.filter((e) => e.id !== p.id), { id: p.id, nombre: p.nombre }] : elegidos.filter((e) => e.id !== p.id));

  return (
    <Seccion titulo="Retirar anuncios viejos (opcional)" completa>
      {cargando ? (
        <p className="text-sm text-foreground/50">Leyendo los anuncios activos de este conjunto en Meta…</p>
      ) : !piezas ? (
        <p className="text-sm text-foreground/60">No se pudieron leer los anuncios de este conjunto; el anuncio nuevo se publica igual y los viejos quedan como están.</p>
      ) : piezas.length === 0 ? (
        <p className="text-sm text-foreground/60">Este conjunto no tiene otros anuncios activos: no hay nada que retirar.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-foreground/70">
            Este conjunto tiene <strong className="text-foreground">{piezas.length}</strong> anuncios activos. Para que no se sature, marca los que se retiran:
            se pausan <strong className="text-foreground">después</strong> de publicar el nuevo y se pueden reactivar cuando quieras.
          </p>
          <ul className="space-y-1.5">
            {piezas.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-foreground/10 p-2.5 text-sm hover:bg-foreground/4">
                  <Checkbox checked={marcados.has(p.id)} onCheckedChange={(v) => alternar(p, v === true)} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{p.nombre}</span>
                    <span className="block text-xs text-foreground/50">
                      {p.dias !== null ? `${p.dias} días activo` : "sin fecha"} · {p.impresiones.toLocaleString("es-CL")} impresiones
                      {p.ctr !== null ? ` · CTR ${p.ctr.toLocaleString("es-CL")} %` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => onChange(piezas.filter((p) => (p.dias ?? 0) >= DIAS_PARA_PROPONER).map((p) => ({ id: p.id, nombre: p.nombre })))}
              className="rounded-full border border-brand/30 px-3 py-1.5 text-brand hover:bg-brand/10"
            >
              Marcar los de {DIAS_PARA_PROPONER} días o más
            </button>
            {elegidos.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="rounded-full px-3 py-1.5 text-foreground/55 hover:bg-foreground/6">
                Quitar la selección ({elegidos.length})
              </button>
            )}
          </div>
        </div>
      )}
    </Seccion>
  );
}
