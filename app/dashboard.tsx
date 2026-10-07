"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Cog,
  History,
  Home,
  ClipboardCheck,
  ShieldAlert,
  FlaskConical,
  LineChart,
  Megaphone,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  UsersRound,
  RefreshCw,
  Search,
  Sun,
  type LucideIcon,
  Lightbulb,
  HeartPulse,
  Stethoscope,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { agruparPorEmpresa } from "@/lib/empresas";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import type {
  AdSummary,
  PerformanceAccountSummary,
  PerformanceSnapshot,
} from "@/lib/performance-store";
import { platformLabel } from "@/lib/plataformas";
import { ROLE_LABELS, type Role } from "@/lib/permisos";
import { RANGO_POR_DEFECTO, type RangoId } from "@/lib/rangos";
import { fetchConReintento } from "@/lib/fetch-reintento";
import { haceTiempo } from "@/lib/tiempo";
import { cn } from "@/lib/utils";
import type { SemillaDeCampana } from "@/lib/constructor";
import { type HealthCheck, type ViewKey } from "./data";
import type { AttachToCampana, AttachToConjunto } from "./anuncios-view";
import { ClientesView } from "./clientes-view";
import type { ConstructorAttachTo as ConstructorViewAttachTo } from "./constructor-view";
import {
  ControlRoomView,
  HealthView,
  type ModuloInicio,
} from "./secondary-views";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BotonDeAlertas } from "./alertas";
import { PaletaDeComandos } from "./paleta-comandos";
import { PuertaDeCliente } from "./puerta-cliente";
import { SelectorDeFechas } from "./selector-fechas";
import { ThinkingOrb } from "./ui";

/**
 * Las pantallas pesadas se bajan solo cuando se abren. Antes todo viajaba junto en un único paquete de ~700 KB
 * (el Creador de campañas solo son ~3.000 líneas) aunque la persona entrara solo a mirar el dashboard.
 * Se renderizan en el navegador (`ssr: false`): ninguna necesita estar en el HTML inicial.
 */
const Cargando = () => (
  <div className="flex items-center gap-3 p-8 text-sm text-foreground/50">
    <ThinkingOrb size="md" state="thinking" label="" />
    Cargando…
  </div>
);
const cargarVista = <T,>(importar: () => Promise<React.ComponentType<T>>) =>
  dynamic(async () => ({ default: await importar() }) as { default: React.ComponentType<T> }, { ssr: false, loading: Cargando });
const ConstructorView = cargarVista(() => import("./constructor-view").then((m) => m.ConstructorView));
const MedicionView = cargarVista(() => import("./medicion-view").then((m) => m.MedicionView));
const InversionView = cargarVista(() => import("./inversion-view").then((m) => m.InversionView));
const DiagnosticoView = cargarVista(() => import("./diagnostico-view").then((m) => m.DiagnosticoView));
const DecisionesView = cargarVista(() => import("./sugerencias-tinder").then((m) => m.BotonDeSugerencias));
const ImpulsarView = cargarVista(() => import("./impulsar-view").then((m) => m.ImpulsarView));
const ReglasView = cargarVista(() => import("./reglas-view").then((m) => m.ReglasView));
const SolicitudesView = cargarVista(() => import("./solicitudes-view").then((m) => m.SolicitudesView));
const AuditoriaView = cargarVista(() => import("./auditoria-view").then((m) => m.AuditoriaView));
const SimuladorView = cargarVista(() => import("./simulador-view").then((m) => m.SimuladorView));
const EquipoView = cargarVista(() => import("./equipo-view").then((m) => m.EquipoView));
const IntegrationsView = cargarVista(() => import("./integrations-view").then((m) => m.IntegrationsView));
const AudienciasView = cargarVista(() => import("./audiencias-view").then((m) => m.AudienciasView));
const AsistenteFlotante = dynamic(() => import("./asistente").then((m) => m.AsistenteFlotante), { ssr: false, loading: () => null });

