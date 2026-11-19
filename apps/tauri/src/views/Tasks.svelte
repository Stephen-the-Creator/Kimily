<script lang="ts">
  // Tasks (open loops) in the Dynamic Island: add one with an optional due date, check it off with one click.
  // Checking off is shown at once (the circle fills, the text strikes through, the row folds away); the store follows.
  import { flip } from "svelte/animate";
  import { fly, slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { api, events } from "../lib/api";
  import { nook, relativeTime } from "../lib/state.svelte";
  import { play } from "../lib/sounds";
  import { motion } from "../lib/motion";
  import { tr, locale } from "../lib/i18n.svelte";
  import Ico from "../components/ui/Ico.svelte";
  import type { OpenLoop } from "../lib/types";

  let { onchange }: { onchange?: (count: number) => void } = $props();

  let loops = $state<OpenLoop[]>([]);
  let title = $state("");
  let dueDate = $state("");
  let adding = $state(false);
  let loaded = $state(false);
  // Rows being checked off: drawn as done until the store has dropped them.
  let completing = $state<Set<string>>(new Set());

  async function load() {
    try {
      const next = await api.openLoops();
      loops = next.filter((l) => !completing.has(l.id));
      onchange?.(loops.length);
    } finally {
      loaded = true;
    }
  }

  $effect(() => {
    void load();
    const timer = setInterval(load, 30_000);
    const un = events.onNookUpdated(() => void load());
    return () => {
      clearInterval(timer);
      un.then((f) => f());
    };
  });

  const sorted = $derived(
    [...loops].sort((a, b) => {
      if (a.due && b.due) return new Date(a.due).getTime() - new Date(b.due).getTime();
      if (a.due) return -1;
      if (b.due) return 1;
      return new Date(b.created).getTime() - new Date(a.created).getTime();
    }),
  );
  const overdueCount = $derived(loops.filter((l) => isOverdue(l.due)).length);

  function isOverdue(due: string | null): boolean {
    return !!due && new Date(due).getTime() < Date.now();
  }

  function sameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function isToday(due: string | null): boolean {
    return !!due && sameDay(new Date(due), new Date());
  }

  function formatDue(due: string): string {
    const d = new Date(due);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (sameDay(d, now)) return tr("Vandaag", "Today");
    if (sameDay(d, tomorrow)) return tr("Morgen", "Tomorrow");
    return d.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" });
  }

  async function add() {
    const clean = title.trim();
    if (!clean || adding) return;
    adding = true;
    try {
      const dueIso = dueDate ? new Date(`${dueDate}T18:00:00`).toISOString() : null;
      await api.addLoop(clean, dueIso);
      title = "";
      dueDate = "";
      play("check", nook.settings?.sounds ?? true);
      await load();
    } finally {
      adding = false;
    }
  }

  async function done(id: string) {
    if (completing.has(id)) return;
    completing = new Set(completing).add(id);
    play("check", nook.settings?.sounds ?? true);
    // Let the check and the strike-through show before the row folds away.
    await new Promise((r) => setTimeout(r, motion(420)));
    loops = loops.filter((l) => l.id !== id);
    onchange?.(loops.length);
    try {
      await api.completeLoop(id);
    } finally {
      const next = new Set(completing);
      next.delete(id);
      completing = next;
      await load();
    }
  }
</script>

<section class="tasks">
  <form class="composer" onsubmit={(e) => { e.preventDefault(); void add(); }}>
    <span class="lead" aria-hidden="true"><Ico name="plus" size={14} /></span>
    <input class="title-input" placeholder={tr("Nieuwe taak…", "New task…")} bind:value={title} />
    <label class="date" class:set={!!dueDate} title={tr("Deadline (optioneel)", "Due date (optional)")}>
      <Ico name="calendar" size={13} />
      <input type="date" aria-label={tr("Deadline (optioneel)", "Due date (optional)")} bind:value={dueDate} />
    </label>
    <button type="submit" class="primary send" disabled={!title.trim() || adding} title={tr("Toevoegen", "Add")} aria-label={tr("Toevoegen", "Add")}>
      <Ico name="arrow-up" size={14} stroke={2.4} />
    </button>
  </form>

  {#if loops.length}
    <div class="summary" in:fly={{ y: -4, duration: motion(200) }}>
      <span>{tr("{n} open", "{n} open", { n: loops.length })}</span>
      {#if overdueCount}
        <span class="overdue-chip">{tr("{n} te laat", "{n} overdue", { n: overdueCount })}</span>
      {/if}
    </div>
  {/if}

  <div class="list">
    {#each sorted as loop, index (loop.id)}
      <div
        class="row"
        class:overdue={isOverdue(loop.due)}
        class:completing={completing.has(loop.id)}
        animate:flip={{ duration: motion(260), easing: cubicOut }}
        in:fly={{ y: 8, duration: motion(280), delay: motion(Math.min(index, 6) * 35), easing: cubicOut }}
        out:slide={{ duration: motion(200) }}
      >
        <button class="check" title={tr("Afvinken", "Check off")} aria-label={tr("Afvinken", "Check off")} onclick={() => done(loop.id)}>
          <span class="circle"><Ico name="check" size={11} stroke={3} /></span>
        </button>
        <span class="label">{loop.title}</span>
        {#if loop.due}
          <span class="due" class:overdue={isOverdue(loop.due)} class:today={isToday(loop.due) && !isOverdue(loop.due)}>
            <Ico name="clock" size={11} />
            {formatDue(loop.due)}
          </span>
        {:else}
          <span class="meta">{relativeTime(loop.created)}</span>
        {/if}
      </div>
    {:else}
      {#if loaded}
        <div class="empty" in:fly={{ y: 6, duration: motion(260) }}>
          <span class="empty-mark"><Ico name="list-checks" size={22} stroke={1.6} /></span>
          <p class="empty-title">{tr("Geen open taken.", "No open tasks.")}</p>
          <p class="empty-hint">{tr("Typ hierboven een taak, of zeg in de chat: “Maak een taak aan voor vrijdag”.", "Type a task above, or say in chat: “Add a task due Friday”.")}</p>
        </div>
      {/if}
    {/each}
  </div>
</section>

<style>
  .tasks {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: var(--space-8) var(--space-12) var(--space-12);
    box-sizing: border-box;
    gap: var(--space-8);
    min-height: 0;
  }
  /* One field like the chat's composer: plus, text, date, send. */
  .composer {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex: none;
    padding: var(--space-4) var(--space-4) var(--space-4) var(--space-8);
    border-radius: var(--radius-panel);
    border: 1px solid var(--line2);
    background: var(--field);
    transition: border-color var(--motion-hover), box-shadow var(--motion-hover);
  }
  .composer:focus-within {
    border-color: var(--text3);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--orb-base) 14%, transparent);
  }
  .lead { color: var(--text3); display: inline-flex; flex: none; }
  .title-input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    padding: var(--space-4) var(--space-2);
    font: var(--text-control);
    font-weight: 400;
    color: var(--paper);
  }
  .title-input:focus,
  .title-input:focus-visible { outline: none; border: 0; }
  .date {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    flex: none;
    height: 26px;
    padding: 0 var(--space-8);
    border-radius: 999px;
    color: var(--text3);
    cursor: pointer;
    transition: background var(--motion-quick), color var(--motion-quick);
  }
  .date:hover { background: var(--smoke); color: var(--paper); }
  .date.set { color: var(--paper); background: color-mix(in srgb, var(--orb-base) 16%, transparent); }
  .date input {
    width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: var(--text-caption);
    transition: width var(--motion-hover);
  }
  .date.set input,
  .date:focus-within input { width: 92px; }
  .date input::-webkit-calendar-picker-indicator { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  .send {
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    transition: transform var(--motion-quick), opacity var(--motion-quick);
  }
  .send:not(:disabled):active { transform: scale(0.9); }
  .summary {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    padding: 0 var(--space-4);
    font: var(--text-caption);
    color: var(--text3);
    flex: none;
  }
  .overdue-chip {
    padding: 0 var(--space-6);
    border-radius: 999px;
    color: var(--coral);
    background: color-mix(in srgb, var(--coral) 14%, transparent);
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-8) var(--space-12) var(--space-8) var(--space-8);
    border-radius: var(--radius-card);
    background: color-mix(in srgb, var(--paper) 4%, transparent);
    border: 1px solid transparent;
    transition: background var(--motion-hover), border-color var(--motion-hover), opacity var(--motion-standard);
  }
  .row:hover {
    background: color-mix(in srgb, var(--paper) 7%, transparent);
    border-color: var(--line);
  }
  /* Overdue: a thin coral edge on the left, so it stands out without shouting. */
  .row.overdue::before {
    content: "";
    position: absolute;
    left: 0;
    top: var(--space-8);
    bottom: var(--space-8);
    width: 2px;
    border-radius: 999px;
    background: var(--coral);
  }
  .check {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex: none;
  }
  .check:hover:not(:disabled) { background: transparent; }
  .circle {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid var(--text3);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: transparent;
    transition: border-color var(--motion-quick), background var(--motion-quick), color var(--motion-quick), transform var(--motion-quick);
  }
  .check:hover .circle {
    border-color: var(--mint);
    color: var(--mint);
    background: color-mix(in srgb, var(--mint) 18%, transparent);
  }
  .completing .circle {
    border-color: var(--mint);
    background: var(--mint);
    color: var(--ink);
    animation: tick var(--motion-reveal);
  }
  @keyframes tick {
    0% { transform: scale(0.7); }
    60% { transform: scale(1.18); }
    100% { transform: scale(1); }
  }
  .label {
    flex: 1;
    min-width: 0;
    font: var(--text-control);
    font-weight: 400;
    color: var(--paper);
    text-decoration: line-through transparent;
    transition: color var(--motion-standard), text-decoration-color var(--motion-standard);
  }
  .completing .label {
    color: var(--text3);
    text-decoration-color: var(--text3);
  }
  .due {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    font: var(--text-caption);
    font-weight: 600;
    padding: var(--space-2) var(--space-8);
    border-radius: 999px;
    background: var(--smoke);
    color: var(--text2);
    white-space: nowrap;
    flex: none;
  }
  .due.today {
    background: color-mix(in srgb, var(--amber) 16%, transparent);
    color: var(--amber);
  }
  .due.overdue {
    background: color-mix(in srgb, var(--coral) 18%, transparent);
    color: var(--coral);
  }
  .meta {
    font: var(--text-caption);
    color: var(--text3);
    white-space: nowrap;
    flex: none;
  }
  .empty {
    margin: auto;
    text-align: center;
    padding: var(--space-24) var(--space-16);
    max-width: 320px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
  }
  .empty-mark {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text2);
    background: color-mix(in srgb, var(--orb-base) 10%, var(--smoke));
    margin-bottom: var(--space-4);
  }
  .empty-title { margin: 0; font: var(--text-control); color: var(--paper); }
  .empty-hint { margin: 0; font: var(--text-detail); color: var(--text3); }
</style>
