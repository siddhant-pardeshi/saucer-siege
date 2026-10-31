/* ============================================================
 * SAUCER SIEGE — top-down arcade UFO defense.
 * Six waves of saucers, bug swarms and motherships converge on
 * Sector 7: an auto-aim dart-ship, power pods, a kill-chain
 * multiplier and radial boss patterns. All art is drawn with
 * canvas paths each frame; all audio is synthesized. No image
 * or sound assets.
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- tuning ---------------- */
  const WAVES = 6;
  const LIVES = 3;
  const ROF = 0.16;               // seconds between shots
  const PSPD = 0.56;              // player speed, x U per second
  const BSPD = 0.8;               // player bullet speed, x U per second
  const POD_CHANCE = 0.12;        // pod drop chance per kill
  const POD_PITY = 12;            // guaranteed drop after this many dry kills
  const COMBO_WINDOW = 2.5;       // seconds to keep the chain alive
  const COMBO_MAX = 8;
  const INV_TIME = 2;             // respawn invulnerability
  const TRI_TIME = 10;            // triple-shot duration

  /* ---------------- world state ---------------- */
  let state = 'attract';
  let player = null;
  let enemies = [], bullets = [], ebullets = [], pods = [], rings = [];
  let wave = 1, spawnQ = [], spawnT = 0, waveGapT = 0, debriefOpen = false;
  let score = 0, kills = 0, lives = LIVES;
  let chainKills = 0, comboMult = 1, comboT = 0, dryKills = 0;
  let bossRef = null;
  let cdTimer = 0, cdValue = 3, attractT = 1;
  let particles = Kit.particles();

  const W = { w: 0, h: 0 };
  let U = 720;                    // scale unit: clamped min dimension in px
  let starLayers = [], nebulas = [], asteroids = [];
  let bgGrad = null, vignette = null, planetGlow = null;

  /* ---------------- scenery ---------------- */
  function buildScenery() {
    starLayers = [
      { spd: 0.008, par: 0.045, a: 0.45, stars: [] },
      { spd: 0.016, par: 0.09, a: 0.7, stars: [] },
      { spd: 0.03, par: 0.16, a: 1, stars: [] }
    ];
    const counts = [85, 55, 26];
    starLayers.forEach((L, i) => {
      for (let n = 0; n < counts[i]; n++) {
        L.stars.push({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * (0.6 + i * 0.5), p: Math.random() * 6.28 });
      }
    });
    const tints = ['rgba(125,249,198,0.07)', 'rgba(255,122,158,0.06)', 'rgba(96,116,220,0.08)', 'rgba(125,249,198,0.05)'];
    nebulas = [];
    for (let i = 0; i < 4; i++) {
      nebulas.push({
        x: Math.random(), y: Math.random(),
        r: 0.24 + Math.random() * 0.22,
        dx: (Math.random() - 0.5) * 0.004, dy: 0.003 + Math.random() * 0.004,
        col: tints[i]
      });
    }
    asteroids = [];
    for (let i = 0; i < 6; i++) {
      const verts = [];
      const vn = Kit.irand(7, 10);
      for (let v = 0; v < vn; v++) verts.push(0.7 + Math.random() * 0.5);
      asteroids.push({
        x: Math.random(), y: Math.random(),
        r: 9 + Math.random() * 16,
        rot: Math.random() * 6.28, rotSpd: (Math.random() - 0.5) * 0.14,
        vx: 0.002 + Math.random() * 0.004, vy: 0.004 + Math.random() * 0.005,
        verts
      });
    }
  }

  /* ---------------- run control ---------------- */
  let G = null;                   // assigned at boot

  function resetWorld() {
    player = {
      x: W.w / 2, y: W.h * 0.72, aim: -Math.PI / 2,
      fireCd: 0, shield: false, tri: 0, inv: 0, moving: false
    };
    enemies = []; bullets = []; ebullets = []; pods = []; rings = [];
    spawnQ = []; spawnT = 0; waveGapT = 0;
    bossRef = null;
  }

  function startRun() {
    resetWorld();
    score = 0; kills = 0; lives = LIVES; wave = 1;
    chainKills = 0; comboMult = 1; comboT = 0; dryKills = 0;
    particles.clear();
    state = 'countdown'; cdTimer = 0; cdValue = 3;
    showCountdown('3');
    Audio.playSong('battle');
    Audio.setIntensity(0.28);
    Mascot.react('start');
  }

  function toAttract() {
    state = 'attract';
    resetWorld();
    score = 0; kills = 0; lives = LIVES; wave = 1;
    chainKills = 0; comboMult = 1; comboT = 0; dryKills = 0;
    attractT = 1.2;
    particles.clear();
    Audio.playSong('menu');
    Audio.setIntensity(0.15);
  }

  function endRun(won) {
    state = 'done';
    Audio.stopSong();
    G.pause();
    const cleared = won ? WAVES : wave - 1;
    Kit.showResults({
      medal: won ? '🏆' : '🔧',
      kicker: won ? 'Sector secured' : 'Grid overrun',
      title: won ? 'All saucers down, pilot' : 'They broke through',
      stats: [
        { label: 'Score', value: Kit.fmt(score) },
        { label: 'Waves', value: `${cleared}/${WAVES}` },
        { label: 'Kills', value: Kit.fmt(kills) }
      ],
      best: { value: score },
      mascotLine: won ? 'Sector secured. Command owes you a drink.' : null
    });
    if (!won) setTimeout(() => Mascot.react('fail'), 1400);
  }

  /* ---------------- waves ---------------- */
  function buildWave(n) {
    const q = [];
    const push = (t, type) => q.push({ t, type });
    if (n === 3 || n === 6) {
      push(0.4, 'boss');
      for (let i = 0; i < 3 + n; i++) push(2.6 + i * 2.2, 'scout');
      for (let i = 0; i < 4; i++) push(4 + i * 3, 'bug');
    } else {
      const scouts = 5 + n * 2;
      const bugs = n >= 2 ? 2 + n * 4 : 0;
      const thieves = n >= 4 ? n - 3 : 0;
      for (let i = 0; i < scouts; i++) push(0.25 + i * 1.15, 'scout');
      for (let i = 0; i < bugs; i++) push(1.5 + i * 0.55, 'bug');
      for (let i = 0; i < thieves; i++) push(5 + i * 9, 'abductor');
    }
    return q;
  }

  function startWave(n) {
    wave = n;
    spawnQ = buildWave(n);
    spawnT = 0;
    Kit.toast(`Wave ${n} / ${WAVES}`);
    if (n === 3 || n === 6) {
      Audio.sfx('alarm');
      Mascot.react('boss');
    }
    Audio.setIntensity(Math.min(1, 0.28 + (n - 1) * 0.12 + (n === 3 || n === 6 ? 0.1 : 0)));
  }

  function checkWaveClear() {
    if (state === 'battle' && !enemies.length && !spawnQ.length && waveGapT <= 0) {
      waveGapT = 2.1;
      score += 150 * wave;
      Audio.sfx('checkpoint');
      Kit.toast(`Wave ${wave} / ${WAVES} cleared`);
      Mascot.react('wave');
    }
  }

  /* ---------------- spawning ---------------- */
  function edgePos() {
    const m = U * 0.07;
    const side = Kit.irand(0, 3);
    if (side === 0) return { x: Kit.rand(0, W.w), y: -m };
    if (side === 1) return { x: W.w + m, y: Kit.rand(0, W.h) };
    if (side === 2) return { x: Kit.rand(0, W.w), y: W.h + m };
    return { x: -m, y: Kit.rand(0, W.h) };
  }

  function spawnEnemy(type, px, py) {
    const p = px == null ? edgePos() : { x: px, y: py };
    if (type === 'scout') {
      const hp = wave >= 5 ? 3 : 2;
      enemies.push({
        type, x: p.x, y: p.y, r: U * 0.024, hp, maxHp: hp,
        spd: U * (0.13 + wave * 0.008), dir: Math.random() < 0.5 ? -1 : 1,
        orbit: 0.8 + Math.random() * 0.55,
        fireT: Kit.rand(1.6, 3), flash: 0, score: 100
      });
    } else if (type === 'bug') {
      enemies.push({
        type, x: p.x, y: p.y, r: U * 0.014, hp: 1, maxHp: 1,
        spd: U * (0.23 + wave * 0.012), flash: 0, score: 50,
        phase: Math.random() * 6.28, vx: 0, vy: 0
      });
    } else if (type === 'abductor') {
      enemies.push({
        type, x: p.x, y: p.y, r: U * 0.034, hp: 6, maxHp: 6,
        spd: U * 0.1, target: null, beamT: 0,
        fireT: Kit.rand(2.5, 4), flash: 0, score: 250
      });
    } else if (type === 'boss') {
      const hp = wave >= 6 ? 95 : 60;
      const e = {
        type, x: W.w / 2, y: -U * 0.14, r: U * 0.075, hp, maxHp: hp,
        spd: U * 0.06, patT: 2.4, aimT: 1.7, minT: 5.5,
        flash: 0, score: 1500, entering: true
      };
      enemies.push(e);
      bossRef = e;
    }
  }

  function dropPod(x, y) {
    const roll = Math.random();
    const kind = roll < 0.4 ? 'SHIELD' : roll < 0.75 ? 'TRI' : 'EMP';
    pods.push({
      x: Kit.clamp(x, U * 0.05, W.w - U * 0.05),
      y: Kit.clamp(y, U * 0.07, W.h - U * 0.07),
      kind, phase: Math.random() * 6.28, lift: 0, beamed: null
    });
  }

  /* ---------------- combat ---------------- */
  function nearestEnemy(x, y) {
    let best = null, bd = Infinity;
    for (const e of enemies) {
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function fireBullets() {
    const spread = player.tri > 0 ? [-0.16, 0, 0.16] : [0];
    for (const off of spread) {
      const a = player.aim + off;
      bullets.push({
        x: player.x + Math.cos(a) * U * 0.03,
        y: player.y + Math.sin(a) * U * 0.03,
        vx: Math.cos(a) * BSPD * U, vy: Math.sin(a) * BSPD * U
      });
    }
    Audio.sfx('laser');
  }

  function hitEnemy(idx, bx, by, dmg) {
    const e = enemies[idx];
    e.hp -= dmg;
    e.flash = 0.07;
    particles.spawn(bx, by, { count: 3, color: '#EAF6FF', spread: 130, decay: 3, size: 1.8 });
    if (e.hp <= 0) killEnemy(idx);
  }

  function killEnemy(idx) {
    const e = enemies.splice(idx, 1)[0];
    if (e.type === 'boss') bossRef = null;
    particles.spawn(e.x, e.y, { count: 16, color: '#7DF9C6', spread: 260, decay: 1.8, size: 2.6, glow: true });
    particles.spawn(e.x, e.y, { count: 12, color: '#FF7A9E', spread: 220, decay: 2, size: 2.2 });
    Audio.sfx('explode');
    if (state !== 'battle') return;      // attract-mode kills are visual only
    if (e.type === 'boss') {
      G.shake(12);
      particles.spawn(e.x, e.y, { count: 24, color: '#FFD166', spread: 380, decay: 1.4, size: 3.2, glow: true });
      dropPod(e.x - e.r * 0.7, e.y);
      dropPod(e.x + e.r * 0.7, e.y);
    } else {
      G.shake(e.type === 'abductor' ? 5 : 2);
    }
    kills++;
    chainKills = comboT > 0 ? chainKills + 1 : 1;
    const prev = comboMult;
    comboMult = Math.min(COMBO_MAX, chainKills);
    comboT = COMBO_WINDOW;
    if (comboMult >= 4 && prev < 4) Mascot.react('combo');
    score += e.score * comboMult;
    dryKills++;
    if (e.type !== 'boss' && (Math.random() < POD_CHANCE || dryKills >= POD_PITY)) {
      dropPod(e.x, e.y);
      dryKills = 0;
    }
    checkWaveClear();
  }

  function hitPlayer() {
    if (state !== 'battle' || player.inv > 0) return;
    if (player.shield) {
      player.shield = false;
      player.inv = 0.9;
      Audio.sfx('whoosh');
      particles.spawn(player.x, player.y, { count: 14, color: '#7DF9C6', spread: 220, decay: 2, size: 2.4, glow: true });
      Kit.toast('Shield down');
      return;
    }
    lives--;
    chainKills = 0; comboMult = 1; comboT = 0;
    Audio.sfx('hit');
    Kit.buzz(90);
    G.shake(9);
    particles.spawn(player.x, player.y, { count: 26, color: '#7DF9C6', spread: 320, decay: 1.6, size: 3, glow: true });
    particles.spawn(player.x, player.y, { count: 18, color: '#FF7A9E', spread: 260, decay: 1.8, size: 2.6 });
    if (lives <= 0) { endRun(false); return; }
    player.inv = INV_TIME;
    player.x = W.w / 2;
    player.y = W.h * 0.72;
    if (lives === 1) Mascot.react('low');
  }

  function applyPod(kind) {
    Audio.sfx('powerup');
    Kit.buzz(25);
    if (kind === 'SHIELD') {
      player.shield = true;
      Kit.toast('Shield online');
      particles.spawn(player.x, player.y, { count: 12, color: '#7DF9C6', spread: 180, decay: 2.2, size: 2.4, glow: true });
    } else if (kind === 'TRI') {
      player.tri = TRI_TIME;
      Kit.toast('Triple shot — 10s');
      particles.spawn(player.x, player.y, { count: 12, color: '#FFD166', spread: 180, decay: 2.2, size: 2.4, glow: true });
    } else {
      popEmp();
    }
  }

  function popEmp() {
    rings.push({ x: player.x, y: player.y, r: U * 0.02, max: Math.max(W.w, W.h) * 0.8, spd: U * 1.5 });
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      hitEnemy(i, e.x, e.y, e.type === 'boss' ? 8 : e.type === 'abductor' ? 5 : 4);
    }
    ebullets.length = 0;
    G.shake(6);
    Audio.sfx('whoosh');
    Kit.toast('EMP discharge');
  }

  /* ---------------- update ---------------- */
  function update(dt) {
    const input = Kit.input;
    const battle = state === 'battle';

    if (state === 'countdown') {
      cdTimer += dt;
      const next = 3 - Math.floor(cdTimer / 0.55);
      if (next !== cdValue && next >= 0) {
        cdValue = next;
        showCountdown(next === 0 ? 'GO' : String(next));
        Audio.sfx(next === 0 ? 'chime' : 'select');
        if (next === 0) {
          state = 'battle';
          startWave(1);
          setTimeout(hideCountdown, 850);
        }
      }
    }

    /* --- player --- */
    if (battle || state === 'attract') {
      let mx = 0, my = 0;
      if (state === 'attract') {
        const oa = G.t * 0.55;
        const tx = W.w / 2 + Math.cos(oa) * W.w * 0.2;
        const ty = W.h * 0.6 + Math.sin(oa * 1.4) * W.h * 0.12;
        const ddx = tx - player.x, ddy = ty - player.y, dd = Math.hypot(ddx, ddy) || 1;
        const pull = Math.min(1, dd / 90);
        mx = ddx / dd * pull; my = ddy / dd * pull;
      } else {
        const ax = input.axis();
        mx = ax.x; my = ax.y;
        if (!mx && !my && performance.now() - mouse.t < 450) {
          const dx = mouse.x - player.x, dy = mouse.y - player.y, d = Math.hypot(dx, dy);
          if (d > 6) { mx = dx / d; my = dy / d; }
        }
      }
      const spd = PSPD * U;
      player.x = Kit.clamp(player.x + mx * spd * dt, U * 0.04 + 12, W.w - U * 0.04 - 12);
      player.y = Kit.clamp(player.y + my * spd * dt, U * 0.04 + 12, W.h - U * 0.04 - 12);
      player.moving = !!(mx || my);

      /* auto-aim: nearest hostile, else face travel direction */
      const target = nearestEnemy(player.x, player.y);
      let want = player.aim;
      if (target) want = Math.atan2(target.y - player.y, target.x - player.x);
      else if (player.moving) want = Math.atan2(my, mx);
      else want = -Math.PI / 2;
      player.aim = lerpAngle(player.aim, want, Math.min(1, dt * 14));

      player.fireCd -= dt;
      player.tri = Math.max(0, player.tri - dt);
      player.inv = Math.max(0, player.inv - dt);
      if (battle && (input.down('action') || mouseDown) && player.fireCd <= 0) {
        fireBullets();
        player.fireCd = ROF;
      }
      if (state === 'attract' && player.fireCd <= 0 && target) {
        fireBullets();
        player.fireCd = ROF * 1.6;
      }

      /* engine trail */
      if (player.moving && Math.random() < 0.5) {
        particles.spawn(
          player.x - Math.cos(player.aim) * U * 0.028,
          player.y - Math.sin(player.aim) * U * 0.028,
          { count: 1, color: '#7DF9C6', spread: 30, vx: -Math.cos(player.aim) * 70, vy: -Math.sin(player.aim) * 70, decay: 2.6, size: 1.9 }
        );
      }
    }

    /* --- attract spawner --- */
    if (state === 'attract') {
      attractT -= dt;
      if (attractT <= 0 && enemies.length < 5) {
        spawnEnemy(Math.random() < 0.72 ? 'scout' : 'bug');
        attractT = Kit.rand(1.6, 3);
      }
    }

    /* --- wave flow --- */
    if (battle) {
      if (spawnQ.length) {
        spawnT += dt;
        while (spawnQ.length && spawnQ[0].t <= spawnT) spawnEnemy(spawnQ.shift().type);
      } else if (waveGapT > 0) {
        waveGapT -= dt;
        if (waveGapT <= 0) {
          if (wave >= WAVES) { endRun(true); return; }
          startWave(wave + 1);
        }
      }
      /* debrief during the intermission: one bug-class concept, no rush */
      if (window.Learn && window.LEARN_DATA && waveGapT > 0 && !debriefOpen && wave < WAVES) {
        const card = Learn.nextCard();
        if (card) {
          debriefOpen = true;
          G.pause();
          Learn.show(card, { timer: 0, onClose: () => {
            debriefOpen = false;
            G.resume();
            waveGapT = 1.2;   // a breath before the next wave
          } }).then(ok => { if (ok) { score += 100 * wave; Kit.toast(`+${100 * wave} — correct call`); } });
        }
      }
    }

    /* --- enemies --- */
    for (const p of pods) p.beamed = null;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.flash = Math.max(0, e.flash - dt);
      updateEnemy(e, dt);
    }

    /* --- pods --- */
    for (let i = pods.length - 1; i >= 0; i--) {
      const p = pods[i];
      if (!p.beamed) p.lift = Math.max(0, p.lift - U * 0.08 * dt);
      if (battle && !p.beamed) {
        const rr = U * 0.04;
        if ((p.x - player.x) * (p.x - player.x) + (p.y - p.lift - player.y) * (p.y - p.lift - player.y) < rr * rr) {
          pods.splice(i, 1);
          applyPod(p.kind);
        }
      }
    }

    /* --- player bullets --- */
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -40 || b.x > W.w + 40 || b.y < -40 || b.y > W.h + 40) { bullets.splice(i, 1); continue; }
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const rr = e.r + 4;
        if ((e.x - b.x) * (e.x - b.x) + (e.y - b.y) * (e.y - b.y) < rr * rr) {
          bullets.splice(i, 1);
          hitEnemy(j, b.x, b.y, 1);
          break;
        }
      }
    }

    /* --- enemy bolts --- */
    for (let i = ebullets.length - 1; i >= 0; i--) {
      const b = ebullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -40 || b.x > W.w + 40 || b.y < -40 || b.y > W.h + 40) { ebullets.splice(i, 1); continue; }
      const rr = U * 0.016 + b.r;
      if ((player.x - b.x) * (player.x - b.x) + (player.y - b.y) * (player.y - b.y) < rr * rr) {
        ebullets.splice(i, 1);
        hitPlayer();
      }
    }

    /* --- contact damage --- */
    if (battle && player.inv <= 0) {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        const rr = e.r + U * 0.016;
        if ((e.x - player.x) * (e.x - player.x) + (e.y - player.y) * (e.y - player.y) < rr * rr) {
          if (e.type === 'bug') {
            enemies.splice(j, 1);
            particles.spawn(e.x, e.y, { count: 8, color: '#FF7A9E', spread: 180, decay: 2, size: 2 });
            Audio.sfx('hit');
          }
          hitPlayer();
          break;
        }
      }
    }

    /* --- EMP rings --- */
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.r += r.spd * dt;
      if (r.r >= r.max) rings.splice(i, 1);
    }

    /* --- combo clock --- */
    if (comboT > 0) {
      comboT -= dt;
      if (comboT <= 0) { comboT = 0; chainKills = 0; comboMult = 1; }
    }

    /* audio follows the fight */
    if (battle) {
      const bossUp = enemies.some(e => e.type === 'boss');
      Audio.setIntensity(Math.min(1, 0.28 + (wave - 1) * 0.12 + (bossUp ? 0.1 : 0)));
    }

    particles.update(dt);
  }

  function updateEnemy(e, dt) {
    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;

    if (e.type === 'scout') {
      const keep = U * 0.26 * e.orbit;
      let vx, vy;
      if (d > keep * 1.12) { vx = nx * e.spd; vy = ny * e.spd; }
      else if (d < keep * 0.8) { vx = -nx * e.spd * 0.8; vy = -ny * e.spd * 0.8; }
      else { vx = -ny * e.spd * 0.75 * e.dir; vy = nx * e.spd * 0.75 * e.dir; }
      e.x += vx * dt; e.y += vy * dt;
      if (state === 'battle') {
        e.fireT -= dt;
        if (e.fireT <= 0 && d < U * 0.6) {
          ebullets.push({ x: e.x, y: e.y, vx: nx * U * 0.21, vy: ny * U * 0.21, r: 4.5 });
          e.fireT = Kit.rand(2.7, 3.9) - Math.min(0.9, wave * 0.07);
        }
      }
    } else if (e.type === 'bug') {
      let vx, vy;
      if (state === 'attract' && d < U * 0.22) {
        vx = -nx * e.spd; vy = -ny * e.spd;
      } else {
        const zig = Math.sin(G.t * 4.5 + e.phase) * 0.85;
        vx = nx - ny * zig; vy = ny + nx * zig;
        const m = Math.hypot(vx, vy) || 1;
        vx = vx / m * e.spd; vy = vy / m * e.spd;
      }
      e.vx = vx; e.vy = vy;
      e.x += vx * dt; e.y += vy * dt;
    } else if (e.type === 'abductor') {
      if (!e.target) {
        let bd = Infinity;
        for (const p of pods) {
          const dd = (p.x - e.x) * (p.x - e.x) + (p.y - e.y) * (p.y - e.y);
          if (dd < bd) { bd = dd; e.target = p; }
        }
      }
      if (e.target) {
        const tdx = e.target.x - e.x, tdy = (e.target.y - U * 0.13) - e.y;
        const td = Math.hypot(tdx, tdy) || 1;
        if (td > 8) {
          e.x += tdx / td * e.spd * dt;
          e.y += tdy / td * e.spd * dt;
          e.beamT = Math.max(0, e.beamT - dt * 2);
        } else {
          e.beamT = Math.min(1, e.beamT + dt * 2.5);
          e.target.lift += dt * 60;
          e.target.beamed = e;
          if (e.target.lift > U * 0.2) {
            const pi = pods.indexOf(e.target);
            if (pi >= 0) pods.splice(pi, 1);
            e.target = null;
            e.beamT = 0;
            Kit.toast('Pod beamed away!');
            Audio.sfx('brake');
          }
        }
      } else if (d > U * 0.3) {
        e.x += nx * e.spd * 0.7 * dt;
        e.y += ny * e.spd * 0.7 * dt;
      }
      if (state === 'battle' && !e.target) {
        e.fireT -= dt;
        if (e.fireT <= 0 && d < U * 0.55) {
          ebullets.push({ x: e.x, y: e.y, vx: nx * U * 0.26, vy: ny * U * 0.26, r: 4.5 });
          e.fireT = Kit.rand(3, 4.5);
        }
      }
    } else if (e.type === 'boss') {
      const homeY = W.h * 0.24;
      if (e.entering) {
        e.y += e.spd * 2.4 * dt;
        if (e.y >= homeY) e.entering = false;
      } else {
        e.x = W.w / 2 + Math.sin(G.t * 0.45) * W.w * 0.24;
        e.y = homeY + Math.sin(G.t * 0.8) * U * 0.035;
      }
      if (state === 'battle' && !e.entering) {
        e.patT -= dt; e.aimT -= dt; e.minT -= dt;
        if (e.patT <= 0) {
          const n = 14, base = G.t * 0.7;
          for (let k = 0; k < n; k++) {
            const a = base + k * Math.PI * 2 / n;
            ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * U * 0.22, vy: Math.sin(a) * U * 0.22, r: 5 });
          }
          e.patT = 2.7;
          G.shake(2);
        }
        if (e.aimT <= 0) {
          const base = Math.atan2(dy, dx);
          for (let k = -2; k <= 2; k++) {
            const a = base + k * 0.14;
            ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * U * 0.3, vy: Math.sin(a) * U * 0.3, r: 5 });
          }
          e.aimT = 1.9;
        }
        if (e.minT <= 0) {
          const bugs = enemies.filter(x => x.type === 'bug').length;
          if (bugs < 4) {
            spawnEnemy('bug', e.x - e.r, e.y + e.r * 0.4);
            spawnEnemy('bug', e.x + e.r, e.y + e.r * 0.4);
          }
          e.minT = 6.5;
        }
      }
    }
  }

  function lerpAngle(a, b, t) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  /* ---------------- render ---------------- */
  function render(ctx, gg) {
    const { w, h } = W;

    /* deep-space gradient */
    if (!bgGrad) {
      bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#050A14');
      bgGrad.addColorStop(0.55, '#07101E');
      bgGrad.addColorStop(1, '#0A1830');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    /* drifting nebula blobs */
    for (const n of nebulas) {
      const nx = (((n.x + gg.t * n.dx) % 1) + 1) % 1 * w;
      const ny = (((n.y + gg.t * n.dy) % 1) + 1) % 1 * h;
      const nr = n.r * Math.min(w, h);
      const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      g.addColorStop(0, n.col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
    }

    /* 3-layer parallax starfield */
    ctx.fillStyle = '#EAF1FF';
    for (const L of starLayers) {
      for (const s of L.stars) {
        const sx = (((s.x + gg.t * L.spd + (player.x / w - 0.5) * L.par) % 1) + 1) % 1 * w;
        const sy = (((s.y + gg.t * L.spd * 0.6 + (player.y / h - 0.5) * L.par) % 1) + 1) % 1 * h;
        ctx.globalAlpha = L.a * (0.5 + 0.5 * Math.abs(Math.sin(gg.t * 1.3 + s.p)));
        ctx.fillRect(sx, sy, s.r, s.r);
      }
    }
    ctx.globalAlpha = 1;

    /* slow asteroid silhouettes */
    for (const a of asteroids) {
      const ax = (((a.x + gg.t * a.vx) % 1) + 1) % 1 * (w + 160) - 80;
      const ay = (((a.y + gg.t * a.vy) % 1) + 1) % 1 * (h + 160) - 80;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a.rot + gg.t * a.rotSpd);
      ctx.beginPath();
      for (let i = 0; i < a.verts.length; i++) {
        const ang = i / a.verts.length * Math.PI * 2;
        const rr = a.r * U * a.verts[i];
        if (i) ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        else ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = '#0C1828';
      ctx.fill();
      ctx.strokeStyle = 'rgba(143,165,196,0.14)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    /* planet horizon glow arc at the bottom */
    const pr = Math.max(w, h) * 0.7;
    const pcx = w * 0.5, pcy = h + pr * 0.82;
    if (!planetGlow) {
      planetGlow = ctx.createRadialGradient(pcx, pcy, pr * 0.9, pcx, pcy, pr * 1.06);
      planetGlow.addColorStop(0, 'rgba(125,249,198,0)');
      planetGlow.addColorStop(0.6, 'rgba(125,249,198,0.16)');
      planetGlow.addColorStop(0.85, 'rgba(125,249,198,0.05)');
      planetGlow.addColorStop(1, 'rgba(125,249,198,0)');
    }
    ctx.fillStyle = planetGlow;
    ctx.beginPath(); ctx.arc(pcx, pcy, pr * 1.06, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0A1626';
    ctx.beginPath(); ctx.arc(pcx, pcy, pr * 0.92, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(125,249,198,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pcx, pcy, pr * 0.92, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();

    /* tractor beams (under everything hostile) */
    for (const e of enemies) {
      if (e.type === 'abductor' && e.target && e.beamT > 0.05) drawBeam(ctx, e, gg);
    }

    /* pods */
    for (const p of pods) drawPod(ctx, p, gg);

    /* bullets */
    for (const b of bullets) {
      ctx.strokeStyle = 'rgba(125,249,198,0.45)';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = '#CFFFF0';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const b of ebullets) {
      ctx.fillStyle = 'rgba(255,122,158,0.22)';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FF7A9E';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFE9F0';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2); ctx.fill();
    }

    /* enemies */
    for (const e of enemies) {
      if (e.type === 'bug') drawBug(ctx, e, gg);
      else if (e.type === 'boss') drawBoss(ctx, e, gg);
      else drawSaucer(ctx, e.x, e.y, e.r, gg, e.flash > 0, e.type === 'abductor');
    }

    /* player + shield + EMP rings + particles */
    drawPlayer(ctx, gg);
    for (const r of rings) {
      const fade = 1 - r.r / r.max;
      ctx.strokeStyle = `rgba(125,249,198,${0.75 * fade})`;
      ctx.lineWidth = 3 + 7 * fade;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(234,246,255,${0.4 * fade})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * 0.86, 0, Math.PI * 2); ctx.stroke();
    }
    particles.render(ctx);

    if (!vignette || vignette.w !== w) {
      vignette = { w, g: ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.74) };
      vignette.g.addColorStop(0, 'rgba(0,0,0,0)'); vignette.g.addColorStop(1, 'rgba(3,8,16,0.5)');
    }
    ctx.fillStyle = vignette.g;
    ctx.fillRect(0, 0, w, h);

    updateHUD();
  }

  function drawBeam(ctx, e, gg) {
    const p = e.target;
    const flick = (0.7 + 0.3 * Math.sin(gg.t * 22)) * e.beamT;
    const topW = e.r * 0.22, botW = e.r * 0.5;
    const y0 = e.y + e.r * 0.3, y1 = p.y - p.lift;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(255,122,158,${0.5 * flick})`);
    g.addColorStop(1, `rgba(255,122,158,${0.06 * flick})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(e.x - topW, y0);
    ctx.lineTo(e.x + topW, y0);
    ctx.lineTo(p.x + botW, y1);
    ctx.lineTo(p.x - botW, y1);
    ctx.closePath();
    ctx.fill();
  }

  function drawPod(ctx, p, gg) {
    const col = p.kind === 'SHIELD' ? '#7DF9C6' : p.kind === 'TRI' ? '#FFD166' : '#FF7A9E';
    const y = p.y - p.lift - 4 * Math.sin(gg.t * 2 + p.phase);
    const r = U * 0.019;
    const pulse = 0.75 + 0.25 * Math.sin(gg.t * 3 + p.phase);
    const g = ctx.createRadialGradient(p.x, y, 1, p.x, y, r * 2.6);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.22 * pulse;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      const px = p.x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(10,20,36,0.9)';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = `800 ${Math.round(r * 1.1)}px 'Trebuchet MS', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.kind[0], p.x, y + 1);
  }

  function drawSaucer(ctx, x, y, r, gg, flash, amber) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, r * 1.6);
    g.addColorStop(0, 'rgba(255,122,158,0.13)');
    g.addColorStop(1, 'rgba(255,122,158,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = flash ? '#FFE9F0' : 'rgba(255,122,158,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.28, r * 0.52, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,122,158,0.8)';
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.stroke();

    ctx.fillStyle = flash ? '#FFFFFF' : '#233252';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,122,158,0.5)';
    ctx.stroke();

    const n = amber ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const a = gg.t * 1.8 + i * Math.PI * 2 / n;
      const bl = 0.5 + 0.5 * Math.sin(gg.t * 7 + i * 2.2);
      ctx.globalAlpha = 0.35 + 0.65 * bl;
      ctx.fillStyle = amber ? '#FFD166' : '#FF7A9E';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.24, Math.max(1.2, r * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBug(ctx, e, gg) {
    const flap = Math.sin(gg.t * 16 + e.phase);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.atan2(e.vy, e.vx) + Math.PI / 2);
    const ws = 0.45 + 0.55 * Math.abs(flap);
    ctx.fillStyle = 'rgba(255,122,158,0.5)';
    ctx.beginPath(); ctx.ellipse(-e.r * (0.6 + ws * 0.5), 0, e.r * 0.7 * ws, e.r * 0.32, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(e.r * (0.6 + ws * 0.5), 0, e.r * 0.7 * ws, e.r * 0.32, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = e.flash > 0 ? '#FFFFFF' : '#33202E';
    ctx.beginPath(); ctx.ellipse(0, 0, e.r * 0.62, e.r * 0.82, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#FF7A9E';
    ctx.lineWidth = Math.max(1, e.r * 0.14);
    ctx.stroke();
    ctx.fillStyle = '#FFD166';
    ctx.beginPath(); ctx.arc(-e.r * 0.22, -e.r * 0.4, Math.max(1, e.r * 0.14), 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e.r * 0.22, -e.r * 0.4, Math.max(1, e.r * 0.14), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBoss(ctx, e, gg) {
    const r = e.r, x = e.x, y = e.y;
    const g = ctx.createRadialGradient(x, y, 4, x, y, r * 1.7);
    g.addColorStop(0, 'rgba(255,122,158,0.16)');
    g.addColorStop(1, 'rgba(255,122,158,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, Math.PI * 2); ctx.fill();

    /* rotating light ring */
    ctx.strokeStyle = 'rgba(255,122,158,0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r * 1.28, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = gg.t * 0.9 + i * Math.PI / 4;
      const bl = 0.5 + 0.5 * Math.sin(gg.t * 6 + i);
      ctx.globalAlpha = 0.4 + 0.6 * bl;
      ctx.fillStyle = i % 2 ? '#FF7A9E' : '#FFD166';
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 1.28, y + Math.sin(a) * r * 1.28, Math.max(1.5, r * 0.06), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = e.flash > 0 ? '#FFE9F0' : 'rgba(255,122,158,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.3, r * 0.55, r * 0.48, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,122,158,0.85)';
    ctx.lineWidth = Math.max(1.5, r * 0.04);
    ctx.stroke();

    ctx.fillStyle = e.flash > 0 ? '#FFFFFF' : '#1B2A4A';
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,122,158,0.6)';
    ctx.stroke();

    const core = 0.6 + 0.4 * Math.sin(gg.t * 5);
    ctx.fillStyle = `rgba(255,209,102,${0.5 + 0.5 * core})`;
    ctx.beginPath(); ctx.arc(x, y + r * 0.02, r * 0.12 * (0.85 + 0.3 * core), 0, Math.PI * 2); ctx.fill();
  }

  function drawPlayer(ctx, gg) {
    const s = U * 0.028;
    const p = player;
    const blink = p.inv > 0 && Math.floor(gg.t * 12) % 2 === 0;

    /* shield bubble behind the hull */
    if (p.shield) {
      const sr = s * 2.1;
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(gg.t * 5);
      ctx.strokeStyle = '#7DF9C6';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, sr, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(125,249,198,0.07)';
      ctx.fill();
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, sr, gg.t * 2.2 + i * 2.1, gg.t * 2.2 + i * 2.1 + 0.7);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.globalAlpha = blink ? 0.25 : 1;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aim + Math.PI / 2);

    /* engine glow */
    const flick = 0.7 + Math.random() * 0.3;
    const eg = ctx.createRadialGradient(0, s * 1.2, 1, 0, s * 1.2, s * 1.4);
    eg.addColorStop(0, `rgba(125,249,198,${0.5 * flick})`);
    eg.addColorStop(1, 'rgba(125,249,198,0)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(0, s * 1.2, s * 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(234,246,255,${0.75 * flick})`;
    ctx.beginPath(); ctx.ellipse(0, s * 0.85, s * 0.16, s * (0.34 + 0.16 * flick), 0, 0, Math.PI * 2); ctx.fill();

    /* hull: sleek dart */
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.5);
    ctx.quadraticCurveTo(s * 0.16, -s * 0.5, s * 1.05, s * 0.6);
    ctx.lineTo(s * 0.34, s * 0.78);
    ctx.lineTo(0, s * 0.52);
    ctx.lineTo(-s * 0.34, s * 0.78);
    ctx.lineTo(-s * 1.05, s * 0.6);
    ctx.quadraticCurveTo(-s * 0.16, -s * 0.5, 0, -s * 1.5);
    ctx.closePath();
    ctx.fillStyle = '#13223C';
    ctx.fill();
    ctx.strokeStyle = '#7DF9C6';
    ctx.lineWidth = Math.max(1.2, s * 0.09);
    ctx.stroke();

    /* wing accents */
    ctx.fillStyle = '#FF7A9E';
    ctx.beginPath(); ctx.moveTo(s * 0.42, s * 0.14); ctx.lineTo(s * 1.0, s * 0.56); ctx.lineTo(s * 0.4, s * 0.6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.42, s * 0.14); ctx.lineTo(-s * 1.0, s * 0.56); ctx.lineTo(-s * 0.4, s * 0.6); ctx.closePath(); ctx.fill();

    /* canopy slit */
    ctx.fillStyle = 'rgba(125,249,198,0.5)';
    ctx.beginPath(); ctx.ellipse(0, -s * 0.55, s * 0.12, s * 0.34, 0, 0, Math.PI * 2); ctx.fill();

    /* triple-shot pips */
    if (p.tri > 0) {
      ctx.fillStyle = '#FFD166';
      for (const off of [-0.3, 0, 0.3]) {
        ctx.beginPath();
        ctx.arc(Math.sin(off) * s * 1.7, -Math.cos(off) * s * 1.7, s * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ---------------- HUD ---------------- */
  let hudEls = null;
  function buildHUD() {
    const hud = document.getElementById('hud');
    hud.innerHTML = `
      <div class="hud-top">
        <div class="chip score-chip"><small>Score</small><b id="hw-score">0</b></div>
        <div class="chip"><small>Wave</small><span id="hw-wave">1/${WAVES}</span></div>
        <div class="chip lives-chip"><small>Hull</small><b id="hw-lives">▲▲▲</b></div>
        <div class="chip combo-chip"><small>Combo</small><b id="hw-mult">x1</b><div class="meter combo-meter"><i id="hw-combo"></i></div></div>
      </div>
      <div class="hud-mid">
        <div class="chip" id="hw-bosschip" hidden><small>Mothership</small><div class="meter boss-meter"><i id="hw-boss"></i></div></div>
      </div>`;
    hudEls = {
      score: document.getElementById('hw-score'),
      wave: document.getElementById('hw-wave'),
      lives: document.getElementById('hw-lives'),
      mult: document.getElementById('hw-mult'),
      combo: document.getElementById('hw-combo'),
      bosschip: document.getElementById('hw-bosschip'),
      boss: document.getElementById('hw-boss')
    };
  }
  function updateHUD() {
    if (!hudEls || state === 'attract') return;
    hudEls.score.textContent = Kit.fmt(score);
    hudEls.wave.textContent = `${Math.max(1, wave)}/${WAVES}`;
    hudEls.lives.textContent = '▲'.repeat(Math.max(0, lives));
    hudEls.mult.textContent = 'x' + comboMult;
    hudEls.combo.style.width = (comboT > 0 ? comboT / COMBO_WINDOW * 100 : 0) + '%';
    const boss = bossRef && bossRef.hp > 0 ? bossRef : null;
    hudEls.bosschip.hidden = !boss;
    if (boss) hudEls.boss.style.width = (boss.hp / boss.maxHp * 100) + '%';
  }

  let cdEl = null;
  function showCountdown(txt) {
    if (!cdEl) {
      cdEl = document.createElement('div');
      cdEl.className = 'countdown';
      document.querySelector('.game-root').appendChild(cdEl);
    }
    cdEl.innerHTML = `<span>${txt}</span>`;
  }
  function hideCountdown() { if (cdEl) cdEl.innerHTML = ''; }

  /* ---------------- mouse (desktop steering + fire) ---------------- */
  const mouse = { x: 0, y: 0, t: -1e9 };
  let mouseDown = false;
  const canvas = document.getElementById('stage');
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    mouse.x = e.clientX; mouse.y = e.clientY;
    mouse.t = performance.now();
  });
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    mouse.x = e.clientX; mouse.y = e.clientY;
    mouse.t = performance.now();
    mouseDown = true;
  });
  window.addEventListener('pointerup', () => { mouseDown = false; });
  window.addEventListener('blur', () => { mouseDown = false; });

  /* ---------------- songs ---------------- */
  Audio.defineSong('menu', {
    bpm: 92,
    bars: 4,
    layers: [
      { type: 'pad', wave: 'sawtooth', steps: 'A2 - - - - - - - - - - - - - - - F2 - - - - - - - - - - - - - - - C3 - - - - - - - - - - - - - - - G2 - - - - - - - - - - - - - - -', gain: 0.13, cutoff: 720, attack: 1.1, release: 2.4 },
      { type: 'bass', wave: 'triangle', steps: 'A1 . . . . . . . . . A1 . . . . . F1 . . . . . . . . . F1 . . . . . C2 . . . . . . . . . C2 . . . . . G1 . . . . . . . . . G1 . . . . .', gain: 0.2 },
      { type: 'arp', wave: 'square', steps: '. . . . . . . A4 . . . . E5 . . . . . A4 . . . . . C5 . . . . F5 . . . . . . G4 . . . . C5 . . E5 . . G5 . . B4 . . . . . D5 . . . G4 . . .', gain: 0.07, cutoff: 1700 },
      { type: 'hat', steps: '. . a . . . a . . . a . . . a . . . a . . . a . . . a . . . a . . . a . . . a . . . a . . . a . . . a . . . a . . . a . . . a .', gain: 0.07 }
    ]
  });
  Audio.defineSong('battle', {
    bpm: 128,
    bars: 2,
    layers: [
      { type: 'bass', wave: 'sawtooth', steps: 'A1 A1 A2 A1 A1 A1 A2 A1 G1 G1 G2 G1 G1 G1 G2 G1 F1 F1 F2 F1 F1 F1 F2 F1 G1 G1 G2 G1 G1 G1 A1 A1', gain: 0.26, cutoff: 640 },
      { type: 'kick', steps: 'a . . . a . . . a . . . a . . . a . . . a . . . a . . . a . a .', gain: 0.7 },
      { type: 'snare', steps: '. . . . x . . . . . . . x . . . . . . . x . . . . . . . x . x .', gain: 0.2 },
      { type: 'hat', steps: '. . a . . . a . . . a . . . a a . . a . . . a . a . a . . . a a', gain: 0.13 },
      { type: 'arp', wave: 'square', steps: 'A3 . C4 . E4 . G4 . A3 . C4 . E4 . G4 . F3 . A3 . C4 . E4 . G3 . B3 . D4 . F4 .', gain: 0.1, cutoff: 2200 },
      { type: 'lead', wave: 'sawtooth', steps: '. . . . . . . . E4 . . G4 . A4 . . . . E4 . D4 . . . C4 . D4 . E4 . .', gain: 0.13, cutoff: 2400, intensity: true }
    ]
  });

  /* ---------------- shell wiring ---------------- */
  window.GAME = {
    id: 'saucer-siege',
    brand: 'SAUCER SIEGE',
    kicker: 'Sector 7 Defense Grid',
    title: 'SAUCER <em>SIEGE</em>',
    tagline: 'One dart-ship holds Sector 7 against six waves of saucers, swarms and motherships. Chain your kills, race the abductors to the pods, keep the grid alive.',
    best: { key: 'saucer.best', display: Kit.fmt },
    controls: [
      { key: 'WASD / ←↑↓→', text: '<b>Thrusters.</b> The dart-ship flies freely across the whole sector — standing ships are hit ships.' },
      { key: 'Space', text: '<b>Fire.</b> Hold for autofire. The ship auto-aims at the nearest hostile, so fly the dodges and let the guns track.' },
      { key: 'Mouse', text: '<b>Steer by cursor, click to fire.</b> On desktop the ship follows the mouse while it moves.' },
      { key: 'Pods', text: '<b>Glowing hexes</b> drop from kills: <b>S</b> shield absorbs a hit, <b>T</b> triple-shot for 10 seconds, <b>E</b> EMP pulse wipes bullets and burns the wave.' },
      { key: 'Abductors', text: '<b>Big amber-lit saucers</b> tractor-beam your power pods off the field. Kill them before the pod lifts clear.' },
      { key: 'Combo', text: '<b>Kills within 2.5s chain a x2–x8 multiplier.</b> Taking a hit resets the chain.' },
      { key: 'Waves', text: '<b>Six waves.</b> Waves 3 and 6 bring a mothership with radial bullet patterns and escort spawns. Best score is saved on this device.' }
    ],
    touch: {
      joy: true,
      buttons: [{ name: 'action', label: 'FIRE', primary: true }]
    },
    mascot: {
      name: 'Pip — mission controller',
      accent: '#7DF9C6',
      lines: {
        welcome: ['Pip on comms. Scopes lit up the moment you docked — the saucers found the sector.', 'Welcome to the grid, pilot. Keep moving; standing ships are hit ships.'],
        return: ['Sector is quiet... too quiet. Ready when you are.', 'The scouts have been probing our perimeter all night.'],
        start: ['Waves inbound. Shield tight, trigger loose.', 'Scopes are hot. Good hunting.'],
        wave: ['Wave down. Regen a breath — next one is forming.', 'Clean sweep! Scopes show more inbound.'],
        boss: ['Mothership on scope. Kill its escort first!', 'Big signature incoming. Stay off its radial patterns.'],
        combo: ['Chain is live — keep the streak burning!', 'That multiplier is paying for the whole war.'],
        low: ['Hull is critical — dodge, do not trade.', 'One hit from blacking out. Disengage!'],
        win: ['Sector secured. Command owes you a drink.', 'All saucers down. Incredible shooting.'],
        fail: ['Grid is overrun... reboot and go again.', 'They took this one. The sector needs you back out there.']
      },
      cooldowns: { wave: 8000, boss: 15000, combo: 7000, low: 10000 }
    },
    learn: {
      intro: window.LEARN_DATA.intro,
      banks: window.LEARN_DATA.banks
    },
    menuSong: 'menu',
    gameSong: 'battle',
    onStart() { hideCountdown(); buildHUD(); startRun(); G.resume(); Kit.showScreen('hud'); },
    onRestart() { hideCountdown(); buildHUD(); startRun(); G.resume(); },
    onPause() { G.pause(); },
    onResume() { if (state === 'countdown' || state === 'battle') G.resume(); },
    onQuit() { G.stop(); hideCountdown(); toAttract(); G.start(); }
  };

  /* ---------------- boot ---------------- */
  G = Kit.game({
    canvas,
    onResize(dim) {
      W.w = dim.w; W.h = dim.h;
      U = Math.max(400, Math.min(1100, Math.min(dim.w, dim.h)));
      bgGrad = null; vignette = null; planetGlow = null;
      if (player) {
        player.x = Kit.clamp(player.x, 20, W.w - 20);
        player.y = Kit.clamp(player.y, 20, W.h - 20);
      }
    },
    update,
    render
  });

  buildScenery();
  toAttract();
  G.start();

})();
