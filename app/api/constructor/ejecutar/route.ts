import { getSession } from "@/app/sesion";
import { detalleClientes } from "@/lib/clientes-detalle";
import { buildPlan, normalizeDraft, type CampaignDraft, type CuentaCliente } from "@/lib/constructor";
import {
  cuentaDe,
  ejecutarPasosDelPlan,
  idDeCreacion,
  PREFIJO_INCOMPLETA,
  publicacionReciente,
  registrarEjecucion,
} from "@/lib/constructor-ejecutar";
import { idDeResultado } from "@/lib/ids-de-resultado";
import { getPerformanceSnapshot } from "@/lib/performance-store";
import { can, enAlcance } from "@/lib/permisos";
import { actualizarCatalogoDeCuentas, type WindsorProvider } from "@/lib/windsor";

/**
 * Nombres de campo de id que un anuncio recién creado puede devolver.
 * `create_adset` ya tiene su propia entrada en `CLAVES_DE_ID`
 * (`constructor-ejecutar.ts`) y `idDeCreacion` la cubre; estas dos son las
 * que faltaban, porque nada más adelante en la cadena de pasos necesita el id
 * del anuncio para seguir, así que nunca se guardaron en `ids`.
 */
const CAMPOS_DE_ID_ANUNCIO: Record<string, string[]> = {
  create_ad: ["ad_id", "adId", "id"],
  create_responsive_search_ad: ["ad_id", "adId", "id"],
};

