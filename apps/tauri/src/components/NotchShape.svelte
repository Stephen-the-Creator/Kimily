<script lang="ts">
  // The island at the top of the screen drawn as one shape: concave shoulders that curve out of the screen's edge,
  // straight sides and a rounded bottom. Its fill is the island's color (`--notch`) and its rim runs along the whole
  // outline, shoulders included, so there is no seam where a shoulder meets the island. In the Neon island the rim is
  // the running gradient (`--neon-a/b/c`), turning faster while something is busy. The top edge is the screen's, so
  // the rim leaves it out.
  import { motion } from "../lib/motion";

  let {
    width,
    height,
    shoulder,
    radius,
    neon = false,
    busy = false,
    hover = false,
  }: { width: number; height: number; shoulder: number; radius: number; neon?: boolean; busy?: boolean; hover?: boolean } = $props();

  const id = `notch-rim-${Math.random().toString(36).slice(2, 8)}`;
  const still = motion(1) === 0;

  // The bottom is lifted by half the rim so its stroke stays inside the window.
  const half = 0.75;
  const outline = $derived.by(() => {
    const w = width;
    const h = height - half;
    const s = shoulder;
    const r = Math.max(0, Math.min(radius, h - s, (w - 2 * s) / 2));
    return [
      `M 0 0`,
      `A ${s} ${s} 0 0 1 ${s} ${s}`,
      `L ${s} ${h - r}`,
      `A ${r} ${r} 0 0 0 ${s + r} ${h}`,
      `L ${w - s - r} ${h}`,
      `A ${r} ${r} 0 0 0 ${w - s} ${h - r}`,
      `L ${w - s} ${s}`,
      `A ${s} ${s} 0 0 1 ${w} 0`,
    ].join(" ");
  });
</script>

{#if width > 0 && height > 0}
  <svg class="notch-shape" class:hover class:neon {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
    {#if neon}
      <defs>
        <linearGradient {id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" class="a" />
          <stop offset="50%" class="b" />
          <stop offset="100%" class="c" />
          {#if !still}
            <animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur={busy ? "2.2s" : "6s"} repeatCount="indefinite" />
          {/if}
        </linearGradient>
      </defs>
    {/if}
    <path class="fill" d="{outline} Z" />
    <path class="rim" d={outline} style={neon ? `stroke: url(#${id})` : undefined} />
  </svg>
{/if}

<style>
  .notch-shape {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    overflow: visible;
    z-index: 0;
    animation: notch-in 0.28s ease-out;
  }
  .fill { fill: var(--notch); transition: fill var(--motion-slow); }
  .rim {
    fill: none;
    stroke: var(--island-edge);
    stroke-width: 1.5;
    stroke-linejoin: round;
    transition: stroke var(--motion-hover);
  }
  .hover:not(.neon) .rim { stroke: var(--island-edge-hover); }
  .neon .rim { stroke-width: 1.75; filter: drop-shadow(0 0 3px var(--neon-a)); }
  .neon.hover .rim { filter: drop-shadow(0 0 6px var(--neon-a)); }
  .a { stop-color: var(--neon-a); }
  .b { stop-color: var(--neon-b); }
  .c { stop-color: var(--neon-c); }
  @keyframes notch-in { from { opacity: 0; } }
</style>
