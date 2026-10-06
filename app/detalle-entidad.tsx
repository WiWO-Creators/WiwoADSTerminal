"use client";

import { fetchConReintento } from "@/lib/fetch-reintento";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ChevronRight, ExternalLink, ImageOff, Search, Settings2, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import type {
  DetalleAnuncio,
  DetalleCampana,
  DetalleConjunto,
  Presupuesto,
  SegmentacionMeta,
  TextoRsa,
} from "@/lib/detalle-entidad";
import type { AdSummary } from "@/lib/performance-store";
import { nombreDeNivel, platformLabel, type NivelEntidad, type Platform } from "@/lib/plataformas";
import { cn } from "@/lib/utils";
import { DesgloseEntidad } from "./desglose-entidad";
import { EditarEntidad, type AccionesEditor } from "./editar-entidad";
import { GestionarCampanaDialog } from "./gestionar-campana";
import { OrbeDeBoton } from "./ui";

export type EntidadParaDetalle = {
  provider: string;
  accountId: string;
  nivel: NivelEntidad;
  id: string;
  nombre: string;
  currency: string | null;
  /** Abrir directo en la pestaña de edición. */
  abrirEnEdicion?: boolean;
  /** Periodo que se está mirando en la tabla, para el desglose. */
  rango?: string;
  /** Cambio ya cargado en el formulario (viene de una sugerencia aprobada). Se
   * revisa y se aplica como cualquier otro: no se ejecuta solo. */
  sugerido?: { presupuestoMonto?: string };
};

type Respuesta = {
  encontrada: boolean;
  ventanaDias: number;
  fuente: "windsor" | "nativa";
  avisos: string[];
  campana: DetalleCampana | null;
  conjunto: DetalleConjunto | null;
  anuncio: DetalleAnuncio | null;
};

/* -------------------------------------------------------------------------- */
/* Árbol de navegación (campaña → conjunto → anuncio) de la cuenta            */
/* -------------------------------------------------------------------------- */

type Nodo = {
  clave: string;
  nivel: NivelEntidad;
  id: string;
  nombre: string;
  status: string | null;
  hijos: Nodo[];
};

const esActivo = (status: string | null) => (status ?? "").toUpperCase() === "ACTIVE" || (status ?? "").toUpperCase() === "ENABLED";

function primerTitulo(nombre: string): string {
  return nombre.split("|")[0]?.trim() || nombre;
}

