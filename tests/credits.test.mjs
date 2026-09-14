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
  ABSPANN_ZURUECK, ABSPANN_ZURUECK_TITEL, ABSPANN_WEITER, ABSPANN_FARBEN,
  WIDMUNG, abspannBeschriftungen, abspannLayout, abspannNamen, zeichneAbspann, zeichnePortrait, portraitKante,
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
  anna: '015e2ac0f7940e3f4a0188bb9f37e934c6f24e05ed7054685747a8530a83f6b9',
  aoi: '90c0c2870ae9b17541685cddef3a2f875f0c7bd970cedd4ca18eb959584a913d',
  barbara: 'a9dbc5c1dbab126757761164cf9c64e8d46b39c6b3735ddcecf39deeca54eeea',
  nicola: '9fafe76bb35b39ec59838fc16e648445d7e21c5d8f02cfd9440edbcdbca48d08',
  annekatrin: 'f8fd1b5b34e73d02497d331cc84c929117f6c8da797f4148cf1408c41b641158',
  'roland-r': 'ac202486a9ff7b0169d0841771a345be981d5ea5c24d38a2b0af32568f8a8f38',
  chenyan: '875634041dc7d6bfd8af921e1e6a357a8589b787e3ae354843847249173f35ec',
  annett: '6afcc248dafd5ea83f72dfff337946098d892ac7ee410a94c8ab00ce62ad1b80',
  bruno: '581c604f8d86e24f948a7267665c9b7eae45a31b54d5a2a337c7bf26751d725d',
  'roland-s': '667190caa171736a2b0936c3908d5789a979fc0cca037feaf9c4ea71ba6f2a76',
};

