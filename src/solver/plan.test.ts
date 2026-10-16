import { describe, expect, test } from "vitest";
import { simulate } from "../model/simulate.js";
import { solve } from "./plan.js";

describe("solve", () => {
  test("draws every level on an empty graph with the fewest commits", () => {
    const baseline = { d0: 0, d1: 0, d2: 0, d3: 0, d4: 0 };
    const targets = { d0: 0, d1: 1, d2: 2, d3: 3, d4: 4 } as const;
    const plan = solve(baseline, targets);
    expect(plan.planned).toEqual({ d1: 1, d2: 2, d3: 3, d4: 4 });
    expect(plan.max).toBe(4);
    expect(plan.conflicts).toEqual([]);
    expect(simulate(baseline, plan.planned).levels).toEqual(targets);
  });

  test("only adds the difference on days that already have real commits", () => {
    const baseline = { a: 2, b: 0 };
    const plan = solve(baseline, { a: 4, b: 4 });
    // both end at the busiest total; `a` only needs the difference
    expect(plan.planned).toEqual({ b: 2 });
    expect(plan.conflicts).toEqual([]);
  });

  test("leaves untargeted days alone", () => {
    const plan = solve({ a: 0, b: 3, c: 0 }, { a: 4 });
    expect(Object.keys(plan.planned)).toEqual(["a"]);
  });

  test("raises the busiest day so a bright real day fits a lighter target", () => {
    // Real day has 10 commits; it only reads as level 1 once the max is 40.
    const plan = solve({ a: 10, b: 0 }, { a: 1, b: 4 });
    expect(plan.planned).toEqual({ b: 40 });
    expect(plan.max).toBe(40);
    expect(plan.conflicts).toEqual([]);
  });

  test("reports a conflict when maxPerDay is too low to fit a bright real day", () => {
    const plan = solve({ a: 10, b: 0 }, { a: 1, b: 4 }, { maxPerDay: 20 });
    expect(plan.conflicts).toEqual([{ date: "a", target: 1, actual: 4 }]);
    expect(plan.planned.a).toBeUndefined();
  });

  test("a level 0 target on a day with real commits is a conflict", () => {
    const plan = solve({ a: 3, b: 0 }, { a: 0, b: 4 });
    expect(plan.conflicts).toEqual([{ date: "a", target: 0, actual: 4 }]);
    expect(plan.planned.a).toBeUndefined();
  });

  test("a lone light pixel is unreachable because it would be the darkest", () => {
    const plan = solve({ a: 0, b: 0 }, { a: 1 });
    expect(plan.conflicts).toEqual([{ date: "a", target: 1, actual: 0 }]);
    expect(plan.planned).toEqual({});
  });

  test("ignores targets outside the baseline range", () => {
    const plan = solve({ a: 0 }, { a: 4, z: 4 });
    expect(plan.planned).toEqual({ a: 1 });
    expect(plan.conflicts).toEqual([]);
  });

  test("rejects an invalid maxPerDay", () => {
    expect(() => solve({ a: 0 }, {}, { maxPerDay: 0 })).toThrow(RangeError);
  });
});
