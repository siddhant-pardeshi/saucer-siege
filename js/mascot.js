/* ============================================================
 * MASCOT ENGINE — layered SVG character with a real state machine.
 * Recreated from the studio's character reference sheet: chibi kid,
 * pale-blue fox hoodie with cream lining, swept black hair, brown
 * eyes, gold four-point star charm, navy shorts, blue boots, big
 * cream-tipped tail. Drawn from scratch as vector layers so every
 * part (ears, eyes, mouth, arms, tail, head) can move on its own.
 *
 * Public API:
 *   Mascot.mount(el, opts)         opts: {name, side, size, lines, cooldowns}
 *   Mascot.configure({lines, ...}) update lines / options after mount
 *   Mascot.play(state, {once, ms}) force an animation state
 *   Mascot.say(text, ms)           speech bubble (typewriter)
 *   Mascot.react(type, data)       event -> animation + rotating line
 *   Mascot.hide() / Mascot.show()  visibility toggle
 *   Mascot.setTalk(true|false)     mouth flap while a line is up
 *
 * States: enter idle wave cheer think alert sad sleep point hide
 * Add "?mascot=gallery" to any page URL to inspect every state.
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- palette (kept consistent with the reference sheet) ---------- */
  const P = {
    blue: '#BCD7F6', blueDeep: '#A5C6EE', blueLine: '#7FA8DC',
    cream: '#F7F1E4', creamShade: '#E9DFC9',
    skin: '#C1814E', skinShade: '#A96C3C',
    hair: '#242832', hairShine: '#4A5164',
    eye: '#5C3A26', eyeLine: '#2A1E16',
    mouth: '#7A4432', blush: '#E89878',
    navy: '#33405F', gold: '#F4C64F', goldLight: '#FFE08B', goldLine: '#C8963A',
    inner: '#F4E9D6'
  };

  /* ---------- the character, layer by layer ---------- */
  function starPath(r) {
    const k = r * 0.28;
    return `M0 ${-r} C ${k} ${-k} ${k} ${-k} ${r} 0 C ${k} ${k} ${k} ${k} 0 ${r} C ${-k} ${k} ${-k} ${k} ${-r} 0 C ${-k} ${-k} ${-k} ${-k} 0 ${-r} Z`;
  }

  const SVG = `
<svg id="mascot-svg" viewBox="0 0 220 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <style>
    #mascot-svg * { transform-box: fill-box; }
  </style>

  <!-- tail: fluffy fox tail with cream tip -->
  <g id="m-tail" style="transform-origin:78% 78%">
    <path d="M74 196 C 40 210 14 200 16 172 C 18 148 40 140 52 150 C 40 152 34 162 38 172 C 44 186 62 188 78 182 Z"
          fill="${P.blue}" stroke="${P.blueLine}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M34 156 C 24 160 17 166 16 174 C 22 168 30 164 38 164 C 36 160 35 158 34 156 Z"
          fill="${P.cream}"/>
    <path d="M60 190 C 48 196 32 196 22 190 C 26 198 40 202 52 200 Z" fill="${P.blueDeep}" opacity=".45"/>
  </g>

  <!-- body -->
  <g id="m-body">
    <!-- boots -->
    <g id="m-bootL">
      <rect x="82" y="208" width="24" height="26" rx="9" fill="${P.blue}" stroke="${P.blueLine}" stroke-width="3"/>
      <rect x="82" y="210" width="24" height="7" rx="3.5" fill="${P.cream}" opacity=".9"/>
      <rect x="79" y="226" width="30" height="10" rx="5" fill="${P.cream}" stroke="${P.blueLine}" stroke-width="2.5"/>
    </g>
    <g id="m-bootR">
      <rect x="114" y="208" width="24" height="26" rx="9" fill="${P.blue}" stroke="${P.blueLine}" stroke-width="3"/>
      <rect x="114" y="210" width="24" height="7" rx="3.5" fill="${P.cream}" opacity=".9"/>
      <rect x="111" y="226" width="30" height="10" rx="5" fill="${P.cream}" stroke="${P.blueLine}" stroke-width="2.5"/>
    </g>
    <!-- shorts -->
    <path d="M84 196 L136 196 L138 216 Q110 222 82 216 Z" fill="${P.navy}"/>
    <path d="M84 196 L136 196 L136.6 202 L84.4 202 Z" fill="#3E4C70"/>
    <!-- torso hoodie -->
    <path d="M78 148 Q110 138 142 148 Q148 176 142 200 Q110 208 78 200 Q72 176 78 148 Z"
          fill="${P.blue}" stroke="${P.blueLine}" stroke-width="3"/>
    <ellipse cx="110" cy="176" rx="24" ry="22" fill="${P.cream}"/>
    <!-- left arm (idle at side) -->
    <g id="m-armL" style="transform-origin:20% 20%">
      <path d="M80 152 C 70 158 66 172 70 184 C 74 190 82 190 86 184 C 90 174 88 160 86 152 Z"
            fill="${P.blue}" stroke="${P.blueLine}" stroke-width="3"/>
      <ellipse cx="77" cy="187" rx="9" ry="8" fill="${P.cream}" stroke="${P.blueLine}" stroke-width="2.5"/>
    </g>
    <!-- right arm (actor: wave / point / cheer / think) -->
    <g id="m-armR" style="transform-origin:80% 20%">
      <path d="M140 152 C 150 158 154 172 150 184 C 146 190 138 190 134 184 C 130 174 132 160 134 152 Z"
            fill="${P.blue}" stroke="${P.blueLine}" stroke-width="3"/>
      <ellipse cx="143" cy="187" rx="9" ry="8" fill="${P.cream}" stroke="${P.blueLine}" stroke-width="2.5"/>
    </g>
    <!-- star charm on the chest -->
    <g id="m-charm" style="transform-origin:50% 50%">
      <path d="${starPath(11)}" transform="translate(110 152)" fill="${P.gold}" stroke="${P.goldLine}" stroke-width="2"/>
      <circle cx="110" cy="149" r="1.6" fill="${P.goldLight}"/>
    </g>
  </g>

  <!-- head -->
  <g id="m-head" style="transform-origin:50% 80%">
    <!-- hood back -->
    <circle cx="110" cy="96" r="54" fill="${P.blue}" stroke="${P.blueLine}" stroke-width="3"/>
    <!-- ears: wide-set, angled outward like the reference -->
    <g id="m-earL" style="transform-origin:80% 92%">
      <path d="M72 64 C 54 52 44 30 54 16 C 62 5 80 8 90 28 C 95 38 96 52 92 62 Z"
            fill="${P.blue}" stroke="${P.blueLine}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M74 54 C 66 44 62 30 66 22 C 71 15 81 19 86 33 C 89 41 89 50 86 56 Z" fill="${P.inner}"/>
    </g>
    <g id="m-earR" style="transform-origin:20% 92%">
      <path d="M148 64 C 166 52 176 30 166 16 C 158 5 140 8 130 28 C 125 38 124 52 128 62 Z"
            fill="${P.blue}" stroke="${P.blueLine}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M146 54 C 154 44 158 30 154 22 C 149 15 139 19 134 33 C 131 41 131 50 134 56 Z" fill="${P.inner}"/>
    </g>
    <!-- face -->
    <ellipse cx="110" cy="106" rx="41" ry="39" fill="${P.skin}"/>
    <path d="M72 100 Q110 62 148 100 Q148 88 138 80 Q110 62 82 80 Q72 88 72 100 Z" fill="${P.skinShade}" opacity=".35"/>
    <!-- hair fringe sweeping out under the hood rim -->
    <g id="m-hair">
      <path d="M75 96 C 74 76 86 64 104 61 C 126 58 142 68 146 86 C 147 92 147 98 145 102 C 140 86 130 77 119 75 C 125 82 128 89 127 96 C 119 83 107 78 96 81 C 102 85 105 91 105 97 C 97 87 86 86 79 93 C 77 95 75 98 75 102 Z"
            fill="${P.hair}"/>
      <path d="M74 96 C 70 92 68 86 69 80 C 72 86 75 90 79 92 Z" fill="${P.hair}"/>
      <path d="M146 96 C 150 92 152 86 151 80 C 148 86 145 90 141 92 Z" fill="${P.hair}"/>
      <path d="M98 64 C 106 60 118 60 126 65 C 116 64 106 66 99 70 Z" fill="${P.hairShine}"/>
    </g>
    <!-- brows -->
    <g id="m-brows">
      <path id="m-browL" d="M83 96 Q91 91 99 95" fill="none" stroke="${P.eyeLine}" stroke-width="3" stroke-linecap="round"/>
      <path id="m-browR" d="M121 95 Q129 91 137 96" fill="none" stroke="${P.eyeLine}" stroke-width="3" stroke-linecap="round"/>
    </g>
    <!-- eyes -->
    <g id="m-eyeL" style="transform-origin:50% 50%">
      <ellipse cx="92" cy="106" rx="8" ry="10.5" fill="${P.eye}"/>
      <ellipse cx="92" cy="106" rx="8" ry="10.5" fill="none" stroke="${P.eyeLine}" stroke-width="2"/>
      <circle cx="89.5" cy="102" r="3" fill="#FFF"/>
      <circle cx="94.5" cy="110" r="1.4" fill="#FFF" opacity=".85"/>
      <path d="M84 97 Q92 92.5 100 97" fill="none" stroke="${P.eyeLine}" stroke-width="3" stroke-linecap="round"/>
    </g>
    <g id="m-eyeR" style="transform-origin:50% 50%">
      <ellipse cx="128" cy="106" rx="8" ry="10.5" fill="${P.eye}"/>
      <ellipse cx="128" cy="106" rx="8" ry="10.5" fill="none" stroke="${P.eyeLine}" stroke-width="2"/>
      <circle cx="125.5" cy="102" r="3" fill="#FFF"/>
      <circle cx="130.5" cy="110" r="1.4" fill="#FFF" opacity=".85"/>
      <path d="M120 97 Q128 92.5 136 97" fill="none" stroke="${P.eyeLine}" stroke-width="3" stroke-linecap="round"/>
    </g>
    <!-- blush -->
    <ellipse cx="82" cy="117" rx="7" ry="4" fill="${P.blush}" opacity=".45"/>
    <ellipse cx="138" cy="117" rx="7" ry="4" fill="${P.blush}" opacity=".45"/>
    <!-- mouth -->
    <g id="m-mouth" style="transform-origin:50% 30%">
      <path id="m-mouth-path" d="M102 126 Q110 132 118 126" fill="none" stroke="${P.mouth}" stroke-width="3.5" stroke-linecap="round"/>
    </g>
    <!-- hood rim framing the face -->
    <path d="M66 100 C 64 66 84 46 110 46 C 136 46 156 66 154 100 C 152 78 136 62 110 62 C 84 62 68 78 66 100 Z"
          fill="${P.blue}" stroke="${P.blueLine}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M70 92 C 74 70 90 56 110 56 C 130 56 146 70 150 92 C 144 74 130 66 110 66 C 90 66 76 74 70 92 Z"
          fill="${P.cream}"/>
    <!-- sleep glyphs -->
    <g id="m-zzz" opacity="0">
      <text x="152" y="52" font-size="13" font-weight="700" fill="${P.blueLine}" font-family="inherit">z</text>
      <text x="162" y="40" font-size="10" font-weight="700" fill="${P.blueLine}" font-family="inherit">z</text>
      <text x="170" y="30" font-size="8" font-weight="700" fill="${P.blueLine}" font-family="inherit">z</text>
    </g>
  </g>
</svg>`;

  /* ---------- animation style sheet (classes toggle per state) ---------- */
  const CSS = `
.mascot-root{position:relative;display:flex;flex-direction:column;align-items:center;pointer-events:none;
  -webkit-user-select:none;user-select:none;width:var(--msc-size,132px)}
.mascot-stage{width:100%;pointer-events:auto;cursor:pointer;filter:drop-shadow(0 10px 14px rgba(0,0,0,.28))}
.mascot-stage svg{width:100%;height:auto;display:block}
.mascot-root.m-hidden .mascot-stage{display:none}

/* ---- idle loops ---- */
@keyframes mBreathe{0%,100%{transform:translateY(0) scaleY(1)}50%{transform:translateY(.8px) scaleY(1.018)}}
@keyframes mTail{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(6deg)}}
@keyframes mBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}
@keyframes mEarT{0%,86%,100%{transform:rotate(0)}90%{transform:rotate(-7deg)}94%{transform:rotate(4deg)}}
@keyframes mEarT2{0%,80%,100%{transform:rotate(0)}85%{transform:rotate(6deg)}90%{transform:rotate(-3deg)}}
@keyframes mHairSway{0%,100%{transform:rotate(0)}50%{transform:rotate(1.1deg)}}
.st-idle #m-body{animation:mBreathe 3.4s ease-in-out infinite}
.st-idle #m-tail{animation:mTail 3s ease-in-out infinite}
.st-idle #m-eyeL,.st-idle #m-eyeR{animation:mBlink 4.6s ease-in-out infinite}
.st-idle #m-earL{animation:mEarT 7.3s ease-in-out infinite}
.st-idle #m-earR{animation:mEarT2 9.1s ease-in-out infinite}
.st-idle #m-hair{animation:mHairSway 5s ease-in-out infinite}

/* ---- one-shot performances ---- */
@keyframes mWave{0%{transform:rotate(0)}22%{transform:rotate(-142deg)}40%{transform:rotate(-108deg)}
 58%{transform:rotate(-142deg)}76%{transform:rotate(-112deg)}92%{transform:rotate(-138deg)}
 100%{transform:rotate(-142deg)}}
@keyframes mWaveReturn{from{transform:rotate(-142deg)}to{transform:rotate(0)}}
@keyframes mHeadTilt{0%,100%{transform:rotate(0)}50%{transform:rotate(4deg)}}
.st-wave #m-armR{animation:mWave 1.7s cubic-bezier(.45,0,.35,1) forwards}
.st-wave #m-head{animation:mHeadTilt 1.7s ease-in-out}
.st-wave #m-mouth-path{d:path('M100 124 Q110 134 120 124')}

@keyframes mCheerJump{0%,100%{transform:translateY(0)}18%{transform:translateY(-9px)}36%{transform:translateY(0)}
 54%{transform:translateY(-7px)}72%{transform:translateY(0)}}
@keyframes mArmUpL{0%{transform:rotate(0)}25%,100%{transform:rotate(148deg)}}
@keyframes mArmUpR{0%{transform:rotate(0)}25%,100%{transform:rotate(-148deg)}}
@keyframes mStarGlow{0%,100%{transform:scale(1)}30%,70%{transform:scale(1.5)}}
@keyframes mEarUp{0%{transform:rotate(0)}30%,100%{transform:rotate(-6deg)}}
.st-cheer #m-body{animation:mCheerJump 1.15s ease-out}
.st-cheer #m-armL{animation:mArmUpL .35s ease-out forwards}
.st-cheer #m-armR{animation:mArmUpR .35s ease-out forwards}
.st-cheer #m-charm{animation:mStarGlow .55s ease-in-out 2}
.st-cheer #m-earL{animation:mEarUp .4s ease-out forwards}
.st-cheer #m-earR{animation:mEarUp .4s ease-out forwards}
.st-cheer #m-mouth-path{d:path('M100 124 Q110 136 120 124');stroke-width:4}

@keyframes mThinkArm{0%{transform:rotate(0)}100%{transform:rotate(-118deg) translate(26px,-4px)}}
@keyframes mThinkHead{0%{transform:rotate(0)}100%{transform:rotate(-5deg) translateY(-2px)}}
.st-think #m-armR{animation:mThinkArm .5s ease-out forwards}
.st-think #m-head{animation:mThinkHead .5s ease-out forwards}
.st-think #m-mouth-path{d:path('M104 127 Q110 126 116 127')}

@keyframes mAlertJump{0%{transform:translateY(0)}30%{transform:translateY(-7px) rotate(-2deg)}
 55%{transform:translateY(0)}70%{transform:translateY(-3px)}100%{transform:translateY(0)}}
@keyframes mAlertArm{0%{transform:rotate(0)}35%,80%{transform:rotate(-95deg)}100%{transform:rotate(0)}}
.st-alert #m-body{animation:mAlertJump .8s ease-out}
.st-alert #m-armR{animation:mAlertArm .8s ease-out}
.st-alert #m-mouth-path{d:path('M108 125 Q110 133 112 125 Q110 127 108 125')}
.st-alert #m-eyeL ellipse,.st-alert #m-eyeR ellipse{transform:scale(1.14)}

@keyframes mSadHead{0%{transform:rotate(0)}100%{transform:rotate(4deg) translateY(3px)}}
.st-sad #m-head{animation:mSadHead .45s ease-out forwards}
.st-sad #m-browL{transform:translateY(3px) rotate(7deg)}
.st-sad #m-browR{transform:translateY(3px) rotate(-7deg)}
.st-sad #m-mouth-path{d:path('M103 129 Q110 124 117 129')}
.st-sad #m-body{transform:scaleY(.985)}

@keyframes mSleepHead{0%{transform:rotate(0)}100%{transform:rotate(7deg) translateY(4px)}}
@keyframes mZZZ{0%{opacity:0;transform:translateY(4px)}25%{opacity:.9}80%{opacity:.5}100%{opacity:0;transform:translateY(-10px)}}
.st-sleep #m-head{animation:mSleepHead .8s ease-out forwards}
.st-sleep #m-eyeL,.st-sleep #m-eyeR{transform:scaleY(.08)}
.st-sleep #m-zzz{opacity:1}
.st-sleep #m-zzz text{animation:mZZZ 2.4s ease-out infinite}
.st-sleep #m-zzz text:nth-child(2){animation-delay:.5s}
.st-sleep #m-zzz text:nth-child(3){animation-delay:1s}
.st-sleep #m-mouth-path{d:path('M105 127 Q110 130 115 127')}
.st-sleep #m-tail{animation:mTail 6s ease-in-out infinite}

@keyframes mPointArm{0%{transform:rotate(0)}40%,100%{transform:rotate(-84deg) translate(10px,-6px)}}
.st-point #m-armR{animation:mPointArm .45s ease-out forwards}
.st-point #m-mouth-path{d:path('M103 125 Q110 130 117 125')}

/* talk flap */
@keyframes mTalk{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.35)}}
.talking #m-mouth{animation:mTalk .24s ease-in-out infinite}

/* enter / hide */
@keyframes mEnter{0%{transform:translateY(46px) scale(.85);opacity:0}
 60%{transform:translateY(-7px) scale(1.03);opacity:1}100%{transform:translateY(0) scale(1);opacity:1}}
.st-enter .mascot-stage{animation:mEnter .8s cubic-bezier(.34,1.56,.64,1)}
@keyframes mHide{to{transform:translateY(18px) scale(.9);opacity:0}}
.st-hide .mascot-stage{animation:mHide .35s ease-in forwards}

/* reduced motion */
.mascot-root.rm .st-idle #m-body,.mascot-root.rm .st-idle #m-tail,
.mascot-root.rm .st-idle #m-hair,.mascot-root.rm .st-cheer #m-body,
.mascot-root.rm .st-alert #m-body,.mascot-root.rm .st-enter .mascot-stage{animation-duration:0s;animation:none}
.mascot-root.rm .st-idle #m-eyeL,.mascot-root.rm .st-idle #m-eyeR{animation:mBlink 9s ease-in-out infinite}

/* ---- speech bubble ---- */
.mascot-bubble{position:relative;max-width:min(280px,72vw);margin-bottom:10px;padding:10px 14px;
  background:rgba(16,20,34,.92);color:#F2F6FF;border-radius:14px;border:1px solid rgba(255,255,255,.16);
  font:600 13.5px/1.45 var(--msc-font,inherit);box-shadow:0 8px 24px rgba(0,0,0,.35);
  opacity:0;transform:translateY(6px) scale(.96);transition:opacity .22s ease,transform .22s cubic-bezier(.34,1.56,.64,1);
  pointer-events:auto;cursor:pointer;backdrop-filter:blur(6px)}
.mascot-bubble.on{opacity:1;transform:translateY(0) scale(1)}
.mascot-bubble .m-name{display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--msc-accent,#8FC1FF);margin-bottom:3px;font-weight:800}
.mascot-bubble .m-text{margin:0}
.mascot-bubble:after{content:'';position:absolute;left:50%;bottom:-7px;width:14px;height:14px;
  background:rgba(16,20,34,.92);border-right:1px solid rgba(255,255,255,.16);border-bottom:1px solid rgba(255,255,255,.16);
  transform:translateX(-50%) rotate(45deg)}
.mascot-root.rm .mascot-bubble{transition:opacity .2s ease;transform:none}

/* ---- gallery (dev inspection route) ---- */
.mascot-gallery{position:fixed;inset:0;z-index:9999;overflow:auto;background:#101420;color:#E8EEF9;
  display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;padding:22px;
  font-family:system-ui,sans-serif}
.mascot-gallery h1{grid-column:1/-1;font-size:15px;letter-spacing:.2em;text-transform:uppercase;color:#8FC1FF;margin:4px 0}
.mascot-gallery figure{margin:0;background:#171E30;border:1px solid #26314B;border-radius:12px;padding:10px;text-align:center}
.mascot-gallery .mascot-root{--msc-size:120px;margin:0 auto}
.mascot-gallery figcaption{font-size:11px;color:#9FB2D4;margin-top:6px;text-transform:uppercase;letter-spacing:.1em}`;

  /* ---------- internals ---------- */
  const ONESHOT = {
    wave: { ms: 1800, return: 'mWaveReturn', retEl: '#m-armR' },
    cheer: { ms: 1200 },
    alert: { ms: 850 },
    point: { ms: 1000 },
    think: { ms: 2600 },
    sad: { ms: 2200 },
    sleep: { ms: 0 },     // holds until interrupted
    enter: { ms: 900 },
    idle: { ms: 0 },
    hide: { ms: 400 }
  };
  const PRIORITY = { sleep: 6, cheer: 5, alert: 4, wave: 3, point: 3, think: 2, sad: 3, enter: 5, idle: 0, hide: 7 };

  const S = {
    el: null, root: null, bubble: null, state: 'idle', until: 0,
    cfg: { name: 'Guide', side: 'right', size: 132, lines: {}, cooldowns: {}, accent: null, font: null },
    cool: {}, variants: {}, hidden: false, talkTimer: null, busy: null, ready: false
  };

  let styleInjected = false;
  function injectStyles() {
    if (styleInjected) return;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    styleInjected = true;
  }

  function rmPreferred() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function setEyeLook(x, y) {
    const dx = Math.max(-2.4, Math.min(2.4, x)), dy = Math.max(-1.6, Math.min(2.4, y));
    const head = S.root.querySelector('#m-head');
    if (head) head.style.setProperty('--lx', dx + 'px');
    [S.root.querySelector('#m-eyeL'), S.root.querySelector('#m-eyeR')].forEach(g => {
      if (!g) return;
      g.querySelectorAll('ellipse,circle').forEach(e => {
        e.style.transition = 'transform .25s ease';
        e.style.translate = `${dx}px ${dy}px`;
      });
    });
  }

  function setState(name, opts = {}) {
    if (!S.root || !ONESHOT[name]) return;
    const prior = PRIORITY[name] || 0;
    const cur = PRIORITY[S.state] || 0;
    if (S.until > performance.now() && prior < cur) return;
    clearOneShotReturn();
    S.root.classList.remove('st-' + S.state);
    if (name === 'hide') { S.root.classList.add('m-hidden'); S.state = 'idle'; return; }
    S.root.classList.add('st-' + name);
    S.state = name;
    const spec = ONESHOT[name];
    if (opts.once !== false && spec.ms > 0) {
      S.until = performance.now() + (opts.ms || spec.ms);
      const el = spec.retEl ? S.root.querySelector(spec.retEl) : null;
      if (spec.return && el) {
        el.addEventListener('animationend', function h(ev) {
          if (ev.animationName !== spec.return) return;
          el.removeEventListener('animationend', h);
          if (S.state === name) backToIdle();
        });
      }
      setTimeout(() => { if (S.state === name) backToIdle(); }, (opts.ms || spec.ms) + 60);
    } else {
      S.until = 0;
    }
  }

  function clearOneShotReturn() {
    ['#m-armR', '#m-armL'].forEach(sel => {
      const el = S.root && S.root.querySelector(sel);
      if (el) el.style.transform = '';
    });
  }

  function backToIdle() {
    if (!S.root) return;
    S.root.classList.remove('st-' + S.state);
    S.root.classList.add('st-idle');
    S.state = 'idle';
    S.until = 0;
  }

  /* ---------- speech bubble ---------- */
  let typeTimer = null, hideTimer = null;
  function say(text, ms = 3800) {
    if (!S.bubble || S.hidden) return;
    const nameEl = S.bubble.querySelector('.m-name');
    const textEl = S.bubble.querySelector('.m-text');
    if (nameEl) nameEl.textContent = S.cfg.name;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    S.bubble.classList.add('on');
    let i = 0;
    textEl.textContent = '';
    typeTimer = setInterval(() => {
      i += 2;
      textEl.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(typeTimer); typeTimer = null; }
    }, 24);
    setTalk(true);
    hideTimer = setTimeout(() => { S.bubble.classList.remove('on'); setTalk(false); }, ms);
  }
  function setTalk(on) {
    if (!S.root) return;
    S.root.classList.toggle('talking', !!on);
  }

  /* ---------- event reactions ---------- */
  function react(type, data) {
    if (!S.ready || S.hidden) return;
    const now = performance.now();
    const cd = (S.cfg.cooldowns && S.cfg.cooldowns[type]) || 6000;
    if (S.cool[type] && now - S.cool[type] < cd) return;
    S.cool[type] = now;
    const pack = S.cfg.lines[type];
    if (pack) {
      const lines = typeof pack === 'function' ? pack(data) : pack;
      if (lines && lines.length) {
        const seen = S.variants[type] || 0;
        const line = lines[seen % lines.length];
        S.variants[type] = seen + 1;
        if (line) say(typeof line === 'function' ? line(data) : line);
      }
    }
    const anim = (S.cfg.anims && S.cfg.anims[type]) || defaultAnim(type, data);
    if (anim) setState(anim, { once: anim !== 'sleep' });
  }

  function defaultAnim(type) {
    switch (type) {
      case 'welcome': case 'start': return 'wave';
      case 'win': case 'checkpoint': case 'milestone': case 'combo': return 'cheer';
      case 'fail': case 'crash': case 'wipeout': return 'sad';
      case 'danger': case 'low': case 'boss': return 'alert';
      case 'hint': case 'explain': return 'point';
      case 'pause': return 'sleep';
      case 'resume': return 'wave';
      default: return 'idle';
    }
  }

  /* ---------- gallery route ---------- */
  function openGallery(states) {
    injectStyles();
    const g = document.createElement('div');
    g.className = 'mascot-gallery';
    g.innerHTML = '<h1>Mascot state gallery</h1>';
    states.forEach(s => {
      const fig = document.createElement('figure');
      const holder = document.createElement('div');
      holder.className = 'mascot-root';
      const stage = document.createElement('div');
      stage.className = 'mascot-stage';
      stage.innerHTML = SVG;
      const bubble = document.createElement('div');
      bubble.className = 'mascot-bubble';
      bubble.innerHTML = '<span class="m-name"></span><p class="m-text"></p>';
      holder.appendChild(bubble);
      holder.appendChild(stage);
      const wrap = holder.querySelector('.mascot-stage');
      // scope classes to this instance
      stage.querySelectorAll('[id]').forEach(n => { n.id = n.id + '-g' + Math.random().toString(36).slice(2, 6); });
      fig.appendChild(holder);
      const cap = document.createElement('figcaption');
      cap.textContent = s;
      fig.appendChild(cap);
      g.appendChild(fig);
      holder.classList.add('st-idle');
      setTimeout(() => holder.classList.add('st-' + s), 600);
    });
    g.addEventListener('click', () => g.remove());
    document.body.appendChild(g);
  }

  /* ---------- mount ---------- */
  function mount(el, opts = {}) {
    injectStyles();
    Object.assign(S.cfg, opts);
    S.el = typeof el === 'string' ? document.querySelector(el) : el;
    if (!S.el) return;
    S.el.classList.add('mascot-root');
    S.el.style.setProperty('--msc-size', (opts.size || 132) + 'px');
    if (opts.accent) S.el.style.setProperty('--msc-accent', opts.accent);
    if (opts.font) S.el.style.setProperty('--msc-font', opts.font);

    S.bubble = document.createElement('div');
    S.bubble.className = 'mascot-bubble';
    S.bubble.innerHTML = `<span class="m-name"></span><p class="m-text"></p>`;
    S.bubble.addEventListener('click', () => { S.bubble.classList.remove('on'); setTalk(false); });

    const stage = document.createElement('div');
    stage.className = 'mascot-stage';
    stage.innerHTML = SVG;
    stage.setAttribute('role', 'img');
    stage.setAttribute('aria-label', S.cfg.name + ', the game guide');
    S.stage = stage;

    S.el.appendChild(S.bubble);
    S.el.appendChild(S.stage);
    S.root = S.el;

    if (rmPreferred()) S.root.classList.add('rm');
    window.addEventListener('pointerdown', () => { if (rmPreferred()) S.root.classList.add('rm'); }, { once: true });

    S.root.classList.add('st-idle');
    S.ready = true;

    // gentle idle variety: occasionally glance around
    if (!rmPreferred()) {
      setInterval(() => {
        if (S.state !== 'idle' || document.hidden) return;
        if (Math.random() < 0.35) {
          setEyeLook((Math.random() * 2 - 1) * 2.2, (Math.random() * 2 - 1) * 1.4);
          setTimeout(() => setEyeLook(0, 0), 1600);
        }
      }, 5200);
      if (window.matchMedia('(pointer:fine)').matches) {
        window.addEventListener('pointermove', e => {
          if (S.state !== 'idle' || document.hidden) return;
          const r = S.root.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          setEyeLook((e.clientX - cx) / 220, (e.clientY - cy) / 220);
        }, { passive: true });
      }
    }
    stage.addEventListener('click', () => react('poke', {}));
    if (S.cfg.lines && S.cfg.lines.poke) S.cfg.cooldowns = Object.assign({ poke: 3000 }, S.cfg.cooldowns);
  }

  function show() {
    if (!S.root) return;
    S.hidden = false;
    S.root.classList.remove('m-hidden', 'st-hide');
  }
  function hide() {
    if (!S.root) return;
    S.hidden = true;
    setState('hide');
  }

  window.Mascot = {
    mount, configure: o => { Object.assign(S.cfg, o); },
    play: (n, o) => setState(n, o),
    say, react, show, hide, setTalk,
    gallery: () => openGallery(['idle', 'wave', 'cheer', 'think', 'alert', 'sad', 'sleep', 'point']),
    get state() { return S.state; }
  };
})();
