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
import { ElegirDondeCrear, type DestinoDeCreacion } from "./crear-en";
import { ImpulsarView } from "./impulsar-view";
import { ThinkingOrb } from "./ui";

type Datos = { pendientes: SugerenciaVista[]; puedeResolver: boolean };

const SEVERIDAD: Record<SugerenciaVista["severity"], { etiqueta: string; clase: string }> = {
  critical: { etiqueta: "Urgente", clase: "border-danger/40 bg-danger/10 text-danger" },
  high: { etiqueta: "Importante", clase: "border-warn/40 bg-warn/10 text-warn" },
  medium: { etiqueta: "Revisar", clase: "border-foreground/20 bg-foreground/5 text-foreground/70" },
  info: { etiqueta: "Oportunidad", clase: "border-brand/40 bg-brand/10 text-brand" },
};

const MOTIVOS = ["No aplica a este cliente", "Ya lo resolví por otro lado", "No estoy de acuerdo"];
/** Para estas recomendaciones el motivo importa: con «Ya no estará activa», «De temporada» o «Pausada a propósito» no se vuelve a recomendar. */
const MOTIVOS_DE_CAMPANA = ["Ya no estará activa", "Es una campaña de temporada", "Está pausada a propósito", "No estoy de acuerdo"];
const motivosDe = (x: SugerenciaVista): string[] => (x.rule === "campana_apagada" || x.rule === "contenido_desactualizado" ? MOTIVOS_DE_CAMPANA : MOTIVOS);
/** Cuánto hay que arrastrar la tarjeta para que cuente como una decisión. */
const UMBRAL_ARRASTRE = 110;

/** Qué clase de decisión es, para filtrar la cola. */
function tipoDe(s: SugerenciaVista): string {
  if (s.accion?.tipo === "contenido") return "Contenido";
  if (s.accion?.tipo === "presupuesto") return "Presupuesto";
  if (s.accion?.tipo === "pausar") return "Pausar";
  if (s.rule.startsWith("ficha_")) return "Ficha";
  return s.rule.startsWith("medicion_") ? "Medición" : "Revisar";
}

/** «Hace 5 min», «Hace 2 h», «Hace 3 días». */
function hace(ms: number): string {
  const min = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (min < 60) return `Hace ${min} min`;
  if (min < 60 * 24) return `Hace ${Math.round(min / 60)} h`;
  return `Hace ${Math.round(min / 1440)} días`;
}

