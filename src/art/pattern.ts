import { DAY_MS, dayOfWeek, formatDate, parseDate } from "../model/dates.js";
import type { Level } from "../model/levels.js";
import type { Targets } from "../solver/plan.js";

/** Cells indexed `[row][column]`: 7 rows (Sunday to Saturday), one column per week. `null` = don't care. */
export type Pattern = (Level | null)[][];

const ROWS = 7;

/**
 * Parse a pattern from text: 7 rows of equal length, one character per day.
 * `0` = must stay empty, `1`-`4` = target level, `.` = don't care.
 * Blank lines and trailing whitespace are ignored.
 */
export function parsePattern(text: string): Pattern {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line !== "");

  if (lines.length !== ROWS) {
    throw new RangeError(`pattern must have exactly ${ROWS} rows, got ${lines.length}`);
  }
  const width = lines[0]!.length;

  return lines.map((line, r) => {
    if (line.length !== width) {
      throw new RangeError(`pattern row ${r + 1} has ${line.length} columns, expected ${width}`);
    }
    return [...line].map((char, c) => {
      if (char === ".") return null;
      if (char >= "0" && char <= "4") return Number(char) as Level;
      throw new RangeError(`invalid character ${JSON.stringify(char)} at row ${r + 1}, column ${c + 1}`);
    });
  });
}

/**
 * Place a pattern on the graph with its top-left cell on `start`, which must
 * be a Sunday (graph columns start on Sundays). Don't-care cells are left out.
 * Cells are not clipped to any date range.
 */
export function patternToTargets(pattern: Pattern, start: string): Targets {
  const startMs = parseDate(start);
  if (dayOfWeek(startMs) !== 0) {
    throw new RangeError(`start must be a Sunday, but ${start} is not`);
  }

  const targets: Targets = {};
  pattern.forEach((row, r) => {
    row.forEach((level, c) => {
      if (level === null) return;
      targets[formatDate(startMs + (7 * c + r) * DAY_MS)] = level;
    });
  });
  return targets;
}
