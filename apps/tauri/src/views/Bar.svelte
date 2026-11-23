<script lang="ts">
  // De balk bovenaan het scherm: in rust een pil met Nook, open een paneel met de tabs Home, Nook, Agents en Werkruimte.
  import { untrack } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { listen } from "@tauri-apps/api/event";
  import { invoke } from "@tauri-apps/api/core";
  import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
  import { api, events } from "../lib/api";
  import { nook } from "../lib/state.svelte";
  import Chat from "../components/Chat.svelte";
  import Orb from "../components/Orb.svelte";
  import Icon from "../components/Icon.svelte";
  import Ico from "../components/ui/Ico.svelte";
  import { NEON_RIM_KEY, readNeonRim, type NeonRim } from "../lib/neon-rim";
  import { fly, fade } from "svelte/transition";
  import { cubicOut, backOut } from "svelte/easing";
  import { motion } from "../lib/motion";
  import Today from "./Today.svelte";
  import Agents from "./Agents.svelte";
  import Workspace from "./Workspace.svelte";
  import Music from "./services/Music.svelte";
  import Commands from "./Commands.svelte";
  import NookHistory from "./NookHistory.svelte";
  import Chats from "./Chats.svelte";
  import { services, serviceEvents, type NowPlaying } from "../lib/services";
  import { listening } from "../lib/listening.svelte";
  import { attachments } from "../lib/attachments.svelte";
  import { play } from "../lib/sounds";
  import { agents } from "../lib/agents.svelte";
  import { quiet } from "../lib/quiet.svelte";
  import { barDraft } from "../lib/draft.svelte";
  import { tr, appLanguage } from "../lib/i18n.svelte";
  import { heard } from "../components/Orb.svelte";
  import AgentAlerts from "./agents/AgentAlerts.svelte";
  import NoticeMark from "../components/NoticeMark.svelte";
  import NoticeOk from "../components/NoticeOk.svelte";
  import { compactNotice, Countdown, noticeTone } from "../lib/notice";
  import WhatsAppCard from "./connectors/WhatsAppCard.svelte";
  import { whatsapp } from "../lib/whatsapp.svelte";
  import Home from "./home/Home.svelte";
  import Tasks from "./Tasks.svelte";
  import Focus from "./Focus.svelte";
  import Notes from "./Notes.svelte";
  import Tray from "./Tray.svelte";
  import type { Target } from "../lib/inbox";
  import { WEATHER_CITY_KEY, WEATHER_ENABLED_KEY, fetchIslandWeather, type IslandWeather } from "../lib/weather";
  import { HIDDEN_TABS_KEY, ISLAND_PREFS_EVENT, readHiddenTabs, type HideableTab } from "../lib/island-tabs";
  import { focusTimer } from "../lib/timer.svelte";
  import { clipboardHistory } from "../lib/clipboard.svelte";
  import { fileTray } from "../lib/tray.svelte";

  type Tab = "home" | "nook" | "tasks" | "focus" | "notes" | "tray" | "chats" | "agents" | "workspace" | "music" | "commands";
  let expanded = $state(false);
  let tab = $state<Tab>(firstTab());

  /// The remembered tab; Home the first time, also for someone who used the bar before Home existed.
  function firstTab(): Tab {
    try {
      if (!localStorage.getItem("bar.homeShown")) {
        localStorage.setItem("bar.homeShown", "1");
        localStorage.setItem("bar.tab", "home");
      }
      return (localStorage.getItem("bar.tab") as Tab) || "home";
    } catch {
      return "home";
    }
  }
  let pinnedOpen = $state(false);
  let locked = $state(false);
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let inside = $state(false);
  let openedAt = 0;
  // Agent notices: a compact one widens the closed bar (`strip`); a detailed one opens the panel. `noticeLeft` is what
  // is left of its countdown, for the ring on OK.
  let strip = $state(false);
  let openedForNotice = false;
  let noticeLeft = $state<number | null>(null);
  const noticeCompact = $derived(nook.settings?.agentNotice === "compact");

  const mood = $derived(nook.waiting ? "waiting" : nook.working ? "working" : "idle");
  const floating = $derived(nook.settings?.placement === "floating");
  // At the top of the screen the island is a notch: concave "shoulders" curve it into the screen's edge on both sides,
  // as a phone's or a Mac's notch does. Floating, or as the round Nook with its chat chip, it stands free without them.
  const islandDisplay = $derived(nook.settings?.islandDisplay ?? "pill");
  const hoverOpen = $derived(nook.settings?.islandHoverOpen ?? false);
  const hideWhenIdle = $derived(nook.settings?.hideWhenIdle ?? false);
  type IslandTheme = "obsidian" | "glass" | "tinted" | "light" | "neon";
  let islandTheme = $state<IslandTheme>((localStorage.getItem("island.theme") as IslandTheme) || "obsidian");
  let hiddenTabs = $state<HideableTab[]>(readHiddenTabs());
  const tabVisible = (t: HideableTab) => !hiddenTabs.includes(t);

  // The highlight behind the open tab glides to the tab you pick instead of jumping, and an off-screen tab scrolls in.
  let navEl = $state<HTMLElement | undefined>();
  let glider = $state({ x: 0, w: 0, ready: false });
  $effect(() => {
    // Everything that moves or resizes a tab label.
    void [shown, hiddenTabs.length, openTaskCount, focusTimer.formatted, focusTimer.running, fileTray.count, !!playing, appLanguage()];
    const el = navEl;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      const on = el.querySelector<HTMLElement>("button.on");
      if (!on) {
        glider = { x: 0, w: 0, ready: false };
        return;
      }
      glider = { x: on.offsetLeft, w: on.offsetWidth, ready: true };
      on.scrollIntoView({ block: "nearest", inline: "nearest", behavior: motion(1) ? "smooth" : "auto" });
    });
    return () => cancelAnimationFrame(raf);
  });
  let weather = $state<IslandWeather | null>(null);
  let openTaskCount = $state(0);
  function refreshTasks() {
    api.openLoops().then((l) => (openTaskCount = l.length)).catch(() => {});
  }
  $effect(() => {
    refreshTasks();
    const un = events.onNookUpdated(() => refreshTasks());
    return () => {
      un.then((f) => f());
    };
  });
  function refreshWeather(force = false) {
    fetchIslandWeather(force).then((w) => (weather = w)).catch(() => {});
  }
  let neonRim = $state<NeonRim>(readNeonRim());
  function syncIslandPrefs(refreshWx = false) {
    islandTheme = (localStorage.getItem("island.theme") as IslandTheme) || "obsidian";
    neonRim = readNeonRim();
    hiddenTabs = readHiddenTabs();
    if (refreshWx) refreshWeather(true);
  }
  $effect(() => {
    refreshWeather();
    const timer = setInterval(() => refreshWeather(true), 30 * 60_000);
    const sync = (e: StorageEvent) => {
      if (e.key === "island.theme") islandTheme = (e.newValue as IslandTheme) || "obsidian";
      if (e.key === NEON_RIM_KEY) neonRim = readNeonRim();
      if (e.key === WEATHER_CITY_KEY || e.key === WEATHER_ENABLED_KEY) refreshWeather(true);
      if (e.key === HIDDEN_TABS_KEY) hiddenTabs = readHiddenTabs();
    };
    window.addEventListener("storage", sync);
    const unPrefs = listen(ISLAND_PREFS_EVENT, () => syncIslandPrefs(true));
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", sync);
      unPrefs.then((f) => f());
    };
  });
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;

  // Live clock for the closed Dynamic Island pill (updated every 15s, costs ~0 CPU).
  let now = $state(new Date());
  $effect(() => {
    const t = setInterval(() => (now = new Date()), 15_000);
    return () => clearInterval(t);
  });

  // Background clipboard history + upcoming calendar event countdown (from Rust cache, zero network).
  type UpcomingEvent = { title: string; start: string; end: string; allDay: boolean };
  let upcomingEvents = $state<UpcomingEvent[]>([]);
  $effect(() => {
    const stopClip = clipboardHistory.start();
    const loadEvents = () => {
      invoke<UpcomingEvent[]>("agenda_upcoming", { hours: 2 })
        .then((list) => (upcomingEvents = list))
        .catch(() => (upcomingEvents = []));
    };
    loadEvents();
    const evTimer = setInterval(loadEvents, 60_000);
    return () => {
      stopClip();
      clearInterval(evTimer);
    };
  });
  const nextEvent = $derived.by(() => {
    const nowMs = now.getTime();
    for (const ev of upcomingEvents) {
      if (ev.allDay) continue;
      const diffMin = Math.round((new Date(ev.start).getTime() - nowMs) / 60_000);
      if (diffMin >= -5 && diffMin <= 30) {
        return { title: ev.title, minutes: diffMin };
      }
    }
    return null;
  });
  const locale = $derived(
    appLanguage() === "de" ? "de-DE" : appLanguage() === "nl" ? "nl-NL" : appLanguage() === "fr" ? "fr-FR" : appLanguage() === "es" ? "es-ES" : "en-US",
  );
  const timeText = $derived(now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }));
  const dateTimeText = $derived(
    `${now.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })} · ${timeText}`,
  );

  // Friendly greeting on launch: Nook waves in the Dynamic Island for 3.5 seconds with a soft chime.
  let greeting = $state<string | null>(null);
  $effect(() => {
    const h = new Date().getHours();
    const hello =
      h < 12
        ? tr("Goedemorgen!", "Good morning!")
        : h < 18
          ? tr("Goedemiddag!", "Good afternoon!")
          : tr("Goedenavond!", "Good evening!");
    greeting = hello;
    const t0 = setTimeout(() => play("greet", nook.settings?.sounds ?? true), 350);
    const t1 = setTimeout(() => (greeting = null), 3600);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  });

  // Live media progress (0..100) for the hairline bar at the bottom of the Dynamic Island pill.
  let mediaTick = $state(Date.now());
  $effect(() => {
    if (!playing?.playing || expanded) return;
    const t = setInterval(() => (mediaTick = Date.now()), 1_000);
    return () => clearInterval(t);
  });
  const mediaProgress = $derived.by(() => {
    if (!playing || !playing.duration || playing.duration <= 0 || playing.position == null) return null;
    const elapsed = playing.playing ? Math.max(0, (mediaTick - since) / 1000) : 0;
    return Math.min(100, Math.max(0, ((playing.position + elapsed) / playing.duration) * 100));
  });

  async function open(focus?: string) {
    clearTimeout(closeTimer);
    syncIslandPrefs(false);
    const wasExpanded = expanded;
    if (!expanded) {
      strip = false;
      expanded = true;
      greeting = null;
      play("open", nook.settings?.sounds ?? true);
      // Resizing and focusing the window can fire a blur of its own; that must not close the panel that is opening.
      openedAt = Date.now();
      await api.barExpand(true);
      // Het aanbod naast de balk zou het paneel bedekken; het staat ook in Vandaag.
      services.asideHide();
    }
    if (focus === "chat" || focus === "voice" || focus === "lookAlong") {
      tab = "nook";
      pinnedOpen = true;
    } else if (focus === "agents") {
      tab = "agents";
      pinnedOpen = true;
    } else if (focus === "agents-request" && !wasExpanded) {
      // A permission request or question: a closed bar opens on the agents; an open panel stays as it was and asks in
      // its compact bar under the tabs.
      tab = "agents";
      pinnedOpen = true;
    }
    if (focus === "voice") listening.start();
    if (focus?.startsWith("nook:")) {
      tab = "nook";
      pinnedOpen = true;
      await nook.select(focus.slice(5));
    }
    if (focus === "lookAlong") services.lookAlong().catch((e) => (nook.error = String(e)));
  }

  // Muziek: een eigen tab zolang er iets speelt.
  let playing = $state<NowPlaying | null>(null);
  let since = $state(Date.now());
  // De gekozen tab, of Nook als die tab er nu niet is (niets speelt, of geen terminals op dit platform).
  const shown = $derived<Tab>(
    (tab === "music" && !playing) ||
    (tab === "workspace" && nook.info && !nook.info.capabilities.terminals) ||
    (tab !== "nook" && tab !== "music" && hiddenTabs.includes(tab as HideableTab))
      ? "nook"
      : tab,
  );
  $effect(() => {
    services.nowPlaying().then((n) => ((playing = n), (since = Date.now()))).catch(() => {});
    const un = serviceEvents.onNowPlaying((n) => {
      playing = n;
      since = Date.now();
      if (!n && tab === "music") tab = "nook";
    });
    return () => {
      un.then((f) => f());
    };
  });

  // Geluiden: aandacht als een Nook op je wacht, klaar als hij af is.
  let statuses = new Map<string, string>();
  $effect(() => {
    const next = new Map(nook.nooks.map((n) => [n.id, n.status as string]));
    for (const [id, status] of next) {
      const before = statuses.get(id);
      if (before && before !== status) {
        if (status === "waiting") play("attention", nook.settings?.sounds ?? true);
        else if (before === "working" && (status === "unread" || status === "idle")) play("done", nook.settings?.sounds ?? true);
      }
    }
    statuses = next;
  });

  // The tray tooltip says how many Nooks wait on you (only the bar reports it, so it is said once).
  $effect(() => {
    api.trayStatus(nook.waiting, nook.working).catch(() => {});
  });

  // De ring om Nook in het open paneel: alles waar hij mee bezig is of wat op je wacht.
  const ring = $derived(
    nook.nooks
      .filter((n) => n.status === "working" || n.status === "waiting")
      .map((n) => ({ id: n.id, label: n.title, state: n.status as "working" | "waiting" })),
  );

  // Locked, the panel ignores a click elsewhere and a lost focus (handy while dragging attachments in from another window); only Esc closes it.
  async function close(force = false) {
    clearTimeout(hoverTimer);
    if (!expanded || (locked && !force)) return;
    expanded = false;
    pinnedOpen = false;
    locked = false;
    play("close", nook.settings?.sounds ?? true);
    await api.barExpand(false, false, false, wantWide);
    services.asideShow();
  }

  function enter() {
    inside = true;
    clearTimeout(closeTimer);
    if (!expanded && !strip && hoverOpen) {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        if (inside && !expanded) open();
      }, 240);
    }
  }

  function leave() {
    inside = false;
    clearTimeout(hoverTimer);
    // A notice closes the bar itself, once its countdown has run out with the pointer off the bar.
    if (resizing || pinnedOpen || nook.busy || agents.pending || agents.attention || whatsapp.chat) return;
    // Both the pointer and a notice that ran out call this; a second timer must not orphan the first.
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => close(), 450);
  }

  // The closed bar only opens on a click; it then stays open until Esc, a click elsewhere or the window loses focus.
  // The pill opens the panel on what it is showing: the song, the timer, the agent, or the next event.
  function openPillTarget() {
    if (showMediaInPill) void openByClick("music");
    else if (showTimerInPill) void openByClick("focus");
    else if (showAgentInPill) void openByClick("agents", activeAgents[0]?.id);
    else if (showEventInPill) void openByClick("home");
    else void openByClick();
  }

  async function openByClick(targetTab?: Tab, agentId?: string) {
    pinnedOpen = true;
    if (agentId) agents.select(agentId);
    if (targetTab) select(targetTab);
    await open();
  }

  // A file dragged onto the closed round Nook: he looks up while it hovers, swallows it on the drop, and then the panel
  // opens with the file in the field. (The bar's webview has the native drag-drop handler off, so these are web events.)
  let dropping = $state(false);
  let swallowed = $state(false);
  let dragDepth = 0;
  const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;

  function dragEnter(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    dropping = true;
  }

  function dragOver(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  function dragLeave() {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropping = false;
  }

  async function drop(e: DragEvent) {
    e.preventDefault();
    dragDepth = 0;
    dropping = false;
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    swallowed = true;
    heard();
    play("swallow", nook.settings?.sounds ?? true);
    const reading = barDraft.addFiles(files);
    await new Promise((r) => setTimeout(r, 520));
    swallowed = false;
    await openByClick();
    await reading;
  }

  // One click moves the interface (and Nook's answers, unless they follow the question) to the next language.

  // "Laat Nook antwoorden" on a WhatsApp card: the new Nook opens in the Nook tab.
  function openNookFromCard(id: string) {
    select("nook");
    pinnedOpen = true;
    nook.select(id);
  }

  // The right-hand column of the Nook tab: the chat history (as on the Mac) or Today.
  let side = $state<"history" | "today">(localStorage.getItem("bar.side") === "today" ? "today" : "history");
  function pickSide(next: "history" | "today") {
    side = next;
    try {
      localStorage.setItem("bar.side", next);
    } catch {
      // Not remembered; the column still switches.
    }
  }

  function select(t: Tab) {
    tab = t;
    localStorage.setItem("bar.tab", t);
  }

  /// Opens what Home points at: a tab of the bar when it has one, otherwise the page in the main window.
  async function go(target: Target) {
    pinnedOpen = true;
    try {
      switch (target.kind) {
        case "route":
          if (target.route === "chat") return select("nook");
          if (target.route === "agents") return select("agents");
          if (target.route === "workspace" && nook.info?.capabilities.terminals) return select("workspace");
          return await api.showMain(target.route);
        case "settings":
          localStorage.setItem("settings.section", target.section);
          return await api.showMain("settings");
        case "workspace":
          localStorage.setItem("ws.page", target.page);
          return select("workspace");
        case "agents":
          agents.select(target.select);
          return select("agents");
        case "nook":
          select("nook");
          return await nook.select(target.id);
        case "newNook":
          select("nook");
          await nook.newNook();
          if (target.ask) await nook.ask(target.ask);
          return;
      }
    } catch (e) {
      nook.error = String(e);
    }
  }

  // The window has no frame, so its own resize border is a hairline: the open panel carries its own grips on the edges
  // and corners (the top edge is where the bar hangs, so it has none).
  const grips = ["left", "right", "bottom", "bottom-left", "bottom-right"] as const;

  // The panel resizes itself: a grip captures the pointer and sets the window's size while it moves. (The system's own
  // resize drag takes the focus and mouse from the page, so the panel closed under the user's hand and left the round
  // Nook stretched over the whole window.) `resizing` also keeps a stray blur from closing the panel meanwhile.
  let resizing = $state(false);
  const MIN = { w: 480, h: 320 };

  // The outermost pixels of the window belong to the system's own resize border, which sits outside the page, so a
  // drag there takes the focus before any grip sees it. Such a drag is told apart by the window resizing right after
  // the blur: the close waits a moment and is dropped when the size changes or the focus comes back meanwhile.
  let lastResize = 0;
  $effect(() => {
    const off = getCurrentWindow().onResized(() => (lastResize = Date.now()));
    return () => void off.then((f) => f());
  });
  function blurClose() {
    if (barDraft.picking || resizing || Date.now() - openedAt <= 600) return;
    const blurredAt = Date.now();
    setTimeout(() => {
      if (resizing || lastResize >= blurredAt - 100 || document.hasFocus()) return;
      close();
    }, 250);
  }

  function resize(e: PointerEvent, grip: (typeof grips)[number]) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    resizing = true;
    const start = { x: e.screenX, y: e.screenY, w: window.innerWidth, h: window.innerHeight, left: window.screenX, top: window.screenY };
    const win = getCurrentWindow();
    let frame = 0;
    let next: { w: number; h: number; left: number } | null = null;

    const apply = async () => {
      frame = 0;
      if (!next) return;
      const { w, h, left } = next;
      next = null;
      await win.setSize(new LogicalSize(w, h));
      if (grip.includes("left")) await win.setPosition(new LogicalPosition(left, start.top));
    };
    const move = (m: PointerEvent) => {
      const dx = m.screenX - start.x;
      const dy = m.screenY - start.y;
      let w = start.w;
      let h = start.h;
      if (grip.includes("right")) w = start.w + dx;
      if (grip.includes("left")) w = start.w - dx;
      if (grip.includes("bottom")) h = start.h + dy;
      w = Math.max(MIN.w, w);
      h = Math.max(MIN.h, h);
      next = { w, h, left: start.left + (start.w - w) };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setTimeout(() => (resizing = false), 300);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  // The closed pill leans a little toward the pointer, like a card under your finger (drawn in 3D by the Neon island).
  function tilt(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--tilt-x", `${(-y * 14).toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${(x * 10).toFixed(2)}deg`);
    el.style.setProperty("--shine-x", `${((x + 0.5) * 100).toFixed(1)}%`);
  }
  function untilt(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  }

  // Floating: the user drags the bar anywhere. On macOS `startDragging` returns when the mouse is let go, but on Windows
  // it returns at once and the move happens afterwards, so saving right after it stored the old spot and the bar jumped
  // back on the next hover. The spot is saved once the window has stopped moving after a drag instead.
  let dragUntil = 0;
  let saveMove: ReturnType<typeof setTimeout> | undefined;
  // A drag only starts once the pointer has moved a few pixels with the button held: on Windows `startDragging` takes the
  // mouse at once and swallows the click, so starting it on every press made the tabs, the header buttons and a click
  // on the pill itself do nothing. Buttons and fields never start a drag.
  const DRAG_THRESHOLD = 4;
  let pressAt: { x: number; y: number } | null = null;
  function drag(e: MouseEvent) {
    if (!floating || e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.closest("button, a, input, select, textarea, [contenteditable]")) return;
    pressAt = { x: e.screenX, y: e.screenY };
    window.addEventListener("mousemove", dragMove);
    window.addEventListener("mouseup", dragEnd);
  }
  function dragMove(e: MouseEvent) {
    if (!pressAt) return;
    if ((e.buttons & 1) === 0) return dragEnd();
    if (Math.hypot(e.screenX - pressAt.x, e.screenY - pressAt.y) < DRAG_THRESHOLD) return;
    dragEnd();
    dragUntil = Date.now() + 1500;
    void getCurrentWindow().startDragging();
  }
  function dragEnd() {
    pressAt = null;
    window.removeEventListener("mousemove", dragMove);
    window.removeEventListener("mouseup", dragEnd);
  }
  $effect(() => {
    if (!floating) return;
    const off = getCurrentWindow().onMoved(() => {
      // Only moves that follow a drag count; moves Kimily makes itself (opening, closing) don't.
      if (Date.now() > dragUntil) return;
      dragUntil = Date.now() + 1500;
      clearTimeout(saveMove);
      saveMove = setTimeout(() => void api.barMoved(), 250);
    });
    return () => {
      clearTimeout(saveMove);
      off.then((f) => f());
    };
  });

  // Agents: geluiden in de balk, en het kaartje "klaar" klapt hem even open (tot je ernaar wijst).
  $effect(() => {
    agents.sounds = true;
    agents.start();
  });
  // A notice stays for its countdown with the pointer off the bar (hovering holds it), or until OK, View or Esc.
  // Detailed opens the panel with a card; compact widens the closed bar into one line.
  $effect(() => {
    const card = agents.attention;
    // While you share your screen or sit in a meeting and chose quiet: the Agents tab shows it, the bar does not pop open.
    if (!card || untrack(() => quiet.silent)) return;
    untrack(() => {
      if (expanded) return;
      if (noticeCompact) {
        strip = true;
        api.barExpand(false, true);
      } else {
        openedForNotice = true;
        open();
      }
    });
    const clock = new Countdown();
    noticeLeft = 1;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      clock.advance((now - last) / 1000, inside);
      last = now;
      noticeLeft = clock.fraction;
      if (clock.done && agents.attention === card) agents.attention = null;
    }, 100);
    return () => {
      clearInterval(timer);
      // A newer notice took its place: it carries on from here.
      if (agents.attention) return;
      noticeLeft = null;
      openedForNotice = false;
      if (strip) {
        strip = false;
        if (!expanded) api.barExpand(false);
      }
      if (expanded && !inside) leave();
    };
  });

  function dismissNotice() {
    agents.attention = null;
  }

  function viewNotice(id: string) {
    agents.attention = null;
    agents.select(id);
    select("agents");
    pinnedOpen = true;
    open();
  }

  // WhatsApp: a new message never opens the bar by itself. The closed bar shows a chip under the round Nook ("Bericht
  // van Peter"); once the panel is open (by the chip or any other way) the card of that chat shows in it.
  $effect(() => {
    whatsapp.start();
  });
  $effect(() => {
    const waiting = whatsapp.pending;
    if (waiting && expanded) untrack(() => whatsapp.show(waiting.chat));
  });
  const chipName = $derived(whatsapp.pending?.name ?? whatsapp.card?.conversation.name ?? "");
  const chipVisible = $derived(!expanded && !strip && !!chipName && !quiet.silent);
  const activeAgents = $derived(agents.sessions.filter((s) => s.status === "running" || s.status === "waiting"));
  const showMediaInPill = $derived(!!playing && (islandDisplay === "pill" || islandDisplay === "media"));
  const showTimerInPill = $derived(!showMediaInPill && focusTimer.active && islandDisplay !== "orb");
  const showAgentInPill = $derived(!showMediaInPill && !showTimerInPill && islandDisplay === "pill" && (agents.pending > 0 || activeAgents.length > 0));
  const showEventInPill = $derived(!showMediaInPill && !showTimerInPill && !showAgentInPill && !!nextEvent && islandDisplay !== "orb");
  const notched = $derived(!floating && (expanded || (strip && agents.attention) || (islandDisplay !== "orb" && !chipVisible)));

  // What the closed pill is showing; a change slides the new content in instead of swapping it.
  const pillMode = $derived(
    greeting ? "greeting" : showMediaInPill ? "media" : showTimerInPill ? "timer" : showAgentInPill ? "agent" : showEventInPill ? "event" : "idle",
  );
  const wantWide = $derived(islandDisplay !== "orb" && (showMediaInPill || showTimerInPill || showAgentInPill || showEventInPill || (islandDisplay === "time" && !!weather)));
  const tucked = $derived(
    hideWhenIdle && !expanded && !strip && !chipVisible && !inside && !dropping && !showMediaInPill && !showTimerInPill && !showAgentInPill && !showEventInPill && !nook.working && !nook.waiting && !barDraft.files,
  );
  // Keep the closed Dynamic Island window width in sync with whether media or active agents are shown.
  let wideSized = false;
  $effect(() => {
    const wide = wantWide;
    const isClosed = !expanded && !strip && !chipVisible;
    const mode = islandDisplay;
    untrack(() => {
      if (isClosed && (wide !== wideSized || mode !== "orb")) {
        wideSized = wide;
        api.barExpand(false, false, false, wide);
      }
    });
  });
  // The window makes room under the round Nook while the chip shows, and goes back to the round size when it leaves.
  let chipSized = false;
  $effect(() => {
    const want = chipVisible;
    untrack(() => {
      if (want && !chipSized) {
        chipSized = true;
        api.barExpand(false, false, true);
      } else if (!want && chipSized) {
        chipSized = false;
        if (!expanded && !strip) api.barExpand(false, false, false, wantWide);
      }
    });
  });

  // Escape first shrinks an enlarged photo, then closes the WhatsApp card, then the bar.
  function escape() {
    if (whatsapp.enlarged) whatsapp.enlarged = null;
    else if (whatsapp.chat) whatsapp.dismiss();
    else {
      if (agents.attention) dismissNotice();
      close(true);
    }
  }

  $effect(() => {
    attachments.start();
    const un = events.onBarOpen((focus) => open(focus));
    return () => {
      un.then((f) => f());
    };
  });
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && escape()} onblur={blurClose} onfocus={() => setTimeout(() => (barDraft.picking = false), 300)} />

