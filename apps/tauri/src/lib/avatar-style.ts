// How Kimily looks (Settings › Appearance › Avatar): the classic orb, or the cat drawn by Open Bot Avatar
// (github.com/DominikScholz/open-bot-avatar, MIT) as a soft 3D figure whose eyes follow the pointer. Stored per computer,
// like the island theme, and sent to the island with `notifyIslandPrefs`.
import type { AvatarDefinition } from "open-bot-avatar";

export type AvatarStyle = "cat" | "orb";
export const AVATAR_STYLES: AvatarStyle[] = ["cat", "orb"];
export const AVATAR_STYLE_KEY = "island.avatarStyle";

/// The cat's finish where it is drawn large enough to show it; small ones (the island, the sidebar) stay smooth.
export type AvatarFinish = "flat" | "fluffy" | "glass";
export const AVATAR_FINISHES: AvatarFinish[] = ["flat", "fluffy", "glass"];
export const AVATAR_FINISH_KEY = "island.avatarFinish";
/// Below this size fur and glass cost more than they show.
export const FINISH_MIN_SIZE = 40;

/// The cat from Open Bot Avatar's gallery (gallery/cat.json, MIT).
export const CAT: AvatarDefinition = {
  "version": 1,
  "id": "cat",
  "name": "Cat",
  "body": {
    "path": "M50 23C68 23 82 30 82 45C82 58 68 65 50 65C32 65 18 58 18 45C18 30 32 23 50 23ZM24 42C21 32 20 22 22 15C23 11 26 10 29 12C34 16 39 21 44 28L36 42ZM64 42L56 28C61 21 66 16 71 12C74 10 77 11 78 15C80 22 79 32 76 42ZM38 56L62 56C70 56 74 66 74 76C74 83 70 86 63 86L37 86C30 86 26 83 26 76C26 66 30 56 38 56ZM70 72C77 74 81 70 80 64C79 60 81 57 84 58C87 59 88.5 63 88 68C87 77 80 83 70 81Z"
  },
  "eyes": {
    "x": 50,
    "y": 43,
    "spacing": 17,
    "scale": 1.1
  }
};

export function isAvatarStyle(value: unknown): value is AvatarStyle {
  return typeof value === "string" && (AVATAR_STYLES as string[]).includes(value);
}

export function isAvatarFinish(value: unknown): value is AvatarFinish {
  return typeof value === "string" && (AVATAR_FINISHES as string[]).includes(value);
}

export function readAvatarStyle(): AvatarStyle {
  try {
    const stored = localStorage.getItem(AVATAR_STYLE_KEY);
    return isAvatarStyle(stored) ? stored : "cat";
  } catch {
    return "cat";
  }
}

export function readAvatarFinish(): AvatarFinish {
  try {
    const stored = localStorage.getItem(AVATAR_FINISH_KEY);
    return isAvatarFinish(stored) ? stored : "flat";
  } catch {
    return "flat";
  }
}

export function saveAvatarStyle(style: AvatarStyle) {
  try {
    localStorage.setItem(AVATAR_STYLE_KEY, style);
  } catch {}
}

export function saveAvatarFinish(finish: AvatarFinish) {
  try {
    localStorage.setItem(AVATAR_FINISH_KEY, finish);
  } catch {}
}

export type CatState = "idle" | "thinking" | "working" | "waiting" | "blocked" | "done";

/// What the cat does for one of the orb's moods: `waiting` (a session needs you) and `error` show the jumping "!",
/// a drowsy Kimily sighs with sleepy eyes, the rest map one to one.
export function catState(mood: string, drowsy = false): CatState {
  switch (mood) {
    case "working":
      return "working";
    case "waiting":
    case "error":
      return "blocked";
    case "done":
      return "done";
    case "listen":
      return "thinking";
    default:
      return drowsy ? "waiting" : "idle";
  }
}

export function finishFor(finish: AvatarFinish, size: number): AvatarFinish {
  return size >= FINISH_MIN_SIZE ? finish : "flat";
}
