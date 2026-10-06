"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ETIQUETA_METRICA,
  ETIQUETA_PERIODO,
  METRICAS_DE_REGLA,
  PERIODOS_DE_REGLA,
  type AccionDeRegla,
  type MetricaDeRegla,
  type NivelDeRegla,
  type OperadorDeRegla,
  type PeriodoDeRegla,
} from "@/lib/reglas-automaticas-pura";
import { cn } from "@/lib/utils";
import { Surface } from "./ui";

type Cuenta = { externalId: string; name: string; provider: string; currency: string | null };
type Cliente = { id: string; name: string; accounts: Cuenta[] };
type Arbol = {
  campanas: Array<{ id: string; nombre: string | null }>;
  conjuntos: Array<{ id: string; nombre: string | null; campaignId: string | null }>;
  anuncios?: Array<{ id: string; nombre: string | null; campaignId: string | null; conjuntoId: string | null }>;
};
type Regla = {
  id: string; plataforma: string; cuenta: string; entidad: string; nivel: string; texto: string; activa: boolean;
  disparadaAt: number | null; ultimoValor: number | null; ultimoResultado: string | null;
};

const campo = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";
const NIVELES: Array<{ id: NivelDeRegla; label: string }> = [
  { id: "campana", label: "Campaña" },
  { id: "conjunto", label: "Conjunto" },
  { id: "anuncio", label: "Anuncio" },
];

/** Reglas como las de Meta y Google: «si el gasto de hoy llega a 10 USD, pausar». Solo administrador y supervisor. */
type Nativa = { id: string; nombre: string; estado: string; nivel: string | null; entidadesCubiertas: number | null; descripcion: string };
type NativasDeCuenta = { clienteId: string; cliente: string; cuenta: string; reglas: Nativa[]; error: string | null };

