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
  useMapEvents,
} from "react-leaflet";
import type { Layer, Path, StyleFunction } from "leaflet";

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
    <div className="overflow-hidden rounded-xl border border-[#F8FAD7]/10">
      <MapContainer
        center={[-15, -68]}
        zoom={3}
        minZoom={2}
        scrollWheelZoom={false}
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
      <div className="inline-flex rounded-full border border-[#F8FAD7]/10 bg-[#292929]/60 p-1">
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
                ? "bg-[#4242FF] text-white shadow-sm"
                : "text-[#F8FAD7]/50 hover:text-[#F8FAD7]/80",
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
          <p className="font-micro text-[0.58rem] text-[#F8FAD7]/45">
            TOCA UN PAÍS EN EL MAPA O ACÁ ABAJO · VACÍO USA LOS PAÍSES YA
            DECLARADOS EN LA CUENTA
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PAISES_SEGMENTABLES.map((pais) => {
              const activo = targetCountries.includes(pais.iso2);
              return (
                <button
                  key={pais.iso2}
                  type="button"
                  onClick={() => alternarPais(pais.iso2)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[0.7rem] font-medium transition-colors",
                    activo
                      ? "border-[#4242FF]/40 bg-[#4242FF]/15 text-[#4242FF]"
                      : "border-[#F8FAD7]/10 bg-[#292929]/50 text-[#F8FAD7]/60 hover:text-[#F8FAD7]/85",
                  )}
                >
                  {pais.label}
                </button>
              );
            })}
          </div>
          <p className="flex items-start gap-1.5 text-[0.65rem] leading-5 text-[#F8FAD7]/35">
            Solo aparecen los países con id de destino geográfico de Google ya
            verificado — ciudad y región todavía no, porque esas exigen
            buscar un id que ninguna de las dos plataformas expone hoy desde
            acá.
          </p>
        </>
      )}

      {modo === "excluir" && (
        <>
          <p className="font-micro text-[0.58rem] text-[#F8FAD7]/45">
            ESTOS PAÍSES QUEDAN FUERA A PROPÓSITO, AUNQUE ESTÉN EN LA CUENTA O
            EN &quot;POR PAÍS&quot;
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PAISES_SEGMENTABLES.map((pais) => {
              const activo = excludedCountries.includes(pais.iso2);
              return (
                <button
                  key={pais.iso2}
                  type="button"
                  onClick={() => alternarExcluido(pais.iso2)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[0.7rem] font-medium transition-colors",
                    activo
                      ? "border-red-500/40 bg-red-500/15 text-red-400"
                      : "border-[#F8FAD7]/10 bg-[#292929]/50 text-[#F8FAD7]/60 hover:text-[#F8FAD7]/85",
                  )}
                >
                  {pais.label}
                </button>
              );
            })}
          </div>
          <p className="text-[0.65rem] leading-5 text-[#F8FAD7]/35">
            Útil para dejar a mano una zona de control (comparar con/sin
            anuncio) o para no entrar a un mercado que ya cubre otro equipo.
            No mide nada por sí solo — la comparación se hace fuera de esta
            pantalla, con Salud de medición o GA4.
          </p>
        </>
      )}

      {modo === "radio" && (
        <>
          {geoRadius ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-micro text-[0.58rem] text-[#F8FAD7]/45">
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
              <span className="text-xs font-semibold text-[#F8FAD7]">
                {geoRadius.radiusKm} km
              </span>
              <button
                type="button"
                onClick={() => onGeoRadiusChange(null)}
                className="text-[0.7rem] font-semibold text-[#F8FAD7]/45 underline-offset-2 hover:text-danger hover:underline"
              >
                Quitar círculo
              </button>
            </div>
          ) : (
            <p className="text-xs text-[#F8FAD7]/45">
              Toca el mapa para marcar el centro del círculo.
            </p>
          )}
          <p className="text-[0.65rem] leading-5 text-[#F8FAD7]/35">
            Máximo {RADIO_MAXIMO_KM} km — el límite real de Meta para este
            tipo de segmentación; Google acepta más, pero se deja el mismo
            tope para que un solo círculo sirva en las dos.
          </p>
        </>
      )}
    </div>
  );
}
