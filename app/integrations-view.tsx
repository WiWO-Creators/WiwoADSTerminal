"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  DatabaseZap,
  ExternalLink,
  Link2,
  LogOut,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  IntegrationAccount,
  IntegrationProvider,
  IntegrationSummary,
} from "@/lib/integration-store";
import { Surface } from "./ui";

type WindsorAccount = { name: string; currency: string | null };

type WindsorStatus = {
  configured: boolean;
  accountCount?: number;
  google?: number;
  meta?: number;
  accounts?: { google: WindsorAccount[]; meta: WindsorAccount[] };
  lastSyncedAt?: number | null;
  dataThrough?: string | null;
};

type IntegrationsResponse = {
  integrations?: IntegrationSummary[];
  canManage?: boolean;
  windsor?: WindsorStatus;
  error?: string;
};

type BusyAction = {
  provider: IntegrationProvider;
  action: BusyKind;
} | null;

type BusyKind = "sync" | "select" | "disconnect";

const errorMessages: Record<string, string> = {
  authorization_cancelled: "La autorización fue cancelada. No se hizo ningún cambio.",
  callback_failed: "La plataforma no pudo completar la conexión. Intenta nuevamente.",
  not_allowed: "Tu usuario no tiene permiso para administrar conexiones.",
  not_configured: "Esta conexión todavía se está habilitando.",
  provider_not_supported: "La plataforma seleccionada no está disponible.",
  signin_required: "Inicia sesión para conectar una cuenta.",
  start_failed: "No pudimos abrir la autorización. Intenta nuevamente.",
};

