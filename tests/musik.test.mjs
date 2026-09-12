// tests/musik.test.mjs — Motive, Tempo, Stummschaltung und Node-Haushalt.
// Prüft ohne Audioausgabe: der Zustand der Engine ist auch ohne AudioContext
// vollständig; für den Node-Haushalt gibt es einen kleinen Kontext-Stellvertreter.
import assert from 'node:assert/strict';
import { LEVELS } from '../src/world.js';
import { BPM_BASE } from '../src/config.js';
import {
  createMusik, MOTIVE, STATIONEN_MUSIK, motifFuer, effektivesTempo, beschreibeMotiv,
} from '../src/music.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

const AKTE = ['akt1', 'akt2', 'akt3', 'akt4', 'akt5'];
const motivSignatur = (m) => [m.grund, m.taktart, m.lead.join(','), m.bass.join(','),
  m.drums, m.leadWave, m.haerte].join('|');

// --------------------------------------------------------------- Kontext-Attrappe --
// Zählt Nodes, damit „keine hängenden Audio-Nodes" messbar wird. `currentTime`
// steht still: je Start wird genau ein Schritt eingeplant, das Ergebnis ist
// damit reproduzierbar (kein Zeitrennen im Test).
function stellvertreter() {
  const gestoppt = [];
  const baueGain = () => ({
    gain: {
      value: 1,
      setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {},
    },
    connect() {}, disconnect() {},
  });
  const ctx = {
    state: 'running',
    currentTime: 1000,
    sampleRate: 44100,
    destination: {},
  };
  ctx.createGain = baueGain;
  ctx.createBiquadFilter = () => ({ type: '', frequency: { value: 0 }, connect() {}, disconnect() {} });
  ctx.createWaveShaper = () => ({ curve: null, connect() {}, disconnect() {} });
  ctx.createBuffer = (kan, len) => ({ length: len, getChannelData: () => new Float32Array(len) });
  ctx.createBufferSource = () => {
    const n = { buffer: null, connect() {}, disconnect() {}, start() {}, stop(t) { gestoppt.push(t); } };
    return n;
  };
  ctx.createOscillator = () => ({
    type: '', detune: { value: 0 },
    frequency: {
      value: 0,
      setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {},
    },
    connect() {}, disconnect() {}, start() {}, stop(t) { gestoppt.push(t); },
  });
  const bus = baueGain();
  return { ctx, bus, gestoppt };
}

function mitKontext() {
  const st = stellvertreter();
  const musik = createMusik({
    audio: { musikKontext: () => st.ctx, musikBus: () => st.bus },
  });
  return { musik, ...st };
}

// ------------------------------------------------------------------------ Motive --
test('jede Station hat ein Motiv — auch jede im Spiel geladene', () => {
  assert.ok(STATIONEN_MUSIK.length >= 8, STATIONEN_MUSIK.join(','));
  for (const id of STATIONEN_MUSIK) {
    const m = MOTIVE[id];
    assert.ok(m, `Motiv fehlt: ${id}`);
    assert.equal(m.id, id);
    assert.ok(Array.isArray(m.lead) && m.lead.length >= 12, `${id}: lead zu kurz`);
    assert.ok(Array.isArray(m.bass) && m.bass.length >= 8, `${id}: bass zu kurz`);
    assert.ok(m.grund >= 24 && m.grund <= 84, `${id}: grund ${m.grund}`);
    assert.ok(typeof m.drums === 'string' && m.drums.length > 0, `${id}: kein Puls`);
    assert.ok(m.titel && m.charakter && m.skizze, `${id}: Beschreibung fehlt`);
    assert.ok(['4/4', '3/4'].includes(m.taktart), `${id}: ${m.taktart}`);
  }
  // Kein Level ohne Musik: sonst fällt eine Station still auf den Epilog zurück.
  for (const l of LEVELS) {
    assert.ok(MOTIVE[l.id], `Level ohne Motiv: ${l.id}`);
    assert.equal(motifFuer(l.id).id, l.id);
  }
});

