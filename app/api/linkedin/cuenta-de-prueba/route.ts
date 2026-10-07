import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { registrarEventoDeIntegracion } from "@/lib/integration-store";
import { estadoDeLinkedin, tokenDeLinkedin } from "@/lib/linkedin-conexion";
import { crearEnLinkedin, leerDeLinkedin } from "@/lib/linkedin-nativo";
import { cuerpoDeCuentaDePrueba, ErrorDeLinkedin } from "@/lib/linkedin-nativo-pura";
import { mismoOrigen } from "@/lib/origen-publico";
import { can } from "@/lib/permisos";

/**
 * Crea la cuenta publicitaria de PRUEBA de LinkedIn (`test: true`): no sirve anuncios, no cobra y no tiene métricas. Solo
 * hay una por app y no se puede borrar ni convertir en real, por eso va en dos pasos como el resto del sistema:
 *
 *  1. `{ "confirmar": false }` (por defecto): NO llama a LinkedIn. Devuelve el cuerpo exacto que se enviaría.
 *  2. `{ "confirmar": true }`: lo envía con el token de quien pide, y después lee la cuenta de vuelta para comprobar que
 *     existe y que quedó marcada como de prueba (el «ok» de una plataforma no basta).
 *
 * Solo quien administra conexiones. Nunca devuelve un token.
 */
export const dynamic = "force-dynamic";

type Cuerpo = { confirmar?: boolean; nombre?: string; moneda?: string; organizacionId?: string };

export async function POST(request: Request) {
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const user = session.actor;
  if (!can(user, "administrar_conexiones")) return fail("Tu usuario no tiene permiso para administrar conexiones", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);

  const datos = (await request.json().catch(() => ({}))) as Cuerpo;
  try {
    const cuerpo = cuerpoDeCuentaDePrueba({ nombre: datos.nombre, moneda: datos.moneda, organizacionId: datos.organizacionId });
    const plan = { metodo: "POST", ruta: "/rest/adAccounts", cuerpo };
    if (datos.confirmar !== true) {
      const estado = await estadoDeLinkedin(user);
      return Response.json({ simulado: true, plan, conectado: estado.conectado, alcances: estado.alcances }, { headers: { "cache-control": "no-store" } });
    }

    const token = await tokenDeLinkedin(user);
    const creada = await crearEnLinkedin(plan.ruta, cuerpo, token);
    if (!creada.id) {
      // LinkedIn dijo que sí pero no entregó el id: se avisa en vez de dar por buena una creación que no se puede comprobar.
      await registrarEventoDeIntegracion(user, "linkedin_test_account", "Creó cuenta de prueba de LinkedIn", "Sin id devuelto: verificar en Campaign Manager");
      return fail("LinkedIn aceptó la creación pero no devolvió el id de la cuenta: revísala en Campaign Manager antes de reintentar.", 502);
    }

    const leida = (await leerDeLinkedin(`/rest/adAccounts/${creada.id}`, token)) as { test?: boolean; type?: string; status?: string } | null;
    const verificada = leida?.test === true;
    await registrarEventoDeIntegracion(
      user,
      "linkedin_test_account",
      "Creó cuenta de prueba de LinkedIn",
      verificada ? `Cuenta ${creada.id} verificada como de prueba` : `Cuenta ${creada.id} creada, NO verificada como de prueba`,
    );
    return Response.json(
      { creada: true, id: creada.id, verificadaComoPrueba: verificada, tipo: leida?.type ?? null, estado: leida?.status ?? null },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const estado = error instanceof ErrorDeLinkedin ? error.status : 500;
    const mensaje = error instanceof Error ? error.message : "No se pudo crear la cuenta de prueba";
    console.error("WiWO.ADS cuenta de prueba linkedin", mensaje);
    return fail(mensaje, estado >= 400 && estado < 600 ? estado : 502);
  }
}
