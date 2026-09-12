// grill.js — Das Bratwurst-Grill-Minispiel im Epilog.
// Drei Roste, acht Würste, ein Takt. Wenden und servieren mit der Aktions-Taste.
// Genau im Takt gewendet gibt Bonus — ohne Takt geht es aber auch (Geschenk!).
//
// Aufwertung (Auftrag E2): eigene Garstufen-Sprites, glimmende Kohlen, Rauch und
// Fett, Teller für das Geschaffte, Fokusmarkierung und eine Aktion pro Druck.
// Scheitern bleibt eine Pointe: verbrannt wird gezählt, nicht verloren.
import { SPRITES, GRILL_PALETTE, GARSTUFEN_FARBE, garstufeName, GARSTUFEN_TEXT } from './sprites.js';
import { spriteCanvas } from './render.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const TILE = 16;
const ROSTE = 3;
const WUERSTE = 8;
const OPTIMAL = 76;        // idealer Garstand
const FENSTER = 22;        // Toleranz um das Optimum
const FOKUS_FARBE = '#f2d24b';
// Eine Aktion pro Druck: erst nach dieser Ruhezeit wandert die Auswahl weiter.
const WIEDERHOL_AB = 0.35;
const WIEDERHOL_JEDE = 1 / 6;

export class Grill {
  constructor({ level, input, audio, events = () => {}, view, difficulty = 'gemuetlich' }) {
    this.level = level || {};
    this.input = input;
    this.audio = audio || { play() {}, engine() {}, engineOff() {} };
    this.events = events;
    this.vw = (view || {}).w || 384;
    this.vh = (view || {}).h || 216;
    this.difficulty = difficulty;
    this.reset();
  }

  /** Die Würste, die gerade auf dem Rost liegen. */
  get grill() { return this.wuerserste.filter((w) => w.zustand === 'rost'); }

  reset() {
    this.state = 'play';
    this.time = 0;
    this.beatPhase = 0;
    this.beats = 0;
    this.bpm = this.level.bpm || 76;
    this.punktestand = 0;
    this.serviert = 0;
    this.verbrannt = 0;
    this.sauber = 0;
    this.knapp = 0;
    this.fertig = 0;
    this.hint = null;
    this.hintUntil = 0;
    this.auswahl = 1;
    this.prevAction = false;
    this.axisRichtung = 0;
    this.achseGehalten = 0;
    this.achseWiederholt = 0;
    this.fokusSeit = 0;
    this.rows = [];
    this.rauch = [];        // aufsteigender Rauch bei zu langem Liegen
    this.fett = [];         // Tropfen, die in die Glut fallen
    this.dampf = [];        // kurzer Stoß beim Wenden
    this.glutBlitz = 0;     // Aufzucken der Kohlen, wenn Fett auftrifft
    this.fettTropfen = 0;   // gezählte Tropfen (Nachweis für die Prüfungen)
    // Die Würste liegen bereit; drei sind auf dem Rost
    this.wuerserste = [];
    for (let i = 0; i < WUERSTE; i++) {
      this.wuerserste.push({
        seite: 0, gar: 0, gewendet: 0, zustand: i < ROSTE ? 'rost' : 'kiste',
        qualitaet: 0, sauber: 0, rauchT: 0, fettT: 0, wendespur: 0,
      });
    }
    this.zeichnung = [];       // was zuletzt gezeichnet wurde (Bildnachweis)
    this.zeichnungFokus = null;
    this.hud = this.buildHud();
  }

  /** Garstufe als eigener Sprite-Name. */
  stufe(w) { return garstufeName(w.gar, w.verbrannt || 0); }

  buildHud() {
    const aufRost = this.grill;
    return {
      modus: 'grill',
      punkte: Math.round(this.punktestand),
      serviert: this.serviert,
      sauber: this.sauber,
      knapp: this.knapp,
      verbrannt: this.verbrannt,
      fertig: this.fertig,
      offen: WUERSTE - this.fertig,
      takt: this.bpm,
      beatPhase: this.beatPhase,
      puls: Math.max(0, 1 - Math.min(this.beatPhase, 1 - this.beatPhase) * 6),
      fokus: this.auswahl,
      fokusSeite: aufRost.length ? aufRost[Math.min(this.auswahl, aufRost.length - 1)].seite : 0,
      fokusName: aufRost.length ? GARSTUFEN_TEXT[this.stufe(aufRost[Math.min(this.auswahl, aufRost.length - 1)])] : null,
      stufen: aufRost.map((w) => this.stufe(w)),
      gesamt: WUERSTE,
      hint: this.hint,
      label: null,
      state: this.state,
    };
  }

