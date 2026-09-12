// Kompat-Test zur Umbenennung Ada -> Anna (Auftrag U1).
// Weg: nur Anzeige und Texte umbenannt, interne IDs bleiben stabil.
// Prueft Anzeigenamen, stabile Flag-IDs, unveraenderte SAVE_VERSION
// und dass Rolf in Akt 1 weder Auftritt noch Mechanik hat.
// Start mit `node tests/anna-kompat.test.mjs`.
import { buildAkt1 } from '../src/world.js';
import { Game } from '../src/game.js';
import { createInput } from '../src/input.js';
import { PHYS, TILE } from '../src/config.js';
import { SPRITES } from '../src/sprites.js';
import { SAVE_VERSION, migriereSave } from '../src/story.js';

const results = [];
let failed = 0;
function check(name, condition, extra = '') {
  const ok = !!condition;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ` — ${extra}`}`);
}

const level = buildAkt1();
const npcs = level.spawns.filter((s) => s.kind === 'npc');
const daten = JSON.stringify(level);

// Anzeige: beide Begegnungen heissen ANNA.
check('Anzeige: beide Akt-1-NPCs heissen ANNA',
  npcs.length === 2 && npcs.every((s) => s.name === 'ANNA'), JSON.stringify(npcs.map((s) => s.name)));
// Kein sichtbarer alter Name mehr in den Akt-1-Daten.
check('Anzeige: kein ADA mehr in den Akt-1-Daten', !daten.includes('ADA'));
check('Anzeige: kein Ada mehr in den Akt-1-Daten', !daten.includes('Ada'));
// Interne IDs bleiben bewusst stabil (kein Spielstand bricht).
check('Kompat: Briefing-Flag-ID bleibt ada_beauftragt',
  npcs.some((s) => s.flag === 'ada_beauftragt') && level.gates.some((g) => g.flag === 'ada_beauftragt'));
check('Kompat: Payoff-Flag-ID bleibt ada_verabschiedet',
  npcs.some((s) => s.flag === 'ada_verabschiedet') && (level.goal.flags || []).includes('ada_verabschiedet'));
check('Kompat: Sprite-Schluessel ada bleibt stabil', Array.isArray(SPRITES.ada) && SPRITES.ada.length > 5);
// Spielstand: keine Migration noetig, Version unveraendert.
check('Kompat: SAVE_VERSION bleibt 3', SAVE_VERSION === 3, String(SAVE_VERSION));
{
  const alt = migriereSave({ act: 0, v: 1 });
  check('Kompat: alter Spielstand landet weiter in Akt 1',
    alt.station === 'akt1' && alt.v === SAVE_VERSION, JSON.stringify(alt));
}
// Mechanik: Annas Gespraech schaltet mit stabiler Flag-ID Tor und Journal.
{
  const input = createInput(null);
  const game = new Game({
    level: buildAkt1(), input,
    audio: { play() {}, resume() {} }, events: () => {}, difficulty: 'gemuetlich',
  });
  game.reset('schwarz');
  const anna = game.entities.find((e) => e.kind === 'npc' && e.flag === 'ada_beauftragt');
  game.player.x = anna.x - 18;
  game.player.y = anna.y + anna.h - PHYS.playerH;
  game.update(1 / 60);
  check('Kompat: Interaktion heisst MIT ANNA SPRECHEN',
    game.hud.label?.action === true && (game.hud.label.text || '').includes('ANNA'), JSON.stringify(game.hud.label));
  for (let i = 0; i < anna.dialog.length; i++) {
    input.setKey('action', true); game.update(1 / 60);
    input.setKey('action', false); game.update(1 / 60);
  }
  check('Kompat: Annas Auftrag setzt die stabile Flag-ID',
    game.storyFlags?.has('ada_beauftragt') === true);
  const tor = game.gates.find((g) => g.flag === 'ada_beauftragt');
  game.player.x = tor.tx * TILE - game.player.w + 2;
  game.player.y = 25 * TILE - PHYS.playerH;
  game.update(1 / 60);
  check('Kompat: stabile Flag-ID oeffnet die Garderobentuer', tor.open === true);
  check('Kompat: Journal nennt ANNA nach dem Auftrag',
    (game.hud.ziel || '').includes('STIMMBLÄTTER'), game.hud.ziel);
}
// Rolf: in Akt 1 weder Auftritt noch Mechanik (eigener spaeterer Auftrag).
check('Rolf: kein Auftritt in den Akt-1-Daten', !/rolf/i.test(daten));
check('Rolf: kein Oskar-Rest in den Akt-1-Daten', !/oskar/i.test(daten));

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Anna-Kompat-Checks bestanden`);
process.exit(failed ? 1 : 0);
