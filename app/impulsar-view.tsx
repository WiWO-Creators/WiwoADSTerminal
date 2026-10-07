"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Images, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ContenidoNuevo } from "./contenido-nuevo";
import { SelectorDePublicaciones, type Publicacion } from "./selector-publicaciones";
import { Surface } from "./ui";

type Cliente = { id: string; name: string; website?: string | null; accounts: Array<{ externalId: string; name: string; provider: string }> };
type Campana = { id: string; nombre: string | null; estado: string | null; objetivo: string | null };
type Conjunto = { id: string; nombre: string | null; estado: string | null; campaignId: string | null };
type AnuncioExistente = { id: string; nombre: string | null; postId: string; miniatura: string | null; texto: string | null; campana: string | null; conjunto: string | null };
type Elegida = { postId: string; etiqueta: string; ig?: boolean };
type CreadoIg = { nombre: string; enlace: string | null; error: string | null };
type Nuevo = { mediaUrl: string; mediaType: "image" | "video"; message: string; headline: string; landingUrl: string };
const NUEVO_VACIO: Nuevo = { mediaUrl: "", mediaType: "image", message: "", headline: "", landingUrl: "" };
type Enviada = { id: string; estado: string; mensaje: string; enlaces: Array<{ etiqueta: string; url: string }> };

const campoClase = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";

/**
 * Boostear un anuncio desde cualquier pantalla (también el celular): cliente → campaña → conjunto → publicación o anuncio ya
 * existente. Lo elegido pasa por la misma aprobación que todo; quien aprueba cambios lo publica al instante y queda corriendo.
 */
