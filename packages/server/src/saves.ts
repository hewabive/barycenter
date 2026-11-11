import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SavedRoom } from "./room.ts";

let drafts = 0;

function pathOf(folder: string, room: string): string {
  return join(folder, `${room}.json`);
}

export async function loadSave(folder: string, room: string): Promise<SavedRoom | null> {
  let text: string;
  try {
    text = await readFile(pathOf(folder, room), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  return JSON.parse(text) as SavedRoom;
}

export async function setAside(folder: string, room: string): Promise<void> {
  await rename(pathOf(folder, room), join(folder, `${room}.unsupported.json`));
}

export async function writeSave(folder: string, room: string, saved: SavedRoom): Promise<void> {
  await mkdir(folder, { recursive: true });
  const target = pathOf(folder, room);
  drafts += 1;
  const draft = `${target}.${process.pid}.${drafts}.tmp`;
  await writeFile(draft, JSON.stringify(saved));
  await rename(draft, target);
}
