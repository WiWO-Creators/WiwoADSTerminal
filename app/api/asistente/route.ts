import { getSession } from "@/app/sesion";
import {
  asistenteConfigurado,
  correrAsistente,
  type EventoDelAsistente,
} from "@/lib/asistente";
import { CSV_TAMANO_MAXIMO, perfilarCsv } from "@/lib/asistente-csv";
import { esRango } from "@/lib/rangos";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const MAX_MENSAJES = 24;
const MAX_LARGO_MENSAJE = 8_000;

type Cuerpo = {
  mensajes?: Array<{ role?: string; content?: string }>;
  rango?: string;
  clienteId?: string | null;
  clienteNombre?: string | null;
  csv?: { nombre?: string; texto?: string } | null;
};

function fallo(mensaje: string, status: number) {
  return Response.json({ error: mensaje }, { status, headers: NO_STORE });
}

/**
 * Conversación con el asistente, en streaming (SSE).
 *
 * El acceso es el mismo de siempre: quien no tiene sesión o rol no entra, y lo
 * que el asistente puede leer sale del mismo `getPerformanceSnapshot` que ya
 * filtra por los clientes asignados a esa persona.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fallo("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return fallo("Origen no permitido", 403);
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fallo("Formato de solicitud no válido", 415);
  }
  if (!asistenteConfigurado()) {
    return fallo("El asistente no está configurado (falta ANTHROPIC_API_KEY).", 503);
  }

  let cuerpo: Cuerpo;
  try {
    cuerpo = (await request.json()) as Cuerpo;
  } catch {
    return fallo("Solicitud no válida", 400);
  }

  const recibidos = Array.isArray(cuerpo.mensajes) ? cuerpo.mensajes.slice(-MAX_MENSAJES) : [];
  const mensajes = recibidos
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim() !== "",
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_LARGO_MENSAJE) }));
  // La API exige empezar por el usuario y terminar en una pregunta suya.
  while (mensajes.length > 0 && mensajes[0].role !== "user") mensajes.shift();
  if (mensajes.length === 0 || mensajes[mensajes.length - 1].role !== "user") {
    return fallo("Falta la pregunta", 400);
  }

  const csvTexto = cuerpo.csv?.texto;
  if (typeof csvTexto === "string" && csvTexto.length > 0) {
    if (csvTexto.length > CSV_TAMANO_MAXIMO) {
      return fallo("El archivo es demasiado grande (máximo 1,5 MB).", 413);
    }
    const perfil = perfilarCsv(String(cuerpo.csv?.nombre ?? "archivo.csv").slice(0, 120), csvTexto);
    const ultimo = mensajes[mensajes.length - 1];
    ultimo.content = `${ultimo.content}\n\n[ARCHIVO ADJUNTO]\n${perfil.texto}\n[FIN DEL ARCHIVO ADJUNTO]`;
  }

  const rango = typeof cuerpo.rango === "string" && esRango(cuerpo.rango) ? cuerpo.rango : undefined;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitir = (evento: EventoDelAsistente) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evento)}\n\n`));
        } catch {
          // La persona cerró el panel a mitad de respuesta: no hay a quién enviarle.
        }
      };
      try {
        await correrAsistente(
          {
            actor: session.actor,
            rango,
            clienteId: cuerpo.clienteId ?? null,
            mensajes,
          },
          emitir,
          cuerpo.clienteNombre ?? null,
        );
      } finally {
        try {
          controller.close();
        } catch {
          // ya cerrado
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
