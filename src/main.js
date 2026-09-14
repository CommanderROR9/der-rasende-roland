// main.js — Verkabelung: DOM, Canvas-Skalierung, Overlays, Speicherung.
import { OUTFITS, DIFFICULTY, pickView, TILE, outfitWahl } from './config.js';
import { SPRITES } from './sprites.js';
import { spriteCanvas } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createMusik } from './music.js';
import { LEVELS } from './world.js';
import { BELOHNUNGEN, SAVE_VERSION, migriereSave, stationIndex } from './story.js';
import { Game } from './game.js';
import { Grill } from './grill.js';
import { Racer } from './racer.js';
import { Probe } from './probe.js';
import { CUT_MERKER, SZENE_DAUER } from './cutscene-frack.js';
// Die Einstiegs-Cutscenes vor den Fahr-Interludien (Auftrag CUT-2): ein Aufruf
// am Start der Fahrt, je ein Merker im Spielstand.
import { EINSTIEG_MERKER, EINSTIEG_DAUER, einstiegGelaufen, einstiegStarten } from './cutscene-einstieg.js';
import {
  ABSPANN_SEITEN, ABSPANN_WEITER, ABSPANN_ZURUECK, ABSPANN_ZURUECK_TITEL,
  abspannBeschriftungen, abspannLayout, zeichneAbspann,
} from './credits.js';

const $ = (s) => document.querySelector(s);
const ui = {
  stage: $('#stage'), canvas: $('#game'), textLayer: $('#gameTextLayer'),
  aktsub: $('#aktsub'), hintbar: $('#hintbar'),
  deckel: $('#deckel'), ohro: $('#ohro'), kluft: $('#kluft'),
  hitze: $('#hitze i'), takt: $('#takt .beat'), bpm: $('#bpm'), nerven: $('#nerven'),
  wetter: $('#wetter'), nass: $('#nass i'),
  title: $('#title'), startBtn: $('#startBtn'), resetBtn: $('#resetBtn'),
  garde: $('#garde'), gardeTitle: $('#gardeTitle'), gardeCards: $('#gardeCards'), gardeBack: $('#gardeBack'),
  pause: $('#pause'), resumeBtn: $('#resumeBtn'), quitBtn: $('#quitBtn'),
  collapse: $('#collapse'), collapseBtn: $('#collapseBtn'),
  reward: $('#reward'), rewardBody: $('#rewardBody'), rewardBtn: $('#rewardBtn'), rewardQuit: $('#rewardQuit'),
  rewardEyebrow: $('#rewardEyebrow'), rewardTitle: $('#rewardTitle'), rewardText: $('#rewardText'), rewardNote: $('#rewardNote'),
  abspannBtn: $('#abspannBtn'), abspannTitleBtn: $('#abspannTitleBtn'),
  abspann: $('#abspann'), abspannCanvas: $('#abspannCanvas'),
  abspannBild: $('#abspannBild'), abspannTextLayer: $('#abspannTextLayer'),
  abspannWeiter: $('#abspannWeiter'), abspannZurueck: $('#abspannZurueck'),
  actRow: $('#actRow'),
  worldlabel: $('#worldlabel'), soundBtn: $('#soundBtn'), diffBtn: $('#diffBtn'), diffBtn2: $('#diffBtn2'),
  walkReadout: $('#walkReadout'), racerReadout: $('#racerReadout'),
  grillReadout: $('#grillReadout'), gPunkte: $('#gPunkte'), gServiert: $('#gServiert'),
  gVerbrannt: $('#gVerbrannt'), gTakt: $('#gTakt'), gBpm: $('#gBpm'),
  applaus: $('#applaus'), applausWrap: $('#applausWrap'), applausStufen: $('#applausStufen'), journal: $('#journal'),
  uOhro: $('#uOhro'), uKluft: $('#uKluft'), uHitze: $('#uHitze'),
  uWetter: $('#uWetter'), uNass: $('#uNass'), uTakt: $('#uTakt'), uNerven: $('#uNerven'),
  rSpeed: $('#rSpeed'), rTime: $('#rTime'), rHits: $('#rHits'), rDist: $('#rDist'), rTakt: $('#rTakt'),
  probeReadout: $('#probeReadout'), pTreffer: $('#pTreffer'), pPatzer: $('#pPatzer'),
  pSatz: $('#pSatz'), pRest: $('#pRest'),
  probePad: $('#probePad'), btnEinsatz: $('#btnEinsatz'), btnOhropax: $('#btnOhropax'),
  pad: $('#pad'), stick: $('#stick'), nub: $('#nub'), btnJump: $('#btnJump'), btnAction: $('#btnAction'),
};
const ctx = ui.canvas.getContext('2d');

// Gerät, Sichtbereich, Bedienart einmal feststellen.
const COARSE = !!(window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches);
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || COARSE;
const VIEW = pickView(COARSE);
// Erst die Canvas-Größe, dann die Pixel-Regel: die Zuweisung an width/height
// setzt den 2D-Kontext auf die Voreinstellungen zurück (Glättung an) — auch
// wenn der Wert derselbe ist. Vorher stand die Zeile über der Größe, damit
// wurden Fahrzeug- und Strecken-Sprites weichgerechnet statt pixeltreu.
ui.canvas.width = VIEW.w;
ui.canvas.height = VIEW.h;
ctx.imageSmoothingEnabled = false;
let scaleNow = 1;

// Ein Skalierungsvertrag fuer alle hochaufgeloesten Spieltexte. Die Daten
// bleiben in logischen Canvas-Koordinaten; erst hier werden sie gegen das
// tatsaechlich sichtbare Canvas-Rechteck gerechnet. `canvasEl` ist die Leinwand,
// deren Raster die Daten beschreiben, `elternEl` der Bezugsrahmen der Textebene
// (die Ebene liegt genau auf der Leinwand). Abspann (F2) und Spieltexte nutzen
// denselben Vertrag.
let spieltextDaten = [];
let spieltextView = { w: VIEW.w, h: VIEW.h };
const spieltextElemente = new Map();

function textMass(daten, view, canvasEl, elternEl) {
  const rect = canvasEl.getBoundingClientRect();
  const elternRect = elternEl.getBoundingClientRect();
  const scaleX = rect.width / view.w;
  const scaleY = rect.height / view.h;
  const layerLeft = rect.left - elternRect.left;
  const layerTop = rect.top - elternRect.top;
  return {
    left: layerLeft + daten.x * scaleX,
    top: layerTop + daten.y * scaleY,
    width: daten.w * scaleX,
    height: daten.h * scaleY,
    fontSize: daten.fontSize * scaleY,
    layerLeft, layerTop, scaleX, scaleY,
    canvasWidth: rect.width, canvasHeight: rect.height,
  };
}

function spieltextMass(daten, view = spieltextView) {
  return textMass(daten, view, ui.canvas, ui.stage);
}

/**
 * Setzt Lage, Masse und Schrift eines Textelements — der Vertrag aus Phase A:
 * Schrift und Box skalieren vertikal, `scaleX` bildet danach die horizontale
 * Schrift-/Boxskalierung ab; der Boden von 12 CSS-Pixeln steht im Stylesheet,
 * hier kommt nur die gemessene Groesse als `--text-fs` an.
 */
function setzeTextElement(el, daten, mass, extraTransform = '') {
  el.style.left = (mass.left - mass.layerLeft) + 'px';
  el.style.top = (mass.top - mass.layerTop) + 'px';
  el.style.width = (daten.w * mass.scaleY) + 'px';
  el.style.height = mass.height + 'px';
  el.style.setProperty('--text-fs', mass.fontSize + 'px');
  el.style.lineHeight = mass.height + 'px';
  el.style.letterSpacing = ((daten.letterSpacing || 0) * mass.scaleY) + 'px';
  el.style.transform = extraTransform + `scaleX(${mass.scaleX / mass.scaleY})`;
}

