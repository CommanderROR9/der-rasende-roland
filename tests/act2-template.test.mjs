// Contract tests for the Act-2 story/level template (after the Act-1 model).
// Run directly with `node tests/act2-template.test.mjs`.
import { buildAkt2, PROBEN_MOTIV } from '../src/world.js';
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
    level: buildAkt2(), input,
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
function tapTakt(game, input) {
  game.beatPhase = 0.02;
  tap(game, input);
}

const level = buildAkt2();
const npcs = level.spawns.filter((s) => s.kind === 'npc');
const decors = level.spawns.filter((s) => s.kind === 'decor');
const daten = JSON.stringify(level);

check('Akt 2 defines a reusable story-step sequence',
  Array.isArray(level.storySteps) && level.storySteps.length >= 4,
  JSON.stringify(level.storySteps));
check('Anna leads the rehearsal: briefing and payoff',
  npcs.filter((s) => s.npc === 'ada').length === 2,
  JSON.stringify(npcs.map((s) => `${s.name}/${s.flag}`)));
check('both Anna encounters are named ANNA',
  npcs.length === 2 && npcs.every((s) => s.name === 'ANNA'));
check('both Anna encounters contain authored dialogue',
  npcs.length === 2 && npcs.every((s) => Array.isArray(s.dialog) && s.dialog.length >= 2));
check('the payoff Anna requires briefing and the joint einsatz',
  npcs.some((s) => s.flag === 'probe_abgenommen'
    && (s.requires || []).includes('probe_beauftragt')
    && (s.requires || []).includes('einsatz_gelungen')),
  JSON.stringify(npcs.find((s) => s.flag === 'probe_abgenommen')));
check('payoff block text names the einsatz, not a full restart',
  npcs.some((s) => s.flag === 'probe_abgenommen'
    && (s.blocked || '').includes('EINSATZ')));
check('Rolf has no appearance in Act 2 (his entrance is Act 4)', !/rolf/i.test(daten));
check('no Oskar leftover in Act 2 data', !/oskar/i.test(daten));
check('five or more distinct set-piece sprites establish the rooms',
  new Set(decors.map((s) => s.spr)).size >= 5,
  decors.map((s) => s.spr).join(','));
check('all new Act-2 sprite matrices exist',
  ['probentafel', 'stuhlreihe', 'notenpult', 'scheinwerfer', 'buehnenvorhang']
    .every((name) => Array.isArray(SPRITES[name]) && SPRITES[name].length >= 8));
const dominantMotif = (from, to) => decors.some((s) => {
  if (s.tx < from || s.tx > to || !SPRITES[s.spr]) return false;
  const rows = SPRITES[s.spr];
  return rows.length >= 20 && Math.max(...rows.map((row) => row.length)) >= 24;
});
check('saal has a dominant room-scale motif', dominantMotif(25, 72));
check('hinterbuehne has a dominant room-scale motif', dominantMotif(97, 124));
check('the pult asks for three takte and names the motive',
  level.spawns.some((s) => s.kind === 'pult' && s.noetig === 3 && s.motiv === 'probe-motiv'));
check('the motive is quotable for the finale (Act 5)',
  level.motiv?.id === 'probe-motiv' && PROBEN_MOTIV.id === 'probe-motiv'
  && (level.motiv.merk || '').includes('FINALE'));
check('Act 2 explicitly declares a reversible route', level.route?.reversible === true);
check('two checkpoints back the hazard route',
  level.spawns.filter((s) => s.kind === 'checkpoint').length >= 2);
check('cover near the loud passages',
  level.alcoves.length >= 3, String(level.alcoves.length));
check('the goal requires einsatz and the Anna payoff',
  level.goal.need === 'einsatz' && (level.goal.flags || []).includes('probe_abgenommen'));
check('five bierdeckel travel with the act', level.deckelTotal === 5, `n=${level.deckelTotal}`);
check('two taktwechsel carry the tempo', (level.takts || []).length === 2);
check('dirigent, piccolo duo, sopran, tenor and koffer play',
  ['dirigent', 'piccolo', 'sopran', 'tenor', 'koffer']
    .every((k) => level.spawns.some((s) => s.kind === k)));
const briefingGateData = level.gates.find((g) => g.flag === 'probe_beauftragt');
check('the flur has a reusable story gate',
  !!briefingGateData && briefingGateData.locked?.includes('ANNA')
  && (briefingGateData.opened || '').includes('PROBENSAAL'));
check('the buehnentuer still asks for the frack',
  level.gates.some((g) => g.need === 'frack'));

const runtime = makeGame();
const { game, input, events } = runtime;
check('the journal starts with the Anna briefing', (game.hud.ziel || '').includes('ANNA'), game.hud.ziel);
const startAnna = game.entities.find((e) => e.kind === 'npc' && e.flag === 'probe_beauftragt');
if (startAnna) {
  placeAt(game, startAnna);
  const label = game.hud.label;
  check('Anna is named and offers a deliberate interaction',
    label?.action === true && label.text.includes('ANNA'), JSON.stringify(label));
  const beforeTritt = game.lastTritt;
  for (let i = 0; i < startAnna.dialog.length; i++) tap(game, input);
  check('talking to Anna does not trigger the combat stomp', game.lastTritt === beforeTritt);
  check('the briefing completes a story flag', game.storyFlags?.has('probe_beauftragt') === true);
  if (briefingGateData) {
    const briefingGate = game.gates.find((g) => g.flag === 'probe_beauftragt');
    game.player.x = briefingGate.tx * TILE - game.player.w + 2;
    game.player.y = 25 * TILE - PHYS.playerH;
    game.update(1 / 60);
    check('finishing the briefing opens its story gate', briefingGate.open === true);
  } else {
    check('finishing the briefing opens its story gate', false, 'briefing gate missing');
  }
  check('the journal advances to mappe and einsatz',
    (game.hud.ziel || '').includes('MAPPE'), game.hud.ziel);
} else {
  check('Anna is named and offers a deliberate interaction', false, 'briefing Anna missing');
  check('talking to Anna does not trigger the combat stomp', false, 'briefing Anna missing');
  check('the briefing completes a story flag', false, 'briefing Anna missing');
  check('the journal advances to mappe and einsatz', false, 'briefing Anna missing');
}