export function ImpulsarView({ clienteId, puedeAprobar, campanaInicial }: { clienteId: string | null; puedeAprobar: boolean; campanaInicial?: string }) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cuenta, setCuenta] = useState("");
  const [arbol, setArbol] = useState<{ campanas: Campana[]; conjuntos: Conjunto[] } | null>(null);
  const [campanaId, setCampanaId] = useState("");
  const [conjuntoId, setConjuntoId] = useState("");
  const [modo, setModo] = useState<"publicacion" | "anuncio" | "nuevo" | "imagenes" | "carrusel">("publicacion");
  const [nuevo, setNuevo] = useState<Nuevo>(NUEVO_VACIO);
  const [subiendo, setSubiendo] = useState(false);
  const [anuncios, setAnuncios] = useState<AnuncioExistente[] | null>(null);
  const [elegidas, setElegidas] = useState<Elegida[]>([]);
  const [selector, setSelector] = useState(false);
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviada, setEnviada] = useState<Enviada | null>(null);
  const [creadosIg, setCreadosIg] = useState<CreadoIg[]>([]);

  // Cliente y su cuenta de Meta.
  useEffect(() => {
    if (!clienteId) return;
    let vivo = true;
    fetch("/api/clientes", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { portfolios: Cliente[] }) => {
        if (!vivo) return;
        const c = j.portfolios.find((p) => p.id === clienteId) ?? null;
        setCliente(c);
        setCuenta(c?.accounts.find((a) => a.provider === "meta")?.externalId ?? "");
        setArbol(null);
        setCampanaId("");
        setConjuntoId("");
        setElegidas([]);
        setEnviada(null);
        setCreadosIg([]);
      })
      .catch(() => vivo && setError("No se pudo leer el cliente"));
    return () => {
      vivo = false;
    };
  }, [clienteId]);

  // Campañas y conjuntos de esa cuenta.
  useEffect(() => {
    if (!cliente || !cuenta) return;
    let vivo = true;
    fetch(`/api/entidades/arbol?portfolioId=${encodeURIComponent(cliente.id)}&accountId=${encodeURIComponent(cuenta)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as { campanas?: Campana[]; conjuntos?: Conjunto[]; error?: string };
        if (!r.ok) throw new Error(j.error ?? "No se pudieron leer las campañas");
        if (vivo) {
          setArbol({ campanas: j.campanas ?? [], conjuntos: j.conjuntos ?? [] });
          // Si se llegó desde una tarjeta de «subir contenido», la campaña ya viene elegida.
          if (campanaInicial && (j.campanas ?? []).some((c: { id: string }) => c.id === campanaInicial)) setCampanaId(campanaInicial);
        }
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudieron leer las campañas"));
    return () => {
      vivo = false;
    };
  }, [cliente, cuenta, campanaInicial]);

  // Anuncios existentes (para «impulsar uno que ya existe»), solo si se pide.
  useEffect(() => {
    if (modo !== "anuncio" || !cliente || !cuenta || anuncios) return;
    let vivo = true;
    fetch(`/api/entidades/anuncios?portfolioId=${encodeURIComponent(cliente.id)}&accountId=${encodeURIComponent(cuenta)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as { anuncios?: AnuncioExistente[]; error?: string };
        if (!r.ok) throw new Error(j.error ?? "No se pudieron leer los anuncios");
        if (vivo) setAnuncios(j.anuncios ?? []);
      })
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudieron leer los anuncios"));
    return () => {
      vivo = false;
    };
  }, [modo, cliente, cuenta, anuncios]);

  const campana = arbol?.campanas.find((c) => c.id === campanaId) ?? null;
  const conjuntos = useMemo(() => (arbol?.conjuntos ?? []).filter((c) => c.campaignId === campanaId), [arbol, campanaId]);
  const conjunto = conjuntos.find((c) => c.id === conjuntoId) ?? null;

  const agregar = (e: Elegida) => setElegidas((a) => (a.some((x) => x.postId === e.postId) ? a : [...a, e]));

  async function subirArchivo(archivo: File) {
    if (!cliente) return;
    setSubiendo(true);
    setError(null);
    try {
      const r = await fetch("/api/creatividades/subir", {
        method: "POST",
        headers: { "content-type": archivo.type, "x-portfolio-id": encodeURIComponent(cliente.id) },
        body: archivo,
      });
      const texto = await r.text();
      let j: { url?: string; error?: string } = {};
      try {
        j = JSON.parse(texto) as typeof j;
      } catch {
        j = { error: r.status === 413 ? "El archivo pesa demasiado: prueba con uno más liviano." : `El servidor rechazó el archivo (${r.status}).` };
      }
      if (!r.ok || !j.url) throw new Error(j.error ?? "No se pudo subir el archivo");
      setNuevo((n) => ({ ...n, mediaUrl: j.url!, mediaType: archivo.type.startsWith("video/") ? "video" : "image" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el archivo");
    } finally {
      setSubiendo(false);
    }
  }

  const nuevoListo = nuevo.mediaUrl && nuevo.message.trim() && (nuevo.landingUrl.trim() || cliente?.website);

  async function enviar() {
    if (!cliente || !campana || !conjunto) return;
    if (modo === "nuevo" ? !nuevoListo : elegidas.length === 0) return;
    setCargando("enviar");
    setError(null);
    try {
      const destino = {
        portfolioId: cliente.id,
        platforms: ["meta"],
        existingCampaign: { platform: "meta", accountId: cuenta, campaignId: campana.id, campaignName: campana.nombre ?? "" },
        existingAdset: { adsetId: conjunto.id, adsetName: conjunto.nombre ?? "" },
      };
      // Instagram: se crea al instante, activo, con la API directa de Meta (solo quien aprueba cambios).
      const deInstagram = modo === "nuevo" ? [] : elegidas.filter((e) => e.ig);
      if (deInstagram.length > 0 && !puedeAprobar) {
        // Analista: las publicaciones de Instagram van a revisión de un supervisor.
        const r = await fetch("/api/solicitudes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            impulsosInstagram: deInstagram.map((e) => ({
              portfolioId: cliente.id,
              accountId: cuenta,
              campaignId: campana.id,
              campaignName: campana.nombre ?? "",
              adsetId: conjunto.id,
              adsetName: conjunto.nombre ?? "",
              mediaId: e.postId,
              nombre: `Impulso Instagram · ${e.etiqueta}`.slice(0, 80),
            })),
          }),
        });
        const j = (await r.json().catch(() => ({}))) as { solicitud?: Enviada; error?: string };
        if (!r.ok || !j.solicitud) throw new Error(j.error ?? "No se pudo enviar");
        setEnviada(j.solicitud);
        setElegidas((a) => a.filter((e) => !e.ig));
        if (elegidas.every((e) => e.ig)) return;
      } else if (deInstagram.length > 0) {
        const resultados: CreadoIg[] = [];
        for (const e of deInstagram) {
          const nombre = `Impulso Instagram · ${e.etiqueta}`.slice(0, 80);
          const r = await fetch("/api/meta/instagram", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ portfolioId: cliente.id, accountId: cuenta, conjuntoId: conjunto.id, mediaId: e.postId, nombre }),
          });
          const j = (await r.json().catch(() => ({}))) as { enlace?: string; error?: string };
          resultados.push({ nombre, enlace: r.ok ? (j.enlace ?? null) : null, error: r.ok ? null : (j.error ?? "No se pudo crear") });
        }
        setCreadosIg(resultados);
        setElegidas((a) => a.filter((e) => !e.ig));
        if (elegidas.every((e) => e.ig)) return;
      }
      const drafts = modo === "nuevo"
        ? [{ ...destino, name: `Anuncio nuevo · ${nuevo.headline || nuevo.message}`.slice(0, 80), message: nuevo.message, metaHeadline: nuevo.headline, mediaType: nuevo.mediaType, mediaUrl: nuevo.mediaUrl, landingUrl: nuevo.landingUrl.trim() || cliente.website || "" }]
        : elegidas.filter((e) => !e.ig).map((e, i) => ({
        name: `Impulso ${i + 1} · ${e.etiqueta}`.slice(0, 80),
        ...destino,
        boostPostId: e.postId,
      }));
      const r = await fetch("/api/solicitudes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ drafts }) });
      const j = (await r.json()) as { solicitud?: Enviada; error?: string };
      if (!r.ok || !j.solicitud) throw new Error(j.error ?? "No se pudo enviar");
      setEnviada(j.solicitud);
      setElegidas([]);
      setNuevo(NUEVO_VACIO);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar");
    } finally {
      setCargando(null);
    }
  }

  async function aprobarYa() {
    if (!enviada) return;
    setCargando("aprobar");
    setError(null);
    try {
      const r = await fetch(`/api/solicitudes/${enviada.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accion: "aprobar" }) });
      const j = (await r.json()) as { solicitud?: Enviada; error?: string };
      if (!r.ok || !j.solicitud) throw new Error(j.error ?? "No se pudo publicar");
      setEnviada(j.solicitud);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo publicar");
    } finally {
      setCargando(null);
    }
  }

  if (!clienteId) return <div className="p-6 text-sm text-muted-foreground">Elige un cliente arriba para empezar.</div>;

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-4 p-4 md:p-6">
      <div>
        <h2 className="neo-section-title">Boostear anuncio</h2>
        <p className="mt-3 text-sm leading-6 text-foreground/58">
          Elige la campaña y el conjunto, y luego una publicación o un anuncio que ya exista. Al aprobarse queda corriendo.
          {puedeAprobar ? "" : " Un supervisor lo aprueba antes de publicarse."}
        </p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      {creadosIg.length > 0 && (
        <Surface className="space-y-2 p-4">
          {creadosIg.map((c) => (
            <p key={c.nombre} className="text-sm">
              {c.error ? <span className="text-danger">{c.nombre}: {c.error}</span> : (
                <><Check className="mr-1 inline size-4 text-ok" />{c.nombre} creado y corriendo. {c.enlace && <a href={c.enlace} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">Revisar en Meta</a>}</>
              )}
            </p>
          ))}
          <Button type="button" variant="outline" className="w-full" onClick={() => setCreadosIg([])}>Entendido</Button>
        </Surface>
      )}
      {enviada ? (
        <Surface className="space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Check className="size-4 text-ok" /> {enviada.mensaje}
          </p>
          {enviada.enlaces.map((e) => (
            <a key={e.url} href={e.url} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-brand hover:underline">
              {e.etiqueta || "Revisar en la plataforma"}
            </a>
          ))}
          {enviada.estado === "pendiente" && puedeAprobar && (
            <Button type="button" className="w-full font-extrabold" disabled={cargando === "aprobar"} onClick={() => void aprobarYa()}>
              <Rocket /> {cargando === "aprobar" ? "Publicando…" : "Aprobar y publicar"}
            </Button>
          )}
          <Button type="button" variant="outline" className="w-full" onClick={() => setEnviada(null)}>
            Boostear otro
          </Button>
        </Surface>
      ) : (
        <Surface className="space-y-4 p-4">
          {cliente && cliente.accounts.filter((a) => a.provider === "meta").length > 1 && (
            <label className="block text-xs font-semibold text-foreground/70">
              Cuenta de Meta
              <select className={cn(campoClase, "mt-1")} value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
                {cliente.accounts.filter((a) => a.provider === "meta").map((a) => (
                  <option key={a.externalId} value={a.externalId}>{a.name || a.externalId}</option>
                ))}
              </select>
            </label>
          )}
          {cliente && !cuenta && <p className="text-sm text-muted-foreground">Este cliente no tiene cuentas de Meta conectadas.</p>}
          {cuenta && !arbol && !error && <p className="text-sm text-muted-foreground">Leyendo campañas…</p>}
          {arbol && (
            <>
              <label className="block text-xs font-semibold text-foreground/70">
                Campaña
                <select className={cn(campoClase, "mt-1")} value={campanaId} onChange={(e) => { setCampanaId(e.target.value); setConjuntoId(""); }}>
                  <option value="">Elige una campaña…</option>
                  {arbol.campanas.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}{c.estado ? ` · ${c.estado}` : ""}{c.objetivo && c.objetivo !== "OUTCOME_ENGAGEMENT" ? " · no es de interacción" : ""}</option>
                  ))}
                </select>
                {campana && campana.objetivo !== "OUTCOME_ENGAGEMENT" && (
                  <span className="mt-1 block font-normal text-warn">Meta solo deja boostear publicaciones de Facebook con «Boostear» en campañas de interacción. En esta se crearán como anuncios nuevos dentro del conjunto.</span>
                )}
              </label>
              <label className="block text-xs font-semibold text-foreground/70">
                Conjunto de anuncios
                <select className={cn(campoClase, "mt-1")} value={conjuntoId} disabled={!campanaId} onChange={(e) => setConjuntoId(e.target.value)}>
                  <option value="">{campanaId ? "Elige un conjunto…" : "Primero la campaña"}</option>
                  {conjuntos.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}{c.estado ? ` · ${c.estado}` : ""}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          {conjunto && cliente && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(["publicacion", "anuncio", "nuevo", "imagenes", "carrusel"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModo(m)}
                    className={cn("h-10 rounded-full border text-sm font-semibold", modo === m ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted-foreground")}
                  >
                    {m === "publicacion" ? "Publicación" : m === "anuncio" ? "Anuncio existente" : m === "nuevo" ? "Imagen o video nuevo" : m === "imagenes" ? "Varias imágenes" : "Carrusel"}
                  </button>
                ))}
              </div>
              {modo === "imagenes" || modo === "carrusel" ? (
                <ContenidoNuevo key={`${modo}-${conjunto.id}`} formato={modo} clienteId={cliente.id} website={cliente.website ?? null} cuenta={cuenta} campana={campana!} conjunto={conjunto} onEnviada={setEnviada} />
              ) : modo === "nuevo" ? (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-foreground/70">
                    Imagen o video (JPG, PNG o MP4)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,video/mp4,video/quicktime"
                      className="mt-1 block w-full text-sm"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void subirArchivo(f);
                      }}
                    />
                  </label>
                  {subiendo && <p className="text-xs text-muted-foreground">Subiendo…</p>}
                  {nuevo.mediaUrl && nuevo.mediaType === "image" && <span className="block h-32 w-32 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url(${nuevo.mediaUrl})` }} />}
                  {nuevo.mediaUrl && nuevo.mediaType === "video" && <p className="text-xs text-ok">Video subido.</p>}
                  <textarea className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" rows={3} placeholder="Texto principal del anuncio" value={nuevo.message} onChange={(e) => setNuevo((n) => ({ ...n, message: e.target.value }))} />
                  <input className={campoClase} placeholder="Título (opcional)" value={nuevo.headline} onChange={(e) => setNuevo((n) => ({ ...n, headline: e.target.value }))} />
                  <input className={campoClase} placeholder={cliente.website ? `Destino (vacío: ${cliente.website})` : "URL de destino"} value={nuevo.landingUrl} onChange={(e) => setNuevo((n) => ({ ...n, landingUrl: e.target.value }))} />
                  <p className="text-[0.68rem] leading-5 text-foreground/45">Este anuncio se crea nuevo dentro del conjunto elegido (sirve en cualquier campaña, no solo de interacción).</p>
                </div>
              ) : modo === "publicacion" ? (
                <>
                  <Button type="button" variant="outline" className="w-full" onClick={() => setSelector(true)}>
                    <Images /> Elegir publicaciones de Facebook o Instagram
                  </Button>
                  <SelectorDePublicaciones
                    open={selector}
                    onOpenChange={setSelector}
                    portfolioId={cliente.id}
                    accountId={cuenta}
                    nombreCuenta={cliente.name}
                    onSeleccionar={(p: Publicacion) => {
                      setError(null);
                      agregar({ postId: p.id, etiqueta: (p.caption ?? "publicación").replace(/\s+/g, " ").slice(0, 40), ig: p.platform === "instagram" });
                    }}
                  />
                </>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {!anuncios && !error && <p className="text-sm text-muted-foreground">Leyendo anuncios…</p>}
                  {(anuncios ?? []).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => agregar({ postId: a.postId, etiqueta: a.nombre ?? "anuncio" })}
                      className="flex w-full items-center gap-3 rounded-xl border border-border p-2 text-left"
                    >
                      {a.miniatura && <span className="size-12 shrink-0 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url(${a.miniatura})` }} />}
                      <span className="min-w-0 text-xs">
                        <span className="block truncate font-semibold text-foreground">{a.nombre}</span>
                        <span className="block truncate text-muted-foreground">{a.conjunto ?? a.campana}</span>
                      </span>
                    </button>
                  ))}
                  {anuncios && anuncios.length === 0 && <p className="text-sm text-muted-foreground">No hay anuncios con publicación para boostear.</p>}
                </div>
              )}

              {modo !== "nuevo" && modo !== "imagenes" && modo !== "carrusel" && elegidas.length > 0 && (
                <ul className="space-y-1.5">
                  {elegidas.map((e) => (
                    <li key={e.postId} className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-xs">
                      <span className="truncate">{e.etiqueta}</span>
                      <button type="button" className="shrink-0 font-bold text-muted-foreground hover:text-danger" onClick={() => setElegidas((a) => a.filter((x) => x.postId !== e.postId))}>
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {modo !== "imagenes" && modo !== "carrusel" && (
              <Button type="button" className="w-full font-extrabold" disabled={(modo === "nuevo" ? !nuevoListo : elegidas.length === 0) || cargando === "enviar"} onClick={() => void enviar()}>
                <Rocket /> {cargando === "enviar" ? "Armando…" : puedeAprobar ? modo === "nuevo" ? "Preparar anuncio nuevo" : `Preparar ${elegidas.length || ""} impulso${elegidas.length === 1 ? "" : "s"}` : "Enviar a revisión"}
              </Button>
              )}
            </div>
          )}
        </Surface>
      )}
    </div>
  );
}
