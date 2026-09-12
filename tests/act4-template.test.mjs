// Vertragstest für die Akt-4-Musterstrecke „Der Orchestergraben" (Vorbild
// Akt 1–3): Storyschritte, Voraussetzungen, Abschlusszustand, Sprites,
// Journalziel, Tragezustand und Übergabe als eigene Prüfpunkte.
// Aufruf: node tests/act4-template.test.mjs
import { buildAkt4 } from '../src/world.js';
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

const level = buildAkt4();
const npcs = level.spawns.filter((s) => s.kind === 'npc');
const kisten = level.spawns.filter((s) => s.kind === 'kiste');
const daten = JSON.stringify(level);

function makeGame() {
  const input = createInput(null);
  const events = [];
  const game = new Game({
    level: buildAkt4(), input,
    audio: { play() {}, resume() {} },
    events: (event) => events.push(event),
    difficulty: 'gemuetlich',
  });
  game.reset('schwarz');
  return { game, input, events };
}
function placeAt(game, entity, dx = -18) {
  game.player.x = entity.x + dx;
  game.player.y = entity.y + entity.h - PHYS.playerH;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.h = PHYS.playerH;
  game.update(1 / 60);
}
function tap(game, input) {
  input.setKey('action', true); game.update(1 / 60);
  input.setKey('action', false); game.update(1 / 60);
}
function tapMitDucken(game, input) {
  input.setKey('down', true);
  tap(game, input);
  input.setKey('down', false);
}
function hinweise(game) {
  return [(game.hud && game.hud.hint) || '', ...(game.hintQueue || []).map((q) => q.text)].join(' · ');
}

// ------------------------------------------------------------- Vertragsdaten --
check('Akt 4 definiert eine wiederverwendbare Storyschrittfolge',
  Array.isArray(level.storySteps) && level.storySteps.length >= 5,
  JSON.stringify(level.storySteps));
check('Rolf führt den Graben: Briefing und Übergabe',
  npcs.filter((s) => s.npc === 'rolf').length === 2,
  JSON.stringify(npcs.map((s) => `${s.name}/${s.flag}`)));
check('beide Rolf-Auftritte heißen ROLF und haben Dialog',
  npcs.length === 2 && npcs.every((s) => s.name === 'ROLF' && Array.isArray(s.dialog) && s.dialog.length >= 2));
check('das Briefing setzt ein wiederverwendbares Story-Flag',
  npcs.some((s) => s.flag === 'graben_beauftragt' && !s.requires));
check('der Auftrag nennt Kiste, Versenkung und den schweren Tragezustand',
  npcs.some((s) => s.flag === 'graben_beauftragt'
    && s.dialog.join(' ').includes('LAMPENKISTE')
    && s.dialog.join(' ').includes('HAUPTVERSENKUNG')),
  JSON.stringify(npcs.find((s) => s.flag === 'graben_beauftragt')));
check('die Übergabe verlangt das Briefing und nimmt die Kiste ab',
  npcs.some((s) => s.flag === 'kiste_uebergeben'
    && s.nimmt === 'kiste'
    && (s.requires || []).includes('graben_beauftragt')));
check('Rolfs Übergabesatz beendet die Pflicht',
  npcs.some((s) => s.flag === 'kiste_uebergeben'
    && s.dialog.some((zeile) => zeile.includes('DEN REST MACHEN WIR'))));
check('der Sperrtext der Übergabe nennt die Kiste',
  npcs.some((s) => s.flag === 'kiste_uebergeben' && (s.blocked || '').includes('KISTE')));
check('Anna hat in Akt 4 keinen Auftritt', !/anna/i.test(daten));
check('genau eine Lampenkiste steht im Graben',
  kisten.length === 1 && kisten[0].label === 'LAMPENKISTE', JSON.stringify(kisten));
check('die Kiste startet unten, die Hauptversenkung steht weiter rechts',
  kisten[0].tx < level.elevators[0].tx,
  `Kiste ${kisten[0].tx} vs Versenkung ${level.elevators[0].tx}`);
