export type ViewKey =
  | "control"
  | "decisions"
  | "health"
  | "pacing"
  | "audit"
  | "integrations";

export type Severity = "critical" | "high" | "medium" | "info";
export type HealthState = "critical" | "warning" | "healthy" | "inactive";

export type Decision = {
  id: string;
  severity: Severity;
  client: string;
  platform: string;
  owner: string;
  autonomy: "N0" | "N1" | "N2" | "N3";
  title: string;
  diagnosis: string;
  proposedAction: string;
  impact: string;
  confidence: "Alta" | "Media" | "No estimable";
  agent: string;
  rule: string;
  age: string;
  expires: string;
  before: string;
  after: string;
  guardrail: string;
  metric: string;
  delta: string;
  primaryLabel: string;
  version: number;
};

export type AuditEvent = {
  id: string;
  eventType: string;
  time: string;
  user: string;
  action: string;
  client: string;
  origin: string;
  result: string;
  dataOrigin: "pilot" | "recorded_action";
};

export type HealthCheck = {
  check: string;
  platform: string;
  state: HealthState;
  detail: string;
  lastCheck: string;
  owner: string;
};

export const initialDecisions: Decision[] = [
  {
    id: "DEC-1842",
    severity: "critical",
    client: "amiPASS",
    platform: "Meta",
    owner: "Camila R.",
    autonomy: "N1",
    title: "Meta dejó de recibir eventos de compra",
    diagnosis:
      "El evento Purchase pasó de 1.842 registros diarios a cero a las 09:12. GA4 todavía registra compras, por lo que la falla está entre GTM y Meta.",
    proposedAction:
      "Suspender optimizaciones basadas en Purchase y asignar revisión del contenedor a Tecnología antes de las 14:00.",
    impact: "Evita optimizar con señales incompletas",
    confidence: "Alta",
    agent: "Agente Salud",
    rule: "health.purchase_gap · v2.4",
    age: "Hace 18 min",
    expires: "Vence en 53 h",
    before: "1.842 eventos / día",
    after: "0 desde las 09:12",
    guardrail: "Bloquea N2 y N3 mientras siga abierto",
    metric: "Purchase",
    delta: "−100%",
    primaryLabel: "Asignar corrección",
    version: 1,
  },
  {
    id: "DEC-1837",
    severity: "high",
    client: "Bodenor Flexcenter",
    platform: "Google Ads",
    owner: "Diego S.",
    autonomy: "N2",
    title: "La campaña de bodegas quedará 12% bajo presupuesto",
    diagnosis:
      "Con el ritmo actual, la campaña cerrará septiembre en $11,8 MM sobre un presupuesto de $13,4 MM. El CPA se mantiene 9% bajo la meta.",
    proposedAction:
      "Aumentar el presupuesto diario de la campaña Search | Bodegas RM en 10,7% hasta el cierre de mes.",
    impact: "+14 a +19 leads estimados",
    confidence: "Alta",
    agent: "Agente Pacing",
    rule: "pacing.underspend · v1.8",
    age: "Hace 1 h",
    expires: "Vence en 49 h",
    before: "$420.000 / día",
    after: "$465.000 / día",
    guardrail: "Máximo contractual por acción: +15%",
    metric: "Presupuesto diario",
    delta: "+10,7%",
    primaryLabel: "Firmar y ajustar presupuesto",
    version: 1,
  },
  {
    id: "DEC-1829",
    severity: "high",
    client: "Açaí Berry",
    platform: "TikTok",
    owner: "Camila R.",
    autonomy: "N2",
    title: "El creativo principal muestra fatiga",
    diagnosis:
      "La frecuencia llegó a 4,8 en siete días y el CTR cayó 31%. Las dos variantes de producto mantienen mejor respuesta en la misma audiencia.",
    proposedAction:
      "Pausar la pieza Alonso 01 y redistribuir su presupuesto entre las variantes Producto 02 y Lifestyle 03.",
    impact: "CPA entre 8% y 13% menor",
    confidence: "Media",
    agent: "Agente Creativo",
    rule: "creative.fatigue_7d · v3.1",
    age: "Hace 3 h",
    expires: "Vence en 46 h",
    before: "Creativo Alonso 01 · activo",
    after: "Pausado · presupuesto redistribuido",
    guardrail: "No modifica copy ni segmentación",
    metric: "CTR 7 días",
    delta: "−31%",
    primaryLabel: "Firmar rotación creativa",
    version: 1,
  },
  {
    id: "DEC-1814",
    severity: "medium",
    client: "ProAndes",
    platform: "Google Ads",
    owner: "Matías L.",
    autonomy: "N1",
    title: "Un término informativo consume presupuesto sin convertir",
    diagnosis:
      "Carreras técnicas gratis acumuló 286 clics y $214.000 sin conversiones en 21 días. El término no coincide con la oferta vigente.",
    proposedAction:
      "Agregar el término como palabra clave negativa exacta en las campañas de Admisión 2027.",
    impact: "$290.000–$360.000 de ahorro mensual",
    confidence: "Alta",
    agent: "Agente Búsqueda",
    rule: "search.zero_conversion · v2.0",
    age: "Hace 7 h",
    expires: "Vence en 39 h",
    before: "Término activo",
    after: "Negativa exacta",
    guardrail: "Aplicación manual por autonomía N1",
    metric: "Costo sin conversión",
    delta: "$214.000",
    primaryLabel: "Registrar decisión",
    version: 1,
  },
  {
    id: "DEC-1798",
    severity: "info",
    client: "FlixBus",
    platform: "Meta",
    owner: "Diego S.",
    autonomy: "N2",
    title: "Dos audiencias compiten por las mismas personas",
    diagnosis:
      "Las audiencias Viajeros frecuentes y Escapadas fin de semana comparten 38% de sus usuarios alcanzables en Región Metropolitana.",
    proposedAction:
      "Excluir Viajeros frecuentes de la audiencia Escapadas y mantener la primera como conjunto prioritario.",
    impact: "Menor presión de subasta interna",
    confidence: "Media",
    agent: "Agente Audiencia",
    rule: "audience.overlap · v1.3",
    age: "Hace 11 h",
    expires: "Vence en 28 h",
    before: "38% de solapamiento",
    after: "Exclusión cruzada",
    guardrail: "No amplía la audiencia autorizada",
    metric: "Solapamiento",
    delta: "38%",
    primaryLabel: "Firmar exclusión",
    version: 1,
  },
];

