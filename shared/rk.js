/* RK — shared polish layer for both games: settings (sound / vibration), audio bus + background music, haptics, UI helpers */
(() => {
'use strict';
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const SELF = document.currentScript && document.currentScript.src;
const RK = window.RK = { build: '20261016c', sound: LS.get('rk_sound', '1') === '1', vibOn: LS.get('rk_vib', '1') === '1', listeners: [] };
const emit = () => RK.listeners.forEach(f => { try { f(); } catch (e) {} });

/* ---------------- audio: one shared context, an SFX bus and a music bus behind a master gain ---------------- */
let ctx = null, master = null, sfxBus = null, musicBus = null, timer = null, curTrack = null, nextT = 0, step = 0, noiseBuf = null;
RK.ctx = () => {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = RK.sound ? 1 : 0; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = .5; musicBus.connect(master);
  } catch (e) { ctx = null; }
  return ctx;
};
RK.out = () => { const a = RK.ctx(); return a ? sfxBus : null; };
RK.resume = () => {
  const a = RK.ctx(); if (!a) return;
  if (a.state === 'suspended') a.resume().then(() => { nextT = a.currentTime + .1; });
  if (curTrack && !timer) timer = setInterval(tick, 50);
};
RK.setSound = on => { RK.sound = !!on; LS.set('rk_sound', on ? '1' : '0'); if (master) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, .04); emit(); };
RK.setVib = on => { RK.vibOn = !!on; LS.set('rk_vib', on ? '1' : '0'); if (on) RK.vibrate(20); emit(); };
RK.vibrate = ms => { if (RK.vibOn && navigator.vibrate && !(navigator.userActivation && !navigator.userActivation.hasBeenActive)) { try { navigator.vibrate(ms); } catch (e) {} } };

/* ---------------- background music: a tiny step sequencer (bass, pad, arpeggio, lead, soft drums) ---------------- */
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const rnd = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const SC = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10] };
function makeTrack(o) {
  const sc = SC[o.mode], deg = d => o.root + sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  const bars = o.prog.map((d, bi) => {
    const r = rnd(o.seed + bi * 17), mel = Array(16).fill(null); let cur = d + 4;
    o.pat.forEach(p => { const move = [-2, -1, 0, 1, 2, 3][Math.floor(r() * 6)]; cur = Math.max(d + 1, Math.min(d + 9, cur + move)); if (r() < (o.density || .85)) mel[p] = deg(cur) + 12; });
    return { chord: [deg(d), deg(d + 2), deg(d + 4)], bass: deg(d) - 12, mel };
  });
  return Object.assign({ bars }, o);
}
const TRACKS = {
  title: makeTrack({ bpm: 84, root: 60, mode: 'maj', prog: [0, 5, 3, 4], seed: 11, pat: [0, 4, 8, 12], arp: 'sine', lead: 'sine', leadVol: .05, drums: 0, density: .9 }),
  town: makeTrack({ bpm: 104, root: 57, mode: 'min', prog: [0, 5, 3, 6], seed: 23, pat: [0, 3, 6, 8, 11, 14], arp: 'triangle', lead: 'triangle', leadVol: .055, drums: 1, density: .8 }),
  boss: makeTrack({ bpm: 134, root: 52, mode: 'min', prog: [0, 0, 5, 6], seed: 37, pat: [0, 2, 4, 6, 8, 10, 12, 14], arp: 'square', lead: 'square', leadVol: .04, drums: 2, density: .85 }),
  day: makeTrack({ bpm: 112, root: 62, mode: 'maj', prog: [0, 4, 5, 3], seed: 41, pat: [0, 3, 6, 8, 11, 14], arp: 'triangle', lead: 'triangle', leadVol: .06, drums: 1, density: .85 }),
  night: makeTrack({ bpm: 92, root: 57, mode: 'maj', prog: [0, 3, 5, 4], seed: 53, pat: [0, 4, 7, 10, 12], arp: 'sine', lead: 'sine', leadVol: .06, drums: 0, density: .8 }),
  rain: makeTrack({ bpm: 88, root: 55, mode: 'min', prog: [0, 3, 5, 6], seed: 67, pat: [0, 4, 8, 11, 14], arp: 'sine', lead: 'triangle', leadVol: .05, drums: 0, density: .75 }),
};
function note(freq, type, t, dur, vol, att = .01) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + .05);
}
function hat(t, vol) {
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * .06, ctx.sampleRate); const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length); }
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000; g.gain.value = vol; s.connect(f); f.connect(g); g.connect(musicBus); s.start(t);
}
function kick(t, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(45, t + .14);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + .2); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + .22);
}
function playStep(T, st, t, dur) {
  const bar = T.bars[Math.floor(st / 16) % T.bars.length], s = st % 16, barDur = dur * 16;
  if (s === 0) bar.chord.forEach(m => note(hz(m + 12), 'sine', t, barDur * .96, .035, .25));
  if (s % 8 === 0) note(hz(bar.bass), 'triangle', t, dur * 6, .16, .008);
  else if (T.drums === 2 && s % 4 === 2) note(hz(bar.bass), 'triangle', t, dur * 1.6, .1, .008);
  if (T.arp && s % 2 === 0) note(hz(bar.chord[(s / 2) % 3] + 24), T.arp, t, dur * 1.4, T.drums === 2 ? .022 : .016);
  if (bar.mel[s] != null) note(hz(bar.mel[s]), T.lead, t, dur * 3.2, T.leadVol, .012);
  if (T.drums) { if (s % 8 === 0) kick(t, .22); if (T.drums === 2 && s % 8 === 4) kick(t, .14); if (s % 2 === 0) hat(t, T.drums === 2 ? .028 : .016); }
}
function tick() {
  const T = TRACKS[curTrack]; if (!T || !ctx || ctx.state !== 'running') return;
  const dur = 60 / T.bpm / 4; if (nextT < ctx.currentTime - .4) nextT = ctx.currentTime + .1;
  while (nextT < ctx.currentTime + .3) { playStep(T, step, nextT, dur); nextT += dur; step = (step + 1) % (T.bars.length * 16); }
}
RK.music = {
  play(name) {
    if (!TRACKS[name] || curTrack === name) return;
    curTrack = name; step = 0; RK.ctx();
    if (ctx) { nextT = ctx.currentTime + .15; if (musicBus) { musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setValueAtTime(.0001, ctx.currentTime); musicBus.gain.linearRampToValueAtTime(.5, ctx.currentTime + .8); } }
    if (!timer) timer = setInterval(tick, 50);
  },
  stop() { curTrack = null; if (timer) { clearInterval(timer); timer = null; } },
  get current() { return curTrack; },
};
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume().then(() => { nextT = ctx.currentTime + .1; }); });
['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, () => RK.resume(), { passive: true }));
window.addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat) RK.setSound(!RK.sound); });

