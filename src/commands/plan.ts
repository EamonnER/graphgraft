import { parsePattern, patternToTargets } from "../art/pattern.js";
import { renderGraph } from "../art/render.js";
import { fetchCalendar as realFetchCalendar } from "../github/calendar.js";
import { countArtCommits as realCountArtCommits } from "../git/artCommits.js";
import { baselineCounts, type DayCounts } from "../model/baseline.js";
import { simulate, type Simulation } from "../model/simulate.js";
import { solve, type Plan } from "../solver/plan.js";

export interface PlanOptions {
  login: string;
  token: string;
  from: string;
  to: string;
  /** Contents of the pattern file. */
  patternText: string;
  /** Sunday the pattern's top-left cell lands on. */
  start: string;
  /** Local art repo, used to separate our own commits from real ones. */
  artRepo?: string;
  maxPerDay?: number;
}

/** The outside world, injectable for tests. */
export interface PlanDeps {
  fetchCalendar: typeof realFetchCalendar;
  countArtCommits: typeof realCountArtCommits;
}

const realDeps: PlanDeps = { fetchCalendar: realFetchCalendar, countArtCommits: realCountArtCommits };

/** Everything worked out by {@link computePlan}. */
export interface PlanResult {
  /** The solver's answer: art commits wanted per day, and any conflicts. */
  plan: Plan;
  /** Art commits already in the art repo per day (empty if no art repo was given). */
  art: DayCounts;
  /** The graph as it is now, without any art. */
  current: Simulation;
  /** The graph as it would be once the plan is applied. */
  predicted: Simulation;
  /** Pattern cells that fall inside the date range, and so were planned for. */
  cellsPlaced: number;
  /** Pattern cells outside the date range, which were skipped. */
  cellsSkipped: number;
}

/**
 * Work out what it would take to draw the pattern.
 * Reads from GitHub (and the art repo's git log, if given) but writes nothing.
 */
export async function computePlan(options: PlanOptions, deps: PlanDeps = realDeps): Promise<PlanResult> {
  const { login, token, from, to, start, artRepo } = options;

  // Validate the local inputs before touching the network.
  const targets = patternToTargets(parsePattern(options.patternText), start);

  const calendar = await deps.fetchCalendar({ login, token, from, to });
  const art = artRepo ? await deps.countArtCommits(artRepo) : {};
  let baseline: DayCounts;
  try {
    baseline = baselineCounts(calendar, art);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new RangeError(
        `${error.message}. If the art repo has commits you haven't pushed yet, push it, ` +
          "wait for GitHub to refresh your graph, then run again.",
      );
    }
    throw error;
  }

  const inRange = Object.fromEntries(Object.entries(targets).filter(([date]) => date in baseline));

  const solveOptions = options.maxPerDay === undefined ? {} : { maxPerDay: options.maxPerDay };
  const plan = solve(baseline, inRange, solveOptions);

  return {
    plan,
    art,
    current: simulate(baseline, {}),
    predicted: simulate(baseline, plan.planned),
    cellsPlaced: Object.keys(inRange).length,
    cellsSkipped: Object.keys(targets).length - Object.keys(inRange).length,
  };
}

/** Describe a computed plan as text. `note` goes in the heading. */
export function formatPlanReport(
  options: PlanOptions,
  result: PlanResult,
  note = "dry run: nothing was written",
): string {
  const { login, from, to, start, artRepo } = options;
  const { plan, current, predicted, cellsPlaced, cellsSkipped } = result;

  const added = Object.values(plan.planned);
  const total = added.reduce((sum, n) => sum + n, 0);

  const lines = [
    `Plan for ${login}, ${from} to ${to} (${note})`,
    `Pattern: ${cellsPlaced} cells placed from ${start}` +
      (cellsSkipped > 0 ? `, ${cellsSkipped} skipped (outside ${from} to ${to})` : ""),
    `Commits to add: ${total} over ${added.length} day${added.length === 1 ? "" : "s"}` +
      ` (most on one day: ${Math.max(0, ...added)})`,
    `Busiest day afterwards: ${predicted.max} contributions`,
  ];
  if (plan.conflicts.length === 0) {
    lines.push("Conflicts: none");
  } else {
    lines.push(`Conflicts: ${plan.conflicts.length}`);
    for (const c of plan.conflicts) {
      lines.push(`  ${c.date}: wanted level ${c.target}, would be level ${c.actual}`);
    }
  }
  if (!artRepo) {
    lines.push(
      "Warning: no --art-repo given, so any art already on your graph is treated as real commits.",
    );
  }
  lines.push("", "Current graph:", renderGraph(current.levels, from, to));
  lines.push("", "Predicted graph:", renderGraph(predicted.levels, from, to));
  return lines.join("\n");
}

/**
 * Dry run: work out what it would take to draw the pattern and describe it.
 * Reads from GitHub (and the art repo's git log, if given) but writes nothing.
 * Returns the report as text.
 */
export async function runPlan(options: PlanOptions, deps: PlanDeps = realDeps): Promise<string> {
  return formatPlanReport(options, await computePlan(options, deps));
}
