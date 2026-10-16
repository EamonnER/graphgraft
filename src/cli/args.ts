import { parseArgs } from "node:util";

/** Bad command-line input; the message is safe to show to the user. */
export class UsageError extends Error {}

export const USAGE = `Usage:
  graphgraft plan  --login <user> --from <YYYY-MM-DD> --to <YYYY-MM-DD>
                   --pattern <file> --start <YYYY-MM-DD> [--art-repo <path>] [--max-per-day <n>]

  graphgraft apply --login <user> --from <YYYY-MM-DD> --to <YYYY-MM-DD>
                   --pattern <file> --start <YYYY-MM-DD> --art-repo <path>
                   --name <author name> --email <author email>
                   [--branch <name>] [--max-per-day <n>] [--yes]

plan:  dry run. Shows the commits needed to draw the pattern. Nothing is written.
apply: like plan, and with --yes adds the missing art commits to the art repo.
       Without --yes it writes nothing. It never pushes.

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

export interface ApplyArgs extends PlanArgs {
  artRepo: string;
  name: string;
  email: string;
  branch?: string;
  yes: boolean;
}

export type Command = { command: "plan"; args: PlanArgs } | { command: "apply"; args: ApplyArgs };

const REQUIRED = ["login", "from", "to", "pattern", "start"] as const;
const APPLY_ONLY = ["name", "email", "branch", "yes"] as const;

function parseRaw(argv: string[], command: "plan" | "apply") {
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
        name: { type: "string" },
        email: { type: "string" },
        branch: { type: "string" },
        yes: { type: "boolean" },
      },
    });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }

  const { values, positionals } = parsed;
  if (positionals.length !== 1 || positionals[0] !== command) {
    throw new UsageError(`expected the command "${command}"`);
  }
  return values;
}

function parseCommon(values: ReturnType<typeof parseRaw>): PlanArgs {
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

/** Parse the arguments of `graphgraft plan ...` (everything after the program name). */
export function parsePlanArgs(argv: string[]): PlanArgs {
  const values = parseRaw(argv, "plan");
  const misplaced = APPLY_ONLY.filter((name) => values[name] !== undefined);
  if (misplaced.length > 0) {
    throw new UsageError(`${misplaced.map((m) => `--${m}`).join(", ")} only apply to the "apply" command`);
  }
  return parseCommon(values);
}

/** Parse the arguments of `graphgraft apply ...` (everything after the program name). */
export function parseApplyArgs(argv: string[]): ApplyArgs {
  const values = parseRaw(argv, "apply");
  const common = parseCommon(values);

  const missing = (["art-repo", "name", "email"] as const).filter((name) => !values[name]);
  if (missing.length > 0) {
    throw new UsageError(`missing required option(s): ${missing.map((m) => `--${m}`).join(", ")}`);
  }

  const args: ApplyArgs = {
    ...common,
    artRepo: values["art-repo"]!,
    name: values.name!,
    email: values.email!,
    yes: values.yes === true,
  };
  if (values.branch) args.branch = values.branch;
  return args;
}

/** Parse the whole command line, choosing the command from the first argument. */
export function parseCommand(argv: string[]): Command {
  switch (argv[0]) {
    case "plan":
      return { command: "plan", args: parsePlanArgs(argv) };
    case "apply":
      return { command: "apply", args: parseApplyArgs(argv) };
    default:
      throw new UsageError(`expected a command: "plan" or "apply"`);
  }
}
