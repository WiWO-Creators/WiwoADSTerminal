import { getSession } from "@/app/sesion";
import { detalleClientes } from "@/lib/clientes-detalle";
import { mismoOrigen } from "@/lib/origen-publico";
import { can } from "@/lib/permisos";
import {
  addAccountPixel,
  createPortfolio,
  PortafolioError,
  removeAccountPixel,
  setAccountCountries,
  setAccountPageId,
  updatePortfolio,
} from "@/lib/portafolios-store";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET() {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);

  try {
    const { clientes, sueltas } = await detalleClientes(
      session.actor,
      new Date(),
    );
    return Response.json(
      {
        portfolios: clientes,
        unassigned: sueltas,
        canManage: can(session.actor, "crear_campanas"),
        // Pausar o activar algo ya existente es una escritura real, igual que
        // publicar desde el constructor: exige la misma capacidad.
        canApprove: can(session.actor, "aprobar_cambios"),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  const guard = guardMutation(request);
  if (guard) return guard;

  try {
    const body = await request.json();
    const id = await createPortfolio(session.actor, body);
    return Response.json({ ok: true, id }, { headers: NO_STORE });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  const guard = guardMutation(request);
  if (guard) return guard;

  try {
    const body = (await request.json()) as {
      id?: string;
      accountPageId?: { externalId?: string; pageId?: string | null };
      accountPixelAdd?: { externalId?: string; pixelId?: string; label?: string | null };
      accountPixelRemove?: { externalId?: string; pixelRowId?: string };
      accountCountries?: { externalId?: string; countries?: string[] };
    } & Record<string, unknown>;
    if (!body.id) throw new PortafolioError("Falta identificar al cliente");
    const { id, accountPageId, accountPixelAdd, accountPixelRemove, accountCountries, ...cambios } = body;

    // Rutas aparte: la página, los píxeles y los países viven por cuenta, no
    // en las columnas sueltas de `portfolios` que actualiza updatePortfolio.
    if (accountPageId) {
      if (!accountPageId.externalId) {
        throw new PortafolioError("Falta identificar la cuenta");
      }
      await setAccountPageId(
        session.actor,
        id,
        accountPageId.externalId,
        accountPageId.pageId ?? null,
      );
    }
    if (accountPixelAdd) {
      if (!accountPixelAdd.externalId || !accountPixelAdd.pixelId) {
        throw new PortafolioError("Falta identificar la cuenta o el píxel");
      }
      await addAccountPixel(
        session.actor,
        id,
        accountPixelAdd.externalId,
        accountPixelAdd.pixelId,
        accountPixelAdd.label ?? null,
      );
    }
    if (accountPixelRemove) {
      if (!accountPixelRemove.externalId || !accountPixelRemove.pixelRowId) {
        throw new PortafolioError("Falta identificar la cuenta o el píxel");
      }
      await removeAccountPixel(
        session.actor,
        id,
        accountPixelRemove.externalId,
        accountPixelRemove.pixelRowId,
      );
    }
    if (accountCountries) {
      if (!accountCountries.externalId) {
        throw new PortafolioError("Falta identificar la cuenta");
      }
      await setAccountCountries(
        session.actor,
        id,
        accountCountries.externalId,
        Array.isArray(accountCountries.countries)
          ? accountCountries.countries
          : [],
      );
    }

    if (Object.keys(cambios).length > 0) {
      await updatePortfolio(session.actor, id, cambios);
    }
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    return fromError(error);
  }
}

function guardMutation(request: Request) {
  if (!mismoOrigen(request)) {
    return fail("Origen no permitido", 403);
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415);
  }
  return null;
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

function fromError(error: unknown) {
  const status = error instanceof PortafolioError ? error.status : 500;
  const message =
    error instanceof PortafolioError
      ? error.message
      : "No pudimos completar la acción";
  if (status === 500) console.error("WiWO.ADS clientes", error);
  return fail(message, status);
}
