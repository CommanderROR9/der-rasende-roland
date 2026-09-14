// tests/probe.test.mjs — DRR-P1 „DIE LETZTE PROBE".
//
// Prüft den Plan-Vertrag (reine Daten, ohne DOM), die Zustandslogik der Szene
// und die Registrierung der Station. Alles ohne Browser: der Plan entsteht aus
// (schwierigkeit, seed) und ist damit reproduzierbar.
import assert from 'node:assert/strict';
import {
  bauProbePlan, probeFensterSkala, verdiktIndex, Probe, buildProbe,
  satzBei, PROBE_SAETZE, PROBE_RISE, PROBE_DAUER, PROBE_TASTEN_ABSTAND,
  PROBE_GNADE_FAKTOR, PROBE_GNADE_MAX, PROBE_VERDIKTE, PROBE_TASTEN, PROBE_SPALTEN,
  PROBE_TREFFER_BLITZ, PROBE_PATZER_MARKE,
} from '../src/probe.js';
import { LEVELS, buildProbe as buildProbeAusWorld } from '../src/world.js';
import { STATIONEN, BELOHNUNGEN, stationIds } from '../src/story.js';
import { MOTIVE, STATIONEN_MUSIK, AKKORDE, formFuer, taktplanFuer, schritteProTakt } from '../src/music.js';
import { DIFFICULTY } from '../src/config.js';
import { SPRITES } from '../src/sprites.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

// Die Szene zeichnet über render.js (`document.createElement('canvas')`). Für
// die Node-Prüfung genügt eine Canvas-Attrappe: gemessen wird, DASS gezeichnet
// wird — die Bildpunkte misst der Browserlauf.
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement() {
      return {
        width: 0, height: 0,
        getContext() {
          return {
            fillStyle: '', globalAlpha: 1, globalCompositeOperation: 'source-over',
            fillRect() {}, drawImage() {},
          };
        },
      };
    },
  };
}

const TASTE_FUER = { einsatz: 'action', ohropax: 'ohropax' };
const LAUTE = ['becken', 'piccolo', 'sopran'];
const bpmFuer = (id) => PROBE_SAETZE.find((s) => s.id === id).bpm;
/** Rasterschritt eines Ereignisses: Schlag, in der Coda das Achtel. */
const rasterschritt = (e) => (60 / bpmFuer(e.satz)) / (e.coda ? 2 : 1);

// ---------------------------------------------------------------- Der Plan --
const plan = bauProbePlan({ schwierigkeit: 'gemuetlich' });

test('Plan: dieselben Eingaben ergeben denselben Lauf (geseedet, deterministisch)', () => {
  const a = bauProbePlan({ schwierigkeit: 'gemuetlich', seed: 4711 });
  const b = bauProbePlan({ schwierigkeit: 'gemuetlich', seed: 4711 });
  assert.equal(JSON.stringify(a.ereignisse), JSON.stringify(b.ereignisse));
  const c = bauProbePlan({ schwierigkeit: 'gemuetlich', seed: 4712 });
  assert.notEqual(JSON.stringify(a.ereignisse), JSON.stringify(c.ereignisse),
    'ein anderer Seed muss einen anderen Lauf ergeben');
});

test('Plan: Gesamtdauer 65–75 s, Schlussakkord und Verdikt nach der Coda', () => {
  assert.ok(plan.dauer >= 65 && plan.dauer <= 75, `${plan.dauer}s`);
  const letzte = plan.ereignisse[plan.ereignisse.length - 1];
  assert.ok(letzte.bis <= 70, `letztes Fenster endet bei ${letzte.bis.toFixed(2)}s`);
  assert.ok(plan.schlussakkord > letzte.bis, 'der Schlussakkord liegt nach dem letzten Einsatz');
  assert.ok(plan.schlussakkord <= plan.dauer, 'der Schlussakkord liegt im Lauf');
});

test('Plan: vier Sätze in der Reihenfolge des Auftrags', () => {
  const ids = plan.saetze.map((s) => s.id);
  assert.deepEqual(ids, ['vom-blatt', 'nochmal', 'generalprobe', 'coda']);
  assert.deepEqual(PROBE_SAETZE.map((s) => s.bpm), [88, 104, 120, 128]);
  for (const e of plan.ereignisse) {
    const s = PROBE_SAETZE.find((x) => x.id === e.satz);
    assert.ok(e.t >= s.von - 0.2 && e.t <= s.bis, `${e.satz}: t=${e.t.toFixed(2)} außerhalb ${s.von}-${s.bis}`);
  }
  const saetzeDerReihe = [...new Set(plan.ereignisse.map((e) => e.satz))];
  assert.deepEqual(saetzeDerReihe, ['vom-blatt', 'nochmal', 'generalprobe', 'coda']);
});