/** «Vence en 3 días», «Vence hoy». */
function vence(ms: number): string {
  const dias = Math.ceil((ms - Date.now()) / 86_400_000);
  return dias <= 0 ? "Vence hoy" : dias === 1 ? "Vence mañana" : `Vence en ${dias} días`;
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
  onCrearAnuncio,
}: {
  /** «Subir contenido»: abre el Constructor para crear un anuncio nuevo dentro de la campaña de la decisión. */
  onCrearAnuncio?: (destino: DestinoDeCreacion) => void;
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
  const [reactivando, setReactivando] = useState<SugerenciaVista | null>(null);
  const [revisando, setRevisando] = useState<SugerenciaVista | null>(null);
  const [creandoAnuncioDe, setCreandoAnuncioDe] = useState<SugerenciaVista | null>(null);
  /** La decisión cuyo cambio se está haciendo en el editor: se resuelve solo si el cambio se aplica. */
  const [editorDe, setEditorDe] = useState<SugerenciaVista | null>(null);
  const aplicadoEnEditor = useRef(false);
  const cerrarSolucionada = useRef<(id: string) => Promise<void>>(async () => {});
  /** Lo que el Orb hizo con cada decisión: propuso una solución o ya la aplicó. */
  const [orb, setOrb] = useState<Record<string, "propuesta" | "aplicada">>({});

  useEffect(() => {
    function alEstado(e: Event) {
      const d = (e as CustomEvent<{ decisionId: string; estado: "propuesta" | "aplicada" }>).detail;
      if (!d) return;
      setOrb((a) => ({ ...a, [d.decisionId]: d.estado }));
      // El Orb aplicó el cambio con el «sí» de la persona: la decisión queda solucionada.
      if (d.estado === "aplicada") void cerrarSolucionada.current(d.decisionId);
    }
    window.addEventListener("wiwo:orb-estado", alEstado);
    return () => window.removeEventListener("wiwo:orb-estado", alEstado);
  }, []);
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

  // La lista se vuelve a leer cada minuto y al volver a la pestaña: lo que ya se resolvió (por ejemplo, contenido que se acaba de subir) sale solo.
  useEffect(() => {
    const refrescar = () => {
      if (document.visibilityState === "visible") void leer().catch(() => undefined);
    };
    const t = window.setInterval(refrescar, 60_000);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, [leer]);

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

  /**
   * «Subir contenido»: la campaña de la tarjeta ya viene elegida. En Meta se abre el flujo de subir o impulsar con esa campaña
   * y su cuenta cargadas; en Google (y el resto) se abre directo el editor de esa campaña, donde se edita el contenido.
   */
  function subirContenido(s: SugerenciaVista) {
    // Con el Constructor disponible: se crea un anuncio nuevo en la campaña de la decisión y la persona elige la pieza.
    if (onCrearAnuncio && s.clienteId && s.entityId) setCreandoAnuncioDe(s);
    else if (s.provider === "meta") setSubiendo(s);
    else {
      // La decisión se cierra cuando se aplique un cambio en el editor.
      setEditorDe(s);
      aplicadoEnEditor.current = false;
      void abrirEnEditor(s, false);
    }
  }

  /** ✓ */
  async function aprobar(s: SugerenciaVista) {
    if (!puede || trabajando) return;
    if (s.accion?.tipo === "contenido") {
      setDx(0);
      subirContenido(s);
      return;
    }
    if (s.accion?.tipo === "reactivar") {
      setDx(0);
      setReactivando(s);
      return;
    }
    if (s.accion?.tipo === "pausar") {
      setDx(0);
      setPausando(s);
      return;
    }
    if (s.accion?.tipo === "presupuesto") {
      // Aprobar no cambia nada por sí solo: se abre el editor y la decisión se resuelve cuando el cambio se aplica.
      toast.info("Revisa el cambio de presupuesto y aplícalo: la decisión se cierra cuando se aplique.");
      setEditorDe(s);
      aplicadoEnEditor.current = false;
      await abrirEnEditor(s, true);
      return;
    }
    // Sin cambio que hacer: «revisada» pide confirmación y dice claramente que no se tocó nada.
    setDx(0);
    setRevisando(s);
  }

  /** Le pide al Orb que resuelva esta decisión: él propone y una persona aprueba; la decisión se cierra cuando el cambio se aplica. */
  function resolverConOrb(s: SugerenciaVista) {
    const texto = [
      `Resuelve esta decisión de ${s.clienteNombre} en ${s.platform}${s.entityName ? ` sobre «${s.entityName}»` : ""}.`,
      `Diagnóstico: ${s.diagnosis}`,
      `Sugerencia: ${s.proposedAction}`,
      "Responde en máximo 3 líneas: qué pasa de verdad y UNA acción concreta como pregunta corta. Deja la propuesta lista; si digo «sí», se aplica. Si no hace falta ningún cambio, dímelo en una línea.",
    ].join("\n");
    window.dispatchEvent(new CustomEvent("wiwo:orb-pedir", { detail: { decisionId: s.id, texto } }));
  }

  /** El editor aplicó el cambio: ahora sí se cierra la decisión. */
  async function alAplicarEnEditor() {
    const s = editorDe;
    aplicadoEnEditor.current = true;
    if (s && (await resolver(s, "approve"))) {
      toast.success("Cambio aplicado y decisión cerrada");
      quitar(s);
    }
  }

  useEffect(() => {
    cerrarSolucionada.current = async (id: string) => {
      const s = pendientes.find((x) => x.id === id);
      if (!s) return;
      if (await resolver(s, "approve")) {
        toast.success("El Orb solucionó la decisión");
        quitar(s);
      }
    };
  });

  /** El editor se cerró: si no se aplicó nada, la decisión sigue pendiente y se dice. */
  function alCerrarEditor() {
    if (editorDe && !aplicadoEnEditor.current) toast.info("No se aplicó ningún cambio: la decisión sigue pendiente.");
    setEditor(null);
    setEditorDe(null);
  }

  async function marcarRevisada(s: SugerenciaVista) {
    if (await resolver(s, "approve")) {
      toast.success("Marcada como revisada. No se cambió nada en la plataforma.");
      quitar(s);
    }
  }

  /** Dice lo que pasó de verdad al pausar o reactivar. */
  function contarResultado(cuerpo: { sinCambios?: boolean; verificado?: boolean | null }, verbo: "pausó" | "reactivó"): void {
    if (cuerpo.sinCambios) toast.info(`No hubo cambios: la campaña ya estaba ${verbo === "pausó" ? "pausada" : "activa"} en Meta.`);
    else if (cuerpo.verificado === false) toast.warning(`Se envió la orden, pero Meta todavía no confirma que se ${verbo}. Revísalo en un momento.`);
    else toast.success(cuerpo.verificado ? `Se ${verbo} la campaña (confirmado en Meta)` : `Se ${verbo} la campaña`);
  }

  async function pausarCampana(s: SugerenciaVista) {
    if (!s.provider || !s.accountId || !s.entityId) return;
    setTrabajando(true);
    let resultado: { sinCambios?: boolean; verificado?: boolean | null } = {};
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
      resultado = cuerpo;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo pausar la campaña");
      setTrabajando(false);
      return;
    }
    setTrabajando(false);
    // Se cierra solo si quedó pausada (o ya lo estaba); si Meta no lo confirma, sigue pendiente.
    if (resultado.verificado === false) return contarResultado(resultado, "pausó");
    if (await resolver(s, "approve")) {
      contarResultado(resultado, "pausó");
      quitar(s);
    }
  }

  async function reactivarCampana(s: SugerenciaVista) {
    if (!s.provider || !s.accountId || !s.entityId) return;
    setTrabajando(true);
    let resultado: { sinCambios?: boolean; verificado?: boolean | null } = {};
    try {
      const respuesta = await fetch("/api/anuncios/estado", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: s.provider, nivel: "campana", accountId: s.accountId, campaignId: s.entityId, activar: true }),
      });
      const cuerpo = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || cuerpo?.ok === false) throw new Error(cuerpo?.error ?? "No se pudo reactivar la campaña");
      resultado = cuerpo;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reactivar la campaña");
      setTrabajando(false);
      return;
    }
    setTrabajando(false);
    if (resultado.verificado === false) return contarResultado(resultado, "reactivó");
    if (await resolver(s, "approve")) {
      contarResultado(resultado, "reactivó");
      quitar(s);
    }
  }

  /** Quien no aprueba cambios propone reactivar: queda pendiente hasta que lo apruebe un Lead o superior. */
  async function proponerReactivar(s: SugerenciaVista) {
    if (!s.provider || !s.accountId || !s.entityId || trabajando) return;
    setTrabajando(true);
    try {
      const respuesta = await fetch("/api/entidades/editar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: s.provider, accountId: s.accountId, nivel: "campana", id: s.entityId, cambios: { activar: true }, modo: "solicitar" }),
      });
      const cuerpo = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw new Error(cuerpo?.error ?? "No se pudo enviar la propuesta");
      toast.success("Propuesta enviada: nada se reactivó todavía. Debe aprobarla un Lead o superior.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar la propuesta");
    } finally {
      setTrabajando(false);
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
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-foreground/10 p-3">
                      <p className="text-[0.65rem] text-foreground/50">Impacto estimado</p>
                      <p className="mt-0.5 text-xs font-semibold leading-5 text-foreground">{actual.impact}</p>
                    </div>
                    <div className="rounded-xl border border-foreground/10 p-3">
                      <p className="text-[0.65rem] text-foreground/50">Confianza</p>
                      <p className="mt-0.5 text-xs font-semibold text-foreground">{actual.confidence}</p>
                      <p className="mt-0.5 text-[0.65rem] text-foreground/45">
                        {hace(actual.generadaEn)} · {vence(actual.venceEn)}
                      </p>
                    </div>
                  </div>
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
                  {actual.accion?.tipo === "reactivar" && !puede && actual.entityId && (
                    <button
                      type="button"
                      disabled={trabajando}
                      onPointerDown={(ev) => ev.stopPropagation()}
                      onClick={() => void proponerReactivar(actual)}
                      className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40"
                    >
                      Proponer reactivar esta campaña
                    </button>
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
                      onClick={() => subirContenido(actual)}
                      className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
                    >
                      Subir contenido a esta campaña
                    </button>
                  )}
                  {(
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onClick={() => resolverConOrb(actual)}
                        className="inline-flex items-center gap-2 rounded-full border border-brand/40 px-3 py-1.5 text-xs font-bold text-brand transition-colors hover:bg-brand/10"
                      >
                        <ThinkingOrb size="xs" state="idle" label="" />
                        Solucionar con Thinking Orb
                      </button>
                      {orb[actual.id] && (
                        <button
                          type="button"
                          onPointerDown={(ev) => ev.stopPropagation()}
                          onClick={() => window.dispatchEvent(new CustomEvent("wiwo:orb-abrir"))}
                          className="inline-flex items-center gap-2 rounded-full bg-brand/12 px-3 py-1.5 text-xs font-bold text-foreground hover:bg-brand/20"
                        >
                          <ThinkingOrb size="xs" state={orb[actual.id] === "aplicada" ? "idle" : "generating"} label="" />
                          {orb[actual.id] === "aplicada" ? "El Orb lo solucionó · ver" : "El Orb propuso una solución · ver"}
                        </button>
                      )}
                    </div>
                  )}
                  {actual.entityId && actual.accion?.tipo !== "contenido" && actual.accion?.tipo !== "reactivar" && (
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
                  {(actual.rule === "campana_apagada" || actual.rule === "contenido_desactualizado") && (
                    <p className="text-[0.68rem] leading-4 text-foreground/50">Con «Ya no estará activa», «Es una campaña de temporada» o «Está pausada a propósito» no se vuelve a recomendar.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {motivosDe(actual).map((m) => (
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
          {subiendo?.clienteId && <ImpulsarView
            clienteId={subiendo.clienteId}
            puedeAprobar={puede}
            campanaInicial={subiendo.entityId ?? undefined}
            cuentaInicial={subiendo.accountId ?? undefined}
            onHecho={() => {
              // Se cierra la decisión solo cuando el contenido ya se envió.
              const s = subiendo;
              if (s) void resolver(s, "approve").then((ok) => ok && quitar(s));
            }}
          />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={reactivando !== null} onOpenChange={(o) => !o && setReactivando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reactivar esta campaña?</AlertDialogTitle>
            <AlertDialogDescription>
              Se reactivará “{reactivando?.entityName}” en {reactivando?.platform}. Vuelve a entregar y gastar de verdad en la cuenta del cliente; se revierte pausándola de nuevo.
              Si ya no debía estar activa, cancela y descártala con el motivo «Ya no estará activa».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const x = reactivando;
                setReactivando(null);
                if (x) void reactivarCampana(x);
              }}
            >
              Reactivar campaña
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        onOpenChange={(a) => !a && alCerrarEditor()}
        onAplicado={() => void alAplicarEnEditor()}
      />

      <ElegirDondeCrear
        nivel={creandoAnuncioDe ? "anuncio" : null}
        clienteId={creandoAnuncioDe?.clienteId ?? ""}
        inicial={creandoAnuncioDe?.accountId && creandoAnuncioDe.entityId ? { accountId: creandoAnuncioDe.accountId, campaignId: creandoAnuncioDe.entityId } : undefined}
        onCerrar={() => setCreandoAnuncioDe(null)}
        onElegir={(destino) => onCrearAnuncio?.(destino)}
      />

      <AlertDialog open={revisando !== null} onOpenChange={(a) => !a && setRevisando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Marcar como revisada?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto solo cierra la decisión: no cambia nada en la cuenta del cliente. Úsalo si ya lo miraste y no hace falta tocar nada,
              o si lo harás por tu cuenta. Si prefieres no verla más, descártala con un motivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const x = revisando;
                setRevisando(null);
                if (x) void marcarRevisada(x);
              }}
            >
              Marcar como revisada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