  message(text, dur = 3) {
    this.hint = text;
    this.hintUntil = this.time + dur;
  }

  beatGenauigkeit() {
    return Math.min(this.beatPhase, 1 - this.beatPhase) * (60 / this.bpm);
  }

  /** Wandert die Auswahl? Eine Stufe pro Druck, danach ruhig wiederholen. */
  waehle(ziel) {
    const aufRost = this.grill.length;
    const neu = clamp(ziel, 0, Math.max(0, aufRost - 1));
    if (neu !== this.auswahl) { this.auswahl = neu; this.fokusSeit = this.time; }
  }

  aktion() {
    const aufRost = this.grill;
    const idx = Math.min(this.auswahl, Math.max(0, aufRost.length - 1));
    const w = aufRost[idx];
    if (!w) return;
    const genau = this.beatGenauigkeit() <= (this.difficulty === 'gemuetlich' ? 0.22 : 0.16);
    const knapp = this.beatGenauigkeit() <= 0.45;
    if (w.seite === 0) {
      w.seite = 1;
      w.gewendet += 1;
      w.wendespur = 1.1;            // kurzer Dampfstoß und Fettglanz der neuen Seite
      this.wendespur(w, idx);
      if (genau) { w.sauber = 1; this.sauber += 1; }
      else if (knapp) this.knapp += 1;
      this.message(genau ? 'SAUBER GEWENDET. IM TAKT.'
        : knapp ? 'KNAPP DANEBEN. DIE WURST LEBT NOCH.'
          : 'GEWENDET. GEHT DOCH.', 2);
      this.audio.play('tritt');
      return;
    }
    // servieren — roh kommt nicht auf den Teller
    if (w.gar < 40) {
      this.message('DIE IST NOCH ROH. LASS SIE NOCH LIEGEN.', 2);
      this.audio.play('hurt');
      return;
    }
    const q = clamp(1 - Math.abs(w.gar - OPTIMAL) / FENSTER, 0, 1);
    w.qualitaet = q;
    w.zustand = 'fertig';
    this.serviert += 1;
    this.fertig += 1;
    const punkte = Math.round(100 * q + (w.sauber ? 40 : 0));
    this.punktestand += punkte;
    this.audio.play(q > 0.6 ? 'pickup' : 'hurt');
    this.message(q > 0.75 ? 'SAUBERE WURST. 100 PUNKTE.' : q > 0.4 ? 'NICHT SCHLECHT. ABER LUFT NACH OBEN.' : 'ROH ODER TROCKEN. HAUPT SACHE WARM.', 2.5);
    this.nachlegen();
  }

  /** Fettglanz und Dampf: man sieht, dass eine neue Seite oben liegt. */
  wendespur(w, idx) {
    const l = this.layout();
    const s = l.slot(idx);
    for (let i = 0; i < 3; i++) {
      this.dampf.push({
        x: s.x + s.w * (0.3 + 0.2 * i), y: l.rostY - 2,
        vy: -14 - i * 3, vx: (i - 1) * 3, leben: 0.55, rest: 0.55,
      });
    }
  }

  nachlegen() {
    const naechste = this.wuerserste.find((x) => x.zustand === 'kiste');
    if (naechste) { naechste.zustand = 'rost'; return; }
    // Erst beenden, wenn nichts mehr auf dem Rost liegt — sonst verschwinden
    // Würste unserviert aus der Wertung.
    if (!this.wuerserste.some((x) => x.zustand === 'rost')) this.ende();
  }

  ende() {
    if (this.state !== 'play') return;
    this.state = 'complete';
    const note = this.verbrannt === 0 && this.sauber >= WUERSTE - 2 ? 'GRILLMEISTER'
      : this.verbrannt <= 1 ? 'SOLIDE' : 'RAUCHZEICHEN';
    this.rows = [
      ['SERVIERT', `${this.serviert} von ${WUERSTE}`],
      ['IM TAKT GEWENDET', String(this.sauber)],
      ['KNAPP DANEBEN', String(this.knapp)],
      ['VERBRANNT', String(this.verbrannt)],
      ['PUNKTE', String(this.punktestand)],
      ['BEWERTUNG', note],
    ];
    this.audio.play('fanfare');
    this.events({ type: 'complete', stats: { punkte: this.punktestand }, rows: this.rows });
  }