test('Plan: Fenster werden enger (Sätze) und die Schwierigkeit skaliert sie', () => {
  const fenster = ['vom-blatt', 'nochmal', 'generalprobe'].map((id) => {
    const e = plan.ereignisse.find((x) => x.satz === id);
    return e.fenster;
  });
  assert.ok(fenster[0] > fenster[1] && fenster[1] > fenster[2],
    `Fenster nicht monoton: ${fenster.join(' > ')}`);
  const zuegig = bauProbePlan({ schwierigkeit: 'zuegig' });
  const f = (p, id) => p.ereignisse.find((x) => x.satz === id).fenster;
  for (const id of ['vom-blatt', 'nochmal', 'generalprobe']) {
    assert.ok(f(zuegig, id) < f(plan, id), `${id}: zuegig nicht enger`);
    assert.ok(Math.abs(f(zuegig, id) - f(plan, id) * 0.8) < 1e-9, `${id}: anderes Verhältnis als trittWindow`);
  }
  // Dieselbe Quelle wie die Trittfenster der Simulation.
  assert.equal(probeFensterSkala('gemuetlich'),
    DIFFICULTY.gemuetlich.trittWindow / DIFFICULTY.gemuetlich.trittWindow);
  assert.equal(probeFensterSkala('zuegig'), DIFFICULTY.zuegig.trittWindow / DIFFICULTY.gemuetlich.trittWindow);
});

test('Plan: Auftauchen 0,35 s vor dem Fenster, erstes Ereignis frühestens bei 4 s', () => {
  for (const e of plan.ereignisse) {
    assert.equal(+(e.von - e.rise).toFixed(6), PROBE_RISE);
    assert.equal(e.von, e.t);
    assert.ok(e.bis > e.von, 'das Fenster ist leer');
  }
  const erstes = plan.ereignisse[0];
  assert.ok(erstes.t >= 4, `erstes Ereignis bei ${erstes.t.toFixed(2)}s`);
  assert.equal(erstes.figur, 'dirigent');
  assert.deepEqual(plan.ereignisse.slice(1, 3).map((e) => e.figur), ['sopran', 'dirigent']);
});

test('Plan: jedes Ereignis liegt auf dem Takt-Raster (±150 ms)', () => {
  let groesster = 0;
  for (const e of plan.ereignisse) {
    const schritt = rasterschritt(e);
    const fehler = Math.abs(e.t - Math.round(e.t / schritt) * schritt);
    groesster = Math.max(groesster, fehler);
    assert.ok(fehler <= 0.15, `${e.figur}@${e.t}: ${(fehler * 1000).toFixed(0)} ms neben dem Raster`);
  }
  assert.ok(plan.rasterFehler <= 0.15, `Plan meldet Rasterfehler ${plan.rasterFehler}`);
  assert.ok(groesster <= 0.001, `Sätze liegen nicht exakt auf dem Schlag (${(groesster * 1000).toFixed(1)} ms)`);
});

test('Plan: zwei verschiedene Tasten nie dichter als 0,55 s', () => {
  for (let i = 1; i < plan.ereignisse.length; i++) {
    const a = plan.ereignisse[i - 1];
    const b = plan.ereignisse[i];
    assert.ok(b.t > a.t, 'Ereignisse sind nicht aufsteigend sortiert');
    if (a.taste !== b.taste) {
      assert.ok(b.t - a.t >= PROBE_TASTEN_ABSTAND - 1e-9,
        `${a.figur}->${b.figur}: ${(b.t - a.t).toFixed(3)}s`);
    }
  }
  // Figuren -> Taste wie festgelegt.
  for (const e of plan.ereignisse) {
    assert.equal(e.taste, PROBE_TASTEN[e.figur]);
    for (const f of e.figuren) assert.equal(PROBE_TASTEN[f], e.taste, `${f} in ${e.figur}-Ereignis`);
  }
});

