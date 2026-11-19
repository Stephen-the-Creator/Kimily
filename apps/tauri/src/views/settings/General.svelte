<script lang="ts">
  import Segmented from "./Segmented.svelte";
  // General: language, where the bar sits, energy. The color is under Appearance, the shortcuts under Shortcuts.
  import { api } from "../../lib/api";
  import { nook } from "../../lib/state.svelte";
  import { services, serviceEvents, type EnergyView } from "../../lib/services";
  import type { EnergyMode } from "../../lib/types";
  import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
  import { tr, APP_LANGUAGES, type AppLanguage } from "../../lib/i18n.svelte";
  import {
    WEATHER_CITY_KEY, WEATHER_ENABLED_KEY, clearWeatherCache, defaultCity, fetchIslandWeather, weatherCity, weatherEnabled,
    type IslandWeather,
  } from "../../lib/weather";
  import { HIDEABLE_TABS, notifyIslandPrefs, readHiddenTabs, setTabVisible, type HideableTab } from "../../lib/island-tabs";

  const s = $derived(nook.settings!);

  // Energy: one choice, what it means, and what Nook does right now.
  const energyModes: { id: EnergyMode; title: string; detail: string }[] = $derived([
    { id: "automatic", title: tr("Automatisch", "Automatic"), detail: tr("Nook doet een stap terug op de accu, als je computer warm of druk bezig is, en als je weg bent.", "Nook steps back on battery, when your computer is hot or busy, and when you are away.") },
    { id: "saver", title: tr("Zuinig", "Saver"), detail: tr("Altijd licht: het scherm wordt minder vaak gelezen en suggesties komen minder vaak. Fijn op een laptop die lang op de accu moet.", "Always light: the screen is read less often and suggestions come less often. Good for a laptop that has to last on battery.") },
    { id: "full", title: tr("Volle kracht", "Full power"), detail: tr("Nooit rustiger voor de accu of een drukke computer. Een warme computer krijgt nog wel even rust.", "Never slows down for the battery or a busy computer. A hot computer still gets a break.") },
  ]);
  let launchAtLogin = $state(false);
  $effect(() => {
    if (nook.info?.capabilities.desktop) isEnabled().then((v) => (launchAtLogin = v)).catch(() => {});
  });
  async function setLaunchAtLogin(on: boolean) {
    try {
      if (on) await enable(); else await disable();
    } catch {}
    launchAtLogin = await isEnabled().catch(() => !on);
  }
  let shortcutNote = $state("");
  async function repairShortcut() {
    shortcutNote = await api.repairStartMenuShortcut().then(() => tr("Snelkoppeling in het Startmenu gemaakt.", "Start menu shortcut created."), (e) => String(e));
  }
  let showWeather = $state(weatherEnabled());
  let cityInput = $state(weatherCity());
  let weatherPreview = $state<IslandWeather | null>(null);
  function setShowWeather(on: boolean) {
    showWeather = on;
    try {
      localStorage.setItem(WEATHER_ENABLED_KEY, on ? "1" : "0");
    } catch {}
    notifyIslandPrefs();
    if (on) fetchIslandWeather(true).then((w) => (weatherPreview = w)).catch(() => {});
    else weatherPreview = null;
  }
  function saveCity() {
    const clean = cityInput.trim();
    cityInput = clean;
    clearWeatherCache();
    try {
      localStorage.setItem(WEATHER_CITY_KEY, clean);
    } catch {}
    notifyIslandPrefs();
    if (showWeather) fetchIslandWeather(true).then((w) => (weatherPreview = w)).catch(() => {});
  }
  $effect(() => {
    if (showWeather) fetchIslandWeather().then((w) => (weatherPreview = w)).catch(() => {});
  });
  let hiddenTabs = $state<HideableTab[]>(readHiddenTabs());
  const tabLabels = $derived<Record<HideableTab, string>>({
    home: "Home",
    tasks: tr("Taken", "Tasks"),
    focus: tr("Focus", "Focus"),
    notes: tr("Notities", "Notes"),
    tray: tr("Plank", "Shelf"),
    chats: tr("Chats", "Chats"),
    agents: tr("Agents", "Agents"),
    workspace: tr("Werkruimte", "Workspace"),
    commands: tr("Commando's", "Commands"),
  });
  function toggleTab(tab: HideableTab, visible: boolean) {
    hiddenTabs = setTabVisible(tab, visible);
  }
  let energy = $state<EnergyView | null>(null);
  $effect(() => {
    services.energyStatus().then((v) => (energy = v)).catch(() => {});
    const un = serviceEvents.onEnergy((v) => (energy = v));
    return () => {
      un.then((f) => f());
    };
  });
