import type { ImpactKind } from "./shotPresentation";
import type { PlayerId, Unit } from "./types";

let audioContext: AudioContext | undefined;
let masterGain: GainNode | undefined;
let soundEnabled = true;
let musicEnabled = true;
const activeSamples = new Set<HTMLAudioElement>();
let menuMusic: HTMLAudioElement | undefined;
let menuMusicWanted = false;
let battleReportMusic: HTMLAudioElement | undefined;
let battleReportMusicWanted = false;
const WATER_SPLOSH_SAMPLE = "/audio/water-splosh.mp3";
const SHIP_BUBBLES_SAMPLE = "/audio/ship-sinking-bubbles.wav";
const CATAPULT_DESTROYED_SAMPLE = "/audio/catapult-destroyed.wav";
const CATAPULT_SOLDIER_HIT_SAMPLE = "/audio/catapult-soldier-hit.wav";
const CASTLE_ASSAULT_CHEER_SAMPLE = "/audio/castle-assault-cheer.mp3";
const OPENING_BATTLE_HORN_SAMPLE = "/audio/opening-battle-horn.mp3";
const MENU_MUSIC_SAMPLE = "/audio/menu-viking-theme.mp3?v=raise-the-horn-and-raid";
const BATTLE_REPORT_MUSIC_SAMPLE = "/audio/battle-report-viking-theme.mp3";
const MENU_MUSIC_VOLUME = 0.12;
const BATTLE_REPORT_MUSIC_VOLUME = 0.1;
export const BATTLE_HORN_DURATION_MS = 4_000;
/** Keep the opening announcement on screen briefly after the horn reaches silence. */
export const BATTLE_HORN_CEREMONY_HOLD_MS = 1_000;

export function setSoundEffectsEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  if (masterGain && audioContext) {
    masterGain.gain.setTargetAtTime(enabled ? 0.72 : 0, audioContext.currentTime, 0.015);
  }
  if (!enabled) {
    for (const sample of activeSamples) {
      sample.pause();
      sample.remove();
    }
    activeSamples.clear();
  }
}

/** Music has its own setup control, independent of battlefield effects. */
export function setMusicEnabled(enabled: boolean): void {
  musicEnabled = enabled;
  if (!enabled) {
    menuMusic?.pause();
    battleReportMusic?.pause();
    return;
  }
  if (menuMusicWanted) startMenuMusic();
  if (battleReportMusicWanted) startBattleReportMusic();
}

/** Quiet looping music for the war-council setup screen only. */
export function startMenuMusic(): void {
  menuMusicWanted = true;
  if (!musicEnabled) return;
  if (!menuMusic) {
    menuMusic = new Audio(MENU_MUSIC_SAMPLE);
    menuMusic.loop = true;
    menuMusic.preload = "auto";
    menuMusic.volume = MENU_MUSIC_VOLUME;
  }
  if (!menuMusic.paused) return;
  void menuMusic.play().catch(() => {
    // Browsers can refuse playback until a user gesture. The next setup
    // interaction calls this function again, so no error needs surfacing.
  });
}

/** Stop and rewind setup music before any battlefield or preview is shown. */
export function stopMenuMusic(): void {
  menuMusicWanted = false;
  if (!menuMusic) return;
  menuMusic.pause();
  menuMusic.currentTime = 0;
}

/** Quiet loop for the Battle Report, including the final-map inspection. */
export function startBattleReportMusic(): void {
  battleReportMusicWanted = true;
  if (!musicEnabled) return;
  if (!battleReportMusic) {
    battleReportMusic = new Audio(BATTLE_REPORT_MUSIC_SAMPLE);
    battleReportMusic.loop = true;
    battleReportMusic.preload = "auto";
    battleReportMusic.volume = BATTLE_REPORT_MUSIC_VOLUME;
  }
  if (!battleReportMusic.paused) return;
  void battleReportMusic.play().catch(() => {
    // A match is normally started by a click, unlocking this quiet end-game loop.
  });
}

/** End the report loop only when leaving the completed match. */
export function stopBattleReportMusic(): void {
  battleReportMusicWanted = false;
  if (!battleReportMusic) return;
  battleReportMusic.pause();
  battleReportMusic.currentTime = 0;
}

/** Browsers allow sound only after a player gesture, such as starting the match. */
export async function primeAudio(): Promise<void> {
  if (!soundEnabled) return;
  const context = getAudioContext();
  if (context.state === "suspended") await context.resume();
}

