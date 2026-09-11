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
  const goal = { x: 127 * TILE, y: 10 * TILE, w: TILE, h: 3 * TILE };

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
