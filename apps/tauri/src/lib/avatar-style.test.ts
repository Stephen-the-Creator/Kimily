import { beforeEach, describe, expect, it } from "vitest";
import { validateAvatar } from "open-bot-avatar";
import { CAT, catState, finishFor, readAvatarFinish, readAvatarStyle, saveAvatarFinish, saveAvatarStyle } from "./avatar-style";

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

describe("avatar style", () => {
  beforeEach(() => localStorage.clear());

  it("is the cat, smooth, until the user picks otherwise", () => {
    expect(readAvatarStyle()).toBe("cat");
    expect(readAvatarFinish()).toBe("flat");
    saveAvatarStyle("orb");
    saveAvatarFinish("fluffy");
    expect(readAvatarStyle()).toBe("orb");
    expect(readAvatarFinish()).toBe("fluffy");
  });

  it("ignores stored values it does not know", () => {
    localStorage.setItem("island.avatarStyle", "dog");
    localStorage.setItem("island.avatarFinish", "velvet");
    expect(readAvatarStyle()).toBe("cat");
    expect(readAvatarFinish()).toBe("flat");
  });

  it("ships a valid cat", () => {
    expect(validateAvatar(CAT).ok).toBe(true);
  });

  it("maps the orb's moods onto the cat's states", () => {
    expect(catState("idle")).toBe("idle");
    expect(catState("idle", true)).toBe("waiting");
    expect(catState("working")).toBe("working");
    expect(catState("waiting")).toBe("blocked");
    expect(catState("error")).toBe("blocked");
    expect(catState("done")).toBe("done");
    expect(catState("listen")).toBe("thinking");
    expect(catState("seen")).toBe("idle");
  });

  it("keeps small cats smooth", () => {
    expect(finishFor("fluffy", 20)).toBe("flat");
    expect(finishFor("glass", 44)).toBe("glass");
  });
});
