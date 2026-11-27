<script lang="ts" module>
  import { emit } from "@tauri-apps/api/event";
  // Momenten die alle bollen delen (NookPresence op de Mac): een klik, iets verstuurd, iets klaar.
  export type Mood = "idle" | "working" | "waiting" | "done" | "error" | "listen" | "seen";
  export type Accessory = "none" | "headphones" | "shades" | "crown" | "beanie" | "halo";
  export const ACCESSORIES: Accessory[] = ["none", "headphones", "shades", "crown", "beanie", "halo"];
  export const ACCESSORY_KEY = "nook.accessory";

  export interface RingPiece {
    id: string;
    label: string;
    state: "working" | "waiting" | "error" | "done";
  }

  const listeners = new Set<(moment: "heard" | "nod") => void>();
  const accessoryListeners = new Set<(next: Accessory) => void>();

  export function readAccessory(): Accessory {
    try {
      const v = localStorage.getItem(ACCESSORY_KEY) as Accessory | null;
      return v && ACCESSORIES.includes(v) ? v : "none";
    } catch {
      return "none";
    }
  }

  export function setAccessory(next: Accessory) {
    try {
      localStorage.setItem(ACCESSORY_KEY, next);
    } catch {}
    accessoryListeners.forEach((l) => l(next));
    void emit("island-prefs-changed").catch(() => {});
  }

  /// Je stuurde Nook iets: een sprongetje met grote ogen.
  export function heard() {
    listeners.forEach((l) => l("heard"));
  }
  /// Iets is klaar: een tevreden knik.
  export function nod() {
    listeners.forEach((l) => l("nod"));
  }
</script>

