// Focus / Pomodoro timer state shared between the Focus tab and the collapsed Dynamic Island pill.
// Runs a 1-second interval only while actively counting down, so at rest it costs 0 CPU.
//
// Pomodoro (Focus tab › Breaks between rounds): a focus round runs, then a break starts by itself, every fourth one
// long; after a break the next round waits for you. The lengths are kept per computer.
import { play } from "./sounds";
import { nook } from "./state.svelte";

export type FocusPhase = "focus" | "break";
export interface PomodoroPlan {
  on: boolean;
  work: number;
  rest: number;
  longRest: number;
}
/// Rounds per set: after this many focus rounds the break is the long one.
export const ROUNDS_PER_SET = 4;
const PLAN_KEY = "focus.pomodoro";
const DEFAULT_PLAN: PomodoroPlan = { on: false, work: 25, rest: 5, longRest: 15 };

/// The break after `round` finished focus rounds (1-based): every ROUNDS_PER_SET-th is the long one.
export function breakMinutes(plan: PomodoroPlan, round: number): number {
  return round > 0 && round % ROUNDS_PER_SET === 0 ? plan.longRest : plan.rest;
}

export function clampPlan(plan: Partial<PomodoroPlan>): PomodoroPlan {
  const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  return {
    on: plan.on === true,
    work: n(plan.work, 1, 180, DEFAULT_PLAN.work),
    rest: n(plan.rest, 1, 60, DEFAULT_PLAN.rest),
    longRest: n(plan.longRest, 1, 90, DEFAULT_PLAN.longRest),
  };
}

function readPlan(): PomodoroPlan {
  try {
    return clampPlan(JSON.parse(localStorage.getItem(PLAN_KEY) ?? "{}"));
  } catch {
    return { ...DEFAULT_PLAN };
  }
}

class FocusTimer {
  totalSeconds = $state(25 * 60);
  remainingSeconds = $state(25 * 60);
  running = $state(false);
  finished = $state(false);
  label = $state("");
  plan = $state<PomodoroPlan>(readPlan());
  phase = $state<FocusPhase>("focus");
  /** Focus rounds finished in this set (resets with Reset or when Pomodoro is switched off). */
  round = $state(0);
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
        this.stopInterval();
        play("done", nook.settings?.sounds ?? true);
        if (this.plan.on) this.nextPhase();
        else {
          this.running = false;
          this.finished = true;
        }
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
    if (this.plan.on) {
      this.phase = "focus";
      this.round = 0;
      this.totalSeconds = this.plan.work * 60;
    }
    this.remainingSeconds = this.totalSeconds;
  }

  /** Pomodoro: a focus round ends in a break that starts by itself; a break ends in the next round, ready to start. */
  private nextPhase() {
    if (this.phase === "focus") {
      this.round += 1;
      this.phase = "break";
      this.setDuration(breakMinutes(this.plan, this.round), 0);
      this.start();
    } else {
      if (this.round >= ROUNDS_PER_SET) this.round = 0;
      this.phase = "focus";
      this.setDuration(this.plan.work, 0);
    }
  }

  /** Changes the Pomodoro plan and keeps it; a round that is not running takes the new length at once. */
  setPlan(next: Partial<PomodoroPlan>) {
    const plan = clampPlan({ ...this.plan, ...next });
    const switched = plan.on !== this.plan.on;
    this.plan = plan;
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
    } catch {}
    if (switched) {
      this.phase = "focus";
      this.round = 0;
    }
    if (!this.running && (plan.on || switched)) {
      const minutes = this.phase === "break" ? breakMinutes(plan, this.round) : plan.work;
      if (plan.on) this.setDuration(minutes, 0);
    }
  }

  private stopInterval() {
    if (this.interval !== undefined) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }
}

export const focusTimer = new FocusTimer();
