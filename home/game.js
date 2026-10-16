/* 라꿍이의 집으로 가는 길 — side-scrolling platformer (Phaser 3)
   Hero 라꿍이, mounts (elephant, eagle), backgrounds and props: AutoSprite art.
   Cats / pigeons / mice reuse the AutoSprite NPC art of the isometric game (../assets). */
(() => {
'use strict';

const W = 1280, H = 720;
const FLOOR = 560;          // y of the far edge of the sidewalk art
const STAND = 604;          // y where feet rest (top of the ground collision)
const GRAV = 1900;
const TEST = /[?&]test=1/.test(location.search), DEBUG = /[?&]debug=1/.test(location.search);
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
const tryLS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

/* ---------- keep the stage the size of the *visible* viewport (phone browsers: 100vh includes the toolbar area) ---------- */
(function fitStage() {
  let lw = 0, lh = 0;
  const set = () => {
    lw = innerWidth; lh = innerHeight;
    const s = document.documentElement.style; s.setProperty('--app-w', lw + 'px'); s.setProperty('--app-h', lh + 'px');
    if (window.__phaser && window.__phaser.scale) window.__phaser.scale.refresh();
  };
  const later = () => { set(); setTimeout(set, 120); setTimeout(set, 450); };
  addEventListener('resize', later); addEventListener('orientationchange', later);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', later);
  setInterval(() => { if (innerWidth !== lw || innerHeight !== lh) set(); }, 400);
  set();
})();

/* ---------- input: keyboard + touch ---------- */
const keys = {}, hit = {};
addEventListener('keydown', e => {
  if (!keys[e.code]) hit[e.code] = true; keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  Sfx.resume();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const T = { on: false, x: 0, y: 0, mag: 0, joyId: null, jumpHeld: false, jumpHit: false, atkHit: false, actHit: false, run: false };
(function setupTouch() {
  const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || /[?&]touch=1/.test(location.search);
  document.addEventListener('DOMContentLoaded', () => {
    const orient = () => { const h = $('rotate-hint'); if (h) h.classList.toggle('hidden', !(innerHeight > innerWidth)); };
    addEventListener('resize', orient); orient();
    if (!isTouch) return;
    T.on = true; document.body.classList.add('touch');
    const pb = $('btn-portrait'); if (pb) pb.addEventListener('click', () => { document.body.classList.add('portrait-ok'); orient(); if (window.__home && window.__home.applyZoom) window.__home.applyZoom(); });
    document.addEventListener('contextmenu', e => e.preventDefault());
    const joy = $('joy'), knob = $('joy-knob'), R = 46;
    const move = e => { const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / R); T.x = dx / l * k; T.y = dy / l * k; T.mag = k; knob.style.transform = 'translate(' + (T.x * R) + 'px,' + (T.y * R) + 'px)'; };
    joy.addEventListener('pointerdown', e => { T.joyId = e.pointerId; joy.setPointerCapture(e.pointerId); move(e); e.preventDefault(); Sfx.resume(); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === T.joyId) move(e); });
    const end = e => { if (e.pointerId !== T.joyId) return; T.joyId = null; T.x = T.y = T.mag = 0; knob.style.transform = ''; };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end); joy.addEventListener('lostpointercapture', end);
    const tap = (el, fn) => { el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('on'); fn(true); Sfx.resume(); }); const up = () => { el.classList.remove('on'); fn(false); }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up); };
    tap($('tb-jump'), d => { T.jumpHeld = d; if (d) T.jumpHit = true; });
    tap($('tb-throw'), d => { if (d) T.atkHit = true; });
    tap($('tb-act'), d => { if (d) T.actHit = true; });
    tap($('tb-run'), d => { if (d) { T.run = !T.run; $('tb-run').classList.toggle('on', T.run); } });
    $('tb-run').addEventListener('pointerup', () => $('tb-run').classList.toggle('on', T.run));
    $('btn-pause').addEventListener('pointerdown', e => e.stopPropagation());
  });
})();
function readInput() {
  let ax = 0, ay = 0;
  if (keys.ArrowLeft || keys.KeyA) ax -= 1; if (keys.ArrowRight || keys.KeyD) ax += 1;
  if (keys.ArrowUp || keys.KeyW) ay -= 1; if (keys.ArrowDown || keys.KeyS) ay += 1;
  let run = !!(keys.ShiftLeft || keys.ShiftRight);
  if (T.on) { if (T.mag > 0.22) { ax = Math.abs(T.x) > 0.3 ? Math.sign(T.x) : 0; ay = Math.abs(T.y) > 0.3 ? Math.sign(T.y) : 0; } run = run || T.mag > 0.93 || T.run; }
  const jump = !!(hit.Space || hit.ArrowUp || hit.KeyW || hit.KeyZ || T.jumpHit);
  const jumpHeld = !!(keys.Space || keys.ArrowUp || keys.KeyW || keys.KeyZ || T.jumpHeld);
  const atk = !!(hit.KeyJ || hit.KeyX || hit.KeyK || T.atkHit);
  const act = !!(hit.KeyE || T.actHit);
  const pause = !!(hit.Escape || hit.KeyP);
  T.jumpHit = T.atkHit = T.actHit = false;
  return { ax, ay, run, jump, jumpHeld, atk, act, pause };
}

/* ---------- tiny sound synth ---------- */
const Sfx = (() => {
  let ctx = null;
  const c = () => { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return ctx; };
  function tone(f, d, type = 'sine', v = 0.07, slide = 0) {
    const a = c(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), a.currentTime + d);
    g.gain.setValueAtTime(v, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + d);
  }
  function noise(d, v = .08, hp = 800) {
    const a = c(); if (!a) return; const n = Math.floor(a.sampleRate * d), buf = a.createBuffer(1, n, a.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(); s.buffer = buf; const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = a.createGain(); g.gain.value = v;
    s.connect(f); f.connect(g); g.connect(a.destination); s.start();
  }
  return {
    resume() { const a = c(); if (a && a.state === 'suspended') a.resume(); },
    jump() { tone(300, .2, 'sine', .06, 340); },
    star() { tone(880, .09, 'triangle', .05); setTimeout(() => tone(1320, .14, 'triangle', .05), 70); },
    heart() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, .16, 'triangle', .07), i * 90)); },
    throwA() { tone(520, .12, 'square', .03, -240); },
    hitE() { noise(.12, .09, 500); tone(180, .14, 'sawtooth', .06, -90); },
    stomp() { tone(220, .12, 'square', .07, -120); noise(.1, .07, 300); },
    hurt() { tone(260, .3, 'sawtooth', .08, -180); },
    spring() { tone(220, .3, 'sine', .08, 700); },
    mount() { [392, 523, 659].forEach((f, i) => setTimeout(() => tone(f, .14, 'triangle', .07), i * 80)); },
    trumpet() { tone(240, .4, 'sawtooth', .07, 260); setTimeout(() => tone(330, .25, 'sawtooth', .05, -100), 200); },
    letter() { [659, 784, 988, 1319].forEach((f, i) => setTimeout(() => tone(f, .18, 'triangle', .07), i * 80)); },
    check() { tone(700, .12, 'triangle', .06); setTimeout(() => tone(1050, .2, 'triangle', .06), 100); },
    fanfare() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, .3, 'triangle', .08), i * 130)); },
    boss() { tone(110, .5, 'sawtooth', .09, 40); },
  };
})();

/* ---------- stage data ---------- */
function rowStars(E, x0, y, n, dx = 56) { for (let i = 0; i < n; i++) E.push({ k: 'star', x: x0 + i * dx, y }); }
function arcStars(E, x0, x1, base, peak, n) { for (let i = 0; i < n; i++) { const t = n === 1 ? .5 : i / (n - 1); E.push({ k: 'star', x: x0 + (x1 - x0) * t, y: base + Math.sin(t * Math.PI) * peak }); } }
const hint = (E, x, kb, touch) => E.push({ k: 'hint', x, text: [kb, touch || kb] });

