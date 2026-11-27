<script lang="ts">
  import { mountAvatar, type MountedAvatar } from "open-bot-avatar/dom";
  import { CAT, finishFor, type AvatarFinish, type CatState } from "../lib/avatar-style";

  // Kimily as a cat (Open Bot Avatar, MIT): a soft 3D body in Kimily's own color whose eyes follow the pointer. The
  // orb around it keeps its clicks, ring and sounds; this only draws the body. Fur and glass load on first use, so the
  // smooth cat in the island ships without them.
  let {
    size,
    state = "idle",
    happy = false,
    finish = "flat",
  }: { size: number; state?: CatState; happy?: boolean; finish?: AvatarFinish } = $props();

  let host: HTMLDivElement;
  let avatar: MountedAvatar | null = null;

  async function material(kind: AvatarFinish) {
    if (kind === "fluffy") return (await import("open-bot-avatar/materials/fluffy")).fluffy;
    if (kind === "glass") return (await import("open-bot-avatar/materials/glass")).glass;
    return "flat" as const;
  }

  $effect(() => {
    avatar = mountAvatar(host, {
      definition: CAT,
      color: "var(--orb-base)",
      eyeColor: "var(--orb-ink)",
      followPointer: true,
      label: "",
    });
    return () => {
      avatar?.destroy();
      avatar = null;
    };
  });

  $effect(() => {
    avatar?.update({ state, mood: happy ? "happy" : "neutral" });
  });

  $effect(() => {
    const kind = finishFor(finish, size);
    let live = true;
    void material(kind).then((m) => {
      if (live) avatar?.update({ material: m });
    });
    return () => {
      live = false;
    };
  });
</script>

<div class="cat" bind:this={host} style="--s:{size}px" aria-hidden="true"></div>

<style>
  .cat { width: var(--s); height: var(--s); pointer-events: none; }
</style>
