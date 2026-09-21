"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  Check,
  Paperclip,
  RotateCcw,
  Square,
  X,
} from "lucide-react";

import type { Propuesta } from "@/lib/asistente";
import { cn } from "@/lib/utils";
import { ThinkingOrb } from "./ui";

type EstadoDePropuesta = "pendiente" | "aplicando" | "aplicada" | "descartada" | "error";

type PropuestaEnPantalla = Propuesta & { estado: EstadoDePropuesta; error?: string };

type Mensaje = {
  id: string;
  role: "user" | "assistant";
  text: string;
  archivo?: string;
  propuestas: PropuestaEnPantalla[];
};

type EventoDelServidor =
  | { t: "text"; v: string }
  | { t: "tool"; v: string }
  | { t: "proposal"; v: Propuesta }
  | { t: "error"; v: string }
  | { t: "done"; v: { entrada: number; salida: number } };

const CSV_MAXIMO = 1_500_000;

const SUGERENCIAS = [
  "¿Qué campañas están rindiendo peor este periodo?",
  "Recomiéndame qué pausar y por qué",
  "¿Cómo va este cliente en resumen?",
];

function nuevoId() {
  return crypto.randomUUID();
}

/** Negritas del modelo (**así**) sin traer un renderizador de markdown entero. */
function conNegritas(texto: string): React.ReactNode[] {
  return texto.split(/\*\*(.+?)\*\*/g).map((parte, indice) =>
    indice % 2 === 1 ? <strong key={indice}>{parte}</strong> : parte,
  );
}

/**
 * El asistente de IA: un orbe flotante que abre un chat con Claude.
 *
 * Lee campañas y analiza CSV por su cuenta, pero nunca escribe en una
 * plataforma: sus cambios llegan como tarjetas con un botón, y la persona
 * decide (ver `lib/asistente.ts`).
 */
