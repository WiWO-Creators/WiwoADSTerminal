"use client";

import { useEffect, useState } from "react";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { dimensionesDe, type Dimension, type FilaDeDesglose } from "@/lib/desglose";
import type { NivelEntidad } from "@/lib/plataformas";
import { OrbeDeBoton } from "./ui";

type Resultado = {
  clave: string;
  filas: FilaDeDesglose[];
  periodo: { label: string; enCurso: boolean } | null;
  error: string | null;
};

const entero = (n: number) => Math.round(n).toLocaleString("es-CL");

function dinero(valor: number | null, moneda: string | null): string {
  if (valor === null) return "—";
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: moneda ?? "CLP",
      maximumFractionDigits: valor < 100 ? 2 : 0,
    }).format(valor);
  } catch {
    return entero(valor);
  }
}

/**
 * Desglose de una campaña, conjunto o anuncio por edad, género, red, posición,
 * dispositivo, región, día u hora — lo que en Meta Ads Manager es "Desglose".
 * Es una lectura a demanda: no se guarda nada ni se cambia nada.
 */
export function DesgloseEntidad({
  provider,
  accountId,
  nivel,
  id,
  currency,
  rango,
}: {
  provider: string;
  accountId: string;
  nivel: NivelEntidad;
  id: string;
  currency: string | null;
  rango: string | undefined;
}) {
  const dimensiones = dimensionesDe(provider);
  const [por, setPor] = useState<Dimension | "">(dimensiones[0]?.id ?? "");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // El resultado va ligado a lo que se pidió: cambiar de segmento o de entidad
  // muestra "cargando" sin tener que reiniciar el estado a mano en el efecto.
  const clave = `${provider}:${accountId}:${nivel}:${id}:${por}:${rango ?? ""}`;

  useEffect(() => {
    if (!por) return;
    const control = new AbortController();
    const params = new URLSearchParams({ provider, accountId, nivel, id, por });
    if (rango) params.set("rango", rango);
    fetch(`/api/entidades/desglose?${params}`, { signal: control.signal })
      .then(async (respuesta) => {
        const cuerpo = await respuesta.json().catch(() => null);
        if (!respuesta.ok) throw new Error(cuerpo?.error ?? "No se pudo leer el desglose");
        setResultado({ clave, filas: cuerpo.filas as FilaDeDesglose[], periodo: cuerpo.periodo, error: null });
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setResultado({
          clave,
          filas: [],
          periodo: null,
          error: e instanceof Error ? e.message : "No se pudo leer el desglose",
        });
      });
    return () => control.abort();
  }, [provider, accountId, nivel, id, por, rango, clave]);

  if (dimensiones.length === 0) {
    return <p className="text-sm text-foreground/55">Esta plataforma todavía no ofrece desgloses.</p>;
  }

  const actual = resultado && resultado.clave === clave ? resultado : null;
  const conResultados = actual?.filas.some((f) => f.resultados !== null) ?? false;
  const conAlcance = actual?.filas.some((f) => f.alcance !== null) ?? false;

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-foreground/60">Desglosar por</span>
        <NativeSelect value={por} onChange={(e) => setPor(e.target.value as Dimension)}>
          {dimensiones.map((d) => (
            <NativeSelectOption key={d.id} value={d.id}>
              {d.etiqueta}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>

      {!actual && (
        <div className="flex items-center gap-2 text-sm text-foreground/50">
          <OrbeDeBoton /> Leyendo el desglose…
        </div>
      )}
      {actual?.error && (
        <p className="rounded-xl border border-danger/25 bg-danger/8 p-3 text-sm text-danger">{actual.error}</p>
      )}
      {actual && !actual.error && actual.filas.length === 0 && (
        <p className="text-sm text-foreground/55">Sin datos para este desglose en el periodo.</p>
      )}

      {actual && actual.filas.length > 0 && (
        <>
          <p className="text-[0.7rem] text-foreground/45">
            {actual.periodo?.label}
            {actual.periodo?.enCurso ? " · periodo en curso: las cifras siguen subiendo" : ""}
          </p>
          <div className="overflow-x-auto rounded-xl border border-foreground/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-foreground/4 text-foreground/50">
                <tr>
                  <th className="px-2.5 py-2 font-semibold">Segmento</th>
                  <th className="px-2.5 py-2 text-right font-semibold">Gasto</th>
                  <th className="px-2.5 py-2 text-right font-semibold">Impr.</th>
                  {conAlcance && <th className="px-2.5 py-2 text-right font-semibold">Alcance</th>}
                  <th className="px-2.5 py-2 text-right font-semibold">Clics</th>
                  <th className="px-2.5 py-2 text-right font-semibold">CTR</th>
                  <th className="px-2.5 py-2 text-right font-semibold">CPC</th>
                  {conResultados && <th className="px-2.5 py-2 text-right font-semibold">Result.</th>}
                  {conResultados && <th className="px-2.5 py-2 text-right font-semibold">Costo/res.</th>}
                </tr>
              </thead>
              <tbody>
                {actual.filas.map((f) => (
                  <tr key={f.clave} className="border-t border-foreground/8">
                    <td className="px-2.5 py-2 font-medium text-foreground">{f.etiqueta}</td>
                    <td className="px-2.5 py-2 text-right">
                      <span className="block font-medium text-foreground">{dinero(f.gasto, currency)}</span>
                      {/* Peso del segmento en el gasto: se ve de un vistazo dónde se va la plata. */}
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-foreground/8">
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${Math.max(2, Math.round(f.pesoDelGasto * 100))}%` }}
                        />
                      </span>
                      <span className="text-[0.62rem] text-foreground/40">{Math.round(f.pesoDelGasto * 100)}%</span>
                    </td>
                    <td className="px-2.5 py-2 text-right text-foreground/70">{entero(f.impresiones)}</td>
                    {conAlcance && (
                      <td className="px-2.5 py-2 text-right text-foreground/70">
                        {f.alcance === null ? "—" : entero(f.alcance)}
                      </td>
                    )}
                    <td className="px-2.5 py-2 text-right text-foreground/70">{entero(f.clics)}</td>
                    <td className="px-2.5 py-2 text-right text-foreground/70">
                      {f.ctr === null ? "—" : `${(f.ctr * 100).toFixed(2)}%`}
                    </td>
                    <td className="px-2.5 py-2 text-right text-foreground/70">{dinero(f.cpc, currency)}</td>
                    {conResultados && (
                      <td className="px-2.5 py-2 text-right text-foreground/70">
                        {f.resultados === null ? "—" : entero(f.resultados)}
                      </td>
                    )}
                    {conResultados && (
                      <td className="px-2.5 py-2 text-right text-foreground/70">
                        {dinero(f.costoPorResultado, currency)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {provider === "meta" && (
            <p className="text-[0.62rem] leading-4 text-foreground/40">
              En Meta, los desgloses no admiten el total de compras «omni» de la tabla principal: aquí se usan las
              compras directas, así que pueden diferir un poco. Sirven para comparar segmentos entre sí.
            </p>
          )}
        </>
      )}
    </div>
  );
}
