<script lang="ts">
  // Quick scratchpad, live clipboard history, and pinned snippets inside the Dynamic Island.
  import { api } from "../lib/api";
  import { nook } from "../lib/state.svelte";
  import { play } from "../lib/sounds";
  import { clipboardHistory } from "../lib/clipboard.svelte";
  import { tr } from "../lib/i18n.svelte";
  import { motion } from "../lib/motion";
  import Ico from "../components/ui/Ico.svelte";
  import { flip } from "svelte/animate";
  import { fly, slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  type Snippet = { id: string; title: string; text: string };
  type SubView = "pad" | "clipboard" | "pinned";

  let { ontask }: { ontask?: () => void } = $props();

  const PAD_KEY = "island.scratchpad";
  const SNIP_KEY = "island.snippets";

  const VIEWS: SubView[] = ["pad", "clipboard", "pinned"];
  let view = $state<SubView>("pad");
  let text = $state(readPad());
  let snippets = $state<Snippet[]>(readSnippets());
  let copiedId = $state<string | null>(null);
  let taskSavedId = $state<string | null>(null);
  let addingSnippet = $state(false);
  let newTitle = $state("");
  let newText = $state("");

  function readPad(): string {
    try {
      return localStorage.getItem(PAD_KEY) ?? "";
    } catch {
      return "";
    }
  }

  function readSnippets(): Snippet[] {
    try {
      const raw = localStorage.getItem(SNIP_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function savePad() {
    try {
      localStorage.setItem(PAD_KEY, text);
    } catch {}
  }

  function saveSnippets(next: Snippet[]) {
    snippets = next;
    try {
      localStorage.setItem(SNIP_KEY, JSON.stringify(next));
    } catch {}
  }

  async function copy(value: string, id: string) {
    if (!value.trim()) return;
    try {
      await clipboardHistory.copy(value);
      play("check", nook.settings?.sounds ?? true);
      copiedId = id;
      setTimeout(() => {
        if (copiedId === id) copiedId = null;
      }, 1400);
    } catch {}
  }

  async function saveAsTask(value: string, id: string) {
    const clean = value.trim();
    if (!clean) return;
    const firstLine = clean.split(/\r?\n/)[0].trim().slice(0, 140);
    if (!firstLine) return;
    try {
      await api.addLoop(firstLine);
      play("check", nook.settings?.sounds ?? true);
      taskSavedId = id;
      ontask?.();
      setTimeout(() => {
        if (taskSavedId === id) taskSavedId = null;
      }, 1600);
    } catch {}
  }

  function pinText(value: string) {
    const clean = value.trim();
    if (!clean) return;
    const firstLine = clean.split(/\r?\n/)[0].trim();
    newTitle = firstLine.slice(0, 28);
    newText = clean;
    addingSnippet = true;
    view = "pinned";
  }

  function addSnippet(e: SubmitEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    const body = newText.trim();
    if (!title || !body) return;
    saveSnippets([{ id: String(Date.now()), title, text: body }, ...snippets]);
    newTitle = "";
    newText = "";
    addingSnippet = false;
    play("check", nook.settings?.sounds ?? true);
  }

  function removeSnippet(id: string) {
    saveSnippets(snippets.filter((s) => s.id !== id));
  }

  function shortTime(ts: number): string {
    const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
    if (mins < 1) return tr("nu", "now");
    if (mins < 60) return `${mins}m`;
    const hrs = Math.round(mins / 60);
    return `${hrs}h`;
  }
</script>

<section class="notes">
  <div class="subnav" role="tablist" style="--index: {VIEWS.indexOf(view)}">
    <span class="subnav-glider" aria-hidden="true"></span>
    <button type="button" role="tab" aria-selected={view === "pad"} class:on={view === "pad"} onclick={() => (view = "pad")}>
      <Ico name="square-pen" size={13} />
      {tr("Kladblok", "Scratchpad")}
    </button>
    <button type="button" role="tab" aria-selected={view === "clipboard"} class:on={view === "clipboard"} onclick={() => { view = "clipboard"; void clipboardHistory.poll(); }}>
      <Ico name="copy" size={13} />
      {tr("Klembord", "Clipboard")}
      {#if clipboardHistory.items.length}<span class="pill-count">{clipboardHistory.items.length}</span>{/if}
    </button>
    <button type="button" role="tab" aria-selected={view === "pinned"} class:on={view === "pinned"} onclick={() => (view = "pinned")}>
      <Ico name="pin" size={13} />
      {tr("Vastgepind", "Pinned")}
      {#if snippets.length}<span class="pill-count">{snippets.length}</span>{/if}
    </button>
  </div>

  {#key view}
    <div class="stage" in:fly={{ y: 6, duration: motion(220), easing: cubicOut }}>
      {#if view === "pad"}
        <div class="pad-wrap">
          <textarea
            class="pad"
            placeholder={tr("Snelle notitie, telefoonnummer, idee…", "Quick note, phone number, idea…")}
            bind:value={text}
            oninput={savePad}
          ></textarea>
          <div class="pad-actions">
            <button type="button" class="act" class:ok={copiedId === "pad"} disabled={!text.trim()} onclick={() => copy(text, "pad")}>
              <Ico name={copiedId === "pad" ? "check" : "copy"} size={13} />
              {copiedId === "pad" ? tr("Gekopieerd", "Copied") : tr("Kopieer", "Copy")}
            </button>
            <button type="button" class="act" class:ok={taskSavedId === "pad"} disabled={!text.trim()} onclick={() => saveAsTask(text, "pad")}>
              <Ico name={taskSavedId === "pad" ? "check" : "list-plus"} size={13} />
              {taskSavedId === "pad" ? tr("Opgeslagen", "Saved") : tr("Als taak", "As task")}
            </button>
            <button type="button" class="act" disabled={!text.trim()} onclick={() => pinText(text)}>
              <Ico name="pin" size={13} />
              {tr("Vastpinnen", "Pin")}
            </button>
            <span class="spacer"></span>
            {#if text.trim()}
              <span class="chars">{tr("{n} tekens", "{n} chars", { n: text.length })}</span>
              <button type="button" class="act subtle" onclick={() => { text = ""; savePad(); }}>
                {tr("Wissen", "Clear")}
              </button>
            {/if}
          </div>
        </div>
      {:else if view === "clipboard"}
        <div class="section">
          <div class="sec-head">
            <span class="sec-title">{tr("Recent gekopieerd", "Recently copied")}</span>
            <span class="sec-actions">
              <button
                type="button"
                class="act"
                class:warn={clipboardHistory.paused}
                aria-pressed={clipboardHistory.paused}
                title={clipboardHistory.paused ? tr("Klembord wordt niet bijgehouden. Klik om verder te gaan.", "The clipboard isn't being recorded. Click to resume.") : tr("Pauzeer het bijhouden van je klembord", "Pause recording your clipboard")}
                onclick={() => clipboardHistory.setPaused(!clipboardHistory.paused)}
              >
                <Ico name={clipboardHistory.paused ? "play" : "pause"} size={12} fill="currentColor" stroke={0} />
                {clipboardHistory.paused ? tr("Hervatten", "Resume") : tr("Pauzeren", "Pause")}
              </button>
              {#if clipboardHistory.items.length}
                <button type="button" class="act subtle" onclick={() => clipboardHistory.clear()}>
                  {tr("Alles wissen", "Clear all")}
                </button>
              {/if}
            </span>
          </div>
          <p class="privacy" class:paused={clipboardHistory.paused}>
            <Ico name={clipboardHistory.paused ? "pause" : "shield"} size={12} />
            {#if clipboardHistory.paused}
              {tr("Gepauzeerd: wat je nu kopieert, wordt niet bewaard.", "Paused: what you copy now isn't kept.")}
            {:else if clipboardHistory.skipped}
              {tr("Wachtwoorden, sleutels en kaartnummers worden overgeslagen ({n} tot nu toe).", "Passwords, keys and card numbers are skipped ({n} so far).", { n: clipboardHistory.skipped })}
            {:else}
              {tr("Wachtwoorden, sleutels en kaartnummers worden overgeslagen. Alles blijft op deze computer.", "Passwords, keys and card numbers are skipped. Everything stays on this computer.")}
            {/if}
          </p>
          {#if clipboardHistory.items.length}
            <div class="list">
              {#each clipboardHistory.items as item, index (item.id)}
                <div
                  class="row"
                  class:copied={copiedId === item.id}
                  animate:flip={{ duration: motion(240), easing: cubicOut }}
                  in:fly={{ y: 6, duration: motion(240), delay: motion(Math.min(index, 6) * 30) }}
                  out:slide={{ duration: motion(180) }}
                >
                  <button type="button" class="row-main" title={item.text} onclick={() => copy(item.text, item.id)}>
                    <span class="row-text">{copiedId === item.id ? tr("Gekopieerd", "Copied") : item.text}</span>
                    <span class="row-time">{shortTime(item.at)}</span>
                  </button>
                  <button type="button" class="row-act" title={tr("Vastpinnen", "Pin")} aria-label={tr("Vastpinnen", "Pin")} onclick={() => pinText(item.text)}>
                    <Ico name="pin" size={13} />
                  </button>
                  <button type="button" class="row-act" class:ok={taskSavedId === item.id} title={tr("Als taak", "As task")} aria-label={tr("Als taak", "As task")} onclick={() => saveAsTask(item.text, item.id)}>
                    <Ico name={taskSavedId === item.id ? "check" : "list-plus"} size={13} />
                  </button>
                  <button type="button" class="row-act del" title={tr("Verwijder", "Delete")} aria-label={tr("Verwijder", "Delete")} onclick={() => clipboardHistory.remove(item.id)}>
                    <Ico name="x" size={13} />
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="empty">
              <span class="empty-mark"><Ico name="copy" size={20} stroke={1.6} /></span>
              <p>{tr("Alles wat je kopieert verschijnt hier automatisch, klaar om met 1 klik opnieuw te gebruiken.", "Everything you copy appears here automatically, ready to reuse with 1 click.")}</p>
            </div>
          {/if}
        </div>
      {:else}
        <div class="section">
          <div class="sec-head">
            <span class="sec-title">{tr("Vastgepinde snippets", "Pinned snippets")}</span>
            <button type="button" class="act subtle" onclick={() => (addingSnippet = !addingSnippet)}>
              <Ico name={addingSnippet ? "x" : "plus"} size={13} />
              {addingSnippet ? tr("Annuleren", "Cancel") : tr("Nieuw", "New")}
            </button>
          </div>

          {#if addingSnippet}
            <form class="snip-form" onsubmit={addSnippet} transition:slide={{ duration: motion(200) }}>
              <input
                type="text"
                maxlength="36"
                placeholder={tr("Titel (bijv. Adres, IBAN, Begroeting)", "Label (e.g. Address, Phone, Reply)")}
                bind:value={newTitle}
                required
              />
              <input type="text" placeholder={tr("Tekst om met 1 klik te kopiëren", "Text to copy with 1 click")} bind:value={newText} required />
              <button type="submit" class="primary save">{tr("Opslaan", "Save")}</button>
            </form>
          {/if}

          {#if snippets.length}
            <div class="list">
              {#each snippets as s, index (s.id)}
                <div
                  class="row"
                  class:copied={copiedId === s.id}
                  animate:flip={{ duration: motion(240), easing: cubicOut }}
                  in:fly={{ y: 6, duration: motion(240), delay: motion(Math.min(index, 6) * 30) }}
                  out:slide={{ duration: motion(180) }}
                >
                  <button type="button" class="row-main snip" title={s.text} onclick={() => copy(s.text, s.id)}>
                    <span class="snip-name">{s.title}</span>
                    <span class="snip-preview">{copiedId === s.id ? tr("Gekopieerd", "Copied") : s.text}</span>
                  </button>
                  <button type="button" class="row-act del" title={tr("Verwijder", "Delete")} aria-label={tr("Verwijder", "Delete")} onclick={() => removeSnippet(s.id)}>
                    <Ico name="x" size={13} />
                  </button>
                </div>
              {/each}
            </div>
          {:else if !addingSnippet}
            <div class="empty">
              <span class="empty-mark"><Ico name="pin" size={20} stroke={1.6} /></span>
              <p>{tr("Pin teksten die je vaak kopieert (adressen, nummers, standaardantwoorden).", "Pin texts you copy often (addresses, phone numbers, standard replies).")}</p>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/key}
</section>

<style>
  .notes {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    padding: var(--space-8) var(--space-12) var(--space-12);
    box-sizing: border-box;
    overflow: hidden;
  }
  /* Three equal segments; the glider slides under the chosen one (`--index`). */
  .subnav {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: var(--radius-control);
    padding: var(--space-2);
    flex: none;
  }
  .subnav-glider {
    position: absolute;
    top: var(--space-2);
    bottom: var(--space-2);
    left: var(--space-2);
    width: calc((100% - var(--space-4)) / 3);
    border-radius: var(--radius-chip);
    background: var(--smoke);
    box-shadow: inset 0 0 0 1px var(--line2);
    transform: translateX(calc(var(--index) * 100%));
    transition: transform var(--motion-panel);
  }
  .subnav button {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-6);
    background: transparent;
    border: 0;
    border-radius: var(--radius-chip);
    padding: var(--space-4) var(--space-6);
    font: var(--text-label);
    color: var(--text3);
    white-space: nowrap;
    transition: color var(--motion-hover);
  }
  .subnav button:hover:not(:disabled) { background: transparent; color: var(--paper); }
  .subnav button.on { color: var(--paper); }
  .pill-count {
    min-width: 16px;
    padding: 0 var(--space-4);
    border-radius: 999px;
    background: color-mix(in srgb, var(--orb-base) 22%, transparent);
    color: var(--paper);
    font: var(--text-caption);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  .stage { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .pad-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--space-8); }
  .pad {
    flex: 1;
    min-height: 0;
    resize: none;
    border-radius: var(--radius-card);
    padding: var(--space-12);
    font: var(--text-body);
    line-height: 1.55;
    transition: border-color var(--motion-hover), box-shadow var(--motion-hover);
  }
  .pad:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--orb-base) 12%, transparent); }
  .pad-actions { display: flex; align-items: center; gap: var(--space-4); flex: none; }
  .spacer { flex: 1; }
  .chars { font: var(--text-caption); color: var(--text3); font-variant-numeric: tabular-nums; }
  .act {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-8);
    border-radius: 999px;
    font: var(--text-label);
    color: var(--text2);
    background: var(--smoke);
    border: 1px solid transparent;
    transition: background var(--motion-quick), color var(--motion-quick), transform var(--motion-quick);
  }
  .act:hover:not(:disabled) { color: var(--paper); border-color: var(--line2); }
  .act:active:not(:disabled) { transform: scale(0.95); }
  .act.ok { color: var(--mint); background: color-mix(in srgb, var(--mint) 14%, transparent); }
  .act.subtle { background: transparent; color: var(--text3); }
  .section { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--space-8); }
  .sec-head { display: flex; align-items: center; justify-content: space-between; flex: none; }
  .sec-actions { display: inline-flex; align-items: center; gap: var(--space-4); }
  .act.warn { color: var(--amber); background: color-mix(in srgb, var(--amber) 14%, transparent); }
  .privacy {
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--space-6);
    font: var(--text-caption);
    color: var(--text3);
    flex: none;
  }
  .privacy.paused { color: var(--amber); }
  .sec-title { font: var(--text-caption); color: var(--text3); text-transform: uppercase; letter-spacing: 0.06em; }
  .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-4); }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-card);
    background: color-mix(in srgb, var(--paper) 4%, transparent);
    border: 1px solid transparent;
    transition: background var(--motion-hover), border-color var(--motion-hover);
  }
  .row:hover { background: color-mix(in srgb, var(--paper) 7%, transparent); border-color: var(--line); }
  .row.copied { border-color: color-mix(in srgb, var(--mint) 45%, transparent); background: color-mix(in srgb, var(--mint) 8%, transparent); }
  .row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-8);
    background: transparent;
    border: 0;
    padding: var(--space-6) var(--space-8);
    text-align: left;
    color: var(--paper);
  }
  .row-main:hover:not(:disabled) { background: transparent; }
  .row-main.snip { flex-direction: column; align-items: flex-start; gap: 0; }
  .row-text,
  .snip-preview {
    flex: 1;
    min-width: 0;
    max-width: 100%;
    font: var(--text-detail);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .copied .row-text,
  .copied .snip-preview { color: var(--mint); }
  .snip-name { font: var(--text-label); font-weight: 600; color: var(--paper); }
  .snip-preview { color: var(--text3); }
  .row-time { font: var(--text-caption); color: var(--text3); flex: none; font-variant-numeric: tabular-nums; }
  .row-act {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--text3);
    opacity: 0.55;
    flex: none;
    transition: opacity var(--motion-quick), color var(--motion-quick), background var(--motion-quick);
  }
  .row:hover .row-act { opacity: 1; }
  .row-act:hover:not(:disabled) { color: var(--paper); background: var(--smoke); }
  .row-act.ok { color: var(--mint); opacity: 1; }
  .row-act.del:hover:not(:disabled) { color: var(--coral); background: color-mix(in srgb, var(--coral) 12%, transparent); }
  .snip-form { display: flex; flex-direction: column; gap: var(--space-6); flex: none; overflow: hidden; }
  .snip-form input { border-radius: var(--radius-control); padding: var(--space-6) var(--space-8); font: var(--text-detail); }
  .save { align-self: flex-end; border-radius: 999px; padding: var(--space-4) var(--space-16); font: var(--text-label); font-weight: 600; }
  .empty {
    margin: auto;
    max-width: 280px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-8);
    color: var(--text3);
    font: var(--text-detail);
  }
  .empty p { margin: 0; }
  .empty-mark {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text2);
    background: color-mix(in srgb, var(--orb-base) 10%, var(--smoke));
  }
</style>