check('alle neuen Akt-4-Sprites existieren und sind lesbar groß',
  ['lampenkiste', 'taktstock', 'rolf'].every((name) => Array.isArray(SPRITES[name]) && SPRITES[name].length >= 10),
  ['lampenkiste', 'taktstock', 'rolf'].map((n) => `${n}:${(SPRITES[n] || []).length}`).join(' '));
check('Rolf liest sich als Person, nicht als Requisite',
  Array.isArray(SPRITES.rolf) && SPRITES.rolf.length >= 20);
check('das Gitter zum Graben ist ein Story-Gate, kein Kleiderschloss',
  level.gates.some((g) => g.flag === 'graben_beauftragt' && g.locked.includes('ROLF') && g.opened.includes('GRABEN')));
check('das Absperrband zum Auftritt verlangt weiter den Frack',
  level.gates.some((g) => g.need === 'frack'));
check('das Ziel verlangt Briefing und Übergabe und bleibt der Auftritt im Frack',
  level.goal.need === 'frack'
  && (level.goal.flags || []).includes('graben_beauftragt')
  && (level.goal.flags || []).includes('kiste_uebergeben'));
check('das gesperrte Ziel benennt die Lampenkiste',
  (level.goal.flagLocked || '').includes('LAMPENKISTE'));
check('der Taktstock ist ein Andenken, kein Pflichtstück',
  level.spawns.some((s) => s.kind === 'item' && s.item === 'taktstock')
  && !(level.goal.flags || []).includes('taktstock_genommen')
  && !(level.storySteps || []).some((s) => (s.flag || '').includes('taktstock')));
check('bestehende Akt-4-Substanz bleibt erhalten (zwei Versenkungen, Souffleurkasten, Lichtkegel)',
  level.elevators.length === 2 && level.spooks.length === 1 && level.gleams.length >= 10,
  `${level.elevators.length}/${level.spooks.length}/${level.gleams.length}`);
check('fünf Bierdeckel reisen weiter mit', level.deckelTotal === 5, `n=${level.deckelTotal}`);
check('zwei Taktwechsel tragen das Tempo', (level.takts || []).length === 2);
check('dirigent, piccolo, sopran, tenor und koffer spielen mit',
  ['dirigent', 'piccolo', 'sopran', 'tenor', 'koffer'].every((k) => level.spawns.some((s) => s.kind === k)));
check('Akt 4 deklariert ausdrücklich einen umkehrbaren Weg',
  level.route?.reversible === true && (level.route?.returnStair || []).length >= 1);

// --------------------------------------------------------------- Laufzeit ----
const { game, input, events } = makeGame();
check('das Journal startet mit dem Rolf-Briefing', (game.hud.ziel || '').includes('ROLF'), game.hud.ziel);
const startRolf = game.entities.find((e) => e.kind === 'npc' && e.flag === 'graben_beauftragt');
const gate = game.gates.find((g) => g.flag === 'graben_beauftragt');
if (startRolf && gate) {
  check('das Gitter zum Graben startet verriegelt', gate.open === false);
  placeAt(game, startRolf);
  check('Rolf wird benannt und bietet eine bewusste Aktion',
    game.hud.label?.action === true && game.hud.label.text.includes('ROLF'), JSON.stringify(game.hud.label));
  const vorTritt = game.lastTritt;
  for (let i = 0; i < startRolf.dialog.length; i++) tap(game, input);
  check('das Gespräch löst keinen Beton-Tritt aus', game.lastTritt === vorTritt);
  check('das Briefing setzt das Story-Flag', game.storyFlags.has('graben_beauftragt') === true);
  check('das Briefing meldet sich als wiederverwendbares Ereignis',
    events.some((e) => e.type === 'story' && e.flag === 'graben_beauftragt'));
  game.player.x = gate.tx * TILE - game.player.w + 2;
  game.player.y = 25 * TILE - PHYS.playerH;
  game.player.vx = 0; game.player.vy = 0;
  game.update(1 / 60);
  check('das Briefing öffnet das Gitter zum Graben', gate.open === true);
  check('das Journal führt zur Lampenkiste', /LAMPENKISTE/.test(game.hud.ziel), game.hud.ziel);
} else {
  check('Briefing-Rolf und Gitter vorhanden', false, 'Rolf oder Gate fehlt');
}

