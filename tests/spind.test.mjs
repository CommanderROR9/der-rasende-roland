// tests/spind.test.mjs — Auftrag DRR-F5: die Kleiderwechsel-Stände sind graue
// Metall-Spinde (Roland, 14.09.: „die Kleiderwechsel Stationen … nicht so
// abstrakt wie bisher …, sondern als graue Metall-Spinde").
//
// Geprüft werden zwei Ebenen: die Sprite-Daten selbst (Palette, Maße, Türen,
// Luftschlitze, Griffe, Füße) und der echte Zeichenpfad — `drawEntities` legt
// für einen `stand` wirklich das Spind-Sprite auf die alte Standfläche, und die
// alte Kiste ist verschwunden. Der Bildbeweis im Browser kommt aus
// tests/browser-smoke.mjs (?test=spind); Sprite-Daten allein beweisen kein Bild.
//
// Start mit `node tests/spind.test.mjs`.
import { readFileSync } from 'node:fs';
import { SPRITES } from '../src/sprites.js';
import { PAL, PHYS, TILE, VIEW_DESKTOP } from '../src/config.js';
import { buildAkt1, buildAkt2, buildAkt3, buildAkt4, buildAkt5 } from '../src/world.js';
import { Game } from '../src/game.js';
import { createInput } from '../src/input.js';

