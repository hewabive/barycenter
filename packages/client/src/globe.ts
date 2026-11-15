import {
  angleBetween,
  elevationAt,
  GROUND,
  NEUTRAL,
  type Outline,
  SHORE_STEP,
  subtract,
  UNSEEN,
  type Vector,
  type View,
} from "@barycenter/sim";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  ShaderMaterial,
  Vector3,
} from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { el } from "./dom.ts";
import {
  arc,
  barAcross,
  buildCells,
  heartOf,
  landfall,
  nearest,
  neighborsAcross,
  patch,
  rimmed,
  rimOf,
  shoreline,
  type Tooth,
  teethAlong,
} from "./geometry.ts";
import {
  BORDER,
  BREACH,
  ENERGY,
  FORCE,
  GARRISON,
  HOLDING_BORDER,
  MATTER,
  powerColor,
  REGION_BORDER,
  ROAD,
  ROAD_ORDER,
  SELECTION,
  STRAIT,
  UNEXPLORED,
  UNSEEN as UNSEEN_VEIL,
} from "./palette.ts";
import { VEIL_FRAGMENT, VEIL_VERTEX } from "./shaders.ts";
import { createSpace } from "./space.ts";

export interface Frame {
  view: View;
  seat: number;
  running: boolean;
  speed: number;
  rate: number;
  selected: number | null;
}

export interface Globe {
  draw(frame: Frame): void;
  face(region: number): void;
}

interface Stream {
  positions: Float32BufferAttribute;
  geometry: BufferGeometry;
  used: number;
}

interface Side {
  cell: number;
  side: number;
}

interface Contact {
  joint: number;
  from: Vector;
  to: Vector;
  toward: Vector;
  room: number;
  shore: Vector[][];
  approach: Vector[];
}

interface Bite {
  contact: Contact;
  progress: number;
}

interface Front {
  region: number;
  line: LineSegments2;
  material: LineMaterial;
  teeth: Mesh<BufferGeometry, MeshBasicMaterial>;
  label: HTMLElement;
  anchor: Vector3;
  mark: HTMLElement;
  aim: Vector3;
  shape: string | null;
  contacts: Contact[];
  bite: string | null;
}

interface Spot {
  x: number;
  y: number;
  shown: boolean;
}

interface Extent {
  key: string;
  width: number;
  height: number;
}

const SURFACE = 1.002;
const RIM_STEP = 0.05;
const RING = 0.085;
const FILL = 0.78;
const UNEXPLORED_VEIL = 0.86;
const UNSEEN_SHADE = 0.45;
const SELECTED_GLOW = 0.14;
const FLAG_RETREAT = 2;
const STRAIT_STEPS = 12;
const PORTIONS = 8;
const STREAM_ROOM = 6000;
const MATTER_PORTION = 0.25;
const ENERGY_PORTION = 0.3;
const FORCE_PORTION = 0.5;
const FLOW_FLOOR = 0.005;
const STAGGER = 0.618;
const ROAD_STEPS = 3;
const ROAD_WIDTHS = [1.5, 2.75, 4];
const FLOW_SPEED = 0.6;
const TOOTH_PITCH = 0.03;
const TOOTH_SHARE = 0.72;
const TOOTH_RIM = 0.002;
const TOOTH_START = 0.012;
const TOOTH_REACH = 0.55;
const LANDFALL_STEPS = 24;
const LANDING_WIDTH = 0.05;
const CROSSING_LIFT = 0.02;
const HIDDEN = [0, 0, 0, 0, 0, 0];

function along(from: Vector, to: Vector, share: number, radius: number, target: Vector3): void {
  target
    .set(
      from.x + (to.x - from.x) * share,
      from.y + (to.y - from.y) * share,
      from.z + (to.z - from.z) * share,
    )
    .setLength(radius);
}

