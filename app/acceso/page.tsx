import { env } from "cloudflare:workers";

import { devLoginEnabled } from "@/app/chatgpt-auth";
import { mensajeDeError } from "@/lib/acceso-errores";

import { BotonGoogle } from "./boton-google";

export const dynamic = "force-dynamic";

/**
 * Puerta de entrada siempre disponible, con Google como único camino real —
 * el formulario de correo sin verificar de más abajo solo aparece con
 * DEV_LOGIN_ENABLED, para desarrollo local.
 */
export default async function AccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string; error?: string; cerrada?: string }>;
}) {
  const params = await searchParams;
  const error = mensajeDeError(params.error);
  const returnTo = params.return_to ?? "/";
  const googleListo = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return (
    <main className="grid min-h-svh place-items-center bg-[#292929] px-6 text-[#F8FAD7]">
      <section className="w-full max-w-md rounded-[28px] border border-[#F8FAD7]/10 bg-[#323330]/70 p-8 shadow-[0_24px_70px_rgba(74,67,255,0.16)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo, el proyecto todavía no usa next/image en ningún lado */}
        <img
          src="/wiwo-ads-electric.png"
          alt="WiWO.ADS"
          className="h-10 w-48 object-contain object-left"
        />
        <p className="font-micro mt-8 text-[0.65rem] text-[#4242FF]">
          ACCESO
        </p>
        <h1 className="mt-3 text-4xl font-extrabold leading-none tracking-[-0.04em]">
          Inicia sesión
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#F8FAD7]/62">
          Entra con la cuenta autorizada del equipo.
        </p>

        {params.cerrada === "1" && !error && (
          <p className="mt-5 rounded-xl border border-[#3BFF00]/25 bg-[#3BFF00]/[0.08] px-4 py-3 text-sm leading-6 text-[#F8FAD7]/78">
            Sesión cerrada.
          </p>
        )}

        {error && (
          <p
            className="mt-5 rounded-xl border border-danger-deep/25 bg-danger-deep/8 px-4 py-3 text-sm leading-6 text-danger"
            role="alert"
          >
            {error}
          </p>
        )}

        <BotonGoogle returnTo={returnTo} listo={googleListo} />
        {!googleListo && (
          <p className="mt-2 text-xs leading-5 text-[#F8FAD7]/45">
            Pendiente: falta cargar las credenciales de Google en{" "}
            <code className="text-[#4242FF]">.dev.vars</code>. Mientras tanto,
            usa el correo.
          </p>
        )}

        {devLoginEnabled() && (
          <>
            <div className="my-6 flex items-center gap-3 text-[0.62rem] text-[#F8FAD7]/32">
              <span className="h-px flex-1 bg-[#F8FAD7]/10" />
              O CON TU CORREO (SOLO DESARROLLO)
              <span className="h-px flex-1 bg-[#F8FAD7]/10" />
            </div>

            <form action="/api/acceso" method="post" className="space-y-3">
              <input type="hidden" name="return_to" value={returnTo} />
              <label
                htmlFor="email"
                className="font-micro block text-[0.62rem] text-[#F8FAD7]/55"
              >
                CORREO
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                // A propósito apagado: el navegador puede autocompletar acá
                // un correo distinto al que la persona quiso escribir —y con
                // Google arriba en la misma pantalla, entrar "con el que no
                // era" es fácil de confundir con un bug del login real.
                autoComplete="off"
                placeholder="tu@empresa.com"
                className="h-11 w-full rounded-xl border border-[#F8FAD7]/12 bg-[#292929]/60 px-4 text-sm text-[#F8FAD7] outline-none placeholder:text-[#F8FAD7]/28 focus:border-[#4242FF]"
              />
              <button
                type="submit"
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[#F8FAD7]/12 px-5 text-sm font-bold text-[#F8FAD7]/78 transition-colors hover:border-[#4242FF] hover:text-[#F8FAD7]"
              >
                Entrar
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
