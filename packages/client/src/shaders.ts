import { RELIEF_SHAPE } from "@barycenter/sim";

const real = (value: number) => (Number.isInteger(value) ? `${value}.0` : String(value));
const shape = RELIEF_SHAPE;

const FIELD = `
uniform uint seed;
uniform vec3 shape;

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
const LUMP_SCALE = 0.9;
const LUMP_SPAN = 0.06;
const LAVA_FLOOR = -0.4;
const LAVA_SPAN = 2;
const CRUST_GLOW = 0.04;
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
const PENUMBRA = 1.3;
const PORE = 0.003;
const PLAGE = 0.6;
const PLAGE_REACH = 6;
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
const HALO_SOFT = 0.25;
const HALO_RIM = 0.5;
const HALO_WIDE = 0.12;
const HALO_PEAK = HALO_RIM + HALO_WIDE;
const HALO_WRAP = 2;
const HALO_SHEET = 1.35;
const BELT_COVER = 0.12;

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

export const BODY_VERTEX = `
varying vec3 vAt;
varying vec3 vPlace;

void main() {
  vAt = position;
  vec4 placed = modelMatrix * vec4(position, 1.0);
  vPlace = placed.xyz;
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
  float height = ground.a;
  float other = survey(at.zxy).a;
  float edge = fwidth(height) + 1e-4;
  slope = ground.rgb;
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
uniform vec4 storms[${STORM_ROOM}];
uniform vec4 whirls[${STORM_ROOM}];
uniform vec4 stains[${STORM_ROOM}];
`;

const GAS = `
  float lane = asin(clamp(at.y, -1.0, 1.0));
  float bend = 0.0;
  float churned = 0.0;
  float least = 1e9;
  float second = 1e9;
  vec4 chief = vec4(0.0);
  vec4 habit = vec4(1.0, 0.0, 0.0, 0.0);
  vec4 stain = vec4(0.0);
  vec2 seat = vec2(0.0);
  vec3 along = vec3(0.0);
  for (int index = 0; index < ${STORM_ROOM}; index++) {
    vec4 storm = storms[index];
    vec4 whirl = whirls[index];
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), storm.xyz));
    vec3 from = at - storm.xyz;
    vec2 spot = vec2(dot(from, east) / whirl.x, dot(from, cross(storm.xyz, east))) / (storm.w + 1e-6);
    float reach = dot(spot, spot);
    bend -= storm.w * spot.y / max(reach, 1.0) * exp(-reach / 40.0);
    vec2 trail = (spot - vec2(whirl.z, -1.6 * sign(storm.y))) / vec2(${real(WAKE_REACH)}, 1.0);
    churned += step(1e-3, abs(whirl.z)) * exp(-dot(trail, trail));
    if (reach < least) {
      second = least;
      least = reach;
      chief = storm;
      habit = whirl;
      stain = stains[index];
      seat = spot;
      along = east;
    } else {
      second = min(second, reach);
    }
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

