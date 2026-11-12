import assert from "node:assert/strict";
import { test } from "node:test";
import { type State, step, viewFor } from "../src/index.ts";
import { routeMatter, worksOf } from "../src/matter.ts";
import { fresh, ownNeighbor, run } from "./support.ts";

function jointBetween(state: State, from: number, to: number): number {
  const link = state.map.links[from].find((candidate) => candidate.cell === to);
  assert.ok(link);
  return link.joint;
}

function settle(state: State, power: number, region: number): void {
  for (const cell of state.map.regions[region].cells) {
    state.cells[cell].owner = power;
  }
}

function outpost(state: State, home: number): { edge: number; region: number; cell: number } {
  const { edge, region } = state.map.neighbors[home][0];
  const { a, b } = state.map.joints[state.map.edges[edge].joints[0]];
  const cell = state.map.cells[a].region === home ? b : a;
  state.cells[cell].owner = 0;
  return { edge, region, cell };
}

test("matter loses a share on every hop and less along a road", () => {
  const arrived = (grade: number): number => {
    const { state, capital } = fresh();
    const donor = ownNeighbor(state, capital);
    const joint = jointBetween(state, donor, capital);
    for (const cell of state.cells) {
      cell.stock[0] = 0;
    }
    state.cells[donor].stock[0] = 50;
    state.joints[joint].grade = grade;
    const potential = state.cells.map((_, id) => (id === capital ? 1 : 0));
    routeMatter(state, { reserve: state.cells.map(() => 0), potential });
    assert.ok(Math.abs(state.joints[joint].matterFlow) > 0);
    return state.cells[capital].stock[0] / Math.abs(state.joints[joint].matterFlow);
  };
  const { constants } = fresh().state;
  assert.ok(Math.abs(arrived(0) - (1 - constants.hopLoss)) < 1e-9);
  assert.ok(arrived(2) > arrived(0));
  assert.ok(arrived(2) < 1);
});

test("a road carries more than open ground", () => {
  const { state, home } = fresh();
  const { edge } = state.map.neighbors[home][0];
  const before = viewFor(state, 0).edges[edge].capacity ?? 0;
  assert.ok(before > 0);
  state.joints[state.map.edges[edge].joints[0]].grade = 1;
  assert.ok((viewFor(state, 0).edges[edge].capacity ?? 0) > before);
});

test("a joint that stays busy is built up and a quiet one is left alone", () => {
  const { state, capital } = fresh();
  const neighbor = ownNeighbor(state, capital);
  const joint = jointBetween(state, neighbor, capital);
  const idle = state.joints.map(() => false);
  assert.equal(worksOf(state, idle)[capital].length, 0);
  state.joints[joint].load = 1;
  const works = worksOf(state, idle);
  assert.deepEqual(
    works[capital].map((work) => work.joint),
    [joint],
  );
  assert.deepEqual(
    works[neighbor].map((work) => work.joint),
    [joint],
  );
});

test("a road order lays a trunk between the hubs of two holdings", () => {
  const { state, capital, home } = fresh();
  settle(state, 0, home);
  const { edge, cell } = outpost(state, home);
  for (const own of state.cells) {
    if (own.owner === 0) {
      own.stock[0] = 500;
    }
  }
  const ordered = step(state, [{ kind: "road", power: 0, edge, active: true }]);
  assert.deepEqual(ordered.rejections, []);
  assert.equal(viewFor(ordered.state, 0).edges[edge].road, true);
  const after = run(ordered.state, 800);
  const top = after.constants.maxGrade;
  const reached = new Set([capital]);
  const queue = [capital];
  for (let head = 0; head < queue.length; head++) {
    for (const link of after.map.links[queue[head]]) {
      if (after.joints[link.joint].grade === top && !reached.has(link.cell)) {
        reached.add(link.cell);
        queue.push(link.cell);
      }
    }
  }
  assert.ok(reached.has(cell));
  const built = after.joints.filter((joint) => joint.grade > 0).length;
  assert.ok(built < after.map.regions[home].cells.length);
  assert.ok(viewFor(after, 0).roads.some((grade) => grade === top));
});

test("a road order needs land on both sides and lapses when one side is lost", () => {
  const { state, home } = fresh();
  const { edge, cell } = outpost(state, home);
  state.cells[cell].owner = null;
  const refused = step(state, [{ kind: "road", power: 0, edge, active: true }]);
  assert.equal(refused.rejections.length, 1);

  state.cells[cell].owner = 0;
  const ordered = step(state, [{ kind: "road", power: 0, edge, active: true }]).state;
  assert.equal(ordered.powers[0].roads[edge], true);
  ordered.cells[cell].owner = null;
  assert.equal(step(ordered, []).state.powers[0].roads[edge], false);
});

test("a road that nothing uses wears away", () => {
  const { state, capital } = fresh();
  const joint = jointBetween(state, ownNeighbor(state, capital), capital);
  state.joints[joint].grade = 1;
  for (const cell of state.cells) {
    cell.stock[0] = 0;
    cell.force = 0;
  }
  const { roadCost, roadDecay } = state.constants;
  const soon = run(state, 20);
  assert.equal(soon.joints[joint].grade, 1);
  const worn = run(state, Math.ceil(roadCost / roadDecay) + 60);
  assert.equal(worn.joints[joint].grade, 0);
});

test("a view shows the roads only where the power can see", () => {
  const { state, home } = fresh();
  const seen = new Set([home, ...state.map.neighbors[home].map((neighbor) => neighbor.region)]);
  for (const joint of state.joints) {
    joint.grade = 2;
  }
  const roads = viewFor(state, 0).roads;
  state.map.joints.forEach((joint, id) => {
    const visible =
      seen.has(state.map.cells[joint.a].region) && seen.has(state.map.cells[joint.b].region);
    assert.equal(roads[id], visible ? 2 : 0);
  });
});
