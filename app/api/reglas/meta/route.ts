import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { registrarAuditoria } from "@/lib/auditoria";
import { registrarEjecucion, type PasoEjecutado } from "@/lib/constructor-ejecutar";
import { copiarReglaMetaParaAnuncio, crearReglaMetaDeGasto, eliminarReglaMetaDePrueba, ErrorDeMeta, metaNativoConfigurado } from "@/lib/meta-nativo";
import { mismoOrigen } from "@/lib/origen-publico";
import { can, enAlcance } from "@/lib/permisos";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";

/**
 * Reglas DENTRO de Meta (las evalúa Meta, no este servidor). Solo supervisores y administradores.
 *  - `{ modo: "gasto", ... }`: regla nueva «si un anuncio de la lista gasta más de X en total, pausarlo».
 *  - `{ modo: "copiar", reglaId, ... }`: copia de una regla existente para otros anuncios (la original no se toca).
 *  - DELETE: solo reglas de PRUEBA (su nombre lleva el prefijo).
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

type Cuerpo = { modo?: string; clienteId?: string; accountId?: string; nombre?: string; anuncioIds?: string[]; gasto?: number; reglaId?: string };

async function verificar(request: Request, clienteId: string | undefined, accountId: string) {
  const session = await getSession();
  if (!session) return { error: fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION) };
  if (!can(session.actor, "aprobar_cambios")) return { error: fail("Solo un supervisor o administrador.", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE) };
  if (!mismoOrigen(request)) return { error: fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO) };
  if (!metaNativoConfigurado()) return { error: fail("La conexión directa con Meta todavía no está configurada.", 503) };
  if (!clienteId || !accountId) return { error: fail("Faltan datos.", 400) };
  if (!enAlcance(session.actor, clienteId)) return { error: fail("Ese cliente no está en tu alcance", 403) };
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio || duenio.id !== clienteId) return { error: fail("Esa cuenta no pertenece a este cliente", 403) };
  return { session };
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as Cuerpo;
  const accountId = (b.accountId ?? "").trim();
  const v = await verificar(request, b.clienteId, accountId);
  if (v.error) return v.error;
  const anuncioIds = (b.anuncioIds ?? []).filter((x) => /^\d+$/.test(x));
  if (anuncioIds.length === 0 || anuncioIds.length > 50) return fail("Elige entre 1 y 50 anuncios.", 400);
  const nombre = (b.nombre ?? "").trim();
  if (!nombre) return fail("Falta el nombre de la regla.", 400);
  try {
    let id: string;
    if (b.modo === "copiar") {
      if (!b.reglaId || !/^\d+$/.test(b.reglaId)) return fail("Falta la regla a copiar.", 400);
      id = await copiarReglaMetaParaAnuncio(accountId, b.reglaId, anuncioIds, nombre);
    } else if (b.modo === "gasto") {
      id = await crearReglaMetaDeGasto(accountId, { nombre, anuncioIds, gasto: Number(b.gasto) });
    } else {
      return fail("Modo no reconocido.", 400);
    }
    const paso = { platform: "meta", action: b.modo === "copiar" ? "rules:copy_native" : "rules:create_native", label: nombre, ok: true, error: null, raw: { reglaId: id, anuncioIds } } as PasoEjecutado;
    await registrarEjecucion({ portfolioId: b.clienteId!, name: `Regla en Meta · ${nombre}`, platforms: ["meta"] }, v.session!.actor.email, [paso], true);
    await registrarAuditoria({
      categoria: "regla",
      accion: b.modo === "copiar" ? "copiada_en_meta" : "creada_en_meta",
      actorEmail: v.session!.actor.email,
      portfolioId: b.clienteId!,
      plataforma: "meta",
      entidadTipo: "regla",
      entidadId: id,
      entidadNombre: nombre,
      titulo: `${v.session!.actor.email.split("@")[0]} creó en Meta la regla «${nombre}» para ${anuncioIds.length} anuncio${anuncioIds.length === 1 ? "" : "s"}`,
      detalle: { reglaId: id, modo: b.modo, anuncioIds, gasto: b.gasto ?? null, copiaDe: b.reglaId ?? null },
    });
    return Response.json({ ok: true, reglaId: id }, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (error instanceof ErrorDeMeta) return fail(error.message, error.status);
    if (error instanceof Error && /moneda|gasto máximo|al menos un anuncio/.test(error.message)) return fail(error.message, 422);
    console.error("WiWO.ADS regla en Meta", error);
    return fail("No se pudo crear la regla en Meta", 500);
  }
}

export async function DELETE(request: Request) {
  const b = (await request.json().catch(() => ({}))) as Cuerpo;
  const accountId = (b.accountId ?? "").trim();
  const v = await verificar(request, b.clienteId, accountId);
  if (v.error) return v.error;
  if (!b.reglaId) return fail("Falta la regla.", 400);
  try {
    await eliminarReglaMetaDePrueba(b.reglaId);
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ErrorDeMeta) return fail(error.message, error.status);
    return fail("No se pudo borrar la regla", 500);
  }
}
