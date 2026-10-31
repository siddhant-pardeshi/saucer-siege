/* ============================================================
 * LEARN ENGINE — the deck's teaching layer.
 *
 * Real content, delivered through play: short concept cards with
 * choices, an explanation for every answer, mastery tracking and
 * a Codex screen. Games surface cards at natural micro-breaks
 * (lap lines, wave changes, stage transitions, debriefs) and
 * reward correct answers inside the game's own economy.
 *
 *   Learn.define(banks)      { trackName: [card, ...] }
 *   Learn.nextCard(track?)   mastery-weighted, no instant repeats
 *   Learn.show(card, opts)   Promise<correct> — overlay card
 *   Learn.summary()          {seen, right, wrong, mastered}
 *   Learn.record(id, ok)     persisted via Kit.store
 *
 * Card: { id, q, choices:[..], a: index, why, tag }
 * opts: { timer: seconds|0, onOpen, onClose } — the game may pause
 * its simulation on open and resume on close.
 * The overlay is keyboard-first (1-4 / Enter), tap-friendly,
 * skippable, and never longer than a breath.
 * ============================================================ */
(function () {
  'use strict';

  const S = { banks: {}, lastIds: [], storeKey: 'learn.default' };

  function configure(gameId) {
    S.storeKey = 'learn.' + (gameId || 'default');
  }

  function loadMastery() {
    return Kit.store.get(S.storeKey, {});
  }
  function saveMastery(m) {
    Kit.store.set(S.storeKey, m);
  }

  function define(banks) {
    Object.assign(S.banks, banks);
  }

  function allCards() {
    const out = [];
    for (const track of Object.keys(S.banks)) {
      S.banks[track].forEach(c => out.push({ ...c, track }));
    }
    return out;
  }

  function nextCard(track) {
    const cards = allCards().filter(c => !track || c.track === track);
    if (!cards.length) return null;
    const mastery = loadMastery();
    const recent = new Set(S.lastIds.slice(-Math.min(6, cards.length - 1)));
    const score = c => {
      const m = mastery[c.id];
      if (!m) return 0;                                  // unseen first
      if (m.right === 0 && m.wrong > 0) return 1;        // failed ones return
      if (m.right < 3) return 2 + (m.last || 0) * 0.1;   // then unmastered
      return 8 + (m.last || 0) * 0.1;                    // mastered last
    };
    const pool = cards.filter(c => !recent.has(c.id));
    pool.sort((a, b) => score(a) - score(b));
    const pick = pool[0] || cards[Math.floor(Math.random() * cards.length)];
    S.lastIds.push(pick.id);
    if (S.lastIds.length > 24) S.lastIds.shift();
    return pick;
  }

  function record(id, ok) {
    const m = loadMastery();
    const e = m[id] || { right: 0, wrong: 0, last: 0 };
    if (ok) e.right++; else e.wrong++;
    e.last = Date.now();
    m[id] = e;
    saveMastery(m);
  }

  function summary() {
    const m = loadMastery();
    const cards = allCards();
    let seen = 0, right = 0, wrong = 0, mastered = 0;
    for (const c of cards) {
      const e = m[c.id];
      if (e) { seen++; right += e.right; wrong += e.wrong; }
      if (e && e.right >= 3) mastered++;
    }
    return { total: cards.length, seen, right, wrong, mastered };
  }

  function stars(id) {
    const e = loadMastery()[id];
    if (!e) return 0;
    return Math.min(3, e.right);
  }

  /* ---------------- the card overlay ---------------- */
  let overlay = null;
  let openCard = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'learn-card';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'false');
    document.body.appendChild(overlay);
    return overlay;
  }

  function show(card, opts = {}) {
    const el = ensureOverlay();
    openCard = card;
    const timerSec = opts.timer || 0;
    let remaining = timerSec;
    let answered = false;
    let timerId = null;

    opts.onOpen && opts.onOpen();

    function render(state) {
      el.innerHTML = `
        <div class="learn-inner">
          <div class="learn-head">
            <span class="learn-tag">${card.tag || card.track || 'Concept'}</span>
            ${timerSec && !answered ? `<span class="learn-timer" id="learn-timer">${remaining}s</span>` : ''}
          </div>
          <p class="learn-q">${card.q}</p>
          <div class="learn-choices">
            ${card.choices.map((c, i) => `
              <button class="learn-choice" data-i="${i}">
                <b>${i + 1}</b> <span>${c}</span>
              </button>`).join('')}
          </div>
          <p class="learn-why" style="display:none"></p>
          <div class="learn-foot">
            <button class="learn-skip">Skip</button>
          </div>
        </div>`;
      el.classList.add('on');
      el.querySelectorAll('.learn-choice').forEach(b => {
        b.addEventListener('click', () => choose(parseInt(b.dataset.i, 10)));
      });
      el.querySelector('.learn-skip').addEventListener('click', () => finish(null));
    }

    function choose(i) {
      if (answered) return;
      answered = true;
      if (timerId) clearInterval(timerId);
      const ok = i === card.a;
      record(card.id, ok);
      el.querySelectorAll('.learn-choice').forEach((b, bi) => {
        b.disabled = true;
        if (bi === card.a) b.classList.add('right');
        else if (bi === i) b.classList.add('wrong');
      });
      const why = el.querySelector('.learn-why');
      why.textContent = (ok ? 'Correct — ' : 'Not quite — ') + card.why;
      why.style.display = '';
      el.querySelector('.learn-foot').innerHTML = `<button class="learn-skip">Back to it</button>`;
      el.querySelector('.learn-skip').addEventListener('click', () => finish(ok));
      setTimeout(() => finish(ok), ok ? 2800 : 5200);  // wrong answers linger: read the why
      ok ? Audio.sfx('coin') : Audio.sfx('fail');
      if (window.Mascot && !ok) Mascot.say(card.why, 5200);
    }

    function finish(ok) {
      if (openCard !== card) return;
      openCard = null;
      if (timerId) clearInterval(timerId);
      el.classList.remove('on');
      setTimeout(() => { el.innerHTML = ''; }, 250);
      opts.onClose && opts.onClose(ok);
      resolvePromise(ok === null ? false : ok);
    }

    let resolvePromise;
    const promise = new Promise(res => { resolvePromise = res; });

    if (timerSec) {
      timerId = setInterval(() => {
        remaining--;
        const t = document.getElementById('learn-timer');
        if (t) t.textContent = remaining + 's';
        if (remaining <= 0) { answered = true; if (timerId) clearInterval(timerId); finish(false); }
      }, 1000);
    }

    render();
    window.addEventListener('keydown', keyHandler);
    function keyHandler(e) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= card.choices.length) { choose(n - 1); }
      else if (e.key === 'Escape') { finish(answered ? card.lastOk : null); }
    }

    return promise;
  }

  window.Learn = { define, nextCard, show, record, summary, stars, allCards, configure };
})();
