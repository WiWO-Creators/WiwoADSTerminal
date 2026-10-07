"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, Check, ChevronDown, ClipboardCheck, History, Lightbulb, Pencil, Rocket, Shield, Users, X } from "lucide-react";

import {
  CATEGORIAS_DE_AUDITORIA,
  ETIQUETA_CATEGORIA,
  ETIQUETA_DE_CAMBIO_TEXTO,
  ETIQUETAS_DE_CAMBIO,
  type CategoriaDeAuditoria,
} from "@/lib/auditoria-pura";
import { cn } from "@/lib/utils";
import { EjecucionesView } from "./ejecuciones-view";
import { PantallaDeCarga, StatCard, Surface } from "./ui";

type Evento = {
  id: string;
  cuando: number;
  categoria: CategoriaDeAuditoria;
  accion: string;
  actor: { email: string; nombre: string | null };
  cliente: { id: string; nombre: string | null } | null;
  plataforma: string | null;
  entidad: { tipo: string | null; id: string | null; nombre: string | null } | null;
  titulo: string;
  resultado: "ok" | "error" | "pendiente" | "rechazado";
  importancia: "normal" | "alta";
  etiquetas: string[];
  detalle: Record<string, unknown> | null;
};
type Resumen = { hoy: number; importantesEstaSemana: number; rechazosEstaSemana: number; fallosEstaSemana: number; cambiosDePresupuesto30d: number; porCategoria: Record<string, number> };
type Cambio = { campo: string; etiqueta: string; antes: string; despues: string };

const ICONO_CATEGORIA = { asistente: Bot, solicitud: ClipboardCheck, decision: Lightbulb, cambio: Pencil, creacion: Rocket, regla: Shield, equipo: Users } as const;
const PERIODOS = [
  { id: "0", label: "Todo" },
  { id: "1", label: "Hoy" },
  { id: "7", label: "7 días" },
  { id: "30", label: "30 días" },
];
const campo = "h-10 rounded-full border border-border bg-background px-3 text-sm";

const fecha = (ms: number) => new Date(ms).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Los detalles que conviene leer de un vistazo: antes y después, el pedido, el motivo, lo que falló. */
function Detalle({ e }: { e: Evento }) {
  const d = e.detalle ?? {};
  const cambios = (Array.isArray(d.cambios) ? d.cambios : []) as Cambio[];
  const pasos = (Array.isArray(d.pasos) ? d.pasos : []) as Array<{ accion?: string; etiqueta?: string; ok?: boolean; error?: string | null }>;
  const texto = (v: unknown) => (typeof v === "string" && v ? v : null);
  const filas: Array<[string, string]> = [];
  if (texto(d.pregunta)) filas.push(["Pedido", d.pregunta as string]);
  if (texto(d.herramienta)) filas.push(["Herramienta", d.herramienta as string]);
  if (d.entrada && typeof d.entrada === "object") filas.push(["Datos que usó", JSON.stringify(d.entrada)]);
  if (texto(d.resultado)) filas.push(["Resultado", d.resultado as string]);
  if (texto(d.pidio)) filas.push(["Lo pidió", d.pidio as string]);
  if (texto(d.reviso)) filas.push(["Lo revisó", d.reviso as string]);
  if (texto(d.motivo)) filas.push(["Motivo", d.motivo as string]);
  if (texto(d.nota)) filas.push(["Nota de la revisión", d.nota as string]);
  if (texto(d.error)) filas.push(["Error", d.error as string]);
  if (texto(d.destino)) filas.push(["Destino", d.destino as string]);
  if (texto(d.recomendacion)) filas.push(["Recomendación", d.recomendacion as string]);
  if (texto(d.mensaje)) filas.push(["Texto del anuncio", d.mensaje as string]);
  const enlaces = (Array.isArray(d.enlaces) ? d.enlaces : []) as Array<{ etiqueta?: string; url?: string }>;
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3 text-xs">
      {cambios.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-border p-3">
          {cambios.map((c) => (
            <li key={c.campo}>
              <span className="font-semibold text-foreground">{c.etiqueta}:</span> <span className="text-foreground/60 line-through">{c.antes}</span> →{" "}
              <span className="font-semibold text-foreground">{c.despues}</span>
            </li>
          ))}
        </ul>
      )}
      {filas.map(([k, v]) => (
        <p key={k} className="leading-5 text-foreground/75">
          <span className="font-semibold text-foreground">{k}: </span>
          {v}
        </p>
      ))}
      {pasos.length > 0 && (
        <ul className="space-y-0.5">
          {pasos.map((p, i) => (
            <li key={`${p.accion}-${i}`} className={p.ok ? "text-foreground/65" : "text-danger"}>
              {p.ok ? "✓" : "✗"} {p.etiqueta ?? p.accion}
              {p.error ? ` — ${p.error}` : ""}
            </li>
          ))}
        </ul>
      )}
      {enlaces.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="block font-semibold text-brand hover:underline">
          {l.etiqueta || "Revisar en la plataforma"}
        </a>
      ))}
      {filas.length === 0 && cambios.length === 0 && pasos.length === 0 && enlaces.length === 0 && <p className="text-foreground/50">Sin más detalle.</p>}
      <p className="text-[0.65rem] text-foreground/40">
        {e.actor.email} · {fecha(e.cuando)}
      </p>
    </div>
  );
}

