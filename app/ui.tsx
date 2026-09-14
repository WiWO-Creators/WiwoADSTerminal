"use client";

import {
  Activity,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HealthState, Severity } from "./data";

const ORB_SIZE_PX = { xs: 12, sm: 16, md: 24 } as const;

export type OrbState =
  | "idle"
  | "listening"
  | "thinking"
  | "generating"
  | "routing"
  | "success"
  | "error"
  | "retry";

const ORB_STATE_LABEL: Record<OrbState, string> = {
  idle: "En espera",
  listening: "Escuchando",
  thinking: "Pensando",
  generating: "Generando",
  routing: "Coordinando",
  success: "Listo",
  error: "Error",
  retry: "Reintentando",
};

/**
 * La señal propia de WiWO para "algo inteligente está pasando" — no un
 * spinner genérico, una presencia que respira, razona y vuelve a la calma.
 * Portado desde WiwoMetriQ (ver el bloque `.wiwo-orb` en globals.css).
 *
 * Solo la variante inline (xs/sm/md), para botones e indicadores junto a
 * texto — el orbe volumétrico grande de MetriQ no se portó todavía.
 */
export function ThinkingOrb({
  size = "md",
  state = "thinking",
  className,
  label,
}: {
  size?: keyof typeof ORB_SIZE_PX;
  state?: OrbState;
  className?: string;
  /** aria-label accesible; por defecto el del estado. Pasa "" para decorativo. */
  label?: string;
}) {
  const a11yLabel = label ?? ORB_STATE_LABEL[state];
  const px = ORB_SIZE_PX[size];
  // thinking es el estilo base (.wiwo-orb sin modificador).
  const stateClass = state === "thinking" ? "" : `wiwo-orb--${state}`;
  return (
    <span
      role={a11yLabel ? "status" : undefined}
      aria-label={a11yLabel || undefined}
      aria-hidden={a11yLabel ? undefined : "true"}
      className={cn("wiwo-orb", stateClass, className)}
      style={{ width: px, height: px }}
    />
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const labels = {
    critical: "Crítica",
    high: "Alta",
    medium: "Media",
    info: "Informativa",
  };

  return (
    <Badge
      className={cn(
        "gap-1 border px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-[0.07em] [&>svg]:size-3",
        severity === "critical" && "border-red-500/20 bg-red-500/10 text-red-400",
        severity === "high" && "border-amber-500/20 bg-amber-500/10 text-amber-400",
        severity === "medium" && "border-[#4242FF]/20 bg-[#4242FF]/10 text-[#4242FF]",
        severity === "info" && "border-[#F8FAD7]/12 bg-[#F8FAD7]/[0.04] text-[#F8FAD7]/60",
      )}
    >
      {severity === "critical" && <AlertTriangle />}
      {labels[severity]}
    </Badge>
  );
}

export function HealthBadge({
  state,
  label,
}: {
  state: HealthState;
  label?: string;
}) {
  const labels = {
    critical: "Crítico",
    warning: "Revisar",
    healthy: "Saludable",
    inactive: "Sin conexión",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold",
        state === "critical" && "bg-red-500/10 text-red-300",
        state === "warning" && "bg-amber-500/10 text-amber-300",
        state === "healthy" && "bg-emerald-500/10 text-emerald-300",
        state === "inactive" && "bg-[#F8FAD7]/[0.07] text-[#F8FAD7]/58",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          state === "critical" && "bg-red-500",
          state === "warning" && "bg-amber-500",
          state === "healthy" && "bg-emerald-500",
          state === "inactive" && "bg-[#F8FAD7]/35",
        )}
      />
      {label ?? labels[state]}
    </span>
  );
}

export function AutonomyBadge({ level }: { level: string }) {
  return (
    <span className="inline-flex min-w-8 items-center justify-center rounded-full border border-[#4242FF]/20 bg-[#4242FF]/8 px-2.5 py-1 text-xs font-bold text-[#4242FF]">
      {level}
    </span>
  );
}

export function Surface({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        // Elevación en dos capas —una ambiental, ancha y difusa; una de
        // contacto, corta y apenas visible— en vez de un solo borde blanco
        // casi opaco. Eso último se leía como un reflejo de plástico en cada
        // tarjeta de la app; esto se lee como una superficie apenas
        // levantada, que es lo que Neo pide con "Beige como mundo": el fondo
        // manda, la tarjeta no compite contra él.
        "rounded-[16px] border border-[#F8FAD7]/[0.09] bg-[#323330]/55 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_1px_2px_rgba(0,0,0,0.16),0_12px_32px_-8px_rgba(0,0,0,0.28)] backdrop-blur-md",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  note,
  icon: Icon = Activity,
  tone = "blue",
}: {
  label: string;
  value: string;
  note: string;
  icon?: LucideIcon;
  tone?: "blue" | "red" | "cyan";
}) {
  return (
    <Surface className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-micro text-[0.62rem] text-[#F8FAD7]/45">
            {label}
          </p>
          <p className="metric-number mt-2.5 text-[1.8rem] font-extrabold leading-none text-[#F8FAD7]">
            {value}
          </p>
          <p className="mt-2.5 text-xs leading-5 text-[#F8FAD7]/50">{note}</p>
        </div>
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full border",
            tone === "blue" && "border-[#4242FF]/20 bg-[#4242FF]/10 text-[#4242FF]",
            tone === "red" && "border-red-500/20 bg-red-500/10 text-red-400",
            tone === "cyan" && "border-[#3BFF00]/20 bg-[#3BFF00]/10 text-[#3BFF00]",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
    </Surface>
  );
}
