/* 마피아 보스 라꿍이 — isometric (2.5D) edition, Phaser 3
   World = grid (gx, gy) in tiles. Screen: x = (gx-gy)*64, y = (gx+gy)*32.
   Hero sprites: assets/sprites/{idle,walk,run,jump}_{dir}.png  (AutoSprite)
   Buildings/props: assets/iso/*.png (AutoSprite) listed in assets/iso/index.json
   Combat/enemies/skills: combat.js (installed onto Game.prototype)
*/
(() => {
'use strict';

const TW = 128, TH = 64, MW = 36, MH = 36;
const VIEW_W = 1280, VIEW_H = 720;
const DIR8 = ['right', 'southeast', 'down', 'southwest', 'left', 'northwest', 'up', 'northeast'];
const ACT_FPS = { idle: 8, walk: 12, run: 16, jump: 16 };
const $ = id => document.getElementById(id);
const sx = (gx, gy) => (gx - gy) * TW / 2;
const sy = (gx, gy) => (gx + gy) * TH / 2;

/* ---------- visible-viewport fit ----------
   Phone browsers report 100vh as the height *with* the toolbars hidden, so the bottom of a 100vh stage sits under the
   address/tool bar. The stage is sized from innerWidth/innerHeight (the visible area) instead and re-fitted on every change. */
(function fitStage() {
  let lw = 0, lh = 0;
  const set = () => {
    lw = innerWidth; lh = innerHeight;
    const s = document.documentElement.style;
    s.setProperty('--app-w', lw + 'px'); s.setProperty('--app-h', lh + 'px');
    if (window.__phaser && window.__phaser.scale) window.__phaser.scale.refresh();
  };
  const later = () => { set(); setTimeout(set, 120); setTimeout(set, 450); };
  addEventListener('resize', later); addEventListener('orientationchange', later);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', later);
  // some in-app browsers change the visible height (toolbar show/hide) without a resize event
  setInterval(() => { if (innerWidth !== lw || innerHeight !== lh) set(); }, 400);
  set();
})();

/* ---------- touch / mobile controls ---------- */
window.__touch ={ x: 0, y: 0, mag: 0, j: false, run: false, on: false, joyId: null };
(function setupTouch() {
  const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || /[?&]touch=1/.test(location.search);
  document.addEventListener('DOMContentLoaded', () => {
    if (!isTouch) return;
    const T = window.__touch; T.on = true; document.body.classList.add('touch');
    const g = () => window.__game, $$ = id => document.getElementById(id);
    document.addEventListener('contextmenu', e => e.preventDefault());
    // joystick
    const joy = $$('joy'), knob = $$('joy-knob'), zone = $$('joy-zone') || joy, R = 46;
    // floating stick: it appears under the thumb anywhere in the lower-left zone
    const place = e => { const st = $$('stage').getBoundingClientRect(), s = joy.offsetWidth || 132, x = Math.max(s / 2 + 10, Math.min(st.width * .46, e.clientX - st.left)), y = Math.max(st.height * .26 + s / 2, Math.min(st.height - s / 2 - 10, e.clientY - st.top)); joy.style.left = (x - s / 2) + 'px'; joy.style.top = (y - s / 2) + 'px'; joy.style.bottom = 'auto'; };
    const move = e => { const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / R); T.x = dx / l * k; T.y = dy / l * k; T.mag = k; knob.style.transform = 'translate(' + (T.x * R) + 'px,' + (T.y * R) + 'px)'; };
    zone.addEventListener('pointerdown', e => { T.joyId = e.pointerId; zone.setPointerCapture(e.pointerId); if (zone !== joy) { place(e); joy.classList.add('active'); } move(e); e.preventDefault(); if (window.RK) RK.resume(); });
    zone.addEventListener('pointermove', e => { if (e.pointerId === T.joyId) move(e); });
    const end = e => { if (e.pointerId !== T.joyId) return; T.joyId = null; T.x = T.y = T.mag = 0; knob.style.transform = ''; joy.classList.remove('active'); joy.style.left = joy.style.top = joy.style.bottom = ''; };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
    // buttons
    const tap = (el, fn) => { el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('on'); fn(true); if (window.RK) { RK.resume(); RK.vibrate(8); } }); const up = () => { el.classList.remove('on'); fn(false); }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up); };
    const key = code => down => { if (down && g()) g().pressed[code] = true; };
    tap($$('tb-jump'), key('Space')); tap($$('tb-act'), key('KeyE'));
    tap($$('tb-run'), d => { if (d) { T.run = !T.run; $$('tb-run').classList.toggle('on', T.run); } });
    $$('tb-run').addEventListener('pointerup', () => $$('tb-run').classList.toggle('on', T.run));
    tap($$('tb-pause'), d => { if (d && g()) g().togglePause(); });
    tap($$('sk-bite'), d => { T.j = d; if (d && g()) g().pressed['KeyJ'] = true; });
    tap($$('sk-dash'), key('KeyK')); tap($$('sk-bark'), key('KeyL')); tap($$('sk-crew'), key('KeyR'));
    const full = $$('btn-full'); if (full) full.addEventListener('click', () => { try { const d = document.documentElement, p = (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); if (p && p.catch) p.catch(() => {}); } catch (e) {} });
    const orient = () => { const h = $$('rotate-hint'); h.classList.toggle('hidden', !(innerHeight > innerWidth)); };
    addEventListener('resize', orient); orient();
    const pb = $$('btn-portrait'); if (pb) pb.addEventListener('click', () => { document.body.classList.add('portrait-ok'); orient(); const gg = g(); if (gg && gg.applyZoom) gg.applyZoom(); });
  });
})();

/* ---------- tiny sound synth ---------- */
const Sfx = (() => {
  let ctx = null;
  const c = () => { if (window.RK) return RK.ctx(); if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return ctx; };
  function tone(f, d, type = 'sine', v = 0.07, slide = 0) {
    const a = c(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), a.currentTime + d);
    g.gain.setValueAtTime(v, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d);
    o.connect(g); g.connect(window.RK ? RK.out() : a.destination); o.start(); o.stop(a.currentTime + d);
  }
  function noise(d, v = .08, hp = 800) {
    const a = c(); if (!a) return; const n = a.sampleRate * d, buf = a.createBuffer(1, n, a.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(); s.buffer = buf; const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; const g = a.createGain(); g.gain.value = v;
    s.connect(f); f.connect(g); g.connect(window.RK ? RK.out() : a.destination); s.start();
  }
  return {
    tone, noise,
    resume() { if (window.RK) RK.resume(); const a = c(); if (a && a.state === 'suspended') a.resume(); },
    collect() { tone(660, .12, 'triangle'); setTimeout(() => tone(990, .2, 'triangle'), 90); },
    talk() { tone(280 + Math.random() * 90, .045, 'square', .025); },
    bark() { tone(240, .16, 'sawtooth', .08, -130); setTimeout(() => tone(210, .14, 'sawtooth', .07, -110), 140); },
    jump() { tone(280, .22, 'sine', .06, 320); },
    ui() { tone(520, .08, 'triangle', .05); },
    fanfare() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, .3, 'triangle', .08), i * 130)); },
    dig() { tone(120, .1, 'square', .05); setTimeout(() => tone(100, .1, 'square', .05), 120); },
  };
})();

/* ---------- helpers ---------- */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function canvasTex(scene, key, w, h, fn) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const t = scene.textures.createCanvas(key, w, h); fn(t.getContext(), t.getCanvas()); t.refresh(); return t;
}
function shade(hex, amt) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const f = v => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
const css = hex => '#' + hex.toString(16).padStart(6, '0');
function poly(c, pts, fill, stroke) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); } }
// isometric prism: base-centre (cx,cy), a tiles along gx, b tiles along gy, h px high
function isoBox(c, cx, cy, a, b, h, top, left, right, z0 = 0) {
  const p0 = [cx + (-32 * a + 32 * b), cy + (-16 * a - 16 * b) - z0], p1 = [cx + (32 * a + 32 * b), cy + (16 * a - 16 * b) - z0];
  const p2 = [cx + (32 * a - 32 * b), cy + (16 * a + 16 * b) - z0], p3 = [cx + (-32 * a - 32 * b), cy + (-16 * a + 16 * b) - z0];
  const up = p => [p[0], p[1] - h];
  poly(c, [p3, p2, up(p2), up(p3)], left);
  poly(c, [p2, p1, up(p1), up(p2)], right);
  poly(c, [up(p0), up(p1), up(p2), up(p3)], top);
}

/* ---------- Boot scene ---------- */
class Boot extends Phaser.Scene {
  constructor() { super('boot'); }
  preload() {
    this.load.json('manifest', 'assets/sprites/manifest.json');
    this.load.json('isoindex', 'assets/iso/index.json');
    this.load.json('npcman', 'assets/npc/manifest.json');
  }
  create() {
    const m = this.cache.json.get('manifest');
    const label = $('title-loading');
    if (!m) { label.textContent = '스프라이트(manifest.json)를 찾을 수 없습니다.'; return; }
    const idx = this.cache.json.get('isoindex') || { files: [] };
    for (const name of Object.keys(m.anims)) this.load.spritesheet(name, `assets/sprites/${name}.${m.ext || 'png'}`, { frameWidth: m.frameW, frameHeight: m.frameH });
    for (const f of idx.files) this.load.image('iso_' + f.replace(/\.(png|webp)$/, ''), `assets/iso/${f}`);
    const nm = this.cache.json.get('npcman');
    if (nm) for (const [ch, c] of Object.entries(nm.chars)) for (const an of Object.keys(c.anims)) this.load.spritesheet(`${ch}_${an}`, `assets/npc/${ch}_${an}.${nm.ext || 'png'}`, { frameWidth: c.frameW, frameHeight: c.frameH });
    const lt = $('load-text'), lf = $('load-fill');
    this.load.on('progress', v => { if (lt) lt.textContent = `리소스 불러오는 중… ${Math.round(v * 100)}%`; else label.textContent = `리소스 불러오는 중… ${Math.round(v * 100)}%`; if (lf) lf.style.width = Math.round(v * 100) + '%'; });
    this.load.once('complete', () => {
      for (const [name, a] of Object.entries(m.anims)) {
        const act = name.split('_')[0];
        this.anims.create({ key: name, frameRate: ACT_FPS[act] || 12, repeat: a.loop ? -1 : 0, frames: this.anims.generateFrameNumbers(name, { start: 0, end: a.frames - 1 }) });
      }
      if (nm) for (const [ch, c] of Object.entries(nm.chars)) for (const [an, a] of Object.entries(c.anims)) this.anims.create({ key: `npc_${ch}_${an}`, frameRate: Math.max(5, Math.min(12, a.fps || 8)), repeat: -1, frames: this.anims.generateFrameNumbers(`${ch}_${an}`, { start: 0, end: a.frames - 1 }) });
      label.classList.add('hidden');
      this.scene.start('game', { m, npcman: nm });
    });
    this.load.start();
  }
}

/* ---------- map definition ---------- */
const ROAD = [16, 18];
function tileType(gx, gy) {
  const rA = gy >= ROAD[0] && gy <= ROAD[1], rB = gx >= ROAD[0] && gx <= ROAD[1];
  if (rA || rB) return 'road';
  if (gy === 15 || gy === 19 || gx === 15 || gx === 19) return 'walk';
  if (gx >= 4 && gx <= 14 && gy >= 3 && gy <= 14) return 'plaza';
  if (gx >= 20 && gx <= 31 && gy >= 3 && gy <= 14) return 'shopfloor';
  if (gy >= 20 && gy <= 24) return 'lot';
  if (((gx - 28) / 3.8) ** 2 + ((gy - 31) / 2.8) ** 2 < 1) return 'water';
  if (((gx - 28) / 4.8) ** 2 + ((gy - 31) / 3.8) ** 2 < 1) return 'sand';
  if (gy === 28 && (gx < 15 || gx > 19)) return 'sand';
  if ((gx === 8 || gx === 22) && gy >= 25 && gy <= 34) return 'sand';
  return 'grass';
}
// districts (grid rects). owner: rakkung | cat | pigeon | rat | neutral
const ZONES = [
  { id: 'hq', name: '마피아 본부', x0: 0, y0: 0, x1: 15, y1: 15, owner: 'rakkung' },
  { id: 'alley', name: '골목 상점가', x0: 20, y0: 0, x1: 36, y1: 15, owner: 'cat' },
  { id: 'plaza', name: '중앙광장', x0: 15, y0: 15, x1: 20, y1: 20, owner: 'neutral' },
  { id: 'warehouse', name: '창고 지구', x0: 20, y0: 15, x1: 36, y1: 26, owner: 'rat' },
  { id: 'bakery', name: '빵집 거리', x0: 0, y0: 15, x1: 15, y1: 26, owner: 'neutral' },
  { id: 'park', name: '중앙공원', x0: 0, y0: 26, x1: 36, y1: 36, owner: 'pigeon' },
];
const OWNERS = { rakkung: { name: '라꿍이 조직', color: '#ffcf5a' }, cat: { name: '캣 패밀리', color: '#ff7a93' }, pigeon: { name: '스카이 크루', color: '#7fb8ff' }, rat: { name: '언더그라운드', color: '#b48cff' }, neutral: { name: '중립', color: '#c9c9d6' } };

/* ---------- Game scene ---------- */
class Game extends Phaser.Scene {
  constructor() { super('game'); }
  init(data) { this.m = data.m; this.npcman = data.npcman || this.npcman; this.autostart = !!data.autostart; }

