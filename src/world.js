// world.js — Leveldaten. Akt 1: Die Katakomben (2. Untergeschoss).
//
// Aufbau: Das Level ist massiver Fels; alle begehbaren Räume werden
// herausgeschnitten. Dadurch gibt es keine Abkürzung am Boden entlang —
// der einzige Weg nach oben ist der Weg, der gebaut wurde:
//
//   Garderobe (Boden 25) → Notenblatt-Stufen (23/21/19) → oberer Gang (17)
//   → Luke (45) → unterer Gang (25) → Diensttür (86) → Archiv (19)
//   → Absperrband (101) → Obermaschinerie (17/15) → Endgang (13) → Aufzug (127)
//
// Jede Stufe ist höchstens 32 px hoch (Sprunghöhe 36 px), damit die Route
// in der Simulation nachweislich spielbar bleibt (siehe tests/smoke.test.mjs).
import { TILE } from './config.js';

const W = 132; // Kacheln breit
const H = 26;  // Kacheln hoch

const ONEWAY = 2;
const MORSCH = 3;

export function buildAkt1() {
  // 1 = Fels. Alles wird später freigeschnitten.
  const grid = [];
  for (let y = 0; y < H; y++) grid.push(new Array(W).fill(1));

  const spawns = [];
  const gates = [];
  const lights = [];
  const alcoves = [];
  const hints = [];

  /** Hohlraum aus dem Fels schneiden. */
  const carve = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (j >= 0 && j < H && i >= 0 && i < W) grid[j][i] = 0;
      }
    }
  };
  /** Begehbare Fläche / Plattform setzen. */
  const rect = (x, y, w, h, kind) => {
    const v = kind === '=' ? ONEWAY : kind === 'x' ? MORSCH : 1;
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (j >= 0 && j < H && i >= 0 && i < W) grid[j][i] = v;
      }
    }
  };
  const e = (kind, tx, surfaceRow, extra = {}) => spawns.push({ kind, tx, walkRow: surfaceRow - 1, ...extra });
  const lamp = (tx, ty) => lights.push({ x: (tx - 2) * TILE, y: ty * TILE, w: 5 * TILE, h: 4 * TILE });
  const alcove = (tx, ty, w = 2) => alcoves.push({ x: tx * TILE, y: ty * TILE, w: w * TILE, h: TILE });

  // ---------------------------------------------------------------- Hohlräume --
  carve(1, 20, 10, 5);        // Garderobe x1..10, Boden 25
  carve(11, 15, 12, 10);      // Stufenschacht x11..22
  carve(18, 13, 27, 4);       // oberer Gang x18..44 (4 Kacheln hoch für Sprünge)
  carve(45, 15, 5, 10);       // Luke x45..49 — Mund bis Kopfhöhe der Kante
  carve(45, 21, 42, 4);       // unterer Gang x45..86
  carve(87, 21, 21, 4);       // unterer Gang nach der Tür x87..107
  carve(87, 17, 7, 8);        // Archivschacht x87..93
  carve(93, 15, 15, 4);       // Archiv x93..107
  carve(103, 10, 15, 10);     // Endspurt-Schacht x103..117, hoch genug für Sprünge
  carve(114, 10, 16, 4);      // Endgang x114..129

  // ------------------------------------------------------------ Stufen/ Böden --
  rect(12, 23, 5, 1, '=');    // Stufe 1  Kante 368
  rect(17, 21, 5, 1, '=');    // Stufe 2  Kante 336
  rect(12, 19, 6, 1, '=');    // Stufe 3  Kante 304
  rect(18, 17, 27, 1);        // oberer Gang x18..44, Kante 272

  rect(88, 23, 3, 1, '=');    // Archiv Stufe 1, Kante 368
  rect(90, 21, 3, 1, '=');    // Archiv Stufe 2, Kante 336
  rect(88, 19, 3, 1, '=');    // Archiv Stufe 3, Kante 304
  rect(93, 19, 25, 1);        // Archivboden x93..117, Kante 304 (durchgehend)

  rect(104, 17, 4, 1, '=');   // Endspurt 1, Kante 272 (32 px über dem Boden)
  rect(108, 15, 4, 1, '=');   // Endspurt 2, Kante 240
  rect(112, 14, 4, 1, '=');   // Zwischenstufe, Kante 224 (16 px)
  rect(116, 13, 14, 1);       // Endboden x116..129, Kante 208 (16 px)

  // ------------------------------------------------------------- Besetzung --
  // A: Garderobe
  e('spawn', 3, 25, { isSpawn: true });
  e('item', 6, 25, { item: 'bierdeckel' });
  lamp(10, 21);
  e('stand', 11, 25);

  // B: oberer Gang
  e('stand', 23, 17);
  e('item', 24, 17, { item: 'bierdeckel' });
  e('piccolo', 27, 17, { patrol: [25, 31], dir: -1 });
  lamp(30, 14);
  e('koffer', 34, 17, { patrol: [32, 41] });
  e('item', 38, 17, { item: 'bierdeckel' });

  // C: unterer Gang
  e('checkpoint', 47, 25, { id: 'nach-der-luke' });
  e('item', 50, 25, { item: 'ohropax' });
  alcove(52, 24);
  e('sopran', 58, 25, { dir: -1 });
  alcove(63, 24);
  e('item', 66, 25, { item: 'wasser' });
  // Optionale Risiko-Kante: morsche Notenblätter mit Bierdeckel als Lohn
  rect(65, 23, 3, 1, 'x');
  e('item', 66, 23, { item: 'bierdeckel' });
  e('tenor', 75, 25, { patrol: [71, 80], dir: -1 });
  e('item', 80, 25, { item: 'wasser' });
  e('stand', 84, 25);

  // Diensttür: nur mit Anzug
  rect(86, 22, 1, 3);
  gates.push({ tx: 86, ty: 22, tw: 1, th: 3, need: 'anzug', open: false });

  // D: Archiv
  e('item', 95, 19, { item: 'wasser' });
  e('stand', 96, 19);
  lamp(98, 16);
  e('item', 99, 19, { item: 'bierdeckel' });
  rect(101, 17, 1, 2);
  gates.push({ tx: 101, ty: 17, tw: 1, th: 2, need: 'frack', open: false });
  e('piccolo', 104, 19, { patrol: [102, 106], dir: -1 });

  // E: Endgang, Obermaschinerie
  e('checkpoint', 119, 13, { id: 'obermaschinerie' });
  lamp(118, 10);
  e('item', 120, 13, { item: 'mappe' });
  e('stand', 121, 13);
  alcove(123, 12);
  e('sopran', 125, 13, { dir: -1 });

  // Ziel: Materialaufzug nach oben
  const goal = {
    x: 127 * TILE, y: 10 * TILE, w: TILE, h: 3 * TILE,
    name: 'MATERIALAUFZUG', need: 'mappe',
    locked: 'DER AUFZUG RÜHRT SICH NICHT. OHNE NOTENMAPPE FÄHRT ER NICHT.',
  };

  // Kontexttips
  const tip = (tileX, text) => hints.push({ x: tileX * TILE, text, shown: false });
  tip(1, 'A/D oder PFEILTASTEN GEHEN · SPACE SPRINGEN · E TRITT · P PAUSE');
  tip(4, 'BIERDECKEL SIND DIE SAMMELOBJEKTE');
  tip(9, 'KLEIDERSTÄNDER: DAVORSTELLEN UND E DRÜCKEN (HANDY: TRITT-KNOPF)');
  tip(12, 'JEDE STUFE IST SPRUNGHÖHE. NACH OBEN GEHT ES NUR HIER');
  tip(24, 'PICCOLO: SCHRILL UND GEMEIN. IM TAKT GETROFFEN WIRD ES STILL');
  tip(45, 'LUKE. ACHTUNG: ABSTIEG IST EINWEG — SPEICHERPUNKT UNTEN');
  tip(50, 'OHROPAX EINGESAMMELT. GEGEN EIN SOPRAN HILFT SONST NUR DECKUNG');
  tip(63, 'MORSCHE NOTENBLÄTTER: SCHNELL ZUGREIFEN, DANN BRICHT ES WEG');
  tip(69, 'TENOR: ZIEHT DAS TEMPO RUNTER. ALLES WIRD ZÄH');
  tip(83, 'DIENSTTÜR: NUR MIT ANZUG UND KRAWATTE');
  tip(100, 'ABSPERRBAND: NUR DER FRACK ÖFFNET SOWAS');
  tip(115, 'NOTENMAPPE MITNEHMEN — OHNE SIE FÄHRT DER AUFZUG NICHT');
  tip(126, 'AUFZUG NACH OBEN. ENDE AKT 1');

  return {
    id: 'akt1',
    name: 'AKT 1 — DIE KATAKOMBEN',
    setting: 'keller',
    subtitle: '2. Untergeschoss. Es riecht nach Staub und Notenpapier.',
    w: W, h: H,
    grid, spawns, gates, lights, alcoves, hints, goal,
    deckelTotal: spawns.filter((s) => s.kind === 'item' && s.item === 'bierdeckel').length,
  };
}

