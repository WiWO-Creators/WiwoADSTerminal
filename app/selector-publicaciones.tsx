"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clapperboard,
  Film,
  Flame,
  GalleryHorizontal,
  Heart,
  ImageIcon,
  Images,
  Info,
  Play,
  ThumbsUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resolverRango, type RangoId, type RangoNombrado } from "@/lib/rangos";
import { cn } from "@/lib/utils";
import { SelectorDeFechas } from "./selector-fechas";
import { ThinkingOrb } from "./ui";

export type Publicacion = {
  platform: "facebook" | "instagram";
  accountId: string;
  id: string;
  createdAt: string | null;
  mediaUrl: string;
  caption: string | null;
  format: "reel" | "story" | "carousel" | "image" | "video";
  /** Reacciones + comentarios + compartidos ya reales, no una proyección. */
  engagement: number | null;
};

type Entrada = { posts: Publicacion[]; aviso: string | null; ts: number };

/**
 * Lo ya traído vive fuera del componente: cerrar y volver a abrir el
 * selector con el mismo periodo muestra el contenido al instante en vez de
 * repetir la consulta. Antes se traía siempre el último año completo de
 * entrada, filtrando la fecha después en el cliente — pensado para no
 * volver a pedir nada al cambiar de filtro, pero en la práctica era la
 * causa real de la demora y de los timeouts contra Windsor ("Windsor falló
 * tras 3 intentos en facebook_organic": el barrido de un año entero de
 * publicaciones tarda mucho más que el de los 90 días que se ven por
 * defecto). Ahora se pide justo el periodo elegido — cambiar de filtro sí
 * repite la consulta, pero cada una es varias veces más chica.
 */
const cache = new Map<string, Entrada>();
const enVuelo = new Map<string, Promise<Entrada>>();
const VIGENCIA_MS = 10 * 60 * 1000;

function claveDe(portfolioId: string, accountId: string, desde: string, hasta: string): string {
  return `${portfolioId}:${accountId}:${desde}:${hasta}`;
}

function traer(
  portfolioId: string,
  accountId: string,
  desde: string,
  hasta: string,
): Promise<Entrada> {
  const clave = claveDe(portfolioId, accountId, desde, hasta);
  const pendiente = enVuelo.get(clave);
  if (pendiente) return pendiente;

  const promesa = (async () => {
    const params = new URLSearchParams({ portfolioId, accountId, desde, hasta });
    const response = await fetch(`/api/creatividades?${params}`, {
      cache: "no-store",
    });
    const texto = await response.text();
    let body: { posts?: Publicacion[]; aviso?: string | null; error?: string } = {};
    try {
      body = JSON.parse(texto) as typeof body;
    } catch {
      throw new Error(`El servidor no pudo leer las publicaciones (${response.status}).`);
    }
    if (!response.ok) throw new Error(body.error ?? "No se pudo cargar");
    const entrada: Entrada = {
      posts: body.posts ?? [],
      aviso: body.aviso ?? null,
      ts: Date.now(),
    };
    cache.set(clave, entrada);
    return entrada;
  })().finally(() => enVuelo.delete(clave));

  enVuelo.set(clave, promesa);
  return promesa;
}

/** Pide el contenido en segundo plano, para que el selector ya lo tenga al
 * abrirse — mismo periodo por defecto que usa el diálogo (`rango` más abajo,
 * resuelto con la misma función para que la clave de caché coincida). */
export function precargarPublicaciones(portfolioId: string, accountId: string) {
  const { desde, hasta } = resolverRango("ultimos_90", new Date());
  const entrada = cache.get(claveDe(portfolioId, accountId, desde, hasta));
  if (entrada && Date.now() - entrada.ts < VIGENCIA_MS) return;
  void traer(portfolioId, accountId, desde, hasta).catch(() => {
    // Precargar es un adelanto: si falla, el selector vuelve a intentarlo al abrirse.
  });
}

