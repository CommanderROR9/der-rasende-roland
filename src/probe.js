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
import { SPRITES } from './sprites.js';
import { spriteCanvas } from './render.js';

/** Gesamtdauer eines Laufs in Sekunden (Auftrag: 65–75 s). */
export const PROBE_DAUER = 70;
/** Höhe der Bühnenkante im Bild (Anteil der Sichtfläche). */
export const PROBE_BUEHNENKANTE = 0.62;
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

// ============================================================================
// PLAN — reine, deterministische Daten (Node-prüfbar)
//
// Der Ablauf entsteht aus (schwierigkeit, seed): Sätze mit eigenen Fenstern und
// Abständen, die Ereignisse auf dem Takt-Raster des Satzes, die Coda mit vier
// festen Einsätzen. Die Fairness-Regeln sind hier erzwungen, nicht in der
// Zeichenroutine: Rise vor dem Fenster, Mindestabstand zwischen verschiedenen
// Tasten, Doppel immer auf derselben Taste.
// ============================================================================

/** Standard-Seed: derselbe Lauf bei denselben Einstellungen (Tests). */
export const PROBE_SEED = 20260914;
/** Spalten, in denen die Figuren über der Bühnenkante auftauchen. */
export const PROBE_SPALTEN = 5;
/** Mindestabstand zweier verschiedener Tasten (Auftrag). */
export const PROBE_TASTEN_ABSTAND = 0.55;
/** Coda: Abstand der vier festen Einsätze in Schlägen (1,5 × 1/128 min = 0,703 s). */
export const PROBE_CODA_SCHLAEGE = 1.5;