export const portfolio = [
  {
    name: "amiPASS",
    owner: "Camila R.",
    health: "critical" as HealthState,
    pacing: "En rango",
    alerts: 3,
    spend: "$48,2 MM",
    margin: "23,4%",
    autonomy: "N1",
    freshness: "8 min",
  },
  {
    name: "FlixBus",
    owner: "Diego S.",
    health: "warning" as HealthState,
    pacing: "−4,2%",
    alerts: 2,
    spend: "$31,6 MM",
    margin: "27,1%",
    autonomy: "N2",
    freshness: "12 min",
  },
  {
    name: "Bodenor Flexcenter",
    owner: "Diego S.",
    health: "healthy" as HealthState,
    pacing: "−12,0%",
    alerts: 1,
    spend: "$18,7 MM",
    margin: "25,8%",
    autonomy: "N2",
    freshness: "11 min",
  },
  {
    name: "Açaí Berry",
    owner: "Camila R.",
    health: "healthy" as HealthState,
    pacing: "+1,8%",
    alerts: 1,
    spend: "$9,4 MM",
    margin: "31,2%",
    autonomy: "N2",
    freshness: "27 min",
  },
  {
    name: "ProAndes",
    owner: "Matías L.",
    health: "warning" as HealthState,
    pacing: "En rango",
    alerts: 2,
    spend: "$22,1 MM",
    margin: "20,9%",
    autonomy: "N1",
    freshness: "19 min",
  },
  {
    name: "Puerto San Antonio",
    owner: "Matías L.",
    health: "healthy" as HealthState,
    pacing: "+3,1%",
    alerts: 0,
    spend: "$11,8 MM",
    margin: "28,6%",
    autonomy: "N0",
    freshness: "22 min",
  },
];

export const pacingRows = [
  {
    client: "Bodenor Flexcenter",
    spend: "$10,4 MM",
    budget: "$13,4 MM",
    projected: "$11,8 MM",
    variance: "−12,0%",
    tone: "warning",
  },
  {
    client: "FlixBus",
    spend: "$22,8 MM",
    budget: "$31,6 MM",
    projected: "$30,3 MM",
    variance: "−4,2%",
    tone: "healthy",
  },
  {
    client: "amiPASS",
    spend: "$34,2 MM",
    budget: "$48,2 MM",
    projected: "$48,6 MM",
    variance: "+0,8%",
    tone: "healthy",
  },
  {
    client: "Açaí Berry",
    spend: "$6,8 MM",
    budget: "$9,4 MM",
    projected: "$9,6 MM",
    variance: "+1,8%",
    tone: "healthy",
  },
  {
    client: "ProAndes",
    spend: "$16,1 MM",
    budget: "$22,1 MM",
    projected: "$22,0 MM",
    variance: "−0,5%",
    tone: "healthy",
  },
];

