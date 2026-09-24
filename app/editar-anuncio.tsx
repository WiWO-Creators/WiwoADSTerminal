"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CALL_TO_ACTIONS, problemaDeUrlPublica, type CallToAction } from "@/lib/constructor";
import { OrbeDeBoton } from "./ui";

export type AnuncioEditable = {
  accountId: string;
  adId: string;
  nombre: string;
};

/**
 * Edición de un anuncio de Meta ya publicado — mensaje, título, descripción,
 * enlace, botón e imagen — vía `update_ad_creative`, verificado contra
 * `list_actions` real de Windsor.
 *
 * Solo Meta: Google no tiene ninguna acción de escritura para editar el
 * contenido de un anuncio ya creado (`list_actions` de `google_ads`
 * verificado — solo pausar/activar). Para cambiar un anuncio de Google hay
 * que crear uno nuevo desde el Constructor y pausar el viejo.
 *
 * Cada campo es opcional y se manda solo si se escribió algo — Windsor deja
 * el resto igual. Windsor mismo avisa si el tipo de creativo del anuncio no
 * admite un campo puntual (por ejemplo, un anuncio de solo texto no admite
 * imagen): no se intenta adivinar acá, se muestra el error real que devuelva.
 */
export function EditarAnuncioDialog({
  anuncio,
  open,
  onOpenChange,
}: {
  anuncio: AnuncioEditable | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [enlace, setEnlace] = useState("");
  const [imagenUrl, setImagenUrl] = useState("");
  const [cta, setCta] = useState<CallToAction | "">("");

  // Se sincroniza al cambiar de anuncio (el diálogo es una sola instancia,
  // no se remonta por fila) — sin esto, el nombre del anuncio anterior
  // quedaría pegado en el campo al abrir uno distinto.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con el anuncio elegido al abrir o al cambiar de fila
    setNombre(anuncio?.nombre ?? "");
  }, [anuncio?.adId, anuncio?.nombre]);

  if (!anuncio) return null;

  function limpiar() {
    setMensaje("");
    setTitulo("");
    setDescripcion("");
    setEnlace("");
    setImagenUrl("");
    setCta("");
  }

  async function guardarNombre() {
    if (!anuncio) return;
    if (!nombre.trim()) {
      toast.error("El nombre no puede quedar vacío");
      return;
    }
    setGuardandoNombre(true);
    try {
      const response = await fetch("/api/anuncios/gestionar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "meta",
          accountId: anuncio.accountId,
          action: "update_ad",
          params: { ad_id: anuncio.adId, name: nombre.trim() },
        }),
      });
      const body = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "No se pudo renombrar el anuncio");
      }
      toast.success("Nombre actualizado");
    } catch (issue) {
      toast.error(issue instanceof Error ? issue.message : "No se pudo renombrar el anuncio");
    } finally {
      setGuardandoNombre(false);
    }
  }

  async function guardar() {
    if (!anuncio) return;
    const cambios: Record<string, unknown> = {};
    if (mensaje.trim()) cambios.message = mensaje.trim();
    if (titulo.trim()) cambios.headline = titulo.trim();
    if (descripcion.trim()) cambios.description = descripcion.trim();
    if (enlace.trim()) cambios.link = enlace.trim();
    if (cta) cambios.call_to_action_type = cta;
    if (imagenUrl.trim()) {
      const problema = problemaDeUrlPublica(imagenUrl);
      if (problema) {
        toast.error(problema);
        return;
      }
      cambios.image_url = imagenUrl.trim();
    }
    if (Object.keys(cambios).length === 0) {
      toast.error("Cambia al menos un campo antes de guardar");
      return;
    }

    setEnviando(true);
    try {
      const response = await fetch("/api/anuncios/gestionar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "meta",
          accountId: anuncio.accountId,
          action: "update_ad_creative",
          params: { ad_id: anuncio.adId, ...cambios },
        }),
      });
      const body = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "No se pudo actualizar el anuncio");
      }
      toast.success("Anuncio actualizado");
      limpiar();
      onOpenChange(false);
    } catch (issue) {
      toast.error(issue instanceof Error ? issue.message : "No se pudo actualizar el anuncio");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) limpiar();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar anuncio</DialogTitle>
          <DialogDescription className="truncate" title={anuncio.nombre}>
            {anuncio.nombre}
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs leading-5 text-foreground/50">
          Meta trata la pieza como algo fijo: por dentro arma una pieza nueva
          con los cambios y reapunta el anuncio a ella — el anuncio conserva
          su id, pero queda una pieza nueva detrás. Deja vacío lo que no
          quieras tocar.
        </p>
        <div className="space-y-4">
          <div>
            <label className="font-micro mb-1 block text-[0.6rem] text-foreground/45">
              NOMBRE (SOLO PARA IDENTIFICARLO ACÁ, NO ES CONTENIDO DEL ANUNCIO)
            </label>
            <div className="flex items-end gap-2">
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="min-w-0 flex-1 bg-field/60"
              />
              <Button
                variant="outline"
                onClick={() => void guardarNombre()}
                disabled={guardandoNombre || nombre.trim() === anuncio.nombre}
              >
                {guardandoNombre ? <OrbeDeBoton /> : null}
                Guardar
              </Button>
            </div>
          </div>
          <div className="border-t border-foreground/10 pt-4">
            <label className="font-micro mb-1 block text-[0.6rem] text-foreground/45">
              TEXTO PRINCIPAL
            </label>
            <Textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="Dejar igual"
              rows={3}
              className="bg-field/60"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="font-micro mb-1 block text-[0.6rem] text-foreground/45">
                TÍTULO
              </label>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Dejar igual"
                className="bg-field/60"
              />
            </div>
            <div>
              <label className="font-micro mb-1 block text-[0.6rem] text-foreground/45">
                DESCRIPCIÓN
              </label>
              <Input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Dejar igual"
                className="bg-field/60"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="font-micro mb-1 block text-[0.6rem] text-foreground/45">
                ENLACE DE DESTINO
              </label>
              <Input
                value={enlace}
                onChange={(e) => setEnlace(e.target.value)}
                placeholder="Dejar igual"
                className="bg-field/60"
              />
            </div>
            <div>
              <label className="font-micro mb-1 block text-[0.6rem] text-foreground/45">
                BOTÓN
              </label>
              <Select value={cta} onValueChange={(v) => setCta(v as CallToAction)}>
                <SelectTrigger className="w-full bg-field/60">
                  <SelectValue placeholder="Dejar igual" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CALL_TO_ACTIONS) as CallToAction[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {CALL_TO_ACTIONS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="font-micro mb-1 block text-[0.6rem] text-foreground/45">
              IMAGEN (URL PÚBLICA)
            </label>
            <Input
              value={imagenUrl}
              onChange={(e) => setImagenUrl(e.target.value)}
              placeholder="Dejar igual"
              className="bg-field/60"
            />
            <p className="mt-1 text-[0.62rem] leading-4 text-foreground/40">
              Tiene que ser una URL pública y estable. Una del CDN de Meta o
              Instagram (por ejemplo, de &quot;Elegir publicación
              existente&quot;) suele venir firmada con vencimiento y Meta no
              siempre puede volver a descargarla — mejor un archivo subido o
              de un sitio propio.
            </p>
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <Button onClick={() => void guardar()} disabled={enviando} className="font-extrabold">
            {enviando ? <OrbeDeBoton /> : null}
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