/** Reglas que ya existen dentro de las plataformas (hoy Meta). Solo lectura: no se editan ni se activan desde aquí. */
function ReglasDeLasPlataformas({ clienteId }: { clienteId: string | null }) {
  const [datos, setDatos] = useState<{ cuentas: NativasDeCuenta[]; nota: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const cargar = async () => {
    setCargando(true);
    setFallo(null);
    try {
      const r = await fetch(`/api/reglas/nativas${clienteId ? `?clienteId=${encodeURIComponent(clienteId)}` : ""}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      setDatos(await r.json());
    } catch {
      setFallo("No pude leer las reglas de las plataformas.");
    } finally {
      setCargando(false);
    }
  };
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-micro text-[0.65rem] text-muted-foreground">REGLAS DE LAS PLATAFORMAS · SOLO LECTURA</h3>
        <Button type="button" size="sm" variant="outline" disabled={cargando} onClick={() => void cargar()}>
          {cargando ? "Leyendo…" : datos ? "Actualizar" : clienteId ? "Cargar las de este cliente" : "Cargar las de todos los clientes"}
        </Button>
      </div>
      {fallo && <p className="text-sm text-warn">{fallo}</p>}
      {datos && <p className="text-xs text-muted-foreground">{datos.nota}</p>}
      {datos && datos.cuentas.length === 0 && <p className="text-sm text-muted-foreground">No hay cuentas de Meta a tu alcance.</p>}
      {datos?.cuentas.map((c) => (
        <Surface key={c.cuenta} className="p-4">
          <p className="text-sm font-semibold text-foreground">{c.cliente} · Meta <span className="font-normal text-muted-foreground">{c.cuenta}</span></p>
          {c.error && <p className="mt-1 text-xs text-warn">{c.error}</p>}
          {!c.error && c.reglas.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Esta cuenta no tiene reglas en Meta.</p>}
          <ul className="mt-2 space-y-2">
            {c.reglas.map((r) => (
              <li key={r.id} className="text-xs leading-5">
                <span className="font-semibold text-foreground">{r.nombre}</span> <span className="text-muted-foreground">· {r.estado === "ENABLED" ? "activa" : r.estado.toLowerCase()}{r.entidadesCubiertas !== null ? ` · vigila ${r.entidadesCubiertas}` : ""}</span>
                <br />
                <span className="text-foreground/75">{r.descripcion}</span>
              </li>
            ))}
          </ul>
        </Surface>
      ))}
    </section>
  );
}

export function ReglasView({ clienteId }: { clienteId: string | null }) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [cuenta, setCuenta] = useState("");
  const [arbol, setArbol] = useState<Arbol | null>(null);
  const [nivel, setNivel] = useState<NivelDeRegla>("campana");
  const [entidadId, setEntidadId] = useState("");
  const [metrica, setMetrica] = useState<MetricaDeRegla>("gasto");
  const [operador, setOperador] = useState<OperadorDeRegla>(">=");
  const [umbral, setUmbral] = useState("");
  const [periodo, setPeriodo] = useState<PeriodoDeRegla>("hoy");
  const [accion, setAccion] = useState<AccionDeRegla>("pausar");
  const [porcentaje, setPorcentaje] = useState("20");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargarReglas = useCallback(async () => {
    const r = await fetch("/api/reglas", { cache: "no-store" });
    if (r.ok) setReglas(((await r.json()) as { reglas: Regla[] }).reglas);
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch("/api/reglas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { reglas: [] }))
      .then((j: { reglas: Regla[] }) => vivo && setReglas(j.reglas))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!clienteId) return;
    let vivo = true;
    fetch("/api/clientes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { portfolios: Cliente[] }) => {
        if (!vivo) return;
        const c = j.portfolios.find((p) => p.id === clienteId) ?? null;
        setCliente(c);
        setCuenta(c?.accounts.find((a) => a.provider === "meta" || a.provider === "google")?.externalId ?? "");
        setArbol(null);
        setEntidadId("");
      })
      .catch(() => vivo && setError("No se pudo leer el cliente"));
    return () => {
      vivo = false;
    };
  }, [clienteId]);

  const cuentaActual = cliente?.accounts.find((a) => a.externalId === cuenta) ?? null;

  useEffect(() => {
    if (!cliente || !cuentaActual) return;
    let vivo = true;
    const p = new URLSearchParams({ portfolioId: cliente.id, accountId: cuentaActual.externalId, provider: cuentaActual.provider, anuncios: "1" });
    fetch(`/api/entidades/arbol?${p}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as Arbol & { error?: string };
        if (!r.ok) throw new Error(j.error ?? "No se pudieron leer las campañas");
        if (vivo) {
          setArbol(j);
          setError(null);
        }
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudieron leer las campañas"));
    return () => {
      vivo = false;
    };
  }, [cliente, cuentaActual]);

  const opciones = useMemo(() => {
    if (!arbol) return [];
    if (nivel === "campana") return arbol.campanas.map((c) => ({ id: c.id, nombre: c.nombre ?? c.id, campaignId: c.id, adsetId: null as string | null }));
    if (nivel === "conjunto") return arbol.conjuntos.map((c) => ({ id: c.id, nombre: c.nombre ?? c.id, campaignId: c.campaignId, adsetId: c.id }));
    return (arbol.anuncios ?? []).map((a) => ({ id: a.id, nombre: a.nombre ?? a.id, campaignId: a.campaignId, adsetId: a.conjuntoId }));
  }, [arbol, nivel]);

  async function crear() {
    if (!cliente || !cuentaActual) return;
    const elegida = opciones.find((o) => o.id === entidadId);
    const numero = Number(umbral.replace(",", "."));
    if (!elegida || !Number.isFinite(numero) || numero <= 0) {
      setError("Elige qué vigilar y un umbral mayor que cero.");
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch("/api/reglas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          regla: { clienteId: cliente.id, plataforma: cuentaActual.provider, cuenta: cuentaActual.externalId, nivel, entidadId: elegida.id, entidad: elegida.nombre, campaignId: elegida.campaignId, adsetId: elegida.adsetId, metrica, operador, umbral: numero, periodo, accion, accionValor: accion === "bajar_presupuesto" ? Number(porcentaje) : null, moneda: cuentaActual.currency },
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo crear la regla");
      setUmbral("");
      await cargarReglas();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la regla");
    } finally {
      setOcupado(false);
    }
  }

  async function accionSobre(id: string, cuerpo: Record<string, unknown>) {
    await fetch("/api/reglas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...cuerpo }) });
    await cargarReglas();
  }

  async function evaluarAhora() {
    setOcupado(true);
    setAviso(null);
    try {
      const r = await fetch("/api/reglas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ evaluar: true }) });
      const j = (await r.json()) as { revisadas?: number; disparadas?: Array<{ entidad: string; resultado: string }>; error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo evaluar");
      setAviso(j.disparadas?.length ? j.disparadas.map((d) => `${d.entidad}: ${d.resultado}`).join(" · ") : `Revisé ${j.revisadas ?? 0} regla(s): ninguna se cumple por ahora.`);
      await cargarReglas();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo evaluar");
    } finally {
      setOcupado(false);
    }
  }

  if (!clienteId) return <div className="p-6 text-sm text-muted-foreground">Elige un cliente arriba para empezar.</div>;

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-5 p-4 md:p-6">
      <div>
        <h2 className="neo-section-title">Reglas</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/58">
          Como las reglas de Meta y Google: «si el gasto de hoy llega a 10 USD, pausar». Una regla que pausa solo pausa (no activa ni cambia presupuestos) y queda en la auditoría.
          Se revisan mientras alguien del equipo tiene WiWO.ADS abierto y con «Evaluar ahora»; el gasto viene de Windsor y puede ir unos minutos atrasado.
        </p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {aviso && <p className="text-sm text-foreground/80">{aviso}</p>}

      <Surface className="space-y-3 p-4">
        <h3 className="font-micro text-[0.65rem] text-muted-foreground">NUEVA REGLA{cliente ? ` · ${cliente.name.toUpperCase()}` : ""}</h3>
        <label className="block text-xs font-semibold text-foreground/70">
          Cuenta
          <select className={cn(campo, "mt-1")} value={cuenta} onChange={(e) => { setCuenta(e.target.value); setEntidadId(""); }}>
            {(cliente?.accounts ?? []).filter((a) => a.provider === "meta" || a.provider === "google").map((a) => (
              <option key={a.externalId} value={a.externalId}>{a.provider === "meta" ? "Meta" : "Google"} · {a.name || a.externalId}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {NIVELES.map((n) => (
            <button key={n.id} type="button" onClick={() => { setNivel(n.id); setEntidadId(""); }} className={cn("h-10 rounded-full border text-sm font-semibold", nivel === n.id ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted-foreground")}>
              {n.label}
            </button>
          ))}
        </div>
        <select className={campo} value={entidadId} onChange={(e) => setEntidadId(e.target.value)} disabled={!arbol}>
          <option value="">{arbol ? "Elige qué vigilar…" : "Leyendo…"}</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>{o.nombre}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select className={campo} value={metrica} onChange={(e) => setMetrica(e.target.value as MetricaDeRegla)}>
            {METRICAS_DE_REGLA.map((m) => <option key={m} value={m}>{ETIQUETA_METRICA[m]}</option>)}
          </select>
          <select className={campo} value={operador} onChange={(e) => setOperador(e.target.value as OperadorDeRegla)}>
            <option value=">=">llega a o supera</option>
            <option value="<=">baja de</option>
          </select>
          <input className={campo} inputMode="decimal" placeholder={`Valor${cuentaActual?.currency ? ` (${cuentaActual.currency})` : ""}`} value={umbral} onChange={(e) => setUmbral(e.target.value)} />
          <select className={campo} value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoDeRegla)}>
            {PERIODOS_DE_REGLA.map((p) => <option key={p} value={p}>{ETIQUETA_PERIODO[p]}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["pausar", "bajar_presupuesto", "avisar"] as const).map((a) => (
            <button
              key={a}
              type="button"
              disabled={a === "bajar_presupuesto" && nivel === "anuncio"}
              title={a === "bajar_presupuesto" && nivel === "anuncio" ? "Un anuncio no tiene presupuesto propio: usa un conjunto o una campaña." : undefined}
              onClick={() => setAccion(a)}
              className={cn("h-10 rounded-full border text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40", accion === a ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted-foreground")}
            >
              {a === "pausar" ? "Pausar" : a === "bajar_presupuesto" ? "Bajar presupuesto" : "Solo avisar"}
            </button>
          ))}
        </div>
        {accion === "bajar_presupuesto" && nivel !== "anuncio" && (
          <label className="block text-xs font-semibold text-foreground/70">
            Cuánto bajar el presupuesto diario (%, de 1 a 90)
            <input className={cn(campo, "mt-1")} inputMode="numeric" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} />
          </label>
        )}
        <Button type="button" className="w-full font-extrabold" disabled={ocupado} onClick={() => void crear()}>
          Crear regla
        </Button>
      </Surface>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-micro text-[0.65rem] text-muted-foreground">REGLAS ({reglas.length})</h3>
          <Button type="button" size="sm" variant="outline" disabled={ocupado || reglas.length === 0} onClick={() => void evaluarAhora()}>
            <Play /> Evaluar ahora
          </Button>
        </div>
        {reglas.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay reglas.</p>}
        {reglas.map((r) => (
          <Surface key={r.id} className="p-4">
            <p className="text-sm font-semibold text-foreground">{r.entidad}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{r.plataforma === "meta" ? "Meta" : "Google"} · {NIVELES.find((n) => n.id === r.nivel)?.label} · {r.cuenta}</p>
            <p className="mt-1.5 text-xs leading-5 text-foreground/75">{r.texto}.</p>
            {r.disparadaAt && <p className="mt-1 text-xs text-warn">Se cumplió {new Date(r.disparadaAt).toLocaleString("es")}{r.ultimoValor !== null ? ` (valor ${r.ultimoValor.toFixed(2)})` : ""}: {r.ultimoResultado}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => void accionSobre(r.id, { activa: !r.activa })}>{r.activa ? "Desactivar" : "Activar"}</Button>
              {r.disparadaAt && <Button type="button" size="sm" variant="ghost" onClick={() => void accionSobre(r.id, { rearmar: true })}>Rearmar</Button>}
              <Button type="button" size="sm" variant="ghost" aria-label="Borrar regla" onClick={() => void accionSobre(r.id, { borrar: true })}><Trash2 /></Button>
            </div>
          </Surface>
        ))}
      </section>

      <ReglasDeLasPlataformas clienteId={clienteId} />
    </div>
  );
}
