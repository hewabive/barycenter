import type { Constants, NodeView, Outline, Vector, View } from "@barycenter/sim";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineLoop,
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
import { el } from "./dom.ts";
import { arc, buildCells, nearest, outlineOfCell, triangulate } from "./geometry.ts";
import {
  BORDER,
  EDGE_COLORS,
  EDGE_EXPANDING,
  EDGE_UNKNOWN,
  ENERGY,
  FORCE,
  MATTER,
  MOUNTAIN,
  OCEAN,
  PLAIN,
  powerColor,
  SELECTION,
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
  face(node: number): void;
}

interface Stream {
  positions: Float32BufferAttribute;
  geometry: BufferGeometry;
  used: number;
}

interface Campaign {
  line: Line2;
  material: LineMaterial;
  path: Vector[];
  label: HTMLElement;
  anchor: Vector3;
  active: boolean;
  commit: number;
}

const SURFACE_DEPTH = 2;
const EDGE_STEPS = 16;
const PRESSURE_STEPS = 20;
const PARTICLES = 6;
const ENERGY_UNIT = 0.3;
const FLOW_FLOOR = 0.005;
const FLOW_SPEED = 0.35;
const CLICK_SLACK = 5;
const ROLE_GLYPHS = { extraction: "E", power: "P", shipyard: "S" };

function flat(points: Vector[]): number[] {
  const values: number[] = [];
  for (const point of points) {
    values.push(point.x, point.y, point.z);
  }
  return values;
}

function along(path: Vector[], share: number, target: Vector3): void {
  const scaled = share * (path.length - 1);
  const index = Math.min(Math.floor(scaled), path.length - 2);
  const blend = scaled - index;
  const from = path[index];
  const to = path[index + 1];
  target.set(
    from.x + (to.x - from.x) * blend,
    from.y + (to.y - from.y) * blend,
    from.z + (to.z - from.z) * blend,
  );
}

function labelOf(node: NodeView, seat: number): { text: string; tone: string } {
  if (node.nature === null) {
    return { text: "", tone: "dim" };
  }
  const matter = node.nature.matterRichness.toFixed(1);
  const energy = node.nature.energyRichness.toFixed(1);
  const land = `${node.id} · M${matter} E${energy}`;
  if (node.status === null) {
    return { text: land, tone: "dim" };
  }
  if (node.status.owner === null) {
    return { text: land, tone: "plain" };
  }
  if (node.status.owner === seat && node.status.role === null) {
    return { text: `${node.id} · choose a role`, tone: "alert" };
  }
  const glyph = node.status.role === null ? "–" : ROLE_GLYPHS[node.status.role];
  const force = node.status.force >= 0.5 ? ` ⚔${node.status.force.toFixed(0)}` : "";
  const short = node.status.supply < 0.99;
  const supply = short ? ` ⚡${Math.round(node.status.supply * 100)}%` : "";
  const text = `${node.id} · ${glyph}${node.status.level}${force}${supply}`;
  return { text, tone: short ? "alert" : "plain" };
}

