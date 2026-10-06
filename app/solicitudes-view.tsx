"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Surface } from "./ui";

type Enlace = { etiqueta: string; url: string };
type SolicitudVista = {
  id: string;
  clienteNombre: string;
  titulo: string;
  destino: string;
  estado: "pendiente" | "rechazada" | "cancelada" | "publicada" | "activa" | "fallida";
  creador: { email: string; nombre: string };
  revisor: { email: string; nombre: string } | null;
  notaDeRevision: string | null;
  enlaces: Enlace[];
  creada: number;
  sinLeer: boolean;
  mensaje: string;
  piezas: number;
};
type Datos = { porRevisar: SolicitudVista[]; mias: SolicitudVista[]; revisores: string[] };

const ETIQUETA: Record<SolicitudVista["estado"], string> = {
  pendiente: "En revisión",
  rechazada: "Rechazada",
  cancelada: "Retirada",
  publicada: "Aprobada · pausada",
  activa: "Activa",
  fallida: "Falló al crear",
};
const TONO: Record<SolicitudVista["estado"], string> = {
  pendiente: "bg-amber-500/15 text-amber-400",
  rechazada: "bg-red-500/15 text-red-400",
  cancelada: "bg-foreground/10 text-foreground/60",
  publicada: "bg-sky-500/15 text-sky-400",
  activa: "bg-emerald-500/15 text-emerald-400",
  fallida: "bg-red-500/15 text-red-400",
};

const fecha = (ms: number) => new Date(ms).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });

function Enlaces({ enlaces }: { enlaces: Enlace[] }) {
  if (enlaces.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {enlaces.map((e) => (
        <a key={e.url} href={e.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          <ExternalLink className="size-3" /> {e.etiqueta || "Revisar en la plataforma"}
        </a>
      ))}
    </div>
  );
}

/** Solicitudes de publicación: lo que hay por revisar (supervisores) y el estado de lo que envié (analistas). */
export function SolicitudesView() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<string | null>(null);
  const [nota, setNota] = useState("");

  const cargar = useCallback(async (revisar = false) => {
    try {
      const r = await fetch(`/api/solicitudes${revisar ? "?revisar=1" : ""}`, { cache: "no-store" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudieron leer las solicitudes");
      setDatos((await r.json()) as Datos);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer las solicitudes");
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch("/api/solicitudes?revisar=1", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudieron leer las solicitudes");
        return (await r.json()) as Datos;
      })
      .then((d) => {
        if (vivo) setDatos(d);
        // Con las novedades ya a la vista, se dan por leídas.
        return fetch("/api/solicitudes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leidas: true }) });
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudieron leer las solicitudes");
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function accion(id: string, accionNombre: string, extra?: Record<string, string>) {
    setOcupada(id);
    setError(null);
    try {
      const r = await fetch(`/api/solicitudes/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: accionNombre, ...extra }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo completar");
      setRechazando(null);
      setNota("");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
    } finally {
      setOcupada(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6 p-4 md:p-6">
      <div>
        <h2 className="neo-section-title">Solicitudes</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/58">
          Lo que el equipo quiere publicar pasa primero por un supervisor. Al aprobarlo se crea pausado en la plataforma y queda un enlace para revisarlo.
        </p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {datos === null && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {datos && datos.porRevisar.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-micro text-[0.65rem] text-muted-foreground">POR REVISAR</h3>
          {datos.porRevisar.map((s) => (
            <Surface key={s.id} className="p-4">
              <p className="text-sm font-semibold text-foreground">
                {s.creador.nombre} quiere subir {s.titulo}
                {s.destino ? ` a ${s.destino}` : ""}.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.clienteNombre} · {s.piezas > 1 ? `${s.piezas} piezas · ` : ""}
                {fecha(s.creada)}
              </p>
              {rechazando === s.id ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Motivo (opcional): qué debería cambiar"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="destructive" disabled={ocupada === s.id} onClick={() => void accion(s.id, "rechazar", { nota })}>
                      Confirmar rechazo
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRechazando(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Button type="button" size="sm" disabled={ocupada === s.id} onClick={() => void accion(s.id, "aprobar")}>
                    {ocupada === s.id ? "Publicando…" : "Aprobar"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={ocupada === s.id} onClick={() => setRechazando(s.id)}>
                    Rechazar
                  </Button>
                </div>
              )}
            </Surface>
          ))}
        </section>
      )}

      {datos && (
        <section className="space-y-3">
          <h3 className="font-micro text-[0.65rem] text-muted-foreground">MIS SOLICITUDES</h3>
          {datos.mias.length === 0 && <p className="text-sm text-muted-foreground">Todavía no has enviado nada a revisión.</p>}
          {datos.mias.map((s) => (
            <Surface key={s.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[0.65rem] font-bold", TONO[s.estado])}>{ETIQUETA[s.estado]}</span>
                <span className="text-sm font-semibold text-foreground">
                  {s.clienteNombre}: {s.titulo}
                  {s.destino ? ` en ${s.destino}` : ""}
                </span>
                {s.sinLeer && <span className="size-2 rounded-full bg-brand" aria-label="Novedad" />}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-foreground/70">{s.mensaje}</p>
              <p className="mt-1 text-[0.68rem] text-muted-foreground">{fecha(s.creada)}</p>
              <Enlaces enlaces={s.enlaces} />
              {s.estado === "pendiente" && (
                <Button type="button" size="sm" variant="ghost" className="mt-2" disabled={ocupada === s.id} onClick={() => void accion(s.id, "cancelar")}>
                  Retirar
                </Button>
              )}
            </Surface>
          ))}
        </section>
      )}
    </div>
  );
}
