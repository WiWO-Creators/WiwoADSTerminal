"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { mensajeDeError } from "@/lib/acceso-errores";
import {
  CANAL_ACCESO,
  CLAVE_RESULTADO,
  type ResultadoAcceso,
} from "@/lib/acceso-popup";

/**
 * Responsabilidad: iniciar el acceso con Google en una ventana emergente y
 *   mover la ventana de atrás cuando el flujo termina.
 * Usado por: app/acceso/page.tsx.
 * NO hace: validar identidad ni permisos — eso es de /api/acceso/google y su
 *   callback. Aquí solo se decide dónde ocurre el flujo.
 *
 * Sigue siendo un enlace real: sin JavaScript, o con las emergentes
 * bloqueadas, el acceso cae al flujo clásico de redirección en la misma
 * pestaña.
 */

const ANCHO = 500;
const ALTO = 640;
const NOMBRE_VENTANA = "wiwo-acceso";

export function BotonGoogle({
  returnTo,
  listo,
}: {
  returnTo: string;
  listo: boolean;
}) {
  const [esperando, setEsperando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emergente = useRef<Window | null>(null);

  const url = `/api/acceso/google?return_to=${encodeURIComponent(returnTo)}`;

  const resolver = useCallback((resultado: ResultadoAcceso) => {
    emergente.current?.close();
    emergente.current = null;

    if (resultado.ok) {
      // replace y no href: que el botón "atrás" no vuelva a un login ya usado.
      window.location.replace(resultado.destino);
      return;
    }
    setEsperando(false);
    setError(mensajeDeError(resultado.error));
  }, []);

  useEffect(() => {
    if (!esperando) return;

    let canal: BroadcastChannel | null = null;
    try {
      canal = new BroadcastChannel(CANAL_ACCESO);
      canal.onmessage = (evento) => resolver(evento.data as ResultadoAcceso);
    } catch {
      canal = null;
    }

    const desdeStorage = (evento: StorageEvent) => {
      if (evento.key !== CLAVE_RESULTADO || !evento.newValue) return;
      try {
        resolver(JSON.parse(evento.newValue).resultado as ResultadoAcceso);
      } catch {
        setEsperando(false);
        setError(mensajeDeError("google_estado_invalido"));
      }
    };
    window.addEventListener("storage", desdeStorage);

    // Si cierran la emergente a mano, el botón tiene que volver a quedar usable.
    const vigilante = window.setInterval(() => {
      if (emergente.current?.closed) {
        emergente.current = null;
        setEsperando(false);
      }
    }, 500);

    return () => {
      canal?.close();
      window.removeEventListener("storage", desdeStorage);
      window.clearInterval(vigilante);
    };
  }, [esperando, resolver]);

  function abrir(evento: React.MouseEvent<HTMLAnchorElement>) {
    if (!listo) {
      evento.preventDefault();
      return;
    }
    // Respetar ctrl/cmd/shift+clic: si alguien quiere otra pestaña, que la abra.
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey) return;

    evento.preventDefault();
    setError(null);

    const izquierda = window.screenX + Math.max(0, (window.outerWidth - ANCHO) / 2);
    const arriba = window.screenY + Math.max(0, (window.outerHeight - ALTO) / 2);
    const ventana = window.open(
      `${url}&modo=popup`,
      NOMBRE_VENTANA,
      `popup=yes,width=${ANCHO},height=${ALTO},left=${Math.round(izquierda)},top=${Math.round(arriba)}`,
    );

    if (!ventana) {
      // Bloqueador de emergentes: seguir por el camino de siempre.
      window.location.href = url;
      return;
    }

    emergente.current = ventana;
    ventana.focus();
    setEsperando(true);
  }

  return (
    <>
      <a
        href={url}
        onClick={abrir}
        aria-disabled={!listo}
        aria-busy={esperando}
        className={
          listo
            ? "mt-6 inline-flex h-11 w-full items-center justify-center gap-3 rounded-xl bg-[#F8FAD7] px-5 text-sm font-bold text-[#292929] transition-colors hover:bg-[#3BFF00]"
            : "mt-6 inline-flex h-11 w-full cursor-not-allowed items-center justify-center gap-3 rounded-xl bg-[#F8FAD7]/12 px-5 text-sm font-bold text-[#F8FAD7]/38"
        }
      >
        <GoogleMark />
        {esperando ? "Esperando a Google…" : "Continuar con Google"}
      </a>

      {esperando && (
        <p className="mt-2 text-xs leading-5 text-[#F8FAD7]/45">
          Se abrió una ventana para entrar con Google. Si no la ves, revisa
          detrás de esta o el bloqueador de ventanas emergentes.
        </p>
      )}

      {error && (
        <p
          className="mt-3 rounded-xl border border-danger-deep/25 bg-danger-deep/8 px-4 py-3 text-sm leading-6 text-danger"
          role="alert"
        >
          {error}
        </p>
      )}
    </>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.93v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.93a9 9 0 0 0 0 8.1l3.04-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .93 4.95l3.04 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
