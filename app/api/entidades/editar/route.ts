import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { registrarEjecucion } from "@/lib/constructor-ejecutar";
import { entidadConAncestros, fetchDetalleDeCuenta } from "@/lib/detalle-entidad-store";
import { ejecutarPasosDeEdicion } from "@/lib/edicion-ejecutar";
import { verificarCambios, type AntesDeEdicion, type CambiosEdicion } from "@/lib/edicion-plan";
import { armarAntes, ErrorDeEdicion, prepararEdicion } from "@/lib/edicion-servicio";
import { actualizarAnuncioRsa,
  actualizarCampanaGoogle, GoogleAdsNativoError } from "@/lib/google-ads-nativo";
import { mismoOrigen } from "@/lib/origen-publico";
import { can } from "@/lib/permisos";
import { puedeAdministrar, type NivelEntidad } from "@/lib/plataformas";
import { WindsorError } from "@/lib/windsor";

/**
 * Modo editar del Constructor: simula y aplica cambios sobre una campaña,
 * conjunto o anuncio que YA existe. Mismos guardarraíles que el ejecutor de
 * creación (`/api/constructor/ejecutar`):
 *
 *  - **El plan se arma acá.** El navegador manda qué quiere cambiar, no los
 *    pasos: se vuelve a leer la entidad de la plataforma y se recalcula el
 *    diff en el servidor. Lo que se aprobó en pantalla es lo que corre.
 *  - **Simular no escribe nada.** En Google, además, el cambio se valida
 *    contra la cuenta real (`validateOnly`) sin aplicarlo.
 *  - **Aplicar exige** `aprobar_cambios` y `confirmacion: "EDITAR"`.
 *  - **Alcance por cliente** y **bitácora** de cada cambio (`ejecuciones`).
 *  - **Se verifica después**: se relee la entidad y se compara, porque el
 *    "ok" de Windsor ya confirmó una vez algo que nunca existió.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const NIVELES = ["campana", "conjunto", "anuncio"] as const;

type Cuerpo = {
  provider?: string;
  accountId?: string;
  nivel?: string;
  id?: string;
  cambios?: CambiosEdicion;
  modo?: string;
  confirmacion?: string;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415, CODIGOS_ERROR.CONTENT_TYPE_INVALIDO);
  }

  const body = (await request.json().catch(() => ({}))) as Cuerpo;
  const provider = body.provider ?? "";
  const accountId = (body.accountId ?? "").trim();
  const nivel = body.nivel as NivelEntidad;
  const id = (body.id ?? "").trim();
  const aplicar = body.modo === "aplicar";

  if (!puedeAdministrar(provider)) return fail("Plataforma no reconocida o todavía no activa", 400);
  if (!accountId) return fail("Falta la cuenta", 400);
  if (!(NIVELES as readonly string[]).includes(nivel)) return fail("Nivel no reconocido", 400);
  if (!id) return fail("Falta el identificador de la entidad", 400);
  if (!body.cambios || typeof body.cambios !== "object") return fail("Faltan los cambios", 400);

  // Simular no escribe: lo puede hacer quien ve al cliente. Aplicar sí escribe.
  if (aplicar) {
    if (!can(session.actor, "aprobar_cambios")) {
      return fail("Tu rol puede armar cambios pero no aplicarlos. Pídele a un administrador que lo apruebe.", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
    }
    if (body.confirmacion !== "EDITAR") return fail("Falta la confirmación explícita", 400);
  }

  try {
    const { plan, antes, portfolioId, currency, credencialesGoogle } = await prepararEdicion({
      actor: session.actor,
      provider,
      accountId,
      nivel,
      id,
      cambios: body.cambios,
    });
    const bloqueantes = plan.problemas.filter((p) => p.bloqueante);

    if (!aplicar) {
      // Google valida el cambio entero contra la cuenta real sin aplicarlo.
      let validacionGoogle: { ok: boolean; mensaje: string | null } | null = null;
      const nativo = plan.pasos.find((p) => p.via === "nativa");
      if (nativo && credencialesGoogle && bloqueantes.length === 0) {
        try {
          if (nativo.action === "ads:update_campaign") {
            await actualizarCampanaGoogle(credencialesGoogle, accountId, String(nativo.params.campaign_id), nativo.params.cambios as never, {
              validateOnly: true,
            });
          } else {
            await actualizarAnuncioRsa(credencialesGoogle, accountId, String(nativo.params.ad_id), nativo.params.cambios as never, {
              validateOnly: true,
            });
          }
          validacionGoogle = { ok: true, mensaje: null };
        } catch (error) {
          validacionGoogle = {
            ok: false,
            mensaje: error instanceof GoogleAdsNativoError ? error.message : "Google no pudo validar el cambio.",
          };
        }
      }
      return Response.json(
        { simulacion: true, plan, validacionGoogle, currency },
        { headers: NO_STORE },
      );
    }

    if (bloqueantes.length > 0) {
      return Response.json(
        { error: "El cambio todavía tiene problemas por resolver", problemas: bloqueantes },
        { status: 422, headers: NO_STORE },
      );
    }
    if (plan.pasos.length === 0) return fail("No hay ningún cambio que aplicar", 422);

    const resultado = await ejecutarPasosDeEdicion({
      provider,
      accountId,
      nivel,
      ids: {
        campaignId: "campaignId" in antes.entidad ? antes.entidad.campaignId : null,
        conjuntoId: antes.nivel === "anuncio" ? antes.entidad.conjuntoId : null,
        id,
      },
      pasos: plan.pasos,
      pausarAlFinal: plan.pausaAlAplicar,
      credencialesGoogle,
    });

    await registrarEjecucion(
      {
        portfolioId,
        name: `Edición · ${nivel} ${id}`,
        platforms: [provider],
      },
      session.actor.email,
      resultado.pasos,
      resultado.ok,
    );

    if (!resultado.ok) {
      return Response.json(
        {
          ok: false,
          pasos: resultado.pasos,
          aviso: "Se detuvo en el primer error. Los pasos marcados como correctos ya se aplicaron.",
        },
        { status: 502, headers: NO_STORE },
      );
    }

    // Se relee lo que la plataforma dice tener ahora. Windsor puede tardar
    // unos segundos en reflejar un cambio: sin coincidencia no es un fallo,
    // es "todavía no confirmado".
    let despues: AntesDeEdicion | null = null;
    try {
      const nuevo = await fetchDetalleDeCuenta(provider, accountId, { credencialesGoogle });
      despues = armarAntes(nivel, entidadConAncestros(nuevo, nivel, id));
    } catch (error) {
      console.error("WiWO.ADS relectura tras editar", error);
    }
    const verificacion = verificarCambios(plan, despues);
    const sinConfirmar = verificacion.filter((v) => v.coincide === false);

    return Response.json(
      {
        ok: true,
        pasos: resultado.pasos,
        pausa: resultado.pausa,
        verificacion,
        aviso:
          sinConfirmar.length > 0
            ? `La plataforma respondió que sí, pero al releerla todavía no refleja: ${sinConfirmar.map((v) => v.etiqueta).join(", ")}. Puede ser demora — revísalo directamente en la plataforma antes de darlo por hecho.`
            : resultado.pausa && !resultado.pausa.ok
              ? "El cambio se aplicó, pero no se pudo pausar. Revísalo en la plataforma: puede seguir corriendo con lo nuevo."
              : plan.pausaAlAplicar
                ? "Cambio aplicado y pausado para su revisión. Actívalo cuando esté listo."
                : "Cambio aplicado.",
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof ErrorDeEdicion) {
      return Response.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    }
    if (error instanceof WindsorError) {
      return fail("Windsor no respondió a tiempo. Intenta de nuevo en un momento.", 502);
    }
    console.error("WiWO.ADS editar entidad", error);
    return fail("No se pudo procesar la edición", 500);
  }
}
