// cutscene-einstieg.js — die Einstiegs-Cutscenes vor den Fahr-Interludien (Auftrag CUT-2).
//
// Zwei kurze, wortlose Szenen: vor dem Cabrio-Interludium nimmt die Figur den
// Autoschlüssel, öffnet die Tür und steigt ein; vor der Motorrad-Nachtfahrt
// setzt sie den Helm auf und steigt auf. Beide Szenen hängen an genau einem
// Auslöser (dem Start des Interludiums, siehe `einstiegStarten`) und je einem
// Merker im Spielstand: spielbar genau einmal je Fahrzeug, kein zweiter Lauf.
//
// Sie bauen die Interludien nicht um: die Fahrt bleibt unverändert (der Racer
// wird während der Szene nur nicht aktualisiert und läuft danach weiter), die
// Fahrzeug-Art bleibt unberührt. Der Himmel kommt aus den vorhandenen Zeichnern
// der Interludien (`drawJourneySky` / `drawNightSky`) über eine Kulisse in der
// Form des Racers, damit die Szene dort aussieht, wo die Fahrt beginnt. Die
// Figur und ihre Farben sind wiederverwendet (`sprites.js`, `OUTFIT_PALETTES`).
//
// Farbe: alle neuen Matrizen benutzen Zeichen der Palette aus config.js (`PAL`);
// ein Leerzeichen ist durchsichtig, alles andere eine feste Farbe. Kein DOM beim
// Import — dieselbe Logik läuft in Node in den Tests.

import { PAL } from './config.js';
import { SPRITES, OUTFIT_PALETTES } from './sprites.js';
import { spriteCanvas, blit } from './render.js';
import { drawJourneySky } from './cabrio-art.js';
import { drawNightSky } from './motorrad-art.js';

/** Merker im Spielstand: jede Szene läuft genau einmal (main.js schreibt sie). */
export const EINSTIEG_MERKER = {
  cabrio: 'cutEinstiegCabrio',
  motorrad: 'cutEinstiegMotorrad',
};

/** Dauer je Szene in Sekunden (Rolands Rahmen: 2–4 s). */
export const EINSTIEG_DAUER = { cabrio: 4.0, motorrad: 3.6 };

/** Kluft, in der die Figur in die Szene geht (je Fahrzeug, siehe Bericht). */
export const EINSTIEG_OUTFIT = { cabrio: 'frack', motorrad: 'schwarz' };

/**
 * Die sichtbaren Abschnitte je Szene — auch die Prüfungen lesen sie.
 * Cabrio: Schlüssel nehmen → Tür öffnen → einsteigen → Tür zu.
 * Motorrad: Helm aufsetzen → aufsteigen → sitzen.
 */
export const EINSTIEG_BEATS = {
  cabrio: [
    { name: 'gehen', bis: 1.10 },        // vom Bildrand zur Fahrertür
    { name: 'schluessel', bis: 1.75 },   // Schlüssel in der Hand
    { name: 'tuer', bis: 2.30 },         // Tür auf
    { name: 'einsteigen', bis: 3.20 },   // hinein in den Wagen
    { name: 'zu', bis: 4.00 },           // Tür zu, Ende
  ],
  motorrad: [
    { name: 'gehen', bis: 0.90 },        // zur Maschine
    { name: 'helm', bis: 1.80 },         // Helm vom Sitz, aufsetzen
    { name: 'aufsteigen', bis: 2.70 },   // Bein über die Maschine
    { name: 'sitzen', bis: 3.60 },       // sitzen, Ende
  ],
};

