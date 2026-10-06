import { etiquetaDeCanal } from "@/lib/canales";
import type { PlanSimulado, Proyeccion } from "@/lib/simulador";

export type TemaDeDeck = "wiwo" | "mgc";

export type DatosDeExportacion = {
  cliente: string;
  objetivo: string;
  moneda: string;
  diasDeHistorial: number;
  plan: PlanSimulado;
  proyeccion: Proyeccion;
};

const NOMBRE_PLATAFORMA: Record<string, string> = {
  google: "Google Ads",
  meta: "Meta Ads",
  tiktok: "TikTok Ads",
  linkedin: "LinkedIn Ads",
};
const CONFIANZA: Record<string, string> = { alta: "Alta", media: "Media", baja: "Baja", sin_historial: "Sin historial" };

function dinero(micros: number, moneda: string): string {
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(
      micros / 1_000_000,
    );
  } catch {
    return `${moneda} ${Math.round(micros / 1_000_000).toLocaleString("es-CL")}`;
  }
}

const entero = (n: number | null) => (n === null ? "—" : Math.round(n).toLocaleString("es-CL"));
const rango = (r: { bajo: number; alto: number } | null) =>
  r === null ? "—" : `${Math.round(r.bajo).toLocaleString("es-CL")} a ${Math.round(r.alto).toLocaleString("es-CL")}`;

const nombreDelCanal = (provider: string, canal: string | null) =>
  canal
    ? `${NOMBRE_PLATAFORMA[provider] ?? provider} · ${etiquetaDeCanal(provider, canal)}`
    : (NOMBRE_PLATAFORMA[provider] ?? provider);

/**
 * Una línea de cifras por canal y los avisos sin repetir: los que dicen lo mismo en cada canal
 * (historial corto, rango amplio…) salen una sola vez; los que nombran al canal se conservan.
 */
function supuestosCompactos(d: DatosDeExportacion): string[] {
  const moneda = d.moneda;
  const generales = new Set<string>();
  const propios: string[] = [];
  const cifras: string[] = [];
  for (const p of d.proyeccion.porPlataforma) {
    const n = nombreDelCanal(p.provider, p.canal);
    cifras.push(
      p.cpmMicros !== null
        ? `${n}: CPM ${dinero(p.cpmMicros, moneda)}, CTR ${((p.ctr ?? 0) * 100).toFixed(2)} %` +
            (p.costoPorResultadoMicros !== null ? `, ${dinero(p.costoPorResultadoMicros, moneda)} por resultado` : "")
        : `${n}: sin historial`,
    );
    for (const aviso of p.avisos) {
      // Los avisos que nombran al canal no se pueden fusionar; los demás se deduplican por texto.
      if (aviso.includes(n)) propios.push(aviso);
      else generales.add(aviso.replace(/Meta Ads|Google Ads|TikTok Ads|LinkedIn Ads/g, "la plataforma"));
    }
  }
  for (const a of d.proyeccion.avisos) generales.add(a);
  return [
    `Se proyecta con los últimos ${d.diasDeHistorial} días de rendimiento real de este cliente.`,
    ...cifras,
    ...propios,
    ...generales,
    "El rango sale de cómo varió el costo por resultado entre las campañas del cliente; no garantiza un resultado.",
  ];
}

/** El contenido de la presentación, igual para los dos estilos: solo cambia cómo se dibuja. */
function contenido(d: DatosDeExportacion) {
  const t = d.proyeccion.total;
  const moneda = d.moneda;
  const resultado = d.proyeccion.porPlataforma.find((p) => p.resultados)?.etiquetaResultado ?? "Resultados";
  return {
    titulo: "Simulación de campaña",
    detallesPortada: [
      `Objetivo: ${d.objetivo}`,
      `Inversión simulada: ${dinero(d.plan.montoMicros, moneda)} en ${d.plan.dias} días`,
      `${d.plan.campanas} ${d.plan.campanas === 1 ? "campaña" : "campañas"} · ${dinero(d.proyeccion.diarioPorCampanaMicros, moneda)} por día cada una`,
    ],
    tarjetas: [
      ["Inversión", dinero(t.gastoMicros, moneda)],
      ["Impresiones", entero(t.impresiones)],
      ["Clics", entero(t.clics)],
      [`${resultado} (rango)`, rango(t.resultados)],
    ] as Array<[string, string]>,
    cabecera: ["Canal", "Inversión", "Impresiones", "Clics", resultado, "Confianza"],
    filas: d.proyeccion.porPlataforma.map((p) => [
      nombreDelCanal(p.provider, p.canal),
      dinero(p.gastoMicros, moneda),
      entero(p.impresiones),
      entero(p.clics),
      rango(p.resultados),
      CONFIANZA[p.confianza] ?? p.confianza,
    ]),
    supuestos: supuestosCompactos(d),
    nota: "Proyección basada en el historial real del cliente. No es una promesa de resultados.",
  };
}