/** Unterkante des globalen HUD in CSS-Pixeln, gemessen am echten Layout. */
function messeHudHoehe() {
  const hud = document.querySelector('.hud');
  if (!hud || !ui.stage) return 0;
  const r = hud.getBoundingClientRect();
  const stageRect = ui.stage.getBoundingClientRect();
  return Math.max(0, Math.round((r.bottom - stageRect.top) * 100) / 100);
}

function aktualisiereSpieltextLayout() {
  if (!ui.textLayer) return;
  const rect = ui.canvas.getBoundingClientRect();
  const stageRect = ui.stage.getBoundingClientRect();
  const layerLeft = rect.left - stageRect.left;
  const layerTop = rect.top - stageRect.top;
  ui.textLayer.style.left = layerLeft + 'px';
  ui.textLayer.style.top = layerTop + 'px';
  ui.textLayer.style.width = rect.width + 'px';
  ui.textLayer.style.height = rect.height + 'px';
  // Phase A: die gemessene HUD-Hoehe steht als CSS-Variable bereit; die Texte
  // mit `unterHud` ruecken damit per clamp() unter die Bedienleiste.
  document.documentElement.style.setProperty('--hud-h', messeHudHoehe() + 'px');
  for (const daten of spieltextDaten) {
    const el = spieltextElemente.get(daten.id);
    if (!el) continue;
    const mass = spieltextMass(daten, spieltextView);
    const unterHud = daten.unterHud
      ? 'translateY(clamp(0px, calc(var(--hud-h, 0px) + var(--hud-lucke, 4px) - '
        + `${mass.layerTop}px), ${Math.round(mass.canvasHeight * 0.35)}px)) `
      : '';
    setzeTextElement(el, daten, mass, unterHud);
  }
}

function renderSpieltexte(daten = [], view = VIEW) {
  if (!ui.textLayer) return;
  spieltextView = {
    w: Number(view && view.w) || VIEW.w,
    h: Number(view && view.h) || VIEW.h,
  };
  spieltextDaten = Array.isArray(daten) ? daten.map((eintrag) => ({ ...eintrag })) : [];
  const gebraucht = new Set(spieltextDaten.map((eintrag) => String(eintrag.id)));
  for (const [id, el] of spieltextElemente) {
    if (gebraucht.has(id)) continue;
    el.remove();
    spieltextElemente.delete(id);
  }
  for (const daten of spieltextDaten) {
    daten.id = String(daten.id);
    let el = spieltextElemente.get(daten.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'game-text-label';
      spieltextElemente.set(daten.id, el);
      ui.textLayer.appendChild(el);
    }
    el.id = 'spieltext-' + daten.id;
    el.dataset.textId = daten.id;
    el.dataset.x = String(daten.x);
    el.dataset.y = String(daten.y);
    el.textContent = String(daten.text || '').toUpperCase();
    el.style.color = daten.color || '#e9e5d8';
    el.style.background = daten.bg || 'transparent';
    el.style.textAlign = daten.align || 'left';
    el.style.fontWeight = String(daten.weight || 700);
  }
  aktualisiereSpieltextLayout();
}

function leereSpieltexte() { renderSpieltexte([], spieltextView); }

const input = createInput(window);
const audio = createAudio();
// Musik je Station: eigener Bus, erst nach Nutzeraktion (Startknopf) hörbar.
const musik = createMusik({ audio });
// Akte der Reihe nach: jeder Akt ist ein eigenes Levelmodul.
let aktIndex = 0;
let LEVEL = LEVELS[0].build();
// Das Ziel der Station hängt am Level, damit die Simulation es zeigen kann (DRR-03).
function zielAnhaengen() { LEVEL.ziel = LEVELS[aktIndex].ziel; }
function loadAct(i) {
  aktIndex = Math.max(0, Math.min(LEVELS.length - 1, i));
  LEVEL = LEVELS[aktIndex].build();
  zielAnhaengen();
}
zielAnhaengen();

// Belohnung und Fortsetzen je Akt
// Belohnungstexte stehen bei den Stationen (src/story.js) — eine Quelle.
const REWARDS = BELOHNUNGEN;
function istLetzterAkt() { return aktIndex >= LEVELS.length - 1; }
function updateActLabels() {
  if (ui.actRow) baueStationswahl();
  const r = REWARDS[LEVEL.id] || { title: 'AKT GESCHAFFT', text: 'Weiter geht es.' };
  ui.rewardEyebrow.textContent = `${LEVEL.name} GESCHAFFT`;
  ui.rewardTitle.textContent = r.title;
  ui.rewardText.textContent = r.text;
  ui.rewardNote.textContent = istLetzterAkt()
    ? 'Das war das Ende der Reise. Danke fürs Spielen — und viel Spaß im Ruhestand.'
    : `Weiter mit ${LEVELS[aktIndex + 1].name}.`;
  ui.rewardBtn.textContent = istLetzterAkt() ? 'NOCHMAL \u2192' : 'WEITER \u2192';
  // Der Abspann ist die Belohnung nach dem Epilog — vorher bleibt er verborgen.
  aktualisiereAbspannZugang();
}
let game = null;      // Seitenscroller-Simulation
let racer = null;     // Fahr-Interludium
let grill = null;     // Bratwurst-Minispiel im Epilog
// Die letzte Probe (DRR-P1): eigenes Minispiel am Bühnenrand, wie die Fahrten
// ohne Garderobe direkt gestartet.
let probe = null;
// Die Einstiegs-Cutscene vor der Fahrt (Auftrag CUT-2): läuft als eigener
// Zustand neben dem Racer, der so lange unangetastet stehenbleibt.
let einstieg = null;
const aktiv = () => probe || grill || racer || game;
const aktivModus = () => probe || grill || racer || game;
let gardeMode = 'start';
let pendingOutfit = null;

// ------------------------------------------------------------------ Scaling --
// Am Rechner wird auf ganze/halbe Stufen skaliert (knackige Pixel). Auf
// Touchgeräten darf der Faktor krumm sein, damit das Spielfeld den Bildschirm
// wirklich ausnutzt — Größe ist dort wichtiger als perfekte Pixelraster.
function fit() {
  const raw = Math.min(window.innerWidth / VIEW.w, window.innerHeight / VIEW.h);
  const scale = COARSE
    ? Math.max(0.5, Math.min(3, Math.round(raw * 100) / 100))
    : Math.max(1, Math.floor(raw * 2) / 2);
  scaleNow = scale;
  ui.canvas.style.width = Math.floor(VIEW.w * scale) + 'px';
  ui.canvas.style.height = Math.floor(VIEW.h * scale) + 'px';
  aktualisiereSpieltextLayout();
  // F2: die Namentexte des Abspanns hängen an derselben Messung (Canvas-Breite
  // aus dem CSS) und müssen beim Größenwechsel mitwandern.
  aktualisiereAbspannTextLayout();
}
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 120));

// -------------------------------------------------------------------- Save --
const SAVE_KEY = 'rasender-roland/v1';
function loadSave() {
  // Jeder Stand wird beim Lesen in die aktuelle Form gebracht: alte Stände
  // kannten nur `act` (Index in der alten Reihenfolge), heute gilt `station`.
  try { return migriereSave(JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); }
  catch { return migriereSave({}); }
}
function writeSave(patch) {
  const next = { ...loadSave(), ...patch };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch { /* privat modus: egal */ }
}

// ---------------------------------------------------------------- Overlays --
const OVERLAYS = ['title', 'garde', 'pause', 'collapse', 'reward', 'abspann'];
function show(name) {
  for (const o of OVERLAYS) ui[o].classList.toggle('hidden', o !== name);
  if (!name) for (const o of OVERLAYS) ui[o].classList.add('hidden');
}
function hideAll() { for (const o of OVERLAYS) ui[o].classList.add('hidden'); }

