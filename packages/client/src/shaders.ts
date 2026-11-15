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
const JET_WAVES = 11;
const JET_REACH = 1.4;
const EDDY_REACH = 0.07;
const FLOW_BEATS = 6;
const STORM_TWIST = 3.5;
const SPOT_BEATS = 8;
const SPOT_PULL = 0.02;
const STORM_STRETCH = 1.5;

export const STORM_ROOM = 4;
const HEIGHT_RANGE = 2.5;

export const BAKE_VERTEX = `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const BAKE_FRAGMENT = `
${FIELD}
uniform float sea;
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

const SURVEY = `
uniform samplerCube relief;

vec4 decoded(vec4 found) {
#ifdef PACKED
  found = vec4((found.rgb - 0.5) * ${real(SLOPE_RANGE)}, (found.a - 0.5) * ${real(HEIGHT_RANGE)});
#endif
  return found;
}

vec4 survey(vec3 at) {
  return decoded(textureCube(relief, at));
}

vec3 spun(vec3 at, float angle) {
  float along = cos(angle);
  float across = sin(angle);
  return vec3(along * at.x + across * at.z, at.y, along * at.z - across * at.x);
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

const GAS = `
  vec4 eddies = decoded(textureLod(relief, spun(at, drift).zxy, grain));
  vec3 east = cross(vec3(0.0, 1.0, 0.0), at);
  vec3 flow = ${real(JET_REACH)} * sin(at.y * ${real(JET_WAVES)}) * east
    + ${real(EDDY_REACH)} * cross(at, spun(eddies.rgb.yzx, -drift));
  vec3 stain = vec3(0.0);
  float stained = 0.0;
  for (int storm = 0; storm < ${STORM_ROOM}; storm++) {
    vec3 from = at - storms[storm].xyz;
    float size = storms[storm].w;
    float core = exp(-(dot(from, from) + ${real(STORM_STRETCH)} * from.y * from.y) / (size * size + 1e-6));
    bool warm = storm % 2 == 0;
    flow += (warm ? 1.0 : -1.0) * ${real(STORM_TWIST)} * core * cross(storms[storm].xyz, at);
    stain += core * (warm ? palette[4] : palette[5]);
    stained += core;
  }
  float beat = drift * ${real(FLOW_BEATS / (2 * Math.PI))} + 0.4 * eddies.a;
  vec2 phase = fract(vec2(beat, beat + 0.5));
  vec2 share = 1.0 - abs(2.0 * phase - 1.0);
  vec3 first = normalize(at - flow * (phase.x - 0.5));
  vec3 second = normalize(at - flow * (phase.y - 0.5));
  vec2 rough = vec2(survey(first).a, survey(second).a);
  vec2 lane = vec2(first.y, second.y) * 9.0 + rough * 1.1 + eddies.a * 0.3;
  float band = dot(share, 0.5 + 0.5 * sin(lane * 2.0));
  float fine = dot(share, 0.5 + 0.5 * sin(lane * 5.3 + 1.7));
  vec3 cloud = mix(mix(palette[0], palette[1], band), palette[2], fine * 0.35);
  cloud = mix(
    cloud,
    stain / max(stained, 1e-4) * (0.85 + 0.5 * dot(share, rough) - 0.2 * stained),
    0.85 * smoothstep(0.2, 0.7, stained)
  );
  albedo = mix(cloud, palette[3], smoothstep(0.7, 0.95, abs(at.y)));
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
uniform float grain;
uniform vec3 shine;
uniform vec4 storms[${STORM_ROOM}];
uniform mat4 modelMatrix;
varying vec3 vAt;
varying vec3 vPlace;

