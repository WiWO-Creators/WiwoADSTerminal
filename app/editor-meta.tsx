"use client";

import { useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CTA_COMUNES, CTA_CODIGOS, CTA_CON_DESTINO, CTA_ETIQUETAS, etiquetaCta } from "@/lib/cta";
import type { DetalleAnuncio, DetalleCampana, DetalleConjunto } from "@/lib/detalle-entidad";
import { ETIQUETA_DE_OBJETIVO_META, OBJETIVO_DE_RENDIMIENTO_META, partesDeFechaMeta } from "@/lib/fecha-meta-pura";
import { DIAS_DE_LA_SEMANA } from "@/lib/horario-meta-pura";
import { FORMATOS_META, META_SURFACES, POSICIONES_META, REDES_CON_POSICIONES, type RedConPosiciones } from "@/lib/formatos-meta-pura";
import { atribucionesAdmitidas } from "@/lib/constructor";
import { cn } from "@/lib/utils";
import { SegmentacionMeta } from "./segmentacion-meta";
import { SelectorDePublicaciones, type Publicacion } from "./selector-publicaciones";

/**
 * Los editores de Meta, con la misma estructura y los mismos nombres que Ads Manager: Campaña, Conjunto de anuncios y Anuncio,
 * cada uno en sus tarjetas, con el estado como interruptor y todas las celdas ya llenas con lo que hoy tiene la plataforma.
 * Usan los mismos valores del formulario que el resto del editor (ver \`inicial\` y \`armarCambios\` en editar-entidad.tsx).
 */
type Valores = Record<string, string>;
type Poner = (clave: string) => (valor: string) => void;

const csv = (t: string | undefined): string[] => (t ?? "").split(",").map((x) => x.trim()).filter(Boolean);

function Tarjeta({ titulo, insignia, children }: { titulo: string; insignia?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-foreground/10 bg-card/60 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">{titulo}</h3>
        {insignia && <span className="rounded-full border border-brand/40 bg-brand/10 px-2.5 py-0.5 text-[0.65rem] font-bold text-brand">{insignia}</span>}
      </div>
      {children}
    </section>
  );
}

function Fila({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-foreground">{etiqueta}</p>
      {children}
      {ayuda && <p className="text-[0.72rem] leading-4 text-foreground/50">{ayuda}</p>}
    </div>
  );
}

const dinero = (v: number | null | undefined, moneda: string | null): string => {
  if (v === null || v === undefined) return "—";
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: moneda ?? "USD", maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${moneda ?? ""} ${Math.round(v * 100) / 100}`.trim();
  }
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** «4 de agosto de 2026 · 17:52 GMT-4», como lo muestra Ads Manager. */
function fechaLarga(p: { local: string; gmt: string } | null): string {
  if (!p) return "—";
  const [dia, hora] = p.local.split("T");
  const [a, m, d] = dia.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a} · ${hora} ${p.gmt}`;
}

/** El estado como interruptor, igual que en Meta: encendido = activa. Un cambio queda como «pausar» o «activar». */
function InterruptorDeEstado({ estado, nivel, valores, poner }: { estado: string | null; nivel: string; valores: Valores; poner: Poner }) {
  const texto = (estado ?? "").toUpperCase();
  const activaHoy = texto === "ACTIVE";
  const bloqueado = ["ARCHIVED", "DELETED", "REMOVED"].includes(texto);
  const pedido = valores.estadoPedido ?? "";
  const encendida = pedido === "pausar" ? false : pedido === "activar" ? true : activaHoy;
  const que = nivel === "campana" ? "la campaña" : nivel === "conjunto" ? "el conjunto" : "el anuncio";
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-foreground/10 bg-card/60 px-5 py-3">
      <div>
        <p className="text-sm font-bold text-foreground">{encendida ? "Activa" : "Desactivada"}</p>
        <p className="text-[0.72rem] text-foreground/50">
          {bloqueado ? "Está archivada: no se puede cambiar desde aquí." : pedido ? `Al aplicar, se ${encendida ? "activará" : "pausará"} ${que}.` : `Hoy ${activaHoy ? "está activa" : "está pausada"}. Pausar detiene la entrega; activar la reanuda.`}
        </p>
      </div>
      <Switch
        checked={encendida}
        disabled={bloqueado}
        aria-label={`Estado de ${que}`}
        onCheckedChange={(on) => poner("estadoPedido")(on === activaHoy ? "" : on ? "activar" : "pausar")}
      />
    </div>
  );
}

