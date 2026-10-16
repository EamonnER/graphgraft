import { describe, expect, test } from "vitest";
import type { Level } from "../model/levels.js";
import { renderGraph } from "./render.js";

// 14 days from Sunday 2026-03-01, levels cycling 0,1,2,3,4,0,1,2,3,4,0,1,2,3.
const levels: Record<string, Level> = {};
for (let i = 0; i < 14; i++) {
  levels[`2026-03-${String(i + 1).padStart(2, "0")}`] = (i % 5) as Level;
}

describe("renderGraph", () => {
  test("draws weeks as columns and weekdays as rows", () => {
    expect(renderGraph(levels, "2026-03-01", "2026-03-14")).toBe(
      [".2", "13", "24", "3.", "41", ".2", "13"].join("\n"),
    );
  });

  test("leaves days outside the range blank", () => {
    // Wed 2026-03-04 to Tue 2026-03-10
    expect(renderGraph(levels, "2026-03-04", "2026-03-10")).toBe(
      [" 2", " 3", " 4", "3", "4", ".", "1"].join("\n"),
    );
  });

  test("leaves days missing from levels blank", () => {
    expect(renderGraph({ "2026-03-01": 4 }, "2026-03-01", "2026-03-07")).toBe(["4", "", "", "", "", "", ""].join("\n"));
  });

  test("a single day still renders 7 rows", () => {
    const out = renderGraph({ "2026-03-04": 2 }, "2026-03-04", "2026-03-04");
    expect(out.split("\n")).toEqual(["", "", "", "2", "", "", ""]);
  });

  test("rejects bad dates and reversed ranges", () => {
    expect(() => renderGraph({}, "2026-03-10", "2026-03-01")).toThrow(RangeError);
    expect(() => renderGraph({}, "nope", "2026-03-01")).toThrow(RangeError);
  });
});
