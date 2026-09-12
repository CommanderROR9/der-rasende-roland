// tests/credits.test.mjs — der Abspann (Auftrag C1).
// Prüft Inhalt (nur Vornamen, Widmung), die Pixeldaten und vor allem, dass die
// Portraits wirklich gezeichnet werden — und nicht nur in den Daten stehen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ABSPANN, ABSPANN_SEITEN, ABSPANN_TITEL, ABSPANN_HINWEIS, ABSPANN_HINWEIS_KOMPAKT,
  ABSPANN_ZURUECK, ABSPANN_ZURUECK_TITEL, ABSPANN_WEITER,
  WIDMUNG, abspannLayout, abspannNamen, zeichneAbspann, zeichnePortrait, portraitKante,
} from '../src/credits.js';
import { PORTRAITS, PORTRAIT_PALETTE } from '../src/credits-portraits.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HIER, '..');
const VIEWS = [
  { name: 'Rechner', w: 384, h: 216 },
  { name: 'Touch', w: 256, h: 144 },
];

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

/** Aufzeichnender 2D-Kontext: hält Rechtecke und Texte fest. */
function protokoll() {
  const rects = [], texte = [];
  const ctx = {
    fillStyle: '', font: '', textAlign: 'left', textBaseline: 'alphabetic',
    save() {}, restore() {},
    fillRect(x, y, w, h) { rects.push({ stil: this.fillStyle, x, y, w, h }); },
    fillText(text, x, y) { texte.push({ text, x, y, font: this.font, stil: this.fillStyle }); },
  };
  return { ctx, rects, texte };
}

const PALETTE_FARBEN = new Set(Object.values(PORTRAIT_PALETTE).filter(Boolean));

/** Mehrwortige Zeilen, die im Abspann vorkommen dürfen (geprüfte Texte). */
const MEHRWORTIG = new Set([
  ABSPANN_TITEL, ABSPANN_HINWEIS, ABSPANN_HINWEIS_KOMPAKT, WIDMUNG.zeile,
]);

/** Alle Texte, die der Abspann überhaupt zeichnen kann. */
function alleTexte() {
  const gesehen = new Set();
  for (const v of VIEWS) {
    for (let s = 0; s < ABSPANN_SEITEN; s++) {
      const p = protokoll();
      zeichneAbspann(p.ctx, v, { seite: s });
      for (const t of p.texte) gesehen.add(t.text);
    }
  }
  return [...gesehen];
}

test('Neun Portraits sind mit Vornamen verknüpft', () => {
  assert.equal(ABSPANN.length, 9, `${ABSPANN.length} statt 9 Kacheln`);
  assert.deepEqual(abspannNamen(), [
    'ANNA', 'NICOLA', 'AOI', 'BARBARA', 'ANNEKATRIN', 'ANNETT', 'CHENYAN', 'ROLAND', 'BRUNO',
  ]);
  assert.equal(new Set(abspannNamen()).size, 9, 'doppelte Vornamen');
  for (const k of ABSPANN) {
    assert.ok(PORTRAITS[k.portrait], `Portraitdaten fehlen: ${k.portrait}`);
    assert.match(k.name, /^[A-ZÄÖÜ]+$/, `${k.name} ist kein einzelner Vorname`);
    assert.ok(!k.name.includes(' '), `${k.name} enthält ein Leerzeichen (Nachname?)`);
  }
});

