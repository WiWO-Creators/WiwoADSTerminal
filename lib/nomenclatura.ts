import { OBJETIVOS, type Objetivo } from "@/lib/objetivos";
import { PLATFORM, type Platform } from "@/lib/plataformas";

/**
 * Compone el nombre final de una campaña: `[OBJETIVO] [PLATAFORMA] Nombre`.
 *
 * La persona escribe solo la parte descriptiva —"Campaña Halloween 2026"— y
 * el constructor antepone las dos siglas al crear. Esto resuelve dos pedidos
 * a la vez:
 *
 *  - **Identificar qué es nuestro.** Cuando un cliente tiene más de una
 *    agencia manejando sus cuentas, una campaña con `[TRF] [MT]` al frente se
 *    reconoce como creada por WiWO.ADS sin tener que abrir nada; una campaña
 *    de otra agencia simplemente no sigue esta convención.
 *  - **Saber la plataforma sin filtrar.** La sigla de plataforma queda en el
 *    nombre mismo, visible en cualquier lista o exportación, no solo en una
 *    columna de este sistema.
 *
 * La sigla de objetivo (AE/VTA/LDS/TRF/OCV) ya es la convención oficial de la
 * agencia — viene del diccionario de nomenclatura, documento aparte — y no
 * cambia acá. Lo nuevo es la segunda sigla, de plataforma.
 *
 * Importante: esto es ORNAMENTO sobre el nombre, no una decisión de dónde se
 * publica. `buildPlan` ya crea cada paso en la cuenta de su propia
 * plataforma; esta función solo se llama con la plataforma real de ese paso,
 * así que una campaña de Meta jamás puede llevar la sigla de Google — sería
 * un error de programación, no una posibilidad del flujo normal.
 */
export function nombreCompuesto(
  objetivo: Objetivo,
  plataforma: Platform,
  nombreBase: string,
): string {
  const base = nombreBase.trim();
  return `[${objetivo}] [${PLATFORM[plataforma].sigla}] ${base}`;
}

/**
 * Verificación de que ninguna sigla de plataforma choca con una de objetivo.
 *
 * Se corre una sola vez, al cargar el módulo. Si alguien agrega una
 * plataforma nueva y le pone por descuido la sigla "TRF" o "OCV", esto tira el
 * error ahí mismo, en desarrollo, en vez de dejar que dos campañas distintas
 * terminen con el mismo corchete y nadie lo note hasta un reporte mal leído.
 */
function verificarSinColisiones(): void {
  const siglasObjetivo = new Set<string>(OBJETIVOS);
  for (const plataforma of Object.values(PLATFORM)) {
    if (siglasObjetivo.has(plataforma.sigla)) {
      throw new Error(
        `La sigla de plataforma "${plataforma.sigla}" (${plataforma.label}) choca con una sigla de objetivo. Elige otra.`,
      );
    }
  }
}
verificarSinColisiones();
