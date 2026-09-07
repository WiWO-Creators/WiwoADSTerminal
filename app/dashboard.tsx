"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bell,
  Bot,
  ChevronRight,
  Clock3,
  DatabaseZap,
  FileChartColumnIncreasing,
  FlaskConical,
  Gauge,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  LockKeyhole,
  MoreHorizontal,
  PlugZap,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Moon,
  WandSparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import type {
  PerformanceAccountSummary,
  PerformanceSnapshot,
} from "@/lib/performance-store";
import { cn } from "@/lib/utils";
import {
  type AuditEvent,
  type Decision,
  type HealthCheck,
  type ViewKey,
} from "./data";
import { IntegrationsView } from "./integrations-view";
import {
  AuditView,
  ControlRoomView,
  HealthView,
  PacingView,
} from "./secondary-views";
import {
  AutonomyBadge,
  SeverityBadge,
  Surface,
} from "./ui";

const navItems: Array<{
  key: ViewKey;
  label: string;
  icon: typeof LayoutDashboard;
  count?: number;
}> = [
  { key: "decisions", label: "Decisiones", icon: Inbox, count: 5 },
  { key: "control", label: "Sala de control", icon: LayoutDashboard },
  { key: "health", label: "Salud de medición", icon: HeartPulse },
  { key: "pacing", label: "Inversión", icon: Gauge },
  { key: "audit", label: "Bitácora", icon: FileChartColumnIncreasing },
  { key: "integrations", label: "Integraciones", icon: PlugZap },
];

const viewMeta: Record<ViewKey, { eyebrow: string; title: string }> = {
  decisions: { eyebrow: "Operación", title: "Cola de decisiones" },
  control: { eyebrow: "Cartera", title: "Sala de control" },
  health: { eyebrow: "Calidad de datos", title: "Salud de medición" },
  pacing: { eyebrow: "Rendimiento", title: "Inversión real" },
  audit: { eyebrow: "Gobierno", title: "Bitácora" },
  integrations: { eyebrow: "Configuración", title: "Cuentas conectadas" },
};

const roleLabels: Record<string, string> = {
  direction: "Dirección",
  lead: "Lead",
  buyer: "Buyer · Piloto",
  analyst: "Analista",
};

export type DashboardIdentity = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