/** Líneas que ocupa un texto: caracteres por línea ≈ ancho × 72 / (tamaño × 0.55). */
function lineas(texto: string, ancho: number, size: number): number {
  const porLinea = Math.max(8, Math.floor((ancho * 72) / (size * 0.55)));
  return Math.max(1, Math.ceil(texto.length / porLinea));
}

/** El tamaño más grande (sin bajar de `minimo`) con el que la lista cabe en `alto` pulgadas. */
function tamanoQueCabe(items: string[], ancho: number, alto: number, maximo: number, minimo: number, interlineado = 1.32, separacion = 0.07) {
  for (let size = maximo; size >= minimo; size -= 0.5) {
    const total = items.reduce((suma, t) => suma + lineas(t, ancho, size) * size * interlineado / 72 + separacion, 0);
    if (total <= alto) return size;
  }
  return minimo;
}

/**
 * Presentación de la simulación en .pptx. Dos estilos oficiales: WiWO (13,33 × 7,5 in, Plus Jakarta Sans,
 * azul y verde neón) y MGC (10 × 5,625 in, Helvetica Neue, rojo y negro). Los fondos y logos vienen de
 * `public/deck/`. Google Slides la abre desde Drive con «Abrir con → Presentaciones de Google».
 * La librería se carga al pulsar el botón: no pesa en el resto de la app.
 */