export function AsistenteFlotante({
  clienteId,
  clienteNombre,
  rango,
  puedeAprobar,
  onAbrirConstructor,
  onCambioAplicado,
}: {
  clienteId: string | null;
  clienteNombre: string | null;
  rango: string;
  puedeAprobar: boolean;
  onAbrirConstructor: (portfolioId: string) => void;
  onCambioAplicado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [csv, setCsv] = useState<{ nombre: string; texto: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [herramienta, setHerramienta] = useState<string | null>(null);
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);
  const cancelar = useRef<AbortController | null>(null);
  const fondo = useRef<HTMLDivElement>(null);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fondo.current?.scrollIntoView({ block: "end" });
  }, [mensajes, herramienta, abierto]);

  useEffect(() => {
    if (!abierto) return;
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  function actualizarMensaje(id: string, cambio: (m: Mensaje) => Mensaje) {
    setMensajes((actuales) => actuales.map((m) => (m.id === id ? cambio(m) : m)));
  }

  async function enviar(pregunta: string) {
    const limpia = pregunta.trim();
    if (!limpia || cargando) return;
    setErrorDeCarga(null);

    const usuario: Mensaje = {
      id: nuevoId(),
      role: "user",
      text: limpia,
      archivo: csv?.nombre,
      propuestas: [],
    };
    const respuesta: Mensaje = { id: nuevoId(), role: "assistant", text: "", propuestas: [] };
    const historial = [...mensajes, usuario];
    setMensajes([...historial, respuesta]);
    setTexto("");
    const adjunto = csv;
    setCsv(null);
    setCargando(true);
    setHerramienta(null);

    const control = new AbortController();
    cancelar.current = control;
    try {
      const response = await fetch("/api/asistente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: control.signal,
        body: JSON.stringify({
          mensajes: historial.map((m) => ({ role: m.role, content: m.text })),
          rango,
          clienteId,
          clienteNombre,
          csv: adjunto,
        }),
      });
      if (!response.ok || !response.body) {
        const cuerpo = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(cuerpo?.error ?? "No se pudo contactar al asistente");
      }
      const lector = response.body.getReader();
      const decodificador = new TextDecoder();
      let pendiente = "";
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        pendiente += decodificador.decode(value, { stream: true });
        const bloques = pendiente.split("\n\n");
        pendiente = bloques.pop() ?? "";
        for (const bloque of bloques) {
          const linea = bloque.split("\n").find((l) => l.startsWith("data: "));
          if (!linea) continue;
          let evento: EventoDelServidor;
          try {
            evento = JSON.parse(linea.slice(6)) as EventoDelServidor;
          } catch {
            continue;
          }
          if (evento.t === "text") {
            setHerramienta(null);
            actualizarMensaje(respuesta.id, (m) => ({ ...m, text: m.text + evento.v }));
          } else if (evento.t === "tool") {
            setHerramienta(evento.v);
          } else if (evento.t === "proposal") {
            actualizarMensaje(respuesta.id, (m) => ({
              ...m,
              propuestas: [...m.propuestas, { ...evento.v, estado: "pendiente" }],
            }));
          } else if (evento.t === "error") {
            setErrorDeCarga(evento.v);
          }
        }
      }
    } catch (issue) {
      if ((issue as Error).name !== "AbortError") {
        setErrorDeCarga(issue instanceof Error ? issue.message : "Algo falló");
      }
    } finally {
      setCargando(false);
      setHerramienta(null);
      cancelar.current = null;
      // Una respuesta que quedó vacía (error o cancelación) no se deja como burbuja fantasma.
      setMensajes((actuales) =>
        actuales.filter((m) => !(m.id === respuesta.id && m.text === "" && m.propuestas.length === 0)),
      );
    }
  }

  async function aplicar(mensajeId: string, propuesta: PropuestaEnPantalla) {
    if (propuesta.tipo !== "estado") return;
    const marcar = (estado: EstadoDePropuesta, error?: string) =>
      actualizarMensaje(mensajeId, (m) => ({
        ...m,
        propuestas: m.propuestas.map((p) => (p.id === propuesta.id ? { ...p, estado, error } : p)),
      }));
    marcar("aplicando");
    try {
      const response = await fetch("/api/anuncios/estado", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: propuesta.plataforma,
          nivel: "campana",
          accountId: propuesta.cuentaId,
          campaignId: propuesta.campanaId,
          activar: propuesta.accion === "activar",
        }),
      });
      const cuerpo = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !cuerpo.ok) throw new Error(cuerpo.error ?? "No se pudo aplicar");
      marcar("aplicada");
      onCambioAplicado();
    } catch (issue) {
      marcar("error", issue instanceof Error ? issue.message : "No se pudo aplicar");
    }
  }

  function descartar(mensajeId: string, propuestaId: string) {
    actualizarMensaje(mensajeId, (m) => ({
      ...m,
      propuestas: m.propuestas.map((p) =>
        p.id === propuestaId ? { ...p, estado: "descartada" } : p,
      ),
    }));
  }

  async function alElegirArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const elegido = evento.target.files?.[0];
    evento.target.value = "";
    if (!elegido) return;
    if (elegido.size > CSV_MAXIMO) {
      setErrorDeCarga("El archivo es demasiado grande (máximo 1,5 MB).");
      return;
    }
    setErrorDeCarga(null);
    setCsv({ nombre: elegido.name, texto: await elegido.text() });
  }

  function reiniciar() {
    cancelar.current?.abort();
    setMensajes([]);
    setCsv(null);
    setErrorDeCarga(null);
  }

  const vacio = mensajes.length === 0;
  const ultima = mensajes[mensajes.length - 1];
  const esperandoTexto = cargando && ultima?.role === "assistant" && ultima.text === "";

  return (
    <>
      {abierto && (
        <section
          role="dialog"
          aria-label="Asistente de IA"
          className="fixed right-4 bottom-24 z-40 flex h-[min(660px,calc(100svh-7.5rem))] w-[min(430px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-2)]"
        >
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-foreground">Asistente</h2>
              <p className="truncate text-xs text-muted-foreground">
                {clienteNombre ? `Cliente: ${clienteNombre}` : "Todos los clientes"}
              </p>
            </div>
            {!vacio && (
              <button
                type="button"
                onClick={reiniciar}
                aria-label="Nueva conversación"
                title="Nueva conversación"
                className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <RotateCcw className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar asistente"
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {vacio && (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  Pregúntame por tus campañas, pídeme una recomendación o adjunta un CSV de
                  MetriQ para analizarlo. Lo que quieras cambiar te lo dejo como propuesta y tú
                  decides con un botón: no toco nada por mi cuenta.
                </p>
                <div className="flex flex-col gap-2">
                  {SUGERENCIAS.map((sugerencia) => (
                    <button
                      key={sugerencia}
                      type="button"
                      onClick={() => void enviar(sugerencia)}
                      className="rounded-xl border border-border bg-field px-3.5 py-2.5 text-left text-sm text-foreground transition-colors hover:border-brand"
                    >
                      {sugerencia}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mensajes.map((m) => (
              <div key={m.id} className={cn("flex flex-col gap-2", m.role === "user" && "items-end")}>
                {m.archivo && (
                  <span className="flex items-center gap-1.5 rounded-full border border-border bg-field px-2.5 py-1 text-[0.7rem] text-muted-foreground">
                    <Paperclip className="size-3" />
                    {m.archivo}
                  </span>
                )}
                {m.text && (
                  <div
                    className={cn(
                      "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-primary font-medium text-primary-foreground"
                        : "bg-field text-foreground",
                    )}
                  >
                    {m.role === "assistant" ? conNegritas(m.text) : m.text}
                  </div>
                )}
                {m.propuestas.map((p) => (
                  <TarjetaDePropuesta
                    key={p.id}
                    propuesta={p}
                    puedeAprobar={puedeAprobar}
                    onAplicar={() => void aplicar(m.id, p)}
                    onDescartar={() => descartar(m.id, p.id)}
                    onAbrirConstructor={() => {
                      if (p.tipo !== "constructor") return;
                      setAbierto(false);
                      onAbrirConstructor(p.clienteId);
                    }}
                  />
                ))}
              </div>
            ))}

            {(esperandoTexto || herramienta) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ThinkingOrb size="sm" state="generating" label="" />
                {herramienta ?? "Pensando…"}
              </div>
            )}
            {errorDeCarga && (
              <p className="flex items-start gap-2 rounded-xl border border-danger-deep/30 bg-danger-deep/10 px-3 py-2 text-xs text-danger">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                {errorDeCarga}
              </p>
            )}
            <div ref={fondo} />
          </div>

          <form
            className="border-t border-border p-3"
            onSubmit={(evento) => {
              evento.preventDefault();
              void enviar(texto);
            }}
          >
            {csv && (
              <div className="mb-2 flex items-center gap-2 rounded-full border border-border bg-field px-3 py-1 text-xs text-foreground">
                <Paperclip className="size-3 text-brand" />
                <span className="min-w-0 flex-1 truncate">{csv.nombre}</span>
                <button
                  type="button"
                  onClick={() => setCsv(null)}
                  aria-label="Quitar archivo"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={archivo}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(evento) => void alElegirArchivo(evento)}
              />
              <button
                type="button"
                onClick={() => archivo.current?.click()}
                aria-label="Adjuntar un CSV"
                title="Adjuntar un CSV (por ejemplo de MetriQ)"
                className="grid size-10 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
              >
                <Paperclip className="size-4" />
              </button>
              <textarea
                value={texto}
                onChange={(evento) => setTexto(evento.target.value)}
                onKeyDown={(evento) => {
                  if (evento.key === "Enter" && !evento.shiftKey) {
                    evento.preventDefault();
                    void enviar(texto);
                  }
                }}
                rows={1}
                placeholder={csv ? "¿Qué quieres saber de este archivo?" : "Escribe tu pregunta…"}
                className="max-h-28 min-h-10 flex-1 resize-none rounded-2xl border border-border bg-field px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-brand"
              />
              {cargando ? (
                <button
                  type="button"
                  onClick={() => cancelar.current?.abort()}
                  aria-label="Detener"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground text-background"
                >
                  <Square className="size-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!texto.trim()}
                  aria-label="Enviar"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                >
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setAbierto((estado) => !estado)}
        aria-label={abierto ? "Cerrar asistente" : "Abrir asistente de IA"}
        aria-expanded={abierto}
        className="fixed right-4 bottom-4 z-40 size-16 overflow-hidden rounded-full shadow-[var(--shadow-2)] ring-1 ring-black/10 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ThinkingOrb
          variant="stage"
          size="lg"
          pixels={64}
          state={cargando ? "generating" : "thinking"}
          label=""
          className="!rounded-full"
        />
      </button>
    </>
  );
}

function TarjetaDePropuesta({
  propuesta,
  puedeAprobar,
  onAplicar,
  onDescartar,
  onAbrirConstructor,
}: {
  propuesta: PropuestaEnPantalla;
  puedeAprobar: boolean;
  onAplicar: () => void;
  onDescartar: () => void;
  onAbrirConstructor: () => void;
}) {
  if (propuesta.tipo === "constructor") {
    return (
      <div className="w-full rounded-xl border border-border bg-card p-3">
        <p className="font-micro text-[0.6rem] text-muted-foreground">Campaña nueva sugerida</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{propuesta.clienteNombre}</p>
        <p className="mt-1 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
          {propuesta.resumen}
        </p>
        <button
          type="button"
          onClick={onAbrirConstructor}
          className="mt-3 flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground"
        >
          Abrir en el Constructor
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    );
  }

  const verbo = propuesta.accion === "pausar" ? "Pausar" : "Activar";
  return (
    <div className="w-full rounded-xl border border-border bg-card p-3">
      <p className="font-micro text-[0.6rem] text-muted-foreground">
        Propuesta · {propuesta.plataforma === "google" ? "Google Ads" : "Meta Ads"}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {verbo}: {propuesta.nombre}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{propuesta.motivo}</p>
      {propuesta.accion === "activar" && propuesta.estado === "pendiente" && (
        <p className="mt-1.5 text-xs font-semibold text-warn">
          Activar puede empezar a gastar dinero.
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        {propuesta.estado === "pendiente" && puedeAprobar && (
          <>
            <button
              type="button"
              onClick={onAplicar}
              className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground"
            >
              {verbo}
            </button>
            <button
              type="button"
              onClick={onDescartar}
              className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Descartar
            </button>
          </>
        )}
        {propuesta.estado === "aplicando" && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <ThinkingOrb size="xs" state="generating" label="" />
            Aplicando…
          </span>
        )}
        {propuesta.estado === "aplicada" && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ok">
            <Check className="size-3.5" />
            {propuesta.accion === "pausar" ? "Pausada" : "Activada"}
          </span>
        )}
        {propuesta.estado === "descartada" && (
          <span className="text-xs text-muted-foreground">Descartada</span>
        )}
        {propuesta.estado === "error" && (
          <span className="text-xs text-danger">{propuesta.error}</span>
        )}
      </div>
    </div>
  );
}
