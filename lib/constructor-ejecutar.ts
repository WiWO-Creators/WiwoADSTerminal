import { getRawDb } from "@/db";
import {
  MARCADOR_PASO_ANTERIOR,
  type CampaignDraft,
  type CuentaCliente,
  type PlanStep,
} from "@/lib/constructor";
import { executeWindsorAction, idDeResultado, type WindsorProvider } from "@/lib/windsor";
import { retirarPiezasMeta } from "@/lib/renovar-piezas";
import type { CredencialesLinkedin } from "@/lib/linkedin-conexion";
import { diferenciasConLoEsperado, planDeCampana, planDeGrupo, rutaDeEntidad, type DatosDeCampana } from "@/lib/linkedin-escritura-pura";
import { enviarPlanALinkedin, leerDeLinkedin } from "@/lib/linkedin-nativo";
import { ErrorDeLinkedin } from "@/lib/linkedin-nativo-pura";
import {
  crearAnuncioDisplay,
  crearCampanaPmax,
  crearCampanaBusqueda,
  type DatosBusqueda,
  GoogleAdsNativoError,
  type CredencialesGoogle,
} from "@/lib/google-ads-nativo";

/**
 * El bucle real que ejecuta un plan del Constructor contra Windsor —
 * encadenando ids entre pasos, deteniéndose en el primer error. Solo lo llama
 * `app/api/constructor/ejecutar/route.ts`, al publicar desde la pantalla del
 * Constructor con confirmación explícita de una persona — el asistente de IA
 * nunca escribe en una plataforma directamente.
 *
 * No valida el borrador ni resuelve permisos: eso es responsabilidad de quien
 * llama, antes de invocar esto. Lo único que hace es correr los pasos que se
 * le pasan, en orden, contra la cuenta real.
 */

/** Qué id de un paso anterior necesita cada acción, y cómo se llama su campo. */
const PADRE_REQUERIDO: Record<string, { campo: string; de: ClaveId }> = {
  create_ad_group: { campo: "campaign_id", de: "campaign" },
  create_responsive_search_ad: { campo: "ad_group_id", de: "adGroup" },
  "ads:create_display_ad": { campo: "ad_group_id", de: "adGroup" },
  push_keywords: { campo: "ad_group_id", de: "adGroup" },
  set_campaign_geo_targeting: { campo: "campaign_id", de: "campaign" },
  // Los tres de acá abajo faltaban: buildPlan (lib/constructor.ts) ya los
  // arma con `campaign_id: MARCADOR_PASO_ANTERIOR` para una campaña nueva,
  // pero sin una entrada acá ese marcador nunca se reemplazaba por el id
  // real — se le mandaba a Windsor el texto literal "(del paso anterior)"
  // como campaign_id. Encontrado en una revisión de código, no en un reporte
  // de usuario: nunca llegó a fallar en vivo porque las pruebas de esta
  // sesión con negativas/tope de CPC/idiomas siempre se hicieron adjuntando
  // a una cuenta con `enCampanaExistente`, el otro camino que sí trae el id.
  push_negative_keywords: { campo: "campaign_id", de: "campaign" },
  set_cpc_bid_ceiling: { campo: "campaign_id", de: "campaign" },
  set_campaign_language_targeting: { campo: "campaign_id", de: "campaign" },
  create_adset: { campo: "campaign_id", de: "campaign" },
  update_campaign: { campo: "campaign_id", de: "campaign" },
  create_ad: { campo: "adset_id", de: "adset" },
  boost_post: { campo: "adset_id", de: "adset" },
  // LinkedIn: la campaña va DENTRO del grupo que se acaba de crear.
  "linkedin:create_campaign": { campo: "grupoId", de: "linkedinGroup" },
};

/** Claves donde cada plataforma deja el id de lo que acaba de crear. */
const CLAVES_DE_ID: Record<string, { guarda: ClaveId; claves: string[] }> = {
  create_campaign: {
    guarda: "campaign",
    claves: ["campaign_id", "campaignId", "id"],
  },
  create_ad_group: {
    guarda: "adGroup",
    claves: ["ad_group_id", "adGroupId", "id"],
  },
  create_adset: { guarda: "adset", claves: ["adset_id", "adsetId", "id"] },
  create_ad_video: { guarda: "video", claves: ["video_id", "videoId", "id"] },
};