export async function exportarPresentacion(d: DatosDeExportacion, tema: TemaDeDeck = "wiwo"): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.title = `Simulación de campaña · ${d.cliente}`;
  const c = contenido(d);
  if (tema === "mgc") construirMgc(pptx, c, d.cliente);
  else construirWiwo(pptx, c, d.cliente);

  const nombre = `simulacion-${d.cliente}-${tema}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  await pptx.writeFile({ fileName: `${nombre}.pptx` });
}

type Pptx = InstanceType<Awaited<typeof import("pptxgenjs")>["default"]>;
type Contenido = ReturnType<typeof contenido>;

/* -------------------------------------------------------------------------- */
/* WiWO · 13,333 × 7,5 in                                                     */
/* -------------------------------------------------------------------------- */

function construirWiwo(pptx: Pptx, c: Contenido, cliente: string) {
  pptx.defineLayout({ name: "WIWO", width: 13.333, height: 7.5 });
  pptx.layout = "WIWO";
  const FUENTE = "Plus Jakarta Sans";
  const AZUL = "4242FF";
  const VERDE = "3BFF00";
  const TINTA = "222634";
  const GRIS = "5A6172";
  const GRIS_CLARO = "9AA6C8";
  const BORDE = "E4E7F2";
  const LILA = "EEF0FF";
  const MARGEN = 0.6;
  const base = "/deck/wiwo/";

  /** Logo con la proporción nativa: blanco sobre fondo oscuro, azul sobre claro; borde derecho a 0,6 in. */
  const logo = (s: ReturnType<Pptx["addSlide"]>, oscuro: boolean) => {
    const ancho = 1.62;
    const ratio = oscuro ? 5.657 : 4.719;
    s.addImage({
      path: `${base}${oscuro ? "logo_wiwo_blanco.png" : "logo_wiwo_azul.png"}`,
      x: 13.333 - MARGEN - ancho,
      y: 0.34,
      w: ancho,
      h: ancho / ratio,
    });
  };

  // 1. Portada
  const portada = pptx.addSlide();
  portada.background = { path: `${base}bg_3d.jpg` };
  logo(portada, true);
  portada.addText("SIMULACIÓN DE CAMPAÑA", { x: MARGEN, y: 2.2, w: 9, h: 0.35, fontFace: FUENTE, fontSize: 11, bold: true, color: VERDE, charSpacing: 2 });
  portada.addText(cliente, { x: MARGEN, y: 2.65, w: 11, h: 1.0, fontFace: FUENTE, fontSize: 34, bold: true, color: "FFFFFF", valign: "top" });
  portada.addText(
    c.detallesPortada.map((l) => ({ text: l, options: { breakLine: true } })),
    { x: MARGEN, y: 3.9, w: 11, h: 1.6, fontFace: FUENTE, fontSize: 13.5, color: "FFFFFF", valign: "top", paraSpaceAfter: 6 },
  );

  // 2. Lo que podría dar (fondo claro: datos)
  const datos = pptx.addSlide();
  datos.background = { path: `${base}bg_claro.jpg` };
  logo(datos, false);
  datos.addText("PROYECCIÓN", { x: MARGEN, y: 0.62, w: 6, h: 0.3, fontFace: FUENTE, fontSize: 10.5, bold: true, color: AZUL, charSpacing: 1.2 });
  datos.addText("Lo que podría dar", { x: MARGEN, y: 0.98, w: 10, h: 0.7, fontFace: FUENTE, fontSize: 32, bold: true, color: TINTA });
  const anchoTarjeta = (13.333 - MARGEN * 2 - 0.2 * 3) / 4;
  c.tarjetas.forEach(([titulo, valor], i) => {
    const x = MARGEN + i * (anchoTarjeta + 0.2);
    datos.addShape("roundRect", { x, y: 2.0, w: anchoTarjeta, h: 1.25, fill: { color: "FFFFFF" }, line: { color: BORDE, width: 1 }, rectRadius: 0.1 });
    datos.addText(titulo, { x: x + 0.22, y: 2.1, w: anchoTarjeta - 0.4, h: 0.3, fontFace: FUENTE, fontSize: 10, color: GRIS });
    const size = valor.length > 16 ? 16 : valor.length > 11 ? 19 : 24;
    datos.addText(valor, { x: x + 0.22, y: 2.45, w: anchoTarjeta - 0.4, h: 0.65, fontFace: FUENTE, fontSize: size, bold: true, color: AZUL, valign: "top" });
  });
  const tamanoCelda = c.filas.length > 6 ? 9.5 : 11;
  datos.addTable(
    [
      c.cabecera.map((t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: AZUL } } })),
      ...c.filas.map((fila, i) =>
        fila.map((t, j) => ({ text: t, options: { color: TINTA, bold: j === 0, fill: { color: i % 2 === 0 ? "FFFFFF" : LILA } } })),
      ),
    ],
    { x: MARGEN, y: 3.6, w: 13.333 - MARGEN * 2, colW: [3.9, 1.7, 1.7, 1.3, 2.2, 1.333], fontFace: FUENTE, fontSize: tamanoCelda, border: { type: "solid", color: BORDE, pt: 1 }, rowH: 0.34 },
  );

  // 3. Supuestos y advertencias (fondo azul)
  const sup = pptx.addSlide();
  sup.background = { path: `${base}bg_azul.jpg` };
  logo(sup, true);
  sup.addText("LECTURA", { x: MARGEN, y: 0.62, w: 6, h: 0.3, fontFace: FUENTE, fontSize: 10.5, bold: true, color: VERDE, charSpacing: 1.2 });
  sup.addText("Supuestos y advertencias", { x: MARGEN, y: 0.98, w: 10, h: 0.7, fontFace: FUENTE, fontSize: 32, bold: true, color: "FFFFFF" });
  const alto = 6.9 - 2.2;
  const size = tamanoQueCabe(c.supuestos, 12, alto, 13.5, 10, 1.31, 0.1);
  sup.addText(
    c.supuestos.map((t) => ({ text: t, options: { bullet: { code: "25CF", color: VERDE }, breakLine: true } })),
    { x: MARGEN, y: 2.2, w: 12.1, h: alto, fontFace: FUENTE, fontSize: size, color: "FFFFFF", valign: "top", paraSpaceAfter: 7 },
  );

  // 4. Cierre
  const cierre = pptx.addSlide();
  cierre.background = { path: `${base}bg_3d.jpg` };
  logo(cierre, true);
  cierre.addText("Proyección con datos reales", { x: MARGEN, y: 3.0, w: 11, h: 0.9, fontFace: FUENTE, fontSize: 34, bold: true, color: "FFFFFF" });
  cierre.addText(c.nota, { x: MARGEN, y: 4.0, w: 11, h: 0.6, fontFace: FUENTE, fontSize: 13.5, color: GRIS_CLARO, valign: "top" });
}

/* -------------------------------------------------------------------------- */
/* MGC · 10 × 5,625 in                                                        */
/* -------------------------------------------------------------------------- */

function construirMgc(pptx: Pptx, c: Contenido, cliente: string) {
  pptx.defineLayout({ name: "MGC", width: 10, height: 5.625 });
  pptx.layout = "MGC";
  const FUENTE = "Helvetica Neue";
  const ROJO = "F9063B";
  const GRIS_TEXTO = "898F9C";
  const GRIS_FILA = "F3F3F3";
  const GRIS_BORDE = "D9D9D9";
  const MARGEN = 0.5;
  const base = "/deck/mgc/";

  /** Cabecera de la firma MGC: barra roja vertical + título + subtítulo en versalitas grises. */
  const cabecera = (s: ReturnType<Pptx["addSlide"]>, titulo: string, subtitulo: string) => {
    s.addShape("rect", { x: MARGEN, y: 0.3, w: 0.028, h: 0.5, fill: { color: ROJO }, line: { color: ROJO, width: 0 } });
    s.addText(titulo, { x: MARGEN + 0.14, y: 0.26, w: 8, h: 0.4, fontFace: FUENTE, fontSize: 19, bold: true, color: "000000", valign: "middle" });
    s.addText(subtitulo.toUpperCase(), { x: MARGEN + 0.14, y: 0.64, w: 8, h: 0.22, fontFace: FUENTE, fontSize: 8.5, color: GRIS_TEXTO, charSpacing: 0.6 });
  };

  // 1. Portada (el fondo trae el omega rojo y el logo: texto a la izquierda, fuera de la forma)
  const portada = pptx.addSlide();
  portada.background = { path: `${base}bg01_portada.png` };
  portada.addText("Simulación de campaña", { x: MARGEN, y: 1.5, w: 4.6, h: 0.5, fontFace: FUENTE, fontSize: 24, bold: true, color: "000000" });
  portada.addText(cliente, { x: MARGEN, y: 2.05, w: 4.6, h: 0.4, fontFace: FUENTE, fontSize: 13, bold: true, color: ROJO });
  portada.addText(
    c.detallesPortada.map((l) => ({ text: l, options: { breakLine: true } })),
    { x: MARGEN, y: 2.6, w: 4.6, h: 1.4, fontFace: FUENTE, fontSize: 10, color: "000000", valign: "top", paraSpaceAfter: 4 },
  );

  // 2. Lo que podría dar (fondo de tablas y datos)
  const datos = pptx.addSlide();
  datos.background = { path: `${base}bg11.jpg` };
  cabecera(datos, "Lo que podría dar", "Proyección con el historial real del cliente");
  const anchoTarjeta = (10 - MARGEN * 2 - 0.15 * 3) / 4;
  c.tarjetas.forEach(([titulo, valor], i) => {
    const x = MARGEN + i * (anchoTarjeta + 0.15);
    datos.addShape("roundRect", { x, y: 1.1, w: anchoTarjeta, h: 0.85, fill: { color: "FFFFFF" }, line: { color: GRIS_BORDE, width: 1 }, rectRadius: 0.1 });
    datos.addText(titulo, { x: x + 0.14, y: 1.15, w: anchoTarjeta - 0.25, h: 0.22, fontFace: FUENTE, fontSize: 9, color: GRIS_TEXTO });
    const size = valor.length > 16 ? 12 : valor.length > 11 ? 15 : 20;
    datos.addText(valor, { x: x + 0.14, y: 1.4, w: anchoTarjeta - 0.25, h: 0.45, fontFace: FUENTE, fontSize: size, bold: true, color: "000000", valign: "top" });
  });
  const filasVisibles = c.filas.slice(0, 7); // regla MGC: tabla de 7 filas como máximo
  datos.addTable(
    [
      c.cabecera.map((t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: ROJO } } })),
      ...filasVisibles.map((fila, i) =>
        fila.map((t, j) => ({ text: t, options: { color: "000000", bold: j === 0, fill: { color: i % 2 === 0 ? "FFFFFF" : GRIS_FILA } } })),
      ),
    ],
    { x: MARGEN, y: 2.15, w: 10 - MARGEN * 2, colW: [2.6, 1.3, 1.4, 0.9, 1.9, 0.9], fontFace: FUENTE, fontSize: 9, border: { type: "solid", color: GRIS_BORDE, pt: 0.75 }, rowH: 0.27 },
  );
  if (c.filas.length > filasVisibles.length) {
    datos.addText(`Se muestran ${filasVisibles.length} de ${c.filas.length} canales; el resto sumó el total.`, {
      x: MARGEN, y: 4.85, w: 8, h: 0.22, fontFace: FUENTE, fontSize: 8, color: GRIS_TEXTO,
    });
  }

  // 3. Supuestos y advertencias (fondo de texto)
  const sup = pptx.addSlide();
  sup.background = { path: `${base}bg06.jpg` };
  cabecera(sup, "Supuestos y advertencias", "Cómo se calculó y qué cuidar");
  const alto = 5.0 - 1.2;
  const size = tamanoQueCabe(c.supuestos, 8.9, alto, 10, 8, 1.32, 0.06);
  sup.addText(
    c.supuestos.map((t) => ({ text: t, options: { bullet: { code: "25CF", color: ROJO }, breakLine: true } })),
    { x: MARGEN, y: 1.2, w: 9, h: alto, fontFace: FUENTE, fontSize: size, color: "000000", valign: "top", paraSpaceAfter: 4 },
  );

  // 4. Cierre
  const cierre = pptx.addSlide();
  cierre.background = { path: `${base}bg13_cierre.png` };
}