test('Plan: Satz 2 kennt Stich und Doppel, Satz 3 Doppel-Lärm und Ketten', () => {
  const s2 = plan.ereignisse.filter((e) => e.satz === 'nochmal');
  const s3 = plan.ereignisse.filter((e) => e.satz === 'generalprobe');
  // Stich: Einsatz, danach höchstens 1,3 s später der Lärm.
  const stiche = s2.filter((e) => e.art === 'stich');
  assert.ok(stiche.length >= 2, `nur ${stiche.length} Stiche`);
  for (const e of stiche) {
    const i = plan.ereignisse.indexOf(e);
    const laut = plan.ereignisse[i + 1];
    assert.equal(laut.art, 'stich-laut');
    assert.equal(e.figur, 'dirigent');
    assert.ok(LAUTE.includes(laut.figur), `${laut.figur} ist nicht laut`);
    const abstand = laut.t - e.t;
    assert.ok(abstand <= 1.3, `Stich-Lärm erst nach ${abstand.toFixed(3)}s`);
    assert.ok(abstand >= PROBE_TASTEN_ABSTAND, `Stich-Lärm zu dicht (${abstand.toFixed(3)}s)`);
  }
  // Doppel: immer dieselbe Taste, zwei Figuren, Abstand unter dem Satzabstand.
  const doppel = s2.filter((e) => e.art === 'doppel');
  assert.ok(doppel.length >= 2, `nur ${doppel.length} Doppel-Ereignisse`);
  for (let i = 0; i < s2.length; i++) {
    if (s2[i].art !== 'doppel') continue;
    const partner = s2[i + 1];
    if (partner && partner.art === 'doppel') {
      assert.equal(partner.taste, s2[i].taste, 'Doppel verlangt verschiedene Tasten');
      assert.ok(partner.t - s2[i].t <= 0.8, `Doppel zu weit auseinander (${(partner.t - s2[i].t).toFixed(3)}s)`);
    }
  }
  assert.ok(doppel.every((e) => e.taste === PROBE_TASTEN[e.figur]));
  // Generalprobe: Doppel-Lärm (zwei Laute gleichzeitig, ein Druck) und Ketten.
  const laerm = s3.filter((e) => e.art === 'doppel-laerm');
  assert.ok(laerm.length >= 2, `nur ${laerm.length} Doppel-Lärm-Ereignisse`);
  for (const e of laerm) {
    assert.equal(e.figuren.length, 2, 'Doppel-Lärm braucht zwei Figuren');
    assert.equal(e.gleichzeitig, true);
    assert.equal(e.figuren[0], e.figur);
    for (const f of e.figuren) assert.ok(LAUTE.includes(f), `${f} ist nicht laut`);
    assert.notEqual(e.figuren[0], e.figuren[1]);
    assert.equal(e.taste, 'ohropax');
  }
  const ketten = s3.filter((e) => e.art === 'kette');
  assert.ok(ketten.length >= 3, `nur ${ketten.length} Ketten-Ereignisse`);
  for (let i = 0; i + 2 < s3.length; i++) {
    if (s3[i].art !== 'kette' || s3[i + 1].art !== 'kette' || s3[i + 2].art !== 'kette') continue;
    assert.equal(s3[i + 1].taste, s3[i].taste);
    assert.equal(s3[i + 2].taste, s3[i].taste);
    assert.ok(s3[i + 2].t - s3[i].t <= 1.8, 'Kette zu langsam');
    i += 2;
  }
});

test('Plan: die Coda hat vier feste Einsätze im Wechsel (Abstand ≈ 0,7 s)', () => {
  const coda = plan.ereignisse.filter((e) => e.coda);
  assert.equal(coda.length, 4);
  assert.deepEqual(coda.map((e) => e.taste), ['einsatz', 'ohropax', 'einsatz', 'ohropax']);
  assert.deepEqual(coda.map((e) => e.figur), ['dirigent', 'becken', 'dirigent', 'sopran']);
  for (let i = 1; i < coda.length; i++) {
    const abstand = coda[i].t - coda[i - 1].t;
    assert.ok(abstand >= 0.65 && abstand <= 0.75, `Coda-Abstand ${abstand.toFixed(3)}s`);
    assert.ok(abstand >= PROBE_TASTEN_ABSTAND, 'Coda verletzt den Mindestabstand');
  }
  assert.ok(coda[0].t >= 64.5 && coda[0].t <= 65.5, `Coda beginnt bei ${coda[0].t.toFixed(2)}s`);
  assert.equal(coda[0].taste, PROBE_TASTEN.dirigent);
});