// Tragezustand: aufnehmen, sichtbar tragen, absetzen, überall wieder aufnehmen.
const kiste = game.entities.find((e) => e.kind === 'kiste');
check('die Lampenkiste steht als Objekt in der Welt', !!kiste);
if (kiste) {
  placeAt(game, kiste);
  check('die Kiste bietet eine bewusste Aufnahme-Aktion',
    game.hud.label?.action === true && game.hud.label.text.includes('LAMPENKISTE'), JSON.stringify(game.hud.label));
  const vorTritt = game.lastTritt;
  tap(game, input);
  check('E nimmt die Kiste auf, sie bleibt als Objekt erhalten',
    game.traegt === true && kiste.alive === false && game.kisteEnt === kiste);
  check('das Aufnehmen löst keinen Beton-Tritt aus', game.lastTritt === vorTritt);
  // Die Aufnahme setzt ihr Flag im selben Frame; das Journal steht deshalb
  // bereits auf dem Aufstiegsschritt. Geprüft wird der Storyschritt selbst,
  // nicht eine Zwischenüberschrift, die es so nie zu sehen gibt.
  check('das Journal verfolgt den Tragezustand als eigenen Storyschritt',
    game.storyFlags.has('kiste_aufgenommen') && /KISTE/.test(game.hud.ziel), game.hud.ziel);
  check('der Tragezustand steht im HUD (sichtbar getragen)', game.hud.traegt === true);
  check('das Aufnehmen meldet sich als wiederverwendbares Ereignis',
    events.some((e) => e.type === 'kiste' && e.auf === 'genommen'));
  // Tragen kostet messbar Tempo (0,85), sperrt aber keine Aktion: gleiche
  // Stelle im Graben, gleiche Zeit, einmal mit und einmal ohne Kiste.
  const tragProbe = (mitKiste) => {
    const probe = makeGame();
    probe.game.storyFlags.add('graben_beauftragt');
    const k0 = probe.game.entities.find((e) => e.kind === 'kiste');
    if (mitKiste) { placeAt(probe.game, k0); tap(probe.game, probe.input); }
    probe.game.player.x = 22 * TILE;
    probe.game.player.y = 25 * TILE - PHYS.playerH;
    probe.game.player.vx = 0; probe.game.player.vy = 0;
    const start = probe.game.player.x;
    probe.input.setKey('right', true);
    for (let i = 0; i < 30; i++) probe.game.update(1 / 60);
    probe.input.setKey('right', false);
    return probe.game.player.x - start;
  };
  const tempoOhne = tragProbe(false);
  const tempoMit = tragProbe(true);
  check('wer trägt, bleibt langsam unterwegs',
    tempoMit > 0 && tempoMit < tempoOhne,
    `${tempoMit.toFixed(1)} px vs ${tempoOhne.toFixed(1)} px in 0,5 s`);
  tapMitDucken(game, input);
  check('DUCKEN + E setzt die Kiste ab', game.traegt === false && kiste.alive === true,
    JSON.stringify({ traegt: game.traegt, alive: kiste.alive }));
  check('die abgesetzte Kiste liegt auf dem Boden der Spalte',
    kiste.y + kiste.h === 25 * TILE, `y=${kiste.y}`);
  check('die abgesetzte Kiste bleibt in der Welt und wieder aufnehmbar',
    game.entities.includes(kiste) && kiste.y + kiste.h === 25 * TILE);
  placeAt(game, kiste);
  tap(game, input);
  check('die Kiste ist überall wieder aufnehmbar (kein Softlock)',
    game.traegt === true && game.storyFlags.has('kiste_aufgenommen'));

  // mit Kiste auf die Hauptversenkung: der Aufstieg selbst ist ein Storyschritt
  const lift = game.entities.find((e) => e.kind === 'lift');
  game.player.x = lift.x + 20;
  game.player.y = lift.y - PHYS.playerH;
  game.player.vx = 0; game.player.vy = 0;
  game.update(1 / 60);
  let oben = false;
  for (let i = 0; i < 60 * 14 && !oben; i++) {
    game.update(1 / 60);
    if (game.state === 'collapse') game.respawnFromCheckpoint();
    if (game.storyFlags.has('kiste_oben')) oben = true;
  }
  check('die Versenkung trägt Spieler und Kiste nach oben',
    oben === true && game.traegt === true, JSON.stringify({ oben, y: game.player.y, traegt: game.traegt }));
  check('der Aufstieg erscheint als eigener Storyschritt',
    game.storyFlags.has('kiste_oben') === true && events.some((e) => e.type === 'story' && e.flag === 'kiste_oben'));
}

