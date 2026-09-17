"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/permisos";
import { Surface } from "./ui";

/** Trae el equipo sin tocar estado, para poder usarla dentro de un efecto. */
async function fetchTeam(): Promise<Member[]> {
  const response = await fetch("/api/equipo", { cache: "no-store" });
  const body = (await response.json()) as { members?: Member[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? "No se pudo cargar");
  return body.members ?? [];
}

type Member = {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  portfolioIds: string[];
  foundingAdmin: boolean;
  invitedBy: string | null;
  lastSeenAt: number | null;
};

/**
 * Administración del equipo.
 *
 * Dos ejes separados a propósito: el ROL define qué puede hacer una persona y
 * los CLIENTES definen sobre qué. Un buyer con todos los clientes asignados
 * sigue sin poder aprobar cambios.
 */
export function EquipoView({
  portfolios,
}: {
  portfolios: Array<{ id: string; name: string }>;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("buyer");

  const load = useCallback(async () => {
    try {
      setMembers(await fetchTeam());
      setError(null);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Cargar al montar es exactamente para lo que son los efectos; `load`
    // hace su propio setState adentro, el linter solo ve la llamada indirecta.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ver nota de arriba
    void load();
  }, [load]);

  async function invite() {
    if (!email.trim()) return;
    setSaving("invitar");
    try {
      const response = await fetch("/api/equipo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role, portfolioIds: [] }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo invitar");
      toast.success(`${email} agregado como ${ROLE_LABELS[role]}`);
      setEmail("");
      await load();
    } catch (issue) {
      toast.error(issue instanceof Error ? issue.message : "No se pudo invitar");
    } finally {
      setSaving(null);
    }
  }

  async function patch(userId: string, change: Partial<Member>) {
    setSaving(userId);
    try {
      const response = await fetch("/api/equipo", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, ...change }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar");
      await load();
    } catch (issue) {
      toast.error(issue instanceof Error ? issue.message : "No se pudo guardar");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
      <div className="mb-5">
        <p className="font-micro mb-3 inline-flex items-center gap-2 text-[0.62rem] text-[#F8FAD7]/50">
          <ShieldCheck className="size-3 text-[#4242FF]" />
          Acceso · roles y clientes
        </p>
        <h2 className="neo-section-title">
          Quién entra y qué puede hacer
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#F8FAD7]/58">
          Solo entra quien esté en esta lista. El rol decide qué puede hacer; los
          clientes asignados deciden sobre qué.
        </p>
      </div>

      <Surface className="mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="nuevo-correo"
              className="font-micro block text-[0.62rem] text-[#F8FAD7]/55"
            >
              CORREO
            </label>
            <Input
              id="nuevo-correo"
              type="email"
              value={email}
              placeholder="persona@empresa.com"
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 bg-[#292929]/60"
            />
          </div>
          <div className="sm:w-52">
            <label className="font-micro block text-[0.62rem] text-[#F8FAD7]/55">
              ROL
            </label>
            <Select value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger className="mt-1.5 w-full bg-[#292929]/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {ROLE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => void invite()}
            disabled={saving === "invitar" || !email.trim()}
            className="h-10 font-extrabold"
          >
            {saving === "invitar" ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <UserPlus />
            )}
            Agregar
          </Button>
        </div>
        <p className="mt-2 text-xs leading-5 text-[#F8FAD7]/45">
          {ROLE_DESCRIPTIONS[role]}
        </p>
      </Surface>

      {error ? (
        <div className="rounded-[16px] border border-danger-deep/25 bg-danger-deep/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : loading ? (
        <p className="px-4 py-8 text-center text-sm text-[#F8FAD7]/45">
          Cargando equipo…
        </p>
      ) : (
        <Surface className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F8FAD7]/[0.03] hover:bg-[#F8FAD7]/[0.04]">
                  <TableHead className="pl-4 text-xs text-[#F8FAD7]/58">
                    Persona
                  </TableHead>
                  <TableHead className="text-xs text-[#F8FAD7]/58">Rol</TableHead>
                  <TableHead className="text-xs text-[#F8FAD7]/58">
                    Clientes
                  </TableHead>
                  <TableHead className="pr-4 text-right text-xs text-[#F8FAD7]/58">
                    Estado
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow
                    key={member.id}
                    className="h-16 bg-[#323330] hover:bg-[#F8FAD7]/[0.04]"
                  >
                    <TableCell className="pl-4">
                      <span className="block text-sm font-bold text-[#F8FAD7]">
                        {member.email}
                      </span>
                      <span className="mt-1 block text-xs text-[#F8FAD7]/45">
                        {member.foundingAdmin
                          ? "Administrador fundador"
                          : member.invitedBy
                            ? `Agregado por ${member.invitedBy}`
                            : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {member.foundingAdmin ? (
                        <span className="text-sm font-semibold text-[#F8FAD7]/74">
                          {ROLE_LABELS[member.role]}
                        </span>
                      ) : (
                        <Select
                          value={member.role}
                          onValueChange={(value) =>
                            void patch(member.id, { role: value as Role })
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-40 bg-[#292929]/60"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((item) => (
                              <SelectItem key={item} value={item}>
                                {ROLE_LABELS[item]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <ClientPicker
                        portfolios={portfolios}
                        selected={member.portfolioIds}
                        role={member.role}
                        disabled={saving === member.id}
                        onChange={(ids) =>
                          void patch(member.id, { portfolioIds: ids })
                        }
                      />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {member.foundingAdmin ? (
                        <span className="text-xs text-[#F8FAD7]/45">
                          No editable
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={saving === member.id}
                          onClick={() =>
                            void patch(member.id, { isActive: !member.isActive })
                          }
                          className={cn(
                            "border-[#F8FAD7]/12 bg-transparent",
                            member.isActive
                              ? "text-[#F8FAD7]/70"
                              : "text-warn",
                          )}
                        >
                          {member.isActive ? "Desactivar" : "Reactivar"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Surface>
      )}
    </div>
  );
}

/**
 * Selector de clientes de una persona.
 *
 * Los roles que ven todo no muestran selector: asignarles clientes daría a
 * entender un límite que no existe.
 */
function ClientPicker({
  portfolios,
  selected,
  role,
  disabled,
  onChange,
}: {
  portfolios: Array<{ id: string; name: string }>;
  selected: string[];
  role: Role;
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  if (role === "admin" || role === "lead") {
    return (
      <span className="text-xs text-[#F8FAD7]/45">Todos los clientes</span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="text-left text-sm font-semibold text-[#4242FF] underline-offset-2 hover:underline disabled:opacity-50"
        >
          {selected.length === 0
            ? "Sin clientes asignados"
            : `${selected.length} ${selected.length === 1 ? "cliente" : "clientes"}`}
        </button>
      </PopoverTrigger>
      {/*
        Antes esto era un div condicional dentro de la misma celda: si la
        fila quedaba cerca del borde inferior de la tabla, la lista de
        clientes se cortaba contra el `overflow-hidden` de la tarjeta que
        envuelve la tabla. Popover la saca por portal, fuera de ese recorte.
      */}
      <PopoverContent align="start" className="w-64 p-2">
        <div className="max-h-44 space-y-1 overflow-y-auto">
          {portfolios.map((portfolio) => {
            const checked = selected.includes(portfolio.id);
            return (
              <label
                key={portfolio.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs text-[#F8FAD7]/78 hover:bg-[#F8FAD7]/[0.05]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selected.filter((id) => id !== portfolio.id)
                        : [...selected, portfolio.id],
                    )
                  }
                  className="size-3.5 accent-[#4242FF]"
                />
                <span className="truncate">{portfolio.name}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