export function createGlobe(
  stage: HTMLElement,
  outline: Outline,
  onPick: (region: number | null, cell: number | null) => void,
): Globe {
  const space = createSpace(stage, outline.system);
  const { camera, surface } = space;
  const labels = el("div", { class: "labels" });
  space.labels.append(labels);
  const overlay = new Group();
  surface.add(overlay);

  const body = outline.system.bodies[outline.system.home];
  const sea = body.relief.sea ?? 0;
  const sites = outline.cells.map((cell) => cell.position);
  const count = sites.length;
  const cells = buildCells(sites);
  const across = neighborsAcross(cells);
  const regionOf = (cell: number) => outline.cells[cell].region;
  const dry = (at: Vector) => elevationAt(body.seed, body.relief, at) > sea;
  const lineMaterials: LineMaterial[] = [];
  const fading: { material: Material; opacity: number }[] = [];
  const fades = <Kind extends Material>(material: Kind, opacity = 1): Kind => {
    material.transparent = true;
    fading.push({ material, opacity });
    return material;
  };

  const ranges: { start: number; count: number }[] = [];
  const surfacePositions: number[] = [];
  const rims: number[] = [];
  for (const cell of cells) {
    const { vertices, shares } = patch(cell.center, rimOf(cell, outline.reach, RIM_STEP), RING);
    ranges.push({ start: surfacePositions.length / 3, count: vertices.length });
    for (const vertex of vertices) {
      surfacePositions.push(vertex.x * SURFACE, vertex.y * SURFACE, vertex.z * SURFACE);
    }
    rims.push(...shares);
  }
  const veilGeometry = new BufferGeometry();
  veilGeometry.setAttribute("position", new Float32BufferAttribute(surfacePositions, 3));
  const tints = new Float32BufferAttribute(new Float32Array((surfacePositions.length / 3) * 4), 4);
  veilGeometry.setAttribute("tint", tints);
  const veilFade = { value: 1 };
  const veil = new Mesh(
    veilGeometry,
    new ShaderMaterial({
      vertexShader: VEIL_VERTEX,
      fragmentShader: VEIL_FRAGMENT,
      defines: space.defines,
      uniforms: { relief: { value: space.relief }, fade: veilFade },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  veil.frustumCulled = false;
  overlay.add(veil);

  const tint = new Color();
  const glow = new Color(SELECTION);
  const paint = (cell: number, color: number, brightness: number, cover: number, fallen = 0) => {
    tint.setHex(color).multiplyScalar(brightness);
    const range = ranges[cell];
    for (let vertex = range.start; vertex < range.start + range.count; vertex++) {
      const bared = Math.max(0, Math.min(1, FLAG_RETREAT * fallen - (1 - rims[vertex])));
      tints.setXYZW(vertex, tint.r, tint.g, tint.b, cover * (1 - bared));
    }
  };
  const highlight = (cell: number) => {
    const range = ranges[cell];
    for (let vertex = range.start; vertex < range.start + range.count; vertex++) {
      const cover = tints.getW(vertex);
      tint.setRGB(tints.getX(vertex), tints.getY(vertex), tints.getZ(vertex));
      tint.lerp(glow, cover > SELECTED_GLOW ? SELECTED_GLOW : 1);
      tints.setXYZW(vertex, tint.r, tint.g, tint.b, Math.max(cover, SELECTED_GLOW));
    }
  };

  const shores = new Map<number, Vector[][]>();
  const shoreOf = (cell: number, side: number): Vector[][] => {
    const other = across[cell][side];
    if (other < 0) {
      return [];
    }
    const key = Math.min(cell, other) * count + Math.max(cell, other);
    let runs = shores.get(key);
    if (runs === undefined) {
      const corners = cells[cell].corners;
      const site = sites[cell];
      runs = shoreline(
        corners[side],
        corners[(side + 1) % corners.length],
        SHORE_STEP,
        (at) => angleBetween(at, site) <= outline.reach && dry(at),
      );
      shores.set(key, runs);
    }
    return runs;
  };

  const trace = (sides: Side[], radius: number): number[] => {
    const values: number[] = [];
    for (const { cell, side } of sides) {
      for (const run of shoreOf(cell, side)) {
        for (let step = 1; step < run.length; step++) {
          const from = run[step - 1];
          const to = run[step];
          values.push(
            from.x * radius,
            from.y * radius,
            from.z * radius,
            to.x * radius,
            to.y * radius,
            to.z * radius,
          );
        }
      }
    }
    return values;
  };
  const sidesWhere = (accept: (cell: number, other: number) => boolean): Side[] => {
    const found: Side[] = [];
    for (let cell = 0; cell < count; cell++) {
      across[cell].forEach((other, side) => {
        if (other >= 0 && accept(cell, other)) {
          found.push({ cell, side });
        }
      });
    }
    return found;
  };

  const thin = sidesWhere((cell, other) => other > cell);
  const thinLines = new BufferGeometry();
  thinLines.setAttribute("position", new Float32BufferAttribute(trace(thin, 1.003), 3));
  const cellLines = new LineSegments(
    thinLines,
    fades(new LineBasicMaterial({ color: BORDER }), 0.4),
  );
  cellLines.frustumCulled = false;
  overlay.add(cellLines);

  const fatLine = (color: number, width: number): LineSegments2 => {
    const material = fades(new LineMaterial({ color, linewidth: width }));
    lineMaterials.push(material);
    const line = new LineSegments2(new LineSegmentsGeometry(), material);
    line.visible = false;
    line.frustumCulled = false;
    overlay.add(line);
    return line;
  };
  const restring = (line: LineSegments2, values: number[]) => {
    line.geometry.dispose();
    line.geometry = new LineSegmentsGeometry();
    line.visible = values.length > 0;
    line.geometry.setPositions(values.length > 0 ? values : HIDDEN);
    line.computeLineDistances();
  };
  const redraw = (line: LineSegments2, sides: Side[], radius: number) => {
    restring(line, trace(sides, radius));
  };

  const regionBorders = fatLine(REGION_BORDER, 2.5);
  redraw(
    regionBorders,
    sidesWhere((cell, other) => other > cell && regionOf(other) !== regionOf(cell)),
    1.0035,
  );
  const holdingBorders = fatLine(HOLDING_BORDER, 2);
  const selection = fatLine(SELECTION, 3);

  const linked: number[][] = sites.map(() => []);
  const jointBetween = new Map<number, number>();
  outline.joints.forEach((joint, id) => {
    jointBetween.set(joint.a * count + joint.b, id);
    jointBetween.set(joint.b * count + joint.a, id);
    if (!joint.strait) {
      linked[joint.a].push(joint.b);
      linked[joint.b].push(joint.a);
    }
  });
  const crossings = outline.joints.flatMap((joint, id) =>
    joint.strait ? [{ id, a: joint.a, b: joint.b }] : [],
  );
  const roadLines = ROAD_WIDTHS.map((width) => {
    const line = fatLine(ROAD, width);
    fading[fading.length - 1].opacity = 0.85;
    return line;
  });
  const straits = crossings.map((joint) => {
    const path = arc(sites[joint.a], sites[joint.b], STRAIT_STEPS, 1.004, 0.02);
    const geometry = new LineGeometry();
    geometry.setPositions(path.flatMap((point) => [point.x, point.y, point.z]));
    const material = fades(
      new LineMaterial({
        color: STRAIT,
        linewidth: 2,
        dashSize: 0.02,
        gapSize: 0.01,
      }),
    );
    material.dashed = true;
    lineMaterials.push(material);
    const line = new Line2(geometry, material);
    line.computeLineDistances();
    line.visible = false;
    overlay.add(line);
    return { edge: outline.joints[joint.id].edge ?? 0, joint: joint.id, line, material };
  });

  const createStream = (color: number, size: number): Stream => {
    const positions = new Float32BufferAttribute(new Float32Array(STREAM_ROOM * 3), 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", positions);
    geometry.setDrawRange(0, 0);
    const points = new Points(
      geometry,
      fades(new PointsMaterial({ color, size, sizeAttenuation: false })),
    );
    points.frustumCulled = false;
    overlay.add(points);
    return { positions, geometry, used: 0 };
  };
  const garrisonRims = createStream(BORDER, 12);
  const garrisonMarks = createStream(GARRISON, 8);
  const matterStream = createStream(MATTER, 5);
  const energyStream = createStream(ENERGY, 3);
  const forceStream = createStream(FORCE, 6);

  const regionLabels = outline.regions.map(() => {
    const label = el("div", { class: "label" });
    labels.append(label);
    return label;
  });
  const regionCenters = outline.regions.map((region) => {
    const center = sites[region.center];
    return new Vector3(center.x, center.y, center.z);
  });
  const regionAnchors = regionCenters.map((center) => center.clone());
  const regionSpots = outline.regions.map((): Spot => ({ x: 0, y: 0, shown: false }));
  const fronts = new Map<string, Front>();

  let frame: Frame | null = null;
  let shownSelection: number | null = null;
  let shownOwners = "";
  let shownRoads = "";
  let shownGarrisons = "";
  let phase = 0;
  let faced = false;

  const face = (region: number) => {
    space.visit(regionCenters[region]);
  };

  const select = (region: number | null) => {
    if (region === shownSelection) {
      return;
    }
    shownSelection = region;
    redraw(
      selection,
      region === null
        ? []
        : sidesWhere((cell, other) => regionOf(cell) === region && regionOf(other) !== region),
      1.005,
    );
    space.invalidate();
  };

  const labelOf = (current: Frame, id: number): { text: string; tone: string } => {
    const region = current.view.regions[id];
    if (region.nature === null) {
      return { text: "", tone: "dim" };
    }
    if (region.holdings === null) {
      return { text: String(id), tone: "dim" };
    }
    const mine = region.holdings.find((holding) => holding.owner === current.seat);
    if (mine === undefined || region.estate === null) {
      const massed = region.holdings.reduce(
        (sum, holding) => sum + (holding.owner === null ? 0 : holding.force),
        0,
      );
      return { text: massed >= 0.5 ? `${id} · ⚔${massed.toFixed(0)}` : String(id), tone: "plain" };
    }
    const force = mine.force >= 0.5 ? ` ⚔${mine.force.toFixed(0)}` : "";
    const short = region.estate.supply < 0.99;
    const supply = short ? ` ⚡${Math.round(region.estate.supply * 100)}%` : "";
    const text = `${id} · ${mine.level}/${region.estate.levelCap}${force}${supply}`;
    return { text, tone: short ? "alert" : "plain" };
  };

  const roadPoint = new Vector3();
  const toothMaterial = fades(new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
  const rim = new Color(BORDER);
  const fang = new Color(BREACH);
  const point = new Vector3();
  const lay = (
    tooth: Tooth,
    radius: number,
    shade: Color,
    positions: number[],
    shades: number[],
  ) => {
    for (const corner of [tooth.left, tooth.right, tooth.tip]) {
      point.set(corner.x, corner.y, corner.z).setLength(radius);
      positions.push(point.x, point.y, point.z);
      shades.push(shade.r, shade.g, shade.b);
    }
  };
  const serrate = (bites: Bite[]): BufferGeometry => {
    const positions: number[] = [];
    const shades: number[] = [];
    for (const { contact, progress } of bites) {
      const teeth = teethAlong(
        contact.from,
        contact.to,
        contact.toward,
        TOOTH_PITCH,
        TOOTH_SHARE,
        TOOTH_START + Math.max(0, TOOTH_REACH * contact.room - TOOTH_START) * progress,
      );
      for (const tooth of teeth) {
        lay(rimmed(tooth, TOOTH_RIM), 1.0064, rim, positions, shades);
        lay(tooth, 1.0068, fang, positions, shades);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(shades, 3));
    return geometry;
  };

  const span = (vector: Vector) => Math.hypot(vector.x, vector.y, vector.z);
  const byLand = ({ cell, side }: Side): Contact => {
    const other = across[cell][side];
    const toward = subtract(sites[other], sites[cell]);
    const shore = shoreOf(cell, side);
    const longest = shore.reduce((best, run) =>
      angleBetween(run[0], run[run.length - 1]) > angleBetween(best[0], best[best.length - 1])
        ? run
        : best,
    );
    return {
      joint: jointBetween.get(cell * count + other) ?? -1,
      from: longest[0],
      to: longest[longest.length - 1],
      toward,
      room: span(toward) / 2,
      shore,
      approach: [],
    };
  };
  const bySea = (joint: number, from: number, to: number): Contact => {
    const shore = landfall(sites, from, to, LANDFALL_STEPS, dry);
    const toward = subtract(sites[to], shore);
    const [left, right] = barAcross(shore, toward, LANDING_WIDTH);
    return {
      joint,
      from: left,
      to: right,
      toward,
      room: span(toward),
      shore: [[left, right]],
      approach: arc(sites[from], shore, STRAIT_STEPS, 1.006, CROSSING_LIFT),
    };
  };
  const strokes = (contacts: Contact[]): number[] => {
    const values: number[] = [];
    const stroke = (from: Vector, to: Vector, radius: number) => {
      values.push(
        from.x * radius,
        from.y * radius,
        from.z * radius,
        to.x * radius,
        to.y * radius,
        to.z * radius,
      );
    };
    for (const contact of contacts) {
      for (const run of contact.shore) {
        for (let step = 1; step < run.length; step++) {
          stroke(run[step - 1], run[step], 1.006);
        }
      }
      for (let step = 1; step < contact.approach.length; step++) {
        stroke(contact.approach[step - 1], contact.approach[step], 1);
      }
    }
    return values;
  };

  const syncFronts = (current: Frame) => {
    const owners = current.view.cells.owner;
    const wanted = new Set<string>();
    for (const pressure of current.view.pressures) {
      const key = `${pressure.power}>${pressure.region}:${pressure.target}`;
      wanted.add(key);
      let front = fronts.get(key);
      if (front === undefined) {
        const material = fades(new LineMaterial({ linewidth: 5, dashSize: 0.012, gapSize: 0.012 }));
        material.resolution.set(stage.clientWidth, stage.clientHeight);
        lineMaterials.push(material);
        const line = new LineSegments2(new LineSegmentsGeometry(), material);
        line.frustumCulled = false;
        overlay.add(line);
        const teeth = new Mesh(new BufferGeometry(), toothMaterial);
        teeth.frustumCulled = false;
        overlay.add(teeth);
        const label = el("div", { class: "label pressure" });
        const mark = el("div", { class: "label aim" });
        labels.append(label, mark);
        front = {
          region: pressure.region,
          line,
          material,
          teeth,
          label,
          anchor: new Vector3(),
          mark,
          aim: new Vector3(),
          shape: null,
          contacts: [],
          bite: null,
        };
        fronts.set(key, front);
      }
      const target = pressure.target ?? NEUTRAL;
      const sides = sidesWhere(
        (cell, other) =>
          owners[cell] === pressure.power &&
          owners[other] === target &&
          regionOf(other) === pressure.region,
      ).filter(({ cell, side }) => shoreOf(cell, side).length > 0);
      const pressed = (from: number, to: number) =>
        owners[from] === pressure.power &&
        owners[to] === target &&
        regionOf(to) === pressure.region;
      const landings = crossings.flatMap(({ id, a, b }) =>
        pressed(a, b) ? [{ id, from: a, to: b }] : pressed(b, a) ? [{ id, from: b, to: a }] : [],
      );
      const shape = [
        ...sides.map(({ cell, side }) => `${cell}:${side}`),
        ...landings.map(({ from, to }) => `${from}>${to}`),
      ].join(",");
      if (shape !== front.shape) {
        front.shape = shape;
        front.bite = null;
        front.contacts = [
          ...sides.map(byLand),
          ...landings.map(({ id, from, to }) => bySea(id, from, to)),
        ];
        restring(front.line, strokes(front.contacts));
        front.anchor.set(0, 0, 0);
        for (const { from } of front.contacts) {
          front.anchor.x += from.x;
          front.anchor.y += from.y;
          front.anchor.z += from.z;
        }
        if (front.contacts.length > 0) {
          front.anchor.setLength(1.02);
        }
      }
      const bites = front.contacts.flatMap((contact): Bite[] => {
        const breach = pressure.breaches.find((known) => known.joint === contact.joint);
        return breach === undefined ? [] : [{ contact, progress: breach.progress }];
      });
      const bite = bites
        .map(({ contact, progress }) => `${contact.joint}:${progress.toFixed(3)}`)
        .join(",");
      if (bite !== front.bite) {
        front.bite = bite;
        front.teeth.geometry.dispose();
        front.teeth.geometry = serrate(bites);
      }
      const active = pressure.activeAt <= current.view.tick;
      front.material.color.setHex(powerColor(pressure.power));
      if (front.material.dashed === active) {
        front.material.dashed = !active;
        front.material.needsUpdate = true;
      }
      const text = active
        ? `⚔ ${pressure.commit.toFixed(0)}`
        : `in ${pressure.activeAt - current.view.tick}`;
      front.label.textContent = front.contacts.length > 0 ? text : "";
      front.label.style.color = `#${powerColor(pressure.power).toString(16).padStart(6, "0")}`;
      front.mark.textContent = pressure.aim === null ? "" : "✛";
      front.mark.style.color = front.label.style.color;
      if (pressure.aim !== null) {
        const site = sites[pressure.aim];
        front.aim.set(site.x, site.y, site.z).setLength(1.02);
      }
    }
    for (const [key, front] of fronts) {
      if (!wanted.has(key)) {
        overlay.remove(front.line, front.teeth);
        front.teeth.geometry.dispose();
        front.line.geometry.dispose();
        front.material.dispose();
        lineMaterials.splice(lineMaterials.indexOf(front.material), 1);
        fading.splice(
          fading.findIndex((entry) => entry.material === front.material),
          1,
        );
        front.label.remove();
        front.mark.remove();
        fronts.delete(key);
      }
    }
  };

  const draw = (current: Frame) => {
    frame = current;
    space.clock(current.view.tick, current.running ? current.rate * current.speed : 0);
    const layer = current.view.cells;
    for (let cell = 0; cell < count; cell++) {
      const owner = layer.owner[cell];
      if (layer.ground[cell] === GROUND.unknown) {
        paint(cell, UNEXPLORED, 1, UNEXPLORED_VEIL);
      } else if (owner === UNSEEN) {
        paint(cell, UNSEEN_VEIL, 1, UNSEEN_SHADE);
      } else if (owner === NEUTRAL) {
        paint(cell, 0, 0, 0);
      } else {
        const growth = layer.cap[cell] > 0 ? layer.level[cell] / layer.cap[cell] : 0;
        paint(cell, powerColor(owner), 0.45 + 0.55 * growth, FILL, 1 - layer.flag[cell]);
      }
      if (current.selected !== null && regionOf(cell) === current.selected) {
        highlight(cell);
      }
    }
    tints.needsUpdate = true;

    const owners = `${current.seat}:${layer.owner.join(",")}`;
    if (owners !== shownOwners) {
      shownOwners = owners;
      outline.regions.forEach((region, id) => {
        const held = region.cells.filter((cell) => layer.owner[cell] === current.seat);
        const site = sites[held.length > 0 ? heartOf(held, sites, linked) : region.center];
        regionAnchors[id].set(site.x, site.y, site.z);
      });
      redraw(
        holdingBorders,
        sidesWhere((cell, other) => {
          if (other <= cell) {
            return false;
          }
          const here = layer.owner[cell];
          const there = layer.owner[other];
          return here !== there && (here >= 0 || there >= 0);
        }),
        1.004,
      );
    }

    const garrisons = layer.quarters.flatMap((quarters, cell) => (quarters >= 1 ? [cell] : []));
    if (garrisons.join(",") !== shownGarrisons) {
      shownGarrisons = garrisons.join(",");
      for (const marks of [garrisonRims, garrisonMarks]) {
        garrisons.forEach((cell, index) => {
          along(sites[cell], sites[cell], 0, 1.007, roadPoint);
          marks.positions.setXYZ(index, roadPoint.x, roadPoint.y, roadPoint.z);
        });
        marks.positions.needsUpdate = true;
        marks.geometry.setDrawRange(0, garrisons.length);
      }
    }
    const grades = current.view.roads;
    if (grades.join("") !== shownRoads) {
      shownRoads = grades.join("");
      const strokes: number[][] = roadLines.map(() => []);
      grades.forEach((grade, joint) => {
        const { a, b, strait } = outline.joints[joint];
        if (grade <= 0 || strait) {
          return;
        }
        const values = strokes[Math.min(grade, strokes.length) - 1];
        for (let step = 0; step < ROAD_STEPS; step++) {
          along(sites[a], sites[b], step / ROAD_STEPS, 1.0045, roadPoint);
          values.push(roadPoint.x, roadPoint.y, roadPoint.z);
          along(sites[a], sites[b], (step + 1) / ROAD_STEPS, 1.0045, roadPoint);
          values.push(roadPoint.x, roadPoint.y, roadPoint.z);
        }
      });
      roadLines.forEach((line, index) => {
        restring(line, strokes[index]);
      });
    }
    for (const strait of straits) {
      const edge = current.view.edges[strait.edge];
      strait.line.visible = edge.kind !== null;
      strait.material.color.setHex(edge.road ? ROAD_ORDER : STRAIT);
      strait.material.linewidth = 1.5 + 0.75 * (grades[strait.joint] ?? 0);
    }

    current.view.regions.forEach((_, id) => {
      const label = labelOf(current, id);
      regionLabels[id].textContent = label.text;
      regionLabels[id].className = `label ${label.tone}`;
    });
    syncFronts(current);
    select(current.selected);
    if (!faced) {
      const home = current.view.regions.find((region) => region.estate !== null);
      if (home !== undefined) {
        face(home.id);
        faced = true;
      }
    }
  };

  const spot = new Vector3();
  const emit = (stream: Stream, joint: number, signed: number, portion: number, shift: number) => {
    const flow = Math.abs(signed);
    if (flow < FLOW_FLOOR) {
      return;
    }
    const { a, b } = outline.joints[joint];
    const gap = Math.max(portion / flow, 1 / PORTIONS);
    const first = (phase + (shift + joint * STAGGER) * gap) % gap;
    for (let share = first; share < 1 && stream.used < STREAM_ROOM; share += gap) {
      along(sites[a], sites[b], signed > 0 ? share : 1 - share, 1.008, spot);
      stream.positions.setXYZ(stream.used, spot.x, spot.y, spot.z);
      stream.used += 1;
    }
  };

  const placeFlows = (current: Frame) => {
    const streams = [matterStream, energyStream, forceStream];
    for (const stream of streams) {
      stream.used = 0;
    }
    for (const flow of current.view.flows) {
      emit(matterStream, flow.joint, flow.matter, MATTER_PORTION, 0);
      emit(energyStream, flow.joint, flow.energy, ENERGY_PORTION, 0.33);
      emit(forceStream, flow.joint, flow.force, FORCE_PORTION, 0.66);
    }
    for (const stream of streams) {
      stream.geometry.setDrawRange(0, stream.used);
      if (stream.used > 0) {
        stream.positions.addUpdateRange(0, stream.used * 3);
        stream.positions.needsUpdate = true;
      }
    }
  };

  const outward = new Vector3();
  const projected = new Vector3();
  const frontSpot: Spot = { x: 0, y: 0, shown: false };
  const extents = new WeakMap<HTMLElement, Extent>();
  const locate = (label: HTMLElement, anchor: Vector3, spot: Spot) => {
    const distance = space.eye.length();
    outward.copy(space.eye).divideScalar(distance);
    const facing = anchor.dot(outward) / Math.max(anchor.length(), 1e-6);
    spot.shown = label.textContent !== "" && facing >= 1 / distance + 0.03;
    if (spot.shown) {
      const { width, height } = space.size();
      projected.copy(anchor).applyMatrix4(surface.matrixWorld).project(camera);
      spot.x = (projected.x * 0.5 + 0.5) * width;
      spot.y = (0.5 - projected.y * 0.5) * height;
    }
  };
  const put = (label: HTMLElement, spot: Spot) => {
    label.style.display = spot.shown ? "" : "none";
    if (spot.shown) {
      label.style.transform = `translate(-50%, -50%) translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px)`;
    }
  };
  const extentOf = (label: HTMLElement): Extent => {
    const key = `${label.className}|${label.textContent}`;
    let extent = extents.get(label);
    if (extent === undefined || extent.key !== key) {
      const box = label.getBoundingClientRect();
      extent = { key, width: box.width, height: box.height };
      if (box.width > 0) {
        extents.set(label, extent);
      }
    }
    return extent;
  };
  const clear = (front: Front, spot: Spot) => {
    const held = regionSpots[front.region];
    if (!spot.shown || !held.shown) {
      return;
    }
    const own = extentOf(front.label);
    const other = extentOf(regionLabels[front.region]);
    const reach = (own.height + other.height) / 2;
    if (
      Math.abs(spot.x - held.x) < (own.width + other.width) / 2 &&
      Math.abs(spot.y - held.y) < reach
    ) {
      spot.y = held.y + (spot.y < held.y ? -reach : reach);
      put(front.label, spot);
    }
  };

  space.onPresent(() => {
    const chart = space.chart();
    const fade = Math.max(0, Math.min(1, (chart - 0.15) / 0.7));
    overlay.visible = fade > 0;
    labels.style.display = fade > 0 ? "" : "none";
    labels.style.opacity = fade.toFixed(2);
    veilFade.value = fade;
    for (const { material, opacity } of fading) {
      material.opacity = opacity * fade;
    }
    if (fade === 0) {
      return;
    }
    if (frame !== null) {
      placeFlows(frame);
    }
    regionLabels.forEach((label, id) => {
      locate(label, regionAnchors[id], regionSpots[id]);
      put(label, regionSpots[id]);
    });
    for (const front of fronts.values()) {
      locate(front.mark, front.aim, frontSpot);
      put(front.mark, frontSpot);
      locate(front.label, front.anchor, frontSpot);
      put(front.label, frontSpot);
      clear(front, frontSpot);
    }
  });

  space.onResize((width, height) => {
    for (const material of lineMaterials) {
      material.resolution.set(width, height);
    }
  });

  space.onTap((at) => {
    if (at === null) {
      onPick(null, null);
      return;
    }
    const cell = nearest(sites, at);
    const land = angleBetween(at, sites[cell]) <= outline.reach && dry(at);
    onPick(land ? regionOf(cell) : null, land ? cell : null);
  });

  const flowing = () => frame?.running === true && frame.view.flows.length > 0;
  space.lively(flowing);
  space.onFrame((elapsed) => {
    if (frame !== null && flowing()) {
      phase += elapsed * FLOW_SPEED * Math.sqrt(frame.speed);
    }
  });

  return { draw, face };
}
