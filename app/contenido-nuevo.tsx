"use client";

import { useEffect, useState } from "react";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CTA_PERMITIDOS, MAX_IMAGENES, MAX_TARJETAS, tituloDeContenido, validarContenido, type FormatoDeContenido } from "@/lib/anuncios-formato-pura";
import { cn } from "@/lib/utils";

type Imagen = { url: string; titulo: string; descripcion: string; enlace: string };
type Colocaciones = { automaticas: boolean; feed: boolean; stories: boolean; reels: boolean };
type Enviada = { id: string; estado: string; mensaje: string; enlaces: Array<{ etiqueta: string; url: string }> };

const campo = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";
const ETIQUETA_CTA: Record<string, string> = {
  LEARN_MORE: "Más información", SHOP_NOW: "Comprar", SIGN_UP: "Registrarte", CONTACT_US: "Contáctanos", GET_QUOTE: "Cotizar",
  BOOK_NOW: "Reservar", DOWNLOAD: "Descargar", SUBSCRIBE: "Suscribirte", SEE_MORE: "Ver más", NO_BUTTON: "Sin botón",
};

/**
 * Contenido nuevo para un conjunto de Meta: varias imágenes (cada una un anuncio) o un carrusel (una pieza con tarjetas).
 * Sirve también para Stories: sube imágenes verticales 9:16 y se avisa si el conjunto no cubre esa ubicación.
 * Al aprobarse queda corriendo; un Creator lo envía y lo aprueba un Lead o superior.
 */
export function ContenidoNuevo({
  formato,
  clienteId,
  website,
  cuenta,
  campana,
  conjunto,
  onEnviada,
}: {
  formato: FormatoDeContenido;
  clienteId: string;
  website: string | null;
  cuenta: string;
  campana: { id: string; nombre: string | null };
  conjunto: { id: string; nombre: string | null };
  onEnviada: (s: Enviada) => void;
}) {
  const [imagenes, setImagenes] = useState<Imagen[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [enlace, setEnlace] = useState("");
  const [cta, setCta] = useState("LEARN_MORE");
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colocaciones, setColocaciones] = useState<Colocaciones | null>(null);

  const limite = formato === "carrusel" ? MAX_TARJETAS : MAX_IMAGENES;

  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se reinicia al cambiar de conjunto, antes de pedir sus ubicaciones
    setColocaciones(null);
    fetch(`/api/meta/colocaciones?clienteId=${encodeURIComponent(clienteId)}&accountId=${encodeURIComponent(cuenta)}&conjuntoId=${encodeURIComponent(conjunto.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Colocaciones | null) => vivo && setColocaciones(j))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [clienteId, cuenta, conjunto.id]);

  async function subir(archivos: FileList) {
    setSubiendo(true);
    setError(null);
    try {
      const nuevas: Imagen[] = [];
      for (const archivo of Array.from(archivos).slice(0, limite - imagenes.length)) {
        const r = await fetch("/api/creatividades/subir", {
          method: "POST",
          headers: { "content-type": archivo.type, "x-portfolio-id": encodeURIComponent(clienteId) },
          body: archivo,
        });
        const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!r.ok || !j.url) throw new Error(j.error ?? `No se pudo subir ${archivo.name}`);
        nuevas.push({ url: j.url, titulo: "", descripcion: "", enlace: "" });
      }
      setImagenes((a) => [...a, ...nuevas]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen");
    } finally {
      setSubiendo(false);
    }
  }

  const poner = (i: number, cambio: Partial<Imagen>) => setImagenes((a) => a.map((x, k) => (k === i ? { ...x, ...cambio } : x)));
  const destino = enlace.trim() || website || "";
  const datos = {
    formato,
    mensaje,
    enlace: destino,
    cta,
    imagenes: imagenes.map((x) => ({ url: x.url, titulo: x.titulo || undefined, descripcion: x.descripcion || undefined, enlace: x.enlace || undefined })),
  };
  const problemas = imagenes.length === 0 ? [] : validarContenido(datos);

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      const nombre = `${formato === "carrusel" ? "Carrusel" : "Imagen"} · ${(mensaje || tituloDeContenido(datos)).replace(/\s+/g, " ").slice(0, 40)}`;
      const r = await fetch("/api/solicitudes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contenidoNuevo: [{ portfolioId: clienteId, accountId: cuenta, campaignId: campana.id, campaignName: campana.nombre ?? "", adsetId: conjunto.id, adsetName: conjunto.nombre ?? "", nombre, datos }],
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { solicitud?: Enviada; error?: string };
      if (!r.ok || !j.solicitud) throw new Error(j.error ?? "No se pudo enviar");
      onEnviada(j.solicitud);
      setImagenes([]);
      setMensaje("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-foreground/70">
        {formato === "carrusel" ? `Imágenes del carrusel (2 a ${MAX_TARJETAS}, JPG o PNG)` : `Imágenes (hasta ${MAX_IMAGENES}; cada una es un anuncio). Para Stories, verticales 9:16`}
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png"
          disabled={subiendo || imagenes.length >= limite}
          className="mt-1 block w-full text-sm"
          onChange={(e) => {
            if (e.target.files?.length) void subir(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {subiendo && <p className="text-xs text-muted-foreground">Subiendo…</p>}

      {colocaciones && !colocaciones.automaticas && (!colocaciones.stories || !colocaciones.reels || !colocaciones.feed) && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs leading-5 text-warn">
          Este conjunto no cubre todas las ubicaciones: {[colocaciones.feed ? null : "feed", colocaciones.stories ? null : "stories", colocaciones.reels ? null : "reels"].filter(Boolean).join(", ")}. El contenido solo se mostrará donde el conjunto lo permite.
        </p>
      )}

      {imagenes.length > 0 && (
        <ul className="space-y-2">
          {imagenes.map((x, i) => (
            <li key={`${x.url}-${i}`} className="flex gap-3 rounded-xl border border-border p-2">
              <span className="size-16 shrink-0 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url(${x.url})` }} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <input className={cn(campo, "h-9")} placeholder={formato === "carrusel" ? "Título de la tarjeta" : "Título (opcional)"} value={x.titulo} onChange={(e) => poner(i, { titulo: e.target.value })} />
                <input className={cn(campo, "h-9")} placeholder="Enlace propio (opcional)" value={x.enlace} onChange={(e) => poner(i, { enlace: e.target.value })} />
              </div>
              <button type="button" className="self-start text-xs font-bold text-muted-foreground hover:text-danger" onClick={() => setImagenes((a) => a.filter((_, k) => k !== i))}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <textarea className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" rows={3} placeholder="Texto principal del anuncio" value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
      <input className={campo} placeholder={website ? `Destino (vacío: ${website})` : "URL de destino (https)"} value={enlace} onChange={(e) => setEnlace(e.target.value)} />
      <select className={campo} value={cta} onChange={(e) => setCta(e.target.value)}>
        {CTA_PERMITIDOS.map((c) => (
          <option key={c} value={c}>
            Botón: {ETIQUETA_CTA[c] ?? c}
          </option>
        ))}
      </select>

      {problemas.length > 0 && <p className="text-xs text-warn">{problemas[0]}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="button" className="w-full font-extrabold" disabled={enviando || imagenes.length === 0 || problemas.length > 0} onClick={() => void enviar()}>
        <Rocket /> {enviando ? "Enviando…" : "Enviar para aprobación"}
      </Button>
    </div>
  );
}
