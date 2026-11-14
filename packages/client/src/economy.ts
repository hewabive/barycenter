import type { Watch } from "@barycenter/protocol";
import {
  type Books,
  BRANCHES,
  type CellAccount,
  type EconomyReport,
  type Shipment,
} from "@barycenter/sim";
import { amount, button, el, percent, write } from "./dom.ts";
import { BRANCH_LABELS, type Game } from "./model.ts";
import { createSheet, fill, type Line, type Sheet } from "./sheet.ts";

export interface Economy {
  open(focus: number | null): void;
  watch(): Watch | null;
  show(game: Game): void;
}

export interface EconomyActions {
  select(region: number): void;
  watch(watch: Watch | null): void;
}

type Entry = [label: string, value: string, note: string];

const SHOWN = 0.005;
const CARGOES = ["matter", "energy"] as const;
const BRANCH_COLUMNS = ["Branch", "Levels", "Share", "Heading to", "Makes a tick"];
const LEDGER_COLUMNS = [
  "Matter made",
  "Matter used",
  "Matter held",
  "Energy made",
  "Energy needed",
  "Supply",
  "What moves and what waits",
];
const REGION_COLUMNS = ["Region", "Cells", "Level", ...LEDGER_COLUMNS];
const CELL_COLUMNS = [
  "Cell",
  "Level",
  "Next level",
  ...BRANCHES.map((branch) => BRANCH_LABELS[branch]),
  ...LEDGER_COLUMNS,
];
const INTRO =
  "Every amount is what one tick makes, spends or loses, worked out for the coming tick. " +
  "Change an order while the game is paused and the numbers follow.";
const BRANCH_LEGEND =
  "Heading to is the share your cells would build now: it follows the land, what is short nearby " +
  "and your leaning. Built levels move toward it slowly.";
const REGION_LEGEND =
  "Matter used is what the region builds with. Supply is the share of its energy need that is met. " +
  "Force on the move is in the force report. Pick a region to see its cells.";
const CELL_LEGEND =
  "A branch shows the levels built and, after the arrow, where they are heading. " +
  "Next level shows the matter laid in and the time left at the present pace.";

function rate(value: number, digits = 2): string {
  return Math.abs(value) < 0.5 * 10 ** -digits ? "—" : amount(value, digits);
}

function signed(value: number, digits = 2): string {
  const size = rate(Math.abs(value), digits);
  return size === "—" ? "0" : `${value > 0 ? "+" : "−"}${size}`;
}

function shareOf(part: number, whole: number, of: string): string {
  if (whole < SHOWN || Math.abs(part) < SHOWN) {
    return "";
  }
  return `${part < 0 ? "−" : ""}${percent(Math.abs(part) / whole)} of ${of}`;
}

function usedOf(books: Books): number {
  const { matter } = books;
  return matter.levels + matter.roads + matter.quarters + matter.force;
}

function needOf(books: Books): number {
  const { energy } = books;
  return energy.levels + energy.force + energy.quarters + energy.roads;
}

function matterEntries(books: Books): Entry[] {
  const { matter } = books;
  const used = usedOf(books);
  const left = matter.made - used - matter.lost;
  const made = (part: number) => shareOf(part, matter.made, "made");
  return [
    ["Made", rate(matter.made), ""],
    ["· by the land itself", rate(matter.made - matter.mined), made(matter.made - matter.mined)],
    ["· by extraction levels", rate(matter.mined), made(matter.mined)],
    ["Built into levels", rate(matter.levels), made(matter.levels)],
    ["Built into roads", rate(matter.roads), made(matter.roads)],
    ["Built into garrison room", rate(matter.quarters), made(matter.quarters)],
    ["Built into force", rate(matter.force), made(matter.force)],
    ["Lost on the way", rate(matter.lost), made(matter.lost)],
    ["Left in stock", signed(left), made(left)],
    ["Held in stock", amount(matter.held), ""],
    ["Building that waits for matter", rate(matter.asked - used), ""],
  ];
}

function energyEntries(books: Books): Entry[] {
  const { energy } = books;
  const need = needOf(books);
  const made = (part: number) => shareOf(part, energy.made, "made");
  const needed = (part: number) => shareOf(part, need, "need");
  return [
    ["Made", rate(energy.made), ""],
    [
      "· by the land itself",
      rate(energy.made - energy.generated),
      made(energy.made - energy.generated),
    ],
    ["· by power levels", rate(energy.generated), made(energy.generated)],
    ["Needed", rate(need), ""],
    ["· by levels", rate(energy.levels), needed(energy.levels)],
    ["· by force", rate(energy.force), needed(energy.force)],
    ["· by garrison room", rate(energy.quarters), needed(energy.quarters)],
    ["· by roads", rate(energy.roads), needed(energy.roads)],
    ["Reached a use", rate(energy.met), made(energy.met)],
    ["Lost on the way", rate(energy.lost), made(energy.lost)],
    ["Found no use", rate(energy.spare), made(energy.spare)],
    ["Short of the need", rate(need - energy.met), needed(need - energy.met)],
  ];
}

