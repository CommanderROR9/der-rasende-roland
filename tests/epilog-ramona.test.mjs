// tests/epilog-ramona.test.mjs — Auftrag „Epilog-Ramona" (Rolands Live-Befund
// vom 13.09. abends). Drei Zusagen an den letzten Akt (Kleingarten):
//
//   1. Das letzte Level startet im FRACK und bietet keine Kleiderauswahl mehr;
//      Frack <-> Zivil gibt es nur noch am Kleiderschrank (inkl. CUT-1b).
//   2. Ramona hat das Bier in der Hand und reicht es auf Knopfdruck herüber
//      (einmal, sichtbar: die Flasche wandert von ihrer Hand in seine).
//   3. Wenn er sich auf die Bank setzt, kommt sie dazu und sitzt neben ihm;
//      der Abschluss danach laeuft wie gehabt (Zielmechanik 'setzen').
//
// Start mit `node tests/epilog-ramona.test.mjs`.
import { buildEpilog, buildAkt1, buildAkt5 } from '../src/world.js';
import { Game } from '../src/game.js';
import { createInput } from '../src/input.js';
import { PHYS, TILE, PAL, VIEW_DESKTOP } from '../src/config.js';
import { SPRITES } from '../src/sprites.js';

const results = [];
let failed = 0;
function check(name, condition, extra = '') {
  const ok = !!condition;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ` — ${extra}`}`);
}

/** Ein Tonprotokoll: so ist der versehentliche Beton-Tritt nachweisbar. */
const AUDIO = { play() {}, engine() {}, engineOff() {}, resume() {} };
function make(level = buildEpilog(), outfit = 'frack', audio = AUDIO) {
  const input = createInput(null);
  const events = [];
  const game = new Game({
    level, input, audio, events: (e) => events.push(e),
    view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  game.reset(outfit);
  return { game, input, events };
}
function place(game, px, py) {
  const p = game.player;
  p.x = px; p.y = py; p.vx = 0; p.vy = 0; p.h = PHYS.playerH;
  game.stunTimer = 0;
  return p;
}
function step(game, seconds, dt = 1 / 60) {
  for (let i = 0, n = Math.round(seconds / dt); i < n; i++) game.update(dt);
}
/** Ein echter Tastendruck: loslassen, kurz warten, druecken, loslassen. */
function druecke(game, input, warten = 0.6) {
  input.setKey('action', false);
  step(game, warten);
  input.setKey('action', true);
  game.update(1 / 60);
  input.setKey('action', false);
  game.update(1 / 60);
}
const ramonaOf = (g) => g.entities.find((en) => en.kind === 'ramona');
/** Vor Ramona stellen (sie steht bei Kachel 66). */
function steheBeiRamona(game, abstand = 16) {
  const rom = ramonaOf(game);
  place(game, rom.x - abstand, 25 * TILE - PHYS.playerH);
  return rom;
}
/** Vor die Bank stellen — dieselbe Stelle, an der auch der Vertragstest steht. */
function steheVorDerBank(game) {
  const ziel = game.level.goal;
  place(game, ziel.x + 8, 25 * TILE - PHYS.playerH);
  return ziel;
}

// ---------------------------------------------------- 1. Welt und Ziel ------
{
  const lv = buildEpilog();
  check('Epilog: kein Kleiderstaender mehr (keine freie Kleiderauswahl)',
    lv.spawns.filter((s) => s.kind === 'stand').length === 0,
    `${lv.spawns.filter((s) => s.kind === 'stand').length} Ständer`);
  check('Epilog: das Bier steht nicht mehr auf der Bank',
    !lv.spawns.some((s) => s.item === 'bier'),
    JSON.stringify(lv.spawns.filter((s) => s.item === 'bier')));
  const romSpawn = lv.spawns.find((s) => s.kind === 'ramona');
  check('Epilog: Ramona hat das Bier (Spawn-Daten)',
    !!romSpawn && romSpawn.bier === true, JSON.stringify(romSpawn));
  check('Epilog: fuenf Bierdeckel bleiben unberuehrt', lv.deckelTotal === 5, `${lv.deckelTotal}`);
  check('Epilog: das Ziel bleibt „Hinsetzen“ an der Bank (Mechanik unveraendert)',
    lv.goal.need === 'setzen' && lv.goal.name === 'DIE BANK' && lv.goal.bench === true,
    `${lv.goal.need}/${lv.goal.name}`);

  // Andere Akte bleiben unveraendert: dort gibt es den Kleiderstaender weiter.
  check('Andere Akte: Akt 1 behaelt seine drei Kleiderstaender',
    buildAkt1().spawns.filter((s) => s.kind === 'stand').length === 3,
    `${buildAkt1().spawns.filter((s) => s.kind === 'stand').length}`);
  check('Andere Akte: Akt 5 behaelt seinen Kleiderstaender',
    buildAkt5().spawns.filter((s) => s.kind === 'stand').length === 1,
    `${buildAkt5().spawns.filter((s) => s.kind === 'stand').length}`);

  // Bierdeckel-Sammelziel unveraendert, die Bank steht weiter auf festem Boden.
  check('Epilog: die Bank bleibt, wo sie war (Boden unter den Bankkacheln)',
    lv.grid[24][76] === 1 && lv.grid[24][78] === 1);
}

// ------------------------------------------------- 2. Die Bieruebergabe -----
{
  const { game, input } = make();
  const rom = steheBeiRamona(game);
  step(game, 0.4);

  check('Bier: Ramona hat die Flasche in der Hand', rom.bier === true, String(rom.bier));
  check('Bier: vorher hat er es nicht', game.bierBeiIhm === false);

  const label = game.hud.label;
  check('Bier: in Reichweite steht das Angebot als AKTION mit E',
    !!label && /RAMONA/.test(label.text) && /BIER/.test(label.text)
      && label.action === true && label.key === 'E', JSON.stringify(label));

  druecke(game, input);
  check('Bier: die Uebergabe laeuft als sichtbarer Moment (sie reicht)',
    game.bierUebergabe > 0 && game.bierBeiIhm === false,
    `Restzeit=${game.bierUebergabe} beiIhm=${game.bierBeiIhm}`);
  check('Bier: sie hat es waehrend der Uebergabe noch',
    ramonaOf(game).bier === true, String(ramonaOf(game).bier));

  step(game, 2.0);
  check('Bier: danach hat er es',
    game.bierBeiIhm === true && ramonaOf(game).bier === false && game.bierUebergabe === 0,
    `beiIhm=${game.bierBeiIhm} beiIhr=${ramonaOf(game).bier}`);
  check('Bier: die Meldung nennt das Bier',
    /BIER/.test(String(game.hud.hint || '')), String(game.hud.hint));

  // Genau einmal: ein zweiter Druck aendert nichts.
  const vorher = { beiIhm: game.bierBeiIhm, beiIhr: ramonaOf(game).bier, y: rom.x };
  druecke(game, input);
  step(game, 1.0);
  check('Bier: eine zweite Uebergabe gibt es nicht',
    game.bierBeiIhm === true && ramonaOf(game).bier === false
      && ramonaOf(game).x === vorher.y && game.bierUebergabe === 0,
    JSON.stringify({ beiIhm: game.bierBeiIhm, beiIhr: ramonaOf(game).bier }));
}

// An Ramona ist E eine Aktion, kein Beton-Tritt.
{
  const toene = [];
  const { game, input } = make(buildEpilog(), 'frack', {
    play(n) { toene.push(n); }, engine() {}, engineOff() {}, resume() {},
  });
  steheBeiRamona(game);
  step(game, 0.4);
  druecke(game, input);
  check('Bier: an Ramona tritt er nicht (kein Beton-Tritt)',
    !toene.includes('tritt'), toene.join(',') || 'kein Ton');
}

// --------------------------------------------- 3. Ramona sitzt sich dazu ---
{
  const { game, input } = make();
  const rom = ramonaOf(game);
  const romStart = rom.x;
  steheVorDerBank(game);
  step(game, 0.4);

  check('Sitzen: vor der Bank steht das Angebot zum Hinsetzen',
    !!game.hud.label && /HINSETZEN/.test(game.hud.label.text), JSON.stringify(game.hud.label));

  druecke(game, input);
  check('Sitzen: er nimmt Platz (Zielmechanik „setzen“ unveraendert)',
    game.setzen === true, String(game.setzen));
  check('Sitzen: der Abschluss kommt nicht sofort — sie kommt erst dazu',
    game.state === 'play', `${game.state}`);
  check('Sitzen: die Sitzszene laeuft', !!game.sitz, JSON.stringify(game.sitz));
  check('Sitzen: die Bankplaetze stehen fest (zwei Plaetze auf dem Bank-Sprite)',
    !!game.bankSitz && Number.isFinite(game.bankSitz.pSeatX) && Number.isFinite(game.bankSitz.rSeatX)
      && game.bankSitz.rSeatX > game.bankSitz.pSeatX,
    JSON.stringify(game.bankSitz));

  // Er rutscht auf seinen Platz — und zwar wirklich auf die Bankflaeche.
  const bank = game.bankSitz || {};
  const sitzBreite = (SPRITES.roland_sitz || [['']])[0].length;
  check('Sitzen: sein Platz liegt auf der Bank',
    Number.isFinite(bank.pSeatX) && bank.pSeatX >= bank.x
      && bank.pSeatX + sitzBreite <= bank.x + (bank.breite || 0) + 2,
    `Platz ${bank.pSeatX} auf Bank ${bank.x}..${(bank.x || 0) + (bank.breite || 0)}`);
  step(game, 0.6);
  check('Sitzen: er sitzt auf seinem Platz',
    Math.abs(game.player.x - bank.pSeatX) <= 1, `${game.player.x} vs ${bank.pSeatX}`);
  check('Sitzen: sie ist losgegangen (nicht mehr an ihrem Platz)',
    rom.x > romStart, `${romStart} -> ${rom.x}`);
  check('Sitzen: sie geht noch (noch nicht da)', rom.sitzend !== true);

  step(game, 2.0);
  check('Sitzen: sie kommt an und sitzt',
    rom.sitzend === true && Math.abs(rom.x - bank.rSeatX) <= 1,
    `sitzend=${rom.sitzend} x=${rom.x} soll=${bank.rSeatX}`);
  check('Sitzen: sie sitzt rechts von ihm (neben ihm)',
    rom.x > game.player.x, `${game.player.x} | ${rom.x}`);

  step(game, 1.2);
  check('Sitzen: danach laeuft der Abschluss wie gehabt',
    game.state === 'complete' && !!game.rows, `${game.state}`);
  check('Sitzen: die Sitzszene ist beendet (kein Dauerzustand)',
    !game.sitz && game.bankSitz !== null);
  check('Sitzen: das Bier kommt im Ergebnis nicht doppelt',
    game.entities.filter((en) => en.item === 'bier').length === 1,
    `${game.entities.filter((en) => en.item === 'bier').length}`);
  check('Sitzen: Platz genommen heisst jetzt sichtbar sitzen',
    game.setzen === true && game.hud.setzen === true);
}

// Kein Softlock: fehlt Ramona, laeuft der Abschluss trotzdem.
{
  const { game, input } = make();
  game.entities = game.entities.filter((en) => en.kind !== 'ramona');
  steheVorDerBank(game);
  step(game, 0.3);
  druecke(game, input);
  check('Sitzen: ohne Ramona beginnt die Szene trotzdem', game.setzen === true);
  step(game, 6);
  check('Sitzen: ohne Ramona endet der Epilog (kein Softlock)',
    game.state === 'complete', game.state);
}

// Die sitzenden Haltungen: vorhandene Zeichner, nur Palettenbuchstaben.
{
  // Fehlende Matrizen duerfen den Lauf nicht abstuerzen lassen: der rote Lauf
  // soll FAILs zeigen, keinen Stacktrace.
  const roland = SPRITES.roland_sitz || [['']];
  const romana = SPRITES.ramona_sitz || [['']];
  check('Sitzen: es gibt sitzende Haltungen fuer ihn und fuer sie',
    !!SPRITES.roland_sitz && !!SPRITES.ramona_sitz
      && SPRITES.roland_sitz.length > 8 && SPRITES.ramona_sitz.length > 8,
    `${SPRITES.roland_sitz ? SPRITES.roland_sitz.length : 'fehlt'} / ${SPRITES.ramona_sitz ? SPRITES.ramona_sitz.length : 'fehlt'}`);
  check('Sitzen: seine Haltung ist so breit wie das Standbild',
    !!SPRITES.roland_sitz && roland.every((zeile) => zeile.length === SPRITES.roland_idle[0].length),
    `${roland[0].length} vs ${SPRITES.roland_idle[0].length}`);
  check('Sitzen: ihre Haltung ist so breit wie ihr Standbild',
    !!SPRITES.ramona_sitz && romana.every((zeile) => zeile.length === SPRITES.ramona[0].length),
    `${romana[0].length} vs ${SPRITES.ramona[0].length}`);
  check('Sitzen: sitzend ist nicht hoeher als stehend',
    !!SPRITES.roland_sitz && !!SPRITES.ramona_sitz
      && roland.length <= SPRITES.roland_idle.length && romana.length <= SPRITES.ramona.length,
    `${roland.length} vs ${SPRITES.roland_idle.length}, ${romana.length} vs ${SPRITES.ramona.length}`);
  const buchstaben = [...roland, ...romana].flatMap((zeile) => [...zeile]);
  check('Sitzen: nur Palettenbuchstaben (keine neuen Farben, kein Asset)',
    buchstaben.every((ch) => ch === ' ' || Object.prototype.hasOwnProperty.call(PAL, ch)),
    [...new Set(buchstaben.filter((ch) => ch !== ' ' && !(ch in PAL)))].join(''));
  check('Sitzen: die Beine sind angewinkelt gezeichnet (flacher als der Stand)',
    !!SPRITES.roland_sitz && !!SPRITES.ramona_sitz
      && roland.slice(-4).some((zeile) => /^ {2,}/.test(zeile))
      && romana.slice(-4).some((zeile) => /^ {2,}/.test(zeile)));
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Epilog-Ramona-Checks bestanden`);
process.exit(failed ? 1 : 0);
