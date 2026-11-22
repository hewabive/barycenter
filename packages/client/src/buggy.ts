import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";

export interface Buggy {
  frame: Group;
  pose(ahead: Vector3, up: Vector3): void;
}

export const BUGGY_REACH = 4;

const SHELL = 0xd9dce0;
const GLASS = 0x18304f;
const TYRE = 0x25272b;
const GOLD = 0xb38a3a;

export function createBuggy(unit: number): Buggy {
  const shell = new MeshStandardMaterial({ color: SHELL, metalness: 0.3, roughness: 0.6 });
  const glass = new MeshStandardMaterial({ color: GLASS, metalness: 0.6, roughness: 0.25 });
  const tyre = new MeshStandardMaterial({ color: TYRE, metalness: 0.2, roughness: 0.9 });
  const gold = new MeshStandardMaterial({ color: GOLD, metalness: 0.7, roughness: 0.4 });

  const model = new Group();
  const deck = new Mesh(new BoxGeometry(2, 0.5, 4.2), shell);
  deck.position.y = 1.05;
  const cabin = new Mesh(new BoxGeometry(1.7, 0.9, 1.9), shell);
  cabin.position.set(0, 1.75, 0.7);
  const screen = new Mesh(new BoxGeometry(1.5, 0.5, 0.1), glass);
  screen.position.set(0, 1.85, 1.66);
  const pack = new Mesh(new BoxGeometry(1.5, 0.5, 1.3), gold);
  pack.position.set(0, 1.55, -1.2);
  const mast = new Mesh(new CylinderGeometry(0.04, 0.04, 1.3, 8), tyre);
  mast.position.set(0.6, 2.4, -1.5);
  const dish = new Mesh(new CylinderGeometry(0.45, 0.1, 0.2, 16), shell);
  dish.position.set(0.6, 3.1, -1.5);
  model.add(deck, cabin, screen, pack, mast, dish);
  const rim = new CylinderGeometry(0.6, 0.6, 0.45, 18).rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    for (const along of [-1.6, 0, 1.6]) {
      const wheel = new Mesh(rim, tyre);
      wheel.position.set(side * 1.25, 0.6, along);
      model.add(wheel);
    }
  }
  model.scale.setScalar(1 / unit);

  const frame = new Group();
  frame.add(model);
  const left = new Vector3();
  const basis = new Matrix4();
  return {
    frame,
    pose(ahead, up) {
      left.crossVectors(up, ahead).normalize();
      frame.quaternion.setFromRotationMatrix(
        basis.makeBasis(left, up, ahead.crossVectors(left, up)),
      );
    },
  };
}