/**
 * Acción de cada plataforma que sirve para renombrar una campaña ya creada —
 * verificado contra `list_actions` real: `rename_campaign` en `google_ads`,
 * `update_campaign` (que sí admite `name`) en `facebook`, ninguna de las dos
 * llamada "delete": Windsor no puede borrar una campaña, solo pausarla o
 * renombrarla.
 */
const ACCION_DE_RENOMBRE: Partial<Record<WindsorProvider, string>> = {
  google: "rename_campaign",
  meta: "update_campaign",
};

/**
 * Prefijo que deja una campaña orfanada visible de un vistazo en la propia
 * plataforma — no solo en el chat de WiWO.ADS — cuando un paso hijo (conjunto,
 * grupo o anuncio) falla después de que la campaña sí se creó.
 */
export const PREFIJO_INCOMPLETA = "[INCOMPLETA — revisar] ";

export type ClaveId = "campaign" | "adGroup" | "adset" | "video" | "linkedinGroup";

export type PasoEjecutado = {
  platform: string;
  action: string;
  label: string;
  params: Record<string, unknown>;
  ok: boolean;
  error: string | null;
  raw: unknown;
};

export type ResultadoEjecucion = {
  ok: boolean;
  pasos: PasoEjecutado[];
  ids: Partial<Record<ClaveId, string>>;
  /**
   * Cuando un paso hijo falla después de que la campaña ya se creó de
   * verdad: qué campaña quedó así y si se pudo marcar en la plataforma real
   * (renombrándola con `PREFIJO_INCOMPLETA`) para que no pase inadvertida.
   * Windsor no tiene forma de borrar una campaña — pausarla no evita
   * confundirla con una intencional, así que el aviso queda en el nombre.
   */
  campanaIncompleta: {
    platform: string;
    campaignId: string;
    nombreOriginal: string;
    marcada: boolean;
  } | null;
};

/** Si un valor de parámetro todavía necesita el id de un paso anterior. */
function esMarcadorDePasoAnterior(valor: unknown): boolean {
  return valor === undefined || valor === MARCADOR_PASO_ANTERIOR;
}

function resumen(step: PlanStep) {
  return {
    platform: step.platform as string,
    action: step.action,
    label: step.label,
  };
}

/** La cuenta elegida para esa plataforma, o la única que tenga el cliente. */
export function cuentaDe(
  step: Pick<PlanStep, "platform">,
  draft: Pick<CampaignDraft, "accountByPlatform">,
  cuentas: CuentaCliente[],
): CuentaCliente | null {
  const delPlatform = cuentas.filter((c) => c.provider === step.platform);
  const elegida = draft.accountByPlatform[step.platform];
  if (elegida) {
    return delPlatform.find((c) => c.externalId === elegida) ?? null;
  }
  return delPlatform.length === 1 ? delPlatform[0] : null;
}