test('Plan: Spalten liegen im Bild, nie zweimal dieselbe hintereinander', () => {
  let zuvor = null;
  for (const e of plan.ereignisse) {
    assert.ok(e.spalte >= 0 && e.spalte < PROBE_SPALTEN, `Spalte ${e.spalte}`);
    if (zuvor !== null) assert.notEqual(e.spalte, zuvor, 'zwei Figuren in derselben Spalte');
    zuvor = e.spalte;
  }
});

// ------------------------------------------------------------ Zustandslogik --
function mache({ difficulty = 'gemuetlich', seed = 7, level } = {}) {
  const input = { state: { action: false, ohropax: false } };
  const events = [];
  const audio = { play() {}, daempfe() {}, resume() {} };
  const probe = new Probe({
    level, input, audio, view: { w: 384, h: 216 }, difficulty, seed,
    events: (e) => events.push(e),
  });
  const schritte = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) probe.update(dt); };
  const bis = (t, max = 60 * 90) => { let i = 0; while (probe.zeit < t && i < max && probe.state === 'play') { probe.update(1 / 60); i++; } };
  const druck = (taste) => {
    input.state[taste] = true; probe.update(1 / 60);
    input.state[taste] = false; probe.update(1 / 60);
  };
  return { probe, input, events, schritte, bis, druck };
}
/** Ein Lauf, der jede offene Figur sofort richtig bedient. */
function perfekt(difficulty = 'gemuetlich', seed = 7) {
  const { probe, input } = mache({ difficulty, seed });
  for (let i = 0; i < 60 * 80 && probe.state === 'play'; i++) {
    const offen = probe.ablauf.find((e) => e.status === 'offen');
    input.state.action = false;
    input.state.ohropax = false;
    if (offen) input.state[TASTE_FUER[offen.taste]] = true;
    probe.update(1 / 60);
  }
  return probe;
}

test('Zustand: HUD meldet den Modus `probe`, der Plan steht an der Szene', () => {
  const { probe } = mache();
  assert.equal(probe.hud.modus, 'probe');
  assert.equal(probe.plan.ereignisse.length, mache().probe.plan.ereignisse.length);
  assert.equal(probe.ablauf.length, probe.plan.ereignisse.length);
  assert.equal(probe.state, 'play');
  assert.equal(probe.hud.figur, null);
  assert.equal(probe.restzeit() > 60, true);
});

test('Zustand: Drücke im Rise und im Leerlauf sind neutral', () => {
  const { probe, druck, bis } = mache();
  const erstes = probe.ablauf[0];
  bis(erstes.riseEff + 0.1);
  druck('action');
  assert.equal(probe.treffer, 0, 'ein Druck im Rise darf nicht treffen');
  assert.equal(probe.patzer, 0, 'ein Druck im Rise ist kein Patzer');
  assert.equal(probe.leerlauf, 1);
  // Mitten im Fenster die falsche Taste: Patzer, das Fenster bleibt offen.
  bis(erstes.tEff + 0.05);
  druck('ohropax');
  assert.equal(probe.patzer, 1);
  assert.equal(probe.treffer, 0);
  druck('action');
  assert.equal(probe.treffer, 1, 'danach muss die richtige Taste noch treffen');
  assert.equal(probe.patzer, 1);
});

test('Zustand: ein gehaltener Knopf wertet genau einmal', () => {
  const { probe, input, bis } = mache();
  const erstes = probe.ablauf[0];
  bis(erstes.tEff + 0.05);
  input.state.action = true;
  for (let i = 0; i < 60; i++) probe.update(1 / 60);      // eine Sekunde gehalten
  assert.equal(probe.treffer, 1, `${probe.treffer} Treffer aus einem gehaltenen Druck`);
  const zweites = probe.ablauf[1];
  bis(zweites.tEff + 0.05);                                // immer noch gehalten
  for (let i = 0; i < 10; i++) probe.update(1 / 60);
  assert.equal(probe.treffer, 1, 'der gehaltene Knopf darf das nächste Fenster nicht mitnehmen');
});

test('Zustand: ein verpasstes Fenster ist ein Patzer, der Lauf läuft weiter', () => {
  const { probe, bis } = mache();
  const erstes = probe.ablauf[0];
  bis(erstes.bisEff + 0.05);
  assert.equal(probe.patzer, 1);
  assert.equal(erstes.status, 'verpasst');
  assert.equal(probe.state, 'play');
});

