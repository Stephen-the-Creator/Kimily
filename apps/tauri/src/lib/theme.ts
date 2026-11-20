// Settings › Appearance on the page: System, Light, Dark or Neon (`appearanceMode` on the Mac), the density, and the accent.
// The light palette itself lives in app.css under `:root[data-theme="light"]`; this file only decides which applies.
import type { Settings } from "./types";

export type ThemeSetting = Settings["theme"];
export type Density = Settings["density"];

export const THEMES: ThemeSetting[] = ["system", "light", "dark", "neon"];

/// What a window is drawn in: Neon is a dark look with glowing cyan and violet accents (`:root[data-theme="neon"]`).
export type Look = "light" | "dark" | "neon";
export const DENSITIES: Density[] = ["compact", "comfortable", "spacious"];

/// The accent swatches (the first is Nook's own soft white, which turns near-black in light).
export const ACCENTS = [0xf4f3f7, 0x8b7bff, 0x46e0a6, 0xffb84d, 0xff8a5b, 0x5ab8ff, 0xff6bb5];

/// Nook's accent in light (`NookPalette.nookLight.accent`).
export const LIGHT_ACCENT = 0x1e1e22;

/// Neon's own accent: the soft white default turns into this cyan there, so the glow has a color.
export const NEON_ACCENT = 0x22e4ff;

/// The look that applies: System follows the operating system, anything unknown stays dark (as old settings do).
export function resolveTheme(setting: string | undefined, systemDark: boolean): Look {
  if (setting === "light") return "light";
  if (setting === "neon") return "neon";
  if (setting === "system") return systemDark ? "dark" : "light";
  return "dark";
}

function luminance(hex: number): number {
  const ch = (v: number) => {
    const c = (v & 0xff) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(hex >> 16) + 0.7152 * ch(hex >> 8) + 0.0722 * ch(hex);
}

/// The accent drawn on a canvas: a near-white accent would vanish on the light canvas, so there it becomes Nook's
/// light accent; in Neon it becomes Neon's cyan; every colored accent stays as chosen.
export function themeAccent(hex: number, look: Look): number {
  if (luminance(hex) <= 0.7) return hex;
  if (look === "light") return LIGHT_ACCENT;
  if (look === "neon") return NEON_ACCENT;
  return hex;
}

export function isDensity(v: unknown): v is Density {
  return typeof v === "string" && (DENSITIES as string[]).includes(v);
}
