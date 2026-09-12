// music.js — Musik-Engine und Motive je Station.
//
// Nur selbst eingespielte Kurz-Motive, im WebAudio-Synth gespielt: keine
// Aufnahmen, keine Notendateien Dritter. Die klassischen Motive sind eigene
// Skizzen im Geiste gemeinfreier Vorlagen (Verdi, Strauss II, Beethoven).
// Die Fahrten bekommen eigene Industrial-Stücke. Kein Bandname irgendwo.
//
// Aufbau: reine Motiv-/Tempo-Daten (in Node prüfbar) plus ein Scheduler, der
// Noten über AudioContext.currentTime vorauseinplant (Lookahead), nicht im
// Frame-Takt. Das Tempo kommt live aus dem Level (level.bpm) und den
// Taktwechseln — gelesen über einen getBpm-Callback, damit ein Wechsel
// mitten im Level sofort wirkt, ohne die Musik neu zu starten.
import { BPM_BASE } from './config.js';

/** Alle Stationen mit eigener Musik, in Spielreihenfolge. */
export const STATIONEN_MUSIK = [
  'akt1', 'akt2', 'cabrio', 'akt3', 'akt4', 'akt5', 'motorrad', 'epilog',
];

/**
 * Motive je Station. `lead`/`bass` sind Halbton-Offsets zum `grund` (MIDI),
 * ein Schritt = eine Sechzehntel; null = Pause. `taktart` und `drums`
 * unterscheiden den Charakter, `haerte` (0–10) die Fahrten untereinander.
 * `puls` benennt, was den Mechanik-Takt hörbar trägt.
 */
export const MOTIVE = {
  akt1: {
    id: 'akt1', titel: 'KATAKOMBEN — DUNKLE STIMMEN',
    charakter: 'dunkel, verhalten', vorlage: 'Nabucco-Chor-Stimmung',
    art: 'klassik', taktart: '4/4', grund: 50, haerte: 2, puls: 'verhaltenes Takt-Ticken',
    skizze: 'Fallende Moll-Linie über liegender Streicherfläche, spärlicher Bass.',
    lead: [0, null, -2, null, -4, null, -2, null, 0, null, -2, null, -4, null, -5, null],
    bass: [0, null, null, null, -4, null, null, null, -2, null, null, null, -5, null, null, null],
    drums: 'tick', leadWave: 'sine', ducker: 1.0,
  },
  akt2: {
    id: 'akt2', titel: 'PROBE — LEBHAFTER WALZER',
    charakter: 'lebhaft, federnd', vorlage: 'Fledermaus-Stimmung',
    art: 'klassik', taktart: '3/4', grund: 57, haerte: 4, puls: 'Walzer-Eins mit Takt-Tick',
    skizze: 'Springende Terzen im Dreiertakt, gezupfter Bass.',
    lead: [0, 4, 7, 4, 0, 4, 7, 12, 7, 4, 0, -2],
    bass: [0, null, null, -5, null, null, 5, null, null, -2, null, null],
    drums: 'tick', leadWave: 'triangle', ducker: 1.0,
  },
  cabrio: {
    id: 'cabrio', titel: 'CABRIO — OFFENE STRASSE',
    charakter: 'treibend, luftig', vorlage: 'eigenes Industrial-Stück',
    art: 'industrial', taktart: '4/4', grund: 40, haerte: 6, puls: 'Kick auf jedem Viertel plus Hat',
    skizze: 'Eigenes Quarten-Riff durch Verzerrung, treibende Kick mit Hat.',
    lead: [0, 0, 5, 0, 3, 0, 5, 7, 0, 0, 5, 0, 10, 7, 5, 3],
    bass: [0, 0, 0, 0, -2, -2, -2, -2, -4, -4, -4, -4, -2, -2, 0, 0],
    drums: 'kick-hat', leadWave: 'sawtooth', ducker: 1.0,
  },
  akt3: {
    id: 'akt3', titel: 'OPEN AIR — WEITE BÖGEN',
    charakter: 'weit, mit Luft', vorlage: 'Traviata-Stimmung',
    art: 'klassik', taktart: '4/4', grund: 62, haerte: 3, puls: 'weite Schläge mit Takt-Tick',
    skizze: 'Aufsteigende Dreiklangsbrechung in langen Noten, viel Luft zwischen den Bögen.',
    lead: [0, null, null, null, 4, null, null, null, 7, null, null, null, 12, null, 7, null],
    bass: [0, null, null, null, null, null, null, null, -5, null, null, null, null, null, null, null],
    drums: 'tick', leadWave: 'sine', ducker: 1.0,
  },
  akt4: {
    id: 'akt4', titel: 'GRABEN — TIEFES OSTINATO',
    charakter: 'tief, drängend', vorlage: 'Eroica-Marsch-Stimmung',
    art: 'klassik', taktart: '4/4', grund: 45, haerte: 5, puls: 'punktiertes Marsch-Ticken',
    skizze: 'Punktiertes Marsch-Ostinato in tiefer Lage, unruhig vorwärts.',
    lead: [0, 0, null, 0, null, -2, null, 0, 0, 0, null, -2, null, -4, null, null],
    bass: [0, null, 0, null, 0, null, -2, null, 0, null, 0, null, -5, null, -4, null],
    drums: 'tick-marsch', leadWave: 'triangle', ducker: 1.0,
  },
  akt5: {
    id: 'akt5', titel: 'BÜHNE — GROSSE FANFARE',
    charakter: 'gross, feierlich', vorlage: 'Festfanfare mit Walzer-Reprise',
    art: 'klassik', taktart: '4/4', grund: 60, haerte: 6, puls: 'Fanfaren-Schläge mit Takt-Tick',
    skizze: 'Stehende Fanfare, dann Walzer-Reprise des Proben-Motivs — der Auftritt.',
    lead: [0, 4, 7, 12, null, 12, 7, 4, 0, 4, 7, 4, 0, null, -2, null],
    bass: [0, null, null, null, 5, null, null, null, -5, null, null, null, 0, null, null, null],
    drums: 'tick-fanfare', leadWave: 'triangle', ducker: 1.0,
  },
  motorrad: {
    id: 'motorrad', titel: 'MOTORRAD — NACHTFAHRT, HÄRTER',
    charakter: 'hart, schnell', vorlage: 'eigenes Industrial-Stück',
    art: 'industrial', taktart: '4/4', grund: 38, haerte: 9, puls: 'Double-Kick mit scharfem Hat',
    skizze: 'Eigenes tieferes Riff, Double-Kick, schärfere Verzerrung als das Cabrio.',
    lead: [0, 0, 1, 0, 0, 3, 0, 1, 0, 0, 1, 0, 5, 3, 1, 0],
    bass: [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, -2, -2, -4, -4],
    drums: 'double-kick', leadWave: 'sawtooth', ducker: 1.0,
  },
  epilog: {
    id: 'epilog', titel: 'KLEINGARTEN — FAST STILLE',
    charakter: 'ruhig, warm', vorlage: 'eigenes Wiegenlied',
    art: 'ruhig', taktart: '4/4', grund: 60, haerte: 0, puls: 'weicher Atem-Tick, fast stumm',
    skizze: 'Pendelnde Zweiklänge über warmem Bass, fast verstummend — kein Schlagzeug.',
    lead: [0, null, null, null, null, null, -2, null, null, null, 0, null, null, null, null, null],
    bass: [0, null, null, null, null, null, null, null, -5, null, null, null, null, null, null, null],
    drums: 'hauch', leadWave: 'sine', ducker: 0.5,
  },
};