/** The supplied cinematic call used at match start and for a captured castle. */
export function playBattleHorn(): void {
  // Use only the opening four seconds, tapering to silence at the end.
  playAudioSample(OPENING_BATTLE_HORN_SAMPLE, 0.68, BATTLE_HORN_DURATION_MS, 850);
}

/** Each faction receives a recognisable, but equally short, victory flourish. */
export function playVictoryHorn(playerId: PlayerId): void {
  const phrases: Record<PlayerId, number[]> = {
    blue: [196, 247, 392],
    red: [147, 220, 294],
    pink: [233, 294, 466],
    green: [131, 196, 262],
  };
  playHornPhrase(phrases[playerId], 0.56, 0.075, 1);
}

/**
 * The opening three seconds of the supplied Viking celebration play while a
 * castle is under assault. It deliberately ends before the capture-only
 * fanfare, and is heard for both successful and repelled attacks.
 */
export function playCastleAssaultCheer(): void {
  playAudioSample(CASTLE_ASSAULT_CHEER_SAMPLE, 0.52, 3_000, 700);
}

/** A clearly audible procedural cold gust used while each new winter band fades in. */
export function playWinterWind(durationMilliseconds = 1_600): void {
  const context = usableContext();
  if (!context || !masterGain) return;
  const now = context.currentTime;
  const duration = Math.max(0.4, durationMilliseconds / 1000);
  const frameCount = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let gust = 0;
  for (let index = 0; index < frameCount; index += 1) {
    gust = gust * 0.982 + (Math.random() * 2 - 1) * 0.028;
    const swell = 0.62 + Math.sin((index / frameCount) * Math.PI * 2.7) * 0.28;
    samples[index] = gust * swell;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const lowRumble = context.createBiquadFilter();
  const gain = context.createGain();
  const rumbleGain = context.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(520, now);
  filter.frequency.linearRampToValueAtTime(1_280, now + duration * 0.55);
  filter.frequency.linearRampToValueAtTime(460, now + duration);
  filter.Q.value = 0.42;
  lowRumble.type = "lowpass";
  lowRumble.frequency.setValueAtTime(260, now);
  lowRumble.frequency.linearRampToValueAtTime(170, now + duration);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.21, now + Math.min(0.24, duration * 0.2));
  gain.gain.setValueAtTime(0.16, now + Math.max(0.28, duration - 0.3));
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  rumbleGain.gain.setValueAtTime(0.001, now);
  rumbleGain.gain.linearRampToValueAtTime(0.075, now + Math.min(0.32, duration * 0.25));
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  source.connect(filter).connect(gain).connect(masterGain);
  source.connect(lowRumble).connect(rumbleGain).connect(masterGain);
  source.start(now);
}

export function playCatapultFlight(durationMilliseconds: number): void {
  const context = usableContext();
  if (!context || !masterGain) return;
  const now = context.currentTime;
  const flightSeconds = Math.max(0.18, durationMilliseconds / 1000);

  // A short wooden clunk as the throwing arm releases.
  const release = context.createOscillator();
  const releaseGain = context.createGain();
  release.type = "triangle";
  release.frequency.setValueAtTime(105, now);
  release.frequency.exponentialRampToValueAtTime(42, now + 0.14);
  releaseGain.gain.setValueAtTime(0.3, now);
  releaseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
  release.connect(releaseGain).connect(masterGain);
  release.start(now);
  release.stop(now + 0.17);

  const woodNoise = noiseSource(context, 0.13);
  const woodFilter = context.createBiquadFilter();
  const woodGain = context.createGain();
  woodFilter.type = "bandpass";
  woodFilter.frequency.value = 620;
  woodFilter.Q.value = 1.2;
  woodGain.gain.setValueAtTime(0.13, now);
  woodGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
  woodNoise.connect(woodFilter).connect(woodGain).connect(masterGain);
  woodNoise.start(now);

  // A restrained stone whistle follows the visible arc.
  const whistle = context.createOscillator();
  const whistleGain = context.createGain();
  whistle.type = "sine";
  whistle.frequency.setValueAtTime(880, now + 0.05);
  whistle.frequency.exponentialRampToValueAtTime(390, now + flightSeconds);
  whistleGain.gain.setValueAtTime(0.001, now);
  whistleGain.gain.exponentialRampToValueAtTime(0.055, now + Math.min(0.16, flightSeconds * 0.35));
  whistleGain.gain.exponentialRampToValueAtTime(0.001, now + flightSeconds);
  whistle.connect(whistleGain).connect(masterGain);
  whistle.start(now + 0.04);
  whistle.stop(now + flightSeconds + 0.02);
}

