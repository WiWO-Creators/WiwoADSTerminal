"use client";

import { useEffect, useState } from "react";

/**
 * Susu — la mascota de WiWO.ADS, un poodle que aparece de sorpresa por la
 * pantalla de vez en cuando. Puro detalle de marca, sin ningún efecto sobre
 * los datos ni la operación: si esto se rompe, no debe romper nada más, por
 * eso vive en su propio componente, aislado del resto del dashboard.
 *
 * Aparece en un punto aleatorio del viewport, se queda unos segundos y se
 * va sola; un clic la despide antes. Después de irse, programa su próxima
 * aparición con otro tiempo aleatorio — nunca en un intervalo fijo, para
 * que de verdad se sienta como una sorpresa y no como un parpadeo previsible.
 */

const ESPERA_MIN_MS = 45_000;
const ESPERA_MAX_MS = 110_000;
const VISIBLE_MS = 5_500;
/** Margen desde cada borde del viewport, para que Susu nunca quede cortada
 * ni tape la esquina donde vive el asistente de IA. */
const MARGEN_PX = 90;
const MARGEN_INFERIOR_PX = 140;

type Posicion = { top: number; left: number };

function posicionAleatoria(): Posicion {
  const alto = typeof window === "undefined" ? 800 : window.innerHeight;
  const ancho = typeof window === "undefined" ? 1200 : window.innerWidth;
  return {
    top: MARGEN_PX + Math.random() * Math.max(1, alto - MARGEN_PX - MARGEN_INFERIOR_PX),
    left: MARGEN_PX + Math.random() * Math.max(1, ancho - MARGEN_PX * 2),
  };
}

function esperaAleatoria(): number {
  return ESPERA_MIN_MS + Math.random() * (ESPERA_MAX_MS - ESPERA_MIN_MS);
}

export function MascotaSusu() {
  const [posicion, setPosicion] = useState<Posicion | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    let timeoutAparicion: ReturnType<typeof setTimeout>;
    let timeoutSalida: ReturnType<typeof setTimeout>;

    function programarAparicion() {
      timeoutAparicion = setTimeout(() => {
        setSaliendo(false);
        setPosicion(posicionAleatoria());
        timeoutSalida = setTimeout(despedirse, VISIBLE_MS);
      }, esperaAleatoria());
    }

    function despedirse() {
      setSaliendo(true);
      // Espera a que termine la animación de salida antes de desmontar y
      // programar la próxima — si se corta a mitad, Susu "parpadea" en vez
      // de despedirse.
      setTimeout(() => {
        setPosicion(null);
        programarAparicion();
      }, 400);
    }

    programarAparicion();
    return () => {
      clearTimeout(timeoutAparicion);
      clearTimeout(timeoutSalida);
    };
  }, []);

  if (!posicion) return null;

  return (
    <button
      type="button"
      aria-label="Susu, la mascota de WiWO.ADS"
      title="¡Hola, soy Susu!"
      onClick={() => setSaliendo(true)}
      style={{ top: posicion.top, left: posicion.left }}
      className={`fixed z-30 cursor-pointer transition-all duration-500 ease-out motion-reduce:animate-none ${
        saliendo
          ? "translate-y-2 scale-75 opacity-0"
          : "translate-y-0 scale-100 opacity-100 animate-[susu-salto_2.2s_ease-in-out_infinite]"
      }`}
    >
      <SusuSvg className="size-14 text-[#FF4D4D] drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]" />
    </button>
  );
}

function SusuSvg({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Pompón de la cola */}
      <circle cx="9" cy="30" r="5.5" />
      {/* Cuerpo */}
      <path d="M14 33 Q20 24 32 25 Q44 26 47 36 Q49 43 42 46 L22 46 Q13 44 14 33 Z" />
      {/* Pompones de las patas */}
      <circle cx="21" cy="52" r="4" />
      <circle cx="38" cy="52" r="4" />
      {/* Patas */}
      <path d="M21 46 L21 49" />
      <path d="M38 46 L38 49" />
      {/* Cuello */}
      <path d="M40 27 Q44 20 41 15" />
      {/* Cabeza, con el pompón característico */}
      <circle cx="41" cy="12" r="9" />
      {/* Orejas caídas */}
      <path d="M35 10 Q30 12 31 19" />
      <path d="M47 10 Q52 12 51 19" />
      {/* Cara */}
      <circle cx="38" cy="11" r="0.8" fill="currentColor" />
      <circle cx="45" cy="11" r="0.8" fill="currentColor" />
      <path d="M40 16 Q41.5 17.5 43 16" />
    </svg>
  );
}