export default function WiwoDashboard({
  initialSnapshot,
  initialView = "decisions",
}: {
  initialSnapshot: {
    user: DashboardIdentity;
    decisions: Decision[];
    auditEvents: AuditEvent[];
    dataMode: "pilot";
    dataUpdatedAt: number | null;
    performance: PerformanceSnapshot;
  };
  initialView?: ViewKey;
}) {
  const [view, setView] = useState<ViewKey>(initialView);
  const [decisions, setDecisions] = useState(initialSnapshot.decisions);
  const [selectedId, setSelectedId] = useState(
    initialSnapshot.decisions[0]?.id ?? "",
  );
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [healthClient, setHealthClient] = useState(
    initialSnapshot.performance.accounts[0]?.id ?? "",
  );
  const [discardOpen, setDiscardOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState("");
  const [discardNote, setDiscardNote] = useState("");
  const [editedAfter, setEditedAfter] = useState("");
  const [auditEvents, setAuditEvents] =
    useState<AuditEvent[]>(initialSnapshot.auditEvents);
  const [performance, setPerformance] = useState(initialSnapshot.performance);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("wiwo-ads-theme");
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
  }, []);

  function changeTheme(checked: boolean) {
    const nextTheme = checked ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem("wiwo-ads-theme", nextTheme);
  }

  const filteredDecisions = useMemo(
    () =>
      decisions.filter(
        (decision) =>
          (accountFilter === "all" || decision.client === accountFilter) &&
          (platformFilter === "all" ||
            decision.platform === platformFilter) &&
          (agentFilter === "all" || decision.agent === agentFilter),
      ),
    [decisions, accountFilter, platformFilter, agentFilter],
  );

  const selectedDecision =
    filteredDecisions.find((decision) => decision.id === selectedId) ??
    filteredDecisions[0] ??
    null;

  const healthAccount =
    performance.accounts.find((account) => account.id === healthClient) ??
    performance.accounts[0] ??
    null;
  const healthChecks = performanceHealthChecks(
    healthAccount,
    performance.generatedAt,
  );
  const healthCritical = healthChecks.filter(
    (check) => check.state === "critical",
  ).length;
  const healthWarnings = healthChecks.filter(
    (check) => check.state === "warning",
  ).length;
  const healthScore = healthAccount
    ? Math.max(0, 100 - healthCritical * 22 - healthWarnings * 7)
    : 0;

  function applySnapshot(snapshot: {
    decisions: Decision[];
    auditEvents: AuditEvent[];
    performance?: PerformanceSnapshot;
  }) {
    setDecisions(snapshot.decisions);
    setAuditEvents(snapshot.auditEvents);
    if (snapshot.performance) setPerformance(snapshot.performance);
    setSelectedId((current) =>
      snapshot.decisions.some((decision) => decision.id === current)
        ? current
        : (snapshot.decisions[0]?.id ?? ""),
    );
  }

  async function refreshOperationalData() {
    try {
      const response = await fetch("/api/dashboard", {
        headers: { accept: "application/json" },
      });
      const body = (await response.json()) as {
        decisions?: Decision[];
        auditEvents?: AuditEvent[];
        performance?: PerformanceSnapshot;
      };
      if (
        !response.ok ||
        !body.decisions ||
        !body.auditEvents ||
        !body.performance
      ) {
        return;
      }
      applySnapshot({
        decisions: body.decisions,
        auditEvents: body.auditEvents,
        performance: body.performance,
      });
      setHealthClient((current) =>
        body.performance!.accounts.some((account) => account.id === current)
          ? current
          : (body.performance!.accounts[0]?.id ?? ""),
      );
    } catch {
      // The integration surface already reports provider errors.
    }
  }

  async function sendCommand(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        decisions?: Decision[];
        auditEvents?: AuditEvent[];
        performance?: PerformanceSnapshot;
        error?: string;
      };
      if (!response.ok || !body.decisions || !body.auditEvents) {
        throw new Error(body.error ?? "No pudimos guardar el cambio");
      }
      applySnapshot({
        decisions: body.decisions,
        auditEvents: body.auditEvents,
        performance: body.performance,
      });
      return body;
    } catch (error) {
      toast.error("No se guardó la acción", {
        description:
          error instanceof Error ? error.message : "Intenta nuevamente.",
      });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function undoDecision(decision: Decision) {
    const snapshot = await sendCommand({
      kind: "decision",
      type: "undo",
      id: decision.id,
      expectedVersion: decision.version + 1,
      idempotencyKey: crypto.randomUUID(),
    });
    if (snapshot) {
      setSelectedId(decision.id);
      toast.info("La decisión volvió a la cola");
    }
  }

  async function completeDecision(
    decision: Decision,
    action: "approve" | "discard",
    reason?: string,
  ): Promise<boolean> {
    const snapshot = await sendCommand({
      kind: "decision",
      type: action,
      id: decision.id,
      expectedVersion: decision.version,
      idempotencyKey: crypto.randomUUID(),
      reason,
    });
    if (!snapshot) return false;

    setSelectedRows((current) => current.filter((item) => item !== decision.id));

    if (action === "approve") {
      toast.success("Decisión firmada", {
        description:
          decision.client +
          " · " +
          decision.id +
          " quedó registrada; no se ejecutaron cambios en la plataforma.",
        action: {
          label: "Deshacer",
          onClick: () => void undoDecision(decision),
        },
      });
    } else {
      toast.info("Recomendación descartada", {
        description: "El motivo quedó registrado para mejorar el criterio.",
      });
    }
    return true;
  }

  async function approveBatch() {
    const approved = decisions.filter((decision) =>
      selectedRows.includes(decision.id),
    );
    const snapshot = await sendCommand({
      kind: "batch-approve",
      items: approved.map((decision) => ({
        id: decision.id,
        expectedVersion: decision.version,
      })),
      idempotencyKey: crypto.randomUUID(),
    });
    if (!snapshot) return;

    setSelectedRows([]);
    toast.success(String(approved.length) + " decisiones firmadas", {
      description: "Cada firma quedó guardada con su propio registro.",
    });
  }

  function toggleDecision(id: string, checked: boolean) {
    setSelectedRows((current) => {
      if (checked && current.length >= 10) {
        toast.warning("Máximo 10 decisiones por lote");
        return current;
      }
      return checked
        ? [...current, id]
        : current.filter((item) => item !== id);
    });
  }

  function openEdit(decision: Decision) {
    setEditedAfter(decision.after);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!selectedDecision || !editedAfter.trim()) return;
    const snapshot = await sendCommand({
      kind: "decision",
      type: "edit",
      id: selectedDecision.id,
      expectedVersion: selectedDecision.version,
      idempotencyKey: crypto.randomUUID(),
      after: editedAfter.trim(),
    });
    if (!snapshot) return;
    setEditOpen(false);
    toast.success("Propuesta actualizada", {
      description: "El impacto quedó marcado para recálculo antes de firmar.",
    });
  }

  async function discardSelected() {
    if (!selectedDecision || !discardReason) return;
    const result = discardNote.trim()
      ? discardReason + " · " + discardNote.trim()
      : discardReason;
    const completed = await completeDecision(
      selectedDecision,
      "discard",
      result,
    );
    if (!completed) return;
    setDiscardReason("");
    setDiscardNote("");
    setDiscardOpen(false);
  }

  async function escalateSelected() {
    if (!selectedDecision) return;
    const snapshot = await sendCommand({
      kind: "decision",
      type: "escalate",
      id: selectedDecision.id,
      expectedVersion: selectedDecision.version,
      idempotencyKey: crypto.randomUUID(),
    });
    if (snapshot) toast.info("Decisión escalada al Lead AdTech");
  }

  async function postponeSelected() {
    if (!selectedDecision) return;
    const snapshot = await sendCommand({
      kind: "decision",
      type: "postpone",
      id: selectedDecision.id,
      expectedVersion: selectedDecision.version,
      idempotencyKey: crypto.randomUUID(),
    });
    if (snapshot) toast.info("Decisión pospuesta hasta mañana");
  }

  return (
    <div className="theme-shell" data-theme={theme}>
    <SidebarProvider>
      <AppSidebar
        view={view}
        decisionsCount={decisions.length}
        currentUser={initialSnapshot.user}
        onNavigate={setView}
      />

      <SidebarInset className="min-w-0 bg-[#080808]">
        <AppHeader
          view={view}
          currentUser={initialSnapshot.user}
          performance={performance}
          theme={theme}
          onThemeChange={changeTheme}
        />
        <div className="telemetry-grid min-h-[calc(100svh-4rem)]">
          {view === "decisions" && (
            <DecisionsView
              decisions={filteredDecisions}
              selectedDecision={selectedDecision}
              selectedRows={selectedRows}
              accountFilter={accountFilter}
              platformFilter={platformFilter}
              agentFilter={agentFilter}
              onAccountFilter={setAccountFilter}
              onPlatformFilter={setPlatformFilter}
              onAgentFilter={setAgentFilter}
              onSelect={setSelectedId}
              onToggle={toggleDecision}
              saving={saving}
              onApprove={() =>
                selectedDecision &&
                void completeDecision(selectedDecision, "approve")
              }
              onEdit={() => selectedDecision && openEdit(selectedDecision)}
              onDiscard={() => setDiscardOpen(true)}
              onEscalate={() => void escalateSelected()}
              onPostpone={() => void postponeSelected()}
              onBatch={() => void approveBatch()}
              onClearFilters={() => {
                setAccountFilter("all");
                setPlatformFilter("all");
                setAgentFilter("all");
              }}
            />
          )}
          {view === "control" && (
            <ControlRoomView
              pending={decisions.length}
              performance={performance}
              onOpenQueue={() => setView("decisions")}
              onOpenHealth={(client) => {
                setHealthClient(client);
                setView("health");
              }}
              onOpenIntegrations={() => setView("integrations")}
            />
          )}
          {view === "health" && (
            <HealthView
              client={healthClient}
              onClient={setHealthClient}
              accounts={performance.accounts}
              onOpenIntegrations={() => setView("integrations")}
              checks={healthChecks}
              score={healthScore}
              critical={healthCritical}
              warnings={healthWarnings}
            />
          )}
          {view === "pacing" && (
            <PacingView
              performance={performance}
              onOpenIntegrations={() => setView("integrations")}
            />
          )}
          {view === "audit" && <AuditView events={auditEvents} />}
          {view === "integrations" && (
            <IntegrationsView
              onPerformanceUpdated={() => void refreshOperationalData()}
            />
          )}
        </div>
      </SidebarInset>

      <EditDialog
        open={editOpen}
        value={editedAfter}
        onOpenChange={setEditOpen}
        onValueChange={setEditedAfter}
        saving={saving}
        onSave={() => void saveEdit()}
      />
      <DiscardDialog
        open={discardOpen}
        reason={discardReason}
        note={discardNote}
        onOpenChange={setDiscardOpen}
        onReasonChange={setDiscardReason}
        onNoteChange={setDiscardNote}
        saving={saving}
        onDiscard={() => void discardSelected()}
      />
      <Toaster position="bottom-right" richColors />
    </SidebarProvider>
    </div>
  );
}

