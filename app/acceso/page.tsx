import { env } from "cloudflare:workers";

import { ThinkingOrb } from "@/app/ui";
import { mensajeDeError } from "@/lib/acceso-errores";

import { BotonGoogle } from "./boton-google";

export const dynamic = "force-dynamic";

/**
 * Puerta de entrada única: Google con el dominio de la empresa. No hay
 * camino alterno a propósito — un formulario de "escribe tu correo" deja
 * entrar sin probar identidad, y con una sola puerta el permiso se decide
 * en un solo lugar.
 *
 * El orbe manda la composición: es lo primero que se ve y lo que dice, sin
 * texto, que del otro lado hay algo vivo. Por eso la pantalla es un
 * degradado azul de marca y no el gris del resto de la app — el orbe se
 * mezcla en pantalla y necesita fondo oscuro y saturado para no apagarse.
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
    <main className="relative min-h-svh overflow-hidden bg-[#1b1b3a] text-[#F8FAD7]">
      {/* Degradado de marca: arranca casi negro arriba a la izquierda y se
          abre a violeta hacia la esquina opuesta, para que el orbe quede
          recortado contra la zona más oscura. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,#121225_0%,#2a24a8_38%,#4242FF_66%,#7b6dff_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_38%,rgba(0,0,0,0.55),transparent_58%)]"
      />

      <div className="relative mx-auto grid min-h-svh w-full max-w-[1320px] items-center gap-12 px-6 py-16 sm:px-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-20 lg:px-16 xl:px-24">
        {/* ── Identidad ─────────────────────────────────────────────── */}
        <section className="flex flex-col items-start gap-8">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo, el proyecto todavía no usa next/image en ningún lado */}
          <img
            src="/wiwo-ads-electric.png"
            alt="WiWO.ADS"
            className="h-9 w-44 object-contain object-left"
          />

          <ThinkingOrb size="xl" state="thinking" label="" bare />

          <div>
            <h1 className="max-w-[14ch] text-4xl leading-[1.05] font-extrabold tracking-[-0.04em] text-balance sm:text-5xl">
              Sistema operativo de paid media
            </h1>
            <p className="mt-4 max-w-[46ch] text-base leading-7 text-[#F8FAD7]/70">
              El equipo de MGC Global Group y WiWO gestiona campañas de Meta
              Ads y Google Ads, sigue el pacing y la salud de medición de sus
              clientes, todo en un solo lugar.
            </p>
          </div>

          <ul className="flex flex-wrap gap-2 text-xs font-semibold text-[#F8FAD7]/80">
            {["Meta Ads", "Google Ads", "Pacing", "Salud de medición"].map(
              (tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-[#F8FAD7]/16 bg-[#F8FAD7]/[0.06] px-3 py-1.5"
                >
                  {tag}
                </li>
              ),
            )}
          </ul>
        </section>

        {/* ── Acceso ────────────────────────────────────────────────── */}
        <section className="w-full justify-self-center lg:justify-self-end">
          <div className="w-full max-w-md rounded-[28px] border border-[#F8FAD7]/14 bg-[#F8FAD7]/[0.08] p-8 shadow-[0_28px_80px_rgba(12,12,40,0.42)] backdrop-blur-xl">
            <h2 className="text-3xl font-extrabold tracking-[-0.03em]">
              Acceso del equipo
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#F8FAD7]/72">
              Entrá con la cuenta de Google con la que trabajamos.
            </p>

            {params.cerrada === "1" && !error && (
              <p className="mt-5 rounded-xl border border-[#3BFF00]/30 bg-[#3BFF00]/[0.10] px-4 py-3 text-sm leading-6 text-[#F8FAD7]/82">
                Sesión cerrada.
              </p>
            )}

            {error && (
              <p
                className="mt-5 rounded-xl border border-danger-deep/30 bg-danger-deep/12 px-4 py-3 text-sm leading-6 text-danger"
                role="alert"
              >
                {error}
              </p>
            )}

            <BotonGoogle returnTo={returnTo} listo={googleListo} />

            {!googleListo ? (
              <p className="mt-3 rounded-xl border border-[#F8FAD7]/16 bg-[#121225]/35 px-4 py-3 text-xs leading-5 text-[#F8FAD7]/62">
                El acceso todavía no está habilitado: falta cargar{" "}
                <code className="text-[#3BFF00]">GOOGLE_CLIENT_ID</code> y{" "}
                <code className="text-[#3BFF00]">GOOGLE_CLIENT_SECRET</code>.
                Pídeselas a alguien del equipo que ya tenga acceso.
              </p>
            ) : (
              <p className="mt-4 text-xs leading-5 text-[#F8FAD7]/50">
                Solo cuentas autorizadas pueden ingresar. Si no entrás, pedí
                acceso al equipo.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