/** Motiv einer Station; unbekannte IDs fallen auf den Epilog zurück (stille). */
export function motifFuer(stationId) {
  return MOTIVE[stationId] || MOTIVE.epilog;
}

/**
 * Effektives Tempo eines Levels an einer Stelle.
 * `stelle`: {x} (Sidescroller, Pixel) oder {anteil} (Fahrten, 0–1); eine Zahl
 * gilt als x. `schwierigkeit` dämpft Wechsel wie die Simulation (gemütlich).
 */
export function effektivesTempo(level, stelle = {}, schwierigkeit = 'gemuetlich') {
  const basis = (level && level.bpm) || BPM_BASE;
  const takts = (level && level.takts) || [];
  if (!takts.length) return basis;
  const x = typeof stelle === 'number' ? stelle : stelle.x;
  const anteil = stelle && typeof stelle.anteil === 'number' ? stelle.anteil : undefined;
  let ziel = null;
  for (const t of takts) {
    if (typeof t.x === 'number' && typeof x === 'number') {
      if (x >= t.x) ziel = t.bpm;
    } else if (typeof t.at === 'number' && typeof anteil === 'number') {
      if (anteil >= t.at) ziel = t.bpm;
    }
  }
  if (ziel === null || ziel === undefined) return basis;
  if (schwierigkeit === 'gemuetlich') return Math.round(BPM_BASE + (ziel - BPM_BASE) * 0.6);
  return ziel;
}

/** Kurztext je Station für die Hörprobe im Bericht. */
export function beschreibeMotiv(stationId) {
  const m = motifFuer(stationId);
  return `${m.titel}: ${m.charakter} (${m.taktart}, ${m.puls}). ${m.skizze}`;
}

// ============================================================================
// FORM UND REGIE — aus dem Snippet wird Musik
//
// Jede Station hat eine 16-taktige Form in vier Teilen (A – A' – B – A). Die
// Akkordfolge steht als eigene Tabelle (ein Halbton-Offset je Takt zum
// Grundton), die Melodie entsteht daraus: das Motiv-Zellenmaterial wird in die
// jeweilige Akkordlage gesetzt und je Teil verschoben (A' = Variante, B =
// Kontrastlage, Schluss-A = Reprise). Zwei aufeinanderfolgende Takte sind nie
// gleich: die Akkordfolge wechselt in jedem Takt, dazu kommen Verzierungen und
// gelegentliche Füllfiguren auf Nebenzeit — der Puls bleibt davon frei.
// ============================================================================