function stage1() {
  const E = [];
  hint(E, 160, '← → (A D) 로 이동 · Shift 로 달리기', '왼쪽 조이스틱으로 이동 · 끝까지 밀면 달리기');
  hint(E, 620, 'Space (↑) 로 점프! 상자 위로 올라가 봐', '⤴ 버튼으로 점프! 상자 위로 올라가 봐');
  hint(E, 1180, 'J 로 사과 던지기 · 적을 위에서 밟아도 돼', '사과 버튼으로 던지기 · 적을 위에서 밟아도 돼');
  hint(E, 2700, 'E 를 눌러 새장을 열면 코끼리를 탈 수 있어!', 'E 버튼으로 새장을 열어 코끼리를 타 보자!');
  hint(E, 5900, '저기 우리 집이다! 조금만 더!', '저기 우리 집이다! 조금만 더!');
  E.push({ k: 'crate', x: 650 }, { k: 'dump', x: 1250 }, { k: 'bench', x: 2400 }, { k: 'barrel', x: 3150 }, { k: 'crate', x: 4300 }, { k: 'dump', x: 5100 });
  E.push({ k: 'brick', x: 1460, y: 150, n: 3 }, { k: 'brick', x: 2060, y: 120, n: 2 }, { k: 'brick', x: 2640, y: 290, n: 2 }, { k: 'brick', x: 3990, y: 140, n: 3 }, { k: 'brick', x: 5320, y: 150, n: 3 });
  E.push({ k: 'brick', x: 1855 - 35, y: 70, n: 1 }, { k: 'brick', x: 3610 - 35, y: 70, n: 1 }, { k: 'brick', x: 4800 - 35, y: 70, n: 1 });
  E.push({ k: 'spring', x: 2560 });
  [[1000, 160], [2250, 200], [3950, 150], [5000, 200], [5750, 200]].forEach(([x, r]) => E.push({ k: 'cat', x, r }));
  [[1560, 180], [2650, 160], [4250, 180], [5500, 200]].forEach(([x, r]) => E.push({ k: 'mouse', x, r }));
  [[2200, 330, 260], [4200, 300, 260], [5800, 330, 240]].forEach(([x, y, r]) => E.push({ k: 'pigeon', x, y, r }));
  [800, 3400, 4600, 5200].forEach(x => E.push({ k: 'cone', x }));
  [950, 1700, 2300, 3100, 4100, 5200, 5600].forEach(x => E.push({ k: 'apple', x, y: 40 }));
  E.push({ k: 'heart', x: 2700, y: 355 }, { k: 'heart', x: 4650, y: 50 });
  rowStars(E, 560, 150, 3); rowStars(E, 1180, 190, 4); arcStars(E, 1780, 2000, 120, 70, 5); arcStars(E, 3490, 3730, 120, 70, 5); arcStars(E, 4680, 4920, 120, 70, 5);
  rowStars(E, 1480, 215, 3); rowStars(E, 2070, 185, 2); rowStars(E, 3320, 60, 3); rowStars(E, 4020, 205, 3); rowStars(E, 5340, 215, 3); rowStars(E, 2900, 60, 3);
  E.push({ k: 'letter', x: 1565, y: 245, ch: '라', i: 0 }, { k: 'letter', x: 4095, y: 235, ch: '꿍', i: 1 }, { k: 'letter', x: 5425, y: 245, ch: '이', i: 2 });
  E.push({ k: 'cage', x: 2900, m: 'elephant' });
  E.push({ k: 'check', x: 2050 }, { k: 'check', x: 3800 });
  return { name: 'STAGE 1 · 골목길', bg: 'bg_alley', groundLine: 720, width: 6300, ground: [[0, 1800], [1980, 3500], [3720, 4700], [4900, 6300]], pit: 'dark', spawn: 300, goalX: 6080, entities: E,
    quote: '"골목은 지났다. 이제 공원이다!"' };
}
function stage2() {
  const E = [];
  hint(E, 200, '공원이다! 벤치와 수풀 위로 올라가 보자', '공원이다! 벤치와 수풀 위로 올라가 보자');
  hint(E, 2250, '버섯 스프링을 밟으면 높이 튀어 올라!', '버섯 스프링을 밟으면 높이 튀어 올라!');
  hint(E, 3700, 'E 로 새장을 열면 독수리를 타고 하늘을 날 수 있어 (↑ ↓ 로 높이 조절)', 'E 버튼으로 독수리를 타면 날 수 있어 (조이스틱 위·아래로 높이 조절)');
  E.push({ k: 'hedge', x: 800 }, { k: 'hedge', x: 2050 }, { k: 'bench', x: 1250 }, { k: 'bench', x: 2800 }, { k: 'barrel', x: 600 }, { k: 'barrel', x: 3550 }, { k: 'hedge', x: 6100 }, { k: 'bench', x: 5750 });
  E.push({ k: 'brick', x: 1000, y: 170, n: 3 }, { k: 'brick', x: 2150, y: 300, n: 2 }, { k: 'brick', x: 3050, y: 150, n: 2 }, { k: 'brick', x: 5900, y: 160, n: 3 }, { k: 'brick', x: 6350, y: 130, n: 2 });
  E.push({ k: 'brick', x: 1600 - 35, y: 70, n: 1 }, { k: 'brick', x: 3300 - 35, y: 70, n: 1 });
  [4420, 4680, 4940, 5200].forEach((x, i) => E.push({ k: 'brick', x, y: [70, 110, 70, 120][i], n: 2 }));
  E.push({ k: 'spring', x: 2330 });
  [[900, 150], [1950, 200], [2900, 160], [5650, 200], [6200, 150]].forEach(([x, r]) => E.push({ k: 'cat', x, r }));
  [[1150, 200], [2500, 180], [3750, 160], [6000, 200]].forEach(([x, r]) => E.push({ k: 'mouse', x, r }));
  [[1000, 320, 260], [2400, 300, 260], [3000, 330, 240], [5800, 320, 260], [6400, 300, 240]].forEach(([x, y, r]) => E.push({ k: 'pigeon', x, y, r }));
  [700, 1700, 2700, 5500].forEach(x => E.push({ k: 'cone', x }));
  [1050, 1850, 2600, 3300, 3550, 5600, 6250].forEach(x => E.push({ k: 'apple', x, y: 40 }));
  E.push({ k: 'heart', x: 2190, y: 365 }, { k: 'heart', x: 3100, y: 215 }, { k: 'heart', x: 5500, y: 50 });
  rowStars(E, 960, 235, 4); rowStars(E, 2120, 365, 3); rowStars(E, 3030, 215, 3); rowStars(E, 5900, 225, 3); rowStars(E, 6330, 195, 3); rowStars(E, 700, 55, 3);
  arcStars(E, 1480, 1720, 120, 70, 5); arcStars(E, 3180, 3420, 120, 70, 5);
  arcStars(E, 4400, 5380, 190, 110, 14);
  E.push({ k: 'letter', x: 1105, y: 260, ch: '라', i: 0 }, { k: 'letter', x: 4985, y: 235, ch: '꿍', i: 1 }, { k: 'letter', x: 6390, y: 220, ch: '이', i: 2 });
  E.push({ k: 'cage', x: 3900, m: 'eagle' });
  E.push({ k: 'check', x: 1800 }, { k: 'check', x: 3500 }, { k: 'check', x: 5500 });
  return { name: 'STAGE 2 · 공원', bg: 'bg_park', groundLine: 735, width: 6800, ground: [[0, 1500], [1700, 3200], [3400, 4300], [5400, 6800]], pit: 'water', spawn: 300, goalX: 6620, entities: E,
    quote: '"공원도 무사히! 이제 강변만 건너면 집이야."' };
}
function stage3() {
  const E = [];
  hint(E, 200, '강변이다! 움직이는 발판은 타이밍을 맞춰 타자', '강변이다! 움직이는 발판은 타이밍을 맞춰 타자');
  hint(E, 4700, '코끼리를 타고 돌진(J)하면 고양이 대장도 문제없어!', '코끼리를 타고 돌진(사과 버튼)하면 고양이 대장도 문제없어!');
  hint(E, 6100, '"여긴 우리 구역이다냥!" — 고양이 대장 돈 캣이 길을 막는다!', '"여긴 우리 구역이다냥!" — 고양이 대장 돈 캣이 길을 막는다!');
  E.push({ k: 'dump', x: 700 }, { k: 'barrel', x: 1100 }, { k: 'crate', x: 2000 }, { k: 'bench', x: 2500 }, { k: 'dump', x: 3350 }, { k: 'barrel', x: 5200 }, { k: 'crate', x: 5450 });
  E.push({ k: 'brick', x: 1300 - 70, y: 150, n: 3 }, { k: 'brick', x: 2300, y: 160, n: 3 }, { k: 'brick', x: 2900 - 35, y: 70, n: 1 }, { k: 'brick', x: 1500 - 35, y: 70, n: 1 }, { k: 'brick', x: 5700 - 35, y: 70, n: 1 }, { k: 'brick', x: 5000, y: 150, n: 3 });
  E.push({ k: 'mover', x: 3700, y: 80, n: 2, dx: 120, dur: 3400, phase: 0 }, { k: 'mover', x: 3970, y: 110, n: 2, dx: 120, dur: 3200, phase: .5 }, { k: 'mover', x: 4260, y: 80, n: 2, dx: 120, dur: 3300, phase: .25 });
  E.push({ k: 'spring', x: 2050 });
  [[800, 200], [2250, 250], [3300, 150], [5000, 200], [6400, 100]].forEach(([x, r]) => E.push({ k: 'cat', x, r }));
  [[1000, 180], [2500, 200], [5250, 200]].forEach(([x, r]) => E.push({ k: 'mouse', x, r }));
  [[1200, 320, 260], [2400, 300, 260], [3350, 320, 200], [4800, 300, 240], [6300, 320, 240]].forEach(([x, y, r]) => E.push({ k: 'pigeon', x, y, r }));
  [600, 1800, 2750, 5100].forEach(x => E.push({ k: 'cone', x }));
  [900, 1900, 2600, 3200, 4850, 5300, 5900, 6150].forEach(x => E.push({ k: 'apple', x, y: 40 }));
  E.push({ k: 'heart', x: 2350, y: 215 }, { k: 'heart', x: 5050, y: 215 }, { k: 'heart', x: 6000, y: 50 });
  rowStars(E, 1250, 215, 3); rowStars(E, 2280, 225, 4); rowStars(E, 5000, 215, 4); rowStars(E, 700, 60, 3);
  arcStars(E, 1380, 1620, 120, 70, 5); arcStars(E, 2780, 3020, 120, 70, 5); arcStars(E, 5580, 5820, 120, 70, 5);
  arcStars(E, 3620, 4580, 160, 120, 12);
  E.push({ k: 'letter', x: 1300, y: 250, ch: '라', i: 0 }, { k: 'letter', x: 2400, y: 255, ch: '꿍', i: 1 }, { k: 'letter', x: 5100, y: 245, ch: '이', i: 2 });
  E.push({ k: 'cage', x: 4800, m: 'elephant' });
  E.push({ k: 'boss', x: 7000 });
  E.push({ k: 'check', x: 1800 }, { k: 'check', x: 3050 }, { k: 'check', x: 4650 }, { k: 'check', x: 5900 });
  return { name: 'STAGE 3 · 강변', bg: 'bg_river', groundLine: 795, width: 7600, ground: [[0, 1400], [1600, 2800], [3000, 3600], [4600, 5600], [5800, 7600]], pit: 'water', spawn: 300, goalX: 7400, entities: E,
    boss: { x: 7000, arenaX: 6150, arenaR: 7560 }, quote: '"드디어 집이다! 라꿍이는 따뜻한 집으로 돌아왔다."' };
}
const STAGES = [stage1, stage2, stage3];

/* ---------- Boot ---------- */
const HERO_ACTS = ['idle', 'walk', 'run', 'jump', 'bite', 'ko', 'happy'];
class Boot extends Phaser.Scene {
  constructor() { super('boot'); }
  preload() {
    const L = this.load, bar = $('title-loading');
    L.on('progress', p => { if (bar) bar.textContent = '리소스 불러오는 중… ' + Math.round(p * 100) + '%'; });
    HERO_ACTS.forEach(a => L.spritesheet('h_' + a, `../assets/sprites/${a}_right.webp`, { frameWidth: 192, frameHeight: 192 }));
    L.spritesheet('cat_walk', '../assets/npc/cat_walk_southeast.webp', { frameWidth: 221, frameHeight: 224 });
    L.spritesheet('cat_idle', '../assets/npc/cat_idle_southeast.webp', { frameWidth: 221, frameHeight: 224 });
    L.spritesheet('elephant_idle', 'assets/elephant_idle.webp', { frameWidth: 300, frameHeight: 187 });
    L.spritesheet('elephant_walk', 'assets/elephant_walk.webp', { frameWidth: 300, frameHeight: 187 });
    L.spritesheet('eagle_fly', 'assets/eagle_fly.webp', { frameWidth: 230, frameHeight: 300 });
    ['bg_alley', 'bg_park', 'bg_river', 'plat_crates', 'plat_brick', 'plat_dumpster', 'plat_bench', 'plat_barrel', 'plat_hedge', 'goal_doghouse', 'item_star', 'item_heart', 'item_apple', 'hazard_cone', 'spring_mushroom', 'npc_pigeon', 'npc_mouse']
      .forEach(k => L.image(k, `assets/${k}.webp`));
  }
  create() { this.scene.start('play'); }
}

