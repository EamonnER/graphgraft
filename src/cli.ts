import { readFile } from "node:fs/promises";
import { parsePlanArgs, USAGE, UsageError } from "./cli/args.js";
import { runPlan } from "./commands/plan.js";

async function main(): Promise<void> {
  const args = parsePlanArgs(process.argv.slice(2));

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new UsageError("the GITHUB_TOKEN environment variable is not set");
  }

  const patternText = await readFile(args.pattern, "utf8");
  const report = await runPlan({
    login: args.login,
    token,
    from: args.from,
    to: args.to,
    patternText,
    start: args.start,
    ...(args.artRepo !== undefined && { artRepo: args.artRepo }),
    ...(args.maxPerDay !== undefined && { maxPerDay: args.maxPerDay }),
  });
  console.log(report);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}`);
  if (error instanceof UsageError) console.error(`\n${USAGE}`);
  process.exitCode = 1;
});