/* ---------------- new-version notice (tabs that stay open for a long time keep running the old files) ---------------- */
RK.checkUpdate = async () => {
  if (!SELF || RK._upd) return;
  try {
    const r = await fetch(new URL('../version.json', SELF).href + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
    const j = await r.json(); if (!j || !j.build || j.build === RK.build) return;
    RK._upd = true; const b = document.createElement('button'); b.id = 'rk-update'; b.type = 'button'; b.textContent = '🔄 새 버전이 있어요 · 눌러서 업데이트';
    b.addEventListener('click', () => location.reload()); (document.getElementById('stage') || document.body).appendChild(b);
  } catch (e) {}
};
setTimeout(RK.checkUpdate, 4000); setInterval(RK.checkUpdate, 300000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) RK.checkUpdate(); });

/* ---------------- UI helpers ---------------- */
const $ = id => document.getElementById(id);
const host = () => $('stage') || document.body;
const ui = RK.ui = {
  el(id, cls) { let e = $(id); if (!e) { e = document.createElement('div'); e.id = id; if (cls) e.className = cls; host().appendChild(e); } return e; },
  /* black fade used between menu <-> game and between stages; fn runs while the screen is black */
  transition(fn, out = 240, inn = 420) {
    const f = ui.el('rk-fade'); f.classList.add('on');
    setTimeout(() => { try { fn(); } finally { setTimeout(() => f.classList.remove('on'), 60); } }, out);
    f.style.transitionDuration = out + 'ms'; setTimeout(() => { f.style.transitionDuration = inn + 'ms'; }, out + 20);
  },
  banner(kicker, title, cls = '', ms = 2600) {
    const old = $('rk-banner'); if (old) old.remove();
    const b = ui.el('rk-banner', 'rk-banner ' + cls); b.innerHTML = '<div class="k"></div><div class="t"></div>'; b.firstChild.textContent = kicker; b.lastChild.textContent = title;
    b.style.animationDuration = ms + 'ms'; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
    clearTimeout(ui._bt); ui._bt = setTimeout(() => { if (b.parentNode) b.remove(); }, ms + 80);
  },
  countUp(el, to, ms = 900, fmt = v => String(v)) {
    if (!el) return; const t0 = performance.now(), from = 0; to = Number(to) || 0;
    const tick2 = now => { const p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(Math.round(from + (to - from) * e)); if (p < 1) requestAnimationFrame(tick2); };
    requestAnimationFrame(tick2);
  },
  bounce(el) { if (!el) return; el.classList.remove('rk-bounce'); void el.offsetWidth; el.classList.add('rk-bounce'); },
  hurt() { const v = ui.el('rk-hurt'); if (v.animate) v.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 560, easing: 'ease-out' }); else { v.classList.remove('flash'); void v.offsetWidth; v.classList.add('flash'); setTimeout(() => v.classList.remove('flash'), 60); } },
  lowhp(on) { ui.el('rk-hurt').classList.toggle('low', !!on); },
  /* sound / vibration toggles (title + pause menu) */
  mountSettings(container, before) {
    if (!container || container.querySelector('.rk-settings')) return;
    const w = document.createElement('div'); w.className = 'rk-settings';
    const a = document.createElement('button'), b = document.createElement('button'); a.className = b.className = 'mode-btn'; a.type = b.type = 'button';
    const sync = () => { a.textContent = RK.sound ? '🔊 소리 켜짐' : '🔇 소리 꺼짐'; b.textContent = RK.vibOn ? '📳 진동 켜짐' : '📴 진동 꺼짐'; a.classList.toggle('off', !RK.sound); b.classList.toggle('off', !RK.vibOn); };
    a.addEventListener('click', () => RK.setSound(!RK.sound)); b.addEventListener('click', () => RK.setVib(!RK.vibOn));
    w.appendChild(a); if (navigator.vibrate) w.appendChild(b); RK.listeners.push(sync); sync();
    if (before && before.parentNode === container) container.insertBefore(w, before); else container.appendChild(w);
  },
};
})();
