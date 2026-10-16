import { describe, expect, test } from "vitest";
import { parsePattern, patternToTargets, tilePattern } from "./pattern.js";

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

  test("ignores a leading byte-order mark", () => {
    const text = rows("01", "2.", "34", "..", "..", "..", "1.");
    expect(parsePattern("﻿" + text)).toEqual(parsePattern(text));
    // only a leading one: a BOM elsewhere is still an invalid character
    expect(() => parsePattern(text.replace("34", "﻿4"))).toThrow("invalid character");
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

describe("tilePattern", () => {
  // Two columns wide. 2026-03-01 is a Sunday.
  // week 0 (Mar 1-7):   column 0 -> Sun = 4, Sat = 1
  // week 1 (Mar 8-14):  column 1 -> Sun = 2
  const tile = parsePattern(rows("42", "..", "..", "..", "..", "..", "1."));

  test("repeats the tile every `width` weeks, forward from start", () => {
    expect(tilePattern(tile, { start: "2026-03-01", from: "2026-03-01", to: "2026-03-28" })).toEqual({
      "2026-03-01": 4,
      "2026-03-07": 1,
      "2026-03-08": 2,
      "2026-03-15": 4,
      "2026-03-21": 1,
      "2026-03-22": 2,
    });
  });

  test("gap weeks between tiles are left alone", () => {
    // period is 3 weeks: column 0, column 1, one gap week
    expect(tilePattern(tile, { start: "2026-03-01", from: "2026-03-01", to: "2026-03-28", gap: 1 })).toEqual({
      "2026-03-01": 4,
      "2026-03-07": 1,
      "2026-03-08": 2,
      "2026-03-22": 4,
      "2026-03-28": 1,
    });
  });

  test("clips tiles to the start of the range", () => {
    // Mar 10 is a Tuesday, so the Mar 8 cell is outside the range.
    expect(tilePattern(tile, { start: "2026-03-01", from: "2026-03-10", to: "2026-03-28" })).toEqual({
      "2026-03-15": 4,
      "2026-03-21": 1,
      "2026-03-22": 2,
    });
  });

  test("clips tiles to the end of the range", () => {
    expect(tilePattern(tile, { start: "2026-03-01", from: "2026-03-01", to: "2026-03-16" })).toEqual({
      "2026-03-01": 4,
      "2026-03-07": 1,
      "2026-03-08": 2,
      "2026-03-15": 4,
    });
  });

  test("leaves days before start alone", () => {
    expect(tilePattern(tile, { start: "2026-03-15", from: "2026-03-01", to: "2026-03-28" })).toEqual({
      "2026-03-15": 4,
      "2026-03-21": 1,
      "2026-03-22": 2,
    });
  });

  test("keeps the phase when start is well before the range", () => {
    // Apr 5 is 5 weeks after start: column 1, then column 0 on Apr 12.
    expect(tilePattern(tile, { start: "2026-03-01", from: "2026-04-05", to: "2026-04-18" })).toEqual({
      "2026-04-05": 2,
      "2026-04-12": 4,
      "2026-04-18": 1,
    });
  });

  test("a range that ends before start gives nothing", () => {
    expect(tilePattern(tile, { start: "2026-04-05", from: "2026-03-01", to: "2026-03-28" })).toEqual({});
  });

  test("over exactly one tile it matches patternToTargets", () => {
    expect(tilePattern(tile, { start: "2026-03-01", from: "2026-03-01", to: "2026-03-14" })).toEqual(
      patternToTargets(tile, "2026-03-01"),
    );
  });

  test("rejects invalid options", () => {
    const ok = { start: "2026-03-01", from: "2026-03-01", to: "2026-03-28" };
    expect(() => tilePattern(tile, { ...ok, start: "2026-03-02" })).toThrow("must be a Sunday");
    expect(() => tilePattern(tile, { ...ok, to: "2026-02-28" })).toThrow(RangeError);
    expect(() => tilePattern(tile, { ...ok, gap: -1 })).toThrow("gap");
    expect(() => tilePattern(tile, { ...ok, gap: 1.5 })).toThrow("gap");
    expect(() => tilePattern(tile, { ...ok, from: "nope" })).toThrow(RangeError);
  });
});
