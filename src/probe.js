// src/probe.js — „DIE LETZTE PROBE": das Boss-Minispiel am Bühnenrand (DRR-P1).
//
// Aufbau wie src/racer.js: Daten und Zustandslogik sind ohne DOM ladbar, damit
// Node-Tests den Plan und die Regeln prüfen können; gezeichnet wird auf den
// übergebenen Canvas-Kontext. Der Ablauf der Einsätze entsteht in
// bauProbePlan() — reine, deterministische Daten aus (schwierigkeit, seed).
//
// Idee (Roland): Nach dem Finale lässt der Dirigent niemanden ohne eine letzte
// Probe gehen. Über der Bühnenkante tauchen Dirigent, Piccolo, Becken und
// Sopran auf; zwei Tasten: EINSATZ (E) nur beim Dirigenten, OHROPAX (O) bei
// allem Lauten. Kein Fail-Zustand — der Lauf endet immer nach der Coda, das
// Verdikt fällt nur über die Quote.
import { DIFFICULTY } from './config.js';

/** Gesamtdauer eines Laufs in Sekunden (Auftrag: 65–75 s). */
export const PROBE_DAUER = 70;
/** Vorlauf: so lange vor dem Fenster taucht eine Figur schon auf. */
export const PROBE_RISE = 0.35;
/** Gnade: drei Patzer in Folge dehnen das nächste Intervall — höchstens dreimal. */
export const PROBE_GNADE_FAKTOR = 1.4;
export const PROBE_GNADE_MAX = 3;

/** Figuren → Taste. Der Dirigent bekommt den Einsatz, alles Laute die Ohropax. */
export const PROBE_TASTEN = {
  dirigent: 'einsatz', becken: 'ohropax', piccolo: 'ohropax', sopran: 'ohropax',
};
export const PROBE_TASTE_LABEL = { einsatz: 'EINSATZ', ohropax: 'OHROPAX' };

/** Texte der Station (kurz, in Versalien — wie überall im Spiel). */
export const PROBE_TEXTE = {
  intro: '„EINE GEHT NOCH." — ER LÄSST DICH NICHT OHNE PROBE GEHEN.',
  bedienung: 'EINSATZ (E) NUR BEIM DIRIGENTEN · OHROPAX (O) BEI ALLEM LAUTEN',
  luft: 'DER DIRIGENT GIBT DIR LUFT.',
};
export const PROBE_VERDIKTE = [
  {
    id: 'steht', name: 'DIE PROBE STEHT',
    text: 'DER DIRIGENT NICKT. JETZT DARFST DU GEHEN.',
  },
  {
    id: 'durchgewinkt', name: 'DURCHGEWINKT',
    text: 'ER SEUFZT. WIR REDEN NICHT DARÜBER.',
  },
  {
    id: 'mutig', name: 'MUTIG.',
    text: 'ER KLAPPT DIE PARTITUR ZU. AUCH EIN WEG.',
  },
];

/** Die vier Sätze mit Fenster, Abstand und Tempo (Basis „normal"). */
export const PROBE_SAETZE = [
  { id: 'vom-blatt', name: 'VOM BLATT', von: 0, bis: 20, abstand: [2.2, 2.8], fenster: 0.9, bpm: 88 },
  { id: 'nochmal', name: 'NOCHMAL VON VORNE', von: 20, bis: 45, abstand: [1.4, 2.0], fenster: 0.7, bpm: 104 },
  { id: 'generalprobe', name: 'GENERALPROBE', von: 45, bis: 65, abstand: [1.0, 1.4], fenster: 0.55, bpm: 120 },
  { id: 'coda', name: 'SCHLUSSAKKORD', von: 65, bis: PROBE_DAUER, abstand: [0.7, 0.7], fenster: 0.5, bpm: 128, coda: true },
];

/** Die Leveldaten der Station (world.js hängt sie an ihren Platz in der Reise). */
export function buildProbe() {
  return {
    id: 'probe',
    name: 'DIE LETZTE PROBE',
    subtitle: 'Eine geht noch: der Dirigent lässt dich nicht ohne Probe gehen.',
    mode: 'probe',
    bpm: PROBE_SAETZE[0].bpm,
    pult: true,
    takts: [
      { at: 0.29, bpm: 104, label: 'NOCHMAL VON VORNE — DIE AKZENTE WECHSELN' },
      { at: 0.64, bpm: 120, label: 'GENERALPROBE — JETZT ZÄHLT JEDER EINSATZ' },
      { at: 0.93, bpm: 128, label: 'SCHLUSSAKKORD — DER DIRIGENT WILL ES WISSEN' },
    ],
  };
}

/** Satz zu einer Zeit (Sekunden seit Probenbeginn). */
export function satzBei(zeit) {
  for (const s of PROBE_SAETZE) if (zeit >= s.von && zeit < s.bis) return s;
  return PROBE_SAETZE[PROBE_SAETZE.length - 1];
}

/**
 * Verdikt nach Quote (Auftrag): ≥ 80 % Treffer UND höchstens 6 Patzer →
 * „DIE PROBE STEHT"; ab 55 % → „DURCHGEWINKT"; sonst „MUTIG.". Alle drei
 * führen normal weiter — es gibt keinen Fail-Zustand, nichts wird gesperrt.
 */
