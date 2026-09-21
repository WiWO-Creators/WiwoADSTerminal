import { ThinkingOrb } from "@/app/ui"

/**
 * El indicador de carga de WiWO es el Thinking Orb, no un giro genérico:
 * cualquier `<Spinner />` que se use en adelante (incluidos los de
 * componentes de shadcn) muestra lo mismo que el resto de la app.
 */
function Spinner({ className }: { className?: string }) {
  return <ThinkingOrb size="sm" state="thinking" className={className} />
}

export { Spinner }