type ItemDeMenu = {
  key: ViewKey;
  label: string;
  /** Roles que pueden ver la entrada. Vacío: todos. */
  roles?: string[];
  /** Icono y resumen: solo los usan las tarjetas de Inicio, no el menú.
   *  Viven acá para que renombrar un módulo sea un cambio en un solo lugar. */
  icono?: LucideIcon;
  resumen?: string;
  /**
   * Sigue visible en el menú (a propósito: no se quita, para no dar la
   * sensación de que el módulo dejó de existir), pero no se puede entrar.
   * Se excluye también de las tarjetas de Inicio, ver `modulosDeInicio`.
   */
  bloqueado?: boolean;
  /** No aparece en el menú ni en las tarjetas, pero la ventana sigue en el código (por ejemplo, la Sala de control). */
  oculto?: boolean;
};

const navItems: ItemDeMenu[] = [
  {
    // La primera ventana al entrar: lo que se puede resolver ahora, en tarjetas.
    key: "decisiones",
    label: "Decisiones",
    roles: ["admin", "supervisor", "analyst"],
    icono: Lightbulb,
    resumen: "Cambios que se pueden hacer ahora: pausar, ajustar presupuesto o subir contenido nuevo.",
  },
  // Oculta del menú por decisión del equipo; la ventana sigue en el código.
  { key: "control", label: "Sala de control", icono: Home, oculto: true },
  {
    key: "medicion",
    label: "Salud de medición",
    roles: ["admin"],
    icono: HeartPulse,
    resumen: "¿Se mide bien lo que se paga? GA4, Tag Manager, eventos clave y conversiones.",
    // Visible pero inactivo por ahora (decisión del equipo): se muestra con «Próximamente».
    bloqueado: true,
  },
  {
    key: "inversion",
    label: "Inversión",
    roles: ["admin", "supervisor", "analyst"],
    icono: Wallet,
    resumen: "Cuánto se gastó, contra qué presupuesto y adónde se fue.",
  },
  {
    key: "health",
    label: "Dashboard C-Level",
    icono: LineChart,
    resumen: "Resultados por objetivo y estado de las campañas y de las fuentes de datos.",
  },
  {
    // Antes "Anuncios" era una entrada aparte; ahora la ficha del cliente
    // trae su tabla de anuncios embebida, así que es una sola entrada.
    key: "clients",
    // Singular a propósito: adentro siempre es la ficha, las cuentas y las
    // campañas de UN cliente — la lista de arriba es solo el punto de
    // entrada, no lo que define la pantalla.
    label: "Cliente",
    roles: ["admin", "supervisor", "analyst"],
    icono: Building2,
    resumen: "Ficha de cada cliente, sus cuentas y sus anuncios en vivo.",
  },
  {
    key: "builder",
    label: "Creador de campañas",
    roles: ["admin", "supervisor", "analyst"],
    icono: Megaphone,
    resumen: "Arma y publica campañas en Google y Meta. Los analistas las envían a aprobación; al aprobarse quedan corriendo.",
  },
  {
    key: "solicitudes",
    label: "Solicitudes",
    roles: ["admin", "supervisor", "analyst"],
    icono: ClipboardCheck,
    resumen: "Lo que se envió a revisión: aprobar, rechazar y seguir su estado.",
  },
  {
    key: "simulador",
    label: "Simulador",
    roles: ["admin", "supervisor", "analyst"],
    icono: FlaskConical,
    resumen: "Proyecta qué podría dar un monto, con el historial real del cliente.",
    // Visible pero inactivo por ahora (decisión del equipo): se muestra con «Próximamente».
    bloqueado: true,
  },
];

/** Segunda sección del menú — gestión de cuenta, no trabajo de campaña día a
 * día, así que va separada de la operación principal. */
