// Natürlicher Akt-4-Gefahrenlauf: echte Gegner, drei Nerven, normale
// Rhythmusaktion und Checkpoint-Respawns. Der Bot nutzt nur dieselben
// Richtungs-, Sprung- und Aktionseingaben wie ein Spieler; direkte
// Positionierung gibt es nur für Gespräche und die Kistenübergabe
// (wie in den Gefahrenläufen von Akt 2 und Akt 3). Gegnerfilter, Teleport
// und Unsterblichkeit sind ausdrücklich nicht erlaubt.
//
// Besonderheit Akt 4: Die Route ist eine Story-Strecke. Das Gitter am Ende des
// Dienstgangs öffnet nur Rolfs Auftrag, die Lampenkiste kommt nur auf E mit,
// und Rolf oben nimmt sie nur auf E ab. Deshalb blättert der Bot die
// datengetriebenen Gespräche mit echten Aktionsanschlägen durch — bleiben sie
// aus, steht er vor verschlossenem Gitter (x=308, Tile 19) und der Akt endet nie.
import { buildAkt4 } from '../src/world.js';
import { Game } from '../src/game.js';
import { createInput } from '../src/input.js';
import { TILE } from '../src/config.js';

const input = createInput(null);
const game = new Game({
  level: buildAkt4(), input,
  audio: { play() {}, resume() {} }, events: () => {}, difficulty: 'gemuetlich',
});
game.reset('schwarz');

const route = [
  { wp: [12, 25] }, { talk: 'graben_beauftragt' },
  { wp: [30, 25] }, { kiste: true },
  { wp: [38, 25] }, { wp: [50, 25] }, { wp: [60, 25] },
  { wp: [60, 12], sec: 40 },            // Versenkung: auf die Mitfahrt warten
  { wp: [66, 12] },
  { talk: 'kiste_uebergeben' },         // Rolf nimmt die Kiste oben ab
  { outfit: 'frack' },
  { wp: [74, 12] }, { wp: [86, 12] },
  { wp: [96, 12] },                     // Auftritt
];

let jumpHold = 0;
let jumpRelease = 0;
let letzteRichtung = 1;
let collapses = 0;
let frames = 0;
let versenkung = 0;   // wie oft die Mitfahrt wirklich getragen hat

