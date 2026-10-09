"use client";

import { EditorAnuncioGoogle } from "./editar-anuncio-google";
import { ContenidoDeGoogleSoloLectura } from "./contenido-google-solo-lectura";
import { useImperativeHandle, useMemo, useState, type ReactNode, type Ref } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type {
  DetalleAnuncio,
  DetalleCampana,
  DetalleConjunto,
} from "@/lib/detalle-entidad";
import type { CambiosEdicion, CambioVisible, Problema, Verificacion } from "@/lib/edicion-plan";
import { limitesDeGoogle, seccionesDeGoogle } from "@/lib/google-secciones-pura";
import { formatearPalabraClave } from "@/lib/palabras-clave";
import { aFechaDeMeta, partesDeFechaMeta } from "@/lib/fecha-meta-pura";
import { formatosDeSegmentacion, REDES_CON_POSICIONES, type FormatoMeta } from "@/lib/formatos-meta-pura";
import type { NivelEntidad } from "@/lib/plataformas";
import { OrbeDeBoton } from "./ui";
import { EditorMetaAnuncio, EditorMetaCampana, EditorMetaConjunto } from "./editor-meta";

type Simulacion = {
  plan: {
    pasos: Array<{ label: string; via: string; action: string }>;
    diff: CambioVisible[];
    problemas: Problema[];
    pausaAlAplicar: boolean;
    pausaPedida?: boolean;
    activacionPedida?: boolean;
  };
  validacionGoogle: { ok: boolean; mensaje: string | null } | null;
};

type Aplicado = {
  ok: boolean;
  aviso: string;
  verificacion?: Verificacion[];
  error?: string;
};

/** Lo que el editor de pantalla completa puede pedirle a este formulario. */
export type AccionesEditor = { simular: () => void };

type Props = {
  /** Ref al formulario (React 19: llega como prop). */
  ref?: Ref<AccionesEditor>;
  /** Valores que ya vienen cambiados (por ejemplo, desde una sugerencia). */
  valoresIniciales?: Record<string, string>;
  /** Directores y Administradores aplican un cambio de presupuesto sin aprobación; los demás lo envían a revisión. */
  puedeAprobarPresupuesto?: boolean;
  /** Meta, anuncio hecho desde una publicación: abre el Creador con una versión nueva (con otra imagen, si se da). */
  crearVersion?: (imagenUrl: string | null) => void;
  /** Avisa si hay algo cambiado sin aplicar, para preguntar antes de cerrar. */
  onSucio?: (sucio: boolean) => void;
  provider: string;
  accountId: string;
  nivel: NivelEntidad;
  id: string;
  currency: string | null;
  campana: DetalleCampana | null;
  conjunto: DetalleConjunto | null;
  anuncio: DetalleAnuncio | null;
  /** Aplicar cambios exige poder aprobarlos; simular no. */
  puedeAprobar: boolean;
  onAplicado: () => void;
};

/* Valores iniciales del formulario, sacados de lo que hoy está en la plataforma. */
function inicial(p: Props): Record<string, string> {
  const v: Record<string, string> = {};
  const e = p.nivel === "campana" ? p.campana : p.nivel === "conjunto" ? p.conjunto : p.anuncio;
  v.nombre = e?.nombre ?? "";
  if (p.nivel === "campana" && p.campana && p.provider === "linkedin") {
    // El grupo de campañas de LinkedIn solo admite presupuesto total.
    v.presupuestoTipo = "lifetime";
    v.presupuestoMonto = String(p.campana.presupuesto.total ?? "");
  } else if (p.nivel === "campana" && p.campana) {
    v.presupuestoTipo = p.campana.presupuesto.total !== null && p.campana.presupuesto.diario === null ? "lifetime" : "daily";
    v.presupuestoMonto = String(p.campana.presupuesto.diario ?? p.campana.presupuesto.total ?? "");
    v.limiteGasto = String(p.campana.limiteGasto ?? "");
    if (p.provider === "google") {
      v.inicio = p.campana.inicio ?? "";
      v.finCampana = p.campana.fin ?? "";
      v.redBusqueda = p.campana.redes?.busqueda ? "1" : "";
      v.redAsociadas = p.campana.redes?.asociadas ? "1" : "";
      v.redDisplay = p.campana.redes?.display ? "1" : "";
      v.rotacion = p.campana.rotacion ?? "";
      v.pujaTipo = ({ TARGET_SPEND: "clics", MAXIMIZE_CONVERSIONS: "conversiones", MAXIMIZE_CONVERSION_VALUE: "valor_conversion", MANUAL_CPC: "cpc_manual", TARGET_IMPRESSION_SHARE: "cuota_impresiones" } as Record<string, string>)[p.campana.puja.estrategia ?? ""] ?? "";
      v.pujaCpc = "";
      v.pujaCpa = String(p.campana.puja.objetivoCpa ?? "");
      v.pujaRoas = String(p.campana.puja.objetivoRoas ?? "");
      v.pujaMejorar = "";
      v.cuotaUbicacion = "TOP_OF_PAGE";
      v.cuotaPorcentaje = "50";
      v.presencia = p.campana.presencia === "PRESENCE" ? "presencia" : p.campana.presencia === "PRESENCE_OR_INTEREST" ? "presencia_o_interes" : "";
      v.plantillaSeguimiento = p.campana.urlSeguimiento ?? "";
      v.sitelinks = (p.campana.extensiones?.sitelinks ?? []).map((e) => [e.texto, e.url, e.descripcion1, e.descripcion2].join(" | ")).join("\n");
      v.destacados = (p.campana.extensiones?.destacados ?? []).join("\n");
      (p.campana.gruposDeRecursos ?? []).forEach((g, i) => {
        const de = (campo: string) => g.recursos.filter((r) => r.campo === campo && r.texto).map((r) => r.texto as string).join("\n");
        v[`gr${i}:titulares`] = de("HEADLINE");
        v[`gr${i}:largos`] = de("LONG_HEADLINE");
        v[`gr${i}:desc`] = de("DESCRIPTION");
        v[`gr${i}:url`] = g.urlsFinales[0] ?? "";
        v[`gr${i}:path1`] = g.path1 ?? "";
        v[`gr${i}:path2`] = g.path2 ?? "";
      });
    }
    v.estrategiaPuja = p.campana.puja.estrategia ?? "";
    v.categoriaEspecial = p.campana.categoriasEspeciales[0] ?? "";
  }
  if (p.nivel === "conjunto" && p.conjunto) {
    const c = p.conjunto;
    v.presupuestoTipo = c.presupuesto.total !== null && c.presupuesto.diario === null ? "lifetime" : "daily";
    v.presupuestoMonto = String(c.presupuesto.diario ?? c.presupuesto.total ?? "");
    v.puja = String(c.puja.monto ?? "");
    v.estrategiaPuja = c.puja.estrategia ?? "";
    v.optimizacion = c.optimizacion ?? "";
    v.kwAgregar = "";
    for (const k of c.palabrasClave ?? []) v[`kw:${k.criterionId}`] = "";
    v.edadMin = String(c.segmentacion?.edadMin ?? "");
    v.edadMax = String(c.segmentacion?.edadMax ?? "");
    v.paises = (c.segmentacion?.paises ?? []).join(", ");
    v.generos = c.segmentacion?.generos === null || c.segmentacion?.generos === undefined
      ? "todos"
      : c.segmentacion.generos.length === 1 ? (c.segmentacion.generos[0] === 1 ? "hombres" : "mujeres") : "todos";
    v.plataformas = (c.segmentacion?.plataformas ?? []).join(",");
    v.formatos = formatosDeSegmentacion(c.segmentacionCruda).join(",");
    for (const red of REDES_CON_POSICIONES) v[`pos:${red}`] = (c.segmentacion?.posiciones?.[red] ?? []).join(",");
    if (p.provider === "meta") {
      const cruda = (c.segmentacionCruda ?? {}) as Record<string, unknown>;
      const ids = (lista: unknown): string[] => (Array.isArray(lista) ? lista : []).map((x) => String((x as { id?: unknown }).id ?? "")).filter(Boolean);
      const grupos = Array.isArray(cruda.flexible_spec) ? (cruda.flexible_spec as Array<Record<string, unknown>>) : [];
      v.interesesIds = ids(grupos[0]?.interests).join(",");
      v.audIncluir = ids(cruda.custom_audiences).join(",");
      v.audExcluir = ids(cruda.excluded_custom_audiences).join(",");
      v.atribucion = "";
    }
    // LinkedIn muestra la fecha de término actual (aaaa-mm-dd); Meta, la hora de la cuenta, como Ads Manager.
    if (p.provider === "meta") {
      const f = partesDeFechaMeta(c.fin);
      v.fin = f?.local ?? "";
      v.finOffset = f?.offset ?? "";
    } else {
      v.fin = p.provider === "linkedin" ? (c.fin ?? "") : "";
    }
  }
  if (p.nivel === "anuncio" && p.anuncio) {
    const c = p.anuncio.contenido;
    if (p.provider === "meta") {
      v.textoPrincipal = c.textoPrincipal ?? "";
      v.titulo = c.titulo ?? "";
      v.descripcion = "";
      v.urlDestino = c.urlDestino ?? "";
      v.imagenUrl = "";
      v.cta = c.cta ?? "";
      v.urlTags = c.urlTags ?? "";
      v.dominioConversion = "";
      v.mensajeBienvenida = "";
    } else {
      v.titulares = c.titulares.map((t) => t.texto).join("\n");
      v.descripciones = c.descripciones.map((t) => t.texto).join("\n");
      v.urlFinal = c.urlDestino ?? "";
      v.path1 = c.path1 ?? "";
      v.path2 = c.path2 ?? "";
      v.sufijoUrl = c.sufijoUrl ?? "";
    }
  }
  return v;
}