<div class="bar island-theme-{islandTheme} neon-rim-{neonRim}" class:notched class:expanded class:floating class:hasChip={chipVisible} role="region" onmouseenter={enter} onmouseleave={leave}>
  {#if notched}
    <span class="shoulder left" aria-hidden="true"></span>
    <span class="shoulder right" aria-hidden="true"></span>
  {/if}
  {#if !expanded && strip && agents.attention}
    {@const card = agents.attention}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="pill strip" onmousedown={drag}>
      <NoticeMark tone={noticeTone(card.status)} size={card.status === "done" || card.status === "failed" ? 13 : 15} />
      <span class="message">{compactNotice(card.name, card.project, card.status)}</span>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span class="stripbuttons" onmousedown={(e) => e.stopPropagation()}>
        <button class="ghost" onclick={() => viewNotice(card.id)}>{tr("Bekijk", "View")}</button>
        <NoticeOk compact left={noticeLeft} onclick={dismissNotice} />
      </span>
    </div>
  {:else if !expanded && islandDisplay !== "orb" && !chipVisible}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="pill island"
      onpointermove={tilt}
      onpointerleave={untilt}
      class:wide={wantWide}
      class:tucked
      class:grooving={showMediaInPill && !!playing?.playing}
      class:busy={showAgentInPill || (showTimerInPill && focusTimer.running)}
      class:dropping
      class:swallowed
      role="button"
      tabindex="0"
      title={barDraft.files ? tr("Open Nook (er wachten bestanden)", "Open Nook (files waiting)") : tr("Open Nook, of sleep een bestand op mij", "Open Nook, or drop a file on me")}
      onmousedown={drag}
      onclick={openPillTarget}
      onkeydown={(e) => (e.key === "Enter" || e.key === " ") && openPillTarget()}
      ondragenter={dragEnter}
      ondragover={dragOver}
      ondragleave={dragLeave}
      ondrop={drop}
    >
      {#key pillMode}
        <span class="island-stage" in:fly={{ y: 6, duration: motion(260), easing: cubicOut }}>
        {#if greeting}
          <span class="island-left">
            <span class="orbwrap"><Orb size={20} mood="idle" happy /></span>
          </span>
          <span class="island-greeting">{greeting}</span>
        {:else if showMediaInPill && playing}
          <span class="island-left">
            {#if playing.artwork}
              <img class="island-art" src={playing.artwork} alt="" />
            {:else}
              <span class="orbwrap"><Orb size={20} mood={dropping ? "seen" : mood} happy={playing.playing} /></span>
            {/if}
            <span class="eq" class:active={playing.playing} aria-hidden="true"><span></span><span></span><span></span></span>
          </span>
          <span class="island-title">{playing.title}</span>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="island-controls" onmousedown={(e) => e.stopPropagation()} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <button class="island-btn" title={tr("Afspelen of pauzeren", "Play or pause")} onclick={() => services.media("playPause")}><Ico name={playing.playing ? "pause" : "play"} size={12} fill="currentColor" stroke={0} /></button>
            <button class="island-btn" title={tr("Volgende nummer", "Next track")} onclick={() => services.media("next")}><Ico name="skip-forward" size={12} fill="currentColor" stroke={0} /></button>
          </span>
          {#if mediaProgress !== null}
            <span class="island-progress" style="width: {mediaProgress}%"></span>
          {/if}
        {:else if showTimerInPill}
          <span class="island-left">
            <span class="orbwrap"><Orb size={20} mood={focusTimer.finished ? "seen" : mood} happy={focusTimer.finished} /></span>
            <span class="dot {focusTimer.finished ? 'unread' : focusTimer.running ? 'working' : 'waiting'}"></span>
          </span>
          <span class="island-title">
            {#if focusTimer.finished}
              {tr("Klaar!", "Time's up!")}
            {:else if focusTimer.label}
              {focusTimer.formatted} · {focusTimer.label}
            {:else}
              {focusTimer.formatted}
            {/if}
          </span>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="island-controls" onmousedown={(e) => e.stopPropagation()} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <button class="island-btn" title={focusTimer.running ? tr("Pauzeren", "Pause") : tr("Hervatten", "Resume")} onclick={() => focusTimer.toggle()}><Ico name={focusTimer.running ? "pause" : "play"} size={12} fill="currentColor" stroke={0} /></button>
            <button class="island-btn" title={tr("Reset", "Reset")} onclick={() => focusTimer.reset()}><Ico name="rotate-ccw" size={12} /></button>
          </span>
          <span class="island-progress" style="width: {focusTimer.progress}%"></span>
        {:else if showAgentInPill}
          <span class="island-left">
            <span class="orbwrap"><Orb size={20} mood={dropping ? "seen" : mood} /></span>
            <span class="dot {agents.pending > 0 ? 'waiting' : 'working'}"></span>
          </span>
          <span class="island-title">
            {#if agents.pending > 0}
              {tr("{n} wacht", "{n} waiting", { n: agents.pending })}
            {:else}
              {activeAgents[0]?.name}
            {/if}
          </span>
          <span class="island-clock dim">{timeText}</span>
        {:else if showEventInPill && nextEvent}
          <span class="island-left">
            <span class="orbwrap"><Orb size={20} mood={dropping ? "seen" : mood} /></span>
            <span class="dot waiting"></span>
          </span>
          <span class="island-title">
            {#if nextEvent.minutes <= 0}
              {tr("Nu · {title}", "Now · {title}", { title: nextEvent.title })}
            {:else}
              {tr("over {n}m · {title}", "in {n}m · {title}", { n: nextEvent.minutes, title: nextEvent.title })}
            {/if}
          </span>
          <span class="island-clock dim">{timeText}</span>
        {:else}
          <span class="island-left strolling">
            <span class="orbwrap"><Orb size={20} mood={dropping ? "seen" : mood} alive /></span>
            {#if nook.waiting}<span class="dot waiting"></span>{:else if nook.working}<span class="dot working"></span>{/if}
          </span>
          <span class="island-right">
            {#if weather}
              <span class="island-weather" title="{weather.place} · {Math.round(weather.temp)} °C">{weather.icon} {Math.round(weather.temp)}°</span>
            {/if}
            <span class="island-clock">{islandDisplay === "time" ? dateTimeText : timeText}</span>
            {#if barDraft.files}<span class="island-badge">{barDraft.files}</span>{/if}
          </span>
        {/if}
        </span>
      {/key}
    </div>
  {:else if !expanded}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="pill round"
      class:tucked
      class:dropping
      class:swallowed
      role="button"
      tabindex="0"
      title={barDraft.files ? tr("Open Nook (er wachten bestanden)", "Open Nook (files waiting)") : tr("Open Nook, of sleep een bestand op mij", "Open Nook, or drop a file on me")}
      onmousedown={drag}
      onclick={() => openByClick()}
      onkeydown={(e) => (e.key === "Enter" || e.key === " ") && openByClick()}
      ondragenter={dragEnter}
      ondragover={dragOver}
      ondragleave={dragLeave}
      ondrop={drop}
    >
      <span class="orbwrap"><Orb size={26} mood={dropping ? "seen" : mood} /></span>
      {#if barDraft.files}<span class="badge">{barDraft.files}</span>{/if}
      {#if nook.working}<span class="dot working corner"></span>{/if}
      {#if nook.waiting}<span class="dot waiting corner"></span>{/if}
    </div>
    {#if chipVisible}
      <div class="chip">
        <button class="chiptext" title={tr("Open Nook", "Open Nook")} onclick={() => openByClick()}>
          {tr("Bericht van {name}", "Message from {name}", { name: chipName })}
        </button>
        <button class="chipclose" title={tr("Sluiten", "Dismiss")} aria-label={tr("Sluiten", "Dismiss")} onclick={() => whatsapp.dismiss()}>×</button>
      </div>
    {/if}
  {:else}
    <div class="panel">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <header onmousedown={drag}>
        <Orb size={20} {mood} {ring} movable alive onpiece={(id) => { select("nook"); nook.select(id); }} />
        <nav bind:this={navEl} class:glide={glider.ready} onwheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.currentTarget.scrollLeft += e.deltaY; } }}>
          <span class="tab-glider" aria-hidden="true" style="transform: translateX({glider.x}px); width: {glider.w}px"></span>
          {#if tabVisible("home")}<button class:on={shown === "home"} onclick={() => select("home")}>Home</button>{/if}
          <button class:on={shown === "nook"} onclick={() => select("nook")}>Kimily {#if nook.waiting}<span class="dot waiting"></span>{/if}</button>
          {#if tabVisible("tasks")}<button class:on={shown === "tasks"} onclick={() => select("tasks")}>{tr("Taken", "Tasks")} {#if openTaskCount}<span class="tab-count">{openTaskCount}</span>{/if}</button>{/if}
          {#if tabVisible("focus")}<button class:on={shown === "focus"} onclick={() => select("focus")}>{tr("Focus", "Focus")} {#if focusTimer.running}<span class="tab-count">{focusTimer.formatted}</span>{/if}</button>{/if}
          {#if tabVisible("notes")}<button class:on={shown === "notes"} onclick={() => select("notes")}>{tr("Notities", "Notes")}</button>{/if}
          {#if tabVisible("tray")}<button class:on={shown === "tray"} onclick={() => select("tray")}>{tr("Plank", "Shelf")} {#if fileTray.count}<span class="tab-count">{fileTray.count}</span>{/if}</button>{/if}
          {#if tabVisible("chats")}<button class:on={shown === "chats"} onclick={() => select("chats")}>{tr("Chats", "Chats")}</button>{/if}
          {#if tabVisible("agents")}<button class:on={shown === "agents"} onclick={() => select("agents")}>{tr("Agents", "Agents")} {#if agents.pending}<span class="dot waiting"></span>{/if}</button>{/if}
          {#if tabVisible("workspace") && nook.info?.capabilities.terminals}
            <button class:on={shown === "workspace"} onclick={() => select("workspace")}>{tr("Werkruimte", "Workspace")}</button>
          {/if}
          {#if tabVisible("commands")}<button class:on={shown === "commands"} onclick={() => select("commands")}>{tr("Commando's", "Commands")}</button>{/if}
          {#if playing}
            <button class:on={shown === "music"} onclick={() => select("music")}>{tr("Muziek", "Music")} {#if playing.playing}<span class="dot unread"></span>{/if}</button>
          {/if}
        </nav>
        <span class="spacer"></span>
        <button class="ghost icon lock" class:on={locked} title={locked ? tr("Vergrendeld: klik om te ontgrendelen", "Locked: click to unlock") : tr("Houd Nook open als je wegklikt", "Keep Nook open when you click away")} onclick={() => { locked = !locked; if (locked) pinnedOpen = true; }}><Icon name={locked ? "lock" : "unlock"} size={14} /></button>
        <button class="ghost icon" title={tr("Verder in het venster (dit gesprek)", "Continue in the window (this conversation)")} onclick={() => api.showMain(nook.activeId ? `nook:${nook.activeId}` : "chat")}>⧉</button>
        <button class="ghost icon" title={tr("Instellingen", "Settings")} onclick={() => api.showMain("settings")}>⚙</button>
        <button class="ghost icon close-btn" title={tr("Eiland inklappen", "Fold island")} aria-label={tr("Eiland inklappen", "Fold island")} onclick={() => close(true)}>×</button>
      </header>
      <AgentAlerts
        requests={shown !== "agents"}
        left={noticeLeft}
        compact={noticeCompact}
        ondismiss={dismissNotice}
        onview={(id) => { agents.select(id); select("agents"); pinnedOpen = true; }}
      />
      {#if shown !== "chats"}
        <WhatsAppCard onnook={openNookFromCard} />
      {/if}
      <div class="body">
        {#key shown}
          <div class="pane" in:fade={{ duration: motion(160) }}>
            {#if shown === "home"}
              <Home compact onopen={go} />
            {:else if shown === "nook"}
              <div class="nooktab">
                <div class="chatcol"><Chat compact autofocus={pinnedOpen} /></div>
                <div class="side">
                  <div class="sidetabs" role="tablist">
                    <button role="tab" aria-selected={side === "history"} class:on={side === "history"} onclick={() => pickSide("history")}>{tr("Geschiedenis", "History")}</button>
                    <button role="tab" aria-selected={side === "today"} class:on={side === "today"} onclick={() => pickSide("today")}>{tr("Vandaag", "Today")}</button>
                  </div>
                  <div class="sidebody">{#if side === "history"}<NookHistory />{:else}<Today />{/if}</div>
                </div>
              </div>
            {:else if shown === "tasks"}
              <Tasks onchange={(n) => (openTaskCount = n)} />
            {:else if shown === "focus"}
              <Focus />
            {:else if shown === "notes"}
              <Notes ontask={refreshTasks} />
            {:else if shown === "tray"}
              <Tray onsend={() => { select("nook"); pinnedOpen = true; }} />
            {:else if shown === "chats"}
              <Chats onnook={openNookFromCard} />
            {:else if shown === "agents"}
              <Agents compact />
            {:else if shown === "commands"}
              <Commands onuse={(text) => { barDraft.text = text; select("nook"); pinnedOpen = true; }} />
            {:else if shown === "music" && playing}
              <Music info={playing} {since} />
            {:else}
              <Workspace compact />
            {/if}
          </div>
        {/key}
      </div>
      {#each grips as g (g)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="grip {g}" onpointerdown={(e) => resize(e, g)}></div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .bar { width: 100vw; height: 100vh; display: flex; justify-content: center; align-items: flex-start; box-sizing: border-box; }
  /* The notch's shoulders: the window is the island plus one shoulder each side, and each shoulder is the island's
     color with a quarter circle cut out of its lower outer corner, its rim drawn along the curve. */
  .bar.notched { --sh: var(--island-shoulder); position: relative; padding: 0 var(--sh); }
  .bar.notched.expanded { --sh: var(--island-shoulder-panel); }
  .shoulder {
    position: absolute;
    top: 0;
    width: var(--sh);
    height: var(--sh);
    pointer-events: none;
    z-index: 1;
    animation: shoulder-in 0.32s ease-out;
  }
  .shoulder.left {
    left: 0;
    background: radial-gradient(circle at 0 100%, transparent calc(var(--sh) - 1.5px), var(--island-edge) calc(var(--sh) - 1px), var(--island-edge) calc(var(--sh) - 0.5px), var(--notch) var(--sh));
  }
  .shoulder.right {
    right: 0;
    background: radial-gradient(circle at 100% 100%, transparent calc(var(--sh) - 1.5px), var(--island-edge) calc(var(--sh) - 1px), var(--island-edge) calc(var(--sh) - 0.5px), var(--notch) var(--sh));
  }
  @keyframes shoulder-in { from { opacity: 0; } }
  .bar.hasChip { flex-direction: column; align-items: center; gap: 4px; }
  .bar.hasChip .pill.round { width: 44px; height: 44px; flex: none; }
  /* The chat chip under the closed round Nook: who wrote, one click opens Nook. */
  .chip {
    display: flex;
    align-items: center;
    max-width: 100%;
    box-sizing: border-box;
    height: 30px;
    background: var(--notch);
    border: 2px solid #000;
    border-radius: 999px;
    overflow: hidden;
    animation: drop 0.25s ease-out;
  }
  .chip button { background: transparent; border: 0; color: var(--paper); font-size: 12px; font-weight: 600; cursor: pointer; }
  .chiptext { padding: 0 6px 0 12px; height: 100%; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chipclose { padding: 0 10px 0 4px; height: 100%; color: var(--text3); font-size: 15px; }
  .chipclose:hover { color: var(--paper); }
  .pill {
    height: 100%;
    width: 100%;
    background: var(--notch);
    border-radius: 0 0 var(--radius-island) var(--radius-island);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: default;
  }
  .floating .pill { border-radius: 999px; cursor: grab; }
  /* Dynamic Island pill (Coucou-inspired): sleek notch capsule with clock, live media controls, and agent status. */
  .pill.island {
    position: relative;
    box-sizing: border-box;
    justify-content: space-between;
    padding: 0 12px 0 10px;
    border-radius: 0 0 var(--radius-island) var(--radius-island);
    border: 1px solid var(--island-edge);
    border-top: 0;
    cursor: pointer;
    overflow: hidden;
    transition:
      border-color var(--motion-hover),
      background var(--motion-hover),
      box-shadow var(--motion-hover),
      transform 0.28s cubic-bezier(0.2, 1, 0.3, 1),
      opacity 0.24s ease;
  }
  .pill.island.tucked,
  .pill.round.tucked {
    transform: translateY(-28px);
    opacity: 0.28;
  }
  .floating .pill.island.tucked,
  .floating .pill.round.tucked {
    transform: scale(0.85);
    opacity: 0.22;
  }
  .pill.island.grooving .island-art,
  .pill.island.grooving .orbwrap {
    animation: groove 1.1s ease-in-out infinite alternate;
  }
  @keyframes groove {
    from { transform: scale(1) translateY(0); }
    to { transform: scale(1.06) translateY(-1px); }
  }
  .island-progress {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--mint), var(--orb-base));
    box-shadow: 0 0 8px var(--mint);
    border-radius: 0 999px 999px 0;
    pointer-events: none;
    transition: width 0.9s linear;
  }
  @media (prefers-reduced-motion: reduce) {
    .pill.island.grooving .island-art,
    .pill.island.grooving .orbwrap { animation: none; }
  }
  .floating .pill.island {
    border-radius: 999px;
    border-top: 1px solid var(--island-edge);
    box-shadow: var(--island-shadow);
  }
  .pill.island:hover {
    border-color: var(--island-edge-hover);
    box-shadow: 0 6px 22px -8px var(--island-glow), inset 0 -1px 0 var(--island-glow);
  }
  .pill.island:active { transform: scale(0.985); }
  /* What the pill shows (media, timer, agent, event, clock) slides in as one piece when it changes. */
  .island-stage {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  /* A running agent or timer: a slow light that runs along the rim, so the pill reads as busy from the corner of your eye. */
  .pill.island.busy::before {
    content: "";
    position: absolute;
    inset: auto 0 0 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--island-edge-hover), transparent);
    background-size: 40% 100%;
    background-repeat: no-repeat;
    animation: rim-run 2.6s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes rim-run {
    from { background-position: -40% 0; }
    to { background-position: 140% 0; }
  }
  .pill.island.dropping {
    border-color: var(--iris);
    box-shadow: inset 0 0 0 1px var(--iris);
  }
  .pill.island.swallowed .orbwrap { animation: gulp 0.52s cubic-bezier(0.3, 1.4, 0.5, 1); }
  .island-left { display: flex; align-items: center; gap: 6px; flex: none; }
  .island-left.strolling .orbwrap { animation: island-stroll 14s ease-in-out infinite; }
  .pill.island:hover .island-left.strolling .orbwrap { animation: hop 0.6s cubic-bezier(0.3, 1.5, 0.5, 1) 1; }
  @keyframes island-stroll {
    0%, 28% { transform: translateX(0) translateY(0); }
    35% { transform: translateX(7px) translateY(-2.5px); }
    42%, 62% { transform: translateX(13px) translateY(0); }
    69% { transform: translateX(6px) translateY(-2.5px); }
    76%, 100% { transform: translateX(0) translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .island-left.strolling .orbwrap { animation: none; }
  }
  .island-right { display: flex; align-items: center; gap: 8px; flex: none; }
  .island-weather {
    font: var(--text-label);
    color: var(--text2);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .island-art { width: 20px; height: 20px; border-radius: var(--radius-chip); object-fit: cover; flex: none; }
  .island-title {
    flex: 1;
    min-width: 0;
    font: var(--text-detail);
    font-weight: 500;
    color: var(--paper);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
  }
  .island-greeting {
    flex: 1;
    font: var(--text-detail);
    font-weight: 600;
    color: var(--paper);
    text-align: right;
    white-space: nowrap;
  }
  .island-clock {
    font: var(--text-detail);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--paper);
    letter-spacing: 0.01em;
    white-space: nowrap;
  }
  .island-clock.dim { color: var(--text3); font: var(--text-caption); }
  .island-controls { display: flex; align-items: center; gap: 2px; flex: none; }
  .island-btn {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    border: 0;
    background: transparent;
    color: var(--text2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    transition: background var(--motion-quick), color var(--motion-quick), transform var(--motion-quick);
  }
  .island-btn:hover { background: color-mix(in srgb, var(--paper) 14%, transparent); color: var(--paper); }
  .island-btn:active { transform: scale(0.88); }
  .island-badge {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--iris);
    color: var(--on-iris);
    font: var(--text-caption);
    font-weight: 700;
    line-height: 16px;
    text-align: center;
  }
  .eq { display: inline-flex; align-items: flex-end; gap: 2px; height: 11px; width: 11px; }
  .eq span { width: 2px; height: 3px; border-radius: 999px; background: var(--mint); transition: height 0.2s ease; }
  .eq.active span:nth-child(1) { animation: eqbar 0.7s ease-in-out infinite alternate; }
  .eq.active span:nth-child(2) { animation: eqbar 0.55s ease-in-out 0.15s infinite alternate; }
  .eq.active span:nth-child(3) { animation: eqbar 0.8s ease-in-out 0.3s infinite alternate; }
  @keyframes eqbar { from { height: 3px; } to { height: 11px; } }
  @media (prefers-reduced-motion: reduce) { .eq.active span { animation: none; height: 7px; } }
  .close-btn { line-height: 1; color: var(--text3); }
  .close-btn:hover { color: var(--paper); }
  /* The closed bar is a small round Nook with a thick black rim, so it stays out of the way of the browser's tabs. */
  .pill.round {
    position: relative;
    box-sizing: border-box;
    border: 3px solid #000;
    border-radius: 50%;
    gap: 0;
    overflow: hidden;
    cursor: pointer;
    transition: box-shadow 0.25s ease;
  }
  .pill.round:hover { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--paper) 35%, transparent); }
  .pill.round:active .orbwrap { transform: scale(0.88); }
  .orbwrap { display: flex; transition: transform 0.15s ease; }
  /* Hovering the closed bar: a small hop, as if Nook noticed you. */
  .pill.round:hover .orbwrap { animation: hop 0.7s cubic-bezier(0.3, 1.5, 0.5, 1); }
  @keyframes hop {
    0% { transform: translateY(0) scale(1); }
    30% { transform: translateY(-4px) scale(1.18); }
    60% { transform: translateY(1px) scale(0.94); }
    100% { transform: translateY(0) scale(1.06); }
  }
  @media (prefers-reduced-motion: reduce) { .pill.round:hover .orbwrap { animation: none; } }
  /* A file over Nook: the rim lights up, a dashed ring turns around him and he leans in. */
  .pill.round.dropping { box-shadow: 0 0 0 3px var(--iris), 0 0 18px color-mix(in srgb, var(--iris) 60%, transparent); }
  .pill.round.dropping::after {
    content: "";
    position: absolute;
    inset: 2px;
    border-radius: 50%;
    border: 2px dashed var(--iris);
    animation: spin 2.4s linear infinite;
    pointer-events: none;
  }
  .pill.round.dropping .orbwrap { transform: scale(1.22) translateY(-1px); }
  @keyframes spin { to { transform: rotate(360deg); } }
  /* The drop: a gulp (squash, then a happy bounce). */
  .pill.round.swallowed .orbwrap { animation: gulp 0.52s cubic-bezier(0.3, 1.4, 0.5, 1); }
  @keyframes gulp {
    0% { transform: scale(1.22); }
    35% { transform: scale(0.7, 1.15); }
    65% { transform: scale(1.18, 0.86); }
    100% { transform: scale(1); }
  }
  /* How many files are waiting in the field of the closed bar. */
  .badge {
    position: absolute;
    bottom: 1px;
    right: 1px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    box-sizing: border-box;
    border-radius: 999px;
    background: var(--iris);
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    line-height: 14px;
    text-align: center;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .pill.round.dropping::after, .pill.round.swallowed .orbwrap { animation: none; }
  }
  .dot.corner { position: absolute; top: 3px; right: 3px; }
  /* A compact notice in the bar's own row: mark and message on the left, View and the countdown OK on the right. */
  .pill.strip { justify-content: flex-start; gap: 8px; padding: 0 4px 0 14px; }
  .strip .message { flex: 1; min-width: 0; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stripbuttons { display: flex; align-items: center; gap: 4px; flex: none; }
  .stripbuttons .ghost { padding: 4px 10px; font-size: 12px; }
  /* Island themes (Settings › Appearance › Island theme) come from app.css (`.island-theme-*`): rim, glow and frost. */
  .pill.island,
  .panel {
    border-color: var(--island-edge);
    backdrop-filter: var(--island-blur);
  }
  .panel {
    width: 100%;
    height: 100%;
    background: var(--notch);
    border: 1px solid var(--island-edge);
    border-top: 0;
    box-sizing: border-box;
    border-radius: 0 0 var(--radius-island-panel) var(--radius-island-panel);
    box-shadow: var(--island-shadow);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: drop 0.56s cubic-bezier(0.34, 1.32, 0.5, 1);
    transform-origin: top center;
    position: relative;
  }
  .grip { position: absolute; z-index: 5; touch-action: none; }
  .grip.left, .grip.right { top: 12px; bottom: 12px; width: 8px; cursor: ew-resize; }
  .grip.left { left: 0; }
  .grip.right { right: 0; }
  .grip.bottom { left: 12px; right: 12px; bottom: 0; height: 8px; cursor: ns-resize; }
  .grip.bottom-left, .grip.bottom-right { bottom: 0; width: 16px; height: 16px; }
  .grip.bottom-left { left: 0; cursor: nesw-resize; }
  .grip.bottom-right { right: 0; cursor: nwse-resize; }
  .floating .panel { border-radius: 22px; }
  /* The panel grows out of the notch on a spring: a little wider and taller than its size, then settling (as Isle's). */
  @keyframes drop { from { transform: scale(0.9, 0.55); opacity: 0; } }
  header { display: flex; align-items: center; gap: 6px; padding: 10px 10px 6px; min-width: 0; }
  nav {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 2px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  nav::-webkit-scrollbar { display: none; }
  nav button {
    position: relative;
    z-index: 1;
    flex: none;
    white-space: nowrap;
    background: transparent;
    border: none;
    color: var(--text2);
    border-radius: 999px;
    padding: 5px 10px;
    display: flex;
    gap: 5px;
    align-items: center;
    transition: color var(--motion-hover);
  }
  nav button:hover:not(.on) { color: var(--paper); background: transparent; }
  nav button.on { background: var(--smoke); color: var(--paper); }
  /* Once measured, the open tab's fill is the glider below the labels instead of the button's own background. */
  nav.glide button.on { background: transparent; }
  .tab-glider {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 0;
    border-radius: 999px;
    background: var(--smoke);
    box-shadow: inset 0 0 0 1px var(--island-edge);
    opacity: 0;
    transition: transform var(--motion-panel), width var(--motion-panel), opacity var(--motion-quick);
    pointer-events: none;
  }
  nav.glide .tab-glider { opacity: 1; }
  .tab-count {
    min-width: 16px;
    height: 16px;
    padding: 0 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--orb-base) 24%, transparent);
    color: var(--paper);
    font: var(--text-caption);
    font-variant-numeric: tabular-nums;
    animation: count-pop var(--motion-reveal);
    font-weight: 700;
    line-height: 16px;
    text-align: center;
  }
  .spacer { display: none; }
  .icon { flex: none; padding: 4px 6px; }
  .icon.lock.on { color: var(--iris); }
  .body { flex: 1; min-height: 0; }
  .pane { height: 100%; min-height: 0; }
  @keyframes count-pop {
    from { transform: scale(0.6); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  .nooktab { display: grid; grid-template-columns: 1fr 220px; height: 100%; }
  .chatcol { min-height: 0; }
  .side { border-left: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0; }
  .sidetabs { display: flex; gap: 2px; padding: 4px 8px 6px; }
  .sidetabs button { flex: 1; background: transparent; border: 0; color: var(--text3); border-radius: 999px; padding: 3px 8px; font-size: 11px; }
  .sidetabs button.on { background: var(--smoke); color: var(--paper); }
  .sidebody { flex: 1; min-height: 0; overflow-y: auto; }
  .panel :global(.composer) { background: var(--notch); }
</style>
