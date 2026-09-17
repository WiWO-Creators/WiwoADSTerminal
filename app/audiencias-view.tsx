"use client";

import { useState } from "react";
import { LoaderCircle, Users } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PortfolioSummary } from "@/lib/portafolios";
import { Surface } from "./ui";

type CuentaGoogle = {
  portfolioName: string;
  accountId: string;
  accountName: string;
};

/** Lo que queda de una lista creada en esta sesión — Windsor no trae una
 * acción para listar las que ya existen, así que no hay de dónde recuperarlas
 * si se recarga la página; por eso el aviso de guardar el id. */
type ListaConocida = { id: string; nombre: string };

async function ejecutar(
  accountId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch("/api/anuncios/gestionar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", accountId, action, params }),
  });
  const body = (await response.json()) as {
    ok: boolean;
    error?: string;
    data?: unknown;
  };
  if (!response.ok || !body.ok) {
    throw new Error(body.error ?? "No se pudo completar la acción");
  }
  return body.data;
}

/**
 * Audiencias de Google (Customer Match) — la única forma real, sin inventar
 * ningún id, de acercarse a "misma persona en Google y en Meta a la vez":
 * subir la misma lista de contactos (con hash, nunca en texto plano) a cada
 * plataforma por separado. No hay una clave común entre las dos que un
 * anunciante pueda usar para cruzarlas 1 a 1 — esto es la coincidencia
 * probabilística que ya usa la industria, no una promesa de match exacto.
 *
 * Meta no está acá: Windsor no expone una acción de audiencia personalizada
 * para `facebook` todavía (sí existe del lado de la API real de Meta, pero
 * no llegó a esta integración) — no es que sea imposible, es que hoy no se
 * puede construir desde acá sin inventar el acceso.
 */