  // ------------------------------------------------------------------ Effekte --
  /** Rauch bei zu langem Liegen, Fett in die Glut. */
  effekte(dt) {
    for (const p of this.rauch) { p.y += p.vy * dt; p.x += p.vx * dt; p.rest -= dt; }
    this.rauch = this.rauch.filter((p) => p.rest > 0);
    for (const p of this.dampf) { p.y += p.vy * dt; p.x += p.vx * dt; p.rest -= dt; }
    this.dampf = this.dampf.filter((p) => p.rest > 0);
    const boden = this.layout().boden;
    for (const p of this.fett) {
      p.y += p.vy * dt;
      if (p.y >= boden + 3) { p.rest = 0; this.glutBlitz = 0.3; }
    }
    this.fett = this.fett.filter((p) => p.rest > 0);
    if (this.glutBlitz > 0) this.glutBlitz = Math.max(0, this.glutBlitz - dt);
  }

  /** Wo liegt was? Rechenweg einmal, damit Zeichnen und Effekte dieselben Maße nutzen. */
  layout() {
    const vw = this.vw, vh = this.vh;
    const boden = Math.round(vh * 0.78);
    const breite = Math.round(vw * 0.72);
    const links = Math.round((vw - breite) / 2);
    const rostBreite = Math.round(breite / ROSTE);
    return {
      vw, vh, boden, links, breite, rostBreite,
      rostY: boden - 4,
      slot(i) {
        return { x: links + i * rostBreite + 6, w: rostBreite - 12 };
      },
    };
  }

  update(dt) {
    this.effekte(dt);
    if (this.state !== 'play') return;
    this.time += dt;
    this.beatPhase += dt * (this.bpm / 60);
    if (this.beatPhase >= 1) { this.beatPhase -= 1; this.beats += 1; }

    // Auswahl: ein Schritt pro Druck. Ein gehaltener Knopf wandert erst nach
    // einer Ruhezeit weiter — sonst rast die Markierung durch den Rost.
    const achse = this.input.axis();
    const richtung = achse < -0.4 ? -1 : achse > 0.4 ? 1 : 0;
    if (richtung !== this.axisRichtung) {
      this.achseGehalten = 0;
      this.achseWiederholt = 0;
      if (richtung !== 0) this.waehle(this.auswahl + richtung);
    } else if (richtung !== 0) {
      this.achseGehalten += dt;
      if (this.achseGehalten >= WIEDERHOL_AB) {
        this.achseWiederholt += dt;
        while (this.achseWiederholt >= WIEDERHOL_JEDE) {
          this.achseWiederholt -= WIEDERHOL_JEDE;
          this.waehle(this.auswahl + richtung);
        }
      }
    }
    this.axisRichtung = richtung;

    const jetzt = this.input.action();
    if (jetzt && !this.prevAction) this.aktion();
    this.prevAction = jetzt;

    const tempo = this.difficulty === 'gemuetlich' ? 0.75 : 1;
    const l = this.layout();
    const aufRost = this.grill;
    for (let i = 0; i < aufRost.length; i++) {
      const w = aufRost[i];
      w.gar += dt * (w.seite === 0 ? 12 : 16) * tempo;
      if (w.wendespur > 0) w.wendespur = Math.max(0, w.wendespur - dt);
      // Rauch erst, wenn die Wurst zu lange liegt — Fett nur von der Garseite.
      if (w.gar > 72) {
        w.rauchT += dt;
        while (w.rauchT > 0.22) {
          w.rauchT -= 0.22;
          const s = l.slot(i);
          this.rauch.push({
            x: s.x + s.w * 0.5, y: l.rostY - 6, vy: -7 - (i % 2) * 2, vx: (i - 1) * 2.5,
            leben: 1.8, rest: 1.8,
          });
        }
      }
      if (w.seite === 1 && w.gar > 25) {
        w.fettT += dt;
        while (w.fettT > 0.9) {
          w.fettT -= 0.9;
          const s = l.slot(i);
          this.fett.push({ x: s.x + s.w * (0.25 + 0.5 * (i % 2)), y: l.rostY + 1, vy: 26, rest: 1 });
          this.fettTropfen += 1;
        }
      }
      if (w.gar > 100) {
        w.zustand = 'fertig';
        w.verbrannt = 1;
        this.verbrannt += 1;
        this.fertig += 1;
        this.audio.play('hurt');
        this.message('DAS WAR ZU LANGE. KOHLE IST AUCH EINE FORM VON ESSEN.', 3);
        const s = l.slot(i);
        for (let k = 0; k < 5; k++) {
          this.rauch.push({ x: s.x + s.w * 0.5, y: l.rostY - 6, vy: -9 - k, vx: (k - 2) * 4, leben: 2.2, rest: 2.2 });
        }
        this.nachlegen();
      }
    }
    if (this.hint && this.time > this.hintUntil) this.hint = null;
    this.hud = this.buildHud();
  }

