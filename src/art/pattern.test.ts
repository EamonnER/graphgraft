import { describe, expect, test } from "vitest";
import { parsePattern, patternToTargets } from "./pattern.js";

const rows = (...r: string[]) => r.join("\n");

describe("parsePattern", () => {
  test("parses digits as levels and dots as don't-care", () => {
    const pattern = parsePattern(rows("01", "2.", "34", "..", "..", "..", "1."));
    expect(pattern[0]).toEqual([0, 1]);
    expect(pattern[1]).toEqual([2, null]);
    expect(pattern[2]).toEqual([3, 4]);
    expect(pattern[3]).toEqual([null, null]);
    expect(pattern[6]).toEqual([1, null]);
  });

  test("ignores blank lines, trailing whitespace and CRLF endings", () => {
    const text = "\n01  \r\n2.\r\n34\r\n..\r\n..\r\n..\r\n1.\r\n\r\n";
    expect(parsePattern(text)).toHaveLength(7);
  });

  test("requires exactly 7 rows", () => {
    expect(() => parsePattern(rows("0", "0", "0"))).toThrow("exactly 7 rows, got 3");
    expect(() => parsePattern("")).toThrow(RangeError);
  });

  test("requires rows of equal length", () => {
    expect(() => parsePattern(rows("00", "00", "00", "0", "00", "00", "00"))).toThrow("row 4 has 1 columns, expected 2");
  });

  test("rejects invalid characters with their position", () => {
    expect(() => parsePattern(rows("00", "00", "0x", "00", "00", "00", "00"))).toThrow("row 3, column 2");
    expect(() => parsePattern(rows("5", "0", "0", "0", "0", "0", "0"))).toThrow(RangeError);
  });
});

describe("patternToTargets", () => {
  // 2026-03-01 is a Sunday.
  const pattern = parsePattern(rows("4.", "..", ".3", "..", "..", "..", "0."));

  test("places cells by week (column) and weekday (row), skipping don't-care", () => {
    expect(patternToTargets(pattern, "2026-03-01")).toEqual({
      "2026-03-01": 4, // column 0, Sunday
      "2026-03-10": 3, // column 1 (+7 days), row 2 (+2 days)
      "2026-03-07": 0, // column 0, Saturday
    });
  });

  test("requires start to be a Sunday", () => {
    expect(() => patternToTargets(pattern, "2026-03-02")).toThrow("must be a Sunday");
  });

  test("requires a real date", () => {
    expect(() => patternToTargets(pattern, "2026-02-30")).toThrow(RangeError);
    expect(() => patternToTargets(pattern, "03/01/2026")).toThrow(RangeError);
  });

  test("crosses month and year boundaries", () => {
    // 2025-12-28 is a Sunday; column 1 row 6 is +13 days.
    const wide = parsePattern(rows("..", "..", "..", "..", "..", "..", ".2"));
    expect(patternToTargets(wide, "2025-12-28")).toEqual({ "2026-01-10": 2 });
  });
});