/* ----------------------------------- Campaña ----------------------------------- */

export function EditorMetaCampana({ campana, valores, poner, moneda }: { campana: DetalleCampana | null; valores: Valores; poner: Poner; moneda: string | null }) {
  const objetivo = ETIQUETA_DE_OBJETIVO_META[campana?.objetivo ?? ""] ?? campana?.objetivo ?? "—";
  const cbo = campana?.presupuesto.enLaCampana === true || campana?.presupuesto.diario != null || campana?.presupuesto.total != null;
  return (
    <div className="space-y-4">
      <InterruptorDeEstado estado={campana?.estado ?? null} nivel="campana" valores={valores} poner={poner} />
      <Tarjeta titulo="Nombre de la campaña">
        <Input value={valores.nombre ?? ""} onChange={(e) => poner("nombre")(e.target.value)} />
      </Tarjeta>
      <Tarjeta titulo="Objetivo de la campaña">
        <Fila etiqueta="Objetivo" ayuda="El objetivo se fija al crear la campaña: Meta no deja cambiarlo.">
          <p className="rounded-xl border border-foreground/10 bg-foreground/[0.04] px-3 py-2 text-sm">{objetivo}</p>
        </Fila>
        <Fila etiqueta="Categorías de anuncios especiales" ayuda="Obligatoria si los anuncios son de vivienda, empleo, crédito o temas sociales, electorales o políticos; limita la segmentación.">
          <NativeSelect value={valores.categoriaEspecial ?? ""} onChange={(e) => poner("categoriaEspecial")(e.target.value)}>
            <NativeSelectOption value="">Ninguna</NativeSelectOption>
            <NativeSelectOption value="HOUSING">Vivienda</NativeSelectOption>
            <NativeSelectOption value="EMPLOYMENT">Empleo</NativeSelectOption>
            <NativeSelectOption value="CREDIT">Crédito</NativeSelectOption>
            <NativeSelectOption value="ISSUES_ELECTIONS_POLITICS">Temas sociales, electorales o políticos</NativeSelectOption>
          </NativeSelect>
        </Fila>
      </Tarjeta>
      <Tarjeta titulo="Presupuesto de la campaña Advantage+" insignia={cbo ? "Activado" : "Desactivado"}>
        {cbo ? (
          <>
            <Fila etiqueta="Presupuesto de la campaña" ayuda="Meta reparte este presupuesto entre los conjuntos de anuncios para obtener el mejor rendimiento posible.">
              <div className="flex gap-2">
                <NativeSelect className="w-36 shrink-0" value={valores.presupuestoTipo ?? "daily"} onChange={(e) => poner("presupuestoTipo")(e.target.value)}>
                  <NativeSelectOption value="daily">Diario</NativeSelectOption>
                  <NativeSelectOption value="lifetime">Total</NativeSelectOption>
                </NativeSelect>
                <Input inputMode="decimal" placeholder="Monto" value={valores.presupuestoMonto ?? ""} onChange={(e) => poner("presupuestoMonto")(e.target.value)} />
              </div>
              {moneda && <p className="text-[0.72rem] text-foreground/45">En {moneda}.</p>}
            </Fila>
            <Fila etiqueta="Estrategia de puja de la campaña" ayuda="Las estrategias con tope o costo objetivo se eligen en cada conjunto, junto con el monto de la puja.">
              <NativeSelect value={valores.estrategiaPuja ?? ""} onChange={(e) => poner("estrategiaPuja")(e.target.value)}>
                {!valores.estrategiaPuja && <NativeSelectOption value="">Sin leer</NativeSelectOption>}
                <NativeSelectOption value="LOWEST_COST_WITHOUT_CAP">Volumen más alto</NativeSelectOption>
                <NativeSelectOption value="LOWEST_COST_WITH_BID_CAP" disabled>Límite de puja (en el conjunto)</NativeSelectOption>
                <NativeSelectOption value="COST_CAP" disabled>Costo por resultado (en el conjunto)</NativeSelectOption>
              </NativeSelect>
            </Fila>
          </>
        ) : (
          <p className="text-sm text-foreground/60">Cada conjunto de anuncios tiene su propio presupuesto.</p>
        )}
        <Fila etiqueta="Límite de gasto de la campaña" ayuda="Tope total que la campaña no superará. Para quitarlo, hazlo en Meta.">
          <Input inputMode="decimal" placeholder="Sin límite" value={valores.limiteGasto ?? ""} onChange={(e) => poner("limiteGasto")(e.target.value)} />
        </Fila>
      </Tarjeta>
    </div>
  );
}