export function playCatapultImpact(kind: ImpactKind, destroyedUnit?: Unit): void {
  const context = usableContext();
  if (!context || !masterGain) return;
  if (kind === "water") {
    playWaterSplash();
    return;
  }
  if (kind === "longboat-hit") {
    playShipSinkingWithContext(context);
    return;
  }
  if (destroyedUnit?.type === "catapult") {
    playCatapultDestroyed();
    return;
  }
  if (destroyedUnit?.type === "soldier") {
    playCatapultSoldierHit();
    return;
  }
  const now = context.currentTime;
  const strength = kind === "miss" ? 0.72 : kind === "castle" ? 1.12 : 1;

  const thump = context.createOscillator();
  const thumpGain = context.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(92, now);
  thump.frequency.exponentialRampToValueAtTime(34, now + 0.34);
  thumpGain.gain.setValueAtTime(0.34 * strength, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
  thump.connect(thumpGain).connect(masterGain);
  thump.start(now);
  thump.stop(now + 0.38);

  const debris = noiseSource(context, 0.42);
  const debrisFilter = context.createBiquadFilter();
  const debrisGain = context.createGain();
  debrisFilter.type = "lowpass";
  debrisFilter.frequency.setValueAtTime(kind === "castle" ? 1250 : 850, now);
  debrisFilter.frequency.exponentialRampToValueAtTime(180, now + 0.4);
  debrisGain.gain.setValueAtTime(0.22 * strength, now);
  debrisGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
  debris.connect(debrisFilter).connect(debrisGain).connect(masterGain);
  debris.start(now);
}

/** A supplied big-stone splash, used only when the actual landing square is water. */
function playWaterSplash(): void {
  playAudioSample(WATER_SPLOSH_SAMPLE, 0.66, 1_200, 360);
}

/** The supplied collapse sound used whenever a Catapult is destroyed. */
export function playCatapultDestroyed(): void {
  playAudioSample(CATAPULT_DESTROYED_SAMPLE, 0.76, 1_250, 220);
}

/** The supplied comic cry for a Soldier or Veteran removed by a Catapult hit. */
function playCatapultSoldierHit(): void {
  playAudioSample(CATAPULT_SOLDIER_HIT_SAMPLE, 0.7, 850, 130);
}

/** A heavier wood-and-water sound for either a rammed or bombarded Longboat. */
export function playShipSinking(): void {
  const context = usableContext();
  if (!context) return;
  playShipSinkingWithContext(context);
}

/** A small celebratory or disappointed crowd response for a direct Viking clash. */
export function playDirectCombatOutcome(attackerWon: boolean): void {
  const context = usableContext();
  if (!context || !masterGain) return;
  const now = context.currentTime;
  const notes = attackerWon ? [392, 523, 659] : [196, 156, 123];
  const spacing = attackerWon ? 0.075 : 0.11;

  for (const [index, frequency] of notes.entries()) {
    const voice = context.createOscillator();
    const gain = context.createGain();
    voice.type = attackerWon ? "triangle" : "sawtooth";
    const start = now + index * spacing;
    voice.frequency.setValueAtTime(frequency, start);
    if (!attackerWon) voice.frequency.exponentialRampToValueAtTime(Math.max(70, frequency * 0.74), start + 0.15);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(attackerWon ? 0.12 : 0.09, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, start + (attackerWon ? 0.17 : 0.2));
    voice.connect(gain).connect(masterGain);
    voice.start(start);
    voice.stop(start + (attackerWon ? 0.19 : 0.22));
  }

  const crowd = noiseSource(context, attackerWon ? 0.22 : 0.3);
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = "bandpass";
  filter.frequency.value = attackerWon ? 1350 : 380;
  filter.Q.value = 0.8;
  gain.gain.setValueAtTime(attackerWon ? 0.065 : 0.055, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + (attackerWon ? 0.22 : 0.3));
  crowd.connect(filter).connect(gain).connect(masterGain);
  crowd.start(now);
}

/** A quick, bright coin chime when a chest reaches a home castle. */
export function playGoldBanked(): void {
  const context = usableContext();
  if (!context || !masterGain) return;
  const now = context.currentTime;
  for (const [index, frequency] of [1047, 1319].entries()) {
    const coin = context.createOscillator();
    const gain = context.createGain();
    const start = now + index * 0.075;
    coin.type = "sine";
    coin.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
    coin.connect(gain).connect(masterGain);
    coin.start(start);
    coin.stop(start + 0.2);
  }
}

/** A comic two-note hiccup for a Viking who has found a drinking horn. */
export function playDrunkHic(): void {
  const context = usableContext();
  if (!context || !masterGain) return;
  const now = context.currentTime;
  for (const [index, frequency] of [250, 310].entries()) {
    const hic = context.createOscillator();
    const gain = context.createGain();
    const start = now + index * 0.13;
    hic.type = "square";
    hic.frequency.setValueAtTime(frequency, start);
    hic.frequency.exponentialRampToValueAtTime(frequency * 0.72, start + 0.08);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(0.075, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
    hic.connect(gain).connect(masterGain);
    hic.start(start);
    hic.stop(start + 0.12);
  }
}

/** A soft rising exhale for a Viking who has sobered up. */
export function playSoberingUp(): void {
  const context = usableContext();
  if (!context || !masterGain) return;
  const now = context.currentTime;
  const sigh = context.createOscillator();
  const gain = context.createGain();
  sigh.type = "triangle";
  sigh.frequency.setValueAtTime(155, now);
  sigh.frequency.exponentialRampToValueAtTime(245, now + 0.34);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.11, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
  sigh.connect(gain).connect(masterGain);
  sigh.start(now);
  sigh.stop(now + 0.44);
}

function playShipSinkingWithContext(context: AudioContext): void {
  if (!masterGain) return;
  const now = context.currentTime;
  // Supplied bubbles form the water part of the effect; the original hull
  // break below keeps a sinking ship clearly different from a stone splash.
  playAudioSample(SHIP_BUBBLES_SAMPLE, 0.8, 1_650);
  const crack = noiseSource(context, 0.28);
  const crackFilter = context.createBiquadFilter();
  const crackGain = context.createGain();
  crackFilter.type = "bandpass";
  crackFilter.frequency.value = 940;
  crackFilter.Q.value = 0.65;
  crackGain.gain.setValueAtTime(0.5, now);
  crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
  crack.connect(crackFilter).connect(crackGain).connect(masterGain);
  crack.start(now);

  const hullGroan = context.createOscillator();
  const hullGain = context.createGain();
  hullGroan.type = "sawtooth";
  hullGroan.frequency.setValueAtTime(180, now);
  hullGroan.frequency.exponentialRampToValueAtTime(52, now + 0.5);
  hullGain.gain.setValueAtTime(0.16, now);
  hullGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
  hullGroan.connect(hullGain).connect(masterGain);
  hullGroan.start(now);
  hullGroan.stop(now + 0.54);

  const churn = noiseSource(context, 0.76);
  const churnFilter = context.createBiquadFilter();
  const churnGain = context.createGain();
  churnFilter.type = "bandpass";
  churnFilter.frequency.setValueAtTime(480, now + 0.1);
  churnFilter.frequency.exponentialRampToValueAtTime(180, now + 0.72);
  churnFilter.Q.value = 0.5;
  churnGain.gain.setValueAtTime(0.001, now);
  churnGain.gain.exponentialRampToValueAtTime(0.34, now + 0.13);
  churnGain.gain.exponentialRampToValueAtTime(0.001, now + 0.76);
  churn.connect(churnFilter).connect(churnGain).connect(masterGain);
  churn.start(now + 0.08);
}

function playAudioSample(
  url: string,
  volume: number,
  maximumMilliseconds: number,
  fadeOutMilliseconds = 0,
): void {
  if (!soundEnabled) return;
  const sample = new Audio(url);
  activeSamples.add(sample);
  sample.preload = "auto";
  sample.volume = volume;
  sample.addEventListener("ended", () => {
    activeSamples.delete(sample);
    sample.remove();
  }, { once: true });
  void sample.play().catch(() => {
    activeSamples.delete(sample);
    sample.remove();
  });
  const fadeDuration = Math.min(maximumMilliseconds, Math.max(0, fadeOutMilliseconds));
  if (fadeDuration > 0) {
    const fadeStart = maximumMilliseconds - fadeDuration;
    const steps = 12;
    for (let step = 1; step <= steps; step += 1) {
      window.setTimeout(() => {
        if (!activeSamples.has(sample)) return;
        sample.volume = Math.max(0, volume * (1 - step / steps));
      }, fadeStart + Math.round((fadeDuration * step) / steps));
    }
  }
  window.setTimeout(() => {
    // The final fade callback and this timeout may share a clock tick.  Set
    // volume explicitly so short samples never get cut off above silence.
    sample.volume = 0;
    sample.pause();
    activeSamples.delete(sample);
    sample.remove();
  }, maximumMilliseconds);
}

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = soundEnabled ? 0.72 : 0;
    masterGain.connect(audioContext.destination);
  }
  return audioContext;
}

