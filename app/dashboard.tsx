"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Cog,
  History,
  LineChart,
  Megaphone,
  Moon,
  Plug,
  RefreshCw,
  Search,
  Sun,
  Target,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

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
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import type {
  PerformanceAccountSummary,
  PerformanceSnapshot,
} from "@/lib/performance-store";
import { platformLabel } from "@/lib/plataformas";
import { RANGO_POR_DEFECTO, type RangoId } from "@/lib/rangos";
import { haceTiempo } from "@/lib/tiempo";
import { cn } from "@/lib/utils";
import type { SemillaDeCampana } from "@/lib/constructor";
import { type HealthCheck, type ViewKey } from "./data";
import type { AttachToCampana, AttachToConjunto } from "./anuncios-view";
import { ClientesView } from "./clientes-view";
import {
  ConstructorView,
  type ConstructorAttachTo as ConstructorViewAttachTo,
} from "./constructor-view";
import { EjecucionesView } from "./ejecuciones-view";
import { AudienciasView } from "./audiencias-view";
import { EquipoView } from "./equipo-view";
import { IntegrationsView } from "./integrations-view";
import {
  ControlRoomView,
  HealthView,
  type ModuloInicio,
} from "./secondary-views";
import { BotonDeAlertas } from "./alertas";
import { AsistenteFlotante } from "./asistente";
import { PaletaDeComandos } from "./paleta-comandos";
import { PuertaDeCliente } from "./puerta-cliente";
import { SelectorDeFechas } from "./selector-fechas";
import { ThinkingOrb } from "./ui";

type ItemDeMenu = {
  key: ViewKey;
  label: string;
  /** Solo visible para quien administra el equipo. */
  adminOnly?: boolean;
  /** Roles que pueden ver la entrada. Vacío: todos. */
  roles?: string[];
  /** Icono y resumen: solo los usan las tarjetas de Inicio, no el menú.
   *  Viven acá para que renombrar un módulo sea un cambio en un solo lugar. */
  icono?: LucideIcon;
  resumen?: string;
};

const navItems: ItemDeMenu[] = [
  { key: "control", label: "Inicio" },
  {
    // Antes "Anuncios" era una entrada aparte; ahora la ficha del cliente
    // trae su tabla de anuncios embebida, así que es una sola entrada.
    key: "clients",
    // Singular a propósito: adentro siempre es la ficha, las cuentas y las
    // campañas de UN cliente — la lista de arriba es solo el punto de
    // entrada, no lo que define la pantalla.
    label: "Cliente",
    roles: ["admin", "lead", "buyer"],
    icono: Building2,
    resumen: "Ficha de cada cliente, sus cuentas y sus anuncios en vivo.",
  },
  {
    key: "builder",
    label: "Creador de campañas",
    roles: ["admin", "lead", "buyer"],
    icono: Megaphone,
    resumen: "Arma y publica campañas en Google y Meta. Todo nace pausado.",
  },
  {
    key: "audiencias",
    label: "Audiencias",
    roles: ["admin", "lead", "buyer"],
    icono: Target,
    resumen: "Segmentos y cobertura geográfica por cuenta.",
  },
  {
    key: "health",
    label: "Dashboard C-Level",
    icono: LineChart,
    resumen: "La lectura ejecutiva: inversión, resultados y estado del dato.",
  },
];

/** Segunda sección del menú — gestión de cuenta, no trabajo de campaña día a
 * día, así que va separada de la operación principal. */
const navItemsGestion: ItemDeMenu[] = [
  {
    key: "historial",
    label: "Auditoría",
    roles: ["admin", "lead", "buyer", "analyst"],
    icono: History,
    resumen: "Qué se publicó, quién lo mandó y qué respondió cada paso.",
  },
  {
    key: "integrations",
    label: "Cuentas",
    icono: Plug,
    resumen: "Conecta Google y Meta, y elige qué cuentas se leen.",
  },
];

/**
 * Equipo no viaja con el resto del menú: administrar quién entra es una
 * tarea de cuenta, no de campaña, y se hace de vez en cuando. Va como
 * engranaje pegado a la ficha del usuario, que es donde se lo busca —
 * "mis cosas" y "quién más entra" viven juntas.
 */
const itemEquipo: ItemDeMenu = {
  key: "team",
  label: "Equipo",
  adminOnly: true,
  icono: Cog,
  resumen: "Quién entra, con qué rol y a qué clientes.",
};

