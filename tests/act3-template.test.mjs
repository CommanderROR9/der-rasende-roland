// Contract tests for the Act-3 story/level template (after the Act-1/2 model).
// Run directly with `node tests/act3-template.test.mjs`.
import { buildAkt3 } from '../src/world.js';
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
    level: buildAkt3(), input,
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

const level = buildAkt3();
const npcs = level.spawns.filter((s) => s.kind === 'npc');
const decors = level.spawns.filter((s) => s.kind === 'decor');
const pulte = level.spawns.filter((s) => s.kind === 'pult');
const daten = JSON.stringify(level);

check('Akt 3 defines a reusable story-step sequence',
  Array.isArray(level.storySteps) && level.storySteps.length >= 5,
  JSON.stringify(level.storySteps));
check('Rolf leads the open air: briefing and payoff',
  npcs.filter((s) => s.npc === 'rolf').length === 2,
  JSON.stringify(npcs.map((s) => `${s.name}/${s.flag}`)));
check('both Rolf encounters are named ROLF',
  npcs.length === 2 && npcs.every((s) => s.name === 'ROLF'));
check('both Rolf encounters contain authored dialogue',
  npcs.length === 2 && npcs.every((s) => Array.isArray(s.dialog) && s.dialog.length >= 2));
check('the payoff Rolf requires both secured pulte',
  npcs.some((s) => s.flag === 'openair_abgenommen'
    && (s.requires || []).includes('pult_west_gesichert')
    && (s.requires || []).includes('pult_ost_gesichert')),
  JSON.stringify(npcs.find((s) => s.flag === 'openair_abgenommen')));
check('payoff block text names the pulte, not a full restart',
  npcs.some((s) => s.flag === 'openair_abgenommen'
    && (s.blocked || '').includes('PULTE')));
check('Anna has no appearance in Act 3', !/anna/i.test(daten));
check('no Ada leftover in Act 3 data',
  !npcs.some((s) => s.npc === 'ada'));
check('six or more distinct set-piece sprites establish the rooms',
  new Set(decors.map((s) => s.spr)).size >= 6,
  decors.map((s) => s.spr).join(','));
check('all new Act-3 sprite matrices exist',
  ['rolf', 'klammer', 'klammerkiste', 'bauzaun', 'lichterkette', 'lautsprecher', 'buehnenportal']
    .every((name) => Array.isArray(SPRITES[name]) && SPRITES[name].length >= 6));
check('Rolf reads as a person, not a prop',
  Array.isArray(SPRITES.rolf) && SPRITES.rolf.length >= 20);
const dominantMotif = (from, to) => decors.some((s) => {
  if (s.tx < from || s.tx > to || !SPRITES[s.spr]) return false;
  const rows = SPRITES[s.spr];
  return rows.length >= 20 && Math.max(...rows.map((row) => row.length)) >= 24;
});
check('wiese has a dominant room-scale motif', dominantMotif(21, 64));
check('buehne has a dominant room-scale motif', dominantMotif(65, 104));
check('two pulte stand on the stage, each needing two clamps',
  pulte.length === 2 && pulte.every((s) => s.noetig === 2),
  JSON.stringify(pulte.map((s) => `${s.tx}/${s.noetig}/${s.flag}`)));
check('each pult carries its own story flag and action',
  pulte.some((s) => s.flag === 'pult_west_gesichert')
  && pulte.some((s) => s.flag === 'pult_ost_gesichert')
  && pulte.every((s) => s.aktion === 'PULT SICHERN'));
check('visible clamps wait at both pulte',
  decors.filter((s) => s.spr === 'klammer').length >= 2);
check('Act 3 explicitly declares a reversible route', level.route?.reversible === true);
check('two checkpoints back the hazard route',
  level.spawns.filter((s) => s.kind === 'checkpoint').length >= 2);
check('cover near the loud passages',
  level.alcoves.length >= 3, String(level.alcoves.length));
check('the goal requires einsatz, both pulte and the Rolf payoff',
  level.goal.need === 'einsatz'
  && (level.goal.flags || []).includes('pult_west_gesichert')
  && (level.goal.flags || []).includes('pult_ost_gesichert')
  && (level.goal.flags || []).includes('openair_abgenommen'));
check('the goal names the pulte while locked',
  (level.goal.flagLocked || '').includes('PULTE'));
