import { useEffect, useState } from 'react';

// Per-device settings (sound, animations, coordinates) and tiny synthesized
// sound effects, so the game needs no audio files.

export interface Settings {
  sound: boolean;
  animations: boolean;
  coordinates: boolean;
  /** team = same bright sprite for both sides, marked by colour; dark = dark sprites for black. */
  blackStyle: 'team' | 'dark';
}

const KEY = 'ultrachess.settings.v1';
const DEFAULTS: Settings = { sound: true, animations: true, coordinates: true, blackStyle: 'team' };

let current: Settings = load();
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSettings(): Settings {
  return current;
}

export function setSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: the setting lasts until the tab closes.
  }
  applySettings();
  listeners.forEach((l) => l());
}

export function onSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Current settings, re-rendering the component when they change. */
export function useSettings(): Settings {
  const [s, set] = useState(current);
  useEffect(() => onSettings(() => set(current)), []);
  return s;
}

/** Reflect settings as classes on <html> so CSS can react. */
export function applySettings(): void {
  const root = document.documentElement.classList;
  root.toggle('no-anim', !current.animations);
  root.toggle('no-coords', !current.coordinates);
}

// ── Sound ──

export type Sound =
  | 'trophy'
  | 'move'
  | 'capture'
  | 'check'
  | 'win'
  | 'loss'
  | 'pack'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'mythic'
  | 'tease0'
  | 'tease1'
  | 'tease2'
  | 'tease3'
  | 'riser'
  | 'whoosh'
  | 'mate'
  | 'click';

let ctx: AudioContext | null = null;

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ac.currentTime + start);
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  o.connect(g).connect(ac.destination);
  o.start(ac.currentTime + start);
  o.stop(ac.currentTime + start + dur + 0.02);
}

const NOTES: Record<Sound, [number, number, number, OscillatorType, number][]> = {
  move: [[520, 0, 0.07, 'triangle', 0.12]],
  capture: [
    [220, 0, 0.1, 'square', 0.08],
    [150, 0.03, 0.12, 'triangle', 0.14],
  ],
  check: [
    [880, 0, 0.09, 'square', 0.06],
    [1175, 0.09, 0.14, 'square', 0.06],
  ],
  win: [
    [523, 0, 0.14, 'triangle', 0.12],
    [659, 0.12, 0.14, 'triangle', 0.12],
    [784, 0.24, 0.3, 'triangle', 0.14],
  ],
  loss: [
    [392, 0, 0.18, 'triangle', 0.1],
    [311, 0.16, 0.34, 'triangle', 0.1],
  ],
  pack: [[330, 0, 0.25, 'sawtooth', 0.04]],
  rare: [[660, 0, 0.18, 'triangle', 0.1]],
  epic: [
    [660, 0, 0.14, 'triangle', 0.1],
    [990, 0.1, 0.22, 'triangle', 0.1],
  ],
  legendary: [
    [82, 0, 0.6, 'sine', 0.3],
    [523, 0, 0.12, 'triangle', 0.12],
    [784, 0.1, 0.12, 'triangle', 0.12],
    [1046, 0.2, 0.35, 'triangle', 0.14],
  ],
  mythic: [
    [65, 0, 0.8, 'sine', 0.34],
    [98, 0.05, 0.6, 'sine', 0.2],
    [392, 0, 0.18, 'sawtooth', 0.05],
    [523, 0.08, 0.18, 'triangle', 0.12],
    [784, 0.18, 0.18, 'triangle', 0.12],
    [1046, 0.28, 0.2, 'triangle', 0.14],
    [1568, 0.4, 0.5, 'triangle', 0.12],
  ],
  // Rising heartbeat while a strong card is teased.
  tease0: [[196, 0, 0.12, 'sine', 0.18], [196, 0.16, 0.1, 'sine', 0.12]],
  tease1: [[262, 0, 0.12, 'sine', 0.18], [262, 0.16, 0.1, 'sine', 0.12]],
  tease2: [[349, 0, 0.12, 'sine', 0.2], [349, 0.16, 0.1, 'sine', 0.14]],
  tease3: [[466, 0, 0.12, 'sine', 0.22], [466, 0.16, 0.1, 'sine', 0.16]],
  // The held breath before a strong card flips: a quick rising run.
  riser: [330, 370, 415, 466, 523, 587, 659, 740, 831, 932].map(
    (f, i) => [f, i * 0.075, 0.12, 'sine', 0.03 + i * 0.008] as [number, number, number, OscillatorType, number],
  ),
  whoosh: [
    [300, 0, 0.3, 'sawtooth', 0.03],
    [600, 0.15, 0.3, 'sawtooth', 0.03],
    [900, 0.3, 0.3, 'sawtooth', 0.03],
  ],
  click: [[700, 0, 0.04, 'sine', 0.05]],
  // The mated king falls: a deep blow and a low bell under it.
  mate: [
    [55, 0, 0.9, 'sine', 0.34],
    [82, 0.02, 0.6, 'sine', 0.22],
    [140, 0, 0.12, 'square', 0.05],
    [220, 0.05, 1.1, 'triangle', 0.07],
    [277, 0.05, 1.1, 'triangle', 0.05],
  ],
  // An achievement pops up: a soft two-note chime with a sparkle on top.
  trophy: [
    [784, 0, 0.16, 'sine', 0.16],
    [1175, 0.11, 0.32, 'sine', 0.16],
    [2349, 0.13, 0.25, 'triangle', 0.04],
    [1568, 0.24, 0.4, 'sine', 0.08],
  ],
};

export function play(sound: Sound): void {
  if (!current.sound) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    for (const [f, s, d, t, g] of NOTES[sound]) tone(ctx, f, s, d, t, g);
  } catch {
    // No audio available.
  }
}