test('Portraitdaten sind nicht leer und haben die erwartete Größe', () => {
  const erwartet = ['anna', 'nicola', 'aoi', 'barbara', 'annekatrin', 'annett', 'chenyan', 'roland-r', 'roland-s'];
  for (const key of erwartet) {
    const satz = PORTRAITS[key];
    assert.ok(satz, `Portrait fehlt: ${key}`);
    for (const [raster, kante] of [['gross', 48], ['klein', 24]]) {
      const rows = satz[raster];
      assert.equal(rows.length, kante, `${key}.${raster}: ${rows.length} Zeilen`);
      for (const row of rows) {
        assert.equal(row.length, kante, `${key}.${raster}: Zeile mit ${row.length} Zeichen`);
        for (const ch of row) {
          assert.ok(ch === ' ' || PORTRAIT_PALETTE[ch], `${key}.${raster}: unbekanntes Zeichen "${ch}"`);
        }
      }
      // Vollflächige Vorlagen: praktisch jeder Bildpunkt trägt Farbe.
      const voll = rows.reduce((n, row) => n + [...row].filter((c) => c !== ' ').length, 0);
      assert.ok(voll >= kante * kante * 0.95, `${key}.${raster}: nur ${voll} Bildpunkte`);
    }
  }
  assert.equal(portraitKante('gross'), 48);
  assert.equal(portraitKante('klein'), 24);
});

test('Nur Vornamen, keine Nachnamen und keine Funktionsbezeichnungen', () => {
  const texte = alleTexte();
  const namen = new Set(abspannNamen());
  // Funktions- und Rollenbezeichnungen dürfen im Abspann nicht vorkommen.
  const verboten = [
    'VIOLINE', 'VIOLIN', 'GEIGE', 'GEIGER', 'BRATSCHE', 'CELLO', 'KONZERTMEISTER',
    'DIRIGENT', 'ORCHESTER', 'MUSIKER', 'SOLIST', 'STIMMFÜHRER', 'TUTTI', 'PULT',
    'MASKE', 'BÜHNENTECHNIK', 'TONMEISTER', 'INSTRUMENT', 'NOTENWART', 'ARCHIV',
  ];
  for (const t of texte) {
    for (const wort of verboten) {
      assert.ok(!t.toUpperCase().includes(wort), `"${t}" enthält die Rollenangabe ${wort}`);
    }
    // Ein Nachname wäre ein zweites Wort in Großbuchstaben hinter einem Vornamen.
    assert.ok(!/^[A-ZÄÖÜ]{3,}\s+[A-ZÄÖÜ]{3,}$/.test(t), `"${t}" sieht nach Nachname aus`);
    // Mehrwortige Zeilen müssen bekannte, geprüfte Texte sein: Titel, Hinweis-
    // zeilen und die Widmung. Sonst könnte sich ein Name einschleichen.
    if (t.trim().includes(' ')) {
      assert.ok(MEHRWORTIG.has(t), `"${t}" ist mehrwortig, aber im Abspann nicht vorgesehen`);
    }
  }
  // Gegenprobe zur Prüfung selbst: alle neun Namen kommen als Schrift vor.
  for (const name of namen) {
    assert.ok(texte.includes(name), `Vorname ${name} wird nicht gezeichnet`);
  }
  // Der Geehrte steht ausdrücklich nicht in der Liste der Kollegen.
  assert.ok(!namen.has('SCHREIBER'), 'SCHREIBER steht in der Kollegenliste');
  assert.ok(!ABSPANN.some((k) => k.portrait === 'roland-s'), 'Widmungsportrait steht in der Liste');
  assert.equal(ABSPANN.filter((k) => k.name === 'ROLAND').length, 1, 'ROLAND mehrfach in der Liste');
});

test('Widmung an Roland Schreiber ist vorhanden', () => {
  assert.equal(WIDMUNG.zeile, 'FÜR ROLAND SCHREIBER');
  assert.equal(WIDMUNG.portrait, 'roland-s');
  const widmungsTexte = alleTexte().filter((t) => t.includes('SCHREIBER'));
  assert.deepEqual(widmungsTexte, ['FÜR ROLAND SCHREIBER'], `${widmungsTexte.join(' | ')}`);
  assert.equal(ABSPANN_SEITEN, 2, 'die Widmung braucht eine eigene Seite');
});

