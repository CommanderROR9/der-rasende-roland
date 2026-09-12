// game.js — Simulation. Bewusst DOM-frei: main.js liefert Input und zeichnet,
// die Tests in Node fahren dieselbe Logik ohne Browser.
import { TILE, VIEW_DESKTOP, OUTFITS, PHYS, TUNE, DIFFICULTY, BPM_BASE, BPM_TENOR } from './config.js';
import { SPRITES, OUTFIT_PALETTES } from './sprites.js';
import { spriteCanvas, blit, hash2 } from './render.js';

const ITEM_DEFS = {
  bierdeckel: { spr: 'bierdeckel', w: 8, h: 8, label: 'BIERDECKEL' },
  ohropax: { spr: 'ohropax', w: 8, h: 6, label: 'OHROPAX' },
  wasser: { spr: 'wasser', w: 6, h: 10, label: 'WASSERFLASCHE' },
  mappe: { spr: 'mappe', w: 12, h: 12, label: 'NOTENMAPPE' },
  stimmblatt: { spr: 'stimmblatt', w: 10, h: 12, label: 'STIMMBLATT' },
  brezel: { spr: 'brezel', w: 10, h: 7, label: 'BREZEL' },
  bier: { spr: 'bier', w: 10, h: 13, label: 'FEIERABENDBIER' },
};

const ENEMY_KINDS = new Set(['piccolo', 'sopran', 'tenor', 'koffer', 'dirigent']);

