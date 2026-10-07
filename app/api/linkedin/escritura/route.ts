import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { registrarEventoDeIntegracion } from "@/lib/integration-store";
import { estadoDeLinkedin, tokenDeLinkedin } from "@/lib/linkedin-conexion";
import {
  diferenciasConLoEsperado,
  planDeActualizacion,
  planDeCampana,
  planDeGrupo,
  rutaDeEntidad,
  type DatosDeCampana,
  type Cambios,
  type Nivel,
  type PlanDeEscritura,
} from "@/lib/linkedin-escritura-pura";
import { cuentasDeLinkedin, enviarPlanALinkedin, leerDeLinkedin } from "@/lib/linkedin-nativo";
import { ErrorDeLinkedin } from "@/lib/linkedin-nativo-pura";
import { env } from "cloudflare:workers";
import { mismoOrigen } from "@/lib/origen-publico";
import { can } from "@/lib/permisos";

/**
 * Escritura en LinkedIn Ads: renombrar, pausar/activar, cambiar presupuesto diario y crear grupos de campañas y campañas.
 *
 * Mismos guardarraíles que el Constructor: dos pasos (simular y confirmar), solo quien tiene `aprobar_cambios`, el plan se
 * arma SIEMPRE en el servidor, se lee la entidad de vuelta para comprobar el cambio y todo queda en la bitácora.
 *
 * POR DEFECTO SOLO ESCRIBE EN CUENTAS DE PRUEBA (`test: true`). Escribir en cuentas de clientes es una decisión explícita
 * de configuración (`LINKEDIN_ESCRITURA_CLIENTES=true`), no un descuido ni un cambio de código; LinkedIn además limita el
 * nivel de desarrollo a 5 cuentas agregadas en el portal.
 *
 * Cuerpo: `{ accion, cuentaId, confirmar?, ... }` con `accion` = `actualizar` | `crear-grupo` | `crear-campana`.
 */
export const dynamic = "force-dynamic";

type Cuerpo = {
  accion?: string;
  confirmar?: boolean;
  cuentaId?: string;
  nivel?: Nivel;
  id?: string;
  cambios?: Cambios;
} & Partial<DatosDeCampana> & {
    grupo?: { nombre?: string; inicio?: string; fin?: string; presupuestoTotal?: { monto: string | number; moneda: string } };
  };

function armarPlan(d: Cuerpo): PlanDeEscritura {
  const cuentaId = String(d.cuentaId ?? "");
  switch (d.accion) {
    case "actualizar":
      if (d.nivel !== "grupo" && d.nivel !== "campana" && d.nivel !== "cuenta") throw new ErrorDeLinkedin("Falta el nivel: «grupo», «campana» o «cuenta».", 400);
      return planDeActualizacion({ nivel: d.nivel, cuentaId, id: String(d.id ?? (d.nivel === "cuenta" ? cuentaId : "")), cambios: d.cambios ?? {} });
    case "crear-grupo":
      return planDeGrupo({ cuentaId, nombre: String(d.grupo?.nombre ?? ""), inicio: String(d.grupo?.inicio ?? ""), fin: d.grupo?.fin, presupuestoTotal: d.grupo?.presupuestoTotal });
    case "crear-campana":
      return planDeCampana({
        cuentaId,
        grupoId: String(d.grupoId ?? ""),
        nombre: String(d.nombre ?? ""),
        inicio: String(d.inicio ?? ""),
        fin: d.fin,
        presupuestoDiario: d.presupuestoDiario as DatosDeCampana["presupuestoDiario"],
        costoUnitario: d.costoUnitario as DatosDeCampana["costoUnitario"],
        ubicacionesGeo: (d.ubicacionesGeo ?? []).map(String),
        idioma: d.idioma,
        pais: d.pais,
        objetivo: d.objetivo,
        tipoDeCosto: d.tipoDeCosto,
        formato: d.formato,
        intencionPolitica: String(d.intencionPolitica ?? ""),
        entidadAsociada: String(d.entidadAsociada ?? ""),
      });
    default:
      throw new ErrorDeLinkedin("Acción desconocida: use actualizar, crear-grupo o crear-campana.", 400);
  }
}

export async function POST(request: Request) {
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const user = session.actor;
  if (!can(user, "aprobar_cambios")) return fail("Tu usuario no puede aplicar cambios", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);

  const datos = (await request.json().catch(() => ({}))) as Cuerpo;
  try {
    const plan = armarPlan(datos);
    if (datos.confirmar !== true) {
      const estado = await estadoDeLinkedin(user);
      return Response.json({ simulado: true, plan: { ...plan, cuerpo: plan.cuerpo }, conectado: estado.conectado }, { headers: { "cache-control": "no-store" } });
    }

    const token = await tokenDeLinkedin(user);
    const cuentaId = String(datos.cuentaId);
    // Guarda de seguridad: solo cuentas de PRUEBA, y solo las que este token realmente ve.
    const cuenta = (await cuentasDeLinkedin(token)).find((c) => c.id === cuentaId);
    if (!cuenta) return fail("Esa cuenta no está entre las que ve tu conexión de LinkedIn", 404);
    if (!cuenta.prueba && env.LINKEDIN_ESCRITURA_CLIENTES !== "true") {
      return fail("Por ahora solo se escribe en la cuenta de prueba de LinkedIn: las cuentas de clientes están bloqueadas hasta que se active LINKEDIN_ESCRITURA_CLIENTES.", 403);
    }

    const enviado = await enviarPlanALinkedin(plan, token);
    const idDeLaEntidad = plan.tipo === "crear" ? enviado.id : String(datos.nivel === "cuenta" ? cuentaId : datos.id);
    if (!idDeLaEntidad) {
      await registrarEventoDeIntegracion(user, "linkedin_write", `LinkedIn: ${plan.resumen}`, "Aceptado sin id devuelto: verificar en Campaign Manager");
      return fail("LinkedIn aceptó el cambio pero no devolvió el id: revísalo en Campaign Manager antes de reintentar.", 502);
    }

    // Verificación contra la plataforma: el «ok» de una API no basta.
    const actual = await leerDeLinkedin(rutaDeEntidad(plan.nivel, cuentaId, idDeLaEntidad), token);
    const diferencias = diferenciasConLoEsperado(plan.esperado, actual);
    await registrarEventoDeIntegracion(
      user,
      "linkedin_write",
      `LinkedIn: ${plan.resumen}`,
      diferencias.length === 0 ? "Verificado en LinkedIn" : `NO verificado: ${diferencias.map((d) => d.campo).join(", ")}`,
    );
    return Response.json(
      { aplicado: true, id: idDeLaEntidad, verificado: diferencias.length === 0, diferencias },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const estado = error instanceof ErrorDeLinkedin ? error.status : 500;
    const mensaje = error instanceof Error ? error.message : "No se pudo aplicar el cambio en LinkedIn";
    console.error("WiWO.ADS escritura linkedin", mensaje);
    return fail(mensaje, estado >= 400 && estado < 600 ? estado : 502);
  }
}
