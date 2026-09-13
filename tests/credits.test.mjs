// tests/credits.test.mjs — der Abspann (Auftrag C1, Fassung V3: Upload-Portraits).
// Prüft Inhalt (nur Vornamen, Widmung), die Pixeldaten aus Rolands Uploads und vor
// allem, dass die Portraits wirklich gezeichnet werden — und nicht nur in den Daten
// stehen. V3 zeigt die Portraits als Filmfolge: eine Seite je Portrait.
// Chenyan: Portrait am 13.09. durch Rolands neue Vorlage ersetzt (chenyan-neu.jpg).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ABSPANN, ABSPANN_SEITEN, ABSPANN_TITEL, ABSPANN_HINWEIS, ABSPANN_HINWEIS_KOMPAKT,
  ABSPANN_ZURUECK, ABSPANN_ZURUECK_TITEL, ABSPANN_WEITER,
  WIDMUNG, abspannLayout, abspannNamen, zeichneAbspann, zeichnePortrait, portraitKante,
} from '../src/credits.js';
import { PORTRAITS, PORTRAIT_PALETTE, PORTRAIT_KANTE } from '../src/credits-portraits.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HIER, '..');
const VIEWS = [
  { name: 'Rechner', w: 384, h: 216 },
  { name: 'Touch', w: 256, h: 144 },
];

/**
 * Prüfsummen der ausgelieferten Matrizen (Erzeugungsprotokoll
 * portrait-vorlagen/ausgeschnitten -> daten/matrizen.json). Sie nageln fest,
 * dass im Spiel genau die abgenommenen Upload-Portraits stehen.
 * CHENYAN stammt aus der neuen Vorlage (portrait-vorlagen/ausgeschnitten-neu/chenyan.png,
 * ausgeschnitten aus quelle-chenyan-neu/chenyan-neu.jpg) — siehe Kommentar im Modul.
 */
const MATRIX_SHA256 = {
  anna: 'ea87c0c493fe24756bc6da60b7b7629740a889eaad50c17464a8d5e00a649f3b',
  aoi: '6bd7f6a0d4e6cb30ce98541f82bd3b6890a1f92e1a69f27ca2c21ed5d5bc850b',
  barbara: '43a12d9b303796627cdb00f37ae00ded738257413c24f7e28980f1264fc8ce12',
  nicola: '9fafe76bb35b39ec59838fc16e648445d7e21c5d8f02cfd9440edbcdbca48d08',
  annekatrin: 'd635e5c0631456a9274b0b23f3b7b9c1d8dde6a573883bbf3afee7aab4a8a231',
  'roland-r': 'ac202486a9ff7b0169d0841771a345be981d5ea5c24d38a2b0af32568f8a8f38',
  chenyan: '36eae17f8feaad4d8fc0ff9f7cfeb20d8883e7474d07d11d3d90f74f2f226721',
  annett: '07490c9a5938ca4066c27b3333529443ec098084687277bc7d6e11351dafd4ac',
  bruno: 'c9c64807647820a7b8c780d56feeb404548c508460c771e018a3a2bf42563bd5',
  'roland-s': '55c6b6703842592c8260168375a61653c22c489ac25c5782bd1ba6b1b3291b29',
};

/** Farbpunkte je Portrait laut Erzeugungsprotokoll (Nachweis unveränderter Daten). */
const FARBPUNKTE = {
  anna: 5005, aoi: 5002, barbara: 5626, nicola: 3183, annekatrin: 4548,
  'roland-r': 5931, chenyan: 4786, annett: 3404, bruno: 3724, 'roland-s': 5839,
};

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