test('die Motive der Akte sind voneinander unterscheidbar', () => {
  const sigs = AKTE.map((id) => motivSignatur(MOTIVE[id]));
  assert.equal(new Set(sigs).size, AKTE.length, `doppelte Motive: ${sigs.join(' / ')}`);
  // Der Walzer ist der einzige Dreiertakt, der Rest bleibt im geraden Takt.
  assert.equal(MOTIVE.akt2.taktart, '3/4');
  for (const id of AKTE.filter((i) => i !== 'akt2')) assert.equal(MOTIVE[id].taktart, '4/4');
  // Eigener Charakter heißt auch: eigene Härte und eigener Grundton.
  // (Der Takt-Puls darf sich wiederholen — das Ticken ist überall dieselbe Uhr.)
  assert.equal(new Set(AKTE.map((id) => MOTIVE[id].haerte)).size, AKTE.length);
  assert.equal(new Set(AKTE.map((id) => MOTIVE[id].grund)).size, AKTE.length);
});

test('Cabrio und Motorrad sind zwei eigene Industrial-Stücke', () => {
  const c = MOTIVE.cabrio, m = MOTIVE.motorrad;
  assert.equal(c.art, 'industrial');
  assert.equal(m.art, 'industrial');
  for (const feld of ['titel', 'charakter', 'grund', 'haerte', 'drums']) {
    assert.notEqual(c[feld], m[feld], `gleich: ${feld}`);
  }
  // Beide sind verzerrte Sägezähne (Industrial-Idiom) — unterschieden werden sie
  // über Tiefe, Härte, Riff und Schlagzeug.
  assert.notDeepEqual(c.lead, m.lead);
  assert.notDeepEqual(c.bass, m.bass);
  assert.ok(m.haerte > c.haerte, `Motorrad ${m.haerte} vs Cabrio ${c.haerte}`);
  assert.ok(m.grund < c.grund, 'Motorrad liegt tiefer');
  // Beide sind Eigenstücke, kein Zitat.
  assert.equal(c.vorlage, 'eigenes Industrial-Stück');
  assert.equal(m.vorlage, 'eigenes Industrial-Stück');
  // Und die Level selbst unterscheiden sich im Tempo.
  const levelC = LEVELS.find((l) => l.id === 'cabrio').build();
  const levelM = LEVELS.find((l) => l.id === 'motorrad').build();
  assert.notEqual(levelC.bpm, levelM.bpm);
});

test('Vorlagen bleiben gemeinfrei oder eigenes Stück', () => {
  // Nur diese gemeinfreien Vorlagen (Stimmung, keine Melodieübernahme) und
  // Eigenstücke sind erlaubt — kein fremder Titel, kein Bandname.
  const erlaubt = new Set([
    'Nabucco-Chor-Stimmung', 'Fledermaus-Stimmung', 'Traviata-Stimmung',
    'Eroica-Marsch-Stimmung', 'Festfanfare mit Walzer-Reprise',
  ]);
  for (const m of Object.values(MOTIVE)) {
    const ok = erlaubt.has(m.vorlage) || m.vorlage.startsWith('eigenes ');
    assert.ok(ok, `${m.id}: unerlaubte Vorlage "${m.vorlage}"`);
  }
  for (const id of ['cabrio', 'motorrad', 'epilog']) {
    assert.ok(MOTIVE[id].vorlage.startsWith('eigenes '), id);
  }
});

