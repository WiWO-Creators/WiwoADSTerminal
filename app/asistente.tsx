"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  BrainCircuit,
  Check,
  Maximize2,
  Minimize2,
  Paperclip,
  RotateCcw,
  Square,
  X,
} from "lucide-react";

import type { Propuesta } from "@/lib/asistente";
import { OBJECTIVES, type SemillaDeCampana } from "@/lib/constructor";
import { PAISES_SEGMENTABLES } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { ThinkingOrb } from "./ui";

type EstadoDePropuesta = "pendiente" | "aplicando" | "aplicada" | "descartada" | "error";

type PropuestaEnPantalla = Propuesta & { estado: EstadoDePropuesta; error?: string; aviso?: string };

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
  "Recomiéndame una campaña de tráfico en Google y Meta, presupuesto diario de $5.000, para promocionar nuestros planes, dirigida a Chile. Déjame el Constructor listo.",
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
 * Lee campañas y analiza CSV por su cuenta. Nunca escribe directo en ninguna
 * plataforma: para pausar o activar algo que ya existe, o para una campaña
 * nueva, siempre deja una tarjeta con un botón y la persona decide — la
 * campaña nueva se revisa y se publica desde el Constructor, no antes.
 */
type NotaVisible = { id: string; texto: string; autor: string; alcance: "equipo" | "cliente"; puedeBorrar: boolean };

/**
 * Lo que el asistente recuerda, a la vista: del equipo y del cliente activo. Se guarda hablando con él («recuerda que…»)
 * o cuando aprende algo duradero; aquí se revisa y se borra lo que ya no sirve.
 */
