import type { Haul } from "./ledger.ts";
import { EXTRACTION, heldOf, levelCostOf, POWER } from "./rules.ts";
import { foresee } from "./step.ts";
import { BRANCHES, type State } from "./types.ts";

export interface MatterBooks {
  held: number;
  made: number;
  mined: number;
  asked: number;
  levels: number;
  roads: number;
  quarters: number;
  force: number;
  lost: number;
}

export interface EnergyBooks {
  made: number;
  generated: number;
  levels: number;
  force: number;
  quarters: number;
  roads: number;
  met: number;
  spare: number;
  lost: number;
}

export interface ForceBooks {
  held: number;
  room: number;
  yards: number;
  built: number;
  fought: number;
  starved: number;
  stranded: number;
  crowded: number;
  lost: number;
}

export interface Books {
  cells: number;
  capped: number;
  level: number;
  cap: number;
  branches: number[];
  heading: number[];
  matter: MatterBooks;
  energy: EnergyBooks;
  force: ForceBooks;
}

export interface Shipment {
  place: number;
  matter: number;
  energy: number;
  force: number;
}

export interface CellAccount {
  cell: number;
  progress: number;
  price: number;
  books: Books;
  sends: Shipment[];
}

export interface RegionAccount {
  region: number;
  books: Books;
  sends: Shipment[];
  receives: Shipment[];
}

export interface EconomyReport {
  books: Books;
  regions: RegionAccount[];
  focus: number | null;
  cells: CellAccount[];
}

type Cargo = "matter" | "energy" | "force";

const CARGOES: Cargo[] = ["matter", "energy", "force"];

function blankBooks(): Books {
  return {
    cells: 0,
    capped: 0,
    level: 0,
    cap: 0,
    branches: BRANCHES.map(() => 0),
    heading: BRANCHES.map(() => 0),
    matter: {
      held: 0,
      made: 0,
      mined: 0,
      asked: 0,
      levels: 0,
      roads: 0,
      quarters: 0,
      force: 0,
      lost: 0,
    },
    energy: {
      made: 0,
      generated: 0,
      levels: 0,
      force: 0,
      quarters: 0,
      roads: 0,
      met: 0,
      spare: 0,
      lost: 0,
    },
    force: {
      held: 0,
      room: 0,
      yards: 0,
      built: 0,
      fought: 0,
      starved: 0,
      stranded: 0,
      crowded: 0,
      lost: 0,
    },
  };
}

function addInto<Part extends Record<keyof Part, number>>(sum: Part, part: Part): void {
  for (const name in part) {
    sum[name] = (sum[name] + part[name]) as Part[typeof name];
  }
}

function shareOf(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

function addBooks(sum: Books, part: Books): void {
  sum.cells += part.cells;
  sum.capped += part.capped;
  sum.level += part.level;
  sum.cap += part.cap;
  part.branches.forEach((built, branch) => {
    sum.branches[branch] += built;
    sum.heading[branch] += part.heading[branch];
  });
  addInto(sum.matter, part.matter);
  addInto(sum.energy, part.energy);
  addInto(sum.force, part.force);
}

function ship(list: Shipment[], place: number, cargo: Cargo, amount: number): void {
  let shipment = list.find((known) => known.place === place);
  if (shipment === undefined) {
    shipment = { place, matter: 0, energy: 0, force: 0 };
    list.push(shipment);
  }
  shipment[cargo] += amount;
}

export function economyReportFor(state: State, power: number, focus: number | null): EconomyReport {
  const { constants, cells, map } = state;
  const ledger = foresee(state);
  const hauls: Record<Cargo, Haul[]> = {
    matter: ledger.matter.hauls,
    energy: ledger.energy.hauls,
    force: ledger.force.hauls,
  };

  const accounts = new Map<number, CellAccount>();
  cells.forEach((cell, id) => {
    if (cell.owner !== power) {
      return;
    }
    const place = map.cells[id];
    const books = blankBooks();
    const mining = constants.matterRate * cell.branches[EXTRACTION];
    const generating = constants.energyRate * cell.branches[POWER];
    books.cells = 1;
    books.capped = cell.level >= place.levelCap ? 1 : 0;
    books.level = cell.level;
    books.cap = place.levelCap;
    books.branches = cell.branches.slice();
    books.heading = ledger.wants[id].map((share) => share * cell.level);
    books.matter = {
      held: heldOf(cell.stock),
      made: ledger.matter.made[id],
      mined: ledger.matter.made[id] * shareOf(mining, constants.baseMatter + mining),
      asked: ledger.matter.asked[id],
      levels: ledger.matter.levels[id],
      roads: ledger.matter.roads[id],
      quarters: ledger.matter.quarters[id],
      force: ledger.matter.force[id],
      lost: 0,
    };
    books.energy = {
      made: ledger.energy.made[id],
      generated: ledger.energy.made[id] * shareOf(generating, constants.baseEnergy + generating),
      levels: ledger.energy.levels[id],
      force: ledger.energy.force[id],
      quarters: ledger.energy.quarters[id],
      roads: ledger.energy.roads[id],
      met: ledger.energy.met[id],
      spare: ledger.energy.spare[id],
      lost: 0,
    };
    books.force = {
      held: cell.force,
      room: cell.quarters,
      yards: ledger.force.yards[id],
      built: ledger.matter.force[id] / constants.forceCost,
      fought: ledger.force.fought[id],
      starved: ledger.force.starved[id],
      stranded: ledger.force.stranded[id],
      crowded: ledger.force.crowded[id],
      lost: 0,
    };
    accounts.set(id, {
      cell: id,
      progress: cell.progress,
      price: levelCostOf(constants, cell.level),
      books,
      sends: [],
    });
  });

  const regions = new Map<number, RegionAccount>();
  const regionOf = (cell: number): RegionAccount => {
    const id = map.cells[cell].region;
    let account = regions.get(id);
    if (account === undefined) {
      account = { region: id, books: blankBooks(), sends: [], receives: [] };
      regions.set(id, account);
    }
    return account;
  };

  for (const cargo of CARGOES) {
    for (const haul of hauls[cargo]) {
      const sender = accounts.get(haul.from);
      if (sender === undefined) {
        continue;
      }
      sender.books[cargo].lost += haul.sent - haul.arrived;
      ship(sender.sends, haul.to, cargo, haul.sent);
      const from = map.cells[haul.from].region;
      const to = map.cells[haul.to].region;
      if (from !== to) {
        ship(regionOf(haul.from).sends, to, cargo, haul.sent);
        ship(regionOf(haul.to).receives, from, cargo, haul.arrived);
      }
    }
  }

  const books = blankBooks();
  for (const account of accounts.values()) {
    addBooks(regionOf(account.cell).books, account.books);
    addBooks(books, account.books);
  }

  const byPlace = (left: Shipment, right: Shipment) => left.place - right.place;
  for (const account of regions.values()) {
    account.sends.sort(byPlace);
    account.receives.sort(byPlace);
  }
  return {
    books,
    regions: [...regions.values()].sort((left, right) => left.region - right.region),
    focus,
    cells: [...accounts.values()].filter((account) => map.cells[account.cell].region === focus),
  };
}
