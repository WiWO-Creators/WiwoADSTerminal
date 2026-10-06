"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, ShieldAlert, TriangleAlert } from "lucide-react";

import { TEXTO_SIN_GTM } from "@/lib/gtm";
import type { ResultadoMedicion } from "@/lib/medicion";
import { cn } from "@/lib/utils";
import { Surface } from "./ui";

type Respuesta = (
  | { estado: "sin_propiedad" }
  | { estado: "error"; mensaje: string }
  | { estado: "ok"; propiedad: string; resultado: ResultadoMedicion; desde: string; hasta: string }
) & { gtm: "tiene" | "no_tiene" | null };

/**
 * Salud de medición del cliente: ¿GA4 está midiendo bien los leads? Muestra los
 * problemas del marcaje que más pesan (eventos que no son conversiones pero
 * cuentan como clave, leads que no cuentan, eventos que dejaron de llegar,
 * duplicados). Sin la propiedad de GA4 del cliente no hay nada que vigilar: la
 * tarjeta solo avisa a quien puede editar la ficha.
 */
export function SaludDeMedicion({ portfolioId, puedeEditar }: { portfolioId: string; puedeEditar: boolean }) {
  const [datos, setDatos] = useState<Respuesta | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/medicion?cliente=${encodeURIComponent(portfolioId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelado && d) setDatos(d as Respuesta);
      })
      .catch(() => {
        // Sin lectura la pantalla funciona igual: la tarjeta simplemente no aparece.
      });
    return () => {
      cancelado = true;
    };
  }, [portfolioId]);

  if (!datos) return null;

  // Sin Tag Manager, los leads pueden medirse mal: se avisa siempre, antes que cualquier otra cosa.
  const avisoGtm =
    datos.gtm === "no_tiene" ? (
      <div
        role="alert"
        className="mb-4 flex items-start gap-3 rounded-[16px] border border-danger-deep/30 bg-danger-deep/10 px-4 py-3"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
        <p className="text-sm leading-5 text-foreground/80">
          <strong className="text-danger">{TEXTO_SIN_GTM}.</strong> Sin Tag Manager, los leads y las conversiones pueden
          medirse mal o no medirse. Instálalo en el sitio y registra el contenedor en la ficha del cliente.
        </p>
      </div>
    ) : null;

  if (datos.estado === "sin_propiedad") {
    return (
      <>
        {avisoGtm}
        {puedeEditar && (
          <p className="mb-4 rounded-xl border border-foreground/10 bg-foreground/4 px-4 py-3 text-xs leading-5 text-foreground/60">
            La medición de este cliente no se está vigilando: falta el ID de su propiedad de Google Analytics en la ficha.
          </p>
        )}
      </>
    );
  }

  if (datos.estado === "error") {
    return (
      <>
        {avisoGtm}
        <p className="mb-4 rounded-xl border border-warn/25 bg-warn/8 px-4 py-3 text-xs leading-5 text-foreground/70">
          {datos.mensaje}
        </p>
      </>
    );
  }

  const { resultado: r } = datos;
  return (
    <>
    {avisoGtm}
    <Surface className="mb-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {r.sano ? <CheckCircle2 className="size-4 text-ok" /> : <ShieldAlert className="size-4 text-danger" />}
          <h3 className="text-sm font-bold text-foreground">Salud de medición</h3>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[0.65rem] font-bold",
              r.sano ? "border-ok/40 bg-ok/10 text-ok" : "border-danger/40 bg-danger/10 text-danger",
            )}
          >
            {r.sano ? (r.hallazgos.length > 0 ? "Con observaciones" : "Sin problemas") : "Hay problemas"}
          </span>
        </div>
        <a
          href={`https://analytics.google.com/analytics/web/#/p${datos.propiedad}/reports/intelligenthome`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
        >
          Abrir Google Analytics <ExternalLink className="size-3" />
        </a>
      </div>

      {r.hallazgos.length === 0 ? (
        <p className="mt-3 text-sm text-foreground/65">
          No se detectó ningún problema en el marcaje de los últimos 30 días.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {r.hallazgos.map((h) => (
            <li key={h.id} className="flex gap-2.5">
              <TriangleAlert
                className={cn("mt-0.5 size-4 shrink-0", h.severidad === "alta" ? "text-danger" : "text-warn")}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{h.titulo}</p>
                <p className="mt-0.5 text-xs leading-5 text-foreground/65">{h.detalle}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[0.68rem] text-muted-foreground">
        Últimos 30 días ({datos.desde} a {datos.hasta}) · {r.resumen.eventosDeLead} {r.resumen.eventosDeLead === 1 ? "evento parece de lead" : "eventos parecen de lead"} ·{" "}
        {r.resumen.leadsMarcadosComoClave} marcado{r.resumen.leadsMarcadosComoClave === 1 ? "" : "s"} como clave ·{" "}
        {r.resumen.eventosClave} eventos clave en total
      </p>
    </Surface>
    </>
  );
}
