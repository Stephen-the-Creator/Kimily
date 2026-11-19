// User-toggleable tabs in the Dynamic Island header (synced between Settings and Bar via localStorage + Tauri events).
import { emit } from "@tauri-apps/api/event";

export type HideableTab = "home" | "tasks" | "focus" | "notes" | "tray" | "chats" | "agents" | "workspace" | "commands";

export const HIDEABLE_TABS: HideableTab[] = ["home", "tasks", "focus", "notes", "tray", "chats", "agents", "workspace", "commands"];
export const HIDDEN_TABS_KEY = "island.hiddenTabs";
export const ISLAND_PREFS_EVENT = "island-prefs-changed";

export function notifyIslandPrefs() {
  void emit(ISLAND_PREFS_EVENT).catch(() => {});
}

export function readHiddenTabs(): HideableTab[] {
  try {
    const raw = localStorage.getItem(HIDDEN_TABS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is HideableTab => typeof t === "string" && (HIDEABLE_TABS as string[]).includes(t));
  } catch {
    return [];
  }
}

export function writeHiddenTabs(tabs: HideableTab[]) {
  try {
    localStorage.setItem(HIDDEN_TABS_KEY, JSON.stringify(tabs));
  } catch {}
  notifyIslandPrefs();
}

export function setTabVisible(tab: HideableTab, visible: boolean): HideableTab[] {
  const current = readHiddenTabs().filter((t) => t !== tab);
  const next = visible ? current : [...current, tab];
  writeHiddenTabs(next);
  return next;
}
