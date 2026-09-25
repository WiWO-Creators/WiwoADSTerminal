/** "hace 5 min", "hace 3 h", "hace 2 días" — para decir de cuándo es un dato. */
export function haceTiempo(desde: number): string {
  const minutos = Math.max(0, Math.round((Date.now() - desde) / 60_000));
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}
