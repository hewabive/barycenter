import { type BodyKind, RELIEF_SHAPE } from "@barycenter/sim";

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

const GRAIN_MEAN = 0.52;
const GRAIN_SCALE = 36;
const NET_SCALE = 9;
const FILAMENT_SQUEEZE = 0.2;
const FILAMENT_FLOW = 0.25;
const PENUMBRA = 1.3;
const PORE = 0.012;
const PLAGE = 24;
const RAGGED = 0.3;
const FACULAE = 1.2;
const ARCH_SPAN = 3;
const ARCH_RISE = 1.8;
const ARCH_CAP = 0.04;

export const STORM_ROOM = 8;
export const SPOT_ROOM = 16;
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

export const STAR_BAKE_FRAGMENT = `
${FIELD}
${HEADING}

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
        uint mixed = scramble(base + step, salt);
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

float granules(vec3 at, uint salt) {
  vec3 found = nearest(at, salt);
  return (1.0 - exp(-7.0 * (found.y - found.x))) * (0.7 + 0.3 * found.z);
}

void main() {
  vec3 at = normalize(heading());
  vec3 net = nearest(at * ${real(NET_SCALE)}, seed + 31u);
  gl_FragColor = vec4(
    granules(at * ${real(GRAIN_SCALE)}, seed + 11u),
    granules(at * ${real(GRAIN_SCALE)}, seed + 23u),
    clamp(0.5 + 0.45 * layered(at * 3.0, seed + 5u, 4), 0.0, 1.0),
    1.0 - smoothstep(0.0, 0.1, net.y - net.x)
  );
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

const SKINS: Record<Exclude<BodyKind, "star" | "gas">, string> = {
  terran: `
  float rise = height / span;
  float cold = smoothstep(0.88, 0.97, abs(at.y) + 0.06 * rise + 0.05 * other);
  vec3 land = mix(palette[2], palette[3], smoothstep(0.0, 0.45, rise));
  float arid = smoothstep(0.0, 0.5, other) * (1.0 - smoothstep(0.5, 0.75, abs(at.y)));
  land = mix(land, palette[7], 0.75 * arid * (1.0 - smoothstep(0.5, 1.0, rise)));
  land = mix(land, palette[4], smoothstep(0.45, 1.0, rise));
  land = mix(land, palette[5], smoothstep(0.95, 1.5, rise));
  land = mix(land, palette[6], max(cold, smoothstep(1.5, 2.2, rise)));
  vec3 water = mix(palette[1], palette[0], smoothstep(0.0, 0.22, -height));
  water = mix(water, palette[6] * 0.9, cold * 0.9);
  wet = 1.0 - smoothstep(-edge, edge, height);
  albedo = mix(land, water, wet);
  bump = 0.07;
  if (chart < 0.999) {
    vec4 high = survey(spun(at, drift).yzx);
    vec3 back = spun(at, -2.0 * drift);
    vec4 low = survey(vec3(-back.z, back.x, -back.y));
    float belt = 0.2 * cos(at.y * 5.2) - 0.08;
    float mass = high.a + 0.6 * low.a + 0.02 * (high.r + low.g) + belt;
    cover = 0.9 * smoothstep(0.2, 1.0, mass);
  }
`,
  desert: `
  float rise = height * 1.2 + 0.5;
  vec3 land = mix(palette[0], palette[1], smoothstep(0.0, 0.5, rise));
  land = mix(land, palette[2], smoothstep(0.45, 1.0, rise));
  land = mix(land, palette[3], smoothstep(1.0, 1.6, rise));
  float cold = smoothstep(0.86, 0.95, abs(at.y) + 0.05 * other);
  albedo = mix(land, palette[6], cold);
  bump = 0.08;
`,
  barren: `
  float rise = height + 0.5;
  vec3 land = mix(palette[0], palette[1], smoothstep(0.0, 1.0, rise));
  land = mix(land, palette[2], smoothstep(1.0, 1.6, rise));
  albedo = land * (1.0 - 0.3 * smoothstep(0.1, 0.4, other));
  bump = 0.1;
`,
  ice: `
  float rise = height + 0.5;
  vec3 land = mix(palette[0], palette[1], smoothstep(-0.2, 0.9, rise));
  float crack = smoothstep(5.0, 11.0, length(ground.rgb));
  albedo = mix(land, palette[2], crack * 0.45);
  bump = 0.035;
