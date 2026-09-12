// act3.js — Musterstrecke nach Vorbild von Akt 1 und 2: eigener Handlungsbogen,
// klar unterscheidbare Räume, eine Mechanik pro Abschnitt, sichtbare Folgen,
// kurzer Rückbezug am Ende. Geometrie der bestehenden Akt-3-Räume bleibt
// erhalten (Parkplatz, Wiese mit Vordach, Bühne mit Gerüst und Lichtbrücke,
// Hinterbühne); ausgebaut werden Handlung (Rolf bereitet den Auftritt mit vor),
// Story-Gates, Journal und Dekor.
//
// Kernaufgabe (Plan §6, „Open Air"): Zwei Pulte sichern, bevor der nächste
// musikalische Einsatz beginnt. Feste Interaktionspunkte, sichtbare Klammern,
// die vorhandenen Windphasen als Timinghilfe — nicht als reine Strafe.
import { TILE } from './config.js';

const W = 140;
const H = 26;

export function buildAkt3() {
  const grid = [];
  for (let y = 0; y < H; y++) grid.push(new Array(W).fill(1));
  const spawns = [], gates = [], lights = [], alcoves = [], hints = [];
  const shelters = [], takts = [];

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
  // Bestehende Räume, nicht ersetzt: Parkplatz, Wiese, Bühne mit Gerüst,
  // Hinterbühne. Über dem Gelände ist Himmel, kein Fels.
  carve(1, 20, 20, 5);        // Parkplatz x1..20 (Auftakt, Rolf-Briefing)
  carve(21, 18, 44, 7);       // Wiese x21..64 (Vordach, Lichterkette)
  carve(65, 8, 40, 17);       // Bühne und Gerüst x65..104
  carve(105, 21, 20, 4);      // Hinter der Bühne x105..124
  carve(1, 0, 123, 19);       // Freiluft — vor den Aufbauten

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

  // A · Parkplatz — ruhiger Auftakt. Rolf gibt den Auftrag für die zwei Pulte;
  // erst danach öffnet sich das Absperrband zur Wiese (Story-Gate wie Akt 1/2).
  e('spawn', 4, 25, { isSpawn: true });
  e('stand', 8, 25);
  e('item', 12, 25, { item: 'bierdeckel' });
  e('npc', 14, 25, {
    npc: 'rolf', spr: 'rolf', name: 'ROLF', flag: 'openair_beauftragt',
    dialog: [
      'ROLAND! DER WIND HAT DIE BLÄTTER VERTEILT.',
      'ZWEI PULTE. JEDES BRAUCHT ZWEI KLAMMERN. IM TAKT.',
      'BEI BÖEN KURZ WARTEN — DER WIND ZEIGT DEN TAKT AN.',
    ],
    after: 'ZWEI PULTE. IM TAKT SICHERN. ICH WARTE AM PODIUM.',
  });
  // Freundliche narrative Schranke wie in Akt 1/2: nicht die Figur blockiert,
  // sondern das Absperrband am Ende des Parkplatzes. Rolfs Auftrag entriegelt es.
  rect(20, 20, 1, 5);
  gates.push({
    tx: 20, ty: 20, tw: 1, th: 5, flag: 'openair_beauftragt', open: false,
    locked: 'ERST MIT ROLF SPRECHEN. ER HAT DIE KLAMMERN.',
    opened: 'ROLF GIBT DEN WEG ZUR WIESE FREI.',
  });
  decor('bauzaun', 3, 25);
  decor('klammerkiste', 12, 25);
  lamp(10, 21);

  // B · Wiese — Weg unter Lichterkette und Vordach (Sopran, Koffer).
  // Mechanik: Deckung in den Nischen, bei Regen unter das Vordach.
  e('item', 26, 25, { item: 'bierdeckel' });
  e('piccolo', 34, 25, { patrol: [32, 38], dir: -1 });
  e('item', 40, 25, { item: 'ohropax' });
  alcove(44, 24);
  e('sopran', 47, 25, { dir: -1 });
  e('item', 52, 25, { item: 'bierdeckel' });
  e('koffer', 57, 25, { patrol: [55, 61] });
  e('checkpoint', 60, 25, { id: 'wiese' });
  decor('lichterkette', 30, 25);
  decor('lautsprecher', 62, 25);
  lamp(58, 20);

  // C · Bühne und Pulte — die Kernaufgabe. Zwei feste Pulte mit sichtbaren
  // Klammern; jedes braucht zwei Takte im Takt. Ein danebengegangener Versuch
  // kostet nichts (Pointe statt Neustart, wie der Einsatz in Akt 2).
  // Mechanik: Taktaktion im Takt, gelungene Klammern bleiben erhalten.
  e('pult', 80, 21, { noetig: 2, flag: 'pult_west_gesichert', aktion: 'PULT SICHERN' });
  e('pult', 90, 21, { noetig: 2, flag: 'pult_ost_gesichert', aktion: 'PULT SICHERN' });
  decor('klammer', 80, 21);
  decor('klammer', 90, 21);
  e('dirigent', 88, 21, { dir: -1 });
  e('tenor', 92, 21, { patrol: [79, 93], dir: -1 });
  e('item', 86, 21, { item: 'wasser' });
  e('checkpoint', 78, 21, { id: 'buehne' });
  alcove(80, 20);
  alcove(90, 20);
  decor('buehnenportal', 77, 21);
  lamp(80, 18);

  // D · Gerüst und Lichtbrücke — oberer Weg zum Podium.
  // Mechanik: Springen in Sprunghöhe, beidseitig begehbar.
  e('item', 82, 11, { item: 'bierdeckel' });   // oben auf der Brücke
  lamp(90, 12);

  // E · Podium — Frack anziehen, Rolf-Payoff, Auftritt.
  // Mechanik: Kleidung als Werkzeug; Rückbezug: Wer sichert, tritt auf.
  rect(93, 9, 1, 3);
  gates.push({ tx: 93, ty: 9, tw: 1, th: 3, need: 'frack', open: false });
  e('stand', 89, 11);
  e('item', 96, 11, { item: 'bierdeckel' });
  e('npc', 95, 11, {
    npc: 'rolf', spr: 'rolf', name: 'ROLF', flag: 'openair_abgenommen',
    requires: ['pult_west_gesichert', 'pult_ost_gesichert'],
    blocked: 'ROLF: „ERST BEIDE PULTE. JEDE SEITE HÄLT ERST MIT KLAMMERN.“',
    dialog: [
      'BEIDE PULTE STEHEN. SAUBERE ARBEIT.',
      'IM FRACK AUF DAS PODIUM. DER EINSATZ BEGINNT.',
    ],
    after: 'DAS PODIUM WARTET. IM FRACK.',
  });

  // Hinter der Bühne
  e('koffer', 110, 25, { patrol: [107, 114] });
  e('item', 118, 25, { item: 'wasser' });
  e('piccolo', 121, 25, { patrol: [119, 123], dir: -1 });
  decor('lautsprecher', 108, 25);

  const goal = {
    x: 96 * TILE, y: 9 * TILE, w: TILE, h: 3 * TILE,
    name: 'PODIUM', need: 'einsatz',
    flags: ['pult_west_gesichert', 'pult_ost_gesichert', 'openair_abgenommen'],
    flagLocked: 'ERST BEIDE PULTE SICHERN',
    locked: 'ROLF WARTET AM PODIUM. ERST DIE PULTE, DANN DER ABSCHIED.',
  };

  // Das Wetter wechselt und verändert das Spiel. Der Wind macht den Abschnitt
  // nicht unpassierbar: er kündigt die Böe 0,9 s vorher an und stößt
  // Notenblätter (0,6 s Stun bei Kontakt), die Pulte bleiben sicherbar. Der
  // Schub selbst verschiebt den Spieler nicht messbar (62 vs. Bodenreibung 900).
  const wetter = [
    { kind: 'sonne', dur: 20, label: 'SONNE — DER FRACK WIRD ZUR SAUNA' },
    { kind: 'wind', dur: 24, label: 'WIND — DIE NOTEN FLIEGEN' },
    { kind: 'regen', dur: 24, label: 'REGEN — DER BODEN WIRD RUTSCHIG' },
    { kind: 'kaelte', dur: 22, label: 'KÄLTE — DIE FINGER WERDEN STEIFF' },
  ];

  // Taktwechsel: die Wiese geht massig, die Bühne zieht an
  takts.push({ x: 34 * TILE, bpm: 96, label: 'MASSIG — DER WIND GIBT DEN TAKT' });
  takts.push({ x: 78 * TILE, bpm: 112, label: 'FINALE — DIE BÜHNE ZIEHT AN' });

  tip(1, 'AKT 3 — OPEN AIR. DAS WETTER MACHT HIER DIE MUSIK');
  tip(13, 'ROLF: DAVORSTELLEN UND E DRÜCKEN — NOCHMAL E FÜR DIE NÄCHSTE ZEILE');
  tip(20, 'DAS ABSPERRBAND ÖFFNET ERST NACH ROLFS AUFTRAG');
  tip(22, 'UNTER DEM VORDACH WIRD MAN WIEDER TROCKEN');
  tip(34, 'BEI BÖEN KURZ WARTEN — DIE WARNUNG ZEIGT DEN TAKT AN');
  tip(65, 'TREPPE HOCH AUF DIE BÜHNE — ODER HINTEN HERUM');
  tip(78, 'DAS GERÜST GEHT BIS ZUM LICHTTURM HINAUF');
  tip(80, 'WESTPULT: IM TAKT SICHERN (E) — DANEBEN KOSTET NICHTS');
  tip(86, 'DER DIRIGENT STEHT AUF DER BÜHNE. WIE IMMER');
  tip(90, 'OSTPULT: IM TAKT SICHERN (E) — ZWEI KLAMMERN PRO PULT');
  tip(92, 'ZUM AUFTRITT AM PODIUM NUR IM FRACK — UND DA OBEN BRENNT DIE SONNE');
  tip(95, 'ROLF WARTET AM PODIUM — EIN LETZTER SATZ NACH DEN PULTEN');
  tip(119, 'HINTER DER BÜHNE. HIER STEHEN DIE KOFFER');

  return {
    id: 'akt3',
    mode: 'sidescroller',
    name: 'AKT 3 — OPEN AIR',
    setting: 'openair',
    subtitle: 'Freilichtbühne im Park. Das Wetter spielt mit — leider.',
    w: W, h: H,
    grid, spawns, gates, lights, alcoves, hints, shelters, weather: wetter, takts,
    goal,
    bpm: 100,
    storySteps: [
      { id: 'briefing', text: 'MIT ROLF SPRECHEN', flag: 'openair_beauftragt' },
      { id: 'pult_west', text: 'DAS WESTPULT SICHERN', flag: 'pult_west_gesichert' },
      { id: 'pult_ost', text: 'DAS OSTPULT SICHERN', flag: 'pult_ost_gesichert' },
      { id: 'payoff', text: 'ROLF AM PODIUM TREFFEN', flag: 'openair_abgenommen' },
      { id: 'auftritt', text: 'IM FRACK AUF DAS PODIUM', goal: true },
    ],
    route: {
      reversible: true,
      returnStair: [
        { tx: 84, row: 19 }, { tx: 88, row: 17 }, { tx: 84, row: 15 },
        { tx: 88, row: 13 }, { tx: 80, row: 11 },
      ],
    },
    deckelTotal: spawns.filter((s) => s.kind === 'item' && s.item === 'bierdeckel').length,
  };
}
