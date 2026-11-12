export const POWER_COLORS = [0x3fa7ff, 0xff5a4d, 0xffc23f, 0xb07cff, 0x4dd6a0, 0xff8ad1];

export const OCEAN = 0x0f2740;
export const UNEXPLORED = 0x262a33;
export const PLAIN = 0x566b4a;
export const MOUNTAIN = 0x7b6c5c;
export const BORDER = 0x0a0d13;
export const SELECTION = 0xffffff;

export const REGION_BORDER = 0x05070c;
export const HOLDING_BORDER = 0xf2f5fa;
export const STRAIT = 0x5fb9de;
export const ROAD_ORDER = 0xfff4a8;
export const ROAD = 0xe9d8a6;
export const BREACH = 0xffffff;

export const MATTER = 0xffa64d;
export const ENERGY = 0xfff27a;
export const FORCE = 0xff4d79;

export function powerColor(power: number): number {
  return POWER_COLORS[power % POWER_COLORS.length];
}

export function css(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
