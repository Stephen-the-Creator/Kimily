<script lang="ts">
  import Segmented from "./Segmented.svelte";
  import Orb, { ACCESSORIES, readAccessory, setAccessory, type Accessory } from "../../components/Orb.svelte";
  // Settings › Appearance (`SettingsView+Appearance` on the Mac): System, Light or Dark for the windows, Nook's color,
  // Island theme, and how much room text and rows get.
  import { nook, accentCss } from "../../lib/state.svelte";
  import { tr } from "../../lib/i18n.svelte";
  import { ACCENTS, DENSITIES, THEMES, themeAccent, resolveTheme, type Density, type ThemeSetting } from "../../lib/theme";
  import { notifyIslandPrefs } from "../../lib/island-tabs";
  import { NEON_RIMS, readNeonRim, saveNeonRim, type NeonRim } from "../../lib/neon-rim";

  type IslandTheme = "obsidian" | "glass" | "tinted" | "light" | "neon";
  const ISLAND_THEMES: IslandTheme[] = ["obsidian", "glass", "tinted", "light", "neon"];

  const s = $derived(nook.settings!);
  const themeNames = $derived<Record<ThemeSetting, string>>({
    system: tr("Systeem", "System"), light: tr("Licht", "Light"), dark: tr("Donker", "Dark"), neon: tr("Neon", "Neon"),
  });
  const islandThemeNames = $derived<Record<IslandTheme, string>>({
    obsidian: tr("Diepzwart", "Obsidian"),
    glass: tr("Rookglas", "Glass"),
    tinted: tr("Getint", "Tinted"),
    light: tr("Licht", "Light"),
    neon: tr("Neon", "Neon"),
  });
  const densityNames = $derived<Record<Density, string>>({
    compact: tr("Compact", "Compact"), comfortable: tr("Comfortabel", "Comfortable"), spacious: tr("Ruim", "Spacious"),
  });
  const systemDark = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)").matches : true;
  // The swatches show each accent as it is drawn in the look that applies now.
  const look = $derived(resolveTheme(s.theme, systemDark));

  let islandTheme = $state<IslandTheme>((localStorage.getItem("island.theme") as IslandTheme) || "obsidian");
  let accessory = $state<Accessory>(readAccessory());
  const accessoryNames = $derived<Record<Accessory, string>>({
    none: tr("Geen", "None"),
    headphones: tr("Koptelefoon", "Headphones"),
    shades: tr("Zonnebril", "Shades"),
    crown: tr("Kroon", "Crown"),
    beanie: tr("Muts", "Beanie"),
    halo: tr("Stralenkrans", "Halo"),
  });
  function pickAccessory(next: Accessory) {
    accessory = next;
    setAccessory(next);
  }
  // Neon is one look for the whole app: picking it lights up the island too (another island theme can still be picked).
  function pickTheme(next: ThemeSetting) {
    void nook.saveSettings({ theme: next });
    if (next === "neon") setIslandTheme("neon");
    else if (islandTheme === "neon") setIslandTheme("obsidian");
  }

  let neonRim = $state<NeonRim>(readNeonRim());
  const neonRimNames = $derived<Record<NeonRim, string>>({
    classic: tr("Klassiek", "Classic"),
    aurora: tr("Poollicht", "Aurora"),
    sunset: tr("Zonsondergang", "Sunset"),
    ocean: tr("Oceaan", "Ocean"),
    fire: tr("Vuur", "Fire"),
    candy: tr("Snoep", "Candy"),
    mono: tr("Eén kleur", "One color"),
  });
  function pickNeonRim(next: NeonRim) {
    neonRim = next;
    saveNeonRim(next);
    notifyIslandPrefs();
  }

  function setIslandTheme(next: IslandTheme) {
    islandTheme = next;
    try {
      localStorage.setItem("island.theme", next);
    } catch {}
    notifyIslandPrefs();
  }
</script>

<div class="preview-stage">
  <div class="preview-pill island-theme-{islandTheme} neon-rim-{neonRim}">
    <Orb size={24} mood="idle" movable alive />
    <span class="preview-title">Kimily</span>
    <span class="preview-time">12:42</span>
  </div>
</div>

