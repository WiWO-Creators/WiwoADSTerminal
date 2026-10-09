/**
 * Plan de edición de algo ya publicado: lo que el modo editar del Constructor
 * simula y después ejecuta.
 *
 * Mismo principio que `buildPlan` para crear: se traduce lo que la persona
 * pidió a los pasos EXACTOS que se ejecutarían, con los parámetros reales de
 * cada acción, y solo entra un paso por cada campo que de verdad cambió
 * respecto de lo que hoy está en la plataforma. Pedir el mismo valor que ya
 * tiene no genera ninguna escritura.
 *
 * Es puro: sin red ni base de datos, para poder probarlo con datos reales de
 * Windsor. Quien ejecuta es `edicion-ejecutar.ts`.
 *
 * Cada paso declara su vía (`windsor` o `nativa`, ver `plataformas.ts`): Windsor
 * cuando tiene la acción, la API de la propia plataforma cuando no (hoy, el
 * contenido de un anuncio de búsqueda de Google).
 */
import { esCta } from "./cta";
import { horarioParaMeta, problemasDeHorario, textoDeHorario, type TramoDeHorario } from "./horario-meta-pura";
import { FORMATOS_META, formatosDeSegmentacion, META_SURFACES, POSICIONES_META, posicionesInvalidas, REDES_CON_POSICIONES, type FormatoMeta, type RedConPosiciones } from "./formatos-meta-pura";
import { formatearPalabraClave, parsearPalabraClave, problemaDePalabraClave } from "./palabras-clave";
import { validarCambiosCampana, validarCambiosExtensiones, validarCambiosGrupoDeRecursos, validarCambiosRsa, type CambiosCampanaGoogle, type CambiosExtensiones, type CambiosGrupoDeRecursos, type CambiosRsa } from "./google-ads-nativo";
import {
  type DetalleAnuncio,
  type DetalleCampana,
  type DetalleConjunto,
} from "./detalle-entidad";
import { unidadesMenoresMeta } from "./monedas";
import type { Platform, ViaEscritura } from "./plataformas";

/** Lo que la persona quiere cambiar. Un campo ausente no se toca. */
export type CambiosEdicion = {
  nombre?: string;
  /** true: pausar la entidad. Un Creator lo propone y lo aprueba un Lead o superior. */
  pausar?: boolean;
  /** true: volver a activar la entidad (por ejemplo, una campaña que quedó apagada). */
  activar?: boolean;
  /** true: ELIMINAR la entidad (irreversible). Un Creator lo propone y lo aprueba un Lead o superior. Se pide solo. */
  eliminar?: boolean;
  presupuesto?: { tipo: "daily" | "lifetime"; monto: number };
  /** Meta: puja del conjunto. Google: CPC máximo del grupo. En la moneda de la cuenta. */
  puja?: number;
  /** Meta (conjunto): fecha y hora de término, ISO 8601. LinkedIn (conjunto): fecha aaaa-mm-dd. */
  fin?: string;
  /** Meta (campaña): tope de gasto total, en la moneda de la cuenta. */
  limiteGasto?: number;
  /** Google (campaña, API nativa): fecha de inicio aaaa-mm-dd. Google no deja cambiarla si la campaña ya empezó. */
  inicio?: string;
  /** Google (campaña, API nativa): dónde se muestra. La Búsqueda de Google no se puede quitar. */
  redes?: { busqueda: boolean; asociadas: boolean; display: boolean };
  /** Google (campaña, API nativa): rotación de anuncios. */
  rotacion?: "OPTIMIZE" | "ROTATE_INDEFINITELY";
  /** Google (campaña, API nativa): estrategia de puja con sus importes (en la moneda de la cuenta). */
  pujaGoogle?: {
    tipo: "clics" | "conversiones" | "valor_conversion" | "cpc_manual" | "cuota_impresiones";
    cpcMaximo?: number | null;
    cpaObjetivo?: number | null;
    roasObjetivo?: number | null;
    mejorarCpc?: boolean;
    cuotaUbicacion?: "TOP_OF_PAGE" | "ABSOLUTE_TOP_OF_PAGE" | "ANYWHERE_ON_PAGE";
    cuotaPorcentaje?: number;
  };
  /** Google (campaña, API nativa): opciones de ubicación. */
  presencia?: "presencia" | "presencia_o_interes";
  /** Google (campaña, API nativa): plantilla de URL de seguimiento (vacío la quita). */
  plantillaSeguimiento?: string;
  /** Meta (campaña con presupuesto propio o conjunto): estrategia de puja (`LOWEST_COST_WITHOUT_CAP`, `COST_CAP`…). */
  estrategiaPuja?: string;
  /** Meta (campaña): categoría especial (`HOUSING`, `EMPLOYMENT`, `CREDIT`, `ISSUES_ELECTIONS_POLITICS`) o vacío = ninguna. */
  categoriaEspecial?: string;
  /** Meta (conjunto): meta de optimización (`LINK_CLICKS`, `REACH`, `LEAD_GENERATION`…). */
  optimizacion?: string;
  /** Meta (conjunto): segmentación. */
  generos?: "todos" | "hombres" | "mujeres";
  /** Meta (conjunto): intereses que deben quedar (ids reales de Meta). Vacío = ninguno. */
  interesesIds?: string[];
  /** Meta (conjunto): audiencias a incluir (ids). */
  audienciasIncluir?: string[];
  /** Meta (conjunto): audiencias a excluir (ids). */
  audienciasExcluir?: string[];
  /** Meta (conjunto): ventana de atribución. */
  atribucion?: "default" | "click_1d" | "click_7d" | "click_1d_view_1d";
  /** Meta (conjunto): redes donde se muestra. Vacío = automáticas. */
  plataformas?: Array<"facebook" | "instagram" | "audience_network" | "messenger">;
  /** Meta (conjunto): dónde se muestra dentro de Facebook e Instagram (Feed, Historias, Reels). Vacío = automáticos. Exige haber elegido las redes. */
  formatos?: FormatoMeta[];
  /** Meta (conjunto): horario de entrega por días y horas. Vacío = todo el día. Meta lo admite solo con presupuesto TOTAL del conjunto y fecha de término. */
  horario?: TramoDeHorario[];
  /** Meta (conjunto): TODAS las ubicaciones, por red y con su valor de API (por ejemplo `instagram: ["stream", "reels", "explore"]`). Lista vacía = automáticas en esa red. La red debe estar elegida. */
  posiciones?: Partial<Record<RedConPosiciones, string[]>>;
  edadMin?: number;
  edadMax?: number;
  paises?: string[];
  /** Meta (anuncio): dominio al que lleva las conversiones, para la atribución (`example.com`, sin https://). */
  dominioConversion?: string;
  /** Meta (anuncio de mensajes): saludo automático cuando la persona abre la conversación. */
  mensajeBienvenida?: string;
  /** Meta (anuncio). */
  textoPrincipal?: string;
  titulo?: string;
  descripcion?: string;
  urlDestino?: string;
  imagenUrl?: string;
  cta?: string;
  urlTags?: string;
  /** Google (grupo de anuncios): palabras clave positivas. */
  palabrasClave?: {
    /** Una por línea, con la sintaxis de Google: `[exacta]`, `"frase"`, amplia. */
    agregar?: string[];
    /** Qué hacer con cada palabra clave existente, por su id de criterio. */
    acciones?: Record<string, "quitar" | "pausar" | "activar">;
  };
  /** Google (campaña): enlaces de sitio y textos destacados. Las listas son las que deben quedar. */
  extensiones?: CambiosExtensiones;
  /** Google Performance Max (campaña): cambia los textos y las URL de UN grupo de recursos. Las listas son las que deben quedar. */
  grupoDeRecursos?: { id: string } & CambiosGrupoDeRecursos;
  /** Google (anuncio de búsqueda responsivo). */
  titulares?: Array<{ texto: string; fijado?: string | null }>;
  descripciones?: Array<{ texto: string; fijado?: string | null }>;
  urlsFinales?: string[];
  path1?: string;
  path2?: string;
  sufijoUrl?: string;
};

/** ¿El cambio toca dinero (presupuesto o tope de gasto)? Esos cambios, si los propone un Creator, los aprueba un Director Digital o superior. */
export function tocaPresupuesto(c: CambiosEdicion): boolean {
  return c.presupuesto !== undefined || c.limiteGasto !== undefined;
}

export type AntesDeEdicion =
  | { nivel: "campana"; entidad: DetalleCampana }
  | { nivel: "conjunto"; entidad: DetalleConjunto; campana: DetalleCampana | null }
  | { nivel: "anuncio"; entidad: DetalleAnuncio };

export type PasoEdicion = {
  via: ViaEscritura;
  platform: Platform;
  /** Acción de Windsor, o `ads:mutate` para la vía nativa de Google. */
  action: string;
  label: string;
  params: Record<string, unknown>;
  /** Campos de `CambiosEdicion` que cubre este paso. */
  campos: Array<keyof CambiosEdicion>;
  /** true: este paso no obliga a pausar (bajar un presupuesto). */
  sinPausa?: boolean;
};

export type CambioVisible = {
  campo: string;
  etiqueta: string;
  antes: string;
  despues: string;
};

export type Problema = { campo: string; mensaje: string; bloqueante: boolean };

export type PlanEdicion = {
  pasos: PasoEdicion[];
  diff: CambioVisible[];
  problemas: Problema[];
  /**
   * true: tras aplicar, la entidad se pausa. Regla del equipo (24-09-2026):
   * todo cambio que no sea un simple renombre ni una baja de presupuesto pausa lo editado para que
   * alguien lo revise antes de que siga corriendo con lo nuevo.
   */
  pausaAlAplicar: boolean;
  /** Se pidió pausar: es un cambio aunque no haya pasos de edición. */
  pausaPedida?: boolean;
  /** Se pidió activar: es un cambio aunque no haya pasos de edición. */
  activacionPedida?: boolean;
};

