"use client";

import { useEffect, useState } from "react";

import type { PiezaParaReemplazar } from "@/lib/renovar-piezas";

type Respuesta = { piezas: PiezaParaReemplazar[]; total: number; comparado: boolean };

/**
 * En una decisión de contenido de Meta: qué anuncios reemplazar. Los 3 activos de la campaña que peor rinden, cada uno con su porqué
 * (o los más viejos, si no hay con qué comparar), para renovar sin saturar la campaña. Se lee de Meta al abrir la decisión.
 */
export function QueReemplazar({
  accountId,
  campaignId,
  onCargado,
}: {
  accountId: string;
  campaignId: string;
  onCargado?: (piezas: PiezaParaReemplazar[]) => void;
}) {
  const clave = `${accountId}|${campaignId}`;
  const [lectura, setLectura] = useState<{ clave: string; datos: Respuesta | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/entidades/peores-piezas?accountId=${encodeURIComponent(accountId)}&campaignId=${encodeURIComponent(campaignId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Respuesta>) : null))
      .then((d) => {
        if (!vivo) return;
        setLectura({ clave, datos: d });
        if (d) onCargado?.(d.piezas);
      })
      .catch(() => vivo && setLectura({ clave, datos: null }));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCargado solo avisa; no debe volver a pedir
  }, [clave, accountId, campaignId]);

  const cargando = lectura?.clave !== clave;
  const d = cargando ? null : lectura?.datos;

  return (
    <div className="rounded-xl border border-foreground/10 p-3" onPointerDown={(e) => e.stopPropagation()}>
      <p className="text-xs font-bold text-foreground">Qué contenido reemplazar</p>
      {cargando ? (
        <p className="mt-1 text-xs text-foreground/55">Leyendo los anuncios activos de esta campaña en Meta…</p>
      ) : !d ? (
        <p className="mt-1 text-xs text-foreground/55">No se pudieron leer los anuncios de la campaña en este momento.</p>
      ) : d.piezas.length === 0 ? (
        <p className="mt-1 text-xs text-foreground/55">Esta campaña no tiene anuncios activos que reemplazar.</p>
      ) : (
        <>
          <p className="mt-0.5 text-[0.7rem] leading-4 text-foreground/50">
            {d.comparado ? `Los ${d.piezas.length} de peor rendimiento entre los ${d.total} anuncios activos de la campaña` : `Los ${d.piezas.length} más viejos de los ${d.total} anuncios activos de la campaña`}. Se retiran (se pausan) solo al subir lo nuevo, y se pueden reactivar.
          </p>
          <ol className="mt-2 space-y-2">
            {d.piezas.map((p, i) => (
              <li key={p.id} className="flex gap-2.5 text-xs">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-danger/15 text-[0.65rem] font-extrabold text-danger">{i + 1}</span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground" title={p.nombre}>
                    {p.nombre}
                    {p.conjunto ? <span className="font-normal text-foreground/45"> · {p.conjunto}</span> : null}
                  </p>
                  <p className="leading-5 text-foreground/70">{p.porQue}</p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
