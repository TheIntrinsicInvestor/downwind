// Map styling as pure data and functions: fire colours and sizes, smoke veil scaling, basemap recolour.
// deck.gl needs numeric RGB, so the CSS tokens used on the map are mirrored here (app/globals.css is the source).

import type { Fire, Mode } from "./replay";

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export const EMBER: RGB = [255, 122, 46];        // --ember #ff7a2e
export const EMBER_HOT: RGB = [255, 208, 138];   // --ember-hot #ffd08a
export const EMBER_CORE: RGB = [255, 243, 220];  // --ember-core #fff3dc
export const SMOKE: RGB = [214, 222, 232];       // --smoke #d6dee8
export const INK: RGB = [238, 240, 234];         // --ink #eef0ea
const DIM_RED: RGB = [138, 42, 20];              // #8a2a14, the last ranked fire
const UNRANKED: RGBA = [125, 135, 150, 70];

export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

// Official tiers, cool palette (spec section 4, tuned for contrast on the dark map).
const OFFICIAL: Record<1 | 2 | 3, RGB> = { 1: [127, 208, 255], 2: [74, 134, 214], 3: [184, 164, 255] };

export function officialColor(tier: 1 | 2 | 3): RGB {
  return OFFICIAL[tier];
}

// 0 at rank 11, 1 at the last rank.
function rankT(rank: number, nRanked: number): number {
  return nRanked > 11 ? Math.min(1, Math.max(0, (rank - 11) / (nRanked - 11))) : 0;
}

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

export function fireFill(fire: Fire, mode: Mode, nRanked: number): RGBA {
  if (mode === "official") return fire.in_province ? [...officialColor(fire.tier), 230] : UNRANKED;
  const r = fire.rank;
  if (r === null) return UNRANKED;
  if (r <= 10) return [...EMBER_CORE, 255];
  const t = rankT(r, nRanked);
  return [lerp(EMBER[0], DIM_RED[0], t), lerp(EMBER[1], DIM_RED[1], t), lerp(EMBER[2], DIM_RED[2], t), lerp(220, 110, t)];
}

export function fireRadius(fire: Fire, mode: Mode, nRanked: number): number {
  if (mode === "official") return fire.in_province ? 2500 : 900;   // the rule gives no order: one size
  const r = fire.rank;
  if (r === null) return 900;
  return r <= 10 ? 6000 : 1500 + 2500 * (1 - (r - 1) / Math.max(nRanked, 1));
}

// ---- fire glow (approved night mockup: small bright points with a soft additive glow; top 10 hotter and larger)
// Diameters in screen pixels at zoom 7.25, drawn with a radial-gradient sprite and additive blending under the cores.

const TOP_GLOW: RGB = [255, 177, 90];

// The glow under each fire, or null for none (unranked fires are bare dots).
export function fireGlow(fire: Fire, mode: Mode, nRanked: number): { size: number; color: RGBA } | null {
  if (mode === "official") return fire.in_province ? { size: 9, color: [...officialColor(fire.tier), 140] } : null;
  const r = fire.rank;
  if (r === null) return null;
  if (r <= 10) return { size: 22 + 12 * (1 - (r - 1) / 9), color: [...TOP_GLOW, 170] };
  const t = Math.max(0, 1 - Math.log(r) / Math.log(Math.max(nRanked, 2)));   // 1 at rank 1, 0 at the last rank
  const [cr, cg, cb, ca] = fireFill(fire, mode, nRanked);
  return { size: 8 + 14 * t, color: [cr, cg, cb, ca] };
}

// The wide faint haze around each top-10 fire.
export function topHaze(rank: number): { size: number; color: RGBA } {
  return { size: 70 + 40 * (1 - (rank - 1) / 9), color: [...EMBER, 34] };
}

// Glows grow gently with zoom, so fires stay points: 0.55x at the region view, 1.5x at most.
export function glowScale(zoom: number): number {
  return Math.min(1.5, Math.max(0.55, 2 ** ((zoom - 7.25) / 2)));
}

// ---- clicking fires
// Fire dots are 1 to 5 px, so a click picks every fire within PICK_RADIUS px of the pointer. In the Downwind view the
// best-ranked of them wins (a top fire is the one a reader means when it sits beside lesser dots); the official view
// gives no order, so the nearest wins. `hits` are fire indices, nearest first; null when there are none.

export const PICK_RADIUS = 8;

export function pickFire(hits: number[], fires: Fire[], mode: Mode): number | null {
  if (hits.length === 0) return null;
  if (mode === "official") return hits[0];
  let best = hits[0];
  for (const i of hits) {
    const r = fires[i].rank, b = fires[best].rank;
    if (r !== null && (b === null || r < b)) best = i;
  }
  return best;
}

