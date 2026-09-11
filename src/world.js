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
    subtitle: 'Probenraum. Es riecht nach Kolophonium und Nervosität.',
    w: W2, h: H2,
    grid, spawns, gates, lights, alcoves, hints, takts, goal,
    bpm: 100,
    deckelTotal: spawns.filter((s) => s.kind === 'item' && s.item === 'bierdeckel').length,
  };
}

/** Alle Akte an einer Stelle — die Level sind reine Daten. */
export const LEVELS = [
  { id: 'akt1', name: 'AKT 1 — DIE KATAKOMBEN', build: buildAkt1 },
  { id: 'akt2', name: 'AKT 2 — DIE PROBE', build: buildAkt2 },
  { id: 'cabrio', name: 'INTERLUDIUM — CABRIO ZUM OPEN AIR', build: buildCabrio },
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