<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { play as playSound } from "../lib/sounds";
  import { nook } from "../lib/state.svelte";
  import CatBody from "./CatBody.svelte";
  import { AVATAR_FINISH_KEY, AVATAR_STYLE_KEY, catState, onAvatarChange, readAvatarFinish, readAvatarStyle } from "../lib/avatar-style";

  // Nook zelf: een bol met licht en schaduw waarvan de ogen je muis volgen. Hij knippert, ademt, knikt als iets klaar
  // is, springt op als je iets verstuurt, krijgt blosjes en hartjes als je muis even op hem rust en wordt duizelig na drie snelle klikken.
  let {
    size = 22,
    mood = "idle",
    level = 0,
    ring = [],
    onpiece,
    movable = false,
    happy = false,
    alive = false,
  }: { size?: number; mood?: Mood; level?: number; ring?: RingPiece[]; onpiece?: (id: string) => void; movable?: boolean; happy?: boolean; alive?: boolean } = $props();

  let el: HTMLDivElement;
  let look = $state({ x: 0, y: 0 });
  let tilt = $state(0);
  let lastPointer = 0;
  let blinking = $state(false);
  let moment = $state<"" | "poke" | "dizzy" | "heard" | "nod" | "hello" | "wake">("");
  let blush = $state(false);
  let hearts = $state(false);
  let drowsy = $state(false);
  let accessory = $state<Accessory>(readAccessory());
  // Settings › Appearance › Avatar: the cat (default) or the classic orb.
  let avatarStyle = $state(readAvatarStyle());
  let avatarFinish = $state(readAvatarFinish());
  const cat = $derived(avatarStyle === "cat");
  // The cat's own happy eyes stand in for the orb's blush, hearts and little jumps.
  const catHappy = $derived(happy || blush || hearts || moment === "heard" || moment === "nod" || moment === "hello" || mood === "seen");
  let hovered = $state<string | null>(null);
  // The hovered piece's name stays a moment after the pointer leaves the ring, so you can move onto it and click it.
  let unhoverTimer: ReturnType<typeof setTimeout> | undefined;
  function hover(id: string) {
    clearTimeout(unhoverTimer);
    hovered = id;
  }
  function unhover() {
    clearTimeout(unhoverTimer);
    unhoverTimer = setTimeout(() => (hovered = null), 250);
  }
  let pokes: number[] = [];
  let restTimer: ReturnType<typeof setTimeout> | undefined;
  let momentTimer: ReturnType<typeof setTimeout> | undefined;
  let lastActivity = Date.now();
  let greeted = 0;

  // Na tien minuten zonder iets dommelt Nook in; de muis maakt hem wakker.
  const DROWSY_AFTER = 600_000;
  const GREETING_GAP = 180_000;

  function play(m: typeof moment, ms: number) {
    clearTimeout(momentTimer);
    moment = "";
    queueMicrotask(() => (moment = m));
    momentTimer = setTimeout(() => (moment = ""), ms);
  }

  function activity() {
    lastActivity = Date.now();
    drowsy = false;
  }

  function follow(e: MouseEvent) {
    if (!el) return;
    lastPointer = Date.now();
    tilt = 0;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const d = Math.max(1, Math.hypot(dx, dy));
    const reach = size * 0.09;
    look = { x: (dx / d) * Math.min(reach, d / 20), y: (dy / d) * Math.min(reach, d / 20) };
  }

  function enter() {
    const now = Date.now();
    if (drowsy || now - lastActivity > DROWSY_AFTER) play("wake", 700);
    else if (now - greeted > GREETING_GAP) {
      greeted = now;
      play("hello", 600);
    }
    activity();
    clearTimeout(restTimer);
    // De muis rust op Nook: blosjes en kleine hartjes.
    restTimer = setTimeout(() => {
      blush = true;
      hearts = true;
      void playSound("hearts", nook.settings?.sounds ?? true);
    }, 1400);
  }

  function leave() {
    clearTimeout(restTimer);
    blush = false;
    hearts = false;
  }

  function poke() {
    if (tugged) {
      tugged = false;
      return;
    }
    const now = Date.now();
    pokes = [...pokes.filter((t) => now - t < 1100), now];
    activity();
    if (pokes.length >= 3) {
      pokes = [];
      play("dizzy", 1800);
      void playSound("dizzy", nook.settings?.sounds ?? true);
    } else {
      play("poke", 350);
      void playSound("poke", nook.settings?.sounds ?? true);
    }
  }

  function cycleAccessory(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (cat) return;
    const next = ACCESSORIES[(ACCESSORIES.indexOf(accessory) + 1) % ACCESSORIES.length];
    setAccessory(next);
    play("hello", 450);
    void playSound("poke", nook.settings?.sounds ?? true);
  }

  // Knipperen op onregelmatige momenten, soms twee keer; niet als hij tevreden is of denkt.
  const gaps = [3.2, 4.8, 2.6, 6.1, 3.9, 5.4, 2.9, 7.2, 4.1, 3.5];
  $effect(() => {
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        if (mood !== "done" && mood !== "working") {
          blinking = true;
          setTimeout(() => (blinking = false), 130);
          if (i % 4 === 1) setTimeout(() => { blinking = true; setTimeout(() => (blinking = false), 120); }, 260);
        }
        i++;
        next();
      }, gaps[i % gaps.length] * 1000);
    };
    next();
    const drowse = setInterval(() => (drowsy = Date.now() - lastActivity > DROWSY_AFTER), 30_000);
    // Autonomous curious glances and gentle head tilts when alive (e.g. inside the Dynamic Island).
    const poses = [
      { x: 0.9, y: -0.2, tilt: 5 },
      { x: -0.85, y: 0.1, tilt: -5 },
      { x: 0.3, y: -0.7, tilt: 3 },
      { x: 0, y: 0, tilt: 0 },
      { x: -0.7, y: -0.3, tilt: -4 },
      { x: 0.75, y: 0.2, tilt: 4 },
    ];
    let step = 0;
    const glance = setInterval(() => {
      if (!alive || drowsy || Date.now() - lastPointer < 3500 || document.body.classList.contains("easy")) return;
      const p = poses[step % poses.length];
      step++;
      const reach = size * 0.09;
      look = { x: p.x * reach, y: p.y * reach };
      tilt = p.tilt;
      if (step % 5 === 0) play("hello", 600);
    }, 4200);
    const listener = (m: "heard" | "nod") => {
      activity();
      play(m, m === "heard" ? 600 : 700);
    };
    listeners.add(listener);
    const accListener = (next: Accessory) => (accessory = next);
    accessoryListeners.add(accListener);
    const readPrefs = () => {
      accessory = readAccessory();
      avatarStyle = readAvatarStyle();
      avatarFinish = readAvatarFinish();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACCESSORY_KEY || e.key === AVATAR_STYLE_KEY || e.key === AVATAR_FINISH_KEY) readPrefs();
    };
    window.addEventListener("storage", onStorage);
    const unPrefs = listen("island-prefs-changed", readPrefs);
    const offAvatar = onAvatarChange(readPrefs);
    return () => {
      clearTimeout(timer);
      clearInterval(drowse);
      clearInterval(glance);
      listeners.delete(listener);
      accessoryListeners.delete(accListener);
      offAvatar();
      window.removeEventListener("storage", onStorage);
      unPrefs.then((f) => f());
    };
  });

  // Klaar of mislukt: knikken of schudden.
  let lastMood: Mood = "idle";
  $effect(() => {
    if (mood !== lastMood) {
      if (mood === "done") play("nod", 700);
      lastMood = mood;
      activity();
    }
  });

  const gap = 0.025;
  const ringSize = $derived(size * 1.75);
  function arc(i: number, n: number) {
    const r = ringSize / 2 - 3;
    const c = ringSize / 2;
    const span = 1 / n;
    const a0 = (i * span + gap) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) * span - gap) * 2 * Math.PI - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)}`;
  }
  function middle(i: number, n: number) {
    return ((i + 0.5) / n) * 2 * Math.PI - Math.PI / 2;
  }
  // Hold the left button on a movable Nook and pull: he follows on an elastic tether, stretches along the way he moves,
  // and springs home with a wobble when you let go. A spring runs per frame only while he is held or still settling.
  let held = $state(false);
  let pull = $state({ x: 0, y: 0, s: 0, a: 0, lx: 0, ly: 0 });
  let tugged = false;
  let grab: { x: number; y: number } | null = null;
  let pos = { x: 0, y: 0 };
  let vel = { x: 0, y: 0 };
  let aim = { x: 0, y: 0 };
  let frame = 0;
  let lastFrame = 0;
  let calm = false;
  const tether = $derived(size * 1.6);

  function step(now: number) {
    const dt = Math.min(1 / 30, (now - lastFrame) / 1000 || 1 / 60);
    lastFrame = now;
    // Stiff while held so he keeps up with the pointer, loose on release so he overshoots home and wobbles.
    const k = held ? 900 : 220;
    const c = 2 * Math.sqrt(k) * (held || calm ? 0.85 : 0.3);
    vel.x += (-k * (pos.x - aim.x) - c * vel.x) * dt;
    vel.y += (-k * (pos.y - aim.y) - c * vel.y) * dt;
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    const speed = Math.hypot(vel.x, vel.y);
    if (!held && speed < 2 && Math.hypot(pos.x, pos.y) < 0.2) {
      pos = { x: 0, y: 0 };
      vel = { x: 0, y: 0 };
      pull = { x: 0, y: 0, s: 0, a: 0, lx: 0, ly: 0 };
      frame = 0;
      return;
    }
    // Stretch along the motion, plus a little along the tether while he is pulled away from home.
    const sx = vel.x / 2400 + (held ? (pos.x / tether) * 0.14 : 0);
    const sy = vel.y / 2400 + (held ? (pos.y / tether) * 0.14 : 0);
    const s = calm ? 0 : Math.min(0.24, Math.hypot(sx, sy));
    const look = speed > 40 ? size * 0.09 : 0;
    pull = { x: pos.x, y: pos.y, s, a: Math.atan2(sy, sx), lx: (vel.x / (speed || 1)) * look, ly: (vel.y / (speed || 1)) * look };
    frame = requestAnimationFrame(step);
  }

  function wake() {
    if (frame) return;
    lastFrame = performance.now();
    frame = requestAnimationFrame(step);
  }

  function hold(e: PointerEvent) {
    if (!movable || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    calm = matchMedia("(prefers-reduced-motion: reduce)").matches || document.body.classList.contains("easy");
    grab = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    tugged = false;
  }

  function drag(e: PointerEvent) {
    if (!grab) return;
    const dx = e.clientX - grab.x;
    const dy = e.clientY - grab.y;
    const d = Math.hypot(dx, dy);
    if (!held) {
      if (d < 4) return;
      held = true;
      tugged = true;
      activity();
    }
    // Free close to home, ever stiffer the further you pull, never past the end of the tether.
    const reach = tether * Math.tanh(d / tether);
    aim = { x: (dx / (d || 1)) * reach, y: (dy / (d || 1)) * reach };
    wake();
  }

  function release() {
    if (!grab) return;
    grab = null;
    if (!held) return;
    held = false;
    aim = { x: 0, y: 0 };
    wake();
  }

  $effect(() => () => cancelAnimationFrame(frame));

  // A small mouth that only shows when there is something to say with it: a smile when he is pleased, an "o" when he
  // is surprised or listening closely, a flat line when something failed. At rest he has none, as before.
  const mouth = $derived(
    moment === "dizzy"
      ? "wavy"
      : held || moment === "heard" || moment === "wake" || mood === "seen" || mood === "listen"
        ? "oh"
        : (happy && moment !== "poke") || blush || hearts || moment === "nod" || mood === "done"
          ? "smile"
          : mood === "error"
            ? "flat"
            : "",
  );

  // Wijst de muis een stuk van de ring aan, dan kijkt Nook ernaar.
  const gaze = $derived.by(() => {
    if (pull.lx || pull.ly) return { x: pull.lx, y: pull.ly };
    const i = ring.findIndex((p) => p.id === hovered);
    if (i < 0) return look;
    const a = middle(i, ring.length);
    return { x: Math.cos(a) * size * 0.09, y: Math.sin(a) * size * 0.09 };
  });
</script>

<svelte:window onmousemove={follow} />

<div class="wrap" style="--s:{size}px;--r:{ringSize}px" class:ringed={ring.length > 0}>
  {#if ring.length}
    <svg class="ring" width={ringSize} height={ringSize} viewBox="0 0 {ringSize} {ringSize}" aria-hidden="true">
      {#each ring as piece, i (piece.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <path
          d={arc(i, ring.length)}
          class="piece {piece.state}"
          class:hover={hovered === piece.id}
          style="animation-delay:{i * 60}ms"
          onmouseenter={() => hover(piece.id)}
          onmouseleave={unhover}
          onclick={() => onpiece?.(piece.id)}
        />
      {/each}
    </svg>
    {#if hovered}
      {@const id = hovered}
      <button class="label" onmouseenter={() => hover(id)} onmouseleave={unhover} onclick={() => { hovered = null; onpiece?.(id); }}>
        {ring.find((p) => p.id === id)?.label}
      </button>
    {/if}
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="hold"
    class:movable
    class:held
    onpointerdown={hold}
    onpointermove={drag}
    onpointerup={release}
    onpointercancel={release}
    onmousedown={(e) => movable && e.button === 0 && e.stopPropagation()}
    style="transform: translate({pull.x}px, {pull.y}px) rotate({pull.a}rad) scale({1 + pull.s}, {1 - pull.s * 0.55}) rotate({-pull.a}rad) rotate({tilt}deg)"
  >
    <span class="aura aura-{mood}" style="--level:{level}" aria-hidden="true"></span>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      class="orb {mood} {moment}"
      class:cat
      class:drowsy
      class:happy={happy && moment !== "dizzy"}
      bind:this={el}
      onmouseenter={enter}
      onmouseleave={leave}
      onclick={poke}
      oncontextmenu={cycleAccessory}
      style="--lx:{-gaze.x * 1.6}px;--ly:{-gaze.y * 1.6}px;--level:{level}"
    >
      {#if cat}
        <CatBody {size} state={catState(mood, drowsy && !held)} happy={catHappy} finish={avatarFinish} />
      {:else}
      {#if accessory !== "none"}
        <svg class="acc acc-{accessory}" viewBox="0 0 32 32" aria-hidden="true">
          {#if accessory === "headphones"}
            <path d="M5 17 C5 8 27 8 27 17" fill="none" stroke="var(--acc-band)" stroke-width="2.6" stroke-linecap="round" />
            <rect x="2.2" y="14.5" width="4.4" height="7.5" rx="2.2" fill="var(--acc-cup)" stroke="var(--orb-base)" stroke-width="0.9" />
            <rect x="25.4" y="14.5" width="4.4" height="7.5" rx="2.2" fill="var(--acc-cup)" stroke="var(--orb-base)" stroke-width="0.9" />
          {:else if accessory === "shades"}
            <rect x="6.5" y="12" width="8.5" height="6" rx="2" fill="var(--acc-lens)" />
            <rect x="17" y="12" width="8.5" height="6" rx="2" fill="var(--acc-lens)" />
            <path d="M15 14.5 L17 14.5" stroke="var(--acc-lens)" stroke-width="1.6" />
            <path d="M8.5 13.5 L11 16.5 M19 13.5 L21.5 16.5" stroke="var(--acc-glint)" stroke-width="1.1" stroke-linecap="round" />
          {:else if accessory === "crown"}
            <path d="M9 10 L11 4 L16 8 L21 4 L23 10 Z" fill="var(--acc-gold)" stroke="var(--acc-gold-edge)" stroke-width="1" stroke-linejoin="round" />
          {:else if accessory === "beanie"}
            <path d="M6 12 C7 4 25 4 26 12 Z" fill="var(--acc-beanie)" />
            <rect x="5.5" y="10.5" width="21" height="3.2" rx="1.6" fill="var(--acc-beanie-band)" />
            <circle cx="16" cy="4.2" r="2.2" fill="var(--acc-pom)" />
          {:else if accessory === "halo"}
            <ellipse cx="16" cy="4.5" rx="8.5" ry="2.4" fill="none" stroke="var(--acc-halo)" stroke-width="1.8" />
          {/if}
        </svg>
      {/if}
      {#if moment === "dizzy"}
        <span class="eye dizzy-eye"></span>
        <span class="eye dizzy-eye"></span>
      {:else}
        <span class="eye" class:blink={blinking || moment === "poke"} style="transform: translate({gaze.x}px, {gaze.y}px)"></span>
        <span class="eye" class:blink={blinking || moment === "poke"} style="transform: translate({gaze.x}px, {gaze.y}px)"></span>
      {/if}
      {#if mouth}
        {#key mouth}
          <span class="mouth {mouth}" style="translate: calc(-50% + {gaze.x * 0.55}px) {gaze.y * 0.4}px" aria-hidden="true"></span>
        {/key}
      {/if}
      {#if blush || held}
        <span class="cheek left"></span><span class="cheek right"></span>
      {/if}
      {#if hearts}
        {#each ["h1", "h2"] as h (h)}
          <svg class="heart {h}" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s-7.5-4.6-9.5-9.3C1.2 8.4 3.4 5 6.8 5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3 3.4 0 5.6 3.4 4.3 6.7C19.5 16.4 12 21 12 21Z" fill="currentColor" />
          </svg>
        {/each}
      {/if}
      {#if drowsy && !held}
        <span class="zz" aria-hidden="true">z</span>
      {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .wrap { position: relative; width: var(--s); height: var(--s); display: inline-flex; align-items: center; justify-content: center; flex: none; }
  .wrap.ringed { width: var(--r); height: var(--r); }
  .orb {
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    /* Lit like a glossy ball: a highlight top left that slides against his gaze, shade toward the rim, and a little
       light bounced back from below. The glow around him lives on `.aura`, so moods never flatten this shading. */
    background:
      radial-gradient(circle at 50% 112%, color-mix(in srgb, var(--orb-light) 30%, transparent) 0%, transparent 46%),
      radial-gradient(
        circle at calc(34% + var(--lx)) calc(30% + var(--ly)),
        color-mix(in srgb, var(--orb-light) 88%, var(--orb-base)) 0%,
        var(--orb-base) 50%,
        color-mix(in srgb, var(--orb-base) 68%, var(--orb-ink)) 100%
      ),
      var(--orb-base);
    box-shadow:
      inset 0 calc(var(--s) * -0.1) calc(var(--s) * 0.2) var(--orb-shade),
      inset 0 calc(var(--s) * 0.035) calc(var(--s) * 0.05) color-mix(in srgb, var(--orb-light) 60%, transparent),
      0 calc(var(--s) * 0.06) calc(var(--s) * 0.14) var(--orb-shade),
      0 0 calc(var(--s) * (0.55 + var(--level) * 0.6)) color-mix(in srgb, var(--orb-base) 30%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: calc(var(--s) * 0.16);
    position: relative;
    z-index: 1;
    transition: box-shadow 0.3s, background 0.3s;
    cursor: default;
  }
  /* As a cat the body is CatBody's own drawing: no ball, shine or rim around it. */
  .orb.cat { background: none; box-shadow: none; border-radius: 0; }
  .orb.cat::before,
  .orb.cat::after { content: none; }
  /* The shine: a soft oval that follows the light. */
  .orb::before {
    content: "";
    position: absolute;
    left: 17%;
    top: 10%;
    width: 36%;
    height: 22%;
    border-radius: 50%;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--orb-light) 90%, transparent), transparent);
    transform: translate(var(--lx), var(--ly)) rotate(-28deg);
    transition: transform 0.08s linear;
    pointer-events: none;
  }
  /* A hairline rim, so he keeps his edge on a light island too. */
  .orb::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 0 max(0.5px, calc(var(--s) * 0.02)) color-mix(in srgb, var(--orb-ink) 12%, transparent);
    pointer-events: none;
  }
  .eye {
    position: relative;
    width: calc(var(--s) * 0.13);
    height: calc(var(--s) * 0.22);
    border-radius: 999px;
    background: var(--orb-ink);
    transition: transform 0.08s linear, height 0.08s;
  }
  /* A catchlight in each eye: the small dot that makes him look alive. */
  .eye::after {
    content: "";
    position: absolute;
    top: 14%;
    left: 18%;
    width: 42%;
    height: 26%;
    border-radius: 50%;
    background: var(--orb-light);
    opacity: 0.9;
    transition: opacity 0.08s;
  }
  .eye.blink::after,
  .drowsy .eye::after,
  .happy .eye::after,
  .dizzy-eye::after { opacity: 0; }
  .hold { display: flex; position: relative; z-index: 1; will-change: transform; transition: transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1); }
  .hold.movable { cursor: grab; user-select: none; touch-action: none; }
  .hold.movable .orb { cursor: inherit; }
  .hold.held { cursor: grabbing; z-index: 10; transition: none; }
  /* Held: wide awake, and a soft lift that the glow follows. */
  .held .orb { box-shadow: 0 calc(var(--s) * 0.18) calc(var(--s) * 0.6) var(--orb-held-glow); }
  .held .eye { height: calc(var(--s) * 0.26); }
  .eye.blink { height: calc(var(--s) * 0.03); }
  .drowsy .eye { height: calc(var(--s) * 0.08); }
  .happy .eye {
    height: calc(var(--s) * 0.12);
    width: calc(var(--s) * 0.16);
    background: transparent;
    border-top: max(1.5px, calc(var(--s) * 0.065)) solid var(--orb-ink);
    border-radius: 50% 50% 0 0;
  }
  .dizzy-eye {
    width: calc(var(--s) * 0.18);
    height: calc(var(--s) * 0.18);
    background: transparent;
    border: max(1.5px, calc(var(--s) * 0.05)) dashed var(--orb-ink);
    border-radius: 50%;
    animation: spin-eye 0.55s linear infinite;
  }
  @keyframes spin-eye { to { transform: rotate(360deg); } }
  .acc {
    position: absolute;
    inset: calc(var(--s) * -0.18);
    width: calc(var(--s) * 1.36);
    height: calc(var(--s) * 1.36);
    pointer-events: none;
    overflow: visible;
    z-index: 2;
  }
  .acc-halo { filter: drop-shadow(0 0 3px var(--acc-halo-glow)); }
  .heart {
    position: absolute;
    width: max(var(--space-8), calc(var(--s) * 0.34));
    height: max(var(--space-8), calc(var(--s) * 0.34));
    color: var(--orb-heart);
    filter: drop-shadow(0 1px 2px color-mix(in srgb, var(--orb-heart) 50%, transparent));
    pointer-events: none;
    overflow: visible;
    z-index: 3;
    animation: float-heart 1.4s ease-out infinite;
  }
  .heart.h1 { top: -25%; left: 6%; }
  .heart.h2 {
    top: -34%;
    right: 2%;
    width: max(var(--space-6), calc(var(--s) * 0.26));
    height: max(var(--space-6), calc(var(--s) * 0.26));
    animation-delay: 0.55s;
  }
  @keyframes float-heart {
    0% { transform: translateY(4px) scale(0.6); opacity: 0; }
    30% { opacity: 1; }
    100% { transform: translateY(-10px) scale(1.05); opacity: 0; }
  }
  .mouth {
    position: absolute;
    left: 50%;
    top: 64%;
    pointer-events: none;
    transition: translate 0.08s linear;
    animation: mouth-in 0.2s cubic-bezier(0.3, 1.5, 0.5, 1);
  }
  .mouth.smile {
    width: calc(var(--s) * 0.2);
    height: calc(var(--s) * 0.09);
    border-bottom: max(1px, calc(var(--s) * 0.05)) solid var(--orb-ink);
    border-radius: 0 0 50% 50% / 0 0 100% 100%;
  }
  .mouth.oh {
    top: 62%;
    width: calc(var(--s) * 0.1);
    height: calc(var(--s) * 0.12);
    border-radius: 50%;
    background: var(--orb-ink);
  }
  .mouth.flat,
  .mouth.wavy {
    top: 67%;
    width: calc(var(--s) * 0.14);
    height: max(1px, calc(var(--s) * 0.045));
    border-radius: 999px;
    background: var(--orb-ink);
  }
  .mouth.wavy { animation: mouth-in 0.2s ease-out, wavy 0.3s ease-in-out infinite alternate; }
  @keyframes mouth-in { from { scale: 0.2; opacity: 0; } }
  @keyframes wavy { to { rotate: 12deg; } }
  .zz {
    position: absolute;
    top: -10%;
    right: -6%;
    font: 700 calc(var(--s) * 0.32) / 1 var(--font);
    color: var(--text3);
    pointer-events: none;
    animation: zz 2.4s ease-in-out infinite;
  }
  @keyframes zz {
    0% { transform: translate(0, 4px) scale(0.6); opacity: 0; }
    40% { opacity: 1; }
    100% { transform: translate(4px, -6px) scale(1); opacity: 0; }
  }
  /* The light around him that says what he is doing: a comet circling while he works, a warm pulse while he waits
     for you, a mint glow that swells with your voice, a coral flash on an error and a ring of mint when he is done. */
  .aura {
    position: absolute;
    left: 50%;
    top: 50%;
    width: calc(var(--s) * 1.56);
    height: calc(var(--s) * 1.56);
    margin: calc(var(--s) * -0.78) 0 0 calc(var(--s) * -0.78);
    border-radius: 50%;
    pointer-events: none;
    opacity: 0;
    z-index: 0;
    transition: opacity 0.4s ease;
  }
  .aura-working {
    opacity: 1;
    background: conic-gradient(
      from 0deg,
      transparent 0 45%,
      color-mix(in srgb, var(--mint) 35%, transparent) 70%,
      color-mix(in srgb, var(--mint) 55%, var(--orb-base)) 92%,
      var(--orb-light) 97%,
      transparent 100%
    );
    mask: radial-gradient(farthest-side, transparent 65%, black 68%, black 77%, transparent 80%);
    filter: drop-shadow(0 0 3px color-mix(in srgb, var(--mint) 60%, transparent));
    animation: aura-spin 1.4s linear infinite;
  }
  .aura-waiting {
    opacity: 1;
    background:
      radial-gradient(closest-side, transparent 80%, color-mix(in srgb, var(--amber) 85%, transparent) 84%, transparent 90%),
      radial-gradient(closest-side, color-mix(in srgb, var(--amber) 55%, transparent), transparent);
    animation: aura-pulse 1.4s ease-in-out infinite;
  }
  .aura-listen {
    opacity: 1;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--mint) 55%, transparent), transparent);
    transform: scale(calc(0.85 + var(--level) * 0.45));
    transition: opacity 0.4s ease, transform 0.08s linear;
  }
  .aura-error {
    opacity: 1;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--coral) 60%, transparent), transparent);
  }
  .aura-done {
    opacity: 1;
    background: radial-gradient(closest-side, transparent 70%, color-mix(in srgb, var(--mint) 70%, transparent) 78%, transparent);
    animation: aura-burst 0.8s ease-out 1 both;
  }
  @keyframes aura-spin { to { transform: rotate(360deg); } }
  @keyframes aura-pulse {
    0%, 100% { transform: scale(0.85); opacity: 0.55; }
    50% { transform: scale(1.08); opacity: 1; }
  }
  @keyframes aura-burst {
    from { transform: scale(0.7); opacity: 1; }
    to { transform: scale(1.35); opacity: 0; }
  }
  :global(body.easy) .aura { animation: none; }
  .cheek { position: absolute; top: 58%; width: calc(var(--s) * 0.16); height: calc(var(--s) * 0.08); border-radius: 50%; background: var(--orb-cheek); filter: blur(1px); }
  .cheek.left { left: 16%; }
  .cheek.right { right: 16%; }
  .working { animation: breathe 1.6s ease-in-out infinite; }
  .idle:not(.drowsy) { animation: rest 4.5s ease-in-out infinite; }
  /* Taking it easy (battery, saver, paused): the idle float rests, so the webview stops drawing frames for it. */
  :global(body.easy) .idle { animation: none; }
  .listen .eye { height: calc(var(--s) * (0.22 + var(--level) * 0.06)); }
  .seen .eye:last-child { transform: translateY(-2px) !important; }
  .orb.error { animation: shake 0.4s ease-in-out 1; }
  .nod { animation: nod 0.7s ease-out 1; }
  .poke { animation: squash 0.35s ease-out 1; }
  .heard { animation: hop 0.6s cubic-bezier(0.3, 1.6, 0.5, 1) 1; }
  .heard .eye { height: calc(var(--s) * 0.26); }
  .hello { animation: hop 0.6s ease-out 1; }
  .wake { animation: hop 0.7s cubic-bezier(0.3, 1.8, 0.5, 1) 1; }
  .dizzy { animation: wobble 1.8s ease-in-out 1; }
  @keyframes rest { 50% { transform: translateY(-1px) scale(1.01); } }
  @keyframes breathe { 50% { transform: scale(1.08); } }
  @keyframes nod { 30% { transform: translateY(3px) rotate(2deg); } 60% { transform: translateY(-1px); } }
  @keyframes squash { 30% { transform: scale(1.15, 0.82); } 65% { transform: scale(0.95, 1.06); } }
  @keyframes hop { 25% { transform: scale(1.1, 0.88); } 55% { transform: translateY(calc(var(--s) * -0.22)); } 80% { transform: translateY(0) scale(1.05, 0.95); } }
  @keyframes wobble { 15%, 45%, 75% { transform: rotate(-9deg); } 30%, 60%, 90% { transform: rotate(9deg); } }
  @keyframes shake { 25% { transform: translateX(-3px); } 50% { transform: translateX(3px); } 75% { transform: translateX(-2px); } }
  .ring { position: absolute; inset: 0; overflow: visible; }
  .piece { fill: none; stroke-width: 3; stroke-linecap: round; cursor: pointer; animation: draw 0.5s ease-out both; }
  .piece.working { stroke: color-mix(in srgb, var(--paper) 45%, transparent); }
  .piece.waiting { stroke: var(--amber); animation: draw 0.5s ease-out both, pulse 1.2s ease-in-out infinite; }
  .piece.error { stroke: var(--coral); }
  .piece.done { stroke: var(--mint); }
  .piece.hover { stroke-width: 5; }
  @keyframes draw { from { opacity: 0; } }
  .label { position: absolute; left: calc(100% + 6px); top: 50%; transform: translateY(-50%); white-space: nowrap; font-size: 11px; color: var(--text2); background: var(--notch); padding: 2px 6px; border: none; border-radius: 6px; z-index: 5; }
  .label:hover { color: var(--paper); background: var(--smoke); }
</style>