/** Akkordfolge je Station: 16 Takte, Halbton-Offsets zum Grundton. */
export const AKKORDE = {
  akt1: [0, -4, -2, -5, 0, -4, -2, -5, 3, -2, 0, -5, -2, -4, 3, -5],
  akt2: [0, -4, 5, -2, 0, 5, -4, -2, 7, 5, 3, -2, -4, 0, 5, -2],
  cabrio: [0, -2, 0, 5, -2, -4, 0, 3, 5, 3, 0, -2, -4, -2, 0, 5],
  akt3: [0, 5, -2, 3, 7, 5, -4, -2, 3, 5, 7, -4, 0, 5, -4, -2],
  akt4: [0, -5, 0, -2, -4, -5, -4, 0, 3, 0, -2, -5, 0, -4, -2, -5],
  akt5: [0, 7, 0, 12, 7, 5, 3, -5, 0, 7, 5, 3, -2, -5, -2, 7],
  motorrad: [0, -2, 0, -4, -2, 0, -5, -4, 0, -2, 5, 3, -2, -4, 0, -5],
  epilog: [0, -2, 0, -4, -5, 0, -2, -4, 0, -2, -5, -4, -2, 0, -4, -5],
};

/** Takte je Form — die kürzeste Station trägt 16 Takte, nicht zwei. */
export const FORMTAKTE = 16;

/** Formteile: A – A' – B – A. `versatz` verschiebt die Motivzelle, `oktav` die Lage. */
export const FORMTEILE = [
  { name: 'A', von: 0, takte: 4, versatz: 0, oktav: 0, figur: null, lage: 'grund' },
  { name: "A'", von: 4, takte: 4, versatz: 4, oktav: 0, figur: 'lauf', lage: 'grund' },
  { name: 'B', von: 8, takte: 4, versatz: 2, oktav: 12, figur: 'halt', lage: 'kontrast' },
  { name: 'A', von: 12, takte: 4, versatz: 8, oktav: 0, figur: 'schluss', lage: 'reprise' },
];

/** Feinschliff je Station: eigene Lage und Verschiebung des B-Teils. */
export const FORMVARIANTEN = {
  akt1: { oktavB: 12, versatzB: 2 },
  akt2: { oktavB: 12, versatzB: 3 },
  cabrio: { oktavB: 0, versatzB: 0 },
  akt3: { oktavB: 12, versatzB: 8 },
  akt4: { oktavB: 12, versatzB: 2 },
  akt5: { oktavB: 12, versatzB: 4 },
  motorrad: { oktavB: -12, versatzB: 0 },
  epilog: { oktavB: 12, versatzB: 6 },
};

/** Schritte je Takt (Sechzehntel): 4/4 sechzehn, 3/4 zwölf. */
export function schritteProTakt(m) { return m.taktart === '3/4' ? 12 : 16; }

/** Die fertige 16-taktige Form einer Station (Grundform plus Feinschliff). */
export function formFuer(stationId) {
  const m = motifFuer(stationId);
  const v = FORMVARIANTEN[m.id] || {};
  const teile = FORMTEILE.map((t) => {
    const b = t.von === 8;
    return {
      ...t,
      versatz: b ? (v.versatzB !== undefined ? v.versatzB : t.versatz) : t.versatz,
      oktav: b ? (v.oktavB !== undefined ? v.oktavB : t.oktav) : t.oktav,
    };
  });
  const b = teile.find((t) => t.name === 'B');
  return {
    id: m.id, takte: FORMTAKTE, teile,
    bTeil: { von: b.von, takte: b.takte, oktav: b.oktav },
  };
}

/** Kopfdaten einer Station für Tests und Bericht (Motivtabelle). */
export function formInfo(stationId) {
  const m = motifFuer(stationId);
  const f = formFuer(stationId);
  const akk = AKKORDE[m.id] || AKKORDE.epilog;
  return {
    id: m.id, titel: m.titel, charakter: m.charakter, taktart: m.taktart, haerte: m.haerte,
    takte: f.takte, bTakt: f.bTeil.von + 1, bOktav: f.bTeil.oktav,
    form: f.teile.map((t) => `${t.name}/${t.takte}`).join(' — '),
    teile: f.teile.map((t) => ({ name: t.name, von: t.von + 1, takte: t.takte })),
    akkorde: akk.slice(),
  };
}

/**
 * Ein Takt der Form als reine Daten (ohne Audio): je Sechzehntel die Stimmen.
 * Prüfbar in Node und im Browser — der Spieler plant dieselben Ereignisse ein.
 */
