import { crearAnuncioDisplay, crearCampanaBusqueda, crearCampanaPmax, GoogleAdsNativoError, validarBusqueda, type DatosBusqueda } from "@/lib/google-ads-nativo";
import { accesoNativoGoogle } from "@/lib/integration-store";
import { cuentaDe } from "@/lib/constructor-ejecutar";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { mismoOrigen } from "@/lib/origen-publico";
import { detalleClientes } from "@/lib/clientes-detalle";
import {
  buildPlan,
  normalizeDraft,
  type CampaignDraft,
  type CuentaCliente,
} from "@/lib/constructor";
import { cargarCompatibilidadBoost } from "@/lib/boost-compat-store";
import { cargarRetiradas } from "@/lib/renovar-piezas";
import { nombresDeCampanasRecientes } from "@/lib/constructor-ejecutar";
import { getPerformanceSnapshot } from "@/lib/performance-store";
import { puedeArmarCampanas, enAlcance } from "@/lib/permisos";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/**
 * Chequea que la landing de verdad responda — un caso real (campaña de
 * Colbún de prueba) llegó al Constructor con la landing en 404 y nadie lo
 * notó hasta publicar. No bloquea: una landing caída ahora mismo puede
 * volver antes de publicar, y quien revisa el plan decide si espera o
 * corrige la URL. `null` cuando no hay nada que avisar.
 */
async function avisoDeLandingCaida(url: string): Promise<string | null> {
  const controller = new AbortController();
  const corte = setTimeout(() => controller.abort(), 6000);
  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    // Algunos sitios no responden HEAD (405/501): un GET real confirma.
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    }
    if (response.status === 404) {
      return `La landing (${url}) responde 404 — revisa que la URL sea la correcta`;
    }
    if (response.status >= 400) {
      return `La landing (${url}) responde error ${response.status} — revisa que esté publicada`;
    }
    return null;
  } catch {
    return `No se pudo comprobar que la landing (${url}) responda — revisa que esté publicada y accesible`;
  } finally {
    clearTimeout(corte);
  }
}

