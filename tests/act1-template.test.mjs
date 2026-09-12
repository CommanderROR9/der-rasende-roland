// Contract tests for the reusable Act-1 story/level template.
// Written before the implementation: run directly with `node tests/act1-template.test.mjs`.
import { buildAkt1 } from '../src/world.js';
import { Game } from '../src/game.js';
import { createInput } from '../src/input.js';
import { PHYS, TILE } from '../src/config.js';
import { SPRITES } from '../src/sprites.js';

const results = [];
let failed = 0;
function check(name, condition, extra = '') {
  const ok = !!condition;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ` — ${extra}`}`);
}
function makeGame() {
  const input = createInput(null);
  const events = [];
  const game = new Game({
    level: buildAkt1(), input,
    audio: { play() {}, resume() {} },
    events: (event) => events.push(event),
    difficulty: 'gemuetlich',
  });
  game.reset('schwarz');
  return { game, input, events };
}
function placeAt(game, entity) {
  game.player.x = entity.x - 18;
  game.player.y = entity.y + entity.h - PHYS.playerH;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.h = PHYS.playerH;
  game.update(1 / 60);
}
function tap(game, input) {
  input.setKey('action', true);
  game.update(1 / 60);
  input.setKey('action', false);
  game.update(1 / 60);
}

const level = buildAkt1();
const npcs = level.spawns.filter((s) => s.kind === 'npc');
const decors = level.spawns.filter((s) => s.kind === 'decor');
const sheets = level.spawns.filter((s) => s.kind === 'item' && s.item === 'stimmblatt');

check('Akt 1 defines a reusable story-step sequence',
  Array.isArray(level.storySteps) && level.storySteps.length >= 4,
  JSON.stringify(level.storySteps));
check('Ada appears for briefing and payoff',
  npcs.filter((s) => s.npc === 'ada').length === 2,
  JSON.stringify(npcs));
check('both Ada encounters contain authored dialogue',
  npcs.length === 2 && npcs.every((s) => Array.isArray(s.dialog) && s.dialog.length >= 2));
check('the payoff Ada requires the complete score',
  npcs.some((s) => s.flag === 'ada_verabschiedet' && (s.requires || []).includes('mappe')));
check('five or more distinct set-piece sprites establish the rooms',
  new Set(decors.map((s) => s.spr)).size >= 5,
  decors.map((s) => s.spr).join(','));
const archiveSheet = sheets.find((s) => s.spr === 'stimme_bass');
check('archive shelves are visible from the third-sheet route',
  decors.some((s) => s.spr === 'notenregal' && Math.abs(s.walkRow - archiveSheet.walkRow) <= 2));
const dominantMotif = (from, to) => decors.some((s) => {
  if (s.tx < from || s.tx > to || !SPRITES[s.spr]) return false;
  const rows = SPRITES[s.spr];
  return rows.length >= 20 && Math.max(...rows.map((row) => row.length)) >= 24;
});
check('stimmengang has a dominant room-scale motif', dominantMotif(26, 52));
check('machinery has a dominant room-scale motif', dominantMotif(111, 130));
check('the three score sheets have distinct readable sprites',
  sheets.length === 3 && new Set(sheets.map((s) => s.spr)).size === 3,
  JSON.stringify(sheets));
const profile = (rows) => rows.map((row) => {
  const first = row.search(/\S/);
  return `${first}:${row.length - 1 - [...row].reverse().join('').search(/\S/)}`;
}).join('|');
check('score sheets use three distinct outer profiles, not microtext alone',
  new Set(sheets.map((s) => profile(SPRITES[s.spr]))).size === 3);
check('sheet pickups carry a midpoint ensemble story beat',
  sheets.every((s) => typeof s.found === 'string') && sheets.some((s) => s.found.includes('ZUSAMMEN')));
{
  const { game: discoveries } = makeGame();
  const expected = [
    ['stimme_violine', 'ZUGABE'],
    ['stimme_bratsche', 'ZUSAMMEN'],
    ['stimme_bass', 'ENSEMBLE'],
  ];
  for (const [sprite, phrase] of expected) {
    const sheet = discoveries.entities.find((en) => en.kind === 'item' && en.spr === sprite);
    discoveries.hint = null;
    discoveries.hintQueue = [];
    discoveries.collect(sheet);
    check(`${sprite} discovery text survives runtime construction`,
      discoveries.hint?.text.includes(phrase), discoveries.hint?.text || 'no hint');
  }
}
check('all new Act-1 sprite matrices exist',
  ['ada', 'stimme_violine', 'stimme_bratsche', 'stimme_bass', 'spinde', 'notenregal', 'rohrventil', 'lastenhaken', 'dienstplan41']
    .every((name) => Array.isArray(SPRITES[name]) && SPRITES[name].length > 5));
check('Act 1 explicitly declares a reversible route', level.route?.reversible === true);
check('the goal requires mappe and the Ada payoff',
  level.goal.need === 'mappe' && (level.goal.flags || []).includes('ada_verabschiedet'));
const briefingGateData = level.gates.find((g) => g.flag === 'ada_beauftragt');
check('the briefing room has a reusable story gate',
  !!briefingGateData && briefingGateData.locked?.includes('ADA'));

const runtime = makeGame();
const { game, input, events } = runtime;
check('the journal starts with the Ada briefing', (game.hud.ziel || '').includes('ADA'), game.hud.ziel);
const startAda = game.entities.find((e) => e.kind === 'npc' && e.flag === 'ada_beauftragt');
if (startAda) {
  placeAt(game, startAda);
  const label = game.hud.label;
  check('Ada is named and offers a deliberate interaction',
    label?.action === true && label.text.includes('ADA'), JSON.stringify(label));
  const beforeTritt = game.lastTritt;
  for (let i = 0; i < startAda.dialog.length; i++) tap(game, input);
  check('talking to Ada does not trigger the combat stomp', game.lastTritt === beforeTritt);
  check('the briefing completes a story flag', game.storyFlags?.has('ada_beauftragt') === true);
  if (briefingGateData) {
    const briefingGate = game.gates.find((g) => g.flag === 'ada_beauftragt');
    game.player.x = briefingGate.tx * TILE - game.player.w + 2;
    game.player.y = 25 * TILE - PHYS.playerH;
    game.update(1 / 60);
    check('finishing the briefing opens its story gate', briefingGate.open === true);
  } else {
    check('finishing the briefing opens its story gate', false, 'briefing gate missing');
  }
  check('the journal advances from briefing to score sheets',
    (game.hud.ziel || '').includes('STIMMBLÄTTER'), game.hud.ziel);
} else {
  check('Ada is named and offers a deliberate interaction', false, 'start Ada missing');
  check('talking to Ada does not trigger the combat stomp', false, 'start Ada missing');
  check('the briefing completes a story flag', false, 'start Ada missing');
  check('the journal advances from briefing to score sheets', false, 'start Ada missing');
}

const endAda = game.entities.find((e) => e.kind === 'npc' && e.flag === 'ada_verabschiedet');
if (endAda) {
  placeAt(game, endAda);
  tap(game, input);
  check('payoff dialogue stays locked before the score is complete',
    game.storyFlags?.has('ada_verabschiedet') !== true && (game.hud.hint || '').includes('STIMMEN'));
  game.hasMappe = true;
  for (let i = 0; i < endAda.dialog.length; i++) tap(game, input);
  check('Ada acknowledges the complete score', game.storyFlags?.has('ada_verabschiedet') === true);
  check('story completion emits a reusable event', events.some((e) => e.type === 'story' && e.flag === 'ada_verabschiedet'));
} else {
  check('payoff dialogue stays locked before the score is complete', false, 'payoff Ada missing');
  check('Ada acknowledges the complete score', false, 'payoff Ada missing');
  check('story completion emits a reusable event', false, 'payoff Ada missing');
}

const goal = game.level.goal;
game.player.x = goal.x;
game.player.y = goal.y + goal.h - PHYS.playerH;
game.player.vx = 0;
game.player.vy = 0;
game.hasMappe = true;
if (game.storyFlags) game.storyFlags.delete('ada_verabschiedet');
game.update(1 / 60);
check('the lift stays locked until the payoff conversation', game.state === 'play');
if (game.storyFlags) game.storyFlags.add('ada_verabschiedet');
game.update(1 / 60);
check('mappe plus payoff conversation complete Act 1', game.state === 'complete');

// Geometry contract: the former one-way drop is now a two-way staircase.
// Platforms at these rows are no more than two tiles apart vertically.
const stair = level.route?.returnStair || [];
check('the central return stair has at least three landings', stair.length >= 3);
check('the central return stair stays within jump height',
  stair.length >= 3 && stair.every((p, i) => i === 0 || Math.abs(p.row - stair[i - 1].row) <= 2),
  JSON.stringify(stair));
check('the mappe can be displayed as a carried object', !!SPRITES.mappe && TILE === 16);

// Generic composition contract: later acts may combine a conscious action with
// a story payoff. A need-specific early return must never skip story flags.
{
  const { game: composed } = makeGame();
  composed.level.goal = { ...composed.level.goal, need: 'setzen', flags: ['payoff_test'] };
  composed.setzen = true;
  check('combined action goals still require their story flags', composed.goalErfuellt() === false);
  composed.storyFlags.add('payoff_test');
  check('combined action goals open after action and story flag', composed.goalErfuellt() === true);
}

// At the final Ada, the dialogue is the actionable target even though the lift
// is already within label range. Once standing at the lift, the missing reason
// must name Ada rather than falsely claiming the carried score is absent.
{
  const { game: finale } = makeGame();
  const ada = finale.entities.find((e) => e.kind === 'npc' && e.flag === 'ada_verabschiedet');
  finale.hasMappe = true;
  finale.storyFlags.add('ada_beauftragt');
  finale.player.x = ada.x + 26;
  finale.player.y = ada.y + ada.h - PHYS.playerH;
  finale.update(1 / 60);
  check('Ada interaction label wins over the nearby lift',
    finale.hud.label?.action === true && finale.hud.label.text.includes('ADA'), JSON.stringify(finale.hud.label));
  finale.player.x = finale.level.goal.x;
  finale.player.y = finale.level.goal.y + finale.level.goal.h - PHYS.playerH;
  finale.update(1 / 60);
  check('lift label names the missing Ada payoff when mappe is carried',
    finale.hud.label?.text.includes('ADA') && !finale.hud.label.text.includes('MAPPE FEHLT'), JSON.stringify(finale.hud.label));
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Act-1 template checks passed`);
process.exit(failed ? 1 : 0);
