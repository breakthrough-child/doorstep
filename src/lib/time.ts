// Time-zone helpers built only on Intl, so the rules engine stays pure and dependency-free.
// All rule logic is expressed in the parent's local time zone.

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(ms: number, timeZone: string): LocalParts {
  const parts = formatter(timeZone).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

/** "YYYY-MM-DD" of the instant in the given zone. */
export function localDateKey(ms: number, timeZone: string): string {
  const p = localParts(ms, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function minutesOfDay(ms: number, timeZone: string): number {
  const p = localParts(ms, timeZone);
  return p.hour * 60 + p.minute;
}

/** Parse "HH:MM" to minutes since midnight. Throws on malformed input. */
export function parseHHMM(value: string): number {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) throw new Error(`Invalid time "${value}", expected HH:MM`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatHHMM(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Offset (ms) of the zone at a given instant: local wall time − UTC. */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const p = localParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * The UTC instant for a wall-clock time on a local date in a zone.
 * Handles DST: nonexistent times (spring-forward gap) resolve forward, ambiguous
 * times (fall-back) resolve to the first occurrence.
 */
export function zonedTimeToUtc(dateKey: string, minutesOfDayValue: number, timeZone: string): number {
  const [y, mo, d] = dateKey.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, mo - 1, d, 0, 0, 0) + minutesOfDayValue * 60_000;
  // Two-pass fixed point on the offset.
  let guess = wall - zoneOffsetMs(wall, timeZone);
  const second = wall - zoneOffsetMs(guess, timeZone);
  if (second !== guess) {
    // Ambiguous or gap: prefer the earlier candidate that maps back to the requested wall time.
    const candidates = [guess, second].sort((a, b) => a - b);
    const exact = candidates.find((c) => c + zoneOffsetMs(c, timeZone) === wall);
    guess = exact ?? Math.max(guess, second);
  }
  return guess;
}

/** Start (00:00 local) of the day containing `ms`. */
export function startOfLocalDay(ms: number, timeZone: string): number {
  return zonedTimeToUtc(localDateKey(ms, timeZone), 0, timeZone);
}

/** Is minute-of-day `m` inside [start, end), where the window may wrap midnight? */
export function inWrappingWindow(m: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/** Human time like "9:10" / "14:05" (24h, no leading zero on hour) in the zone. */
export function clockLabel(ms: number, timeZone: string): string {
  const p = localParts(ms, timeZone);
  return `${p.hour}:${pad(p.minute)}`;
}

/** Shift a "YYYY-MM-DD" key by n days. */
export function addDays(dateKey: string, n: number): string {
  const [y, mo, d] = dateKey.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function weekdayOf(dateKey: string): number {
  const [y, mo, d] = dateKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
