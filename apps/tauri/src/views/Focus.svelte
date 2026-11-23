<script lang="ts">
  // Focus / Pomodoro timer inside the Dynamic Island. The ring fills as time passes, breathes while it runs and pulses
  // once when time is up; the same timer shows in the closed pill.
  import { focusTimer, ROUNDS_PER_SET, type PomodoroPlan } from "../lib/timer.svelte";
  import { tr } from "../lib/i18n.svelte";
  import Ico from "../components/ui/Ico.svelte";

  const PRESETS = [
    { minutes: 5, label: () => tr("5m pauze", "5m break") },
    { minutes: 15, label: () => "15m" },
    { minutes: 25, label: () => tr("25m focus", "25m focus") },
    { minutes: 45, label: () => "45m" },
  ];

  const SIZE = 148;
  const RADIUS = 62;
  const CIRC = 2 * Math.PI * RADIUS;
  const dashOffset = $derived(CIRC * (1 - focusTimer.progress / 100));
  // The knob at the head of the arc, in the ring's own (unrotated) coordinates.
  const knob = $derived.by(() => {
    const angle = (focusTimer.progress / 100) * 2 * Math.PI - Math.PI / 2;
    return { x: SIZE / 2 + RADIUS * Math.cos(angle), y: SIZE / 2 + RADIUS * Math.sin(angle) };
  });
  const phase = $derived(focusTimer.finished ? "done" : focusTimer.running ? "running" : focusTimer.active ? "paused" : "ready");
  const pomodoro = $derived(focusTimer.plan.on);
  const onBreak = $derived(pomodoro && focusTimer.phase === "break");

  // The steppers for a Pomodoro length: one minute a click, five with Shift.
  function step(key: keyof Omit<PomodoroPlan, "on">, dir: 1 | -1, e: MouseEvent) {
    focusTimer.setPlan({ [key]: focusTimer.plan[key] + dir * (e.shiftKey ? 5 : 1) });
  }
  const steppers = $derived<{ key: keyof Omit<PomodoroPlan, "on">; label: string }[]>([
    { key: "work", label: tr("Focus", "Focus") },
    { key: "rest", label: tr("Pauze", "Break") },
    { key: "longRest", label: tr("Lange pauze", "Long break") },
  ]);

  let customMin = $state("10");
  let customSec = $state("00");

  function applyCustom(e: SubmitEvent) {
    e.preventDefault();
    const m = Math.max(0, Number.parseInt(customMin || "0", 10) || 0);
    const s = Math.max(0, Math.min(59, Number.parseInt(customSec || "0", 10) || 0));
    if (m === 0 && s === 0) return;
    focusTimer.setDuration(m, s);
    focusTimer.start();
  }
</script>

