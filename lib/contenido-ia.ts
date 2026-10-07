/**
 * «Súbeme estas imágenes en carrusel / como anuncios en la campaña X»: resuelve el destino por nombre, valida el contenido y
 * deja la solicitud lista para que la apruebe quien corresponde. Al aprobarse, el contenido se crea y queda corriendo.
 * Pensado para la IA: pide poco y dice lo que asumió.
 */
import { tituloDeContenido, validarContenido, type DatosDeContenido, type FormatoDeContenido } from "@/lib/anuncios-formato-pura";
import { resolverDestinoMeta } from "@/lib/impulsos";
import { colocacionesDeConjuntoMeta, metaNativoConfigurado } from "@/lib/meta-nativo";
import { enAlcance, type Actor } from "@/lib/permisos";
import { listPortfolios } from "@/lib/portafolios-store";
import { crearSolicitudDeContenido, ErrorDeSolicitud, type Solicitud } from "@/lib/solicitudes";

export type ResultadoDeContenido = {
  solicitud: Solicitud | null;
  supuestos: string[];
  avisos: string[];
  conjuntosPosibles: string[];
  mensaje: string;
};

export async function solicitarContenido(
  actor: Actor,
  entrada: {
    clienteId: string;
    campana?: string;
    conjunto?: string;
    formato: FormatoDeContenido;
    imagenes: Array<{ url: string; titulo?: string; descripcion?: string; enlace?: string }>;
    mensaje?: string;
    enlace?: string;
    cta?: string;
  },
): Promise<ResultadoDeContenido> {
  const vacio = (mensaje: string, extra: Partial<ResultadoDeContenido> = {}): ResultadoDeContenido => ({ solicitud: null, supuestos: [], avisos: [], conjuntosPosibles: [], mensaje, ...extra });
  if (!enAlcance(actor, entrada.clienteId)) throw new ErrorDeSolicitud("Ese cliente no está en tu alcance.", 403);
  const cliente = (await listPortfolios()).find((p) => p.id === entrada.clienteId);
  if (!cliente) throw new ErrorDeSolicitud("Cliente no encontrado.", 404);
  if (!entrada.campana?.trim() && !entrada.conjunto?.trim()) return vacio("Falta indicar la campaña o el conjunto de destino.");

  const destino = await resolverDestinoMeta(cliente, entrada);
  if ("error" in destino) return vacio(destino.error, { conjuntosPosibles: destino.conjuntosPosibles });
  const { elegido, supuestos } = destino;

  // Lo que la persona no dijo se deduce y se declara: el enlace del sitio del cliente, el botón por defecto.
  const enlace = entrada.enlace?.trim() || cliente.website?.trim() || "";
  if (!entrada.enlace?.trim() && enlace) supuestos.push(`No indicaste el enlace de destino: usé el sitio del cliente (${enlace}).`);
  const datos: DatosDeContenido = {
    formato: entrada.formato,
    mensaje: entrada.mensaje?.trim() ?? "",
    enlace,
    cta: entrada.cta?.trim() || "LEARN_MORE",
    imagenes: entrada.imagenes,
  };
  if (!entrada.cta?.trim()) supuestos.push("No indicaste el botón: usé «Más información».");
  const errores = validarContenido(datos);
  if (errores.length > 0) return vacio(`No se puede preparar todavía: ${errores[0]}`, { supuestos });

  const avisos: string[] = [];
  if (metaNativoConfigurado()) {
    try {
      const c = await colocacionesDeConjuntoMeta(elegido.id);
      const faltan = [c.feed ? null : "feed", c.stories ? null : "stories", c.reels ? null : "reels"].filter(Boolean);
      if (!c.automaticas && faltan.length > 0) avisos.push(`El conjunto no cubre estas ubicaciones: ${faltan.join(", ")}. Si el contenido es para Stories o Reels, no se mostraría ahí.`);
    } catch {
      // Sin la lectura de ubicaciones, se sigue: es solo un aviso.
    }
  }

  const etiqueta = datos.mensaje.replace(/\s+/g, " ").slice(0, 40);
  const solicitud = await crearSolicitudDeContenido(actor, [
    {
      __contenido: true,
      portfolioId: cliente.id,
      accountId: elegido.accountId,
      campaignId: elegido.campaignId,
      campaignName: elegido.campaignName,
      adsetId: elegido.id,
      adsetName: elegido.nombre ?? "",
      nombre: `${entrada.formato === "carrusel" ? "Carrusel" : "Imagen"} · ${etiqueta}`,
      datos,
    },
  ]);
  return {
    solicitud,
    supuestos,
    avisos,
    conjuntosPosibles: [],
    mensaje: `${tituloDeContenido(datos)} listo para «${elegido.nombre}», enviado a aprobación.`,
  };
}
