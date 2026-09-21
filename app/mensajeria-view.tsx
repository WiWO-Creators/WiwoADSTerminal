"use client";

import { useMemo, useState } from "react";
import { Info, MessageCircle, PhoneCall } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { AdSummary } from "@/lib/performance-store";
import { cn } from "@/lib/utils";
import { OrbeDeBoton, Surface } from "./ui";

type Tipo = "whatsapp" | "llamada" | "mensaje";

const TIPOS: Record<Tipo, { label: string; botones: string[] }> = {
  whatsapp: { label: "WhatsApp", botones: ["WHATSAPP_MESSAGE"] },
  llamada: { label: "Llamadas", botones: ["CALL_NOW", "CALL", "CALL_ME"] },
  mensaje: { label: "Mensajes (Messenger/Instagram)", botones: ["MESSAGE_PAGE"] },
};

function tipoDe(boton: string | null | undefined): Tipo | null {
  if (!boton) return null;
  for (const [id, tipo] of Object.entries(TIPOS)) {
    if (tipo.botones.includes(boton)) return id as Tipo;
  }
  return null;
}

const ESTADOS_ACTIVOS = ["ACTIVE"];
const ESTADOS_PAUSABLES = ["ACTIVE", "WITH_ISSUES", "IN_PROCESS", "PENDING_REVIEW"];

function etiquetaEstado(estado: string | null): string {
  switch (estado) {
    case "ACTIVE":
      return "Activo";
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
    case "ADSET_PAUSED":
      return "Pausado";
    case "ARCHIVED":
      return "Archivado";
    case "WITH_ISSUES":
      return "Con problemas";
    case "DISAPPROVED":
      return "Rechazado";
    default:
      return estado ?? "—";
  }
}

/**
 * Anuncios de mensajería de Meta (WhatsApp, llamadas, Messenger) de un vistazo,
 * con pausa y activación en bloque.
 *
 * Lo que esta pantalla NO hace, y por qué: mostrar ni cambiar el número de
 * WhatsApp de cada anuncio. Se verificó contra Windsor: para estos anuncios el
 * destino (`link_url`) llega vacío y no existe ninguna acción que edite el
 * número del botón ni del conjunto — el número vive en la cuenta de WhatsApp
 * Business, que Windsor no expone. Lo que sí entrega es el tipo de botón de
 * cada anuncio, y con eso se encuentran y se manejan en bloque.
 */
