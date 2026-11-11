import {
  type Constants,
  GROUND,
  NEUTRAL,
  type Outline,
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
import { arc, buildCells, nearest, neighborsAcross, triangulate } from "./geometry.ts";
import {
  BORDER,
  ENERGY,
  EXPANDING,
  FORCE,
  HOLDING_BORDER,
  MATTER,
  MOUNTAIN,
  OCEAN,
  PLAIN,
  powerColor,
  REGION_BORDER,
  SELECTION,
  STRAIT,
  UNEXPLORED,
} from "./palette.ts";

export interface Frame {
  view: View;
  constants: Constants;
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

interface Front {
  line: LineSegments2;
  material: LineMaterial;
  label: HTMLElement;
  anchor: Vector3;
}

const SURFACE_DEPTH = 1;
const STRAIT_STEPS = 12;
const PARTICLES = 3;
const STREAM_ROOM = 6000;
const ENERGY_UNIT = 0.3;
const FLOW_FLOOR = 0.005;
const FLOW_SPEED = 0.6;
const CLICK_SLACK = 5;
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
  onPick: (region: number | null) => void,
): Globe {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.append(renderer.domElement);
  const labels = el("div", { class: "labels" });
  stage.append(labels);

  const scene = new Scene();
  scene.background = new Color(0x05070c);
  const camera = new PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 0.9, 3.3);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minDistance = 1.3;
  controls.maxDistance = 6;

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
  const redraw = (line: LineSegments2, sides: Side[], radius: number) => {
    line.geometry.dispose();
    line.geometry = new LineSegmentsGeometry();
    line.visible = sides.length > 0;
    line.geometry.setPositions(sides.length > 0 ? trace(sides, radius) : HIDDEN);
    line.computeLineDistances();
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
  const works = fatLine(EXPANDING, 4);
  const selection = fatLine(SELECTION, 3);

  const adjacent = new Set<number>();
  for (let cell = 0; cell < landCount; cell++) {
    for (const other of across[cell]) {
      if (other >= 0 && other < landCount) {
        adjacent.add(cell * landCount + other);
      }
    }
  }
  const straits = outline.joints
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
      return { edge: joint.edge ?? 0, line, material };
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
  const matterStream = createStream(MATTER, 5);
  const energyStream = createStream(ENERGY, 3);
  const forceStream = createStream(FORCE, 6);

  const regionLabels = outline.regions.map(() => {
    const label = el("div", { class: "label" });
    labels.append(label);
    return label;
  });
  const regionAnchors = outline.regions.map((region) => {
    const center = sites[region.center];
    return new Vector3(center.x, center.y, center.z);
  });
  const fronts = new Map<string, Front>();

  let frame: Frame | null = null;
  let shownSelection: number | null = null;
  let shownOwners = "";
  let shownWorks = "";
  let phase = 0;
  let faced = false;

  const face = (region: number) => {
    const distance = camera.position.length();
    camera.position.copy(regionAnchors[region]).setLength(distance);
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
        const label = el("div", { class: "label pressure" });
        labels.append(label);
        front = { line, material, label, anchor: new Vector3() };
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
      redraw(front.line, sides, 1.006);
      const active = pressure.activeAt <= current.view.tick;
      front.material.color.setHex(powerColor(pressure.power));
      if (front.material.dashed === active) {
        front.material.dashed = !active;
        front.material.needsUpdate = true;
      }
      front.anchor.set(0, 0, 0);
      for (const { cell, side } of sides) {
        const corner = cells[cell].corners[side];
        front.anchor.x += corner.x;
        front.anchor.y += corner.y;
        front.anchor.z += corner.z;
      }
      const text = active
        ? `⚔ ${pressure.commit.toFixed(0)}`
        : `in ${pressure.activeAt - current.view.tick}`;
      front.label.textContent = sides.length > 0 ? text : "";
      front.label.style.color = `#${powerColor(pressure.power).toString(16).padStart(6, "0")}`;
      if (sides.length > 0) {
        front.anchor.setLength(1.02);
      }
    }
    for (const [key, front] of fronts) {
      if (!wanted.has(key)) {
        scene.remove(front.line);
        front.line.geometry.dispose();
        front.material.dispose();
        lineMaterials.splice(lineMaterials.indexOf(front.material), 1);
        front.label.remove();
        fronts.delete(key);
      }
    }
  };

  const draw = (current: Frame) => {
    frame = current;
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

    const owners = layer.owner.join(",");
    if (owners !== shownOwners) {
      shownOwners = owners;
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

    const expanding = current.view.edges
      .filter((edge) => edge.expanding !== null)
      .map((edge) => edge.id);
    if (expanding.join(",") !== shownWorks) {
      shownWorks = expanding.join(",");
      const pairs = new Set(expanding.map((id) => `${outline.edges[id].a}:${outline.edges[id].b}`));
      redraw(
        works,
        sidesWhere(
          (cell, other) => other < landCount && pairs.has(`${regionOf(cell)}:${regionOf(other)}`),
        ),
        1.005,
      );
    }
    for (const strait of straits) {
      const edge = current.view.edges[strait.edge];
      strait.line.visible = edge.kind !== null;
      strait.material.color.setHex(edge.expanding === null ? STRAIT : EXPANDING);
      strait.material.linewidth = 1.5 + 0.5 * (edge.expansions ?? 0);
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
  const emit = (stream: Stream, joint: number, signed: number, load: number, shift: number) => {
    if (Math.abs(signed) < FLOW_FLOOR) {
      return;
    }
    const { a, b } = outline.joints[joint];
    const count = Math.max(1, Math.min(PARTICLES, Math.ceil(load * PARTICLES)));
    for (let particle = 0; particle < count && stream.used < STREAM_ROOM; particle++) {
      const share = (phase + shift + particle / count) % 1;
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
    const { landCapacity, forcePerCapacity } = current.constants;
    for (const flow of current.view.flows) {
      emit(matterStream, flow.joint, flow.matter, Math.abs(flow.matter) / landCapacity, 0);
      emit(energyStream, flow.joint, flow.energy, Math.abs(flow.energy) / ENERGY_UNIT, 0.33);
      emit(
        forceStream,
        flow.joint,
        flow.force,
        Math.abs(flow.force) / (landCapacity * forcePerCapacity),
        0.66,
      );
    }
    for (const stream of streams) {
      stream.positions.needsUpdate = true;
      stream.geometry.setDrawRange(0, stream.used);
    }
  };

  const outward = new Vector3();
  const projected = new Vector3();
  const place = (label: HTMLElement, anchor: Vector3) => {
    const distance = camera.position.length();
    outward.copy(camera.position).divideScalar(distance);
    const facing = anchor.dot(outward) / Math.max(anchor.length(), 1e-6);
    if (label.textContent === "" || facing < 1 / distance + 0.03) {
      label.style.display = "none";
      return;
    }
    projected.copy(anchor).project(camera);
    const x = (projected.x * 0.5 + 0.5) * stage.clientWidth;
    const y = (0.5 - projected.y * 0.5) * stage.clientHeight;
    label.style.display = "";
    label.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  };

  const fit = () => {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    for (const material of lineMaterials) {
      material.resolution.set(width, height);
    }
  };
  new ResizeObserver(fit).observe(stage);
  fit();

  const pointer = new Vector2();
  const pressed = new Vector2();
  const raycaster = new Raycaster();
  const ball = new Sphere(new Vector3(), 1);
  const hit = new Vector3();
  renderer.domElement.addEventListener("pointerdown", (event) => {
    pressed.set(event.clientX, event.clientY);
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (pressed.distanceTo(pointer.set(event.clientX, event.clientY)) > CLICK_SLACK) {
      return;
    }
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      1 - ((event.clientY - bounds.top) / bounds.height) * 2,
    );
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectSphere(ball, hit) === null) {
      onPick(null);
      return;
    }
    const cell = nearest(sites, { x: hit.x, y: hit.y, z: hit.z });
    onPick(cell < landCount ? regionOf(cell) : null);
  });

  let previous = performance.now();
  const animate = (now: number) => {
    const elapsed = (now - previous) / 1000;
    previous = now;
    controls.update();
    if (frame !== null) {
      if (frame.running) {
        phase = (phase + elapsed * FLOW_SPEED * Math.sqrt(frame.speed)) % 1;
      }
      placeFlows(frame);
    }
    regionLabels.forEach((label, id) => {
      place(label, regionAnchors[id]);
    });
    for (const front of fronts.values()) {
      place(front.label, front.anchor);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);

  return { draw, face };
}