export function createGlobe(
  stage: HTMLElement,
  outline: Outline,
  onPick: (node: number | null) => void,
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
  controls.minDistance = 1.5;
  controls.maxDistance = 6;

  const sites = [...outline.nodes.map((node) => node.position), ...outline.oceans];
  const cells = buildCells(sites);
  const landCount = outline.nodes.length;
  const lineMaterials: LineMaterial[] = [];

  const ranges: { start: number; count: number }[] = [];
  const surfacePositions: number[] = [];
  for (const cell of cells) {
    const vertices = triangulate(cell, SURFACE_DEPTH);
    ranges.push({ start: surfacePositions.length / 3, count: vertices.length });
    surfacePositions.push(...flat(vertices));
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

  const borderPositions: number[] = [];
  for (const cell of cells) {
    const loop = outlineOfCell(cell, 3, 1.002);
    loop.forEach((point, index) => {
      const next = loop[(index + 1) % loop.length];
      borderPositions.push(point.x, point.y, point.z, next.x, next.y, next.z);
    });
  }
  const borders = new BufferGeometry();
  borders.setAttribute("position", new Float32BufferAttribute(borderPositions, 3));
  scene.add(new LineSegments(borders, new LineBasicMaterial({ color: BORDER })));

  const selection = new LineLoop(new BufferGeometry(), new LineBasicMaterial({ color: SELECTION }));
  selection.visible = false;
  scene.add(selection);

  const edges = outline.edges.map((edge) => {
    const path = arc(sites[edge.a], sites[edge.b], EDGE_STEPS, 1.006, 0.018);
    const geometry = new LineGeometry();
    geometry.setPositions(flat(path));
    const material = new LineMaterial({ color: EDGE_UNKNOWN, linewidth: 1 });
    lineMaterials.push(material);
    const line = new Line2(geometry, material);
    scene.add(line);
    return { path, line, material };
  });

  const createStream = (color: number, size: number): Stream => {
    const capacity = (outline.edges.length + 64) * PARTICLES;
    const positions = new Float32BufferAttribute(new Float32Array(capacity * 3), 3);
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
  const matterStream = createStream(MATTER, 7);
  const energyStream = createStream(ENERGY, 4);
  const forceStream = createStream(FORCE, 7);

  const nodeLabels = outline.nodes.map(() => {
    const label = el("div", { class: "label" });
    labels.append(label);
    return label;
  });
  const nodeAnchors = outline.nodes.map(
    (node) => new Vector3(node.position.x, node.position.y, node.position.z),
  );
  const campaigns = new Map<string, Campaign>();

  let frame: Frame | null = null;
  let shownSelection: number | null = null;
  let phase = 0;
  let faced = false;

  const face = (node: number) => {
    const site = sites[node];
    const distance = camera.position.length();
    camera.position.set(site.x, site.y, site.z).multiplyScalar(distance);
    controls.update();
  };

  const select = (node: number | null) => {
    if (node === shownSelection) {
      return;
    }
    shownSelection = node;
    selection.visible = node !== null;
    if (node !== null) {
      const loop = outlineOfCell(cells[node], 4, 1.004);
      selection.geometry.dispose();
      selection.geometry = new BufferGeometry();
      selection.geometry.setAttribute("position", new Float32BufferAttribute(flat(loop), 3));
    }
  };

  const syncCampaigns = (current: Frame) => {
    const wanted = new Set<string>();
    for (const pressure of current.view.pressures) {
      const key = `${pressure.from}>${pressure.to}`;
      wanted.add(key);
      let campaign = campaigns.get(key);
      if (campaign === undefined) {
        const path = arc(sites[pressure.from], sites[pressure.to], PRESSURE_STEPS, 1.01, 0.14);
        const geometry = new LineGeometry();
        geometry.setPositions(flat(path));
        const material = new LineMaterial({ linewidth: 3, dashSize: 0.03, gapSize: 0.03 });
        material.resolution.set(stage.clientWidth, stage.clientHeight);
        lineMaterials.push(material);
        const line = new Line2(geometry, material);
        line.computeLineDistances();
        scene.add(line);
        const label = el("div", { class: "label pressure" });
        labels.append(label);
        const anchor = new Vector3();
        along(path, 0.6, anchor);
        campaign = { line, material, path, label, anchor, active: false, commit: 0 };
        campaigns.set(key, campaign);
      }
      const active = pressure.activeAt <= current.view.tick;
      campaign.material.color.setHex(powerColor(pressure.power));
      if (campaign.material.dashed === active) {
        campaign.material.dashed = !active;
        campaign.material.needsUpdate = true;
      }
      campaign.active = active;
      campaign.commit = pressure.commit;
      campaign.label.textContent = active
        ? `⚔ ${pressure.commit.toFixed(0)}`
        : `in ${pressure.activeAt - current.view.tick}`;
      campaign.label.style.color = `#${powerColor(pressure.power).toString(16).padStart(6, "0")}`;
    }
    for (const [key, campaign] of campaigns) {
      if (!wanted.has(key)) {
        scene.remove(campaign.line);
        campaign.line.geometry.dispose();
        campaign.material.dispose();
        lineMaterials.splice(lineMaterials.indexOf(campaign.material), 1);
        campaign.label.remove();
        campaigns.delete(key);
      }
    }
  };

  const draw = (current: Frame) => {
    frame = current;
    current.view.nodes.forEach((node, id) => {
      const label = labelOf(node, current.seat);
      nodeLabels[id].textContent = label.text;
      nodeLabels[id].className = `label ${label.tone}`;
      if (node.nature === null) {
        paint(id, UNEXPLORED, 1);
        return;
      }
      const ground = node.nature.terrain === "mountain" ? MOUNTAIN : PLAIN;
      if (node.status === null) {
        paint(id, ground, 0.45);
      } else if (node.status.owner === null) {
        paint(id, ground, 1);
      } else {
        const growth = node.status.level / node.nature.levelCap;
        paint(id, powerColor(node.status.owner), 0.45 + 0.55 * growth);
      }
    });

    current.view.edges.forEach((edge, id) => {
      const { material, line } = edges[id];
      line.visible = edge.kind !== null;
      if (edge.kind === null || edge.capacity === null) {
        return;
      }
      material.color.setHex(edge.expanding === null ? EDGE_COLORS[edge.kind] : EDGE_EXPANDING);
      material.linewidth = 0.8 + 0.9 * edge.capacity;
    });

    syncCampaigns(current);
    select(current.selected);
    if (!faced) {
      const home = current.view.nodes.find((node) => node.holding !== null);
      if (home !== undefined) {
        face(home.id);
        faced = true;
      }
    }
  };

  const spot = new Vector3();
  const emit = (stream: Stream, path: Vector[], signed: number, load: number, shift: number) => {
    if (Math.abs(signed) < FLOW_FLOOR) {
      return;
    }
    const count = Math.max(1, Math.min(PARTICLES, Math.ceil(load * PARTICLES)));
    for (let particle = 0; particle < count; particle++) {
      const share = (phase + shift + particle / count) % 1;
      along(path, signed > 0 ? share : 1 - share, spot);
      stream.positions.setXYZ(stream.used, spot.x, spot.y, spot.z);
      stream.used += 1;
    }
  };

  const placeFlows = (current: Frame) => {
    for (const stream of [matterStream, energyStream, forceStream]) {
      stream.used = 0;
    }
    const forceUnit = current.constants.forcePerCapacity;
    current.view.edges.forEach((edge, id) => {
      const capacity = edge.capacity ?? 1;
      const path = edges[id].path;
      emit(matterStream, path, edge.matterFlow, Math.abs(edge.matterFlow) / capacity, 0);
      emit(energyStream, path, edge.energyFlow, Math.abs(edge.energyFlow) / ENERGY_UNIT, 0.33);
      emit(
        forceStream,
        path,
        edge.forceFlow,
        Math.abs(edge.forceFlow) / (capacity * forceUnit),
        0.66,
      );
    });
    for (const campaign of campaigns.values()) {
      if (campaign.active) {
        emit(forceStream, campaign.path, campaign.commit, campaign.commit / 20, 0);
      }
    }
    for (const stream of [matterStream, energyStream, forceStream]) {
      stream.positions.needsUpdate = true;
      stream.geometry.setDrawRange(0, stream.used);
    }
  };

  const outward = new Vector3();
  const projected = new Vector3();
  const place = (label: HTMLElement, anchor: Vector3) => {
    const distance = camera.position.length();
    outward.copy(camera.position).divideScalar(distance);
    const facing = anchor.dot(outward) / anchor.length();
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
    onPick(cell < landCount ? cell : null);
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
    nodeLabels.forEach((label, id) => {
      place(label, nodeAnchors[id]);
    });
    for (const campaign of campaigns.values()) {
      place(campaign.label, campaign.anchor);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);

  return { draw, face };
}