// Die Zeitpunkte, an denen die Szene sichtbar umschaltet (auch die Prüfungen
// lesen sie): vorher steht das Fahrzeug zu bzw. die Figur ist draußen.
export const CABRIO_TUER_AB = 1.95;      // die Tür geht auf
export const CABRIO_TUER_BIS = 2.30;     // die Tür steht ganz offen
export const CABRIO_WEG_AB = 2.85;       // Figur ist im Wagen verschwunden
export const CABRIO_FAHRER_AB = 2.85;    // der Fahrer ist im Wagen zu sehen
export const CABRIO_SCHLIESS_AB = 3.20;  // die Tür geht wieder zu
export const CABRIO_ZU_BIS = 3.55;       // die Tür ist zu
export const MOTORRAD_GREIF_AB = 0.90;   // Helm vom Sitz greifen
export const MOTORRAD_HELM_AB = 1.50;    // der Helm sitzt auf dem Kopf
export const MOTORRAD_SITZT_AB = 2.45;   // die Figur sitzt auf der Maschine
/** Breite der Türöffnung, wenn die Tür ganz offen steht. */
export const TUER_WEITE = 24;

// ---------------------------------------------------------------- Zwischenbilder --
// Ein kleiner Maler: Rechtecke und Kreise auf eine Fläche der Palette.
function maler(w, h, malen) {
  const zeilen = Array.from({ length: h }, () => Array(w).fill(' '));
  const rechteck = (x, y, breite, hoehe, zeichen) => {
    for (let j = Math.max(0, y); j < Math.min(h, y + hoehe); j++) {
      for (let i = Math.max(0, x); i < Math.min(w, x + breite); i++) zeilen[j][i] = zeichen;
    }
  };
  const kreis = (cx, cy, r, zeichen) => {
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
      rechteck(cx - dx, cy + dy, 2 * dx + 1, 1, zeichen);
    }
  };
  malen({ rechteck, kreis });
  return zeilen.map((zeile) => zeile.join(''));
}

// Das Cabrio von der Seite, Verdeck offen, Nase nach rechts, Tür zu.
// Rot ist `PAL.R` („Cabrio-Rot"), dunkle Zeichen sind Reifen und Fenster, 'o'
// setzt die warmen Lichtkanten (kein Teal: 'c' wäre in dieser Palette türkis
// und passt nicht zu einem roten Wagen).
// Aufbau: Beltline ist Zeile 15, darüber das offene Cockpit mit Sitzen und
// Windschutzscheibe, darunter das Blech. Die Räder kommen zuletzt, damit sie
// in den Radhäusern stehen und nicht im Blech verschwinden.
export const CABRIO_SEITE = maler(100, 26, ({ rechteck, kreis }) => {
  rechteck(30, 11, 30, 4, '.');           // offenes Cockpit über der Beltline
  rechteck(33, 10, 4, 5, 'd');            // Sitzlehne
  rechteck(37, 13, 10, 2, 'd');           // Sitzfläche
  rechteck(52, 11, 4, 3, 'g');            // Lenkrad
  rechteck(58, 5, 4, 10, 'a');            // Windschutzscheibe
  rechteck(59, 7, 2, 7, 'G');
  rechteck(55, 3, 6, 2, 'a');             // Rückspiegel
  rechteck(8, 14, 22, 1, 'o');            // Kofferraumkante im Licht
  rechteck(64, 14, 30, 1, 'o');           // Haubenkante im Licht
  rechteck(2, 15, 96, 6, 'R');            // Karosserie und Türen
  rechteck(2, 19, 96, 2, 'r');            // Unterkante
  rechteck(0, 16, 4, 5, 'R');             // Heck
  rechteck(96, 16, 4, 5, 'R');            // Front
  rechteck(33, 15, 1, 6, 'd');            // Türfuge hinten
  rechteck(57, 15, 1, 6, 'd');            // Türfuge vorn
  rechteck(36, 16, 4, 2, 'G');            // Türgriff
  rechteck(2, 16, 3, 3, 'o');             // Rückleuchte
  rechteck(3, 17, 2, 1, 'O');
  rechteck(93, 16, 5, 3, 'y');            // Scheinwerfer
  rechteck(94, 17, 2, 1, 'w');
  kreis(22, 20, 5, 'b'); kreis(22, 20, 3, 'K'); kreis(22, 20, 1, 'G');
  kreis(76, 20, 5, 'b'); kreis(76, 20, 3, 'K'); kreis(76, 20, 1, 'G');
});

