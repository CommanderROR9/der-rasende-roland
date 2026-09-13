// tests/grill.test.mjs — Vertrag der strukturierten Grill-Beschriftungen.
import { Grill } from '../src/grill.js';
import { createInput } from '../src/input.js';
import { readFileSync } from 'node:fs';

const results = [];
let failed = 0;
function check(name, bedingung, extra = '') {
  const ok = !!bedingung;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ' — ' + extra}`);
}

function neuerGrill(view = { w: 384, h: 216 }) {
  return new Grill({
    level: { bpm: 76 },
    input: createInput(null),
    audio: { play() {}, engine() {}, engineOff() {} },
    view,
  });
}

{
  const grill = neuerGrill();
  const texte = typeof grill.beschriftungen === 'function' ? grill.beschriftungen() : [];
  const nachId = Object.fromEntries(texte.map((text) => [text.id, text]));
  const erwarteteTexte = {
    'grill-garstufe-0': 'ROH',
    'grill-garstufe-1': 'ROH',
    'grill-garstufe-2': 'ROH',
    'grill-teller': 'TELLER 0',
    'grill-vorrat': 'VORRAT 5',
    'grill-status': 'OFFEN 8 · FOKUS ROH · IM TAKT 0',
  };
  const vollstaendig = Object.entries(erwarteteTexte).every(([id, text]) => nachId[id]?.text === text);
  const strukturiert = texte.length === Object.keys(erwarteteTexte).length
    && texte.every((text) => Number.isFinite(text.x) && Number.isFinite(text.y)
      && text.w > 0 && text.h > 0 && text.fontSize > 0
      && text.text === text.text.toUpperCase());
  check('Grilltexte: alle Canvas-Beschriftungen liegen vollstaendig als strukturierte Daten vor',
    vollstaendig && strukturiert,
    JSON.stringify({ methode: typeof grill.beschriftungen, anzahl: texte.length, texte: Object.fromEntries(texte.map((t) => [t.id, t.text])) }));
}

{
  const grill = neuerGrill();
  grill.wuerserste[0].gar = 70;
  grill.wuerserste[grill.auswahl].gar = 70;
  grill.punktestand = 340;
  grill.sauber = 3;
  grill.verbrannt = 1;
  grill.fertig = 2;
  grill.wuerserste[3].zustand = 'fertig';
  const nachId = Object.fromEntries(grill.beschriftungen().map((text) => [text.id, text.text]));
  check('Grilltexte: dynamische Beschriftungen lesen immer den aktuellen Spielzustand',
    nachId['grill-garstufe-0'] === 'GOLDBRAUN'
      && nachId['grill-teller'] === 'TELLER 1'
      && nachId['grill-status'] === 'OFFEN 6 · FOKUS GOLDBRAUN · IM TAKT 3',
    JSON.stringify(nachId));
}

{
  // Die eine Statuszeile des Grills kennt nur noch, was der Grill selbst zeigt:
  // Punkte, Verbrannt und Serviert fuehrt das globale HUD (#grillReadout).
  const grill = neuerGrill();
  const daten = grill.beschriftungen();
  check('Grilltexte: der Grillstatus ist eine Zeile ohne Punkte-, Verbrannt- und Serviertwerte',
    daten.filter((text) => text.id.startsWith('grill-status')).length === 1
      && daten.every((text) => !/PUNKTE|VERBRANNT|SERVIERT/.test(text.text)),
    JSON.stringify(daten.map((t) => [t.id, t.text])));
  check('Grilltexte: die Statuszeile steht oben und rueckt unter das globale HUD',
    daten.find((t) => t.id === 'grill-status')?.unterHud === true
      && daten.find((t) => t.id === 'grill-status').y < grill.layout().vh / 2,
    JSON.stringify(daten.find((t) => t.id === 'grill-status')));
}

{
  const quelle = readFileSync(new URL('../src/grill.js', import.meta.url), 'utf8');
  check('Grilltexte: der Canvas-Renderer zeichnet keine Schrift mehr',
    !/\.fillText\s*\(/.test(quelle),
    `${(quelle.match(/\.fillText\s*\(/g) || []).length} fillText-Aufrufe`);
}

{
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  check('Grilltexte: der Vertrag ist Teil des npm-Gesamtlaufs',
    packageJson.scripts?.test?.includes('node tests/grill.test.mjs'),
    packageJson.scripts?.test || 'kein npm-Testskript');
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Grilltext-Checks bestanden`);
process.exit(failed ? 1 : 0);
