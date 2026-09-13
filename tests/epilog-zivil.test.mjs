// tests/epilog-zivil.test.mjs — Auftrag E1b: der Kleiderschrank im Kleingarten.
//
// Prueft den Interaktionspunkt selbst (Existenz, Beschriftung, Aktionstaste),
// die Umkehrbarkeit des Wechsels, die Flags, die Nachteilsfreiheit von Zivil
// und dass der Abschluss des Epilogs unabhaengig von der Kluft funktioniert.
// Der Bildbeweis (der Wechsel ist am Avatar zu sehen) kommt aus dem Browserlauf
// tests/browser-smoke.mjs — eine Palette allein beweist kein Bild.
//
// Start mit `node tests/epilog-zivil.test.mjs`.
import { buildEpilog, buildAkt2 } from '../src/world.js';
import { Game } from '../src/game.js';
import { createInput } from '../src/input.js';
import { PHYS, TILE, OUTFITS, VIEW_DESKTOP } from '../src/config.js';
import { SPRITES, OUTFIT_PALETTES } from '../src/sprites.js';

const results = [];
let failed = 0;
function check(name, condition, extra = '') {
  const ok = !!condition;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ` — ${extra}`}`);
}

const AUDIO = { play() {}, engine() {}, engineOff() {}, resume() {} };
function make(level, outfit = 'schwarz', difficulty = 'gemuetlich') {
  const input = createInput(null);
  const events = [];
  const game = new Game({
    level, input, audio: AUDIO, events: (e) => events.push(e),
    view: VIEW_DESKTOP, difficulty,
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
  // Seit CUT-1 haengt am ersten Umziehen auf Zivil die Schlussszene: sie laeuft
  // hier mit ab, sonst stuende jede Pruefung auf halbem Weg. Ohne Szene (jeder
  // weitere Druck) passiert hier nichts.
  durch(game);
}
/** Die Schlussszene (CUT-1) bis zum Ende laufen lassen; @returns die Zeit. */
function durch(game, maxSekunden = 12) {
  const dt = 1 / 60;
  let t = 0;
  while (game.szene && t < maxSekunden) { game.update(dt); t += dt; }
  return t;
}
const garderobeOf = (g) => g.entities.find((en) => en.kind === 'garderobe');
const schrankOf = (g) => g.entities.find((en) => en.kind === 'schrank');

// ------------------------------------------------------------- Der Schrank --
{
  const level = buildEpilog();
  const daten = level.spawns.filter((s) => s.kind === 'garderobe');
  check('Epilog: genau ein Kleiderschrank steht im Kleingarten', daten.length === 1, `${daten.length}`);
  const sp = daten[0];
  check('Epilog: der Kleiderschrank steht auf festem Boden',
    !!sp && level.grid[sp.walkRow + 1][sp.tx] === 1, sp ? `tx=${sp.tx} row=${sp.walkRow}` : 'fehlt');

  // Er ist nicht der Schrank der Laube: anderer Punkt, anderes Sprite.
  const { game } = make(level);
  const g = garderobeOf(game);
  const s = schrankOf(game);
  check('Epilog: Kleiderschrank und Laubenschrank sind zwei Punkte',
    !!g && !!s && g.x !== s.x && Math.abs(g.x - s.x) > 32,
    g && s ? `Kleiderschrank ${g.x}, Laube ${s.x}` : 'fehlt');
  const matrix = SPRITES.kleiderschrank;
  check('Epilog: der Kleiderschrank hat ein eigenes Sprite',
    Array.isArray(matrix) && matrix.length === g.h &&
    matrix.every((row) => row.length === g.w) &&
    JSON.stringify(matrix) !== JSON.stringify(SPRITES.schrank),
    matrix ? `${g.w}x${g.h}, Sprite ${matrix.length} Zeilen` : 'kein Sprite');
  check('Epilog: das Sprite zeigt das Hawaii-Hemd (Tuer-Spalt)',
    matrix.some((row) => row.includes('c')) && matrix.some((row) => row.includes('o')));
}

// ------------------------------------------- Beschriftung und Aktionstaste --
{
  const { game, input } = make(buildEpilog(), 'schwarz');
  const g = garderobeOf(game);
  place(game, g.x + g.w / 2 - 6, 25 * TILE - PHYS.playerH);
  step(game, 0.4);

  check('Kleiderschrank: Beruehren allein zieht nicht um',
    game.outfit.id === 'schwarz' && game.state === 'play', `${game.outfit.id}/${game.state}`);

  const label = game.hud.label;
  check('Kleiderschrank: eigene, klare Beschriftung',
    !!label && /KLEIDERSCHRANK/.test(label.text) && /ZIVIL/.test(label.text),
    JSON.stringify(label));
  check('Kleiderschrank: die Beschriftung ist eine AKTION (kein TRITT)',
    !!label && label.action === true && label.key === 'E', JSON.stringify(label));

  // Auftrag CUT-1: das erste Umziehen auf Zivil geht durch die Schlussszene
  // (erst die Szene, danach der Wechsel). Die Aktion selbst bleibt dieselbe.
  input.setKey('action', false);
  step(game, 0.6);
  input.setKey('action', true);
  game.update(1 / 60);
  input.setKey('action', false);
  game.update(1 / 60);
  check('Kleiderschrank: das erste Umziehen auf Zivil laeuft durch die Szene',
    !!game.szene && game.outfit.id === 'schwarz',
    game.szene ? game.szene.beat : 'keine Szene');
  durch(game);

  check('Kleiderschrank: die Aktionstaste zieht Zivil an',
    game.outfit.id === 'zivil', game.outfit.id);
  check('Kleiderschrank: das Flag wird gesetzt',
    game.storyFlags.has('zivil_an') === true && game.hud.zivilAn === true,
    JSON.stringify([...game.storyFlags]));
  check('Kleiderschrank: die Meldung nennt das Hawaii-Hemd',
    !!game.hud.hint && /HAWAII/.test(game.hud.hint), String(game.hud.hint));
  check('Kleiderschrank: danach bietet er den Frack an',
    /KLEIDERSCHRANK/.test(game.hud.label.text) && /FRACK/.test(game.hud.label.text),
    JSON.stringify(game.hud.label));
}

// ------------------------------------------------------------- Umkehrbar ----
{
  const { game, input } = make(buildEpilog(), 'frack');
  const g = garderobeOf(game);
  place(game, g.x + g.w / 2 - 6, 25 * TILE - PHYS.playerH);
  step(game, 0.4);

  check('Wechsel: im Frack steht das Angebot Zivil',
    /KLEIDERSCHRANK/.test(game.hud.label.text) && /ZIVIL/.test(game.hud.label.text),
    JSON.stringify(game.hud.label));

  const folge = [game.outfit.id];
  for (let i = 0; i < 4; i++) { druecke(game, input); folge.push(game.outfit.id); }
  check('Wechsel: viermal hin und her ergibt einen sauberen Wechsel',
    JSON.stringify(folge) === JSON.stringify(['frack', 'zivil', 'frack', 'zivil', 'frack']),
    JSON.stringify(folge));
  check('Wechsel: das Flag folgt der getragenen Kluft',
    game.outfit.id === 'frack' && game.storyFlags.has('zivil_an') === false,
    JSON.stringify([...game.storyFlags]));
  check('Wechsel: am Ende steht wieder Zivil zur Wahl',
    /ZIVIL/.test(game.hud.label.text), JSON.stringify(game.hud.label));

  // Ein gehaltener Knopf schaltet genau einmal — der Wechsel haengt am Druck,
  // nicht am Kontakt.
  druecke(game, input);
  const vorher = game.outfit.id;
  input.setKey('action', true);
  step(game, 2.0);
  input.setKey('action', false);
  check('Wechsel: ein gehaltener Knopf schaltet nur einmal',
    game.outfit.id === vorher, `${vorher} -> ${game.outfit.id}`);
}

// ------------------------------------------- Kein Hitzestress im Garten -----
{
  check('Zivil: keine Nachteile in den Outfitdaten',
    OUTFITS.zivil.heatBase === 0 && OUTFITS.zivil.lightHeat === 0 &&
    OUTFITS.zivil.speed >= OUTFITS.frack.speed && OUTFITS.zivil.jump <= OUTFITS.frack.jump,
    `speed ${OUTFITS.zivil.speed} vs ${OUTFITS.frack.speed}, heat ${OUTFITS.zivil.heatBase}/${OUTFITS.zivil.lightHeat}`);

  const { game, input } = make(buildEpilog(), 'schwarz');
  const g = garderobeOf(game);
  place(game, g.x + g.w / 2 - 6, 25 * TILE - PHYS.playerH);
  druecke(game, input);
  input.setKey('right', true);
  step(game, 3.0);
  input.setKey('right', false);
  check('Zivil: im Garten steigt keine Hitze',
    game.outfit.id === 'zivil' && game.heat === 0 && game.glanz === 0,
    `hitze=${game.heat} glanz=${game.glanz} kluft=${game.outfit.id}`);
  check('Zivil: kein Takt, kein Glanzalarm im Garten',
    game.hud.ruhig === true && game.hud.inLight === false, JSON.stringify(game.hud.inLight));

  // Derselbe Ort im Scheinwerferlicht (Akt 2): Zivil bleibt kuehl, der Frack nicht.
  const lv2 = buildAkt2();
  const licht = (lv2.lights || [])[0];
  check('Vergleich: Akt 2 hat eine Lichtzone fuer den Hitzeversuch', !!licht);
  if (licht) {
    const probe = (outfit) => {
      const { game: g2 } = make(lv2, outfit);
      // DRR-F4: Zivil gibt es im Spiel nur im Kleingarten am Kleiderschrank.
      // Hier wird allein die Mechanik der Kluft gemessen (Hitze, Glanz, Tempo),
      // deshalb steht sie direkt am Modell; dass sie vor dem Garten nirgends
      // waehlbar ist, prueft tests/zivil-garten.test.mjs.
      g2.outfit = OUTFITS[outfit];
      place(g2, licht.x + licht.w / 2 - 6, (licht.y + licht.h) - PHYS.playerH);
      step(g2, 2.0);
      return g2;
    };
    const zivilG = probe('zivil');
    const frackG = probe('frack');
    check('Zivil: im Licht bleibt die Hitze bei null',
      zivilG.heat === 0 && zivilG.glanz === 0, `hitze=${zivilG.heat} glanz=${zivilG.glanz}`);
    check('Zivil: weniger Hitze als im Frack (kein Nachteil)',
      zivilG.heat <= frackG.heat && frackG.heat > 0,
      `zivil=${zivilG.heat} frack=${frackG.heat}`);

    // Tempo: dieselbe Strecke in derselben Zeit — Zivil ist nicht langsamer.
    const lauf = (outfit) => {
      const { game: g3, input: i3 } = make(lv2, outfit);
      g3.outfit = OUTFITS[outfit];          // Mechanik-Probe (siehe oben)
      const sp = g3.level.spawns.find((s) => s.isSpawn);
      place(g3, sp.tx * TILE, sp.walkRow * TILE - PHYS.playerH);
      step(g3, 0.3);
      const x0 = g3.player.x;
      i3.setKey('right', true);
      step(g3, 1.5);
      i3.setKey('right', false);
      return g3.player.x - x0;
    };
    const dZivil = lauf('zivil');
    const dFrack = lauf('frack');
    check('Zivil: kein Temponachteil gegenueber dem Frack',
      dZivil >= dFrack && dZivil > 0, `zivil ${dZivil.toFixed(0)}px vs frack ${dFrack.toFixed(0)}px`);
  }

  // Der Avatar selbst: die Paletten unterscheiden sich in mehreren Farben.
  // Sichtbar wird das im Browserlauf (Screenshot + Pixelprobe).
  const pZivil = OUTFIT_PALETTES.zivil, pFrack = OUTFIT_PALETTES.frack;
  const anders = Object.keys(pFrack).filter((k) => pZivil[k] !== pFrack[k]);
  check('Zivil: der Avatar bekommt eine andere Zeichnung (Palette)',
    anders.length >= 3, `gleich bleiben: ${Object.keys(pFrack).length - anders.length} Farben`);
}

// --------------------------------------- Der Abschluss haengt nicht am Rock -
{
  const bank = (outfit) => {
    const { game, input } = make(buildEpilog(), outfit);
    const ziel = game.level.goal;
    place(game, ziel.x + 8, 25 * TILE - PHYS.playerH);
    step(game, 0.4);
    const label = game.hud.label;
    input.setKey('action', true);
    game.update(1 / 60);
    input.setKey('action', false);
    game.update(1 / 60);
    // Seit dem Auftrag „Epilog-Ramona" sitzt Ramona dazu; der Abschluss kommt
    // erst nach der kurzen Sitzszene (Zielmechanik 'setzen' unveraendert).
    step(game, 4);
    return { game, label };
  };
  check('Abschluss: das Ziel verlangt Hinsetzen, nicht eine Kluft',
    (() => { const lv = buildEpilog(); return lv.goal.need === 'setzen' && lv.goal.name === 'DIE BANK'; })());

  const zivilLauf = bank('zivil');
  check('Abschluss: in Zivil steht das Angebot zum Hinsetzen',
    !!zivilLauf.label && /HINSETZEN/.test(zivilLauf.label.text), JSON.stringify(zivilLauf.label));
  check('Abschluss: in Zivil endet der Epilog auf der Bank',
    zivilLauf.game.state === 'complete' && !!zivilLauf.game.rows,
    `${zivilLauf.game.state} / ${JSON.stringify(zivilLauf.game.rows)}`);

  const frackLauf = bank('frack');
  check('Abschluss: im Frack endet der Epilog genauso',
    frackLauf.game.state === 'complete', frackLauf.game.state);

  const schwarzLauf = bank('schwarz');
  check('Abschluss: auch im schwarzen Hemd endet der Epilog',
    schwarzLauf.game.state === 'complete', schwarzLauf.game.state);

  // Der Frack haengt weiterhin in der Laube auf — und zwar unabhaengig davon,
  // was der Kleiderschrank gerade angezogen hat.
  const iS = createInput(null);
  const gS = new Game({
    level: buildEpilog(), input: iS, audio: AUDIO, events: () => {},
    view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  gS.reset('frack');
  const s = schrankOf(gS);
  place(gS, s.x + 8, 25 * TILE - PHYS.playerH);
  gS.update(1 / 60);
  check('Laube: der Schrank bietet das Aufhaengen an',
    !!gS.hud.label && /SCHRANK/.test(gS.hud.label.text) && gS.hud.label.action === true,
    JSON.stringify(gS.hud.label));
  iS.setKey('action', true);
  gS.update(1 / 60);
  iS.setKey('action', false);
  check('Laube: der Frack haengt im Schrank, das Hemd bleibt',
    gS.frackAbgelegt === true && gS.outfit.id === 'schwarz', `${gS.frackAbgelegt}/${gS.outfit.id}`);

  // In Zivil am Laubenschrank passiert nichts Kaputtes: der Frack bleibt an dir.
  const { game: gZ, input: iZ } = make(buildEpilog(), 'zivil');
  const sZ = schrankOf(gZ);
  place(gZ, sZ.x + 8, 25 * TILE - PHYS.playerH);
  step(gZ, 0.4);
  druecke(gZ, iZ);
  check('Laube: in Zivil wird dort nichts aufgehaengt',
    gZ.frackAbgelegt === false && gZ.outfit.id === 'zivil', `${gZ.frackAbgelegt}/${gZ.outfit.id}`);

  // Nach dem Aufhaengen kommt der Frack nicht aus dem Kleiderschrank zurueck.
  const { game: gN, input: iN } = make(buildEpilog(), 'schwarz');
  gN.frackAbgelegt = true;
  const gNent = garderobeOf(gN);
  place(gN, gNent.x + gNent.w / 2 - 6, 25 * TILE - PHYS.playerH);
  step(gN, 0.4);
  druecke(gN, iN);
  check('Kleiderschrank: nach dem Aufhaengen gibt es nur noch Zivil',
    gN.outfit.id === 'zivil', gN.outfit.id);
  druecke(gN, iN);
  // Die Meldung darf in der Warteschlange stehen (direkt davor kam „UMGEZOGEN"),
  // ankommen muss sie aber.
  const meldungen = [gN.hud.hint || '', ...(gN.hintQueue || []).map((q) => q.text)];
  check('Kleiderschrank: der aufgehaengte Frack kommt nicht zurueck',
    gN.outfit.id === 'zivil' && meldungen.some((t) => /LAUBE/.test(t)),
    `${gN.outfit.id} / ${JSON.stringify(meldungen)}`);
  check('Kleiderschrank: die Beschriftung sagt das auch',
    /NUR NOCH ZIVIL/.test(gN.hud.label.text), JSON.stringify(gN.hud.label));

  // Und der Abschluss geht auch dann noch.
  const zielN = gN.level.goal;
  place(gN, zielN.x + 8, 25 * TILE - PHYS.playerH);
  step(gN, 0.4);
  iN.setKey('action', true);
  gN.update(1 / 60);
  iN.setKey('action', false);
  gN.update(1 / 60);
  step(gN, 4);        // Sitzszene mit Ramona (Auftrag „Epilog-Ramona")
  check('Abschluss: auch nach dem Aufhaengen endet der Epilog auf der Bank',
    gN.state === 'complete', gN.state);
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Epilog-Zivil-Checks bestanden`);
process.exit(failed ? 1 : 0);
