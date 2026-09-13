// cutscene-frack.js — die Schlussszene des Epilogs (Auftrag CUT-1, erweitert
// um das sichtbare Umziehen in CUT-1b).
//
// Die Hauptfigur hängt Frack und Geige in den Kleiderschrank des Kleingartens
// und zieht danach Zivil an. Die Szene ist ein eigenes Modul und hängt an genau
// einem Auslöser (der Aktion „ZIVIL ANZIEHEN" am Kleiderschrank) und einem
// Merker im Spielstand: spielbar genau einmal, kein zweiter Lauf.
//
// CUT-1b (Rolands Abnahme-Notiz): Der Wechsel Frack -> Zivil ist Teil der Szene
// geworden. Am Ende steht die Figur in Zivil vor dem Schrank; der Wechsel im
// Spiel (game.js, `zivilAnziehen`) läuft unverändert danach und ist nur noch
// die Rückfallebene — zu sehen ist er nicht mehr, weil die Figur schon Zivil
// trägt (kein doppelter Pop).
//
// Sie baut nichts um: Kulisse, Figur und Schrank sind die vorhandenen Zeichner
// aus sprites.js/render.js, ergänzt um die vier Zwischenbilder, die es sonst
// nirgends gibt (Frack am Bügel, Geige, offener Kasten, offener Schrank) und um
// die beiden Bilder des Umziehens (Hawaii-Hemd, halb angezogene Figur).
// Kein DOM beim Import — dieselbe Logik läuft in Node in den Tests.
//
// Farbe: alle neuen Matrizen benutzen Buchstaben der Palette aus config.js
// (`PAL`); ein Leerzeichen ist durchsichtig, alles andere eine feste Farbe.

import { PAL, TILE } from './config.js';
import { SPRITES, OUTFIT_PALETTES } from './sprites.js';
import { spriteCanvas, blit } from './render.js';

/** Merker im Spielstand: die Szene läuft genau einmal (main.js schreibt ihn). */
export const CUT_MERKER = 'cutFrackGeige';

/** Dauer der Szene in Sekunden (Rolands Rahmen: 3–5 s). */
export const SZENE_DAUER = 5.0;

/** Die sichtbaren Abschnitte der Szene — auch die Prüfungen lesen sie. */
export const SZENE_BEATS = [
  { name: 'gehen', bis: 0.80 },        // zum Schrank gehen
  { name: 'oeffnen', bis: 1.40 },      // Schrank öffnen
  { name: 'frack', bis: 2.45 },        // Frack auf den Bügel
  { name: 'geige', bis: 3.15 },        // Geige in den Kasten
  { name: 'schliessen', bis: 3.85 },   // Schrank schließen (vorher kommt das Hemd heraus)
  { name: 'zurueck', bis: 4.30 },      // einen Schritt zurücktreten, Hemd in der Hand
  { name: 'umziehen', bis: SZENE_DAUER }, // CUT-1b: Hemd über den Kopf, in Zivil
];

/** Die Abschnittsgrenzen nach Namen — im Code stehen keine Zahlen. */
const BEAT = Object.fromEntries(SZENE_BEATS.map((b) => [b.name, b.bis]));

/** Wann die Türen aufgehen und wann sie wieder zu sind. */
export const OEFFNEN_AB = 0.95;
export const SCHLIESSEN_AB = 3.75;

// Die drei Griffe des Umziehens (Auftrag CUT-1b) stecken im letzten Abschnitt:
// Hemd heben, über den Kopf ziehen, sitzen lassen — danach steht die Figur in
// Zivil. Zusammen keine Sekunde; länger darf die Szene nicht werden.
export const UMZIEH_KOPF_AB = 4.46;      // ab hier liegt das Hemd über dem Kopf
export const UMZIEH_FERTIG_AB = 4.72;    // ab hier sitzt es, die Figur ist Zivil
/** Wann die Zivilkluft aus dem offenen Schrank geholt wird (vor dem Zumachen). */
export const HEMD_RAUS_AB = 3.55;

