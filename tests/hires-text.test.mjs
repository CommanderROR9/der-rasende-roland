// tests/hires-text.test.mjs — Phase A: HUD- und Statustexte liegen hochaufgeloest
// im DOM (ein einziger Textvertrag, der aus PR #6) und nicht mehr im Canvas.
import { readFileSync } from 'node:fs';
import { buildCabrio, buildMotorrad } from '../src/world.js';
import { Racer } from '../src/racer.js';
import { createInput } from '../src/input.js';
import { Grill } from '../src/grill.js';
import { drawJourneyHud, drawJourneyCar } from '../src/cabrio-art.js';
import { drawNightHud, drawNightBike } from '../src/motorrad-art.js';
import { drivingCue } from '../src/cabrio-drive.js';

const results = [];
let failed = 0;
function check(name, bedingung, extra = '') {
  const ok = !!bedingung;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ' — ' + extra}`);
}

function fahrer(level = buildCabrio()) {
  return new Racer({
    level,
    input: createInput(null),
    events() {},
    audio: { play() {}, engine() {}, engineOff() {} },
    view: { w: 384, h: 216 },
    difficulty: 'gemuetlich',
  });
}

/** Beschriftungen eines Fahrzeugs; fehlt der Vertrag noch, bleibt die Liste leer. */
function beschriftungen(r) {
  return typeof r.beschriftungen === 'function' ? r.beschriftungen() : [];
}

function neuerGrill(view = { w: 384, h: 216 }) {
  return new Grill({
    level: { bpm: 76 },
    input: createInput(null),
    audio: { play() {}, engine() {}, engineOff() {} },
    view,
  });
}

/** Zeichenprotokoll: sammelt jeden Text- und Flaechenaufruf einer Art-Funktion. */
function protokoll() {
  const texte = [], flaechen = [];
  const ctx = {
    fillStyle: '', font: '', textAlign: 'left', globalAlpha: 1,
    fillText(text, x, y) { texte.push({ text, x, y, font: this.font }); },
    fillRect(x, y, w, h) { flaechen.push({ x, y, w, h, stil: this.fillStyle }); },
    drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
    createLinearGradient() { return { addColorStop() {} }; }, save() {}, restore() {},
    translate() {}, scale() {},
  };
  return { ctx, texte, flaechen };
}

// --- 1. Canvas malt die Fahr-HUD-Texte nicht mehr -----------------------------
{
  const r = fahrer();
  r.sprite = () => ({ canvas: {}, w: 44, h: 27 });
  r.panneTimer = 2;
  const cabrioHud = protokoll();
  drawJourneyHud(r, cabrioHud.ctx);
  const cabrioCar = protokoll();
  drawJourneyCar(r, cabrioCar.ctx);
  const nacht = fahrer(buildMotorrad());
  nacht.sprite = () => ({ canvas: {}, w: 18, h: 34 });
  nacht.panneTimer = 2;
  const motorradHud = protokoll();
  drawNightHud(nacht, motorradHud.ctx);
  const motorradCar = protokoll();
  drawNightBike(nacht, motorradCar.ctx);
  check('Hires-Texte: die Canvas-HUDs schreiben keinen Text und keine Panel-Flaechen mehr',
    cabrioHud.texte.length === 0 && cabrioHud.flaechen.length === 0
      && motorradHud.texte.length === 0 && motorradHud.flaechen.length === 0,
    JSON.stringify({ cabrioText: cabrioHud.texte.length, cabrioFlaechen: cabrioHud.flaechen.length,
      motorradText: motorradHud.texte.length, motorradFlaechen: motorradHud.flaechen.length }));
  check('Hires-Texte: "KURZE PAUSE" kommt nicht mehr aus dem Canvas',
    cabrioCar.texte.length === 0 && motorradCar.texte.length === 0,
    JSON.stringify({ cabrio: cabrioCar.texte, motorrad: motorradCar.texte }));
}

// --- 2. Cabrio-HUD liegt vollstaendig als DOM-Beschriftung vor ----------------
{
  const r = fahrer();
  const daten = beschriftungen(r);
  const nachId = Object.fromEntries(daten.map((e) => [e.id, e]));
  const d = drivingCue(r);
  const sections = r.level.journey.sections;
  const erwartet = ['ro-abschnitt', 'ro-richtung', 'ro-tempo', 'ro-cue'];
  for (let i = 0; i < sections.length; i++) erwartet.push(`ro-segmente-${i}`);
  const struktur = daten.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y)
    && e.w > 0 && e.h > 0 && e.fontSize > 0 && e.text === e.text.toUpperCase() && e.unterHud === true);
  check('Hires-Texte: das Cabrio-HUD liefert Abschnitt, Segmente, Richtung, Richttempo und Cue als DOM-Daten',
    erwartet.every((id) => nachId[id]) && daten.length === erwartet.length && struktur,
    JSON.stringify({ ids: daten.map((e) => e.id), anzahl: daten.length, struktur }));
  check('Hires-Texte: die Werte sind dieselben wie im entfernten Canvas-HUD',
    nachId['ro-abschnitt']?.text === `1 / 4  ${d.section}`.toUpperCase()
      && nachId['ro-richtung']?.text === (d.braking ? 'BREMSE' : d.direction === 'straight' ? 'GERADEAUS'
        : d.direction === 'right' ? 'RECHTS >' : '< LINKS')
      && nachId['ro-tempo']?.text === `RICHTTEMPO ${d.advisedSpeed}`
      && nachId['ro-cue']?.text === d.cue,
    JSON.stringify({ abschnitt: nachId['ro-abschnitt']?.text, richtung: nachId['ro-richtung']?.text,
      tempo: nachId['ro-tempo']?.text, cue: nachId['ro-cue']?.text }));
  const segmente = sections.map((_, i) => nachId[`ro-segmente-${i}`]);
  check('Hires-Texte: je Abschnitt ein Segmentblock, offene Abschnitte bleiben leer',
    segmente.every((e) => e && (e.text === '█' || e.text === '░'))
      && segmente[0]?.text === '█' && segmente[0]?.color === '#ffdc8b'
      && segmente.slice(1).every((e) => e.text === '░' && e.color === '#465b68'),
    JSON.stringify(segmente.map((e) => ({ id: e?.id, text: e?.text, color: e?.color }))));
}

// --- 3. Segmentbloecke spiegeln den Fahrtfortschritt --------------------------
{
  const r = fahrer();
  r.journeyState.results = [{ id: 'stadt', clean: true }, { id: 'allee', clean: false }];
  r.position = r.level.journey.sections[2].from * (r.trackLength / r.segments.length);
  const nachId = Object.fromEntries(beschriftungen(r).map((e) => [e.id, e]));
  check('Hires-Texte: saubere, unsaubere und offene Abschnitte sind unterscheidbar',
    nachId['ro-segmente-0']?.color === '#85d6c6' && nachId['ro-segmente-1']?.color === '#dfac81'
      && nachId['ro-segmente-0']?.text === '█' && nachId['ro-segmente-1']?.text === '█'
      && nachId['ro-segmente-3']?.text === '░',
    JSON.stringify([0, 1, 2, 3].map((i) => ({ i, text: nachId[`ro-segmente-${i}`]?.text,
      color: nachId[`ro-segmente-${i}`]?.color }))));
  check('Hires-Texte: der laufende Abschnitt ist gezaehlt und benannt',
    /^3 \/ 4 /.test(nachId['ro-abschnitt']?.text || ''), nachId['ro-abschnitt']?.text);
}

// --- 4. Motorrad-Nachtvariante: fuenf Abschnitte, eigener Farbton -------------
{
  const r = fahrer(buildMotorrad());
  const nachId = Object.fromEntries(beschriftungen(r).map((e) => [e.id, e]));
  check('Hires-Texte: die Nachtfahrt uebernimmt denselben Vertrag mit fuenf Abschnitten',
    /^1 \/ 5 /.test(nachId['ro-abschnitt']?.text || '') && nachId['ro-segmente-4']
      && nachId['ro-abschnitt']?.color === '#e9e4cf' && nachId['ro-cue']?.color === '#d8d4c2',
    JSON.stringify({ abschnitt: nachId['ro-abschnitt']?.text, farbe: nachId['ro-abschnitt']?.color,
      ids: Object.keys(nachId) }));
}

// --- 5. KURZE PAUSE liegt im DOM ---------------------------------------------
{
  for (const [name, level] of [['Cabrio', buildCabrio()], ['Motorrad', buildMotorrad()]]) {
    const r = fahrer(level);
    const ohne = beschriftungen(r).some((e) => e.id === 'ro-pause');
    r.panneTimer = 2;
    const mit = beschriftungen(r).find((e) => e.id === 'ro-pause');
    check(`Hires-Texte: ${name} zeigt KURZE PAUSE nur waehrend der Pannepause im DOM`,
      !ohne && !!mit && mit.text === 'KURZE PAUSE' && mit.y > r.vh * 0.4 && mit.unterHud === true,
      JSON.stringify({ ohne, mit }));
  }
}

// --- 6. Grillstatus: eine kurze Zeile oben, Zahlen nur im globalen Readout ----
{
  const grill = neuerGrill();
  const daten = typeof grill.beschriftungen === 'function' ? grill.beschriftungen() : [];
  const nachId = Object.fromEntries(daten.map((e) => [e.id, e]));
  const status = nachId['grill-status'];
  const l = grill.layout();
  check('Grillstatus: eine Zeile "OFFEN n · FOKUS name · IM TAKT n" im DOM',
    !!status && status.text === 'OFFEN 8 · FOKUS ROH · IM TAKT 0',
    JSON.stringify({ status: status?.text, ids: daten.map((e) => e.id) }));
  check('Grillstatus: Punkte, Verbrannt und Serviert stehen nicht mehr in der Grillzeile',
    !nachId['grill-status-punkte'] && !nachId['grill-status-verbrannt']
      && !nachId['grill-status-stufen'] && !nachId['grill-status-rost-titel']
      && daten.every((e) => !/PUNKTE|VERBRANNT|SERVIERT/.test(e.text)),
    JSON.stringify(daten.map((e) => e.text)));
  check('Grillstatus: die Zeile sitzt oben im Bild und bleibt unter dem globalen HUD',
    !!status && status.y < l.vh / 2 && status.unterHud === true && status.w > status.h,
    JSON.stringify(status));
  const behalten = ['grill-garstufe-0', 'grill-garstufe-1', 'grill-garstufe-2', 'grill-teller', 'grill-vorrat'];
  check('Grillstatus: Garstufen, Teller und Vorrat bleiben als DOM-Beschriftung erhalten',
    behalten.every((id) => nachId[id]) && nachId['grill-garstufe-0']?.text === 'ROH'
      && nachId['grill-teller']?.text === 'TELLER 0' && nachId['grill-vorrat']?.text === 'VORRAT 5',
    JSON.stringify(behalten.map((id) => [id, nachId[id]?.text])));
}

// --- 7. Schrift, Ebene und Signatur im Markup ---------------------------------
{
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  check('Hires-Texte: die Textebene traegt einen 12px-Boden',
    /\.game-text-layer\{[^}]*--text-min:\s*12px/.test(html),
    (html.match(/--text-min:[^;]*/) || ['fehlt'])[0]);
  check('Hires-Texte: die Label-Schrift ist nie kleiner als dieser Boden',
    /\.game-text-label\{[^}]*font-size:\s*max\(var\(--text-min/.test(html),
    (html.match(/\.game-text-label\{[^}]*\}/) || ['fehlt'])[0].slice(0, 200));
  check('Hires-Texte: System-/Monospace-Stack, keine Webfont von aussen',
    /font-family:\s*ui-monospace[^;]*monospace/.test(html)
      && !/@font-face/.test(html)
      && !/fonts\.(googleapis|gstatic)\.com/.test(html)
      && !/url\(\s*['"]?https?:/i.test(html)
      && !/<link[^>]+rel=["']?stylesheet/i.test(html),
    'Webfont oder externe Schrift gefunden');
  const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  check('Hires-Texte: die Ebene schreibt nur bei echter Aenderung neu (dataset.sig)',
    /dataset\.sig/.test(js) && /beschriftungen\(\)/.test(js),
    (js.match(/dataset\.sig[^\n]*/) || ['keine Signatur'])[0]);
}

// --- 8. Testkette -------------------------------------------------------------
{
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  check('Hires-Texte: der Vertrag ist Teil des npm-Gesamtlaufs',
    packageJson.scripts?.test?.includes('node tests/hires-text.test.mjs'),
    packageJson.scripts?.test || 'kein npm-Testskript');
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Hires-Text-Checks bestanden`);
process.exit(failed ? 1 : 0);