  // ---------------------------------------------------------------- Zeichnen --
  /** Sprite aus der Grill-Palette (gecacht in render.js). */
  spr(name) { return spriteCanvas('grill_' + name, SPRITES[name], GRILL_PALETTE); }

  blit(ctx, name, x, y, k, flip = false) {
    const s = this.spr(name);
    const w = s.w * k, h = s.h * k;
    const px = Math.round(x), py = Math.round(y);
    if (!flip) { ctx.drawImage(s.canvas, px, py, w, h); return s; }
    ctx.save();
    ctx.translate(px, py + h);
    ctx.scale(1, -1);
    ctx.drawImage(s.canvas, 0, 0, w, h);
    ctx.restore();
    return s;
  }

  draw(ctx) {
    const l = this.layout();
    const { vw, vh, boden, links, breite, rostBreite } = l;
    // Abendhimmel als Kulisse
    const g = ctx.createLinearGradient(0, 0, 0, vh * 0.7);
    g.addColorStop(0, '#2a3a6e');
    g.addColorStop(0.6, '#e08a52');
    g.addColorStop(1, '#f6d79a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
    // Hecke dahinter
    ctx.fillStyle = '#1d3320';
    for (let i = 0; i < vw / 40 + 2; i++) {
      const bx = i * 40 - 8;
      ctx.fillRect(bx, vh * 0.62, 38, vh * 0.4);
    }
    ctx.fillStyle = '#16281a';
    ctx.fillRect(0, vh * 0.66, vw, vh * 0.4);

    this.drawGlut(ctx, l);
    this.drawRost(ctx, l);
    this.drawWuerserste(ctx, l);
    this.drawTeller(ctx, l);
    this.drawVorrat(ctx, l);
    this.drawEffekte(ctx, l);
    this.drawHud(ctx, l);
  }

  /** Glimmende Kohlen: drei Bilder, ruhiges Flackern, kein statisches Rechteck. */
  drawGlut(ctx, l) {
    const { links, breite, boden } = l;
    const x0 = links - 8, w = breite + 16;
    ctx.fillStyle = '#241a16';
    ctx.fillRect(x0, boden + 2, w, 11);
    const phase = Math.floor(this.time * 4) % 3;
    const frame = `glut${phase + 1}`;
    const s = this.spr(frame);
    const k = 2;
    const flackern = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(this.time * 5.3)) + this.glutBlitz;
    ctx.globalAlpha = clamp(flackern, 0.5, 1);
    for (let x = x0 + 2; x < x0 + w - s.w * k; x += s.w * k - 2) {
      ctx.drawImage(s.canvas, Math.round(x), boden + 6, s.w * k, s.h * k);
    }
    ctx.globalAlpha = 1;
    // Glutschein unter dem Rost
    ctx.fillStyle = 'rgba(255,120,50,0.16)';
    ctx.fillRect(x0, boden - 3, w, 5);
  }

  drawRost(ctx, l) {
    const { links, rostBreite, boden } = l;
    for (let i = 0; i < ROSTE; i++) {
      const x = links + i * rostBreite;
      const fokus = i === this.auswahl;
      ctx.fillStyle = fokus ? '#4a3524' : '#2b2b32';
      ctx.fillRect(x + 2, boden - 4, rostBreite - 4, 4);
      ctx.fillStyle = '#15151b';
      ctx.fillRect(x + 2, boden - 1, rostBreite - 4, 2);
      // Roststäbe
      ctx.fillStyle = fokus ? '#8a8a96' : '#6e6e78';
      const st = Math.max(3, Math.round((rostBreite - 8) / 6));
      for (let k = 0; k < 6; k++) {
        ctx.fillRect(x + 4 + k * st, boden - 4, 1, 4);
      }
    }
  }

