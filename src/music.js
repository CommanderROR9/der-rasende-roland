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
  const knoten = new Set();

  function kontext() {
    if (audio && typeof audio.musikKontext === 'function') {
      try { return audio.musikKontext(); } catch { return null; }
    }
    const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try {
      if (!kontext.eigen) kontext.eigen = new AC();
      return kontext.eigen;
    } catch { return null; }
  }

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

  function aufraeumen(ctx) {
    for (const n of knoten) {
      try { n.stop && n.stop(); } catch { /* schon aus */ }
      try { n.disconnect && n.disconnect(); } catch { /* schon weg */ }
    }
    knoten.clear();
    if (shaper) { try { shaper.disconnect(); } catch { /* egal */ } shaper = null; }
    if (pegel) { try { pegel.disconnect(); } catch { /* egal */ } pegel = null; }
    void ctx;
  }

  function ton(ctx, ziel, { midi, zeit, dauer, typ = 'sine', pegel = 0.2, industrial = false }) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
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
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 2400;
      osc.connect(g); g.connect(filter); filter.connect(shaper);
    } else {
      osc.connect(g); g.connect(ziel);
    }
    try { osc.start(zeit); osc.stop(zeit + dauer + 0.03); } catch { /* egal */ }
    knoten.add(osc);
    osc.onended = () => { knoten.delete(osc); try { g.disconnect(); } catch { /* egal */ } };
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
      knoten.add(osc);
      osc.onended = () => { knoten.delete(osc); try { g.disconnect(); } catch { /* egal */ } };
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
      knoten.add(osc);
      osc.onended = () => { knoten.delete(osc); try { g.disconnect(); } catch { /* egal */ } };
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
      knoten.add(osc);
      osc.onended = () => { knoten.delete(osc); try { g.disconnect(); } catch { /* egal */ } };
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
      knoten.add(osc);
      osc.onended = () => { knoten.delete(osc); try { g.disconnect(); } catch { /* egal */ } };
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
      knoten.add(src);
      src.onended = () => { knoten.delete(src); try { g.disconnect(); } catch { /* egal */ } };
    };
    if (art === 'kick-hat') { kick(zeit); hat(zeit + 0.0); }
    else if (art === 'double-kick') { kick(zeit, 0.55); kick(zeit + 0.09, 0.4); hat(zeit, true); }
  }

  function schrittEinplanen(ctx, ziel, sechezehntel, zeit, sechzehntelDauer, bpm) {
    const m = motiv;
    const n = m.lead.length;
    const i = ((sechezehntel % n) + n) % n;
    const industrial = m.art === 'industrial';
    const schritteProTakt = m.taktart === '3/4' ? 12 : 16;
    const imTakt = sechezehntel % schritteProTakt;
    // Streicherfläche zu Taktbeginn (nur klassisch/ruhig).
    if (m.art !== 'industrial' && imTakt === 0) {
      flaeche(ctx, ziel, zeit, (60 / bpm) * (m.taktart === '3/4' ? 3 : 4), m.grund - 12);
    }
    // Bass auf den Vierteln.
    if (sechezehntel % 4 === 0) {
      const b = m.bass[i];
      if (b !== null && b !== undefined) {
        ton(ctx, ziel, { midi: m.grund - 12 + b, zeit, dauer: sechzehntelDauer * 3.2, typ: 'triangle', pegel: 0.22, industrial: false });
      }
    }
    // Lead (Charakter-Lautheit je Motiv: der Garten bleibt fast stumm).
    const l = m.lead[i];
    if (l !== null && l !== undefined) {
      ton(ctx, ziel, {
        midi: m.grund + 12 + l, zeit, dauer: sechzehntelDauer * 2.2,
        typ: industrial ? 'sawtooth' : m.leadWave,
        pegel: (industrial ? 0.30 : 0.16) * (m.ducker || 1),
        industrial,
      });
    }
    // Puls der Mechanik: auf jedem Viertel hörbar, nie übertönt.
    if (sechezehntel % 4 === 0) schlag(ctx, ziel, zeit, m.drums);
    else if (m.drums === 'double-kick' && sechezehntel % 4 === 2) schlag(ctx, ziel, zeit, 'kick-hat');
  }

  function planen() {
    const ctx = kontext();
    if (!ctx || !spielt || pausiert || !motiv) return;
    const ziel = pegelKnoten(ctx);
    if (!ziel) return;
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

    aktuellesMotiv() { return stationId; },
    laeuft() { return spielt && !pausiert; },
    istStumm() { return stumm; },
    lautstaerke() { return laut; },
    istGeduckt() { return geduckt; },
    istPausiert() { return pausiert; },
    effektiveLautstaerke() {
      if (stumm || pausiert || !spielt) return 0;
      return Math.max(0, Math.min(1, laut * (geduckt ? 0.25 : 1)));
    },

    /**
     * Musik einer Station starten. Gleiche Station bei laufender Musik ist
     * kein Neustart (nur der Tempo-Callback wird frisch verdrahtet).
     */
    playStation(id, { getBpm: bpmFn = null } = {}) {
      const neu = MOTIVE[id] ? id : 'epilog';
      if (typeof bpmFn === 'function') getBpm = bpmFn;
      if (spielt && stationId === neu && !pausiert) {
        motiv = MOTIVE[neu];
        return stationId;
      }
      const ctx = kontext();
      stationId = neu;
      motiv = MOTIVE[neu];
      schritt = 0;
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
      const ctx = kontext();
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
      }
      aufraeumen(ctx);
      spielt = false;
      pausiert = false;
      geduckt = false;
      stationId = null;
      motiv = null;
    },

    setPaused(p) {
      const ctx = kontext();
      pausiert = !!p;
      if (!spielt) return;
      if (ctx) {
        const ziel = pegelKnoten(ctx);
        if (ziel) pegelAnfahren(ctx, ziel, 0.12);
        if (pausiert) timerStop();
        else { naechsteZeit = ctx.currentTime + 0.08; timerStart(); }
      }
    },

    /** Leiser hinter Dialogtexten (beide Werte sind in Ordnung, Hauptsache nicht laut). */
    setDucked(d) {
      geduckt = !!d;
      const ctx = kontext();
      if (ctx && spielt) {
        const ziel = pegelKnoten(ctx);
        if (ziel) pegelAnfahren(ctx, ziel, 0.2);
      }
    },

    setMuted(m) { stumm = !!m; const ctx = kontext(); if (ctx && spielt) { const z = pegelKnoten(ctx); if (z) pegelAnfahren(ctx, z, 0.08); } },
    setVolume(v) {
      laut = clamp01(Number(v));
      if (!Number.isFinite(laut)) laut = 0.8;
      const ctx = kontext();
      if (ctx && spielt) { const z = pegelKnoten(ctx); if (z) pegelAnfahren(ctx, z, 0.08); }
    },

    /** Für die Browserprüfung: Zustand des Teilkontexts. */
    kontextZustand() {
      const ctx = kontext();
      return ctx ? ctx.state : 'kein-kontext';
    },
  };
}
