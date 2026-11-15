import {
  ASTRONOMICAL_UNIT,
  type Body,
  classOf,
  createRandom,
  EARTH_MASS,
  formed,
  GIGAYEAR,
  kindled,
  type Physics,
  reliefOf,
  STAR_LEAST,
  SUN_GLOW,
  SUN_MASS,
} from "@barycenter/sim";
import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { createStudio } from "./bodies.ts";

const MASSES = [
  1e-8, 1e-6, 1e-5, 1e-4, 1e-3, 0.01, 0.1, 0.4, 1, 3, 5, 8, 17, 50, 100, 318, 1000, 3000, 8000,
  20000,
];
const PLACES = [0.02, 0.035, 0.06, 0.1, 0.2, 0.4, 0.7, 1, 1.6, 2.6, 4.5, 8, 14, 25, 40];
const STARS = [0.015, 0.03, 0.05, 0.07, 0.08, 0.15, 0.3, 0.5, 0.7, 0.85, 1, 1.15, 1.5, 2, 2.8];
const CAPTION = 44;
const MARGIN = 8;
const VIEW = 4.4;
const LEAN = 0.4;

const query = new URLSearchParams(location.search);
const numbers = (name: string, given: number[]) =>
  query
    .get(name)
    ?.split(",")
    .filter((part) => part !== "")
    .map(Number)
    .filter(Number.isFinite) ?? given;
const number = (name: string, given: number) => numbers(name, [given])[0] ?? given;

const masses = numbers("masses", MASSES);
const places = numbers("places", PLACES);
const stars = numbers("stars", STARS);
const seed = number("seed", 1);
const side = number("size", 150);
const detail = number("detail", 128);
const tick = number("tick", 0);
const age = GIGAYEAR * number("age", 4.5);

const random = createRandom(seed);
const draw = () => Math.floor(random.next() * 0x7fffffff);
const star = kindled(SUN_MASS * number("star", 1), age, random);
const lit = ASTRONOMICAL_UNIT * Math.sqrt(star.glow / SUN_GLOW);

const bodyOf = (physics: Physics, own: number): Body => ({
  id: 0,
  name: "",
  seed: own,
  parent: null,
  physics,
  radius: 1,
  orbit: 0,
  year: 0,
  phase: 0,
  tilt: 0,
  day: 1200,
  disks: physics.disks.map((disk) => ({
    inner: disk.inner / physics.radius,
    outer: disk.outer / physics.radius,
    year: 1,
  })),
  relief: reliefOf(physics, own),
});

const rows: Body[][] = masses.map((mass) =>
  places.map((place) => {
    const orbit = place * lit;
    const site = { star, distance: orbit, around: star, orbit };
    return bodyOf(formed(mass * EARTH_MASS, site, random), draw());
  }),
);
if (stars.length > 0) {
  rows.push(stars.map((mass) => bodyOf(kindled(mass * SUN_MASS, age, random), draw())));
}

const columns = Math.max(...rows.map((row) => row.length));
const sheet = document.createElement("canvas");
sheet.width = MARGIN + columns * (side + MARGIN);
sheet.height = MARGIN + rows.length * (side + CAPTION + MARGIN);
document.body.append(sheet);
const pen = sheet.getContext("2d");
if (pen === null) {
  throw new Error("no canvas");
}
pen.fillStyle = "#070a10";
pen.fillRect(0, 0, sheet.width, sheet.height);

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(side, side);
renderer.setClearColor(0x070a10);
const studio = createStudio(renderer);
const shine = studio.shineOf(bodyOf(star, 0));
const camera = new PerspectiveCamera(40, 1, 0.1, 100);
const sunward = new Vector3(-0.55, 0.35, 0.75).normalize();
const dark = new Vector3();

const written = (value: number) =>
  value >= 100 ? value.toFixed(0) : value >= 1 ? value.toPrecision(3) : value.toPrecision(2);

const paint = (body: Body, column: number, row: number) => {
  const look = studio.shape(body, shine);
  look.refine(detail);
  const scene = new Scene();
  look.frame.rotation.x = LEAN;
  scene.add(look.frame);
  camera.position.set(0, 0, VIEW * look.girth);
  camera.lookAt(0, 0, 0);
  scene.updateMatrixWorld(true);
  look.light(body.physics.orbit > 0 ? sunward : dark, 0, tick);
  renderer.render(scene, camera);
  const left = MARGIN + column * (side + MARGIN);
  const top = MARGIN + row * (side + CAPTION + MARGIN);
  pen.drawImage(renderer.domElement, left, top, side, side);
  look.dispose();

  const { physics } = body;
  const earths = physics.mass / EARTH_MASS;
  const mass =
    physics.mass >= 0.2 * STAR_LEAST
      ? `${written(physics.mass / SUN_MASS)} suns`
      : `${written(earths)} earths`;
  const extras = [
    physics.air > 0 ? `${written(physics.air / 1e5)} bar` : "",
    physics.disks.length === 0 ? "" : "ring",
  ].filter((extra) => extra !== "");
  pen.fillStyle = "#c8d0dc";
  pen.font = "12px system-ui, sans-serif";
  pen.fillText(classOf(physics), left, top + side + 14);
  pen.fillStyle = "#8894a6";
  pen.fillText(`${mass} · ${physics.heat.toFixed(0)} K`, left, top + side + 28);
  pen.fillText(extras.join(" · "), left, top + side + 42);
};

const next = () => new Promise((resolve) => requestAnimationFrame(resolve));
for (const [row, bodies] of rows.entries()) {
  for (const [column, body] of bodies.entries()) {
    paint(body, column, row);
    await next();
  }
}
document.body.dataset.done = "true";
