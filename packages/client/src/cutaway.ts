import type { Fire, Section, Zone } from "@barycenter/sim";
import {
  CircleGeometry,
  Color,
  DoubleSide,
  Mesh,
  type Object3D,
  type PerspectiveCamera,
  ShaderMaterial,
  Vector3,
  Vector4,
} from "three";
import { el } from "./dom.ts";
import { emberOf } from "./looks.ts";
import { figure } from "./readout.ts";
import { CUT_FRAGMENT, CUT_REACH, CUT_VERTEX, FIRE_ROOM, ZONE_ROOM } from "./shaders.ts";

export interface Cutaway {
  aim(eye: Vector3): void;
  turn(clock: number): void;
  anchor(reach: number, side: number, out: Vector3): Vector3;
  dispose(): void;
}

export interface Note {
  reach: number;
  title: string;
  detail: string[];
  tint: string;
}

interface Placed {
  note: Note;
  x: number;
  y: number;
}

const TINTS: Record<string, number> = {
  "iron solid": 0xf2d98c,
  iron: 0xe5853a,
  "rock upper": 0x9a6a46,
  "rock transition": 0xa65f3c,
  "rock lower": 0xb4523a,
  "rock still": 0x6d5a4b,
  "rock molten": 0xd9481e,
  blend: 0x8b7b69,
  "ice Ih": 0xe6f2fc,
  "ice II": 0xcde3f4,
  "ice VI": 0xb3d3ec,
  "ice VII": 0x99c2e3,
  "ice X": 0x83b1d8,
  sea: 0x2f72b3,
  water: 0x2e8e9c,
  metal: 0x7f94b8,
  gas: 0xd9c49a,
  "gas still": 0xeadcbc,
  hydrogen: 0xff9440,
  "hydrogen still": 0xffc864,
  helium: 0xffe08a,
  "helium still": 0xfff1c6,
  carbon: 0xdde4ff,
  neon: 0xe5d6ff,
  crust: 0x9ba4b6,
  neutrons: 0xb7a0ef,
};
const FLAMES = { hydrogen: new Color(0.55, 0.42, 0.16), helium: new Color(0.3, 0.42, 0.6) };
const GLOW_FROM = 900;
const GLOW_FULL = 4000;
const GLOW_HUE = 0.25;
const GLOW_GAIN = 0.35;
const GAS_TONE = 0.55;
const LIFT = (22 * Math.PI) / 180;
const DIAGONAL = Math.SQRT1_2;
const KILOMETERS_MOST = 1e8;
const THIN = 0.03;
const SAME_HEAT = 0.03;
const NOTE_GAP = 4;
const NOTE_WIDE = 230;
const NOTE_CLEAR = 28;
const NOTE_EDGE = 12;
const SMALLEST = 70;
const ROOM_LEAST = 0.2;
const ROOM_MOST = 0.4;
const CELL_PACE = 0.04;

const smooth = (from: number, to: number, value: number) => {
  const share = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
};

const keyOf = (zone: Zone, stirredRock: boolean): string => {
  switch (zone.stuff) {
    case "iron":
      return zone.solid ? "iron solid" : "iron";
    case "rock":
      if (!zone.solid) {
        return "rock molten";
      }
      return !zone.stirred && stirredRock ? "rock still" : `rock ${zone.form ?? "upper"}`;
    case "ice":
      return `ice ${zone.form ?? "Ih"}`;
    case "gas":
    case "hydrogen":
    case "helium":
      return zone.stirred ? zone.stuff : `${zone.stuff} still`;
    default:
      return zone.stuff;
  }
};

function tintsOf(section: Section, tone: Color, star: boolean): { deep: Color; high: Color }[] {
  const { zones, radius } = section;
  const stirredRock = zones.some(({ stuff, stirred }) => stuff === "rock" && stirred);
  const heats = zones.flatMap(({ heat, top }) => [heat, top]).filter((heat) => heat !== null);
  const [cold, hot] = [Math.min(...heats), Math.max(...heats)];
  const span = Math.log(Math.max(hot / Math.max(cold, 1), 1.0001));
  const colorAt = (base: Color, heat: number | null, reach: number, glowing: boolean) => {
    const color = base.clone();
    if (heat === null) {
      return color.multiplyScalar(0.92 + 0.12 * (1 - reach));
    }
    if (star) {
      const share = Math.log(Math.max(heat, cold) / Math.max(cold, 1)) / span;
      return color.lerp(new Color(1, 1, 1), 0.45 * share).multiplyScalar(0.75 + 0.35 * share);
    }
    const glow = smooth(GLOW_FROM, GLOW_FULL, heat);
    const [red, green, blue] = emberOf(heat);
    return color
      .lerp(new Color(red, green, blue), glowing ? GLOW_HUE * glow : 0)
      .multiplyScalar(1 + GLOW_GAIN * glow);
  };
  return zones.map((zone) => {
    const base = new Color(TINTS[keyOf(zone, stirredRock)] ?? 0x888888);
    if (zone.stuff === "gas") {
      base.lerp(tone, GAS_TONE);
    }
    const glowing = zone.stuff === "iron" || zone.stuff === "rock";
    return {
      deep: colorAt(base, zone.heat, zone.inner / radius, glowing),
      high: colorAt(base, zone.top, zone.outer / radius, glowing),
    };
  });
}

