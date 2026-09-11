// grill.js — Das Bratwurst-Grill-Minispiel im Epilog.
// Drei Roste, acht Würste, ein Takt. Wenden und servieren mit der Aktions-Taste.
// Genau im Takt gewendet gibt Bonus — ohne Takt geht es aber auch (Geschenk!).
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const TILE = 16;
const ROSTE = 3;
const WUERSTE = 8;
const OPTIMAL = 76;        // idealer Garstand
const FENSTER = 22;        // Toleranz um das Optimum

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
    this.fertig = 0;
    this.hint = null;
    this.hintUntil = 0;
    this.auswahl = 1;
    this.prevAction = false;
    this.rows = [];
    // Die Würste liegen bereit; drei sind auf dem Rost
    this.wuerserste = [];
    for (let i = 0; i < WUERSTE; i++) {
      this.wuerserste.push({ seite: 0, gar: 0, gewendet: 0, zustand: i < ROSTE ? 'rost' : 'kiste', qualitaet: 0 });
    }
    this.grill = this.wuerserste.filter((w) => w.zustand === 'rost');
    this.hud = this.buildHud();
  }

  buildHud() {
    return {
      modus: 'grill',
      punkte: Math.round(this.punktestand),
      serviert: this.serviert,
      sauber: this.sauber,
      verbrannt: this.verbrannt,
      fertig: this.fertig,
      offen: WUERSTE - this.fertig,
      takt: this.bpm,
      beatPhase: this.beatPhase,
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

  aktion() {
    const idx = this.auswahl;
    const w = this.wuerserste.filter((x) => x.zustand === 'rost')[idx];
    if (!w) return;
    const genau = this.beatGenauigkeit() <= (this.difficulty === 'gemuetlich' ? 0.22 : 0.16);
    if (w.seite === 0) {
      w.seite = 1;
      w.gewendet += 1;
      if (genau) { w.sauber = 1; this.sauber += 1; }
      this.message(genau ? 'SAUBER GEWENDET. IM TAKT.' : 'GEWENDET. GEHT DOCH.', 2);
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
      ['VERBRANNT', String(this.verbrannt)],
      ['PUNKTE', String(this.punktestand)],
      ['BEWERTUNG', note],
    ];
    this.audio.play('fanfare');
    this.events({ type: 'complete', stats: { punkte: this.punktestand }, rows: this.rows });
  }

  update(dt) {
    if (this.state !== 'play') return;
    this.time += dt;
    this.beatPhase += dt * (this.bpm / 60);
    if (this.beatPhase >= 1) { this.beatPhase -= 1; this.beats += 1; }

    const achse = this.input.axis();
    if (achse < -0.4) this.auswahl = Math.max(0, this.auswahl - 1);
    else if (achse > 0.4) this.auswahl = Math.min(ROSTE - 1, this.auswahl + 1);

    const jetzt = this.input.action();
    if (jetzt && !this.prevAction) this.aktion();
    this.prevAction = jetzt;

    for (const w of this.wuerserste) {
      if (w.zustand !== 'rost') continue;
      const tempo = this.difficulty === 'gemuetlich' ? 0.75 : 1;
      w.gar += dt * (w.seite === 0 ? 12 : 16) * tempo;
      if (w.gar > 100) {
        w.zustand = 'fertig';
        w.verbrannt = 1;
        this.verbrannt += 1;
        this.fertig += 1;
        this.audio.play('hurt');
        this.message('DAS WAR ZU LANGE. KOHLE IST AUCH EINE FORM VON ESSEN.', 3);
        this.nachlegen();
      }
    }
    if (this.hint && this.time > this.hintUntil) this.hint = null;
    this.hud = this.buildHud();
  }

  // ---------------------------------------------------------------- Zeichnen --
  draw(ctx) {
    const vw = this.vw, vh = this.vh;
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
    // Grill
    const boden = Math.round(vh * 0.78);
    const breite = Math.round(vw * 0.72);
    const links = Math.round((vw - breite) / 2);
    const rostBreite = Math.round(breite / ROSTE);
    ctx.fillStyle = '#2b2b32';
    ctx.fillRect(links - 6, boden, breite + 12, 10);
    for (let i = 0; i < ROSTE; i++) {
      const x = links + i * rostBreite;
      ctx.fillStyle = i === this.auswahl ? '#5a3a22' : '#3a3a42';
      ctx.fillRect(x + 2, boden - 6, rostBreite - 4, 6);
      ctx.fillStyle = '#1a1a20';
      for (let k = 0; k < 5; k++) ctx.fillRect(x + 4 + k * Math.round((rostBreite - 8) / 5), boden - 4, 2, 4);
      // Glut
      ctx.fillStyle = 'rgba(255,140,60,0.35)';
      ctx.fillRect(x + 2, boden - 2, rostBreite - 4, 3);
    }
    // Würste
    const aufRost = this.wuerserste.filter((w) => w.zustand === 'rost');
    for (let i = 0; i < ROSTE; i++) {
      const w = aufRost[i];
      if (!w) continue;
      const x = links + i * rostBreite + 4;
      const y = boden - 14;
      const b = Math.max(4, rostBreite - 12);
      const farbe = w.gar > 100 ? '#241f1a' : w.gar > 85 ? '#6b4526' : w.gar > 55 ? '#8a5a30' : '#c98a86';
      ctx.fillStyle = '#151018';
      ctx.fillRect(x - 1, y - 1, b + 2, 8);
      ctx.fillStyle = farbe;
      ctx.fillRect(x, y, b, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x, y + 1, b, 1);
      if (w.seite === 0) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x, y + 7, b, 1); }
      // Garstand als kleiner Balken
      ctx.fillStyle = '#0b0810';
      ctx.fillRect(x, y - 5, b, 3);
      ctx.fillStyle = w.gar > 85 ? '#b0392f' : w.gar > 55 ? '#e8c46a' : '#8a8a96';
      ctx.fillRect(x, y - 5, Math.round(b * Math.min(1, w.gar / 100)), 3);
    }
    // Auswahlpfeil
    const ax = links + this.auswahl * rostBreite + Math.round(rostBreite / 2);
    ctx.fillStyle = '#e8c46a';
    ctx.fillRect(ax - 1, boden - 26, 3, 6);
    ctx.fillRect(ax - 3, boden - 21, 7, 3);
    // Taktpuls unten
    const puls = Math.max(0, 1 - this.beatPhase * 2.6);
    ctx.fillStyle = `rgba(93,224,207,${0.10 * puls})`;
    ctx.fillRect(0, vh - 3, vw, 3);
    // Kiste mit Vorrat
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(vw - 44, boden - 12, 34, 14);
    ctx.fillStyle = '#8a5a30';
    ctx.fillRect(vw - 42, boden - 10, 30, 2);
    ctx.fillStyle = '#e9e5d8';
    ctx.fillRect(vw - 40, boden - 8, 26, 8);
  }
}