// ------------------------------------------------- Anzeige-Lebenslauf (P1b) --
// Rolands Befund (14.09.): erledigte Figuren blieben als weiße Schatten stehen
// und verdeckten die neu auftauchenden. Geprüft wird hier nur der Anzeige-
// Lebenslauf — Plan, Fenster, Gnade und Quote bleiben unangetastet.
test('Anzeige: ein Treffer blitzt kurz und räumt dann das Feld', () => {
  const { probe, druck, bis } = mache();
  const erstes = probe.ablauf[0];
  bis(erstes.tEff + 0.05);
  druck(TASTE_FUER[erstes.taste]);
  assert.equal(probe.treffer, 1);
  assert.equal(erstes.status, 'treffer');
  assert.ok(typeof erstes.erledigtT === 'number', 'der Treffer vermerkt keinen Erledigt-Zeitpunkt');
  const imBlitz = probe.figuren().filter((f) => f.t === erstes.tEff);
  assert.equal(imBlitz.length, 1, 'während des Blitzes muss die Figur noch stehen');
  assert.equal(imBlitz[0].erledigt, erstes.erledigtT);
  bis(erstes.tEff + PROBE_TREFFER_BLITZ + 0.2);
  assert.equal(erstes.status, 'weg', `Status nach dem Blitz: ${erstes.status}`);
  assert.equal(probe.figuren().some((f) => f.t === erstes.tEff), false,
    'die erledigte Figur steht noch im Bild');
  // Kein Wiederauftauchen: der Endstatus bleibt stehen und ist NICHT 'aus'
  // (über aus→rise würde dieselbe Figur sonst erneut aufploppen).
  for (let i = 0; i < 20 * 60; i++) {
    probe.update(1 / 60);
    assert.equal(probe.figuren().some((f) => f.t === erstes.tEff), false,
      `die erledigte Figur ist nach ${probe.zeit.toFixed(1)} s wieder da`);
  }
  assert.equal(erstes.status, 'weg');
});

test('Anzeige: eine verpasste Figur trägt die rote Marke kurz und ist dann weg', () => {
  const { probe, bis } = mache();
  const erstes = probe.ablauf[0];
  bis(erstes.bisEff + 0.05);
  assert.equal(erstes.status, 'verpasst');
  assert.ok(typeof erstes.erledigtT === 'number', 'der Patzer vermerkt keinen Erledigt-Zeitpunkt');
  assert.equal(probe.figuren().some((f) => f.t === erstes.tEff), true, 'die rote Marke fehlt sofort');
  bis(erstes.bisEff + PROBE_PATZER_MARKE + 0.2);
  assert.equal(erstes.status, 'weg', `Status nach der Marke: ${erstes.status}`);
  assert.equal(probe.figuren().some((f) => f.t === erstes.tEff), false,
    'die verpasste Figur steht noch im Bild');
});

test('Anzeige: über den ganzen Lauf bleibt keine erledigte Figur stehen', () => {
  const { probe } = mache();
  let maxRest = 0;
  while (probe.state === 'play') {
    probe.update(1 / 60);
    for (const e of probe.ablauf) {
      if (e.status === 'weg' || e.erledigtT === undefined) continue;
      const grenze = e.status === 'treffer' ? PROBE_TREFFER_BLITZ : PROBE_PATZER_MARKE;
      maxRest = Math.max(maxRest, probe.zeit - e.erledigtT - grenze);
    }
  }
  assert.ok(maxRest <= 1 / 60 + 1e-9,
    `eine erledigte Figur überlebte ihr Anzeigefenster um ${maxRest.toFixed(3)} s`);
  assert.equal(probe.ablauf.filter((e) => e.erledigtT !== undefined).length, probe.ablauf.length,
    'nicht jede Figur wurde als erledigt vermerkt');
  assert.equal(probe.ablauf.filter((e) => e.status === 'weg').length >= probe.ablauf.length - 1, true,
    'am Ende stehen erledigte Figuren im Bild');
});