void main() {
  vec3 at = normalize(vAt);
  vec3 albedo;
  vec3 slope = vec3(0.0);
  float wet = 0.0;
  float cover = 0.0;
  float bump = 0.0;
  ${kind === "gas" ? GAS : solid(SKINS[kind])}
  float depth = bump * mix(1.0, 0.3, wet);
  vec3 charted = albedo * hillshade(at, slope, depth);

  mat3 pose = mat3(modelMatrix);
  vec3 round = normalize(pose * at);
  vec3 normal = normalize(pose * tilted(at, slope, depth));
  vec3 eye = normalize(cameraPosition - vPlace);
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

const ACTIVITY = `
uniform float drift;
uniform float grain;

vec4 seatOf(vec3 at) {
  return decoded(textureLod(relief, spun(at, -drift).zxy, grain - 1.0));
}

float stirOf(vec4 seat, vec3 at) {
  float belt = smoothstep(0.06, 0.2, abs(at.y)) * (1.0 - smoothstep(0.45, 0.62, abs(at.y)));
  vec3 carried = spun(at, -drift);
  float turn = ${real(SPOT_BEATS)} * drift + 5.0 * seat.a + 3.0 * carried.x + 2.0 * carried.z;
  return (seat.a + 0.25 * sin(turn)) * belt;
}
`;

export const STAR_FRAGMENT = `
${SURVEY}
${ACTIVITY}
uniform vec3 palette[8];
uniform mat4 modelMatrix;
varying vec3 vAt;
varying vec3 vPlace;

void main() {
  vec3 at = normalize(vAt);
  vec4 seat = seatOf(at);
  float stir = stirOf(seat, at);
  vec3 pull = spun(seat.rgb.yzx, drift);
  vec3 bent = normalize(at + ${real(SPOT_PULL)} * smoothstep(0.05, 0.45, stir) * pull);
  float first = survey(spun(bent, drift)).a;
  float second = survey(spun(bent.zxy, -2.0 * drift).yzx).a;
  float cells = smoothstep(0.0, 0.25, abs(first - second));
  float heat = (0.5 + 0.3 * (first + second)) * (0.6 + 0.4 * cells);

  float spot = stir + 0.15 * second;
  float umbra = smoothstep(0.42, 0.55, spot);
  float fringe = smoothstep(0.28, 0.42, spot) * (1.0 - umbra);
  float plage = smoothstep(0.08, 0.28, spot) * (1.0 - smoothstep(0.28, 0.4, spot));

  vec3 round = normalize(mat3(modelMatrix) * at);
  vec3 eye = normalize(cameraPosition - vPlace);
  float edge = pow(max(dot(round, eye), 0.0), 0.45);
  float warmth = clamp((heat + 0.3 * plage * cells) * 1.2 * (0.5 + 0.5 * edge), 0.0, 1.0);
  vec3 glow = mix(palette[1], palette[0], warmth) * (0.7 + 0.65 * heat + 0.3 * plage);
  glow = mix(glow, mix(palette[2], palette[1], 0.4 + 0.35 * cells), fringe * 0.85);
  glow = mix(glow, palette[2] * (0.9 + 0.2 * heat), umbra * 0.92);
  gl_FragColor = vec4(glow * mix(0.55, 1.15, edge), 1.0);
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
varying vec2 vSpot;
varying vec3 vRay;

void main() {
  vSpot = position.xy;
  vRay = vec3(position.xy, 0.0) * mat3(modelViewMatrix);
  vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  center.xy += position.xy * reach;
  gl_Position = projectionMatrix * center;
}
`;

export const FLARE_FRAGMENT = `
${SURVEY}
${ACTIVITY}
uniform vec3 palette[8];
uniform vec3 tint;
uniform float core;
varying vec2 vSpot;
varying vec3 vRay;

void main() {
  float away = length(vSpot);
  vec3 limb = normalize(vRay);
  float beyond = clamp((away - core) / (1.0 - core), 0.0, 1.0);
  vec4 seat = seatOf(limb);
  float roused = smoothstep(0.05, 0.45, stirOf(seat, limb));
  float wide = decoded(textureLod(relief, spun(limb, -drift).zxy, grain + 1.0)).a;
  float streamer = smoothstep(-0.6, 0.6, wide);
  float corona = pow(1.0 - beyond, mix(9.0, 5.0, streamer)) * (0.05 + 0.12 * streamer);
  float halo = 0.25 * exp(-beyond * 26.0);
  float rise = max(away - core, 0.0) / core;
  float flame = roused * exp(-rise / (0.02 + 0.09 * roused));
  gl_FragColor = vec4(tint * (corona + halo) + palette[1] * flame * 0.9, 1.0);
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
