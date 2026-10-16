import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { DayCounts } from "../model/baseline.js";
import { ART_TRAILER_KEY, ART_TRAILER_VALUE } from "./artCommits.js";

const execFileAsync = promisify(execFile);

export interface WriteOptions {
  /** Author and committer name. */
  name: string;
  /** Author and committer email. Must be linked to the GitHub account for the commits to count. */
  email: string;
  /** Branch to add the commits to. Created if it doesn't exist. */
  branch?: string;
}

/**
 * Add `planned` art commits to a local repo: that many empty commits on each date,
 * dated 12:00 UTC, each carrying the art trailer so `countArtCommits` can recognise them.
 *
 * Commits are added on top of the branch's current tip (or start the branch if it doesn't exist).
 * Nothing is pushed and the working tree is untouched. Returns the number of commits created.
 */
export async function writeArtCommits(
  repoPath: string,
  planned: DayCounts,
  options: WriteOptions,
): Promise<number> {
  const { name, email } = options;
  const branch = options.branch ?? "main";
  const days = validate(planned, name, email);
  const total = days.reduce((sum, [, count]) => sum + count, 0);

  const git = (...args: string[]) => execFileAsync("git", ["-C", repoPath, ...args]);
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
    await git("check-ref-format", "--branch", branch);
  } catch {
    throw new RangeError(`invalid branch name: ${branch}`);
  }
  if (total === 0) return 0;

  let tip: string | undefined;
  try {
    tip = (await git("rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`)).stdout.trim();
  } catch {
    tip = undefined; // branch doesn't exist yet
  }

  await fastImport(repoPath, buildStream(days, { name, email, branch, tip }));
  return total;
}

function validate(planned: DayCounts, name: string, email: string): [string, number][] {
  if (name.trim() === "" || /[<>\n\r]/.test(name)) {
    throw new RangeError(`invalid author name: ${JSON.stringify(name)}`);
  }
  if (email.trim() === "" || /[<>\s]/.test(email)) {
    throw new RangeError(`invalid author email: ${JSON.stringify(email)}`);
  }
  const days: [string, number][] = [];
  for (const [date, count] of Object.entries(planned)) {
    const time = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T12:00:00Z`) : NaN;
    if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== date) {
      throw new RangeError(`invalid date, expected a real YYYY-MM-DD: ${date}`);
    }
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`${date}: count must be a non-negative integer, got ${count}`);
    }
    if (count > 0) days.push([date, count]);
  }
  return days.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function buildStream(
  days: [string, number][],
  { name, email, branch, tip }: { name: string; email: string; branch: string; tip: string | undefined },
): Buffer {
  const parts: Buffer[] = [];
  let first = true;
  for (const [date, count] of days) {
    const seconds = Date.parse(`${date}T12:00:00Z`) / 1000;
    const identity = `${name} <${email}> ${seconds} +0000`;
    for (let n = 1; n <= count; n++) {
      const message = `art: ${date} #${n}\n\n${ART_TRAILER_KEY}: ${ART_TRAILER_VALUE}\n`;
      const lines = [
        `commit refs/heads/${branch}`,
        `author ${identity}`,
        `committer ${identity}`,
        `data ${Buffer.byteLength(message)}`,
      ];
      parts.push(Buffer.from(lines.join("\n") + "\n" + message));
      // Only the first commit names its parent; later ones follow the branch.
      if (first && tip) parts.push(Buffer.from(`from ${tip}\n`));
      parts.push(Buffer.from("\n"));
      first = false;
    }
  }
  return Buffer.concat(parts);
}

function fastImport(repoPath: string, stream: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", repoPath, "fast-import", "--quiet"], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git fast-import failed (exit ${code}): ${stderr.trim()}`));
    });
    child.stdin.on("error", () => {}); // a failed import is reported via the exit code
    child.stdin.end(stream);
  });
}
