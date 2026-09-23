"use client";

import { useEffect, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Circle,
  GeoJSON,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Layer, Path, StyleFunction } from "leaflet";

import { Ban, Building2, CircleDot, Flag, MapPin, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { LugarSegmentable } from "@/lib/constructor";
import { cn } from "@/lib/utils";
import {
  PAISES_SEGMENTABLES,
  RADIO_MAXIMO_KM,
  RADIO_MINIMO_KM,
  RADIO_POR_DEFECTO_KM,
  WORLD_COUNTRIES_GEOJSON_URL,
  paisSegmentablePorIso2,
} from "@/lib/geo";

export type GeoRadio = { lat: number; lng: number; radiusKm: number };

// El paquete de íconos de Leaflet se sirve desde el CDN oficial en vez de
// importarlo del paquete: el import directo de esos .png rompe según el
// empaquetador (webpack los envuelve en un objeto, Vite los deja como
// string) y esta versión del CDN queda fija a la misma versión instalada.
const ICONO_PIN = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const ISO3_A_ISO2 = new Map(
  PAISES_SEGMENTABLES.map((p) => [p.iso3, p.iso2]),
);

type FeatureGeoJSON = {
  type: "FeatureCollection";
  features: Array<{ id?: string; type: "Feature"; [key: string]: unknown }>;
};

function CapturaClicks({
  onClick,
}: {
  onClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * Sin esto, un círculo de 10 km sobre el zoom inicial (todo el continente)
 * mide menos de un píxel y solo se ve el pin: parece que no pasó nada. Al
 * cambiar el centro o el radio, el mapa se ajusta para que el círculo entero
 * quede a la vista.
 */
function AjustarACirculo({ radio }: { radio: GeoRadio }) {
  const map = useMap();
  useEffect(() => {
    // `L.circle().getBounds()` exige que el círculo ya esté en un mapa;
    // `toBounds` calcula el mismo cuadro a partir de solo el centro.
    const limites = L.latLng(radio.lat, radio.lng).toBounds(
      radio.radiusKm * 2000,
    );
    map.fitBounds(limites, { maxZoom: 10, padding: [30, 30] });
  }, [map, radio.lat, radio.lng, radio.radiusKm]);
  return null;
}

/**
 * Mapa interactivo para segmentación geográfica — tres capas independientes,
 * las tres reales (nada de ids inventados):
 *
 * - País: pinta las fronteras reales (GeoJSON público, ver `lib/geo.ts`) de
 *   los países con id de destino geográfico de Google ya verificado. Un país
 *   fuera de esa lista se ve apagado y no responde al clic — ofrecerlo
 *   igual lo dejaría marcado en el mapa pero sin poder segmentarlo de
 *   verdad en Google.
 * - Radio: un clic deja un círculo de lat/lng/radio tal cual — Meta
 *   (`geo_locations.custom_locations`) y Google
 *   (`set_campaign_geo_targeting.proximities`) aceptan coordenadas crudas
 *   sin necesidad de buscar ningún id, a diferencia de región o ciudad.
 * - Excluir: el mismo país, pero marcado para dejarlo fuera a propósito —
 *   Google con `negative: true` en la ubicación, Meta con
 *   `excluded_geo_locations` (campo hermano de `geo_locations`, misma
 *   forma). Sirve para no entrar a un mercado que ya cubre otro equipo, o
 *   para dejar a mano una zona de control con la que comparar más tarde.
 */
function GeoMap({
  modo,
  paisesSeleccionados,
  onTogglePais,
  paisesExcluidos,
  onToggleExcluido,
  radio,
  onRadioChange,
}: {
  modo: "paises" | "lugares" | "radio" | "excluir";
  paisesSeleccionados: string[];
  onTogglePais: (iso2: string) => void;
  paisesExcluidos: string[];
  onToggleExcluido: (iso2: string) => void;
  radio: GeoRadio | null;
  onRadioChange: (valor: GeoRadio) => void;
}) {
  const [fronteras, setFronteras] = useState<FeatureGeoJSON | null>(null);

  useEffect(() => {
    if (fronteras) return;
    let cancelado = false;
    fetch(WORLD_COUNTRIES_GEOJSON_URL)
      .then((r) => r.json())
      .then((data: FeatureGeoJSON) => {
        if (!cancelado) setFronteras(data);
      })
      .catch(() => {
        // Sin fronteras no hay mapa de países, pero el modo radio sigue
        // funcionando igual — no bloquea el resto del selector.
      });
    return () => {
      cancelado = true;
    };
  }, [fronteras]);

  const estiloPais: StyleFunction = (feature) => {
    const iso3 = feature?.id as string | undefined;
    const iso2 = iso3 ? ISO3_A_ISO2.get(iso3) : undefined;
    const segmentable = Boolean(iso2);
    const seleccionado = iso2 ? paisesSeleccionados.includes(iso2) : false;
    const excluido = iso2 ? paisesExcluidos.includes(iso2) : false;
    const colorActivo = excluido ? "#ef4444" : "#4242FF";
    return {
      weight: seleccionado || excluido ? 1.5 : segmentable ? 1 : 0.4,
      color: excluido ? "#ef4444" : segmentable ? "#4242FF" : "#F8FAD7",
      fillColor: seleccionado || excluido ? colorActivo : "#F8FAD7",
      fillOpacity: seleccionado || excluido ? 0.45 : segmentable ? 0.07 : 0.02,
      dashArray: segmentable && !seleccionado && !excluido ? "4 3" : undefined,
      // Solo la capa de la pestaña activa responde al clic — en las otras
      // dos, un país interactivo se roba el clic antes de que llegue al mapa
      // (Leaflet corta la propagación en capas vectoriales interactivas), lo
      // que rompía el modo radio si quedaba prendido a la vez.
      interactive: modo === "paises" || modo === "excluir",
    };
  };

  return (
    <div className="overflow-hidden rounded-xl border border-foreground/10">
      <MapContainer
        center={[-15, -68]}
        zoom={3}
        minZoom={2}
        scrollWheelZoom
        style={{ height: 320, width: "100%", background: "#20211f" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {fronteras && (
          <GeoJSON
            // Fuerza a Leaflet a recalcular el estilo de cada país cuando
            // cambia la selección — `<GeoJSON>` no vuelve a llamar a
            // `style`/`onEachFeature` solo porque cambien las props.
            key={`${modo}:${paisesSeleccionados.join(",")}:${paisesExcluidos.join(",")}`}
            data={fronteras as unknown as GeoJSON.FeatureCollection}
            style={estiloPais}
            onEachFeature={(feature, layer: Layer) => {
              const iso3 = feature.id as string | undefined;
              const iso2 = iso3 ? ISO3_A_ISO2.get(iso3) : undefined;
              const pais = iso2 ? paisSegmentablePorIso2(iso2) : null;
              if (!pais || (modo !== "paises" && modo !== "excluir")) return;
              layer.bindTooltip(pais.label, { sticky: true });
              layer.on("click", () =>
                modo === "excluir"
                  ? onToggleExcluido(pais.iso2)
                  : onTogglePais(pais.iso2),
              );
              layer.on("mouseover", () =>
                (layer as Path).setStyle({ fillOpacity: 0.3 }),
              );
              layer.on("mouseout", () => {
                const activo =
                  modo === "excluir"
                    ? paisesExcluidos.includes(pais.iso2)
                    : paisesSeleccionados.includes(pais.iso2);
                (layer as Path).setStyle({
                  fillOpacity: activo ? 0.45 : 0.07,
                });
              });
            }}
          />
        )}
        {modo === "radio" && (
          <CapturaClicks
            onClick={(lat, lng) =>
              onRadioChange({
                lat,
                lng,
                radiusKm: radio?.radiusKm ?? RADIO_POR_DEFECTO_KM,
              })
            }
          />
        )}
        {radio && (
          <>
            <AjustarACirculo radio={radio} />
            <Marker position={[radio.lat, radio.lng]} icon={ICONO_PIN} />
            <Circle
              center={[radio.lat, radio.lng]}
              radius={radio.radiusKm * 1000}
              pathOptions={{
                color: "#4242FF",
                fillColor: "#4242FF",
                fillOpacity: 0.15,
              }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}

/**
 * Solo el buscador y sus resultados — como "Lugares" en Meta Ads Manager:
 * nunca se muestran los 219 países de un saque, solo una lista corta al
 * escribir. Lo ya elegido NO se repite acá: vive en un único resumen
 * siempre visible (`ResumenDeSegmentacion`, más abajo), no uno por pestaña
 * — antes cada pestaña tenía su propia lista de chips, así que un radio
 * marcado en "Por radio" desaparecía de la vista al pasar a "Por país",
 * aunque siguiera activo (se veía en el mapa, pero en ningún listado).
 * Compartido entre "Por país" y "Excluir", cada uno con su propia búsqueda.
 */
function SelectorDePaises({
  seleccionados,
  onToggle,
  placeholder,
}: {
  seleccionados: string[];
  onToggle: (iso2: string) => void;
  placeholder: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const texto = busqueda.trim().toLowerCase();
  const resultados = texto
    ? PAISES_SEGMENTABLES.filter(
        (pais) =>
          !seleccionados.includes(pais.iso2) &&
          pais.label.toLowerCase().includes(texto),
      ).slice(0, 8)
    : [];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-foreground/35" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={placeholder}
          className="h-8 border-foreground/10 bg-field/50 pl-8 text-xs"
        />
      </div>

      {texto && (
        <div className="scrollbar-thin max-h-52 overflow-y-auto rounded-lg border border-foreground/10 bg-field/40">
          {resultados.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-foreground/40">
              Ningún país coincide con la búsqueda.
            </p>
          ) : (
            resultados.map((pais) => (
              <button
                key={pais.iso2}
                type="button"
                onClick={() => {
                  onToggle(pais.iso2);
                  setBusqueda("");
                }}
                className="block w-full px-3 py-2 text-left text-xs text-foreground/75 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                {pais.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Buscador de región/estado/provincia o ciudad/comuna reales, contra
 * `/api/geo-targets` (tabla `geo_targets`, sembrada desde la misma fuente
 * oficial que los 219 países). A diferencia de `SelectorDePaises`, la lista
 * no cabe en memoria del cliente — son decenas de miles de filas — así que
 * cada letra pide al servidor, con una pausa corta para no disparar una
 * consulta por tecla.
 */
function SelectorDeLugares({
  tier,
  seleccionados,
  onAgregar,
  placeholder,
}: {
  tier: "region" | "city";
  seleccionados: LugarSegmentable[];
  onAgregar: (lugar: LugarSegmentable) => void;
  placeholder: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<
    Array<{ id: string; nombre: string; nombreCanonico: string; countryCode: string }>
  >([]);
  const [buscando, setBuscando] = useState(false);
  const [ubicando, setUbicando] = useState<string | null>(null);
  const idsElegidos = new Set(seleccionados.map((l) => l.id));

  async function elegir(lugar: {
    id: string;
    nombre: string;
    nombreCanonico: string;
    countryCode: string;
  }) {
    setUbicando(lugar.id);
    // Meta no tiene su propio id de región/ciudad vía Windsor: sin esto, el
    // lugar solo segmentaría la campaña de Google. Se busca por el nombre
    // canónico (el oficial, sin alias en español) para que Nominatim
    // encuentre el lugar real y no un homónimo.
    let coordenadas: { lat: number; lng: number; radiusKm: number; aproximado: boolean } | null =
      null;
    try {
      const params = new URLSearchParams({
        nombre: lugar.nombreCanonico,
        countryCode: lugar.countryCode,
      });
      const response = await fetch(`/api/geo-targets/geocode?${params}`);
      const body = (await response.json()) as { coordenadas?: typeof coordenadas };
      coordenadas = body.coordenadas ?? null;
    } catch {
      // Sigue sin coordenadas: el lugar igual segmenta a Google, y el
      // Constructor avisa aparte que a Meta no le llegó.
    } finally {
      setUbicando(null);
    }
    onAgregar({
      id: lugar.id,
      nombre: lugar.nombre,
      countryCode: lugar.countryCode,
      tier,
      ...(coordenadas ?? {}),
    });
    setBusqueda("");
  }

  useEffect(() => {
    const texto = busqueda.trim();
    if (texto.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpia los resultados de la búsqueda anterior al borrar el texto
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    let cancelado = false;
    const espera = setTimeout(() => {
      const params = new URLSearchParams({ tier, q: texto });
      fetch(`/api/geo-targets?${params}`)
        .then((r) => r.json())
        .then((body: { resultados?: typeof resultados }) => {
          if (!cancelado) setResultados(body.resultados ?? []);
        })
        .catch(() => {
          if (!cancelado) setResultados([]);
        })
        .finally(() => {
          if (!cancelado) setBuscando(false);
        });
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [busqueda, tier]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-foreground/35" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={placeholder}
          className="h-8 border-foreground/10 bg-field/50 pl-8 text-xs"
        />
      </div>

      {busqueda.trim().length >= 2 && (
        <div className="scrollbar-thin max-h-52 overflow-y-auto rounded-lg border border-foreground/10 bg-field/40">
          {buscando ? (
            <p className="px-3 py-2.5 text-xs text-foreground/40">Buscando…</p>
          ) : resultados.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-foreground/40">
              Nada coincide con la búsqueda.
            </p>
          ) : (
            resultados
              .filter((lugar) => !idsElegidos.has(lugar.id))
              .map((lugar) => (
                <button
                  key={lugar.id}
                  type="button"
                  disabled={ubicando === lugar.id}
                  onClick={() => void elegir(lugar)}
                  className="block w-full px-3 py-2 text-left text-xs transition-colors hover:bg-foreground/[0.06] disabled:opacity-50"
                >
                  <span className="block text-foreground/80">{lugar.nombre}</span>
                  <span className="block text-[0.65rem] text-foreground/40">
                    {ubicando === lugar.id ? "Ubicando para Meta…" : lugar.nombreCanonico}
                  </span>
                </button>
              ))
          )}
        </div>
      )}
    </div>
  );
}

/** Un chip removible del resumen — mismo look en las tres capas, solo cambia el color. */
/** Un tipo de segmentación por chip — color e ícono distintos para que se
 * note de un vistazo si algo es un país entero, una región, una ciudad
 * puntual o un radio, sin tener que leer la etiqueta. */
type TipoDeChip = "pais" | "region" | "ciudad" | "radio" | "excluir";

const ESTILO_POR_TIPO: Record<
  TipoDeChip,
  { icono: typeof Flag; clase: string }
> = {
  pais: { icono: Flag, clase: "border-brand/40 bg-brand/15 text-brand" },
  region: { icono: MapPin, clase: "border-sky-500/40 bg-sky-500/15 text-sky-400" },
  ciudad: { icono: Building2, clase: "border-violet-500/40 bg-violet-500/15 text-violet-400" },
  radio: { icono: CircleDot, clase: "border-amber-500/40 bg-amber-500/15 text-amber-400" },
  excluir: { icono: Ban, clase: "border-red-500/40 bg-red-500/15 text-red-400" },
};

function ChipDeSegmentacion({
  label,
  tipo,
  onQuitar,
}: {
  label: string;
  tipo: TipoDeChip;
  onQuitar: () => void;
}) {
  const { icono: Icono, clase } = ESTILO_POR_TIPO[tipo];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium",
        clase,
      )}
    >
      <Icono className="size-3" />
      {label}
      <button
        type="button"
        onClick={onQuitar}
        aria-label={`Quitar ${label}`}
        className="rounded-full opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/**
 * Todo lo que hoy segmenta esta campaña, en un solo lugar — países
 * incluidos, excluidos y el círculo por radio juntos, sin importar qué
 * pestaña está abierta. Antes cada capa solo se veía dentro de su propia
 * pestaña: marcar un radio y después pasar a "Por país" lo dejaba activo
 * (se seguía viendo en el mapa) pero invisible en cualquier lista, como si
 * se hubiera perdido.
 */
function ResumenDeSegmentacion({
  targetCountries,
  onQuitarPais,
  targetPlaces,
  onQuitarLugar,
  excludedCountries,
  onQuitarExcluido,
  geoRadius,
  onQuitarRadio,
}: {
  targetCountries: string[];
  onQuitarPais: (iso2: string) => void;
  targetPlaces: LugarSegmentable[];
  onQuitarLugar: (id: string) => void;
  excludedCountries: string[];
  onQuitarExcluido: (iso2: string) => void;
  geoRadius: GeoRadio | null;
  onQuitarRadio: () => void;
}) {
  const incluidos = PAISES_SEGMENTABLES.filter((pais) =>
    targetCountries.includes(pais.iso2),
  );
  const excluidos = PAISES_SEGMENTABLES.filter((pais) =>
    excludedCountries.includes(pais.iso2),
  );
  if (
    incluidos.length === 0 &&
    excluidos.length === 0 &&
    targetPlaces.length === 0 &&
    !geoRadius
  )
    return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {incluidos.map((pais) => (
        <ChipDeSegmentacion
          key={pais.iso2}
          label={pais.label}
          tipo="pais"
          onQuitar={() => onQuitarPais(pais.iso2)}
        />
      ))}
      {targetPlaces.map((lugar) => (
        <ChipDeSegmentacion
          key={lugar.id}
          label={`${lugar.nombre} · ${lugar.tier === "region" ? "Región" : "Ciudad"}${
            lugar.radiusKm === undefined ? " · solo Google" : lugar.aproximado ? " · aprox. en Meta" : ""
          }`}
          tipo={lugar.tier === "region" ? "region" : "ciudad"}
          onQuitar={() => onQuitarLugar(lugar.id)}
        />
      ))}
      {geoRadius && (
        <ChipDeSegmentacion
          label={`(${geoRadius.lat.toFixed(4)}, ${geoRadius.lng.toFixed(4)}) + ${geoRadius.radiusKm} km`}
          tipo="radio"
          onQuitar={onQuitarRadio}
        />
      )}
      {excluidos.map((pais) => (
        <ChipDeSegmentacion
          key={pais.iso2}
          label={`Excluye ${pais.label}`}
          tipo="excluir"
          onQuitar={() => onQuitarExcluido(pais.iso2)}
        />
      ))}
    </div>
  );
}

/**
 * Segmentación geográfica del conjunto de anuncios — global para las dos
 * plataformas a la vez, no una configuración aparte por cada una: el mismo
 * país o círculo elegido acá se traduce a `geo_locations.countries` /
 * `custom_locations` en Meta y a `set_campaign_geo_targeting` en Google
 * (`lib/constructor.ts`, función `buildPlan`).
 *
 * Las capas conviven: se puede tener países marcados, regiones o ciudades
 * elegidas y un círculo a la vez (por ejemplo, todo Chile más un radio
 * puntual en Lima). La pestaña activa solo decide a cuál capa responde el
 * clic del mapa o la búsqueda.
 */
export function SegmentacionGeografica({
  targetCountries,
  onTargetCountriesChange,
  targetPlaces,
  onTargetPlacesChange,
  geoRadius,
  onGeoRadiusChange,
  excludedCountries,
  onExcludedCountriesChange,
}: {
  targetCountries: string[];
  onTargetCountriesChange: (value: string[]) => void;
  targetPlaces: LugarSegmentable[];
  onTargetPlacesChange: (value: LugarSegmentable[]) => void;
  geoRadius: GeoRadio | null;
  onGeoRadiusChange: (value: GeoRadio | null) => void;
  excludedCountries: string[];
  onExcludedCountriesChange: (value: string[]) => void;
}) {
  const [modo, setModo] = useState<"paises" | "lugares" | "radio" | "excluir">(
    targetPlaces.length > 0 ? "lugares" : geoRadius ? "radio" : "paises",
  );
  const [nivelLugar, setNivelLugar] = useState<"region" | "city">("city");

  function agregarLugar(lugar: LugarSegmentable) {
    if (targetPlaces.some((l) => l.id === lugar.id)) return;
    onTargetPlacesChange([...targetPlaces, lugar]);
  }

  function quitarLugar(id: string) {
    onTargetPlacesChange(targetPlaces.filter((l) => l.id !== id));
  }

  function alternarPais(iso2: string) {
    onTargetCountriesChange(
      targetCountries.includes(iso2)
        ? targetCountries.filter((code) => code !== iso2)
        : [...targetCountries, iso2],
    );
  }

  function alternarExcluido(iso2: string) {
    onExcludedCountriesChange(
      excludedCountries.includes(iso2)
        ? excludedCountries.filter((code) => code !== iso2)
        : [...excludedCountries, iso2],
    );
  }

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-full border border-foreground/10 bg-field/60 p-1">
        {(
          [
            { id: "paises" as const, label: "Por país" },
            { id: "lugares" as const, label: "Región / Ciudad" },
            { id: "radio" as const, label: "Por radio" },
            { id: "excluir" as const, label: "Excluir" },
          ]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setModo(tab.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              modo === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground/50 hover:text-foreground/80",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ResumenDeSegmentacion
        targetCountries={targetCountries}
        onQuitarPais={alternarPais}
        targetPlaces={targetPlaces}
        onQuitarLugar={quitarLugar}
        excludedCountries={excludedCountries}
        onQuitarExcluido={alternarExcluido}
        geoRadius={geoRadius}
        onQuitarRadio={() => onGeoRadiusChange(null)}
      />

      <GeoMap
        modo={modo}
        paisesSeleccionados={targetCountries}
        onTogglePais={alternarPais}
        paisesExcluidos={excludedCountries}
        onToggleExcluido={alternarExcluido}
        radio={geoRadius}
        onRadioChange={onGeoRadiusChange}
      />

      {modo === "paises" && (
        <>
          <p className="font-micro text-[0.58rem] text-foreground/45">
            BUSCA UN PAÍS O TÓCALO EN EL MAPA · VACÍO USA LOS PAÍSES YA
            DECLARADOS EN LA CUENTA
          </p>
          <SelectorDePaises
            seleccionados={targetCountries}
            onToggle={alternarPais}
            placeholder="Buscar país…"
          />
          <p className="flex items-start gap-1.5 text-[0.65rem] leading-5 text-foreground/35">
            Solo aparecen los países con id de destino geográfico de Google ya
            verificado. Para segmentar por región o ciudad, usa la pestaña
            &quot;Región / Ciudad&quot;.
          </p>
        </>
      )}

      {modo === "lugares" && (
        <>
          <div className="inline-flex rounded-full border border-foreground/10 bg-field/40 p-0.5">
            {(
              [
                { id: "city" as const, label: "Ciudad / Comuna" },
                { id: "region" as const, label: "Región / Estado" },
              ]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setNivelLugar(item.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.68rem] font-semibold transition-colors",
                  nivelLugar === item.id
                    ? "bg-foreground/12 text-foreground"
                    : "text-foreground/45 hover:text-foreground/75",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <SelectorDeLugares
            tier={nivelLugar}
            seleccionados={targetPlaces}
            onAgregar={agregarLugar}
            placeholder={
              nivelLugar === "city"
                ? "Buscar ciudad o comuna…"
                : "Buscar región, estado o provincia…"
            }
          />
          <p className="flex items-start gap-1.5 text-[0.65rem] leading-5 text-foreground/35">
            Google usa el id real del lugar. Meta no tiene ese id —es un
            sistema de ids aparte, y Windsor no expone una forma de
            buscarlo—, así que para Meta se ubica el lugar en el mapa y se
            segmenta con un círculo a su alrededor (máx. 80 km; para una
            región más grande que eso, el círculo cubre el centro, no el
            área completa). Si no se lo pudo ubicar, queda marcado como
            &quot;solo Google&quot; en el chip de arriba.
          </p>
        </>
      )}

      {modo === "excluir" && (
        <>
          <p className="font-micro text-[0.58rem] text-foreground/45">
            ESTOS PAÍSES QUEDAN FUERA A PROPÓSITO, AUNQUE ESTÉN EN LA CUENTA O
            EN &quot;POR PAÍS&quot;
          </p>
          <SelectorDePaises
            seleccionados={excludedCountries}
            onToggle={alternarExcluido}
            placeholder="Buscar país para excluir…"
          />
          <p className="text-[0.65rem] leading-5 text-foreground/35">
            Útil para dejar a mano una zona de control (comparar con/sin
            anuncio) o para no entrar a un mercado que ya cubre otro equipo.
            No mide nada por sí solo — la comparación se hace fuera de esta
            pantalla, con el Dashboard C-Level o GA4.
          </p>
        </>
      )}

      {modo === "radio" && (
        <>
          {geoRadius ? (
            // Las coordenadas y el radio ya se ven en el resumen de arriba
            // (activo sin importar la pestaña); acá solo queda el control
            // para ajustar el radio o sacar el círculo.
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-micro text-[0.58rem] text-foreground/45">
                RADIO
              </span>
              <Slider
                min={RADIO_MINIMO_KM}
                max={RADIO_MAXIMO_KM}
                step={1}
                value={[geoRadius.radiusKm]}
                onValueChange={([valor]) =>
                  onGeoRadiusChange({ ...geoRadius, radiusKm: valor })
                }
                className="max-w-[14rem]"
              />
              <span className="text-xs font-semibold text-foreground">
                {geoRadius.radiusKm} km
              </span>
              <button
                type="button"
                onClick={() => onGeoRadiusChange(null)}
                className="text-[0.7rem] font-semibold text-foreground/45 underline-offset-2 hover:text-danger hover:underline"
              >
                Quitar círculo
              </button>
            </div>
          ) : (
            <p className="text-xs text-foreground/45">
              Toca el mapa para marcar el centro del círculo.
            </p>
          )}
          <p className="text-[0.65rem] leading-5 text-foreground/35">
            Máximo {RADIO_MAXIMO_KM} km — el límite real de Meta para este
            tipo de segmentación; Google acepta más, pero se deja el mismo
            tope para que un solo círculo sirva en las dos.
          </p>
        </>
      )}
    </div>
  );
}