/** Solo lo que tiene id nativo: sin id no se puede leer ni escribir en la plataforma. */
function armarArbol(ads: AdSummary[], provider: string, accountId: string): Nodo[] {
  const campanas = new Map<string, Nodo>();
  const conjuntos = new Map<string, Nodo>();
  for (const ad of ads) {
    if (ad.provider !== provider || ad.accountId !== accountId || !ad.campaignId) continue;
    let campana = campanas.get(ad.campaignId);
    if (!campana) {
      campana = {
        clave: `campana:${ad.campaignId}`,
        nivel: "campana",
        id: ad.campaignId,
        nombre: ad.campaignName,
        status: ad.status,
        hijos: [],
      };
      campanas.set(ad.campaignId, campana);
    }
    if (esActivo(ad.status)) campana.status = ad.status;
    if (!ad.adsetId) continue;
    let conjunto = conjuntos.get(ad.adsetId);
    if (!conjunto) {
      conjunto = {
        clave: `conjunto:${ad.adsetId}`,
        nivel: "conjunto",
        id: ad.adsetId,
        nombre: ad.adsetName ?? ad.adsetId,
        status: ad.status,
        hijos: [],
      };
      conjuntos.set(ad.adsetId, conjunto);
      campana.hijos.push(conjunto);
    }
    if (esActivo(ad.status)) conjunto.status = ad.status;
    if (ad.adId && !conjunto.hijos.some((h) => h.id === ad.adId)) {
      conjunto.hijos.push({
        clave: `anuncio:${ad.adId}`,
        nivel: "anuncio",
        id: ad.adId,
        nombre: ad.adName ? primerTitulo(ad.adName) : ad.adId,
        status: ad.status,
        hijos: [],
      });
    }
  }
  return [...campanas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Camino desde la campaña hasta el nodo (para el migas de pan y para abrir el árbol). */
function caminoA(arbol: Nodo[], clave: string): Nodo[] {
  for (const nodo of arbol) {
    if (nodo.clave === clave) return [nodo];
    const dentro = caminoA(nodo.hijos, clave);
    if (dentro.length > 0) return [nodo, ...dentro];
  }
  return [];
}

function filtrarArbol(arbol: Nodo[], texto: string): Nodo[] {
  const q = texto.trim().toLowerCase();
  if (!q) return arbol;
  const resultado: Nodo[] = [];
  for (const nodo of arbol) {
    const hijos = filtrarArbol(nodo.hijos, texto);
    if (nodo.nombre.toLowerCase().includes(q) || hijos.length > 0) {
      resultado.push({ ...nodo, hijos: nodo.nombre.toLowerCase().includes(q) ? nodo.hijos : hijos });
    }
  }
  return resultado;
}

const ICONO: Record<NivelEntidad, string> = { campana: "📣", conjunto: "🗂️", anuncio: "🖼️" };

function FilaArbol({
  nodo,
  profundidad,
  abiertos,
  forzarAbierto,
  seleccionada,
  onAlternar,
  onElegir,
}: {
  nodo: Nodo;
  profundidad: number;
  abiertos: Set<string>;
  forzarAbierto: boolean;
  seleccionada: string;
  onAlternar: (clave: string) => void;
  onElegir: (nodo: Nodo) => void;
}) {
  const abierto = forzarAbierto || abiertos.has(nodo.clave);
  const tieneHijos = nodo.hijos.length > 0;
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onElegir(nodo)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onElegir(nodo);
        }}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 rounded-lg py-2 pr-2 text-sm transition-colors hover:bg-foreground/5",
          seleccionada === nodo.clave ? "bg-brand/12 font-semibold text-brand" : "text-foreground/75",
        )}
        style={{ paddingLeft: `${profundidad * 16 + 8}px` }}
      >
        {tieneHijos ? (
          <button
            type="button"
            aria-label={abierto ? "Contraer" : "Expandir"}
            onClick={(e) => {
              e.stopPropagation();
              onAlternar(nodo.clave);
            }}
            className="shrink-0 text-foreground/40 hover:text-foreground"
          >
            <ChevronRight className={cn("size-3.5 transition-transform", abierto && "rotate-90")} />
          </button>
        ) : (
          <span className="inline-block size-3.5 shrink-0" />
        )}
        <span
          className={cn("size-2 shrink-0 rounded-full", esActivo(nodo.status) ? "bg-ok-deep" : "bg-foreground/25")}
          title={esActivo(nodo.status) ? "Activo" : "Pausado"}
        />
        <span aria-hidden className="shrink-0 text-xs">{ICONO[nodo.nivel]}</span>
        <span className="min-w-0 flex-1 truncate" title={nodo.nombre}>{nodo.nombre}</span>
        {tieneHijos && <span className="shrink-0 text-[0.65rem] text-foreground/35">{nodo.hijos.length}</span>}
      </div>
      {abierto &&
        nodo.hijos.map((h) => (
          <FilaArbol
            key={h.clave}
            nodo={h}
            profundidad={profundidad + 1}
            abiertos={abiertos}
            forzarAbierto={forzarAbierto}
            seleccionada={seleccionada}
            onAlternar={onAlternar}
            onElegir={onElegir}
          />
        ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Editor a pantalla completa                                                 */
/* -------------------------------------------------------------------------- */

type Modo = "editar" | "desglose";

/**
 * Editor de campañas, conjuntos y anuncios ya publicados, a pantalla completa
 * y con el árbol de la cuenta a un costado, como el de Meta. Muestra la
 * configuración completa que hoy tiene la entidad en la plataforma y, en el
 * mismo lugar, los campos que se pueden cambiar. Cerrar con cambios sin
 * aplicar pregunta antes; nada se escribe sin "Revisar" y "Aplicar".
 */
export function DetalleEntidadSheet({
  entidad,
  ads,
  puedeAprobar,
  onOpenChange,
  onAplicado,
  onCrearVersion,
}: {
  entidad: EntidadParaDetalle | null;
  /** Filas de la tabla: de ahí sale el árbol de la cuenta. */
  ads: AdSummary[];
  /** Aplicar un cambio exige poder aprobarlo; ver y simular no. */
  puedeAprobar: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llamó tras aplicar un cambio en la plataforma: la tabla de atrás ya quedó vieja. */
  onAplicado?: () => void;
  /**
   * Un anuncio de Meta que usa una publicación existente no se puede editar en el anuncio: con esto se arma uno
   * NUEVO, en el mismo conjunto, con su contenido para cambiarlo. Sin esta función, el botón no aparece.
   */
  onCrearVersion?: (datos: {
    nombre: string;
    accountId: string;
    campaignId: string;
    campaignName: string;
    adsetId: string;
    adsetName: string;
    textoPrincipal: string | null;
    titulo: string | null;
    urlDestino: string | null;
    cta: string | null;
    imagenUrl: string | null;
  }) => void;
}) {
  // La entidad que se muestra puede cambiar desde el árbol sin cerrar el editor.
  const [navegando, setNavegando] = useState<{ base: EntidadParaDetalle; actual: EntidadParaDetalle } | null>(null);
  const actual = entidad ? (navegando && navegando.base === entidad ? navegando.actual : entidad) : null;

  const [version, setVersion] = useState(0);
  const [eleccion, setEleccion] = useState<{ clave: string; modo: Modo } | null>(null);
  const [avanzadas, setAvanzadas] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  // "Sucio" queda ligado a la entidad y versión donde se editó: al cambiar de una
  // a otra (o tras aplicar) deja de contar sin tener que reiniciarlo a mano.
  const [sucio, setSucio] = useState<{ clave: string; valor: boolean } | null>(null);
  // Lo que se quería hacer cuando había cambios sin aplicar.
  const [pendiente, setPendiente] = useState<{ tipo: "cerrar" } | { tipo: "ir"; a: EntidadParaDetalle } | null>(null);
  const acciones = useRef<AccionesEditor | null>(null);

  const [resultado, setResultado] = useState<{ clave: string; datos: Respuesta | null; error: string | null } | null>(
    null,
  );
  const claveEntidad = actual ? `${actual.provider}:${actual.accountId}:${actual.nivel}:${actual.id}` : null;
  const clave = claveEntidad ? `${claveEntidad}:${version}` : null;
  const modo: Modo = eleccion && eleccion.clave === claveEntidad ? eleccion.modo : "editar";
  const vigente = resultado && resultado.clave === clave ? resultado : null;
  const cargando = clave !== null && vigente === null;
  const datos = vigente?.datos ?? null;
  const error = vigente?.error ?? null;
  // Con un cambio sugerido ya cargado, el formulario nace "sucio" hasta que se
  // aplica o se descarta.
  const conSugerido = Boolean(actual?.sugerido) && version === 0;
  const hayCambios = sucio && sucio.clave === clave ? sucio.valor : conSugerido;

  useEffect(() => {
    if (!actual || !clave) return;
    const control = new AbortController();
    const params = new URLSearchParams({
      provider: actual.provider,
      accountId: actual.accountId,
      nivel: actual.nivel,
      id: actual.id,
    });
    fetchConReintento(`/api/entidades/detalle?${params}`, { signal: control.signal }, 3, 45_000)
      .then(async (respuesta) => {
        const cuerpo = await respuesta.json().catch(() => null);
        if (!respuesta.ok) throw new Error(cuerpo?.error ?? "No se pudo leer la configuración");
        setResultado({ clave, datos: cuerpo as Respuesta, error: null });
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setResultado({
          clave,
          datos: null,
          error: e instanceof Error ? e.message : "No se pudo leer la configuración",
        });
      });
    return () => control.abort();
  }, [actual, clave]);

  const arbol = useMemo(
    () => (actual ? armarArbol(ads, actual.provider, actual.accountId) : []),
    [ads, actual],
  );
  const claveNodo = actual ? `${actual.nivel}:${actual.id}` : "";
  const camino = useMemo(() => caminoA(arbol, claveNodo), [arbol, claveNodo]);
  const visibles = useMemo(() => filtrarArbol(arbol, busqueda), [arbol, busqueda]);

  // Al abrir el editor y al cambiar de entidad se expanden los padres de la actual.
  const abiertosConCamino = useMemo(() => {
    const s = new Set(abiertos);
    for (const n of camino.slice(0, -1)) s.add(n.clave);
    return s;
  }, [abiertos, camino]);

  // Esc y bloqueo de scroll de la página mientras el editor está abierto.
  const abierto = entidad !== null;
  const pedirCierreRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const teclas = (e: KeyboardEvent) => {
      if (e.key === "Escape") pedirCierreRef.current();
    };
    window.addEventListener("keydown", teclas);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener("keydown", teclas);
    };
  }, [abierto]);

  function cerrarDeVerdad() {
    setPendiente(null);
    setNavegando(null);
    setBusqueda("");
    onOpenChange(false);
  }
  function pedirCierre() {
    if (hayCambios) setPendiente({ tipo: "cerrar" });
    else cerrarDeVerdad();
  }
  useEffect(() => {
    pedirCierreRef.current = pedirCierre;
  });

  function irA(destino: EntidadParaDetalle) {
    if (!entidad) return;
    if (hayCambios) {
      setPendiente({ tipo: "ir", a: destino });
      return;
    }
    setNavegando({ base: entidad, actual: destino });
  }
  function elegirNodo(nodo: Nodo) {
    if (!actual || nodo.clave === claveNodo) return;
    irA({
      provider: actual.provider,
      accountId: actual.accountId,
      nivel: nodo.nivel,
      id: nodo.id,
      nombre: nodo.nombre,
      currency: actual.currency,
      rango: actual.rango,
    });
  }

  function descartarYContinuar() {
    const p = pendiente;
    setPendiente(null);
    if (!p) return;
    if (p.tipo === "cerrar") {
      cerrarDeVerdad();
    } else if (entidad) {
      setSucio(null);
      setNavegando({ base: entidad, actual: p.a });
    }
  }
  function revisarYAplicar() {
    setPendiente(null);
    setEleccion(claveEntidad ? { clave: claveEntidad, modo: "editar" } : null);
    acciones.current?.simular();
  }

  if (!entidad || !actual || typeof document === "undefined") return null;
  const moneda = actual.currency;
  const anuncioActual = datos?.anuncio ?? null;

  const migas = camino.length > 0 ? camino : [{ nivel: actual.nivel, nombre: actual.nombre, clave: claveNodo } as Nodo];

  return createPortal(
    <div className="fixed inset-0 z-50 flex bg-background text-foreground" role="dialog" aria-modal="true">
      {/* Árbol de la cuenta: ocupa todo el costado, como en Meta. */}
      <aside className="hidden w-80 shrink-0 flex-col border-r border-foreground/10 bg-card/40 md:flex">
        <div className="border-b border-foreground/10 p-3">
          <p className="mb-2 truncate text-xs font-bold uppercase tracking-wide text-foreground/45">
            {platformLabel(actual.provider)} · cuenta {actual.accountId}
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/35" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar"
              className="w-full rounded-full border border-foreground/12 bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-brand/50"
            />
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Campañas, conjuntos y anuncios">
          {visibles.length === 0 ? (
            <p className="p-3 text-sm text-foreground/45">
              {arbol.length === 0
                ? "No hay más entidades de esta cuenta para mostrar en el árbol."
                : "Nada coincide con la búsqueda."}
            </p>
          ) : (
            visibles.map((n) => (
              <FilaArbol
                key={n.clave}
                nodo={n}
                profundidad={0}
                abiertos={abiertosConCamino}
                forzarAbierto={busqueda.trim() !== ""}
                seleccionada={claveNodo}
                onAlternar={(c) =>
                  setAbiertos((prev) => {
                    const s = new Set(prev);
                    if (s.has(c)) s.delete(c);
                    else s.add(c);
                    return s;
                  })
                }
                onElegir={elegirNodo}
              />
            ))
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior: migas de pan, pestañas y cerrar. */}
        <header className="flex flex-wrap items-center gap-3 border-b border-foreground/10 px-4 py-3">
          <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-sm" aria-label="Ubicación">
            {migas.map((m, i) => (
              <span key={m.clave} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-foreground/30" />}
                <button
                  type="button"
                  disabled={i === migas.length - 1}
                  onClick={() => elegirNodo(m)}
                  className={cn(
                    "max-w-[16rem] truncate rounded-md px-1.5 py-0.5",
                    i === migas.length - 1 ? "bg-brand/12 font-semibold text-brand" : "text-foreground/60 hover:bg-foreground/6",
                  )}
                  title={m.nombre}
                >
                  {m.nombre}
                </button>
              </span>
            ))}
          </nav>
          <div className="flex gap-1 rounded-xl bg-foreground/6 p-1 text-sm">
            {(["editar", "desglose"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => claveEntidad && setEleccion({ clave: claveEntidad, modo: m })}
                className={
                  modo === m
                    ? "rounded-lg bg-card px-4 py-1.5 font-semibold shadow-sm"
                    : "rounded-lg px-4 py-1.5 text-foreground/55 hover:text-foreground"
                }
              >
                {m === "editar" ? "Editar" : "Desglose"}
              </button>
            ))}
          </div>
          {hayCambios && (
            <Badge variant="outline" className="border-warn/40 text-warn">
              Cambios sin aplicar
            </Badge>
          )}
          <button
            type="button"
            onClick={pedirCierre}
            aria-label="Cerrar"
            className="rounded-full border border-foreground/15 p-2 text-foreground/60 transition-colors hover:border-brand/40 hover:text-brand"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <main className="min-w-0 space-y-5">
              <div>
                <h2 className="text-xl font-semibold leading-snug">{actual.nombre}</h2>
                <p className="text-sm text-foreground/50">
                  {nombreDeNivel(actual.provider, actual.nivel)} · {platformLabel(actual.provider)}
                </p>
              </div>

              {cargando && (
                <div className="flex items-center gap-2 text-sm text-foreground/50">
                  <OrbeDeBoton /> Leyendo la configuración en la plataforma…
                </div>
              )}
              {error && (
                <p className="rounded-xl border border-danger/25 bg-danger/8 p-3 text-sm text-danger">{error}</p>
              )}
              {datos && datos.avisos.length > 0 && (
                <ul className="space-y-1 rounded-xl border border-foreground/10 bg-foreground/4 p-3 text-xs leading-5 text-foreground/55">
                  {datos.avisos.map((aviso) => (
                    <li key={aviso}>{aviso}</li>
                  ))}
                </ul>
              )}
              {datos && !datos.encontrada && (
                <p className="rounded-xl border border-foreground/10 p-3 text-sm text-foreground/60">
                  No apareció en los últimos {datos.ventanaDias} días. Una entidad pausada hace más tiempo que eso no
                  se ve desde acá, aunque siga existiendo en la plataforma.
                </p>
              )}

              {datos?.encontrada && modo === "desglose" && (
                <DesgloseEntidad
                  provider={actual.provider}
                  accountId={actual.accountId}
                  nivel={actual.nivel}
                  id={actual.id}
                  currency={actual.currency}
                  rango={actual.rango}
                />
              )}

              {datos?.encontrada && modo === "editar" && (
                <>
                  <Bloque titulo="Editar">
                    <EditarEntidad
                      key={clave ?? ""}
                      ref={acciones}
                      provider={actual.provider}
                      accountId={actual.accountId}
                      nivel={actual.nivel}
                      id={actual.id}
                      currency={actual.currency}
                      campana={datos.campana}
                      conjunto={datos.conjunto}
                      anuncio={datos.anuncio}
                      puedeAprobar={puedeAprobar}
                      valoresIniciales={conSugerido ? actual.sugerido : undefined}
                      onSucio={(valor) => clave && setSucio({ clave, valor })}
                      onAplicado={() => {
                        setVersion((v) => v + 1);
                        onAplicado?.();
                      }}
                    />
                  </Bloque>

                  {puedeAprobar &&
                    onCrearVersion &&
                    actual.nivel === "anuncio" &&
                    actual.provider === "meta" &&
                    datos.anuncio &&
                    !datos.anuncio.edicionDeContenido.editable &&
                    datos.anuncio.edicionDeContenido.via === "ninguna" &&
                    datos.conjunto &&
                    datos.campana && (
                      <button
                        type="button"
                        onClick={() => {
                          const a = datos.anuncio!;
                          onCrearVersion({
                            nombre: a.nombre ?? actual.nombre,
                            accountId: actual.accountId,
                            campaignId: datos.campana!.id,
                            campaignName: datos.campana!.nombre ?? "",
                            adsetId: datos.conjunto!.id,
                            adsetName: datos.conjunto!.nombre ?? "",
                            textoPrincipal: a.contenido.textoPrincipal,
                            titulo: a.contenido.titulo,
                            urlDestino: a.contenido.urlDestino,
                            cta: a.contenido.cta,
                            imagenUrl: a.contenido.imagenUrl ?? a.contenido.miniaturaUrl,
                          });
                        }}
                        className="flex w-full items-center justify-between rounded-xl border border-brand/30 bg-brand/6 px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-brand/12"
                      >
                        <span>
                          <span className="block font-semibold">Crear una versión nueva con cambios</span>
                          <span className="block text-xs text-foreground/55">
                            Abre el Creador con su texto, destino y pieza para editarlos como un anuncio nuevo en este mismo conjunto.
                            Pierde las reacciones y comentarios de la publicación, y el original sigue publicado hasta que lo pauses.
                          </span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-brand" />
                      </button>
                    )}

                  {puedeAprobar && actual.nivel !== "anuncio" && (
                    <button
                      type="button"
                      onClick={() => setAvanzadas(true)}
                      className="flex w-full items-center justify-between rounded-xl border border-foreground/10 px-4 py-3 text-left text-sm text-foreground/70 transition-colors hover:border-brand/30 hover:text-brand"
                    >
                      <span>
                        <span className="block font-semibold">Más opciones</span>
                        <span className="block text-xs text-foreground/45">
                          {actual.provider === "google"
                            ? "Estrategia de puja, idiomas, horario, negativas y extensiones"
                            : "Otras opciones de la campaña o el conjunto"}
                        </span>
                      </span>
                      <Settings2 className="size-4 shrink-0" />
                    </button>
                  )}

                  <Bloque titulo="Configuración completa en la plataforma" subtitulo="Todo lo que hoy tiene configurado, editable o no">
                    {actual.nivel === "campana" && datos.campana && <VistaCampana d={datos.campana} moneda={moneda} />}
                    {actual.nivel === "conjunto" && datos.conjunto && (
                      <VistaConjunto d={datos.conjunto} campana={datos.campana} moneda={moneda} />
                    )}
                    {actual.nivel === "anuncio" && datos.anuncio && (
                      <VistaAnuncio d={datos.anuncio} conjunto={datos.conjunto} sinImagen />
                    )}
                  </Bloque>
                </>
              )}
            </main>

            {/* Vista previa: así está hoy en la plataforma. */}
            <aside className="space-y-3 lg:sticky lg:top-0 lg:self-start">
              {datos?.encontrada && actual.nivel === "anuncio" && anuncioActual && (
                <VistaPrevia d={anuncioActual} />
              )}
              {datos?.encontrada && actual.nivel !== "anuncio" && (
                <ResumenLateral
                  campana={datos.campana}
                  conjunto={datos.conjunto}
                  nivel={actual.nivel}
                  moneda={moneda}
                />
              )}
            </aside>
          </div>
        </div>
      </div>

      <GestionarCampanaDialog
        campana={
          actual.nivel !== "anuncio"
            ? {
                provider: actual.provider as Platform,
                accountId: actual.accountId,
                nivel: actual.nivel,
                id: actual.id,
                nombre: actual.nombre,
                currency: actual.currency,
              }
            : null
        }
        open={avanzadas}
        onOpenChange={setAvanzadas}
      />

      <AlertDialog open={pendiente !== null} onOpenChange={(o) => !o && setPendiente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tienes cambios sin aplicar</AlertDialogTitle>
            <AlertDialogDescription>
              Editaste esta entidad pero todavía no confirmaste los cambios en la plataforma.
              {pendiente?.tipo === "ir" ? " Si te mueves a otra, se pierden." : " Si cierras, se pierden."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogCancel
              onClick={descartarYContinuar}
              className="border-danger/30 text-danger hover:bg-danger/8"
            >
              Descartar cambios
            </AlertDialogCancel>
            <AlertDialogAction onClick={revisarYAplicar}>Revisar y confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */

function Bloque({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-foreground/10 bg-card/40 p-4">
      <div>
        <h3 className="text-sm font-bold">{titulo}</h3>
        {subtitulo && <p className="text-xs text-foreground/45">{subtitulo}</p>}
      </div>
      {children}
    </section>
  );
}

function VistaPrevia({ d }: { d: DetalleAnuncio }) {
  const c = d.contenido;
  const imagen = c.imagenUrl ?? c.miniaturaUrl;
  return (
    <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-card/40">
      <p className="border-b border-foreground/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-foreground/45">
        Vista previa · así está hoy
      </p>
      {d.provider === "meta" ? (
        <div className="space-y-2 p-3 text-sm">
          {c.textoPrincipal && <p className="line-clamp-4 whitespace-pre-wrap">{c.textoPrincipal}</p>}
          {imagen ? (
            // Las URLs de imagen de Meta son firmadas y caducan: se piden de nuevo cada vez.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagen} alt="Pieza del anuncio" className="max-h-80 w-full rounded-lg object-contain" />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-lg bg-foreground/5 text-foreground/25">
              <ImageOff className="size-6" />
            </div>
          )}
          {(c.titulo || c.cta) && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-foreground/5 p-2">
              <span className="min-w-0 truncate font-semibold">{c.titulo ?? ""}</span>
              {c.cta && <Badge variant="outline">{c.cta}</Badge>}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1 p-4 text-sm">
          <p className="text-xs text-foreground/50">
            Anuncio · {c.urlDestino ? new URL(c.urlDestino, "https://x.invalid").host.replace("x.invalid", "") : "tu sitio"}
          </p>
          <p className="font-medium text-brand">
            {c.titulares.slice(0, 3).map((t) => t.texto).join(" | ") || "Sin titulares"}
          </p>
          <p className="text-foreground/70">
            {c.descripciones.slice(0, 2).map((t) => t.texto).join(" ") || "Sin descripciones"}
          </p>
        </div>
      )}
    </div>
  );
}

function ResumenLateral({
  campana,
  conjunto,
  nivel,
  moneda,
}: {
  campana: DetalleCampana | null;
  conjunto: DetalleConjunto | null;
  nivel: NivelEntidad;
  moneda: string | null;
}) {
  const e = nivel === "campana" ? campana : conjunto;
  if (!e) return null;
  return (
    <div className="rounded-2xl border border-foreground/10 bg-card/40 p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground/45">Resumen</p>
      <dl className="space-y-1.5 text-sm">
        <Dato etiqueta="Estado">{traducir(ESTADOS, e.estado) ?? NADA}</Dato>
        <Dato etiqueta="Presupuesto">
          <TextoPresupuesto p={e.presupuesto} moneda={moneda} />
        </Dato>
        {nivel === "campana" && campana && (
          <Dato etiqueta="Objetivo">{traducir(OBJETIVOS, campana.objetivo) ?? NADA}</Dato>
        )}
      </dl>
    </div>
  );
}

/* -------------------------------------------------------------------------- */


function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-[0.7rem] font-bold uppercase tracking-wide text-foreground/40">
        {titulo}
      </h4>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </section>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-foreground/50">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}

const ESTADOS: Record<string, string> = {
  ACTIVE: "Activa",
  ENABLED: "Activa",
  PAUSED: "Pausada",
  ARCHIVED: "Archivada",
  DELETED: "Eliminada",
  REMOVED: "Eliminada",
  IN_PROCESS: "En proceso",
  WITH_ISSUES: "Con problemas",
  PENDING_REVIEW: "En revisión",
  DISAPPROVED: "Rechazada",
  CAMPAIGN_PAUSED: "Campaña pausada",
  ADSET_PAUSED: "Conjunto pausado",
};

const OBJETIVOS: Record<string, string> = {
  OUTCOME_AWARENESS: "Reconocimiento",
  OUTCOME_TRAFFIC: "Tráfico",
  OUTCOME_ENGAGEMENT: "Interacción",
  OUTCOME_LEADS: "Clientes potenciales",
  OUTCOME_SALES: "Ventas",
  OUTCOME_APP_PROMOTION: "Promoción de la app",
  SEARCH: "Búsqueda",
  DISPLAY: "Display",
  SHOPPING: "Shopping",
  VIDEO: "Video",
  PERFORMANCE_MAX: "Performance Max",
  DEMAND_GEN: "Generación de demanda",
};

function traducir(mapa: Record<string, string>, valor: string | null): string | null {
  if (!valor) return null;
  return mapa[valor.toUpperCase()] ?? valor;
}

const NADA = <span className="font-normal text-foreground/30">—</span>;

function monto(valor: number | null, moneda: string | null): string | null {
  if (valor === null) return null;
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: moneda ?? "USD",
      maximumFractionDigits: 2,
    }).format(valor);
  } catch {
    return String(valor);
  }
}

function fecha(valor: string | null): string | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime())
    ? valor
    : d.toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
}