export function createCutaway(
  globe: Object3D,
  wedge: { value: Vector3 },
  section: Section,
  options: { lump: Vector4; seed: number; tone: Color; star: boolean },
): Cutaway {
  const { radius } = section;
  const tints = tintsOf(section, options.tone, options.star);
  const zones = Array.from({ length: ZONE_ROOM }, (_, index) => {
    const zone = section.zones[Math.min(index, section.zones.length - 1)];
    return new Vector4(
      zone.inner / radius,
      zone.outer / radius,
      zone.stirred ? 1 : 0,
      zone.solid ? 1 : 0,
    );
  });
  const deeps = Array.from({ length: ZONE_ROOM }, (_, index) =>
    (tints[index] ?? tints[tints.length - 1]).deep.clone(),
  );
  const highs = Array.from({ length: ZONE_ROOM }, (_, index) =>
    (tints[index] ?? tints[tints.length - 1]).high.clone(),
  );
  const lit = section.fires.slice(0, FIRE_ROOM);
  const fires = Array.from({ length: FIRE_ROOM }, (_, index) => {
    const fire = lit[index];
    return fire === undefined
      ? new Vector4(0, 0, 0, 0)
      : new Vector4(fire.inner / radius, fire.outer / radius, 0, 0);
  });
  const flames = Array.from({ length: FIRE_ROOM }, (_, index) => {
    const fire = lit[index];
    return fire === undefined ? new Color(0, 0, 0) : FLAMES[fire.fuel].clone();
  });
  const clock = { value: 0 };
  const shared = {
    cut: wedge,
    reach: { value: options.lump.x > 0 ? CUT_REACH : 1 },
    lump: { value: options.lump },
    seed: { value: options.seed },
    zones: { value: zones },
    deeps: { value: deeps },
    highs: { value: highs },
    count: { value: Math.min(ZONE_ROOM, section.zones.length) },
    fires: { value: fires },
    flames: { value: flames },
    burning: { value: lit.length },
    clock,
  };
  const disc = new CircleGeometry(1, 160, -Math.PI / 2, Math.PI);
  const faces = [1, -1].map((side) => {
    const face = new Mesh(
      disc,
      new ShaderMaterial({
        vertexShader: CUT_VERTEX,
        fragmentShader: CUT_FRAGMENT,
        side: DoubleSide,
        uniforms: { ...shared, side: { value: side } },
      }),
    );
    face.frustumCulled = false;
    globe.add(face);
    return face;
  });
  const local = new Vector3();
  wedge.value.set(0, 1, 1);
  return {
    aim(eye) {
      globe.worldToLocal(local.copy(eye));
      const level = Math.hypot(local.x, local.z);
      if (level > 1e-9) {
        wedge.value.set(local.x / level, local.z / level, 1);
      }
    },
    turn(tick) {
      clock.value = tick * CELL_PACE;
    },
    anchor(reach, side, out) {
      const [across, along] = [wedge.value.x, wedge.value.y];
      const turn = side * DIAGONAL;
      const [x, z] = [across * DIAGONAL - along * turn, across * turn + along * DIAGONAL];
      const level = reach * Math.cos(LIFT);
      return globe.localToWorld(out.set(x * level, reach * Math.sin(LIFT), z * level));
    },
    dispose() {
      for (const face of faces) {
        globe.remove(face);
        face.material.dispose();
      }
      disc.dispose();
      wedge.value.set(0, 1, 0);
    },
  };
}

const heatText = (value: number) =>
  value >= 1e6 ? `${figure(value / 1e6, 3)} million K` : `${figure(value, 3)} K`;

const heatsText = (low: number, high: number) =>
  low >= 1e6
    ? `${figure(low / 1e6, 3)}–${figure(high / 1e6, 3)} million K`
    : high < 1e6
      ? `${figure(low, 3)}–${figure(high, 3)} K`
      : `${heatText(low)} to ${heatText(high)}`;

