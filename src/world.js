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
import { STATIONEN } from './story.js';
import { buildAkt1 } from './act1.js';
import { buildAkt2, PROBEN_MOTIV } from './act2.js';
import { buildAkt3 } from './act3.js';
import { buildAkt4 } from './act4.js';
export { buildAkt1 } from './act1.js';
export { buildAkt2, PROBEN_MOTIV };
export { buildAkt3 } from './act3.js';
export { buildAkt4 } from './act4.js';

/** Alle Akte an einer Stelle — die Level sind reine Daten. */
// Stationen in Spielreihenfolge. `mode` gehört hierher, damit Werkzeuge und
// Oberfläche eine Station einordnen können, ohne sie erst zu bauen.
// Reihenfolge, Namen und Ziele stehen in story.js — hier hängt jede Station an
// ihrem Levelbauer. Akt 5 (Finale) kommt vor der Motorrad-Nachtfahrt: die
// Heimfahrt ist der echte Heimweg (Entscheidung 5.1).
const BAUER = {
  akt1: buildAkt1, akt2: buildAkt2, cabrio: buildCabrio, akt3: buildAkt3,
  akt4: buildAkt4, akt5: buildAkt5, probe: buildProbe, motorrad: buildMotorrad, epilog: buildEpilog,
};

export const LEVELS = STATIONEN.map((st) => ({ ...st, build: BAUER[st.id] }));

// ============================================================================
// INTERLUDIUM — CABRIO ZUM OPEN AIR
// Kein Seitenscroller, sondern eine Pseudo-3D-Strecke (modus: 'racer').
// Abendsonne, Landstraße, Gegenverkehr, ein Regenguss und der Notenständer
// auf dem Beifahrersitz.
// ============================================================================
import { buildCabrioJourney as buildCabrio } from './cabrio.js';
export { buildCabrio };

// ============================================================================
// INTERLUDIUM — MOTORRAD (Nachtfahrt)
// Nach der Oper geht es im Dunkeln nach Hause: Scheinwerferkegel, Tunnel,
// nasses Laub in den Kurven. Die Nachtluft kühlt den Hitzebalken herunter.
// ============================================================================
import { buildMotorradJourney as buildMotorrad } from './motorrad.js';
export { buildMotorrad };

// ============================================================================
// DIE LETZTE PROBE (DRR-P1)
// Nach dem Finale lässt der Dirigent nicht ohne eine letzte Probe gehen: ein
// Whack-a-Mole am Bühnenrand, zwei Tasten (EINSATZ/OHROPAX), kein Fail-Zustand.
// Die Szene selbst steht in src/probe.js und ist ohne DOM prüfbar.
// ============================================================================
import { buildProbe } from './probe.js';
export { buildProbe };