export function verdiktIndex(treffer, patzer) {
  const gesamt = treffer + patzer;
  const quote = gesamt > 0 ? treffer / gesamt : 0;
  if (quote >= 0.8 && patzer <= 6) return 0;
  if (quote >= 0.55) return 1;
  return 2;
}

export class Probe {
  constructor({ level, input, audio, events = () => {}, view, difficulty = 'gemuetlich' }) {
    this.level = level || buildProbe();
    this.input = input;
    this.audio = audio || { play() {}, daempfe() {}, resume() {} };
    this.events = events;
    this.vw = view.w;
    this.vh = view.h;
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'gemuetlich';
    this.diff = DIFFICULTY[this.difficulty];
    this.reset();
  }

  reset() {
    this.state = 'play';
    this.pauseReason = null;
    this.zeit = 0;
    this.treffer = 0;
    this.patzer = 0;
    this.serie = 0;
    this.verdikt = null;
    this.hint = null;
    this.hintQueue = [];
    this.pultPuls = 0;
    this.shake = 0;
    this.bpm = this.level.bpm || PROBE_SAETZE[0].bpm;
    this.beatPhase = 0;
    this.beats = 0;
    this.hud = this.buildHud();
  }

  pause(reason = 'user') {
    if (this.state === 'play') { this.state = 'paused'; this.pauseReason = reason; }
  }
  resume() { if (this.state === 'paused') { this.state = 'play'; this.pauseReason = null; } }
  setDifficulty(key) {
    if (!DIFFICULTY[key]) return;
    this.difficulty = key;
    this.diff = DIFFICULTY[key];
    this.hud = this.buildHud();
  }

  message(text, dur = 4.5, prio = 1) {
    if (!text) return false;
    if (this.hint && this.zeit - this.hint.at < 1.5 && this.hint.prio >= prio) {
      if (!this.hintQueue.some((q) => q.text === text) && this.hintQueue.length < 5) {
        this.hintQueue.push({ text, dur, prio });
      }
      return false;
    }
    this.hint = { text, until: this.zeit + dur, prio, at: this.zeit };
    return true;
  }

  /** Restzeit bis zum Verdikt. */
  restzeit() { return Math.max(0, PROBE_DAUER - this.zeit); }

  buildHud() {
    const satz = satzBei(this.zeit);
    return {
      modus: 'probe',
      treffer: this.treffer,
      patzer: this.patzer,
      satz: satz.name,
      satzId: satz.id,
      restzeit: this.restzeit(),
      zeit: this.zeit,
      bpm: this.bpm,
      beatPhase: this.beatPhase,
      strecke: Math.max(0, Math.min(1, this.zeit / PROBE_DAUER)),
      hint: this.hint ? this.hint.text : null,
      hintPrio: this.hint ? this.hint.prio : 0,
      verdikt: this.verdikt ? this.verdikt.name : null,
      ziel: this.level.ziel || 'DIE LETZTE PROBE BESTEHEN — EINSATZ UND OHROPAX IM TAKT',
      label: null,
      state: this.state,
    };
  }

  /** Läuft der Lauf noch? (Verdikt erst nach der Coda.) */
  update(dt) {
    if (this.state !== 'play') return;
    this.zeit += dt;
    const satz = satzBei(this.zeit);
    this.bpm = satz.bpm;
    this.beatPhase += dt * (this.bpm / 60);
    while (this.beatPhase >= 1) { this.beatPhase -= 1; this.beats++; this.pultPuls = 1; }
    this.pultPuls = Math.max(0, this.pultPuls - dt * 3.2);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 12);
    if (this.hint && this.zeit > this.hint.until) {
      const q = this.hintQueue.shift();
      this.hint = q ? { text: q.text, until: this.zeit + q.dur, prio: q.prio, at: this.zeit } : null;
    }
    if (this.zeit >= PROBE_DAUER) { this.complete(); return; }
    this.hud = this.buildHud();
  }

  /** Der Lauf endet immer — ohne Fail-Zustand, nur mit dem Verdikt. */
  complete() {
    if (this.state === 'complete') return;
    this.state = 'complete';
    this.zeit = Math.max(this.zeit, PROBE_DAUER);
    this.verdikt = this.verdikt || PROBE_VERDIKTE[verdiktIndex(this.treffer, this.patzer)];
    this.audio.play('fanfare');
    this.hud = this.buildHud();
    this.rows = [
      ['TREFFER', String(this.treffer)],
      ['PATZER', String(this.patzer)],
      ['QUOTE', `${Math.round(this.quote() * 100)} %`],
      ['VERDIKT', this.verdikt.name],
    ];
    this.events({
      type: 'complete',
      stats: { treffer: this.treffer, patzer: this.patzer, quote: this.quote(), verdikt: this.verdikt },
      rows: this.rows,
    });
  }

  /** Trefferquote des Laufs (0–1). */
  quote() {
    const gesamt = this.treffer + this.patzer;
    return gesamt > 0 ? this.treffer / gesamt : 0;
  }

  draw(ctx) {
    // Gerüst (Phase 1): Bühne, Pult und die Bedienzeile. Die Figuren und ihre
    // Animationen kommen mit der Optik-Phase dazu.
    const w = this.vw, h = this.vh;
    ctx.fillStyle = '#141021';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#241b33';
    ctx.fillRect(0, Math.round(h * 0.62), w, h);
    ctx.fillStyle = '#2f2440';
    ctx.fillRect(0, Math.round(h * 0.62), w, 2);
  }
}