const pressText = (pascals: number) =>
  pascals >= 1e8
    ? `${figure(pascals / 1e9, 3)} GPa`
    : pascals >= 1e5
      ? `${figure(pascals / 1e6, 3)} MPa`
      : `${figure(pascals / 1e3, 3)} kPa`;

function nameOf(zone: Zone, section: Section, wrapped: boolean): string {
  const { zones, radius } = section;
  const has = (test: (other: Zone) => boolean) => zones.some(test);
  const dwarf = has(({ stuff }) => stuff === "carbon" || stuff === "neon");
  switch (zone.stuff) {
    case "iron":
      if (wrapped) {
        return "Iron core";
      }
      if (zone.solid) {
        return has(({ stuff, solid }) => stuff === "iron" && !solid)
          ? "Inner core"
          : "Core, frozen through";
      }
      return has(({ stuff, solid }) => stuff === "iron" && solid) ? "Outer core" : "Core";
    case "rock":
      if (wrapped) {
        return "Rock core";
      }
      if (!zone.solid) {
        return "Magma ocean";
      }
      if (!zone.stirred && has(({ stuff, stirred }) => stuff === "rock" && stirred)) {
        return "Lithosphere";
      }
      return zone.form === "lower"
        ? "Lower mantle"
        : zone.form === "transition"
          ? "Transition zone"
          : "Upper mantle";
    case "blend":
      return "One mix";
    case "ice":
      return zone.form === "X" ? "Ice VIII and X" : `Ice ${zone.form ?? "Ih"}`;
    case "sea":
      return zone.outer >= radius ? "Sea" : "Sea under ice";
    case "water":
      return "Hot water";
    case "metal":
      return "Metallic hydrogen";
    case "gas":
      return zone.stirred ? "Hydrogen and helium" : "Still gas";
    case "hydrogen":
      if (dwarf) {
        return "Hydrogen";
      }
      if (!zone.stirred) {
        return "Still zone";
      }
      return zone.inner <= 0
        ? zone.outer >= radius
          ? "Stirred throughout"
          : "Stirred core"
        : "Stirred shell";
    case "helium":
      return dwarf ? "Helium" : zone.stirred ? "Stirred core of helium" : "Spent core of helium";
    case "carbon":
      return "Core of carbon and oxygen";
    case "neon":
      return "Core of oxygen and neon";
    case "crust":
      return "Crust";
    case "neutrons":
      return "Core of neutrons";
  }
}

function matterOf(zone: Zone, wrapped: boolean, dwarf: boolean): string {
  if (dwarf && (zone.stuff === "hydrogen" || zone.stuff === "helium")) {
    return zone.stuff === "hydrogen"
      ? "a thin skin of hydrogen"
      : "helium left from burning hydrogen";
  }
  switch (zone.stuff) {
    case "iron":
      if (wrapped) {
        return "iron under the weight of the gas";
      }
      return zone.solid ? "solid iron" : `molten iron, ${zone.stirred ? "stirred" : "still"}`;
    case "rock":
      if (wrapped) {
        return "rock under the weight of the gas";
      }
      if (!zone.solid) {
        return "molten rock, stirred";
      }
      return zone.stirred ? "rock that turns over" : "rock that holds still";
    case "blend":
      return "rock, iron and ice, too small to have parted";
    case "ice":
      return "ice";
    case "sea":
      return "liquid water";
    case "water":
      return "hot water under pressure, stirred";
    case "metal":
      return "hydrogen pressed into a metal, stirred";
    case "gas":
      return zone.stirred ? "stirred" : "heat crosses it as light";
    case "hydrogen":
    case "helium":
      return zone.stirred ? "stirred" : "heat crosses it as light";
    case "carbon":
    case "neon":
      return "packed by its own weight";
    case "crust":
      return "nuclei in a lattice, with free neutrons below";
    case "neutrons":
      return "neutrons with some protons and electrons";
  }
}

function spanText(inner: number, outer: number, radius: number): string {
  if (radius < KILOMETERS_MOST) {
    const deep = (at: number) => figure((radius - at) / 1000, 3);
    return outer >= radius
      ? `the top ${deep(inner)} km`
      : inner <= 0
        ? `below ${deep(outer)} km to the centre`
        : outer - inner < THIN * radius
          ? `${figure((outer - inner) / 1000, 3)} km thick, ${deep(outer)} km down`
          : `${deep(outer)}–${deep(inner)} km down`;
  }
  const part = (value: number) => (value <= 0 ? "0" : value >= 1 ? "1" : figure(value, 2));
  return `${part(inner / radius)}–${part(outer / radius)} of the radius`;
}