/** Pasos que Windsor no tiene y se hacen con la API de la propia plataforma. Hoy: el anuncio de Display de Google. */
async function ejecutarPasoNativo(
  accion: string,
  accountId: string,
  params: Record<string, unknown>,
  cred: CredencialesGoogle | null,
): Promise<{ ok: boolean; error: string | null; raw: unknown }> {
  if (accion !== "ads:create_display_ad" && accion !== "ads:create_pmax" && accion !== "ads:create_search_campaign") {
    return { ok: false, error: `Acción nativa desconocida: ${accion}`, raw: null };
  }
  if (!cred) {
    return {
      ok: false,
      error: "Falta conectar tu cuenta de Google en Cuentas (con acceso a esta cuenta publicitaria) para crear con imagen.",
      raw: null,
    };
  }
  try {
    if (accion === "ads:create_search_campaign") {
      const r = await crearCampanaBusqueda(cred, accountId, params.datos as DatosBusqueda);
      return { ok: true, error: null, raw: r };
    }
    if (accion === "ads:create_pmax") {
      const r = await crearCampanaPmax(cred, accountId, {
        nombre: String(params.name ?? ""),
        presupuestoDiarioMicros: Number(params.daily_budget_micros ?? 0),
        urlFinal: String(params.final_url ?? ""),
        titulares: (params.headlines as string[]) ?? [],
        titulosLargos: (params.long_headlines as string[]) ?? [],
        descripciones: (params.descriptions as string[]) ?? [],
        nombreNegocio: String(params.business_name ?? ""),
        imagenPaisajeUrl: String(params.landscape_image_url ?? ""),
        imagenCuadradaUrl: String(params.square_image_url ?? ""),
        logoUrl: typeof params.logo_url === "string" ? params.logo_url : null,
        ubicaciones: (params.locations as string[]) ?? [],
        excluidas: (params.excluded_locations as string[]) ?? [],
        fin: typeof params.end_date === "string" ? params.end_date : null,
      });
      return { ok: true, error: null, raw: r };
    }
    const r = await crearAnuncioDisplay(cred, accountId, String(params.ad_group_id), {
      titulares: (params.headlines as string[]) ?? [],
      tituloLargo: String(params.long_headline ?? ""),
      descripciones: (params.descriptions as string[]) ?? [],
      nombreNegocio: String(params.business_name ?? ""),
      urlFinal: String(params.final_url ?? ""),
      imagenPaisajeUrl: String(params.landscape_image_url ?? ""),
      imagenCuadradaUrl: String(params.square_image_url ?? ""),
      logoUrl: typeof params.logo_url === "string" ? params.logo_url : null,
    });
    return { ok: true, error: null, raw: r };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof GoogleAdsNativoError ? e.message : "No se pudo crear el anuncio de Display en Google Ads.",
      raw: e instanceof GoogleAdsNativoError ? e.detalle : String(e),
    };
  }
}

/**
 * Crea en LinkedIn por su API directa (Windsor no puede crear nada ahí): primero el grupo de campañas y luego la campaña
 * dentro de él, ambos en borrador. Cada cosa creada se LEE DE VUELTA de LinkedIn y debe coincidir con lo pedido; si LinkedIn
 * responde que sí pero no devuelve el id, el paso falla en vez de darse por bueno. Nunca reintenta (un reintento duplicaría).
 */
async function ejecutarPasoLinkedin(
  accion: string,
  accountId: string,
  params: Record<string, unknown>,
  cred: CredencialesLinkedin | null,
): Promise<{ ok: boolean; error: string | null; raw: unknown }> {
  if (accion !== "linkedin:create_group" && accion !== "linkedin:create_campaign") {
    return { ok: false, error: `Acción de LinkedIn desconocida: ${accion}`, raw: null };
  }
  if (!cred) {
    return {
      ok: false,
      error:
        "Para crear en LinkedIn hace falta la conexión de LinkedIn del equipo (un administrador la conecta una vez en Integraciones). En cuentas de clientes, además, la escritura debe estar habilitada (LINKEDIN_ESCRITURA_CLIENTES).",
      raw: null,
    };
  }
  try {
    const plan =
      accion === "linkedin:create_group"
        ? planDeGrupo({
            cuentaId: accountId,
            nombre: String(params.nombre ?? ""),
            inicio: String(params.inicio ?? ""),
            fin: typeof params.fin === "string" ? params.fin : undefined,
          })
        : planDeCampana({ ...(params as unknown as Omit<DatosDeCampana, "cuentaId">), cuentaId: accountId });
    const enviado = await enviarPlanALinkedin(plan, cred.token);
    if (!enviado.id) {
      return {
        ok: false,
        error: "LinkedIn aceptó la creación pero no devolvió el id: revisa la cuenta en Campaign Manager antes de reintentar, puede haber quedado creado.",
        raw: null,
      };
    }
    const actual = await leerDeLinkedin(rutaDeEntidad(plan.nivel, accountId, enviado.id), cred.token);
    const diferencias = diferenciasConLoEsperado(plan.esperado, actual);
    if (diferencias.length > 0) {
      return {
        ok: false,
        error: `LinkedIn lo creó (id ${enviado.id}) pero al leerlo no coincide: ${diferencias.map((d) => d.campo).join(", ")}.`,
        raw: { id: enviado.id, diferencias },
      };
    }
    return { ok: true, error: null, raw: { id: enviado.id, verificado: true } };
  } catch (e) {
    return { ok: false, error: e instanceof ErrorDeLinkedin ? e.message : "No se pudo crear en LinkedIn.", raw: String(e) };
  }
}