/* ---------- Play ---------- */
class Play extends Phaser.Scene {
  constructor() { super('play'); }

  create() {
    window.__home = this;
    this.state = 'title'; this.t0 = 0; this.clock = 0;
    this.lives = 3; this.hp = 3; this.maxHp = 5; this.stars = 0; this.apples = 3; this.letters = [false, false, false];
    this.stageStars = 0; this.stageTotalStars = 0;
    this.unlocked = clamp(parseInt(tryLS.get('rk2_unlocked', '1'), 10) || 1, 1, 3);
    this.mkAnims(); this.mkTextures();
    this.cols = []; this.objs = [];
    this.physics.world.setBoundsCollision(true, true, false, false);
    this.bindUI();
    this.buildStage(0, true);
    this.showTitle();
  }

  mkAnims() {
    const A = (key, tex, fps, repeat = -1, frames) => this.anims.create({ key, frames: this.anims.generateFrameNumbers(tex, { start: 0, end: 24, ...(frames || {}) }), frameRate: fps, repeat });
    A('h_idle', 'h_idle', 10); A('h_walk', 'h_walk', 20); A('h_run', 'h_run', 26); A('h_bite', 'h_bite', 36, 0); A('h_ko', 'h_ko', 18, 0); A('h_happy', 'h_happy', 16, 0);
    A('cat_walk', 'cat_walk', 18); A('cat_idle', 'cat_idle', 10);
    A('elephant_idle', 'elephant_idle', 10); A('elephant_walk', 'elephant_walk', 22); A('eagle_fly', 'eagle_fly', 22);
  }
  mkTextures() {
    // top half of the crate stack = one crate
    const src = this.textures.get('plat_crates').getSourceImage(), w = src.width, h = src.height;
    const t = this.textures.createCanvas('crate1', w, Math.floor(h / 2)); t.getContext().drawImage(src, 0, 0, w, h / 2, 0, 0, w, h / 2); t.refresh();
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1); g.fillCircle(8, 8, 8); g.generateTexture('dot', 16, 16); g.clear();
    g.fillStyle(0xfff2b0, 1); g.fillCircle(6, 6, 6); g.generateTexture('glow', 12, 12); g.destroy();
  }

  /* ----- DOM wiring ----- */
  bindUI() {
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', ev => { Sfx.resume(); fn(ev); }); };
    on('btn-pause', () => this.togglePause());
    on('btn-resume', () => this.togglePause());
    on('btn-retry', () => this.startStage(this.stageIdx, true));
    on('btn-menu', () => this.toMenu());
    on('btn-next', () => { if (this.stageIdx < 2) this.startStage(this.stageIdx + 1, false); else this.toMenu(); });
    on('btn-again', () => this.startStage(this.stageIdx, true));
    on('btn-over-retry', () => this.startStage(this.stageIdx, true));
    on('btn-over-menu', () => this.toMenu());
    on('btn-full', () => { try { const d = document.documentElement, p = (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); if (p && p.catch) p.catch(() => {}); } catch (e) {} });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.togglePause(); });
  }
  show(id, on) { const e = $(id); if (e) e.classList.toggle('hidden', !on); }
  showTitle() {
    this.state = 'title';
    ['hud', 'pause', 'clear', 'over'].forEach(i => this.show(i, false)); this.show('title', true);
    $('title-loading').classList.add('hidden');
    const box = $('stage-pick'); box.classList.remove('hidden'); box.innerHTML = '';
    const names = ['골목길', '공원', '강변'];
    names.forEach((n, i) => {
      const b = document.createElement('button'); b.className = 'big-btn stage-btn' + (i + 1 > this.unlocked ? '' : '');
      b.innerHTML = (i + 1 > this.unlocked ? '🔒 ' : '') + 'STAGE ' + (i + 1) + '<small>' + n + '</small>'; b.disabled = i + 1 > this.unlocked;
      b.addEventListener('click', () => { Sfx.resume(); this.lives = 3; this.startStage(i, true); });
      box.appendChild(b);
    });
  }
  toMenu() { this.state = 'title'; this.buildStage(0, true); this.showTitle(); }

  /* ----- stage building ----- */
  // small screens: bigger characters (the ground stays at the bottom edge); portrait play zooms in further
  applyZoom() { const small = T.on || innerWidth < 900; let z = small ? 1.22 : 1; if (small && innerHeight > innerWidth) z = Math.max(1.22, Math.min(2.6, 0.52 / (innerWidth / 1280))); this.cameras.main.setZoom(z); }
  teardown() {
    this.cols.forEach(c => c.destroy()); this.cols = [];
    this.objs.forEach(o => { try { o.destroy(); } catch (e) {} }); this.objs = [];
    ['gGround', 'gSolid', 'gOne', 'gMove', 'gEnemy', 'gItem', 'gApple', 'gHaz', 'gSpring'].forEach(k => { if (this[k]) { this[k].clear(true, true); this[k].destroy(); } this[k] = null; });
    this.cages = []; this.parked = []; this.enemies = []; this.checks = []; this.hints = []; this.movers = []; this.boss = null; this.mount = null;
    if (this.hero) { this.hero.destroy(); this.hero = null; }
  }
  add2(o, depth) { if (depth !== undefined) o.setDepth(depth); this.objs.push(o); return o; }
  box(group, cx, cy, w, h) { const z = this.add.rectangle(cx, cy, w, h).setVisible(false); this.physics.add.existing(z, true); group.add(z); this.objs.push(z); return z; }

  buildStage(idx, demo) {
    this.teardown();
    this.stageIdx = idx; const S = this.S = STAGES[idx](); this.demo = !!demo;
    const G = () => this.physics.add.staticGroup();
    this.gGround = G(); this.gSolid = G(); this.gOne = G(); this.gSpring = G();
    this.gMove = this.physics.add.group({ allowGravity: false, immovable: true });
    this.gEnemy = this.physics.add.group(); this.gItem = this.physics.add.group({ allowGravity: false }); this.gHaz = this.physics.add.group({ allowGravity: false });
    this.gApple = this.physics.add.group();
    this.physics.world.setBounds(0, -600, S.width, H + 1400);
    this.cameras.main.setBounds(0, 0, S.width, H);
    this.applyZoom(); if (!this._zoomBound) { this._zoomBound = true; addEventListener('resize', () => this.applyZoom()); }

    // background (mirrored so it tiles seamlessly) + ground strip cut from the same art
    const img = this.textures.get(S.bg).getSourceImage();
    if (this.textures.exists('bgm')) this.textures.remove('bgm'); if (this.textures.exists('gnd')) this.textures.remove('gnd');
    const bt = this.textures.createCanvas('bgm', 2048, 1024), bc = bt.getContext();
    bc.drawImage(img, 0, 0, 1024, 1024); bc.save(); bc.translate(2048, 0); bc.scale(-1, 1); bc.drawImage(img, 0, 0, 1024, 1024); bc.restore(); bt.refresh();
    const gt = this.textures.createCanvas('gnd', 2048, 160); gt.getContext().drawImage(bt.getCanvas(), 0, S.groundLine, 2048, 160, 0, 0, 2048, 160); gt.refresh();
    this.bg = this.add2(this.add.tileSprite(0, 0, W, H, 'bgm').setOrigin(0).setScrollFactor(0), 0);
    this.bg.tilePositionY = S.groundLine - FLOOR;
    this.sun = null;

    // ground + pits
    S.ground.forEach(([a, b]) => {
      this.add2(this.add.tileSprite(a, FLOOR, b - a, 160, 'gnd').setOrigin(0, 0), 2).tilePositionX = a;
      this.box(this.gGround, (a + b) / 2, STAND + 150, b - a, 300);
    });
    for (let i = 0; i < S.ground.length - 1; i++) this.makePit(S.ground[i][1], S.ground[i + 1][0], S.pit);
    this.makeFireflies(S.width);

    // entities
    this.stageTotalStars = 0; this.stageStars = 0;
    S.entities.forEach(e => this.spawnEntity(e));

    // goal
    const gx = S.goalX;
    this.goalSpr = this.add2(this.add.image(gx, STAND + 6, 'goal_doghouse').setOrigin(.5, 1).setDisplaySize(250, 249), 4);
    this.goalGlow = this.add2(this.add.image(gx, STAND - 90, 'glow').setScale(16).setAlpha(.18).setBlendMode(Phaser.BlendModes.ADD), 3);
    this.tweens.add({ targets: this.goalGlow, alpha: .32, scale: 19, duration: 1200, yoyo: true, repeat: -1 });

    this.buildHero(S.spawn);
    this.cp = { x: S.spawn, i: -1 };
    this.addColliders(this.hero);
    this.cols.push(this.physics.add.collider(this.gEnemy, this.gGround), this.physics.add.collider(this.gEnemy, this.gSolid));
    this.cameras.main.startFollow(this.hero, true, 0.12, 0.1); this.cameras.main.setFollowOffset(-80, 20);
    this.cameras.main.scrollX = clamp(S.spawn - W / 2, 0, S.width - W);
    this.bossDefeated = !S.boss; this.bossActive = false; this.arenaWall = null;
    this.letters = [false, false, false]; this.invuln = 0; this.coyote = 0; this.jbuf = 0; this.atkCd = 0; this.dead = false; this.finished = false;
    this.updateHudStatic();
  }

  makePit(x0, x1, style) {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    if (style === 'water') {
      this.add2(this.add.rectangle(cx, FLOOR + 80, w, 160, 0x1d3f73), 1.5);
      const hi = this.add2(this.add.rectangle(cx, FLOOR + 8, w, 14, 0x6fb7ff, .55), 1.6);
      this.tweens.add({ targets: hi, alpha: .15, duration: 900 + Math.random() * 500, yoyo: true, repeat: -1 });
      for (let i = 0; i < Math.floor(w / 140); i++) { const r = this.add2(this.add.rectangle(x0 + 60 + i * 140, FLOOR + 40 + (i % 3) * 22, 70, 6, 0xaee0ff, .35), 1.6); this.tweens.add({ targets: r, x: r.x + 30, alpha: .08, duration: 1100 + i * 90, yoyo: true, repeat: -1 }); }
    } else {
      this.add2(this.add.rectangle(cx, FLOOR + 80, w, 160, 0x130d1f), 1.5);
      this.add2(this.add.rectangle(cx, FLOOR + 6, w, 10, 0x3a2a55, .8), 1.6);
    }
  }
  makeFireflies(width) {
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * width, y = 120 + Math.random() * 380;
      const f = this.add2(this.add.image(x, y, 'glow').setScale(.5 + Math.random() * .6).setAlpha(.15 + Math.random() * .4).setBlendMode(Phaser.BlendModes.ADD), 8);
      this.tweens.add({ targets: f, x: x + (Math.random() * 160 - 80), y: y + (Math.random() * 90 - 45), alpha: .05, duration: 2200 + Math.random() * 2500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
  }

  spawnEntity(e) {
    const base = STAND + 4;
    switch (e.k) {
      case 'hint': this.hints.push(e); break;
      case 'check': { const pole = this.add2(this.add.rectangle(e.x, base - 50, 6, 100, 0xfff6e4), 4); const flag = this.add2(this.add.triangle(e.x + 4, base - 88, 0, 0, 0, 38, 44, 19, 0x9a9a9a), 4.1); const paw = this.add2(this.add.text(e.x + 8, base - 100, '🐾', { fontSize: '18px' }), 4.2); this.checks.push({ x: e.x, flag, paw, on: false }); break; }
      case 'crate': { const im = this.add2(this.add.image(e.x, base, 'crate1').setOrigin(.5, 1).setDisplaySize(100, 90), 4); this.box(this.gSolid, e.x, base - 43, 88, 86); break; }
      case 'dump': { this.add2(this.add.image(e.x, base, 'plat_dumpster').setOrigin(.5, 1).setDisplaySize(170, 121), 4); this.box(this.gSolid, e.x, base - 56, 160, 112); break; }
      case 'barrel': { this.add2(this.add.image(e.x, base, 'plat_barrel').setOrigin(.5, 1).setDisplaySize(86, 100), 4); this.box(this.gSolid, e.x, base - 48, 76, 94); break; }
      case 'hedge': { this.add2(this.add.image(e.x, base, 'plat_hedge').setOrigin(.5, 1).setDisplaySize(130, 116), 4); this.box(this.gSolid, e.x, base - 54, 120, 106); break; }
      case 'bench': { this.add2(this.add.image(e.x, base, 'plat_bench').setOrigin(.5, 1).setDisplaySize(190, 122), 4); const z = this.box(this.gOne, e.x, base - 57 + 7, 150, 14); z.body.checkCollision.down = z.body.checkCollision.left = z.body.checkCollision.right = false; break; }
      case 'brick': {
        for (let i = 0; i < e.n; i++) this.add2(this.add.image(e.x + i * 70 + 35, STAND - e.y, 'plat_brick').setOrigin(.5, 0).setDisplaySize(72, 72), 4);
        const z = this.box(this.gOne, e.x + e.n * 35, STAND - e.y + 7, e.n * 70, 14); z.body.checkCollision.down = z.body.checkCollision.left = z.body.checkCollision.right = false; break;
      }
      case 'mover': {
        const vis = []; for (let i = 0; i < e.n; i++) vis.push(this.add2(this.add.image(0, 0, 'plat_brick').setOrigin(.5, 0).setDisplaySize(72, 72), 4));
        const z = this.add.rectangle(e.x + e.n * 35, STAND - e.y + 7, e.n * 70, 14).setVisible(false); this.physics.add.existing(z); z.body.setImmovable(true).setAllowGravity(false);
        z.body.checkCollision.down = z.body.checkCollision.left = z.body.checkCollision.right = false; this.gMove.add(z); this.objs.push(z);
        this.movers.push({ z, vis, e, x0: e.x + e.n * 35, px: z.x, t: (e.phase || 0) * e.dur }); break;
      }
      case 'spring': { const im = this.add2(this.add.image(e.x, base, 'spring_mushroom').setOrigin(.5, 1).setDisplaySize(72, 73), 4.5); const z = this.box(this.gSpring, e.x, base - 50, 60, 24); z.im = im; z.base = base; break; }
      case 'cone': { this.add2(this.add.image(e.x, base, 'hazard_cone').setOrigin(.5, 1).setDisplaySize(44, 58), 4.5); const z = this.add.rectangle(e.x, base - 26, 30, 50).setVisible(false); this.physics.add.existing(z); z.body.setAllowGravity(false); this.gHaz.add(z); this.objs.push(z); break; }
      case 'star': case 'heart': case 'apple': case 'letter': this.spawnItem(e); break;
      case 'cat': case 'mouse': case 'pigeon': this.spawnEnemy(e); break;
      case 'cage': this.spawnCage(e); break;
      case 'boss': this.bossSpec = e; break;
    }
  }
  spawnItem(e) {
    const y = STAND - e.y; let spr;
    if (e.k === 'letter') {
      spr = this.add.text(e.x, y, e.ch, { fontFamily: 'Jua, "Malgun Gothic", sans-serif', fontSize: '54px', color: '#ffe28a', stroke: '#b5640c', strokeThickness: 8 }).setOrigin(.5);
      const halo = this.add2(this.add.image(e.x, y, 'glow').setScale(7).setAlpha(.35).setBlendMode(Phaser.BlendModes.ADD), 6.8); spr.halo = halo; this.tweens.add({ targets: halo, scale: 9, alpha: .15, duration: 800, yoyo: true, repeat: -1 });
      this.physics.add.existing(spr); spr.body.setAllowGravity(false); spr.body.setSize(50, 56);
    } else {
      const key = 'item_' + e.k, sz = e.k === 'star' ? 40 : e.k === 'heart' ? 40 : 34;
      spr = this.add.image(e.x, y, key).setDisplaySize(sz, sz * (e.k === 'apple' ? 1.06 : 1)); this.physics.add.existing(spr); spr.body.setAllowGravity(false); spr.body.setCircle(spr.width * .42, spr.width * .08, spr.height * .08);
      if (e.k === 'star') this.stageTotalStars++;
    }
    spr.setDepth(7).kind = e.k; spr.item = e; spr.baseY = y; this.gItem.add(spr); this.objs.push(spr);
    this.tweens.add({ targets: spr, y: y - 8, duration: 700 + (e.x % 5) * 70, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }
  spawnEnemy(e) {
    const base = STAND; let spr, en;
    const ground = this.S.ground.find(([a, b]) => e.x >= a && e.x <= b) || [e.x - 300, e.x + 300];
    if (e.k === 'cat') {
      spr = this.physics.add.sprite(e.x, base, 'cat_walk', 0).setOrigin(.5, .93).setScale(.62).setDepth(7); spr.play('cat_walk');
      spr.body.setSize(80, 150).setOffset(70, 58); en = { k: 'cat', hp: 2, speed: 78, chase: 150 };
    } else if (e.k === 'mouse') {
      spr = this.physics.add.sprite(e.x, base, 'npc_mouse').setOrigin(.5, 1).setDepth(7); spr.setDisplaySize(spr.width * 78 / spr.height, 78);
      spr.body.setSize(spr.width * .7, spr.height * .85).setOffset(spr.width * .15, spr.height * .15); en = { k: 'mouse', hp: 1, speed: 120, chase: 0, hop: 0 };
    } else {
      spr = this.physics.add.sprite(e.x, e.y, 'npc_pigeon').setOrigin(.5, .5).setDepth(7.5); spr.setDisplaySize(spr.width * 92 / spr.height, 92);
      spr.body.setAllowGravity(false); spr.body.setSize(spr.width * .7, spr.height * .75).setOffset(spr.width * .15, spr.height * .12); en = { k: 'pigeon', hp: 1, speed: 90, y0: e.y, phase: Math.random() * 6, mode: 'hover', t: 0 };
    }
    spr.en = en; en.spr = spr; en.dir = Math.random() < .5 ? -1 : 1; en.x0 = Math.max(e.x - (e.r || 160), ground[0] + 40); en.x1 = Math.min(e.x + (e.r || 160), ground[1] - 40); en.dirty = 0; en.dead = false; en.hurtT = 0; en.sx = spr.scaleX; en.sy = spr.scaleY;
    this.gEnemy.add(spr); this.enemies.push(en); this.objs.push(spr);
    if (e.k !== 'pigeon') { spr.body.setCollideWorldBounds(false); }
  }
  spawnCage(e) {
    const base = STAND + 4, cg = { x: e.x, m: e.m, open: false, parts: [] };
    const tex = e.m === 'elephant' ? 'elephant_idle' : 'eagle_fly';
    const cr = this.add2(this.add.sprite(e.x, e.m === 'elephant' ? base - 4 : base - 90, tex, 0).setOrigin(.5, e.m === 'elephant' ? .98 : .5).setScale(e.m === 'elephant' ? .72 : .6), 4.8); cr.play(e.m === 'elephant' ? 'elephant_idle' : 'eagle_fly');
    const g = this.add2(this.add.graphics(), 5); const w = 270, h = 200, x0 = e.x - w / 2, y0 = base - h;
    g.fillStyle(0x20202c, .22).fillRect(x0, y0, w, h);
    g.lineStyle(6, 0x2f3446, 1); for (let i = 0; i <= 8; i++) { const x = x0 + (w / 8) * i; g.lineBetween(x, y0, x, base); }
    g.lineStyle(9, 0x2a2e3d, 1).strokeRect(x0, y0, w, h); g.lineStyle(5, 0x4a5068, 1).lineBetween(x0, y0 + 40, x0 + w, y0 + 40);
    g.fillStyle(0xffcf5a, 1).fillRoundedRect(e.x - 14, base - 76, 28, 24, 5); g.lineStyle(4, 0x8a5a14, 1).strokeRoundedRect(e.x - 14, base - 76, 28, 24, 5);
    const ar = this.add2(this.add.text(e.x, y0 - 34, '▼ E', { fontFamily: 'Jua, sans-serif', fontSize: '26px', color: '#ffe28a', stroke: '#6b3fa0', strokeThickness: 5 }).setOrigin(.5), 9); ar.setVisible(false);
    this.tweens.add({ targets: ar, y: y0 - 26, duration: 450, yoyo: true, repeat: -1 });
    cg.parts = [cr, g]; cg.arrow = ar; cg.creature = cr; cg.y0 = y0; this.cages.push(cg);
  }

  buildHero(x) {
    const h = this.physics.add.sprite(x, STAND, 'h_idle', 0).setOrigin(.5, .87).setScale(.88).setDepth(9);
    h.body.setSize(66, 104).setOffset(63, 63); h.body.setMaxVelocity(700, 1500); h.body.setCollideWorldBounds(true);
    h.play('h_idle'); h.face = 1; this.hero = h; h.setData('kind', 'hero');
  }
  addColliders(sp) {
    const c = (a, b, cb) => this.cols.push(this.physics.add.collider(a, b, cb));
    c(sp, this.gGround); c(sp, this.gSolid); c(sp, this.gOne); c(sp, this.gMove);
  }

  /* ----- run control ----- */
  startStage(idx, resetRun) {
    ['title', 'pause', 'clear', 'over'].forEach(i => this.show(i, false));
    if (resetRun) { this.lives = Math.max(this.lives, 3); }
    this.buildStage(idx, false);
    this.hp = 3; this.stars = 0; this.apples = 3; this.state = 'play'; this.t0 = this.time.now; this.clockAcc = 0;
    this.show('hud', true); this.updateHudStatic(); this.hudAll();
    this.toast(this.S.name, 1600);
  }
  togglePause() {
    if (this.state === 'play') { this.state = 'pause'; this.show('pause', true); this.pausedAt = this.time.now; this.physics.world.pause(); }
    else if (this.state === 'pause') { this.state = 'play'; this.show('pause', false); this.physics.world.resume(); }
  }

  /* ----- main loop ----- */
  update(time, delta) {
    const dt = Math.min(delta, 40) / 1000;
    if (this.bg) { const cx = this.cameras.main.scrollX; this.bg.tilePositionX = cx * .35; }
    if (this.state === 'title') { this.titleDrift(dt); this.clearHits(); return; }
    const inp = readInput();
    if (inp.pause && (this.state === 'play' || this.state === 'pause')) this.togglePause();
    if (this.state !== 'play') { this.clearHits(); return; }
    this.clockAcc += dt;
    this.updateMovers(dt);
    this.updateHero(dt, inp);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateOverlaps();
    this.updateWorldBits(dt);
    this.clearHits();
  }
  clearHits() { for (const k in hit) delete hit[k]; }
  titleDrift(dt) { const c = this.cameras.main; c.stopFollow(); c.scrollX = (c.scrollX + dt * 30) % 600; }

  get active() { return this.mount ? this.mount.sp : this.hero; }

  updateMovers(dt) {
    this.movers.forEach(m => {
      m.dx = m.z.x - m.px; m.px = m.z.x;                         // how far the physics step moved it last frame (riders get carried by this)
      m.t += dt * 1000; const nx = m.x0 + Math.sin((m.t / m.e.dur) * Math.PI * 2) * m.e.dx;
      m.z.body.setVelocityX((nx - m.z.x) / Math.max(dt, .008));   // chase the target position with the physics body (no manual teleporting)
      m.vis.forEach((v, i) => v.setPosition(m.z.x - (m.e.n * 35) + i * 70 + 35, m.z.y - 7));
    });
  }

  updateHero(dt, inp) {
    const h = this.hero, m = this.mount, sp = m ? m.sp : h, b = sp.body;
    if (this.dead) return;
    this.invuln = Math.max(0, this.invuln - dt); this.atkCd = Math.max(0, this.atkCd - dt);
    const flying = m && m.kind === 'eagle';
    const grounded = b.blocked.down || b.touching.down;
    // carry by moving platforms
    if (grounded && this.movers.length) { this.movers.forEach(mv => { const top = mv.z.y - 7; if (Math.abs(b.bottom - top) < 10 && b.right > mv.z.x - mv.e.n * 35 && b.left < mv.z.x + mv.e.n * 35 && mv.dx) sp.x += mv.dx; }); }
    if (inp.ax) sp.face = Math.sign(inp.ax); sp.face = sp.face || 1;
    if (flying) {
      b.setVelocityX(approach(b.velocity.x, inp.ax * 330, 1600 * dt)); b.setVelocityY(approach(b.velocity.y, inp.ay * 280 + Math.sin(this.time.now / 220) * 14, 1400 * dt));
      sp.y = clamp(sp.y, 215, STAND - 70); if ((sp.y >= STAND - 70 && b.velocity.y > 0) || (sp.y <= 215 && b.velocity.y < 0)) b.setVelocityY(0);
      sp.setFlipX(sp.face < 0); sp.setAngle(clamp(b.velocity.y / 14, -16, 16) * sp.face);
    } else {
      const cfg = m ? { walk: 215, run: 330, acc: 1500, air: 1000, jump: 760 } : { walk: 240, run: 360, acc: 1800, air: 1200, jump: 810 };
      if (m && m.dash > 0) { m.dash -= dt; b.setVelocityX(sp.face * 560); }
      else b.setVelocityX(approach(b.velocity.x, inp.ax * (inp.run ? cfg.run : cfg.walk), (grounded ? cfg.acc : cfg.air) * dt));
      if (grounded) this.coyote = .1; else this.coyote -= dt;
      if (inp.jump) this.jbuf = .12; else this.jbuf -= dt;
      if (this.jbuf > 0 && this.coyote > 0) { b.setVelocityY(-cfg.jump); this.jbuf = 0; this.coyote = 0; Sfx.jump(); this.dust(sp.x, sp.y); }
      if (!inp.jumpHeld && b.velocity.y < -280) b.setVelocityY(b.velocity.y * .55 > -280 ? -280 : b.velocity.y * .55);
      sp.setFlipX(sp.face < 0);
    }
    // animation
    if (m) {
      m.sp.setFlipX(sp.face < 0);
      const moving = Math.abs(b.velocity.x) > 25 && (grounded || flying);
      if (m.kind === 'elephant') { m.sp.anims.play(moving ? 'elephant_walk' : 'elephant_idle', true); m.sp.anims.timeScale = moving ? clamp(Math.abs(b.velocity.x) / 215, .7, 1.6) : 1; }
      else m.sp.anims.play('eagle_fly', true);
      const seat = m.kind === 'elephant' ? 118 : 46;
      h.setPosition(m.sp.x - sp.face * 8, m.sp.y - seat + (m.kind === 'elephant' ? Math.sin(this.time.now / 180) * 2 : 0)); h.setFlipX(sp.face < 0); h.setScale(.7).setAngle(m.kind === 'eagle' ? m.sp.angle * .6 : 0);
      if (!this.atkAnim) { h.anims.play('h_idle', true); }
      if (m.kind === 'elephant') { if (m.cd > 0) m.cd -= dt; if (inp.atk && m.cd <= 0) { m.dash = .42; m.cd = 1.3; Sfx.trumpet(); this.shake(80, .004); this.dust(sp.x, sp.y); } }
      else if (inp.atk) this.throwApple(inp);
    } else {
      if (this.atkAnim) { /* bite anim plays out */ }
      else if (!grounded) { h.anims.stop(); h.setTexture('h_jump', b.velocity.y < -250 ? 10 : b.velocity.y > 250 ? 16 : 13); }
      else if (Math.abs(b.velocity.x) > 28) h.anims.play(Math.abs(b.velocity.x) > 300 ? 'h_run' : 'h_walk', true);
      else h.anims.play('h_idle', true);
      if (inp.atk) this.throwApple(inp);
    }
    // blink when invulnerable
    const blink = this.invuln > 0 && Math.floor(this.time.now / 80) % 2 === 0;
    (m ? [h, m.sp] : [h]).forEach(o => o.setAlpha(blink ? .35 : 1));
    // interact (E)
    if (inp.act) this.interact();
    const near = this.nearCage();
    this.cages.forEach(c => c.arrow.setVisible(!c.open && c === near && !this.mount));
    if (this.parked.length) { const p = this.nearParked(); this.parked.forEach(q => q.hint && q.hint.setVisible(q === p && !this.mount)); }
    const ab = $('tb-act'); if (ab) ab.classList.toggle('hot', !!(near || (!this.mount && this.nearParked()) || this.mount));
    // pit
    if (sp.y > H + 130) this.fellInPit();
  }

  throwApple(inp) {
    if (this.atkCd > 0 || this.apples <= 0) { if (this.apples <= 0 && this.atkCd <= 0) { this.toast('사과가 없어!', 700); this.atkCd = .6; } return; }
    const sp = this.active, dir = sp.face || 1; this.apples--; this.atkCd = .32; this.hudApples();
    const a = this.physics.add.sprite(sp.x + dir * 40, sp.y - (this.mount ? 130 : 56), 'item_apple').setDisplaySize(30, 32).setDepth(9.5);
    a.body.setCircle(a.width * .4, a.width * .1, a.height * .1); a.body.setGravityY(-GRAV + 760).setBounce(.5, .5); a.setVelocity(dir * 640, this.mount && this.mount.kind === 'eagle' ? 120 : -250); a.bounces = 0; a.life = 1.7; this.gApple.add(a); this.objs.push(a);
    this.cols.push(this.physics.add.collider(a, this.gGround, () => { a.bounces++; }), this.physics.add.collider(a, this.gSolid, () => { a.bounces += 2; }));
    Sfx.throwA();
    if (!this.mount) { this.atkAnim = true; this.hero.anims.stop(); this.hero.anims.timeScale = 1; this.hero.play('h_bite'); this.hero.anims.timeScale = 1; this.time.delayedCall(330, () => { this.atkAnim = false; }); }
  }

  interact() {
    if (this.mount) { this.dismount(); return; }
    const c = this.nearCage();
    if (c) { this.openCage(c); return; }
    const p = this.nearParked(); if (p) this.mountParked(p);
  }
  nearCage() { const hx = this.hero.x; let best = null, bd = 1e9; this.cages.forEach(c => { if (c.open) return; const d = Math.abs(c.x - hx); if (d < 150 && d < bd) { best = c; bd = d; } }); return best; }
  nearParked() { const hx = this.hero.x; return this.parked.find(p => Math.abs(p.sp.x - hx) < 130 && Math.abs(p.sp.y - this.hero.y) < 140) || null; }
  openCage(c) {
    c.open = true; c.parts.forEach(p => { if (p !== c.creature) this.tweens.add({ targets: p, alpha: 0, y: p.y - 30, duration: 400, onComplete: () => p.destroy() }); });
    c.arrow.setVisible(false); const x = c.x; c.creature.destroy();
    Sfx.mount(); this.burst(x, STAND - 80, 8); this.toast(c.m === 'elephant' ? '코끼리가 동료가 됐다!' : '독수리가 동료가 됐다!', 1400);
    this.createMount(c.m, x, c.m === 'elephant' ? STAND : STAND - 120, true);
  }
  createMount(kind, x, y, ride) {
    let sp, hp;
    if (kind === 'elephant') { sp = this.physics.add.sprite(x, y, 'elephant_idle', 0).setOrigin(.5, .98).setScale(.76).setDepth(8.5); sp.body.setSize(220, 140).setOffset(40, 43); hp = 3; sp.play('elephant_idle'); }
    else { sp = this.physics.add.sprite(x, y, 'eagle_fly', 0).setOrigin(.5, .5).setScale(.6).setDepth(8.5); sp.body.setSize(160, 100).setOffset(35, 120); sp.body.setAllowGravity(false); hp = 2; sp.play('eagle_fly'); }
    sp.body.setMaxVelocity(700, 1500); sp.body.setCollideWorldBounds(true); sp.face = this.hero.face || 1; this.objs.push(sp);
    const mt = { kind, sp, hp, maxHp: hp, dash: 0, cd: 0 }; sp.mt = mt; this.addColliders(sp);
    if (ride) this.mountOn(mt); else this.parked.push(mt);
    return mt;
  }
  mountOn(mt) {
    this.mount = mt; this.parked = this.parked.filter(p => p !== mt); if (mt.hint) { mt.hint.destroy(); mt.hint = null; }
    this.hero.body.enable = false; this.hero.body.setVelocity(0, 0); this.atkAnim = false;
    if (mt.kind === 'eagle') { mt.sp.body.setAllowGravity(false); }
    this.cameras.main.startFollow(mt.sp, true, 0.12, 0.1); this.hudMount();
  }
  mountParked(p) { Sfx.mount(); p.sp.face = this.hero.face; this.mountOn(p); }
  dismount(fled) {
    const mt = this.mount; if (!mt) return;
    this.mount = null; const h = this.hero; h.setScale(.88).setAngle(0).setAlpha(1); h.body.enable = true; h.body.reset(h.x, mt.kind === 'eagle' ? Math.min(h.y + 40, STAND) : STAND - 1); h.body.setVelocity(0, -240); h.setFlipX(mt.sp.face < 0);
    this.cameras.main.startFollow(h, true, 0.12, 0.1);
    this.hudMount();
    if (fled || mt.kind === 'eagle') {
      // the mount hurries away
      const sp = mt.sp; sp.body.enable = false; this.tweens.add({ targets: sp, x: sp.x + (fled ? -1 : 1) * 700, y: mt.kind === 'eagle' ? sp.y - 220 : sp.y, alpha: 0, duration: 900, onComplete: () => { sp.destroy(); } });
      this.toast(fled ? '동료가 도망쳤다…' : '독수리가 날아갔다!', 1200);
    } else { mt.sp.body.setVelocity(0, 0); mt.sp.anims.play('elephant_idle', true); mt.hint = this.add2(this.add.text(mt.sp.x, mt.sp.y - 170, '▼ E', { fontFamily: 'Jua, sans-serif', fontSize: '24px', color: '#ffe28a', stroke: '#6b3fa0', strokeThickness: 5 }).setOrigin(.5), 9).setVisible(false); this.parked.push(mt); }
  }

  /* ----- enemies ----- */
  updateEnemies(dt) {
    const sp = this.active, hx = sp.x, hy = sp.y;
    this.enemies.forEach(en => {
      if (en.dead) return; const s = en.spr; en.hurtT = Math.max(0, en.hurtT - dt);
      if ((en.k === 'cat' || en.k === 'mouse') && s.body) { if (s.body.blocked.left) en.dir = 1; else if (s.body.blocked.right) en.dir = -1; }
      if (en.k === 'cat') {
        const d = hx - s.x, chase = Math.abs(d) < 360 && Math.abs(hy - s.y) < 150 && hx > en.x0 - 80 && hx < en.x1 + 80 && !this.bossBusy;
        let vx = en.dir * en.speed; if (chase) { en.dir = Math.sign(d) || en.dir; vx = en.dir * en.chase; }
        if (s.x < en.x0) en.dir = 1; else if (s.x > en.x1) en.dir = -1;
        if (en.hurtT > 0) vx = en.kb || 0; s.body.setVelocityX(vx); s.setFlipX(en.dir < 0);
        if (!s.anims.currentAnim || s.anims.currentAnim.key !== 'cat_walk') s.play('cat_walk');
      } else if (en.k === 'mouse') {
        en.hop -= dt; if (s.body.blocked.down && en.hop <= 0) { s.body.setVelocityY(-340); en.hop = .9 + Math.random() * .7; }
        if (s.x < en.x0) en.dir = 1; else if (s.x > en.x1) en.dir = -1;
        s.body.setVelocityX(en.hurtT > 0 ? (en.kb || 0) : en.dir * en.speed); s.setFlipX(en.dir > 0);
      } else if (en.k === 'pigeon') {
        en.t += dt; const near = Math.abs(hx - s.x) < 260 && hy > s.y + 40;
        if (en.mode === 'hover') {
          s.x += en.dir * en.speed * dt; if (s.x < en.x0) en.dir = 1; if (s.x > en.x1) en.dir = -1;
          s.y = en.y0 + Math.sin(en.t * 2.2 + en.phase) * 24; s.setFlipX(en.dir > 0);
          if (near && en.t > 1.5) { en.mode = 'dive'; en.tx = hx; en.ty = hy - 40; en.t = 0; }
        } else if (en.mode === 'dive') {
          const dx = en.tx - s.x, dy = en.ty - s.y, l = Math.hypot(dx, dy) || 1; s.x += dx / l * 380 * dt; s.y += dy / l * 380 * dt; if (l < 20 || en.t > 1.1) { en.mode = 'rise'; en.t = 0; }
        } else { s.y += (en.y0 - s.y) * 3 * dt; s.x += en.dir * 60 * dt; if (Math.abs(s.y - en.y0) < 8) { en.mode = 'hover'; en.t = 0; } }
        s.setAngle(Math.sin(this.time.now / 90) * 4);
      }
      s.body.updateFromGameObject && en.k === 'pigeon' && s.body.updateFromGameObject();
      if (s.y > H + 200) this.killEnemy(en, true);
    });
  }
  hitEnemy(en, dmg, kbDir) {
    if (en.dead || en.invul > this.time.now) return;
    en.hp -= dmg; en.invul = this.time.now + 250; en.hurtT = .25; en.kb = (kbDir || 1) * 220; Sfx.hitE();
    en.spr.setTint(0xff6a6a); this.time.delayedCall(140, () => { if (en.spr.active) en.spr.clearTint(); });
    this.tweens.add({ targets: en.spr, scaleX: en.sx * 1.15, scaleY: en.sy * .85, duration: 70, yoyo: true });
    if (en.hp <= 0) this.killEnemy(en);
  }
  killEnemy(en, silent) {
    if (en.dead) return; en.dead = true; const s = en.spr; if (!silent) { this.burst(s.x, s.y - 40, 7); this.popText(s.x, s.y - 90, en.k === 'cat' ? '+30' : '+10'); }
    this.gEnemy.remove(s); s.body.enable = false;
    this.tweens.add({ targets: s, y: s.y - 80, angle: 540 * (Math.random() < .5 ? -1 : 1), alpha: 0, duration: 520, onComplete: () => s.destroy() });
    if (!silent) { this.addStars(en.k === 'cat' ? 3 : 1, false); if (Math.random() < .22) this.dropApple(s.x, s.y - 40); }
  }
  dropApple(x, y) { const e = { k: 'apple', x, y: STAND - y }; this.spawnItem(e); }

  /* ----- boss ----- */
  startBoss() {
    const b = this.S.boss, e = this.bossSpec; this.bossActive = true; this.bossBusy = true;
    this.arenaWall = this.box(this.gSolid, b.arenaX, STAND - 200, 30, 900); this.physics.add.collider; this.toast('돈 캣이 나타났다!', 1500); Sfx.boss();
    const spr = this.physics.add.sprite(e.x, STAND, 'cat_walk', 0).setOrigin(.5, .93).setScale(1.0).setDepth(7.8); spr.play('cat_walk'); spr.setTint(0xffb7a0); spr.body.setSize(86, 160).setOffset(68, 50);
    const crown = this.add2(this.add.text(0, 0, '👑', { fontSize: '40px' }).setOrigin(.5), 8);
    this.cols.push(this.physics.add.collider(spr, this.gGround), this.physics.add.collider(spr, this.gSolid));
    this.boss = { spr, crown, hp: 10, maxHp: 10, state: 'idle', t: 1.2, dir: -1, invul: 0, en: { k: 'boss', spr, dead: false } };
    this.objs.push(spr); this.show('boss-bar', true); $('boss-fill').style.width = '100%';
  }
  updateBoss(dt) {
    const S = this.S; if (!S.boss) return; const sp = this.active;
    if (!this.bossActive && !this.bossDefeated && sp.x > S.boss.arenaX + 340) this.startBoss();
    const B = this.boss; if (!B) return; const s = B.spr; B.invul = Math.max(0, B.invul - dt); B.crown.setPosition(s.x + (s.flipX ? -6 : 6), s.y - 200);
    s.setAlpha(B.invul > 0 && Math.floor(this.time.now / 70) % 2 ? .45 : 1);
    const toHero = sp.x - s.x; B.t -= dt;
    if (B.state === 'idle') { s.body.setVelocityX(Math.sign(toHero) * 90); B.dir = Math.sign(toHero) || B.dir; if (B.t <= 0) { B.state = 'tele'; B.t = .65; s.body.setVelocityX(0); B.dir = Math.sign(toHero) || B.dir; } }
    else if (B.state === 'tele') { s.x += Math.sin(this.time.now / 25) * 1.6; if (B.t <= 0) { B.state = Math.random() < .35 ? 'leap' : 'charge'; B.t = B.state === 'charge' ? 1.5 : .01; if (B.state === 'leap') { s.body.setVelocityY(-900); s.body.setVelocityX(clamp(toHero * 1.15, -460, 460)); B.t = 1.2; } } }
    else if (B.state === 'charge') { s.body.setVelocityX(B.dir * 500); if (s.x < this.S.boss.arenaX + 80 || s.x > this.S.boss.arenaR - 80 || B.t <= 0) { B.state = 'stun'; B.t = 1.6; s.body.setVelocityX(0); this.shake(180, .008); Sfx.stomp(); } }
    else if (B.state === 'leap') { if (B.t <= 0 || (s.body.blocked.down && B.t < 1.0)) { s.body.setVelocityX(0); B.state = 'stun'; B.t = 1.2; this.shake(160, .007); Sfx.stomp(); } }
    else if (B.state === 'stun') { s.body.setVelocityX(0); if (B.t <= 0) { B.state = 'idle'; B.t = 1.4; } }
    s.setFlipX(B.dir < 0); s.x = clamp(s.x, this.S.boss.arenaX + 40, this.S.boss.arenaR - 40);
    if (B.state === 'stun') s.setTint(0xffe0b0); else if (B.state === 'tele') s.setTint(0xff7060); else s.setTint(0xffb7a0);
    if (!s.anims.currentAnim || s.anims.currentAnim.key !== 'cat_walk') s.play('cat_walk');
  }
  hitBoss(dmg, kbDir) {
    const B = this.boss; if (!B || B.invul > 0 || B.hp <= 0) return; if (B.state === 'stun') dmg *= 2;
    B.hp -= dmg; B.invul = .8; Sfx.hitE(); this.shake(120, .006); $('boss-fill').style.width = Math.max(0, B.hp / B.maxHp * 100) + '%';
    this.popText(B.spr.x, B.spr.y - 230, '-' + dmg, '#ff9a8a');
    if (B.hp <= 0) this.bossDown();
  }
  bossDown() {
    const B = this.boss; this.bossDefeated = true; this.bossBusy = false; this.show('boss-bar', false); Sfx.fanfare(); this.burst(B.spr.x, B.spr.y - 80, 16);
    this.toast('돈 캣을 물리쳤다!', 1800); if (this.arenaWall) { this.arenaWall.destroy(); this.arenaWall = null; }
    this.tweens.add({ targets: [B.spr, B.crown], alpha: 0, y: '-=120', angle: 720, duration: 900, onComplete: () => { B.spr.destroy(); B.crown.destroy(); } }); B.spr.body.enable = false; this.boss = null;
    this.addStars(10, false); this.spawnItem({ k: 'heart', x: B.spr.x, y: STAND - B.spr.y + 90 });
  }

  /* ----- overlaps ----- */
  updateOverlaps() {
    if (this.dead) return; const sp = this.active, b = sp.body;
    this.physics.overlap(sp, this.gItem, (p, it) => this.collect(it));
    this.physics.overlap(sp, this.gEnemy, (p, e) => this.touchEnemy(p, e.en));
    if (this.boss && this.boss.hp > 0) this.touchBoss();
    this.physics.overlap(this.gApple, this.gEnemy, (a, e) => { if (!a.active) return; this.hitEnemy(e.en, 1, Math.sign(e.x - a.x)); a.destroy(); });
    if (this.boss && this.boss.hp > 0) this.physics.overlap(this.gApple, this.boss.spr, a => { if (a.active) { this.hitBoss(1, Math.sign(a.body.velocity.x)); a.destroy(); } });
    this.physics.overlap(sp, this.gHaz, () => this.hurt(null, 1));
    this.physics.overlap(sp, this.gSpring, (p, z) => { if (b.velocity.y > 60 && b.bottom < z.body.top + 28) { b.setVelocityY(-1180); Sfx.spring(); if (z.im) this.tweens.add({ targets: z.im, scaleY: z.im.scaleY * .7, scaleX: z.im.scaleX * 1.2, duration: 90, yoyo: true }); } });
    this.gApple.getChildren().forEach(a => { a.life -= 1 / 60; if (a.life <= 0 || a.bounces > 2) { if (a.active) a.destroy(); } });
    // checkpoints
    this.checks.forEach((c, i) => { if (!c.on && sp.x > c.x) { c.on = true; this.cp = { x: c.x, i }; c.flag.setFillStyle(0xffcf5a); Sfx.check(); this.burst(c.x, STAND - 90, 5); this.toast('체크포인트!', 900); } });
    // goal
    if (!this.finished && Math.abs(sp.x - this.S.goalX) < 100 && (sp.y > STAND - 140 || (this.mount && this.mount.kind === 'eagle'))) {
      if (this.bossDefeated) this.stageClear(); else if (!this.goalWarn || this.time.now > this.goalWarn) { this.goalWarn = this.time.now + 2000; this.toast('먼저 돈 캣을 물리쳐야 해!', 1200); }
    }
  }
  touchEnemy(p, en) {
    if (en.dead) return; const m = this.mount, h = this.hero, b = p.body, e = en.spr;
    if (m && m.kind === 'elephant') { this.hitEnemy(en, 3, Math.sign(e.x - p.x)); if (m.dash > 0) en.hp = 0; if (en.hp <= 0 && !en.dead) this.killEnemy(en); return; }
    if (m && m.kind === 'eagle' && en.k !== 'cat') { this.hitEnemy(en, 2, Math.sign(e.x - p.x)); return; }
    if (b.velocity.y > 90 && b.bottom < e.body.top + 34 && !m) { this.hitEnemy(en, 2, Math.sign(e.x - p.x)); b.setVelocityY(this.jumpHeldNow() ? -720 : -540); Sfx.stomp(); this.dust(e.x, e.y); return; }
    if (m && b.velocity.y > 90 && b.bottom < e.body.top + 34) { this.hitEnemy(en, 2, 0); b.setVelocityY(-520); return; }
    this.hurt(e.x, 1);
  }
  jumpHeldNow() { return !!(keys.Space || keys.ArrowUp || keys.KeyW || keys.KeyZ || T.jumpHeld); }
  touchBoss() {
    const B = this.boss, p = this.active, b = p.body, e = B.spr, m = this.mount;
    if (!this.physics.overlap(p, e)) return;
    if (m && m.kind === 'elephant' && m.dash > 0) { this.hitBoss(3, Math.sign(e.x - p.x)); m.dash = 0; b.setVelocityX(-Math.sign(e.x - p.x) * 260); return; }
    if (b.velocity.y > 90 && b.bottom < e.body.top + 40) { this.hitBoss(3, 0); b.setVelocityY(-640); Sfx.stomp(); return; }
    this.hurt(e.x, 1);
  }
  hurt(fromX, n) {
    if (this.invuln > 0 || this.dead || this.finished) return; const sp = this.active, m = this.mount;
    this.invuln = 1.5; Sfx.hurt(); this.shake(140, .007);
    const dir = fromX == null ? -(sp.face || 1) : Math.sign(sp.x - fromX) || 1; sp.body.setVelocity(dir * 330, -420);
    if (m) { m.hp -= n; this.hudMount(); if (m.hp <= 0) { this.dismount(true); this.invuln = 1.5; } return; }
    this.hp -= n; this.hudHearts(); if (this.hp <= 0) this.die(false);
  }
  fellInPit() {
    if (this.dead) return; Sfx.hurt();
    if (this.mount) { const mt = this.mount; this.mount = null; this.hero.setScale(.88).setAngle(0); this.hero.body.enable = true; this.cameras.main.startFollow(this.hero, true, .12, .1); mt.sp.destroy(); this.hudMount(); this.reopenCages(mt.kind); }
    this.hp -= 1; this.hudHearts();
    if (this.hp <= 0) { this.die(true); return; }
    this.respawn();
  }
  reopenCages(kind) { /* the lost mount returns to its cage position (cage stays open but a parked one appears) */ const c = this.cages.find(q => q.m === kind && q.open); if (c) { const mt = this.createMount(kind, c.x, kind === 'elephant' ? STAND : STAND - 120, false); if (kind === 'elephant') { mt.hint = this.add2(this.add.text(c.x, STAND - 170, '▼ E', { fontFamily: 'Jua, sans-serif', fontSize: '24px', color: '#ffe28a', stroke: '#6b3fa0', strokeThickness: 5 }).setOrigin(.5), 9).setVisible(false); } else { this.parked = this.parked.filter(p => p !== mt); mt.sp.destroy(); } } }
  resetBoss() {   // the player lost the fight: remove the boss and the arena wall so the fight can start again
    if (!this.bossActive || this.bossDefeated) return;
    const B = this.boss; if (B) { try { B.spr.destroy(); B.crown.destroy(); } catch (e) {} this.boss = null; }
    if (this.arenaWall) { this.arenaWall.destroy(); this.arenaWall = null; }
    this.bossActive = false; this.bossBusy = false; this.show('boss-bar', false);
  }
  respawn() {
    this.resetBoss();
    const h = this.hero; h.body.reset(this.cp.x, STAND - 20); h.setAlpha(1).setScale(.88).setAngle(0); h.body.enable = true; this.invuln = 2; this.dead = false; this.atkAnim = false;
    this.cameras.main.startFollow(h, true, .12, .1); this.cameras.main.scrollX = clamp(this.cp.x - W / 2, 0, this.S.width - W);
  }
  die(pit) {
    if (this.dead) return; this.dead = true; this.lives--; this.hudLives(); const h = this.hero;
    if (this.mount) { const mt = this.mount; this.mount = null; mt.sp.destroy(); this.hudMount(); }
    if (pit) { this.finishDeath(); return; }
    h.setScale(.88).setAngle(0).setAlpha(1); h.anims.stop(); h.body.setVelocity(0, 0); h.play('h_ko'); this.time.delayedCall(1100, () => this.finishDeath());
  }
  finishDeath() {
    if (this.lives <= 0) { this.state = 'over'; this.show('over', true); this.show('hud', false); return; }
    this.hp = 3; this.hudHearts(); this.dead = false; this.respawn();
  }

  collect(it) {
    if (!it.active) return; const k = it.kind;
    if (k === 'star') { this.addStars(1, true); Sfx.star(); }
    else if (k === 'heart') { if (this.hp < this.maxHp) { this.hp++; this.hudHearts(); } else this.addStars(3, false); Sfx.heart(); this.popText(it.x, it.y - 20, '♥'); }
    else if (k === 'apple') { this.apples = Math.min(9, this.apples + 2); this.hudApples(); Sfx.star(); this.popText(it.x, it.y - 20, '+2'); }
    else if (k === 'letter') { const i = it.item.i; this.letters[i] = true; this.hudLetters(); Sfx.letter(); this.burst(it.x, it.y, 10); this.toast(it.item.ch + '!', 800); if (it.halo) it.halo.destroy(); if (this.letters.every(Boolean)) { this.lives++; this.hudLives(); this.time.delayedCall(700, () => { this.toast('라꿍이! 목숨 +1', 1500); Sfx.fanfare(); }); } }
    this.tweens.killTweensOf(it); this.gItem.remove(it); it.destroy();
  }
  addStars(n, fx) { this.stars += n; this.stageStars += n; $('stars').textContent = this.stars; if (!fx) this.popText(this.active.x, this.active.y - 140, '★+' + n, '#ffe28a'); }

  stageClear() {
    this.finished = true; this.state = 'clear'; Sfx.fanfare(); const h = this.hero; if (this.mount) this.dismount(); h.body.setVelocity(0, 0); h.anims.stop(); h.play('h_happy');
    const secs = Math.round(this.clockAcc); const idx = this.stageIdx;
    if (idx + 2 > this.unlocked) { this.unlocked = Math.min(3, idx + 2); tryLS.set('rk2_unlocked', String(this.unlocked)); }
    this.time.delayedCall(1300, () => {
      this.show('hud', false); this.show('clear', true);
      $('clear-badge').textContent = idx === 2 ? 'ALL CLEAR' : 'STAGE ' + (idx + 1) + ' CLEAR'; $('clear-title').textContent = idx === 2 ? '집에 도착했다!' : '스테이지 클리어!'; $('clear-quote').textContent = this.S.quote;
      $('res-stars').textContent = this.stageStars + '/' + this.stageTotalStars; $('res-letters').textContent = this.letters.filter(Boolean).length + '/3'; $('res-time').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'); $('res-lives').textContent = Math.max(this.lives, 0);
      $('btn-next').textContent = idx === 2 ? '처음 화면으로' : '다음 스테이지';
      const cf = $('confetti'); cf.innerHTML = ''; for (let i = 0; i < 40; i++) { const s = document.createElement('span'); s.className = 'conf'; s.textContent = ['⭐', '🐾', '🦴', '🎉', '❤️'][i % 5]; s.style.left = Math.random() * 100 + '%'; s.style.animationDuration = 2 + Math.random() * 2.5 + 's'; s.style.animationDelay = Math.random() * .8 + 's'; cf.appendChild(s); }
    });
  }

  /* ----- fx & hud ----- */
  shake(ms, amp) { this.cameras.main.shake(ms, amp); }
  dust(x, y) { for (let i = 0; i < 4; i++) { const d = this.add.image(x + (Math.random() - .5) * 30, y - 4, 'dot').setScale(.5).setAlpha(.5).setTint(0xe8d9b8).setDepth(9); this.tweens.add({ targets: d, x: d.x + (Math.random() - .5) * 60, y: d.y - 10 - Math.random() * 14, alpha: 0, scale: .1, duration: 380, onComplete: () => d.destroy() }); } }
  burst(x, y, n) { for (let i = 0; i < n; i++) { const s = this.add.image(x, y, 'item_star').setDisplaySize(20, 20).setDepth(10); const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 70; this.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d - 20, alpha: 0, angle: 360, duration: 600, onComplete: () => s.destroy() }); } }
  popText(x, y, txt, col = '#fff6e4') { const t = this.add.text(x, y, txt, { fontFamily: 'Jua, sans-serif', fontSize: '28px', color: col, stroke: '#2a2140', strokeThickness: 5 }).setOrigin(.5).setDepth(11); this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 800, onComplete: () => t.destroy() }); }
  toast(txt, ms = 1200) { const t = $('toast'); t.textContent = txt; t.classList.remove('hidden'); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.add('hidden'), ms); }
  updateHudStatic() { if ($('stage-name')) $('stage-name').textContent = this.S.name; }
  hudAll() { this.hudHearts(); this.hudLives(); this.hudApples(); this.hudLetters(); this.hudMount(); $('stars').textContent = this.stars; this.show('boss-bar', false); }
  hudHearts() { const e = $('hearts'); let s = ''; for (let i = 0; i < this.maxHp; i++) s += `<img src="assets/item_heart.webp" class="${i < this.hp ? '' : 'off'}" alt="">`; e.innerHTML = s; }
  hudLives() { $('lives').textContent = '×' + Math.max(0, this.lives); }
  hudApples() { $('apples').textContent = this.apples; }
  hudLetters() { document.querySelectorAll('#hud-letters .lt').forEach((e, i) => e.classList.toggle('on', !!this.letters[i])); }
  hudMount() {
    const m = this.mount, b = $('mount-badge'), hs = $('mount-hearts'); if (!m) { b.classList.add('hidden'); hs.innerHTML = ''; return; }
    b.classList.remove('hidden'); b.textContent = m.kind === 'elephant' ? '🐘 코끼리' : '🦅 독수리'; let s = ''; for (let i = 0; i < m.maxHp; i++) s += `<img src="assets/item_heart.webp" class="${i < m.hp ? '' : 'off'}" alt="">`; hs.innerHTML = s;
  }
  updateWorldBits(dt) {
    // hints
    const sp = this.active, near = this.hints.find(h => Math.abs(h.x - sp.x) < 240), el = $('hint');
    if (near) { el.textContent = near.text[T.on ? 1 : 0]; el.classList.remove('hidden'); } else el.classList.add('hidden');
  }
}

