// main.js — Verkabelung: DOM, Canvas-Skalierung, Overlays, Speicherung.
import { OUTFITS, DIFFICULTY, pickView } from './config.js';
import { SPRITES } from './sprites.js';
import { spriteCanvas } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { LEVELS } from './world.js';
import { BELOHNUNGEN, SAVE_VERSION, migriereSave, stationIndex } from './story.js';
import { Game } from './game.js';
import { Grill } from './grill.js';
import { Racer } from './racer.js';

const $ = (s) => document.querySelector(s);
const ui = {
  stage: $('#stage'), canvas: $('#game'),
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
  actRow: $('#actRow'),
  worldlabel: $('#worldlabel'), soundBtn: $('#soundBtn'), diffBtn: $('#diffBtn'), diffBtn2: $('#diffBtn2'),
  walkReadout: $('#walkReadout'), racerReadout: $('#racerReadout'),
  grillReadout: $('#grillReadout'), gPunkte: $('#gPunkte'), gServiert: $('#gServiert'),
  gVerbrannt: $('#gVerbrannt'), gTakt: $('#gTakt'), gBpm: $('#gBpm'),
  applaus: $('#applaus'), applausWrap: $('#applausWrap'), journal: $('#journal'),
  uOhro: $('#uOhro'), uKluft: $('#uKluft'), uHitze: $('#uHitze'),
  uWetter: $('#uWetter'), uNass: $('#uNass'), uTakt: $('#uTakt'), uNerven: $('#uNerven'),
  rSpeed: $('#rSpeed'), rTime: $('#rTime'), rHits: $('#rHits'), rDist: $('#rDist'), rTakt: $('#rTakt'),
  pad: $('#pad'), stick: $('#stick'), nub: $('#nub'), btnJump: $('#btnJump'), btnAction: $('#btnAction'),
};
const ctx = ui.canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// Gerät, Sichtbereich, Bedienart einmal feststellen.
const COARSE = !!(window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches);
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || COARSE;
const VIEW = pickView(COARSE);
ui.canvas.width = VIEW.w;
ui.canvas.height = VIEW.h;
let scaleNow = 1;

const input = createInput(window);
const audio = createAudio();
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
}
let game = null;      // Seitenscroller-Simulation
let racer = null;     // Fahr-Interludium
let grill = null;     // Bratwurst-Minispiel im Epilog
const aktiv = () => grill || racer || game;
const aktivModus = () => grill || racer || game;
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
const OVERLAYS = ['title', 'garde', 'pause', 'collapse', 'reward'];
function show(name) {
  for (const o of OVERLAYS) ui[o].classList.toggle('hidden', o !== name);
  if (!name) for (const o of OVERLAYS) ui[o].classList.add('hidden');
}
function hideAll() { for (const o of OVERLAYS) ui[o].classList.add('hidden'); }