/**
 * Ejecuta de verdad el plan del constructor: crea en Google y en Meta.
 *
 * Es la única ruta HTTP del sistema que cambia algo fuera de WiWO.ADS, y
 * siempre por pedido directo de una persona (el bucle de escritura en sí
 * vive en `lib/constructor-ejecutar.ts`). El asistente de IA nunca llama
 * esto: solo deja el Constructor precargado para que la persona revise y
 * publique desde acá. Sus guardarraíles:
 *
 *  - **El plan se reconstruye acá.** No se aceptan los pasos que mande el
 *    navegador: se recibe el mismo borrador que alimenta la simulación y se
 *    vuelve a armar el plan en el servidor. Lo que se aprobó en pantalla es
 *    exactamente lo que corre.
 *  - **Cero problemas bloqueantes.** Si la validación encuentra uno, no se
 *    ejecuta nada.
 *  - **Confirmación explícita.** Sin el campo `confirmacion: "CREAR"` no
 *    arranca, así que una petición perdida no puede crear una campaña.
 *  - **Solo quien aprueba cambios.** Capacidad `aprobar_cambios`.
 *  - **Todo nace pausado.** Lo pone `buildPlan` y Windsor lo respeta: nada
 *    empieza a gastar por esta vía.
 *  - **Se detiene en el primer error** y devuelve qué alcanzó a crear, para
 *    que nadie tenga que adivinar en qué estado quedó la cuenta.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "aprobar_cambios")) {
    return fail(
      "Tu rol puede armar campañas pero no publicarlas. Pídele a un administrador que la apruebe.",
      403,
    );
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return fail("Origen no permitido", 403);
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415);
  }

  const body = (await request.json()) as {
    draft?: Partial<CampaignDraft>;
    confirmacion?: string;
    /** Confirma publicar otra vez algo que ya se publicó hace poco. */
    duplicar?: boolean;
  };
  if (body.confirmacion !== "CREAR") {
    return fail("Falta la confirmación explícita", 400);
  }

  // Mismo normalizado que la simulación: una sola definición de qué es un
  // borrador válido, para que no puedan divergir.
  const draft = normalizeDraft(body.draft ?? {});

  const [snapshot, { clientes }] = await Promise.all([
    getPerformanceSnapshot(session.actor),
    detalleClientes(session.actor, new Date()),
  ]);
  // El alcance sale de los permisos, no del gasto: se crean campañas
  // precisamente para clientes que hoy no tienen nada corriendo.
  if (!enAlcance(session.actor, draft.portfolioId)) {
    return fail("Ese cliente no está en tu alcance", 403);
  }
  const portfolio =
    snapshot.portfolios.find((item) => item.id === draft.portfolioId) ?? null;
  const cliente = clientes.find((item) => item.id === draft.portfolioId);
  const cuentas: CuentaCliente[] = cliente?.accounts ?? [];

  const plan = buildPlan(draft, portfolio, cuentas, snapshot);
  const bloqueantes = plan.issues.filter((issue) => issue.blocking);
  if (bloqueantes.length > 0) {
    return Response.json(
      {
        error: "El plan todavía tiene problemas por resolver",
        issues: bloqueantes,
      },
      { status: 422, headers: NO_STORE },
    );
  }

  // Publicar dos veces lo mismo crea dos campañas iguales en cada plataforma, y
  // Windsor no puede borrar ninguna. Pasó de verdad: un plan que se cortó a
  // mitad de camino se volvió a publicar y dejó campañas duplicadas. Si en las
  // últimas 6 horas ya se publicó una campaña con este nombre para este cliente
  // y algo llegó a crearse, se pide confirmar antes de repetirla.
  if (body.duplicar !== true) {
    const previa = await publicacionReciente(draft.portfolioId, draft.name);
    if (previa) {
      return Response.json(
        {
          error:
            "Una campaña con este nombre ya se publicó hace poco y algo quedó creado. Publicarla otra vez la duplica en la plataforma.",
          codigo: "duplicado",
          ...previa,
        },
        { status: 409, headers: NO_STORE },
      );
    }
  }

  if (plan.steps.filter((step) => !step.informativo).length === 0) {
    return fail("El plan no tiene ningún paso que ejecutar", 422);
  }

  const { ok: todoBien, pasos: realizados, ids, campanaIncompleta } = await ejecutarPasosDelPlan(
    plan.steps,
    draft,
    cuentas,
  );

  await registrarEjecucion(draft, session.actor.email, realizados, todoBien);

  // Lo recién creado no tiene ni una impresión, así que solo el catálogo lo
  // conoce — y ese se reconstruía como mucho una vez al día, por eso la
  // campaña publicada no aparecía en Clientes. Se agrega ahora, solo de las
  // cuentas donde algo se creó, con un tope de tiempo para no demorar la
  // respuesta si Windsor tarda.
  const cuentasTocadas = new Map<string, { provider: WindsorProvider; accountId: string }>();
  for (const paso of realizados) {
    if (!paso.ok) continue;
    const proveedor = paso.platform as WindsorProvider;
    const cuenta = cuentaDe({ platform: proveedor }, draft, cuentas);
    if (cuenta) {
      cuentasTocadas.set(`${proveedor}:${cuenta.externalId}`, {
        provider: proveedor,
        accountId: cuenta.externalId,
      });
    }
  }
  let catalogoActualizado = false;
  let campaignIdsVistos: Set<string> = new Set();
  let adsetIdsVistos: Set<string> = new Set();
  let adIdsVistos: Set<string> = new Set();
  if (cuentasTocadas.size > 0) {
    try {
      await Promise.race([
        actualizarCatalogoDeCuentas([...cuentasTocadas.values()]).then((resultado) => {
          catalogoActualizado = true;
          campaignIdsVistos = resultado.campaignIdsVistos;
          adsetIdsVistos = resultado.adsetIdsVistos;
          adIdsVistos = resultado.adIdsVistos;
        }),
        new Promise((resolve) => setTimeout(resolve, 25_000)),
      ]);
    } catch (error) {
      console.error("WiWO.ADS catálogo tras publicar", error);
    }
  }

  // Windsor puede responder "ok" a una creación que después no aparece de
  // verdad en la cuenta — pasó con una campaña de Meta el 2026-09-22,
  // confirmada como creada acá y nunca creada ahí. Releer el catálogo recién
  // actualizado (arriba) es lo único que puede detectarlo, así que cada
  // campaña, conjunto y anuncio creado en este plan se compara contra lo que
  // Windsor acaba de confirmar que existe de verdad — no solo la campaña.
  const campanasSinConfirmar = realizados
    .filter((paso) => paso.action === "create_campaign" && paso.ok)
    .map((paso) => ({ platform: paso.platform, nivel: "campaña", id: idDeCreacion(paso) }))
    .filter(
      (item): item is { platform: string; nivel: string; id: string } =>
        item.id !== null && catalogoActualizado && !campaignIdsVistos.has(item.id),
    );
  const conjuntosSinConfirmar = realizados
    .filter((paso) => paso.action === "create_adset" && paso.ok)
    .map((paso) => ({ platform: paso.platform, nivel: "conjunto", id: idDeCreacion(paso) }))
    .filter(
      (item): item is { platform: string; nivel: string; id: string } =>
        item.id !== null && catalogoActualizado && !adsetIdsVistos.has(item.id),
    );
  const anunciosSinConfirmar = realizados
    .filter((paso) => CAMPOS_DE_ID_ANUNCIO[paso.action] && paso.ok)
    .map((paso) => ({
      platform: paso.platform,
      nivel: "anuncio",
      id: idDeResultado(paso.raw, CAMPOS_DE_ID_ANUNCIO[paso.action]),
    }))
    .filter(
      (item): item is { platform: string; nivel: string; id: string } =>
        item.id !== null && catalogoActualizado && !adIdsVistos.has(item.id),
    );
  const sinConfirmar = [...campanasSinConfirmar, ...conjuntosSinConfirmar, ...anunciosSinConfirmar];

  let aviso: string;
  if (!todoBien) {
    aviso = "Se detuvo en el primer error. Los pasos marcados como correctos sí se crearon.";
    if (campanaIncompleta) {
      aviso += campanaIncompleta.marcada
        ? ` La campaña de ${campanaIncompleta.platform === "google" ? "Google" : "Meta"} que alcanzó a crearse quedó renombrada como "${PREFIJO_INCOMPLETA}${campanaIncompleta.nombreOriginal}" en la cuenta real, para que no se confunda con una intencional.`
        : ` La campaña de ${campanaIncompleta.platform === "google" ? "Google" : "Meta"} que alcanzó a crearse (id ${campanaIncompleta.campaignId}) quedó huérfana y no se pudo renombrar para marcarla — revísala a mano en la cuenta.`;
    }
  } else if (sinConfirmar.length > 0) {
    aviso = `Windsor confirmó la creación, pero al releer la cuenta real todavía no encontramos: ${sinConfirmar
      .map((c) => `${c.platform === "google" ? "Google" : "Meta"} ${c.nivel} (id ${c.id})`)
      .join(", ")}. Puede ser solo demora en reflejarse — revisa directamente en la plataforma antes de darlo por creado.`;
  } else {
    aviso = "Creado y pausado. Revísalo en la plataforma y actívalo ahí cuando quieras que empiece a entregar.";
  }

  return Response.json(
    {
      ok: todoBien,
      steps: realizados,
      ids,
      catalogoActualizado,
      campanasSinConfirmar: sinConfirmar,
      campanaIncompleta,
      aviso,
    },
    { status: todoBien ? 200 : 502, headers: NO_STORE },
  );
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
