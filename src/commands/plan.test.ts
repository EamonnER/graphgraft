import { describe, expect, test, vi } from "vitest";
import type { DayCounts } from "../model/baseline.js";
import { DAY_MS, formatDate, parseDate } from "../model/dates.js";
import { runPlan, type PlanDeps, type PlanOptions } from "./plan.js";

/** Fake calendar: zero contributions on every requested day, plus `overrides`. */
function fakeDeps(overrides: DayCounts = {}, art: DayCounts = {}) {
  const fetchCalendar = vi.fn(async (o: { from: string; to: string }) => {
    const calendar: DayCounts = {};
    for (let ms = parseDate(o.from); ms <= parseDate(o.to); ms += DAY_MS) {
      calendar[formatDate(ms)] = overrides[formatDate(ms)] ?? 0;
    }
    return calendar;
  });
  const countArtCommits = vi.fn(async () => art);
  return { fetchCalendar, countArtCommits, deps: { fetchCalendar, countArtCommits } as unknown as PlanDeps };
}

const column = (...rows: string[]) => [...rows, ...Array(7 - rows.length).fill(".")].join("\n");

const base: PlanOptions = {
  login: "octocat",
  token: "secret-token",
  from: "2026-03-01", // a Sunday
  to: "2026-03-21",
  patternText: column("4", "3", "2", "1", "0"),
  start: "2026-03-01",
};

describe("runPlan", () => {
  test("reports the commits needed and draws current and predicted graphs", async () => {
    const { deps } = fakeDeps();
    const report = await runPlan(base, deps);

    expect(report).toContain("dry run: nothing was written");
    expect(report).toContain("Pattern: 5 cells placed from 2026-03-01");
    expect(report).toContain("Commits to add: 10 over 4 days (most on one day: 4)");
    expect(report).toContain("Busiest day afterwards: 4 contributions");
    expect(report).toContain("Conflicts: none");
    expect(report).toContain("Current graph:\n...\n...\n...\n...\n...\n...\n...");
    expect(report).toContain("Predicted graph:\n4..\n3..\n2..\n1..\n...\n...\n...");
  });

  test("warns when no art repo is given", async () => {
    const { deps, countArtCommits } = fakeDeps();
    const report = await runPlan(base, deps);
    expect(report).toContain("no --art-repo given");
    expect(countArtCommits).not.toHaveBeenCalled();
  });

  test("subtracts our own art commits from the calendar to find the real baseline", async () => {
    // The calendar shows 4 on Mar 1, all of them our art, so the real baseline is 0 and
    // the lone level-4 pixel needs 1 commit. Treating the art as real would plan 0.
    const { deps, countArtCommits } = fakeDeps({ "2026-03-01": 4 }, { "2026-03-01": 4 });
    const report = await runPlan({ ...base, patternText: column("4"), artRepo: "../art" }, deps);

    expect(countArtCommits).toHaveBeenCalledWith("../art");
    expect(report).toContain("Commits to add: 1 over 1 day (");
    expect(report).not.toContain("no --art-repo given");
  });

  test("lists conflicts where real commits are already too bright", async () => {
    const { deps } = fakeDeps({ "2026-03-01": 10 });
    const report = await runPlan({ ...base, patternText: column("1", "4"), maxPerDay: 20 }, deps);
    expect(report).toContain("Conflicts: 1");
    expect(report).toContain("2026-03-01: wanted level 1, would be level 4");
  });

  test("skips pattern cells that fall outside the date range", async () => {
    const { deps } = fakeDeps();
    const wide = Array(7).fill("44").join("\n"); // 2 weeks of cells
    const report = await runPlan({ ...base, to: "2026-03-07", patternText: wide }, deps);
    expect(report).toContain("Pattern: 7 cells placed from 2026-03-01, 7 skipped");
  });

  test("passes the token to GitHub but never prints it", async () => {
    const { deps, fetchCalendar } = fakeDeps();
    const report = await runPlan(base, deps);
    expect(fetchCalendar).toHaveBeenCalledWith({ login: "octocat", token: "secret-token", from: "2026-03-01", to: "2026-03-21" });
    expect(report).not.toContain("secret-token");
  });

  test("explains an art/calendar mismatch as an unpushed art repo", async () => {
    // The art repo has 4 commits on Mar 1 that GitHub's calendar doesn't count yet.
    const { deps } = fakeDeps({}, { "2026-03-01": 4 });
    await expect(runPlan({ ...base, artRepo: "../art" }, deps)).rejects.toThrow(
      /2026-03-01: 4 art commits but the calendar only counts 0.*push it/,
    );
  });

  test("rejects a bad pattern or start before calling GitHub", async () => {
    const { deps, fetchCalendar } = fakeDeps();
    await expect(runPlan({ ...base, patternText: "44\n44" }, deps)).rejects.toThrow("exactly 7 rows");
    await expect(runPlan({ ...base, start: "2026-03-02" }, deps)).rejects.toThrow("must be a Sunday");
    expect(fetchCalendar).not.toHaveBeenCalled();
  });
});