function renderGarde(mode) {
  gardeMode = mode;
  ui.gardeTitle.textContent = mode === 'start' ? 'WAS ZIEHST DU AN?' : 'UMZIEHEN';
  ui.gardeBack.classList.toggle('hidden', mode === 'start');
  ui.gardeCards.innerHTML = '';
  for (const o of Object.values(OUTFITS)) {
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
  if (LEVEL.mode === 'racer') {
    // Fahr-Interludium: gleiche Steuerung, andere Simulation
    racer = new Racer({ level: LEVEL, input, audio, events: onGameEvent, view: VIEW, difficulty: diffKey });
    game = null;
  } else {
    racer = null;
    game = new Game({ level: LEVEL, input, audio, events: onGameEvent, view: VIEW, difficulty: diffKey });
    game.reset(outfitId);
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
      ['BIERDECKEL', `${s.deckel} / ${LEVEL.deckelTotal}`],
      ['IM TAKT GETROFFEN', String(s.taktHits)],
    ]);
    const icon = document.createElement('canvas');
    icon.className = 'rewardIcon';
    icon.width = 40; icon.height = 52;
    const g = icon.getContext('2d');
    g.imageSmoothingEnabled = false;
    const spr = LEVEL.mode === 'racer'
      ? spriteCanvas('mx5', SPRITES.mx5)
      : spriteCanvas('bier', SPRITES.bier);
    const iz = Math.round((40 / spr.w) * spr.h);
    g.drawImage(spr.canvas, 0, 0, spr.w, spr.h, 0, 0, 40, iz);
    ui.rewardBody.prepend(icon);
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

// -------------------------------------------------------------------- Loop --
let last = 0, hudAcc = 0, hudPrev = '';
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
  last = now;
  const a = aktiv();
  if (a) {
    a.update(dt);
    a.draw(ctx);
    updateWorldLabel();
    hudAcc += dt;
    if (hudAcc > 0.08) { hudAcc = 0; refreshHud(); }
  }
}
// Die Knoepfe heissen in jedem Modus anders — sonst luegen sie (Review Befund 8).
function setzeKnopfBeschriftung() {
  const modus = grill ? 'grill' : racer ? 'racer' : 'lauf';
  const jump = modus === 'lauf' ? 'SPRUNG' : '—';
  // E ist im Laufmodus kontextsensitiv. Bei einer Figur oder einem Gegenstand
  // darf die Touch-Oberfläche nicht weiter behaupten, man würde zutreten.
  const hatAktion = modus === 'lauf' && !!(game?.hud?.label?.action);
  const akt = modus === 'racer' ? 'BREMSE' : modus === 'grill' ? 'WENDEN' : hatAktion ? 'AKTION' : 'TRITT';
  if (ui.btnJump.textContent !== jump) ui.btnJump.textContent = jump;
  if (ui.btnAction.textContent !== akt) ui.btnAction.textContent = akt;
  ui.btnJump.style.opacity = modus === 'lauf' ? '' : '0.3';
  ui.btnJump.style.pointerEvents = modus === 'lauf' ? '' : 'none';
}
function refreshHud() {
  const a = aktiv();
  setzeKnopfBeschriftung();
  if (!a) return;
  const h = a.hud;
  if (h.modus === 'grill') {
    ui.walkReadout.classList.add('hidden');
    ui.racerReadout.classList.add('hidden');
    ui.grillReadout.classList.remove('hidden');
    setzeJournal(null);
    const sigG = [h.punkte, h.serviert, h.verbrannt, h.takt, h.hint].join('|');
    if (sigG === hudPrev) return;
    hudPrev = sigG;
    ui.gPunkte.textContent = String(h.punkte);
    ui.gServiert.textContent = `${h.serviert}/${h.serviert + h.offen}`;
    ui.gVerbrannt.textContent = String(h.verbrannt);
    ui.gTakt.textContent = String(h.sauber || 0);
    ui.gBpm.textContent = String(h.takt);
    if (h.hint) { ui.hintbar.textContent = h.hint; ui.hintbar.classList.remove('hidden'); }
    else ui.hintbar.classList.add('hidden');
    return;
  }
  ui.grillReadout.classList.add('hidden');
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
    h.glanz > 0.5, h.hint, h.hidden, h.wetter, h.nass, h.gustDir, h.friert, h.ruhig, h.ziel].join('|');
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
  // Applaus nur im Finale zeigen, sonst ausblenden
  if (ui.applausWrap) {
    const hatApplaus = h.applaus !== null && h.applaus !== undefined;
    ui.applausWrap.classList.toggle('hidden', !hatApplaus);
    if (hatApplaus) ui.applaus.textContent = `${h.applaus}%`;
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
applyDifficulty();
ui.resumeBtn.onclick = () => { const a = aktivModus(); if (a && a.resume) a.resume(); hideAll(); };
ui.quitBtn.onclick = () => { game = null; racer = null; grill = null; hudPrev = ''; ui.hintbar.classList.add('hidden'); show('title'); };
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
  const outfit = game ? game.outfit.id : OUTFITS.schwarz.id;
  if (istLetzterAkt()) { newGame(outfit); return; }
  loadAct(aktIndex + 1);
  for (const h of LEVEL.hints || []) h.shown = false;   // Fahr-Level haben keine
  startLevel();
};
ui.rewardQuit.onclick = () => { game = null; hudPrev = ''; show('title'); };

window.addEventListener('keydown', (e) => {
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

// Kurzweg: wer Akt 1 geschafft hat, kann Akt 2 direkt anwählen (zum Ausprobieren
// und Weitergeben, ohne jedes Mal die Katakomben zu spielen).
// Die Stationsknöpfe tragen ihre eigene Auswahl (siehe baueStationswahl).
/** Startet die aktuell geladene Station — Racer sofort, Seitenscroller über die Garderobe. */
function startLevel() {
  audio.resume();
  if (LEVEL.mode === 'racer') { newGame(OUTFITS.schwarz.id); return; }
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
  get aktiv() { return grill || racer || game; },
  get level() { return LEVEL; }, get aktIndex() { return aktIndex; },
  get levelCount() { return LEVELS.length; },
  get levelIds() { return LEVELS.map((l) => l.id); },
  loadAct, input, get scale() { return scaleNow; },
};
