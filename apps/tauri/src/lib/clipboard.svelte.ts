// Background clipboard history for the Dynamic Island (stores the last 20 unique copied texts locally).
// Passwords, keys and card numbers are never stored (`looksSecret`), and the history can be paused.
import { invoke } from "@tauri-apps/api/core";
import { looksSecret } from "./secret-text";

export interface ClipboardItem {
  id: string;
  text: string;
  at: number;
}

const STORAGE_KEY = "island.clipboard";
const PAUSED_KEY = "island.clipboard.paused";
const MAX_ITEMS = 20;
const MAX_CHARS = 4000;

class ClipboardHistory {
  items = $state<ClipboardItem[]>(this.load());
  paused = $state(this.loadPaused());
  /** How many copied secrets were left out since the app started. */
  skipped = $state(0);
  private lastSeen = "";
  private timer: ReturnType<typeof setInterval> | undefined;
  private refs = 0;

  private load(): ClipboardItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Also drops secrets an older version had already stored.
      return Array.isArray(parsed) ? parsed.filter((i) => typeof i?.text === "string" && !looksSecret(i.text)).slice(0, MAX_ITEMS) : [];
    } catch {
      return [];
    }
  }

  private loadPaused(): boolean {
    try {
      return localStorage.getItem(PAUSED_KEY) === "1";
    } catch {
      return false;
    }
  }

  setPaused(next: boolean) {
    this.paused = next;
    try {
      localStorage.setItem(PAUSED_KEY, next ? "1" : "0");
    } catch {}
    // Whatever is on the clipboard while paused stays out, also after resuming.
    if (!next) void this.peekWithoutRecording();
  }

  private async peekWithoutRecording() {
    try {
      const text = await invoke<string | null>("clipboard_read");
      if (text) this.lastSeen = text.trim();
    } catch {}
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    } catch {}
  }

  record(raw: string | null | undefined) {
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed || trimmed === this.lastSeen) return;
    this.lastSeen = trimmed;
    if (looksSecret(trimmed)) {
      this.skipped++;
      return;
    }
    const text = trimmed.length > MAX_CHARS ? trimmed.slice(0, MAX_CHARS) : trimmed;
    const existing = this.items.find((i) => i.text === text);
    const next: ClipboardItem = { id: existing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, at: Date.now() };
    this.items = [next, ...this.items.filter((i) => i.text !== text)].slice(0, MAX_ITEMS);
    this.save();
  }

  async poll() {
    if (this.paused) return;
    try {
      const text = await invoke<string | null>("clipboard_read");
      if (text) this.record(text);
    } catch {
      // Fallback when running against a binary built before `clipboard_read` existed.
      if (document.hasFocus() && navigator.clipboard?.readText) {
        navigator.clipboard.readText().then((t) => this.record(t)).catch(() => {});
      }
    }
  }

  start(): () => void {
    this.refs++;
    if (this.refs === 1) {
      if (this.items.length) this.lastSeen = this.items[0].text;
      void this.poll();
      this.timer = setInterval(() => void this.poll(), 2500);
    }
    return () => {
      this.refs = Math.max(0, this.refs - 1);
      if (this.refs === 0 && this.timer !== undefined) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    };
  }

  async copy(text: string) {
    this.lastSeen = text.trim();
    await navigator.clipboard.writeText(text);
  }

  remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
    this.save();
  }

  clear() {
    this.items = [];
    this.save();
  }
}

export const clipboardHistory = new ClipboardHistory();
