"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Copy } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { LO_QUE_HABILITA_TIKTOK, type EstadoDeTiktok } from "@/lib/tiktok-estado-pura";
import { Surface } from "./ui";

/**
 * TikTok en Cuentas. Hoy se lee por Windsor; crear y editar directo llega con la aprobación de la app «WiwoAds» de TikTok. La
 * tarjeta dice en qué punto está, qué se habilita después y qué hay que cargar en el servidor cuando TikTok entregue las claves.
 */
export function TiktokCard({ canManage }: { canManage: boolean }) {
  const [datos, setDatos] = useState<{ estado: EstadoDeTiktok; urlDeRetorno: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/tiktok/estado", { headers: { accept: "application/json" } })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { estado?: EstadoDeTiktok; urlDeRetorno?: string; error?: string } | null;
        if (!r.ok || !j?.estado || !j.urlDeRetorno) throw new Error(j?.error ?? "No pudimos leer el estado de TikTok");
        if (!cancelado) setDatos({ estado: j.estado, urlDeRetorno: j.urlDeRetorno });
      })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : "No pudimos leer el estado de TikTok");
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const configurado = datos?.estado.configurado ?? false;
  const insignia = !datos
    ? { texto: error ? "Sin datos" : "Cargando…", clase: "border-foreground/10 bg-card/60 text-foreground/48" }
    : configurado
      ? { texto: "Claves cargadas · falta conectar", clase: "border-brand/30 bg-brand/10 text-brand" }
      : { texto: "App en revisión", clase: "border-warn/30 bg-warn/10 text-warn" };

  return (
    <Surface className="flex min-h-[330px] flex-col overflow-hidden">
      <div className="flex items-start justify-between border-b border-foreground/8 p-5">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-black text-lg font-black text-white shadow-sm ring-1 ring-foreground/15">♪</span>
          <div>
            <h3 className="text-lg font-bold text-foreground">TikTok</h3>
            <p className="mt-1 text-xs leading-5 text-foreground/48">TikTok Ads · hoy se lee por Windsor · la conexión directa es del equipo, no de cada persona</p>
          </div>
        </div>
        <Badge variant="outline" className={insignia.clase}>
          {configurado ? <CheckCircle2 /> : <Clock3 />}
          {insignia.texto}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        {error ? (
          <p className="text-sm text-foreground/60">{error}</p>
        ) : (
          <>
            <div>
              <p className="font-micro text-[0.58rem] text-foreground/38">HOY</p>
              <p className="mt-1.5 text-xs leading-5 text-foreground/65">Las métricas de TikTok llegan por Windsor y se ven en Cliente, Inversión y Salud de medición. Todavía no se crea ni se edita desde aquí.</p>
            </div>
            <div>
              <p className="font-micro text-[0.58rem] text-foreground/38">CUANDO SE CONECTE LA CUENTA DEL EQUIPO</p>
              <ul className="mt-1.5 space-y-1 text-xs leading-5 text-foreground/65">
                {LO_QUE_HABILITA_TIKTOK.map((linea) => (
                  <li key={linea} className="flex gap-2">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand" />
                    {linea}
                  </li>
                ))}
              </ul>
            </div>
            {datos && canManage && (
              <div className="rounded-2xl border border-dashed border-foreground/14 bg-card/35 p-4">
                <p className="text-sm font-bold text-foreground">Lo que hay que dejar listo</p>
                <ul className="mt-1.5 space-y-1 text-xs leading-5 text-foreground/60">
                  <li>
                    {configurado
                      ? "App ID y Secret cargados en el servidor."
                      : `Cargar en el servidor ${datos.estado.falta.join(" y ")} (TikTok los entrega al aprobar la app; nunca se comparten por chat).`}
                  </li>
                  <li className="flex flex-wrap items-center gap-1.5">
                    Dejar registrada, exacta, esta URL de retorno en la app de TikTok:
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(datos.urlDeRetorno).then(() => toast.success("URL copiada"));
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-foreground/8 px-1.5 py-0.5 font-mono text-[0.68rem] text-foreground/75 hover:bg-foreground/12"
                    >
                      {datos.urlDeRetorno}
                      <Copy className="size-3" />
                    </button>
                  </li>
                  <li>Permisos de la app: cuentas publicitarias, anuncios, informes y contenido creativo.</li>
                  {configurado && <li className="font-semibold text-foreground/75">Lo siguiente en construirse: el botón «Conectar TikTok» para todo el equipo y la lectura y edición directas.</li>}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Surface>
  );
}
