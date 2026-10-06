/**
 * Solicitudes de publicación: un analista arma algo (un anuncio dentro de un conjunto, un conjunto, una campaña) y un
 * supervisor lo aprueba o lo rechaza. Aquí vive la parte pura: los estados, quién puede qué y los mensajes que ve cada
 * persona. Sin red ni base de datos, para poder probarla.
 *
 * Estados:
 *  - pendiente  → enviada, esperando a un supervisor.
 *  - rechazada  → un supervisor la rechazó (con motivo).
 *  - cancelada  → quien la creó la retiró antes de que se revisara.
 *  - publicada  → aprobada y creada en la plataforma, pausada. Todavía no está funcionando.
 *  - activa     → ya está activa dentro de la plataforma: recién ahí se avisa que quedó funcionando.
 *  - fallida    → se aprobó pero la plataforma rechazó algún paso.
 */
export const ESTADOS_DE_SOLICITUD = ["pendiente", "rechazada", "cancelada", "publicada", "activa", "fallida"] as const;
export type EstadoDeSolicitud = (typeof ESTADOS_DE_SOLICITUD)[number];

export const esEstadoDeSolicitud = (v: unknown): v is EstadoDeSolicitud =>
  typeof v === "string" && (ESTADOS_DE_SOLICITUD as readonly string[]).includes(v);

/** Estados que la persona que creó la solicitud todavía no vio (generan aviso hasta que los abre). */
export const ESTADOS_QUE_AVISAN = new Set<EstadoDeSolicitud>(["rechazada", "publicada", "activa", "fallida"]);

type Transicion = { de: EstadoDeSolicitud[]; a: EstadoDeSolicitud };
const TRANSICIONES: Record<string, Transicion> = {
  aprobar: { de: ["pendiente"], a: "publicada" },
  rechazar: { de: ["pendiente"], a: "rechazada" },
  cancelar: { de: ["pendiente"], a: "cancelada" },
  marcar_activa: { de: ["publicada"], a: "activa" },
};

export type AccionDeSolicitud = keyof typeof TRANSICIONES;

export function puedeTransicionar(accion: string, estado: EstadoDeSolicitud): boolean {
  const t = TRANSICIONES[accion];
  return Boolean(t && t.de.includes(estado));
}

export type SolicitudVisible = {
  estado: EstadoDeSolicitud;
  creadorNombre: string;
  revisorNombre: string | null;
  notaDeRevision: string | null;
  titulo: string;
  error: string | null;
};

/** Lo que lee quien creó la solicitud, con las palabras del equipo. */
export function mensajeParaElCreador(s: SolicitudVisible, supervisores: string[]): string {
  switch (s.estado) {
    case "pendiente":
      return supervisores.length > 0
        ? `Tu creación fue enviada a revisión. Un supervisor debe aprobarla: ${supervisores.join(", ")}.`
        : "Tu creación fue enviada a revisión. Un supervisor debe aprobarla.";
    case "rechazada":
      return `${s.revisorNombre ?? "Un supervisor"} la rechazó${s.notaDeRevision ? `: ${s.notaDeRevision}` : "."}`;
    case "cancelada":
      return "La retiraste antes de que se revisara.";
    case "publicada":
      return `${s.revisorNombre ?? "Un supervisor"} la aprobó y quedó creada en la plataforma, pausada. Te avisamos cuando esté activa y funcionando.`;
    case "activa":
      return "Aprobada y funcionando: ya está activa en la plataforma.";
    case "fallida":
      return `Se aprobó, pero la plataforma no la pudo crear${s.error ? `: ${s.error}` : "."}`;
  }
}

/** Lo que lee el supervisor en su alerta. */
export function textoDeAlertaParaSupervisor(s: Pick<SolicitudVisible, "creadorNombre" | "titulo">, destino: string): string {
  return `${s.creadorNombre} quiere subir ${s.titulo}${destino ? ` a ${destino}` : ""}.`;
}

/** Un título corto y claro de lo que se pide, a partir del borrador. */
export function tituloDeSolicitud(d: {
  name: string;
  existingCampaign: { campaignName: string } | null;
  existingAdset: { adsetName: string } | null;
  boostPostId: string | null;
  platforms: string[];
}, cantidad = 1): string {
  const cuantos = cantidad > 1 ? `${cantidad} anuncios` : "un anuncio";
  if (d.existingAdset) return d.boostPostId || cantidad > 1 ? `${cuantos} impulsado${cantidad > 1 ? "s" : ""}` : "un anuncio";
  if (d.existingCampaign) return "un conjunto de anuncios";
  return `la campaña «${d.name}»`;
}

/** ¿Esta persona puede ver esta solicitud? (la creó, o revisa y tiene el cliente a su alcance). */
export function puedeVerSolicitud(opciones: { email: string; esRevisor: boolean; creadorEmail: string; clienteEnAlcance: boolean }): boolean {
  return opciones.email === opciones.creadorEmail || (opciones.esRevisor && opciones.clienteEnAlcance);
}
