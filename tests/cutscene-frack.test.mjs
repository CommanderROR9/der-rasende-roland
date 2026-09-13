// tests/cutscene-frack.test.mjs — Auftrag CUT-1: die Schlussszene im Kleingarten.
//
// Prueft den Ausloeser (die Aktion „ZIVIL ANZIEHEN" am Kleiderschrank), den
// Ablauf der Szene, ihr Ende im Normalzustand, den Merker im Spielstand (die
// Szene laeuft genau einmal) und dass der Abschluss des Epilogs danach weiter
// erreichbar ist. Der Bildbeweis — die Szene im Bild — kommt aus dem
// Browserlauf tests/browser-smoke.mjs; eine Palette allein beweist kein Bild.
//
// Start mit `node tests/cutscene-frack.test.mjs`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEpilog, buildAkt2 } from '../src/world.js';
import { Game } from '../src/game.js';
import { createInput } from '../src/input.js';
import { PHYS, TILE, VIEW_DESKTOP, PAL } from '../src/config.js';
import { SPRITES } from '../src/sprites.js';
import {
  CUT_MERKER, SZENE_BEATS, SZENE_DAUER, CUTSCENE_SPRITES,
  beatBei, szeneMoeglich, zeichenInPalette,
} from '../src/cutscene-frack.js';

const WURZEL = fileURLToPath(new URL('..', import.meta.url));
const QUELLE = readFileSync(join(WURZEL, 'src/cutscene-frack.js'), 'utf8');
const MAIN = readFileSync(join(WURZEL, 'src/main.js'), 'utf8');

