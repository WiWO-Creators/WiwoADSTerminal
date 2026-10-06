"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Surface } from "./ui";

type Cuenta = { externalId: string; name: string; provider: string };
type Cliente = { id: string; name: string; accounts: Cuenta[]; countries?: string[] };
type Audiencia = { id: string; nombre: string; tipo: string; subtipo: string; tamanoMinimo: number | null; tamanoMaximo: number | null; estado: string | null };
type Datos = { audiencias: Audiencia[]; pixeles: Array<{ id: string; nombre: string }>; reglas: Array<{ id: string; nombre: string; estado: string }> };

const campo = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";

/** Audiencias de Meta (API directa): ver las existentes y crear similares (lookalike) y de sitio web. Crear es solo de supervisores. */
export function AudienciasMeta({ clienteId, puedeAprobar }: { clienteId: string | null; puedeAprobar: boolean }) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cuenta, setCuenta] = useState("");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tipo, setTipo] = useState<"similar" | "web">("similar");
  const [nombre, setNombre] = useState("");
  const [origenId, setOrigenId] = useState("");
  const [pais, setPais] = useState("CL");
  const [porcentaje, setPorcentaje] = useState("1");
  const [pixelId, setPixelId] = useState("");
  const [dias, setDias] = useState("30");
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    if (!clienteId) return;
    let vivo = true;
    fetch("/api/clientes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { portfolios: Cliente[] }) => {
        if (!vivo) return;
        const c = j.portfolios.find((p) => p.id === clienteId) ?? null;
        setCliente(c);
        setCuenta(c?.accounts.find((a) => a.provider === "meta")?.externalId ?? "");
        setPais(c?.countries?.[0] ?? "CL");
        setDatos(null);
      })
      .catch(() => vivo && setError("No se pudo leer el cliente"));
    return () => {
      vivo = false;
    };
  }, [clienteId]);

  const cargar = useCallback(async () => {
    if (!cliente || !cuenta) return;
    try {
      const r = await fetch(`/api/meta/audiencias?portfolioId=${encodeURIComponent(cliente.id)}&accountId=${encodeURIComponent(cuenta)}`, { cache: "no-store" });
      const j = (await r.json()) as Datos & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudieron leer las audiencias");
      setDatos(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer las audiencias");
    }
  }, [cliente, cuenta]);

  useEffect(() => {
    let vivo = true;
    if (!cliente || !cuenta) return;
    fetch(`/api/meta/audiencias?portfolioId=${encodeURIComponent(cliente.id)}&accountId=${encodeURIComponent(cuenta)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as Datos & { error?: string };
        if (!r.ok) throw new Error(j.error ?? "No se pudieron leer las audiencias");
        if (vivo) {
          setDatos(j);
          setError(null);
        }
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudieron leer las audiencias"));
    return () => {
      vivo = false;
    };
  }, [cliente, cuenta]);

  async function crear() {
    if (!cliente) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const r = await fetch("/api/meta/audiencias", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portfolioId: cliente.id, accountId: cuenta, tipo, nombre, origenId, pais, porcentaje: Number(porcentaje), pixelId, dias: Number(dias), simular: false }),
      });
      const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo crear la audiencia");
      setAviso(`Audiencia creada (${j.id}). Meta puede tardar un rato en poblarla.`);
      setNombre("");
      setConfirmar(false);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la audiencia");
    } finally {
      setOcupado(false);
    }
  }

  if (!clienteId) return <p className="text-sm text-muted-foreground">Elige un cliente arriba para empezar.</p>;
  const cuentasMeta = (cliente?.accounts ?? []).filter((a) => a.provider === "meta");
  const listo = nombre.trim().length >= 3 && (tipo === "similar" ? origenId && Number(porcentaje) >= 1 && Number(porcentaje) <= 20 : pixelId && Number(dias) >= 1 && Number(dias) <= 180);

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm leading-6 text-foreground/58">
        Audiencias de Meta leídas y creadas directo con la API de Meta. Una audiencia similar (lookalike) parte de una personalizada existente. Las audiencias no gastan dinero, pero crearlas es real: no hay modo de prueba.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      {aviso && <p className="text-sm text-ok">{aviso}</p>}
      {cliente && cuentasMeta.length === 0 && <p className="text-sm text-muted-foreground">Este cliente no tiene cuentas de Meta.</p>}
      {cuentasMeta.length > 1 && (
        <select className={campo} value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
          {cuentasMeta.map((a) => <option key={a.externalId} value={a.externalId}>{a.name || a.externalId}</option>)}
        </select>
      )}

      {datos && (
        <Surface className="p-4">
          <h3 className="font-micro text-[0.65rem] text-muted-foreground">AUDIENCIAS ({datos.audiencias.length})</h3>
          {datos.audiencias.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Esta cuenta todavía no tiene audiencias.</p>}
          <ul className="mt-2 space-y-1.5">
            {datos.audiencias.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                <span className="min-w-0"><span className="font-semibold text-foreground">{a.nombre}</span> <span className="text-muted-foreground">· {a.tipo}</span></span>
                <span className="text-muted-foreground">{a.tamanoMinimo !== null ? `${a.tamanoMinimo.toLocaleString("es")}${a.tamanoMaximo && a.tamanoMaximo !== a.tamanoMinimo ? `–${a.tamanoMaximo.toLocaleString("es")}` : ""} personas` : "tamaño sin dato"}</span>
              </li>
            ))}
          </ul>
          {datos.reglas.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">Reglas automáticas dentro de Meta en esta cuenta: {datos.reglas.map((r) => `${r.nombre} (${r.estado})`).join(", ")}.</p>
          )}
        </Surface>
      )}

      {datos && puedeAprobar && (
        <Surface className="space-y-3 p-4">
          <h3 className="font-micro text-[0.65rem] text-muted-foreground">CREAR AUDIENCIA</h3>
          <div className="grid grid-cols-2 gap-2">
            {(["similar", "web"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTipo(t)} className={cn("h-10 rounded-full border text-sm font-semibold", tipo === t ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted-foreground")}>
                {t === "similar" ? "Similar (lookalike)" : "Visitantes del sitio"}
              </button>
            ))}
          </div>
          <input className={campo} placeholder="Nombre de la audiencia" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          {tipo === "similar" ? (
            <>
              <select className={campo} value={origenId} onChange={(e) => setOrigenId(e.target.value)}>
                <option value="">Audiencia de origen…</option>
                {datos.audiencias.filter((a) => a.tipo !== "Similar").map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input className={campo} placeholder="País (CL, PE…)" value={pais} maxLength={2} onChange={(e) => setPais(e.target.value.toUpperCase())} />
                <input className={campo} inputMode="decimal" placeholder="Similitud % (1 a 20)" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <select className={campo} value={pixelId} onChange={(e) => setPixelId(e.target.value)}>
                <option value="">{datos.pixeles.length ? "Píxel…" : "Sin píxeles en la cuenta"}</option>
                {datos.pixeles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <input className={campo} inputMode="numeric" placeholder="Días (1 a 180)" value={dias} onChange={(e) => setDias(e.target.value)} />
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-foreground/70">
            <input type="checkbox" checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} /> Entiendo que se crea de verdad en Meta.
          </label>
          <Button type="button" className="w-full font-extrabold" disabled={!listo || !confirmar || ocupado} onClick={() => void crear()}>
            {ocupado ? "Creando…" : "Crear audiencia"}
          </Button>
        </Surface>
      )}
    </div>
  );
}
