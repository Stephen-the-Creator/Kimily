// Korte geluiden: attention (een agent of Nook wacht op je), done (klaar) en error. Een eigen geluid in de map
// Geluiden gaat voor; anders een zacht ingebouwd toontje (zoals Ping, Glass en Basso op de Mac).
import { services } from "./services";
import { quiet } from "./quiet.svelte";

export type SoundName =
  | "attention"
  | "done"
  | "error"
  | "greet"
  | "open"
  | "close"
  | "poke"
  | "dizzy"
  | "hearts"
  | "check"
  | "swallow";

const custom = new Map<SoundName, string | null>();
let context: AudioContext | null = null;
let playing: HTMLAudioElement | null = null;

interface Tone {
  freq: number;
  to?: number;
  at: number;
  length: number;
  vol?: number;
  wave?: OscillatorType;
}

/// Handcrafted soft Web Audio tones for Nook's moments and character reactions.
const tones: Record<SoundName, Tone[]> = {
  attention: [{ freq: 880, at: 0, length: 0.12 }, { freq: 880, at: 0.16, length: 0.12 }],
  done: [{ freq: 660, at: 0, length: 0.14 }, { freq: 990, at: 0.1, length: 0.22 }],
  error: [{ freq: 196, at: 0, length: 0.32, wave: "triangle" }],
  greet: [
    { freq: 523.25, at: 0, length: 0.14, vol: 0.08 },
    { freq: 659.25, at: 0.08, length: 0.16, vol: 0.09 },
    { freq: 783.99, at: 0.16, length: 0.26, vol: 0.09 },
  ],
  open: [{ freq: 420, to: 640, at: 0, length: 0.09, vol: 0.06 }],
  close: [{ freq: 540, to: 360, at: 0, length: 0.09, vol: 0.05 }],
  poke: [{ freq: 340, to: 520, at: 0, length: 0.08, vol: 0.08 }],
  dizzy: [
    { freq: 520, to: 390, at: 0, length: 0.11, vol: 0.07, wave: "triangle" },
    { freq: 440, to: 620, at: 0.1, length: 0.11, vol: 0.07, wave: "triangle" },
    { freq: 580, to: 350, at: 0.2, length: 0.16, vol: 0.06, wave: "triangle" },
  ],
  hearts: [
    { freq: 740, at: 0, length: 0.12, vol: 0.06 },
    { freq: 987.77, at: 0.09, length: 0.22, vol: 0.07 },
  ],
  check: [
    { freq: 587.33, at: 0, length: 0.1, vol: 0.08 },
    { freq: 880, at: 0.06, length: 0.18, vol: 0.09 },
  ],
  swallow: [
    { freq: 600, to: 260, at: 0, length: 0.12, vol: 0.08 },
    { freq: 320, to: 540, at: 0.11, length: 0.14, vol: 0.07 },
  ],
};

function synth(name: SoundName) {
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  const now = context.currentTime;
  for (const tone of tones[name]) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = tone.wave ?? "sine";
    osc.frequency.setValueAtTime(tone.freq, now + tone.at);
    if (tone.to) {
      osc.frequency.exponentialRampToValueAtTime(tone.to, now + tone.at + tone.length);
    }
    const peak = tone.vol ?? 0.11;
    gain.gain.setValueAtTime(0.0001, now + tone.at);
    gain.gain.linearRampToValueAtTime(peak, now + tone.at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.length);
    osc.connect(gain).connect(context.destination);
    osc.start(now + tone.at);
    osc.stop(now + tone.at + tone.length + 0.05);
  }
}

export async function play(name: SoundName, enabled = true) {
  // Silent while you share your screen or sit in a meeting, when you chose so.
  if (!enabled || quiet.silent) return;
  if (name === "attention" || name === "done" || name === "error") {
    if (!custom.has(name)) custom.set(name, await services.soundFile(name).catch(() => null));
    const file = custom.get(name);
    if (file) {
      playing?.pause();
      playing = new Audio(file);
      playing.volume = 0.8;
      await playing.play().catch(() => synth(name));
      return;
    }
  }
  try {
    synth(name);
  } catch {
    // Geen geluid in deze omgeving: niets aan de hand.
  }
}

/// Na het neerzetten van een eigen geluid opnieuw kijken.
export function forgetCustomSounds() {
  custom.clear();
}
