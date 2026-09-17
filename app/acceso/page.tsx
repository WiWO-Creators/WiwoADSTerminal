import { env } from "cloudflare:workers";

import { devLoginEnabled } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

const ERRORES: Record<string, string> = {
  vacio: "Escribe tu correo para continuar.",
  invalido: "Ese correo no tiene un formato válido.",
  google_no_configurado:
    "Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.",
  google_cancelado: "Cancelaste el inicio de sesión con Google.",
  google_estado_invalido:
    "La vuelta desde Google no se pudo verificar. Inténtalo otra vez.",
  google_token_rechazado: "Google rechazó la credencial. Revisa el secreto.",
  google_perfil_rechazado: "No pudimos leer tu perfil de Google.",
  google_sin_correo: "Esa cuenta de Google no expone un correo verificado.",
  google_dominio_no_permitido:
    "Esta app es solo para el equipo — entra con tu correo @mgcglobalgroup.com.",
  google_falla_red: "No pudimos hablar con Google. Revisa la conexión.",
};

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
  const error = params.error ? ERRORES[params.error] : null;
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

        <a
          href={`/api/acceso/google?return_to=${encodeURIComponent(returnTo)}`}
          aria-disabled={!googleListo}
          className={
            googleListo
              ? "mt-6 inline-flex h-11 w-full items-center justify-center gap-3 rounded-xl bg-[#F8FAD7] px-5 text-sm font-bold text-[#292929] transition-colors hover:bg-[#3BFF00]"
              : "mt-6 inline-flex h-11 w-full cursor-not-allowed items-center justify-center gap-3 rounded-xl bg-[#F8FAD7]/12 px-5 text-sm font-bold text-[#F8FAD7]/38"
          }
        >
          <GoogleMark />
          Continuar con Google
        </a>
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
                autoComplete="email"
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

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.93v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.93a9 9 0 0 0 0 8.1l3.04-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .93 4.95l3.04 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
