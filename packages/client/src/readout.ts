import { ASTRONOMICAL_UNIT, DAY, HOUR, YEAR } from "@barycenter/sim";

export function figure(value: number, digits = 4): string {
  if (value === 0) {
    return "0";
  }
  const size = Math.abs(value);
  if (size >= 1e7 || size < 1e-3) {
    return value.toExponential(digits - 1).replace("e+", "e");
  }
  return size >= 1000
    ? Math.round(value).toLocaleString("en-US")
    : String(Number(value.toPrecision(digits)));
}

export function lengthOf(meters: number): string {
  const size = Math.abs(meters);
  if (size < 1e4) {
    return `${meters.toFixed(0)} m`;
  }
  return size < 1e10
    ? `${figure(meters / 1000, 5)} km`
    : `${figure(meters / ASTRONOMICAL_UNIT, 5)} AU`;
}

export function speedOf(rate: number): string {
  return Math.abs(rate) < 1000 ? `${rate.toFixed(1)} m/s` : `${figure(rate / 1000, 5)} km/s`;
}

export function spanOf(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "never";
  }
  const size = Math.abs(seconds);
  const sign = seconds < 0 ? "−" : "";
  if (size < 120) {
    return `${sign}${size.toFixed(0)} s`;
  }
  if (size < 2 * HOUR) {
    return `${sign}${Math.floor(size / 60)} min ${Math.floor(size % 60)} s`;
  }
  if (size < 2 * DAY) {
    return `${sign}${Math.floor(size / HOUR)} h ${Math.floor((size % HOUR) / 60)} min`;
  }
  return size < 2 * YEAR
    ? `${sign}${figure(size / DAY, 4)} d`
    : `${sign}${figure(size / YEAR, 4)} y`;
}

export function massOf(mass: number): string {
  return mass >= 1000 ? `${figure(mass / 1000, 4)} t` : `${figure(mass, 4)} kg`;
}

export function forceOf(force: number): string {
  if (force >= 1e6) {
    return `${figure(force / 1e6)} MN`;
  }
  return force >= 1000 ? `${figure(force / 1000)} kN` : `${figure(force)} N`;
}

export function rateOf(warp: number): string {
  return warp < 1e4 ? `${figure(warp, 2)}×` : `10${"⁰¹²³⁴⁵⁶⁷⁸⁹"[Math.round(Math.log10(warp))]}×`;
}

const pair = (value: number): string => String(Math.floor(value)).padStart(2, "0");

export function hourOf(seconds: number): string {
  const rest = seconds % DAY;
  return `${pair(rest / HOUR)}:${pair((rest % HOUR) / 60)}:${pair(rest % 60)}`;
}

export function dayOf(seconds: number): string {
  return `Year ${Math.floor(seconds / YEAR) + 1} · Day ${Math.floor((seconds % YEAR) / DAY) + 1}`;
}