test('Anzeige: die weiße Silhouette blitzt nur im Fenster', () => {
  const bilder = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1,
    fillRect() {}, beginPath() {}, arc() {}, stroke() {}, save() {}, restore() {}, translate() {},
    drawImage(bild) { bilder.push(bild); },
  };
  const { probe, druck, bis } = mache();
  const erstes = probe.ablauf[0];
  bis(erstes.tEff + 0.05);
  druck(TASTE_FUER[erstes.taste]);
  const solid = probe.sprite(erstes.figur).solid;
  probe.draw(ctx);
  assert.equal(bilder.includes(solid), true, 'im Blitz fehlt die weiße Silhouette');
  bilder.length = 0;
  bis(erstes.tEff + PROBE_TREFFER_BLITZ + 0.2);
  probe.draw(ctx);
  assert.equal(bilder.includes(solid), false, 'die weiße Silhouette blitzt nach dem Fenster weiter');
  assert.equal(probe.figuren().some((f) => f.t === erstes.tEff), false);
});

test('Zustand: Gnade dehnt das nächste Intervall ×1,4 (höchstens dreimal, eine Meldung)', () => {
  const { probe, bis } = mache();
  const [e1, e2, e3, e4] = probe.ablauf;
  const intervallVorher = e4.tEff - e3.tEff;
  const versatzVorher = probe.versatz;
  // Drei Patzer in Folge: die drei ersten Fenster einfach verstreichen lassen.
  bis(e3.bisEff + 0.05);
  assert.equal(probe.patzer, 3);
  assert.equal(probe.gnade, 1, 'nach drei Patzern in Folge gibt es Luft');
  assert.equal(probe.luftGezeigt, true);
  assert.ok(probe.hint && /LUFT/.test(probe.hint.text), JSON.stringify(probe.hint));
  const erwartet = PROBE_GNADE_FAKTOR * intervallVorher;
  assert.ok(Math.abs((e4.tEff - e3.tEff) - erwartet) < 1e-9,
    `Intervall ${(e4.tEff - e3.tEff).toFixed(3)} statt ${erwartet.toFixed(3)}`);
  assert.ok(probe.versatz > versatzVorher);
  // Mehr Patzer: die Gnade greift weiter, aber nie öfter als dreimal.
  const { probe: passiv } = mache();
  while (passiv.state === 'play') passiv.update(1 / 60);
  assert.equal(passiv.gnade, PROBE_GNADE_MAX, `${passiv.gnade} Gnaden`);
  assert.equal(passiv.state, 'complete');
  assert.ok(passiv.zeit <= 75, `Lauf dauerte ${passiv.zeit.toFixed(1)}s`);
});

test('Zustand: guter Lauf → Verdikt 1, passiver Lauf → Verdikt 3 ohne Fail-Pfad', () => {
  const gut = perfekt('gemuetlich');
  assert.equal(gut.state, 'complete');
  assert.equal(gut.treffer > 0 && gut.treffer === gut.plan.ereignisse.length, true,
    `${gut.treffer} von ${gut.plan.ereignisse.length}`);
  assert.equal(gut.patzer, 0);
  assert.equal(gut.verdikt.id, PROBE_VERDIKTE[0].id);
  assert.equal(gut.rows.find(([k]) => k === 'VERDIKT')[1], PROBE_VERDIKTE[0].name);

  const passiv = mache().probe;
  while (passiv.state === 'play') passiv.update(1 / 60);
  assert.equal(passiv.state, 'complete');
  assert.equal(passiv.treffer, 0);
  assert.equal(passiv.verdikt.id, PROBE_VERDIKTE[2].id);
  assert.equal(passiv.rows.find(([k]) => k === 'VERDIKT')[1], PROBE_VERDIKTE[2].name);
  assert.ok(passiv.zeit <= 75, `auch der schlechteste Lauf endet (${passiv.zeit.toFixed(1)}s)`);
});

test('Zustand: das Ergebnisfenster bekommt Treffer, Patzer, Quote und Verdikt', () => {
  const { probe, events } = mache();
  while (probe.state === 'play') probe.update(1 / 60);
  const abschluss = events.filter((e) => e.type === 'complete');
  assert.equal(abschluss.length, 1, 'genau ein Abschluss');
  const e = abschluss[0];
  assert.ok(e.stats && e.stats.verdikt && typeof e.stats.quote === 'number');
  const keys = e.rows.map(([k]) => k);
  assert.deepEqual(keys, ['TREFFER', 'PATZER', 'QUOTE', 'VERDIKT']);
  assert.ok(/%$/.test(e.rows.find(([k]) => k === 'QUOTE')[1]));
});

