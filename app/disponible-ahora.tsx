"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, PauseCircle, PiggyBank } from "lucide-react";

import { dineroDe, gastoPorMoneda, situacionDeInversion, type NivelDeInversion } from "@/lib/inversion-pura";
import { cn } from "@/lib/utils";
import { usePresupuesto } from "./presupuesto-mes";
import { Surface, ThinkingOrb } from "./ui";

const ESTILO: Record<NivelDeInversion, { caja: string; icono: string }> = {
  ok: { caja: "border-ok/30 bg-ok/8", icono: "text-ok" },
  atencion: { caja: "border-warn/35 bg-warn/8", icono: "text-warn" },
  agregar: { caja: "border-danger/35 bg-danger/8", icono: "text-danger" },
  sin_datos: { caja: "border-foreground/15 bg-foreground/[0.04]", icono: "text-foreground/45" },
};

/**
 * Lo primero que se ve en Inversión: cuánto se gastó en el periodo elegido, cuánto presupuesto hay y cuánto queda disponible AHORA,
 * con una recomendación (seguir, ajustar o añadir presupuesto) y qué pasaría si se pausa todo. Así, antes de decidir pausar o crear
 * una campaña nueva con lo que queda, la cifra ya está a la vista.
 */
export function DisponibleAhora({
  portfolioId,
  campanas,
  periodo,
}: {
  portfolioId: string;
  /** Las campañas del cliente en el periodo elegido (con su gasto). */
  campanas: Array<{ spendMicros: number; currency: string | null }>;
  periodo: string;
}) {
  const datos = usePresupuesto(portfolioId);
  const [elegida, setElegida] = useState<string | null>(null);

  if (datos === undefined) {
    return (
      <Surface className="flex items-center gap-3 p-4">
        <ThinkingOrb size="xs" state="generating" label="" />
        <p className="text-xs leading-5 text-foreground/60">Calculando cuánto presupuesto hay disponible…</p>
      </Surface>
    );
  }
  if (datos === null) return null;

  const gastoDelPeriodo = gastoPorMoneda(campanas);
  const monedas = [
    ...new Set([
      ...(datos.moneda ? [datos.moneda] : []),
      ...(datos.campanas?.totales ?? []).map((t) => t.moneda),
      ...Object.keys(gastoDelPeriodo),
    ]),
  ].filter((m) => m !== "—");
  if (monedas.length === 0) return null;
  const moneda = elegida && monedas.includes(elegida) ? elegida : monedas[0];

  const ficha = datos.presupuesto && datos.moneda === moneda ? datos.presupuesto : null;
  const totalCampanas = datos.campanas?.totales.find((t) => t.moneda === moneda) ?? null;
  const gastado = gastoDelPeriodo[moneda] ?? 0;
  const s = situacionDeInversion({ moneda, gastadoPeriodoMicros: gastado, ficha, campanas: totalCampanas, hoy: new Date() });
  const estilo = ESTILO[s.nivel];
  const acordado = ficha ? ficha.presupuestoMicros : totalCampanas ? totalCampanas.presupuestoMicros : null;
  const Icono = s.nivel === "ok" ? CheckCircle2 : s.nivel === "sin_datos" ? PiggyBank : AlertTriangle;

  return (
    <Surface className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PiggyBank className="size-4 text-brand" />
          <h3 className="text-sm font-bold text-foreground">Presupuesto disponible ahora</h3>
        </div>
        {monedas.length > 1 && (
          <span className="flex overflow-hidden rounded-full border border-foreground/15 text-[0.68rem] font-bold" role="group" aria-label="Moneda">
            {monedas.map((m) => (
              <button key={m} type="button" onClick={() => setElegida(m)} aria-pressed={m === moneda} className={cn("px-2.5 py-1", m === moneda ? "bg-brand text-white" : "text-foreground/60 hover:text-foreground")}>
                {m}
              </button>
            ))}
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Cifra etiqueta={`Gastado · ${periodo}`} valor={dineroDe(gastado, moneda)} nota="Lo que ya se pagó en el periodo que elegiste arriba" />
        <Cifra
          etiqueta={ficha ? "Presupuesto mensual acordado" : "Asignado a las campañas"}
          valor={acordado === null ? "—" : dineroDe(acordado, moneda)}
          nota={ficha ? "El de la ficha del cliente, este mes" : totalCampanas ? `${totalCampanas.entidades} ${totalCampanas.entidades === 1 ? "campaña" : "campañas"} con presupuesto cargado` : "Sin presupuesto cargado"}
        />
        <Cifra
          etiqueta="Disponible ahora"
          valor={s.disponibleMicros === null ? "—" : dineroDe(s.disponibleMicros, moneda)}
          nota={s.porDiaMicros === null ? "Sin presupuesto para calcularlo" : `${dineroDe(s.porDiaMicros, moneda)} por día · ${s.diasRestantes} ${s.diasRestantes === 1 ? "día" : "días"} hasta fin de mes`}
          destacada
        />
      </div>

      <div className={cn("mt-3 flex gap-3 rounded-xl border p-3", estilo.caja)}>
        <Icono className={cn("mt-0.5 size-4 shrink-0", estilo.icono)} />
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-bold text-foreground">{s.titulo}</p>
          <p className="text-xs leading-5 text-foreground/75">{s.recomendacion}</p>
          {s.siSePausaTodo && (
            <p className="flex items-start gap-1.5 text-xs leading-5 text-foreground/70">
              <PauseCircle className="mt-0.5 size-3.5 shrink-0 text-foreground/45" />
              {s.siSePausaTodo}
            </p>
          )}
        </div>
      </div>
      <p className="mt-2 text-[0.65rem] leading-4 text-muted-foreground">
        El gasto sigue el periodo elegido; lo disponible es siempre del mes en curso y se actualiza con cada lectura de las plataformas.
      </p>
    </Surface>
  );
}

function Cifra({ etiqueta, valor, nota, destacada }: { etiqueta: string; valor: string; nota: string; destacada?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", destacada ? "border-brand/30 bg-brand/5" : "border-foreground/10 bg-foreground/[0.03]")}>
      <p className="text-[0.68rem] font-semibold text-muted-foreground">{etiqueta}</p>
      <p className="metric-number mt-1 text-xl font-extrabold text-foreground">{valor}</p>
      <p className="mt-0.5 text-[0.65rem] leading-4 text-muted-foreground">{nota}</p>
    </div>
  );
}
