import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { countArtCommits } from "../git/artCommits.js";
import { writeArtCommits } from "../git/writer.js";
import type { DayCounts } from "../model/baseline.js";
import { DAY_MS, formatDate, parseDate } from "../model/dates.js";
import { runApply, type ApplyDeps, type ApplyOptions } from "./apply.js";

const run = promisify(execFile);
const identity = { name: "Test Author", email: "123+test@users.noreply.github.com" };
const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

/** Real art/writer code against `repo`; a fake GitHub whose calendar is exactly the repo's art (pushed and refreshed). */
function depsFor(repo: string): ApplyDeps {
  return {
    fetchCalendar: async ({ from, to }: { from: string; to: string }) => {
      const art = await countArtCommits(repo);
      const calendar: DayCounts = {};
      for (let ms = parseDate(from); ms <= parseDate(to); ms += DAY_MS) {
        calendar[formatDate(ms)] = art[formatDate(ms)] ?? 0;
      }
      return calendar;
    },
    countArtCommits,
    writeArtCommits,
  } as unknown as ApplyDeps;
}

const column = (...rows: string[]) => [...rows, ...Array(7 - rows.length).fill(".")].join("\n");

describe("runApply", () => {
  let repo: string;
  let options: ApplyOptions;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "graphgraft-test-"));
    dirs.push(repo);
    await run("git", ["init", "-q", "-b", "main"], { cwd: repo });
    options = {
      login: "octocat",
      token: "secret-token",
      from: "2026-03-01", // a Sunday
      to: "2026-03-21",
      patternText: column("4", "3", "2", "1"), // plan: 4, 3, 2, 1 commits on Mar 1-4
      start: "2026-03-01",
      artRepo: repo,
      ...identity,
      yes: true,
    };
  });

  test("without --yes it reports but writes nothing", async () => {
    const report = await runApply({ ...options, yes: false }, depsFor(repo));
    expect(report).toContain("dry run: nothing was written");
    expect(report).toContain("Re-run with --yes to write 10 commits");
    expect(await countArtCommits(repo)).toEqual({});
  });

  test("with --yes it writes the planned art commits, unpushed", async () => {
    const report = await runApply(options, depsFor(repo));

    expect(await countArtCommits(repo)).toEqual({
      "2026-03-01": 4,
      "2026-03-02": 3,
      "2026-03-03": 2,
      "2026-03-04": 1,
    });
    expect(report).toContain("Wrote 10 commits");
    expect(report).toContain("(not pushed)");
    expect(report).toContain("push origin main");
    expect(report).not.toContain("dry run");
    expect(report).not.toContain("secret-token");
  });

  test("running it again with the same pattern adds nothing", async () => {
    await runApply(options, depsFor(repo));
    const report = await runApply(options, depsFor(repo));

    expect(report).toContain("Nothing to add");
    expect(await countArtCommits(repo)).toEqual({
      "2026-03-01": 4,
      "2026-03-02": 3,
      "2026-03-03": 2,
      "2026-03-04": 1,
    });
  });

  test("says the repo has everything when it holds all the planned art", async () => {
    await runApply(options, depsFor(repo));
    const report = await runApply(options, depsFor(repo));
    expect(report).toContain("the art repo already has everything this plan needs");
    expect(report).not.toContain("without any art commits");
  });

  test("when the graph already matches but the repo has no art, it does not claim the repo has the art", async () => {
    // Ghost art: the calendar shows the pattern, but this repo's log has no art commits.
    const ghostCalendar = {
      ...depsFor(repo),
      fetchCalendar: async ({ from, to }: { from: string; to: string }) => {
        const calendar: DayCounts = {};
        for (let ms = parseDate(from); ms <= parseDate(to); ms += DAY_MS) calendar[formatDate(ms)] = 0;
        Object.assign(calendar, { "2026-03-01": 4, "2026-03-02": 3, "2026-03-03": 2, "2026-03-04": 1 });
        return calendar;
      },
    } as unknown as ApplyDeps;

    const report = await runApply(options, ghostCalendar);

    expect(report).toContain("Commits to add: 0");
    expect(report).toContain("without any art commits from this repo");
    expect(report).toContain("still be showing art");
    expect(report).not.toContain("already has everything");
    expect(await countArtCommits(repo)).toEqual({});
  });

  test("writes only the difference from art already in the repo", async () => {
    await writeArtCommits(repo, { "2026-03-01": 2 }, identity);
    const report = await runApply(options, depsFor(repo));

    expect(report).toContain("Wrote 8 commits");
    expect(await countArtCommits(repo)).toEqual({
      "2026-03-01": 4,
      "2026-03-02": 3,
      "2026-03-03": 2,
      "2026-03-04": 1,
    });
  });

  test("refuses when the repo has more art than the plan wants", async () => {
    await writeArtCommits(repo, { "2026-03-10": 2 }, identity);
    await expect(runApply(options, depsFor(repo))).rejects.toThrow(/more art than this plan wants on: 2026-03-10/);
    expect(await countArtCommits(repo)).toEqual({ "2026-03-10": 2 });
  });

  test("ignores art dated outside the planned range", async () => {
    await writeArtCommits(repo, { "2026-02-01": 5 }, identity);
    const report = await runApply(options, depsFor(repo));
    expect(report).toContain("Wrote 10 commits");
  });

  test("an invalid identity writes nothing", async () => {
    await expect(runApply({ ...options, name: "" }, depsFor(repo))).rejects.toThrow(RangeError);
    expect(await countArtCommits(repo)).toEqual({});
  });

  test("writes to the requested branch", async () => {
    const report = await runApply({ ...options, branch: "art" }, depsFor(repo));
    expect(report).toContain("on branch art");
    expect(await countArtCommits(repo, { branch: "art" })).toEqual({
      "2026-03-01": 4,
      "2026-03-02": 3,
      "2026-03-03": 2,
      "2026-03-04": 1,
    });
  });
});
