"use client";

import type { ReactNode } from "react";
import { Pin, Plus, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Editor de un anuncio de búsqueda responsivo de Google, con su forma real: hasta 15 titulares de 30
 * caracteres, hasta 4 descripciones de 90, URL final y dos rutas visibles de 15. Una fila por texto (no una
 * caja con «uno por línea») y una vista previa tipo resultado de Google que se actualiza al escribir.
 *
 * Los valores siguen guardándose como texto con un elemento por línea (`titulares`, `descripciones`): así el
 * armado de cambios de `editar-entidad.tsx` no cambia. Las filas en blanco se ignoran al enviar.
 */
export const LIMITES_RSA = {
  titulares: { min: 3, max: 15, caracteres: 30 },
  descripciones: { min: 2, max: 4, caracteres: 90 },
  ruta: 15,
} as const;

type Original = { texto: string; fijado?: string | null };

export function EditorAnuncioGoogle({
  valores,
  poner,
  titularesOriginales,
  descripcionesOriginales,
}: {
  valores: Record<string, string>;
  poner: (clave: string) => (valor: string) => void;
  /** Lo que tiene hoy el anuncio, para mostrar qué texto está fijado a una posición. */
  titularesOriginales: Original[];
  descripcionesOriginales: Original[];
}) {
  const titulares = filas(valores.titulares);
  const descripciones = filas(valores.descripciones);
  const conTexto = (lista: string[]) => lista.map((t) => t.trim()).filter(Boolean);

  const dominio = dominioDe(valores.urlFinal ?? "");
  const ruta = [dominio, valores.path1?.trim(), valores.path2?.trim()].filter(Boolean).join(" › ");
  const titulosVista = conTexto(titulares).slice(0, 3);
  const descripcionesVista = conTexto(descripciones).slice(0, 2);

  return (
    <div className="space-y-4">
      {/* Vista previa: así se vería en una búsqueda de Google. */}
      <div>
        <p className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-foreground/40">Así se vería en Google</p>
        <div className="wa-preview-google rounded-xl p-3.5 font-sans">
          <div className="wa-g-domain flex items-center gap-1.5 text-[0.72rem]">
            <span className="wa-g-label rounded-[3px] border px-1 text-[0.6rem] font-bold">Anuncio</span>
            <span className="truncate">{ruta || "tusitio.com"}</span>
          </div>
          <p className="wa-g-title mt-0.5 text-[1.05rem] leading-snug break-words">
            {titulosVista.length > 0 ? titulosVista.join(" | ") : "Título del anuncio"}
          </p>
          <p className="wa-g-desc mt-0.5 line-clamp-3 text-[0.8rem] leading-5">
            {descripcionesVista.length > 0 ? descripcionesVista.join(" ") : "La descripción aparecerá acá."}
          </p>
        </div>
        <p className="mt-1 text-[0.65rem] leading-4 text-foreground/40">
          Google combina tus titulares y descripciones: muestra hasta 3 titulares y 2 descripciones, no siempre estos.
        </p>
      </div>

      <Seccion
        titulo="Titulares"
        contador={`${conTexto(titulares).length} de ${LIMITES_RSA.titulares.max}`}
        avisoMinimo={conTexto(titulares).length < LIMITES_RSA.titulares.min ? `Mínimo ${LIMITES_RSA.titulares.min}` : null}
        ayuda={`De ${LIMITES_RSA.titulares.min} a ${LIMITES_RSA.titulares.max}, hasta ${LIMITES_RSA.titulares.caracteres} caracteres cada uno. Cuantos más y más distintos, más combinaciones puede probar Google.`}
      >
        <ListaDeTextos
          etiqueta="Titular"
          filas={titulares}
          max={LIMITES_RSA.titulares.max}
          caracteres={LIMITES_RSA.titulares.caracteres}
          originales={titularesOriginales}
          onCambio={(lista) => poner("titulares")(lista.join("\n"))}
        />
      </Seccion>

      <Seccion
        titulo="Descripciones"
        contador={`${conTexto(descripciones).length} de ${LIMITES_RSA.descripciones.max}`}
        avisoMinimo={conTexto(descripciones).length < LIMITES_RSA.descripciones.min ? `Mínimo ${LIMITES_RSA.descripciones.min}` : null}
        ayuda={`De ${LIMITES_RSA.descripciones.min} a ${LIMITES_RSA.descripciones.max}, hasta ${LIMITES_RSA.descripciones.caracteres} caracteres cada una.`}
      >
        <ListaDeTextos
          etiqueta="Descripción"
          filas={descripciones}
          max={LIMITES_RSA.descripciones.max}
          caracteres={LIMITES_RSA.descripciones.caracteres}
          originales={descripcionesOriginales}
          largo
          onCambio={(lista) => poner("descripciones")(lista.join("\n"))}
        />
      </Seccion>

      <Seccion titulo="Destino" ayuda="A dónde lleva el anuncio y cómo se ve la dirección en el resultado.">
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-foreground/60">URL final</span>
            <Input value={valores.urlFinal ?? ""} onChange={(e) => poner("urlFinal")(e.target.value)} placeholder="https://" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(["path1", "path2"] as const).map((clave, i) => (
              <label key={clave} className="block space-y-1">
                <span className="flex justify-between text-xs font-semibold text-foreground/60">
                  Ruta visible {i + 1}
                  <span className="font-normal text-foreground/35">
                    {(valores[clave] ?? "").length}/{LIMITES_RSA.ruta}
                  </span>
                </span>
                <Input maxLength={LIMITES_RSA.ruta} value={valores[clave] ?? ""} onChange={(e) => poner(clave)(e.target.value)} />
              </label>
            ))}
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-foreground/60">Sufijo de URL (parámetros de seguimiento)</span>
            <Input value={valores.sufijoUrl ?? ""} onChange={(e) => poner("sufijoUrl")(e.target.value)} placeholder="utm_source=google&utm_medium=cpc" />
          </label>
        </div>
      </Seccion>
    </div>
  );
}

