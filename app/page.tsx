import { getDashboardSnapshot } from "@/lib/dashboard-store";
import {
  chatGPTSignOutPath,
  isAuthorizedChatGPTUser,
  requireChatGPTUser,
} from "./chatgpt-auth";
import WiwoDashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const identity = await requireChatGPTUser("/");
  if (!isAuthorizedChatGPTUser(identity)) {
    return (
      <main className="grid min-h-svh place-items-center bg-[#080808] px-6 text-[#F5F3FF]">
        <section className="w-full max-w-lg rounded-[28px] border border-[#F5F3FF]/10 bg-[#16161d]/70 p-8 shadow-[0_24px_70px_rgba(74,67,255,0.16)]">
          <img
            src="/wiwo-ads-electric.png"
            alt="WiWO.ADS"
            className="h-10 w-48 object-contain object-left"
          />
          <p className="font-micro mt-8 text-[0.65rem] text-[#4A43FF]">
            ACCESO INTERNO
          </p>
          <h1 className="font-editorial mt-3 text-4xl leading-none tracking-[-0.04em]">
            Esta cuenta todavía no pertenece al equipo autorizado.
          </h1>
          <p className="mt-5 text-base leading-7 text-[#F5F3FF]/62">
            WiWO.ADS contiene información operativa de CCKK Networks. Pide al
            administrador que agregue tu correo antes de volver a entrar.
          </p>
          <a
            href={chatGPTSignOutPath("/")}
            className="mt-7 inline-flex h-11 items-center rounded-xl bg-[#42FF00] px-5 text-sm font-bold text-[#080808] transition-colors hover:bg-[#4A43FF] hover:text-white"
          >
            Salir y usar otra cuenta
          </a>
        </section>
      </main>
    );
  }
  const params = await searchParams;
  const initialSnapshot = await getDashboardSnapshot(identity);

  return (
    <WiwoDashboard
      initialSnapshot={initialSnapshot}
      initialView={params.view === "integrations" ? "integrations" : "decisions"}
    />
  );
}