export function MensajeriaView({
  ads,
  puedeAprobar,
}: {
  ads: AdSummary[];
  puedeAprobar: boolean;
}) {
  const [tipo, setTipo] = useState<Tipo | "todos">("todos");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState<"pausar" | "activar" | null>(null);
  const [procesando, setProcesando] = useState<{ hecho: number; total: number } | null>(
    null,
  );
  const [estadosLocales, setEstadosLocales] = useState<Record<string, string>>({});

  const conBoton = ads.filter((ad) => ad.provider === "meta" && ad.callToAction);
  const mensajeria = useMemo(
    () =>
      ads
        .filter((ad) => ad.provider === "meta" && tipoDe(ad.callToAction) !== null && ad.adId)
        .map((ad) => ({
          ad,
          tipo: tipoDe(ad.callToAction)!,
          estado: estadosLocales[ad.adId!] ?? ad.status,
        })),
    [ads, estadosLocales],
  );

  const visibles = mensajeria.filter((item) => tipo === "todos" || item.tipo === tipo);

  // Campaña → conjunto → anuncios, en el orden de la plataforma.
  const grupos = useMemo(() => {
    const porCampana = new Map<
      string,
      { cuenta: string; conjuntos: Map<string, typeof visibles> }
    >();
    for (const item of visibles) {
      const clave = `${item.ad.accountId}::${item.ad.campaignName}`;
      const campana =
        porCampana.get(clave) ??
        { cuenta: item.ad.accountName, conjuntos: new Map<string, typeof visibles>() };
      const conjunto = item.ad.adsetName ?? "(sin conjunto)";
      campana.conjuntos.set(conjunto, [...(campana.conjuntos.get(conjunto) ?? []), item]);
      porCampana.set(clave, campana);
    }
    return [...porCampana.entries()];
  }, [visibles]);

  const conteo = (t: Tipo) => mensajeria.filter((item) => item.tipo === t).length;
  const seleccionados = visibles.filter((item) => seleccion.has(item.ad.adId!));

  function alternar(adIds: string[], marcar: boolean) {
    setSeleccion((actual) => {
      const siguiente = new Set(actual);
      for (const id of adIds) {
        if (marcar) siguiente.add(id);
        else siguiente.delete(id);
      }
      return siguiente;
    });
  }

  /** Pausa o activa cada anuncio elegido, de a tres a la vez para no saturar a Windsor. */
  async function aplicar(accion: "pausar" | "activar") {
    const objetivo = seleccionados.filter((item) =>
      accion === "pausar"
        ? ESTADOS_PAUSABLES.includes(item.estado ?? "")
        : !ESTADOS_ACTIVOS.includes(item.estado ?? "") && item.estado !== "ARCHIVED",
    );
    if (objetivo.length === 0) {
      toast.info(
        accion === "pausar"
          ? "Los anuncios elegidos ya están pausados"
          : "Los anuncios elegidos ya están activos (o archivados)",
      );
      return;
    }
    setProcesando({ hecho: 0, total: objetivo.length });
    let hechos = 0;
    const fallos: string[] = [];
    const cola = [...objetivo];
    async function trabajador() {
      while (cola.length > 0) {
        const item = cola.shift()!;
        try {
          const response = await fetch("/api/anuncios/estado", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              provider: "meta",
              nivel: "anuncio",
              accountId: item.ad.accountId,
              adId: item.ad.adId,
              activar: accion === "activar",
            }),
          });
          const body = (await response.json()) as { ok?: boolean; error?: string };
          if (!response.ok || !body.ok) throw new Error(body.error ?? "Falló");
          setEstadosLocales((actual) => ({
            ...actual,
            [item.ad.adId!]: accion === "activar" ? "ACTIVE" : "PAUSED",
          }));
        } catch (issue) {
          fallos.push(
            `${item.ad.adName ?? item.ad.adId}: ${issue instanceof Error ? issue.message : "falló"}`,
          );
        } finally {
          hechos += 1;
          setProcesando({ hecho: hechos, total: objetivo.length });
        }
      }
    }
    await Promise.all([trabajador(), trabajador(), trabajador()]);
    setProcesando(null);
    setConfirmando(null);
    if (fallos.length === 0) {
      toast.success(
        `${objetivo.length} anuncio${objetivo.length === 1 ? "" : "s"} ${accion === "pausar" ? "pausado" : "activado"}${objetivo.length === 1 ? "" : "s"}`,
      );
      setSeleccion(new Set());
    } else {
      toast.error(`${fallos.length} de ${objetivo.length} fallaron`, {
        description: fallos.slice(0, 3).join(" · "),
      });
    }
  }

  if (conBoton.length === 0) {
    return (
      <Surface className="p-5">
        <p className="flex items-start gap-2 text-sm leading-6 text-foreground/62">
          <Info className="mt-1 size-4 shrink-0 text-brand" />
          Todavía no hay datos del botón de cada anuncio. Pulsa{" "}
          <strong className="text-foreground">Actualizar</strong> en la barra
          superior para leerlos de Meta — es una lectura, no cambia nada.
        </p>
      </Surface>
    );
  }

  return (
    <div className="space-y-4">
      <Surface className="p-4">
        <p className="flex items-start gap-2 text-xs leading-5 text-foreground/55">
          <Info className="mt-0.5 size-3.5 shrink-0 text-brand" />
          <span>
            Aquí se ven los anuncios por el <strong>tipo de botón</strong> y se
            pausan o activan en bloque. El <strong>número de WhatsApp</strong> de
            cada anuncio no se puede ver ni cambiar desde WiWO.ADS: Windsor no lo
            entrega (el destino llega vacío) ni tiene una acción para editarlo.
            Vive en la cuenta de WhatsApp Business de Meta.
          </span>
        </p>
      </Surface>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: "todos" as const, label: "Todos", n: mensajeria.length },
            ...(Object.keys(TIPOS) as Tipo[]).map((id) => ({
              id,
              label: TIPOS[id].label,
              n: conteo(id),
            })),
          ]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTipo(item.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              tipo === item.id
                ? "border-brand bg-brand/12 text-foreground"
                : "border-foreground/12 text-foreground/55 hover:text-foreground",
            )}
          >
            {item.id === "whatsapp" ? (
              <MessageCircle className="size-3.5" />
            ) : item.id === "llamada" ? (
              <PhoneCall className="size-3.5" />
            ) : null}
            {item.label}
            <span className="metric-number text-foreground/40">{item.n}</span>
          </button>
        ))}

        {puedeAprobar && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-foreground/50">
              {seleccionados.length} seleccionado{seleccionados.length === 1 ? "" : "s"}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={seleccionados.length === 0 || procesando !== null}
              onClick={() => setConfirmando("pausar")}
              className="border-warn-deep/30 bg-transparent text-warn hover:bg-warn-deep/10"
            >
              Pausar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={seleccionados.length === 0 || procesando !== null}
              onClick={() => setConfirmando("activar")}
              className="border-ok-deep/30 bg-transparent text-ok hover:bg-ok-deep/10"
            >
              Activar
            </Button>
          </div>
        )}
      </div>

      {grupos.length === 0 ? (
        <Surface className="p-6 text-center text-sm text-foreground/50">
          No hay anuncios de este tipo{" "}
          {ads.length > 0 ? "para el cliente elegido." : "todavía."}
        </Surface>
      ) : (
        grupos.map(([clave, campana]) => {
          const nombre = clave.split("::").slice(1).join("::");
          return (
            <Surface key={clave} className="overflow-hidden">
              <div className="border-b border-foreground/10 px-4 py-3">
                <h3 className="text-sm font-bold text-foreground">{nombre}</h3>
                <p className="mt-0.5 text-[0.65rem] text-foreground/40">
                  Meta Ads · {campana.cuenta}
                </p>
              </div>
              {[...campana.conjuntos.entries()].map(([conjunto, items]) => {
                const ids = items.map((item) => item.ad.adId!);
                const todos = ids.every((id) => seleccion.has(id));
                return (
                  <div key={conjunto} className="border-b border-foreground/8 last:border-b-0">
                    <label className="flex items-center gap-2.5 bg-foreground/[0.03] px-4 py-2 text-xs font-semibold text-foreground/75">
                      {puedeAprobar && (
                        <Checkbox
                          checked={todos}
                          onCheckedChange={(marcado) => alternar(ids, Boolean(marcado))}
                          className="border-foreground/30"
                        />
                      )}
                      {conjunto}
                      <span className="metric-number font-normal text-foreground/40">
                        {items.length} anuncio{items.length === 1 ? "" : "s"}
                      </span>
                    </label>
                    <ul className="divide-y divide-foreground/6">
                      {items.map(({ ad, tipo: tipoAnuncio, estado }) => (
                        <li key={ad.adId} className="flex items-center gap-2.5 px-4 py-2">
                          {puedeAprobar && (
                            <Checkbox
                              checked={seleccion.has(ad.adId!)}
                              onCheckedChange={(marcado) => alternar([ad.adId!], Boolean(marcado))}
                              className="border-foreground/30"
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground/82">
                            {ad.adName ?? ad.adId}
                          </span>
                          <span className="hidden text-[0.62rem] text-foreground/40 sm:inline">
                            {TIPOS[tipoAnuncio].label}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[0.62rem] font-bold",
                              estado === "ACTIVE"
                                ? "bg-ok-deep/12 text-ok"
                                : estado === "WITH_ISSUES" || estado === "DISAPPROVED"
                                  ? "bg-danger-deep/12 text-danger"
                                  : "bg-foreground/8 text-foreground/50",
                            )}
                          >
                            {etiquetaEstado(estado)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </Surface>
          );
        })
      )}

      <AlertDialog
        open={confirmando !== null}
        onOpenChange={(abierto) => !abierto && procesando === null && setConfirmando(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmando === "pausar" ? "Pausar" : "Activar"} {seleccionados.length}{" "}
              anuncio{seleccionados.length === 1 ? "" : "s"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esto escribe de verdad en Meta, anuncio por anuncio.
              {confirmando === "activar" &&
                " Un anuncio activo empieza a gastar si su conjunto y su campaña también están activos."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={procesando !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={procesando !== null}
              onClick={(evento) => {
                evento.preventDefault();
                if (confirmando) void aplicar(confirmando);
              }}
            >
              {procesando ? (
                <span className="flex items-center gap-2">
                  <OrbeDeBoton />
                  {procesando.hecho} / {procesando.total}
                </span>
              ) : confirmando === "pausar" ? (
                "Pausar"
              ) : (
                "Activar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
