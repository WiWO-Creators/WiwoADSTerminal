"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Download, Upload } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { csvParaMeta, enLotes, parsearContactos } from "@/lib/contactos";
import type { PortfolioSummary } from "@/lib/portafolios";
import type { AdSummary } from "@/lib/performance-store";
import { MensajeriaView } from "./mensajeria-view";
import { OrbeDeBoton, Surface } from "./ui";

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
import { AudienciasMeta } from "./audiencias-meta";

export function AudienciasView({
  portfolios,
  ads,
  clienteSeleccionado,
  puedeAprobar,
}: {
  portfolios: PortfolioSummary[];
  ads: AdSummary[];
  /** El cliente del navbar: es el único selector de cliente de la app, así que
   * acá solo se ofrecen sus cuentas. Sin cliente elegido, se ven todas. */
  clienteSeleccionado: string | null;
  puedeAprobar: boolean;
}) {
  const [pestana, setPestana] = useState<"mensajeria" | "listas" | "meta">("listas");
  const cuentasVisibles = portfolios
    .filter((p) => !clienteSeleccionado || p.id === clienteSeleccionado)
    .flatMap((p) => p.accounts);
  const cuentasDelCliente = new Set(cuentasVisibles.map((a) => a.id));
  const adsDelCliente = ads.filter((ad) => cuentasDelCliente.has(ad.accountKey));
  // Conversaciones de mensajería iniciadas (Meta, 7 días) por cuenta — solo
  // el conteo, ver la nota en MensajeriaView sobre por qué no hay contenido.
  const conversacionesPorCuenta = new Map(
    cuentasVisibles.map((a) => [a.id, a.messagingConversations] as const),
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 md:p-6">
      <div className="mb-5">
        <h2 className="neo-section-title">Lookalike y audiencias</h2>
      </div>
      <div className="mb-4 flex gap-2">
        {(
          [
            { id: "mensajeria" as const, label: "Mensajería (WhatsApp y llamadas)" },
            { id: "listas" as const, label: "Listas de contactos" },
            { id: "meta" as const, label: "Audiencias de Meta" },
          ]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPestana(item.id)}
            className={
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors " +
              (pestana === item.id
                ? "border-brand bg-brand/12 text-foreground"
                : "border-foreground/12 text-foreground/55 hover:text-foreground")
            }
          >
            {item.label}
          </button>
        ))}
      </div>
      {pestana === "meta" ? (
        <AudienciasMeta clienteId={clienteSeleccionado} puedeAprobar={puedeAprobar} />
      ) : pestana === "mensajeria" ? (
        <MensajeriaView
          ads={adsDelCliente}
          puedeAprobar={puedeAprobar}
          conversacionesPorCuenta={conversacionesPorCuenta}
        />
      ) : (
        <ListasDeContactos
          portfolios={portfolios}
          ads={adsDelCliente}
          clienteSeleccionado={clienteSeleccionado}
        />
      )}
    </div>
  );
}

/** Dónde vive, en este navegador, lo último creado con "Crear lista" para
 * cada cuenta — Windsor no trae una acción para listar las que ya existen
 * (ver `ListaConocida`), así que sin esto se perdía todo al recargar. No es
 * la fuente de verdad (esa es Google Ads): si se borra el storage, o se abre
 * en otro navegador, simplemente no hay atajos, pero crear/subir/adjuntar
 * pegando el id a mano sigue funcionando igual. */
function claveListas(accountId: string): string {
  return `wiwo:listas-customer-match:${accountId}`;
}

function cargarListasGuardadas(accountId: string): ListaConocida[] {
  try {
    const crudo = window.localStorage.getItem(claveListas(accountId));
    if (!crudo) return [];
    const datos = JSON.parse(crudo) as unknown;
    if (!Array.isArray(datos)) return [];
    return datos.filter(
      (item): item is ListaConocida =>
        Boolean(item) && typeof item === "object" && "id" in item && "nombre" in item,
    );
  } catch {
    return [];
  }
}

