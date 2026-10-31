/* ============================================================
 * CORE ENGINE — fixed-timestep loop, DPR-aware canvas, unified
 * keyboard + touch input, versioned storage, screens, toasts,
 * camera shake, quality tiers. Everything a game needs so each
 * game file only contains its own world.
 *
 *   const game = Kit.game({ canvas, update(dt), render(ctx) })
 *   game.start() / game.pause() / game.resume() / game.stop()
 *   Kit.input.axis()            {x,y} from keys + joystick
 *   Kit.input.down('boost')     held?
 *   Kit.input.pressed('jump')   edge (cleared each frame)
 *   Kit.input.onSwipe(fn)       touch/keyboard swipe for runners
 *   Kit.store('key', default)   versioned namespaced storage
 *   Kit.settings                persisted {volumes, quality, ...}
 *   Kit.screens.show('menu')    toggles [data-screen] sections
 *   Kit.toast('Nice drift!')    transient HUD toast
 *   Kit.shake(6)                camera shake (respects setting)
 *   Kit.particles               tiny pooled particle system
 * ============================================================ */
(function () {
  'use strict';

  const Kit = window.Kit = {};

  /* ---------------- storage ---------------- */
  const NS = 'sidgames.';
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(NS + key);
        if (raw == null) return fallback;
        const v = JSON.parse(raw);
        return (v && v.v === 1) ? v.d : fallback;
      } catch (e) { return fallback; }
    },
    set(key, data) {
      try { localStorage.setItem(NS + key, JSON.stringify({ v: 1, d: data })); } catch (e) {}
    },
    del(key) {
      try { localStorage.removeItem(NS + key); } catch (e) {}
    }
  };
  Kit.store = store;

  /* ---------------- settings ---------------- */
  const settings = Object.assign({
    volumes: { master: 0.9, music: 0.75, sfx: 0.9 },
    quality: 'auto',          // low | med | high | auto
    reducedMotion: false,
    shake: true,
    showMascot: true,
    firstVisitDone: false
  }, store.get('settings', {}));
  Kit.settings = settings;
  Kit.saveSettings = () => store.set('settings', settings);
  Kit.applyAudioSettings = () => {
    if (window.Audio && Audio.setVolumes) Audio.setVolumes(settings.volumes);
  };

  Kit.reducedMotion = () => settings.reducedMotion ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* quality: returns tier + numeric knobs */
  Kit.quality = () => {
    let q = settings.quality;
    if (q === 'auto') {
      const mem = navigator.deviceMemory || 4;
      const cores = navigator.hardwareConcurrency || 4;
      q = (mem <= 2 || cores <= 4) ? 'low' : (window.devicePixelRatio > 2.5 ? 'med' : 'high');
    }
    return {
      tier: q,
      dprCap: q === 'low' ? 1 : q === 'med' ? 1.5 : 2,
      particles: q === 'low' ? 0.35 : q === 'med' ? 0.7 : 1,
      shadows: q !== 'low'
    };
  };

  /* ---------------- input ---------------- */
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    Space: 'action', KeyJ: 'action', KeyE: 'action',
    ShiftLeft: 'boost', ShiftRight: 'boost', KeyK: 'boost',
    KeyZ: 'slide', KeyC: 'slide',
    Enter: 'enter', Escape: 'pause', KeyP: 'pause', KeyM: 'mute', KeyH: 'help'
  };

  const input = {
    keys: {}, edges: {}, joy: { x: 0, y: 0, active: false },
    swipeHandlers: [], touchStart: null,
    down(n) { return !!this.keys[n]; },
    pressed(n) { return !!this.edges[n]; },
    axis() {
      let x = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
      let y = (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0);
      if (this.joy.active) { x = this.joy.x; y = this.joy.y; }
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      return { x, y };
    },
    onSwipe(fn) { this.swipeHandlers.push(fn); },
    endFrame() { this.edges = {}; }
  };
  Kit.input = input;

  window.addEventListener('keydown', e => {
    const n = KEYMAP[e.code];
    if (!n) return;
    if (['left', 'right', 'up', 'down', 'action', 'boost', 'slide'].includes(n)) e.preventDefault();
    if (!input.keys[n]) input.edges[n] = true;
    input.keys[n] = true;
    if (n === 'pause') Kit._onPauseKey && Kit._onPauseKey();
    if (n === 'mute') Kit._onMuteKey && Kit._onMuteKey();
  });
  window.addEventListener('keyup', e => {
    const n = KEYMAP[e.code];
    if (n) input.keys[n] = false;
  });
  window.addEventListener('blur', () => { input.keys = {}; });

  /* virtual controls are created by shell; input reads their state */
  Kit._bindTouch = (joyEl, btnDefs, swipeEl) => {
    if (joyEl) {
      const knob = joyEl.querySelector('.joy-knob');
      let pid = null, cx = 0, cy = 0, R = 44;
      const set = (dx, dy) => {
        const m = Math.hypot(dx, dy);
        const cl = Math.min(m, R);
        const nx = m ? dx / m : 0, ny = m ? dy / m : 0;
        input.joy.x = nx * (cl / R) * (cl > R * 0.18 ? 1 : 0);
        input.joy.y = ny * (cl / R) * (cl > R * 0.18 ? 1 : 0);
        input.joy.active = true;
        knob.style.transform = `translate(${nx * cl * 0.55}px,${ny * cl * 0.55}px)`;
      };
      joyEl.addEventListener('pointerdown', e => {
        pid = e.pointerId; joyEl.setPointerCapture(pid);
        const r = joyEl.getBoundingClientRect();
        cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        R = r.width / 2 - 6;
        set(e.clientX - cx, e.clientY - cy);
        e.preventDefault();
      });
      joyEl.addEventListener('pointermove', e => {
        if (e.pointerId !== pid) return;
        set(e.clientX - cx, e.clientY - cy);
      });
      const end = e => {
        if (e.pointerId !== pid) return;
        pid = null; input.joy = { x: 0, y: 0, active: false };
        knob.style.transform = 'translate(0,0)';
      };
      joyEl.addEventListener('pointerup', end);
      joyEl.addEventListener('pointercancel', end);
    }
    (btnDefs || []).forEach(def => {
      const el = def.el;
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        if (!input.keys[def.name]) input.edges[def.name] = true;
        input.keys[def.name] = true;
        el.classList.add('pressing');
      });
      const up = e => {
        input.keys[def.name] = false;
        el.classList.remove('pressing');
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    if (swipeEl) {
      swipeEl.addEventListener('touchstart', e => {
        const t = e.touches[0];
        input.touchStart = { x: t.clientX, y: t.clientY, t: performance.now() };
      }, { passive: true });
      swipeEl.addEventListener('touchend', e => {
        if (!input.touchStart) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - input.touchStart.x, dy = t.clientY - input.touchStart.y;
        const adx = Math.abs(dx), ady = Math.abs(dy);
        if (Math.max(adx, ady) > 28) {
          const dir = adx > ady ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          input.swipeHandlers.forEach(fn => fn(dir));
        }
        input.touchStart = null;
      }, { passive: true });
    }
  };

  /* ---------------- canvas ---------------- */
  Kit.fitCanvas = (canvas, maxW = Infinity) => {
    const q = Kit.quality();
    const dpr = Math.min(window.devicePixelRatio || 1, q.dprCap);
    const cssW = Math.min(canvas.clientWidth || window.innerWidth, maxW);
    const cssH = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: cssW, h: cssH, dpr };
  };

  /* ---------------- game loop ---------------- */
  const games = new Set();
  Kit.game = ({ canvas, update, render, maxW = Infinity, onPulse, onResize }) => {
    const G = {
      running: false, paused: false, t: 0,
      w: 0, h: 0, acc: 0, last: 0, shakeT: 0, shakeMag: 0, frame: 0
    };
    const resize = () => {
      const dim = Kit.fitCanvas(canvas, maxW);
      G.w = dim.w; G.h = dim.h;
      G.onResize = onResize;
      if (onResize) onResize(dim);
    };
    window.addEventListener('resize', resize);
    resize();

    G.shake = mag => { if (settings.shake && !Kit.reducedMotion()) G.shakeMag = Math.max(G.shakeMag, mag); };
    G.shakeOffset = () => {
      if (G.shakeMag <= 0.1) return { x: 0, y: 0 };
      const a = Math.random() * Math.PI * 2;
      return { x: Math.cos(a) * G.shakeMag, y: Math.sin(a) * G.shakeMag };
    };

    function tick(now) {
      if (!G.running) return;
      requestAnimationFrame(tick);
      let dt = (now - G.last) / 1000;
      G.last = now;
      if (dt > 0.1) dt = 0.1;           // bounded catch-up
      if (G.paused) return;
      const STEP = 1 / 60;
      G.acc += dt;
      let steps = 0;
      while (G.acc >= STEP && steps < 4) {
        update(STEP, G);
        input.endFrame();
        G.t += STEP; G.frame++;
        G.acc -= STEP; steps++;
      }
      G.shakeMag *= 0.86;
      const so = G.shakeOffset();
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.translate(so.x, so.y);
      render(ctx, G);
      ctx.restore();
      onPulse && onPulse(dt);
    }

    G.start = () => {
      if (G.running) return;
      G.running = true; G.paused = false;
      G.last = performance.now(); G.acc = 0;
      requestAnimationFrame(tick);
    };
    G.pause = () => { G.paused = true; };
    G.resume = () => { if (G.running) { G.paused = false; G.last = performance.now(); G.acc = 0; } };
    G.stop = () => { G.running = false; G.paused = false; };
    games.add(G);
    return G;
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) games.forEach(g => g.onHide && g.onHide());
    else games.forEach(g => g.onShow && g.onShow());
  });

  /* ---------------- screens ---------------- */
  Kit.screens = {
    current: null,
    show(name) {
      document.querySelectorAll('[data-screen]').forEach(s => {
        s.classList.toggle('active', s.dataset.screen === name);
      });
      this.current = name;
      document.body.classList.toggle('screen-open', !!name && name !== 'hud');
    },
    active() { return this.current; }
  };

  /* ---------------- toast ---------------- */
  let toastEl, toastTimer;
  Kit.toast = (msg, ms = 1600) => {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'kit-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms);
  };

  /* ---------------- particles ---------------- */
  Kit.particles = () => {
    const pool = [];
    return {
      spawn(x, y, opts = {}) {
        if (pool.length > 400) return;
        const q = Kit.quality();
        const n = Math.max(1, Math.round((opts.count || 6) * q.particles));
        for (let i = 0; i < n; i++) {
          pool.push({
            x, y,
            vx: (opts.vx || 0) + (Math.random() - 0.5) * (opts.spread || 120),
            vy: (opts.vy || 0) + (Math.random() - 0.5) * (opts.spread || 120),
            life: 1, decay: opts.decay || 1.6,
            size: opts.size || 3 + Math.random() * 3,
            color: opts.color || '#fff',
            grav: opts.grav || 0,
            glow: opts.glow || false
          });
        }
      },
      update(dt) {
        for (let i = pool.length - 1; i >= 0; i--) {
          const p = pool[i];
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vy += p.grav * dt;
          p.life -= p.decay * dt;
          if (p.life <= 0) pool.splice(i, 1);
        }
      },
      render(ctx) {
        for (const p of pool) {
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 8; }
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
      },
      clear() { pool.length = 0; },
      get count() { return pool.length; }
    };
  };

  /* ---------------- haptics (never required) ---------------- */
  Kit.buzz = ms => {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  };

  /* ---------------- misc helpers ---------------- */
  Kit.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  Kit.lerp = (a, b, t) => a + (b - a) * t;
  Kit.rand = (a, b) => a + Math.random() * (b - a);
  Kit.irand = (a, b) => Math.floor(Kit.rand(a, b + 1));
  Kit.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  Kit.fmt = n => n.toLocaleString('en-US');

  Kit.seedRandom = seed => {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };
})();