/**
 * Auditoría: todo lo que pasa en WiWO.ADS, en una sola línea de tiempo y segmentada: lo que se le pide al bot, las solicitudes
 * (pedidas, aprobadas, rechazadas), las decisiones, los cambios con su antes y después (presupuesto, títulos, contenido,
 * estado), las creaciones, las reglas y el equipo. Lo importante (presupuesto, rechazos y fallos) sale marcado.
 */
export function AuditoriaView() {
  const [pestana, setPestana] = useState<"todo" | CategoriaDeAuditoria | "tecnico">("todo");
  const [etiqueta, setEtiqueta] = useState("");
  const [dias, setDias] = useState("7");
  const [persona, setPersona] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [texto, setTexto] = useState("");
  const [importantes, setImportantes] = useState(false);
  const [datos, setDatos] = useState<{ eventos: Evento[]; resumen: Resumen } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (pestana === "tecnico") return;
    const p = new URLSearchParams();
    if (pestana !== "todo") p.set("categoria", pestana);
    if (etiqueta) p.set("etiqueta", etiqueta);
    if (dias !== "0") p.set("dias", dias);
    if (persona) p.set("actor", persona);
    if (clienteId) p.set("clienteId", clienteId);
    if (texto.trim()) p.set("q", texto.trim());
    if (importantes) p.set("importantes", "1");
    try {
      const r = await fetch(`/api/auditoria?${p}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "No se pudo cargar la auditoría");
      setDatos(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la auditoría");
    }
  }, [pestana, etiqueta, dias, persona, clienteId, texto, importantes]);

  // Se refresca sola cada 30 segundos mientras está abierta: lo que pasa se ve sin recargar.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- trae datos del servidor al cambiar un filtro
    void cargar();
    const t = window.setInterval(() => void cargar(), 30_000);
    return () => window.clearInterval(t);
  }, [cargar]);

  const personas = useMemo(() => [...new Set((datos?.eventos ?? []).map((e) => e.actor.email))].sort(), [datos]);
  const clientes = useMemo(() => [...new Map((datos?.eventos ?? []).filter((e) => e.cliente).map((e) => [e.cliente!.id, e.cliente!.nombre ?? e.cliente!.id])).entries()], [datos]);
  const resumen = datos?.resumen;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 md:p-6">
      <div>
        <p className="font-micro text-[0.65rem] text-muted-foreground">GESTIÓN</p>
        <h2 className="neo-section-title">Auditoría</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/58">
          Todo queda registrado: lo que se le pide al bot, las solicitudes pedidas, aprobadas y rechazadas, las decisiones, y cada cambio de presupuesto,
          título, contenido o estado con su antes y después. Lo importante sale marcado.
        </p>
      </div>

      {resumen && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Eventos hoy" value={String(resumen.hoy)} note="Todo lo registrado desde la medianoche" icon={History} />
          <StatCard label="Importantes · 7 días" value={String(resumen.importantesEstaSemana)} note="Presupuesto, rechazos, fallos y equipo" icon={AlertTriangle} tone={resumen.importantesEstaSemana > 0 ? "red" : "blue"} />
          <StatCard label="Rechazos y fallos · 7 días" value={String(resumen.rechazosEstaSemana + resumen.fallosEstaSemana)} note={`${resumen.rechazosEstaSemana} rechazos · ${resumen.fallosEstaSemana} fallos`} icon={X} tone={resumen.rechazosEstaSemana + resumen.fallosEstaSemana > 0 ? "red" : "blue"} />
          <StatCard label="Cambios de presupuesto · 30 días" value={String(resumen.cambiosDePresupuesto30d)} note="Aplicados en las plataformas" icon={Pencil} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(["todo", ...CATEGORIAS_DE_AUDITORIA, "tecnico"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setPestana(c);
              setEtiqueta("");
            }}
            className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", pestana === c ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
          >
            {c === "todo" ? "Todo" : c === "tecnico" ? "Detalle técnico" : ETIQUETA_CATEGORIA[c]}
            {c !== "todo" && c !== "tecnico" && resumen?.porCategoria[c] ? <span className="ml-1.5 text-foreground/45">{resumen.porCategoria[c]}</span> : null}
          </button>
        ))}
      </div>

      {pestana === "tecnico" ? (
        <EjecucionesView />
      ) : (
        <>
          {(pestana === "cambio" || pestana === "todo") && (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setEtiqueta("")} className={cn("rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold", etiqueta === "" ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted-foreground")}>
                Todo tipo de cambio
              </button>
              {ETIQUETAS_DE_CAMBIO.map((t) => (
                <button key={t} type="button" onClick={() => setEtiqueta(t)} className={cn("rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold", etiqueta === t ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted-foreground")}>
                  {ETIQUETA_DE_CAMBIO_TEXTO[t]}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input className={cn(campo, "min-w-56 flex-1")} placeholder="Buscar por campaña, cliente, persona o frase…" value={texto} onChange={(e) => setTexto(e.target.value)} />
            <select className={campo} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Todos los clientes</option>
              {clientes.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            </select>
            <select className={campo} value={persona} onChange={(e) => setPersona(e.target.value)}>
              <option value="">Toda persona</option>
              {personas.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className={campo} value={dias} onChange={(e) => setDias(e.target.value)}>
              {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <label className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-semibold text-foreground/75">
              <input type="checkbox" checked={importantes} onChange={(e) => setImportantes(e.target.checked)} /> Solo importantes
            </label>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {!datos && !error && <PantallaDeCarga mensaje="Cargando auditoría…" />}
          {datos && datos.eventos.length === 0 && <Surface className="p-6 text-center text-sm text-muted-foreground">No hay eventos con estos filtros.</Surface>}
          <div className="space-y-2">
            {datos?.eventos.map((e) => {
              const Icono = ICONO_CATEGORIA[e.categoria] ?? History;
              const abierta = abierto === e.id;
              return (
                <Surface key={e.id} className={cn("p-3", e.importancia === "alta" && "border-warn/40")}>
                  <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setAbierto(abierta ? null : e.id)}>
                    <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", e.resultado === "error" || e.resultado === "rechazado" ? "bg-danger/10 text-danger" : e.resultado === "pendiente" ? "bg-warn/10 text-warn" : "bg-foreground/[0.06] text-foreground/70")}>
                      {e.resultado === "ok" ? <Check className="size-4" /> : e.resultado === "pendiente" ? <Icono className="size-4" /> : <X className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold leading-snug text-foreground">{e.titulo}</span>
                        {e.importancia === "alta" && <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[0.6rem] font-bold text-warn">Importante</span>}
                      </span>
                      <span className="mt-0.5 block text-xs text-foreground/50">
                        {ETIQUETA_CATEGORIA[e.categoria]} · {e.accion.replace(/_/g, " ")} · {e.actor.nombre ?? e.actor.email}
                        {e.cliente?.nombre ? ` · ${e.cliente.nombre}` : ""}
                        {e.plataforma ? ` · ${e.plataforma}` : ""} · {fecha(e.cuando)}
                        {e.etiquetas.length > 0 ? ` · ${e.etiquetas.map((t) => ETIQUETA_DE_CAMBIO_TEXTO[t as keyof typeof ETIQUETA_DE_CAMBIO_TEXTO] ?? t).join(", ")}` : ""}
                      </span>
                    </span>
                    <ChevronDown className={cn("mt-1 size-4 shrink-0 text-foreground/40 transition-transform", abierta && "rotate-180")} />
                  </button>
                  {abierta && <Detalle e={e} />}
                </Surface>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
