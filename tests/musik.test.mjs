// tests/musik.test.mjs — Motive, Tempo, Stummschaltung und Node-Haushalt.
// Prüft ohne Audioausgabe: der Zustand der Engine ist auch ohne AudioContext
// vollständig; für den Node-Haushalt gibt es einen kleinen Kontext-Stellvertreter.
import assert from 'node:assert/strict';
import { LEVELS } from '../src/world.js';
import { BPM_BASE } from '../src/config.js';
import {
  createMusik, MOTIVE, STATIONEN_MUSIK, motifFuer, effektivesTempo, beschreibeMotiv,
  formFuer, formInfo, taktplanFuer, regie, abschnittAusStrecke, beschreibeForm, ABSCHNITTE,
} from '../src/music.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
async function testAsync(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));

const AKTE = ['akt1', 'akt2', 'akt3', 'akt4', 'akt5'];
const motivSignatur = (m) => [m.grund, m.taktart, m.lead.join(','), m.bass.join(','),
  m.drums, m.leadWave, m.haerte].join('|');

// --------------------------------------------------------------- Kontext-Attrappe --
// Zählt Nodes, damit „keine hängenden Audio-Nodes" messbar wird. `currentTime`
// steht normalerweise still: je Start wird genau ein Schritt eingeplant, das
// Ergebnis ist damit reproduzierbar (kein Zeitrennen im Test). Mit
// `laufendeZeit` tickt die Uhr echt — das braucht die Lastprobe am Ende.
function stellvertreter({ laufendeZeit = false } = {}) {
  const gestoppt = [];
  const start = Date.now();
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
  if (laufendeZeit) {
    Object.defineProperty(ctx, 'currentTime', { get: () => 1000 + (Date.now() - start) / 1000 });
  }
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

function mitKontext(opts = {}) {
  const st = stellvertreter(opts);
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

// ============================================================================
// FORM — aus dem Snippet wird Musik
// ============================================================================
test('jede Station trägt eine zusammenhängende Form von mindestens 16 Takten', () => {
  for (const id of STATIONEN_MUSIK) {
    const i = formInfo(id);
    assert.ok(i.takte >= 16, `${id}: nur ${i.takte} Takte`);
    assert.equal(i.akkorde.length, i.takte, `${id}: Akkordfolge deckt die Form nicht`);
    const teile = i.teile.reduce((s, t) => s + t.takte, 0);
    assert.equal(teile, i.takte, `${id}: die Teile füllen die Form nicht`);
    assert.ok(i.teile.length >= 4, `${id}: ${i.teile.length} Teile (A – A' – B – A erwartet)`);
    // Der letzte Teil beginnt hinter dem B-Teil: die Form läuft wirklich durch.
    assert.ok(i.teile[i.teile.length - 1].von > i.bTakt, `${id}: keine Reprise nach dem B-Teil`);
    const f = formFuer(id);
    assert.equal(f.takte, i.takte);
    assert.ok(beschreibeForm(id).includes(`${i.takte} Takte`), id);
  }
});

test('jede Station hat einen hörbaren, in der Form liegenden B-Teil', () => {
  for (const id of STATIONEN_MUSIK) {
    const i = formInfo(id);
    const b = i.teile.find((t) => t.name === 'B');
    assert.ok(b, `${id}: kein B-Teil`);
    assert.ok(b.takte >= 2, `${id}: B-Teil zu kurz (${b.takte} Takte)`);
    assert.ok(b.von > 1 && b.von + b.takte <= i.takte, `${id}: B-Teil liegt außerhalb der Form`);
    assert.equal(i.bTakt, b.von, `${id}: B-Teil-Einsatz stimmt nicht`);
    // Hörbar heißt: der B-Teil unterscheidet sich im Satz vom A-Teil — über die
    // Lage (Oktave) oder über die Dichte (der B-Teil atmet).
    const dichte = (p) => p.schritte.filter((s) => s.lead !== null).length;
    const aTakt = taktplanFuer(id, 0);
    const bTakt = taktplanFuer(id, b.von - 1);
    assert.equal(bTakt.teil, 'B', `${id}: Takt ${b.von} ist nicht der B-Teil`);
    assert.equal(bTakt.lage, 'kontrast');
    assert.ok(i.bOktav !== 0 || dichte(bTakt) < dichte(aTakt),
      `${id}: B-Teil hebt sich weder in der Lage (${i.bOktav}) noch in der Dichte ab`);
    assert.notDeepEqual(bTakt.schritte, aTakt.schritte, `${id}: B-Teil klingt wie der A-Teil`);
  }
});

test('zwei aufeinanderfolgende Takte sind nie identisch', () => {
  for (const id of STATIONEN_MUSIK) {
    const i = formInfo(id);
    const sign = (t) => JSON.stringify(taktplanFuer(id, t).schritte);
    const sigs = [];
    for (let t = 0; t < i.takte; t++) sigs.push(sign(t));
    for (let t = 0; t < i.takte; t++) {
      assert.notEqual(sigs[t], sigs[(t + 1) % i.takte],
        `${id}: Takt ${t + 1} und Takt ${((t + 1) % i.takte) + 1} sind gleich`);
    }
    // Die Akkordfolge wechselt in jedem Takt — kein Standbild.
    for (let t = 0; t < i.akkorde.length; t++) {
      assert.notEqual(i.akkorde[t], i.akkorde[(t + 1) % i.akkorde.length],
        `${id}: Akkord auf Takt ${t + 1} wiederholt sich im Folgetakt`);
    }
    // Und die Form schleift erst nach 16 Takten: Takt 1 klingt wieder wie Takt 17.
    assert.equal(sign(0), sign(i.takte), `${id}: die Schleife ist nicht 16 Takte lang`);
    assert.notEqual(sign(0), sign(8), `${id}: Takt 1 und Takt 9 wären gleich`);
  }
});

test('Variation statt Wiederholung: A und A′ teilen das Material, nicht die Phrase', () => {
  for (const id of STATIONEN_MUSIK) {
    const zelle = (p) => p.schritte
      .map((s) => (s.lead === null ? 'x' : String(s.lead - p.akkord)))
      .join(',');
    const sortiert = (p) => p.schritte
      .map((s) => (s.lead === null ? 'x' : String(s.lead - p.akkord)))
      .sort().join(',');
    const a = taktplanFuer(id, 0);
    const aStrich = taktplanFuer(id, 4);
    assert.equal(aStrich.teil, "A'", `${id}: Takt 5 ist nicht der A'-Teil`);
    // Gleiches Material (dieselbe Motivzelle in derselben Akkordlage) …
    assert.equal(sortiert(a), sortiert(aStrich), `${id}: A' hat anderes Tonmaterial`);
    // … aber eine andere Phrase: die Zelle steht verschoben.
    assert.notEqual(zelle(a), zelle(aStrich), `${id}: A' ist die wörtliche Wiederholung`);
  }
});

test('die Akte bleiben auch in Form und Akkordfolge unterscheidbar', () => {
  const formSig = AKTE.map((id) => {
    const i = formInfo(id);
    return [i.akkorde.join(','), i.form, i.bOktav, i.bTakt].join('|');
  });
  assert.equal(new Set(formSig).size, AKTE.length, `doppelte Formen: ${formSig.join(' / ')}`);
});

test('Füllfiguren kommen gelegentlich und nie auf dem Puls', () => {
  for (const id of STATIONEN_MUSIK) {
    const i = formInfo(id);
    let mitFuell = 0;
    for (let t = 0; t < i.takte; t++) {
      const p = taktplanFuer(id, t);
      let hat = false;
      p.schritte.forEach((s, k) => {
        if (s.fuell === null) return;
        hat = true;
        assert.notEqual(k % 4, 0, `${id}: Füllfigur liegt auf dem Puls (Takt ${t + 1}, Schritt ${k})`);
        assert.ok(Number.isFinite(s.fuell), `${id}: Füllfigur ohne Ton`);
      });
      if (hat) mitFuell++;
    }
    assert.ok(mitFuell > 0, `${id}: keine Füllfigur in der ganzen Form`);
    assert.ok(mitFuell <= 8, `${id}: Füllfiguren zu dicht (${mitFuell} von ${i.takte} Takten)`);
  }
});

test('der Puls bleibt in jedem Takt hörbar und unverändert', () => {
  for (const id of STATIONEN_MUSIK) {
    const i = formInfo(id);
    const spt = i.taktart === '3/4' ? 12 : 16;
    for (let t = 0; t < i.takte; t++) {
      const p = taktplanFuer(id, t);
      assert.equal(p.schritte.length, spt, `${id}: Takt ${t + 1} hat ${p.schritte.length} Schritte`);
      const puls = p.schritte.filter((s) => s.puls).length;
      assert.equal(puls, spt / 4, `${id}: Takt ${t + 1} hat ${puls} Pulsschläge`);
      p.schritte.forEach((s, k) => assert.equal(s.puls, k % 4 === 0, `${id}: Puls verrutscht`));
    }
  }
});

test('die Musik reagiert auf die Abschnitte: je Abschnitt eine neue Schicht', () => {
  const schichten = ['lead', 'gegen', 'fuell', 'breit'];
  const zahl = (a) => schichten.filter((s) => regie(a)[s]).length;
  const werte = [0, 1, 2, 3, 4].map(zahl);
  assert.deepEqual(werte, [0, 1, 2, 3, 4], `Schichten je Abschnitt: ${werte.join(',')}`);
  for (let a = 0; a < ABSCHNITTE; a++) {
    assert.equal(regie(a).abschnitt, a);
    assert.equal(regie(a).puls, true, 'der Puls läuft in jedem Abschnitt');
  }
  // Registerwechsel: ab dem vierten Abschnitt liegt die Melodie eine Oktave höher.
  assert.equal(regie(2).oktavLead, 0);
  assert.equal(regie(3).oktavLead, 12);
  // Übergang in den B-Teil: der erste Abschnitt bleibt im A-Teil, danach springt die Musik.
  assert.equal(regie(0).sprung, null);
  for (let a = 1; a < ABSCHNITTE; a++) assert.equal(regie(a).sprung, 'B');
  // Randfälle bleiben in der Regie.
  assert.equal(regie(-5).abschnitt, 0);
  assert.equal(regie(99).abschnitt, ABSCHNITTE - 1);
  assert.equal(regie(undefined).abschnitt, 0);
});

test('der Streckenfortschritt trifft genau fünf Abschnitte — auch die Fahrten', () => {
  assert.equal(ABSCHNITTE, 5);
  assert.equal(abschnittAusStrecke(0), 0);
  assert.equal(abschnittAusStrecke(0.199), 0);
  assert.equal(abschnittAusStrecke(0.2), 1);
  assert.equal(abschnittAusStrecke(0.6), 3);
  assert.equal(abschnittAusStrecke(0.999), 4);
  assert.equal(abschnittAusStrecke(1), 4);
  assert.equal(abschnittAusStrecke(-3), 0);
  assert.equal(abschnittAusStrecke(null), 0);
  assert.equal(abschnittAusStrecke(undefined), 0);
  assert.equal(abschnittAusStrecke(NaN), 0);
  assert.equal(abschnittAusStrecke('0.9'), 0, 'Unsinn fällt auf den Anfang zurück');

  for (const id of ['cabrio', 'motorrad']) {
    const lv = LEVELS.find((l) => l.id === id).build();
    const sections = lv.journey.sections;
    assert.ok(sections.length >= 4, `${id}: ${sections.length} Abschnitte`);
    const gesamt = sections[sections.length - 1].to;
    const treffer = sections.map((s) => abschnittAusStrecke(((s.from + s.to) / 2) / gesamt));
    // Jeder Fahrt-Abschnitt bekommt einen eigenen Musik-Abschnitt — die Musik
    // läuft mit der Strecke, nicht gegen sie.
    for (let k = 1; k < treffer.length; k++) {
      assert.ok(treffer[k] > treffer[k - 1], `${id}: Abschnitte fallen zusammen: ${treffer.join(',')}`);
    }
    // Und die Musik kennt keinen Abschnitt, den die Fahrt nicht hat.
    assert.ok(treffer[treffer.length - 1] <= ABSCHNITTE - 1, `${id}: ${treffer.join(',')}`);
  }
  // Die Nachtfahrt hat fünf Abschnitte — genau so viele wie die Musik.
  const moto = LEVELS.find((l) => l.id === 'motorrad').build();
  assert.equal(moto.journey.sections.length, ABSCHNITTE);
});

await testAsync('der Planer springt beim Abschnittswechsel in den B-Teil', async () => {
  // Ohne Abschnittsangabe trägt der Planer die mittlere Regie (volles Motiv).
  const ruhig = createMusik({ audio: null });
  ruhig.playStation('akt1');
  assert.equal(ruhig.abschnitt().lead, true);
  assert.equal(ruhig.abschnitt().gegen, true);
  ruhig.stop();

  // Mit Fortschritt: der neue Abschnitt kommt mitten in der Station — die Musik
  // geht beim nächsten Taktwechsel in den B-Teil (Takt 9 der Form).
  const { musik } = mitKontext({ laufendeZeit: true });
  let strecke = 0;                                        // Abschnitt 0
  musik.playStation('akt1', { getBpm: () => 220, getAbschnitt: () => strecke });
  await schlaf(300);
  assert.equal(musik.abschnitt().abschnitt, 0, 'die Station beginnt im ersten Abschnitt');
  assert.equal(musik.abschnitt().lead, false, 'der erste Abschnitt trägt noch keine Melodie');
  strecke = 0.25;                                         // Abschnitt 1
  await schlaf(1200);                                     // über die Taktgrenze
  const takt = musik.aktuellerTakt();
  const b = formFuer('akt1').bTeil;
  assert.ok(takt >= b.von && takt < b.von + b.takte,
    `nach dem Abschnittswechsel läuft der B-Teil nicht (Takt ${takt + 1})`);
  assert.equal(musik.abschnitt().abschnitt, 1, 'die Regie folgt der Strecke');
  assert.equal(musik.abschnitt().lead, true, 'Abschnitt 1 trägt die Melodie');
  assert.equal(musik.abschnitt().gegen, false, 'Abschnitt 1 hat noch keine Gegenstimme');
  assert.equal(musik.abschnitt().puls, true, 'der Puls läuft weiter');
  // Zurücklaufen lässt den Satz nicht zurückfallen — kein Pumpen an der Grenze.
  strecke = 0;
  await schlaf(250);
  assert.equal(musik.abschnitt().abschnitt, 1, 'der Satz fällt hinter die erreichte Schicht zurück');
  musik.stop();
  assert.equal(musik.offeneKnoten(), 0);
});

// ============================================================================
// LASTPROBE — 24 Stationswechsel und langes Laufen
// ============================================================================
async function lastprobe() {
  const { musik, ctx, gestoppt } = mitKontext({ laufendeZeit: true });
  let strecke = 0;
  let wechsel = 0;
  let maxKnoten = 0;
  const uhr = setInterval(() => { strecke = Math.min(1, strecke + 0.06); }, 40);
  musik.playStation('akt1', { getAbschnitt: () => strecke });
  for (let runde = 0; runde < 3; runde++) {
    for (const id of STATIONEN_MUSIK) {
      musik.playStation(id, { getAbschnitt: () => strecke });
      wechsel++;
      maxKnoten = Math.max(maxKnoten, musik.offeneKnoten());
      await schlaf(60);
      assert.equal(musik.aktuellesMotiv(), id, 'Station hält nicht');
    }
  }
  clearInterval(uhr);
  await schlaf(150);
  assert.equal(wechsel, 24, `${wechsel} Stationswechsel`);
  assert.ok(ctx.currentTime > 1000.2, 'die Uhr lief wirklich weiter');
  assert.ok(gestoppt.length >= 24, `nur ${gestoppt.length} Noten gestoppt`);
  assert.ok(maxKnoten <= 24, `Nodes während der Wechsel: ${maxKnoten}`);
  assert.ok(musik.offeneKnoten() <= 32, `Nodes am Ende: ${musik.offeneKnoten()}`);
  // Schalter dürfen auch nach 24 Wechseln nichts anhängen.
  const vorher = musik.offeneKnoten();
  musik.setPaused(true); musik.setPaused(false);
  musik.setDucked(true); musik.setDucked(false);
  musik.setVolume(0.5);
  assert.ok(musik.offeneKnoten() <= Math.max(vorher, 32), 'Schalter hängen Noten an');
  musik.stop();
  assert.equal(musik.offeneKnoten(), 0, 'nach dem Stopp bleibt nichts stehen');
  console.log(`   24 Stationswechsel, höchste Node-Zahl ${maxKnoten}, ${gestoppt.length} Noten gestoppt`);
}

await testAsync('24 Stationswechsel und langes Laufen ohne Node-Wildwuchs', lastprobe);

console.log(`${passed} Musik-Tests bestanden`);