export function taktplanFuer(stationId, taktIndex) {
  const m = motifFuer(stationId);
  const f = formFuer(stationId);
  const akk = AKKORDE[m.id] || AKKORDE.epilog;
  const b = ((Math.floor(taktIndex) % f.takte) + f.takte) % f.takte;
  const teil = f.teile.find((t) => b >= t.von && b < t.von + t.takte) || f.teile[0];
  const akkord = akk[b];
  const spt = schritteProTakt(m);
  const nLead = m.lead.length, nBass = m.bass.length;
  const halt = teil.figur === 'halt';
  const schritte = [];
  for (let i = 0; i < spt; i++) {
    const rohLead = m.lead[(i + teil.versatz) % nLead];
    const rohBass = m.bass[(i + teil.versatz) % nBass];
    const leer = rohLead === null || rohLead === undefined;
    // Der B-Teil atmet: auf den Nebenachteln bleibt die Melodie stehen.
    const lead = (leer || (halt && i % 2 === 1)) ? null
      : m.grund + 12 + teil.oktav + akkord + rohLead;
    const bass = (rohBass === null || rohBass === undefined) ? null
      : m.grund - 12 + akkord + rohBass;
    schritte.push({
      lead,
      bass,
      gegen: lead === null ? null : lead + (teil.lage === 'kontrast' ? -12 : 12),
      flaeche: i === 0 && m.art !== 'industrial' ? m.grund - 12 + akkord : null,
      fuell: null,
      // Der Puls der Mechanik liegt auf jedem Viertel — in der Form verankert,
      // damit „im Takt treffen“ auch bei voller Fülle hörbar bleibt.
      puls: i % 4 === 0,
    });
  }
  // Füllfiguren: nur gelegentlich und immer auf einer Nebenzeit (nie auf dem Puls).
  if (teil.figur === 'lauf' && b % 4 === 3) {
    schritte[spt - 2].fuell = m.grund + 12 + teil.oktav + akkord + 7;
    schritte[spt - 1].fuell = m.grund + 12 + teil.oktav + akkord + 12;
  } else if (teil.figur === 'schluss' && b % 2 === 0) {
    schritte[spt - 1].fuell = m.grund + 12 + akkord + 2; // Vorhalt in den nächsten Durchlauf
  } else if (teil.figur === 'halt' && b % 2 === 1) {
    schritte[2].fuell = m.grund + 12 + teil.oktav + akkord + 12; // Ruf in der Kontrastlage
  }
  return { takt: b, teil: teil.name, lage: teil.lage, akkord, taktart: m.taktart, schritte };
}

/** Fünf Abschnitte je Fahrt — die Musik schaltet Abschnitt für Abschnitt zu. */
export const ABSCHNITTE = 5;

/** Abschnitt (0–4) aus dem Streckenfortschritt (0–1). */
export function abschnittAusStrecke(strecke) {
  const s = typeof strecke === 'number' && Number.isFinite(strecke) ? strecke : 0;
  const k = Math.max(0, Math.min(0.999999, s));
  return Math.min(ABSCHNITTE - 1, Math.floor(k * ABSCHNITTE));
}

/**
 * Regie je Abschnitt: jeder neue Abschnitt bringt eine hörbare Schicht dazu —
 * erst trägt der Puls mit Bass und Fläche, dann kommt die Melodie, dann eine
 * Gegenstimme, dann Füllfiguren und die höhere Oktavlage, zuletzt die Breite.
 * Beim Wechsel in einen neuen Abschnitt geht die Musik in den B-Teil über.
 */
export function regie(abschnitt) {
  const a = Math.max(0, Math.min(ABSCHNITTE - 1, Math.floor(Number(abschnitt) || 0)));
  return {
    abschnitt: a,
    lead: a >= 1,
    gegen: a >= 2,
    fuell: a >= 3,
    breit: a >= 4,
    oktavLead: a >= 3 ? 12 : 0,
    sprung: a >= 1 ? 'B' : null,
    // Der Puls wird von keiner Regie abgeschaltet: „im Takt treffen“ gilt weiter.
    puls: true,
  };
}

/** Kurztext der Form je Station (für Bericht und Prüfungen). */
export function beschreibeForm(stationId) {
  const i = formInfo(stationId);
  return `${i.titel}: ${i.takte} Takte (${i.form}), ${i.taktart}, B-Teil ab Takt ${i.bTakt}`;
}

const midiZuFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function verzerrungsKurve(ctx, betrag) {
  const n = 256, kurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    kurve[i] = Math.tanh(betrag * x);
  }
  const shaper = ctx.createWaveShaper();
  shaper.curve = kurve;
  return shaper;
}

/**
 * Musik-Spieler. `audio` liefert Kontext und Musik-Bus (siehe audio.js);
 * ohne AudioContext läuft er still, behält aber Zustand (für Tests).
 */
