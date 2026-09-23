/**
 * Si un estado nativo de plataforma (`ENABLED`, `ACTIVE`, `PAUSED`...) cuenta
 * como "activa" — compartida entre `lib/reglas.ts` y `lib/alertas.ts`, que
 * antes tenían cada una su propia copia idéntica sin ningún comentario que
 * justificara duplicarla (a diferencia de los umbrales de esos mismos
 * archivos, que sí documentan por qué se repiten a propósito).
 */
export function activa(status: string | null): boolean {
  const valor = (status ?? "").toUpperCase();
  return valor === "ENABLED" || valor === "ACTIVE";
}
