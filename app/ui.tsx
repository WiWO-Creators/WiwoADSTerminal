"use client";

import {
  Activity,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HealthState, Severity } from "./data";

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
        "rounded-md border px-2 py-1 text-[0.72rem] font-bold uppercase tracking-[0.08em]",
        severity === "critical" && "border-red-500/25 bg-red-500/10 text-red-300",
        severity === "high" && "border-amber-500/25 bg-amber-500/10 text-amber-300",
        severity === "medium" && "border-[#4242FF]/25 bg-[#4242FF]/10 text-[#4242FF]",
        severity === "info" && "border-[#F8FAD7]/10 bg-[#F8FAD7]/[0.03] text-[#F8FAD7]/66",
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
        "rounded-[16px] border border-[#F8FAD7]/[0.14] bg-[#323330]/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_16px_48px_rgba(245,243,255,0.035)] backdrop-blur-md",
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
    <Surface className="relative overflow-hidden p-4">
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          tone === "blue" && "bg-[#4242FF]",
          tone === "red" && "bg-red-500",
          tone === "cyan" &&
            "bg-gradient-to-b from-[#3BFF00] via-[#3BFF00] to-[#4242FF]",
        )}
      />
      <div className="flex items-start justify-between gap-4 pl-2">
        <div>
          <p className="text-sm font-medium text-[#F8FAD7]/60">{label}</p>
          <p className="metric-number mt-2 text-2xl font-extrabold text-[#F8FAD7]">
            {value}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#F8FAD7]/55">{note}</p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#F8FAD7]/10 bg-[#323330]/65 text-[#4242FF] shadow-sm">
          <Icon className="size-4" />
        </span>
      </div>
    </Surface>
  );
}
