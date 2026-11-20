// The colors of the light that runs around the island in the Neon island theme (Settings › Appearance › Rim colors).
// Each palette is a class in app.css (`.neon-rim-*`) that sets `--neon-a`, `--neon-b` and `--neon-c`; "classic" starts
// from Kimily's own color. Stored per computer, like the island theme, and sent to the bar with `notifyIslandPrefs`.

export type NeonRim = "classic" | "aurora" | "sunset" | "ocean" | "fire" | "candy" | "mono";
export const NEON_RIMS: NeonRim[] = ["classic", "aurora", "sunset", "ocean", "fire", "candy", "mono"];
export const NEON_RIM_KEY = "island.neonRim";

export function isNeonRim(value: unknown): value is NeonRim {
  return typeof value === "string" && (NEON_RIMS as string[]).includes(value);
}

export function readNeonRim(): NeonRim {
  try {
    const stored = localStorage.getItem(NEON_RIM_KEY);
    return isNeonRim(stored) ? stored : "classic";
  } catch {
    return "classic";
  }
}

export function saveNeonRim(rim: NeonRim) {
  try {
    localStorage.setItem(NEON_RIM_KEY, rim);
  } catch {}
}
