"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { BUILD_ID } from "@/lib/version";
import { ThinkingOrb } from "./ui";

const REVISAR_CADA_MS = 60_000;
const ESPERA_AUTOMATICA_S = 30;
const POSPONER_MS = 10 * 60_000;

/**
 * Avisa cuando se desplegó una versión nueva de WiWO.ADS: una alerta con cuenta regresiva y, al actualizar, una pantalla de carga
 * breve. Antes de recargar se guarda el progreso (pantalla, cliente y el borrador del Constructor) y se recupera solo.
 * Solo avisa en producción: en desarrollo la versión es «dev».
 */
export function AvisoDeActualizacion({ alGuardar }: { alGuardar: () => void }) {
  const [hayNueva, setHayNueva] = useState(false);
  const [segundos, setSegundos] = useState(ESPERA_AUTOMATICA_S);
  const [actualizando, setActualizando] = useState(false);
  const pospuestoHasta = useRef(0);
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

  const actualizarAhora = useCallback(() => {
    setActualizando(true);
    try {
      // Cada pantalla guarda lo suyo (el Constructor escucha este evento) y el tablero guarda dónde estaba la persona.
      window.dispatchEvent(new Event("wiwo:guardar-progreso"));
      guardar.current();
    } catch {
      // Guardar es una ayuda: si falla, igual se actualiza.
    }
    window.setTimeout(() => window.location.reload(), 1400);
  }, []);

  // Cuenta regresiva: si nadie decide, se actualiza sola (el progreso ya se guarda antes).
  useEffect(() => {
    if (!hayNueva || actualizando) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia la cuenta cada vez que aparece el aviso
    setSegundos(ESPERA_AUTOMATICA_S);
    const t = window.setInterval(() => setSegundos((s) => s - 1), 1000);
    return () => window.clearInterval(t);
  }, [hayNueva, actualizando]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- al llegar la cuenta a cero, pasa a la pantalla de carga
    if (hayNueva && !actualizando && segundos <= 0) actualizarAhora();
  }, [hayNueva, actualizando, segundos, actualizarAhora]);

  if (actualizando) {
    return (
      <div role="status" aria-live="polite" className="fixed inset-0 z-[200] grid place-items-center bg-background/95 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4 text-center">
          <ThinkingOrb size="xl" state="thinking" bare label="Actualizando" />
          <p className="text-lg font-bold text-foreground">Actualizando WiWO.ADS…</p>
          <p className="text-sm text-foreground/60">Guardamos tu progreso: sigues donde estabas.</p>
        </div>
      </div>
    );
  }
  if (!hayNueva) return null;
  return (
    <div role="alert" className="fixed bottom-4 left-1/2 z-[150] flex w-[min(92vw,34rem)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl border border-brand/40 bg-card p-4 shadow-xl">
      <RefreshCw className="size-5 shrink-0 text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">Hay una nueva actualización de WiWO.ADS</p>
        <p className="text-xs text-foreground/60">Se actualiza en {Math.max(segundos, 0)} s. Tu progreso se guarda y se recupera solo.</p>
      </div>
      <button type="button" onClick={actualizarAhora} className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90">
        Actualizar ahora
      </button>
      <button
        type="button"
        onClick={() => {
          pospuestoHasta.current = Date.now() + POSPONER_MS;
          setHayNueva(false);
        }}
        className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-foreground/70 hover:text-foreground"
      >
        Después
      </button>
    </div>
  );
}