// Was ist das, und was macht es? Beim ersten Kontakt einmal erklärt.
const ENEMY_INFO = {
  piccolo: { name: 'PICCOLO', tip: 'PICCOLO — ES SCHIESST SCHALLWELLEN. DRÜBERSPRINGEN ODER IM TAKT TREFFEN (E).' },
  sopran: { name: 'SOPRAN', tip: 'SOPRAN — LEBENSGEFÄHRLICH LAUT. OHROPAX ODER IN EINE NISCHE.' },
  tenor: { name: 'TENOR', tip: 'TENOR — VERSCHLEPPT DAS TEMPO. IM TAKT GETROFFEN IST ER KURZ STILL.' },
  koffer: { name: 'INSTRUMENTENKOFFER', tip: 'INSTRUMENTENKOFFER — ROLLT UND BLOCKIERT. DRÜBERSPRINGEN.' },
  dirigent: { name: 'DIRIGENT', tip: 'DIRIGENT — WIRFT TAKTSTÖCKE IM BOGEN. IM TAKT GETROFFEN VERLIERT ER SIE.' },
};
// Gegnerreichweiten richten sich nach Schwierigkeit und Sichtbreite
const SOPRAN_CONE_H = 22;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const overlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export class Game {
  constructor({ level, input, audio, events = () => {}, view = VIEW_DESKTOP, difficulty = 'gemuetlich' }) {
    this.level = level;
    this.vw = view.w;
    this.vh = view.h;
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'gemuetlich';
    this.diff = DIFFICULTY[this.difficulty];
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
    // Versenkungen sind eigene Objekte (nicht aus den Spawn-Daten)
    for (const el of this.level.elevators || []) this.entities.push(this.makeLift(el));
    this.gates = this.level.gates.map((g) => ({ ...g, open: false, notified: -99 }));
    this.projectiles = [];
    this.particles = [];
    this.morschTimers = [];
    this.time = 0;
    this.beats = 0;
    this.beatPhase = 0;
    this.bpm = this.level.bpm || BPM_BASE;
    this.taktBpm = this.level.bpm || BPM_BASE;
    this.nerves = 3;
    this.maxNerves = 3;
    this.heat = 0;
    this.ohropax = 0;
    this.glanz = 0;
    this.slowField = 0;
    this.invuln = 0;
    this.stunTimer = 0;
    this.frackOffUsed = false;
    this.frackAbgelegt = false;   // Frack wirklich ausgezogen (Befund D4)
    this.setzen = false;          // im Kleingarten auf der Bank Platz genommen
    this.stimmblaetter = 0;       // gesammelte Stimmblätter (DRR-04)
    this.stimmblaetterNoetig = this.level.stimmblaetterNoetig || 0;
    this.mappeAbgegeben = false;  // Mappe liegt auf dem Dirigentenpult (Akt 2)
    this.einsatzGelungen = false; // erster gemeinsamer Einsatz in Akt 2 (DRR-04)
    // Level-lokale Storyflags: dieselben NPC-/Journalbausteine funktionieren
    // in weiteren Akten ohne Spezialfälle in main.js.
    this.storyFlags = new Set(this.level.initialStoryFlags || []);
    this.frackBoost = 0;
    this.taktHits = 0;
    this.deckel = 0;
    this.hasMappe = false;
    this.standCooldown = 0;
    this.hint = null;
    this.pauseReason = null;
    this.goalNote = -99;
    this.met = {};
    this.hintQueue = [];
    this.taktChanges = (this.level.takts || []).map((t) => ({ ...t, done: false }));
    // Wetter (Akt 3): Sonne, Wind, Regen, Kälte im Wechsel
    this.dunkel = this.level.dark ? (this.difficulty === 'gemuetlich' ? 0.80 : 0.90) : 0;
    this.applaus = 0;
    this.movingLights = (this.level.movingLights || []).map((l) => ({ ...l }));
    this.grillFrei = 0;
    this.spuk = (this.level.spooks || []).map((sp) => ({ ...sp, done: false }));
    this.wetter = (this.level.weather || []).map((w) => ({ ...w }));
    this.wetterIdx = -1;
    this.wetterTimer = 0;
    this.wetterKind = null;
    this.nass = 0;
    this.gustDir = 0;
    this.gustTimer = 0;
    this.gustWarn = 0;
    this.blaetter = [];
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
      invuln: 0, flash: 0, animT: 0, dropTimer: 0,
      standingMorsch: null, morschT: 0,
    };
    this.lastCheckpointId = 'spawn';
    this.cam.x = clamp(this.player.x - this.vw / 2, 0, this.level.w * TILE - this.vw);
    this.cam.y = clamp(this.player.y - this.vh / 2, 0, this.level.h * TILE - this.vh);
    this.hud = this.buildHud();
  }

  makeLift(el) {
    const top = el.topRow * TILE, bottom = el.bottomRow * TILE;
    return {
      kind: 'lift', x: el.tx * TILE, y: bottom, w: el.w * TILE, h: 8,
      top, bottom, period: el.period || 10, phase: el.phase || 0, dy: 0, alive: true,
    };
  }

  makeEntity(s) {
    const def = ITEM_DEFS[s.item];
    switch (s.kind) {
      case 'item':
        return {
          kind: 'item', item: s.item, spr: s.spr || def.spr,
          w: def.w, h: def.h,
          x: s.tx * TILE + (TILE - def.w) / 2,
          y: (s.walkRow + 1) * TILE - def.h,
          alive: true, bob: Math.random() * 6.28, found: s.found,
        };
      case 'stand':
        return { kind: 'stand', x: s.tx * TILE, y: s.walkRow * TILE, w: TILE, h: TILE, alive: true };
      case 'checkpoint':
        return { kind: 'checkpoint', id: s.id, x: s.tx * TILE, y: s.walkRow * TILE, w: TILE, h: TILE, alive: true, taken: false, active: false };
      case 'piccolo':
        return { kind: 'piccolo', x: s.tx * TILE, y: (s.walkRow + 1) * TILE - 15, w: 14, h: 15, patrol: s.patrol, dir: s.dir ?? -1, alive: true, stun: 0, flash: 0, bob: Math.random() * 6.28, vx: 0, aim: 0 };
      case 'sopran':
        return { kind: 'sopran', x: s.tx * TILE, y: (s.walkRow + 1) * TILE - 19, w: 12, h: 19, dir: s.dir ?? -1, alive: true, stun: 0, flash: 0, phase: 'idle', t: 1.1, bob: Math.random() * 6.28 };
      case 'tenor':
        return { kind: 'tenor', x: s.tx * TILE, y: (s.walkRow + 1) * TILE - 16, w: 14, h: 16, patrol: s.patrol, dir: s.dir ?? -1, alive: true, stun: 0, flash: 0, bob: Math.random() * 6.28 };
      case 'dirigent':
        return { kind: 'dirigent', x: s.tx * TILE, y: (s.walkRow + 1) * TILE - 22, w: 14, h: 22, dir: s.dir ?? 1, alive: true, stun: 0, flash: 0, bob: 0, aim: 0 };
      case 'ramona':
        return { kind: 'ramona', x: s.tx * TILE, y: (s.walkRow + 1) * TILE - 22, w: 14, h: 22, alive: true, bob: 0, near: false };
      case 'grill':
        return { kind: 'grill', x: s.tx * TILE, y: (s.walkRow + 1) * TILE - 12, w: 20, h: 12, alive: true, near: false };
      case 'schrank':
        return { kind: 'schrank', x: s.tx * TILE, y: (s.walkRow + 1) * TILE - 28, w: 16, h: 28, alive: true, near: false };
      case 'pult':
        return { kind: 'pult', x: s.tx * TILE, y: (s.walkRow + 1) * TILE - 16, w: 16, h: 16, alive: true, near: false, teil: 0, noetig: s.noetig || 3 };
      case 'npc': {
        const matrix = SPRITES[s.spr];
        const h = matrix ? matrix.length : 22;
        const w = matrix ? Math.max(...matrix.map((row) => row.length)) : 14;
        return { ...s, kind: 'npc', x: s.tx * TILE, y: (s.walkRow + 1) * TILE - h,
          w, h, alive: true, near: false, dialogIndex: 0, complete: false };
      }
      case 'decor': {
        const matrix = SPRITES[s.spr];
        const h = matrix ? matrix.length : 16;
        const w = matrix ? Math.max(...matrix.map((row) => row.length)) : 16;
        return { ...s, kind: 'decor', x: s.tx * TILE, y: (s.walkRow + 1) * TILE - h, w, h, alive: true };
      }
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
    this.message(`UMGEZOGEN: ${this.outfit.label}`, 4.5, 2);
  }
  setDifficulty(key) {
    if (!DIFFICULTY[key]) return;
    this.difficulty = key;
    this.diff = DIFFICULTY[key];
    this.message(`${this.diff.label}: ${this.diff.note}`, 5, 2);
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
  /** Meldungen mit Rang: 2 = Rückmeldung auf eine Aktion, 1 = Erklärung,
   *  0 = Kontexttip. Höherer Rang darf verdrängen; alles andere wird entweder
   *  aufgehoben (Kontext) oder der Aufrufer versucht es später erneut.
   *  @returns true, wenn die Meldung jetzt angezeigt wird */
  /** Ist die Anforderung des Ziels erfüllt? 'mappe' oder eine Kluft. */
  goalErfuellt() {
    const g = this.level.goal;
    if (g.applaus && this.applaus < g.applaus) return false;
    if (g.frackOff && !this.frackOffUsed) return false;
    if ((g.flags || []).some((flag) => !this.storyFlags.has(flag))) return false;
    if (g.need === 'ablegen') return this.frackAbgelegt;
    if (g.need === 'setzen') return !!this.setzen;
    if (g.need === 'einsatz') return !!this.einsatzGelungen;
    if (!g.need) return true;
    if (g.need === 'mappe') return !!this.hasMappe;
    return this.outfit.id === g.need;
  }

  message(text, dur = 4.5, prio = 1) {
    if (this.hint && this.time - this.hint.at < 1.5 && this.hint.prio >= prio) {
      // Nie verdrängen: aufheben und gleich danach zeigen (ohne Doppelte).
      if (!this.hintQueue) this.hintQueue = [];
      const schonDa = this.hintQueue.some((q) => q.text === text);
      if (!schonDa && this.hintQueue.length < 5) this.hintQueue.push({ text, dur, prio });
      return false;
    }
    // War gerade noch etwas Frisches zu sehen, kommt es danach zurück.
    if (this.hint && this.time - this.hint.at < 1.5) {
      if (!this.hintQueue) this.hintQueue = [];
      if (!this.hintQueue.some((q) => q.text === this.hint.text) && this.hintQueue.length < 5) {
        this.hintQueue.push({ text: this.hint.text, dur: 4, prio: this.hint.prio });
      }
    }
    this.hint = { text, until: this.time + dur, prio, at: this.time };
    return true;
  }

  // ------------------------------------------------------------ Simulation --
  update(dt) {
    if (this.state === 'complete') {
      this.time += dt; this.updateParticles(dt); this.updateCamera(dt); this.updateTakt(dt); this.hud = this.buildHud();
      return;
    }
    if (this.state !== 'play') return;
    this.time += dt;
    // Verfolgerscheinwerfer wandern ueber die Buehne
    for (const l of this.movingLights) {
      l.x += l.speed * dt;
      if (l.x < l.x0) { l.x = l.x0; l.speed = Math.abs(l.speed); }
      if (l.x > l.x1) { l.x = l.x1; l.speed = -Math.abs(l.speed); }
    }
    if (this.level.applaus) this.applaus = Math.max(0, this.applaus - 3.5 * dt);
    if (this.grillFrei > 0) this.grillFrei -= dt;
    this.updateLifts(dt);
    this.updatePlayer(dt);
    this.updateTakt(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateHeat(dt);
    this.updateMorsch(dt);
    this.updateWetter(dt);
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

  /** Versenkungen: fahren auf und ab und nehmen mit, wer oben steht. */
  updateLifts(dt) {
    const p = this.player;
    for (const en of this.entities) {
      if (en.kind !== 'lift') continue;
      const ph = (((this.time + en.phase) % en.period) + en.period) % en.period;
      const t = ph / en.period;
      // Dreieckswelle MIT Standzeit an beiden Enden: Ein- und Aussteigen darf
      // keine Punktlandung verlangen (Playtest-Befund Orchestergraben).
      const stand = 0.14;
      let k;
      if (t < stand || t > 1 - stand) k = 0;
      else {
        const u = (t - stand) / (1 - 2 * stand);
        k = u < 0.5 ? u * 2 : 2 - u * 2;
      }
      const ny = Math.round(en.bottom + (en.top - en.bottom) * k);
      en.dy = ny - en.y;
      en.y = ny;
      const oben = p.y + p.h;
      if (p.x + p.w > en.x + 1 && p.x < en.x + en.w - 1
          && oben >= en.y - 3 && oben <= en.y + 8 && p.vy >= -1) {
        p.y = en.y - p.h;
        p.vy = 0;
        p.onGround = true;
      }
      // Hinweis, wenn die Versenkung unten steht und man davorsteht: der Weg nach
      // oben muss ohne Punktlandung auffindbar sein (Playtest-Befund).
      if (k < 0.18 && Math.abs((p.x + p.w / 2) - (en.x + en.w / 2)) < 78
          && this.time > (this.liftNote || 0) + 9) {
        this.liftNote = this.time;
        this.message('DIE VERSENKUNG STEHT UNTEN. EINFACH DRAUF STELLEN.', 5, 2);
      }
    }
  }

  /** Farben je Schauplatz: der Graben ist dunkelrot, der Keller blau-violett. */
  pal() {
    if (this.level.setting === 'graben') {
      return { bg: '#120a10', far: '#1d1016', mid: '#251319',
        stein: '#2a1a20', stein2: '#341f27', kante: '#4a2730', kante2: '#63333c' };
    }
    if (this.level.setting === 'buehne') {
      return { bg: '#150a0c', far: '#241216', mid: '#2c1518',
        stein: '#3a1c1c', stein2: '#4a2422', kante: '#7a3a2c', kante2: '#a8523a' };
    }
    return { bg: '#141021', far: '#1b1630', mid: '#191428',
      stein: '#2b2438', stein2: '#332b44', kante: '#453a5c', kante2: '#5d4f78' };
  }

  /** Helligkeit 0..1 an einer Kachelmitte — im Dunkeln auch für Tests. */
  lightAt(tx, ty) {
    if (!this.level.dark) return 1;
    if (tx < 0 || ty < 0 || tx >= this.level.w || ty >= this.level.h) return 1;
    const px = tx * TILE + TILE / 2, py = ty * TILE + TILE / 2;
    const p = this.player;
    const eigen = 1 - Math.hypot(px - (p.x + p.w / 2), py - (p.y + p.h / 2)) / (TILE * this.diff.sicht);
    let best = clamp(eigen, 0, 1) * 0.8;
    for (const g of this.level.gleams || []) {
      const d = Math.hypot(px - (g.tx * TILE + TILE / 2), py - (g.ty * TILE + TILE / 2));
      best = Math.max(best, clamp(1 - d / (g.r * TILE), 0, 1));
    }
    return best;
  }

  /** Der Graben ist stockdunkel — nur Pultlampen und die eigene Lampe leuchten. */
  drawDarkness(ctx, camX, camY) {
    if (!this.level.dark) return;
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const x1 = Math.min(this.level.w - 1, Math.ceil((camX + this.vw) / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const y1 = Math.min(this.level.h - 1, Math.ceil((camY + this.vh) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const a = clamp(this.dunkel - this.lightAt(tx, ty) * this.dunkel, 0, this.dunkel);
        if (a <= 0.01) continue;
        ctx.fillStyle = `rgba(3,2,6,${a.toFixed(3)})`;
        ctx.fillRect(Math.round(tx * TILE - camX), Math.round(ty * TILE - camY), TILE, TILE);
      }
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    const inp = this.input;
    const frozen = this.stunTimer > 0;
    if (frozen) { this.stunTimer -= dt; }
    const axis = frozen ? 0 : inp.axis();
    const slow = 1 - this.diff.tenorSlow * this.slowField;
    const boost = this.frackBoost > 0 ? 1.35 : 1;
    // Wetter: Regen macht den Boden rutschig, Kälte macht langsam und steif
    const wetterTempo = (this.nassFaktor ? 0.88 : 1) * (this.wetterKind === 'kaelte' ? 0.88 : 1);
    const speed = this.outfit.speed * slow * boost * wetterTempo;

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
    const griff = this.nassFaktor ? 0.6 : 1;      // nass = weniger Grip
    const rate = (axis !== 0 ? PHYS.accel : PHYS.friction) * griff * dt;
    p.vx += clamp(target - p.vx, -rate, rate);
    if (axis === 0 && Math.abs(p.vx) < 5) p.vx = 0;
    if (axis !== 0) p.dir = axis > 0 ? 1 : -1;

    if (p.onGround) p.coyote = PHYS.coyote; else p.coyote = Math.max(0, p.coyote - dt);
    const jumpNow = inp.jump() && !frozen;
    const jumpPressed = jumpNow && !this.prevJump;
    this.prevJump = inp.jump();
    if (jumpPressed) {
      if (inp.down() && p.onGround && p.standingOneway) {
        p.y += 2; p.vy = 24; p.onGround = false; p.dropTimer = 0.12;
      } else {
        p.jumpBuf = PHYS.buffer;
      }
    } else {
      p.jumpBuf = Math.max(0, p.jumpBuf - dt);
    }
    if (p.jumpBuf > 0 && p.coyote > 0 && !frozen) {
      p.vy = this.outfit.jump * (this.wetterKind === 'kaelte' ? 0.84 : 1);
      p.onGround = false; p.coyote = 0; p.jumpBuf = 0;
      this.audio.play('jump');
    }
    if (!inp.jump() && p.vy < -62) p.vy = -62;

    // Aktion: Frack-Off hat Vorrang, sonst Beton-Tritt
    const actNow = inp.action() && !frozen;
    const actPressed = actNow && !this.prevAction;
    this.wantInteract = actPressed;
    // Am Kleiderständer ist der Druck zum Umziehen gedacht, nicht zum Tritt.
    // Am Dirigentenpult wird der Einsatz gegeben (DRR-04).
    if (actPressed && !this.nearStand() && !this.nearPult() && !this.nearNpc()) {
      if (this.outfit.id === 'frack' && this.heat > TUNE.frackOffHeat && !this.frackOffUsed) this.frackOff();
      else this.tryTritt();
    }
    this.prevAction = inp.action();

    this.moveAndCollide(dt);
    if (Math.abs(p.vx) > 12 && p.onGround) p.animT += dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.dropTimer > 0) p.dropTimer -= dt;
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
    // Bodenkontakt exakt halten: sonst summieren sich pro Frame winzige
    // Fallschritte und die Figur zittert sichtbar um ein Pixel.
    if (g && p.vy >= 0 && p.dropTimer <= 0) {
      p.y = g.ty * TILE - p.h;
      p.vy = 0;
    }
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
    // Versenkungen sind fahrbarer Boden
    for (const en of this.entities) {
      if (en.kind !== 'lift') continue;
      if (p.x + p.w > en.x + 1 && p.x < en.x + en.w - 1) {
        if (p.y + p.h >= en.y - 2 && p.y + p.h <= en.y + 4) {
          return { v: 2, tx: Math.floor(p.x / TILE), ty: Math.floor(en.y / TILE), lift: true };
        }
      }
    }
    return null;
  }

  /** Wetterzyklus samt Wirkung. */
  updateWetter(dt) {
    if (!this.wetter.length) return;
    if (this.wetterIdx < 0 || this.wetterTimer <= 0) {
      this.wetterIdx = (this.wetterIdx + 1) % this.wetter.length;
      const w = this.wetter[this.wetterIdx];
      this.wetterTimer = w.dur;
      this.wetterKind = w.kind;
      this.message(w.label, 6, 2);
      this.audio.play('gate');
    }
    this.wetterTimer -= dt;
    const p = this.player;

    // Wind: Böen mit Vorwarnung, dazu fliegende Notenblätter
    if (this.wetterKind === 'wind') {
      if (this.gustTimer <= 0 && this.gustWarn <= 0 && Math.random() < dt * 0.35) {
        this.gustWarn = 0.9;
        this.gustDir = Math.random() < 0.5 ? -1 : 1;
      }
      if (this.gustWarn > 0) {
        this.gustWarn -= dt;
        if (this.gustWarn <= 0) { this.gustTimer = 1.1; this.audio.play('tenor'); }
      }
      if (this.gustTimer > 0) {
        this.gustTimer -= dt;
        p.vx += this.gustDir * 62 * dt;
      }
      if (Math.random() < dt * 3.4 && this.blaetter.length < 8) {
        this.blaetter.push({
          x: this.gustDir > 0 ? p.x - 120 : p.x + 120,
          y: p.y - 10 - Math.random() * 26,
          vx: (this.gustDir || 1) * (40 + Math.random() * 40),
          vy: 12 + Math.random() * 14,
          t: Math.random() * 6,
          alive: true,
        });
      }
    } else {
      this.gustTimer = 0;
      this.gustWarn = 0;
    }

    // Notenblätter treiben und stoßen den Spieler an
    for (const b of this.blaetter) {
      b.t += dt;
      b.x += b.vx * dt;
      b.y += (b.vy + Math.sin(b.t * 3) * 18) * dt;
      if (b.y > 26 * TILE) b.alive = false;
      const box = { x: b.x, y: b.y, w: 12, h: 10 };
      if (overlap(p, box)) {
        b.alive = false;
        this.stunTimer = Math.max(this.stunTimer, 0.6);
        this.message('NOTENBLATT IM GESICHT. SEHR WÜRDIG.', 4, 2);
        this.audio.play('morsch');
      }
    }
    this.blaetter = this.blaetter.filter((b) => b.alive);

    // Regen: nass werden, unter dem Vordach trocknen
    if (this.wetterKind === 'regen') {
      this.nass = clamp(this.nass + (this.inShelter(p) ? -26 : 19) * dt, 0, 100);
    } else {
      this.nass = clamp(this.nass - 14 * dt, 0, 100);
    }
    this.nassFaktor = this.nass > 55 ? 1 : 0;
  }

  inShelter(p) {
    for (const sh of this.level.shelters || []) {
      if (p.x + p.w > sh.x && p.x < sh.x + sh.w && p.y + p.h > sh.y && p.y < sh.y + sh.h) return true;
    }
    return false;
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
    // Im Kleingarten wird nicht mehr getaktet (Befund D5: „kein Frack, kein Takt").
    if (this.level.ruhig) { this.beatPhase = 0; this.bpm = this.level.bpm || BPM_BASE; return; }
    this.bpm = this.slowField > 0.25 ? BPM_TENOR : this.taktBpm;
    this.beatPhase += dt * (this.bpm / 60);
    if (this.beatPhase >= 1) {
      this.beatPhase -= 1;
      this.beats += 1;
      this.onBeat();
    }
  }
  beatAccuracy() { return Math.min(this.beatPhase, 1 - this.beatPhase) * (60 / this.bpm); }
  onBeat() {
    const p = this.player;
    // Jeder Gegner zählt für den Applaus nur einmal je Taktfenster (Befund D3).
    for (const en of this.entities) if (ENEMY_KINDS.has(en.kind)) en.imTaktGewertet = false;
    const nah = this.entities.some((en) => en.alive && ENEMY_KINDS.has(en.kind)
      && Math.hypot((en.x + en.w / 2) - (p.x + p.w / 2), (en.y + en.h / 2) - (p.y + p.h / 2)) < this.vw * 0.8);
    if (nah && this.beats % 2 === 0) this.audio.play('beat');
    for (const en of this.entities) {
      if (en.kind === 'dirigent') {
        if (!en.alive || en.stun > 0) continue;
        const ccx = en.x + en.w / 2, ccy = en.y + 6;
        const ddx = (p.x + p.w / 2) - ccx;
        // Im Dunkeln (Orchestergraben) wirft er nicht ins Schwarze: dort gilt wie
        // beim Piccolo „was man nicht sieht, trifft nicht“. Ohne diese Grenze liegt
        // der Versenkungsschacht in seiner Wurfweite (0,9 × Bildbreite), und das
        // Warten auf die Mitfahrt wird zur Glückssache — Playtest-Befund.
        const wurfWeite = this.vw * 0.9 * (this.level.dark ? 0.4 : 1);
        if (Math.abs(ddx) > wurfWeite) { en.aim = 0; continue; }
        if ((this.beats + 1) % this.diff.dirigentEvery === 0) { en.aim = this.diff.aimTime; continue; }
        if (this.beats % this.diff.dirigentEvery !== 0) continue;
        en.aim = 0;
        // Bogenwurf auf die Stelle, an der der Spieler gerade steht
        const tt = 0.8;
        const vx = ddx / tt;
        const vy = ((p.y + p.h) - ccy - 0.5 * PHYS.gravity * tt * tt) / tt;
        this.projectiles.push({
          kind: 'baton', x: ccx + en.dir * 10, y: ccy, w: 10, h: 4,
          vx, vy, life: 3.0, dmg: 1, spin: 0,
        });
        continue;
      }
      if (en.kind !== 'piccolo' || !en.alive || en.stun > 0) continue;
      const cx = en.x + en.w / 2, cy = en.y + en.h / 2;
      const dx = (this.player.x + this.player.w / 2) - cx;
      // Reichweite richtet sich nach dem Bild: was man nicht sieht, schiesst nicht.
      const dunkelFaktor = this.level.dark ? 0.7 : 1;   // nie weiter als die eigene Sicht
      const range = this.vw * this.diff.fireRange * (this.glanz > 0.5 ? 1.2 : 1) * dunkelFaktor;
      const inFront = Math.sign(dx) === en.dir || Math.abs(dx) < 8;
      const inReach = inFront && Math.abs(dx) <= range
        && Math.abs((this.player.y + this.player.h / 2) - cy) < 46;
      if (!inReach) { en.aim = 0; continue; }
      // Ein Schlag Vorwarnung, dann erst der Schuss
      if ((this.beats + 1) % this.diff.fireEvery === 0) { en.aim = this.diff.aimTime; continue; }
      if (this.beats % this.diff.fireEvery !== 0) continue;
      en.aim = 0;
      this.projectiles.push({
        kind: 'sound', x: cx + en.dir * 9, y: cy - 3, w: 12, h: 8,
        vx: en.dir * 135 * this.diff.shotSpeed, life: 3.4, dmg: 1,
      });
      en.flash = 0.15;
    }
  }

  tryTritt() {
    const p = this.player;
    const acc = this.beatAccuracy();
    const inTakt = acc <= this.diff.trittWindow;
    this.audio.play('tritt');
    this.shake = Math.max(this.shake, 2.5);
    for (let i = 0; i < 6; i++) {
      this.burst(p.x + p.w / 2, p.y + p.h - 1, '#6b6152', 1);
    }
    let hits = 0, gewertet = 0;
    for (const en of this.entities) {
      if (!en.alive || !ENEMY_KINDS.has(en.kind)) continue;
      const dx = Math.abs((en.x + en.w / 2) - (p.x + p.w / 2));
      const dy = Math.abs((en.y + en.h / 2) - (p.y + p.h / 2));
      if (dx < TUNE.trittRange && dy < 34) {
        if (inTakt) {
          // Applaus gibt es nur für einen echten Treffer: ein bereits
          // betäubter Gegner in Reichweite ist kein zweites Mal wert
          // (Befund D3 — vorher waren sechs Wertungen pro Gegner möglich).
          if (en.stun <= 0 && !en.imTaktGewertet) { en.imTaktGewertet = true; gewertet++; }
          en.stun = TUNE.trittStun; en.flash = 0.3; hits++;
        }
      }
    }
    if (inTakt && gewertet > 0 && this.level.applaus) this.applaus = Math.min(100, this.applaus + 12);
    if (inTakt && hits > 0) {
      this.taktHits += hits;
      this.heat = Math.max(0, this.heat - 4);
      this.message(`IM TAKT! ${hits} GERADE AUS DEM KONZEPT`, 4.5, 2);
    } else if (inTakt) {
      this.message('IM TAKT — ABER NIEMAND IN REICHWEITE', 4.5, 2);
    } else {
      this.message('DANEBEN. DER TAKT IST DIE MITTE DES PULSES', 4.5, 2);
    }
    this.lastTritt = { inTakt, hits };
  }

  /** Notfall auf der Bühne: Kragen auf, Ärmel hoch. Der Frack bleibt dabei an —
   *  das war vorher anders beschrieben, als es war (Befund D4). */
  frackOff() {
    this.frackOffUsed = true;
    this.heat = 0;
    this.frackBoost = TUNE.frackOffBoost;
    this.audio.play('frackoff');
    this.shake = 5;
    for (let i = 0; i < 26; i++) this.burst(this.player.x + 5, this.player.y + 8, i % 2 ? '#f0eee4' : '#191622', 1);
    this.message('AUFGERISSEN. KRAGEN OFFEN, ÄRMEL HOCH — DER FRACK BLEIBT AN.', 4.5, 2);
  }

  /** Der Vorhang: den Frack wirklich ablegen. Danach trägt er das Hemd. */
  frackAblegen() {
    if (this.frackAbgelegt) return false;
    // Abgelegt wird nur, was getragen wird: der Vorhang öffnet nicht im
    // schwarzen Hemd (Akt 5 verlangt den Auftritt im Frack).
    if (this.outfit.id !== 'frack') return false;
    this.frackAbgelegt = true;
    this.heat = 0;
    this.glanz = 0;
    this.outfit = OUTFITS.schwarz;   // sichtbar: schwarzes Hemd statt Frack
    this.audio.play('frackoff');
    this.shake = 5;
    for (let i = 0; i < 30; i++) this.burst(this.player.x + 5, this.player.y + 8, i % 2 ? '#f0eee4' : '#20202a', 1);
    this.message('FRACK ABGELEGT. WAS BLEIBT, IST EIN SCHWARZES HEMD.', 5, 2);
    return true;
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
      const info = ENEMY_INFO[en.kind];
      if (info && !this.met[en.kind]) {
        const dd = Math.hypot((en.x + en.w / 2) - (p.x + p.w / 2), (en.y + en.h / 2) - (p.y + p.h / 2));
        if (dd < 130 && this.message(info.tip, 7, 1)) this.met[en.kind] = true;
      }
      switch (en.kind) {
        case 'piccolo': {
          if (en.aim > 0) en.aim -= dt;
          if (en.stun <= 0 && en.patrol) {
            en.x += en.dir * 20 * this.diff.enemySpeed * dt;
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
            en.x += en.dir * (en.stun > 0 ? 6 : 22 * this.diff.kofferSpeed) * dt;
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
          if (d < this.diff.tenorRange && en.stun <= 0) {
            slowActive = true;
            if (this.slowField < 0.1) { this.audio.play('tenor'); this.message('DER TENOR VERSCHLEPPT DAS TEMPO'); }
          }
          if (overlap(p, en)) this.damage(1, en.x);
          break;
        }
        case 'dirigent': {
          if (en.aim > 0) en.aim -= dt;
          if (overlap(p, en)) this.damage(this.diff.sopranDmg > 1 ? 1 : 1, en.x);
          break;
        }
        case 'sopran': {
          if (en.stun > 0) { en.phase = 'idle'; en.t = 0.6; break; }
          en.t -= dt;
          if (en.phase === 'idle' && en.t <= 0) {
            en.phase = 'windup'; en.t = this.diff.sopranWind;
            this.audio.play('piccolo');
          } else if (en.phase === 'windup' && en.t <= 0) {
            en.phase = 'shriek'; en.t = 0.5;
            this.audio.play('shriek');
            this.shake = Math.max(this.shake, 4);
            const cx = en.x + en.w / 2, cy = en.y + en.h / 2;
            const px = p.x + p.w / 2, py = p.y + p.h / 2;
            const dx = px - cx;
            const inFront = Math.sign(dx) === en.dir || Math.abs(dx) < 6;
            const range = this.vw * this.diff.sopranRange * (this.glanz > 0.5 ? 1.2 : 1);
            if (inFront && Math.abs(dx) < range && Math.abs(py - cy) < SOPRAN_CONE_H
              && this.los(cx, cy, px, py) && !this.inAlcove(p) && this.ohropax <= 0) {
              this.damage(this.diff.sopranDmg, cx);
              this.message('DAS SOPRAN. LEBENSGEFÄHRLICH LAUT. OHROPAX ODER DECKUNG.', 4.5, 2);
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
      if (pr.kind === 'baton' && !pr.stuck) {
        pr.vy += PHYS.gravity * dt;
        pr.spin += dt * 12;
      }
      pr.x += pr.vx * dt;
      pr.y += (pr.vy || 0) * dt;
      pr.life -= dt;
      const tx = Math.floor((pr.x + pr.w / 2) / TILE);
      const ty = Math.floor((pr.y + pr.h / 2) / TILE);
      if (this.tileVal(tx, ty) === 1) {
        if (pr.kind === 'baton' && !pr.stuck) { pr.stuck = true; pr.vx = 0; pr.vy = 0; pr.life = Math.min(pr.life, 0.7); }
        else pr.life = 0;
      }
      if (overlap(p, pr)) {
        pr.life = 0;
        if (this.ohropax <= 0) this.damage(pr.dmg, pr.x);
        else this.message('OHROPAX HÄLT. DER SCHALL PRALLT AB.', 4.5, 2);
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.life > 0);
  }

  // ------------------------------------------------------------- Zustände --
  updateHeat(dt) {
    const p = this.player;
    // Der Kleingarten kennt keine Hitze: kein Frack, kein Licht, kein Takt.
    if (this.level.ruhig) {
      this.heat = 0; this.glanz = 0; this.inLightNow = false;
      if (this.ohropax > 0) this.ohropax = Math.max(0, this.ohropax - dt);
      return;
    }
    const light = this.inLight(p);
    const moving = Math.abs(p.vx) > 25;
    let rate = this.outfit.heatBase;
    rate += light ? this.outfit.lightHeat : TUNE.heatShade;
    if (this.wetterKind === 'sonne') rate += this.outfit.id === 'frack' ? 3.2 : 1.1;
    if (moving) rate += TUNE.heatRun;
    this.heat = clamp(this.heat + rate * dt, 0, TUNE.heatMax);
    this.inLightNow = light;
    if (this.heat >= TUNE.kreislaufAt) {
      this.heat = 62;
      this.stunTimer = 2.2;
      this.shake = 7;
      this.audio.play('collapse');
      this.message('KREISLAUF. DER FRACK HAT GEWONNEN. KURZ DURCHATMEN.', 4.5, 2);
    }
    const glanzTarget = light && (this.outfit.id === 'frack' || this.heat > 60) ? 1 : 0;
    this.glanz = clamp(this.glanz + (glanzTarget - this.glanz) * Math.min(1, dt * 2), 0, 1);
    if (this.ohropax > 0) this.ohropax = Math.max(0, this.ohropax - dt);
  }

  inLight(p) {
    const zonen = this.level.lights.concat(this.movingLights.map((l) => ({
      x: l.x * TILE, y: l.y * TILE, w: l.w * TILE, h: l.h * TILE,
    })));
    for (const l of zonen) {
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
        this.message('SPEICHERPUNKT. VON HIER GEHT ES WEITER.', 4.5, 2);
        this.audio.play('pickup');
        continue;
      }
      if (en.kind === 'stand') {
        // Umziehen nur auf Tastendruck (Aktion) — nie durch bloßes Berühren,
        // sonst landet man beim Springen im Umkleidebildschirm.
        const slot = this.standSlot(en);
        en.near = overlap(p, slot);
        if (en.near && this.wantInteract && this.standCooldown <= 0) {
          this.standCooldown = 1.2;
          this.wantInteract = false;
          this.pause('stand');
          this.events({ type: 'stand' });
        }
        continue;
      }
    }
    this.entities = this.entities.filter((en) => en.alive);

    // Datengetriebene Gespräche: E blättert bewusst durch kurze Zeilen; in der
    // Nähe einer Figur löst dieselbe Taste deshalb keinen Beton-Tritt aus.
    for (const en of this.entities) {
      if (en.kind !== 'npc') continue;
      const nah = overlap(p, this.standSlot(en));
      en.near = nah;
      if (!nah || !this.wantInteract) continue;
      this.wantInteract = false;
      this.talkTo(en);
    }

    // Ramona und der Grill: nichts Gefaehrliches, nur Nachbarschaft
    for (const en of this.entities) {
      if (en.kind !== 'ramona' && en.kind !== 'grill') continue;
      const slot = { x: en.x - 24, y: en.y - 20, w: en.w + 48, h: en.h + 30 };
      const nah = overlap(p, slot);
      if (nah && !en.near) {
        en.near = true;
        if (en.kind === 'ramona') this.message('RAMONA: \u201eSETZ DICH. DAS BIER STEHT SCHON.\u201c', 6, 2);
        else this.message('DER GRILL IST AN. BRATWUERSTE WENDEN SICH NICHT VON ALLEIN.', 6, 2);
      }
      if (!nah) en.near = false;
      if (en.kind === 'grill' && nah && this.wantInteract && this.grillFrei <= 0) {
        this.grillFrei = 1.5;
        this.wantInteract = false;
        this.pause('grill');
        this.events({ type: 'grill' });
      }
    }

    // Das Dirigentenpult: hier wird der erste gemeinsame Einsatz gespielt (DRR-04).
    for (const en of this.entities) {
      if (en.kind !== 'pult') continue;
      const nah = overlap(p, this.standSlot(en));
      en.near = nah;
      if (!nah || !this.wantInteract) continue;
      this.wantInteract = false;
      this.einsatzVersuch();
    }

    // Der Schrank der Laube: hier hängt der Frack. Wer ihn noch trägt, legt ihn
    // hier ab — danach bleibt er im Schrank (Befund D4 / DRR-06).
    for (const en of this.entities) {
      if (en.kind !== 'schrank') continue;
      const slot = { x: en.x - 20, y: en.y - 24, w: en.w + 40, h: en.h + 26 };
      const nah = overlap(p, slot);
      en.near = nah;
      if (!nah || !this.wantInteract) continue;
      this.wantInteract = false;
      if (this.outfit.id === 'frack') {
        this.frackAblegen();
        this.message('DER FRACK HÄNGT IM SCHRANK DER LAUBE. FÜR IMMER.', 5.5, 2);
      } else {
        this.message('IM SCHRANK HÄNGT DER FRACK. DU TRÄGST IHN SCHON NICHT MEHR.', 5, 1);
      }
    }

    // Souffleurkasten: wer zu nahe kommt, hört plötzlich den Text mit
    for (const sp of this.spuk) {
      if (sp.done) continue;
      const slot = { x: sp.tx * TILE, y: sp.ty * TILE, w: sp.w * TILE, h: sp.h * TILE };
      if (!overlap(p, slot)) continue;
      sp.done = true;
      this.stunTimer = Math.max(this.stunTimer, 0.28);
      this.shake = 5;
      p.vx = -p.dir * 90;
      this.audio.play('sopran');
      this.message('DER SOUFFLEUR FLÜSTERT. DIREKT AM OHR.', 5, 2);
    }

    // Türen und Bänder
    for (const g of this.gates) {
      if (g.open) continue;
      // Trefferfläche leicht aufweiten: wer gegen die Tür läuft, merkt es auch
      const slot = { x: g.tx * TILE - 3, y: g.ty * TILE, w: g.tw * TILE + 6, h: g.th * TILE };
      if (!overlap(p, slot)) continue;
      const erfuellt = g.flag ? this.storyFlags.has(g.flag) : this.outfit.id === g.need;
      if (erfuellt) {
        g.open = true;
        for (let j = g.ty; j < g.ty + g.th; j++) for (let i = g.tx; i < g.tx + g.tw; i++) this.grid[j][i] = 0;
        this.audio.play('gate');
        this.message(g.opened || (g.need === 'anzug' ? 'DIENSTTÜR OFFEN. DER ANZUG MACHT DEN UNTERSCHIED.' : 'ABSPERRBAND BEISEITE. DER FRACK HAT PRESTIGE.'), 4.5, 2);
        g.notified = 0;
      } else if (this.time > g.notified + 3) {
        g.notified = this.time;
        this.message(g.locked || (g.need === 'anzug' ? 'DIE DIENSTTÜR BLEIBT ZU. DAFÜR BRAUCHT ES DEN ANZUG.' : 'DAS ABSPERRBAND HÄLT. NUR IM FRACK GEHT DAS AUF.'), 4.5, 2);
      }
    }
    // Ziel: Materialaufzug. Ziele mit `need: 'ablegen'` oder 'setzen' verlangen
    // eine bewusste Aktion (E) — der Frack fällt nicht von selbst (Befund D4),
    // und im Garten wird Platz genommen, nicht nur berührt (Befund D5).
    const goal = this.level.goal;
    if (overlap(p, goal)) {
      const aktionsZiel = goal.need === 'ablegen' || goal.need === 'setzen';
      if (aktionsZiel && this.wantInteract) {
        this.wantInteract = false;
        if (goal.need === 'ablegen') {
          if (!this.frackAblegen()) {
            this.message('OHNE FRACK GIBT ES NICHTS ABZULEGEN. AM KLEIDERSTÄNDER ANZIEHEN (E).', 5, 2);
          }
        } else if (goal.need === 'setzen') this.setzen = true;
      }
      const erfuellt = this.goalErfuellt();
      if (erfuellt) this.complete();
      else if (this.time > (this.goalNote || 0) + 3) {
        this.goalNote = this.time;
        this.message(goal.locked || 'HIER GEHT ES NICHT WEITER.', 4.5, 2);
      }
    }
    // Taktwechsel: der Dirigent bestimmt das Tempo
    for (const t of this.taktChanges) {
      if (!t.done && p.x + p.w > t.x) {
        t.done = true;
        // In gemütlich wird der Wechsel sanfter ausgeführt
        const ziel = BPM_BASE + (t.bpm - BPM_BASE) * (this.difficulty === 'gemuetlich' ? 0.6 : 1);
        this.taktBpm = Math.round(ziel);
        this.message(`${t.label} · ${this.taktBpm} BPM`, 6, 2);
      }
    }
    // Kontexttips
    for (const h of this.level.hints) {
      if (!h.shown && p.x + p.w > h.x) { h.shown = true; this.message(h.text, 6, 0); }
    }
  }

  standSlot(en) {
    return {
      x: en.x - TUNE.interactRange, y: en.y - 26,
      w: en.w + TUNE.interactRange * 2, h: en.h + 32,
    };
  }
  nearStand() {
    const p = this.player;
    for (const en of this.entities) {
      if (en.kind !== 'stand') continue;
      if (overlap(p, this.standSlot(en))) return en;
    }
    return null;
  }

  /** Das Dirigentenpult: hier wird der erste gemeinsame Einsatz gespielt (DRR-04). */
  nearPult() {
    const p = this.player;
    for (const en of this.entities) {
      if (en.kind !== 'pult') continue;
      if (overlap(p, this.standSlot(en))) return en;
    }
    return null;
  }

  nearNpc() {
    const p = this.player;
    for (const en of this.entities) {
      if (en.kind === 'npc' && overlap(p, this.standSlot(en))) return en;
    }
    return null;
  }

  requirementMet(requirement) {
    if (requirement === 'mappe') return !!this.hasMappe;
    return this.storyFlags.has(requirement);
  }

  talkTo(npc) {
    const missing = (npc.requires || []).find((requirement) => !this.requirementMet(requirement));
    // Eine bewusst ausgelöste Gesprächszeile ersetzt den alten Hinweis sofort.
    // Sonst würde schnelles Weiterblättern mehrere sieben Sekunden alte Zeilen
    // aufstauen und die eigentliche Reaktion erst nach dem Raumwechsel zeigen.
    this.hint = null;
    this.hintQueue = [];
    if (missing) {
      this.message(npc.blocked || `${npc.name}: „DA FEHLT NOCH ETWAS.“`, 5.5, 3);
      return false;
    }
    if (npc.complete) {
      this.message(`${npc.name}: „${npc.after || 'WIR SEHEN UNS OBEN.'}“`, 5, 3);
      return true;
    }
    const line = (npc.dialog || [])[npc.dialogIndex] || npc.after || 'WEITER.';
    npc.dialogIndex += 1;
    this.audio.play('dialog');
    this.message(`${npc.name}: „${line}“`, 7, 3);
    if (npc.dialogIndex >= (npc.dialog || []).length) {
      npc.complete = true;
      if (npc.flag) {
        this.storyFlags.add(npc.flag);
        this.events({ type: 'story', flag: npc.flag, npc: npc.npc });
      }
    }
    this.hud = this.buildHud();
    return true;
  }

  /**
   * Ein Versuch am Pult. Nur im Takt gezählt — gelungene Teile bleiben erhalten,
   * ein danebengegangener Versuch kostet nichts (DRR-04).
   */
  einsatzVersuch() {
    const pult = this.nearPult();
    if (!pult) return;
    // Die Aufgabenstellung von Akt 2 ist „Mappe abgeben und den ersten Einsatz
    // spielen“: wer die Mappe trägt, legt sie zuerst aufs Pult. Das kostet keinen
    // Takt und ist optional — wer über die Stationswahl direkt in Akt 2 einsteigt
    // (ohne Mappe), gibt sofort den Einsatz.
    if (this.hasMappe && !this.mappeAbgegeben) {
      this.mappeAbgegeben = true;
      this.hasMappe = false;
      this.audio.play('pickup');
      this.message('DIE NOTENMAPPE LIEGT AUF DEM PULT. JETZT DER EINSATZ: DREI TAKTE (E).', 6, 2);
      return;
    }
    if (this.beatAccuracy() > this.diff.trittWindow) {
      this.message('DANEBEN. DER TAKT IST DIE MITTE DES PULSES.', 4.5, 2);
      return;
    }
    pult.teil += 1;
    this.audio.play('beat');
    this.shake = Math.max(this.shake, 2);
    for (let i = 0; i < 10; i++) this.burst(pult.x + 8, pult.y, '#e8c46a', 1);
    // Der Dirigent hält kurz inne: der Einsatz hat ihn erreicht.
    for (const en of this.entities) if (en.kind === 'dirigent' && en.alive) en.stun = Math.max(en.stun, 1.0);
    if (pult.teil >= pult.noetig) {
      this.einsatzGelungen = true;
      this.audio.play('applaus') ;
      this.message('DER EINSATZ SITZT. DAS ORCHESTER ZIEHT MIT.', 6, 2);
      this.events({ type: 'einsatz' });
    } else {
      this.message(`TEIL ${pult.teil}/${pult.noetig} — DAS ORCHESTER ZIEHT MIT`, 4.5, 2);
    }
  }

  /** Name des nächsten Objekts (für das Schild über dem Fundstück). */
  nearestLabel() {
    const p = this.player;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    let best = null, bestD = TUNE.labelRange;
    for (const en of this.entities) {
      if (!en.alive) continue;
      if (en.kind === 'item') {
        const d = Math.hypot((en.x + en.w / 2) - cx, (en.y + en.h / 2) - cy);
        if (d < bestD) { bestD = d; best = { text: (ITEM_DEFS[en.item] || {}).label || 'FUNDSTÜCK', x: en.x + en.w / 2, y: en.y - 2 }; }
      } else if (ENEMY_INFO[en.kind]) {
        const d = Math.hypot((en.x + en.w / 2) - cx, (en.y + en.h / 2) - cy);
        if (d < 58) { bestD = d; best = { text: ENEMY_INFO[en.kind].name, x: en.x + en.w / 2, y: en.y - 2 }; }
      } else if (en.kind === 'checkpoint' && !en.taken) {
        const d = Math.hypot((en.x + 8) - cx, (en.y + 8) - cy);
        if (d < bestD - 8) { bestD = d; best = { text: 'SPEICHERPUNKT', x: en.x + 8, y: en.y - 4 }; }
      }
    }
    const stand = this.nearStand();
    if (stand) best = { text: 'UMZIEHEN', x: stand.x + 8, y: stand.y - 30, action: true, key: 'E' };
    const npc = this.entities.find((en) => en.kind === 'npc' && en.near);
    if (npc) {
      best = {
        text: npc.complete ? `${npc.name}: NOCHMAL SPRECHEN` : `MIT ${npc.name} SPRECHEN`,
        action: true, key: 'E', x: npc.x + npc.w / 2, y: npc.y - 4,
      };
    }
    const griller = this.entities.find((en) => en.kind === 'grill' && en.near);
    if (griller) best = { text: 'GRILLEN', action: true, key: 'E', x: griller.x + 10, y: griller.y - 18 };
    const schrank = this.entities.find((en) => en.kind === 'schrank' && en.near);
    if (schrank) {
      const traegtFrack = this.outfit.id === 'frack';
      best = {
        text: traegtFrack ? 'FRACK IN DEN SCHRANK HÄNGEN' : 'SCHRANK DER LAUBE',
        action: traegtFrack, key: 'E', x: schrank.x + 8, y: schrank.y - 6,
      };
    }
    const pult = this.entities.find((en) => en.kind === 'pult' && en.near);
    if (pult) {
      const fertig = pult.teil >= pult.noetig;
      const mappe = this.hasMappe && !this.mappeAbgegeben;
      best = {
        text: mappe ? 'NOTENMAPPE AUF DAS PULT LEGEN'
          : fertig ? `EINSATZ SITZT (${pult.teil}/${pult.noetig})`
            : `EINSATZ GEBEN (${pult.teil}/${pult.noetig})`,
        action: !fertig, key: 'E', x: pult.x + 8, y: pult.y - 20,
      };
    }
    const g = this.level.goal;
    const dg = Math.hypot((g.x + 8) - cx, (g.y + g.h / 2) - cy);
    const zielFrei = this.goalErfuellt();
    const fehltFlag = (g.flags || []).some((flag) => !this.storyFlags.has(flag));
    const grund = fehltFlag ? (g.flagLocked || 'STORYSCHRITT FEHLT')
      : (g.applaus && this.applaus < g.applaus) ? `APPLAUS ${Math.round(this.applaus)}/${g.applaus}`
      : (g.need === 'ablegen') ? 'FRACK ABLEGEN'
        : (g.need === 'setzen') ? 'HINSETZEN'
        : (g.need === 'einsatz') ? (this.hasMappe && !this.mappeAbgegeben
          ? 'NOTENMAPPE AUF DAS PULT LEGEN (E)' : 'ERST DER EINSATZ AM PULT (E)')
            : (g.frackOff && !this.frackOffUsed) ? 'KRAGEN AUFREISSEN (E)'
              : g.need === 'frack' ? 'NUR IM FRACK'
                : g.need === 'mappe' ? 'NOTENMAPPE FEHLT' : 'GESPERRT';
    const zielAktion = g.need === 'ablegen' || g.need === 'setzen';
    // Ein bewusst ausführbares Gespräch ist wichtiger als das danebenliegende
    // Ziel. Sonst sagt der Touch-Knopf ausgerechnet bei Ada wieder „TRITT“.
    if (dg < 96 && !npc) {
      best = {
        text: zielFrei ? `${g.name}: WEITER` : `${g.name}: ${grund}`,
        action: zielAktion && !zielFrei, key: 'E', x: g.x + 8, y: g.y - 2,
      };
    }
    if (!best) return null;
    return {
      text: best.text, action: !!best.action, key: best.key,
      sx: Math.round(best.x - this.cam.x), sy: Math.round(best.y - this.cam.y),
    };
  }

  collect(en) {
    switch (en.item) {
      case 'bierdeckel':
        this.deckel += 1;
        this.audio.play('pickup');
        this.message(`BIERDECKEL ${this.deckel}/${this.level.deckelTotal}`, 4.5, 2);
        break;
      case 'ohropax':
        this.ohropax = TUNE.ohropaxTime;
        this.audio.play('pickup');
        this.message('OHROPAX. ENDLICH RUHIG. FLÖTEN SIND JETZT DEKORATION.', 4.5, 2);
        break;
      case 'wasser':
        this.heat = Math.max(0, this.heat - 30);
        this.audio.play('pickup');
        this.message('WASSER. DER FRACK DAMPFT KURZ NICHT.', 4.5, 2);
        break;
      case 'mappe':
        this.hasMappe = true;
        this.audio.play('pickup');
        this.message('NOTENMAPPE GESICHERT. JETZT ZUM AUFZUG.', 4.5, 2);
        break;
      case 'stimmblatt': {
        // Ein Blatt allein ist kein Auftritt: erst drei Blätter ergeben die Mappe.
        this.stimmblaetter += 1;
        this.audio.play('pickup');
        const noetig = this.stimmblaetterNoetig || 3;
        if (this.stimmblaetter >= noetig) {
          this.hasMappe = true;
          this.events({ type: 'mappe' });   // main.js legt sie in den Spielstand
          this.message(`${en.found ? `${en.found} ` : ''}DIE NOTENMAPPE IST VOLLSTÄNDIG.`, 6.5, 2);
        } else {
          this.message(en.found
            ? `${en.found} · STIMME ${this.stimmblaetter}/${noetig}`
            : `STIMMBLATT ${this.stimmblaetter}/${noetig} — DIE MAPPE FÜLLT SICH`, 5.5, 2);
        }
        break;
      }
      case 'brezel':
        this.nerves = Math.min(this.maxNerves, this.nerves + 1);
        this.audio.play('pickup');
        this.message('BREZEL. EIN NERV ZURUECK. ES GEHT WEITER.', 4.5, 2);
        break;
      default: break;
    }
    this.burst(en.x + en.w / 2, en.y, '#e8c46a', 8);
  }

  damage(n, fromX) {
    const p = this.player;
    if (p.invuln > 0 || this.state !== 'play') return false;
    this.nerves -= n;
    p.invuln = this.diff.invuln;
    p.flash = 0.25;
    p.vx = Math.sign(p.x - (fromX ?? p.x)) * 110;
    p.vy = -90;
    this.invuln = this.diff.invuln;
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
    this.rows = [
      ['ZEIT', `${Math.floor(this.time / 60)}:${String(Math.floor(this.time % 60)).padStart(2, '0')}`],
      ['BIERDECKEL', `${this.deckel} / ${this.level.deckelTotal}`],
      ['IM TAKT GETROFFEN', String(this.taktHits)],
      ['NERVEN', String(this.nerves)],
    ];
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
    const tx = clamp(p.x + p.w / 2 - this.vw / 2, 0, this.level.w * TILE - this.vw);
    const ty = clamp(p.y + p.h / 2 - this.vh / 2 + 10, 0, this.level.h * TILE - this.vh);
    const k = Math.min(1, dt * 7);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    // Ganze Pixel: verhindert 1-px-Zittern von Figur und Umgebung
    this.cam.x = Math.round(this.cam.x);
    this.cam.y = Math.round(this.cam.y);
  }

  updateHints() {
    if (this.hint && this.time > this.hint.until) {
      this.hint = null;
      const next = this.hintQueue && this.hintQueue.shift();
      if (next) this.hint = { text: next.text, until: this.time + next.dur, prio: next.prio, at: this.time };
    }
  }

  zielText() {
    const basis = this.level.ziel || '';
    const g = this.level.goal || {};
    if (Array.isArray(this.level.storySteps)) {
      const step = this.level.storySteps.find((candidate) => {
        if (candidate.flag) return !this.storyFlags.has(candidate.flag);
        if (candidate.counter) return Number(this[candidate.counter] || 0) < candidate.atLeast;
        if (candidate.goal) return !this.goalErfuellt();
        return true;
      });
      if (step) {
        if (step.counter) return `${step.text} · ${this[step.counter] || 0}/${step.atLeast}`;
        return step.text;
      }
    }
    if (this.level.ruhig) {
      return this.setzen ? 'SITZEN UND ANKOMMEN' : 'DIE BANK UNTER DER LAUBE: HINSETZEN (E)';
    }
    if (this.stimmblaetterNoetig) {
      return `${basis} · STIMMBLÄTTER ${this.stimmblaetter}/${this.stimmblaetterNoetig}`;
    }
    if (g.need === 'einsatz') {
      const pult = this.entities.find((en) => en.kind === 'pult');
      const teil = pult ? pult.teil : 0;
      if (this.hasMappe && !this.mappeAbgegeben) return `${basis} · MAPPE AUF DAS PULT LEGEN (E)`;
      return `${basis} · EINSATZ ${teil}/${pult ? pult.noetig : 3}`;
    }
    if (g.applaus) return `${basis} · APPLAUS ${Math.round(this.applaus)}/${g.applaus}`;
    return basis;
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
      frackAbgelegt: this.frackAbgelegt,
      setzen: !!this.setzen,
      ruhig: !!this.level.ruhig,
      ziel: this.zielText(),
      stimmblaetter: this.stimmblaetter,
      stimmblaetterNoetig: this.stimmblaetterNoetig,
      hint: this.hint ? this.hint.text : null,
      state: this.state,
      hasMappe: this.hasMappe,
      applaus: this.level.applaus ? Math.round(this.applaus) : null,
      applausZiel: this.level.applaus ? this.level.goal.applaus : null,
      label: this.nearestLabel(),
      standNear: !!this.nearStand(),
      wetter: this.wetterKind,
      nass: Math.round(this.nass),
      gustDir: this.gustTimer > 0 ? this.gustDir : (this.gustWarn > 0 ? this.gustDir : 0),
      gustWarn: this.gustWarn > 0,
      blaetter: this.blaetter.length,
      friert: this.wetterKind === 'kaelte',
    };
  }

  // -------------------------------------------------------------- Zeichnen --
  draw(ctx) {
    const sh = this.shake > 0 ? this.shake / 2 : 0;
    const sway = this.stunTimer > 0 ? Math.sin(this.time * 3.2) * 2.2 : 0;
    const offX = (sh ? (Math.random() - 0.5) * sh : 0) + sway;
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
    this.drawDarkness(ctx, camX, camY);
    this.drawWetter(ctx, camX, camY);
    this.drawPlayer(ctx, camX, camY);
    this.drawParticles(ctx, camX, camY);
    this.drawWetterFx(ctx);
    this.drawScreenFx(ctx);
  }

  /** Schauplätze unter freiem Himmel — Grundlage für Hintergrund und Kacheln. */
  usesSky() {
    return this.level.setting === 'openair' || this.level.setting === 'garten';
  }

  drawBackground(ctx, camX, camY) {
    if (this.usesSky()) { this.drawSky(ctx, camX, camY); return; }
    const pal = this.pal();
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, this.vw, this.vh);
    // ferne Bogenreihen
    ctx.fillStyle = pal.far;
    const farOff = (camX * 0.25) % 96;
    for (let i = -1; i < this.vw / 96 + 2; i++) {
      const x = Math.round(i * 96 - farOff);
      for (let j = 0; j < 3; j++) {
        const y = Math.round(24 + j * 68 - camY * 0.12);
        ctx.fillRect(x + 6, y, 34, 54);
      }
    }
    // Rohre und Pfeiler
    ctx.fillStyle = pal.mid;
    const midOff = (camX * 0.5) % 128;
    for (let i = -1; i < this.vw / 128 + 2; i++) {
      const x = Math.round(i * 128 - midOff);
      ctx.fillRect(x, Math.round(120 - camY * 0.22), 6, 120);
      ctx.fillRect(x + 92, Math.round(96 - camY * 0.22), 4, 140);
    }
    // Staub
    ctx.fillStyle = 'rgba(220,214,190,0.22)';
    for (let i = 0; i < 16; i++) {
      const h1 = hash2(i, 7, 3);
      const h2 = hash2(i, 13, 5);
      const x = Math.round((h1 * 800 - camX * 0.7 + 800) % 800) - 8;
      const y = Math.round((h2 * 460 - camY * 0.7 + Math.sin(this.time * 0.7 + i) * 6 + 460) % 460) - 8;
      ctx.fillRect(x, y, 1, 1);
    }
    // Bodennebel
    ctx.fillStyle = 'rgba(30,24,48,0.55)';
    ctx.fillRect(0, this.vh - 26, this.vw, 26);
  }

  drawLights(ctx, camX, camY) {
    // Im Dunkeln sind die Pultlampen das Wichtigste im Bild
    for (const g of this.level.gleams || []) {
      const gx = Math.round(g.tx * TILE - camX), gy = Math.round(g.ty * TILE - camY);
      if (gx < -16 || gy < -16 || gx > this.vw + 16 || gy > this.vh + 16) continue;
      ctx.fillStyle = 'rgba(255,214,140,0.16)';
      ctx.fillRect(gx - 3, gy - 2, TILE + 6, TILE + 4);
      ctx.fillStyle = '#3a3238';
      ctx.fillRect(gx + 5, gy + 2, 6, 12);
      ctx.fillStyle = '#ffd68c';
      ctx.fillRect(gx + 6, gy + 3, 4, 4);
      ctx.fillStyle = '#fff3cf';
      ctx.fillRect(gx + 7, gy + 4, 2, 2);
    }
    for (const l of this.level.lights) {
      const x = Math.round(l.x - camX), y = Math.round(l.y - camY);
      ctx.fillStyle = 'rgba(255,206,120,0.05)';
      ctx.fillRect(x - 6, y - 4, l.w + 12, l.h + 8);
      ctx.fillStyle = 'rgba(255,196,104,0.08)';
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

  /**
   * Wie eine Kachel aussieht: 'stein' | 'gras' | 'erde' | 'holz' | 'morsch'
   * oder null (nichts zeichnen). Im Freien wird inneres Gestein übersprungen,
   * damit der Himmel durchscheint — sonst sieht Open Air aus wie ein Keller.
   */
  tileLook(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.level.w || ty >= this.level.h) return null;
    const v = this.grid[ty][tx];
    if (!v) return null;
    const freiluft = this.usesSky();
    if (v === 1) {
      if (freiluft) {
        const pxT = tx * TILE, pyT = ty * TILE;
        for (const sh of this.level.shelters || []) {
          if (pyT >= sh.y && pyT < sh.y + TILE && pxT >= sh.x && pxT < sh.x + sh.w) return 'vordach';
        }
        const innen = this.tileVal(tx - 1, ty) === 1 && this.tileVal(tx + 1, ty) === 1
          && this.tileVal(tx, ty - 1) === 1 && this.tileVal(tx, ty + 1) === 1;
        if (innen) return null;
        if (this.tileVal(tx, ty - 1) === 1) return 'erde';
        // freiliegende einzelne Platte: Bühne, Treppe oder Steg
        if (this.tileVal(tx, ty + 1) !== 1) return 'buehne';
        return 'gras';
      }
      return 'stein';
    }
    if (v === 2) return 'holz';
    if (v === 3) return 'morsch';
    return null;
  }

  /** Freiluft-Himmel: Farbe je Wetterlage, Sonne, Hügel, ziehende Wolken. */
  drawSky(ctx, camX, camY) {
    const palette = this.level.setting === 'garten' ? ['#2a3a6e', '#e08a52', '#f6d79a'] : {
      sonne: ['#243a6b', '#d97b45', '#f2c98a'],
      wind: ['#2a3a52', '#6d7c94', '#bcc5d2'],
      regen: ['#121826', '#232c3d', '#3d4759'],
      kaelte: ['#0e1830', '#27406a', '#82a6cb'],
    }[this.wetterKind] || ['#221d38', '#3a3454', '#6b5f80'];
    const g = ctx.createLinearGradient(0, 0, 0, this.vh * 0.8);
    g.addColorStop(0, palette[0]);
    g.addColorStop(0.6, palette[1]);
    g.addColorStop(1, palette[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.vw, this.vh);
    const horiz = Math.round(this.vh * 0.66 - camY * 0.18);
    // Sonne bzw. Abendsonne
    if (this.wetterKind === 'sonne' || this.wetterKind === 'kaelte') {
      const sx = Math.round(this.vw * 0.72 - camX * 0.05 + (this.wetterKind === 'kaelte' ? -40 : 0));
      const sy = horiz - 46;
      ctx.fillStyle = this.wetterKind === 'sonne' ? 'rgba(255,214,140,0.30)' : 'rgba(200,224,255,0.22)';
      ctx.fillRect(sx - 12, sy - 12, 24, 24);
      ctx.fillStyle = this.wetterKind === 'sonne' ? '#ffe9b0' : '#e8f1ff';
      ctx.fillRect(sx - 5, sy - 5, 10, 10);
    }
    // zwei Hügelketten mit Parallaxe
    const reihen = [
      { sp: 0.22, h: 26, farbe: 'rgba(20,30,44,0.75)', breite: 150 },
      { sp: 0.42, h: 16, farbe: 'rgba(28,44,52,0.85)', breite: 96 },
    ];
    for (const r of reihen) {
      ctx.fillStyle = r.farbe;
      const off = (camX * r.sp) % r.breite;
      for (let i = -1; i < this.vw / r.breite + 2; i++) {
        const bx = Math.round(i * r.breite - off);
        const bh = r.h + Math.round(Math.sin((i * 1.7 + camX * 0.001)) * 6);
        for (let k = 0; k < bh; k++) {
          const w = Math.round(30 * (1 - k / (bh + 8)));
          ctx.fillRect(bx + Math.round((r.breite - w) / 2), horiz - bh + k, w, 1);
        }
      }
    }
    // Wolken ziehen mit dem Wind
    const driftTempo = this.wetterKind === 'wind' ? 22 : 5;
    const wolken = this.wetterKind === 'regen' ? '#525c70' : this.wetterKind === 'sonne' ? '#f6d9ae' : '#c6cede';
    ctx.fillStyle = wolken;
    const off2 = ((camX * 0.12) + this.time * driftTempo) % 220;
    for (let i = -1; i < this.vw / 220 + 2; i++) {
      const cx0 = Math.round(i * 220 - off2);
      const cy0 = Math.round(horiz * 0.36 + (i % 3) * 12);
      ctx.fillRect(cx0 + 10, cy0, 34, 3);
      ctx.fillRect(cx0 + 18, cy0 - 3, 22, 3);
      ctx.fillRect(cx0 + 6, cy0 + 3, 46, 2);
    }
    // Dunst am Horizont
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, horiz - 2, this.vw, 4);
  }

  drawTiles(ctx, camX, camY) {
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const x1 = Math.min(this.level.w - 1, Math.ceil((camX + this.vw) / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const y1 = Math.min(this.level.h - 1, Math.ceil((camY + this.vh) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const stil = this.tileLook(tx, ty);
        if (!stil) continue;
        const px = Math.round(tx * TILE - camX), py = Math.round(ty * TILE - camY);
        if (stil === 'gras') {
          ctx.fillStyle = '#4a3a28';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#3f6b3a';
          ctx.fillRect(px, py, TILE, 7);
          ctx.fillStyle = '#51823f';
          ctx.fillRect(px, py, TILE, 3);
          ctx.fillStyle = '#61944a';
          const halme = 1 + Math.floor(hash2(tx, ty, 3) * 3);
          for (let i = 0; i < halme; i++) {
            ctx.fillRect(px + Math.floor(hash2(tx, ty, i + 4) * 15), py - 1, 1, 2);
          }
          ctx.fillStyle = '#2e4f2b';
          ctx.fillRect(px, py + 7, TILE, 1);
        } else if (stil === 'buehne') {
          ctx.fillStyle = '#6b4a26';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#7d5a30';
          ctx.fillRect(px, py, TILE, 5);
          ctx.fillStyle = '#94693a';
          ctx.fillRect(px, py, TILE, 2);
          ctx.fillStyle = '#523717';
          for (let k = 0; k < 4; k++) ctx.fillRect(px, py + 5 + k * 3, TILE, 1);
          ctx.fillStyle = '#3a2712';
          ctx.fillRect(px, py + TILE - 2, TILE, 2);
        } else if (stil === 'vordach') {
          ctx.fillStyle = '#2f2a34';
          ctx.fillRect(px, py, TILE, TILE);
          for (let k = 0; k < 4; k++) {
            ctx.fillStyle = k % 2 === 0 ? '#dcd3c0' : '#a8433a';
            ctx.fillRect(px + k * 4, py, 4, 8);
          }
          ctx.fillStyle = '#8e8578';
          ctx.fillRect(px, py, TILE, 2);
          ctx.fillStyle = '#1d1a24';
          ctx.fillRect(px, py + 8, TILE, 2);
        } else if (stil === 'erde') {
          ctx.fillStyle = '#4a3a28';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#57452f';
          const n = 2 + Math.floor(hash2(tx, ty, 1) * 3);
          for (let i = 0; i < n; i++) {
            ctx.fillRect(px + Math.floor(hash2(tx, ty, i + 2) * 13), py + Math.floor(hash2(tx, ty, i + 9) * 13), 3, 2);
          }
        } else if (stil === 'stein') {
          const fp = this.pal();
          ctx.fillStyle = fp.stein;
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = fp.stein2;
          const n = 3 + Math.floor(hash2(tx, ty, 1) * 3);
          for (let i = 0; i < n; i++) {
            const hx = Math.floor(hash2(tx, ty, i + 2) * 12);
            const hy = Math.floor(hash2(tx, ty, i + 9) * 14);
            ctx.fillRect(px + hx, py + hy + 1, 4, 2);
          }
          if (this.tileVal(tx, ty - 1) !== 1) {
            ctx.fillStyle = fp.kante;
            ctx.fillRect(px, py, TILE, 2);
            ctx.fillStyle = fp.kante2;
            ctx.fillRect(px, py, TILE, 1);
          }
        } else if (stil === 'holz') {
          ctx.fillStyle = '#4d3a22';
          ctx.fillRect(px, py, TILE, 6);
          ctx.fillStyle = '#6b5330';
          ctx.fillRect(px, py, TILE, 2);
          ctx.fillStyle = '#3a2b18';
          ctx.fillRect(px + 5, py + 2, 2, 4);
          ctx.fillRect(px + 11, py + 2, 2, 4);
        } else if (stil === 'morsch') {
          const wob = Math.sin(this.time * 1.6 + tx) * 0.3;
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
    // Die Bank im Kleingarten ist kein Portal: sie wird als Bank gezeichnet.
    if (g.bench) {
      const spr = this.spr('bank');
      blit(ctx, spr, x, Math.round((g.y + g.h) - camY) - spr.h);
      const pulse = 0.5 + Math.sin(this.time * 1.6) * 0.5;
      ctx.fillStyle = `rgba(232,196,106,${0.25 + pulse * 0.25})`;
      ctx.fillRect(x + 14, y - 6, TILE - 8, 3);
      return;
    }
    ctx.fillStyle = '#0d0a14';
    ctx.fillRect(x + 1, y, TILE - 2, g.h);
    ctx.fillStyle = '#3a3346';
    ctx.fillRect(x, y, 2, g.h);
    ctx.fillRect(x + TILE - 2, y, 2, g.h);
    ctx.fillStyle = '#5de0cf';
    for (let i = 0; i < g.h - 6; i += 6) {
      ctx.fillRect(x + 7, y + 3 + i, 2, 3);
    }
    const pulse = 0.5 + Math.sin(this.time * 1.6) * 0.5;   // langsam, kein Flackern
    ctx.fillStyle = `rgba(93,224,207,${0.3 + pulse * 0.2})`;
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
            ctx.fillStyle = 'rgba(93,224,207,0.75)';
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
          const top = y + en.h - spr.h + bob;
          blit(ctx, spr, x, top, en.dir < 0, en.flash);
          if (en.aim > 0) {
            // ruhige Vorwarnung: Ausrufezeichen und Schusslinie, kein Blinken
            const len = Math.round(this.vw * this.diff.fireRange);
            ctx.fillStyle = 'rgba(232,196,106,0.75)';
            ctx.fillRect(x + 6, top - 10, 2, 5);
            ctx.fillRect(x + 6, top - 4, 2, 2);
            ctx.fillStyle = 'rgba(232,196,106,0.22)';
            ctx.fillRect(en.dir > 0 ? x + en.w : x - len, top + 8, len, 1);
          }
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
            const range = this.vw * this.diff.sopranRange * (this.glanz > 0.5 ? 1.2 : 1) * grow;
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
        case 'dirigent': {
          const spr = this.spr('dirigent');
          blit(ctx, spr, x, y + en.h - spr.h, en.dir < 0, en.flash);
          if (en.aim > 0) {
            ctx.fillStyle = 'rgba(232,196,106,0.8)';
            ctx.fillRect(x + 6, y - 10, 2, 5);
            ctx.fillRect(x + 6, y - 4, 2, 2);
          }
          if (en.stun > 0) this.drawStun(ctx, x + 7, y - 6);
          break;
        }
        case 'ramona': {
          const spr = this.spr('ramona');
          blit(ctx, spr, x - 1, y + en.h - spr.h, false, 0);
          break;
        }
        case 'grill': {
          const spr = this.spr('grill');
          blit(ctx, spr, x - 2, y + en.h - spr.h, false, 0);
          if (Math.sin(this.time * 2) > 0) {
            ctx.fillStyle = 'rgba(255,170,90,0.20)';
            ctx.fillRect(x - 2, y - 10, 24, 8);
          }
          break;
        }
        case 'koffer': {
          const spr = this.spr('koffer');
          blit(ctx, spr, x, y, en.dir < 0, en.flash);
          break;
        }
        case 'schrank': {
          const spr = this.spr('schrank');
          blit(ctx, spr, x, y, false, 0);
          if (en.near) {
            // dezente Markierung: hier ist eine Aktion möglich
            ctx.fillStyle = 'rgba(93,224,207,0.75)';
            ctx.fillRect(x + 5, y - 10, 6, 2);
          }
          break;
        }
        case 'pult': {
          const spr = this.spr('notenstaender');
          blit(ctx, spr, x, y + en.h - spr.h, false, 0);
          // Fortschritt des Einsatzes: drei Punkte über dem Pult (DRR-04).
          for (let i = 0; i < en.noetig; i++) {
            ctx.fillStyle = i < en.teil ? '#e8c46a' : '#4a4458';
            ctx.fillRect(x + 3 + i * 4, y - 8, 3, 3);
          }
          if (en.near) {
            ctx.fillStyle = 'rgba(93,224,207,0.75)';
            ctx.fillRect(x + 5, y - 14, 6, 2);
          }
          break;
        }
        case 'npc': {
          const spr = this.spr(en.spr);
          blit(ctx, spr, x, y + en.h - spr.h, !!en.flip, 0);
          if (en.near) {
            ctx.fillStyle = 'rgba(93,224,207,0.8)';
            ctx.fillRect(x + Math.max(1, Math.floor(en.w / 2) - 3), y - 7, 7, 2);
          }
          break;
        }
        case 'decor': {
          const spr = this.spr(en.spr);
          blit(ctx, spr, x, y + en.h - spr.h, !!en.flip, 0, en.alpha ?? 1);
          break;
        }
        default: break;
      }
    }
  }

  drawStun(ctx, x, y) {
    ctx.fillStyle = '#e8c46a';
    const t = this.time * 2.5;
    for (let i = 0; i < 3; i++) {
      const a = t + (i * Math.PI * 2) / 3;
      ctx.fillRect(Math.round(x + Math.cos(a) * 7), Math.round(y + Math.sin(a) * 2), 2, 2);
    }
  }

  drawProjectiles(ctx, camX, camY) {
    for (const pr of this.projectiles) {
      const x = Math.round(pr.x - camX), y = Math.round(pr.y - camY);
      if (pr.kind === 'baton') {
        // Taktstock: je nach Flugphase waagerecht oder senkrecht
        ctx.fillStyle = '#f0eee4';
        const waagerecht = Math.floor(pr.spin || 0) % 2 === 0;
        if (waagerecht) ctx.fillRect(x, y + 1, 10, 2);
        else ctx.fillRect(x + 4, y - 3, 2, 10);
        ctx.fillStyle = 'rgba(240,238,228,0.35)';
        ctx.fillRect(waagerecht ? x - 3 : x + 4, waagerecht ? y + 1 : y - 6, waagerecht ? 3 : 2, waagerecht ? 2 : 3);
        continue;
      }
      const dirR = pr.vx >= 0 ? 1 : -1;
      const cx = x + pr.w / 2, cy = y + pr.h / 2;
      // Schallwelle, zweimal gezeichnet: erst dick und dunkel als Rand, dann hell.
      // Ohne den Rand verschwindet sie im hellen Himmel (Akt 3).
      for (const [, breite, farbe] of [[0, 4, 'rgba(10,7,14,0.9)'], [1, 1.5, '#ffd08a']]) {
        ctx.lineWidth = breite;
        ctx.strokeStyle = farbe;
        for (let i = 0; i < 3; i++) {
          const r = 3 + i * 3;
          const mid = dirR > 0 ? 0 : Math.PI;
          ctx.beginPath();
          ctx.arc(cx - dirR * 4, cy, r, mid - 0.8, mid + 0.8);
          ctx.stroke();
        }
      }
      // Kern mit Rand, damit auch der Punkt lesbar bleibt
      ctx.fillStyle = 'rgba(10,7,14,0.9)';
      ctx.fillRect(cx - 3, cy - 3, 6, 6);
      ctx.fillStyle = '#fff2cf';
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
    }
  }

  drawPlayer(ctx, camX, camY) {
    const p = this.player;
    let frame = 'roland_idle';
    if (p.h === PHYS.duckH) frame = 'roland_duck';
    else if (!p.onGround) frame = 'roland_jump';
    else if (Math.abs(p.vx) > 12) frame = Math.floor(p.animT * 7) % 2 === 0 ? 'roland_walk1' : 'roland_walk2';
    const spr = this.spr(frame, OUTFIT_PALETTES[this.outfit.id]);
    const x = Math.round(p.x - camX - 2);
    const y = Math.round(p.y - camY + p.h - spr.h);
    const hurt = p.invuln > 0;
    blit(ctx, spr, x, y, p.dir < 0, p.flash, hurt ? 0.6 : 1);
    // Die vollständige Mappe reist sichtbar mit statt nur als boolescher Wert.
    if (this.hasMappe && !this.mappeAbgegeben) {
      const mappe = this.spr('mappe');
      blit(ctx, mappe, x + (p.dir < 0 ? -7 : 10), y + 10, p.dir < 0, 0, hurt ? 0.6 : 1);
    }
    if (hurt) {
      // Ruhender Schutzrahmen statt Blinken: man sieht den Schutz, ohne dass
      // die Figur flimmert.
      const a = 'rgba(93,224,207,0.5)';
      ctx.fillStyle = a;
      ctx.fillRect(x - 2, y - 2, spr.w + 4, 1);
      ctx.fillRect(x - 2, y + spr.h + 1, spr.w + 4, 1);
      ctx.fillRect(x - 2, y - 2, 1, spr.h + 4);
      ctx.fillRect(x + spr.w + 1, y - 2, 1, spr.h + 4);
    }
    // Glanz auf dem Haarkranz: gleichmäßig, ohne Pulsieren
    if (this.glanz > 0.25) {
      const a = 0.3 + this.glanz * 0.5;
      const gx = p.dir < 0 ? x + 3 : x + 6;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(gx, y + 1, 2, 1);
      ctx.fillRect(gx - 1, y + 2, 1, 1);
      ctx.fillRect(gx + 2, y + 2, 1, 1);
      ctx.fillStyle = `rgba(255,255,255,${0.2 + this.glanz * 0.25})`;
      ctx.fillRect(gx - 4, y - 1, 8, 1);
    }
    if (this.frackBoost > 0) {
      ctx.fillStyle = 'rgba(240,238,228,0.16)';
      ctx.fillRect(x - 3, y - 4, 18, 26);
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

  drawWetter(ctx, camX, camY) {
    // Vordach als gestreiftes Dach
    for (const sh of this.level.shelters || []) {
      const x = Math.round(sh.x - camX);
      const y = Math.round(sh.y - camY);
      for (let i = 0; i < sh.w; i += 8) {
        ctx.fillStyle = i % 16 === 0 ? '#c8402f' : '#e8e2d0';
        ctx.fillRect(x + i, y - 10, 8, 10);
      }
      ctx.fillStyle = '#4a3a52';
      ctx.fillRect(x, y - 12, sh.w, 2);
    }
    // fliegende Notenblätter
    const blatt = this.spr('blatt');
    for (const b of this.blaetter) {
      blit(ctx, blatt, Math.round(b.x - camX), Math.round(b.y - camY + Math.sin(b.t * 4) * 2), b.vx < 0);
    }
  }

  drawWetterFx(ctx) {
    if (this.wetterKind === 'regen') {
      ctx.fillStyle = 'rgba(170,195,225,0.45)';
      for (let i = 0; i < 46; i++) {
        const x = Math.round((hash2(i, 1, 3) * this.vw + this.time * 320 + i * 6) % this.vw);
        const y = Math.round((hash2(i, 2, 5) * this.vh + this.time * 1100) % this.vh);
        ctx.fillRect(x, y, 1, 4);
      }
      ctx.fillStyle = `rgba(40,60,90,${0.16 + this.nass / 700})`;
      ctx.fillRect(0, 0, this.vw, this.vh);
    } else if (this.wetterKind === 'sonne') {
      ctx.fillStyle = 'rgba(255,190,110,0.12)';
      ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.fillStyle = 'rgba(255,220,150,0.10)';
      ctx.fillRect(0, 0, this.vw, 8);
    } else if (this.wetterKind === 'kaelte') {
      ctx.fillStyle = 'rgba(150,190,230,0.14)';
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
    if (this.gustWarn) {
      ctx.fillStyle = 'rgba(232,196,106,0.75)';
      const cx = this.gustDir > 0 ? 8 : this.vw - 14;
      ctx.fillRect(cx, this.vh / 2 - 6, 6, 2);
      ctx.fillRect(this.gustDir > 0 ? cx + 4 : cx - 2, this.vh / 2 - 9, 2, 8);
    }
  }

  drawScreenFx(ctx) {
    // Takt: ein weicher Impuls am unteren Rand statt Blitzen im ganzen Bild.
    const pulse = Math.max(0, 1 - this.beatPhase * 2.6);
    if (pulse > 0) {
      ctx.fillStyle = `rgba(93,224,207,${0.1 * pulse})`;
      ctx.fillRect(0, this.vh - 3, this.vw, 3);
    }
    // Hitze: gleichmäßig warm, kein Flimmern
    if (this.heat > 45) {
      const a = Math.min(0.4, (this.heat - 45) / 280);
      ctx.fillStyle = `rgba(239,143,58,${a})`;
      ctx.fillRect(0, 0, this.vw, 7);
      ctx.fillRect(0, this.vh - 7, this.vw, 7);
    }
    // Tempo-Verschleppung
    if (this.slowField > 0.05) {
      ctx.fillStyle = `rgba(40,30,80,${0.24 * this.slowField})`;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
    // Kreislauf: ruhig warm, das Wackeln macht die Kamera
    if (this.stunTimer > 0) {
      ctx.fillStyle = 'rgba(232,185,138,0.16)';
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
    ctx.fillStyle = 'rgba(8,6,14,0.3)';
    ctx.fillRect(0, 0, this.vw, 6);
    ctx.fillRect(0, this.vh - 6, this.vw, 6);
  }
}