/* ------------------------------ Conjunto de anuncios ------------------------------ */

export function EditorMetaConjunto({
  conjunto,
  campana,
  valores,
  poner,
  moneda,
  accountId,
  nombresIniciales,
}: {
  conjunto: DetalleConjunto | null;
  campana: DetalleCampana | null;
  valores: Valores;
  poner: Poner;
  moneda: string | null;
  accountId: string;
  nombresIniciales: Record<string, string>;
}) {
  const c = conjunto;
  // Mínimo del campo de fecha de término: ahora, hora local (no se puede elegir algo que ya pasó).
  const [ahoraLocal] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  const seg = c?.segmentacion ?? null;
  const objetivoDeCampana = ETIQUETA_DE_OBJETIVO_META[campana?.objetivo ?? ""] ?? "Objetivo";
  const enLaCampana = c?.presupuesto.enLaCampana === true;
  const inicio = partesDeFechaMeta(c?.inicio);
  const fin = partesDeFechaMeta(c?.fin);
  const estrategia = (valores.estrategiaPuja || campana?.puja.estrategia || "").toUpperCase();
  const sinTope = estrategia === "" || estrategia === "LOWEST_COST_WITHOUT_CAP";
  const optimizaciones = Object.keys(OBJETIVO_DE_RENDIMIENTO_META);
  const hayRegiones = (seg?.regiones.length ?? 0) > 0 || (seg?.ciudades.length ?? 0) > 0 || (seg?.ubicacionesPersonalizadas ?? 0) > 0;
  const marcadasRedes = csv(valores.plataformas);
  const automaticas = marcadasRedes.length === 0 && FORMATOS_META.every((f) => !csv(valores.formatos).includes(f)) && REDES_CON_POSICIONES.every((r) => csv(valores[`pos:${r}`]).length === 0);
  const [totalCampana, tipoCampana] = campana?.presupuesto.total != null ? [campana.presupuesto.total, "total"] : [campana?.presupuesto.diario ?? null, "diario"];

  return (
    <div className="space-y-4">
      <InterruptorDeEstado estado={c?.estado ?? null} nivel="conjunto" valores={valores} poner={poner} />

      <Tarjeta titulo="Nombre del conjunto de anuncios">
        <Input value={valores.nombre ?? ""} onChange={(e) => poner("nombre")(e.target.value)} />
      </Tarjeta>

      <Tarjeta titulo={objetivoDeCampana}>
        <Fila etiqueta="Objetivo de rendimiento" ayuda="Cómo mides el éxito de tus anuncios. Debe ser compatible con el objetivo de la campaña; si no, Meta lo rechaza.">
          <NativeSelect value={valores.optimizacion ?? ""} onChange={(e) => poner("optimizacion")(e.target.value)}>
            {!valores.optimizacion && <NativeSelectOption value="">Sin leer</NativeSelectOption>}
            {optimizaciones.map((k) => (
              <NativeSelectOption key={k} value={k}>{OBJETIVO_DE_RENDIMIENTO_META[k]}</NativeSelectOption>
            ))}
            {valores.optimizacion && !optimizaciones.includes(valores.optimizacion) && <NativeSelectOption value={valores.optimizacion}>{valores.optimizacion}</NativeSelectOption>}
          </NativeSelect>
        </Fila>
        <Fila etiqueta="Página de Facebook" ayuda="La página que se promociona. No se cambia desde aquí.">
          <p className="rounded-xl border border-foreground/10 bg-foreground/[0.04] px-3 py-2 text-sm">{String((c?.objetoPromovido as { page_id?: string } | null)?.page_id ?? "—")}</p>
        </Fila>
        <Fila etiqueta="Objetivo de costo por resultado" ayuda={sinTope ? "Meta intentará gastar todo el presupuesto y obtener el mayor número de resultados con la estrategia de puja de volumen más alto." : "Con límite de puja o costo objetivo, este es el monto de la puja."}>
          <Input inputMode="decimal" disabled={sinTope} placeholder="X.XXX" value={sinTope ? "" : valores.puja ?? ""} onChange={(e) => poner("puja")(e.target.value)} />
        </Fila>
        <Fila etiqueta="Estrategia de puja">
          <NativeSelect value={valores.estrategiaPuja ?? ""} disabled={enLaCampana} onChange={(e) => poner("estrategiaPuja")(e.target.value)}>
            {!valores.estrategiaPuja && <NativeSelectOption value="">{campana?.puja.estrategia ? "Igual que la campaña" : "Sin leer"}</NativeSelectOption>}
            <NativeSelectOption value="LOWEST_COST_WITHOUT_CAP">Volumen más alto</NativeSelectOption>
            <NativeSelectOption value="LOWEST_COST_WITH_BID_CAP">Límite de puja</NativeSelectOption>
            <NativeSelectOption value="COST_CAP">Costo por resultado</NativeSelectOption>
          </NativeSelect>
          {enLaCampana && <p className="text-[0.72rem] text-foreground/45">La estrategia se define en la campaña.</p>}
        </Fila>
        <Fila etiqueta="Control de frecuencia">
          <label className="flex items-center gap-2 text-sm text-foreground/50">
            <input type="checkbox" disabled /> Define una frecuencia para la entrega de anuncios (solo en Meta)
          </label>
        </Fila>
      </Tarjeta>

      <Tarjeta titulo="Presupuesto y calendario">
        <Fila etiqueta="Estrategia de presupuesto">
          {enLaCampana ? (
            <p className="text-sm leading-6 text-foreground/70">
              El presupuesto de la campaña distribuye automáticamente tu presupuesto {tipoCampana} de {dinero(totalCampana, moneda)} entre los conjuntos de anuncios para obtener el mejor rendimiento posible.
            </p>
          ) : (
            <div className="flex gap-2">
              <NativeSelect className="w-36 shrink-0" value={valores.presupuestoTipo ?? "daily"} onChange={(e) => poner("presupuestoTipo")(e.target.value)}>
                <NativeSelectOption value="daily">Presupuesto diario</NativeSelectOption>
                <NativeSelectOption value="lifetime">Presupuesto total</NativeSelectOption>
              </NativeSelect>
              <Input inputMode="decimal" placeholder="Monto" value={valores.presupuestoMonto ?? ""} onChange={(e) => poner("presupuestoMonto")(e.target.value)} />
            </div>
          )}
        </Fila>
        <Fila etiqueta="Fecha de inicio" ayuda="La fecha de inicio no se cambia desde aquí.">
          <Input disabled value={fechaLarga(inicio)} readOnly />
        </Fila>
        <Fila etiqueta="Fecha de finalización" ayuda={fin ? `Hora de la cuenta (${fin.gmt}). Menos de un año adelante.` : "Sin fecha de finalización. Menos de un año adelante."}>
          <Input type="datetime-local" min={ahoraLocal} value={valores.fin ?? ""} onChange={(e) => poner("fin")(e.target.value)} />
        </Fila>
        <Fila etiqueta="Horario de entrega" ayuda="Solo con presupuesto TOTAL del conjunto y fecha de finalización (Meta lo exige). Para varios tramos distintos, pídeselo al Thinking Orb.">
          <div className="space-y-2">
            <NativeSelect value={valores.horModo ?? ""} onChange={(e) => poner("horModo")(e.target.value)}>
              <NativeSelectOption value="">Sin cambios</NativeSelectOption>
              <NativeSelectOption value="todo">Todo el día, todos los días</NativeSelectOption>
              <NativeSelectOption value="tramo">Solo en estos días y horas</NativeSelectOption>
            </NativeSelect>
            {valores.horModo === "tramo" && (
              <>
                <div className="flex flex-wrap gap-3 text-sm">
                  {DIAS_DE_LA_SEMANA.map((nombre, d) => {
                    const marcados = csv(valores.horDias);
                    return (
                      <label key={nombre} className="flex items-center gap-1.5">
                        <input type="checkbox" checked={marcados.includes(String(d))} onChange={(e) => poner("horDias")((e.target.checked ? [...marcados, String(d)] : marcados.filter((x) => x !== String(d))).join(","))} />
                        {nombre.slice(0, 3)}
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  Desde <Input className="w-20" type="number" min={0} max={23} value={valores.horDesde ?? "9"} onChange={(e) => poner("horDesde")(e.target.value)} />
                  hasta <Input className="w-20" type="number" min={1} max={24} value={valores.horHasta ?? "18"} onChange={(e) => poner("horHasta")(e.target.value)} /> h
                </div>
              </>
            )}
          </div>
        </Fila>
      </Tarjeta>

      <Tarjeta titulo="Público" insignia={seg?.advantageAudience ? "Advantage+ activado" : undefined}>
        <Fila etiqueta="Lugares" ayuda={hayRegiones ? "Este conjunto segmenta por regiones o ciudades: cambiarlas se hace en Meta (cambiar países aquí pisaría esa segmentación)." : "Códigos de 2 letras separados por coma: CL, PE."}>
          {hayRegiones ? (
            <p className="rounded-xl border border-foreground/10 bg-foreground/[0.04] px-3 py-2 text-sm leading-6">
              {[...(seg?.paises ?? []), ...(seg?.regiones.map((r) => r.name) ?? []), ...(seg?.ciudades.map((x) => `${x.name}${x.radio ? ` (+${x.radio} km)` : ""}`) ?? [])].join("; ") || "—"}
            </p>
          ) : (
            <Input value={valores.paises ?? ""} onChange={(e) => poner("paises")(e.target.value)} />
          )}
        </Fila>
        <div className="grid grid-cols-2 gap-3">
          <Fila etiqueta="Edad mínima" ayuda={seg?.edadSugerida ? `Meta sugiere ${seg.edadSugerida[0]}–${seg.edadSugerida[1]}+.` : undefined}>
            <Input inputMode="numeric" value={valores.edadMin ?? ""} onChange={(e) => poner("edadMin")(e.target.value)} />
          </Fila>
          <Fila etiqueta="Edad máxima">
            <Input inputMode="numeric" value={valores.edadMax ?? ""} onChange={(e) => poner("edadMax")(e.target.value)} />
          </Fila>
        </div>
        <Fila etiqueta="Sexo">
          <NativeSelect value={valores.generos ?? "todos"} onChange={(e) => poner("generos")(e.target.value)}>
            <NativeSelectOption value="todos">Todos los sexos</NativeSelectOption>
            <NativeSelectOption value="hombres">Hombres</NativeSelectOption>
            <NativeSelectOption value="mujeres">Mujeres</NativeSelectOption>
          </NativeSelect>
        </Fila>
        <SegmentacionMeta
          accountId={accountId}
          nombresIniciales={nombresIniciales}
          intereses={csv(valores.interesesIds)}
          incluidas={csv(valores.audIncluir)}
          excluidas={csv(valores.audExcluir)}
          onChange={(cambios) => {
            if (cambios.metaInterests) poner("interesesIds")(cambios.metaInterests.join(","));
            if (cambios.metaCustomAudiences) poner("audIncluir")(cambios.metaCustomAudiences.join(","));
            if (cambios.metaExcludedAudiences) poner("audExcluir")(cambios.metaExcludedAudiences.join(","));
          }}
        />
      </Tarjeta>

      <Tarjeta titulo="Ubicaciones" insignia={automaticas ? "Ubicaciones Advantage+" : "Ubicaciones manuales"}>
        <p className="text-xs leading-5 text-foreground/55">
          {automaticas ? "Meta reparte los anuncios entre todas las ubicaciones disponibles. Marca redes, formatos o ubicaciones para elegirlas tú." : "Estás eligiendo las ubicaciones a mano. Desmarca todo para volver a las ubicaciones Advantage+."}
        </p>
        <Fila etiqueta="Redes" ayuda="Sin marcar ninguna, Meta elige las redes automáticamente.">
          <div className="flex flex-wrap gap-3 text-sm">
            {(["facebook", "instagram", "audience_network", "messenger"] as const).map((red) => (
              <label key={red} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={marcadasRedes.includes(red)}
                  onChange={(e) => poner("plataformas")((e.target.checked ? [...marcadasRedes, red] : marcadasRedes.filter((x) => x !== red)).join(","))}
                />
                {red === "audience_network" ? "Audience Network" : red.charAt(0).toUpperCase() + red.slice(1)}
              </label>
            ))}
          </div>
        </Fila>
        <Fila etiqueta="Formatos" ayuda="Dónde se muestra dentro de Facebook e Instagram. Exige haber marcado la red.">
          <div className="flex flex-wrap gap-3 text-sm">
            {FORMATOS_META.map((f) => {
              const marcados = csv(valores.formatos);
              return (
                <label key={f} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={marcados.includes(f)} onChange={(e) => poner("formatos")((e.target.checked ? [...marcados, f] : marcados.filter((x) => x !== f)).join(","))} />
                  {META_SURFACES[f].label}
                </label>
              );
            })}
          </div>
        </Fila>
        <details className="rounded-xl border border-foreground/10 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-foreground/80">Todas las ubicaciones</summary>
          <div className="mt-3 space-y-3">
            {REDES_CON_POSICIONES.map((red: RedConPosiciones) => {
              const marcadas = csv(valores[`pos:${red}`]);
              return (
                <div key={red}>
                  <p className="font-micro mb-1 text-[0.6rem] text-foreground/50">{red === "audience_network" ? "AUDIENCE NETWORK" : red.toUpperCase()}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                    {POSICIONES_META[red].map((p) => (
                      <label key={p.valor} className="flex items-center gap-1.5">
                        <input type="checkbox" checked={marcadas.includes(p.valor)} onChange={(e) => poner(`pos:${red}`)((e.target.checked ? [...marcadas, p.valor] : marcadas.filter((x) => x !== p.valor)).join(","))} />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      </Tarjeta>

      <Tarjeta titulo="Optimización y entrega">
        <Fila etiqueta="Ventana de atribución" ayuda="Meta solo admite algunas ventanas según lo que optimiza el conjunto. «Sin cambios» no la toca.">
          <NativeSelect value={valores.atribucion ?? ""} onChange={(e) => poner("atribucion")(e.target.value)}>
            <NativeSelectOption value="">Sin cambios</NativeSelectOption>
            {atribucionesAdmitidas("ventas").map((id) => (
              <NativeSelectOption key={id} value={id}>
                {{ default: "Predeterminada de Meta", click_1d: "1 día tras el clic", click_7d: "7 días tras el clic", click_1d_view_1d: "1 día tras el clic o la vista" }[id]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Fila>
        <Fila etiqueta="Cuándo se te cobra">
          <p className="rounded-xl border border-foreground/10 bg-foreground/[0.04] px-3 py-2 text-sm">{c?.cobroPor === "IMPRESSIONS" ? "Impresión" : c?.cobroPor ?? "—"}</p>
        </Fila>
      </Tarjeta>
    </div>
  );
}

/* ----------------------------------- Anuncio ----------------------------------- */

/** «Imagen nueva» del anuncio: pegar una URL, subir un archivo o usar una publicación ya publicada (esta última la prepara el Orb con vista previa). */
function PiezaNueva({ accountId, conjuntoId, valores, poner, alSubir }: { accountId: string; conjuntoId: string | null; valores: Valores; poner: Poner; alSubir?: (url: string) => void }) {
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selector, setSelector] = useState(false);

  async function cliente(): Promise<string> {
    if (portfolioId) return portfolioId;
    const r = await fetch(`/api/entidades/cliente-de-cuenta?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
    const j = (await r.json().catch(() => null)) as { portfolioId?: string; error?: string } | null;
    if (!r.ok || !j?.portfolioId) throw new Error(j?.error ?? "No se pudo identificar al cliente.");
    setPortfolioId(j.portfolioId);
    return j.portfolioId;
  }

  async function subir(archivo: File) {
    setError(null);
    if (!archivo.type.startsWith("image/")) {
      setError("Aquí se sube una imagen. Para un video, usa «Elegir una publicación existente» o el Constructor.");
      return;
    }
    setSubiendo(true);
    try {
      const pid = await cliente();
      const r = await fetch("/api/creatividades/subir", { method: "POST", headers: { "content-type": archivo.type, "x-portfolio-id": encodeURIComponent(pid) }, body: archivo });
      const crudo = await r.text();
      let j: { url?: string; error?: string } = {};
      try {
        j = JSON.parse(crudo) as typeof j;
      } catch {
        j = { error: r.status === 413 ? "El archivo pesa demasiado: sube uno más liviano o pega su URL." : `No se pudo subir (${r.status}).` };
      }
      if (!r.ok || !j.url) throw new Error(j.error ?? "No se pudo subir el archivo");
      if (alSubir) alSubir(j.url);
      else poner("imagenUrl")(j.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el archivo");
    } finally {
      setSubiendo(false);
    }
  }

  function usarPublicacion(post: Publicacion) {
    setSelector(false);
    const enlace = post.permalink || "";
    if (!enlace) {
      setError("Esa publicación no trae enlace público: pega su link en el Orb.");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("wiwo:orb-pedir", {
        detail: {
          decisionId: "",
          texto: `Quiero usar esta publicación como anuncio nuevo en el conjunto ${conjuntoId ?? ""} (cuenta ${accountId}): ${enlace}. Muéstrame primero la vista previa y dime qué piezas viejas convendría retirar; no envíes nada hasta que confirme.`,
        },
      }),
    );
  }

  return (
    <div className="space-y-2">
      {!alSubir && <Input value={valores.imagenUrl ?? ""} onChange={(e) => poner("imagenUrl")(e.target.value)} placeholder="https://… (URL pública de la imagen)" />}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-semibold text-foreground/75 hover:border-brand/40 hover:text-brand">
          {subiendo ? "Subiendo…" : "Subir archivo"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={subiendo}
            onChange={(e) => {
              const a = e.target.files?.[0];
              e.target.value = "";
              if (a) void subir(a);
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setError(null);
            void cliente().then(() => setSelector(true)).catch((e: unknown) => setError(e instanceof Error ? e.message : "No se pudo abrir el selector"));
          }}
          className="rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-semibold text-foreground/75 hover:border-brand/40 hover:text-brand"
        >
          Elegir una publicación existente
        </button>
        {!alSubir && valores.imagenUrl && <span className="text-xs text-foreground/50">La imagen nueva reemplaza a la actual al aplicar.</span>}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {portfolioId && (
        <SelectorDePublicaciones open={selector} onOpenChange={setSelector} portfolioId={portfolioId} accountId={accountId} nombreCuenta={accountId} onSeleccionar={usarPublicacion} />
      )}
    </div>
  );
}

export function EditorMetaAnuncio({ anuncio, valores, poner, contenidoBloqueado, accountId, crearVersion }: { anuncio: DetalleAnuncio | null; valores: Valores; poner: Poner; contenidoBloqueado: boolean; accountId: string; crearVersion?: (imagenUrl: string | null) => void }) {
  const antesCta = anuncio?.contenido.cta ?? null;
  return (
    <div className="space-y-4">
      <InterruptorDeEstado estado={anuncio?.estado ?? null} nivel="anuncio" valores={valores} poner={poner} />
      <Tarjeta titulo="Nombre del anuncio">
        <Input value={valores.nombre ?? ""} onChange={(e) => poner("nombre")(e.target.value)} />
      </Tarjeta>
      {contenidoBloqueado && (
        <p className="rounded-xl border border-warn/25 bg-warn/8 p-3 text-sm leading-6 text-foreground/70">
          Este anuncio usa una publicación existente: Meta no deja cambiar su texto, título, destino, botón ni imagen desde el anuncio. Aquí se pueden cambiar el nombre y los parámetros de URL (UTM). Para cambiar el contenido, usa «Crear una versión nueva con cambios» o edita la publicación original.
        </p>
      )}
      {contenidoBloqueado && crearVersion && (
        <Tarjeta titulo="Cambiar la pieza (gráfica)">
          <p className="text-xs leading-5 text-foreground/60">
            Meta no deja cambiar la pieza de un anuncio hecho desde una publicación: se crea un anuncio nuevo en este mismo conjunto con la pieza que elijas
            (el original sigue publicado hasta que lo pauses).
          </p>
          <PiezaNueva accountId={accountId} conjuntoId={anuncio?.conjuntoId ?? null} valores={valores} poner={poner} alSubir={(url) => crearVersion(url)} />
          <button
            type="button"
            onClick={() => crearVersion(null)}
            className="rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-semibold text-foreground/75 hover:border-brand/40 hover:text-brand"
          >
            Crear versión con la pieza actual
          </button>
        </Tarjeta>
      )}
      <Tarjeta titulo="Configuración del anuncio">
        <fieldset disabled={contenidoBloqueado} className={cn("space-y-4", contenidoBloqueado && "opacity-50")}>
          <Fila etiqueta="Texto principal">
            <Textarea rows={5} value={valores.textoPrincipal ?? ""} onChange={(e) => poner("textoPrincipal")(e.target.value)} />
          </Fila>
          <Fila etiqueta="Título">
            <Input value={valores.titulo ?? ""} onChange={(e) => poner("titulo")(e.target.value)} />
          </Fila>
          <Fila etiqueta="Descripción" ayuda="Meta no entrega la descripción actual: vacío = no cambiarla.">
            <Input value={valores.descripcion ?? ""} onChange={(e) => poner("descripcion")(e.target.value)} />
          </Fila>
          <Fila
            etiqueta="Llamada a la acción"
            ayuda={valores.cta && CTA_CON_DESTINO.has(valores.cta) ? "Este botón exige un destino compatible (llamada, WhatsApp, app, evento…). Si el anuncio no lo tiene, Meta rechaza el cambio." : `Hoy: ${etiquetaCta(antesCta)}.`}
          >
            <NativeSelect value={valores.cta ?? ""} onChange={(e) => poner("cta")(e.target.value)}>
              <NativeSelectOption value="">Sin cambios</NativeSelectOption>
              <optgroup label="Más usados">
                {CTA_COMUNES.map((clave) => (
                  <NativeSelectOption key={clave} value={clave}>{CTA_ETIQUETAS[clave]}</NativeSelectOption>
                ))}
              </optgroup>
              <optgroup label="Todos los demás">
                {CTA_CODIGOS.filter((c) => !(CTA_COMUNES as readonly string[]).includes(c)).map((clave) => (
                  <NativeSelectOption key={clave} value={clave}>{CTA_ETIQUETAS[clave]}</NativeSelectOption>
                ))}
              </optgroup>
            </NativeSelect>
          </Fila>
          <Fila etiqueta="Destino: URL del sitio web">
            <Input value={valores.urlDestino ?? ""} onChange={(e) => poner("urlDestino")(e.target.value)} />
          </Fila>
          <Fila etiqueta="Imagen nueva" ayuda="Pega una URL pública, sube un archivo o elige una publicación ya publicada. Vacío = no cambiar. Las URLs de imagen de Meta caducan, por eso no se precarga la actual.">
            <PiezaNueva accountId={accountId} conjuntoId={anuncio?.conjuntoId ?? null} valores={valores} poner={poner} />
          </Fila>
        </fieldset>
      </Tarjeta>
      <Tarjeta titulo="Seguimiento">
        <Fila etiqueta="Parámetros de URL (UTM)">
          <Input value={valores.urlTags ?? ""} onChange={(e) => poner("urlTags")(e.target.value)} />
        </Fila>
        <Fila etiqueta="Dominio de conversión" ayuda="Para la atribución: el dominio al que lleva el anuncio, sin https:// (ejemplo.com). Vacío no cambia nada.">
          <Input value={valores.dominioConversion ?? ""} onChange={(e) => poner("dominioConversion")(e.target.value)} placeholder="ejemplo.com" />
        </Fila>
        <Fila etiqueta="Mensaje de bienvenida" ayuda="Solo anuncios de mensajes (Messenger o Instagram Direct): el saludo automático al abrir la conversación. Vacío no cambia nada.">
          <Textarea rows={2} value={valores.mensajeBienvenida ?? ""} onChange={(e) => poner("mensajeBienvenida")(e.target.value)} />
        </Fila>
      </Tarjeta>
    </div>
  );
}