for (const stepItem of route) {
  if (stepItem.outfit) {
    // Entspricht der Auswahl im bereits separat getesteten Kleider-Menü.
    game.setOutfit(stepItem.outfit);
    continue;
  }
  if (stepItem.talk) {
    const npc = game.entities.find((en) => en.kind === 'npc' && en.flag === stepItem.talk);
    for (let i = 0; i < npc.dialog.length; i++) {
      input.setKey('action', true); game.update(1 / 60);
      input.setKey('action', false); game.update(1 / 60);
      frames += 2;
    }
    continue;
  }
  if (stepItem.kiste) {
    // E in Reichweite der Kiste: aufnehmen. Kein Tritt, kein Teleport.
    input.setKey('action', true); game.update(1 / 60);
    input.setKey('action', false); game.update(1 / 60);
    frames += 2;
    continue;
  }

  const [wx, row] = stepItem.wp;
  const tx = wx * TILE + 8;
  const feetY = row * TILE;
  let bestDist = Infinity;
  let noProgress = 0;
  let reached = false;

  for (let i = 0; i < (stepItem.sec || 16) * 60; i++) {
    frames++;
    const p = game.player;
    const d = tx - (p.x + p.w / 2);
    const zielTiefer = feetY > p.y + p.h + 6;
    const amZielX = Math.abs(d) < 12;
    let richtung = d > 3 ? 1 : (d < -3 ? -1 : 0);
    if (amZielX && zielTiefer) richtung = letzteRichtung;
    else if (richtung !== 0) letzteRichtung = richtung;
    input.setKey('right', richtung > 0);
    input.setKey('left', richtung < 0);

    const higher = feetY < p.y + p.h - 8;
    const footRow = Math.floor((p.y + p.h + 1) / TILE);
    const holeAhead = feetY <= p.y + p.h + 4
      && game.tileVal(Math.floor((p.x + p.w + 6) / TILE), footRow) === 0;
    // Schallwellen und Taktstock kommen auf Brusthöhe heran: darüber springen.
    const gefahr = game.projectiles.some((pr) => Math.abs(pr.x - (p.x + p.w / 2)) < 56
      && pr.y + pr.h > p.y + 2 && pr.y < p.y + p.h - 2);
    if (Math.abs(d) < bestDist - 4) { bestDist = Math.abs(d); noProgress = 0; }
    else noProgress++;
    const needJump = higher || holeAhead || gefahr || noProgress > 20;
    if (jumpHold > 0) {
      input.setKey('jump', true); jumpHold--;
      if (jumpHold === 0) jumpRelease = 3;
    } else if (jumpRelease > 0) {
      input.setKey('jump', false); jumpRelease--;
    } else if (p.onGround && needJump) {
      jumpHold = 15; input.setKey('jump', true);
    } else input.setKey('jump', false);

    // Im Nahbereich auf das Taktfenster warten und über eine echte E-Kante
    // reagieren. So bleiben Dirigent, Sopran, Piccolo, Tenor und Koffer Teil
    // der Graben-Route — mit Kiste bleibt der Tritt erlaubt, sie macht nicht
    // wehrlos.
    const gefahrNah = game.entities.some((en) =>
      ['piccolo', 'sopran', 'tenor', 'koffer', 'dirigent'].includes(en.kind) && en.alive
      && Math.hypot((en.x + en.w / 2) - (p.x + p.w / 2),
        (en.y + en.h / 2) - (p.y + p.h / 2)) < 62);
    input.setKey('action', gefahrNah && game.beatAccuracy() < 0.16 && !game.prevAction);

    const vorher = p.y + p.h;
    game.update(1 / 60);
    // Mitfahrt der Versenkung zählen (der umgekehrte Weg wäre der Abstieg).
    if (p.y + p.h < vorher - 0.5) versenkung++;

    if (game.state === 'paused') game.resume();
    if (game.state === 'collapse') {
      collapses++;
      game.respawnFromCheckpoint();
    }
    if (game.state === 'complete') { reached = true; break; }
    if (Math.abs(d) < 8 && Math.abs((p.y + p.h) - feetY) < 18 && p.onGround) {
      reached = true; break;
    }
  }
  // Gegner dürfen einen Zwischenpunkt verschieben. Nur der letzte Punkt muss
  // zwingend erreicht werden; Gesamtzustand und Storyfortschritt sind der Beweis.
  if (!reached && stepItem === route.at(-1)) break;
}

const enemies = game.level.spawns.filter((s) =>
  ['piccolo', 'sopran', 'tenor', 'koffer', 'dirigent'].includes(s.kind)).length;
const ok = game.maxNerves === 3 && enemies >= 5 && game.state === 'complete'
  && game.storyFlags.has('graben_beauftragt')
  && game.storyFlags.has('kiste_aufgenommen')
  && game.storyFlags.has('kiste_oben')
  && game.storyFlags.has('kiste_uebergeben')
  && game.gates.every((g) => g.open === true)
  && collapses <= 6;

console.log(`${ok ? 'PASS' : 'FAIL'} Akt 4 natural hazard route`);
console.log(JSON.stringify({ state: game.state,
  briefing: game.storyFlags.has('graben_beauftragt'),
  kiste: game.storyFlags.has('kiste_aufgenommen'),
  oben: game.storyFlags.has('kiste_oben'),
  uebergabe: game.storyFlags.has('kiste_uebergeben'),
  gates: game.gates.map((g) => g.open),
  enemies, maxNerves: game.maxNerves, collapses, versenkung,
  seconds: Number((frames / 60).toFixed(1)) }));
process.exit(ok ? 0 : 1);