function TextoPresupuesto({ p, moneda }: { p: Presupuesto; moneda: string | null }) {
  const diario = monto(p.diario, moneda);
  const total = monto(p.total, moneda);
  if (diario) return <>{diario} por día</>;
  if (total) return <>{total} en total</>;
  if (p.enLaCampana) return <>Lo reparte la campaña</>;
  return NADA;
}

function Enlace({ href }: { href: string | null }) {
  if (!href) return NADA;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex max-w-full items-center gap-1 break-all text-brand hover:underline"
    >
      {href}
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

function VistaCampana({ d, moneda }: { d: DetalleCampana; moneda: string | null }) {
  return (
    <>
      <Seccion titulo="General">
        <Dato etiqueta="Estado">{traducir(ESTADOS, d.estado) ?? NADA}</Dato>
        <Dato etiqueta={d.provider === "google" ? "Tipo de campaña" : "Objetivo"}>
          {traducir(OBJETIVOS, d.objetivo) ?? NADA}
        </Dato>
        <Dato etiqueta="Inicio">{fecha(d.inicio) ?? NADA}</Dato>
        <Dato etiqueta="Fin">{fecha(d.fin) ?? NADA}</Dato>
        {d.categoriasEspeciales.length > 0 && (
          <Dato etiqueta="Categorías especiales">{d.categoriasEspeciales.join(", ")}</Dato>
        )}
      </Seccion>
      <Seccion titulo="Presupuesto y puja">
        <Dato etiqueta="Presupuesto">
          <TextoPresupuesto p={d.presupuesto} moneda={moneda} />
        </Dato>
        <Dato etiqueta="Estrategia de puja">{d.puja.estrategia ?? NADA}</Dato>
        {d.puja.objetivoCpa !== null && (
          <Dato etiqueta="CPA objetivo">{monto(d.puja.objetivoCpa, moneda)}</Dato>
        )}
        {d.puja.objetivoRoas !== null && <Dato etiqueta="ROAS objetivo">{d.puja.objetivoRoas}</Dato>}
      </Seccion>
      {d.redes && (
        <Seccion titulo="Redes">
          <Dato etiqueta="Búsqueda de Google">{d.redes.busqueda ? "Sí" : "No"}</Dato>
          <Dato etiqueta="Socios de búsqueda">{d.redes.asociadas ? "Sí" : "No"}</Dato>
          <Dato etiqueta="Display">{d.redes.display ? "Sí" : "No"}</Dato>
        </Seccion>
      )}
      {d.urlSeguimiento && (
        <Seccion titulo="Seguimiento">
          <Dato etiqueta="Plantilla de URL">
            <Enlace href={d.urlSeguimiento} />
          </Dato>
        </Seccion>
      )}
    </>
  );
}

function VistaConjunto({
  d,
  campana,
  moneda,
}: {
  d: DetalleConjunto;
  campana: DetalleCampana | null;
  moneda: string | null;
}) {
  return (
    <>
      <Seccion titulo="General">
        <Dato etiqueta="Estado">{traducir(ESTADOS, d.estado) ?? NADA}</Dato>
        {campana && <Dato etiqueta="Campaña">{campana.nombre ?? campana.id}</Dato>}
        {d.tipo && <Dato etiqueta="Tipo">{d.tipo}</Dato>}
        <Dato etiqueta="Inicio">{fecha(d.inicio) ?? NADA}</Dato>
        <Dato etiqueta="Fin">{fecha(d.fin) ?? NADA}</Dato>
      </Seccion>
      <Seccion titulo="Presupuesto y puja">
        <Dato etiqueta="Presupuesto">
          <TextoPresupuesto p={d.presupuesto} moneda={moneda} />
        </Dato>
        {d.puja.estrategia && <Dato etiqueta="Estrategia de puja">{d.puja.estrategia}</Dato>}
        {d.puja.monto !== null && <Dato etiqueta="Puja">{monto(d.puja.monto, moneda)}</Dato>}
        {d.puja.objetivoCpa !== null && (
          <Dato etiqueta="CPA objetivo">{monto(d.puja.objetivoCpa, moneda)}</Dato>
        )}
      </Seccion>
      {(d.optimizacion || d.cobroPor || d.destino) && (
        <Seccion titulo="Optimización y entrega">
          {d.optimizacion && <Dato etiqueta="Optimizado para">{d.optimizacion}</Dato>}
          {d.cobroPor && <Dato etiqueta="Se cobra por">{d.cobroPor}</Dato>}
          {d.destino && <Dato etiqueta="Destino">{d.destino}</Dato>}
        </Seccion>
      )}
      {d.segmentacion && <VistaSegmentacion s={d.segmentacion} />}
    </>
  );
}

function VistaSegmentacion({ s }: { s: SegmentacionMeta }) {
  const lugares = [
    ...s.paises,
    ...s.regiones.map((r) => r.name),
    ...s.ciudades.map((c) => c.name),
  ];
  const posiciones = Object.entries(s.posiciones)
    .map(([red, lista]) => `${red}: ${lista.join(", ")}`)
    .join(" · ");
  return (
    <Seccion titulo="Segmentación">
      <Dato etiqueta="Edad">
        {s.edadMin !== null && s.edadMax !== null ? `${s.edadMin}–${s.edadMax}` : NADA}
        {s.edadSugerida && (
          <span className="block text-xs font-normal text-foreground/45">
            Sugerida: {s.edadSugerida[0]}–{s.edadSugerida[1]}
          </span>
        )}
      </Dato>
      <Dato etiqueta="Género">
        {s.generos === null ? "Todos" : s.generos.map((g) => (g === 1 ? "Hombres" : "Mujeres")).join(", ")}
      </Dato>
      <Dato etiqueta="Ubicaciones">{lugares.length > 0 ? lugares.join(", ") : NADA}</Dato>
      {s.paisesExcluidos.length > 0 && (
        <Dato etiqueta="Países excluidos">{s.paisesExcluidos.join(", ")}</Dato>
      )}
      {s.audiencias.length > 0 && (
        <Dato etiqueta="Audiencias">
          {s.audiencias.map((a) => a.name ?? a.id).join(", ")}
        </Dato>
      )}
      {s.audienciasExcluidas.length > 0 && (
        <Dato etiqueta="Audiencias excluidas">
          {s.audienciasExcluidas.map((a) => a.name ?? a.id).join(", ")}
        </Dato>
      )}
      {s.intereses.length > 0 && (
        <Dato etiqueta="Intereses">{s.intereses.map((i) => i.name ?? i.id).join(", ")}</Dato>
      )}
      <Dato etiqueta="Plataformas">
        {s.plataformas.length > 0 ? s.plataformas.join(", ") : "Automáticas"}
      </Dato>
      {posiciones && <Dato etiqueta="Posiciones">{posiciones}</Dato>}
      {s.dispositivos.length > 0 && <Dato etiqueta="Dispositivos">{s.dispositivos.join(", ")}</Dato>}
      {s.advantageAudience !== null && (
        <Dato etiqueta="Advantage+ Audience">{s.advantageAudience ? "Sí" : "No"}</Dato>
      )}
    </Seccion>
  );
}

function ListaRsa({ items }: { items: TextoRsa[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={`${i}-${item.texto}`} className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-foreground">{item.texto}</span>
          {item.fijado && (
            <Badge variant="outline" className="text-[0.62rem]">
              Fijado {item.fijado.replace("HEADLINE_", "T").replace("DESCRIPTION_", "D")}
            </Badge>
          )}
          {item.revision && item.revision !== "APPROVED" && (
            <Badge variant="outline" className="text-[0.62rem] text-warn">
              {item.revision}
            </Badge>
          )}
          {item.rendimiento && item.rendimiento !== "PENDING" && (
            <Badge variant="outline" className="text-[0.62rem]">
              {item.rendimiento}
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

function VistaAnuncio({
  d,
  conjunto,
  sinImagen = false,
}: {
  d: DetalleAnuncio;
  conjunto: DetalleConjunto | null;
  /** La imagen ya se muestra en la vista previa lateral. */
  sinImagen?: boolean;
}) {
  const c = d.contenido;
  const imagen = c.imagenUrl ?? c.miniaturaUrl;
  return (
    <>
      {d.provider === "meta" && !sinImagen && (
        <div className="overflow-hidden rounded-xl border border-foreground/10 bg-foreground/4">
          {imagen ? (
            // Las URLs de imagen de Meta son firmadas y caducan: no se guardan
            // en ningún lado, se piden de nuevo cada vez que se abre el panel.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagen} alt="Pieza del anuncio" className="max-h-72 w-full object-contain" />
          ) : (
            <div className="flex h-32 items-center justify-center text-foreground/25">
              <ImageOff className="size-6" />
            </div>
          )}
        </div>
      )}
      <Seccion titulo="General">
        <Dato etiqueta="Estado">{traducir(ESTADOS, d.estado) ?? NADA}</Dato>
        {d.tipo && <Dato etiqueta="Tipo">{d.tipo}</Dato>}
        {conjunto && (
          <Dato etiqueta={nombreDeNivel(d.provider, "conjunto")}>
            {conjunto.nombre ?? conjunto.id}
          </Dato>
        )}
      </Seccion>

      {d.provider === "meta" ? (
        <Seccion titulo="Contenido">
          <Dato etiqueta="Texto principal">
            <span className="whitespace-pre-wrap">{c.textoPrincipal ?? NADA}</span>
          </Dato>
          <Dato etiqueta="Título">{c.titulo ?? NADA}</Dato>
          <Dato etiqueta="Botón (CTA)">{c.cta ?? NADA}</Dato>
          <Dato etiqueta="URL de destino">
            <Enlace href={c.urlDestino} />
          </Dato>
          {c.urlTags && <Dato etiqueta="Parámetros de URL">{c.urlTags}</Dato>}
          {c.publicacionInstagram && (
            <Dato etiqueta="Publicación de Instagram">
              <Enlace href={c.publicacionInstagram} />
            </Dato>
          )}
          {c.vistaPreviaUrl && (
            <Dato etiqueta="Vista previa">
              <Enlace href={c.vistaPreviaUrl} />
            </Dato>
          )}
        </Seccion>
      ) : (
        <>
          <Seccion titulo="Titulares">
            {c.titulares.length > 0 ? <ListaRsa items={c.titulares} /> : NADA}
          </Seccion>
          <Seccion titulo="Descripciones">
            {c.descripciones.length > 0 ? <ListaRsa items={c.descripciones} /> : NADA}
          </Seccion>
          <Seccion titulo="Destino">
            <Dato etiqueta="URL final">
              <Enlace href={c.urlDestino} />
            </Dato>
            {(c.path1 || c.path2) && (
              <Dato etiqueta="Ruta visible">{[c.path1, c.path2].filter(Boolean).join(" / ")}</Dato>
            )}
            {c.sufijoUrl && <Dato etiqueta="Sufijo de URL">{c.sufijoUrl}</Dato>}
          </Seccion>
        </>
      )}

      <div
        className={
          d.edicionDeContenido.editable
            ? "rounded-xl border border-foreground/10 p-3 text-sm text-foreground/60"
            : "rounded-xl border border-warn/25 bg-warn/8 p-3 text-sm text-foreground/70"
        }
      >
        {d.edicionDeContenido.editable
          ? "El contenido de este anuncio se puede editar."
          : (d.edicionDeContenido.motivo ?? "El contenido de este anuncio no se puede editar desde acá.")}
      </div>
    </>
  );
}
