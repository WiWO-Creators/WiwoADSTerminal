"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  History,
  Rocket,
  Search,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { platformLabel } from "@/lib/plataformas";
import { cn } from "@/lib/utils";
import { PantallaDeCarga, Surface, StatCard } from "./ui";

type PasoEjecucion = {
  platform: string;
  action: string;
  label: string;
  params: Record<string, unknown>;
  ok: boolean;
  error: string | null;
  raw: unknown;
};

type Ejecucion = {
  id: string;
  portfolioId: string;
  portfolioName: string;
  actorEmail: string;
  campaignName: string;
  platforms: string[];
  ok: boolean;
  createdAt: number;
  steps: PasoEjecucion[];
};

async function fetchEjecuciones(): Promise<Ejecucion[]> {
  const response = await fetch("/api/ejecuciones", { cache: "no-store" });
  const body = (await response.json()) as {
    ejecuciones?: Ejecucion[];
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "No se pudo cargar");
  return body.ejecuciones ?? [];
}

/**
 * Todo lo que WiWO.ADS de verdad creó en Google o Meta.
 *
 * Es la contraparte de lectura de `/api/constructor/ejecutar`: esa ruta
 * escribe una fila por cada intento de publicar, y hasta ahora nadie del
 * equipo podía verlas sin entrar directo a la base. Esto no decide nada
 * nuevo — solo muestra lo que ya quedó registrado.
 */
export function EjecucionesView() {
  const [ejecuciones, setEjecuciones] = useState<Ejecucion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchEjecuciones();
        if (!cancelled) setEjecuciones(data);
      } catch (issue) {
        if (!cancelled) {
          setError(issue instanceof Error ? issue.message : "No se pudo cargar");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtradas = ejecuciones.filter((item) =>
    (item.campaignName + " " + item.portfolioName + " " + item.actorEmail)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const exitosas = ejecuciones.filter((item) => item.ok).length;
  const conError = ejecuciones.length - exitosas;

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
      <div className="mb-5">
        <h2 className="neo-section-title">
          Lo que se creó de verdad
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/58">
          Cada fila es una ejecución real del Creador de campañas contra
          Google o Meta. Todo nace pausado en la plataforma; esto solo registra
          qué se mandó, quién lo mandó y qué respondió cada paso.
        </p>
      </div>

      {loading ? (
        <PantallaDeCarga mensaje="Cargando bitácora…" />
      ) : error ? (
        <Surface className="border-danger-deep/25 bg-danger-deep/[0.06] p-5 text-sm text-danger">
          {error}
        </Surface>
      ) : ejecuciones.length === 0 ? (
        <Surface className="flex min-h-56 flex-col items-center justify-center gap-2 px-6 text-center">
          <Rocket className="size-6 text-foreground/35" />
          <h3 className="text-lg font-bold text-foreground">
            Todavía no se publicó nada
          </h3>
          <p className="max-w-sm text-sm leading-6 text-foreground/58">
            Cuando alguien publique una campaña desde el Creador de campañas,
            aparecerá acá con cada paso que se ejecutó.
          </p>
        </Surface>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Ejecuciones registradas"
              value={String(ejecuciones.length)}
              note="Intentos reales de publicar, con éxito o no"
              icon={History}
            />
            <StatCard
              label="Creadas sin error"
              value={String(exitosas)}
              note="Todos sus pasos respondieron bien"
              icon={Check}
              tone="cyan"
            />
            <StatCard
              label="Con algún error"
              value={String(conError)}
              note="Se detuvieron en el primer paso fallido"
              icon={AlertCircle}
              tone="red"
            />
          </div>

          <Surface className="mb-4 flex items-center gap-2 p-3">
            <Search className="ml-1 size-4 shrink-0 text-brand" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por campaña, cliente o persona"
              className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
          </Surface>

          <div className="space-y-2">
            {filtradas.map((item) => (
              <FilaEjecucion
                key={item.id}
                item={item}
                abierta={abierta === item.id}
                onToggle={() =>
                  setAbierta((current) => (current === item.id ? null : item.id))
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FilaEjecucion({
  item,
  abierta,
  onToggle,
}: {
  item: Ejecucion;
  abierta: boolean;
  onToggle: () => void;
}) {
  const pasosOk = item.steps.filter((step) => step.ok).length;

  return (
    <Surface className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {item.ok ? (
          <Check className="size-4 shrink-0 text-brand" />
        ) : (
          <AlertCircle className="size-4 shrink-0 text-danger" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-foreground">
              {item.campaignName}
            </span>
            {item.platforms.map((platform) => (
              <span
                key={platform}
                className="font-micro rounded-full border border-foreground/12 px-2 py-0.5 text-[0.55rem] text-foreground/50"
              >
                {platformLabel(platform).toUpperCase()}
              </span>
            ))}
          </div>
          <p className="mt-1 text-xs text-foreground/50">
            {item.portfolioName} · {item.actorEmail} ·{" "}
            {formatFecha(item.createdAt)} · {pasosOk}/{item.steps.length} pasos
            correctos
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-foreground/40 transition-transform",
            abierta && "rotate-180",
          )}
        />
      </button>

      {abierta && (
        <ol className="divide-y divide-foreground/8 border-t border-foreground/10">
          {item.steps.map((step, index) => (
            <li key={index} className="px-4 py-3">
              <div className="flex items-center gap-2">
                {step.ok ? (
                  <Check className="size-3.5 shrink-0 text-brand" />
                ) : (
                  <AlertCircle className="size-3.5 shrink-0 text-danger" />
                )}
                <span className="font-micro rounded-full border border-foreground/12 px-2 py-0.5 text-[0.55rem] text-foreground/50">
                  {platformLabel(step.platform).toUpperCase()}
                </span>
                <span className="text-sm font-bold text-foreground">
                  {step.label}
                </span>
              </div>
              {step.error && (
                <p className="mt-1.5 text-xs leading-5 text-danger">
                  {step.error}
                </p>
              )}
              <pre className="metric-number mt-2 overflow-x-auto rounded-lg bg-field/70 p-2.5 text-[0.68rem] leading-5 text-foreground/62">
                {JSON.stringify(step.params, null, 2)}
              </pre>
            </li>
          ))}
        </ol>
      )}
    </Surface>
  );
}

function formatFecha(timestamp: number): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
