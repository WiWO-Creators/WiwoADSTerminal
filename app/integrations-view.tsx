"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  DatabaseZap,
  ExternalLink,
  Link2,
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

type IntegrationsResponse = {
  integrations?: IntegrationSummary[];
  canManage?: boolean;
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
  onPerformanceUpdated,
}: {
  onPerformanceUpdated?: () => void;
}) {
  const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
  const [canManage, setCanManage] = useState(false);
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
          <p className="font-micro mb-3 inline-flex items-center gap-2 rounded-full border border-[#F5F3FF]/10 bg-[#16161d]/55 px-3 py-1.5 text-[0.62rem] text-[#F5F3FF]/60 shadow-sm backdrop-blur-md">
            <ShieldCheck className="size-3 text-[#4A43FF]" />
            Fuentes de datos · operación controlada
          </p>
          <h2 className="font-editorial text-3xl leading-[0.98] tracking-[-0.035em] text-[#F5F3FF] md:text-[2.8rem]">
            Conecta las cuentas que WiWO debe leer
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#F5F3FF]/58">
            Autoriza con la ventana oficial, elige cuentas publicitarias y
            sincroniza inversión, impresiones, clics y resultados. WiWO.ADS
            nunca solicita ni almacena contraseñas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="h-8 border-[#F5F3FF]/10 bg-[#16161d]/55 text-[#F5F3FF]/65"
          >
            <Link2 />
            {connectedCount} de 2 autorizadas
          </Badge>
          <Badge
            variant="outline"
            className="h-8 border-[#F5F3FF]/10 bg-[#16161d]/55 text-[#F5F3FF]/65"
          >
            <DatabaseZap />
            {selectedCount} cuentas seleccionadas
          </Badge>
        </div>
      </div>

      {loadError && !loading ? (
        <div className="mb-4 flex flex-col gap-3 rounded-[16px] border border-red-200 bg-red-50/90 px-4 py-3 text-red-950 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-700" />
            <div>
              <p className="text-sm font-bold">No se pudieron cargar las conexiones</p>
              <p className="mt-1 text-xs leading-5 text-red-800">{loadError}</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="shrink-0 border-red-200 bg-[#16161d]"
            onClick={() => setReloadVersion((current) => current + 1)}
          >
            <RefreshCw />
            Reintentar
          </Button>
        </div>
      ) : null}

      {!canManage && !loading ? (
        <div className="mb-4 flex items-start gap-3 rounded-[16px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-amber-950 shadow-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-700" />
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
                <div className="h-12 w-12 rounded-2xl bg-[#F5F3FF]/8" />
                <div className="mt-6 h-6 w-36 rounded bg-[#F5F3FF]/8" />
                <div className="mt-3 h-4 w-64 rounded bg-[#F5F3FF]/6" />
              </Surface>
            ))
          : integrations.map((integration) => (
              <ProviderCard
                key={integration.provider}
                integration={integration}
                canManage={canManage}
                busy={busy?.provider === integration.provider ? busy.action : null}
                onManage={() => openAccountManager(integration)}
                onSync={() => void sync(integration.provider)}
                onDisconnect={() => setDisconnectProvider(integration.provider)}
              />
            ))}
      </div>

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
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#F5F3FF]/35" />
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
              <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-[#F5F3FF]/15 bg-[#F5F3FF]/[0.025] px-6 text-center">
                <div>
                  <p className="text-sm font-bold text-[#F5F3FF]">
                    No encontramos cuentas
                  </p>
                  <p className="mt-1 text-xs text-[#F5F3FF]/48">
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

function ProviderCard({
  integration,
  canManage,
  busy,
  onManage,
  onSync,
  onDisconnect,
}: {
  integration: IntegrationSummary;
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
    ? { label: "Atención requerida", className: "border-red-200 bg-red-50 text-red-700" }
    : needsSelection
      ? { label: "Selección pendiente", className: "border-amber-200 bg-amber-50 text-amber-700" }
      : metricsIssue
        ? { label: "Lectura requiere atención", className: "border-amber-200 bg-amber-50 text-amber-700" }
      : metricsStale
        ? { label: "Lectura desactualizada", className: "border-amber-200 bg-amber-50 text-amber-700" }
      : connected && metricsReady
        ? { label: "Datos actualizados", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }
        : connected
          ? { label: "OAuth conectado", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }
        : { label: "Sin conexión", className: "border-[#F5F3FF]/10 bg-[#16161d]/60 text-[#F5F3FF]/48" };

  return (
    <Surface className="flex min-h-[330px] flex-col overflow-hidden">
      <div className="flex items-start justify-between border-b border-[#F5F3FF]/8 p-5">
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "grid size-12 place-items-center rounded-2xl text-xl font-black shadow-sm",
              integration.provider === "google"
                ? "bg-[#16161d] text-[#4285F4] ring-1 ring-[#F5F3FF]/10"
                : "bg-[#0668E1] text-white",
            )}
          >
            {integration.provider === "google" ? "G" : "M"}
          </span>
          <div>
            <h3 className="text-lg font-bold text-[#F5F3FF]">
              {integration.label}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[#F5F3FF]/48">
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
          <div className="rounded-2xl border border-dashed border-[#F5F3FF]/14 bg-[#16161d]/35 p-4">
            <p className="text-sm font-bold text-[#F5F3FF]">
              Un acceso, todas las cuentas disponibles
            </p>
            <p className="mt-2 text-sm leading-6 text-[#F5F3FF]/55">
              Inicia sesión en {integration.label}, revisa los permisos y elige
              exactamente qué cuentas quieres incorporar.
            </p>
          </div>
        )}

        {integration.performanceError || integration.lastError ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
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
              <Button disabled className="font-bold">
                <AlertCircle />
                {canManage ? "Falta configuración OAuth" : "Solo administradores"}
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
                className="ml-auto text-[#F5F3FF]/45 hover:text-red-600"
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
        "flex items-center gap-3 rounded-xl border border-[#F5F3FF]/10 bg-[#16161d]/60 p-3 transition-colors",
        disabled
          ? "cursor-not-allowed opacity-55"
          : "cursor-pointer hover:border-[#4A43FF]/35 hover:bg-[#1c1c25]",
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChecked(Boolean(value))}
        aria-label={`Seleccionar ${account.name}`}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[#F5F3FF]">
          {account.name}
        </span>
        <span className="mt-1 block truncate font-mono text-[0.68rem] text-[#F5F3FF]/42">
          {account.externalId}
          {account.currency ? ` · ${account.currency}` : ""}
          {account.timezone ? ` · ${account.timezone}` : ""}
        </span>
      </span>
      <Badge
        variant="outline"
        className="shrink-0 border-[#F5F3FF]/10 bg-[#16161d] text-[0.62rem] text-[#F5F3FF]/48"
      >
        {restriction ?? "Ads elegible"}
      </Badge>
    </label>
  );
}

function ProviderFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#F5F3FF]/8 bg-[#16161d]/45 px-3 py-3">
      <p className="font-micro text-[0.58rem] text-[#F5F3FF]/38">{label}</p>
      <p className="mt-1.5 truncate text-sm font-bold text-[#F5F3FF]/78">
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
      <span className="font-micro pt-0.5 text-[0.62rem] font-bold text-[#4A43FF]">
        {number}
      </span>
      <div>
        <p className="text-sm font-bold text-[#F5F3FF]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[#F5F3FF]/48">{text}</p>
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