const FILTROS_FORMATO: Array<{
  id: Publicacion["format"] | "todos";
  label: string;
  icon: typeof ImageIcon;
}> = [
  { id: "todos", label: "Todo", icon: Images },
  { id: "image", label: "Fotos", icon: ImageIcon },
  { id: "reel", label: "Reels", icon: Clapperboard },
  { id: "video", label: "Videos", icon: Film },
  { id: "carousel", label: "Carruseles", icon: Images },
  { id: "story", label: "Historias", icon: GalleryHorizontal },
];

const PERIODOS_PUBLICACIONES: RangoNombrado[] = [
  "ultimos_7",
  "ultimos_30",
  "ultimos_90",
  "mes_actual",
  "mes_anterior",
  "anio_actual",
];

const LOTE = 12;

/**
 * Selector de contenido ya publicado, para usarlo como pieza del anuncio —
 * lo mismo que "usar publicación existente" en Meta Ads Manager, con la forma
 * de una publicación de la red social (autor, fecha, texto, imagen con el
 * ícono del formato y las interacciones) para reconocer de un vistazo cuál es.
 *
 * Nunca deja elegir un video o Reel de **Facebook**: `full_picture`, el único
 * campo que Windsor entrega para esos posts por esta vía, es la miniatura del
 * video, no el archivo. Pasarlo como `video_url` crearía un anuncio roto sin
 * ningún aviso hasta que alguien lo revisara en la plataforma. Instagram no
 * tiene ese problema — su `media_url` sí es el archivo real de video — así
 * que ahí Reel y Video se pueden usar igual que una imagen.
 */
