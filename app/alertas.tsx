"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell, Check, ExternalLink, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Alerta, Severidad } from "@/lib/alertas";
import { cn } from "@/lib/utils";
import { ThinkingOrb } from "./ui";

const ETIQUETA_SEVERIDAD: Record<Severidad, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Revisar",
};

const ESTILO_SEVERIDAD: Record<Severidad, string> = {
  critica: "border-danger-deep/30 bg-danger-deep/10 text-danger",
  alta: "border-warn-deep/30 bg-warn-deep/10 text-warn",
  media: "border-border bg-field text-muted-foreground",
};

type EstadoDeAlerta = "pendiente" | "aplicando" | "aplicada";

type SolicitudPendiente = { id: string; clienteNombre: string; titulo: string; destino: string; creador: { nombre: string } };

/**
 * Alertas proactivas: el sistema vigila solo y avisa, sin que nadie pregunte.
 *
 * Se recalculan en vivo (`GET /api/alertas`, sobre `lib/alertas.ts`) cada vez
 * que se abre el panel o cambia el cliente activo — nada queda pendiente de
 * firmar. Las que traen una acción segura (pausar) la aplican con un clic
 * real, contra el mismo endpoint que usa el resto de la app.
 */
export function BotonDeAlertas({
  clienteId,
  clienteNombre,
  rango,
  puedeAprobar,
  onCambioAplicado,
}: {
  clienteId: string | null;
  clienteNombre: string | null;
  rango: string;
  puedeAprobar: boolean;
  onCambioAplicado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estados, setEstados] = useState<Record<string, EstadoDeAlerta>>({});
  const [solicitudes, setSolicitudes] = useState<SolicitudPendiente[]>([]);
  const [ocupada, setOcupada] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams({ rango });
      if (clienteId) params.set("cliente", clienteId);
      const response = await fetch(`/api/alertas?${params}`, { cache: "no-store" });
      const body = (await response.json()) as { alertas?: Alerta[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudieron leer las alertas");
      setAlertas(body.alertas ?? []);
      setEstados({});
      // Lo que otras personas quieren publicar y espera la aprobación de quien lee esto.
      const rs = await fetch("/api/solicitudes", { cache: "no-store" });
      if (rs.ok) setSolicitudes(((await rs.json()) as { porRevisar: SolicitudPendiente[] }).porRevisar);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "No se pudieron leer las alertas");
    } finally {
      setCargando(false);
    }
  }, [clienteId, rango]);

  // Recalcula al montar y cada vez que cambia el cliente activo o el
  // periodo — las mismas dos cosas de las que dependen sus datos.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- trae datos del servidor al abrir/cambiar de cliente
    void cargar();
  }, [cargar]);

  /** Quien no aprueba cambios propone la pausa: queda pendiente y no se pausa nada hasta que la apruebe un Lead o superior. */
  async function proponerPausa(alerta: Alerta) {
    if (!alerta.accion || !alerta.plataforma) return;
    setEstados((actual) => ({ ...actual, [alerta.id]: "aplicando" }));
    try {
      const response = await fetch("/api/entidades/editar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: alerta.plataforma, accountId: alerta.accion.cuentaId, nivel: "campana", id: alerta.accion.campanaId, cambios: { pausar: true }, modo: "solicitar" }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo enviar la propuesta");
      setEstados((actual) => ({ ...actual, [alerta.id]: "aplicada" }));
      toast.success("Propuesta enviada: nada se pausó todavía. Debe aprobarla un Lead o superior.");
    } catch (issue) {
      setEstados((actual) => {
        const siguiente = { ...actual };
        delete siguiente[alerta.id];
        return siguiente;
      });
      toast.error(issue instanceof Error ? issue.message : "No se pudo enviar la propuesta");
    }
  }

  async function pausar(alerta: Alerta) {
    if (!alerta.accion) return;
    setEstados((actual) => ({ ...actual, [alerta.id]: "aplicando" }));
    try {
      const response = await fetch("/api/anuncios/estado", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: alerta.plataforma,
          nivel: "campana",
          accountId: alerta.accion.cuentaId,
          campaignId: alerta.accion.campanaId,
          activar: false,
        }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error ?? "No se pudo pausar");
      setEstados((actual) => ({ ...actual, [alerta.id]: "aplicada" }));
      toast.success(`"${alerta.campana}" pausada`);
      onCambioAplicado();
    } catch (issue) {
      setEstados((actual) => {
        const siguiente = { ...actual };
        delete siguiente[alerta.id];
        return siguiente;
      });
      toast.error(issue instanceof Error ? issue.message : "No se pudo pausar");
    }
  }

  async function resolver(s: SolicitudPendiente, accion: "aprobar" | "rechazar") {
    setOcupada(s.id);
    try {
      const response = await fetch(`/api/solicitudes/${s.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; solicitud?: { estado: string; enlaces: Array<{ url: string }> } };
      if (!response.ok) throw new Error(body.error ?? "No se pudo completar");
      setSolicitudes((actual) => actual.filter((x) => x.id !== s.id));
      toast.success(accion === "aprobar" ? (body.solicitud?.estado === "fallida" ? "Se aprobó, pero la plataforma rechazó un paso" : "Aprobada y creada") : "Rechazada");
      onCambioAplicado();
    } catch (issue) {
      toast.error(issue instanceof Error ? issue.message : "No se pudo completar");
    } finally {
      setOcupada(null);
    }
  }

  const visibles = (alertas ?? []).filter((a) => estados[a.id] !== "aplicada");
  const total = visibles.length + solicitudes.length;
  const hayCritica = visibles.some((a) => a.severidad === "critica");

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={total > 0 ? `Alertas, ${total} pendientes` : "Alertas"}
        title="Alertas"
        className="relative flex h-11 w-full items-center gap-2.5 rounded-full border border-border bg-field px-4 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:self-center group-data-[collapsible=icon]:p-0"
      >
        <Bell className="size-4 shrink-0" />
        <span className="flex-1 text-left group-data-[collapsible=icon]:hidden">
          Alertas
        </span>
        {total > 0 && (
          // Con el menú compacto el contador se va a la esquina del botón:
          // esconderlo sería perder justo la señal de que hay algo pendiente,
          // que es lo único que ese botón tiene para decir de un vistazo.
          <span
            className={cn(
              "grid size-5 place-items-center rounded-full text-[0.65rem] font-bold text-primary-foreground",
              "group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:-top-1 group-data-[collapsible=icon]:-right-1 group-data-[collapsible=icon]:size-4 group-data-[collapsible=icon]:text-[0.55rem]",
              hayCritica ? "bg-danger" : "bg-primary",
            )}
          >
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>Alertas{clienteNombre ? ` · ${clienteNombre}` : ""}</DialogTitle>
              <button
                type="button"
                onClick={() => void cargar()}
                disabled={cargando}
                aria-label="Recalcular alertas"
                title="Recalcular"
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
              >
                {cargando ? (
                  <ThinkingOrb size="xs" state="generating" label="" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
              </button>
            </div>
            <DialogDescription>
              Lo que el sistema encontró revisando el periodo elegido, sin que nadie preguntara.
            </DialogDescription>
          </DialogHeader>

          {cargando && alertas === null ? (
            <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
              <ThinkingOrb size="md" state="thinking" label="" />
              Revisando campañas…
            </div>
          ) : error ? (
            <p className="rounded-xl border border-danger-deep/30 bg-danger-deep/10 px-3 py-2.5 text-sm text-danger">
              {error}
            </p>
          ) : total === 0 ? (
            <p className="flex items-center gap-2 rounded-xl border border-border bg-field px-3 py-2.5 text-sm text-muted-foreground">
              <Check className="size-4 text-ok" />
              Sin nada que avisar por ahora.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {solicitudes.map((s) => (
                <li key={s.id} className="rounded-xl border border-brand/30 bg-brand/5 p-3">
                  <span className="font-micro inline-flex rounded-full border border-brand/30 px-2 py-0.5 text-[0.6rem] font-bold text-brand">Por aprobar</span>
                  <p className="mt-1.5 text-sm font-semibold break-words text-foreground">
                    {s.creador.nombre} quiere subir {s.titulo}
                    {s.destino ? ` a ${s.destino}` : ""}.
                  </p>
                  <p className="text-xs text-muted-foreground">{s.clienteNombre}</p>
                  <div className="mt-2.5 flex gap-2">
                    <button type="button" disabled={ocupada === s.id} onClick={() => void resolver(s, "aprobar")} className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60">
                      {ocupada === s.id ? "Publicando…" : "Aprobar"}
                    </button>
                    <button type="button" disabled={ocupada === s.id} onClick={() => void resolver(s, "rechazar")} className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-foreground disabled:opacity-60">
                      Rechazar
                    </button>
                  </div>
                </li>
              ))}
              {visibles.map((alerta) => {
                const estado = estados[alerta.id] ?? "pendiente";
                return (
                  <li
                    key={alerta.id}
                    className="rounded-xl border border-border bg-card p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span
                          className={cn(
                            "font-micro inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-bold",
                            ESTILO_SEVERIDAD[alerta.severidad],
                          )}
                        >
                          {alerta.severidad === "critica" && <AlertTriangle className="size-3" />}
                          {ETIQUETA_SEVERIDAD[alerta.severidad]}
                        </span>
                        <p className="mt-1.5 text-sm font-semibold break-words text-foreground">
                          {alerta.campana}
                        </p>
                        <p className="text-xs break-words text-muted-foreground">
                          {alerta.clienteNombre}
                          {alerta.plataforma ? ` · ${alerta.plataforma === "google" ? "Google Ads" : "Meta Ads"}` : ""} ·{" "}
                          {alerta.cuenta}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-5 break-words text-muted-foreground">{alerta.diagnostico}</p>
                    {alerta.enlaces && alerta.enlaces.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {alerta.enlaces.map((e) => (
                          <a
                            key={e.url}
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 px-3 py-1.5 text-xs font-bold text-brand transition-colors hover:bg-brand/10"
                          >
                            {e.etiqueta}
                            <ExternalLink className="size-3" />
                          </a>
                        ))}
                      </div>
                    )}
                    {alerta.accion && !puedeAprobar && alerta.plataforma && (
                      <button
                        type="button"
                        onClick={() => void proponerPausa(alerta)}
                        disabled={estado === "aplicando" || estado === "aplicada"}
                        className="mt-2.5 flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
                      >
                        {estado === "aplicada" ? "Propuesta enviada" : "Proponer pausar"}
                      </button>
                    )}
                    {alerta.accion && puedeAprobar && (
                      <button
                        type="button"
                        onClick={() => void pausar(alerta)}
                        disabled={estado === "aplicando"}
                        className="mt-2.5 flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
                      >
                        {estado === "aplicando" ? (
                          <>
                            <ThinkingOrb size="xs" state="generating" label="" />
                            Pausando…
                          </>
                        ) : (
                          "Pausar"
                        )}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
