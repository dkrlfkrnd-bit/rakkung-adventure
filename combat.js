/* 전투 시스템 — Stage 1: 물기(J) / 돌진(K) / 왕짖기(L) / 조직원 호출(R, 잠김)
   적 AI 상태: patrol(탐색) → alert(경계) → chase(추격) → windup/strike(공격) → retreat(후퇴) → return(복귀)
   Installed onto Game.prototype by main.js:  RKCombat.install(Game, helpers)
*/
window.RKCombat = {
  install(Game, H) {
    const { TW, TH, sx, sy, Sfx, $, canvasTex, rr, ZONES, OWNERS, DIR8 } = H;
    const XP_NEED = [0, 30, 70, 120, 180, 250, 330, 420, 520, 640];   // total xp to reach level (index = level-1)
    const MAX_LVL = 10;
    const SK = {
      bite: { cd: 380, range: 1.45, dot: 0.3 },
      dash: { cd: 4000, dist: 4.6, time: 280, dmg: 14, kb: 3.4 },
      bark: { cd: 8000, radius: 3.5, dmg: 8, stun: 1500 },
      crew: { cd: 30000, unlock: 3 },
    };
    const ENEMY = {
      cat: { name: '캣 조직원', hp: 42, speed: 3.7, patrol: 1.3, sight: 6.5, dmg: 8, range: 1.15, windup: 420, cd: 1350, xp: 20, scale: 1.3, h: 138, char: 'cat' },
      dummy: { name: '훈련용 샌드백', hp: 80, inert: true, xp: 0, scale: 1.3 },
      boss: { name: '돈 캣', boss: true, hp: 380, speed: 3.3, patrol: 1.0, sight: 99, dmg: 15, range: 1.7, windup: 650, cd: 1500, xp: 160, scale: 1.7, h: 215, char: 'cat', kbMul: .3 },
    };
    const ang = (dx, dy) => Math.atan2(dy, dx);

    Object.assign(Game.prototype, {
      /* ================= setup ================= */
      initCombat() {
        this.lvl = 1; this.xp = 0; this.kills = 0; this.cat3Down = 0; this.cat6Down = 0;
        this.calcStats(); this.hp = this.maxHp;
        this.cd = { bite: 0, dash: 0, bark: 0, crew: 0 };
        this.combo = 0; this.lastBite = -9999; this.atkLockUntil = 0; this.hurtLockUntil = 0; this.invulnUntil = 0; this.hitstopUntil = 0;
        this.dashing = false; this.dead = false; this.atkAnim = false; this.lungeV = null; this.hurtV = null;
        this.enemies = []; this.fxList = []; this.tut = {};
        this.zones = ZONES.map(z => ({ ...z })); this.curZone = null;
        this.fxg = this.add.graphics().setDepth(99000);
        this.makeCombatTextures();
        const kb = this.input.keyboard;
        this.kJ = kb.addKey('J'); this.kK = kb.addKey('K'); this.kL = kb.addKey('L');
        this.ui = {
          hpFill: $('hp-fill'), hpText: $('hp-text'), xpFill: $('xp-fill'), lvl: $('lvl'),
          sk: { bite: $('sk-bite'), dash: $('sk-dash'), bark: $('sk-bark'), crew: $('sk-crew') },
        };
        this.refreshCombatHud(0);
      },
      calcStats() {
        const L = this.lvl - 1;
        this.maxHp = 100 + 12 * L; this.atk = 10 + 2 * L;
        this.power = 1 + 0.05 * L; this.cdScale = Math.max(0.75, 1 - 0.025 * L);
      },
      speedMul() { return 1 + 0.02 * (this.lvl - 1); },
      combatLocked(time) { return time < this.atkLockUntil || this.dashing || time < this.hurtLockUntil; },

      makeCombatTextures() {
        if (this.textures.exists('enemy_cat')) return;
        const eyes = (c, x, y, gap) => { c.fillStyle = '#ffe66a'; [x - gap, x + gap].forEach(ex => { c.beginPath(); c.ellipse(ex, y, 5, 6, 0, 0, 7); c.fill(); }); c.fillStyle = '#1b1530'; [x - gap, x + gap].forEach(ex => { c.beginPath(); c.ellipse(ex, y, 1.8, 5, 0, 0, 7); c.fill(); }); };
        canvasTex(this, 'enemy_cat', 96, 120, c => {
          c.fillStyle = 'rgba(30,20,60,.22)'; c.beginPath(); c.ellipse(48, 112, 30, 8, 0, 0, 7); c.fill();
          // dark suit + purple scarf
          c.fillStyle = '#26233a'; rr(c, 22, 66, 52, 46, 14); c.fill(); c.fillStyle = '#7b3fa6'; rr(c, 28, 62, 40, 10, 5); c.fill(); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(60, 72, 14, 38);
          // claws
          c.fillStyle = '#e8e8f0'; [[18, 100], [78, 100]].forEach(([x, y]) => { for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x - 6 + i * 6, y); c.lineTo(x - 4 + i * 6, y + 10); c.lineTo(x - 2 + i * 6, y); c.fill(); } });
          // gray tabby head
          c.fillStyle = '#6f7388'; [[[22, 30], [18, 6], [40, 20]], [[74, 30], [78, 6], [56, 20]]].forEach(p => { c.beginPath(); c.moveTo(...p[0]); c.lineTo(...p[1]); c.lineTo(...p[2]); c.fill(); });
          c.beginPath(); c.arc(48, 44, 29, 0, 7); c.fill();
          c.strokeStyle = '#4a4d60'; c.lineWidth = 3; [[-12, 0], [0, 0], [12, 0]].forEach(([dx]) => { c.beginPath(); c.moveTo(48 + dx, 16); c.lineTo(48 + dx, 26); c.stroke(); });
          c.fillStyle = '#9aa0b8'; c.beginPath(); c.ellipse(48, 56, 15, 11, 0, 0, 7); c.fill();
          eyes(c, 48, 42, 12); c.fillStyle = '#ff7a93'; c.beginPath(); c.arc(48, 52, 3, 0, 7); c.fill();
          c.strokeStyle = '#2b2e4d'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(34, 34); c.lineTo(58, 31); c.stroke();            // angry brow
          c.strokeStyle = '#e8e8f0'; c.lineWidth = 1.6; [-1, 1].forEach(s => [0, 5].forEach(d => { c.beginPath(); c.moveTo(48 + s * 12, 55 + d * .4); c.lineTo(48 + s * 28, 52 + d); c.stroke(); }));
          c.fillStyle = '#26233a'; c.beginPath(); c.ellipse(48, 17, 30, 7, 0, 0, 7); c.fill(); rr(c, 30, 0, 36, 17, 8); c.fill(); c.fillStyle = '#7b3fa6'; c.fillRect(30, 9, 36, 4);   // fedora
        });
        canvasTex(this, 'dummy', 96, 120, c => {
          c.fillStyle = 'rgba(30,20,60,.22)'; c.beginPath(); c.ellipse(48, 112, 28, 8, 0, 0, 7); c.fill();
          c.fillStyle = '#8a5a3a'; c.fillRect(44, 70, 8, 40);
          c.fillStyle = '#d9b27c'; rr(c, 20, 30, 56, 60, 22); c.fill(); c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(56, 34, 18, 52);
          c.strokeStyle = '#b08a52'; c.lineWidth = 3; [[28, 46], [28, 62], [28, 78]].forEach(([x, y]) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 40, y); c.stroke(); });
          c.fillStyle = '#c1272d'; c.beginPath(); c.arc(48, 60, 12, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(48, 60, 7, 0, 7); c.fill(); c.fillStyle = '#c1272d'; c.beginPath(); c.arc(48, 60, 3, 0, 7); c.fill();
          c.fillStyle = '#ffd54a'; rr(c, 30, 20, 36, 14, 6); c.fill();
        });
        canvasTex(this, 'star', 28, 28, c => { c.fillStyle = '#ffe66a'; c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 5 : 12, a = i * Math.PI / 5 - Math.PI / 2; c.lineTo(14 + Math.cos(a) * r, 14 + Math.sin(a) * r); } c.closePath(); c.fill(); c.strokeStyle = '#b5801c'; c.lineWidth = 1.5; c.stroke(); });
      },

      /* ================= enemies ================= */
      spawnEnemy(type, gx, gy, opts = {}) {
        const d = ENEMY[type], x = sx(gx, gy), y = sy(gx, gy);
        const e = {
          id: this.enemies.length + 1, type, d, gx, gy, r: 0.35, hp: d.hp, maxHp: d.hp, state: d.inert ? 'idle' : 'patrol', home: { gx, gy }, wp: null, wpAt: 0,
          kv: { gx: 0, gy: 0 }, stunUntil: 0, alertAt: 0, windAt: 0, recoverAt: 0, nextAtk: 0, fled: false, fleeUntil: 0, flashUntil: 0, tag: opts.tag || type, face: 1,
        };
        e.sh = this.add.image(x, y, 'blob').setScale(.9, .8).setDepth(-3e5);
        e.sheet = !d.inert && d.char && this.anims.exists('npc_' + d.char + '_idle_down');
        if (e.sheet) { e.baseSc = d.h / this.npcman.chars[d.char].frameH; e.spr = this.add.sprite(x, y, d.char + '_idle_down').setOrigin(0.5, 0.97).setScale(e.baseSc); e.spr.play('npc_' + d.char + '_idle_down'); e.dir = 'down'; e.px = x; e.py = y; }
        else e.spr = this.add.image(x, y, d.inert ? 'dummy' : 'enemy_cat').setOrigin(0.5, 0.93).setScale(d.scale);
        e.barBg = this.add.rectangle(x, y, 46, 7, 0x1b1530).setDepth(99990).setStrokeStyle(1, 0xffffff, .5).setVisible(false);
        e.barFill = this.add.rectangle(x - 22, y, 44, 5, 0xff5a6e).setOrigin(0, .5).setDepth(99991).setVisible(false);
        e.mark = this.add.text(x, y, '!', { fontFamily: 'sans-serif', fontSize: '30px', fontStyle: 'bold', color: '#ff3b3b', stroke: '#fff', strokeThickness: 5 }).setOrigin(.5).setDepth(99992).setVisible(false);
        e.stars = this.add.image(x, y, 'star').setDepth(99992).setVisible(false);
        if (d.boss) e.crown = this.add.text(x, y, '👑', { fontSize: '46px', fontFamily: '"Segoe UI Emoji","Apple Color Emoji",sans-serif' }).setOrigin(.5).setDepth(99992);
        this.enemies.push(e); return e;
      },
      spawnTrainingDummy() { if (this.dummy) return; this.dummy = this.spawnEnemy('dummy', 11, 13.6); this.toast('샌드백으로 기술을 연습하자!', 2500); },
      spawnCatPack() {
        [[28.5, 12.5], [30.5, 13.8], [26.8, 15.6]].forEach(([gx, gy], i) => this.spawnEnemy('cat', gx, gy, { tag: 'cat3' }));
      },

      /* ================= chapter 2 : warehouse + boss ================= */
      freeSpot(gx, gy) { for (let r = 0; r < 6; r += .6) for (let a = 0; a < 6.3; a += .8) { const x = gx + Math.cos(a) * r, y = gy + Math.sin(a) * r; if (!this.blocked(x, y, .55)) return { gx: x, gy: y }; } return { gx, gy }; },
      startChapter2() {
        this.cat6Down = 0; this.setStage(6);
        const wz = this.zones.find(z => z.id === 'warehouse'); if (wz) { wz.owner = 'cat'; this.redrawMinimapBase(); }
        [[24, 18], [27.5, 17.2], [31, 18.4], [33.6, 17], [28.5, 19.6]].forEach(([gx, gy]) => { const p = this.freeSpot(gx, gy); this.spawnEnemy('cat', p.gx, p.gy, { tag: 'cat6' }); });
        this.toast('챕터 2 시작! 캣 패밀리가 창고 지구를 점령했다 📍 미니맵 표시로 가자', 4200); Sfx.fanfare();
      },
      startBossIntro() {
        this.setStage(7); Sfx.tone(120, .5, 'sawtooth', .08, 40);
        this.time.delayedCall(900, () => {
          const D = (who, icon, text) => ({ who, icon, text });
          this.openDialog([
            D('돈 캣', '😼', '…내 부하들을 이렇게 만들어놨냐옹.'), D('라꿍이', '🐶', '…네가 두목이군.'),
            D('돈 캣', '😼', '여긴 캣 패밀리 구역이다옹! 꼬리 짧은 강아지 따위가!'), D('라꿍이', '🐶', '(꼬리 얘기는 하지 마라.)'),
          ], () => this.spawnBoss());
        });
      },
      spawnBoss() {
        const p = this.freeSpot(28, 18.5), e = this.spawnEnemy('boss', p.gx, p.gy, { tag: 'boss' });
        e.state = 'chase'; e.nextAtk = this.time.now + 1600; this.cameras.main.shake(300, .01); this.toast('보스 · 돈 캣 😾', 2200); Sfx.tone(100, .6, 'sawtooth', .1, 50);
        this.burst(sx(e.gx, e.gy), sy(e.gx, e.gy) - 80, ['💨', '⭐'], 8);
      },
      bossAI(e, time, dt, dist, toH, step) {
        const d = e.d, h = this.hero, cdMul = e.phase2 ? .72 : 1;
        if (this.dead && e.state !== 'dash') e.state = 'return';
        if (!e.phase2 && e.hp < e.maxHp * .5) { e.phase2 = true; this.bossPhase2(e); }
        switch (e.state) {
          case 'idle': if (!this.dead && dist < 11) e.state = 'chase'; break;
          case 'chase':
            if (dist > 15) { e.state = 'return'; break; }
            if (dist > d.range * .8) step(toH(), d.speed * (e.phase2 ? 1.25 : 1));
            if (time > e.nextAtk && !this.dead) this.bossChoose(e, time, dist, toH);
            break;
          case 'windup': if (time >= e.windAt) this.bossStrike(e, time, toH); break;
          case 'dash': {
            const hits = this.moveEnt(e, e.cdx * 11 * dt / 1000, e.cdy * 11 * dt / 1000);
            if (!e.dashHit && !this.dead && Math.hypot(h.gx - e.gx, h.gy - e.gy) < 1.3) { e.dashHit = true; this.hurtPlayer(d.dmg + 4, e.gx, e.gy); }
            if (hits > 1) { e.state = 'stunned'; e.stunUntil = time + 1400; e.nextAtk = time + 1400 * cdMul; this.cameras.main.shake(200, .01); this.floatText(sx(e.gx, e.gy), sy(e.gx, e.gy) - 200, 'BONK!', '#ffd24a', 34); Sfx.tone(110, .2, 'square', .09); }
            else if (time >= e.dashUntil) { e.state = 'recover'; e.recoverAt = time + 750; e.nextAtk = time + 1500 * cdMul; }
            break;
          }
          case 'recover': if (time >= e.recoverAt) e.state = 'chase'; break;
          case 'return': {
            const hd = Math.hypot(e.home.gx - e.gx, e.home.gy - e.gy);
            if (hd > .6) step({ gx: (e.home.gx - e.gx) / hd, gy: (e.home.gy - e.gy) / hd }, d.speed * 1.6); else e.state = 'idle';
            if (!this.dead && dist < 11) e.state = 'chase';
            break;
          }
          default: e.state = 'chase';
        }
      },
      bossChoose(e, time, dist, toH) {
        const r = Math.random(); let atk;
        if (dist < 2.4) atk = r < .55 ? 'swipe' : 'slam'; else if (dist < 7.5) atk = r < .5 ? 'charge' : r < .8 ? 'slam' : 'swipe'; else atk = 'charge';
        if (atk === 'swipe' && dist > 3) atk = 'charge';
        e.atk = atk; e.state = 'windup'; e.windAt = time + { swipe: 650, slam: 1000, charge: 800 }[atk] * (e.phase2 ? .8 : 1);
        e.warnR = { swipe: e.d.range + .5, slam: 3.6, charge: 1.1 }[atk];
        const t = toH(); e.cdx = t.gx; e.cdy = t.gy; e.tgx = e.gx + t.gx * 7; e.tgy = e.gy + t.gy * 7;
        if (atk === 'slam' && !this.slamHint) { this.slamHint = true; this.toast('내려찍기 예고! 점프(Space)로 피하자 ⬆', 2600); }
        if (atk === 'charge' && !this.chargeHint) { this.chargeHint = true; this.toast('돌진 예고! 옆으로 피하자 ↔', 2400); }
        Sfx.tone(atk === 'slam' ? 90 : 160, .3, 'sawtooth', .07, 40);
      },
      bossStrike(e, time, toH) {
        const d = e.d, h = this.hero, t = toH(), cdMul = e.phase2 ? .72 : 1;
        if (e.atk === 'swipe') {
          this.moveEnt(e, t.gx * .7, t.gy * .7); this.addFx({ type: 'claw', gx: e.gx, gy: e.gy, tx: h.gx, ty: h.gy, t0: time, dur: 260 }); Sfx.noise(.12, .09, 1500);
          if (!this.dead && Math.hypot(h.gx - e.gx, h.gy - e.gy) < d.range + .6) this.hurtPlayer(d.dmg, e.gx, e.gy);
          e.state = 'recover'; e.recoverAt = time + 650; e.nextAtk = time + 1400 * cdMul;
        } else if (e.atk === 'slam') {
          const x = sx(e.gx, e.gy), y = sy(e.gx, e.gy);
          this.addFx({ type: 'ring', x, y, t0: time, dur: 560, R: 3.6 * TW / 2 * 1.42, color: 0xff6a4a, w: 10, iso: true });
          this.cameras.main.shake(260, .012); Sfx.noise(.3, .1, 200); Sfx.tone(80, .3, 'square', .1, -30);
          if (!this.dead && !this.jumping && Math.hypot(h.gx - e.gx, h.gy - e.gy) < 3.6) this.hurtPlayer(d.dmg + 8, e.gx, e.gy);
          e.state = 'recover'; e.recoverAt = time + 900; e.nextAtk = time + 1700 * cdMul;
        } else { e.state = 'dash'; e.dashUntil = time + 640; e.dashHit = false; Sfx.noise(.3, .08, 500); Sfx.tone(200, .3, 'sawtooth', .06, 400); }
      },
      bossPhase2(e) {
        this.toast('돈 캣이 화났다! 부하들을 부른다 😾', 2800); this.cameras.main.shake(300, .01); Sfx.tone(120, .5, 'sawtooth', .09, 60);
        [[-2.5, 1], [1.5, -2.5]].forEach(([dx, dy]) => { const p = this.freeSpot(e.gx + dx, e.gy + dy), m = this.spawnEnemy('cat', p.gx, p.gy, { tag: 'minion' }); m.state = 'chase'; });
      },
      onBossDown(e) {
        this.setStage(8);
        ['warehouse', 'alley'].forEach(id => { const z = this.zones.find(q => q.id === id); if (z) z.owner = 'rakkung'; }); this.redrawMinimapBase();
        for (const m of this.enemies) if (m !== e && m.state !== 'dead' && !m.d.inert) { m.hp = 0; m.stunUntil = 0; this.killEnemy(m); }
        this.score += 600; this.addXp(100); this.updateHud(); Sfx.fanfare(); this.cameras.main.shake(300, .01);
        this.toast('창고 지구와 골목 상점가를 되찾았다! 🏆', 4200);
        this.time.delayedCall(2200, () => { if (this.state === 'play' || this.state === 'dialog') this.showChapterDone(2); });
      },
      refreshBossHud() {
        const B = this.enemies.find(x => x.d.boss && x.state !== 'dead'), bar = $('boss-bar'); if (!bar) return;
        bar.classList.toggle('hidden', !B || this.state === 'title'); if (B) $('boss-fill').style.width = (100 * Math.max(0, B.hp) / B.maxHp) + '%';
      },

      damageEnemy(e, dmg, from, o = {}) {
        if (e.state === 'dead') return;
        const t = this.time.now; dmg = Math.round(dmg);
        e.hp -= dmg; e.flashUntil = t + 90; e.spr.setTintFill(0xffffff);
        this.hitstopUntil = Math.max(this.hitstopUntil, t + (o.big ? 80 : 45));
        // knockback away from source
        const dx = e.gx - from.gx, dy = e.gy - from.gy, l = Math.hypot(dx, dy) || 1, kb = (o.kb || 1.2) * (e.d.kbMul || 1);
        e.kv.gx += dx / l * kb * 6; e.kv.gy += dy / l * kb * 6;
        if (o.stun) { e.stunUntil = Math.max(e.stunUntil, t + (e.d.boss ? Math.min(o.stun, 600) : o.stun)); }
        this.floatText(sx(e.gx, e.gy), sy(e.gx, e.gy) - 110, dmg, o.big ? '#ffd24a' : '#ffffff', o.big ? 34 : 26);
        this.hitSpark(sx(e.gx, e.gy), sy(e.gx, e.gy) - 50, o.big);
        Sfx.tone(o.big ? 180 : 260, .09, 'square', .07, -100);
        if (!e.d.inert && e.state !== 'stunned') { if (e.state === 'patrol' || e.state === 'return' || e.state === 'alert') { e.state = 'chase'; this.alertGroup(e); } }
        if (e.hp <= 0) {
          if (e.d.inert) { e.hp = e.maxHp; e.spr.setAngle(0); this.tweens.add({ targets: e.spr, angle: { from: 18, to: 0 }, duration: 260, ease: 'Back.out' }); this.floatText(sx(e.gx, e.gy), sy(e.gx, e.gy) - 140, 'KO!', '#ff7a93', 30); return; }
          this.killEnemy(e);
        } else if (e.d.inert) { this.tweens.add({ targets: e.spr, angle: { from: -10, to: 0 }, duration: 220, ease: 'Back.out' }); }
      },
      killEnemy(e) {
        e.state = 'dead'; this.kills++;
        e.mark.setVisible(false); e.stars.setVisible(false); e.barBg.setVisible(false); e.barFill.setVisible(false);
        const dir = e.kv.gx - e.kv.gy >= 0 ? 1 : -1;
        this.tweens.add({ targets: e.spr, angle: 95 * dir, y: e.spr.y + 14, alpha: 0, duration: 900, ease: 'Cubic.in', onComplete: () => { e.spr.destroy(); e.sh.destroy(); } });
        this.tweens.add({ targets: e.sh, alpha: 0, duration: 900 });
        this.burst(sx(e.gx, e.gy), sy(e.gx, e.gy) - 60, ['💫', '⭐'], 6);
        this.floatText(sx(e.gx, e.gy), sy(e.gx, e.gy) - 150, `+${e.d.xp} XP`, '#7dffb0', 26);
        this.score += 100; this.addXp(e.d.xp); this.updateHud();
        Sfx.tone(140, .25, 'sawtooth', .08, -60);
        if (e.crown) this.tweens.add({ targets: e.crown, y: e.crown.y - 70, alpha: 0, duration: 900, onComplete: () => e.crown.destroy() });
        if (e.tag === 'cat6' && this.stage === 6) {
          this.cat6Down++;
          if (this.cat6Down >= 5) this.startBossIntro(); else { this.setStage(6); this.toast(`캣 패밀리 조직원 격파! (${this.cat6Down}/5)`, 1600); }
        }
        if (e.d.boss) this.onBossDown(e);
        if (e.tag === 'cat3') {
          this.cat3Down++;
          if (this.stage === 3) {
            if (this.cat3Down >= 3) { this.setStage(4); this.toast('캣 패밀리 조직원을 모두 쓰러뜨렸다! 냥냥 사장님에게 가보자 🐱', 3500); Sfx.fanfare(); this.score += 200; this.addXp(30); this.updateHud(); }
            else { this.setStage(3); this.toast(`캣 패밀리 조직원 격파! (${this.cat3Down}/3)`, 1800); }
          }
        }
      },
      alertGroup(src) { for (const o of this.enemies) if (o !== src && !o.d.inert && o.state === 'patrol' && Math.hypot(o.gx - src.gx, o.gy - src.gy) < 7) { o.state = 'alert'; o.alertAt = this.time.now + 350; } },

      updateEnemies(time, dt) {
        const h = this.hero, freeze = time < this.hitstopUntil;
        for (const e of this.enemies) {
          if (e.state === 'dead') continue;
          const d = e.d, dist = Math.hypot(h.gx - e.gx, h.gy - e.gy);
          // knockback velocity (all enemies)
          if (Math.abs(e.kv.gx) + Math.abs(e.kv.gy) > 0.05) { this.moveEnt(e, e.kv.gx * dt / 1000, e.kv.gy * dt / 1000); const k = Math.pow(0.0004, dt / 1000); e.kv.gx *= k; e.kv.gy *= k; }
          if (!d.inert && !freeze) {
            if (time < e.stunUntil) { e.state = 'stunned'; }
            else {
              if (e.state === 'stunned') e.state = 'chase';
              const toH = () => { const l = dist || 1; return { gx: (h.gx - e.gx) / l, gy: (h.gy - e.gy) / l }; };
              const step = (dir, spd) => { const hits = this.moveEnt(e, dir.gx * spd * dt / 1000, dir.gy * spd * dt / 1000); if (hits > 1 && Math.random() < .1) { /* nudge around corners */ this.moveEnt(e, -dir.gy * spd * dt / 600, dir.gx * spd * dt / 600); } };
              if (this.dead) { if (e.state !== 'return' && e.state !== 'patrol') e.state = 'return'; }
              if (d.boss) this.bossAI(e, time, dt, dist, toH, step); else switch (e.state) {
                case 'patrol': {
                  if (!e.wp || time > e.wpAt) { const a = Math.random() * 6.28, r = 1 + Math.random() * 2.5; e.wp = { gx: e.home.gx + Math.cos(a) * r, gy: e.home.gy + Math.sin(a) * r }; e.wpAt = time + 2200 + Math.random() * 2000; }
                  const wd = Math.hypot(e.wp.gx - e.gx, e.wp.gy - e.gy); if (wd > .3) step({ gx: (e.wp.gx - e.gx) / wd, gy: (e.wp.gy - e.gy) / wd }, d.patrol);
                  if (!this.dead && dist < d.sight) { e.state = 'alert'; e.alertAt = time + 520; this.alertGroup(e); Sfx.tone(700, .1, 'square', .05); }
                  break;
                }
                case 'alert': if (time >= e.alertAt) e.state = 'chase'; break;
                case 'chase': {
                  if (dist > 13) { e.state = 'return'; break; }
                  if (!e.fled && e.hp < e.maxHp * 0.28) { e.fled = true; e.state = 'retreat'; e.fleeUntil = time + 1800; break; }
                  if (dist > d.range * 0.85) step(toH(), d.speed);
                  if (dist < d.range && time > e.nextAtk) { e.state = 'windup'; e.windAt = time + d.windup; }
                  break;
                }
                case 'windup': {
                  if (time >= e.windAt) {
                    // strike: lunge + hit check
                    const t = toH(); this.moveEnt(e, t.gx * .45, t.gy * .45);
                    const nd = Math.hypot(h.gx - e.gx, h.gy - e.gy);
                    this.addFx({ type: 'claw', gx: e.gx, gy: e.gy, tx: h.gx, ty: h.gy, t0: time, dur: 220 });
                    Sfx.noise(.09, .08, 2000);
                    if (nd < d.range + 0.45) this.hurtPlayer(d.dmg, e.gx, e.gy);
                    e.state = 'recover'; e.recoverAt = time + 520; e.nextAtk = time + d.cd;
                  }
                  break;
                }
                case 'recover': if (time >= e.recoverAt) e.state = 'chase'; break;
                case 'retreat': { const t = toH(); step({ gx: -t.gx, gy: -t.gy }, d.speed * 1.15); if (time >= e.fleeUntil) e.state = 'chase'; break; }
                case 'return': {
                  const hd = Math.hypot(e.home.gx - e.gx, e.home.gy - e.gy);
                  if (hd > .5) step({ gx: (e.home.gx - e.gx) / hd, gy: (e.home.gy - e.gy) / hd }, d.patrol * 2);
                  else e.state = 'patrol';
                  if (!this.dead && dist < d.sight * .8) { e.state = 'alert'; e.alertAt = time + 400; }
                  break;
                }
              }
            }
          }
          // visuals
          const x = sx(e.gx, e.gy), y = sy(e.gx, e.gy);
          const wind = e.state === 'windup', crouch = wind ? 0.88 : 1;
          e.spr.setPosition(x, y).setDepth(this.depthFor(e.gx, e.gy, y));
          if (e.sheet) {
            const mvx = x - e.px, mvy = y - e.py; e.px = x; e.py = y;
            const moving = Math.hypot(mvx, mvy) > 0.35 && e.state !== 'stunned';
            let vx = mvx, vy = mvy; if (e.state === 'alert' || e.state === 'windup' || e.state === 'recover' || e.state === 'chase') { vx = sx(h.gx, h.gy) - x; vy = sy(h.gx, h.gy) - y; }
            if (Math.hypot(vx, vy) > 2) e.dir = DIR8[(Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) + 8) % 8];
            const key = 'npc_' + d.char + '_' + (moving ? 'walk' : 'idle') + '_' + e.dir;
            if (this.anims.exists(key) && e.spr.anims.currentAnim?.key !== key) e.spr.play(key, true);
            e.spr.setScale(e.baseSc * (wind ? 1.06 : 1), e.baseSc * crouch);
          } else if (!d.inert) { const sxv = sx(h.gx, h.gy) - x; if (Math.abs(sxv) > 6 && e.state !== 'stunned') e.face = sxv > 0 ? 1 : -1; e.spr.setScale(d.scale * e.face * (wind ? 1.08 : 1), d.scale * crouch); }
          if (e.flashUntil && time > e.flashUntil) { e.spr.clearTint(); e.flashUntil = 0; }
          if (wind && !e.spr.isTinted) e.spr.setTint(0xff8888);
          if (!wind && e.state !== 'stunned' && !e.flashUntil && e.spr.isTinted) e.spr.clearTint();
          e.sh.setPosition(x, y); if (e.crown) e.crown.setPosition(x, y - d.h - 14 + Math.sin(time / 200) * 3);
          const showBar = !d.boss && (e.hp < e.maxHp && e.state !== 'idle' || (e.d.inert && e.hp < e.maxHp) || (!d.inert && dist < 9 && e.state !== 'patrol'));
          e.barBg.setVisible(showBar).setPosition(x, y - 118); e.barFill.setVisible(showBar).setPosition(x - 22, y - 118).setSize(Math.max(0, 44 * e.hp / e.maxHp), 5);
          e.mark.setVisible(e.state === 'alert').setPosition(x, y - 138);
          e.stars.setVisible(e.state === 'stunned').setPosition(x + Math.cos(time / 120) * 20, y - 125 + Math.sin(time / 120) * 5).setAngle(time / 4);
          if (wind) this.fxList.push({ type: 'warn', gx: e.gx, gy: e.gy, t0: time, dur: 40, r: e.warnR || d.range + 0.4 });
          if (wind && d.boss && e.atk === 'charge') this.fxList.push({ type: 'line', gx: e.gx, gy: e.gy, tx: e.tgx, ty: e.tgy, t0: time, dur: 40 });
        }
      },

      /* ================= player ================= */
      hurtPlayer(dmg, fromGx, fromGy) {
        const t = this.time.now; if (this.dead || t < this.invulnUntil) return;
        dmg = Math.round(dmg); this.hp = Math.max(0, this.hp - dmg); this.invulnUntil = t + 750; this.hurtLockUntil = t + 180;
        const dx = this.hero.gx - fromGx, dy = this.hero.gy - fromGy, l = Math.hypot(dx, dy) || 1; this.hurtV = { gx: dx / l * 5, gy: dy / l * 5, until: t + 160 };
        this.dog.setTintFill(0xff4a4a); this.time.delayedCall(110, () => { if (!this.dead) this.dog.clearTint(); });
        this.cameras.main.shake(130, 0.006);
        this.floatText(sx(this.hero.gx, this.hero.gy), sy(this.hero.gx, this.hero.gy) - 140, `-${dmg}`, '#ff5a5a', 30);
        Sfx.tone(180, .16, 'sawtooth', .09, -90);
        this.refreshCombatHud(t);
        if (this.hp <= 0) this.playerDown();
      },
      healPlayer(n) { if (this.dead) return; this.hp = Math.min(this.maxHp, this.hp + n); this.floatText(sx(this.hero.gx, this.hero.gy), sy(this.hero.gx, this.hero.gy) - 150, `+${Math.min(n, 999)}`, '#7dffb0', 24); this.refreshCombatHud(this.time.now); },
      playerDown() {
        this.dead = true; this.dashing = false; this.say('윽… 쓰러졌다…', 2000);
        this.dog.stop(); if (!this.playCustom('ko', this.lastDir, 1.5)) { this.tweens.add({ targets: this.dog, angle: 88, duration: 380, ease: 'Cubic.out' }); } this.dog.setTint(0xd0d0e0);
        this.toast('쓰러졌다… 본부에서 깨어난다', 2400);
        this.time.delayedCall(2300, () => {
          this.dead = false; this.dog.clearTint(); this.dog.setAngle(0); this.dog.setFlipX(false); this.dog.anims.timeScale = 1; this.hero.gx = 13.5; this.hero.gy = 13.5;
          this.hp = Math.ceil(this.maxHp * 0.6); this.invulnUntil = this.time.now + 1500; this.cameras.main.flash(300, 255, 255, 255);
          for (const e of this.enemies) if (e.state !== 'dead' && !e.d.inert) { e.hp = Math.max(e.hp, Math.ceil(e.maxHp * .6)); e.state = 'return'; }
          this.refreshCombatHud(this.time.now);
        });
        this.refreshCombatHud(this.time.now);
      },
      addXp(n) {
        if (this.lvl >= MAX_LVL) return; this.xp += n;
        while (this.lvl < MAX_LVL && this.xp >= XP_NEED[this.lvl]) {
          this.lvl++; this.calcStats(); this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * 0.35));
          this.levelUpFx();
        }
        this.refreshCombatHud(this.time.now);
      },
      levelUpFx() {
        const x = sx(this.hero.gx, this.hero.gy), y = sy(this.hero.gx, this.hero.gy);
        this.addFx({ type: 'ring', x, y, t0: this.time.now, dur: 700, R: 150, color: 0xffe066, w: 6 });
        this.burst(x, y - 90, ['⭐', '✨', '🎉'], 16); Sfx.fanfare(); if (!this.dead && !this.dashing) { this.happyUntil = this.time.now + 1500; this.playCustom('happy', this.lastDir, 1.3); }
        this.toast(`LEVEL UP!  Lv.${this.lvl}  (최대체력 ${this.maxHp} · 공격력 ${this.atk})`, 3200);
        const t = this.add.text(x, y - 180, 'LEVEL UP!', { fontFamily: '"Jua","Malgun Gothic",sans-serif', fontSize: '44px', color: '#ffe066', stroke: '#b5640c', strokeThickness: 8 }).setOrigin(.5).setDepth(99995);
        this.tweens.add({ targets: t, y: y - 250, alpha: 0, scale: 1.3, duration: 1400, ease: 'Cubic.out', onComplete: () => t.destroy() });
      },

      /* ================= skills ================= */
      updateSkillInput(time) {
        if (this.state !== 'play' || this.dead) return;
        if ((this.hit('KeyJ') || this.kJ.isDown || (window.__touch && window.__touch.j)) && time >= this.cd.bite) this.doBite(time);
        if (this.hit('KeyK')) this.doDash(time);
        if (this.hit('KeyL')) this.doBark(time);
        if (this.hit('KeyR')) { this.toast('🔒 조직원 호출은 아직 사용할 수 없다 (동료 시스템 개방 후)', 2200); Sfx.tone(160, .12, 'square', .05); }
      },
      aimAssist() {
        let best = null, bd = 3.2;
        for (const e of this.enemies) { if (e.state === 'dead') continue; const d = Math.hypot(e.gx - this.hero.gx, e.gy - this.hero.gy); if (d < bd) { bd = d; best = e; } }
        if (best) { const dxs = sx(best.gx, best.gy) - sx(this.hero.gx, this.hero.gy), dys = sy(best.gx, best.gy) - sy(this.hero.gx, this.hero.gy); this.lastDir = DIR8[(Math.round(Math.atan2(dys, dxs) / (Math.PI / 4)) + 8) % 8]; }
        return best;
      },
      useTut(k) { if (!this.tut[k]) { this.tut[k] = true; if (this.stage === 2) { this.setStage(2); if (this.tut.bite && this.tut.dash && this.tut.bark) this.finishTutorial(); } } },
      finishTutorial() {
        this.time.delayedCall(700, () => {
          if (this.stage !== 2) return;
          this.setStage(3); this.toast('훈련 완료! 골목 상점가의 캣 패밀리를 쓰러뜨려라 ⚔', 3500); Sfx.fanfare(); this.addXp(15); this.score += 100; this.updateHud();
          if (this.dummy) { this.dummy.state = 'dead'; this.dummy.spr.destroy(); this.dummy.sh.destroy(); this.dummy.barBg.destroy(); this.dummy.barFill.destroy(); this.dummy.mark.destroy(); this.dummy.stars.destroy(); this.burst(sx(this.dummy.gx, this.dummy.gy), sy(this.dummy.gx, this.dummy.gy) - 60, ['💨', '✨'], 8); }
          this.spawnCatPack();
        });
      },
      doBite(time) {
        const fv0 = this.aimAssist(), fv = this.faceVec();
        this.combo = time - this.lastBite < 800 ? (this.combo % 3) + 1 : 1; this.lastBite = time;
        this.cd.bite = time + SK.bite.cd * this.cdScale; this.atkLockUntil = time + 190;
        this.lungeV = { gx: fv.gx * 5.2, gy: fv.gy * 5.2, until: time + 110 };
        this.atkAnim = true; if (!this.playCustom('bite', this.lastDir, 4.2)) this.play('run', this.lastDir); this.time.delayedCall(480, () => { this.atkAnim = false; });
        const hx = sx(this.hero.gx + fv.gx * .9, this.hero.gy + fv.gy * .9), hy = sy(this.hero.gx + fv.gx * .9, this.hero.gy + fv.gy * .9);
        this.addFx({ type: 'arc', x: hx, y: hy - 30, fv, t0: time, dur: 170, combo: this.combo });
        Sfx.noise(.07, .09, 1800); Sfx.tone(this.combo === 3 ? 380 : 520, .07, 'square', .05, -220);
        this.useTut('bite');
        const comb = this.combo, big = comb === 3;
        this.time.delayedCall(70, () => {
          for (const e of this.enemies) {
            if (e.state === 'dead') continue; const dx = e.gx - this.hero.gx, dy = e.gy - this.hero.gy, d = Math.hypot(dx, dy);
            if (d > SK.bite.range + e.r + (big ? 0.25 : 0)) continue; if ((dx * fv.gx + dy * fv.gy) / (d || 1) < SK.bite.dot && d > 0.5) continue;
            this.damageEnemy(e, this.atk * (big ? 1.7 : 1) * (0.92 + Math.random() * .16) * this.power, this.hero, { kb: big ? 2.2 : 1.1, big });
          }
        });
        if (big) { this.cameras.main.shake(90, 0.004); this.say('콰직!', 500); }
        this.refreshCombatHud(time);
      },
      doDash(time) {
        if (time < this.cd.dash || this.dashing) { if (time < this.cd.dash) Sfx.tone(140, .08, 'square', .04); return; }
        this.aimAssistSoft(); const fv = this.faceVec();
        this.dashing = true; this.dashDir = fv; this.dashUntil = time + SK.dash.time; this.dashHit = new Set(); this.dashT = 0;
        this.cd.dash = time + SK.dash.cd * this.cdScale; this.invulnUntil = Math.max(this.invulnUntil, time + SK.dash.time + 60);
        this.play('run', this.lastDir); Sfx.noise(.25, .07, 400); Sfx.tone(300, .25, 'sawtooth', .05, 500);
        this.useTut('dash'); this.refreshCombatHud(time);
      },
      aimAssistSoft() { /* dash keeps movement direction; no auto-turn */ },
      doBark(time) {
        if (time < this.cd.bark) { Sfx.tone(140, .08, 'square', .04); return; }
        this.cd.bark = time + SK.bark.cd * this.cdScale; this.atkLockUntil = time + 260;
        const x = sx(this.hero.gx, this.hero.gy), y = sy(this.hero.gx, this.hero.gy);
        this.addFx({ type: 'ring', x, y, t0: time, dur: 520, R: SK.bark.radius * TW / 2 * 1.42, color: 0xfff1a8, w: 8, iso: true });
        this.addFx({ type: 'ring', x, y, t0: time + 90, dur: 520, R: SK.bark.radius * TW / 2 * 1.42, color: 0xffffff, w: 4, iso: true });
        this.cameras.main.shake(200, 0.007); Sfx.bark(); Sfx.noise(.3, .08, 300);
        this.tweens.add({ targets: this.dog, scaleX: this.dogScale * .92, scaleY: this.dogScale * 1.14, duration: 110, yoyo: true, repeat: 1 });
        const t = this.add.text(x, y - 150, '왕!!', { fontFamily: '"Jua","Malgun Gothic",sans-serif', fontSize: '52px', color: '#fff6c8', stroke: '#c1272d', strokeThickness: 9 }).setOrigin(.5).setDepth(99996);
        this.tweens.add({ targets: t, scale: 1.8, alpha: 0, y: y - 190, duration: 600, ease: 'Cubic.out', onComplete: () => t.destroy() });
        this.useTut('bark');
        for (const e of this.enemies) {
          if (e.state === 'dead') continue; const d = Math.hypot(e.gx - this.hero.gx, e.gy - this.hero.gy); if (d > SK.bark.radius + e.r) continue;
          this.damageEnemy(e, SK.bark.dmg * this.power, this.hero, { kb: 1.6, stun: e.d.inert ? 0 : SK.bark.stun, big: false });
        }
        this.refreshCombatHud(time);
      },

      /* ================= effects ================= */
      addFx(f) { this.fxList.push(f); },
      floatText(x, y, text, color, size = 26) {
        const t = this.add.text(x, y, String(text), { fontFamily: '"Jua","Malgun Gothic",sans-serif', fontSize: size + 'px', color, stroke: '#1b1530', strokeThickness: 5 }).setOrigin(.5).setDepth(99995);
        this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 750, ease: 'Cubic.out', onComplete: () => t.destroy() });
      },
      hitSpark(x, y, big) {
        for (let i = 0; i < (big ? 9 : 5); i++) {
          const s = this.add.image(x, y, 'spark').setDepth(99993).setScale(big ? .8 : .55).setTint(big ? 0xffd24a : 0xffffff), a = Math.random() * 6.28, d = 30 + Math.random() * 40;
          this.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * .6, alpha: 0, scale: .1, duration: 320, onComplete: () => s.destroy() });
        }
      },
      drawFx(time) {
        const g = this.fxg; g.clear();
        this.fxList = this.fxList.filter(f => time - f.t0 < f.dur);
        for (const f of this.fxList) {
          const p = Math.max(0, (time - f.t0) / f.dur);
          if (f.type === 'ring') {
            const r = f.R * (1 - Math.pow(1 - p, 2)), a = 1 - p; g.lineStyle(f.w * (1 - p * .6), f.color, a); g.strokeEllipse(f.x, f.y, r * 2, r);
            g.fillStyle(f.color, a * .12); g.fillEllipse(f.x, f.y, r * 2, r);
          } else if (f.type === 'arc') {
            const th = ang(f.fv.gx - f.fv.gy, (f.fv.gx + f.fv.gy) * .5 * 2) , R = 78, a = 1 - p;   // plane angle of facing
            const sweep = (f.combo === 2 ? -1 : 1) * (p * 2 - 1) * 1.1;
            g.lineStyle(14 * (1 - p * .5), f.combo === 3 ? 0xffd24a : 0xffffff, a);
            g.beginPath(); for (let i = 0; i <= 14; i++) { const t = th + sweep + (i / 14 - .5) * 1.7; const px = f.x + Math.cos(t) * R, py = f.y + Math.sin(t) * R * .5; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.strokePath();
          } else if (f.type === 'claw') {
            const x1 = sx(f.tx, f.ty), y1 = sy(f.tx, f.ty) - 50, a = 1 - p; g.lineStyle(5, 0xff6a6a, a);
            for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x1 - 28 + i * 12, y1 - 24); g.lineTo(x1 + 24 + i * 12, y1 + 24); g.strokePath(); }
          } else if (f.type === 'line') {
            g.lineStyle(34, 0xff3b3b, .26); g.beginPath(); g.moveTo(sx(f.gx, f.gy), sy(f.gx, f.gy)); g.lineTo(sx(f.tx, f.ty), sy(f.tx, f.ty)); g.strokePath();
            g.lineStyle(4, 0xff6a6a, .8); g.beginPath(); g.moveTo(sx(f.gx, f.gy), sy(f.gx, f.gy)); g.lineTo(sx(f.tx, f.ty), sy(f.tx, f.ty)); g.strokePath();
          } else if (f.type === 'warn') {
            const x = sx(f.gx, f.gy), y = sy(f.gx, f.gy), r = f.r * TW / 2 * 1.42; g.fillStyle(0xff3b3b, .22); g.fillEllipse(x, y, r * 2, r); g.lineStyle(3, 0xff5a5a, .8); g.strokeEllipse(x, y, r * 2, r);
          }
        }
      },

      /* ================= per frame ================= */
      updateCombat(time, dt) {
        if (this.state === 'pause') return;
        const h = this.hero;
        if (this.lungeV && time < this.lungeV.until) this.moveHero(this.lungeV.gx * dt / 1000, this.lungeV.gy * dt / 1000);
        if (this.hurtV && time < this.hurtV.until) this.moveHero(this.hurtV.gx * dt / 1000, this.hurtV.gy * dt / 1000);
        if (this.dashing) {
          const sp = SK.dash.dist / (SK.dash.time / 1000), step = sp * dt / 1000;
          const hits = this.moveHero(this.dashDir.gx * step, this.dashDir.gy * step);
          this.dashT += dt; const x = sx(h.gx, h.gy), y = sy(h.gx, h.gy);
          if (!this._lastGhost || time - this._lastGhost > 38) { this._lastGhost = time; const gimg = this.add.image(this.dog.x, this.dog.y, this.dog.texture.key, this.dog.frame.name).setOrigin(.5, .95).setScale(this.dog.scaleX, this.dog.scaleY).setDepth(this.dog.depth - 1).setAlpha(.5).setTint(0xaee6ff); this.tweens.add({ targets: gimg, alpha: 0, duration: 260, onComplete: () => gimg.destroy() }); }
          for (const e of this.enemies) {
            if (e.state === 'dead' || this.dashHit.has(e)) continue;
            if (Math.hypot(e.gx - h.gx, e.gy - h.gy) < 0.95 + e.r * .5) { this.dashHit.add(e); this.damageEnemy(e, SK.dash.dmg * this.power, { gx: h.gx - this.dashDir.gx, gy: h.gy - this.dashDir.gy }, { kb: SK.dash.kb, big: true, stun: e.d.inert ? 0 : 450 }); this.cameras.main.shake(110, 0.006); }
          }
          if (hits > 0 && this.dashT > 40) { this.dashing = false; this.cameras.main.shake(120, 0.005); this.burst(x, y - 40, ['💥'], 2); this.floatText(x, y - 120, 'BONK!', '#ffd24a', 28); Sfx.tone(120, .12, 'square', .07); }
          if (time >= this.dashUntil) this.dashing = false;
        }
        this.updateEnemies(time, dt);
        this.drawFx(time); this.refreshBossHud();
        this.refreshCombatHud(time);
      },

      /* ================= HUD ================= */
      refreshCombatHud(time) {
        const u = this.ui; if (!u) return;
        u.hpFill.style.width = (100 * this.hp / this.maxHp) + '%'; u.hpFill.classList.toggle('low', this.hp < this.maxHp * 0.3);
        u.hpText.textContent = `${Math.ceil(this.hp)} / ${this.maxHp}`;
        const lo = XP_NEED[this.lvl - 1], hi = XP_NEED[this.lvl] ?? XP_NEED[MAX_LVL - 1];
        u.xpFill.style.width = this.lvl >= MAX_LVL ? '100%' : (100 * (this.xp - lo) / (hi - lo)) + '%';
        u.lvl.textContent = 'Lv.' + this.lvl + (this.lvl >= MAX_LVL ? ' MAX' : '');
        for (const k of ['bite', 'dash', 'bark', 'crew']) {
          const el = u.sk[k]; if (!el) continue; const total = (k === 'bite' ? SK.bite.cd : SK[k].cd) * this.cdScale;
          const rem = Math.max(0, (this.cd[k] || 0) - (time || 0)), frac = k === 'crew' ? 1 : rem / total;
          el.querySelector('.cdo').style.height = (frac * 100) + '%';
          el.querySelector('.cdt').textContent = k === 'crew' ? '🔒' : (rem > 250 ? (rem / 1000).toFixed(rem > 9500 ? 0 : 1) : '');
          el.classList.toggle('ready', rem <= 0 && k !== 'crew');
        }
      },
      zoneAt(gx, gy) { return this.zones.find(z => gx >= z.x0 && gx < z.x1 && gy >= z.y0 && gy < z.y1) || this.zones[0]; },
      updateZoneHud() {
        const z = this.zoneAt(this.hero.gx, this.hero.gy);
        if (z !== this.curZone) {
          this.curZone = z; const o = OWNERS[z.owner];
          $('zone-name').textContent = z.name; const b = $('zone-owner'); b.textContent = o.name; b.style.background = o.color;
          if (this.state === 'play' && z.owner !== 'rakkung' && z.owner !== 'neutral') this.toast(`⚠ ${z.name} — ${o.name} 구역`, 1800);
        }
      },
    });
  },
};