`,
};

function solid(skin: string): string {
  return `
  vec4 ground = survey(at);
  float height = ground.a;
  float other = survey(at.zxy).a;
  float edge = fwidth(height) + 1e-4;
  slope = ground.rgb;
  ${skin}
`;
}

const GAS_UNIFORMS = `
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
  albedo = cloud * mix(0.72, 1.0, pow(max(dot(round, eye), 0.0), 0.6));
`;

export function bodyFragment(kind: Exclude<BodyKind, "star">): string {
  return `
${SURVEY}
uniform vec3 palette[8];
uniform vec3 haze;
uniform vec3 sun;
uniform float chart;
uniform float span;
uniform float air;
uniform float drift;
uniform float squash;
uniform vec3 shine;
${kind === "gas" ? GAS_UNIFORMS : ""}
uniform mat4 modelMatrix;
varying vec3 vAt;
varying vec3 vPlace;

void main() {
  vec3 at = normalize(vAt);
  mat3 pose = mat3(modelMatrix);
  vec3 bulge = vec3(1.0, squash, 1.0);
  vec3 round = normalize(pose * (at * bulge));
  vec3 eye = normalize(cameraPosition - vPlace);
  vec3 albedo;
  vec3 slope = vec3(0.0);
  float wet = 0.0;
  float cover = 0.0;
  float bump = 0.0;
  ${kind === "gas" ? GAS : solid(SKINS[kind])}
  float depth = bump * mix(1.0, 0.3, wet);
  vec3 charted = albedo * hillshade(at, slope, depth);

  vec3 normal = normalize(pose * (tilted(at, slope, depth) * bulge));
  float day = smoothstep(-0.15, 0.25, dot(round, sun));
  float direct = clamp(dot(normal, sun), 0.0, 1.0);
  vec3 orbited = albedo * (0.025 + 1.1 * direct * day * shine);
  orbited += shine * wet * day * 0.3 * pow(max(dot(reflect(-sun, round), eye), 0.0), 40.0);
  orbited = mix(
    orbited,
    0.03 + 0.95 * shine * day * clamp(dot(round, sun) + 0.25, 0.0, 1.0),
    cover
  );

  float limb = pow(1.0 - max(dot(round, eye), 0.0), 3.0);
  orbited += haze * limb * air * (0.1 + 0.9 * day);
  charted += haze * limb * air * 0.4;

  gl_FragColor = vec4(mix(orbited, charted, chart), 1.0);
  #include <colorspace_fragment>
}
`;
}

export const STAR_FRAGMENT = `
${SPIN}
uniform samplerCube relief;
uniform vec4 spots[${SPOT_ROOM}];
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
  float stir = 0.0;
  for (int index = 0; index < ${SPOT_ROOM}; index++) {
    vec4 spot = spots[index];
    vec3 from = at - spot.xyz;
    float reach = dot(from, from) / (spot.w * spot.w + 1e-9);
    stir += exp(-reach / ${real(PLAGE)});
    if (reach < least) {
      least = reach;
      core = spot;
    }
  }
  vec3 from = at - core.xyz;
  float ragged = textureCube(relief, normalize(core.xyz + from * ${real(RAGGED)} / (core.w + 0.01))).b;
  float rank = sqrt(least) / (0.6 + 0.8 * ragged);
  float skirt = 1.0 + ${real(PENUMBRA)} * smoothstep(${real(PORE)}, ${real(2 * PORE)}, core.w);
  float umbra = 1.0 - smoothstep(0.8, 1.0, rank);
  float fringe = (1.0 - smoothstep(skirt - 0.12, skirt, rank)) * (1.0 - umbra);

  float inside = max(skirt - rank, 0.0);
  vec2 squeeze = mix(
    vec2(1.0),
    (skirt - inside * (${real(FILAMENT_SQUEEZE)} + ${real(FILAMENT_FLOW)} * (flow - 0.5))) / max(rank, 1e-3),
    step(rank, skirt)
  );
  vec3 one = normalize(core.xyz + from * squeeze.x);
  vec3 two = normalize(core.xyz + from * squeeze.y);
  float grain = (textureCube(relief, spun(one, boil.x)).r - ${real(GRAIN_MEAN)}) * boil.y
    + (textureCube(relief, spun(two.yzx, boil.z)).g - ${real(GRAIN_MEAN)}) * boil.w;

  vec3 round = normalize(mat3(modelMatrix) * at);
  float facing = max(dot(round, normalize(cameraPosition - vPlace)), 0.0);
  float bright = wide.a * (0.15 + min(stir, 1.0)) * (0.25 + 0.5 * (1.0 - smoothstep(0.25, 0.9, facing)));
  float heat = 1.0 + traits.z * (at.y * at.y - 0.33)
    + traits.x * (grain * (0.35 + 0.65 * facing) + 0.17 * (wide.b - 0.5) + ${real(FACULAE)} * bright);
  float chill = traits.y;
  heat = mix(heat, (0.75 + 0.25 * chill) * (1.0 + 1.6 * traits.x * grain), fringe);
  heat = mix(heat, chill * (1.0 + 0.3 * traits.x * grain), umbra);
  heat *= pow(mix(${real(LIMB_DEPTH)}, 1.0, facing), ${real(LIMB)});

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
varying vec3 vNormal;
varying vec3 vPlace;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 eye = normalize(cameraPosition - vPlace);
  float graze = dot(normal, eye);
  float glow = pow(smoothstep(0.0, rim, -graze), 2.0);
  vec3 outward = normalize(normal - eye * graze);
  float day = smoothstep(-0.3, 0.4, dot(outward, sun));
  gl_FragColor = vec4(haze * glow * air * mix(0.05 + 0.95 * day, 0.45, chart), 1.0);
  #include <colorspace_fragment>
}
`;

export const FLARE_VERTEX = `
uniform float reach;
uniform float girth;
varying vec2 vSpot;
varying vec3 vSight;
varying vec3 vMiddle;

