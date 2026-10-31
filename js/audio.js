/* ============================================================
   FC NOVA — tiny WebAudio synth (no audio files)
   ============================================================ */
(function () {
  "use strict";

  const Sound = {
    ctx: null,
    master: null,
    noiseBuf: null,
    crowdSrc: null,
    crowdGain: null,
    enabled: true,

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.7 : 0;
      this.master.connect(this.ctx.destination);

      const len = this.ctx.sampleRate * 3;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    },

    resume() {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
    },

    setEnabled(v) {
      this.enabled = v;
      if (this.master) this.master.gain.setTargetAtTime(v ? 0.7 : 0, this.ctx.currentTime, 0.05);
    },

    tone(freq, dur, opts = {}) {
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime + (opts.delay || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = opts.type || "sine";
      o.frequency.setValueAtTime(freq, t);
      if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
      const vol = opts.vol == null ? 0.12 : opts.vol;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    },

    noise(dur, opts = {}) {
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime + (opts.delay || 0);
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = opts.filter || "bandpass";
      f.frequency.setValueAtTime(opts.freq || 900, t);
      if (opts.toFreq) f.frequency.exponentialRampToValueAtTime(opts.toFreq, t + dur);
      f.Q.value = opts.q == null ? 1 : opts.q;
      const g = this.ctx.createGain();
      const vol = opts.vol == null ? 0.1 : opts.vol;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f).connect(g).connect(this.master);
      s.start(t);
      s.stop(t + dur + 0.03);
    },

    click() {
      this.resize();
      this.tone(640, 0.05, { type: "triangle", vol: 0.06, to: 420 });
    },

    select() {
      this.resize();
      this.tone(520, 0.06, { type: "square", vol: 0.03 });
      this.tone(780, 0.08, { type: "square", vol: 0.03, delay: 0.045 });
    },

    kick() {
      this.resize();
      this.noise(0.09, { filter: "lowpass", freq: 900, toFreq: 180, vol: 0.3, q: 0.7 });
      this.tone(150, 0.11, { type: "sine", vol: 0.28, to: 55 });
    },

    pass() {
      this.resize();
      this.noise(0.05, { filter: "lowpass", freq: 1200, toFreq: 300, vol: 0.14 });
      this.tone(230, 0.06, { type: "sine", vol: 0.08, to: 140 });
    },

    tackle() {
      this.resize();
      this.noise(0.13, { filter: "lowpass", freq: 600, vol: 0.2 });
      this.tone(90, 0.12, { type: "square", vol: 0.07, to: 50 });
    },

    post() {
      this.resize();
      this.tone(1180, 0.35, { type: "triangle", vol: 0.16, to: 820 });
      this.tone(1720, 0.22, { type: "sine", vol: 0.08, to: 1300 });
    },

    save() {
      this.resize();
      this.noise(0.16, { filter: "lowpass", freq: 2000, vol: 0.16 });
      this.tone(300, 0.1, { type: "triangle", vol: 0.06, to: 180 });
    },

    whistle(long) {
      this.resize();
      const dur = long ? 0.7 : 0.32;
      this.tone(2350, dur, { type: "sine", vol: 0.09, to: 2260 });
      this.tone(2420, dur, { type: "sine", vol: 0.06, to: 2340 });
      if (long) this.tone(2380, 0.3, { type: "sine", vol: 0.08, delay: 0.42 });
    },

    goal() {
      this.resize();
      this.whistle(false);
      this.tone(392, 1.2, { type: "sawtooth", vol: 0.05, to: 396 });
      this.tone(523, 1.3, { type: "sawtooth", vol: 0.045, to: 528 });
      this.tone(659, 1.1, { type: "sawtooth", vol: 0.04, to: 665 });
      this.noise(2.4, { filter: "bandpass", freq: 900, toFreq: 1400, q: 0.5, vol: 0.22, attack: 0.25 });
      this.tone(880, 0.3, { type: "square", vol: 0.04, delay: 0.1 });
    },

    crowdOn() {
      this.init();
      if (!this.ctx || this.crowdSrc) return;
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 700;
      f.Q.value = 0.45;
      const g = this.ctx.createGain();
      g.gain.value = 0.018;
      s.connect(f).connect(g).connect(this.master);
      s.start();
      this.crowdSrc = s;
      this.crowdGain = g;
    },

    crowdOff() {
      if (!this.crowdSrc) return;
      try {
        this.crowdSrc.stop();
        this.crowdSrc.disconnect();
      } catch (e) { /* noop */ }
      this.crowdSrc = null;
      this.crowdGain = null;
    },

    pack() {
      this.resize();
      for (let i = 0; i < 4; i++) this.tone(300 + i * 120, 0.12, { type: "triangle", vol: 0.05, delay: i * 0.07 });
      this.noise(0.5, { filter: "highpass", freq: 1200, vol: 0.06, attack: 0.1 });
    },

    reveal(step) {
      this.resize();
      this.tone(440 + step * 120, 0.3, { type: "triangle", vol: 0.08, to: 660 + step * 120 });
      this.tone(660 + step * 160, 0.4, { type: "sine", vol: 0.04, delay: 0.03 });
    },

    win() {
      this.resize();
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, { type: "triangle", vol: 0.09, delay: i * 0.11 }));
    },

    lose() {
      this.resize();
      [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.26, { type: "triangle", vol: 0.07, delay: i * 0.12 }));
    },

    // called from pointer events; cheap guard
    resize() {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    }
  };

  window.FCN = window.FCN || {};
  window.FCN.sound = Sound;
})();
