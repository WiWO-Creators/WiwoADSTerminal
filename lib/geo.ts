import {
  GOOGLE_GEO_TARGET_IDS,
  RADIO_MAXIMO_KM,
  RADIO_MINIMO_KM,
} from "./constructor";

export { RADIO_MAXIMO_KM, RADIO_MINIMO_KM };

/**
 * Metadata de mapa para los países que el selector de ubicaciones puede
 * ofrecer — exactamente los que ya tienen id de destino geográfico de
 * Google verificado en `GOOGLE_GEO_TARGET_IDS`. Un país sin ese id se
 * quedaría marcado en el mapa pero sin poder segmentarlo de verdad en
 * Google, así que la lista nace de esa tabla en vez de mantenerse aparte.
 *
 * `iso3` es la clave que trae el GeoJSON de fronteras en
 * `/public/geo/world-countries.json` (ese archivo usa ISO-3166-1 alfa-3,
 * no alfa-2). `lat`/`lng` son el centro geográfico aproximado, solo para
 * centrar y hacer zoom en el mapa — no viajan a ninguna plataforma; lo que
 * de verdad segmenta es el código ISO alfa-2 (Meta) o el id de Google.
 */
const METADATA: Record<string, { iso3: string; label: string; lat: number; lng: number }> = {
  CL: { iso3: "CHL", label: "Chile", lat: -35.68, lng: -71.54 },
  AR: { iso3: "ARG", label: "Argentina", lat: -38.42, lng: -63.62 },
  PE: { iso3: "PER", label: "Perú", lat: -9.19, lng: -75.02 },
  CO: { iso3: "COL", label: "Colombia", lat: 4.57, lng: -74.3 },
  EC: { iso3: "ECU", label: "Ecuador", lat: -1.83, lng: -78.18 },
  PA: { iso3: "PAN", label: "Panamá", lat: 8.54, lng: -80.78 },
  MX: { iso3: "MEX", label: "México", lat: 23.63, lng: -102.55 },
  ES: { iso3: "ESP", label: "España", lat: 40.46, lng: -3.75 },
  US: { iso3: "USA", label: "Estados Unidos", lat: 37.09, lng: -95.71 },
  BR: { iso3: "BRA", label: "Brasil", lat: -14.24, lng: -51.93 },
  UY: { iso3: "URY", label: "Uruguay", lat: -32.52, lng: -55.77 },
  PY: { iso3: "PRY", label: "Paraguay", lat: -23.44, lng: -58.44 },
  BO: { iso3: "BOL", label: "Bolivia", lat: -16.29, lng: -63.59 },
  VE: { iso3: "VEN", label: "Venezuela", lat: 6.42, lng: -66.59 },
  CR: { iso3: "CRI", label: "Costa Rica", lat: 9.75, lng: -83.75 },
  GT: { iso3: "GTM", label: "Guatemala", lat: 15.78, lng: -90.23 },
  HN: { iso3: "HND", label: "Honduras", lat: 15.2, lng: -86.24 },
  SV: { iso3: "SLV", label: "El Salvador", lat: 13.79, lng: -88.9 },
  NI: { iso3: "NIC", label: "Nicaragua", lat: 12.87, lng: -85.21 },
  DO: { iso3: "DOM", label: "República Dominicana", lat: 18.74, lng: -70.16 },
};

export type PaisSegmentable = {
  iso2: string;
  iso3: string;
  label: string;
  lat: number;
  lng: number;
};

export const PAISES_SEGMENTABLES: PaisSegmentable[] = Object.keys(
  GOOGLE_GEO_TARGET_IDS,
)
  .filter((iso2) => METADATA[iso2])
  .map((iso2) => ({ iso2, ...METADATA[iso2] }));

export function paisSegmentablePorIso2(iso2: string): PaisSegmentable | null {
  return PAISES_SEGMENTABLES.find((p) => p.iso2 === iso2) ?? null;
}

export const RADIO_POR_DEFECTO_KM = 10;

/** Dónde vive el GeoJSON de fronteras (fuente: johan/world.geo.json, ISO
 * alfa-3 en `feature.id`, ~250 KB). Se sirve como archivo estático, no se
 * agrupa en el bundle de la app. */
export const WORLD_COUNTRIES_GEOJSON_URL = "/geo/world-countries.json";
