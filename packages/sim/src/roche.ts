const HALVINGS = 40;
const MARCH = 64;
const SAMPLES = 600;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const PUSH = 0.02;
const PACE = 0.004;
const LONGEST = 6000;

export interface Lobe {
  tip: number;
  mean: number;
  least: number;
  at(x: number, y: number, z: number): number;
  out(x: number, y: number, z: number): [number, number, number];
}

export interface Point {
  x: number;
  y: number;
}

function potential(lead: number, x: number, y: number, z: number): number {
  const rest = 1 - lead;
  const near = Math.hypot(x, y, z);
  const far = Math.hypot(x - 1, y, z);
  return -lead / near - rest / far - 0.5 * ((x - rest) ** 2 + y ** 2);
}

function halved(test: (value: number) => boolean, from: number, to: number): number {
  let [low, high] = [from, to];
  for (let halving = 0; halving < HALVINGS; halving++) {
    const middle = (low + high) / 2;
    if (test(middle)) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return (low + high) / 2;
}

export function innerPoint(share: number): number {
  const lead = share / (1 + share);
  const rest = 1 - lead;
  return halved(
    (x) => lead / (x * x) - rest / ((1 - x) * (1 - x)) - (x - rest) < 0,
    1e-6,
    1 - 1e-6,
  );
}

function surfaced(lead: number, level: number, tip: number): Lobe["at"] {
  return (x, y, z) => {
    const long = Math.hypot(x, y, z);
    const [east, north, up] = [x / long, y / long, z / long];
    const over = (reach: number) =>
      potential(lead, reach * east, reach * north, reach * up) >= level;
    for (let step = 1; step <= MARCH; step++) {
      const reach = (tip * step) / MARCH;
      if (over(reach)) {
        return halved(over, (tip * (step - 1)) / MARCH, reach);
      }
    }
    return tip;
  };
}

function meanOf(at: Lobe["at"]): { mean: number; least: number } {
  let cube = 0;
  let least = Number.POSITIVE_INFINITY;
  for (let sample = 0; sample < SAMPLES; sample++) {
    const up = 1 - (2 * (sample + 0.5)) / SAMPLES;
    const flat = Math.sqrt(1 - up * up);
    const reach = at(flat * Math.cos(GOLDEN * sample), flat * Math.sin(GOLDEN * sample), up);
    cube += reach ** 3 / SAMPLES;
    least = Math.min(least, reach);
  }
  return { mean: Math.cbrt(cube), least };
}

function sloped(lead: number, at: Lobe["at"]): Lobe["out"] {
  const rest = 1 - lead;
  return (east, north, up) => {
    const long = Math.hypot(east, north, up);
    const reach = at(east, north, up) / long;
    const [x, y, z] = [reach * east, reach * north, reach * up];
    const near = lead / Math.hypot(x, y, z) ** 3;
    const far = rest / Math.hypot(x - 1, y, z) ** 3;
    const slope = [
      near * x + far * (x - 1) - (x - rest),
      near * y + far * y - y,
      near * z + far * z,
    ];
    const steep = Math.hypot(slope[0], slope[1], slope[2]);
    return steep > 1e-9
      ? [slope[0] / steep, slope[1] / steep, slope[2] / steep]
      : [east / long, north / long, up / long];
  };
}

export function lobeShape(share: number, fill: number): Lobe {
  const lead = share / (1 + share);
  const tip = innerPoint(share);
  const brim = potential(lead, tip, 0, 0);
  const whole = surfaced(lead, brim, tip);
  const full = meanOf(whole);
  if (fill >= 1) {
    return { tip, ...full, at: whole, out: sloped(lead, whole) };
  }
  const pole = whole(0, 0, 1);
  const shaped = (part: number) => surfaced(lead, potential(lead, 0, 0, part * pole), tip);
  const first = meanOf(shaped(fill)).mean / full.mean;
  const at = shaped(Math.min(1, (fill * fill) / first));
  return { tip: at(1, 0, 0), ...meanOf(at), at, out: sloped(lead, at) };
}

export function streamOf(share: number, stop: number): Point[] {
  const lead = share / (1 + share);
  const rest = 1 - lead;
  const pull = (x: number, y: number, fast: number, side: number): [number, number] => {
    const near = Math.hypot(x, y) ** 3;
    const far = Math.hypot(x - 1, y) ** 3;
    return [
      (-lead * x) / near - (rest * (x - 1)) / far + (x - rest) + 2 * side,
      (-lead * y) / near - (rest * y) / far + y - 2 * fast,
    ];
  };
  let state = [innerPoint(share) + PUSH * 0.1, 0, PUSH, 0];
  const path: Point[] = [{ x: state[0], y: 0 }];
  let nearest = Number.POSITIVE_INFINITY;
  for (let step = 0; step < LONGEST; step++) {
    const slope = ([x, y, fast, side]: number[]) => [fast, side, ...pull(x, y, fast, side)];
    const moved = (from: number[], by: number[], span: number) =>
      from.map((value, at) => value + by[at] * span);
    const one = slope(state);
    const two = slope(moved(state, one, PACE / 2));
    const three = slope(moved(state, two, PACE / 2));
    const four = slope(moved(state, three, PACE));
    state = state.map(
      (value, at) => value + (PACE * (one[at] + 2 * two[at] + 2 * three[at] + four[at])) / 6,
    );
    const apart = Math.hypot(state[0] - 1, state[1]);
    if (apart > nearest + 1e-4 && nearest < 0.9 * (1 - innerPoint(share))) {
      break;
    }
    nearest = Math.min(nearest, apart);
    path.push({ x: state[0], y: state[1] });
    if (apart <= stop) {
      break;
    }
  }
  return path;
}
