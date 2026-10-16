import { describe, expect, test } from "vitest";
import { parsePlanArgs, UsageError } from "./args.js";

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
});
