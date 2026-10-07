import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { estadoDeLinkedin, tokenDeLinkedin } from "@/lib/linkedin-conexion";
import { campanasDeLinkedin, cuentasDeLinkedin, gruposDeLinkedin, metricasDiariasDeLinkedin } from "@/lib/linkedin-nativo";
import { ErrorDeLinkedin } from "@/lib/linkedin-nativo-pura";
import { can } from "@/lib/permisos";

/**
 * Las cuentas publicitarias de LinkedIn que ve la persona conectada, y el estado de su conexión. Solo lectura y solo para
 * quien administra conexiones: la lista incluye cuentas de TODOS los clientes a los que esa persona tiene acceso en
 * LinkedIn, no solo las que ya están asociadas a un cliente de WiWO.ADS. Nunca devuelve el token.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const user = session.actor;
  if (!can(user, "administrar_conexiones")) return fail("Tu usuario no tiene permiso para administrar conexiones", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  try {
    const estado = await estadoDeLinkedin(user);
    if (!estado.conectado) return Response.json({ estado, cuentas: [] }, { headers: { "cache-control": "no-store" } });
    const token = await tokenDeLinkedin(user);
    const cuentas = await cuentasDeLinkedin(token);

    // `?cuenta=ID`: un resumen de lo que LinkedIn devuelve de esa cuenta (cuántos grupos, campañas y las métricas de los
    // últimos 30 días), para comprobar las rutas de lectura contra respuestas reales. Solo cuentas que el token ve.
    const id = new URL(request.url).searchParams.get("cuenta");
    if (id) {
      const cuenta = cuentas.find((c) => c.id === id);
      if (!cuenta) return fail("Esa cuenta no está entre las que ve tu conexión de LinkedIn", 404);
      const hasta = new Date();
      const desde = new Date(hasta.getTime() - 30 * 86_400_000);
      const dia = (d: Date) => d.toISOString().slice(0, 10);
      const [grupos, campanas, filas] = await Promise.all([
        gruposDeLinkedin(id, token),
        campanasDeLinkedin(id, token),
        metricasDiariasDeLinkedin({ id, nombre: cuenta.nombre, moneda: cuenta.moneda ?? undefined }, { desde: dia(desde), hasta: dia(hasta) }, token),
      ]);
      const suma = (clave: string) => filas.reduce((total, f) => total + Number(f[clave] ?? 0), 0);
      return Response.json(
        {
          estado,
          cuenta,
          grupos: { total: grupos.length, muestra: grupos.slice(0, 3).map((g) => ({ id: g.id, nombre: g.name, estado: g.status })) },
          campanas: {
            total: campanas.length,
            muestra: campanas.slice(0, 3).map((c) => ({ id: c.id, nombre: c.name, estado: c.status, tipo: c.type, costo: c.costType, entidadAsociada: c.associatedEntity ?? null, objetivo: c.objectiveType ?? null, formato: c.format ?? null })),
          },
          metricas30d: {
            filas: filas.length,
            gasto: suma("spend"),
            impresiones: suma("impressions"),
            clics: suma("clicks"),
            leads: suma("oneclickleads"),
            desde: dia(desde),
            hasta: dia(hasta),
          },
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json({ estado, cuentas }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const estado = error instanceof ErrorDeLinkedin ? error.status : 500;
    const mensaje = error instanceof Error ? error.message : "No se pudieron leer las cuentas de LinkedIn";
    console.error("WiWO.ADS cuentas linkedin", mensaje);
    return fail(mensaje, estado >= 400 && estado < 600 ? estado : 502);
  }
}
