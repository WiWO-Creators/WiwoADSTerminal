"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { es } from "react-day-picker/locale";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  RANGO_LABELS,
  RANGOS,
  esRangoNombrado,
  fechaCorta,
  rangoPersonalizado,
  resolverRango,
  type RangoId,
  type RangoNombrado,
} from "@/lib/rangos";
import { cn } from "@/lib/utils";
import { ThinkingOrb } from "./ui";

/** El día de un `Date` local como `YYYY-MM-DD`, sin pasar por UTC (un usuario
 * en Chile a las 21:00 ya está en "mañana" para `toISOString`). */
function aIso(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

function desdeIso(texto: string): Date {
  const [anio, mes, dia] = texto.split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

/**
 * Selector de periodo con la forma del de Meta Ads Manager: una lista de
 * periodos con nombre a la izquierda, un calendario de dos meses a la derecha
 * para elegir un rango a mano, y los botones Cancelar / Actualizar.
 *
 * Nada se aplica hasta "Actualizar": elegir fechas en el calendario cambia
 * solo lo que se ve acá adentro, no lanza una lectura contra Windsor por cada
 * clic (un rango largo puede tardar más de un minuto en frío).
 *
 * Trabaja con `RangoId` —un nombre o `desde..hasta`—, el mismo valor que
 * entiende el servidor, así que sirve igual para el tablero que para
 * cualquier lista que quiera filtrar por fechas.
 */
export function SelectorDeFechas({
  valor,
  onChange,
  periodos = [...RANGOS],
  cargando = false,
  disabled = false,
  alinear = "end",
  className,
}: {
  valor: RangoId;
  onChange: (rango: RangoId) => void;
  periodos?: RangoNombrado[];
  cargando?: boolean;
  disabled?: boolean;
  alinear?: "start" | "center" | "end";
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombrado, setNombrado] = useState<RangoNombrado | null>(null);
  const [seleccion, setSeleccion] = useState<DateRange | undefined>();
  // true: ya se tocó el primer día y falta el último — como en Meta, el
  // siguiente toque cierra el rango; si no, el toque abre uno nuevo.
  const [esperandoFin, setEsperandoFin] = useState(false);
  const [mes, setMes] = useState<Date>(new Date());

  const hoy = new Date();
  const actual = resolverRango(valor, hoy);

  function alAbrir(siguiente: boolean) {
    setAbierto(siguiente);
    if (!siguiente) return;
    // Cada apertura parte de lo que está aplicado, no de una selección a
    // medias que se abandonó con "Cancelar".
    const desde = desdeIso(actual.desde);
    setNombrado(esRangoNombrado(valor) ? valor : null);
    setSeleccion({ from: desde, to: desdeIso(actual.hasta) });
    setEsperandoFin(false);
    // El calendario muestra dos meses: el rango termina en el de la derecha.
    setMes(new Date(desde.getFullYear(), desde.getMonth(), 1));
  }

  function elegirNombrado(id: RangoNombrado) {
    const rango = resolverRango(id, new Date());
    setNombrado(id);
    setEsperandoFin(false);
    setSeleccion({ from: desdeIso(rango.desde), to: desdeIso(rango.hasta) });
    setMes(new Date(desdeIso(rango.desde).getFullYear(), desdeIso(rango.desde).getMonth(), 1));
  }

  function aplicar() {
    if (nombrado) {
      onChange(nombrado);
    } else if (seleccion?.from) {
      const hasta = seleccion.to ?? seleccion.from;
      onChange(rangoPersonalizado(aIso(seleccion.from), aIso(hasta)));
    }
    setAbierto(false);
  }

  const puedeAplicar = Boolean(nombrado || seleccion?.from);
  const desdeMostrado = seleccion?.from ? aIso(seleccion.from) : null;
  const hastaMostrado = seleccion?.to
    ? aIso(seleccion.to)
    : desdeMostrado;

  return (
    <Popover open={abierto} onOpenChange={alAbrir}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Elegir periodo"
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-md border border-foreground/10 bg-card/55 px-3 text-sm text-foreground transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4242FF] disabled:opacity-50",
            className,
          )}
        >
          {cargando ? (
            <ThinkingOrb size="xs" state="thinking" label="" />
          ) : (
            <CalendarRange className="size-3.5 text-brand" />
          )}
          <span className="truncate">{actual.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={alinear}
        className="w-auto max-w-[calc(100vw-1.5rem)] border-foreground/12 bg-[#2a2b29] p-0 text-foreground"
      >
        <div className="flex flex-col md:flex-row">
          <div
            role="radiogroup"
            aria-label="Periodos"
            className="scrollbar-thin flex max-h-72 shrink-0 flex-col gap-0.5 overflow-y-auto border-b border-foreground/10 p-2 md:max-h-[27rem] md:w-52 md:border-r md:border-b-0"
          >
            {periodos.map((id) => {
              const activo = nombrado === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => elegirNombrado(id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    activo
                      ? "bg-brand/15 text-foreground"
                      : "text-foreground/75 hover:bg-foreground/[0.06]",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-full border",
                      activo ? "border-brand" : "border-foreground/30",
                    )}
                  >
                    {activo && <span className="size-2 rounded-full bg-primary" />}
                  </span>
                  {RANGO_LABELS[id]}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col">
            <Calendar
              locale={es}
              weekStartsOn={1}
              numberOfMonths={2}
              month={mes}
              onMonthChange={setMes}
              // Sin `mode="range"`: el rango se dibuja con modificadores
              // propios. Con el modo del calendario, el rango dibujado no
              // coincidía con lo elegido (mostraba desde el día 1 aunque se
              // hubiera tocado el 10), porque ese modo lleva su propia idea de
              // qué extremo mover.
              modifiers={{
                inicio: seleccion?.from ?? [],
                fin: seleccion?.to ?? [],
                medio:
                  seleccion?.from && seleccion.to
                    ? { after: seleccion.from, before: seleccion.to }
                    : [],
              }}
              modifiersClassNames={{
                inicio: "[&>button]:!bg-primary [&>button]:!text-primary-foreground [&>button]:!rounded-md",
                fin: "[&>button]:!bg-primary [&>button]:!text-primary-foreground [&>button]:!rounded-md",
                medio: "[&>button]:!bg-brand/20 [&>button]:!text-foreground [&>button]:!rounded-none",
              }}
              // El comportamiento de rango que trae el calendario (mover el
              // extremo más cercano) desconcierta: aquí un toque abre un rango
              // nuevo y el siguiente lo cierra, en el orden que sea.
              onDayClick={(dia) => {
                setNombrado(null);
                if (!esperandoFin || !seleccion?.from) {
                  setSeleccion({ from: dia, to: undefined });
                  setEsperandoFin(true);
                  return;
                }
                const inicio = seleccion.from;
                setSeleccion(
                  dia < inicio ? { from: dia, to: inicio } : { from: inicio, to: dia },
                );
                setEsperandoFin(false);
              }}
              disabled={{ after: hoy }}
              className="[--cell-size:--spacing(9)]"
            />
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-foreground/10 px-4 py-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-md border border-foreground/12 bg-field/60 px-2.5 py-1.5 text-foreground/85">
                  {desdeMostrado ? fechaCorta(desdeMostrado) : "—"}
                </span>
                <span className="text-foreground/40">–</span>
                <span className="rounded-md border border-foreground/12 bg-field/60 px-2.5 py-1.5 text-foreground/85">
                  {hastaMostrado ? fechaCorta(hastaMostrado) : "—"}
                </span>
              </div>
              <p className="basis-full text-[0.65rem] text-foreground/40 md:basis-auto md:flex-1">
                Las fechas se cuentan por día calendario, hasta hoy.
              </p>
              <div className="ml-auto flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAbierto(false)}
                  className="border-foreground/15 bg-transparent"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!puedeAplicar}
                  onClick={aplicar}
                  className="font-bold"
                >
                  Actualizar
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