/**
 * Las tarjetas de Inicio salen de las mismas entradas del menú: así el
 * vestíbulo nunca ofrece un módulo que el menú ya no tiene, ni lo nombra
 * distinto. Se excluye "Inicio" —sería una tarjeta hacia donde ya estás— y
 * las entradas sin icono, que son las que todavía no se pensaron para acá.
 */
function modulosDeInicio(role: string): ModuloInicio[] {
  const conGrupo = [
    ...navItems.map((item) => ({ item, grupo: "principal" as const })),
    ...navItemsGestion.map((item) => ({ item, grupo: "gestion" as const })),
    { item: itemEquipo, grupo: "gestion" as const },
  ];
  return conGrupo
    .filter(({ item }) => item.key !== "control" && puedeVerItem(item, role))
    .flatMap(({ item, grupo }) =>
      item.icono && item.resumen
        ? [
            {
              key: item.key,
              label: item.label,
              icono: item.icono,
              resumen: item.resumen,
              grupo,
            },
          ]
        : [],
    );
}

/** Radix Select no admite value="" — un id de portafolio real nunca vale esto. */
const TODOS_LOS_CLIENTES = "__todos__";

/** Marca de que ya se eligió cliente en la puerta de entrada, esta sesión de
 * navegador (ver `PuertaDeCliente` más abajo). */
const PUERTA_CLIENTE_STORAGE_KEY = "wiwo-ads-puerta-cliente-resuelta";

/** "hace 5 min", "hace 3 h", "hace 2 días" — para decir de cuándo es un dato. */
const roleLabels: Record<string, string> = {
  direction: "Dirección",
  lead: "Lead",
  buyer: "Buyer",
  analyst: "Analista",
};

export type DashboardIdentity = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

/** A qué abrir el Constructor cuando se navega hacia él desde Clientes o
 * desde una propuesta del asistente de IA. */
type BuilderContexto =
  | { modo: "nueva"; portfolioId: string; semilla?: SemillaDeCampana }
  | { modo: "adjuntar"; attachTo: AttachToCampana | AttachToConjunto };

/**
 * Fuerza a que el Constructor se reinicie al cambiar de contexto de destino
 * o, sin uno concreto, al cambiar el cliente marcado en el navbar — seguir
 * escribiendo la campaña de un cliente bajo el nombre de otro sería el tipo
 * de error que este reinicio evita.
 */
function builderConstructorKey(
  contexto: BuilderContexto | null,
  clienteGlobal: string | null,
): string {
  if (!contexto) return `nuevo:${clienteGlobal ?? ""}`;
  // El id de la propuesta manda cuando existe: dos propuestas seguidas del
  // asistente para el mismo cliente pueden llegar con el mismo nombre (o sin
  // nombre todavía), y ahí el nombre solo no alcanza para forzar un
  // Constructor nuevo — se seguía editando el borrador de la propuesta
  // anterior sin darse cuenta. Sin propuesta (desde "Clientes"), el nombre
  // sigue siendo la única pista real.
  if (contexto.modo === "nueva") {
    return `${contexto.portfolioId}:${contexto.semilla?.propuestaId ?? contexto.semilla?.name ?? ""}`;
  }
  const attachTo = contexto.attachTo;
  const adsetId = "adsetId" in attachTo ? attachTo.adsetId : "";
  return `${attachTo.campaignId}:${adsetId}`;
}

function builderConstructorAttachTo(
  contexto: BuilderContexto | null,
): ConstructorViewAttachTo | undefined {
  if (!contexto) return undefined;
  if (contexto.modo === "nueva") {
    return {
      portfolioId: contexto.portfolioId,
      platform: "google",
      accountId: "",
      campaignId: "",
      campaignName: "",
    };
  }
  const attachTo = contexto.attachTo;
  return "adsetId" in attachTo
    ? attachTo
    : { ...attachTo, adsetId: undefined, adsetName: undefined };
}

