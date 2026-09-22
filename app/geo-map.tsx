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

import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
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
  modo: "paises" | "radio" | "excluir";
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
 * Buscador + lista de elegidos, para países — como "Lugares" en Meta Ads
 * Manager: nunca se muestran los 219 países de un saque (eran ilegibles y
 * no dejaban ver qué ya estaba marcado), solo aparece una lista corta al
 * escribir, y lo que se toca pasa a una lista de chips abajo, con su propia
 * cruz para sacarlo. Compartido entre "Por país" y "Excluir" (una instancia
 * de cada uno, con su propia búsqueda) porque las dos son exactamente este
 * mismo patrón, solo con destino distinto.
 */
function SelectorDePaises({
  seleccionados,
  onToggle,
  colorActivo,
  placeholder,
}: {
  seleccionados: string[];
  onToggle: (iso2: string) => void;
  colorActivo: "brand" | "danger";
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
  const elegidos = PAISES_SEGMENTABLES.filter((pais) =>
    seleccionados.includes(pais.iso2),
  );

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

      {elegidos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {elegidos.map((pais) => (
            <span
              key={pais.iso2}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium",
                colorActivo === "danger"
                  ? "border-red-500/40 bg-red-500/15 text-red-400"
                  : "border-brand/40 bg-brand/15 text-brand",
              )}
            >
              {pais.label}
              <button
                type="button"
                onClick={() => onToggle(pais.iso2)}
                aria-label={`Quitar ${pais.label}`}
                className="rounded-full opacity-70 transition-opacity hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
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
 * Las dos capas conviven: se puede tener países marcados y un círculo a la
 * vez (por ejemplo, todo Chile más un radio puntual en Lima). La pestaña
 * activa solo decide a cuál capa responde el clic del mapa.
 */
export function SegmentacionGeografica({
  targetCountries,
  onTargetCountriesChange,
  geoRadius,
  onGeoRadiusChange,
  excludedCountries,
  onExcludedCountriesChange,
}: {
  targetCountries: string[];
  onTargetCountriesChange: (value: string[]) => void;
  geoRadius: GeoRadio | null;
  onGeoRadiusChange: (value: GeoRadio | null) => void;
  excludedCountries: string[];
  onExcludedCountriesChange: (value: string[]) => void;
}) {
  const [modo, setModo] = useState<"paises" | "radio" | "excluir">(
    geoRadius ? "radio" : "paises",
  );

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
            colorActivo="brand"
            placeholder="Buscar país…"
          />
          <p className="flex items-start gap-1.5 text-[0.65rem] leading-5 text-foreground/35">
            Solo aparecen los países con id de destino geográfico de Google ya
            verificado — ciudad y región todavía no, porque esas exigen
            buscar un id que ninguna de las dos plataformas expone hoy desde
            acá.
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
            colorActivo="danger"
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
