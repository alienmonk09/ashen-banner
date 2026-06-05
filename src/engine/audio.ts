const STORAGE_KEY = "ashen-audio-muted";
const MASTER_VOLUME = 0.25;

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
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);
    return ctx;
  } catch {
    ctx = null;
    master = null;
    return null;
  }
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

export function setMuted(value: boolean): void {
  muted = value;
  writeStoredMuted(value);
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
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
  tone({ freq: noteToFreq("G4"), slideTo: noteToFreq("B4"), dur: 0.08, type: "triangle", gain: 0.03 });
  tone({ freq: noteToFreq("D5"), slideTo: noteToFreq("G5"), dur: 0.1, type: "triangle", gain: 0.026, delay: 0.055 });
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

function playSelect(): void {
  tone({ freq: noteToFreq("C5"), slideTo: noteToFreq("E5"), dur: 0.045, type: "sine", gain: 0.018 });
}

export const sfx = {
  playHit,
  playCrit,
  playHeal,
  playMagic,
  playKO,
  playSelect,
};