// Dasselbe Cabrio, Tür wieder zu — und der Fahrer sitzt drin: Kopf und Schultern
// stehen über der Beltline, wie im Fahrbild von hinten.
export const CABRIO_BESETZT = maler(100, 26, ({ rechteck, kreis }) => {
  rechteck(30, 11, 30, 4, '.');
  rechteck(33, 10, 4, 5, 'd');
  rechteck(37, 13, 10, 2, 'd');
  rechteck(52, 11, 4, 3, 'g');
  rechteck(58, 5, 4, 10, 'a');
  rechteck(59, 7, 2, 7, 'G');
  rechteck(55, 3, 6, 2, 'a');
  rechteck(8, 14, 22, 1, 'o');
  rechteck(64, 14, 30, 1, 'o');
  rechteck(2, 15, 96, 6, 'R');
  rechteck(2, 19, 96, 2, 'r');
  rechteck(0, 16, 4, 5, 'R');
  rechteck(96, 16, 4, 5, 'R');
  rechteck(33, 15, 1, 6, 'd');
  rechteck(57, 15, 1, 6, 'd');
  rechteck(36, 16, 4, 2, 'G');
  rechteck(41, 12, 9, 4, 'w');            // Schultern im Wagen
  rechteck(45, 6, 6, 7, 'h');             // Kopf mit Silberhaar
  rechteck(46, 6, 4, 2, 'H');
  rechteck(2, 16, 3, 3, 'o');
  rechteck(3, 17, 2, 1, 'O');
  rechteck(93, 16, 5, 3, 'y');
  rechteck(94, 17, 2, 1, 'w');
  kreis(22, 20, 5, 'b'); kreis(22, 20, 3, 'K'); kreis(22, 20, 1, 'G');
  kreis(76, 20, 5, 'b'); kreis(76, 20, 3, 'K'); kreis(76, 20, 1, 'G');
});

// Das offene Türblatt gibt es nicht als eigenes Bild: die Türöffnung wächst in
// der Szene als dunkle Fläche zwischen den Fugen auf (siehe `tuerWeite`) — so
// sieht man die Tür wirklich aufgehen und am Ende wieder zufallen.

// Der Schlüsselbund: Ring, Schlüssel, ein Glanzpunkt.
export const SCHLUESSEL = [
  '  yy  ',
  ' y..y ',
  ' y..Yy',
  '  YYy ',
  '   Yy ',
];

// Das Motorrad von der Seite, Nase nach rechts, auf dem Seitenständer.
// 44 × 22 bei einer Figur von 24 px: die Maschine ist niedriger als die Figur.
export const MOTORRAD_SEITE = maler(44, 22, ({ rechteck, kreis }) => {
  kreis(10, 16, 5, 'b'); kreis(10, 16, 3, 'K'); rechteck(9, 15, 2, 2, 'G');
  kreis(34, 16, 5, 'b'); kreis(34, 16, 3, 'K'); rechteck(33, 15, 2, 2, 'G');
  rechteck(5, 12, 10, 3, 'a');            // Heck und Fender
  rechteck(7, 9, 11, 3, 'd');             // Sitzbank
  rechteck(7, 9, 11, 1, 'K');
  rechteck(18, 8, 9, 5, 'R');             // Tank
  rechteck(18, 8, 9, 1, 'O');             // Kante im Licht
  rechteck(15, 13, 16, 3, 'd');           // Rahmen
  rechteck(29, 5, 7, 2, 'g');             // Lenker
  rechteck(30, 6, 3, 2, 'd');             // Griff
  rechteck(33, 7, 2, 9, 'g');             // Gabel
  rechteck(35, 9, 5, 5, 'y');             // Scheinwerfer
  rechteck(36, 10, 2, 2, 'w');
  rechteck(4, 14, 11, 3, 'G');            // Auspuff
  rechteck(12, 16, 2, 4, 'g');            // Seitenständer
  rechteck(10, 20, 4, 1, 'g');
  rechteck(5, 11, 3, 2, 'o');             // Rücklicht
  rechteck(5, 11, 3, 1, 'O');
});

