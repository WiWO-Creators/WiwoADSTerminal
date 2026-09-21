"use client";

import { Building2, CornerDownLeft } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { ViewKey } from "./data";

export type DestinoDePaleta = { key: ViewKey; label: string };

/**
 * Búsqueda rápida (⌘K / Ctrl+K): saltar a cualquier sección o cambiar de
 * cliente sin pasar por el menú. Es lo más rápido para quien maneja muchas
 * cuentas: escribir tres letras del cliente y listo.
 */
export function PaletaDeComandos({
  open,
  onOpenChange,
  destinos,
  clientes,
  onIrA,
  onElegirCliente,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destinos: DestinoDePaleta[];
  clientes: Array<{ id: string; name: string }>;
  onIrA: (view: ViewKey) => void;
  onElegirCliente: (portfolioId: string) => void;
}) {
  function cerrarY(accion: () => void) {
    onOpenChange(false);
    accion();
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Buscar"
      description="Ve a una sección o cambia de cliente"
      showCloseButton={false}
    >
      <CommandInput placeholder="Buscar una sección o un cliente…" />
      <CommandList>
        <CommandEmpty>No hay coincidencias.</CommandEmpty>
        <CommandGroup heading="Ir a">
          {destinos.map((destino) => (
            <CommandItem
              key={destino.key}
              value={`ir ${destino.label}`}
              onSelect={() => cerrarY(() => onIrA(destino.key))}
            >
              <CornerDownLeft className="text-muted-foreground" />
              {destino.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {clientes.length > 0 && (
          <CommandGroup heading="Cambiar de cliente">
            {clientes.map((cliente) => (
              <CommandItem
                key={cliente.id}
                value={`cliente ${cliente.name}`}
                onSelect={() => cerrarY(() => onElegirCliente(cliente.id))}
              >
                <Building2 className="text-brand" />
                {cliente.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