check('five bierdeckel travel with the act', level.deckelTotal === 5, `n=${level.deckelTotal}`);
check('two taktwechsel carry the tempo', (level.takts || []).length === 2);
check('dirigent, piccolo, sopran, tenor and koffer play',
  ['dirigent', 'piccolo', 'sopran', 'tenor', 'koffer']
    .every((k) => level.spawns.some((s) => s.kind === k)));
check('the weather still cycles sonne, wind, regen, kaelte',
  (level.weather || []).map((w) => w.kind).join(',') === 'sonne,wind,regen,kaelte');
const briefingGateData = level.gates.find((g) => g.flag === 'openair_beauftragt');
check('the parkplatz has a reusable story gate',
  !!briefingGateData && briefingGateData.locked?.includes('ROLF')
  && (briefingGateData.opened || '').includes('WIESE'));
check('the podium gate still asks for the frack',
  level.gates.some((g) => g.need === 'frack'));

const runtime = makeGame();
const { game, input, events } = runtime;
check('the journal starts with the Rolf briefing', (game.hud.ziel || '').includes('ROLF'), game.hud.ziel);
const startRolf = game.entities.find((e) => e.kind === 'npc' && e.flag === 'openair_beauftragt');
if (startRolf) {
  const gateShut = game.gates.find((g) => g.flag === 'openair_beauftragt');
  check('the absperrband starts locked', gateShut && gateShut.open === false);
  placeAt(game, startRolf);
  const label = game.hud.label;
  check('Rolf is named and offers a deliberate interaction',
    label?.action === true && label.text.includes('ROLF'), JSON.stringify(label));
  const beforeTritt = game.lastTritt;
  for (let i = 0; i < startRolf.dialog.length; i++) tap(game, input);
  check('talking to Rolf does not trigger the combat stomp', game.lastTritt === beforeTritt);
  check('the briefing completes a story flag', game.storyFlags?.has('openair_beauftragt') === true);
  if (briefingGateData) {
    const briefingGate = game.gates.find((g) => g.flag === 'openair_beauftragt');
    game.player.x = briefingGate.tx * TILE - game.player.w + 2;
    game.player.y = 25 * TILE - PHYS.playerH;
    game.update(1 / 60);
    check('finishing the briefing opens its story gate', briefingGate.open === true);
  } else {
    check('finishing the briefing opens its story gate', false, 'briefing gate missing');
  }
  check('the journal advances to the west pult',
    (game.hud.ziel || '').includes('WESTPULT'), game.hud.ziel);
} else {
  check('Rolf is named and offers a deliberate interaction', false, 'briefing Rolf missing');
  check('talking to Rolf does not trigger the combat stomp', false, 'briefing Rolf missing');
  check('the briefing completes a story flag', false, 'briefing Rolf missing');
  check('the journal advances to the west pult', false, 'briefing Rolf missing');
}

// The pulte: two takte im Takt each, a miss is a pointe (no restart),
// each secured pult sets its own story flag.
for (const flag of ['pult_west_gesichert', 'pult_ost_gesichert']) {
  const pult = game.entities.find((en) => en.kind === 'pult' && en.flag === flag);
  if (!pult) {
    check(`pult ${flag} stands on the stage`, false, 'pult missing');
    continue;
  }
  game.player.x = pult.x + 4;
  game.player.y = pult.y + pult.h - PHYS.playerH;
  game.player.vx = 0; game.player.vy = 0;
  game.update(1 / 60);
  const pultLabel = game.hud.label;
  check(`pult ${flag} offers a deliberate sichern action`,
    pultLabel?.action === true && pultLabel.text.includes('SICHERN'), JSON.stringify(pultLabel));
  game.hint = null;
  game.hintQueue = [];
  game.beatPhase = 0.5;
  tap(game, input);
  check(`a missed takt at ${flag} counts nothing`, pult.teil === 0);
  check(`a miss at ${flag} is a pointe, not a restart`,
    (game.hud.hint || '').includes('DANEBEN') && game.state === 'play', game.hud.hint);
  tapTakt(game, input);
  check(`first clamp sits at ${flag}`, pult.teil === 1);
  tapTakt(game, input);
  check(`two clean takte secure ${flag}`,
    pult.teil === 2 && game.storyFlags?.has(flag) === true);
  check(`securing ${flag} emits a reusable event`,
    events.some((e) => e.type === 'story' && e.flag === flag));
}