export function SelectorDePublicaciones({
  open,
  onOpenChange,
  portfolioId,
  accountId,
  nombreCuenta,
  onSeleccionar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolioId: string;
  accountId: string;
  nombreCuenta: string;
  onSeleccionar: (post: Publicacion) => void;
}) {
  const [entrada, setEntrada] = useState<Entrada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plataforma, setPlataforma] = useState<"todas" | Publicacion["platform"]>("todas");
  const [formato, setFormato] = useState<Publicacion["format"] | "todos">("todos");
  const [rango, setRango] = useState<RangoId>("ultimos_90");
  const [orden, setOrden] = useState<"recientes" | "interaccion">("recientes");
  const [visibles, setVisibles] = useState(LOTE);
  const areaRef = useRef<HTMLDivElement>(null);

  const periodo = resolverRango(rango, new Date());
  const clave = claveDe(portfolioId, accountId, periodo.desde, periodo.hasta);

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    // Lo que ya está en memoria se muestra al instante; si además está
    // viejo, se refresca por detrás sin borrar lo que se ve.
    const guardado = cache.get(clave) ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la caché externa al abrir o al cambiar de periodo
    setEntrada(guardado);
    setError(null);
    if (guardado && Date.now() - guardado.ts < VIGENCIA_MS) return;
    traer(portfolioId, accountId, periodo.desde, periodo.hasta)
      .then((nueva) => {
        if (!cancelado) setEntrada(nueva);
      })
      .catch((issue) => {
        if (!cancelado && !guardado) {
          setError(issue instanceof Error ? issue.message : "No se pudo cargar");
        }
      });
    return () => {
      cancelado = true;
    };
  }, [open, clave, portfolioId, accountId, periodo.desde, periodo.hasta]);

  const filtrados = useMemo(() => {
    const posts = entrada?.posts ?? [];
    return posts
      .filter((post) => {
        if (plataforma !== "todas" && post.platform !== plataforma) return false;
        if (formato !== "todos" && post.format !== formato) return false;
        const dia = post.createdAt?.slice(0, 10) ?? "";
        return dia >= periodo.desde && dia <= periodo.hasta;
      })
      .sort((a, b) =>
        orden === "interaccion"
          ? (b.engagement ?? 0) - (a.engagement ?? 0)
          : (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
      );
  }, [entrada, plataforma, formato, periodo.desde, periodo.hasta, orden]);

  // Cambiar un filtro vuelve al primer lote: no dejar la lista a media altura.
  const firma = `${plataforma}|${formato}|${rango}|${orden}`;
  const [firmaAnterior, setFirmaAnterior] = useState(firma);
  if (firma !== firmaAnterior) {
    setFirmaAnterior(firma);
    setVisibles(LOTE);
  }

  // Se dibuja de a lotes: cientos de imágenes de CDN a la vez eran lo que más
  // tardaba en aparecer. El siguiente lote entra cuando el final de la lista
  // se acerca a la vista; si el primer lote no llena el alto disponible (una
  // pantalla grande), se completa solo.
  const hayMas = visibles < filtrados.length;
  function completarSiHaceFalta() {
    const area = areaRef.current;
    if (!area || !hayMas) return;
    if (area.scrollTop + area.clientHeight >= area.scrollHeight - 600) {
      setVisibles((actual) => actual + LOTE);
    }
  }
  useEffect(() => {
    if (!open) return;
    const marco = requestAnimationFrame(completarSiHaceFalta);
    return () => cancelAnimationFrame(marco);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia lo dibujado
  }, [open, visibles, filtrados.length]);

  const cargando = !entrada && !error;
  const [demorando, setDemorando] = useState(false);
  useEffect(() => {
    if (!cargando) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- vuelve a la vista normal apenas termina de cargar
      setDemorando(false);
      return;
    }
    const aviso = setTimeout(() => setDemorando(true), 5000);
    return () => clearTimeout(aviso);
  }, [cargando]);
  const conteo = (plataformaId: Publicacion["platform"]) =>
    (entrada?.posts ?? []).filter((post) => post.platform === plataformaId).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-foreground/12 bg-card sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Elegir publicación existente</DialogTitle>
          <DialogDescription>
            Contenido real ya publicado en Facebook e Instagram. Elige uno para
            usarlo como pieza del anuncio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 border-b border-foreground/10 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: "todas", label: "Todas", n: (entrada?.posts.length ?? 0) },
                { id: "facebook", label: "Facebook", n: conteo("facebook") },
                { id: "instagram", label: "Instagram", n: conteo("instagram") },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPlataforma(item.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  plataforma === item.id
                    ? "border-brand bg-brand/12 text-foreground"
                    : "border-foreground/12 text-foreground/55 hover:text-foreground",
                )}
              >
                {item.id !== "todas" && <MarcaPlataforma plataforma={item.id} tamano="xs" />}
                {item.label}
                {entrada && (
                  <span className="metric-number text-foreground/40">{item.n}</span>
                )}
              </button>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Ordenar por interacción, no solo por fecha: la publicación
                  que ya viene funcionando orgánicamente no siempre es la más
                  reciente, y es justo la que más conviene boostear. */}
              <div
                role="group"
                aria-label="Ordenar publicaciones"
                className="flex items-center gap-0.5 rounded-full bg-field/40 p-1"
              >
                {(
                  [
                    { id: "recientes", label: "Recientes", icon: null },
                    { id: "interaccion", label: "Con más interacción", icon: Flame },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={orden === item.id}
                    onClick={() => setOrden(item.id)}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                      orden === item.id
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground/55 hover:text-foreground",
                    )}
                  >
                    {item.icon && <item.icon className="size-3" />}
                    {item.label}
                  </button>
                ))}
              </div>
              <SelectorDeFechas
                valor={rango}
                onChange={setRango}
                periodos={PERIODOS_PUBLICACIONES}
                alinear="end"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTROS_FORMATO.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFormato(item.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    formato === item.id
                      ? "bg-foreground/12 text-foreground"
                      : "text-foreground/50 hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {entrada?.aviso && (
          <p className="flex items-start gap-2 text-xs leading-5 text-foreground/50">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {entrada.aviso}
          </p>
        )}

        <div
          ref={areaRef}
          onScroll={completarSiHaceFalta}
          className="scrollbar-thin max-h-[60vh] overflow-y-auto pr-1"
        >
          {cargando ? (
            <div>
              <div className="flex flex-col items-center justify-center gap-1.5 pb-3 text-center">
                <div className="flex items-center gap-2 text-sm text-foreground/55">
                  <ThinkingOrb size="md" state="thinking" label="" />
                  Buscando publicaciones…
                </div>
                {demorando && (
                  <p className="text-xs text-foreground/40">
                    La primera vez que se lee esta cuenta puede tardar hasta
                    un minuto — las siguientes son casi al instante.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }, (_, indice) => (
                  <EsqueletoPublicacion key={indice} />
                ))}
              </div>
            </div>
          ) : error ? (
            <div className="rounded-[16px] border border-danger-deep/25 bg-danger-deep/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-foreground/55">
              <Images className="size-6 text-foreground/30" />
              No hay publicaciones con este filtro en el periodo elegido.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filtrados.slice(0, visibles).map((post) => (
                  <TarjetaPublicacion
                    key={`${post.platform}:${post.id}`}
                    post={post}
                    nombre={nombreCuenta}
                    onUsar={() => onSeleccionar(post)}
                  />
                ))}
              </div>
              {hayMas ? (
                <div
                  className="flex items-center justify-center gap-2 py-4 text-xs text-foreground/45"
                >
                  <ThinkingOrb size="sm" state="thinking" label="" />
                  Cargando más…
                </div>
              ) : (
                <p className="py-3 text-center text-[0.68rem] text-foreground/35">
                  {filtrados.length} publicaciones
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EsqueletoPublicacion() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-foreground/8 bg-field/50">
      <div className="flex items-center gap-2 p-2.5">
        <div className="size-7 rounded-full bg-foreground/10" />
        <div className="h-2.5 w-20 rounded bg-foreground/10" />
      </div>
      <div className="aspect-[4/5] bg-foreground/[0.06]" />
      <div className="space-y-2 p-2.5">
        <div className="h-2.5 w-full rounded bg-foreground/10" />
        <div className="h-7 w-full rounded-md bg-foreground/10" />
      </div>
    </div>
  );
}

