import { describe, expect, it } from "vitest";

import type { VideoRedaction } from "@/lib/video-redactions";

import {
  packRedactionRows,
  redactionLaneHeight,
  redactionLaneViewportHeight,
  VISIBLE_REDACTION_ROWS,
} from "./redaction-lane";

const at = (id: string, startMs: number, endMs: number): VideoRedaction => ({
  id,
  kind: "redact",
  style: "solid",
  startMs,
  endMs,
  keys: [{ atMs: startMs, x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
});

describe("laying redactions out in the lane", () => {
  it("keeps everything on one row when nothing overlaps", () => {
    const { rows, rowOf } = packRedactionRows([
      at("a", 0, 1_000),
      at("b", 2_000, 3_000),
    ]);
    expect(rows).toBe(1);
    expect([rowOf.get("a"), rowOf.get("b")]).toEqual([0, 0]);
  });

  it("gives an overlapping one its own row, so both can be clicked", () => {
    const { rows, rowOf } = packRedactionRows([
      at("a", 0, 5_000),
      at("b", 1_000, 6_000),
    ]);
    expect(rows).toBe(2);
    expect(rowOf.get("a")).not.toBe(rowOf.get("b"));
  });

  it("reuses a row once the one before it has finished", () => {
    const { rows } = packRedactionRows([
      at("a", 0, 5_000),
      at("b", 1_000, 2_000),
      at("c", 6_000, 7_000),
    ]);
    expect(rows).toBe(2);
  });

  it("gives every overlapping redaction its own row, however many there are", () => {
    const many = Array.from({ length: 9 }, (_, i) => at(`r${i}`, 0, 5_000));
    const { rows, rowOf } = packRedactionRows(many);
    expect(rows).toBe(9);
    expect(new Set(rowOf.values()).size).toBe(9);
  });

  it("stops growing on screen after a few rows, and scrolls instead", () => {
    expect(redactionLaneViewportHeight(9)).toBe(
      redactionLaneHeight(VISIBLE_REDACTION_ROWS),
    );
    expect(redactionLaneViewportHeight(2)).toBe(redactionLaneHeight(2));
  });

  it("grows the lane with the rows it needs", () => {
    expect(redactionLaneHeight(2)).toBeGreaterThan(redactionLaneHeight(1));
  });
});