/** Nombres de los intereses y audiencias que ya tiene el conjunto, para mostrarlos legibles. */
function nombresDeSegmentacion(cruda: Record<string, unknown> | null): Record<string, string> {
  const salida: Record<string, string> = {};
  if (!cruda) return salida;
  const recoger = (lista: unknown) => {
    for (const x of Array.isArray(lista) ? lista : []) {
      const o = x as { id?: unknown; name?: unknown };
      if (o.id && o.name) salida[String(o.id)] = String(o.name);
    }
  };
  const grupos = Array.isArray(cruda.flexible_spec) ? (cruda.flexible_spec as Array<Record<string, unknown>>) : [];
  recoger(grupos[0]?.interests);
  recoger(cruda.custom_audiences);
  recoger(cruda.excluded_custom_audiences);
  return salida;
}

const lineas = (texto: string) => texto.split("\n").map((l) => l.trim()).filter(Boolean);
const num = (texto: string): number | undefined => {
  const n = Number(texto.replace(",", "."));
  return texto.trim() !== "" && Number.isFinite(n) ? n : undefined;
};

/** Solo viaja lo que la persona cambió respecto de lo que ya tiene la plataforma. */
function armarCambios(p: Props, ahora: Record<string, string>, antes: Record<string, string>): CambiosEdicion {
  const cambio = (k: string) => (ahora[k] ?? "") !== (antes[k] ?? "");
  const c: CambiosEdicion = {};
  if (cambio("nombre")) c.nombre = ahora.nombre;
  if (ahora.estadoPedido === "pausar") c.pausar = true;
  if (ahora.estadoPedido === "activar") c.activar = true;
  if (ahora.estadoPedido === "eliminar") return { eliminar: true };

  if (cambio("presupuestoMonto") || cambio("presupuestoTipo")) {
    const monto = num(ahora.presupuestoMonto ?? "");
    if (monto !== undefined) c.presupuesto = { tipo: ahora.presupuestoTipo === "lifetime" ? "lifetime" : "daily", monto };
  }
  if (cambio("puja")) {
    const m = num(ahora.puja ?? "");
    if (m !== undefined) c.puja = m;
  }
  if (cambio("limiteGasto")) {
    const m = num(ahora.limiteGasto ?? "");
    if (m !== undefined) c.limiteGasto = m;
  }
  if (p.provider === "google" && p.nivel === "campana") {
    if (cambio("inicio") && ahora.inicio) c.inicio = ahora.inicio;
    if (cambio("finCampana")) c.fin = ahora.finCampana ?? "";
    if (cambio("redBusqueda") || cambio("redAsociadas") || cambio("redDisplay")) {
      c.redes = { busqueda: ahora.redBusqueda === "1", asociadas: ahora.redAsociadas === "1", display: ahora.redDisplay === "1" };
    }
    if (cambio("rotacion") && ahora.rotacion) c.rotacion = ahora.rotacion as CambiosEdicion["rotacion"];
    if (["pujaTipo", "pujaCpc", "pujaCpa", "pujaRoas", "pujaMejorar", "cuotaUbicacion", "cuotaPorcentaje"].some(cambio) && ahora.pujaTipo) {
      c.pujaGoogle = {
        tipo: ahora.pujaTipo as NonNullable<CambiosEdicion["pujaGoogle"]>["tipo"],
        cpcMaximo: num(ahora.pujaCpc ?? "") ?? null,
        cpaObjetivo: num(ahora.pujaCpa ?? "") ?? null,
        roasObjetivo: num(ahora.pujaRoas ?? "") ?? null,
        mejorarCpc: ahora.pujaMejorar === "1",
        cuotaUbicacion: (ahora.cuotaUbicacion || "TOP_OF_PAGE") as "TOP_OF_PAGE" | "ABSOLUTE_TOP_OF_PAGE" | "ANYWHERE_ON_PAGE",
        cuotaPorcentaje: num(ahora.cuotaPorcentaje ?? "") ?? 50,
      };
    }
    if (cambio("presencia") && ahora.presencia) c.presencia = ahora.presencia as CambiosEdicion["presencia"];
    if (cambio("plantillaSeguimiento")) c.plantillaSeguimiento = ahora.plantillaSeguimiento ?? "";
    // Enlaces de sitio y textos destacados: las listas completas que deben quedar.
    if (p.campana?.extensiones && (cambio("sitelinks") || cambio("destacados"))) {
      const filas = (t: string | undefined) => (t ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
      c.extensiones = {
        ...(cambio("sitelinks")
          ? {
              sitelinks: filas(ahora.sitelinks).map((linea) => {
                const [texto = "", url = "", descripcion1 = "", descripcion2 = ""] = linea.split("|").map((x) => x.trim());
                return { texto, url, descripcion1, descripcion2 };
              }),
            }
          : {}),
        ...(cambio("destacados") ? { destacados: filas(ahora.destacados) } : {}),
      };
    }
    // Performance Max: textos y URL del grupo de recursos (de a un grupo por cambio).
    const lineas = (t: string | undefined) => (t ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
    for (const [i, g] of (p.campana?.gruposDeRecursos ?? []).entries()) {
      const k = (n: string) => `gr${i}:${n}`;
      if (!["titulares", "largos", "desc", "url", "path1", "path2"].some((n) => cambio(k(n)))) continue;
      c.grupoDeRecursos = {
        id: g.id,
        ...(cambio(k("titulares")) ? { titulares: lineas(ahora[k("titulares")]) } : {}),
        ...(cambio(k("largos")) ? { titulosLargos: lineas(ahora[k("largos")]) } : {}),
        ...(cambio(k("desc")) ? { descripciones: lineas(ahora[k("desc")]) } : {}),
        ...(cambio(k("url")) ? { urlsFinales: lineas(ahora[k("url")]) } : {}),
        ...(cambio(k("path1")) ? { path1: ahora[k("path1")] ?? "" } : {}),
        ...(cambio(k("path2")) ? { path2: ahora[k("path2")] ?? "" } : {}),
      };
      break;
    }
  }
  if (cambio("estrategiaPuja") && ahora.estrategiaPuja) c.estrategiaPuja = ahora.estrategiaPuja;
  if (cambio("categoriaEspecial")) c.categoriaEspecial = ahora.categoriaEspecial ?? "";
  if (cambio("optimizacion") && ahora.optimizacion) c.optimizacion = ahora.optimizacion;
  if (cambio("generos")) c.generos = (ahora.generos ?? "todos") as CambiosEdicion["generos"];
  const csv = (t: string | undefined) => (t ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (p.provider === "meta" && p.nivel === "conjunto") {
    if (cambio("interesesIds")) c.interesesIds = csv(ahora.interesesIds);
    if (cambio("audIncluir")) c.audienciasIncluir = csv(ahora.audIncluir);
    if (cambio("audExcluir")) c.audienciasExcluir = csv(ahora.audExcluir);
    if (cambio("atribucion") && ahora.atribucion) c.atribucion = ahora.atribucion as CambiosEdicion["atribucion"];
  }
  if (cambio("horModo") || cambio("horDias") || cambio("horDesde") || cambio("horHasta")) {
    if (ahora.horModo === "todo") c.horario = [];
    else if (ahora.horModo === "tramo") {
      c.horario = [{ dias: (ahora.horDias ?? "").split(",").filter(Boolean).map(Number), desde: Number(ahora.horDesde ?? 9), hasta: Number(ahora.horHasta ?? 18) }];
    }
  }
  for (const red of REDES_CON_POSICIONES) {
    if (cambio(`pos:${red}`)) c.posiciones = { ...(c.posiciones ?? {}), [red]: (ahora[`pos:${red}`] ?? "").split(",").filter(Boolean) };
  }
  if (cambio("formatos")) c.formatos = (ahora.formatos ?? "").split(",").filter(Boolean) as FormatoMeta[];
  if (cambio("plataformas")) {
    c.plataformas = (ahora.plataformas ?? "").split(",").filter(Boolean) as CambiosEdicion["plataformas"];
  }
  if (cambio("edadMin")) c.edadMin = num(ahora.edadMin ?? "");
  if (cambio("edadMax")) c.edadMax = num(ahora.edadMax ?? "");
  if (cambio("paises")) c.paises = (ahora.paises ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (cambio("fin") && ahora.fin) c.fin = p.provider === "linkedin" ? ahora.fin : p.provider === "meta" ? aFechaDeMeta(ahora.fin, ahora.finOffset ?? "") : new Date(ahora.fin).toISOString();

  if (cambio("textoPrincipal")) c.textoPrincipal = ahora.textoPrincipal;
  if (cambio("titulo")) c.titulo = ahora.titulo;
  if (cambio("descripcion") && (ahora.descripcion ?? "").trim()) c.descripcion = ahora.descripcion;
  if (cambio("urlDestino")) c.urlDestino = ahora.urlDestino;
  if (cambio("imagenUrl") && (ahora.imagenUrl ?? "").trim()) c.imagenUrl = ahora.imagenUrl;
  if (cambio("cta") && ahora.cta) c.cta = ahora.cta;
  if (cambio("urlTags")) c.urlTags = ahora.urlTags;
  if (cambio("dominioConversion") && (ahora.dominioConversion ?? "").trim()) c.dominioConversion = ahora.dominioConversion;
  if (cambio("mensajeBienvenida") && (ahora.mensajeBienvenida ?? "").trim()) c.mensajeBienvenida = ahora.mensajeBienvenida;

  // Google: un texto que no cambió conserva la posición que tenía fijada.
  const fijadoDe = (originales: Array<{ texto: string; fijado: string | null }>, texto: string, i: number) =>
    originales[i]?.texto === texto ? originales[i].fijado : (originales.find((o) => o.texto === texto)?.fijado ?? null);
  // Google: palabras clave. Solo viaja lo que cambió (lo demás sigue igual).
  const acciones: Record<string, "quitar" | "pausar" | "activar"> = {};
  for (const clave of Object.keys(ahora)) {
    if (!clave.startsWith("kw:") || !ahora[clave]) continue;
    acciones[clave.slice(3)] = ahora[clave] as "quitar" | "pausar" | "activar";
  }
  const agregar = lineas(ahora.kwAgregar ?? "");
  if (agregar.length > 0 || Object.keys(acciones).length > 0) {
    c.palabrasClave = { agregar, acciones };
  }
  if (cambio("titulares")) {
    const orig = p.anuncio?.contenido.titulares ?? [];
    c.titulares = lineas(ahora.titulares ?? "").map((t, i) => ({ texto: t, fijado: fijadoDe(orig, t, i) }));
  }
  if (cambio("descripciones")) {
    const orig = p.anuncio?.contenido.descripciones ?? [];
    c.descripciones = lineas(ahora.descripciones ?? "").map((t, i) => ({ texto: t, fijado: fijadoDe(orig, t, i) }));
  }
  if (cambio("urlFinal")) c.urlsFinales = (ahora.urlFinal ?? "").trim() ? [ahora.urlFinal.trim()] : [];
  if (cambio("path1")) c.path1 = ahora.path1;
  if (cambio("path2")) c.path2 = ahora.path2;
  if (cambio("sufijoUrl")) c.sufijoUrl = ahora.sufijoUrl;
  return c;
}

async function llamar(p: Props, cambios: CambiosEdicion, modo: "simular" | "aplicar" | "solicitar") {
  const respuesta = await fetch("/api/entidades/editar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: p.provider,
      accountId: p.accountId,
      nivel: p.nivel,
      id: p.id,
      cambios,
      modo,
      confirmacion: modo === "aplicar" ? "EDITAR" : undefined,
    }),
  });
  const cuerpo = await respuesta.json().catch(() => ({}));
  return { ok: respuesta.ok, cuerpo };
}

export function EditarEntidad(props: Props) {
  const { provider, nivel, puedeAprobar, onAplicado, onSucio, ref } = props;
  const antes = useMemo(() => inicial(props), [props]);
  const [valores, setValores] = useState<Record<string, string>>(() => ({ ...antes, ...props.valoresIniciales }));
  const [simulacion, setSimulacion] = useState<Simulacion | null>(null);
  const [aplicado, setAplicado] = useState<Aplicado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<"simular" | "aplicar" | "solicitar" | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);

  const cambios = useMemo(() => armarCambios(props, valores, antes), [props, valores, antes]);
  const hayCambios = Object.keys(cambios).length > 0;

  const poner = (clave: string) => (valor: string) => {
    const siguiente = { ...valores, [clave]: valor };
    setValores(siguiente);
    onSucio?.(Object.keys(armarCambios(props, siguiente, antes)).length > 0);
    // Cualquier cambio invalida lo simulado: lo que se aprueba es lo que se ve.
    setSimulacion(null);
    setAplicado(null);
    setError(null);
  };

  async function simular() {
    setTrabajando("simular");
    setError(null);
    setAplicado(null);
    try {
      const { ok, cuerpo } = await llamar(props, cambios, "simular");
      if (!ok) throw new Error(cuerpo?.error ?? "No se pudo simular el cambio");
      setSimulacion(cuerpo as Simulacion);
    } catch (e) {
      setSimulacion(null);
      setError(e instanceof Error ? e.message : "No se pudo simular el cambio");
    } finally {
      setTrabajando(null);
    }
  }

  async function aplicar() {
    setTrabajando("aplicar");
    setError(null);
    try {
      const { ok, cuerpo } = await llamar(props, cambios, "aplicar");
      if (!ok && !cuerpo?.pasos) throw new Error(cuerpo?.error ?? "No se pudo aplicar el cambio");
      setAplicado(cuerpo as Aplicado);
      setSimulacion(null);
      if (cuerpo?.ok) {
        toast.success(cuerpo.aviso ?? "Cambio aplicado");
        onAplicado();
      } else {
        toast.error(cuerpo?.aviso ?? "El cambio no se pudo aplicar por completo");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar el cambio");
    } finally {
      setTrabajando(null);
    }
  }

  async function solicitar() {
    setTrabajando("solicitar");
    setError(null);
    try {
      const { ok, cuerpo } = await llamar(props, cambios, "solicitar");
      if (!ok) throw new Error(cuerpo?.error ?? "No se pudo enviar el cambio a revisión");
      setEnviado(cuerpo?.solicitud?.mensaje ?? "Tu cambio quedó pendiente de aprobación. Nada se modificó todavía.");
      setSimulacion(null);
      toast.success("Cambio enviado a revisión");
      onSucio?.(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el cambio a revisión");
    } finally {
      setTrabajando(null);
    }
  }

  useImperativeHandle(ref, () => ({ simular: () => void simular() }));

  // Meta no deja cambiar el contenido de un anuncio que usa una publicación existente (nombre y UTM sí).
  const contenidoBloqueado =
    provider === "meta" && nivel === "anuncio" && props.anuncio?.edicionDeContenido.editable === false;
  // Google: cada tipo de campaña tiene sus propios campos (como en Google Ads): las redes solo se editan en Búsqueda, las extensiones
  // de campaña también, y una estrategia que aquí no se edita (por ejemplo, CPV objetivo en Video) se muestra, sin inventar un valor.
  // La campaña (el tipo) está disponible en los tres niveles: el grupo y el anuncio también cambian según el tipo de su campaña.
  const tipoGoogle = provider === "google" ? (props.campana?.objetivo ?? "") : "";
  const seccionesG = seccionesDeGoogle(tipoGoogle, nivel);
  const esBusqueda = seccionesG.has("redes");
  const conRotacion = seccionesG.has("rotacion");
  const limiteG = provider === "google" ? limitesDeGoogle(tipoGoogle, nivel) : null;
  // Un anuncio responsivo de búsqueda se edita; los demás tipos se muestran tal cual (lo dice su propio tipo, que manda sobre el de la campaña).
  const esRsa = nivel === "anuncio" && provider === "google" && (props.anuncio?.tipo ? props.anuncio.tipo === "RESPONSIVE_SEARCH_AD" : seccionesG.has("contenidoRsa"));
  const estrategiaGoogle = props.campana?.puja.estrategia ?? null;
  const estrategiaSoloLectura = Boolean(estrategiaGoogle) && !valores.pujaTipo;
  const presupuestoTotalGoogle = provider === "google" && nivel === "campana" && props.campana?.presupuesto.total != null ? props.campana.presupuesto.total : null;
  // Hoy (en la zona del navegador): ninguna fecha de inicio o término nueva puede ser anterior.
  const [hoyIso] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
  const bloqueantes = simulacion?.plan.problemas.filter((p) => p.bloqueante) ?? [];
  const puedeAplicar0 =
    simulacion !== null &&
    bloqueantes.length === 0 &&
    (simulacion.plan.pasos.length > 0 || simulacion.plan.pausaPedida === true || simulacion.plan.activacionPedida === true) &&
    simulacion.validacionGoogle?.ok !== false;
  // Un cambio de presupuesto lo puede proponer cualquiera, pero solo Directores y Administradores lo aplican directo.
  const tocaPresu = simulacion?.plan.diff.some((d) => d.campo === "presupuesto" || d.campo === "limiteGasto") === true;
  const aplicaDirecto = puedeAprobar && (!tocaPresu || props.puedeAprobarPresupuesto === true);
  const puedeAplicar =
    aplicaDirecto &&
    simulacion !== null &&
    bloqueantes.length === 0 &&
    (simulacion.plan.pasos.length > 0 || simulacion.plan.pausaPedida === true || simulacion.plan.activacionPedida === true) &&
    simulacion.validacionGoogle?.ok !== false;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {provider === "meta" && nivel === "campana" && <EditorMetaCampana campana={props.campana} valores={valores} poner={poner} moneda={props.currency} />}
        {provider === "meta" && nivel === "conjunto" && (
          <EditorMetaConjunto
            conjunto={props.conjunto}
            campana={props.campana}
            valores={valores}
            poner={poner}
            moneda={props.currency}
            accountId={props.accountId}
            nombresIniciales={nombresDeSegmentacion(props.conjunto?.segmentacionCruda ?? null)}
          />
        )}
        {provider === "meta" && nivel === "anuncio" && <EditorMetaAnuncio anuncio={props.anuncio} valores={valores} poner={poner} contenidoBloqueado={contenidoBloqueado} accountId={props.accountId} crearVersion={props.crearVersion} />}
        {provider === "meta" ? null : provider === "linkedin" && nivel === "anuncio" ? (
          <p className="rounded-xl border border-foreground/10 bg-foreground/4 p-3 text-sm leading-6 text-foreground/65">
            LinkedIn no permite editar un anuncio desde WiWO.ADS: se arma desde una publicación existente. Desde la tabla
            se puede pausar o activar.
          </p>
        ) : (
          <>
          {provider === "google" ? (
            <Campo etiqueta={`Estado ${nivel === "campana" ? "de la campaña" : nivel === "conjunto" ? "del grupo de anuncios" : "del anuncio"}`} ayuda="Pausar detiene la entrega; habilitar la reanuda.">
              <select
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                value={valores.estadoPedido ?? ""}
                onChange={(e) => poner("estadoPedido")(e.target.value)}
              >
                {(() => {
                  const entidad = nivel === "campana" ? props.campana : nivel === "conjunto" ? props.conjunto : props.anuncio;
                  const habilitada = ["ENABLED", "ACTIVE"].includes((entidad?.estado ?? "").toUpperCase());
                  return (
                    <>
                      <option value="">{habilitada ? "Habilitada" : "Pausada"}</option>
                      <option value={habilitada ? "pausar" : "activar"}>{habilitada ? "Pausada" : "Habilitada"}</option>
                    </>
                  );
                })()}
              </select>
            </Campo>
          ) : (
          <Campo etiqueta="Estado" ayuda="Pausar detiene la entrega; activar la reanuda. Si no eliges nada, el estado no cambia.">
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              value={valores.estadoPedido ?? ""}
              onChange={(e) => poner("estadoPedido")(e.target.value)}
            >
              <option value="">Sin cambio</option>
              <option value="pausar">Pausar {nivel === "campana" ? "esta campaña" : nivel === "conjunto" ? "este conjunto" : "este anuncio"}</option>
              {provider !== "linkedin" && <option value="activar">Activar {nivel === "campana" ? "esta campaña" : nivel === "conjunto" ? "este conjunto" : "este anuncio"}</option>}
            </select>
          </Campo>
          )}
          {!(provider === "google" && nivel === "anuncio") && (
          <Campo
            etiqueta="Nombre"
            ayuda={provider === "linkedin" && nivel === "campana" ? "Renombrar requiere la conexión directa de LinkedIn (Integraciones); sin ella, se hace en LinkedIn." : undefined}
          >
            <Input
              value={valores.nombre ?? ""}
              onChange={(e) => poner("nombre")(e.target.value)}
            />
          </Campo>
          )}
          </>
        )}

        {provider !== "meta" && !(provider === "linkedin" && nivel === "anuncio") &&
          (nivel === "campana" || (nivel === "conjunto" && provider === "linkedin")) && (
          <Campo
            etiqueta={provider === "linkedin" && nivel === "campana" ? "Presupuesto total del grupo" : "Presupuesto"}
            ayuda={
              provider === "google"
                ? presupuestoTotalGoogle !== null ? undefined : "Google usa presupuesto diario."
                : provider === "linkedin"
                  ? "Un presupuesto total exige que la campaña (o el grupo) tenga fecha de término."
                  : undefined
            }
          >
            <div className="flex gap-2">
              {(provider === "meta" || (provider === "linkedin" && nivel === "conjunto")) && (
                <NativeSelect
                  className="w-32 shrink-0"
                  value={valores.presupuestoTipo ?? "daily"}
                  onChange={(e) => poner("presupuestoTipo")(e.target.value)}
                >
                  <NativeSelectOption value="daily">Diario</NativeSelectOption>
                  <NativeSelectOption value="lifetime">Total</NativeSelectOption>
                </NativeSelect>
              )}
              <Input
                inputMode="decimal"
                placeholder="Monto"
                disabled={presupuestoTotalGoogle !== null}
                value={valores.presupuestoMonto ?? ""}
                onChange={(e) => poner("presupuestoMonto")(e.target.value)}
              />
            </div>
            {presupuestoTotalGoogle !== null && (
              <p className="text-[0.7rem] leading-4 text-foreground/45">
                Esta campaña usa un presupuesto TOTAL por el período de la campaña. Google no deja cambiarlo desde aquí: se edita en Google Ads.
              </p>
            )}
          </Campo>
        )}

        {nivel === "campana" && provider === "google" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Inicio" ayuda="Google no deja cambiarlo si la campaña ya empezó.">
                <Input type="date" min={hoyIso} disabled={Boolean(props.campana?.inicio) && (props.campana?.inicio ?? "") <= hoyIso} value={valores.inicio ?? ""} onChange={(e) => poner("inicio")(e.target.value)} />
              </Campo>
              <Campo etiqueta="Fin" ayuda="Vacío = sin fecha de fin.">
                <Input type="date" min={hoyIso} value={valores.finCampana ?? ""} onChange={(e) => poner("finCampana")(e.target.value)} />
              </Campo>
            </div>
            {esBusqueda && (
            <Campo etiqueta="Redes" ayuda="Dónde se muestran los anuncios. La Búsqueda de Google no se puede quitar. Requiere tu cuenta de Google conectada.">
              <div className="flex flex-wrap gap-4 text-sm">
                {([["redBusqueda", "Búsqueda de Google", true], ["redAsociadas", "Socios de búsqueda", false], ["redDisplay", "Red de Display", false]] as const).map(
                  ([clave, etiqueta, fija]) => (
                    <label key={clave} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={valores[clave] === "1"}
                        disabled={fija}
                        onChange={(e) => poner(clave)(e.target.checked ? "1" : "")}
                      />
                      {etiqueta}
                    </label>
                  ),
                )}
              </div>
            </Campo>
            )}
            {conRotacion && (
            <Campo etiqueta="Rotación de anuncios">
              <NativeSelect value={valores.rotacion ?? ""} onChange={(e) => poner("rotacion")(e.target.value)}>
                {!valores.rotacion && <NativeSelectOption value="">Sin leer</NativeSelectOption>}
                <NativeSelectOption value="OPTIMIZE">Optimizar: mostrar los de mejor rendimiento</NativeSelectOption>
                <NativeSelectOption value="ROTATE_INDEFINITELY">Rotar sin optimizar</NativeSelectOption>
              </NativeSelect>
            </Campo>
            )}
            {estrategiaSoloLectura && (
              <Campo etiqueta="Estrategia de puja" ayuda="Esta estrategia no se edita desde WiWO.ADS: se cambia en Google Ads.">
                <p className="rounded-xl border border-foreground/10 bg-foreground/[0.04] px-3 py-2 text-sm">
                  {({ TARGET_CPV: "CPV objetivo (costo por visualización)", TARGET_CPM: "CPM objetivo", MANUAL_CPM: "CPM manual", MANUAL_CPV: "CPV manual", TARGET_CPA: "CPA objetivo", TARGET_ROAS: "ROAS objetivo", TARGET_SPEND: "Maximizar clics", MAXIMIZE_CONVERSIONS: "Maximizar conversiones", MAXIMIZE_CONVERSION_VALUE: "Maximizar el valor de conversión", MANUAL_CPC: "CPC manual", TARGET_IMPRESSION_SHARE: "Cuota de impresiones objetivo" } as Record<string, string>)[estrategiaGoogle ?? ""] ?? estrategiaGoogle}
                </p>
              </Campo>
            )}
            {!estrategiaSoloLectura && (
            <Campo etiqueta="Estrategia de puja" ayuda="Cambiarla pausa la campaña para que alguien la revise. Los importes son opcionales y en la moneda de la cuenta.">
              <NativeSelect value={valores.pujaTipo ?? ""} onChange={(e) => poner("pujaTipo")(e.target.value)}>
                {!valores.pujaTipo && <NativeSelectOption value="">Sin leer</NativeSelectOption>}
                <NativeSelectOption value="clics">Maximizar clics</NativeSelectOption>
                <NativeSelectOption value="conversiones">Maximizar conversiones</NativeSelectOption>
                <NativeSelectOption value="valor_conversion">Maximizar el valor de conversión</NativeSelectOption>
                <NativeSelectOption value="cpc_manual">CPC manual</NativeSelectOption>
                <NativeSelectOption value="cuota_impresiones">Cuota de impresiones objetivo</NativeSelectOption>
              </NativeSelect>
            </Campo>
            )}
            {(valores.pujaTipo === "clics" || valores.pujaTipo === "cuota_impresiones") && (
              <Campo etiqueta={valores.pujaTipo === "cuota_impresiones" ? "CPC máximo (obligatorio)" : "CPC máximo (opcional)"}>
                <Input inputMode="decimal" value={valores.pujaCpc ?? ""} onChange={(e) => poner("pujaCpc")(e.target.value)} />
              </Campo>
            )}
            {valores.pujaTipo === "conversiones" && (
              <Campo etiqueta="CPA objetivo (opcional)">
                <Input inputMode="decimal" value={valores.pujaCpa ?? ""} onChange={(e) => poner("pujaCpa")(e.target.value)} />
              </Campo>
            )}
            {valores.pujaTipo === "valor_conversion" && (
              <Campo etiqueta="ROAS objetivo (opcional)">
                <Input inputMode="decimal" value={valores.pujaRoas ?? ""} onChange={(e) => poner("pujaRoas")(e.target.value)} />
              </Campo>
            )}
            {valores.pujaTipo === "cpc_manual" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={valores.pujaMejorar === "1"} onChange={(e) => poner("pujaMejorar")(e.target.checked ? "1" : "")} />
                Mejorar el CPC
              </label>
            )}
            {valores.pujaTipo === "cuota_impresiones" && (
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Dónde aparecer">
                  <NativeSelect value={valores.cuotaUbicacion ?? "TOP_OF_PAGE"} onChange={(e) => poner("cuotaUbicacion")(e.target.value)}>
                    <NativeSelectOption value="ANYWHERE_ON_PAGE">En cualquier parte</NativeSelectOption>
                    <NativeSelectOption value="TOP_OF_PAGE">Parte superior</NativeSelectOption>
                    <NativeSelectOption value="ABSOLUTE_TOP_OF_PAGE">Posición más alta</NativeSelectOption>
                  </NativeSelect>
                </Campo>
                <Campo etiqueta="Cuota objetivo (%)">
                  <Input inputMode="numeric" value={valores.cuotaPorcentaje ?? "50"} onChange={(e) => poner("cuotaPorcentaje")(e.target.value)} />
                </Campo>
              </div>
            )}
            <Campo etiqueta="Opciones de ubicación" ayuda="Presencia: solo quienes están en la ubicación. Presencia o interés: también quienes muestran interés.">
              <NativeSelect value={valores.presencia ?? ""} onChange={(e) => poner("presencia")(e.target.value)}>
                {!valores.presencia && <NativeSelectOption value="">Sin leer</NativeSelectOption>}
                <NativeSelectOption value="presencia">Presencia (recomendado)</NativeSelectOption>
                <NativeSelectOption value="presencia_o_interes">Presencia o interés</NativeSelectOption>
              </NativeSelect>
            </Campo>
            <Campo etiqueta="Plantilla de URL de seguimiento" ayuda="Vacía, se quita la que tenga.">
              <Input value={valores.plantillaSeguimiento ?? ""} onChange={(e) => poner("plantillaSeguimiento")(e.target.value)} placeholder="{lpurl}?utm_source=google" />
            </Campo>
            {esBusqueda && props.campana?.extensiones && (
              <fieldset className="space-y-3 rounded-xl border border-foreground/10 p-3">
                <legend className="px-1 text-xs font-bold text-foreground/70">Extensiones de la campaña</legend>
                <Campo etiqueta="Enlaces de sitio" ayuda="Uno por línea: texto | URL | descripción 1 | descripción 2. El texto admite 25 caracteres; las dos descripciones (35) van juntas o ninguna. Hasta 20.">
                  <Textarea rows={5} value={valores.sitelinks ?? ""} onChange={(e) => poner("sitelinks")(e.target.value)} placeholder="Contacto | https://sitio.cl/contacto | Escríbenos | Te respondemos hoy" />
                </Campo>
                <Campo etiqueta="Textos destacados" ayuda="Uno por línea, hasta 25 caracteres cada uno. Hasta 20.">
                  <Textarea rows={4} value={valores.destacados ?? ""} onChange={(e) => poner("destacados")(e.target.value)} />
                </Campo>
              </fieldset>
            )}
            {(props.campana?.gruposDeRecursos ?? []).map((g, i) => (
              <fieldset key={g.id} className="space-y-3 rounded-xl border border-foreground/10 p-3">
                <legend className="px-1 text-xs font-bold text-foreground/70">Performance Max · {g.nombre ?? `grupo ${g.id}`}</legend>
                <p className="text-[0.7rem] leading-4 text-foreground/45">
                  Un texto por línea. Los textos de Google no se editan: se reemplazan, y los que no cambias se conservan. Las imágenes, los videos y el logo
                  ({g.recursos.filter((r) => r.imagenUrl).length} imágenes, {g.recursos.filter((r) => r.videoYoutube).length} videos) se leen pero no se cambian desde aquí.
                </p>
                <Campo etiqueta="Titulares" ayuda="3 a 15, hasta 30 caracteres cada uno.">
                  <Textarea rows={6} value={valores[`gr${i}:titulares`] ?? ""} onChange={(e) => poner(`gr${i}:titulares`)(e.target.value)} />
                </Campo>
                <Campo etiqueta="Títulos largos" ayuda="1 a 5, hasta 90 caracteres cada uno.">
                  <Textarea rows={3} value={valores[`gr${i}:largos`] ?? ""} onChange={(e) => poner(`gr${i}:largos`)(e.target.value)} />
                </Campo>
                <Campo etiqueta="Descripciones" ayuda="2 a 5, hasta 90 caracteres; al menos una de 60 o menos.">
                  <Textarea rows={4} value={valores[`gr${i}:desc`] ?? ""} onChange={(e) => poner(`gr${i}:desc`)(e.target.value)} />
                </Campo>
                <Campo etiqueta="URL final">
                  <Input value={valores[`gr${i}:url`] ?? ""} onChange={(e) => poner(`gr${i}:url`)(e.target.value)} />
                </Campo>
                <div className="grid grid-cols-2 gap-3">
                  <Campo etiqueta="Ruta visible 1">
                    <Input value={valores[`gr${i}:path1`] ?? ""} onChange={(e) => poner(`gr${i}:path1`)(e.target.value)} />
                  </Campo>
                  <Campo etiqueta="Ruta visible 2">
                    <Input value={valores[`gr${i}:path2`] ?? ""} onChange={(e) => poner(`gr${i}:path2`)(e.target.value)} />
                  </Campo>
                </div>
              </fieldset>
            ))}
          </>
        )}

        {nivel === "conjunto" && provider === "google" && limiteG && (
          <p className="rounded-xl border border-foreground/10 bg-foreground/4 p-3 text-sm leading-6 text-foreground/65">{limiteG}</p>
        )}

        {nivel === "conjunto" && provider === "google" && seccionesG.has("cpcMaximo") && (
          <Campo etiqueta="CPC máximo">
            <Input inputMode="decimal" value={valores.puja ?? ""} onChange={(e) => poner("puja")(e.target.value)} />
          </Campo>
        )}

        {nivel === "conjunto" && provider === "google" && seccionesG.has("palabrasClave") && (
          <Campo
            etiqueta="Palabras clave"
            ayuda="Escribe las nuevas una por línea: [exacta], «frase» entre comillas, o amplia sin nada."
          >
            <div className="space-y-2">
              {props.conjunto?.palabrasClave === null || props.conjunto?.palabrasClave === undefined ? (
                <p className="rounded-lg border border-warn/25 bg-warn/8 p-2 text-xs text-foreground/70">
                  No se pudieron leer las palabras clave: Windsor no las entrega. Conecta tu cuenta de
                  Google en Integraciones para verlas y editarlas.
                </p>
              ) : (
                <>
                  {props.conjunto.palabrasClave.length === 0 && (
                    <p className="text-xs text-foreground/50">Este grupo todavía no tiene palabras clave.</p>
                  )}
                  <ul className="max-h-56 space-y-1 overflow-y-auto">
                    {props.conjunto.palabrasClave.map((k) => (
                      <li key={k.criterionId} className="flex items-center justify-between gap-2 text-sm">
                        <span className={k.estado === "PAUSED" ? "text-foreground/40 line-through" : "text-foreground"}>
                          {formatearPalabraClave(k.texto, k.concordancia)}
                        </span>
                        <NativeSelect
                          size="sm"
                          value={valores[`kw:${k.criterionId}`] ?? ""}
                          onChange={(e) => poner(`kw:${k.criterionId}`)(e.target.value)}
                        >
                          <NativeSelectOption value="">Mantener</NativeSelectOption>
                          <NativeSelectOption value="quitar">Quitar</NativeSelectOption>
                          {k.estado === "PAUSED" ? (
                            <NativeSelectOption value="activar">Activar</NativeSelectOption>
                          ) : (
                            <NativeSelectOption value="pausar">Pausar</NativeSelectOption>
                          )}
                        </NativeSelect>
                      </li>
                    ))}
                  </ul>
                  <Textarea
                    rows={3}
                    placeholder={"cotizar luz\n[plan hogar]\n\"energía residencial\""}
                    value={valores.kwAgregar ?? ""}
                    onChange={(e) => poner("kwAgregar")(e.target.value)}
                  />
                </>
              )}
            </div>
          </Campo>
        )}

        {nivel === "conjunto" && provider === "linkedin" && (
          <Campo
            etiqueta="Fecha de término"
            ayuda="LinkedIn detiene la campaña al empezar ese día. Cámbiala o déjala igual."
          >
            <Input type="date" min={hoyIso} value={valores.fin ?? ""} onChange={(e) => poner("fin")(e.target.value)} />
          </Campo>
        )}

        {nivel === "anuncio" && provider === "google" && !esRsa && (
          <ContenidoDeGoogleSoloLectura
            anuncio={props.anuncio}
            aviso={props.anuncio?.edicionDeContenido.motivo ?? limiteG ?? "Este anuncio no se edita desde aquí."}
          />
        )}

        {nivel === "anuncio" && provider === "google" && esRsa && (
          <EditorAnuncioGoogle
            valores={valores}
            poner={poner}
            titularesOriginales={props.anuncio?.contenido.titulares ?? []}
            descripcionesOriginales={props.anuncio?.contenido.descripciones ?? []}
          />
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-danger/25 bg-danger/8 p-3 text-sm text-danger">{error}</p>
      )}

      {provider !== "linkedin" && (
        <div className="space-y-2 rounded-xl border border-danger/25 bg-danger/5 p-3">
          <p className="text-sm font-semibold text-danger">Eliminar {nivel === "campana" ? "la campaña" : nivel === "conjunto" ? (provider === "google" ? "el grupo de anuncios" : "el conjunto") : "el anuncio"}</p>
          <p className="text-xs leading-5 text-foreground/60">
            No se puede deshacer{nivel === "anuncio" ? "" : nivel === "conjunto" ? " y se eliminan también sus anuncios" : " y se eliminan también sus conjuntos y anuncios"}. Si solo quieres detener la entrega, pausa. {puedeAprobar ? "" : "Tu rol lo propone y lo aprueba un Digital Lead o superior."}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={valores.estadoPedido === "eliminar"}
              onChange={(e) => poner("estadoPedido")(e.target.checked ? "eliminar" : "")}
              className="size-4 accent-[var(--danger,#dc2626)]"
            />
            Quiero eliminarlo (el resto del formulario se ignora)
          </label>
        </div>
      )}

      {simulacion && (
        <div className="space-y-3 rounded-xl border border-foreground/10 p-3">
          <h4 className="text-[0.7rem] font-bold uppercase tracking-wide text-foreground/40">Esto es lo que va a pasar</h4>
          {simulacion.plan.diff.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {simulacion.plan.diff.map((d) => (
                <li key={d.campo}>
                  <span className="font-medium text-foreground">{d.etiqueta}</span>
                  <div className="mt-0.5 grid gap-0.5 text-xs">
                    <span className="break-words text-foreground/45 line-through">{d.antes}</span>
                    <span className="break-words text-foreground">{d.despues}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground/55">No hay cambios que aplicar.</p>
          )}
          {simulacion.plan.problemas.map((p, i) => (
            <p key={`${p.campo}-${i}`} className={p.bloqueante ? "text-sm text-danger" : "text-sm text-warn"}>
              {p.bloqueante ? "⛔ " : "⚠️ "}{p.mensaje}
            </p>
          ))}
          {simulacion.validacionGoogle && (
            <p className={simulacion.validacionGoogle.ok ? "text-sm text-success" : "text-sm text-danger"}>
              {simulacion.validacionGoogle.ok
                ? "Google validó el cambio contra la cuenta real (sin aplicarlo)."
                : `Google rechazó el cambio: ${simulacion.validacionGoogle.mensaje}`}
            </p>
          )}
          {simulacion.plan.pausaAlAplicar && (
            <p className="text-xs text-foreground/55">
              Al aplicarlo, esto queda pausado: no entregará hasta que lo actives de nuevo en la plataforma.
            </p>
          )}
          {aplicaDirecto ? (
            <Button type="button" disabled={!puedeAplicar || trabajando !== null} onClick={aplicar}>
              {trabajando === "aplicar" ? <OrbeDeBoton className="mx-3" /> : "Aplicar en la plataforma"}
            </Button>
          ) : enviado ? (
            <p className="rounded-xl border border-foreground/10 p-3 text-sm text-foreground">{enviado}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-foreground/55">{puedeAprobar && tocaPresu ? "Un cambio de presupuesto lo aprueba un Director o un Administrador: se envía a revisión y no se modifica nada hasta que lo aprueben." : "Tu rol arma el cambio pero no lo aplica: se envía a revisión y no se modifica nada hasta que lo aprueben."} Si lo rechazan, todo queda como estaba.</p>
              <Button type="button" disabled={!puedeAplicar0 || trabajando !== null} onClick={solicitar}>
                {trabajando === "solicitar" ? <OrbeDeBoton className="mx-3" /> : "Enviar a revisión"}
              </Button>
            </div>
          )}
        </div>
      )}

      {aplicado && (
        <div className="space-y-2 rounded-xl border border-foreground/10 p-3 text-sm">
          <p className={aplicado.ok ? "text-foreground" : "text-danger"}>{aplicado.aviso}</p>
          {aplicado.verificacion && aplicado.verificacion.length > 0 && (
            <ul className="space-y-1 text-xs text-foreground/60">
              {aplicado.verificacion.map((v) => (
                <li key={v.campo}>
                  {v.coincide === true ? "✅" : v.coincide === false ? "⏳" : "➖"} {v.etiqueta}
                  {v.coincide === false && ` — la plataforma muestra: ${v.actual}`}
                  {v.coincide === null && ` — ${v.actual}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-foreground/10 bg-background/95 px-4 py-3 backdrop-blur">
        <Button type="button" variant="outline" disabled={!hayCambios || trabajando !== null} onClick={simular}>
          {trabajando === "simular" ? <OrbeDeBoton className="mx-3" /> : "Revisar cambios"}
        </Button>
        {!hayCambios && <span className="text-xs text-foreground/45">Cambia algo para poder revisarlo.</span>}
      </div>
    </div>
  );
}

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-foreground/60">{etiqueta}</span>
      {children}
      {ayuda && <span className="block text-[0.7rem] leading-4 text-foreground/40">{ayuda}</span>}
    </label>
  );
}