// ============================================================================
// AKT 2 — DIE PROBE
// Aufzug raus, durch den Flur in den Probenraum. Der Dirigent wirft Taktstöcke,
// im Saal gibt es zwei Wege: unten zwischen den Stühlen (Bodenkampf) oder oben
// über Notenpulte und Beleuchtungsbrücke (klettern). Zum Schluss führt nur der
// Frack durch die Bühnentür.
// ============================================================================
export function buildAkt2() {
  const W2 = 140;
  const H2 = 26;
  const grid = [];
  for (let y = 0; y < H2; y++) grid.push(new Array(W2).fill(1));

  const spawns = [];
  const gates = [];
  const lights = [];
  const alcoves = [];
  const hints = [];
  const takts = [];

  const carve = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (j >= 0 && j < H2 && i >= 0 && i < W2) grid[j][i] = 0;
      }
    }
  };
  const rect = (x, y, w, h, kind) => {
    const v = kind === '=' ? 2 : kind === 'x' ? 3 : 1;
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (j >= 0 && j < H2 && i >= 0 && i < W2) grid[j][i] = v;
      }
    }
  };
  const e = (kind, tx, surfaceRow, extra = {}) => spawns.push({ kind, tx, walkRow: surfaceRow - 1, ...extra });
  const lamp = (tx, ty) => lights.push({ x: (tx - 2) * TILE, y: ty * TILE, w: 5 * TILE, h: 4 * TILE });
  const alcove = (tx, ty, w = 2) => alcoves.push({ x: tx * TILE, y: ty * TILE, w: w * TILE, h: TILE });
  const tip = (tileX, text) => hints.push({ x: tileX * TILE, text, shown: false });

  // ---------------------------------------------------------------- Hohlräume --
  carve(1, 21, 24, 4);        // Flur x1..24
  carve(25, 11, 72, 14);      // Probensaal x25..96 (hoch genug für die Brücke)
  carve(97, 21, 28, 4);       // Hinterbühne x97..124

  // ------------------------------------------------------- Bühne und Brücke --
  rect(78, 19, 19, 1);        // Bühnenboden x78..96, Kante 304
  rect(73, 23, 3, 1, '=');    // Auftrittstufe 1, Kante 368
  rect(76, 21, 2, 1, '=');    // Auftrittstufe 2, Kante 336
  rect(54, 14, 43, 1);        // Beleuchtungsbrücke x54..96, Kante 224
  rect(88, 17, 3, 1, '=');    // Aufstieg zur Brücke 1, Kante 272
  rect(92, 15, 3, 1, '=');    // Aufstieg zur Brücke 2, Kante 240

  // Notenpulte im Saal: der obere Weg über den Stühlen.
  // Höchstens 32 px Höhe und eine Kachel Abstand — sonst ist es nicht springbar.
  rect(30, 23, 4, 1, '=');
  rect(35, 21, 4, 1, '=');
  rect(40, 19, 4, 1, '=');
  rect(45, 17, 4, 1, '=');
  rect(50, 16, 4, 1, '=');

  // Podium des Dirigenten
  rect(50, 23, 5, 2);

  // ------------------------------------------------------------- Besetzung --
  e('spawn', 4, 25, { isSpawn: true });
  e('stand', 8, 25);
  e('item', 12, 25, { item: 'bierdeckel' });
  lamp(10, 21);

  e('item', 36, 21, { item: 'bierdeckel' });
  e('item', 41, 19, { item: 'bierdeckel' });
  e('item', 70, 14, { item: 'bierdeckel' });   // auf der Beleuchtungsbrücke
  e('item', 106, 25, { item: 'bierdeckel' });

  lamp(40, 20);
  lamp(66, 12);               // Arbeitslicht über der Brücke
  lamp(84, 17);               // Bühnenlicht
  lamp(116, 21);

  e('dirigent', 52, 23, { dir: -1 });
  alcove(45, 24);
  e('sopran', 47, 25, { dir: -1 });
  alcove(58, 24);
  e('piccolo', 64, 25, { patrol: [62, 66], dir: -1 });
  e('piccolo', 68, 25, { patrol: [67, 71], dir: -1 });
  e('tenor', 84, 19, { patrol: [80, 92], dir: -1 });
  e('item', 70, 25, { item: 'wasser' });

  e('koffer', 102, 25, { patrol: [100, 108] });

  // Bühnentür: nur im Frack
  rect(112, 22, 1, 3);
  gates.push({ tx: 112, ty: 22, tw: 1, th: 3, need: 'frack', open: false });
  e('stand', 108, 25);
  e('item', 110, 25, { item: 'wasser' });

  const goal = {
    x: 120 * TILE, y: 21 * TILE, w: TILE, h: 3 * TILE,
    name: 'BÜHNENEINGANG', need: null,
    locked: '',
  };

  // Taktwechsel: der Dirigent bestimmt das Tempo
  takts.push({ x: 40 * TILE, bpm: 132, label: 'ALLEGRO — DER DIRIGENT ZIEHT AN' });
  takts.push({ x: 98 * TILE, bpm: 88, label: 'ANDANTE — ER WIRD LANGSAMER' });

  tip(1, 'AKT 2 — PROBENRAUM. HIER WIRD GEPROBT, AUCH MIT TAKTSTÖCKEN');
  tip(25, 'ZWEI WEGE: UNTEN ZWISCHEN DEN STÜHLEN ODER OBEN ÜBER DIE PULTE');
  tip(40, 'DER DIRIGENT WIRFT IM BOGEN — DUCK ODER SEITWÄRTS WEG');
  tip(50, 'IM TAKT GETROFFEN VERLIERT ER DEN TAKTSTOCK');
  tip(78, 'BÜHNE. VON HIER GEHT ES ÜBER DIE BELEUCHTUNGSBRÜCKE ZURÜCK');
  tip(100, 'HINTERBÜHNE. ZUM AUFTRITT NUR IM FRACK — AB HIER WIRD ES WARM');
  tip(119, 'BÜHNENEINGANG. ENDE AKT 2');

  return {
    id: 'akt2',
    name: 'AKT 2 — DIE PROBE',
    setting: 'saal',
    subtitle: 'Probenraum. Es riecht nach Kolophonium und Nervosität.',
    w: W2, h: H2,
    grid, spawns, gates, lights, alcoves, hints, takts, goal,
    bpm: 100,
    deckelTotal: spawns.filter((s) => s.kind === 'item' && s.item === 'bierdeckel').length,
  };
}

