// credits.js — der Abspann: neun Portraits mit Vornamen, dazu die Widmung.
//
// Bewusst DOM-frei: gezeichnet wird auf einen übergebenen 2D-Kontext, damit
// dieselben Funktionen im Browser und in den Node-Tests laufen (wie bei
// src/motorrad-art.js). Die Bildpunkte kommen aus src/credits-portraits.js —
// keine PNG-Dateien, damit das Spiel auch per file:// ohne Server läuft.
//
// Inhaltlicher Rahmen: nur Vornamen der Kolleginnen und Kollegen, keine
// Nachnamen, keine Funktionsbezeichnungen, keine Rollenangaben. Die einzige
// Ausnahme ist die Widmung an den Geehrten — er steht ausdrücklich nicht in
// der Liste der Kollegen.
import { PORTRAITS, PORTRAIT_PALETTE, PORTRAIT_KLEIN, PORTRAIT_GROSS } from './credits-portraits.js';

/** Der Abspann hat zwei Seiten: erst die Kollegen, dann die Widmung. */
export const ABSPANN_SEITEN = 2;

/** Neun Kolleginnen und Kollegen — nur Vornamen. */
export const ABSPANN = [
  { name: 'ANNA', portrait: 'anna' },
  { name: 'NICOLA', portrait: 'nicola' },
  { name: 'AOI', portrait: 'aoi' },
  { name: 'BARBARA', portrait: 'barbara' },
  { name: 'ANNEKATRIN', portrait: 'annekatrin' },
  { name: 'ANNETT', portrait: 'annett' },
  { name: 'CHENYAN', portrait: 'chenyan' },
  { name: 'ROLAND', portrait: 'roland-r' },
  { name: 'BRUNO', portrait: 'bruno' },
];

/** Die Widmung: der Geehrte, groß, mit einer Zeile darunter. */
export const WIDMUNG = {
  portrait: 'roland-s',
  zeile: 'FÜR ROLAND SCHREIBER',
  raster: 'gross',
};

export const ABSPANN_TITEL = 'DER RASENDE ROLAND';
export const ABSPANN_UEBERSCHRIFT = 'ABSPANN';
export const ABSPANN_HINWEIS = 'LEERTASTE ODER KLICK: WEITER · ESC: ZURÜCK';
export const ABSPANN_HINWEIS_KOMPAKT = 'KLICK: WEITER · ESC: ZURÜCK';
/** Beschriftung des Rückwegs ins Spiel (main.js setzt sie je Herkunft). */
export const ABSPANN_ZURUECK = 'ZURÜCK ZUM ERGEBNIS';
export const ABSPANN_ZURUECK_TITEL = 'ZURÜCK ZUM TITEL';
export const ABSPANN_WEITER = 'WEITER →';

/** Farben des Abspanns (Spielpalette). */
export const ABSPANN_FARBEN = {
  grund: '#0b0810',
  ueberschrift: '#8e8e9c',
  titel: '#e8c46a',
  name: '#f0eee4',
  hinweis: '#8e8e9c',
  widmung: '#e8c46a',
  rahmen: '#3a3a4a',
};

/** Alle Vornamen des Abspanns in Reihenfolge der Kacheln. */
export function abspannNamen() {
  return ABSPANN.map((k) => k.name);
}

/**
 * Zeichnet ein Portrait als Pixel (ein fillRect je gleichfarbigem Lauf).
 * @returns Anzahl tatsächlich gesetzter Bildpunkte (0 = nichts gezeichnet).
 */
export function zeichnePortrait(ctx, key, x, y, raster = 'klein') {
  const satz = PORTRAITS[key];
  const rows = satz ? satz[raster] : null;
  if (!rows) return 0;
  let punkte = 0;
  for (let ry = 0; ry < rows.length; ry++) {
    const row = rows[ry];
    let rx = 0;
    while (rx < row.length) {
      const ch = row[rx];
      let n = 1;
      while (rx + n < row.length && row[rx + n] === ch) n++;
      const farbe = PORTRAIT_PALETTE[ch];
      if (farbe) {
        ctx.fillStyle = farbe;
        ctx.fillRect(x + rx, y + ry, n, 1);
        punkte += n;
      }
      rx += n;
    }
  }
  return punkte;
}

/** Rasterkante eines Portraits im Abspann (Kachel bzw. Widmungsbild). */
export function portraitKante(raster = 'klein') {
  return raster === 'gross' ? PORTRAIT_GROSS : PORTRAIT_KLEIN;
}