const navItemsGestion: ItemDeMenu[] = [
  {
    key: "historial",
    label: "Auditoría",
    roles: ["admin", "supervisor", "analyst"],
    icono: History,
    resumen: "Todo queda registrado: pedidos al bot, solicitudes, decisiones y cada cambio con su antes y después.",
  },
  {
    key: "reglas",
    label: "Reglas",
    roles: ["admin", "supervisor"],
    icono: ShieldAlert,
    resumen: "Reglas como las de Meta y Google: por ejemplo pausar un anuncio al llegar a cierto gasto.",
    // Visible pero inactivo por ahora (decisión del equipo): se muestra con «Próximamente».
    bloqueado: true,
  },
  {
    key: "diagnostico",
    label: "Diagnóstico",
    roles: ["admin"],
    icono: Stethoscope,
    resumen: "Qué llave de Meta ve cada cuenta y página, y qué permiso falta.",
  },
  {
    key: "integrations",
    label: "Cuentas",
    // Solo administración: las conexiones y sus credenciales no son para el resto del equipo.
    roles: ["admin"],
    icono: Plug,
    resumen: "Conecta Google y Meta, y elige qué cuentas se leen.",
  },
  {
    key: "audiencias",
    label: "Lookalike",
    roles: ["admin", "supervisor"],
    icono: UsersRound,
    resumen: "Carga una base de clientes (Excel o CSV) para audiencias y lookalike.",
    // Visible pero inactivo por ahora (decisión del equipo): se muestra con «Próximamente».
    bloqueado: true,
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
  // No solo admin: supervisor y analyst también pueden sumar gente (con su
  // propia jerarquía de a quién) — ver lib/permisos.ts, rolesAsignables.
  roles: ["admin", "supervisor", "analyst"],
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
    .filter(
      ({ item }) =>
        item.key !== "control" && !item.bloqueado && puedeVerItem(item, role),
    )
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

/**
 * Fetch con reintento y backoff, para tolerar los cortes de red pasajeros
 * del servidor compartido (otro proceso del VPS satura la CPU un momento,
 * ver docs/DESPLIEGUE_VPS.md) sin que el dashboard se vea "colgado" a la
 * primera. Cada intento tiene su propio timeout: sin esto, un intento que
 * nunca responde bloquearía todos los reintentos siguientes.
 *
 * Solo reintenta fallos de RED (fetch que ni siquiera consigue respuesta).
 * Una respuesta HTTP de error (404, 500…) es una respuesta válida del
 * servidor y se devuelve tal cual — reintentarla a ciegas no la arregla.
 */
export type DashboardIdentity = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  portfolioIds: string[];
};

/** A qué abrir el Constructor cuando se navega hacia él desde Clientes o
 * desde una propuesta del asistente de IA. */
type BuilderContexto =
  | { modo: "nueva"; portfolioId: string; semilla?: SemillaDeCampana }
  | { modo: "adjuntar"; attachTo: AttachToCampana | AttachToConjunto; semilla?: SemillaDeCampana };

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
  // Una versión nueva de un anuncio (con su semilla) no debe reusar el borrador de otra del mismo conjunto.
  return `${attachTo.campaignId}:${adsetId}:${contexto.semilla?.propuestaId ?? ""}`;
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
  initialView = "decisiones",
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
  const abrirCuentas = () => {
    if (initialSnapshot.user.role === "admin") setView("integrations");
    else toast.info("Las cuentas conectadas las administra un administrador.");
  };
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
  // Con un portafolio asignado (el primero de la lista, para un cliente
  // real siempre es el único), la vista arranca ya puesta ahí en vez de en
  // "Todos los clientes" — la persona no tiene que buscarse a sí misma en
  // el selector cada vez que entra.
  // Único lugar que decide esto: admin y supervisor son los dos roles con
  // crear_campanas (lib/permisos.ts). Reportado en producción (2026-09-28):
  // el ítem "Creador de campañas" del menú ya se ocultaba para el resto,
  // pero los botones "+ Conjunto" / "+ Anuncio" dentro de Cliente llevaban a
  // la misma vista sin este chequeo — un analista podía ver y usar el
  // Constructor entero (no publicar: la API ya lo bloqueaba, pero sí ver la
  // interfaz completa, que es justo lo que no debía pasar).
  const puedeCrearCampanas =
    initialSnapshot.user.role === "admin" ||
    initialSnapshot.user.role === "supervisor" ||
    initialSnapshot.user.role === "analyst";
  // Los analistas arman pero no publican: lo suyo va a revisión de un supervisor.
  const soloEnviaARevision = initialSnapshot.user.role === "analyst";
  // Pendientes por revisar + novedades sin leer: el número que se ve junto a «Solicitudes».
  const [avisoSolicitudes, setAvisoSolicitudes] = useState(0);
  // «Impulsar» vive dentro de Cliente: se abre en un panel sobre la tabla.
  const [impulsarAbierto, setImpulsarAbierto] = useState(false);
  // Reglas automáticas: quien aprueba cambios las evalúa cada pocos minutos mientras tiene la app abierta.
  const puedeEvaluarReglas = initialSnapshot.user.role === "admin" || initialSnapshot.user.role === "supervisor";
  useEffect(() => {
    if (!puedeEvaluarReglas) return;
    const evaluar = () =>
      fetch("/api/reglas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ evaluar: true }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { disparadas?: Array<{ entidad: string; resultado: string }> } | null) => {
          if (j?.disparadas?.length) toast.warning(`Regla cumplida: ${j.disparadas.map((d) => `${d.entidad} — ${d.resultado}`).join(" · ")}`);
        })
        .catch(() => undefined);
    const primera = window.setTimeout(evaluar, 20000);
    const t = window.setInterval(evaluar, 300000);
    return () => {
      window.clearTimeout(primera);
      window.clearInterval(t);
    };
  }, [puedeEvaluarReglas]);
  useEffect(() => {
    let vivo = true;
    const leer = () =>
      fetch("/api/solicitudes?resumen=1", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { porRevisar: number; novedades: number } | null) => {
          if (vivo && j) setAvisoSolicitudes(j.porRevisar + j.novedades);
        })
        .catch(() => undefined);
    void leer();
    const t = window.setInterval(leer, 120000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [view]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<
    string | null
  >(initialSnapshot.user.portfolioIds[0] ?? null);
  const [performance, setPerformance] = useState(initialSnapshot.performance);
  // Los anuncios (casi 3.000 filas, el 90 % del peso) no viajan con el tablero:
  // se piden solo del cliente que se está mirando en la tabla de Cliente.
  // Anuncios ya leídos por cliente: al volver a un cliente se ven al instante y se refrescan en segundo plano.
  const [cacheAnuncios, setCacheAnuncios] = useState<Record<string, { ads: AdSummary[]; at: number }>>({});
  const cacheAnunciosRef = useRef(cacheAnuncios);
  const [versionDeDatos, setVersionDeDatos] = useState(0);
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
  const clientesDeclarados = performance.portfolios.filter((p) => p.declared && !p.archivado);
  const [mostrarPuertaCliente, setMostrarPuertaCliente] = useState(false);
  useEffect(() => {
    // Una vez por sesión de navegador (no en cada recarga dentro de la misma
    // pestaña): si ya se eligió, la marca queda en sessionStorage y no
    // vuelve a interrumpir hasta que se cierre la pestaña o se cierre sesión
    // y se abra otra. Arranca en `false` a propósito (ver la nota del tema,
    // arriba): así la mayoría de las cargas —donde ya se eligió antes— no
    // parpadean con la puerta encima.
    // Decisiones es la pantalla de entrada y muestra los pendientes de TODOS los clientes: no hace falta elegir uno.
    if (
      initialView !== "decisiones" &&
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

  // Se piden en cuanto hay un cliente elegido (no solo al abrir «Cliente»): cuando la persona llega a la tabla,
  // los anuncios ya están. Con datos recientes en memoria no se vuelve a pedir nada.
  const claveDeAnuncios = clienteSeleccionado ? `${clienteSeleccionado}|${rango}|${versionDeDatos}` : null;
  useEffect(() => {
    cacheAnunciosRef.current = cacheAnuncios;
  }, [cacheAnuncios]);
  useEffect(() => {
    if (!claveDeAnuncios || !clienteSeleccionado) return;
    const reciente = cacheAnunciosRef.current[claveDeAnuncios];
    if (reciente && Date.now() - reciente.at < 120_000) return;
    const control = new AbortController();
    fetchConReintento(
      `/api/dashboard?anuncios=1&cliente=${encodeURIComponent(clienteSeleccionado)}&rango=${encodeURIComponent(rango)}`,
      { headers: { accept: "application/json" }, signal: control.signal },
    )
      .then(async (respuesta) => {
        const cuerpo = (await respuesta.json().catch(() => null)) as { performance?: PerformanceSnapshot } | null;
        if (!respuesta.ok || !cuerpo?.performance) throw new Error("sin anuncios");
        const ads = cuerpo.performance.ads;
        setCacheAnuncios((actual) => {
          // Se guardan pocos clientes: cada uno son cientos de filas.
          const claves = Object.keys(actual).filter((k) => k !== claveDeAnuncios);
          const conservar = claves.slice(-5);
          return { ...Object.fromEntries(conservar.map((k) => [k, actual[k]])), [claveDeAnuncios]: { ads, at: Date.now() } };
        });
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        // Sin lectura: si ya había datos se dejan; si no, la tabla muestra el aviso de que no se pudieron leer.
        setCacheAnuncios((actual) => (actual[claveDeAnuncios] ? actual : { ...actual, [claveDeAnuncios]: { ads: [], at: 0 } }));
      });
    return () => control.abort();
  }, [claveDeAnuncios, clienteSeleccionado, rango]);
  // Lo exacto si ya llegó; si no, lo último que se leyó de este cliente y periodo (otra versión): así una
  // relectura no vacía la tabla ni cierra el editor que está encima.
  const anunciosDeLaClave = useMemo(() => {
    if (!claveDeAnuncios || !clienteSeleccionado) return undefined;
    if (cacheAnuncios[claveDeAnuncios]) return cacheAnuncios[claveDeAnuncios];
    const prefijo = `${clienteSeleccionado}|${rango}|`;
    const versiones = Object.keys(cacheAnuncios).filter((k) => k.startsWith(prefijo));
    return versiones.length ? cacheAnuncios[versiones[versiones.length - 1]] : undefined;
  }, [cacheAnuncios, claveDeAnuncios, clienteSeleccionado, rango]);
  const anunciosVigentes = anunciosDeLaClave !== undefined;
  const performanceConAnuncios = useMemo(
    () => ({ ...performance, ads: view === "clients" && anunciosDeLaClave ? anunciosDeLaClave.ads : [] }),
    [performance, anunciosDeLaClave, view],
  );
  const cargandoAnuncios = view === "clients" && claveDeAnuncios !== null && !anunciosVigentes;

  async function refreshOperationalData(
    periodo: RangoId = rango,
    solicitud: number = ++rangoSolicitadoRef.current,
  ) {
    try {
      const response = await fetchConReintento(
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
      // Los anuncios cargados quedaron viejos: se vuelven a pedir.
      setVersionDeDatos((v) => v + 1);
      // Si el cliente elegido deja de existir en la lectura nueva, se limpia
      // la selección en vez de dejarla apuntando a un cliente que ya no está.
      setClienteSeleccionado((current) =>
        current !== null &&
        body.performance!.portfolios.some((item) => item.id === current)
          ? current
          : null,
      );
    } catch {
      // Ya se reintentó solo (fetchConReintento) — esto es un corte real,
      // no uno pasajero. Antes quedaba en silencio total: el dashboard se
      // veía "colgado" sin decir por qué. Un id fijo evita apilar el mismo
      // aviso si dos actualizaciones fallan casi juntas.
      if (solicitud === rangoSolicitadoRef.current) {
        toast.error("No se pudo actualizar los datos", {
          id: "refresh-operational-data-error",
          description: "Puede ser un corte de red pasajero — reintenta en unos segundos.",
        });
      }
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
        avisoSolicitudes={avisoSolicitudes}
        onBuscar={() => setPaletaAbierta(true)}
        clienteId={clienteSeleccionado}
        clienteNombre={
          performance.portfolios.find((item) => item.id === clienteSeleccionado)?.name ?? null
        }
        rango={rango}
        puedeAprobar={
          initialSnapshot.user.role === "admin" || initialSnapshot.user.role === "supervisor"
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
        {/* pb-24: reserva el alto del botón del asistente (64px) más su
            margen (16px) y algo de aire, para que ninguna vista termine con
            un control importante (un botón, la última fila de una tabla)
            justo detrás del orbe flotante al hacer scroll hasta el final. */}
        <div className="telemetry-grid min-h-[calc(100svh-4rem)] pb-24">
          {view === "decisiones" && <DecisionesView modo="pagina" clienteId={clienteSeleccionado} rango={performance.rango.id} />}
          {view === "control" && (
            <ControlRoomView
              nombre={initialSnapshot.user.displayName.trim().split(/\s+/)[0] || "equipo"}
              performance={performance}
              modulos={modulosDeInicio(initialSnapshot.user.role)}
              onNavigate={setView}
              onOpenIntegrations={abrirCuentas}
            />
          )}
          {view === "health" && (
            <HealthView
              client={clienteSeleccionado}
              performance={performance}
              onOpenIntegrations={abrirCuentas}
              checks={healthChecks}
              okCount={healthOk}
              totalCount={healthChecks.length}
              score={healthScore}
              critical={healthCritical}
              warnings={healthWarnings}
              puedeVerResumen={
                initialSnapshot.user.role === "admin" || initialSnapshot.user.role === "supervisor"
              }
            />
          )}
          {view === "clients" && (
            <ClientesView
              puedeVerMedicion={initialSnapshot.user.role === "admin"}
              performance={performanceConAnuncios}
              cargandoAnuncios={cargandoAnuncios}
              onDatosCambiaron={() => {
                // Se vuelve a leer en segundo plano; mientras llega, la tabla sigue mostrando lo anterior.
                setVersionDeDatos((v) => v + 1);
              }}
              seleccionado={clienteSeleccionado}
              onSeleccionar={setClienteSeleccionado}
              onAbrirImpulsar={puedeCrearCampanas ? () => setImpulsarAbierto(true) : undefined}
              onCrearCampana={
                puedeCrearCampanas
                  ? (portfolioId) => {
                      setBuilderContexto({ modo: "nueva", portfolioId });
                      setView("builder");
                    }
                  : undefined
              }
              onAgregarConjunto={
                puedeCrearCampanas
                  ? (attachTo) => {
                      setBuilderContexto({ modo: "adjuntar", attachTo });
                      setView("builder");
                    }
                  : undefined
              }
              onAgregarAnuncio={
                puedeCrearCampanas
                  ? (attachTo) => {
                      setBuilderContexto({ modo: "adjuntar", attachTo });
                      setView("builder");
                    }
                  : undefined
              }
              onVersionNueva={
                puedeCrearCampanas
                  ? (attachTo, semilla) => {
                      // Un anuncio nuevo en el mismo conjunto, con el contenido del original para editarlo.
                      setBuilderContexto({
                        modo: "adjuntar",
                        attachTo,
                        semilla: { ...semilla, propuestaId: `version:${semilla.versionDeAnuncio?.anuncioOrigen ?? Date.now()}` },
                      });
                      setView("builder");
                    }
                  : undefined
              }
              onImpulsar={
                puedeCrearCampanas
                  ? (portfolioId, semilla) => {
                      // `propuestaId` propio: dos impulsos seguidos del mismo
                      // cliente no deben reusar el borrador del anterior.
                      setBuilderContexto({
                        modo: "nueva",
                        portfolioId,
                        semilla: { ...semilla, propuestaId: `impulso:${semilla.boost?.postId ?? Date.now()}` },
                      });
                      setView("builder");
                    }
                  : undefined
              }
            />
          )}
          {view === "builder" && puedeCrearCampanas && (
            <ConstructorView
              // Cada contexto nuevo es un constructor nuevo: reiniciar el
              // formulario al cambiar de cliente o de campaña de destino, no
              // arrastrar lo que se había escrito para otra cosa.
              key={builderConstructorKey(builderContexto, clienteSeleccionado)}
              attachTo={builderConstructorAttachTo(builderContexto)}
              semillaIA={
                builderContexto?.semilla
              }
              clienteGlobal={clienteSeleccionado}
              onCambiarClienteGlobal={setClienteSeleccionado}
              onPublicado={() => void refreshOperationalData()}
              verPlanTecnico={initialSnapshot.user.role === "admin"}
              soloEnviaARevision={soloEnviaARevision}
            />
          )}
          {view === "solicitudes" && <SolicitudesView />}
          {view === "reglas" && <ReglasView clienteId={clienteSeleccionado} />}
          {view === "medicion" && initialSnapshot.user.role === "admin" && (
            <MedicionView clienteId={clienteSeleccionado} performance={performance} puedeEditar onElegirCliente={setClienteSeleccionado} />
          )}
          {view === "inversion" && (
            <InversionView clienteId={clienteSeleccionado} performance={performance} periodo={performance.rango.label} onElegirCliente={setClienteSeleccionado} />
          )}
          {view === "diagnostico" && initialSnapshot.user.role === "admin" && <DiagnosticoView clienteId={clienteSeleccionado} />}
          <Dialog open={impulsarAbierto} onOpenChange={setImpulsarAbierto}>
            <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-2xl">
              <DialogTitle className="sr-only">Boostear anuncio</DialogTitle>
              {impulsarAbierto && <ImpulsarView clienteId={clienteSeleccionado} puedeAprobar={initialSnapshot.user.role !== "analyst"} />}
            </DialogContent>
          </Dialog>
          {view === "historial" && <AuditoriaView />}
          {view === "team" && (
            <EquipoView
              portfolios={performance.portfolios.map((item) => ({
                id: item.id,
                name: item.name,
              }))}
            />
          )}
          {view === "integrations" && initialSnapshot.user.role === "admin" && (
            <IntegrationsView
              currentUser={initialSnapshot.user}
              signOutPath={signOutPath}
              onPerformanceUpdated={() => void refreshOperationalData()}
              portfolios={performance.portfolios}
            />
          )}
          {view === "simulador" && <SimuladorView clienteId={clienteSeleccionado} />}
          {view === "audiencias" && (
            <AudienciasView
              portfolios={performance.portfolios}
              ads={performance.ads}
              clienteSeleccionado={clienteSeleccionado}
              puedeAprobar={initialSnapshot.user.role === "admin" || initialSnapshot.user.role === "supervisor"}
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
          initialSnapshot.user.role === "admin" || initialSnapshot.user.role === "supervisor"
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
  return !item.oculto && (!item.roles || item.roles.includes(role));
}

/**
 * Nombre de la acción del interruptor de tema: describe a dónde va, no dónde
 * está. Lo usan `aria-label` y `title` del botón compacto.
 */
function etiquetaCambioDeTema(theme: "dark" | "light") {
  return theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
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
  avisoSolicitudes,
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
  avisoSolicitudes: number;
  onBuscar: () => void;
  clienteId: string | null;
  clienteNombre: string | null;
  rango: string;
  puedeAprobar: boolean;
  onCambioAplicado: () => void;
}) {
  // En pantalla chica la barra se abre como panel completo (`Sheet`), pero
  // `state` sigue reflejando el ancho del escritorio: sin mirar `isMobile`
  // el panel del celular mostraría el tema compactado aunque haya lugar de
  // sobra. Es la misma condición que aplican las clases
  // `group-data-[collapsible=icon]:` del resto del pie.
  const { isMobile, state, toggleSidebar } = useSidebar();
  const menuCompacto = !isMobile && state === "collapsed";

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
                    disabled={item.bloqueado}
                    onClick={item.bloqueado ? undefined : () => onNavigate(item.key)}
                    tooltip={item.bloqueado ? `${item.label} · Próximamente` : item.label}
                    className={cn(
                      "h-11 gap-2.5 rounded-full px-4 text-[0.95rem] font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-bold data-[active=true]:text-foreground",
                      "group-data-[collapsible=icon]:justify-center",
                    )}
                  >
                    {item.icono ? (
                      <item.icono
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0",
                          activo ? "text-primary" : "",
                        )}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          activo ? "bg-primary" : "bg-transparent",
                        )}
                      />
                    )}
                    <span className="flex-1 group-data-[collapsible=icon]:hidden">
                      {item.label}
                    </span>
                    {item.key === "solicitudes" && avisoSolicitudes > 0 && (
                      <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[0.6rem] font-bold text-white group-data-[collapsible=icon]:hidden">
                        {avisoSolicitudes}
                      </span>
                    )}
                    {item.bloqueado && (
                      <span className="font-micro shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.6rem] text-muted-foreground group-data-[collapsible=icon]:hidden">
                        Pronto
                      </span>
                    )}
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
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="gap-4 px-4 pt-5 pb-2 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo, el proyecto todavía no usa next/image en ningún lado */}
          <img
            src={theme === "light" ? "/wiwo-ads-electric.png" : "/wiwo-ads-lime.png"}
            alt="WiWO.ADS"
            className="h-9 w-auto min-w-0 flex-1 object-contain object-left group-data-[collapsible=icon]:hidden"
          />
          {/* La marca cuando no hay ancho para el logotipo. `aria-hidden`
              porque el nombre del producto ya lo dice el <title> de la
              página: repetirlo acá solo agrega ruido al lector de pantalla. */}
          <span
            aria-hidden="true"
            className="marca-w hidden text-[1.6rem] leading-none group-data-[collapsible=icon]:block"
          >
            W
          </span>
          {/* El botón de compactar vive adentro del menú, no en la barra de
              arriba: es un control del menú y se busca donde está la cosa
              que controla. No usa `SidebarTrigger` porque ese trae el panel
              sin flecha, y acá la flecha de adentro tiene que apuntar a
              donde se va a mover la barra. */}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={menuCompacto ? "Expandir menú" : "Compactar menú"}
            title={menuCompacto ? "Expandir menú" : "Compactar menú"}
            aria-expanded={!menuCompacto}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {menuCompacto ? (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={onBuscar}
          title="Buscar"
          className="flex h-11 w-full items-center gap-2.5 rounded-full border border-border bg-field px-4 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:self-center group-data-[collapsible=icon]:p-0"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 text-left group-data-[collapsible=icon]:hidden">
            Buscar…
          </span>
        </button>
        {/* Las alertas son de quien aprueba cambios: administrador y supervisor. */}
        {puedeAprobar && (
          <BotonDeAlertas
            clienteId={clienteId}
            clienteNombre={clienteNombre}
            rango={rango}
            puedeAprobar={puedeAprobar}
            onCambioAplicado={onCambioAplicado}
          />
        )}
      </SidebarHeader>

      <SidebarContent className="gap-2 py-3">
        {grupo(null, navItems)}
        {grupo("Gestión", navItemsGestion)}
      </SidebarContent>

      <SidebarFooter className="gap-3 border-t border-sidebar-border px-4 py-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <div className="min-w-0 group-data-[collapsible=icon]:contents">
          <p className="truncate text-[0.95rem] font-bold text-foreground group-data-[collapsible=icon]:hidden">
            {currentUser.displayName}
          </p>
          <p className="truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            {currentUser.email}
          </p>
          <div className="mt-2 flex items-center gap-2 group-data-[collapsible=icon]:mt-0">
            <span className="inline-block rounded-md bg-primary px-2 py-0.5 text-[0.65rem] font-extrabold tracking-wide text-primary-foreground uppercase group-data-[collapsible=icon]:hidden">
              {ROLE_LABELS[currentUser.role as Role] ?? currentUser.role}
            </span>
            {puedeVerItem(itemEquipo, currentUser.role) && (
              // Solo el engranaje, al lado del rol: las dos cosas hablan de
              // permisos, y ahí es donde se las busca. Sin texto visible, el
              // nombre lo llevan `aria-label` (lectores de pantalla) y
              // `title` (pista al pasar el mouse): un icono suelto sin
              // ninguno de los dos es un botón que nadie sabe qué hace hasta
              // que lo aprieta.
              <button
                type="button"
                onClick={() => onNavigate(itemEquipo.key)}
                aria-label={itemEquipo.label}
                title={itemEquipo.label}
                aria-current={view === itemEquipo.key ? "page" : undefined}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full transition-colors",
                  view === itemEquipo.key
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Cog className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <a
          href={signOutPath}
          onClick={() => {
            // Para que la próxima persona que entre en esta misma pestaña
            // (u otra sesión) vuelva a pasar por la puerta de cliente, en
            // vez de heredar en silencio la marca de que "ya se eligió".
            window.sessionStorage.removeItem(PUERTA_CLIENTE_STORAGE_KEY);
          }}
          title="Cerrar sesión"
          className="w-fit rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-danger group-data-[collapsible=icon]:hidden"
        >
          Cerrar sesion
        </a>
        {menuCompacto ? (
          // Compactado no entran las dos opciones con su texto, así que el
          // par pasa a ser un interruptor: muestra el tema puesto y al
          // apretarlo salta al otro. Qué hace el botón lo dicen `aria-label`
          // y `title`, porque el icono solo cuenta dónde estás parado, no
          // qué pasa si lo tocas.
          <button
            type="button"
            onClick={() => onThemeChange(theme === "dark")}
            aria-label={etiquetaCambioDeTema(theme)}
            title={etiquetaCambioDeTema(theme)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-field text-[var(--acento-tema)] transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {theme === "dark" ? (
              <Moon className="size-4" aria-hidden="true" />
            ) : (
              <Sun className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : (
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
        )}
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
  const clientesDeclarados = performance.portfolios.filter((p) => p.declared && !p.archivado);
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 bg-canvas/90 px-4 backdrop-blur-xl md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="size-9 rounded-full text-muted-foreground hover:bg-sidebar-accent md:hidden" />
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
              {agruparPorEmpresa(clientesDeclarados).map((grupo) => (
                <SelectGroup key={grupo.empresa ?? "sin"}>
                  {grupo.etiqueta && <SelectLabel>{grupo.etiqueta}</SelectLabel>}
                  {grupo.clientes.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
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