/** Alle Akte an einer Stelle — die Level sind reine Daten. */
// Stationen in Spielreihenfolge. `mode` gehört hierher, damit Werkzeuge und
// Oberfläche eine Station einordnen können, ohne sie erst zu bauen.
export const LEVELS = [
  { id: 'akt1', name: 'AKT 1 — DIE KATAKOMBEN', mode: 'sidescroller', build: buildAkt1 },
  { id: 'akt2', name: 'AKT 2 — DIE PROBE', mode: 'sidescroller', build: buildAkt2 },
  { id: 'cabrio', name: 'INTERLUDIUM — CABRIO ZUM OPEN AIR', mode: 'racer', build: buildCabrio },
  { id: 'akt3', name: 'AKT 3 — OPEN AIR', mode: 'sidescroller', build: buildAkt3 },
  { id: 'akt4', name: 'AKT 4 — DER ORCHESTERGRABEN', mode: 'sidescroller', build: buildAkt4 },
  { id: 'motorrad', name: 'INTERLUDIUM — MOTORRAD NACH HAUSE', mode: 'racer', build: buildMotorrad },
  { id: 'akt5', name: 'AKT 5 — DIE BÜHNE', mode: 'sidescroller', build: buildAkt5 },
  { id: 'epilog', name: 'EPILOG — DER KLEINGARTEN', mode: 'sidescroller', build: buildEpilog },
];

