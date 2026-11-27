export type Point = [x: number, y: number, z: number];

export interface Shot {
  focus: string | null;
  camera: Point | null;
  tick: number;
  weather: number | null;
  cut: boolean;
}

const lasting = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value >= 0;
const pointOf = (text: string | null): Point | null => {
  const parts = (text ?? "").split(",").map(Number.parseFloat);
  const [x, y, z] = parts;
  return parts.length === 3 && parts.every(Number.isFinite) && x ** 2 + y ** 2 + z ** 2 > 0
    ? [x, y, z]
    : null;
};

export function shotOf(search: string): Shot {
  const query = new URLSearchParams(search);
  const numberOf = (name: string) => {
    const value = Number.parseFloat(query.get(name) ?? "");
    return lasting(value) ? value : null;
  };
  return {
    focus: query.get("focus") || null,
    camera: pointOf(query.get("camera")),
    tick: numberOf("tick") ?? 0,
    weather: numberOf("weather"),
    cut: query.get("cut") === "1",
  };
}

const written = (value: number) => encodeURIComponent(String(value));

export function shotQuery(shot: Shot): string {
  return [
    shot.focus === null ? null : `focus=${encodeURIComponent(shot.focus)}`,
    shot.camera === null ? null : `camera=${shot.camera.map(written).join(",")}`,
    `tick=${written(shot.tick)}`,
    lasting(shot.weather) ? `weather=${written(shot.weather)}` : null,
    shot.cut ? "cut=1" : null,
  ]
    .filter((part) => part !== null)
    .join("&");
}
