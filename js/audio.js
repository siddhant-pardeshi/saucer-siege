/* ============================================================
 * AUDIO ENGINE — all music and effects are synthesized live with
 * WebAudio. No audio files, no downloads, nothing to license.
 *
 *   Audio.unlock()            call from any user gesture first
 *   Audio.defineSong(name, spec)  spec = {bpm, layers:[...]}
 *   Audio.playSong(name, {fade})  start looping music
 *   Audio.stopSong({fade})
 *   Audio.setIntensity(0..1)  gain of layers marked intensity:true
 *   Audio.sfx(name, opts)     one-shot effect from the preset bank
 *   Audio.loop(name, opts)    start a looping node (engine, waves)
 *   Audio.setLoop(name, param,value)  e.g. engine pitch 0..1
 *   Audio.stopLoop(name)
 *   Audio.duck(ms)            duck music while the mascot speaks
 *   Audio.setVolumes({master,music,sfx})   persisted by the shell
 *
 * Song spec layer: {wave|noise, steps:"C3 .. F3 ..", octave, gain,
 *   type:'bass'|'lead'|'pad'|'arp'|'kick'|'snare'|'hat', intensity,
 *   attack, release, cutoff}
 * Steps: 16 per bar, "." = rest, "-" = sustain previous note.
 * ============================================================ */