// Der Helm: helle Schale wie am Fahrer im Fahrbild, dunkles Visier, roter
// Streifen. Er steht auf dem Sitz, geht in die Hand und dann auf den Kopf.
export const HELM = maler(12, 11, ({ rechteck }) => {
  rechteck(4, 0, 4, 1, 'h');
  rechteck(3, 1, 6, 7, 'h');
  rechteck(2, 3, 8, 5, 'h');
  rechteck(3, 2, 5, 1, 'H');              // Glanz auf der Schale
  rechteck(4, 4, 6, 3, 'a');              // Visier
  rechteck(5, 5, 4, 1, 'g');
  rechteck(4, 8, 5, 1, 'r');              // Streifen
  rechteck(4, 9, 6, 1, 'h');
  rechteck(5, 10, 4, 1, 'a');             // Öffnung unten
});

export const EINSTIEG_SPRITES = {
  cabrio_seite: CABRIO_SEITE,
  cabrio_besetzt: CABRIO_BESETZT,
  schluessel: SCHLUESSEL,
  motorrad_seite: MOTORRAD_SEITE,
  helm: HELM,
};

// ------------------------------------------------- Figuren (wiederverwendet) --
// Der Körper kommt aus sprites.js; Kopf und Beine entstehen hier für die
// Haltungen, die es dort nicht gibt (Helm auf, sitzen).
const IDLE = SPRITES.roland_idle;

/** Kopfbereich (die ersten neun Zeilen) durch den Helm ersetzen. */
const KOPF_HELM = [
  '     hhhh       ',
  '   hhhhhhhh     ',
  '  hhHhhhhhhh    ',
  '  hhhhhhhhhh    ',
  '  hhhhaaaaah    ',
  '  hhhagggaah    ',
  '  hhhhaaaaah    ',
  '  hhrrrrrrhh    ',
  '   hhhhhhhh     ',
];
export function mitHelm(zeilen) {
  return [...KOPF_HELM, ...zeilen.slice(KOPF_HELM.length)];
}

/**
 * Sitzende Haltung: Kopf und Jacke aus dem Standbild, darunter das angewinkelte
 * Bein. Kürzer als der Stand, damit sitzend nicht größer wirkt als stehend.
 */
const SITZ_BEINE = [
  '  aaaaaaaaaa    ',      // Gesäß und Oberschenkel nach vorn
  '    aaaaaaa     ',
  '      aaa       ',      // Knie
  '      bb        ',      // Unterschenkel
  '      bbb       ',      // Stiefel
];
const SITZEN = [...IDLE.slice(0, 13), ...SITZ_BEINE];
const SITZEN_HELM = [...mitHelm(IDLE).slice(0, 13), ...SITZ_BEINE];

export const EINSTIEG_FIGUREN = {
  helm_steht: mitHelm(IDLE),      // steht mit aufgesetztem Helm
  sitzt: SITZEN,                  // sitzt auf der Maschine
  sitzt_helm: SITZEN_HELM,
};

// ------------------------------------------------------------------- Szene --
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;

/** Der Abschnitt, in dem die Szene bei `t` Sekunden steht. */
export function beatBei(fahrzeug, t) {
  const beats = EINSTIEG_BEATS[fahrzeug] || [];
  for (const b of beats) if (t < b.bis) return b.name;
  return beats.length ? beats[beats.length - 1].name : null;
}

