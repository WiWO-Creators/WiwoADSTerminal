/**
 * Salud de medición de un cliente: ¿el marcaje de GA4 está midiendo bien los
 * leads? Puro (sin red ni base de datos): recibe los eventos ya leídos.
 *
 * De la medición dependen los leads y saber si todo está en orden, así que
 * esto busca los problemas que más pesan: eventos que no son conversiones pero
 * figuran como clave (inflan las cifras, y si se importan a Google Ads,
 * también lo que optimiza), leads que no se marcan como clave, eventos de lead
 * que dejaron de llegar y el mismo evento escrito de dos maneras.
 *
 * No juzga lo que no sabe: sin eventos de lead ni una sola señal, dice que no
 * hay con qué medir leads; no afirma que el sitio no tenga formulario.
 */
import { normalizarNombreDeEvento } from "./nombres-de-evento";

export type EventoGa4 = { nombre: string; eventos: number; clave: number };

export type SeveridadMedicion = "alta" | "media";

export type Hallazgo = {
  id: string;
  severidad: SeveridadMedicion;
  /** Lo que pasa, en una frase. */
  titulo: string;
  /** Qué ocurre y dónde corregirlo (Google Analytics o Tag Manager). */
  detalle: string;
  /** Eventos involucrados, para poder ir a corregirlos. */
  eventos: string[];
};

export type ResultadoMedicion = {
  hallazgos: Hallazgo[];
  resumen: {
    eventosClave: number;
    eventosDeLead: number;
    leadsMarcadosComoClave: number;
  };
  /** Sin hallazgos de severidad alta. */
  sano: boolean;
};

/** Eventos automáticos o de navegación: nunca son una conversión. */
export const EVENTOS_NO_CONVERSION = new Set([
  "page_view",
  "user_engagement",
  "session_start",
  "first_visit",
  "scroll",
  "click",
  "page_scroll",
]);

/** Eventos de interacción que rara vez son un lead: conviene revisarlos si son clave. */
const INTERACCION = /^(file_download|video_|menu_|banner_|notice_|outbound|view_search_results)/i;

/** Nombres que suelen ser un lead (formulario, contacto, cotización…). */
const PISTAS_DE_LEAD = /(lead|contact|formul|form_submit|form-submit|submit|cotiz|solicit|whatsapp|agend|reserv|suscrip|convers)/i;

export const esEventoDeLead = (nombre: string): boolean =>
  !EVENTOS_NO_CONVERSION.has(nombre) && !INTERACCION.test(nombre) && PISTAS_DE_LEAD.test(nombre);

/** Eventos mínimos del periodo previo para considerar que «dejó de llegar» un evento de lead. */
export const EVENTOS_MINIMOS_PARA_CAIDA = 5;

const n = (v: number) => v.toLocaleString("es-CL");
const lista = (xs: string[]) => xs.map((x) => `«${x}»`).join(", ");