function fireOf(fire: Fire, radius: number): Note {
  const shell = fire.inner > 0;
  const title =
    fire.fuel === "hydrogen"
      ? shell
        ? "Shell burning hydrogen"
        : "Burns hydrogen into helium"
      : shell
        ? "Shell burning helium"
        : "Burns helium into carbon";
  return {
    reach: (fire.inner + fire.outer) / 2 / radius,
    title,
    detail: [spanText(fire.inner, fire.outer, radius)],
    tint: fire.fuel === "hydrogen" ? "#ffd27a" : "#a9c8ff",
  };
}

export function notesOf(section: Section, wrapped: boolean, tone: Color, star: boolean): Note[] {
  const { radius } = section;
  const tints = tintsOf(section, tone, star);
  const dwarf = section.zones.some(({ stuff }) => stuff === "carbon" || stuff === "neon");
  const merged: { zone: Zone; title: string; index: number }[] = [];
  section.zones.forEach((zone, index) => {
    const title = nameOf(zone, section, wrapped);
    const last = merged[merged.length - 1];
    if (last !== undefined && last.title === title) {
      last.zone = {
        ...last.zone,
        outer: zone.outer,
        top: zone.top,
        heat: last.zone.heat ?? zone.heat,
        pressure: last.zone.pressure ?? zone.pressure,
      };
    } else {
      merged.push({ zone, title, index });
    }
  });
  const zones = merged.map(({ zone, title, index }): Note => {
    const parts = [spanText(zone.inner, zone.outer, radius)];
    const [hot, cool] = [zone.heat, zone.top];
    if (hot !== null && cool !== null) {
      parts.push(
        Math.abs(hot / cool - 1) < SAME_HEAT
          ? heatText(hot)
          : heatsText(Math.min(hot, cool), Math.max(hot, cool)),
      );
    } else if (cool !== null) {
      parts.push(`${heatText(cool)} at its top`);
    }
    if (zone.pressure !== null && zone.pressure > 0) {
      parts.push(`to ${pressText(zone.pressure)}`);
    }
    return {
      reach: (zone.inner + zone.outer) / 2 / radius,
      title,
      detail: [matterOf(zone, wrapped, dwarf), parts.join(" · ")],
      tint: `#${tints[index].high.getHexString()}`,
    };
  });
  return [...zones, ...section.fires.map((fire) => fireOf(fire, radius))].sort(
    (left, right) => right.reach - left.reach,
  );
}

export interface Notes {
  show(
    notes: Note[],
    cutaway: Cutaway | null,
    camera: PerspectiveCamera,
    middle: Vector3,
    girth: number,
    size: { width: number; height: number },
  ): void;
  hide(): void;
  dispose(): void;
}

const SVG = "http://www.w3.org/2000/svg";

export function roomFor(width: number, height: number): number {
  const narrow = width < 2 * NOTE_WIDE + 2 * NOTE_EDGE;
  const wide = narrow ? NOTE_WIDE / 2 : NOTE_WIDE;
  const least = ROOM_LEAST * Math.min(width, height);
  return Math.max(least, Math.min(ROOM_MOST * height, width / 2 - wide - NOTE_CLEAR - NOTE_EDGE));
}

