"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CheckCircle2, Clock, ExternalLink, Lightbulb, SkipForward, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AdSummary } from "@/lib/performance-store";
import type { SugerenciaVista } from "@/lib/sugerencias-store";
import { cn } from "@/lib/utils";
import { DetalleEntidadSheet, type EntidadParaDetalle } from "./detalle-entidad";
import { ImpulsarView } from "./impulsar-view";

type Datos = { pendientes: SugerenciaVista[]; puedeResolver: boolean };

const SEVERIDAD: Record<SugerenciaVista["severity"], { etiqueta: string; clase: string }> = {
  critical: { etiqueta: "Urgente", clase: "border-danger/40 bg-danger/10 text-danger" },
  high: { etiqueta: "Importante", clase: "border-warn/40 bg-warn/10 text-warn" },
  medium: { etiqueta: "Revisar", clase: "border-foreground/20 bg-foreground/5 text-foreground/70" },
  info: { etiqueta: "Oportunidad", clase: "border-brand/40 bg-brand/10 text-brand" },
};

const MOTIVOS = ["No aplica a este cliente", "Ya lo resolví por otro lado", "No estoy de acuerdo"];
/** Cuánto hay que arrastrar la tarjeta para que cuente como una decisión. */
const UMBRAL_ARRASTRE = 110;

/** Qué clase de decisión es, para filtrar la cola. */
function tipoDe(s: SugerenciaVista): string {
  if (s.accion?.tipo === "contenido") return "Contenido";
  if (s.accion?.tipo === "presupuesto") return "Presupuesto";
  if (s.accion?.tipo === "pausar") return "Pausar";
  return s.rule.startsWith("medicion_") ? "Medición" : "Revisar";
}

const idempotencia = () => `SUG-${crypto.randomUUID()}`;