// ============================================================================
// INTERLUDIUM — CABRIO ZUM OPEN AIR
// Kein Seitenscroller, sondern eine Pseudo-3D-Strecke (modus: 'racer').
// Abendsonne, Landstraße, Gegenverkehr, ein Regenguss und der Notenständer
// auf dem Beifahrersitz.
// ============================================================================
export function buildCabrio() {
  const track = [];
  const part = (curve, hill, len) => track.push({ curve, hill, len });

  part(0, 0, 70);          // Anfahren aus der Stadt
  part(0, 24, 50);
  part(2, 0, 60);          // erste Rechtskurve
  part(0, -20, 40);
  part(-2, 0, 60);
  part(0, 18, 50);
  part(3, 0, 70);          // lange Rechtskurve
  part(0, -14, 40);
  part(-3, 0, 70);
  part(0, 26, 60);
  part(3, 0, 50);
  part(-3, 0, 50);         // S-Kurve
  part(0, -22, 50);
  part(4, 0, 60);          // eng und schnell
  part(0, 10, 40);
  part(-4, 0, 60);
  part(0, -12, 50);
  part(2, 0, 50);
  part(0, 6, 60);
  part(-1, 0, 50);         // Einfahrt Open-Air-Gelände
  part(0, 0, 60);          // Zielgerade

  return {
    id: 'cabrio',
    mode: 'racer',
    fahrzeug: 'mx5',
    name: 'INTERLUDIUM — CABRIO ZUM OPEN AIR',
    subtitle: 'Landstraße, Abendsonne, Notenständer auf dem Beifahrersitz.',
    bpm: 104,
    track,
    traffic: 14,
    weather: [{ at: 0.42, rain: true, label: 'REGENGUSS — WENIGER GRIP' },
              { at: 0.74, rain: false, label: 'DER REGEN LÄSST NACH' }],
    takts: [{ at: 0.6, bpm: 124, label: 'NOCH ZWÖLF MINUTEN BIS ZUM AUFTRITT' }],
    goals: { distance: null },
  };
}

// ============================================================================
// AKT 3 — OPEN AIR
// Freilichtbühne im Park. Neue Mechanik: das Wetter wechselt (Sonne, Wind,
// Regen, Kälte) und verändert das Spiel — Hitze im Frack, Windböen und
// fliegende Notenblätter, rutschiger Boden, steife Finger. Unter dem Vordach
// wird man wieder trocken; der Auftritt am Ende geht nur im Frack.
// ============================================================================
export function buildAkt3() {
  const W3 = 140;
  const H3 = 26;
  const grid = [];
  for (let y = 0; y < H3; y++) grid.push(new Array(W3).fill(1));

  const spawns = [];
  const gates = [];
  const lights = [];
  const alcoves = [];
  const hints = [];
  const shelters = [];

  const carve = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (j >= 0 && j < H3 && i >= 0 && i < W3) grid[j][i] = 0;
      }
    }
  };
  const rect = (x, y, w, h, kind) => {
    const v = kind === '=' ? 2 : kind === 'x' ? 3 : 1;
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (j >= 0 && j < H3 && i >= 0 && i < W3) grid[j][i] = v;
      }
    }
  };
  const e = (kind, tx, surfaceRow, extra = {}) => spawns.push({ kind, tx, walkRow: surfaceRow - 1, ...extra });
  const lamp = (tx, ty) => lights.push({ x: (tx - 2) * TILE, y: ty * TILE, w: 5 * TILE, h: 4 * TILE });
  const alcove = (tx, ty, w = 2) => alcoves.push({ x: tx * TILE, y: ty * TILE, w: w * TILE, h: TILE });
  const tip = (tileX, text) => hints.push({ x: tileX * TILE, text, shown: false });

  // ---------------------------------------------------------------- Hohlräume --
  carve(1, 20, 20, 5);        // Parkplatz x1..20
  carve(21, 18, 44, 7);       // Wiese x21..64
  carve(65, 8, 40, 17);       // Bühne und Gerüst x65..104
  carve(105, 21, 20, 4);      // Hinter der Bühne x105..124
  // Freiluft: über dem Gelände ist Himmel, kein Fels — muss VOR den Aufbauten
  // geschehen, sonst schneidet es Gerüst und Lichtbrücke weg.
  carve(1, 0, 123, 19);

  // ------------------------------------------------------- Bühne, Treppe, Turm --
  rect(30, 20, 15, 1);        // Vordach über der Wiese (Dach der Schutzzone)
  rect(65, 24, 3, 1);         // Treppenstufen zur Bühne (je 16 px)
  rect(68, 23, 3, 1);
  rect(71, 22, 3, 1);
  rect(74, 21, 3, 1);
  rect(77, 21, 18, 1);        // Bühnenboden x77..94, Kante 336
  rect(99, 23, 3, 1, '=');    // hinterer Aufgang zur Bühne, Kante 368

  // Gerüst über der Bühne (je 32 px). Die Lichtbrücke ist einseitig, damit
  // man von unten hinaufspringen kann, ohne sich den Kopf zu stoßen.
  rect(84, 19, 4, 1, '=');
  rect(88, 17, 4, 1, '=');
  rect(84, 15, 4, 1, '=');
  rect(88, 13, 4, 1, '=');
  rect(76, 11, 22, 1, '=');   // Lichtturm / Brücke x76..97, Kante 176

  // Vordach über der Wiese (Schutz vor Regen), solide
  rect(30, 19, 15, 1);
  shelters.push({ x: 30 * TILE, y: 20 * TILE, w: 15 * TILE, h: 5 * TILE });

  // ------------------------------------------------------------- Besetzung --
  e('spawn', 4, 25, { isSpawn: true });
  e('stand', 8, 25);
  e('item', 12, 25, { item: 'bierdeckel' });
  lamp(10, 21);

  e('item', 26, 25, { item: 'bierdeckel' });
  e('piccolo', 34, 25, { patrol: [32, 38], dir: -1 });
  e('item', 40, 25, { item: 'ohropax' });
  alcove(44, 24);
  e('sopran', 47, 25, { dir: -1 });
  e('item', 52, 25, { item: 'bierdeckel' });
  e('koffer', 57, 25, { patrol: [55, 61] });
  lamp(58, 20);

  lamp(80, 18);
  e('dirigent', 88, 21, { dir: -1 });
  e('tenor', 92, 21, { patrol: [79, 93], dir: -1 });
  e('item', 86, 21, { item: 'wasser' });
  e('item', 82, 11, { item: 'bierdeckel' });   // oben auf der Brücke
  lamp(90, 12);

  // Auftritt: nur im Frack
  rect(93, 9, 1, 3);
  gates.push({ tx: 93, ty: 9, tw: 1, th: 3, need: 'frack', open: false });
  e('stand', 89, 11);
  e('item', 96, 11, { item: 'bierdeckel' });

  // Hinter der Bühne
  e('koffer', 110, 25, { patrol: [107, 114] });
  e('item', 118, 25, { item: 'wasser' });
  e('piccolo', 121, 25, { patrol: [119, 123], dir: -1 });

  const goal = {
    x: 96 * TILE, y: 9 * TILE, w: TILE, h: 3 * TILE,
    name: 'PODIUM', need: null, locked: '',
  };

  // Das Wetter wechselt und verändert das Spiel
  const wetter = [
    { kind: 'sonne', dur: 20, label: 'SONNE — DER FRACK WIRD ZUR SAUNA' },
    { kind: 'wind', dur: 24, label: 'WIND — DIE NOTEN FLIEGEN' },
    { kind: 'regen', dur: 24, label: 'REGEN — DER BODEN WIRD RUTSCHIG' },
    { kind: 'kaelte', dur: 22, label: 'KÄLTE — DIE FINGER WERDEN STEIFF' },
  ];

  tip(1, 'AKT 3 — OPEN AIR. DAS WETTER MACHT HIER DIE MUSIK');
  tip(22, 'UNTER DEM VORDACH WIRD MAN WIEDER TROCKEN');
  tip(65, 'TREPPE HOCH AUF DIE BÜHNE — ODER HINTEN HERUM');
  tip(78, 'DAS GERÜST GEHT BIS ZUM LICHTTURM HINAUF');
  tip(86, 'DER DIRIGENT STEHT AUF DER BÜHNE. WIE IMMER');
  tip(92, 'ZUM AUFTRITT AM PODIUM NUR IM FRACK — UND DA OBEN BRENNT DIE SONNE');
  tip(119, 'HINTER DER BÜHNE. HIER STEHEN DIE KOFFER');

  return {
    id: 'akt3',
    mode: 'sidescroller',
    name: 'AKT 3 — OPEN AIR',
    setting: 'openair',
    subtitle: 'Freilichtbühne im Park. Das Wetter spielt mit — leider.',
    w: W3, h: H3,
    grid, spawns, gates, lights, alcoves, hints, shelters, weather: wetter,
    goal,
    bpm: 100,
    deckelTotal: spawns.filter((s) => s.kind === 'item' && s.item === 'bierdeckel').length,
  };
}

