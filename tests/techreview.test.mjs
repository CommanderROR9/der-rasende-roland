// tests/techreview.test.mjs — Wächter für die Fixes aus dem Technikreview (15.09.2026):
// 1) jedes Level liefert einen Spawn-Marker (sonst crasht der Aktstart),
// 2) unbekannte Item-Arten kippen den Levelaufbau nicht mehr,
// 3) kein .at() in src/ (ES2022 — ältere Engines und Safari),
// 4) der Complete-Handler schützt die Bestwerte vor NaN.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEVELS, buildAkt1 } from '../src/world.js';
import { Game } from '../src/game.js';
import { createInput } from '../src/input.js';

const results = [];
let failed = 0;
function check(name, condition, extra = '') {
  const ok = !!condition;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ` — ${extra}`}`);
}

// --- 1. Spawn-Vertrag: jedes Level baut und hat einen Spawn-Marker ----------
{
  const fehler = [];
  for (const station of LEVELS) {
    try {
      const lvl = station.build();
      // Interludien (Cabrio/Probe/Motorrad) liefern keine Scroller-Spawns —
      // der Vertrag gilt für jedes Level mit spawns-Liste.
      if (!Array.isArray(lvl.spawns)) continue;
      if (!lvl.spawns.some((s) => s.isSpawn)) fehler.push(`${station.id}: ohne Spawn`);
    } catch (e) {
      fehler.push(`${station.id}: ${e.message}`);
    }
  }
  check('Level-Vertrag: jedes Scroller-Level baut und hat einen Spawn-Marker',
    fehler.length === 0, fehler.join('; '));
}

// --- 2. Unbekannte Item-Art wirft nicht (Fallback auf das Basis-Item) ---------
{
  const game = new Game({
    level: buildAkt1(), input: createInput(null),
    audio: { play() {}, resume() {} }, events: () => {}, difficulty: 'gemuetlich',
  });
  const e = game.makeEntity({ kind: 'item', item: 'gibt-es-nicht', tx: 3, walkRow: 3 });
  check('Item-Fallback: unbekannte Art wirft nicht und hat Masse',
    !!e && e.kind === 'item' && e.w > 0 && e.h > 0, JSON.stringify(e));
}

// --- 3. Kompatibilität: src/ bleibt frei von ES2022-Syntax (.at) ------------
{
  const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
  const treffer = [];
  for (const f of readdirSync(srcDir).filter((n) => n.endsWith('.js'))) {
    if (/\.at\s*\(/.test(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'))) treffer.push(f);
  }
  check('Kompat: src/ nutzt kein Array.prototype.at (ES2022)', treffer.length === 0, treffer.join(', '));
}

// --- 4. Bestwerte: Complete-Handler nie mit NaN ------------------------------
// Der Handler lebt in main.js und braucht das DOM; der Vertrag wird deshalb am
// Quelltext festgehalten (Befund 1: Grill/Probe melden keine Zeit).
{
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  check('Save-Guard: Complete-Handler wacht s.time und s.deckel mit Number.isFinite',
    main.includes('Number.isFinite(s.time)') && main.includes('Number.isFinite(s.deckel)'));
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Technikreview-Checks bestanden`);
process.exit(failed ? 1 : 0);