void main() {
  vSpot = position.xy;
  vec4 placed = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vMiddle = placed.xyz;
  placed.xy += position.xy * reach;
  vSight = placed.xyz;
  placed.xyz *= 1.0 + girth / max(-vMiddle.z, girth);
  gl_Position = projectionMatrix * placed;
}
`;

export const FLARE_FRAGMENT = `
uniform mat4 modelViewMatrix;
uniform vec4 spots[${SPOT_ROOM}];
uniform vec3 rim;
uniform float girth;
varying vec2 vSpot;
varying vec3 vSight;
varying vec3 vMiddle;

void main() {
  vec3 ray = normalize(vSight);
  vec3 aside = ray * dot(vMiddle, ray) - vMiddle;
  float rise = max(length(aside) / girth - 1.0, 0.0);
  float glare = 0.5 * exp(-rise / 0.04) + 0.12 / (1.0 + 12.0 * rise * rise);
  mat3 turn = mat3(modelViewMatrix);
  vec3 eye = normalize(-vMiddle) * turn;
  vec3 outward = aside * turn;
  vec3 limb = normalize(outward - dot(outward, eye) * eye);
  float arch = 0.0;
  for (int index = 0; index < ${SPOT_ROOM}; index += 2) {
    vec4 spot = spots[index];
    float size = min(spot.w, ${real(ARCH_CAP)});
    float depth = dot(spot.xyz, eye);
    float lift = (1.0 + ${real(ARCH_RISE)} * size) * sqrt(max(1.0 - depth * depth, 0.0)) - 1.0;
    vec3 foot = spot.xyz - depth * eye;
    vec3 from = limb - foot / max(length(foot), 1e-4);
    float span = ${real(ARCH_SPAN)} * size + 1e-5;
    float ring = length(vec2(length(from) / span, rise / max(lift, 1e-5)));
    float band = (ring - 1.0) / 0.2;
    arch += step(1e-5, lift) * (exp(-band * band) + 0.25 * exp(-1.5 * ring * ring));
  }
  float fade = 1.0 - smoothstep(0.6, 1.0, length(vSpot));
  vec3 lit = rim * glare * fade + vec3(1.0, 0.25, 0.2) * min(arch, 1.0) * (0.15 + 0.5 * rim.r);
  gl_FragColor = vec4(lit, 1.0);
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