// ============================================================================
// AKT 4 — DER ORCHESTERGRABEN
// Nachtdienst in der Oper. Es ist dunkel, es ist eng, und irgendwo unten
// flüstert jemand den Text mit. Aufzüge (Versenkungen) sind der einzige Weg
// nach oben — wer die Versenkung verpasst, steht wieder im Graben.
// ============================================================================
export function buildAkt4() {
  const W = 140, H = 26;
  const grid = [];
  for (let y = 0; y < H; y++) grid.push(new Array(W).fill(1));
  const gates = [];
  const lights = [];
  const gleams = [];
  const alcoves = [];
  const spawns = [];
  const hints = [];
  const elevators = [];
  const spooks = [];
  const shelters = [];

  const solid = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) if (grid[j] && i >= 0 && i < W) grid[j][i] = 1;
    }
  };
  const plank = (x, y, w) => {
    for (let i = x; i < x + w; i++) if (grid[y] && i >= 0 && i < W) grid[y][i] = 2;
  };
  const morsch = (x, y, w) => {
    for (let i = x; i < x + w; i++) if (grid[y] && i >= 0 && i < W) grid[y][i] = 3;
  };
  const carve = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) if (grid[j] && i >= 0 && i < W) grid[j][i] = 0;
    }
  };
  const e = (kind, tx, surfaceRow, extra) => {
    spawns.push({ kind, tx, walkRow: surfaceRow - 1, ...(extra || {}) });
  };
  const lamp = (tx, ty) => lights.push({ x: (tx - 2) * 16, y: ty * 16, w: 5 * 16, h: 4 * 16 });
  const gleam = (tx, ty, r) => gleams.push({ tx, ty, r });
  const alcove = (tx, ty) => alcoves.push({ x: tx * 16, y: ty * 16, w: 32, h: 16 });
  const lift = (tx, topRow, bottomRow, w, period, phase) => {
    elevators.push({ tx, topRow, bottomRow, w, period, phase: phase || 0 });
  };
  const spook = (tx, ty, w, h) => spooks.push({ tx, ty, w, h });

  // ---------------------------------------------------------------- Hohlräume --
  carve(1, 21, 20, 4);        // Dienstgang x1..20
  carve(21, 10, 80, 15);      // Graben x21..100, rows 10..24
  carve(55, 8, 46, 4);        // Luft über dem Steg (Bühnenhöhe)
  carve(101, 21, 23, 4);      // Unterbühne dahinter x101..123

  // ------------------------------------------------------------ Stufen/Böden --
  // Notenpulte im Graben (je 32 px gestaffelt)
  plank(26, 23, 3);
  plank(31, 21, 3);
  plank(36, 19, 3);
  morsch(41, 23, 3);          // morsches Pult: kurz drauf, dann weg
  plank(56, 21, 3);
  plank(61, 19, 3);
  plank(66, 17, 3);
  // Podium des Dirigenten
  solid(72, 23, 5, 2);
  // Steg auf Bühnenhöhe (Kante 192) — nur per Versenkung erreichbar
  solid(55, 12, 4, 1);    // Steg links der Versenkung
  solid(63, 12, 38, 1);   // Steg rechts der Versenkung (Lücke x59..62)
  // Treppe in der Unterbühne
  plank(104, 23, 3);
  plank(108, 21, 3);
  solid(111, 20, 13, 1);

  // ------------------------------------------------------------- Besetzung ---
  e('spawn', 4, 25, { isSpawn: true });
  e('item', 9, 25, { item: 'bierdeckel' });
  e('stand', 14, 25);
  lamp(6, 22);
  gleam(8, 23, 4.5);

  e('item', 27, 23, { item: 'bierdeckel' });
  gleam(30, 23, 4);
  e('item', 22, 25, { item: 'ohropax' });   // Schutz, BEVOR der erste Schuetze kommt
  e('item', 36, 25, { item: 'brezel' });   // Nervennahrung vor der Enge
  lamp(38, 22);
  gleam(38, 23, 3.5);
  e('piccolo', 34, 25, { patrol: [33, 39], dir: -1 });  // Abstand zur Enge am Kasten
  solid(44, 24, 4, 1);        // Kasten steht auf dem Boden (vorher schwebende Platte)
  alcove(41, 24);             // Deckung kurz vor dem Kasten
  spook(44, 23, 4, 2);        // Souffleurkasten: es flüstert direkt am Ohr
  solid(44, 23, 4, 1);        // der Kasten selbst
  gleam(45, 22, 3);
  e('item', 68, 25, { item: 'brezel' });   // zweite Staerkung nach dem Kasten
  alcove(54, 24);             // Deckung vor dem Sopran
  e('sopran', 70, 25, { dir: -1 });   // Abstand zur Versenkung: beim Warten nicht beschossen werden
  alcove(47, 24);
  gleam(52, 23, 3.5);
  e('item', 57, 21, { item: 'bierdeckel' });
  lamp(58, 18);
  e('tenor', 62, 25, { patrol: [58, 67], dir: -1 });
  gleam(62, 23, 3.5);
  e('dirigent', 74, 23, { dir: -1 });
  lamp(74, 20);
  gleam(74, 22, 4);
  e('koffer', 84, 25, { patrol: [80, 90] });
  gleam(86, 23, 3.5);
  e('item', 89, 16, { item: 'bierdeckel' });
  e('piccolo', 92, 25, { patrol: [90, 96], dir: -1 });
  gleam(94, 23, 3.5);

  // Steg: Umkleide, Absperrband, Podium
  e('stand', 66, 12);
  e('item', 62, 12, { item: 'bierdeckel' });
  gleam(62, 11, 4);
  gleam(58, 24, 3.5);   // Licht an der Versenkung: man muss sehen, wo man einsteigt
  gleam(88, 24, 3);
  e('checkpoint', 58, 12, { id: 'steg' });
  gleam(62, 12, 4);   // Steg ausleuchten: hier zaehlt das Timing
  gleam(76, 12, 4);
  gleam(90, 12, 4);
  lamp(70, 9);
  gleam(72, 11, 4);
  gates.push({ tx: 82, ty: 9, tw: 1, th: 3, need: 'frack', open: false });
  solid(82, 9, 1, 3);
  e('sopran', 90, 12, { dir: -1 });
  alcove(87, 11);
  gleam(90, 11, 3.5);

  // Unterbühne
  e('item', 114, 20, { item: 'wasser' });
  e('koffer', 118, 25, { patrol: [115, 121] });
  gleam(108, 23, 3.5);
  gleam(115, 23, 3.5);
  lamp(112, 22);

  // Versenkungen
  lift(59, 12, 25, 4, 11, 0);      // Hauptversenkung: Unterkante bündig mit dem Boden (400)
  lift(88, 16, 25, 3, 7, 2.5);     // Requisitenaufzug: ebenfalls bündig

  const goal = {
    x: 96 * TILE, y: 10 * TILE, w: TILE, h: 2 * TILE,
    name: 'AUFTRITT', need: 'frack', locked: 'OHNE FRACK KEIN AUFTRITT. SO SIND DIE REGELN.',
  };

  // Taktwechsel im Graben
  const takts = [
    { x: 64 * TILE, bpm: 132, label: 'ALLEGRO — DER TAKTSTOCK TREIBT' },
    { x: 84 * TILE, bpm: 76, label: 'LARGO — ES WIRD FEIERLICH' },
  ];

  // Kontexttips
  const tip = (tileX, text) => hints.push({ x: tileX * TILE, text, shown: false });
  tip(2, 'AKT 4 — ORCHESTERGRABEN. HIER UNTEN SIEHT MAN NICHTS UND HÖRT ALLES');
  tip(20, 'DUNKEL. DIE KLEINEN NOTENPULTLAMPEN SIND DEINE AUGEN');
  tip(43, 'SOUFFLEURKASTEN: NICHT ZU NAHE RANGEHEN, ER FLÜSTERT MIT');
  tip(58, 'DIE VERSENKUNG FÄHRT HOCH. AUFSTEHEN UND MITFAHREN');
  tip(65, 'STEG ÜBER DEM GRABEN. HIER OBEN IST ES HELLER');
  tip(81, 'AUFTRITT NUR IM FRACK — ABER OBEN WIRD ES WARM');

  return {
    id: 'akt4',
    name: 'AKT 4 — DER ORCHESTERGRABEN',
    subtitle: 'Nachtdienst in der Oper. Dunkel, eng, und unten flüstert jemand mit.',
    setting: 'graben',
    dark: true,
    bpm: 96,
    w: W, h: H,
    grid, spawns, gates, lights, gleams, alcoves, hints, shelters, elevators, spooks, takts,
    deckelTotal: spawns.filter((sp) => sp.item === 'bierdeckel').length,
    goal,
  };
}

