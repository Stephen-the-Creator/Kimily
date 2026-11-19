// Focus / Pomodoro timer state shared between the Focus tab and the collapsed Dynamic Island pill.
// Runs a 1-second interval only while actively counting down, so at rest it costs 0 CPU.
import { play } from "./sounds";
import { nook } from "./state.svelte";

class FocusTimer {
  totalSeconds = $state(25 * 60);
  remainingSeconds = $state(25 * 60);
  running = $state(false);
  finished = $state(false);
  label = $state("");
  private interval: ReturnType<typeof setInterval> | undefined;
  private endAt = 0;

  get active(): boolean {
    return this.running || (this.remainingSeconds > 0 && this.remainingSeconds < this.totalSeconds) || this.finished;
  }

  get progress(): number {
    if (this.totalSeconds <= 0) return 0;
    return Math.min(100, Math.max(0, ((this.totalSeconds - this.remainingSeconds) / this.totalSeconds) * 100));
  }

  get formatted(): string {
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  setMinutes(minutes: number, label?: string) {
    this.setDuration(minutes, 0, label);
  }

  setDuration(minutes: number, seconds: number, label?: string) {
    this.stopInterval();
    const total = Math.max(1, Math.min(24 * 60 * 60, Math.round(minutes) * 60 + Math.round(seconds)));
    this.totalSeconds = total;
    this.remainingSeconds = total;
    this.running = false;
    this.finished = false;
    if (label !== undefined) this.label = label;
  }

  adjustMinutes(delta: number) {
    const next = Math.max(1, Math.min(180, Math.round(this.remainingSeconds / 60) + delta));
    this.totalSeconds = Math.max(this.totalSeconds, next * 60);
    this.remainingSeconds = next * 60;
    if (this.running) {
      this.endAt = Date.now() + this.remainingSeconds * 1000;
    }
    this.finished = false;
  }

  start() {
    if (this.running) return;
    if (this.remainingSeconds <= 0) {
      this.remainingSeconds = this.totalSeconds;
    }
    this.finished = false;
    this.running = true;
    this.endAt = Date.now() + this.remainingSeconds * 1000;
    this.stopInterval();
    this.interval = setInterval(() => {
      const left = Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
      this.remainingSeconds = left;
      if (left <= 0) {
        this.running = false;
        this.finished = true;
        this.stopInterval();
        play("done", nook.settings?.sounds ?? true);
      }
    }, 500);
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    this.stopInterval();
  }

  toggle() {
    if (this.running) this.pause();
    else this.start();
  }

  reset() {
    this.stopInterval();
    this.running = false;
    this.finished = false;
    this.remainingSeconds = this.totalSeconds;
  }

  private stopInterval() {
    if (this.interval !== undefined) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }
}

export const focusTimer = new FocusTimer();