const results = [];
let failed = 0;
function check(name, condition, extra = '') {
  const ok = !!condition;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ` — ${extra}`}`);
}

const AUDIO = { play() {}, engine() {}, engineOff() {}, resume() {} };
function make(level, outfit = 'frack', difficulty = 'gemuetlich', gesehen = false) {
  const input = createInput(null);
  const events = [];
  const game = new Game({
    level, input, audio: AUDIO, events: (e) => events.push(e),
    view: VIEW_DESKTOP, difficulty,
  });
  game.reset(outfit);
  game.cutsceneGesehen = gesehen;      // so setzt main.js den Merker aus dem Spielstand
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
/** Die Szene bis zum Ende laufen lassen; @returns die gebrauchte Zeit. */
function durch(game, maxSekunden = 12) {
  const dt = 1 / 60;
  let t = 0;
  while (game.szene && t < maxSekunden) { game.update(dt); t += dt; }
  return t;
}
const garderobeOf = (g) => g.entities.find((en) => en.kind === 'garderobe');
const schrankOf = (g) => g.entities.find((en) => en.kind === 'schrank');
/** Die Figur vor den Kleiderschrank stellen (wie im Browserlauf). */
function vorDenSchrank(game) {
  const g = garderobeOf(game);
  place(game, g.x + g.w / 2 - 6, 25 * TILE - PHYS.playerH);
  step(game, 0.4);
  return g;
}

// ------------------------------------------------------------ Das Modul -----
{
  check('Szene: die Dauer liegt in Rolands Rahmen (3 bis 5 Sekunden)',
    SZENE_DAUER >= 3 && SZENE_DAUER <= 5, `${SZENE_DAUER}s`);
  const bis = SZENE_BEATS.map((b) => b.bis);
  check('Szene: die Abschnitte wachsen und decken die Dauer ab',
    bis.every((v, i) => v > (bis[i - 1] || 0)) && bis[bis.length - 1] === SZENE_DAUER,
    JSON.stringify(SZENE_BEATS));
  check('Szene: die Abschnitte kommen in der richtigen Reihenfolge',
    beatBei(0) === 'gehen' && beatBei(2.0) === 'frack' && beatBei(3.0) === 'geige'
      && beatBei(3.6) === 'schliessen' && beatBei(4.2) === 'zurueck' && beatBei(99) === 'zurueck',
    [0, 2.0, 3.0, 3.6, 4.2, 99].map((t) => beatBei(t)).join(','));

  const namen = Object.keys(CUTSCENE_SPRITES);
  check('Szene: jedes neue Bild benutzt nur Farben der Palette (nichts bleibt unsichtbar)',
    namen.length >= 4 && namen.every((n) => zeichenInPalette(CUTSCENE_SPRITES[n])),
    namen.join(','));
  check('Szene: die Palette kennt wirklich jede benutzte Farbe',
    ['L', 'M', 'd', 'g', 'G', 'a', 'w', 'y', 'K', '.'].every((c) => PAL[c]),
    Object.keys(PAL).join(''));

  const offen = CUTSCENE_SPRITES.cut_schrank_offen;
  const zu = SPRITES.kleiderschrank;
  check('Szene: der offene Schrank hat die Maße des geschlossenen (kein Sprung im Bild)',
    offen.length === zu.length && Math.max(...offen.map((r) => r.length)) === Math.max(...zu.map((r) => r.length)),
    `${offen.length}x${Math.max(...offen.map((r) => r.length))} zu ${zu.length}x${Math.max(...zu.map((r) => r.length))}`);

  check('Szene: keine fremden Bilder, keine Schrift, kein Zufall',
    !/https?:|data:|fetch\(|@font-face|Math\.random/.test(QUELLE));
  check('Szene: das Modul zeichnet nichts, bevor es gezeichnet wird (kein DOM beim Import)',
    !/document\.|window\./.test(QUELLE));

  check('Szene: der Kleingarten kann die Szene zeigen',
    szeneMoeglich(buildEpilog()) === true);
  check('Szene: ohne Level (oder ohne Schrank) gibt es keinen Ort fuer die Szene',
    szeneMoeglich(null) === false && szeneMoeglich(buildAkt2()) === false
      && szeneMoeglich({ spawns: [], grid: [] }) === false);
}

// ---------------------------------------------------------- Der Auslöser ----
{
  const { game, input, events } = make(buildEpilog(), 'frack');
  const g = vorDenSchrank(game, 'frack');
  check('Auslöser: im Frack steht am Kleiderschrank das Angebot Zivil',
    !!game.hud.label && /ZIVIL/.test(game.hud.label.text), JSON.stringify(game.hud.label));

  const zeitVorher = game.time;
  druecke(game, input);
  check('Auslöser: die Aktion startet die Szene',
    !!game.szene && game.szene.beat === 'gehen', game.szene ? game.szene.beat : 'keine Szene');
  check('Auslöser: die Szene beginnt dort, wo die Figur steht',
    !!game.szene && Math.abs(game.szene.startX - (g.x + g.w / 2 - 6)) < 1.5,
    game.szene ? `${game.szene.startX} zu ${g.x + g.w / 2 - 6}` : 'keine Szene');
  check('Auslöser: der Outfitwechsel kommt erst nach der Szene',
    game.outfit.id === 'frack', game.outfit.id);
  check('Auslöser: die Szene meldet sich als Ereignis (daran haengt der Merker)',
    events.some((e) => e.type === 'cutscene'), JSON.stringify(events));
  check('Auslöser: die Szene ist wortlos (kein Interaktionspunkt, keine Meldung)',
    game.hud.label === null && game.hud.hint === null,
    JSON.stringify([game.hud.label, game.hud.hint]));

  const zeitImBild = game.time;
  step(game, 1.0);
  check('Auslöser: die Welt steht fuer die Dauer der Szene still',
    game.time === zeitImBild, `Zeit ${zeitImBild} -> ${game.time}`);

  // Sie laeuft bis zum Ende und uebergibt im Normalzustand.
  const gebraucht = durch(game);
  check('Szene: nach der Dauer ist die Szene vorbei',
    game.szene === null && gebraucht > SZENE_DAUER - 1.2 && gebraucht < SZENE_DAUER + 0.2,
    `${gebraucht.toFixed(2)}s bei ${SZENE_DAUER}s`);
  check('Szene: der Wechsel ist danach ausgefuehrt',
    game.outfit.id === 'zivil' && game.storyFlags.has('zivil_an') === true,
    `${game.outfit.id} / ${JSON.stringify([...game.storyFlags])}`);
  check('Szene: die Meldung nennt Shorts und Hawaii-Hemd',
    !!game.hud.hint && /HAWAII/.test(game.hud.hint), String(game.hud.hint));
  check('Szene: die Figur tritt zurueck und sieht den Schrank an',
    Math.abs(game.player.x - (g.x - 24)) < 1.5 && game.player.dir === 1
      && game.player.x < g.x + g.w,
    `x=${game.player.x.toFixed(1)} zu ${g.x - 24}, dir=${game.player.dir}`);
  check('Szene: danach ist der Normalzustand wieder da',
    game.state === 'play' && !!game.hud.label && /KLEIDERSCHRANK/.test(game.hud.label.text),
    `${game.state} / ${JSON.stringify(game.hud.label)}`);
  step(game, 0.5);
  check('Szene: die Spielzeit laeuft nach der Szene weiter',
    game.time > zeitVorher, `${zeitVorher} -> ${game.time}`);
  check('Szene: danach bietet der Schrank wieder den Frack an',
    /FRACK/.test(game.hud.label.text), JSON.stringify(game.hud.label));
}

// ------------------------------------ Der Weg zum Schrank und die Abschnitte --
{
  const { game, input } = make(buildEpilog(), 'frack');
  const g = vorDenSchrank(game);
  druecke(game, input);
  const szene = game.szene;
  check('Weg: die Szene kennt ihren Platz vor dem Schrank',
    !!szene && szene.frontX === g.x - 6 && szene.endX === g.x - 24,
    szene ? `${szene.frontX} / ${szene.endX}` : 'keine Szene');

  const x0 = game.player.x;
  step(game, 0.4);                    // noch im Abschnitt „gehen"
  const xMitte = game.player.x;
  check('Weg: die Figur geht zum Schrank, statt zu springen',
    szene.beat === 'gehen' && xMitte < x0 && xMitte > szene.frontX,
    `x ${x0.toFixed(1)} -> ${xMitte.toFixed(1)} -> ${szene.frontX}`);
  step(game, 0.45);                   // der Weg ist zu Ende
  check('Weg: am Schrank angekommen steht sie vor den Tueren',
    Math.abs(game.player.x - szene.frontX) < 0.5 && szene.beat === 'oeffnen',
    `x=${game.player.x.toFixed(2)} zu ${szene.frontX}, ${szene.beat}`);
}

// ---------------------------------------------- Die Abschnitte der Szene -----
{
  const { game, input } = make(buildEpilog(), 'frack');
  vorDenSchrank(game);
  druecke(game, input);
  // Die Abschnitte laufen genau einmal und in der Reihenfolge.
  const folge = [];
  const dt = 1 / 60;
  for (let i = 0; i < Math.round((SZENE_DAUER + 0.2) / dt); i++) {
    if (game.szene && folge[folge.length - 1] !== game.szene.beat) folge.push(game.szene.beat);
    if (!game.szene) break;
    game.update(dt);
  }
  check('Szene: die Abschnitte laufen genau einmal und in der Reihenfolge',
    folge.join(',') === SZENE_BEATS.map((b) => b.name).join(','), folge.join(','));
}

// ------------------------------------------------------ Der Merker ----------
{
  const { game, input, events } = make(buildEpilog(), 'frack', 'gemuetlich', true);
  const g = vorDenSchrank(game, 'frack');
  druecke(game, input);
  check('Merker: ist er gesetzt, laeuft die Szene nicht',
    game.szene === null && game.outfit.id === 'zivil', `${game.outfit.id}`);
  check('Merker: kein zweites Ereignis, kein zweiter Merker',
    !events.some((e) => e.type === 'cutscene'));
  const kluften = [game.outfit.id];
  for (let i = 0; i < 3; i++) { druecke(game, input); kluften.push(game.outfit.id); }
  check('Merker: danach zieht der Schrank sofort um (viermal hin und her)',
    kluften.join(',') === 'zivil,frack,zivil,frack' && game.szene === null,
    kluften.join(','));

  const lauf2 = make(buildEpilog(), 'frack', 'gemuetlich', true);
  vorDenSchrank(lauf2.game);
  druecke(lauf2.game, lauf2.input);
  check('Merker: auch ein zweiter Durchgang zeigt die Szene nicht',
    lauf2.game.szene === null && lauf2.game.outfit.id === 'zivil', lauf2.game.outfit.id);

  check('Merker: main.js liest und schreibt den Schluessel im Spielstand',
    MAIN.includes(`CUT_MERKER`) && /writeSave\(\{ \[CUT_MERKER\]: true \}\)/.test(MAIN)
      && /loadSave\(\)\[CUT_MERKER\] === true/.test(MAIN),
    CUT_MERKER);
  check('Merker: der Schluessel ist eigenstaendig (kein vorhandener ueberschrieben)',
    CUT_MERKER === 'cutFrackGeige'
      && !['mappe', 'station', 'geschafft', 'difficulty', 'sound', 'musik'].includes(CUT_MERKER));
}

// ------------------------------------------------ Der Abschluss bleibt ------
{
  const { game, input } = make(buildEpilog(), 'frack');
  vorDenSchrank(game);
  druecke(game, input);
  check('Abschluss: die Szene selbst ist kein Abschluss',
    game.szene !== null && game.state === 'play', game.state);
  durch(game);
  const ziel = game.level.goal;
  place(game, ziel.x + 8, 25 * TILE - PHYS.playerH);
  step(game, 0.4);
  input.setKey('action', true);
  game.update(1 / 60);
  input.setKey('action', false);
  game.update(1 / 60);
  check('Abschluss: nach der Szene endet der Epilog auf der Bank',
    game.state === 'complete' && !!game.rows, `${game.state} / ${JSON.stringify(game.rows)}`);
}

// ------------------------------------------------------------- Grenzen ------
{
  // Der Schrank der Laube (dort haengt der Frack) loest keine Szene aus.
  const { game, input } = make(buildEpilog(), 'frack');
  const s = schrankOf(game);
  place(game, s.x + 8, 25 * TILE - PHYS.playerH);
  step(game, 0.4);
  druecke(game, input);
  check('Grenzen: am Schrank der Laube startet keine Szene',
    game.szene === null && game.frackAbgelegt === true, `${game.szene} / ${game.frackAbgelegt}`);

  // Im Zivil (Rueckweg zum Frack) startet keine Szene.
  const zurueck = make(buildEpilog(), 'zivil');
  vorDenSchrank(zurueck.game);
  druecke(zurueck.game, zurueck.input);
  check('Grenzen: der Rueckweg auf den Frack zeigt keine Szene',
    zurueck.game.szene === null && zurueck.game.outfit.id === 'frack', zurueck.game.outfit.id);

  // Ohne Kleiderschrank in der Welt passiert nichts — kein Absturz, kein Wechsel.
  const ohne = make(buildEpilog(), 'frack');
  ohne.game.entities = ohne.game.entities.filter((en) => en.kind !== 'garderobe');
  const gestartet = ohne.game.cutsceneStarten();
  check('Grenzen: ohne Kleiderschrank wird nichts gestartet und nichts geworfen',
    gestartet === false && ohne.game.szene === null && ohne.game.cutsceneGesehen === false);

  // Ein gehaltener Knopf schaltet die Szene nicht zweimal: der Wechsel haengt
  // am Druck, nicht am Kontakt.
  const halten = make(buildEpilog(), 'frack');
  vorDenSchrank(halten.game);
  halten.input.setKey('action', true);
  step(halten.game, 0.6);
  halten.input.setKey('action', false);
  check('Grenzen: ein gehaltener Knopf startet die Szene genau einmal',
    !!halten.game.szene, halten.game.szene ? halten.game.szene.beat : 'keine Szene');
  durch(halten.game);
  halten.input.setKey('action', true);
  step(halten.game, 2.0);
  halten.input.setKey('action', false);
  check('Grenzen: aus dem gehaltenen Knopf wird kein zweiter Lauf',
    halten.game.szene === null && halten.game.outfit.id === 'zivil',
    `${halten.game.outfit.id} / ${halten.game.szene}`);
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Cutscene-Checks bestanden`);
process.exit(failed ? 1 : 0);
