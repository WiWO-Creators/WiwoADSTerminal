"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Surface } from "./ui";

type Cuenta = { externalId: string; name: string; provider: string; currency: string | null };
type Cliente = { id: string; name: string; accounts: Cuenta[] };
type Anuncio = { id: string; nombre: string | null; campaignId: string | null };
type Nativa = { id: string; nombre: string; estado: string; nivel: string | null; descripcion: string; definicion: unknown; motivo: string | null };

const campo = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";

/**
 * Crea reglas DENTRO de Meta (las evalúa Meta, no este servidor), para varios anuncios a la vez:
 *  - «Tope de gasto»: se pausan al gastar más de X en total.
 *  - «Copiar una regla existente»: una copia con la misma condición para los anuncios elegidos. La original no se toca.
 * Solo supervisores y administradores.
 */
export function ReglasEnMeta({ clienteId }: { clienteId: string | null }) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cuenta, setCuenta] = useState("");
  const [anuncios, setAnuncios] = useState<Anuncio[] | null>(null);
  const [nativas, setNativas] = useState<Nativa[]>([]);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [modo, setModo] = useState<"gasto" | "copiar">("gasto");
  const [gasto, setGasto] = useState("");
  const [reglaId, setReglaId] = useState("");
  const [nombre, setNombre] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setAnuncios(null);
        setElegidos([]);
      })
      .catch(() => vivo && setError("No se pudo leer el cliente"));
    return () => {
      vivo = false;
    };
  }, [clienteId]);

  useEffect(() => {
    if (!cliente || !cuenta) return;
    let vivo = true;
    const p = new URLSearchParams({ portfolioId: cliente.id, accountId: cuenta, provider: "meta", anuncios: "1" });
    fetch(`/api/entidades/arbol?${p}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { anuncios?: Anuncio[]; error?: string }) => {
        if (!vivo) return;
        if (j.error) throw new Error(j.error);
        setAnuncios(j.anuncios ?? []);
        setError(null);
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudieron leer los anuncios"));
    fetch(`/api/reglas/nativas?clienteId=${encodeURIComponent(cliente.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { cuentas?: Array<{ cuenta: string; reglas: Nativa[] }> }) => {
        if (vivo) setNativas((j.cuentas ?? []).find((c) => c.cuenta === cuenta)?.reglas.filter((r) => r.nivel === "AD" && r.definicion && !r.motivo) ?? []);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [cliente, cuenta]);

  const visibles = useMemo(
    () => (anuncios ?? []).filter((a) => (a.nombre ?? a.id).toLowerCase().includes(busqueda.trim().toLowerCase())).slice(0, 100),
    [anuncios, busqueda],
  );
  const alternar = (id: string) => setElegidos((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
  const moneda = cliente?.accounts.find((a) => a.externalId === cuenta)?.currency ?? "";

  async function crear() {
    if (!cliente || !cuenta) return;
    const gastoNum = Number(gasto.replace(",", "."));
    if (elegidos.length === 0) return setError("Elige al menos un anuncio.");
    if (modo === "gasto" && !(gastoNum > 0)) return setError("Escribe un gasto máximo mayor que cero.");
    if (modo === "copiar" && !reglaId) return setError("Elige la regla que quieres copiar.");
    const base = modo === "gasto" ? `Tope de gasto ${gastoNum} ${moneda}` : (nativas.find((r) => r.id === reglaId)?.nombre ?? "Regla");
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch("/api/reglas/meta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modo, clienteId: cliente.id, accountId: cuenta, nombre: nombre.trim() || `${base} · ${elegidos.length} anuncio${elegidos.length === 1 ? "" : "s"}`, anuncioIds: elegidos, gasto: gastoNum, reglaId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "No se pudo crear la regla");
      toast.success("Regla creada en Meta: Meta la evalúa por su cuenta.");
      setElegidos([]);
      setNombre("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la regla");
    } finally {
      setOcupado(false);
    }
  }

  if (!clienteId) {
    return (
      <section className="space-y-2">
        <h3 className="font-micro text-[0.65rem] text-muted-foreground">CREAR REGLA EN META</h3>
        <p className="text-sm text-muted-foreground">Elige un cliente arriba para crear reglas dentro de Meta.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="font-micro text-[0.65rem] text-muted-foreground">CREAR REGLA EN META · PARA VARIOS ANUNCIOS</h3>
      <Surface className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">La regla vive en Meta: Meta la evalúa sola, sin depender de este servidor. Las reglas que ya existen no se modifican.</p>
        {cliente && cliente.accounts.filter((a) => a.provider === "meta").length > 1 && (
          <select className={campo} value={cuenta} onChange={(e) => { setCuenta(e.target.value); setAnuncios(null); setElegidos([]); }}>
            {cliente.accounts.filter((a) => a.provider === "meta").map((a) => <option key={a.externalId} value={a.externalId}>{a.name}</option>)}
          </select>
        )}
        <div className="grid grid-cols-2 gap-2">
          {([["gasto", "Tope de gasto"], ["copiar", "Copiar una regla"]] as const).map(([m, etiqueta]) => (
            <button key={m} type="button" onClick={() => setModo(m)} className={cn("h-10 rounded-full border text-sm font-semibold", modo === m ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted-foreground")}>{etiqueta}</button>
          ))}
        </div>
        {modo === "gasto" ? (
          <label className="block text-xs font-semibold text-foreground/70">
            Gasto máximo en total por anuncio{moneda ? ` (${moneda})` : ""}: al superarlo, Meta lo pausa
            <input className={cn(campo, "mt-1")} inputMode="decimal" value={gasto} onChange={(e) => setGasto(e.target.value)} />
          </label>
        ) : (
          <label className="block text-xs font-semibold text-foreground/70">
            Regla de esta cuenta que se copia (solo las que vigilan anuncios)
            <select className={cn(campo, "mt-1")} value={reglaId} onChange={(e) => setReglaId(e.target.value)}>
              <option value="">Elige una…</option>
              {nativas.map((r) => <option key={r.id} value={r.id}>{r.nombre} — {r.descripcion}</option>)}
            </select>
          </label>
        )}
        <label className="block text-xs font-semibold text-foreground/70">
          Nombre de la regla (opcional)
          <input className={cn(campo, "mt-1")} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Se arma solo si lo dejas vacío" />
        </label>
        <div>
          <p className="text-xs font-semibold text-foreground/70">Anuncios ({elegidos.length} elegidos)</p>
          <input className={cn(campo, "mt-1")} placeholder="Buscar anuncio…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
            {anuncios === null && <p className="p-2 text-xs text-muted-foreground">Leyendo anuncios…</p>}
            {anuncios !== null && visibles.length === 0 && <p className="p-2 text-xs text-muted-foreground">No hay anuncios.</p>}
            {visibles.map((a) => (
              <label key={a.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-foreground/5">
                <input type="checkbox" checked={elegidos.includes(a.id)} onChange={() => alternar(a.id)} />
                <span className="truncate">{a.nombre ?? a.id}</span>
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="button" className="w-full font-extrabold" disabled={ocupado} onClick={() => void crear()}>
          {ocupado ? "Creando…" : "Crear regla en Meta"}
        </Button>
      </Surface>
    </section>
  );
}