// ---- smoke veil (deck.gl HeatmapLayer, Task 1 ruling; tuned at zoom 7.25 with radius 60 px and domain [0, 0.04])
// Radius: radiusPixels is in screen pixels, so it scales with 2^(zoom - 7.25) to keep the plume's width in km constant,
// between a floor (below 30 px, about zoom 6.25 and out, the veil turns to grain) and a ceiling (100 px, the prop's
// declared max; past about zoom 8 each particle would otherwise cover most of the weight texture, rebuilt 8 times a
// second while playing). The map's maxZoom is 10.
// Brightness: deck multiplies a fixed SUM colorDomain by metres per texel (heatmap-layer.js _updateWeightmap); with a
// km-constant kernel the summed weight per km does not change with zoom, so a domain proportional to the radius in
// pixels keeps a plume's brightness. The same rule is kept at the floor and the ceiling (past the ceiling the domain
// stays fixed: a stricter area correction there made lone particles saturate into flat discs at zoom 10). Below zoom
// 7.25 the veil is brightened (domain divided by 2^(7.25 - zoom), at most 2x): at province zoom the plume covers few
// pixels and read as a faint smudge, and smoke reaching people is the point of the map. Checked by screenshots at zoom
// 4.6 to 10.
// Texture size: 256, not Task 1's 512: a quarter of the texels and, once the domain is corrected, the same look on
// Iris Xe (Task 4 screenshots). Metres per texel double with half the texels, so the domain tuned at 512 is scaled by
// 256 / 512 to keep the brightness.

const SMOKE_REF_ZOOM = 7.25;
const SMOKE_REF_RADIUS = 60;
const SMOKE_REF_DOMAIN_MAX = 0.04;       // at weightsTextureSize 512
const SMOKE_MIN_RADIUS = 40;
export const SMOKE_MAX_RADIUS = 100;
const SMOKE_MAX_BOOST = 1.6;
export const SMOKE_TEXTURE_SIZE = 256;
export const MAP_MAX_ZOOM = 10;          // fires are 1.5 km squares: closer shows nothing more

export function smokeRadiusPixels(zoom: number): number {
  return Math.min(SMOKE_MAX_RADIUS, Math.max(SMOKE_MIN_RADIUS, SMOKE_REF_RADIUS * 2 ** (zoom - SMOKE_REF_ZOOM)));
}

export function smokeColorDomain(zoom: number): [number, number] {
  const boost = Math.min(SMOKE_MAX_BOOST, 2 ** Math.max(0, SMOKE_REF_ZOOM - zoom));
  return [0, SMOKE_REF_DOMAIN_MAX * (SMOKE_TEXTURE_SIZE / 512) * (smokeRadiusPixels(zoom) / SMOKE_REF_RADIUS) / boost];
}

// First colour fully transparent: with a fixed domain, threshold no longer trims faint weights.
export const SMOKE_RANGE: RGBA[] = [
  [214, 222, 232, 0], [214, 222, 232, 50], [218, 225, 235, 85],
  [224, 230, 239, 120], [234, 238, 245, 160], [246, 248, 251, 200],
];
// The focused fire's plume: brighter and warmer.
export const FOCUS_SMOKE_RANGE: RGBA[] = [
  [255, 208, 138, 0], [255, 208, 138, 90], [255, 214, 150, 135],
  [255, 224, 170, 175], [255, 234, 200, 210], [255, 243, 220, 240],
];

// ---- basemap recolour (Task 1 ruling; layer ids from OpenFreeMap `dark`, 13 Nov)

const LAND = "#10161f", WATER = "#03060b", COAST = "#26384d", BG = "#05070b", INK3 = "#8d97a6";

export const BASEMAP_PAINT: [layer: string, property: string, value: unknown][] = [
  ["background", "background-color", LAND],
  ["water", "fill-color", WATER],
  ["water", "fill-outline-color", COAST],
  ["water", "fill-antialias", true],              // the style ships false, which hides the coast outline
  ...["landcover_ice_shelf", "landcover_glacier", "landcover_wood", "landuse_park"]
    .map((id): [string, string, unknown] => [id, "fill-opacity", 0.25]),
  ["waterway", "line-color", "#0a1a2a"],
  ["waterway", "line-opacity", 0.7],
  ...["boundary_state", "boundary_country_z0-4", "boundary_country_z5-"].flatMap((id): [string, string, unknown][] =>
    [[id, "line-color", "#2a3442"], [id, "line-opacity", 0.6]]),
  // Place labels stay dim (--ink-3) so they never compete with the fires.
  ...["place_city", "place_city_large", "place_town"].flatMap((id): [string, string, unknown][] => [
    [id, "text-color", INK3], [id, "text-halo-color", BG], [id, "text-halo-width", 1.2],
    [id, "text-opacity", id === "place_town" ? 0.45 : 0.6],
  ]),
];

export const BASEMAP_HIDDEN = [
  "landuse_residential", "building", "aeroway-area", "road_area_pier",
  "water_name", "aeroway-taxiway", "aeroway-runway-casing", "aeroway-runway", "road_pier",
  "highway_path", "highway_minor", "highway_major_casing", "highway_major_inner", "highway_major_subtle",
  "highway_motorway_casing", "highway_motorway_inner", "highway_motorway_subtle", "road_oneway", "road_oneway_opposite",
  "railway_transit", "railway_transit_dashline", "railway_minor", "railway_minor_dashline", "railway", "railway_dashline",
  "highway_name_other", "highway_name_motorway",
  "place_other", "place_suburb", "place_village", "place_state",
  "place_country_other", "place_country_minor", "place_country_major",
];

// No place labels when zoomed out past the province (country labels are hidden entirely above).
export const PLACE_LABELS = ["place_city", "place_city_large", "place_town"];
export const PLACE_LABEL_MIN_ZOOM = 6;
