// audio.js — every sound in Port Azura is synthesised with WebAudio.
//
// There are no audio files in the game: the engine is two detuned
// oscillators through a low-pass filter, the siren is a square wave
// flipping between two tones, a crash is a burst of filtered noise, and
// the little pings for cash and buttons are short sine blips. The context
// starts on the first user gesture, as browsers require.

import { clamp } from './rng.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenFlip = 0;
  }

  /** Create the context and the standing engine/siren voices. Call on a click. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // Engine: saw + square an octave down, through a low-pass.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();

    // Siren: one square oscillator whose tone flips in update().
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  /** Toggle the master mute (the M key). Returns the new muted state. */
  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  /**
   * Per-frame: engine pitch follows the driven car's speed, and the siren
   * swells with the nearest cruiser. speedRatio is 0..1, sirenDistance in
   * world units (Infinity when no police are near).
   */
  update(dt, speedRatio, sirenDistance) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const driving = speedRatio > 0.01;
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speedRatio * 0.05 : 0, t, 0.08);
    const freq = 55 + speedRatio * 210;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(freq / 2, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(300 + speedRatio * 1400, t, 0.1);

    this.sirenFlip += dt;
    const near = clamp(1 - sirenDistance / 85, 0, 1);
    this.sirenGain.gain.setTargetAtTime(near * near * 0.055, t, 0.1);
    if (this.sirenFlip > 0.36) {
      this.sirenFlip = 0;
      this.sirenOsc.frequency.value = this.sirenOsc.frequency.value > 800 ? 690 : 920;
    }
  }

  /** A short pitched blip: buttons, doors, punches' whoosh. */
  blip(freq = 660, dur = 0.08, type = 'sine', gain = 0.12, slideTo = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Cash collected: a quick two-note cha-ching. */
  cash() {
    this.blip(880, 0.07, 'square', 0.06);
    setTimeout(() => this.blip(1318, 0.1, 'square', 0.06), 55);
  }

  /** A mission done: three rising notes. */
  fanfare() {
    this.blip(523, 0.1, 'triangle', 0.12);
    setTimeout(() => this.blip(659, 0.1, 'triangle', 0.12), 90);
    setTimeout(() => this.blip(784, 0.16, 'triangle', 0.14), 180);
  }

  /** A punch landing: low thump plus a noise snap. */
  punch() {
    this.blip(120, 0.12, 'sine', 0.22, 45);
    this.noise(0.06, 0.1, 900);
  }

  /** A crash: filtered noise, louder with the impact strength 0..1. */
  crash(strength) {
    this.noise(0.22, 0.1 + strength * 0.25, 500 + strength * 300);
    this.blip(70, 0.2, 'sine', 0.2 * strength, 35);
  }

  /** White noise burst through a low-pass filter. */
  noise(dur, gain, cutoff) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }
}
