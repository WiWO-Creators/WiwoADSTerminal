"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { toast } from "sonner";

import { etiquetaDeCargo } from "@/lib/jerarquia-pura";

export type VerComo = { email: string; nombre: string; cargo: string | null };
type Miembro = { email: string; nombre: string; cargo: string; nivel: number };

async function cambiar(email: string | null) {
  const r = await fetch("/api/ver-como", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new Error(j?.error ?? "No se pudo cambiar la vista");
  }
  window.location.reload();
}

/** Para administradores: elegir a quién ver la app «como». Es solo lectura. */
export function SelectorVerComo({ actual }: { actual: VerComo | null }) {
  const [miembros, setMiembros] = useState<Miembro[] | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function cargar() {
    if (miembros) return;
    try {
      const r = await fetch("/api/ver-como", { cache: "no-store" });
      const j = (await r.json()) as { miembros?: Miembro[] };
      setMiembros(j.miembros ?? []);
    } catch {
      setMiembros([]);
    }
  }

  return (
    <label className="mt-2 block group-data-[collapsible=icon]:hidden">
      <span className="flex items-center gap-1.5 text-[0.65rem] font-semibold text-muted-foreground">
        <Eye className="size-3" aria-hidden="true" /> Ver como
      </span>
      <select
        className="mt-1 h-8 w-full rounded-lg border border-border bg-background px-2 text-xs"
        value={actual?.email ?? ""}
        disabled={trabajando}
        onFocus={() => void cargar()}
        onMouseDown={() => void cargar()}
        onChange={(e) => {
          setTrabajando(true);
          cambiar(e.target.value || null).catch((error: unknown) => {
            setTrabajando(false);
            toast.error(error instanceof Error ? error.message : "No se pudo cambiar la vista");
          });
        }}
      >
        <option value="">Yo (mi vista)</option>
        {actual && !miembros && <option value={actual.email}>{actual.nombre} · {etiquetaDeCargo("", actual.cargo)}</option>}
        {(miembros ?? []).map((m) => (
          <option key={m.email} value={m.email}>
            {m.cargo} · {m.nombre || m.email}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Franja que avisa que se está viendo la app como otra persona y que es solo lectura. */
export function AvisoVerComo({ verComo }: { verComo: VerComo }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-warn/40 bg-warn/10 px-4 py-2 text-xs text-foreground">
      <span className="flex items-center gap-2">
        <Eye className="size-4 text-warn" aria-hidden="true" />
        <span>
          Estás viendo WiWO.ADS como <strong>{verComo.nombre || verComo.email}</strong> ({etiquetaDeCargo("", verComo.cargo)}). Es solo lectura: no se puede cambiar nada desde aquí.
        </span>
      </span>
      <button
        type="button"
        onClick={() => void cambiar(null).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "No se pudo volver"))}
        className="rounded-full border border-warn/50 px-3 py-1 font-bold hover:bg-warn/15"
      >
        Volver a mi vista
      </button>
    </div>
  );
}
