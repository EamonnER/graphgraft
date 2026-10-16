import { readFile } from "node:fs/promises";
import { parseCommand, USAGE, UsageError } from "./cli/args.js";
import { runApply } from "./commands/apply.js";
import { runClean } from "./commands/clean.js";
import { runPlan } from "./commands/plan.js";

async function main(): Promise<void> {
  const parsed = parseCommand(process.argv.slice(2));

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new UsageError("the GITHUB_TOKEN environment variable is not set");
  }

  if (parsed.command === "clean") {
    const { repo, artRepo, confirm, yes } = parsed.args;
    console.log(await runClean({ repo, token, artRepo, yes, ...(confirm !== undefined && { confirm }) }));
    return;
  }

  const { command, args } = parsed;
  const planOptions = {
    login: args.login,
    token,
    from: args.from,
    to: args.to,
    patternText: await readFile(args.pattern, "utf8"),
    start: args.start,
    ...(args.artRepo !== undefined && { artRepo: args.artRepo }),
    ...(args.maxPerDay !== undefined && { maxPerDay: args.maxPerDay }),
  };

  if (command === "plan") {
    console.log(await runPlan(planOptions));
  } else {
    console.log(
      await runApply({
        ...planOptions,
        artRepo: args.artRepo,
        name: args.name,
        email: args.email,
        yes: args.yes,
        ...(args.branch !== undefined && { branch: args.branch }),
      }),
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}`);
  if (error instanceof UsageError) console.error(`\n${USAGE}`);
  process.exitCode = 1;
});