</script>

<div class="group">
  <label class="row">
    <span>{tr("Taal van Nook", "Language")}</span>
    <select value={s.appLanguage} onchange={(e) => nook.saveSettings({ appLanguage: e.currentTarget.value as AppLanguage })}>
      {#each APP_LANGUAGES as lang (lang.code)}<option value={lang.code}>{lang.name}</option>{/each}
    </select>
  </label>
  <label class="row">
    <span>{tr("Taal van Nooks antwoorden", "Language of Nook's answers")}</span>
    <select value={s.language} onchange={(e) => nook.saveSettings({ language: e.currentTarget.value })}>
      {#each APP_LANGUAGES as lang (lang.code)}<option value={lang.code}>{lang.name}</option>{/each}
      <option value="auto">{tr("Taal van mijn vraag", "Language of my question")}</option>
    </select>
  </label>
  {#if nook.info?.capabilities.desktop}
    <label class="row">
      <span>{tr("Plek", "Position")}</span>
      <select value={s.placement} onchange={(e) => nook.saveSettings({ placement: e.currentTarget.value as "top" | "floating" })}>
        <option value="top">{tr("Bovenaan het scherm", "At the top of the screen")}</option>
        <option value="floating">{tr("Zwevend op het scherm", "Floating on the screen")}</option>
      </select>
    </label>
    <label class="row"><span>{tr("Starten als ik inlog op de computer", "Open at login")}</span><input type="checkbox" role="switch" checked={launchAtLogin} onchange={(e) => setLaunchAtLogin(e.currentTarget.checked)} /></label>
    {#if nook.info.capabilities.os === "windows"}
      <div class="row">
        <span>{tr("Snelkoppeling in het Startmenu", "Start menu shortcut")}{#if shortcutNote} <small>{shortcutNote}</small>{/if}</span>
        <button onclick={repairShortcut}>{tr("Herstellen", "Repair")}</button>
      </div>
    {/if}
    <label class="row">
      <span>{tr("Lokaal brein zelf starten", "Start the local brain myself")}<br /><small class="faint">{tr("Is Ollama of LM Studio geïnstalleerd maar niet gestart? Dan start Nook hem op de achtergrond.", "Ollama or LM Studio installed but not running? Then Nook starts it in the background.")}</small></span>
      <input type="checkbox" role="switch" checked={s.startLocalBrain} onchange={(e) => nook.saveSettings({ startLocalBrain: e.currentTarget.checked })} />
    </label>
    <label class="row">
      <span>{tr("Paneelgrootte", "Panel size")}</span>
      <select value={s.panelSize || (s.panelLarge ? "large" : "medium")} onchange={(e) => nook.saveSettings({ panelSize: e.currentTarget.value as "compact" | "medium" | "large" | "full", panelLarge: e.currentTarget.value === "large" || e.currentTarget.value === "full" })}>
        <option value="compact">{tr("Compact (520 × 360)", "Compact (520 × 360)")}</option>
        <option value="medium">{tr("Normaal (680 × 460)", "Medium (680 × 460)")}</option>
        <option value="large">{tr("Groot (920 × 620)", "Large (920 × 620)")}</option>
        <option value="full">{tr("Extra groot (75% scherm)", "Extra large (75% screen)")}</option>
      </select>
    </label>
    <label class="row">
      <span>{tr("Gesloten eiland toont", "Closed island shows")}</span>
      <select value={s.islandDisplay || "pill"} onchange={(e) => nook.saveSettings({ islandDisplay: e.currentTarget.value as "pill" | "time" | "media" | "orb" })}>
        <option value="pill">{tr("Dynamic Island (tijd, media & agents)", "Dynamic Island (time, media & agents)")}</option>
        <option value="time">{tr("Tijd & datum", "Time & date")}</option>
        <option value="media">{tr("Media & status", "Media & status")}</option>
        <option value="orb">{tr("Alleen symbool", "Icon only")}</option>
      </select>
    </label>
    <label class="row">
      <span>{tr("Openen bij aanwijzen", "Open on hover")}<br /><small class="faint">{tr("Beweeg de muis over het eiland om het te openen; klapt vanzelf weer in als je wegbeweegt.", "Hover the island to open it; folds back automatically when you move away.")}</small></span>
      <input type="checkbox" role="switch" checked={s.islandHoverOpen ?? false} onchange={(e) => nook.saveSettings({ islandHoverOpen: e.currentTarget.checked })} />
    </label>
    <label class="row">
      <span>{tr("Verbergen in rust", "Hide when idle")}<br /><small class="faint">{tr("Schuift het eiland weg als er niets gebeurt; schuift weer tevoorschijn bij de bovenrand, muziek of een agent.", "Tucks the island away when nothing is happening; slides back at the top edge, for music, or an agent.")}</small></span>
      <input type="checkbox" role="switch" checked={s.hideWhenIdle} onchange={(e) => nook.saveSettings({ hideWhenIdle: e.currentTarget.checked })} />
    </label>
    <label class="row">
      <span>
        {tr("Weer in het eiland", "Weather in the island")}
        {#if showWeather && weatherPreview}
          <br /><small class="faint">{weatherPreview.icon} {Math.round(weatherPreview.temp)} °C · {weatherPreview.place}</small>
        {/if}
      </span>
      <input type="checkbox" role="switch" checked={showWeather} onchange={(e) => setShowWeather(e.currentTarget.checked)} />
    </label>
    {#if showWeather}
      <div class="row">
        <span>{tr("Locatie voor het weer", "Weather location")}<br /><small class="faint">{tr("Leeg = automatisch via je tijdzone ({city}).", "Empty = automatic from your time zone ({city}).", { city: defaultCity() })}</small></span>
        <span class="inline">
          <input placeholder={tr("Stad, bijv. München", "City, e.g. Munich")} bind:value={cityInput} onkeydown={(e) => e.key === "Enter" && saveCity()} onchange={saveCity} />
          <button onclick={saveCity}>{tr("Bewaar", "Save")}</button>
        </span>
      </div>
    {/if}
  {/if}
</div>
{#if nook.info?.capabilities.desktop}
  <h3>{tr("Tabs in het eiland", "Tabs in the island")}</h3>
  <div class="group">
    {#each HIDEABLE_TABS.filter((t) => t !== "workspace" || nook.info?.capabilities.terminals) as t (t)}
      <label class="row">
        <span>{tabLabels[t]}</span>
        <input type="checkbox" role="switch" checked={!hiddenTabs.includes(t)} onchange={(e) => toggleTab(t, e.currentTarget.checked)} />
      </label>
    {/each}
    <p class="faint note">{tr("Verberg tabs die je in het eiland niet gebruikt (Nook blijft altijd zichtbaar).", "Hide tabs you don't use in the island (Nook always stays visible).")}</p>
  </div>
  <h3>{tr("Energie", "Energy")}</h3>
  <div class="group">
    <div class="row">
      <span>{tr("Werk op de achtergrond", "Background work")}<br /><small class="faint">{tr("Scherm lezen, meedenken en meetings herkennen terwijl jij werkt. Wat je zelf vraagt gaat altijd op volle snelheid.", "Reading the screen, thinking along and spotting meetings while you work. Anything you ask for always runs at full speed.")}</small></span>
      <Segmented label={tr("Werk op de achtergrond", "Background work")} value={s.energyMode} options={energyModes.map((m) => ({ value: m.id, label: m.title }))} onchange={(mode) => nook.saveSettings({ energyMode: mode })} />
    </div>
    <p class="faint note">{energyModes.find((m) => m.id === s.energyMode)?.detail}</p>
    <div class="row">
      <span>{tr("Nu", "Right now")}</span>
      <span class="faint" class:light={energy && energy.plan.pace !== "full"}>{energy?.status ?? tr("Volle snelheid", "Full speed")}</span>
    </div>
    <p class="faint note">{tr("Nook werkt op de achtergrond zodat een antwoord direct klaar is: hij leest de tekst op je scherm, denkt mee en kijkt of je in een meeting zit. Dat kost een beetje stroom. Als Nook een stap terugdoet, leest een vraag het scherm alsnog meteen.", "Nook works in the background so an answer is ready right away: it reads the text on your screen, thinks along and checks whether you are in a meeting. That costs a little power. When Nook steps back, a question still reads the screen right away.")}</p>
  </div>
{/if}
      

<style>
  small { font-size: 11px; line-height: 1.35; display: inline-block; max-width: 460px; }
  .light { color: var(--amber); }
</style>
