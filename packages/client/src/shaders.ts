import { ORBIT_POWER, PIT_SHAPE, RELIEF_SHAPE, TIME_POWER } from "@barycenter/sim";
import { HAZE_COLUMNS, SHADE_COLUMNS, SHADE_REACH, SHADE_ROWS } from "./haze.ts";
import { GRIT_SPAN } from "./tile.ts";

const real = (value: number) => (Number.isInteger(value) ? `${value}.0` : String(value));
const shape = RELIEF_SHAPE;
const pit = PIT_SHAPE;

const NOISE = `
uint scramble(ivec3 cell, uint salt) {
  uint mixed = uint(cell.x) * 0x9e3779b1u ^ uint(cell.y) * 0x85ebca77u ^ uint(cell.z) * 0xc2b2ae3du ^ salt;
  mixed = (mixed ^ (mixed >> 15)) * 0x2c1b3c6du;
  mixed = (mixed ^ (mixed >> 12)) * 0x297a2d39u;
  return mixed ^ (mixed >> 15);
}

float lean(uint corner, vec3 at) {
  uint pick = corner & 15u;
  float first = pick < 8u ? at.x : at.y;
  float second = pick < 4u ? at.y : (pick == 12u || pick == 14u ? at.x : at.z);
  return ((pick & 1u) == 0u ? first : -first) + ((pick & 2u) == 0u ? second : -second);
}

float cornerOf(ivec3 base, vec3 inside, ivec3 step, uint salt) {
  return lean(scramble(base + step, salt), inside - vec3(step));
}

float noise(vec3 at, uint salt) {
  vec3 cell = floor(at);
  vec3 inside = at - cell;
  ivec3 base = ivec3(cell);
  vec3 share = inside * inside * inside * (inside * (inside * 6.0 - 15.0) + 10.0);
  float near = mix(
    mix(cornerOf(base, inside, ivec3(0, 0, 0), salt), cornerOf(base, inside, ivec3(1, 0, 0), salt), share.x),
    mix(cornerOf(base, inside, ivec3(0, 1, 0), salt), cornerOf(base, inside, ivec3(1, 1, 0), salt), share.x),
    share.y
  );
  float far = mix(
    mix(cornerOf(base, inside, ivec3(0, 0, 1), salt), cornerOf(base, inside, ivec3(1, 0, 1), salt), share.x),
    mix(cornerOf(base, inside, ivec3(0, 1, 1), salt), cornerOf(base, inside, ivec3(1, 1, 1), salt), share.x),
    share.y
  );
  return mix(near, far, share.z);
}
`;

const FIELD = `
uniform uint seed;
uniform vec3 shape;
${NOISE}
vec3 turned(vec3 at) {
  return 2.0 * vec3(
    -0.8 * at.y - 0.6 * at.z,
    0.8 * at.x + 0.36 * at.y - 0.48 * at.z,
    0.6 * at.x - 0.48 * at.y + 0.64 * at.z
  );
}

float layered(vec3 at, uint salt, int octaves) {
  float total = 0.0;
  float weight = 1.0;
  for (int octave = 0; octave < octaves; octave++) {
    total += weight * noise(at, salt + uint(octave));
    at = turned(at);
    weight *= 0.5;
  }
  return total;
}

float crested(vec3 at, uint salt, int octaves) {
  float total = 0.0;
  float weight = 1.0;
  for (int octave = 0; octave < octaves; octave++) {
    float value = 1.0 - abs(noise(at, salt + uint(octave)));
    total += weight * value * value;
    at = turned(at);
    weight *= 0.5;
  }
  return total;
}

float elevation(vec3 at) {
  vec3 scaled = at * shape.x;
  vec3 warped = scaled + shape.y * vec3(
    layered(scaled, seed + ${shape.warpSeed}u, ${shape.warpOctaves}),
    layered(scaled, seed + ${2 * shape.warpSeed}u, ${shape.warpOctaves}),
    layered(scaled, seed + ${3 * shape.warpSeed}u, ${shape.warpOctaves})
  );
  float base = layered(warped, seed, ${shape.octaves});
  float ridges = crested(warped * ${real(shape.ridgeScale)}, seed + ${shape.ridgeSeed}u, ${shape.ridgeOctaves})
    / ${real(shape.ridgeWeight)};
  return base + shape.z * ridges * smoothstep(${real(shape.ridgeFrom)}, ${real(shape.ridgeTo)}, base);
}
`;

const PIT_LAYERS = 8;
const PIT_EMBOSS = 45;

const PITS = `
uniform vec4 pits;
uniform float grain;

vec2 dent(float share, float radius) {
  float wide = max(1.0, radius / pits.y);
  float least = min(radius, pits.y);
  float depth = ${real(pit.depth)} * least * pow(wide, ${real(pit.deepen)});
  float rim = ${real(pit.rim)} * least * pow(wide, ${real(pit.raise)});
  if (share < 1.0) {
    float steep = min(${real(pit.steepest)}, 2.0 + log2(wide));
    float risen = (depth + rim) * pow(share, steep - 1.0);
    return vec2(risen * share - depth, steep * risen);
  }
  float past = (share - 1.0) / ${real(pit.reach - 1)};
  float faded = 1.0 - past * past * (3.0 - 2.0 * past);
  float cube = share * share * share;
  return vec2(
    rim * faded / cube,
    rim * (-3.0 * faded / (cube * share) - 6.0 * past * (1.0 - past) / (${real(pit.reach - 1)} * cube))
  );
}

vec4 pitted(vec3 at) {
  vec4 total = vec4(0.0);
  float pitch = ${real(pit.pitch)};
  float blurFrom = ${real(pit.blurFrom)} * grain;
  float blurTo = ${real(pit.blurTo)} * grain;
  for (int layer = 0; layer < ${PIT_LAYERS}; layer++) {
    if (${real(pit.most)} * pitch <= blurFrom) {
      break;
    }
    uint salt = seed + ${pit.seed}u + uint(layer);
    ivec3 base = ivec3(floor(at / pitch));
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          ivec3 cell = base + ivec3(x, y, z);
          uint mixed = scramble(cell, salt);
          vec3 site = (vec3(cell) + vec3(mixed & 1023u, (mixed >> 10) & 1023u, (mixed >> 20) & 1023u) / 1024.0)
            * pitch;
          float span = length(site);
          float kept = 1.0 - smoothstep(${real(pit.shell)}, 1.0, abs(span - 1.0) / (0.5 * pitch));
          if (kept > 0.0) {
            uint more = scramble(cell, salt ^ ${pit.twin}u);
            float radius = pitch * mix(${real(pit.least)}, ${real(pit.most)}, float(more & 65535u) / 65536.0);
            float fresh = clamp((pits.x - float(more >> 16) / 65536.0) / ${real(pit.soft)}, 0.0, 1.0);
            float strength = kept * fresh * smoothstep(blurFrom, blurTo, radius);
            vec3 from = at - site / span;
            float away = length(from);
            float share = away / radius;
            if (strength > 0.0 && share < ${real(pit.reach)}) {
              vec2 found = dent(share, radius);
              vec3 along = (from - at * dot(from, at)) / max(away, 1e-9);
              total += strength * vec4(found.y / radius * along, found.x);
            }
          }
        }
      }
    }
    pitch *= 0.5;
  }
  return total;
}
`;

const SLOPE_RANGE = 8;
const SLOPE_SPAN = 5;
const EDDY_SCALE = 4;
const EDDY_SQUEEZE = 4;
const EDDY_REACH = 0.002;
const EDDY_SPAN = 0.008;
const LIFT_RANGE = 0.15;
const STREAK_SCALE = 5;
const STREAK_SQUEEZE = 7;
const PUFF_SCALE = 9;
const SECTOR_SCALE = 1.3;
const SWIRL_TWIST = 1.6;
const SWIRL_RATE = 4;
const WAKE_REACH = 3;
const WAKE_GAIN = 0.8;
const RING_SHADE = 0.8;
const RING_SLANT = 0.04;
const RING_GAIN = 3;
const RING_DUST = [0.1, 0.6];
const LUMP_SCALE = 0.9;
const LUMP_SPAN = 0.06;
const LAVA_FLOOR = -0.4;
const LAVA_SPAN = 2;
const CRUST_GLOW = 0.04;
const DAY_EDGE = [-0.15, 0.25];
const FOG_LIGHT = 0.95;
const FOG_WRAP = 0.25;
const FOG_DUSK = 1.2;
const GRAZE = 1e-3;
const FRINGE_CORE = 0.99;
const FRINGE_SUNK = 4;
const SHORE_GLOW = 0.3;

const GRAIN_MEAN = 0.446;
const GRAIN_LANES = 5;
const CELL_SCALE = 36;
const CELL_LANES = 7;
const NET_SCALE = 23;
const FILAMENT_SQUEEZE = 0.1;
const FILAMENT_FLOW = 1;
const FILAMENT_FINE = 3;
const GRAIN_MIDDLE = 0.3;
const COARSE_WARP = 0.05;
const COARSE_SOFT = 1.2;
const COARSE_FINE = 3.1;
const COARSE_GAIN = 0.5;
const COARSE_PATCH = 0.6;
const PENUMBRA = 1.3;
const PORE = 0.003;
const PLAGE = 0.6;
export const PLAGE_REACH = 6;
const RAGGED = 0.3;
const RAGGED_LEAST = 0.004;
const FRAY_FINE = 4;
const FRAY_GAIN = 1.6;
const FRAY_FROM = 0.42;
const FRAY_TO = 0.62;
const FRAY_BARE = 0.6;
const FACULAE = 1.2;
const HYDROGEN = "vec3(1.0, 0.25, 0.2)";
const FUZZ_REACH = 0.05;
const FUZZ_RISE = 0.005;
const FUZZ_GLOW = 0.5;
const SWAY = 0.15;
const SWAY_WAVES = 5;
const SWAY_STEEP = 0.6;
const THICK = 0.18;
const LUMPS = 4;
const THREADS = 9;
const THREAD_RISE = 1.2;
const PROMINENCE_DEPTH = 0.9;
const PROMINENCE_SHADE = 0.25;
const PROMINENCE_DUSK = 0.3;
const PROMINENCE_CLEAR = [0.996, 1.002];
const HALO_SOFT = 0.25;
const HALO_RIM = 0.5;
const HALO_WIDE = 0.12;
const HALO_PEAK = HALO_RIM + HALO_WIDE;
const HALO_WRAP = 2;
const HALO_SHEET = 1.35;
const HALO_CORE = 0.99;
const HALO_EDGE = 2;
const BELT_COVER = 0.12;
const HAZE_GAIN = 6;
const HAZE_MOST_LIGHT = 1.4;
const HAZE_DIM = 2e-6;
const HAZE_SLACK = 1.1;
const HAZE_TURNS = 3;
const SWARM_SWAY = 9;
const JET_WIDE = 2.5;
const JET_KNOTS = [5, 8];
const JET_GLOW = 0.7;
const JET_ASIDE = [0.1, 0.35];
const ARC_WIDE = 2.4;
const SPIRAL_TWIST = 5;
const SPIRAL_REACH = 0.5;
const SPIRAL_WIDE = 29;
const SPIRAL_SECOND = 0.5;
const STREAK_WIDE = 0.04;
const STREAK_CELLS = [40, 23];
const STREAK_GAIN = 0.3;
const STREAK_SHADE = 0.4;
const STREAK_FINE = [0.3, 0.6];
const MIST_RIM = 4;
const HAZE_CLEAR = 0.01;
const HAZE_NEAR = 0.3;
const HAZE_LONG = 0.25;
const HAZE_ACROSS = 6;
const HAZE_MOST = 28;
const HAZE_DUST = [0.2, 0.5];
const HAZE_EMBER = "vec3(1.0, 0.42, 0.14)";

