import { describe, expect, test } from "vitest";
import { parseApplyArgs, parseCleanArgs, parseCommand, parsePlanArgs, UsageError } from "./args.js";

const required = ["plan", "--login", "octocat", "--from", "2026-03-01", "--to", "2026-05-30", "--pattern", "p.txt", "--start", "2026-03-01"];

describe("parsePlanArgs", () => {
  test("parses the required options", () => {
    expect(parsePlanArgs(required)).toEqual({
      login: "octocat",
      from: "2026-03-01",
      to: "2026-05-30",
      pattern: "p.txt",
      start: "2026-03-01",
    });
  });

  test("parses the optional options", () => {
    const args = parsePlanArgs([...required, "--art-repo", "../art", "--max-per-day", "80"]);
    expect(args.artRepo).toBe("../art");
    expect(args.maxPerDay).toBe(80);
  });

  test("reports every missing required option", () => {
    expect(() => parsePlanArgs(["plan", "--login", "octocat"])).toThrow("--from, --to, --pattern, --start");
  });

  test("requires the plan command", () => {
    expect(() => parsePlanArgs(required.slice(1))).toThrow(UsageError);
    expect(() => parsePlanArgs(["apply", ...required.slice(1)])).toThrow(UsageError);
  });

  test("rejects unknown options", () => {
    expect(() => parsePlanArgs([...required, "--token", "x"])).toThrow(UsageError);
  });

  test("rejects an invalid --max-per-day", () => {
    for (const bad of ["0", "-3", "1.5", "abc"]) {
      expect(() => parsePlanArgs([...required, "--max-per-day", bad])).toThrow("--max-per-day");
    }
  });

  test("rejects apply-only options", () => {
    expect(() => parsePlanArgs([...required, "--yes"])).toThrow('--yes not valid for "plan"');
    expect(() => parsePlanArgs([...required, "--name", "x"])).toThrow(UsageError);
  });

  test("parses --repeat and --gap", () => {
    expect(parsePlanArgs([...required, "--repeat"]).repeat).toBe(true);
    expect(parsePlanArgs([...required, "--repeat"]).gap).toBeUndefined();
    const args = parsePlanArgs([...required, "--repeat", "--gap", "2"]);
    expect(args.repeat).toBe(true);
    expect(args.gap).toBe(2);
    expect(parsePlanArgs([...required, "--repeat", "--gap", "0"]).gap).toBe(0);
  });

  test("rejects --gap without --repeat, and an invalid gap", () => {
    expect(() => parsePlanArgs([...required, "--gap", "2"])).toThrow("--gap only makes sense together with --repeat");
    for (const bad of ["-1", "1.5", "abc", ""]) {
      expect(() => parsePlanArgs([...required, "--repeat", `--gap=${bad}`])).toThrow("--gap must be");
    }
    // Node's own parser refuses a value that looks like an option.
    expect(() => parsePlanArgs([...required, "--repeat", "--gap", "-1"])).toThrow(UsageError);
  });

  test("rejects clean-only options", () => {
    expect(() => parsePlanArgs([...required, "--repo", "a/b"])).toThrow('--repo not valid for "plan"');
  });
});

describe("parseCleanArgs", () => {
  const clean = ["clean", "--repo", "octocat/commit-art", "--art-repo", "../commit-art"];

  test("parses the required options, with --yes off by default", () => {
    expect(parseCleanArgs(clean)).toEqual({ repo: "octocat/commit-art", artRepo: "../commit-art", yes: false });
  });

  test("parses --confirm and --yes", () => {
    const args = parseCleanArgs([...clean, "--confirm", "octocat/commit-art", "--yes"]);
    expect(args.confirm).toBe("octocat/commit-art");
    expect(args.yes).toBe(true);
  });

  test("requires --repo and --art-repo", () => {
    expect(() => parseCleanArgs(["clean"])).toThrow("--repo, --art-repo");
    expect(() => parseCleanArgs(["clean", "--repo", "a/b"])).toThrow("--art-repo");
  });

  test("rejects options from other commands", () => {
    expect(() => parseCleanArgs([...clean, "--login", "x"])).toThrow('--login not valid for "clean"');
    expect(() => parseCleanArgs([...clean, "--name", "x"])).toThrow(UsageError);
    expect(() => parseCleanArgs([...clean, "--repeat"])).toThrow('--repeat not valid for "clean"');
  });
});

describe("parseApplyArgs", () => {
  const apply = ["apply", ...required.slice(1)];
  const withArt = [...apply, "--art-repo", "../art", "--name", "Ann", "--email", "ann@example.com"];

  test("parses the required options, with --yes off by default", () => {
    expect(parseApplyArgs(withArt)).toEqual({
      login: "octocat",
      from: "2026-03-01",
      to: "2026-05-30",
      pattern: "p.txt",
      start: "2026-03-01",
      artRepo: "../art",
      name: "Ann",
      email: "ann@example.com",
      yes: false,
    });
  });

  test("parses --yes, --branch and --max-per-day", () => {
    const args = parseApplyArgs([...withArt, "--yes", "--branch", "art", "--max-per-day", "30"]);
    expect(args.yes).toBe(true);
    expect(args.branch).toBe("art");
    expect(args.maxPerDay).toBe(30);
  });

  test("accepts --repeat and --gap", () => {
    const args = parseApplyArgs([...withArt, "--repeat", "--gap", "1"]);
    expect(args.repeat).toBe(true);
    expect(args.gap).toBe(1);
  });

  test("requires the art repo, name and email", () => {
    expect(() => parseApplyArgs(apply)).toThrow("--art-repo, --name, --email");
    expect(() => parseApplyArgs([...apply, "--art-repo", "../art", "--name", "Ann"])).toThrow("--email");
  });

  test("requires the apply command", () => {
    expect(() => parseApplyArgs(withArt.map((a) => (a === "apply" ? "plan" : a)))).toThrow(UsageError);
  });
});

describe("parseCommand", () => {
  test("dispatches on the first argument", () => {
    expect(parseCommand(required).command).toBe("plan");
    const apply = ["apply", ...required.slice(1), "--art-repo", "a", "--name", "n", "--email", "e"];
    expect(parseCommand(apply).command).toBe("apply");
    expect(parseCommand(["clean", "--repo", "a/b", "--art-repo", "x"]).command).toBe("clean");
  });

  test("rejects a missing or unknown command", () => {
    expect(() => parseCommand([])).toThrow(UsageError);
    expect(() => parseCommand(["push"])).toThrow(UsageError);
  });
});
