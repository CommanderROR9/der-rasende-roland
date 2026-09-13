// credits.js — der Abspann: eine Filmfolge aus neun Portraits mit Vornamen, dazu
// die Widmung an den Geehrten als eigene Seite.
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
import { PORTRAITS, PORTRAIT_PALETTE, PORTRAIT_KANTE } from './credits-portraits.js';

/** Der Abspann hat eine Seite je Portrait plus die Widmung. */
export const ABSPANN_SEITEN = 10;

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

/** Die Widmung: der Geehrte, mit einer Zeile darunter. */
export const WIDMUNG = {
  portrait: 'roland-s',
  zeile: 'FÜR ROLAND SCHREIBER',
  raster: 'bild',
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
export function zeichnePortrait(ctx, key, x, y, raster = 'bild') {
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
export function portraitKante(raster = 'bild') {
  return PORTRAIT_KANTE;
}

/**
 * Layout einer Abspannseite — reine Rechnung, ohne Zeichnen.
 * Die Filmfolge zeigt eine Seite je Portrait; die letzte Seite ist die Widmung.
 * Die Portraits werden in voller Rasterkante (96 × 96) gezeichnet — nicht
 * verkleinert, damit keine Bildpunkte verschwinden. Auf der kleinen Ansicht
 * (256 × 144) rücken Titel und Name zusammen, das Portrait bleibt gleich groß;
 * die Anzeige skaliert der Browser ganzzahlig (image-rendering: pixelated).
 */
export function abspannLayout(view, seite = 0) {
  const w = view.w, h = view.h;
  const kompakt = w < 320;
  const s = Math.max(0, Math.min(ABSPANN_SEITEN - 1, Math.round(seite) || 0));
  const farben = ABSPANN_FARBEN;
  const kante = portraitKante('bild');
  const x = Math.round((w - kante) / 2);
  const y = kompakt ? 25 : 56;
  const nameGap = kompakt ? 10 : 13;
  const grund = {
    seite: s, seiten: ABSPANN_SEITEN, w, h, kompakt, farben,
    ueberschrift: {
      text: ABSPANN_UEBERSCHRIFT, size: kompakt ? 5 : 6,
      x: Math.round(w / 2), y: kompakt ? 9 : 13,
    },
    titel: {
      text: ABSPANN_TITEL, size: kompakt ? 7 : 10,
      x: Math.round(w / 2), y: kompakt ? 21 : 30,
    },
    hinweis: {
      text: kompakt ? ABSPANN_HINWEIS_KOMPAKT : ABSPANN_HINWEIS,
      size: kompakt ? 5 : 6, x: Math.round(w / 2), y: kompakt ? h - 3 : h - 10,
    },
    kacheln: [],
    widmung: null,
  };
  if (s === ABSPANN_SEITEN - 1) {
    grund.widmung = {
      portrait: WIDMUNG.portrait, raster: WIDMUNG.raster, size: kante,
      x, y, nameX: Math.round(w / 2), nameY: y + kante + nameGap,
      sizeSchrift: kompakt ? 7 : 10, text: WIDMUNG.zeile,
    };
    return grund;
  }
  const k = ABSPANN[s];
  grund.kacheln.push({
    name: k.name, portrait: k.portrait, size: kante, raster: 'bild',
    x, y, c: 0, r: 0, spalten: 1,
    nameX: Math.round(w / 2), nameY: y + kante + nameGap,
    sizeSchrift: kompakt ? 5 : 6,
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
