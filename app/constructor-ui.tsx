"use client";

import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Surface } from "./ui";

/** Piezas de formulario compartidas por el Constructor y por los formularios propios de cada plataforma. */

export function Seccion({
  id,
  titulo,
  soloPlataforma,
  informativo,
  completa,
  children,
}: {
  id?: string;
  titulo: string;
  /** Chip "Solo X" cuando la sección no aplica a todas las plataformas elegidas. */
  soloPlataforma?: string;
  informativo?: boolean;
  /** Sin definir: la sección no lleva check (ni completa ni incompleta). */
  completa?: boolean;
  children: React.ReactNode;
}) {
  const [abierta, setAbierta] = useState(true);
  return (
    <Surface id={id} className="scroll-mt-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        className="flex w-full items-center gap-2.5 px-5 py-4 text-left"
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border",
            completa === true
              ? "border-[#3BFF00]/40 bg-[#3BFF00]/15 text-brand"
              : "border-foreground/15 text-transparent",
          )}
        >
          <Check className="size-3" />
        </span>
        <h3 className="flex-1 text-sm font-bold text-foreground">{titulo}</h3>
        {soloPlataforma && (
          <span className="font-micro rounded-full border border-foreground/12 px-2 py-0.5 text-[0.55rem] text-foreground/45">
            SOLO {soloPlataforma.toUpperCase()}
          </span>
        )}
        {informativo && (
          <span className="font-micro rounded-full border border-brand/25 bg-brand/10 px-2 py-0.5 text-[0.55rem] text-brand">
            INFORMATIVO
          </span>
        )}
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-foreground/30 transition-transform",
            abierta && "rotate-90",
          )}
        />
      </button>
      {abierta && (
        <div className="border-t border-foreground/8 px-5 py-4">{children}</div>
      )}
    </Surface>
  );
}

export function Campo({
  etiqueta,
  className,
  children,
}: {
  etiqueta: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="font-micro mb-1.5 block text-[0.6rem] text-foreground/50">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}