// ============================================================================
// INTERLUDIUM — MOTORRAD (Nachtfahrt)
// Nach der Oper geht es im Dunkeln nach Hause: Scheinwerferkegel, Tunnel,
// nasses Laub in den Kurven. Die Nachtluft kühlt den Hitzebalken herunter.
// ============================================================================
export function buildMotorrad() {
  const track = [];
  const push = (curve, hill, len) => track.push({ curve, hill, len });
  // Anfahren auf gerader Strecke
  push(0, 0, 70);
  push(0, 12, 40);
  // Schnelle Wechselkurven am Fluss
  push(-2, 0, 30); push(0, 0, 20);
  push(3, -14, 26); push(0, 0, 14);
  push(-3, 10, 26); push(0, 0, 16);
  // Gerade vor dem Tunnel
  push(0, 0, 50);
  // Im Tunnel: kurvig, eng
  push(2, 0, 30); push(-2, 0, 30); push(2, 8, 26); push(-1, -8, 24);
  push(0, 0, 40);
  // Waldstück mit nassem Laub
  push(4, 0, 30); push(0, 0, 20);
  push(-4, -10, 30); push(0, 0, 22);
  push(3, 12, 24); push(-3, 0, 24);
  push(0, 0, 40);
  // Schlusskurve und Zielgerade
  push(-2, 0, 26); push(2, 0, 26);
  push(0, 0, 90);

  // Tunnelbereich in Segmenten (nach dem Aufbau berechnet)
  const segmente = [[0, 0]];
  const segSum = (liste) => liste.reduce((s, t) => s + t.len, 0);
  let idx = 0;
  const tunnel = [];
  for (const t of track) {
    if (idx === 0) { /* Start */ }
    idx += t.len;
  }
  const gesamt = segSum(track);
  const tunnelVon = 70 + 40 + 30 + 20 + 26 + 14 + 26 + 16 + 50;
  const tunnelBis = tunnelVon + 30 + 30 + 26 + 24 + 40;
  tunnel.push({ from: tunnelVon, to: tunnelBis });

  const wetter = [
    { at: 0.02, rain: true, label: 'NIESELREGEN — DIE STRASSE GLÄNZT' },
    { at: 0.78, rain: false, label: 'DER REGEN HÖRT AUF. GUTE NACHT.' },
  ];

  return {
    id: 'motorrad',
    mode: 'racer',
    fahrzeug: 'motorrad',
    nacht: true,
    name: 'INTERLUDIUM — MOTORRAD NACH HAUSE',
    subtitle: 'Nach der Oper. Scheinwerfer, Tunnel, nasses Laub. Und endlich kühle Luft.',
    bpm: 112,
    track,
    gesamt,
    tunnel,
    weather: wetter,
    traffic: 26,
    roadside: 210,
    laub: 30,
    goalText: 'ZU HAUSE ANGEKOMMEN',
  };
}