/** Läuft die Szene für dieses Fahrzeug noch nicht gelaufen? (Merker im Spielstand) */
export function einstiegMoeglich(fahrzeug, save = {}) {
  const merker = EINSTIEG_MERKER[fahrzeug];
  if (!merker) return false;
  return save[merker] !== true;
}

/** Passt die Szene zu diesem Level? (nur die beiden Fahr-Interludien) */
export function einstiegMoeglichFuerLevel(level) {
  return !!(level && level.mode === 'racer' && level.journey
    && EINSTIEG_MERKER[level.journey.art]);
}

/**
 * Startet die Einstiegs-Cutscene eines Interludiums — der eine Aufruf am Start
 * der Fahrt. Ohne Interludium (oder mit gesetztem Merker) passiert nichts.
 * @returns die Szene oder null
 */
export function einstiegStarten(level, { save = {}, view, events = () => {}, outfit } = {}) {
  const fahrzeug = level && level.mode === 'racer' && level.journey ? level.journey.art : null;
  if (!fahrzeug || !EINSTIEG_MERKER[fahrzeug]) return null;
  if (!einstiegMoeglich(fahrzeug, save)) return null;
  const szene = new EinstiegSzene({ level, view, fahrzeug, outfit });
  // Der Merker fällt beim Start der Szene: sie läuft genau einmal.
  events({ type: 'einstieg', fahrzeug, merker: EINSTIEG_MERKER[fahrzeug], dauer: szene.dauer });
  return szene;
}

export class EinstiegSzene {
  constructor({ level, view, fahrzeug, outfit = null }) {
    this.fahrzeug = fahrzeug;
    this.level = level || null;
    this.vw = (view && view.w) || 384;
    this.vh = (view && view.h) || 216;
    const kluft = outfit || EINSTIEG_OUTFIT[fahrzeug];
    this.outfit = OUTFIT_PALETTES[kluft] ? kluft : 'schwarz';
    this.t = 0;

    // Standlinie, Straße und Fahrzeug aus der Ansicht gerechnet, nicht gesetzt,
    // damit die Szene auf dem Handy (256 × 144) genauso aufgeht wie am Rechner.
    this.boden = Math.round(this.vh * 0.86);
    this.horizont = Math.ceil(this.vh / 2);
    this.strasse = this.boden - Math.round(this.vh * 0.075);
    const rows = this.fahrzeug === 'cabrio' ? CABRIO_SEITE : MOTORRAD_SEITE;
    this.fahrzeugMass = { w: rows[0].length, h: rows.length };
    this.fahrzeugX = Math.round((this.vw - this.fahrzeugMass.w) * 0.60);
    this.fahrzeugY = this.boden - this.fahrzeugMass.h + 1;
  }

  get dauer() { return EINSTIEG_DAUER[this.fahrzeug]; }
  get fertig() { return this.t >= this.dauer; }
  get beat() { return beatBei(this.fahrzeug, this.t); }
  get fortschritt() { return clamp01(this.t / this.dauer); }
  /** Die Szene führt sich selbst: keine Eingabe, kein Skip, nur die Zeit. */
  update(dt) {
    this.t = Math.min(this.dauer, this.t + dt);
    return this.fertig;
  }

