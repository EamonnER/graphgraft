import { describe, expect, test } from "vitest";
import { levelOf, minCountForLevel, type Level } from "./levels.js";

describe("levelOf", () => {
  test("zero contributions is level 0", () => {
    expect(levelOf(0, 10)).toBe(0);
    expect(levelOf(0, 0)).toBe(0);
  });

  test("the busiest day is level 4", () => {
    expect(levelOf(10, 10)).toBe(4);
    expect(levelOf(1, 1)).toBe(4);
  });

  test("splits the range into quarters of max", () => {
    // max = 8 -> quarters end at 2, 4, 6, 8
    const levels = [1, 2, 3, 4, 5, 6, 7, 8].map((c) => levelOf(c, 8));
    expect(levels).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  test("any non-zero count is at least level 1", () => {
    expect(levelOf(1, 1000)).toBe(1);
  });

  test("rejects invalid input", () => {
    expect(() => levelOf(-1, 10)).toThrow(RangeError);
    expect(() => levelOf(1.5, 10)).toThrow(RangeError);
    expect(() => levelOf(11, 10)).toThrow(RangeError);
    expect(() => levelOf(1, -1)).toThrow(RangeError);
  });
});

describe("minCountForLevel", () => {
  test("level 0 needs no contributions", () => {
    expect(minCountForLevel(0, 10)).toBe(0);
  });

  test("matches the quarter boundaries for max = 8", () => {
    const mins = ([1, 2, 3, 4] as const).map((l) => minCountForLevel(l, 8));
    expect(mins).toEqual([1, 3, 5, 7]);
  });

  test("is the exact inverse of levelOf when every level is reachable", () => {
    for (let max = 4; max <= 60; max++) {
      for (const level of [1, 2, 3, 4] as Level[]) {
        const min = minCountForLevel(level, max);
        expect(levelOf(min, max)).toBe(level);
        // one fewer contribution must fall into a lower level
        expect(levelOf(min - 1, max)).toBeLessThan(level);
      }
    }
  });

  test("rejects invalid max", () => {
    expect(() => minCountForLevel(1, -1)).toThrow(RangeError);
  });
});