<section class="focus" data-state={phase} class:on-break={onBreak}>
  <div class="ring-wrap">
    <svg class="ring" viewBox="0 0 {SIZE} {SIZE}" aria-hidden="true">
      <defs>
        <linearGradient id="focus-arc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" class="stop-a" />
          <stop offset="100%" class="stop-b" />
        </linearGradient>
      </defs>
      <circle class="track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} />
      <circle
        class="fill"
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        stroke-dasharray={CIRC}
        stroke-dashoffset={dashOffset}
        transform="rotate(-90 {SIZE / 2} {SIZE / 2})"
      />
      {#if focusTimer.active && !focusTimer.finished}
        <circle class="knob" cx={knob.x} cy={knob.y} r="5" />
      {/if}
    </svg>
    <div class="center">
      <span class="time">{focusTimer.formatted}</span>
      <span class="sub">
        {#if onBreak}
          {tr("Pauze", "Break")} · {focusTimer.running ? tr("even ontspannen", "time to relax") : tr("Gepauzeerd", "Paused")}
        {:else if focusTimer.finished}
          {tr("Klaar!", "Time's up!")}
        {:else if focusTimer.running}
          {focusTimer.label || tr("Bezig", "Running")}
        {:else if focusTimer.active}
          {tr("Gepauzeerd", "Paused")}
        {:else}
          {tr("Klaar om te starten", "Ready")}
        {/if}
      </span>
    </div>
  </div>

  <div class="controls">
    <button type="button" class="round" title={tr("5 minuten minder", "5 minutes less")} aria-label={tr("5 minuten minder", "5 minutes less")} onclick={() => focusTimer.adjustMinutes(-5)}>−5</button>
    <button type="button" class="primary go" onclick={() => focusTimer.toggle()}>
      <Ico name={focusTimer.running ? "pause" : "play"} size={13} fill="currentColor" stroke={0} />
      {#if focusTimer.running}
        {tr("Pauzeren", "Pause")}
      {:else if focusTimer.finished}
        {tr("Opnieuw starten", "Start again")}
      {:else if focusTimer.active}
        {tr("Hervatten", "Resume")}
      {:else if pomodoro && focusTimer.round > 0}
        {tr("Volgende ronde", "Next round")}
      {:else}
        {tr("Start focus", "Start focus")}
      {/if}
    </button>
    <button type="button" class="round" title={tr("5 minuten erbij", "5 minutes more")} aria-label={tr("5 minuten erbij", "5 minutes more")} onclick={() => focusTimer.adjustMinutes(5)}>+5</button>
    <button type="button" class="round reset" class:shown={focusTimer.active} disabled={!focusTimer.active} title={tr("Reset", "Reset")} aria-label={tr("Reset", "Reset")} onclick={() => focusTimer.reset()}>
      <Ico name="rotate-ccw" size={13} />
    </button>
  </div>

  {#if pomodoro}
    <div class="rounds" aria-label={tr("Ronde {n} van {total}", "Round {n} of {total}", { n: Math.min(focusTimer.round + (onBreak ? 0 : 1), ROUNDS_PER_SET), total: ROUNDS_PER_SET })}>
      {#each Array(ROUNDS_PER_SET) as _, i (i)}
        <span class="round-dot" class:done={i < focusTimer.round} class:now={i === focusTimer.round && !onBreak && focusTimer.active}></span>
      {/each}
    </div>
  {/if}

  <div class="pomodoro">
    <label class="pomo-switch">
      <input type="checkbox" role="switch" checked={pomodoro} onchange={(e) => focusTimer.setPlan({ on: e.currentTarget.checked })} />
      <span>{tr("Pauzes tussen rondes (Pomodoro)", "Breaks between rounds (Pomodoro)")}</span>
    </label>
    {#if pomodoro}
      <div class="steppers">
        {#each steppers as st (st.key)}
          <div class="stepper">
            <span class="step-label">{st.label}</span>
            <div class="step-row">
              <button type="button" class="step" aria-label={tr("Korter", "Shorter")} onclick={(e) => step(st.key, -1, e)}>−</button>
              <span class="step-value">{focusTimer.plan[st.key]}<small>m</small></span>
              <button type="button" class="step" aria-label={tr("Langer", "Longer")} onclick={(e) => step(st.key, 1, e)}>+</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if !pomodoro}
  <div class="presets" role="group" aria-label={tr("Snelle keuzes", "Quick picks")}>
    {#each PRESETS as p (p.minutes)}
      <button
        type="button"
        class="chip"
        class:on={focusTimer.totalSeconds === p.minutes * 60 && !focusTimer.running}
        onclick={() => focusTimer.setMinutes(p.minutes)}
      >
        {p.label()}
      </button>
    {/each}
  </div>

  <form class="custom" onsubmit={applyCustom}>
    <span class="custom-label">{tr("Eigen aftellen", "Custom countdown")}</span>
    <div class="custom-inputs">
      <input type="number" min="0" max="999" aria-label={tr("Minuten", "Minutes")} bind:value={customMin} />
      <span class="colon">:</span>
      <input type="number" min="0" max="59" aria-label={tr("Seconden", "Seconds")} bind:value={customSec} />
      <button type="submit" class="chip">{tr("Start", "Start")}</button>
    </div>
  </form>
  {/if}

  <input
    class="goal"
    type="text"
    maxlength="40"
    placeholder={tr("Waar werk je aan? (optioneel)", "What are you focusing on? (optional)")}
    bind:value={focusTimer.label}
  />
</section>

<style>
  .focus {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-12);
    padding: var(--space-16);
    box-sizing: border-box;
    overflow-y: auto;
    /* The color of the moment: Nook's own while you work, mint when time is up. */
    --arc: var(--orb-base);
  }
  .focus[data-state="done"],
  .focus.on-break { --arc: var(--mint); }
  .focus.on-break .time { color: var(--mint); }
  .rounds { display: flex; gap: var(--space-6); }
  .round-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--line2);
    transition: background var(--motion-standard), transform var(--motion-standard), box-shadow var(--motion-standard);
  }
  .round-dot.done { background: var(--orb-base); }
  .round-dot.now { background: var(--orb-base); box-shadow: 0 0 8px var(--orb-base); animation: breathe 2.4s ease-in-out infinite; }
  .pomodoro {
    width: 100%;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    padding: var(--space-8) var(--space-12);
    border-radius: var(--radius-card);
    background: color-mix(in srgb, var(--paper) 4%, transparent);
    border: 1px solid var(--line);
  }
  .pomo-switch { display: flex; align-items: center; justify-content: space-between; gap: var(--space-8); font: var(--text-label); color: var(--text2); flex-direction: row-reverse; cursor: pointer; }
  /* A small switch, like the ones in Settings. */
  .pomo-switch input {
    appearance: none;
    position: relative;
    width: 32px;
    height: 18px;
    margin: 0;
    padding: 0;
    flex: none;
    border-radius: 999px;
    border: 0;
    background: var(--line2);
    cursor: pointer;
    transition: background var(--motion-hover), box-shadow var(--motion-hover);
  }
  .pomo-switch input::before {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--paper);
    transition: transform var(--motion-panel);
  }
  .pomo-switch input:checked { background: var(--orb-base); box-shadow: 0 0 10px color-mix(in srgb, var(--orb-base) 45%, transparent); }
  .pomo-switch input:checked::before { transform: translateX(14px); background: var(--ink); }
  .steppers { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-6); }
  .stepper { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }
  .step-label { font: var(--text-caption); color: var(--text3); }
  .step-row { display: flex; align-items: center; gap: var(--space-4); }
  .step {
    width: 24px;
    height: 24px;
    padding: 0;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--smoke);
    border: 1px solid var(--line2);
    color: var(--text2);
    font: var(--text-control);
    transition: transform var(--motion-quick), color var(--motion-quick);
  }
  .step:hover:not(:disabled) { color: var(--paper); }
  .step:active:not(:disabled) { transform: scale(0.88); }
  .step-value { min-width: 34px; text-align: center; font: var(--text-control); font-weight: 600; font-variant-numeric: tabular-nums; color: var(--paper); }
  .step-value small { font: var(--text-caption); color: var(--text3); margin-left: var(--space-2); }
  .ring-wrap {
    position: relative;
    width: 148px;
    height: 148px;
    display: grid;
    place-items: center;
    flex: none;
  }
  /* A soft halo behind the ring that breathes while the timer runs. */
  .ring-wrap::before {
    content: "";
    position: absolute;
    inset: var(--space-12);
    border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--arc) 22%, transparent), transparent 70%);
    opacity: 0;
    transition: opacity var(--motion-slow);
  }
  .focus[data-state="running"] .ring-wrap::before { opacity: 1; animation: breathe 3.2s ease-in-out infinite; }
  .focus[data-state="done"] .ring-wrap::before { opacity: 1; animation: pulse 0.9s ease-out 3; }
  @keyframes breathe {
    0%, 100% { transform: scale(0.92); opacity: 0.55; }
    50% { transform: scale(1.06); opacity: 1; }
  }
  @keyframes pulse {
    from { transform: scale(0.9); opacity: 1; }
    to { transform: scale(1.3); opacity: 0; }
  }
  .ring { position: relative; width: 148px; height: 148px; overflow: visible; }
  .stop-a { stop-color: var(--arc); }
  .stop-b { stop-color: color-mix(in srgb, var(--arc) 45%, var(--mint)); }
  .focus[data-state="done"] .stop-b { stop-color: var(--mint-soft); }
  .track { fill: none; stroke: var(--line2); stroke-width: 7; }
  .fill {
    fill: none;
    stroke: url(#focus-arc);
    stroke-width: 7;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.5s linear;
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--arc) 45%, transparent));
  }
  .knob {
    fill: var(--paper);
    stroke: var(--notch);
    stroke-width: 2;
    transition: cx 0.5s linear, cy 0.5s linear;
  }
  .center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
  }
  .time {
    font: var(--text-display);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    color: var(--paper);
    transition: color var(--motion-standard), transform var(--motion-standard);
  }
  .focus[data-state="done"] .time { color: var(--mint); animation: pop var(--motion-reveal); }
  .focus[data-state="paused"] .time { color: var(--text2); }
  @keyframes pop {
    0% { transform: scale(0.9); }
    60% { transform: scale(1.08); }
    100% { transform: scale(1); }
  }
  .sub {
    font: var(--text-caption);
    color: var(--text3);
    max-width: 104px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .controls { display: flex; align-items: center; gap: var(--space-6); }
  .go {
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    border-radius: 999px;
    padding: var(--space-6) var(--space-16);
    font: var(--text-control);
    font-weight: 600;
    transition: transform var(--motion-quick), background var(--motion-quick);
  }
  .go:active { transform: scale(0.95); }
  .round {
    min-width: 32px;
    height: 32px;
    padding: 0 var(--space-8);
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font: var(--text-label);
    font-variant-numeric: tabular-nums;
    color: var(--text2);
    background: var(--smoke);
    border: 1px solid var(--line2);
    transition: background var(--motion-quick), color var(--motion-quick), transform var(--motion-quick), opacity var(--motion-quick);
  }
  .round:hover:not(:disabled) { color: var(--paper); }
  .round:active:not(:disabled) { transform: scale(0.9); }
  .reset { opacity: 0; pointer-events: none; }
  .reset.shown { opacity: 1; pointer-events: auto; }
  .presets { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-6); }
  .chip {
    background: transparent;
    color: var(--text2);
    border: 1px solid var(--line2);
    border-radius: 999px;
    padding: var(--space-4) var(--space-12);
    font: var(--text-label);
    transition: background var(--motion-quick), color var(--motion-quick), border-color var(--motion-quick);
  }
  .chip:hover:not(:disabled) { color: var(--paper); background: var(--smoke); }
  .chip.on {
    border-color: var(--orb-base);
    color: var(--paper);
    background: color-mix(in srgb, var(--orb-base) 16%, transparent);
  }
  .custom { display: flex; align-items: center; gap: var(--space-8); flex-wrap: wrap; justify-content: center; }
  .custom-label { font: var(--text-label); color: var(--text3); }
  .custom-inputs { display: flex; align-items: center; gap: var(--space-4); }
  .custom-inputs input {
    width: 44px;
    border-radius: var(--radius-control);
    padding: var(--space-4) var(--space-6);
    font: var(--text-detail);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  .colon { color: var(--text3); font-weight: 600; }
  .goal {
    width: 100%;
    max-width: 280px;
    border-radius: var(--radius-card);
    padding: var(--space-6) var(--space-12);
    font: var(--text-detail);
    text-align: center;
  }
  .goal:focus { border-color: var(--orb-base); }
</style>
