import { parsePattern, patternToTargets } from "../art/pattern.js";
import { renderGraph } from "../art/render.js";
import { fetchCalendar as realFetchCalendar } from "../github/calendar.js";
import { countArtCommits as realCountArtCommits } from "../git/artCommits.js";
import { baselineCounts } from "../model/baseline.js";
import { simulate } from "../model/simulate.js";
import { solve } from "../solver/plan.js";

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

/**
 * Dry run: work out what it would take to draw the pattern and describe it.
 * Reads from GitHub (and the art repo's git log, if given) but writes nothing.
 * Returns the report as text.
 */
export async function runPlan(options: PlanOptions, deps: PlanDeps = realDeps): Promise<string> {
  const { login, token, from, to, start, artRepo } = options;

  // Validate the local inputs before touching the network.
  const targets = patternToTargets(parsePattern(options.patternText), start);

  const calendar = await deps.fetchCalendar({ login, token, from, to });
  const art = artRepo ? await deps.countArtCommits(artRepo) : {};
  const baseline = baselineCounts(calendar, art);

  const inRange = Object.fromEntries(Object.entries(targets).filter(([date]) => date in baseline));
  const skipped = Object.keys(targets).length - Object.keys(inRange).length;

  const solveOptions = options.maxPerDay === undefined ? {} : { maxPerDay: options.maxPerDay };
  const plan = solve(baseline, inRange, solveOptions);
  const predicted = simulate(baseline, plan.planned);
  const current = simulate(baseline, {});

  const added = Object.values(plan.planned);
  const total = added.reduce((sum, n) => sum + n, 0);

  const lines = [
    `Plan for ${login}, ${from} to ${to} (dry run: nothing was written)`,
    `Pattern: ${Object.keys(inRange).length} cells placed from ${start}` +
      (skipped > 0 ? `, ${skipped} skipped (outside ${from} to ${to})` : ""),
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