// The pult: mappe first (no takt spent), a miss is a pointe (no restart),
// three clean takte are the joint einsatz.
const pult = game.entities.find((en) => en.kind === 'pult');
if (pult) {
  game.player.x = pult.x + 4;
  game.player.y = pult.y + pult.h - PHYS.playerH;
  game.player.vx = 0; game.player.vy = 0;
  game.update(1 / 60);
  const pultLabel = game.hud.label;
  check('the pult offers a deliberate einsatz action',
    pultLabel?.action === true && pultLabel.text.includes('EINSATZ'), JSON.stringify(pultLabel));
  game.hasMappe = true;
  tapTakt(game, input);
  check('mappe lands on the pult', game.mappeAbgegeben === true && game.hasMappe === false);
  check('laying down the mappe costs no takt', pult.teil === 0);
  check('mappe handover sets a story flag', game.storyFlags?.has('mappe_abgegeben') === true);
  game.hintQueue = [];
  game.update(1 / 60);
  game.beatPhase = 0.5;
  tap(game, input);
  check('a missed takt counts nothing', pult.teil === 0);
  check('a miss is a pointe, not a restart',
    (game.hud.hint || '').includes('DANEBEN') && game.state === 'play'
    && game.mappeAbgegeben === true, game.hud.hint);
  for (let i = 0; i < 3; i++) tapTakt(game, input);
  check('three clean takte are the joint einsatz',
    pult.teil === 3 && game.einsatzGelungen === true);
  check('the einsatz sets a story flag', game.storyFlags?.has('einsatz_gelungen') === true);
  check('einsatz completion emits a reusable event',
    events.some((e) => e.type === 'einsatz'));
} else {
  for (const name of ['the pult offers a deliberate einsatz action', 'mappe lands on the pult',
    'three clean takte are the joint einsatz']) check(name, false, 'pult missing');
}

const endAnna = game.entities.find((e) => e.kind === 'npc' && e.flag === 'probe_abgenommen');
if (endAnna) {
  const fresh2 = makeGame();
  const anna2 = fresh2.game.entities.find((e) => e.kind === 'npc' && e.flag === 'probe_abgenommen');
  placeAt(fresh2.game, anna2);
  tap(fresh2.game, fresh2.input);
  check('payoff dialogue stays locked before the einsatz',
    fresh2.game.storyFlags?.has('probe_abgenommen') !== true
    && (fresh2.game.hud.hint || '').includes('EINSATZ'));
  placeAt(game, endAnna);
  for (let i = 0; i < endAnna.dialog.length; i++) tap(game, input);
  check('Anna acknowledges the joint einsatz', game.storyFlags?.has('probe_abgenommen') === true);
  check('story completion emits a reusable event',
    events.some((e) => e.type === 'story' && e.flag === 'probe_abgenommen'));
} else {
  check('payoff dialogue stays locked before the einsatz', false, 'payoff Anna missing');
  check('Anna acknowledges the joint einsatz', false, 'payoff Anna missing');
}

const goal = game.level.goal;
game.player.x = goal.x;
game.player.y = goal.y + goal.h - PHYS.playerH;
game.player.vx = 0;
game.player.vy = 0;
if (game.storyFlags) game.storyFlags.delete('probe_abgenommen');
game.update(1 / 60);
check('the buehneneingang stays locked until the payoff conversation', game.state === 'play');
if (game.storyFlags) game.storyFlags.add('probe_abgenommen');
game.update(1 / 60);
check('einsatz plus payoff conversation complete Act 2', game.state === 'complete');

// Geometry contract: pulte staircase stays within jump height both ways.
const stair = level.route?.returnStair || [];
check('the return stair has at least three landings', stair.length >= 3);
check('the return stair stays within jump height',
  stair.length >= 3 && stair.every((p, i) => i === 0 || Math.abs(p.row - stair[i - 1].row) <= 2),
  JSON.stringify(stair));
check('the mappe can be displayed as a carried object', !!SPRITES.mappe && TILE === 16);

// At the final Anna, the dialogue is the actionable target even though the goal
// is already within label range.
{
  const { game: finale } = makeGame();
  const ada = finale.entities.find((e) => e.kind === 'npc' && e.flag === 'probe_abgenommen');
  finale.hasMappe = true;
  finale.storyFlags.add('probe_beauftragt');
  finale.storyFlags.add('einsatz_gelungen');
  finale.player.x = ada.x + 26;
  finale.player.y = ada.y + ada.h - PHYS.playerH;
  finale.update(1 / 60);
  check('Anna interaction label wins over the nearby goal',
    finale.hud.label?.action === true && finale.hud.label.text.includes('ANNA'), JSON.stringify(finale.hud.label));
  finale.player.x = finale.level.goal.x;
  finale.player.y = finale.level.goal.y + finale.level.goal.h - PHYS.playerH;
  finale.update(1 / 60);
  check('goal label names the missing Anna payoff when einsatz is done',
    finale.hud.label?.text.includes('ANNA'), JSON.stringify(finale.hud.label));
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Act-2 template checks passed`);
process.exit(failed ? 1 : 0);