/** Bildpunkte, die auf einer Seite wirklich gemalt wurden (ohne Seitenhintergrund). */
function gemaltePunkte(p, v) {
  return p.rects.filter((r) => r.w !== v.w || r.h !== v.h).reduce((n, r) => n + r.w * r.h, 0);
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

test('Portraitdaten sind die Upload-Ausschnitte: 96x96, Palettenzeichen, durchsichtiger Grund', () => {
  const erwartet = ['anna', 'aoi', 'barbara', 'nicola', 'annekatrin', 'roland-r', 'chenyan', 'annett', 'bruno', 'roland-s'];
  assert.equal(PORTRAIT_KANTE, 96, `Rasterkante ${PORTRAIT_KANTE} statt 96`);
  assert.equal(portraitKante('bild'), 96, `portraitKante('bild') = ${portraitKante('bild')}`);
  for (const key of erwartet) {
    const satz = PORTRAITS[key];
    assert.ok(satz, `Portrait fehlt: ${key}`);
    const rows = satz.bild;
    assert.ok(Array.isArray(rows), `${key}.bild fehlt`);
    assert.equal(rows.length, 96, `${key}.bild: ${rows.length} Zeilen`);
    for (const row of rows) {
      assert.equal(row.length, 96, `${key}.bild: Zeile mit ${row.length} Zeichen`);
      for (const ch of row) {
        assert.ok(ch === ' ' || PORTRAIT_PALETTE[ch], `${key}.bild: unbekanntes Zeichen "${ch}"`);
      }
    }
    const voll = rows.reduce((n, row) => n + [...row].filter((c) => c !== ' ').length, 0);
    assert.equal(voll, FARBPUNKTE[key],
      `${key}: ${voll} Farbpunkte statt ${FARBPUNKTE[key]} (Daten verändert?)`);
    // Der helle Kachelhintergrund der Vorlage ist durchsichtig: die Figur deckt nur
    // einen Teil des Feldes, nicht das ganze Blatt.
    const anteil = voll / (96 * 96);
    assert.ok(anteil > 0.3 && anteil < 0.75,
      `${key}: ${(anteil * 100).toFixed(0)} % Farbpunkte — Hintergrund nicht freigestellt?`);
    const sha = createHash('sha256').update(rows.join('\n')).digest('hex');
    assert.equal(sha, MATRIX_SHA256[key], `${key}: Prüfsumme der Matrix weicht ab`);
  }
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
    // Nur Titel, Hinweiszeile und Widmung sind mehrwortig.
    if (t.trim().includes(' ') && !namen.has(t)) {
      assert.ok(t === ABSPANN_TITEL || t === ABSPANN_HINWEIS || t === ABSPANN_HINWEIS_KOMPAKT
        || t === WIDMUNG.zeile, `"${t}" ist mehrwortig, aber im Abspann nicht vorgesehen`);
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
  assert.equal(WIDMUNG.raster, 'bild', 'die Widmung nutzt das Upload-Portrait');
  const widmungsTexte = alleTexte().filter((t) => t.includes('SCHREIBER'));
  assert.deepEqual(widmungsTexte, ['FÜR ROLAND SCHREIBER'], `${widmungsTexte.join(' | ')}`);
  // Neun Seiten Filmfolge plus die Widmung als eigene Seite.
  assert.equal(ABSPANN_SEITEN, ABSPANN.length + 1, `${ABSPANN_SEITEN} Seiten statt ${ABSPANN.length + 1}`);
});

test('Filmfolge: jede Seite zeigt genau ein Portrait, der Vorname steht darunter', () => {
  for (const v of VIEWS) {
    const gesehen = [];
    for (let seite = 0; seite < ABSPANN.length; seite++) {
      const p = protokoll();
      const L = zeichneAbspann(p.ctx, v, { seite });
      assert.equal(L.kacheln.length, 1, `${v.name}/Seite ${seite}: ${L.kacheln.length} Kacheln`);
      assert.equal(L.widmung, null, `${v.name}/Seite ${seite}: Widmung statt Kachel`);
      const k = L.kacheln[0];
      assert.equal(k.portrait, ABSPANN[seite].portrait, `${v.name}/Seite ${seite}: falsches Portrait`);
      assert.equal(k.name, ABSPANN[seite].name, `${v.name}/Seite ${seite}: falscher Vorname`);
      assert.equal(k.size, 96, `${v.name}/Seite ${seite}: Kante ${k.size} statt 96`);
      // Alle Bildpunkte müssen im Bild liegen — sonst ist der Abspann abgeschnitten.
      for (const r of p.rects) {
        assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= v.w && r.y + r.h <= v.h,
          `${v.name}/${k.name}: Rechteck ${r.x},${r.y} ${r.w}×${r.h} liegt außerhalb des Bildes`);
      }
      // Sichtbarkeit: die gemalten Bildpunkte der Kachel müssen zur Matrix passen.
      const innen = p.rects.filter((r) => r.w !== v.w
        && r.x >= k.x && r.y >= k.y && r.x + r.w <= k.x + k.size && r.y + r.h <= k.y + k.size);
      const punkte = innen.reduce((n, r) => n + r.w * r.h, 0);
      assert.equal(k.gezeichnet, punkte, `${k.name}: Rückgabewert ${k.gezeichnet} ≠ gezeichnete ${punkte}`);
      const voll = PORTRAITS[k.portrait].bild.reduce((n, row) => n + [...row].filter((c) => c !== ' ').length, 0);
      assert.equal(punkte, voll, `${v.name}/${k.name}: ${punkte} Bildpunkte gemalt, Matrix hat ${voll}`);
      assert.ok(punkte < k.size * k.size, `${k.name}: die ganze Kachel ist deckend (Hintergrund nicht frei)`);
      for (const r of innen) {
        assert.ok(PALETTE_FARBEN.has(r.stil), `${k.name}: Farbe ${r.stil} ist nicht in der Palette`);
      }
      // Der Vorname steht unter dem Portrait.
      const name = p.texte.find((t) => t.text === k.name);
      assert.ok(name, `${v.name}/${k.name}: Vorname wird nicht gezeichnet`);
      assert.equal(name.x, k.nameX, `${k.name}: Name x=${name.x} statt ${k.nameX}`);
      assert.equal(name.y, k.nameY, `${k.name}: Name y=${name.y} statt ${k.nameY}`);
      assert.ok(name.y > k.y + k.size, `${k.name}: Name steht nicht unter der Kachel`);
      assert.ok(name.x >= k.x && name.x <= k.x + k.size, `${k.name}: Name steht nicht über der Kachel`);
      assert.ok(/^\d+px monospace$/.test(name.font), `${k.name}: Schrift ${name.font}`);
      // Genau ein Vorname je Seite - kein Raster mehr.
      const namensTexte = p.texte.filter((t) => abspannNamen().includes(t.text));
      assert.deepEqual(namensTexte.map((t) => t.text), [k.name], `${v.name}/Seite ${seite}: ${namensTexte.length} Vornamen`);
      // Titel und Hinweis stehen im Bild.
      const titel = p.texte.find((t) => t.text === ABSPANN_TITEL);
      assert.ok(titel, `${v.name}: Titel fehlt`);
      assert.ok(titel.y <= k.y, `${v.name}: Titel steht nicht über dem Portrait`);
      assert.ok(p.texte.some((t) => t.text === (v.w < 320 ? ABSPANN_HINWEIS_KOMPAKT : ABSPANN_HINWEIS)),
        `${v.name}: Bedienhinweis fehlt`);
      gesehen.push(k.portrait);
    }
    // Filmfolge: jede Seite ein anderes Portrait, alle neun kommen vor.
    assert.equal(new Set(gesehen).size, 9, `${v.name}: ${new Set(gesehen).size} verschiedene Portraits`);
    assert.deepEqual(gesehen, ABSPANN.map((k) => k.portrait), `${v.name}: Reihenfolge weicht ab`);
  }
});

test('Die letzte Seite ist die Widmung an den Geehrten', () => {
  for (const v of VIEWS) {
    const p = protokoll();
    const L = zeichneAbspann(p.ctx, v, { seite: ABSPANN_SEITEN - 1 });
    assert.ok(L.widmung, `${v.name}: keine Widmung im Layout`);
    assert.equal(L.kacheln.length, 0, `${v.name}: Kollegenkacheln auf der Widmungsseite`);
    const g = L.widmung;
    assert.equal(g.size, 96, `${v.name}: Widmungsportrait ${g.size}px statt 96px`);
    assert.equal(g.portrait, 'roland-s');
    assert.equal(g.raster, 'bild');
    const innen = p.rects.filter((r) => r.w !== v.w
      && r.x >= g.x && r.y >= g.y && r.x + r.w <= g.x + g.size && r.y + r.h <= g.y + g.size);
    const punkte = innen.reduce((n, r) => n + r.w * r.h, 0);
    assert.equal(g.gezeichnet, punkte, `${v.name}: Rückgabewert ${g.gezeichnet} ≠ ${punkte}`);
    const voll = PORTRAITS['roland-s'].bild.reduce((n, row) => n + [...row].filter((c) => c !== ' ').length, 0);
    assert.equal(punkte, voll, `${v.name}: ${punkte} Bildpunkte im Widmungsportrait statt ${voll}`);
    // Bildgröße wie auf den Portraitseiten, aber die Widmungszeile bleibt darunter.
    assert.equal(g.size, abspannLayout(v, 0).kacheln[0].size, `${v.name}: Widmung anders groß als die Portraits`);
    const zeile = p.texte.find((t) => t.text === WIDMUNG.zeile);
    assert.ok(zeile, `${v.name}: Widmungszeile fehlt`);
    assert.ok(zeile.y > g.y + g.size, `${v.name}: Widmungszeile steht nicht unter dem Portrait`);
    for (const t of p.texte) assert.ok(t.x >= 0 && t.x <= v.w && t.y > 0 && t.y <= v.h, `${v.name}: Text außerhalb`);
  }
});

test('Die Bildgröße ist auf beiden Ansichten dieselbe (keine geschrumpfte Winzmatrix)', () => {
  for (const v of VIEWS) {
    const k = abspannLayout(v, 0).kacheln[0];
    assert.equal(k.size, 96, `${v.name}: ${k.size}px`);
    const g = abspannLayout(v, ABSPANN_SEITEN - 1).widmung;
    assert.equal(g.size, 96, `${v.name}: Widmung ${g.size}px`);
    // Das Portrait ist größer als die halbe Bildhöhe — sonst ist es keine Filmfolge.
    assert.ok(k.size >= v.h * 0.4, `${v.name}: Portrait nur ${k.size}px bei ${v.h}px Höhe`);
  }
});

test('Die Seiten sind unterscheidbar: jede zeigt andere Bildpunkte', () => {
  const spur = [];
  for (let seite = 0; seite < ABSPANN.length; seite++) {
    const p = protokoll();
    const L = zeichneAbspann(p.ctx, VIEWS[0], { seite });
    const k = L.kacheln[0];
    const muster = p.rects.filter((r) => r.x >= k.x && r.x < k.x + k.size && r.y >= k.y && r.y < k.y + k.size)
      .map((r) => `${r.x - k.x},${r.y - k.y},${r.stil}`).join(';');
    spur.push(muster);
  }
  assert.equal(new Set(spur).size, 9, 'zwei Seiten zeigen dieselben Bildpunkte');
});

test('Ein unbekanntes Portrait zeichnet nichts (kein stiller Blindgänger)', () => {
  const p = protokoll();
  assert.equal(zeichnePortrait(p.ctx, 'gibt-es-nicht', 0, 0, 'bild'), 0);
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
  assert.match(main, /function abspannZu\(\) \{\s*show\(abspannHerkunft === 'title' \? 'title' : 'reward'/);
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