export const STORM_ROOM = 8;
export const LAMP_ROOM = 2;
export const PALETTE_ROOM = 9;
export const REGION_ROOM = 16;
export const MEMBER_ROOM = 6;
export const SPOT_ROOM = REGION_ROOM * MEMBER_ROOM;
export const PROMINENCE_ROOM = 16;
const GRAIN_BITS = 4;
export const GRAIN_CELLS = 1 << GRAIN_BITS;
export const SCREEN_ROOM = 6;
export const ARC_ROOM = 3;
export const SPIRAL_ROOM = 2;
export const BUBBLE_ROOM = 2;
export const LIMB = 0.28;
export const LIMB_DEPTH = 0.4;
export const EXPOSURE = 1.97;
const HEIGHT_RANGE = 2.5;

export const BAKE_VERTEX = `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const HEADING = `
uniform float size;
uniform int face;

vec3 heading() {
  vec2 spot = gl_FragCoord.xy / size * 2.0 - 1.0;
  if (face == 0) return vec3(1.0, -spot.y, -spot.x);
  if (face == 1) return vec3(-1.0, -spot.y, spot.x);
  if (face == 2) return vec3(spot.x, 1.0, spot.y);
  if (face == 3) return vec3(spot.x, -1.0, -spot.y);
  if (face == 4) return vec3(spot.x, -spot.y, 1.0);
  return vec3(-spot.x, -spot.y, -1.0);
}
`;

export const BAKE_FRAGMENT = `
${FIELD}
${HEADING}
${PITS}
uniform float sea;

void main() {
  vec3 at = normalize(heading());
  vec3 helper = abs(at.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 first = normalize(cross(helper, at));
  vec3 second = cross(at, first);
  float reach = ${real(SLOPE_SPAN)} / size;
  float here = elevation(at);
  float ahead = elevation(normalize(at + first * reach));
  float aside = elevation(normalize(at + second * reach));
  vec3 slope = ((ahead - here) * first + (aside - here) * second) / reach;
  if (pits.x > 0.0) {
    vec4 dug = pitted(at);
    slope += ${real(PIT_EMBOSS)} * dug.xyz + at * (pits.z * dug.w);
  }
  vec4 survey = vec4(slope, here - sea);
#ifdef PACKED
  survey = vec4(slope / ${real(SLOPE_RANGE)} + 0.5, (here - sea) / ${real(HEIGHT_RANGE)} + 0.5);
#endif
  gl_FragColor = survey;
}
`;

const cells = (seat: string) => `
vec3 nearest(vec3 at, uint salt) {
  vec3 cell = floor(at);
  vec3 inside = at - cell;
  ivec3 base = ivec3(cell);
  float first = 9.0;
  float second = 9.0;
  float mark = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      for (int z = -1; z <= 1; z++) {
        ivec3 step = ivec3(x, y, z);
        uint mixed = scramble(${seat}, salt);
        vec3 site = vec3(step) - inside
          + vec3(mixed & 1023u, (mixed >> 10) & 1023u, (mixed >> 20) & 1023u) / 1023.0;
        float away = dot(site, site);
        if (away < first) {
          second = first;
          first = away;
          mark = float((mixed * 0x9e3779b1u) >> 24) / 255.0;
        } else if (away < second) {
          second = away;
        }
      }
    }
  }
  return vec3(sqrt(first), sqrt(second), mark);
}

float granules(vec3 at, uint salt, float lanes) {
  vec3 found = nearest(at, salt);
  return (1.0 - exp(-lanes * (found.y - found.x))) * (0.7 + 0.3 * found.z);
}
`;

export const STAR_BAKE_FRAGMENT = `
${FIELD}
${HEADING}
${cells("base + step")}

void main() {
  vec3 at = normalize(heading());
  vec3 net = nearest(at * ${real(NET_SCALE)}, seed + 31u);
  gl_FragColor = vec4(
    granules(at * ${real(CELL_SCALE)}, seed + 11u, ${real(CELL_LANES)}),
    0.0,
    clamp(0.5 + 0.45 * layered(at * 3.0, seed + 5u, 4), 0.0, 1.0),
    1.0 - smoothstep(0.0, 0.1, net.y - net.x)
  );
}
`;

export const GRAIN_BAKE_FRAGMENT = `
${FIELD}
${cells(`(base + step) & ${GRAIN_CELLS - 1}`)}
uniform float size;
uniform float layer;

void main() {
  vec3 at = vec3(gl_FragCoord.xy / size, layer) * ${real(GRAIN_CELLS)};
  gl_FragColor = vec4(granules(at, 11u, ${real(GRAIN_LANES)}), 0.0, 0.0, 1.0);
}
`;

export const GAS_STEPS = 8;

export const GAS_STEP_FRAGMENT = `
${FIELD}
${HEADING}
uniform samplerCube prior;

float swell(vec3 at) {
  vec3 wide = vec3(at.x, at.y * ${real(EDDY_SQUEEZE)}, at.z) * ${real(EDDY_SCALE)};
  return noise(wide, seed + 3u) + 0.4 * noise(turned(wide) * 1.15, seed + 4u);
}