export function evaluarMedicion(ultimos30: EventoGa4[], ultimos7: EventoGa4[] | null): ResultadoMedicion {
  const hallazgos: Hallazgo[] = [];
  const con = ultimos30.filter((e) => e.eventos > 0);

  if (con.length === 0) {
    return {
      hallazgos: [
        {
          id: "sin_datos",
          severidad: "alta",
          titulo: "Google Analytics no está recibiendo datos",
          detalle: "En 30 días no llegó ni un evento. Revisa en Tag Manager que la etiqueta de Analytics esté publicada, o que el ID de la propiedad guardado en la ficha sea el correcto.",
          eventos: [],
        },
      ],
      resumen: { eventosClave: 0, eventosDeLead: 0, leadsMarcadosComoClave: 0 },
      sano: false,
    };
  }

  // 1. Eventos automáticos marcados como clave.
  const automaticos = con.filter((e) => EVENTOS_NO_CONVERSION.has(e.nombre) && e.clave > 0);
  if (automaticos.length > 0) {
    hallazgos.push({
      id: "clave_no_conversion",
      severidad: "alta",
      titulo: "Las visitas se están contando como conversiones",
      detalle: `${automaticos.map((e) => `«${e.nombre}» (${n(e.clave)})`).join(", ")} figuran como evento clave, así que cada visita suma como conversión y Google Ads puede optimizar por visitas en vez de por leads. En Google Analytics → Administrar → Eventos, desmarca «Marcar como evento clave» en ${automaticos.length === 1 ? "ese evento" : "esos eventos"}.`,
      eventos: automaticos.map((e) => e.nombre),
    });
  }

  // 2. Interacciones marcadas como clave (dudoso).
  const dudosos = con.filter((e) => INTERACCION.test(e.nombre) && e.clave > 0);
  if (dudosos.length > 0) {
    hallazgos.push({
      id: "clave_dudoso",
      severidad: "media",
      titulo: "Revisa si estas acciones son conversiones de verdad",
      detalle: `${dudosos.map((e) => `«${e.nombre}» (${n(e.clave)})`).join(", ")} cuentan como conversión. Una descarga o ver un video rara vez es un lead: si no lo es para este cliente, desmárcalos en Google Analytics → Administrar → Eventos.`,
      eventos: dudosos.map((e) => e.nombre),
    });
  }

  // 3. Leads.
  const leads = con.filter((e) => esEventoDeLead(e.nombre));
  const leadsClave = leads.filter((e) => e.clave > 0);
  if (leads.length === 0) {
    hallazgos.push({
      id: "sin_evento_de_lead",
      severidad: "alta",
      titulo: "El formulario no está enviando ningún aviso",
      detalle: "En 30 días no hay ningún evento de formulario enviado o contacto, así que hoy no se pueden medir leads. En Tag Manager, revisa que el formulario dispare un evento (por ejemplo generate_lead) y publícalo.",
      eventos: [],
    });
  } else {
    const sinMarcar = leads.filter((e) => e.clave === 0);
    if (sinMarcar.length > 0) {
      hallazgos.push({
        id: "lead_sin_clave",
        severidad: leadsClave.length === 0 ? "alta" : "media",
        titulo: leadsClave.length === 0 ? "Los leads no cuentan como conversión" : "Hay leads que no cuentan como conversión",
        detalle: `${sinMarcar.map((e) => `«${e.nombre}» (${n(e.eventos)})`).join(", ")} ${sinMarcar.length === 1 ? "parece un lead y no llega" : "parecen leads y no llegan"} a los reportes ni a Google Ads. En Google Analytics → Administrar → Eventos, márca${sinMarcar.length === 1 ? "lo" : "los"} como evento clave.`,
        eventos: sinMarcar.map((e) => e.nombre),
      });
    }
  }

  // 4. Mismo evento con distinta grafía.
  const grupos = new Map<string, string[]>();
  for (const e of con) grupos.set(normalizarNombreDeEvento(e.nombre), [...(grupos.get(normalizarNombreDeEvento(e.nombre)) ?? []), e.nombre]);
  const duplicados = [...grupos.values()].filter((g) => g.length > 1);
  if (duplicados.length > 0) {
    hallazgos.push({
      id: "duplicados",
      severidad: "media",
      titulo: "Un mismo evento está escrito de dos maneras",
      detalle: `${duplicados.map((g) => lista(g)).join("; ")} son el mismo evento con distinto nombre: Analytics los cuenta por separado y parte de los leads queda fuera. En Tag Manager deja un solo nombre.`,
      eventos: duplicados.flat(),
    });
  }

  // 5. Leads que dejaron de llegar (solo con el periodo reciente a la vista).
  if (ultimos7) {
    const reciente = new Map(ultimos7.map((e) => [e.nombre, e.eventos]));
    const caidos = leads.filter((e) => {
      const ultimaSemana = reciente.get(e.nombre) ?? 0;
      return ultimaSemana === 0 && e.eventos - ultimaSemana >= EVENTOS_MINIMOS_PARA_CAIDA;
    });
    if (caidos.length > 0) {
      hallazgos.push({
        id: "lead_caido",
        severidad: "alta",
        titulo: "Un formulario dejó de enviar avisos esta semana",
        detalle: `${caidos.map((e) => `«${e.nombre}» (${n(e.eventos)} en 30 días)`).join(", ")} no registró nada en los últimos 7 días. Puede que el formulario o su etiqueta se hayan roto: envía un formulario de prueba y revisa la etiqueta en Tag Manager.`,
        eventos: caidos.map((e) => e.nombre),
      });
    }
  }

  return {
    hallazgos,
    resumen: {
      eventosClave: con.filter((e) => e.clave > 0).length,
      eventosDeLead: leads.length,
      leadsMarcadosComoClave: leadsClave.length,
    },
    sano: !hallazgos.some((h) => h.severidad === "alta"),
  };
}
