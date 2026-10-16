import { describe, expect, test, vi } from "vitest";
import type { DayCounts } from "../model/baseline.js";
import { parseGithubRemote, runClean, type CleanDeps, type CleanOptions } from "./clean.js";

function fakeDeps(init: { origin?: string; art?: DayCounts; remoteCommits?: number } = {}) {
  const deleteRepo = vi.fn(async () => {});
  const getRepoCommitCount = vi.fn(async () => init.remoteCommits ?? 73);
  const deps = {
    countArtCommits: vi.fn(async () => init.art ?? { "2026-04-08": 70, "2026-04-09": 2 }),
    getRepoCommitCount,
    deleteRepo,
    getOriginUrl: vi.fn(async () => init.origin ?? "git@github.com:octocat/commit-art.git"),
  } as unknown as CleanDeps;
  return { deps, deleteRepo, getRepoCommitCount };
}

const base: CleanOptions = {
  repo: "octocat/commit-art",
  token: "secret-token",
  artRepo: "../commit-art",
  confirm: "octocat/commit-art",
  yes: true,
};

describe("runClean", () => {
  test("without --yes it only checks and says how to delete", async () => {
    const { deps, deleteRepo } = fakeDeps();
    const report = await runClean({ ...base, yes: false, confirm: undefined }, deps);

    expect(deleteRepo).not.toHaveBeenCalled();
    expect(report).toContain("Dry run: nothing was deleted");
    expect(report).toContain("--yes --confirm octocat/commit-art");
  });

  test("with --yes and a matching --confirm it deletes the repo and prints the next steps", async () => {
    const { deps, deleteRepo, getRepoCommitCount } = fakeDeps();
    const report = await runClean(base, deps);

    expect(deleteRepo).toHaveBeenCalledExactlyOnceWith({ owner: "octocat", name: "commit-art", token: "secret-token" });
    expect(getRepoCommitCount).toHaveBeenCalledWith({ owner: "octocat", name: "commit-art", token: "secret-token" });
    expect(report).toContain("Deleted octocat/commit-art");
    expect(report).toContain("Include private contributions");
    expect(report).toContain("graphgraft apply");
    expect(report).not.toContain("secret-token");
  });

  test("--confirm must match --repo exactly, and is needed only for --yes", async () => {
    const { deps, deleteRepo } = fakeDeps();
    for (const confirm of [undefined, "octocat/Commit-Art", "octocat/commit-art ", "commit-art"]) {
      await expect(runClean({ ...base, confirm }, deps)).rejects.toThrow("--confirm must exactly match");
    }
    expect(deleteRepo).not.toHaveBeenCalled();
  });

  test("refuses when the local clone's origin is a different repo", async () => {
    for (const origin of ["git@github.com:octocat/other-repo.git", "https://github.com/someone/commit-art.git", "/some/local/path"]) {
      const { deps, deleteRepo } = fakeDeps({ origin });
      await expect(runClean(base, deps)).rejects.toThrow('"origin" remote');
      expect(deleteRepo).not.toHaveBeenCalled();
    }
  });

  test("accepts an https origin with different letter case", async () => {
    const { deps, deleteRepo } = fakeDeps({ origin: "https://github.com/Octocat/Commit-Art" });
    await runClean(base, deps);
    expect(deleteRepo).toHaveBeenCalledOnce();
  });

  test("allows up to 2 commits beyond the local art commits, and refuses more", async () => {
    // local art is 72 commits
    const ok = fakeDeps({ remoteCommits: 74 });
    await runClean(base, ok.deps);
    expect(ok.deleteRepo).toHaveBeenCalledOnce();

    const tooMany = fakeDeps({ remoteCommits: 75 });
    await expect(runClean(base, tooMany.deps)).rejects.toThrow(/has 75 commits but .* only 72 art commits/);
    expect(tooMany.deleteRepo).not.toHaveBeenCalled();
  });

  test("refuses a repo with real history", async () => {
    const { deps, deleteRepo } = fakeDeps({ art: {}, remoteCommits: 400 });
    await expect(runClean(base, deps)).rejects.toThrow("doesn't look like a dedicated art repo");
    expect(deleteRepo).not.toHaveBeenCalled();
  });

  test("allows a nearly empty repo even when the local clone has no art (e.g. after a force-push)", async () => {
    const { deps, deleteRepo } = fakeDeps({ art: {}, remoteCommits: 1 });
    await runClean(base, deps);
    expect(deleteRepo).toHaveBeenCalledOnce();
  });

  test("rejects a malformed --repo before doing anything", async () => {
    const { deps, deleteRepo, getRepoCommitCount } = fakeDeps();
    for (const repo of ["commit-art", "a/b/c", "", "a/"]) {
      await expect(runClean({ ...base, repo, confirm: repo }, deps)).rejects.toThrow(RangeError);
    }
    expect(getRepoCommitCount).not.toHaveBeenCalled();
    expect(deleteRepo).not.toHaveBeenCalled();
  });

  test("does not delete when looking up the remote fails", async () => {
    const { deps, deleteRepo } = fakeDeps();
    (deps.getRepoCommitCount as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("GitHub API error: nope"));
    await expect(runClean(base, deps)).rejects.toThrow("GitHub API error");
    expect(deleteRepo).not.toHaveBeenCalled();
  });
});

describe("parseGithubRemote", () => {
  test("parses ssh and https remotes, with or without .git", () => {
    const expected = { owner: "octocat", name: "commit-art" };
    expect(parseGithubRemote("git@github.com:octocat/commit-art.git")).toEqual(expected);
    expect(parseGithubRemote("git@github.com:octocat/commit-art")).toEqual(expected);
    expect(parseGithubRemote("https://github.com/octocat/commit-art.git")).toEqual(expected);
    expect(parseGithubRemote("https://github.com/octocat/commit-art")).toEqual(expected);
    expect(parseGithubRemote("https://user@github.com/octocat/commit-art/")).toEqual(expected);
    expect(parseGithubRemote("ssh://git@github.com/octocat/commit-art.git")).toEqual(expected);
  });

  test("returns null for anything that is not a GitHub repo URL", () => {
    expect(parseGithubRemote("")).toBeNull();
    expect(parseGithubRemote("/home/me/repo")).toBeNull();
    expect(parseGithubRemote("https://gitlab.com/octocat/commit-art.git")).toBeNull();
    expect(parseGithubRemote("https://github.com/octocat")).toBeNull();
    expect(parseGithubRemote("https://github.com/octocat/commit-art/extra")).toBeNull();
  });
});
