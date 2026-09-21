"use client";

import { useEffect, useState } from "react";
import { CalendarRange, LayoutDashboard, Moon, Sun } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RANGOS, RANGO_LABELS, type RangoId } from "@/lib/rangos";
import { cn } from "@/lib/utils";
import type { ViewKey } from "./data";
import { Surface } from "./ui";

export const DEFAULT_VIEW_STORAGE_KEY = "wiwo-ads-default-view";
export const DEFAULT_RANGO_STORAGE_KEY = "wiwo-ads-default-rango";

/** Vistas que tiene sentido dejar como "pantalla de inicio" — no todas las
 * secciones son un buen punto de llegada (Ajustes o Equipo no lo son). */
const OPCIONES_VISTA_INICIAL: Array<{ key: ViewKey; label: string }> = [
  { key: "control", label: "Sala de control" },
  { key: "clients", label: "Clientes" },
  { key: "builder", label: "Creador de campañas" },
  { key: "health", label: "Dashboard C-Level" },
];

/**
 * Ajustes generales de la app — preferencias personales de esta cuenta, no
 * configuración de un cliente puntual (eso vive en Clientes → Ficha).
 *
 * A propósito quedan afuera moneda, zona horaria y notificaciones: no hay
 * conversión de moneda en ningún lado (los totales solo se agrupan por la
 * moneda que ya trae cada cuenta, nunca se convierten — un selector de
 * "moneda preferida" no cambiaría ningún número), la zona horaria está fija
 * en distintos puntos del código sin un único lugar que la lea, y la campana
 * de notificaciones todavía no tiene nada real conectado detrás. Ofrecer un
 * control ahí solo enseñaría a desconfiar de los controles de esta pantalla.
 */
export function SettingsView({
  rango,
  cambiandoRango,
  onRangoChange,
  theme,
  onThemeChange,
}: {
  rango: RangoId;
  cambiandoRango: boolean;
  onRangoChange: (valor: RangoId) => void;
  theme: "dark" | "light";
  onThemeChange: (checked: boolean) => void;
}) {
  const [vistaInicial, setVistaInicial] = useState<ViewKey>("control");

  useEffect(() => {
    const guardada = window.localStorage.getItem(DEFAULT_VIEW_STORAGE_KEY);
    if (OPCIONES_VISTA_INICIAL.some((item) => item.key === guardada)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage no existe en el servidor
      setVistaInicial(guardada as ViewKey);
    }
  }, []);

  function cambiarVistaInicial(valor: ViewKey) {
    setVistaInicial(valor);
    window.localStorage.setItem(DEFAULT_VIEW_STORAGE_KEY, valor);
  }

  function cambiarRangoPorDefecto(valor: RangoId) {
    // Aplica ahora mismo (como cualquier otro cambio de periodo) y además
    // queda guardado para la próxima vez que se entre a la app.
    onRangoChange(valor);
    window.localStorage.setItem(DEFAULT_RANGO_STORAGE_KEY, valor);
  }

  return (
    <div className="mx-auto w-full max-w-[900px] p-4 md:p-6">
      <div className="mb-5">
        <p className="font-micro mb-3 inline-flex items-center gap-2 text-[0.62rem] text-foreground/50">
          <LayoutDashboard className="size-3 text-brand" />
          Preferencias de esta cuenta
        </p>
        <h2 className="neo-section-title">Ajustes generales</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/58">
          Cómo arranca la app para ti. No afecta a nadie más del equipo.
        </p>
      </div>

      <div className="space-y-4">
        <Surface className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-foreground">
                Vista inicial
              </p>
              <p className="mt-1 max-w-md text-xs leading-5 text-foreground/55">
                La pantalla que se abre al iniciar sesión.
              </p>
            </div>
            <Select
              value={vistaInicial}
              onValueChange={(valor) => cambiarVistaInicial(valor as ViewKey)}
            >
              <SelectTrigger className="w-full border-foreground/10 bg-field/60 sm:w-52">
                <LayoutDashboard className="size-3.5 text-brand" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPCIONES_VISTA_INICIAL.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Surface>

        <Surface className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-foreground">
                Rango de fechas por defecto
              </p>
              <p className="mt-1 max-w-md text-xs leading-5 text-foreground/55">
                El periodo con el que abren Sala de control, Dashboard C-Level
                y el resto de pantallas con métricas.
              </p>
            </div>
            <Select
              value={rango}
              disabled={cambiandoRango}
              onValueChange={(valor) =>
                cambiarRangoPorDefecto(valor as RangoId)
              }
            >
              <SelectTrigger className="w-full border-foreground/10 bg-field/60 sm:w-52">
                <CalendarRange className="size-3.5 text-brand" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGOS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {RANGO_LABELS[id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Surface>

        <Surface className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-foreground">Apariencia</p>
              <p className="mt-1 max-w-md text-xs leading-5 text-foreground/55">
                Tema oscuro o claro para toda la interfaz.
              </p>
            </div>
            <div
              role="group"
              aria-label="Tema de la interfaz"
              className="flex items-center gap-0.5 rounded-full border border-foreground/10 bg-field/60 p-1"
            >
              <button
                type="button"
                aria-pressed={theme === "dark"}
                onClick={() => onThemeChange(false)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  theme === "dark"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-foreground/40 hover:text-foreground/70",
                )}
              >
                <Moon className="size-3.5" aria-hidden="true" />
                Dark
              </button>
              <button
                type="button"
                aria-pressed={theme === "light"}
                onClick={() => onThemeChange(true)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  theme === "light"
                    ? "bg-foreground text-primary-foreground shadow-sm"
                    : "text-foreground/40 hover:text-foreground/70",
                )}
              >
                <Sun className="size-3.5" aria-hidden="true" />
                Light
              </button>
            </div>
          </div>
        </Surface>
      </div>
    </div>
  );
}
