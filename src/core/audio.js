// Procedural WebAudio sound effects — no audio files needed.
import { settings } from './input.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.engine = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 6;
    this.master = this.ctx.createGain();
    this.master.gain.value = settings.volume;
    this.master.connect(this.comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v) { if (this.master) this.master.gain.value = v; }

  setListener(pos, yaw) {
    this.listener.x = pos.x; this.listener.y = pos.y; this.listener.z = pos.z; this.listener.yaw = yaw;
  }

  // Returns [gain, pan] for a world position.
  spatial(pos, range = 60) {
    if (!pos) return [1, 0];
    const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z, dy = pos.y - this.listener.y;
    const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);
    const g = 1 / (1 + (dist / range) * (dist / range) * 4);
    const yaw = this.listener.yaw;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const pan = dist < 0.5 ? 0 : Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist));
    return [g, pan * 0.8];
  }

  out(pos, vol, range) {
    const [g, pan] = this.spatial(pos, range);
    if (g * vol < 0.01) return null;
    const gain = this.ctx.createGain();
    gain.gain.value = g * vol;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = pan;
      gain.connect(p).connect(this.master);
    } else gain.connect(this.master);
    return gain;
  }

  noiseBurst(dest, { t = 0, dur = 0.2, type = 'bandpass', freq = 1000, q = 1, vol = 1, attack = 0.002, sweepTo = null }) {
    const c = this.ctx, now = c.currentTime + t;
    const src = c.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(now, Math.random() * 1.5);
    src.stop(now + dur + 0.05);
  }

  tone(dest, { t = 0, dur = 0.15, type = 'sine', freq = 440, to = null, vol = 0.5, attack = 0.003 }) {
    const c = this.ctx, now = c.currentTime + t;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, now);
    if (to) o.frequency.exponentialRampToValueAtTime(to, now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(dest);
    o.start(now); o.stop(now + dur + 0.05);
  }

  play(name, pos = null, vol = 1) {
    if (!this.ctx) return;
    const S = SOUNDS[name];
    if (!S) return;
    const dest = this.out(pos, vol * (S.vol ?? 1), S.range ?? 60);
    if (!dest) return;
    S.fn(this, dest);
  }

  startEngine() {
    if (!this.ctx || this.engine) return;
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 42;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 21;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const g = c.createGain(); g.gain.value = 0.09;
    o.connect(f); o2.connect(f); f.connect(g).connect(this.master);
    o.start(); o2.start();
    this.engine = { o, o2, g };
  }

  setEngine(speed01) {
    if (!this.engine) return;
    this.engine.o.frequency.value = 38 + speed01 * 40;
    this.engine.o2.frequency.value = 19 + speed01 * 20;
  }

  stopEngine() {
    if (!this.engine) return;
    try { this.engine.o.stop(); this.engine.o2.stop(); } catch { /* already stopped */ }
    this.engine = null;
  }
}

const gun = (crack, body, len, vol = 1) => (a, d) => {
  a.noiseBurst(d, { dur: len, freq: crack, q: 0.7, vol: 0.9 * vol });
  a.noiseBurst(d, { dur: len * 1.8, type: 'lowpass', freq: body, vol: 0.8 * vol });
  a.tone(d, { dur: len * 0.9, freq: 140, to: 40, vol: 0.6 * vol, type: 'triangle' });
};