void main() {
  vec3 at = normalize(vAt);
  vec3 lean = normalize(vLean);
  mat3 pose = mat3(modelMatrix);
  vec3 bulge = vec3(1.0, squash, 1.0);
  vec3 round = normalize(pose * (lean * bulge));
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
  float depth = bump * mix(1.0, 0.3, wet);
  vec3 charted = albedo * hillshade(at, slope, depth);

  vec3 normal = normalize(pose * ((lean + tilted(at, slope, depth) - at) * bulge));
  vec3 shone = vec3(0.0);
  vec3 veiled = vec3(0.0);
  float rim = 0.0;
  float midday = 0.0;
  for (int lamp = 0; lamp < ${LAMP_ROOM}; lamp++) {
    float there = step(0.5, dot(suns[lamp], suns[lamp]));
    float high = dot(round, suns[lamp]);
    float day = smoothstep(-0.15, 0.25, high) * there;
    float open = lamp == 0 ? 1.0 - shaded : 1.0;
    shone += shines[lamp] * (1.1 * clamp(dot(normal, suns[lamp]), 0.0, 1.0) * day * open);
    veiled += shines[lamp] * (0.95 * day * open * clamp(high + 0.25, 0.0, 1.0));
    rim += max(shines[lamp].r, max(shines[lamp].g, shines[lamp].b)) * (0.1 + 0.9 * day) * there;
    midday = lamp == 0 ? day : midday;
  }
  vec3 orbited = albedo * (dusk + shone);
  orbited += shines[0] * wet * midday * 0.3 * pow(max(dot(reflect(-sun, round), eye), 0.0), 40.0);
  orbited += 1.0 - exp(-emit);
  orbited = mix(orbited, fog * (1.0 - murk) * (1.2 * dusk + veiled), cover);

  float limb = pow(1.0 - max(dot(round, eye), 0.0), 3.0);
  orbited += haze * limb * air * rim;
  charted += haze * limb * air * 0.4;

  gl_FragColor = vec4(mix(orbited, charted, chart), 1.0);
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
uniform mat4 modelMatrix;
varying vec3 vAt;
varying vec3 vPlace;

void main() {
  vec3 at = normalize(vAt);
  vec4 wide = textureCube(relief, at);

  float least = 1e9;
  vec4 core = vec4(0.0);
  float fray = 0.0;
  float stir = 0.0;
  for (int index = 0; index < ${REGION_ROOM}; index++) {
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
  float grain = (texture(granules, fore).r - ${real(GRAIN_MEAN)}) * boil.y
    + (texture(granules, hind).r - ${real(GRAIN_MEAN)}) * boil.w;

  vec3 round = normalize(mat3(modelMatrix) * at);
  float facing = max(dot(round, normalize(cameraPosition - vPlace)), 0.0);
  float bright = wide.a * (0.15 + min(stir, 1.0)) * (0.25 + 0.5 * (1.0 - smoothstep(0.25, 0.9, facing)));
  float heat = 1.0 + traits.z * (at.y * at.y - 0.33)
    + traits.x * (grain * (0.35 + 0.65 * facing) + 0.17 * (wide.b - 0.5) + ${real(FACULAE)} * bright);
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
  float through = 1.0 - pow(1.0 - 0.97 * dense, 1.0 / max(abs(eye.y), 0.12));
  float facing = step(0.0, eye.y * sunny.y);
  float glow = mix(2.5 * dense * (1.0 - dense), 0.6 + 0.5 * dense, facing)
    * (0.4 + 0.6 * smoothstep(0.0, 0.3, abs(sunny.y)));
  float near = length(vSpot.xz);
  float middle = 0.5 * (hoop.x + hoop.y);
  vec3 lamp = shine * (0.02 + lit * glow) + inner * pow(middle / near, 3.0) * (0.35 + 0.65 * dense);
  gl_FragColor = vec4(dust.rgb * dust.rgb * lamp, through);
  #include <colorspace_fragment>
}
`;

export const FLARE_VERTEX = `
uniform float reach;
varying vec3 vSight;
varying vec3 vMiddle;

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

  gl_Position = form.x > 0.0 ? projectionMatrix * viewMatrix * placed : vec4(2.0, 2.0, 2.0, 1.0);
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

  vec3 heart = modelMatrix[3].xyz;
  float girth = length(modelMatrix[0].xyz);
  vec3 ray = normalize(vPlace - cameraPosition);
  vec3 toward = heart - cameraPosition;
  float miss = length(toward - ray * dot(toward, ray));
  float clear = smoothstep(0.996 * girth, 1.002 * girth, miss);
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

export const BELT_VERTEX = `
attribute float grain;
uniform float tick;
uniform float year;
uniform float middle;
uniform float dense;
uniform float scale;
uniform float room;
varying float vGlint;

void main() {
  float turn = position.y + 6.2831853 * tick / (year * pow(position.x / middle, 1.5));
  vec3 at = position.x * vec3(cos(turn), position.z * sin(turn + 40.0 * grain), sin(turn));
  vec4 placed = modelViewMatrix * vec4(at, 1.0);
  float size = dense * (1.0 + grain * grain);
  float span = scale / max(-placed.z, 1e-3);
  float kept = ${real(BELT_COVER)} * room * span * span / (size * size);
  vGlint = 0.22 + 0.45 * grain;
  gl_PointSize = size;
  gl_Position = grain + kept < 1.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * placed;
}
`;

export const BELT_FRAGMENT = `
uniform vec3 tint;
uniform vec3 shine;
varying float vGlint;

void main() {
  gl_FragColor = vec4(tint * shine * vGlint, 1.0);
  #include <colorspace_fragment>
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