// -------------------------------------------------------------- Zwischenbilder --
// Der Frack am Bügel: schwarzer Rücken, weißes Hemd, Bügelhaken oben.
// Der Haken sitzt auf der Stange des Schranks, wenn der Frack hängt.
const FRACK_AM_BUEGEL = [
  '    gg   ',
  '  gGGGGg ',
  ' aaaaaaaa',
  'aawwwwwwa',
  'aawwwwwwa',
  'aaww  wwa',
  'aawwwwwwa',
  ' aaaaaaa ',
  ' aa    aa',
  ' aa    aa',
  '  a    a ',
];

// Die Geige: Hals mit Wirbelkasten, Korpus mit zwei F-Löchern.
const GEIGE = [
  '  yy  ',
  '  yy  ',
  '  yy  ',
  ' yyyy ',
  ' yyKK ',
  ' yyKK ',
  ' yyyy ',
  '  yy  ',
];

// Die Geige im Kasten liegend — dieselbe Geige, quer.
const GEIGE_LIEGT = [
  '  yyyy  ',
  ' yyyyyy ',
  'yyKyyKyy',
  '  yyyy  ',
];

// Der offene Kasten: Deckel hochgeklappt, Fell im Inneren.
const KASTEN_OFFEN = [
  'LLLLLLLLLL',
  'L........L',
  'LMMMMMMMML',
  'LMMMMMMMML',
  'LMMMMMMMML',
  'LLLLLLLLLL',
];

// Der Schrank, offen: dieselbe Außenhaut wie im Garten-Sprite (Metallblende,
// Türblätter an den Seiten), dazwischen das dunkle Innere mit Kleiderstange
// und zwei leeren Bügeln. Was darin hängt und steht, wird einzeln gezeichnet.
const SCHRANK_OFFEN = [
  'LLLLLLLLLLLLLLLL',
  'LggggggggggggggL',
  'LdM..........MdL',
  'LdM.gggggggg.MdL',
  'LdM...g..g...MdL',
  'LdM...g..g...MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LdM..........MdL',
  'LMMMMMMMMMMMMMML',
];

// Das Hawaii-Hemd der Zivilkluft (Auftrag CUT-1b): türkis mit Orangenstreifen,
// kurze Ärmel. Es wird als Requisit gezeichnet — in der Hand und auf dem Weg
// über den Kopf; die Farben kommen aus der Zivilpalette (w = Hemd, r = Streifen).
const ZIVIL_HEMD = [
  '  ww  ww  ',
  ' wwwwwwww ',
  'wwwrwwrwww',
  'wwwrwwrwww',
  ' wwrwwrww ',
  ' wwwwwwww ',
  '  wwwwww  ',
  '  wwwwww  ',
];

// Die halb angezogene Figur (Auftrag CUT-1b): dieselbe Größe wie roland_idle
// (16x24), aber Kopf und Oberkörper stecken im Hemd — Hände am Saum, darunter
// schon die Shorts in Zivilfarben. Das ist der Moment, den die Szene zeigen
// soll; er liegt genau ein Bild lang vor.
const FIGUR_UMZIEH = [
  '    wwwwwwww    ',
  '   wwwwwwwwww   ',
  '  wwwrwwwwrwww  ',
  '  wwwrwwwwrwww  ',
  '  swwrwwwwrwws  ',
  '  swwwwwwwwwws  ',
  '  swwwwwwwwwws  ',
  '  wwwwwwwwwwww  ',
  '  wwwrwwwwrwww  ',
  '  wwwrwwwwrwww  ',
  '   wwwwwwwwww   ',
  '   wwwwwwwwww   ',
  '   aaaaaaaaaa   ',
  '   aaaaaaaaaa   ',
  '  aaaaaaaaaaaa  ',
  '  aaaaaaaaaaaa  ',
  '  aaaaaaaaaaaa  ',
  '  aaaaaaaaaaaa  ',
  '  aaaa    aaaa  ',
  '  aaaa    aaaa  ',
  '  aaaa    aaaa  ',
  '  aaaa    aaaa  ',
  '  aaaa    aaaa  ',
  ' bbbbb    bbbbb ',
];

