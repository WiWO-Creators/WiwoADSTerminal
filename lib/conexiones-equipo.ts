import { estadoDeGoogleDelEquipo } from "@/lib/integration-store";
import { estadoDeLinkedin } from "@/lib/linkedin-conexion";
import { metaNativoConfigurado } from "@/lib/meta-nativo";
import { resumenDeConexiones, type EntradaDeConexion, type ResumenDeConexiones } from "@/lib/conexiones-equipo-pura";
import { can, type Actor } from "@/lib/permisos";

/**
 * Qué conexiones del equipo están activas, para que TODOS lo sepan (no solo quien administra). Lee la base y la configuración; no llama a
 * ninguna plataforma. Nunca devuelve un token ni el correo de quien conectó.
 */
export async function conexionesDelEquipo(actor: Actor): Promise<ResumenDeConexiones> {
  const puedeAdministrar = can(actor, "administrar_conexiones");
  const [google, linkedin] = await Promise.all([estadoDeGoogleDelEquipo().catch(() => ({ habilitada: true, falta: [], conectada: false })), estadoDeLinkedin(actor).catch(() => null)]);
  const entradas: EntradaDeConexion[] = [
    { proveedor: "google", habilitada: google.habilitada, falta: google.falta, conectada: google.conectada, porVencer: false, diasRestantes: null },
    // Meta no se conecta por persona: el usuario del sistema «WiwoAds» está en el servidor. Si no está, es un ajuste del servidor.
    { proveedor: "meta", habilitada: metaNativoConfigurado(), falta: ["META_SYSTEM_USER_TOKEN"], conectada: metaNativoConfigurado(), porVencer: false, diasRestantes: null },
    {
      proveedor: "linkedin",
      habilitada: linkedin?.configurado ?? false,
      falta: linkedin?.falta ?? [],
      conectada: linkedin?.conectado ?? false,
      porVencer: linkedin?.reconectar ?? false,
      diasRestantes: linkedin?.diasRestantes ?? null,
    },
  ];
  return resumenDeConexiones(entradas, puedeAdministrar);
}