// ============================================================================
// AKT 5 — DIE BÜHNE (DAS FINALE)
// Auftritt. Frack, Verfolgerscheinwerfer wandern über die Bühne und heizen ein,
// und der Applaus will verdient sein: im Takt getroffen wächst er, sonst fällt er.
// Am Ende wartet der Vorhang — und der Frack muss fallen.
// ============================================================================
export function buildAkt5() {
  const W = 140, H = 26;
  const grid = [];
  for (let y = 0; y < H; y++) grid.push(new Array(W).fill(1));
  const spawns = [], gates = [], lights = [], alcoves = [], hints = [], shelters = [];
  const movingLights = [];

  const carve = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (grid[j] && i >= 0 && i < W) grid[j][i] = 0;
  };
  const solid = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (grid[j] && i >= 0 && i < W) grid[j][i] = 1;
  };
  const plank = (x, y, w) => {
    for (let i = x; i < x + w; i++) if (grid[y] && i >= 0 && i < W) grid[y][i] = 2;
  };
  const e = (kind, tx, surfaceRow, extra) => spawns.push({ kind, tx, walkRow: surfaceRow - 1, ...(extra || {}) });
  const lamp = (tx, ty) => lights.push({ x: (tx - 2) * 16, y: ty * 16, w: 5 * 16, h: 4 * 16 });
  const alcove = (tx, ty) => alcoves.push({ x: tx * 16, y: ty * 16, w: 32, h: 16 });
  const spot = (ty, x0, x1, speed) => movingLights.push({ y: ty, x0, x1, speed, w: 4, h: 4, x: x0 });

  // ---------------------------------------------------------------- Hohlräume --
  carve(1, 21, 18, 4);       // Hinterbühne
  carve(19, 14, 40, 11);     // Gassen zwischen den Kulissen
  carve(59, 10, 60, 15);     // Bühne (hoch, fuer die Obermaschinerie)

  // ------------------------------------------------------------------ Aufbau --
  // Kulissen und Stufen in den Gassen (je 32 px)
  solid(24, 23, 3, 2);       // Kulisse, Kante 368
  plank(28, 21, 3);          // Kante 336
  solid(32, 20, 3, 5);       // Kulisse, Kante 320
  plank(36, 19, 3);          // Kante 304
  plank(41, 17, 3);          // Kante 272
  solid(45, 16, 14, 1);      // Schnuerboden (Steg unter dem Dach), Kante 256
  // Aufgang zur Buehne, links vom Buehnenboden (sonst steckt der Kopf darin)
  plank(56, 23, 3);          // Kante 368
  solid(59, 21, 60, 1);      // Buehnenboden x59..118, Kante 336
  solid(76, 20, 5, 1);       // Podium des Dirigenten auf der Buehne
  // Zuschauerraum als dunkle Andeutung
  carve(119, 22, 20, 3);
  solid(119, 21, 20, 1);

  // ------------------------------------------------------------- Besetzung ---
  e('spawn', 4, 25, { isSpawn: true });
  e('item', 13, 25, { item: 'bierdeckel' });
  e('stand', 9, 25);
  lamp(7, 22);
  e('koffer', 22, 25, { patrol: [20, 26] });
  e('item', 30, 21, { item: 'bierdeckel' });
  e('piccolo', 34, 25, { patrol: [31, 38], dir: -1 });
  e('item', 42, 16, { item: 'bierdeckel' });
  e('tenor', 50, 25, { patrol: [46, 55], dir: -1 });
  lamp(52, 20);
  e('checkpoint', 45, 16, { id: 'schnuerboden' });

  e('dirigent', 78, 20, { dir: -1 });
  lamp(78, 17);
  e('item', 86, 21, { item: 'bierdeckel' });
  e('piccolo', 88, 21, { patrol: [85, 92], dir: -1 });
  e('item', 95, 21, { item: 'wasser' });
  e('piccolo', 100, 21, { patrol: [97, 103], dir: -1 });
  e('sopran', 108, 21, { dir: -1 });
  alcove(105, 20);
  e('item', 104, 21, { item: 'bierdeckel' });

  // Verfolgerscheinwerfer: wandern und heizen ein
  spot(19, 62, 90, 6);
  spot(17, 74, 106, -7);
  spot(15, 60, 98, 9);

  const goal = {
    x: 112 * TILE, y: 19 * TILE, w: TILE, h: 3 * TILE,
    name: 'VORHANG', need: 'frack', applaus: 60, frackOff: true,
    locked: 'ZU WENIG APPLAUS. UND DER FRACK IST NOCH ZU.',
  };

  const takts = [
    { x: 60 * TILE, bpm: 140, label: 'ALLEGRO FOCOSO — DIE SCHEINWERFER JAGEN' },
    { x: 96 * TILE, bpm: 88, label: 'DAS FINALE — JETZT GANZ RUHIG' },
  ];

  const tip = (tileX, text) => hints.push({ x: tileX * TILE, text, shown: false });
  tip(2, 'AKT 5 — DIE BÜHNE. AUFTRITT IM FRACK, MEHR IST NICHT ZU TUN');
  tip(20, 'KULISSEN. HINTER JEDER KANN EINER STEHEN');
  tip(44, 'SCHNÜRBODEN. VON HIER SIEHT MAN DIE GANZE BÜHNE');
  tip(60, 'VERFOLGERSCHEINWERFER: IM LICHT WIRD DER FRACK ZUR HEIZUNG');
  tip(84, 'APPLAUS: IM TAKT GETROFFEN WÄCHST ER. DAS IST DEIN AUFTRITT');
  tip(110, 'DER VORHANG GEHT NUR AUF, WENN DER FRACK FÄLLT');

  return {
    id: 'akt5',
    name: 'AKT 5 — DIE BÜHNE',
    subtitle: 'Das Finale. Frack, Verfolgerlicht und ein Applaus, der verdient sein will.',
    setting: 'buehne',
    applaus: true,
    bpm: 104,
    w: W, h: H,
    grid, spawns, gates, lights, alcoves, hints, shelters, movingLights, takts,
    deckelTotal: spawns.filter((sp) => sp.item === 'bierdeckel').length,
    goal,
  };
}