export function AudienciasView({
  portfolios,
}: {
  portfolios: PortfolioSummary[];
}) {
  const cuentasGoogle: CuentaGoogle[] = portfolios.flatMap((p) =>
    p.accounts
      .filter((a) => a.provider === "google")
      .map((a) => ({
        portfolioName: p.name,
        // `PerformanceAccountSummary.id` es compuesto ("windsor:google:123"),
        // no el id nativo que Windsor exige para escribir — mismo recorte
        // que ya usa `AnunciosView` para el botón "+ Añadir".
        accountId: a.id.split(":").slice(2).join(":"),
        accountName: a.name,
      })),
  );
  const [cuentaId, setCuentaId] = useState("");
  const cuenta = cuentasGoogle.find((c) => c.accountId === cuentaId) ?? null;
  const [listas, setListas] = useState<ListaConocida[]>([]);

  return (
    <div className="mx-auto w-full max-w-[900px] p-4 md:p-6">
      <div className="mb-5">
        <p className="font-micro mb-3 inline-flex items-center gap-2 text-[0.62rem] text-[#F8FAD7]/50">
          <Users className="size-3 text-[#4242FF]" />
          Google Ads · Customer Match
        </p>
        <h2 className="neo-section-title">Audiencias</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#F8FAD7]/58">
          Sube listas de contactos (correo, teléfono o domicilio) para
          segmentar o excluir a personas específicas en Google Ads. Los datos
          se hashean acá mismo, en el propio servidor de Windsor, antes de
          llegar a Google — nunca se guardan en WiWO.ADS.
        </p>
      </div>

      <Surface className="mb-4 p-4">
        <label className="font-micro block text-[0.6rem] text-[#F8FAD7]/50">
          CUENTA DE GOOGLE ADS
        </label>
        <Select value={cuentaId} onValueChange={setCuentaId}>
          <SelectTrigger className="mt-1.5 w-full bg-[#292929]/60 sm:w-96">
            <SelectValue placeholder="Elige una cuenta…" />
          </SelectTrigger>
          <SelectContent>
            {cuentasGoogle.map((c) => (
              <SelectItem key={c.accountId} value={c.accountId}>
                {c.portfolioName} · {c.accountName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {cuentasGoogle.length === 0 && (
          <p className="mt-2 text-xs text-[#F8FAD7]/45">
            Ningún cliente tiene todavía una cuenta de Google Ads conectada.
          </p>
        )}
      </Surface>

      {cuenta && (
        <div className="space-y-4">
          <TarjetaCrearLista
            cuenta={cuenta}
            onCreada={(id, nombre) =>
              setListas((actual) => [...actual, { id, nombre }])
            }
          />
          <TarjetaSubirContactos cuenta={cuenta} listas={listas} />
          <TarjetaEstadoSubida cuenta={cuenta} />
          <TarjetaAdjuntar cuenta={cuenta} listas={listas} />
          <TarjetaAdministrarLista cuenta={cuenta} listas={listas} />
        </div>
      )}
    </div>
  );
}

function TarjetaCrearLista({
  cuenta,
  onCreada,
}: {
  cuenta: CuentaGoogle;
  onCreada: (id: string, nombre: string) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [sinExpiracion, setSinExpiracion] = useState(true);

  async function crear() {
    if (!nombre.trim()) {
      toast.error("La lista necesita un nombre");
      return;
    }
    setEnviando(true);
    try {
      const data = (await ejecutar(cuenta.accountId, "create_customer_match_list", {
        name: nombre.trim(),
        ...(descripcion.trim() ? { description: descripcion.trim() } : {}),
        // 10000 es el valor centinela real de Google para "sin expiración".
        membership_life_span_days: sinExpiracion ? 10000 : 540,
      })) as { user_list_id?: string } | null;
      const id = data?.user_list_id;
      if (!id) {
        toast.error(
          "Google no devolvió el id de la lista — revisa que la cuenta esté habilitada para Customer Match",
        );
        return;
      }
      onCreada(id, nombre.trim());
      toast.success(`Lista creada — id ${id}`, {
        description: "Guárdalo: no queda visible si recargas la página.",
      });
      setNombre("");
      setDescripcion("");
    } catch (issue) {
      toast.error(issue instanceof Error ? issue.message : "No se pudo crear la lista");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Surface className="p-4">
      <h3 className="text-sm font-bold text-[#F8FAD7]">Crear lista</h3>
      <div className="mt-3 space-y-2">
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de la lista"
          className="bg-[#292929]/60"
        />
        <Input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Descripción (opcional)"
          className="bg-[#292929]/60"
        />
        <label className="flex items-center gap-2 text-xs text-[#F8FAD7]/70">
          <input
            type="checkbox"
            checked={sinExpiracion}
            onChange={(e) => setSinExpiracion(e.target.checked)}
            className="accent-[#4242FF]"
          />
          Sin expiración (si no, cada miembro cae de la lista a los 540 días)
        </label>
        <Button onClick={() => void crear()} disabled={enviando}>
          {enviando ? <LoaderCircle className="animate-spin" /> : null}
          Crear
        </Button>
      </div>
    </Surface>
  );
}

const CONSENTIMIENTOS = [
  { id: "UNSPECIFIED", label: "No declarado" },
  { id: "GRANTED", label: "Otorgado" },
  { id: "DENIED", label: "Denegado" },
];

function TarjetaSubirContactos({
  cuenta,
  listas,
}: {
  cuenta: CuentaGoogle;
  listas: ListaConocida[];
}) {
  const [enviando, setEnviando] = useState(false);
  const [listaId, setListaId] = useState("");
  const [texto, setTexto] = useState("");
  const [consentAds, setConsentAds] = useState("UNSPECIFIED");
  const [consentUser, setConsentUser] = useState("UNSPECIFIED");
  const [ultimoRequestId, setUltimoRequestId] = useState<string | null>(null);

  async function subir() {
    if (!listaId.trim()) {
      toast.error("Falta el id de la lista");
      return;
    }
    const members = texto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((linea) => (linea.includes("@") ? { email: linea } : { phone_number: linea }));
    if (members.length === 0) {
      toast.error("Escribe al menos un correo o teléfono, uno por línea");
      return;
    }
    setEnviando(true);
    try {
      // Los valores viajan tal cual — Windsor los normaliza y hashea con
      // SHA-256 del lado del servidor antes de subirlos a Google; nunca se
      // envía un hash armado acá.
      const data = (await ejecutar(cuenta.accountId, "upload_customer_match_list", {
        user_list_id: listaId.trim(),
        members,
        consent_ad_personalization: consentAds,
        consent_ad_user_data: consentUser,
        operation_type: "add",
      })) as { request_id?: string } | null;
      if (data?.request_id) setUltimoRequestId(data.request_id);
      toast.success(`${members.length} contacto(s) enviados`, {
        description: data?.request_id
          ? `Subida en proceso — id ${data.request_id}. Google tarda de minutos a 24 horas en confirmar.`
          : "Google confirmó la recepción.",
      });
      setTexto("");
    } catch (issue) {
      toast.error(issue instanceof Error ? issue.message : "No se pudo subir la lista");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Surface className="p-4">
      <h3 className="text-sm font-bold text-[#F8FAD7]">Subir contactos</h3>
      <div className="mt-3 space-y-2">
        <Input
          value={listaId}
          onChange={(e) => setListaId(e.target.value)}
          placeholder="Id de la lista (de «Crear lista» o de Google Ads)"
          className="bg-[#292929]/60"
        />
        {listas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {listas.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setListaId(l.id)}
                className="rounded-full border border-[#F8FAD7]/10 bg-[#292929]/50 px-2 py-0.5 text-[0.65rem] text-[#F8FAD7]/60 hover:text-[#F8FAD7]/85"
              >
                {l.nombre}
              </button>
            ))}
          </div>
        )}
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={5}
          placeholder={"persona@correo.com\n+56912345678"}
          className="bg-[#292929]/60"
        />
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="font-micro block text-[0.58rem] text-[#F8FAD7]/45">
              CONSENTIMIENTO · PUBLICIDAD PERSONALIZADA
            </label>
            <Select value={consentAds} onValueChange={setConsentAds}>
              <SelectTrigger className="mt-1 w-52 bg-[#292929]/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONSENTIMIENTOS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="font-micro block text-[0.58rem] text-[#F8FAD7]/45">
              CONSENTIMIENTO · USO DE DATOS
            </label>
            <Select value={consentUser} onValueChange={setConsentUser}>
              <SelectTrigger className="mt-1 w-52 bg-[#292929]/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONSENTIMIENTOS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-[0.65rem] leading-5 text-[#F8FAD7]/35">
          Declarar el consentimiento real de cada contacto es responsabilidad
          de quien sube la lista, no algo que esta pantalla pueda verificar.
        </p>
        <Button onClick={() => void subir()} disabled={enviando}>
          {enviando ? <LoaderCircle className="animate-spin" /> : null}
          Subir
        </Button>
        {ultimoRequestId && (
          <p className="text-[0.68rem] text-[#F8FAD7]/50">
            Último id de subida: <code>{ultimoRequestId}</code>
          </p>
        )}
      </div>
    </Surface>
  );
}

function TarjetaEstadoSubida({ cuenta }: { cuenta: CuentaGoogle }) {
  const [enviando, setEnviando] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [estado, setEstado] = useState<Record<string, unknown> | null>(null);

  async function consultar() {
    if (!requestId.trim()) {
      toast.error("Falta el id de la subida");
      return;
    }
    setEnviando(true);
    try {
      const data = await ejecutar(cuenta.accountId, "get_customer_match_upload_status", {
        request_id: requestId.trim(),
      });
      setEstado((data as Record<string, unknown>) ?? {});
    } catch (issue) {
      toast.error(issue instanceof Error ? issue.message : "No se pudo consultar el estado");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Surface className="p-4">
      <h3 className="text-sm font-bold text-[#F8FAD7]">Ver estado de una subida</h3>
      <div className="mt-3 flex items-end gap-3">
        <Input
          value={requestId}
          onChange={(e) => setRequestId(e.target.value)}
          placeholder="Id de la subida"
          className="min-w-0 flex-1 bg-[#292929]/60"
        />
        <Button onClick={() => void consultar()} disabled={enviando}>
          {enviando ? <LoaderCircle className="animate-spin" /> : null}
          Consultar
        </Button>
      </div>
      {estado && (
        <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-[#1c1d1b] p-3 text-[0.7rem] text-[#F8FAD7]/70">
          {JSON.stringify(estado, null, 2)}
        </pre>
      )}
      <p className="mt-2 text-[0.65rem] leading-5 text-[#F8FAD7]/35">
        &quot;PROCESSING&quot; puede tardar hasta 24 horas — no conviene
        consultar más de una vez por minuto, comparte cupo con la lectura de
        métricas.
      </p>
    </Surface>
  );
}

function TarjetaAdjuntar({
  cuenta,
  listas,
}: {
  cuenta: CuentaGoogle;
  listas: ListaConocida[];
}) {
  const [enviando, setEnviando] = useState(false);
  const [listaId, setListaId] = useState("");
  const [adGroupId, setAdGroupId] = useState("");
  const [excluir, setExcluir] = useState(false);

  async function adjuntar() {
    if (!listaId.trim() || !adGroupId.trim()) {
      toast.error("Faltan el id de la lista y el del grupo de anuncios");
      return;
    }
    setEnviando(true);
    try {
      await ejecutar(cuenta.accountId, "attach_user_list_to_ad_group", {
        ad_group_id: adGroupId.trim(),
        user_list_id: listaId.trim(),
        exclude: excluir,
      });
      toast.success(
        excluir ? "Lista excluida del grupo de anuncios" : "Lista adjuntada al grupo de anuncios",
      );
    } catch (issue) {
      toast.error(issue instanceof Error ? issue.message : "No se pudo adjuntar la lista");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Surface className="p-4">
      <h3 className="text-sm font-bold text-[#F8FAD7]">
        Adjuntar a un grupo de anuncios
      </h3>
      <div className="mt-3 space-y-2">
        <Input
          value={listaId}
          onChange={(e) => setListaId(e.target.value)}
          placeholder="Id de la lista"
          className="bg-[#292929]/60"
        />
        {listas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {listas.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setListaId(l.id)}
                className="rounded-full border border-[#F8FAD7]/10 bg-[#292929]/50 px-2 py-0.5 text-[0.65rem] text-[#F8FAD7]/60 hover:text-[#F8FAD7]/85"
              >
                {l.nombre}
              </button>
            ))}
          </div>
        )}
        <Input
          value={adGroupId}
          onChange={(e) => setAdGroupId(e.target.value)}
          placeholder="Id del grupo de anuncios (Publicaciones o Google Ads)"
          className="bg-[#292929]/60"
        />
        <label className="flex items-center gap-2 text-xs text-[#F8FAD7]/70">
          <input
            type="checkbox"
            checked={excluir}
            onChange={(e) => setExcluir(e.target.checked)}
            className="accent-[#4242FF]"
          />
          Excluir (nunca mostrar a quienes están en esta lista) en vez de
          segmentar
        </label>
        <Button onClick={() => void adjuntar()} disabled={enviando}>
          {enviando ? <LoaderCircle className="animate-spin" /> : null}
          {excluir ? "Excluir" : "Adjuntar"}
        </Button>
      </div>
    </Surface>
  );
}

function TarjetaAdministrarLista({
  cuenta,
  listas,
}: {
  cuenta: CuentaGoogle;
  listas: ListaConocida[];
}) {
  const [enviando, setEnviando] = useState(false);
  const [listaId, setListaId] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false);

  async function renombrar() {
    if (!listaId.trim() || !nombreNuevo.trim()) {
      toast.error("Faltan el id de la lista y el nombre nuevo");
      return;
    }
    setEnviando(true);
    try {
      await ejecutar(cuenta.accountId, "rename_customer_match_list", {
        user_list_id: listaId.trim(),
        name: nombreNuevo.trim(),
      });
      toast.success("Lista renombrada");
    } catch (issue) {
      toast.error(issue instanceof Error ? issue.message : "No se pudo renombrar la lista");
    } finally {
      setEnviando(false);
    }
  }

  async function borrar() {
    setConfirmandoBorrar(false);
    setEnviando(true);
    try {
      await ejecutar(cuenta.accountId, "delete_customer_match_list", {
        user_list_id: listaId.trim(),
      });
      toast.success("Lista eliminada");
      setListaId("");
    } catch (issue) {
      toast.error(issue instanceof Error ? issue.message : "No se pudo eliminar la lista");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Surface className="p-4">
      <h3 className="text-sm font-bold text-[#F8FAD7]">Renombrar o eliminar</h3>
      <div className="mt-3 space-y-2">
        <Input
          value={listaId}
          onChange={(e) => setListaId(e.target.value)}
          placeholder="Id de la lista"
          className="bg-[#292929]/60"
        />
        {listas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {listas.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setListaId(l.id)}
                className="rounded-full border border-[#F8FAD7]/10 bg-[#292929]/50 px-2 py-0.5 text-[0.65rem] text-[#F8FAD7]/60 hover:text-[#F8FAD7]/85"
              >
                {l.nombre}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-3">
          <Input
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="Nombre nuevo"
            className="min-w-0 flex-1 bg-[#292929]/60"
          />
          <Button onClick={() => void renombrar()} disabled={enviando}>
            {enviando ? <LoaderCircle className="animate-spin" /> : null}
            Renombrar
          </Button>
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger-deep/10"
            onClick={() => {
              if (!listaId.trim()) {
                toast.error("Falta el id de la lista");
                return;
              }
              setConfirmandoBorrar(true);
            }}
            disabled={enviando}
          >
            Eliminar
          </Button>
        </div>
        <p className="text-[0.65rem] leading-5 text-[#F8FAD7]/35">
          Eliminar no se puede deshacer: se pierden todos los miembros de la
          lista y se desvincula de cualquier grupo de anuncios que la use.
        </p>
      </div>

      <AlertDialog open={confirmandoBorrar} onOpenChange={setConfirmandoBorrar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto borra la lista de verdad en Google Ads. No se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void borrar()}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Surface>
  );
}