/** El logo de la red, en su color de marca: se lee más rápido que la palabra. */
function MarcaPlataforma({
  plataforma,
  tamano = "sm",
}: {
  plataforma: Publicacion["platform"];
  tamano?: "xs" | "sm";
}) {
  const medida = tamano === "xs" ? "size-3.5 text-[0.55rem]" : "size-5 text-[0.7rem]";
  return plataforma === "facebook" ? (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-[#1877F2] font-extrabold leading-none text-white",
        medida,
      )}
    >
      f
    </span>
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-[30%] bg-[linear-gradient(45deg,#FEDA75,#FA7E1E,#D62976,#962FBF,#4F5BD5)] font-extrabold leading-none text-white",
        medida,
      )}
    >
      ◎
    </span>
  );
}

const ETIQUETA_FORMATO: Record<Publicacion["format"], string> = {
  reel: "Reel",
  story: "Historia",
  carousel: "Carrusel",
  image: "Foto",
  video: "Video",
};

function IconoFormato({ formato }: { formato: Publicacion["format"] }) {
  const clase = "size-3.5";
  if (formato === "reel") return <Clapperboard className={clase} />;
  if (formato === "carousel") return <Images className={clase} />;
  if (formato === "video") return <Play className={clase} fill="currentColor" />;
  if (formato === "story") return <GalleryHorizontal className={clase} />;
  return null;
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function TarjetaPublicacion({
  post,
  nombre,
  onUsar,
}: {
  post: Publicacion;
  nombre: string;
  onUsar: () => void;
}) {
  const [cargada, setCargada] = useState(false);
  const [rota, setRota] = useState(false);
  // Ver la nota en SelectorDePublicaciones: el video de Facebook solo trae
  // miniatura por esta vía, así que no se puede usar como pieza real.
  const usable = !(
    post.platform === "facebook" &&
    (post.format === "video" || post.format === "reel")
  );
  const IconoInteraccion = post.platform === "facebook" ? ThumbsUp : Heart;
  const esArchivoDeVideo =
    post.platform === "instagram" && (post.format === "reel" || post.format === "video");

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-foreground/10 bg-field/60 transition-colors hover:border-brand/40">
      <header className="flex items-center gap-2 px-2.5 py-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/25 text-[0.6rem] font-extrabold text-foreground">
          {iniciales(nombre)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold leading-tight text-foreground">{nombre}</p>
          <p className="text-[0.62rem] leading-tight text-foreground/45">
            {post.createdAt ? formatoFecha(post.createdAt) : "Sin fecha"} ·{" "}
            {ETIQUETA_FORMATO[post.format]}
          </p>
        </div>
        <MarcaPlataforma plataforma={post.platform} />
      </header>

      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#1c1c1a]">
        {!cargada && !rota && (
          <div className="absolute inset-0 animate-pulse bg-foreground/[0.05]" />
        )}
        {rota ? (
          <div className="absolute inset-0 grid place-items-center px-3 text-center text-[0.65rem] leading-4 text-foreground/40">
            Ya no está disponible en el CDN
          </div>
        ) : esArchivoDeVideo ? (
          // El `media_url` de un Reel o video de Instagram es el archivo mp4,
          // no una imagen: un <img> ahí siempre falla. Un <video> pausado en
          // el primer cuadro muestra la portada, y al pasar el mouse se
          // reproduce, como en el feed.
          <video
            src={`${post.mediaUrl}#t=0.1`}
            muted
            loop
            playsInline
            preload="metadata"
            onLoadedData={() => setCargada(true)}
            onError={() => setRota(true)}
            onMouseEnter={(evento) => void evento.currentTarget.play().catch(() => {})}
            onMouseLeave={(evento) => {
              evento.currentTarget.pause();
              evento.currentTarget.currentTime = 0.1;
            }}
            className={cn(
              "size-full object-cover transition-opacity duration-300",
              cargada ? "opacity-100" : "opacity-0",
            )}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura desde el CDN de Facebook/Instagram, no un asset propio
          <img
            src={post.mediaUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setCargada(true)}
            onError={() => setRota(true)}
            className={cn(
              "size-full object-cover transition-opacity duration-300",
              cargada ? "opacity-100" : "opacity-0",
            )}
          />
        )}
        {post.format !== "image" && (
          <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm">
            <IconoFormato formato={post.format} />
          </span>
        )}
        {/* La cifra que ya trae la publicación en la plataforma —para
            distinguir de un vistazo cuál conviene boostear, sin tener que
            abrir cada una en Facebook o Instagram a compararlas. */}
        {post.engagement !== null && post.engagement > 0 && (
          <span className="metric-number absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[0.65rem] font-bold text-white backdrop-blur-sm">
            <IconoInteraccion className="size-3" />
            {formatCompacto(post.engagement)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        {post.caption ? (
          <p className="line-clamp-2 text-xs leading-5 text-foreground/70">{post.caption}</p>
        ) : (
          <p className="text-xs italic text-foreground/30">Sin texto</p>
        )}
        {usable ? (
          <Button type="button" size="sm" onClick={onUsar} className="mt-2 w-full font-bold">
            Usar esta publicación
          </Button>
        ) : (
          <p className="mt-2 flex items-start gap-1.5 text-[0.62rem] leading-4 text-warn/80">
            <Info className="mt-0.5 size-3 shrink-0" />
            Solo hay miniatura disponible; pega el archivo de video a mano.
          </p>
        )}
      </div>
    </article>
  );
}

function formatoFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function formatCompacto(valor: number): string {
  return new Intl.NumberFormat("es-CL", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(valor);
}
