import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Condiciones del servicio — WiWO.ADS",
};

/**
 * Página pública (sin login), hermana de /privacidad: Google también la
 * pide para publicar el proyecto de OAuth como "Externo / En producción".
 */
export default function CondicionesDelServicioPage() {
  return (
    <main className="mx-auto min-h-svh max-w-[720px] px-6 py-16 text-foreground sm:px-10">
      <p className="text-sm text-muted-foreground">WiWO.ADS</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">
        Condiciones del servicio
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última actualización: septiembre de 2026.
      </p>

      <div className="mt-10 space-y-8 text-sm leading-7 text-foreground/85">
        <section>
          <h2 className="text-base font-semibold text-foreground">
            Alcance
          </h2>
          <p className="mt-2">
            WiWO.ADS es una herramienta interna de uso exclusivo del equipo de{" "}
            <strong>MGC Global Group</strong> y <strong>WiWO</strong> para
            operar campañas de paid media. No es un servicio público ni está
            disponible para el público general: el acceso está restringido a
            personas invitadas por un administrador de la plataforma, con una
            cuenta de correo de los dominios <code>@mgcglobalgroup.com</code>{" "}
            o <code>@wiwo.me</code>.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            Uso de la cuenta
          </h2>
          <p className="mt-2">
            Cada persona es responsable de las acciones que realiza dentro de
            la plataforma con su propia sesión, incluyendo cambios en
            campañas, presupuestos, creativos y configuraciones conectadas a
            las cuentas publicitarias del equipo (Meta Ads, Google Ads y otras
            plataformas). El acceso puede revocarse en cualquier momento por
            un administrador.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            Disponibilidad y cambios
          </h2>
          <p className="mt-2">
            WiWO.ADS es una herramienta en desarrollo continuo: sus
            funciones, interfaz y disponibilidad pueden cambiar sin aviso
            previo, ya que se actualiza según las necesidades operativas del
            equipo.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            Contacto
          </h2>
          <p className="mt-2">
            Preguntas sobre estas condiciones:{" "}
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
