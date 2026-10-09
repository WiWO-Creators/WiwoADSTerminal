"use client";

import { ImageOff } from "lucide-react";
import type { ReactNode } from "react";
import type { DetalleAnuncio } from "@/lib/detalle-entidad";
import { miniaturaYoutube } from "@/lib/vista-previa-google-pura";

/**
 * El contenido de un anuncio de Google que no es de búsqueda (Display, Video, Demand Gen…), tal como está hoy: textos, imágenes
 * y videos. Es solo lectura: el sistema todavía no los edita, y se dice con claridad (con la vista previa al costado).
 */

function Lista({ titulo, items }: { titulo: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-foreground/10 p-3">
      <h4 className="mb-1.5 flex justify-between text-sm font-bold">
        {titulo} <span className="text-[0.7rem] font-normal text-foreground/45">{items.length}</span>
      </h4>
      <ul className="space-y-1 text-sm text-foreground/80">
        {items.map((t, i) => (
          <li key={`${i}-${t}`} className="rounded-lg bg-foreground/4 px-2.5 py-1.5">
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Miniatura({ url }: { url: string | null }) {
  if (!url) {
    return (
      <span className="flex aspect-video items-center justify-center rounded-lg bg-foreground/5 text-foreground/25">
        <ImageOff className="size-5" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="aspect-video w-full rounded-lg bg-foreground/5 object-cover" loading="lazy" referrerPolicy="no-referrer" />;
}

export function ContenidoDeGoogleSoloLectura({ anuncio, aviso }: { anuncio: DetalleAnuncio | null; aviso: ReactNode }) {
  const v = anuncio?.contenido.visual ?? null;
  const c = anuncio?.contenido;
  const imagenes = v?.imagenes ?? [];
  const videos = v?.videosYoutube ?? [];
  const sinNada = !v && (c?.titulares.length ?? 0) === 0;
  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-foreground/10 bg-foreground/4 p-3 text-sm leading-6 text-foreground/65">{aviso}</p>
      {sinNada ? (
        <p className="text-xs text-foreground/50">Google no entregó los textos ni las piezas de este anuncio.</p>
      ) : (
        <>
          <Lista titulo="Titulares" items={v?.titulares ?? c?.titulares.map((t) => t.texto) ?? []} />
          <Lista titulo="Titulares largos" items={v?.titularesLargos ?? []} />
          <Lista titulo="Descripciones" items={v?.descripciones ?? c?.descripciones.map((t) => t.texto) ?? []} />
          {(v?.negocio || v?.cta || c?.urlDestino) && (
            <section className="rounded-xl border border-foreground/10 p-3 text-sm">
              <h4 className="mb-1.5 font-bold">Negocio y destino</h4>
              <dl className="space-y-1 text-foreground/80">
                {v?.negocio && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-foreground/50">Nombre del negocio</dt>
                    <dd>{v.negocio}</dd>
                  </div>
                )}
                {v?.cta && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-foreground/50">Botón</dt>
                    <dd>{v.cta}</dd>
                  </div>
                )}
                {c?.urlDestino && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-foreground/50">URL final</dt>
                    <dd className="min-w-0 truncate">{c.urlDestino}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}
          {(imagenes.length > 0 || videos.length > 0) && (
            <section className="rounded-xl border border-foreground/10 p-3">
              <h4 className="mb-1.5 flex justify-between text-sm font-bold">
                Imágenes y videos <span className="text-[0.7rem] font-normal text-foreground/45">{imagenes.length} imágenes · {videos.length} videos</span>
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {imagenes.map((i, n) => (
                  <Miniatura key={`${n}-${i.url}`} url={i.url} />
                ))}
                {videos.map((id) => (
                  <Miniatura key={id} url={miniaturaYoutube(id)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
