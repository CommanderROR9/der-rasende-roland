// racer.js — Pseudo-3D-Fahrinterludium (Cabrio, später Motorrad).
// Klassische Segmentstraße: die Strecke besteht aus Segmenten mit Kurven- und
// Hügelwert; die Kamera sitzt hinter dem Auto und projiziert nach vorn.
// Bewusst DOM-frei, damit dieselbe Logik headless geprüft werden kann.
import { DIFFICULTY, BPM_BASE } from './config.js';
import { SPRITES } from './sprites.js';
import { spriteCanvas, hash2 } from './render.js';
import { drivingCue, resetJourney, updateJourney, finishJourney } from './cabrio-drive.js';
import { CABRIO_SPRITES, CABRIO_PALETTE, drawJourneySky, drawJourneySegment, drawJourneyCar, drawJourneyHud } from './cabrio-art.js';

export const SEG_LEN = 200;      // Länge eines Segments in Welteinheiten
export const ROAD_W = 2000;      // halbe Straßenbreite
export const DRAW_DIST = 170;    // Segmente in Sichtweite
export const CAM_H = 1050;       // Kamerahöhe
export const FOV = 100;
export const CAM_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
const FOG = '#241b33';

// Breite der Objekte als Anteil der projizierten halben Straßenbreite.
const SPRITE_F = { auto: 0.30, lkw: 0.40, mx5: 0.34, motorrad: 0.22, baum: 0.22, schild: 0.13, blitzer: 0.15, notenstaender: 0.09, schlagloch: 0.17, laub: 0.16 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const fogAt = (d, density) => 1 / Math.pow(Math.E, d * d * density);
const kmh = (unitsPerSec) => (unitsPerSec / SEG_LEN) * 3.0;   // Anzeige-Eichung
function fmt(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** Streckenbeschreibung -> Segmentliste (Kurven und Hügel werden aufsummiert). */
export function buildTrack(spec) {
  const segs = [];
  let z = 0;
  let h = 0;
  for (const part of spec) {
    const len = part.len || 40;
    for (let i = 0; i < len; i++) {
      const hill = part.hill ? Math.round(part.hill * Math.sin((i / len) * Math.PI) / 2) : 0;
      h += hill;
      segs.push({
        index: segs.length,
        curve: (part.curve || 0) * (part.ease
          ? (1 - Math.cos(Math.PI * Math.min(1, i / part.ease, (len - 1 - i) / part.ease))) / 2 : 1),
        y: h,
        p1: { world: { x: 0, y: h, z }, camera: {}, screen: {} },
        p2: { world: { x: 0, y: h + hill, z: z + SEG_LEN }, camera: {}, screen: {} },
        sprites: [],
      });
      z += SEG_LEN;
    }
  }
  for (let i = 0; i < segs.length; i++) {
    const n = segs[(i + 1) % segs.length];
    segs[i].p2.world.y = n.p1.world.y;
  }
  return { segments: segs, length: segs.length * SEG_LEN };
}

/** Perspektivische Projektion eines Streckenpunkts. */
export function project(p, camX, camY, camZ, width, height) {
  p.camera.x = (p.world.x || 0) - camX;
  p.camera.y = (p.world.y || 0) - camY;
  p.camera.z = (p.world.z || 0) - camZ;
  p.screen.scale = CAM_DEPTH / (p.camera.z || 1);
  p.screen.x = Math.round(width / 2 + (p.screen.scale * p.camera.x * width) / 2);
  p.screen.y = Math.round(height / 2 - (p.screen.scale * p.camera.y * height) / 2);
  p.screen.w = Math.round((p.screen.scale * ROAD_W * width) / 2);
}

export class Racer {
  constructor({ level, input, audio, events = () => {}, view, difficulty = 'gemuetlich' }) {
    this.level = level;
    this.input = input;
    this.audio = audio || { play() {}, engine() {}, engineOff() {} };
    this.events = events;
    this.vw = view.w;
    this.vh = view.h;
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'gemuetlich';
    this.diff = DIFFICULTY[this.difficulty];
    const built = buildTrack(level.track);
    this.segments = built.segments;
    this.trackLength = built.length;
    this.spr = new Map();
    this.reset();
  }

  sprite(name) {
    if (!this.spr.has(name)) {
      const custom = this.level.journey && CABRIO_SPRITES[name];
      this.spr.set(name, spriteCanvas(custom ? `cabrio-${name}` : name, custom || SPRITES[name], custom ? CABRIO_PALETTE : undefined));
    }
    return this.spr.get(name);
  }

  setDifficulty(key) {
    if (!DIFFICULTY[key]) return;
    this.difficulty = key;
    this.diff = DIFFICULTY[key];
    this.message(`${this.diff.label}: ${this.diff.note}`, 5, 2);
  }

  reset() {
    this.state = 'play';
    this.pauseReason = null;
    this.time = 0;
    this.position = 0;
    this.playerX = 0;
    this.playerZ = 420;
    this.speed = 0;
    this.fahrzeug = this.level.fahrzeug || 'mx5';
    this.nacht = !!this.level.nacht;
    this.tunnel = this.level.tunnel || [];
    this.rutsch = 0;
    // Das Motorrad ist flinker als das Cabrio
    const grund = SEG_LEN * 58 * (this.difficulty === 'gemuetlich' ? 0.8 : 1);
    this.maxSpeed = grund * (this.fahrzeug === 'motorrad' ? 1.22 : 1);
    if (this.level.journey) this.maxSpeed = this.level.journey.cruise * (this.difficulty === 'gemuetlich' ? 0.88 : 1);
    this.damage = 0;
    this.hits = 0;
    this.topSpeed = 0;
    this.shake = 0;
    this.rain = false;
    this.panneTimer = 0;
    this.standTilt = 0;
    this.hint = null;
    this.hintQueue = [];
    this.weather = (this.level.weather || []).map((w) => ({ ...w, done: false }));
    this.takts = (this.level.takts || []).map((t) => ({ ...t, done: false }));
    this.taktBpm = this.level.bpm || BPM_BASE;
    this.bpm = this.taktBpm;
    this.beats = 0;
    this.beatPhase = 0;

    this.traffic = [];
    const segmente = this.trackLength / SEG_LEN;
    // Einer etwa alle 55 Segmente — sonst fährt man allein durch die Gegend.
    const cars = Math.max(10, Math.round((segmente / 42) * (this.difficulty === 'gemuetlich' ? 0.75 : 1)));
    for (let i = 0; i < cars; i++) {
      const oncoming = i % 3 === 0;
      const base = oncoming ? -0.55 : 0.18 + (i % 2) * 0.4;
      const z0 = 2500 + (i / cars) * (this.trackLength - 5000) + hash2(i, 3, 7) * 400;
      this.traffic.push({
        z: z0,
        lane: clamp(base + (hash2(i, 9, 4) - 0.5) * 0.16, -0.9, 0.9),
        speed: oncoming ? -SEG_LEN * 13 : SEG_LEN * (7 + hash2(i, 5, 2) * 6),
        kind: i % 6 === 5 ? 'lkw' : 'auto',
        passed: false,
      });
      // Kolonnen: gelegentlich hängt noch einer direkt dahinter
      if (!oncoming && hash2(i, 17, 8) > 0.62) {
        this.traffic.push({
          z: z0 + SEG_LEN * (5 + hash2(i, 19, 9) * 6),
          lane: clamp(base + 0.06, -0.9, 0.9),
          speed: SEG_LEN * 9,
          kind: 'auto',
          passed: false,
        });
      }
    }
    this.roadside = [];
    const rs = Math.round(segmente / 6);
    for (let i = 0; i < rs; i++) {
      const pct = (i + 0.5) / rs;
      const side = i % 2 === 0 ? -1 : 1;
      const kind = i % 17 === 0 ? 'blitzer'
        : (i % 11 === 0 ? 'lkw' : (i % 4 === 0 ? 'schild' : 'baum'));
      this.roadside.push({
        z: pct * this.trackLength,
        x: side * (kind === 'lkw' ? 1.5 : 1.25 + hash2(i, 1, 1) * 0.8),
        kind, done: false,
      });
    }
    // Schlaglöcher auf der Fahrbahn
    // Nasses Laub: kein Krach, aber der Grip ist kurz weg
    this.laub = [];
    const laubAnzahl = Math.max(6, Math.round(this.trackLength / SEG_LEN / 26));
    for (let i = 0; i < laubAnzahl; i++) {
      this.laub.push({
        z: 6000 + (i / laubAnzahl) * (this.trackLength - 9000),
        lane: (hash2(i, 41, 9) - 0.5) * 1.5,
        done: false,
      });
    }
    if (this.thisLaubAktiv !== false) { /* Laub ist immer da */ }
    this.potholes = [];
    const holes = Math.max(8, Math.round(segmente / 44));
    for (let i = 0; i < holes; i++) {
      this.potholes.push({
        z: 6000 + (i / holes) * (this.trackLength - 9000),
        lane: (hash2(i, 21, 6) - 0.5) * 1.25,
        done: false,
      });
    }
    this.bumps = 0;
    this.blitze = 0;
    if (this.level.journey) resetJourney(this);
    this.hud = this.buildHud();
  }

  pause(reason = 'user') {
    if (this.state === 'play') { this.state = 'paused'; this.pauseReason = reason; this.audio.engineOff(); }
  }
  resume() { if (this.state === 'paused') { this.state = 'play'; this.pauseReason = null; } }

  message(text, dur = 4.5, prio = 1) {
    if (!text) return false;
    if (this.hint && this.time - this.hint.at < 1.5 && this.hint.prio >= prio) {
      if (!this.hintQueue.some((q) => q.text === text) && this.hintQueue.length < 5) {
        this.hintQueue.push({ text, dur, prio });
      }
      return false;
    }
    if (this.hint && this.time - this.hint.at < 1.5
      && !this.hintQueue.some((q) => q.text === this.hint.text) && this.hintQueue.length < 5) {
      this.hintQueue.push({ text: this.hint.text, dur: 4, prio: this.hint.prio });
    }
    this.hint = { text, until: this.time + dur, prio, at: this.time };
    return true;
  }

  // --------------------------------------------------------------- Simulation --
  update(dt) {
    if (this.state !== 'play') return;
    this.alignJourneyCamera();
    this.time += dt;
    const inp = this.input;

    // Gas gibt es automatisch: am Handy muss man nur lenken.
    const lenkung = inp.axis();
    let ziel = this.maxSpeed * (this.rain ? 0.8 : 1);
    if (inp.action()) ziel *= this.level.journey ? 0.30 : 0.35;
    if (Math.abs(this.playerX) > 1) ziel *= 0.34;
    if (this.panneTimer > 0) { ziel = 0; this.panneTimer -= dt; }

    const rate = this.speed < ziel ? 2600 : 5000;
    this.speed += clamp(ziel - this.speed, -rate * dt, rate * dt);
    this.speed = clamp(this.speed, 0, this.maxSpeed);
    this.topSpeed = Math.max(this.topSpeed, this.speed);

    const seg = this.segmentAt(this.position + (this.level.journey ? this.playerZ : 0));
    const curve = seg ? seg.curve : 0;
    const pct = this.speed / this.maxSpeed;
    // In der Kurve zieht es nach außen, Lenken arbeitet dagegen
    this.lenkung = inp.axis();
    const flieh = this.diff.centrifugal * (this.rain ? 1.5 : 1) * (this.rutsch > 0 ? 1.8 : 1);
    this.playerX -= curve * pct * pct * flieh * dt * 1.9;
    this.playerX += lenkung * dt * (1.5 + pct * 1.7) * (this.rain ? 0.85 : 1);
    this.playerX = clamp(this.playerX, -1.9, 1.9);

    if (!this.level.journey && Math.abs(curve) >= 2 && Math.abs(lenkung) > 0.2 && this.standTilt === 0 && pct > 0.4) {
      this.standTilt = 1;
      this.message('DER NOTENSTÄNDER KIPPT UM. WIEDER MAL.', 4, 1);
    }
    if (Math.abs(curve) < 1) this.standTilt = Math.max(0, this.standTilt - dt * 0.4);

    const vorher = this.position;
    this.position = this.level.journey ? Math.min(this.trackLength - this.playerZ, this.position + this.speed * dt)
      : (this.position + this.speed * dt) % this.trackLength;
    // Streckenende erreicht = angekommen (die Strecke ist eine Route, kein Rundkurs)
    if ((this.level.journey && this.position >= this.trackLength - this.playerZ)
      || (this.position < vorher && this.time > 3)) { this.complete(); this.hud = this.buildHud(); return; }
    this.updateObjects(dt);
    this.updateStrecke();
    if (this.level.journey) updateJourney(this, dt);
    this.updateTakt(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22);
    if (this.blitze > 0) this.blitze = Math.max(0, this.blitze - dt * 1.6);
    if (this.hint && this.time > this.hint.until) {
      this.hint = null;
      const next = this.hintQueue.shift();
      if (next) this.hint = { text: next.text, until: this.time + next.dur, prio: next.prio, at: this.time };
    }
    if (this.audio.engine) this.audio.engine(clamp(this.speed / this.maxSpeed, 0, 1));
    this.hud = this.buildHud();
  }

  updateTakt(dt) {
    this.bpm = this.taktBpm;
    this.beatPhase += dt * (this.bpm / 60);
    if (this.beatPhase >= 1) {
      this.beatPhase -= 1;
      this.beats += 1;
      const nah = this.traffic.some((c) => Math.abs(c.z - (this.position + this.playerZ)) < 6000);
      if (nah && this.beats % 2 === 0) this.audio.play('beat');
    }
  }

  updateStrecke() {
    const pct = this.position / this.trackLength;
    for (const w of this.weather) {
      if (!w.done && pct >= w.at) {
        w.done = true;
        this.rain = !!w.rain;
        this.message(w.label, 6, 2);
      }
    }
    for (const t of this.takts) {
      if (!t.done && pct >= t.at) {
        t.done = true;
        this.taktBpm = t.bpm;
        this.message(`${t.label} · ${t.bpm} BPM`, 5, 2);
      }
    }
  }

  updateObjects(dt) {
    // Schlaglöcher
    if (this.rutsch > 0) this.rutsch = Math.max(0, this.rutsch - dt);
    for (const l of this.laub) {
      const dz = l.z - (this.position + this.playerZ);
      if (l.done || Math.abs(dz) >= SEG_LEN) continue;
      if (Math.abs(l.lane - this.playerX) > 0.22) continue;
      l.done = true;
      this.laubTreffer = (this.laubTreffer || 0) + 1;
      this.rutsch = 1.2;
      this.standTilt = 0.7;
      this.audio.play('morsch');
      this.message('NASSES LAUB. DER HINTERREIFEN GRUESST.', 4, 2);
    }
    for (const h of this.potholes) {
      if (h.done) continue;
      const dz = h.z - (this.position + this.playerZ);
      if (Math.abs(dz) < SEG_LEN * 0.8 && Math.abs(h.lane - this.playerX) < 0.2) {
        h.done = true;
        this.bumps += 1;
        this.speed *= 0.7;
        this.shake = 5;
        this.audio.play('morsch');
        this.message('SCHLAGLOCH. DIE FELGE DANKT.', 4, 2);
      }
    }
    // Radarfallen blitzen, wenn man zu schnell vorbeikommt
    for (const r of this.roadside) {
      if (r.kind !== 'blitzer' || r.done) continue;
      const dz = r.z - (this.position + this.playerZ);
      if (Math.abs(dz) < SEG_LEN && this.speed > this.maxSpeed * 0.45) {
        r.done = true;
        this.speed *= 0.85;
        this.shake = 4;
        this.blitze = 0.45;
        this.audio.play('hurt');
        this.message('GEBLITZT. DAS KOSTET EIN KNÖLLCHEN.', 5, 2);
      }
    }
    this.updateTraffic(dt);
  }

  updateTraffic(dt) {
    const carF = 0.24;   // erst bei echter Berührung zählt es als Kontakt
    for (const c of this.traffic) {
      c.z += c.speed * dt;
      if (c.z > this.trackLength) c.z -= this.trackLength;
      if (c.z < 0) c.z += this.trackLength;
      const dz = c.z - (this.position + this.playerZ);
      if (Math.abs(dz) < SEG_LEN * 1.1 && Math.abs(c.lane - this.playerX) < carF) {
        if (this.time > (c.hitAt || 0) + 1.2) {
          c.hitAt = this.time;
          this.crash(c.kind === 'lkw' ? 1.4 : 1);
        }
      } else if (dz < -SEG_LEN * 2 && !c.passed) {
        c.passed = true;
        this.audio.play('pickup');
      }
    }
  }

  crash(strength) {
    this.hits += 1;
    this.damage += 1;
    this.speed *= 0.35;
    this.shake = 7 * strength;
    this.audio.play('hurt');
    if (this.damage >= 4) {
      this.damage = 0;
      this.panneTimer = 1.6;
      this.message('REIFENPANNE. KURZ RANDSTREIFEN, DANN WEITER.', 5, 2);
    } else {
      this.message('KONTAKT. DAS WAR TEUER.', 4, 2);
    }
  }

  complete() {
    if (this.state !== 'play') return;
    this.state = 'complete';
    this.audio.engineOff();
    this.audio.play('fanfare');
    this.rows = [
      ['FAHRZEIT', fmt(this.time)],
      ['HÖCHSTGESCHWINDIGKEIT', `${Math.round(kmh(this.topSpeed))} km/h`],
      ['KONTAKTE', String(this.hits)],
      ['SCHLAGLÖCHER', String(this.bumps)],
      ['NASSES LAUB', String(this.laubTreffer || 0)],
      ['REGEN', this.rain ? 'ja, leider' : 'nein, alles trocken'],
    ];
    if (this.level.journey) finishJourney(this);
    this.events({
      type: 'complete',
      stats: { time: this.time, speed: this.topSpeed, hits: this.hits },
      rows: this.rows,
    });
  }

  segmentAt(z) {
    const i = Math.floor(z / SEG_LEN) % this.segments.length;
    return this.segments[i >= 0 ? i : i + this.segments.length];
  }

  buildHud() {
    return {
      modus: 'racer',
      drive: this.level.journey ? drivingCue(this) : null,
      speed: Math.round(kmh(this.speed)),
      zeit: this.time,
      hits: this.hits,
      damage: this.damage,
      rain: this.rain,
      strecke: this.trackLength ? clamp(this.position / (this.trackLength - (this.level.journey ? this.playerZ : 0)), 0, 1) : 0,
      bpm: this.bpm,
      beatPhase: this.beatPhase,
      hint: this.hint ? this.hint.text : null,
      ziel: this.level.journey ? `${drivingCue(this).section} — DIE MAPPE ZUR BÜHNE BRINGEN` : (this.level && this.level.ziel) || null,
      label: null,
      state: this.state,
    };
  }

  // --------------------------------------------------------------- Zeichnen --
  alignJourneyCamera() {
    // Der Kollisionspunkt liegt an den sichtbaren Hinterrädern, nicht unterhalb
    // des Bildes. Bei Resize muss Simulation UND Projektion ihn neu bestimmen.
    if (this.level.journey) this.playerZ = CAM_DEPTH * CAM_H * this.vh / (2 * (this.vh / 2 - 8));
  }

  /** Projektion eines Frames: sichtbare Segmente und Objekte, auch ohne Zeichnen prüfbar. */
  buildFrame() {
    this.alignJourneyCamera();
    const vw = this.vw, vh = this.vh;
    const baseSeg = this.segmentAt(this.position);
    const basePct = (this.position % SEG_LEN) / SEG_LEN;
    const pSeg = this.segmentAt(this.position + this.playerZ);
    const pPct = ((this.position + this.playerZ) % SEG_LEN) / SEG_LEN;
    const playerY = lerp(pSeg.p1.world.y, pSeg.p2.world.y, pPct);

    let maxy = vh;
    let x = 0;
    let dx = -(baseSeg.curve * basePct);
    const visible = [];
    for (let n = 0; n < DRAW_DIST; n++) {
      if (this.level.journey && baseSeg.index + n >= this.segments.length) break;
      const seg = this.segments[(baseSeg.index + n) % this.segments.length];
      seg.looped = seg.index < baseSeg.index;
      seg.fog = fogAt(n / DRAW_DIST, this.rain ? 4.4 : 3.2);
      seg.clip = maxy;
      const camZ = this.position - (seg.looped ? this.trackLength : 0);
      project(seg.p1, this.playerX * ROAD_W - x, playerY + CAM_H, camZ, vw, vh);
      project(seg.p2, this.playerX * ROAD_W - x - dx, playerY + CAM_H, camZ, vw, vh);
      x += dx;
      dx += seg.curve;
      if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y > seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
      visible.push(seg);
      maxy = seg.p1.screen.y;
    }

    const drawList = [];
    const alle = [];
    const sceneryWidth = {house:.85,oak:.8,poplar:.36,stage:2.25,pennant:.25,post:.035,arrow:.22};
    for (const r of this.roadside) alle.push({ z: r.z, kind: r.kind, xf: r.x, flip:r.flip, breite: sceneryWidth[r.kind] || SPRITE_F[r.kind] || 0.2 });
    for (const c of this.traffic) alle.push({ z: c.z, kind: c.kind, sprite: this.level.journey && c.speed<0 ? 'oncoming' : c.kind, xf: c.lane, breite: SPRITE_F[c.kind] || 0.3 });
    for (const h of this.potholes) alle.push({ z: h.z, kind: 'schlagloch', xf: h.lane, breite: SPRITE_F.schlagloch });
    for (const l of this.laub) alle.push({ z: l.z, kind: 'laub', xf: l.lane, breite: SPRITE_F.laub });
    for (const o of alle) {
      const rel = o.z - this.position;
      if (rel < 0 || rel > DRAW_DIST * SEG_LEN) continue;
      const seg = this.level.journey ? this.segmentAt(o.z)
        : this.segments[(baseSeg.index + Math.floor(rel / SEG_LEN)) % this.segments.length];
      if (!visible.includes(seg)) continue;
      const pct = ((this.level.journey ? o.z : rel) % SEG_LEN) / SEG_LEN;
      const half = lerp(seg.p1.screen.w, seg.p2.screen.w, pct);
      const sx = lerp(seg.p1.screen.x, seg.p2.screen.x, pct) + o.xf * half;
      const sy = lerp(seg.p1.screen.y, seg.p2.screen.y, pct);
      drawList.push({ kind: o.kind, sprite:o.sprite || o.kind, flip:o.flip, sx, sy, half, fog: seg.fog, clip: seg.clip, breite: o.breite });
    }
    // weit zuerst zeichnen
    drawList.sort((a, b) => a.half - b.half);
    return { visible, drawList, playerY, baseSeg };
  }

  draw(ctx) {
    const frame = this.buildFrame();
    this.drawSky(ctx);
    for (const seg of frame.visible) this.drawSegment(ctx, this.vw, seg);
    for (const o of frame.drawList) {
      if(o.flip){ctx.save();ctx.translate(o.sx*2,0);ctx.scale(-1,1);}
      this.drawSpriteAt(ctx, o.sprite, o.breite, o.sx, o.sy, o.half, o.fog, o.clip);
      if(o.flip)ctx.restore();
    }
    if (this.nacht) this.drawScheinwerfer(ctx);
    this.drawCar(ctx);
    if (this.rain) this.drawRain(ctx);
    this.drawFx(ctx);
    if(this.level.journey) drawJourneyHud(this,ctx);
  }

  /** Ist der Wagen gerade im Tunnel? */
  imTunnel() {
    const seg = Math.floor(this.position / SEG_LEN);
    return this.tunnel.some((t) => seg >= t.from && seg < t.to);
  }

  drawSky(ctx) {
    if(this.level.journey) return drawJourneySky(this,ctx);
    const vw = this.vw, vh = this.vh;
    if (this.imTunnel()) {
      ctx.fillStyle = '#08060c';
      ctx.fillRect(0, 0, vw, Math.ceil(vh / 2));
      // Deckenlampen ziehen vorbei
      ctx.fillStyle = '#3a3226';
      ctx.fillRect(0, Math.round(vh / 2) - 10, vw, 10);
      const off = (this.position * 0.35) % 96;
      for (let i = -1; i < vw / 96 + 2; i++) {
        const lx = Math.round(i * 96 - off);
        ctx.fillStyle = '#ffd68c';
        ctx.fillRect(lx + 30, Math.round(vh / 2) - 10, 36, 3);
        ctx.fillStyle = 'rgba(255,214,140,0.10)';
        ctx.fillRect(lx + 24, Math.round(vh / 2) - 7, 48, 24);
      }
      ctx.fillStyle = '#1a1620';
      ctx.fillRect(0, Math.round(vh / 2), vw, 2);
      return;
    }
    if (this.nacht) {
      const gradN = ctx.createLinearGradient(0, 0, 0, vh / 2);
      gradN.addColorStop(0, '#05060f');
      gradN.addColorStop(0.6, '#0d1226');
      gradN.addColorStop(1, this.rain ? '#161a2a' : '#232a3f');
      ctx.fillStyle = gradN;
      ctx.fillRect(0, 0, vw, Math.ceil(vh / 2));
      // Sterne
      ctx.fillStyle = 'rgba(226,232,255,0.75)';
      for (let i = 0; i < 26; i++) {
        const sx = Math.round((hash2(i, 7, 3) * vw + this.position * 0.005) % vw);
        const sy = Math.round(hash2(i, 11, 5) * (vh / 2 - 18));
        ctx.fillRect(sx, sy, 1, 1);
      }
      // Mond
      ctx.fillStyle = 'rgba(226,236,255,0.22)';
      ctx.fillRect(Math.round(vw * 0.74) - 9, 18, 18, 18);
      ctx.fillStyle = '#dfe8ff';
      ctx.fillRect(Math.round(vw * 0.74) - 6, 21, 12, 12);
      // Baumreihe im Dunkeln
      ctx.fillStyle = '#060810';
      for (let i = 0; i < 16; i++) {
        const bx = Math.round(((i * 34 - this.position * 0.02) % (vw + 68) + (vw + 68)) % (vw + 68)) - 34;
        const hgt = 12 + Math.round(hash2(i, 2, 5) * 14);
        ctx.fillRect(bx, Math.round(vh / 2) - hgt, 30, hgt + 4);
      }
      ctx.fillStyle = '#05070e';
      ctx.fillRect(0, Math.round(vh / 2), vw, 2);
      return;
    }
    const grad = ctx.createLinearGradient(0, 0, 0, vh / 2);
    grad.addColorStop(0, '#2a2350');
    grad.addColorStop(0.55, '#6b4a7a');
    grad.addColorStop(1, this.rain ? '#5a4a5a' : '#c9704f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vw, Math.ceil(vh / 2));
    if (!this.rain) {
      ctx.fillStyle = '#e8a34a';
      ctx.fillRect(Math.round(vw / 2) - 22, Math.round(vh / 2) - 26, 44, 24);
      ctx.fillStyle = '#f0c46a';
      ctx.fillRect(Math.round(vw / 2) - 16, Math.round(vh / 2) - 22, 32, 16);
    }
    ctx.fillStyle = '#3a2b4a';
    for (let i = 0; i < 16; i++) {
      const bx = Math.round(((i * 34 - this.position * 0.02) % (vw + 68) + (vw + 68)) % (vw + 68)) - 34;
      const hgt = 10 + Math.round(hash2(i, 2, 5) * 12);
      ctx.fillRect(bx, Math.round(vh / 2) - hgt, 30, hgt + 4);
    }
    ctx.fillStyle = '#241b33';
    ctx.fillRect(0, Math.round(vh / 2), vw, 2);
  }

  drawSegment(ctx, vw, seg) {
    if(this.level.journey) return drawJourneySegment(this,ctx,seg);
    const dunkel = Math.floor(seg.index / 3) % 2 === 0;
    const nachtF = this.nacht && !this.imTunnel();
    const gras = nachtF ? (dunkel ? '#0b1016' : '#090e13')
      : this.rain ? (dunkel ? '#26361f' : '#22301d') : (dunkel ? '#3b3a26' : '#34361f');
    const strasse = nachtF ? (dunkel ? '#1c1e26' : '#191b22') : (dunkel ? '#3a3a42' : '#35353d');
    const rand = dunkel ? '#b8402f' : '#d8d2c0';
    const { x: x1, y: y1, w: w1 } = seg.p1.screen;
    const { x: x2, y: y2, w: w2 } = seg.p2.screen;
    const r1 = w1 / 6, r2 = w2 / 6;
    ctx.fillStyle = gras;
    ctx.fillRect(0, y2, vw, y1 - y2);
    poly(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, rand);
    poly(ctx, x1 + w1, y1, x1 + w1 + r1, y1, x2 + w2 + r2, y2, x2 + w2, y2, rand);
    poly(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, strasse);
    if (dunkel) {
      const l1 = w1 / 30, l2 = w2 / 30;
      for (const frac of [-1 / 3, 1 / 3]) {
        const a1 = x1 + frac * w1, a2 = x2 + frac * w2;
        poly(ctx, a1 - l1, y1, a1 + l1, y1, a2 + l2, y2, a2 - l2, y2, '#c9c4a8');
      }
    }
    if (seg.fog < 1) {
      ctx.globalAlpha = 1 - seg.fog;
      ctx.fillStyle = FOG;
      ctx.fillRect(0, y2, vw, y1 - y2);
      ctx.globalAlpha = 1;
    }
  }

  drawSpriteAt(ctx, kind, f, screenX, screenY, halfRoad, fog, clipY) {
    const spr = this.sprite(kind);
    const w = Math.round(f * halfRoad);
    const h = Math.round(w * (spr.h / spr.w));
    if (w < 1 || h < 1) return;
    const x = Math.round(screenX - w / 2);
    const y = Math.round(screenY - h);          // Oberkante
    const clip = clipY || 0;
    // Nur weglassen, wenn das Objekt komplett hinter dem Gelände steht.
    if (y >= clip) return;
    const verdeckt = Math.max(0, y + h - clip);
    const hh = h - verdeckt;
    if (hh < 1) return;
    ctx.globalAlpha = clamp(fog, 0, 1);
    ctx.drawImage(spr.canvas, 0, 0, spr.w, spr.h - (spr.h * verdeckt) / h, x, y, w, hh);
    ctx.globalAlpha = 1;
  }

  /** Scheinwerferkegel: nur die nahe Fahrbahn ist hell. */
  drawScheinwerfer(ctx) {
    const vw = this.vw, vh = this.vh;
    const mitte = vw / 2 + this.playerX * -9;
    const oben = Math.round(vh * 0.52);
    ctx.fillStyle = this.imTunnel() ? 'rgba(255,228,170,0.16)' : 'rgba(255,232,180,0.11)';
    for (let i = 0; i < 42; i++) {
      const t = i / 41;
      const y = Math.round(vh - 4 - t * (vh - oben));
      const breite = Math.round(28 + t * (vw * 0.9));
      ctx.fillRect(Math.round(mitte - breite / 2), y, breite, 2);
    }
  }

  drawCar(ctx) {
    if(this.level.journey) return drawJourneyCar(this,ctx);
    const spr = this.sprite(this.fahrzeug);
    const scale = (this.vh / 216) * 2.3;
    const w = Math.round(spr.w * scale);
    const h = Math.round(spr.h * scale);
    // Kein Auf-und-Ab: die Figur soll nicht zittern. Krümmung schiebt nur seitlich.
    const x = Math.round(
      this.vw / 2 - w / 2
      + this.playerX * -9
      + Math.round((this.lenkung || 0) * (this.fahrzeug === 'motorrad' ? 4 : 1))
      + (this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0)
    );
    const y = Math.round(this.vh - h - 4);
    ctx.drawImage(spr.canvas, 0, 0, spr.w, spr.h, x, y, w, h);
    if (this.standTilt > 0 && this.fahrzeug === 'mx5') {
      const ns = this.sprite('notenstaender');
      const nw = Math.round(ns.w * scale), nh = Math.round(ns.h * scale);
      const nx = x + Math.round(w * 0.6);
      const ny = y + Math.round(h * 0.12) + (this.standTilt > 0.5 ? 3 : 1);
      ctx.drawImage(ns.canvas, 0, 0, ns.w, ns.h, nx, ny, nw, nh);
    }
    if (this.panneTimer > 0) {
      ctx.fillStyle = 'rgba(232,196,106,0.9)';
      ctx.fillRect(Math.round(x + w / 2) - 10, y - 12, 20, 7);
      ctx.fillStyle = '#0b0810';
      ctx.fillRect(Math.round(x + w / 2) - 3, y - 11, 6, 5);
    }
  }

  drawRain(ctx) {
    ctx.fillStyle = 'rgba(190,205,225,0.45)';
    for (let i = 0; i < 70; i++) {
      const h1 = hash2(i, 1, 11), h2 = hash2(i, 2, 13);
      const x = Math.round((h1 * this.vw + this.time * 300 + i * 5) % this.vw);
      const y = Math.round((h2 * this.vh + this.time * 1000) % this.vh);
      ctx.fillRect(x, y, 1, 4);
    }
    ctx.fillStyle = 'rgba(40,50,80,0.16)';
    ctx.fillRect(0, 0, this.vw, this.vh);
  }

  drawFx(ctx) {
    const pulse = Math.max(0, 1 - this.beatPhase * 2.6);
    if (pulse > 0) {
      ctx.fillStyle = `rgba(93,224,207,${0.1 * pulse})`;
      ctx.fillRect(0, this.vh - 3, this.vw, 3);
    }
    if (this.blitze > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 * this.blitze})`;
      ctx.fillRect(0, 0, this.vw, this.vh);
    }
    if (Math.abs(this.playerX) > 1) {
      ctx.fillStyle = 'rgba(200,120,60,0.16)';
      ctx.fillRect(0, 0, this.vw, 6);
      ctx.fillRect(0, this.vh - 6, this.vw, 6);
    }
  }
}

function poly(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}
