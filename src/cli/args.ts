import { parseArgs } from "node:util";

/** Bad command-line input; the message is safe to show to the user. */
export class UsageError extends Error {}

export const USAGE = `Usage:
  graphgraft plan --login <user> --from <YYYY-MM-DD> --to <YYYY-MM-DD>
                  --pattern <file> --start <YYYY-MM-DD> [--art-repo <path>] [--max-per-day <n>]

Dry run: shows the commits needed to draw the pattern. Nothing is written.
The GitHub token is read from the GITHUB_TOKEN environment variable.`;

export interface PlanArgs {
  login: string;
  from: string;
  to: string;
  /** Path to the pattern file. */
  pattern: string;
  start: string;
  artRepo?: string;
  maxPerDay?: number;
}

const REQUIRED = ["login", "from", "to", "pattern", "start"] as const;

/** Parse the arguments of `graphgraft plan ...` (everything after the program name). */
export function parsePlanArgs(argv: string[]): PlanArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        login: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        pattern: { type: "string" },
        start: { type: "string" },
        "art-repo": { type: "string" },
        "max-per-day": { type: "string" },
      },
    });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }

  const { values, positionals } = parsed;
  if (positionals.length !== 1 || positionals[0] !== "plan") {
    throw new UsageError(`expected the command "plan"`);
  }
  const missing = REQUIRED.filter((name) => !values[name]);
  if (missing.length > 0) {
    throw new UsageError(`missing required option(s): ${missing.map((m) => `--${m}`).join(", ")}`);
  }

  const args: PlanArgs = {
    login: values.login!,
    from: values.from!,
    to: values.to!,
    pattern: values.pattern!,
    start: values.start!,
  };
  if (values["art-repo"]) args.artRepo = values["art-repo"];
  if (values["max-per-day"] !== undefined) {
    const n = Number(values["max-per-day"]);
    if (!Number.isInteger(n) || n < 1) {
      throw new UsageError(`--max-per-day must be a positive integer, got ${values["max-per-day"]}`);
    }
    args.maxPerDay = n;
  }
  return args;
}
