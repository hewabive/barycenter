import { Vector3 } from "three";
import { el } from "./dom.ts";
import { GLYPHS, type Glyph } from "./glyphs.ts";

export interface Bearing {
  glyph: Glyph;
  tone: string;
  toward: Vector3;
  edge: boolean;
}

export interface Navball {
  frame: HTMLElement;
  draw(nose: Vector3, roof: Vector3, sky: Vector3, north: Vector3, bearings: Bearing[]): void;
}

export const BALL_SIZE = 152;

const GROUND = 144;
const MARK = 22;
const BIRD = 42;
const LINE = 0.011;
const SOFT = 0.016;
const CAP = 0.965;
const STILL = 4e-4;
const SKY_LOW = [92, 168, 240];
const SKY_HIGH = [20, 66, 140];
const SOIL_LOW = [180, 116, 56];
const SOIL_HIGH = [64, 36, 18];
const NORTH = [255, 96, 80];
const BIRD_TONE = "#ffd27a";
const HALO = "rgb(4 8 14 / 72%)";

const band = (gap: number, width: number): number =>
  Math.max(0, Math.min(1, 1 - (gap - width) / SOFT));

export function createNavball(): Navball {
  const ground = el("canvas", { width: String(GROUND), height: String(GROUND) });
  const marks = el("canvas", {});
  const frame = el("div", { class: "ball" }, ground, marks);
  const paper = ground.getContext("2d");
  const ink = marks.getContext("2d");
  if (paper === null || ink === null) {
    throw new Error("No 2D canvas");
  }
  const image = paper.createImageData(GROUND, GROUND);
  const shapes = new Map<Glyph, Path2D>();
  const shapeOf = (name: Glyph): Path2D => {
    const made = shapes.get(name) ?? new Path2D(GLYPHS[name]);
    shapes.set(name, made);
    return made;
  };

  const side = new Vector3();
  const level = new Vector3();
  const east = new Vector3();
  const pose = new Float64Array(9);
  const painted = new Float64Array(9).fill(Number.NaN);
  let drawn: number[] = [];
  let density = 0;

  const paint = () => {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pose;
    const { data } = image;
    const half = GROUND / 2;
    let offset = 0;
    for (let row = 0; row < GROUND; row++) {
      const y = (half - row - 0.5) / half;
      for (let column = 0; column < GROUND; column++, offset += 4) {
        const x = (column + 0.5 - half) / half;
        const flat = x * x + y * y;
        if (flat >= 1) {
          data[offset + 3] = 0;
          continue;
        }
        const z = Math.sqrt(1 - flat);
        const up = x * ax + y * ay + z * az;
        const ahead = x * bx + y * by + z * bz;
        const right = x * cx + y * cy + z * cz;
        const high = Math.abs(up);
        const from = up >= 0 ? SKY_LOW : SOIL_LOW;
        const to = up >= 0 ? SKY_HIGH : SOIL_HIGH;
        let red = from[0] + (to[0] - from[0]) * high;
        let green = from[1] + (to[1] - from[1]) * high;
        let blue = from[2] + (to[2] - from[2]) * high;
        const open = Math.max(0, Math.min(1, (CAP - high) / 0.04));
        const meridian = band(Math.abs(right), LINE);
        const rings = Math.max(
          band(Math.abs(high - 0.5), 0.866 * LINE),
          band(Math.abs(high - 0.866), 0.5 * LINE),
        );
        const spokes = Math.max(
          ahead > 0 ? 0 : meridian,
          band(Math.abs(ahead), LINE),
          band(Math.abs(right - ahead) * Math.SQRT1_2, LINE),
          band(Math.abs(right + ahead) * Math.SQRT1_2, LINE),
        );
        const lines = 0.42 * Math.max(rings, open * spokes);
        red += (255 - red) * lines;
        green += (255 - green) * lines;
        blue += (255 - blue) * lines;
        const northward = ahead > 0 ? 0.9 * open * meridian : 0;
        red += (NORTH[0] - red) * northward;
        green += (NORTH[1] - green) * northward;
        blue += (NORTH[2] - blue) * northward;
        const rim = 0.95 * band(high, 1.4 * LINE);
        red += (255 - red) * rim;
        green += (255 - green) * rim;
        blue += (255 - blue) * rim;
        const shade = 0.5 + 0.5 * z;
        const glint = 70 * Math.max(0, -0.42 * x + 0.5 * y + 0.76 * z) ** 14;
        data[offset] = red * shade + glint;
        data[offset + 1] = green * shade + glint;
        data[offset + 2] = blue * shade + glint;
        data[offset + 3] = 255 * Math.min(1, (1 - Math.sqrt(flat)) * half);
      }
    }
    paper.putImageData(image, 0, 0);
    painted.set(pose);
  };

  const stamp = (name: Glyph, tone: string, x: number, y: number, size: number, show: number) => {
    const shape = shapeOf(name);
    ink.save();
    ink.translate(x - size / 2, y - size / 2);
    ink.scale(size / 24, size / 24);
    ink.globalAlpha = show;
    ink.lineCap = "round";
    ink.lineJoin = "round";
    ink.strokeStyle = HALO;
    ink.lineWidth = 4.4;
    ink.stroke(shape);
    ink.strokeStyle = tone;
    ink.lineWidth = 2;
    ink.stroke(shape);
    ink.restore();
  };
  const arrow = (tone: string, x: number, y: number) => {
    const half = BALL_SIZE / 2;
    const angle = Math.atan2(-y, x);
    ink.save();
    ink.translate(half + Math.cos(angle) * (half - 8), half + Math.sin(angle) * (half - 8));
    ink.rotate(angle);
    ink.beginPath();
    ink.moveTo(6, 0);
    ink.lineTo(-4, -6);
    ink.lineTo(-4, 6);
    ink.closePath();
    ink.fillStyle = tone;
    ink.strokeStyle = HALO;
    ink.lineWidth = 1.5;
    ink.fill();
    ink.stroke();
    ink.restore();
  };

  return {
    frame,
    draw(nose, roof, sky, north, bearings) {
      side.crossVectors(nose, roof);
      level.copy(north).addScaledVector(sky, -north.dot(sky));
      if (level.lengthSq() < 1e-9) {
        level.set(1, 0, 0).addScaledVector(sky, -sky.x);
      }
      if (level.lengthSq() < 1e-9) {
        level.set(0, 1, 0).addScaledVector(sky, -sky.y);
      }
      level.normalize();
      east.crossVectors(level, sky);
      [sky, level, east].forEach((axis, index) => {
        pose[3 * index] = axis.dot(side);
        pose[3 * index + 1] = axis.dot(roof);
        pose[3 * index + 2] = axis.dot(nose);
      });
      const spots = bearings.flatMap(({ toward }) => [
        toward.dot(side),
        toward.dot(roof),
        toward.dot(nose),
      ]);
      const ratio = Math.min(window.devicePixelRatio, 2);
      const moved = pose.some((value, index) => !(Math.abs(value - painted[index]) < STILL));
      const same =
        !moved &&
        ratio === density &&
        spots.length === drawn.length &&
        spots.every((value, index) => Math.abs(value - drawn[index]) < STILL);
      if (same) {
        return;
      }
      if (moved) {
        paint();
      }
      if (ratio !== density) {
        marks.width = BALL_SIZE * ratio;
        marks.height = BALL_SIZE * ratio;
        density = ratio;
      }
      drawn = spots;
      const half = BALL_SIZE / 2;
      const reach = half - 4;
      ink.setTransform(ratio, 0, 0, ratio, 0, 0);
      ink.clearRect(0, 0, BALL_SIZE, BALL_SIZE);
      bearings.forEach(({ glyph, tone, edge }, index) => {
        const x = spots[3 * index];
        const y = spots[3 * index + 1];
        const front = spots[3 * index + 2];
        if (front > 0) {
          const show = 0.35 + 0.65 * Math.min(1, 4 * front);
          stamp(glyph, tone, half + x * reach, half - y * reach, MARK, show);
        } else if (edge) {
          arrow(tone, x, y);
        }
      });
      stamp("hold", BIRD_TONE, half, half, BIRD, 1);
    },
  };
}
