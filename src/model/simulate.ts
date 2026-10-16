import type { DayCounts } from "./baseline.js";
import { levelOf, type Level } from "./levels.js";

export interface Simulation {
  /** Total contributions per day: real baseline plus planned art commits. */
  totals: DayCounts;
  /** The busiest day's total, which sets the shading thresholds. */
  max: number;
  /** Predicted shade of each day. */
  levels: Record<string, Level>;
}

/**
 * Predict the contribution graph after adding `planned` art commits on top of the real `baseline`.
 * Planned commits dated outside the baseline's range are ignored, since they would not appear on the graph.
 */
export function simulate(baseline: DayCounts, planned: DayCounts): Simulation {
  const totals: DayCounts = {};
  let max = 0;
  for (const [date, real] of Object.entries(baseline)) {
    const total = real + (planned[date] ?? 0);
    totals[date] = total;
    if (total > max) max = total;
  }

  const levels: Record<string, Level> = {};
  for (const [date, total] of Object.entries(totals)) {
    levels[date] = levelOf(total, max);
  }
  return { totals, max, levels };
}