/** Alle Zeichen der neuen Matrizen müssen Farben der Palette sein. */
export const CUTSCENE_SPRITES = {
  cut_frack_buegel: FRACK_AM_BUEGEL,
  cut_geige: GEIGE,
  cut_geige_liegt: GEIGE_LIEGT,
  cut_kasten_offen: KASTEN_OFFEN,
  cut_schrank_offen: SCHRANK_OFFEN,
  cut_zivil_hemd: ZIVIL_HEMD,
  cut_figur_umzieh: FIGUR_UMZIEH,
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;

/** Der Abschnitt, in dem die Szene bei `t` Sekunden steht. */
export function beatBei(t) {
  for (const b of SZENE_BEATS) if (t < b.bis) return b.name;
  return SZENE_BEATS[SZENE_BEATS.length - 1].name;
}

export class FrackGeigeSzene {
  /**
   * @param schrank  der Kleiderschrank aus der Welt (Entity mit x/y/w/h)
   * @param kluft    die Kluft, die die Figur beim Auslösen trägt
   * @param startX   wo die Figur steht, wenn die Szene beginnt
   * @param dir      Blickrichtung beim Auslösen
   */
  constructor({ schrank, kluft = 'frack', startX = null, dir = 1 }) {
    this.schrank = { x: schrank.x, y: schrank.y, w: schrank.w, h: schrank.h };
    this.kluft = OUTFIT_PALETTES[kluft] ? kluft : 'schwarz';
    // Trägt die Figur den Frack, kommt er beim Aufhängen vom Körper; sonst
    // wird er sichtbar unter dem Arm getragen. Beide Wege enden am Bügel.
    this.traegtFrack = this.kluft === 'frack';
    this.kluftJetzt = this.kluft;
    this.t = 0;
    this.startX = Number.isFinite(startX) ? startX : schrank.x - 6;
    this.startDir = dir < 0 ? -1 : 1;
    // Vor den Türen stehen, mit Blick zum Schrank; danach einen Schritt zurück.
    this.frontX = this.schrank.x - 6;
    this.endX = this.frontX - 18;
    this.blickDir = this.frontX >= this.schrank.x ? -1 : 1;
  }

  get dauer() { return SZENE_DAUER; }
  get fertig() { return this.t >= SZENE_DAUER; }
  get beat() { return beatBei(this.t); }
  get fortschritt() { return clamp01(this.t / SZENE_DAUER); }

  /** Der Griff des Umziehens (CUT-1b) — außerhalb des Abschnitts null. */
  get umziehPhase() {
    if (this.beat !== 'umziehen') return null;
    if (this.t < UMZIEH_KOPF_AB) return 'heben';
    if (this.t < UMZIEH_FERTIG_AB) return 'kopf';
    return 'angezogen';
  }

  /** Das Figurenbild dieses Moments — die Zeichnung liest es, die Prüfungen auch. */
  get figurBild() {
    if (this.umziehPhase === 'kopf') return 'cut_figur_umzieh';
    if (this.beat === 'gehen') return Math.floor(this.t * 8) % 2 ? 'roland_walk1' : 'roland_walk2';
    return 'roland_idle';
  }

  /** Positionen: die Szene führt die Figur selbst, ohne Physik. */
  update(dt, game) {
    this.t = Math.min(SZENE_DAUER, this.t + dt);
    const p = game.player;
    const t = this.t;
    if (t < BEAT.gehen) {
      // Zum Schrank gehen — gleichmäßig, damit der Weg immer gleich lang wirkt.
      const k = clamp01(t / BEAT.gehen);
      p.x = lerp(this.startX, this.frontX, k);
      p.dir = Math.abs(this.frontX - this.startX) < 1 ? this.startDir
        : (this.frontX > this.startX ? 1 : -1);
    } else if (t < BEAT.schliessen) {
      p.x = this.frontX;
      p.dir = this.blickDir;
    } else if (t < BEAT.zurueck) {
      // Zurücktreten, den Schrank dabei weiter ansehen.
      const k = clamp01((t - BEAT.schliessen) / (BEAT.zurueck - BEAT.schliessen));
      p.x = lerp(this.frontX, this.endX, k);
      p.dir = this.blickDir;
    } else {
      // Beim Umziehen (CUT-1b) steht die Figur still und sieht den Schrank an.
      p.x = this.endX;
      p.dir = this.blickDir;
    }
    // Kein Rest von Physik: die Figur steht ruhig, bis die Szene vorbei ist.
    p.vx = 0; p.vy = 0; p.onGround = true;
    // Nach dem Aufhängen trägt die Figur nur noch das Hemd unter dem Frack;
    // sobald das Hawaii-Hemd über dem Kopf liegt (CUT-1b), ist sie in Zivil.
    this.kluftJetzt = t >= UMZIEH_KOPF_AB ? 'zivil'
      : (this.traegtFrack && t >= 1.95 ? 'schwarz' : this.kluft);
    return this.fertig;
  }

  /** Der Frack: null = noch am Körper, sonst Bildschirmposition und Zustand. */
  frackPlatz(camX, camY, figur) {
    const s = this.schrank;
    const stangeX = Math.round(s.x + 3 - camX);
    const stangeY = Math.round(s.y + 4 - camY);
    const ab = this.traegtFrack ? 1.95 : 0.80;
    const bis = this.traegtFrack ? 2.45 : 2.35;
    if (this.t < ab) return null;
    if (this.traegtFrack) {
      const k = clamp01((this.t - ab) / (bis - ab));
      return {
        x: Math.round(lerp(figur.brustX, stangeX, k)),
        y: Math.round(lerp(figur.brustY, stangeY, k)),
        haengt: k >= 1,
      };
    }
    // Getragen unter dem Arm, dann an die Stange.
    const k = clamp01((this.t - 1.70) / (bis - 1.70));
    return {
      x: Math.round(lerp(figur.trageX, stangeX, k)),
      y: Math.round(lerp(figur.trageY, stangeY, k)),
      haengt: k >= 1,
    };
  }

  /** Die Geige: getragen, im Flug in den Kasten, dann im Kasten. */
  geigePlatz(camX, camY, figur) {
    const s = this.schrank;
    const kastenX = Math.round(s.x + 3 - camX);
    const kastenY = Math.round((s.y + s.h) - 4 - camY);
    const ab = 2.60;
    const bis = 3.15;
    if (this.t < ab) {
      return this.t < 0.80 ? null : { x: figur.handX, y: figur.handY, imKasten: false };
    }
    const k = clamp01((this.t - ab) / (bis - ab));
    return {
      x: Math.round(lerp(figur.handX, kastenX + 1, k)),
      y: Math.round(lerp(figur.handY, kastenY + 1, k)),
      imKasten: k >= 1,
    };
  }

  /** Das Hawaii-Hemd (CUT-1b): aus dem Schrank geholt, in der Hand, dann hoch. */
  hemdPlatz(camX, camY, figur) {
    // Vor dem Herausholen gibt es nichts zu sehen; mit dem Hemd über dem Kopf
    // (Phase 'kopf') zeigt es die halb angezogene Pose selbst.
    if (this.t < HEMD_RAUS_AB || this.t >= UMZIEH_KOPF_AB) return null;
    const s = this.schrank;
    if (this.t < SCHLIESSEN_AB) {
      // Der Schrank ist noch offen: das Hemd kommt aus dem dunklen Inneren in
      // die Hand — dieselbe Bewegung, nur ohne Flug wie bei der Geige.
      const k = clamp01((this.t - HEMD_RAUS_AB) / (SCHLIESSEN_AB - HEMD_RAUS_AB));
      return {
        x: Math.round(lerp(Math.round(s.x + 4 - camX), figur.handX, k)),
        y: Math.round(lerp(Math.round(s.y + 8 - camY), figur.handY, k)),
      };
    }
    if (this.t < BEAT.zurueck) return { x: figur.handX, y: figur.handY };
    // Beim Umziehen geht es von der Hand hoch über den Kopf.
    const k = clamp01((this.t - BEAT.zurueck) / (UMZIEH_KOPF_AB - BEAT.zurueck));
    return {
      x: Math.round(lerp(figur.handX, figur.x + 3, k)),
      y: Math.round(lerp(figur.handY, figur.y - 7, k)),
    };
  }

  /** Alles, was die Szene im Bild braucht — in Bildschirmkoordinaten. */
  figurenMass(camX, camY, p) {
    const h = SPRITES.roland_idle.length;
    const x = Math.round(p.x - camX - 2);
    const y = Math.round(p.y - camY + p.h - h);
    const rechts = p.dir >= 0;
    return {
      x, y, h, rechts,
      // Brust und Hand: dort wird gehalten, was gerade getragen wird.
      brustX: x + (rechts ? 9 : 1),
      brustY: y + 6,
      handX: x + (rechts ? 12 : -4),
      handY: y + 13,
      trageX: x + (rechts ? 14 : -12),
      trageY: y - 2,
    };
  }

  draw(ctx, game, camX, camY) {
    const s = this.schrank;
    const sx = Math.round(s.x - camX);
    const sy = Math.round(s.y - camY);
    const offen = this.t >= OEFFNEN_AB && this.t < SCHLIESSEN_AB;
    const p = game.player;
    const figur = this.figurenMass(camX, camY, p);

    blit(ctx, this.spr(offen ? 'cut_schrank_offen' : 'kleiderschrank'), sx, sy);

    if (offen) {
      const frack = this.frackPlatz(camX, camY, figur);
      // Hängt er erst einmal an der Stange, gehört er ins Bild des Schranks.
      if (frack && frack.haengt) blit(ctx, this.spr('cut_frack_buegel'), frack.x, frack.y);
      blit(ctx, this.spr('cut_kasten_offen'), sx + 3, sy + s.h - 4);
      const geige = this.geigePlatz(camX, camY, figur);
      if (geige && geige.imKasten) blit(ctx, this.spr('cut_geige_liegt'), sx + 4, sy + s.h - 4);
    }

    // Die Figur selbst — mit demselben Maß wie drawPlayer.
    const spr = this.spr(this.figurBild, OUTFIT_PALETTES[this.kluftJetzt]);
    blit(ctx, spr, figur.x, figur.y, !figur.rechts);

    // Was noch getragen wird, hängt an der Figur: erst der Frack, dann die Geige.
    if (offen) {
      const frack = this.frackPlatz(camX, camY, figur);
      if (frack && !frack.haengt) blit(ctx, this.spr('cut_frack_buegel'), frack.x, frack.y);
    } else if (this.t < 1.70 && !this.traegtFrack && this.t >= 0.80) {
      // Der Frack unter dem Arm, solange der Schrank noch zu ist.
      blit(ctx, this.spr('cut_frack_buegel'), figur.trageX, figur.trageY);
    }
    const geige = this.geigePlatz(camX, camY, figur);
    if (geige && !geige.imKasten) blit(ctx, this.spr('cut_geige'), geige.x, geige.y);

    // Die Zivilkluft (CUT-1b): erst aus dem Schrank in die Hand, dann über den
    // Kopf — ab da zeigt sie die Pose der Figur, nicht mehr als Requisit.
    const hemd = this.hemdPlatz(camX, camY, figur);
    if (hemd) blit(ctx, this.spr('cut_zivil_hemd'), hemd.x, hemd.y);

    // Einen Moment Ruhe nach dem Zumachen: nichts blinkt, nichts ruft.
  }

  spr(name, palette) {
    const rows = CUTSCENE_SPRITES[name] || SPRITES[name];
    return spriteCanvas(name, rows, palette);
  }
}

/** Passt die Szene in diesen Level? (nur der Kleingarten hat den Schrank) */
export function szeneMoeglich(level) {
  if (!level || !Array.isArray(level.spawns)) return false;
  const s = level.spawns.find((sp) => sp.kind === 'garderobe');
  return !!s && level.grid[s.walkRow + 1][s.tx] === 1;
}

/** Ein Zeichen der Palette? Nur damit prüfbar ist, dass nichts unsichtbar bleibt. */
export function zeichenInPalette(rows) {
  return rows.every((row) => [...row].every((c) => c === ' ' || Object.prototype.hasOwnProperty.call(PAL, c)));
}

// Der Schrank steht auf Kachelboden; TILE nur als Import-Anker für die
// Weltkoordinaten der Entities (die Szene rechnet in Pixeln, nicht in Kacheln).
export const SZENE_TILE = TILE;
