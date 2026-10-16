import { describe, expect, test } from "vitest";
import { simulate } from "./simulate.js";

describe("simulate", () => {
  test("an empty graph stays empty", () => {
    const result = simulate({ "2026-01-01": 0, "2026-01-02": 0 }, {});
    expect(result.max).toBe(0);
    expect(result.levels).toEqual({ "2026-01-01": 0, "2026-01-02": 0 });
  });

  test("adds planned commits to the baseline", () => {
    const result = simulate({ "2026-01-01": 2, "2026-01-02": 0 }, { "2026-01-01": 3, "2026-01-02": 8 });
    expect(result.totals).toEqual({ "2026-01-01": 5, "2026-01-02": 8 });
    expect(result.max).toBe(8);
  });

  test("assigns levels relative to the busiest day", () => {
    const baseline = { a: 0, b: 0, c: 0, d: 0, e: 0 };
    const planned = { b: 2, c: 4, d: 6, e: 8 };
    expect(simulate(baseline, planned).levels).toEqual({ a: 0, b: 1, c: 2, d: 3, e: 4 });
  });

  test("a heavy art day can lower the shade of a real day", () => {
    // Real day has 4 commits: level 4 alone, level 1 once art raises max to 16.
    const baseline = { real: 4, blank: 0 };
    expect(simulate(baseline, {}).levels.real).toBe(4);
    expect(simulate(baseline, { blank: 16 }).levels.real).toBe(1);
  });

  test("ignores planned commits outside the baseline range", () => {
    const result = simulate({ "2026-01-01": 1 }, { "2025-12-31": 50 });
    expect(result.totals).toEqual({ "2026-01-01": 1 });
    expect(result.max).toBe(1);
  });

  test("does not mutate its inputs", () => {
    const baseline = { a: 1 };
    const planned = { a: 2 };
    simulate(baseline, planned);
    expect(baseline).toEqual({ a: 1 });
    expect(planned).toEqual({ a: 2 });
  });
});