  // ------------------------------------------------------------ Stand und Figur --
  /** Die Fahrertür in Fahrzeugkoordinaten (nur das Cabrio hat eine). */
  tuerMass() { return this.fahrzeug === 'cabrio' ? { x: 33, breite: 24 } : { x: 0, breite: 0 }; }
  /** Wo die Figur steht, wenn sie am Fahrzeug angekommen ist. */
  stehX() {
    const t = this.tuerMass();
    const mitte = this.fahrzeugX + t.x + t.breite / 2;
    const rand = this.fahrzeug === 'cabrio' ? 8 : 13;
    return Math.round(mitte - IDLE[0].length + rand);
  }
  /** Anfangsposition: links außerhalb des Bildes. */
  startX() { return -IDLE[0].length - 4; }
  figurX() {
    const beat = this.beat;
    if (beat === 'gehen') {
      const k = clamp01(this.t / EINSTIEG_BEATS[this.fahrzeug][0].bis);
      return Math.round(lerp(this.startX(), this.stehX(), k));
    }
    if (this.fahrzeug === 'cabrio') {
      if (this.t >= CABRIO_WEG_AB) return this.stehX() + 6;
      if (this.t >= EINSTIEG_BEATS.cabrio[3].bis - 0.90) {
        const k = clamp01((this.t - (EINSTIEG_BEATS.cabrio[3].bis - 0.90)) / 0.55);
        return Math.round(lerp(this.stehX(), this.stehX() + 6, k));
      }
      return this.stehX();
    }
    if (this.t >= MOTORRAD_SITZT_AB) return this.stehX() + 5;
    return this.stehX();
  }
  /** Wie tief die Figur beim Einsteigen schon im Wagen steckt. */
  sinkTiefe() {
    if (this.fahrzeug !== 'cabrio') return 0;
    const ab = EINSTIEG_BEATS.cabrio[3].bis - 0.90;
    if (this.t <= ab) return 0;
    return Math.round(clamp01((this.t - ab) / (CABRIO_WEG_AB - ab)) * 10);
  }
  /** Das Cabrio: erst ohne, dann mit Fahrer (die Tür ist davon unabhängig). */
  wagenZustand() {
    if (this.fahrzeug !== 'cabrio') return 'seite';
    return this.t >= CABRIO_FAHRER_AB ? 'besetzt' : 'zu';
  }
  /** Die Türöffnung in Pixeln: 0 = zu, TUER_WEITE = ganz offen. */
  tuerWeite() {
    if (this.fahrzeug !== 'cabrio') return 0;
    if (this.t < CABRIO_TUER_AB) return 0;
    if (this.t < CABRIO_TUER_BIS) {
      return Math.round(TUER_WEITE * clamp01((this.t - CABRIO_TUER_AB) / (CABRIO_TUER_BIS - CABRIO_TUER_AB)));
    }
    if (this.t < CABRIO_SCHLIESS_AB) return TUER_WEITE;
    return Math.round(TUER_WEITE * (1 - clamp01((this.t - CABRIO_SCHLIESS_AB) / (CABRIO_ZU_BIS - CABRIO_SCHLIESS_AB))));
  }
  /** Steht die Figur noch draußen zu sehen? */
  figurDraussen() {
    if (this.fahrzeug === 'cabrio') return this.t < CABRIO_WEG_AB;
    return this.t < MOTORRAD_SITZT_AB;
  }
  /** Ist der Helm auf dem Kopf? */
  helmAuf() { return this.fahrzeug === 'motorrad' && this.t >= MOTORRAD_HELM_AB; }
  /** Sitzt die Figur auf der Maschine? */
  sitztAuf() { return this.fahrzeug === 'motorrad' && this.t >= MOTORRAD_SITZT_AB; }
  /** Die Maschine steht rechts von der Figur. */
  motorradX() { return this.fahrzeugX; }
  /** Der Helm in der Hand: Position oder null (er steht auf dem Sitz oder auf dem Kopf). */
  helmInHand() {
    if (this.fahrzeug !== 'motorrad' || this.helmAuf() || this.t < MOTORRAD_GREIF_AB) return null;
    const k = clamp01((this.t - MOTORRAD_GREIF_AB) / (MOTORRAD_HELM_AB - MOTORRAD_GREIF_AB));
    if (k < 0.5) {
      // vom Sitz greifen
      const kk = clamp01(k / 0.5);
      return {
        x: Math.round(lerp(this.motorradX() + 7, this.stehX() + 12, kk)),
        y: Math.round(lerp(this.fahrzeugY + 4, this.boden - 21, kk)),
      };
    }
    // über den Kopf heben
    const kk = clamp01((k - 0.5) / 0.5);
    return { x: this.stehX() + 2, y: Math.round(lerp(this.boden - 21, this.boden - 33, kk)) };
  }
  /** Die Figur als Daten: was gezeichnet wird und wo — auch für die Prüfungen. */
  figurlage() {
    if (!this.figurDraussen()) return null;
    const x = this.figurX();
    const laufen = this.beat === 'gehen';
    const schritt = laufen ? (Math.floor(this.t * 8) % 2 ? 'gehen2' : 'gehen1') : null;
    if (this.fahrzeug === 'cabrio') {
      const rows = laufen ? (schritt === 'gehen2' ? SPRITES.roland_walk2 : SPRITES.roland_walk1)
        : SPRITES.roland_idle;
      return { x, y: this.boden - IDLE.length + 1 + this.sinkTiefe(), rows,
        art: schritt || 'stehen' };
    }
    if (this.helmAuf()) {
      return { x, y: this.boden - EINSTIEG_FIGUREN.helm_steht.length + 1,
        rows: EINSTIEG_FIGUREN.helm_steht, art: 'helm' };
    }
    const rows = laufen ? (schritt === 'gehen2' ? SPRITES.roland_walk2 : SPRITES.roland_walk1)
      : SPRITES.roland_idle;
    // Beim Aufsteigen hebt sie kurz ab, dann sitzt sie.
    const k = this.sitztAuf() ? 1 : clamp01((this.t - (MOTORRAD_SITZT_AB - 0.65)) / 0.65);
    return { x, y: Math.round(this.boden - rows.length + 1 - (k > 0 ? 2 : 0)), rows,
      art: schritt || 'stehen' };
  }
  /** Die sitzende Figur auf der Maschine. */
  sitzlage() {
    if (!this.sitztAuf()) return null;
    const mitHelm = this.helmAuf();
    const rows = mitHelm ? EINSTIEG_FIGUREN.sitzt_helm : EINSTIEG_FIGUREN.sitzt;
    return { x: this.motorradX() + 7, y: this.boden - rows.length - 6, rows,
      art: mitHelm ? 'sitz-helm' : 'sitz' };
  }
  /** Die Schlüssel sind von „schluessel" bis zum Einsteigen in der Hand. */
  schluesselInHand() {
    return this.fahrzeug === 'cabrio' && this.t >= 1.05 && this.t < CABRIO_WEG_AB;
  }

