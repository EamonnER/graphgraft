import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { countArtCommits } from "./artCommits.js";
import { writeArtCommits } from "./writer.js";

const run = promisify(execFile);
const identity = { name: "Test Author", email: "123+test@users.noreply.github.com" };

const dirs: string[] = [];
let previousCeiling: string | undefined;

const git = (cwd: string, ...args: string[]) =>
  run("git", ["-c", "user.name=Real", "-c", "user.email=real@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd,
  }).then((r) => r.stdout.trim());

async function newRepo(withCommit = false): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "graphgraft-test-"));
  dirs.push(dir);
  await git(dir, "init", "-q", "-b", "main");
  if (withCommit) await git(dir, "commit", "--allow-empty", "-q", "-m", "Initial commit");
  return dir;
}

beforeAll(() => {
  // The temp folder may sit inside another git repo; don't let git search upwards.
  previousCeiling = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = dirname(join(tmpdir(), "x"));
});

afterAll(async () => {
  if (previousCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
  else process.env.GIT_CEILING_DIRECTORIES = previousCeiling;
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe("writeArtCommits", () => {
  let repo: string;
  beforeEach(async () => {
    repo = await newRepo();
  });

  test("round trip: countArtCommits reads back exactly what was planned", async () => {
    const planned = { "2026-03-10": 2, "2026-03-11": 1, "2026-03-12": 0 };
    expect(await writeArtCommits(repo, planned, identity)).toBe(3);
    expect(await countArtCommits(repo)).toEqual({ "2026-03-10": 2, "2026-03-11": 1 });
  });

  test("commits are empty, dated 12:00 UTC, and use the given identity and trailer", async () => {
    await writeArtCommits(repo, { "2026-03-10": 1 }, identity);
    const show = await git(repo, "log", "-1", "--format=%an|%ae|%cn|%ce|%aI|%cI|%B");
    expect(show).toContain("Test Author|123+test@users.noreply.github.com|Test Author|123+test@users.noreply.github.com|");
    expect(show).toContain("2026-03-10T12:00:00Z|2026-03-10T12:00:00Z|");
    expect(show).toContain("art: 2026-03-10 #1");
    expect(show).toContain("GraphGraft-Art: v1");
    expect(await git(repo, "rev-parse", "HEAD^{tree}")).toBe("4b825dc642cb6eb9a060e54bf8d69288fbee4904"); // the empty tree
  });

  test("adds on top of existing history and keeps it", async () => {
    const existing = await newRepo(true);
    const before = await git(existing, "rev-parse", "HEAD");
    await writeArtCommits(existing, { "2026-03-10": 2, "2026-03-11": 1 }, identity);

    expect(await git(existing, "rev-list", "--count", "HEAD")).toBe("4");
    expect(await git(existing, "merge-base", "--is-ancestor", before, "HEAD").then(() => true)).toBe(true);
    expect(await countArtCommits(existing)).toEqual({ "2026-03-10": 2, "2026-03-11": 1 });
  });

  test("writing twice adds the commits twice", async () => {
    await writeArtCommits(repo, { "2026-03-10": 2 }, identity);
    await writeArtCommits(repo, { "2026-03-10": 2 }, identity);
    expect(await countArtCommits(repo)).toEqual({ "2026-03-10": 4 });
  });

  test("leaves a checked-out branch with a clean working tree", async () => {
    const existing = await newRepo(true);
    await writeArtCommits(existing, { "2026-03-10": 3 }, identity);
    expect(await git(existing, "status", "--porcelain")).toBe("");
  });

  test("produces a healthy repo", async () => {
    await writeArtCommits(repo, { "2026-03-10": 5, "2026-03-11": 4 }, identity);
    await expect(git(repo, "fsck", "--strict")).resolves.toBeDefined();
  });

  test("is deterministic for the same inputs", async () => {
    const other = await newRepo();
    const planned = { "2026-03-10": 2, "2026-03-11": 3 };
    await writeArtCommits(repo, planned, identity);
    await writeArtCommits(other, planned, identity);
    expect(await git(repo, "rev-parse", "HEAD")).toBe(await git(other, "rev-parse", "HEAD"));
  });

  test("writes to the requested branch", async () => {
    await writeArtCommits(repo, { "2026-03-10": 1 }, { ...identity, branch: "art" });
    expect(await countArtCommits(repo, { branch: "art" })).toEqual({ "2026-03-10": 1 });
  });

  test("an empty plan creates nothing", async () => {
    expect(await writeArtCommits(repo, {}, identity)).toBe(0);
    expect(await writeArtCommits(repo, { "2026-03-10": 0 }, identity)).toBe(0);
    await expect(git(repo, "rev-parse", "--verify", "--quiet", "refs/heads/main")).rejects.toBeDefined();
  });

  test("rejects invalid input before writing anything", async () => {
    const bad = [
      writeArtCommits(repo, { "2026-02-30": 1 }, identity),
      writeArtCommits(repo, { "10/03/2026": 1 }, identity),
      writeArtCommits(repo, { "2026-03-10": -1 }, identity),
      writeArtCommits(repo, { "2026-03-10": 1.5 }, identity),
      writeArtCommits(repo, { "2026-03-10": 1 }, { ...identity, name: "" }),
      writeArtCommits(repo, { "2026-03-10": 1 }, { ...identity, email: "a<b>@example.com" }),
      writeArtCommits(repo, { "2026-03-10": 1 }, { ...identity, branch: "bad..name" }),
    ];
    for (const attempt of bad) await expect(attempt).rejects.toThrow(RangeError);
    await expect(git(repo, "rev-parse", "--verify", "--quiet", "refs/heads/main")).rejects.toBeDefined();
  });

  test("a folder that is not a git repo throws a clear error", async () => {
    const notARepo = await mkdtemp(join(tmpdir(), "graphgraft-test-"));
    dirs.push(notARepo);
    await expect(writeArtCommits(notARepo, { "2026-03-10": 1 }, identity)).rejects.toThrow("not a git repository");
  });
});