function forceEntries(books: Books): Entry[] {
  const { force, matter } = books;
  const gone = force.fought + force.starved + force.stranded + force.crowded + force.lost;
  const cost = matter.force < SHOWN ? "" : `takes ${rate(matter.force)} matter`;
  return [
    ["Held", amount(force.held), `room for ${amount(force.room)}`],
    ["Shipyards can build", rate(force.yards, 3), ""],
    ["Built", rate(force.built, 3), cost],
    ["Lost in battle", rate(force.fought, 3), ""],
    ["Lost to energy shortage", rate(force.starved, 3), ""],
    ["Lost cut off from the capital", rate(force.stranded, 3), ""],
    ["Lost above the room in garrisons", rate(force.crowded, 3), ""],
    ["Lost on the way", rate(force.lost, 3), ""],
    ["Change", signed(force.built - gone, 3), ""],
  ];
}

function branchTexts(books: Books, index: number): string[] {
  const makes = [
    `${rate(books.matter.mined)} matter`,
    `${rate(books.energy.generated)} energy`,
    `${rate(books.force.built, 3)} force of ${rate(books.force.yards, 3)} possible`,
  ];
  const share = (levels: number) => (books.level > 0 ? percent(levels / books.level) : "—");
  return [
    amount(books.branches[index]),
    share(books.branches[index]),
    share(books.heading[index]),
    makes[index],
  ];
}

function ledgerTexts(books: Books): string[] {
  const need = needOf(books);
  return [
    rate(books.matter.made),
    rate(usedOf(books)),
    amount(books.matter.held),
    rate(books.energy.made),
    rate(need),
    need < SHOWN ? "—" : percent(books.energy.met / need),
  ];
}

function shipped(
  verb: string,
  side: string,
  shipments: Shipment[],
  place: (id: number) => string,
): string[] {
  return CARGOES.flatMap((cargo) => {
    const parts = shipments
      .filter((shipment) => shipment[cargo] >= SHOWN)
      .map((shipment) => `${rate(shipment[cargo])} ${side} ${place(shipment.place)}`);
    return parts.length === 0 ? [] : [`${verb} ${cargo}: ${parts.join(", ")}`];
  });
}

function notesOf(books: Books): string[] {
  const { matter } = books;
  const notes: string[] = [];
  const works: [string, number][] = [
    ["levels", matter.levels],
    ["roads", matter.roads],
    ["garrison room", matter.quarters],
    ["force", matter.force],
  ];
  const builds = works
    .filter(([, spent]) => spent >= SHOWN)
    .map(([name, spent]) => `${name} ${rate(spent)}`);
  if (builds.length > 0) {
    notes.push(`Builds: ${builds.join(", ")}`);
  }
  const waiting = matter.asked - usedOf(books);
  if (waiting >= SHOWN) {
    notes.push(`Building waits for ${rate(waiting)} matter`);
  }
  const lost = CARGOES.filter((cargo) => books[cargo].lost >= SHOWN).map(
    (cargo) => `${cargo} ${rate(books[cargo].lost)}`,
  );
  if (lost.length > 0) {
    notes.push(`Loses on the way: ${lost.join(", ")}`);
  }
  return notes;
}

function nextLevelOf(account: CellAccount): string {
  if (account.books.capped > 0) {
    return "at cap";
  }
  const laid = percent(account.progress / account.price);
  const pace = account.books.matter.levels;
  if (pace < SHOWN) {
    return `${laid} · waits`;
  }
  return `${laid} · ${Math.ceil((account.price - account.progress) / pace)} ticks`;
}

function headingOf(books: Books, index: number): string {
  const built = books.branches[index];
  const wanted = books.heading[index];
  return Math.abs(wanted - built) < 0.05 ? amount(built) : `${amount(built)} → ${amount(wanted)}`;
}

function plainLine(columns: string[], first: Node | string): Line {
  const cells = columns.slice(1).map(() => el("td"));
  return { row: el("tr", {}, el("td", {}, first), ...cells), cells };
}

function createBooks(title: string): Sheet {
  return createSheet("books", [title, "A tick", ""], "", (key) => {
    const line = plainLine(["", "", ""], key.replace("· ", ""));
    line.row.classList.toggle("part", key.startsWith("· "));
    return line;
  });
}

function showEntries(sheet: Sheet, entries: Entry[]): void {
  sheet.arrange(entries.map(([label]) => label));
  for (const [label, value, note] of entries) {
    fill(sheet.line(label), [value, note]);
  }
}