// ----------------------------------------------------------------- Abspann --
// Der Abspann ist eine Belohnung, kein Pflichtbildschirm: er öffnet sich nur,
// wenn jemand ihn sehen will, und lässt sich jederzeit wieder verlassen. Das
// Bild entsteht in Spielauflösung (384 × 216 bzw. 256 × 144) und wird nur
// skaliert — dieselben zwei Ansichten wie das Spiel selbst.
let abspannSeite = 0;
let abspannHerkunft = 'reward';    // wohin der Rückweg führt: 'reward' oder 'title'

/** Zeichnet die aktuelle Abspannseite; @returns das Layout mit `gezeichnet`. */
function abspannZeichnen() {
  if (!ui.abspannCanvas) return null;
  if (ui.abspannCanvas.width !== VIEW.w || ui.abspannCanvas.height !== VIEW.h) {
    ui.abspannCanvas.width = VIEW.w;
    ui.abspannCanvas.height = VIEW.h;
  }
  const g = ui.abspannCanvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const L = zeichneAbspann(g, VIEW, { seite: abspannSeite });
  // F2: die Namentexte gehören in die Textebene, nicht ins Bild. Sie wird hier
  // mitgezogen, weil das Öffnen unmittelbar davor liegt (Panel ist dann sichtbar
  // und hat echte Masse).
  synchronisiereAbspannTexte(abspannSeite);
  return L;
}
/** Abspann öffnen. `herkunft` bestimmt nur die Beschriftung des Rückwegs. */
function abspannZeigen(herkunft = 'reward', seite = 0) {
  abspannHerkunft = herkunft === 'title' ? 'title' : 'reward';
  abspannSeite = Math.max(0, Math.min(ABSPANN_SEITEN - 1, seite));
  if (ui.abspannZurueck) {
    ui.abspannZurueck.textContent = abspannHerkunft === 'title' ? ABSPANN_ZURUECK_TITEL : ABSPANN_ZURUECK;
  }
  if (ui.abspannWeiter) ui.abspannWeiter.textContent = ABSPANN_WEITER;
  show('abspann');
  return abspannZeichnen();
}
function abspannWeiter() {
  abspannSeite = (abspannSeite + 1) % ABSPANN_SEITEN;
  return abspannZeichnen();
}
/** Rückweg: dorthin zurück, wo der Abspann geöffnet wurde. */
function abspannZu() {
  show(abspannHerkunft === 'title' ? 'title' : 'reward');
  last = performance.now();
}
/** Ist der Abspann schon freigespielt? Dann steht er auch im Titel bereit. */
function aktualisiereAbspannZugang() {
  const geschafft = loadSave().geschafft || {};
  const fertig = geschafft.epilog === true;
  if (ui.abspannTitleBtn) ui.abspannTitleBtn.classList.toggle('hidden', !fertig);
  return fertig;
}

// ------------------------------------------------------- Abspann-Textebene --
// F2: die Namentexte des Abspanns liegen nicht mehr im 384x216-Bild (dort waren
// sie 5-10 Pixel groß und wurden mit dem Bild hochskaliert = verpixelt), sondern
// in einer eigenen Textebene über der Leinwand — derselbe Skalierungsvertrag wie
// die Spieltexte aus Phase A (textMass/setzeTextElement, Boden 12 CSS-Pixel).
let abspannTexteDaten = [];
const abspannTexteElemente = new Map();

function abspannTextMass(daten, view = VIEW) {
  return textMass(daten, view, ui.abspannCanvas, ui.abspannBild);
}

/**
 * Legt die Textebene genau auf die Leinwand und jedes Element an seinen Platz.
 * Solange das Panel verborgen ist, sind alle Masse 0 — dann gibt es nichts zu
 * legen (die Ebene wird beim Öffnen gesetzt, `abspannZeichnen` läuft danach).
 */
function aktualisiereAbspannTextLayout() {
  const ebene = ui.abspannTextLayer;
  if (!ebene || !ui.abspannCanvas || !ui.abspannBild) return;
  const cRect = ui.abspannCanvas.getBoundingClientRect();
  const bRect = ui.abspannBild.getBoundingClientRect();
  if (!cRect.width || !cRect.height || !bRect.width) return;
  ebene.style.left = (cRect.left - bRect.left) + 'px';
  ebene.style.top = (cRect.top - bRect.top) + 'px';
  ebene.style.width = cRect.width + 'px';
  ebene.style.height = cRect.height + 'px';
  for (const daten of abspannTexteDaten) {
    const el = abspannTexteElemente.get(daten.id);
    if (!el) continue;
    setzeTextElement(el, daten, abspannTextMass(daten));
  }
}

/** Schreibt die Namentexte der aktuellen Seite in die Ebene (ein Element je id). */
function renderAbspannTexte(daten = []) {
  const ebene = ui.abspannTextLayer;
  if (!ebene) return;
  abspannTexteDaten = Array.isArray(daten) ? daten.map((eintrag) => ({ ...eintrag })) : [];
  const gebraucht = new Set(abspannTexteDaten.map((eintrag) => String(eintrag.id)));
  for (const [id, el] of abspannTexteElemente) {
    if (gebraucht.has(id)) continue;
    el.remove();
    abspannTexteElemente.delete(id);
  }
  for (const eintrag of abspannTexteDaten) {
    eintrag.id = String(eintrag.id);
    let el = abspannTexteElemente.get(eintrag.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'game-text-label';
      abspannTexteElemente.set(eintrag.id, el);
      ebene.appendChild(el);
    }
    el.id = 'abspanntext-' + eintrag.id;
    el.dataset.textId = eintrag.id;
    el.dataset.x = String(eintrag.x);
    el.dataset.y = String(eintrag.y);
    el.textContent = String(eintrag.text || '').toUpperCase();
    el.style.color = eintrag.color || '#f0eee4';
    el.style.background = eintrag.bg || 'transparent';
    el.style.textAlign = eintrag.align || 'left';
    el.style.fontWeight = String(eintrag.weight || 700);
  }
  aktualisiereAbspannTextLayout();
}

/**
 * Hält die Textebene auf dem Stand der gezeigten Seite. Die Signatur der Daten
 * steht als `dataset.sig` an der Ebene — ohne echte Änderung wird nicht neu
 * geschrieben (dasselbe Muster wie `synchronisiereSpieltexte`).
 */
function synchronisiereAbspannTexte(seite = abspannSeite) {
  const ebene = ui.abspannTextLayer;
  const daten = abspannBeschriftungen(VIEW, seite);
  if (!ebene) return daten;
  const sig = JSON.stringify([VIEW.w, VIEW.h, daten]);
  if (ebene.dataset.sig === sig) {
    aktualisiereAbspannTextLayout();
    return daten;
  }
  ebene.dataset.sig = sig;
  renderAbspannTexte(daten);
  return daten;
}

function renderGarde(mode) {
  gardeMode = mode;
  ui.gardeTitle.textContent = mode === 'start' ? 'WAS ZIEHST DU AN?' : 'UMZIEHEN';
  ui.gardeBack.classList.toggle('hidden', mode === 'start');
  ui.gardeCards.innerHTML = '';
  // DRR-F4: nur die Klüfte, die es in diesem Level gibt. Zivil hängt am
  // Kleiderschrank des Kleingartens und steht vorher nicht zur Wahl.
  for (const o of outfitWahl(LEVEL)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick' + (game && game.outfit.id === o.id ? ' sel' : '');
    b.innerHTML = `<span class="title">${o.label}</span>`
      + `<span class="sub">${o.blurb}</span>`
      + o.pros.map((p) => `<span class="pro">+ ${p}</span>`).join('')
      + o.cons.map((c) => `<span class="con">− ${c}</span>`).join('');
    b.onclick = () => {
      if (mode === 'start') newGame(o.id);
      else if (game) { game.setOutfit(o.id); game.resume(); hideAll(); }
    };
    ui.gardeCards.appendChild(b);
  }
  show('garde');
}

