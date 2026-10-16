import type { DayCounts } from "../model/baseline.js";
import { minCountForLevel, type Level } from "../model/levels.js";
import { simulate } from "../model/simulate.js";

/** Desired level per date. Dates that are absent are left alone. */
export type Targets = Record<string, Level>;

export interface Conflict {
  date: string;
  target: Level;
  /** The level the day ends up with in the final plan. */
  actual: Level;
}

export interface SolveOptions {
  /** Upper bound for the busiest day's total to limit the search. */
  maxPerDay?: number;
}

export interface Plan {
  /** Art commits to add per day. Days that need none are omitted. */
  planned: DayCounts;
  /** The busiest day's total once `planned` is applied. */
  max: number;
  /** Targeted days that cannot be made to match their target level. */
  conflicts: Conflict[];
}

/**
 * Work out how many art commits to add on each day so the graph shows `targets`, given the user's real `baseline`.
 *
 * Shading depends on the busiest day, which the art itself changes, so the busiest day's
 * total `M` is searched for: each candidate `M` yields the fewest commits that reach every
 * target, and the `M` with the fewest missed targets wins (the smallest `M` on a tie).
 *
 * Real commits can't be removed, so a day that is already too bright for its target is reported
 * as a conflict and gets no commits. Targets for dates outside the baseline are ignored.
 */
export function solve(baseline: DayCounts, targets: Targets, options: SolveOptions = {}): Plan {
  const maxPerDay = options.maxPerDay ?? 50;
  if (!Number.isInteger(maxPerDay) || maxPerDay < 1) {
    throw new RangeError(`maxPerDay must be a positive integer, got ${maxPerDay}`);
  }

  const realMax = Math.max(0, ...Object.values(baseline));
  const first = Math.max(realMax, 1);
  const last = Math.max(maxPerDay, first);

  let best: { planned: DayCounts; conflicts: Conflict[] } | undefined;
  for (let m = first; m <= last; m++) {
    const candidate = evaluate(baseline, targets, m);
    if (!best || candidate.conflicts.length < best.conflicts.length) best = candidate;
    if (best.conflicts.length === 0) break;
  }

  // `best` is always set: the loop runs at least once because first <= last.
  const { planned, conflicts } = best!;
  for (const { date } of conflicts) delete planned[date];
  const final = evaluate(baseline, targets, undefined, planned);
  return { planned, max: final.max, conflicts: final.conflicts };
}

function evaluate(
  baseline: DayCounts,
  targets: Targets,
  m: number | undefined,
  fixedPlan?: DayCounts,
): { planned: DayCounts; conflicts: Conflict[]; max: number } {
  const planned: DayCounts = fixedPlan ?? {};
  if (!fixedPlan && m !== undefined) {
    for (const [date, target] of Object.entries(targets)) {
      const real = baseline[date];
      if (real === undefined) continue;
      const needed = target === 4 ? m : minCountForLevel(target, m);
      const extra = target === 0 ? 0 : Math.max(0, needed - real);
      if (extra > 0) planned[date] = extra;
    }
  }

  const { levels, max } = simulate(baseline, planned);
  const conflicts: Conflict[] = [];
  for (const [date, target] of Object.entries(targets)) {
    const actual = levels[date];
    if (actual !== undefined && actual !== target) conflicts.push({ date, target, actual });
  }
  return { planned, conflicts, max };
}