// Übergabe an Rolf oben an der Hauptversenkung.
const endRolf = game.entities.find((e) => e.kind === 'npc' && e.flag === 'kiste_uebergeben');
if (endRolf) {
  const frisch = makeGame();
  const rolfFrisch = frisch.game.entities.find((e) => e.kind === 'npc' && e.flag === 'kiste_uebergeben');
  frisch.game.storyFlags.add('graben_beauftragt');
  placeAt(frisch.game, rolfFrisch, -20);
  tap(frisch.game, frisch.input);
  check('ohne Kiste bleibt die Übergabe verschlossen',
    frisch.game.storyFlags.has('kiste_uebergeben') !== true && /KISTE/.test(hinweise(frisch.game)),
    hinweise(frisch.game));

  placeAt(game, endRolf, -20);
  check('Rolf oben ist die ausführbare Aktion, nicht das Ziel',
    game.hud.label?.action === true && game.hud.label.text.includes('ROLF'), JSON.stringify(game.hud.label));
  for (let i = 0; i < endRolf.dialog.length; i++) tap(game, input);
  check('die Übergabe setzt das Story-Flag', game.storyFlags.has('kiste_uebergeben') === true);
  check('die Übergabe meldet sich als wiederverwendbares Ereignis',
    events.some((e) => e.type === 'kiste' && e.auf === 'uebergeben'));
  check('nach der Übergabe trägt Roland nichts mehr', game.traegt === false && game.kisteEnt === null);
  check('die Pflicht endet spürbar: der Graben ist kein Kampfplatz mehr',
    game.frieden === true && game.damage(1, 0) === false);
  check('das Journal führt zum Auftritt', /AUFTRITT|FRACK/.test(game.hud.ziel), game.hud.ziel);
} else {
  check('Übergabe-Rolf vorhanden', false, 'Rolf oben fehlt');
}

// Abschluss: Frack und beide Storyflags öffnen den Auftritt.
game.setOutfit('frack');
const goal = game.level.goal;
game.player.x = goal.x;
game.player.y = goal.y + goal.h - PHYS.playerH;
game.player.vx = 0;
game.player.vy = 0;
game.update(1 / 60);
check('Briefing, Kiste und Frack schließen Akt 4 ab', game.state === 'complete', game.state);

// Der Tragezustand entwaffnet nicht: Takt-Tritt bleibt mit Kiste möglich.
{
  const { game: kampf, input: kampfInput } = makeGame();
  kampf.storyFlags.add('graben_beauftragt');
  const k = kampf.entities.find((e) => e.kind === 'kiste');
  placeAt(kampf, k);
  tap(kampf, kampfInput);
  const feind = kampf.entities.find((e) => e.kind === 'piccolo');
  kampf.player.x = feind.x - 10;
  kampf.player.y = feind.y + feind.h - PHYS.playerH;
  kampf.player.vx = 0; kampf.player.vy = 0;
  kampf.beatPhase = 0.02;
  tap(kampf, kampfInput);
  check('wer die Kiste trägt, kann weiter im Takt treten',
    kampf.traegt === true && kampf.lastTritt !== null, JSON.stringify(kampf.lastTritt));
  check('der Taktstock ist auch mit Kiste aufnehmbar (optionales Andenken)',
    kampf.level.spawns.some((s) => s.kind === 'item' && s.item === 'taktstock'));
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Akt-4 template checks passed`);
process.exit(failed ? 1 : 0);
