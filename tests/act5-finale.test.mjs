// tests/act5-finale.test.mjs — Vertragstest des Finales (Auftrag A5).
//
// Der Applaus entsteht aus der Aufführung — aus der Zugabe am Pult, die das in
// Akt 2 gelernte Probenmotiv aufgreift — und nicht mehr aus dem Betäuben der
// Musiker. Er verfällt nicht mehr von selbst, „FRACK ABLEGEN" hängt an keiner
// Hitze, und der Akt endet auch ohne einen einzigen Bierdeckel.
// Aufruf: node tests/act5-finale.test.mjs
import { buildAkt5, PROBEN_MOTIV } from '../src/world.js';
import { Game } from '../src/game.js';
import { createInput } from '../src/input.js';
import { PHYS, VIEW_DESKTOP } from '../src/config.js';

const results = [];
let failed = 0;
function check(name, condition, extra = '') {
  const ok = !!condition;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ` — ${extra}`}`);
}

const TILE = 16;
const DT = 1 / 60;
const GEGNER = ['piccolo', 'sopran', 'tenor', 'koffer', 'dirigent'];
const level = buildAkt5();

function makeGame(difficulty = 'gemuetlich', outfit = 'schwarz') {
  const input = createInput(null);
  const events = [];
  const game = new Game({
    level: buildAkt5(), input,
    audio: { play() {}, resume() {} },
    events: (e) => events.push(e),
    view: VIEW_DESKTOP, difficulty,
  });
  game.reset(outfit);
  return { game, input, events };
}
function step(game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.update(DT);
}
function place(game, px, py) {
  const p = game.player;
  p.x = px; p.y = py; p.vx = 0; p.vy = 0; p.h = PHYS.playerH;
  game.stunTimer = 0;
  return p;
}
/** Echte Taste E: drücken und wieder loslassen (zwei Bilder). */
function drueckeE(game, input) {
  input.setKey('action', true); game.update(DT);
  input.setKey('action', false); game.update(DT);
}
function pultVon(game) { return game.entities.find((e) => e.kind === 'pult'); }
function vorDasPult(game) {
  const pult = pultVon(game);
  place(game, pult.x + 2, 21 * TILE - PHYS.playerH);
  game.update(DT);
  return pult;
}
function vorDenVorhang(game) {
  const g = game.level.goal;
  place(game, g.x + 4, g.y + g.h - PHYS.playerH);
  game.update(DT);
}
function imTakt(game) { game.beatPhase = 0.02; }

// ------------------------------------------------------------------ Leveldaten
{
  check('Akt 5: das Ziel verlangt Applaus, die Zugabe und den abgelegten Frack',
    level.goal.applaus === 60 && level.goal.need === 'ablegen'
    && Array.isArray(level.goal.flags) && level.goal.flags.includes('zugabe_gespielt')
    && level.goal.frackOff === undefined,
    JSON.stringify(level.goal));

  check('Akt 5: der Vorhang nennt den fehlenden Schritt, bevor er sperrt',
    typeof level.goal.flagLocked === 'string' && /ZUGABE/.test(level.goal.flagLocked),
    String(level.goal.flagLocked));

  const z = level.zugabe;
  check('Akt 5: die Zugabe ist als Leveldaten beschrieben (Zahl, Stufen, Motiv)',
    !!z && Number.isInteger(z.noetig) && z.noetig >= 4 && z.noetig <= 6
    && z.noetig * z.proSchritt === level.goal.applaus,
    JSON.stringify(z));

  check('Akt 5: die Zugabe zitiert das Probenmotiv aus Akt 2',
    z.motiv === PROBEN_MOTIV.id && level.zugabe.motiv === 'probe-motiv',
    `${z.motiv} / ${PROBEN_MOTIV.id}`);

  const pultSpawns = level.spawns.filter((s) => s.kind === 'pult' && s.zugabe);
  const pult = pultSpawns[0];
  check('Akt 5: genau ein Zugabe-Pult steht im Level',
    pultSpawns.length === 1 && pult.tx === z.pultTx && pult.noetig === z.noetig,
    JSON.stringify(pultSpawns.map((s) => `${s.tx}/${s.noetig}`)));
  check('Akt 5: das Pult steht auf dem Bühnenboden am Bühnenrand',
    !!pult && pult.tx > 59 && pult.tx < 76 && level.grid[pult.walkRow + 1][pult.tx] === 1,
    `tx=${pult && pult.tx} unter=${pult && level.grid[pult.walkRow + 1][pult.tx]}`);
  check('Akt 5: das Pult steht links vom Vorhang (der Weg führt nach rechts)',
    !!pult && pult.tx * TILE < level.goal.x);

  const pultHinweise = level.hints.filter((h) => Math.abs(h.x - z.pultTx * TILE) <= 3 * TILE);
  check('Akt 5: am Pult erklärt ein Hinweis Taste, Takt und Ziel',
    pultHinweise.some((h) => /\bE\b/.test(h.text) && /TAKT/.test(h.text) && /ZUGABE/.test(h.text)),
    JSON.stringify(pultHinweise.map((h) => h.text)));
  check('Akt 5: kein Hinweis verspricht mehr Applaus für Treffer',
    !level.hints.some((h) => /GETROFFEN WÄCHST ER/.test(h.text)),
    JSON.stringify(level.hints.map((h) => h.text)));

  check('Akt 5: das Journal nennt die Zugabe als ersten Schritt',
    Array.isArray(level.storySteps) && level.storySteps.length >= 2
    && /ZUGABE/.test(level.storySteps[0].text)
    && level.storySteps[level.storySteps.length - 1].goal === true,
    JSON.stringify(level.storySteps));

  check('Akt 5: kein Ziel und kein Storyschritt hängt am Sammeln von Bierdeckeln',
    !Object.keys(level.goal).some((k) => /deckel/i.test(k))
    && !(level.storySteps || []).some((s) => /DECKEL/i.test(s.text || '')),
    JSON.stringify(Object.keys(level.goal)));
}

// -------------------------------------------------- Applaus kommt aus der Zugabe
{
  const { game: gA } = makeGame();
  check('Akt 5: Applaus startet bei null', gA.applaus === 0 && gA.zugabeSchritt === 0);

  // Betäuben ist kein Applaus-Motor mehr (Auftrag A5), Zählung bleibt scharf (D3).
  const { game: gB } = makeGame();
  const pic = gB.entities.find((e) => e.kind === 'piccolo');
  place(gB, pic.x - 40, pic.y);
  imTakt(gB);
  const hitsVorher = gB.taktHits;
  gB.tryTritt();
  check('Akt 5: ein Treffer im Takt gibt keinen Applaus mehr',
    gB.applaus === 0 && gB.taktHits === hitsVorher + 1,
    `applaus=${gB.applaus} hits=${gB.taktHits - hitsVorher}`);
  gB.tryTritt();
  check('Akt 5: derselbe betäubte Gegner zählt nicht zweimal (Befund D3)',
    gB.taktHits === hitsVorher + 1 && gB.lastTritt.frisch === 0,
    `hits=${gB.taktHits - hitsVorher} frisch=${gB.lastTritt.frisch}`);

  // Der Applaus fällt nicht ins Leere: kein stiller Zerfall mehr.
  const { game: gD } = makeGame();
  gD.applaus = 60;
  step(gD, 8);
  check('Akt 5: der Applaus verfällt nicht mehr von selbst',
    gD.applaus === 60, String(gD.applaus));
}

// ------------------------------------------------------- Die Zugabe am Pult
{
  const { game: g, input, events } = makeGame();
  const pult = vorDasPult(g);
  check('Akt 5: am Pult steht das Angebot „ZUGABE SPIELEN"',
    !!g.hud.label && /ZUGABE/.test(g.hud.label.text) && g.hud.label.action === true,
    JSON.stringify(g.hud.label));
  check('Akt 5: das Journal nennt die Zugabe als Aufgabe',
    /ZUGABE/.test(g.hud.ziel || ''), g.hud.ziel);

  // Danebengehen kostet nichts — und gibt keinen Applaus.
  g.hint = null; g.hintQueue = [];
  g.beatPhase = 0.5;
  drueckeE(g, input);
  check('Akt 5: ein Einsatz daneben kostet nichts und sagt, worauf es ankommt',
    pult.teil === 0 && g.applaus === 0 && /TAKT/.test(g.hud.hint || ''),
    `teil=${pult.teil} applaus=${g.applaus} hint=${g.hud.hint}`);

  const stufen = [];
  for (let i = 0; i < 3; i++) {
    imTakt(g);
    drueckeE(g, input);
    stufen.push(g.hud.applaus);
  }
  check('Akt 5: die Zugabe wächst in klaren Stufen (+12 je Einsatz im Takt)',
    stufen.join(',') === '12,24,36', stufen.join(','));
  check('Akt 5: jeder Einsatz ist sichtbar (Puls im HUD und Stand am Pult)',
    g.hud.applausPuls === true && g.hud.zugabeSchritt === 3
    && g.hud.zugabeNoetig === level.zugabe.noetig && pult.teil === 3,
    JSON.stringify({ puls: g.hud.applausPuls, schritt: g.hud.zugabeSchritt }));

  // Keine Zerfalls-Falle: wer mitten in der Zugabe sucht, verliert nichts.
  step(g, 5);
  check('Akt 5: während der Zugabe läuft der Applaus nicht still davon',
    g.applaus === 36 && pult.teil === 3, `applaus=${g.applaus} teil=${pult.teil}`);
  check('Akt 5: der Puls beruhigt sich wieder',
    g.hud.applausPuls === false, String(g.hud.applausPuls));

  imTakt(g); drueckeE(g, input);
  imTakt(g); drueckeE(g, input);
  check('Akt 5: nach fünf Einsätzen steht der Applaus auf dem Zielwert',
    pult.teil === 5 && g.applaus === 60 && g.zugabeFertig === true
    && g.storyFlags.has('zugabe_gespielt'),
    `teil=${pult.teil} applaus=${g.applaus} fertig=${g.zugabeFertig}`);
  check('Akt 5: die Zugabe meldet sich als Ereignis',
    events.some((e) => e.type === 'zugabe' && e.schritte === 5),
    JSON.stringify(events));

  const vorZusatz = g.applaus;
  imTakt(g); drueckeE(g, input);
  check('Akt 5: ein sechster Einsatz bringt nichts mehr',
    g.applaus === vorZusatz && pult.teil === 5, `applaus=${g.applaus} teil=${pult.teil}`);

  check('Akt 5: danach führt das Journal zum Vorhang',
    /FRACK/.test(g.hud.ziel || '') && /ABLEGEN/.test(g.hud.ziel || ''), g.hud.ziel);
  check('Akt 5: das Pult sagt, dass die Zugabe steht',
    /ZUGABE STEHT/.test((g.hud.label || {}).text || ''), JSON.stringify(g.hud.label));
}

// ------------------------------------------- Frack ablegen ohne künstliche Hitze
{
  const { game: g, input } = makeGame('gemuetlich', 'frack');
  g.storyFlags.add('zugabe_gespielt');
  g.applaus = 60;
  vorDenVorhang(g);
  check('Akt 5: am Vorhang steht klar „FRACK ABLEGEN"',
    !!g.hud.label && /ABLEGEN/.test(g.hud.label.text) && g.hud.label.action === true,
    JSON.stringify(g.hud.label));
  check('Akt 5: der Vorhang verlangt keine Hitze (Spieler kommt kalt an)',
    g.heat < 1, String(g.heat));

  drueckeE(g, input);
  check('Akt 5: kalt und ohne Frack-Off öffnet der Vorhang',
    g.frackAbgelegt === true && g.outfit.id === 'schwarz' && g.frackOffUsed === false
    && g.state === 'complete',
    `abgelegt=${g.frackAbgelegt} outfit=${g.outfit.id} frackOff=${g.frackOffUsed} state=${g.state}`);

  // Auch mit Hitze bleibt E die Ablege-Aktion, nicht der Notgriff.
  const { game: g2, input: i2 } = makeGame('gemuetlich', 'frack');
  g2.storyFlags.add('zugabe_gespielt');
  g2.applaus = 60;
  g2.heat = 80;
  vorDenVorhang(g2);
  drueckeE(g2, i2);
  check('Akt 5: am Vorhang löst E nicht den Frack-Off aus',
    g2.frackOffUsed === false && g2.frackAbgelegt === true && g2.state === 'complete',
    `frackOff=${g2.frackOffUsed} abgelegt=${g2.frackAbgelegt}`);

  // Ohne Zugabe bleibt der Vorhang zu — und sagt, was fehlt.
  const { game: g3, input: i3 } = makeGame('gemuetlich', 'frack');
  vorDenVorhang(g3);
  g3.hint = null; g3.hintQueue = [];
  drueckeE(g3, i3);
  check('Akt 5: ohne gespielte Zugabe öffnet der Vorhang nicht',
    g3.state === 'play' && g3.goalErfuellt() === false
    && g3.storyFlags.has('zugabe_gespielt') === false,
    `state=${g3.state} erfuellt=${g3.goalErfuellt()}`);
  check('Akt 5: der Vorhang nennt die Zugabe als fehlenden Schritt',
    /ZUGABE/.test(g3.hud.hint || ''), String(g3.hud.hint));

  // Im schwarzen Hemd gibt es nichts abzulegen (Bestandsschutz D4).
  const { game: g4, input: i4 } = makeGame('gemuetlich', 'schwarz');
  g4.storyFlags.add('zugabe_gespielt');
  g4.applaus = 60;
  vorDenVorhang(g4);
  drueckeE(g4, i4);
  check('Akt 5: ohne Frack wird nichts abgelegt',
    g4.state === 'play' && g4.frackAbgelegt === false && /FRACK/.test(g4.hud.hint || ''),
    `state=${g4.state} hint=${g4.hud.hint}`);
}

// ------------------------------------- Abschluss ohne vollständiges Sammeln
{
  const ohne = makeGame('gemuetlich', 'frack');
  ohne.game.storyFlags.add('zugabe_gespielt');
  ohne.game.applaus = 60;
  check('Akt 5: ein Lauf ganz ohne Bierdeckel darf abschließen',
    ohne.game.deckel === 0);
  vorDenVorhang(ohne.game);
  drueckeE(ohne.game, ohne.input);

  const voll = makeGame('gemuetlich', 'frack');
  voll.game.storyFlags.add('zugabe_gespielt');
  voll.game.applaus = 60;
  voll.game.deckel = level.deckelTotal;
  vorDenVorhang(voll.game);
  drueckeE(voll.game, voll.input);

  const zeilen = (g) => (g.rows || []).map(([k]) => k).join(',');
  check('Akt 5: der Abschluss gelingt ohne Sammeln (state complete)',
    ohne.game.state === 'complete' && voll.game.state === 'complete',
    `${ohne.game.state}/${voll.game.state}`);
  check('Akt 5: Sammeln bringt kein besseres Ende (gleiche Abschlusszeilen)',
    zeilen(ohne.game) === zeilen(voll.game) && zeilen(voll.game) === 'ZEIT,STIMMZIMMER KEKSE,IM TAKT GETROFFEN,NERVEN',
    `${zeilen(ohne.game)} | ${zeilen(voll.game)}`);
  check('Akt 5: der Abschluss nennt den Stand der Stimmzimmerkekse ehrlich',
    (ohne.game.rows || []).some(([k, v]) => k === 'STIMMZIMMER KEKSE' && v === `0 / ${level.deckelTotal}`),
    JSON.stringify(ohne.game.rows));
}

// ----------------------------------- Simulationslauf: nur der HUD-Führung nach
{
  const iB = createInput(null);
  const events = [];
  const g = new Game({
    level: buildAkt5(), input: iB,
    audio: { play() {}, resume() {} },
    events: (e) => events.push(e),
    view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  g.reset('frack');                       // Auftritt im Frack, drei Nerven
  const feindeVorher = g.entities.filter((en) => GEGNER.includes(en.kind));
  const pult = pultVon(g);
  // Wegpunkte sind die begehbare Route des Levels (dieselbe, die der Smoke-Test
  // abläuft). Alles, was der Bot *entscheidet* — wohin, wann E, im Takt oder
  // nicht — liest er aus dem HUD (hud.ziel, hud.label, hud.applaus, Taktlage).
  // Er setzt die Figur nie um und entfernt keinen Gegner.
  const route = [
    { tx: 10, row: 25 }, { tx: 27, row: 25 }, { tx: 25, row: 23 }, { tx: 29, row: 21 },
    { tx: 33, row: 20 }, { tx: 37, row: 19 }, { tx: 42, row: 17 }, { tx: 48, row: 16 },
    { tx: 56, row: 16 }, { tx: 62, row: 21 }, { tx: 70, row: 21 }, { tx: 80, row: 21 },
    { tx: 92, row: 21 }, { tx: 104, row: 21 }, { tx: 108, row: 21 }, { tx: 112, row: 21 },
  ];
  const rueck = () => {
    const tx = Math.floor(g.player.x / TILE);
    let i = 0;
    while (i < route.length - 1 && route[i].tx < tx - 4) i++;
    return i;
  };
  let idx = 0, frames = 0, jh = 0, jr = 0, zuege = 0, schlaege = 0, kollapse = 0;
  let best = Infinity, still = 0, trittPause = 0;
  const laufen = (wp) => {
    const p = g.player;
    const tx = wp.tx * TILE + 8, feetY = wp.row * TILE;
    const d = tx - (p.x + p.w / 2);
    iB.setKey('right', d > 3);
    iB.setKey('left', d < -3);
    const footRow = Math.floor((p.y + p.h + 1) / TILE);
    const hole = g.tileVal(Math.floor((p.x + p.w + 6) / TILE), footRow) === 0 && feetY <= p.y + p.h + 4;
    // „still": klemmt der Bot an einem Hindernis (z. B. Instrumentenkoffer),
    // nimmt der Weg einen Sprung — sonst drückt er sich nur die Nase platt.
    if (Math.abs(d) < best - 4) { best = Math.abs(d); still = 0; } else still += 1;
    const need = (feetY < p.y + p.h - 8 && Math.abs(d) < 56) || hole || still > 20;
    if (jh > 0) { iB.setKey('jump', true); jh -= 1; if (jh === 0) jr = 3; }
    else if (jr > 0) { iB.setKey('jump', false); jr -= 1; }
    else if (p.onGround && need) { jh = 16; iB.setKey('jump', true); jh -= 1; }
    else iB.setKey('jump', false);
    if (p.onGround && Math.abs(d) < 8 && Math.abs((p.y + p.h) - feetY) < 18) { best = Infinity; still = 0; return true; }
    return false;
  };

  while (frames < 60 * 200 && g.state !== 'complete') {
    frames += 1;
    if (trittPause > 0) trittPause -= DT;
    if (g.state === 'collapse') { kollapse += 1; g.respawnFromCheckpoint(); idx = rueck(); best = Infinity; still = 0; continue; }
    if (g.state === 'paused') { g.resume(); continue; }
    const label = g.hud.label;
    const text = label ? label.text : '';
    if (label && label.action && /ZUGABE/.test(text)) {
      iB.setKey('right', false); iB.setKey('left', false); iB.setKey('jump', false);
      if (g.beatAccuracy() <= g.diff.trittWindow) { zuege += 1; drueckeE(g, iB); }
      else g.update(DT);
      continue;
    }
    if (label && /VORHANG:/.test(text)) { drueckeE(g, iB); continue; }
    // Der Takt ist auch die Waffe: wer den Weg sperrt, wird im Takt getroffen.
    const p = g.player;
    const nah = trittPause <= 0 && g.entities.find((en) => en.alive && GEGNER.includes(en.kind)
      && Math.hypot((en.x + en.w / 2) - (p.x + p.w / 2), (en.y + en.h / 2) - (p.y + p.h / 2)) < 70);
    if (nah && !(label && label.action) && g.beatAccuracy() <= g.diff.trittWindow) {
      schlaege += 1; trittPause = 0.35; drueckeE(g, iB); continue;
    }
    if (laufen(route[idx])) idx = Math.min(idx + 1, route.length - 1);
    g.update(DT);
  }

  const feindeNachher = g.entities.filter((en) => GEGNER.includes(en.kind));
  const lage = `state=${g.state} frames=${frames} nerven=${g.nerves} kollapse=${kollapse} `
    + `zugabe=${pult.teil}/${pult.noetig} applaus=${g.applaus} deckel=${g.deckel} `
    + `hits=${schlaege} feinde=${feindeNachher.length}/${feindeVorher.length}`;
  check('Akt 5: der HUD-Bot spielt die Zugabe im Takt durch (fünf Einsätze)',
    pult.teil === pult.noetig && zuege >= 5, lage);
  check('Akt 5: der HUD-Bot schließt den Akt ab (state complete)', g.state === 'complete', lage);
  check('Akt 5: der Applaus stammt nur aus der Zugabe (genau 60, nichts aus Treffern)',
    g.applaus === 60, `${g.applaus}`);
  check('Akt 5: der Bot kam mit drei echten Nerven aus (kein Schummeln)',
    g.maxNerves === 3 && g.nerves >= 0, `${g.nerves}/${g.maxNerves}`);
  check('Akt 5: kein Gegner wurde entfernt oder betrogen',
    feindeNachher.length === feindeVorher.length && feindeNachher.every((en) => en.alive),
    `${feindeNachher.length}/${feindeVorher.length}`);
  check('Akt 5: der Abschluss nennt Stimmzimmerkekse und Zeit',
    (g.rows || []).some(([k]) => k === 'STIMMZIMMER KEKSE') && (g.rows || []).some(([k]) => k === 'ZEIT'),
    JSON.stringify(g.rows));
  check('Akt 5: die Zugabe steht als Ereignis im Protokoll',
    events.some((e) => e.type === 'zugabe'), JSON.stringify(events.map((e) => e.type)));
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Akt-5-Finale-Checks bestanden`);
process.exit(failed ? 1 : 0);