// ------------------------------------------------------------------- Spiel --
function startGrill() {
  grill = new Grill({ level: LEVEL, input, audio, events: onGrillEvent, view: VIEW, difficulty: diffKey });
  hideAll();
  audio.resume();
  last = performance.now();
}
function onGrillEvent(e) {
  if (e.type !== 'complete') return;
  ui.rewardEyebrow.textContent = 'DER GRILL';
  ui.rewardTitle.textContent = 'GRILL-ERGEBNIS';
  ui.rewardText.textContent = 'Ramona hat zugesehen und nickt. Das ist mehr wert als jede Punktzahl.';
  zeigeZeilen(e.rows);
  ui.rewardBtn.textContent = 'WEITER \u2192';
  ui.rewardBtn.dataset.modus = 'grill';
  show('reward');
}
function newGame(outfitId) {
  for (const h of LEVEL.hints || []) h.shown = false;
  if (LEVEL.mode === 'probe') {
    // Die letzte Probe (DRR-P1): kein Lauf, keine Garderobe — der Dirigent
    // steht schon am Pult und will die Einsätze sehen.
    probe = new Probe({ level: LEVEL, input, audio, events: onGameEvent, view: VIEW, difficulty: diffKey });
    game = null;
    racer = null;
    einstieg = null;
  } else if (LEVEL.mode === 'racer') {
    // Fahr-Interludium: gleiche Steuerung, andere Simulation
    racer = new Racer({ level: LEVEL, input, audio, events: onGameEvent, view: VIEW, difficulty: diffKey });
    probe = null;
    game = null;
    // Auftrag CUT-2: der eine Aufruf am Start der Fahrt. Seit Rolands
    // Rückmeldung vom 13.09. läuft die Einstiegs-Cutscene bei JEDEM Start des
    // Fahr-Interludiums (der Merker im Spielstand unterdrückt sie nicht mehr);
    // danach fährt sie unverändert los.
    einstieg = einstiegStarten(LEVEL, { save: loadSave(), view: VIEW, events: onGameEvent });
  } else {
    racer = null;
    probe = null;
    einstieg = null;
    game = new Game({ level: LEVEL, input, audio, events: onGameEvent, view: VIEW, difficulty: diffKey });
    game.reset(outfitId);
    // Die Schlussszene (CUT-1) ist gelaufen? Der Spielstand weiß es. Seit
    // Rolands Rückmeldung vom 13.09. ist der Merker nur noch eine Aufzeichnung:
    // er wird weiter gelesen und geschrieben (Spielstand-Kompatibilität), die
    // Szene läuft aber bei jedem Wechsel Frack -> Zivil am Kleiderschrank.
    if (loadSave()[CUT_MERKER] === true) game.cutsceneGesehen = true;
    // Die Notenmappe reist mit: in Akt 1 zusammengesetzt, in Akt 2 aufs Pult
    // gelegt (DRR-04). Ohne diesen Griff in den Spielstand wäre der Schritt
    // „Mappe abgeben“ toter Code — getragen wird sie nur innerhalb eines Akts.
    if (LEVEL.id === 'akt2' && loadSave().mappe) game.hasMappe = true;
    // Wer einen Akt geschafft hat, geht mit einem Nerv mehr in den nächsten.
    if (aktIndex > 0) { game.maxNerves = 4; game.nerves = 4; game.hud = game.buildHud(); }
  }
  updateActLabels();
  hideAll();
  audio.resume();
  last = performance.now();
}
function onGameEvent(e) {
  if (e.type === 'stand') renderGarde('wechseln');
  else if (e.type === 'grill') startGrill();
  else if (e.type === 'mappe') writeSave({ mappe: true });   // reist in Akt 2 mit
  // Die Schlussszene im Kleingarten (CUT-1) läuft genau einmal: der Merker
  // steht im Spielstand, sobald sie begonnen hat.
  else if (e.type === 'cutscene') writeSave({ [CUT_MERKER]: true });
  // Die Einstiegs-Cutscene (CUT-2) schreibt ihren Merker bei jedem Lauf in den
  // Spielstand (Aufzeichnung; er unterdrückt seit dem 13.09. keinen Lauf mehr).
  else if (e.type === 'einstieg') writeSave({ [e.merker]: true });
  else if (e.type === 'collapse') show('collapse');
  else if (e.type === 'complete') {
    const s = e.stats || {};
    const save = loadSave();
    const best = save.bestTime ? Math.min(save.bestTime, s.time) : s.time;
    writeSave({
      bestTime: best,
      bestDeckel: Math.max(save.bestDeckel || 0, s.deckel),
      // Stabile ID statt Index: die Reihenfolge darf sich ändern, ohne dass
      // ein alter Stand auf der falschen Station landet (DRR-03).
      station: LEVELS[Math.min(LEVELS.length - 1, aktIndex + 1)].id,
      geschafft: { ...(save.geschafft || {}), [LEVEL.id]: true },
      [`${LEVEL.id}`]: true,
    });
    updateActLabels();
    zeigeZeilen(e.rows || [
      ['ZEIT', fmtTime(s.time)],
      ['BESTE ZEIT', fmtTime(best)],
      ['STIMMZIMMER KEKSE', `${s.deckel} / ${LEVEL.deckelTotal}`],
      ['IM TAKT GETROFFEN', String(s.taktHits)],
    ]);
    // Die letzte Probe (DRR-P1): das Verdikt steht über der Belohnung. Es gibt
    // keinen Fail-Zustand — alle drei Verdikte führen normal weiter, aber die
    // Rückmeldung des Dirigenten gehört ins Ergebnis.
    if (LEVEL.mode === 'probe') {
      const v = (e.stats && e.stats.verdikt) || null;
      const bel = REWARDS[LEVEL.id] || { text: '' };
      ui.rewardText.textContent = v && v.text ? `${v.text} ${bel.text}` : bel.text;
    }
    const icon = document.createElement('canvas');
    icon.className = 'rewardIcon';
    icon.width = 40; icon.height = 52;
    const g = icon.getContext('2d');
    g.imageSmoothingEnabled = false;
    const spr = LEVEL.mode === 'racer' ? spriteCanvas('mx5', SPRITES.mx5)
      : LEVEL.mode === 'probe' ? spriteCanvas('ohropax', SPRITES.ohropax)
        : spriteCanvas('bier', SPRITES.bier);
    const iz = Math.round((40 / spr.w) * spr.h);
    g.drawImage(spr.canvas, 0, 0, spr.w, spr.h, 0, 0, 40, iz);
    ui.rewardBody.prepend(icon);
    // Nur der Epilog schaltet den Abspann frei (Auftrag C1).
    if (ui.abspannBtn) ui.abspannBtn.classList.toggle('hidden', LEVEL.id !== 'epilog');
    show('reward');
  }
}
function zeigeZeilen(stats) {
  ui.rewardBody.innerHTML = '';
  for (const [k, v] of stats) {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `<span>${k}</span><b>${v}</b>`;
    ui.rewardBody.appendChild(d);
  }
}
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- Overlays --
// Die eine Textebene: Grill und Fahr-Interludium liefern strukturierte
// Beschriftungen, alles andere bleibt leer. Die Signatur der Daten steht als
// `dataset.sig` an der Ebene — ohne echte Aenderung wird nicht neu geschrieben.
function synchronisiereSpieltexte() {
  // Während der Einstiegs-Cutscene (CUT-2) liegt kein Fahr-HUD im DOM: die
  // Szene ist wortlos und die Fahrt hat noch nicht begonnen.
  const quelle = einstieg ? null : (grill || racer);
  const bereit = !!(quelle && typeof quelle.beschriftungen === 'function');
  const daten = bereit ? quelle.beschriftungen() : [];
  const view = bereit ? { w: quelle.vw, h: quelle.vh } : VIEW;
  const sig = (bereit ? 'x' : 'leer') + JSON.stringify([view.w, view.h, daten]);
  if (!ui.textLayer || ui.textLayer.dataset.sig === sig) return;
  ui.textLayer.dataset.sig = sig;
  renderSpieltexte(daten, view);
}
// -------------------------------------------------------------------- Loop --
let last = 0, hudAcc = 0, hudPrev = '';
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
  last = now;
  // Auftrag CUT-2: die Einstiegs-Cutscene führt sich selbst. Der Racer steht
  // dabei still (kein Tacho, keine Strecke) und fährt genau danach unverändert
  // weiter — im letzten Bild der Szene zeichnet schon die Fahrt.
  if (einstieg) {
    const pausiert = !!(racer && racer.state === 'paused');
    if (!pausiert && einstieg.update(dt)) einstieg = null;
    (einstieg || racer).draw(ctx);
    hudAcc += dt;
    if (hudAcc > 0.08) {
      hudAcc = 0;
      refreshHud();
      synchronisiereSpieltexte();
    }
    syncMusik();
    return;
  }
  const a = aktiv();
  if (a) {
    a.update(dt);
    a.draw(ctx);
    updateWorldLabel();
    hudAcc += dt;
    if (hudAcc > 0.08) {
      hudAcc = 0;
      refreshHud();
      synchronisiereSpieltexte();
    }
  }
  syncMusik();
}
// Die Knoepfe heissen in jedem Modus anders — sonst luegen sie (Review Befund 8).
function setzeKnopfBeschriftung() {
  // Während der Einstiegs-Cutscene (CUT-2) ist kein Knopf zuständig: die Szene
  // ist kurz und läuft durch, die Fahrt beginnt direkt danach.
  const modus = einstieg ? 'einstieg'
    : probe ? 'probe' : grill ? 'grill' : racer ? 'racer' : 'lauf';
  const jump = modus === 'lauf' ? 'SPRUNG' : '—';
  // E ist im Laufmodus kontextsensitiv. Bei einer Figur oder einem Gegenstand
  // darf die Touch-Oberfläche nicht weiter behaupten, man würde zutreten.
  const hatAktion = modus === 'lauf' && !!(game?.hud?.label?.action);
  // Während der Schlussszene (CUT-1) ist kein Knopf zuständig: die Figur wird
  // geführt, bis der Schrank zu ist.
  const szene = modus === 'lauf' && !!game?.szene;
  const akt = modus === 'racer' ? 'BREMSE'
    : modus === 'einstieg' ? '—'
      : modus === 'grill' ? ((grill?.hud?.fokusSeite === 1) ? 'SERVIEREN' : 'WENDEN')
      : szene ? '—'
        : hatAktion ? 'AKTION' : 'TRITT';
  if (ui.btnJump.textContent !== jump) ui.btnJump.textContent = jump;
  if (ui.btnAction.textContent !== akt) ui.btnAction.textContent = akt;
  ui.btnJump.style.opacity = modus === 'lauf' ? '' : '0.3';
  ui.btnJump.style.pointerEvents = modus === 'lauf' ? '' : 'none';
  // Die letzte Probe (DRR-P1) trägt zwei eigene Tasten: EINSATZ und OHROPAX.
  // Dort ruht das SPRUNG/TRITT-Pad, sonst bleibt alles wie es war.
  const istProbe = modus === 'probe';
  if (ui.pad) ui.pad.classList.toggle('show', IS_TOUCH && !istProbe);
  if (ui.probePad) ui.probePad.classList.toggle('show', IS_TOUCH && istProbe);
}
function refreshHud() {
  const a = aktiv();
  setzeKnopfBeschriftung();
  if (!a) return;
  // Auftrag CUT-2: während der Einstiegs-Cutscene gibt es kein Fahr-HUD — erst
  // einsteigen, dann fahren. Die Stationszeile bleibt, sie sagt, wohin es geht.
  if (einstieg) {
    ui.walkReadout.classList.add('hidden');
    ui.racerReadout.classList.add('hidden');
    ui.grillReadout.classList.add('hidden');
    ui.probeReadout.classList.add('hidden');
    ui.aktsub.textContent = LEVEL.name;
    setzeJournal(null);
    ui.hintbar.classList.add('hidden');
    // Ein Objektname aus dem Lauf davor gehoert zur alten Welt: die wortlose
    // Szene setzt keinen eigenen, also darf hier auch keiner stehenbleiben.
    labelPrev = '';
    ui.worldlabel.classList.add('hidden');
    hudPrev = 'einstieg';
    return;
  }
  const h = a.hud;
  if (h.modus === 'grill') {
    ui.walkReadout.classList.add('hidden');
    ui.racerReadout.classList.add('hidden');
    ui.grillReadout.classList.remove('hidden');
    ui.probeReadout.classList.add('hidden');
    setzeJournal(null);
    const sigG = [h.punkte, h.serviert, h.verbrannt, h.takt, h.hint,
      (h.stufen || []).join(''), h.fokus, h.knapp].join('|');
    if (sigG === hudPrev) return;
    hudPrev = sigG;
    ui.gPunkte.textContent = String(h.punkte);
    // Der Nenner ist die Gesamtzahl der Würste, nicht die noch offenen Plätze:
    // nach einer verbrannten Wurst stand hier sonst „2/7" (Auftrag E2).
    ui.gServiert.textContent = `${h.serviert}/${h.gesamt || 8}`;
    ui.gVerbrannt.textContent = String(h.verbrannt);
    ui.gTakt.textContent = String(h.sauber || 0);
    ui.gBpm.textContent = String(h.takt);
    if (h.hint) { ui.hintbar.textContent = h.hint; ui.hintbar.classList.remove('hidden'); }
    else ui.hintbar.classList.add('hidden');
    return;
  }
  ui.grillReadout.classList.add('hidden');
  if (h.modus === 'probe') {
    // Die letzte Probe (DRR-P1): Treffer, Patzer, Satzname und Restzeit.
    ui.walkReadout.classList.add('hidden');
    ui.racerReadout.classList.add('hidden');
    ui.probeReadout.classList.remove('hidden');
    const sigP = ['p', h.treffer, h.patzer, h.satz, Math.ceil(h.restzeit), h.hint].join('|');
    if (sigP === hudPrev) return;
    hudPrev = sigP;
    ui.pTreffer.textContent = String(h.treffer);
    ui.pPatzer.textContent = String(h.patzer);
    ui.pSatz.textContent = h.satz;
    ui.pRest.textContent = `${Math.ceil(h.restzeit)} s`;
    ui.aktsub.textContent = LEVEL.name;
    setzeJournal(h.ziel);
    if (h.hint) { ui.hintbar.textContent = h.hint; ui.hintbar.classList.remove('hidden'); }
    else ui.hintbar.classList.add('hidden');
    return;
  }
  ui.probeReadout.classList.add('hidden');
  if (h.modus === 'racer') {
    // Fahr-Interludium: eigenes HUD
    ui.walkReadout.classList.add('hidden');
    ui.racerReadout.classList.remove('hidden');
    const sig = ['r', h.speed, Math.round(h.zeit * 10), h.hits, Math.round(h.strecke * 200), h.bpm, h.hint, h.rain].join('|');
    if (sig === hudPrev) return;
    hudPrev = sig;
    ui.rSpeed.textContent = String(h.speed);
    ui.rTime.textContent = fmtTime(h.zeit);
    ui.rHits.textContent = String(h.hits);
    ui.rDist.textContent = `${Math.round(h.strecke * 100)}%`;
    ui.rTakt.textContent = String(h.bpm);
    ui.aktsub.textContent = LEVEL.name + (h.rain ? ' · REGEN' : '');
    setzeJournal(h.ziel);
    if (h.hint) { ui.hintbar.textContent = h.hint; ui.hintbar.classList.remove('hidden'); }
    else ui.hintbar.classList.add('hidden');
    return;
  }
  ui.walkReadout.classList.remove('hidden');
  ui.racerReadout.classList.add('hidden');
  const sig = [h.nerves, h.heat, Math.round(h.ohropax), h.outfit.id, h.deckel, h.bpm,
    h.glanz > 0.5, h.hint, h.hidden, h.wetter, h.nass, h.gustDir, h.friert, h.ruhig, h.ziel,
    h.applaus, h.applausPuls].join('|');
  if (sig === hudPrev) return;
  hudPrev = sig;
  // Der Kleingarten hat kein Gedächtnis für Hitze, Takt und Nerven (Befund D5):
  // dort bleibt vom HUD nur, was noch zählt.
  for (const key of ['uOhro', 'uKluft', 'uHitze', 'uWetter', 'uNass', 'uTakt', 'uNerven']) {
    if (ui[key]) ui[key].classList.toggle('hidden', !!h.ruhig);
  }
  ui.deckel.textContent = `${h.deckel}/${h.deckelTotal}`;
  ui.ohro.textContent = h.ohropax > 0 ? `${Math.ceil(h.ohropax)}s` : '—';
  ui.kluft.textContent = h.outfit.short + (h.glanz > 0.5 ? ' ⚡' : '');
  ui.hitze.style.width = Math.min(100, (h.heat / 120) * 100) + '%';
  ui.hitze.parentElement.classList.toggle('hot', h.heat > 60);
  ui.nerven.textContent = '●'.repeat(h.nerves) + '○'.repeat(Math.max(0, h.maxNerves - h.nerves));
  ui.bpm.textContent = String(h.bpm);
  // Applaus nur im Finale zeigen, sonst ausblenden. Er wächst in Stufen
  // (Auftrag A5): Stand am Zielwert, sichtbare Stufenblöcke und ein kurzer
  // Puls bei jedem Einsatz der Zugabe — kein stiller Zahlenwert.
  if (ui.applausWrap) {
    const hatApplaus = h.applaus !== null && h.applaus !== undefined;
    ui.applausWrap.classList.toggle('hidden', !hatApplaus);
    if (hatApplaus) {
      ui.applaus.textContent = h.applausZiel ? `${h.applaus}/${h.applausZiel}` : String(h.applaus);
      if (ui.applausStufen) {
        const n = h.zugabeNoetig || 0;
        const voll = n && h.applausZiel ? Math.round((h.applaus / h.applausZiel) * n) : 0;
        ui.applausStufen.textContent = n
          ? '▮'.repeat(Math.min(n, voll)) + '▯'.repeat(Math.max(0, n - voll)) : '';
      }
      const stufe = String(h.zugabeSchritt === null || h.zugabeSchritt === undefined ? '' : h.zugabeSchritt);
      if (ui.applaus.dataset.stufe !== stufe) {
        ui.applaus.dataset.stufe = stufe;
        ui.applaus.classList.remove('puls');
        void ui.applaus.offsetWidth;      // Animation neu starten
        ui.applaus.classList.add('puls');
      }
    }
  }
  const WETTER_NAMEN = { sonne: 'SONNE', wind: 'WIND', regen: 'REGEN', kaelte: 'KÄLTE' };
  if (ui.wetter) ui.wetter.textContent = WETTER_NAMEN[h.wetter] || '—';
  if (ui.nass) {
    ui.nass.style.width = Math.min(100, h.nass) + '%';
    ui.nass.parentElement.classList.toggle('hot', h.nass > 55);
  }
  const zusatz = h.friert ? ' · FINGER STEIFF'
    : (h.gustDir ? (h.gustDir > 0 ? ' · WINDSTOSS →' : ' · ← WINDSTOSS') : '');
  ui.aktsub.textContent = LEVEL.name + zusatz
    + (h.hidden ? ' · VERSTECKT' : h.slow ? ' · TEMPO HÄNGT' : h.glanz > 0.5 ? ' · GLANZALARM' : '');
  // Journal: der eine Satz, der sagt, was jetzt zu tun ist (DRR-03).
  setzeJournal(h.ziel);
  if (h.hint) { ui.hintbar.textContent = h.hint; ui.hintbar.classList.remove('hidden'); }
  else ui.hintbar.classList.add('hidden');
}