  drawWuerserste(ctx, l) {
    const aufRost = this.grill;
    this.zeichnung = [];
    for (let i = 0; i < aufRost.length; i++) {
      const w = aufRost[i];
      const s = l.slot(i);
      const stufe = this.stufe(w);
      const spr = this.spr(stufe);
      const k = Math.max(2, Math.round((s.w - 4) / spr.w));
      const w2 = spr.w * k, h2 = spr.h * k;
      const x = s.x + Math.round((s.w - w2) / 2);
      const y = l.rostY - h2;
      // gewendet: die frische Seite liegt oben — gespiegelt gezeichnet
      this.blit(ctx, stufe, x, y, k, w.seite === 1);
      if (w.wendespur > 0) {
        ctx.globalAlpha = clamp(w.wendespur, 0, 1);
        ctx.fillStyle = '#f7e2b0';
        ctx.fillRect(x + 2, y + Math.round(h2 / 2), w2 - 4, 1);
        ctx.globalAlpha = 1;
      }
      // Garstufe lesbar über der Wurst
      ctx.font = `bold ${this.vw > 300 ? 6 : 5}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = i === this.auswahl ? FOKUS_FARBE : '#e9e5d8';
      ctx.fillText(GARSTUFEN_TEXT[stufe], x + Math.round(w2 / 2), y - 3);
      ctx.textAlign = 'left';
      this.zeichnung.push({
        i, stufe, x, y, w: w2, h: h2,
        farbe: GARSTUFEN_FARBE[stufe],
        fokus: i === this.auswahl,
      });
    }
    this.drawFokus(ctx, l);
  }

  /** Fokusmarkierung: Rahmen, Pfeil und Taktpuls am ausgewählten Rostplatz. */
  drawFokus(ctx, l) {
    const i = this.auswahl;
    const s = l.slot(i);
    const puls = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.time * 6));
    const takt = Math.max(0, 1 - this.beatPhase * 3);
    ctx.globalAlpha = clamp(puls, 0.4, 1);
    ctx.strokeStyle = FOKUS_FARBE;
    ctx.lineWidth = 1;
    const x = s.x - 3, y = l.rostY - 30, w = s.w + 6, h = 30;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.globalAlpha = 1;
    // Pfeil über der Wurst
    const ax = Math.round(s.x + s.w / 2);
    const ay = y - 4 + Math.round(Math.sin(this.time * 6) * 1);
    ctx.fillStyle = FOKUS_FARBE;
    ctx.fillRect(ax - 1, ay, 3, 4);
    ctx.fillRect(ax - 4, ay + 4, 9, 2);
    // Taktpuls am Rost
    if (takt > 0) {
      ctx.globalAlpha = takt * 0.9;
      ctx.fillStyle = '#5de0cf';
      ctx.fillRect(x, l.boden + 13, w, 2);
      ctx.globalAlpha = 1;
    }
    this.zeichnungFokus = { x, y, w, h, farbe: FOKUS_FARBE };
  }

  /** Teller mit den fertigen Würsten — man sieht, was geschafft ist. */
  drawTeller(ctx, l) {
    const fertig = this.wuerserste.filter((w) => w.zustand === 'fertig');
    const s = this.spr('teller');
    const px = 4, py = l.boden + 8;
    ctx.drawImage(s.canvas, px, py, s.w * 2, s.h * 2);
    for (let i = 0; i < fertig.length && i < 6; i++) {
      const stufe = this.stufe(fertig[i]);
      const ms = this.spr(stufe);
      const reihe = i < 3 ? 0 : 1;
      const spalte = i % 3;
      const w2 = Math.round(ms.w * 1.1), h2 = Math.round(ms.h * 1.1);
      const y = py + 1 - h2 - reihe * (h2 + 1);
      ctx.drawImage(ms.canvas, px + 8 + spalte * (w2 + 1), y, w2, h2);
    }
    ctx.fillStyle = '#e9e5d8';
    ctx.font = `bold ${this.vw > 300 ? 6 : 5}px monospace`;
    ctx.fillText(`TELLER ${fertig.length}`, px, py + s.h * 2 + 8);
  }

  /** Kiste mit dem Rest. */
  drawVorrat(ctx, l) {
    const offen = this.wuerserste.filter((w) => w.zustand === 'kiste').length;
    const px = l.vw - 46, py = l.boden - 14;
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(px, py, 38, 18);
    ctx.fillStyle = '#5a3a1c';
    ctx.fillRect(px, py, 38, 3);
    for (let i = 0; i < Math.min(offen, 5); i++) {
      ctx.fillStyle = '#c98a5a';
      ctx.fillRect(px + 3 + i * 7, py + 5, 5, 3);
    }
    ctx.fillStyle = '#e9e5d8';
    ctx.font = `bold ${l.vw > 300 ? 6 : 5}px monospace`;
    ctx.fillText(`VORRAT ${offen}`, px, py - 3);
  }

  drawEffekte(ctx, l) {
    // Rauch: aufsteigende Wolken, oben dünner
    for (const p of this.rauch) {
      const s = this.spr('rauch');
      const leben = clamp(p.rest / p.leben, 0, 1);
      const k = p.rest > 1.4 ? 1 : 2;
      ctx.globalAlpha = 0.5 * leben;
      ctx.drawImage(s.canvas, Math.round(p.x - s.w * k / 2), Math.round(p.y - s.h * k / 2), s.w * k, s.h * k);
      ctx.globalAlpha = 1;
    }
    // Dampfstoß beim Wenden
    for (const p of this.dampf) {
      const s = this.spr('dampf');
      const leben = clamp(p.rest / p.leben, 0, 1);
      ctx.globalAlpha = 0.85 * leben;
      ctx.drawImage(s.canvas, Math.round(p.x - s.w), Math.round(p.y - s.h), s.w * 2, s.h * 2);
      ctx.globalAlpha = 1;
    }
    // Fett tropft in die Glut
    for (const p of this.fett) {
      const s = this.spr('fett');
      ctx.drawImage(s.canvas, Math.round(p.x), Math.round(p.y), s.w * 2, s.h * 2);
    }
  }

  /** Ruhiges HUD: was noch offen ist, welche Stufen liegen, was im Takt lief. */
  drawHud(ctx, l) {
    const h = this.hud;
    const fs = this.vw > 300 ? 7 : 6;
    const y = l.vh - 12;
    ctx.fillStyle = 'rgba(11,8,16,0.55)';
    ctx.fillRect(0, y - 8, l.vw, 20);
    ctx.font = `bold ${fs}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e9e5d8';
    ctx.fillText(`OFFEN ${h.offen}`, 6, y);
    ctx.fillStyle = '#8a8a96';
    ctx.fillText('AUF DEM ROST', 6, y + 8);
    ctx.fillStyle = '#e8c46a';
    ctx.fillText(h.stufen.map((s) => GARSTUFEN_TEXT[s]).join(' · ') || '—', 66, y + 8);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9ff3ea';
    ctx.fillText(`IM TAKT ${h.sauber}`, l.vw - 6, y);
    ctx.fillStyle = h.verbrannt ? '#e08a52' : '#8a8a96';
    ctx.fillText(`VERBRANNT ${h.verbrannt}`, l.vw - 6, y + 8);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e9e5d8';
    ctx.fillText(`${h.punkte} PUNKTE`, Math.round(l.vw / 2), y);
    ctx.fillStyle = h.fokusName ? '#f2d24b' : '#8a8a96';
    ctx.fillText(h.fokusName ? `FOKUS ${h.fokusName}` : 'FOKUS —', Math.round(l.vw / 2), y + 8);
    ctx.textAlign = 'left';
    // Taktpuls: ruhiger Metronomschlag unten
    const puls = Math.max(0, 1 - this.beatPhase * 2.6);
    ctx.fillStyle = `rgba(93,224,207,${0.10 * puls + 0.04})`;
    ctx.fillRect(0, l.vh - 3, l.vw, 3);
    ctx.fillStyle = `rgba(93,224,207,${0.75 * puls})`;
    ctx.fillRect(Math.round(this.beatPhase * l.vw) - 2, l.vh - 3, 4, 3);
  }
}
