import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { countArtCommits, parseArtLog } from "./artCommits.js";

const run = promisify(execFile);

const unix = (iso: string) => Date.parse(iso) / 1000;
const record = (iso: string, ...trailers: string[]) => `\x1e${unix(iso)}\x1f${trailers.join("\x1f")}`;

describe("parseArtLog", () => {
  test("counts art commits per UTC date", () => {
    const log = [
      record("2026-03-10T12:00:00Z", "v1\n"),
      record("2026-03-10T13:00:00Z", "v1\n"),
      record("2026-03-11T12:00:00Z", "v1\n"),
    ].join("\n");
    expect(parseArtLog(log)).toEqual({ "2026-03-10": 2, "2026-03-11": 1 });
  });

  test("ignores commits without the art trailer or with another version", () => {
    const log = [
      record("2026-03-10T12:00:00Z"),
      record("2026-03-10T12:00:00Z", "v2\n"),
      record("2026-03-10T12:00:00Z", "v1\n"),
    ].join("\n");
    expect(parseArtLog(log)).toEqual({ "2026-03-10": 1 });
  });

  test("buckets by UTC, not local time", () => {
    const log = record("2026-03-10T23:59:59Z", "v1\n") + record("2026-03-11T00:00:00Z", "v1\n");
    expect(parseArtLog(log)).toEqual({ "2026-03-10": 1, "2026-03-11": 1 });
  });

  test("an empty log gives no counts", () => {
    expect(parseArtLog("")).toEqual({});
  });

  test("rejects a malformed timestamp", () => {
    expect(() => parseArtLog("\x1enot-a-number\x1fv1\n")).toThrow("timestamp");
  });
});

describe("countArtCommits (real git repo in a temp folder)", () => {
  let repo: string;
  let emptyRepo: string;
  let notARepo: string;
  let previousCeiling: string | undefined;

  const git = (cwd: string, args: string[], date?: string) =>
    run(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
      { cwd, env: { ...process.env, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) } },
    );

  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), "graphgraft-test-"));
    emptyRepo = await mkdtemp(join(tmpdir(), "graphgraft-test-"));
    notARepo = await mkdtemp(join(tmpdir(), "graphgraft-test-"));
    // The temp folder may sit inside some other git repo (e.g. a home-folder
    // repo); stop git searching upwards so notARepo really is not a repo.
    previousCeiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = dirname(notARepo);
    await git(repo, ["init", "-q", "-b", "main"]);
    await git(emptyRepo, ["init", "-q", "-b", "main"]);

    const commit = (msg: string, date: string, ...trailers: string[]) =>
      git(repo, ["commit", "--allow-empty", "-q", "-m", msg, ...trailers.flatMap((t) => ["-m", t])], date);

    await commit("art 1", "2026-03-10T12:00:00Z", "GraphGraft-Art: v1");
    await commit("art 2", "2026-03-10T12:00:00Z", "GraphGraft-Art: v1");
    await commit("art 3", "2026-03-11T12:00:00Z", "graphgraft-art: v1"); // key case is irrelevant
    await commit("real work", "2026-03-11T12:00:00Z");
    await commit("other version", "2026-03-12T12:00:00Z", "GraphGraft-Art: v2");
  });

  afterAll(async () => {
    if (previousCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = previousCeiling;
    for (const dir of [repo, emptyRepo, notARepo]) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("counts only marked commits, per author date", async () => {
    expect(await countArtCommits(repo)).toEqual({ "2026-03-10": 2, "2026-03-11": 1 });
  });

  test("a repo with no commits returns an empty result", async () => {
    expect(await countArtCommits(emptyRepo)).toEqual({});
  });

  test("an unknown branch throws a clear error", async () => {
    await expect(countArtCommits(repo, { branch: "nope" })).rejects.toThrow("no such branch");
  });

  test("a folder that is not a git repo throws a clear error", async () => {
    await expect(countArtCommits(notARepo)).rejects.toThrow("not a git repository");
  });
});
