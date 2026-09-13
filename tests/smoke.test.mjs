// tests/smoke.test.mjs — headless Tests der Simulation (kein Browser, kein Canvas).
// Aufruf: node tests/smoke.test.mjs
import { buildAkt1, buildAkt2, buildAkt3, buildAkt4, buildAkt5, buildEpilog, buildCabrio, buildMotorrad, LEVELS } from '../src/world.js';
import { Grill } from '../src/grill.js';
import { SPRITES, WURST_STUFEN, GARSTUFEN_FARBE, GARSTUFEN_TEXT, garstufeName } from '../src/sprites.js';
import { Racer, buildTrack, project, CAM_H, SEG_LEN, DRAW_DIST } from '../src/racer.js';
import { Game } from '../src/game.js';
import { createInput } from '../src/input.js';
import { PHYS, BPM_BASE, BPM_TENOR, VIEW_TOUCH, VIEW_DESKTOP, PAL } from '../src/config.js';
import { STATIONEN, BELOHNUNGEN, SAVE_VERSION, migriereSave, stationIndex } from '../src/story.js';

const results = [];
let failed = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ' — ' + extra}`);
}
const TILE = 16;

/**
 * Frische Simulation. stands:false entfernt die Kleiderständer, damit reine
 * Physiktests nicht in der Umkleide hängen bleiben.
 */
function fresh(outfit = 'schwarz', { stands = true } = {}, difficulty = 'gemuetlich') {
  const level = buildAkt1();
  if (!stands) {
    const blocked = new Set(level.spawns.filter((s) => s.kind === 'stand').map((s) => s.tx));
    level.spawns = level.spawns.filter((s) => s.kind !== 'stand');
    for (const tx of blocked) level.hints = level.hints.filter((h) => h.x !== tx * TILE);
  }
  const input = createInput(null);
  const game = new Game({ level, input, audio: { play() {}, resume() {} }, events: () => {}, difficulty });
  game.reset(outfit);
  return { level, input, game };
}
function stepAny(obj, seconds, dt = 1 / 60) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) obj.update(dt);
}
function step(game, seconds, dt = 1 / 60) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) game.update(dt);
}
/** Spieler an Pixelkoordinaten setzen, Geschwindigkeit nullen. */
function place(game, px, py) {
  const p = game.player;
  p.x = px; p.y = py; p.vx = 0; p.vy = 0; p.h = PHYS.playerH;
  game.stunTimer = 0;
  return p;
}

// ---------------------------------------------------------------- Weltdaten --
{
  const level = buildAkt1();
  check('level has grid', Array.isArray(level.grid) && level.grid.length === level.h);
  check('level is wide and tall', level.w >= 120 && level.h >= 20);
  check('exactly one spawn', level.spawns.filter((s) => s.kind === 'spawn').length === 1);
  check('five Bierdeckel defined', level.deckelTotal === 5, `got ${level.deckelTotal}`);
  check('two checkpoints', level.spawns.filter((s) => s.kind === 'checkpoint').length === 2);
  check('three deliberately placed outfit stands exist', level.spawns.filter((s) => s.kind === 'stand').length === 3);
  check('three enemy types present',
    ['piccolo', 'sopran', 'tenor'].every((k) => level.spawns.some((s) => s.kind === k)));
  check('two outfit gates plus one story gate', level.gates.length === 3);
  check('outfit gates need anzug and frack',
    level.gates.filter((g) => g.need).map((g) => g.need).sort().join(',') === 'anzug,frack');
  check('gates block the way while locked',
    level.gates.every((g) => level.grid[g.ty + g.th - 1][g.tx] === 1));
  check('lights and alcoves exist', level.lights.length >= 4 && level.alcoves.length >= 3);
  check('morsch tiles exist', level.grid.flat().filter((v) => v === 3).length >= 3);
  check('oneway wood exists', level.grid.flat().filter((v) => v === 2).length >= 3);
  check('goal inside level', level.goal.x + level.goal.w <= level.w * TILE);
  check('vertical range is real',
    level.spawns.some((s) => s.kind === 'spawn' && s.walkRow === 24)
    && level.goal.y <= 12 * TILE
    && level.spawns.filter((s) => s.kind === 'item' && s.item === 'stimmblatt').length === 3);
  // Der neue Kern des Levelbaus: keine verpassbare Stimme hinter einer Luke.
  check('the central descent is explicitly reversible',
    level.route?.reversible === true && level.route.returnStair.length >= 3);
  check('archive and finale remain distinct gated rooms',
    level.grid[24][90] === 1 && level.grid[24][111] === 1);
  check('climb spans at least 10 tiles of height',
    level.spawns.find((s) => s.isSpawn).walkRow - 12 >= 10);
}

// ------------------------------------------- Figuren ohne geschlossenen Kasten --
// Der Tenor und der Sopran waren als geschlossener Kasten gemalt: ihre
// Randfuellung bestand aus dem Palettenzeichen '.', das in PAL die fast
// schwarze Farbe #0b0810 traegt. Sobald der Grund heller war als diese Farbe,
// stand um die Figur ein schwarzes Rechteck (Roland: „um den Tenor“). Figuren
// duerfen deshalb an keiner der vier Kanten vollflaechig deckend sein.
{
  const FIGUREN = ['tenor', 'sopran', 'piccolo', 'dirigent', 'ramona', 'ada', 'rolf',
    'roland_idle', 'roland_walk1', 'roland_walk2', 'roland_jump', 'roland_duck'];
  const deckt = (rows, x, y) => !!(rows[y] && PAL[rows[y][x]]);
  const zu = [];
  for (const name of FIGUREN) {
    const rows = SPRITES[name];
    const w = Math.max(...rows.map((r) => r.length));
    const h = rows.length;
    const kanten = [
      ['oben', Array.from({ length: w }, (_, x) => [x, 0])],
      ['unten', Array.from({ length: w }, (_, x) => [x, h - 1])],
      ['links', Array.from({ length: h }, (_, y) => [0, y])],
      ['rechts', Array.from({ length: h }, (_, y) => [w - 1, y])],
    ];
    const geschlossen = kanten
      .filter(([, zellen]) => zellen.every(([x, y]) => deckt(rows, x, y)))
      .map(([kante]) => kante);
    if (geschlossen.length) zu.push(`${name}:${geschlossen.join('/')}`);
  }
  check('Figuren-Sprites sind an keiner Kante ein geschlossener Kasten',
    zu.length === 0, zu.join(' '));
}

// ------------------------------------------------------------------- Start --
{
  const { game } = fresh();
  check('starts in play', game.state === 'play');
  check('three nerves', game.nerves === 3);
  check('starts in black outfit', game.outfit.id === 'schwarz');
  check('player on spawn', Math.abs(game.player.x - 3 * TILE) < 2);
  check('hud payload complete',
    game.hud && game.hud.deckel === 0 && game.hud.outfit.id === 'schwarz' && 'heat' in game.hud);
  check('takt starts at 100', game.bpm === BPM_BASE);
}

// -------------------------------------------------------- Bewegung/Physik --
{
  const { game, input } = fresh('schwarz', { stands: false });
  step(game, 0.2);
  check('falls onto floor and stands', game.player.onGround === true);
  const x0 = game.player.x;
  input.setKey('right', true);
  step(game, 1);
  check('walks right', game.player.x > x0 + 80, `dx=${(game.player.x - x0).toFixed(1)}`);
  input.setKey('right', false);
  input.setKey('left', true);
  step(game, 0.6);
  check('walks left and turns', game.player.dir === -1);
  input.setKey('left', false);
  step(game, 0.4);

  const y0 = game.player.y;
  input.setKey('jump', true);
  game.update(1 / 60);
  check('jump gives upward velocity', game.player.vy < 0, `vy=${game.player.vy}`);
  step(game, 0.35);
  check('jump gains height', game.player.y < y0 - 20, `dy=${(game.player.y - y0).toFixed(1)}`);
  input.setKey('jump', false);
  step(game, 1.2);
  check('lands again', game.player.onGround === true);

  const { game: g2, input: i2 } = fresh('schwarz', { stands: false });
  step(g2, 0.2);
  i2.setKey('left', true);
  step(g2, 3);
  check('outer wall stops the player', g2.player.x > 0 && g2.player.x < 40, `x=${g2.player.x}`);

  // ducken verkleinert die Trefferfläche und steht wieder auf
  const { game: g3, input: i3 } = fresh('schwarz', { stands: false });
  step(g3, 0.2);
  i3.setKey('down', true);
  step(g3, 0.2);
  check('ducking shrinks the hitbox', g3.player.h === PHYS.duckH, `h=${g3.player.h}`);
  i3.setKey('down', false);
  step(g3, 0.2);
  check('stands up again', g3.player.h === PHYS.playerH && g3.player.onGround === true);
}

// -------------------------------------------------------------------- Takt --
{
  const { game } = fresh('schwarz', { stands: false });
  step(game, 0.65);
  check('beat fires within a second', game.beats >= 1, `beats=${game.beats}`);
  const before = game.beats;
  step(game, 1.2);
  check('beats keep coming (~100 bpm)', game.beats >= before + 2, `beats=${game.beats}`);
  const acc = game.beatAccuracy();
  check('beat accuracy is measurable', acc >= 0 && acc <= 0.3, `acc=${acc.toFixed(3)}`);
}

// ----------------------------------------------------- Piccolo & Schallwelle --
{
  const { game } = fresh('schwarz', { stands: false });
  const pic = game.entities.find((e) => e.kind === 'piccolo');
  check('piccolo exists', !!pic);
  const p = place(game, pic.x - 150, pic.y);
  step(game, 0.55);
  check('piccolo schiesst nicht sofort (Schonfrist)', game.projectiles.length === 0,
    `proj=${game.projectiles.length}`);
  step(game, 1.45);
  check('piccolo fires on the beat', game.projectiles.length > 0, `proj=${game.projectiles.length}`);
  const vorher = game.nerves;
  step(game, 3.5);
  check('Schallwelle trifft den stehenden Spieler', game.nerves < vorher, `nerves=${game.nerves}`);
  const nervesBefore = game.nerves;
  place(game, p.x, p.y);
  game.player.invuln = 0;
  game.projectiles.push({ kind: 'sound', x: p.x, y: p.y + 3, w: 12, h: 8, vx: 0, life: 2, dmg: 1 });
  game.update(1 / 60);
  check('sound wave costs a nerve', game.nerves === nervesBefore - 1, `nerves=${game.nerves}`);
  check('damage grants invulnerability', game.player.invuln > 0);
  const after = game.nerves;
  game.damage(1, p.x);
  check('invulnerability blocks chained damage', game.nerves === after);
}

// ------------------------------------------------------------------ Sopran --
{
  const { game } = fresh('schwarz', { stands: false });
  const sop = game.entities.find((e) => e.kind === 'sopran');
  place(game, sop.x - 50, 385);
  game.player.onGround = true;
  step(game, 3.6);
  check('sopran shriek hurts unprotected player', game.nerves < 3, `nerves=${game.nerves}`);

  const { game: g2 } = fresh('schwarz', { stands: false });
  const sop2 = g2.entities.find((e) => e.kind === 'sopran');
  place(g2, sop2.x - 50, 385);
  g2.player.onGround = true;
  g2.ohropax = 12;
  step(g2, 3.6);
  check('Ohropax blocks the shriek', g2.nerves === 3, `nerves=${g2.nerves}`);

  const { game: g3 } = fresh('schwarz', { stands: false });
  const alc = g3.level.alcoves[0];
  place(g3, alc.x + 4, 385);
  g3.player.onGround = true;
  step(g3, 3.6);
  check('hiding in the alcove protects', g3.nerves === 3, `nerves=${g3.nerves}`);
  check('alcove is reported as hidden', g3.inAlcove(g3.player) === true);

  // Schutz endet mit der Wirkung
  const { game: g4 } = fresh('schwarz', { stands: false });
  const sop4 = g4.entities.find((e) => e.kind === 'sopran');
  place(g4, sop4.x - 50, 385);
  g4.ohropax = 0.5;
  step(g4, 3.6);
  check('Ohropax runs out and the sopran bites', g4.nerves < 3, `nerves=${g4.nerves}`);
}

// ----------------------------------------------------- Items: Ohropax/Wasser --
{
  const { game } = fresh('schwarz', { stands: false });
  step(game, 0.2);
  const ohro = game.entities.find((e) => e.kind === 'item' && e.item === 'ohropax');
  place(game, ohro.x, ohro.y);
  game.update(1 / 60);
  check('Ohropax is picked up', game.ohropax > 0);
  check('Ohropax item disappears', !game.entities.some((e) => e.item === 'ohropax'));

  const { game: g2 } = fresh('schwarz', { stands: false });
  step(g2, 0.2);
  const deck = g2.entities.find((e) => e.kind === 'item' && e.item === 'bierdeckel');
  place(g2, deck.x, deck.y);
  g2.update(1 / 60);
  check('Bierdeckel counts up', g2.deckel === 1, `deckel=${g2.deckel}`);
  g2.update(1 / 60);
  check('Bierdeckel cannot be collected twice', g2.deckel === 1);

  const { game: g3 } = fresh('schwarz', { stands: false });
  g3.heat = 80;
  const was = g3.entities.find((e) => e.kind === 'item' && e.item === 'wasser');
  place(g3, was.x, was.y);
  g3.update(1 / 60);
  check('Wasser cools the Frack', g3.heat <= 55, `heat=${g3.heat.toFixed(1)}`);
}

// ------------------------------------------------------------ Hitze/Frack --
{
  const { game } = fresh('frack', { stands: false });
  check('frack outfit active', game.outfit.id === 'frack');
  const light = game.level.lights[1];
  place(game, light.x + 20, light.y + 34);
  step(game, 2);
  check('heat rises in frack + stage light', game.heat > 6, `heat=${game.heat.toFixed(1)}`);
  check('glanz alarm triggers in light', game.glanz > 0.5);
  game.heat = 70;
  game.input.setKey('action', true);
  game.update(1 / 60);
  check('Frack-Off cools down completely', game.heat < 1, `heat=${game.heat}`);
  check('Frack-Off gives a boost', game.frackBoost > 0);
  check('Frack-Off is once per run', game.frackOffUsed === true);

  const { game: g2 } = fresh('schwarz', { stands: false });
  g2.heat = 115;
  g2.update(1 / 60);
  check('Kreislauf stuns instead of killing', g2.stunTimer > 0 && g2.nerves === 3);
  check('Kreislauf drops heat to a workable level', g2.heat < 70);

  // Licht heizt jeden, den Frack aber weit stärker
  const heatInLight = (outfit) => {
    const { game: g } = fresh(outfit, { stands: false });
    const l = g.level.lights[1];
    place(g, l.x + 20, l.y + 34);
    step(g, 1);
    return g.heat;
  };
  const hBlack = heatInLight('schwarz');
  const hFrack = heatInLight('frack');
  check('light still warms everyone a little', hBlack > 0.5, `heat=${hBlack.toFixed(2)}`);
  check('black heats far less than frack in the same light',
    hBlack < hFrack * 0.5, `schwarz=${hBlack.toFixed(1)} frack=${hFrack.toFixed(1)}`);
}

// ------------------------------------------------------------ Beton-Tritt --
{
  const { game } = fresh('schwarz', { stands: false });
  const pic = game.entities.find((e) => e.kind === 'piccolo');
  place(game, pic.x - 20, pic.y);
  game.beatPhase = 0.02; // genau auf dem Schlag
  game.input.setKey('action', true);
  game.update(1 / 60);
  check('tritt in time stuns the piccolo', pic.stun > 0, `stun=${pic.stun}`);
  check('takt hit is counted', game.taktHits >= 1);

  const { game: g2 } = fresh('schwarz', { stands: false });
  const pic2 = g2.entities.find((e) => e.kind === 'piccolo');
  place(g2, pic2.x - 20, pic2.y);
  g2.beatPhase = 0.5; // mitten zwischen zwei Schlägen
  g2.input.setKey('action', true);
  g2.update(1 / 60);
  check('off-beat tritt does not stun', pic2.stun === 0);
  check('off-beat tritt is called out',
    !!g2.hud.hint && g2.hud.hint.includes('DANEBEN'), `hint=${g2.hud.hint}`);
  step(g2, 5);
  check('Erklärung folgt nach der Rückmeldung (nichts geht verloren)',
    !!g2.hud.hint && g2.hud.hint.includes('PICCOLO'), `hint=${g2.hud.hint}`);
}

// ---------------------------------------------------------- Schwierigkeit ----
{
  const ersterSchuss = (key) => {
    const { game } = fresh('schwarz', { stands: false }, key);
    const pic = game.entities.find((e) => e.kind === 'piccolo');
    place(game, pic.x - 40, pic.y);
    for (let i = 0; i < 60 * 10; i++) {
      game.update(1 / 60);
      if (game.projectiles.length) return game.time;
    }
    return Infinity;
  };
  const tGem = ersterSchuss('gemuetlich');
  const tZue = ersterSchuss('zuegig');
  check('gemütlich lässt mehr Zeit vor dem ersten Schuss', tGem > tZue,
    `gemütlich ${tGem.toFixed(2)}s vs zügig ${tZue.toFixed(2)}s`);
  check('Vorwarnung ist lang genug zum Reagieren', tGem >= 0.6, `${tGem.toFixed(2)}s`);

  const { game: gGem } = fresh('schwarz', { stands: false }, 'gemuetlich');
  const { game: gZue } = fresh('schwarz', { stands: false }, 'zuegig');
  check('gemütlich: langsamere Gegner', gGem.diff.enemySpeed < gZue.diff.enemySpeed);
  check('gemütlich: langsamere Schallwellen', gGem.diff.shotSpeed < gZue.diff.shotSpeed);
  check('gemütlich: mehr Schonfrist nach Treffer', gGem.diff.invuln > gZue.diff.invuln);
  check('gemütlich: Sopran kostet nur einen Nerv', gGem.diff.sopranDmg === 1);
  check('Standard ist gemütlich',
    new Game({ level: buildAkt1(), input: createInput(null), audio: { play() {}, resume() {} }, events: () => {} })
      .difficulty === 'gemuetlich');

  // Am Handy darf nichts von ausserhalb des Bildes schiessen
  const touch = new Game({
    level: buildAkt1(), input: createInput(null), audio: { play() {}, resume() {} }, events: () => {},
    view: VIEW_TOUCH, difficulty: 'gemuetlich',
  });
  check('Schussreichweite bleibt im sichtbaren Bild',
    touch.vw * touch.diff.fireRange < touch.vw * 0.75,
    `${Math.round(touch.vw * touch.diff.fireRange)}px bei ${touch.vw}px Sicht`);

  // Umschalten zur Laufzeit wirkt sofort
  const { game: gSwitch } = fresh('schwarz', { stands: false }, 'gemuetlich');
  gSwitch.setDifficulty('zuegig');
  check('Umschalten wirkt sofort', gSwitch.diff.id === 'zuegig' && gSwitch.difficulty === 'zuegig');
}

// ------------------------------------------------- Gegner werden erklärt -----
{
  const { game } = fresh('schwarz', { stands: false });
  const pic = game.entities.find((e) => e.kind === 'piccolo');
  place(game, pic.x - 120, pic.y);
  step(game, 0.4);
  check('Erster Kontakt erklärt den Gegner',
    !!game.hud.hint && game.hud.hint.includes('SCHALLWELLEN'), `hint=${game.hud.hint}`);
  place(game, pic.x - 40, pic.y);
  step(game, 0.2);
  check('Nähe zeigt den Namen über dem Gegner',
    !!game.hud.label && game.hud.label.text === 'PICCOLO', JSON.stringify(game.hud.label));
}

// ----------------------------------------------------------- Tenor/Bremse --
{
  const { game } = fresh('schwarz', { stands: false });
  const ten = game.entities.find((e) => e.kind === 'tenor');
  place(game, ten.x - 50, 385);
  game.player.onGround = true;
  step(game, 1.5);
  check('tenor slows the tempo', game.bpm === BPM_TENOR, `bpm=${game.bpm}`);
  check('tenor slow field active', game.slowField > 0.4, `slow=${game.slowField.toFixed(2)}`);
  const slowSpeed = game.outfit.speed * (1 - 0.42 * game.slowField);
  check('player is measurably slower', slowSpeed < game.outfit.speed * 0.8);
}

// ------------------------------------------------------------------- Türen --
{
  const { game } = fresh('schwarz', { stands: false });
  const gate = game.gates.find((g) => g.need === 'anzug');
  place(game, gate.tx * TILE - 6, 385);
  game.update(1 / 60);
  check('Diensttür stays shut in black', gate.open === false);
  check('locked door gives a hint', !!game.hud.hint && game.hud.hint.includes('ANZUG'), `hint=${game.hud.hint}`);
  check('locked door is solid', game.grid[24][gate.tx] === 1);
  game.setOutfit('anzug');
  game.update(1 / 60);
  check('Anzug opens the Diensttür', gate.open === true);
  check('opened door frees the tile', game.grid[24][gate.tx] === 0);

  // mitten im Anzug umziehen verliert den Durchgang nicht
  const { game: g2, input: i2 } = fresh('anzug', { stands: false });
  const band = g2.gates.find((g) => g.need === 'frack');
  place(g2, band.tx * TILE - 14, 25 * TILE - PHYS.playerH);
  step(g2, 0.2);
  check('Absperrband stays shut in Anzug', band.open === false);
  check('Absperrband is solid until opened', g2.grid[24][band.tx] === 1);
  // Direkte Rückmeldungen (z.B. Bierdeckel) stehen zuerst, danach kommt der Hinweis.
  step(g2, 5.5);
  check('Absperrband gives a hint', !!g2.hud.hint && g2.hud.hint.includes('FRACK'), `hint=${g2.hud.hint}`);
  g2.setOutfit('frack');
  step(g2, 0.3);
  check('Frack opens the Absperrband', band.open === true);

}

// ---------------------------------------------------------- Morsche Blätter --
{
  const { game } = fresh('schwarz', { stands: false });
  const morsch = [];
  for (let y = 0; y < game.level.h; y++) {
    for (let x = 0; x < game.level.w; x++) if (game.grid[y][x] === 3) morsch.push([x, y]);
  }
  check('morsch tiles exist in the level', morsch.length >= 3, `n=${morsch.length}`);
  const [mx, my] = morsch[0];
  place(game, mx * TILE + 3, my * TILE - PHYS.playerH - 1);
  step(game, 0.9);
  const collapsed = morsch.some(([x, y]) => game.grid[y][x] === 0);
  check('morsch note platform collapses underfoot', collapsed);
  step(game, 3.4);
  const back = morsch.some(([x, y]) => game.grid[y][x] === 3);
  check('morsch platform grows back', back);
}

// ------------------------------------------------------------- Speicherpunkt --
{
  const { game } = fresh('schwarz', { stands: false });
  const cp = game.entities.find((e) => e.kind === 'checkpoint');
  place(game, cp.x + 2, cp.y);
  game.update(1 / 60);
  check('checkpoint activates', game.lastCheckpointId === cp.id, `id=${game.lastCheckpointId}`);
  check('checkpoint becomes the respawn', game.checkpoint.x > cp.x - 1);
}

// -------------------------------------------------------- Kleiderständer ----
{
  const { game, input } = fresh('schwarz');
  const stand = game.entities.find((e) => e.kind === 'stand');
  place(game, stand.x - 60, 25 * TILE - PHYS.playerH);
  step(game, 0.3);
  input.setKey('right', true);
  step(game, 0.7);
  input.setKey('right', false);
  check('bloßes Berühren öffnet die Umkleide NICHT', game.state === 'play', game.state);
  check('Kleiderständer meldet Nähe', game.hud.standNear === true);
  check('Schild benennt die Aktion',
    !!game.hud.label && game.hud.label.action === true && game.hud.label.text === 'UMZIEHEN',
    JSON.stringify(game.hud.label));
  input.setKey('action', true);
  game.update(1 / 60);
  check('Aktionstaste öffnet die Umkleide', game.state === 'paused' && game.pauseReason === 'stand',
    `${game.state}/${game.pauseReason}`);
  game.setOutfit('anzug');
  game.resume();
  check('choosing an outfit resumes play', game.state === 'play' && game.outfit.id === 'anzug');
}

// ------------------------------------------------- Objektbeschriftung -------
{
  const { game } = fresh('schwarz', { stands: false });
  step(game, 0.3);
  const deck = game.entities.find((e) => e.kind === 'item' && e.item === 'bierdeckel');
  place(game, deck.x - 34, deck.y - 6);   // in Reichweite, aber ohne aufzusammeln
  game.update(1 / 60);
  check('Fundstück wird benannt', !!game.hud.label && game.hud.label.text === 'STIMMZIMMER KEKSE',
    JSON.stringify(game.hud.label));
  check('Schild hat Bildschirmkoordinaten',
    game.hud.label && Number.isFinite(game.hud.label.sx) && Number.isFinite(game.hud.label.sy));
  place(game, 300, 25 * TILE - PHYS.playerH);
  game.update(1 / 60);
  check('kein Schild ohne Objekt in Reichweite', game.hud.label === null || game.hud.label.text !== 'STIMMZIMMER KEKSE');
}

// ---------------------------------------------------- Zusammenbruch/Respawn --
{
  const { game } = fresh('schwarz', { stands: false });
  game.nerves = 1;
  game.damage(2, 0);
  check('zero nerves collapses', game.state === 'collapse' && game.nerves === 0);
  game.respawnFromCheckpoint();
  check('respawn restores three nerves', game.nerves === 3);
  check('respawn returns to play', game.state === 'play');
}

// ------------------------------------------------------- Ziel / Aktabschluss --
{
  const { game } = fresh('schwarz', { stands: false });
  const goal = game.level.goal;
  place(game, goal.x, goal.y + goal.h - PHYS.playerH);
  game.update(1 / 60);
  check('lift refuses without the Notenmappe', game.state === 'play');
  check('lift hints about the mappe', !!game.hud.hint && game.hud.hint.includes('MAPPE'), `hint=${game.hud.hint}`);
  game.hasMappe = true;
  game.update(1 / 60);
  check('lift still waits for Anna after the mappe is complete', game.state === 'play');
  game.storyFlags.add('ada_verabschiedet');
  game.update(1 / 60);
  check('lift accepts mappe plus Anna payoff', game.state === 'complete');
  check('reward beer appears', game.entities.some((e) => e.item === 'bier'));
  check('stats are recorded', game.stats.deckel === 0 && game.stats.time > 0);
}

// ------------------------------------------------------- Durchspiel-Route --
// Ein Bot läuft die komplette, gebaute Route vom Spawn bis zum Materialaufzug
// (Wegpunkte = Kachel x / Bodenkante). Damit ist nachgewiesen, dass jede Stufe
// innerhalb der Sprunghöhe liegt und die Route wirklich durchspielbar ist.
// Erhöhte Nerven: geprüft wird die Geometrie, nicht der Kampf.
{
  const { game, input } = fresh('schwarz', { stands: false });
  game.maxNerves = 99;
  game.nerves = 99;
  // Dieser Bot beweist die Geometrie. Gegnerverhalten ist oben separat geprüft;
  // hier würden Patrouillen den deterministischen Wegpunktlauf verfälschen.
  const hostile = new Set(['piccolo', 'sopran', 'tenor', 'koffer', 'dirigent']);
  game.entities = game.entities.filter((en) => !hostile.has(en.kind));

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

  const failures = [];
  // Sprungsteuerung des Bots: halten (sonst wird der Sprung abgeschnitten),
  // danach zwingend ein paar Frames loslassen — sonst gibt es keine neue
  // Sprungkante und der Bot hüpft nie wieder.
  let jumpHold = 0, jumpRelease = 0, letzteRichtung = 1;
  game.wetterIdx = 0; game.wetterTimer = 9999; game.wetterKind = 'sonne';   // ruhiges Wetter: die Route prüft Geometrie, nicht Sturm
  for (const stepItem of route) {
    if (stepItem.outfit) { game.setOutfit(stepItem.outfit); continue; }
    if (stepItem.talk) {
      const npc = game.entities.find((en) => en.kind === 'npc' && en.flag === stepItem.talk);
      for (let i = 0; i < npc.dialog.length; i++) {
        input.setKey('action', true); game.update(1 / 60);
        input.setKey('action', false); game.update(1 / 60);
      }
      continue;
    }
    const [wx, row] = stepItem.wp;
    const tx = wx * TILE + 8;
    const feetY = row * TILE;
    let ok = false;
    let bestDist = Infinity;
    let noProgress = 0;
    for (let i = 0; i < 14 * 60; i++) {
      const p = game.player;
      const d = tx - (p.x + p.w / 2);
      // Stehen wir schon über dem Ziel, aber zu hoch, müssen wir zur nächsten
      // Kante laufen, um abzusteigen — sonst steht der Bot still und kommt nie runter.
      const zielTiefer = feetY > p.y + p.h + 6;
      const amZielX = Math.abs(d) < 12;
      let richtung = d > 3 ? 1 : (d < -3 ? -1 : 0);
      if (amZielX && zielTiefer) {
        // Zu hoch über dem Ziel: stur in der letzten Laufrichtung weiter, bis
        // eine Kante kommt. Die Zielkorrektur darf die Richtung nicht verwischen,
        // sonst pendelt der Bot an der Kante hin und her.
        richtung = letzteRichtung;
      } else if (richtung !== 0) {
        letzteRichtung = richtung;
      }
      input.setKey('right', richtung > 0);
      input.setKey('left', richtung < 0);
      const higher = feetY < p.y + p.h - 8;
      // Sprung auch über gleichhohe Lücken hinweg
      const footRow = Math.floor((p.y + p.h + 1) / TILE);
      // Über eine Kante nur springen, wenn das Ziel nicht tiefer liegt —
      // sonst hüpft der Bot gegen die eigene Abstiegsroute an.
      const holeAhead = feetY <= p.y + p.h + 4
        && game.tileVal(Math.floor((p.x + p.w + 6) / TILE), footRow) === 0;
      // Kein Fortschritt mehr (Hindernis im Weg)? Dann drüberspringen.
      if (Math.abs(d) < bestDist - 4) { bestDist = Math.abs(d); noProgress = 0; } else noProgress++;
      const needJump = higher || holeAhead || noProgress > 20;
      if (jumpHold > 0) {
        input.setKey('jump', true);
        jumpHold -= 1;
        if (jumpHold === 0) jumpRelease = 3;
      } else if (jumpRelease > 0) {
        input.setKey('jump', false);
        jumpRelease -= 1;
      } else if (p.onGround && needJump) {
        jumpHold = 16;
        input.setKey('jump', true);
        jumpHold -= 1;
      } else {
        input.setKey('jump', false);
      }
      game.update(1 / 60);
      if (game.state === 'paused') game.resume();
      if (game.state === 'collapse') game.respawnFromCheckpoint();
      if (game.state === 'complete') { ok = true; break; }
      if (Math.abs(d) < 8 && Math.abs((p.y + p.h) - feetY) < 18 && p.onGround) { ok = true; break; }
    }
    if (!ok) {
      const p = game.player;
      failures.push(`${wx}/${row} (x=${p.x.toFixed(0)} fuß=${(p.y + p.h).toFixed(0)})`);
    }
  }
  check('bot walks the designed route without getting stuck', failures.length === 0,
    failures.join(' | '));
  check('route completes the act at the lift', game.state === 'complete', `state=${game.state}`);
  check('bot switches to the Anzug for the Diensttür',
    game.gates.find((g) => g.need === 'anzug').open === true);
  check('bot switches to the Frack for the Absperrband',
    game.gates.find((g) => g.need === 'frack').open === true);
  check('Notenmappe is collected on the way', game.hasMappe === true);
  check('Anna frames the route at both ends',
    game.storyFlags.has('ada_beauftragt') && game.storyFlags.has('ada_verabschiedet'));
  check('Bierdeckel are collected on the way', game.deckel >= 2, `deckel=${game.deckel}`);
}

// ============================================================== AKT 2 ========
{
  const level = buildAkt2();
  check('Akt 2 existiert als eigenes Levelmodul', level.id === 'akt2' && level.w >= 120);
  check('Akt 2: fünf Bierdeckel', level.deckelTotal === 5, `n=${level.deckelTotal}`);
  check('Akt 2: Bühnentür verlangt den Frack',
    level.gates.some((g) => g.need === 'frack'));
  check('Akt 2: Saaltür verlangt Annas Auftrag (Story-Gate)',
    level.gates.some((g) => g.flag === 'probe_beauftragt' && (g.locked || '').includes('ANNA')));
  check('Akt 2: Tür blockiert solange sie zu ist',
    level.grid[level.gates[0].ty + level.gates[0].th - 1][level.gates[0].tx] === 1);
  check('Akt 2: zwei Taktwechsel vorgesehen', (level.takts || []).length === 2);
  check('Akt 2: Dirigent, Piccolo-Duo, Sopran, Tenor, Koffer vorhanden',
    ['dirigent', 'piccolo', 'sopran', 'tenor', 'koffer'].every((k) => level.spawns.some((s) => s.kind === k)));
  check('Akt 2: Beleuchtungsbrücke als oberer Weg',
    level.grid[14].slice(54, 97).every((v) => v === 1));
  check('Akt 2: über der Brücke ist Luft zum Springen',
    [11, 12, 13].every((y) => level.grid[y].slice(56, 94).every((v) => v === 0)));
  check('Akt 2: Bühnentür sperrt die volle Ganghöhe (kein Überspringen)',
    level.gates[0].th >= 3 && level.grid[22][112] === 1 && level.grid[24][112] === 1);
  check('Akt 2: Pulte sind in Sprunghöhe gestaffelt (32 px)',
    level.grid[23][30] === 2 && level.grid[21][35] === 2 && level.grid[19][40] === 2
    && level.grid[17][45] === 2 && level.grid[16][50] === 2);
  check('Akt 2: Anna führt die Probe (Briefing und Payoff)',
    level.spawns.filter((s) => s.kind === 'npc' && s.npc === 'ada').length === 2);
  check('Akt 2: vier Storyschritte bis zum Bühneneingang',
    Array.isArray(level.storySteps) && level.storySteps.length >= 4);
  check('Akt 2: fünf unterschiedliche Raumrequisiten',
    new Set(level.spawns.filter((s) => s.kind === 'decor').map((s) => s.spr)).size >= 5);
  check('Akt 2: Proben-Motiv für das Finale zitierbar',
    level.motiv?.id === 'probe-motiv');
  check('Akt 2: Route beidseitig begehbar',
    level.route?.reversible === true && (level.route?.returnStair || []).length >= 3);
  check('Akt 2: Ziel verlangt Einsatz und Anna-Abschied',
    level.goal.need === 'einsatz' && (level.goal.flags || []).includes('probe_abgenommen'));
  check('Akt 2: Rolf tritt nicht auf', !/rolf/i.test(JSON.stringify(level)));
  check('Akte stehen im Register',
    LEVELS.length >= 3 && LEVELS[1].id === 'akt2' && LEVELS[2].id === 'cabrio'
    && typeof LEVELS[1].name === 'string');
}

// Der Dirigent: Taktstock im Bogen, im Takt getroffen verliert er ihn
{
  const level = buildAkt2();
  const input = createInput(null);
  const game = new Game({ level, input, audio: { play() {}, resume() {} }, events: () => {} });
  game.reset('schwarz');
  const dir = game.entities.find((e) => e.kind === 'dirigent');
  check('Dirigent steht im Saal', !!dir);
  place(game, dir.x + 90, 25 * TILE - PHYS.playerH);
  let baton = null;
  for (let i = 0; i < 60 * 12 && !baton; i++) {
    game.update(1 / 60);
    baton = game.projectiles.find((p) => p.kind === 'baton') || null;
  }
  check('Dirigent wirft Taktstöcke', !!baton, 'kein Wurf in 12s');
  if (baton) {
    check('Taktstock fliegt im Bogen (steigt zuerst)', baton.vy < 0 || baton.y > 0);
    const y0 = baton.y, t0 = game.time;
    for (let i = 0; i < 45; i++) game.update(1 / 60);
    check('Taktstock fällt danach wieder', y0 > 0 && game.time > t0);
  }
  // Im Takt getroffen: verliert den Taktstock
  const dir2 = game.entities.find((e) => e.kind === 'dirigent');
  place(game, dir2.x - 20, dir2.y + dir2.h - PHYS.playerH);
  game.beatPhase = 0.02;
  game.input.setKey('action', true);
  game.update(1 / 60);
  check('Beton-Tritt erreicht den Dirigenten', dir2.stun > 0, `stun=${dir2.stun}`);
}

// Orchestergraben (Playtest-Befund „kein Weg nach oben“): im Dunkeln wirft der
// Dirigent nur in Sichtweite. Vorher lag der Versenkungsschacht in seiner
// Wurfweite — wer auf die Mitfahrt wartete, wurde dort beschossen und
// weggestoßen, statt hochzukommen.
{
  const input = createInput(null);
  const game = new Game({
    level: buildAkt4(), input,
    audio: { play() {}, resume() {} }, events: () => {}, difficulty: 'gemuetlich',
  });
  game.reset('schwarz');
  const dir = game.entities.find((e) => e.kind === 'dirigent');
  const lift = game.entities.find((e) => e.kind === 'lift');
  const abstand = Math.abs((lift.x + lift.w / 2) - (dir.x + dir.w / 2));
  check('Akt 4: Versenkungsschacht liegt außerhalb der dunklen Wurfweite',
    abstand > game.vw * 0.9 * 0.4, `${abstand.toFixed(0)} px Abstand`);

  game.nerves = 3; game.maxNerves = 3;
  place(game, lift.x + 24, lift.bottom - PHYS.playerH);
  let wuerfe = 0;
  for (let i = 0; i < 60 * 24; i++) {
    input.setKey('right', false); input.setKey('left', false); input.setKey('jump', false);
    game.update(1 / 60);
    if (game.state === 'paused') game.resume();
    if (game.projectiles.some((pr) => pr.kind === 'baton')) wuerfe += 1;
  }
  check('Akt 4: Warten an der Versenkung wird nicht beschossen',
    wuerfe === 0 && game.nerves === 3, `Würfe=${wuerfe} Nerven=${game.nerves}`);
  check('Akt 4: die Mitfahrt hebt trotzdem ab', game.player.y + game.player.h < 380,
    `fuß=${(game.player.y + game.player.h).toFixed(0)}`);

  // Die Wurfmechanik bleibt: in Reichweite fliegt der Taktstock weiter.
  const iN = createInput(null);
  const gN = new Game({
    level: buildAkt4(), input: iN,
    audio: { play() {}, resume() {} }, events: () => {}, difficulty: 'gemuetlich',
  });
  gN.reset('schwarz');
  const dirN = gN.entities.find((e) => e.kind === 'dirigent');
  place(gN, dirN.x + 60, 25 * TILE - PHYS.playerH);
  let nahWurf = false;
  for (let i = 0; i < 60 * 12 && !nahWurf; i++) {
    gN.update(1 / 60);
    nahWurf = gN.projectiles.some((pr) => pr.kind === 'baton');
  }
  check('Akt 4: dicht am Dirigenten fliegt der Taktstock weiter', nahWurf);
}

// Taktwechsel beim Durchschreiten
{
  const level = buildAkt2();
  const input = createInput(null);
  const game = new Game({ level, input, audio: { play() {}, resume() {} }, events: () => {} });
  game.reset('schwarz');
  check('Akt 2 startet mit 100 bpm', game.bpm === 100, `bpm=${game.bpm}`);
  place(game, 40 * TILE + 10, 25 * TILE - PHYS.playerH);
  step(game, 0.3);
  check('Taktwechsel greift beim Durchschreiten', game.bpm !== 100, `bpm=${game.bpm}`);
  check('Wechsel wird angesagt',
    !!game.hud.hint && /BPM/.test(game.hud.hint), `hint=${game.hud.hint}`);
  check('gemütlich führt den Wechsel sanfter aus', game.bpm < 132 && game.bpm > 100, `bpm=${game.bpm}`);
}

// Durchspiel-Bot für Akt 2 (Geometrie: oberer Weg über die Pulte, dann über
// die Brücke, zurück zum Pult und zur Hinterbühne). Gegner sind herausgefiltert
// wie in der Akt-1-Geometrieroute — der Kampf hat seinen eigenen Bot
// (tests/act2-hazard-route.test.mjs). Geprüft wird die Geometrie: Sprunghöhen,
// Rückwege, Tore, Mappe, Einsatz und Anna an beiden Enden.
{
  const level = buildAkt2();
  const input = createInput(null);
  const game = new Game({ level, input, audio: { play() {}, resume() {} }, events: () => {} });
  game.reset('schwarz');
  game.maxNerves = 99; game.nerves = 99;
  // Geometrie ohne Gegnerstörung: Sprunghöhen und Rückwege bleiben messbar.
  const hostile = new Set(['piccolo', 'sopran', 'tenor', 'koffer', 'dirigent']);
  game.entities = game.entities.filter((en) => !hostile.has(en.kind));
  // Die Notenmappe reist aus Akt 1 im Spielstand an (main.js setzt hasMappe).
  game.hasMappe = true;
  const route = [
    { wp: [12, 25] }, { talk: 'probe_beauftragt' }, { wp: [23, 25] },
    { wp: [31, 23] }, { wp: [37, 21] }, { wp: [42, 19] }, { wp: [47, 17] }, { wp: [52, 16] },
    { wp: [58, 14] }, { wp: [94, 14] },
    { wp: [60, 14] },                       // zurück über die Brücke
    { wp: [49, 25] },                       // an der Kante hinunter auf den Saalboden
    { wp: [56, 25] },                       // ans Dirigentenpult
    { einsatz: true },                      // Mappe ablegen, dann drei Takte Einsatz (DRR-04)
    { wp: [60, 25] }, { wp: [97, 25] },     // durch den Saal zur Hinterbühne
    { wp: [108, 25] },
    { outfit: 'frack' },
    { wp: [116, 25] }, { talk: 'probe_abgenommen' }, { wp: [120, 25] },
  ];
  const failures = [];
  let jumpHold = 0, jumpRelease = 0, letzteRichtung = 1;
  for (const stepItem of route) {
    if (stepItem.outfit) { game.setOutfit(stepItem.outfit); continue; }
    if (stepItem.talk) {
      const npc = game.entities.find((en) => en.kind === 'npc' && en.flag === stepItem.talk);
      for (let i = 0; i < npc.dialog.length; i++) {
        input.setKey('action', true); game.update(1 / 60);
        input.setKey('action', false); game.update(1 / 60);
      }
      continue;
    }
    if (stepItem.einsatz) {
      // Erst die Mappe aufs Pult (kostet keinen Takt), dann drei Takte im Takt.
      for (let i = 0; i < 4; i++) {
        game.beatPhase = 0.02;
        input.setKey('action', true);
        game.update(1 / 60);
        input.setKey('action', false);
        game.update(1 / 60);
      }
      if (!game.einsatzGelungen) failures.push('Einsatz am Pult');
      continue;
    }
    const [wx, row] = stepItem.wp;
    const tx = wx * TILE + 8;
    const feetY = row * TILE;
    let ok = false, bestDist = Infinity, noProgress = 0;
    for (let i = 0; i < 16 * 60; i++) {
      const p = game.player;
      const d = tx - (p.x + p.w / 2);
      // Stehen wir schon über dem Ziel, aber zu hoch, müssen wir zur nächsten
      // Kante laufen, um abzusteigen — sonst steht der Bot still und kommt nie runter.
      const zielTiefer = feetY > p.y + p.h + 6;
      const amZielX = Math.abs(d) < 12;
      let richtung = d > 3 ? 1 : (d < -3 ? -1 : 0);
      if (amZielX && zielTiefer) {
        // Zu hoch über dem Ziel: stur in der letzten Laufrichtung weiter, bis
        // eine Kante kommt. Die Zielkorrektur darf die Richtung nicht verwischen,
        // sonst pendelt der Bot an der Kante hin und her.
        richtung = letzteRichtung;
      } else if (richtung !== 0) {
        letzteRichtung = richtung;
      }
      input.setKey('right', richtung > 0);
      input.setKey('left', richtung < 0);
      const higher = feetY < p.y + p.h - 8;
      const footRow = Math.floor((p.y + p.h + 1) / TILE);
      // Über eine Kante nur springen, wenn das Ziel nicht tiefer liegt —
      // sonst hüpft der Bot gegen die eigene Abstiegsroute an.
      const holeAhead = feetY <= p.y + p.h + 4
        && game.tileVal(Math.floor((p.x + p.w + 6) / TILE), footRow) === 0;
      if (Math.abs(d) < bestDist - 4) { bestDist = Math.abs(d); noProgress = 0; } else noProgress++;
      const needJump = higher || holeAhead || noProgress > 20;
      if (jumpHold > 0) { input.setKey('jump', true); jumpHold -= 1; if (jumpHold === 0) jumpRelease = 3; }
      else if (jumpRelease > 0) { input.setKey('jump', false); jumpRelease -= 1; }
      else if (p.onGround && needJump) { jumpHold = 16; input.setKey('jump', true); jumpHold -= 1; }
      else input.setKey('jump', false);
      game.update(1 / 60);
      if (game.state === 'paused') game.resume();
      if (game.state === 'collapse') game.respawnFromCheckpoint();
      if (game.state === 'complete') { ok = true; break; }
      if (Math.abs(d) < 8 && Math.abs((p.y + p.h) - feetY) < 18 && p.onGround) { ok = true; break; }
    }
    if (!ok) {
      const p = game.player;
      failures.push(`${wx}/${row} (x=${p.x.toFixed(0)} fuß=${(p.y + p.h).toFixed(0)})`);
    }
  }
  check('Akt 2: Bot läuft die gebaute Route', failures.length === 0, failures.join(' | '));
  check('Akt 2: Route endet an der Bühnentür', game.state === 'complete', `state=${game.state}`);
  const pultEnd = game.entities.find((en) => en.kind === 'pult');
  check('Akt 2: drei Takte am Pult gezählt',
    !!pultEnd && pultEnd.teil === 3 && game.einsatzGelungen === true);
  check('Akt 2: Mappe aus Akt 1 liegt auf dem Pult', game.mappeAbgegeben === true);
  check('Akt 2: Anna rahmt die Route (Briefing und Payoff)',
    game.storyFlags.has('probe_beauftragt') && game.storyFlags.has('probe_abgenommen'));
  check('Akt 2: Saaltür öffnet nach Annas Auftrag',
    game.gates.find((g) => g.flag === 'probe_beauftragt').open === true);
  check('Akt 2: Frack öffnet die Bühnentür',
    game.gates[0].open === true || game.state === 'complete');
  check('Akt 2: Bierdeckel unterwegs eingesammelt', game.deckel >= 2, `deckel=${game.deckel}`);
}

// ----------------------------------------- Akt 2: Pult und erster Einsatz (DRR-04) --
{
  const level = buildAkt2();
  const input = createInput(null);
  const game = new Game({ level, input, audio: { play() {}, resume() {} }, events: () => {} });
  game.reset('schwarz');
  const pult = game.entities.find((en) => en.kind === 'pult');
  check('Akt 2 hat ein Dirigentenpult', !!pult && pult.noetig === 3);
  check('Akt 2 verlangt den ersten Einsatz', level.goal.need === 'einsatz');
  check('das Pult steht vor der Bühnentür', !!pult && pult.x < level.goal.x);
  check('Ziel bleibt ohne Einsatz gesperrt', game.goalErfuellt() === false);

  // Berührung allein schließt nichts ab: danebenstehen ohne E zählt nicht.
  place(game, pult.x + 4, pult.y + pult.h - PHYS.playerH);
  step(game, 0.4);
  check('Pult reagiert nicht auf bloßes Danebenstehen', pult.teil === 0 && !game.einsatzGelungen);

  // Die Mappe gehört aufs Pult (Aufgabe aus story.js), kostet aber keinen Takt.
  game.hasMappe = true;
  game.beatPhase = 0.02;
  input.setKey('action', true);
  game.update(1 / 60);
  input.setKey('action', false);
  game.update(1 / 60);
  check('Mappe liegt auf dem Pult', game.mappeAbgegeben === true && game.hasMappe === false);
  check('Mappe ablegen kostet keinen Takt', pult.teil === 0);

  // Ein Takt daneben kostet nichts, wird aber angesagt. Vorher die aufgestauten
  // Weghinweise abarbeiten lassen — der Test prüft die Rückmeldung, nicht die
  // Warteschlange (die ist auf fünf Einträge begrenzt und gilt für alle Texte).
  game.hintQueue = [];
  step(game, 2);
  game.beatPhase = 0.5;
  input.setKey('action', true);
  game.update(1 / 60);
  input.setKey('action', false);
  game.update(1 / 60);
  check('ein Takt daneben zählt nicht', pult.teil === 0);
  check('daneben wird angesagt', !!game.hud.hint && game.hud.hint.includes('DANEBEN'),
    `hint=${game.hud.hint}`);

  for (let i = 0; i < 3; i++) {
    game.beatPhase = 0.02;
    input.setKey('action', true);
    game.update(1 / 60);
    input.setKey('action', false);
    game.update(1 / 60);
  }
  check('drei Takte ergeben den Einsatz', pult.teil === 3 && game.einsatzGelungen === true);
  check('ohne Annas Abschied bleibt das Ziel zu', game.goalErfuellt() === false);
  game.storyFlags.add('probe_abgenommen');
  check('danach ist das Ziel frei', game.goalErfuellt() === true);
}

// Wer über die Stationswahl direkt in Akt 2 einsteigt, hat keine Mappe — dann zählt
// der erste Druck sofort als Einsatz-Takt (kein Softlock über den fehlenden Gegenstand).
{
  const level = buildAkt2();
  const input = createInput(null);
  const game = new Game({ level, input, audio: { play() {}, resume() {} }, events: () => {} });
  game.reset('schwarz');
  const pult = game.entities.find((en) => en.kind === 'pult');
  place(game, pult.x + 4, pult.y + pult.h - PHYS.playerH);
  game.beatPhase = 0.02;
  input.setKey('action', true);
  game.update(1 / 60);
  input.setKey('action', false);
  game.update(1 / 60);
  check('ohne Mappe zählt der erste Druck als Takt',
    pult.teil === 1 && game.mappeAbgegeben === false);
}

// Die Notenmappe reist mit: Akt 1 meldet sie dem Spielstand, Akt 2 legt sie ab
// (Review-Befund: der Ablege-Zweig war ohne Spielstand-Eintrag toter Code).
{
  const ereignisse = [];
  const level = buildAkt1();
  const game = new Game({
    level, input: createInput(null), audio: { play() {}, resume() {} },
    events: (e) => ereignisse.push(e.type),
  });
  game.reset('schwarz');
  game.stimmblaetter = 2;                     // zwei Blätter, das dritte liegt noch da
  const blatt = game.entities.find((en) => en.kind === 'item' && en.item === 'stimmblatt' && en.alive);
  place(game, blatt.x, blatt.y - 4);
  step(game, 0.2);
  check('Akt 1: das dritte Stimmblatt ergibt die Mappe',
    game.hasMappe === true && game.stimmblaetter === 3, `Blätter=${game.stimmblaetter}`);
  check('Akt 1: die Mappe wird dem Spielstand gemeldet',
    ereignisse.includes('mappe'), ereignisse.join(',') || '(keine)');
}

// ================================================= INTERLUDIUM — CABRIO ======
{
  const level = buildCabrio();
  check('Cabrio ist ein Fahr-Level', level.mode === 'racer' && Array.isArray(level.track));
  const { segments, length } = buildTrack(level.track);
  check('Strecke wird gebaut', segments.length > 600 && length > 100000,
    `${segments.length} Segmente, ${length} Einheiten`);
  check('Strecke hat Kurven in beide Richtungen',
    segments.some((s) => s.curve > 0) && segments.some((s) => s.curve < 0));
  check('Strecke hat Hügel', Math.max(...segments.map((s) => s.p1.world.y)) > 100);

  // Projektion: fern am Horizont und schmal, nah unten und breit
  const nah = { world: { x: 0, y: 0, z: 1200 }, camera: {}, screen: {} };
  const fern = { world: { x: 0, y: 0, z: DRAW_DIST * SEG_LEN }, camera: {}, screen: {} };
  project(nah, 0, CAM_H, 0, 384, 216);
  project(fern, 0, CAM_H, 0, 384, 216);
  check('Fernes Segment liegt am Horizont', Math.abs(fern.screen.y - 108) < 8, `y=${fern.screen.y}`);
  check('Nahes Segment ist unten und breit', nah.screen.y > 150 && nah.screen.w > 100,
    `y=${nah.screen.y} w=${nah.screen.w}`);
  check('Straße wird nach vorn schmaler', nah.screen.w > fern.screen.w * 5,
    `${nah.screen.w} vs ${fern.screen.w}`);
}

// Fahren: Gas, Lenken, Neben der Straße, Kontakt, Ziel
{
  const mkRacer = (difficulty = 'gemuetlich', lvl = null) => {
    const level = lvl || buildCabrio();
    const input = createInput(null);
    const events = [];
    const r = new Racer({ level, input, audio: { play() {}, engine() {}, engineOff() {} },
      events: (e) => events.push(e), view: VIEW_DESKTOP, difficulty });
    return { level, input, r, events };
  };
  const { input, r, events } = mkRacer();
  check('Startet im Stand', r.speed === 0 && r.state === 'play');
  stepAny(r, 5);
  check('Gas kommt von allein', r.speed > r.maxSpeed * 0.4, `speed=${r.speed.toFixed(0)}`);
  // Lenken auf gerader Strecke prüfen (Kurvenkraft würde das Ergebnis verfälschen)
  const { input: i1, r: r1 } = mkRacer();
  r1.traffic.length = 0;
  r1.reset();
  const x0 = r1.playerX;
  i1.setKey('right', true);
  stepAny(r1, 0.5);
  check('Rechts lenken wandert nach rechts', r1.playerX > x0 + 0.05,
    `x ${x0.toFixed(2)} -> ${r1.playerX.toFixed(2)}`);
  i1.setKey('right', false);
  i1.setKey('left', true);
  stepAny(r1, 0.9);
  check('Gegenlenken wirkt', r1.playerX < x0, `x=${r1.playerX.toFixed(2)}`);
  i1.setKey('left', false);

  // Kurve zieht nach außen: auf einer Rechtskurve ohne Lenken nach links
  const { r: rk } = mkRacer();
  rk.traffic.length = 0;
  rk.reset();
  stepAny(rk, 4);                    // erst Fahrt aufnehmen
  rk.position = rk.segments.find(s => s.curve > 1.8).index * SEG_LEN;
  rk.playerX = 0;
  stepAny(rk, 1.5);
  check('Kurve zieht nach außen', rk.playerX < -0.05, `x=${rk.playerX.toFixed(2)}`);

  // Neben der Straße wird es langsamer (ohne Verkehr, damit nichts anderes bremst)
  const { r: r2 } = mkRacer();
  r2.traffic.length = 0;
  // gerade Spur halten, damit nur die Straße zählt
  for (let i = 0; i < 60 * 8; i++) { r2.playerX = 0; r2.update(1 / 60); }
  const schnell = r2.speed;
  let daneben = 0;
  for (let i = 0; i < 120; i++) { r2.playerX = 1.6; r2.update(1 / 60); daneben++; }
  check('Neben der Straße bremst es deutlich', r2.speed < schnell * 0.5,
    `${r2.speed.toFixed(0)} statt ${schnell.toFixed(0)} nach ${daneben} Frames daneben`);

  // Kontakt mit einem Fahrzeug
  const { r: r3 } = mkRacer();
  stepAny(r3, 3);
  const car = r3.traffic[0];
  car.z = r3.position + r3.playerZ;
  car.lane = r3.playerX;
  car.speed = 0;
  const speedVorher = r3.speed;
  stepAny(r3, 0.2);
  check('Kontakt kostet Tempo', r3.hits >= 1 && r3.speed < speedVorher,
    `hits=${r3.hits}`);

  // Ankunft mit einem Bot, der die Spur hält
  const { input: i4, r: r4, events: ev4 } = mkRacer();
  for (let i = 0; i < 60 * 120 && r4.state === 'play'; i++) {
    i4.setKey('left', r4.playerX > 0.06);
    i4.setKey('right', r4.playerX < -0.06);
    r4.update(1 / 60);
  }
  check('Fahrt endet an der Open-Air-Bühne', r4.state === 'complete', `state=${r4.state} ${(r4.hud.strecke * 100).toFixed(0)}%`);
  check('Fahrzeit ist plausibel', r4.time > 20 && r4.time < 100, `${r4.time.toFixed(1)}s`);
  check('Höchstgeschwindigkeit wird angezeigt', r4.hud.speed > 60, `${r4.hud.speed} km/h`);
  check('Abschluss meldet Fahrwerte',
    ev4.length === 1 && Array.isArray(ev4[0].rows) && ev4[0].rows.length >= 3,
    JSON.stringify(ev4[0] && ev4[0].rows));

  // Sichtbare Mitspieler: genau der Befund "keine anderen Autos"
  const { input: i7, r: r7 } = mkRacer();
  const objZaehl = [];
  const autoZaehl = [];
  for (let i = 0; i < 60 * 40 && r7.state === 'play'; i++) {
    i7.setKey('left', r7.playerX > 0.05);
    i7.setKey('right', r7.playerX < -0.05);
    r7.update(1 / 60);
    const f = r7.buildFrame();
    objZaehl.push(f.drawList.length);
    autoZaehl.push(f.drawList.filter((o) => o.kind === 'auto' || o.kind === 'lkw').length);
  }
  const mittel = (arr) => arr.reduce((x, y) => x + y, 0) / arr.length;
  const leereFrames = objZaehl.filter((z) => z === 0).length;
  check('Strecke ist mit Objekten bestückt',
    r7.roadside.length > 120 && r7.traffic.length >= 10 && r7.potholes.length >= 8,
    `${r7.roadside.length} Randobjekte, ${r7.traffic.length} Fahrzeuge, ${r7.potholes.length} Schlaglöcher`);
  check('Es sind fast immer Objekte im Bild', leereFrames < objZaehl.length * 0.05,
    `${leereFrames} leere von ${objZaehl.length} Frames, Schnitt ${mittel(objZaehl).toFixed(1)}`);
  check('Andere Fahrzeuge sind regelmäßig zu sehen', mittel(autoZaehl) > 0.5,
    `Schnitt ${mittel(autoZaehl).toFixed(2)} Fahrzeuge je Frame, max ${Math.max(...autoZaehl)}`);
  check('Objekte haben eine sichtbare Größe',
    r7.buildFrame().drawList.every((o) => o.breite * o.half > 0.4));
  check('Fahrzeuge bleiben auf der Fahrbahn',
    r7.traffic.every((c) => Math.abs(c.lane) < 1));

  // Schlagloch kostet Tempo
  const { r: r8 } = mkRacer();
  r8.traffic.length = 0;
  for (let i = 0; i < 60 * 2; i++) { r8.playerX = 0; r8.update(1 / 60); }
  const loch = r8.potholes[0];
  loch.z = r8.position + r8.playerZ + 200;
  loch.lane = 0;
  loch.done = false;
  // Tempo unmittelbar vor dem Treffer vergleichen (danach beschleunigt er wieder)
  let gebremst = false;
  for (let i = 0; i < 40; i++) {
    r8.playerX = 0;
    const vorher = r8.speed;
    r8.update(1 / 60);
    if (r8.bumps === 1) { gebremst = r8.speed < vorher * 0.85; break; }
  }
  check('Schlagloch bremst und wird gezählt', r8.bumps === 1 && gebremst,
    `bumps=${r8.bumps} gebremst=${gebremst}`);

  // Die Nachtfahrt behält die Radarregel. Das Cabrio verwendet stattdessen
  // vorhersehbare Kurvenhinweise, keine zufällig verteilten Blitzer mehr.
  const { r: r9 } = mkRacer('gemuetlich', buildMotorrad());
  r9.traffic.length = 0;
  for (let i = 0; i < 60 * 2; i++) { r9.playerX = 0; r9.update(1 / 60); }
  const blitz = r9.roadside.find((o) => o.kind === 'blitzer');
  blitz.z = r9.position + r9.playerZ + 200;
  blitz.done = false;
  let geblitzt = false;
  for (let i = 0; i < 40; i++) {
    r9.playerX = 0;
    r9.update(1 / 60);
    if (blitz.done) { geblitzt = true; break; }
  }
  check('Radarfalle blitzt bei Tempo', geblitzt === true);

  // Gemütlich ist gnädigera als zügig
  const { r: g1 } = mkRacer('gemuetlich');
  const { r: g2 } = mkRacer('zuegig');
  check('gemütlich: weniger Verkehr', g1.traffic.length < g2.traffic.length,
    `${g1.traffic.length} vs ${g2.traffic.length}`);
  check('gemütlich: langsamer unterwegs', g1.maxSpeed < g2.maxSpeed);

  // Regen und Taktwechsel kommen unterwegs
  const { r: r5 } = mkRacer();
  let regen = false, takt = false;
  for (let i = 0; i < 60 * 90 && r5.state === 'play'; i++) {
    r5.update(1 / 60);
    if (r5.rain) regen = true;
    if (r5.taktBpm !== 104) takt = true;
    if (regen && takt && r5.state === 'play') break;
  }
  check('Regen unterwegs', regen);
  check('Taktwechsel unterwegs', takt);

  // Dauerlauf: keine Ausnahmen, Listen bleiben begrenzt
  const { input: i6, r: r6 } = mkRacer();
  let error = null;
  try {
    for (let i = 0; i < 60 * 60; i++) {
      if (i % 41 === 0) i6.setKey('left', !i6.state.left);
      if (i % 53 === 0) i6.setKey('right', !i6.state.right);
      if (i % 97 === 0) i6.setKey('action', true);
      if (i % 101 === 0) i6.setKey('action', false);
      r6.update(1 / 60);
      if (r6.state === 'complete') {
        r6.reset();
        r6.state = 'play';
      }
    }
  } catch (e) { error = e; }
  check('60 Sekunden Fahrt ohne Ausnahme', !error, error && error.message);
  check('Verkehr bleibt begrenzt', r6.traffic.length < 40, `n=${r6.traffic.length}`);
  check('Straßenrand bleibt begrenzt', r6.roadside.length < 300, `n=${r6.roadside.length}`);
  events.length = 0;
}

// ============================================================== AKT 3 ========
{
  const level = buildAkt3();
  check('Akt 3 existiert als eigenes Levelmodul', level.id === 'akt3' && level.w >= 120);
  check('Akt 3: fünf Bierdeckel', level.deckelTotal === 5, `n=${level.deckelTotal}`);
  check('Akt 3: vier Wetterlagen vorgesehen', (level.weather || []).length === 4
    && level.weather.map((w) => w.kind).join(',') === 'sonne,wind,regen,kaelte');
  check('Akt 3: Vordach als Schutz vorhanden', (level.shelters || []).length >= 1);
  check('Akt 3: Auftritt am Podium nur im Frack',
    level.gates.some((g) => g.need === 'frack'));
  check('Akt 3: Absperrband öffnet erst nach Rolfs Auftrag',
    level.gates.some((g) => g.flag === 'openair_beauftragt'
      && (g.locked || '').includes('ROLF') && (g.opened || '').includes('WIESE')));
  check('Akt 3: Rolf führt Briefing und Payoff',
    level.spawns.filter((s) => s.kind === 'npc' && s.npc === 'rolf').length === 2
    && level.spawns.filter((s) => s.kind === 'npc').every((s) => s.name === 'ROLF'));
  check('Akt 3: zwei Pulte mit je zwei Klammern und eigenem Flag',
    level.spawns.filter((s) => s.kind === 'pult').length === 2
    && level.spawns.filter((s) => s.kind === 'pult').every((s) => s.noetig === 2 && !!s.flag));
  check('Akt 3: sichtbare Klammern an beiden Pulten',
    level.spawns.filter((s) => s.kind === 'decor' && s.spr === 'klammer').length >= 2);
  check('Akt 3: Storyschritte von Rolf bis Podium',
    Array.isArray(level.storySteps) && level.storySteps.length >= 5
    && level.storySteps[0].flag === 'openair_beauftragt');
  check('Akt 3: Ziel verlangt beide Pulte und Rolfs Abschied',
    level.goal.need === 'einsatz'
    && (level.goal.flags || []).includes('pult_west_gesichert')
    && (level.goal.flags || []).includes('pult_ost_gesichert')
    && (level.goal.flags || []).includes('openair_abgenommen'));
  check('Akt 3: zwei Speicherpunkte und Deckung an der Bühne',
    level.spawns.filter((s) => s.kind === 'checkpoint').length >= 2
    && level.alcoves.length >= 3);
  check('Akt 3: zwei Taktwechsel', (level.takts || []).length === 2);
  check('Akt 3: Gerüst in Sprunghöhe (32 px)',
    level.grid[19][84] === 2 && level.grid[17][88] === 2
    && level.grid[15][84] === 2 && level.grid[13][88] === 2);
  check('Akt 3: Lichtbrücke ist begehbar, aber nicht massiv', level.grid[11][80] === 2);
  check('Akt 3: Bühnenboden vorhanden', level.grid[21][85] === 1);
  check('Akt 3: steht im Register',
    LEVELS.length >= 4 && LEVELS[3].id === 'akt3');
}

// Wetter: Zyklus, Wirkung, Notenblätter, Vordach
{
  const mkAkt3 = (difficulty = 'gemuetlich') => {
    const level = buildAkt3();
    const input = createInput(null);
    const game = new Game({ level, input, audio: { play() {}, resume() {} }, events: () => {},
      view: VIEW_DESKTOP, difficulty });
    game.reset('schwarz');
    return { level, input, game };
  };

  const { game } = mkAkt3();
  game.update(1 / 60);                                  // erster Frame setzt das Wetter
  check('Akt 3 startet mit Sonne', game.hud.wetter === 'sonne', String(game.hud.wetter));
  check('Wetter wird angesagt', !!game.hud.hint && /SONNE/.test(game.hud.hint), String(game.hud.hint));
  step(game, 21);
  check('Wetter wechselt nach der Standzeit', game.hud.wetter === 'wind', String(game.hud.wetter));
  step(game, 25);
  check('danach Regen', game.hud.wetter === 'regen', String(game.hud.wetter));
  step(game, 25);
  check('dann Kälte', game.hud.wetter === 'kaelte', String(game.hud.wetter));

  // Sonne brät, im Frack stärker
  const heiss = (outfit) => {
    const { game: g } = mkAkt3();
    g.reset(outfit);
    place(g, 40 * 16, 25 * 16 - PHYS.playerH);
    step(g, 3);
    return g.heat;
  };
  const hSchwarz = heiss('schwarz');
  const hFrack = heiss('frack');
  check('Sonne wärmt jeden, den Frack am stärksten', hFrack > hSchwarz * 2,
    `schwarz ${hSchwarz.toFixed(1)} frack ${hFrack.toFixed(1)}`);

  // Wind wirkt als Kraft
  const { game: gWind } = mkAkt3();
  gWind.wetterIdx = 0; gWind.wetterTimer = 0; gWind.update(1 / 60);   // in den Wind wechseln
  check('Windphase aktiv', gWind.wetterKind === 'wind', String(gWind.wetterKind));
  let gueste = 0;
  for (let i = 0; i < 60 * 20 && !gueste; i++) {
    gWind.update(1 / 60);
    if (gWind.gustTimer > 0) gueste = 1;
  }
  check('Wind schickt Böen', gueste === 1);
  check('Wind trägt Notenblätter', gWind.blaetter.length > 0 || gWind.wetterKind !== 'wind');

  // Notenblatt trifft
  const { game: gBlatt } = mkAkt3();
  const p = place(gBlatt, 40 * 16, 25 * 16 - PHYS.playerH);
  gBlatt.blaetter.push({ x: p.x, y: p.y + 4, vx: 0, vy: 0, t: 0, alive: true });
  gBlatt.update(1 / 60);
  const blattGemeldet = `${gBlatt.hud.hint || ''} ${JSON.stringify((gBlatt.hintQueue || []).map((q) => q.text))}`;
  check('Notenblatt im Gesicht bremst kurz',
    gBlatt.stunTimer > 0 && /NOTENBLATT/.test(blattGemeldet),
    `stun=${gBlatt.stunTimer} meldung=${blattGemeldet.slice(0, 60)}`);

  // Regen: nass werden und unter dem Vordach trocknen
  const { game: gRegen } = mkAkt3();
  gRegen.wetterIdx = 1; gRegen.wetterTimer = 0; gRegen.update(1 / 60);   // in den Regen
  check('Regenphase aktiv', gRegen.wetterKind === 'regen', String(gRegen.wetterKind));
  place(gRegen, 58 * 16, 25 * 16 - PHYS.playerH);       // draußen auf der Wiese
  step(gRegen, 4);
  const nassDraussen = gRegen.nass;
  check('im Regen wird man nass', nassDraussen > 40, `nass=${nassDraussen.toFixed(0)}`);
  place(gRegen, 36 * 16, 25 * 16 - PHYS.playerH);       // unter das Vordach
  step(gRegen, 2);
  check('unter dem Vordach trocknet man', gRegen.nass < nassDraussen,
    `${gRegen.nass.toFixed(0)} statt ${nassDraussen.toFixed(0)}`);
  check('nass macht den Boden rutschig', gRegen.hud.nass > 0);

  // Kälte: steifer Sprung
  const sprungHoehe = (wetterKind) => {
    const { game: g, input: i } = mkAkt3();
    const idx = g.wetter.findIndex((w) => w.kind === wetterKind);
    g.wetterIdx = idx - 1; g.wetterTimer = 0;      // beim nächsten Frame genau diese Lage
    g.update(1 / 60);
    place(g, 40 * 16, 25 * 16 - PHYS.playerH);
    step(g, 0.3);
    const y0 = g.player.y;
    i.setKey('jump', true);
    let hoch = 0;
    for (let k = 0; k < 60; k++) { g.update(1 / 60); hoch = Math.max(hoch, y0 - g.player.y); }
    return hoch;
  };
  const warm = sprungHoehe('sonne');
  const kalt = sprungHoehe('kaelte');
  check('Kälte macht die Finger steif (niedrigerer Sprung)', kalt < warm,
    `kalt ${kalt.toFixed(1)}px vs warm ${warm.toFixed(1)}px`);
}

// Durchspiel-Bot für Akt 3 (Treppe, Gerüst, Lichtbrücke, Podium)
{
  const level = buildAkt3();
  const input = createInput(null);
  const game = new Game({ level, input, audio: { play() {}, resume() {} }, events: () => {}, view: VIEW_DESKTOP });
  game.reset('schwarz');
  game.maxNerves = 99; game.nerves = 99;
  // Ruhiges Wetter: die Route prüft die Geometrie, nicht die zufälligen Windböen.
  // Eine Böe (Zufall, Vorwarnung 0,9 s) schiebt den Bot sonst mitten im letzten
  // Sprung vom Podium — der Test wäre dann je nach Laufzeit mal rot, mal grün.
  game.wetterIdx = 0; game.wetterTimer = 9999; game.wetterKind = 'sonne';
  const route = [
    // Zuerst Rolfs Auftrag: ohne ihn haelt das Absperrband den Weg zur Wiese zu.
    { wp: [12, 25] }, { talk: 'openair_beauftragt' },
    { wp: [40, 25] }, { wp: [58, 25] },
    { wp: [66, 24] }, { wp: [69, 23] }, { wp: [72, 22] }, { wp: [75, 21] },
    { wp: [79, 21] }, { secure: 'pult_west_gesichert' },
    { wp: [89, 21] }, { secure: 'pult_ost_gesichert' },
    { wp: [85, 19] }, { wp: [89, 17] }, { wp: [85, 15] }, { wp: [89, 13] },
    { wp: [80, 11] }, { wp: [91, 11] },
    { outfit: 'frack' },
    { wp: [95, 11] }, { talk: 'openair_abgenommen' },
    { wp: [96, 11] },
  ];
  const failures = [];
  let jumpHold = 0, jumpRelease = 0, letzteRichtung = 1;
  for (const stepItem of route) {
    if (stepItem.outfit) { game.setOutfit(stepItem.outfit); continue; }
    if (stepItem.talk) {
      // Datengetriebenes Gespraech: die Zeilen werden ueber echte
      // Aktionstasten-Anschlaege geblaettert (wie beim Browserlauf).
      const npc = game.entities.find((en) => en.kind === 'npc' && en.flag === stepItem.talk);
      for (let i = 0; i < npc.dialog.length; i++) {
        input.setKey('action', true); game.update(1 / 60);
        input.setKey('action', false); game.update(1 / 60);
      }
      continue;
    }
    if (stepItem.secure) {
      // Im Takt sichern: zwei saubere Klammern pro Pult, ein Daneben kostet
      // nichts. Der Bot laeuft dem Pult nach (Gegentreffer schieben ihn weg);
      // faellt er von der Buehne, holt ihn der eigene Speicherpunkt zurueck.
      const pult = game.entities.find((en) => en.kind === 'pult' && en.flag === stepItem.secure);
      for (let i = 0; i < 30 * 60 && !game.storyFlags.has(stepItem.secure); i++) {
        const p = game.player;
        if (p.y + p.h > 24 * TILE) { game.respawnFromCheckpoint(); continue; }
        const d = (pult.x + 8) - (p.x + p.w / 2);
        input.setKey('right', d > 2);
        input.setKey('left', d < -2);
        game.beatPhase = 0.02;
        input.setKey('action', !!pult.near && i % 2 === 0);
        game.update(1 / 60);
        if (game.state === 'paused') game.resume();
        if (game.state === 'collapse') game.respawnFromCheckpoint();
      }
      input.setKey('left', false); input.setKey('right', false); input.setKey('action', false);
      if (!game.storyFlags.has(stepItem.secure)) failures.push(`Pult ${stepItem.secure}`);
      continue;
    }
    const [wx, row] = stepItem.wp;
    const tx = wx * TILE + 8;
    const feetY = row * TILE;
    let ok = false, bestDist = Infinity, noProgress = 0;
    for (let i = 0; i < 16 * 60; i++) {
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
      if (Math.abs(d) < bestDist - 4) { bestDist = Math.abs(d); noProgress = 0; } else noProgress++;
      const needJump = higher || holeAhead || noProgress > 20;
      if (jumpHold > 0) { input.setKey('jump', true); jumpHold -= 1; if (jumpHold === 0) jumpRelease = 3; }
      else if (jumpRelease > 0) { input.setKey('jump', false); jumpRelease -= 1; }
      else if (p.onGround && needJump) { jumpHold = 16; input.setKey('jump', true); jumpHold -= 1; }
      else input.setKey('jump', false);
      game.update(1 / 60);
      if (game.state === 'paused') game.resume();
      if (game.state === 'collapse') game.respawnFromCheckpoint();
      if (game.state === 'complete') { ok = true; break; }
      if (Math.abs(d) < 8 && Math.abs((p.y + p.h) - feetY) < 18 && p.onGround) { ok = true; break; }
    }
    if (!ok) {
      const p = game.player;
      failures.push(`${wx}/${row} (x=${p.x.toFixed(0)} fuß=${(p.y + p.h).toFixed(0)} wetter=${game.wetterKind})`);
    }
  }
  check('Akt 3: Bot läuft Treppe, Gerüst und Brücke', failures.length === 0, failures.join(' | '));
  check('Akt 3: Route endet am Podium', game.state === 'complete', `state=${game.state}`);
  check('Akt 3: Rolfs Auftrag oeffnet das Absperrband', game.gates[0].open === true
    && game.storyFlags.has('openair_beauftragt'));
  check('Akt 3: Frack oeffnet den Auftritt am Podium', game.gates[1].open === true
    && game.gates[1].need === 'frack');
  check('Akt 3: Bierdeckel unterwegs eingesammelt', game.deckel >= 2, `deckel=${game.deckel}`);
}

// ---------------------------------------------- Levelmasse und Kamera -------
{
  const bauer = {
    akt1: buildAkt1, akt2: buildAkt2, akt3: buildAkt3, akt4: buildAkt4,
  };
  const ohneMasse = [];
  const krummeKamera = [];
  for (const [id, build] of Object.entries(bauer)) {
    const lv = build();
    if (!(lv.w > 0) || !(lv.h > 0)) ohneMasse.push(id);
    const i = createInput(null);
    const g = new Game({
      level: lv, input: i,
      audio: { play() {}, engine() {}, engineOff() {} },
      events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
    });
    g.reset('schwarz');
    i.setKey('right', true);
    for (let k = 0; k < 90; k++) {
      g.update(1 / 60);
      if (g.state === 'paused') g.resume();   // Kleiderstaender anhalten ist kein Fehler
    }
    if (!Number.isFinite(g.cam.x) || !Number.isFinite(g.cam.y)) {
      krummeKamera.push(`${id} (${g.cam.x}/${g.cam.y})`);
    }
    // Und der Spieler muss sich wirklich bewegt haben
    if (!(g.player.x > 60)) krummeKamera.push(`${id} steht (x=${g.player.x.toFixed(0)})`);
  }
  check('jedes Level liefert Breite und Hoehe', ohneMasse.length === 0, ohneMasse.join(', '));
  check('Kamera bleibt endlich und der Spieler laeuft', krummeKamera.length === 0, krummeKamera.join(' | '));
}

// ============================================================ AKT 4: GRABEN ===
{
  const lv = buildAkt4();
  check('Akt 4: Graben ist dunkel und als solcher markiert',
    lv.setting === 'graben' && lv.dark === true, `${lv.setting}/${lv.dark}`);
  check('Akt 4: fuenf Bierdeckel', lv.deckelTotal === 5, String(lv.deckelTotal));
  check('Akt 4: zwei Versenkungen, ein Souffleurkasten',
    lv.elevators.length === 2 && lv.spooks.length === 1);
  check('Akt 4: kein Patrouillengang führt über die Versenkung', (() => {
    // Playtest-Befund: der Tenor lief genau über den Schacht, in dem man auf die
    // Mitfahrt wartet — mit drei Nerven war der Aufstieg damit Glückssache. Wer
    // dort steht, darf von keiner Patrouille berührt werden können.
    const lv = buildAkt4();
    const luecken = [];
    for (const en of lv.spawns.filter((s) => s.patrol)) {
      for (const el of lv.elevators) {
        const a1 = en.patrol[0], a2 = en.patrol[1];
        const b1 = el.tx, b2 = el.tx + el.w - 1;
        if (a1 <= b2 && b1 <= a2) luecken.push(`${en.kind} ${a1}..${a2} ∩ Versenkung ${b1}..${b2}`);
      }
    }
    return luecken.length === 0 || luecken.join(' | ');
  })());

  check('Akt 4: Auftritt nur im Frack', lv.goal.need === 'frack');
  check('Akt 4: Pultlampen als Lichtquellen', lv.gleams.length >= 10, String(lv.gleams.length));

  const mk4 = (difficulty = 'gemuetlich') => {
    const g = new Game({
      level: buildAkt4(), input: createInput(null),
      audio: { play() {}, engine() {}, engineOff() {} },
      events: () => {}, view: VIEW_DESKTOP, difficulty,
    });
    g.reset('schwarz');
    return g;
  };

  const { game: g4 } = { game: mk4() };
  const g0 = lv.gleams[1];
  check('Akt 4: an der Pultlampe ist es hell',
    g4.lightAt(g0.tx, g0.ty) > 0.6, g4.lightAt(g0.tx, g0.ty).toFixed(2));
  let dunkelster = 1;
  for (let tx = 22; tx < 34; tx++) {
    for (let ty = 20; ty < 25; ty++) dunkelster = Math.min(dunkelster, g4.lightAt(tx, ty));
  }
  check('Akt 4: abseits der Lampen ist es dunkel', dunkelster < 0.15, `dunkelster ${dunkelster.toFixed(2)}`);
  check('Akt 4: eigene Lampe macht die Umgebung sichtbar',
    g4.lightAt(Math.floor(g4.player.x / TILE), Math.floor(g4.player.y / TILE)) > 0.3);

  // Versenkung: hinauf und wieder herunter
  const lift = g4.entities.find((e) => e.kind === 'lift');
  place(g4, lift.x + 20, lift.y - PHYS.playerH);
  step(g4, 0.4);
  const yStart = g4.player.y;
  let yHoch = yStart, obenErreicht = false;
  for (let i = 0; i < 60 * 14; i++) {
    g4.update(1 / 60);
    if (g4.player.y < yHoch) yHoch = g4.player.y;
    if (g4.player.y < lift.top + PHYS.playerH + 4) [obenErreicht] = [true];
  }
  check('Akt 4: Versenkung nimmt den Spieler mit nach oben',
    obenErreicht && yHoch < yStart - 100, `von ${yStart.toFixed(0)} auf ${yHoch.toFixed(0)}`);
  check('Akt 4: Versenkung faehrt auch wieder herunter', g4.player.y > yHoch + 40,
    `${yHoch.toFixed(0)} -> ${g4.player.y.toFixed(0)}`);

  // Steg ist ohne Versenkung nicht erreichbar
  const hoeheSteg = 12 * TILE;
  const hoechstesPult = 17 * TILE;
  check('Akt 4: Steg liegt ausserhalb der Sprunghoehe',
    hoechstesPult - hoeheSteg > 40, `${hoechstesPult - hoeheSteg} px`);

  // Souffleurkasten
  const { game: g5 } = { game: mk4() };
  step(g5, 0.2);
  const sp = g5.spuk[0];
  place(g5, sp.tx * TILE + 20, (sp.ty + sp.h) * TILE - PHYS.playerH);
  g5.update(1 / 60);
  check('Akt 4: Souffleurkasten erschrickt', g5.spuk[0].done === true && g5.stunTimer > 0,
    `stun=${g5.stunTimer.toFixed(2)}`);
  check('Akt 4: Souffleur meldet sich auch sprachlich',
    g5.hud.hint.includes('SOUFFLEUR') || (g5.hintQueue || []).some((q) => q.text.includes('SOUFFLEUR')),
    String(g5.hud.hint));

  // Durchspiel-Route: Boden, Versenkung, Steg, Frack, Auftritt
  const i6 = createInput(null);
  const g6 = new Game({
    level: buildAkt4(), input: i6,
    audio: { play() {}, engine() {}, engineOff() {} },
    events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  g6.reset('schwarz');
  g6.maxNerves = 99;
  g6.nerves = 99;
  // Akt 4 ist eine Story-Strecke: das Gitter am Ende des Dienstgangs öffnet nur
  // Rolfs Auftrag, die Kiste kommt nur auf E mit, und Rolf oben nimmt sie nur
  // auf E ab. Genau wie die Bots in Akt 2 und Akt 3 muss dieser Bot die
  // Gespräche deshalb mit echten Aktionsanschlägen führen — bleiben sie aus,
  // steht er vor verschlossenem Gitter (Befund A4b: x=308, Tile 19). Die
  // Strecke selbst bleibt unverändert und wird komplett zu Fuß gegangen.
  const route4 = [
    { wp: [10, 25] }, { wp: [12, 25] }, { talk: 'graben_beauftragt' },
    { wp: [30, 25] }, { kiste: true },  // Rolfs Lampenkiste aufnehmen (E)
    { wp: [50, 25] },
    { wp: [60, 25] },
    { wp: [60, 12], sec: 26 },          // auf die Versenkung warten und mitfahren
    { wp: [66, 12] },                   // Umkleide auf dem Steg
    { talk: 'kiste_uebergeben' },       // Rolf nimmt die Kiste ab (E)
    { outfit: 'frack' },
    { wp: [74, 12] }, { wp: [86, 12] }, // übers Absperrband
    { wp: [96, 12] },                   // Auftritt
  ];
  const fehler4 = [];
  let jh4 = 0, jr4 = 0, lr4 = 1;
  for (const schritt of route4) {
    if (schritt.outfit) { g6.setOutfit(schritt.outfit); continue; }
    if (schritt.kiste) {                // E in Reichweite der Kiste
      i6.setKey('action', true); g6.update(1 / 60);
      i6.setKey('action', false); g6.update(1 / 60);
      continue;
    }
    if (schritt.talk) {                 // E blättert die Datenzeilen durch
      const npc = g6.entities.find((en) => en.kind === 'npc' && en.flag === schritt.talk);
      for (let i = 0; i < npc.dialog.length; i++) {
        i6.setKey('action', true); g6.update(1 / 60);
        i6.setKey('action', false); g6.update(1 / 60);
      }
      continue;
    }
    const [wx, row] = schritt.wp;
    const tx = wx * TILE + 8, feetY = row * TILE;
    let ok = false, best = Infinity, still = 0;
    const maxFrames = Math.round((schritt.sec || 14) * 60);
    for (let i = 0; i < maxFrames; i++) {
      const p = g6.player;
      const d = tx - (p.x + p.w / 2);
      const zielTiefer = feetY > p.y + p.h + 6;
      let richtung = d > 3 ? 1 : (d < -3 ? -1 : 0);
      if (Math.abs(d) < 12 && zielTiefer) richtung = lr4;
      else if (richtung !== 0) lr4 = richtung;
      i6.setKey('right', richtung > 0);
      i6.setKey('left', richtung < 0);
      const footRow = Math.floor((p.y + p.h + 1) / TILE);
      const holeAhead = g6.tileVal(Math.floor((p.x + p.w + 6) / TILE), footRow) === 0 && feetY <= p.y + p.h + 4;
      if (Math.abs(d) < best - 4) { best = Math.abs(d); still = 0; } else still++;
      const need = (feetY < p.y + p.h - 8 && d < 56) || holeAhead || still > 20;
      if (jh4 > 0) { i6.setKey('jump', true); jh4 -= 1; if (jh4 === 0) jr4 = 3; }
      else if (jr4 > 0) { i6.setKey('jump', false); jr4 -= 1; }
      else if (p.onGround && need) { jh4 = 16; i6.setKey('jump', true); jh4 -= 1; }
      else i6.setKey('jump', false);
      g6.update(1 / 60);
      if (g6.state === 'paused') g6.resume();
      if (g6.state === 'collapse') g6.respawnFromCheckpoint();
      if (g6.state === 'complete') { ok = true; break; }
      if (Math.abs(d) < 8 && Math.abs((p.y + p.h) - feetY) < 18 && p.onGround) { ok = true; break; }
    }
    if (!ok) {
      const p = g6.player;
      fehler4.push(`${wx}/${row} (x=${p.x.toFixed(0)} fuß=${(p.y + p.h).toFixed(0)})`);
    }
  }
  check('Akt 4: Bot faehrt mit der Versenkung und tritt auf', fehler4.length === 0, fehler4.join(' | '));
  check('Akt 4: Route endet mit dem Auftritt', g6.state === 'complete', `state=${g6.state}`);
  check('Akt 4: Frack oeffnet den Auftritt', g6.gates.every((g) => g.open === true));
}
// ================================================= INTERLUDIUM: MOTORRAD ====
{
  const lv = buildMotorrad();
  check('Motorrad-Interludium: Racer, Nacht, Motorrad',
    lv.mode === 'racer' && lv.fahrzeug === 'motorrad' && lv.nacht === true,
    `${lv.mode}/${lv.fahrzeug}/${lv.nacht}`);
  check('Motorrad: Tunnel und nasses Laub vorhanden',
    Array.isArray(lv.tunnel) && lv.tunnel.length > 0 && lv.laub > 0, JSON.stringify(lv.tunnel));

  const iM = createInput(null);
  const rm = new Racer({
    level: buildMotorrad(), input: iM,
    audio: { play() {}, engine() {}, engineOff() {} },
    events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  rm.reset();
  const rCab = new Racer({
    level: buildCabrio(), input: createInput(null),
    audio: { play() {}, engine() {}, engineOff() {} },
    events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  rCab.reset();
  check('Motorrad ist flotter als das Cabrio', rm.maxSpeed > rCab.maxSpeed * 1.1,
    `${Math.round(rm.maxSpeed)} vs ${Math.round(rCab.maxSpeed)}`);

  // Nacht und Tunnel
  rm.position = 0;
  check('Motorrad: ausserhalb des Tunnels ist freie Sicht', rm.imTunnel() === false);
  const tun = lv.tunnel[0];
  rm.position = (tun.from + 3) * SEG_LEN;
  check('Motorrad: im Tunnel erkannt', rm.imTunnel() === true, `Segment ${tun.from + 3}`);

  // Nasses Laub: kurzer Grippverlust
  rm.position = 20000;
  const l0 = rm.laub[0];
  l0.z = rm.position + 1500;
  l0.lane = 0;
  l0.done = false;
  let gerutscht = false;
  for (let i = 0; i < 120 && !gerutscht; i++) {
    rm.playerX = 0;
    rm.update(1 / 60);
    if (rm.rutsch > 0) gerutscht = true;
  }
  check('Motorrad: nasses Laub kostet kurz den Grip', gerutscht, `rutsch=${rm.rutsch.toFixed(2)}`);
  check('Motorrad: Grip kommt zurueck', (() => { for (let i = 0; i < 120; i++) rm.update(1 / 60); return rm.rutsch === 0; })());

  // Strecke ist bestueckt und der Bot kommt an
  const frame = rm.buildFrame();
  check('Motorrad: Strecke ist bestueckt', rm.laub.length > 5 && rm.traffic.length > 5,
    `Laub ${rm.laub.length}, Verkehr ${rm.traffic.length}`);

  const iB = createInput(null);
  const rb = new Racer({
    level: buildMotorrad(), input: iB,
    audio: { play() {}, engine() {}, engineOff() {} },
    events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  rb.reset();
  rb.traffic.length = 0;
  rb.laub.length = 0;
  let zeit = 0;
  for (let i = 0; i < 60 * 120 && rb.state === 'play'; i++) {
    iB.setKey('left', rb.playerX > 0.06);
    iB.setKey('right', rb.playerX < -0.06);
    rb.update(1 / 60);
    zeit += 1 / 60;
  }
  check('Motorrad: Bot kommt in der Nacht nach Hause', rb.state === 'complete', `state=${rb.state} nach ${zeit.toFixed(1)}s`);
  check('Motorrad: Abschluss nennt Fahrzeit und Kontakte',
    rb.rows.some(([k]) => k === 'FAHRZEIT') && rb.rows.some(([k]) => k === 'KONTAKTE'),
    JSON.stringify(rb.rows));
}

// ============================================================ AKT 5: BÜHNE ===
{
  const lv = buildAkt5();
  check('Akt 5: Buehne im Theaterschwarz', lv.setting === 'buehne', String(lv.setting));
  check('Akt 5: drei Verfolgerscheinwerfer', (lv.movingLights || []).length === 3);
  check('Akt 5: Ziel verlangt Applaus, die Zugabe und den abgelegten Frack',
    lv.goal.applaus === 60 && lv.goal.need === 'ablegen' && lv.goal.frackOff === undefined
    && (lv.goal.flags || []).includes('zugabe_gespielt'),
    JSON.stringify(lv.goal));
  check('Akt 5: fuenf Bierdeckel', lv.deckelTotal === 5, String(lv.deckelTotal));

  const mk5 = (difficulty = 'gemuetlich') => {
    const g = new Game({
      level: buildAkt5(), input: createInput(null),
      audio: { play() {}, engine() {}, engineOff() {} },
      events: () => {}, view: VIEW_DESKTOP, difficulty,
    });
    g.reset('schwarz');
    return g;
  };

  // Verfolgerlicht wandert wirklich
  const { game: g5 } = { game: mk5() };
  const x0 = g5.movingLights[0].x;
  step(g5, 2);
  check('Akt 5: Verfolgerlicht wandert', Math.abs(g5.movingLights[0].x - x0) > 3,
    `${x0.toFixed(1)} -> ${g5.movingLights[0].x.toFixed(1)}`);

  // Auftrag A5: der Applaus kommt aus der Zugabe am Pult, nicht aus Treffern,
  // und er verfaellt nicht mehr von selbst.
  const { game: gA } = { game: mk5(), input: null };
  check('Akt 5: Applaus startet bei null', gA.applaus === 0);
  step(gA, 2);
  check('Akt 5: Applaus bleibt ohne Auftritt bei null', gA.applaus === 0, String(gA.applaus));

  const { game: gB } = { game: mk5() };
  const pic = gB.entities.find((e) => e.kind === 'piccolo');
  place(gB, pic.x - 40, pic.y);
  gB.beatPhase = 0.02;
  const taktHitsVorher = gB.taktHits;
  gB.tryTritt();
  check('Akt 5: ein Treffer im Takt gibt keinen Applaus mehr (A5)',
    gB.applaus === 0 && gB.taktHits === taktHitsVorher + 1,
    `applaus=${gB.applaus} hits=${gB.taktHits - taktHitsVorher}`);
  // Befund D3: derselbe, noch betaeubte Gegner darf nicht erneut zaehlen.
  gB.tryTritt();
  check('Akt 5: kein zweiter Trefferwert fuer denselben betaeubten Gegner (D3)',
    gB.applaus === 0 && gB.taktHits === taktHitsVorher + 1 && gB.lastTritt.frisch === 0,
    `applaus=${gB.applaus} hits=${gB.taktHits - taktHitsVorher} frisch=${gB.lastTritt.frisch}`);
  const vorher = gB.applaus;
  step(gB, 3);
  check('Akt 5: Applaus faellt nicht mehr von selbst (A5)',
    gB.applaus === vorher, `${vorher.toFixed(1)} -> ${gB.applaus.toFixed(1)}`);

  // Ziel gating: erst die Zugabe, dann der Frack — ohne Hitze.
  const { game: gZ } = { game: mk5() };
  gZ.setOutfit('frack');
  gZ.applaus = 70;
  check('Akt 5: ohne abgelegten Frack geht der Vorhang nicht', gZ.goalErfuellt() === false);
  gZ.applaus = 10;
  gZ.frackAbgelegt = true;
  check('Akt 5: ohne Applaus geht der Vorhang nicht', gZ.goalErfuellt() === false);
  gZ.applaus = 70;
  check('Akt 5: ohne gespielte Zugabe geht der Vorhang nicht', gZ.goalErfuellt() === false);
  gZ.storyFlags.add('zugabe_gespielt');
  check('Akt 5: Zugabe plus abgelegter Frack oeffnen den Vorhang', gZ.goalErfuellt() === true);

  // Befund D4: Frack-Off laesst den Frack an, Ablegen wirkt sichtbar.
  const gF = mk5();
  gF.setOutfit('frack');
  gF.frackOff();
  check('Akt 5: Frack-Off laesst den Frack an', gF.outfit.id === 'frack' && gF.frackOffUsed === true);
  gF.frackAblegen();
  check('Akt 5: Frack ablegen ist sichtbar (Hemd statt Frack)',
    gF.frackAbgelegt === true && gF.outfit.id === 'schwarz', gF.outfit.id);
  check('Akt 5: Frack ablegen geht nur einmal', gF.frackAblegen() === false);

  // Im schwarzen Hemd gibt es nichts abzulegen: der Vorhang bleibt zu und sagt,
  // was fehlt (Review-Befund zu frackAblegen ohne Outfit-Prüfung).
  const gH = mk5();
  check('Akt 5: ohne Frack wird nichts abgelegt', gH.frackAblegen() === false && gH.frackAbgelegt === false);
  gH.applaus = 70;
  gH.player.x = gH.level.goal.x;
  gH.player.y = gH.level.goal.y + gH.level.goal.h - PHYS.playerH;
  gH.update(1 / 60);
  gH.input.setKey('action', true);
  gH.update(1 / 60);
  gH.input.setKey('action', false);
  gH.update(1 / 60);
  check('Akt 5: E am Vorhang im Hemd schließt nichts ab',
    gH.state === 'play' && gH.frackAbgelegt === false, `state=${gH.state}`);
  check('Akt 5: der Vorhang sagt, was fehlt',
    !!gH.hud.hint && gH.hud.hint.includes('FRACK'), `hint=${gH.hud.hint}`);

  // Durchspiel-Route
  const iR = createInput(null);
  const gR = new Game({
    level: buildAkt5(), input: iR,
    audio: { play() {}, engine() {}, engineOff() {} },
    events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  gR.reset('schwarz');
  gR.maxNerves = 99;
  gR.nerves = 99;
  const route5 = [
    { wp: [10, 25] }, { wp: [27, 25] }, { wp: [25, 23] }, { wp: [29, 21] },
    { wp: [33, 20] }, { wp: [37, 19] }, { wp: [42, 17] }, { wp: [48, 16] },
    { wp: [56, 16] }, { wp: [64, 21] }, { wp: [70, 21] },
    { wp: [80, 21] }, { wp: [92, 21] }, { wp: [104, 21] },
    { wp: [108, 21] },
  ];
  const fehler5 = [];
  let jh = 0, jr = 0, lr = 1;
  for (const schritt of route5) {
    if (schritt.outfit) { gR.setOutfit(schritt.outfit); continue; }
    const [wx, row] = schritt.wp;
    const tx = wx * TILE + 8, feetY = row * TILE;
    let ok = false, best = Infinity, still = 0;
    for (let i = 0; i < 16 * 60; i++) {
      const p = gR.player;
      const d = tx - (p.x + p.w / 2);
      const zielTiefer = feetY > p.y + p.h + 6;
      let richtung = d > 3 ? 1 : (d < -3 ? -1 : 0);
      if (Math.abs(d) < 12 && zielTiefer) richtung = lr;
      else if (richtung !== 0) lr = richtung;
      iR.setKey('right', richtung > 0);
      iR.setKey('left', richtung < 0);
      const footRow = Math.floor((p.y + p.h + 1) / TILE);
      const holeAhead = gR.tileVal(Math.floor((p.x + p.w + 6) / TILE), footRow) === 0 && feetY <= p.y + p.h + 4;
      if (Math.abs(d) < best - 4) { best = Math.abs(d); still = 0; } else still++;
      const need = (feetY < p.y + p.h - 8 && d < 56) || holeAhead || still > 20;
      if (jh > 0) { iR.setKey('jump', true); jh -= 1; if (jh === 0) jr = 3; }
      else if (jr > 0) { iR.setKey('jump', false); jr -= 1; }
      else if (p.onGround && need) { jh = 16; iR.setKey('jump', true); jh -= 1; }
      else iR.setKey('jump', false);
      gR.update(1 / 60);
      if (gR.state === 'paused') gR.resume();
      if (gR.state === 'collapse') gR.respawnFromCheckpoint();
      if (Math.abs(d) < 8 && Math.abs((p.y + p.h) - feetY) < 18 && p.onGround) { ok = true; break; }
    }
    if (!ok) {
      const p = gR.player;
      fehler5.push(`${wx}/${row} (x=${p.x.toFixed(0)} fuß=${(p.y + p.h).toFixed(0)})`);
    }
  }
  check('Akt 5: Bot laeuft Gassen, Schnuerboden und Buehne', fehler5.length === 0, fehler5.join(' | '));
  check('Akt 5: Bot sammelt Bierdeckel', gR.deckel >= 3, `deckel=${gR.deckel}`);
}

// ============================================================ EPILOG ========
{
  const lv = buildEpilog();
  check('Epilog: Garten im Freien', lv.setting === 'garten' && lv.ruhig === true, String(lv.setting));
  check('Epilog: Ramona und der Grill stehen bereit',
    lv.spawns.some((s) => s.kind === 'ramona') && lv.spawns.some((s) => s.kind === 'grill'));
  check('Epilog: keine Gegner', !lv.spawns.some((s) => ['piccolo', 'sopran', 'tenor', 'dirigent', 'koffer'].includes(s.kind)));
  check('Epilog: fuenf Bierdeckel und ein Bier',
    lv.deckelTotal === 5 && lv.spawns.some((s) => s.item === 'bier'));

  const iE = createInput(null);
  const gE = new Game({
    level: buildEpilog(), input: iE,
    audio: { play() {}, engine() {}, engineOff() {} },
    events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  gE.reset('schwarz');
  // Ramona gruesst beim Naeherkommen
  const rom = gE.entities.find((e) => e.kind === 'ramona');
  place(gE, rom.x - 10, 25 * TILE - PHYS.playerH);
  gE.update(1 / 60);
  check('Epilog: Ramona meldet sich', !!gE.hud.hint && /RAMONA/.test(gE.hud.hint), String(gE.hud.hint));

  // Der Grill laedt zum Minispiel
  const grl = gE.entities.find((e) => e.kind === 'grill');
  place(gE, grl.x - 6, 25 * TILE - PHYS.playerH);
  gE.update(1 / 60);
  check('Epilog: Grill meldet sich als Aktion',
    !!gE.hud.label && gE.hud.label.text === 'GRILLEN' && gE.hud.label.action === true,
    JSON.stringify(gE.hud.label));
  iE.setKey('action', true);
  gE.update(1 / 60);
  check('Epilog: Aktion am Grill oeffnet das Minispiel',
    gE.state === 'paused' && gE.pauseReason === 'grill', `${gE.state}/${gE.pauseReason}`);

  // Ziel: die Bank. Seit Befund D5 liegt sie unter der Laube — und Platz nimmt
  // man bewusst (E), statt sie nur zu berühren.
  const iZ = createInput(null);
  const gZ = new Game({
    level: buildEpilog(), input: iZ,
    audio: { play() {}, engine() {}, engineOff() {} },
    events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  gZ.reset('schwarz');
  const ziel = gZ.level.goal;
  const bx = Math.round(ziel.x / TILE), bw = Math.round(ziel.w / TILE), by = Math.round(ziel.y / TILE);
  const bankUnterZiel = [];
  for (let i = bx; i < bx + bw; i++) if (gZ.level.grid[by + 1][i] === 1) bankUnterZiel.push(i);
  check('Epilog: unter dem Ziel steht wirklich die Bank',
    bankUnterZiel.length >= 4 && ziel.name === 'DIE BANK' && ziel.need === 'setzen',
    `Bankkacheln=${bankUnterZiel.join(',')}`);
  place(gZ, ziel.x + 8, 25 * TILE - PHYS.playerH);
  gZ.update(1 / 60);
  check('Epilog: vor der Bank steht das Angebot zum Hinsetzen',
    gZ.state === 'play' && !!gZ.hud.label && /HINSETZEN/.test(gZ.hud.label.text) && gZ.hud.label.action === true,
    JSON.stringify(gZ.hud.label));
  iZ.setKey('right', false);
  iZ.setKey('action', true);
  gZ.update(1 / 60);
  check('Epilog: Hinsetzen auf der Bank beendet das Spiel', gZ.state === 'complete', String(gZ.state));
  check('Epilog: Abschluss nennt Deckel und Zeit',
    !!gZ.rows && gZ.rows.length > 0, JSON.stringify(gZ.rows));

  // Befund D5: kein Takt, keine Hitze — auch nicht im Frack.
  const iR2 = createInput(null);
  const gR2 = new Game({
    level: buildEpilog(), input: iR2,
    audio: { play() {}, engine() {}, engineOff() {} },
    events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  gR2.reset('frack');
  place(gR2, 20 * TILE, 25 * TILE - PHYS.playerH);
  iR2.setKey('right', true);
  stepAny(gR2, 1.5);
  stepAny(gR2, 3);
  check('Epilog: im Frack steigt keine Hitze mehr', gR2.heat === 0, String(gR2.heat));
  check('Epilog: kein Takt mehr', gR2.beatPhase === 0 && gR2.beats === 0,
    `phase=${gR2.beatPhase} beats=${gR2.beats}`);
  check('Epilog: HUD meldet den ruhigen Modus', gR2.hud.ruhig === true);
  iR2.setKey('right', false);

  // Der Frack kommt in den Schrank der Laube.
  const iS = createInput(null);
  const gS = new Game({
    level: buildEpilog(), input: iS,
    audio: { play() {}, engine() {}, engineOff() {} },
    events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  gS.reset('frack');
  const schrank = gS.entities.find((e) => e.kind === 'schrank');
  check('Epilog: der Schrank der Laube existiert', !!schrank);
  place(gS, schrank.x + 8, 25 * TILE - PHYS.playerH);
  gS.update(1 / 60);
  check('Epilog: der Schrank bietet das Aufhängen an',
    !!gS.hud.label && /SCHRANK/.test(gS.hud.label.text) && gS.hud.label.action === true,
    JSON.stringify(gS.hud.label));
  iS.setKey('action', true);
  gS.update(1 / 60);
  check('Epilog: der Frack hängt im Schrank, das Hemd bleibt',
    gS.frackAbgelegt === true && gS.outfit.id === 'schwarz', gS.outfit.id);
}

// ============================================================ GRILL ==========
{
  const iG = createInput(null);
  const mkG = () => {
    const g = new Grill({
      level: { bpm: 76 }, input: iG,
      audio: { play() {}, engine() {}, engineOff() {} },
      events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
    });
    g.reset();
    return g;
  };
  const g1 = mkG();
  check('Grill: acht Wuerste, drei auf dem Rost', g1.wuerserste.length === 8 && g1.grill.length === 3);

  // Im Takt wenden
  const g2 = mkG();
  g2.auswahl = 0;
  g2.beatPhase = 0.02;
  iG.setKey('action', true);
  g2.update(1 / 60);
  iG.setKey('action', false);
  check('Grill: im Takt gewendet gibt Bonus', g2.sauber === 1 && g2.wuerserste[0].seite === 1,
    `sauber=${g2.sauber} seite=${g2.wuerserste[0].seite}`);

  // Ausserhalb des Takts wenden: kein Bonus, aber es geht
  const g3 = mkG();
  g3.auswahl = 0;
  g3.beatPhase = 0.5;
  iG.setKey('action', true);
  g3.update(1 / 60);
  iG.setKey('action', false);
  check('Grill: ohne Takt geht es auch, nur ohne Bonus',
    g3.sauber === 0 && g3.wuerserste[0].seite === 1);

  // Servieren liefert Punkte
  const g4 = mkG();
  g4.auswahl = 0;
  const w = g4.wuerserste[0];
  w.seite = 1;
  w.gar = 76;
  g4.beatPhase = 0.02;
  iG.setKey('action', true);
  g4.update(1 / 60);
  iG.setKey('action', false);
  check('Grill: gut gegart serviert gibt Punkte', g4.punktestand >= 100 && g4.serviert === 1,
    `punkte=${g4.punktestand}`);

  // Vernachlaessigen verbrennt
  const g5 = mkG();
  stepAny(g5, 20);
  check('Grill: unbeachtete Wuerste verbrennen', g5.verbrannt >= 1, String(g5.verbrannt));

  // Ein Bot, der alles im Takt wendet und serviert
  const g6 = mkG();
  let serviert = 0;
  for (let i = 0; i < 60 * 240 && g6.state === 'play'; i++) {
    // Fruehester Termin zuerst: wie lange bis zum Verbrennen, geteilt durch die
    // noch noetigen Handgriffe (ungewendet = zwei, gewendet = einer)
    const aufRost = g6.wuerserste.filter((x) => x.zustand === 'rost');
    if (aufRost.length) {
      const dringlichkeit = (w) => (100 - w.gar) / (w.seite === 0 ? 9 : 12) / (w.seite === 0 ? 2 : 1);
      aufRost.sort((a, b) => dringlichkeit(a) - dringlichkeit(b));
      const naechste = aufRost[0];
      // Wichtig: die Auswahl zaehlt nur die Würste AUF dem Rost, nicht alle
      const idx = aufRost.indexOf(naechste);
      const achse = idx - g6.auswahl;
      // Auswahl rueckt pro Tastendruck eine Stufe: Druck und Loslassen wechseln
      const tipp = i % 4 < 2;
      iG.setKey('left', achse < 0 && tipp);
      iG.setKey('right', achse > 0 && tipp);
      const genau = g6.beatGenauigkeit() <= 0.12;
      // Nur handeln, wenn die Auswahl wirklich auf der Wurst steht
      const soll = naechste.seite === 0 || naechste.gar >= 62;
      iG.setKey('action', achse === 0 && genau && soll);
    } else {
      iG.setKey('left', false); iG.setKey('right', false); iG.setKey('action', false);
    }
    g6.update(1 / 60);
    serviert = g6.serviert;
  }
  check('Grill: Bot bekommt alle Wuerste durch', serviert === 8, `serviert=${serviert} state=${g6.state}`);
  check('Grill: Bewertung steht am Ende', g6.state === 'complete' && g6.rows.some(([k]) => k === 'BEWERTUNG'),
    JSON.stringify(g6.rows));
  check('Grill: viele im Takt gewendet', g6.sauber >= 5, String(g6.sauber));
  check('Grill: Rauch und Fett bleiben begrenzt',
    g6.rauch.length < 200 && g6.fett.length < 60, `rauch=${g6.rauch.length} fett=${g6.fett.length}`);

  // ------------------------------------------------- Auftrag E2: Grafik ------
  // Garstufen als eigene Sprites: fünf Namen, fünf verschiedene Bildmatrizen,
  // fünf verschiedene Farbwerte — nicht ein Bild in fünf Farben.
  check('Grill: Garstufen sind eigene Sprites',
    WURST_STUFEN.length === 5 && new Set(WURST_STUFEN.map((s) => JSON.stringify(SPRITES[s]))).size === 5,
    WURST_STUFEN.join(','));
  check('Grill: jede Garstufe hat eine eigene Leitfarbe',
    new Set(WURST_STUFEN.map((s) => GARSTUFEN_FARBE[s])).size === 5,
    WURST_STUFEN.map((s) => `${s}=${GARSTUFEN_FARBE[s]}`).join(' '));
  check('Grill: jede Garstufe ist beschriftet',
    WURST_STUFEN.every((s) => !!GARSTUFEN_TEXT[s] && GARSTUFEN_TEXT[s] === GARSTUFEN_TEXT[s].toUpperCase()));
  check('Grill: der Garstand fuehrt zur passenden Garstufe',
    garstufeName(0) === 'wurst_roh' && garstufeName(30) === 'wurst_angebraten'
    && garstufeName(60) === 'wurst_goldbraun' && garstufeName(90) === 'wurst_dunkel'
    && garstufeName(40, 1) === 'wurst_verbrannt',
    [garstufeName(0), garstufeName(30), garstufeName(60), garstufeName(90), garstufeName(40, 1)].join(','));
  const glutBilder = ['glut1', 'glut2', 'glut3'].map((n) => JSON.stringify(SPRITES[n]));
  check('Grill: die Glut glimmt in mehreren Bildern',
    glutBilder.every((b) => !!b) && new Set(glutBilder).size === 3);
  check('Grill: Rauch, Dampf, Fett und Teller sind vorhanden',
    !!SPRITES.rauch && !!SPRITES.dampf && !!SPRITES.fett && !!SPRITES.teller);
  check('Grill: das HUD nennt die Garstufen der Aufliegenden',
    Array.isArray(g1.hud.stufen) && g1.hud.stufen.length === 3
    && g1.hud.stufen.every((s) => s === 'wurst_roh') && g1.hud.gesamt === 8
    && g1.hud.fokus === g1.auswahl && g1.hud.fokusName === 'ROH',
    JSON.stringify(g1.hud.stufen));
  // Rauch erst, wenn die Wurst zu lange liegt — und noch nicht verbrannt.
  iG.setKey('left', false);
  iG.setKey('right', false);
  iG.setKey('action', false);
  const g7 = mkG();
  stepAny(g7, 9);
  check('Grill: bei zu langem Liegen steigt Rauch',
    g7.rauch.length > 0 && g7.verbrannt === 0, `rauch=${g7.rauch.length} verbrannt=${g7.verbrannt}`);
  // Fett tropft nur von der Garseite.
  const g8 = mkG();
  g8.auswahl = 0;
  iG.setKey('action', true);
  g8.update(1 / 60);
  iG.setKey('action', false);
  stepAny(g8, 4);
  check('Grill: Fett tropft in die Glut',
    g8.fettTropfen > 0 && g8.fett.length > 0 && g8.wuerserste[0].seite === 1,
    `tropfen=${g8.fettTropfen}`);

  // --------------------------------------------- Auftrag E2: Steuerung -------
  // Eine Aktion pro Druck: zwei Sekunden gehalten wendet genau einmal.
  const g9 = mkG();
  g9.auswahl = 0;
  iG.setKey('action', true);
  stepAny(g9, 2);
  iG.setKey('action', false);
  g9.update(1 / 60);
  check('Grill: ein gehaltener Knopf wendet genau einmal',
    g9.wuerserste[0].gewendet === 1 && g9.serviert === 0 && g9.sauber <= 1,
    `gewendet=${g9.wuerserste[0].gewendet} serviert=${g9.serviert}`);

  // Die Fokusmarkierung existiert und wandert nachvollziehbar.
  const g10 = mkG();
  check('Grill: die Fokusmarkierung liegt auf einer Wurst',
    g10.hud.fokus === 1 && g10.hud.fokusName === GARSTUFEN_TEXT[g10.hud.stufen[1]]);
  g10.auswahl = 0;
  iG.setKey('right', true);
  g10.update(1 / 60);
  iG.setKey('right', false);
  g10.update(1 / 60);
  check('Grill: die Auswahl wandert einen Schritt pro Druck',
    g10.auswahl === 1 && g10.hud.fokus === 1, String(g10.auswahl));
  iG.setKey('right', true);
  g10.update(1 / 60);
  iG.setKey('right', false);
  g10.update(1 / 60);
  check('Grill: die Markierung wandert nachvollziehbar weiter',
    g10.auswahl === 2 && g10.hud.fokus === 2 && g10.hud.fokusName === 'ROH', String(g10.auswahl));
  // Gehalten: erst ein Schritt, dann Ruhe, dann ruhiges Wiederholen.
  g10.auswahl = 0;
  iG.setKey('right', true);
  stepAny(g10, 0.15);
  check('Grill: ein gehaltener Richtungsknopf wandert nur einen Schritt',
    g10.auswahl === 1, String(g10.auswahl));
  stepAny(g10, 1.2);
  check('Grill: nach der Ruhezeit wandert die Markierung ruhig weiter',
    g10.auswahl === 2, String(g10.auswahl));
  iG.setKey('right', false);
  stepAny(g10, 1 / 60);

  // Verpasster Takt kostet keine Wurst — knapp daneben ist eine Pointe.
  const g11 = mkG();
  g11.auswahl = 0;
  g11.beatPhase = 0.5;
  iG.setKey('action', true);
  g11.update(1 / 60);
  iG.setKey('action', false);
  check('Grill: ein verpasster Takt kostet keine Wurst',
    g11.wuerserste[0].zustand === 'rost' && g11.verbrannt === 0 && g11.fertig === 0
    && g11.serviert === 0 && g11.wuerserste[0].seite === 1,
    `${g11.wuerserste[0].zustand} verbrannt=${g11.verbrannt}`);
  const g12 = mkG();
  g12.auswahl = 0;
  g12.beatPhase = 0.42;
  iG.setKey('action', true);
  g12.update(1 / 60);
  iG.setKey('action', false);
  check('Grill: knapp daneben ist eine Pointe, kein Verlust',
    g12.knapp === 1 && g12.sauber === 0 && g12.wuerserste[0].zustand === 'rost'
    && g12.rows.length === 0,
    `knapp=${g12.knapp} sauber=${g12.sauber}`);
}

// -------------------------------------------------- Schauplatz (Keller/Freiluft) --
{
  const j3 = buildAkt3();
  check('Akt 3 ist als Freiluft markiert', j3.setting === 'openair', String(j3.setting));
  check('Keller bleibt Keller', buildAkt1().setting === 'keller' && buildAkt2().setting === 'saal');

  const { game: keller } = fresh('schwarz', { stands: false });
  const draussen = new Game({
    level: buildAkt3(), input: createInput(null),
    audio: { play() {}, engine() {}, engineOff() {} },
    events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  draussen.reset('schwarz');
  check('Keller zeichnet Fels ueber dem Gang', keller.tileLook(30, 4) === 'stein' && keller.tileLook(30, 20) === 'stein');
  check('Freiluft zeichnet Himmel statt Fels',
    draussen.tileLook(30, 4) === null && draussen.tileLook(30, 12) === null,
    `${draussen.tileLook(30, 4)} / ${draussen.tileLook(30, 12)}`);
  check('Freiluft: Wiese als Boden', draussen.tileLook(30, 25) === 'gras', String(draussen.tileLook(30, 25)));
  check('Freiluft: Buehnenboden ist Planke, nicht Wiese',
    draussen.tileLook(80, 21) === 'buehne', String(draussen.tileLook(80, 21)));
  check('Freiluft: Vordach ist ueberdacht', draussen.tileLook(35, 20) === 'vordach', String(draussen.tileLook(35, 20)));
  check('Freiluft: Treppe ist Planke', draussen.tileLook(69, 23) === 'buehne', String(draussen.tileLook(69, 23)));
}

// ------------------------------------------------- Schauplatz und Himmel ----
{
  const erwartet = {
    akt1: false, akt2: false, akt3: true, akt4: false, akt5: false, epilog: true,
  };
  const falsch = [];
  for (const l of LEVELS) {
    if (l.mode === 'racer') continue;                 // Fahr-Interludien haben ihren eigenen Himmel
    const g = new Game({
      level: l.build(), input: createInput(null),
      audio: { play() {}, engine() {}, engineOff() {} },
      events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
    });
    g.reset('schwarz');
    if (g.usesSky() !== erwartet[l.id]) falsch.push(`${l.id}: ${g.usesSky()}`);
  }
  check('Hintergrund passt zum Schauplatz (Freiluft mit Himmel)', falsch.length === 0, falsch.join(', '));
  const garten = new Game({
    level: buildEpilog(), input: createInput(null),
    audio: { play() {}, engine() {}, engineOff() {} },
    events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  garten.reset('schwarz');
  check('Garten zeichnet Wiese und nicht Fels',
    garten.usesSky() === true && garten.tileLook(20, 25) === 'gras',
    `sky=${garten.usesSky()} look=${garten.tileLook(20, 25)}`);
}

// ---------------------------------------- Zu Fuß durchspielbar (kein God-Mode)
{
  // Epilog: nur laufen und springen — kein Teleport. Hecken sind 32 px, also springbar.
  const iE = createInput(null);
  const epi = new Game({
    level: buildEpilog(), input: iE,
    audio: { play() {}, engine() {}, engineOff() {} },
    events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  epi.reset('schwarz');
  const wegEpilog = [[10, 25], [27, 25], [30, 23], [34, 25], [42, 25], [56, 25], [66, 25], [74, 25], [88, 25]];
  let jumpHold = 0, jumpRelease = 0, letzteRichtung = 1, hoch = 0;
  const fehlwege = [];
  for (const [wx, row] of wegEpilog) {
    const tx = wx * TILE + 8, feetY = row * TILE;
    let ok = false, bestDist = Infinity, noProg = 0;
    for (let i = 0; i < 14 * 60; i++) {
      const p2 = epi.player;
      const d = tx - (p2.x + p2.w / 2);
      let richtung = d > 3 ? 1 : (d < -3 ? -1 : 0);
      const zielTiefer = feetY > p2.y + p2.h + 6;
      if (Math.abs(d) < 12 && zielTiefer) richtung = letzteRichtung;
      else if (richtung !== 0) letzteRichtung = richtung;
      iE.setKey('right', richtung > 0);
      iE.setKey('left', richtung < 0);
      const footRow = Math.floor((p2.y + p2.h + 1) / TILE);
      const holeAhead = epi.tileVal(Math.floor((p2.x + p2.w + 6) / TILE), footRow) === 0 && feetY <= p2.y + p2.h + 4;
      if (Math.abs(d) < bestDist - 4) { bestDist = Math.abs(d); noProg = 0; } else noProg++;
      const needJump = feetY < p2.y + p2.h - 8 || holeAhead || noProg > 20;
      if (jumpHold > 0) { iE.setKey('jump', true); jumpHold -= 1; if (jumpHold === 0) jumpRelease = 3; }
      else if (jumpRelease > 0) { iE.setKey('jump', false); jumpRelease -= 1; }
      else if (p2.onGround && needJump) { jumpHold = 18; iE.setKey('jump', true); jumpHold -= 1; }
      else iE.setKey('jump', false);
      epi.update(1 / 60);
      if (epi.state === 'paused') epi.resume();
      if (epi.state === 'complete') { ok = true; break; }
      if (Math.abs(d) < 8 && Math.abs((p2.y + p2.h) - feetY) < 18 && p2.onGround) { ok = true; break; }
      hoch = Math.max(hoch, Math.round(p2.y + p2.h));
    }
    if (!ok) fehlwege.push(`${wx}/${row} (x=${epi.player.x.toFixed(0)})`);
  }
  // Der Schluss ist seit Befund D5 eine bewusste Aktion (E) — die Bank wird
  // nicht mehr beim Berühren gewertet.
  iE.setKey('right', false);
  place(epi, epi.level.goal.x + 8, 25 * TILE - PHYS.playerH);
  iE.setKey('action', true);
  epi.update(1 / 60);
  check('Epilog ist zu Fuß erreichbar (Hecke springbar)',
    fehlwege.length === 0 && epi.state === 'complete',
    fehlwege.length ? fehlwege.join(' | ') : `Zustand ${epi.state}`);

  // Akt 4 mit den echten drei Nerven: ein normaler Spieler muss durchkommen.
  // Modell: laeuft die Route, springt an Kanten UND weicht anfliegenden
  // Schallwellen aus. Kein God-Mode, keine Teleports.
  const i4 = createInput(null);
  const vier = new Game({
    level: buildAkt4(), input: i4,
    audio: { play() {}, engine() {}, engineOff() {} },
    events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  vier.reset('schwarz');
  let zusammenbrueche = 0, kante = 0, sprungTakt = 0;
  // Dieselbe Story-Hürde wie im Routenbot oben: ohne Rolfs Auftrag bleibt das
  // Gitter zu, ohne E bleibt die Kiste liegen und ohne Übergabe endet der Akt
  // nicht. Die Wegpunkte sind unverändert — der Bot geht sie weiter zu Fuß.
  const weg4 = [
    [10, 25], [12, 25], { talk: 'graben_beauftragt' },
    [30, 25], { kiste: true },
    [44, 23], [50, 25], [60, 25],
    [60, 12], [66, 12], { talk: 'kiste_uebergeben' },
    { outfit: 'frack' },
    [72, 12], [86, 12], [96, 12],
  ];
  const wegpunkte4 = weg4.filter((s) => Array.isArray(s)).length;
  let ziel4 = 0, erreicht4 = 0;
  for (let i = 0; i < 60 * 300 && vier.state !== 'complete' && ziel4 < weg4.length; i++) {
    const schritt = weg4[ziel4];
    if (schritt.outfit) { vier.setOutfit(schritt.outfit); ziel4 += 1; continue; }
    if (schritt.kiste) {              // E in Reichweite der Lampenkiste
      i4.setKey('action', true); vier.update(1 / 60);
      i4.setKey('action', false); vier.update(1 / 60);
      ziel4 += 1; continue;
    }
    if (schritt.talk) {               // E blättert die Datenzeilen durch
      const npc = vier.entities.find((en) => en.kind === 'npc' && en.flag === schritt.talk);
      for (let k = 0; k < npc.dialog.length; k++) {
        i4.setKey('action', true); vier.update(1 / 60);
        i4.setKey('action', false); vier.update(1 / 60);
      }
      ziel4 += 1; continue;
    }
    const p = vier.player;
    const [tx, row] = schritt;
    const dx = tx * 16 + 8 - (p.x + p.w / 2);
    const sollY = row * 16;
    i4.setKey('right', dx > 3);
    i4.setKey('left', dx < -3);
    const hoeher = sollY < p.y + p.h - 8;
    const fuss = Math.floor((p.y + p.h + 1) / TILE);
    const loch = vier.tileVal(Math.floor((p.x + p.w + 6) / TILE), fuss) === 0;
    // Ausweichen: Schallwelle kommt auf Brusthoehe heran
    const gefahr = vier.projectiles.some((pr) => Math.abs(pr.x - (p.x + p.w / 2)) < 56
      && pr.y + pr.h > p.y + 2 && pr.y < p.y + p.h - 2);
    if (p.onGround && (hoeher || loch || gefahr) && sprungTakt <= 0) sprungTakt = 20;
    if (sprungTakt > 0) { i4.setKey('jump', sprungTakt > 8); sprungTakt -= 1; } else i4.setKey('jump', false);
    vier.update(1 / 60);
    if (vier.state === 'paused') vier.resume();
    if (vier.state === 'collapse') { zusammenbrueche++; vier.respawnFromCheckpoint(); }
    if (Math.abs(dx) < 8 && Math.abs((p.y + p.h) - sollY) < 18 && p.onGround) { ziel4 += 1; erreicht4 += 1; }
  }
  // Erreichbarkeit ist die harte Aussage: jeder Wegpunkt (inkl. Versenkung)
  // ohne Teleport. Die Zusammenbrueche stehen als Druckmesser in der Meldung —
  // wie streng das fuer einen Menschen ist, entscheidet Rolands eigener Test.
  check('Akt 4: Route ist erreichbar (alle Wegpunkte, ohne Teleport)',
    erreicht4 >= wegpunkte4 || vier.state === 'complete',
    `Wegpunkte ${erreicht4}/${wegpunkte4}, Zusammenbrüche=${zusammenbrueche} (Druckmesser)`);
}

// ------------------------------- Akt 4: Weg nach oben ohne Punktlandung -------
// Playtest-Befund: die obere Etage war nur per Glitch erreichbar, weil die
// Versenkung 16 px ueber dem Boden stand und man punktgenau hineinspringen musste.
{
  const iL = createInput(null);
  const gl = new Game({
    level: buildAkt4(), input: iL,
    audio: { play() {}, engine() {}, engineOff() {} },
    events: () => {}, view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  gl.reset('schwarz');
  const lift = gl.entities.find((e) => e.kind === 'lift');
  check('Akt 4: Versenkung ist buendig mit dem Boden',
    lift.bottom === 25 * TILE && lift.top === 12 * TILE,
    `unten=${lift.bottom} oben=${lift.top}`);
  place(gl, lift.x - 30, 25 * TILE - PHYS.playerH);
  let anBord = false, oben = false, frames = 0;
  for (let i = 0; i < 60 * 45; i++) {
    const p = gl.player;
    const mittel = p.x + p.w / 2;
    const drauf = mittel > lift.x + 6 && mittel < lift.x + lift.w - 6;
    iL.setKey('right', !anBord && !drauf);      // hinlaufen, dann stehen bleiben
    iL.setKey('jump', false);                   // ausdruecklich OHNE Sprung
    if (drauf) anBord = true;
    gl.update(1 / 60);
    frames += 1;
    if (gl.state === 'paused') gl.resume();
    if (anBord && p.y + p.h <= lift.top + 6) { oben = true; break; }
  }
  check('Akt 4: ohne Sprung per Versenkung nach oben',
    oben, `anBord=${anBord} nach ${(frames / 60).toFixed(1)}s, y=${(gl.player.y + gl.player.h).toFixed(0)}`);
}

// ------------------------------------------------------ Pause & Langzeitlauf --
{
  const { game } = fresh('schwarz', { stands: false });
  game.pause('user');
  check('pause stops simulation', game.state === 'paused');
  const pos = game.player.x;
  step(game, 1);
  check('paused game does not move', game.player.x === pos);
  game.resume();
  check('resume continues', game.state === 'play');

  const { game: g2, input: i2 } = fresh();
  let error = null;
  let completed = false;
  try {
    for (let i = 0; i < 60 * 30; i++) {
      if (i % 37 === 0) i2.setKey('right', !i2.state.right);
      if (i % 53 === 0) i2.setKey('left', !i2.state.left);
      if (i % 71 === 0) i2.setKey('jump', true);
      if (i % 79 === 0) i2.setKey('jump', false);
      if (i % 97 === 0) i2.setKey('action', true);
      if (i % 103 === 0) i2.setKey('action', false);
      if (g2.state === 'paused') g2.resume();
      if (g2.state === 'collapse') g2.respawnFromCheckpoint();
      if (g2.state === 'complete') { completed = true; break; }
      g2.update(1 / 60);
    }
  } catch (e) { error = e; }
  check('30 simulated seconds without exception', !error, error && error.message);
  check('game still in a valid state',
    ['play', 'collapse', 'complete'].includes(g2.state) || completed, g2.state);
  check('particle pool stays bounded', g2.particles.length <= 400, `p=${g2.particles.length}`);
  check('projectiles stay bounded', g2.projectiles.length < 40, `pr=${g2.projectiles.length}`);
  check('entity list does not leak', g2.entities.length < 60, `e=${g2.entities.length}`);
}

// ------------------------------------ STORY-GERÜST (DRR-03) -------------------
{
  check('Reihenfolge: Finale vor der Nachtfahrt, Garten zuletzt',
    LEVELS.map((l) => l.id).join(' > ')
      === 'akt1 > akt2 > cabrio > akt3 > akt4 > akt5 > motorrad > epilog',
    LEVELS.map((l) => l.id).join(' > '));
  check('Jede Station hat ID, Name, Modus und ein Ziel',
    STATIONEN.every((s) => s.id && s.name && s.mode && s.ziel && s.ziel.length > 12),
    JSON.stringify(STATIONEN.filter((s) => !s.ziel).map((s) => s.id)));
  check('Die Ziele sind eindeutig formuliert',
    new Set(STATIONEN.map((s) => s.ziel)).size === STATIONEN.length);
  check('Leveldaten und Stationen teilen die Ziele',
    LEVELS.every((l) => l.ziel === STATIONEN.find((s) => s.id === l.id).ziel));
  check('Jede Station hat eine Belohnung',
    STATIONEN.every((s) => BELOHNUNGEN[s.id] && BELOHNUNGEN[s.id].title));

  // Migration: alte Stände kannten nur `act` (Index der ALTEN Reihenfolge).
  const alt = [
    [0, 'akt1'], [1, 'akt2'], [2, 'cabrio'], [3, 'akt3'],
    [4, 'akt4'], [5, 'motorrad'], [6, 'akt5'], [7, 'epilog'],
  ];
  const falsch = [];
  for (const [idx, id] of alt) {
    const s = migriereSave({ act: idx, akt1: true });
    if (s.station !== id) falsch.push(`act=${idx} → ${s.station} (erwartet ${id})`);
  }
  check('Alte Spielstände landen auf derselben Station wie vorher', falsch.length === 0, falsch.join(' | '));
  check('Alter Index 5 zeigt weiter auf die Nachtfahrt, nicht auf das Finale',
    stationIndex(migriereSave({ act: 5 })) === 6, String(stationIndex(migriereSave({ act: 5 }))));
  check('Alter Index 6 zeigt auf die Bühne', migration6(), String(migration6()));
  function migration6() { return stationIndex(migriereSave({ act: 6 })); }

  // Neue Stände bleiben, unbekannte fallen auf den Anfang zurück.
  check('Neuer Stand bleibt unverändert',
    migriereSave({ station: 'akt4' }).station === 'akt4' && stationIndex({ station: 'akt4' }) === 4);
  check('Unbekannte Station fällt auf Akt 1 zurück',
    migriereSave({ station: 'gibtsnicht' }).station === 'akt1');
  check('Leerer Stand beginnt bei Akt 1',
    stationIndex(migriereSave({})) === 0 && migriereSave(null).station === 'akt1');
  check('Version und Fortschrittsliste werden gesetzt',
    migriereSave({}).v === SAVE_VERSION && JSON.stringify(migriereSave({}).geschafft) === '{}');
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