test('Die Portraits werden wirklich gezeichnet — beide Bildgrößen', () => {
  for (const v of VIEWS) {
    const L = abspannLayout(v, 0);
    assert.equal(L.kacheln.length, 9, `${v.name}: ${L.kacheln.length} Kacheln im Layout`);
    const p = protokoll();
    const gezeichnet = zeichneAbspann(p.ctx, v, { seite: 0 });
    // Alle Bildpunkte müssen im Bild liegen — sonst ist der Abspann abgeschnitten.
    for (const r of p.rects) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= v.w && r.y + r.h <= v.h,
        `${v.name}: Rechteck ${r.x},${r.y} ${r.w}×${r.h} liegt außerhalb des Bildes`);
    }
    const kacheln = gezeichnet.kacheln;
    for (const k of kacheln) {
      // Sichtbarkeitsprüfung: Bildpunkte INNERHALB des Kachelrechtecks zählen —
      // ohne den Hintergrund der ganzen Seite.
      const innen = p.rects.filter((r) => r.w !== v.w
        && r.x >= k.x && r.y >= k.y && r.x + r.w <= k.x + k.size && r.y + r.h <= k.y + k.size);
      const punkte = innen.reduce((n, r) => n + r.w * r.h, 0);
      assert.ok(punkte >= k.size * k.size * 0.9,
        `${v.name}/${k.name}: nur ${punkte} von ${k.size * k.size} Bildpunkten gezeichnet (gezeichnet=${k.gezeichnet})`);
      assert.equal(k.gezeichnet, punkte, `${k.name}: Rückgabewert ${k.gezeichnet} ≠ gezeichnete ${punkte}`);
      for (const r of innen) {
        assert.ok(PALETTE_FARBEN.has(r.stil), `${k.name}: Farbe ${r.stil} ist nicht in der Palette`);
      }
      // Der Vorname steht unter der Kachel, an der Stelle aus dem Layout.
      const name = p.texte.find((t) => t.text === k.name);
      assert.ok(name, `${v.name}/${k.name}: Vorname wird nicht gezeichnet`);
      assert.equal(name.x, k.nameX, `${k.name}: Name x=${name.x} statt ${k.nameX}`);
      assert.equal(name.y, k.nameY, `${k.name}: Name y=${name.y} statt ${k.nameY}`);
      assert.ok(name.y > k.y + k.size, `${k.name}: Name steht nicht unter der Kachel`);
      assert.ok(/^\d+px monospace$/.test(name.font), `${k.name}: Schrift ${name.font}`);
    }
    // Kacheln dürfen sich nicht überlappen (auf beiden Ansichten lesbar).
    for (let i = 0; i < kacheln.length; i++) {
      for (let j = i + 1; j < kacheln.length; j++) {
        const a = kacheln[i], b = kacheln[j];
        const ueberlappt = a.x < b.x + b.size && a.x + a.size > b.x && a.y < b.y + b.size && a.y + a.size > b.y;
        assert.ok(!ueberlappt, `${v.name}: ${a.name} und ${b.name} überlappen`);
      }
    }
    // Titel und Hinweis stehen im Bild.
    const titel = p.texte.find((t) => t.text === ABSPANN_TITEL);
    assert.ok(titel, `${v.name}: Titel fehlt`);
    assert.ok(titel.y <= L.kacheln[0].y, `${v.name}: Titel steht nicht über den Kacheln`);
    assert.ok(p.texte.some((t) => t.text === (v.w < 320 ? ABSPANN_HINWEIS_KOMPAKT : ABSPANN_HINWEIS)),
      `${v.name}: Bedienhinweis fehlt`);
  }
});

