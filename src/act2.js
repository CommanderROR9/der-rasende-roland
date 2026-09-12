// act2.js — Musterstrecke nach Vorbild von Akt 1: eigener Handlungsbogen,
// klar unterscheidbare Räume, eine Mechanik pro Abschnitt, sichtbare Folgen,
// kurzer Rückbezug am Ende. Geometrie der bestehenden Akt-2-Räume bleibt
// erhalten (Flur, Probensaal mit zwei Wegen, Bühne, Hinterbühne); ausgebaut
// werden Handlung (Anna führt die Probe), Story-Gates, Journal und Dekor.
import { TILE } from './config.js';

// Kurzes Motiv des gemeinsamen Einsatzes: drei Takte im Takt. Bereits
// gelungene Teile bleiben am Pult erhalten; ein danebengegangener Versuch
// kostet nichts und gibt eine Pointe statt Neustart (siehe game.js,
// einsatzVersuch). Das Motiv wird im Finale (Akt 5) wiedererkannt —
// deshalb als exportierte Konstante, damit Akt 5 es zitieren kann.
export const PROBEN_MOTIV = {
  id: 'probe-motiv',
  teile: 3,
  merk: 'DREI TAKTE IM TAKT — DAS FINALE ZITIERT DAS MOTIV',
  akt5: 'zitierbar in Akt 5',
};

const W = 140;
const H = 26;

