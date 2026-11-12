import {
  GROUND,
  NEUTRAL,
  type Outline,
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
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
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
  rimmed,
  type Tooth,
  teethAlong,
  triangulate,
} from "./geometry.ts";
import {
  BORDER,
  BREACH,
  ENERGY,
  FORCE,
  GARRISON,
  HOLDING_BORDER,
  MATTER,
  MOUNTAIN,
  OCEAN,
  PLAIN,
  powerColor,
  REGION_BORDER,
  ROAD,
  ROAD_ORDER,
  SELECTION,
  STRAIT,
  UNEXPLORED,
} from "./palette.ts";

export interface Frame {
  view: View;
  seat: number;
  running: boolean;
  speed: number;
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

interface Press {
  id: number;
  x: number;
  y: number;
}

const SURFACE_DEPTH = 1;
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
const CLICK_SLACK = 5;
const TAP_SLACK = 12;
const FIELD_OF_VIEW = 40;
const FLOW_FRAME = 30;
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
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.append(renderer.domElement);
  const labels = el("div", { class: "labels" });
  stage.append(labels);

  const scene = new Scene();
  scene.background = new Color(0x05070c);
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 50);
  camera.position.set(0, 0.9, 3.3);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minDistance = 1.3;
  controls.maxDistance = 6;

  const coarse = window.matchMedia("(pointer: coarse)");
  let stale = true;
  const invalidate = () => {
    stale = true;
  };
  controls.addEventListener("change", invalidate);
  renderer.domElement.addEventListener("webglcontextrestored", invalidate);

  const landCount = outline.cells.length;
  const sites = [...outline.cells.map((cell) => cell.position), ...outline.oceans];
  const cells = buildCells(sites);
  const across = neighborsAcross(cells);
  const regionOf = (cell: number) => (cell < landCount ? outline.cells[cell].region : -1);
  const lineMaterials: LineMaterial[] = [];

  const ranges: { start: number; count: number }[] = [];
  const surfacePositions: number[] = [];
  for (const cell of cells) {
    const vertices = triangulate(cell, SURFACE_DEPTH);
    ranges.push({ start: surfacePositions.length / 3, count: vertices.length });
    for (const vertex of vertices) {
      surfacePositions.push(vertex.x, vertex.y, vertex.z);
    }
  }
  const surface = new BufferGeometry();
  surface.setAttribute("position", new Float32BufferAttribute(surfacePositions, 3));
  const colors = new Float32BufferAttribute(new Float32Array(surfacePositions.length), 3);
  surface.setAttribute("color", colors);
  scene.add(new Mesh(surface, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide })));

  const tint = new Color();
  const paint = (cell: number, color: number, brightness: number) => {
    tint.setHex(color).multiplyScalar(brightness);
    const range = ranges[cell];
    for (let vertex = range.start; vertex < range.start + range.count; vertex++) {
      colors.setXYZ(vertex, tint.r, tint.g, tint.b);
    }
    colors.needsUpdate = true;
  };
  for (let cell = 0; cell < cells.length; cell++) {
    paint(cell, cell < landCount ? UNEXPLORED : OCEAN, 1);
  }

  const trace = (sides: Side[], radius: number): number[] => {
    const values: number[] = [];
    for (const { cell, side } of sides) {
      const corners = cells[cell].corners;
      const from = corners[side];
      const to = corners[(side + 1) % corners.length];
      values.push(
        from.x * radius,
        from.y * radius,
        from.z * radius,
        to.x * radius,
        to.y * radius,
        to.z * radius,
      );
    }
    return values;
  };
  const sidesWhere = (accept: (cell: number, other: number) => boolean): Side[] => {
    const found: Side[] = [];
    for (let cell = 0; cell < landCount; cell++) {
      across[cell].forEach((other, side) => {
        if (accept(cell, other)) {
          found.push({ cell, side });
        }
      });
    }
    return found;
  };

  const thin = sidesWhere((cell, other) => other > cell && other < landCount);
  const thinLines = new BufferGeometry();
  thinLines.setAttribute("position", new Float32BufferAttribute(trace(thin, 1.001), 3));
  scene.add(
    new LineSegments(
      thinLines,
      new LineBasicMaterial({ color: BORDER, transparent: true, opacity: 0.4 }),
    ),
  );

  const fatLine = (color: number, width: number): LineSegments2 => {
    const material = new LineMaterial({ color, linewidth: width });
    lineMaterials.push(material);
    const line = new LineSegments2(new LineSegmentsGeometry(), material);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
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
    sidesWhere(
      (cell, other) => other >= landCount || (other > cell && regionOf(other) !== regionOf(cell)),
    ),
    1.002,
  );
  const holdingBorders = fatLine(HOLDING_BORDER, 2);
  const selection = fatLine(SELECTION, 3);

  const adjacent = new Set<number>();
  for (let cell = 0; cell < landCount; cell++) {
    for (const other of across[cell]) {
      if (other >= 0 && other < landCount) {
        adjacent.add(cell * landCount + other);
      }
    }
  }
  const jointBetween = new Map<number, number>();
  outline.joints.forEach((joint, id) => {
    jointBetween.set(joint.a * landCount + joint.b, id);
    jointBetween.set(joint.b * landCount + joint.a, id);
  });
  const crossings = outline.joints.flatMap((joint, id) =>
    adjacent.has(joint.a * landCount + joint.b) ? [] : [{ id, a: joint.a, b: joint.b }],
  );
  const roadLines = ROAD_WIDTHS.map((width) => {
    const line = fatLine(ROAD, width);
    line.material.transparent = true;
    line.material.opacity = 0.85;
    return line;
  });
  const straits = outline.joints
    .map((joint, id) => ({ ...joint, id }))
    .filter((joint) => joint.edge !== null && !adjacent.has(joint.a * landCount + joint.b))
    .map((joint) => {
      const path = arc(sites[joint.a], sites[joint.b], STRAIT_STEPS, 1.004, 0.02);
      const geometry = new LineGeometry();
      geometry.setPositions(path.flatMap((point) => [point.x, point.y, point.z]));
      const material = new LineMaterial({
        color: STRAIT,
        linewidth: 2,
        dashSize: 0.02,
        gapSize: 0.01,
      });
      material.dashed = true;
      lineMaterials.push(material);
      const line = new Line2(geometry, material);
      line.computeLineDistances();
      line.visible = false;
      scene.add(line);
      return { edge: joint.edge ?? 0, joint: joint.id, line, material };
    });

  const createStream = (color: number, size: number): Stream => {
    const positions = new Float32BufferAttribute(new Float32Array(STREAM_ROOM * 3), 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", positions);
    geometry.setDrawRange(0, 0);
    const points = new Points(
      geometry,
      new PointsMaterial({ color, size, sizeAttenuation: false }),
    );
    points.frustumCulled = false;
    scene.add(points);
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
    const distance = camera.position.length();
    camera.position.copy(regionCenters[region]).setLength(distance);
    controls.update();
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
  const toothMaterial = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
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
    const corners = cells[cell].corners;
    const other = across[cell][side];
    const toward = subtract(sites[other], sites[cell]);
    return {
      joint: jointBetween.get(cell * landCount + other) ?? -1,
      from: corners[side],
      to: corners[(side + 1) % corners.length],
      toward,
      room: span(toward) / 2,
      approach: [],
    };
  };
  const bySea = (joint: number, from: number, to: number): Contact => {
    const shore = landfall(sites, from, to, LANDFALL_STEPS);
    const toward = subtract(sites[to], shore);
    const [left, right] = barAcross(shore, toward, LANDING_WIDTH);
    return {
      joint,
      from: left,
      to: right,
      toward,
      room: span(toward),
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
      stroke(contact.from, contact.to, 1.006);
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
        const material = new LineMaterial({ linewidth: 5, dashSize: 0.012, gapSize: 0.012 });
        material.resolution.set(stage.clientWidth, stage.clientHeight);
        lineMaterials.push(material);
        const line = new LineSegments2(new LineSegmentsGeometry(), material);
        line.frustumCulled = false;
        scene.add(line);
        const teeth = new Mesh(new BufferGeometry(), toothMaterial);
        teeth.frustumCulled = false;
        scene.add(teeth);
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
          other < landCount &&
          owners[cell] === pressure.power &&
          owners[other] === target &&
          regionOf(other) === pressure.region,
      );
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
        scene.remove(front.line, front.teeth);
        front.teeth.geometry.dispose();
        front.line.geometry.dispose();
        front.material.dispose();
        lineMaterials.splice(lineMaterials.indexOf(front.material), 1);
        front.label.remove();
        front.mark.remove();
        fronts.delete(key);
      }
    }
  };

  const draw = (current: Frame) => {
    frame = current;
    stale = true;
    const layer = current.view.cells;
    for (let cell = 0; cell < landCount; cell++) {
      const ground = layer.ground[cell];
      if (ground === GROUND.unknown) {
        paint(cell, UNEXPLORED, 1);
        continue;
      }
      const soil = ground === GROUND.mountain ? MOUNTAIN : PLAIN;
      const owner = layer.owner[cell];
      if (owner === UNSEEN) {
        paint(cell, soil, 0.45);
      } else if (owner === NEUTRAL) {
        paint(cell, soil, 1);
      } else {
        const growth = layer.cap[cell] > 0 ? layer.level[cell] / layer.cap[cell] : 0;
        paint(cell, powerColor(owner), 0.4 + 0.6 * growth);
      }
    }

    const owners = `${current.seat}:${layer.owner.join(",")}`;
    if (owners !== shownOwners) {
      shownOwners = owners;
      outline.regions.forEach((region, id) => {
        const held = region.cells.filter((cell) => layer.owner[cell] === current.seat);
        const site = sites[held.length > 0 ? heartOf(held, sites, across) : region.center];
        regionAnchors[id].set(site.x, site.y, site.z);
      });
      redraw(
        holdingBorders,
        sidesWhere((cell, other) => {
          if (other <= cell || other >= landCount) {
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
        const { a, b } = outline.joints[joint];
        if (grade <= 0 || !adjacent.has(a * landCount + b)) {
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
    const distance = camera.position.length();
    outward.copy(camera.position).divideScalar(distance);
    const facing = anchor.dot(outward) / Math.max(anchor.length(), 1e-6);
    spot.shown = label.textContent !== "" && facing >= 1 / distance + 0.03;
    if (spot.shown) {
      projected.copy(anchor).project(camera);
      spot.x = (projected.x * 0.5 + 0.5) * stage.clientWidth;
      spot.y = (0.5 - projected.y * 0.5) * stage.clientHeight;
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

  const present = () => {
    stale = false;
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
    renderer.render(scene, camera);
  };

  const fit = () => {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    const aspect = width / height;
    const half = Math.tan((FIELD_OF_VIEW * Math.PI) / 360);
    renderer.setSize(width, height);
    camera.aspect = aspect;
    camera.fov = (Math.atan(half / Math.min(1, aspect)) * 360) / Math.PI;
    camera.updateProjectionMatrix();
    for (const material of lineMaterials) {
      material.resolution.set(width, height);
    }
    present();
  };
  new ResizeObserver(fit).observe(stage);
  fit();

  const pointer = new Vector2();
  const raycaster = new Raycaster();
  const ball = new Sphere(new Vector3(), 1);
  const hit = new Vector3();
  const down = new Set<number>();
  let press: Press | null = null;
  renderer.domElement.addEventListener("pointerdown", (event) => {
    down.add(event.pointerId);
    press = down.size === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  });
  renderer.domElement.addEventListener("pointercancel", (event) => {
    down.delete(event.pointerId);
    press = null;
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    down.delete(event.pointerId);
    const started = press;
    press = null;
    if (started === null || started.id !== event.pointerId) {
      return;
    }
    const slack = event.pointerType === "mouse" ? CLICK_SLACK : TAP_SLACK;
    if (Math.hypot(event.clientX - started.x, event.clientY - started.y) > slack) {
      return;
    }
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      1 - ((event.clientY - bounds.top) / bounds.height) * 2,
    );
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectSphere(ball, hit) === null) {
      onPick(null, null);
      return;
    }
    const cell = nearest(sites, { x: hit.x, y: hit.y, z: hit.z });
    const land = cell < landCount;
    onPick(land ? regionOf(cell) : null, land ? cell : null);
  });

  let previous = performance.now();
  let presented = previous;
  const animate = (now: number) => {
    requestAnimationFrame(animate);
    const elapsed = (now - previous) / 1000;
    previous = now;
    const reach = (camera.position.length() - 1) * Math.tan((camera.fov * Math.PI) / 360);
    controls.rotateSpeed = Math.min(1, reach / Math.PI);
    controls.update();
    const flowing = frame?.running === true && frame.view.flows.length > 0;
    if (frame !== null && flowing) {
      phase += elapsed * FLOW_SPEED * Math.sqrt(frame.speed);
    }
    const due = flowing && (!coarse.matches || now - presented >= FLOW_FRAME);
    if (stale || due) {
      presented = now;
      present();
    }
  };
  requestAnimationFrame(animate);

  return { draw, face };
}