  create() {
    window.__game = this;
    this.state = 'title';
    this.score = 0; this.snacks = 0; this.stage = 0; this.side = 0; this.t0 = 0; this.tut = {};
    try { this.spriteMode = localStorage.getItem('rk_mode') || 'dir8'; } catch (e) { this.spriteMode = 'dir8'; }
    this.lastDir = 'down'; this.jumping = false; this.jumpOff = 0; this.eatLock = 0; this.lastDust = 0; this.pressed = {};
    this.rects = []; this.circles = []; this.bldgs = []; this.interactables = []; this.pickups = []; this.cars = []; this.npcs = {};
    this.dialog = { lines: [], i: 0, typing: false, done: null, timer: null };

    this.cameras.main.setBounds(-MH * TW / 2 - 200, -300, (MW + MH) * TW / 2 + 400, (MW + MH) * TH / 2 + 700);
    this.buildTextures();
    this.buildGround();
    this.buildWorld();
    this.buildHero();
    this.buildNpcs();
    this.buildPickups();
    this.buildCars();
    this.buildInput();
    this.initCombat();
    this.buildMinimap();

    this.applyZoom(); if (!this._zoomBound) { this._zoomBound = true; addEventListener('resize', () => this.applyZoom()); }
    this.cameras.main.startFollow(this.camTarget, true, 0.09, 0.09);
    this.cameras.main.centerOn(this.camTarget.x, this.camTarget.y);
    this.setStage(0); this.updateHud(); this.bindDom();
    $('title').classList.remove('hidden'); $('hud').classList.add('hidden');
    $('btn-start').classList.remove('hidden'); this.refreshModeButtons(); this.refreshTitleButtons();
    if (window.RK) { RK.ui.mountSettings(document.querySelector('#title .title-inner'), $('btn-full')); RK.ui.mountSettings(document.querySelector('#pause .panel')); RK.music.play('title'); }
    $('pause').classList.add('hidden'); $('complete').classList.add('hidden'); $('dialog').classList.add('hidden');
    if (this.autostart) this.startGame();
  }

  bindDom() {
    if (window.__domBound) return; window.__domBound = true;
    const g = () => window.__game;
    $('btn-start').addEventListener('click', () => { const gg = g(); if (gg.readSave() && !confirm('저장된 진행을 지우고 처음부터 시작할까요?')) return; gg.startGame(false); });
    $('btn-load').addEventListener('click', () => g().startGame(true));
    document.querySelectorAll('#ch-pick button').forEach(b => b.addEventListener('click', () => g().startFromChapter(+b.dataset.ch)));
    addEventListener('pagehide', () => g() && g().saveGame()); document.addEventListener('visibilitychange', () => { if (document.hidden && g()) g().saveGame(); });
    $('btn-resume').addEventListener('click', () => g().togglePause(false));
    $('btn-restart').addEventListener('click', () => g().restart());
    $('btn-again').addEventListener('click', () => g().restart());
    $('btn-continue').addEventListener('click', () => g().continuePlay());
    $('btn-mode').addEventListener('click', () => g().toggleMode());
    $('btn-mode-title').addEventListener('click', () => g().toggleMode());
    $('dialog').addEventListener('click', () => g().advanceDialog());
  }