/**
 * Simula la creación de una campaña.
 *
 * Esta ruta NO escribe en Google ni en Meta. Devuelve el plan: los pasos
 * exactos que se ejecutarían, con sus parámetros. La ejecución será otra ruta,
 * con aprobación explícita y registro en la bitácora.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!puedeArmarCampanas(session.actor)) {
    return fail("Tu rol no puede construir campañas", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  }

  if (!mismoOrigen(request)) {
    return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415, CODIGOS_ERROR.CONTENT_TYPE_INVALIDO);
  }

  try {
    const body = (await request.json()) as Partial<CampaignDraft>;
    const draft = normalizeDraft(body);

    const [snapshot, { clientes }] = await Promise.all([
      getPerformanceSnapshot(session.actor),
      detalleClientes(session.actor, new Date()),
    ]);
    const cliente = clientes.find((item) => item.id === draft.portfolioId);
    const cuentas: CuentaCliente[] = cliente?.accounts ?? [];

    // El alcance sale de los permisos, no del gasto.
    //
    // Antes se exigía que el cliente apareciera en el snapshot de
    // rendimiento, y ahí solo están los que facturaron en el periodo. Eso
    // bloqueaba justo el caso normal de esta pantalla: armarle una campaña a
    // un cliente que hoy no tiene nada al aire.
    if (draft.portfolioId && !enAlcance(session.actor, draft.portfolioId)) {
      return fail("Ese cliente no está en tu alcance", 403);
    }

    // Solo para sugerir presupuesto a partir de su historia; que no esté no
    // impide planificar.
    const portfolio =
      snapshot.portfolios.find((item) => item.id === draft.portfolioId) ?? null;

    // Campañas de prueba creadas por este mismo sistema en las últimas
    // horas no cuentan como "historia" del cliente al sugerir presupuesto —
    // ver `recommendBudget`.
    const excluirCampanasDePresupuesto = draft.portfolioId
      ? await nombresDeCampanasRecientes(draft.portfolioId)
      : new Set<string>();

    // Impulsar dentro de algo que ya existe: lo decide Meta, se lee de la plataforma.
    const compatBoost = await cargarCompatibilidadBoost(draft);
    const plan = buildPlan(draft, portfolio, cuentas, snapshot, excluirCampanasDePresupuesto, compatBoost, {
      sinConversionesMedidas: cliente?.gtmEstado === "no_tiene",
      retirar: await cargarRetiradas(draft, cuentas),
    });
    // Display con imagen: se descargan las imágenes y se comprueba tamaño y proporción antes de publicar
    // (no toca ninguna cuenta). Un error de Google por una imagen mal cortada aparecería recién al publicar.
    const pasoDisplay = plan.steps.find((s) => s.action === "ads:create_display_ad");
    if (pasoDisplay && plan.issues.every((i) => !i.blocking)) {
      try {
        await crearAnuncioDisplay(
          { accessToken: "", developerToken: "", apiVersion: "", managerId: null },
          "0",
          "0",
          {
            titulares: (pasoDisplay.params.headlines as string[]) ?? [],
            tituloLargo: String(pasoDisplay.params.long_headline ?? ""),
            descripciones: (pasoDisplay.params.descriptions as string[]) ?? [],
            nombreNegocio: String(pasoDisplay.params.business_name ?? ""),
            urlFinal: String(pasoDisplay.params.final_url ?? ""),
            imagenPaisajeUrl: String(pasoDisplay.params.landscape_image_url ?? ""),
            imagenCuadradaUrl: String(pasoDisplay.params.square_image_url ?? ""),
            logoUrl: typeof pasoDisplay.params.logo_url === "string" ? pasoDisplay.params.logo_url : null,
          },
          { soloValidar: true },
        );
      } catch (error) {
        const mensaje = error instanceof GoogleAdsNativoError ? error.message : "No se pudieron revisar las imágenes de Display.";
        plan.issues.push({ field: "mediaUrl", message: mensaje, blocking: true });
      }
    }
    // Performance Max: Google valida la campaña entera (textos, imágenes, ubicación) contra la cuenta real con
    // `validateOnly`: no crea nada. Sin la conexión de Google no se puede, y se dice.
    const pasoPmax = plan.steps.find((s) => s.action === "ads:create_pmax");
    if (pasoPmax && plan.issues.every((i) => !i.blocking)) {
      const cuentaGoogle = cuentaDe({ platform: "google" }, draft, cuentas);
      const cred = cuentaGoogle ? await accesoNativoGoogle(session.actor, cuentaGoogle.externalId) : null;
      if (!cuentaGoogle || !cred) {
        plan.issues.push({
          field: "accountByPlatform",
          message: "No se pudo validar la campaña de Performance Max contra Google: falta la conexión de Google con acceso a esa cuenta (Cuentas → Usar para todo el equipo).",
          blocking: false,
        });
      } else {
        const q = pasoPmax.params;
        try {
          await crearCampanaPmax(
            cred,
            cuentaGoogle.externalId,
            {
              nombre: String(q.name ?? ""),
              presupuestoDiarioMicros: Number(q.daily_budget_micros ?? 0),
              urlFinal: String(q.final_url ?? ""),
              titulares: (q.headlines as string[]) ?? [],
              titulosLargos: (q.long_headlines as string[]) ?? [],
              descripciones: (q.descriptions as string[]) ?? [],
              nombreNegocio: String(q.business_name ?? ""),
              imagenPaisajeUrl: String(q.landscape_image_url ?? ""),
              imagenCuadradaUrl: String(q.square_image_url ?? ""),
              logoUrl: typeof q.logo_url === "string" ? q.logo_url : null,
              ubicaciones: (q.locations as string[]) ?? [],
              excluidas: (q.excluded_locations as string[]) ?? [],
              fin: typeof q.end_date === "string" ? q.end_date : null,
            },
            { soloValidar: true },
          );
        } catch (error) {
          plan.issues.push({
            field: "mediaUrl",
            message: error instanceof GoogleAdsNativoError ? `Google no validó la campaña: ${error.message}` : "No se pudo validar la campaña de Performance Max.",
            blocking: true,
          });
        }
      }
    }
    // Búsqueda con la estructura de Google: se revisan los límites propios y Google valida la campaña entera contra la
    // cuenta real con `validateOnly` (no crea nada).
    const pasoBusqueda = plan.steps.find((s) => s.action === "ads:create_search_campaign");
    if (pasoBusqueda) {
      const datos = pasoBusqueda.params.datos as DatosBusqueda;
      for (const problema of validarBusqueda(datos)) {
        plan.issues.push({ field: "googleBusqueda", message: problema, blocking: true });
      }
      if (plan.issues.every((i) => !i.blocking)) {
        const cuentaGoogle = cuentaDe({ platform: "google" }, draft, cuentas);
        const cred = cuentaGoogle ? await accesoNativoGoogle(session.actor, cuentaGoogle.externalId) : null;
        if (!cuentaGoogle || !cred) {
          plan.issues.push({
            field: "accountByPlatform",
            message: "No se pudo validar la campaña de Búsqueda contra Google: falta la conexión de Google con acceso a esa cuenta (Cuentas → Usar para todo el equipo).",
            blocking: false,
          });
        } else {
          try {
            await crearCampanaBusqueda(cred, cuentaGoogle.externalId, datos, { soloValidar: true });
          } catch (error) {
            plan.issues.push({
              field: "googleBusqueda",
              message: error instanceof GoogleAdsNativoError ? `Google no validó la campaña: ${error.message}` : "No se pudo validar la campaña de Búsqueda.",
              blocking: true,
            });
          }
        }
      }
    }
    const landing = draft.landingUrl.trim();
    if (landing) {
      const aviso = await avisoDeLandingCaida(landing);
      if (aviso) plan.issues.push({ field: "landingUrl", message: aviso, blocking: false });
    }

    return Response.json(plan, {
      headers: NO_STORE,
    });
  } catch (error) {
    console.error("WiWO.ADS constructor", error);
    return fail("No pudimos armar el plan", 500);
  }
}

