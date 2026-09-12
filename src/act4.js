// act4.js — Musterstrecke nach Vorbild von Akt 1–3: eigener Handlungsbogen,
// klar unterscheidbare Räume, eine Mechanik pro Abschnitt, sichtbare Folgen,
// kurzer Rückbezug am Ende. Die Geometrie der bestehenden Akt-4-Räume bleibt
// erhalten (Dienstgang, Graben, Steg über dem Graben, Unterbühne, Versenkungen,
// Lichtkegel, Souffleurkasten, Taktwechsel); ausgebaut werden Handlung
// (Rolf der Orchesterwart), Story-Gates, Journal, Tragezustand und Dekor.
//
// Kernaufgabe (Plan §6, „Orchestergraben"): Rolfs Lampenkiste mit der
// Hauptversenkung zum Steg bringen — oben nimmt Rolf sie ab. Die bestehende
// Aufzugsmechanik bekommt damit ihren erzählerischen Zweck. Mit der letzten
// Übergabe endet die Pflicht; der Taktstock bleibt als optionales Andenken.
import { TILE } from './config.js';

const W = 140;
const H = 26;

export function buildAkt4() {
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
  // Versenkungen tragen Namen und Markierungen: ohne sichtbares Schild war im
  // dunklen Graben nicht zu finden, was der einzige Weg nach oben ist
  // (Playtest-Befund Akt 4).
  const lift = (tx, topRow, bottomRow, w, period, phase, name, marken) => {
    const el = { tx, topRow, bottomRow, w, period, phase: phase || 0, name, marke: [] };
    for (const m of marken) {
      el.marke.push({ spr: m.spr, tx: m.tx, row: m.row });
      decor(m.spr, m.tx, m.row, { marke: name, versenkung: name });
    }
    elevators.push(el);
  };
  const spook = (tx, ty, w, h) => spooks.push({ tx, ty, w, h });
  const decor = (spr, tx, surfaceRow, extra) => e('decor', tx, surfaceRow, { spr, ...extra });
  const tip = (tileX, text) => hints.push({ x: tileX * TILE, text, shown: false });

  // ---------------------------------------------------------------- Hohlräume --
  // Bestehende Räume, nicht ersetzt: Dienstgang, Graben, Luft über dem Steg
  // (Bühnenhöhe) und die Unterbühne dahinter.
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

  // A · Dienstgang — ruhiger Auftakt. Rolf der Orchesterwart gibt den Auftrag;
  // erst danach öffnet sich das Gitter zum Graben (Story-Gate wie Akt 1–3).
  e('spawn', 4, 25, { isSpawn: true });
  e('item', 7, 25, { item: 'bierdeckel' });
  e('npc', 12, 25, {
    npc: 'rolf', spr: 'rolf', name: 'ROLF', flag: 'graben_beauftragt',
    dialog: [
      'ROLAND. DIE LAMPENKISTE STEHT UNTEN IM GRABEN.',
      'BRING SIE ZUR HAUPTVERSENKUNG UND FAHR MIT IHR HOCH.',
      'SIE IST SCHWER: TEMPO RAUS — ABER DER TAKT BLEIBT DEIN.',
    ],
    after: 'UNTER DER BÜHNE DURCH. ICH WARTE OBEN AN DER VERSENKUNG.',
  });
  e('stand', 16, 25);
  // Freundliche narrative Schranke: nicht die Figur blockiert, sondern das
  // Gitter am Ende des Dienstgangs. Rolfs Auftrag entriegelt es.
  solid(20, 21, 1, 4);
  gates.push({
    tx: 20, ty: 21, tw: 1, th: 4, flag: 'graben_beauftragt', open: false,
    locked: 'ERST MIT ROLF SPRECHEN. ER HAT DEN SCHLÜSSEL ZUM GRABEN.',
    opened: 'ROLF ÖFFNET DAS GITTER ZUM GRABEN.',
  });
  decor('lastenhaken', 2, 25);
  lamp(6, 22);
  gleam(8, 23, 4.5);

  // B · Graben — die Kernaufgabe beginnt hier: Rolfs Lampenkiste steht auf dem
  // Boden. Aufnehmen (E), tragen, wieder absetzen (DUCKEN + E) — kein Softlock,
  // die Kiste bleibt überall liegen und ist überall wieder aufnehmbar.
  e('kiste', 30, 25, { spr: 'lampenkiste', label: 'LAMPENKISTE' });
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
  e('sopran', 78, 25, { dir: -1 });   // außerhalb der Schreiweite (0,48–0,6 × Bildbreite) vom Versenkungsschacht
  alcove(47, 24);
  gleam(52, 23, 3.5);
  e('item', 57, 21, { item: 'bierdeckel' });
  lamp(58, 18);
  e('tenor', 52, 25, { patrol: [50, 56], dir: -1 });   // links der Versenkung: beim Warten auf die Mitfahrt nicht im Weg
  gleam(62, 23, 3.5);
  e('dirigent', 74, 23, { dir: -1 });
  lamp(74, 20);
  gleam(74, 22, 4);
  e('koffer', 84, 25, { patrol: [80, 90] });
  gleam(86, 23, 3.5);
  e('item', 89, 16, { item: 'bierdeckel' });
  e('piccolo', 92, 25, { patrol: [90, 96], dir: -1 });
  gleam(94, 23, 3.5);
  // Optionales Andenken: der Taktstock des Dirigenten — kein Pflichtstück,
  // kein Storyschritt, nur ein Fundtext (siehe story.js BELOHNUNGEN).
  e('item', 76, 23, { item: 'taktstock' });

  // C · Steg — oben an der Hauptversenkung nimmt Rolf die Kiste ab. Daneben die
  // Umkleide (Frack für den Auftritt), dahinter das Absperrband zum Podium.
  e('stand', 70, 12);
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
  e('npc', 64, 12, {
    npc: 'rolf', spr: 'rolf', name: 'ROLF', flag: 'kiste_uebergeben',
    nimmt: 'kiste', requires: ['graben_beauftragt'],
    blocked: 'ROLF: „ERST DIE KISTE. OHNE SIE FÄNGT HIER NICHTS AN."',
    dialog: [
      'DIE LAMPENKISTE IST OBEN. SAUBERE ARBEIT.',
      'DEN REST MACHEN WIR.',
    ],
    after: 'DEN REST MACHEN WIR.',
  });
  gates.push({ tx: 82, ty: 9, tw: 1, th: 3, need: 'frack', open: false });
  solid(82, 9, 1, 3);
  e('sopran', 90, 12, { dir: -1 });
  alcove(87, 11);
  gleam(90, 11, 3.5);

  // D · Unterbühne dahinter — Seitenraum mit eigenem Weg zurück.
  e('item', 114, 20, { item: 'wasser' });
  e('koffer', 118, 25, { patrol: [115, 121] });
  gleam(108, 23, 3.5);
  gleam(115, 23, 3.5);
  lamp(112, 22);

  // E · Versenkungen — der einzige Weg nach oben (und wieder herunter).
  // Beide sind beschildert und mit Leuchte gezeichnet: der Weg nach oben muss
  // zu sehen sein, bevor man davorsteht (Playtest-Befund Akt 4).
  lift(59, 12, 25, 4, 11, 0, 'HAUPTVERSENKUNG', [
    { spr: 'versenkungsschild', tx: 56, row: 25 },   // unten im Graben, von weitem lesbar
    { spr: 'versenkungsschild', tx: 56, row: 12 },   // oben am Steg, wo die Fahrt endet
  ]);
  lift(88, 16, 25, 3, 7, 2.5, 'REQUISITENAUFZUG', [
    { spr: 'versenkungstafel', tx: 86, row: 25 },    // kleinere Marke, gleiche Familie
  ]);

  const goal = {
    x: 96 * TILE, y: 10 * TILE, w: TILE, h: 2 * TILE,
    name: 'AUFTRITT', need: 'frack',
    flags: ['graben_beauftragt', 'kiste_uebergeben'],
    flagLocked: 'ERST DIE LAMPENKISTE HOCHBRINGEN',
    locked: 'DER AUFTRITT BEGINNT ERST, WENN DIE KISTE OBEN IST. SO SIND DIE REGELN.',
  };

  // Taktwechsel im Graben
  const takts = [
    { x: 64 * TILE, bpm: 132, label: 'ALLEGRO — DER TAKTSTOCK TREIBT' },
    { x: 84 * TILE, bpm: 76, label: 'LARGO — ES WIRD FEIERLICH' },
  ];

  // Kontexttips
  tip(2, 'AKT 4 — ORCHESTERGRABEN. HIER UNTEN SIEHT MAN NICHTS UND HÖRT ALLES');
  tip(8, 'ROLF: DAVORSTELLEN UND E DRÜCKEN — NOCHMAL E FÜR DIE NÄCHSTE ZEILE');
  tip(20, 'DAS GITTER ÖFFNET ERST NACH ROLFS AUFTRAG');
  tip(28, 'LAMPENKISTE: E ZUM AUFNEHMEN, DUCKEN + E ZUM ABSETZEN. DER TAKT BLEIBT DEIN');
  // Wegweiser vor der Versenkung: die Richtung muss früh klar sein, nicht erst
  // am Schacht (Playtest-Befund Akt 4).
  tip(33, 'MIT DER KISTE WEITER RECHTS — DIE HAUPTVERSENKUNG STEHT AM SCHACHT MIT DER LEUCHTE');
  tip(43, 'SOUFFLEURKASTEN: NICHT ZU NAHE RANGEHEN, ER FLÜSTERT MIT');
  tip(58, 'MIT DER KISTE AUF DIE VERSENKUNG — SIE FAHRT VON ALLEIN HOCH');
  tip(65, 'STEG ÜBER DEM GRABEN. HIER OBEN WARTET ROLF AN DER VERSENKUNG');
  tip(81, 'AUFTRITT NUR IM FRACK — ABER OBEN WIRD ES WARM');

  return {
    id: 'akt4',
    mode: 'sidescroller',
    name: 'AKT 4 — DER ORCHESTERGRABEN',
    subtitle: 'Nachtdienst in der Oper. Dunkel, eng, und unten flüstert jemand mit.',
    setting: 'graben',
    dark: true,
    bpm: 96,
    w: W, h: H,
    grid, spawns, gates, lights, gleams, alcoves, hints, shelters, elevators, spooks, takts,
    goal,
    storySteps: [
      { id: 'briefing', text: 'MIT ROLF IM DIENSTGANG SPRECHEN', flag: 'graben_beauftragt' },
      { id: 'kiste', text: 'DIE LAMPENKISTE AUFNEHMEN', flag: 'kiste_aufgenommen' },
      { id: 'hoch', text: 'KISTE ZUR HAUPTVERSENKUNG BRINGEN UND HOCHFAHREN', flag: 'kiste_oben' },
      { id: 'uebergabe', text: 'ROLF DIE KISTE ÜBERGEBEN', flag: 'kiste_uebergeben' },
      { id: 'auftritt', text: 'IM FRACK ZUM AUFTRITT', goal: true },
    ],
    route: {
      reversible: true,
      // Rückweg aus dem Steg: allein über die Hauptversenkung — und sie fährt
      // mit Standzeit an beiden Enden, damit Ein- und Aussteigen keine
      // Punktlandung verlangt.
      returnStair: [
        { tx: 59, row: 12 }, { tx: 59, row: 25 },
      ],
    },
    deckelTotal: spawns.filter((sp) => sp.kind === 'item' && sp.item === 'bierdeckel').length,
  };
}