export function createEconomy(root: HTMLDialogElement, actions: EconomyActions): Economy {
  let focus: number | null = null;
  const totals = el("div", { class: "totals" });
  const waiting = el("div", { class: "hint" }, "Asking the server for the report.");
  const matter = createBooks("Matter");
  const energy = createBooks("Energy");
  const force = createBooks("Force");

  const cellsTitle = el("h3", {}, "Cells");
  const cellsHint = el("div", { class: "hint" });

  const watchNow = (): Watch => ({ subject: "economy", region: focus });

  const branches = createSheet("branches", BRANCH_COLUMNS, "", (key) =>
    plainLine(BRANCH_COLUMNS, key),
  );

  const regions = createSheet("regions", REGION_COLUMNS, "You hold no land.", (key) => {
    const link = el("a", { href: "#", class: "node-link" }, key);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      focus = Number(key);
      write(cellsHint, "Asking the server for the cells.");
      actions.watch(watchNow());
    });
    return plainLine(REGION_COLUMNS, link);
  });

  const cells = createSheet("cells", CELL_COLUMNS, "", (key) => plainLine(CELL_COLUMNS, key));
  const locate = button("Show on the globe", "Close the report and select this region", () => {
    const region = focus;
    root.close();
    if (region !== null) {
      actions.select(region);
    }
  });

  const scroll = el(
    "div",
    { class: "scroll", tabindex: "-1", autofocus: "" },
    el("h3", {}, "What turns into what"),
    el("div", { class: "ledgers" }, matter.block, energy.block, force.block),
    el("h3", {}, "What the levels do"),
    branches.block,
    el("div", { class: "hint" }, BRANCH_LEGEND),
    el("h3", {}, "Regions"),
    regions.block,
    el("div", { class: "hint" }, REGION_LEGEND),
    el("div", { class: "row" }, cellsTitle, locate),
    cells.block,
    cellsHint,
  );
  root.replaceChildren(
    el(
      "div",
      { class: "report" },
      el(
        "div",
        { class: "row" },
        el("h2", {}, "Economy report"),
        button("Close", "Esc", () => root.close()),
      ),
      waiting,
      totals,
      el("div", { class: "hint" }, INTRO),
      scroll,
    ),
  );
  root.addEventListener("click", (event) => {
    if (event.target === root) {
      root.close();
    }
  });
  root.addEventListener("close", () => actions.watch(null));

  const reveal = (ready: boolean) => {
    waiting.hidden = ready;
    totals.hidden = !ready;
    scroll.hidden = !ready;
  };

  const showPower = (report: EconomyReport) => {
    const { books } = report;
    const held = report.regions.length === 1 ? "1 region" : `${report.regions.length} regions`;
    write(
      totals,
      `${books.cells} cells in ${held} · level ${books.level} of ${books.cap} · ` +
        `${books.capped} cells built to their cap`,
    );
    showEntries(matter, matterEntries(books));
    showEntries(energy, energyEntries(books));
    showEntries(force, forceEntries(books));
    branches.arrange(BRANCHES.map((branch) => BRANCH_LABELS[branch]));
    BRANCHES.forEach((branch, index) => {
      fill(branches.line(BRANCH_LABELS[branch]), branchTexts(books, index));
    });
  };

  const showRegions = (report: EconomyReport) => {
    const regionName = (id: number) => `region ${id}`;
    regions.arrange(report.regions.map((account) => String(account.region)));
    for (const account of report.regions) {
      const { books } = account;
      const capped =
        books.capped > 0 ? [`${books.capped} of ${books.cells} cells are built to their cap`] : [];
      const line = regions.line(String(account.region));
      line.row.classList.toggle("focused", account.region === focus);
      fill(line, [
        String(books.cells),
        `${books.level} / ${books.cap}`,
        ...ledgerTexts(books),
        [
          ...notesOf(books),
          ...shipped("Sends", "to", account.sends, regionName),
          ...shipped("Gets", "from", account.receives, regionName),
          ...capped,
        ].join("\n"),
      ]);
    }
  };

  const showCells = (report: EconomyReport) => {
    write(cellsTitle, focus === null ? "Cells" : `Cells of region ${focus}`);
    locate.hidden = focus === null;
    if (focus === null) {
      cells.arrange([]);
      write(cellsHint, "Pick a region in the table above to see its cells.");
      return;
    }
    if (report.focus !== focus) {
      return;
    }
    const cellName = (id: number) => `#${id}`;
    cells.arrange(report.cells.map((account) => cellName(account.cell)));
    for (const account of report.cells) {
      const { books } = account;
      fill(cells.line(cellName(account.cell)), [
        `${books.level} / ${books.cap}`,
        nextLevelOf(account),
        ...BRANCHES.map((_, index) => headingOf(books, index)),
        ...ledgerTexts(books),
        [...notesOf(books), ...shipped("Sends", "to", account.sends, cellName)].join("\n"),
      ]);
    }
    write(
      cellsHint,
      report.cells.length > 0 ? CELL_LEGEND : `You hold no cells in region ${focus}.`,
    );
  };

  return {
    open(region) {
      if (root.open) {
        return;
      }
      focus = region;
      reveal(false);
      root.showModal();
      actions.watch(watchNow());
    },
    watch() {
      return root.open ? watchNow() : null;
    },
    show(game) {
      if (!root.open || game.economy === null) {
        return;
      }
      showPower(game.economy);
      showRegions(game.economy);
      showCells(game.economy);
      reveal(true);
    },
  };
}
