const RING = "M17 12a5 5 0 1 1-10 0a5 5 0 1 1 10 0Z";
const DOT = "M12.9 12a.9.9 0 1 1-1.8 0a.9.9 0 1 1 1.8 0Z";

export const GLYPHS = {
  hold: "M3 12H8.5L12 15.5L15.5 12H21",
  prograde: `${RING}M12 7V2.5M7 12H2.5M17 12H21.5${DOT}`,
  retrograde: `${RING}M8.5 8.5L15.5 15.5M15.5 8.5L8.5 15.5M12 7V2.5M7.7 14.5L3.6 16.9M16.3 14.5L20.4 16.9`,
  normal: `M12 4.5L19.8 18H4.2Z${DOT}`,
  antinormal: `M12 19.5L4.2 6H19.8Z${DOT}`,
  outward:
    "M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0ZM14.9 14.9L19 19M9.1 14.9L5 19M14.9 9.1L19 5M9.1 9.1L5 5",
  inward:
    "M18.5 12a6.5 6.5 0 1 1-13 0a6.5 6.5 0 1 1 13 0ZM16.4 16.4L13.6 13.6M7.6 16.4L10.4 13.6M16.4 7.6L13.6 10.4M7.6 7.6L10.4 10.4",
  plan: `M12 3.5L20.5 12L12 20.5L3.5 12Z${DOT}`,
  target: `M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0ZM12 2.5V6M12 18V21.5M2.5 12H6M18 12H21.5${DOT}`,
} as const;

export type Glyph = keyof typeof GLYPHS;

const SVG = "http://www.w3.org/2000/svg";

export function glyph(name: Glyph): SVGSVGElement {
  const frame = document.createElementNS(SVG, "svg");
  frame.setAttribute("viewBox", "0 0 24 24");
  frame.setAttribute("class", "glyph");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", GLYPHS[name]);
  frame.append(path);
  return frame;
}
