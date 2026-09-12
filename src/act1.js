// act1.js — Musterstrecke: fünf lesbare Räume, zwei Anna-Begegnungen,
// drei Stimmen und eine vollständig umkehrbare Route.
import { TILE } from './config.js';

const W = 132;
const H = 26;
const ONEWAY = 2;
const MORSCH = 3;

export function buildAkt1() {
  const grid = [];
  for (let y = 0; y < H; y++) grid.push(new Array(W).fill(1));
  const spawns = [], gates = [], lights = [], alcoves = [], hints = [];

  const carve = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (j >= 0 && j < H && i >= 0 && i < W) grid[j][i] = 0;
    }
  };
  const rect = (x, y, w, h, kind) => {
    const value = kind === '=' ? ONEWAY : kind === 'x' ? MORSCH : 1;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (j >= 0 && j < H && i >= 0 && i < W) grid[j][i] = value;
    }
  };
  const e = (kind, tx, surfaceRow, extra = {}) => spawns.push({ kind, tx, walkRow: surfaceRow - 1, ...extra });
  const lamp = (tx, ty) => lights.push({ x: (tx - 2) * TILE, y: ty * TILE, w: 5 * TILE, h: 4 * TILE });
  const alcove = (tx, ty, w = 2) => alcoves.push({ x: tx * TILE, y: ty * TILE, w: w * TILE, h: TILE });
  const decor = (spr, tx, surfaceRow, extra = {}) => e('decor', tx, surfaceRow, { spr, ...extra });
  const tip = (tileX, text) => hints.push({ x: tileX * TILE, text, shown: false });

  // A · Garderobe — ruhiger Auftrag, Bewegung und Kleiderwahl in einem Bild.
  carve(1, 20, 17, 5);
  // B · Stimmengang — ein klarer Aufstieg und eine einzelne Rhythmusgefahr.
  carve(18, 15, 10, 10);
  carve(26, 15, 27, 4);
  // C · Notenschacht — beidseitig begehbare Treppe statt Einweg-Luke.
  carve(51, 15, 14, 10);
  carve(61, 21, 29, 4);
  // D · Archiv — eigener Regalaufstieg hinter der Diensttür.
  carve(91, 17, 20, 8);
  // E · Obermaschinerie — Frackband, Seile und Materialaufzug.
  carve(111, 10, 20, 15);

  rect(18, 23, 4, 1, '=');
  rect(22, 21, 4, 1, '=');
  rect(26, 19, 27, 1);
  rect(52, 21, 4, 1, '=');
  rect(56, 23, 4, 1, '=');
  rect(60, 25, 5, 1);
  rect(66, 23, 4, 1, 'x');
  rect(71, 23, 4, 1, 'x');
  rect(92, 23, 4, 1, '=');
  rect(97, 21, 4, 1, '=');
  rect(102, 19, 9, 1);
  rect(112, 23, 4, 1, '=');
  rect(116, 21, 4, 1, '=');
  rect(112, 19, 4, 1, '=');
  rect(116, 17, 4, 1, '=');
  rect(120, 15, 4, 1, '=');
  rect(124, 13, 7, 1);

  e('spawn', 3, 25, { isSpawn: true });
  e('npc', 8, 25, {
    npc: 'ada', spr: 'ada', name: 'ANNA', flag: 'ada_beauftragt',
    dialog: [
      'ROLAND! DIE ZUGABE HAT SICH IM KELLER VERTEILT.',
      'DREI STIMMEN. BRING SIE ZUSAMMEN, DANN FÄHRT DER AUFZUG.',
      'UND NIMM DIE KLEIDERORDNUNG ERNST. DIE TÜREN TUN ES LEIDER AUCH.',
    ],
    after: 'DREI STIMMEN. ICH WARTE OBEN AM MATERIALAUFZUG.',
  });
  e('stand', 13, 25);
  e('item', 5, 25, { item: 'bierdeckel' });
  // Freundliche narrative Schranke: Nicht die Figur selbst blockiert, sondern
  // die Brandschutztür am Ende der Garderobe. Annas Auftrag entriegelt sie.
  rect(17, 20, 1, 5);
  gates.push({
    tx: 17, ty: 20, tw: 1, th: 5, flag: 'ada_beauftragt', open: false,
    locked: 'ERST MIT ANNA SPRECHEN. SIE HAT DEN SCHLÜSSEL ZUM STIMMENGANG.',
    opened: 'ANNA ÖFFNET DIE TÜR ZUM STIMMENGANG.',
  });
  decor('spinde', 1, 25);
  decor('geigenkasten', 14, 25);
  decor('dienstplan41', 10, 23);
  lamp(12, 21);

  e('item', 31, 19, { item: 'bierdeckel' });
  e('item', 38, 19, {
    item: 'stimmblatt', spr: 'stimme_violine',
    found: 'VIOLINSTIMME. RANDNOTIZ: „ZUGABE?“',
  });
  e('piccolo', 43, 19, { patrol: [41, 47], dir: -1 });
  alcove(49, 18);
  decor('rohrventil', 28, 19);
  decor('rohrwand', 32, 19, { alpha: 0.58 });
  decor('notenstapel', 47, 19);
  lamp(40, 16);

  e('checkpoint', 61, 25, { id: 'notenschacht' });
  e('item', 64, 25, { item: 'ohropax' });
  alcove(67, 24);
  e('sopran', 77, 25, { dir: -1 });
  alcove(82, 24);
  e('item', 72, 23, {
    item: 'stimmblatt', spr: 'stimme_bratsche',
    found: 'BRATSCHENSTIMME. DARUNTER: „ALLE ZUSAMMEN.“',
  });
  e('item', 69, 23, { item: 'bierdeckel' });
  e('tenor', 85, 25, { patrol: [83, 88], dir: -1 });
  // Der Ständer ist von beiden Seiten der Diensttür erreichbar: Anzug öffnet,
  // danach kann Schwarz für die schnelle Regalroute gewählt werden. So bleibt
  // Kleidung eine Abwägung und nicht nur ein einmaliger Schlüssel.
  e('stand', 89, 25);
  decor('rohrventil', 62, 25, { flip: true });
  decor('notenstapel', 73, 25);
  lamp(72, 21);

  rect(90, 22, 1, 3);
  gates.push({ tx: 90, ty: 22, tw: 1, th: 3, need: 'anzug', open: false });
  e('item', 94, 23, { item: 'wasser' });
  e('item', 104, 19, {
    item: 'stimmblatt', spr: 'stimme_bass',
    found: 'BASSSTIMME. DIE ZUGABE GEHÖRT DEM GANZEN ENSEMBLE.',
  });
  e('item', 99, 21, { item: 'bierdeckel' });
  e('koffer', 106, 19, { patrol: [103, 108] });
  // Nach dem oberen Regalweg geht es wieder hinunter: Der Frackwechsel markiert
  // den Beginn der Obermaschinerie statt mitten im Archiv zu stehen.
  e('stand', 108, 25);
  // Regale sitzen auf den tatsächlich bespielten Ebenen; am tiefen Boden wären
  // sie aus der Kamera des dritten Stimmblatts kaum als Archiv lesbar.
  decor('notenregal', 92, 23, { alpha: 0.82 });
  decor('notenregal', 101, 19, { alpha: 0.82 });
  decor('archivwagen', 106, 25);
  lamp(101, 18);

  rect(111, 22, 1, 3);
  gates.push({ tx: 111, ty: 22, tw: 1, th: 3, need: 'frack', open: false });
  e('checkpoint', 117, 17, { id: 'obermaschinerie' });
  e('item', 121, 15, { item: 'bierdeckel' });
  decor('lastenhaken', 114, 19);
  decor('seilrolle', 120, 17);
  decor('gegengewicht', 112, 19, { alpha: 0.62 });
  lamp(121, 12);
  e('npc', 124, 13, {
    npc: 'ada', spr: 'ada', name: 'ANNA', flag: 'ada_verabschiedet',
    requires: ['ada_beauftragt', 'mappe'],
    blocked: 'ANNA: „ERST DIE DREI STIMMEN. KEINE ZUGABE MIT LÜCKEN.“',
    dialog: [
      'VOLLSTÄNDIG. NACH EINUNDVIERZIG JAHREN FINDEST DU JEDE STIMME.',
      'NIMM DIE MAPPE MIT NACH OBEN. HEUTE SPIELST DU NICHT ALLEIN.',
    ],
    after: 'DER AUFZUG WARTET. DIE MAPPE NIMMST DU MIT.',
  });

  const goal = {
    x: 130 * TILE, y: 10 * TILE, w: TILE, h: 3 * TILE,
    name: 'MATERIALAUFZUG', need: 'mappe', flags: ['ada_verabschiedet'],
    flagLocked: 'ERST MIT ANNA SPRECHEN',
    locked: 'ANNA WARTET NEBEN DEM AUFZUG. ERST DIE MAPPE, DANN DER ABSCHIED.',
  };

  tip(1, 'A/D ODER PFEILTASTEN GEHEN · SPACE SPRINGEN · E AKTION · P PAUSE');
  tip(7, 'ANNA: DAVORSTELLEN UND E DRÜCKEN — NOCHMAL E FÜR DIE NÄCHSTE ZEILE');
  tip(14, 'KLEIDERSTÄNDER: JEDE KLUFT ÖFFNET ANDERE WEGE');
  tip(26, 'STIMMENGANG — DER PULS UNTEN ZEIGT DEN TAKT');
  tip(41, 'PICCOLO: SCHALLWELLE ÜBERSPRINGEN ODER IM TAKT MIT E STOPPEN');
  tip(52, 'DIESE TREPPE FÜHRT AUCH WIEDER ZURÜCK — KEINE STIMME GEHT VERLOREN');
  tip(66, 'MORSCHE NOTEN: SCHNELL HINAUF, UNTEN BLEIBT DER SICHERE WEG');
  tip(88, 'FÜR DAS ARCHIV BRAUCHT ES ANZUG UND KRAWATTE');
  tip(91, 'DIE DIENSTTÜR BLEIBT OFFEN — SCHWARZ IST AUF DEN REGALEN SCHNELLER UND KÜHLER');
  tip(107, 'DIE DRITTE STIMME MACHT DIE MAPPE VOLLSTÄNDIG');
  tip(110, 'OBERMASCHINERIE: NUR DER FRACK ÖFFNET DAS ABSPERRBAND');
  tip(123, 'ANNA WARTET AM AUFZUG — EIN LETZTER SATZ VOR DER PROBE');

  return {
    id: 'akt1', name: 'AKT 1 — DIE KATAKOMBEN', setting: 'keller',
    subtitle: '2. Untergeschoss. Drei Stimmen für eine letzte Zugabe.',
    w: W, h: H, grid, spawns, gates, lights, alcoves, hints, goal,
    stimmblaetterNoetig: 3,
    storySteps: [
      { id: 'briefing', text: 'MIT ANNA IN DER GARDEROBE SPRECHEN', flag: 'ada_beauftragt' },
      { id: 'stimmen', text: 'DIE DREI STIMMBLÄTTER FINDEN', counter: 'stimmblaetter', atLeast: 3 },
      { id: 'payoff', text: 'ANNA AM MATERIALAUFZUG TREFFEN', flag: 'ada_verabschiedet' },
      { id: 'aufzug', text: 'MIT DER VOLLSTÄNDIGEN MAPPE IN DEN AUFZUG', goal: true },
    ],
    route: {
      reversible: true,
      returnStair: [{ tx: 52, row: 21 }, { tx: 56, row: 23 }, { tx: 60, row: 25 }],
    },
    deckelTotal: spawns.filter((s) => s.kind === 'item' && s.item === 'bierdeckel').length,
  };
}
