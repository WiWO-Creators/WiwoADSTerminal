import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { TASA_REFERENCIA_USD } from "@/lib/simulador";

/**
 * Tipo de cambio entre dos monedas, para que el simulador no pida escribirlo a mano. Lee una tasa pública
 * (open.er-api.com, sin llave) y la recuerda unas horas en memoria; si la fuente no responde, cae a la tasa de
 * referencia aproximada de `lib/simulador.ts` y lo dice (`fuente: "referencia"`) para que se note.
 */
export const dynamic = "force-dynamic";

type Tasas = { tasas: Record<string, number>; actualizadaEn: string; leidaEn: number };
let memoria: Tasas | null = null;
const VIGENCIA_MS = 6 * 60 * 60 * 1000;

async function tasasPorUsd(): Promise<{ tasas: Record<string, number>; fuente: "en_vivo" | "referencia"; actualizadaEn: string | null }> {
  if (memoria && Date.now() - memoria.leidaEn < VIGENCIA_MS) {
    return { tasas: memoria.tasas, fuente: "en_vivo", actualizadaEn: memoria.actualizadaEn };
  }
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const cuerpo = (await r.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
    if (cuerpo.result !== "success" || !cuerpo.rates) throw new Error("respuesta sin tasas");
    memoria = { tasas: cuerpo.rates, actualizadaEn: cuerpo.time_last_update_utc ?? new Date().toISOString(), leidaEn: Date.now() };
    return { tasas: memoria.tasas, fuente: "en_vivo", actualizadaEn: memoria.actualizadaEn };
  } catch (error) {
    console.error("WiWO.ADS cambio: fuente en vivo no disponible", error instanceof Error ? error.message : "error");
    // Si hubo una lectura anterior, es mejor que la tabla fija aunque esté vencida.
    if (memoria) return { tasas: memoria.tasas, fuente: "en_vivo", actualizadaEn: memoria.actualizadaEn };
    return { tasas: TASA_REFERENCIA_USD, fuente: "referencia", actualizadaEn: null };
  }
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const params = new URL(request.url).searchParams;
  const de = (params.get("de") ?? "").toUpperCase();
  const a = (params.get("a") ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(de) || !/^[A-Z]{3}$/.test(a)) return fail("Faltan las monedas (de, a)", 400);

  const { tasas, fuente, actualizadaEn } = await tasasPorUsd();
  const deUsd = tasas[de];
  const aUsd = tasas[a];
  if (!deUsd || !aUsd) return fail(`No tengo el tipo de cambio de ${de} a ${a}`, 404);
  return Response.json(
    {
      de,
      a,
      // Cuántas unidades de `a` vale 1 unidad de `de`.
      tasa: aUsd / deUsd,
      // Cuántas unidades de `a` vale 1 USD (para los mínimos por plataforma, que van en dólares).
      aPorUsd: aUsd,
      fuente,
      actualizadaEn,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
