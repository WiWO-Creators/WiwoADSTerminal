"use client";

import type { CSSProperties } from "react";
import {
  Activity,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { HealthState } from "./data";

const ORB_SIZE_PX = { xs: 12, sm: 16, md: 24, lg: 40, xl: 72 } as const;
/** Tamaño del orbe volumétrico. Su lienzo es de 600px y se escala con `--orb-fit`. */
const STAGE_PX = { md: 84, lg: 112, xl: 208 } as const;
const ORB_CANVAS = 600;

const SPARKS = [
  { sx: "70%", sy: "18%", size: 18, color: "rgba(248, 250, 215, .92)", speed: "5600ms", delay: "-900ms" },
  { sx: "25%", sy: "72%", size: 13, color: "rgba(66, 66, 255, .92)", speed: "6800ms", delay: "-2400ms" },
  { sx: "79%", sy: "68%", size: 22, color: "rgba(59, 255, 0, .9)", speed: "6200ms", delay: "-1800ms" },
  { sx: "34%", sy: "24%", size: 11, color: "rgba(248, 250, 215, .72)", speed: "7400ms", delay: "-3100ms" },
] as const;

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
 * Portado de MetriQ (kit en THINKING_ORB.md).
 *
 * Dos variantes: la *inline* (xs/sm/md) —una bolita para botones y filas— y
 * la *stage* (lg/xl), el orbe volumétrico grande de las pantallas de carga.
 * `bare` la deja sin caja propia, para ponerla sobre una superficie ya lista
 * (ver `PantallaDeCarga`).
 */
export function ThinkingOrb({
  size = "md",
  state = "thinking",
  variant = "auto",
  bare = false,
  pixels,
  className,
  label,
}: {
  size?: keyof typeof ORB_SIZE_PX;
  state?: OrbState;
  variant?: "auto" | "inline" | "stage";
  bare?: boolean;
  /** Tamaño exacto en px del orbe volumétrico, cuando los preajustes no sirven. */
  pixels?: number;
  className?: string;
  /** aria-label accesible; por defecto el del estado. Pasa "" para decorativo. */
  label?: string;
}) {
  const a11yLabel = label ?? ORB_STATE_LABEL[state];
  const useStage =
    variant === "stage" || (variant === "auto" && (size === "lg" || size === "xl"));

  if (useStage) {
    const px = pixels ?? STAGE_PX[size === "lg" || size === "xl" ? size : "md"];
    return (
      <span
        role={a11yLabel ? "status" : undefined}
        aria-label={a11yLabel || undefined}
        aria-hidden={a11yLabel ? undefined : "true"}
        data-thinking-state={state}
        className={cn("wiwo-orb-stage", bare && "wiwo-orb-stage--bare", className)}
        style={{ width: px, height: px, "--orb-fit": px / ORB_CANVAS } as CSSProperties}
      >
        <span className="wiwo-orb-canvas" aria-hidden="true">
          <span className="orb-state-field">
            <span className="orb-state-ring" />
            <span className="orb-state-ring alt" />
            <span className="orb-scan-line" />
            <span className="orb-output-trail one" />
            <span className="orb-output-trail two" />
            <span className="orb-output-trail three" />
            <span className="orb-success-burst" />
            <span className="orb-retry-notch" />
          </span>
          <span className="wiwo-thinking-orb">
            <span className="orb-pulse" />
            <span className="orb-pulse" />
            <span className="orb-pulse" />
            <span className="orb-liquid-veil" />
            <span className="orb-caustic" />
            <span className="orb-light-field" />
            <span className="orb-aurora orb-aurora-one" />
            <span className="orb-aurora orb-aurora-two" />
            <span className="orb-aurora orb-aurora-three" />
            <span className="orb-core" />
            <span className="orb-glint" />
          </span>
          <span className="orb-particle" />
          <span className="orb-particle" />
          <span className="orb-particle" />
          {SPARKS.map((spark) => (
            <span
              key={`${spark.sx}-${spark.sy}`}
              className="orb-spark"
              style={
                {
                  "--sx": spark.sx,
                  "--sy": spark.sy,
                  "--spark-size": `${spark.size}px`,
                  "--spark-color": spark.color,
                  "--spark-speed": spark.speed,
                  "--spark-delay": spark.delay,
                } as CSSProperties
              }
            />
          ))}
        </span>
      </span>
    );
  }

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

/**
 * Carga de pantalla completa: el orbe grande sobre su pozo de sombra difusa
 * (`wiwo-orb-aura`), como en MetriQ. Para cuando una vista entera espera datos.
 */
export function PantallaDeCarga({
  mensaje,
  className,
}: {
  mensaje?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8",
        className,
      )}
    >
      <div className="wiwo-orb-aura" style={{ width: 280, height: 280 }}>
        <ThinkingOrb size="xl" state="thinking" bare label={mensaje ?? "Cargando"} />
      </div>
      {mensaje && (
        <p className="relative z-10 mt-6 text-center text-sm font-semibold text-foreground/70">{mensaje}</p>
      )}
    </div>
  );
}

/**
 * El orbe para dentro de un botón. El botón principal es verde neón y el orbe
 * también lo es: sin fondo propio se perdía y parecía que no pasaba nada. Va
 * sobre una pastilla oscura, así se ve igual en cualquier variante de botón.
 */
export function OrbeDeBoton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-full bg-[#292929] shadow-[0_0_0_1px_rgba(248,250,215,0.16)]",
        className,
      )}
    >
      <ThinkingOrb size="xs" state="generating" label="" />
    </span>
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
        state === "critical" && "bg-danger-deep/10 text-danger",
        state === "warning" && "bg-warn-deep/10 text-warn",
        state === "healthy" && "bg-ok-deep/10 text-ok",
        state === "inactive" && "bg-foreground/[0.07] text-foreground/58",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          state === "critical" && "bg-danger-deep",
          state === "warning" && "bg-warn-deep",
          state === "healthy" && "bg-ok-deep",
          state === "inactive" && "bg-foreground/35",
        )}
      />
      {label ?? labels[state]}
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
        // Tarjeta de MetriQ: relleno sólido más claro que el lienzo (oscuro) o
        // crema (claro), contorno fino y sombra suave.
        "rounded-[16px] border border-border bg-card shadow-[var(--shadow-1)]",
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
    <Surface className="neo-card-accent p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-micro text-[0.62rem] text-foreground/45">
            {label}
          </p>
          <p className="metric-number mt-2.5 text-[1.8rem] font-extrabold leading-none text-foreground">
            {value}
          </p>
          <p className="mt-2.5 text-xs leading-5 text-foreground/50">{note}</p>
        </div>
        <span
          className={cn(
            // Sin borde: dentro de una Surface ya elevada, un círculo con su
            // propio contorno se leía como una caja adentro de otra caja. El
            // color de fondo ya basta para distinguirlo.
            "grid size-9 shrink-0 place-items-center rounded-full",
            tone === "blue" && "bg-brand/12 text-brand",
            tone === "red" && "bg-danger-deep/12 text-danger",
            tone === "cyan" && "bg-[#3BFF00]/12 text-brand",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
    </Surface>
  );
}
