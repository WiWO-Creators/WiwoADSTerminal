// Evalúa las reglas automáticas de WiWO.ADS (pausar o avisar al cumplirse una condición).
// Pensado para correr cada 5 minutos en el servidor:
//   */5 * * * * cd /root/wiwo-ads && node --env-file=.env servidor/evaluar-reglas.mjs >> /var/log/wiwo-reglas.log 2>&1
// Variables: CRON_SECRET (la misma que usa la app) y, opcional, APP_URL (por defecto http://localhost:3030).
const secreto = process.env.CRON_SECRET;
if (!secreto) {
  console.error("Falta CRON_SECRET");
  process.exit(1);
}
const url = `${process.env.APP_URL ?? "http://localhost:3030"}/api/reglas/programado`;
const respuesta = await fetch(url, { method: "POST", headers: { "x-cron-secret": secreto } });
const texto = await respuesta.text();
console.log(new Date().toISOString(), respuesta.status, texto.slice(0, 500));
process.exit(respuesta.ok ? 0 : 1);
