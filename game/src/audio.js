// Tiny synthesized sound kit: no audio files, everything is WebAudio
// oscillators and filtered noise. The context is created lazily on the first
// user gesture; every call is guarded so headless/autoplay-blocked runs stay
// silent instead of throwing.

export class SoundKit {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    } catch { this.ctx = null; }
  }

  blip(freq = 660, dur = 0.08, type = 'square', vol = 0.12) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  shot() { this.blip(180, 0.09, 'sawtooth', 0.2); this.blip(90, 0.12, 'square', 0.14); }
  cash() { this.blip(880, 0.07, 'square', 0.12); setTimeout(() => this.blip(1320, 0.1, 'square', 0.12), 60); }
  crash() { this.blip(70, 0.18, 'sawtooth', 0.22); }
  pickup() { this.blip(520, 0.08, 'triangle', 0.16); setTimeout(() => this.blip(780, 0.1, 'triangle', 0.16), 70); }
  busted() { this.blip(320, 0.25, 'square', 0.16); setTimeout(() => this.blip(210, 0.4, 'square', 0.16), 180); }

  // Continuous engine hum while driving; pitch follows speed.
  engine(on, speedRatio = 0) {
    if (!this.ctx || this.muted) { on = false; }
    if (on && !this.engineOsc) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 55;
      g.gain.value = 0.05;
      o.connect(g).connect(this.ctx.destination);
      o.start();
      this.engineOsc = o; this.engineGain = g;
    }
    if (this.engineOsc) {
      if (!on) {
        try { this.engineOsc.stop(); } catch { /* already stopped */ }
        this.engineOsc = null; this.engineGain = null;
      } else {
        this.engineOsc.frequency.value = 50 + speedRatio * 130;
      }
    }
  }

  // Police siren wail while wanted; louder the closer the nearest cruiser.
  siren(on, closeness = 0, dt = 0) {
    if (!this.ctx || this.muted) { on = false; }
    if (on && !this.sirenOsc) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 700;
      g.gain.value = 0.0;
      o.connect(g).connect(this.ctx.destination);
      o.start();
      this.sirenOsc = o; this.sirenGain = g;
    }
    if (this.sirenOsc) {
      if (!on) {
        try { this.sirenOsc.stop(); } catch { /* already stopped */ }
        this.sirenOsc = null; this.sirenGain = null;
      } else {
        this.sirenTimer += dt;
        this.sirenOsc.frequency.value = 700 + Math.sin(this.sirenTimer * 5.2) * 220;
        this.sirenGain.gain.value = 0.015 + closeness * 0.05;
      }
    }
  }

  stopAll() {
    this.engine(false);
    this.siren(false);
  }
}
