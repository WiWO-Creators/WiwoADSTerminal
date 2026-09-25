import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidad — WiWO.ADS",
};

/**
 * Página pública (sin login) requerida por Google para publicar el
 * proyecto de OAuth como "Externo / En producción". WiWO.ADS es una
 * herramienta interna: no hay usuarios finales fuera del equipo de
 * MGC Global Group y WiWO, así que el alcance real de esta política es
 * acotado a propósito.
 */
export default function PoliticaDePrivacidadPage() {
  return (
    <main className="mx-auto min-h-svh max-w-[720px] px-6 py-16 text-foreground sm:px-10">
      <p className="text-sm text-muted-foreground">WiWO.ADS</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">
        Política de privacidad
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última actualización: septiembre de 2026.
      </p>

      <div className="mt-10 space-y-8 text-sm leading-7 text-foreground/85">
        <section>
          <h2 className="text-base font-semibold text-foreground">
            Qué es WiWO.ADS
          </h2>
          <p className="mt-2">
            WiWO.ADS es una herramienta interna de uso exclusivo del equipo de{" "}
            <strong>MGC Global Group</strong> y <strong>WiWO</strong> para
            operar y monitorear campañas de paid media (Meta Ads, Google Ads y
            otras plataformas conectadas). No está dirigida al público general
            ni a clientes finales: solo la usan personas del equipo con una
            cuenta de correo corporativa autorizada.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            Qué datos recogemos al iniciar sesión
          </h2>
          <p className="mt-2">
            El inicio de sesión se hace exclusivamente con Google. Al
            autenticarte, pedimos únicamente tu nombre, tu dirección de
            correo electrónico y tu foto de perfil de Google (scopes{" "}
            <code>openid</code>, <code>email</code> y <code>profile</code>).
            Usamos esos datos para identificarte dentro de la aplicación y
            decidir a qué información tienes permiso de acceder. No pedimos
            acceso a tu correo, tu calendario, tus archivos ni a ningún otro
            dato de tu cuenta de Google.
          </p>
          <p className="mt-2">
            Solo pueden acceder cuentas de los dominios{" "}
            <code>@mgcglobalgroup.com</code> y <code>@wiwo.me</code>, y
            únicamente si esa persona fue invitada previamente por un
            administrador de la plataforma.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            Qué otros datos maneja la plataforma
          </h2>
          <p className="mt-2">
            Además de tu identidad, WiWO.ADS almacena y muestra datos de las
            cuentas publicitarias que el equipo conecta (Meta Ads, Google Ads,
            y otras plataformas vía Windsor.ai): métricas de campañas,
            configuración de anuncios, píxeles y creativos. Esa información
            pertenece a las cuentas publicitarias de los clientes de la
            agencia y se usa exclusivamente para operar y reportar sus
            campañas.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            Con quién compartimos datos
          </h2>
          <p className="mt-2">
            No vendemos ni compartimos tus datos personales con terceros. Los
            únicos servicios externos involucrados son los estrictamente
            necesarios para operar la plataforma (por ejemplo, Google para el
            login, y las plataformas publicitarias conectadas por el propio
            equipo).
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            Contacto
          </h2>
          <p className="mt-2">
            Si tienes preguntas sobre esta política o quieres que eliminemos
            tus datos de la plataforma, escríbenos a{" "}
            <a
              href="mailto:aveas@mgcglobalgroup.com"
              className="text-brand underline underline-offset-2"
            >
              aveas@mgcglobalgroup.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
