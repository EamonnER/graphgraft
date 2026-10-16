import { describe, expect, test } from "vitest";
import { baselineCounts } from "./baseline.js";

describe("baselineCounts", () => {
  test("with no art commits the baseline equals the calendar", () => {
    const calendar = { "2026-01-01": 3, "2026-01-02": 0 };
    expect(baselineCounts(calendar, {})).toEqual(calendar);
  });

  test("subtracts art commits per day", () => {
    const calendar = { "2026-01-01": 12, "2026-01-02": 10, "2026-01-03": 4 };
    const art = { "2026-01-01": 10, "2026-01-02": 10 };
    expect(baselineCounts(calendar, art)).toEqual({
      "2026-01-01": 2,
      "2026-01-02": 0,
      "2026-01-03": 4,
    });
  });

  test("ignores art commits outside the calendar range", () => {
    const calendar = { "2026-01-01": 5 };
    const art = { "2025-12-31": 20 };
    expect(baselineCounts(calendar, art)).toEqual({ "2026-01-01": 5 });
  });

  test("does not mutate its inputs", () => {
    const calendar = { "2026-01-01": 5 };
    const art = { "2026-01-01": 2 };
    baselineCounts(calendar, art);
    expect(calendar).toEqual({ "2026-01-01": 5 });
    expect(art).toEqual({ "2026-01-01": 2 });
  });

  test("throws when a day has more art commits than the calendar counts", () => {
    expect(() =>
      baselineCounts({ "2026-01-01": 3 }, { "2026-01-01": 10 }),
    ).toThrow(RangeError);
  });
});