/** Schreibt das Stationsziel ins HUD. Grill-Pausen zeigen kein Ziel. */
function setzeJournal(ziel) {
  if (!ui.journal) return;
  const text = ziel || LEVEL.ziel || null;
  const sig = text || '';
  if (ui.journal.dataset.sig === sig) return;
  ui.journal.dataset.sig = sig;
  ui.journal.textContent = text ? `ZIEL: ${text}` : '';
  ui.journal.classList.toggle('hidden', !text);
}

// ------------------------------------------------- Objektnamen in der Welt --
let labelPrev = '';
function updateWorldLabel() {
  const a = aktiv();
  const l = a && a.hud ? a.hud.label : null;
  if (!l) {
    if (labelPrev !== '') { labelPrev = ''; ui.worldlabel.classList.add('hidden'); }
    return;
  }
  const text = l.action ? `${l.text} · ${IS_TOUCH ? 'AKTION-KNOPF' : l.key || 'E'}` : l.text;
  const r = ui.canvas.getBoundingClientRect();
  const base = ui.stage.getBoundingClientRect();
  const x = Math.round((r.left - base.left) + l.sx * scaleNow);
  const y = Math.round((r.top - base.top) + l.sy * scaleNow);
  const sig = `${text}|${x}|${y}|${l.action ? 1 : 0}`;
  if (sig === labelPrev) return;
  labelPrev = sig;
  ui.worldlabel.textContent = text;
  ui.worldlabel.classList.toggle('action', !!l.action);
  ui.worldlabel.style.left = x + 'px';
  ui.worldlabel.style.top = y + 'px';
  ui.worldlabel.classList.remove('hidden');
}