// ============================================================================
// AKT 5 — DIE BÜHNE (DAS FINALE)
// Auftritt im Frack, Verfolgerscheinwerfer wandern über die Bühne und heizen ein.
// Der Applaus entsteht aus der Aufführung (Auftrag A5): am Pult am Bühnenrand
// wird das in Akt 2 gelernte Probenmotiv gespielt, das Ensemble antwortet, der
// Applaus steigt in klaren Stufen. Das Betäuben der Musiker trägt keinen Applaus
// mehr ein, und der Applaus verfällt nicht mehr von selbst — wer noch sucht, was
// zu tun ist, verliert nichts. Am Ende wartet der Vorhang: den Frack ablegen,
// ohne künstliche Überhitzung.
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

  // Die Zugabe (Auftrag A5): am Bühnenrand steht das Pult. Hier wird das in
  // Akt 2 gelernte Probenmotiv gespielt — im Takt, in fünf Einsätzen. Das
  // Ensemble antwortet, der Applaus steigt in Stufen. Der erste Punkt, den der
  // Spieler auf der Bühne erreicht, ist damit auch der erste Schritt des Finales.
  const zugabe = { noetig: 5, proSchritt: 12, motiv: PROBEN_MOTIV.id, pultTx: 62 };
  e('pult', zugabe.pultTx, 21, {
    noetig: zugabe.noetig, proSchritt: zugabe.proSchritt, motiv: zugabe.motiv,
    zugabe: true, aktion: 'ZUGABE',
  });

  // Verfolgerscheinwerfer: wandern und heizen ein
  spot(19, 62, 90, 6);
  spot(17, 74, 106, -7);
  spot(15, 60, 98, 9);

  const goal = {
    x: 112 * TILE, y: 19 * TILE, w: TILE, h: 3 * TILE,
    name: 'VORHANG', need: 'ablegen', applaus: 60,
    // Der Vorhang verlangt die gespielte Zugabe (Auftrag A5), nicht Applaus aus
    // betäubten Musikern. Hitze kommt hier nirgends vor: Ablegen ist ein Schritt.
    flags: ['zugabe_gespielt'],
    flagLocked: 'ERST DIE ZUGABE SPIELEN — AM PULT, IM TAKT (E) — UND DER FRACK MUSS AM VORHANG FALLEN.',
    locked: 'DER VORHANG GEHT NUR AUF, WENN DIE ZUGABE GESPIELT IST UND DER FRACK FÄLLT.',
    needLocked: 'OHNE FRACK KEIN AUFTRITT. NUR IM FRACK GEHT DER VORHANG AUF.',
  };

  const takts = [
    { x: 60 * TILE, bpm: 140, label: 'ALLEGRO FOCOSO — DIE SCHEINWERFER JAGEN' },
    { x: 96 * TILE, bpm: 88, label: 'DAS FINALE — JETZT GANZ RUHIG' },
  ];

  const tip = (tileX, text) => hints.push({ x: tileX * TILE, text, shown: false });
  tip(2, 'AKT 5 — DIE BÜHNE. AUFTRITT IM FRACK: ZUGABE SPIELEN, DANN FRACK ABLEGEN');
  tip(20, 'KULISSEN. HINTER JEDER KANN EINER STEHEN');
  tip(44, 'SCHNÜRBODEN. VON HIER SIEHT MAN DIE GANZE BÜHNE');
  tip(52, 'DER BÜHNENRAND: AM PULT STARTET DIE ZUGABE — IM TAKT E DRÜCKEN');
  tip(60, 'VERFOLGERSCHEINWERFER: IM LICHT WIRD DER FRACK ZUR HEIZUNG');
  tip(62, 'ZUGABE: AM PULT STEHEN UND IM TAKT E DRÜCKEN — FÜNF EINSÄTZE, DANN STEHT DER APPLAUS');
  tip(84, 'APPLAUS KOMMT AUS DER ZUGABE. BETÄUBTE MUSIKER TRAGEN KEINEN BEI');
  tip(110, 'DER VORHANG GEHT AUF, WENN DU DEN FRACK ABLEGST (E) — HITZE IST EGAL');

  return {
    id: 'akt5',
    name: 'AKT 5 — DIE BÜHNE',
    subtitle: 'Das Finale. Frack, Verfolgerlicht — und eine Zugabe, die den Applaus verdient.',
    setting: 'buehne',
    applaus: true,
    zugabe,
    bpm: 104,
    w: W, h: H,
    grid, spawns, gates, lights, alcoves, hints, shelters, movingLights, takts,
    deckelTotal: spawns.filter((sp) => sp.item === 'bierdeckel').length,
    goal,
    // Das Journal führt Schritt für Schritt: erst die Zugabe (der Applaus-Stand
    // ist der Zähler), dann der Vorhang. Kein Sammelziel — der Akt endet auch
    // ohne einen einzigen Bierdeckel.
    storySteps: [
      { id: 'zugabe', text: 'DIE ZUGABE SPIELEN — AM PULT, IM TAKT (E)', counter: 'applaus', atLeast: 60 },
      { id: 'vorhang', text: 'DEN FRACK AM VORHANG ABLEGEN (E)', goal: true },
    ],
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

  // Laube mit Stufe und Bank: hier endet der Weg.
  solid(70, 19, 16, 1);      // Laubendach, Kante 304
  solid(70, 19, 2, 2);       // Pfosten links (Durchgang in Bodenhöhe frei)
  solid(84, 19, 2, 2);       // Pfosten rechts
  // Bank unter der Laube — und genau hier steht auch das Ziel (Befund D5:
  // vorher lag die Bank bei Kachel 40, das Ziel „DIE BANK" aber bei Kachel 78).
  // Eine Kachel hoch: im Garten darf der Schluss keine Sprungprüfung sein.
  solid(75, 24, 5, 1);       // Bank, Kante 384
  // Grill
  solid(52, 23, 4, 2);       // Grill, Kante 368
  // Hecke als Begrenzung der Wiese
  solid(30, 23, 2, 2);       // Hecke: 32 px, springbar (vorher 48 px = Sackgasse)
  solid(96, 23, 2, 2);       // Hecke am Ende, gleiche Höhe
  plank(100, 22, 3);

  e('spawn', 4, 25, { isSpawn: true });
  e('item', 12, 25, { item: 'bierdeckel' });
  e('item', 26, 25, { item: 'bierdeckel' });
  e('item', 62, 25, { item: 'bierdeckel' });
  e('grill', 54, 23);
  // Ramona hat das Bier schon in der Hand (Auftrag „Epilog-Ramona"): sie reicht
  // es auf Knopfdruck herüber. Auf der Bank steht deshalb keine Flasche mehr.
  e('ramona', 66, 25, { bier: true });
  e('schrank', 82, 25);                     // hier hängt der Frack, für immer
  e('item', 88, 25, { item: 'bierdeckel' });
  e('item', 102, 22, { item: 'bierdeckel' });
  // Kein Kleiderständer im letzten Akt: im Kleingarten gibt es keine freie
  // Kleiderauswahl mehr, nur den Kleiderschrank (Frack <-> Zivil, mit der
  // Umzieh-Szene CUT-1b). In allen anderen Akten bleibt der Ständer, wo er war.
  // Der Kleiderschrank: der Garten-Interaktionspunkt für Zivil. Steht frei auf
  // der Wiese, damit er nicht mit dem Schrank der Laube (dort hängt der Frack)
  // verwechselt wird.
  e('garderobe', 36, 25);

  const goal = {
    x: 73 * TILE, y: 23 * TILE, w: TILE * 6, h: TILE * 2,
    name: 'DIE BANK', need: 'setzen', bench: true,
    locked: 'ERST HINSETZEN: HIER STEHT DIE BANK (E).',
  };

  const tip = (tileX, text) => hints.push({ x: tileX * TILE, text, shown: false });
  tip(2, 'EPILOG — DER KLEINGARTEN. KEIN TAKT, KEINE HITZE, KEIN WEG MEHR NÖTIG');
  tip(33, 'DER KLEIDERSCHRANK: HIER ZIEHST DU ZIVIL AN — SHORTS UND HAWAII-HEMD (E)');
  tip(46, 'DER GRILL: BRATWÜRSTE WENDEN. ES GEHT AUCH OHNE TAKT');
  tip(56, 'RAMONA WARTET SCHON. SIE HAT DAS BIER IN DER HAND (E)');
  tip(70, 'DIE BANK UNTER DER LAUBE: HINSETZEN (E) — RAMONA KOMMT DAZU');
  tip(81, 'DER SCHRANK DER LAUBE: HIER HÄNGT DER FRACK. FÜR IMMER (E)');

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