void main() {
  vec3 from = normalize(heading());
  vec3 at = normalize(from + textureCube(prior, from).xyz);
  vec3 helper = abs(at.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 first = normalize(cross(helper, at));
  vec3 second = cross(at, first);
  float here = swell(at);
  float ahead = swell(normalize(at + first * ${real(EDDY_SPAN)}));
  float aside = swell(normalize(at + second * ${real(EDDY_SPAN)}));
  vec3 next = normalize(at - ${real(EDDY_REACH / EDDY_SPAN)} * ((ahead - here) * second - (aside - here) * first));
  gl_FragColor = vec4(next - from, 1.0);
}
`;

export const GAS_BAKE_FRAGMENT = `
${FIELD}
${HEADING}
uniform samplerCube prior;

void main() {
  vec3 at = normalize(heading());
  vec3 source = normalize(at + textureCube(prior, at).xyz);
  float lift = asin(clamp(source.y, -1.0, 1.0)) - asin(clamp(at.y, -1.0, 1.0));
  float streak = layered(
    vec3(source.x, source.y * ${real(STREAK_SQUEEZE)}, source.z) * ${real(STREAK_SCALE)}, seed + 41u, 4);
  float puff = layered(source * ${real(PUFF_SCALE)}, seed + 53u, 3);
  float sector = layered(vec3(at.x, at.y * 4.0, at.z) * ${real(SECTOR_SCALE)}, seed + 67u, 2);
  vec4 churned = vec4(lift / ${real(LIFT_RANGE)}, 0.45 * streak, 0.45 * puff, 0.45 * sector);
#ifdef PACKED
  churned = clamp(churned + 0.5, 0.0, 1.0);
#endif
  gl_FragColor = churned;
}
`;

const SPIN = `
vec3 spun(vec3 at, float angle) {
  float along = cos(angle);
  float across = sin(angle);
  return vec3(along * at.x + across * at.z, at.y, along * at.z - across * at.x);
}
`;

const SURVEY = `
uniform samplerCube relief;
${SPIN}
vec4 decoded(vec4 found) {
#ifdef PACKED
  found = vec4((found.rgb - 0.5) * ${real(SLOPE_RANGE)}, (found.a - 0.5) * ${real(HEIGHT_RANGE)});
#endif
  return found;
}

vec4 survey(vec3 at) {
  return decoded(textureCube(relief, at));
}

vec4 carried(vec3 at) {
  vec4 found = textureCube(relief, at);
#ifdef PACKED
  found -= 0.5;
#endif
  return found;
}

vec3 tilted(vec3 at, vec3 slope, float depth) {
  vec3 lean = slope * depth;
  return normalize(at - lean / (1.0 + 1.5 * length(lean)));
}

float hillshade(vec3 at, vec3 slope, float depth) {
  vec3 east = cross(vec3(0.0, 1.0, 0.0), at);
  float level = length(east);
  vec3 north = cross(at, east);
  vec3 toward = normalize(at + (north - east) / max(level, 1e-4));
  float lit = clamp(dot(tilted(at, slope, depth), toward) / 0.7071, 0.6, 1.3);
  return mix(1.0, lit, smoothstep(0.02, 0.25, level));
}
`;

export const STAR_VERTEX = `
varying vec3 vAt;
varying vec3 vPlace;
varying vec3 vOut;

void main() {
  vAt = position;
  vec4 placed = modelMatrix * vec4(position, 1.0);
  vPlace = placed.xyz;
  vOut = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * placed;
}
`;

export const LUMP_VERTEX = `
${FIELD}
uniform vec4 lump;
varying vec3 vAt;
varying vec3 vPlace;
varying vec3 vLean;

float outline(vec3 at) {
  vec3 squeezed = at / lump.yzw;
  return inversesqrt(dot(squeezed, squeezed))
    * (1.0 + lump.x * layered(at * ${real(LUMP_SCALE)} + 3.7, seed + 211u, 3));
}

void main() {
  vAt = position;
  vLean = position;
  vec3 moved = position;
  if (lump.x > 0.0) {
    vec3 helper = abs(position.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 first = normalize(cross(helper, position));
    vec3 second = cross(position, first);
    vec3 ahead = normalize(position + first * ${real(LUMP_SPAN)});
    vec3 aside = normalize(position + second * ${real(LUMP_SPAN)});
    moved = position * outline(position);
    vLean = normalize(cross(ahead * outline(ahead) - moved, aside * outline(aside) - moved));
  }
  vec4 placed = modelMatrix * vec4(moved, 1.0);
  vPlace = placed.xyz;
  gl_Position = projectionMatrix * viewMatrix * placed;
}
`;

export const TILE_VERTEX = `
attribute vec3 heading;
attribute vec3 grit;
varying vec3 vAt;
varying vec3 vPlace;
varying vec3 vLean;
varying vec3 vGrit;

void main() {
  vAt = heading;
  vLean = normal;
  vGrit = grit;
  vPlace = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * (modelViewMatrix * vec4(position, 1.0));
}
`;

const GRIT_SCALES = [0.125, 1, 4];
const GRIT_DEPTHS = [0.12, 0.1, 0.08];

const GRIT = `
#ifdef TILED
varying vec3 vGrit;
uniform float gritty;

float speck(ivec3 cell, int mask) {
  uvec3 mixed = uvec3(cell & mask) * uvec3(0x9e3779b1u, 0x85ebca77u, 0xc2b2ae3du);
  uint joined = (mixed.x ^ mixed.y ^ mixed.z) * 0x2c1b3c6du;
  joined = (joined ^ (joined >> 15)) * 0x297a2d39u;
  return float((joined ^ (joined >> 13)) >> 8) / 16777216.0 - 0.5;
}

float grains(vec3 at, int mask) {
  vec3 cell = floor(at);
  vec3 inside = at - cell;
  vec3 share = inside * inside * (3.0 - 2.0 * inside);
  ivec3 base = ivec3(cell);
  float low = mix(
    mix(speck(base, mask), speck(base + ivec3(1, 0, 0), mask), share.x),
    mix(speck(base + ivec3(0, 1, 0), mask), speck(base + ivec3(1, 1, 0), mask), share.x),
    share.y
  );
  float high = mix(
    mix(speck(base + ivec3(0, 0, 1), mask), speck(base + ivec3(1, 0, 1), mask), share.x),
    mix(speck(base + ivec3(0, 1, 1), mask), speck(base + ivec3(1, 1, 1), mask), share.x),
    share.y
  );
  return mix(low, high, share.z);
}

float gritOf() {
  vec3 spread = fwidth(vGrit);
  float blur = max(spread.x, max(spread.y, spread.z));
  float total = 0.0;
${GRIT_SCALES.map(
  (scale, index) =>
    `  total += ${real(GRIT_DEPTHS[index])} * (1.0 - smoothstep(${real(0.25 / scale)}, ${real(1 / scale)}, blur))
    * grains(vGrit * ${real(scale)}, ${Math.round(GRIT_SPAN * scale) - 1});`,
).join("\n")}
  return 1.0 + 2.0 * gritty * total;
}
#endif
`;

const SOLID_UNIFORMS = `
uniform vec2 melt;
uniform vec2 ramp;
uniform vec4 clime;
uniform vec4 marks;
uniform vec2 deck;
uniform float relish;
`;

const SOLID = `
  vec4 ground = survey(at);
  float sunk = marks.w * dot(ground.rgb, at);
  float height = ground.a + sunk;
  float other = survey(at.zxy).a;
  float edge = fwidth(height) + 1e-4;
  slope = ground.rgb - at * sunk;
  float rise = (height - ramp.x) / ramp.y;
  float cold = smoothstep(clime.x - 0.045, clime.x + 0.045, abs(at.y) + clime.y * rise + 0.05 * other);
  vec3 land = mix(palette[2], palette[3], smoothstep(0.0, 0.45, rise));
  float patchy = smoothstep(0.0, 0.5, other) * mix(1.0, 1.0 - smoothstep(0.5, 0.75, abs(at.y)), marks.y);
  land = mix(land, palette[7], marks.x * patchy * (1.0 - smoothstep(0.5, 1.0, rise)));
  land = mix(land, palette[4], smoothstep(0.45, 1.0, rise));
  land = mix(land, palette[5], smoothstep(0.95, 1.5, rise));
  land = mix(land, palette[8], marks.z * smoothstep(5.0, 11.0, length(slope)));
  land = mix(land, palette[6], max(cold, clime.z * smoothstep(1.5, 2.2, rise)));
  vec3 water = mix(palette[1], palette[0], smoothstep(0.0, 0.22, -height));
  water = mix(water, palette[6] * 0.9, cold * 0.9);
  wet = clime.w * (1.0 - smoothstep(-edge, edge, height));
  albedo = mix(land, water, wet);
  bump = relish;
  if (melt.y > 0.0) {
    float noon = pow(clamp(dot(round, sun), 0.0, 1.0), 0.25);
    float local = mix(melt.x, melt.y, noon);
    float level = ${real(LAVA_FLOOR)} + ${real(LAVA_SPAN)} * local;
    float sunk = 1.0 - smoothstep(-0.03, 0.03, rise - level);
    float churn = survey(at.yzx).a;
    vec2 plates = vec2(churn * 3.0 + 0.5, other * 3.0);
    vec2 seams = abs(fract(plates) - 0.5) / (fwidth(plates) + 0.02);
    float crack = 1.0 - smoothstep(0.4, 1.6, min(seams.x, seams.y));
    float cooled = other - 0.6 * churn + 0.9 - 0.7 * min(local, 2.2) - 0.5 * min(level - rise, 1.0);
    float raft = smoothstep(-0.1, 0.1, cooled);
    float swell = 0.28 + 0.72 * smoothstep(-0.45, 0.5, 0.8 * churn - 0.6 * other);
    float lit = mix(swell, ${real(CRUST_GLOW)} + 0.9 * crack, raft);
    float shore = (1.0 - sunk) * exp(-max(rise - level, 0.0) / 0.07) * step(0.0, local);
    emit = ember.rgb * ember.a * (sunk * lit + ${real(SHORE_GLOW)} * shore);
    albedo = mix(albedo, palette[2] * 0.35, sunk);
    bump *= 1.0 - 0.8 * sunk;
  }
  if (chart < 0.999 && deck.x + deck.y > 0.0) {
    vec4 high = survey(spun(at, drift).yzx);
    vec3 back = spun(at, -2.0 * drift);
    vec4 low = survey(vec3(-back.z, back.x, -back.y));
    float belt = 0.2 * cos(at.y * 5.2) - 0.08;
    float mass = high.a + 0.6 * low.a + 0.02 * (high.r + low.g) + belt;
    float thick = smoothstep(0.2, 1.0, mass);
    cover = max(0.9 * deck.x * thick, deck.y);
    murk = 0.2 * deck.y * (1.0 - smoothstep(-0.4, 0.8, mass));
  }
`;

const GAS_UNIFORMS = `
uniform float vents;
uniform sampler2D bands;
uniform vec4 stream;
uniform vec2 shift;
uniform vec3 mood;
uniform int gales;
uniform vec4 storms[${STORM_ROOM}];
uniform vec3 sweeps[${STORM_ROOM}];
uniform vec3 rises[${STORM_ROOM}];
uniform vec4 whirls[${STORM_ROOM}];
uniform vec4 stains[${STORM_ROOM}];
`;

const GAS = `
  float lane = asin(clamp(at.y, -1.0, 1.0));
  float bend = 0.0;
  float churned = 0.0;
  float least = 1e9;
  float second = 1e9;
  int nearest = -1;
  vec2 seat = vec2(0.0);
  for (int index = 0; index < ${STORM_ROOM}; index++) {
    if (index >= gales) {
      break;
    }
    vec4 storm = storms[index];
    vec4 whirl = whirls[index];
    vec2 spot = vec2(dot(at, sweeps[index]), dot(at, rises[index]));
    float reach = dot(spot, spot);
    bend -= storm.w * spot.y / max(reach, 1.0) * exp(-reach / 40.0);
    vec2 trail = (spot - vec2(whirl.z, -1.6 * sign(storm.y))) / vec2(${real(WAKE_REACH)}, 1.0);
    churned += step(1e-3, abs(whirl.z)) * exp(-dot(trail, trail));
    if (reach < least) {
      second = least;
      least = reach;
      nearest = index;
      seat = spot;
    } else {
      second = min(second, reach);
    }
  }
  vec4 chief = vec4(0.0);
  vec4 habit = vec4(1.0, 0.0, 0.0, 0.0);
  vec4 stain = vec4(0.0);
  vec3 along = vec3(0.0);
  if (nearest >= 0) {
    chief = storms[nearest];
    habit = whirls[nearest];
    stain = stains[nearest];
    along = normalize(cross(vec3(0.0, 1.0, 0.0), chief.xyz));
  }
  float rank = sqrt(least);
  float alone = smoothstep(0.0, 0.6, 1.0 - least / second);
  float swirl = habit.y * alone * least * exp(1.0 - least);
  vec2 wind = swirl * (${real(SWIRL_TWIST)} + ${real(SWIRL_RATE)} * stream.xz);
  vec3 north = cross(chief.xyz, along);
  vec2 leanOne = vec2(cos(wind.x) * seat.x + sin(wind.x) * seat.y, cos(wind.x) * seat.y - sin(wind.x) * seat.x) - seat;
  vec2 leanTwo = vec2(cos(wind.y) * seat.x + sin(wind.y) * seat.y, cos(wind.y) * seat.y - sin(wind.y) * seat.x) - seat;
  vec3 placeOne = normalize(at + (leanOne.x * habit.x * along + leanOne.y * north) * chief.w);
  vec3 placeTwo = normalize(at + (leanTwo.x * habit.x * along + leanTwo.y * north) * chief.w);

  vec4 lanes = texture2D(bands, vec2(lane / ${real(Math.PI)} + 0.5, 0.75));
  float loose = smoothstep(0.7, 1.8, rank);
  vec2 slide = shift - (2.0 * lanes.r - 1.0) * loose * stream.xz;
  vec4 mixed = carried(spun(placeOne, slide.x)) * stream.y + carried(spun(placeTwo, slide.y)) * stream.w;

  float stir = mood.x * lanes.g * (1.0 + ${real(WAKE_GAIN)} * min(churned, 1.0)) * (1.0 + 1.2 * mixed.a);
  float label = lane + bend + stir * ${real(LIFT_RANGE)} * mixed.r;
  vec4 tone = texture2D(bands, vec2(label / ${real(Math.PI)} + 0.5, 0.25));
  vec3 cloud = tone.rgb * tone.rgb;
  cloud *= 1.0 + mood.y * (0.4 + lanes.g) * mixed.g;
  cloud = mix(cloud, sqrt(cloud), mood.z * tone.a * smoothstep(0.05, 0.3, mixed.b));

  float inside = 1.0 - smoothstep(0.92, 1.04, rank + 0.1 * mixed.g);
  float collar = smoothstep(0.7, 1.0, rank);
  vec3 dye = stain.rgb * (1.0 + 2.0 * mixed.g + 0.5 * mixed.r - 0.2 * collar - 0.12 * exp(-least / 0.15));
  cloud = mix(cloud, dye, inside * stain.a);
  float crest = exp(-pow((rank - 1.25) / 0.2, 2.0)) * smoothstep(0.1, 0.9, seat.y * sign(chief.y) / max(rank, 1e-3));
  cloud = mix(cloud, vec3(1.0), habit.w * crest * smoothstep(-0.1, 0.25, mixed.b + 0.5 * mixed.g));
  float facing = pow(max(dot(round, eye), 0.0), 0.6);
  albedo = cloud * mix(0.72, 1.0, facing);
  float vent = mix(vents, 1.0, tone.a) * (1.0 + 0.4 * mixed.g + 0.25 * mixed.b);
  emit = ember.rgb * ember.a * vent * (1.0 - 0.5 * inside * stain.a) * mix(0.45, 1.0, facing);
`;

const SOLID_STANCE = `
  float depth = bump * mix(1.0, 0.3, wet);
  vec3 charted = albedo * hillshade(at, slope, depth);

#ifdef TILED
  albedo *= mix(gritOf(), 1.0, wet);
  vec3 normal = normalize(pose * (lean + tilted(at, slope, depth) - at));
#else
  vec3 normal = normalize(pose * ((lean + tilted(at, slope, depth) - at) * bulge));
#endif`;

const SOLID_GLINT = `
  orbited += shines[0] * wet * midday * 0.3 * pow(max(dot(reflect(-sun, round), eye), 0.0), 40.0);`;

const SOLID_FOG = `
  orbited = mix(orbited, fog * (1.0 - murk) * (${real(FOG_DUSK)} * dusk + veiled), cover);
`;

const SOLID_LIMB = `
  float limb = pow(1.0 - max(dot(round, eye), 0.0), 3.0);
  orbited += haze * limb * air * rim;
  charted += haze * limb * air * 0.4;

  gl_FragColor = vec4(mix(orbited, charted, chart), 1.0);`;

const FLUID_LIMB = `
  float slant = 1.0 / max(dot(round, eye), ${real(GRAZE)}) - 1.0;
  orbited = mix(orbited, haze * (${real(FOG_DUSK)} * dusk + veiled), 1.0 - exp(-air * slant));

  gl_FragColor = vec4(orbited, 1.0);`;

export function bodyFragment(fluid: boolean): string {
  return `
${SURVEY}
uniform vec3 palette[${PALETTE_ROOM}];
uniform vec3 haze;
uniform vec3 fog;
uniform vec3 suns[${LAMP_ROOM}];
uniform vec3 shines[${LAMP_ROOM}];
uniform float dusk;
uniform float chart;
uniform float air;
uniform float drift;
uniform float squash;
uniform sampler2D grit;
uniform vec2 hoop;
uniform vec3 sunny;
uniform vec4 ember;
${fluid ? GAS_UNIFORMS : SOLID_UNIFORMS}
uniform mat4 modelMatrix;
varying vec3 vAt;
varying vec3 vPlace;
varying vec3 vLean;
${GRIT}
void main() {
  vec3 at = normalize(vAt);
  vec3 lean = normalize(vLean);
  mat3 pose = mat3(modelMatrix);
  vec3 bulge = vec3(1.0, squash, 1.0);
#ifdef TILED
  vec3 round = normalize(pose * (at * bulge));
#else
  vec3 round = normalize(pose * (lean * bulge));
#endif
  vec3 eye = normalize(cameraPosition - vPlace);
  vec3 sun = suns[0];
  vec3 emit = vec3(0.0);
  vec3 albedo;
  vec3 slope = vec3(0.0);
  float wet = 0.0;
  float cover = 0.0;
  float murk = 0.0;
  float bump = 0.0;
  float shaded = 0.0;
  ${fluid ? GAS : SOLID}
  if (hoop.y > 0.0) {
    vec3 stood = at * vec3(1.0, inversesqrt(squash), 1.0);
    float drop = -stood.y / (abs(sunny.y) < 1e-4 ? 1e-4 : sunny.y);
    float across = (length((stood + sunny * drop).xz) - hoop.x) / (hoop.y - hoop.x);
    float veil = texture2D(grit, vec2(across, 0.5)).a * step(0.0, drop) * step(0.0, across) * step(across, 1.0);
    shaded = ${real(RING_SHADE)} * veil;
  }
${fluid ? "  vec3 normal = round;" : SOLID_STANCE}
  vec3 shone = vec3(0.0);
  vec3 veiled = vec3(0.0);
  float rim = 0.0;
  float midday = 0.0;
  for (int lamp = 0; lamp < ${LAMP_ROOM}; lamp++) {
    float there = step(0.5, dot(suns[lamp], suns[lamp]));
    float high = dot(round, suns[lamp]);
    float day = smoothstep(${real(DAY_EDGE[0])}, ${real(DAY_EDGE[1])}, high) * there;
    float open = lamp == 0 ? 1.0 - shaded : 1.0;
    shone += shines[lamp] * (1.1 * clamp(dot(normal, suns[lamp]), 0.0, 1.0) * day * open);
    veiled += shines[lamp] * (${real(FOG_LIGHT)} * day * open * clamp(high + ${real(FOG_WRAP)}, 0.0, 1.0));
    rim += max(shines[lamp].r, max(shines[lamp].g, shines[lamp].b)) * (0.1 + 0.9 * day) * there;
    midday = lamp == 0 ? day : midday;
  }
  vec3 orbited = albedo * (dusk + shone);
${fluid ? "" : SOLID_GLINT}
  orbited += 1.0 - exp(-emit);
${fluid ? FLUID_LIMB : SOLID_FOG + SOLID_LIMB}
  #include <colorspace_fragment>
}
`;
}

export const STAR_FRAGMENT = `
uniform samplerCube relief;
uniform highp sampler3D granules;
uniform vec2 pitch;
uniform vec4 regions[${REGION_ROOM}];
uniform float plages[${REGION_ROOM}];
uniform vec4 spots[${SPOT_ROOM}];
uniform vec4 flash;
uniform float burst;
uniform vec4 boil;
uniform vec2 flow;
uniform vec3 tint;
uniform vec3 steep;
uniform vec3 traits;
uniform float coarse;
uniform int crowd;
varying vec3 vAt;
varying vec3 vPlace;
varying vec3 vOut;

void main() {
  vec3 at = normalize(vAt);
  vec4 wide = textureCube(relief, at);

  float least = 1e9;
  vec4 core = vec4(0.0);
  float fray = 0.0;
  float stir = 0.0;
  for (int index = 0; index < ${REGION_ROOM}; index++) {
    if (index >= crowd) {
      break;
    }
    vec4 region = regions[index];
    vec3 apart = at - region.xyz;
    float span = dot(apart, apart) / (region.w * region.w + 1e-9);
    if (span < ${real(PLAGE_REACH)}) {
      stir += plages[index] * exp(-span / ${real(PLAGE)});
    }
    if (span < 1.0) {
      vec3 first = normalize(cross(abs(region.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), region.xyz));
      vec3 second = cross(region.xyz, first);
      vec2 level = vec2(dot(apart, first), dot(apart, second));
      for (int part = 0; part < ${MEMBER_ROOM}; part++) {
        vec4 spot = spots[index * ${MEMBER_ROOM} + part];
        vec2 off = level - spot.xy;
        float reach = dot(off, off) / (spot.z * spot.z + 1e-9);
        if (reach < least) {
          least = reach;
          core = vec4(
            region.xyz * sqrt(max(1.0 - dot(spot.xy, spot.xy), 0.0)) + first * spot.x + second * spot.y,
            spot.z
          );
          fray = spot.w;
        }
      }
    }
  }
  vec3 from = at - core.xyz;
  float zoom = ${real(RAGGED)} * (1.0 + ${real(FRAY_FINE)} * fray) / (core.w + ${real(RAGGED_LEAST)});
  float ragged = textureCube(relief, normalize(core.xyz + from * zoom)).b;
  float lobe = (0.6 + 0.8 * ragged)
    * mix(1.0, ${real(FRAY_GAIN)} * smoothstep(${real(FRAY_FROM)}, ${real(FRAY_TO)}, ragged), fray);
  float rank = sqrt(least) / max(lobe, 1e-3);
  float skirt = 1.0 + ${real(PENUMBRA)}
    * smoothstep(${real(PORE)}, ${real(2 * PORE)}, core.w * (1.0 - ${real(FRAY_BARE)} * fray));
  float umbra = 1.0 - smoothstep(0.8, 1.0, rank);
  float fringe = (1.0 - smoothstep(skirt - 0.12, skirt, rank)) * (1.0 - umbra);

  float inside = max(skirt - rank, 0.0);
  vec2 squeeze = mix(
    vec2(1.0),
    (skirt - inside * (${real(FILAMENT_SQUEEZE)} + ${real(FILAMENT_FLOW)} * (flow - ${real(GRAIN_MIDDLE)})))
      / max(rank, 1e-3),
    step(rank, skirt)
  );
  float fine = mix(1.0, ${real(FILAMENT_FINE)}, step(rank, skirt));
  vec3 one = normalize(core.xyz + from * squeeze.x * fine);
  vec3 two = normalize(core.xyz + from * squeeze.y * fine);
  vec3 fore = pitch.x * (1.0 + pitch.y * (flow.x - ${real(GRAIN_MIDDLE)})) * one
    + boil.x * vec3(0.37, 0.61, 0.83);
  vec3 hind = pitch.x * (1.0 + pitch.y * (flow.y - ${real(GRAIN_MIDDLE)})) * two.yzx
    + boil.z * vec3(0.71, 0.43, 0.59);
  if (coarse > 0.0) {
    vec3 sway = vec3(wide.b, textureCube(relief, at.yzx).b, textureCube(relief, at.zxy).b) - 0.5;
    fore += ${real(COARSE_WARP)} * coarse * sway;
    hind += ${real(COARSE_WARP)} * coarse * sway.zxy;
  }
  float soft = ${real(COARSE_SOFT)} * coarse;
  float grain = (texture(granules, fore, soft).r - ${real(GRAIN_MEAN)}) * boil.y
    + (texture(granules, hind, soft).r - ${real(GRAIN_MEAN)}) * boil.w;
  if (coarse > 0.0) {
    float fine = (texture(granules, ${real(COARSE_FINE)} * fore.zxy).r - ${real(GRAIN_MEAN)}) * boil.y
      + (texture(granules, ${real(COARSE_FINE)} * hind.zxy).r - ${real(GRAIN_MEAN)}) * boil.w;
    grain += ${real(COARSE_GAIN)} * coarse * fine;
  }

  float facing = max(dot(normalize(vOut), normalize(cameraPosition - vPlace)), 0.0);
  float bright = wide.a * (0.15 + min(stir, 1.0)) * (0.25 + 0.5 * (1.0 - smoothstep(0.25, 0.9, facing)));
  float heat = 1.0 + traits.z * (at.y * at.y - 0.33)
    + traits.x * (grain * (0.35 + 0.65 * facing)
      + (0.17 + ${real(COARSE_PATCH)} * coarse) * (wide.b - 0.5) + ${real(FACULAE)} * bright);
  float chill = traits.y;
  heat = mix(heat, (0.75 + 0.25 * chill) * (1.0 + 1.6 * traits.x * grain), fringe);
  heat = mix(heat, chill * (1.0 + 0.3 * traits.x * grain), umbra);
  heat *= pow(mix(${real(LIMB_DEPTH)}, 1.0, facing), ${real(LIMB)});
  if (burst > 0.0) {
    vec3 lit = at - flash.xyz;
    float lanes = 0.2 + 0.8 * smoothstep(0.5, 0.15, wide.r);
    heat *= 1.0 + burst * lanes * exp(-dot(lit, lit) / (flash.w * flash.w + 1e-9));
  }

  vec3 glow = tint * pow(vec3(heat), steep);
  gl_FragColor = vec4(1.0 - exp(-${real(EXPOSURE)} * glow), 1.0);
  #include <colorspace_fragment>
}
`;

export const SHELL_VERTEX = `
varying vec3 vNormal;
varying vec3 vPlace;

void main() {
  vec4 placed = modelMatrix * vec4(position, 1.0);
  vPlace = placed.xyz;
  vNormal = normalize(mat3(modelMatrix) * position);
  gl_Position = projectionMatrix * viewMatrix * placed;
}
`;

export const SHELL_FRAGMENT = `
uniform vec3 haze;
uniform vec3 sun;
uniform float chart;
uniform float air;
uniform float rim;
uniform float might;
varying vec3 vNormal;
varying vec3 vPlace;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 eye = normalize(cameraPosition - vPlace);
  float graze = dot(normal, eye);
  float glow = pow(smoothstep(0.0, rim, -graze), 2.0);
  vec3 outward = normalize(normal - eye * graze);
  float day = smoothstep(-0.3, 0.4, dot(outward, sun));
  gl_FragColor = vec4(haze * glow * air * mix(might * (0.05 + 0.95 * day), 0.45, chart), 1.0);
  #include <colorspace_fragment>
}
`;

const FILLED = `
bool cornered(vec3 middle, float ball, vec2 corner) {
  vec3 ray = normalize(vec3(corner.x / projectionMatrix[0][0], corner.y / projectionMatrix[1][1], -1.0));
  float along = dot(middle, ray);
  return along > 0.0 && length(ray * along - middle) < ball;
}

bool filled(vec3 middle, float ball) {
  return cornered(middle, ball, vec2(-1.0, -1.0)) && cornered(middle, ball, vec2(1.0, -1.0))
    && cornered(middle, ball, vec2(-1.0, 1.0)) && cornered(middle, ball, vec2(1.0, 1.0));
}
`;

export const FRINGE_VERTEX = `
uniform vec3 fringe;
varying vec3 vAt;
${FILLED}
void main() {
  vAt = position;
  vec3 middle = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = filled(middle, ${real(FRINGE_CORE)} * length(modelMatrix[1].xyz) / fringe.x)
    ? vec4(2.0, 2.0, 2.0, 1.0)
    : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const FRINGE_FRAGMENT = `
uniform mat4 modelMatrix;
uniform vec3 haze;
uniform vec3 suns[${LAMP_ROOM}];
uniform vec3 shines[${LAMP_ROOM}];
uniform float dusk;
uniform float squash;
uniform vec3 eye;
uniform vec3 fringe;
varying vec3 vAt;

void main() {
  vec3 ray = normalize(vAt - eye);
  vec3 foot = eye - ray * dot(eye, ray);
  float lofty = (length(foot) * fringe.x - 1.0) / fringe.y;
  float veil = 1.0 - exp(-fringe.z * exp(-max(lofty, ${real(-FRINGE_SUNK)})));
  vec3 round = normalize(mat3(modelMatrix) * (normalize(foot) * vec3(1.0, squash, 1.0)));
  vec3 lit = vec3(0.0);
  for (int lamp = 0; lamp < ${LAMP_ROOM}; lamp++) {
    float there = step(0.5, dot(suns[lamp], suns[lamp]));
    float high = dot(round, suns[lamp]);
    float day = smoothstep(${real(DAY_EDGE[0])}, ${real(DAY_EDGE[1])}, high) * there;
    lit += shines[lamp] * (${real(FOG_LIGHT)} * day * clamp(high + ${real(FOG_WRAP)}, 0.0, 1.0));
  }
  gl_FragColor = vec4(haze * (${real(FOG_DUSK)} * dusk + lit), veil);
  #include <colorspace_fragment>
}
`;

const BELL = `
float above(float height) {
  return 0.3989423 * exp(-0.5 * height * height)
    / (0.6565 * height + 0.3435 * sqrt(height * height + 5.3954372));
}

float between(float low, float lowTail, float high, float highTail) {
  return low * high < 0.0 ? 1.0 - lowTail - highTail : abs(lowTail - highTail);
}

float spread(float low, float lowTail, float high, float highTail) {
  float wide = abs(high - low);
  float middle = 0.5 * (low + high);
  return wide > 0.02
    ? between(low, lowTail, high, highTail) / wide
    : 0.3989423 * exp(-0.5 * middle * middle);
}
`;

export const SLAB = `
${BELL}
float strip(float before, float beforeLit, float after, float afterLit, float through, float gone) {
  float turn = after - before + through;
  return abs(turn) < 1e-3
    ? through * beforeLit * (1.0 - 0.5 * turn)
    : through * (beforeLit - afterLit * gone) / turn;
}

float glint(float lean, float cosine) {
  float wide = 1.0 + lean * lean - 2.0 * lean * cosine;
  return (1.0 - lean * lean) / (wide * sqrt(wide));
}
`;

export const RING_VERTEX = `
varying vec3 vSpot;
varying vec3 vPlace;

void main() {
  vSpot = position;
  vec4 placed = modelMatrix * vec4(position, 1.0);
  vPlace = placed.xyz;
  gl_Position = projectionMatrix * viewMatrix * placed;
}
`;

export const RING_FRAGMENT = `
uniform sampler2D grit;
uniform vec2 hoop;
uniform vec3 sunny;
uniform vec3 shine;
uniform vec3 inner;
uniform float squash;
uniform mat4 modelMatrix;
varying vec3 vSpot;
varying vec3 vPlace;
${SLAB}
void main() {
  float across = (length(vSpot.xz) - hoop.x) / (hoop.y - hoop.x);
  vec4 dust = texture2D(grit, vec2(across, 0.5));
  float dense = dust.a * step(0.0, across) * step(across, 1.0);
  vec3 stretch = vec3(1.0, sqrt(squash), 1.0);
  vec3 from = vSpot * stretch;
  vec3 ray = normalize(sunny * stretch);
  float ahead = dot(from, ray);
  float lit = max(step(0.0, ahead), smoothstep(0.97, 1.03, length(from - ray * ahead)));
  vec3 eye = normalize((cameraPosition - vPlace) * mat3(modelMatrix));
  vec3 sun = normalize(sunny);
  float seen = dense / max(abs(eye.y), ${real(RING_SLANT)});
  float sunk = dense / max(abs(sun.y), ${real(RING_SLANT)});
  float gone = exp(-seen);
  float dark = exp(-sunk);
  float sent = eye.y * sun.y > 0.0
    ? strip(0.0, 1.0, sunk, dark, seen, gone)
    : strip(sunk, dark, 0.0, 1.0, seen, gone);
  float turned = dot(eye, sun);
  float phase = acos(clamp(turned, -1.0, 1.0));
  float back = 0.8488264 * (sin(phase) + (3.1415927 - phase) * turned);
  float glow = ${real(RING_GAIN / 4)} * sent * mix(back, glint(${real(RING_DUST[1])}, -turned), ${real(RING_DUST[0])});
  float near = length(vSpot.xz);
  float middle = 0.5 * (hoop.x + hoop.y);
  float veil = 1.0 - gone;
  vec3 lamp = shine * (0.02 * veil + lit * glow)
    + inner * pow(middle / near, 3.0) * (0.35 + 0.65 * dense) * veil;
  gl_FragColor = vec4(dust.rgb * dust.rgb * lamp, veil);
  #include <colorspace_fragment>
}
`;

export const FLARE_VERTEX = `
uniform vec4 screens[${SCREEN_ROOM}];
uniform float suns[${SCREEN_ROOM}];
uniform float reach;
uniform float girth;
varying vec3 vSight;
varying vec3 vMiddle;
${FILLED}
void main() {
  vec4 placed = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vMiddle = placed.xyz;
  if (length(vMiddle) < ${real(HALO_WRAP)} * reach) {
    vSight = vec3(position.x / projectionMatrix[0][0], position.y / projectionMatrix[1][1], -1.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
  } else {
    placed.xy += position.xy * reach * ${real(HALO_SHEET)};
    vSight = placed.xyz;
    gl_Position = projectionMatrix * placed;
  }
  bool buried = filled(vMiddle, ${real(HALO_CORE)} * girth);
  for (int index = 0; index < ${SCREEN_ROOM}; index++) {
    vec4 screen = screens[index];
    buried = buried && (screen.w <= 0.0 || suns[index] > 0.5
      || distance(screen.xyz, 0.5 * vMiddle) >= 0.5 * length(vMiddle) + screen.w);
  }
  if (buried) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
}
`;

export const FLARE_FRAGMENT = `
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform samplerCube relief;
uniform vec4 screens[${SCREEN_ROOM}];
uniform vec4 poles[${SCREEN_ROOM}];
uniform float suns[${SCREEN_ROOM}];
uniform vec3 rim;
uniform float reach;
uniform float girth;
uniform float fuzz;
varying vec3 vSight;
varying vec3 vMiddle;

float glared(float miss, float ball, float span) {
  float rise = max(miss / ball - 1.0, 0.0);
  return (${real(HALO_RIM)} * exp(-rise / 0.04) + ${real(HALO_WIDE)} / (1.0 + 12.0 * rise * rise))
    * (1.0 - smoothstep(0.6, 1.0, miss / span));
}

float unveiled(float along, float miss, float ball, float nearest) {
  float soft = ${real(HALO_SOFT)} * ball + max(miss - ball, 0.0);
  float before = 0.5 - 0.5 * along / length(vec2(along, soft));
  float until = nearest > 0.0
    ? 0.5 + 0.5 * (nearest - along) / length(vec2(nearest - along, soft))
    : 1.0;
  return max(until - before, 0.0);
}

void main() {
  vec3 ray = normalize(vSight);
  float along = dot(vMiddle, ray);
  vec3 aside = ray * along - vMiddle;
  float miss = length(aside);
  float blur = fwidth(miss);
  if (miss >= reach) {
    discard;
  }
  float rise = max(miss / girth - 1.0, 0.0);
  float nearest = 0.0;
  float blaze = 0.0;
  float past = 0.0;
  for (int index = 0; index < ${SCREEN_ROOM}; index++) {
    vec4 screen = screens[index];
    if (screen.w <= 0.0) {
      break;
    }
    vec4 pole = poles[index];
    vec3 aim = ray + pole.w * dot(ray, pole.xyz) * pole.xyz;
    vec3 heart = screen.xyz + pole.w * dot(screen.xyz, pole.xyz) * pole.xyz;
    float steep = dot(aim, aim);
    float toward = dot(aim, heart);
    float inside = toward * toward - steep * (dot(heart, heart) - screen.w * screen.w);
    float entry = (toward - sqrt(max(inside, 0.0))) / steep;
    if (inside > 0.0 && entry > 0.0) {
      if (suns[index] > 0.5) {
        if (blaze <= 0.0 || entry < blaze) {
          blaze = entry;
          past = 2.0 * toward / steep - entry;
        }
      } else {
        nearest = nearest > 0.0 ? min(nearest, entry) : entry;
      }
    }
  }
  if (along > 0.0
    && miss + ${real(HALO_EDGE)} * blur < ${real(HALO_CORE)} * girth
    && (nearest <= 0.0 || nearest > along)) {
    discard;
  } else {
    float rest = max(along + girth, 1e-3);
    if (nearest > 0.0) {
      rest = nearest * 0.999;
    }
    if (blaze > 0.0 && (nearest <= 0.0 || blaze < nearest)) {
      rest = max(rest, past * 1.001);
    }
    vec4 clip = projectionMatrix * vec4(ray * rest, 1.0);
    gl_FragDepth = 0.5 + 0.5 * clip.z / clip.w;
    float bare = unveiled(along, miss, girth, nearest);
    float mine = glared(miss, girth, reach) * bare;
    float total = mine;
    float room = 1.0 - mine / ${real(HALO_PEAK)};
    for (int index = 0; index < ${SCREEN_ROOM}; index++) {
      vec4 screen = screens[index];
      if (screen.w <= 0.0) {
        break;
      }
      if (suns[index] > 0.5) {
        float ahead = dot(screen.xyz, ray);
        float wide = length(ray * ahead - screen.xyz);
        float theirs = glared(wide, screen.w, screen.w * reach / girth)
          * unveiled(ahead, wide, screen.w, nearest);
        total += theirs;
        room *= 1.0 - theirs / ${real(HALO_PEAK)};
      }
    }
    float blades = 0.0;
    if (rise < ${real(FUZZ_REACH)}) {
      mat3 turn = mat3(modelViewMatrix);
      vec3 eye = normalize(-vMiddle) * turn;
      vec3 outward = aside * turn;
      vec3 limb = normalize(outward - dot(outward, eye) * eye);
      blades = fuzz * exp(-rise / (${real(FUZZ_RISE)} * (0.4 + 1.2 * textureLod(relief, limb, 2.0).r)));
    }
    vec3 lit = rim * ${real(HALO_PEAK)} * (1.0 - room)
      + ${HYDROGEN} * blades * ${real(FUZZ_GLOW)} * (0.15 + 0.5 * rim.r) * bare;
    gl_FragColor = vec4(lit, 1.0);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= mine / max(total, 1e-6);
  }
}
`;

export const PROMINENCE_VERTEX = `
uniform vec4 seats[${PROMINENCE_ROOM}];
uniform vec4 leans[${PROMINENCE_ROOM}];
uniform vec4 forms[${PROMINENCE_ROOM}];
varying vec2 vPart;
varying vec4 vForm;
varying vec4 vSeat;
varying vec4 vLean;
varying vec3 vPlace;
varying float vLane;
${FILLED}
void main() {
  int slot = int(position.z + 0.01);
  vec4 seat = seats[slot];
  vec4 lean = leans[slot];
  vec4 form = forms[slot];
  vLane = floor(4.0 * fract(position.z) + 0.5) - 1.0;
  float angle = position.x * seat.w;
  vec3 aside = cross(seat.xyz, lean.xyz);
  float wave = ${real(Math.PI * SWAY_WAVES)} / seat.w;
  float swing = wave * angle + dot(seat.xyz, vec3(12.9, 78.2, 37.7)) + 2.1 * vLane;
  float sway = min(${real(SWAY)} * lean.w, ${real(SWAY_STEEP)} / wave);
  vec3 foot = normalize(
    seat.xyz * cos(angle) + lean.xyz * sin(angle)
      + aside * (${real(THICK)} * lean.w * vLane + sway * sin(swing))
  );
  float lift = form.w * (1.0 - position.x * position.x);
  vec4 placed = modelMatrix * vec4(foot * (1.0 + lift + position.y * lean.w * (1.0 + 4.0 * form.w)), 1.0);
  vPart = position.xy;
  vForm = form;
  vSeat = seat;
  vLean = lean;
  vPlace = placed.xyz;

  gl_Position = form.x > 0.0
    && !filled((viewMatrix * modelMatrix[3]).xyz, ${real(HALO_CORE)} * length(modelMatrix[0].xyz))
    ? projectionMatrix * viewMatrix * placed
    : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

export const PROMINENCE_FRAGMENT = `
uniform samplerCube relief;
uniform mat4 modelMatrix;
uniform vec4 screens[${SCREEN_ROOM}];
uniform float suns[${SCREEN_ROOM}];
uniform vec3 tint;
uniform float drift;
varying vec2 vPart;
varying vec4 vForm;
varying vec4 vSeat;
varying vec4 vLean;
varying vec3 vPlace;
varying float vLane;

void main() {
  vec3 heart = modelMatrix[3].xyz;
  float girth = length(modelMatrix[0].xyz);
  vec3 ray = normalize(vPlace - cameraPosition);
  vec3 toward = heart - cameraPosition;
  float miss = length(toward - ray * dot(toward, ray));
  if (miss <= ${real(PROMINENCE_CLEAR[0])} * girth) {
    discard;
  }
  vec3 aside = cross(vSeat.xyz, vLean.xyz);
  float along = vPart.x * vSeat.w;
  float shift = drift + 0.07 * vLane;
  float lumps = textureCube(relief, normalize(vSeat.xyz + vLean.xyz * (along * ${real(LUMPS)}) + aside * shift)).b;
  float crown = pow(max(1.0 - vPart.x * vPart.x, 0.0), 0.35) * clamp(0.55 + 1.8 * (lumps - 0.5), 0.15, 1.0);
  float arch = pow(abs(sin(1.5708 * vForm.y * (vPart.x + 1.0))), 0.7);
  float base = vForm.z * crown * arch * step(0.5, vForm.y);
  float body = smoothstep(base - 0.06, base + 0.06, vPart.y) * (1.0 - smoothstep(0.75 * crown, crown, vPart.y));
  float threads = textureCube(relief, normalize(
    vSeat.xyz + vLean.xyz * (along * ${real(THREADS)}) + aside * (vPart.y * vLean.w * ${real(THREAD_RISE)} + shift)
  )).r;

  float clear = smoothstep(${real(PROMINENCE_CLEAR[0])} * girth, ${real(PROMINENCE_CLEAR[1])} * girth, miss);
  vec3 sight = mat3(viewMatrix) * ray;
  float sky = 1.0;
  for (int index = 0; index < ${SCREEN_ROOM}; index++) {
    vec4 screen = screens[index];
    if (screen.w <= 0.0) {
      break;
    }
    float ahead = dot(screen.xyz, sight);
    if (suns[index] > 0.5 && ahead > 0.0) {
      sky *= smoothstep(screen.w, 1.004 * screen.w, length(screen.xyz - sight * ahead));
    }
  }

  float dense = vForm.x * body * (0.15 + 0.85 * smoothstep(0.15, 0.8, threads)) * clear;
  float thick = 1.0 - exp(-${real(PROMINENCE_DEPTH)} * dense);
  gl_FragColor = vec4(
    tint * mix(${real(PROMINENCE_DUSK)}, 1.0, sky),
    thick * mix(${real(PROMINENCE_SHADE)}, 1.0, sky)
  );
  #include <colorspace_fragment>
}
`;

export const LENS_ROOM = 4;
const LENS_GAIN = 3;
const LENS_MOST = 3.1;

export const SKY_VERTEX = `
attribute vec3 shade;
uniform vec4 lenses[${LENS_ROOM}];
uniform float size;
uniform int echo;
varying vec3 vShade;

void main() {
  vec3 ray = normalize(position);
  float gain = 1.0;
  for (int index = 0; index < ${LENS_ROOM}; index++) {
    vec4 lens = lenses[index];
    if (lens.w > 0.0) {
      float along = clamp(dot(ray, lens.xyz), -1.0, 1.0);
      float off = acos(along);
      float root = sqrt(off * off + 4.0 * lens.w);
      float turned = index == echo ? -1.0 : 1.0;
      float bent = min(0.5 * (root + turned * off), ${real(LENS_MOST)});
      vec3 side = ray - lens.xyz * along;
      ray = lens.xyz * cos(bent) + turned * side / max(length(side), 1e-6) * sin(bent);
      float both = (off * off + 2.0 * lens.w) / max(2.0 * off * root, 1e-6);
      gain *= min(both + 0.5 * turned, ${real(LENS_GAIN)});
    }
  }
  vShade = shade * gain;
  gl_PointSize = size;
  gl_Position = echo >= 0 && lenses[max(echo, 0)].w <= 0.0
    ? vec4(2.0, 2.0, 2.0, 1.0)
    : projectionMatrix * modelViewMatrix * vec4(ray, 1.0);
}
`;

export const SKY_FRAGMENT = `
varying vec3 vShade;

void main() {
  gl_FragColor = vec4(vShade, 1.0);
  #include <colorspace_fragment>
}
`;

export const SPECK_VERTEX = `
attribute vec3 tone;
attribute vec3 ember;
attribute vec3 lamp;
attribute vec4 shine;
attribute float girth;
uniform float scale;
uniform float least;
varying vec3 vTone;
varying vec3 vEmber;
varying vec4 vShine;
varying vec3 vSun;
varying float vAid;

void main() {
  vec4 placed = modelViewMatrix * vec4(position, 1.0);
  vSun = normalize(mat3(modelViewMatrix) * (lamp - position) + vec3(0.0, 0.0, 1e-6));
  vTone = tone;
  vEmber = ember;
  vShine = shine;
  float wide = 2.0 * girth * scale / max(-placed.z, 1e-3);
  vAid = 1.0 - smoothstep(least, 2.0 * least, wide);
  gl_PointSize = max(wide, least);
  gl_Position = girth > 0.0 ? projectionMatrix * placed : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

export const SPECK_FRAGMENT = `
varying vec3 vTone;
varying vec3 vEmber;
varying vec4 vShine;
varying vec3 vSun;
varying float vAid;

void main() {
  vec2 spot = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) * 2.0 - 1.0;
  float reach = dot(spot, spot);
  if (reach > 1.0) discard;
  vec3 normal = vec3(spot, sqrt(1.0 - reach));
  float facing = dot(normal, vSun);
  float lit = smoothstep(-0.15, 0.25, facing) * clamp(facing, 0.0, 1.0);
  vec3 shaded = vTone * (vShine.a + 1.1 * lit * vShine.rgb);
  gl_FragColor = vec4(mix(shaded, 0.7 * vTone * vShine.rgb, vAid) + 1.0 - exp(-vEmber), 1.0);
  #include <colorspace_fragment>
}
`;

export const SHROUD_STEPS = 10;

const SHROUD = `
${BELL}
uniform sampler2D lanes;
uniform vec2 span;
uniform vec3 hull;
uniform vec3 eye;
uniform mat4 into;
uniform float veiled;

float passing(vec3 spot) {
  if (veiled < 0.5) {
    return 1.0;
  }
  vec3 at = (into * vec4(spot, 1.0)).xyz;
  vec3 toward = eye - at;
  float whole = length(toward);
  vec3 ray = toward / max(whole, 1e-12);
  float first = 0.0;
  float most = whole;
  if (abs(ray.y) > 1e-9) {
    float one = (hull.y - at.y) / ray.y;
    float two = (-hull.y - at.y) / ray.y;
    first = clamp(min(one, two), 0.0, whole);
    most = clamp(max(one, two), 0.0, whole);
  }
  if (most <= first) {
    return 1.0;
  }
  float depth = 0.0;
  float past = first;
  for (int pace = 1; pace <= ${SHROUD_STEPS}; pace++) {
    float share = float(pace) / ${real(SHROUD_STEPS)};
    float next = first + (most - first) * share * share;
    vec3 here = at + 0.5 * (past + next) * ray;
    float reach = length(here.xz);
    float along = clamp(log(max(reach, 1e-12) / span.x) / log(span.y / span.x), 0.0, 1.0);
    vec4 lane = textureLod(lanes, vec2((0.5 + ${real(HAZE_COLUMNS - 1)} * along) / ${real(HAZE_COLUMNS)}, 0.5), 0.0);
    float stand = max(exp(lane.g) * reach, 1e-12);
    float low = (at.y + past * ray.y) / stand;
    float high = (at.y + next * ray.y) / stand;
    depth += exp(lane.r) * spread(low, above(abs(low)), high, above(abs(high))) * (next - past) / stand;
    past = next;
  }
  return exp(-depth);
}
`;

const BELT_PLACED = `
  vec4 placed = modelViewMatrix * vec4(at, 1.0);
  float size = dense * (1.0 + grain * grain);
  float wide = scale / max(-placed.z, 1e-3);
  float kept = ${real(BELT_COVER)} * room * wide * wide / (size * size);
  vGlint = 0.22 + 0.45 * grain;
  vClear = passing(at);
  gl_PointSize = size;
  gl_Position = grain + kept < 1.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * placed;
`;

export const BELT_VERTEX = `
attribute float grain;
uniform float tick;
uniform float year;
uniform float middle;
uniform float dense;
uniform float scale;
uniform float room;
varying float vGlint;
varying float vClear;
${SHROUD}
void main() {
  float turn = position.y + 6.2831853 * tick / (year * pow(position.x / middle, 1.5));
  vec3 at = position.x * vec3(cos(turn), position.z * sin(turn + 40.0 * grain), sin(turn));
  ${BELT_PLACED}
}
`;

export const SWARM_TURN = (1.5 * TIME_POWER) / ORBIT_POWER;
export const SWARM_CAMP = Math.PI / 3;

export const SWARM_VERTEX = `
attribute float grain;
attribute float camp;
uniform float tick;
uniform float year;
uniform float middle;
uniform float guide;
uniform float dense;
uniform float scale;
uniform float room;
varying float vGlint;
varying float vClear;
${SHROUD}
void main() {
  float adrift = position.y + 6.2831853 * tick / year * (pow(position.x / middle, ${real(-SWARM_TURN)}) - 1.0);
  float held = camp * (${real(SWARM_CAMP)} + position.y * (1.0 + 0.5 * sin(6.2831853 * tick / (${real(SWARM_SWAY)} * year) + 40.0 * grain)));
  float turn = guide + (camp == 0.0 ? adrift : held);
  vec3 at = position.x * vec3(cos(turn), position.z * sin(turn + 40.0 * grain), sin(turn));
  ${BELT_PLACED}
}
`;

export const BELT_FRAGMENT = `
uniform vec3 tint;
uniform vec3 shine;
varying float vGlint;
varying float vClear;

void main() {
  gl_FragColor = vec4(tint * shine * vGlint, vClear);
  #include <colorspace_fragment>
}
`;

export const JET_VERTEX = `
uniform float reach;
uniform vec2 girth;
uniform float shown;
varying float vAcross;
varying float vHigh;
varying float vClear;
${SHROUD}
void main() {
  float high = reach * position.y * position.y;
  vec3 pole = vec3(0.0, position.z, 0.0);
  vec3 spot = pole * high;
  vec4 placed = modelViewMatrix * vec4(spot, 1.0);
  vec3 along = normalize((modelViewMatrix * vec4(pole, 0.0)).xyz);
  vec3 across = cross(along, normalize(placed.xyz));
  float lean = length(across);
  placed.xyz += (lean > 1e-4 ? across / lean : vec3(0.0)) * position.x * ${real(JET_WIDE)} * (girth.x + girth.y * high);
  vAcross = position.x;
  vHigh = position.y * position.y;
  vClear = passing(spot) * shown * smoothstep(${real(JET_ASIDE[0])}, ${real(JET_ASIDE[1])}, lean);
  gl_Position = projectionMatrix * placed;
}
`;

export const JET_FRAGMENT = `
uniform float strength;
uniform float flow;
varying float vAcross;
varying float vHigh;
varying float vClear;

void main() {
  float edge = 1.0 - vAcross * vAcross;
  float core = edge * edge * exp(-0.5 * ${real(JET_WIDE * JET_WIDE)} * vAcross * vAcross);
  float first = 0.5 + 0.5 * sin(6.2831853 * ${real(JET_KNOTS[0])} * (vHigh - flow));
  float second = 0.5 + 0.5 * sin(6.2831853 * ${real(JET_KNOTS[1])} * (vHigh - 0.875 * flow) + 1.7);
  float knots = 0.3 + 0.7 * first * first * (0.4 + 0.6 * second);
  float ends = smoothstep(0.0, 0.01, vHigh) * (1.0 - smoothstep(0.55, 1.0, vHigh));
  gl_FragColor = vec4(${HYDROGEN} * ${real(JET_GLOW)} * strength * core * knots * ends * vClear, 1.0);
  #include <colorspace_fragment>
}
`;

export const HAZE_STEPS = [10, 3];

export const HAZE_VERTEX = `
varying vec3 vRay;

void main() {
  vec4 placed = modelViewMatrix * vec4(position, 1.0);
  vRay = placed.xyz * mat3(modelViewMatrix);
  gl_Position = projectionMatrix * placed;
}
`;

export const HAZE_FRAGMENT = `
uniform sampler2D lanes;
uniform sampler2D tones;
uniform sampler2D shade;
uniform vec3 eye;
uniform vec2 span;
uniform vec3 hull;
uniform float hot;
uniform int count;
uniform vec4 screens[${SCREEN_ROOM}];
uniform vec4 bubbles[${BUBBLE_ROOM}];
uniform vec3 shine;
uniform vec3 dust;
uniform vec3 frost;
uniform sampler2D spins;
uniform float pitch;
uniform vec4 arcs[${ARC_ROOM}];
uniform float lifts[${ARC_ROOM}];
uniform vec4 spirals[${SPIRAL_ROOM}];
uniform float faint;
varying vec3 vRay;
${SLAB}
float flake(vec2 cell, float seed) {
  return fract(sin(dot(cell + 19.19 * seed, vec2(127.1, 311.7))) * 43758.5453);
}

float flock(float ring, float angle, float cells, float seed) {
  vec2 at = vec2(ring, (angle / 6.2831853 + 0.5) * cells);
  vec2 cell = floor(at);
  vec2 part = at - cell;
  vec2 soft = part * part * part * (part * (6.0 * part - 15.0) + 10.0);
  float low = mod(cell.y, cells);
  float high = mod(cell.y + 1.0, cells);
  return mix(
    mix(flake(vec2(cell.x, low), seed), flake(vec2(cell.x + 1.0, low), seed), soft.x),
    mix(flake(vec2(cell.x, high), seed), flake(vec2(cell.x + 1.0, high), seed), soft.x),
    soft.y
  );
}

float wisp(float ring, float angle, float seed) {
  float found = 0.6 * flock(ring, angle, ${real(STREAK_CELLS[0])}, seed)
    + 0.4 * flock(0.57 * ring + 7.3, angle, ${real(STREAK_CELLS[1])}, seed + 11.0);
  return smoothstep(0.53, 0.8, found) - ${real(STREAK_SHADE)} * smoothstep(0.47, 0.2, found);
}

struct Probe {
  vec2 spot;
  float share;
  float thick;
  float stand;
  float lamp;
  float fine;
  float height;
  float tail;
  float shadow;
  float lit;
};

float along(float reach) {
  return clamp(log(reach / span.x) / log(span.y / span.x), 0.0, 1.0);
}

vec4 laneAt(float share) {
  return textureLod(lanes, vec2((0.5 + ${real(HAZE_COLUMNS - 1)} * share) / ${real(HAZE_COLUMNS)}, 0.5), 0.0);
}

vec4 toneAt(float share) {
  return textureLod(tones, vec2((0.5 + ${real(HAZE_COLUMNS - 1)} * share) / ${real(HAZE_COLUMNS)}, 0.5), 0.0);
}

float brimAt(float reach) {
  return exp(toneAt(along(reach)).b);
}

Probe probe(vec3 ray, float anchor, float base, float offset) {
  Probe found;
  found.spot = eye.xz + (anchor + offset) * ray.xz;
  float reach = length(found.spot);
  found.share = along(reach);
  vec4 lane = laneAt(found.share);
  found.thick = exp(lane.r);
  found.stand = exp(lane.g) * reach;
  found.lamp = lane.b;
  found.fine = lane.a;
  float lift = base + offset * ray.y;
  for (int index = 0; index < ${BUBBLE_ROOM}; index++) {
    vec4 bubble = bubbles[index];
    if (bubble.w > 0.0) {
      float apart = distance(vec3(found.spot.x, lift, found.spot.y), bubble.xyz);
      found.thick *= smoothstep(bubble.w, 2.0 * bubble.w, apart);
    }
  }
  found.height = lift / found.stand;
  float high = abs(found.height);
  found.tail = above(high);
  vec2 at = vec2(
    (0.5 + ${real(SHADE_COLUMNS - 1)} * found.share) / ${real(SHADE_COLUMNS)},
    (0.5 + ${real(SHADE_ROWS - 1)} * min(high / ${real(SHADE_REACH)}, 1.0)) / ${real(SHADE_ROWS)}
  );
  found.shadow = exp(textureLod(shade, at, 0.0).r);
  found.lit = exp(-found.shadow);
  return found;
}

void main() {
  vec3 ray = normalize(vRay);
  float level = length(ray.xz);
  float climb = abs(ray.y);
  float from = 0.0;
  float to = 1e30;
  if (climb > 1e-9) {
    float low = (-hull.y - eye.y) / ray.y;
    float high = (hull.y - eye.y) / ray.y;
    from = max(from, min(low, high));
    to = min(to, max(low, high));
  } else if (abs(eye.y) > hull.y) {
    discard;
  }
  float lean = dot(eye.xz, ray.xz);
  float aside = dot(eye.xz, eye.xz);
  if (level > 1e-6) {
    float found = lean * lean - level * level * (aside - hull.x * hull.x);
    if (found <= 0.0) {
      discard;
    }
    float root = sqrt(found);
    from = max(from, (-lean - root) / (level * level));
    to = min(to, (-lean + root) / (level * level));
  } else if (aside > hull.x * hull.x) {
    discard;
  }
  for (int index = 0; index < ${SCREEN_ROOM}; index++) {
    vec4 screen = screens[index];
    vec3 toward = eye - screen.xyz;
    float near = dot(toward, ray);
    float inside = dot(toward, toward) - screen.w * screen.w;
    float hit = near * near - inside;
    if (screen.w > 0.0 && hit > 0.0) {
      float met = -near - sqrt(hit);
      to = met > 0.0 ? min(to, met) : inside < 0.0 ? 0.0 : to;
    }
  }
  vec2 entered = eye.xz + from * ray.xz;
  vec2 left = eye.xz + to * ray.xz;
  if (to <= from || max(dot(entered, entered), dot(left, left)) <= span.x * span.x) {
    discard;
  } else {
    float anchor = from;
    float base = eye.y + from * ray.y;
    vec2 legs[3];
    legs[0] = vec2(0.0);
    legs[1] = vec2(0.0);
    legs[2] = vec2(0.0);
    if (climb > hull.z * level) {
      anchor = -eye.y / ray.y;
      base = 0.0;
      float most = hull.y / climb;
      float back = min(anchor - from, most);
      float fore = min(to - anchor, most);
      float drop = hull.z * level;
      for (int turn = 0; turn < ${HAZE_TURNS}; turn++) {
        float behind = brimAt(length(eye.xz + (anchor - back) * ray.xz));
        float ahead = brimAt(length(eye.xz + (anchor + fore) * ray.xz));
        back = min(back, (${real(HAZE_SLACK)} * behind + drop * back) / (climb + drop));
        fore = min(fore, (${real(HAZE_SLACK)} * ahead + drop * fore) / (climb + drop));
      }
      float first = max(from - anchor, -back);
      float last = min(to - anchor, fore);
      float split = clamp(0.0, first, last);
      legs[0] = vec2(first, split);
      legs[1] = vec2(split, last);
    } else {
      float whole = to - from;
      float bow = ray.y * ray.y - hull.z * hull.z * level * level;
      float tilt = eye.y * ray.y - hull.z * hull.z * lean;
      float found = tilt * tilt - bow * (eye.y * eye.y - hull.z * hull.z * aside);
      vec2 clearing = vec2(0.0);
      if (found > 0.0 && bow < -1e-12) {
        float root = sqrt(found);
        clearing = vec2((-tilt + root) / bow, (-tilt - root) / bow) - from;
      }
      float met = climb > 1e-9 ? -base / ray.y : -1.0;
      vec2 nearer = vec2(0.0, min(whole, clearing.x));
      vec2 farther = vec2(max(0.0, clearing.y), whole);
      if (met > nearer.x && met < nearer.y) {
        legs[0] = vec2(nearer.x, met);
        legs[1] = vec2(met, nearer.y);
        legs[2] = farther;
      } else if (met > farther.x && met < farther.y) {
        legs[0] = nearer;
        legs[1] = vec2(farther.x, met);
        legs[2] = vec2(met, farther.y);
      } else {
        legs[0] = nearer;
        legs[1] = farther;
      }
    }

    float nearest = level > 1e-6 ? -lean / (level * level) : anchor;
    float miss = level > 1e-6 ? sqrt(max(aside - lean * lean / (level * level), 0.0)) : sqrt(aside);
    float bend = level / max(miss, ${real(HAZE_NEAR)} * span.x);
    float clear = 1.0;
    float seen = 0.0;
    float lent = 0.0;
    float where = 0.0;
    float glow = 0.0;
    float away = 0.0;
    vec2 mean = vec2(0.0);
    for (int leg = 0; leg < 3; leg++) {
      float start = legs[leg].x;
      float end = legs[leg].y;
      if (end <= start || clear == 0.0) {
        continue;
      }
      float low = asinh((anchor + start - nearest) * bend);
      float high = asinh((anchor + end - nearest) * bend);
      bool straight = level < 1e-4 || abs(high - low) < ${real(HAZE_LONG)};
      int paces = min(count + int(${real(HAZE_ACROSS)} * abs(high - low)), ${HAZE_MOST});
      float swell = exp(low);
      float rate = exp((high - low) / float(paces));
      Probe last = probe(ray, anchor, base, start);
      float past = start;
      for (int step = 1; step <= paces; step++) {
        swell *= rate;
        float next = straight
          ? mix(start, end, float(step) / float(paces))
          : nearest + 0.5 * (swell - 1.0 / swell) / bend - anchor;
        Probe here = probe(ray, anchor, base, next);
        float through = 0.5 * (last.thick + here.thick)
          * spread(last.height, last.tail, here.height, here.tail)
          * (next - past) / (0.5 * (last.stand + here.stand));
        float gone = exp(-through);
        vec3 middle = vec3(
          last.spot + here.spot,
          last.height * last.stand + here.height * here.stand
        ).xzy;
        float sent = clear
          * (strip(last.shadow, last.lit, here.shadow, here.lit, through, gone) + ${real(HAZE_DIM)} * (1.0 - gone))
          * glint(
            mix(${real(HAZE_DUST[0])}, ${real(HAZE_DUST[1])}, 0.5 * (last.fine + here.fine)),
            -dot(normalize(middle), ray)
          );
        seen += sent;
        lent += sent * 0.5 * (last.lamp + here.lamp);
        where += sent * 0.5 * (last.share + here.share);
        away += sent * (anchor + 0.5 * (past + next));
        mean += sent * 0.5 * (last.spot + here.spot);
        if (here.share < hot) {
          glow += clear * (1.0 - gone) * toneAt(here.share).g;
        }
        clear *= gone;
        if (clear < ${real(HAZE_CLEAR)}) {
          clear = 0.0;
          break;
        }
        last = here;
        past = next;
      }
    }
    float ice = toneAt(seen > 0.0 ? where / seen : 0.0).r;
    float glare = sqrt(${real(HAZE_GAIN)} * seen);
    float shown = seen > 0.0 ? lent / seen * glare / (1.0 + glare / ${real(HAZE_MOST_LIGHT)}) : 0.0;
    if (seen > 0.0) {
      vec2 middle = mean / seen;
      float reach = max(length(middle), span.x);
      vec4 spin = textureLod(spins, vec2((0.5 + ${real(HAZE_COLUMNS - 1)} * along(reach)) / ${real(HAZE_COLUMNS)}, 0.5), 0.0);
      vec2 turned = vec2(spin.x * middle.x + spin.y * middle.y, spin.x * middle.y - spin.y * middle.x);
      float ring = log(reach / span.x) / ${real(STREAK_WIDE)};
      float angle = atan(turned.y, turned.x);
      float coarse = pitch * away / seen / (${real(STREAK_WIDE)} * reach);
      float streak = mix(
        wisp(ring, angle > 0.0 ? angle - 3.1415927 : angle + 3.1415927, spin.a),
        wisp(ring, angle, spin.b),
        0.5 - 0.5 * spin.x
      );
      vec2 aim = middle / max(length(middle), 1e-12);
      float lift = 0.0;
      for (int index = 0; index < ${ARC_ROOM}; index++) {
        vec4 arc = arcs[index];
        float off = log(reach / arc.x) / arc.y;
        lift += lifts[index] * exp(-0.5 * off * off + ${real(ARC_WIDE)} * (dot(aim, arc.zw) - 1.0));
      }
      for (int index = 0; index < ${SPIRAL_ROOM}; index++) {
        vec4 spiral = spirals[index];
        float wound = ${real(SPIRAL_TWIST)} * log(reach / spiral.x);
        vec2 arm = vec2(spiral.z * cos(wound) + spiral.w * sin(wound), spiral.w * cos(wound) - spiral.z * sin(wound));
        float facing = dot(aim, arm);
        lift += spiral.y * exp(-abs(wound) / ${real(SPIRAL_TWIST * SPIRAL_REACH)})
          * (exp(${real(SPIRAL_WIDE)} * (facing - 1.0)) + ${real(SPIRAL_SECOND)} * exp(${real(SPIRAL_WIDE)} * (-facing - 1.0)));
      }
      shown *= (1.0 + lift)
        * (1.0 + ${real(STREAK_GAIN)} * streak * (1.0 - smoothstep(${real(STREAK_FINE[0])}, ${real(STREAK_FINE[1])}, coarse)));
    }
    vec3 lamp = shine * mix(dust, frost, ice) * shown + ${HAZE_EMBER} * glow;
    gl_FragColor = vec4(sqrt(faint * lamp), faint * (1.0 - clear));
  }
}
`;

export const MIST_VERTEX = `
varying vec2 vAt;

void main() {
  vAt = 0.5 * position.xy + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const MIST_FRAGMENT = `
uniform sampler2D mist;
uniform vec2 grid;
uniform vec2 lens;
uniform vec4 screens[${SCREEN_ROOM}];
varying vec2 vAt;

int metAt(vec2 at) {
  vec3 ray = normalize(vec3((2.0 * at - 1.0) * lens, -1.0));
  int found = -1;
  float first = 1e30;
  for (int index = 0; index < ${SCREEN_ROOM}; index++) {
    vec4 screen = screens[index];
    float along = dot(screen.xyz, ray);
    float inside = dot(screen.xyz, screen.xyz) - screen.w * screen.w;
    float hit = along * along - inside;
    if (screen.w > 0.0 && hit > 0.0) {
      float met = along - sqrt(hit);
      float stop = met > 0.0 ? met : inside < 0.0 ? 0.0 : 1e30;
      if (stop < first) {
        first = stop;
        found = index;
      }
    }
  }
  return found;
}

bool rimmed(vec2 at) {
  vec3 ray = normalize(vec3((2.0 * at - 1.0) * lens, -1.0));
  float slack = ${real(MIST_RIM)} * lens.y / grid.y;
  bool found = false;
  for (int index = 0; index < ${SCREEN_ROOM}; index++) {
    vec4 screen = screens[index];
    float along = dot(screen.xyz, ray);
    float apart = dot(screen.xyz, screen.xyz);
    float aside = sqrt(max(apart - along * along, 0.0));
    found = found || (screen.w > 0.0 && along > 0.0 && abs(aside - screen.w) < slack * sqrt(apart));
  }
  return found;
}

void main() {
  vec4 found = texture2D(mist, vAt);
  if (rimmed(vAt)) {
    vec2 cell = vAt * grid - 0.5;
    vec2 base = floor(cell);
    vec2 part = cell - base;
    int mine = metAt(vAt);
    vec4 alike = vec4(0.0);
    float weight = 0.0;
    for (int corner = 0; corner < 4; corner++) {
      vec2 side = vec2(float(corner & 1), float(corner >> 1));
      vec2 at = (base + side + 0.5) / grid;
      vec2 shares = mix(1.0 - part, part, side);
      float share = shares.x * shares.y;
      if (metAt(at) == mine) {
        alike += share * texture2D(mist, at);
        weight += share;
      }
    }
    found = weight > 1e-3 ? alike / weight : found;
  }
  float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  gl_FragColor = vec4(found.rgb * found.rgb, found.a);
  #include <colorspace_fragment>
  gl_FragColor.rgb = max(gl_FragColor.rgb + grain / 255.0 * step(1e-4, found.a + found.r + found.g + found.b), 0.0);
}
`;

export const VEIL_VERTEX = `
attribute vec4 tint;
varying vec4 vTint;
varying vec3 vAt;

void main() {
  vTint = tint;
  vAt = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const VEIL_FRAGMENT = `
${SURVEY}
uniform float fade;
varying vec4 vTint;
varying vec3 vAt;

void main() {
  vec3 at = normalize(vAt);
  vec4 ground = survey(at);
  float edge = fwidth(ground.a) + 1e-4;
  float land = smoothstep(-edge, edge, ground.a);
  float shade = hillshade(at, ground.rgb, 0.07);
  gl_FragColor = vec4(vTint.rgb * shade, vTint.a * land * fade);
  #include <colorspace_fragment>
}
`;

export const WHIRL_TALL = 0.3;
const WHIRL_STEPS = 16;
const WHIRL_THICK = 0.1;
const WHIRL_VEILED = 0.06;

export const GUSH_VERTEX = `
attribute vec3 ahead;
attribute vec2 seat;
uniform vec2 girth;
varying vec2 vSeat;

void main() {
  vec4 placed = modelMatrix * vec4(position, 1.0);
  vec3 along = normalize(mat3(modelMatrix) * ahead);
  vec3 across = cross(along, normalize(cameraPosition - placed.xyz));
  float lean = length(across);
  float wide = length(modelMatrix[0].xyz) * (girth.x + girth.y * seat.y);
  placed.xyz += (lean > 1e-4 ? across / lean : vec3(0.0)) * seat.x * wide;
  vSeat = seat;
  gl_Position = projectionMatrix * viewMatrix * placed;
}
`;

export const GUSH_FRAGMENT = `
uniform vec3 tint;
uniform float flow;
uniform float might;
varying vec2 vSeat;

void main() {
  float edge = 1.0 - vSeat.x * vSeat.x;
  float knots = 0.86 + 0.14 * sin(6.2831853 * (5.0 * vSeat.y - flow));
  float ends = smoothstep(0.0, 0.02, vSeat.y) * (1.0 - smoothstep(0.78, 1.0, vSeat.y));
  gl_FragColor = vec4(tint * might * edge * edge * knots * ends, 1.0);
  #include <colorspace_fragment>
}
`;

export const WHIRL_VERTEX = `
varying vec3 vAt;

void main() {
  vAt = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const WHIRL_FRAGMENT = `
uniform vec3 eye;
uniform vec3 hot;
uniform vec3 cool;
uniform vec4 screen;
uniform vec4 spot;
uniform float inner;
uniform float heart;
uniform float turn;
uniform float might;
varying vec3 vAt;

float entry(vec3 from, vec3 ray, vec3 middle, float ball) {
  vec3 off = from - middle;
  float toward = dot(off, ray);
  float inside = toward * toward - dot(off, off) + ball * ball;
  float met = -toward - sqrt(max(inside, 0.0));
  return inside > 0.0 && met > 0.0 ? met : 1e9;
}

void main() {
  vec3 ray = normalize(vAt - eye);
  float steep = abs(ray.y) > 1e-5 ? ray.y : 1e-5;
  float low = (-${real(WHIRL_TALL)} - eye.y) / steep;
  float high = (${real(WHIRL_TALL)} - eye.y) / steep;
  float level = max(dot(ray.xz, ray.xz), 1e-9);
  float toward = dot(eye.xz, ray.xz);
  float inside = toward * toward - level * (dot(eye.xz, eye.xz) - 1.0);
  float first = max(max(min(low, high), (-toward - sqrt(max(inside, 0.0))) / level), 0.0);
  float star = entry(eye, ray, vec3(0.0), heart);
  float last = min(length(vAt - eye), min(star, entry(eye, ray, screen.xyz, screen.w)));
  if (inside <= 0.0 || last <= first) {
    discard;
  }
  float veiled = star < 1e8 ? ${real(WHIRL_VEILED)} : 1.0;
  float pace = (last - first) / ${real(WHIRL_STEPS)};
  float cold = pow(inner, 0.75);
  vec3 sum = vec3(0.0);
  for (int index = 0; index < ${WHIRL_STEPS}; index++) {
    vec3 at = eye + ray * (first + (float(index) + 0.5) * pace);
    float wide = length(at.xz);
    if (wide > inner && wide < 1.0) {
      float thick = ${real(WHIRL_THICK)} * wide * (0.5 + 0.5 * wide);
      float dense = exp(-at.y * at.y / (thick * thick));
      float rim = smoothstep(inner, 1.08 * inner, wide) * (1.0 - smoothstep(0.75, 1.0, wide));
      float warmth = pow(inner / wide, 0.75);
      vec3 hue = mix(cool, hot, clamp((warmth - cold) / max(1.0 - cold, 1e-3), 0.0, 1.0));
      float bend = atan(at.z, at.x);
      float arms = 0.78 + 0.22 * sin(2.0 * bend + 7.0 * log(wide) + turn)
        + 0.08 * sin(9.0 * bend + 23.0 * log(wide) + 2.3 * turn);
      vec2 off = at.xz - spot.xz;
      float glint = spot.w * exp(-dot(off, off) / 0.012);
      sum += (hue * (0.3 + 0.7 * pow(inner / wide, 1.2)) * arms + hot * glint) * dense * rim * pace;
    }
  }
  gl_FragColor = vec4(sum * might * veiled, 1.0);
  #include <colorspace_fragment>
}
`;

export const HUSK_VERTEX = `
varying vec3 vPlace;

void main() {
  vec4 placed = modelMatrix * vec4(position, 1.0);
  vPlace = placed.xyz;
  gl_Position = projectionMatrix * viewMatrix * placed;
}
`;

export const HUSK_FRAGMENT = `
${NOISE}
uniform mat4 modelMatrix;
uniform vec3 warm;
uniform vec3 keen;
uniform float might;
uniform float thin;
uniform uint salt;
varying vec3 vPlace;

float wisps(vec3 at) {
  return max(0.75 + 0.6 * noise(3.0 * at, salt) + 0.35 * noise(9.0 * at, salt + 7u), 0.2);
}

void main() {
  vec3 ray = normalize(vPlace - cameraPosition);
  vec3 off = cameraPosition - modelMatrix[3].xyz;
  float ball = length(modelMatrix[0].xyz);
  float toward = dot(off, ray);
  float graze = sqrt(max(1.0 - (dot(off, off) - toward * toward) / (ball * ball), 0.0));
  mat3 inward = transpose(mat3(modelMatrix));
  float lit = wisps(normalize(inward * (off + ray * (ball * graze - toward))));
  if (dot(off, off) > ball * ball) {
    lit += wisps(normalize(inward * (off - ray * (ball * graze + toward))));
  }
  float path = thin / max(graze, thin);
  vec3 hue = mix(keen, warm, smoothstep(0.15, 0.85, path));
  gl_FragColor = vec4(hue * might * pow(path, 1.8) * lit, 1.0);
  #include <colorspace_fragment>
}
`;
