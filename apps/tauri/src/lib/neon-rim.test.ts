import { beforeEach, describe, expect, it } from "vitest";
import { NEON_RIM_KEY, isNeonRim, readNeonRim, saveNeonRim } from "./neon-rim";

// The tests run in Node, which has no localStorage: a small in-memory one stands in.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;

describe("neon rim", () => {
  beforeEach(() => localStorage.clear());

  it("starts classic and remembers a pick", () => {
    expect(readNeonRim()).toBe("classic");
    saveNeonRim("aurora");
    expect(readNeonRim()).toBe("aurora");
  });

  it("ignores an unknown stored value", () => {
    localStorage.setItem(NEON_RIM_KEY, "rainbow");
    expect(readNeonRim()).toBe("classic");
    expect(isNeonRim("sunset")).toBe(true);
    expect(isNeonRim(42)).toBe(false);
  });
});