const SOUNDS = {
  ak: { fn: gun(1800, 700, 0.14), range: 90 },
  rpk: { fn: gun(1400, 520, 0.17), range: 95 },
  makarov: { fn: gun(2600, 900, 0.1, 0.8), range: 70 },
  mg: { fn: gun(1200, 450, 0.18), range: 110 },
  sniper: { fn: (a, d) => { gun(2200, 500, 0.35, 1.3)(a, d); a.noiseBurst(d, { t: 0.08, dur: 0.9, type: 'lowpass', freq: 300, vol: 0.4 }); }, range: 200 },
  suppressed: { fn: (a, d) => { a.noiseBurst(d, { dur: 0.07, type: 'lowpass', freq: 1500, vol: 0.5 }); a.tone(d, { dur: 0.05, freq: 300, to: 90, vol: 0.25 }); }, range: 25 },
  rocket: { fn: (a, d) => { a.noiseBurst(d, { dur: 0.7, type: 'bandpass', freq: 600, sweepTo: 2500, q: 0.6, vol: 1, attack: 0.02 }); a.tone(d, { dur: 0.3, freq: 90, to: 40, vol: 0.6 }); }, range: 90 },
  explosion: { fn: (a, d) => { a.noiseBurst(d, { dur: 1.6, type: 'lowpass', freq: 700, sweepTo: 80, vol: 1.4, attack: 0.005 }); a.tone(d, { dur: 1.0, freq: 70, to: 25, vol: 1.1 }); a.noiseBurst(d, { dur: 0.25, freq: 3000, vol: 0.5 }); }, range: 160 },
  hit: { fn: (a, d) => a.tone(d, { dur: 0.06, freq: 1900, vol: 0.25, type: 'square' }), range: 1000 },
  headshot: { fn: (a, d) => { a.tone(d, { dur: 0.09, freq: 2600, vol: 0.3, type: 'square' }); a.tone(d, { t: 0.03, dur: 0.12, freq: 1300, vol: 0.2 }); }, range: 1000 },
  kill: { fn: (a, d) => { a.tone(d, { dur: 0.08, freq: 900, vol: 0.25, type: 'square' }); a.tone(d, { t: 0.07, dur: 0.14, freq: 1400, vol: 0.25, type: 'square' }); }, range: 1000 },
  reload: { fn: (a, d) => { a.noiseBurst(d, { dur: 0.05, freq: 3500, q: 3, vol: 0.5 }); a.noiseBurst(d, { t: 0.45, dur: 0.06, freq: 2500, q: 3, vol: 0.6 }); a.noiseBurst(d, { t: 0.8, dur: 0.05, freq: 4000, q: 3, vol: 0.5 }); }, range: 20 },
  empty: { fn: (a, d) => a.noiseBurst(d, { dur: 0.04, freq: 5000, q: 4, vol: 0.4 }), range: 15 },
  pickup: { fn: (a, d) => { a.tone(d, { dur: 0.08, freq: 600, to: 900, vol: 0.3 }); a.tone(d, { t: 0.07, dur: 0.1, freq: 900, to: 1300, vol: 0.25 }); }, range: 1000 },
  callin: { fn: (a, d) => { a.tone(d, { dur: 0.6, freq: 200, to: 900, vol: 0.4, type: 'sawtooth' }); a.tone(d, { t: 0.15, dur: 0.5, freq: 300, to: 1200, vol: 0.3, type: 'square' }); }, range: 1000 },
  jammer: { fn: (a, d) => { a.tone(d, { dur: 1.0, freq: 2400, to: 60, vol: 0.5, type: 'sawtooth' }); a.noiseBurst(d, { dur: 0.8, freq: 5000, q: 0.5, vol: 0.5 }); }, range: 1000 },
  rally: { fn: (a, d) => { [392, 494, 587, 784].forEach((f, i) => a.tone(d, { t: i * 0.09, dur: 0.5, freq: f, vol: 0.25, type: 'triangle' })); }, range: 1000 },
  alarm: { fn: (a, d) => { for (let i = 0; i < 4; i++) { a.tone(d, { t: i * 0.7, dur: 0.35, freq: 600, to: 900, vol: 0.3, type: 'square' }); a.tone(d, { t: i * 0.7 + 0.35, dur: 0.35, freq: 900, to: 600, vol: 0.3, type: 'square' }); } }, range: 1000 },
  hurt: { fn: (a, d) => { a.tone(d, { dur: 0.2, freq: 120, to: 60, vol: 0.6 }); a.noiseBurst(d, { dur: 0.12, type: 'lowpass', freq: 500, vol: 0.5 }); }, range: 1000 },
  glass: { fn: (a, d) => { for (let i = 0; i < 5; i++) a.noiseBurst(d, { t: i * 0.03, dur: 0.08, type: 'highpass', freq: 4000 + i * 600, vol: 0.4 }); a.noiseBurst(d, { t: 0.05, dur: 0.9, type: 'lowpass', freq: 500, sweepTo: 2000, vol: 0.8, attack: 0.05 }); }, range: 60 },
  flare: { fn: (a, d) => { a.noiseBurst(d, { dur: 0.15, type: 'lowpass', freq: 900, vol: 0.8 }); a.noiseBurst(d, { t: 0.1, dur: 1.2, type: 'highpass', freq: 3000, vol: 0.25, attack: 0.1 }); }, range: 80 },
  revive: { fn: (a, d) => { a.tone(d, { dur: 0.25, freq: 523, vol: 0.3 }); a.tone(d, { t: 0.12, dur: 0.35, freq: 784, vol: 0.3 }); }, range: 1000 },
  down: { fn: (a, d) => { a.tone(d, { dur: 0.6, freq: 300, to: 90, vol: 0.4, type: 'triangle' }); }, range: 1000 },
  melee: { fn: (a, d) => { a.noiseBurst(d, { dur: 0.12, freq: 800, sweepTo: 300, vol: 0.6 }); }, range: 20 },
  throw: { fn: (a, d) => a.noiseBurst(d, { dur: 0.2, freq: 600, sweepTo: 1600, vol: 0.3 }), range: 20 },
  whiz: { fn: (a, d) => a.noiseBurst(d, { dur: 0.12, freq: 3200, sweepTo: 1200, q: 2, vol: 0.25 }), range: 1000 },
  objective: { fn: (a, d) => { [523, 659, 784].forEach((f, i) => a.tone(d, { t: i * 0.11, dur: 0.3, freq: f, vol: 0.25, type: 'square' })); }, range: 1000 },
  click: { fn: (a, d) => a.tone(d, { dur: 0.04, freq: 1200, vol: 0.2, type: 'square' }), range: 1000 },
  mortarWhistle: { fn: (a, d) => a.tone(d, { dur: 1.3, freq: 1800, to: 500, vol: 0.25 }), range: 120 },
  truckHit: { fn: (a, d) => { a.noiseBurst(d, { dur: 0.3, type: 'lowpass', freq: 400, vol: 1 }); a.tone(d, { dur: 0.3, freq: 80, to: 40, vol: 0.8 }); }, range: 60 },
};

export const audio = new AudioEngine();
