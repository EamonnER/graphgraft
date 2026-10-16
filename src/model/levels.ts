/**
 * Model of how GitHub shades a contribution-graph cell.
 *
 * GitHub's algorithm for this is a black box. This assumes a day with no contributions is level 0,
 * and every other day falls into one of four equal quarters of the busiest day's count.
 */

export type Level = 0 | 1 | 2 | 3 | 4;

/** Level of a day with `count` contributions, given the busiest day's count. */
export function levelOf(count: number, max: number): Level {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`count must be a non-negative integer, got ${count}`);
  }
  if (!Number.isInteger(max) || max < 0) {
    throw new RangeError(`max must be a non-negative integer, got ${max}`);
  }
  if (count > max) {
    throw new RangeError(`count (${count}) cannot exceed max (${max})`);
  }
  if (count === 0) return 0;
  // ceil(4 * count / max) in integer arithmetic
  return Math.floor((4 * count + max - 1) / max) as Level;
}

/** Smallest contribution count that produces `level`, given the busiest day's count. */
export function minCountForLevel(level: Level, max: number): number {
  if (!Number.isInteger(max) || max < 0) {
    throw new RangeError(`max must be a non-negative integer, got ${max}`);
  }
  if (level === 0) return 0;
  return Math.floor(((level - 1) * max) / 4) + 1;
}
