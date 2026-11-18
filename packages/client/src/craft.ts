import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from "three";

export interface Craft {
  frame: Group;
  lights: Group;
  pose(nose: Vector3, roof: Vector3, throttle: number, sun: Vector3, lit: number): void;
}

export const CRAFT_REACH = 8;

const HULL = 0xc9ced6;
const DARK = 0x2a2d33;
const PANEL = 0x1b2a4a;
const FLAME = 0x9fc4ff;
const SUNLIGHT = 0xfff4e6;
const FILL = 0x46536a;
const SUN_MIGHT = 3.2;
const FILL_MIGHT = 1;
const PLUME_LENGTH = 14;
const CORE_SHARE = 0.55;

function flare(radius: number, length: number): ConeGeometry {
  const shape = new ConeGeometry(radius, length, 20, 8, true);
  const spots = shape.getAttribute("position");
  const shades = new Float32Array(3 * spots.count);
  for (let index = 0; index < spots.count; index++) {
    const share = 0.5 - spots.getY(index) / length;
    shades.fill(share ** 2, 3 * index, 3 * index + 3);
  }
  shape.setAttribute("color", new BufferAttribute(shades, 3));
  return shape;
}

export function createCraft(unit: number): Craft {
  const model = new Group();
  const hull = new MeshStandardMaterial({
    color: HULL,
    metalness: 0.45,
    roughness: 0.55,
    side: DoubleSide,
  });
  const dark = new MeshStandardMaterial({
    color: DARK,
    metalness: 0.6,
    roughness: 0.5,
    side: DoubleSide,
  });
  const panel = new MeshStandardMaterial({ color: PANEL, metalness: 0.3, roughness: 0.35 });
  const flame = new MeshBasicMaterial({
    color: FLAME,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });

  const tank = new Mesh(new CylinderGeometry(1.5, 1.5, 7, 24), hull);
  const nose = new Mesh(new ConeGeometry(1.5, 3, 24), hull);
  nose.position.y = 5;
  const collar = new Mesh(new CylinderGeometry(1.55, 1.55, 0.5, 24), dark);
  collar.position.y = 2.6;
  const bell = new Mesh(new CylinderGeometry(0.5, 1.2, 1.6, 20, 1, true), dark);
  bell.position.y = -4.3;
  const wings = new Mesh(new BoxGeometry(13, 2.2, 0.08), panel);
  wings.position.y = -0.8;
  const mast = new Mesh(new CylinderGeometry(0.07, 0.07, 0.9, 8), dark);
  mast.rotation.x = Math.PI / 2;
  mast.position.set(0, 1.2, 1.9);
  const dish = new Mesh(new ConeGeometry(1, 0.5, 24, 1, true), hull);
  dish.rotation.x = -Math.PI / 2;
  dish.position.set(0, 1.2, 2.5);
  const plume = new Mesh(flare(1.05, PLUME_LENGTH), flame);
  plume.rotation.x = Math.PI;
  const core = new Mesh(flare(0.5, CORE_SHARE * PLUME_LENGTH), flame);
  core.position.y = (-(1 - CORE_SHARE) * PLUME_LENGTH) / 2;
  plume.add(core);
  model.add(tank, nose, collar, bell, wings, mast, dish, plume);
  model.scale.setScalar(1 / unit);

  const frame = new Group();
  frame.add(model);
  const sunlight = new DirectionalLight(SUNLIGHT, SUN_MIGHT);
  const fill = new AmbientLight(FILL, FILL_MIGHT);
  const lights = new Group();
  lights.add(sunlight, sunlight.target, fill);

  const side = new Vector3();
  const basis = new Matrix4();
  const warm = new Color(SUNLIGHT);
  return {
    frame,
    lights,
    pose(nose, roof, throttle, sun, lit) {
      side.crossVectors(nose, roof);
      frame.quaternion.setFromRotationMatrix(basis.makeBasis(side, nose, roof));
      sunlight.position.copy(sun);
      sunlight.color.copy(warm);
      sunlight.intensity = SUN_MIGHT * lit;
      const burning = Math.max(0, Math.min(1, throttle));
      flame.opacity = burning > 0 ? 0.35 + 0.5 * burning : 0;
      plume.visible = burning > 0;
      plume.scale.set(1, 0.25 + 0.75 * burning, 1);
      plume.position.y = -5.1 - (PLUME_LENGTH / 2) * plume.scale.y;
    },
  };
}
