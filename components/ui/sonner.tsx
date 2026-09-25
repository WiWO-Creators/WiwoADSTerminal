"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { ThinkingOrb } from "@/app/ui"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // El lanzador de Thinking Orb vive fijo en bottom-4 right-4, size-16
      // (64px) — el rincón por defecto de Sonner. Sin este offset, el primer
      // aviso quedaba encima del orbe, tapándolo justo cuando más se necesita
      // (por ejemplo mientras está "pensando"). 96px despeja el botón entero
      // más el mismo margen de 16px que ya usa.
      offset={{ bottom: 96, right: 16 }}
      mobileOffset={{ bottom: 96, right: 16 }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        // El indicador de carga de WiWO es el orbe, también en los avisos.
        loading: <ThinkingOrb size="sm" state="thinking" label="" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
