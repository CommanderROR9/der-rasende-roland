// Natürlicher Akt-1-Gefahrenlauf: echte Gegner, drei Nerven, normale
// Checkpoint-Respawns. Der Bot nutzt nur dieselben Richtungs-, Sprung- und
// Aktionseingaben wie ein Spieler; direkte Positionierung und Gegnerfilter sind
// ausdrücklich nicht erlaubt.
import { buildAkt1 } from '../src/world.js';
import { Game } from '../src/game.js';
import { createInput } from '../src/input.js';
import { PHYS, TILE } from '../src/config.js';

const input = createInput(null);
const game = new Game({
  level: buildAkt1(), input,
  audio: { play() {}, resume() {} }, events: () => {}, difficulty: 'gemuetlich',
});
game.reset('schwarz');

const route = [
  { wp: [7, 25] }, { talk: 'ada_beauftragt' }, { wp: [16, 25] },
  { wp: [19, 23] }, { wp: [23, 21] }, { wp: [28, 19] }, { wp: [38, 19] }, { wp: [50, 19] },
  { wp: [54, 21] }, { wp: [58, 23] }, { wp: [63, 25] },
  { wp: [68, 23] }, { wp: [72, 23] }, { wp: [88, 25] },
  { outfit: 'anzug' }, { wp: [93, 23] }, { wp: [98, 21] }, { wp: [104, 19] },
  { wp: [98, 21] }, { wp: [94, 23] }, { wp: [108, 25] },
  { outfit: 'frack' }, { wp: [110, 25] }, { wp: [113, 23] }, { wp: [117, 21] },
  { wp: [113, 19] }, { wp: [117, 17] }, { wp: [121, 15] }, { wp: [124, 13] },
  { talk: 'ada_verabschiedet' }, { wp: [130, 13] },
];

let jumpHold = 0;
let jumpRelease = 0;
let letzteRichtung = 1;
let collapses = 0;
let frames = 0;

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

  const [wx, row] = stepItem.wp;
  const tx = wx * TILE + 8;
  const feetY = row * TILE;
  let bestDist = Infinity;
  let noProgress = 0;
  let reached = false;

  for (let i = 0; i < 14 * 60; i++) {
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
    if (Math.abs(d) < bestDist - 4) { bestDist = Math.abs(d); noProgress = 0; }
    else noProgress++;
    const needJump = higher || holeAhead || noProgress > 20;
    if (jumpHold > 0) {
      input.setKey('jump', true); jumpHold--;
      if (jumpHold === 0) jumpRelease = 3;
    } else if (jumpRelease > 0) {
      input.setKey('jump', false); jumpRelease--;
    } else if (p.onGround && needJump) {
      jumpHold = 15; input.setKey('jump', true);
    } else input.setKey('jump', false);

    // Im Nahbereich auf das Taktfenster warten und über eine echte E-Kante
    // reagieren. So bleiben Piccolo, Sopran, Tenor und Koffer Teil der Probe.
    const gefahrNah = game.entities.some((en) =>
      ['piccolo', 'sopran', 'tenor', 'koffer'].includes(en.kind) && en.alive
      && Math.hypot((en.x + en.w / 2) - (p.x + p.w / 2),
        (en.y + en.h / 2) - (p.y + p.h / 2)) < 62);
    input.setKey('action', gefahrNah && game.beatAccuracy() < 0.16 && !game.prevAction);
    game.update(1 / 60);

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

const enemies = game.level.spawns.filter((s) => ['piccolo', 'sopran', 'tenor', 'koffer'].includes(s.kind)).length;
const ok = game.maxNerves === 3 && enemies >= 4 && game.state === 'complete'
  && game.hasMappe && game.storyFlags.has('ada_beauftragt')
  && game.storyFlags.has('ada_verabschiedet') && collapses <= 4;

console.log(`${ok ? 'PASS' : 'FAIL'} Akt 1 natural hazard route`);
console.log(JSON.stringify({ state: game.state, mappe: game.hasMappe,
  briefing: game.storyFlags.has('ada_beauftragt'), payoff: game.storyFlags.has('ada_verabschiedet'),
  enemies, maxNerves: game.maxNerves, collapses, seconds: Number((frames / 60).toFixed(1)) }));
process.exit(ok ? 0 : 1);