export const healthProfiles: Record<string, HealthCheck[]> = {
  amiPASS: [
    {
      check: "Píxel y evento Purchase",
      platform: "Meta",
      state: "critical",
      detail: "Sin eventos desde las 09:12",
      lastCheck: "Hace 8 min",
      owner: "Tecnología",
    },
    {
      check: "API de Conversiones",
      platform: "Meta",
      state: "warning",
      detail: "Deduplicación bajo 92%",
      lastCheck: "Hace 8 min",
      owner: "Camila R.",
    },
    {
      check: "Conversiones primarias",
      platform: "Google Ads",
      state: "healthy",
      detail: "3 acciones válidas",
      lastCheck: "Hace 11 min",
      owner: "Camila R.",
    },
    {
      check: "Configuración y eventos",
      platform: "GA4",
      state: "healthy",
      detail: "Sin duplicidad detectada",
      lastCheck: "Hace 14 min",
      owner: "Analítica",
    },
    {
      check: "Contenedor publicado",
      platform: "GTM",
      state: "healthy",
      detail: "Versión 128 activa",
      lastCheck: "Hace 14 min",
      owner: "Tecnología",
    },
    {
      check: "Píxel y Events API",
      platform: "TikTok",
      state: "inactive",
      detail: "Plataforma no conectada",
      lastCheck: "No aplica",
      owner: "—",
    },
    {
      check: "Insight Tag",
      platform: "LinkedIn",
      state: "healthy",
      detail: "Recibiendo 2 conversiones",
      lastCheck: "Hace 32 min",
      owner: "Camila R.",
    },
  ],
};

export const standardHealthyProfile: HealthCheck[] = [
  {
    check: "Píxel y eventos críticos",
    platform: "Meta",
    state: "healthy",
    detail: "Eventos dentro del rango esperado",
    lastCheck: "Hace 12 min",
    owner: "AdTech",
  },
  {
    check: "API de Conversiones",
    platform: "Meta",
    state: "healthy",
    detail: "Deduplicación correcta",
    lastCheck: "Hace 12 min",
    owner: "AdTech",
  },
  {
    check: "Conversiones primarias",
    platform: "Google Ads",
    state: "healthy",
    detail: "Acciones válidas",
    lastCheck: "Hace 18 min",
    owner: "AdTech",
  },
  {
    check: "Configuración y eventos",
    platform: "GA4",
    state: "warning",
    detail: "Diferencia de atribución de 11%",
    lastCheck: "Hace 21 min",
    owner: "Analítica",
  },
  {
    check: "Contenedor publicado",
    platform: "GTM",
    state: "healthy",
    detail: "Última versión publicada",
    lastCheck: "Hace 21 min",
    owner: "Tecnología",
  },
  {
    check: "Píxel y Events API",
    platform: "TikTok",
    state: "healthy",
    detail: "Eventos estables",
    lastCheck: "Hace 37 min",
    owner: "AdTech",
  },
];

export const initialAudit: AuditEvent[] = [
  {
    id: "LOG-9274",
    eventType: "seeded",
    time: "Hoy · 11:42",
    user: "Diego S.",
    action: "Aprobó ajuste de presupuesto +8%",
    client: "FlixBus",
    origin: "Agente Pacing · v1.8",
    result: "Registro piloto",
    dataOrigin: "pilot",
  },
  {
    id: "LOG-9271",
    eventType: "seeded",
    time: "Hoy · 10:18",
    user: "Matías L.",
    action: "Descartó palabra clave negativa",
    client: "ProAndes",
    origin: "Agente Búsqueda · v2.0",
    result: "Cliente lo pidió así",
    dataOrigin: "pilot",
  },
  {
    id: "LOG-9268",
    eventType: "seeded",
    time: "Hoy · 09:34",
    user: "Camila R.",
    action: "Asignó alerta de píxel",
    client: "amiPASS",
    origin: "Agente Salud · v2.4",
    result: "En investigación",
    dataOrigin: "pilot",
  },
  {
    id: "LOG-9259",
    eventType: "seeded",
    time: "Ayer · 17:09",
    user: "Sistema",
    action: "Caducó recomendación sin atención",
    client: "Açaí Berry",
    origin: "Agente Audiencia · v1.3",
    result: "Caducada a las 72 h",
    dataOrigin: "pilot",
  },
];