export function createMusik({ audio = null } = {}) {
  let stationId = null;
  let motiv = null;
  let getBpm = null;
  let getAbschnitt = null;
  let spielt = false;
  let pausiert = false;
  let geduckt = false;
  let stumm = false;
  let laut = 0.8;
  let schritt = 0;
  let naechsteZeit = 0;
  let timer = null;
  let bus = null;
  let pegel = null;
  let shaper = null;
  // Form-Zustand: laufender Takt, Regie des Abschnitts und ein wartender
  // Übergang in den B-Teil. Die Taktpläne werden einmal je Station gebaut
  // (16 Takte) und danach nur noch gelesen — der Frame-Takt bleibt billig.
  let takt = 0;
  let abschnitt = 0;
  let reg = regie(0);
  let sprung = false;
  let zielTakt = null;
  let plaene = new Map();
  // Lebende Noten als {n: Node, g: Hüllkurve, weitere: []}: so lassen sie sich
  // beim Stationswechsel weich ausblenden und wirklich freigeben, statt als
  // hängende Nodes auf eine lange Fläche zu warten.
  const knoten = new Set();
  // True, sobald je ein Kontext bestand: vorher keine Rampen anfassen, damit
  // allein das Laden (Stummschaltung aus dem Spielstand) keinen
  // AudioContext vor der ersten Nutzeraktion erzeugt.
  let bereit = false;

  function kontext() {
    let ctx = null;
    if (audio && typeof audio.musikKontext === 'function') {
      try { ctx = audio.musikKontext(); } catch { ctx = null; }
    } else {
      const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      try {
        if (!kontext.eigen) kontext.eigen = new AC();
        ctx = kontext.eigen;
      } catch { return null; }
    }
    if (ctx) bereit = true;
    return ctx;
  }

  /** Kontext nur, wenn schon einer besteht — erzeugt nie einen. */
  function vorhandenerKontext() { return bereit ? kontext() : null; }

  function musikBus(ctx) {
    if (audio && typeof audio.musikBus === 'function') {
      try { return audio.musikBus(); } catch { return null; }
    }
    if (!ctx) return null;
    if (!bus) {
      bus = ctx.createGain();
      bus.gain.value = 0.5;
      bus.connect(ctx.destination);
    }
    return bus;
  }

  // Eigener Pegel-Knoten unter dem Musik-Bus: Ducken/Pause/Stumm/Lautstärke
  // der Engine multiplizieren sich mit dem Bus, statt ihn zu überschreiben.
  function pegelKnoten(ctx) {
    const parent = musikBus(ctx);
    if (!parent) return null;
    if (!pegel) {
      pegel = ctx.createGain();
      pegel.gain.value = zielPegel();
      pegel.connect(parent);
    }
    return pegel;
  }

  function zielPegel() {
    if (stumm || pausiert) return 0.0001;
    return Math.max(0.0001, laut * (geduckt ? 0.25 : 1) * 0.5);
  }

  function pegelAnfahren(ctx, zielBus, zeit = 0.1) {
    try {
      const t = ctx.currentTime;
      zielBus.gain.cancelScheduledValues(t);
      zielBus.gain.setValueAtTime(Math.max(0.0001, zielBus.gain.value), t);
      zielBus.gain.exponentialRampToValueAtTime(Math.max(0.0001, zielPegel()), t + zeit);
    } catch { /* still weiter */ }
  }

  /**
   * Alle klingenden Noten weich freigeben (Ausblenden statt Abschneiden).
   * `knoten` ist danach leer — es bleiben keine Nodes stehen.
   */
  function knotenAusblenden(ctx, dauer = 0.05) {
    const t0 = ctx ? ctx.currentTime : 0;
    for (const e of knoten) {
      try {
        e.g.gain.cancelScheduledValues(t0);
        e.g.gain.setValueAtTime(Math.max(0.0001, e.g.gain.value), t0);
        e.g.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer);
      } catch { /* egal */ }
      try { if (e.n.stop) e.n.stop(t0 + dauer + 0.02); } catch { /* schon aus */ }
    }
    knoten.clear();
  }

  /** Eine Note anmelden: gibt den Eintrag zurück, damit das Ende ihn abräumt. */
  function merken(n, g, weitere = []) {
    const e = { n, g, weitere };
    knoten.add(e);
    n.onended = () => {
      knoten.delete(e);
      try { g.disconnect(); } catch { /* egal */ }
      for (const w of weitere) { try { w.disconnect(); } catch { /* egal */ } }
    };
    return e;
  }

  function ton(ctx, ziel, { midi, zeit, dauer, typ = 'sine', pegel = 0.2, industrial = false }) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    let filter = null;
    osc.type = typ;
    osc.frequency.setValueAtTime(midiZuFreq(midi), zeit);
    g.gain.setValueAtTime(0.0001, zeit);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, pegel), zeit + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, zeit + dauer);
    if (industrial) {
      if (!shaper) {
        shaper = verzerrungsKurve(ctx, motiv && motiv.id === 'motorrad' ? 5 : 3.2);
        shaper.connect(ziel);
      }
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 2400;
      osc.connect(g); g.connect(filter); filter.connect(shaper);
    } else {
      osc.connect(g); g.connect(ziel);
    }
    try { osc.start(zeit); osc.stop(zeit + dauer + 0.03); } catch { /* egal */ }
    merken(osc, g, filter ? [filter] : []);
  }

  function flaeche(ctx, ziel, zeit, dauer, grundMidi) {
    for (const verstimmung of [-4, 3]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.value = midiZuFreq(grundMidi);
      osc.detune.value = verstimmung * 10;
      filter.type = 'lowpass'; filter.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, zeit);
      g.gain.exponentialRampToValueAtTime(0.05, zeit + Math.min(0.4, dauer / 2));
      g.gain.exponentialRampToValueAtTime(0.0001, zeit + dauer);
      osc.connect(filter); filter.connect(g); g.connect(ziel);
      try { osc.start(zeit); osc.stop(zeit + dauer + 0.03); } catch { /* egal */ }
      merken(osc, g, [filter]);
    }
  }

  function schlag(ctx, ziel, zeit, art) {
    if (art === 'hauch') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 660;
      g.gain.setValueAtTime(0.0001, zeit);
      g.gain.exponentialRampToValueAtTime(0.04, zeit + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.09);
      osc.connect(g); g.connect(ziel);
      try { osc.start(zeit); osc.stop(zeit + 0.12); } catch { /* egal */ }
      merken(osc, g);
      return;
    }
    if (art === 'tick' || art === 'tick-marsch' || art === 'tick-fanfare') {
      const stark = art === 'tick-fanfare';
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square'; osc.frequency.value = art === 'tick-marsch' ? 620 : 880;
      const p = stark ? 0.10 : 0.06;
      g.gain.setValueAtTime(0.0001, zeit);
      g.gain.exponentialRampToValueAtTime(p, zeit + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.05);
      osc.connect(g); g.connect(ziel);
      try { osc.start(zeit); osc.stop(zeit + 0.08); } catch { /* egal */ }
      merken(osc, g);
      return;
    }
    // Industrial-Drums: Kick (Sinus-Drop) und Hat (Rauschen).
    const kick = (t, lautStark = 0.5) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
      g.gain.setValueAtTime(lautStark, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(g); g.connect(ziel);
      try { osc.start(t); osc.stop(t + 0.17); } catch { /* egal */ }
      merken(osc, g);
    };
    const hat = (t, offen = false) => {
      const len = Math.floor(ctx.sampleRate * (offen ? 0.06 : 0.03));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
      const g = ctx.createGain(); g.gain.value = 0.12;
      src.connect(f); f.connect(g); g.connect(ziel);
      try { src.start(t); } catch { /* egal */ }
      merken(src, g, [f]);
    };
    if (art === 'kick-hat') { kick(zeit); hat(zeit + 0.0); }
    else if (art === 'double-kick') { kick(zeit, 0.55); kick(zeit + 0.09, 0.4); hat(zeit, true); }
  }

  /** Taktplan der Form — je Station einmal gebaut, danach nur gelesen. */
  function taktplan(taktIndex) {
    const key = ((Math.floor(taktIndex) % FORMTAKTE) + FORMTAKTE) % FORMTAKTE;
    let p = plaene.get(key);
    if (!p) { p = taktplanFuer(stationId, key); plaene.set(key, p); }
    return p;
  }

  function schrittEinplanen(ctx, ziel, sechezehntel, zeit, sechzehntelDauer, bpm) {
    const m = motiv;
    const industrial = m.art === 'industrial';
    const spt = schritteProTakt(m);
    const imTakt = sechezehntel % spt;
    // Taktgrenze: weiterzählen und einen wartenden Übergang in den B-Teil
    // vollziehen — der Abschnittswechsel ist so hörbar, nicht nur zu spüren.
    if (imTakt === 0) {
      if (sechezehntel > 0) takt += 1;
      if (sprung) { takt = zielTakt === null ? takt : zielTakt; sprung = false; zielTakt = null; }
    }
    const s = taktplan(takt).schritte[imTakt];
    // Streicherfläche zu Taktbeginn (nur klassisch/ruhig) — wie in M1.
    if (s.flaeche !== null && s.flaeche !== undefined) {
      flaeche(ctx, ziel, zeit, (60 / bpm) * (m.taktart === '3/4' ? 3 : 4), s.flaeche);
      if (reg.breit) flaeche(ctx, ziel, zeit, (60 / bpm) * (m.taktart === '3/4' ? 3 : 4), s.flaeche + 12);
    }
    // Bass auf den Vierteln.
    if (imTakt % 4 === 0 && s.bass !== null && s.bass !== undefined) {
      ton(ctx, ziel, { midi: s.bass, zeit, dauer: sechzehntelDauer * 3.2, typ: 'triangle', pegel: 0.22, industrial: false });
    }
    // Lead (Charakter-Lautheit je Motiv: der Garten bleibt fast stumm).
    if (reg.lead && s.lead !== null && s.lead !== undefined) {
      ton(ctx, ziel, {
        midi: s.lead + reg.oktavLead, zeit, dauer: sechzehntelDauer * 2.2,
        typ: industrial ? 'sawtooth' : m.leadWave,
        pegel: (industrial ? 0.30 : 0.16) * (m.ducker || 1),
        industrial,
      });
    }
    // Gegenstimme: dieselbe Linie in der Nachbaroktave, leiser — die zweite Schicht.
    if (reg.gegen && s.gegen !== null && s.gegen !== undefined) {
      ton(ctx, ziel, {
        midi: s.gegen + reg.oktavLead, zeit, dauer: sechzehntelDauer * 3,
        typ: industrial ? 'sawtooth' : m.leadWave,
        pegel: (industrial ? 0.14 : 0.09) * (m.ducker || 1),
        industrial,
      });
    }
    // Füllfigur: kurz, auf Nebenzeit, immer unter dem Puls.
    if (reg.fuell && s.fuell !== null && s.fuell !== undefined) {
      ton(ctx, ziel, {
        midi: s.fuell + reg.oktavLead, zeit, dauer: sechzehntelDauer * 1.2,
        typ: industrial ? 'sawtooth' : m.leadWave,
        pegel: (industrial ? 0.16 : 0.10) * (m.ducker || 1),
        industrial,
      });
    }
    // Puls der Mechanik: auf jedem Viertel hörbar, nie übertönt.
    if (s.puls) schlag(ctx, ziel, zeit, m.drums);
    else if (m.drums === 'double-kick' && imTakt % 4 === 2) schlag(ctx, ziel, zeit, 'kick-hat');
  }

  /** Abschnitt aus der Strecke; ohne Angabe trägt die mittlere Regie das volle Motiv. */
  function regieGrundwert() {
    const roh = typeof getAbschnitt === 'function' ? getAbschnitt() : null;
    return (roh === null || roh === undefined) ? 2 : abschnittAusStrecke(roh);
  }

  /** Abschnittswechsel aus der Strecke: neue Schicht und Übergang in den B-Teil. */
  function regieNachfuehren() {
    const neu = regieGrundwert();
    if (neu === abschnitt) return;
    abschnitt = neu;
    reg = regie(abschnitt);
    // Beim Wechsel in einen neuen Abschnitt geht es hörbar in den B-Teil.
    if (reg.sprung) { sprung = true; zielTakt = formFuer(stationId).bTeil.von; }
  }

  function planen() {
    const ctx = kontext();
    if (!ctx || !spielt || pausiert || !motiv) return;
    const ziel = pegelKnoten(ctx);
    if (!ziel) return;
    regieNachfuehren();
    const bpm = Math.max(40, Math.min(220, (typeof getBpm === 'function' ? getBpm() : null) || 100));
    const sechzehntelDauer = 60 / bpm / 4;
    let guard = 0;
    while (naechsteZeit < ctx.currentTime + 0.15 && guard++ < 16) {
      schrittEinplanen(ctx, ziel, schritt, Math.max(naechsteZeit, ctx.currentTime + 0.01), sechzehntelDauer, bpm);
      naechsteZeit += sechzehntelDauer;
      schritt += 1;
    }
  }

  function timerStart() {
    if (timer) return;
    const ctx = kontext();
    if (!ctx) return; // stiller Betrieb (Tests): Zustand läuft, kein Timer
    naechsteZeit = Math.max(naechsteZeit, ctx.currentTime + 0.06);
    timer = setInterval(planen, 25);
  }

  function timerStop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  return {
    /** Reine Motivdaten — für Tests und Bericht. */
    motive: MOTIVE,
    motifFuer,
    effektivesTempo,
    beschreibeMotiv,
    // Form und Regie sind reine Daten: Tests prüfen dieselben Funktionen,
    // die der Scheduler benutzt.
    formFuer,
    formInfo,
    taktplanFuer,
    regie,
    abschnittAusStrecke,
    beschreibeForm,
    FORMTEILEN: FORMTEILE,
    FORMTAKTE,

    aktuellesMotiv() { return stationId; },
    laeuft() { return spielt && !pausiert; },
    istStumm() { return stumm; },
    lautstaerke() { return laut; },
    istGeduckt() { return geduckt; },
    istPausiert() { return pausiert; },
    /** Aktueller Abschnitt (0–4) und seine Regie — für Bericht und Prüfungen. */
    abschnitt() { return { ...reg }; },
    aktuellerTakt() { return takt; },
    effektiveLautstaerke() {
      if (stumm || pausiert || !spielt) return 0;
      return Math.max(0, Math.min(1, laut * (geduckt ? 0.25 : 1)));
    },

    /**
     * Musik einer Station starten. Gleiche Station bei laufender Musik ist
     * kein Neustart (nur die Callbacks werden frisch verdrahtet).
     */
    playStation(id, { getBpm: bpmFn = null, getAbschnitt: abschnittFn = null } = {}) {
      const neu = MOTIVE[id] ? id : 'epilog';
      if (typeof bpmFn === 'function') getBpm = bpmFn;
      if (typeof abschnittFn === 'function') getAbschnitt = abschnittFn;
      if (spielt && stationId === neu && !pausiert) {
        motiv = MOTIVE[neu];
        return stationId;
      }
      const wechsel = spielt && !!stationId && stationId !== neu;
      const ctx = kontext();
      // Stationswechsel: alte Noten weich ausblenden, statt sie in die neue
      // Station hineinklingen zu lassen (oder als Nodes hängen zu lassen).
      if (ctx && wechsel) knotenAusblenden(ctx, 0.06);
      stationId = neu;
      motiv = MOTIVE[neu];
      schritt = 0;
      // Form von vorn: Takt 1 des A-Teils, die Regie stellt `planen` nach.
      takt = 0;
      sprung = false;
      zielTakt = null;
      plaene.clear();
      abschnitt = regieGrundwert();
      reg = regie(abschnitt);
      spielt = true;
      pausiert = false;
      if (ctx) {
        const ziel = pegelKnoten(ctx);
        if (ziel) pegelAnfahren(ctx, ziel, 0.15);
        naechsteZeit = ctx.currentTime + 0.08;
        timerStart();
        planen();
      }
      return stationId;
    },

    /** Weicher Übergang ohne Krachen; Knoten werden wirklich aufgeräumt. */
    stop({ fade = 0.08 } = {}) {
      // Nur ein schon bestehender Kontext darf angefasst werden — `stop` soll
      // nie einen AudioContext erzeugen (kein Ton vor der ersten Nutzeraktion).
      const ctx = vorhandenerKontext();
      timerStop();
      if (ctx) {
        const ziel = pegelKnoten(ctx);
        if (ziel) {
          try {
            const t = ctx.currentTime;
            ziel.gain.cancelScheduledValues(t);
            ziel.gain.setValueAtTime(Math.max(0.0001, ziel.gain.value), t);
            ziel.gain.exponentialRampToValueAtTime(0.0001, t + fade);
          } catch { /* still weiter */ }
        }
        knotenAusblenden(ctx, fade);
      } else {
        knoten.clear();
      }
      // Der Pegel-Knoten bleibt am Bus hängen und wird beim nächsten Start
      // wiederverwendet: ein einzelner Knoten, kein Wachstum pro Station.
      spielt = false;
      pausiert = false;
      geduckt = false;
      stationId = null;
      motiv = null;
      // Form-Zustand mit aufräumen: kein wartender Übergang, kein Plan-Rest.
      takt = 0;
      sprung = false;
      zielTakt = null;
      plaene.clear();
      abschnitt = 0;
      reg = regie(0);
      getAbschnitt = null;
    },

    setPaused(p) {
      pausiert = !!p;
      const ctx = vorhandenerKontext();
      if (!spielt) return;
      if (ctx) {
        const ziel = pegelKnoten(ctx);
        if (ziel) pegelAnfahren(ctx, ziel, 0.12);
        if (pausiert) timerStop();
        else { naechsteZeit = ctx.currentTime + 0.08; timerStart(); }
      } else if (!pausiert) timerStop();
    },

    /** Leiser hinter Dialogtexten (beide Werte sind in Ordnung, Hauptsache nicht laut). */
    setDucked(d) {
      geduckt = !!d;
      const ctx = vorhandenerKontext();
      if (ctx && spielt) {
        const ziel = pegelKnoten(ctx);
        if (ziel) pegelAnfahren(ctx, ziel, 0.2);
      }
    },

    setMuted(m) { stumm = !!m; const ctx = vorhandenerKontext(); if (ctx && spielt) { const z = pegelKnoten(ctx); if (z) pegelAnfahren(ctx, z, 0.08); } },
    setVolume(v) {
      laut = clamp01(Number(v));
      if (!Number.isFinite(laut)) laut = 0.8;
      const ctx = vorhandenerKontext();
      if (ctx && spielt) { const z = pegelKnoten(ctx); if (z) pegelAnfahren(ctx, z, 0.08); }
    },

    /** Für die Browserprüfung: Zustand des Teilkontexts (erzeugt keinen). */
    kontextZustand() {
      const ctx = vorhandenerKontext();
      return ctx ? ctx.state : 'kein-kontext';
    },

    /** Zahl der klingenden Nodes — muss klein bleiben (keine hängenden Nodes). */
    offeneKnoten() { return knoten.size; },
  };
}