/** Kleiner, deterministischer Zufallsgenerator (mulberry32). */
function probeZufall(seed) {
  let a = (Number(seed) || 0) | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fenster-Skalierung je Schwierigkeit — wie `trittWindow` in config.js. */
export function probeFensterSkala(schwierigkeit) {
  const d = DIFFICULTY[schwierigkeit] || DIFFICULTY.gemuetlich;
  return Math.max(0.5, Math.min(1.2, d.trittWindow / DIFFICULTY.gemuetlich.trittWindow));
}

/** Taste einer Figur (eine Quelle für Plan und Szene). */
export function figurTaste(figur) {
  return PROBE_TASTEN[figur] || 'ohropax';
}

const LAUTE = ['becken', 'piccolo', 'sopran'];

/**
 * Der Plan eines Laufs. Rückgabe (alles Sekunden, absolut ab Probenbeginn):
 *   dauer, saetze, ereignisse[{ i, t, von, bis, rise, fenster, figur, figuren,
 *   taste, satz, spalte, art }], schlussakkord, rasterFehler
 */
export function bauProbePlan({ schwierigkeit = 'gemuetlich', seed = PROBE_SEED } = {}) {
  const rnd = probeZufall(typeof seed === 'number' ? seed : PROBE_SEED);
  const skala = probeFensterSkala(schwierigkeit);
  const ereignisse = [];
  let spalteZuvor = -1;

  const spalte = () => {
    // Immer eine andere Spalte als das Ereignis davor — sonst liegen zwei
    // Figuren sichtbar übereinander.
    let s = Math.floor(rnd() * PROBE_SPALTEN) % PROBE_SPALTEN;
    if (s === spalteZuvor) s = (s + 1) % PROBE_SPALTEN;
    spalteZuvor = s;
    return s;
  };

  const druecke = (rohT, satz, figuren, art = 'einzeln', extra = {}) => {
    const fenster = Math.max(0.3, satz.fenster * skala);
    const teiler = extra.rasterTeiler || 1;
    const schritt = (60 / satz.bpm) / teiler;
    const min = extra.min !== undefined ? extra.min : satz.abstand[0];
    const max = extra.max !== undefined ? extra.max : satz.abstand[1];
    const letzte = ereignisse[ereignisse.length - 1];
    const taste = figurTaste(figuren[0]);
    let t;
    if (extra.genau) {
      // Vorgegebene Zeit (Coda): schon auf dem Raster gerechnet, nichts runden.
      t = rohT;
    } else {
      // Untere Grenze: der Abstand zum Vorgänger. Bei verschiedener Taste gilt
      // die harte Fairness-Regel (≥ 0,55 s), bei gleicher Taste darf es enger
      // sein — ein „Doppel“ verlangt genau das.
      let unten = letzte ? letzte.t + min : 0;
      if (letzte) {
        unten = Math.max(unten, letzte.t + (letzte.taste !== taste ? PROBE_TASTEN_ABSTAND : Math.min(min, 0.4)));
      }
      const band = [];
      const k0 = Math.floor(rohT / schritt);
      for (let k = k0 - 1; k <= k0 + 2; k++) {
        const zeit = k * schritt;
        if (letzte && zeit < unten - 1e-9) continue;
        if (letzte && zeit - letzte.t > max + 1e-9) continue;
        band.push(zeit);
      }
      t = band.length
        ? band.reduce((a, b) => (Math.abs(b - rohT) < Math.abs(a - rohT) ? b : a))
        : Math.ceil((unten + 1e-9) / schritt) * schritt;
    }
    if (letzte && t <= letzte.t) t = letzte.t + schritt;
    const e = {
      i: ereignisse.length,
      t,
      von: t,
      bis: t + fenster,
      rise: t - PROBE_RISE,
      fenster,
      figur: figuren[0],
      figuren: figuren.slice(),
      taste,
      satz: satz.id,
      spalte: spalte(),
      art,
      rasterTeiler: teiler,
      ...extra,
    };
    delete e.min; delete e.max;
    ereignisse.push(e);
    return e;
  };

  // --- Satz 1 „VOM BLATT": Einzelfiguren, erste drei fest ---------------------
  const s1 = PROBE_SAETZE[0];
  const fest = ['dirigent', 'sopran', 'dirigent'];
  let t = 4.0;
  let n = 0;
  while (t <= s1.bis - 0.8) {
    const figur = n < fest.length ? fest[n]
      : (rnd() < 0.5 ? 'dirigent' : LAUTE[Math.floor(rnd() * LAUTE.length)]);
    druecke(t, s1, [figur], 'einzeln', { fest: n < fest.length });
    n++;
    t += s1.abstand[0] + rnd() * (s1.abstand[1] - s1.abstand[0]);
  }

  // --- Satz 2 „NOCHMAL VON VORNE": Stich und erstes Doppel -------------------
  const s2 = PROBE_SAETZE[1];
  const muster2 = ['einzeln', 'stich', 'doppel', 'einzeln', 'stich', 'doppel', 'einzeln'];
  t = 20.4;
  let m = 0;
  while (t <= s2.bis - 1.2) {
    const art = muster2[m % muster2.length];
    m++;
    if (art === 'stich') {
      // Einsatz, danach ≤ 1,3 s später der Lärm — der Abstand bleibt über
      // 0,55 s (verschiedene Tasten), das Fenster des Stichs ist eng.
      druecke(t, s2, ['dirigent'], 'stich');
      const laut = LAUTE[Math.floor(rnd() * LAUTE.length)];
      druecke(t + 0.9, s2, [laut], 'stich-laut', { min: 0.6, max: 1.3 });
      t = ereignisse[ereignisse.length - 1].t + (s2.abstand[0] + rnd() * (s2.abstand[1] - s2.abstand[0]));
      continue;
    }
    if (art === 'doppel') {
      // Zwei Figuren, immer dieselbe Taste — zweimal tippen.
      const laut = rnd() < 0.35;
      const g = laut
        ? [LAUTE[Math.floor(rnd() * LAUTE.length)], LAUTE[Math.floor(rnd() * LAUTE.length)]]
        : ['dirigent', 'dirigent'];
      const e1 = druecke(t, s2, [g[0]], 'doppel');
      druecke(e1.t + 0.5, s2, [g[1]], 'doppel', { min: 0.4, max: 0.8 });
      t = ereignisse[ereignisse.length - 1].t + (s2.abstand[0] + rnd() * (s2.abstand[1] - s2.abstand[0]));
      continue;
    }
    const figur = rnd() < 0.55 ? 'dirigent' : LAUTE[Math.floor(rnd() * LAUTE.length)];
    druecke(t, s2, [figur], 'einzeln');
    t += s2.abstand[0] + rnd() * (s2.abstand[1] - s2.abstand[0]);
  }

  // --- Satz 3 „GENERALPROBE": Doppel-Lärm und kurze Ketten -------------------
  const s3 = PROBE_SAETZE[2];
  const muster3 = ['einzeln', 'doppel-laerm', 'kette', 'einzeln', 'kette', 'doppel-laerm', 'einzeln'];
  t = 45.4;
  let k = 0;
  while (t <= s3.bis - 1.0) {
    const art = muster3[k % muster3.length];
    k++;
    if (art === 'doppel-laerm') {
      // Zwei Laute gleichzeitig — ein Druck reicht (eine Figur, ein Ereignis).
      const a = LAUTE[Math.floor(rnd() * LAUTE.length)];
      let b = LAUTE[Math.floor(rnd() * LAUTE.length)];
      if (b === a) b = LAUTE[(LAUTE.indexOf(a) + 1) % LAUTE.length];
      druecke(t, s3, [a, b], 'doppel-laerm', { gleichzeitig: true });
    } else if (art === 'kette') {
      // Drei kurze Einsätze auf derselben Taste, dichter als der Satzabstand.
      const figur = rnd() < 0.5 ? 'dirigent' : LAUTE[Math.floor(rnd() * LAUTE.length)];
      let letzter = druecke(t, s3, [figur], 'kette');
      for (let q = 1; q < 3; q++) {
        letzter = druecke(letzter.t + 0.65, s3, [figur], 'kette', { min: 0.5, max: 0.9 });
      }
    } else {
      const figur = rnd() < 0.5 ? 'dirigent' : LAUTE[Math.floor(rnd() * LAUTE.length)];
      druecke(t, s3, [figur], 'einzeln');
    }
    t = ereignisse[ereignisse.length - 1].t + (s3.abstand[0] + rnd() * (s3.abstand[1] - s3.abstand[0]));
  }

  // --- Coda „SCHLUSSAKKORD": vier feste Einsätze im Wechsel ------------------
  const coda = PROBE_SAETZE[3];
  const codaSchritt = (60 / coda.bpm) / 2;               // Achtelraster des Satzes
  const codaAbstand = codaSchritt * 2 * PROBE_CODA_SCHLAEGE;   // 1,5 Schläge = 0,703 s
  // Auf dem Raster verankert, damit die Coda exakt im Puls liegt.
  const codaStart = Math.round(coda.von / codaSchritt) * codaSchritt;
  const codaFiguren = ['dirigent', 'becken', 'dirigent', 'sopran'];
  for (let c = 0; c < codaFiguren.length; c++) {
    druecke(codaStart + c * codaAbstand, coda, [codaFiguren[c]], 'coda',
      { coda: true, genau: true, rasterTeiler: 2 });
  }

  // Rasterfehler je Ereignis: Abstand zum nächsten Schlag (Sätze) bzw. zum
  // Achtel-Raster der Coda (1,5 Schläge sind ein Achtel-Vielfaches).
  let rasterFehler = 0;
  for (const e of ereignisse) {
    const satz = PROBE_SAETZE.find((s) => s.id === e.satz);
    const schritt = (60 / satz.bpm) / (e.coda ? 2 : 1);
    const abweichung = Math.abs(e.t - Math.round(e.t / schritt) * schritt);
    e.rasterFehler = abweichung;
    rasterFehler = Math.max(rasterFehler, abweichung);
  }

  const letztes = ereignisse[ereignisse.length - 1];
  return {
    seed: typeof seed === 'number' ? seed : PROBE_SEED,
    schwierigkeit,
    fensterSkala: skala,
    dauer: PROBE_DAUER,
    saetze: PROBE_SAETZE.map((s) => ({ ...s, fenster: Math.max(0.3, s.fenster * skala) })),
    ereignisse,
    schlussakkord: letztes.bis + 0.6,
    rasterFehler,
  };
}

export class Probe {
  constructor({ level, input, audio, events = () => {}, view, difficulty = 'gemuetlich', seed }) {
    this.level = level || buildProbe();
    this.input = input;
    this.audio = audio || { play() {}, daempfe() {}, resume() {} };
    this.events = events;
    this.vw = view.w;
    this.vh = view.h;
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'gemuetlich';
    this.diff = DIFFICULTY[this.difficulty];
    this.seed = Number.isFinite(seed) ? seed : undefined;
    this.reset();
  }

  reset() {
    this.state = 'play';
    this.pauseReason = null;
    this.zeit = 0;
    this.treffer = 0;
    this.patzer = 0;
    this.serie = 0;          // Patzer in Folge
    this.gnade = 0;          // gewährte Dehnungen (höchstens 3 je Lauf)
    this.versatz = 0;        // Sekunden, um die die Gnade den Rest schiebt
    this.luftGezeigt = false;
    this.leerlauf = 0;       // neutrale Drücke (nichts offen / im Rise)
    this.verdikt = null;
    this.hint = null;
    this.hintQueue = [];
    this.pultPuls = 0;
    this.shake = 0;
    this.beatPhase = 0;
    this.beats = 0;
    this.plan = bauProbePlan({ schwierigkeit: this.difficulty, seed: this.seed });
    // Laufkopie des Plans: die Gnade verschiebt nur die noch folgenden
    // Ereignisse — der Plan selbst bleibt als Vertrag unangetastet.
    this.ablauf = this.plan.ereignisse.map((e) => ({
      ...e, status: 'aus', tEff: e.t, vonEff: e.von, bisEff: e.bis, riseEff: e.rise,
    }));
    this.vorher = { action: false, ohropax: false };
    this.noten = [];         // gelungene Einsätze (Notenflug aufs Blatt)
    this.ohren = [];         // Ohropax, die in die Ohren ploppt
    this.becken = [];        // Becken-Crash
    this.uhr = 0;            // der Dirigent klopft an die Uhr
    this.bpm = this.level.bpm || PROBE_SAETZE[0].bpm;
    this.hud = this.buildHud();
    // Die Ansage des Dirigenten steht vor dem ersten Einsatz (bei t ≈ 4 s).
    this.message(PROBE_TEXTE.intro, 6, 2);
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
  restzeit() { return Math.max(0, this.endeZeit() - this.zeit); }

  /** Ende des Laufs: nach der Coda — auch mit Gnade bleibt es unter 75 s. */
  endeZeit() {
    const letztes = this.ablauf[this.ablauf.length - 1];
    return Math.max(this.plan ? this.plan.dauer : PROBE_DAUER,
      letztes ? letztes.bisEff + 0.4 : PROBE_DAUER);
  }

  /** Die gerade offene Figur (für HUD und Prüfungen). */
  offeneFigur() {
    const e = this.ablauf.find((x) => x.status === 'offen' || x.status === 'rise');
    return e ? e.figur : null;
  }

  /** Sichtbare Figuren mit Lage (Zeichnung und Prüfungen). */
  figuren() {
    const sp = Math.round(this.vw / PROBE_SPALTEN);
    const boden = Math.round(this.vh * PROBE_BUEHNENKANTE);
    return this.ablauf
      .filter((e) => e.status !== 'aus')
      .map((e) => ({
        figur: e.figur, figuren: e.figuren.slice(), taste: e.taste, status: e.status,
        spalte: e.spalte, art: e.art, gleichzeitig: !!e.gleichzeitig,
        x: Math.round((e.spalte + 0.5) * sp), spaltenbreite: sp, y: boden,
        t: e.tEff, bis: e.bisEff,
      }));
  }

  buildHud() {
    const satz = satzBei(this.zeit);
    return {
      modus: 'probe',
      treffer: this.treffer,
      patzer: this.patzer,
      serie: this.serie,
      gnade: this.gnade,
      satz: satz.name,
      satzId: satz.id,
      figur: this.offeneFigur(),
      restzeit: this.restzeit(),
      zeit: this.zeit,
      bpm: this.bpm,
      beatPhase: this.beatPhase,
      strecke: Math.max(0, Math.min(1, this.zeit / this.endeZeit())),
      hint: this.hint ? this.hint.text : null,
      hintPrio: this.hint ? this.hint.prio : 0,
      verdikt: this.verdikt ? this.verdikt.name : null,
      ziel: this.level.ziel || 'DIE LETZTE PROBE BESTEHEN — EINSATZ UND OHROPAX IM TAKT',
      label: null,
      state: this.state,
    };
  }

  // -------------------------------------------------------------- Ablauf ----
  /**
   * Lebenslauf der Ereignisse: auftauchen (Rise), Fenster öffnen, verfallen.
   * Ein verfallenes Fenster ist ein Patzer — der Lauf geht trotzdem weiter.
   */
  ablaufSchritt() {
    for (const e of this.ablauf) {
      if (e.status === 'aus' && this.zeit >= e.riseEff) { e.status = 'rise'; continue; }
      if (e.status === 'rise' && this.zeit >= e.tEff) { e.status = 'offen'; continue; }
      if ((e.status === 'offen') && this.zeit > e.bisEff) {
        e.status = 'verpasst';
        this.patzerBuchen(e, 'verpasst');
      }
    }
  }

  /**
   * Drücke auswerten. Ein Druck wertet genau einmal (Flanken): der Zustand wird
   * gehalten, gezählt wird nur der Wechsel false -> true. Drücke im Rise und im
   * Leerlauf (nichts offen) sind neutral, ein Druck auf die falsche Taste ist
   * ein Patzer.
   */
  druecke() {
    const st = (this.input && this.input.state) || {};
    const a = st.action === true;
    const o = st.ohropax === true;
    const gedrueckt = [];
    if (a && !this.vorher.action) gedrueckt.push('einsatz');
    if (o && !this.vorher.ohropax) gedrueckt.push('ohropax');
    this.vorher.action = a;
    this.vorher.ohropax = o;
    for (const taste of gedrueckt) this.werte(taste);
  }

  /** Einen einzelnen Druck auf die offenen Fenster anwenden. */
  werte(taste) {
    const ziel = this.ablauf.find((e) => e.status === 'offen' && e.taste === taste);
    if (ziel) { this.trefferBuchen(ziel); return; }
    const offen = this.ablauf.find((e) => e.status === 'offen');
    if (offen) { this.patzerBuchen(offen, 'falsche-taste'); return; }
    this.leerlauf += 1;      // neutral: nichts offen (auch im Rise)
  }

  trefferBuchen(e) {
    e.status = 'treffer';
    this.treffer += 1;
    this.serie = 0;
    if (e.taste === 'einsatz') {
      // Ein gelungener Einsatz wirft eine Note aufs Blatt.
      this.noten.push({ t: this.zeit, spalte: e.spalte, figur: e.figur });
      this.audio.play('seite');
    } else {
      // Die Ohropax ploppt in die Ohren — und der Saal klingt kurz gedämpft.
      this.ohren.push({ t: this.zeit, spalte: e.spalte, figur: e.figur });
      this.audio.play('plopp');
      this.audio.daempfe(0.4);
    }
    this.pultPuls = Math.max(this.pultPuls, 0.6);
  }

  patzerBuchen(e, art) {
    this.patzer += 1;
    this.serie += 1;
    const figur = e ? e.figur : 'dirigent';
    if (art === 'verpasst') e.verpasst = true;
    if (figur === 'becken') {
      this.becken.push({ t: this.zeit, spalte: e ? e.spalte : 0 });
      this.shake = 3;
      this.audio.play('becken');
    } else if (figur === 'piccolo') this.audio.play('quietsch');
    else if (figur === 'sopran') this.audio.play('spitze');
    else { this.uhr = 1.2; this.audio.play('beat'); }     // klopft an die Uhr
    if (this.serie >= 3 && this.gnade < PROBE_GNADE_MAX) this.gnadeGeben();
  }

  /**
   * Gnaden-Automatik: drei Patzer in Folge dehnen das nächste Intervall ×1,4 —
   * höchstens dreimal je Lauf. Die Einblendung kommt genau einmal.
   */
  gnadeGeben() {
    this.gnade += 1;
    this.serie = 0;
    const ab = this.ablauf.findIndex((e) => e.status === 'aus' || e.status === 'rise');
    if (ab < 0) return;
    const naechstes = this.ablauf[ab + 1];
    const intervall = naechstes ? Math.max(0.5, naechstes.tEff - this.ablauf[ab].tEff) : 1;
    const delta = (PROBE_GNADE_FAKTOR - 1) * intervall;
    for (let i = ab + 1; i < this.ablauf.length; i++) {
      const e = this.ablauf[i];
      e.tEff += delta; e.vonEff += delta; e.bisEff += delta; e.riseEff += delta;
    }
    this.versatz += delta;
    if (!this.luftGezeigt) {
      this.message(PROBE_TEXTE.luft, 4, 2);
      this.luftGezeigt = true;
    }
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
    if (this.uhr > 0) this.uhr = Math.max(0, this.uhr - dt);
    if (this.hint && this.zeit > this.hint.until) {
      const q = this.hintQueue.shift();
      this.hint = q ? { text: q.text, until: this.zeit + q.dur, prio: q.prio, at: this.zeit } : null;
    }
    this.ablaufSchritt();
    this.druecke();
    this.effekteAufraeumen();
    if (this.zeit >= this.endeZeit()) { this.complete(); return; }
    this.hud = this.buildHud();
  }

  /** Noten, Ohropax und Becken verschwinden nach ihrer kurzen Animation. */
  effekteAufraeumen() {
    const rest = (list, dauer) => list.filter((x) => this.zeit - x.t < dauer);
    this.noten = rest(this.noten, 0.5);
    this.ohren = rest(this.ohren, 0.5);
    this.becken = rest(this.becken, 0.45);
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
    // Die Szene: Pult-Perspektive. Vorne das Notenpult mit Blatt und Lampe,
    // dahinter die Bühne — die Figuren tauchen „in etwas Entfernung" über der
    // Bühnenkante auf, fünf Spalten breit.
    const w = this.vw, h = this.vh;
    const boden = Math.round(h * PROBE_BUEHNENKANTE);
    ctx.save();
    if (this.shake > 0) {
      // Kleiner Bildschirm-Schüttler beim Becken-Crash: deterministisch aus
      // der Reststärke, damit Prüfungen reproduzierbar bleiben.
      ctx.translate(Math.round(Math.sin(this.zeit * 60) * this.shake),
        Math.round(Math.cos(this.zeit * 53) * this.shake * 0.6));
    }
    // ------------------------------------------------------------- Bühne ----
    ctx.fillStyle = '#141021';
    ctx.fillRect(-8, -8, w + 16, h + 16);
    ctx.fillStyle = '#1c1530';
    ctx.fillRect(-8, -8, w + 16, boden + 8);
    ctx.fillStyle = '#241b33';
    ctx.fillRect(-8, boden, w + 16, h - boden + 8);
    ctx.fillStyle = '#2f2440';
    ctx.fillRect(-8, boden, w + 16, 2);
    ctx.fillStyle = '#1a1426';
    ctx.fillRect(-8, boden + 2, w + 16, 1);
    // Spaltenmarken am Bühnenrand (fünf Plätze)
    const sp = Math.round(w / PROBE_SPALTEN);
    ctx.fillStyle = '#2b2138';
    for (let i = 1; i < PROBE_SPALTEN; i++) ctx.fillRect(i * sp, boden + 3, 1, 3);

    // ------------------------------------------------------------ Figuren ----
    for (const f of this.figuren()) {
      const paket = this.sprite(f.figur);
      if (!paket) continue;
      const mass = 2;                      // Pixel-Art doppelt: erkennbar groß
      const bw = paket.w * mass, bh = paket.h * mass;
      const x = Math.round(f.x - bw / 2);
      let y = boden - bh + 2;
      let blitz = 0;
      let alpha = 1;
      if (f.status === 'rise') {
        // Auftauchen mit Überschwinger: die Figur schiebt sich über die Kante.
        const p = Math.max(0, Math.min(1, (this.zeit - (f.t - PROBE_RISE)) / PROBE_RISE));
        const ueber = 1 + 0.35 * Math.sin(Math.PI * Math.min(1, p));
        const sicht = Math.min(1, ueber * p);
        y = boden - bh * sicht + 2;
        alpha = Math.max(0.25, Math.min(1, p * 1.6));
      } else if (f.status === 'treffer') {
        blitz = 1;                          // kurzer Trefferblitz der Silhouette
      } else if (f.status === 'verpasst') {
        alpha = 0.55;
      }
      if (f.gleichzeitig) {
        // Doppel-Lärm: die zweite Figur steht dicht daneben.
        const paket2 = this.sprite(f.figuren[1] || f.figur);
        if (paket2) {
          ctx.globalAlpha = alpha * 0.95;
          ctx.drawImage(paket2.canvas, Math.round(x + bw * 0.75), Math.round(y + 2),
            paket2.w * mass, paket2.h * mass);
          ctx.globalAlpha = 1;
        }
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(blitz > 0 ? paket.solid : paket.canvas, x, Math.round(y), bw, bh);
      ctx.globalAlpha = 1;
      // Treffer/Patzer: kurzer Ring an der Figur.
      if (f.status === 'treffer') this.ring(ctx, f.x, y + bh / 2, 10, '#5de0cf');
      if (f.status === 'verpasst') this.ring(ctx, f.x, y + bh / 2, 12, '#b0392f');
      // Ohropax ploppt in die Ohren.
      for (const o of this.ohren) {
        if (o.spalte !== f.spalte) continue;
        const t = (this.zeit - o.t) / 0.5;
        const paketOhr = this.sprite('ohropax');
        if (paketOhr) {
          const seite = t < 0.25 ? -1 : 1;
          ctx.drawImage(paketOhr.canvas, Math.round(f.x + seite * (6 + t * 6) - 4),
            Math.round(y + 6 + t * 6), 8, 6);
        }
      }
      // Verpasste Geste des Dirigenten: er klopft an die Uhr.
      if (this.uhr > 0 && f.figur === 'dirigent' && f.status === 'verpasst') {
        const tick = Math.sin(this.zeit * 30) > 0 ? 1 : 0;
        ctx.fillStyle = '#e8c46a';
        ctx.fillRect(Math.round(f.x + 10), Math.round(y - 6 + tick), 5, 5);
        ctx.fillStyle = '#0b0810';
        ctx.fillRect(Math.round(f.x + 12), Math.round(y - 5 + tick), 1, 2);
      }
    }

    // -------------------------------------------------- Notenflug aufs Blatt --
    for (const n of this.noten) {
      const t = Math.min(1, (this.zeit - n.t) / 0.5);
      const spx = Math.round((n.spalte + 0.5) * sp);
      const zx = Math.round(w / 2 - 14), zy = Math.round(h - 26);
      const x = Math.round(spx + (zx - spx) * t);
      const y = Math.round(boden - 6 + (zy - (boden - 6)) * t - Math.sin(Math.PI * t) * 12);
      ctx.fillStyle = '#e9e5d8';
      ctx.fillRect(x - 2, y, 4, 3);
      ctx.fillRect(x + 2, y - 5, 1, 6);
    }

    // --------------------------------------------------- Becken-Crash-Ringe --
    for (const b of this.becken) {
      const t = Math.min(1, (this.zeit - b.t) / 0.45);
      this.ring(ctx, Math.round((b.spalte + 0.5) * sp), boden - 10, 8 + t * 26, '#e8c46a', 1 - t);
    }

    // ------------------------------------------------------------ Notenpult --
    const px = Math.round(w / 2 - 20), py = h - 40, pw = 40, ph = 26;
    ctx.fillStyle = '#20202a';
    ctx.fillRect(px + pw / 2 - 1, py + ph, 3, 14);              // Ständer
    ctx.fillRect(px + pw / 2 - 8, h - 14, 17, 3);               // Fuß
    ctx.fillStyle = '#2b2436';
    ctx.fillRect(px, py, pw, ph);                               // Pult
    ctx.fillStyle = '#3a3350';
    ctx.fillRect(px + 2, py + 2, pw - 4, ph - 4);
    // Das Blatt: eins für jede gelungene Geste (höchstens sechs Striche).
    ctx.fillStyle = '#f0eee4';
    ctx.fillRect(px + 5, py + 4, pw - 10, ph - 10);
    ctx.fillStyle = '#20202a';
    for (let i = 0; i < Math.min(5, this.treffer); i++) {
      ctx.fillRect(px + 8, py + 7 + i * 3, pw - 18, 1);
    }
    // Die Pult-Lampe: sichtbarer Taktgeber, pulsiert auf jedem Schlag.
    const puls = Math.max(0, Math.min(1, this.pultPuls));
    ctx.fillStyle = `rgba(232,196,106,${0.25 + 0.75 * puls})`;
    ctx.fillRect(px + pw / 2 - 6, py - 9, 12, 3);
    ctx.fillStyle = `rgba(240,238,228,${0.10 + 0.5 * puls})`;
    ctx.fillRect(px + pw / 2 - 3, py - 7, 6, 2);
    if (puls > 0.05) {
      ctx.fillStyle = `rgba(232,196,106,${0.10 * puls})`;
      ctx.fillRect(px - 10, py - 14, pw + 20, 6 + 10 * puls);
    }
    // Schlussakkord: ein heller Blitz über der ganzen Bühne.
    if (this.zeit >= this.plan.schlussakkord && this.zeit < this.plan.schlussakkord + 0.6) {
      const t = (this.zeit - this.plan.schlussakkord) / 0.6;
      ctx.fillStyle = `rgba(240,238,228,${0.35 * (1 - t)})`;
      ctx.fillRect(-8, -8, w + 16, h + 16);
    }
    ctx.restore();
  }

  /** Sprite-Paket einer Figur (gecacht über render.js). */
  sprite(name) {
    if (!SPRITES[name] && name !== 'ohropax') return null;
    return spriteCanvas(name, SPRITES[name]);
  }

  /** Kurzer Ring (Treffer, Patzer, Becken-Crash). */
  ring(ctx, x, y, r, farbe, alpha = 0.9) {
    ctx.strokeStyle = farbe;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /**
   * Die Texte der Station als logische Canvas-Rechtecke (derselbe Vertrag wie
   * Grill und Fahrten): Titel, Zählerzeile und die Bedienzeile. Die Abbildung
   * ins Fenster macht allein main.js.
   */
  beschriftungen() {
    const schrift = this.vw < 320 ? 7 : 8;
    const panel = 'rgba(16,12,26,.88)';
    const breit = this.vw < 320 ? 150 : 210;
    const zeile = `TREFFER ${this.treffer} · PATZER ${this.patzer}`;
    return [
      { id: 'pr-titel', text: 'DIE LETZTE PROBE', x: 10, y: 8, w: breit, h: 11,
        fontSize: schrift, align: 'left', color: '#e8c46a', bg: panel, unterHud: true },
      { id: 'pr-zaehler', text: `${zeile} · ${this.hud.satz}`, x: 10, y: 20, w: breit + 40, h: 10,
        fontSize: schrift - 1, align: 'left', color: '#e9e5d8', bg: panel, unterHud: true },
      { id: 'pr-bedienung', text: PROBE_TEXTE.bedienung, x: 10, y: 32, w: Math.min(this.vw - 20, 300), h: 10,
        fontSize: schrift - 1, align: 'left', color: '#9cdbd3', bg: panel, unterHud: true },
    ];
  }
}