// ------------------------------------------------------------------- Input --
ui.startBtn.onclick = () => startLevel();
ui.gardeBack.onclick = () => { if (game) { game.resume(); hideAll(); } };
ui.resetBtn.onclick = () => {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  loadAct(0);
  ui.resetBtn.textContent = 'Zurückgesetzt ✓';
};

// Schwierigkeit: „Gemütlich" ist Voreinstellung und Empfehlung.
const DIFF_KEYS = Object.keys(DIFFICULTY);
let diffKey = DIFFICULTY[loadSave().difficulty] ? loadSave().difficulty : 'gemuetlich';
function applyDifficulty() {
  const d = DIFFICULTY[diffKey];
  ui.diffBtn.textContent = `SCHWIERIGKEIT: ${d.label}`;
  ui.diffBtn2.textContent = `SCHWIERIGKEIT: ${d.label}`;
  ui.diffBtn.title = d.note;
  ui.diffBtn2.title = d.note;
  if (game) game.setDifficulty(diffKey);
  if (racer && racer.setDifficulty) racer.setDifficulty(diffKey);
  if (probe && probe.setDifficulty) probe.setDifficulty(diffKey);
  if (grill && grill.setDifficulty) grill.setDifficulty(diffKey);
}
function cycleDifficulty() {
  diffKey = DIFF_KEYS[(DIFF_KEYS.indexOf(diffKey) + 1) % DIFF_KEYS.length];
  writeSave({ difficulty: diffKey });
  applyDifficulty();
}
ui.diffBtn.onclick = cycleDifficulty;
ui.diffBtn2.onclick = cycleDifficulty;

