<script lang="ts">
  // File drop-zone / temporary shelf ("Ablage") inside the Dynamic Island.
  import { fileTray, type TrayFile } from "../lib/tray.svelte";
  import { barDraft } from "../lib/draft.svelte";
  import { nook } from "../lib/state.svelte";
  import { play } from "../lib/sounds";
  import { tr } from "../lib/i18n.svelte";
  import { motion } from "../lib/motion";
  import Ico from "../components/ui/Ico.svelte";
  import { flip } from "svelte/animate";
  import { fly, scale } from "svelte/transition";
  import { cubicOut, backOut } from "svelte/easing";

  let { onsend }: { onsend?: () => void } = $props();

  let dragging = $state(false);
  let inputEl = $state<HTMLInputElement | undefined>();

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // A Lucide icon per kind of file (the island draws no emoji: they render differently on every system).
  function fileIcon(item: TrayFile): string {
    if (item.type.startsWith("image/")) return "file-image";
    if (item.type === "application/pdf" || item.name.toLowerCase().endsWith(".pdf")) return "file-text";
    if (item.type.startsWith("audio/")) return "file-audio";
    if (item.type.startsWith("video/")) return "file-video";
    if (/\.(zip|rar|7z|tar|gz)$/i.test(item.name)) return "archive";
    if (item.type.startsWith("text/") || /\.(txt|md|csv|json|docx?|xlsx?)$/i.test(item.name)) return "file-text";
    return "file";
  }

  function extension(name: string): string {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot + 1).toUpperCase().slice(0, 4) : "";
  }

  let dragDepth = 0;

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    dragDepth = 0;
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    fileTray.addFiles(files);
    play("swallow", nook.settings?.sounds ?? true);
  }

  function onPick(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    if (!target.files?.length) return;
    fileTray.addFiles(target.files);
    play("check", nook.settings?.sounds ?? true);
    target.value = "";
  }

  async function askNook(item: TrayFile) {
    const dt = new DataTransfer();
    dt.items.add(item.file);
    await barDraft.addFiles(dt.files);
    play("check", nook.settings?.sounds ?? true);
    onsend?.();
  }

  function download(item: TrayFile) {
    const url = item.previewUrl ?? URL.createObjectURL(item.file);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.name;
    a.click();
    if (!item.previewUrl) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
  class="tray"
  class:dragging
  ondragenter={(e) => { e.preventDefault(); dragDepth++; dragging = true; }}
  ondragover={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; }}
  ondragleave={() => { dragDepth = Math.max(0, dragDepth - 1); if (dragDepth === 0) dragging = false; }}
  ondrop={onDrop}
