import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { mismoOrigen } from "@/lib/origen-publico";
import { registrarAuditoria } from "@/lib/auditoria";
import { registrarEjecucion } from "@/lib/constructor-ejecutar";
import { nombreDeEdicion, pasoDeEdicion } from "@/lib/edicion-registro";
import { can, enAlcance } from "@/lib/permisos";
import { ACCION, valoresDeParametros, type Nivel } from "@/lib/acciones-estado";
import { puedeAdministrar } from "@/lib/plataformas";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";
import { estadoDeEntidadMeta, metaNativoConfigurado } from "@/lib/meta-nativo";
import { executeWindsorAction } from "@/lib/windsor";

/**
 * Pausa o activa una campaña, un conjunto o un anuncio ya existente.
 *
 * A diferencia del constructor, esto no crea nada: cambia el estado de algo
 * que ya está en la plataforma. Es reversible en el sentido más literal — la
 * acción contraria deshace exactamente esto — pero sigue siendo una escritura
 * real, así que exige la misma capacidad que publicar (`aprobar_cambios`).
 *
 * Las acciones y sus parámetros son las que expone Windsor
 * (`list_actions` sobre `facebook` y `google_ads`, verificado el 10-09-2026):
 * Google separa campaña, grupo de anuncios y anuncio con `enable_*`/`pause_*`
 * propios; Meta hace lo mismo con campaña, conjunto y anuncio.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!can(session.actor, "aprobar_cambios")) {
    return fail("Tu rol no puede pausar ni activar anuncios", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  }

  if (!mismoOrigen(request)) {
    return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415, CODIGOS_ERROR.CONTENT_TYPE_INVALIDO);
  }

  const body = (await request.json()) as {
    provider?: string;
    nivel?: string;
    accountId?: string;
    campaignId?: string | null;
    adsetId?: string | null;
    adId?: string | null;
    activar?: boolean;
  };

  const provider = body.provider ?? "";
  if (!puedeAdministrar(provider)) {
    return fail("Plataforma no reconocida o todavía no activa", 400);
  }
  const nivel = body.nivel as Nivel;
  if (!["campana", "conjunto", "anuncio"].includes(nivel)) {
    return fail("Nivel no reconocido", 400);
  }
  if (!body.accountId) return fail("Falta la cuenta", 400);

  const receta = ACCION[provider][nivel];
  const action = body.activar ? receta.enable : receta.pause;
  if (!action) {
    return fail(`${provider} todavía no tiene esta acción disponible`, 400);
  }

  const valores = valoresDeParametros(provider, body);
  const params: Record<string, unknown> = {};
  for (const clave of receta.params) {
    const valor = valores[clave];
    if (!valor) {
      return fail(
        `Falta el identificador (${clave}) para ${nivel === "campana" ? "la campaña" : nivel === "conjunto" ? "el conjunto" : "el anuncio"}`,
        400,
      );
    }
    params[clave] = valor;
  }

  // Ver el mismo control en `/api/anuncios/gestionar`: hoy no bloquea a nadie,
  // pero el `accountId` lo manda el navegador y no se le puede creer solo.
  const portafolio = (await accountIndex()).get(normalizeAccountId(body.accountId));
  if (!portafolio) return fail("Esa cuenta no pertenece a ningún cliente", 403);
  if (!enAlcance(session.actor, portafolio.id)) {
    return fail("Ese cliente no está en tu alcance", 403);
  }

  // Meta: se mira cómo está de verdad antes y después. Si ya estaba como se pide, no se escribe nada; si no, se confirma.
  const idMeta = provider === "meta" && metaNativoConfigurado() ? String(Object.values(params)[Object.values(params).length - 1] ?? "") : "";
  const buscado = body.activar ? "ACTIVE" : "PAUSED";
  const leer = async () => {
    try {
      return idMeta ? await estadoDeEntidadMeta(idMeta) : null;
    } catch {
      return null;
    }
  };
  const antes = await leer();
  if (antes?.status === buscado) {
    return Response.json({ ok: true, sinCambios: true, estado: antes.status, efectivo: antes.efectivo }, { headers: NO_STORE });
  }

  const resultado = await executeWindsorAction(
    provider,
    body.accountId,
    action,
    params,
  );
  await registrarEjecucion(
    {
      portfolioId: portafolio.id,
      name: nombreDeEdicion(action, params),
      platforms: [provider],
    },
    session.actor.email,
    [pasoDeEdicion(provider, action, params, resultado, body.accountId)],
    resultado.ok,
  );

  await registrarAuditoria({
    categoria: "cambio",
    accion: resultado.ok ? "aplicado" : "fallido",
    actorEmail: session.actor.email,
    portfolioId: portafolio.id,
    portfolioNombre: portafolio.name,
    plataforma: provider,
    entidadTipo: nivel,
    entidadId: String(Object.values(params)[Object.values(params).length - 1] ?? ""),
    titulo: `${session.actor.email.split("@")[0]} ${body.activar ? "activó" : "pausó"} ${nivel === "campana" ? "una campaña" : nivel === "conjunto" ? "un conjunto" : "un anuncio"} (${nombreDeEdicion(action, params)})${resultado.ok ? "" : " (falló)"}`,
    resultado: resultado.ok ? "ok" : "error",
    etiquetas: ["estado"],
    detalle: { accion: action, parametros: params, error: resultado.ok ? null : resultado.error },
  });

  if (!resultado.ok) {
    return Response.json(
      { ok: false, error: resultado.error },
      { status: 502, headers: NO_STORE },
    );
  }
  const despues = await leer();
  return Response.json(
    { ok: true, sinCambios: false, verificado: despues ? despues.status === buscado : null, estado: despues?.status ?? null, efectivo: despues?.efectivo ?? null },
    { headers: NO_STORE },
  );
}

