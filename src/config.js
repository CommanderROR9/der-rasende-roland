// config.js — zentrale Konstanten, Palette, Kleiderordnung, Physik
export const TILE = 16;
export const VIEW_W = 384;
export const VIEW_H = 216;

// Basispalette. Buchstaben werden von den Sprite-Matrizen benutzt.
export const PAL = {
  ' ': null,
  '.': '#0b0810',
  a: '#20202a',
  w: '#f0eee4',
  r: '#b0392f',
  b: '#14141c',
  h: '#c9c9d2',
  H: '#ffffff',
  s: '#e8b98a',
  S: '#c19063',
  d: '#3a2a2a',
  g: '#8e8e9c',
  G: '#b8b8c4',
  m: '#9a9aa8',
  y: '#e8c46a',
  Y: '#d9a83c',
  c: '#5de0cf',
  C: '#9ff3ea',
  o: '#ef8f3a',
  O: '#ffd08a',
  p: '#7a4b8a',
  k: '#20202a',
  K: '#3a3a4a',
  L: '#6e4423',
  R: '#c8402f',   // Cabrio-Rot
  E: '#3f6b3a',   // Baumkrone Abend
  M: '#a97540',
  e: '#2b3b2a',
};

// Kleiderordnung: Tempo, Sprung, Entdeckungsradius, Grundhitze.
export const OUTFITS = {
  schwarz: {
    id: 'schwarz',
    label: 'SCHWARZES HEMD',
    short: 'SCHWARZ',
    speed: 118,
    jump: -182,
    detect: 0.75,
    heatBase: 0,
    lightHeat: 2.0,
    blurb: 'Leise und schnell. Im Dunkeln fällt Schwarz am wenigsten auf.',
    pros: ['schnellstes Tempo', 'keine Hitze von selbst'],
    cons: ['öffnet keine Diensttür'],
  },
  anzug: {
    id: 'anzug',
    label: 'ANZUG + KRAWATTE',
    short: 'ANZUG',
    speed: 104,
    jump: -180,
    detect: 1.0,
    heatBase: 0.8,
    lightHeat: 4.5,
    blurb: 'Offiziell. Öffnet Diensttüren, zieht aber Blicke.',
    pros: ['öffnet Diensttüren'],
    cons: ['etwas wärmer'],
  },
  frack: {
    id: 'frack',
    label: 'FRACK',
    short: 'FRACK',
    speed: 92,
    jump: -176,
    detect: 1.4,
    heatBase: 3.0,
    lightHeat: 7.0,
    blurb: 'Prestige. Öffnet Absperrbänder. Und der Kragen kratzt.',
    pros: ['öffnet Absperrbänder', 'FRACK-OFF als Rettung'],
    cons: ['langsam', 'Hitze steigt schnell', 'Glanzalarm'],
  },
};

export const PHYS = {
  gravity: 430,
  maxFall: 320,
  accel: 900,
  friction: 900,
  coyote: 0.10,
  buffer: 0.12,
  invuln: 1.2,
  playerW: 12,
  playerH: 22,
  duckH: 14,
};

// Sichtbereich: am Rechner großzügig, auf Touchgeräten enger, damit die Figur
// dort wirklich zu sehen ist (Zoom statt Briefmarke).
export const VIEW_DESKTOP = { w: 384, h: 216 };
export const VIEW_TOUCH = { w: 256, h: 144 };

export function pickView(coarsePointer) {
  return coarsePointer ? VIEW_TOUCH : VIEW_DESKTOP;
}

// Schwierigkeit: „Gemütlich" ist die Voreinstellung, weil das Spiel ein
// Geschenk ist — Frust darf hier niemanden ausbremsen.
export const DIFFICULTY = {
  gemuetlich: {
    id: 'gemuetlich',
    sicht: 4.6,
    invuln: 2.6, label: 'GEMÜTLICH',
    note: 'empfohlen: langsame Gegner, viel Schonfrist',
    enemySpeed: 0.55, fireEvery: 3, fireRange: 0.55, shotSpeed: 0.62, aimTime: 0.75,
    invuln: 2.0, trittWindow: 0.20, tenorSlow: 0.26, tenorRange: 96, kofferSpeed: 0.6,
    sopranWind: 1.6, sopranRange: 0.48, sopranDmg: 1, dirigentEvery: 3, centrifugal: 0.42,
  },
  zuegig: {
    id: 'zuegig',
    sicht: 3.4, label: 'ZÜGIG',
    note: 'mehr Druck, weniger Schonfrist',
    enemySpeed: 0.85, fireEvery: 2, fireRange: 0.6, shotSpeed: 0.85, aimTime: 0.55,
    invuln: 1.5, trittWindow: 0.16, tenorSlow: 0.38, tenorRange: 116, kofferSpeed: 0.85,
    sopranWind: 1.2, sopranRange: 0.6, sopranDmg: 2, dirigentEvery: 2, centrifugal: 0.68,
  },
};

export const BPM_BASE = 100;
export const BPM_TENOR = 68;

export const TUNE = {
  trittWindow: 0.15, // Sekunden Abweichung, die noch als "im Takt" gilt
  trittRange: 96,
  trittStun: 1.3,
  ohropaxTime: 14,
  heatMax: 120,
  heatShade: -1.5,
  heatRun: 2.5,
  kreislaufAt: 100,
  frackOffHeat: 45,
  frackOffBoost: 4,
  morschTime: 0.38,
  morschRespawn: 3.0,
  interactRange: 26,   // Umziehen nur auf Tastendruck, nicht beim Berühren
  labelRange: 54,      // ab hier wird ein Objekt benannt
  beatEarshot: 240,    // nur in Gefahrennähe tickt es überhaupt
};

export const AKT1_NAME = 'AKT 1 — DIE KATAKOMBEN';
