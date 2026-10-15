"use client";

import { Bookmark, Heart, MessageCircle, Music2, Share2 } from "lucide-react";

/**
 * Cómo se ve un anuncio de TikTok en el feed (video vertical a pantalla completa). Aproximada: arma el marco con lo que se escribió
 * (usuario, texto, botón) sobre la pieza si hay una; la vista real de TikTok se sumará con la conexión directa.
 */
export function VistaPreviaTiktok({
  usuario,
  texto,
  boton,
  imagenUrl,
  videoUrl,
}: {
  usuario: string;
  texto: string | null;
  boton: string | null;
  imagenUrl?: string | null;
  videoUrl?: string | null;
}) {
  return (
    <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-[28px] bg-black text-white shadow-lg ring-1 ring-white/10">
      <div className="relative aspect-[9/16] w-full bg-neutral-900">
        {videoUrl ? (
          <video src={videoUrl} muted playsInline loop autoPlay className="absolute inset-0 size-full object-cover" />
        ) : imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- pieza del anuncio, no un asset propio
          <img src={imagenUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-white/35">Sin pieza</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />
        <p className="absolute left-0 right-0 top-3 text-center text-[0.7rem] font-semibold text-white/80">Para ti</p>

        <div className="absolute bottom-3 right-2 flex flex-col items-center gap-3.5 text-[0.6rem] text-white/90">
          <Heart className="size-6" />
          <MessageCircle className="size-6" />
          <Bookmark className="size-6" />
          <Share2 className="size-6" />
        </div>

        <div className="absolute bottom-3 left-3 right-14 space-y-1.5">
          <p className="text-xs font-bold">@{usuario}</p>
          {texto ? <p className="line-clamp-3 text-[0.7rem] leading-4 text-white/90">{texto}</p> : null}
          <p className="flex items-center gap-1 text-[0.62rem] text-white/70">
            <span className="rounded bg-white/20 px-1 py-px font-semibold">Anuncio</span>
            <Music2 className="size-3" /> Sonido original
          </p>
          {boton ? <p className="rounded-md bg-[#FE2C55] px-3 py-1.5 text-center text-[0.7rem] font-bold">{boton}</p> : null}
        </div>
      </div>
    </div>
  );
}
