// tests/zivil-garten.test.mjs — DRR-F4: „Zivil" gehoert in den Kleingarten.
//
// Zwei Befunde aus Rolands Playtest (13.09.2026):
//   A) Vor dem Kleingarten stand „Zivil" als vierte Kluft in der Kleiderwahl —
//      dort ergibt sie keinen Sinn. Die Option haengt jetzt am Kleiderschrank
//      des Gartens (config.js: `nurGarten`), und kein Nebenweg (Konsole,
//      Spielstand, Testhilfe) kommt daran vorbei.
//   B) „Shorts + Hawaii-Hemd" war nur ein umgefaerbter Anzug (gruenes Sakko,
//      lange Hose). Jetzt gibt es einen eigenen Koerper: kurze Aermel, kurze
//      Hose, nackte Beine, Hemdknopfleiste, Bluten und Blaetter als wenige
//      Farbflaechen — alles in der Spielpalette.
//
// Der Bildbeweis (die Figur im Browser) kommt aus tests/browser-smoke.mjs.
// Start mit `node tests/zivil-garten.test.mjs`.
import { buildAkt1, buildAkt2, buildEpilog } from '../src/world.js';
import { Game } from '../src/game.js';
import { createInput } from '../src/input.js';
import {
  VIEW_DESKTOP, OUTFITS, PAL, outfitErlaubt, outfitWahl, hatKleiderschrank,
} from '../src/config.js';
import { ZIVIL_FRAMES, SPRITES, OUTFIT_PALETTES, ROLAND_FRAMES, kluftBild } from '../src/sprites.js';
import { CUTSCENE_SPRITES } from '../src/cutscene-frack.js';

