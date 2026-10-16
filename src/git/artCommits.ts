import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DayCounts } from "../model/baseline.js";

const execFileAsync = promisify(execFile);

/** Trailer key every art commit carries. Git matches trailer keys case-insensitively. */
export const ART_TRAILER_KEY = "GraphGraft-Art";
/** Trailer value marking the current art commit format. */
export const ART_TRAILER_VALUE = "v1";

const RECORD_SEP = "\x1e";
const FIELD_SEP = "\x1f";

// Each record: author timestamp, then the values of any art trailers.
const LOG_FORMAT = `%x1e%at%x1f%(trailers:key=${ART_TRAILER_KEY},valueonly,separator=%x1f)`;

/**
 * Count art commits per UTC date from `git log` output produced with
 * {@link LOG_FORMAT}. Commits without the art trailer are ignored.
 */
export function parseArtLog(log: string): DayCounts {
  const counts: DayCounts = {};
  for (const record of log.split(RECORD_SEP)) {
    const [timestamp, ...trailers] = record.split(FIELD_SEP);
    if (timestamp === undefined || timestamp.trim() === "") continue;
    if (!trailers.some((value) => value.trim() === ART_TRAILER_VALUE)) continue;

    const seconds = Number(timestamp);
    if (!Number.isInteger(seconds)) {
      throw new Error(`unexpected commit timestamp in git log: ${JSON.stringify(timestamp)}`);
    }
    const date = new Date(seconds * 1000).toISOString().slice(0, 10);
    counts[date] = (counts[date] ?? 0) + 1;
  }
  return counts;
}

/**
 * Count the art commits in a repo per UTC author date, by reading its git log.
 * Defaults to the commits reachable from `HEAD`. A repo with no commits yet
 * returns an empty result.
 */
export async function countArtCommits(
  repoPath: string,
  options: { branch?: string } = {},
): Promise<DayCounts> {
  const branch = options.branch ?? "HEAD";
  const git = (...args: string[]) =>
    execFileAsync("git", ["-C", repoPath, ...args], { maxBuffer: 64 * 1024 * 1024 });

  try {
    await git("rev-parse", "--git-dir");
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");
    if (/not a git repository/.test(stderr)) {
      throw new Error(`not a git repository: ${repoPath}`);
    }
    throw error;
  }

  try {
    await git("rev-parse", "--verify", "--quiet", `${branch}^{commit}`);
  } catch {
    // HEAD only fails to resolve in a repo with no commits yet.
    if (branch === "HEAD") return {};
    throw new Error(`no such branch or commit in ${repoPath}: ${branch}`);
  }

  const { stdout } = await git("log", branch, `--format=${LOG_FORMAT}`);
  return parseArtLog(stdout);
}