test('Zustand: Verdikt-Schwellen des Auftrags', () => {
  assert.equal(verdiktIndex(10, 0), 0, '80 % und wenige Patzer');
  assert.equal(verdiktIndex(8, 2), 0, 'genau 80 %');
  assert.equal(verdiktIndex(8, 3), 1, 'unter 80 % → durchgewinkt');
  assert.equal(verdiktIndex(9, 7), 1, 'über 80 %, aber mehr als sechs Patzer → nicht bestanden');
  assert.equal(verdiktIndex(11, 9), 1, 'genau 55 %');
  assert.equal(verdiktIndex(5, 5), 2, 'darunter → mutig');
  assert.equal(verdiktIndex(0, 20), 2);
  for (const v of PROBE_VERDIKTE) assert.ok(v.name && v.text, 'Verdikt ohne Text');
});

test('Zustand: Schwierigkeit wirkt auf die Fenster des laufenden Plans', () => {
  const leicht = mache({ difficulty: 'gemuetlich' }).probe;
  const schnell = mache({ difficulty: 'zuegig' }).probe;
  assert.ok(schnell.ablauf[0].fenster < leicht.ablauf[0].fenster);
  const diff = { trittWindow: 0.2 };
  schnell.setDifficulty('gibt-es-nicht');
  assert.equal(schnell.difficulty, 'zuegig', 'unbekannte Schwierigkeit darf nichts ändern');
  void diff;
});

// ---------------------------------------------------------- Registrierung ---
test('Registrierung: Station steht zwischen Finale und Nachtfahrt', () => {
  const ids = stationIds();
  const i5 = ids.indexOf('akt5');
  const ip = ids.indexOf('probe');
  const im = ids.indexOf('motorrad');
  assert.ok(i5 >= 0 && ip >= 0 && im >= 0);
  assert.equal(ip, i5 + 1, 'probe muss direkt nach Akt 5 stehen');
  assert.equal(im, ip + 1, 'die Nachtfahrt folgt der Probe');
  const st = STATIONEN.find((s) => s.id === 'probe');
  assert.equal(st.mode, 'probe');
  assert.equal(st.name, 'DIE LETZTE PROBE');
  assert.equal(st.ziel, 'DIE LETZTE PROBE BESTEHEN — EINSATZ UND OHROPAX IM TAKT');
  assert.equal(BELOHNUNGEN.probe.title, 'STILLE AUF DEM PULT');
  assert.ok(BELOHNUNGEN.probe.text.includes('Helm'));
});

test('Registrierung: Level ist baubar, Modus und Zahlen stimmen', () => {
  const level = buildProbeAusWorld();
  assert.equal(level.id, 'probe');
  assert.equal(level.mode, 'probe');
  assert.equal(level.name, 'DIE LETZTE PROBE');
  assert.equal(level.bpm, 88);
  assert.equal(level.dauer, PROBE_DAUER);
  const ausWorld = LEVELS.find((l) => l.id === 'probe');
  assert.ok(ausWorld && typeof ausWorld.build === 'function', 'world.js kennt die Station nicht');
  assert.equal(ausWorld.build().id, 'probe');
  // Kein Garderoben-Schritt: der Modus startet direkt (main.js) — die Station
  // braucht deshalb weder Spawns noch Garderobe.
  assert.equal(level.spawns, undefined);
  assert.equal(buildProbe().id, 'probe');
});