>
  <input bind:this={inputEl} type="file" multiple hidden onchange={onPick} />

  <button type="button" class="dropzone" class:compact={fileTray.count > 0} onclick={() => inputEl?.click()}>
    <span class="dz-icon"><Ico name={dragging ? "circle-arrow-down" : "inbox"} size={fileTray.count > 0 ? 16 : 22} stroke={1.7} /></span>
    <span class="dz-text">
      {dragging
        ? tr("Laat los om op te bergen", "Drop to shelf")
        : tr("Sleep bestanden hierheen of klik om te kiezen", "Drop files here or click to pick")}
    </span>
  </button>

  {#if fileTray.count > 0}
    <div class="bar-row" in:fly={{ y: -4, duration: motion(200) }}>
      <span class="count">{tr("{n} bestanden in plank", "{n} files on shelf", { n: fileTray.count })}</span>
      <button type="button" class="subtle" onclick={() => fileTray.clear()}>{tr("Alles wissen", "Clear all")}</button>
    </div>
    <div class="list">
      {#each fileTray.items as item (item.id)}
        <div
          class="card"
          animate:flip={{ duration: motion(260), easing: cubicOut }}
          in:scale={{ start: 0.92, duration: motion(260), easing: backOut }}
          out:fly={{ x: 24, duration: motion(180) }}
        >
          {#if item.previewUrl}
            <img class="thumb" src={item.previewUrl} alt="" />
          {:else}
            <span class="icon">
              <Ico name={fileIcon(item)} size={18} stroke={1.7} />
              {#if extension(item.name)}<span class="ext">{extension(item.name)}</span>{/if}
            </span>
          {/if}
          <div class="meta">
            <span class="name" title={item.name}>{item.name}</span>
            <span class="size">{formatSize(item.size)}</span>
          </div>
          <div class="actions">
            <button type="button" class="btn primary" title={tr("Stuur naar Nook om te vragen of samen te vatten", "Send to Nook to ask or summarize")} onclick={() => askNook(item)}>
              <Ico name="sparkles" size={12} />
              {tr("Aan Nook", "Ask Nook")}
            </button>
            <button type="button" class="btn icon-only" title={tr("Opslaan", "Save")} aria-label={tr("Opslaan", "Save")} onclick={() => download(item)}>
              <Ico name="arrow-down" size={13} />
            </button>
            <button type="button" class="btn icon-only del" title={tr("Verwijder", "Delete")} aria-label={tr("Verwijder", "Delete")} onclick={() => fileTray.remove(item.id)}>
              <Ico name="x" size={13} />
            </button>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <p class="hint">{tr("Bewaar hier tijdelijk bestanden of stuur ze direct naar Nook om samen te vatten.", "Keep files handy here or send them straight to Nook to summarize.")}</p>
  {/if}
</section>

<style>
  .tray {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    padding: var(--space-12);
    box-sizing: border-box;
    overflow: hidden;
  }
  .dropzone {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-8);
    padding: var(--space-24) var(--space-16);
    border-radius: var(--radius-panel);
    border: 1.5px dashed var(--line2);
    background: var(--well);
    color: var(--text2);
    font: var(--text-detail);
    flex: none;
    transition: border-color var(--motion-hover), background var(--motion-hover), color var(--motion-hover), padding var(--motion-panel), transform var(--motion-quick);
  }
  .dropzone.compact { flex-direction: row; padding: var(--space-8) var(--space-12); }
  .dropzone:hover:not(:disabled),
  .tray.dragging .dropzone {
    border-color: var(--orb-base);
    background: color-mix(in srgb, var(--orb-base) 8%, var(--well));
    color: var(--paper);
  }
  .tray.dragging .dropzone { transform: scale(1.015); }
  .dz-icon {
    display: inline-flex;
    width: 40px;
    height: 40px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--orb-base) 10%, var(--smoke));
    transition: width var(--motion-panel), height var(--motion-panel), transform var(--motion-hover);
  }
  .compact .dz-icon { width: 24px; height: 24px; background: transparent; }
  .tray.dragging .dz-icon { animation: bob 0.9s ease-in-out infinite; }
  @keyframes bob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(3px); }
  }
  .bar-row { display: flex; align-items: center; justify-content: space-between; flex: none; }
  .count { font: var(--text-caption); color: var(--text3); text-transform: uppercase; letter-spacing: 0.06em; }
  .subtle {
    background: transparent;
    border: 0;
    color: var(--text3);
    font: var(--text-label);
    padding: var(--space-2) var(--space-8);
    border-radius: 999px;
  }
  .subtle:hover:not(:disabled) { color: var(--paper); background: var(--smoke); }
  .list { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: var(--space-6); }
  .card {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-6) var(--space-6) var(--space-6) var(--space-6);
    border-radius: var(--radius-card);
    background: color-mix(in srgb, var(--paper) 4%, transparent);
    border: 1px solid var(--line);
    transition: background var(--motion-hover), border-color var(--motion-hover);
  }
  .card:hover { background: color-mix(in srgb, var(--paper) 7%, transparent); border-color: var(--line2); }
  .thumb {
    width: 38px;
    height: 38px;
    border-radius: var(--radius-control);
    object-fit: cover;
    flex: none;
  }
  .icon {
    position: relative;
    width: 38px;
    height: 38px;
    border-radius: var(--radius-control);
    background: var(--smoke);
    color: var(--text2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .ext {
    position: absolute;
    bottom: calc(var(--space-4) * -1);
    padding: 0 var(--space-4);
    border-radius: var(--radius-chip);
    background: var(--graphite);
    border: 1px solid var(--line2);
    font: var(--text-caption);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text2);
  }
  .meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .name { font: var(--text-detail); font-weight: 500; color: var(--paper); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .size { font: var(--text-caption); color: var(--text3); font-variant-numeric: tabular-nums; }
  .actions { display: flex; align-items: center; gap: var(--space-2); flex: none; }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    height: 26px;
    padding: 0 var(--space-8);
    border-radius: 999px;
    font: var(--text-label);
    transition: transform var(--motion-quick), background var(--motion-quick), color var(--motion-quick);
  }
  .btn:active:not(:disabled) { transform: scale(0.92); }
  .btn.icon-only { width: 26px; padding: 0; justify-content: center; background: transparent; border-color: transparent; color: var(--text3); }
  .btn.icon-only:hover:not(:disabled) { color: var(--paper); background: var(--smoke); }
  .btn.del:hover:not(:disabled) { color: var(--coral); background: color-mix(in srgb, var(--coral) 12%, transparent); }
  .hint { margin: 0; text-align: center; font: var(--text-detail); color: var(--text3); padding: 0 var(--space-16); }
</style>
