"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { BUILD_ID } from "@/lib/version";
import { ThinkingOrb } from "./ui";

const REVISAR_CADA_MS = 60_000;
const POSPONER_MS = 10 * 60_000;
const ESPERA_SERVIDOR_MS = 120_000;
const CADA_INTENTO_MS = 2_500;

/** Lo que una pantalla con trabajo sin aplicar (por ejemplo, el editor con cambios) deja marcado para que la actualización no lo pise. */
export function marcarTrabajoSinGuardar(sucio: boolean): void {
  (window as unknown as { __wiwoSucio?: boolean }).__wiwoSucio = sucio;
}
const hayTrabajoSinGuardar = () => Boolean((window as unknown as { __wiwoSucio?: boolean }).__wiwoSucio);

/**
 * Avisa cuando se desplegó una versión nueva de WiWO.ADS. Nunca actualiza sola ni interrumpe: la persona decide «Actualizar ahora» o
 * «Después» (vuelve a avisar en 10 minutos). Al actualizar, guarda su progreso (pantalla, cliente y borrador del Constructor), espera a
 * que el servidor termine de reiniciarse —así no cae en una página de error— y recién entonces recarga. Si hay cambios sin aplicar en
 * el editor, pregunta antes. Solo avisa en producción: en desarrollo la versión es «dev».
 */
export function AvisoDeActualizacion({ alGuardar }: { alGuardar: () => void }) {
  const [hayNueva, setHayNueva] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [estado, setEstado] = useState<"libre" | "esperando" | "demora">("libre");
  const pospuestoHasta = useRef(0);
  const cancelado = useRef(false);
  const guardar = useRef(alGuardar);
  useEffect(() => {
    guardar.current = alGuardar;
  }, [alGuardar]);

  const revisar = useCallback(async () => {
    if (BUILD_ID === "dev" || document.visibilityState === "hidden") return;
    try {
      const r = await fetch("/api/version", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { build?: string };
      if (j.build && j.build !== "dev" && j.build !== BUILD_ID && Date.now() > pospuestoHasta.current) setHayNueva(true);
    } catch {
      // Sin respuesta (por ejemplo, justo mientras se reinicia el servidor): se vuelve a revisar enseguida.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- revisa la versión al montar y la aviso cambia el estado
    void revisar();
    const t = window.setInterval(() => void revisar(), REVISAR_CADA_MS);
    const alVolver = () => void revisar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [revisar]);

  /** El servidor responde con la versión nueva y la página principal ya no da error. */
  async function servidorListo(): Promise<boolean> {
    try {
      const v = await fetch("/api/version", { cache: "no-store" });
      if (!v.ok) return false;
      const j = (await v.json()) as { build?: string };
      if (!j.build || j.build === BUILD_ID) return false;
      const p = await fetch(window.location.pathname, { cache: "no-store" });
      return p.status < 500;
    } catch {
      return false;
    }
  }

  const actualizar = useCallback(async () => {
    cancelado.current = false;
    setConfirmando(false);
    setEstado("esperando");
    try {
      // Cada pantalla guarda lo suyo (el Constructor escucha este evento) y el tablero guarda dónde estaba la persona.
      window.dispatchEvent(new Event("wiwo:guardar-progreso"));
      guardar.current();
    } catch {
      // Guardar es una ayuda: si falla, igual se actualiza.
    }
    const limite = Date.now() + ESPERA_SERVIDOR_MS;
    while (!cancelado.current && Date.now() < limite) {
      if (await servidorListo()) {
        if (!cancelado.current) window.location.reload();
        return;
      }
      await new Promise((r) => window.setTimeout(r, CADA_INTENTO_MS));
    }
    if (!cancelado.current) setEstado("demora");
  }, []);

  const pedirActualizar = () => {
    // Con cambios sin aplicar en el editor no se actualiza sin preguntar.
    if (hayTrabajoSinGuardar()) setConfirmando(true);
    else void actualizar();
  };

  const seguirTrabajando = (minutos: number) => {
    cancelado.current = true;
    pospuestoHasta.current = Date.now() + minutos * 60_000;
    setEstado("libre");
    setConfirmando(false);
    setHayNueva(false);
  };

  if (estado !== "libre") {
    return (
      <div role="status" aria-live="polite" className="fixed inset-0 z-[200] grid place-items-center bg-background/95 backdrop-blur-sm">
        <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
          <ThinkingOrb size="xl" state="thinking" bare label="Actualizando" />
          {estado === "esperando" ? (
            <>
              <p className="text-lg font-bold text-foreground">Actualizando WiWO.ADS…</p>
              <p className="text-sm text-foreground/60">Esperamos a que el servidor termine de actualizarse y guardamos tu progreso: sigues donde estabas.</p>
              <button type="button" onClick={() => seguirTrabajando(POSPONER_MS / 60_000)} className="text-xs font-semibold text-foreground/60 underline hover:text-foreground">
                Cancelar y seguir trabajando
              </button>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-foreground">El servidor sigue actualizándose</p>
              <p className="text-sm text-foreground/60">Tu trabajo está a salvo. Puedes seguir trabajando y actualizar en un rato, o reintentar ahora.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void actualizar()} className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90">
                  Reintentar
                </button>
                <button type="button" onClick={() => seguirTrabajando(5)} className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground/70 hover:text-foreground">
                  Seguir trabajando
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
  if (!hayNueva) return null;
  return (
    <div role="alert" className="fixed bottom-4 left-1/2 z-[150] flex w-[min(92vw,34rem)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl border border-brand/40 bg-card p-4 shadow-xl">
      <RefreshCw className="size-5 shrink-0 text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">Hay una nueva versión de WiWO.ADS</p>
        <p className="text-xs text-foreground/60">
          {confirmando
            ? "Tienes cambios sin aplicar en el editor: si actualizas ahora se pierden. Aplícalos primero o actualiza después."
            : "Actualiza cuando termines lo que estás haciendo: no se pierde nada de tu trabajo."}
        </p>
      </div>
      {confirmando ? (
        <>
          <button type="button" onClick={() => seguirTrabajando(POSPONER_MS / 60_000)} className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90">
            Seguir trabajando
          </button>
          <button type="button" onClick={() => void actualizar()} className="rounded-full border border-danger/40 px-3 py-2 text-xs font-semibold text-danger hover:bg-danger/10">
            Actualizar igual
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={pedirActualizar} className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90">
            Actualizar ahora
          </button>
          <button type="button" onClick={() => seguirTrabajando(POSPONER_MS / 60_000)} className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-foreground/70 hover:text-foreground">
            Después
          </button>
        </>
      )}
    </div>
  );
}
