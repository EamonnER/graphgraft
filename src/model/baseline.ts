/** Contribution counts keyed by UTC date, formatted `YYYY-MM-DD`. */
export type DayCounts = Record<string, number>;

/**
 * The user's real contributions per day: what GitHub's calendar
 * reports minus the art commits graftgraph itself made on that day.
 *
 * Art commits dated outside the calendar's range are ignored. If a day has more art
 * commits than the calendar counts (e.g. GitHub hasn't refreshed yet, or didn't
 * count them), the inputs are inconsistent and this throws rather than guessing.
 */
export function baselineCounts(calendar: DayCounts, art: DayCounts): DayCounts {
  const baseline: DayCounts = {};
  for (const [date, total] of Object.entries(calendar)) {
    const ours = art[date] ?? 0;
    if (ours > total) {
      throw new RangeError(
        `${date}: ${ours} art commits but the calendar only counts ${total}`,
      );
    }
    baseline[date] = total - ours;
  }
  return baseline;
}
