/**
 * Variables del servidor que la app necesita, para qué sirve cada una y si ya están cargadas. Solo nombres y un sí/no:
 * jamás se devuelve ni se muestra un valor. Parte pura, sin acceso al entorno.
 */
export type VariableDeEntorno = {
  nombre: string;
  para: string;
  grupo: string;
  requerida: boolean;
  /** Otros nombres que la app también acepta para lo mismo. */
  alternativas?: string[];
};

export const VARIABLES_DE_ENTORNO: VariableDeEntorno[] = [
  { nombre: "SESSION_SECRET", para: "Firmar las sesiones", grupo: "Base", requerida: true },
  { nombre: "OAUTH_TOKEN_KEY", para: "Cifrar las credenciales guardadas", grupo: "Base", requerida: true },
  { nombre: "CRON_SECRET", para: "Tareas programadas (alertas, decisiones)", grupo: "Base", requerida: true },
  { nombre: "WINDSOR_API_KEY", para: "Lectura de datos y acciones por Windsor", grupo: "Windsor", requerida: true },
  { nombre: "META_SYSTEM_USER_TOKEN", para: "Conexión directa con Meta (varios tokens separados por coma)", grupo: "Meta", requerida: true },
  { nombre: "META_APP_ID", para: "App de Meta for Developers", grupo: "Meta", requerida: true },
  { nombre: "META_APP_SECRET", para: "App de Meta for Developers", grupo: "Meta", requerida: true },
  { nombre: "GOOGLE_CLIENT_ID", para: "Acceso con Google y lectura de Google Ads", grupo: "Google", requerida: true },
  { nombre: "GOOGLE_CLIENT_SECRET", para: "Acceso con Google y lectura de Google Ads", grupo: "Google", requerida: true },
  { nombre: "GOOGLE_ADS_DEVELOPER_TOKEN", para: "Google Ads directo (editar anuncios, PMax, Display)", grupo: "Google", requerida: true },
  { nombre: "ANTHROPIC_API_KEY", para: "Asistente (Thinking Orb) y contenido con IA", grupo: "IA", requerida: true },
  { nombre: "LINKEDIN_CLIENT_ID", para: "LinkedIn Ads", grupo: "LinkedIn", requerida: false, alternativas: ["LINKEDIN_APP_ID"] },
  { nombre: "LINKEDIN_CLIENT_SECRET", para: "LinkedIn Ads", grupo: "LinkedIn", requerida: false, alternativas: ["LINKEDIN_APP_SECRET"] },
];

export type EstadoDeVariable = VariableDeEntorno & { cargada: boolean };

export function estadoDeEntorno(valores: Record<string, unknown>): EstadoDeVariable[] {
  const hay = (n: string) => typeof valores[n] === "string" && (valores[n] as string).trim() !== "";
  return VARIABLES_DE_ENTORNO.map((v) => ({ ...v, cargada: [v.nombre, ...(v.alternativas ?? [])].some(hay) }));
}