<h3>{tr("Thema", "Theme")}</h3>
<div class="group">
  <div class="row">
    <span>{tr("Weergave", "Appearance")}</span>
    <Segmented label={tr("Weergave", "Appearance")} value={s.theme} options={THEMES.map((t) => ({ value: t, label: themeNames[t] }))} onchange={pickTheme} />
  </div>
  <p class="faint note">{tr("Systeem volgt de lichte of donkere modus van je computer.", "System follows your computer's light or dark mode.")}</p>
  <div class="row">
    <span>{tr("Kleur van Nook", "Nook's color")}</span>
    <div class="swatches">
      {#each ACCENTS as a (a)}
        <button class="swatch" class:on={s.accentHex === a} style="background:{accentCss(themeAccent(a, look))}" aria-label={tr("Kleur", "Color")} aria-pressed={s.accentHex === a} onclick={() => nook.saveSettings({ accentHex: a })}></button>
      {/each}
    </div>
  </div>
  <p class="faint note">{tr("Kleurt Nook zelf, het accent van het eiland en de belangrijkste knoppen.", "Colors Nook itself, the island accent, and the main buttons.")}</p>
  <label class="row">
    <span>{tr("Accessoire", "Accessory")}<br /><small class="faint">{tr("Tip: klik met rechts op Nook om snel te wisselen.", "Tip: right-click Nook to cycle quickly.")}</small></span>
    <select value={accessory} onchange={(e) => pickAccessory(e.currentTarget.value as Accessory)}>
      {#each ACCESSORIES as a (a)}<option value={a}>{accessoryNames[a]}</option>{/each}
    </select>
  </label>
  {#if nook.info?.capabilities.desktop}
    <div class="row">
      <span>{tr("Eiland-thema", "Island theme")}</span>
      <Segmented label={tr("Eiland-thema", "Island theme")} value={islandTheme} options={ISLAND_THEMES.map((t) => ({ value: t, label: islandThemeNames[t] }))} onchange={setIslandTheme} />
    </div>
    <p class="faint note">{tr("Stijl van het Dynamic Island bovenaan je scherm: diepzwart, halfdoorzichtig glas, in Nooks kleur getint, licht, of gloeiend neon.", "Style of the Dynamic Island at the top of your screen: deep black, translucent glass, tinted in Nook's color, light, or glowing neon.")}</p>
    {#if islandTheme === "neon"}
      <div class="row">
        <span>{tr("Randkleuren", "Rim colors")}</span>
        <div class="swatches" role="radiogroup" aria-label={tr("Randkleuren", "Rim colors")}>
          {#each NEON_RIMS as r (r)}
            <button
              class="swatch rim-swatch neon-rim-{r}"
              class:on={neonRim === r}
              role="radio"
              aria-checked={neonRim === r}
              aria-label={neonRimNames[r]}
              title={neonRimNames[r]}
              onclick={() => pickNeonRim(r)}
            ></button>
          {/each}
        </div>
      </div>
      <p class="faint note">{tr("De kleuren van het licht dat rond het eiland loopt. Klassiek begint bij Nooks kleur.", "The colors of the light that runs around the island. Classic starts from Nook's color.")}</p>
    {/if}
  {/if}
</div>
<h3>{tr("Tekst en indeling", "Text and layout")}</h3>
<div class="group">
  <label class="row">
    <span>{tr("Dichtheid", "Density")}</span>
    <select value={s.density} onchange={(e) => nook.saveSettings({ density: e.currentTarget.value as Density })}>
      {#each DENSITIES as d (d)}<option value={d}>{densityNames[d]}</option>{/each}
    </select>
  </label>
  <p class="faint note">{tr("Hoeveel ruimte tekst en rijen krijgen. Compact past meer op het scherm; ruim leest rustiger.", "How much room text and rows get. Compact fits more on screen; spacious reads easier.")}</p>
</div>

<style>
  .preview-stage {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 18px 16px;
    margin-bottom: 14px;
    border-radius: var(--radius-sheet);
    background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--orb-base) 18%, transparent), transparent 70%), var(--well);
    border: 1px solid var(--line);
  }
  /* The same island the bar draws: its colors come from `.island-theme-*` in app.css. */
  .preview-pill {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 196px;
    height: 38px;
    padding: 0 14px 0 10px;
    border-radius: 999px;
    background: var(--notch);
    color: var(--paper);
    border: 1px solid var(--island-edge);
    box-shadow: var(--island-shadow);
    backdrop-filter: var(--island-blur);
    transition: background var(--motion-slow), border-color var(--motion-slow), color var(--motion-slow), box-shadow var(--motion-slow);
  }
  .preview-pill:hover { border-color: var(--island-edge-hover); }
  .preview-title { font: var(--text-detail); font-weight: 600; flex: 1; }
  /* A rim palette as a little wheel of its three colors (`.neon-rim-*` in app.css). */
  .rim-swatch {
    background: conic-gradient(var(--neon-a), var(--neon-b), var(--neon-c), var(--neon-a));
    transition: transform var(--motion-quick), box-shadow var(--motion-quick);
  }
  .rim-swatch:hover { transform: scale(1.12); }
  .rim-swatch.on { box-shadow: 0 0 10px var(--neon-b); }
  .preview-time { font: var(--text-detail); font-weight: 600; font-variant-numeric: tabular-nums; opacity: 0.8; }
</style>
