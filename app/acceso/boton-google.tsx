"use client";

import { useEffect, useState } from "react";

/**
 * Responsabilidad: iniciar el acceso con Google.
 * Usado por: app/acceso/page.tsx.
 * NO hace: validar identidad ni permisos — eso es de /api/acceso/google y su
 *   callback.
 *
 * Redirige en la misma pestaña. Antes abría una ventana emergente y esperaba
 * un aviso por BroadcastChannel; si la emergente quedaba tapada, la bloqueaba el
 * navegador o el aviso se perdía, el botón se quedaba en «Esperando a Google…»
 * sin salida. La redirección es un salto menos, no depende de ventanas ni de
 * canales y se ve más rápida. (El callback aún sabe responder a una emergente,
 * por si algún enlace antiguo la usa.)
 */
export function BotonGoogle({
  returnTo,
  listo,
}: {
  returnTo: string;
  listo: boolean;
}) {
  const [yendo, setYendo] = useState(false);
  const url = `/api/acceso/google?return_to=${encodeURIComponent(returnTo)}`;

  // Volver con «atrás» desde Google restaura la página tal cual estaba: el botón no puede quedar bloqueado.
  useEffect(() => {
    const alVolver = (evento: PageTransitionEvent) => {
      if (evento.persisted) setYendo(false);
    };
    window.addEventListener("pageshow", alVolver);
    return () => window.removeEventListener("pageshow", alVolver);
  }, []);

  function ir(evento: React.MouseEvent<HTMLAnchorElement>) {
    if (!listo || yendo) {
      evento.preventDefault();
      return;
    }
    // Ctrl/cmd/shift+clic: dejar que el navegador abra otra pestaña.
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey) return;
    // La navegación la hace el propio enlace; aquí solo se muestra que ya está en camino.
    setYendo(true);
  }

  return (
    <a
      href={url}
      onClick={ir}
      aria-disabled={!listo || yendo}
      aria-busy={yendo}
      className={
        listo
          ? "mt-6 inline-flex h-11 w-full items-center justify-center gap-3 rounded-xl bg-[#F8FAD7] px-5 text-sm font-bold text-[#292929] transition-colors hover:bg-[#3BFF00] aria-busy:pointer-events-none aria-busy:opacity-80"
          : "mt-6 inline-flex h-11 w-full cursor-not-allowed items-center justify-center gap-3 rounded-xl bg-[#F8FAD7]/12 px-5 text-sm font-bold text-[#F8FAD7]/38"
      }
    >
      <GoogleMark />
      {yendo ? "Conectando con Google…" : "Continuar con Google"}
    </a>
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
