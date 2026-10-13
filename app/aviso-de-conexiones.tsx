"use client";

import { useEffect, useState } from "react";
import { PlugZap, X } from "lucide-react";

import type { ResumenDeConexiones } from "@/lib/conexiones-equipo-pura";
import { cn } from "@/lib/utils";

/**
 * Avisa a TODO el equipo cuando una conexión del equipo (Google, Meta, LinkedIn) no está activa, y qué hacer según el rol: quien
 * administra la conecta en Cuentas (una sola vez, queda para todos); quien no, sabe a quién avisar. Si todo está bien no se ve.
 */
const CLAVE = "wiwo:aviso-conexiones-cerrado";
const OCULTO_MS = 4 * 60 * 60 * 1000;

function cerradoHace(): number | null {
  try {
    const v = window.sessionStorage.getItem(CLAVE);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function AvisoDeConexiones({ onAbrirCuentas }: { onAbrirCuentas?: () => void }) {
  const [resumen, setResumen] = useState<ResumenDeConexiones | null>(null);
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    let vivo = true;
    const leer = () =>
      fetch("/api/conexiones/estado", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<ResumenDeConexiones>) : null))
        .then((j) => vivo && j && setResumen(j))
        .catch(() => undefined);
    void leer();
    const t = window.setInterval(leer, 10 * 60 * 1000);
    const ultimo = cerradoHace();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se lee del navegador una sola vez al montar
    if (ultimo !== null && Date.now() - ultimo < OCULTO_MS) setCerrado(true);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, []);

  if (!resumen || resumen.todoBien || cerrado) return null;
  const pendientes = resumen.conexiones.filter((c) => c.estado !== "ok");
  const graves = pendientes.some((c) => c.estado !== "por_vencer");

  return (
    <div role="status" className={cn("mx-auto mt-3 flex w-full max-w-[1500px] items-start gap-3 rounded-2xl border px-4 py-3", graves ? "border-warn/30 bg-warn/8" : "border-brand/25 bg-brand/6")}>
      <PlugZap className={cn("mt-0.5 size-4 shrink-0", graves ? "text-warn" : "text-brand")} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-semibold text-foreground">
          {resumen.puedeAdministrar ? "Faltan conexiones del equipo" : "Hay conexiones del equipo que no están activas"}
        </p>
        <ul className="space-y-1 text-xs leading-5 text-foreground/70">
          {pendientes.map((c) => (
            <li key={c.proveedor}>
              <span className="text-foreground/85">{c.mensaje}</span> <span className="text-foreground/55">{c.accion}</span>
            </li>
          ))}
        </ul>
        {resumen.puedeAdministrar && onAbrirCuentas && (
          <button type="button" onClick={onAbrirCuentas} className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90">
            Ir a Cuentas y conectar
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Ocultar por ahora"
        onClick={() => {
          setCerrado(true);
          try {
            window.sessionStorage.setItem(CLAVE, String(Date.now()));
          } catch {
            // sin almacenamiento solo se oculta en esta vista
          }
        }}
        className="rounded-full p-1 text-foreground/45 hover:bg-foreground/8 hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