  // -------------------------------------------------------------- Zeichnen --
  draw(ctx) {
    this.himmel(ctx);
    this.grund(ctx);
    if (this.fahrzeug === 'cabrio') this.zeichneCabrio(ctx);
    else this.zeichneMotorrad(ctx);
  }

  /**
   * Die Kulisse: derselbe Himmel wie am Start der Fahrt. Dafür bekommt der
   * vorhandene Zeichner ein Objekt in der Form des Racers.
   */
  kulisse() {
    const J = (this.level && this.level.journey) || null;
    if (!J) return null;
    return {
      vw: this.vw, vh: this.vh, time: this.t, playerX: 0, rain: false, tunnel: [],
      position: 0, playerZ: 0, trackLength: 1, segments: [{}], imTunnel: () => false,
      level: { journey: J },
    };
  }
  himmel(ctx) {
    const k = this.kulisse();
    if (!k) { ctx.fillStyle = PAL.b; ctx.fillRect(0, 0, this.vw, this.horizont + 2); return; }
    if (this.fahrzeug === 'motorrad') drawNightSky(k, ctx, []);
    else drawJourneySky(k, ctx);
  }
  /** Bordstein und Fahrbahn: flach, damit die Straße im Stand trägt. */
  grund(ctx) {
    const nacht = this.fahrzeug === 'motorrad';
    const y = this.strasse;
    ctx.fillStyle = nacht ? PAL.K : PAL.G;             // Bordstein
    ctx.fillRect(0, y, this.vw, 3);
    // Nachts liegt die Fahrbahn eine Stufe heller als die Reifen ('b'):
    // sonst verschwinden die Räder der Maschine im Asphalt.
    ctx.fillStyle = PAL.a;                             // Fahrbahn
    ctx.fillRect(0, y + 3, this.vw, this.vh - y - 3);
    ctx.fillStyle = PAL.m;                             // Kante zum Bordstein
    ctx.fillRect(0, y + 3, this.vw, 1);
  }
  /**
   * Eine Figur zeichnen. Der Name geht in den Sprite-Cache ein: `spriteCanvas`
   * cacht über (Name + Palette) — ohne eigenen Namen bekämen alle Haltungen
   * dasselbe Bild (der Fahrer säße dann mit dem Standbild im Sattel).
   */
  figur(ctx, rows, x, y, art) {
    blit(ctx, spriteCanvas('einst-figur-' + art, rows, OUTFIT_PALETTES[this.outfit]), x, y);
  }