test('Die Widmungsseite zeigt das große Portrait', () => {
  for (const v of VIEWS) {
    const p = protokoll();
    const L = zeichneAbspann(p.ctx, v, { seite: 1 });
    assert.ok(L.widmung, `${v.name}: keine Widmung im Layout`);
    const g = L.widmung;
    assert.equal(g.size, 48, `${v.name}: Widmungsportrait ${g.size}px statt 48px`);
    assert.equal(g.portrait, 'roland-s');
    const innen = p.rects.filter((r) => r.w !== v.w
      && r.x >= g.x && r.y >= g.y && r.x + r.w <= g.x + g.size && r.y + r.h <= g.y + g.size);
    const punkte = innen.reduce((n, r) => n + r.w * r.h, 0);
    assert.ok(punkte >= 48 * 48 * 0.9, `${v.name}: nur ${punkte} Bildpunkte im Widmungsportrait`);
    assert.equal(g.gezeichnet, punkte, `${v.name}: Rückgabewert ${g.gezeichnet} ≠ ${punkte}`);
    // Größer als eine Kachel der ersten Seite.
    assert.ok(g.size > abspannLayout(v, 0).kacheln[0].size, `${v.name}: Widmung nicht größer als die Kacheln`);
    const zeile = p.texte.find((t) => t.text === WIDMUNG.zeile);
    assert.ok(zeile, `${v.name}: Widmungszeile fehlt`);
    assert.ok(zeile.y > g.y + g.size, `${v.name}: Widmungszeile steht nicht unter dem Portrait`);
    for (const t of p.texte) assert.ok(t.x >= 0 && t.x <= v.w && t.y > 0 && t.y <= v.h, `${v.name}: Text außerhalb`);
  }
});

test('Ein unbekanntes Portrait zeichnet nichts (kein stiller Blindgänger)', () => {
  const p = protokoll();
  assert.equal(zeichnePortrait(p.ctx, 'gibt-es-nicht', 0, 0, 'klein'), 0);
  assert.equal(p.rects.length, 0);
});

test('main.js verdrahtet den Abspann als Belohnung, nicht als Pflicht', () => {
  const main = readFileSync(join(WURZEL, 'src/main.js'), 'utf8');
  const html = readFileSync(join(WURZEL, 'index.html'), 'utf8');
  const paket = JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8'));
  // Der Abspann ist ein Overlay wie die anderen und wird beim Anzeigen mitversteckt.
  assert.match(main, /const OVERLAYS = \[[^\]]*'abspann'[^\]]*\]/);
  // Nur der Epilog schaltet den Knopf frei.
  assert.match(main, /classList\.toggle\('hidden', LEVEL\.id !== 'epilog'\)/);
  // Rückweg: der Knopf führt zurück in Spiel bzw. Titel — kein Sackgassenbildschirm.
  assert.match(main, /ui\.abspannZurueck\.onclick = \(\) => abspannZu\(\)/);
  assert.match(main, /function abspannZu\(\) \{\s*show\(abspannHerkunft === 'title' \? 'title' : 'reward'\)/);
  assert.ok(main.includes('ABSPANN_ZURUECK') && main.includes('ABSPANN_ZURUECK_TITEL'));
  // Tastatur gehört dem Abspann, solange er offen ist (sonst pausiert ESC das Spiel).
  assert.match(main, /if \(!ui\.abspann\.classList\.contains\('hidden'\)\) \{/);
  // Die Ansicht selbst steht im Markup: Bildfläche, Weiter, Zurück.
  for (const id of ['abspann', 'abspannCanvas', 'abspannWeiter', 'abspannZurueck', 'abspannBtn', 'abspannTitleBtn']) {
    assert.ok(html.includes(`id="${id}"`), `index.html: #${id} fehlt`);
  }
  // Das Bild entsteht in Spielauflösung, nicht in einer festen Wunschgröße.
  assert.match(html, /#abspannCanvas\{[^}]*image-rendering:pixelated/);
  // Und die Prüfdatei läuft in npm test mit.
  assert.ok(paket.scripts.test.includes('tests/credits.test.mjs'), 'credits.test.mjs fehlt in npm test');
  // Die Knopfbeschriftungen setzt main.js aus den Konstanten des Abspanns.
  assert.match(main, /ui\.abspannWeiter\.textContent = ABSPANN_WEITER/);
  assert.match(main, /ui\.abspannZurueck\.textContent = [^;]*ABSPANN_ZURUECK/);
});

console.log(`${passed} Abspann-Tests bestanden`);
