// tests/credits-dom.test.mjs — F2: die Namentexte des Abspanns liegen
// hochaufgelöst in der DOM-Ebene und nicht mehr im 384x216-Bild.
//
// Der Auftrag kam aus Rolands Playtest (13.09.): „Die Namen in den Credits sind
// unleserlich verpixelt." Ursache war derselbe Fehler, den Phase A für die
// Fahr-HUD- und Grilltexte behoben hat: fillText in kleiner Schrift im
// hochskalierten Canvas. Diese Prüfung hält den Textvertrag fest — sie wird rot,
// sobald ein Vorname oder die Widmungszeile wieder in den Canvas wandert.
import { readFileSync } from 'node:fs';
import {
  ABSPANN, ABSPANN_SEITEN, ABSPANN_TITEL, ABSPANN_UEBERSCHRIFT, ABSPANN_HINWEIS, ABSPANN_HINWEIS_KOMPAKT,
  ABSPANN_FARBEN, WIDMUNG, abspannBeschriftungen, abspannLayout, abspannNamen, zeichneAbspann,
} from '../src/credits.js';
import { Racer } from '../src/racer.js';
import { createInput } from '../src/input.js';
import { Grill } from '../src/grill.js';
import { buildCabrio } from '../src/world.js';

const results = [];
let failed = 0;
function check(name, bedingung, extra = '') {
  const ok = !!bedingung;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ' — ' + extra}`);
}

const VIEWS = [
  { name: 'Rechner', w: 384, h: 216 },
  { name: 'Touch', w: 256, h: 144 },
];

/** Zeichenprotokoll: sammelt jeden Text- und Flaechenaufruf (wie hires-text). */
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

const NAMEN = new Set(abspannNamen());

// --- 1. Der Canvas zeichnet keine Namentexte mehr ----------------------------
{
  const gesehen = [];
  for (const v of VIEWS) {
    for (let s = 0; s < ABSPANN_SEITEN; s++) {
      const p = protokoll();
      zeichneAbspann(p.ctx, v, { seite: s });
      for (const t of p.texte) gesehen.push({ seite: s, view: v.name, text: t.text, font: t.font });
    }
  }
  const namentexte = gesehen.filter((t) => NAMEN.has(t.text) || t.text === WIDMUNG.zeile);
  check('Credits-DOM: kein Vorname und keine Widmungszeile kommen aus dem Canvas',
    namentexte.length === 0, JSON.stringify(namentexte.slice(0, 4)));
  // Zierzeilen bleiben im Bild (Auftrag: nur die Namen wandern).
  const zier = new Set([ABSPANN_TITEL, ABSPANN_HINWEIS, ABSPANN_HINWEIS_KOMPAKT, ABSPANN_UEBERSCHRIFT]);
  const fremd = gesehen.filter((t) => !zier.has(t.text));
  check('Credits-DOM: der Canvas zeichnet nur noch Ueberschrift, Titel und Bedienhinweis',
    fremd.length === 0, JSON.stringify(fremd.slice(0, 4)));
  check('Credits-DOM: jede Seite bringt Titel und Hinweis weiterhin als Canvas-Text',
    VIEWS.every((v) => {
      const seiten = gesehen.filter((t) => t.view === v.name);
      return seiten.some((t) => t.text === ABSPANN_TITEL)
        && seiten.some((t) => t.text === (v.w < 320 ? ABSPANN_HINWEIS_KOMPAKT : ABSPANN_HINWEIS));
    }), 'Titel oder Hinweis fehlt im Bild');
}

// --- 2. Jede Seite liefert genau einen Namentext als DOM-Daten ---------------
{
  const fehler = [];
  const ids = new Set();
  for (const v of VIEWS) {
    for (let s = 0; s < ABSPANN_SEITEN; s++) {
      const daten = abspannBeschriftungen(v, s);
      const L = abspannLayout(v, s);
      const erwartet = s === ABSPANN_SEITEN - 1 ? WIDMUNG.zeile : ABSPANN[s].name;
      const id = s === ABSPANN_SEITEN - 1 ? 'abspann-widmung' : 'abspann-name';
      if (daten.length !== 1) { fehler.push(`${v.name}/${s}: ${daten.length} Eintraege`); continue; }
      const d = daten[0];
      ids.add(d.id);
      if (d.id !== id) fehler.push(`${v.name}/${s}: Kennung ${d.id}`);
      if (d.text !== erwartet) fehler.push(`${v.name}/${s}: "${d.text}" statt "${erwartet}"`);
      if (d.text !== d.text.toUpperCase()) fehler.push(`${v.name}/${s}: Text nicht in Grossschrift`);
      if (![d.x, d.y, d.w, d.h, d.fontSize].every(Number.isFinite)) fehler.push(`${v.name}/${s}: Masse fehlen`);
      if (!(d.w > 0 && d.h > 0 && d.fontSize > 0)) fehler.push(`${v.name}/${s}: leere Box`);
      if (d.align !== 'center') fehler.push(`${v.name}/${s}: Ausrichtung ${d.align}`);
      // Die Box sitzt zwischen Portraitunterkante und Hinweiszeile.
      const feld = L.widmung || L.kacheln[0];
      if (d.y < feld.y + feld.size) fehler.push(`${v.name}/${s}: Box beginnt im Portrait`);
      if (d.y + d.h > L.hinweis.y - 4) fehler.push(`${v.name}/${s}: Box beruehrt die Hinweiszeile`);
      // Sie ist breit genug fuer die Mitte und bleibt im Bild.
      if (d.x < 0 || d.x + d.w > v.w) fehler.push(`${v.name}/${s}: Box ausserhalb des Bildes`);
      if (d.x + d.w / 2 !== (L.widmung || L.kacheln[0]).nameX) {
        fehler.push(`${v.name}/${s}: Mitte ${d.x + d.w / 2} statt ${(L.widmung || L.kacheln[0]).nameX}`);
      }
    }
  }
  check('Credits-DOM: jede Seite liefert genau einen Namentext in der Mitte unter dem Portrait',
    fehler.length === 0, fehler.slice(0, 5).join(' | '));
  check('Credits-DOM: die Kennungen sind stabil (abspann-name, abspann-widmung)',
    ids.size === 2 && ids.has('abspann-name') && ids.has('abspann-widmung'), [...ids].join(','));
}

// --- 3. Dieselbe Vertragsform wie die Spieltexte aus Phase A -----------------
{
  /**
   * Ein Vergleichseintrag aus dem Fahr-HUD (Phase A). Beide Quellen müssen
   * dieselben Pflichtfelder liefern und sich im selben Feldvorrat bewegen —
   * sonst rendert die eine Textebene zwei Formen. Der Vorrat ist genau das, was
   * `renderSpieltexte`/`setzeTextElement` in src/main.js auslesen.
   */
  const KERN = ['id', 'text', 'x', 'y', 'w', 'h', 'fontSize', 'color', 'align'];
  const VORRAT = new Set([...KERN, 'bg', 'weight', 'letterSpacing', 'unterHud']);
  const r = new Racer({
    level: buildCabrio(), input: createInput(null), events() {},
    audio: { play() {}, engine() {}, engineOff() {} },
    view: { w: 384, h: 216 }, difficulty: 'gemuetlich',
  });
  const spieltexte = typeof r.beschriftungen === 'function' ? r.beschriftungen() : [];
  const abspann = abspannBeschriftungen(VIEWS[0], 0)[0] || {};
  check('Credits-DOM: derselbe Textvertrag wie die Spieltexte aus Phase A',
    spieltexte.length > 0 && Object.keys(abspann).length > 0
      && KERN.every((f) => f in spieltexte[0] && f in abspann)
      && Object.keys(spieltexte[0]).every((f) => VORRAT.has(f))
      && Object.keys(abspann).every((f) => VORRAT.has(f)),
    `Spieltext: ${Object.keys(spieltexte[0] || {}).sort().join(',')} — Abspann: ${Object.keys(abspann).sort().join(',')}`);
  // Die Zahlen sind echte Bildpunkte des Ansichtsrasters, keine CSS-Pixel.
  check('Credits-DOM: die Namentexte rechnen in Bildpunkten der Ansicht',
    VIEWS.every((v) => abspannBeschriftungen(v, 0)[0]?.w === v.w
      && abspannBeschriftungen(v, 0)[0]?.y < v.h),
    JSON.stringify(VIEWS.map((v) => [v.w, abspannBeschriftungen(v, 0)[0]?.w])));
  // Die Box ist hoch genug fuer den 12-CSS-Pixel-Boden der Ebene: bei 320
  // CSS-Pixeln Anzeigebreite (kleinstes Handy) hat sie mindestens 12 CSS-Pixel.
  const zuKlein = VIEWS.filter((v) => (abspannBeschriftungen(v, 0)[0]?.h || 0) * (320 / v.w) < 12);
  check('Credits-DOM: die Namensbox traegt den 12-CSS-Pixel-Boden auch auf dem Handy',
    zuKlein.length === 0, JSON.stringify(zuKlein.map((v) => v.name)));
}

// --- 4. Nur Vornamen: der Inhalt bleibt unveraendert ------------------------
{
  const daten = [];
  for (const v of VIEWS) for (let s = 0; s < ABSPANN_SEITEN; s++) daten.push(...abspannBeschriftungen(v, s));
  const texte = [...new Set(daten.map((d) => d.text))];
  check('Credits-DOM: die Textebene kennt genau die neun Vornamen und die Widmung',
    texte.length === 10 && abspannNamen().every((n) => texte.includes(n)) && texte.includes(WIDMUNG.zeile),
    texte.join(','));
  check('Credits-DOM: keine Nachnamen, keine Funktionsbezeichnungen in der Textebene',
    texte.filter((t) => t !== WIDMUNG.zeile).every((t) => /^[A-ZÄÖÜ]+$/.test(t) && !t.includes(' ')),
    texte.join(','));
}

// --- 5. Markup: dieselbe Ebene, derselbe Boden, dieselbe Schrift -------------
{
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  check('Credits-DOM: die Namen haben eine eigene Textebene ueber der Leinwand',
    /<div id="abspannTextLayer" class="game-text-layer abspann-text-layer"/.test(html),
    (html.match(/<div id="abspannTextLayer"[^>]*>/) || ['fehlt'])[0]);
  check('Credits-DOM: die Ebene liegt in einem Bezugsrahmen ueber dem Canvas',
    /<div class="abspann-bild" id="abspannBild">/.test(html) && /\.abspann-bild\{position:relative/.test(html),
    'kein positionsstabiler Rahmen gefunden');
  check('Credits-DOM: es gilt derselbe 12px-Boden wie fuer die Spieltexte',
    /\.game-text-layer\{[^}]*--text-min:\s*12px/.test(html),
    (html.match(/--text-min:[^;]*/) || ['fehlt'])[0]);
  check('Credits-DOM: System-/Monospace-Stack, keine Webfont von aussen',
    /font-family:ui-monospace[^;]*monospace/.test(html)
      && !/@font-face/.test(html)
      && !/fonts\.(googleapis|gstatic)\.com/.test(html)
      && !/url\(\s*['"]?https?:/i.test(html),
    'Webfont oder externe Schrift gefunden');
  // Das Bild selbst bleibt Pixelkunst — die Namen sind der einzige neue DOM-Text.
  check('Credits-DOM: die Leinwand bleibt pixelig skaliert (Bild unangetastet)',
    /#abspannCanvas\{[^}]*image-rendering:pixelated/.test(html));
}

// --- 6. Verdrahtung in src/main.js ------------------------------------------
{
  const js = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  check('Credits-DOM: main.js holt die Namentexte aus dem Modul und legt sie in die Ebene',
    /abspannBeschriftungen\(VIEW, seite\)/.test(js)
      && /ebene\.appendChild\(el\)/.test(js)
      && /el\.className = 'game-text-label'/.test(js),
    'kein Rendern der Abspann-Namen in der Ebene gefunden');
  check('Credits-DOM: die Ebene wird nur bei echter Aenderung neu geschrieben (dataset.sig)',
    /ebene\.dataset\.sig = sig/.test(js), 'keine Signatur an der Abspann-Ebene');
  check('Credits-DOM: dieselbe Skalierungsrechnung wie die Spieltextebene',
    /function textMass\(daten, view, canvasEl, elternEl\)/.test(js)
      && /function setzeTextElement\(el, daten, mass/.test(js)
      && /setzeTextElement\(el, daten, abspannTextMass\(daten\)\)/.test(js)
      && /function spieltextMass\(daten, view = spieltextView\) \{\s*return textMass\(daten, view, ui\.canvas, ui\.stage\);/.test(js),
    'Abspann und Spieltexte nutzen nicht denselben Vertrag');
  check('Credits-DOM: beim Groessenwechsel wird die Ebene mitgezogen',
    /aktualisiereSpieltextLayout\(\);\s*\/\/ F2: die Namentexte des Abspanns[\s\S]{0,200}aktualisiereAbspannTextLayout\(\);/.test(js),
    'kein Nachziehen in fit()');
  check('Credits-DOM: die Pruefbaren Daten der Textebene haengen am Abspann-Objekt',
    /texte: \(seite = abspannSeite\) => abspannBeschriftungen\(VIEW, seite\)/.test(js)
      && /get texteEbene\(\) \{ return ui\.abspannTextLayer; \}/.test(js),
    'kein Zugang fuer die Browserpruefungen');
}

// --- 7. Der Grill liefert weiterhin seine eigenen Texte (kein Rueckbau) ------
{
  const grill = new Grill({ level: { bpm: 76 }, input: createInput(null),
    audio: { play() {}, engine() {}, engineOff() {} }, view: { w: 384, h: 216 } });
  const daten = typeof grill.beschriftungen === 'function' ? grill.beschriftungen() : [];
  check('Credits-DOM: die Phase-A-Textebene bleibt unberuehrt (Grill liefert weiter Beschriftungen)',
    daten.length > 0 && daten.every((e) => typeof e.id === 'string'), `${daten.length} Beschriftungen`);
}

// --- 8. Testkette ------------------------------------------------------------
{
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  check('Credits-DOM: diese Pruefung ist Teil des npm-Gesamtlaufs',
    packageJson.scripts?.test?.includes('node tests/credits-dom.test.mjs'),
    packageJson.scripts?.test || 'kein npm-Testskript');
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Credits-DOM-Checks bestanden`);
process.exit(failed ? 1 : 0);
