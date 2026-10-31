/* ============================================================
 * SHELL — shared chrome: top bar, menu / how-to / settings /
 * pause / results screens, touch controls, mascot dock, audio
 * unlock. A game declares window.GAME before loading this file
 * and provides onStart/onPause/onResume/onQuit callbacks.
 * ============================================================ */
(function () {
  'use strict';

  const G = window.GAME || {};
  const $ = sel => document.querySelector(sel);

  /* ---------- detect touch capability ---------- */
  const isTouch = window.matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
  if (isTouch) document.body.classList.add('touch');

  /* ---------- build chrome ---------- */
  const icons = {
    sound: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9c1.4 1.4 1.4 4.6 0 6" class="w1"/><path d="M18.5 6.5c2.8 2.8 2.8 8.2 0 11" class="w2"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
    help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.9.5-1.1 1-1.1 1.8"/><path d="M12 17h.01"/></svg>'
  };

  const topbar = document.createElement('div');
  topbar.className = 'topbar';
  topbar.innerHTML = `
    <div class="brand">${G.brand || ''}</div>
    <button class="iconbtn" id="btn-help" aria-label="How to play">${icons.help}</button>
    <button class="iconbtn" id="btn-sound" aria-label="Toggle sound">${icons.sound}</button>
    <button class="iconbtn" id="btn-pause" aria-label="Pause" hidden>${icons.pause}</button>`;
  document.querySelector('.game-root').appendChild(topbar);

  /* screens */
  const mk = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };

  const menu = mk(`<section class="screen active" data-screen="menu">
    <div class="kicker">${G.kicker || 'Arcade'}</div>
    <h1 class="title">${G.title || 'Game'}</h1>
    <p class="tagline">${G.tagline || ''}</p>
    <div class="statcard" id="menu-stats"></div>
    <div class="btnrow">
      <button class="btn primary" id="btn-play">Play</button>
      <button class="btn" id="btn-howto">How to play</button>
      <button class="btn" id="btn-codex" hidden>Concepts</button>
      <button class="btn ghost" id="btn-settings">Settings</button>
    </div>
    <p class="beststat" id="menu-best"></p>
    <p class="byline">Crafted by <b>Siddhant Pardeshi</b> · <a href="https://siddhant-pardeshi.github.io/game-deck/" target="_blank" rel="noopener">The Game Deck</a></p>
  </section>`);

  const howto = mk(`<section class="screen scroll" data-screen="howto">
    <div class="kicker">How to play</div>
    <h1 class="title" style="font-size:clamp(24px,5vw,38px)">${G.title || 'Game'}</h1>
    <div class="howto">${(G.controls || []).map(c =>
      `<div class="hrow"><div class="hkey">${c.key}</div><p>${c.text}</p></div>`).join('')}
    </div>
    <div class="btnrow"><button class="btn primary" id="btn-howto-back">Got it</button></div>
  </section>`);

  const settings = mk(`<section class="screen" data-screen="settings">
    <div class="kicker">Settings</div>
    <h1 class="title" style="font-size:clamp(24px,5vw,38px)">Tune it up</h1>
    <div class="settings">
      <div class="srow"><label>Master</label><div class="vol"><input type="range" id="v-master" min="0" max="1" step="0.05"><span id="v-master-n"></span></div></div>
      <div class="srow"><label>Music</label><div class="vol"><input type="range" id="v-music" min="0" max="1" step="0.05"><span id="v-music-n"></span></div></div>
      <div class="srow"><label>Effects</label><div class="vol"><input type="range" id="v-sfx" min="0" max="1" step="0.05"><span id="v-sfx-n"></span></div></div>
      <div class="srow"><label>Quality</label><select id="s-quality"><option value="low">Low — battery saver</option><option value="med">Balanced</option><option value="high">High</option><option value="auto">Auto</option></select></div>
      <div class="srow"><label>Reduced motion</label><span class="switch"><input type="checkbox" id="c-rm"><i></i></span></div>
      <div class="srow"><label>Camera shake</label><span class="switch"><input type="checkbox" id="c-shake" checked><i></i></span></div>
      <div class="srow"><label>Show ${G.mascot ? G.mascot.name : 'mascot'}</label><span class="switch"><input type="checkbox" id="c-mascot" checked><i></i></span></div>
      <div class="srow"><label>Fullscreen</label><button class="btn ghost" id="btn-fs" style="min-height:40px;padding:8px 18px">Toggle</button></div>
      <button class="dangerlink" id="btn-reset">Reset all progress</button>
    </div>
    <div class="btnrow"><button class="btn primary" id="btn-settings-back">Done</button></div>
  </section>`);

  const pause = mk(`<section class="screen" data-screen="pause">
    <div class="kicker">Paused</div>
    <h1 class="title" style="font-size:clamp(26px,6vw,44px)">Catch your breath</h1>
    <div class="btnrow">
      <button class="btn primary" id="btn-resume">Resume</button>
      <button class="btn" id="btn-restart">Restart run</button>
      <button class="btn ghost" id="btn-quit">Menu</button>
    </div>
  </section>`);

  const results = mk(`<section class="screen" data-screen="results">
    <div class="medal" id="r-medal">🏁</div>
    <div class="kicker" id="r-kicker">Run complete</div>
    <h1 class="title" style="font-size:clamp(26px,6vw,46px)" id="r-title">Nice flying</h1>
    <div class="statcard" id="r-stats"></div>
    <p class="beststat" id="r-best"></p>
    <div class="btnrow">
      <button class="btn primary" id="btn-again">Play again</button>
      <button class="btn ghost" id="btn-rmenu">Menu</button>
    </div>
  </section>`);

  const codex = mk(`<section class="screen scroll" data-screen="codex">
    <div class="kicker">Concept codex</div>
    <h1 class="title" style="font-size:clamp(24px,5vw,38px)">What you know</h1>
    <p class="tagline" id="codex-summary"></p>
    <div class="codex" id="codex-list"></div>
    <div class="btnrow"><button class="btn primary" id="btn-codex-back">Back</button></div>
  </section>`);

  const hud = mk(`<div class="hud" id="hud" hidden></div>`);
  const veil = mk(`<div class="veil" id="veil"><div class="v-inner"><div class="v-title">${G.brand || 'Loading'}</div><div class="v-bar"><i></i></div></div></div>`);

  const root = document.querySelector('.game-root');
  [menu, howto, settings, codex, pause, results, hud].forEach(el => root.appendChild(el));
  document.body.appendChild(veil);

  /* touch controls */
  if (G.touch) {
    const tui = mk(`<div class="touchui" id="touchui"></div>`);
    if (G.touch.joy) tui.innerHTML += `<div class="joy" id="joy"><div class="joy-knob"></div></div>`;
    if (G.touch.buttons && G.touch.buttons.length) {
      const col = mk(`<div class="tbtns"></div>`);
      G.touch.buttons.forEach(b => {
        const el = mk(`<button class="tbtn ${b.primary ? 'primary' : ''}" data-btn="${b.name}" aria-label="${b.label}">${b.label}</button>`);
        col.appendChild(el);
      });
      tui.appendChild(col);
    }
    root.appendChild(tui);
    Kit._bindTouch(
      $('#joy'),
      (G.touch.buttons || []).map(b => ({ el: tui.querySelector(`[data-btn="${b.name}"]`), name: b.name })),
      tui
    );
  }

  /* mascot dock */
  const dock = mk(`<div class="mascot-dock" id="mascot-dock"></div>`);
  root.appendChild(dock);

  /* ---------- wiring ---------- */
  const S = Kit.screens;
  const showScreen = n => { S.show(n); $('#btn-pause').hidden = n !== 'hud'; hud.hidden = n !== 'hud'; };

  let wasPausedByUser = false;
  function togglePause() {
    if (S.active() === 'hud') {
      wasPausedByUser = true;
      G.onPause && G.onPause();
      showScreen('pause');
      Mascot.react('pause');
      Audio.duck(400);
    } else if (S.active() === 'pause') {
      resume();
    }
  }
  function resume() {
    wasPausedByUser = false;
    showScreen('hud');
    G.onResume && G.onResume();
    Mascot.react('resume');
  }

  $('#btn-play').addEventListener('click', () => { Audio.sfx('select'); G.onStart && G.onStart(); });
  $('#btn-howto').addEventListener('click', () => { Audio.sfx('ui'); showScreen('howto'); });
  $('#btn-howto-back').addEventListener('click', () => { Audio.sfx('back'); showScreen('menu'); });
  $('#btn-settings').addEventListener('click', () => { Audio.sfx('ui'); showScreen('settings'); });
  $('#btn-settings-back').addEventListener('click', () => { Audio.sfx('back'); showScreen('menu'); });
  $('#btn-codex').addEventListener('click', () => { Audio.sfx('ui'); renderCodex(); showScreen('codex'); });
  $('#btn-codex-back').addEventListener('click', () => { Audio.sfx('back'); showScreen('menu'); });
  $('#btn-pause').addEventListener('click', togglePause);
  $('#btn-resume').addEventListener('click', () => { Audio.sfx('select'); resume(); });
  $('#btn-restart').addEventListener('click', () => { Audio.sfx('select'); showScreen('hud'); G.onRestart ? G.onRestart() : G.onStart(); });
  $('#btn-quit').addEventListener('click', () => { Audio.sfx('back'); G.onQuit && G.onQuit(); showScreen('menu'); refreshMenuStats(); });
  $('#btn-again').addEventListener('click', () => { Audio.sfx('select'); showScreen('hud'); G.onStart(); });
  $('#btn-rmenu').addEventListener('click', () => { Audio.sfx('back'); G.onQuit && G.onQuit(); showScreen('menu'); refreshMenuStats(); });
  $('#btn-help').addEventListener('click', () => {
    Audio.sfx('ui');
    if (S.active() === 'hud') { togglePause(); }
    showScreen('howto');
  });

  Kit._onPauseKey = togglePause;
  Kit._onMuteKey = () => toggleMute();

  /* sound */
  function refreshSoundBtn() {
    const muted = Kit.settings.volumes.master === 0;
    $('#btn-sound').innerHTML = muted ? icons.mute : icons.sound;
    $('#btn-sound').classList.toggle('muted', muted);
    $('#btn-sound').setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  }
  function toggleMute() {
    const v = Kit.settings.volumes;
    v.master = v.master === 0 ? (Kit._preMute || 0.9) : 0;
    if (v.master !== 0) Kit._preMute = v.master;
    Kit.saveSettings(); Kit.applyAudioSettings(); refreshSoundBtn();
  }
  $('#btn-sound').addEventListener('click', toggleMute);
  refreshSoundBtn();

  /* settings bindings */
  const st = Kit.settings;
  function bindVol(id, key) {
    const el = $(id), n = $(id + '-n');
    el.value = st.volumes[key];
    n.textContent = Math.round(st.volumes[key] * 100) + '%';
    el.addEventListener('input', () => {
      st.volumes[key] = parseFloat(el.value);
      n.textContent = Math.round(st.volumes[key] * 100) + '%';
      Kit.saveSettings(); Kit.applyAudioSettings();
    });
  }
  bindVol('#v-master', 'master'); bindVol('#v-music', 'music'); bindVol('#v-sfx', 'sfx');
  const qsel = $('#s-quality');
  qsel.value = st.quality;
  qsel.addEventListener('change', () => { st.quality = qsel.value; Kit.saveSettings(); });
  const rmC = $('#c-rm'); rmC.checked = st.reducedMotion;
  rmC.addEventListener('change', () => {
    st.reducedMotion = rmC.checked; Kit.saveSettings();
    document.body.classList.toggle('rm', rmC.checked);
    const mr = document.querySelector('.mascot-root'); if (mr) mr.classList.toggle('rm', rmC.checked);
  });
  if (st.reducedMotion) document.body.classList.add('rm');
  const shC = $('#c-shake'); shC.checked = st.shake;
  shC.addEventListener('change', () => { st.shake = shC.checked; Kit.saveSettings(); });
  const msC = $('#c-mascot'); msC.checked = st.showMascot;
  msC.addEventListener('change', () => {
    st.showMascot = msC.checked; Kit.saveSettings();
    msC.checked ? Mascot.show() : Mascot.hide();
  });
  $('#btn-fs').addEventListener('click', () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (e) {}
  });
  $('#btn-reset').addEventListener('click', () => {
    if (confirm('Wipe saved progress and settings for this game?')) {
      Object.keys(localStorage).filter(k => k.startsWith('sidgames.')).forEach(k => localStorage.removeItem(k));
      location.reload();
    }
  });

  /* menu stats */
  function refreshMenuStats() {
    const box = $('#menu-stats');
    const best = G.best ? Kit.store.get(G.best.key, null) : null;
    if (best == null) { box.style.display = 'none'; $('#menu-best').textContent = ''; return; }
    box.style.display = '';
    box.innerHTML = (G.best.display ? G.best.display(best) : `<div class="stat"><b>${Kit.fmt(best)}</b><span>Best</span></div>`);
    $('#menu-best').innerHTML = '';
  }
  refreshMenuStats();

  /* results */
  function confettiBurst() {
    if (Kit.reducedMotion()) return;
    const host = document.createElement('div');
    host.className = 'confetti';
    const colors = ['#FFD166', '#7EE8FF', '#FF6EC7', '#8AFFC1', '#B08CFF'];
    for (let i = 0; i < 26; i++) {
      const bit = document.createElement('i');
      bit.style.left = Math.random() * 100 + 'vw';
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = (Math.random() * 0.5) + 's';
      bit.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      bit.style.setProperty('--rx', (Math.random() * 720 - 360) + 'deg');
      bit.style.width = (6 + Math.random() * 6) + 'px';
      bit.style.height = (10 + Math.random() * 8) + 'px';
      host.appendChild(bit);
    }
    document.body.appendChild(host);
    setTimeout(() => host.remove(), 3400);
  }

  Kit.showResults = ({ medal = '🏆', kicker = 'Run complete', title = 'Nice flying', stats = [], best, mascotLine } = {}) => {
    $('#r-medal').textContent = medal;
    $('#r-kicker').textContent = kicker;
    $('#r-title').textContent = title;
    let statHtml = stats.map(s => `<div class="stat"><b>${s.value}</b><span>${s.label}</span></div>`).join('');
    if (window.Learn && G.learn) {
      const sum = Learn.summary();
      if (sum.seen > 0) statHtml += `<div class="stat"><b>${sum.right}/${sum.right + sum.wrong}</b><span>Concepts</span></div><div class="stat"><b>${sum.mastered}</b><span>Mastered</span></div>`;
    }
    $('#r-stats').innerHTML = statHtml;
    if (best) {
      const prev = Kit.store.get(G.best.key, best.lowerBetter ? Infinity : 0);
      const isPB = best.lowerBetter ? best.value < prev : best.value > prev;
      if (isPB) { Kit.store.set(G.best.key, best.value); confettiBurst(); }
      const disp = G.best && G.best.display ? G.best.display(prev) : Kit.fmt(prev);
      $('#r-best').innerHTML = isPB ? `<b>New personal best!</b>` : `Personal best <b>${disp}</b>`;
    } else $('#r-best').textContent = '';
    showScreen('results');
    Audio.sfx('fanfare');
    Mascot.react('win');
    if (mascotLine) Mascot.say(mascotLine, 5000);
    refreshMenuStats();
  };
  Kit.showScreen = showScreen;
  Kit.pauseToggle = togglePause;

  /* ---------- learn layer ---------- */
  if (G.learn && window.Learn) {
    Learn.configure(G.id);
    Learn.define(G.learn.banks);
    $('#btn-codex').hidden = false;
  }
  function renderCodex() {
    const list = $('#codex-list');
    if (!G.learn || !window.Learn) { list.innerHTML = ''; return; }
    const sum = Learn.summary();
    $('#codex-summary').textContent = G.learn.intro || '';
    let html = '';
    for (const [track, cards] of Object.entries(G.learn.banks)) {
      html += `<h3 class="codex-track">${track}</h3>`;
      html += cards.map(c => {
        const st = Learn.stars(c.id);
        const starRow = '★'.repeat(st) + '☆'.repeat(3 - st);
        return `<details class="codex-card"><summary><span class="cx-stars">${starRow}</span> ${c.q}</summary><p class="cx-why">${c.why}</p></details>`;
      }).join('');
    }
    html += `<p class="codex-note">${sum.seen} of ${sum.total} concepts encountered · ${sum.mastered} mastered (3 correct each)</p>`;
    list.innerHTML = html;
  }

  /* ---------- mascot ---------- */
  Mascot.mount(dock, Object.assign({}, G.mascot));
  if (!Kit.settings.showMascot) Mascot.hide();

  /* ---------- boot ---------- */
  window.addEventListener('load', () => {
    setTimeout(() => veil.classList.add('off'), 350);
    if (!Kit.settings.firstVisitDone) {
      Kit.settings.firstVisitDone = true;
      Kit.saveSettings();
      setTimeout(() => Mascot.react('welcome'), 900);
    } else {
      setTimeout(() => Mascot.react('return'), 900);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && Kit.screens.active() === 'hud') togglePause();
  });

  document.addEventListener('contextmenu', e => { if (e.target.tagName === 'CANVAS') e.preventDefault(); });
})();