(function () {
  'use strict';

  const A = {
    ctx: null, unlocked: false,
    master: null, musicBus: null, sfxBus: null, comp: null,
    volumes: { master: 0.9, music: 0.8, sfx: 0.9 },
    songs: {}, current: null, schedTimer: null, step: 0, nextTime: 0,
    loops: {}, intensity: 0, duckUntil: 0,
    sfxBank: {}, songGain: null
  };

  const NOTES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  function freq(n) {
    // "C4" | "A#3" | "F#2"
    const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
    if (!m) return 440;
    const semi = NOTES[m[1]] + (parseInt(m[2], 10) + 1) * 12;
    return 440 * Math.pow(2, (semi - 69) / 12);
  }

  function ensure() {
    if (A.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    A.ctx = new AC();
    A.comp = A.ctx.createDynamicsCompressor();
    A.comp.threshold.value = -18; A.comp.knee.value = 22;
    A.comp.ratio.value = 8; A.comp.attack.value = 0.004; A.comp.release.value = 0.24;
    A.master = A.ctx.createGain();
    A.musicBus = A.ctx.createGain();
    A.sfxBus = A.ctx.createGain();
    A.musicBus.connect(A.comp); A.sfxBus.connect(A.comp);
    A.comp.connect(A.master); A.master.connect(A.ctx.destination);
    applyVolumes();
    return true;
  }

  function applyVolumes() {
    if (!A.ctx) return;
    const duck = A.ctx.currentTime < A.duckUntil ? 0.35 : 1;
    A.master.gain.value = A.volumes.master;
    A.musicBus.gain.value = A.volumes.music * duck;
    A.sfxBus.gain.value = A.volumes.sfx;
  }

  function unlock() {
    if (A.unlocked) { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); return; }
    if (!ensure()) return;
    if (A.ctx.state === 'suspended') A.ctx.resume();
    A.unlocked = true;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    if (A.pendingSong) { const p = A.pendingSong; A.pendingSong = null; playSong(p); }
  }
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!A.ctx) return;
    if (document.hidden) A.ctx.suspend();
    else if (A.unlocked) A.ctx.resume();
  });

  /* ---------------- music sequencer ---------------- */
  function defineSong(name, spec) {
    // pre-split step strings into tokens: "A2 - - ." -> ['A2','-','-','.']
    spec.layers = spec.layers.map(L => {
      const t = Object.assign({}, L);
      t.tokens = typeof L.steps === 'string' ? L.steps.trim().split(/\s+/) : L.steps;
      return t;
    });
    A.songs[name] = spec;
  }

  function playSong(name, opts = {}) {
    if (!ensure()) return;
    if (A.ctx.state !== 'running') { A.pendingSong = name; return; }
    if (A.current === name) return;
    stopSong({ fade: 0.25 });
    A.current = name;
    A.step = 0;
    A.nextTime = A.ctx.currentTime + 0.08;
    A.songGain = A.ctx.createGain();
    A.songGain.gain.value = 0;
    A.songGain.connect(A.musicBus);
    A.songGain.gain.linearRampToValueAtTime(1, A.ctx.currentTime + (opts.fade || 1.2));
    A.schedTimer = setInterval(schedule, 25);
  }

  function stopSong(opts = {}) {
    if (!A.ctx || !A.current) return;
    const g = A.songGain;
    if (g) {
      const t = A.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0.0001, t + (opts.fade || 0.8));
      setTimeout(() => { try { g.disconnect(); } catch (e) {} }, (opts.fade || 0.8) * 1000 + 120);
    }
    clearInterval(A.schedTimer);
    A.schedTimer = null; A.current = null; A.songGain = null;
  }

  function schedule() {
    if (!A.current || !A.ctx) return;
    const spec = A.songs[A.current];
    if (!spec) return;
    const spb = 60 / spec.bpm / 4; // 16th note
    if (A.nextTime < A.ctx.currentTime - 0.25) A.nextTime = A.ctx.currentTime + 0.05; // resync after suspension
    while (A.nextTime < A.ctx.currentTime + 0.14) {
      playStep(spec, A.step, A.nextTime, spb);
      A.step = (A.step + 1) % (spec.bars ? spec.bars * 16 : 16);
      A.nextTime += spb;
    }
  }

  function playStep(spec, step, t, spb) {
    const out = A.songGain;
    spec.layers.forEach(L => {
      if (L.intensity && Math.abs(A.intensity) < 0.01) return;
      const gain = (L.gain || 0.5) * (L.intensity ? (0.4 + 0.6 * A.intensity) : 1);
      const tokens = L.tokens;
      const idx = step % tokens.length;
      const token = tokens[idx];
      if (token === '.' || token === '-') return; // rests and sustains
      let dur = 1;
      for (let k = idx + 1; k < tokens.length && tokens[k] === '-'; k++) dur++;
      const type = L.type || 'lead';
      if (type === 'kick') drum('kick', t, out, gain);
      else if (type === 'snare') drum('snare', t, out, gain);
      else if (type === 'hat') drum('hat', t, out, gain);
      else {
        const f = freq(token);
        voice(type, L.wave || 'square', f, t, dur * spb * (L.release || 0.9), out, gain, L.attack || 0.01, L.cutoff || 0);
      }
    });
  }

  function voice(type, wave, f, t, dur, out, gain, attack, cutoff) {
    const o = A.ctx.createOscillator();
    o.type = wave; o.frequency.value = f;
    const g = A.ctx.createGain();
    let node = o;
    if (cutoff) {
      const flt = A.ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = cutoff; flt.Q.value = 0.8;
      o.connect(flt); node = flt;
    }
    const peak = type === 'pad' ? gain * 0.5 : gain;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
    if (type === 'pad') {
      const o2 = A.ctx.createOscillator();
      o2.type = wave; o2.frequency.value = f * 1.005;
      o2.connect(node); o2.start(t); o2.stop(t + dur + 0.05);
    }
  }

  function drum(kind, t, out, gain) {
    if (kind === 'kick') {
      const o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.18);
    } else {
      const len = kind === 'snare' ? 0.16 : 0.05;
      const buf = A.ctx.createBuffer(1, A.ctx.sampleRate * len, A.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = A.ctx.createBufferSource(); src.buffer = buf;
      const flt = A.ctx.createBiquadFilter();
      flt.type = kind === 'snare' ? 'bandpass' : 'highpass';
      flt.frequency.value = kind === 'snare' ? 1800 : 7000;
      const g = A.ctx.createGain();
      g.gain.setValueAtTime(gain * (kind === 'snare' ? 0.9 : 0.5), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(flt); flt.connect(g); g.connect(out);
      src.start(t);
    }
  }

  /* ---------------- SFX bank ---------------- */
  function sfx(name, opts = {}) {
    if (!A.unlocked || !ensure()) return;
    const fn = A.sfxBank[name];
    if (fn) fn(A.ctx.currentTime, opts);
  }

  function defineSfx(name, fn) { A.sfxBank[name] = fn; }

  function tone(t, { wave = 'square', f = 440, f2, dur = 0.15, gain = 0.5, attack = 0.005, bus, slide } = {}) {
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || A.sfxBus);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noise(t, { dur = 0.2, gain = 0.4, type = 'lowpass', freqV = 1200, sweep, bus } = {}) {
    const buf = A.ctx.createBuffer(1, A.ctx.sampleRate * dur, A.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = A.ctx.createBufferSource(); src.buffer = buf;
    const flt = A.ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = freqV;
    if (sweep) flt.frequency.exponentialRampToValueAtTime(Math.max(60, sweep), t + dur);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(bus || A.sfxBus);
    src.start(t);
  }

  /* default effect presets — games may extend via defineSfx */
  defineSfx('ui', t => tone(t, { wave: 'triangle', f: 660, f2: 880, dur: 0.08, gain: 0.25 }));
  defineSfx('back', t => tone(t, { wave: 'triangle', f: 520, f2: 380, dur: 0.1, gain: 0.22 }));
  defineSfx('select', t => { tone(t, { wave: 'square', f: 523, dur: 0.07, gain: 0.2 }); tone(t + 0.07, { wave: 'square', f: 784, dur: 0.1, gain: 0.2 }); });
  defineSfx('coin', t => { tone(t, { wave: 'square', f: 988, dur: 0.06, gain: 0.3 }); tone(t + 0.06, { wave: 'square', f: 1319, dur: 0.14, gain: 0.3 }); });
  defineSfx('powerup', t => { [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.06, { wave: 'triangle', f, dur: 0.1, gain: 0.32 })); });
  defineSfx('hit', t => { noise(t, { dur: 0.12, gain: 0.5, freqV: 900, sweep: 200 }); tone(t, { wave: 'sawtooth', f: 220, f2: 80, dur: 0.12, gain: 0.4 }); });
  defineSfx('explode', t => { noise(t, { dur: 0.5, gain: 0.6, freqV: 1400, sweep: 90 }); tone(t, { wave: 'sine', f: 110, f2: 40, dur: 0.4, gain: 0.5 }); });
  defineSfx('laser', t => tone(t, { wave: 'sawtooth', f: 1200, f2: 220, dur: 0.14, gain: 0.3 }));
  defineSfx('whoosh', t => noise(t, { dur: 0.3, gain: 0.3, type: 'bandpass', freqV: 400, sweep: 2400 }));
  defineSfx('chime', t => { [880, 1109, 1319].forEach((f, i) => tone(t + i * 0.05, { wave: 'sine', f, dur: 0.3, gain: 0.28 })); });
  defineSfx('checkpoint', t => { [659, 784, 1047].forEach((f, i) => tone(t + i * 0.08, { wave: 'triangle', f, dur: 0.22, gain: 0.34 })); });
  defineSfx('fail', t => { [392, 330, 262].forEach((f, i) => tone(t + i * 0.12, { wave: 'sawtooth', f, dur: 0.2, gain: 0.3, cutoff: 1800 })); });
  defineSfx('fanfare', t => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.09, { wave: 'triangle', f, dur: 0.28, gain: 0.34 })); noise(t + 0.45, { dur: 0.4, gain: 0.15, type: 'highpass', freqV: 5000 }); });
  defineSfx('splash', t => { noise(t, { dur: 0.4, gain: 0.45, freqV: 2500, sweep: 300 }); });
  defineSfx('jump', t => tone(t, { wave: 'square', f: 300, f2: 700, dur: 0.14, gain: 0.3 }));
  defineSfx('brake', t => noise(t, { dur: 0.25, gain: 0.3, type: 'bandpass', freqV: 2400, sweep: 800 }));
  defineSfx('alarm', t => { tone(t, { wave: 'square', f: 740, f2: 520, dur: 0.22, gain: 0.32 }); tone(t + 0.24, { wave: 'square', f: 740, f2: 520, dur: 0.22, gain: 0.32 }); });

  /* ---------------- loops (engine hum, ocean, wind) ---------------- */
  function loop(name, opts = {}) {
    if (!A.unlocked || !ensure()) return;
    if (A.loops[name]) return;
    const o = A.ctx.createOscillator();
    o.type = opts.wave || 'sawtooth';
    o.frequency.value = opts.freq || 60;
    const flt = A.ctx.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = opts.cutoff || 240; flt.Q.value = 2;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0.0001, A.ctx.currentTime);
    g.gain.linearRampToValueAtTime(opts.gain || 0.12, A.ctx.currentTime + 0.4);
    o.connect(flt); flt.connect(g); g.connect(A.sfxBus);
    o.start();
    A.loops[name] = { o, g, flt, base: opts.freq || 60, max: opts.maxFreq || 300 };
  }

  function setLoop(name, param, v) {
    const L = A.loops[name];
    if (!L) return;
    const t = A.ctx.currentTime;
    if (param === 'pitch') L.o.frequency.setTargetAtTime(L.base + v * (L.max - L.base), t, 0.08);
    if (param === 'gain') L.g.gain.setTargetAtTime(v, t, 0.1);
    if (param === 'cutoff') L.flt.frequency.setTargetAtTime(v, t, 0.1);
  }

  function stopLoop(name, fade = 0.3) {
    const L = A.loops[name];
    if (!L) return;
    const t = A.ctx.currentTime;
    L.g.gain.setTargetAtTime(0.0001, t, fade / 3);
    setTimeout(() => { try { L.o.stop(); L.o.disconnect(); } catch (e) {} delete A.loops[name]; }, fade * 1000 + 100);
  }

  function stopAllLoops() { Object.keys(A.loops).forEach(n => stopLoop(n)); }

  /* ---------------- misc ---------------- */
  function duck(ms = 900) {
    if (!A.ctx) return;
    A.duckUntil = A.ctx.currentTime + ms / 1000;
    applyVolumes();
    setTimeout(applyVolumes, ms + 60);
  }

  function setVolumes(v) {
    Object.assign(A.volumes, v);
    applyVolumes();
  }

  function setIntensity(x) {
    A.intensity = Math.max(0, Math.min(1, x));
  }

  window.Audio = window.Audio || {};
  Object.assign(window.Audio, {
    unlock, defineSong, playSong, stopSong, setIntensity,
    sfx, defineSfx, loop, setLoop, stopLoop, stopAllLoops,
    duck, setVolumes,
    get unlocked() { return A.unlocked; }
  });
})();
