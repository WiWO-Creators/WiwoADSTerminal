"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ALCANCES } from "@/lib/linkedin-nativo-pura";
import { Surface } from "./ui";

type Estado = {
  configurado: boolean;
  falta: string[];
  conectado: boolean;
  alcances: string[];
  diasRestantes: number | null;
  reconectar: boolean;
  escrituraEnClientes: boolean;
  conectadoPor: string | null;
  cuentaDeLinkedin: string | null;
};

/** Lo que tiene que haber concedido la conexión para leer, administrar y crear anuncios. */
const NECESARIOS = [...ALCANCES.lectura, ...ALCANCES.administrar, ...ALCANCES.anuncios];

/**
 * LinkedIn en Integraciones. La conexión es DEL EQUIPO: un administrador conecta una vez y todo el mundo actúa según su rol, sin
 * iniciar sesión en LinkedIn (igual que con Google y Meta). Cualquiera ve el estado; solo quien administra conexiones conecta.
 */
export function LinkedinCard({ canManage }: { canManage: boolean }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    // Antes de que la vista principal limpie la URL: si volvemos de autorizar LinkedIn, se avisa.
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "linkedin") {
      toast.success("LinkedIn quedó conectado para todo el equipo", { description: "Nadie más tiene que iniciar sesión en LinkedIn." });
    }
    (async () => {
      try {
        const respuesta = await fetch("/api/linkedin/estado", { headers: { accept: "application/json" } });
        const cuerpo = (await respuesta.json()) as { estado?: Estado; error?: string };
        if (!respuesta.ok || !cuerpo.estado) throw new Error(cuerpo.error ?? "No pudimos leer el estado de LinkedIn");
        if (!cancelado) setEstado(cuerpo.estado);
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : "No pudimos leer el estado de LinkedIn");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const faltantes = estado ? NECESARIOS.filter((a) => !estado.alcances.includes(a)) : [];
  const conectado = Boolean(estado?.conectado);
  const venceronPronto = Boolean(estado?.reconectar);
  const necesitaAtencion = conectado && (venceronPronto || faltantes.length > 0);

  const insignia = !estado
    ? { texto: error ? "Sin datos" : "Cargando…", clase: "border-foreground/10 bg-card/60 text-foreground/48" }
    : !estado.configurado
      ? { texto: "Falta habilitar", clase: "border-warn/30 bg-warn/10 text-warn" }
      : !conectado
        ? { texto: "Sin conexión", clase: "border-foreground/10 bg-card/60 text-foreground/48" }
        : necesitaAtencion
          ? { texto: venceronPronto ? "Reconectar pronto" : "Faltan permisos", clase: "border-warn/30 bg-warn/10 text-warn" }
          : { texto: "Conectado", clase: "border-brand/30 bg-brand/10 text-brand" };

  return (
    <Surface className="flex min-h-[330px] flex-col overflow-hidden">
      <div className="flex items-start justify-between border-b border-foreground/8 p-5">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#0A66C2] text-xl font-black text-white shadow-sm">in</span>
          <div>
            <h3 className="text-lg font-bold text-foreground">LinkedIn</h3>
            <p className="mt-1 text-xs leading-5 text-foreground/48">Campañas de LinkedIn Ads por su API directa · una conexión para todo el equipo</p>
          </div>
        </div>
        <Badge variant="outline" className={insignia.clase}>
          {necesitaAtencion || (estado && !estado.configurado) ? <AlertCircle /> : conectado ? <CheckCircle2 /> : <Link2 />}
          {insignia.texto}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col p-5">
        {error ? (
          <p className="text-sm text-foreground/60">{error}</p>
        ) : !estado ? null : conectado ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Dato etiqueta="Vigencia" valor={estado.diasRestantes === null ? "—" : estado.diasRestantes < 0 ? "Vencida" : `${estado.diasRestantes} días`} />
            <Dato etiqueta="Permisos" valor={faltantes.length === 0 ? "Completos" : `Faltan ${faltantes.length}`} />
            <Dato etiqueta="Escritura en clientes" valor={estado.escrituraEnClientes ? "Activada" : "Solo cuenta de prueba"} />
            <Dato etiqueta="Cuenta de LinkedIn" valor={estado.cuentaDeLinkedin ?? "Reconecta para verla"} />
            {estado.conectadoPor ? <Dato etiqueta="Usuario de WiWO.ADS" valor={estado.conectadoPor} /> : <Dato etiqueta="Quién actúa" valor="Todo el equipo, según su rol" />}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-foreground/14 bg-card/35 p-4">
            <p className="text-sm font-bold text-foreground">Nadie ha conectado LinkedIn todavía</p>
            <p className="mt-1.5 text-xs leading-5 text-foreground/55">
              {estado.configurado
                ? "Un administrador lo conecta una sola vez y desde ese momento todo el equipo puede crear y editar campañas de LinkedIn según su rol, sin iniciar sesión en LinkedIn."
                : `Todavía no está habilitado en el servidor: falta ${estado.falta.join(" y ")}.`}
            </p>
          </div>
        )}

        {estado && conectado && (necesitaAtencion || estado.diasRestantes !== null) ? (
          <p className={cn("mt-4 text-xs leading-5", necesitaAtencion ? "text-warn" : "text-foreground/45")}>
            {faltantes.length > 0
              ? "La conexión no tiene todos los permisos (por ejemplo, los de anuncios): reconéctala para sumarlos."
              : venceronPronto
                ? "La conexión vence pronto. Un administrador debe volver a conectarla: dura unos 60 días y no se renueva sola."
                : "La conexión dura unos 60 días; antes de que venza se avisa aquí."}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-foreground/8 p-4">
        {estado && estado.configurado ? (
          canManage ? (
            <Button asChild variant={conectado && !necesitaAtencion ? "outline" : "default"} className="font-bold">
              {/* Ruta de API que redirige a LinkedIn (no una página de la app): un enlace normal, no `next/link`. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/api/integrations/linkedin/authorize" target="_top">
                {conectado ? "Reconectar" : "Conectar LinkedIn para todo el equipo"}
                <ExternalLink />
              </a>
            </Button>
          ) : (
            <span className="text-xs text-foreground/50">Solo un administrador puede conectar o reconectar LinkedIn.</span>
          )
        ) : null}
      </div>
    </Surface>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-xl border border-foreground/8 bg-card/45 px-3 py-3">
      <p className="font-micro text-[0.58rem] text-foreground/38">{etiqueta}</p>
      <p className="mt-1.5 truncate text-sm font-bold text-foreground/78">{valor}</p>
    </div>
  );
}
