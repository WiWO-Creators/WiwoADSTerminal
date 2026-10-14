/**
 * Formularios instantáneos (lead ads) de Meta: cómo se arma el formulario que se crea en una página, y cómo se decide si un lead
 * es «calificado» según lo que respondió. Puro (sin red): lo usan la ruta de formularios, el Constructor y las pruebas.
 *
 * El formulario se crea en la PÁGINA de Facebook (`/{page}/leadgen_forms`); el anuncio lo usa con `lead_gen_form_id` en su botón.
 * «Mayor intención» agrega una pantalla de revisión antes de enviar (`is_optimized_for_quality`): menos volumen, más calidad.
 */

export type TipoDeFormulario = "mas_volumen" | "mayor_intencion";

export type CampoDeContacto = "nombre" | "correo" | "telefono" | "ciudad" | "empresa" | "cargo";

export type PreguntaDeFiltro = {
  /** Clave estable de la pregunta (`inversion`, `plazo`…): es la que se usa para calificar. */
  clave: string;
  etiqueta: string;
  /** Respuestas posibles, en el orden en que se muestran. Hasta 10. */
  opciones: Array<{ clave: string; texto: string }>;
};

export type DatosDeFormulario = {
  nombre: string;
  tipo: TipoDeFormulario;
  contacto: CampoDeContacto[];
  preguntas: PreguntaDeFiltro[];
  /** Política de privacidad: Meta la exige. */
  politicaUrl: string;
  politicaTexto?: string;
  /** Pantalla de agradecimiento. */
  gracias: { titulo: string; cuerpo: string; botonTexto: string; botonUrl: string };
  /** Introducción opcional del formulario. */
  introduccion?: { titulo: string; texto: string };
  idioma?: string;
};

const TIPO_DE_CAMPO: Record<CampoDeContacto, string> = {
  nombre: "FULL_NAME",
  correo: "EMAIL",
  telefono: "PHONE",
  ciudad: "CITY",
  empresa: "COMPANY_NAME",
  cargo: "JOB_TITLE",
};

const https = (u: string) => /^https:\/\/[^\s]+\.[^\s]+$/i.test(u.trim());
const claveValida = (c: string) => /^[a-z0-9_]{2,40}$/.test(c);

/** Lo que está mal en el formulario, antes de mandarlo a Meta (vacío = se puede crear). */
export function problemasDelFormulario(f: DatosDeFormulario): string[] {
  const p: string[] = [];
  if (!f.nombre.trim()) p.push("El formulario necesita un nombre.");
  if (f.nombre.length > 200) p.push("El nombre del formulario es demasiado largo (máximo 200).");
  if (f.contacto.length === 0) p.push("Elige al menos un campo de contacto (por ejemplo correo o teléfono).");
  if (!f.contacto.includes("correo") && !f.contacto.includes("telefono")) p.push("El formulario necesita correo o teléfono para poder contactar a la persona.");
  if (!https(f.politicaUrl)) p.push("La política de privacidad debe ser una dirección https:// válida (Meta la exige).");
  if (!https(f.gracias.botonUrl)) p.push("El botón de la pantalla de gracias debe llevar a una dirección https://.");
  if (!f.gracias.titulo.trim() || !f.gracias.cuerpo.trim()) p.push("Falta el título o el texto de la pantalla de gracias.");
  const claves = new Set<string>();
  for (const q of f.preguntas) {
    if (!claveValida(q.clave)) p.push(`La clave «${q.clave}» no es válida: usa minúsculas, números y guion bajo.`);
    if (claves.has(q.clave)) p.push(`La pregunta «${q.clave}» está repetida.`);
    claves.add(q.clave);
    if (!q.etiqueta.trim()) p.push(`Falta el texto de la pregunta «${q.clave}».`);
    if (q.opciones.length < 2) p.push(`La pregunta «${q.etiqueta || q.clave}» necesita al menos 2 respuestas.`);
    if (q.opciones.length > 10) p.push(`La pregunta «${q.etiqueta || q.clave}» tiene más de 10 respuestas (máximo de Meta).`);
    if (q.opciones.some((o) => !claveValida(o.clave) || !o.texto.trim())) p.push(`Las respuestas de «${q.etiqueta || q.clave}» necesitan texto y una clave válida.`);
    if (new Set(q.opciones.map((o) => o.clave)).size !== q.opciones.length) p.push(`Hay respuestas repetidas en «${q.etiqueta || q.clave}».`);
  }
  if (f.preguntas.length > 5) p.push("Meta permite hasta 5 preguntas personalizadas por formulario.");
  return p;
}