export function createNotes(root: HTMLElement): Notes {
  const box = el("div", { class: "cut-notes" });
  const sketch = document.createElementNS(SVG, "svg");
  box.append(sketch);
  root.append(box);
  let shown: Note[] = [];
  let cards: HTMLElement[] = [];
  let heights: number[] = [];
  let measured = "";
  let leads: SVGPolylineElement[] = [];
  let dots: SVGCircleElement[] = [];
  const point = new Vector3();
  const seat = new Vector3();
  const build = (notes: Note[]) => {
    shown = notes;
    measured = "";
    for (const card of cards) {
      card.remove();
    }
    sketch.replaceChildren();
    cards = notes.map((note) => {
      const card = el(
        "div",
        { class: "cut-note" },
        el("strong", {}, note.title),
        ...note.detail.map((line) => el("span", {}, line)),
      );
      card.style.borderLeftColor = note.tint;
      box.append(card);
      return card;
    });
    leads = notes.map(() => {
      const lead = document.createElementNS(SVG, "polyline");
      sketch.append(lead);
      return lead;
    });
    dots = notes.map(() => {
      const dot = document.createElementNS(SVG, "circle");
      dot.setAttribute("r", "2.5");
      sketch.append(dot);
      return dot;
    });
  };
  const screen = (camera: PerspectiveCamera, at: Vector3, width: number, height: number) => {
    seat.copy(at).project(camera);
    return { x: (seat.x * 0.5 + 0.5) * width, y: (0.5 - seat.y * 0.5) * height, ahead: seat.z < 1 };
  };
  return {
    show(notes, cutaway, camera, middle, girth, { width, height }) {
      if (notes !== shown) {
        build(notes);
      }
      const centre = screen(camera, middle, width, height);
      const half = Math.tan((camera.fov * Math.PI) / 360);
      const disc =
        (girth / Math.max(middle.distanceTo(camera.position), 1e-9) / half) * (height / 2);
      if (!centre.ahead || disc < SMALLEST) {
        box.style.display = "none";
        return;
      }
      box.style.display = "";
      const narrow = width < 2 * NOTE_WIDE + 2 * NOTE_EDGE;
      box.classList.toggle("narrow", narrow);
      const wide = narrow ? NOTE_WIDE / 2 : NOTE_WIDE;
      if (measured !== `${narrow}`) {
        for (const card of cards) {
          card.style.display = "";
          card.style.maxWidth = `${wide}px`;
        }
        heights = cards.map((card) => card.offsetHeight);
        measured = `${narrow}`;
      }
      const sides = [1, -1].map((side) => {
        const at =
          cutaway === null
            ? centre
            : screen(camera, cutaway.anchor(0.7, side, point), width, height);
        return { side, x: at.x };
      });
      const [right, left] = sides[0].x >= sides[1].x ? sides : [sides[1], sides[0]];
      const roomRight = width - NOTE_EDGE - (centre.x + disc + NOTE_CLEAR);
      const roomLeft = centre.x - disc - NOTE_CLEAR - NOTE_EDGE;
      const onRight = roomRight >= wide || roomRight >= roomLeft;
      const face = onRight ? right.side : left.side;
      const column = onRight
        ? Math.min(centre.x + disc + NOTE_CLEAR, width - NOTE_EDGE - wide)
        : Math.max(centre.x - disc - NOTE_CLEAR, NOTE_EDGE + wide);
      const placed: Placed[] = shown
        .map((note) => {
          const at =
            cutaway === null
              ? centre
              : screen(camera, cutaway.anchor(note.reach, face, point), width, height);
          return { note, x: at.x, y: at.y, ahead: at.ahead };
        })
        .filter(({ ahead, x, y }) => ahead && x >= 0 && x <= width && y >= 0 && y <= height)
        .sort((one, two) => one.y - two.y);
      const tall = placed.map(({ note }) => heights[shown.indexOf(note)] ?? 0);
      const rows = placed.map(({ y }) => y);
      for (let index = 1; index < rows.length; index++) {
        rows[index] = Math.max(
          rows[index],
          rows[index - 1] + (tall[index - 1] + tall[index]) / 2 + NOTE_GAP,
        );
      }
      const last = rows.length - 1;
      const over = (rows[last] ?? 0) + (tall[last] ?? 0) / 2 + NOTE_EDGE - height;
      const lift = Math.max(0, Math.min(over, (rows[0] ?? 0) - (tall[0] ?? 0) / 2 - NOTE_EDGE));
      shown.forEach((_, index) => {
        cards[index].style.display = "none";
        leads[index].style.display = "none";
        dots[index].style.display = "none";
      });
      placed.forEach(({ note, x, y }, order) => {
        const index = shown.indexOf(note);
        const row = rows[order] - lift;
        const top = row - tall[order] / 2;
        const card = cards[index];
        card.style.display = "";
        card.style.transform = onRight
          ? `translate(${column.toFixed(1)}px, ${top.toFixed(1)}px)`
          : `translate(calc(${column.toFixed(1)}px - 100%), ${top.toFixed(1)}px)`;
        const bend = column + (onRight ? -10 : 10);
        leads[index].style.display = "";
        leads[index].setAttribute(
          "points",
          `${x.toFixed(1)},${y.toFixed(1)} ${bend.toFixed(1)},${row.toFixed(1)} ${(column + (onRight ? -2 : 2)).toFixed(1)},${row.toFixed(1)}`,
        );
        dots[index].style.display = "";
        dots[index].setAttribute("cx", x.toFixed(1));
        dots[index].setAttribute("cy", y.toFixed(1));
      });
    },
    hide() {
      box.style.display = "none";
    },
    dispose() {
      box.remove();
    },
  };
}
