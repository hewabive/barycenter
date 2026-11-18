import { courseOf, type Forecast, type Sketch } from "@barycenter/sim";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  type Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  type PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";

export interface Frame {
  body: number | null;
  turning: boolean;
}

export interface Spot {
  time: number;
  slot: number;
  share: number;
}

export interface Sight {
  camera: PerspectiveCamera;
  width: number;
  height: number;
  seen(spot: Vector3): boolean;
}

export interface Course {
  show(forecast: Forecast | null, frame: Frame): void;
  place(now: number, at: Float64Array, ship: Float64Array): void;
  spot(slot: number, share: number, into: Vector3): boolean;
  find(time: number): Spot | null;
  near(sight: Sight, x: number, y: number, reach: number, now: number): Spot | null;
  pole(body: number): Vector3;
}

interface Strand {
  body: number;
  line: LineSegments;
  path: BufferAttribute;
  anchor: Vector3;
  slots: number[];
}

const TONES = [0x7fd4ff, 0xffb347, 0xff7ab8, 0xb7f27a, 0xc9a3ff];
const SHADE = 0.9;

export function createCourse(world: Group, system: Sketch, unit: number, shade = SHADE): Course {
  const { bodies } = system;
  const crowd = bodies.length;
  const poles = bodies.map((body) => {
    if (body.parent === null) {
      return new Vector3(0, 1, 0);
    }
    const nearest = courseOf(body, 0, true);
    const beside = courseOf(body, Math.PI / 2, true);
    return new Vector3(nearest.x, nearest.y, nearest.z)
      .cross(new Vector3(beside.x, beside.y, beside.z))
      .normalize();
  });
  const material = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: shade });
  const tones = TONES.map((tone) => new Color(tone));
  let strands: Strand[] = [];
  let shown: Forecast | null = null;
  let frame: Frame = { body: null, turning: false };
  let places: Float64Array = new Float64Array(3 * crowd);

  const along = new Vector3();
  const aside = new Vector3();
  const basis = new Matrix4();
  const turn = new Quaternion();
  const back = new Quaternion();
  const point = new Vector3();
  const next = new Vector3();
  const head = new Vector3();
  const tail = new Vector3();
  const depth = new Vector3();

  const axes = (body: number, at: ArrayLike<number>, base: number, into: Quaternion) => {
    const { parent } = bodies[body];
    if (parent === null) {
      into.identity();
      return;
    }
    const pole = poles[body];
    along.set(
      at[base + 3 * body] - at[base + 3 * parent],
      at[base + 3 * body + 1] - at[base + 3 * parent + 1],
      at[base + 3 * body + 2] - at[base + 3 * parent + 2],
    );
    along.addScaledVector(pole, -along.dot(pole)).normalize();
    aside.crossVectors(pole, along);
    into.setFromRotationMatrix(basis.makeBasis(along, aside, pole));
  };
  const seat = (slot: number, body: number, into: Vector3) => {
    const forecast = shown;
    if (forecast === null) {
      return;
    }
    const base = 3 * crowd * slot;
    into.set(
      forecast.states[6 * slot] - forecast.places[base + 3 * body],
      forecast.states[6 * slot + 1] - forecast.places[base + 3 * body + 1],
      forecast.states[6 * slot + 2] - forecast.places[base + 3 * body + 2],
    );
    if (frame.turning) {
      axes(body, forecast.places, base, back);
      into.applyQuaternion(back.invert());
    }
  };
  const spot = (slot: number, share: number, into: Vector3): boolean => {
    const forecast = shown;
    if (forecast === null || slot < 0 || slot >= forecast.count) {
      return false;
    }
    const body = frame.body ?? forecast.holds[slot];
    seat(slot, body, into);
    if (share > 0 && slot + 1 < forecast.count) {
      seat(slot + 1, body, next);
      into.lerp(next, share);
    }
    if (frame.turning) {
      axes(body, places, 0, turn);
      into.applyQuaternion(turn);
    }
    into
      .add(point.set(places[3 * body], places[3 * body + 1], places[3 * body + 2]))
      .divideScalar(unit);
    return true;
  };
  const clear = () => {
    for (const strand of strands) {
      world.remove(strand.line);
      strand.line.geometry.dispose();
    }
    strands = [];
  };

  return {
    pole: (body) => poles[body],
    show(forecast, wanted) {
      clear();
      shown = forecast;
      frame = wanted;
      if (forecast === null) {
        return;
      }
      const groups = new Map<number, number[]>();
      for (let slot = 0; slot + 1 < forecast.count; slot++) {
        const body = frame.body ?? forecast.holds[slot];
        const slots = groups.get(body) ?? [];
        slots.push(slot);
        groups.set(body, slots);
      }
      for (const [body, slots] of groups) {
        const anchor = new Vector3();
        seat(slots[0], body, anchor);
        const spots = new Float32Array(6 * slots.length);
        const shades = new Float32Array(6 * slots.length);
        slots.forEach((slot, index) => {
          seat(slot, body, point);
          seat(slot + 1, body, next);
          point
            .sub(anchor)
            .divideScalar(unit)
            .toArray(spots, 6 * index);
          next
            .sub(anchor)
            .divideScalar(unit)
            .toArray(spots, 6 * index + 3);
          const tone = tones[Math.min(forecast.legs[slot], tones.length - 1)];
          tone.toArray(shades, 6 * index);
          tone.toArray(shades, 6 * index + 3);
        });
        const geometry = new BufferGeometry();
        const path = new BufferAttribute(spots, 3);
        geometry.setAttribute("position", path);
        geometry.setAttribute("color", new BufferAttribute(shades, 3));
        const line = new LineSegments(geometry, material);
        line.frustumCulled = false;
        world.add(line);
        strands.push({ body, line, path, anchor, slots });
      }
    },
    place(now, at, ship) {
      places = at;
      const forecast = shown;
      if (forecast === null) {
        return;
      }
      let current = 0;
      while (current < forecast.count && forecast.times[current] <= now) {
        current += 1;
      }
      current -= 1;
      for (const strand of strands) {
        const { body, line, anchor, slots, path } = strand;
        if (frame.turning) {
          axes(body, at, 0, turn);
        } else {
          turn.identity();
        }
        line.quaternion.copy(turn);
        line.position
          .copy(anchor)
          .applyQuaternion(turn)
          .add(point.set(at[3 * body], at[3 * body + 1], at[3 * body + 2]))
          .divideScalar(unit);
        let first = 0;
        while (first < slots.length && slots[first] < current) {
          first += 1;
        }
        const live = first < slots.length && current >= 0 && current + 1 < forecast.count;
        line.visible = live;
        if (!live) {
          continue;
        }
        line.geometry.setDrawRange(2 * first, 2 * (slots.length - first));
        if (slots[first] === current) {
          point
            .set(ship[0] - at[3 * body], ship[1] - at[3 * body + 1], ship[2] - at[3 * body + 2])
            .applyQuaternion(back.copy(turn).invert())
            .sub(anchor)
            .divideScalar(unit);
          path.setXYZ(2 * first, point.x, point.y, point.z);
          path.needsUpdate = true;
        }
      }
    },
    spot,
    find(time) {
      const forecast = shown;
      if (forecast === null || forecast.count < 2) {
        return null;
      }
      const { times, count } = forecast;
      if (!(time >= times[0] && time <= times[count - 1])) {
        return null;
      }
      let low = 0;
      let high = count - 1;
      while (high - low > 1) {
        const middle = (low + high) >> 1;
        if (times[middle] <= time) {
          low = middle;
        } else {
          high = middle;
        }
      }
      const span = times[high] - times[low];
      return { time, slot: low, share: span > 0 ? (time - times[low]) / span : 0 };
    },
    near(sight, x, y, reach, now) {
      const forecast = shown;
      if (forecast === null) {
        return null;
      }
      const { camera, width, height } = sight;
      const cast = (slot: number, into: Vector3): boolean => {
        spot(slot, 0, into);
        into.applyMatrix4(world.matrixWorld);
        if (depth.copy(into).applyMatrix4(camera.matrixWorldInverse).z >= 0) {
          return false;
        }
        into.project(camera);
        into.set((into.x * 0.5 + 0.5) * width, (0.5 - into.y * 0.5) * height, 0);
        return true;
      };
      let best = reach;
      let found: Spot | null = null;
      for (const strand of strands) {
        if (!strand.line.visible) {
          continue;
        }
        for (const slot of strand.slots) {
          if (forecast.times[slot + 1] < now || !cast(slot, head) || !cast(slot + 1, tail)) {
            continue;
          }
          tail.sub(head);
          const long = tail.lengthSq();
          const share =
            long > 0
              ? Math.max(0, Math.min(1, ((x - head.x) * tail.x + (y - head.y) * tail.y) / long))
              : 0;
          const gap = Math.hypot(head.x + share * tail.x - x, head.y + share * tail.y - y);
          if (gap >= best) {
            continue;
          }
          spot(slot, share, depth);
          if (!sight.seen(depth)) {
            continue;
          }
          const from = forecast.times[slot];
          const time = Math.max(now, from + share * (forecast.times[slot + 1] - from));
          best = gap;
          found = { time, slot, share };
        }
      }
      return found;
    },
  };
}
