import { DAY_MS, dayOfWeek, formatDate, parseDate } from "../model/dates.js";
import type { Level } from "../model/levels.js";
import type { Targets } from "../solver/plan.js";

/** Cells indexed `[row][column]`: 7 rows (Sunday to Saturday), one column per week. `null` = don't care. */
export type Pattern = (Level | null)[][];

const ROWS = 7;

/**
 * Parse a pattern from text: 7 rows of equal length, one character per day.
 * `0` = must stay empty, `1`-`4` = target level, `.` = don't care.
 * Blank lines, trailing whitespace and a leading byte-order mark (which Windows editors
 * often add) are ignored.
 */
export function parsePattern(text: string): Pattern {
  const lines = text
    .replace(/^﻿/, "")
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

export interface TileOptions {
  /** Sunday the first tile's top-left cell lands on. */
  start: string;
  /** First and last day to fill (inclusive, `YYYY-MM-DD`). */
  from: string;
  to: string;
  /** Blank weeks between tiles. Gap days are left alone (don't care). */
  gap?: number;
}

/**
 * Repeat a pattern across a date range, forward from `start`: the tile repeats every
 * `width + gap` weeks. Days before `start` are left alone, and tiles are clipped at the
 * range edges. Don't-care cells and gap days are left out of the result.
 */
export function tilePattern(pattern: Pattern, options: TileOptions): Targets {
  const { start, from, to } = options;
  const gap = options.gap ?? 0;
  if (!Number.isInteger(gap) || gap < 0) {
    throw new RangeError(`gap must be a non-negative integer, got ${gap}`);
  }
  const startMs = parseDate(start);
  if (dayOfWeek(startMs) !== 0) {
    throw new RangeError(`start must be a Sunday, but ${start} is not`);
  }
  const fromMs = parseDate(from);
  const toMs = parseDate(to);
  if (toMs < fromMs) {
    throw new RangeError(`"to" (${to}) is before "from" (${from})`);
  }
  const width = pattern[0]?.length ?? 0;
  if (width === 0) {
    throw new RangeError("pattern has no columns");
  }

  const period = width + gap;
  const targets: Targets = {};
  // Skip straight to the first week that can reach the range.
  const firstWeek = Math.max(0, Math.floor((fromMs - startMs) / (7 * DAY_MS)));
  for (let week = firstWeek; startMs + 7 * week * DAY_MS <= toMs; week++) {
    const column = week % period;
    if (column >= width) continue; // a gap week
    for (let row = 0; row < 7; row++) {
      const ms = startMs + (7 * week + row) * DAY_MS;
      if (ms < fromMs || ms > toMs) continue;
      const level = pattern[row]?.[column] ?? null;
      if (level !== null) targets[formatDate(ms)] = level;
    }
  }
  return targets;
}
