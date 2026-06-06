const STORAGE_KEY = "ashen-audio-muted";
const STORAGE_KEY_VOLUME = "ashen-audio-volume";
/** Physical gain value when the user's volume is at 1.0 (100 %). */
const BASE_MASTER = 0.25;
const DEFAULT_VOLUME = 0.7;

type AudioContextCtor = new () => AudioContext;

interface ToneOpts {
  freq: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  slideTo?: number;
  delay?: number;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readStoredMuted();
let volume = readStoredVolume();

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredMuted(): boolean {
  try {
    return storage()?.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredMuted(value: boolean): void {
  try {
    storage()?.setItem(STORAGE_KEY, value ? "true" : "false");
  } catch {
    // localStorage can be unavailable in private mode; in-memory state still works.
  }
}

function readStoredVolume(): number {
  try {
    const raw = storage()?.getItem(STORAGE_KEY_VOLUME);
    if (raw === null || raw === undefined) return DEFAULT_VOLUME;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_VOLUME;
    return Math.max(0, Math.min(1, parsed));
  } catch {
    return DEFAULT_VOLUME;
  }
}

function writeStoredVolume(value: number): void {
  try {
    storage()?.setItem(STORAGE_KEY_VOLUME, String(value));
  } catch {
    // localStorage can be unavailable in private mode; in-memory state still works.
  }
}

function audioCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = audioCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : BASE_MASTER * volume;
    master.connect(ctx.destination);
    return ctx;
  } catch {
    ctx = null;
    master = null;
    return null;
  }
}

/** Internal accessor for the shared AudioContext — for use by the music engine only. */
export function getAudioContext(): AudioContext | null {
  return context();
}

/** Internal accessor for the shared master GainNode — for use by the music engine only. */
export function getMasterGain(): GainNode | null {
  context(); // ensure initialized
  return master;
}

function ensureRunning(c: AudioContext): void {
  if (c.state === "suspended") {
    void c.resume().catch(() => {
      // Browser autoplay policy may still block; future gestures can resume it.
    });
  }
}

function tone(opts: ToneOpts): void {
  if (muted) return;
  const c = context();
  if (!c || !master) return;
  ensureRunning(c);

  const start = c.currentTime + (opts.delay ?? 0);
  const end = start + opts.dur;
  const osc = c.createOscillator();
  const gain = c.createGain();
  const attack = Math.min(0.012, opts.dur * 0.25);
  const peak = Math.max(0.0001, opts.gain);

  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.freq, start);
  if (opts.slideTo !== undefined) {
    osc.frequency.linearRampToValueAtTime(opts.slideTo, end);
  }

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(master);
  osc.start(start);
  osc.stop(end + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

export function isMuted(): boolean {
  return muted;
}

/** Push the muted/volume state onto the live master gain so it takes effect now. */
function applyGain(): void {
  if (master) master.gain.value = muted ? 0 : BASE_MASTER * volume;
}

export function setMuted(value: boolean): void {
  muted = value;
  writeStoredMuted(value);
  applyGain(); // silence (or restore) already-scheduled music immediately
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

export function getVolume(): number {
  return volume;
}

export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  writeStoredVolume(volume);
  applyGain();
}

export function noteToFreq(note: string): number {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(note.trim());
  if (!match) throw new Error(`Invalid note: ${note}`);
  const [, name, accidental, octaveText] = match;
  const offsets: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  let semitone = offsets[name];
  if (accidental === "#") semitone += 1;
  if (accidental === "b") semitone -= 1;
  const octave = Number(octaveText);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
}

function playHit(): void {
  tone({ freq: noteToFreq("C3"), slideTo: noteToFreq("G2"), dur: 0.09, type: "square", gain: 0.035 });
}

function playCrit(): void {
  // A little louder + a third rising voice so a crit lands harder than a normal hit.
  tone({ freq: noteToFreq("G4"), slideTo: noteToFreq("B4"), dur: 0.08, type: "triangle", gain: 0.04 });
  tone({ freq: noteToFreq("D5"), slideTo: noteToFreq("G5"), dur: 0.1, type: "triangle", gain: 0.034, delay: 0.05 });
  tone({ freq: noteToFreq("G5"), slideTo: noteToFreq("D6"), dur: 0.11, type: "triangle", gain: 0.024, delay: 0.1 });
}

function playCounter(): void {
  // A quick metallic riposte — two sharp rising voices so a reaction reads as
  // distinct from the provoking hit, not just a second normal swing.
  tone({ freq: noteToFreq("E4"), slideTo: noteToFreq("A4"), dur: 0.06, type: "square", gain: 0.03 });
  tone({ freq: noteToFreq("B4"), slideTo: noteToFreq("E5"), dur: 0.09, type: "triangle", gain: 0.026, delay: 0.045 });
}

function playHeal(): void {
  tone({ freq: noteToFreq("E4"), slideTo: noteToFreq("A4"), dur: 0.16, type: "sine", gain: 0.028 });
  tone({ freq: noteToFreq("B4"), slideTo: noteToFreq("E5"), dur: 0.14, type: "sine", gain: 0.018, delay: 0.055 });
}

function playMagic(): void {
  tone({ freq: noteToFreq("A3"), slideTo: noteToFreq("E5"), dur: 0.2, type: "triangle", gain: 0.022 });
  tone({ freq: noteToFreq("C5"), slideTo: noteToFreq("G4"), dur: 0.18, type: "sine", gain: 0.014, delay: 0.035 });
}

function playKO(): void {
  tone({ freq: noteToFreq("D3"), slideTo: noteToFreq("D2"), dur: 0.22, type: "sine", gain: 0.04 });
}

function playDeath(): void {
  // A heavier, two-stage descending sting for a unit falling — more final than the
  // generic KO blip: a low body that sags, plus a softer sub a beat later.
  tone({ freq: noteToFreq("A3"), slideTo: noteToFreq("D3"), dur: 0.26, type: "triangle", gain: 0.045 });
  tone({ freq: noteToFreq("D3"), slideTo: noteToFreq("A2"), dur: 0.34, type: "sine", gain: 0.05, delay: 0.12 });
}

function playSelect(): void {
  tone({ freq: noteToFreq("C5"), slideTo: noteToFreq("E5"), dur: 0.045, type: "sine", gain: 0.018 });
}

export const sfx = {
  playHit,
  playCrit,
  playCounter,
  playHeal,
  playMagic,
  playKO,
  playDeath,
  playSelect,
};
