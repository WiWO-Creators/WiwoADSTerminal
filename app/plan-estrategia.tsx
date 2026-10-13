"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { CampaignDraft, LugarSegmentable } from "@/lib/constructor";
import {
  borradorDeCampana,
  consultasDeInteres,
  finDelPlan,
  hitosDelPlan,
  icsDeHitos,
  PLAN_COLOMBIA,
  totalDelPlan,
  type CampanaDelPlan,
  type PlanDeEstrategia,
} from "@/lib/estrategia-pura";
import { Seccion } from "./constructor-ui";

/**
 * Plan de estrategia: una estrategia aprobada (Colombia · Valor) convertida en lo que el Constructor necesita. Crea los públicos del
 * plan, carga cada campaña con sus presupuestos, lugares, intereses y exclusiones, y baja el calendario de hitos. Nada se publica
 * desde aquí: cada campaña se revisa y se publica con el botón de siempre.
 */

const PLANES: PlanDeEstrategia[] = [PLAN_COLOMBIA];

type Audiencia = { id: string; nombre: string };
type Formulario = { id: string; nombre: string; estado: string };

const hoyMas = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function PlanDeEstrategiaPanel({
  portfolioId,
  accountId,
  cuentasMeta,
  onElegirCuenta,
  onCargar,
}: {
  portfolioId: string;
  accountId: string | null;
  /** Las cuentas de Meta del cliente: con más de una hay que elegir en cuál se publica. */
  cuentasMeta: Array<{ id: string; nombre: string }>;
  onElegirCuenta: (id: string) => void;
  onCargar: (cambios: Partial<CampaignDraft>) => void;
}) {
  const plan = PLANES.find((p) => p.clienteId === portfolioId) ?? null;
  const [inicio, setInicio] = useState(() => hoyMas(14));
  const [formularioId, setFormularioId] = useState("");
  const [urlDestino, setUrlDestino] = useState("");
  const [audiencias, setAudiencias] = useState<Audiencia[] | null>(null);
  const [formularios, setFormularios] = useState<Formulario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [calidad, setCalidad] = useState<{ total: number; calificados: number; porcentaje: number | null } | null>(null);

  useEffect(() => {
    if (!plan || !accountId) return;
    let vivo = true;
    fetch(`/api/meta/audiencias?portfolioId=${encodeURIComponent(portfolioId)}&accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => null)) as { audiencias?: Array<{ id: string; nombre: string }>; error?: string } | null }))
      .then(({ ok, j }) => {
        if (!vivo) return;
        if (ok) setAudiencias((j?.audiencias ?? []).map((a) => ({ id: a.id, nombre: a.nombre })));
        else setError(j?.error ?? "No se pudieron leer los públicos de la cuenta");
      })
      .catch(() => vivo && setError("No se pudieron leer los públicos de la cuenta"));
    fetch(`/api/meta/formularios?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => null)) as { formularios?: Formulario[]; error?: string } | null }))
      .then(({ ok, j }) => vivo && ok && setFormularios((j?.formularios ?? []).filter((f) => f.estado === "ACTIVE")))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [plan, portfolioId, accountId, version]);

  const idDe = useMemo(() => {
    const por = new Map((audiencias ?? []).map((a) => [normal(a.nombre), a.id]));
    return (nombre: string) => por.get(normal(nombre)) ?? null;
  }, [audiencias]);

  if (!plan) return null;

  const publicosIds: Record<string, string> = {};
  for (const p of plan.publicos) {
    const id = idDe(p.nombre);
    if (id) publicosIds[p.clave] = id;
  }
  const hitos = hitosDelPlan(inicio, plan.semanas);

  async function crearPublico(clave: string) {
    const p = plan?.publicos.find((x) => x.clave === clave);
    if (!p || !accountId) return;
    if (p.tipo === "formulario" && !formularioId) {
      setError("Elige primero el formulario instantáneo: los públicos de formulario salen de él.");
      return;
    }
    setOcupado(clave);
    setError(null);
    try {
      const r = await fetch("/api/meta/audiencias", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portfolioId, accountId, tipo: p.tipo, nombre: p.nombre, dias: p.dias, formularioId, quien: p.quien, porcentaje: p.porcentaje, simular: false }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? "No se pudo crear el público");
      setAviso(`Público «${p.nombre}» creado. Meta tarda un rato en poblarlo.`);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el público");
    } finally {
      setOcupado(null);
    }
  }

  async function resolverLugares(c: CampanaDelPlan): Promise<{ lugares: LugarSegmentable[]; sinUbicar: string[] }> {
    const lugares: LugarSegmentable[] = [];
    const sinUbicar: string[] = [];
    for (const l of c.lugares) {
      try {
        const r = await fetch(`/api/geo-targets/geocode?nombre=${encodeURIComponent(l.nombre)}&countryCode=${plan?.pais ?? "CO"}`, { cache: "no-store" });
        const j = (await r.json().catch(() => null)) as { coordenadas?: { lat: number; lng: number } | null } | null;
        if (r.ok && j?.coordenadas) {
          // El radio es el del plan (2 km es el mínimo de Meta); la ubicación sale del mapa, nunca se inventa.
          lugares.push({ id: `plan:${normal(l.nombre).replace(/\W+/g, "-")}`, nombre: l.nombre.split(",")[0], countryCode: plan?.pais ?? "CO", tier: "city", lat: j.coordenadas.lat, lng: j.coordenadas.lng, radiusKm: l.radioKm, aproximado: false });
          continue;
        }
      } catch {
        // se cuenta como no ubicado
      }
      sinUbicar.push(l.nombre);
    }
    return { lugares, sinUbicar };
  }

  async function resolverIntereses(nombres: string[]): Promise<{ ids: string[]; elegidos: string[]; sinId: string[] }> {
    const ids: string[] = [];
    const elegidos: string[] = [];
    const sinId: string[] = [];
    for (const nombre of nombres) {
      let hallado: { id: string; nombre: string } | null = null;
      for (const consulta of consultasDeInteres(nombre)) {
        try {
          const r = await fetch(`/api/meta/intereses?q=${encodeURIComponent(consulta)}`, { cache: "no-store" });
          const j = (await r.json().catch(() => null)) as { intereses?: Array<{ id: string; nombre: string }> } | null;
          const lista = j?.intereses ?? [];
          // Solo se acepta un interés cuyo nombre se parece a lo buscado: el primero de la lista puede ser otra cosa (Golf → «Árabe del Golfo»).
          hallado = lista.find((i) => normal(i.nombre) === normal(consulta)) ?? lista.find((i) => normal(i.nombre).startsWith(normal(consulta))) ?? null;
        } catch {
          hallado = null;
        }
        if (hallado) break;
      }
      if (hallado && !ids.includes(hallado.id)) {
        ids.push(hallado.id);
        elegidos.push(hallado.nombre);
      } else if (!hallado) sinId.push(nombre);
    }
    return { ids, elegidos, sinId };
  }

  async function cargar(c: CampanaDelPlan) {
    if (!plan) return;
    setOcupado(`campana:${c.clave}`);
    setError(null);
    setAviso(null);
    try {
      const base = borradorDeCampana(plan, c.clave, { inicio, formularioId, urlDestino: urlDestino.trim(), publicos: publicosIds });
      if (!base) return;
      const [{ lugares, sinUbicar }, { ids, elegidos, sinId }] = await Promise.all([resolverLugares(c), resolverIntereses(base.intereses)]);
      onCargar({ ...base.borrador, targetPlaces: lugares, geoRadius: null, metaInterests: ids });
      const notas = [
        base.faltan.length > 0 ? `Faltan públicos por crear: ${base.faltan.join(", ")}.` : null,
        sinUbicar.length > 0 ? `No se pudo ubicar en el mapa: ${sinUbicar.join(", ")} (agrégalos a mano en el Conjunto).` : null,
        sinId.length > 0 ? `Sin interés de Meta para: ${sinId.join(", ")}.` : null,
        !formularioId ? "Falta elegir el formulario instantáneo." : null,
        !urlDestino.trim() ? "Falta la URL de destino (Meta exige un sitio externo)." : null,
      ].filter(Boolean);
      setAviso(`«${c.nombre}» cargada en el Constructor (${lugares.length} lugares${elegidos.length ? `; intereses: ${elegidos.join(", ")}` : ""}).${notas.length ? ` ${notas.join(" ")}` : ""} Completa el texto y la pieza del anuncio y revisa el plan.`);
    } finally {
      setOcupado(null);
    }
  }

  async function calcularCalidad() {
    if (!accountId || !formularioId) return;
    setOcupado("calidad");
    setError(null);
    setCalidad(null);
    try {
      const r = await fetch("/api/meta/formularios/calidad", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, formularioId, regla: "colombia" }) });
      const j = (await r.json().catch(() => null)) as { error?: string; total?: number; calificados?: number; porcentaje?: number | null } | null;
      if (!r.ok) throw new Error(j?.error ?? "No se pudo calcular");
      setCalidad({ total: j?.total ?? 0, calificados: j?.calificados ?? 0, porcentaje: j?.porcentaje ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo calcular");
    } finally {
      setOcupado(null);
    }
  }

  function bajarCalendario() {
    const blob = new Blob([icsDeHitos(plan?.nombre ?? "Estrategia", hitos)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calendario-${plan?.id ?? "estrategia"}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Seccion titulo={`Plan de estrategia · ${plan.nombre}`} soloPlataforma="Meta">
      <div className="space-y-5">
        <p className="text-sm leading-6 text-foreground/65">
          {plan.campanas.length} campañas, {plan.semanas} semanas, {plan.moneda} {totalDelPlan(plan).toLocaleString("es-CL")} en medios. Carga cada una en el Constructor ya
          armada (presupuesto total en el conjunto, ubicación, intereses y exclusiones) y revísala antes de publicar.
        </p>

        {!accountId && (
          <label className="block space-y-1 text-xs font-semibold text-foreground/60">
            Cuenta de Meta donde se construye
            <select value="" onChange={(e) => e.target.value && onElegirCuenta(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal">
              <option value="">{cuentasMeta.length === 0 ? "El cliente no tiene cuentas de Meta" : "Elige la cuenta…"}</option>
              {cuentasMeta.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs font-semibold text-foreground/60">
            Inicio del plan
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="bg-field/60" />
            <span className="block font-normal text-foreground/40">Termina el {finDelPlan(inicio, plan.semanas)}</span>
          </label>
          <label className="space-y-1 text-xs font-semibold text-foreground/60">
            Formulario instantáneo
            <select value={formularioId} onChange={(e) => setFormularioId(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal">
              <option value="">{formularios === null ? "Leyendo…" : "Elige un formulario…"}</option>
              {(formularios ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-foreground/60">
            URL de destino (https://)
            <Input value={urlDestino} onChange={(e) => setUrlDestino(e.target.value)} placeholder="https://" className="bg-field/60" />
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-foreground/70">1 · Públicos del plan</p>
          {audiencias === null && !error ? <p className="text-xs text-foreground/50">Leyendo los públicos de la cuenta…</p> : null}
          {plan.publicos.map((p) => {
            const existe = idDe(p.nombre) !== null;
            return (
              <div key={p.clave} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-foreground/10 px-3 py-2 text-xs">
                <span className="min-w-0">
                  <span className="font-semibold text-foreground">{p.nombre}</span>
                  <span className="block text-foreground/50">{p.descripcion}</span>
                </span>
                {existe ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-ok">
                    <Check className="size-3.5" /> Ya existe
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={ocupado !== null || audiencias === null}
                    onClick={() => void crearPublico(p.clave)}
                    className="inline-flex items-center gap-1 rounded-full border border-brand/40 px-3 py-1.5 font-bold text-brand disabled:opacity-40"
                  >
                    {ocupado === p.clave && <Loader2 className="size-3 animate-spin" />} Crear
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-foreground/70">2 · Campañas</p>
          {plan.campanas.map((c) => (
            <div key={c.clave} className="rounded-lg border border-foreground/10 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-foreground">
                  [LDS] {c.nombre} · {plan.moneda} {c.presupuestoTotal.toLocaleString("es-CL")}
                </span>
                <button
                  type="button"
                  disabled={ocupado !== null || !accountId}
                  onClick={() => void cargar(c)}
                  className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 font-bold text-primary-foreground disabled:opacity-40"
                >
                  {ocupado === `campana:${c.clave}` && <Loader2 className="size-3 animate-spin" />} Cargar en el Constructor
                </button>
              </div>
              <p className="mt-1 text-foreground/55">
                {c.ubicacion === "home" ? "Viven en" : c.ubicacion === "recent" ? "Estuvieron recientemente en" : "Todo el país"}
                {c.lugares.length > 0 ? `: ${c.lugares.map((l) => l.nombre.split(",")[0]).join(" · ")}` : ""}
                {c.desdeSemana > 1 ? ` · empieza la semana ${c.desdeSemana}` : ""}
              </p>
              {c.nota && <p className="mt-0.5 text-foreground/45">{c.nota}</p>}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-foreground/70">3 · Calendario</p>
          <ul className="space-y-1 text-xs text-foreground/65">
            {hitos.map((h) => (
              <li key={h.clave}>
                <span className="font-semibold tabular-nums text-foreground/80">{h.fecha}</span> · {h.titulo}
              </li>
            ))}
          </ul>
          <button type="button" onClick={bajarCalendario} className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 px-3 py-1.5 text-xs font-bold text-brand">
            <CalendarDays className="size-3.5" /> Descargar calendario (.ics)
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-foreground/70">4 · Calidad de los leads</p>
          <p className="text-xs text-foreground/55">Calificado = rango de inversión definido y plazo de hasta 12 meses (deja fuera a quien está solo explorando). Solo muestra totales, nunca datos de las personas.</p>
          <button type="button" disabled={!formularioId || ocupado !== null} onClick={() => void calcularCalidad()} className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 px-3 py-1.5 text-xs font-bold text-brand disabled:opacity-40">
            {ocupado === "calidad" && <Loader2 className="size-3 animate-spin" />} Calcular % de calificados
          </button>
          {calidad && (
            <p className="text-xs text-foreground/80">
              <strong>{calidad.calificados.toLocaleString("es-CL")}</strong> de {calidad.total.toLocaleString("es-CL")} leads son calificados{calidad.porcentaje !== null ? ` (${calidad.porcentaje.toLocaleString("es-CL")} %)` : ""}.
            </p>
          )}
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        {aviso && <p className="text-xs leading-5 text-ok">{aviso}</p>}
      </div>
    </Seccion>
  );
}
