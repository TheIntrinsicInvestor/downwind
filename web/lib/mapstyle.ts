// Map styling as pure data and functions: fire colours and sizes, smoke veil scaling, basemap recolour.
// deck.gl needs numeric RGB, so the CSS tokens used on the map are mirrored here (app/globals.css is the source).

import type { Fire, Mode } from "./replay";
import type { Camera } from "./story";

// The opening view, shared by the map's first frame and the app's desktop hand-off.
export const OPENING_CAMERA: Camera = { center: [110.44, -1.5], zoom: 6.33 };

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export const EMBER: RGB = [229, 57, 27];         // --ember #e5391b
export const EMBER_HOT: RGB = [179, 42, 16];     // --ember-hot #b32a10
export const EMBER_CORE: RGB = [179, 42, 16];    // --ember-core #b32a10
export const SMOKE: RGB = [122, 84, 48];         // --smoke #7a5430
export const INK: RGB = [42, 29, 18];            // --ink #2a1d12
const DIM_RED: RGB = [150, 90, 60];              // #965a3c, the last ranked fire
const UNRANKED: RGBA = [150, 90, 60, 90];

export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

// Official tiers, dark cool inks (spec section 4, tuned for contrast on the light paper map).
const OFFICIAL: Record<1 | 2 | 3, RGB> = { 1: [28, 58, 112], 2: [58, 110, 165], 3: [108, 84, 150] };

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

// ---- fire glow (haze theme: solid red points with a faint red halo; top 10 larger and stronger)
// Diameters in screen pixels at zoom 7.25, drawn with a radial-gradient sprite and normal alpha blending under the cores.

const HALO: RGB = EMBER;   // same hue as the dots: a lighter, more saturated ring read as glow

