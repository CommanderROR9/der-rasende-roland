// tests/smoke.test.mjs — headless Tests der Simulation (kein Browser, kein Canvas).
// Aufruf: node tests/smoke.test.mjs
import { buildAkt1 } from '../src/world.js';
import { Game } from '../src/game.js';
import { createInput } from '../src/input.js';
import { PHYS, BPM_BASE, BPM_TENOR, VIEW_TOUCH } from '../src/config.js';

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
  check('outfit stands exist', level.spawns.filter((s) => s.kind === 'stand').length >= 4);
  check('three enemy types present',
    ['piccolo', 'sopran', 'tenor'].every((k) => level.spawns.some((s) => s.kind === k)));
  check('two gates (Anzug + Frack)', level.gates.length === 2);
  check('gates need anzug and frack',
    level.gates.map((g) => g.need).sort().join(',') === 'anzug,frack');
  check('gates block the way while locked',
    level.gates.every((g) => level.grid[g.ty + g.th - 1][g.tx] === 1));
  check('lights and alcoves exist', level.lights.length >= 4 && level.alcoves.length >= 3);
  check('morsch tiles exist', level.grid.flat().filter((v) => v === 3).length >= 3);
  check('oneway wood exists', level.grid.flat().filter((v) => v === 2).length >= 3);
  check('goal inside level', level.goal.x + level.goal.w <= level.w * TILE);
  check('vertical range is real',
    level.spawns.some((s) => s.kind === 'spawn' && s.walkRow === 24)
    && level.spawns.some((s) => s.kind === 'item' && s.item === 'mappe' && s.walkRow === 12));
  // Der Kern des Levelbaus: kein Abkürzungsweg am Boden entlang
  check('no ground-level bypass under the upper corridor',
    level.grid[24][26] === 1 && level.grid[24][30] === 1 && level.grid[24][40] === 1);
  check('no ground-level bypass from the lower corridor to the finale',
    level.grid[24][110] === 1 && level.grid[24][112] === 1);
  check('climb spans at least 10 tiles of height',
    level.spawns.find((s) => s.isSpawn).walkRow - 12 >= 10);
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
  place(game, pic.x - 80, pic.y);
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
  place(g2, 99 * TILE, 19 * TILE - PHYS.playerH);
  step(g2, 0.2);
  i2.setKey('right', true);
  step(g2, 1.5);
  check('Absperrband stays shut in Anzug', band.open === false);
  check('Absperrband is solid until opened', g2.grid[18][band.tx] === 1);
  // Direkte Rückmeldungen (z.B. Bierdeckel) stehen zuerst, danach kommt der Hinweis.
  step(g2, 5.5);
  check('Absperrband gives a hint', !!g2.hud.hint && g2.hud.hint.includes('FRACK'), `hint=${g2.hud.hint}`);
  g2.setOutfit('frack');
  step(g2, 0.3);
  check('Frack opens the Absperrband', band.open === true);
  i2.setKey('right', false);
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
  check('Fundstück wird benannt', !!game.hud.label && game.hud.label.text === 'BIERDECKEL',
    JSON.stringify(game.hud.label));
  check('Schild hat Bildschirmkoordinaten',
    game.hud.label && Number.isFinite(game.hud.label.sx) && Number.isFinite(game.hud.label.sy));
  place(game, 40, 25 * TILE - PHYS.playerH);
  game.update(1 / 60);
  check('kein Schild ohne Objekt in Reichweite', game.hud.label === null || game.hud.label.text !== 'BIERDECKEL');
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
  check('lift hints about the mappe', !!game.hud.hint && game.hud.hint.includes('NOTENMAPPE'), `hint=${game.hud.hint}`);
  game.hasMappe = true;
  game.update(1 / 60);
  check('lift accepts with the Notenmappe', game.state === 'complete');
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

  const route = [
    { wp: [10, 25] }, { wp: [14, 23] }, { wp: [19, 21] }, { wp: [14, 19] },
    { wp: [24, 17] }, { wp: [43, 17] },
    { wp: [47, 25] }, { wp: [62, 25] }, { wp: [84, 25] },
    { outfit: 'anzug' },
    { wp: [89, 23] }, { wp: [91, 21] }, { wp: [89, 19] }, { wp: [95, 19] }, { wp: [99, 19] },
    { outfit: 'frack' },
    { wp: [103, 19] }, { wp: [105, 17] }, { wp: [109, 15] }, { wp: [113, 14] }, { wp: [120, 13] }, { wp: [127, 13] },
  ];

  const failures = [];
  // Sprungsteuerung des Bots: halten (sonst wird der Sprung abgeschnitten),
  // danach zwingend ein paar Frames loslassen — sonst gibt es keine neue
  // Sprungkante und der Bot hüpft nie wieder.
  let jumpHold = 0, jumpRelease = 0;
  for (const stepItem of route) {
    if (stepItem.outfit) { game.setOutfit(stepItem.outfit); continue; }
    const [wx, row] = stepItem.wp;
    const tx = wx * TILE + 8;
    const feetY = row * TILE;
    let ok = false;
    let bestDist = Infinity;
    let noProgress = 0;
    for (let i = 0; i < 14 * 60; i++) {
      const p = game.player;
      const d = tx - (p.x + p.w / 2);
      input.setKey('right', d > 3);
      input.setKey('left', d < -3);
      const higher = feetY < p.y + p.h - 8;
      // Sprung auch über gleichhohe Lücken hinweg
      const footRow = Math.floor((p.y + p.h + 1) / TILE);
      const holeAhead = game.tileVal(Math.floor((p.x + p.w + 6) / TILE), footRow) === 0;
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
  check('Bierdeckel are collected on the way', game.deckel >= 2, `deckel=${game.deckel}`);
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

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