const results = [];
let failed = 0;
function check(name, condition, extra = '') {
  const ok = !!condition;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ` — ${extra}`}`);
}

// --- DOM-Ersatz: der Sprite-Bauer braucht nur ein Canvas-Attrappen -----------
// (game.js ist DOM-frei, nur spriteCanvas holt sich ein Canvas.)
globalThis.document = {
  createElement() {
    return {
      width: 0, height: 0,
      getContext: () => ({
        fillStyle: null,
        fillRect() {},
        drawImage() {},
        globalCompositeOperation: 'source-over',
      }),
    };
  },
};

// Ein Aufrufprotokoll als Canvas-Ersatz: alles unbekannte wird zum No-Op.
function recorder() {
  const ops = { translate: [], drawImage: [], fillRect: [], fillStyles: [] };
  let fill = null;
  return new Proxy({}, {
    get(_, prop) {
      if (prop === 'ops') return ops;
      if (prop === 'fillStyle') return fill;
      if (prop === 'translate') return (x, y) => ops.translate.push([x, y]);
      if (prop === 'drawImage') return (img, x, y) => ops.drawImage.push({ img, x, y });
      if (prop === 'fillRect') return (x, y, w, h) => ops.fillRect.push({ x, y, w, h, farbe: fill });
      return () => {};
    },
    set(_, prop, value) {
      if (prop === 'fillStyle') { fill = value; ops.fillStyles.push(value); }
      return true;
    },
  });
}

const AUDIO = { play() {}, engine() {}, engineOff() {}, resume() {} };
function spiel(level, outfit = 'schwarz') {
  const input = createInput(null);
  const events = [];
  const game = new Game({
    level, input, audio: AUDIO, events: (e) => events.push(e),
    view: VIEW_DESKTOP, difficulty: 'gemuetlich',
  });
  game.reset(outfit);
  return { game, input, events };
}

const SPIND = SPRITES.spind;
const BREITE = 16, HOEHE = 30;
const METALL = 'gGm';            // helles, mittleres, dunkles Grau des Spinds
const DUNKEL = 'Kab';            // Fuge, Schlitze, Griffe, Sockel
const GREY = METALL + DUNKEL + 'h';

// ---------------------------------------------------------------- Daten ------
check('Spind: eigener Sprite im Spiel (16x30, keine Binärdatei)',
  Array.isArray(SPIND) && SPIND.length === HOEHE
    && SPIND.every((r) => r.length === BREITE),
  `Höhe ${SPIND && SPIND.length}, Breiten ${SPIND && [...new Set(SPIND.map((r) => r.length))].join('/')}`);

const zeichen = [...new Set(SPIND.join('').split(''))];
const unbekannt = zeichen.filter((c) => !(c in PAL));
check('Spind: nur Zeichen der Spielpalette (config.js PAL), keine neue Farbe',
  unbekannt.length === 0, unbekannt.join(' '));

const alle = SPIND.join('');
const belegt = [...alle].filter((c) => c !== ' ').length;
const metall = [...alle].filter((c) => METALL.includes(c)).length;
const fremd = [...alle].filter((c) => c !== ' ' && !GREY.includes(c));
check('Spind: komplett in Grautönen (kein Holz, kein Violett, kein Rot)',
  fremd.length === 0 && metall / belegt >= 0.5,
  `fremde Zeichen ${fremd.join('') || '—'}, Metallanteil ${(metall / belegt).toFixed(2)}`);

// Der sichtbare Körper liegt genau auf der alten Standfläche: 12 px breit
// (Spalten 2–13) und 26 px hoch (Zeilen 4–29). Die Zeilen 0–3 sind leer, damit
// der Sprite mit `y - spr.h` an derselben Unterkante landet wie die alte Skizze.
const RAENDER = [0, 1, 14, 15];
check('Spind: 12x26 px Körper auf der alten Standfläche (Spalten 2–13, Zeilen 4–29)',
  SPIND.slice(0, 4).every((r) => r.trim() === '')
    && SPIND.every((r) => RAENDER.every((i) => r[i] === ' '))
    && SPIND.slice(4).every((r) => r.slice(2, 14).trim() !== ''),
  JSON.stringify({ oben: SPIND.slice(0, 4), rand: SPIND.map((r) => r[0]).join('') }));

const RANDspalten = SPIND.slice(4).map((r) => r.slice(2, 14));
const fuge = RANDspalten.filter((r) => r[5] === 'K' && r[6] === 'K').length;
const schlitze = RANDspalten.filter((r) => r[2] === 'K' && r[3] === 'K' && r[8] === 'K' && r[9] === 'K').length;
const griffe = RANDspalten.filter((r) => r[4] === 'a' && r[7] === 'a').length;
check('Spind: zwei Türen mit durchgehender Mittelfuge', fuge >= 20, `${fuge} Zeilen mit Fuge`);
check('Spind: Luftschlitze oben (zwei Schlitzreihen je Tür)', schlitze >= 4, `${schlitze} Schlitzzeilen`);
check('Spind: Griffe links und rechts der Fuge', griffe >= 2, `${griffe} Griffzeilen`);

const letzte = SPIND[HOEHE - 1];
check('Spind: zwei Standfüße in der letzten Zeile',
  letzte.split('').filter((c) => c === 'b').length === 2
    && letzte.split('').every((c) => c === 'b' || c === ' '),
  JSON.stringify(letzte));
check('Spind: Sockel als dunkler Abschluss über den Füßen',
  SPIND[HOEHE - 2][2] === 'G' && SPIND[HOEHE - 2][13] === 'm'
    && SPIND[HOEHE - 2].slice(3, 13).split('').every((c) => c === 'K' || c === 'g'),
  JSON.stringify(SPIND[HOEHE - 2]));

// ------------------------------------------------------------ Zeichenpfad -----
const { game, input } = spiel(buildAkt1());
const stand = game.entities.find((e) => e.kind === 'stand');
check('Akt 1 stellt den Stand als eigene Entität auf', !!stand && stand.w === TILE,
  JSON.stringify(stand && { x: stand.x, y: stand.y, w: stand.w, h: stand.h }));

const ctx = recorder();
game.drawEntities(ctx, 0, 0);
const paket = game.spr('spind');
check('Spind: drawEntities zeichnet für den Stand das Spind-Sprite',
  ctx.ops.drawImage.some((d) => d.img === paket.canvas),
  `${ctx.ops.drawImage.length} drawImage-Aufrufe`);
check('Spind: Unterkante auf dem Boden der Kachel (Sprite mit y - 30 gesetzt)',
  ctx.ops.translate.some(([tx, ty]) => tx === stand.x && ty === stand.y - paket.h),
  JSON.stringify({ stand: [stand.x, stand.y], h: paket.h, translate: ctx.ops.translate.slice(0, 4) }));
check('Spind: kein Bildpunkt der alten Kiste mehr (#3b2f4a)',
  !ctx.ops.fillStyles.some((f) => String(f).toLowerCase() === '#3b2f4a'),
  ctx.ops.fillStyles.join(' '));
check('Spind: der Stand wird nicht mehr aus Rechtecken gebaut (#3b2f4a, 12x12-Kasten)',
  ctx.ops.fillRect.filter((r) => r.x >= stand.x && r.x <= stand.x + BREITE
    && r.y > stand.y - HOEHE && r.y < stand.y
    && String(r.farbe) !== 'rgba(93,224,207,0.75)').length === 0,
  JSON.stringify(ctx.ops.fillRect.filter((r) => r.x >= stand.x && r.x <= stand.x + BREITE
    && r.y > stand.y - HOEHE && r.y < stand.y)));
check('Spind: das Sprite-Paket ist im Cache stabil (ein Paket für alle Stände)',
  game.spr('spind') === paket && paket.w === BREITE && paket.h === HOEHE,
  `${paket && paket.w}x${paket && paket.h}`);

// Die Umkleide selbst hängt an diesem Punkt — der Umbau darf sie nicht kippen.
const spieler = game.player;
spieler.x = stand.x - 6;
spieler.y = 25 * TILE - PHYS.playerH;
spieler.vx = 0; spieler.vy = 0;
game.update(1 / 60);
check('Spind: der Stand meldet weiter Nähe und benennt die Aktion',
  game.hud.standNear === true && !!game.hud.label
    && game.hud.label.action === true && game.hud.label.text === 'UMZIEHEN',
  JSON.stringify(game.hud.label));
input.setKey('action', true);
game.update(1 / 60);
check('Spind: die Aktionstaste öffnet die Umkleide wie bisher',
  game.state === 'paused' && game.pauseReason === 'stand', `${game.state}/${game.pauseReason}`);

// -------------------------------------------------------------- Reichweite ----
// Zehn Stände in den Akten 1–5, alle über denselben Zweig gezeichnet.
const akte = [
  ['Akt 1', buildAkt1(), 3], ['Akt 2', buildAkt2(), 2], ['Akt 3', buildAkt3(), 2],
  ['Akt 4', buildAkt4(), 2], ['Akt 5', buildAkt5(), 1],
];
const zahlen = akte.map(([, lv]) => lv.spawns.filter((s) => s.kind === 'stand').length);
check('Spind: zehn Kleiderwechsel-Stände in den Akten 1–5 (3/2/2/2/1)',
  zahlen.join('/') === akte.map(([, , n]) => n).join('/') && zahlen.reduce((a, b) => a + b, 0) === 10,
  zahlen.join('/'));
check('Spind: kein Stand bringt ein eigenes Sprite mit (alle nutzen den Spind)',
  akte.every(([, lv]) => lv.spawns.filter((s) => s.kind === 'stand').every((s) => !s.spr)),
  akte.map(([n, lv]) => `${n}:${lv.spawns.filter((s) => s.kind === 'stand' && s.spr).length}`).join(' '));
check('Spind: auch die anderen Akte zeichnen dasselbe Paket',
  akte.every(([, lv]) => {
    const { game: g } = spiel(lv);
    const st = g.entities.find((e) => e.kind === 'stand');
    const c = recorder();
    g.drawEntities(c, 0, 0);
    return c.ops.drawImage.some((d) => d.img === g.spr('spind').canvas) && !!st;
  }), '');

// Der alte Kisten-Code muss aus dem Quelltext verschwunden sein (kein Rest,
// der bei einem anderen Level wieder auftauchen könnte).
const quelle = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
check('Spind: kein Rest der alten Kistenfarbe in src/game.js', !quelle.includes('#3b2f4a'));
const start = quelle.indexOf("case 'stand': {");
const standBlock = start < 0 ? '' : quelle.slice(start, quelle.indexOf("case '", start + 5));
check('Spind: der Stand-Zweig in src/game.js nutzt den Sprite (nur der Marker bleibt Rechteck)',
  start >= 0 && standBlock.includes("this.spr('spind')") && standBlock.includes('y - spr.h')
    && !standBlock.includes('#3b2f4a')
    && (standBlock.match(/ctx\.fillRect\(/g) || []).length <= 1,
  standBlock.replace(/\s+/g, ' ').slice(0, 160));

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Spind-Checks bestanden`);
process.exit(failed ? 1 : 0);