/**
 * Layout einer Abspannseite — reine Rechnung, ohne Zeichnen.
 * Zwei Bildgrößen: 384 × 216 (Rechner) und 256 × 144 (Touch). Auf der kleinen
 * Ansicht rücken die Kacheln enger zusammen, statt kleiner zu werden — so
 * bleiben die Bildpunkte im Verhältnis 1:1 und werden nicht verwaschen.
 */
export function abspannLayout(view, seite = 0) {
  const w = view.w, h = view.h;
  const kompakt = w < 320;
  const s = seite === 1 ? 1 : 0;
  const farben = ABSPANN_FARBEN;
  const kante = portraitKante('klein');
  const grund = {
    seite: s, seiten: ABSPANN_SEITEN, w, h, kompakt, farben,
    ueberschrift: {
      text: ABSPANN_UEBERSCHRIFT, size: kompakt ? 5 : 6,
      x: Math.round(w / 2), y: kompakt ? 10 : 13,
    },
    titel: {
      text: ABSPANN_TITEL, size: kompakt ? 7 : 10,
      x: Math.round(w / 2), y: kompakt ? 22 : 30,
    },
    hinweis: {
      text: kompakt ? ABSPANN_HINWEIS_KOMPAKT : ABSPANN_HINWEIS,
      size: kompakt ? 5 : 6, x: Math.round(w / 2), y: kompakt ? h - 6 : h - 10,
    },
    kacheln: [],
    widmung: null,
  };
  if (s === 1) {
    const g = portraitKante(WIDMUNG.raster);
    grund.widmung = {
      portrait: WIDMUNG.portrait, raster: 'gross', size: g,
      x: Math.round((w - g) / 2), y: kompakt ? 32 : 46,
      nameX: Math.round(w / 2), nameY: kompakt ? 102 : 126,
      sizeSchrift: kompakt ? 7 : 10, text: WIDMUNG.zeile,
    };
    return grund;
  }
  const spalten = 3;
  const pitchX = kompakt ? 32 : 40;
  const pitchY = kompakt ? 34 : 42;
  const startY = kompakt ? 28 : 46;
  const breite = (spalten - 1) * pitchX + kante;
  const x0 = Math.round((w - breite) / 2);
  const nameSize = kompakt ? 5 : 6;
  ABSPANN.forEach((k, i) => {
    const c = i % spalten, r = Math.floor(i / spalten);
    const x = x0 + c * pitchX;
    const y = startY + r * pitchY;
    grund.kacheln.push({
      name: k.name, portrait: k.portrait, size: kante, raster: 'klein',
      x, y, c, r, spalten,
      nameX: x + Math.round(kante / 2), nameY: y + kante + (kompakt ? 8 : 10),
      sizeSchrift: nameSize, pitchX, pitchY,
    });
  });
  return grund;
}

/**
 * Zeichnet eine ganze Abspannseite auf den Kontext.
 * @returns das benutzte Layout — die Kacheln tragen zusätzlich `gezeichnet`,
 *          die Anzahl der wirklich gemalten Bildpunkte (Nachweis der Sichtbarkeit).
 */
export function zeichneAbspann(ctx, view, opts = {}) {
  const L = abspannLayout(view, opts.seite);
  ctx.save();
  if ('textAlign' in ctx) ctx.textAlign = 'center';
  if ('textBaseline' in ctx) ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = L.farben.grund;
  ctx.fillRect(0, 0, L.w, L.h);
  ctx.fillStyle = L.farben.ueberschrift;
  ctx.font = `${L.ueberschrift.size}px monospace`;
  ctx.fillText(L.ueberschrift.text, L.ueberschrift.x, L.ueberschrift.y);
  ctx.fillStyle = L.farben.titel;
  ctx.font = `bold ${L.titel.size}px monospace`;
  ctx.fillText(L.titel.text, L.titel.x, L.titel.y);
  if (L.widmung) {
    const g = L.widmung;
    g.gezeichnet = zeichnePortrait(ctx, g.portrait, g.x, g.y, g.raster);
    ctx.fillStyle = L.farben.widmung;
    ctx.font = `bold ${g.sizeSchrift}px monospace`;
    ctx.fillText(g.text, g.nameX, g.nameY);
  } else {
    for (const k of L.kacheln) {
      k.gezeichnet = zeichnePortrait(ctx, k.portrait, k.x, k.y, k.raster);
      ctx.fillStyle = L.farben.name;
      ctx.font = `${k.sizeSchrift}px monospace`;
      ctx.fillText(k.name, k.nameX, k.nameY);
    }
  }
  ctx.fillStyle = L.farben.hinweis;
  ctx.font = `${L.hinweis.size}px monospace`;
  ctx.fillText(L.hinweis.text, L.hinweis.x, L.hinweis.y);
  ctx.restore();
  return L;
}
