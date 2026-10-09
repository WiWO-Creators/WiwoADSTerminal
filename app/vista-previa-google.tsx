"use client";

import { ImageOff, MapPin, Play, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  ETIQUETA_DE_FORMATO,
  formatosDeFamilia,
  imagenPara,
  miniaturaYoutube,
  titularDeBusqueda,
  type FormatoGoogle,
  type PiezaGoogle,
} from "@/lib/vista-previa-google-pura";

/**
 * Vistas previas de Google dibujadas con las piezas reales del anuncio. Google no entrega una vista previa incrustable como
 * Meta, así que son una aproximación fiel de cada superficie: la combinación final la decide Google al servir el anuncio.
 */

const GRIS = "text-[#5f6368]";

function Imagen({ url, className }: { url: string | null; className?: string }) {
  if (!url) {
    return (
      <div className={cn("flex items-center justify-center bg-[#f1f3f4] text-[#9aa0a6]", className)}>
        <ImageOff className="size-6" />
      </div>
    );
  }
  // Las imágenes de Google son públicas y de otro dominio; no pasan por el optimizador.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={cn("object-cover", className)} loading="lazy" referrerPolicy="no-referrer" />;
}

function Inicial({ nombre, logo, className }: { nombre: string; logo?: string | null; className?: string }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" className={cn("rounded-full object-cover", className)} referrerPolicy="no-referrer" />;
  }
  return (
    <span className={cn("flex items-center justify-center rounded-full bg-[#1a73e8] font-bold text-white", className)}>
      {(nombre.trim().charAt(0) || "A").toUpperCase()}
    </span>
  );
}

function Patrocinado({ className }: { className?: string }) {
  return <span className={cn("font-bold text-[#202124]", className)}>Patrocinado</span>;
}

