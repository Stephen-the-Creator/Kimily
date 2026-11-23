import { describe, expect, it } from "vitest";
import { ROUNDS_PER_SET, breakMinutes, clampPlan } from "./timer.svelte";

describe("pomodoro plan", () => {
  it("makes every fourth break the long one", () => {
    const plan = clampPlan({ on: true, work: 25, rest: 5, longRest: 15 });
    expect([1, 2, 3, 4, 5].map((r) => breakMinutes(plan, r))).toEqual([5, 5, 5, 15, 5]);
    expect(ROUNDS_PER_SET).toBe(4);
  });

  it("keeps lengths in range and falls back on nonsense", () => {
    expect(clampPlan({ work: 0, rest: 999, longRest: Number.NaN })).toEqual({ on: false, work: 1, rest: 60, longRest: 15 });
    expect(clampPlan({})).toEqual({ on: false, work: 25, rest: 5, longRest: 15 });
  });
});