// Ton lässt sich abschalten (das Ticken war zu viel des Guten).
let soundOn = loadSave().sound !== false;
function applySound() {
  audio.setEnabled(soundOn);
  ui.soundBtn.textContent = 'TON: ' + (soundOn ? 'AN' : 'AUS');
}
ui.soundBtn.onclick = () => { soundOn = !soundOn; writeSave({ sound: soundOn }); applySound(); };
applySound();
// Musik je Station: getrennt stumm und laut, Zustand im Spielstand.
// Knöpfe entstehen hier, damit index.html unangetastet bleibt.
ui.musikBtn = document.createElement('button');
ui.musikBtn.type = 'button'; ui.musikBtn.className = 'ghost'; ui.musikBtn.id = 'musikBtn';
ui.soundBtn.after(ui.musikBtn);
ui.musikVol = document.createElement('input');
ui.musikVol.type = 'range'; ui.musikVol.min = '0'; ui.musikVol.max = '100'; ui.musikVol.id = 'musikVol';
ui.musikVol.title = 'MUSIKLAUTSTÄRKE';
ui.musikBtn.after(ui.musikVol);
let musikAn = loadSave().musik !== false;
let musikLaut = Number(loadSave().musikLaut);
if (!Number.isFinite(musikLaut)) musikLaut = 0.8;
musikLaut = Math.max(0, Math.min(1, musikLaut));
function applyMusik() {
  audio.setMusicEnabled(musikAn); audio.setMusicVolume(musikLaut);
  musik.setMuted(!musikAn); musik.setVolume(musikLaut);
  ui.musikBtn.textContent = 'MUSIK: ' + (musikAn ? 'AN' : 'AUS');
  ui.musikVol.value = String(Math.round(musikLaut * 100));
}
ui.musikBtn.onclick = () => { musikAn = !musikAn; writeSave({ musik: musikAn }); applyMusik(); };
ui.musikVol.oninput = () => { musikLaut = Math.max(0, Math.min(1, Number(ui.musikVol.value) / 100)); writeSave({ musikLaut }); applyMusik(); };
applyMusik();
// Live-Tempo für die Musik: Taktwechsel wirken sofort, ohne Neustart.
function liveBpm() { const a = aktiv(); const b = a && a.bpm; return b || LEVEL.bpm || 100; }
// Live-Fortschritt (0–1): die Musik schaltet je Abschnitt eine hörbare Schicht
// zu. Fahrten liefern ihren Streckenanteil, die Akte die Position im Level.
function liveStrecke() {
  const a = aktiv();
  if (!a) return null;
  if (a.hud && typeof a.hud.strecke === 'number') return a.hud.strecke;
  const p = a.player, lv = a.level || LEVEL;
  if (p && lv && lv.w) return Math.max(0, Math.min(1, p.x / (lv.w * TILE)));
  return null;
}
function musikStarten() {
  try { musik.playStation(LEVEL.id, { getBpm: liveBpm, getAbschnitt: liveStrecke }); } catch { /* still weiter */ }
}
// „Kein Ton vor der ersten Nutzeraktion": Musik entsteht nur über einen Klick
// (Startknopf oder Stationsknopf). Beim Laden des Spielstands bleibt es still —
// die Schalter unten fassen deshalb nur bestehende Knoten an.
let musikBereit = false;
function starteMusik() { musikBereit = true; musikStarten(); }
function syncMusik() {
  if (!musikBereit) return;
  const a = aktiv();
  if (!a) return;                 // Garderobe/Übergang: Musik läuft weiter
  try {
    if (musik.aktuellesMotiv() !== LEVEL.id) musik.playStation(LEVEL.id, { getBpm: liveBpm, getAbschnitt: liveStrecke });
    const sollPause = a.state === 'paused' || a.state === 'collapse';
    if (musik.istPausiert() !== sollPause) musik.setPaused(sollPause);
    const dlg = a.dialogAktiv ? a.dialogAktiv() : ((a.hud && a.hud.hintPrio) || 0) >= 3;
    const sollDuck = !!dlg && !sollPause;
    if (musik.istGeduckt() !== sollDuck) musik.setDucked(sollDuck);
  } catch { /* still weiter */ }
}
/** Musik verstummen lassen (Zurück ins Menü) — ohne neuen Kontext zu bauen. */
function musikAnhalten() { try { musik.stop(); } catch { /* still weiter */ } }
applyDifficulty();
ui.resumeBtn.onclick = () => { const a = aktivModus(); if (a && a.resume) a.resume(); hideAll(); };
ui.quitBtn.onclick = () => { game = null; racer = null; grill = null; probe = null; einstieg = null; hudPrev = ''; ui.hintbar.classList.add('hidden'); musikAnhalten(); show('title'); };
ui.collapseBtn.onclick = () => { if (game) game.respawnFromCheckpoint(); hideAll(); };
ui.rewardBtn.onclick = () => {
  if (ui.rewardBtn.dataset.modus === 'grill') {
    delete ui.rewardBtn.dataset.modus;
    grill = null;
    if (game) game.resume();
    hideAll();
    last = performance.now();
    return;
  }
  // Nach einem Fahr-Interludium ist `game` null — deshalb hier nicht darauf zugreifen.
  // Letztes Level (Epilog): der Neustart beginnt wie der Start im Frack, ohne
  // Kleiderauswahl — derselbe Weg wie jede andere Station.
  if (istLetzterAkt()) { startLevel(); return; }
  loadAct(aktIndex + 1);
  for (const h of LEVEL.hints || []) h.shown = false;   // Fahr-Level haben keine
  startLevel();
};
ui.rewardQuit.onclick = () => { game = null; hudPrev = ''; musikAnhalten(); show('title'); };

// Abspann: öffnen aus dem Ergebnis und aus dem Titel, weiterblättern, zurück.
ui.abspannBtn.onclick = () => abspannZeigen('reward', 0);
ui.abspannTitleBtn.onclick = () => abspannZeigen('title', 0);
ui.abspannWeiter.onclick = () => abspannWeiter();
ui.abspannCanvas.onclick = () => abspannWeiter();
ui.abspannZurueck.onclick = () => abspannZu();

window.addEventListener('keydown', (e) => {
  // Solange der Abspann offen ist, gehört die Tastatur ihm — sonst würde ESC
  // zugleich die (längst beendete) Simulation pausieren.
  if (!ui.abspann.classList.contains('hidden')) {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') { e.preventDefault(); abspannWeiter(); }
    else if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); abspannZu(); }
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    const a = aktivModus();
    if (!a) return;
    if (a.state === 'play') { a.pause('user'); show('pause'); }
    else if (a.state === 'paused') { a.resume(); hideAll(); }
  }
});
document.addEventListener('visibilitychange', () => {
  const a = aktivModus();
  if (document.hidden && a && a.state === 'play') { a.pause('user'); show('pause'); }
});

// Touch: Stick
let stickId = null;
function stickMove(ev) {
  const r = ui.stick.getBoundingClientRect();
  const dx = ev.clientX - (r.left + r.width / 2);
  const dy = ev.clientY - (r.top + r.height / 2);
  const lim = r.width / 2 - 14;
  const cx = Math.max(-lim, Math.min(lim, dx));
  const cy = Math.max(-lim, Math.min(lim, dy));
  input.setStick(cx / lim, cy / lim);
  ui.nub.style.transform = `translate(${cx}px,${cy}px)`;
}
function stickReset() { stickId = null; input.resetStick(); ui.nub.style.transform = 'translate(0,0)'; }
ui.stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; ui.stick.setPointerCapture(stickId); stickMove(e); });
ui.stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
ui.stick.addEventListener('pointerup', stickReset);
ui.stick.addEventListener('pointercancel', stickReset);

function holdButton(el, name) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); input.setKey(name, true); audio.resume(); });
  const off = () => input.setKey(name, false);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
holdButton(ui.btnJump, 'jump');
holdButton(ui.btnAction, 'action');
// Die letzte Probe (DRR-P1): die beiden Proben-Tasten sind dieselben Eingaben
// wie E und O. Die Flankenerkennung liegt im Modul — ein gehaltener Knopf
// wertet genau einmal.
holdButton(ui.btnEinsatz, 'action');
holdButton(ui.btnOhropax, 'ohropax');

// Touch-Gerät erkennt sich selbst
if (IS_TOUCH) ui.pad.classList.add('show');
window.addEventListener('touchstart', () => { ui.pad.classList.add('show'); audio.resume(); }, { once: true });

