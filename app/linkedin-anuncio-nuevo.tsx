"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import type { CandidataDePublicacion } from "@/lib/linkedin-publicaciones-pura";
import { cn } from "@/lib/utils";
import { ThinkingOrb } from "./ui";

type Respuesta = { conectado: boolean; formatoDeLaCampana: string | null; estadoDeLaCampana?: string | null; candidatas: CandidataDePublicacion[]; error?: string };

/**
 * «Añadir un anuncio con una publicación existente» en una campaña de LinkedIn. LinkedIn deja crear el anuncio con una publicación que
 * ya existe (la de otro anuncio de la cuenta, o una que se pega por su enlace) sin rol en la página; lo que sí exige ese rol es
 * publicar contenido nuevo. El formato de la publicación (video, documento, texto) debe calzar con el de la campaña: aquí solo se
 * pueden elegir las que calzan, y las demás dicen por qué no.
 */
export function AnuncioNuevoLinkedin({ accountId, campaignId, campaignName, alCrear }: { accountId: string; campaignId: string; campaignName: string; alCrear: () => void }) {
  const [datos, setDatos] = useState<Respuesta | null | undefined>(undefined);
  const [elegida, setElegida] = useState<string | null>(null);
  const [pegada, setPegada] = useState("");
  const [nombre, setNombre] = useState("");
  const [activar, setActivar] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- vuelve a leer al cambiar de campaña
    setDatos(undefined);
    setElegida(null);
    setPegada("");
    setError(null);
    fetch(`/api/linkedin/anuncio-desde-publicacion?accountId=${encodeURIComponent(accountId)}&campaignId=${encodeURIComponent(campaignId)}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j: Respuesta | null) => vivo && setDatos(j && !j.error ? j : null))
      .catch(() => vivo && setDatos(null));
    return () => {
      vivo = false;
    };
  }, [accountId, campaignId]);

  const publicacion = pegada.trim() || elegida || "";
  const corre = datos?.estadoDeLaCampana === "ACTIVE";

  async function crear() {
    setCreando(true);
    setError(null);
    try {
      const r = await fetch("/api/linkedin/anuncio-desde-publicacion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId, campaignId, publicacion, nombre: nombre.trim() || undefined, activar, confirmacion: "CREAR" }),
      });
      const j = (await r.json().catch(() => null)) as { aplicado?: boolean; estado?: string; verificado?: boolean; error?: string } | null;
      if (!r.ok || !j?.aplicado) throw new Error(j?.error ?? "No se pudo crear el anuncio");
      toast.success(j.estado === "ACTIVE" ? "Anuncio creado y activo en LinkedIn" : "Anuncio creado en borrador en LinkedIn", {
        description: j.verificado ? "Verificado leyendo LinkedIn." : "LinkedIn lo aceptó, pero no se pudo verificar todo: revísalo en Campaign Manager.",
      });
      setConfirmando(false);
      setElegida(null);
      setPegada("");
      setNombre("");
      alCrear();
    } catch (e) {
      setConfirmando(false);
      setError(e instanceof Error ? e.message : "No se pudo crear el anuncio");
    } finally {
      setCreando(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-foreground/10 bg-card/40 p-4">
      <div>
        <h3 className="text-sm font-bold">Añadir un anuncio con una publicación existente</h3>
        <p className="text-xs leading-5 text-foreground/50">
          Usa una publicación que ya está en LinkedIn: la de otro anuncio de esta cuenta o una que pegues por su enlace. Un video, un documento o un texto van en campañas de su mismo formato.
          Subir contenido nuevo todavía no se puede: LinkedIn lo exige con un rol de publicador en la página.
        </p>
      </div>

      {datos === undefined ? (
        <div className="flex items-center gap-2 text-xs text-foreground/55">
          <ThinkingOrb size="xs" state="generating" label="" />
          Buscando las publicaciones de esta cuenta…
        </div>
      ) : datos === null || !datos.conectado ? (
        <p className="text-xs text-foreground/55">No se pudieron leer las publicaciones de LinkedIn ahora (la conexión del equipo puede no estar activa). Aun así puedes pegar el enlace de una publicación.</p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {datos.candidatas.length === 0 && <li className="text-xs text-foreground/50">Esta cuenta todavía no tiene anuncios con publicaciones para reutilizar. Pega el enlace de una publicación.</li>}
          {datos.candidatas.map((c) => (
            <li key={c.urn}>
              <label
                className={cn(
                  "flex gap-3 rounded-xl border p-2.5 text-xs leading-5",
                  c.compatible ? "cursor-pointer border-foreground/10 hover:border-brand/40" : "cursor-not-allowed border-foreground/6 opacity-50",
                  elegida === c.urn && !pegada.trim() && "border-brand/60 bg-brand/6",
                )}
              >
                <input type="radio" name="publicacion-linkedin" disabled={!c.compatible} checked={elegida === c.urn && !pegada.trim()} onChange={() => setElegida(c.urn)} className="mt-1" />
                <span className="min-w-0 flex-1">
                  <span className="mb-0.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-[0.62rem] font-bold">{c.etiqueta}</span>
                    <span className="text-[0.62rem] text-foreground/40">
                      la usa{c.anunciosQueLaUsan === 1 ? "" : "n"} {c.anunciosQueLaUsan} anuncio{c.anunciosQueLaUsan === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="line-clamp-2 block text-foreground/80">{c.texto}</span>
                  {!c.compatible && c.motivo && <span className="mt-0.5 block text-[0.65rem] text-foreground/45">{c.motivo}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="font-semibold text-foreground/70">O pega el enlace de la publicación</span>
          <input
            value={pegada}
            onChange={(e) => setPegada(e.target.value)}
            placeholder="https://www.linkedin.com/feed/update/urn:li:ugcPost:…"
            className="mt-1 h-9 w-full rounded-md border border-input bg-field/60 px-3 text-xs"
          />
        </label>
        <label className="block text-xs">
          <span className="font-semibold text-foreground/70">Nombre del anuncio (opcional)</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} className="mt-1 h-9 w-full rounded-md border border-input bg-field/60 px-3 text-xs" />
        </label>
      </div>

      <label className="flex items-start gap-2 text-xs leading-5 text-foreground/70">
        <input type="checkbox" checked={activar && corre} disabled={!corre} onChange={(e) => setActivar(e.target.checked)} className="mt-1" />
        {corre ? "Activar el anuncio apenas LinkedIn lo revise (la campaña está activa)." : "La campaña no está activa: el anuncio queda en borrador hasta que la actives."}
      </label>

      {error && <p className="rounded-xl border border-danger/25 bg-danger/8 p-3 text-xs leading-5 text-danger">{error}</p>}

      <button
        type="button"
        disabled={!publicacion || creando}
        onClick={() => setConfirmando(true)}
        className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {creando ? "Creando…" : "Crear anuncio"}
      </button>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Crear este anuncio en LinkedIn?</AlertDialogTitle>
            <AlertDialogDescription>
              Se agrega un anuncio con esa publicación a «{campaignName}». {activar && corre ? "Empieza a servirse cuando LinkedIn lo revise y puede gastar presupuesto." : "Queda en borrador: no se sirve ni gasta hasta que lo actives."} Después se lee de LinkedIn para comprobarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void crear()}>Crear anuncio</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
