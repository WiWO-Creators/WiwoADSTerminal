import { COOKIE_VER_COMO, getSessionReal } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { actorDeMiembro } from "@/lib/equipo";
import { etiquetaDeCargo, nivelDeCargo } from "@/lib/jerarquia-pura";
import { getRawDb } from "@/db";
import { mismoOrigen } from "@/lib/origen-publico";

export const dynamic = "force-dynamic";

/**
 * «Ver como»: un administrador ve la app tal como la ve otra persona del equipo. Es SOLO LECTURA: mientras está activo, el
 * servidor rechaza cualquier cambio (ver `worker/index.ts`). Se decide con la sesión REAL, no con la del «Ver como».
 */
async function soloAdmin() {
  const real = await getSessionReal();
  if (!real) return { error: fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION) };
  if (real.actor.role !== "admin") return { error: fail("Solo un administrador puede ver la app como otra persona.", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE) };
  return { real };
}

export async function GET(request: Request) {
  const r = await soloAdmin();
  if (r.error) return r.error;
  const filas = await getRawDb()
    .prepare("SELECT email, display_name, role, cargo FROM users WHERE is_active = 1 ORDER BY email COLLATE NOCASE")
    .all<{ email: string; display_name: string; role: string; cargo: string | null }>();
  const miembros = (filas.results ?? [])
    .filter((m) => m.email.toLowerCase() !== r.real.actor.email)
    .map((m) => ({ email: m.email, nombre: m.display_name, cargo: etiquetaDeCargo(m.role, m.cargo), nivel: nivelDeCargo(m.cargo) }))
    .sort((a, b) => b.nivel - a.nivel || a.email.localeCompare(b.email));
  const actual = /(?:^|;\s*)wiwo_ver_como=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1] ?? null;
  return Response.json({ miembros, actual: actual ? decodeURIComponent(actual) : null }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  const r = await soloAdmin();
  if (r.error) return r.error;
  const { email } = (await request.json().catch(() => ({}))) as { email?: string | null };
  const seguro = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  if (!email) {
    return new Response(JSON.stringify({ ok: true, actual: null }), {
      headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": `${COOKIE_VER_COMO}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${seguro}` },
    });
  }
  const objetivo = await actorDeMiembro(email);
  if (!objetivo) return fail("Esa persona no está activa en el equipo.", 404);
  return new Response(JSON.stringify({ ok: true, actual: objetivo.actor.email }), {
    headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": `${COOKIE_VER_COMO}=${encodeURIComponent(objetivo.actor.email)}; Path=/; HttpOnly; SameSite=Lax${seguro}` },
  });
}