// ============================================================================
// EPILOG — DER KLEINGARTEN
// Keine Gegner, kein Takt, kein Frack. Eine Bank, ein Bier, ein Grill — und
// Ramona, die schon wartet. Hier endet das Spiel.
// ============================================================================
export function buildEpilog() {
  const W = 120, H = 26;
  const grid = [];
  for (let y = 0; y < H; y++) grid.push(new Array(W).fill(1));
  const spawns = [], gates = [], lights = [], alcoves = [], hints = [], shelters = [];

  const carve = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (grid[j] && i >= 0 && i < W) grid[j][i] = 0;
  };
  const solid = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (grid[j] && i >= 0 && i < W) grid[j][i] = 1;
  };
  const plank = (x, y, w) => {
    for (let i = x; i < x + w; i++) if (grid[y] && i >= 0 && i < W) grid[y][i] = 2;
  };
  const e = (kind, tx, surfaceRow, extra) => spawns.push({ kind, tx, walkRow: surfaceRow - 1, ...(extra || {}) });

  carve(1, 0, 118, 25);      // Himmel und Garten

  // Laube mit Stufe
  solid(70, 19, 16, 1);      // Laubendach, Kante 304
  solid(70, 19, 2, 2);       // Pfosten links (Durchgang in Bodenhöhe frei)
  solid(84, 19, 2, 2);       // Pfosten rechts
  plank(74, 22, 4);          // Stufe zur Laube, Kante 352
  // Bank und Grill
  solid(40, 23, 6, 2);       // Bank, Kante 368
  solid(52, 23, 4, 2);       // Grill, Kante 368
  // Hecke als Begrenzung der Wiese
  solid(30, 23, 2, 2);       // Hecke: 32 px, springbar (vorher 48 px = Sackgasse)
  solid(96, 23, 2, 2);       // Hecke am Ende, gleiche Höhe
  plank(100, 22, 3);

  e('spawn', 4, 25, { isSpawn: true });
  e('item', 12, 25, { item: 'bierdeckel' });
  e('item', 26, 25, { item: 'bierdeckel' });
  e('item', 44, 23, { item: 'bier' });
  e('grill', 54, 23);
  e('ramona', 58, 25);
  e('item', 74, 22, { item: 'bierdeckel' });
  e('item', 88, 25, { item: 'bierdeckel' });
  e('item', 102, 22, { item: 'bierdeckel' });
  e('stand', 20, 25);

  const goal = {
    x: 78 * TILE, y: 22 * TILE, w: TILE * 2, h: TILE * 2,
    name: 'DIE BANK', need: null,
    locked: '',
  };

  const tip = (tileX, text) => hints.push({ x: tileX * TILE, text, shown: false });
  tip(2, 'EPILOG — DER KLEINGARTEN. KEIN TAKT, KEIN FRACK, KEIN WEG MEHR NÖTIG');
  tip(38, 'DIE BANK UNTER DEM APFELBAUM. UND EIN BIER STEHT SCHON DA');
  tip(50, 'DER GRILL: BRATWÜRSTE IM TAKT WENDEN. ES GEHT AUCH OHNE TAKT');
  tip(56, 'RAMONA WARTET SCHON. SIE HAT DAS BESSERE MESSER');

  return {
    id: 'epilog',
    name: 'EPILOG — DER KLEINGARTEN',
    subtitle: 'Bank, Bier, Bratwurst — und Ramona.',
    setting: 'garten',
    bpm: 76,
    ruhig: true,
    w: W, h: H,
    grid, spawns, gates, lights, alcoves, hints, shelters, takts: [],
    deckelTotal: spawns.filter((sp) => sp.item === 'bierdeckel').length,
    goal,
  };
}