async function pedir(cuerpo: unknown): Promise<{ ok: boolean; cuerpo: Record<string, unknown> }> {
  const respuesta = await fetch("/api/sugerencias", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return { ok: respuesta.ok, cuerpo: (await respuesta.json().catch(() => ({}))) as Record<string, unknown> };
}

/**
 * Sugerencias pendientes, una por una: ✕ descartar, ⏱ posponer, ✓ aprobar (o
 * arrastrar la tarjeta a la izquierda o a la derecha). Solo un administrador o
 * supervisor puede resolverlas; el resto las ve. Aprobar no aplica nada por sí
 * solo: pausar pide confirmación y un cambio de presupuesto se revisa en el editor.
 */
export function BotonDeSugerencias({
  clienteId,
  rango,
  modo = "boton",
}: {
  /** `pagina`: las tarjetas ocupan la pantalla (Decisiones); `boton`: un botón que las abre en un diálogo. */
  modo?: "boton" | "pagina";
  /** Cliente que se mira en el Dashboard; sin cliente, las de toda la cartera visible. */
  clienteId: string | null;
  rango: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [eligiendoMotivo, setEligiendoMotivo] = useState(false);
  const [pausando, setPausando] = useState<SugerenciaVista | null>(null);
  const [editor, setEditor] = useState<EntidadParaDetalle | null>(null);
  const [adsDelEditor, setAdsDelEditor] = useState<AdSummary[]>([]);
  const [resueltas, setResueltas] = useState(0);
  const [subiendo, setSubiendo] = useState<SugerenciaVista | null>(null);
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroPlataforma, setFiltroPlataforma] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [dx, setDx] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const arrastre = useRef<{ x: number; id: number } | null>(null);

  const leer = useCallback(async () => {
    const url = clienteId ? `/api/sugerencias?cliente=${encodeURIComponent(clienteId)}` : "/api/sugerencias";
    const respuesta = await fetch(url, { cache: "no-store" });
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) throw new Error(cuerpo?.error ?? "No se pudieron leer las sugerencias");
    setDatos({ pendientes: cuerpo.pendientes ?? [], puedeResolver: Boolean(cuerpo.puedeResolver) });
  }, [clienteId]);

  // Al mirar un cliente: lee lo que hay y, si toca, deja que el servidor revise su rendimiento.
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        await leer();
        if (cancelado || !clienteId) return;
        const evaluada = await pedir({ kind: "evaluar", cliente: clienteId });
        if (!cancelado && evaluada.ok && Number(evaluada.cuerpo.generadas ?? 0) > 0) await leer();
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : "No se pudieron leer las sugerencias");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clienteId, leer]);

  const pendientes = datos?.pendientes ?? [];
  // En pantalla completa hay cola con filtros y se elige cuál ver; en el diálogo, siempre la primera.
  const filtradas = pendientes.filter(
    (x) =>
      (!filtroCliente || x.clienteId === filtroCliente) &&
      (!filtroPlataforma || x.platform === filtroPlataforma) &&
      (!filtroTipo || tipoDe(x) === filtroTipo) &&
      (!busqueda.trim() || `${x.title} ${x.entityName ?? ""} ${x.clienteNombre}`.toLowerCase().includes(busqueda.trim().toLowerCase())),
  );
  const actual = modo === "pagina" ? (filtradas.find((x) => x.id === seleccionId) ?? filtradas[0] ?? null) : (pendientes[0] ?? null);
  const puede = Boolean(datos?.puedeResolver);
  const total = pendientes.length;

  function quitar(s: SugerenciaVista) {
    setDatos((d) => (d ? { ...d, pendientes: d.pendientes.filter((x) => x.id !== s.id) } : d));
    setDx(0);
    setEligiendoMotivo(false);
  }

  async function resolver(s: SugerenciaVista, tipo: "approve" | "discard" | "postpone", reason?: string): Promise<boolean> {
    setTrabajando(true);
    try {
      const r = await pedir({
        kind: "resolver",
        tipo,
        id: s.id,
        expectedVersion: s.version,
        idempotencyKey: idempotencia(),
        reason,
      });
      if (!r.ok) throw new Error(String(r.cuerpo.error ?? "No se pudo completar"));
      setResueltas((n) => n + 1);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar");
      setDx(0);
      return false;
    } finally {
      setTrabajando(false);
    }
  }

  async function abrirEnEditor(s: SugerenciaVista, conCambio: boolean) {
    if (!s.provider || !s.accountId || !s.entityId) return;
    // El árbol del editor necesita los anuncios del cliente: se piden solo ahora.
    if (s.clienteId) {
      try {
        const r = await fetch(
          `/api/dashboard?anuncios=1&cliente=${encodeURIComponent(s.clienteId)}&rango=${encodeURIComponent(rango)}`,
          { cache: "no-store" },
        );
        const cuerpo = await r.json().catch(() => null);
        if (r.ok) setAdsDelEditor(cuerpo?.performance?.ads ?? []);
      } catch {
        // Sin el árbol, el editor abre igual la campaña pedida.
      }
    }
    setEditor({
      provider: s.provider,
      accountId: s.accountId,
      nivel: "campana",
      id: s.entityId,
      nombre: s.entityName ?? s.title,
      currency: null,
      abrirEnEdicion: true,
      rango,
      sugerido: conCambio && s.accion?.tipo === "presupuesto" ? { presupuestoMonto: String(s.accion.monto) } : undefined,
    });
  }

  /** ✓ */
  async function aprobar(s: SugerenciaVista) {
    if (!puede || trabajando) return;
    if (s.accion?.tipo === "contenido") {
      setDx(0);
      setSubiendo(s);
      return;
    }
    if (s.accion?.tipo === "pausar") {
      setDx(0);
      setPausando(s);
      return;
    }
    if (!(await resolver(s, "approve"))) return;
    if (s.accion?.tipo === "presupuesto") {
      toast.success("Aprobada. Revisa el cambio de presupuesto y aplícalo.");
      quitar(s);
      await abrirEnEditor(s, true);
      return;
    }
    toast.success("Marcada como atendida");
    quitar(s);
  }

  async function pausarCampana(s: SugerenciaVista) {
    if (!s.provider || !s.accountId || !s.entityId) return;
    setTrabajando(true);
    try {
      const respuesta = await fetch("/api/anuncios/estado", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: s.provider,
          nivel: "campana",
          accountId: s.accountId,
          campaignId: s.entityId,
          activar: false,
        }),
      });
      const cuerpo = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || cuerpo?.ok === false) throw new Error(cuerpo?.error ?? "No se pudo pausar la campaña");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo pausar la campaña");
      setTrabajando(false);
      return;
    }
    setTrabajando(false);
    // Ya se pausó de verdad: se deja constancia de la aprobación.
    if (await resolver(s, "approve")) {
      toast.success("Campaña pausada");
      quitar(s);
    }
  }

  /** Quien no aprueba cambios propone la pausa: queda pendiente y no se pausa nada hasta que la apruebe un Lead o superior. */
  async function proponerPausa(s: SugerenciaVista) {
    if (!s.provider || !s.accountId || !s.entityId || trabajando) return;
    setTrabajando(true);
    try {
      const respuesta = await fetch("/api/entidades/editar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: s.provider, accountId: s.accountId, nivel: "campana", id: s.entityId, cambios: { pausar: true }, modo: "solicitar" }),
      });
      const cuerpo = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw new Error(cuerpo?.error ?? "No se pudo enviar la propuesta");
      toast.success("Propuesta enviada: nada se pausó todavía. Debe aprobarla un Lead o superior.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar la propuesta");
    } finally {
      setTrabajando(false);
    }
  }

  /** ⏱ */
  async function posponer(s: SugerenciaVista) {
    if (!puede || trabajando) return;
    if (await resolver(s, "postpone")) {
      toast.success("Vuelve a aparecer mañana");
      quitar(s);
    }
  }

  /** ✕, con su motivo */
  async function descartar(s: SugerenciaVista, motivo: string) {
    if (!puede || trabajando) return;
    if (await resolver(s, "discard", motivo)) quitar(s);
  }

  /** La deja para el final de la fila, sin resolverla. */
  function verDespues(s: SugerenciaVista) {
    setDatos((d) => (d ? { ...d, pendientes: [...d.pendientes.filter((x) => x.id !== s.id), s] } : d));
    setDx(0);
    setEligiendoMotivo(false);
  }

  // Teclado: ← descartar, → aprobar, ↓ posponer.
  useEffect(() => {
    if ((!abierto && modo !== "pagina") || !actual || !puede || pausando || editor || subiendo) return;
    const onKey = (e: KeyboardEvent) => {
      if (eligiendoMotivo) return;
      if (e.key === "ArrowLeft") setEligiendoMotivo(true);
      else if (e.key === "ArrowRight") void aprobar(actual);
      else if (e.key === "ArrowDown") void posponer(actual);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las acciones leen `actual` y el estado vigente en cada tecla
  }, [abierto, modo, actual, puede, pausando, editor, subiendo, eligiendoMotivo, trabajando]);

  function alBajar(e: React.PointerEvent<HTMLDivElement>) {
    if (!puede || trabajando || eligiendoMotivo) return;
    arrastre.current = { x: e.clientX, id: e.pointerId };
    setArrastrando(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function alMover(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastre.current) return;
    setDx(e.clientX - arrastre.current.x);
  }
  function alSoltar() {
    if (!arrastre.current || !actual) return;
    arrastre.current = null;
    setArrastrando(false);
    if (dx > UMBRAL_ARRASTRE) void aprobar(actual);
    else if (dx < -UMBRAL_ARRASTRE) {
      setDx(0);
      setEligiendoMotivo(true);
    } else setDx(0);
  }

  const sev = actual ? SEVERIDAD[actual.severity] : null;

  const cuerpo = (
    <>
          {error && <p className="rounded-xl border border-danger/25 bg-danger/8 p-3 text-sm text-danger">{error}</p>}

          {!actual && datos && !error && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="size-12 text-brand" />
              <p className="text-base font-bold text-foreground">
                {resueltas > 0 ? "¡Listo! Revisaste todo." : "No hay sugerencias pendientes."}
              </p>
              <p className="text-sm text-foreground/55">
                {resueltas > 0 ? `${resueltas} resueltas en esta sesión.` : "Aparecen solas cuando algo se sale de lo esperado."}
              </p>
            </div>
          )}

          {actual && sev && (
            <div className="space-y-4">
              <p className="text-center text-xs text-foreground/45">
                {total} {total === 1 ? "pendiente" : "pendientes"}
              </p>

              <div className="relative">
                {/* La que viene detrás, asomando. */}
                {total > 1 && (
                  <div className="absolute inset-x-3 -bottom-2 top-2 rounded-2xl border border-foreground/10 bg-card/60" />
                )}
                <div
                  onPointerDown={alBajar}
                  onPointerMove={alMover}
                  onPointerUp={alSoltar}
                  onPointerCancel={alSoltar}
                  style={{
                    transform: `translateX(${dx}px) rotate(${dx / 22}deg)`,
                    transition: arrastrando ? "none" : "transform 180ms ease",
                    touchAction: "pan-y",
                  }}
                  className={cn(
                    "relative max-h-[52vh] select-none space-y-3 overflow-y-auto rounded-2xl border border-foreground/12 bg-card p-5 shadow-lg",
                    puede && "cursor-grab active:cursor-grabbing",
                  )}
                >
                  {dx > 40 && (
                    <span className="absolute right-4 top-4 rounded-lg border-2 border-ok px-2 py-0.5 text-sm font-extrabold text-ok">
                      APROBAR
                    </span>
                  )}
                  {dx < -40 && (
                    <span className="absolute left-4 top-4 rounded-lg border-2 border-danger px-2 py-0.5 text-sm font-extrabold text-danger">
                      DESCARTAR
                    </span>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full border px-2 py-0.5 text-[0.65rem] font-bold", sev.clase)}>{sev.etiqueta}</span>
                    {!clienteId && <span className="text-xs font-semibold text-foreground/70">{actual.clienteNombre}</span>}
                    <span className="text-xs text-foreground/45">{actual.platform}</span>
                  </div>
                  <h3 className="text-base font-bold leading-snug text-foreground">{actual.title}</h3>
                  {actual.entityName && <p className="truncate text-xs text-foreground/45">{actual.entityName}</p>}
                  <p className="text-sm leading-6 text-foreground/70">{actual.diagnosis}</p>
                  <p className="text-sm leading-6 text-foreground">
                    <span className="font-semibold">Qué hacer: </span>
                    {actual.proposedAction}
                  </p>
                  {actual.enlaces.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {actual.enlaces.map((e) => (
                        <a
                          key={e.url}
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          // Con el dedo o el mouse sobre el enlace no debe empezar el arrastre de la tarjeta.
                          onPointerDown={(ev) => ev.stopPropagation()}
                          className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 px-3 py-1.5 text-xs font-bold text-brand transition-colors hover:bg-brand/10"
                        >
                          {e.etiqueta}
                          <ExternalLink className="size-3" />
                        </a>
                      ))}
                    </div>
                  )}
                  {actual.accion && actual.accion.tipo !== "revisar" && (
                    <div className="inline-flex items-center gap-2 rounded-lg bg-foreground/5 px-3 py-1.5 text-xs">
                      <span className="text-foreground/55">{actual.before}</span>
                      <ArrowRight className="size-3 text-foreground/35" />
                      <span className="font-semibold text-foreground">{actual.after}</span>
                      {actual.delta && actual.delta !== "—" && <span className="text-foreground/45">({actual.delta})</span>}
                    </div>
                  )}
                  {actual.accion?.tipo === "pausar" && !puede && actual.entityId && (
                    <button
                      type="button"
                      disabled={trabajando}
                      onPointerDown={(ev) => ev.stopPropagation()}
                      onClick={() => void proponerPausa(actual)}
                      className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40"
                    >
                      Proponer pausar esta campaña
                    </button>
                  )}
                  {actual.accion?.tipo === "contenido" && actual.clienteId && (
                    <button
                      type="button"
                      onPointerDown={(ev) => ev.stopPropagation()}
                      onClick={() => setSubiendo(actual)}
                      className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
                    >
                      Subir contenido a esta campaña
                    </button>
                  )}
                  {actual.entityId && actual.accion?.tipo !== "contenido" && (
                    <button
                      type="button"
                      onClick={() => void abrirEnEditor(actual, false)}
                      className="text-xs font-semibold text-brand hover:underline"
                    >
                      Abrir la campaña en el editor
                    </button>
                  )}
                </div>
              </div>

              {eligiendoMotivo ? (
                <div className="space-y-2 rounded-xl border border-foreground/10 p-3">
                  <p className="text-xs font-semibold text-foreground/70">¿Por qué la descartas?</p>
                  <div className="flex flex-wrap gap-2">
                    {MOTIVOS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={trabajando}
                        onClick={() => void descartar(actual, m)}
                        className="rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-semibold text-foreground/75 hover:border-danger/40 hover:text-danger"
                      >
                        {m}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEligiendoMotivo(false)}
                      className="px-2 text-xs text-foreground/45 hover:text-foreground"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-5">
                  <button
                    type="button"
                    aria-label="Descartar"
                    title="Descartar (←)"
                    disabled={!puede || trabajando}
                    onClick={() => setEligiendoMotivo(true)}
                    className="grid size-14 place-items-center rounded-full border-2 border-danger/50 text-danger transition-transform hover:scale-105 hover:bg-danger/10 disabled:opacity-35"
                  >
                    <X className="size-7" />
                  </button>
                  <button
                    type="button"
                    aria-label="Posponer"
                    title="Posponer (↓)"
                    disabled={!puede || trabajando}
                    onClick={() => void posponer(actual)}
                    className="grid size-11 place-items-center rounded-full border-2 border-foreground/25 text-foreground/70 transition-transform hover:scale-105 hover:bg-foreground/8 disabled:opacity-35"
                  >
                    <Clock className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Aprobar"
                    title="Aprobar (→)"
                    disabled={!puede || trabajando}
                    onClick={() => void aprobar(actual)}
                    className="grid size-14 place-items-center rounded-full border-2 border-ok/60 text-ok transition-transform hover:scale-105 hover:bg-ok/10 disabled:opacity-35"
                  >
                    <Check className="size-7" />
                  </button>
                </div>
              )}

              {total > 1 && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => verDespues(actual)}
                    className="inline-flex items-center gap-1.5 text-xs text-foreground/45 hover:text-foreground"
                  >
                    <SkipForward className="size-3.5" /> Verla después
                  </button>
                </div>
              )}
            </div>
          )}
    </>
  );

  return (
    <>
      {modo !== "pagina" && (
        <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-brand/18"
      >
        <Lightbulb className="size-4 text-brand" />
        Sugerencias pendientes
        <span
          className={cn(
            "grid min-w-5 place-items-center rounded-full px-1.5 text-[0.7rem] font-bold",
            total > 0 ? "bg-brand text-primary-foreground" : "bg-foreground/10 text-foreground/50",
          )}
        >
          {datos ? total : "…"}
        </span>
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sugerencias pendientes</DialogTitle>
            <DialogDescription>
              {puede
                ? "Arrastra la tarjeta o usa los botones: ✕ descartar, ⏱ posponer, ✓ aprobar."
                : "Solo un administrador o supervisor puede resolverlas; tú puedes revisarlas."}
            </DialogDescription>
          </DialogHeader>

          {cuerpo}
        </DialogContent>
      </Dialog>
        </>
      )}

      {modo === "pagina" && (
        <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
          <div>
            <p className="font-micro text-[0.65rem] text-muted-foreground">OPERACIÓN</p>
            <h2 className="neo-section-title">
              {pendientes.length} {pendientes.length === 1 ? "decisión requiere" : "decisiones requieren"} {puede ? "firma" : "aprobación"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="text-danger">{pendientes.filter((x) => x.severity === "critical").length} crítica</span>
              {" · "}
              {pendientes.filter((x) => x.severity === "high").length} altas · ordenadas por severidad y antigüedad
              {puede
                ? ". Lo que apruebes aquí se ejecuta de verdad; lo que toca presupuesto se ajusta en el editor antes de aplicarlo."
                : ". Tu rol propone: nada cambia hasta que lo apruebe quien corresponde."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border p-3">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Filtros de cola: buscar…"
              className="h-10 min-w-48 flex-1 rounded-full border border-border bg-background px-4 text-sm"
            />
            {([
              ["Todos los clientes", filtroCliente, setFiltroCliente, [...new Map(pendientes.map((x) => [x.clienteId, x.clienteNombre])).entries()]],
              ["Toda plataforma", filtroPlataforma, setFiltroPlataforma, [...new Set(pendientes.map((x) => x.platform))].map((x) => [x, x] as [string, string])],
              ["Todo tipo", filtroTipo, setFiltroTipo, [...new Set(pendientes.map(tipoDe))].map((x) => [x, x] as [string, string])],
            ] as Array<[string, string, (v: string) => void, Array<[string, string]>]>).map(([etiqueta, valor, poner, opciones]) => (
              <select
                key={etiqueta}
                value={valor}
                onChange={(e) => {
                  poner(e.target.value);
                  setSeleccionId(null);
                }}
                className="h-10 rounded-full border border-border bg-background px-3 text-sm"
              >
                <option value="">{etiqueta}</option>
                {opciones.map(([id, nombre]) => (
                  <option key={id} value={id}>
                    {nombre}
                  </option>
                ))}
              </select>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {filtradas.length === 0 && datos && <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">Cola despejada: no quedan decisiones con los filtros actuales.</p>}
              {filtradas.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setSeleccionId(x.id)}
                  className={cn(
                    "block w-full rounded-xl border p-3 text-left transition-colors",
                    actual?.id === x.id ? "border-brand bg-brand/10" : "border-border hover:border-brand/40",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full border px-2 py-0.5 text-[0.6rem] font-bold", SEVERIDAD[x.severity].clase)}>{SEVERIDAD[x.severity].etiqueta}</span>
                    <span className="text-[0.65rem] text-foreground/55">{tipoDe(x)}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">{x.title}</p>
                  <p className="mt-0.5 truncate text-xs text-foreground/55">
                    {x.clienteNombre} · {x.platform}
                  </p>
                </button>
              ))}
            </div>
            <div className="min-w-0">{cuerpo}</div>
          </div>
        </div>
      )}

      <Dialog open={subiendo !== null} onOpenChange={(a) => !a && setSubiendo(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Subir contenido a «{subiendo?.entityName}»</DialogTitle>
            <DialogDescription>Elige el conjunto y la publicación, el anuncio o la imagen. Lo nuevo pasa por aprobación y, al aprobarse, queda corriendo.</DialogDescription>
          </DialogHeader>
          {subiendo?.clienteId && <ImpulsarView clienteId={subiendo.clienteId} puedeAprobar={puede} campanaInicial={subiendo.entityId ?? undefined} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={pausando !== null} onOpenChange={(o) => !o && setPausando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Pausar esta campaña?</AlertDialogTitle>
            <AlertDialogDescription>
              Se pausará “{pausando?.entityName}” en {pausando?.platform}. Es un cambio real en la cuenta del cliente y se
              revierte activándola de nuevo. Antes de confirmar, comprueba que no sea la única campaña activa del cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const s = pausando;
                setPausando(null);
                if (s) void pausarCampana(s);
              }}
            >
              Pausar campaña
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DetalleEntidadSheet
        entidad={editor}
        ads={adsDelEditor}
        puedeAprobar={puede}
        onOpenChange={(a) => !a && setEditor(null)}
      />
    </>
  );
}
