"use client";

import { PresupuestoEnLinea, usePresupuesto } from "./presupuesto-mes";
import { fetchConReintento } from "@/lib/fetch-reintento";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileUp, FlaskConical, Info } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { AYUDA_DE_CANAL, canalesActivos, claveDeCanal, etiquetaDeCanal } from "@/lib/canales";
import {
  avancePorSemana,
  escenarios as calcularEscenarios,
  interpretarBrief,
  recomendarReparto,
  sumarDias,
  type RazonDeReparto,
} from "@/lib/estrategia";
import { OBJETIVO_LABELS, OBJETIVOS, type Objetivo } from "@/lib/objetivos";
import {
  ajustarAMinimosPorPlataforma,
  minimoDelCanalMicros,
  proyectar,
  reequilibrar,
  type Confianza,
  type Historial,
  type PlanSimulado,
  type ProyeccionPlataforma,
} from "@/lib/simulador";
import { cn } from "@/lib/utils";
import { Surface } from "./ui";

type Respuesta = {
  cliente: { id: string; nombre: string; kpiPrincipal: string | null };
  historial: Historial | null;
  presupuestoMensual: { micros: number; moneda: string } | null;
};

const KPI_A_OBJETIVO: Record<string, string> = { leads: "LDS", ventas: "VTA", trafico: "TRF", alcance: "AE", mensajes: "OCV" };
const NOMBRE_PLATAFORMA: Record<string, string> = {
  google: "Google Ads",
  meta: "Meta Ads",
  tiktok: "TikTok Ads",
  linkedin: "LinkedIn Ads",
};

type EntradaDeReparto = {
  clave: string;
  provider: string;
  canal: string | null;
  etiqueta: string;
  /** Gasto histórico de este canal en el objetivo elegido; 0 si nunca se usó. */
  gastoMicros: number;
};
/** Monedas que se pueden usar para escribir el monto; la proyección siempre se calcula en la del historial. */
const MONEDAS_COMUNES = ["CLP", "USD", "EUR", "MXN", "COP", "PEN", "ARS", "BRL", "UYU"];

/** Límites razonables: más que esto no es una simulación, es un error de tecleo. */
const MAX_DIGITOS_MONTO = 12;
const MAX_DIAS = 365;
const MAX_CAMPANAS = 50;

/** yyyy-mm-dd más `n` días (en UTC, sin sorpresas de horario de verano). */
function fechaMasDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return fecha;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const fechaCorta = (fecha: string) => {
  const [a, m, d] = fecha.split("-");
  return d && m && a ? `${d}-${m}-${a}` : fecha;
};

/** Solo dígitos: cualquier otro carácter que se escriba o pegue se descarta. */
const soloDigitos = (texto: string) => texto.replace(/\D/g, "");
/** Número con un único separador decimal (punto o coma), para el tipo de cambio. */
function soloDecimal(texto: string): string {
  const limpio = texto.replace(/[^\d.,]/g, "");
  const i = limpio.search(/[.,]/);
  return i === -1 ? limpio : limpio.slice(0, i + 1) + limpio.slice(i + 1).replace(/[.,]/g, "");
}
const CONFIANZA: Record<Confianza, { etiqueta: string; clase: string }> = {
  alta: { etiqueta: "Confianza alta", clase: "border-ok/40 bg-ok/10 text-ok" },
  media: { etiqueta: "Confianza media", clase: "border-warn/40 bg-warn/10 text-warn" },
  baja: { etiqueta: "Confianza baja", clase: "border-danger/40 bg-danger/10 text-danger" },
  sin_historial: { etiqueta: "Sin historial", clase: "border-foreground/25 bg-foreground/6 text-foreground/60" },
};

function dinero(micros: number, moneda: string): string {
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(
      micros / 1_000_000,
    );
  } catch {
    return `${moneda} ${Math.round(micros / 1_000_000).toLocaleString("es-CL")}`;
  }
}

const MAX_BYTES_BRIEF = 2 * 1024 * 1024;
const MAX_CARACTERES_BRIEF = 6000;

/** Texto de un archivo de brief: txt, md y csv tal cual; docx (su document.xml) y xlsx (primera hoja) leídos en el navegador. */
async function textoDelArchivo(file: File): Promise<string> {
  const nombre = file.name.toLowerCase();
  if (file.size > MAX_BYTES_BRIEF) throw new Error("El archivo pesa más de 2 MB; pega solo lo importante del brief.");
  if (/\.(txt|md|csv|json|rtf)$/.test(nombre) || file.type.startsWith("text/")) return await file.text();
  if (nombre.endsWith(".docx")) {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) throw new Error("No pude leer el documento de Word.");
    return xml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:tab\/>/g, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
  if (nombre.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/web-worker");
    const filas = await readSheet(file);
    return filas.map((fila) => fila.map((c) => (c === null || c === undefined ? "" : String(c))).filter(Boolean).join(" ")).join("\n");
  }
  if (nombre.endsWith(".pdf") || nombre.endsWith(".doc") || nombre.endsWith(".xls")) {
    throw new Error("Ese formato no se puede leer aquí: guárdalo como .docx, .xlsx o .txt, o pega el texto.");
  }
  throw new Error("Formato no admitido. Usa .txt, .md, .csv, .docx o .xlsx.");
}

const entero = (n: number | null) => (n === null ? "—" : Math.round(n).toLocaleString("es-CL"));
const rango = (r: { bajo: number; alto: number } | null) =>
  r === null ? "—" : `${Math.round(r.bajo).toLocaleString("es-CL")} – ${Math.round(r.alto).toLocaleString("es-CL")}`;

/**
 * Simulador: con un monto, un objetivo y un reparto entre plataformas, proyecta
 * qué podría dar según lo que ese cliente rindió en los últimos 90 días. No
 * escribe nada en ninguna plataforma y no promete resultados: da un rango y
 * dice cuánta confianza hay detrás.
 */