const results = [];
let failed = 0;
function check(name, condition, extra = '') {
  const ok = !!condition;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ` — ${extra}`}`);
}

const AUDIO = { play() {}, engine() {}, engineOff() {}, resume() {} };
function make(level, outfit = 'schwarz') {
  const input = createInput(null);
  const events = [];
  const game = new Game({
    level, input, audio: AUDIO, events: (e) => events.push(e), view: VIEW_DESKTOP,
  });
  game.reset(outfit);
  return { game, input, events };
}
function druecke(game, input) {
  input.setKey('action', false);
  for (let i = 0; i < 40; i++) game.update(1 / 60);
  input.setKey('action', true);
  game.update(1 / 60);
  input.setKey('action', false);
  game.update(1 / 60);
  for (let i = 0; i < 600 && game.szene; i++) game.update(1 / 60);   // Szene (CUT-1) ablaufen
}
function anDenSchrank(game) {
  const en = game.entities.find((e) => e.kind === 'garderobe');
  game.player.x = en.x - 18;
  game.player.y = en.y + en.h - game.player.h;
  game.player.vx = 0; game.player.vy = 0;
  return en;
}

// ------------------------------------------------ A) Die Kluft nur im Garten --
{
  const akt1 = buildAkt1();
  const akt2 = buildAkt2();
  const epilog = buildEpilog();

  check('Der Kleiderschrank steht nur im Kleingarten',
    hatKleiderschrank(epilog) === true && hatKleiderschrank(akt1) === false
      && hatKleiderschrank(akt2) === false);
  check('Zivil ist als Garten-Kluft gekennzeichnet', OUTFITS.zivil.nurGarten === true);

  for (const [name, level] of [['Akt 1', akt1], ['Akt 2', akt2]]) {
    const wahl = outfitWahl(level).map((o) => o.id);
    check(`${name}: die Kleiderwahl kennt Zivil nicht`,
      wahl.length === 3 && !wahl.includes('zivil')
        && ['schwarz', 'anzug', 'frack'].every((id) => wahl.includes(id)),
      wahl.join(','));
    check(`${name}: outfitErlaubt lehnt Zivil ab`, outfitErlaubt('zivil', level) === false);
  }
  const wahlGarten = outfitWahl(epilog).map((o) => o.id);
  check('Im Kleingarten steht Zivil weiterhin zur Wahl',
    wahlGarten.includes('zivil') && wahlGarten.length === 4, wahlGarten.join(','));
  check('Die drei anderen Kluefte sind ueberall erlaubt',
    ['schwarz', 'anzug', 'frack'].every((id) => outfitErlaubt(id, akt1) && outfitErlaubt(id, epilog)));

  // Kein Nebenweg: Konsole/Testhilfe (setOutfit) und Spielstand (reset).
  const { game } = make(akt1, 'frack');
  const vorher = game.outfit.id;
  const ok = game.setOutfit('zivil');
  check('Vor dem Garten bleibt setOutfit("zivil") wirkungslos',
    ok === false && game.outfit.id === vorher,
    `${vorher} -> ${game.outfit.id} (setOutfit meldet ${ok})`);
  game.update(1 / 60);                    // die Meldung steht erst im naechsten HUD-Frame
  check('Die Absage nennt den Ort', /KLEINGARTEN/.test(String(game.hud.hint)), String(game.hud.hint));
  game.reset('zivil');
  check('Ein Spielstand mit Zivil faellt vor dem Garten auf Schwarz zurueck',
    game.outfit.id === 'schwarz', game.outfit.id);
  game.reset('anzug');
  check('Andere Kluefte bleiben unberuehrt', game.outfit.id === 'anzug', game.outfit.id);

  // Im Garten traegt der Kleiderschrank weiter — mit Szene (CUT-1).
  const garten = make(epilog, 'frack');
  anDenSchrank(garten.game);
  druecke(garten.game, garten.input);
  check('Im Garten zieht der Kleiderschrank Zivil an',
    garten.game.outfit.id === 'zivil' && garten.game.storyFlags.has('zivil_an') === true,
    garten.game.outfit.id);
  const direkt = make(epilog, 'frack');
  check('Im Garten nimmt auch der direkte Weg Zivil an',
    direkt.game.setOutfit('zivil') === true && direkt.game.outfit.id === 'zivil');
  const gespeichert = make(epilog, 'zivil');
  check('Im Garten haelt ein Spielstand mit Zivil', gespeichert.game.outfit.id === 'zivil');
}

// ------------------------------------------- B) Der Zivilsprite (neu gezeichnet)
{
  const pal = OUTFIT_PALETTES.zivil;
  const farbe = (c) => pal[c] ?? PAL[c] ?? null;
  const frames = ['idle', 'walk1', 'walk2', 'jump', 'duck'];

  check('Zivil hat eigene Koerperbilder (kein umgefaerbter Anzug)',
    frames.every((f) => ZIVIL_FRAMES[f].join('|') !== ROLAND_FRAMES[f].join('|')));
  check('Alle Zivilbilder sind 16 breit und gleich hoch wie der Anzug',
    frames.every((f) => ZIVIL_FRAMES[f].length === ROLAND_FRAMES[f].length
      && ZIVIL_FRAMES[f].every((r) => r.length === 16)),
    frames.map((f) => `${f}:${ZIVIL_FRAMES[f].length}`).join(' '));
  check('Auch die Sitzhaltung ist ein eigenes Zivilbild',
    SPRITES.zivil_sitz.join('|') !== SPRITES.roland_sitz.join('|'));
  check('Jede Zivilmatrix ist ueber die Palette aufloesbar',
    [...frames.map((f) => ZIVIL_FRAMES[f]), SPRITES.zivil_sitz, CUTSCENE_SPRITES.cut_figur_umzieh]
      .every((rows) => rows.every((r) => [...r].every((c) => c === ' ' || farbe(c) !== null))));

  // Die Farben bleiben in der Spielpalette (oder sind die dokumentierte
  // Zusatzfarbe des Zivilhemds aus E1).
  const erlaubteFarben = new Set([...Object.values(PAL).filter((v) => typeof v === 'string' && v.startsWith('#')), '#2fbfae']);
  const fremde = Object.values(pal).filter((v) => !erlaubteFarben.has(v));
  check('Die Zivilfarben stammen aus PAL oder sind die dokumentierte Zusatzfarbe',
    fremde.length === 0, fremde.join(','));

  const idle = ZIVIL_FRAMES.idle;
  const zaehle = (b) => idle.join('').split(b).length - 1;
  // Kurze Aermel: oben das Hemd, darunter die Haut.
  check('Kurze Aermel: der Arm steckt oben im Hemd',
    idle.slice(11, 14).every((r) => r.slice(1, 5) === 'wwww'), 'Zeilen 11-13, Spalten 1-4');
  check('Kurze Aermel: darunter ist der Arm nackt',
    idle.slice(14, 18).every((r) => /^s+$/.test(r.slice(1, 5))), 'Zeilen 14-17, Spalten 1-4');
  // Kurze Hose: Shorts am Ruecken, darunter nackte Beine.
  check('Kurze Hose: die Shorts sitzen auf der Huefte',
    idle.slice(18, 20).every((r) => r.includes('a') && !r.includes('s')));
  check('Kurze Hose: die Beine sind darunter sichtbar (Haut)',
    idle.slice(20, 23).every((r) => r.includes('s') && !r.includes('a')));
  check('Keine lange Anzughose im Zivilbild',
    !idle.slice(20, 23).join('').includes('a'), idle.slice(20, 23).join(' / '));
  // Hemdknopfleiste und Muster in wenigen, klar lesbaren Farbflaechen.
  check('Hemdknopfleiste laeuft senkrecht ueber den Rumpf',
    [11, 12, 13, 14, 15, 16, 17].every((r) => idle[r][7] === 'H' || idle[r][7] === 'b'));
  check('Hawaii-Muster in drei Farben (Bluete, Bluetenmitte, Blatt)',
    zaehle('o') >= 2 && zaehle('y') >= 2 && zaehle('Y') >= 1 && zaehle('E') >= 2,
    `o=${zaehle('o')} y=${zaehle('y')} Y=${zaehle('Y')} E=${zaehle('E')}`);
  check('Keine Krawatte und keine Fliege am Zivilhemd', zaehle('r') === 0);
  check('Die Hemdfarbe bleibt die dokumentierte Zivilfarbe (#2fbfae)',
    pal.w === '#2fbfae', String(pal.w));
  check('Die Shorts sind nicht mehr das Sakkogruen', pal.a !== '#4a5a3a', String(pal.a));

  // Keine deckenden Kanten (kein schwarzer Kasten um die Figur).
  const kanten = [idle[0], idle[idle.length - 1], idle.map((r) => r[0]).join(''), idle.map((r) => r[15]).join('')];
  check('Keine deckende Kante am Zivilbild (kein schwarzer Kasten)',
    kanten.every((text) => [...text].filter((c) => c !== ' ').length < text.length),
    kanten.map((t) => `${[...t].filter((c) => c !== ' ').length}/${t.length}`).join(' '));

  // Der Sprite-Cache: gleicher Name, anderer Koerper.
  check('kluftBild tauscht nur den Zivilkoerper aus',
    kluftBild('roland_idle', 'zivil') === 'zivil_idle'
      && kluftBild('roland_walk1', 'zivil') === 'zivil_walk1'
      && kluftBild('roland_sitz', 'zivil') === 'zivil_sitz'
      && kluftBild('roland_idle', 'frack') === 'roland_idle'
      && kluftBild('cut_figur_umzieh', 'zivil') === 'cut_figur_umzieh');
  check('Jedes Zivilbild ist im Spritevorrat registriert',
    ['zivil_idle', 'zivil_walk1', 'zivil_walk2', 'zivil_jump', 'zivil_duck', 'zivil_sitz']
      .every((n) => Array.isArray(SPRITES[n]) && SPRITES[n].length > 0));

  // Die Szene am Schrank zeigt dasselbe Hemd wie die getragene Kluft.
  const hemd = CUTSCENE_SPRITES.cut_zivil_hemd;
  const pose = CUTSCENE_SPRITES.cut_figur_umzieh;
  check('Das Hemd in der Hand traegt dasselbe Muster wie das getragene Hemd',
    hemd.join('').includes('o') && hemd.join('').includes('E') && hemd.join('').includes('H')
      && !hemd.join('').includes('r'));
  check('Die halb angezogene Pose zeigt Hemd, Shorts und nackte Beine',
    pose.slice(0, 12).join('').includes('w') && pose.slice(12, 20).join('').includes('a')
      && pose.slice(20, 23).every((r) => r.includes('s') && !r.includes('a'))
      && !pose.slice(0, 12).join('').includes('r'),
    `Hemd oben, Shorts ab Zeile 12, Beine 20-22`);
}

console.log(results.join('\n'));
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} Zivil-Tests bestanden`);
process.exit(failed ? 1 : 0);
