import { getDashboardSnapshot } from "@/lib/dashboard-store";
import { chatGPTSignOutPath } from "./chatgpt-auth";
import { requireSession } from "./sesion";
import WiwoDashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireSession("/");
  const signOutPath = await chatGPTSignOutPath("/");
  if (!session) {
    return (
      <main className="grid min-h-svh place-items-center bg-field px-6 text-foreground">
        <section className="w-full max-w-lg rounded-[28px] border border-foreground/10 bg-card/70 p-8 shadow-[0_24px_70px_rgba(74,67,255,0.16)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo, el proyecto todavía no usa next/image en ningún lado */}
          <img
            src="/wiwo-ads-electric.png"
            alt="WiWO.ADS"
            className="h-10 w-48 object-contain object-left"
          />
          <p className="font-micro mt-8 text-[0.65rem] text-brand">
            ACCESO INTERNO
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-none tracking-[-0.04em]">
            Esta cuenta todavía no pertenece al equipo.
          </h1>
          <p className="mt-5 text-base leading-7 text-foreground/62">
            WiWO.ADS contiene información operativa de clientes. Pide a un
            administrador que te dé de alta y te asigne un rol antes de volver
            a entrar.
          </p>
          <a
            href={signOutPath}
            className="mt-7 inline-flex h-11 items-center rounded-xl bg-[#3BFF00] px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/85"
          >
            Salir y usar otra cuenta
          </a>
        </section>
      </main>
    );
  }
  const params = await searchParams;
  const initialSnapshot = await getDashboardSnapshot(session.actor);

  return (
    <WiwoDashboard
      signOutPath={signOutPath}
      initialSnapshot={initialSnapshot}
      initialView={params.view === "integrations" ? "integrations" : "control"}
    />
  );
}
