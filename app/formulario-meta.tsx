"use client";

import { useEffect, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { CampaignDraft } from "@/lib/constructor";
import {
  FORMULARIO_COLOMBIA,
  problemasDelFormulario,
  type CampoDeContacto,
  type DatosDeFormulario,
  type PreguntaDeFiltro,
  type TipoDeFormulario,
} from "@/lib/meta-formularios-pura";
import type { FormularioDeMeta } from "@/lib/meta-formularios";
import { Campo, Seccion } from "./constructor-ui";

/**
 * Formulario instantáneo (lead ad) del anuncio: elegir uno que ya tenga la página o crear uno nuevo con sus preguntas que filtran
 * (el plan de Colombia trae las suyas). Meta no deja borrar un formulario después, así que crear pide simular primero.
 */

const CONTACTOS: Array<[CampoDeContacto, string]> = [
  ["nombre", "Nombre"],
  ["correo", "Correo"],
  ["telefono", "Teléfono"],
  ["ciudad", "Ciudad"],
];

const clave = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

const VACIO: DatosDeFormulario = {
  nombre: "",
  tipo: "mayor_intencion",
  contacto: ["nombre", "correo", "telefono"],
  preguntas: [],
  politicaUrl: "",
  gracias: { titulo: "¡Gracias!", cuerpo: "Un asesor te contactará pronto.", botonTexto: "Ver sitio", botonUrl: "" },
};

type Lectura = { cuenta: string; formularios: FormularioDeMeta[] | null; error: string | null };

export function FormularioInstantaneo({ accountId, draft, onChange }: { accountId: string | null; draft: CampaignDraft; onChange: (c: Partial<CampaignDraft>) => void }) {
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!accountId) return;
    let vivo = true;
    fetch(`/api/meta/formularios?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => null)) as { formularios?: FormularioDeMeta[]; error?: string } | null }))
      .then(({ ok, j }) => vivo && setLectura({ cuenta: accountId, formularios: ok ? (j?.formularios ?? []) : null, error: ok ? null : (j?.error ?? "No se pudieron leer los formularios") }))
      .catch(() => vivo && setLectura({ cuenta: accountId, formularios: null, error: "No se pudieron leer los formularios" }));
    return () => {
      vivo = false;
    };
  }, [accountId, version]);

  const [creando, setCreando] = useState(false);
  const [f, setF] = useState<DatosDeFormulario>(VACIO);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargando = !accountId ? false : lectura?.cuenta !== accountId;
  const formularios = cargando ? null : (lectura?.formularios ?? null);
  const activos = (formularios ?? []).filter((x) => x.estado === "ACTIVE");
  const problemas = problemasDelFormulario(f);

  async function enviar(simular: boolean) {
    if (!accountId) return;
    setTrabajando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/meta/formularios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, formulario: f, simular }) });
      const j = (await r.json().catch(() => null)) as { error?: string; problemas?: string[]; id?: string } | null;
      if (!r.ok) {
        setResultado({ tipo: "error", texto: [j?.error, ...(j?.problemas ?? [])].filter(Boolean).join(" · ") || "No se pudo completar" });
      } else if (simular) {
        setResultado({ tipo: "ok", texto: "Meta lo aceptaría tal cual. Al crearlo, queda en la página y no se puede borrar (solo archivar)." });
      } else if (j?.id) {
        onChange({ metaLeadFormId: j.id });
        setCreando(false);
        setVersion((v) => v + 1);
      }
    } finally {
      setTrabajando(false);
    }
  }

  const poner = (c: Partial<DatosDeFormulario>) => setF((a) => ({ ...a, ...c }));
  const ponerPregunta = (i: number, c: Partial<PreguntaDeFiltro>) => poner({ preguntas: f.preguntas.map((q, j) => (j === i ? { ...q, ...c } : q)) });

  return (
    <Seccion titulo="Formulario instantáneo" completa={draft.metaLeadFormId !== ""}>
      {!accountId ? (
        <p className="text-sm text-foreground/60">Elige primero la cuenta de Meta: el formulario es de su página de Facebook.</p>
      ) : (
        <div className="space-y-4">
          {cargando ? (
            <p className="text-sm text-foreground/55">Leyendo los formularios de la página…</p>
          ) : formularios === null ? (
            <p className="rounded-lg border border-warn/25 bg-warn/8 p-3 text-xs leading-5 text-foreground/70">
              {lectura?.error}. Si dice que falta acceso, el usuario del sistema debe ser administrador de la página de Facebook.
            </p>
          ) : (
            <Campo etiqueta="FORMULARIO DE LA PÁGINA">
              <select
                value={draft.metaLeadFormId}
                onChange={(e) => onChange({ metaLeadFormId: e.target.value })}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value="">{activos.length === 0 ? "La página no tiene formularios activos" : "Elige un formulario…"}</option>
                {activos.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre} · {x.preguntas.length} campos{x.mayorIntencion ? " · mayor intención" : ""}
                    {x.leads !== null ? ` · ${x.leads} leads` : ""}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          <button type="button" onClick={() => setCreando((v) => !v)} className="text-xs font-semibold text-brand hover:underline">
            {creando ? "Cancelar" : "Crear un formulario nuevo en la página"}
          </button>

          {creando && (
            <div className="space-y-4 rounded-xl border border-foreground/10 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="NOMBRE DEL FORMULARIO">
                  <Input value={f.nombre} onChange={(e) => poner({ nombre: e.target.value })} className="bg-field/60" />
                </Campo>
                <Campo etiqueta="TIPO">
                  <RadioGroup value={f.tipo} onValueChange={(v) => poner({ tipo: v as TipoDeFormulario })} className="grid-flow-col justify-start gap-5 pt-2">
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="mayor_intencion" /> Mayor intención</label>
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="mas_volumen" /> Más volumen</label>
                  </RadioGroup>
                </Campo>
              </div>

              <div className="flex flex-wrap gap-4">
                {CONTACTOS.map(([c, texto]) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={f.contacto.includes(c)} onCheckedChange={(v) => poner({ contacto: v === true ? [...f.contacto, c] : f.contacto.filter((x) => x !== c) })} />
                    {texto}
                  </label>
                ))}
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-foreground/70">Preguntas que filtran (hasta 5)</p>
                  <button type="button" onClick={() => poner({ preguntas: FORMULARIO_COLOMBIA.preguntas, contacto: FORMULARIO_COLOMBIA.contacto })} className="text-xs font-semibold text-brand hover:underline">
                    Usar las del plan de Colombia
                  </button>
                </div>
                {f.preguntas.map((q, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-foreground/10 p-3">
                    <div className="flex gap-2">
                      <Input
                        value={q.etiqueta}
                        placeholder="Pregunta"
                        onChange={(e) => ponerPregunta(i, { etiqueta: e.target.value, clave: clave(e.target.value) || `pregunta_${i + 1}` })}
                        className="bg-field/60"
                      />
                      <button type="button" onClick={() => poner({ preguntas: f.preguntas.filter((_, j) => j !== i) })} className="px-2 text-xs text-foreground/45 hover:text-danger">
                        Quitar
                      </button>
                    </div>
                    <Textarea
                      rows={3}
                      value={q.opciones.map((o) => o.texto).join("\n")}
                      placeholder="Una respuesta por línea"
                      onChange={(e) => ponerPregunta(i, { opciones: e.target.value.split("\n").filter((t) => t.trim() !== "").map((t) => ({ texto: t.trim(), clave: clave(t) || "opcion" })) })}
                    />
                    <p className="text-[0.65rem] text-foreground/40">Clave: {q.clave}</p>
                  </div>
                ))}
                {f.preguntas.length < 5 && (
                  <button type="button" onClick={() => poner({ preguntas: [...f.preguntas, { clave: `pregunta_${f.preguntas.length + 1}`, etiqueta: "", opciones: [] }] })} className="text-xs font-semibold text-brand hover:underline">
                    + Agregar pregunta
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="POLÍTICA DE PRIVACIDAD (https://)">
                  <Input value={f.politicaUrl} onChange={(e) => poner({ politicaUrl: e.target.value })} className="bg-field/60" placeholder="https://" />
                </Campo>
                <Campo etiqueta="BOTÓN DE GRACIAS LLEVA A (https://)">
                  <Input value={f.gracias.botonUrl} onChange={(e) => poner({ gracias: { ...f.gracias, botonUrl: e.target.value } })} className="bg-field/60" placeholder="https://" />
                </Campo>
                <Campo etiqueta="TÍTULO DE GRACIAS">
                  <Input value={f.gracias.titulo} onChange={(e) => poner({ gracias: { ...f.gracias, titulo: e.target.value } })} className="bg-field/60" />
                </Campo>
                <Campo etiqueta="TEXTO DEL BOTÓN">
                  <Input value={f.gracias.botonTexto} onChange={(e) => poner({ gracias: { ...f.gracias, botonTexto: e.target.value } })} className="bg-field/60" />
                </Campo>
              </div>
              <Campo etiqueta="TEXTO DE GRACIAS">
                <Textarea rows={2} value={f.gracias.cuerpo} onChange={(e) => poner({ gracias: { ...f.gracias, cuerpo: e.target.value } })} />
              </Campo>

              {problemas.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-foreground/55">
                  {problemas.slice(0, 4).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              {resultado && <p className={resultado.tipo === "ok" ? "text-xs text-ok" : "text-xs text-danger"}>{resultado.texto}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={trabajando || problemas.length > 0} onClick={() => void enviar(true)} className="rounded-full border border-brand/40 px-4 py-2 text-xs font-bold text-brand disabled:opacity-40">
                  Comprobar
                </button>
                <button type="button" disabled={trabajando || problemas.length > 0} onClick={() => void enviar(false)} className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40">
                  Crear en la página
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Seccion>
  );
}

/** Dónde están las personas, cuándo empieza y si Meta puede ampliar el público por su cuenta. */
export function OpcionesDePublicoMeta({ draft, onChange }: { draft: CampaignDraft; onChange: (c: Partial<CampaignDraft>) => void }) {
  return (
    <Seccion titulo="Ubicación de las personas y calendario" completa>
      <div className="space-y-5">
        <Campo etiqueta="QUIÉN CUENTA COMO «EN ESTE LUGAR»">
          <RadioGroup value={draft.metaLocationType || "defecto"} onValueChange={(v) => onChange({ metaLocationType: v === "defecto" ? "" : (v as "home" | "recent") })} className="gap-2">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="defecto" /> Lo que decida Meta (viven aquí y también viajeros)</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="home" /> Personas que viven en este lugar</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="recent" /> Personas que estuvieron recientemente aquí</label>
          </RadioGroup>
        </Campo>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={draft.metaAdvantageAudience} onCheckedChange={(v) => onChange({ metaAdvantageAudience: v === true })} className="mt-0.5" />
          <span>
            Permitir Advantage+ público
            <span className="block text-xs text-foreground/50">Apagado (recomendado): Meta no amplía el público ni la segmentación detallada por su cuenta.</span>
          </span>
        </label>
        <Campo etiqueta="EMPIEZA A ENTREGAR EL (opcional)">
          <Input type="date" value={draft.metaStartDate} onChange={(e) => onChange({ metaStartDate: e.target.value })} className="bg-field/60 sm:w-56" />
          <p className="mt-1 text-xs text-foreground/50">Vacío = al publicar. Sirve para dejar un retargeting programado, por ejemplo desde la semana 5.</p>
        </Campo>
      </div>
    </Seccion>
  );
}