function ListasDeContactos({
  portfolios,
  ads,
  clienteSeleccionado,
}: {
  portfolios: PortfolioSummary[];
  ads: AdSummary[];
  clienteSeleccionado: string | null;
}) {
  const cuentasGoogle: CuentaGoogle[] = portfolios
    .filter((p) => !clienteSeleccionado || p.id === clienteSeleccionado)
    .flatMap((p) =>
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
  const [cuentaElegida, setCuentaId] = useState("");
  // Con una sola cuenta posible no hay nada que elegir; si la elegida ya no
  // pertenece al cliente del navbar, se descarta en vez de operar sobre otra.
  const cuentaId = cuentasGoogle.some((c) => c.accountId === cuentaElegida)
    ? cuentaElegida
    : cuentasGoogle.length === 1
      ? cuentasGoogle[0].accountId
      : "";
  const cuenta = cuentasGoogle.find((c) => c.accountId === cuentaId) ?? null;
  const [listas, setListas] = useState<ListaConocida[]>([]);
  const [cuentaDeListas, setCuentaDeListas] = useState<string | null>(null);
  if ((cuenta?.accountId ?? null) !== cuentaDeListas) {
    setCuentaDeListas(cuenta?.accountId ?? null);
    setListas(cuenta ? cargarListasGuardadas(cuenta.accountId) : []);
  }

  function agregarLista(id: string, nombre: string) {
    setListas((actual) => {
      const siguiente = [...actual, { id, nombre }];
      if (cuenta) {
        try {
          window.localStorage.setItem(
            claveListas(cuenta.accountId),
            JSON.stringify(siguiente),
          );
        } catch {
          // Sin storage disponible (privado, cuota llena): la lista sigue
          // usable en esta sesión, solo no sobrevive a un recargo.
        }
      }
      return siguiente;
    });
  }

  const gruposDeAnuncios: Array<{ id: string; nombre: string; campana: string }> = [];
  {
    const vistos = new Set<string>();
    for (const ad of ads) {
      if (ad.provider !== "google" || ad.accountId !== cuenta?.accountId) continue;
      if (!ad.adsetId || vistos.has(ad.adsetId)) continue;
      vistos.add(ad.adsetId);
      gruposDeAnuncios.push({
        id: ad.adsetId,
        nombre: ad.adsetName ?? ad.adsetId,
        campana: ad.campaignName,
      });
    }
  }

  return (
    <div className="w-full">
      <div className="mb-5">
        <p className="max-w-2xl text-sm leading-6 text-foreground/58">
          Sube listas de contactos (correo, teléfono o domicilio) para
          segmentar o excluir a personas específicas. Los datos se hashean acá
          mismo, en el propio servidor de Windsor, antes de llegar a la
          plataforma — nunca se guardan en WiWO.ADS.
        </p>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-foreground/40">
          Por ahora solo Google Ads (Customer Match). Meta tiene el mismo tipo
          de audiencia en su propia plataforma, pero Windsor —el proveedor que
          conecta esta app con las plataformas— todavía no expone esa acción
          para Meta; en cuanto la exponga, se suma acá.
        </p>
      </div>

      <Surface className="mb-4 p-4">
        <label className="font-micro block text-[0.6rem] text-foreground/50">
          CUENTA DE GOOGLE ADS
        </label>
        <Select value={cuentaId} onValueChange={setCuentaId}>
          <SelectTrigger className="mt-1.5 w-full bg-field/60 sm:w-96">
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
          <p className="mt-2 text-xs text-foreground/45">
            Ningún cliente tiene todavía una cuenta de Google Ads conectada.
          </p>
        )}
      </Surface>

      {cuenta && (
        <div className="space-y-4">
          <TarjetaCrearLista cuenta={cuenta} onCreada={agregarLista} />
          <TarjetaSubirContactos cuenta={cuenta} listas={listas} />
          <TarjetaEstadoSubida cuenta={cuenta} />
          <TarjetaAdjuntar
            cuenta={cuenta}
            listas={listas}
            gruposDeAnuncios={gruposDeAnuncios}
          />
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
      <h3 className="text-sm font-bold text-foreground">Crear lista</h3>
      <div className="mt-3 space-y-2">
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de la lista"
          className="bg-field/60"
        />
        <Input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Descripción (opcional)"
          className="bg-field/60"
        />
        <label className="flex items-center gap-2 text-xs text-foreground/70">
          <input
            type="checkbox"
            checked={sinExpiracion}
            onChange={(e) => setSinExpiracion(e.target.checked)}
            className="accent-[#4242FF]"
          />
          Sin expiración (si no, cada miembro cae de la lista a los 540 días)
        </label>
        <Button onClick={() => void crear()} disabled={enviando}>
          {enviando ? <OrbeDeBoton /> : null}
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
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [listaId, setListaId] = useState("");
  // La base vive solo en la memoria de esta pantalla: no se guarda en ningún lado.
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<string | null>(null);
  const [consentAds, setConsentAds] = useState("UNSPECIFIED");
  const [consentUser, setConsentUser] = useState("UNSPECIFIED");
  const [autorizacion, setAutorizacion] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [ultimosIds, setUltimosIds] = useState<string[]>([]);

  // El análisis de una base grande tarda: se hace con el texto «diferido» para que escribir o pegar no congele la pantalla.
  const textoDiferido = useDeferredValue(texto);
  const analizando = textoDiferido !== texto;
  const carga = useMemo(() => parsearContactos(textoDiferido), [textoDiferido]);
  const [leyendo, setLeyendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const hayContactos = carga.miembros.length > 0;

  async function leerArchivo(file: File | undefined) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("El archivo pesa más de 25 MB: divídelo en partes");
      return;
    }
    setLeyendo(true);
    // Un tick para que se pinte «Leyendo…» antes de empezar el trabajo pesado.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      if (/\.xlsx$/i.test(file.name)) {
        // Excel: se lee la primera hoja y se pasa a texto separado por tabulaciones, que el lector ya entiende.
        const { readSheet } = await import("read-excel-file/web-worker");
        const filas = await readSheet(file);
        setTexto(filas.map((fila) => fila.map((celda) => String(celda ?? "").replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n"));
      } else if (/\.xls$/i.test(file.name)) {
        toast.error("Guarda el archivo como .xlsx o .csv (Excel antiguo .xls no se puede leer)");
        return;
      } else {
        setTexto(await file.text());
      }
      setArchivo(file.name);
    } catch (error) {
      console.error("WiWO.ADS leer archivo de contactos", error);
      toast.error("No se pudo leer el archivo. Revisa que sea un Excel (.xlsx) o un .csv válido");
    } finally {
      setLeyendo(false);
    }
  }

  async function subir() {
    setConfirmando(false);
    const lotes = enLotes(carga.miembros);
    setEnviando(true);
    setProgreso({ hechos: 0, total: lotes.length });
    const ids: string[] = [];
    let enviados = 0;
    try {
      for (const [indice, members] of lotes.entries()) {
        // Los valores viajan tal cual: Windsor los normaliza y hashea con
        // SHA-256 del lado del servidor antes de subirlos a Google. Nunca se
        // envía un hash armado acá, ni se guarda el contacto en la bitácora.
        const data = (await ejecutar(cuenta.accountId, "upload_customer_match_list", {
          user_list_id: listaId.trim(),
          members,
          consent_ad_personalization: consentAds,
          consent_ad_user_data: consentUser,
          operation_type: "add",
        })) as { request_id?: string } | null;
        if (data?.request_id) ids.push(data.request_id);
        enviados += members.length;
        setProgreso({ hechos: indice + 1, total: lotes.length });
      }
      setUltimosIds(ids);
      toast.success(`${enviados.toLocaleString("es-CL")} contacto(s) enviados`, {
        description: ids.length
          ? "Google tarda de minutos a 24 horas en confirmar. Revisa el estado abajo con el id de la subida."
          : "Google confirmó la recepción.",
      });
      // Terminó: la base sale de la memoria de la pantalla.
      setTexto("");
      setArchivo(null);
      setAutorizacion(false);
    } catch (issue) {
      setUltimosIds(ids);
      toast.error(issue instanceof Error ? issue.message : "No se pudo subir la lista", {
        description:
          enviados > 0
            ? `Ya se habían enviado ${enviados.toLocaleString("es-CL")} contactos antes del error; no los repitas.`
            : undefined,
      });
    } finally {
      setEnviando(false);
      setProgreso(null);
    }
  }

  async function descargarParaMeta() {
    try {
      const csv = await csvParaMeta(carga.miembros);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `audiencia-meta-${cuenta.portfolioName}.csv`.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
      enlace.click();
      URL.revokeObjectURL(url);
      toast.success("Archivo hasheado descargado", {
        description: "Súbelo en Meta → Administrador de anuncios → Audiencias → Crear público → Lista de clientes.",
      });
    } catch {
      toast.error("No se pudo generar el archivo para Meta");
    }
  }

  const puedeSubir = hayContactos && listaId.trim() !== "" && autorizacion && !enviando;

  return (
    <Surface className="p-4">
      <h3 className="text-sm font-bold text-foreground">Cargar base de clientes</h3>
      <p className="mt-1 text-xs leading-5 text-foreground/50">
        Sube un CSV (o pega una lista) con correos y teléfonos. Se valida acá, en tu navegador: no se guarda en WiWO.ADS.
      </p>
      <div className="mt-3 space-y-2">
        <Input
          value={listaId}
          onChange={(e) => setListaId(e.target.value)}
          placeholder="Id de la lista (de «Crear lista» o de Google Ads)"
          className="bg-field/60"
        />
        {listas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {listas.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setListaId(l.id)}
                className="rounded-full border border-foreground/10 bg-field/50 px-2 py-0.5 text-[0.65rem] text-foreground/60 hover:text-foreground/85"
              >
                {l.nombre}
              </button>
            ))}
          </div>
        )}

        <label
          // Arrastrar y soltar: el mismo camino que elegir el archivo, para no tener dos formas de leerlo.
          onDragOver={(e) => {
            e.preventDefault();
            if (!arrastrando) setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            void leerArchivo(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-xs text-foreground/65 transition-colors hover:border-brand/40",
            arrastrando ? "border-brand bg-brand/8 text-foreground" : "border-foreground/20",
          )}
        >
          <Upload className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{leyendo ? "Leyendo el archivo…" : analizando ? "Analizando los contactos…" : arrastrando ? "Suelta el archivo aquí" : (archivo ?? "Arrastra un archivo aquí o haz clic para elegirlo (Excel .xlsx, .csv o .txt)")}</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => void leerArchivo(e.target.files?.[0])}
          />
        </label>
        <Textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setArchivo(null);
          }}
          rows={4}
          placeholder={"o pega aquí, uno por línea o en columnas (correo, teléfono):\npersona@correo.com\n+56912345678"}
          className="bg-field/60"
        />

        {texto.trim() !== "" && (
          <div
            className={
              "rounded-lg border p-3 text-xs leading-5 " +
              (hayContactos ? "border-foreground/10 bg-foreground/4" : "border-danger/30 bg-danger/8")
            }
          >
            {hayContactos ? (
              <>
                <p className="font-semibold text-foreground">
                  {carga.miembros.length.toLocaleString("es-CL")} contactos válidos
                  {enLotes(carga.miembros).length > 1 ? ` · se enviarán en ${enLotes(carga.miembros).length} lotes` : ""}
                </p>
                <p className="text-foreground/60">
                  {carga.conEmail.toLocaleString("es-CL")} con correo · {carga.conTelefono.toLocaleString("es-CL")} con teléfono
                  {carga.invalidas > 0 ? ` · ${carga.invalidas.toLocaleString("es-CL")} sin un dato válido (se omiten)` : ""}
                  {carga.duplicadas > 0 ? ` · ${carga.duplicadas.toLocaleString("es-CL")} repetidos (se omiten)` : ""}
                </p>
                <p className="mt-1 text-foreground/45">Ejemplos: {carga.ejemplos.join("   |   ")}</p>
              </>
            ) : (
              <p className="text-danger">
                No se encontró ningún correo ni teléfono válido. Revisa el archivo: debe traer una columna de correo o de
                teléfono (en Chile, 9 dígitos; de otros países, con «+» y código).
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <div>
            <label className="font-micro block text-[0.58rem] text-foreground/45">
              CONSENTIMIENTO · PUBLICIDAD PERSONALIZADA
            </label>
            <Select value={consentAds} onValueChange={setConsentAds}>
              <SelectTrigger className="mt-1 w-52 bg-field/60">
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
            <label className="font-micro block text-[0.58rem] text-foreground/45">
              CONSENTIMIENTO · USO DE DATOS
            </label>
            <Select value={consentUser} onValueChange={setConsentUser}>
              <SelectTrigger className="mt-1 w-52 bg-field/60">
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

        <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-foreground/70">
          <input
            type="checkbox"
            checked={autorizacion}
            onChange={(e) => setAutorizacion(e.target.checked)}
            className="mt-1"
          />
          <span>
            Confirmo que cuento con la autorización de estas personas para usar sus datos en publicidad. Declarar el
            consentimiento real es responsabilidad de quien sube la lista: esta pantalla no puede verificarlo.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setConfirmando(true)} disabled={!puedeSubir}>
            {enviando ? <OrbeDeBoton /> : null}
            Subir a Google Ads
          </Button>
          <Button variant="outline" onClick={() => void descargarParaMeta()} disabled={!hayContactos || enviando}>
            <Download /> Archivo para Meta
          </Button>
          {progreso && (
            <span className="text-xs text-foreground/55">
              Lote {progreso.hechos} de {progreso.total}…
            </span>
          )}
        </div>
        <div className="rounded-lg border border-foreground/10 bg-foreground/4 p-3 text-xs leading-5 text-foreground/65">
          <p className="font-semibold text-foreground/80">Cómo crear el público personalizado y el lookalike en Meta</p>
          <p className="mt-0.5">
            Meta no permite crear audiencias desde acá. El archivo para Meta ya va con los datos hasheados (SHA-256), con columnas
            <code className="mx-1">email</code>y<code className="mx-1">phone</code>.
          </p>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5">
            <li>Descarga el «Archivo para Meta».</li>
            <li>En el Administrador de anuncios: Audiencias → Crear audiencia → Público personalizado → Lista de clientes.</li>
            <li>Sube el archivo y, al mapear columnas, indica que los datos ya vienen hasheados con SHA-256.</li>
            <li>Con el público listo: Crear audiencia → Público similar. Elige el país y el tamaño: de 1 % (el más parecido) a 10 % (el más amplio).</li>
          </ol>
        </div>
        {ultimosIds.length > 0 && (
          <p className="text-[0.68rem] text-foreground/50">
            Ids de subida (úsalos en «Estado de una subida»): {ultimosIds.map((i) => <code key={i} className="mr-1">{i}</code>)}
          </p>
        )}
      </div>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Subir {carga.miembros.length.toLocaleString("es-CL")} contactos a Google Ads?</AlertDialogTitle>
            <AlertDialogDescription>
              Se envían a la lista {listaId.trim()} de {cuenta.accountName} a través de Windsor, que los normaliza y los
              hashea (SHA-256) antes de entregarlos a Google. Desde acá no se pueden recuperar ni borrar. Los contactos no
              quedan guardados en WiWO.ADS ni en su bitácora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void subir()}>Subir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      <h3 className="text-sm font-bold text-foreground">Ver estado de una subida</h3>
      <div className="mt-3 flex items-end gap-3">
        <Input
          value={requestId}
          onChange={(e) => setRequestId(e.target.value)}
          placeholder="Id de la subida"
          className="min-w-0 flex-1 bg-field/60"
        />
        <Button onClick={() => void consultar()} disabled={enviando}>
          {enviando ? <OrbeDeBoton /> : null}
          Consultar
        </Button>
      </div>
      {estado && (
        <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-[#1c1d1b] p-3 text-[0.7rem] text-foreground/70">
          {JSON.stringify(estado, null, 2)}
        </pre>
      )}
      <p className="mt-2 text-[0.65rem] leading-5 text-foreground/35">
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
  gruposDeAnuncios,
}: {
  cuenta: CuentaGoogle;
  listas: ListaConocida[];
  gruposDeAnuncios: Array<{ id: string; nombre: string; campana: string }>;
}) {
  const [enviando, setEnviando] = useState(false);
  const [listaId, setListaId] = useState("");
  const [adGroupId, setAdGroupId] = useState("");
  // Manual solo si no hay grupos ya leídos para esta cuenta, o si la persona
  // lo pide a propósito — pegar el id a mano sigue funcionando siempre.
  const [manual, setManual] = useState(gruposDeAnuncios.length === 0);
  const [cuentaDeManual, setCuentaDeManual] = useState(cuenta.accountId);
  if (cuentaDeManual !== cuenta.accountId) {
    setCuentaDeManual(cuenta.accountId);
    setManual(gruposDeAnuncios.length === 0);
  }
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
      <h3 className="text-sm font-bold text-foreground">
        Adjuntar a un grupo de anuncios
      </h3>
      <div className="mt-3 space-y-2">
        <Input
          value={listaId}
          onChange={(e) => setListaId(e.target.value)}
          placeholder="Id de la lista"
          className="bg-field/60"
        />
        {listas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {listas.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setListaId(l.id)}
                className="rounded-full border border-foreground/10 bg-field/50 px-2 py-0.5 text-[0.65rem] text-foreground/60 hover:text-foreground/85"
              >
                {l.nombre}
              </button>
            ))}
          </div>
        )}
        {manual ? (
          <Input
            value={adGroupId}
            onChange={(e) => setAdGroupId(e.target.value)}
            placeholder="Id del grupo de anuncios (Publicaciones o Google Ads)"
            className="bg-field/60"
          />
        ) : (
          <Select value={adGroupId} onValueChange={setAdGroupId}>
            <SelectTrigger className="w-full bg-field/60">
              <SelectValue placeholder="Elige un grupo de anuncios…" />
            </SelectTrigger>
            <SelectContent>
              {gruposDeAnuncios.map((grupo) => (
                <SelectItem key={grupo.id} value={grupo.id}>
                  {grupo.campana} · {grupo.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {gruposDeAnuncios.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setManual((actual) => !actual);
              setAdGroupId("");
            }}
            className="text-[0.68rem] font-semibold text-foreground/45 underline-offset-2 hover:text-foreground hover:underline"
          >
            {manual ? "Elegir de la lista en vez de pegar el id" : "Pegar el id a mano"}
          </button>
        )}
        <label className="flex items-center gap-2 text-xs text-foreground/70">
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
          {enviando ? <OrbeDeBoton /> : null}
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
      <h3 className="text-sm font-bold text-foreground">Renombrar o eliminar</h3>
      <div className="mt-3 space-y-2">
        <Input
          value={listaId}
          onChange={(e) => setListaId(e.target.value)}
          placeholder="Id de la lista"
          className="bg-field/60"
        />
        {listas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {listas.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setListaId(l.id)}
                className="rounded-full border border-foreground/10 bg-field/50 px-2 py-0.5 text-[0.65rem] text-foreground/60 hover:text-foreground/85"
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
            className="min-w-0 flex-1 bg-field/60"
          />
          <Button onClick={() => void renombrar()} disabled={enviando}>
            {enviando ? <OrbeDeBoton /> : null}
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
        <p className="text-[0.65rem] leading-5 text-foreground/35">
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