function PanelDeMemoria({ clienteId, clienteNombre, onCerrar }: { clienteId: string | null; clienteNombre: string | null; onCerrar: () => void }) {
  const [notas, setNotas] = useState<NotaVisible[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/asistente/memoria${clienteId ? `?cliente=${encodeURIComponent(clienteId)}` : ""}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { notas: NotaVisible[] }) : Promise.reject(new Error("No se pudo leer la memoria"))))
      .then((j) => !cancelado && setNotas(j.notas))
      .catch((e: unknown) => !cancelado && setError(e instanceof Error ? e.message : "No se pudo leer la memoria"));
    return () => {
      cancelado = true;
    };
  }, [clienteId]);

  async function borrar(nota: NotaVisible) {
    const r = await fetch("/api/asistente/memoria", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: nota.id, cliente: clienteId }),
    });
    if (r.ok) setNotas((actual) => (actual ?? []).filter((n) => n.id !== nota.id));
    else setError("No se pudo borrar la nota");
  }

  const delEquipo = (notas ?? []).filter((n) => n.alcance === "equipo");
  const delCliente = (notas ?? []).filter((n) => n.alcance === "cliente");
  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs leading-5 text-muted-foreground">
          Esto es lo que recuerdo para trabajar mejor con el tiempo. Pídeme «recuerda que…» para guardar algo; borra lo que ya no sirva.
          Nunca guardo datos personales ni claves.
        </p>
        <button type="button" onClick={onCerrar} className="shrink-0 text-xs font-semibold text-brand hover:underline">
          Volver al chat
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {notas === null && !error && <p className="text-xs text-muted-foreground">Leyendo la memoria…</p>}
      {notas !== null && notas.length === 0 && <p className="text-sm text-muted-foreground">Todavía no he guardado nada.</p>}
      {[
        ["Del equipo", delEquipo],
        [clienteNombre ? `Sobre ${clienteNombre}` : "Del cliente", delCliente],
      ].map(([titulo, lista]) =>
        (lista as NotaVisible[]).length > 0 ? (
          <div key={titulo as string}>
            <h3 className="font-micro text-[0.6rem] text-muted-foreground">{(titulo as string).toUpperCase()}</h3>
            <ul className="mt-1.5 space-y-1.5">
              {(lista as NotaVisible[]).map((n) => (
                <li key={n.id} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-xs leading-5">
                  <span className="min-w-0 flex-1 text-foreground">{n.texto}</span>
                  {n.puedeBorrar && (
                    <button type="button" onClick={() => void borrar(n)} aria-label="Olvidar esta nota" className="shrink-0 text-muted-foreground hover:text-danger">
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  );
}

const FRASES_DE_ESPERA = ["Trabajando…", "Pensando…", "Revisando los datos…", "Armando la respuesta…", "Ordenando las ideas…"];

/** Mientras no hay un aviso concreto de lo que se está haciendo, rota entre varias frases en vez de repetir una. */
function FraseDeEspera({ fija }: { fija: string | null }) {
  const [indice, setIndice] = useState(0);
  useEffect(() => {
    if (fija) return;
    const t = window.setInterval(() => setIndice((v) => (v + 1) % FRASES_DE_ESPERA.length), 2600);
    return () => window.clearInterval(t);
  }, [fija]);
  return <>{fija ?? FRASES_DE_ESPERA[indice]}</>;
}

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
  onAbrirConstructor: (portfolioId: string, semilla: SemillaDeCampana) => void;
  onCambioAplicado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [grande, setGrande] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [csv, setCsv] = useState<{ nombre: string; texto: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [herramienta, setHerramienta] = useState<string | null>(null);
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);
  const cancelar = useRef<AbortController | null>(null);
  const fondo = useRef<HTMLDivElement>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const areaDeTexto = useRef<HTMLTextAreaElement>(null);

  // Crece con el contenido en vez de quedar en una sola línea siempre —
  // escribir un pedido largo en una caja de una línea obligaba a desplazarse
  // por dentro de la caja para verlo, difícil de editar.
  useEffect(() => {
    const area = areaDeTexto.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, grande ? 240 : 112)}px`;
  }, [texto, grande]);

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
    if (propuesta.tipo !== "estado" && propuesta.tipo !== "edicion") return;
    const marcar = (estado: EstadoDePropuesta, error?: string, aviso?: string) =>
      actualizarMensaje(mensajeId, (m) => ({
        ...m,
        propuestas: m.propuestas.map((p) => (p.id === propuesta.id ? { ...p, estado, error, aviso } : p)),
      }));
    marcar("aplicando");
    if (propuesta.tipo === "edicion") {
      // Lo que se aplica no es lo que dibujó el modelo: el servidor vuelve a leer
      // la entidad de la plataforma y a armar el cambio, con los mismos permisos,
      // confirmación y bitácora que el editor.
      try {
        const response = await fetch("/api/entidades/editar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: propuesta.plataforma,
            accountId: propuesta.cuentaId,
            nivel: propuesta.nivel,
            id: propuesta.entidadId,
            cambios: propuesta.cambios,
            modo: "aplicar",
            confirmacion: "EDITAR",
          }),
        });
        const cuerpo = (await response.json()) as { ok?: boolean; error?: string; aviso?: string };
        if (!response.ok || !cuerpo.ok) throw new Error(cuerpo.aviso ?? cuerpo.error ?? "No se pudo aplicar");
        marcar("aplicada", undefined, cuerpo.aviso);
        onCambioAplicado();
      } catch (issue) {
        marcar("error", issue instanceof Error ? issue.message : "No se pudo aplicar");
      }
      return;
    }
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
  const [verMemoria, setVerMemoria] = useState(false);
  const ultima = mensajes[mensajes.length - 1];
  const esperandoTexto = cargando && ultima?.role === "assistant" && ultima.text === "";

  return (
    <>
      {abierto && (
        <section
          role="dialog"
          aria-label="Asistente de IA"
          className={cn(
            "fixed right-4 bottom-24 z-40 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-2)] transition-[height,width] duration-150",
            grande
              ? "h-[min(880px,calc(100svh-6rem))] w-[min(680px,calc(100vw-2rem))]"
              : "h-[min(660px,calc(100svh-7.5rem))] w-[min(430px,calc(100vw-2rem))]",
          )}
        >
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-foreground">Thinking Orb</h2>
              <p className="truncate text-xs text-muted-foreground">
                {clienteNombre ? `Cliente: ${clienteNombre}` : "Todos los clientes"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setVerMemoria((v) => !v)}
              aria-label="Memoria del asistente"
              aria-pressed={verMemoria}
              title="Lo que recuerda el asistente"
              className={cn(
                "grid size-8 place-items-center rounded-full transition-colors hover:bg-secondary hover:text-foreground",
                verMemoria ? "bg-secondary text-foreground" : "text-muted-foreground",
              )}
            >
              <BrainCircuit className="size-4" />
            </button>
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
              onClick={() => setGrande((v) => !v)}
              aria-label={grande ? "Achicar el chat" : "Agrandar el chat"}
              title={grande ? "Achicar el chat" : "Agrandar el chat"}
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {grande ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar asistente"
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </header>

          {verMemoria && <PanelDeMemoria clienteId={clienteId} clienteNombre={clienteNombre} onCerrar={() => setVerMemoria(false)} />}

          <div className={cn("flex-1 space-y-3 overflow-y-auto px-4 py-4", verMemoria && "hidden")}>
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
                      if (p.tipo === "impulso") {
                        setAbierto(false);
                        onAbrirConstructor(p.clienteId, {
                          propuestaId: p.id,
                          name: `Impulso · ${p.anuncioNombre}`,
                          objective: "alcance",
                          platforms: ["meta"],
                          details: p.motivo || `Impulsa el anuncio «${p.anuncioNombre}».`,
                          targetCountries: [],
                          metaMessage: p.texto ?? undefined,
                          boost: {
                            postId: p.postId,
                            accountId: p.cuentaId,
                            mediaUrl: p.miniatura ?? "",
                            anuncioOrigen: p.anuncioNombre,
                          },
                        });
                        return;
                      }
                      if (p.tipo !== "constructor") return;
                      setAbierto(false);
                      onAbrirConstructor(p.clienteId, {
                        propuestaId: p.id,
                        name: p.nombreSugerido,
                        objective: p.objetivo,
                        objectiveByPlatform: p.objetivoPorPlataforma,
                        platforms: p.plataformas,
                        details: p.resumen,
                        targetCountries: p.paises,
                        targetPlaces: p.targetPlaces.length > 0 ? p.targetPlaces : undefined,
                        targetLanguages:
                          p.targetLanguages.length > 0 ? p.targetLanguages : undefined,
                        landingUrl: p.landingUrl || undefined,
                        dailyBudget: p.dailyBudget ?? undefined,
                        budgetByPlatform: Object.keys(p.budgetByPlatform ?? {}).length > 0 ? p.budgetByPlatform : undefined,
                        budgetMode: p.budgetMode,
                        endDate: p.endDate ?? undefined,
                        headlines: p.headlines.length > 0 ? p.headlines : undefined,
                        descriptions: p.descriptions.length > 0 ? p.descriptions : undefined,
                        keywords: p.keywords.length > 0 ? p.keywords : undefined,
                        metaMessage: p.metaMessage || undefined,
                        metaHeadline: p.metaHeadline || undefined,
                        metaDescription: p.metaDescription || undefined,
                      });
                    }}
                  />
                ))}
              </div>
            ))}

            {(esperandoTexto || herramienta) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ThinkingOrb size="sm" state="generating" label="" />
                <FraseDeEspera fija={herramienta} />
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
                ref={areaDeTexto}
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
                className="min-h-10 flex-1 resize-none overflow-y-auto rounded-2xl border border-border bg-field px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-brand"
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
    const paisesLabel = propuesta.paises
      .map((iso2) => PAISES_SEGMENTABLES.find((p) => p.iso2 === iso2)?.label ?? iso2)
      .join(", ");
    return (
      <div className="w-full rounded-xl border border-border bg-card p-3">
        <p className="font-micro text-[0.6rem] text-muted-foreground">
          Campaña nueva sugerida · {propuesta.clienteNombre}
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          {propuesta.nombreSugerido || "Sin nombre"}
        </p>
        <p className="mt-1 flex flex-wrap gap-1.5 text-[0.68rem]">
          <span className="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand">
            {OBJECTIVES[propuesta.objetivo]?.label ?? propuesta.objetivo}
          </span>
          {propuesta.plataformas.map((p) => (
            <span key={p} className="rounded-full bg-field px-2 py-0.5 font-semibold text-muted-foreground">
              {p === "google" ? "Google Ads" : "Meta Ads"}
            </span>
          ))}
          {paisesLabel && (
            <span className="rounded-full bg-field px-2 py-0.5 font-semibold text-muted-foreground">
              {paisesLabel}
            </span>
          )}
          {propuesta.targetPlaces.map((lugar) => (
            <span
              key={lugar.id}
              className="rounded-full bg-field px-2 py-0.5 font-semibold text-muted-foreground"
            >
              {lugar.nombre}
            </span>
          ))}
        </p>
        <p className="mt-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
          {propuesta.resumen}
        </p>
        {propuesta.headlines.length > 0 && (
          <p className="mt-2 text-[0.68rem] leading-5 text-muted-foreground">
            <span className="font-semibold text-foreground/70">Títulos sugeridos: </span>
            {propuesta.headlines.join(" · ")}
          </p>
        )}
        {propuesta.keywords.length > 0 && (
          <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">
            <span className="font-semibold text-foreground/70">Palabras clave: </span>
            {propuesta.keywords.join(", ")}
          </p>
        )}
        {propuesta.metaMessage && (
          <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">
            <span className="font-semibold text-foreground/70">Texto de Meta: </span>
            {propuesta.metaMessage}
          </p>
        )}
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

  if (propuesta.tipo === "impulso") {
    return (
      <div className="w-full rounded-xl border border-border bg-card p-3">
        <p className="font-micro text-[0.6rem] text-muted-foreground">
          Impulso sugerido · Meta Ads · {propuesta.clienteNombre}
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">{propuesta.anuncioNombre}</p>
        {propuesta.texto && (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{propuesta.texto}</p>
        )}
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{propuesta.motivo}</p>
        <p className="mt-1.5 text-[0.68rem] leading-5 text-muted-foreground">
          Crea un anuncio nuevo que reutiliza esta misma publicación y conserva sus reacciones y comentarios.
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

  if (propuesta.tipo === "edicion") {
    const niveles = { campana: "campaña", conjunto: "conjunto", anuncio: "anuncio" } as const;
    return (
      <div className="w-full rounded-xl border border-border bg-card p-3">
        <p className="font-micro text-[0.6rem] text-muted-foreground">
          Edición propuesta · {propuesta.plataforma === "google" ? "Google Ads" : "Meta Ads"} · {niveles[propuesta.nivel]}
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">{propuesta.nombre}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{propuesta.motivo}</p>
        <ul className="mt-2 space-y-1.5">
          {propuesta.diff.map((d) => (
            <li key={d.campo} className="text-xs leading-5">
              <span className="font-semibold text-foreground/80">{d.etiqueta}</span>
              <span className="block break-words text-muted-foreground line-through">{d.antes}</span>
              <span className="block break-words text-foreground">{d.despues}</span>
            </li>
          ))}
        </ul>
        {propuesta.pausaAlAplicar && propuesta.estado === "pendiente" && (
          <p className="mt-2 text-xs font-semibold text-warn">
            Al aplicarlo, esto queda pausado: no entregará hasta que lo actives de nuevo.
          </p>
        )}
        {propuesta.avisos.map((aviso) => (
          <p key={aviso} className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">⚠️ {aviso}</p>
        ))}
        <div className="mt-3 flex items-center gap-2">
          {propuesta.estado === "pendiente" && puedeAprobar && (
            <>
              <button
                type="button"
                onClick={onAplicar}
                className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground"
              >
                Aplicar cambio
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
          {propuesta.estado === "pendiente" && !puedeAprobar && (
            <span className="text-xs text-muted-foreground">Tu rol puede ver la propuesta pero no aplicarla.</span>
          )}
          {propuesta.estado === "aplicando" && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <ThinkingOrb size="xs" state="generating" label="" />
              Aplicando…
            </span>
          )}
          {propuesta.estado === "aplicada" && (
            <span className="flex items-start gap-1.5 text-xs font-semibold text-ok">
              <Check className="mt-0.5 size-3.5 shrink-0" />
              {propuesta.aviso ?? "Cambio aplicado"}
            </span>
          )}
          {propuesta.estado === "descartada" && <span className="text-xs text-muted-foreground">Descartada</span>}
          {propuesta.estado === "error" && <span className="text-xs text-danger">{propuesta.error}</span>}
        </div>
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
