import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { countArtCommits as realCountArtCommits } from "../git/artCommits.js";
import { deleteRepo as realDeleteRepo, getRepoCommitCount as realGetRepoCommitCount } from "../github/repos.js";

const execFileAsync = promisify(execFile);

/** How many commits beyond our art commits a repo may have (e.g. an initial commit and a licence). */
const ALLOWED_EXTRA_COMMITS = 2;

export interface CleanOptions {
  /** The GitHub repo to delete, as `owner/name`. */
  repo: string;
  /** Token with the `delete_repo` scope. */
  token: string;
  /** Local clone of the art repo, used to check we are deleting the right thing. */
  artRepo: string;
  /** Must exactly equal `repo` for anything to be deleted. */
  confirm?: string;
  /** Actually delete. Without it, clean only reports what it would do. */
  yes: boolean;
}

export interface CleanDeps {
  countArtCommits: typeof realCountArtCommits;
  getRepoCommitCount: typeof realGetRepoCommitCount;
  deleteRepo: typeof realDeleteRepo;
  getOriginUrl: (repoPath: string) => Promise<string>;
}

async function realGetOriginUrl(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "remote", "get-url", "origin"]);
    return stdout.trim();
  } catch {
    throw new Error(`could not read the "origin" remote of ${repoPath}`);
  }
}

const realDeps: CleanDeps = {
  countArtCommits: realCountArtCommits,
  getRepoCommitCount: realGetRepoCommitCount,
  deleteRepo: realDeleteRepo,
  getOriginUrl: realGetOriginUrl,
};

/** Extract `owner` and `name` from a GitHub remote URL (ssh or https), or null if it isn't one. */
export function parseGithubRemote(url: string): { owner: string; name: string } | null {
  const match =
    /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url) ??
    /^(?:https?|ssh|git):\/\/(?:[^@/\s]+@)?github\.com(?::\d+)?\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url);
  return match ? { owner: match[1]!, name: match[2]! } : null;
}

/**
 * Delete the GitHub art repo, after checking it really is an art repo.
 *
 * Removing art from the graph needs the repo deleted.
 * The checks, all done before anything is deleted:
 *  - the local clone's `origin` is this repo;
 *  - the repo has at most {@link ALLOWED_EXTRA_COMMITS} commits more than the clone's art commits,
 *    so a repo with real history is refused;
 *  - with `yes`, `confirm` exactly equals `repo`.
 * Without `yes` it only reports. The local clone is never touched.
 */
export async function runClean(options: CleanOptions, deps: CleanDeps = realDeps): Promise<string> {
  const { repo, token, artRepo, confirm, yes } = options;

  const parts = /^([^/\s]+)\/([^/\s]+)$/.exec(repo);
  if (!parts) {
    throw new RangeError(`--repo must look like owner/name, got ${JSON.stringify(repo)}`);
  }
  const [owner, name] = [parts[1]!, parts[2]!];

  if (yes && confirm !== repo) {
    throw new RangeError(`--confirm must exactly match --repo (${repo}) to delete it`);
  }

  const origin = parseGithubRemote(await deps.getOriginUrl(artRepo));
  if (!origin || origin.owner.toLowerCase() !== owner.toLowerCase() || origin.name.toLowerCase() !== name.toLowerCase()) {
    throw new Error(`the "origin" remote of ${artRepo} is not ${repo}; refusing to delete`);
  }

  const localArt = Object.values(await deps.countArtCommits(artRepo)).reduce((sum, n) => sum + n, 0);
  const remoteCommits = await deps.getRepoCommitCount({ owner, name, token });
  if (remoteCommits > localArt + ALLOWED_EXTRA_COMMITS) {
    throw new Error(
      `${repo} has ${remoteCommits} commits but ${artRepo} has only ${localArt} art commits ` +
        `(at most ${ALLOWED_EXTRA_COMMITS} others are allowed). It doesn't look like a dedicated art repo; refusing to delete.`,
    );
  }

  const checked =
    `${repo} has ${remoteCommits} commits, matching ${localArt} art commits in ${artRepo}` +
    ` (its origin is this repo).`;

  if (!yes) {
    return (
      `Dry run: nothing was deleted.\n${checked}\n\n` +
      `To delete ${repo} permanently, re-run with:\n  --yes --confirm ${repo}`
    );
  }

  await deps.deleteRepo({ owner, name, token });
  return [
    `Deleted ${repo}. ${checked}`,
    "",
    "Next:",
    '  1. On GitHub: go to Settings, Public profile. Untick "Include private contributions on my profile",',
    "     save, then tick it again and save. This refreshes your graph.",
    `  2. Create a new empty repo named ${name} on GitHub (no README or licence; completely empty),`,
    `     and either delete the local clone (${artRepo}) or reset it to its first commit.`,
    "  3. Run `graphgraft plan` to check the graph is clear, then `graphgraft apply`.",
  ].join("\n");
}