/** Una tarjeta con título, contador y ayuda, como el resto de las secciones del editor. */
function Seccion({
  titulo,
  contador,
  avisoMinimo,
  ayuda,
  children,
}: {
  titulo: string;
  contador?: string;
  avisoMinimo?: string | null;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-foreground/10 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-foreground">{titulo}</h4>
        <span className="flex items-center gap-2 text-[0.7rem]">
          {avisoMinimo && <span className="font-semibold text-warn">{avisoMinimo}</span>}
          {contador && <span className="text-foreground/45">{contador}</span>}
        </span>
      </div>
      {ayuda && <p className="mb-2.5 text-[0.7rem] leading-4 text-foreground/40">{ayuda}</p>}
      {children}
    </section>
  );
}

function ListaDeTextos({
  etiqueta,
  filas: lista,
  max,
  caracteres,
  originales,
  largo = false,
  onCambio,
}: {
  etiqueta: string;
  filas: string[];
  max: number;
  caracteres: number;
  originales: Original[];
  largo?: boolean;
  onCambio: (lista: string[]) => void;
}) {
  const fijadoDe = (texto: string): string | null => originales.find((o) => o.texto.trim() === texto.trim())?.fijado ?? null;

  return (
    <div className="space-y-2">
      {lista.map((texto, i) => {
        const largoActual = texto.length;
        const excedido = largoActual > caracteres;
        const fijado = texto.trim() ? fijadoDe(texto) : null;
        return (
          <div key={i} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Input
                value={texto}
                aria-label={`${etiqueta} ${i + 1}`}
                placeholder={`${etiqueta} ${i + 1}`}
                onChange={(e) => onCambio(lista.map((t, j) => (j === i ? e.target.value : t)))}
                className={cn(excedido && "border-danger/60")}
              />
              <div className="mt-0.5 flex items-center justify-between text-[0.62rem]">
                <span className="flex items-center gap-1 text-foreground/45">
                  {fijado && (
                    <>
                      <Pin className="size-3" /> Fijado ({fijado})
                    </>
                  )}
                </span>
                <span className={excedido ? "font-semibold text-danger" : "text-foreground/35"}>
                  {largoActual}/{caracteres}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onCambio(lista.filter((_, j) => j !== i))}
              aria-label={`Quitar ${etiqueta.toLowerCase()} ${i + 1}`}
              className="mt-1.5 rounded-full p-1.5 text-foreground/35 transition-colors hover:bg-foreground/8 hover:text-danger"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
      {lista.length < max && (
        <button
          type="button"
          onClick={() => onCambio([...lista, ""])}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-brand/30 px-3 py-1.5 text-xs font-bold text-brand transition-colors hover:bg-brand/10",
            largo && "mt-0.5",
          )}
        >
          <Plus className="size-3.5" />
          Agregar {etiqueta.toLowerCase()}
        </button>
      )}
    </div>
  );
}

/** El valor guardado (uno por línea) como lista de filas; sin nada, una fila vacía para empezar a escribir. */
function filas(valor: string | undefined): string[] {
  const lista = (valor ?? "").split("\n");
  return lista.length === 1 && lista[0] === "" ? [""] : lista;
}

function dominioDe(url: string): string {
  const limpio = url.trim();
  if (!limpio) return "";
  try {
    return new URL(/^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`).hostname;
  } catch {
    return limpio;
  }
}