/** ¿Hay algo que aplicar? Pasos de edición o una pausa pedida. */
export function hayAlgoQueAplicar(plan: PlanEdicion): boolean {
  return plan.pasos.length > 0 || plan.pausaPedida === true || plan.activacionPedida === true;
}

/* -------------------------------------------------------------------------- */

function moneda(valor: number | null, codigo: string | null): string {
  if (valor === null) return "—";
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: codigo ?? "USD",
      maximumFractionDigits: 2,
    }).format(valor);
  } catch {
    return String(valor);
  }
}

const vacio = (valor: string | null | undefined): string => (valor && valor.trim() ? valor : "—");

/** Un texto pedido cuenta como cambio solo si difiere de lo actual. */
function cambia(pedido: string | undefined, actual: string | null): pedido is string {
  return pedido !== undefined && pedido.trim() !== (actual ?? "").trim();
}

function urlValida(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */

export function planEdicion(
  provider: Platform,
  antes: AntesDeEdicion,
  cambios: CambiosEdicion,
  {
    currency,
    nativaGoogle = false,
    nativaLinkedin = false,
  }: {
    currency: string | null;
    /** true: quien edita tiene conectada su cuenta de Google (API nativa disponible). */
    nativaGoogle?: boolean;
    /** true: se puede escribir en esta cuenta de LinkedIn por su API directa (ver `accesoNativoLinkedin`). */
    nativaLinkedin?: boolean;
  },
): PlanEdicion {
  const plan: PlanEdicion = { pasos: [], diff: [], problemas: [], pausaAlAplicar: false };
  const problema = (campo: string, mensaje: string, bloqueante = true) =>
    plan.problemas.push({ campo, mensaje, bloqueante });

  if (cambios.eliminar === true) {
    planDeEliminacion(plan, provider, antes, cambios, problema);
    return plan;
  }

  if (provider === "google") planGoogle(plan, antes, cambios, currency, problema);
  else if (provider === "meta") planMeta(plan, antes, cambios, currency, problema);
  else if (provider === "linkedin") planLinkedin(plan, antes, cambios, currency, problema, nativaLinkedin);
  else problema("plataforma", "Esta plataforma todavía no permite editar.");

  if (plan.pasos.some((p) => p.via === "nativa" && p.platform === "google") && !nativaGoogle) {
    problema(
      "conexion",
      "Para editar el contenido de un anuncio de Google hay que conectar tu cuenta de Google en Integraciones.",
    );
  }

  // Decisión del equipo (2026-10-06): un cambio aprobado queda aplicado y corriendo; la pausa es solo la que se pide
  // expresamente (`pausar`). La revisión ocurre ANTES, en la aprobación, no después con la entidad detenida.
  plan.pausaAlAplicar = false;

  if (cambios.pausar === true) {
    const estado = String((antes.entidad as { estado?: string | null }).estado ?? "").toUpperCase();
    if (["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "ARCHIVED", "REMOVED"].includes(estado)) {
      problema("pausar", "Ya está pausado: no hay nada que pausar.");
    } else {
      plan.pausaPedida = true;
      plan.pausaAlAplicar = true;
      plan.diff.push({ campo: "estado", etiqueta: "Estado", antes: estado === "" ? "—" : "Activo", despues: "Pausado" });
    }
  }

  if (cambios.activar === true) {
    const estado = String((antes.entidad as { estado?: string | null }).estado ?? "").toUpperCase();
    if (cambios.pausar === true) {
      problema("activar", "No se puede pausar y activar a la vez.");
    } else if (provider === "linkedin" && !nativaLinkedin) {
      problema("activar", "LinkedIn no permite reactivar desde WiWO.ADS.");
    } else if (estado === "ACTIVE" || estado === "ENABLED") {
      problema("activar", "Ya está activo: no hay nada que activar.");
    } else {
      plan.activacionPedida = true;
      plan.diff.push({ campo: "estado", etiqueta: "Estado", antes: estado === "" ? "—" : "Pausado", despues: "Activo" });
    }
  }

  const pedidos = Object.entries(cambios).filter(([, v]) => v !== undefined);
  if (pedidos.length === 0) problema("cambios", "No hay ningún cambio que aplicar.");
  else if (!hayAlgoQueAplicar(plan) && plan.problemas.length === 0) {
    problema("cambios", "Lo que pediste ya es lo que tiene hoy: no hay nada que cambiar.");
  }
  return plan;
}

type Reporte = (campo: string, mensaje: string, bloqueante?: boolean) => void;

/** Eliminar: irreversible, se pide solo y lo aprueba un Lead o superior. LinkedIn no lo permite desde aquí. */
function planDeEliminacion(plan: PlanEdicion, provider: Platform, antes: AntesDeEdicion, cambios: CambiosEdicion, problema: Reporte) {
  const otros = Object.entries(cambios).filter(([k, v]) => k !== "eliminar" && v !== undefined);
  if (otros.length > 0) {
    problema("eliminar", "Eliminar se pide solo, sin otros cambios a la vez.");
    return;
  }
  const entidad = antes.entidad as { id: string; estado?: string | null; conjuntoId?: string | null };
  const estado = String(entidad.estado ?? "").toUpperCase();
  if (["DELETED", "REMOVED"].includes(estado)) {
    problema("eliminar", "Ya está eliminado.");
    return;
  }
  const que = antes.nivel === "campana" ? "la campaña" : antes.nivel === "conjunto" ? (provider === "google" ? "el grupo de anuncios" : "el conjunto") : "el anuncio";
  if (provider === "meta") {
    plan.pasos.push({ via: "nativa", platform: "meta", action: "meta:eliminar", label: `Eliminar ${que} en Meta`, params: { id: entidad.id, nivel: antes.nivel }, campos: ["eliminar"] });
  } else if (provider === "google") {
    plan.pasos.push({
      via: "nativa", platform: "google", action: "ads:eliminar", label: `Eliminar ${que} en Google Ads`,
      params: { id: entidad.id, nivel: antes.nivel, ad_group_id: antes.nivel === "anuncio" ? (entidad.conjuntoId ?? null) : null }, campos: ["eliminar"],
    });
  } else {
    problema("eliminar", "LinkedIn no permite eliminar desde WiWO.ADS: se archiva o se elimina en Campaign Manager. Aquí solo se puede pausar.");
    return;
  }
  plan.diff.push({ campo: "eliminar", etiqueta: "Eliminar", antes: "Existe", despues: "Eliminado para siempre" });
  problema(
    "eliminar",
    `Eliminar no se puede deshacer${antes.nivel === "anuncio" ? "." : antes.nivel === "conjunto" ? ": también se eliminan sus anuncios." : ": también se eliminan sus conjuntos y anuncios."} Si solo quieres detener la entrega, pausa.`,
    false,
  );
}

/** Campo de `CambiosRsa` → el mismo campo en `CambiosEdicion` (solo cambia `urlsFinales`). */
function campoDeRsa(clave: keyof CambiosRsa): keyof CambiosEdicion {
  return clave;
}

/* ------------------------------ Google ------------------------------------ */

function planGoogle(
  plan: PlanEdicion,
  antes: AntesDeEdicion,
  c: CambiosEdicion,
  currency: string | null,
  problema: Reporte,
) {
  if (antes.nivel === "campana") {
    const e = antes.entidad;
    if (cambia(c.nombre, e.nombre)) {
      if (!c.nombre!.trim()) problema("nombre", "El nombre no puede estar vacío.");
      else {
        plan.pasos.push({
          via: "windsor", platform: "google", action: "rename_campaign",
          label: "Renombrar la campaña",
          params: { campaign_id: e.id, name: c.nombre!.trim() }, campos: ["nombre"],
        });
        plan.diff.push({ campo: "nombre", etiqueta: "Nombre", antes: vacio(e.nombre), despues: c.nombre!.trim() });
      }
    }
    if (c.presupuesto) {
      const { tipo, monto } = c.presupuesto;
      if (!(monto > 0)) problema("presupuesto", "El presupuesto debe ser mayor a cero.");
      else if (tipo === "lifetime") {
        problema("presupuesto", "Google Ads no admite presupuesto total en campañas de búsqueda: usa uno diario.");
      } else if (monto !== e.presupuesto.diario) {
        plan.pasos.push({
          via: "windsor", platform: "google", action: "set_campaign_budget",
          label: "Cambiar el presupuesto diario",
          params: { campaign_id: e.id, budget_type: "daily", amount_micros: Math.round(monto * 1_000_000) },
          campos: ["presupuesto"],
          sinPausa: e.presupuesto.diario !== null && monto < e.presupuesto.diario,
        });
        plan.diff.push({
          campo: "presupuesto", etiqueta: "Presupuesto diario",
          antes: moneda(e.presupuesto.diario, currency), despues: moneda(monto, currency),
        });
      }
    }
    // Fechas, redes y rotación: Windsor no tiene acción para esto; se hace con la API de Google Ads.
    const nativo: CambiosCampanaGoogle = {};
    const campos: Array<keyof CambiosEdicion> = [];
    if (c.inicio !== undefined && c.inicio !== (e.inicio ?? "")) {
      nativo.inicio = c.inicio;
      campos.push("inicio");
      plan.diff.push({ campo: "inicio", etiqueta: "Inicio", antes: vacio(e.inicio), despues: c.inicio });
      if (c.inicio && c.inicio < new Date().toISOString().slice(0, 10) && !(e.inicio && e.inicio <= new Date().toISOString().slice(0, 10))) {
        problema("inicio", "La fecha de inicio ya pasó: elige hoy o una fecha futura.");
      }
      if (e.inicio && e.inicio <= new Date().toISOString().slice(0, 10)) {
        problema("inicio", "Esta campaña ya empezó: Google no deja cambiar su fecha de inicio.", true);
      }
    }
    if (c.fin !== undefined && c.fin !== (e.fin ?? "")) {
      nativo.fin = c.fin;
      campos.push("fin");
      plan.diff.push({ campo: "fin", etiqueta: "Fin", antes: e.fin ?? "Sin fin", despues: c.fin || "Sin fin" });
      if (c.fin && c.fin < new Date().toISOString().slice(0, 10)) problema("fin", "La fecha de término ya pasó: elige hoy o una fecha futura.");
    }
    if (c.redes && e.redes && (c.redes.busqueda !== e.redes.busqueda || c.redes.asociadas !== e.redes.asociadas || c.redes.display !== e.redes.display)) {
      // Verificado con `validateOnly` contra Google: en una campaña de Display las redes de búsqueda no se pueden tocar.
      if (e.objetivo && e.objetivo !== "SEARCH") problema("redes", "Las redes solo se editan en campañas de Búsqueda: en Display Google no admite ese cambio.");
      nativo.redes = c.redes;
      campos.push("redes");
      const texto = (r: { busqueda: boolean; asociadas: boolean; display: boolean }) =>
        [r.busqueda ? "Búsqueda" : null, r.asociadas ? "Socios de búsqueda" : null, r.display ? "Display" : null].filter(Boolean).join(" + ") || "—";
      plan.diff.push({ campo: "redes", etiqueta: "Redes", antes: texto(e.redes), despues: texto(c.redes) });
    }
    if (c.rotacion !== undefined && c.rotacion !== e.rotacion) {
      nativo.rotacion = c.rotacion;
      campos.push("rotacion");
      plan.diff.push({ campo: "rotacion", etiqueta: "Rotación de anuncios", antes: vacio(e.rotacion ?? null), despues: c.rotacion });
    }
    if (c.pujaGoogle) {
      const pj = c.pujaGoogle;
      const aMicros = (v: number | null | undefined) => (v && v > 0 ? Math.round(v * 1_000_000) : null);
      nativo.puja =
        pj.tipo === "clics" ? { tipo: "clics", cpcMaximoMicros: aMicros(pj.cpcMaximo) }
        : pj.tipo === "conversiones" ? { tipo: "conversiones", cpaObjetivoMicros: aMicros(pj.cpaObjetivo) }
        : pj.tipo === "valor_conversion" ? { tipo: "valor_conversion", roasObjetivo: pj.roasObjetivo ?? null }
        : pj.tipo === "cpc_manual" ? { tipo: "cpc_manual", mejorarCpc: pj.mejorarCpc === true }
        : { tipo: "cuota_impresiones", ubicacion: pj.cuotaUbicacion ?? "TOP_OF_PAGE", porcentaje: pj.cuotaPorcentaje ?? 50, cpcMaximoMicros: aMicros(pj.cpcMaximo) ?? 0 };
      campos.push("pujaGoogle");
      const NOMBRES: Record<string, string> = {
        TARGET_SPEND: "Maximizar clics", MAXIMIZE_CONVERSIONS: "Maximizar conversiones", MAXIMIZE_CONVERSION_VALUE: "Maximizar valor de conversión",
        MANUAL_CPC: "CPC manual", TARGET_IMPRESSION_SHARE: "Cuota de impresiones objetivo", TARGET_CPA: "CPA objetivo", TARGET_ROAS: "ROAS objetivo",
      };
      const ahora: Record<string, string> = { clics: "Maximizar clics", conversiones: "Maximizar conversiones", valor_conversion: "Maximizar valor de conversión", cpc_manual: "CPC manual", cuota_impresiones: "Cuota de impresiones objetivo" };
      plan.diff.push({ campo: "pujaGoogle", etiqueta: "Estrategia de puja", antes: NOMBRES[e.puja.estrategia ?? ""] ?? vacio(e.puja.estrategia), despues: ahora[pj.tipo] });
    }
    if (c.presencia !== undefined && c.presencia !== (e.presencia === "PRESENCE" ? "presencia" : e.presencia === "PRESENCE_OR_INTEREST" ? "presencia_o_interes" : undefined)) {
      nativo.presencia = c.presencia;
      campos.push("presencia");
      const t = (v: string | null | undefined) => (v === "PRESENCE" ? "Presencia" : v === "PRESENCE_OR_INTEREST" ? "Presencia o interés" : vacio(v ?? null));
      plan.diff.push({ campo: "presencia", etiqueta: "Opciones de ubicación", antes: t(e.presencia), despues: c.presencia === "presencia" ? "Presencia" : "Presencia o interés" });
    }
    if (c.plantillaSeguimiento !== undefined && c.plantillaSeguimiento !== (e.urlSeguimiento ?? "")) {
      nativo.plantillaSeguimiento = c.plantillaSeguimiento;
      campos.push("plantillaSeguimiento");
      plan.diff.push({ campo: "plantillaSeguimiento", etiqueta: "Plantilla de seguimiento", antes: vacio(e.urlSeguimiento), despues: vacio(c.plantillaSeguimiento) });
    }
    if (c.extensiones !== undefined) {
      if (e.objetivo !== "SEARCH") {
        problema("extensiones", "Las extensiones de enlaces y textos destacados solo se editan en campañas de Búsqueda.");
      } else if (e.extensiones === undefined) {
        problema("extensiones", "No se pudieron leer las extensiones de esta campaña: conecta tu cuenta de Google en Integraciones.");
      } else {
        const mensajes = validarCambiosExtensiones(c.extensiones);
        for (const m of mensajes) problema("extensiones", m);
        const clave = (x: { texto: string; url: string; descripcion1: string; descripcion2: string }) => [x.texto, x.url, x.descripcion1, x.descripcion2].map((v) => v.trim().toLowerCase()).join("|");
        const antesEnlaces = e.extensiones.sitelinks.map((x) => `${x.texto} → ${x.url}`);
        const ahoraEnlaces = c.extensiones.sitelinks?.map((x) => `${x.texto.trim()} → ${x.url.trim()}`);
        const hoyClaves = e.extensiones.sitelinks.map(clave).sort().join("\n");
        const quedanClaves = c.extensiones.sitelinks ? c.extensiones.sitelinks.map(clave).sort().join("\n") : hoyClaves;
        if (c.extensiones.sitelinks && hoyClaves !== quedanClaves) {
          plan.diff.push({ campo: "sitelinks", etiqueta: "Enlaces de sitio", antes: antesEnlaces.join(" | ") || "—", despues: (ahoraEnlaces ?? []).join(" | ") || "Ninguno" });
        }
        const hoyDest = e.extensiones.destacados.map((x) => x.trim().toLowerCase()).sort().join("\n");
        const quedanDest = c.extensiones.destacados ? c.extensiones.destacados.map((x) => x.trim().toLowerCase()).sort().join("\n") : hoyDest;
        if (c.extensiones.destacados && hoyDest !== quedanDest) {
          plan.diff.push({ campo: "destacados", etiqueta: "Textos destacados", antes: e.extensiones.destacados.join(" | ") || "—", despues: c.extensiones.destacados.map((x) => x.trim()).join(" | ") || "Ninguno" });
        }
        if (mensajes.length === 0 && (hoyClaves !== quedanClaves || hoyDest !== quedanDest)) {
          plan.pasos.push({
            via: "nativa", platform: "google", action: "ads:update_campaign_assets",
            label: "Editar los enlaces de sitio y textos destacados de la campaña",
            params: { campaign_id: e.id, cambios: c.extensiones }, campos: ["extensiones"],
          });
        }
      }
    }
    if (c.grupoDeRecursos !== undefined) {
      const { id: grupoId, ...pedido } = c.grupoDeRecursos;
      const grupo = (e.gruposDeRecursos ?? []).find((g) => g.id === grupoId);
      if (e.objetivo !== "PERFORMANCE_MAX") {
        problema("grupoDeRecursos", "Los grupos de recursos son solo de las campañas de Performance Max.");
      } else if (e.gruposDeRecursos === undefined) {
        problema("grupoDeRecursos", "No se pudieron leer los grupos de recursos: conecta tu cuenta de Google en Integraciones.");
      } else if (!grupo) {
        problema("grupoDeRecursos", "Ese grupo de recursos no es de esta campaña. Usa el id que devuelve la consulta de la campaña.");
      } else {
        const mensajes = validarCambiosGrupoDeRecursos(pedido);
        for (const m of mensajes) problema("grupoDeRecursos", m);
        const textosDe = (campo: string) => grupo.recursos.filter((r) => r.campo === campo && r.texto).map((r) => r.texto as string);
        const comparar = (clave: "titulares" | "titulosLargos" | "descripciones", campo: string, etiqueta: string) => {
          const nuevos = pedido[clave];
          if (!nuevos) return;
          const hoy = textosDe(campo);
          if (nuevos.map((t) => t.trim().toLowerCase()).sort().join("|") === hoy.map((t) => t.trim().toLowerCase()).sort().join("|")) return;
          plan.diff.push({ campo: clave, etiqueta: `${etiqueta} (grupo «${grupo.nombre ?? grupo.id}»)`, antes: hoy.join(" | ") || "—", despues: nuevos.map((t) => t.trim()).join(" | ") });
        };
        comparar("titulares", "HEADLINE", "Titulares");
        comparar("titulosLargos", "LONG_HEADLINE", "Títulos largos");
        comparar("descripciones", "DESCRIPTION", "Descripciones");
        if (pedido.urlsFinales && pedido.urlsFinales.join("\n") !== grupo.urlsFinales.join("\n")) {
          plan.diff.push({ campo: "urlsFinales", etiqueta: "URL final del grupo", antes: vacio(grupo.urlsFinales.join(", ")), despues: pedido.urlsFinales.join(", ") });
        }
        if (pedido.path1 !== undefined && pedido.path1 !== (grupo.path1 ?? "")) plan.diff.push({ campo: "path1", etiqueta: "Ruta visible 1", antes: vacio(grupo.path1), despues: vacio(pedido.path1) });
        if (pedido.path2 !== undefined && pedido.path2 !== (grupo.path2 ?? "")) plan.diff.push({ campo: "path2", etiqueta: "Ruta visible 2", antes: vacio(grupo.path2), despues: vacio(pedido.path2) });
        if (mensajes.length === 0 && plan.diff.some((d) => ["titulares", "titulosLargos", "descripciones", "urlsFinales", "path1", "path2"].includes(d.campo))) {
          plan.pasos.push({
            via: "nativa", platform: "google", action: "ads:update_asset_group",
            label: "Editar los textos y la URL del grupo de recursos (Performance Max)",
            params: { asset_group_id: grupoId, cambios: pedido }, campos: ["grupoDeRecursos"],
          });
        }
      }
    }
    if (campos.length > 0) {
      for (const mensaje of validarCambiosCampana(nativo)) problema("campana", mensaje);
      plan.pasos.push({
        via: "nativa", platform: "google", action: "ads:update_campaign",
        label: "Editar la campaña de Google (fechas, redes, puja, ubicación o seguimiento)",
        params: { campaign_id: e.id, cambios: nativo }, campos,
      });
    }
    return;
  }

  if (antes.nivel === "conjunto") {
    const e = antes.entidad;
    if (cambia(c.nombre, e.nombre)) {
      if (!c.nombre!.trim()) problema("nombre", "El nombre no puede estar vacío.");
      else {
        plan.pasos.push({
          via: "windsor", platform: "google", action: "rename_ad_group",
          label: "Renombrar el grupo de anuncios",
          params: { ad_group_id: e.id, name: c.nombre!.trim() }, campos: ["nombre"],
        });
        plan.diff.push({ campo: "nombre", etiqueta: "Nombre", antes: vacio(e.nombre), despues: c.nombre!.trim() });
      }
    }
    if (c.puja !== undefined && c.puja !== e.puja.monto) {
      if (!(c.puja > 0)) problema("puja", "El CPC máximo debe ser mayor a cero.");
      else {
        plan.pasos.push({
          via: "windsor", platform: "google", action: "set_max_cpc",
          label: "Cambiar el CPC máximo",
          params: { ad_group_id: e.id, amount_micros: Math.round(c.puja * 1_000_000) }, campos: ["puja"],
        });
        plan.diff.push({ campo: "puja", etiqueta: "CPC máximo", antes: moneda(e.puja.monto, currency), despues: moneda(c.puja, currency) });
      }
    }
    if (c.palabrasClave) planPalabrasClave(plan, e, c.palabrasClave, problema);
    return;
  }

  // Anuncio de Google: contenido por la vía nativa.
  const e = antes.entidad;
  const rsa: CambiosRsa = {};
  const actual = e.contenido;

  if (c.titulares) {
    const igual =
      c.titulares.length === actual.titulares.length &&
      c.titulares.every((t, i) => t.texto === actual.titulares[i].texto && (t.fijado ?? null) === actual.titulares[i].fijado);
    if (!igual) {
      rsa.titulares = c.titulares;
      plan.diff.push({
        campo: "titulares", etiqueta: "Titulares",
        antes: actual.titulares.map((t) => t.texto).join(" | ") || "—",
        despues: c.titulares.map((t) => t.texto).join(" | "),
      });
    }
  }
  if (c.descripciones) {
    const igual =
      c.descripciones.length === actual.descripciones.length &&
      c.descripciones.every((t, i) => t.texto === actual.descripciones[i].texto && (t.fijado ?? null) === actual.descripciones[i].fijado);
    if (!igual) {
      rsa.descripciones = c.descripciones;
      plan.diff.push({
        campo: "descripciones", etiqueta: "Descripciones",
        antes: actual.descripciones.map((t) => t.texto).join(" | ") || "—",
        despues: c.descripciones.map((t) => t.texto).join(" | "),
      });
    }
  }
  if (c.urlsFinales && c.urlsFinales.join("\n") !== actual.urlsFinales.join("\n")) {
    rsa.urlsFinales = c.urlsFinales;
    plan.diff.push({ campo: "urlsFinales", etiqueta: "URL final", antes: vacio(actual.urlsFinales.join(", ")), despues: c.urlsFinales.join(", ") });
  }
  if (c.path1 !== undefined && c.path1 !== (actual.path1 ?? "")) {
    rsa.path1 = c.path1;
    plan.diff.push({ campo: "path1", etiqueta: "Ruta visible 1", antes: vacio(actual.path1), despues: vacio(c.path1) });
  }
  if (c.path2 !== undefined && c.path2 !== (actual.path2 ?? "")) {
    rsa.path2 = c.path2;
    plan.diff.push({ campo: "path2", etiqueta: "Ruta visible 2", antes: vacio(actual.path2), despues: vacio(c.path2) });
  }
  if (c.sufijoUrl !== undefined && c.sufijoUrl !== (actual.sufijoUrl ?? "")) {
    rsa.sufijoUrl = c.sufijoUrl;
    plan.diff.push({ campo: "sufijoUrl", etiqueta: "Sufijo de URL", antes: vacio(actual.sufijoUrl), despues: vacio(c.sufijoUrl) });
  }

  if (Object.keys(rsa).length === 0) return;

  if (!e.edicionDeContenido.editable && e.tipo !== "RESPONSIVE_SEARCH_AD") {
    problema("contenido", e.edicionDeContenido.motivo ?? "Este anuncio no se puede editar.");
    plan.diff.length = 0;
    return;
  }
  for (const mensaje of validarCambiosRsa(rsa)) problema("contenido", mensaje);

  // La mutación se arma al ejecutar (`actualizarAnuncioRsa`), con la cuenta y
  // las credenciales de quien aplica; acá solo queda qué cambia y en qué anuncio.
  plan.pasos.push({
    via: "nativa", platform: "google", action: "ads:mutate",
    label: "Editar el anuncio (mismo anuncio, mismo id)",
    params: { ad_id: e.id, ad_group_id: e.conjuntoId, cambios: rsa },
    campos: (Object.keys(rsa) as Array<keyof CambiosRsa>).map(campoDeRsa),
  });
}

/** Palabras clave de un grupo: agregar, quitar, pausar y activar, con las acciones reales de Windsor. */
function planPalabrasClave(
  plan: PlanEdicion,
  e: DetalleConjunto,
  pedido: NonNullable<CambiosEdicion["palabrasClave"]>,
  problema: Reporte,
) {
  const existentes = e.palabrasClave;
  const agregar = (pedido.agregar ?? []).map((l) => l.trim()).filter(Boolean);
  const acciones = Object.entries(pedido.acciones ?? {});
  if (agregar.length === 0 && acciones.length === 0) return;

  if (existentes === null) {
    problema(
      "palabrasClave",
      "No se pudieron leer las palabras clave de este grupo: Windsor no las entrega. Conecta tu cuenta de Google en Integraciones para verlas y editarlas.",
    );
    return;
  }
  const porId = new Map(existentes.map((k) => [k.criterionId, k]));
  const clave = (t: string, m: string) => `${t.toLowerCase()}|${m}`;
  const yaExisten = new Set(existentes.map((k) => clave(k.texto, k.concordancia)));

  // --- agregar
  const nuevas: Array<{ text: string; match_type: string }> = [];
  const vistas = new Set<string>();
  for (const linea of agregar) {
    const k = parsearPalabraClave(linea);
    const error = problemaDePalabraClave(k.text);
    if (error) { problema("palabrasClave", error); continue; }
    const id = clave(k.text, k.match_type);
    if (yaExisten.has(id)) { problema("palabrasClave", `«${linea}» ya está en el grupo: se omite.`, false); continue; }
    if (vistas.has(id)) continue;
    vistas.add(id);
    nuevas.push(k);
  }

  // --- acciones sobre las existentes
  const quitar: string[] = [];
  const cambiosEstado: Array<{ criterion_id: string; status: "enabled" | "paused" }> = [];
  for (const [id, accion] of acciones) {
    const k = porId.get(id);
    if (!k) { problema("palabrasClave", `La palabra clave ${id} ya no está en el grupo.`); continue; }
    if (accion === "quitar") quitar.push(id);
    else if (accion === "pausar" && k.estado !== "PAUSED") cambiosEstado.push({ criterion_id: id, status: "paused" });
    else if (accion === "activar" && k.estado !== "ENABLED") cambiosEstado.push({ criterion_id: id, status: "enabled" });
  }

  const partes: string[] = [];
  if (nuevas.length > 0) {
    plan.pasos.push({
      via: "windsor", platform: "google", action: "push_keywords",
      label: `Agregar ${nuevas.length} palabra${nuevas.length === 1 ? "" : "s"} clave`,
      params: { ad_group_id: e.id, keywords: nuevas, status: "enabled" }, campos: ["palabrasClave"],
    });
    partes.push(`+ ${nuevas.map((k) => formatearPalabraClave(k.text, k.match_type)).join(", ")}`);
  }
  if (cambiosEstado.length > 0) {
    plan.pasos.push({
      via: "windsor", platform: "google", action: "update_keywords",
      label: "Pausar o activar palabras clave",
      params: { ad_group_id: e.id, updates: cambiosEstado }, campos: ["palabrasClave"],
    });
    for (const u of cambiosEstado) {
      const k = porId.get(u.criterion_id)!;
      partes.push(`${u.status === "paused" ? "⏸" : "▶"} ${formatearPalabraClave(k.texto, k.concordancia)}`);
    }
  }
  if (quitar.length > 0) {
    plan.pasos.push({
      via: "windsor", platform: "google", action: "remove_keywords",
      label: `Quitar ${quitar.length} palabra${quitar.length === 1 ? "" : "s"} clave`,
      params: { ad_group_id: e.id, criterion_ids: quitar }, campos: ["palabrasClave"],
    });
    for (const id of quitar) {
      const k = porId.get(id)!;
      partes.push(`− ${formatearPalabraClave(k.texto, k.concordancia)}`);
    }
  }
  if (partes.length === 0) return;

  plan.diff.push({
    campo: "palabrasClave",
    etiqueta: "Palabras clave",
    antes: existentes.length === 0 ? "Ninguna" : `${existentes.length}: ${existentes.slice(0, 6).map((k) => formatearPalabraClave(k.texto, k.concordancia)).join(", ")}${existentes.length > 6 ? "…" : ""}`,
    despues: partes.join(" · "),
  });

  const activasRestantes =
    existentes.filter((k) => !quitar.includes(k.criterionId) && !cambiosEstado.some((u) => u.criterion_id === k.criterionId && u.status === "paused") && k.estado !== "PAUSED").length +
    nuevas.length +
    cambiosEstado.filter((u) => u.status === "enabled").length;
  if (activasRestantes === 0) {
    problema("palabrasClave", "El grupo se quedaría sin palabras clave activas: sus anuncios no podrían entregar.", false);
  }
}

/* -------------------------------- Meta ------------------------------------ */

const ESTRATEGIAS_META = ["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP", "LOWEST_COST_WITH_MIN_ROAS"];
const CATEGORIAS_META = ["HOUSING", "EMPLOYMENT", "CREDIT", "ISSUES_ELECTIONS_POLITICS"];

function planMeta(
  plan: PlanEdicion,
  antes: AntesDeEdicion,
  c: CambiosEdicion,
  currency: string | null,
  problema: Reporte,
) {
  const unidad = unidadesMenoresMeta(currency);
  const aMenor = (monto: number) => Math.round(monto * unidad);

  if (antes.nivel === "campana") {
    const e = antes.entidad;
    if (cambia(c.nombre, e.nombre)) {
      if (!c.nombre!.trim()) problema("nombre", "El nombre no puede estar vacío.");
      else {
        plan.pasos.push({
          via: "windsor", platform: "meta", action: "update_campaign",
          label: "Renombrar la campaña",
          params: { campaign_id: e.id, name: c.nombre!.trim() }, campos: ["nombre"],
        });
        plan.diff.push({ campo: "nombre", etiqueta: "Nombre", antes: vacio(e.nombre), despues: c.nombre!.trim() });
      }
    }
    if (c.presupuesto) {
      const { tipo, monto } = c.presupuesto;
      const actual = tipo === "daily" ? e.presupuesto.diario : e.presupuesto.total;
      if (!(monto > 0)) problema("presupuesto", "El presupuesto debe ser mayor a cero.");
      else if (!e.presupuesto.enLaCampana) {
        problema("presupuesto", "Esta campaña no tiene presupuesto propio: cada conjunto tiene el suyo. Edítalo en el conjunto.");
      } else if (monto !== actual) {
        plan.pasos.push({
          via: "windsor", platform: "meta", action: "set_campaign_budget",
          label: `Cambiar el presupuesto ${tipo === "daily" ? "diario" : "total"}`,
          params: { campaign_id: e.id, budget_type: tipo, amount: aMenor(monto) }, campos: ["presupuesto"],
          sinPausa: actual !== null && monto < actual,
        });
        plan.diff.push({
          campo: "presupuesto", etiqueta: `Presupuesto ${tipo === "daily" ? "diario" : "total"}`,
          antes: moneda(actual, currency), despues: moneda(monto, currency),
        });
        if (tipo === "daily" && e.presupuesto.total !== null) {
          problema("presupuesto", "Meta reemplaza el presupuesto total por el diario: solo uno aplica a la vez.", false);
        }
      }
    }
    if (c.limiteGasto !== undefined && c.limiteGasto !== e.limiteGasto) {
      if (!(c.limiteGasto > 0)) {
        problema("limiteGasto", "El límite de gasto debe ser mayor a cero. Para quitarlo, hazlo en Meta.");
      } else {
        plan.pasos.push({
          via: "windsor", platform: "meta", action: "update_campaign",
          label: "Cambiar el límite de gasto de la campaña",
          params: { campaign_id: e.id, spend_cap: aMenor(c.limiteGasto) }, campos: ["limiteGasto"],
        });
        plan.diff.push({
          campo: "limiteGasto", etiqueta: "Límite de gasto",
          antes: e.limiteGasto === null ? "Sin límite" : moneda(e.limiteGasto, currency),
          despues: moneda(c.limiteGasto, currency),
        });
      }
    }
    if (c.estrategiaPuja !== undefined && c.estrategiaPuja !== (e.puja.estrategia ?? "")) {
      if (!ESTRATEGIAS_META.includes(c.estrategiaPuja)) problema("estrategiaPuja", "Estrategia de puja no reconocida.");
      else if (!e.presupuesto.enLaCampana) {
        problema("estrategiaPuja", "Esta campaña no tiene presupuesto propio: la estrategia de puja se elige en cada conjunto.");
      } else if (/BID_CAP|COST_CAP|MIN_ROAS/.test(c.estrategiaPuja)) {
        problema("estrategiaPuja", "Una estrategia con tope necesita un monto de puja, que se fija en el conjunto: elígela allí.");
      } else {
        plan.pasos.push({
          via: "windsor", platform: "meta", action: "update_campaign",
          label: "Cambiar la estrategia de puja de la campaña",
          params: { campaign_id: e.id, bid_strategy: c.estrategiaPuja }, campos: ["estrategiaPuja"],
        });
        plan.diff.push({ campo: "estrategiaPuja", etiqueta: "Estrategia de puja", antes: vacio(e.puja.estrategia), despues: c.estrategiaPuja });
      }
    }
    if (c.categoriaEspecial !== undefined && c.categoriaEspecial !== (e.categoriasEspeciales[0] ?? "")) {
      if (c.categoriaEspecial && !CATEGORIAS_META.includes(c.categoriaEspecial)) problema("categoriaEspecial", "Categoría especial no reconocida.");
      else {
        plan.pasos.push({
          via: "windsor", platform: "meta", action: "update_campaign",
          label: "Cambiar la categoría especial de anuncios",
          params: { campaign_id: e.id, special_ad_categories: c.categoriaEspecial ? [c.categoriaEspecial] : [] }, campos: ["categoriaEspecial"],
        });
        plan.diff.push({ campo: "categoriaEspecial", etiqueta: "Categoría especial", antes: e.categoriasEspeciales.join(", ") || "Ninguna", despues: c.categoriaEspecial || "Ninguna" });
      }
    }
    return;
  }

  if (antes.nivel === "conjunto") {
    const e = antes.entidad;
    const campos: Record<string, unknown> = {};
    const camposCubiertos: Array<keyof CambiosEdicion> = [];

    if (cambia(c.nombre, e.nombre)) {
      if (!c.nombre!.trim()) problema("nombre", "El nombre no puede estar vacío.");
      else {
        campos.name = c.nombre!.trim();
        camposCubiertos.push("nombre");
        plan.diff.push({ campo: "nombre", etiqueta: "Nombre", antes: vacio(e.nombre), despues: c.nombre!.trim() });
      }
    }
    if (c.puja !== undefined && c.puja !== e.puja.monto) {
      if (!(c.puja > 0)) problema("puja", "La puja debe ser mayor a cero.");
      else {
        campos.bid_amount = aMenor(c.puja);
        camposCubiertos.push("puja");
        plan.diff.push({ campo: "puja", etiqueta: "Puja", antes: moneda(e.puja.monto, currency), despues: moneda(c.puja, currency) });
        const estrategia = e.puja.estrategia ?? "";
        if (!/BID_CAP|COST_CAP|MINIMUM_ROAS/.test(estrategia)) {
          problema("puja", "Este conjunto usa 'menor costo' sin tope: Meta ignora o rechaza un monto de puja. Cambia antes la estrategia.", false);
        }
      }
    }
    if (c.estrategiaPuja !== undefined && c.estrategiaPuja !== (e.puja.estrategia ?? "")) {
      if (!ESTRATEGIAS_META.includes(c.estrategiaPuja)) problema("estrategiaPuja", "Estrategia de puja no reconocida.");
      else if (e.presupuesto.enLaCampana) {
        problema("estrategiaPuja", "Este conjunto usa el presupuesto de la campaña: la estrategia de puja se cambia en la campaña.");
      } else if (/BID_CAP|COST_CAP|MIN_ROAS/.test(c.estrategiaPuja) && !(c.puja !== undefined && c.puja > 0)) {
        problema("estrategiaPuja", "Una estrategia con tope necesita el monto de la puja: escríbelo en «Puja» en este mismo cambio.");
      } else {
        campos.bid_strategy = c.estrategiaPuja;
        camposCubiertos.push("estrategiaPuja");
        plan.diff.push({ campo: "estrategiaPuja", etiqueta: "Estrategia de puja", antes: vacio(e.puja.estrategia), despues: c.estrategiaPuja });
      }
    }
    if (c.optimizacion !== undefined && c.optimizacion !== (e.optimizacion ?? "")) {
      if (!/^[A-Z_]{3,40}$/.test(c.optimizacion)) problema("optimizacion", "Meta de optimización no válida.");
      else {
        campos.optimization_goal = c.optimizacion;
        camposCubiertos.push("optimizacion");
        plan.diff.push({ campo: "optimizacion", etiqueta: "Optimización", antes: vacio(e.optimizacion), despues: c.optimizacion });
        problema("optimizacion", "Meta solo admite metas de optimización compatibles con el objetivo de la campaña; si no lo es, rechazará el cambio.", false);
      }
    }
    if (c.fin !== undefined && c.fin !== (e.fin ?? "")) {
      const fecha = new Date(c.fin);
      if (Number.isNaN(fecha.getTime())) problema("fin", "La fecha de término no es válida.");
      else if (fecha.getTime() < Date.now()) problema("fin", "La fecha de término ya pasó.");
      else if (fecha.getTime() > Date.now() + 364 * 86_400_000) problema("fin", "Meta acepta un término de menos de un año.");
      else {
        campos.end_time = c.fin;
        camposCubiertos.push("fin");
        plan.diff.push({ campo: "fin", etiqueta: "Termina", antes: vacio(e.fin), despues: c.fin });
      }
    }

    if (c.horario !== undefined) {
      const malos = problemasDeHorario(c.horario);
      if (malos.length > 0) {
        for (const m of malos) problema("horario", m);
      } else if (c.horario.length > 0 && (e.presupuesto.total === null || e.presupuesto.enLaCampana)) {
        problema("horario", "Meta solo permite horario de entrega cuando el conjunto tiene presupuesto TOTAL (no diario) y fecha de término. Cambia el presupuesto a total primero.");
      } else {
        campos.extra_params = {
          ...((campos.extra_params as Record<string, unknown> | undefined) ?? {}),
          ...(c.horario.length === 0
            ? { pacing_type: ["standard"], adset_schedule: [] } // Meta rechaza quitar solo el tipo de ritmo: hay que vaciar también las franjas (verificado en una cuenta real)
            : { pacing_type: ["day_parting"], adset_schedule: horarioParaMeta(c.horario) }),
        };
        camposCubiertos.push("horario");
        plan.diff.push({ campo: "horario", etiqueta: "Horario de entrega", antes: "—", despues: textoDeHorario(c.horario) });
      }
    }

    if (c.atribucion !== undefined) {
      const ventanas = {
        default: { etiqueta: "Predeterminada de Meta", spec: [{ event_type: "CLICK_THROUGH", window_days: 7 }, { event_type: "VIEW_THROUGH", window_days: 1 }] },
        click_1d: { etiqueta: "1 día tras el clic", spec: [{ event_type: "CLICK_THROUGH", window_days: 1 }] },
        click_7d: { etiqueta: "7 días tras el clic", spec: [{ event_type: "CLICK_THROUGH", window_days: 7 }] },
        click_1d_view_1d: { etiqueta: "1 día tras el clic o la vista", spec: [{ event_type: "CLICK_THROUGH", window_days: 1 }, { event_type: "VIEW_THROUGH", window_days: 1 }] },
      } as const;
      const v = ventanas[c.atribucion];
      if (!v) problema("atribucion", "Ventana de atribución no reconocida.");
      else {
        campos.extra_params = { ...((campos.extra_params as Record<string, unknown> | undefined) ?? {}), attribution_spec: v.spec };
        camposCubiertos.push("atribucion");
        plan.diff.push({ campo: "atribucion", etiqueta: "Ventana de atribución", antes: "—", despues: v.etiqueta });
        problema("atribucion", "Meta solo admite algunas ventanas según lo que optimiza el conjunto (con tráfico, solo 1 día tras el clic): si no es compatible, rechazará el cambio.", false);
      }
    }

    // Segmentación: `update_adset` REEMPLAZA `targeting` entero. Se parte de la
    // segmentación cruda actual y solo se tocan las claves pedidas: armarla
    // desde el resumen perdería en silencio todo lo que el resumen no modela
    // (audiencias, posiciones, Advantage+, exclusiones…).
    const pideSegmentacion =
      c.edadMin !== undefined || c.edadMax !== undefined || c.paises !== undefined ||
      c.generos !== undefined || c.plataformas !== undefined || c.formatos !== undefined || c.posiciones !== undefined ||
      c.interesesIds !== undefined || c.audienciasIncluir !== undefined || c.audienciasExcluir !== undefined;
    if (pideSegmentacion) {
      const base = e.segmentacionCruda;
      if (!base) {
        problema("segmentacion", "No se pudo leer la segmentación actual: no se edita a ciegas.");
      } else {
        const nuevo: Record<string, unknown> = JSON.parse(JSON.stringify(base));
        const min = c.edadMin ?? (base.age_min as number | undefined) ?? 18;
        const max = c.edadMax ?? (base.age_max as number | undefined) ?? 65;
        let tocada = false;
        if (c.edadMin !== undefined || c.edadMax !== undefined) {
          if (min < 13 || max > 65 || min > max) problema("edad", "La edad debe estar entre 13 y 65, con el mínimo no mayor al máximo.");
          else if (min !== base.age_min || max !== base.age_max) {
            nuevo.age_min = min;
            nuevo.age_max = max;
            tocada = true;
            plan.diff.push({ campo: "edad", etiqueta: "Edad", antes: `${base.age_min ?? "—"}–${base.age_max ?? "—"}`, despues: `${min}–${max}` });
          }
        }
        if (c.paises !== undefined) {
          const geo = { ...((nuevo.geo_locations as Record<string, unknown>) ?? {}) };
          const actuales = (geo.countries as string[] | undefined) ?? [];
          const pedidos = c.paises.map((p) => p.trim().toUpperCase()).filter(Boolean);
          if (pedidos.length === 0) problema("paises", "Elige al menos un país.");
          else if (pedidos.some((p) => !/^[A-Z]{2}$/.test(p))) problema("paises", "Los países van con código de 2 letras (CL, PE…).");
          else if (pedidos.join(",") !== actuales.join(",")) {
            if (geo.regions || geo.cities || geo.custom_locations) {
              problema("paises", "Este conjunto ya segmenta por regiones, ciudades o radio: cambiar los países pisaría esa segmentación. Edítala en Meta.");
            } else {
              geo.countries = pedidos;
              nuevo.geo_locations = geo;
              tocada = true;
              plan.diff.push({ campo: "paises", etiqueta: "Países", antes: actuales.join(", ") || "—", despues: pedidos.join(", ") });
            }
          }
        }
        if (c.generos !== undefined) {
          const actuales = (base.genders as number[] | undefined) ?? [];
          const actual = actuales.length === 1 ? (actuales[0] === 1 ? "hombres" : "mujeres") : "todos";
          if (c.generos !== actual) {
            if (c.generos === "todos") delete nuevo.genders;
            else nuevo.genders = c.generos === "hombres" ? [1] : [2];
            tocada = true;
            plan.diff.push({ campo: "generos", etiqueta: "Género", antes: actual, despues: c.generos });
          }
        }
        if (c.plataformas !== undefined) {
          const validas = ["facebook", "instagram", "audience_network", "messenger"];
          const pedidas = [...new Set(c.plataformas)];
          const actuales = (base.publisher_platforms as string[] | undefined) ?? [];
          if (pedidas.some((p) => !validas.includes(p as string))) {
            problema("plataformas", "Plataforma no reconocida.");
          } else if (pedidas.slice().sort().join(",") !== actuales.slice().sort().join(",")) {
            if (pedidas.length === 0) {
              // Automáticas: sin redes ni posiciones (unas posiciones sueltas, sin
              // red que las acompañe, las rechaza Meta).
              delete nuevo.publisher_platforms;
              for (const k of Object.keys(nuevo)) if (k.endsWith("_positions")) delete nuevo[k];
            } else {
              nuevo.publisher_platforms = pedidas;
              // Las posiciones de una red que se quita ya no aplican.
              for (const k of Object.keys(nuevo)) {
                if (k.endsWith("_positions") && !(pedidas as string[]).includes(k.replace(/_positions$/, ""))) delete nuevo[k];
              }
            }
            tocada = true;
            plan.diff.push({
              campo: "plataformas", etiqueta: "Redes",
              antes: actuales.join(", ") || "Automáticas", despues: pedidas.join(", ") || "Automáticas",
            });
          }
        }
        if (c.formatos !== undefined) {
          const redes = ((nuevo.publisher_platforms as string[] | undefined) ?? []).filter((r): r is "facebook" | "instagram" => r === "facebook" || r === "instagram");
          const quedan = FORMATOS_META.filter((f) => c.formatos?.includes(f));
          if (c.formatos.some((f) => !FORMATOS_META.includes(f))) {
            problema("formatos", "Formato no reconocido: usa feed, historias o reels.");
          } else if (redes.length === 0) {
            problema("formatos", "Elige primero las redes (Facebook o Instagram): con redes automáticas Meta no admite formatos sueltos.");
          } else {
            const actuales = formatosDeSegmentacion(base);
            if (quedan.join(",") !== actuales.join(",")) {
              for (const red of redes) {
                if (quedan.length === 0) delete nuevo[`${red}_positions`];
                else nuevo[`${red}_positions`] = quedan.map((f) => META_SURFACES[f][red]);
              }
              tocada = true;
              const nombres = (l: FormatoMeta[]) => l.map((f) => META_SURFACES[f].label).join(", ");
              plan.diff.push({ campo: "formatos", etiqueta: "Formatos", antes: nombres(actuales) || "Automáticos", despues: nombres(quedan) || "Automáticos" });
            }
          }
        }
        if (c.posiciones !== undefined) {
          for (const [red, crudas] of Object.entries(c.posiciones) as Array<[RedConPosiciones, string[] | undefined]>) {
            if (!crudas) continue;
            if (!REDES_CON_POSICIONES.includes(red)) {
              problema("posiciones", `Red no reconocida: ${red}.`);
              continue;
            }
            const pedidas = [...new Set(crudas)];
            const malas = posicionesInvalidas(red, pedidas);
            if (malas.length > 0) {
              problema("posiciones", `Ubicación no válida en ${red}: ${malas.join(", ")}.`);
              continue;
            }
            const redes = (nuevo.publisher_platforms as string[] | undefined) ?? [];
            if (pedidas.length > 0 && !redes.includes(red)) {
              problema("posiciones", `Elige primero la red ${red}: con redes automáticas o sin ella, Meta no admite ubicaciones sueltas.`);
              continue;
            }
            const clave = `${red}_positions`;
            const actuales = Array.isArray(nuevo[clave]) ? (nuevo[clave] as string[]) : [];
            if (pedidas.slice().sort().join(",") === actuales.slice().sort().join(",")) continue;
            if (pedidas.length === 0) delete nuevo[clave];
            else nuevo[clave] = pedidas;
            tocada = true;
            const nombres = (l: string[]) => l.map((v) => POSICIONES_META[red].find((p) => p.valor === v)?.label ?? v).join(", ");
            plan.diff.push({ campo: `posiciones_${red}`, etiqueta: `Ubicaciones de ${red}`, antes: nombres(actuales) || "Automáticas", despues: nombres(pedidas) || "Automáticas" });
          }
        }
        const idsDe = (lista: unknown): string[] => (Array.isArray(lista) ? lista : []).map((x) => String((x as { id?: unknown }).id ?? "")).filter(Boolean);
        const nombreDe = (lista: unknown, id: string): string => {
          const f = (Array.isArray(lista) ? lista : []).find((x) => String((x as { id?: unknown }).id) === id) as { name?: string } | undefined;
          return f?.name ?? id;
        };
        if (c.interesesIds !== undefined) {
          if (c.interesesIds.some((i) => !/^\d{5,}$/.test(i))) problema("intereses", "Hay un interés con un id no válido.");
          else {
            const grupos = (Array.isArray(nuevo.flexible_spec) ? (nuevo.flexible_spec as Array<Record<string, unknown>>) : []).map((g) => ({ ...g }));
            const actuales = idsDe(grupos[0]?.interests);
            const quedan = [...new Set(c.interesesIds)];
            if (quedan.slice().sort().join(",") !== actuales.slice().sort().join(",")) {
              if (grupos.length > 1) problema("intereses", "Este conjunto tiene varios grupos de segmentación detallada (combinados con Y): editarlos aquí los pisaría. Edítalos en Meta.");
              else {
                if (quedan.length > 0) grupos[0] = { ...(grupos[0] ?? {}), interests: quedan.map((id) => ({ id })) };
                else if (grupos[0]) delete grupos[0].interests;
                const sinVacios = grupos.filter((g) => Object.keys(g).length > 0);
                if (sinVacios.length > 0) nuevo.flexible_spec = sinVacios;
                else delete nuevo.flexible_spec;
                tocada = true;
                const viejos = (grupos[0] ? (base.flexible_spec as Array<Record<string, unknown>> | undefined)?.[0]?.interests : undefined);
                plan.diff.push({
                  campo: "intereses", etiqueta: "Intereses",
                  antes: actuales.map((id) => nombreDe(viejos, id)).join(", ") || "Ninguno",
                  despues: quedan.join(", ") || "Ninguno",
                });
              }
            }
          }
        }
        for (const [clave, lista, etiqueta, campo] of [
          ["custom_audiences", c.audienciasIncluir, "Audiencias incluidas", "audienciasIncluir"],
          ["excluded_custom_audiences", c.audienciasExcluir, "Audiencias excluidas", "audienciasExcluir"],
        ] as const) {
          if (lista === undefined) continue;
          if (lista.some((i) => !/^\d{5,}$/.test(i))) { problema(campo, "Hay una audiencia con un id no válido."); continue; }
          const actuales = idsDe(base[clave]);
          const quedan = [...new Set(lista)];
          if (quedan.slice().sort().join(",") === actuales.slice().sort().join(",")) continue;
          if (quedan.length > 0) nuevo[clave] = quedan.map((id) => ({ id }));
          else delete nuevo[clave];
          tocada = true;
          plan.diff.push({ campo, etiqueta, antes: actuales.map((id) => nombreDe(base[clave], id)).join(", ") || "Ninguna", despues: quedan.join(", ") || "Ninguna" });
        }
        if (tocada) {
          campos.targeting = nuevo;
          camposCubiertos.push(
            ...(["edadMin", "edadMax", "paises", "generos", "plataformas", "formatos", "posiciones", "interesesIds", "audienciasIncluir", "audienciasExcluir"] as const).filter((k) => c[k] !== undefined),
          );
        }
      }
    }

    if (Object.keys(campos).length > 0) {
      plan.pasos.push({
        via: "windsor", platform: "meta", action: "update_adset",
        label: "Actualizar el conjunto de anuncios",
        params: { adset_id: e.id, ...campos }, campos: camposCubiertos,
      });
    }

    if (c.presupuesto) {
      const { tipo, monto } = c.presupuesto;
      const actual = tipo === "daily" ? e.presupuesto.diario : e.presupuesto.total;
      if (!(monto > 0)) problema("presupuesto", "El presupuesto debe ser mayor a cero.");
      else if (e.presupuesto.enLaCampana) {
        problema("presupuesto", "El presupuesto de este conjunto lo reparte la campaña: edítalo en la campaña.");
      } else if (monto !== actual) {
        plan.pasos.push({
          via: "windsor", platform: "meta", action: "set_adset_budget",
          label: `Cambiar el presupuesto ${tipo === "daily" ? "diario" : "total"}`,
          params: { adset_id: e.id, budget_type: tipo, amount: aMenor(monto) }, campos: ["presupuesto"],
          sinPausa: actual !== null && monto < actual,
        });
        plan.diff.push({
          campo: "presupuesto", etiqueta: `Presupuesto ${tipo === "daily" ? "diario" : "total"}`,
          antes: moneda(actual, currency), despues: moneda(monto, currency),
        });
      }
    }
    return;
  }

  // Anuncio de Meta.
  const e = antes.entidad;
  const cont = e.contenido;
  if (cambia(c.nombre, e.nombre)) {
    if (!c.nombre!.trim()) problema("nombre", "El nombre no puede estar vacío.");
    else {
      plan.pasos.push({
        via: "windsor", platform: "meta", action: "update_ad",
        label: "Renombrar el anuncio",
        params: { ad_id: e.id, name: c.nombre!.trim() }, campos: ["nombre"],
      });
      plan.diff.push({ campo: "nombre", etiqueta: "Nombre", antes: vacio(e.nombre), despues: c.nombre!.trim() });
    }
  }

  // Dominio de conversión: `update_ad` (no toca el contenido, así que vale también para anuncios de una publicación).
  if (c.dominioConversion !== undefined && c.dominioConversion.trim() !== "") {
    const dominio = c.dominioConversion.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(dominio)) {
      problema("dominioConversion", "El dominio no es válido: escríbelo así, sin https://: ejemplo.com");
    } else {
      plan.pasos.push({
        via: "windsor", platform: "meta", action: "update_ad",
        label: "Cambiar el dominio de conversión",
        params: { ad_id: e.id, conversion_domain: dominio }, campos: ["dominioConversion"],
      });
      plan.diff.push({ campo: "dominioConversion", etiqueta: "Dominio de conversión", antes: "—", despues: dominio });
    }
  }
  // Mensaje de bienvenida de un anuncio de mensajes: Windsor crea un creativo nuevo con el saludo cambiado.
  if (c.mensajeBienvenida !== undefined && c.mensajeBienvenida.trim() !== "") {
    const mensaje = c.mensajeBienvenida.trim();
    if (mensaje.length > 1000) problema("mensajeBienvenida", "El mensaje de bienvenida admite hasta 1.000 caracteres.");
    else {
      plan.pasos.push({
        via: "windsor", platform: "meta", action: "set_page_welcome_message",
        label: "Cambiar el mensaje de bienvenida",
        params: { ad_id: e.id, welcome_message: mensaje }, campos: ["mensajeBienvenida"],
      });
      plan.diff.push({ campo: "mensajeBienvenida", etiqueta: "Mensaje de bienvenida", antes: "—", despues: mensaje });
      problema("mensajeBienvenida", "Solo aplica a anuncios de mensajes (Messenger o Instagram Direct); en otro tipo de anuncio Meta lo rechaza.", false);
    }
  }

  const creativo: Record<string, unknown> = {};
  const cubiertos: Array<keyof CambiosEdicion> = [];
  const texto = (
    clave: keyof CambiosEdicion, param: string, etiqueta: string,
    pedido: string | undefined, actual: string | null,
  ) => {
    if (!cambia(pedido, actual)) return;
    creativo[param] = pedido.trim();
    cubiertos.push(clave);
    plan.diff.push({ campo: clave, etiqueta, antes: vacio(actual), despues: vacio(pedido.trim()) });
  };
  texto("textoPrincipal", "message", "Texto principal", c.textoPrincipal, cont.textoPrincipal);
  texto("titulo", "headline", "Título", c.titulo, cont.titulo);
  if (c.descripcion !== undefined && c.descripcion.trim()) {
    creativo.description = c.descripcion.trim();
    cubiertos.push("descripcion");
    plan.diff.push({ campo: "descripcion", etiqueta: "Descripción", antes: "—", despues: c.descripcion.trim() });
  }
  if (cambia(c.urlDestino, cont.urlDestino)) {
    if (!urlValida(c.urlDestino!)) problema("urlDestino", "La URL de destino no es válida: debe empezar con https://");
    else texto("urlDestino", "link", "URL de destino", c.urlDestino, cont.urlDestino);
  }
  if (cambia(c.imagenUrl, cont.imagenUrl)) {
    if (!urlValida(c.imagenUrl!)) problema("imagenUrl", "La URL de la imagen no es válida: debe empezar con https://");
    else texto("imagenUrl", "image_url", "Imagen", c.imagenUrl, cont.imagenUrl);
  }
  if (cambia(c.urlTags, cont.urlTags)) texto("urlTags", "url_tags", "Parámetros de URL", c.urlTags, cont.urlTags);
  if (c.cta !== undefined && c.cta !== (cont.cta ?? "")) {
    if (!esCta(c.cta)) problema("cta", "Ese botón no lo acepta Meta al editar un anuncio.");
    else {
      creativo.call_to_action_type = c.cta;
      cubiertos.push("cta");
      plan.diff.push({ campo: "cta", etiqueta: "Botón", antes: vacio(cont.cta), despues: c.cta });
    }
  }

  if (Object.keys(creativo).length > 0) {
    if (!e.edicionDeContenido.editable) {
      // Windsor lo documenta: en un anuncio armado desde una publicación existente se pueden cambiar los parámetros
      // de URL (`url_tags`) aunque no el contenido. Lo demás se bloquea con el motivo.
      const bloqueados = new Set<string>(cubiertos.filter((k) => k !== "urlTags"));
      if (bloqueados.size > 0) {
        problema("contenido", e.edicionDeContenido.motivo ?? "El contenido de este anuncio no se puede editar.");
        // Lo que no se puede escribir no debe aparecer como un cambio pendiente.
        plan.diff = plan.diff.filter((d) => !bloqueados.has(d.campo));
        for (const clave of Object.keys(creativo)) if (clave !== "url_tags") delete creativo[clave];
      }
      if (!("url_tags" in creativo)) return;
      cubiertos.splice(0, cubiertos.length, "urlTags");
    }
    plan.pasos.push({
      via: "windsor", platform: "meta", action: "update_ad_creative",
      label: "Actualizar el contenido del anuncio",
      params: { ad_id: e.id, ...creativo }, campos: cubiertos,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Verificación posterior                                                     */
/* -------------------------------------------------------------------------- */

export type Verificacion = {
  campo: string;
  etiqueta: string;
  /** `true` coincide, `false` la plataforma tiene otra cosa, `null` no se puede comprobar. */
  coincide: boolean | null;
  esperado: string;
  actual: string;
};

/**
 * Compara lo que se pidió con lo que la plataforma dice tener DESPUÉS de
 * escribir. Existe porque Windsor ya confirmó como creada una campaña que
 * nunca existió: su "ok" no basta. `null` no es un fallo: Windsor tarda unos
 * segundos en reflejar un cambio de Meta, y una lectura anterior no lo prueba.
 */
export function verificarCambios(
  plan: PlanEdicion,
  despues: AntesDeEdicion | null,
): Verificacion[] {
  if (!despues) {
    return plan.diff.map((d) => ({
      campo: d.campo, etiqueta: d.etiqueta, coincide: null, esperado: d.despues, actual: "No se pudo releer",
    }));
  }
  const leer = (campo: string): string | null => {
    const e = despues.entidad;
    if (campo === "nombre") return "nombre" in e ? (e.nombre ?? "") : null;
    if (despues.nivel === "anuncio") {
      const c = despues.entidad.contenido;
      switch (campo) {
        case "textoPrincipal": return c.textoPrincipal ?? "";
        case "titulo": return c.titulo ?? "";
        case "urlDestino": return c.urlDestino ?? "";
        case "cta": return c.cta ?? "";
        case "imagenUrl": return c.imagenUrl ?? "";
        case "urlTags": return c.urlTags ?? "";
        case "titulares": return c.titulares.map((t) => t.texto).join(" | ");
        case "descripciones": return c.descripciones.map((t) => t.texto).join(" | ");
        case "urlsFinales": return c.urlsFinales.join(", ");
        case "path1": return c.path1 ?? "";
        case "path2": return c.path2 ?? "";
        case "sufijoUrl": return c.sufijoUrl ?? "";
      }
    }
    return null;
  };
  return plan.diff.map((d) => {
    const actual = leer(d.campo);
    // Lo que Windsor no devuelve tras escribir (presupuesto, segmentación…)
    // no se puede comprobar desde acá: se dice, no se da por bueno.
    if (actual === null) {
      return { campo: d.campo, etiqueta: d.etiqueta, coincide: null, esperado: d.despues, actual: "No verificable desde WiWO.ADS" };
    }
    const igual = d.despues === "—" ? actual === "" : actual.trim() === d.despues.trim();
    return { campo: d.campo, etiqueta: d.etiqueta, coincide: igual, esperado: d.despues, actual: actual || "—" };
  });
}

/* ------------------------------- LinkedIn --------------------------------- */

/**
 * LinkedIn por Windsor (acciones verificadas con `list_actions`, 2026-10-02). Los nombres de la interfaz
 * mandan: «campaña» = grupo de campañas (`campaign_group_*`) y «conjunto» = `campaign`.
 *
 * - Campaña (grupo): solo presupuesto TOTAL, y exige que el grupo tenga fecha de término. Windsor no
 *   ofrece renombrar un grupo.
 * - Conjunto (campaign): nombre, presupuesto diario o total (el total exige fecha de término) y fecha de
 *   término. Windsor la entrega y la recibe en el mismo formato; LinkedIn detiene la campaña al empezar
 *   ese día.
 * - Anuncio: nada se edita (se pausa o activa desde la tabla).
 */
function planLinkedin(
  plan: PlanEdicion,
  antes: AntesDeEdicion,
  c: CambiosEdicion,
  currency: string | null,
  problema: Reporte,
  nativo = false,
): void {
  /**
   * Con la API directa de LinkedIn (`nativo`) un cambio se envía como un solo `PARTIAL_UPDATE` y se lee de vuelta; sin ella,
   * se usan las acciones de Windsor, que no pueden renombrar un grupo. El nivel de la interfaz se traduce al de la API:
   * campaña (UI) = grupo de campañas; conjunto (UI) = campaña de LinkedIn.
   */
  const pasoNativo = (
    nivelUi: "campana" | "conjunto",
    id: string,
    cambios: Record<string, unknown>,
    label: string,
    campos: Array<keyof CambiosEdicion>,
    sinPausa?: boolean,
  ): PasoEdicion => ({
    via: "nativa", platform: "linkedin", action: "linkedin:actualizar", label,
    params: { nivel: nivelUi === "campana" ? "grupo" : "campana", id, cambios }, campos, sinPausa,
  });
  if (antes.nivel === "anuncio") {
    problema("contenido", "LinkedIn no permite editar el contenido de un anuncio desde WiWO.ADS. Aquí solo se pausa o se activa.");
    return;
  }

  if (antes.nivel === "campana") {
    const e = antes.entidad;
    if (c.nombre !== undefined && c.nombre.trim() !== (e.nombre ?? "").trim()) {
      if (!nativo) problema("nombre", "LinkedIn no permite renombrar un grupo de campañas desde Windsor: se hace en LinkedIn.");
      else if (!c.nombre.trim()) problema("nombre", "El nombre no puede estar vacío.");
      else {
        plan.pasos.push(pasoNativo("campana", e.id, { nombre: c.nombre.trim() }, "Renombrar el grupo de campañas de LinkedIn", ["nombre"]));
        plan.diff.push({ campo: "nombre", etiqueta: "Nombre", antes: vacio(e.nombre), despues: c.nombre.trim() });
      }
    }
    if (c.presupuesto) {
      const { tipo, monto } = c.presupuesto;
      if (!(monto > 0)) problema("presupuesto", "El presupuesto debe ser mayor a cero.");
      else if (tipo !== "lifetime") problema("presupuesto", "Un grupo de campañas de LinkedIn solo admite presupuesto total.");
      else if (!e.fin) problema("presupuesto", "LinkedIn exige que el grupo tenga fecha de término para aplicar un presupuesto total.");
      else if (nativo && !currency) problema("presupuesto", "No se conoce la moneda de la cuenta: no se puede cambiar el presupuesto.");
      else if (monto !== e.presupuesto.total) {
        const baja = e.presupuesto.total !== null && monto < e.presupuesto.total;
        plan.pasos.push(
          nativo
            ? pasoNativo("campana", e.id, { presupuestoTotal: { monto, moneda: currency } }, "Cambiar el presupuesto total del grupo", ["presupuesto"], baja)
            : {
                via: "windsor", platform: "linkedin", action: "set_campaign_group_budget",
                label: "Cambiar el presupuesto total del grupo",
                params: { campaign_group_id: e.id, amount: monto }, campos: ["presupuesto"],
                sinPausa: baja,
              },
        );
        plan.diff.push({
          campo: "presupuesto", etiqueta: "Presupuesto total del grupo",
          antes: moneda(e.presupuesto.total, currency), despues: moneda(monto, currency),
        });
      }
    }
    return;
  }

  // Conjunto de LinkedIn («campaign» de la API).
  const e = antes.entidad;
  if (cambia(c.nombre, e.nombre)) {
    if (!c.nombre!.trim()) problema("nombre", "El nombre no puede estar vacío.");
    else {
      plan.pasos.push(
        nativo
          ? pasoNativo("conjunto", e.id, { nombre: c.nombre!.trim() }, "Renombrar la campaña de LinkedIn", ["nombre"])
          : {
              via: "windsor", platform: "linkedin", action: "rename_campaign",
              label: "Renombrar la campaña de LinkedIn",
              params: { campaign_id: e.id, name: c.nombre!.trim() }, campos: ["nombre"],
            },
      );
      plan.diff.push({ campo: "nombre", etiqueta: "Nombre", antes: vacio(e.nombre), despues: c.nombre!.trim() });
    }
  }

  let finEfectivo = e.fin;
  if (c.fin !== undefined && c.fin !== (e.fin ?? "")) {
    const hoy = new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fin) || Number.isNaN(new Date(`${c.fin}T00:00:00Z`).getTime())) {
      problema("fin", "La fecha de término no es válida (aaaa-mm-dd).");
    } else if (c.fin < hoy) {
      problema("fin", "La fecha de término ya pasó.");
    } else {
      finEfectivo = c.fin;
      plan.pasos.push({
        via: "windsor", platform: "linkedin", action: "set_campaign_schedule",
        label: "Cambiar la fecha de término",
        params: { campaign_id: e.id, end_date: c.fin }, campos: ["fin"],
      });
      plan.diff.push({ campo: "fin", etiqueta: "Termina", antes: vacio(e.fin), despues: c.fin });
    }
  }

  if (c.presupuesto) {
    const { tipo, monto } = c.presupuesto;
    const actual = tipo === "daily" ? e.presupuesto.diario : e.presupuesto.total;
    if (!(monto > 0)) problema("presupuesto", "El presupuesto debe ser mayor a cero.");
    else if (tipo === "lifetime" && !finEfectivo) {
      problema("presupuesto", "LinkedIn exige fecha de término para aplicar un presupuesto total.");
    } else if (nativo && !currency) {
      problema("presupuesto", "No se conoce la moneda de la cuenta: no se puede cambiar el presupuesto.");
    } else if (monto !== actual) {
      const etiquetaPresupuesto = `Cambiar el presupuesto ${tipo === "daily" ? "diario" : "total"}`;
      const baja = actual !== null && monto < actual;
      plan.pasos.push(
        nativo
          ? pasoNativo(
              "conjunto", e.id,
              tipo === "daily" ? { presupuestoDiario: { monto, moneda: currency } } : { presupuestoTotal: { monto, moneda: currency } },
              etiquetaPresupuesto, ["presupuesto"], baja,
            )
          : {
              via: "windsor", platform: "linkedin", action: "set_campaign_budget",
              label: etiquetaPresupuesto,
              params: { campaign_id: e.id, budget_type: tipo === "daily" ? "daily" : "total", amount: monto }, campos: ["presupuesto"],
              sinPausa: baja,
            },
      );
      plan.diff.push({
        campo: "presupuesto", etiqueta: `Presupuesto ${tipo === "daily" ? "diario" : "total"}`,
        antes: moneda(actual, currency), despues: moneda(monto, currency),
      });
    }
  }
}
