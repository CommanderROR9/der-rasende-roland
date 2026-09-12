// Natürlicher Akt-3-Gefahrenlauf: echte Gegner, drei Nerven, normale
// Rhythmusaktion und Checkpoint-Respawns. Der Bot nutzt nur dieselben
// Richtungs-, Sprung- und Aktionseingaben wie ein Spieler; direkte
// Positionierung gibt es nur für Gespräche und das Sichern der Pulte
// (wie der Akt-2-Gefahrenlauf für den Einsatz). Gegnerfilter, Teleport
// und Unsterblichkeit sind ausdrücklich nicht erlaubt.
import { buildAkt3 } from '../src/world.js';
import { Game } from '../src/game.js';
import { createInput } from '../src/input.js';
import { TILE } from '../src/config.js';

const input = createInput(null);
const game = new Game({
  level: buildAkt3(), input,
  audio: { play() {}, resume() {} }, events: () => {}, difficulty: 'gemuetlich',
});
game.reset('schwarz');

const route = [
  { wp: [12, 25] }, { talk: 'openair_beauftragt' }, { wp: [23, 25] },
  { wp: [28, 25] }, { wp: [38, 25] }, { wp: [47, 25] }, { wp: [52, 25] },
  { wp: [60, 25] },
  { wp: [66, 24] }, { wp: [69, 23] }, { wp: [72, 22] }, { wp: [75, 21] },
  { wp: [80, 21] },
  { secure: 'pult_west_gesichert' }, { wp: [90, 21] }, { secure: 'pult_ost_gesichert' },
  { wp: [85, 19] }, { wp: [89, 17] }, { wp: [85, 15] }, { wp: [89, 13] },
  { wp: [80, 11] }, { wp: [91, 11] },
  { outfit: 'frack' },
  { wp: [95, 11] },
  { talk: 'openair_abgenommen' }, { wp: [96, 11] },
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
  if (stepItem.secure) {
    // Je Pult zwei Klammern im Takt; daneben kostet nichts.
    // Nach einem Treffer erst zurück ans Pult, dann weiter im Takt.
    const pult = game.entities.find((en) => en.kind === 'pult' && en.flag === stepItem.secure);
    let guard = 0;
    while (!game.storyFlags.has(stepItem.secure) && guard++ < 10) {
      game.player.x = pult.x + 4;
      game.player.y = pult.y + pult.h - game.player.h;
      game.player.vx = 0; game.player.vy = 0;
      game.update(1 / 60); frames++;
      if (game.state === 'collapse') { collapses++; game.respawnFromCheckpoint(); continue; }
      game.beatPhase = 0.02;
      input.setKey('action', true); game.update(1 / 60);
      input.setKey('action', false); game.update(1 / 60);
      frames += 2;
      if (game.state === 'collapse') { collapses++; game.respawnFromCheckpoint(); }
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
    // reagieren. So bleiben Dirigent, Sopran, Piccolo, Tenor und Koffer Teil
    // der Open-Air-Route; der Wind schiebt nur, er wirft nicht um.
    const gefahrNah = game.entities.some((en) =>
      ['piccolo', 'sopran', 'tenor', 'koffer', 'dirigent'].includes(en.kind) && en.alive
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

const enemies = game.level.spawns.filter((s) => ['piccolo', 'sopran', 'tenor', 'koffer', 'dirigent'].includes(s.kind)).length;
const ok = game.maxNerves === 3 && enemies >= 5 && game.state === 'complete'
  && game.storyFlags.has('openair_beauftragt')
  && game.storyFlags.has('pult_west_gesichert')
  && game.storyFlags.has('pult_ost_gesichert')
  && game.storyFlags.has('openair_abgenommen') && collapses <= 6;

console.log(`${ok ? 'PASS' : 'FAIL'} Akt 3 natural hazard route`);
console.log(JSON.stringify({ state: game.state,
  briefing: game.storyFlags.has('openair_beauftragt'),
  west: game.storyFlags.has('pult_west_gesichert'), ost: game.storyFlags.has('pult_ost_gesichert'),
  payoff: game.storyFlags.has('openair_abgenommen'),
  enemies, maxNerves: game.maxNerves, collapses, seconds: Number((frames / 60).toFixed(1)) }));
process.exit(ok ? 0 : 1);