function usableContext(): AudioContext | undefined {
  if (!soundEnabled) return undefined;
  const context = getAudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

/**
 * An original, layered long-horn timbre: detuned brass-like oscillators,
 * breath at the mouthpiece and a quiet delayed reflection. It deliberately
 * avoids a clean electronic melody so the call has more weight and air.
 */
function playHornPhrase(notes: number[], noteLength: number, spacing: number, power: number): void {
  const context = usableContext();
  if (!context || !masterGain) return;
  const now = context.currentTime;
  for (const [index, frequency] of notes.entries()) {
    const start = now + index * (noteLength + spacing);
    const horn = context.createOscillator();
    const warmth = context.createOscillator();
    const bite = context.createOscillator();
    const vibrato = context.createOscillator();
    const vibratoGain = context.createGain();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const echo = context.createDelay(0.5);
    const echoGain = context.createGain();
    horn.type = "sawtooth";
    horn.detune.value = -6;
    horn.frequency.setValueAtTime(frequency * 0.93, start);
    horn.frequency.exponentialRampToValueAtTime(frequency, start + 0.11);
    warmth.type = "triangle";
    warmth.detune.value = 5;
    warmth.frequency.setValueAtTime(frequency, start);
    bite.type = "square";
    bite.detune.value = -9;
    bite.frequency.setValueAtTime(frequency * 2, start);
    vibrato.type = "sine";
    vibrato.frequency.value = 5.1;
    vibratoGain.gain.value = 7;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(horn.detune);
    vibratoGain.connect(warmth.detune);
    filter.type = "lowpass";
    filter.Q.value = 1.15;
    filter.frequency.setValueAtTime(1550, start);
    filter.frequency.exponentialRampToValueAtTime(760, start + noteLength);
    compressor.threshold.value = -16;
    compressor.knee.value = 14;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;
    echo.delayTime.value = 0.18;
    echoGain.gain.value = 0.17;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(0.28 * power, start + 0.075);
    gain.gain.setValueAtTime(0.21 * power, start + Math.max(0.14, noteLength - 0.16));
    gain.gain.exponentialRampToValueAtTime(0.001, start + noteLength);
    horn.connect(filter);
    warmth.connect(filter);
    bite.connect(filter);
    filter.connect(gain).connect(compressor).connect(masterGain);
    compressor.connect(echo).connect(echoGain).connect(masterGain);

    const breath = noiseSource(context, Math.min(0.28, noteLength));
    const breathFilter = context.createBiquadFilter();
    const breathGain = context.createGain();
    breathFilter.type = "bandpass";
    breathFilter.frequency.value = 920;
    breathFilter.Q.value = 0.7;
    breathGain.gain.setValueAtTime(0.055 * power, start);
    breathGain.gain.exponentialRampToValueAtTime(0.001, start + Math.min(0.25, noteLength));
    breath.connect(breathFilter).connect(breathGain).connect(compressor);

    horn.start(start);
    warmth.start(start);
    bite.start(start);
    vibrato.start(start);
    breath.start(start);
    horn.stop(start + noteLength + 0.02);
    warmth.stop(start + noteLength + 0.02);
    bite.stop(start + noteLength + 0.02);
    vibrato.stop(start + noteLength + 0.02);
  }
}

function noiseSource(context: AudioContext, durationSeconds: number): AudioBufferSourceNode {
  const frameCount = Math.ceil(context.sampleRate * durationSeconds);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    samples[index] = (Math.random() * 2 - 1) * (1 - index / frameCount);
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  return source;
}