export function SimuladorView({ clienteId }: { clienteId: string | null }) {
  const [respuesta, setRespuesta] = useState<{ clave: string; datos: Respuesta | null; error: string | null } | null>(null);
  const [monto, setMonto] = useState("");
  // Moneda en la que se escribe el monto (`null` = la del historial) y su tipo de cambio a esa moneda.
  const [monedaEntrada, setMonedaEntrada] = useState<string | null>(null);
  const [cambio, setCambio] = useState("");
  // Tipo de cambio en vivo (se pide solo al elegir otra moneda); lo escrito a mano tiene prioridad.
  const [vivo, setVivo] = useState<{ de: string; a: string; tasa: number; aPorUsd: number; fuente: string } | null>(null);
  // El reparto se puede escribir en porcentaje o en dinero.
  const [modoReparto, setModoReparto] = useState<"pct" | "monto">("pct");
  const [dias, setDias] = useState("30");
  // El brief (la idea o el pedido de alguien) y lo que el sistema entendió y recomendó a partir de él.
  const [brief, setBrief] = useState("");
  const [notasDelBrief, setNotasDelBrief] = useState<string[]>([]);
  const archivoBrief = useRef<HTMLInputElement>(null);
  const [leyendoBrief, setLeyendoBrief] = useState(false);
  const [recomendacion, setRecomendacion] = useState<{ razones: RazonDeReparto[]; avisos: string[] } | null>(null);
  // Desde cuándo corre: con los días da la fecha de término.
  const [inicio, setInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [campanas, setCampanas] = useState("2");
  // `null` = usar el objetivo y el reparto sugeridos por el historial.
  const [objetivoElegido, setObjetivoElegido] = useState<string | null>(null);
  // Porcentaje por canal que la persona escribió; `null` = el reparto histórico del cliente.
  const [pesos, setPesos] = useState<Record<string, number> | null>(null);
  const [exportando, setExportando] = useState(false);
  // Estilo de la presentación: los dos diseños oficiales (WiWO y MGC).
  const [tema, setTema] = useState<"wiwo" | "mgc">("wiwo");

  useEffect(() => {
    if (!clienteId) return;
    const control = new AbortController();
    fetchConReintento(`/api/simulador?cliente=${encodeURIComponent(clienteId)}`, { signal: control.signal, cache: "no-store" }, 3, 45_000)
      .then(async (r) => {
        const cuerpo = await r.json().catch(() => null);
        if (!r.ok) throw new Error(cuerpo?.error ?? "No se pudo leer el historial del cliente");
        setRespuesta({ clave: clienteId, datos: cuerpo as Respuesta, error: null });
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setRespuesta({ clave: clienteId, datos: null, error: e instanceof Error ? e.message : "Error al leer el historial" });
      });
    return () => control.abort();
  }, [clienteId]);

  const monedaHistorial = respuesta?.datos?.historial?.moneda ?? respuesta?.datos?.presupuestoMensual?.moneda ?? "CLP";
  const monedaParaCambio = monedaEntrada ?? monedaHistorial;
  useEffect(() => {
    const control = new AbortController();
    fetchConReintento(`/api/cambio?de=${monedaParaCambio}&a=${monedaHistorial}`, { signal: control.signal, cache: "no-store" }, 2, 12_000)
      .then(async (r) => (r.ok ? await r.json() : null))
      .then((c) => {
        if (c && typeof c.tasa === "number") setVivo({ de: c.de, a: c.a, tasa: c.tasa, aPorUsd: c.aPorUsd, fuente: c.fuente });
      })
      .catch(() => {
        /* sin tasa en vivo se usa la de referencia para los mínimos y se pide escribir el cambio si hace falta */
      });
    return () => control.abort();
  }, [monedaParaCambio, monedaHistorial]);

  const vigente = respuesta && respuesta.clave === clienteId ? respuesta : null;
  const datos = vigente?.datos ?? null;
  const historial = datos?.historial ?? null;
  const cargando = Boolean(clienteId) && vigente === null;

  // Objetivos con historial, del que más se invirtió al que menos.
  const objetivosDisponibles = useMemo(() => {
    const gasto = new Map<string, number>();
    for (const f of historial?.filas ?? []) gasto.set(f.objetivo, (gasto.get(f.objetivo) ?? 0) + f.gastoMicros);
    return [...gasto.entries()].sort((a, b) => b[1] - a[1]).map(([o]) => o);
  }, [historial]);

  const objetivoSugerido =
    (datos?.cliente.kpiPrincipal && KPI_A_OBJETIVO[datos.cliente.kpiPrincipal] && objetivosDisponibles.includes(KPI_A_OBJETIVO[datos.cliente.kpiPrincipal])
      ? KPI_A_OBJETIVO[datos.cliente.kpiPrincipal]
      : objetivosDisponibles[0]) ?? "";
  // Se puede elegir cualquiera de los cinco objetivos; los que el cliente nunca usó avisan que no hay con qué proyectar.
  const objetivosTodos = useMemo(
    () => [...objetivosDisponibles, ...OBJETIVOS.filter((o) => !objetivosDisponibles.includes(o))] as string[],
    [objetivosDisponibles],
  );
  const objetivo = objetivoElegido && objetivosTodos.includes(objetivoElegido) ? objetivoElegido : objetivoSugerido;
  const sinHistorialDelObjetivo = historial !== null && objetivo !== "" && !objetivosDisponibles.includes(objetivo);

  // Los canales que se pueden repartir: los de las plataformas activas (hoy Meta y Google; TikTok y
  // LinkedIn aparecen solos cuando se activen). Donde el cliente ya invirtió, con su peso histórico.
  const entradas = useMemo<EntradaDeReparto[]>(() => {
    const filas = (historial?.filas ?? []).filter((f) => f.objetivo === objetivo);
    return canalesActivos().flatMap(({ provider, canales }): EntradaDeReparto[] => {
      const deLaPlataforma = filas.filter((f) => f.provider === provider);
      const hayPorCanal = deLaPlataforma.some((f) => f.canal);
      if (!hayPorCanal) {
        // Sin lectura por canal: se reparte la plataforma entera (si el cliente la usó).
        const total = deLaPlataforma.find((f) => !f.canal)?.gastoMicros ?? 0;
        return [{ clave: claveDeCanal(provider, null), provider, canal: null, etiqueta: etiquetaDeCanal(provider, null), gastoMicros: total }];
      }
      return canales.map((c) => ({
        clave: claveDeCanal(provider, c.id),
        provider,
        canal: c.id,
        etiqueta: c.etiqueta,
        gastoMicros: deLaPlataforma.find((f) => f.canal === c.id)?.gastoMicros ?? 0,
      }));
    });
  }, [historial, objetivo]);

  const moneda = historial?.moneda ?? datos?.presupuestoMensual?.moneda ?? "CLP";
  // Lo que sobra del presupuesto mensual del cliente: una forma rápida de simular «con lo que queda».
  const presupuestoLeido = usePresupuesto(clienteId ?? "");
  const sobraDelMes =
    presupuestoLeido?.presupuesto && presupuestoLeido.moneda === moneda ? Math.max(0, presupuestoLeido.presupuesto.restanteMicros) : null;
  const monedaDelMonto = monedaEntrada ?? moneda;
  const otraMoneda = monedaDelMonto !== moneda;
  const tasaAuto = vivo && vivo.de === monedaDelMonto && vivo.a === moneda ? vivo.tasa : null;
  const tasa = otraMoneda ? (cambio.trim() !== "" ? Number(cambio.replace(",", ".")) : (tasaAuto ?? NaN)) : 1;
  // Unidades de la moneda del historial por dólar, para los mínimos (que se fijan en dólares).
  const aPorUsd = vivo && vivo.a === moneda ? vivo.aPorUsd : null;
  const montoEscrito = Number(monto) || 0;
  // Todo el cálculo va en la moneda del historial; el tipo de cambio solo convierte el monto escrito.
  const montoNumero = montoEscrito * (Number.isFinite(tasa) ? tasa : 0);
  const diasNumero = Math.min(MAX_DIAS, Math.max(1, Math.round(Number(dias) || 0)));
  const campanasNumero = Math.min(MAX_CAMPANAS, Math.max(1, Math.round(Number(campanas) || 0)));
  const fechaFin = fechaMasDias(inicio, diasNumero - 1);

  const pesosHistoricos = useMemo(() => {
    const total = entradas.reduce((suma, e) => suma + e.gastoMicros, 0);
    const mapa: Record<string, number> = {};
    for (const e of entradas) mapa[e.clave] = total > 0 ? (e.gastoMicros / total) * 100 : 0;
    return mapa;
  }, [entradas]);

  // El mínimo es de la PLATAFORMA (su conjunto de anuncios × campañas), no de cada ubicación: Facebook e Instagram
  // comparten el presupuesto de un mismo conjunto. Depende del objetivo, la moneda, los días y la cantidad de campañas.
  const plataformaDe = useMemo(() => Object.fromEntries(entradas.map((e) => [e.clave, e.provider])), [entradas]);
  const minimos = useMemo(() => {
    const micros: Record<string, number | null> = {};
    const pct: Record<string, number> = {};
    for (const e of entradas) {
      if (e.provider in micros) continue;
      const m = minimoDelCanalMicros(e.provider, moneda, diasNumero, objetivo, campanasNumero, aPorUsd);
      micros[e.provider] = m;
      pct[e.provider] = m !== null && montoNumero > 0 ? (m / (montoNumero * 1_000_000)) * 100 : 0;
    }
    return { micros, pct };
  }, [entradas, moneda, diasNumero, objetivo, campanasNumero, aPorUsd, montoNumero]);
  const sumaDePlataforma = (reparto: Record<string, number>, provider: string) =>
    entradas.reduce((suma, e) => (e.provider === provider ? suma + (reparto[e.clave] ?? 0) : suma), 0);

  // Sin plataformas bajo su mínimo: lo que queda corto pasa a 0 y su parte va a las que sí alcanzan.
  const pesosActuales = useMemo(
    () => pesos ?? ajustarAMinimosPorPlataforma(pesosHistoricos, plataformaDe, minimos.pct),
    [pesos, pesosHistoricos, plataformaDe, minimos.pct],
  );
  const proveedoresQueAlcanzan = useMemo(() => {
    const suma = (p: string) => entradas.reduce((acc, e) => (e.provider === p ? acc + (pesosActuales[e.clave] ?? 0) : acc), 0);
    return new Set([...new Set(entradas.map((e) => e.provider))].filter((p) => suma(p) + 1e-9 >= (minimos.pct[p] ?? 0)));
  }, [entradas, pesosActuales, minimos.pct]);
  const alcanzaElMinimo = (clave: string) => proveedoresQueAlcanzan.has(plataformaDe[clave]);
  // Plataformas con algo asignado pero bajo su mínimo (lo escribió la persona): se avisan y no se proyectan.
  const proveedoresBajoMinimo = [...new Set(entradas.map((e) => e.provider))].filter(
    (p) => sumaDePlataforma(pesosActuales, p) > 1e-9 && sumaDePlataforma(pesosActuales, p) + 1e-9 < (minimos.pct[p] ?? 0),
  );
  const bajoMinimo = entradas.filter((e) => proveedoresBajoMinimo.includes(e.provider) && (pesosActuales[e.clave] ?? 0) > 1e-9);
  const sumaValida = entradas.reduce(
    (suma, e) => suma + ((pesosActuales[e.clave] ?? 0) > 1e-9 && alcanzaElMinimo(e.clave) ? (pesosActuales[e.clave] ?? 0) : 0),
    0,
  );

  function repartirParejo() {
    // Parejo entre los canales donde el cliente ya invirtió (los demás no tienen con qué proyectar).
    const conHistorial = entradas.filter((e) => e.gastoMicros > 0);
    const base = conHistorial.length > 0 ? conHistorial : entradas;
    const mapa: Record<string, number> = {};
    for (const e of entradas) mapa[e.clave] = base.includes(e) ? 100 / base.length : 0;
    setPesos(ajustarAMinimosPorPlataforma(mapa, plataformaDe, minimos.pct));
  }

  const valido =
    Number.isFinite(montoNumero) && montoNumero > 0 && diasNumero > 0 && historial !== null && objetivo !== "" && sumaValida > 0;

  // Al mover un canal, los demás se ajustan para que el total siga en 100 % y ninguno quede bajo su mínimo.
  function cambiarPeso(clave: string, porcentaje: number) {
    setRecomendacion(null);
    setPesos(
      ajustarAMinimosPorPlataforma(
        reequilibrar(
          pesosActuales,
          clave,
          porcentaje,
          entradas.filter((e) => e.gastoMicros > 0).map((e) => e.clave),
        ),
        plataformaDe,
        minimos.pct,
        plataformaDe[clave],
      ),
    );
  }

  /** Recomienda el reparto con lo que el cliente rindió antes y lo deja puesto en los porcentajes. */
  function recomendar(montoMicros: number, diasPlan: number, objetivoPlan: string) {
    if (!historial || !(montoMicros > 0)) return;
    const r = recomendarReparto(historial, { montoMicros, dias: diasPlan, objetivo: objetivoPlan, campanas: campanasNumero, tasaPorUsd: aPorUsd });
    const mapa: Record<string, number> = {};
    for (const e of entradas) mapa[e.clave] = 0;
    for (const x of r.reparto) mapa[claveDeCanal(x.provider, x.canal)] = x.fraccion * 100;
    setPesos(r.reparto.length > 0 ? mapa : null);
    setRecomendacion({ razones: r.razones, avisos: r.avisos });
  }

  async function cargarArchivoDeBrief(file: File | undefined) {
    if (!file) return;
    setLeyendoBrief(true);
    try {
      const texto = (await textoDelArchivo(file)).replace(/[ \t]+/g, " ").trim();
      if (!texto) throw new Error("El archivo no tiene texto.");
      setBrief(texto.slice(0, MAX_CARACTERES_BRIEF));
      setNotasDelBrief(
        texto.length > MAX_CARACTERES_BRIEF ? [`Se leyeron los primeros ${MAX_CARACTERES_BRIEF.toLocaleString("es-CL")} caracteres del archivo.`] : [],
      );
      toast.success(`Brief cargado desde ${file.name}. Revísalo y pulsa «Interpretar y recomendar».`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo leer el archivo");
    } finally {
      setLeyendoBrief(false);
      if (archivoBrief.current) archivoBrief.current.value = "";
    }
  }

  /** Lee el brief, completa el formulario con lo que entiende y recomienda el reparto. */
  function interpretar() {
    const b = interpretarBrief(brief, new Date());
    const notas: string[] = [...b.pistas];
    let objetivoFinal = objetivo;
    if (b.objetivo) {
      if (objetivosTodos.includes(b.objetivo) && objetivosDisponibles.includes(b.objetivo)) {
        objetivoFinal = b.objetivo;
        setObjetivoElegido(b.objetivo);
      } else {
        notas.push(
          `El brief apunta a «${OBJETIVO_LABELS[b.objetivo as Objetivo] ?? b.objetivo}», pero este cliente no tiene historial en ese objetivo: se usa «${OBJETIVO_LABELS[objetivo as Objetivo] ?? objetivo}».`,
        );
      }
    }
    let montoPlan = montoNumero * 1_000_000;
    if (b.montoMicros) {
      if (!b.moneda || b.moneda === moneda) {
        setMonedaEntrada(null);
        setMonto(String(Math.round(b.montoMicros / 1_000_000)));
        montoPlan = b.montoMicros;
      } else {
        // Otra moneda: sin tipo de cambio no se puede proyectar; se deja puesta y se pide.
        setMonedaEntrada(b.moneda);
        setMonto(String(Math.round(b.montoMicros / 1_000_000)));
        notas.push(`El brief habla de ${b.moneda} y el historial es en ${moneda}: escribe el tipo de cambio para proyectar.`);
        montoPlan = 0;
      }
    } else if (!(montoPlan > 0)) {
      notas.push("El brief no dice cuánto se invertirá: escribe el monto para recomendar el reparto.");
    }
    let diasPlan = diasNumero;
    if (b.dias) {
      diasPlan = Math.min(MAX_DIAS, b.dias);
      setDias(String(diasPlan));
    }
    if (b.inicio) setInicio(b.inicio);
    if (notas.length === 0) notas.push("No encontré objetivo, monto ni fechas en el brief: complétalos a mano.");
    setNotasDelBrief(notas);
    if (montoPlan > 0) recomendar(montoPlan, diasPlan, objetivoFinal);
  }

  const plan: PlanSimulado | null = useMemo(
    () =>
      valido
        ? {
            montoMicros: montoNumero * 1_000_000,
            dias: diasNumero,
            objetivo,
            // Solo los canales que alcanzan su mínimo, normalizados a 100.
            reparto: entradas
              .filter((e) => (pesosActuales[e.clave] ?? 0) > 1e-9 && proveedoresQueAlcanzan.has(e.provider))
              .map((e) => ({ provider: e.provider, canal: e.canal, fraccion: (pesosActuales[e.clave] ?? 0) / sumaValida })),
            campanas: campanasNumero,
          }
        : null,
    [valido, montoNumero, diasNumero, objetivo, entradas, pesosActuales, sumaValida, campanasNumero, proveedoresQueAlcanzan],
  );
  const proyeccion = useMemo(() => (plan && historial ? proyectar(plan, historial) : null), [plan, historial]);

  async function exportar() {
    if (!plan || !proyeccion || !historial || !datos) return;
    setExportando(true);
    try {
      const { exportarPresentacion } = await import("./exportar-simulacion");
      await exportarPresentacion({
        cliente: datos.cliente.nombre,
        objetivo: OBJETIVO_LABELS[objetivo as Objetivo] ?? objetivo,
        moneda,
        diasDeHistorial: historial.dias,
        plan,
        proyeccion,
      }, tema);
      toast.success("Presentación descargada. Súbela a Drive y ábrela con Presentaciones de Google.");
    } catch (error) {
      console.error("WiWO.ADS exportar simulación", error);
      toast.error("No se pudo generar la presentación");
    } finally {
      setExportando(false);
    }
  }

  if (!clienteId) {
    return (
      <div className="mx-auto w-full max-w-[1100px] p-4 md:p-6">
        <h2 className="neo-section-title">Simulador de campañas</h2>
        <p className="mt-3 text-sm text-foreground/60">Elige un cliente en la barra superior para simular con su historial.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] p-4 md:p-6">
      <div className="mb-5">
        <h2 className="neo-section-title">Simula antes de invertir</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/58">
          Con un monto y un objetivo, proyecta qué podría dar según lo que {datos?.cliente.nombre ?? "este cliente"} rindió en los
          últimos 90 días. Es una proyección con rango, no una promesa. No crea ni cambia nada en ninguna plataforma.
        </p>
      </div>

      {clienteId && <PresupuestoEnLinea portfolioId={clienteId} className="mb-4" />}

      {cargando && <p className="text-sm text-foreground/50">Leyendo el historial del cliente…</p>}
      {vigente?.error && <p className="rounded-xl border border-danger/25 bg-danger/8 p-3 text-sm text-danger">{vigente.error}</p>}
      {vigente && !vigente.error && !historial && (
        <Surface className="p-5 text-sm text-foreground/65">
          Este cliente no tiene gasto en los últimos 90 días: no hay historial con el que proyectar.
        </Surface>
      )}

      {historial && (
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Surface className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <FlaskConical className="size-4 text-brand" />
              <h3 className="text-sm font-bold">Tu simulación</h3>
            </div>

            <div className="space-y-1.5 rounded-xl border border-brand/25 bg-brand/5 p-3">
              <span className="text-xs font-semibold text-foreground/70">Brief o idea (opcional)</span>
              <Textarea
                rows={3}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Ej: campaña de leads con $200.000 hasta mitad de octubre para el nuevo proyecto…"
                className="bg-field/60 text-xs"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={interpretar} disabled={!brief.trim() || !historial}>
                  <FlaskConical /> Interpretar y recomendar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => archivoBrief.current?.click()}
                  disabled={leyendoBrief}
                >
                  <FileUp /> {leyendoBrief ? "Leyendo…" : "Cargar archivo"}
                </Button>
                <input
                  ref={archivoBrief}
                  type="file"
                  accept=".txt,.md,.csv,.json,.docx,.xlsx"
                  className="hidden"
                  onChange={(e) => void cargarArchivoDeBrief(e.target.files?.[0])}
                />
                {valido && (
                  <button
                    type="button"
                    onClick={() => recomendar(montoNumero * 1_000_000, diasNumero, objetivo)}
                    className="text-xs text-brand hover:underline"
                  >
                    Recomendar el reparto con estos datos
                  </button>
                )}
              </div>
              {notasDelBrief.length > 0 && (
                <ul className="space-y-0.5 text-[0.7rem] leading-4 text-foreground/60">
                  {notasDelBrief.map((n) => (
                    <li key={n}>· {n}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold text-foreground/60">Monto a invertir</span>
              <div className="flex gap-2">
                <NativeSelect
                  aria-label="Moneda del monto"
                  value={monedaDelMonto}
                  onChange={(e) => setMonedaEntrada(e.target.value === moneda ? null : e.target.value)}
                  className="w-24 shrink-0"
                >
                  {[moneda, ...MONEDAS_COMUNES.filter((m) => m !== moneda)].map((m) => (
                    <NativeSelectOption key={m} value={m}>
                      {m}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Input
                  inputMode="numeric"
                  aria-label="Monto a invertir"
                  value={monto === "" ? "" : Number(monto).toLocaleString("es-CL")}
                  onChange={(e) => setMonto(soloDigitos(e.target.value).replace(/^0+(?=\d)/, "").slice(0, MAX_DIGITOS_MONTO))}
                  placeholder={datos?.presupuestoMensual ? String(Math.round(datos.presupuestoMensual.micros / 1_000_000)) : "Ej: 1000000"}
                />
              </div>
              {otraMoneda && (
                <div className="flex items-center gap-2 text-[0.72rem] text-foreground/60">
                  <span className="shrink-0">1 {monedaDelMonto} =</span>
                  <Input
                    inputMode="decimal"
                    aria-label={`Cuántos ${moneda} vale 1 ${monedaDelMonto}`}
                    value={cambio}
                    onChange={(e) => setCambio(soloDecimal(e.target.value))}
                    placeholder={tasaAuto !== null ? String(Math.round(tasaAuto * 10000) / 10000) : "tipo de cambio"}
                    className="h-8 w-28 px-2 text-right"
                  />
                  <span className="shrink-0">{moneda}</span>
                  {cambio.trim() !== "" ? (
                    <button type="button" onClick={() => setCambio("")} className="shrink-0 text-brand hover:underline">
                      Usar el automático
                    </button>
                  ) : tasaAuto !== null ? (
                    <span className="shrink-0 text-foreground/40">{vivo?.fuente === "en_vivo" ? "automático" : "referencia"}</span>
                  ) : null}
                </div>
              )}
              {otraMoneda && montoNumero > 0 && (
                <p className="text-[0.7rem] text-foreground/45">Se proyecta con {dinero(montoNumero * 1_000_000, moneda)}, la moneda del historial.</p>
              )}
              {otraMoneda && !(tasa > 0) && (
                <p className="text-[0.7rem] text-warn">No pude leer el tipo de cambio: escríbelo para proyectar.</p>
              )}
              {sobraDelMes !== null && sobraDelMes > 0 && !otraMoneda && (
                <button
                  type="button"
                  onClick={() => setMonto(String(Math.floor(sobraDelMes / 1_000_000)))}
                  className="block text-[0.7rem] text-brand hover:underline"
                >
                  Usar lo que sobra del mes ({dinero(sobraDelMes, moneda)})
                </button>
              )}
              {datos?.presupuestoMensual && datos.presupuestoMensual.moneda === moneda && !otraMoneda && (
                <button
                  type="button"
                  onClick={() => setMonto(String(Math.round((datos.presupuestoMensual?.micros ?? 0) / 1_000_000)))}
                  className="block text-[0.7rem] text-brand hover:underline"
                >
                  Usar el presupuesto mensual ({dinero(datos.presupuestoMensual.micros, moneda)})
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-foreground/60">Duración (días)</span>
                <Input
                  inputMode="numeric"
                  value={dias}
                  onChange={(e) => setDias(String(Math.min(MAX_DIAS, Number(soloDigitos(e.target.value).slice(0, 3)) || 0) || ""))}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-foreground/60">Campañas</span>
                <Input
                  inputMode="numeric"
                  value={campanas}
                  onChange={(e) => setCampanas(String(Math.min(MAX_CAMPANAS, Number(soloDigitos(e.target.value).slice(0, 2)) || 0) || ""))}
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-foreground/60">Inicio</span>
              <Input type="date" value={inicio} onChange={(e) => e.target.value && setInicio(e.target.value)} />
              <span className="block text-[0.7rem] text-foreground/45">
                Del {fechaCorta(inicio)} al {fechaCorta(fechaFin)} · {diasNumero} {diasNumero === 1 ? "día" : "días"}
              </span>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-foreground/60">Objetivo</span>
              <NativeSelect
                value={objetivo}
                onChange={(e) => {
                  setObjetivoElegido(e.target.value);
                  setPesos(null);
                }}
              >
                {objetivosTodos.map((o) => (
                  <NativeSelectOption key={o} value={o}>
                    {OBJETIVO_LABELS[o as Objetivo] ?? o}
                    {objetivosDisponibles.includes(o) ? "" : " · sin historial"}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <span className="block text-[0.7rem] leading-4 text-foreground/40">
                {sinHistorialDelObjetivo
                  ? "Este cliente nunca invirtió en este objetivo: no hay con qué proyectar. Elige uno con historial."
                  : "Los objetivos con historial van primero; la proyección sale de lo que el cliente rindió en ellos."}
              </span>
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground/60">Reparto por plataforma y canal</span>
                <span className="flex overflow-hidden rounded-full border border-foreground/15 text-[0.68rem] font-bold" role="group" aria-label="Repartir en">
                  {([["pct", "%"], ["monto", "Monto"]] as const).map(([modo, texto]) => (
                    <button
                      key={modo}
                      type="button"
                      onClick={() => setModoReparto(modo)}
                      aria-pressed={modoReparto === modo}
                      className={cn("px-2.5 py-1", modoReparto === modo ? "bg-brand text-white" : "text-foreground/60 hover:text-foreground")}
                    >
                      {texto}
                    </button>
                  ))}
                </span>
              </div>
              {canalesActivos().map(({ provider }) => {
                const delProveedor = entradas.filter((e) => e.provider === provider);
                const subtotal = delProveedor.reduce((suma, e) => suma + (pesosActuales[e.clave] ?? 0), 0);
                return (
                  <div key={provider} className="rounded-lg border border-foreground/10 p-2.5">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-bold text-foreground">{NOMBRE_PLATAFORMA[provider] ?? provider}</span>
                      <span className="metric-number text-foreground/55">{Math.round(subtotal)} %</span>
                    </div>
                    {minimos.micros[provider] !== null && minimos.micros[provider] !== undefined && (
                      <p
                        className={cn(
                          "mb-1.5 text-[0.62rem] leading-4",
                          proveedoresBajoMinimo.includes(provider) ? "font-semibold text-warn" : "text-foreground/40",
                        )}
                      >
                        Mínimo de {NOMBRE_PLATAFORMA[provider] ?? provider}: {dinero(minimos.micros[provider] as number, moneda)} para {diasNumero}{" "}
                        {diasNumero === 1 ? "día" : "días"} y {campanasNumero} {campanasNumero === 1 ? "campaña" : "campañas"}, en total para todos
                        sus canales.
                      </p>
                    )}
                    <ul className="space-y-1.5">
                      {delProveedor.map((e) => (
                        <li key={e.clave} className="flex items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate text-foreground/80">
                            <span title={AYUDA_DE_CANAL[e.canal ?? ""]} className={AYUDA_DE_CANAL[e.canal ?? ""] ? "cursor-help underline decoration-dotted underline-offset-2" : undefined}>
                              {e.etiqueta}
                            </span>
                            {e.gastoMicros === 0 && <span className="ml-1.5 text-[0.62rem] text-foreground/35">sin historial</span>}
                          </span>
                          {modoReparto === "pct" ? (
                            <>
                              <Input
                                inputMode="numeric"
                                aria-label={`Porcentaje para ${NOMBRE_PLATAFORMA[provider] ?? provider} ${e.etiqueta}`}
                                value={String(Math.round(pesosActuales[e.clave] ?? 0))}
                                onChange={(ev) => cambiarPeso(e.clave, Number(soloDigitos(ev.target.value)) || 0)}
                                className="h-8 w-16 px-2 text-right"
                              />
                              <span className="text-foreground/45">%</span>
                            </>
                          ) : (
                            <>
                              <Input
                                inputMode="numeric"
                                aria-label={`Monto para ${NOMBRE_PLATAFORMA[provider] ?? provider} ${e.etiqueta}`}
                                value={Math.round(((pesosActuales[e.clave] ?? 0) / 100) * montoEscrito).toLocaleString("es-CL")}
                                onChange={(ev) => {
                                  const n = Number(soloDigitos(ev.target.value)) || 0;
                                  cambiarPeso(e.clave, montoEscrito > 0 ? (n / montoEscrito) * 100 : 0);
                                }}
                                disabled={montoEscrito <= 0}
                                className="h-8 w-28 px-2 text-right"
                              />
                              <span className="w-9 text-right text-[0.68rem] text-foreground/45">
                                {Math.round(pesosActuales[e.clave] ?? 0)} %
                              </span>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.72rem]">
                {bajoMinimo.length > 0 && (
                  <span className="basis-full rounded-lg border border-warn/40 bg-warn/10 p-2 text-[0.7rem] leading-4 text-warn">
                    No se proyecta {bajoMinimo.map((e) => `${NOMBRE_PLATAFORMA[e.provider] ?? e.provider} · ${e.etiqueta}`).join(", ")}: lo asignado
                    es menos que el mínimo para {diasNumero} {diasNumero === 1 ? "día" : "días"}.
                  </span>
                )}
                {montoNumero > 0 && sumaValida <= 0 && (
                  <span className="basis-full rounded-lg border border-danger/40 bg-danger/10 p-2 text-[0.7rem] leading-4 text-danger">
                    El monto no alcanza el mínimo de ninguna plataforma para {diasNumero} {diasNumero === 1 ? "día" : "días"}. Sube el monto o
                    reduce los días.
                  </span>
                )}
                <span className="text-foreground/55">
                  {modoReparto === "monto" && montoEscrito <= 0
                    ? "Escribe el monto arriba para repartir en dinero"
                    : "Total 100 % · si cambias uno, los demás se ajustan"}
                </span>
                <span className="flex gap-3">
                  <button type="button" onClick={repartirParejo} className="text-brand hover:underline">
                    Repartir parejo
                  </button>
                  {pesos !== null && (
                    <button type="button" onClick={() => setPesos(null)} className="text-brand hover:underline">
                      Reparto histórico
                    </button>
                  )}
                </span>
              </div>
            </div>
          </Surface>

          <div className="space-y-4">
            {!proyeccion || !plan ? (
              <Surface className="p-5 text-sm text-foreground/60">
                Escribe un monto para ver la proyección.
              </Surface>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  {[
                    ["Inversión", dinero(proyeccion.total.gastoMicros, moneda), `${dinero(proyeccion.diarioPorCampanaMicros, moneda)} por día por campaña`],
                    ["Impresiones", entero(proyeccion.total.impresiones), null],
                    ["Clics", entero(proyeccion.total.clics), null],
                    [
                      proyeccion.porPlataforma.find((p) => p.resultados)?.etiquetaResultado ?? "Resultados",
                      rango(proyeccion.total.resultados),
                      proyeccion.total.resultados ? `Esperable: ${entero(proyeccion.total.resultados.central)}` : "Sin resultados medidos",
                    ],
                  ].map(([titulo, valor, nota]) => (
                    <Surface key={titulo as string} className="p-4">
                      <p className="font-micro text-[0.6rem] text-muted-foreground">{titulo}</p>
                      <p className="metric-number mt-1 truncate text-lg font-extrabold leading-tight text-foreground" title={String(valor)}>{valor}</p>
                      {nota && <p className="mt-0.5 text-[0.68rem] text-muted-foreground">{nota}</p>}
                    </Surface>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {proyeccion.porPlataforma.map((p) => (
                    <TarjetaPlataforma key={claveDeCanal(p.provider, p.canal)} p={p} moneda={moneda} />
                  ))}
                </div>

                {(recomendacion || valido) && (
                  <PanelDeEstrategia
                    moneda={moneda}
                    montoMicros={plan.montoMicros}
                    dias={diasNumero}
                    inicio={inicio}
                    objetivoEtiqueta={proyeccion.porPlataforma.find((x) => x.resultados)?.etiquetaResultado ?? "resultados"}
                    recomendacion={recomendacion}
                    sobraDelMes={sobraDelMes}
                    historial={historial}
                    plan={plan}
                    proyeccion={proyeccion}
                    nombreDe={(provider, canal) => {
                      const plataforma = NOMBRE_PLATAFORMA[provider] ?? provider;
                      return canal ? `${plataforma} · ${etiquetaDeCanal(provider, canal)}` : plataforma;
                    }}
                  />
                )}

                {proyeccion.avisos.length > 0 && (
                  <ul className="space-y-1 rounded-xl border border-foreground/10 bg-foreground/4 p-3 text-xs leading-5 text-foreground/65">
                    {proyeccion.avisos.map((a) => (
                      <li key={a} className="flex gap-2">
                        <Info className="mt-0.5 size-3.5 shrink-0" />
                        {a}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <NativeSelect
                    aria-label="Estilo de la presentación"
                    value={tema}
                    onChange={(e) => setTema(e.target.value as "wiwo" | "mgc")}
                    className="w-40"
                  >
                    <NativeSelectOption value="wiwo">Estilo WiWO</NativeSelectOption>
                    <NativeSelectOption value="mgc">Estilo MGC</NativeSelectOption>
                  </NativeSelect>
                  <Button type="button" variant="outline" disabled={exportando} onClick={() => void exportar()}>
                    <Download /> Descargar presentación (.pptx)
                  </Button>
                  <p className="text-xs text-foreground/50">
                    Se abre en Presentaciones de Google: súbela a Drive y elige «Abrir con».
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TarjetaPlataforma({ p, moneda }: { p: ProyeccionPlataforma; moneda: string }) {
  const c = CONFIANZA[p.confianza];
  return (
    <Surface className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-foreground">
          {NOMBRE_PLATAFORMA[p.provider] ?? p.provider}
          {p.canal ? <span className="font-semibold text-foreground/60"> · {etiquetaDeCanal(p.provider, p.canal)}</span> : null}
        </h4>
        <span className={cn("rounded-full border px-2 py-0.5 text-[0.62rem] font-bold", c.clase)}>{c.etiqueta}</span>
      </div>
      <p className="metric-number mt-1 text-sm text-foreground/70">{dinero(p.gastoMicros, moneda)}</p>
      {p.impresiones !== null ? (
        <dl className="mt-3 space-y-1 text-xs">
          <Fila etiqueta="Impresiones" valor={entero(p.impresiones)} />
          <Fila etiqueta="Clics" valor={entero(p.clics)} />
          <Fila etiqueta={p.etiquetaResultado} valor={rango(p.resultados)} fuerte />
          <p className="pt-1 text-[0.68rem] text-muted-foreground">
            Supuestos del historial: CPM {dinero(p.cpmMicros ?? 0, moneda)} · CTR {((p.ctr ?? 0) * 100).toFixed(2)} %
            {p.costoPorResultadoMicros !== null ? ` · ${dinero(p.costoPorResultadoMicros, moneda)} por resultado` : ""}
          </p>
        </dl>
      ) : null}
      {p.avisos.map((a) => (
        <p key={a} className="mt-2 text-[0.7rem] leading-4 text-foreground/55">
          {a}
        </p>
      ))}
    </Surface>
  );
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-foreground/55">{etiqueta}</dt>
      <dd className={cn("metric-number", fuerte ? "font-bold text-foreground" : "text-foreground/80")}>{valor}</dd>
    </div>
  );
}

/**
 * La estrategia en palabras: qué se espera con este monto y estas fechas, por qué se repartió así, qué pasaría con
 * otros montos y cómo se iría acumulando semana a semana. Todo sale del historial real del cliente.
 */
function PanelDeEstrategia({
  moneda, montoMicros, dias, inicio, objetivoEtiqueta, recomendacion, sobraDelMes, historial, plan, proyeccion, nombreDe,
}: {
  moneda: string;
  montoMicros: number;
  dias: number;
  inicio: string;
  objetivoEtiqueta: string;
  recomendacion: { razones: RazonDeReparto[]; avisos: string[] } | null;
  sobraDelMes: number | null;
  historial: Historial | null;
  plan: PlanSimulado;
  proyeccion: ReturnType<typeof proyectar>;
  nombreDe: (provider: string, canal: string | null) => string;
}) {
  const total = proyeccion.total.resultados;
  const fin = sumarDias(inicio, dias - 1);
  const porDia = montoMicros / Math.max(1, dias);
  const filasEscenarios = historial ? calcularEscenarios(historial, plan) : [];
  const semanas = avancePorSemana(proyeccion, dias, inicio);
  const etiqueta = objetivoEtiqueta.toLowerCase();
  const pasaDelMes = sobraDelMes !== null && montoMicros > sobraDelMes;

  return (
    <Surface className="space-y-4 p-5">
      <div>
        <h3 className="text-sm font-bold">Estrategia</h3>
        <p className="mt-1 text-sm leading-6 text-foreground/75">
          Con <b className="text-foreground">{dinero(montoMicros, moneda)}</b> entre el {inicio.split("-").reverse().join("-")} y el{" "}
          {fin.split("-").reverse().join("-")} ({dias} {dias === 1 ? "día" : "días"}, {dinero(porDia, moneda)} por día)
          {total ? (
            <>
              {" "}
              se esperan entre <b className="text-foreground">{entero(total.bajo)}</b> y <b className="text-foreground">{entero(total.alto)}</b>{" "}
              {etiqueta}, unos <b className="text-foreground">{entero(total.central)}</b> en el caso central
              {total.central > 0 && <> (≈ {dinero(montoMicros / total.central, moneda)} cada uno)</>}.
            </>
          ) : (
            <>. Con este objetivo no hay resultados medidos en el historial: solo se proyectan impresiones y clics.</>
          )}
        </p>
        {pasaDelMes && (
          <p className="mt-2 rounded-lg border border-warn/40 bg-warn/10 p-2 text-xs text-warn">
            Es más que lo que sobra del presupuesto mensual del cliente ({dinero(sobraDelMes ?? 0, moneda)}).
          </p>
        )}
      </div>

      {recomendacion && recomendacion.razones.length > 0 && (
        <div>
          <h4 className="font-micro text-[0.62rem] text-muted-foreground">POR QUÉ ESTE REPARTO</h4>
          <ul className="mt-2 space-y-2">
            {recomendacion.razones.map((x) => (
              <li key={`${x.provider}|${x.canal ?? ""}`} className="rounded-lg border border-foreground/8 p-2.5 text-xs leading-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold text-foreground">{nombreDe(x.provider, x.canal)}</span>
                  <span className="metric-number text-foreground/70">
                    {Math.round(x.fraccion * 100)} % · {dinero(montoMicros * x.fraccion, moneda)}
                  </span>
                </div>
                <p className="text-foreground/60">
                  {x.costoPorResultadoMicros !== null && <>Hoy le cuesta {dinero(x.costoPorResultadoMicros, moneda)} por resultado. </>}
                  {x.motivo}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {recomendacion && recomendacion.avisos.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-foreground/10 bg-foreground/4 p-2.5 text-xs leading-5 text-foreground/65">
          {recomendacion.avisos.map((a) => (
            <li key={a} className="flex gap-2">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {a}
            </li>
          ))}
        </ul>
      )}

      {filasEscenarios.length > 0 && total && (
        <div>
          <h4 className="font-micro text-[0.62rem] text-muted-foreground">QUÉ PASARÍA CON OTRO MONTO (MISMO REPARTO Y DÍAS)</h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead>
                <tr className="font-micro text-[0.58rem] text-muted-foreground">
                  <th className="py-1 pr-3 font-semibold">MONTO</th>
                  <th className="px-2 font-semibold">{objetivoEtiqueta.toUpperCase()} (RANGO)</th>
                  <th className="pl-2 text-right font-semibold">COSTO POR RESULTADO</th>
                </tr>
              </thead>
              <tbody>
                {filasEscenarios.map((e) => (
                  <tr key={e.factor} className={cn("border-t border-foreground/6", e.factor === 1 && "font-bold text-foreground")}>
                    <td className="py-1.5 pr-3">
                      {dinero(e.montoMicros, moneda)} <span className="font-normal text-foreground/40">({e.factor === 1 ? "el pedido" : `×${e.factor}`})</span>
                    </td>
                    <td className="metric-number px-2">{e.resultados ? rango(e.resultados) : "—"}</td>
                    <td className="metric-number pl-2 text-right">{e.costoPorResultadoMicros ? dinero(e.costoPorResultadoMicros, moneda) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[0.65rem] leading-4 text-foreground/40">
            Gastar más rara vez da resultados en la misma proporción: pasado el doble de lo que ya se invertía, cada resultado suele costar más.
          </p>
        </div>
      )}

      {semanas.length > 1 && (
        <div>
          <h4 className="font-micro text-[0.62rem] text-muted-foreground">AVANCE SEMANA A SEMANA (RITMO PAREJO)</h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead>
                <tr className="font-micro text-[0.58rem] text-muted-foreground">
                  <th className="py-1 pr-3 font-semibold">SEMANA</th>
                  <th className="px-2 text-right font-semibold">INVERSIÓN</th>
                  <th className="px-2 text-right font-semibold">{objetivoEtiqueta.toUpperCase()}</th>
                  <th className="pl-2 text-right font-semibold">ACUMULADO</th>
                </tr>
              </thead>
              <tbody>
                {semanas.map((w) => (
                  <tr key={w.desde} className="border-t border-foreground/6">
                    <td className="py-1.5 pr-3">
                      {w.desde.split("-").reverse().slice(0, 2).join("-")} → {w.hasta.split("-").reverse().slice(0, 2).join("-")}
                    </td>
                    <td className="metric-number px-2 text-right">{dinero(w.gastoMicros, moneda)}</td>
                    <td className="metric-number px-2 text-right">{w.resultados === null ? "—" : entero(w.resultados)}</td>
                    <td className="metric-number pl-2 text-right">{w.acumulados === null ? "—" : entero(w.acumulados)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Surface>
  );
}
