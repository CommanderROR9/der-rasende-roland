// racer.js — Pseudo-3D-Fahrinterludium (Cabrio, später Motorrad).
// Klassische Segmentstraße: die Strecke besteht aus Segmenten mit Kurven- und
// Hügelwert; die Kamera sitzt hinter dem Auto und projiziert nach vorn.
// Bewusst DOM-frei, damit dieselbe Logik headless geprüft werden kann.
import { DIFFICULTY, BPM_BASE } from './config.js';
import { SPRITES } from './sprites.js';
import { spriteCanvas, hash2 } from './render.js';

export const SEG_LEN = 200;      // Länge eines Segments in Welteinheiten
export const ROAD_W = 2000;      // halbe Straßenbreite
export const DRAW_DIST = 170;    // Segmente in Sichtweite
export const CAM_H = 1050;       // Kamerahöhe
export const FOV = 100;
export const CAM_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
const FOG = '#241b33';

// Breite der Objekte als Anteil der projizierten halben Straßenbreite.
const SPRITE_F = { auto: 0.30, lkw: 0.40, mx5: 0.34, baum: 0.22, schild: 0.13, blitzer: 0.15, notenstaender: 0.09 };

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
        curve: part.curve || 0,
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
    if (!this.spr.has(name)) this.spr.set(name, spriteCanvas(name, SPRITES[name]));
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
    this.maxSpeed = SEG_LEN * 58 * (this.difficulty === 'gemuetlich' ? 0.8 : 1);
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
    const cars = Math.round((this.level.traffic || 12) * (this.difficulty === 'gemuetlich' ? 0.55 : 1));
    for (let i = 0; i < cars; i++) {
      const oncoming = i % 3 === 0;
      const base = oncoming ? -0.55 : 0.18 + (i % 2) * 0.4;
      this.traffic.push({
        z: 3000 + (i / cars) * (this.trackLength - 5000) + hash2(i, 3, 7) * 500,
        lane: clamp(base + (hash2(i, 9, 4) - 0.5) * 0.16, -0.9, 0.9),
        speed: oncoming ? -SEG_LEN * 13 : SEG_LEN * (7 + hash2(i, 5, 2) * 6),
        kind: i % 5 === 4 ? 'lkw' : 'auto',
        passed: false,
      });
    }
    this.roadside = [];
    const rs = 130;
    for (let i = 0; i < rs; i++) {
      const pct = (i + 0.5) / rs;
      const side = i % 2 === 0 ? -1 : 1;
      this.roadside.push({
        z: pct * this.trackLength,
        x: side * (1.3 + hash2(i, 1, 1) * 0.7),
        kind: i % 13 === 0 ? 'blitzer' : (i % 5 === 0 ? 'schild' : 'baum'),
      });
    }
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
    this.time += dt;
    const inp = this.input;

    // Gas gibt es automatisch: am Handy muss man nur lenken.
    const lenkung = inp.axis();
    let ziel = this.maxSpeed * (this.rain ? 0.8 : 1);
    if (inp.action()) ziel *= 0.35;
    if (Math.abs(this.playerX) > 1) ziel *= 0.34;
    if (this.panneTimer > 0) { ziel = 0; this.panneTimer -= dt; }

    const rate = this.speed < ziel ? 2600 : 5000;
    this.speed += clamp(ziel - this.speed, -rate * dt, rate * dt);
    this.speed = clamp(this.speed, 0, this.maxSpeed);
    this.topSpeed = Math.max(this.topSpeed, this.speed);

    const seg = this.segmentAt(this.position);
    const curve = seg ? seg.curve : 0;
    const pct = this.speed / this.maxSpeed;
    // In der Kurve zieht es nach außen, Lenken arbeitet dagegen
    const flieh = this.diff.centrifugal * (this.rain ? 1.5 : 1);
    this.playerX -= curve * pct * pct * flieh * dt * 1.9;
    this.playerX += lenkung * dt * (1.5 + pct * 1.7) * (this.rain ? 0.85 : 1);
    this.playerX = clamp(this.playerX, -1.9, 1.9);

    if (Math.abs(curve) >= 2 && Math.abs(lenkung) > 0.2 && this.standTilt === 0 && pct > 0.4) {
      this.standTilt = 1;
      this.message('DER NOTENSTÄNDER KIPPT UM. WIEDER MAL.', 4, 1);
    }
    if (Math.abs(curve) < 1) this.standTilt = Math.max(0, this.standTilt - dt * 0.4);

    const vorher = this.position;
    this.position = (this.position + this.speed * dt) % this.trackLength;
    // Streckenende erreicht = angekommen (die Strecke ist eine Route, kein Rundkurs)
    if (this.position < vorher && this.time > 3) { this.complete(); return; }
    this.updateTraffic(dt);
    this.updateStrecke();
    this.updateTakt(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22);
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
    this.events({
      type: 'complete',
      stats: { time: this.time, speed: this.topSpeed, hits: this.hits },
      rows: [
        ['FAHRZEIT', fmt(this.time)],
        ['HÖCHSTGESCHWINDIGKEIT', `${Math.round(kmh(this.topSpeed))} km/h`],
        ['KONTAKTE', String(this.hits)],
        ['REGEN', this.rain ? 'ja, leider' : 'nein, alles trocken'],
      ],
    });
  }

  segmentAt(z) {
    const i = Math.floor(z / SEG_LEN) % this.segments.length;
    return this.segments[i >= 0 ? i : i + this.segments.length];
  }

  buildHud() {
    return {
      modus: 'racer',
      speed: Math.round(kmh(this.speed)),
      zeit: this.time,
      hits: this.hits,
      damage: this.damage,
      rain: this.rain,
      strecke: this.trackLength ? this.position / this.trackLength : 0,
      bpm: this.bpm,
      beatPhase: this.beatPhase,
      hint: this.hint ? this.hint.text : null,
      label: null,
      state: this.state,
    };
  }

  // --------------------------------------------------------------- Zeichnen --
  draw(ctx) {
    const vw = this.vw, vh = this.vh;
    const baseSeg = this.segmentAt(this.position);
    const basePct = (this.position % SEG_LEN) / SEG_LEN;
    const pSeg = this.segmentAt(this.position + this.playerZ);
    const pPct = ((this.position + this.playerZ) % SEG_LEN) / SEG_LEN;
    const playerY = lerp(pSeg.p1.world.y, pSeg.p2.world.y, pPct);

    this.drawSky(ctx);
    let maxy = vh;
    let x = 0;
    let dx = -(baseSeg.curve * basePct);
    const visible = [];
    const projektionen = [];
    for (let n = 0; n < DRAW_DIST; n++) {
      const seg = this.segments[(baseSeg.index + n) % this.segments.length];
      seg.looped = seg.index < baseSeg.index;
      seg.fog = fogAt(n / DRAW_DIST, this.rain ? 4.4 : 3.2);
      seg.clip = maxy;
      const camZ = this.position - (seg.looped ? this.trackLength : 0);
      project(seg.p1, this.playerX * ROAD_W - x, playerY + CAM_H, camZ, vw, vh);
      project(seg.p2, this.playerX * ROAD_W - x - dx, playerY + CAM_H, camZ, vw, vh);
      x += dx;
      dx += seg.curve;
      if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
      this.drawSegment(ctx, vw, seg);
      visible.push(seg);
      maxy = seg.p1.screen.y;
    }
    // Objekte von hinten nach vorn zeichnen
    const objekte = [];
    for (const r of this.roadside) {
      const zi = ((r.z % this.trackLength) + this.trackLength) % this.trackLength;
      const seg = this.segmentAt(zi);
      if (seg.clip === undefined) continue;
      objekte.push({ z: zi, kind: r.kind, seg, xf: r.x, pct: (zi % SEG_LEN) / SEG_LEN });
    }
    for (const c of this.traffic) {
      const zi = ((c.z % this.trackLength) + this.trackLength) % this.trackLength;
      const seg = this.segmentAt(zi);
      if (seg.clip === undefined) continue;
      objekte.push({ z: zi, kind: c.kind, seg, xf: c.lane, pct: (zi % SEG_LEN) / SEG_LEN, breit: true });
    }
    const vorne = this.position + this.playerZ;
    objekte.sort((a, b) => b.z - a.z);
    for (const o of objekte) {
      const rel = o.z - this.position;
      if (rel < 0 || rel > DRAW_DIST * SEG_LEN) continue;
      const n = Math.floor(rel / SEG_LEN);
      const sicht = visible.find((v) => v.index === o.seg.index && v.looped === (o.seg.index < baseSeg.index));
      if (!sicht) continue;
      const half = lerp(sicht.p1.screen.w, sicht.p2.screen.w, o.pct);
      const sx = lerp(sicht.p1.screen.x, sicht.p2.screen.x, o.pct) + o.xf * half;
      const sy = lerp(sicht.p1.screen.y, sicht.p2.screen.y, o.pct);
      this.drawSpriteAt(ctx, o.kind, SPRITE_F[o.kind] || 0.2, sx, sy, half, sicht.fog, sicht.clip);
      void n;
    }
    this.drawCar(ctx);
    if (this.rain) this.drawRain(ctx);
    this.drawFx(ctx);
  }

  drawSky(ctx) {
    const vw = this.vw, vh = this.vh;
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
    const dunkel = Math.floor(seg.index / 3) % 2 === 0;
    const gras = this.rain ? (dunkel ? '#26361f' : '#22301d') : (dunkel ? '#3b3a26' : '#34361f');
    const strasse = dunkel ? '#3a3a42' : '#35353d';
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
    const y = Math.round(screenY - h);
    if (y + h <= (clipY || 0)) return;
    ctx.globalAlpha = clamp(fog, 0, 1);
    ctx.drawImage(spr.canvas, 0, 0, spr.w, spr.h, x, y, w, h);
    ctx.globalAlpha = 1;
  }

  drawCar(ctx) {
    const spr = this.sprite('mx5');
    const scale = (this.vh / 216) * 2.3;
    const w = Math.round(spr.w * scale);
    const h = Math.round(spr.h * scale);
    // Kein Auf-und-Ab: die Figur soll nicht zittern. Krümmung schiebt nur seitlich.
    const x = Math.round(
      this.vw / 2 - w / 2
      + this.playerX * -9
      + (this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0)
    );
    const y = Math.round(this.vh - h - 4);
    ctx.drawImage(spr.canvas, 0, 0, spr.w, spr.h, x, y, w, h);
    if (this.standTilt > 0) {
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