const endRolf = game.entities.find((e) => e.kind === 'npc' && e.flag === 'openair_abgenommen');
if (endRolf) {
  const fresh2 = makeGame();
  const rolf2 = fresh2.game.entities.find((e) => e.kind === 'npc' && e.flag === 'openair_abgenommen');
  placeAt(fresh2.game, rolf2);
  tap(fresh2.game, fresh2.input);
  check('payoff dialogue stays locked before the pulte',
    fresh2.game.storyFlags?.has('openair_abgenommen') !== true
    && (fresh2.game.hud.hint || '').includes('PULTE'));
  placeAt(game, endRolf);
  for (let i = 0; i < endRolf.dialog.length; i++) tap(game, input);
  check('Rolf acknowledges both secured pulte', game.storyFlags?.has('openair_abgenommen') === true);
  check('story completion emits a reusable event',
    events.some((e) => e.type === 'story' && e.flag === 'openair_abgenommen'));
} else {
  check('payoff dialogue stays locked before the pulte', false, 'payoff Rolf missing');
  check('Rolf acknowledges both secured pulte', false, 'payoff Rolf missing');
}

const goal = game.level.goal;
game.player.x = goal.x;
game.player.y = goal.y + goal.h - PHYS.playerH;
game.player.vx = 0;
game.player.vy = 0;
if (game.storyFlags) game.storyFlags.delete('openair_abgenommen');
game.update(1 / 60);
check('the podium stays locked until the payoff conversation', game.state === 'play');
if (game.storyFlags) game.storyFlags.add('openair_abgenommen');
game.update(1 / 60);
check('pulte plus payoff conversation complete Act 3', game.state === 'complete');

// Geometry contract: geruest staircase stays within jump height both ways.
const stair = level.route?.returnStair || [];
check('the return stair has at least three landings', stair.length >= 3);
check('the return stair stays within jump height',
  stair.length >= 3 && stair.every((p, i) => i === 0 || Math.abs(p.row - stair[i - 1].row) <= 2),
  JSON.stringify(stair));

// Am Podium wartet Rolf unmittelbar neben dem Ziel; dort bleibt das Gespraech
// die ausfuehrbare Aktion (dieselbe Regel wie bei Anna in Akt 1/2, siehe
// Pruefung darueber — in Akt 3 stehen sich beide bewusst gegenueber). Das
// gesperrte Ziel meldet sich beim Betreten selbst und benennt die fehlenden
// Pulte.
{
  const { game: finale } = makeGame();
  const rolf = finale.entities.find((e) => e.kind === 'npc' && e.flag === 'openair_abgenommen');
  finale.storyFlags.add('openair_beauftragt');
  finale.storyFlags.add('pult_ost_gesichert');          // ein Pult fehlt bewusst
  finale.player.x = rolf.x - 18;   // neben Rolf — das Ziel bleibt in Reichweite
  finale.player.y = rolf.y + rolf.h - PHYS.playerH;
  finale.update(1 / 60);
  check('Rolf interaction label wins over the nearby goal',
    finale.hud.label?.action === true && finale.hud.label.text.includes('ROLF'), JSON.stringify(finale.hud.label));
  finale.hint = null;
  finale.hintQueue = [];
  finale.player.x = finale.level.goal.x;
  finale.player.y = finale.level.goal.y + finale.level.goal.h - PHYS.playerH;
  finale.player.vx = 0;
  finale.player.vy = 0;
  finale.update(1 / 60);
  // Der Bierdeckel auf dem Podium meldet sich zuerst; die Sperre darf deshalb
  // auch in der Warteschlange stehen — sie muss nur angekommen sein.
  const wartend = (finale.hintQueue || []).map((q) => q.text);
  const meldungen = [finale.hud.hint || '', ...wartend];
  check('the locked podium names the missing pulte on contact',
    finale.state === 'play' && meldungen.some((text) => /PULTE/.test(text))
    && (finale.hud.label?.text || '').includes('ROLF'),
    JSON.stringify({ state: finale.state, hint: finale.hud.hint, queue: wartend, label: finale.hud.label }));
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Act-3 template checks passed`);
process.exit(failed ? 1 : 0);