// Beim Start dort weitermachen, wo Roland zuletzt war.
/** Einen alten Spielstand einmalig in die neue Form schreiben (DRR-03). */
function standAuffrischen() {
  try {
    const roh = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (roh && roh.v !== SAVE_VERSION) localStorage.setItem(SAVE_KEY, JSON.stringify(migriereSave(roh)));
  } catch { /* privater Modus: dann eben nicht */ }
}
standAuffrischen();
loadAct(stationIndex(loadSave()));
aktualisiereAbspannZugang();   // wer den Epilog geschafft hat, sieht den Abspann im Titel

// Kurzweg: wer Akt 1 geschafft hat, kann Akt 2 direkt anwählen (zum Ausprobieren
// und Weitergeben, ohne jedes Mal die Katakomben zu spielen).
// Die Stationsknöpfe tragen ihre eigene Auswahl (siehe baueStationswahl).
/**
 * Die Kluft, in der eine Station beginnt. Das letzte Level (Epilog) startet im
 * FRACK und ohne Kleiderauswahl — die Heimkehr ist der Heimweg im Frack, und
 * Zivil gibt es dort nur am Kleiderschrank (Auftrag CUT-1b). Andere Akte
 * bleiben unveraendert bei der Garderobe.
 */
function startKluft() { return LEVEL.id === 'epilog' ? 'frack' : null; }

/** Startet die aktuell geladene Station — Racer sofort, Seitenscroller über die Garderobe. */
function startLevel() {
  audio.resume();
  // Erste Nutzeraktion: ab hier darf Musik entstehen (siehe musikBereit).
  starteMusik();
  if (LEVEL.mode === 'racer' || LEVEL.mode === 'probe') { newGame(OUTFITS.schwarz.id); return; }
  const kluft = startKluft();
  if (kluft) { newGame(kluft); return; }
  renderGarde('start');
}

/** Stationswahl: alle Akte und Interludien, damit nichts unerreichbar bleibt. */
function baueStationswahl() {
  const save = loadSave();
  const darf = save.akt1 === true || stationIndex(save) >= 1 || (save.act || 0) >= 1;
  ui.actRow.classList.toggle('hidden', !darf);
  if (!darf || ui.actRow.childElementCount) return;
  LEVELS.forEach((l, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ghost';
    b.textContent = `${i + 1}. ${l.name}`;
    b.dataset.akt = String(i);
    b.onclick = () => {
      loadAct(i);
      // Fahr-Interludien liefern keine Hints — ohne Guard startete der Klick
      // dort nie, weil die Schleife vor startLevel() geworfen hat (Befund D1).
      for (const h of LEVEL.hints || []) h.shown = false;
      baueStationswahl();
      startLevel();
    };
    ui.actRow.appendChild(b);
  });
  // Kein Rückruf in updateActLabels: das ergäbe eine Endlosrekursion.
}
baueStationswahl();          // ersetzt den alten Zwei-Wege-Umschalter
fit();
requestAnimationFrame(frame);
window.__roland = {
  get game() { return game; }, get racer() { return racer; }, get grill() { return grill; },
  // Die letzte Probe (DRR-P1): Phase, Treffer, Patzer, Restzeit, Verdikt, Plan.
  probe: {
    get szene() { return probe; },
    get aktiv() { return !!probe; },
    get phase() { return probe ? probe.state : null; },
    get treffer() { return probe ? probe.treffer : 0; },
    get patzer() { return probe ? probe.patzer : 0; },
    get restzeit() { return probe ? probe.restzeit() : 0; },
    get verdikt() { return probe && probe.verdikt ? probe.verdikt.id : null; },
    get satz() { return probe ? probe.hud.satz : null; },
    get plan() { return probe ? probe.plan : null; },
    get figuren() { return probe && probe.figuren ? probe.figuren() : []; },
  },
  get aktiv() { return probe || grill || racer || game; },
  get level() { return LEVEL; }, get aktIndex() { return aktIndex; },
  get levelCount() { return LEVELS.length; },
  get levelIds() { return LEVELS.map((l) => l.id); },
  // DRR-F4: welche Klüfte dieses Level zur Wahl stellt (Zivil nur im Garten).
  get kluftWahl() { return outfitWahl(LEVEL).map((o) => o.id); },
  get musik() { return musik; }, get musikBereit() { return musikBereit; },
  // Abspann (Auftrag C1): Zustand und Layout für die Prüfungen.
  abspann: {
    get offen() { return !ui.abspann.classList.contains('hidden'); },
    get seite() { return abspannSeite; },
    get seiten() { return ABSPANN_SEITEN; },
    get herkunft() { return abspannHerkunft; },
    get canvas() { return ui.abspannCanvas; },
    layout: (seite = abspannSeite) => abspannLayout(VIEW, seite),
    zeichne: abspannZeichnen,
    // F2: die Namentexte liegen als DOM-Beschriftung über der Leinwand.
    texte: (seite = abspannSeite) => abspannBeschriftungen(VIEW, seite),
    get texteEbene() { return ui.abspannTextLayer; },
    textMass: abspannTextMass,
    legeTexte: aktualisiereAbspannTextLayout,
  },
  // Die Schlussszene im Kleingarten (Auftrag CUT-1, Umziehen seit CUT-1b):
  // Zustand für die Prüfungen.
  cutscene: {
    get aktiv() { return !!(game && game.szene); },
    get beat() { return game && game.szene ? game.szene.beat : null; },
    get fortschritt() { return game && game.szene ? game.szene.fortschritt : 0; },
    get dauer() { return game && game.szene ? game.szene.dauer : SZENE_DAUER; },
    get gesehen() { return loadSave()[CUT_MERKER] === true; },
    // CUT-1b: der Griff des Umziehens und das Figurenbild dieses Moments.
    get umziehPhase() { return game && game.szene ? game.szene.umziehPhase : null; },
    get bild() { return game && game.szene ? game.szene.figurBild : null; },
    get outfit() { return game ? game.outfit.id : null; },
  },
  // Die Einstiegs-Cutscene vor der Fahrt (Auftrag CUT-2): Zustand für die Prüfungen.
  einstieg: {
    get aktiv() { return !!einstieg; },
    /** Die laufende Szene selbst (Bild- und Zustandsprüfungen im Browser). */
    get szene() { return einstieg; },
    get fahrzeug() { return einstieg ? einstieg.fahrzeug : null; },
    get beat() { return einstieg ? einstieg.beat : null; },
    get fortschritt() { return einstieg ? einstieg.fortschritt : 0; },
    get dauer() { return einstieg ? einstieg.dauer : null; },
    get outfit() { return einstieg ? einstieg.outfit : null; },
    get merker() { return EINSTIEG_MERKER; },
    get dauerJeFahrzeug() { return EINSTIEG_DAUER; },
    get gesehen() {
      const save = loadSave();
      // Die Aufzeichnung im Spielstand — seit Roland (13.09.) nicht mehr die
      // Bedingung fuer einen Lauf, nur noch eine Auskunft.
      return {
        cabrio: einstiegGelaufen('cabrio', save),
        motorrad: einstiegGelaufen('motorrad', save),
      };
    },
    /**
     * Die Szene von Hand starten (Pruefhaken): sie laeuft bei jedem Start des
     * Interludiums — aber nie doppelt, solange eine laeuft.
     */
    starten: (level = LEVEL) => {
      if (einstieg) return false;
      einstieg = einstiegStarten(level, { save: loadSave(), view: VIEW, events: onGameEvent });
      return !!einstieg;
    },
  },
  // Einziger DOM-Textpfad: Tests duerfen denselben Vertrag mit synthetischen
  // logischen Daten vermessen, ohne einen zweiten Renderer einzufuehren.
  textLayer: {
    get element() { return ui.textLayer; },
    render: renderSpieltexte,
    clear: leereSpieltexte,
    map: spieltextMass,
  },
  loadAct, input, get scale() { return scaleNow; },
};