// -------------------------------------------------------------------------- Tempo --
test('Tempo folgt level.bpm und den Taktwechseln', () => {
  assert.equal(effektivesTempo({ bpm: 120, takts: [] }), 120);
  // Akt 1 nennt kein eigenes Tempo — dann gilt das Grundtempo.
  assert.equal(effektivesTempo({ takts: [] }), BPM_BASE);
  assert.equal(effektivesTempo({ bpm: 120 }), 120);
  assert.equal(effektivesTempo(null), BPM_BASE);

  const akt4 = LEVELS.find((l) => l.id === 'akt4').build();
  const [t0, t1] = akt4.takts;
  assert.equal(effektivesTempo(akt4, { x: 0 }, 'profi'), 96);
  assert.equal(effektivesTempo(akt4, { x: t0.x - 1 }, 'profi'), 96, 'vor dem Wechsel');
  assert.equal(effektivesTempo(akt4, { x: t0.x }, 'profi'), t0.bpm, 'Wechsel greift genau an der Stelle');
  assert.equal(effektivesTempo(akt4, { x: t1.x + 7 }, 'profi'), t1.bpm, 'der letzte Wechsel gilt weiter');
  // Eine Zahl gilt als x.
  assert.equal(effektivesTempo(akt4, t0.x, 'profi'), t0.bpm);
  // Gemütlich dämpft den Wechsel, ohne ihn aufzuheben.
  const ged = effektivesTempo(akt4, { x: t0.x }, 'gemuetlich');
  assert.ok(ged > 96 && ged < t0.bpm, `gedämpft: ${ged}`);

  // Fahrten zählen den Streckenanteil, nicht Pixel.
  const moto = LEVELS.find((l) => l.id === 'motorrad').build();
  const tm = moto.takts[0];
  assert.equal(effektivesTempo(moto, { anteil: tm.at - 0.01 }, 'profi'), moto.bpm);
  assert.equal(effektivesTempo(moto, { anteil: tm.at }, 'profi'), tm.bpm);
  assert.notEqual(moto.bpm, tm.bpm, 'die Nachtfahrt wechselt wirklich das Tempo');
});

// ---------------------------------------------------------- Zustand und Schalter --
test('Stummschaltung, Lautstärke, Ducken und Pause greifen', () => {
  const musik = createMusik({ audio: null });   // ohne Kontext: nur Zustand
  assert.equal(musik.effektiveLautstaerke(), 0, 'vor dem Start ist es still');
  assert.equal(musik.aktuellesMotiv(), null);
  musik.playStation('akt2');
  assert.equal(musik.aktuellesMotiv(), 'akt2');
  assert.equal(musik.laeuft(), true);

  musik.setVolume(0.8);
  assert.equal(musik.lautstaerke(), 0.8);
  assert.equal(musik.effektiveLautstaerke(), 0.8);
  musik.setVolume(4);
  assert.equal(musik.lautstaerke(), 1, 'über 1 wird gekappt');
  musik.setVolume('quatsch');
  assert.equal(musik.lautstaerke(), 0.8, 'Unsinn fällt auf die Vorgabe zurück');

  musik.setMuted(true);
  assert.equal(musik.istStumm(), true);
  assert.equal(musik.effektiveLautstaerke(), 0, 'stumm heißt wirklich still');
  musik.setMuted(false);
  assert.equal(musik.effektiveLautstaerke(), 0.8);

  musik.setDucked(true);
  assert.equal(musik.istGeduckt(), true);
  assert.ok(musik.effektiveLautstaerke() > 0 && musik.effektiveLautstaerke() < 0.5,
    `hinter Dialog leise, aber hörbar: ${musik.effektiveLautstaerke()}`);
  musik.setDucked(false);

  musik.setPaused(true);
  assert.equal(musik.istPausiert(), true);
  assert.equal(musik.laeuft(), false);
  assert.equal(musik.effektiveLautstaerke(), 0);
  musik.setPaused(false);
  assert.equal(musik.laeuft(), true);

  musik.stop();
  assert.equal(musik.aktuellesMotiv(), null);
  assert.equal(musik.laeuft(), false);
  assert.equal(musik.effektiveLautstaerke(), 0);
});

test('gleiche Station startet nicht neu, unbekannte fällt auf den Epilog', () => {
  const musik = createMusik({ audio: null });
  assert.equal(musik.playStation('akt3'), 'akt3');
  assert.equal(musik.playStation('akt3'), 'akt3');
  assert.equal(musik.aktuellesMotiv(), 'akt3');
  assert.equal(musik.playStation('gibtesnicht'), 'epilog');
  assert.equal(musik.aktuellesMotiv(), 'epilog');
  musik.stop();
});

