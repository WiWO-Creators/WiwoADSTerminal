"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell, Check, RotateCcw } from "lucide-react";
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

  const visibles = (alertas ?? []).filter((a) => estados[a.id] !== "aplicada");
  const total = visibles.length;
  const hayCritica = visibles.some((a) => a.severidad === "critica");

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={total > 0 ? `Alertas, ${total} pendientes` : "Alertas"}
        className="flex h-11 w-full items-center gap-2.5 rounded-full border border-border bg-field px-4 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="size-4" />
        <span className="flex-1 text-left">Alertas</span>
        {total > 0 && (
          <span
            className={cn(
              "grid size-5 place-items-center rounded-full text-[0.65rem] font-bold text-primary-foreground",
              hayCritica ? "bg-danger" : "bg-primary",
            )}
          >
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
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
                        <p className="mt-1.5 truncate text-sm font-semibold text-foreground">
                          {alerta.campana}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {alerta.clienteNombre} · {alerta.plataforma === "google" ? "Google Ads" : "Meta Ads"} ·{" "}
                          {alerta.cuenta}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{alerta.diagnostico}</p>
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