/** Farbpunkte je Portrait laut Erzeugungsprotokoll (Nachweis unveränderter Daten). */
const FARBPUNKTE = {
  anna: 5005, aoi: 5002, barbara: 5626, nicola: 3183, annekatrin: 4548,
  'roland-r': 5931, chenyan: 4782, annett: 3403, bruno: 3723, 'roland-s': 5839,
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

/**
 * Alle Texte, die der Abspann überhaupt in den Canvas zeichnet. Seit F2 gehören
 * die Namentexte ausdrücklich NICHT dazu — sie liegen in der Textebene
 * (abspannBeschriftungen) und werden dort in echter Auflösung gerendert.
 */
function alleCanvasTexte() {
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

/** Alle Namentexte des Abspanns als DOM-Beschriftungen (F2), beide Ansichten. */
function alleTextDaten() {
  const daten = [];
  for (const v of VIEWS) {
    for (let s = 0; s < ABSPANN_SEITEN; s++) daten.push(...abspannBeschriftungen(v, s));
  }
  return daten;
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
  const canvasTexte = alleCanvasTexte();
  const daten = alleTextDaten();
  const namen = new Set(abspannNamen());
  // Funktions- und Rollenbezeichnungen dürfen im Abspann nicht vorkommen —
  // weder im Bild noch in der Textebene.
  const verboten = [
    'VIOLINE', 'VIOLIN', 'GEIGE', 'GEIGER', 'BRATSCHE', 'CELLO', 'KONZERTMEISTER',
    'DIRIGENT', 'ORCHESTER', 'MUSIKER', 'SOLIST', 'STIMMFÜHRER', 'TUTTI', 'PULT',
    'MASKE', 'BÜHNENTECHNIK', 'TONMEISTER', 'INSTRUMENT', 'NOTENWART', 'ARCHIV',
  ];
  for (const t of [...canvasTexte, ...daten.map((d) => d.text)]) {
    for (const wort of verboten) {
      assert.ok(!t.toUpperCase().includes(wort), `"${t}" enthält die Rollenangabe ${wort}`);
    }
  }
  // Die Namentexte der Textebene: nur Vornamen, dazu die Widmung.
  const textTexte = daten.map((d) => d.text);
  for (const name of namen) {
    assert.ok(textTexte.includes(name), `Vorname ${name} steht nicht in der Textebene`);
  }
  for (const t of textTexte) {
    if (t === WIDMUNG.zeile) continue;
    assert.match(t, /^[A-ZÄÖÜ]+$/, `"${t}" ist kein einzelner Vorname`);
    assert.ok(!t.includes(' '), `"${t}" enthält ein Leerzeichen (Nachname?)`);
    // Ein Nachname wäre ein zweites Wort in Großbuchstaben hinter einem Vornamen.
    assert.ok(!/^[A-ZÄÖÜ]{3,}\s+[A-ZÄÖÜ]{3,}$/.test(t), `"${t}" sieht nach Nachname aus`);
  }
  // Gegenprobe zur Prüfung selbst: alle neun Vornamen sind Namentexte.
  assert.equal(new Set(textTexte.filter((t) => namen.has(t))).size, 9, 'nicht alle Vornamen sind Namentexte');
  // F2: kein Vorname darf als Canvas-Schrift zurückkommen.
  for (const name of namen) {
    assert.ok(!canvasTexte.includes(name), `Vorname ${name} wird wieder in den Canvas gezeichnet`);
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
  // Nur die Widmungszeile nennt den Geehrten — und sie liegt in der Textebene.
  const widmungsTexte = alleTextDaten().filter((d) => d.text.includes('SCHREIBER'));
  assert.deepEqual([...new Set(widmungsTexte.map((d) => d.text))], ['FÜR ROLAND SCHREIBER'],
    `${widmungsTexte.map((d) => d.text).join(' | ')}`);
  assert.ok(!alleCanvasTexte().some((t) => t.includes('SCHREIBER')),
    'die Widmung wird wieder in den Canvas gezeichnet');
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
      // Der Vorname steht unter dem Portrait: seit F2 als DOM-Beschriftung in
      // der Textebene, ausdrücklich NICHT mehr als Canvas-Schrift.
      assert.ok(!p.texte.some((t) => t.text === k.name),
        `${v.name}/${k.name}: Vorname liegt wieder im Canvas`);
      const texte = abspannBeschriftungen(v, seite);
      assert.equal(texte.length, 1, `${v.name}/Seite ${seite}: ${texte.length} Namentexte`);
      const eintrag = texte[0];
      assert.equal(eintrag.id, 'abspann-name', `${k.name}: Kennung ${eintrag.id}`);
      assert.equal(eintrag.text, k.name, `${k.name}: Textebene zeigt ${eintrag.text}`);
      assert.equal(eintrag.color, ABSPANN_FARBEN.name, `${k.name}: Farbe ${eintrag.color}`);
      assert.equal(eintrag.align, 'center', `${k.name}: Ausrichtung ${eintrag.align}`);
      assert.equal(eintrag.x + eintrag.w / 2, k.nameX, `${k.name}: Textebene nicht mittig`);
      // Die Box beginnt an der Portraitunterkante und bleibt im Bild.
      assert.ok(eintrag.y >= k.y + k.size, `${k.name}: Box beginnt über der Portraitunterkante`);
      assert.ok(eintrag.y + eintrag.h <= v.h, `${k.name}: Box ragt aus dem Bild`);
      assert.ok(eintrag.fontSize > 0 && eintrag.h > 0 && eintrag.w > 0, `${k.name}: Masse fehlen`);
      // Genau ein Vorname je Seite - kein Raster mehr.
      assert.equal(texte.filter((e) => abspannNamen().includes(e.text)).length, 1,
        `${v.name}/Seite ${seite}: ${texte.length} Vornamen in der Textebene`);
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
    // Die Widmungszeile liegt seit F2 in der Textebene, nicht im Bild.
    assert.ok(!p.texte.some((t) => t.text === WIDMUNG.zeile),
      `${v.name}: Widmungszeile liegt wieder im Canvas`);
    const texte = abspannBeschriftungen(v, ABSPANN_SEITEN - 1);
    assert.equal(texte.length, 1, `${v.name}: ${texte.length} Namentexte auf der Widmungsseite`);
    assert.equal(texte[0].id, 'abspann-widmung');
    assert.equal(texte[0].text, WIDMUNG.zeile, `${v.name}: Textebene zeigt ${texte[0].text}`);
    assert.equal(texte[0].color, ABSPANN_FARBEN.widmung, `${v.name}: Widmungsfarbe ${texte[0].color}`);
    assert.ok(texte[0].y >= g.y + g.size, `${v.name}: Widmungsbox beginnt über der Portraitunterkante`);
    assert.ok(texte[0].y + texte[0].h <= v.h, `${v.name}: Widmungsbox ragt aus dem Bild`);
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

/**
 * P2 (Karte t_cb2daaff, Branch feature/abspann-putz): die bereinigten Stellen.
 * Roland hat weiße Punkte auf den Abspann-Portraits gemeldet; diese Koordinaten sind
 * nach dem Putz leer (Kategorie A: Hintergrundrest) oder mit der umgebenden Farbe
 * gefüllt (Kategorie B: Sprenkel). Der Test nagelt fest, dass dort kein heller
 * Bildpunkt zurückkommt — mit dem Stand vor dem Putz wird er rot.
 */
const BEREINIGTE_STELLEN = {
  chenyan: [[36, 6], [37, 6], [90, 77], [92, 82], [84, 72]],
  anna: [[81, 36], [80, 37], [78, 38], [76, 39], [75, 40], [69, 44], [65, 46], [66, 46], [64, 47], [61, 49], [56, 52], [46, 59], [39, 63], [35, 66], [34, 67], [33, 68], [13, 76], [88, 79]],
  aoi: [[61, 79], [62, 79], [22, 51], [54, 51], [87, 62]],
  barbara: [[59, 37], [59, 38], [26, 53], [26, 54], [40, 38], [54, 38], [83, 40], [73, 47]],
  annekatrin: [[40, 42]],
  annett: [[64, 37], [64, 38], [52, 44], [80, 78]],
  bruno: [[87, 61], [87, 62], [77, 60], [38, 8]],
  'roland-s': [[86, 84], [87, 84], [87, 85], [54, 44], [54, 45], [56, 32], [76, 73]],
};

/** Luminanz eines Palettenzeichens (Leerzeichen = leer). */
function zeichenLuminanz(ch) {
  if (ch === ' ') return 0;
  const hex = PORTRAIT_PALETTE[ch];
  assert.ok(hex, `unbekanntes Zeichen "${ch}"`);
  const v = parseInt(hex.slice(1), 16);
  return 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
}

test('P2: bereinigte Stellen sind nicht mehr hell (>200)', () => {
  let geprueft = 0;
  for (const [name, stellen] of Object.entries(BEREINIGTE_STELLEN)) {
    const bild = PORTRAITS[name].bild;
    for (const [x, y] of stellen) {
      const ch = bild[y][x];
      const lum = zeichenLuminanz(ch);
      assert.ok(lum <= 200,
        `${name} (${x},${y}): Zeichen "${ch}" ist wieder hell (Luminanz ${lum.toFixed(0)} > 200)`);
      geprueft += 1;
    }
  }
  assert.equal(geprueft, 52, `${geprueft} bereinigte Stellen geprüft statt 52`);
});

console.log(`${passed} Abspann-Tests bestanden`);