/** El cuerpo que se manda a `POST /{page}/leadgen_forms`. */
export function cuerpoDelFormulario(f: DatosDeFormulario): Record<string, unknown> {
  return {
    name: f.nombre.trim(),
    locale: f.idioma ?? "ES_LA",
    follow_up_action_url: f.gracias.botonUrl.trim(),
    privacy_policy: { url: f.politicaUrl.trim(), link_text: (f.politicaTexto ?? "Política de privacidad").trim() },
    // Mayor intención: pantalla de revisión antes de enviar. Más volumen: se envía directo.
    is_optimized_for_quality: f.tipo === "mayor_intencion",
    ...(f.introduccion ? { context_card: { title: f.introduccion.titulo, style: "PARAGRAPH_STYLE", content: [f.introduccion.texto] } } : {}),
    questions: [
      // Primero las preguntas que filtran y después el contacto, como se arma en el Administrador.
      ...f.preguntas.map((q) => ({
        type: "CUSTOM",
        key: q.clave,
        label: q.etiqueta.trim(),
        options: q.opciones.map((o) => ({ key: o.clave, value: o.texto.trim() })),
      })),
      ...f.contacto.map((c) => ({ type: TIPO_DE_CAMPO[c] })),
    ],
    thank_you_page: {
      title: f.gracias.titulo.trim(),
      body: f.gracias.cuerpo.trim(),
      button_text: f.gracias.botonTexto.trim() || "Ver sitio",
      button_type: "VIEW_WEBSITE",
      website_url: f.gracias.botonUrl.trim(),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Leads calificados                                                           */
/* -------------------------------------------------------------------------- */

/**
 * La regla que decide si un lead es calificado: para cada pregunta que se mira, qué respuestas sirven.
 * Ejemplo (Colombia): `inversion` definida y `plazo` en «3 meses» o «3 a 12 meses».
 */
export type ReglaDeCalificacion = Array<{ pregunta: string; aceptadas?: string[]; rechazadas?: string[] }>;

export type LeadDeMeta = { id: string; creado: string | null; respuestas: Record<string, string> };

/** Un lead es calificado si cumple TODAS las condiciones de la regla. Una respuesta que falta cuenta como no cumplida. */
export function esCalificado(lead: LeadDeMeta, regla: ReglaDeCalificacion): boolean {
  if (regla.length === 0) return false;
  return regla.every((c) => {
    const r = lead.respuestas[c.pregunta];
    if (r === undefined) return false;
    if (c.aceptadas && !c.aceptadas.includes(r)) return false;
    if (c.rechazadas && c.rechazadas.includes(r)) return false;
    return true;
  });
}

export type ResumenDeLeads = { total: number; calificados: number; porcentaje: number | null };

export function resumenDeLeads(leads: LeadDeMeta[], regla: ReglaDeCalificacion): ResumenDeLeads {
  const calificados = leads.filter((l) => esCalificado(l, regla)).length;
  return { total: leads.length, calificados, porcentaje: leads.length > 0 ? Math.round((calificados / leads.length) * 1000) / 10 : null };
}

/** Un lead de la API (`field_data`) → sus respuestas por clave de pregunta. Las respuestas vienen como lista de valores. */
export function leadDesdeApi(fila: { id: string; created_time?: string; field_data?: Array<{ name: string; values?: string[] }> }): LeadDeMeta {
  const respuestas: Record<string, string> = {};
  for (const c of fila.field_data ?? []) if (c.values && c.values[0] !== undefined) respuestas[c.name] = String(c.values[0]);
  return { id: fila.id, creado: fila.created_time ?? null, respuestas };
}

/**
 * La regla del plan de Colombia (Valor Development): rango de inversión definido y plazo de hasta 12 meses (lo que deja fuera a quien
 * está «solo explorando»). Las claves son las del formulario `FORMULARIO_COLOMBIA`.
 */
export const FORMULARIO_COLOMBIA: Pick<DatosDeFormulario, "contacto" | "preguntas"> = {
  contacto: ["nombre", "correo", "telefono", "ciudad"],
  preguntas: [
    {
      clave: "inversion",
      etiqueta: "¿Cuánto piensa invertir?",
      opciones: [
        { clave: "hasta_250k", texto: "Hasta US$250.000" },
        { clave: "250k_500k", texto: "US$250.000 a 500.000" },
        { clave: "500k_1m", texto: "US$500.000 a 1M" },
        { clave: "mas_1m", texto: "Más de US$1M" },
      ],
    },
    {
      clave: "plazo",
      etiqueta: "¿En qué plazo?",
      opciones: [
        { clave: "3_meses", texto: "En los próximos 3 meses" },
        { clave: "3_a_12", texto: "3 a 12 meses" },
        { clave: "mas_12", texto: "Más de 12 meses" },
        { clave: "explorando", texto: "Solo explorando" },
      ],
    },
    {
      clave: "proposito",
      etiqueta: "¿Para qué?",
      opciones: [
        { clave: "inversion_renta", texto: "Inversión y renta" },
        { clave: "segunda_vivienda", texto: "Segunda vivienda" },
        { clave: "mudarme", texto: "Mudarme" },
        { clave: "otro", texto: "Otro" },
      ],
    },
  ],
};

export const REGLA_COLOMBIA: ReglaDeCalificacion = [
  // Plazo de hasta 12 meses: «solo explorando» y «más de 12 meses» no califican.
  { pregunta: "plazo", aceptadas: ["3_meses", "3_a_12"] },
  // El rango de inversión debe estar definido: cualquiera de los cuatro sirve.
  { pregunta: "inversion", aceptadas: ["hasta_250k", "250k_500k", "500k_1m", "mas_1m"] },
];