// The glow under each fire, or null for none (unranked fires are bare dots).
export function fireGlow(fire: Fire, mode: Mode, nRanked: number): { size: number; color: RGBA } | null {
  if (mode === "official") return fire.in_province ? { size: 9, color: [...officialColor(fire.tier), 90] } : null;
  const r = fire.rank;
  if (r === null) return null;
  if (r <= 10) return { size: 22 + 12 * (1 - (r - 1) / 9), color: [...HALO, 105] };
  const t = Math.max(0, 1 - Math.log(r) / Math.log(Math.max(nRanked, 2)));   // 1 at rank 1, 0 at the last rank
  return { size: 8 + 14 * t, color: [...HALO, 55] };
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
// 7.25 the veil is strengthened (domain divided by 2^(7.25 - zoom), at most SMOKE_MAX_BOOST, 1.6x): at province zoom the plume covers few
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
// Match the smoke simulation's geographic coverage (pipeline/dw/config.py).
// The regional extent keeps upwind fires in Sumatra and downwind districts in view.
export const MAP_BOUNDS: [[number, number], [number, number]] = [[95, -8], [120, 6]];
export const MAP_MAX_ZOOM = 13;          // closer views reveal more basemap detail

export function smokeRadiusPixels(zoom: number): number {
  return Math.min(SMOKE_MAX_RADIUS, Math.max(SMOKE_MIN_RADIUS, SMOKE_REF_RADIUS * 2 ** (zoom - SMOKE_REF_ZOOM)));
}

export function smokeColorDomain(zoom: number): [number, number] {
  const boost = Math.min(SMOKE_MAX_BOOST, 2 ** Math.max(0, SMOKE_REF_ZOOM - zoom));
  return [0, SMOKE_REF_DOMAIN_MAX * (SMOKE_TEXTURE_SIZE / 512) * (smokeRadiusPixels(zoom) / SMOKE_REF_RADIUS) / boost];
}

// First colour fully transparent: with a fixed domain, threshold no longer trims faint weights.
// Brown ramp that darkens the paper as smoke thickens.
export const SMOKE_RANGE: RGBA[] = [
  [122, 84, 48, 0], [122, 84, 48, 60], [116, 79, 45, 100],
  [110, 74, 42, 135], [103, 69, 39, 165], [96, 64, 36, 190],
];
// The focused fire's plume: a darker, redder umber.
export const FOCUS_SMOKE_RANGE: RGBA[] = [
  [110, 62, 30, 0], [104, 58, 28, 90], [98, 54, 26, 135],
  [91, 49, 23, 175], [85, 44, 21, 205], [78, 40, 18, 230],
];

// ---- basemap recolour (layer ids from OpenFreeMap `positron`)

// Sepia paper land, darker sepia water; the fires and smoke are the only strong colour.
const LAND = "#E9DEC6", WATER = "#D5C8AD", COAST = "#A8977A", BG = "#EFE6D4", LABEL = "#5A4532";   // --ink-2: positron's thin label face reads too faint in --ink-3

export const BASEMAP_PAINT: [layer: string, property: string, value: unknown][] = [
  ["background", "background-color", LAND],
  ["water", "fill-color", WATER],
  ["water", "fill-outline-color", COAST],
  ["water", "fill-antialias", true],              // keep the coast outline on
  ...["landcover_ice_shelf", "landcover_glacier", "landcover_wood", "park"]
    .map((id): [string, string, unknown] => [id, "fill-opacity", 0.12]),
  ["waterway", "line-color", "#BFB196"],
  // Province boundaries (admin levels 3 to 6) stay quiet; national borders (level 2) are darker and more distinct.
  ["boundary_3", "line-color", COAST],
  ["boundary_3", "line-opacity", 0.5],
  ["boundary_2", "line-color", "#7E6D52"],
  ["boundary_2", "line-opacity", 0.9],
  ["boundary_2", "line-width", ["interpolate", ["linear"], ["zoom"], 3, 0.8, 6, 1.4, 10, 2]],
  // Place labels stay quiet so they never compete with the fires.
  ...["label_city", "label_city_capital", "label_town"].flatMap((id): [string, string, unknown][] => [
    [id, "text-color", LABEL], [id, "text-halo-color", BG], [id, "text-halo-width", 1.2],
    [id, "text-opacity", id === "label_town" ? 0.75 : 0.9],
    [id, "icon-opacity", 0.5],                    // positron's black place dot, kept quieter than the text
  ]),
];

export const BASEMAP_HIDDEN = [
  "landuse_residential", "building", "aeroway-area", "road_area_pier", "road_pier",
  "aeroway-taxiway", "aeroway-runway-casing", "aeroway-runway",
  "tunnel_motorway_casing", "tunnel_motorway_inner",
  "highway_path", "highway_minor", "highway_major_casing", "highway_major_inner", "highway_major_subtle",
  "highway_motorway_casing", "highway_motorway_inner", "highway_motorway_subtle",
  "highway_motorway_bridge_casing", "highway_motorway_bridge_inner",
  "railway_transit", "railway_transit_dashline", "railway_service", "railway_service_dashline", "railway", "railway_dashline",
  "boundary_disputed", "waterway_line_label", "water_name_point_label", "water_name_line_label",
  "highway-name-path", "highway-name-minor", "highway-name-major",
  "highway-shield-non-us", "highway-shield-us-interstate", "road_shield_us", "airport",
  "label_other", "label_village", "label_state",
  "label_country_3", "label_country_2", "label_country_1",
];

// Place labels only in close views (zoom 7 and in): the region and province views (zoom 4.6 to 6.3) carry none, so
// no foreign capital sits at the edge of the smoke (controller ruling, neutral framing). Country labels are hidden
// entirely above.
export const PLACE_LABELS = ["label_city", "label_city_capital", "label_town"];
export const PLACE_LABEL_MIN_ZOOM = 7;
// positron starts its sub-national boundaries at zoom 8; the province outline must show from the region view.
export const PROVINCE_BOUNDARY = "boundary_3";
export const PROVINCE_BOUNDARY_MIN_ZOOM = 5;
