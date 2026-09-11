// game.js — Simulation. Bewusst DOM-frei: main.js liefert Input und zeichnet,
// die Tests in Node fahren dieselbe Logik ohne Browser.
import { TILE, VIEW_W, VIEW_H, OUTFITS, PHYS, TUNE, BPM_BASE, BPM_TENOR } from './config.js';
import { SPRITES, OUTFIT_PALETTES } from './sprites.js';
import { spriteCanvas, blit, hash2 } from './render.js';

const ITEM_DEFS = {
  bierdeckel: { spr: 'bierdeckel', w: 8, h: 8, label: 'BIERDECKEL' },
  ohropax: { spr: 'ohropax', w: 8, h: 6, label: 'OHROPAX' },
  wasser: { spr: 'wasser', w: 6, h: 10, label: 'WASSERFLASCHE' },
  mappe: { spr: 'mappe', w: 12, h: 12, label: 'NOTENMAPPE' },
  bier: { spr: 'bier', w: 10, h: 13, label: 'FEIERABENDBIER' },
};

const ENEMY_KINDS = new Set(['piccolo', 'sopran', 'tenor', 'koffer']);
const SOPRAN_RANGE = 160;
const SOPRAN_CONE_H = 22;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const overlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export class Game {
  constructor({ level, input, audio, events = () => {} }) {
    this.level = level;
    this.input = input;
    this.audio = audio || { play() {}, resume() {} };
    this.events = events;
    this.cam = { x: 0, y: 0 };
    this.shake = 0;
    this.prevJump = false;
    this.prevAction = false;
    this.reset('schwarz');
  }

  // ---------------------------------------------------------------- Setup --
  reset(outfitId = 'schwarz') {
    this.grid = this.level.grid.map((r) => r.slice());
    this.entities = this.level.spawns
      .filter((s) => !s.isSpawn && s.kind !== 'lamp')
      .map((s) => this.makeEntity(s));
    this.gates = this.level.gates.map((g) => ({ ...g, open: false, notified: -99 }));
    this.projectiles = [];
    this.particles = [];
    this.morschTimers = [];
    this.time = 0;
    this.beats = 0;
    this.beatPhase = 0;
    this.bpm = BPM_BASE;
    this.nerves = 3;
    this.maxNerves = 3;
    this.heat = 0;
    this.ohropax = 0;
    this.glanz = 0;
    this.slowField = 0;
    this.invuln = 0;
    this.stunTimer = 0;
    this.frackOffUsed = false;
    this.frackBoost = 0;
    this.taktHits = 0;
    this.deckel = 0;
    this.hasMappe = false;
    this.standCooldown = 0;
    this.hint = null;
    this.pauseReason = null;
    this.goalNote = -99;
    this.lastTritt = null;
    this.state = 'play';
    this.stats = { time: 0, deckel: 0, taktHits: 0, akt: 1 };

    const sp = this.level.spawns.find((s) => s.isSpawn);
    this.checkpoint = {
      x: sp.tx * TILE,
      y: (sp.walkRow + 1) * TILE - PHYS.playerH,
    };
    this.outfit = OUTFITS[outfitId] || OUTFITS.schwarz;
    this.player = {
      x: this.checkpoint.x, y: this.checkpoint.y,
      w: PHYS.playerW, h: PHYS.playerH,
      vx: 0, vy: 0, dir: 1,
      onGround: false, coyote: 0, jumpBuf: 0,
      invuln: 0, flash: 0, animT: 0,
      standingMorsch: null, morschT: 0,
    };
    this.lastCheckpointId = 'spawn';
    this.cam.x = clamp(this.player.x - VIEW_W / 2, 0, this.level.w * TILE - VIEW_W);
    this.cam.y = clamp(this.player.y - VIEW_H / 2, 0, this.level.h * TILE - VIEW_H);
    this.hud = this.buildHud();
  }

  makeEntity(s) {
    const def = ITEM_DEFS[s.item];
    switch (s.kind) {
      case 'item':
        return {
          kind: 'item', item: s.item, spr: def.spr,
          w: def.w, h: def.h,
          x: s.tx * TILE + (TILE - def.w) / 2,
          y: (s.walkRow + 1) * TILE - def.h,
          alive: true, bob: Math.random() * 6.28,
        };
      case 'stand':
        return { kind: 'stand', x: s.tx * TILE, y: s.walkRow * TILE, w: TILE, h: TILE, alive: true };
      case 'checkpoint':
        return { kind: 'checkpoint', id: s.id, x: s.tx * TILE, y: s.walkRow * TILE, w: TILE, h: TILE, alive: true, taken: false, active: false };
      case 'piccolo':
        return { kind: 'piccolo', x: s.tx * TILE, y: (s.walkRow + 1) * TILE - 15, w: 14, h: 15, patrol: s.patrol, dir: s.dir ?? -1, alive: true, stun: 0, flash: 0, bob: Math.random() * 6.28, vx: 0 };
      case 'sopran':
        return { kind: 'sopran', x: s.tx * TILE, y: (s.walkRow + 1) * TILE - 19, w: 12, h: 19, dir: s.dir ?? -1, alive: true, stun: 0, flash: 0, phase: 'idle', t: 1.1, bob: Math.random() * 6.28 };
      case 'tenor':
        return { kind: 'tenor', x: s.tx * TILE, y: (s.walkRow + 1) * TILE - 16, w: 14, h: 16, patrol: s.patrol, dir: s.dir ?? -1, alive: true, stun: 0, flash: 0, bob: Math.random() * 6.28 };
      case 'koffer':
        return { kind: 'koffer', x: s.tx * TILE, y: (s.walkRow + 1) * TILE - 12, w: 16, h: 12, patrol: s.patrol, dir: 1, alive: true, stun: 0, flash: 0, bob: 0, wait: 0 };
      default:
        return { kind: s.kind, x: s.tx * TILE, y: s.walkRow * TILE, w: TILE, h: TILE, alive: true };
    }
  }

  spr(name, palette) { return spriteCanvas(name, SPRITES[name], palette); }

  // ----------------------------------------------------------- Steuerung --
  setOutfit(id) {
    if (!OUTFITS[id]) return;
    this.outfit = OUTFITS[id];
    this.standCooldown = 1.0;
    this.message(`UMGEZOGEN: ${this.outfit.label}`);
  }
  pause(reason = 'user') { if (this.state === 'play') { this.state = 'paused'; this.pauseReason = reason; } }
  resume() { if (this.state === 'paused') { this.state = 'play'; this.pauseReason = null; } }
  respawnFromCheckpoint() {
    const p = this.player;
    p.x = this.checkpoint.x; p.y = this.checkpoint.y;
    p.vx = 0; p.vy = 0; p.h = PHYS.playerH;
    this.nerves = this.maxNerves;
    this.heat = Math.min(this.heat, 40);
    this.invuln = 1.5;
    this.state = 'play';
  }
  /** prio 1 = laufendes Spielgeschehen, prio 0 = allgemeiner Kontexttip. */
  message(text, dur = 4.5, prio = 1) {
    if (this.hint && this.hint.prio > prio && this.time - this.hint.at < 2) return;
    this.hint = { text, until: this.time + dur, prio, at: this.time };
  }

  // ------------------------------------------------------------ Simulation --
  update(dt) {
    if (this.state === 'complete') {
      this.time += dt; this.updateParticles(dt); this.updateCamera(dt); this.updateTakt(dt); this.hud = this.buildHud();
      return;
    }
    if (this.state !== 'play') return;
    this.time += dt;
    this.updatePlayer(dt);
    this.updateTakt(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateHeat(dt);
    this.updateMorsch(dt);
    this.updateTriggers(dt);
    this.updateParticles(dt);
    this.updateCamera(dt);
    this.updateHints();
    if (this.frackBoost > 0) this.frackBoost -= dt;
    if (this.standCooldown > 0) this.standCooldown -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    this.stats.time = this.time;
    this.stats.deckel = this.deckel;
    this.stats.taktHits = this.taktHits;
    this.hud = this.buildHud();
  }

  updatePlayer(dt) {
    const p = this.player;
    const inp = this.input;
    const frozen = this.stunTimer > 0;
    if (frozen) { this.stunTimer -= dt; }
    const axis = frozen ? 0 : inp.axis();
    const slow = 1 - 0.42 * this.slowField;
    const boost = this.frackBoost > 0 ? 1.35 : 1;
    const speed = this.outfit.speed * slow * boost;

    // Ducken verändert die Trefferfläche
    const wantDuck = !frozen && inp.down() && p.onGround;
    const targetH = wantDuck ? PHYS.duckH : PHYS.playerH;
    if (targetH !== p.h) {
      const bottom = p.y + p.h;
      if (targetH < p.h || this.canStand()) {
        p.h = targetH;
        p.y = bottom - p.h;
      }
    }

    const target = axis * speed;
    const rate = (axis !== 0 ? PHYS.accel : PHYS.friction) * dt;
    p.vx += clamp(target - p.vx, -rate, rate);
    if (axis === 0 && Math.abs(p.vx) < 5) p.vx = 0;
    if (axis !== 0) p.dir = axis > 0 ? 1 : -1;

    if (p.onGround) p.coyote = PHYS.coyote; else p.coyote = Math.max(0, p.coyote - dt);
    const jumpNow = inp.jump() && !frozen;
    const jumpPressed = jumpNow && !this.prevJump;
    this.prevJump = inp.jump();
    if (jumpPressed) {
      if (inp.down() && p.onGround && p.standingOneway) {
        p.y += 2; p.vy = 24; p.onGround = false;
      } else {
        p.jumpBuf = PHYS.buffer;
      }
    } else {
      p.jumpBuf = Math.max(0, p.jumpBuf - dt);
    }
    if (p.jumpBuf > 0 && p.coyote > 0 && !frozen) {
      p.vy = this.outfit.jump;
      p.onGround = false; p.coyote = 0; p.jumpBuf = 0;
      this.audio.play('jump');
    }
    if (!inp.jump() && p.vy < -62) p.vy = -62;

    // Aktion: Frack-Off hat Vorrang, sonst Beton-Tritt
    const actNow = inp.action() && !frozen;
    if (actNow && !this.prevAction) {
      if (this.outfit.id === 'frack' && this.heat > TUNE.frackOffHeat && !this.frackOffUsed) this.frackOff();
      else this.tryTritt();
    }
    this.prevAction = inp.action();

    this.moveAndCollide(dt);
    if (Math.abs(p.vx) > 12 && p.onGround) p.animT += dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.flash > 0) p.flash -= dt;
  }

  canStand() {
    const p = this.player;
    const top = p.y + p.h - PHYS.playerH;
    const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w - 1) / TILE);
    const y0 = Math.floor(top / TILE), y1 = Math.floor((p.y + p.h - 2) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) if (this.tileVal(tx, ty) === 1) return false;
    }
    return true;
  }

  tileVal(tx, ty) {
    if (tx < 0 || tx >= this.level.w) return 1;
    if (ty < 0) return 1;
    if (ty >= this.level.h) return 1;
    return this.grid[ty][tx];
  }

  moveAndCollide(dt) {
    const p = this.player;
    p.standingOneway = false;
    p.x += p.vx * dt;
    // horizontale Auflösung
    const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h - 1) / TILE);
    if (p.vx > 0) {
      const tx = Math.floor((p.x + p.w - 1) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        if (this.tileVal(tx, ty) === 1) { p.x = tx * TILE - p.w; p.vx = 0; break; }
      }
    } else if (p.vx < 0) {
      const tx = Math.floor(p.x / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        if (this.tileVal(tx, ty) === 1) { p.x = (tx + 1) * TILE; p.vx = 0; break; }
      }
    }
    // vertikale Auflösung
    const prevBottom = p.y + p.h;
    p.vy = Math.min(PHYS.maxFall, p.vy + PHYS.gravity * dt);
    p.y += p.vy * dt;
    p.onGround = false;
    const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w - 1) / TILE);
    if (p.vy >= 0) {
      const ty = Math.floor((p.y + p.h - 1) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        const v = this.tileVal(tx, ty);
        const top = ty * TILE;
        if (v === 1) {
          p.y = top - p.h; p.vy = 0; p.onGround = true;
        } else if ((v === 2 || v === 3) && prevBottom <= top + 2) {
          p.y = top - p.h; p.vy = 0; p.onGround = true;
          p.standingOneway = true;
          if (v === 3) p.standingMorsch = { tx, ty };
        }
      }
    } else {
      const ty = Math.floor(p.y / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        if (this.tileVal(tx, ty) === 1) { p.y = (ty + 1) * TILE; p.vy = 0; break; }
      }
    }
    // Bodenprüfung knapp unter den Füßen: verhindert Flackern im Stehen und
    // lässt morsche Notenblätter verlässlich durchbrechen.
    const g = this.checkGround();
    p.onGround = !!g;
    p.standingOneway = !!(g && (g.v === 2 || g.v === 3));
    p.standingMorsch = g && g.v === 3 ? { tx: g.tx, ty: g.ty } : null;
  }

  checkGround() {
    const p = this.player;
    const ty = Math.floor((p.y + p.h + 0.5) / TILE);
    const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w - 1) / TILE);
    for (let tx = x0; tx <= x1; tx++) {
      const v = this.tileVal(tx, ty);
      if (v === 1) return { v, tx, ty };
      if ((v === 2 || v === 3) && p.y + p.h <= ty * TILE + 1) return { v, tx, ty };
    }
    return null;
  }

  updateMorsch(dt) {
    const p = this.player;
    if (p.standingMorsch && p.onGround) {
      p.morschT += dt;
      if (p.morschT > TUNE.morschTime) {
        const { tx, ty } = p.standingMorsch;
        this.grid[ty][tx] = 0;
        this.morschTimers.push({ tx, ty, t: TUNE.morschRespawn });
        this.burst(tx * TILE + 8, ty * TILE + 8, '#d8d2bd', 10);
        this.audio.play('morsch');
        p.standingMorsch = null; p.morschT = 0;
      }
    } else {
      p.morschT = 0;
    }
    for (const m of this.morschTimers) {
      m.t -= dt;
      if (m.t <= 0) {
        if (this.grid[m.ty][m.tx] === 0) { this.grid[m.ty][m.tx] = 3; this.burst(m.tx * TILE + 8, m.ty * TILE + 8, '#efe9d4', 6); }
        m.dead = true;
      }
    }
    this.morschTimers = this.morschTimers.filter((m) => !m.dead);
  }

  // ---------------------------------------------------------------- Takt --
  updateTakt(dt) {
    this.bpm = this.slowField > 0.25 ? BPM_TENOR : BPM_BASE;
    this.beatPhase += dt * (this.bpm / 60);
    if (this.beatPhase >= 1) {
      this.beatPhase -= 1;
      this.beats += 1;
      this.onBeat();
    }
  }
  beatAccuracy() { return Math.min(this.beatPhase, 1 - this.beatPhase) * (60 / this.bpm); }
  onBeat() {
    this.audio.play('beat');
    for (const en of this.entities) {
      if (en.kind !== 'piccolo' || !en.alive || en.stun > 0) continue;
      const cx = en.x + en.w / 2, cy = en.y + en.h / 2;
      const dx = (this.player.x + this.player.w / 2) - cx;
      const range = 250 * (this.glanz > 0.5 ? 1.4 : 1);
      if (Math.sign(dx) !== en.dir && Math.abs(dx) > 8) continue;
      if (Math.abs(dx) > range || Math.abs((this.player.y + this.player.h / 2) - cy) > 40) continue;
      this.projectiles.push({
        kind: 'sound', x: cx + en.dir * 8, y: cy - 3, w: 12, h: 8,
        vx: en.dir * 135, life: 2.6, dmg: 1,
      });
      en.flash = 0.15;
    }
  }

  tryTritt() {
    const p = this.player;
    const acc = this.beatAccuracy();
    const inTakt = acc <= TUNE.trittWindow;
    this.audio.play('tritt');
    this.shake = Math.max(this.shake, 2.5);
    for (let i = 0; i < 6; i++) {
      this.burst(p.x + p.w / 2, p.y + p.h - 1, '#6b6152', 1);
    }
    let hits = 0;
    for (const en of this.entities) {
      if (!en.alive || !ENEMY_KINDS.has(en.kind)) continue;
      const dx = Math.abs((en.x + en.w / 2) - (p.x + p.w / 2));
      const dy = Math.abs((en.y + en.h / 2) - (p.y + p.h / 2));
      if (dx < TUNE.trittRange && dy < 34) {
        if (inTakt) { en.stun = TUNE.trittStun; en.flash = 0.3; hits++; }
      }
    }
    if (inTakt && hits > 0) {
      this.taktHits += hits;
      this.heat = Math.max(0, this.heat - 4);
      this.message(`IM TAKT! ${hits} GERADE AUS DEM KONZEPT`);
    } else if (inTakt) {
      this.message('IM TAKT — ABER NIEMAND IN REICHWEITE');
    } else {
      this.message('DANEBEN. DER TAKT IST DIE MITTE DES PULSES');
    }
    this.lastTritt = { inTakt, hits };
  }

  frackOff() {
    this.frackOffUsed = true;
    this.heat = 0;
    this.frackBoost = TUNE.frackOffBoost;
    this.audio.play('frackoff');
    this.shake = 5;
    for (let i = 0; i < 26; i++) this.burst(this.player.x + 5, this.player.y + 8, i % 2 ? '#f0eee4' : '#191622', 1);
    this.message('FRACK-OFF. WEISSE WESTE, FREIE SCHULTERN, ENDLICH LUFT');
  }

  // -------------------------------------------------------------- Gegner --
  updateEnemies(dt) {
    let slowActive = false;
    const p = this.player;
    for (const en of this.entities) {
      if (!en.alive) continue;
      if (en.stun > 0) en.stun -= dt;
      if (en.flash > 0) en.flash -= dt;
      en.bob += dt * 3;
      switch (en.kind) {
        case 'piccolo': {
          if (en.stun <= 0 && en.patrol) {
            en.x += en.dir * 20 * dt;
            if (en.x < en.patrol[0] * TILE) { en.x = en.patrol[0] * TILE; en.dir = 1; }
            if (en.x + en.w > (en.patrol[1] + 1) * TILE) { en.x = (en.patrol[1] + 1) * TILE - en.w; en.dir = -1; }
          }
          if (overlap(p, en)) this.damage(1, en.x);
          break;
        }
        case 'koffer': {
          // Rollt in Intervallen: an den Enden wartet er — daraus entsteht
          // das Zeitfenster, in dem man vorbei oder drüberspringt.
          if (en.wait > 0) {
            en.wait -= dt;
          } else {
            en.x += en.dir * (en.stun > 0 ? 6 : 22) * dt;
          }
          if (en.patrol) {
            const left = en.patrol[0] * TILE;
            const right = (en.patrol[1] + 1) * TILE - en.w;
            if (en.x <= left) { en.x = left; en.dir = 1; en.wait = 0.9; }
            if (en.x >= right) { en.x = right; en.dir = -1; en.wait = 0.9; }
          }
          // Solides Hindernis: draufstellen oder zur Seite schieben — nie
          // unüberwindbar, denn drüberspringen ist die Lösung.
          if (overlap(p, en)) {
            const pc = p.x + p.w / 2, ec = en.x + en.w / 2;
            if (p.y + p.h < en.y + 8 && p.vy > 0) {
              p.y = en.y - p.h; p.vy = 0; p.onGround = true;
            } else if (pc < ec) {
              p.x = en.x - p.w; if (p.vx > 0) p.vx = 0;
            } else {
              p.x = en.x + en.w; if (p.vx < 0) p.vx = 0;
            }
            if (this.time > (en.knock || 0) + 0.7) { en.knock = this.time; this.audio.play('hurt'); }
          }
          break;
        }
        case 'tenor': {
          if (en.stun <= 0 && en.patrol) {
            en.x += en.dir * 17 * dt;
            if (en.x < en.patrol[0] * TILE) { en.x = en.patrol[0] * TILE; en.dir = 1; }
            if (en.x + en.w > (en.patrol[1] + 1) * TILE) { en.x = (en.patrol[1] + 1) * TILE - en.w; en.dir = -1; }
          }
          const d = Math.hypot((en.x + en.w / 2) - (p.x + p.w / 2), (en.y + en.h / 2) - (p.y + p.h / 2));
          if (d < 110 && en.stun <= 0) {
            slowActive = true;
            if (this.slowField < 0.1) { this.audio.play('tenor'); this.message('DER TENOR VERSCHLEPPT DAS TEMPO'); }
          }
          if (overlap(p, en)) this.damage(1, en.x);
          break;
        }
        case 'sopran': {
          if (en.stun > 0) { en.phase = 'idle'; en.t = 0.6; break; }
          en.t -= dt;
          if (en.phase === 'idle' && en.t <= 0) {
            en.phase = 'windup'; en.t = 1.1;
            this.audio.play('piccolo');
          } else if (en.phase === 'windup' && en.t <= 0) {
            en.phase = 'shriek'; en.t = 0.5;
            this.audio.play('shriek');
            this.shake = Math.max(this.shake, 4);
            const cx = en.x + en.w / 2, cy = en.y + en.h / 2;
            const px = p.x + p.w / 2, py = p.y + p.h / 2;
            const dx = px - cx;
            const inFront = Math.sign(dx) === en.dir || Math.abs(dx) < 6;
            const range = SOPRAN_RANGE * (this.glanz > 0.5 ? 1.3 : 1);
            if (inFront && Math.abs(dx) < range && Math.abs(py - cy) < SOPRAN_CONE_H
              && this.los(cx, cy, px, py) && !this.inAlcove(p) && this.ohropax <= 0) {
              this.damage(2, cx);
              this.message('DAS SOPRAN. LEBENSGEFÄHRLICH LAUT. OHROPAX ODER DECKUNG.');
            }
          } else if (en.phase === 'shriek' && en.t <= 0) {
            en.phase = 'recover'; en.t = 1.4;
          } else if (en.phase === 'recover' && en.t <= 0) {
            en.phase = 'idle'; en.t = 1.6;
          }
          break;
        }
        default: break;
      }
    }
    const wantSlow = slowActive ? 1 : 0;
    this.slowField += (wantSlow - this.slowField) * Math.min(1, dt * 2.5);
    if (this.slowField < 0.01) this.slowField = 0;
  }

  updateProjectiles(dt) {
    const p = this.player;
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt;
      pr.life -= dt;
      const tx = Math.floor((pr.x + pr.w / 2) / TILE);
      const ty = Math.floor((pr.y + pr.h / 2) / TILE);
      if (this.tileVal(tx, ty) === 1) pr.life = 0;
      if (overlap(p, pr)) {
        pr.life = 0;
        if (this.ohropax <= 0) this.damage(pr.dmg, pr.x);
        else this.message('OHROPAX HÄLT. DER SCHALL PRALLT AB.');
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.life > 0);
  }

  // ------------------------------------------------------------- Zustände --
  updateHeat(dt) {
    const p = this.player;
    const light = this.inLight(p);
    const moving = Math.abs(p.vx) > 25;
    let rate = this.outfit.heatBase;
    rate += light ? this.outfit.lightHeat : TUNE.heatShade;
    if (moving) rate += TUNE.heatRun;
    this.heat = clamp(this.heat + rate * dt, 0, TUNE.heatMax);
    this.inLightNow = light;
    if (this.heat >= TUNE.kreislaufAt) {
      this.heat = 62;
      this.stunTimer = 2.2;
      this.shake = 7;
      this.audio.play('collapse');
      this.message('KREISLAUF. DER FRACK HAT GEWONNEN. KURZ DURCHATMEN.');
    }
    const glanzTarget = light && (this.outfit.id === 'frack' || this.heat > 60) ? 1 : 0;
    this.glanz = clamp(this.glanz + (glanzTarget - this.glanz) * Math.min(1, dt * 2), 0, 1);
    if (this.ohropax > 0) this.ohropax = Math.max(0, this.ohropax - dt);
  }

  inLight(p) {
    for (const l of this.level.lights) {
      if (p.x + p.w > l.x && p.x < l.x + l.w && p.y + p.h > l.y && p.y < l.y + l.h) return true;
    }
    return false;
  }
  inAlcove(p) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    for (const a of this.level.alcoves) {
      if (cx > a.x && cx < a.x + a.w && cy > a.y && cy < a.y + a.h) return true;
    }
    return false;
  }
  los(x0, y0, x1, y1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (this.tileVal(Math.floor(x / TILE), Math.floor(y / TILE)) === 1) return false;
    }
    return true;
  }

  updateTriggers(dt) {
    const p = this.player;
    // Itempunkte
    for (const en of this.entities) {
      if (!en.alive) continue;
      if (en.kind === 'item') {
        if (overlap(p, en)) {
          en.alive = false;
          this.collect(en);
        }
        continue;
      }
      if (en.kind === 'checkpoint' && !en.taken && overlap(p, en)) {
        en.taken = true;
        this.checkpoint = { x: en.x + (TILE - p.w) / 2, y: (en.y + TILE) - p.h };
        this.lastCheckpointId = en.id;
        this.message('SPEICHERPUNKT. VON HIER GEHT ES WEITER.');
        this.audio.play('pickup');
        continue;
      }
      if (en.kind === 'stand') {
        // nur beim Betreten auslösen, nicht während man davorsteht
        const now = overlap(p, en);
        const was = !!en.touching;
        en.touching = now;
        if (now && !was && this.standCooldown <= 0) {
          this.standCooldown = 2.0;
          this.pause('stand');
          this.events({ type: 'stand' });
        }
        continue;
      }
    }
    this.entities = this.entities.filter((en) => en.alive);
    // Türen und Bänder
    for (const g of this.gates) {
      if (g.open) continue;
      // Trefferfläche leicht aufweiten: wer gegen die Tür läuft, merkt es auch
      const slot = { x: g.tx * TILE - 3, y: g.ty * TILE, w: g.tw * TILE + 6, h: g.th * TILE };
      if (!overlap(p, slot)) continue;
      if (this.outfit.id === g.need) {
        g.open = true;
        for (let j = g.ty; j < g.ty + g.th; j++) for (let i = g.tx; i < g.tx + g.tw; i++) this.grid[j][i] = 0;
        this.audio.play('gate');
        this.message(g.need === 'anzug' ? 'DIENSTTÜR OFFEN. DER ANZUG MACHT DEN UNTERSCHIED.' : 'ABSperrband BEISEITE. DER FRACK HAT PRESTIGE.');
        g.notified = 0;
      } else if (this.time > g.notified + 3) {
        g.notified = this.time;
        this.message(g.need === 'anzug' ? 'DIE DIENSTTÜR BLEIBT ZU. DAFÜR BRAUCHT ES DEN ANZUG.' : 'DAS ABSperrband HÄLT. NUR IM FRACK GEHT DAS AUF.');
      }
    }
    // Ziel: Materialaufzug
    const goal = this.level.goal;
    if (overlap(p, goal)) {
      if (this.hasMappe) this.complete();
      else if (this.time > (this.goalNote || 0) + 3) {
        this.goalNote = this.time;
        this.message('DER AUFZUG RÜHRT SICH NICHT. OHNE NOTENMAPPE FÄHRT ER NICHT.');
      }
    }
    // Kontexttips
    for (const h of this.level.hints) {
      if (!h.shown && p.x + p.w > h.x) { h.shown = true; this.message(h.text, 6, 0); }
    }
  }

  collect(en) {
    switch (en.item) {
      case 'bierdeckel':
        this.deckel += 1;
        this.audio.play('pickup');
        this.message(`BIERDECKEL ${this.deckel}/${this.level.deckelTotal}`);
        break;
      case 'ohropax':
        this.ohropax = TUNE.ohropaxTime;
        this.audio.play('pickup');
        this.message('OHROPAX. ENDLICH RUHIG. FLÖTEN SIND JETZT DEKORATION.');
        break;
      case 'wasser':
        this.heat = Math.max(0, this.heat - 30);
        this.audio.play('pickup');
        this.message('WASSER. DER FRACK DAMPFT KURZ NICHT.');
        break;
      case 'mappe':
        this.hasMappe = true;
        this.audio.play('pickup');
        this.message('NOTENMAPPE GESICHERT. JETZT ZUM AUFZUG.');
        break;
      default: break;
    }
    this.burst(en.x + en.w / 2, en.y, '#e8c46a', 8);
  }

  damage(n, fromX) {
    const p = this.player;
    if (p.invuln > 0 || this.state !== 'play') return false;
    this.nerves -= n;
    p.invuln = PHYS.invuln;
    p.flash = 0.25;
    p.vx = Math.sign(p.x - (fromX ?? p.x)) * 110;
    p.vy = -90;
    this.invuln = PHYS.invuln;
    this.shake = 6;
    this.audio.play('hurt');
    this.hud = this.buildHud();
    if (this.nerves <= 0) {
      this.nerves = 0;
      this.state = 'collapse';
      this.audio.play('collapse');
      this.events({ type: 'collapse' });
    }
    return true;
  }

  complete() {
    if (this.state !== 'play') return;
    this.state = 'complete';
    this.audio.play('fanfare');
    this.entities.push({
      kind: 'item', item: 'bier', spr: 'bier', w: 10, h: 13,
      x: this.level.goal.x + 22, y: this.level.goal.y + 3 * TILE - 13,
      alive: true, bob: 0,
    });
    this.events({ type: 'complete', stats: { ...this.stats } });
  }

  // ------------------------------------------------------------ Partikel --
  burst(x, y, color, n = 8) {
    if (this.particles.length > 220) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 14 + Math.random() * 60;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 12, life: 0.3 + Math.random() * 0.5, color });
    }
  }
  updateParticles(dt) {
    for (const q of this.particles) {
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vy += 260 * dt; q.vx *= 0.95; q.life -= dt;
    }
    this.particles = this.particles.filter((q) => q.life > 0);
  }

  updateCamera(dt) {
    const p = this.player;
    const tx = clamp(p.x + p.w / 2 - VIEW_W / 2, 0, this.level.w * TILE - VIEW_W);
    const ty = clamp(p.y + p.h / 2 - VIEW_H / 2 + 10, 0, this.level.h * TILE - VIEW_H);
    const k = Math.min(1, dt * 7);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  updateHints() {
    if (this.hint && this.time > this.hint.until) this.hint = null;
  }

  buildHud() {
    return {
      akt: this.level.name,
      nerves: this.nerves,
      maxNerves: this.maxNerves,
      heat: Math.round(this.heat),
      ohropax: this.ohropax,
      outfit: this.outfit,
      deckel: this.deckel,
      deckelTotal: this.level.deckelTotal,
      bpm: this.bpm,
      beatPhase: this.beatPhase,
      glanz: this.glanz,
      hidden: this.inAlcove(this.player),
      inLight: !!this.inLightNow,
      slow: this.slowField > 0.4,
      frackOffUsed: this.frackOffUsed,
      hint: this.hint ? this.hint.text : null,
      state: this.state,
      hasMappe: this.hasMappe,
    };
  }

  // -------------------------------------------------------------- Zeichnen --
  draw(ctx) {
    const sh = this.shake > 0 ? this.shake / 2 : 0;
    const offX = sh ? (Math.random() - 0.5) * sh : 0;
    const offY = sh ? (Math.random() - 0.5) * sh : 0;
    const camX = Math.round(this.cam.x + offX);
    const camY = Math.round(this.cam.y + offY);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 0.4);

    this.drawBackground(ctx, camX, camY);
    this.drawLights(ctx, camX, camY);
    this.drawAlcoves(ctx, camX, camY);
    this.drawTiles(ctx, camX, camY);
    this.drawGates(ctx, camX, camY);
    this.drawGoal(ctx, camX, camY);
    this.drawEntities(ctx, camX, camY);
    this.drawProjectiles(ctx, camX, camY);
    this.drawPlayer(ctx, camX, camY);
    this.drawParticles(ctx, camX, camY);
    this.drawScreenFx(ctx);
  }

  drawBackground(ctx, camX, camY) {
    ctx.fillStyle = '#141021';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // ferne Bogenreihen
    ctx.fillStyle = '#1b1630';
    const farOff = (camX * 0.25) % 96;
    for (let i = -1; i < VIEW_W / 96 + 2; i++) {
      const x = Math.round(i * 96 - farOff);
      for (let j = 0; j < 3; j++) {
        const y = Math.round(24 + j * 68 - camY * 0.12);
        ctx.fillRect(x + 6, y, 34, 54);
      }
    }
    // Rohre und Pfeiler
    ctx.fillStyle = '#191428';
    const midOff = (camX * 0.5) % 128;
    for (let i = -1; i < VIEW_W / 128 + 2; i++) {
      const x = Math.round(i * 128 - midOff);
      ctx.fillRect(x, Math.round(120 - camY * 0.22), 6, 120);
      ctx.fillRect(x + 92, Math.round(96 - camY * 0.22), 4, 140);
    }
    // Staub
    ctx.fillStyle = 'rgba(220,214,190,0.22)';
    for (let i = 0; i < 34; i++) {
      const h1 = hash2(i, 7, 3);
      const h2 = hash2(i, 13, 5);
      const x = Math.round((h1 * 800 - camX * 0.7 + 800) % 800) - 8;
      const y = Math.round((h2 * 460 - camY * 0.7 + Math.sin(this.time * 0.7 + i) * 6 + 460) % 460) - 8;
      ctx.fillRect(x, y, 1, 1);
    }
    // Bodennebel
    ctx.fillStyle = 'rgba(30,24,48,0.55)';
    ctx.fillRect(0, VIEW_H - 26, VIEW_W, 26);
  }

  drawLights(ctx, camX, camY) {
    for (const l of this.level.lights) {
      const x = Math.round(l.x - camX), y = Math.round(l.y - camY);
      const flick = 0.82 + Math.sin(this.time * 5 + l.x) * 0.05;
      ctx.fillStyle = `rgba(255,206,120,${0.05 * flick})`;
      ctx.fillRect(x - 6, y - 4, l.w + 12, l.h + 8);
      ctx.fillStyle = `rgba(255,196,104,${0.09 * flick})`;
      ctx.fillRect(x, y, l.w, l.h);
      // Leuchtkörper
      ctx.fillStyle = '#ffd08a';
      ctx.fillRect(x + l.w / 2 - 4, y - 6, 8, 3);
      ctx.fillStyle = 'rgba(255,208,138,0.35)';
      ctx.fillRect(x + l.w / 2 - 7, y - 3, 14, 2);
    }
  }

  drawAlcoves(ctx, camX, camY) {
    for (const a of this.level.alcoves) {
      const x = Math.round(a.x - camX), y = Math.round(a.y - camY);
      ctx.fillStyle = '#0a0810';
      ctx.fillRect(x, y, a.w, a.h);
      ctx.fillStyle = '#2a2140';
      ctx.fillRect(x, y - 2, a.w, 2);
      ctx.fillStyle = '#3a2f56';
      for (let i = 0; i < a.w; i += 6) ctx.fillRect(x + i, y + 2, 2, a.h - 4);
    }
  }

  drawTiles(ctx, camX, camY) {
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const x1 = Math.min(this.level.w - 1, Math.ceil((camX + VIEW_W) / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const y1 = Math.min(this.level.h - 1, Math.ceil((camY + VIEW_H) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const v = this.grid[ty][tx];
        if (!v) continue;
        const px = Math.round(tx * TILE - camX), py = Math.round(ty * TILE - camY);
        if (v === 1) {
          ctx.fillStyle = '#2b2438';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#332b44';
          const n = 3 + Math.floor(hash2(tx, ty, 1) * 3);
          for (let i = 0; i < n; i++) {
            const hx = Math.floor(hash2(tx, ty, i + 2) * 12);
            const hy = Math.floor(hash2(tx, ty, i + 9) * 14);
            ctx.fillRect(px + hx, py + hy + 1, 4, 2);
          }
          if (this.tileVal(tx, ty - 1) !== 1) {
            ctx.fillStyle = '#453a5c';
            ctx.fillRect(px, py, TILE, 2);
            ctx.fillStyle = '#5d4f78';
            ctx.fillRect(px, py, TILE, 1);
          }
        } else if (v === 2) {
          ctx.fillStyle = '#4d3a22';
          ctx.fillRect(px, py, TILE, 6);
          ctx.fillStyle = '#6b5330';
          ctx.fillRect(px, py, TILE, 2);
          ctx.fillStyle = '#3a2b18';
          ctx.fillRect(px + 5, py + 2, 2, 4);
          ctx.fillRect(px + 11, py + 2, 2, 4);
        } else if (v === 3) {
          const wob = Math.sin(this.time * 3 + tx) * 0.6;
          ctx.fillStyle = '#d9d3bd';
          ctx.fillRect(px, py + 1 + wob, TILE, 5);
          ctx.fillStyle = '#b8b19a';
          ctx.fillRect(px, py + 5 + wob, TILE, 1);
          ctx.fillStyle = '#8e886f';
          for (let i = 2; i < TILE; i += 4) ctx.fillRect(px + i, py + 2 + wob, 2, 1);
          ctx.fillRect(px + 7, py + 1 + wob, 1, 5);
        }
      }
    }
  }

  drawGates(ctx, camX, camY) {
    const spr = this.spr('tuer');
    for (const g of this.gates) {
      const tint = g.need === 'anzug' ? null : { '.': '#0b0810', a: '#241a2e', m: '#8e8e9c', o: '#e8c46a', y: '#e8c46a' };
      for (let j = 0; j < g.th; j++) {
        const px = Math.round(g.tx * TILE - camX);
        const py = Math.round((g.ty + j) * TILE - camY);
        if (g.open) {
          ctx.globalAlpha = 0.22;
          blit(ctx, spr, px, py, false, 0, 0.22);
          ctx.globalAlpha = 1;
        } else {
          blit(ctx, tint ? this.spr('tuer', tint) : spr, px, py);
        }
      }
      if (!g.open) {
        ctx.fillStyle = g.need === 'anzug' ? '#e8c46a' : '#b0392f';
        ctx.fillRect(Math.round(g.tx * TILE - camX) + 6, Math.round(g.ty * TILE - camY) - 4, 4, 3);
      }
    }
  }

  drawGoal(ctx, camX, camY) {
    const g = this.level.goal;
    const x = Math.round(g.x - camX), y = Math.round(g.y - camY);
    ctx.fillStyle = '#0d0a14';
    ctx.fillRect(x + 1, y, TILE - 2, g.h);
    ctx.fillStyle = '#3a3346';
    ctx.fillRect(x, y, 2, g.h);
    ctx.fillRect(x + TILE - 2, y, 2, g.h);
    ctx.fillStyle = '#5de0cf';
    for (let i = 0; i < g.h - 6; i += 6) {
      ctx.fillRect(x + 7, y + 3 + i, 2, 3);
    }
    const pulse = 0.5 + Math.sin(this.time * 4) * 0.5;
    ctx.fillStyle = `rgba(93,224,207,${0.25 + pulse * 0.35})`;
    ctx.fillRect(x + 3, y - 6, TILE - 6, 4);
    if (this.hasMappe) {
      ctx.fillStyle = `rgba(232,196,106,${0.35 + pulse * 0.4})`;
      ctx.fillRect(x + 4, y - 12, TILE - 8, 4);
    }
  }

  drawEntities(ctx, camX, camY) {
    for (const en of this.entities) {
      if (!en.alive) continue;
      const x = Math.round(en.x - camX);
      const y = Math.round(en.y - camY);
      const bob = Math.round(Math.sin(en.bob || 0) * 1);
      switch (en.kind) {
        case 'item': {
          const spr = this.spr(en.spr);
          const by = Math.round(Math.sin(this.time * 3 + (en.bob || 0)) * 1.5);
          blit(ctx, spr, x, y + by);
          break;
        }
        case 'stand': {
          ctx.fillStyle = '#3b2f4a';
          ctx.fillRect(x + 2, y - 12, 12, 12);
          ctx.fillStyle = '#8e8e9c';
          ctx.fillRect(x + 2, y - 14, 12, 2);
          ctx.fillRect(x + 3, y - 26, 10, 12);
          ctx.fillStyle = '#20202a'; ctx.fillRect(x + 4, y - 25, 8, 5);
          ctx.fillStyle = '#f0eee4'; ctx.fillRect(x + 4, y - 19, 8, 3);
          ctx.fillStyle = '#b0392f'; ctx.fillRect(x + 4, y - 16, 8, 3);
          const near = Math.abs((this.player.x + this.player.w / 2) - (en.x + 8)) < 26;
          if (near) {
            ctx.fillStyle = `rgba(93,224,207,${0.4 + Math.sin(this.time * 8) * 0.3})`;
            ctx.fillRect(x + 4, y - 32, 8, 2);
          }
          break;
        }
        case 'checkpoint': {
          const on = this.lastCheckpointId === en.id;
          ctx.fillStyle = on ? '#5de0cf' : '#4a4458';
          ctx.fillRect(x + 6, y - 14, 4, 14);
          ctx.fillStyle = on ? '#9ff3ea' : '#6b6480';
          ctx.fillRect(x + 6, y - 16, 10, 5);
          break;
        }
        case 'piccolo': {
          const spr = this.spr('piccolo');
          blit(ctx, spr, x, y + bob, en.dir < 0, en.flash);
          if (en.stun > 0) this.drawStun(ctx, x + 7, y - 6);
          break;
        }
        case 'tenor': {
          const spr = this.spr('tenor');
          const d = Math.hypot((en.x + en.w / 2) - (this.player.x + this.player.w / 2), (en.y + en.h / 2) - (this.player.y + this.player.h / 2));
          if (d < 110 && en.stun <= 0) {
            ctx.fillStyle = 'rgba(122,75,138,0.16)';
            ctx.fillRect(x - 48, y - 24, 110, 60);
          }
          blit(ctx, spr, x, y + bob, en.dir < 0, en.flash);
          if (en.stun > 0) this.drawStun(ctx, x + 7, y - 6);
          break;
        }
        case 'sopran': {
          const spr = this.spr('sopran');
          if (en.phase === 'windup' || en.phase === 'shriek') {
            const grow = en.phase === 'windup' ? 1 - en.t / 1.1 : 1;
            const range = SOPRAN_RANGE * (this.glanz > 0.5 ? 1.3 : 1) * grow;
            const cx = en.dir > 0 ? x + en.w : x;
            const y0 = y + 5;
            ctx.fillStyle = en.phase === 'shriek' ? 'rgba(255,220,180,0.34)' : 'rgba(255,180,180,0.16)';
            ctx.fillRect(Math.min(cx, cx + en.dir * range), y0, range, SOPRAN_CONE_H);
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            for (let i = 0; i < 4; i++) {
              const d2 = grow * range * (0.25 + i * 0.2);
              ctx.fillRect(Math.round(cx + en.dir * d2), y0 + 4 + (i % 2) * 10, 3, 3);
            }
          }
          blit(ctx, spr, x, y + bob, en.dir < 0, en.flash);
          if (en.stun > 0) this.drawStun(ctx, x + 6, y - 6);
          break;
        }
        case 'koffer': {
          const spr = this.spr('koffer');
          blit(ctx, spr, x, y, en.dir < 0, en.flash);
          break;
        }
        default: break;
      }
    }
  }

  drawStun(ctx, x, y) {
    ctx.fillStyle = '#e8c46a';
    const t = this.time * 6;
    for (let i = 0; i < 3; i++) {
      const a = t + (i * Math.PI * 2) / 3;
      ctx.fillRect(Math.round(x + Math.cos(a) * 7), Math.round(y + Math.sin(a) * 2), 2, 2);
    }
  }

  drawProjectiles(ctx, camX, camY) {
    for (const pr of this.projectiles) {
      const x = Math.round(pr.x - camX), y = Math.round(pr.y - camY);
      ctx.fillStyle = 'rgba(255,208,138,0.85)';
      ctx.fillRect(x, y + 2, pr.w, 3);
      ctx.fillStyle = 'rgba(255,208,138,0.4)';
      ctx.fillRect(x - 4, y + 3, 4, 1);
    }
  }

  drawPlayer(ctx, camX, camY) {
    const p = this.player;
    let frame = 'roland_idle';
    if (p.h === PHYS.duckH) frame = 'roland_duck';
    else if (!p.onGround) frame = 'roland_jump';
    else if (Math.abs(p.vx) > 12) frame = Math.floor(p.animT * 7) % 2 === 0 ? 'roland_walk1' : 'roland_walk2';
    const spr = this.spr(frame, OUTFIT_PALETTES[this.outfit.id]);
    const x = Math.round(p.x - camX - 1);
    const y = Math.round(p.y - camY + p.h - spr.h);
    const blink = p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0;
    if (!blink) blit(ctx, spr, x, y, p.dir < 0, p.flash);
    // Glanzalarm auf dem Haarkranz
    if (this.glanz > 0.25) {
      const a = this.glanz * (0.55 + Math.sin(this.time * 12) * 0.45);
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, a)})`;
      const gx = p.dir < 0 ? x + 3 : x + 6;
      ctx.fillRect(gx, y + 1, 2, 1);
      ctx.fillRect(gx - 1, y + 2, 1, 1);
      ctx.fillRect(gx + 2, y + 2, 1, 1);
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, this.glanz * 0.5)})`;
      ctx.fillRect(gx - 4, y - 1, 8, 1);
    }
    if (this.frackBoost > 0) {
      ctx.fillStyle = `rgba(240,238,228,${0.2 + Math.sin(this.time * 20) * 0.15})`;
      ctx.fillRect(x - 3, y - 4, 18, 24);
    }
  }

  drawParticles(ctx, camX, camY) {
    for (const q of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, q.life * 2.2));
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(q.x - camX), Math.round(q.y - camY), 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  drawScreenFx(ctx) {
    // Taktpuls am Bildrand
    const pulse = Math.max(0, 1 - this.beatPhase * 3.2);
    if (pulse > 0) {
      ctx.fillStyle = `rgba(93,224,207,${0.18 * pulse})`;
      ctx.fillRect(0, 0, VIEW_W, 2);
      ctx.fillRect(0, VIEW_H - 2, VIEW_W, 2);
      ctx.fillRect(0, 0, 2, VIEW_H);
      ctx.fillRect(VIEW_W - 2, 0, 2, VIEW_H);
    }
    // Hitze
    if (this.heat > 45) {
      const a = Math.min(0.5, (this.heat - 45) / 110);
      ctx.fillStyle = `rgba(239,143,58,${a * 0.5})`;
      ctx.fillRect(0, 0, VIEW_W, 10);
      ctx.fillRect(0, VIEW_H - 10, VIEW_W, 10);
      if (this.heat > 70) {
        ctx.fillStyle = `rgba(239,143,58,${a * 0.35 * (0.5 + Math.sin(this.time * 9) * 0.5)})`;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
    }
    // Tempo-Verschleppung
    if (this.slowField > 0.05) {
      ctx.fillStyle = `rgba(40,30,80,${0.3 * this.slowField})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    // Kreislauf
    if (this.stunTimer > 0) {
      const a = 0.25 + Math.sin(this.time * 18) * 0.12;
      ctx.fillStyle = `rgba(232,185,138,${a})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    // Vignette
    ctx.fillStyle = 'rgba(8,6,14,0.35)';
    ctx.fillRect(0, 0, VIEW_W, 8);
    ctx.fillRect(0, VIEW_H - 8, VIEW_W, 8);
  }
}