function AppSidebar({
  view,
  decisionsCount,
  currentUser,
  onNavigate,
}: {
  view: ViewKey;
  decisionsCount: number;
  currentUser: DashboardIdentity;
  onNavigate: (view: ViewKey) => void;
}) {
  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-[#F5F3FF]/10 bg-[#080808] [&_[data-sidebar=sidebar]]:bg-[#16161d]/45 [&_[data-sidebar=sidebar]]:backdrop-blur-xl"
    >
      <SidebarHeader className="border-b border-[#F5F3FF]/10 px-3 py-4">
        <div className="flex min-h-10 items-center gap-3 overflow-hidden px-1">
          <img
            src="/wiwo-ads-electric.png"
            alt="WiWO.ADS"
            className="h-7 w-32 shrink-0 object-contain object-left drop-shadow-[0_7px_16px_rgba(74,67,255,0.32)] group-data-[collapsible=icon]:w-8"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1.5 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="font-micro text-[0.62rem] text-[#F5F3FF]/42">
            Operación
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={view === item.key}
                      tooltip={item.label}
                      onClick={() => onNavigate(item.key)}
                      className={cn(
                        "h-10 rounded-xl text-[#F5F3FF]/62 hover:bg-[#16161d]/60 hover:text-[#F5F3FF] data-[active=true]:border data-[active=true]:border-[#4A43FF]/15 data-[active=true]:bg-gradient-to-r data-[active=true]:from-[#4A43FF]/10 data-[active=true]:to-[#42FF00]/10 data-[active=true]:text-[#4A43FF] data-[active=true]:shadow-sm",
                        view === item.key && "font-bold",
                      )}
                    >
                      <Icon />
                      <span>{item.label}</span>
                      {item.count ? (
                        <span
                          className={cn(
                            "ml-auto rounded-full bg-[#F5F3FF]/6 px-1.5 py-0.5 text-[0.65rem] font-bold text-[#F5F3FF]/55",
                            view === item.key &&
                              "bg-[#4A43FF]/10 text-[#4A43FF]",
                          )}
                        >
                          {item.key === "decisions"
                            ? decisionsCount
                            : item.count}
                        </span>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-1">
          <SidebarGroupLabel className="font-micro text-[0.62rem] text-[#F5F3FF]/42">
            Próxima fase
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  disabled
                  tooltip="Constructor · Fase 4"
                  className="h-9 text-[#F5F3FF]/30"
                >
                  <WandSparkles />
                  <span>Constructor</span>
                  <LockKeyhole className="ml-auto size-3" />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  disabled
                  tooltip="Laboratorio · Fase 4"
                  className="h-9 text-[#F5F3FF]/30"
                >
                  <FlaskConical />
                  <span>Laboratorio</span>
                  <LockKeyhole className="ml-auto size-3" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-[#F5F3FF]/10 p-3">
        <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-[#F5F3FF]/10 bg-[#16161d]/55 p-2 shadow-sm">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#4A43FF] text-xs font-extrabold text-[#080808]">
            {initials(currentUser.displayName)}
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-xs font-bold text-[#F5F3FF]">
              {currentUser.displayName}
            </p>
            <p className="truncate text-[0.65rem] text-[#F5F3FF]/45">
              {roleLabels[currentUser.role] ?? currentUser.role}
            </p>
          </div>
          <MoreHorizontal className="size-4 text-[#F5F3FF]/35 group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function AppHeader({
  view,
  currentUser,
  performance,
  theme,
  onThemeChange,
}: {
  view: ViewKey;
  currentUser: DashboardIdentity;
  performance: PerformanceSnapshot;
  theme: "dark" | "light";
  onThemeChange: (checked: boolean) => void;
}) {
  const isLive = performance.mode === "live";
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[#F5F3FF]/10 bg-[#080808]/85 px-4 backdrop-blur-xl md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="size-8 text-[#F5F3FF]/55 hover:bg-[#16161d]/60" />
        <div className="h-5 w-px bg-[#F5F3FF]/12" />
        <div className="min-w-0">
          <p className="font-micro truncate text-[0.6rem] text-[#4A43FF]">
            {viewMeta[view].eyebrow}
          </p>
          <h1 className="truncate text-sm font-bold text-[#F5F3FF] md:text-base">
            {viewMeta[view].title}
          </h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-full border border-[#F5F3FF]/10 bg-[#16161d]/55 px-2.5 py-1.5 sm:flex">
          <Moon className="size-3.5 text-[#4A43FF]" aria-hidden="true" />
          <Switch
            size="sm"
            checked={theme === "light"}
            onCheckedChange={onThemeChange}
            aria-label="Activar modo claro"
          />
          <Sun className="size-3.5 text-[#42FF00]" aria-hidden="true" />
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-[#F5F3FF]/10 bg-[#16161d]/55 px-3 py-1.5 text-xs font-medium text-[#F5F3FF]/65 shadow-sm lg:flex">
          <span
            className={cn(
              "size-2.5 rounded-full",
              view === "integrations"
                ? "bg-[#4A43FF]"
                : isLive
                  ? "bg-emerald-500"
                  : "bg-amber-500",
            )}
          />
          <DatabaseZap className="size-3.5 text-[#4A43FF]" />
          {view === "integrations"
            ? "Gestión de conexiones · lectura controlada"
            : isLive
              ? "Métricas reales · recomendaciones piloto"
              : performance.mode === "stale"
                ? "Métricas reales desactualizadas · recomendaciones piloto"
                : "Modo preparación · recomendaciones piloto"}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Notificaciones"
          className="relative text-[#F5F3FF]/55"
        >
          <Bell className="size-4" />
        </Button>
        <div className="hidden h-8 items-center gap-2 rounded-full border border-[#F5F3FF]/10 bg-[#16161d]/55 px-2 pr-3 shadow-sm sm:flex">
          <span className="grid size-6 place-items-center rounded-full bg-[#4A43FF] text-[0.6rem] font-bold text-[#080808]">
            {initials(currentUser.displayName)}
          </span>
          <span className="text-xs font-semibold text-[#F5F3FF]/75">
            {roleLabels[currentUser.role] ?? currentUser.role}
          </span>
        </div>
      </div>
    </header>
  );
}

function DecisionsView({
  decisions,
  selectedDecision,
  selectedRows,
  accountFilter,
  platformFilter,
  agentFilter,
  onAccountFilter,
  onPlatformFilter,
  onAgentFilter,
  onSelect,
  onToggle,
  saving,
  onApprove,
  onEdit,
  onDiscard,
  onEscalate,
  onPostpone,
  onBatch,
  onClearFilters,
}: {
  decisions: Decision[];
  selectedDecision: Decision | null;
  selectedRows: string[];
  accountFilter: string;
  platformFilter: string;
  agentFilter: string;
  onAccountFilter: (value: string) => void;
  onPlatformFilter: (value: string) => void;
  onAgentFilter: (value: string) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string, checked: boolean) => void;
  saving: boolean;
  onApprove: () => void;
  onEdit: () => void;
  onDiscard: () => void;
  onEscalate: () => void;
  onPostpone: () => void;
  onBatch: () => void;
  onClearFilters: () => void;
}) {
  const critical = decisions.filter(
    (decision) => decision.severity === "critical",
  ).length;
  const high = decisions.filter(
    (decision) => decision.severity === "high",
  ).length;

  return (
    <div className="mx-auto w-full max-w-[1680px] p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-micro mb-3 inline-flex items-center gap-2 rounded-full border border-[#F5F3FF]/10 bg-[#16161d]/55 px-3 py-1.5 text-[0.62rem] text-[#F5F3FF]/60 shadow-sm backdrop-blur-md">
            <span className="size-2 rounded-full bg-amber-500" />
            Modo piloto · recomendaciones de muestra
          </p>
          <h2 className="font-editorial text-3xl leading-[0.98] tracking-[-0.035em] text-[#F5F3FF] md:text-[2.8rem]">
            {decisions.length} decisiones requieren firma
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#F5F3FF]/58">
            <span className="font-semibold text-red-600">
              {critical} crítica
            </span>
            <span>·</span>
            <span>{high} altas</span>
            <span>·</span>
            <span>ordenadas por severidad y antigüedad</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="h-8 border-[#F5F3FF]/10 bg-[#16161d]/55 text-[#F5F3FF]/65"
          >
            <Clock3 />
            SLA piloto · 41 h
          </Badge>
          {selectedRows.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBatch}
              disabled={saving}
              className="border-[#4A43FF]/25 bg-[#16161d]/60 font-bold text-[#4A43FF]"
            >
              <BadgeCheck />
              Firmar propuestas · {selectedRows.length}
            </Button>
          )}
        </div>
      </div>

      {critical > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-[16px] border border-red-200 bg-red-50/90 px-4 py-3 text-red-950 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
            <p className="text-sm leading-6">
              <strong>La medición de amiPASS está comprometida.</strong>{" "}
              Cualquier cambio de optimización queda bloqueado hasta resolver
              el evento Purchase.
            </p>
          </div>
          <span className="shrink-0 text-xs font-bold uppercase tracking-[0.08em] text-red-700">
            Baranda activa
          </span>
        </div>
      )}

      <DecisionFilters
        accountFilter={accountFilter}
        platformFilter={platformFilter}
        agentFilter={agentFilter}
        onAccountFilter={onAccountFilter}
        onPlatformFilter={onPlatformFilter}
        onAgentFilter={onAgentFilter}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-3">
          {decisions.length === 0 ? (
            <Surface className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <span className="mb-4 grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                <BadgeCheck className="size-6" />
              </span>
              <h3 className="text-lg font-bold text-[#F5F3FF]">
                Cola despejada
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#F5F3FF]/58">
                No quedan decisiones con los filtros actuales.
              </p>
              <Button
                variant="link"
                onClick={onClearFilters}
                className="mt-2 text-[#4A43FF]"
              >
                Limpiar filtros
              </Button>
            </Surface>
          ) : (
            decisions.map((decision) => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                selected={selectedDecision?.id === decision.id}
                checked={selectedRows.includes(decision.id)}
                onSelect={() => onSelect(decision.id)}
                onToggle={(checked) => onToggle(decision.id, checked)}
              />
            ))
          )}
        </div>

        <DecisionDetail
          decision={selectedDecision}
          saving={saving}
          onApprove={onApprove}
          onEdit={onEdit}
          onDiscard={onDiscard}
          onEscalate={onEscalate}
          onPostpone={onPostpone}
        />
      </div>
    </div>
  );
}

function DecisionFilters({
  accountFilter,
  platformFilter,
  agentFilter,
  onAccountFilter,
  onPlatformFilter,
  onAgentFilter,
}: {
  accountFilter: string;
  platformFilter: string;
  agentFilter: string;
  onAccountFilter: (value: string) => void;
  onPlatformFilter: (value: string) => void;
  onAgentFilter: (value: string) => void;
}) {
  return (
    <Surface className="mb-4 flex flex-col gap-3 p-3 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Search className="ml-1 size-4 shrink-0 text-[#4A43FF]" />
        <span className="text-sm font-semibold text-[#F5F3FF]/78">
          Filtros de cola
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select value={accountFilter} onValueChange={onAccountFilter}>
          <SelectTrigger size="sm" className="w-full bg-[#16161d]/65 sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las cuentas</SelectItem>
            {["amiPASS", "Bodenor Flexcenter", "Açaí Berry", "ProAndes", "FlixBus"].map(
              (client) => (
                <SelectItem key={client} value={client}>
                  {client}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Select value={platformFilter} onValueChange={onPlatformFilter}>
          <SelectTrigger size="sm" className="w-full bg-[#16161d]/65 sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda plataforma</SelectItem>
            <SelectItem value="Meta">Meta</SelectItem>
            <SelectItem value="Google Ads">Google Ads</SelectItem>
            <SelectItem value="TikTok">TikTok</SelectItem>
          </SelectContent>
        </Select>
        <Select value={agentFilter} onValueChange={onAgentFilter}>
          <SelectTrigger size="sm" className="w-full bg-[#16161d]/65 sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los agentes</SelectItem>
            <SelectItem value="Agente Salud">Salud</SelectItem>
            <SelectItem value="Agente Pacing">Pacing</SelectItem>
            <SelectItem value="Agente Creativo">Creativo</SelectItem>
            <SelectItem value="Agente Búsqueda">Búsqueda</SelectItem>
            <SelectItem value="Agente Audiencia">Audiencia</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </Surface>
  );
}

function DecisionCard({
  decision,
  selected,
  checked,
  onSelect,
  onToggle,
}: {
  decision: Decision;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <Surface
      className={cn(
        "relative overflow-hidden transition-all",
        selected
          ? "border-[#4A43FF] bg-[linear-gradient(115deg,rgba(255,255,255,0.76),rgba(66,255,0,0.08),rgba(74,67,255,0.06))] shadow-[0_0_0_1px_#4A43FF,0_18px_50px_rgba(74,67,255,0.10)]"
          : "hover:border-[#F5F3FF]/25",
      )}
    >
      <div
        className={cn(
          "absolute left-0 top-6 h-10 w-1 rounded-r-full",
          decision.severity === "critical" && "bg-red-500",
          decision.severity === "high" && "bg-amber-500",
          decision.severity === "medium" && "bg-blue-500",
          decision.severity === "info" && "bg-[#F5F3FF]/25",
        )}
      />
      <div className="p-4 pl-5">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={checked}
            onCheckedChange={(value) => onToggle(value === true)}
            aria-label={"Seleccionar " + decision.id}
            className="mt-1"
          />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <SeverityBadge severity={decision.severity} />
              <span className="text-xs font-semibold text-[#F5F3FF]/58">
                {decision.client}
              </span>
              <span className="text-[#F5F3FF]/20">·</span>
              <span className="text-xs text-[#F5F3FF]/58">
                {decision.platform}
              </span>
              <span className="ml-auto text-xs font-medium text-[#F5F3FF]/42">
                {decision.age}
              </span>
            </div>
            <button
              onClick={onSelect}
              className="block w-full rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-[#4A43FF]"
            >
              <h3 className="text-[0.98rem] font-bold leading-6 tracking-[-0.02em] text-[#F5F3FF]">
                {decision.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#F5F3FF]/58">
                {decision.diagnosis}
              </p>
            </button>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#F5F3FF]/8 pt-3">
              <div className="flex items-center gap-2 text-xs text-[#F5F3FF]/58">
                <Bot className="size-3.5 text-[#4A43FF]" />
                {decision.agent}
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F3FF]/78">
                <Sparkles className="size-3.5 text-[#4A43FF]" />
                {decision.impact}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <AutonomyBadge level={decision.autonomy} />
                <Button
                  variant="outline"
                  size="xs"
                  onClick={onSelect}
                  className="border-[#F5F3FF]/12 bg-[#16161d]/55 text-[#4A43FF]"
                >
                  Revisar
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Surface>
  );
}

function DecisionDetail({
  decision,
  saving,
  onApprove,
  onEdit,
  onDiscard,
  onEscalate,
  onPostpone,
}: {
  decision: Decision | null;
  saving: boolean;
  onApprove: () => void;
  onEdit: () => void;
  onDiscard: () => void;
  onEscalate: () => void;
  onPostpone: () => void;
}) {
  if (!decision) {
    return (
      <Surface className="sticky top-20 flex min-h-72 flex-col items-center justify-center p-6 text-center">
        <BadgeCheck className="mb-3 size-8 text-emerald-500" />
        <h3 className="font-bold">Sin decisiones por revisar</h3>
        <p className="mt-2 text-sm text-[#F5F3FF]/58">
          Selecciona otra cuenta o vuelve cuando aparezca un hallazgo.
        </p>
      </Surface>
    );
  }

  return (
    <Surface className="sticky top-20 overflow-hidden">
      <div className="border-b border-[#F5F3FF]/10 bg-[#121218]/55 p-4">
        <div className="flex items-center justify-between gap-3">
          <SeverityBadge severity={decision.severity} />
          <span className="font-micro text-[0.6rem] text-[#F5F3FF]/42">
            {decision.id}
          </span>
        </div>
        <h3 className="mt-3 text-lg font-extrabold leading-6 tracking-[-0.03em] text-[#F5F3FF]">
          {decision.title}
        </h3>
        <div className="mt-3 flex items-center gap-2 text-xs text-[#F5F3FF]/58">
          <span className="font-bold text-[#F5F3FF]/78">{decision.client}</span>
          <span>·</span>
          <span>{decision.platform}</span>
          <span>·</span>
          <span>{decision.expires}</span>
        </div>
      </div>

      <div className="scrollbar-thin max-h-[calc(100svh-13rem)] overflow-y-auto">
        <div className="space-y-5 p-4">
          <DetailBlock label="Diagnóstico">{decision.diagnosis}</DetailBlock>
          <DetailBlock label="Cambio propuesto">
            {decision.proposedAction}
          </DetailBlock>

          <div className="overflow-hidden rounded-[16px] border border-[#F5F3FF]/15 bg-[linear-gradient(135deg,#F5F3FF_0%,#333333_58%,#4A43FF_145%)] text-white shadow-[0_18px_42px_rgba(245,243,255,0.12)]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-xs font-bold uppercase tracking-[0.1em] text-white/55">
                Diff operativo
              </span>
              <span className="text-xs font-semibold text-[#42FF00]">
                {decision.metric}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4">
              <DiffValue label="Actual" value={decision.before} />
              <ArrowRight className="size-4 text-[#42FF00]" />
              <DiffValue label="Propuesto" value={decision.after} />
            </div>
            <div className="flex items-center justify-between gap-3 bg-[#16161d]/[0.07] px-4 py-3">
              <span className="text-xs text-white/60">
                {decision.guardrail}
              </span>
              <span className="metric-number text-sm font-extrabold text-white">
                {decision.delta}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[#F5F3FF]/10 bg-[#121218]/55 p-3">
              <p className="text-xs text-[#F5F3FF]/58">Impacto estimado</p>
              <p className="mt-1 text-sm font-bold leading-5 text-[#F5F3FF]">
                {decision.impact}
              </p>
            </div>
            <div className="rounded-xl border border-[#F5F3FF]/10 bg-[#121218]/55 p-3">
              <p className="text-xs text-[#F5F3FF]/58">Confianza</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[#F5F3FF]">
                <ShieldCheck className="size-4 text-[#4A43FF]" />
                {decision.confidence}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-[#F5F3FF]/10 bg-[#16161d]/35 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-[#4A43FF]/8 text-[#4A43FF]">
                  <Bot className="size-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-[#F5F3FF]">
                    {decision.agent}
                  </p>
                  <p className="mt-0.5 text-[0.68rem] text-[#F5F3FF]/42">
                    {decision.rule}
                  </p>
                </div>
              </div>
              <AutonomyBadge level={decision.autonomy} />
            </div>
          </div>

          <Button
            onClick={onApprove}
            disabled={saving}
            className="h-11 w-full bg-[#42FF00] font-extrabold text-[#F5F3FF] shadow-[0_10px_28px_rgba(66,255,0,0.30)] hover:bg-[#98E944]"
          >
            <BadgeCheck />
            Firmar propuesta
          </Button>
          <p className="text-center text-[0.68rem] leading-5 text-[#F5F3FF]/48">
            Registra la aprobación; no ejecuta cambios en Google ni Meta.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={onEdit} disabled={saving}>
              <SlidersHorizontal />
              Editar
            </Button>
            <Button variant="outline" size="sm" onClick={onPostpone} disabled={saving}>
              <Clock3 />
              Posponer
            </Button>
            <Button variant="outline" size="sm" onClick={onEscalate} disabled={saving}>
              <Send />
              Escalar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDiscard}
              disabled={saving}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <X />
              Descartar
            </Button>
          </div>
          <p className="text-center text-[0.68rem] leading-5 text-[#F5F3FF]/42">
            Tu identidad, la evidencia y el cambio exacto quedarán registrados.
          </p>
        </div>
      </div>
    </Surface>
  );
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="font-micro text-[0.6rem] text-[#4A43FF]">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-[#F5F3FF]/78">{children}</p>
    </div>
  );
}

function DiffValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.65rem] uppercase tracking-[0.08em] text-white/45">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold leading-5">{value}</p>
    </div>
  );
}

function EditDialog({
  open,
  value,
  saving,
  onOpenChange,
  onValueChange,
  onSave,
}: {
  open: boolean;
  value: string;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onValueChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[#F5F3FF]/12 bg-[#121218] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar cambio propuesto</DialogTitle>
          <DialogDescription>
            La modificación quedará atribuida a tu usuario. WiWO no recalcula
            automáticamente el impacto: revísalo antes de firmar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label
            htmlFor="edited-change"
            className="text-sm font-semibold text-[#F5F3FF]"
          >
            Estado posterior
          </label>
          <Input
            id="edited-change"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            className="h-11"
          />
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm leading-6 text-cyan-900">
            La confianza quedará como media y el cambio requerirá una nueva
            revisión humana.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={onSave}
            disabled={!value.trim() || saving}
            className="font-bold"
          >
            Guardar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiscardDialog({
  open,
  reason,
  note,
  saving,
  onOpenChange,
  onReasonChange,
  onNoteChange,
  onDiscard,
}: {
  open: boolean;
  reason: string;
  note: string;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onDiscard: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[#F5F3FF]/12 bg-[#121218] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Descartar recomendación</DialogTitle>
          <DialogDescription>
            El motivo es obligatorio: alimenta la biblioteca de criterio y
            evita que el sistema repita ruido.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[#F5F3FF]">
              Motivo
            </label>
            <Select value={reason} onValueChange={onReasonChange}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Selecciona un motivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="El cliente lo pidió así">
                  El cliente lo pidió así
                </SelectItem>
                <SelectItem value="Hay contexto de campaña">
                  Hay contexto de campaña
                </SelectItem>
                <SelectItem value="El diagnóstico está mal">
                  El diagnóstico está mal
                </SelectItem>
                <SelectItem value="No es prioridad ahora">
                  No es prioridad ahora
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="discard-note"
              className="text-sm font-semibold text-[#F5F3FF]"
            >
              Contexto adicional{" "}
              <span className="font-normal text-[#F5F3FF]/42">(opcional)</span>
            </label>
            <Textarea
              id="discard-note"
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Agrega el contexto que debería recordar el sistema."
              className="min-h-24 resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button
            variant="destructive"
            disabled={!reason || saving}
            onClick={onDiscard}
          >
            Descartar y registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function performanceHealthChecks(
  account: PerformanceAccountSummary | null,
  referenceTime: number,
): HealthCheck[] {
  if (!account) return [];
  const platform = account.provider === "google" ? "Google Ads" : "Meta Ads";
  const isStale = Boolean(
    account.lastSyncedAt &&
      referenceTime - account.lastSyncedAt > 26 * 60 * 60 * 1000,
  );
  const connectionState =
    account.connectionStatus === "needs_attention" ? "critical" : "healthy";
  const metricState =
    account.metricsStatus === "error"
      ? "critical"
      : !account.hasData || isStale
        ? "warning"
        : "healthy";
  return [
    {
      check: "Autorización e inventario",
      platform,
      state: connectionState,
      detail:
        connectionState === "critical"
          ? account.issue ?? "La conexión requiere una nueva revisión"
          : "Acceso vigente para lectura",
      lastCheck: relativeTime(account.lastSyncedAt, referenceTime),
      owner: "WiWO.ADS",
    },
    {
      check: "Métricas de rendimiento",
      platform,
      state: metricState,
      detail: account.hasData
        ? `Datos disponibles hasta ${formatMetricDate(account.dataThrough)}`
        : account.issue ?? "La primera lectura todavía no entrega filas",
      lastCheck: relativeTime(account.lastSyncedAt, referenceTime),
      owner: "WiWO.ADS",
    },
    {
      check: "Cambios automáticos",
      platform,
      state: "inactive",
      detail: "Deshabilitados por diseño · solo lectura y propuesta",
      lastCheck: "No aplica",
      owner: "Gobierno",
    },
  ];
}

function relativeTime(timestamp: number | null, referenceTime: number): string {
  if (!timestamp) return "Sin lectura";
  const minutes = Math.max(0, Math.floor((referenceTime - timestamp) / 60_000));
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} ${days === 1 ? "día" : "días"}`;
}

function formatMetricDate(value: string | null): string {
  if (!value) return "sin fecha";
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "WU";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