/* ---------- test helpers (only with ?test=1) ---------- */
if (TEST) {
  window.__key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  window.__wait = ms => new Promise(r => setTimeout(r, ms));
  window.__hold = async (code, ms) => { __key(code, true); await __wait(ms); __key(code, false); };
  window.__tap = async code => { __key(code, true); await __wait(60); __key(code, false); };
  // crude auto-player used to check that every stage can be crossed (invulnerable; counts pit falls)
  window.__bot = async (idx, maxMs, resume) => {
    const s = resume ? window.__home : await __go(idx); const t0 = performance.now(); let falls = 0, jumpUntil = 0, lastX = 0, stuckT = 0; const log = [];
    if (!s.__botPatched) { s.__botPatched = true; const o = s.fellInPit.bind(s); s.fellInPit = function () { s.__falls = (s.__falls || 0) + 1; (s.__fallLog = s.__fallLog || []).push(Math.round(this.hero.x)); o(); }; }
    if (!window.__noRun) __key('ShiftLeft', true); __key('ArrowRight', true);
    while (performance.now() - t0 < maxMs && s.state === 'play') {
      s.invuln = 99; s.hp = 3; const sp = s.active, b = sp.body, now = performance.now(), grounded = b.blocked.down || b.touching.down; let jump = false; const segs = s.S.ground;
      for (const [a, e] of segs) if (sp.x > a && sp.x < e && e - sp.x < (window.__noRun ? 36 : 120) && segs.some(g => g[0] >= e)) jump = true;
      s.gSolid.getChildren().forEach(z => { const bb = z.body; if (bb.left > sp.x && bb.left - sp.x < 110 && bb.top < b.bottom - 6 && bb.height < 200) jump = true; });
      s.gHaz.getChildren().forEach(z => { if (z.x > sp.x && z.x - sp.x < 130) jump = true; });
      s.enemies.forEach(e => { if (!e.dead && e.k !== 'pigeon' && e.spr.x > sp.x && e.spr.x - sp.x < 170 && Math.abs(e.spr.y - sp.y) < 120) jump = true; });
      if (sp.y < 590 && grounded && !(s.mount && s.mount.kind === 'eagle')) { let plat = null; [...s.gOne.getChildren(), ...s.gSolid.getChildren(), ...s.gMove.getChildren()].forEach(z => { const bb = z.body; if (Math.abs(bb.top - b.bottom) < 8 && sp.x > bb.left && sp.x < bb.right) plat = bb; }); if (!plat || plat.right - sp.x < 26) jump = true; }
      if (Math.abs(sp.x - lastX) < 2) stuckT += .04; else stuckT = 0; lastX = sp.x; if (stuckT > .3 && grounded) jump = true;
      if (jump && grounded && now > jumpUntil) { __key('Space', true); jumpUntil = now + 450; setTimeout(() => __key('Space', false), 330); }
      if (s.mount && s.mount.kind === 'eagle') { __key('ArrowUp', sp.y > 330); __key('ArrowDown', sp.y < 250); if (Math.abs(sp.x - s.S.goalX) < 500 && sp.y < 480) __key('ArrowDown', true); }
      if (s.nearCage && s.nearCage() && !s.mount) await __tap('KeyE');
      await __wait(40);
    }
    __key('ShiftLeft', false); __key('ArrowRight', false); __key('Space', false); __key('ArrowUp', false); __key('ArrowDown', false);
    return { state: s.state, x: Math.round(s.active.x), goal: s.S.goalX, secs: Math.round((performance.now() - t0) / 1000), falls: s.__falls || 0, fallLog: (s.__fallLog || []).slice(0, 12), stars: s.stageStars, mount: s.mount && s.mount.kind, boss: s.boss ? s.boss.hp : null };
  };
  window.__go = async i => { for (let n = 0; n < 60 && !(window.__home && window.__home.state === 'title'); n++) await __wait(200); const s = window.__home; s.unlocked = 3; s.lives = 3; s.startStage(i, true); await __wait(900); return s; };
}

/* ---------- start ---------- */
window.addEventListener('load', () => {
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', width: W, height: H, backgroundColor: '#1a1530',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { y: GRAV }, debug: DEBUG } },
    fps: { forceSetTimeOut: TEST, target: 60 },
    render: { antialias: true, pixelArt: false, roundPixels: false },
    scene: [Boot, Play],
  });
  window.__phaser = game;
});
})();