export default function WiwoDashboard({
  signOutPath,
  initialSnapshot,
  initialView = "control",
}: {
  signOutPath: string;
  initialSnapshot: {
    user: DashboardIdentity;
    dataUpdatedAt: number | null;
    performance: PerformanceSnapshot;
  };
  initialView?: ViewKey;
}) {
  const [view, setView] = useState<ViewKey>(initialView);
  /**
   * A qué cliente está mirando Clientes — vive acá, no adentro de
   * `ClientesView`, precisamente para que sobreviva a salir de esa vista y
   * volver. Antes era un "atajo" de un solo uso que se limpiaba al navegar a
   * cualquier otro lado; el problema real: eso también lo borraba al volver
   * a Clientes por el ítem normal del menú, así que la selección no
   * sobrevivía a mirar otra pantalla y regresar. Se elige tanto desde el
   * selector del navbar como desde la lista de la propia vista — por eso
   * vive acá y se pasa controlado, no como valor inicial.
   */
  const [clienteSeleccionado, setClienteSeleccionado] = useState<
    string | null
  >(null);
  const [performance, setPerformance] = useState(initialSnapshot.performance);
  const [rango, setRango] = useState<RangoId>(
    initialSnapshot.performance.rango?.id ?? RANGO_POR_DEFECTO,
  );
  const [cambiandoRango, setCambiandoRango] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  /** null: todavía no se consultó. `puedeActualizar` sale del servidor. */
  const [estadoDatos, setEstadoDatos] = useState<{
    construidoEn: number | null;
    tocaAutoActualizar: boolean;
    puedeActualizar: boolean;
  } | null>(null);
  // Cuenta la petición de rango más reciente: si dos llegan a destiempo, solo
  // se aplica la última. Sin esto, elegir "Últimos 90 días" y arrepentirse a
  // los 5 segundos por "Año en curso" podía terminar mostrando los datos del
  // rango equivocado si la primera respuesta (más lenta) llegaba después.
  const rangoSolicitadoRef = useRef(0);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [builderContexto, setBuilderContexto] = useState<BuilderContexto | null>(null);

  // Solo los clientes declarados tienen sentido para elegir acá — una cuenta
  // suelta sin cliente asignado no es algo que alguien "elija" al entrar.
  const clientesDeclarados = performance.portfolios.filter((p) => p.declared);
  const [mostrarPuertaCliente, setMostrarPuertaCliente] = useState(false);
  useEffect(() => {
    // Una vez por sesión de navegador (no en cada recarga dentro de la misma
    // pestaña): si ya se eligió, la marca queda en sessionStorage y no
    // vuelve a interrumpir hasta que se cierre la pestaña o se cierre sesión
    // y se abra otra. Arranca en `false` a propósito (ver la nota del tema,
    // arriba): así la mayoría de las cargas —donde ya se eligió antes— no
    // parpadean con la puerta encima.
    if (
      clientesDeclarados.length > 0 &&
      window.sessionStorage.getItem(PUERTA_CLIENTE_STORAGE_KEY) !== "1"
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ver nota de arriba
      setMostrarPuertaCliente(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  useEffect(() => {
    // A propósito en un efecto y no en el inicializador de useState: leer
    // localStorage durante el render rompería la hidratación (el servidor
    // siempre arranca en "dark", sin acceso a localStorage del navegador).
    const savedTheme = window.localStorage.getItem("wiwo-ads-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver nota de arriba
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
  }, []);

  // Los diálogos y menús se pintan fuera de este árbol (portales): el tema
  // tiene que estar en <html> para que también los alcance.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);
  const [paletaAbierta, setPaletaAbierta] = useState(false);
  useEffect(() => {
    function alTeclear(evento: KeyboardEvent) {
      if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        setPaletaAbierta((abierta) => !abierta);
      }
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);
  const destinosDePaleta = [...navItems, ...navItemsGestion].filter((item) =>
    puedeVerItem(item, initialSnapshot.user.role),
  );

  function changeTheme(checked: boolean) {
    const nextTheme = checked ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem("wiwo-ads-theme", nextTheme);
  }

  const healthPortfolio =
    performance.portfolios.find((item) => item.id === clienteSeleccionado) ?? null;
  // Todas las cuentas del cliente, no una sola: antes elegir "Amipass" en
  // realidad elegía una de sus cuentas de Windsor al azar y las demás no
  // aparecían en ningún lado.
  const healthChecks = healthPortfolio
    ? healthPortfolio.accounts.flatMap((account) =>
        performanceHealthChecks(account, performance.generatedAt),
      )
    : [];
  const healthCritical = healthChecks.filter(
    (check) => check.state === "critical",
  ).length;
  const healthWarnings = healthChecks.filter(
    (check) => check.state === "warning",
  ).length;
  const healthOk = healthChecks.filter(
    (check) => check.state === "healthy",
  ).length;
  const healthScore = healthChecks.length
    ? Math.round((healthOk / healthChecks.length) * 100)
    : 0;

  async function cambiarRango(siguiente: RangoId) {
    if (siguiente === rango) return;
    const solicitud = ++rangoSolicitadoRef.current;
    setRango(siguiente);
    setCambiandoRango(true);
    try {
      await refreshOperationalData(siguiente, solicitud);
    } finally {
      // Si mientras se esperaba llegó un cambio de rango más nuevo, ese es el
      // que manda el indicador de carga: apagarlo acá lo daría por terminado
      // aunque la petición real todavía siga en vuelo.
      if (solicitud === rangoSolicitadoRef.current) setCambiandoRango(false);
    }
  }

  /**
   * Relee todo desde Windsor: borra el caché de métricas, reconstruye el
   * catálogo de campañas (lo único que nota lo recién creado, lo pausado y lo
   * borrado de verdad en la plataforma) y vuelve a pedir el tablero. Es lo
   * que hace el botón "Actualizar" y, sola, la actualización automática
   * (cada 2 h como mucho, ver `INTERVALO_AUTOACTUALIZACION_MS`).
   */
  async function actualizarDatos(automatica = false) {
    if (actualizando) return;
    setActualizando(true);
    const aviso = toast.loading(
      automatica ? "Actualización automática de datos…" : "Actualizando datos…",
      { description: "Lee Windsor de nuevo; puede tardar unos segundos." },
    );
    try {
      const response = await fetch("/api/actualizar", { method: "POST" });
      let body: {
        error?: string;
        construidoEn?: number | null;
        campanas?: number;
        anuncios?: number;
        fallos?: string[];
        /** Alguien más (otra pestaña, otra persona) ya está en medio del
         * mismo barrido completo — ver el candado en app/api/actualizar. */
        yaEnCurso?: boolean;
      };
      try {
        body = await response.json();
      } catch {
        // Reconstruir el catálogo completo puede tardar varios minutos —
        // si la plataforma corta la conexión a mitad de camino, el cuerpo
        // llega vacío y `.json()` explota con un mensaje de navegador que no
        // dice nada útil. Esto no significa que nada se haya leído: solo que
        // no llegó a tiempo la respuesta.
        throw new Error(
          "La actualización tardó demasiado y se cortó la conexión. Intenta de nuevo — puede que solo falte volver a pedirla.",
        );
      }
      if (!response.ok) throw new Error(body.error ?? "No se pudo actualizar");
      if (body.yaEnCurso) {
        toast.info("Ya se estaba actualizando", {
          id: aviso,
          description: "Alguien más lo pidió hace un momento — esperá a que termine.",
        });
        return;
      }
      await refreshOperationalData();
      setEstadoDatos((actual) => ({
        puedeActualizar: actual?.puedeActualizar ?? true,
        construidoEn: body.construidoEn ?? Date.now(),
        tocaAutoActualizar: false,
      }));
      if (body.fallos && body.fallos.length > 0) {
        toast.warning("Datos actualizados, con avisos", {
          id: aviso,
          description: body.fallos.join(" · "),
        });
      } else {
        toast.success("Datos actualizados", {
          id: aviso,
          description: `${body.campanas ?? 0} campañas · ${body.anuncios ?? 0} anuncios`,
        });
      }
    } catch (issue) {
      toast.error("No se pudo actualizar", {
        id: aviso,
        description: issue instanceof Error ? issue.message : undefined,
      });
    } finally {
      setActualizando(false);
    }
  }

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const response = await fetch("/api/actualizar", { cache: "no-store" });
        if (!response.ok) return;
        const estado = (await response.json()) as {
          construidoEn: number | null;
          tocaAutoActualizar: boolean;
          puedeActualizar: boolean;
        };
        if (cancelado) return;
        setEstadoDatos(estado);
        // No hay cron en este hosting, así que la dispara la primera sesión
        // con permiso que abre la app pasado el intervalo (2 h, ver
        // INTERVALO_AUTOACTUALIZACION_MS en app/api/actualizar/route.ts). Acá
        // se suma un tope de 1 intento por hora por navegador, para que un
        // fallo no la relance cada vez que alguien recarga la página.
        if (estado.puedeActualizar && estado.tocaAutoActualizar) {
          const ultimo = Number(
            window.localStorage.getItem("wiwo-ads-ultima-actualizacion-auto") ?? 0,
          );
          if (Date.now() - ultimo > 60 * 60 * 1000) {
            window.localStorage.setItem(
              "wiwo-ads-ultima-actualizacion-auto",
              String(Date.now()),
            );
            void actualizarDatos(true);
          }
        }
      } catch {
        // Sin estado de actualización el botón simplemente no aparece.
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  async function refreshOperationalData(
    periodo: RangoId = rango,
    solicitud: number = ++rangoSolicitadoRef.current,
  ) {
    try {
      const response = await fetch(
        `/api/dashboard?rango=${encodeURIComponent(periodo)}`,
        { headers: { accept: "application/json" } },
      );
      const body = (await response.json()) as {
        performance?: PerformanceSnapshot;
      };
      // Llegó una petición de periodo más nueva mientras esta seguía en
      // vuelo: se descarta, aunque haya respondido bien.
      if (solicitud !== rangoSolicitadoRef.current) return;
      if (!response.ok || !body.performance) return;
      setPerformance(body.performance);
      // Si el cliente elegido deja de existir en la lectura nueva, se limpia
      // la selección en vez de dejarla apuntando a un cliente que ya no está.
      setClienteSeleccionado((current) =>
        current !== null &&
        body.performance!.portfolios.some((item) => item.id === current)
          ? current
          : null,
      );
    } catch {
      // The integration surface already reports provider errors.
    }
  }

  return (
    <div className="theme-shell" data-theme={theme}>
    {mostrarPuertaCliente && (
      <PuertaDeCliente
        clientes={clientesDeclarados}
        onElegir={(portfolioId) => {
          setClienteSeleccionado(portfolioId);
          window.sessionStorage.setItem(PUERTA_CLIENTE_STORAGE_KEY, "1");
          setMostrarPuertaCliente(false);
        }}
      />
    )}
    <SidebarProvider>
      <AppSidebar
        view={view}
        currentUser={initialSnapshot.user}
        signOutPath={signOutPath}
        theme={theme}
        onThemeChange={changeTheme}
        onNavigate={setView}
        onBuscar={() => setPaletaAbierta(true)}
        clienteId={clienteSeleccionado}
        clienteNombre={
          performance.portfolios.find((item) => item.id === clienteSeleccionado)?.name ?? null
        }
        rango={rango}
        puedeAprobar={
          initialSnapshot.user.role === "admin" || initialSnapshot.user.role === "lead"
        }
        onCambioAplicado={() => void refreshOperationalData()}
      />
      <PaletaDeComandos
        open={paletaAbierta}
        onOpenChange={setPaletaAbierta}
        destinos={destinosDePaleta}
        clientes={performance.portfolios
          .filter((item) => item.declared)
          .map((item) => ({ id: item.id, name: item.name }))}
        onIrA={setView}
        onElegirCliente={setClienteSeleccionado}
      />

      <SidebarInset className="min-w-0 bg-canvas">
        <AppHeader
          view={view}
          performance={performance}
          rango={rango}
          cambiandoRango={cambiandoRango}
          onRangoChange={(valor) => void cambiarRango(valor)}
          actualizando={actualizando}
          puedeActualizar={estadoDatos?.puedeActualizar ?? false}
          ultimaActualizacion={estadoDatos?.construidoEn ?? null}
          onActualizar={() => void actualizarDatos(false)}
          clienteSeleccionado={clienteSeleccionado}
          onSelectCliente={(portfolioId) => {
            // Cambiar de cliente cambia con quién se trabaja, no dónde:
            // antes esto además mandaba siempre a Clientes, y quien estaba en
            // el Dashboard C-Level o en el Creador de campañas perdía su lugar.
            setClienteSeleccionado(
              portfolioId === TODOS_LOS_CLIENTES ? null : portfolioId,
            );
          }}
        />
        <div className="telemetry-grid min-h-[calc(100svh-4rem)]">
          {view === "control" && (
            <ControlRoomView
              nombre={initialSnapshot.user.displayName.trim().split(/\s+/)[0] || "equipo"}
              performance={performance}
              modulos={modulosDeInicio(initialSnapshot.user.role)}
              onNavigate={setView}
              onOpenIntegrations={() => setView("integrations")}
            />
          )}
          {view === "health" && (
            <HealthView
              client={clienteSeleccionado}
              performance={performance}
              onOpenIntegrations={() => setView("integrations")}
              checks={healthChecks}
              okCount={healthOk}
              totalCount={healthChecks.length}
              score={healthScore}
              critical={healthCritical}
              warnings={healthWarnings}
              puedeVerResumen={
                initialSnapshot.user.role === "admin" || initialSnapshot.user.role === "lead"
              }
            />
          )}
          {view === "clients" && (
            <ClientesView
              performance={performance}
              seleccionado={clienteSeleccionado}
              onSeleccionar={setClienteSeleccionado}
              onCrearCampana={(portfolioId) => {
                setBuilderContexto({ modo: "nueva", portfolioId });
                setView("builder");
              }}
              onAgregarConjunto={(attachTo) => {
                setBuilderContexto({ modo: "adjuntar", attachTo });
                setView("builder");
              }}
              onAgregarAnuncio={(attachTo) => {
                setBuilderContexto({ modo: "adjuntar", attachTo });
                setView("builder");
              }}
            />
          )}
          {view === "builder" && (
            <ConstructorView
              // Cada contexto nuevo es un constructor nuevo: reiniciar el
              // formulario al cambiar de cliente o de campaña de destino, no
              // arrastrar lo que se había escrito para otra cosa.
              key={builderConstructorKey(builderContexto, clienteSeleccionado)}
              attachTo={builderConstructorAttachTo(builderContexto)}
              semillaIA={
                builderContexto?.modo === "nueva" ? builderContexto.semilla : undefined
              }
              clienteGlobal={clienteSeleccionado}
              onCambiarClienteGlobal={setClienteSeleccionado}
              onPublicado={() => void refreshOperationalData()}
            />
          )}
          {view === "historial" && <EjecucionesView />}
          {view === "team" && (
            <EquipoView
              portfolios={performance.portfolios.map((item) => ({
                id: item.id,
                name: item.name,
              }))}
            />
          )}
          {view === "integrations" && (
            <IntegrationsView
              currentUser={initialSnapshot.user}
              signOutPath={signOutPath}
              onPerformanceUpdated={() => void refreshOperationalData()}
              portfolios={performance.portfolios}
            />
          )}
          {view === "audiencias" && (
            <AudienciasView
              portfolios={performance.portfolios}
              ads={performance.ads}
              clienteSeleccionado={clienteSeleccionado}
              puedeAprobar={
                initialSnapshot.user.role === "admin" || initialSnapshot.user.role === "lead"
              }
            />
          )}
        </div>
      </SidebarInset>

      <AsistenteFlotante
        clienteId={clienteSeleccionado}
        clienteNombre={
          performance.portfolios.find((item) => item.id === clienteSeleccionado)?.name ?? null
        }
        rango={rango}
        puedeAprobar={
          initialSnapshot.user.role === "admin" || initialSnapshot.user.role === "lead"
        }
        onAbrirConstructor={(portfolioId, semilla) => {
          setClienteSeleccionado(portfolioId);
          setBuilderContexto({ modo: "nueva", portfolioId, semilla });
          setView("builder");
        }}
        onCambioAplicado={() => void refreshOperationalData()}
      />
      <Toaster position="bottom-right" richColors />
    </SidebarProvider>
    </div>
  );
}

function puedeVerItem(item: ItemDeMenu, role: string): boolean {
  return (
    (!item.adminOnly || role === "admin") &&
    (!item.roles || item.roles.includes(role))
  );
}

/**
 * Barra lateral al estilo MetriQ: logo, búsqueda, lista plana de secciones con
 * la activa marcada por una pastilla, y al pie la sesión y el tema.
 */
function AppSidebar({
  view,
  currentUser,
  signOutPath,
  theme,
  onThemeChange,
  onNavigate,
  onBuscar,
  clienteId,
  clienteNombre,
  rango,
  puedeAprobar,
  onCambioAplicado,
}: {
  view: ViewKey;
  currentUser: DashboardIdentity;
  signOutPath: string;
  theme: "dark" | "light";
  onThemeChange: (checked: boolean) => void;
  onNavigate: (view: ViewKey) => void;
  onBuscar: () => void;
  clienteId: string | null;
  clienteNombre: string | null;
  rango: string;
  puedeAprobar: boolean;
  onCambioAplicado: () => void;
}) {
  function grupo(titulo: string | null, items: ItemDeMenu[]) {
    const visibles = items.filter((item) => puedeVerItem(item, currentUser.role));
    if (visibles.length === 0) return null;
    return (
      <SidebarGroup className="px-2 py-1">
        {titulo && (
          <SidebarGroupLabel className="font-micro mb-1 h-6 px-4 text-[0.62rem] text-muted-foreground">
            {titulo}
          </SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu className="gap-1">
            {visibles.map((item) => {
              const activo = view === item.key;
              return (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={activo}
                    onClick={() => onNavigate(item.key)}
                    className={cn(
                      "h-11 gap-2.5 rounded-full px-4 text-[0.95rem] font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-bold data-[active=true]:text-foreground",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        activo ? "bg-primary" : "bg-transparent",
                      )}
                    />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <Sidebar collapsible="offcanvas" className="border-sidebar-border">
      <SidebarHeader className="gap-4 px-4 pt-5 pb-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo, el proyecto todavía no usa next/image en ningún lado */}
        <img
          src={theme === "light" ? "/wiwo-ads-electric.png" : "/wiwo-ads-lime.png"}
          alt="WiWO.ADS"
          className="h-9 w-auto max-w-full self-start object-contain object-left"
        />
        <button
          type="button"
          onClick={onBuscar}
          className="flex h-11 w-full items-center gap-2.5 rounded-full border border-border bg-field px-4 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Buscar…</span>
        </button>
        <BotonDeAlertas
          clienteId={clienteId}
          clienteNombre={clienteNombre}
          rango={rango}
          puedeAprobar={puedeAprobar}
          onCambioAplicado={onCambioAplicado}
        />
      </SidebarHeader>

      <SidebarContent className="gap-2 py-3">
        {grupo(null, navItems)}
        {grupo("Gestión", navItemsGestion)}
      </SidebarContent>

      <SidebarFooter className="gap-3 border-t border-sidebar-border px-4 py-4">
        {puedeVerItem(itemEquipo, currentUser.role) && (
          // Solo el engranaje. Sin texto visible, el nombre lo llevan
          // `aria-label` (lectores de pantalla) y `title` (pista al pasar el
          // mouse): un icono suelto sin ninguno de los dos es un botón que
          // nadie sabe qué hace hasta que lo aprieta.
          <button
            type="button"
            onClick={() => onNavigate(itemEquipo.key)}
            aria-label={itemEquipo.label}
            title={itemEquipo.label}
            aria-current={view === itemEquipo.key ? "page" : undefined}
            className={cn(
              "flex size-10 shrink-0 items-center justify-center self-start rounded-full transition-colors",
              view === itemEquipo.key
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Cog className="size-5" aria-hidden="true" />
          </button>
        )}
        <div className="min-w-0">
          <p className="truncate text-[0.95rem] font-bold text-foreground">
            {currentUser.displayName}
          </p>
          <p className="truncate text-xs text-muted-foreground">{currentUser.email}</p>
          <span className="mt-2 inline-block rounded-md bg-primary px-2 py-0.5 text-[0.65rem] font-extrabold tracking-wide text-primary-foreground uppercase">
            {roleLabels[currentUser.role] ?? currentUser.role}
          </span>
        </div>
        <a
          href={signOutPath}
          onClick={() => {
            // Para que la próxima persona que entre en esta misma pestaña
            // (u otra sesión) vuelva a pasar por la puerta de cliente, en
            // vez de heredar en silencio la marca de que "ya se eligió".
            window.sessionStorage.removeItem(PUERTA_CLIENTE_STORAGE_KEY);
          }}
          className="w-fit rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-danger"
        >
          Cerrar sesion
        </a>
        <div
          role="group"
          aria-label="Tema de la interfaz"
          className="flex w-fit items-center gap-0.5 rounded-full border border-border bg-field p-1"
        >
          {(
            [
              { id: "light" as const, label: "Light", Icono: Sun },
              { id: "dark" as const, label: "Dark", Icono: Moon },
            ]
          ).map(({ id, label, Icono }) => (
            <button
              key={id}
              type="button"
              aria-pressed={theme === id}
              onClick={() => onThemeChange(id === "light")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                theme === id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icono className="size-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

/**
 * Encabezado mínimo: solo lo que cambia lo que se ve — cliente, periodo y
 * actualizar. El tema y la sesión viven en la barra lateral.
 */
function AppHeader({
  view,
  performance,
  rango,
  cambiandoRango,
  onRangoChange,
  onSelectCliente,
  clienteSeleccionado,
  actualizando,
  puedeActualizar,
  ultimaActualizacion,
  onActualizar,
}: {
  view: ViewKey;
  performance: PerformanceSnapshot;
  rango: RangoId;
  cambiandoRango: boolean;
  onRangoChange: (valor: RangoId) => void;
  /** Cambiar de cliente sin cambiar de pantalla. */
  onSelectCliente: (portfolioId: string) => void;
  /** El cliente activo, para que el selector refleje cambios hechos desde otras pantallas. */
  clienteSeleccionado: string | null;
  actualizando: boolean;
  puedeActualizar: boolean;
  /** Cuándo se reconstruyó por última vez el catálogo de campañas. */
  ultimaActualizacion: number | null;
  onActualizar: () => void;
}) {
  // El periodo solo se ofrece donde cambia lo que se ve. En Equipo o Cuentas
  // sería un control que no hace nada, y eso enseña a desconfiar de los
  // controles.
  const conPeriodo = ["control", "health", "ads", "clients"].includes(view);
  // Solo clientes declarados: `performance.portfolios` también trae una
  // entrada por cada cuenta suelta sin cliente asignado, y esas no existen
  // como portafolio real en `/api/clientes`.
  const clientesDeclarados = performance.portfolios.filter((p) => p.declared);
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 bg-canvas/90 px-4 backdrop-blur-xl md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="size-9 rounded-full text-muted-foreground hover:bg-sidebar-accent" />
        {clientesDeclarados.length > 0 && (
          <Select
            value={clienteSeleccionado ?? TODOS_LOS_CLIENTES}
            onValueChange={onSelectCliente}
          >
            <SelectTrigger size="sm" className="hidden w-48 border-border bg-card md:flex">
              <Building2 className="size-3.5 text-brand" />
              <SelectValue placeholder="Ir a un cliente…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_LOS_CLIENTES}>Todos los clientes</SelectItem>
              {clientesDeclarados.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex items-center gap-2">
        {conPeriodo && (
          <div className="hidden items-center gap-2 sm:flex">
            <SelectorDeFechas
              valor={rango}
              onChange={onRangoChange}
              cargando={cambiandoRango}
              disabled={cambiandoRango}
            />
            {/* El botón ya muestra el rango elegido (con su propio ícono de
                carga mientras cambia) — acá solo se agrega lo que ese botón
                no dice: que el periodo sigue abierto. Un periodo abierto se
                marca porque compararlo con uno cerrado y leer una caída es
                el error clásico. Si el nombre del rango ya lo dice solo
                ("Mes en curso"), no hace falta repetirlo al lado. */}
            {!cambiandoRango &&
              performance.rango?.enCurso &&
              !performance.rango.label.toLowerCase().includes("en curso") && (
                <span className="hidden whitespace-nowrap text-[0.68rem] font-semibold text-muted-foreground 2xl:inline">
                  En curso
                </span>
              )}
          </div>
        )}
        {puedeActualizar && (
          <button
            type="button"
            onClick={onActualizar}
            disabled={actualizando}
            aria-label="Actualizar datos"
            title={
              ultimaActualizacion
                ? `Catálogo de campañas actualizado ${haceTiempo(ultimaActualizacion)}. Se actualiza solo cada semana; pulsa para hacerlo ahora.`
                : "Actualizar datos desde Windsor. Se actualiza solo cada semana."
            }
            className="flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-xs font-bold text-foreground transition-colors hover:border-brand disabled:opacity-70"
          >
            {actualizando ? (
              <ThinkingOrb size="xs" state="thinking" label="" />
            ) : (
              <RefreshCw className="size-3.5 text-brand" />
            )}
            <span className="hidden lg:inline">
              {actualizando
                ? "Actualizando…"
                : ultimaActualizacion
                  ? `Actualizado ${haceTiempo(ultimaActualizacion)}`
                  : "Actualizar"}
            </span>
          </button>
        )}
      </div>
    </header>
  );
}

/**
 * Las dos verificaciones reales de una cuenta: ¿sigue autorizada la lectura?,
 * ¿la métrica llega y está al día? No incluye "cambios automáticos": ese dato
 * es el mismo para cualquier cuenta —desactivado por diseño, en todo el
 * sistema— así que no es una verificación de esta cuenta en particular. Se
 * muestra una sola vez, como nota fija de la pantalla, en vez de repetirse
 * idéntico en cada fila.
 */
function performanceHealthChecks(
  account: PerformanceAccountSummary,
  referenceTime: number,
): HealthCheck[] {
  const platform = platformLabel(account.provider);
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
      account: account.name,
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
      account: account.name,
      platform,
      state: metricState,
      detail: account.hasData
        ? `Datos disponibles hasta ${formatMetricDate(account.dataThrough)}`
        : account.issue ?? "La primera lectura todavía no entrega filas",
      lastCheck: relativeTime(account.lastSyncedAt, referenceTime),
      owner: "WiWO.ADS",
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