/** Retira (pausa) un anuncio viejo de Meta con la conexión directa y lo lee de vuelta: solo es ok si Meta lo dejó pausado. */
async function ejecutarPasoMeta(accion: string, params: Record<string, unknown>): Promise<{ ok: boolean; error: string | null; raw: unknown }> {
  if (accion !== "meta:retirar_anuncio") return { ok: false, error: `Acción de Meta desconocida: ${accion}`, raw: null };
  const [r] = await retirarPiezasMeta([{ id: String(params.ad_id ?? ""), nombre: String(params.nombre ?? params.ad_id ?? "") }]);
  return { ok: r?.ok === true, error: r?.error ?? null, raw: r ?? null };
}

export async function ejecutarPasosDelPlan(
  steps: PlanStep[],
  draft: Pick<CampaignDraft, "accountByPlatform">,
  cuentas: CuentaCliente[],
  /** Conexión directa a Google Ads de quien publica; la necesitan los pasos `via: "nativa"` (Display con imagen). */
  credencialesGoogle: CredencialesGoogle | null = null,
  /** Conexión directa a LinkedIn de quien publica (ver `accesoNativoLinkedin`): la necesitan los pasos de LinkedIn. */
  credencialesLinkedin: CredencialesLinkedin | null = null,
): Promise<ResultadoEjecucion> {
  const ejecutables = steps.filter((step) => !step.informativo);
  const ids: Partial<Record<ClaveId, string>> = {};
  const realizados: PasoEjecutado[] = [];
  let todoBien = true;
  // Campaña ya creada de verdad para cada plataforma en este plan — para
  // poder marcarla si un paso hijo (conjunto, grupo o anuncio) falla después.
  const campanaPorPlataforma: Partial<
    Record<WindsorProvider, { id: string; nombre: string; accountId: string }>
  > = {};
  let pasoFallido: PlanStep | null = null;

  for (const step of ejecutables) {
    const cuenta = cuentaDe(step, draft, cuentas);
    if (!cuenta) {
      realizados.push({
        ...resumen(step),
        params: step.params,
        ok: false,
        error: `No se pudo resolver la cuenta de ${step.platform}`,
        raw: null,
      });
      todoBien = false;
      pasoFallido = step;
      break;
    }

    const params = { ...step.params };

    const padre = PADRE_REQUERIDO[step.action];
    if (padre && esMarcadorDePasoAnterior(params[padre.campo])) {
      const valor = ids[padre.de];
      if (!valor) {
        realizados.push({
          ...resumen(step),
          params,
          ok: false,
          error: `Falta el identificador del paso anterior (${padre.campo})`,
          raw: null,
        });
        todoBien = false;
        pasoFallido = step;
        break;
      }
      params[padre.campo] = valor;
    }
    if (params.video_id === MARCADOR_PASO_ANTERIOR) {
      if (!ids.video) {
        realizados.push({
          ...resumen(step),
          params,
          ok: false,
          error: "Falta el identificador del video subido",
          raw: null,
        });
        todoBien = false;
        pasoFallido = step;
        break;
      }
      params.video_id = ids.video;
    }

    const resultado =
      step.via === "nativa" && step.platform === "linkedin"
        ? await ejecutarPasoLinkedin(step.action, cuenta.externalId, params, credencialesLinkedin)
        : step.via === "nativa" && step.platform === "meta"
          ? await ejecutarPasoMeta(step.action, params)
          : step.via === "nativa"
          ? await ejecutarPasoNativo(step.action, cuenta.externalId, params, credencialesGoogle)
          : await executeWindsorAction(step.platform as WindsorProvider, cuenta.externalId, step.action, params);
    realizados.push({
      ...resumen(step),
      params,
      ok: resultado.ok,
      error: resultado.error,
      raw: resultado.raw,
    });

    if (!resultado.ok) {
      todoBien = false;
      pasoFallido = step;
      break;
    }

    if (step.action === "linkedin:create_group") {
      // El grupo de LinkedIn ya está creado (y verificado): la campaña siguiente necesita su id.
      ids.linkedinGroup = String((resultado.raw as { id?: string } | null)?.id ?? "");
    }

    const salida = CLAVES_DE_ID[step.action];
    if (salida) {
      const id = idDeResultado(resultado.raw, salida.claves);
      if (!id) {
        realizados[realizados.length - 1] = {
          ...resumen(step),
          params,
          ok: false,
          error:
            "La plataforma creó el objeto pero no devolvió un identificador reconocible. Revisa la cuenta antes de reintentar: puede haber quedado creado.",
          raw: resultado.raw,
        };
        todoBien = false;
        pasoFallido = step;
        break;
      }
      ids[salida.guarda] = id;
      if (step.action === "create_campaign") {
        campanaPorPlataforma[step.platform as WindsorProvider] = {
          id,
          nombre: typeof params.name === "string" ? params.name : "",
          accountId: cuenta.externalId,
        };
      }
    }
  }

  // Un paso hijo (conjunto, grupo o anuncio) falló después de que la campaña
  // de esa misma plataforma sí se creó: queda huérfana e indistinguible de una
  // campaña real a simple vista. Como ahora nace activa (decisión del equipo), un paso posterior
  // fallido (por ejemplo la geolocalización) podría dejarla corriendo mal configurada: se pausa y
  // se marca en su nombre real, en la plataforma, no solo en este reporte. Windsor no puede borrarla.
  let campanaIncompleta: ResultadoEjecucion["campanaIncompleta"] = null;
  if (!todoBien && pasoFallido && pasoFallido.action !== "create_campaign") {
    const huerfana = campanaPorPlataforma[pasoFallido.platform as WindsorProvider];
    if (huerfana) {
      const accion = ACCION_DE_RENOMBRE[pasoFallido.platform as WindsorProvider];
      let marcada = false;
      if (accion) {
        const nombreMarcado = `${PREFIJO_INCOMPLETA}${huerfana.nombre}`.slice(0, 255);
        const renombre = await executeWindsorAction(
          pasoFallido.platform as WindsorProvider,
          huerfana.accountId,
          accion,
          { campaign_id: huerfana.id, name: nombreMarcado },
        );
        marcada = renombre.ok;
        realizados.push({
          platform: pasoFallido.platform,
          action: accion,
          label: `Marcar la campaña como incompleta (falló ${pasoFallido.label.toLowerCase()})`,
          params: { campaign_id: huerfana.id, name: nombreMarcado },
          ok: renombre.ok,
          error: renombre.error,
          raw: renombre.raw,
        });
      }
      // Red de seguridad: una campaña a medio armar no debe seguir corriendo.
      const parar = await executeWindsorAction(pasoFallido.platform as WindsorProvider, huerfana.accountId, "pause_campaign", { campaign_id: huerfana.id });
      realizados.push({
        platform: pasoFallido.platform,
        action: "pause_campaign",
        label: "Pausar la campaña incompleta, para que no corra a medio armar",
        params: { campaign_id: huerfana.id },
        ok: parar.ok,
        error: parar.error,
        raw: parar.raw,
      });
      campanaIncompleta = {
        platform: pasoFallido.platform,
        campaignId: huerfana.id,
        nombreOriginal: huerfana.nombre,
        marcada,
      };
    }
  }

  return { ok: todoBien, pasos: realizados, ids, campanaIncompleta };
}

