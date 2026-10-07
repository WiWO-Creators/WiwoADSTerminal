"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Surface } from "./ui";

type Permiso = { llave: number; ve: boolean; tareas: string[]; puede: boolean };
type Cuenta = {
  clienteId: string;
  cliente: string;
  cuenta: string;
  paginaId: string | null;
  cuentaPorLlave: Permiso[];
  paginaPorLlave: Permiso[];
  llavesCompletas: number[];
  estado: "ok" | "advertencia" | "problema";
  mensaje: string;
};

const ICONO = { ok: CheckCircle2, advertencia: AlertTriangle, problema: XCircle } as const;
const TONO = { ok: "text-ok", advertencia: "text-warn", problema: "text-danger" } as const;

const texto = (p: Permiso) => (!p.ve ? "no la ve" : p.tareas.length === 0 ? "la ve, sin permisos" : p.tareas.join(", ").toLowerCase());

/**
 * Qué llave de Meta (usuario del sistema) ve cada cuenta y página de los clientes, y con qué permisos. Para crear un anuncio
 * desde una publicación hace falta una llave que pueda anunciar en la cuenta Y en la página: aquí se ve de un vistazo
 * cuál falta, sin tener que revisar Meta cuenta por cuenta. Solo lectura.
 */
export function DiagnosticoView({ clienteId }: { clienteId: string | null }) {
  const [datos, setDatos] = useState<{ llaves: number; cuentas: Cuenta[] } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revisar() {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(`/api/diagnostico${clienteId ? `?clienteId=${encodeURIComponent(clienteId)}` : ""}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "No se pudo hacer el diagnóstico");
      setDatos(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo hacer el diagnóstico");
    } finally {
      setCargando(false);
    }
  }

  const problemas = datos?.cuentas.filter((c) => c.estado === "problema").length ?? 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
      <div>
        <h2 className="neo-section-title">Diagnóstico de permisos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Qué llave de Meta ve cada cuenta y página, y con qué permisos. Para crear anuncios desde publicaciones hace falta una llave que pueda
          anunciar en la cuenta y en la página a la vez.
        </p>
      </div>
      <Button type="button" disabled={cargando} onClick={() => void revisar()}>
        {cargando ? "Revisando…" : datos ? "Volver a revisar" : clienteId ? "Revisar este cliente" : "Revisar todos los clientes"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
      {datos && (
        <p className="text-sm text-foreground/70">
          {datos.llaves} {datos.llaves === 1 ? "llave" : "llaves"} · {datos.cuentas.length} cuentas · {problemas === 0 ? "sin problemas" : `${problemas} con problema`}
        </p>
      )}
      {datos?.cuentas
        .slice()
        .sort((a, b) => ["problema", "advertencia", "ok"].indexOf(a.estado) - ["problema", "advertencia", "ok"].indexOf(b.estado))
        .map((c) => {
          const Icono = ICONO[c.estado];
          return (
            <Surface key={`${c.clienteId}-${c.cuenta}`} className="p-4">
              <div className="flex items-start gap-2">
                <Icono className={cn("mt-0.5 size-4 shrink-0", TONO[c.estado])} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {c.cliente} <span className="font-normal text-muted-foreground">· cuenta {c.cuenta}{c.paginaId ? ` · página ${c.paginaId}` : " · sin página"}</span>
                  </p>
                  <p className={cn("mt-0.5 text-xs", TONO[c.estado])}>{c.mensaje}</p>
                </div>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-foreground/70">
                {c.cuentaPorLlave.map((p, i) => (
                  <li key={p.llave}>
                    <span className="font-semibold text-foreground">Llave {p.llave}</span> · cuenta: {texto(p)}
                    {c.paginaId ? ` · página: ${texto(c.paginaPorLlave[i])}` : ""}
                    {c.llavesCompletas.includes(p.llave) ? " ✓" : ""}
                  </li>
                ))}
              </ul>
            </Surface>
          );
        })}
    </div>
  );
}