test('Musik: MOTIVE.probe hat 16 Takte, A/B-Form, verschiedene Nachbartakte, Puls', () => {
  const m = MOTIVE.probe;
  assert.ok(m, 'MOTIVE.probe fehlt');
  assert.equal(m.id, 'probe');
  assert.ok(STATIONEN_MUSIK.includes('probe'), 'STATIONEN_MUSIK kennt die Station nicht');
  assert.ok(m.lead.length >= 12 && m.bass.length >= 8);
  assert.ok(m.grund >= 24 && m.grund <= 84);
  assert.ok(m.titel && m.charakter && m.skizze && m.puls);
  assert.ok(m.vorlage.startsWith('eigenes '), `Vorlage ${m.vorlage}`);
  const form = formFuer('probe');
  assert.equal(form.takte, 16, 'die Form ist kürzer als 16 Takte');
  assert.equal(form.bTeil.von, 8, 'kein B-Teil in der Form');
  assert.equal(form.teile.map((t) => t.name).join(''), "AA'BA");
  // Nachbartakte verschieden: die Akkordfolge wechselt in jedem Takt.
  const akkorde = AKKORDE.probe;
  assert.equal(akkorde.length, 16);
  for (let i = 1; i < akkorde.length; i++) {
    assert.notEqual(akkorde[i], akkorde[i - 1], `Takt ${i + 1} klingt wie Takt ${i}`);
  }
  // Hörbarer Puls: jeder Viertel-Schlag ist im Taktplan verankert.
  const spt = schritteProTakt(m);
  for (const takt of [0, 1, 5, 9, 13]) {
    const p = taktplanFuer('probe', takt);
    assert.equal(p.schritte.length, spt);
    const puls = p.schritte.filter((s) => s.puls).length;
    assert.equal(puls, 4, `Takt ${takt + 1}: ${puls} Pulsschläge`);
    for (let i = 0; i < spt; i++) assert.equal(p.schritte[i].puls, i % 4 === 0);
  }
  // Zwei Nachbartakte sind auch in der Melodie nicht identisch.
  const a = JSON.stringify(taktplanFuer('probe', 0).schritte.map((s) => [s.lead, s.bass]));
  const b = JSON.stringify(taktplanFuer('probe', 1).schritte.map((s) => [s.lead, s.bass]));
  assert.notEqual(a, b, 'Takt 1 und 2 sind gleich');
});

test('Sprite: das Becken ist neu, rechteckig und ohne deckenden Rand', () => {
  const rows = SPRITES.becken;
  assert.ok(Array.isArray(rows) && rows.length >= 10, 'kein Becken-Sprite');
  const breite = rows[0].length;
  for (const r of rows) assert.equal(r.length, breite, `Zeile mit ${r.length} statt ${breite} Zeichen`);
  // Der Rand darf nicht deckend sein: PAL['.'] ist fast schwarz und stünde als
  // Kasten um die Figur. Geprüft wird deshalb der Rand — innen sind '.'-Augen
  // Teil der Zeichnung.
  const rand = [rows[0], rows[rows.length - 1], rows.map((r) => r[0]).join(''), rows.map((r) => r[r.length - 1]).join('')];
  for (const r of rand) assert.ok(!r.includes('.'), `".' im Becken-Rand: "${r}"`);
  assert.equal(rows[0].trim(), '', 'die oberste Zeile muss transparent bleiben');
  // Figuren, die die Szene zeichnet, haben ein Sprite.
  for (const f of ['dirigent', 'piccolo', 'sopran', 'becken', 'ohropax']) {
    assert.ok(SPRITES[f], `Sprite fehlt: ${f}`);
  }
});

test('Szene: baut ohne DOM und zeichnet die Figuren in fünf Spalten', () => {
  const zeichnung = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1,
    fillRect(x, y, w, h) { zeichnung.push({ x, y, w, h }); },
    drawImage() { zeichnung.push({ bild: true }); },
    beginPath() {}, arc() {}, stroke() {}, save() {}, restore() {}, translate() {},
  };
  const { probe, bis, druck } = mache();
  const erstes = probe.ablauf[0];
  bis(erstes.tEff + 0.1);
  const figuren = probe.figuren();
  assert.ok(figuren.length >= 1, 'keine Figur sichtbar');
  const f = figuren.find((x) => x.status === 'offen' || x.status === 'rise');
  assert.ok(f && f.x > 0 && f.x < 384 && f.y > 0 && f.y < 216, JSON.stringify(f));
  assert.ok(figuren.every((x) => x.spalte >= 0 && x.spalte < PROBE_SPALTEN));
  probe.draw(ctx);
  assert.ok(zeichnung.filter((z) => z.bild).length >= 1, 'die Figur wird nicht gezeichnet');
  druck(TASTE_FUER[erstes.taste]);
  assert.equal(probe.treffer, 1);
  // Nach dem Treffer blitzt die Figur noch kurz (Anzeige-Lebenslauf, DRR-P1b);
  // erst nach dem Blitzfenster ist sie vom Feld.
  probe.draw(ctx);
  assert.ok(zeichnung.length > 10, 'die Szene zeichnet zu wenig');
  assert.ok(satzBei(0).id === 'vom-blatt' && satzBei(69).id === 'coda');
  assert.ok(PROBE_SAETZE.every((s) => s.name && s.name === s.name.toUpperCase()));
});

console.log(`${passed} Probe-Tests bestanden`);
