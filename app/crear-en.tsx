"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Platform } from "@/lib/plataformas";
import { cn } from "@/lib/utils";

type Cuenta = { externalId: string; name: string; provider: string };
type Cliente = { id: string; name: string; accounts: Cuenta[] };
type Campana = { id: string; nombre: string | null; estado: string | null };
type Conjunto = { id: string; nombre: string | null; estado: string | null; campaignId: string | null };

export type DestinoDeCreacion = {
  portfolioId: string;
  platform: Platform;
  accountId: string;
  campaignId: string;
  campaignName: string;
  adsetId?: string;
  adsetName?: string;
  /** Renovar: anuncios viejos del conjunto que ya vienen marcados para retirarse al publicar el nuevo. */
  retirarAnuncios?: Array<{ id: string; nombre: string }>;
};

const campo = "mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";

/**
 * «Crear conjunto» y «Crear anuncio» desde la barra de la tabla: primero se elige dónde va (en qué campaña y, para un anuncio,
 * en qué conjunto) y recién ahí se abre el Constructor con ese destino ya puesto.
 */
export function ElegirDondeCrear({
  nivel,
  clienteId,
  onCerrar,
  onElegir,
  inicial,
}: {
  nivel: "conjunto" | "anuncio" | null;
  clienteId: string;
  /** Cuenta y campaña que ya vienen elegidas (por ejemplo, la de una decisión). */
  inicial?: { accountId: string; campaignId: string };
  onCerrar: () => void;
  onElegir: (destino: DestinoDeCreacion) => void;
}) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cuenta, setCuenta] = useState("");
  const [arbol, setArbol] = useState<{ campanas: Campana[]; conjuntos: Conjunto[] } | null>(null);
  const [campanaId, setCampanaId] = useState("");
  const [conjuntoId, setConjuntoId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!nivel) return;
    let vivo = true;
    fetch("/api/clientes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { portfolios: Cliente[] }) => {
        if (!vivo) return;
        const c = j.portfolios.find((p) => p.id === clienteId) ?? null;
        setCliente(c);
        const norm = (x: string) => x.replace(/^act_/, "").replace(/-/g, "");
        const deLaDecision = inicial ? c?.accounts.find((a) => norm(a.externalId) === norm(inicial.accountId))?.externalId : undefined;
        setCuenta(deLaDecision ?? c?.accounts.find((a) => a.provider === "meta" || a.provider === "google")?.externalId ?? "");
      })
      .catch(() => vivo && setError("No se pudo leer el cliente"));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `inicial` solo se lee al abrir
  }, [nivel, clienteId]);

  const cuentaActual = cliente?.accounts.find((a) => a.externalId === cuenta) ?? null;

  useEffect(() => {
    if (!nivel || !cliente || !cuentaActual) return;
    let vivo = true;
    const p = new URLSearchParams({ portfolioId: cliente.id, accountId: cuentaActual.externalId, provider: cuentaActual.provider });
    fetch(`/api/entidades/arbol?${p}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as { campanas?: Campana[]; conjuntos?: Conjunto[]; error?: string };
        if (!r.ok) throw new Error(j.error ?? "No se pudieron leer las campañas");
        if (vivo) {
          setArbol({ campanas: j.campanas ?? [], conjuntos: j.conjuntos ?? [] });
          setCampanaId(inicial && (j.campanas ?? []).some((c) => c.id === inicial.campaignId) ? inicial.campaignId : "");
          setConjuntoId("");
          setError(null);
        }
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudieron leer las campañas"));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `inicial` solo se lee al cargar el árbol
  }, [nivel, cliente, cuentaActual]);

  const campana = arbol?.campanas.find((c) => c.id === campanaId) ?? null;
  const conjuntos = useMemo(() => (arbol?.conjuntos ?? []).filter((c) => c.campaignId === campanaId), [arbol, campanaId]);
  // Con un solo conjunto en la campaña, ya queda elegido.
  const unicoConjunto = nivel === "anuncio" && conjuntos.length === 1 ? conjuntos[0] : null;
  const conjunto = conjuntos.find((c) => c.id === conjuntoId) ?? unicoConjunto;
  const listo = Boolean(cliente && cuentaActual && campana && (nivel === "conjunto" || conjunto));

  return (
    <Dialog open={nivel !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{nivel === "anuncio" ? "Crear anuncio" : "Crear conjunto"}</DialogTitle>
          <DialogDescription>
            {nivel === "anuncio" ? "Elige la campaña y el conjunto donde va el anuncio." : "Elige la campaña donde va el conjunto."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {cliente && cliente.accounts.filter((a) => a.provider === "meta" || a.provider === "google").length > 1 && (
            <label className="block text-xs font-semibold text-foreground/70">
              Cuenta
              <select className={campo} value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
                {cliente.accounts.filter((a) => a.provider === "meta" || a.provider === "google").map((a) => (
                  <option key={a.externalId} value={a.externalId}>{a.name || a.externalId} · {a.provider === "meta" ? "Meta" : "Google"}</option>
                ))}
              </select>
            </label>
          )}
          {!arbol && !error && <p className="text-sm text-muted-foreground">Leyendo campañas…</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
          {arbol && (
            <>
              <label className="block text-xs font-semibold text-foreground/70">
                Campaña
                <select className={campo} value={campanaId} onChange={(e) => { setCampanaId(e.target.value); setConjuntoId(""); }}>
                  <option value="">Elige una campaña…</option>
                  {arbol.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.estado ? ` · ${c.estado}` : ""}</option>)}
                </select>
              </label>
              {nivel === "anuncio" && (
                <label className="block text-xs font-semibold text-foreground/70">
                  Conjunto
                  <select className={campo} value={conjunto?.id ?? ""} disabled={!campanaId} onChange={(e) => setConjuntoId(e.target.value)}>
                    <option value="">{campanaId ? "Elige un conjunto…" : "Primero la campaña"}</option>
                    {conjuntos.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.estado ? ` · ${c.estado}` : ""}</option>)}
                  </select>
                </label>
              )}
            </>
          )}
          <Button
            type="button"
            className={cn("w-full font-extrabold")}
            disabled={!listo}
            onClick={() => {
              if (!cliente || !cuentaActual || !campana) return;
              onElegir({
                portfolioId: cliente.id,
                platform: cuentaActual.provider as Platform,
                accountId: cuentaActual.externalId,
                campaignId: campana.id,
                campaignName: campana.nombre ?? "",
                ...(nivel === "anuncio" && conjunto ? { adsetId: conjunto.id, adsetName: conjunto.nombre ?? "" } : {}),
              });
              onCerrar();
            }}
          >
            Continuar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