  zeichneCabrio(ctx) {
    const zustand = this.wagenZustand();
    const rows = zustand === 'besetzt' ? CABRIO_BESETZT : CABRIO_SEITE;
    blit(ctx, spriteCanvas('einst-cabrio-' + zustand, rows), this.fahrzeugX, this.fahrzeugY);
    // Die Tür: die Öffnung wächst zwischen den Fugen auf und fällt am Ende zu.
    const weite = this.tuerWeite();
    if (weite > 0) {
      const t = this.tuerMass();
      const x = this.fahrzeugX + t.x + (TUER_WEITE - weite);
      ctx.fillStyle = PAL['.'];                       // das dunkle Innere
      ctx.fillRect(x, this.fahrzeugY + 15, weite, 4);
      ctx.fillStyle = PAL.g;                          // obere Kante der Öffnung
      ctx.fillRect(x, this.fahrzeugY + 14, weite, 1);
      ctx.fillStyle = PAL.d;                          // Kante des Türblatts
      ctx.fillRect(x, this.fahrzeugY + 15, 1, 4);
      ctx.fillStyle = PAL.G;                          // Schwellerkante im Licht
      ctx.fillRect(x, this.fahrzeugY + 18, weite, 1);
    }
    const figur = this.figurlage();
    if (figur) {
      this.figur(ctx, figur.rows, figur.x, figur.y, figur.art);
      if (this.schluesselInHand()) {
        blit(ctx, spriteCanvas('einst-schluessel', SCHLUESSEL), figur.x + 13, figur.y + 13);
      }
    }
  }

  zeichneMotorrad(ctx) {
    const x = this.motorradX(), y = this.fahrzeugY;
    blit(ctx, spriteCanvas('einst-motorrad', MOTORRAD_SEITE), x, y);
    // Der Helm: erst auf dem Sitz, dann in der Hand, dann auf dem Kopf.
    const inHand = this.helmInHand();
    const helm = spriteCanvas('einst-helm', HELM);
    if (!inHand && !this.helmAuf()) blit(ctx, helm, x + 6, y + 1);
    if (inHand) blit(ctx, helm, inHand.x, inHand.y);
    const figur = this.figurlage();
    if (figur) this.figur(ctx, figur.rows, figur.x, figur.y, figur.art);
    const sitz = this.sitzlage();
    if (sitz) this.figur(ctx, sitz.rows, sitz.x, sitz.y, sitz.art);
  }
}

/** Ein Zeichen der Palette? Nur damit prüfbar ist, dass nichts unsichtbar bleibt. */
export function zeichenInPalette(rows) {
  return rows.every((row) => [...row].every((c) => c === ' ' || Object.prototype.hasOwnProperty.call(PAL, c)));
}
