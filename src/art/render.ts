import { DAY_MS, dayOfWeek, formatDate, parseDate } from "../model/dates.js";
import type { Level } from "../model/levels.js";

/**
 * Draw levels as an ASCII contribution graph: 7 rows (Sunday to Saturday), one column
 * per week, covering `from` to `to` (inclusive, `YYYY-MM-DD`). Level 0 is `.`, levels
 * 1-4 are digits, and days outside the range or missing from `levels` are blank.
 */
export function renderGraph(levels: Record<string, Level>, from: string, to: string): string {
  const fromMs = parseDate(from);
  const toMs = parseDate(to);
  if (toMs < fromMs) {
    throw new RangeError(`"to" (${to}) is before "from" (${from})`);
  }

  const firstSunday = fromMs - dayOfWeek(fromMs) * DAY_MS;
  const lastSaturday = toMs + (6 - dayOfWeek(toMs)) * DAY_MS;
  const weeks = Math.round((lastSaturday - firstSunday) / DAY_MS + 1) / 7;

  const rows: string[] = [];
  for (let r = 0; r < 7; r++) {
    let row = "";
    for (let w = 0; w < weeks; w++) {
      const ms = firstSunday + (7 * w + r) * DAY_MS;
      const level = ms < fromMs || ms > toMs ? undefined : levels[formatDate(ms)];
      row += level === undefined ? " " : level === 0 ? "." : String(level);
    }
    rows.push(row.trimEnd());
  }
  return rows.join("\n");
}