function Boton({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-full bg-[#1a73e8] px-4 py-1.5 text-xs font-semibold text-white">{children}</span>;
}

function Busqueda({ p, escritorio }: { p: PiezaGoogle; escritorio: boolean }) {
  const titulo = titularDeBusqueda(p.titulares) || "Sin titulares";
  const descripcion = p.descripciones.slice(0, 2).join(" ") || "Sin descripciones";
  return (
    <div className={cn("space-y-3 bg-white p-4", escritorio ? "text-[0.9rem]" : "text-sm")}>
      <div className="flex items-center gap-2 rounded-full border border-[#dfe1e5] px-3 py-2">
        <Search className="size-4 text-[#9aa0a6]" />
        <span className={cn("truncate text-xs", GRIS)}>{p.negocio}</span>
      </div>
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-xs">
          <Inicial nombre={p.negocio} logo={p.logo} className="size-6 shrink-0 text-[0.65rem]" />
          <span className="min-w-0 truncate">
            <span className="block truncate font-medium text-[#202124]">{p.negocio}</span>
            <span className={cn("block truncate", GRIS)}>
              <Patrocinado className="text-[0.7rem]" /> · {p.urlVisible || p.dominio || "tu sitio"}
            </span>
          </span>
        </p>
        <p className={cn("font-normal leading-snug text-[#1a0dab]", escritorio ? "text-xl" : "text-[1.05rem]")}>{titulo}</p>
        <p className={cn("leading-snug", GRIS, escritorio ? "line-clamp-2" : "line-clamp-3")}>{descripcion}</p>
      </div>
    </div>
  );
}

function Display({ p, indice }: { p: PiezaGoogle; indice: number }) {
  const imagen = imagenPara(p, "display", indice);
  const titulo = p.titularesLargos[0] ?? p.titulares[0] ?? "Sin titular";
  return (
    <div className="space-y-3 bg-[#f8f9fa] p-4">
      <div className="mx-auto max-w-sm overflow-hidden rounded-xl border border-[#dadce0] bg-white shadow-sm">
        <Imagen url={imagen?.url ?? null} className="aspect-[1.91/1] w-full" />
        <div className="space-y-2 p-3">
          <p className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-[#202124]">{titulo}</p>
          <p className={cn("line-clamp-2 text-xs", GRIS)}>{p.descripciones[0] ?? ""}</p>
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-xs">
              <Inicial nombre={p.negocio} logo={p.logo} className="size-6 shrink-0 text-[0.65rem]" />
              <span className="truncate font-medium text-[#202124]">{p.negocio}</span>
            </span>
            <Boton>{p.cta}</Boton>
          </div>
        </div>
      </div>
    </div>
  );
}

function Discover({ p, indice }: { p: PiezaGoogle; indice: number }) {
  const imagen = imagenPara(p, "discover", indice);
  const titulo = p.titulares[0] ?? p.titularesLargos[0] ?? "Sin titular";
  return (
    <div className="bg-[#f1f3f4] p-4">
      <div className="mx-auto max-w-sm overflow-hidden rounded-2xl bg-white shadow-sm">
        <Imagen url={imagen?.url ?? (p.videoYoutube ? miniaturaYoutube(p.videoYoutube) : null)} className="aspect-[1.91/1] w-full" />
        <div className="space-y-1.5 p-3">
          <p className="flex items-center gap-2 text-xs">
            <Inicial nombre={p.negocio} logo={p.logo} className="size-5 shrink-0 text-[0.6rem]" />
            <span className={cn("truncate", GRIS)}>
              {p.negocio} · <Patrocinado className="text-[0.7rem]" />
            </span>
          </p>
          <p className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-[#202124]">{titulo}</p>
          <p className={cn("line-clamp-2 text-xs", GRIS)}>{p.descripciones[0] ?? ""}</p>
        </div>
      </div>
    </div>
  );
}

function YouTube({ p }: { p: PiezaGoogle }) {
  const imagen = imagenPara(p, "youtube");
  const miniatura = p.videoYoutube ? miniaturaYoutube(p.videoYoutube) : (imagen?.url ?? null);
  const titulo = p.titulares[0] ?? p.titularesLargos[0] ?? "Sin titular";
  return (
    <div className="bg-white p-4">
      <div className="mx-auto max-w-sm overflow-hidden rounded-xl bg-white">
        <div className="relative">
          <Imagen url={miniatura} className="aspect-video w-full rounded-xl" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-black/65 text-white">
              <Play className="size-5 fill-current" />
            </span>
          </span>
        </div>
        <div className="flex gap-3 pt-3">
          <Inicial nombre={p.negocio} logo={p.logo} className="size-9 shrink-0 text-sm" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="line-clamp-2 text-sm font-medium leading-snug text-[#0f0f0f]">{titulo}</p>
            <p className="truncate text-xs text-[#606060]">
              <span className="mr-1 rounded bg-[#f1f1f1] px-1 py-0.5 font-semibold text-[#0f0f0f]">Anuncio</span>
              {p.negocio}
            </p>
            <Boton>{p.cta}</Boton>
          </div>
        </div>
      </div>
    </div>
  );
}

function Gmail({ p, indice }: { p: PiezaGoogle; indice: number }) {
  const imagen = imagenPara(p, "gmail", indice);
  const titulo = p.titulares[0] ?? p.titularesLargos[0] ?? "Sin titular";
  const descripcion = p.descripciones[0] ?? "";
  return (
    <div className="space-y-3 bg-white p-4 text-xs">
      <div className="flex items-center gap-2 rounded-lg bg-[#fef7e0] px-3 py-2">
        <Inicial nombre={p.negocio} logo={p.logo} className="size-7 shrink-0 text-xs" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="rounded bg-[#fbbc04] px-1 text-[0.6rem] font-bold text-[#202124]">Anuncio</span>
            <span className="truncate font-semibold text-[#202124]">{p.negocio}</span>
          </span>
          <span className="block truncate text-[#202124]">
            <b>{titulo}</b> <span className={GRIS}>{descripcion}</span>
          </span>
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#dadce0]">
        <Imagen url={imagen?.url ?? null} className="aspect-[1.91/1] w-full" />
        <div className="space-y-2 p-3">
          <p className="text-sm font-semibold text-[#202124]">{titulo}</p>
          <p className={GRIS}>{descripcion}</p>
          <Boton>{p.cta}</Boton>
        </div>
      </div>
    </div>
  );
}

function Maps({ p }: { p: PiezaGoogle }) {
  const titulo = p.titulares[0] ?? "Sin titular";
  return (
    <div className="bg-white">
      <div className="relative h-36 overflow-hidden bg-[#e8eaed]">
        <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(#fff 2px, transparent 2px), linear-gradient(90deg, #fff 2px, transparent 2px)", backgroundSize: "36px 36px" }} />
        <div className="absolute left-1/4 top-4 h-10 w-20 rounded bg-[#c8e6c9]" />
        <div className="absolute bottom-4 right-6 h-8 w-24 rounded bg-[#bbdefb]" />
        <MapPin className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-full fill-[#ea4335] text-[#b31412]" />
      </div>
      <div className="space-y-1.5 p-4 text-sm">
        <p className="font-semibold text-[#202124]">{p.negocio}</p>
        <p className="text-xs">
          <Patrocinado /> <span className={GRIS}>· {p.dominio || "tu sitio"}</span>
        </p>
        <p className="font-medium text-[#1a0dab]">{titulo}</p>
        <p className={cn("line-clamp-2 text-xs", GRIS)}>{p.descripciones[0] ?? ""}</p>
        <div className="flex gap-2 pt-1">
          <Boton>Cómo llegar</Boton>
          <span className="inline-flex rounded-full border border-[#dadce0] px-4 py-1.5 text-xs font-semibold text-[#1a73e8]">Sitio web</span>
        </div>
      </div>
    </div>
  );
}

function Superficie({ formato, p, indice }: { formato: FormatoGoogle; p: PiezaGoogle; indice: number }) {
  switch (formato) {
    case "busqueda-movil":
      return <Busqueda p={p} escritorio={false} />;
    case "busqueda-escritorio":
      return <Busqueda p={p} escritorio />;
    case "display":
      return <Display p={p} indice={indice} />;
    case "discover":
      return <Discover p={p} indice={indice} />;
    case "youtube":
      return <YouTube p={p} />;
    case "gmail":
      return <Gmail p={p} indice={indice} />;
    case "maps":
      return <Maps p={p} />;
  }
}

/** Las vistas previas de Google de un anuncio o un grupo de recursos, con una pestaña por superficie donde puede salir. */
export function VistaPreviaGoogle({ pieza }: { pieza: PiezaGoogle }) {
  const formatos = formatosDeFamilia(pieza.familia);
  const [elegido, setElegido] = useState<FormatoGoogle>(formatos[0]);
  const [indice, setIndice] = useState(0);
  const formato = formatos.includes(elegido) ? elegido : formatos[0];
  const imagenes = pieza.imagenes.length;
  return (
    <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-card/40">
      <p className="border-b border-foreground/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-foreground/45">
        Vista previa · así se ve en Google
      </p>
      <div className="space-y-2 p-3">
        <div className="flex flex-wrap gap-1 text-[0.7rem]">
          {formatos.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setElegido(f)}
              className={cn("rounded-full px-2.5 py-1 font-semibold", formato === f ? "bg-brand/15 text-brand" : "text-foreground/55 hover:bg-foreground/6")}
            >
              {ETIQUETA_DE_FORMATO[f]}
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-3xl border border-foreground/10 bg-white shadow-sm">
          <Superficie formato={formato} p={pieza} indice={indice} />
        </div>
        {imagenes > 1 && formato !== "busqueda-movil" && formato !== "busqueda-escritorio" && formato !== "youtube" && formato !== "maps" && (
          <button type="button" onClick={() => setIndice((i) => i + 1)} className="text-[0.7rem] font-semibold text-brand hover:underline">
            Ver otra imagen ({(indice % imagenes) + 1}/{imagenes})
          </button>
        )}
        <p className="text-[0.7rem] leading-4 text-foreground/45">
          Aproximación con los textos e imágenes reales del anuncio. Google combina tus titulares y descripciones al mostrarlo, así que
          lo que ve cada persona puede variar.
        </p>
      </div>
    </div>
  );
}
