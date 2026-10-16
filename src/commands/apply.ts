import { writeArtCommits as realWriteArtCommits } from "../git/writer.js";
import type { DayCounts } from "../model/baseline.js";
import { computePlan, formatPlanReport, type PlanDeps, type PlanOptions } from "./plan.js";
import { fetchCalendar } from "../github/calendar.js";
import { countArtCommits } from "../git/artCommits.js";

export type ApplyOptions = PlanOptions & {
  /** The local art repo to write into. */
  artRepo: string;
  /** Author and committer identity for the art commits. */
  name: string;
  email: string;
  /** Branch to write to. */
  branch?: string;
  /** Actually write. Without it, apply only reports what it would do. */
  yes: boolean;
};

export interface ApplyDeps extends PlanDeps {
  writeArtCommits: typeof realWriteArtCommits;
}

const realDeps: ApplyDeps = { fetchCalendar, countArtCommits, writeArtCommits: realWriteArtCommits };

/**
 * Plan the pattern, then add the art commits the art repo is missing.
 *
 * Only the difference between the plan and the art already in the repo is written, so running
 * it again with the same pattern adds nothing. Commits can't be removed, so if the repo
 * already holds more art than the plan wants on some day, this refuses. Nothing is ever pushed.
 */
export async function runApply(options: ApplyOptions, deps: ApplyDeps = realDeps): Promise<string> {
  const { artRepo, name, email, from, to, yes } = options;
  const branch = options.branch ?? "main";

  const result = await computePlan(options, deps);

  // Art outside the planned range doesn't appear on this graph, so it can't conflict.
  const existing = Object.entries(result.art).filter(([date]) => date >= from && date <= to);
  const surplus = existing.filter(([date, n]) => n > (result.plan.planned[date] ?? 0)).map(([date]) => date);
  if (surplus.length > 0) {
    throw new Error(
      `the art repo already has more art than this plan wants on: ${surplus.join(", ")}. ` +
        "Commits can't be removed, so the art repo would need rebuilding (not supported yet).",
    );
  }

  const toAdd: DayCounts = {};
  let total = 0;
  for (const [date, wanted] of Object.entries(result.plan.planned)) {
    const missing = wanted - (result.art[date] ?? 0);
    if (missing > 0) {
      toAdd[date] = missing;
      total += missing;
    }
  }

  const report = (note?: string) => formatPlanReport(options, result, note);
  if (total === 0) {
    // Nothing planned at all means the graph already matches without any art from this repo: it
    // is either real activity or leftover art GitHub still shows from a removed repo.
    const message =
      Object.keys(result.plan.planned).length > 0
        ? "Nothing to add: the art repo already has everything this plan needs."
        : "Nothing to add: the graph already shows this pattern without any art commits from this repo.\n" +
          "If you expected an empty graph, GitHub may still be showing art from a repo that was removed or rewritten.";
    return `${report()}\n\n${message}`;
  }
  if (!yes) {
    return `${report()}\n\nRe-run with --yes to write ${total} commits to ${artRepo} (not pushed).`;
  }

  const written = await deps.writeArtCommits(artRepo, toAdd, { name, email, branch });
  return (
    `${report("writing commits")}\n\nWrote ${written} commits to ${artRepo} on branch ${branch} (not pushed).\n` +
    `Push when you're ready:\n  git -C "${artRepo}" push origin ${branch}`
  );
}