export function IntegrationsView({
  currentUser,
  signOutPath,
  onPerformanceUpdated,
}: {
  currentUser: { email: string; displayName: string };
  signOutPath: string;
  onPerformanceUpdated?: () => void;
}) {
  const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [windsor, setWindsor] = useState<WindsorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [manageProvider, setManageProvider] =
    useState<IntegrationProvider | null>(null);
  const [disconnectProvider, setDisconnectProvider] =
    useState<IntegrationProvider | null>(null);
  const [query, setQuery] = useState("");
  const [draftSelection, setDraftSelection] = useState<string[]>([]);

  const managedIntegration = integrations.find(
    (integration) => integration.provider === manageProvider,
  );
  const disconnectedIntegration = integrations.find(
    (integration) => integration.provider === disconnectProvider,
  );
  const connectedCount = integrations.filter(
    (integration) => integration.status !== "not_connected",
  ).length;
  const selectedCount = integrations.reduce(
    (total, integration) => total + integration.selectedCount,
    0,
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch("/api/integrations", {
          headers: { accept: "application/json" },
        });
        const body = (await response.json()) as IntegrationsResponse;
        if (!response.ok || !body.integrations) {
          throw new Error(body.error ?? "No pudimos cargar las conexiones");
        }
        if (cancelled) return;
        setIntegrations(body.integrations);
        setCanManage(Boolean(body.canManage));
        setWindsor(body.windsor ?? null);

        const params = new URLSearchParams(window.location.search);
        const connected = params.get("connected") as IntegrationProvider | null;
        const error = params.get("error");
        if (connected === "google" || connected === "meta") {
          const item = body.integrations.find(
            (integration) => integration.provider === connected,
          );
          toast.success(`${item?.label ?? "La cuenta"} quedó conectada`, {
            description: "Ahora elige las cuentas que WiWO debe monitorear.",
          });
          if (item?.accounts.length) {
            setManageProvider(item.provider);
            setDraftSelection(
              item.accounts
                .filter(
                  (account) => account.selected && isAccountEligible(account),
                )
                .map((account) => account.id),
            );
            setQuery("");
          }
        } else if (error) {
          toast.error(errorMessages[error] ?? "No pudimos completar la conexión");
        }
        if (connected || error) {
          window.history.replaceState({}, "", "/?view=integrations");
        }
      } catch (error) {
        if (cancelled) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "No pudimos cargar las conexiones",
        );
        toast.error("No pudimos cargar las conexiones", {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadVersion]);

  function openAccountManager(integration: IntegrationSummary) {
    setManageProvider(integration.provider);
    setDraftSelection(
      integration.accounts
        .filter(
          (account) => account.selected && isAccountEligible(account),
        )
        .map((account) => account.id),
    );
    setQuery("");
  }

  async function mutate(
    provider: IntegrationProvider,
    action: BusyKind,
    init: RequestInit,
  ): Promise<IntegrationSummary[] | null> {
    setBusy({ provider, action });
    try {
      const response = await fetch(`/api/integrations/${provider}`, {
        ...init,
        headers: {
          accept: "application/json",
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
      });
      const body = (await response.json()) as IntegrationsResponse;
      if (body.integrations) {
        setIntegrations(body.integrations);
        onPerformanceUpdated?.();
      }
      if (!response.ok || !body.integrations) {
        throw new Error(body.error ?? "No pudimos completar la acción");
      }
      return body.integrations;
    } catch (error) {
      toast.error("La acción no se completó", {
        description:
          error instanceof Error ? error.message : "Intenta nuevamente.",
      });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function sync(provider: IntegrationProvider) {
    const updated = await mutate(provider, "sync", { method: "POST" });
    if (!updated) return;
    const integration = updated.find((item) => item.provider === provider);
    if (
      integration?.performanceStatus === "partial" ||
      integration?.performanceStatus === "error"
    ) {
      toast.warning("Inventario actualizado; la lectura requiere atención");
    } else {
      toast.success("Inventario y métricas actualizados");
    }
  }

  async function saveSelection() {
    if (!manageProvider || draftSelection.length === 0) return;
    const provider = manageProvider;
    const updated = await mutate(provider, "select", {
      method: "PATCH",
      body: JSON.stringify({ selectedIds: draftSelection }),
    });
    if (updated) {
      setManageProvider(null);
      const integration = updated.find((item) => item.provider === provider);
      const requiresAttention =
        integration?.performanceStatus === "partial" ||
        integration?.performanceStatus === "error";
      const label = `${draftSelection.length} ${draftSelection.length === 1 ? "cuenta seleccionada" : "cuentas seleccionadas"}`;
      if (requiresAttention) {
        toast.warning(label, {
          description:
            "La selección quedó guardada, pero la primera lectura requiere atención.",
        });
      } else {
        toast.success(label, {
          description:
            "WiWO.ADS completó la primera lectura disponible y actualizó la cartera.",
        });
      }
    }
  }

  async function disconnect() {
    if (!disconnectProvider) return;
    const provider = disconnectProvider;
    const updated = await mutate(provider, "disconnect", { method: "DELETE" });
    if (updated) {
      setDisconnectProvider(null);
      toast.info("La cuenta fue desconectada");
    }
  }

  const filteredAccounts = useMemo(() => {
    if (!managedIntegration) return [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return managedIntegration.accounts;
    return managedIntegration.accounts.filter(
      (account) =>
        account.name.toLowerCase().includes(normalized) ||
        account.externalId.toLowerCase().includes(normalized),
    );
  }, [managedIntegration, query]);

  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-micro mb-3 inline-flex items-center gap-2 rounded-full border border-[#F8FAD7]/10 bg-[#323330]/55 px-3 py-1.5 text-[0.62rem] text-[#F8FAD7]/60 shadow-sm backdrop-blur-md">
            <ShieldCheck className="size-3 text-[#4242FF]" />
            Fuentes de datos · operación controlada
          </p>
          <h2 className="font-editorial text-3xl leading-[0.98] tracking-[-0.035em] text-[#F8FAD7] md:text-[2.8rem]">
            Conecta las cuentas que WiWO debe leer
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#F8FAD7]/58">
            Autoriza con la ventana oficial, elige cuentas publicitarias y
            sincroniza inversión, impresiones, clics y resultados. WiWO.ADS
            nunca solicita ni almacena contraseñas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="h-8 border-[#F8FAD7]/10 bg-[#323330]/55 text-[#F8FAD7]/65"
          >
            <Link2 />
            {connectedCount} de 2 con OAuth
          </Badge>
          <Badge
            variant="outline"
            className="h-8 border-[#F8FAD7]/10 bg-[#323330]/55 text-[#F8FAD7]/65"
          >
            <DatabaseZap />
            {selectedCount} cuentas seleccionadas
          </Badge>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-[16px] border border-[#F8FAD7]/10 bg-[#323330]/55 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#4242FF] text-xs font-extrabold text-[#292929]">
            {currentUser.email.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-micro text-[0.6rem] text-[#F8FAD7]/45">
              SESIÓN EN WIWO.ADS
            </p>
            <p className="mt-1 truncate text-sm font-bold text-[#F8FAD7]">
              {currentUser.email}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm"
          className="shrink-0 border-[#F8FAD7]/12 bg-transparent text-[#F8FAD7]/70">
          <a href={signOutPath}>
            <LogOut />
            Cerrar sesión
          </a>
        </Button>
      </div>

      {windsor?.configured ? (
        <div className="mb-4 rounded-[16px] border border-[#3BFF00]/25 bg-[#3BFF00]/[0.06] px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-[#3BFF00]/15 text-[#3BFF00]">
                <DatabaseZap className="size-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#F8FAD7]">
                  Windsor.ai · fuente de lectura activa
                </p>
                <p className="mt-1 text-xs leading-5 text-[#F8FAD7]/58">
                  {windsor.accountCount} cuentas con datos
                  {typeof windsor.google === "number" &&
                  typeof windsor.meta === "number"
                    ? ` · ${windsor.google} de Google Ads · ${windsor.meta} de Meta`
                    : ""}
                  {windsor.dataThrough ? ` · hasta ${windsor.dataThrough}` : ""}
                </p>
              </div>
            </div>
            <span className="font-micro shrink-0 rounded-full border border-[#3BFF00]/25 px-3 py-1 text-[0.62rem] text-[#3BFF00]">
              LEYENDO
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#F8FAD7]/45">
            Las métricas del tablero entran por acá. Las cuentas de Google y Meta
            están autorizadas dentro de Windsor, con su propia cuenta: se
            administran en{" "}
            <a
              href="https://onboard.windsor.ai/connectors"
              target="_blank"
              rel="noreferrer"
              className="text-[#3BFF00] underline underline-offset-2"
            >
              onboard.windsor.ai
            </a>
            . Las conexiones de abajo son para la capa de escritura, que todavía
            no está habilitada.
          </p>
        </div>
      ) : null}

      {loadError && !loading ? (
        <div className="mb-4 flex flex-col gap-3 rounded-[16px] border border-red-500/25 bg-red-500/10 px-4 py-3 text-red-200 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-300" />
            <div>
              <p className="text-sm font-bold">No se pudieron cargar las conexiones</p>
              <p className="mt-1 text-xs leading-5 text-red-300">{loadError}</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="shrink-0 border-red-500/25 bg-[#323330]"
            onClick={() => setReloadVersion((current) => current + 1)}
          >
            <RefreshCw />
            Reintentar
          </Button>
        </div>
      ) : null}

      {!canManage && !loading ? (
        <div className="mb-4 flex items-start gap-3 rounded-[16px] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-amber-200 shadow-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <p className="text-sm leading-6">
            Puedes revisar el estado, pero solo un administrador puede conectar
            o desconectar cuentas.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {loading
          ? ["google", "meta"].map((provider) => (
              <Surface key={provider} className="min-h-[320px] animate-pulse p-5">
                <div className="h-12 w-12 rounded-2xl bg-[#F8FAD7]/8" />
                <div className="mt-6 h-6 w-36 rounded bg-[#F8FAD7]/8" />
                <div className="mt-3 h-4 w-64 rounded bg-[#F8FAD7]/6" />
              </Surface>
            ))
          : integrations.map((integration) => (
              <ProviderCard
                key={integration.provider}
                integration={integration}
                windsorAccounts={
                  windsor?.accounts?.[integration.provider] ?? []
                }
                canManage={canManage}
                busy={busy?.provider === integration.provider ? busy.action : null}
                onManage={() => openAccountManager(integration)}
                onSync={() => void sync(integration.provider)}
                onDisconnect={() => setDisconnectProvider(integration.provider)}
              />
            ))}
      </div>

      <CatalogoPanel canManage={canManage} />

      <Surface className="mt-4 grid gap-4 p-4 md:grid-cols-3">
        <ConnectionPrinciple
          number="01"
          title="Autorización oficial"
          text="El acceso se concede directamente en Google o Meta."
        />
        <ConnectionPrinciple
          number="02"
          title="Tú eliges las cuentas"
          text="Solo las cuentas publicitarias seleccionadas alimentan la cartera."
        />
        <ConnectionPrinciple
          number="03"
          title="Control reversible"
          text="Puedes sincronizar, reconectar o retirar el acceso cuando quieras."
        />
      </Surface>

      <Dialog
        open={Boolean(manageProvider)}
        onOpenChange={(open) => !open && setManageProvider(null)}
      >
        <DialogContent className="max-h-[86svh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Elegir cuentas de {managedIntegration?.label}
            </DialogTitle>
            <DialogDescription>
              Selecciona las cuentas publicitarias que alimentarán WiWO.ADS.
              La implementación consulta datos y no ejecuta cambios en campañas.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#F8FAD7]/35" />
            <Input
              aria-label="Buscar cuentas por nombre o ID"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre o ID"
              className="pl-9"
            />
          </div>
          <div className="max-h-[48svh] space-y-2 overflow-y-auto pr-1">
            {filteredAccounts.length ? (
              filteredAccounts.map((account) => {
                const eligible = isAccountEligible(account);
                return (
                  <AccountOption
                    key={account.id}
                    account={account}
                    checked={eligible && draftSelection.includes(account.id)}
                    disabled={!eligible}
                    onChecked={(checked) =>
                      setDraftSelection((current) =>
                        checked
                          ? [...new Set([...current, account.id])]
                          : current.filter((id) => id !== account.id),
                      )
                    }
                  />
                );
              })
            ) : (
              <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-[#F8FAD7]/15 bg-[#F8FAD7]/[0.025] px-6 text-center">
                <div>
                  <p className="text-sm font-bold text-[#F8FAD7]">
                    No encontramos cuentas
                  </p>
                  <p className="mt-1 text-xs text-[#F8FAD7]/48">
                    Cambia la búsqueda o sincroniza nuevamente la plataforma.
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageProvider(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void saveSelection()}
              disabled={
                draftSelection.length === 0 ||
                busy?.action === "select"
              }
              className="font-bold"
            >
              {busy?.action === "select" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              Activar {draftSelection.length}{" "}
              {draftSelection.length === 1 ? "cuenta" : "cuentas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(disconnectProvider)}
        onOpenChange={(open) => {
          if (!open && busy?.action !== "disconnect") {
            setDisconnectProvider(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Desconectar {disconnectedIntegration?.label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se detendrán las nuevas sincronizaciones y se eliminarán la
              autorización, las cuentas descubiertas y su historial de métricas
              en WiWO.ADS. Las decisiones y la bitácora permanecerán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy?.action === "disconnect"}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy?.action === "disconnect"}
              onClick={() => void disconnect()}
            >
              {busy?.action === "disconnect" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Unplug />
              )}
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type CatalogoEstado = {
  disponible: boolean;
  construidoEn: number | null;
  rango: { desde: string; hasta: string };
  totales: { campanas: number; anuncios: number };
  porPlataforma: Array<{
    provider: string;
    plataforma: string;
    campanas: number;
    conjuntos: number;
    anuncios: number;
    cuentas: number;
  }>;
  fallos: Array<{ plataforma: string; mensaje: string }>;
};

/**
 * Catálogo de lo que existe en las cuentas, activo o apagado.
 *
 * Está acá y no en el tablero porque construirlo barre tres años de historial
 * en Windsor y tarda minutos. El tablero solo lee el resultado guardado; este
 * panel dice de cuándo es y permite volver a barrer.
 *
 * Hace falta porque la API de Windsor, por sí sola, devuelve únicamente lo que
 * tuvo actividad en el rango consultado: sin catálogo, una campaña pausada hace
 * dos semanas simplemente no existe para el sistema.
 */
function CatalogoPanel({ canManage }: { canManage: boolean }) {
  const [estado, setEstado] = useState<CatalogoEstado | null>(null);
  const [construyendo, setConstruyendo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const response = await fetch("/api/catalogo", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as CatalogoEstado;
        if (!cancelado) setEstado(body);
      } catch {
        // Sin catálogo el resto de la pantalla sigue siendo útil.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  async function reconstruir() {
    setConstruyendo(true);
    try {
      const response = await fetch("/api/catalogo", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const body = (await response.json()) as CatalogoEstado & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "No se pudo reconstruir");
      setEstado(body);
      toast.success(
        `Catálogo al día: ${body.totales.campanas} campañas y ${body.totales.anuncios} anuncios`,
      );
    } catch (issue) {
      toast.error(
        issue instanceof Error ? issue.message : "No se pudo reconstruir",
      );
    } finally {
      setConstruyendo(false);
    }
  }

  return (
    <Surface className="mt-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#F8FAD7]">
            Catálogo de campañas y anuncios
          </h3>
          <p className="mt-1 max-w-xl text-xs leading-5 text-[#F8FAD7]/55">
            Incluye lo pausado y lo apagado. Sin él, Windsor solo devuelve lo
            que tuvo actividad en el rango y una campaña detenida desaparece de
            la vista.
          </p>
        </div>
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            disabled={construyendo}
            onClick={() => void reconstruir()}
            className="shrink-0 border-[#F8FAD7]/12 bg-transparent text-[#F8FAD7]/70"
          >
            {construyendo ? <LoaderCircle className="animate-spin" /> : null}
            {construyendo ? "Barriendo Windsor…" : "Reconstruir"}
          </Button>
        )}
      </div>

      {construyendo && (
        <p className="mt-3 text-xs text-[#F8FAD7]/50">
          El barrido completo tarda unos minutos. Puedes seguir trabajando.
        </p>
      )}

      {estado === null ? (
        <p className="mt-3 text-xs text-[#F8FAD7]/45">Consultando estado…</p>
      ) : !estado.disponible ? (
        <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-xs leading-5 text-amber-200">
          Todavía no se ha construido. Hasta entonces el sistema solo muestra
          campañas y anuncios que entregaron en el periodo elegido.
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {estado.porPlataforma.map((fila) => (
              <div
                key={fila.provider}
                className="rounded-xl border border-[#F8FAD7]/10 bg-[#292929]/40 px-3 py-2.5"
              >
                <p className="text-xs font-bold text-[#F8FAD7]">
                  {fila.plataforma}
                </p>
                <p className="metric-number mt-1 text-[0.68rem] text-[#F8FAD7]/55">
                  {fila.campanas} campañas · {fila.conjuntos} conjuntos ·{" "}
                  {fila.anuncios} anuncios
                </p>
                <p className="metric-number mt-0.5 text-[0.62rem] text-[#F8FAD7]/38">
                  en {fila.cuentas}{" "}
                  {fila.cuentas === 1 ? "cuenta" : "cuentas"}
                </p>
              </div>
            ))}
          </div>
          <p className="metric-number mt-2.5 text-[0.62rem] text-[#F8FAD7]/40">
            Historial {estado.rango.desde} a {estado.rango.hasta} · construido{" "}
            {formatDate(estado.construidoEn)}
          </p>
          {estado.fallos.length > 0 && (
            <p className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-[0.68rem] leading-5 text-amber-200">
              Falta la parte de {estado.fallos.map((f) => f.plataforma).join(", ")}:{" "}
              {estado.fallos[0].mensaje}
            </p>
          )}
        </>
      )}
    </Surface>
  );
}

function ProviderCard({
  integration,
  windsorAccounts,
  canManage,
  busy,
  onManage,
  onSync,
  onDisconnect,
}: {
  integration: IntegrationSummary;
  windsorAccounts: WindsorAccount[];
  canManage: boolean;
  busy: BusyKind | null;
  onManage: () => void;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  const connected = integration.status === "connected";
  const attention = integration.status === "needs_attention";
  const authorized = connected || attention;
  const selected = integration.selectedCount;
  const needsSelection = authorized && integration.accountCount > 0 && selected === 0;
  const metricsReady = integration.performanceStatus === "ready";
  const metricsRunning = integration.performanceStatus === "running";
  const metricsStale = Boolean(
    metricsReady &&
      integration.performanceLastSyncAt &&
      integration.observedAt - integration.performanceLastSyncAt >
        26 * 60 * 60 * 1000,
  );
  const metricsIssue =
    integration.performanceStatus === "partial" ||
    integration.performanceStatus === "error";
  const status = attention
    ? { label: "Atención requerida", className: "border-red-500/25 bg-red-500/10 text-red-300" }
    : needsSelection
      ? { label: "Selección pendiente", className: "border-amber-500/25 bg-amber-500/10 text-amber-300" }
      : metricsIssue
        ? { label: "Lectura requiere atención", className: "border-amber-500/25 bg-amber-500/10 text-amber-300" }
      : metricsStale
        ? { label: "Lectura desactualizada", className: "border-amber-500/25 bg-amber-500/10 text-amber-300" }
      : connected && metricsReady
        ? { label: "Datos actualizados", className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" }
        : connected
          ? { label: "OAuth conectado", className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" }
        : { label: "Sin conexión", className: "border-[#F8FAD7]/10 bg-[#323330]/60 text-[#F8FAD7]/48" };

  return (
    <Surface className="flex min-h-[330px] flex-col overflow-hidden">
      <div className="flex items-start justify-between border-b border-[#F8FAD7]/8 p-5">
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "grid size-12 place-items-center rounded-2xl text-xl font-black shadow-sm",
              integration.provider === "google"
                ? "bg-[#323330] text-[#4285F4] ring-1 ring-[#F8FAD7]/10"
                : "bg-[#0668E1] text-white",
            )}
          >
            {integration.provider === "google" ? "G" : "M"}
          </span>
          <div>
            <h3 className="text-lg font-bold text-[#F8FAD7]">
              {integration.label}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[#F8FAD7]/48">
              {integration.description}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={status.className}>
          {attention || needsSelection || metricsIssue || metricsStale ? (
            <AlertCircle />
          ) : connected ? (
            <CheckCircle2 />
          ) : (
            <Link2 />
          )}
          {status.label}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col p-5">
        {authorized ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ProviderFact
              label="Identidad autorizada"
              value={integration.providerUserName ?? integration.label}
            />
            <ProviderFact
              label="Cuentas seleccionadas"
              value={`${selected} de ${integration.accountCount}`}
            />
            <ProviderFact
              label="Último inventario"
              value={formatDate(integration.lastSyncAt)}
            />
            <ProviderFact
              label="Métricas"
              value={performanceLabel(integration)}
            />
            <ProviderFact
              label="Dato más reciente"
              value={formatMetricDate(integration.performanceDataThrough)}
            />
            <ProviderFact
              label="Filas del último ciclo"
              value={integration.performanceRowCount.toLocaleString("es-CL")}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#F8FAD7]/14 bg-[#323330]/35 p-4">
            {windsorAccounts.length > 0 ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-[#F8FAD7]">
                    Leyendo {windsorAccounts.length}{" "}
                    {windsorAccounts.length === 1 ? "cuenta" : "cuentas"} vía
                    Windsor
                  </p>
                  <span className="font-micro shrink-0 rounded-full border border-[#3BFF00]/25 px-2 py-0.5 text-[0.58rem] text-[#3BFF00]">
                    ACTIVO
                  </span>
                </div>
                <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                  {windsorAccounts.map((account) => (
                    <li
                      key={account.name}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="min-w-0 truncate text-[#F8FAD7]/78">
                        {account.name}
                      </span>
                      <span className="font-micro shrink-0 text-[0.58rem] text-[#F8FAD7]/40">
                        {account.currency ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 border-t border-[#F8FAD7]/8 pt-3 text-xs leading-5 text-[#F8FAD7]/45">
                  Autorizadas dentro de Windsor. Conectar {integration.label}{" "}
                  acá es para la capa de escritura.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-[#F8FAD7]">
                  Un acceso, todas las cuentas disponibles
                </p>
                <p className="mt-2 text-sm leading-6 text-[#F8FAD7]/55">
                  Inicia sesión en {integration.label}, revisa los permisos y
                  elige exactamente qué cuentas quieres incorporar.
                </p>
              </>
            )}
          </div>
        )}

        {integration.performanceError || integration.lastError ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs leading-5 text-amber-300">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            {integration.performanceError ?? integration.lastError}
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
          {!authorized ? (
            integration.configured && canManage ? (
              <Button asChild className="font-bold">
                <a
                  href={`/api/integrations/${integration.provider}/authorize`}
                  target="_top"
                >
                  Conectar {integration.label}
                  <ExternalLink />
                </a>
              </Button>
            ) : (
              <Button
                disabled
                variant="outline"
                className="border-[#F8FAD7]/12 bg-transparent font-bold text-[#F8FAD7]/45"
              >
                <AlertCircle />
                {!canManage
                  ? "Solo administradores"
                  : integration.missingConfig.length
                    ? `Falta ${integration.missingConfig.join(" y ")}`
                    : "No disponible"}
              </Button>
            )
          ) : (
            <>
              <Button
                onClick={needsSelection ? onManage : onSync}
                disabled={!canManage || Boolean(busy) || metricsRunning}
                className="font-bold"
              >
                {busy === "sync" || metricsRunning ? (
                  <LoaderCircle className="animate-spin" />
                ) : needsSelection ? (
                  <SlidersHorizontal />
                ) : (
                  <RefreshCw />
                )}
                {needsSelection ? "Elegir cuentas" : "Actualizar datos"}
              </Button>
              {attention && canManage ? (
                <Button asChild variant="outline">
                  <a
                    href={`/api/integrations/${integration.provider}/authorize`}
                    target="_top"
                  >
                    Reconectar
                    <ExternalLink />
                  </a>
                </Button>
              ) : null}
              {integration.accountCount > 0 ? (
                <Button
                  variant="outline"
                  onClick={onManage}
                  disabled={!canManage || Boolean(busy)}
                >
                  <SlidersHorizontal />
                  Administrar
                </Button>
              ) : null}
              <Button
                variant="ghost"
                onClick={onDisconnect}
                disabled={!canManage || Boolean(busy)}
                className="ml-auto text-[#F8FAD7]/45 hover:text-red-600"
              >
                Desconectar
              </Button>
            </>
          )}
        </div>
      </div>
    </Surface>
  );
}

function AccountOption({
  account,
  checked,
  disabled,
  onChecked,
}: {
  account: IntegrationAccount;
  checked: boolean;
  disabled: boolean;
  onChecked: (checked: boolean) => void;
}) {
  const restriction = !account.available
    ? "No disponible"
    : account.type === "analytics"
      ? "Solo inventario"
      : account.isManager
        ? "Cuenta administradora"
        : null;
  return (
    <label
      className={cn(
        "flex items-center gap-3 rounded-xl border border-[#F8FAD7]/10 bg-[#323330]/60 p-3 transition-colors",
        disabled
          ? "cursor-not-allowed opacity-55"
          : // Antes hover:bg-[#1c1c25]: un navy-morado frío, ajeno a la
            // paleta ink/beige de Neo.
            "cursor-pointer hover:border-[#4242FF]/35 hover:bg-[#F8FAD7]/[0.06]",
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChecked(Boolean(value))}
        aria-label={`Seleccionar ${account.name}`}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[#F8FAD7]">
          {account.name}
        </span>
        <span className="mt-1 block truncate font-mono text-[0.68rem] text-[#F8FAD7]/42">
          {account.externalId}
          {account.currency ? ` · ${account.currency}` : ""}
          {account.timezone ? ` · ${account.timezone}` : ""}
        </span>
      </span>
      <Badge
        variant="outline"
        className="shrink-0 border-[#F8FAD7]/10 bg-[#323330] text-[0.62rem] text-[#F8FAD7]/48"
      >
        {restriction ?? "Ads elegible"}
      </Badge>
    </label>
  );
}

function ProviderFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#F8FAD7]/8 bg-[#323330]/45 px-3 py-3">
      <p className="font-micro text-[0.58rem] text-[#F8FAD7]/38">{label}</p>
      <p className="mt-1.5 truncate text-sm font-bold text-[#F8FAD7]/78">
        {value}
      </p>
    </div>
  );
}

function ConnectionPrinciple({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl px-2 py-1">
      <span className="font-micro pt-0.5 text-[0.62rem] font-bold text-[#4242FF]">
        {number}
      </span>
      <div>
        <p className="text-sm font-bold text-[#F8FAD7]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[#F8FAD7]/48">{text}</p>
      </div>
    </div>
  );
}

function formatDate(value: number | null) {
  if (!value) return "Todavía no disponible";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMetricDate(value: string | null) {
  if (!value) return "Todavía no disponible";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function performanceLabel(integration: IntegrationSummary) {
  switch (integration.performanceStatus) {
    case "running":
      return "Sincronizando";
    case "ready":
      return `Lista · ${formatDate(integration.performanceLastSyncAt)}`;
    case "partial":
      return "Lectura parcial";
    case "error":
      return "Error en la última lectura";
    default:
      return integration.selectedCount ? "Primera lectura pendiente" : "Selección pendiente";
  }
}

function isAccountEligible(account: IntegrationAccount) {
  return account.available && account.type === "ads" && !account.isManager;
}