  /* ===== textures ===== */
  buildTextures() {
    const sc = this;
    canvasTex(sc, 'dot', 4, 4, c => { c.fillStyle = '#fff'; c.fillRect(0, 0, 4, 4); });
    canvasTex(sc, 'blob', 128, 64, c => {
      c.translate(64, 32); c.scale(1, .5);
      const g = c.createRadialGradient(0, 0, 4, 0, 0, 62);
      g.addColorStop(0, 'rgba(25,10,50,.55)'); g.addColorStop(.6, 'rgba(25,10,50,.25)'); g.addColorStop(1, 'rgba(25,10,50,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 62, 0, 7); c.fill();
    });
    canvasTex(sc, 'spark', 24, 24, c => { const g = c.createRadialGradient(12, 12, 1, 12, 12, 11); g.addColorStop(0, '#fff'); g.addColorStop(.4, 'rgba(255,230,120,.9)'); g.addColorStop(1, 'rgba(255,200,60,0)'); c.fillStyle = g; c.fillRect(0, 0, 24, 24); });
    canvasTex(sc, 'glow', 96, 96, c => { const g = c.createRadialGradient(48, 48, 4, 48, 48, 46); g.addColorStop(0, 'rgba(255,240,150,.85)'); g.addColorStop(1, 'rgba(255,220,90,0)'); c.fillStyle = g; c.fillRect(0, 0, 96, 96); });
    this.makeTiles();
    this.makeTree('tree', 190, 230, 0x4fbf5a); this.makeTree('tree2', 150, 190, 0x3fae6a); this.makeTree('pine', 130, 230, 0x2f9e6a);
    this.makeBush('bush', 90, 64, 0x56c36a); this.makeBush('bush_odd', 116, 80, 0x3f9f56);
    this.makeProps();
    this.makeCar('car_front', 0xe8483e, true); this.makeCar('car_rear', 0x3f6fe8, false);
    this.makeNpcTextures();
  }

  makeTiles() {
    const rand = rng(11);
    const dia = (c, ox, oy, fill) => { c.beginPath(); c.moveTo(ox + 64, oy); c.lineTo(ox + 128, oy + 32); c.lineTo(ox + 64, oy + 64); c.lineTo(ox, oy + 32); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } };
    const noise = (c, n, col, a) => { for (let i = 0; i < n; i++) { const x = 20 + rand() * 88, y = 12 + rand() * 40; if (Math.abs(x - 64) / 64 + Math.abs(y - 32) / 32 > 0.85) continue; c.fillStyle = col.replace('A', (rand() * a).toFixed(2)); c.fillRect(x, y, 2 + rand() * 3, 1.5); } };
    const flat = (key, base, grain, n = 40, extra) => canvasTex(this, key, 128, 64, c => { dia(c, 0, 0, base); c.save(); dia(c, 0, 0); c.clip(); noise(c, n, grain, .5); if (extra) extra(c); c.restore(); });
    for (let v = 0; v < 4; v++) flat('t_grass' + v, v % 2 ? '#93d66f' : '#8ccf68', 'rgba(60,140,50,A)', 60, c => {
      for (let i = 0; i < 5; i++) { const x = 30 + rand() * 68, y = 16 + rand() * 32; c.strokeStyle = 'rgba(70,150,55,.7)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2, y - 5); c.moveTo(x, y); c.lineTo(x + 2, y - 5); c.stroke(); }
      if (v === 2) { const cols = ['#fff', '#ffd1e3', '#ffe27a', '#d7c8ff']; for (let i = 0; i < 3; i++) { const x = 34 + rand() * 60, y = 18 + rand() * 28; c.fillStyle = cols[(rand() * 4) | 0]; c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); c.fillStyle = '#f5b82e'; c.beginPath(); c.arc(x, y, 1.1, 0, 7); c.fill(); } }
    });
    const lane = (c, axis) => { c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); if (axis === 'x') { c.moveTo(42, 21); c.lineTo(86, 43); } else { c.moveTo(86, 21); c.lineTo(42, 43); } c.stroke(); };
    // crosswalk stripes: elongated along E, repeated along S (tile-local vectors)
    const GX = [64, 32], GY = [-64, 32];
    const zebra = (c, E, S) => { c.fillStyle = 'rgba(255,255,255,.9)'; for (const u of [-.3, 0, .3]) { const cx = 64 + u * S[0], cy = 32 + u * S[1]; const e = .38, w = .07; poly(c, [[cx - e * E[0] - w * S[0], cy - e * E[1] - w * S[1]], [cx + e * E[0] - w * S[0], cy + e * E[1] - w * S[1]], [cx + e * E[0] + w * S[0], cy + e * E[1] + w * S[1]], [cx - e * E[0] + w * S[0], cy - e * E[1] + w * S[1]]], 'rgba(255,255,255,.9)'); } };
    flat('t_road', '#4f566b', 'rgba(255,255,255,A)', 50);
    flat('t_road_lx', '#4f566b', 'rgba(255,255,255,A)', 50, c => lane(c, 'x'));
    flat('t_road_ly', '#4f566b', 'rgba(255,255,255,A)', 50, c => lane(c, 'y'));
    flat('t_road_zx', '#4f566b', 'rgba(255,255,255,A)', 40, c => zebra(c, GY, GX));   // across road A (walk along gy), spaced along gx
    flat('t_road_zy', '#4f566b', 'rgba(255,255,255,A)', 40, c => zebra(c, GX, GY));   // across road B
    const grid = (c, col) => { c.strokeStyle = col; c.lineWidth = 1.5; dia(c, 4, 2); c.stroke(); };
    flat('t_plaza_a', '#41456a', 'rgba(255,255,255,A)', 20, c => grid(c, 'rgba(255,207,90,.25)'));
    flat('t_plaza_b', '#4b5078', 'rgba(255,255,255,A)', 20, c => grid(c, 'rgba(255,207,90,.25)'));
    flat('t_shop_a', '#f6dcc4', 'rgba(150,100,60,A)', 18, c => grid(c, 'rgba(160,110,70,.3)'));
    flat('t_shop_b', '#f1cfb0', 'rgba(150,100,60,A)', 18, c => grid(c, 'rgba(160,110,70,.3)'));
    flat('t_lot', '#e0d4be', 'rgba(130,100,60,A)', 24, c => grid(c, 'rgba(150,120,80,.25)'));
    flat('t_sand', '#ecd49f', 'rgba(150,110,50,A)', 40);
    flat('t_water', '#52b8ee', 'rgba(255,255,255,A)', 30, c => { c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2; c.beginPath(); c.ellipse(64, 30, 20, 7, 0, 0, 3.2); c.stroke(); });
    const RH = 12;
    canvasTex(this, 't_walk', 128, 64 + RH, c => {
      c.fillStyle = '#cfc2a8'; poly(c, [[0, 32], [64, 64], [64, 64 + RH], [0, 32 + RH]], '#cfc2a8');
      poly(c, [[128, 32], [64, 64], [64, 64 + RH], [128, 32 + RH]], '#b6a98f');
      dia(c, 0, 0, '#efe5d0'); c.save(); dia(c, 0, 0); c.clip(); noise(c, 20, 'rgba(120,100,70,A)', .4); c.strokeStyle = 'rgba(150,125,90,.35)'; c.lineWidth = 1.5; dia(c, 5, 2.5); c.stroke(); c.restore();
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 32); c.lineTo(64, 0); c.lineTo(128, 32); c.stroke();
    });
  }

  makeTree(key, w, h, col) {
    canvasTex(this, key, w, h, c => {
      const blob = (x, y, r, s) => { const g = c.createRadialGradient(x - r * .3, y - r * .35, r * .1, x, y, r); g.addColorStop(0, shade(col, s + .28)); g.addColorStop(.65, shade(col, s)); g.addColorStop(1, shade(col, s - .22)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
      c.fillStyle = '#8a5a3a'; rr(c, w / 2 - 12, h * .52, 24, h * .43, 8); c.fill(); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(w / 2 + 2, h * .52, 10, h * .43);
      if (key === 'pine') { [[.78, .42], [.58, .34], [.38, .27], [.2, .2]].forEach(([y, r], i) => { c.fillStyle = shade(col, -.14 + i * .07); c.beginPath(); c.moveTo(w / 2, h * (y - .3)); c.lineTo(w / 2 + w * r * 1.25, h * y); c.lineTo(w / 2 - w * r * 1.25, h * y); c.closePath(); c.fill(); }); return; }
      blob(w * .30, h * .50, w * .25, -.1); blob(w * .70, h * .50, w * .25, -.1); blob(w * .5, h * .34, w * .36, 0); blob(w * .5, h * .55, w * .3, -.05); blob(w * .42, h * .27, w * .15, .2);
    });
  }
  makeBush(key, w, h, col) {
    canvasTex(this, key, w, h, c => {
      [[.28, .6, .26, -.1], [.72, .6, .26, -.1], [.5, .42, .3, 0], [.4, .38, .12, .25]].forEach(([x, y, r, s]) => { const g = c.createRadialGradient(w * x - r * w * .3, h * y - r * w * .3, 2, w * x, h * y, r * w); g.addColorStop(0, shade(col, s + .25)); g.addColorStop(1, shade(col, s - .15)); c.fillStyle = g; c.beginPath(); c.arc(w * x, h * y, w * r, 0, 7); c.fill(); });
      c.fillStyle = '#ff7a93'; [[.3, .5], [.62, .4], [.5, .62]].forEach(([x, y]) => { c.beginPath(); c.arc(w * x, h * y, 3.6, 0, 7); c.fill(); });
    });
  }
  makeProps() {
    canvasTex(this, 'p_lamp', 60, 190, c => { isoBox(c, 30, 182, .22, .22, 12, '#4a4e75', '#2b2e4d', '#20223a'); c.fillStyle = '#2b2e4d'; rr(c, 26, 40, 8, 130, 3); c.fill(); c.fillStyle = '#ffe9a0'; rr(c, 14, 8, 32, 40, 12); c.fill(); c.strokeStyle = '#2b2e4d'; c.lineWidth = 3; c.stroke(); const g = c.createRadialGradient(30, 28, 2, 30, 28, 24); g.addColorStop(0, 'rgba(255,255,200,.9)'); g.addColorStop(1, 'rgba(255,230,120,0)'); c.fillStyle = g; c.fillRect(0, 0, 60, 60); });
    canvasTex(this, 'p_bench', 130, 90, c => { isoBox(c, 65, 74, 1.1, .38, 16, '#c88a52', '#a56a3a', '#7a4a26'); isoBox(c, 65, 62, 1.1, .1, 30, '#c88a52', '#a56a3a', '#7a4a26'); });
    canvasTex(this, 'p_barrel', 64, 80, c => { c.fillStyle = '#7a4a2a'; rr(c, 10, 18, 44, 54, 14); c.fill(); const g = c.createLinearGradient(10, 0, 54, 0); g.addColorStop(0, 'rgba(255,255,255,.25)'); g.addColorStop(.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.3)'); c.fillStyle = g; rr(c, 10, 18, 44, 54, 14); c.fill(); c.fillStyle = '#ffcf5a'; c.fillRect(10, 30, 44, 5); c.fillRect(10, 54, 44, 5); c.fillStyle = '#5a361d'; c.beginPath(); c.ellipse(32, 20, 22, 8, 0, 0, 7); c.fill(); });
    canvasTex(this, 'p_crate', 90, 90, c => { isoBox(c, 45, 76, .8, .8, 40, '#d9a463', '#b88345', '#8d6232'); c.strokeStyle = 'rgba(90,55,20,.6)'; c.lineWidth = 3; c.beginPath(); c.moveTo(45, 76 - 40 + 8); c.lineTo(45, 36); c.stroke(); });
  }
  makeCar(key, col, front) {
    canvasTex(this, key, 220, 130, c => {
      const cx = 110, cy = 96;
      c.fillStyle = 'rgba(25,10,50,.3)'; c.beginPath(); c.ellipse(cx, cy + 4, 70, 22, 0, 0, 7); c.fill();
      isoBox(c, cx, cy, 1.15, .6, 20, shade(col, .12), shade(col, -.02), shade(col, -.25), 6);
      isoBox(c, cx, cy - 20, .55, .5, 17, '#dff2ff', '#9ccfee', '#6fa7cc', 6);
      c.fillStyle = front ? '#ffe9a0' : '#ff4a4a'; c.beginPath(); c.arc(cx + 56, cy - 4, 5, 0, 7); c.arc(cx + 36, cy + 6, 5, 0, 7); c.fill();
    });
  }

  makeNpcTextures() {
    const base = (c, W2, H2) => { c.fillStyle = 'rgba(30,20,60,.22)'; c.beginPath(); c.ellipse(W2 / 2, H2 - 8, 30, 8, 0, 0, 7); c.fill(); };
    const eyes = (c, x, y, gap, r = 4.2) => { c.fillStyle = '#1b1530'; [x - gap, x + gap].forEach(ex => { c.beginPath(); c.arc(ex, y, r, 0, 7); c.fill(); }); c.fillStyle = '#fff'; [x - gap, x + gap].forEach(ex => { c.beginPath(); c.arc(ex - 1.3, y - 1.3, 1.4, 0, 7); c.fill(); }); };
    const suit = (c, col, tie) => { c.fillStyle = col; rr(c, 24, 66, 48, 44, 14); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(42, 66); c.lineTo(54, 66); c.lineTo(48, 84); c.fill(); c.fillStyle = tie; c.beginPath(); c.moveTo(46, 72); c.lineTo(50, 72); c.lineTo(52, 92); c.lineTo(48, 96); c.lineTo(44, 92); c.fill(); c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(60, 70, 12, 38); };
    canvasTex(this, 'npc_bear', 96, 120, c => { base(c, 96, 120); suit(c, '#17151f', '#c1272d'); c.fillStyle = '#8a5a3c'; [[24, 22], [72, 22]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 12, 0, 7); c.fill(); }); c.fillStyle = '#9a6844'; c.beginPath(); c.arc(48, 46, 30, 0, 7); c.fill(); c.fillStyle = '#e8c9a0'; c.beginPath(); c.ellipse(48, 56, 15, 11, 0, 0, 7); c.fill(); c.fillStyle = '#1b1530'; c.beginPath(); c.ellipse(48, 51, 5, 3.6, 0, 0, 7); c.fill(); c.fillStyle = '#0d0c14'; rr(c, 22, 36, 52, 13, 6); c.fill(); c.fillStyle = '#17151f'; c.beginPath(); c.ellipse(48, 14, 30, 8, 0, 0, 7); c.fill(); rr(c, 30, -2, 36, 18, 8); c.fill(); c.fillStyle = '#c1272d'; c.fillRect(30, 10, 36, 4); });
    canvasTex(this, 'npc_cat', 96, 120, c => { base(c, 96, 120); c.fillStyle = '#ffd1dc'; rr(c, 22, 66, 52, 46, 14); c.fill(); c.fillStyle = '#fff'; rr(c, 30, 80, 36, 28, 8); c.fill(); c.fillStyle = '#f2a65a'; [[[24, 30], [20, 8], [40, 22]], [[72, 30], [76, 8], [56, 22]]].forEach(p => { c.beginPath(); c.moveTo(...p[0]); c.lineTo(...p[1]); c.lineTo(...p[2]); c.fill(); }); c.beginPath(); c.arc(48, 46, 30, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.ellipse(48, 56, 16, 12, 0, 0, 7); c.fill(); eyes(c, 48, 42, 13); c.fillStyle = '#ff7a93'; c.beginPath(); c.arc(48, 52, 3, 0, 7); c.fill(); c.fillStyle = '#fff'; rr(c, 30, 8, 36, 12, 6); c.fill(); rr(c, 34, -6, 28, 18, 9); c.fill(); });
    canvasTex(this, 'npc_pigeon', 96, 110, c => { base(c, 96, 110); c.fillStyle = '#9aa3b8'; c.beginPath(); c.ellipse(48, 78, 28, 26, 0, 0, 7); c.fill(); c.fillStyle = '#c9d0e0'; c.beginPath(); c.ellipse(46, 86, 15, 15, 0, 0, 7); c.fill(); c.fillStyle = '#7f4fb0'; c.beginPath(); c.arc(44, 54, 14, 0, 7); c.fill(); c.fillStyle = '#aab3c8'; c.beginPath(); c.arc(40, 36, 20, 0, 7); c.fill(); c.fillStyle = '#ff9f2e'; c.beginPath(); c.moveTo(24, 38); c.lineTo(8, 42); c.lineTo(24, 46); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(34, 32, 5.5, 0, 7); c.fill(); c.fillStyle = '#1b1530'; c.beginPath(); c.arc(33, 32, 2.8, 0, 7); c.fill(); c.fillStyle = '#c1272d'; rr(c, 20, 22, 42, 8, 4); c.fill(); });
    canvasTex(this, 'npc_duck', 96, 120, c => { base(c, 96, 120); c.fillStyle = '#2b4fb3'; rr(c, 24, 66, 48, 44, 14); c.fill(); c.fillStyle = '#ffd54a'; c.beginPath(); c.arc(40, 80, 4, 0, 7); c.fill(); c.fillStyle = '#ffe066'; c.beginPath(); c.arc(48, 46, 30, 0, 7); c.fill(); c.fillStyle = '#ff9f2e'; c.beginPath(); c.ellipse(48, 58, 17, 9, 0, 0, 7); c.fill(); eyes(c, 48, 42, 14); c.fillStyle = '#1d2f73'; c.beginPath(); c.ellipse(48, 22, 32, 8, 0, 0, 7); c.fill(); rr(c, 28, 2, 40, 22, 10); c.fill(); c.fillStyle = '#ffd54a'; c.beginPath(); c.arc(48, 12, 5, 0, 7); c.fill(); });
    canvasTex(this, 'npc_mouse', 80, 100, c => { base(c, 80, 100); c.fillStyle = '#ffb454'; rr(c, 20, 58, 40, 36, 12); c.fill(); c.fillStyle = '#b9bcc9'; [[18, 24], [62, 24]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 14, 0, 7); c.fill(); }); c.fillStyle = '#ffb3c1'; [[18, 24], [62, 24]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 8, 0, 7); c.fill(); }); c.fillStyle = '#cfd2de'; c.beginPath(); c.arc(40, 42, 24, 0, 7); c.fill(); eyes(c, 40, 38, 10, 4); c.fillStyle = '#ff7a93'; c.beginPath(); c.arc(40, 48, 3, 0, 7); c.fill(); });
  }

  /* ===== ground ===== */
  buildGround() {
    const have = k => this.textures.exists('iso_' + k);
    this.texMode = have('tex_stone') && have('tex_asphalt') && have('tex_sidewalk') && have('tex_grass');
    if (!this.texMode) return this.buildGroundFlat();
    const B = 6, RH = 12, CW = 2 * B * 64, CH = (2 * B - 2) * 32 + 64 + RH + 16;
    const mir = key => {   // mirrored 2x2 tiling => seamless repeat
      const img = this.textures.get('iso_' + key).getSourceImage(), S = img.width, c = document.createElement('canvas'); c.width = c.height = S * 2;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      x.save(); x.scale(-1, 1); x.drawImage(img, -S * 2, 0); x.restore(); x.save(); x.scale(1, -1); x.drawImage(img, 0, -S * 2); x.restore(); x.save(); x.scale(-1, -1); x.drawImage(img, -S * 2, -S * 2); x.restore();
      return c;
    };
    const proto = document.createElement('canvas').getContext('2d');
    const P = { stone: proto.createPattern(mir('tex_stone'), 'repeat'), road: proto.createPattern(mir('tex_asphalt'), 'repeat'), walk: proto.createPattern(mir('tex_sidewalk'), 'repeat'), grass: proto.createPattern(mir('tex_grass'), 'repeat'), dirt: have('tex_dirt') ? proto.createPattern(mir('tex_dirt'), 'repeat') : null };
    const CT = { stone: 410, road: 512, walk: 390, grass: 512, dirt: 400 };   // source px per tile
    const tint = { plaza: 'rgba(60,40,110,.30)', shopfloor: 'rgba(255,225,190,.16)', lot: 'rgba(0,0,0,0)' };
    const diamond = (c, x, y, grow = 0.7) => { c.beginPath(); c.moveTo(x + 64, y - grow); c.lineTo(x + 128 + grow * 2, y + 32); c.lineTo(x + 64, y + 64 + grow); c.lineTo(x - grow * 2, y + 32); c.closePath(); };
    const fillPat = (c, kind, gx, gy, x, y, dy = 0) => {
      const pat = P[kind] || P.stone, ct = CT[kind] || 300, k = 64 / ct;
      pat.setTransform(new DOMMatrix([k, k / 2, -k, k / 2, x + 64 - gx * 64 + gy * 64, y + dy - gx * 32 - gy * 32]));
      c.fillStyle = pat; c.fill();
    };
    const lane = (c, x, y, axis) => { c.strokeStyle = 'rgba(255,236,190,.92)'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); if (axis === 'x') { c.moveTo(x + 42, y + 21); c.lineTo(x + 86, y + 43); } else { c.moveTo(x + 86, y + 21); c.lineTo(x + 42, y + 43); } c.stroke(); };
    const zebra = (c, x, y, E, S2) => { for (const u of [-.3, 0, .3]) { const cx = x + 64 + u * S2[0], cy = y + 32 + u * S2[1], e = .38, w = .07; poly(c, [[cx - e * E[0] - w * S2[0], cy - e * E[1] - w * S2[1]], [cx + e * E[0] - w * S2[0], cy + e * E[1] - w * S2[1]], [cx + e * E[0] + w * S2[0], cy + e * E[1] + w * S2[1]], [cx - e * E[0] + w * S2[0], cy - e * E[1] + w * S2[1]]], 'rgba(255,240,210,.9)'); } };
    const rand = rng(21);
    for (let by = 0; by < Math.ceil(MH / B); by++) for (let bx = 0; bx < Math.ceil(MW / B); bx++) {
      const ox0 = sx(bx * B, by * B + B - 1) - 64, oy0 = sy(bx * B, by * B) - RH - 2;
      const kg = 'gch_' + bx + '_' + by, kr = 'rch_' + bx + '_' + by;
      let hasRaised = false;
      const g = canvasTex(this, kg, CW, CH, c0 => {
        for (let sdiag = 0; sdiag <= 2 * B - 2; sdiag++) for (let i = 0; i <= sdiag; i++) {
          const gx = bx * B + i, gy = by * B + (sdiag - i); if (i >= B || sdiag - i >= B || gx >= MW || gy >= MH) continue;
          const x = sx(gx, gy) - 64 - ox0, y = sy(gx, gy) - oy0, t = tileType(gx, gy);
          c0.save(); diamond(c0, x, y);
          if (t === 'walk') { hasRaised = true; c0.clip(); fillPat(c0, 'road', gx, gy, x, y); c0.restore(); continue; }
          c0.clip();
          if (t === 'road') { fillPat(c0, 'road', gx, gy, x, y); }
          else if (t === 'plaza' || t === 'shopfloor' || t === 'lot') { fillPat(c0, 'stone', gx, gy, x, y); if (tint[t]) { c0.fillStyle = tint[t]; c0.fill(); } }
          else if (t === 'sand') fillPat(c0, 'dirt', gx, gy, x, y);
          else if (t === 'water') { const gr = c0.createLinearGradient(x, y, x, y + 64); gr.addColorStop(0, '#6ac8f0'); gr.addColorStop(1, '#2f8fd0'); c0.fillStyle = gr; c0.fill(); c0.strokeStyle = 'rgba(255,255,255,.4)'; c0.lineWidth = 2; c0.beginPath(); c0.ellipse(x + 64, y + 30, 18, 6, 0, 0, 3.2); c0.stroke(); }
          else fillPat(c0, 'grass', gx, gy, x, y);
          c0.restore();
          if (t === 'road') {
            const rA = gy >= ROAD[0] && gy <= ROAD[1], rB = gx >= ROAD[0] && gx <= ROAD[1];
            c0.save(); diamond(c0, x, y, 0); c0.clip();
            if (rA && !rB) { if (gy === 17 && gx % 2 === 0) lane(c0, x, y, 'x'); if (gx === 13 || gx === 14 || gx === 20 || gx === 21) zebra(c0, x, y, [-64, 32], [64, 32]); }
            if (rB && !rA) { if (gx === 17 && gy % 2 === 0) lane(c0, x, y, 'y'); if (gy === 13 || gy === 14 || gy === 20 || gy === 21) zebra(c0, x, y, [64, 32], [-64, 32]); }
            c0.restore();
          }
        }
        c0.globalCompositeOperation = 'source-atop'; c0.fillStyle = 'rgba(255,160,80,.10)'; c0.fillRect(0, 0, CW, CH);
      });
      this.add.image(ox0, oy0, kg).setOrigin(0, 0).setDepth(-2e6 + bx + by);
      if (!hasRaised) continue;
      canvasTex(this, kr, CW, CH, c1 => {
        for (let sdiag = 0; sdiag <= 2 * B - 2; sdiag++) for (let i = 0; i <= sdiag; i++) {
          const gx = bx * B + i, gy = by * B + (sdiag - i); if (i >= B || sdiag - i >= B || gx >= MW || gy >= MH || tileType(gx, gy) !== 'walk') continue;
          const x = sx(gx, gy) - 64 - ox0, y = sy(gx, gy) - oy0;
          poly(c1, [[x, y + 32 - RH], [x + 64, y + 64 - RH], [x + 64, y + 64], [x, y + 32]], '#bba98a');
          poly(c1, [[x + 128, y + 32 - RH], [x + 64, y + 64 - RH], [x + 64, y + 64], [x + 128, y + 32]], '#8f7d62');
          c1.save(); c1.beginPath(); c1.moveTo(x + 64, y - RH - 0.7); c1.lineTo(x + 129.4, y + 32 - RH); c1.lineTo(x + 64, y + 64 - RH + 0.7); c1.lineTo(x - 1.4, y + 32 - RH); c1.closePath(); c1.clip(); fillPat(c1, 'walk', gx, gy, x, y, -RH); c1.restore();
          c1.strokeStyle = 'rgba(255,240,210,.55)'; c1.lineWidth = 1.5; c1.beginPath(); c1.moveTo(x, y + 32 - RH); c1.lineTo(x + 64, y - RH); c1.lineTo(x + 128, y + 32 - RH); c1.stroke();
        }
        c1.globalCompositeOperation = 'source-atop'; c1.fillStyle = 'rgba(255,160,80,.10)'; c1.fillRect(0, 0, CW, CH);
      });
      this.add.image(ox0, oy0, kr).setOrigin(0, 0).setDepth(-1e6 + bx + by);
    }
  }
  buildGroundFlat() {
    const rand = rng(5);
    for (let gy = 0; gy < MH; gy++) for (let gx = 0; gx < MW; gx++) {
      const t = tileType(gx, gy), x = sx(gx, gy), y = sy(gx, gy);
      let key = 't_grass' + ((rand() * 4) | 0);
      if (t === 'road') {
        key = 't_road';
        const rA = gy >= ROAD[0] && gy <= ROAD[1], rB = gx >= ROAD[0] && gx <= ROAD[1];
        if (rA && !rB) { if (gy === 17 && gx % 2 === 0) key = 't_road_lx'; if (gx === 13 || gx === 14 || gx === 20 || gx === 21) key = 't_road_zx'; }
        if (rB && !rA) { if (gx === 17 && gy % 2 === 0) key = 't_road_ly'; if (gy === 13 || gy === 14 || gy === 20 || gy === 21) key = 't_road_zy'; }
      } else if (t === 'walk') {
        this.add.image(x, y + 32, 't_road').setDepth(-2e6 + gx + gy);
        this.add.image(x, y + 20, 't_walk').setOrigin(0.5, 32 / 76).setDepth(-1e6 + gx + gy);
        continue;
      } else if (t === 'plaza') key = (gx + gy) % 2 ? 't_plaza_a' : 't_plaza_b';
      else if (t === 'shopfloor') key = (gx + gy) % 2 ? 't_shop_a' : 't_shop_b';
      else if (t === 'lot') key = 't_lot';
      else if (t === 'sand') key = 't_sand';
      else if (t === 'water') key = 't_water';
      this.add.image(x, y + 32, key).setDepth(-2e6 + gx + gy);
    }
  }

  /* ===== static objects & collision ===== */
  addRect(x0, y0, x1, y1) { this.rects.push({ x0, y0, x1, y1 }); }
  addCircle(gx, gy, r) { this.circles.push({ gx, gy, r }); }
  depthFor(gx, gy, base) {
    let d = base;
    for (const b of this.bldgs) { const front = gx >= b.x1 - 0.01 || gy >= b.y1 - 0.01; d = front ? Math.max(d, b.depth + 0.5) : Math.min(d, b.depth - 0.5); }
    return d;
  }
  addBuilding(name, gx0, gy0, w, h, opt = {}) {
    const key = 'iso_' + name, fx = sx(gx0 + w, gy0 + h), fy = sy(gx0 + w, gy0 + h);
    const b = { x0: gx0, y0: gy0, x1: gx0 + w, y1: gy0 + h, depth: fy, name };
    this.bldgs.push(b);
    if (this.textures.exists(key)) {
      const tex = this.textures.get(key).getSourceImage();
      const s = ((w + h) * TW / 2 * (opt.fit || 0.74)) / tex.width;
      b.img = this.add.image(fx, fy + (opt.dy || 0) + 8, key).setOrigin(0.5, 1).setScale(s).setDepth(fy);
      this.add.image(fx + 40, fy - 24, 'blob').setScale((w + h) * .62, (w + h) * .5).setDepth(-5e5).setAlpha(.8);
    }
    this.addRect(gx0 + 0.15, gy0 + 0.15, gx0 + w - 0.15, gy0 + h - 0.15);
    if (opt.label) this.add.text(fx, fy - (opt.labelY || 120), opt.label, { fontFamily: '"Jua","Malgun Gothic",sans-serif', fontSize: (opt.size || 26) + 'px', color: opt.color || '#fff', stroke: opt.stroke || '#2b2e4d', strokeThickness: 6 }).setOrigin(0.5).setDepth(fy + 1);
    return b;
  }
  /* AutoSprite prop: bottom-centre at ground point (gx,gy); falls back to the procedural stand-in texture */
  prop(name, gx, gy, o = {}) {
    const ak = 'iso_' + name, fb = { lamp: 'p_lamp', bench: 'p_bench', crate: 'p_crate', tree: 'tree', pine: 'pine', bush: 'bush' }[name];
    const key = this.textures.exists(ak) ? ak : fb; if (!key) return null;
    const x = sx(gx, gy), y = sy(gx, gy), tex = this.textures.get(key).getSourceImage();
    const img = this.add.image(x, y + (o.dy || 0), key).setOrigin(0.5, o.oy ?? (key === ak ? 0.96 : 0.93));
    const sc = key === ak ? (o.h ? o.h / tex.height : (o.w ? o.w / tex.width : 1)) : (o.scale || 1);
    img.setScale(sc * (o.sc || 1)); if (o.flip) img.setFlipX(true);
    img.setDepth(this.depthFor(gx, gy, y));
    const sw = o.sh ?? Math.max(.5, img.displayWidth / 128 * 0.95);
    this.add.image(x + 12 * Math.min(2, sw), y + 3, 'blob').setScale(sw, sw * .8).setDepth(-4e5).setAlpha(.85);
    if (o.r) this.addCircle(gx, gy, o.r);
    if (o.rect) this.addRect(gx - o.rect[0], gy - o.rect[1], gx + o.rect[0], gy + o.rect[1]);
    return img;
  }
  addObj(key, gx, gy, o = {}) { return this.prop(key, gx, gy, o); }

  buildWorld() {
    const rand = rng(77);
    // ---- buildings (AutoSprite renders, footprint in tiles) ----
    this.addBuilding('hq', 7, 5, 5, 5, { fit: 0.80 });
    this.addBuilding('shop', 22, 4, 5, 5, { fit: 0.80 });
    this.addBuilding('townhouse_a', 29, 5, 4, 4);
    this.addBuilding('cafe', 22, 10, 4, 4);
    this.addBuilding('pizza', 1, 8, 4, 4);
    this.addBuilding('townhouse_b', 1, 3, 4, 4);
    this.addBuilding('bank', 28, 10, 4, 4);
    this.addBuilding('bakery', 1, 21, 4, 4);
    this.addBuilding('laundry', 6, 21, 4, 4);
    this.addBuilding('pharmacy', 11, 21, 4, 4);
    this.addBuilding('warehouse_a', 21, 21, 5, 4, { fit: 0.78 });
    this.addBuilding('warehouse_b', 28, 21, 5, 4, { fit: 0.78 });

    // ---- street furniture ----
    for (let g = 3; g < MW; g += 6) { if (g >= 12 && g <= 21) continue; this.prop('lamp', g, 15.7, { h: 150, r: .15 }); this.prop('lamp', g + 3, 19.3, { h: 150, r: .15 }); }
    for (let g = 3; g < MH; g += 6) { if (g >= 12 && g <= 21) continue; this.prop('lamp', 15.7, g + 1, { h: 150, r: .15 }); this.prop('lamp', 19.3, g + 3, { h: 150, r: .15 }); }
    [[15.5, 14.5], [19.5, 19.5]].forEach(([x, y]) => this.prop('hydrant', x, y, { h: 56, r: .2 }));
    this.prop('lamp', 15.5, 19.5, { h: 150, r: .15 }); this.prop('lamp', 19.5, 14.5, { h: 150, r: .15 });
    // HQ yard
    this.prop('crates_stack', 5.4, 12.6, { h: 100, r: .45 }); this.prop('tires', 6.4, 13.4, { h: 62, r: .35 }); this.prop('crate', 13.6, 5.0, { h: 70, r: .4 });
    this.prop('dumpster', 14.2, 7.8, { h: 92, rect: [.5, .8] });
    this.prop('bench', 14.2, 11, { h: 80, rect: [.4, 1.0], flip: true });
    // alley behind the shops (cat territory)
    for (let g = 4.6; g < 9.6; g += 2.2) this.prop('fence', 20.4, g, { h: 92, rect: [.2, 1.0] });   // west edge of the alley
    for (let g = 30.4; g < 35; g += 2.2) this.prop('fence', g, 13.8, { h: 92, rect: [1.0, .2], flip: true });
    this.prop('trashcan', 21.2, 13.4, { h: 72, r: .3 }); this.prop('crates_stack', 27.8, 13.6, { h: 100, r: .45 }); this.prop('tires', 31.2, 13.0, { h: 62, r: .35 }); this.prop('dumpster', 20.8, 8.6, { h: 92, rect: [.5, .8] });
    // warehouse district (rat territory)
    this.prop('crates_stack', 20.3, 26.2, { h: 100, r: .45 }); this.prop('crate', 27.2, 26.0, { h: 70, r: .4 }); this.prop('tires', 33.8, 26.4, { h: 62, r: .35 }); this.prop('trashcan', 26.6, 20.4, { h: 72, r: .3 });
    // park
    this.prop('bench', 12, 27.3, { h: 80, rect: [1.0, .4] }); this.prop('bench', 24, 27.3, { h: 80, rect: [1.0, .4] });
    this.prop('bench', 5, 27.3, { h: 80, rect: [1.0, .4] }); this.prop('bench', 33, 27.3, { h: 80, rect: [1.0, .4] });
    for (let gy = 27; gy <= 35; gy++) for (let gx = 22; gx <= 34; gx++) if (tileType(gx, gy) === 'water') this.addRect(gx + .1, gy + .1, gx + .9, gy + .9);

    // ---- trees & bushes ----
    const avoid = (gx, gy) => {
      if (gy >= 14.2 && gy <= 20.2 || gx >= 14.2 && gx <= 20.2) return true;
      if (tileType(Math.floor(gx), Math.floor(gy)) !== 'grass') return true;
      if (this.bldgs.some(b => gx > b.x0 - 1.2 && gx < b.x1 + 1.2 && gy > b.y0 - 1.2 && gy < b.y1 + 1.2)) return true;
      return false;
    };
    const keep = [[6, 32], [4, 30], [8, 32], [20, 30], [33, 26], [10, 30], [12.5, 30.5], [24, 18]];
    const placed = []; let tries = 0;
    while (placed.length < 58 && tries++ < 4000) {
      const gx = 0.8 + rand() * (MW - 1.6), gy = 0.8 + rand() * (MH - 1.6);
      if (avoid(gx, gy)) continue;
      if (keep.some(([kx, ky]) => Math.hypot(kx - gx, ky - gy) < 2.2)) continue;
      if (placed.some(([px, py]) => Math.hypot(px - gx, py - gy) < 1.9)) continue;
      placed.push([gx, gy]);
    }
    placed.forEach(([gx, gy], i) => { const pine = i % 3 === 2; this.prop(pine ? 'pine' : 'tree', gx, gy, { h: (pine ? 250 : 215) * (0.88 + rand() * .3), r: .4, flip: rand() > .5 }); });
    this.bigTree = this.prop('tree', 4.5, 31, { h: 400, r: .6 });
    for (let i = 0; i < 34; i++) { const gx = 0.8 + rand() * (MW - 1.6), gy = 25 + rand() * 10; if (avoid(gx, gy)) continue; if (Math.hypot(gx - 7, gy - 33) < 2) continue; this.prop('bush', gx, gy, { h: 70 + rand() * 24 }); }
    this.digSpot = this.prop('bush', 6.6, 33, { h: 100, r: .5 });
    this.digGlow = this.add.image(sx(6.6, 33), sy(6.6, 33) - 50, 'glow').setDepth(this.digSpot.depth + 1).setAlpha(0).setScale(1.5);
    this.tweens.add({ targets: this.digGlow, scale: 2, duration: 800, yoyo: true, repeat: -1 });
    this.addInteractable({ gx: 6.6, gy: 33, r: 2.0, label: '수상한 덤불 파헤치기', enabled: () => this.side === 2, run: () => this.digChicken() });
  }

  /* ===== hero ===== */
  buildHero() {
    this.hero = { gx: 13.5, gy: 13.5, r: 0.3 };
    this.camTarget = this.add.image(sx(this.hero.gx, this.hero.gy), sy(this.hero.gx, this.hero.gy) - 40, 'dot').setVisible(false);
    this.shadow = this.add.image(0, 0, 'blob').setScale(1.3, 1.2).setDepth(-3e5);
    const k = this.anims.exists('idle_down') ? 'idle_down' : undefined;
    this.dog = this.add.sprite(0, 0, k || 'dot').setOrigin(0.5, 0.87);
    this.dogScale = (this.m.display || 120) / this.m.frameH; this.dog.setScale(this.dogScale);
    if (k) this.dog.play('idle_down');
    this.bubble = this.add.text(0, 0, '', { fontFamily: '"Jua","Malgun Gothic",sans-serif', fontSize: '22px', color: '#2a2140', backgroundColor: '#fff6e4', padding: { x: 10, y: 4 } }).setOrigin(0.5, 1).setDepth(99999).setVisible(false);
    this.promptMark = this.add.text(0, 0, 'E', { fontFamily: 'sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#2a2140', backgroundColor: '#ffcf5a', padding: { x: 8, y: 3 } }).setOrigin(0.5).setDepth(99998).setVisible(false);
    this.tweens.add({ targets: this.promptMark, scale: 1.18, duration: 380, yoyo: true, repeat: -1 });
    this.syncHero();
  }
  syncHero() {
    const h = this.hero, x = sx(h.gx, h.gy), y = sy(h.gx, h.gy);
    this.dog.setPosition(x, y + this.jumpOff).setDepth(this.depthFor(h.gx, h.gy, y));
    this.shadow.setPosition(x, y).setScale(1.3 - Math.min(.5, -this.jumpOff / 220), 1.2).setAlpha(1 + this.jumpOff / 160);
    this.camTarget.setPosition(x, y - 50);
  }
  blocked(gx, gy, r) {
    if (gx < 0.6 || gy < 0.6 || gx > MW - 0.6 || gy > MH - 0.6) return true;
    for (const b of this.rects) { const cx = Math.max(b.x0, Math.min(gx, b.x1)), cy = Math.max(b.y0, Math.min(gy, b.y1)); if ((gx - cx) ** 2 + (gy - cy) ** 2 < r * r) return true; }
    for (const c of this.circles) { if ((gx - c.gx) ** 2 + (gy - c.gy) ** 2 < (r + c.r) ** 2) return true; }
    return false;
  }
  // moves entity e ({gx,gy,r}) by (dgx,dgy) with wall sliding; returns number of blocked sub-steps
  moveEnt(e, dgx, dgy) {
    let hits = 0; const steps = Math.max(1, Math.ceil(Math.hypot(dgx, dgy) / 0.12));
    for (let i = 0; i < steps; i++) {
      const mx = dgx / steps, my = dgy / steps;
      if (!this.blocked(e.gx + mx, e.gy + my, e.r)) { e.gx += mx; e.gy += my; }
      else if (!this.blocked(e.gx + mx, e.gy, e.r)) { e.gx += mx; hits++; }
      else if (!this.blocked(e.gx, e.gy + my, e.r)) { e.gy += my; hits++; }
      else hits += 2;
    }
    return hits;
  }
  moveHero(dgx, dgy) { return this.moveEnt(this.hero, dgx, dgy); }
  screenToGrid(dx, dy) { return { gx: (dx / (TW / 2) + dy / (TH / 2)) / 2, gy: (dy / (TH / 2) - dx / (TW / 2)) / 2 }; }
  faceVec() { const i = DIR8.indexOf(this.lastDir), a = i * Math.PI / 4, g = this.screenToGrid(Math.cos(a), Math.sin(a)), l = Math.hypot(g.gx, g.gy) || 1; return { gx: g.gx / l, gy: g.gy / l }; }
  zoneAt(gx, gy) { return ZONES.find(z => gx >= z.x0 && gx < z.x1 && gy >= z.y0 && gy < z.y1) || ZONES[0]; }

  /* ===== NPCs, pickups, cars ===== */
  buildNpcs() {
    // AutoSprite character art (iso_npc_*) when available; art faces lower-right and is mirrored toward the hero
    const mk = (id, art, fb, gx, gy, name, icon, h, char) => {
      const x = sx(gx, gy), y = sy(gx, gy), ak = 'iso_' + art, useArt = this.textures.exists(ak), key = useArt ? ak : fb;
      const sheet = char && this.anims.exists(`npc_${char}_idle_down`);
      let sc = useArt ? h / this.textures.get(ak).getSourceImage().height : h / 120, s;
      if (sheet) { const fh = this.npcman.chars[char].frameH; sc = h / fh; s = this.add.sprite(x, y, `${char}_idle_down`).setOrigin(0.5, 0.97).setScale(sc).setDepth(this.depthFor(gx, gy, y)); s.play(`npc_${char}_idle_down`); }
      else s = this.add.image(x, y, key).setOrigin(0.5, useArt ? 0.97 : 0.93).setScale(sc).setDepth(this.depthFor(gx, gy, y));
      this.add.image(x + 6, y + 2, 'blob').setScale(.85, .7).setDepth(-3e5);
      if (!sheet) this.tweens.add({ targets: s, scaleY: sc * 1.03, scaleX: sc * 0.985, duration: 700 + Math.random() * 300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.addCircle(gx, gy, .38);
      const npc = { id, sprite: s, gx, gy, name, icon, art: useArt && !sheet, char: sheet ? char : null, baseScale: sc };
      this.npcs[id] = npc;
      this.addInteractable({ gx, gy, r: 1.9, label: name + '에게 말 걸기', enabled: () => true, run: () => this.talk(id), npc });
    };
    mk('bear', 'npc_bear', 'npc_bear', 12.6, 11.9, '똘마니', '🐻', 150, 'bear');
    mk('cat', 'npc_cat_shop', 'npc_cat', 27.6, 10, '냥냥 사장님', '🐱', 150);
    mk('pigeon', 'npc_pigeon', 'npc_pigeon', 22, 30, '구구 형님', '🕊️', 150);
    mk('duck', 'npc_duck', 'npc_duck', 14.4, 15.5, '꽥 경관', '🦆', 150);
    mk('mouse', 'npc_mouse', 'npc_mouse', 8.5, 19.6, '쪼꼬미', '🐭', 125);
  }
  addInteractable(o) { this.interactables.push(o); }

  buildPickups() {
    const defs = [
      { gx: 13.5, gy: 7.5, e: '🌭', n: '소시지', hidden: false },
      { gx: 17.5, gy: 9, e: '🦴', n: '뼈다귀', hidden: false },
      { gx: 24.5, gy: 17.5, e: '🍪', n: '쿠키', hidden: false },
      { gx: 12.5, gy: 30.5, e: '🥩', n: '육포', hidden: true },
      { gx: 33, gy: 25.5, e: '🧀', n: '치즈', hidden: true },
    ];
    this.pickups = defs.map(d => this.makePickup(d, false));
    this.chicken = this.makePickup({ gx: 6.6, gy: 33.4, e: '🍗', n: '치킨 간식', hidden: true, chicken: true }, true);
    this.chicken.sprite.setVisible(false); this.chicken.glow.setVisible(false); this.chicken.active = false;
  }
  makePickup(d, big) {
    const x = sx(d.gx, d.gy), y = sy(d.gx, d.gy);
    const glow = this.add.image(x, y - 34, 'glow').setDepth(y + 600).setScale(big ? 1.7 : .9);
    const sprite = this.add.text(x, y - 34, d.e, { fontSize: (big ? 62 : 40) + 'px', fontFamily: '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif' }).setOrigin(0.5).setDepth(y + 601);
    const sh = this.add.image(x, y, 'blob').setScale(.5, .5).setDepth(-3e5).setAlpha(.8);
    this.tweens.add({ targets: [sprite, glow], y: '-=10', duration: 760, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const p = { ...d, sprite, glow, sh, got: false, active: true, reveal: d.hidden ? 0 : 1 };
    if (d.hidden) { sprite.setAlpha(0); glow.setAlpha(0); sh.setAlpha(0); }
    return p;
  }

  buildCars() {
    // traffic keeps right: +direction lanes use the "front" car art (heading toward the viewer), -direction lanes use the "rear" art (heading away).
    // Isometric axes: heading +gx = lower-right, +gy = lower-left (mirror of the +gx art), -gx = upper-left, -gy = upper-right (mirror of the -gx art).
    const mk = (axis, lane, speed, start) => {
      const kind = speed > 0 ? 'front' : 'rear', ak = 'iso_car_' + kind, key = this.textures.exists(ak) ? ak : 'car_' + kind;
      const img = this.add.image(0, 0, key).setOrigin(0.5, 0.85);
      if (this.textures.exists(ak)) img.setScale(210 / this.textures.get(ak).getSourceImage().width);
      img.setFlipX(axis === 'y');
      this.cars.push({ axis, lane, speed, t: start, img });
    };
    mk('x', 16.5, 5.5, 2); mk('x', 16.5, 6.5, 22); mk('x', 18.5, -5, 30); mk('x', 18.5, -4.2, 12);
    mk('y', 16.5, 5, 4); mk('y', 16.5, 5.8, 24); mk('y', 18.5, -6, 20); mk('y', 18.5, -5.2, 5);
  }

  /* ===== input ===== */
  buildInput() {
    const kb = this.input.keyboard;
    this.cur = kb.createCursorKeys();
    this.wasd = kb.addKeys({ w: 'W', a: 'A', s: 'S', d: 'D' });
    this.kShift = kb.addKey('SHIFT');
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    kb.on('keydown', ev => { if (!ev.repeat) this.pressed[ev.code] = true; });
  }
  hit(code) { if (this.pressed && this.pressed[code]) { this.pressed[code] = false; return true; } return false; }
  // phones: zoom out a little; portrait play: zoom in so the characters stay readable on the narrow canvas
  applyZoom() { const on = window.__touch && window.__touch.on; let z = on ? 0.82 : 1; if (on && innerHeight > innerWidth) z = Math.max(0.82, Math.min(2.4, 0.42 / (innerWidth / 1280))); this.cameras.main.setZoom(z); }

  /* ===== minimap ===== */
  buildMinimap() {
    this.mm = $('minimap'); this.mmc = this.mm.getContext('2d');
    const bg = this.mmBg = document.createElement('canvas'); bg.width = 200; bg.height = 150;
    this.mmS = 4; this.mmOx = (200 - MW * this.mmS) / 2; this.mmOy = (150 - MH * this.mmS) / 2;
    this.redrawMinimapBase();
  }
  redrawMinimapBase() {
    const b = this.mmBg.getContext('2d'); b.fillStyle = '#1d2a1d'; b.fillRect(0, 0, 200, 150);
    const col = { road: '#585f75', walk: '#e6dcc6', plaza: '#4a4e75', shopfloor: '#f3d9bf', lot: '#d9cdb7', sand: '#ecd49f', water: '#52b8ee', grass: '#7fc45f' };
    for (let gy = 0; gy < MH; gy++) for (let gx = 0; gx < MW; gx++) { b.fillStyle = col[tileType(gx, gy)]; b.fillRect(this.mmOx + gx * this.mmS, this.mmOy + gy * this.mmS, this.mmS, this.mmS); }
    b.fillStyle = 'rgba(30,25,60,.75)'; this.bldgs.forEach(r => b.fillRect(this.mmOx + r.x0 * this.mmS, this.mmOy + r.y0 * this.mmS, (r.x1 - r.x0) * this.mmS, (r.y1 - r.y0) * this.mmS));
    for (const z of this.zones || ZONES) { b.fillStyle = OWNERS[z.owner].color + '55'; b.fillRect(this.mmOx + z.x0 * this.mmS, this.mmOy + z.y0 * this.mmS, (z.x1 - z.x0) * this.mmS, (z.y1 - z.y0) * this.mmS); b.strokeStyle = OWNERS[z.owner].color; b.lineWidth = 1; b.strokeRect(this.mmOx + z.x0 * this.mmS + .5, this.mmOy + z.y0 * this.mmS + .5, (z.x1 - z.x0) * this.mmS - 1, (z.y1 - z.y0) * this.mmS - 1); }
  }
  drawMinimap() {
    const c = this.mmc; c.drawImage(this.mmBg, 0, 0); const S = this.mmS;
    const dot = (gx, gy, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(this.mmOx + gx * S, this.mmOy + gy * S, r, 0, 7); c.fill(); };
    for (const p of this.pickups) if (!p.got && p.reveal >= 0.99) dot(p.gx, p.gy, 3, '#ffe27a');
    if (this.chicken.active) dot(this.chicken.gx, this.chicken.gy, 4.5, '#ff7a3c');
    for (const id in this.npcs) dot(this.npcs[id].gx, this.npcs[id].gy, 2.6, '#ff7a93');
    for (const e of this.enemies || []) if (e.state !== 'dead') dot(e.gx, e.gy, 3, '#ff3b3b');
    const qm = this.questMark && this.questMark(); if (qm) { const t = (this.time.now / 400) % 2, r = 5 + Math.abs(t - 1) * 3; c.strokeStyle = '#ff7a93'; c.lineWidth = 2; c.beginPath(); c.arc(this.mmOx + qm[0] * S, this.mmOy + qm[1] * S, r, 0, 7); c.stroke(); dot(qm[0], qm[1], 3, '#ff7a93'); }
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(this.mmOx + this.hero.gx * S, this.mmOy + this.hero.gy * S, 6, 0, 7); c.stroke(); dot(this.hero.gx, this.hero.gy, 3.6, '#3dd6ff');
  }

  /* ===== flow ===== */
  /* ===== dialog portraits (AutoSprite art) and the objective pointer ===== */
  portraitFor(who) {
    this._pc = this._pc || {}; if (this._pc[who] !== undefined) return this._pc[who];
    // Phaser revokes its blob: URLs after loading, so re-encode the texture pixels into a small data URL
    const frame = key => { try { if (!this.textures.exists(key)) return null; const f = this.textures.get(key).get(0), k = Math.min(1, 220 / Math.max(f.width, f.height)), c = document.createElement('canvas'); c.width = Math.round(f.width * k); c.height = Math.round(f.height * k); c.getContext('2d').drawImage(f.source.image, f.cutX, f.cutY, f.width, f.height, 0, 0, c.width, c.height); return c.toDataURL('image/webp', .86); } catch (e) { return null; } };
    const art = k => frame(k);
    const map = { '라꿍이': 'home/assets/portrait.webp', '냥냥 사장님': art('iso_npc_cat_shop'), '구구 형님': art('iso_npc_pigeon'), '구구 대장': art('iso_npc_pigeon'), '꽥 경관': art('iso_npc_duck'), '쪼꼬미': art('iso_npc_mouse'), '치즈 왕': art('iso_npc_mouse'), '똘마니': frame('bear_idle_down'), '돈 캣': frame('cat_idle_down') };
    return (this._pc[who] = map[who] || null);
  }
  objectiveTarget() {
    const s = this.stage, h = this.hero, N = this.npcs || {};
    const nearest = arr => { let b = null, bd = 1e9; for (const e of arr) { const d = Math.hypot(e.gx - h.gx, e.gy - h.gy); if (d < bd) { bd = d; b = e; } } return b; };
    const alive = tag => (this.enemies || []).filter(e => e.state !== 'dead' && e.tag === tag);
    if (s === 1) return N.bear;
    if (s === 2) return this.dummy && this.dummy.state !== 'dead' ? this.dummy : null;
    if (s === 3) return nearest(alive('cat3'));
    if (s === 4) return N.cat;
    for (const k of [2, 3, 4]) {
      const C = this.chapterInfo(k);
      if (s === C.stages[0] || s === C.stages[1]) { const boss = (this.enemies || []).find(e => e.d.boss && e.state !== 'dead'); return boss || nearest(alive('sold' + k)) || { gx: C.mark[0], gy: C.mark[1] }; }
    }
    if (this.side === 1) return N.pigeon;
    if (this.side === 2) return { gx: 6.6, gy: 33 };
    return null;
  }
  updateObjective() {
    let el = document.getElementById('objective');
    if (!el) { el = document.createElement('div'); el.id = 'objective'; el.className = 'hidden'; el.innerHTML = '<span class="arr"><i>➤</i></span><span class="lab"></span>'; $('stage').appendChild(el); }
    const t = this.state === 'play' && !this.dead && !this.dashing ? this.objectiveTarget() : null;
    if (!t) { el.classList.add('hidden'); return; }
    const cam = this.cameras.main, wv = cam.worldView, canvas = document.querySelector('#game canvas'); if (!canvas) return;
    const rect = canvas.getBoundingClientRect(), st = $('stage').getBoundingClientRect();
    const px = rect.left + (sx(t.gx, t.gy) - wv.x) / wv.width * rect.width, py = rect.top + (sy(t.gx, t.gy) - 90 - wv.y) / wv.height * rect.height;
    const mx = Math.min(74, rect.width * .16), my = Math.min((window.__touch && window.__touch.on) ? 96 : 120, rect.height * .3), inside = px > rect.left + mx && px < rect.right - mx && py > rect.top + my && py < rect.bottom - my;
    const dist = Math.round(Math.hypot(t.gx - this.hero.gx, t.gy - this.hero.gy));
    el.classList.remove('hidden'); el.classList.toggle('here', inside); el.lastChild.textContent = dist > 4 ? dist + 'm' : '';
    if (inside) { el.style.left = (px - st.left) + 'px'; el.style.top = (py - st.top - 30) + 'px'; el.firstChild.firstChild.style.transform = 'rotate(90deg)'; }
    else {
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2, a = Math.atan2(py - cy, px - cx);
      const k = Math.min((rect.width / 2 - mx) / (Math.abs(Math.cos(a)) || 1e-6), (rect.height / 2 - my) / (Math.abs(Math.sin(a)) || 1e-6));
      el.style.left = (cx + Math.cos(a) * k - st.left) + 'px'; el.style.top = (cy + Math.sin(a) * k - st.top) + 'px'; el.firstChild.firstChild.style.transform = 'rotate(' + a + 'rad)';
    }
  }

  /* ===== save / continue (localStorage; this browser only) ===== */
  readSave() {
    try { const s = JSON.parse(localStorage.getItem('rk_save_v1') || 'null'); return s && (s.v === 1 || s.v === 2) && s.stage >= 1 ? s : null; } catch (e) { return null; }
  }
  clearSave() { try { localStorage.removeItem('rk_save_v1'); } catch (e) {} }
  saveGame() {
    if (!['play', 'dialog', 'pause'].includes(this.state) || this.stage < 1 || !this.pickups) return;
    const zones = {}; (this.zones || []).forEach(z => { zones[z.id] = z.owner; });
    const data = { v: 2, t: Date.now(), stage: this.stage, side: this.side, lvl: this.lvl, xp: this.xp, score: this.score, snacks: this.snacks, kills: this.kills || 0, cat3Down: this.cat3Down || 0, chDown: this.chDown || {}, chStarted: this.chStarted || {}, mouseGift: !!this.mouseGift, pick: this.pickups.map(p => !!p.got), zones, gx: +this.hero.gx.toFixed(2), gy: +this.hero.gy.toFixed(2), tut: this.tut || {} };
    try { localStorage.setItem('rk_save_v1', JSON.stringify(data)); } catch (e) {}
  }
  applySave(s) {
    this.lvl = Math.max(1, s.lvl | 0); this.xp = s.xp | 0; this.calcStats(); this.hp = this.maxHp;
    this.score = s.score | 0; this.snacks = s.snacks | 0; this.kills = s.kills | 0; this.cat3Down = s.cat3Down | 0; this.chDown = Object.assign({ 2: 0, 3: 0, 4: 0 }, s.chDown || { 2: s.cat6Down | 0 }); this.chStarted = Object.assign({}, s.chStarted || { 2: !!s.ch2Started }); this.mouseGift = !!s.mouseGift; this.tut = s.tut || {};
    (this.zones || []).forEach(z => { if (s.zones && s.zones[z.id]) z.owner = s.zones[z.id]; }); this.redrawMinimapBase();
    (s.pick || []).forEach((got, i) => { const p = this.pickups[i]; if (p && got) { p.got = true; ['sprite', 'glow', 'sh'].forEach(k => p[k] && p[k].destroy()); } });
    this.side = s.side | 0;
    if (this.side >= 3) { this.chicken.done = true; this.chicken.active = false; ['sprite', 'glow', 'sh'].forEach(k => this.chicken[k] && this.chicken[k].destroy()); }
    this.hero.gx = s.gx; this.hero.gy = s.gy; this.syncHero(); this.cameras.main.centerOn(this.camTarget.x, this.camTarget.y);
    this.stage = s.stage; this.setStage(s.stage);
    // rebuild the situation of the current story step
    if (s.stage === 2) this.spawnTrainingDummy && this.spawnTrainingDummy();
    else if (s.stage === 3) this.spawnCatPack(Math.max(1, 3 - this.cat3Down));
    else {
      const ch = { 5: 2, 8: 3, 11: 4 }[s.stage];
      if (ch && !this.chStarted[ch]) this.startChapter(ch, null, true);
      else for (const k of [2, 3, 4]) { const C = this.chapterInfo(k); if (s.stage === C.stages[0]) this.startChapter(k, Math.max(1, C.n - (this.chDown[k] | 0)), true); else if (s.stage === C.stages[1]) { this.chStarted[k] = true; this.spawnBoss(k); } }
    }
    this.updateHud(); this.updateSideHud(); this.refreshCombatHud(this.time.now);
    this.toast('이어하기 · 챕터 ' + this.chapterOf(this.stage) + ' · Lv.' + this.lvl, 2600);
    // finished a chapter last time: the next one was just started silently, so announce it
    const autoCh = { 5: 2, 8: 3, 11: 4 }[s.stage];
    if (autoCh && this.stage === this.chapterInfo(autoCh).stages[0]) this.time.delayedCall(1800, () => { this.toast(this.chapterInfo(autoCh).start, 4200); if (window.RK) RK.ui.banner('CHAPTER ' + autoCh, ({ 2: '캣 패밀리의 아지트', 3: '스카이 크루의 습격', 4: '언더그라운드의 반격' })[autoCh]); });
  }
  refreshTitleButtons() {
    const s = this.readSave(), lb = $('btn-load'), sb = $('btn-start'); if (!lb || !sb) return;
    if (s && !this.autostart) { lb.classList.remove('hidden'); $('load-info').textContent = '챕터 ' + this.chapterOf(s.stage) + ' · Lv.' + s.lvl; sb.classList.add('ghost'); sb.innerHTML = '새로 시작'; }
    else { lb.classList.add('hidden'); sb.classList.remove('ghost'); sb.innerHTML = '게임 시작 <small>Enter</small>'; }
  }

  /* start straight from a chapter, e.g. after losing a save (level and conquered zones are set to match the chapter) */
  startFromChapter(ch) {
    if (this.state !== 'title') return;
    const cur = this.readSave();
    if (ch <= 1) { if (cur && !confirm('저장된 진행을 지우고 처음부터 시작할까요?')) return; return this.startGame(false); }
    if (cur && !confirm('저장된 진행(챕터 ' + this.chapterOf(cur.stage) + ' · Lv.' + cur.lvl + ')을 지우고\n챕터 ' + ch + '부터 시작할까요?')) return;
    const P = { 2: { lvl: 4, stage: 5 }, 3: { lvl: 7, stage: 8 }, 4: { lvl: 9, stage: 11 } }[ch], XP = [0, 30, 70, 120, 180, 250, 330, 420, 520, 640], zones = {};
    if (ch >= 3) zones.warehouse = zones.alley = 'rakkung'; if (ch >= 4) zones.park = 'rakkung';
    const sv = { v: 2, t: Date.now(), stage: P.stage, side: 1, lvl: P.lvl, xp: XP[P.lvl - 1], score: 300 * (ch - 1), snacks: 0, kills: 6 * (ch - 1), cat3Down: 3, chDown: { 2: ch > 2 ? 5 : 0, 3: ch > 3 ? 6 : 0, 4: 0 }, chStarted: { 2: ch > 2, 3: ch > 3 }, mouseGift: false, pick: [], zones, gx: 13.5, gy: 13.5, tut: { bite: true, dash: true, bark: true } };
    this.startGame(true, sv);
  }
  startGame(resume, sv0) {
    if (this.state !== 'title') return;
    Sfx.resume(); Sfx.ui();
    if (window.__touch && window.__touch.on) { try { const d = document.documentElement, p = (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
    if (this._starting) return; this._starting = true;
    const go = () => {
      $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
      this.state = 'play'; this.t0 = this.time.now; this._starting = false;
      if (window.RK) RK.music.play('town');
      const sv = sv0 || (resume && this.readSave()); if (sv) { this.applySave(sv); this.saveGame(); return; }
      this.clearSave(); this.setStage(1);
      if (window.RK) RK.ui.banner('CHAPTER 1', '새로운 보스의 등장');
      this.time.delayedCall(1300, () => this.say('여기가… 우리 구역이군.', 1800));
    };
    if (window.RK) RK.ui.transition(go); else go();
  }
  restart() {
    Sfx.ui(); $('complete').classList.add('hidden'); $('pause').classList.add('hidden'); $('confetti').innerHTML = '';
    if (this.dialog.timer) clearInterval(this.dialog.timer);
    this.scene.restart({ m: this.m, npcman: this.npcman, autostart: true });
  }
  continuePlay() {
    Sfx.ui(); $('complete').classList.add('hidden'); $('confetti').innerHTML = ''; this.state = 'play';
    this.nextChapterIfPending();
  }
  nextChapterIfPending() {
    const nxt = { 5: 2, 8: 3, 11: 4 }[this.stage];   // chapter finished -> the next one begins
    if (nxt && !this.chStarted[nxt]) this.startChapter(nxt);
  }
  togglePause(force) {
    if (this.state !== 'play' && this.state !== 'pause') return;
    const on = force === undefined ? this.state !== 'pause' : force;
    this.state = on ? 'pause' : 'play'; Sfx.ui(); $('pause').classList.toggle('hidden', !on);
  }
  modeLabel() { return this.spriteMode === 'front' ? '스프라이트: 정면 모드' : '스프라이트: 8방향 모드'; }
  toggleMode() {
    this.spriteMode = this.spriteMode === 'front' ? 'dir8' : 'front';
    try { localStorage.setItem('rk_mode', this.spriteMode); } catch (e) {}
    this.dog.setAngle(0); this.refreshModeButtons(); Sfx.ui();
    if (this.state === 'play') this.toast(this.modeLabel(), 2000);
  }
  refreshModeButtons() { ['btn-mode', 'btn-mode-title'].forEach(id => { const b = $(id); if (b) b.textContent = this.modeLabel() + '  [V]'; }); }

  // main story stage: 1 report → 2 tutorial → 3 fight cats → 4 chapter done.  side: 0 none → 1 pigeon → 2 dig → 3 done
  setStage(s) {
    this.stage = s;
    const T = {
      0: ['', ''],
      1: ['챕터 1 · 새로운 보스의 등장', '마피아 본부 앞의 <b>똘마니</b>에게 말을 걸어 보고를 들어라.'],
      2: ['챕터 1 · 전투 훈련', `기본 스킬을 써보자: <b class="k">J</b> 물기 · <b class="k">K</b> 돌진 · <b class="k">L</b> 왕짖기<br><small>${['bite', 'dash', 'bark'].map(k => (this.tut[k] ? '✔ ' : '☐ ') + { bite: '물기', dash: '돌진', bark: '왕짖기' }[k]).join('  ')}</small>`],
      3: ['챕터 1 · 첫 임무', `골목 상점가의 <b>캣 패밀리 조직원</b>을 쓰러뜨려라. (${this.cat3Down || 0}/3)`],
      4: ['챕터 1 · 완료', '<b>냥냥 사장님</b>에게 이야기를 들어보자. (자유 탐험 가능)'],
      5: ['챕터 1 · 완료', '챕터 2가 곧 시작된다… (계속 탐험하기를 누르면 이어서 진행)'],
      6: ['챕터 2 · 캣 패밀리의 아지트', `<b>창고 지구</b>(미니맵 분홍 구역)로 가서 캣 패밀리 조직원을 쓰러뜨려라. (${(this.chDown || {})[2] || 0}/5)`],
      7: ['챕터 2 · 보스전', '캣 패밀리의 두목 <b>돈 캣</b>을 쓰러뜨려라! 공격 예고(붉은 표시)를 보고 피하자.'],
      8: ['챕터 2 · 완료', '창고 지구를 되찾았다! (계속 탐험하기를 누르면 챕터 3이 시작된다)'],
      9: ['챕터 3 · 스카이 크루의 습격', `<b>중앙공원</b>(미니맵 하늘색 구역)으로 가서 스카이 크루 조직원을 쓰러뜨려라. (${(this.chDown || {})[3] || 0}/6)`],
      10: ['챕터 3 · 보스전', '스카이 크루의 대장 <b>구구 대장</b>을 쓰러뜨려라! 급강하와 범위 공격의 붉은 예고를 보고 피하자.'],
      11: ['챕터 3 · 완료', '중앙공원을 되찾았다! (계속 탐험하기를 누르면 챕터 4가 시작된다)'],
      12: ['챕터 4 · 언더그라운드의 반격', `<b>빵집 거리</b>(미니맵 보라색 구역)로 가서 언더그라운드 조직원을 쓰러뜨려라. (${(this.chDown || {})[4] || 0}/6)`],
      13: ['챕터 4 · 최종 보스전', '언더그라운드의 왕 <b>치즈 왕</b>을 쓰러뜨려라! 쾅 하는 범위 공격은 점프로 피하자.'],
      14: ['모든 챕터 완료 🏆', '캣 패밀리, 스카이 크루, 언더그라운드를 모두 쓰러뜨렸다! 도시는 이제 라꿍이의 것이다. 자유롭게 탐험하자.'],
    };
    const t = T[s] || T[5]; $('mission-title').textContent = t[0]; $('mission-text').innerHTML = t[1];
    this.updateSideHud(); this.saveGame();
  }
  updateSideHud() {
    const el = $('side-text'); if (!el) return;
    const S = { 0: '', 1: '의뢰 · 사라진 치킨 간식 — 공원의 <b>구구 형님</b>을 찾아가라.', 2: '의뢰 · 사라진 치킨 간식 — 큰 나무 옆 <b>반짝이는 덤불</b>을 파라!', 3: '' };
    el.innerHTML = S[this.side] || ''; $('hud-side').classList.toggle('hidden', !S[this.side]);
    this.digGlow.setAlpha(this.side === 2 ? 1 : 0);
  }
  updateHud() {
    const scEl = $('score'); if (scEl.textContent !== String(this.score)) { scEl.textContent = this.score; if (window.RK && this.state !== 'title') RK.ui.bounce(scEl); }
    $('snack-count').textContent = this.snacks;
    const box = $('snack-slots'); box.innerHTML = '';
    const ems = ['🌭', '🦴', '🍪', '🥩', '🧀'];
    for (let i = 0; i < 5; i++) { const d = document.createElement('div'); d.className = 'slot' + (i < this.snacks ? ' on' : ''); d.textContent = ems[i]; box.appendChild(d); }
    if (this.stage === 2 || this.stage === 3 || this.stage === 6 || this.stage === 9 || this.stage === 12) this.setStage(this.stage);
  }
  toast(text, ms = 2200) {
    const t = $('toast'); t.textContent = text; t.classList.remove('hidden'); t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(this._toast); this._toast = setTimeout(() => t.classList.add('hidden'), ms);
  }
  say(text, ms = 1400) { this.bubble.setText(text).setVisible(true); this.bubbleUntil = this.time.now + ms; }

  /* ===== dialog ===== */
  openDialog(lines, done) {
    this.state = 'dialog'; this.hero.moving = false;
    this.dialog.lines = lines; this.dialog.i = 0; this.dialog.done = done || null;
    $('dialog').classList.remove('hidden'); $('prompt').classList.add('hidden'); this.showLine();
  }
  showLine() {
    const L = this.dialog.lines[this.dialog.i];
    const pUrl = this.portraitFor(L.who), pEl = $('dlg-portrait');
    if (pUrl) { pEl.textContent = ''; pEl.style.setProperty('--pimg', 'url("' + pUrl + '")'); pEl.classList.add('art'); pEl.classList.toggle('face', L.who === '라꿍이'); } else { pEl.textContent = L.icon; pEl.classList.remove('art', 'face'); }
    $('dlg-name').textContent = L.who; $('dlg-text').textContent = '';
    this.dialog.typing = true; let k = 0; const full = L.text;
    if (this.dialog.timer) clearInterval(this.dialog.timer);
    this.dialog.timer = setInterval(() => { k++; $('dlg-text').textContent = full.slice(0, k); if (k % 2 === 0) Sfx.talk(); if (k >= full.length) { clearInterval(this.dialog.timer); this.dialog.typing = false; } }, 28);
  }
  advanceDialog() {
    if (this.state !== 'dialog') return;
    const L = this.dialog.lines[this.dialog.i];
    if (this.dialog.typing) { clearInterval(this.dialog.timer); $('dlg-text').textContent = L.text; this.dialog.typing = false; return; }
    this.dialog.i++; Sfx.ui();
    if (this.dialog.i >= this.dialog.lines.length) { $('dialog').classList.add('hidden'); this.state = 'play'; const cb = this.dialog.done; this.dialog.done = null; if (cb) cb(); }
    else this.showLine();
  }
  talk(id) {
    const N = this.npcs[id], who = N.name, icon = N.icon, me = { who: '라꿍이', icon: '🐶' };
    const L = (w, t) => ({ who: w.who || who, icon: w.icon || icon, text: t });
    const s = this.stage, S = t => L({}, t), M = t => L(me, t);
    if (id === 'bear') {
      if (s <= 1) return this.openDialog([
        S('보스! 큰일났습니다! 도시의 구역이 하나둘 다른 조직 손에 넘어가고 있습니다!'), M('…누가 감히.'),
        S('고양이 조직 \'캣 패밀리\', 비둘기 조직 \'스카이 크루\', 쥐 조직 \'언더그라운드\'. 셋 다 움직이고 있습니다.'),
        M('(꼬리가 짧아서 다행이다. 화가 나도 티가 안 나니까.)'), M('우리 구역부터 지킨다. 훈련부터 하겠다.'),
        S('옙! 물기는 J, 돌진은 K, 왕짖기는 L입니다, 보스! 한 번씩 써보시죠!'),
      ], () => { this.setStage(2); this.toast('J 물기 · K 돌진 · L 왕짖기를 써보자!', 3000); Sfx.fanfare(); this.spawnTrainingDummy && this.spawnTrainingDummy(); });
      if (s === 2) return this.openDialog([S('보스, 훈련 중이십니다! 정자세 좋습니다!'), M('…멍.')]);
      if (s === 3) return this.openDialog([S('골목 상점가에 캣 패밀리 놈들이 어슬렁거립니다. 가서 혼쭐을 내주십쇼!')]);
      if (s === 6) return this.openDialog([S('창고 지구에 캣 패밀리가 몰려 있습니다, 보스! 졸개부터 정리하십쇼! (미니맵 분홍 구역입니다)')]);
      if (s === 7) return this.openDialog([S('두목입니다! 붉은 표시가 뜨면 피하십쇼. 내려찍기는 점프로, 돌진은 옆으로요!')]);
      if (s === 5) return this.openDialog([S('다음은 창고 지구의 캣 패밀리 아지트입니다, 보스! 가시죠!')], () => this.nextChapterIfPending());
      if (s === 8) return this.openDialog([S('창고까지 되찾으셨습니다, 보스!! 이제 하늘 쪽 스카이 크루가 공원을 노립니다!')], () => this.nextChapterIfPending());
      if (s === 9) return this.openDialog([S('공원에 스카이 크루 비둘기들이 몰려 있습니다, 보스! 하늘색 구역입니다!')]);
      if (s === 10) return this.openDialog([S('대장 구구입니다! 급강하와 범위 공격의 붉은 예고를 잘 보십쇼!')]);
      if (s === 11) return this.openDialog([S('공원까지 되찾으셨습니다!! 이제 땅 밑 언더그라운드만 남았습니다, 보스!')], () => this.nextChapterIfPending());
      if (s === 12) return this.openDialog([S('빵집 거리에서 쥐들이 몰려나옵니다! 보라색 구역입니다, 보스!')]);
      if (s === 13) return this.openDialog([S('치즈 왕입니다! 쾅 소리가 나기 전에 점프하십쇼!')]);
      if (s >= 14) return this.openDialog([S('해냈습니다 보스!! 이제 이 도시의 보스는 보스뿐입니다!! (선글라스를 벗고 눈물을 닦는 중)')]);
      return this.openDialog([S('보스, 믿고 있습니다! (멀리서 선글라스를 고쳐 쓰는 중)')]);
    }
    if (id === 'cat') {
      if (s < 4) return this.openDialog([S('손님… 아니, 마피아 보스님? 요즘 가게 주변이 무서워요, 냥.'), S('캣 패밀리 애들이 골목을 점령하려고 해요.')]);
      if (s === 4) return this.openDialog([S('감사해요 보스님! 덕분에 한숨 돌렸어요, 냥!'), S('그런데… 두목 \'돈 캣\'이 곧 직접 올 거예요. 창고 쪽에 아지트가 있대요.'), M('…다음엔 그놈 차례군.'), S('아참! 보스님, 사실 우리 가게 치킨 간식도 사라졌는데… 비둘기 짓 같아요.')],
        () => { this.setStage(5); this.score += 100; this.addXp && this.addXp(30); this.side = Math.max(this.side, 1); this.updateSideHud(); this.toast('의뢰 수락: 사라진 치킨 간식 🍗'); Sfx.collect(); this.updateHud(); this.showChapterDone(); });
      if (s === 6 || s === 7) return this.openDialog([S('보스님! 창고 쪽이 시끄러워요, 냥. 조심하세요!')]);
      if (s === 8) return this.openDialog([S('고마워요 보스님! 이제 골목도 창고도 평화예요, 냥!')]);
      if (s === 9 || s === 10) return this.openDialog([S('공원 쪽에서 커다란 새 울음소리가 들려요, 냥… 조심하세요!')]);
      if (s === 11) return this.openDialog([S('공원도 되찾으셨네요, 냥! 하늘이 맑아졌어요!')]);
      if (s === 12 || s === 13) return this.openDialog([S('빵집 쪽이 쥐들로 가득이래요, 냥… 치즈 냄새만 나면 난리예요!')]);
      if (s >= 14) return this.openDialog([S('보스님 만세예요, 냥!! 이제 우리 가게도 마음 편히 열어요!')]);
      return this.openDialog([S('구구 형님 조심하세요, 냥. 그 아이 눈빛이 좀… 날카로워요.')]);
    }
    if (id === 'pigeon') {
      if (this.side < 1) return this.openDialog([S('구구구… 나는 아무것도 모른다. 지나가는 평범한 비둘기다.'), S('(뒤에서 치킨 냄새가 난다)')]);
      if (this.side === 1) return this.openDialog([S('구구구… 마피아 보스가 직접 오셨나.'), M('치킨 간식. 내놔.'), S('나는 닭의 먼 친척이라 치킨을 먹을 리가 없다. 진짜다.'), M('…먹었나?'), S('안 먹었다! 큰 나무 옆 덤불에 \'잠깐\' 숨겨둔 것뿐이다!'), M('그게 훔친 거다.'), S('…구구. 반짝이는 덤불을 파봐라. 보스, 이건 비밀이다.')],
        () => { this.side = 2; this.updateSideHud(); this.toast('큰 나무 옆 반짝이는 덤불을 찾아라 ✨'); Sfx.collect(); this.score += 50; this.updateHud(); });
      return this.openDialog([S('구구구… 아직도 여기 있나? 덤불은 저쪽이다. 어서 가라.')]);
    }
    if (id === 'duck') {
      if (s <= 3) return this.openDialog([S('꽥! 순찰 중입니다. 마피아끼리 싸움은 제 관할이 아니지만, 시민은 다치게 하지 마세요.'), S('요즘 골목 쪽이 시끄럽습니다. 꽥.')]);
      return this.openDialog([S('수사 협조 감사합니다 꽥. 이번 소란은 못 본 걸로 하겠습니다.')]);
    }
    if (id === 'mouse') {
      if (!this.mouseGift && s >= 2) { this.mouseGift = true; return this.openDialog([S('보스님! 저… 이거요. 길에서 주웠는데 보스님 거 같아서요!'), M('…기특하군. 이름이?'), S('쪼꼬미예요! 용돈 주세요!')], () => { this.score += 100; this.addXp && this.addXp(15); this.updateHud(); this.toast('+100 용돈 · +15 XP 💰'); Sfx.collect(); }); }
      return this.openDialog([S('보스님 멋있어요! 근데… 왜 걸을 때 꼬리가 안 보여요? 헤헤.'), M('…짧은 거다.')]);
    }
  }

  /* ===== pickups (heal) & chicken side quest ===== */
  collect(p) {
    p.got = true; this.snacks++; this.score += 50; Sfx.collect();
    this.eatLock = this.time.now + 350;
    this.say('냠냠!', 900);
    this.healPlayer && this.healPlayer(25);
    this.tweens.add({ targets: this.dog, scaleY: this.dogScale * 0.88, scaleX: this.dogScale * 1.08, duration: 130, yoyo: true, repeat: 2 });
    this.burst(sx(p.gx, p.gy), sy(p.gx, p.gy) - 60, ['⭐', '✨', '💚'], 8);
    p.sprite.destroy(); p.glow.destroy(); p.sh.destroy();
    this.toast(`${p.n} 획득! 체력 +25 (${this.snacks}/5)`, 1600);
    this.updateHud();
  }
  digChicken() {
    if (this.chicken.done) return; this.chicken.done = true; this.state = 'dialog';
    Sfx.dig(); this.say('파헤치는 중…', 1500);
    this.tweens.add({ targets: this.dog, angle: { from: -6, to: 6 }, duration: 90, yoyo: true, repeat: 9, onComplete: () => this.dog.setAngle(0) });
    this.digGlow.setAlpha(0);
    this.time.delayedCall(1100, () => {
      const x = sx(this.chicken.gx, this.chicken.gy), y = sy(this.chicken.gx, this.chicken.gy);
      this.burst(x, y - 60, ['🍃', '🌿', '✨'], 14); this.chicken.sprite.setVisible(true).setScale(0.2).setAlpha(1); this.chicken.glow.setVisible(true).setAlpha(1);
      this.tweens.add({ targets: this.chicken.sprite, scale: 1, duration: 600, ease: 'Back.out' }); Sfx.collect();
      this.time.delayedCall(900, () => { this.state = 'play'; this.openDialog([{ who: '라꿍이', icon: '🐶', text: '…찾았다. 내 치킨.' }, { who: '라꿍이', icon: '🐶', text: '(마피아 보스의 눈에서 눈물이 한 방울 흘렀다.)' }], () => this.finishSide()); });
    });
  }
  finishSide() {
    this.chicken.active = false; this.chicken.sprite.destroy(); this.chicken.glow.destroy();
    this.side = 3; this.score += 300; this.updateSideHud(); this.updateHud(); this.addXp && this.addXp(60);
    Sfx.fanfare(); this.say('와! 치킨이다!!', 2500); this.healPlayer && this.healPlayer(999);
    this.happyUntil = this.time.now + 2600; this.playCustom('happy', 'down', 1);
    this.burst(sx(this.hero.gx, this.hero.gy), sy(this.hero.gx, this.hero.gy) - 120, ['❤️', '🍗', '🎉', '⭐'], 26);
    this.toast('의뢰 완료: 사라진 치킨 간식 🍗 +60 XP', 3500);
  }
  showChapterDone(ch = 1) {
    this.happyUntil = this.time.now + 1800; this.playCustom('happy', this.lastDir, 1.2);
    const CH = { 1: ['CHAPTER 1 CLEAR', '첫 번째 전투를 이겼다!', '"…캣 패밀리, 이제 시작이다. 도시는 우리가 되찾는다."'], 2: ['CHAPTER 2 CLEAR', '돈 캣을 쓰러뜨렸다!', '"캣 패밀리는 무너졌다. 다음은… 하늘을 노리는 스카이 크루다."'], 3: ['CHAPTER 3 CLEAR', '구구 대장을 쓰러뜨렸다!', '"스카이 크루는 무너졌다. 이제 땅 밑의 언더그라운드만 남았다."'], 4: ['ALL CLEAR · THE END', '도시를 되찾았다!', '"캣 패밀리, 스카이 크루, 언더그라운드… 이 도시의 보스는 라꿍이다."'] }[ch] || [];
    if ($('clear-badge') && CH.length) { $('clear-badge').textContent = CH[0]; $('clear-title').textContent = CH[1]; $('clear-quote').textContent = CH[2]; }
    this.time.delayedCall(1500, () => {
      const secs = Math.floor((this.time.now - this.t0) / 1000);
      $('res-score').textContent = this.score; $('res-snacks').textContent = `Lv.${this.lvl}`;
      $('res-time').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      $('res-rank').textContent = `${this.kills || 0}마리`;
      if (window.RK) { RK.ui.countUp($('res-score'), this.score, 1100); RK.ui.countUp($('res-rank'), this.kills || 0, 900, v => v + '마리'); }
      this.state = 'complete'; $('complete').classList.remove('hidden'); Sfx.fanfare();
      const box = $('confetti'); box.innerHTML = '';
      for (let i = 0; i < 40; i++) { const s = document.createElement('div'); s.className = 'conf'; s.textContent = ['🎉', '⭐', '🐾', '❤️', '✨'][i % 5]; s.style.left = Math.random() * 100 + '%'; s.style.animationDuration = 3 + Math.random() * 3 + 's'; s.style.animationDelay = Math.random() * 2 + 's'; box.appendChild(s); }
    });
  }
  burst(x, y, emojis, n) {
    for (let i = 0; i < n; i++) {
      const t = this.add.text(x, y, emojis[i % emojis.length], { fontSize: (18 + Math.random() * 14) + 'px', fontFamily: '"Segoe UI Emoji","Apple Color Emoji",sans-serif' }).setOrigin(0.5).setDepth(99990);
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 90;
      this.tweens.add({ targets: t, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d - 40, alpha: 0, angle: Math.random() * 180 - 90, duration: 700 + Math.random() * 500, ease: 'Cubic.out', onComplete: () => t.destroy() });
    }
  }
  dust(x, y) { const d = this.add.image(x, y, 'spark').setDepth(y - 1).setScale(.6).setAlpha(.55).setTint(0xf0e2c0); this.tweens.add({ targets: d, scale: 1.4, alpha: 0, y: y - 8, duration: 420, onComplete: () => d.destroy() }); }

  /* ===== per frame ===== */
  animKey(act, dir) {
    if (this.spriteMode === 'front') dir = 'down';
    let k = `${act}_${dir}`; if (this.anims.exists(k)) return k;
    k = `idle_${dir}`; if (this.anims.exists(k)) return k; return 'idle_down';
  }
  play(act, dir) { const k = this.animKey(act, dir); this.dog.setFlipX(false); if (this.dog.anims.timeScale !== 1) this.dog.anims.timeScale = 1; if (this.dog.anims.currentAnim?.key !== k || !this.dog.anims.isPlaying) this.dog.play(k, true); }
  // custom clips (bite/ko/happy) exist for 5 directions; the west side mirrors the east side
  playCustom(act, dir, ts = 1) {
    const mirror = { left: 'right', northwest: 'northeast', southwest: 'southeast' };
    let d = this.spriteMode === 'front' ? 'down' : dir, flip = false; if (mirror[d]) { d = mirror[d]; flip = true; }
    const key = act + '_' + d; if (!this.anims.exists(key)) return false;
    this.dog.setFlipX(flip); this.dog.anims.timeScale = ts; this.dog.play(key, true); return true;
  }

  update(time, dt) {
    const k = this.cur, w = this.wasd, h = this.hero;
    if (this.hit('Enter') && this.state === 'title') this.startGame(!!this.readSave());
    if (this.hit('Enter') && this.state === 'complete') this.continuePlay();
    if (this.hit('KeyV') && (this.state === 'play' || this.state === 'pause' || this.state === 'title')) this.toggleMode();
    if ((this.hit('Escape') || this.hit('KeyP')) && (this.state === 'play' || this.state === 'pause')) this.togglePause();
    if (this.state === 'dialog' && (this.hit('KeyE') || this.hit('Space') || this.hit('Enter'))) this.advanceDialog();
    if (this.state === 'pause') { this.pressed = {}; return; }
    if (this.state === 'play' && time > (this.nextSave || 0)) { this.nextSave = time + 3000; this.saveGame(); }

    for (const c of this.cars) {
      c.t += c.speed * dt / 1000; const L = MW + 8; if (c.t > L - 4) c.t -= L; if (c.t < -4) c.t += L;
      const gx = c.axis === 'x' ? c.t : c.lane, gy = c.axis === 'x' ? c.lane : c.t;
      const y = sy(gx, gy); c.img.setPosition(sx(gx, gy), y).setDepth(this.depthFor(gx, gy, y));
    }
    for (const p of this.pickups) if (!p.got && p.hidden) {
      const near = Math.hypot(h.gx - p.gx, h.gy - p.gy) < 6;
      p.reveal = Phaser.Math.Clamp(p.reveal + (near ? dt / 350 : -dt / 1600), 0, 1);
      p.sprite.setAlpha(p.reveal); p.glow.setAlpha(p.reveal); p.sh.setAlpha(p.reveal * .8);
    }

    let vx = 0, vy = 0, moving = false, running = false;
    const canAct = this.state === 'play' && !this.dead;
    const locked = !canAct || time < this.eatLock || this.combatLocked(time);
    if (canAct) this.updateSkillInput(time);
    if (!locked) {
      if (k.left.isDown || w.a.isDown) vx -= 1; if (k.right.isDown || w.d.isDown) vx += 1;
      if (k.up.isDown || w.w.isDown) vy -= 1; if (k.down.isDown || w.s.isDown) vy += 1;
      running = this.kShift.isDown;
      const TJ = window.__touch; if (TJ && TJ.on) { if (TJ.mag > 0.18) { vx = TJ.x; vy = TJ.y; } if (TJ.run || TJ.mag > 0.93) running = true; }
      if (vx || vy) {
        moving = true; const l = Math.hypot(vx, vy), sp = (running ? 400 : 235) * this.speedMul();
        vx = vx / l * sp; vy = vy / l * sp;
        const dx = vx * dt / 1000, dy = vy * dt / 1000, g = this.screenToGrid(dx, dy);
        this.moveHero(g.gx, g.gy);
        this.lastDir = DIR8[(Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) + 8) % 8];
      }
      if (this.hit('Space') && !this.jumping) this.doJump();
    }
    for (const id in this.npcs) { const n = this.npcs[id]; if (n.art) n.sprite.setFlipX(sx(h.gx, h.gy) < sx(n.gx, n.gy) - 4);
      else if (n.char) { const dx = sx(h.gx, h.gy) - sx(n.gx, n.gy), dy = sy(h.gx, h.gy) - sy(n.gx, n.gy), d = DIR8[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8], k = `npc_${n.char}_idle_${d}`; if (this.anims.exists(k) && n.sprite.anims.currentAnim?.key !== k) n.sprite.play(k, true); } }
    this.updateCombat(time, dt); this.updateObjective();
    if (!this.dead && !this.dashing) {
      if (time < (this.happyUntil || 0)) { /* holding the happy clip */ }
      else if (!this.jumping && !this.atkAnim) this.play(moving ? (running ? 'run' : 'walk') : 'idle', this.lastDir);
    }
    const lean = (this.spriteMode === 'front' && moving && !this.jumping) ? Phaser.Math.Clamp(vx / 400 * 9, -9, 9) : 0;
    if (!this.dead && !this.atkAnim) this.dog.setAngle(Phaser.Math.Linear(this.dog.angle, lean, 0.25));
    this.syncHero();
    const hx = sx(h.gx, h.gy), hy = sy(h.gx, h.gy);
    if (moving && running && time > this.lastDust) { this.lastDust = time + 110; this.dust(hx, hy); }
    if (this.bubble.visible) { this.bubble.setPosition(hx, hy - this.dog.displayHeight - 8 + this.jumpOff); if (time > this.bubbleUntil) this.bubble.setVisible(false); }

    if (canAct) for (const p of this.pickups) if (!p.got && p.reveal > .6 && Math.hypot(h.gx - p.gx, h.gy - p.gy) < 0.95) { this.collect(p); break; }
    let best = null, bd = 1e9;
    if (canAct) for (const it of this.interactables) { if (it.enabled && !it.enabled()) continue; const d = Math.hypot(h.gx - it.gx, h.gy - it.gy); if (d < it.r && d < bd) { bd = d; best = it; } }
    if (window.__touch && window.__touch.on) { const ta = document.getElementById('tb-act'); if (ta) ta.classList.toggle('hot', !!best); }
    if (best) {
      $('prompt').classList.remove('hidden'); $('prompt-text').textContent = best.label;
      this.promptMark.setVisible(true).setPosition(sx(best.gx, best.gy), sy(best.gx, best.gy) - (best.npc ? best.npc.sprite.displayHeight : 90) - 18);
      if (this.hit('KeyE')) best.run();
    } else { if (this.state !== 'dialog') $('prompt').classList.add('hidden'); this.promptMark.setVisible(false); }

    this.updateZoneHud();
    this.pressed = {};
    this._mm = (this._mm || 0) + dt; if (this._mm > 120 && this.state !== 'title') { this._mm = 0; this.drawMinimap(); }
  }

  doJump(happy) {
    this.jumping = true; Sfx.jump();
    this.dog.setFlipX(false); this.dog.anims.timeScale = 1; this.dog.play(this.animKey('jump', this.lastDir), true);
    this.tweens.addCounter({ from: 0, to: 1, duration: happy ? 700 : 620, ease: 'Linear', onUpdate: tw => { this.jumpOff = -Math.sin(tw.getValue() * Math.PI) * (happy ? 120 : 90); }, onComplete: () => { this.jumpOff = 0; this.jumping = false; } });
  }
}

/* combat system (combat.js) */
window.RKCombat.install(Game, { TW, TH, MW, MH, sx, sy, Sfx, $, canvasTex, rr, shade, css, poly, isoBox, ZONES, OWNERS, DIR8 });

window.addEventListener('load', () => {
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', width: VIEW_W, height: VIEW_H, backgroundColor: '#8fd46c',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    fps: { forceSetTimeOut: location.search.includes('test'), target: 60 },
    render: { antialias: true, pixelArt: false, roundPixels: false },
    scene: [Boot, Game],
  });
  window.__phaser = game;
});
})();