/**
 * El id nativo que dejó un paso de creación ya ejecutado, releído de su
 * propia respuesta cruda — no de `ids` (que solo guarda uno por tipo, así
 * que una campaña de Google y otra de Meta creadas en el mismo plan se
 * pisan entre sí ahí). Sirve para verificar, por plataforma, que lo que
 * Windsor dijo que creó existe de verdad — ver `actualizarCatalogoDeCuentas`
 * en `lib/windsor.ts`.
 */
export function idDeCreacion(
  paso: PasoEjecutado,
  evitar: ReadonlySet<string> = new Set(),
): string | null {
  if (!paso.ok) return null;
  const salida = CLAVES_DE_ID[paso.action];
  if (!salida) return null;
  return idDeResultado(paso.raw, salida.claves, evitar);
}

/**
 * Última revisión de duplicado antes de ejecutar: si en las últimas 6 horas
 * ya se publicó (o se intentó publicar y algo quedó creado) una campaña con
 * este nombre para este cliente, hay que confirmar antes de repetirla —
 * Windsor no puede borrar lo que ya se creó. Comparte esta regla la ruta HTTP
 * del Constructor y la creación real que puede hacer el asistente de IA.
 */
export async function publicacionReciente(
  portfolioId: string,
  campaignName: string,
): Promise<{ creado: string[]; hace: number } | null> {
  const previa = await getRawDb()
    .prepare(
      `SELECT created_at, steps_json FROM ejecuciones
       WHERE portfolio_id = ? AND campaign_name = ? AND created_at > ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(portfolioId, campaignName, Date.now() - 6 * 60 * 60 * 1000)
    .first<{ created_at: number; steps_json: string }>();
  if (!previa) return null;
  const creados = (JSON.parse(previa.steps_json) as PasoEjecutado[]).filter(
    (paso) => paso.ok,
  );
  if (creados.length === 0) return null;
  return {
    creado: creados.map((paso) => `${paso.platform}: ${paso.label}`),
    hace: Date.now() - Number(previa.created_at),
  };
}

/**
 * Nombres de campañas creadas de verdad desde WiWO.ADS para este cliente en
 * las últimas `horas` horas — para que `recommendBudget` (`lib/constructor.ts`)
 * no las cuente como "historial real" al sugerir presupuesto. Confirmado con
 * Colbún (2026-09-24): campañas de prueba de esta misma sesión, creadas y
 * borradas minutos antes, aparecieron citadas como si fueran gasto histórico
 * del cliente — sin gasto real detrás, solo ruido de sesiones de prueba.
 */
export async function nombresDeCampanasRecientes(
  portfolioId: string,
  horas = 48,
): Promise<Set<string>> {
  const filas = await getRawDb()
    .prepare(
      `SELECT steps_json FROM ejecuciones
       WHERE portfolio_id = ? AND created_at > ?`,
    )
    .bind(portfolioId, Date.now() - horas * 60 * 60 * 1000)
    .all<{ steps_json: string }>();
  const nombres = new Set<string>();
  for (const fila of filas.results) {
    let pasos: PasoEjecutado[];
    try {
      pasos = JSON.parse(fila.steps_json) as PasoEjecutado[];
    } catch {
      continue;
    }
    // El nombre real en la plataforma lleva la sigla compuesta
    // (`nombreCompuesto`, ej. "[TRF] Nombre"), no el `draft.name` a secas —
    // se toma del `params.name` que de verdad se mandó a Windsor en el paso
    // `create_campaign`, para comparar contra `CampaignSummary.name` tal
    // como lo devuelve la plataforma.
    for (const paso of pasos) {
      if (paso.action === "create_campaign" && paso.ok && typeof paso.params.name === "string") {
        nombres.add(paso.params.name);
      }
    }
  }
  return nombres;
}

export async function registrarEjecucion(
  draft: Pick<CampaignDraft, "portfolioId" | "name" | "platforms">,
  email: string,
  pasos: PasoEjecutado[],
  ok: boolean,
): Promise<void> {
  try {
    await getRawDb()
      .prepare(
        `INSERT INTO ejecuciones
           (id, portfolio_id, actor_email, campaign_name, platforms,
            steps_json, ok, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        draft.portfolioId,
        email,
        draft.name,
        draft.platforms.join(","),
        JSON.stringify(pasos),
        ok ? 1 : 0,
        Date.now(),
      )
      .run();
  } catch (error) {
    // El registro no puede tumbar la respuesta: lo que se creó ya se creó, y
    // quien lo pidió necesita verlo aunque la bitácora falle.
    console.error("WiWO.ADS no pudo registrar la ejecución", error);
  }
}