// ------------------------------------------------- kein Ton vor der Nutzeraktion --
test('ohne Start wird kein AudioContext angefasst', () => {
  let kontextAufrufe = 0;
  const musik = createMusik({
    audio: {
      musikKontext() { kontextAufrufe++; return null; },
      musikBus() { kontextAufrufe++; return null; },
    },
  });
  // Das ist der Ladevorgang: Schalter aus dem Spielstand setzen (auch „Musik aus").
  musik.setMuted(true);
  musik.setVolume(0.3);
  musik.setDucked(true);
  musik.setPaused(true);
  assert.equal(musik.kontextZustand(), 'kein-kontext');
  assert.equal(kontextAufrufe, 0, 'Laden darf keinen Kontext erzeugen');
  musik.stop();
  assert.equal(kontextAufrufe, 0, 'auch Stoppen erzeugt keinen Kontext');
  // Erst der Start (im Spiel: der Klick) holt den Kontext.
  musik.setMuted(false);
  musik.playStation('akt1');
  assert.ok(kontextAufrufe >= 1, 'der Start holt den Kontext');
  musik.stop();
});

// ------------------------------------------------------------- keine hängenden Nodes --
test('Stationswechsel lässt keine Audio-Nodes hängen', () => {
  const { musik, gestoppt } = mitKontext();
  musik.playStation('akt1');
  const nachEinem = musik.offeneKnoten();
  assert.ok(nachEinem > 0, 'es klingt etwas');
  assert.ok(nachEinem <= 8, `ein Schritt plant wenige Noten: ${nachEinem}`);

  // Jede Station einmal durchschalten (mehrfach, wie im echten Spiel).
  for (let runde = 0; runde < 3; runde++) {
    for (const id of STATIONEN_MUSIK) {
      musik.playStation(id);
      assert.equal(musik.aktuellesMotiv(), id);
    }
  }
  const nachVielen = musik.offeneKnoten();
  assert.ok(nachVielen <= 24, `Nodes wachsen nicht mit der Zahl der Wechsel: ${nachVielen}`);
  assert.ok(gestoppt.length >= nachEinem, 'die alten Noten wurden wirklich gestoppt');

  // Pause, Ducken und Lautstärke dürfen keine Noten anhängen.
  musik.setPaused(true);
  const inPause = musik.offeneKnoten();
  musik.setPaused(false);
  musik.setDucked(true);
  musik.setDucked(false);
  musik.setVolume(0.4);
  assert.ok(musik.offeneKnoten() <= Math.max(inPause, 24), 'kein Zuwachs durch Schalter');

  musik.stop();
  assert.equal(musik.offeneKnoten(), 0, 'nach dem Stopp bleibt nichts stehen');
  assert.equal(musik.laeuft(), false);
});

test('Stopp räumt auf und lässt sich mehrfach aufrufen', () => {
  const { musik, gestoppt } = mitKontext();
  musik.playStation('motorrad');
  const nodes = musik.offeneKnoten();
  musik.stop();
  musik.stop();
  assert.equal(musik.offeneKnoten(), 0);
  assert.ok(gestoppt.length >= nodes);
  // Nach dem Stopp neu starten: es bleibt ein sauberer, kleiner Haushalt.
  musik.playStation('motorrad');
  assert.ok(musik.offeneKnoten() <= 8, `Neustart plant nur einen Schritt: ${musik.offeneKnoten()}`);
  musik.stop();
  assert.equal(musik.offeneKnoten(), 0);
});

// ---------------------------------------------------------------------- Beschreibung --
test('beschreibeMotiv nennt Titel, Charakter und Takt', () => {
  for (const id of STATIONEN_MUSIK) {
    const text = beschreibeMotiv(id);
    const m = MOTIVE[id];
    assert.ok(text.includes(m.titel), `${id}: Titel fehlt`);
    assert.ok(text.includes(m.charakter), `${id}: Charakter fehlt`);
    assert.ok(text.includes(m.taktart), `${id}: Takt fehlt`);
  }
  // Unbekannte Stationen beschreiben den Epilog, nicht „undefined".
  assert.ok(beschreibeMotiv('gibtesnicht').includes(MOTIVE.epilog.titel));
});

console.log(`${passed} Musik-Tests bestanden`);
