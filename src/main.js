// main.js — Verkabelung: DOM, Canvas-Skalierung, Overlays, Speicherung.
import { OUTFITS, DIFFICULTY, pickView } from './config.js';
import { SPRITES } from './sprites.js';
import { spriteCanvas } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { LEVELS } from './world.js';
import { Game } from './game.js';
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
  jumpActBtn: $('#jumpActBtn'),
  worldlabel: $('#worldlabel'), soundBtn: $('#soundBtn'), diffBtn: $('#diffBtn'), diffBtn2: $('#diffBtn2'),
  walkReadout: $('#walkReadout'), racerReadout: $('#racerReadout'),
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
function loadAct(i) {
  aktIndex = Math.max(0, Math.min(LEVELS.length - 1, i));
  LEVEL = LEVELS[aktIndex].build();
}

// Belohnung und Fortsetzen je Akt
const REWARDS = {
  akt1: {
    title: 'BELOHNUNG: FEIERABENDBIER',
    text: 'Der Aufzug fährt nach oben, erster Stock: Probenraum. Und in der Hand ein Bier, das niemand mehr wegnehmen kann.',
  },
  akt2: {
    title: 'BELOHNUNG: PAUSENBROT',
    text: 'Hinter der Bühnentür wird es dunkel und warm. Ein Pausenbrot für die nächste Runde — und ein Nerv mehr.',
  },
  akt3: {
    title: 'BELOHNUNG: KANTINENKAFFEE',
    text: 'Lauwarm, mit Kondenswasser am Becherrand. Der Applaus hallt noch im Park, '
      + 'und für einen Moment ist der Frack gar nicht mehr so schlimm.',
  },
  akt4: {
    title: 'BELOHNUNG: DER TAKTSTOCK',
    text: 'Der Dirigent hat ihn liegen lassen. Ab jetzt liegt er im Handschuhfach, '
      + 'zwischen Parkmünzen und einem Fahrschein von 1987.',
  },
  motorrad: {
    title: 'BELOHNUNG: KUEHLE NACHTLUFT',
    text: 'Zwei Stunden Landstrasse, ein Tunnel und kein Mensch mehr auf der Strasse. '
      + 'Der Frack haengt trocken im Koffer, und der Hitzebalken ist auf null.',
  },
  cabrio: {
    title: 'ANGEKOMMEN: OPEN-AIR-BÜHNE',
    text: 'Motor aus, Verdeck bleibt offen. Die Bühne steht schon, der Wind hat die Noten schon einmal verteilt — Akt 3 wartet.',
  },
};
function istLetzterAkt() { return aktIndex >= LEVELS.length - 1; }
function updateActLabels() {
  if (ui.jumpActBtn) updateJumpButton();
  const r = REWARDS[LEVEL.id] || { title: 'AKT GESCHAFFT', text: 'Weiter geht es.' };
  ui.rewardEyebrow.textContent = `${LEVEL.name} GESCHAFFT`;
  ui.rewardTitle.textContent = r.title;
  ui.rewardText.textContent = r.text;
  ui.rewardNote.textContent = istLetzterAkt()
    ? 'Akt 3 ist noch in Arbeit — bis hierher, und danke fürs Durchhalten.'
    : `Weiter mit ${LEVELS[aktIndex + 1].name}.`;
  ui.rewardBtn.textContent = istLetzterAkt() ? 'NOCHMAL \u2192' : 'WEITER \u2192';
}
let game = null;      // Seitenscroller-Simulation
let racer = null;     // Fahr-Interludium
const aktiv = () => racer || game;
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
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
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
  else if (e.type === 'collapse') show('collapse');
  else if (e.type === 'complete') {
    const s = e.stats || {};
    const save = loadSave();
    const best = save.bestTime ? Math.min(save.bestTime, s.time) : s.time;
    writeSave({
      bestTime: best,
      bestDeckel: Math.max(save.bestDeckel || 0, s.deckel),
      act: Math.max(save.act || 0, Math.min(LEVELS.length - 1, aktIndex + 1)),
      [`${LEVEL.id}`]: true,
    });
    updateActLabels();
    ui.rewardBody.innerHTML = '';
    const stats = e.rows || [
      ['ZEIT', fmtTime(s.time)],
      ['BESTE ZEIT', fmtTime(best)],
      ['BIERDECKEL', `${s.deckel} / ${LEVEL.deckelTotal}`],
      ['IM TAKT GETROFFEN', String(s.taktHits)],
    ];
    for (const [k, v] of stats) {
      const d = document.createElement('div');
      d.className = 'stat';
      d.innerHTML = `<span>${k}</span><b>${v}</b>`;
      ui.rewardBody.appendChild(d);
    }
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
function refreshHud() {
  const a = aktiv();
  if (!a) return;
  const h = a.hud;
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
    if (h.hint) { ui.hintbar.textContent = h.hint; ui.hintbar.classList.remove('hidden'); }
    else ui.hintbar.classList.add('hidden');
    return;
  }
  ui.walkReadout.classList.remove('hidden');
  ui.racerReadout.classList.add('hidden');
  const sig = [h.nerves, h.heat, Math.round(h.ohropax), h.outfit.id, h.deckel, h.bpm,
    h.glanz > 0.5, h.hint, h.hidden, h.wetter, h.nass, h.gustDir, h.friert].join('|');
  if (sig === hudPrev) return;
  hudPrev = sig;
  ui.deckel.textContent = `${h.deckel}/${h.deckelTotal}`;
  ui.ohro.textContent = h.ohropax > 0 ? `${Math.ceil(h.ohropax)}s` : '—';
  ui.kluft.textContent = h.outfit.short + (h.glanz > 0.5 ? ' ⚡' : '');
  ui.hitze.style.width = Math.min(100, (h.heat / 120) * 100) + '%';
  ui.hitze.parentElement.classList.toggle('hot', h.heat > 60);
  ui.nerven.textContent = '●'.repeat(h.nerves) + '○'.repeat(Math.max(0, h.maxNerves - h.nerves));
  ui.bpm.textContent = String(h.bpm);
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
  if (h.hint) { ui.hintbar.textContent = h.hint; ui.hintbar.classList.remove('hidden'); }
  else ui.hintbar.classList.add('hidden');
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
  const text = l.action ? `${l.text} · ${IS_TOUCH ? 'TRITT-KNOPF' : l.key || 'E'}` : l.text;
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
ui.startBtn.onclick = () => {
  audio.resume();
  if (LEVEL.mode === 'racer') { newGame(OUTFITS.schwarz.id); return; }   // im Auto egal
  renderGarde('start');
};
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
ui.resumeBtn.onclick = () => { game.resume(); hideAll(); };
ui.quitBtn.onclick = () => { game = null; hudPrev = ''; ui.hintbar.classList.add('hidden'); show('title'); };
ui.collapseBtn.onclick = () => { game.respawnFromCheckpoint(); hideAll(); };
ui.rewardBtn.onclick = () => {
  const outfit = game.outfit.id;
  if (istLetzterAkt()) { newGame(outfit); return; }
  loadAct(aktIndex + 1);          // nächster Akt: wieder über die Garderobe
  for (const h of LEVEL.hints) h.shown = false;
  renderGarde('start');
};
ui.rewardQuit.onclick = () => { game = null; hudPrev = ''; show('title'); };

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!game) return;
    if (game.state === 'play') { game.pause('user'); show('pause'); }
    else if (game.state === 'paused' && game.pauseReason === 'user') { game.resume(); hideAll(); }
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && game.state === 'play') { game.pause('user'); show('pause'); }
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
loadAct(Number(loadSave().act) || 0);

// Kurzweg: wer Akt 1 geschafft hat, kann Akt 2 direkt anwählen (zum Ausprobieren
// und Weitergeben, ohne jedes Mal die Katakomben zu spielen).
ui.jumpActBtn.onclick = () => {
  loadAct(aktIndex === 0 ? 1 : 0);
  for (const h of LEVEL.hints) h.shown = false;
  updateJumpButton();
  renderGarde('start');
};
function updateJumpButton() {
  const save = loadSave();
  const kannWechseln = LEVELS.length > 1 && (save.akt1 === true || (save.act || 0) >= 1);
  ui.jumpActBtn.classList.toggle('hidden', !kannWechseln);
  if (kannWechseln) {
    ui.jumpActBtn.textContent = aktIndex === 0
      ? 'AKT 2 DIREKT SPIELEN\u00a0\u2192'
      : 'AKT 1 NOCHMAL SPIELEN\u00a0\u2192';
  }
}
updateJumpButton();
fit();
requestAnimationFrame(frame);
window.__roland = {
  get game() { return game; }, get racer() { return racer; }, get aktiv() { return racer || game; },
  get level() { return LEVEL; }, get aktIndex() { return aktIndex; },
  loadAct, input, get scale() { return scaleNow; },
};