export function buildAkt2() {
  const grid = [];
  for (let y = 0; y < H; y++) grid.push(new Array(W).fill(1));
  const spawns = [], gates = [], lights = [], alcoves = [], hints = [];
  const takts = [];

  const carve = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (j >= 0 && j < H && i >= 0 && i < W) grid[j][i] = 0;
    }
  };
  const rect = (x, y, w, h, kind) => {
    const v = kind === '=' ? 2 : kind === 'x' ? 3 : 1;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (j >= 0 && j < H && i >= 0 && i < W) grid[j][i] = v;
    }
  };
  const e = (kind, tx, surfaceRow, extra = {}) => spawns.push({ kind, tx, walkRow: surfaceRow - 1, ...extra });
  const lamp = (tx, ty) => lights.push({ x: (tx - 2) * TILE, y: ty * TILE, w: 5 * TILE, h: 4 * TILE });
  const alcove = (tx, ty, w = 2) => alcoves.push({ x: tx * TILE, y: ty * TILE, w: w * TILE, h: TILE });
  const decor = (spr, tx, surfaceRow, extra = {}) => e('decor', tx, surfaceRow, { spr, ...extra });
  const tip = (tileX, text) => hints.push({ x: tileX * TILE, text, shown: false });

  // ---------------------------------------------------------------- Hohlräume --
  // Bestehende Räume, nicht ersetzt: Flur, Probensaal (zwei Wege), Hinterbühne.
  carve(1, 21, 24, 4);        // Flur x1..24 (Auftakt, Anna-Briefing)
  carve(25, 11, 72, 14);      // Probensaal x25..96 (unten Stuhlreihen, oben Pulte/Brücke)
  carve(97, 21, 28, 4);       // Hinterbühne x97..124 (Frack, Bühnentür, Anna-Payoff)

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

  // A · Flur — ruhiger Auftakt. Anna gibt den Probenauftrag; erst danach
  // öffnet sich die Tür zum Probensaal (Story-Gate wie in Akt 1).
  e('spawn', 4, 25, { isSpawn: true });
  e('stand', 8, 25);
  e('item', 12, 25, { item: 'bierdeckel' });
  e('npc', 14, 25, {
    npc: 'ada', spr: 'ada', name: 'ANNA', flag: 'probe_beauftragt',
    dialog: [
      'ROLAND! DIE MAPPE GEHÖRT AUF DAS PULT.',
      'DREI TAKTE. GEMEINSAMER EINSATZ. DANN DIE BÜHNENTÜR.',
      'UND BLEIB IM TAKT. DAS ORCHESTER FOLGT NUR EINEM KLAREN EINSATZ.',
    ],
    after: 'MAPPE AUF DAS PULT. DREI TAKTE. ICH HÖRE ZU.',
  });
  // Freundliche narrative Schranke wie in Akt 1: nicht die Figur blockiert,
  // sondern die Saaltür am Ende des Flurs. Annas Auftrag entriegelt sie.
  rect(24, 21, 1, 4);
  gates.push({
    tx: 24, ty: 21, tw: 1, th: 4, flag: 'probe_beauftragt', open: false,
    locked: 'ERST MIT ANNA SPRECHEN. SIE HAT DEN SCHLÜSSEL ZUM PROBENSAAL.',
    opened: 'ANNA ÖFFNET DIE TÜR ZUM PROBENSAAL.',
  });
  decor('probentafel', 2, 25);
  lamp(10, 21);

  // B · Stuhlreihen unten — Bodenkampf zwischen den Stühlen (Dirigent, Sopran).
  // Mechanik: Rhythmus-Parry im Takt, Deckung in den Nischen.
  e('item', 36, 21, { item: 'bierdeckel' });
  e('item', 41, 19, { item: 'bierdeckel' });
  e('dirigent', 52, 23, { dir: -1 });
  e('sopran', 47, 25, { dir: -1 });
  alcove(45, 24);
  alcove(58, 24);
  e('checkpoint', 60, 25, { id: 'stuhlreihen' });
  decor('stuhlreihe', 30, 25);

  // C · Notenpulte und Beleuchtungsbrücke — oberer Weg über den Stühlen.
  // Mechanik: Springen und Klettern in Sprunghöhe, beidseitig begehbar.
  e('piccolo', 64, 25, { patrol: [62, 66], dir: -1 });
  e('piccolo', 68, 25, { patrol: [67, 71], dir: -1 });
  e('item', 70, 14, { item: 'bierdeckel' });   // auf der Beleuchtungsbrücke
  e('item', 70, 25, { item: 'wasser' });
  decor('notenpult', 44, 17);
  decor('scheinwerfer', 66, 14);
  lamp(40, 20);
  lamp(66, 12);               // Arbeitslicht über der Brücke

  // D · Bühne und Pult — der gemeinsame Einsatz. Die Notenmappe reist aus
  // Akt 1 im Spielstand an und wird hier abgegeben; danach drei Takte (E).
  // Mechanik: Einsatz im Takt, gelungene Teile bleiben erhalten.
  e('pult', 56, 25, { noetig: 3, motiv: PROBEN_MOTIV.id });
  e('tenor', 84, 19, { patrol: [80, 92], dir: -1 });
  alcove(78, 18);
  lamp(84, 17);               // Bühnenlicht

  // E · Hinterbühne — Frack anziehen, Anna-Payoff, Bühneneingang.
  // Mechanik: Kleidung als Werkzeug; Rückbezug: das Motiv bleibt bis Finale.
  e('koffer', 102, 25, { patrol: [100, 108] });
  e('item', 106, 25, { item: 'bierdeckel' });
  e('checkpoint', 97, 25, { id: 'hinterbuehne' });
  alcove(96, 24);
  decor('buehnenvorhang', 99, 25);
  lamp(116, 21);
  rect(112, 22, 1, 3);
  gates.push({ tx: 112, ty: 22, tw: 1, th: 3, need: 'frack', open: false });
  e('stand', 108, 25);
  e('item', 110, 25, { item: 'wasser' });
  e('npc', 117, 25, {
    npc: 'ada', spr: 'ada', name: 'ANNA', flag: 'probe_abgenommen',
    requires: ['probe_beauftragt', 'einsatz_gelungen'],
    blocked: 'ANNA: „ERST DER EINSATZ AM PULT. DREI TAKTE IM TAKT.“',
    dialog: [
      'DAS SITZT. DAS MOTIV BEHALTEN WIR BIS ZUM FINALE.',
      'NIMM DEN WEG DURCH DIE BÜHNENTÜR. IM FRACK.',
    ],
    after: 'DER BÜHNENEINGANG WARTET. DAS MOTIV NIMMST DU MIT.',
  });

  const goal = {
    x: 120 * TILE, y: 21 * TILE, w: TILE, h: 3 * TILE,
    name: 'BÜHNENEINGANG', need: 'einsatz', flags: ['probe_abgenommen'],
    flagLocked: 'ERST MIT ANNA SPRECHEN',
    locked: 'ANNA WARTET AN DER BÜHNENTÜR. ERST DER EINSATZ, DANN DER ABSCHIED.',
  };

  // Taktwechsel: der Dirigent bestimmt das Tempo
  takts.push({ x: 40 * TILE, bpm: 132, label: 'ALLEGRO — DER DIRIGENT ZIEHT AN' });
  takts.push({ x: 98 * TILE, bpm: 88, label: 'ANDANTE — ER WIRD LANGSAMER' });

  tip(1, 'AKT 2 — PROBENRAUM. HIER WIRD GEPROBT, AUCH MIT TAKTSTÖCKEN');
  tip(13, 'ANNA: DAVORSTELLEN UND E DRÜCKEN — NOCHMAL E FÜR DIE NÄCHSTE ZEILE');
  tip(25, 'ZWEI WEGE: UNTEN ZWISCHEN DEN STÜHLEN ODER OBEN ÜBER DIE PULTE');
  tip(40, 'DER DIRIGENT WIRFT IM BOGEN — DUCK ODER SEITWÄRTS WEG');
  tip(50, 'IM TAKT GETROFFEN VERLIERT ER DEN TAKTSTOCK');
  tip(54, 'DIRIGENTENPULT: ERST DIE MAPPE ABLEGEN (E), DANN DREI TAKTE EINSATZ IM TAKT (E)');
  tip(78, 'BÜHNE. VON HIER GEHT ES ÜBER DIE BELEUCHTUNGSBRÜCKE ZURÜCK');
  tip(100, 'HINTERBÜHNE. ZUM AUFTRITT NUR IM FRACK — AB HIER WIRD ES WARM');
  tip(114, 'ANNA WARTET AN DER BÜHNENTÜR — EIN LETZTER SATZ NACH DEM EINSATZ');
  tip(119, 'BÜHNENEINGANG. ERST NACH EINSATZ UND ABSCHIED MIT ANNA — ENDE AKT 2');

  return {
    id: 'akt2',
    name: 'AKT 2 — DIE PROBE',
    setting: 'saal',
    subtitle: 'Probenraum. Es riecht nach Kolophonium und Nervosität.',
    w: W, h: H,
    grid, spawns, gates, lights, alcoves, hints, takts, goal,
    bpm: 100,
    motiv: PROBEN_MOTIV,
    storySteps: [
      { id: 'briefing', text: 'MIT ANNA IM FLUR SPRECHEN', flag: 'probe_beauftragt' },
      { id: 'einsatz', text: 'DIE MAPPE ABGEBEN UND DEN EINSATZ SPIELEN', flag: 'einsatz_gelungen' },
      { id: 'payoff', text: 'ANNA AN DER BÜHNENTÜR TREFFEN', flag: 'probe_abgenommen' },
      { id: 'auftritt', text: 'DURCH DEN BÜHNENEINGANG', goal: true },
    ],
    route: {
      reversible: true,
      returnStair: [
        { tx: 54, row: 14 }, { tx: 50, row: 16 }, { tx: 45, row: 17 },
        { tx: 40, row: 19 }, { tx: 35, row: 21 }, { tx: 30, row: 23 },
      ],
    },
    deckelTotal: spawns.filter((s) => s.kind === 'item' && s.item === 'bierdeckel').length,
  };
}
