// tests/browser-smoke.mjs — prüft das echte Spiel in einem echten Browser.
// Startet Chromium headless, steuert es über das DevTools-Protokoll, prüft
// Laden, Start, Umziehen, Tastatur, Rendering und Fehlerfreiheit und legt einen
// Screenshot ab. Aufruf: node tests/browser-smoke.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Die Vornamen des Abspanns stehen im Modul — der Browserlauf vergleicht die
// Textebene damit, statt Namen im Testskript zu wiederholen (F2).
import { abspannNamen } from '../src/credits.js';

const URL_TO_TEST = process.argv[2] || 'http://127.0.0.1:8123/';
const TESTMODUS = new URL(URL_TO_TEST).searchParams.get('test');
const GEZIELTER_ABSCHLUSS = Symbol('gezielter Browserlauf abgeschlossen');
// Zufallsport: ein alter, haengengebliebener Browser darf den Lauf nicht kapern
const PORT = 9400 + Math.floor(Math.random() * 400);
const results = [];
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ' — ' + extra}`);
};

function findChromium() {
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (existsSync(p)) return p;
  }
  return null;
}

const chromiumPath = findChromium();
if (!chromiumPath) {
  console.log('SKIP browser smoke: kein Chromium gefunden');
  process.exit(0);
}

const profile = mkdtempSync(join(tmpdir(), 'roland-chrome-'));
const chrome = spawn(chromiumPath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--no-sandbox', '--mute-audio',
  // Ton im Prüflauf: der Browser darf den AudioContext nicht aus Höflichkeit
  // sperren — geprüft wird, dass die Seite ihn erst nach dem Start anlegt.
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1280,720', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ANTWORT_MS = 30000;      // Antwortgrenze je Browserauftrag (siehe evaluate)
const laufStart = Date.now();  // Gesamtlaufzeit fuer den Nachweis

async function targetWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* noch nicht bereit */ }
    await sleep(250);
  }
  throw new Error('Chromium DevTools nicht erreichbar');
}

const wsUrl = await targetWs();
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let nextId = 1;
const pending = new Map();
const jsErrors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    jsErrors.push('exception: ' + (d.exception?.description || d.text));
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    jsErrors.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    jsErrors.push('log: ' + msg.params.entry.text + ' @ ' + (msg.params.entry.url || '?'));
  }
};
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expr) {
  // Harte Antwortgrenze je Browserauftrag (A4h): haengt die Seite (Endlosschleife
  // im Spielcode), kommt auf Runtime.evaluate nie eine Antwort. Ohne Grenze
  // friert der Lauf stumm ein und endet erst in der Zeitgrenze des Aufrufers —
  // mit null Ausgabezeilen. Mit Grenze gibt es FAIL mit Meldung.
  const r = await Promise.race([
    send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }),
    new Promise((_, rej) => {
      const t = setTimeout(() => rej(new Error(
        `keine Antwort vom Browser nach ${ANTWORT_MS / 1000} s auf: ${expr.slice(0, 90)}`)), ANTWORT_MS);
      t.unref?.();
    }),
  ]);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '') + ' | Ausdruck: ' + expr.replace(/\s+/g, ' ').slice(0, 200));
  return r.result.value;
}
async function key(code, type) {
  const map = {
    KeyD: [68, 'd'], KeyA: [65, 'a'], Space: [32, ' '], KeyE: [69, 'e'], KeyP: [80, 'p'],
    ArrowDown: [40, 'ArrowDown'], KeyS: [83, 's'], ArrowUp: [38, 'ArrowUp'],
    Escape: [27, 'Escape'],
  };
  const [vk, k] = map[code];
  await send('Input.dispatchKeyEvent', {
    type, code, key: k, text: type === 'char' ? k : undefined,
    windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
  });
}
// Echter Mausklick auf ein Element: nur so entsteht die Nutzeraktion, die der
// Browser für Ton verlangt (`element.click()` in der Konsole zählt nicht).
async function echterKlick(selector) {
  const r = JSON.parse(await evaluate(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!e) return 'null';
    const b = e.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) });
  })()`));
  if (!r) return false;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
}
// Auswertung mit Nutzeraktion (Rückfallebene, wenn der Mausklick nicht landet).
async function evaluateMitGeste(expr) {
  const r = await send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}

/**
 * Startet den Grill ueber den echten Spielpfad und vermisst dieselbe DOM-
 * Beschriftung im mobilen Hoch- und Querformat.
 */
async function pruefeGrilltexteMobil({ domAus = false } = {}) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 412, height: 892, deviceScaleFactor: 2.6, mobile: true,
    screenOrientation: { type: 'portraitPrimary', angle: 0 },
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: URL_TO_TEST + (URL_TO_TEST.includes('?') ? '&' : '?') + 'v=' + Date.now() });
  await sleep(2200);

  const epilogIndex = await evaluate("window.__roland.levelIds.indexOf('epilog')");
  check('Grill-DOM: der mobile Bedienpfad findet den Epilog', epilogIndex >= 0, String(epilogIndex));
  await evaluate(`window.__roland.loadAct(${epilogIndex})`);
  await echterKlick('#startBtn');
  await sleep(320);
  // Seit dem Auftrag „Epilog-Ramona" startet der Kleingarten im Frack, ohne
  // Kleiderauswahl — die Garderobe bleibt zu.
  check('Grill-DOM: der Kleingarten startet ohne Kleiderauswahl',
    (await evaluate("document.getElementById('garde').classList.contains('hidden')")) === true
      && (await evaluate('window.__roland.game.outfit.id')) === 'frack',
    await evaluate("JSON.stringify({ garde: document.getElementById('garde').className, outfit: window.__roland.game.outfit.id })"));
  await sleep(700);
  await evaluate(`(() => {
    const g = window.__roland.game;
    const grill = g.entities.find((e) => e.kind === 'grill');
    g.player.x = grill.x - 16;
    g.player.y = grill.y + grill.h - g.player.h;
    g.player.vx = 0;
    g.player.vy = 0;
  })()`);
  await sleep(350);
  await key('KeyE', 'keyDown');
  await sleep(180);
  await key('KeyE', 'keyUp');
  await sleep(650);
  check('Grill-DOM: echter Tastendruck startet den Grill im mobilen Browser',
    (await evaluate("window.__roland.grill?.hud?.modus || ''")) === 'grill');

  // Dynamische Werte muessen ohne zweiten Renderer bis ins DOM gelangen.
  await evaluate(`(() => {
    const g = window.__roland.grill;
    g.wuerserste[0].gar = 70;
    g.wuerserste[g.auswahl].gar = 70;
    g.wuerserste[3].zustand = 'fertig';
    g.punktestand = 340;
    g.sauber = 3;
    g.verbrannt = 1;
    g.fertig = 2;
  })()`);
  await sleep(260);

  // Negative Kontrolle: Derselbe Test muss rot werden, wenn die einzige Ebene
  // testweise aus dem Dokument entfernt wird.
  if (domAus) await evaluate("document.getElementById('gameTextLayer')?.remove()");

  const messe = async (ausrichtung) => JSON.parse(await evaluate(`(() => {
    const rechteck = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom,
      width: r.width, height: r.height });
    const g = window.__roland.grill;
    const c = document.getElementById('game');
    const layer = document.getElementById('gameTextLayer');
    const hud = document.querySelector('.hud');
    const pad = document.getElementById('pad');
    const cr = c.getBoundingClientRect();
    const canvas = rechteck(cr);
    if (!g || !layer) return JSON.stringify({ ausrichtung: ${JSON.stringify(ausrichtung)},
      fehlt: !g ? 'grill' : 'gameTextLayer', canvas });
    const lr = layer.getBoundingClientRect();
    const hr = hud.getBoundingClientRect();
    const pr = pad.getBoundingClientRect();
    const daten = g.beschriftungen();
    const staerke = [...layer.querySelectorAll('[data-text-id]')];
    const sx = cr.width / g.vw, sy = cr.height / g.vh;
    // Phase A: Texte unter dem globalen HUD ruecken um den gemessenen HUD-Abstand
    // nach unten. --hud-h wird in main.js aus dem echten HUD-Rechteck gesetzt.
    const hudVar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-h')) || 0;
    const grenze = Math.round(cr.height * 0.35);
    const abstand = Math.min(Math.max(0, hr.bottom - cr.top + 4), grenze);
    const ids = ['grill-garstufe-0', 'grill-garstufe-1', 'grill-garstufe-2',
      'grill-teller', 'grill-vorrat', 'grill-status'];
    const texte = Object.fromEntries(staerke.map((e) => [e.dataset.textId, e.textContent]));
    const fehler = daten.map((d) => {
      const e = layer.querySelector('[data-text-id="' + d.id + '"]');
      if (!e) return { id: d.id, fehlt: true };
      const er = e.getBoundingClientRect();
      const zusatz = d.unterHud ? abstand : 0;
      return {
        id: d.id, text: e.textContent,
        lage: Math.max(Math.abs(er.left - (cr.left + d.x * sx)),
          Math.abs(er.top - (cr.top + d.y * sy + zusatz))),
        mass: Math.max(Math.abs(er.width - d.w * sx), Math.abs(er.height - d.h * sy)),
        schrift: parseFloat(getComputedStyle(e).fontSize),
        unterHud: Math.round((er.top - hr.bottom) * 100) / 100,
        ueberPad: Math.round((pr.top - er.bottom) * 100) / 100,
        vonOben: Math.round((er.top - cr.top) * 100) / 100,
      };
    });
    const status = fehler.find((f) => f.id === 'grill-status') || {};
    return JSON.stringify({
      ausrichtung: ${JSON.stringify(ausrichtung)}, state: g.state,
      view: { w: g.vw, h: g.vh }, canvas, overlay: rechteck(lr), hud: rechteck(hr), pad: rechteck(pr),
      scaleX: sx, scaleY: sy, hudVar, grenze, abstand,
      overlayAbweichung: Math.max(Math.abs(lr.left - cr.left), Math.abs(lr.top - cr.top),
        Math.abs(lr.width - cr.width), Math.abs(lr.height - cr.height)),
      anzahl: staerke.length, daten: daten.length,
      lageFehler: Math.max(...fehler.map((f) => (f.lage === undefined ? 99 : f.lage))),
      massFehler: Math.max(...fehler.map((f) => (f.mass === undefined ? 99 : f.mass))),
      schriftMin: Math.min(...fehler.map((f) => (f.schrift === undefined ? 0 : f.schrift))),
      alleInnen: staerke.every((e) => {
        const r = e.getBoundingClientRect();
        return r.left >= cr.left - 0.5 && r.top >= cr.top - 0.5
          && r.right <= cr.right + 0.5 && r.bottom <= cr.bottom + 0.5;
      }),
      vollstaendig: ids.every((id) => Object.hasOwn(texte, id)) && staerke.length === ids.length,
      semantik: staerke.every((e) => e.id === 'spieltext-' + e.dataset.textId),
      versalien: Object.values(texte).every((text) => text === text.toUpperCase()),
      punkteImReadout: document.getElementById('gPunkte').textContent,
      verbranntImReadout: document.getElementById('gVerbrannt').textContent,
      texte, fehler, status,
    });
  })()`));

  const hoch = await messe('hoch');
  check('Grill-DOM: Hochformat bildet jedes Label mit hoechstens 1 CSS-Pixel Abweichung ab',
    !hoch.fehlt && hoch.lageFehler <= 1 && hoch.massFehler <= 1 && hoch.overlayAbweichung <= 1,
    JSON.stringify({ lage: hoch.lageFehler, mass: hoch.massFehler,
      overlay: hoch.overlayAbweichung, skala: [hoch.scaleX, hoch.scaleY] }));
  check('Grill-DOM: Hochformat haelt alle Texte im sichtbaren Canvas',
    !hoch.fehlt && hoch.vollstaendig && hoch.alleInnen && hoch.semantik && hoch.versalien,
    JSON.stringify({ vollstaendig: hoch.vollstaendig, innen: hoch.alleInnen,
      semantik: hoch.semantik, versalien: hoch.versalien }));
  check('Grill-DOM: Garstufen, Teller, Vorrat und die eine Statuszeile stehen in der Ebene',
    !hoch.fehlt && hoch.texte['grill-garstufe-0'] === 'GOLDBRAUN'
      && hoch.texte['grill-teller'] === 'TELLER 1' && hoch.texte['grill-vorrat'] === 'VORRAT 4'
      && hoch.texte['grill-status'] === 'OFFEN 6 · FOKUS GOLDBRAUN · IM TAKT 3',
    JSON.stringify(hoch.texte || hoch));
  check('Grill-DOM: Punkte und Verbrannt stehen nur im globalen Readout',
    !hoch.fehlt && hoch.punkteImReadout === '340' && hoch.verbranntImReadout === '1'
      && Object.values(hoch.texte || {}).every((t) => !/PUNKTE|VERBRANNT|SERVIERT/.test(t)),
    JSON.stringify({ punkte: hoch.punkteImReadout, verbrannt: hoch.verbranntImReadout,
      texte: Object.values(hoch.texte || {}) }));
  check('Grill-DOM: kein Text der Ebene faellt unter 12 CSS-Pixel',
    !hoch.fehlt && hoch.schriftMin >= 12, `kleinste Schrift ${hoch.schriftMin}px`);
  check('Grill-DOM: die Statuszeile sitzt oben, unter dem HUD und ueber der Touch-Bedienung',
    !hoch.fehlt && hoch.status.lage <= 1 && hoch.status.unterHud >= 3 && hoch.status.ueberPad >= 3
      && hoch.status.vonOben < hoch.canvas.height / 2,
    JSON.stringify(hoch.status));
  check('Grill-DOM: --hud-h traegt die gemessene HUD-Hoehe in CSS-Pixeln',
    !hoch.fehlt && hoch.hudVar > 20 && Math.abs(hoch.hudVar - hoch.hud.height) <= 1.5,
    `--hud-h=${hoch.hudVar}px, HUD=${hoch.hud?.height}px`);

  const artefaktDir = fileURLToPath(new URL('../.artifacts/', import.meta.url));
  mkdirSync(artefaktDir, { recursive: true });
  const hochBild = join(artefaktDir, 'phase-a-grill-hoch.png');
  const querBild = join(artefaktDir, 'phase-a-grill-quer.png');
  const logPfad = join(artefaktDir, 'phase-a-grill-messung.json');
  if (hoch.canvas?.width > 0 && hoch.canvas?.height > 0) {
    const bild = await send('Page.captureScreenshot', {
      format: 'png', fromSurface: true,
      clip: { x: hoch.canvas.left, y: hoch.canvas.top,
        width: hoch.canvas.width, height: hoch.canvas.height, scale: 1 },
    });
    writeFileSync(hochBild, Buffer.from(bild.data, 'base64'));
  }

  await send('Emulation.setDeviceMetricsOverride', {
    width: 892, height: 412, deviceScaleFactor: 2.6, mobile: true,
    screenOrientation: { type: 'landscapePrimary', angle: 90 },
  });
  await evaluate("window.dispatchEvent(new Event('orientationchange'))");
  await sleep(750);
  const quer = await messe('quer');
  check('Grill-DOM: Querformat bildet dieselben Labels mit hoechstens 1 CSS-Pixel Abweichung ab',
    !quer.fehlt && quer.lageFehler <= 1 && quer.massFehler <= 1 && quer.overlayAbweichung <= 1,
    JSON.stringify({ lage: quer.lageFehler, mass: quer.massFehler,
      overlay: quer.overlayAbweichung, skala: [quer.scaleX, quer.scaleY] }));
  check('Grill-DOM: Querformat haelt alle Textboxen im sichtbaren Canvas',
    !quer.fehlt && quer.vollstaendig && quer.alleInnen && quer.semantik && quer.versalien,
    JSON.stringify({ vollstaendig: quer.vollstaendig, innen: quer.alleInnen }));
  check('Grill-DOM: Statuszeile bleibt im Querformat unter dem HUD und ueber der Bedienung',
    !quer.fehlt && quer.status.unterHud >= 3 && quer.status.ueberPad >= 3,
    JSON.stringify(quer.status));

  writeFileSync(logPfad, JSON.stringify({ hoch, quer }, null, 2) + '\n');
  if (quer.canvas?.width > 0 && quer.canvas?.height > 0) {
    const bild = await send('Page.captureScreenshot', {
      format: 'png', fromSurface: true,
      clip: { x: quer.canvas.left, y: quer.canvas.top,
        width: quer.canvas.width, height: quer.canvas.height, scale: 1 },
    });
    writeFileSync(querBild, Buffer.from(bild.data, 'base64'));
  }
  check('Grill-DOM: Chromium-Bilder und numerisches Messprotokoll sind geschrieben',
    existsSync(hochBild) && existsSync(querBild) && existsSync(logPfad)
      && !hoch.fehlt && !quer.fehlt);
  if (!domAus) {
    check('Grill-DOM: keine Browserfehler im mobilen Grillpfad',
      (await evaluate('JSON.stringify(window.__errors)')) === '[]',
      await evaluate('JSON.stringify(window.__errors)'));
  }
  results.push(`GRILL-DOM HOCH ${hoch.canvas?.width || 0}x${hoch.canvas?.height || 0}`
    + ` sx=${hoch.scaleX ?? '-'} sy=${hoch.scaleY ?? '-'} lage=${hoch.lageFehler ?? '-'}px`
    + ` Schrift>=${hoch.schriftMin ?? '-'}px HUD-Abstand=${hoch.status?.unterHud ?? '-'}px`
    + ` Pad-Abstand=${hoch.status?.ueberPad ?? '-'}px`);
  results.push(`GRILL-DOM QUER ${quer.canvas?.width || 0}x${quer.canvas?.height || 0}`
    + ` sx=${quer.scaleX ?? '-'} sy=${quer.scaleY ?? '-'} lage=${quer.lageFehler ?? '-'}px`
    + ` Schrift>=${quer.schriftMin ?? '-'}px HUD-Abstand=${quer.status?.unterHud ?? '-'}px`
    + ` Pad-Abstand=${quer.status?.ueberPad ?? '-'}px`);
  results.push(`GRILL-DOM BILDER ${hochBild} ${querBild}`);
  results.push(`GRILL-DOM MESSUNG ${logPfad}`);
  return { hoch, quer };
}

/**
 * Startet das Cabrio-Interludium ueber den echten Spielpfad und vermisst die
 * hochaufgeloeste Fahr-HUD-Ebene im mobilen Hoch- und Querformat. Negative
 * Kontrolle: dieselben Pruefungen muessen ohne die eine Ebene rot werden.
 */
async function pruefeFahrHudMobil({ domAus = false } = {}) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 412, height: 892, deviceScaleFactor: 2.6, mobile: true,
    screenOrientation: { type: 'portraitPrimary', angle: 0 },
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: URL_TO_TEST + (URL_TO_TEST.includes('?') ? '&' : '?') + 'v=' + Date.now() });
  await sleep(2200);

  const cabrioIndex = await evaluate("window.__roland.levelIds.indexOf('cabrio')");
  check('Fahr-HUD: der mobile Bedienpfad findet das Cabrio-Interludium', cabrioIndex >= 0, String(cabrioIndex));
  await evaluate(`window.__roland.loadAct(${cabrioIndex})`);
  await echterKlick('#startBtn');
  // Seit Roland (13.09.) laeuft die Einstiegs-Cutscene bei JEDEM Start der
  // Fahrt: erst sie abwarten — waehrend der Szene liegt kein Fahr-HUD in der
  // Ebene (genau die Labels, die dieser Block vermisst).
  await warteEinstiegVorbei();
  await sleep(900);
  check('Fahr-HUD: das Interludium laeuft im mobilen Browser',
    (await evaluate("window.__roland.racer && window.__roland.racer.hud.modus")) === 'racer',
    await evaluate("String(window.__roland.racer && window.__roland.racer.state)"));
  // Anhalten: gemessen wird die Ebene, nicht die Fahrt. Die Simulation selbst
  // bleibt unangetastet (derselbe Racer, nur state === 'paused').
  await evaluate("window.__roland.racer.state === 'play' && window.__roland.racer.pause('test')");
  await sleep(500);

  // Negative Kontrolle: ohne die eine Ebene darf keine dieser Pruefungen gruen sein.
  if (domAus) await evaluate("document.getElementById('gameTextLayer')?.remove()");

  const messe = async (ausrichtung) => JSON.parse(await evaluate(`(() => {
    const rechteck = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom,
      width: r.width, height: r.height });
    const r = window.__roland.racer;
    const c = document.getElementById('game');
    const layer = document.getElementById('gameTextLayer');
    const hud = document.querySelector('.hud');
    const cr = c.getBoundingClientRect();
    const canvas = rechteck(cr);
    if (!r || !layer) return JSON.stringify({ ausrichtung: ${JSON.stringify(ausrichtung)},
      fehlt: !r ? 'racer' : 'gameTextLayer', canvas });
    const lr = layer.getBoundingClientRect();
    const hr = hud.getBoundingClientRect();
    const daten = r.beschriftungen();
    const staerke = [...layer.querySelectorAll('[data-text-id]')];
    const sx = cr.width / r.vw, sy = cr.height / r.vh;
    const hudVar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-h')) || 0;
    const grenze = Math.round(cr.height * 0.35);
    const abstand = Math.min(Math.max(0, hr.bottom - cr.top + 4), grenze);
    const texte = Object.fromEntries(staerke.map((e) => [e.dataset.textId, e.textContent]));
    const fehler = daten.map((d) => {
      const e = layer.querySelector('[data-text-id="' + d.id + '"]');
      if (!e) return { id: d.id, fehlt: true };
      const er = e.getBoundingClientRect();
      const zusatz = d.unterHud ? abstand : 0;
      return {
        id: d.id, text: e.textContent,
        lage: Math.max(Math.abs(er.left - (cr.left + d.x * sx)),
          Math.abs(er.top - (cr.top + d.y * sy + zusatz))),
        mass: Math.max(Math.abs(er.width - d.w * sx), Math.abs(er.height - d.h * sy)),
        schrift: parseFloat(getComputedStyle(e).fontSize),
        unterHud: Math.round((er.top - hr.bottom) * 100) / 100,
      };
    });
    return JSON.stringify({
      ausrichtung: ${JSON.stringify(ausrichtung)}, state: r.state,
      view: { w: r.vw, h: r.vh }, canvas, overlay: rechteck(lr), hud: rechteck(hr),
      scaleX: sx, scaleY: sy, hudVar, grenze, abstand,
      overlayAbweichung: Math.max(Math.abs(lr.left - cr.left), Math.abs(lr.top - cr.top),
        Math.abs(lr.width - cr.width), Math.abs(lr.height - cr.height)),
      anzahl: staerke.length, daten: daten.length,
      lageFehler: Math.max(...fehler.map((f) => (f.lage === undefined ? 99 : f.lage))),
      massFehler: Math.max(...fehler.map((f) => (f.mass === undefined ? 99 : f.mass))),
      schriftMin: Math.min(...fehler.map((f) => (f.schrift === undefined ? 0 : f.schrift))),
      alleInnen: staerke.every((e) => {
        const k = e.getBoundingClientRect();
        return k.left >= cr.left - 0.5 && k.top >= cr.top - 0.5
          && k.right <= cr.right + 0.5 && k.bottom <= cr.bottom + 0.5;
      }),
      unterHud: Math.min(...fehler.map((f) => (f.unterHud === undefined ? -99 : f.unterHud))),
      semantik: staerke.every((e) => e.id === 'spieltext-' + e.dataset.textId),
      versalien: Object.values(texte).every((text) => text === text.toUpperCase()),
      sig: (layer.dataset.sig || '').length,
      texte, fehler,
    });
  })()`));

  const hoch = await messe('hoch');
  check('Fahr-HUD: Hochformat bildet jedes Label mit hoechstens 1 CSS-Pixel Abweichung ab',
    !hoch.fehlt && hoch.lageFehler <= 1 && hoch.massFehler <= 1 && hoch.overlayAbweichung <= 1,
    JSON.stringify({ lage: hoch.lageFehler, mass: hoch.massFehler, overlay: hoch.overlayAbweichung }));
  check('Fahr-HUD: Hochformat haelt alle Labels im sichtbaren Canvas',
    !hoch.fehlt && hoch.alleInnen && hoch.semantik && hoch.versalien
      && hoch.anzahl === hoch.daten && hoch.anzahl === 8,
    JSON.stringify({ innen: hoch.alleInnen, semantik: hoch.semantik, anzahl: hoch.anzahl, daten: hoch.daten }));
  check('Fahr-HUD: Abschnitt, Segmente, Richtung, Richttempo und Cue stehen im DOM',
    !hoch.fehlt && /^1 \/ 4 /.test(hoch.texte['ro-abschnitt'] || '')
      && hoch.texte['ro-richtung'] === 'GERADEAUS'
      && /^RICHTTEMPO \d+$/.test(hoch.texte['ro-tempo'] || '')
      && (hoch.texte['ro-cue'] || '').length > 6
      && ['ro-segmente-0', 'ro-segmente-1', 'ro-segmente-2', 'ro-segmente-3']
        .every((id) => hoch.texte[id] === '█' || hoch.texte[id] === '░'),
    JSON.stringify(hoch.texte || hoch));
  check('Fahr-HUD: kein Text der Ebene faellt unter 12 CSS-Pixel',
    !hoch.fehlt && hoch.schriftMin >= 12, `kleinste Schrift ${hoch.schriftMin}px`);
  check('Fahr-HUD: kein Label der Ebene liegt im globalen HUD',
    !hoch.fehlt && hoch.unterHud >= 3, `kleinster HUD-Abstand ${hoch.unterHud}px`);

  const artefaktDir = fileURLToPath(new URL('../.artifacts/', import.meta.url));
  mkdirSync(artefaktDir, { recursive: true });
  const hochBild = join(artefaktDir, 'phase-a-fahrhud-hoch.png');
  const querBild = join(artefaktDir, 'phase-a-fahrhud-quer.png');
  const logPfad = join(artefaktDir, 'phase-a-fahrhud-messung.json');
  if (hoch.canvas?.width > 0 && hoch.canvas?.height > 0) {
    const bild = await send('Page.captureScreenshot', {
      format: 'png', fromSurface: true,
      clip: { x: hoch.canvas.left, y: hoch.canvas.top,
        width: hoch.canvas.width, height: hoch.canvas.height, scale: 1 },
    });
    writeFileSync(hochBild, Buffer.from(bild.data, 'base64'));
  }

  await send('Emulation.setDeviceMetricsOverride', {
    width: 892, height: 412, deviceScaleFactor: 2.6, mobile: true,
    screenOrientation: { type: 'landscapePrimary', angle: 90 },
  });
  await evaluate("window.dispatchEvent(new Event('orientationchange'))");
  await sleep(750);
  const quer = await messe('quer');
  check('Fahr-HUD: Querformat bildet dieselben Labels mit hoechstens 1 CSS-Pixel Abweichung ab',
    !quer.fehlt && quer.lageFehler <= 1 && quer.massFehler <= 1 && quer.overlayAbweichung <= 1,
    JSON.stringify({ lage: quer.lageFehler, mass: quer.massFehler, overlay: quer.overlayAbweichung }));
  check('Fahr-HUD: Querformat haelt alle Labels im sichtbaren Canvas',
    !quer.fehlt && quer.alleInnen && quer.anzahl === quer.daten, JSON.stringify({ anzahl: quer.anzahl }));
  check('Fahr-HUD: im Querformat schiebt --hud-h die Texte wirklich unter das HUD',
    !quer.fehlt && quer.abstand > 0 && quer.unterHud >= 3,
    JSON.stringify({ abstand: quer.abstand, hudVar: quer.hudVar, unterHud: quer.unterHud }));
  check('Fahr-HUD: auch im Querformat nie unter 12 CSS-Pixel',
    !quer.fehlt && quer.schriftMin >= 12, `kleinste Schrift ${quer.schriftMin}px`);

  if (quer.canvas?.width > 0 && quer.canvas?.height > 0) {
    const bild = await send('Page.captureScreenshot', {
      format: 'png', fromSurface: true,
      clip: { x: quer.canvas.left, y: quer.canvas.top,
        width: quer.canvas.width, height: quer.canvas.height, scale: 1 },
    });
    writeFileSync(querBild, Buffer.from(bild.data, 'base64'));
  }
  writeFileSync(logPfad, JSON.stringify({ hoch, quer }, null, 2) + '\n');
  check('Fahr-HUD: Chromium-Bilder und numerisches Messprotokoll sind geschrieben',
    existsSync(hochBild) && existsSync(querBild) && existsSync(logPfad) && !quer.fehlt);

  const mut = JSON.parse(await evaluate(`(async () => {
    const layer = document.getElementById('gameTextLayer');
    if (!layer) return JSON.stringify({ fehlt: 'gameTextLayer' });
    let zaehler = 0;
    const beobachter = new MutationObserver((eintraege) => { zaehler += eintraege.length; });
    beobachter.observe(layer, { subtree: true, childList: true, characterData: true, attributes: true });
    const sigVorher = (layer.dataset.sig || '').length;
    await new Promise((r) => setTimeout(r, 1200));
    const ruhig = zaehler;
    const r = window.__roland.racer;
    const abschnitte = r.level.journey.sections;
    r.position = abschnitte[1].from * (r.trackLength / r.segments.length);
    await new Promise((r2) => setTimeout(r2, 700));
    beobachter.disconnect();
    const el = layer.querySelector('[data-text-id="ro-abschnitt"]');
    return JSON.stringify({ ruhig, gesamt: zaehler, sigVorher,
      sigNachher: (layer.dataset.sig || '').length, text: el ? el.textContent : null });
  })()`));
  check('Fahr-HUD: eine ruhige Ebene schreibt nicht neu (Signatur-Guard)',
    !mut.fehlt && mut.ruhig === 0 && mut.sigVorher > 0, JSON.stringify(mut));
  check('Fahr-HUD: eine echte Aenderung schreibt die Ebene neu',
    !mut.fehlt && mut.gesamt > 0 && /^2 \/ 4 /.test(mut.text || ''), JSON.stringify(mut));

  writeFileSync(logPfad, JSON.stringify({ hoch, quer, mut }, null, 2) + '\n');
  if (!domAus) {
    check('Fahr-HUD: keine Browserfehler im mobilen Fahrpfad',
      (await evaluate('JSON.stringify(window.__errors)')) === '[]',
      await evaluate('JSON.stringify(window.__errors)'));
  }
  results.push(`FAHR-HUD HOCH ${hoch.canvas?.width || 0}x${hoch.canvas?.height || 0}`
    + ` sx=${hoch.scaleX ?? '-'} sy=${hoch.scaleY ?? '-'} lage=${hoch.lageFehler ?? '-'}px`
    + ` Schrift>=${hoch.schriftMin ?? '-'}px HUD-Abstand=${hoch.unterHud ?? '-'}px`);
  results.push(`FAHR-HUD QUER ${quer.canvas?.width || 0}x${quer.canvas?.height || 0}`
    + ` sx=${quer.scaleX ?? '-'} sy=${quer.scaleY ?? '-'} lage=${quer.lageFehler ?? '-'}px`
    + ` Schrift>=${quer.schriftMin ?? '-'}px HUD-Abstand=${quer.unterHud ?? '-'}px`
    + ` --hud-h=${quer.hudVar ?? '-'}px Zug=${quer.abstand ?? '-'}px`);
  results.push(`FAHR-HUD SIGNATUR ruhig=${mut.ruhig} Aenderungen=${mut.gesamt}`
    + ` Sig=${mut.sigVorher}->${mut.sigNachher} Text=${mut.text}`);
  results.push(`FAHR-HUD BILDER ${hochBild} ${querBild}`);
  results.push(`FAHR-HUD MESSUNG ${logPfad}`);
  return { hoch, quer, mut };
}

/**
 * Die Einstiegs-Cutscenes vor den Fahr-Interludien (Auftrag CUT-2) im echten
 * Browser: der Start des Interludiums setzt die Szene, die Fahrt steht dabei
 * still, am Ende faehrt sie unveraendert los und der Merker steht im Spielstand.
 * Seit Rolands Rueckmeldung vom 13.09. laeuft die Szene bei JEDEM Start des
 * Interludiums: der zweite Start zeigt sie wieder (mit Bildbeleg des zweiten
 * Laufs), ohne dass sie doppelt ausgeloest wird. Legt je Fahrzeug Bilder ab:
 * mitten in der Szene, direkt beim Uebergang in die Fahrt und mitten im
 * zweiten Lauf. `vorbereiten` faehrt fuer den gezielten Lauf (TESTMODUS=einstieg)
 * eine frische Seite an.
 */
async function pruefeEinstiegSzene(fahrzeug, { vorbereiten = false } = {}) {
  const merker = fahrzeug === 'cabrio' ? 'cutEinstiegCabrio' : 'cutEinstiegMotorrad';
  const zielOrdner = fileURLToPath(new URL('../.artifacts/', import.meta.url));
  mkdirSync(zielOrdner, { recursive: true });
  const wurzel = fileURLToPath(new URL('..', import.meta.url));
  const bild = async (pfad) => {
    const daten = Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
    writeFileSync(pfad, daten);
    return daten;
  };
  /** Nahaufnahme (3x): waehrend der Szene aus ihren Massen, sonst das Fahrzeug. */
  const nahaufnahme = async (faktor = 3) => {
    const daten = await evaluate(`(() => { try {
      const c = document.getElementById('game');
      const s = window.__roland.einstieg.szene;
      const x = s ? Math.max(0, Math.round(s.fahrzeugX) - 34) : Math.round(c.width / 2 - 95);
      const y = s ? Math.max(0, s.boden - 60) : Math.round(c.height - 110);
      const t = document.createElement('canvas');
      t.width = 170 * ${faktor}; t.height = 56 * ${faktor};
      const tg = t.getContext('2d'); tg.imageSmoothingEnabled = false;
      tg.drawImage(c, x, y, 170, 56, 0, 0, t.width, t.height);
      return t.toDataURL('image/png').slice(22);
    } catch { return ''; } })()`);
    return daten && daten.length > 100 ? Buffer.from(daten, 'base64') : null;
  };
  const zustand = () => evaluate(`JSON.stringify((() => {
    const e = window.__roland.einstieg; const s = e.szene; const r = window.__roland.racer;
    const k = 'rasender-roland/v1';
    return {
      aktiv: e.aktiv, fahrzeug: e.fahrzeug, beat: e.beat, fortschritt: e.fortschritt,
      dauer: e.dauer, gesehen: e.gesehen,
      tuerWeite: s && s.fahrzeug === 'cabrio' ? s.tuerWeite() : null,
      helmAuf: s && s.fahrzeug === 'motorrad' ? s.helmAuf() : null,
      sitzt: s && s.fahrzeug === 'motorrad' ? s.sitztAuf() : null,
      figurX: s ? s.figurX() : null,
      speed: r.hud.speed, zeit: r.hud.zeit, strecke: r.hud.strecke, position: r.position,
      hudStill: document.getElementById('racerReadout').classList.contains('hidden'),
      gespeichert: JSON.parse(localStorage.getItem(k) || '{}')[${JSON.stringify(merker)}] === true,
      fehler: window.__errors.length,
    };
  })())`).then((t) => JSON.parse(t));

  const idx = await evaluate(`window.__roland.levelIds.indexOf('${fahrzeug}')`);
  check(`Einstieg ${fahrzeug}: das Interludium ist erreichbar`, idx >= 0, String(idx));

  if (vorbereiten) {
    await send('Emulation.clearDeviceMetricsOverride');
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await send('Page.navigate', { url: URL_TO_TEST + (URL_TO_TEST.includes('?') ? '&' : '?') + 'v=' + Date.now() });
    await sleep(2200);
    await evaluate("window.__errors = []; window.addEventListener('error', (e) => window.__errors.push(String(e.message)));");
  }

  // Definierter Startzustand: den Merker aus dem Profil entfernen. Der
  // Szenenlauf haengt seit Roland (13.09.) NICHT mehr daran — die Szene laeuft
  // bei jedem Start; der Merker wird nur noch aufgezeichnet.
  await evaluate(`(() => { const k = 'rasender-roland/v1';
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    delete s.${merker};
    localStorage.setItem(k, JSON.stringify(s)); })()`);
  await evaluate(`window.__roland.loadAct(${idx})`);
  await sleep(200);
  // Ein Objektname aus dem Lauf davor (im vollen Lauf der letzte Gegenstand in
  // Reichweite) — er gehoert zur alten Welt und darf in der wortlosen Szene
  // nicht stehenbleiben. Hier bewusst sichtbar gemacht, damit die Pruefung
  // etwas zu verstecken hat.
  await evaluate("document.getElementById('worldlabel').classList.remove('hidden')");
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(260);

  const start = await zustand();
  check(`Einstieg ${fahrzeug}: der Start des Interludiums setzt die Szene`,
    start.aktiv === true && start.fahrzeug === fahrzeug && start.beat === 'gehen',
    JSON.stringify(start));
  check(`Einstieg ${fahrzeug}: die Fahrt steht waehrend der Szene still`,
    start.speed === 0 && start.zeit === 0 && start.strecke === 0 && start.position === 0,
    JSON.stringify({ speed: start.speed, zeit: start.zeit, strecke: start.strecke }));
  check(`Einstieg ${fahrzeug}: kein Fahr-HUD waehrend der Szene`,
    start.hudStill === true, JSON.stringify({ hudStill: start.hudStill }));
  check(`Einstieg ${fahrzeug}: der Merker steht schon mit dem Start der Szene im Spielstand`,
    start.gespeichert === true, JSON.stringify({ gesehen: start.gesehen, gespeichert: start.gespeichert }));
  check(`Einstieg ${fahrzeug}: kein Name aus dem Lauf bleibt in der Szene stehen`,
    (await evaluate("document.getElementById('worldlabel').classList.contains('hidden')")) === true,
    await evaluate("document.getElementById('worldlabel').textContent"));

  await sleep(fahrzeug === 'cabrio' ? 2350 : 2050);
  const mitte = await zustand();
  check(`Einstieg ${fahrzeug}: die Szene laeuft sichtbar (Mitte erreicht)`,
    mitte.aktiv === true && mitte.fortschritt > 0.45 && mitte.fortschritt < 0.97,
    JSON.stringify(mitte));
  check(`Einstieg ${fahrzeug}: die Fahrt steht auch in der Mitte der Szene still`,
    mitte.speed === 0 && mitte.position === 0, JSON.stringify({ speed: mitte.speed, position: mitte.position }));
  if (fahrzeug === 'cabrio') {
    check('Einstieg cabrio: beim Einsteigen steht die Fahrertuer offen',
      mitte.tuerWeite > 0, `tuerWeite=${mitte.tuerWeite}`);
    check('Einstieg cabrio: die Szene steht an der Tuer oder beim Einsteigen',
      mitte.beat === 'tuer' || mitte.beat === 'einsteigen', String(mitte.beat));
  } else {
    check('Einstieg motorrad: der Helm sitzt auf dem Kopf',
      mitte.helmAuf === true, JSON.stringify({ helmAuf: mitte.helmAuf, beat: mitte.beat }));
  }
  const mittePfad = join(zielOrdner, `cutscene-einstieg-${fahrzeug}-mitte.png`);
  const mitteBild = await bild(mittePfad);
  writeFileSync(join(wurzel, `screenshot-einstieg-${fahrzeug}-mitte.png`), mitteBild);
  const mitteNah = await nahaufnahme(3);
  if (mitteNah) {
    writeFileSync(join(zielOrdner, `cutscene-einstieg-${fahrzeug}-mitte-zoom.png`), mitteNah);
    writeFileSync(join(wurzel, `screenshot-einstieg-${fahrzeug}-mitte-zoom.png`), mitteNah);
  }
  results.push(`EINSTIEG BILD MITTE ${fahrzeug} ${mittePfad} beat=${mitte.beat}`
    + ` fortschritt=${mitte.fortschritt.toFixed(2)} zoom=${mitteNah ? 'ok' : 'fehlt'}`);

  // Bis zum Ende der Szene warten — danach muss die Fahrt von allein laufen.
  let uebergang = await zustand();
  for (let i = 0; i < 80 && uebergang.aktiv; i++) { await sleep(120); uebergang = await zustand(); }
  await sleep(200);
  uebergang = await zustand();
  check(`Einstieg ${fahrzeug}: das Ende der Szene geht in die unveraenderte Fahrt ueber`,
    uebergang.aktiv === false && uebergang.speed > 0 && uebergang.zeit > 0 && uebergang.position > 0,
    JSON.stringify(uebergang));
  check(`Einstieg ${fahrzeug}: nach der Szene steht der Merker im Spielstand`,
    uebergang.gespeichert === true, JSON.stringify({ gesehen: uebergang.gesehen }));
  const ueberPfad = join(zielOrdner, `cutscene-einstieg-${fahrzeug}-uebergang.png`);
  const ueberBild = await bild(ueberPfad);
  writeFileSync(join(wurzel, `screenshot-einstieg-${fahrzeug}-uebergang.png`), ueberBild);
  const ueberNah = await nahaufnahme(3);
  if (ueberNah) {
    writeFileSync(join(zielOrdner, `cutscene-einstieg-${fahrzeug}-uebergang-zoom.png`), ueberNah);
    writeFileSync(join(wurzel, `screenshot-einstieg-${fahrzeug}-uebergang-zoom.png`), ueberNah);
  }
  results.push(`EINSTIEG BILD UEBERGANG ${fahrzeug} ${ueberPfad} speed=${uebergang.speed}`
    + ` zeit=${uebergang.zeit.toFixed(2)} zoom=${ueberNah ? 'ok' : 'fehlt'}`);

  // Zweiter Start: dieselbe Station noch einmal — die Szene laeuft wieder.
  // Roland (13.09.): genau hier kam sie frueher nicht mehr; der Merker steht
  // jetzt im Spielstand (gespeichert) und darf nichts mehr unterdruecken.
  await evaluate(`window.__roland.loadAct(${idx})`);
  await sleep(150);
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(420);
  const zweite = await zustand();
  check(`Einstieg ${fahrzeug}: der zweite Start zeigt die Szene wieder (der Merker unterdrueckt nicht)`,
    zweite.aktiv === true && zweite.fahrzeug === fahrzeug && zweite.beat === 'gehen'
      && zweite.gespeichert === true,
    JSON.stringify({ aktiv: zweite.aktiv, fahrzeug: zweite.fahrzeug, gespeichert: zweite.gespeichert }));
  check(`Einstieg ${fahrzeug}: die Fahrt steht auch im zweiten Lauf still`,
    zweite.speed === 0 && zweite.zeit === 0 && zweite.position === 0,
    JSON.stringify({ speed: zweite.speed, zeit: zweite.zeit, position: zweite.position }));
  check(`Einstieg ${fahrzeug}: kein Fahr-HUD im zweiten Lauf`,
    zweite.hudStill === true, JSON.stringify({ hudStill: zweite.hudStill }));

  // Keine Doppelausloesung: ein Start waehrend der laufenden Szene setzt keine
  // zweite ein — dieselbe Szene laeuft weiter (der Pruefhaken meldet false).
  const doppelt = JSON.parse(await evaluate(`JSON.stringify((() => {
    const e = window.__roland.einstieg;
    const laufend = e.szene;
    const vorher = laufend ? laufend.fortschritt : null;
    const gestartet = e.starten();
    return { gestartet, vorher, dieselbe: e.szene === laufend,
      nachher: e.szene ? e.szene.fortschritt : null };
  })())`));
  await sleep(420);
  const weiter = await zustand();
  check(`Einstieg ${fahrzeug}: waehrend der Szene setzt kein zweiter Start eine neue`,
    doppelt.gestartet === false && doppelt.dieselbe === true
      && doppelt.nachher >= doppelt.vorher && weiter.aktiv === true,
    JSON.stringify({ doppelt, weiterAktiv: weiter.aktiv }));

  await sleep(fahrzeug === 'cabrio' ? 1600 : 1300);
  const zweiteMitte = await zustand();
  check(`Einstieg ${fahrzeug}: der zweite Lauf laeuft sichtbar durch`,
    zweiteMitte.aktiv === true && zweiteMitte.fortschritt > 0.45 && zweiteMitte.fortschritt < 0.97,
    JSON.stringify({ fortschritt: zweiteMitte.fortschritt, beat: zweiteMitte.beat }));
  const zweiPfad = join(zielOrdner, `cutscene-einstieg-${fahrzeug}-zweiter-lauf.png`);
  const zweiBild = await bild(zweiPfad);
  writeFileSync(join(wurzel, `screenshot-einstieg-${fahrzeug}-zweiter-lauf.png`), zweiBild);
  const zweiNah = await nahaufnahme(3);
  if (zweiNah) {
    writeFileSync(join(zielOrdner, `cutscene-einstieg-${fahrzeug}-zweiter-lauf-zoom.png`), zweiNah);
    writeFileSync(join(wurzel, `screenshot-einstieg-${fahrzeug}-zweiter-lauf-zoom.png`), zweiNah);
  }
  results.push(`EINSTIEG BILD ZWEITER LAUF ${fahrzeug} ${zweiPfad} beat=${zweiteMitte.beat}`
    + ` fortschritt=${zweiteMitte.fortschritt.toFixed(2)} gespeichert=${zweite.gespeichert}`
    + ` zoom=${zweiNah ? 'ok' : 'fehlt'}`);

  // ... und danach faehrt sie wieder von allein los.
  let nachZweitem = await zustand();
  for (let i = 0; i < 80 && nachZweitem.aktiv; i++) { await sleep(120); nachZweitem = await zustand(); }
  await sleep(250);
  nachZweitem = await zustand();
  check(`Einstieg ${fahrzeug}: nach dem zweiten Lauf faehrt sie unveraendert los`,
    nachZweitem.aktiv === false && nachZweitem.speed > 0 && nachZweitem.zeit > 0
      && nachZweitem.position > 0,
    JSON.stringify(nachZweitem));
  check(`Einstieg ${fahrzeug}: keine Fehler in der Szene`,
    start.fehler === 0 && uebergang.fehler === 0 && zweite.fehler === 0 && nachZweitem.fehler === 0,
    JSON.stringify([start.fehler, uebergang.fehler, zweite.fehler, nachZweitem.fehler]));
  return nachZweitem;
}

/** Warten, bis die Einstiegs-Cutscene durch ist (sie laeuft bei jedem Fahrtstart). */
async function warteEinstiegVorbei(maxS = 10) {
  for (let i = 0; i < maxS * 10; i++) {
    if ((await evaluate('window.__roland.einstieg.aktiv')) === false) return i / 10;
    await sleep(100);
  }
  return -1;
}

/**
 * DRR-F4: „Zivil" gehoert in den Kleingarten — und sieht dort nach
 * Zivilkleidung aus. Der Block faehrt beide Seiten:
 *   vor dem Garten: Zivil steht in keiner Kleiderwahl (Levelanfang und
 *                   Kleiderstaender) und laesst sich auch ueber die Konsole
 *                   oder einen Spielstand nicht erzwingen;
 *   im Garten:      am Kleiderschrank zieht die Aktion weiterhin Zivil an,
 *                   die Kluft ist dort waehlbar (kluftWahl) und am Avatar
 *                   zu sehen (Hemd, Muster, Shorts, nackte Beine).
 * Dazu Bildbelege: Handybild und 4x-Nahaufnahme des Kostuems.
 */
async function pruefeZivilGarten() {
  const shotDir = fileURLToPath(new URL('../.artifacts/', import.meta.url));
  mkdirSync(shotDir, { recursive: true });
  const wurzel = fileURLToPath(new URL('..', import.meta.url));
  const schuss = async (name, extraWurzel = null) => {
    const daten = Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
    writeFileSync(join(shotDir, name), daten);
    if (extraWurzel) writeFileSync(join(wurzel, extraWurzel), daten);
    return daten.length;
  };
  /** 4x-Nahaufnahme des Kostuems: das Fenster um die Figur, naechster Nachbar. */
  const kostuemZoom = async (faktor = 4) => {
    const daten = await evaluate(`(() => { try {
      const c = document.getElementById('game');
      const g = window.__roland.game;
      const p = g.player;
      const w = 40, h = 48;
      const x = Math.max(0, Math.min(c.width - w, Math.round(p.x - g.cam.x) - 12));
      const y = Math.max(0, Math.min(c.height - h, Math.round(p.y - g.cam.y) + p.h - h + 4));
      const t = document.createElement('canvas');
      t.width = w * ${faktor}; t.height = h * ${faktor};
      const tg = t.getContext('2d'); tg.imageSmoothingEnabled = false;
      tg.drawImage(c, x, y, w, h, 0, 0, t.width, t.height);
      return t.toDataURL('image/png').slice(22);
    } catch { return ''; } })()`);
    return daten && daten.length > 100 ? Buffer.from(daten, 'base64') : null;
  };
  const figurZivil = () => evaluate(`(() => {
    const c = document.getElementById('game'); const g = window.__roland.game;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    // Genau das Rechteck, das drawPlayer fuer die Figur zeichnet (16x24, wie
    // roland_idle) — der Kleingarten hat tuerkise und gruene Hintergruende,
    // ein weiteres Fenster wuerde Blueten und Blaetter mitzaehlen.
    const sx = Math.round(g.player.x - g.cam.x - 2);
    const sy = Math.round(g.player.y - g.cam.y + g.player.h - 24);
    const z = { hemd: 0, shorts: 0, blueteO: 0, blueteY: 0, blattE: 0, bein: 0 };
    let hemdY = 0, saumY = null;
    for (let y = Math.max(0, sy); y < Math.min(c.height, sy + 24); y++)
      for (let x = Math.max(0, sx); x < Math.min(c.width, sx + 16); x++) {
        const i = (y * c.width + x) * 4;
        if (d[i + 3] === 0) continue;
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        if (r === 47 && gg === 191 && b === 174) { z.hemd++; hemdY += y; }
        else if (r === 169 && gg === 117 && b === 64) { z.shorts++; saumY = saumY === null ? y : Math.max(saumY, y); }
        else if (r === 239 && gg === 143 && b === 58) z.blueteO++;
        else if (r === 232 && gg === 196 && b === 106) z.blueteY++;
        else if (r === 63 && gg === 107 && b === 58) z.blattE++;
        else if (r === 232 && gg === 185 && b === 138 && saumY !== null && y > saumY) z.bein++;
      }
    return JSON.stringify({ ...z, saumY, hemdY: z.hemd ? +(hemdY / z.hemd).toFixed(1) : null,
      outfit: g.outfit.id, breite: g.vw, hoehe: g.vh });
  })()`);

  // --- Vor dem Garten: Akt 1, Kleiderwahl am Levelanfang ---------------------
  await send('Emulation.setDeviceMetricsOverride', {
    width: 412, height: 892, deviceScaleFactor: 2.6, mobile: true,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: URL_TO_TEST + (URL_TO_TEST.includes('?') ? '&' : '?') + 'v=' + Date.now() });
  await sleep(2200);
  await evaluate("window.__errors = []; window.addEventListener('error', (e) => window.__errors.push(String(e.message)));");
  const akt1 = await evaluate("window.__roland.levelIds.indexOf('akt1')");
  check('Zivil: Akt 1 ist erreichbar', akt1 >= 0, String(akt1));
  await evaluate(`window.__roland.loadAct(${akt1})`);
  await sleep(250);
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(450);
  const wahlStart = JSON.parse(await evaluate(`JSON.stringify({
    offen: !document.getElementById('garde').classList.contains('hidden'),
    karten: [...document.querySelectorAll('#gardeCards button .title')].map((e) => e.textContent),
    wahl: window.__roland.kluftWahl,
    level: window.__roland.level.id,
  })`));
  check('Zivil: in Akt 1 steht die Kleiderwahl mit drei Klueften (ohne Zivil)',
    wahlStart.offen === true && wahlStart.level === 'akt1' && wahlStart.karten.length === 3
      && !wahlStart.karten.includes('SHORTS + HAWAII-HEMD')
      && !wahlStart.wahl.includes('zivil'),
    JSON.stringify(wahlStart));
  await schuss('f4-akt1-kleiderwahl.png', 'screenshot-f4-akt1-kleiderwahl.png');
  results.push(`F4-BILD Akt-1-Kleiderwahl ohne Zivil (${wahlStart.karten.join(' | ')})`);

  // --- Vor dem Garten: Umkleide am Kleiderstaender ---------------------------
  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(500);
  await evaluate(`(() => { const g = window.__roland.game;
    const en = g.entities.find((e) => e.kind === 'stand');
    g.player.x = en.x - 6; g.player.y = en.y + en.h - g.player.h; g.player.vx = 0; g.player.vy = 0;
    return 1; })()`);
  await sleep(350);
  await evaluate("window.__roland.input.setKey('action', true)");
  await sleep(200);
  await evaluate("window.__roland.input.setKey('action', false)");
  await sleep(350);
  const wahlStand = JSON.parse(await evaluate(`JSON.stringify({
    offen: !document.getElementById('garde').classList.contains('hidden'),
    grund: window.__roland.game.pauseReason,
    karten: [...document.querySelectorAll('#gardeCards button .title')].map((e) => e.textContent),
  })`));
  check('Zivil: die Umkleide am Kleiderstaender zeigt drei Kluefte (ohne Zivil)',
    wahlStand.offen === true && wahlStand.grund === 'stand' && wahlStand.karten.length === 3
      && !wahlStand.karten.includes('SHORTS + HAWAII-HEMD'),
    JSON.stringify(wahlStand));
  const erzwungen = JSON.parse(await evaluate(`(() => {
    const g = window.__roland.game;
    const vorher = g.outfit.id;
    const setOk = g.setOutfit('zivil');       // Konsole/Debug
    // Die Meldung steht sofort im Modell (die Pause stoppt nur die HUD-Frames).
    const hinweis = g.hint ? g.hint.text : null;
    const nachSet = g.outfit.id;
    g.reset('zivil');                          // Spielstand/Testhilfe
    const nachReset = g.outfit.id;
    return JSON.stringify({ vorher, setOk, nachSet, nachReset, hinweis });
  })()`));
  check('Zivil: vor dem Garten greift kein Nebenweg (Konsole und Spielstand bleiben wirkungslos)',
    erzwungen.setOk === false && erzwungen.nachSet === erzwungen.vorher
      && erzwungen.nachReset === 'schwarz'
      && /KLEINGARTEN/.test(String(erzwungen.hinweis)),
    JSON.stringify(erzwungen));
  await evaluate("document.getElementById('gardeBack').click()");
  await sleep(300);

  // --- Im Garten: der Kleiderschrank zieht weiterhin Zivil an ----------------
  const epi = await evaluate("window.__roland.levelIds.indexOf('epilog')");
  check('Zivil: der Kleingarten ist erreichbar', epi >= 0, String(epi));
  await evaluate(`window.__roland.loadAct(${epi})`);
  await sleep(250);
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(1100);
  const gartenStart = JSON.parse(await evaluate(`JSON.stringify({
    outfit: window.__roland.game.outfit.id,
    wahl: window.__roland.kluftWahl,
    garde: !document.getElementById('garde').classList.contains('hidden'),
    schrank: window.__roland.game.entities.filter((e) => e.kind === 'garderobe').length,
  })`));
  check('Zivil: der Kleingarten startet im Frack und hat Zivil in der Auswahl',
    gartenStart.outfit === 'frack' && gartenStart.garde === false
      && gartenStart.schrank === 1 && gartenStart.wahl.includes('zivil'),
    JSON.stringify(gartenStart));

  await evaluate(`(() => { const g = window.__roland.game;
    const en = g.entities.find((e) => e.kind === 'garderobe');
    g.player.x = en.x - 18; g.player.y = en.y + en.h - g.player.h; g.player.vx = 0; g.player.vy = 0;
    return 1; })()`);
  await sleep(450);
  const vorSchrank = JSON.parse(await evaluate(`JSON.stringify({
    label: (window.__roland.aktiv.hud.label || {}).text || null,
    outfit: window.__roland.game.outfit.id })`));
  check('Zivil: im Frack bietet der Kleiderschrank Zivil als Aktion an',
    vorSchrank.outfit === 'frack' && /ZIVIL/.test(String(vorSchrank.label)),
    JSON.stringify(vorSchrank));
  await evaluate("window.__roland.input.setKey('action', true)");
  await sleep(200);
  await evaluate("window.__roland.input.setKey('action', false)");
  let szeneVorbei = false;
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    if ((await evaluate('window.__roland.cutscene.aktiv')) === false) { szeneVorbei = true; break; }
  }
  await sleep(400);
  const gartenZivil = JSON.parse(await evaluate(`JSON.stringify({
    outfit: window.__roland.game.outfit.id,
    flag: window.__roland.aktiv.hud.zivilAn,
    wahl: window.__roland.kluftWahl,
  })`));
  check('Zivil: im Garten zieht die Aktionstaste weiterhin Zivil an',
    szeneVorbei === true && gartenZivil.outfit === 'zivil' && gartenZivil.flag === true
      && gartenZivil.wahl.includes('zivil'),
    JSON.stringify(gartenZivil));

  const farben = JSON.parse(await figurZivil());
  check('Zivil: der Avatar traegt Hemd, Muster, Shorts und nackte Beine',
    farben.outfit === 'zivil' && farben.hemd >= 30 && farben.shorts >= 8
      && farben.blueteO >= 2 && farben.blueteY >= 2 && farben.blattE >= 2
      && farben.bein >= 6 && farben.saumY > farben.hemdY,
    JSON.stringify(farben));
  results.push(`F4-FIGUR Handy ${farben.breite}x${farben.hoehe} Hemd=${farben.hemd}`
    + ` Shorts=${farben.shorts} Bluete=${farben.blueteO}/${farben.blueteY}`
    + ` Blatt=${farben.blattE} Bein=${farben.bein}`);
  await schuss('f4-zivil-handy.png', 'screenshot-f4-zivil-handy.png');
  const nah = await kostuemZoom(4);
  if (nah) writeFileSync(join(shotDir, 'f4-zivil-handy-4x.png'), nah);
  check('Zivil: die 4x-Nahaufnahme des Kostuems liegt vor',
    !!nah && nah.length > 0, nah ? `${nah.length} Bytes` : 'fehlt');

  check('Zivil: keine Fehler im Zivil-Block',
    (await evaluate('JSON.stringify(window.__errors)')) === '[]',
    await evaluate('JSON.stringify(window.__errors)'));
}

/**
 * Die Schlussszene im Kleingarten (Auftrag CUT-1) im echten Browser: erst die
 * Szene, danach der vorhandene Wechsel auf Zivil. Legt zwei Bilder ab — eines
 * mitten in der Szene, eines danach. `vorbereiten` faehrt fuer den gezielten
 * Lauf (TESTMODUS=cutscene) selbst bis zum Kleiderschrank im Frack.
 */
async function pruefeKleiderschrankSzene({ vorbereiten = false } = {}) {
  const shotDirSzene = fileURLToPath(new URL('../.artifacts/', import.meta.url));
  mkdirSync(shotDirSzene, { recursive: true });
  const wurzel = fileURLToPath(new URL('..', import.meta.url));
  const bild = async (pfad) => {
    const daten = Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
    writeFileSync(pfad, daten);
    return daten;
  };
  const zustand = () => evaluate(`JSON.stringify({
    aktiv: window.__roland.cutscene.aktiv,
    beat: window.__roland.cutscene.beat,
    fortschritt: window.__roland.cutscene.fortschritt,
    phase: window.__roland.cutscene.umziehPhase,
    bild: window.__roland.cutscene.bild,
    outfit: window.__roland.game.outfit.id,
    state: window.__roland.aktiv.state,
    zeit: window.__roland.game.time,
    label: window.__roland.aktiv.hud.label,
    hint: window.__roland.aktiv.hud.hint,
    flag: window.__roland.aktiv.hud.zivilAn,
    merker: window.__roland.cutscene.gesehen,
    x: window.__roland.game.player.x,
  })`).then((t) => JSON.parse(t));

  // Auftrag CUT-1b: der Wechsel Frack -> Zivil ist jetzt in der Szene zu sehen.
  // Die einzelnen Griffe dauern nur Sekundenbruchteile — deshalb wird in genau
  // dem Moment gemessen, in dem die Phase erreicht ist, und das Spiel dabei
  // angehalten: Messung und Bild gehören so zu einem einzigen Frame. Danach
  // laeuft die Szene normal weiter (resume), der Endnachweis bleibt der Lauf
  // bis zum Ende.
  const griffProbe = (griff) => `(() => {
    const cut = window.__roland.cutscene;
    if (cut.umziehPhase !== '${griff}') {
      return JSON.stringify({ phase: cut.umziehPhase, aktiv: cut.aktiv });
    }
    const g = window.__roland.game;
    g.state = 'paused';                       // anhalten: das Bild bleibt stehen
    const c = document.getElementById('game');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const px = Math.round(g.player.x - g.cam.x), py = Math.round(g.player.y - g.cam.y);
    // Die Farben der Zivilkluft stehen hier als Zahlen: Hemdgrund #2fbfae,
    // Shorts #a97540 (DRR-F4: Sandbraun statt Anzughose), Haut #e8b98a.
    // Gemessen wird im Fenster um die Figur, wie drawPlayer sie setzt.
    let hemd = 0, hemdY = 0, hose = 0, hoseY = 0, haut = 0;
    const hoseReihen = [], hautReihen = [];
    for (let y = Math.max(0, py - 8); y < Math.min(c.height, py + g.player.h + 8); y++)
      for (let x = Math.max(0, px - 8); x < Math.min(c.width, px + g.player.w + 8); x++) {
        const i = (y * c.width + x) * 4;
        if (d[i + 3] === 0) continue;
        if (d[i] === 47 && d[i + 1] === 191 && d[i + 2] === 174) { hemd++; hemdY += y; }
        else if (d[i] === 169 && d[i + 1] === 117 && d[i + 2] === 64) { hose++; hoseY += y; hoseReihen.push(y); }
        else if (d[i] === 232 && d[i + 1] === 185 && d[i + 2] === 138) { haut++; hautReihen.push(y); }
      }
    // Nackte Beine: Hautpunkte unterhalb des Hosensaums (die Hautfarbe sitzt
    // auch im Gesicht — nur die Punkte unter der Shorts zaehlen als Bein).
    const saum = hoseReihen.length ? Math.max(...hoseReihen) : null;
    const bein = saum === null ? 0 : hautReihen.filter((y) => y > saum).length;
    return JSON.stringify({
      phase: cut.umziehPhase, bild: cut.bild, aktiv: cut.aktiv, outfit: g.outfit.id,
      fortschritt: +cut.fortschritt.toFixed(3), x: g.player.x,
      hemd, hose, haut, bein,
      hemdY: hemd ? +(hemdY / hemd).toFixed(1) : null,
      hoseY: hose ? +(hoseY / hose).toFixed(1) : null,
    });
  })()`;
  const warteAufGriff = async (griff, runden = 160) => {
    for (let i = 0; i < runden; i++) {
      const p = JSON.parse(await evaluate(griffProbe(griff)));
      if (p.phase === griff) return p;
      if (p.aktiv === false) return null;
      await sleep(35);
    }
    return null;
  };
  /** Warten, bis die Szene den gesuchten Fortschritt erreicht hat (0..1). */
  const warteAufFortschritt = async (ziel, runden = 120) => {
    for (let i = 0; i < runden; i++) {
      const z = await zustand();
      if (!z.aktiv || z.fortschritt >= ziel) return z;
      await sleep(60);
    }
    return await zustand();
  };

  // Nahaufnahme (4x) vom Schrank samt Figur — die Szene ist im Vollbild nur
  // wenige Pixel gross; fuer die Beurteilung des Looks braucht es den Zoom.
  // Fehler hier duerfen den Lauf nicht kippen: dann gibt es eben kein Zoom-Bild.
  const nahaufnahme = async (faktor = 4) => {
    const daten = await evaluate(`(() => { try {
      const c = document.getElementById('game');
      const g = window.__roland.game;
      const en = g.entities.find((e) => e.kind === 'garderobe');
      const w = 132, h = 104;
      const x = Math.max(0, Math.min(c.width - w, Math.round(en.x - g.cam.x) - 66));
      const y = Math.max(0, Math.min(c.height - h, Math.round(en.y - g.cam.y) - 6));
      const t = document.createElement('canvas');
      t.width = w * ${faktor}; t.height = h * ${faktor};
      const tg = t.getContext('2d'); tg.imageSmoothingEnabled = false;
      tg.drawImage(c, x, y, w, h, 0, 0, t.width, t.height);
      return t.toDataURL('image/png').slice(22);
    } catch { return ''; } })()`);
    return daten && daten.length > 100 ? Buffer.from(daten, 'base64') : null;
  };

  if (vorbereiten) {
    // Gezielter Lauf: frische Seite, Kleingarten, Frack, vor den Schrank stellen.
    await send('Emulation.clearDeviceMetricsOverride');
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await send('Page.navigate', { url: URL_TO_TEST + (URL_TO_TEST.includes('?') ? '&' : '?') + 'v=' + Date.now() });
    await sleep(2200);
    await evaluate("window.__errors = []; window.addEventListener('error', (e) => window.__errors.push(String(e.message)));");
    const epiIndex = await evaluate("window.__roland.levelIds.indexOf('epilog')");
    check('Cutscene: der Kleingarten ist erreichbar', epiIndex >= 0, String(epiIndex));
    await evaluate(`window.__roland.loadAct(${epiIndex})`);
    await sleep(200);
    await echterKlick('#startBtn');
    // Seit dem Auftrag „Epilog-Ramona" beginnt der Kleingarten direkt im Frack:
    // es gibt keine Kleiderauswahl mehr (die Frack-Karte entfaellt).
    await sleep(1100);
    await evaluate(`(() => { const g = window.__roland.game;
      const en = g.entities.find((e) => e.kind === 'garderobe');
      g.player.x = en.x - 18; g.player.y = en.y + en.h - g.player.h; g.player.vx = 0; g.player.vy = 0;
      return JSON.stringify({ x: en.x, h: en.h }); })()`);
    await sleep(400);
  }

  // Seit Roland (13.09.) unterdrueckt der Merker die Szene nicht mehr: sie
  // laeuft bei jedem Wechsel Frack -> Zivil. Fuer diesen Block wird der
  // Spielstand trotzdem einmal sauber gestellt — der erste Lauf startet wie
  // bei einem frischen Spielstand, der zweite Lauf weiter unten laeuft
  // absichtlich mit gesetztem Merker (das ist der neue Vertrag).
  await evaluate(`(() => { try {
    const k = 'rasender-roland/v1';
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    delete s.cutFrackGeige;
    localStorage.setItem(k, JSON.stringify(s));
  } catch { /* privater Modus: egal */ }
  if (window.__roland.game) window.__roland.game.cutsceneGesehen = false; })()`);

  const vorher = await zustand();
  check('Cutscene: die Figur steht im Frack vor dem Kleiderschrank',
    vorher.aktiv === false && vorher.outfit === 'frack' && vorher.merker === false,
    JSON.stringify(vorher));

  // Die Aktion: ZIVIL ANZIEHEN. Erst die Szene, danach der Wechsel.
  await tippeSzene(180, 120);
  const lauf = await zustand();
  check('Cutscene: die Aktionstaste startet die Schlussszene',
    lauf.aktiv === true && lauf.beat === 'gehen' && lauf.outfit === vorher.outfit,
    JSON.stringify(lauf));
  check('Cutscene: die Szene ist wortlos (kein Interaktionspunkt, keine Meldung)',
    lauf.label === null && lauf.hint === null, JSON.stringify([lauf.label, lauf.hint]));

  await sleep(1900);
  const mitte = await zustand();
  check('Cutscene: die Szene laeuft sichtbar (Mitte erreicht)',
    mitte.aktiv === true && mitte.fortschritt > 0.2 && mitte.fortschritt < 0.95
      && mitte.outfit === vorher.outfit, JSON.stringify(mitte));
  check('Cutscene: die Welt steht fuer die Dauer der Szene still',
    mitte.zeit === lauf.zeit && mitte.zeit - vorher.zeit < 0.6,
    `Zeit ${vorher.zeit} -> ${lauf.zeit} (Szene laeuft) -> ${mitte.zeit}`);
  const mittePfad = join(shotDirSzene, 'cutscene-frack-mitte.png');
  const mitteBild = await bild(mittePfad);
  writeFileSync(join(wurzel, 'screenshot-cutscene-frack-mitte.png'), mitteBild);
  const mitteNah = await nahaufnahme(4);
  if (mitteNah) {
    writeFileSync(join(shotDirSzene, 'cutscene-frack-mitte-zoom.png'), mitteNah);
    writeFileSync(join(wurzel, 'screenshot-cutscene-frack-mitte-zoom.png'), mitteNah);
  }
  results.push(`CUTSCENE BILD MITTE ${mittePfad} beat=${mitte.beat} fortschritt=${mitte.fortschritt.toFixed(2)}`
    + ` zoom=${mitteNah ? 'ok' : 'fehlt'}`);

  // --- Auftrag CUT-1b: das Umziehen ist in der Szene zu sehen ----------------
  // Erst der Griff „Hemd ueber dem Kopf": halb angezogen — Hemdpunkte der
  // Zivilpalette oberhalb der Hosenpunkte, waehrend das Spiel selbst noch den
  // Frack traegt (der Wechsel kommt erst nach der Szene).
  const halb = await warteAufGriff('kopf');
  check('Cutscene: der Umzieh-Moment ist sichtbar (Hemd ueber dem Kopf, halb in Zivil)',
    !!halb && halb.bild === 'cut_figur_umzieh' && halb.hemd > 0 && halb.hose > 0 && halb.bein > 0
      && halb.hemdY < halb.hoseY && halb.outfit === 'frack' && halb.aktiv === true,
    JSON.stringify(halb));
  const umziehPfad = join(shotDirSzene, 'cutscene-umziehen-mitte.png');
  const umziehBild = await bild(umziehPfad);
  writeFileSync(join(wurzel, 'screenshot-cutscene-umziehen.png'), umziehBild);
  const umziehNah = await nahaufnahme(4);
  if (umziehNah) writeFileSync(join(shotDirSzene, 'cutscene-umziehen-mitte-zoom.png'), umziehNah);
  results.push(`CUTSCENE BILD UMZIEHEN ${umziehPfad} phase=${halb && halb.phase}`
    + ` hemd=${halb && halb.hemd} hose=${halb && halb.hose} zoom=${umziehNah ? 'ok' : 'fehlt'}`);
  await evaluate('window.__roland.game.resume()');

  // Dann der letzte Griff: das Hemd sitzt, die Figur steht in Zivil vor dem
  // Schrank — gemessen, solange die Szene noch laeuft (outfit also 'frack').
  const endeZivil = await warteAufGriff('angezogen');
  // DRR-F4: die Figur traegt jetzt ein erkennbares Hemd (Bluete/Blatt), eine
  // kurze Hose und darunter nackte Beine — kein Anzug mit langer Hose mehr.
  check('Cutscene: die Szene endet in Zivil (vor dem Schrank, vor dem Wechsel im Spiel)',
    !!endeZivil && endeZivil.bild === 'roland_idle' && endeZivil.hemd > 0 && endeZivil.hose > 0
      && endeZivil.bein > 0 && endeZivil.hemdY < endeZivil.hoseY
      && endeZivil.outfit === 'frack' && endeZivil.aktiv === true,
    JSON.stringify(endeZivil));
  const endeZivilPfad = join(shotDirSzene, 'cutscene-umziehen-ende.png');
  const endeZivilBild = await bild(endeZivilPfad);
  writeFileSync(join(wurzel, 'screenshot-cutscene-umziehen-ende.png'), endeZivilBild);
  const endeZivilNah = await nahaufnahme(4);
  if (endeZivilNah) writeFileSync(join(shotDirSzene, 'cutscene-umziehen-ende-zoom.png'), endeZivilNah);
  results.push(`CUTSCENE BILD UMZIEHEN ENDE ${endeZivilPfad} phase=${endeZivil && endeZivil.phase}`
    + ` hemd=${endeZivil && endeZivil.hemd} zoom=${endeZivilNah ? 'ok' : 'fehlt'}`);
  await evaluate('window.__roland.game.resume()');

  // Bis zum Ende der Szene warten und dann den Normalzustand messen.
  let ende = mitte;
  for (let i = 0; i < 40 && ende.aktiv; i++) { await sleep(250); ende = await zustand(); }
  await sleep(350);
  const nach = await zustand();
  check('Cutscene: die Szene endet im Normalzustand',
    nach.aktiv === false && nach.state === 'play' && nach.outfit === 'zivil' && nach.zeit > mitte.zeit,
    JSON.stringify(nach));
  check('Cutscene: der Merker steht im Spielstand',
    nach.merker === true, JSON.stringify({ merker: nach.merker, gespeichert: await evaluate(
      "JSON.parse(localStorage.getItem('rasender-roland/v1') || '{}').cutFrackGeige === true") }));
  check('Cutscene: die Figur steht in Zivil vor dem Schrank',
    nach.outfit === 'zivil' && nach.x < vorher.x && nach.x > vorher.x - 40,
    `x ${vorher.x} -> ${nach.x}`);
  const nachPfad = join(shotDirSzene, 'cutscene-frack-danach.png');
  const nachBild = await bild(nachPfad);
  writeFileSync(join(wurzel, 'screenshot-cutscene-frack-danach.png'), nachBild);
  const nachNah = await nahaufnahme(4);
  if (nachNah) {
    writeFileSync(join(shotDirSzene, 'cutscene-frack-danach-zoom.png'), nachNah);
    writeFileSync(join(wurzel, 'screenshot-cutscene-frack-danach-zoom.png'), nachNah);
  }
  results.push(`CUTSCENE BILD DANACH ${nachPfad} outfit=${nach.outfit} x=${nach.x}`
    + ` zoom=${nachNah ? 'ok' : 'fehlt'}`);

  // --- Roland (13.09.): die Szene laeuft bei JEDEM Frack -> Zivil-Wechsel -----
  // Der Merker steht jetzt im Spielstand (gerade geprueft) — die Szene muss
  // trotzdem wieder laufen. Also zurueck auf den Frack, erneut ausloesen und
  // dieselben Pruefpunkte wie beim ersten Lauf: Anfang, Mitte (mit Bild),
  // Umzieh-Moment, Ende, Merker und Stellung vor dem Schrank.
  await sleep(900);                               // Schrank-Cooldown (0,5 s) abwarten
  await tippeSzene(180, 700);                     // Zivil -> Frack: der schnelle Wechsel
  const wiederFrack = await zustand();
  check('Cutscene: der Rueckweg auf den Frack bleibt der schnelle Wechsel',
    wiederFrack.aktiv === false && wiederFrack.outfit === 'frack' && wiederFrack.merker === true,
    JSON.stringify(wiederFrack));

  await tippeSzene(180, 120);                     // Frack -> Zivil: die Szene wieder
  const lauf2 = await zustand();
  check('Cutscene: der zweite Frack -> Zivil-Wechsel startet die Szene wieder',
    lauf2.aktiv === true && lauf2.beat === 'gehen' && lauf2.outfit === 'frack',
    JSON.stringify(lauf2));
  check('Cutscene: die Szene ist auch beim zweiten Lauf wortlos',
    lauf2.label === null && lauf2.hint === null, JSON.stringify([lauf2.label, lauf2.hint]));

  // Kein Neustart, solange sie laeuft: der Druck mittendrin laesst den
  // Fortschritt weiterlaufen — eine neue Szene faenge wieder bei 0 an.
  await sleep(750);
  const vorDruck = await zustand();
  await tippeSzene(120, 0);
  const nachDruck = await zustand();
  check('Cutscene: ein Druck mitten im zweiten Lauf startet keine neue Szene',
    vorDruck.aktiv === true && nachDruck.aktiv === true
      && nachDruck.fortschritt >= vorDruck.fortschritt && vorDruck.fortschritt > 0.1,
    `Fortschritt ${vorDruck.fortschritt} -> ${nachDruck.fortschritt}`);

  const mitte2 = await warteAufFortschritt(0.3);
  check('Cutscene: der zweite Lauf laeuft sichtbar (Mitte erreicht)',
    mitte2.aktiv === true && mitte2.fortschritt >= 0.3 && mitte2.fortschritt < 0.95
      && mitte2.outfit === 'frack', JSON.stringify(mitte2));
  check('Cutscene: die Welt steht auch im zweiten Lauf still',
    mitte2.zeit === nachDruck.zeit, `Zeit ${nachDruck.zeit} -> ${mitte2.zeit}`);
  const zweiterPfad = join(shotDirSzene, 'cutscene-zweiter-lauf.png');
  const zweiterBild = await bild(zweiterPfad);
  writeFileSync(join(wurzel, 'screenshot-cutscene-zweiter-lauf.png'), zweiterBild);
  results.push(`CUTSCENE BILD ZWEITER LAUF ${zweiterPfad} beat=${mitte2.beat}`
    + ` fortschritt=${mitte2.fortschritt.toFixed(2)}`);
  check('Cutscene: das Bild des zweiten Laufs ist geschrieben',
    existsSync(zweiterPfad) && existsSync(join(wurzel, 'screenshot-cutscene-zweiter-lauf.png')));

  // Derselbe Umzieh-Moment wie im ersten Lauf: das Hemd ueber dem Kopf.
  const halb2 = await warteAufGriff('kopf');
  check('Cutscene: auch der zweite Lauf zeigt das Umziehen (Hemd ueber dem Kopf)',
    !!halb2 && halb2.bild === 'cut_figur_umzieh' && halb2.hemd > 0 && halb2.hose > 0
      && halb2.outfit === 'frack' && halb2.aktiv === true,
    JSON.stringify(halb2));
  await evaluate('window.__roland.game.resume()');

  // Bis zum Ende warten und dieselben Endpunkte messen wie beim ersten Lauf.
  let ende2 = mitte2;
  for (let i = 0; i < 40 && ende2.aktiv; i++) { await sleep(250); ende2 = await zustand(); }
  await sleep(350);
  const nach2 = await zustand();
  check('Cutscene: der zweite Lauf endet im Normalzustand (Zivil, Spiel laeuft)',
    nach2.aktiv === false && nach2.state === 'play' && nach2.outfit === 'zivil'
      && nach2.zeit > mitte2.zeit, JSON.stringify(nach2));
  check('Cutscene: der Merker steht auch nach dem zweiten Lauf im Spielstand',
    nach2.merker === true, JSON.stringify({ merker: nach2.merker }));
  check('Cutscene: die Figur steht wie beim ersten Lauf in Zivil vor dem Schrank',
    nach2.outfit === 'zivil' && Math.abs(nach2.x - nach.x) < 1.5 && mitte2.x > nach2.x + 10,
    `x ${mitte2.x} -> ${nach2.x} (erster Lauf endete bei ${nach.x})`);

  return nach;
}

/** Tastendruck im Browser (Szene): halten, loslassen, warten. */
async function tippeSzene(halten = 180, danach = 120) {
  await evaluate("window.__roland.input.setKey('action', true)");
  await sleep(halten);
  await evaluate("window.__roland.input.setKey('action', false)");
  await sleep(danach);
}

try {
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: URL_TO_TEST + (URL_TO_TEST.includes('?') ? '&' : '?') + 'v=' + Date.now() });
  await sleep(2200);

  check('Seite geladen', (await evaluate('document.readyState')) === 'complete');
  // Gegenprobe: eine veraltete Browserinstanz zeigt eine andere Seite
  check('Browser zeigt die aktuelle Seite (keine veraltete Instanz)',
    (await evaluate("!!document.getElementById('actRow')")) === true,
    'actRow fehlt — vermutlich haengengebliebener Chromium auf dem Debugport');
  check('Titel gesetzt', (await evaluate('document.title')) === 'Der Rasende Roland');
  check('Fehlersammler installiert', Array.isArray(await evaluate('window.__errors')));
  check('Spielmodul geladen', (await evaluate('typeof window.__roland')) === 'object');

  // Ein einziges, nicht interaktives DOM-Overlay nimmt spaeter alle hochaufgeloesten
  // Spieltexte auf. Der gezielte Modus haelt den Rot-Gruen-Nachweis kurz.
  const textEbeneStart = JSON.parse(await evaluate(`(() => {
    const e = document.getElementById('gameTextLayer');
    return JSON.stringify({
      vorhanden: !!e,
      imStage: !!e && e.parentElement?.id === 'stage',
      pointer: e ? getComputedStyle(e).pointerEvents : null,
      anzahl: document.querySelectorAll('#stage > .game-text-layer').length,
    });
  })()`));
  check('DOM-Textvertrag: genau eine nicht interaktive Textebene liegt im Stage',
    textEbeneStart.vorhanden && textEbeneStart.imStage && textEbeneStart.pointer === 'none'
      && textEbeneStart.anzahl === 1,
    JSON.stringify(textEbeneStart));

  // Bewusst nicht 16:9: X und Y muessen aus dem echten Canvas-Rechteck
  // stammen. Danach wird auf die kompakte VIEW gewechselt und ein
  // Orientationchange erzwungen; derselbe zentrale Pfad muss alles nachziehen.
  const textSkalierung = JSON.parse(await evaluate(`(async () => {
    const api = window.__roland && window.__roland.textLayer;
    const c = document.getElementById('game');
    const layer = document.getElementById('gameTextLayer');
    if (!api || typeof api.render !== 'function') return JSON.stringify({ fehlt: 'textLayer.render' });
    const alteBreite = c.style.width, alteHoehe = c.style.height;
    const altesW = c.width, altesH = c.height;
    // Zwei Proben: die grosse prueft die reine X/Y-Skalierung aus PR #6, die
    // kleine den Schriftboden aus Phase A (nie unter 12 CSS-Pixel).
    const probe = { id: 'vertrag-probe', text: 'PROBE', x: 41, y: 27, w: 103, h: 11,
      fontSize: 20, align: 'center', color: '#e9e5d8' };
    const klein = { ...probe, id: 'vertrag-klein', x: 13, y: 19, w: 77, h: 14, fontSize: 4 };
    const messe = (daten, view) => {
      const cr = c.getBoundingClientRect();
      const lr = layer.getBoundingClientRect();
      const e = layer.querySelector('[data-text-id="' + daten.id + '"]');
      if (!e) return { fehlt: daten.id };
      const er = e.getBoundingClientRect();
      const sx = cr.width / view.w, sy = cr.height / view.h;
      const stil = getComputedStyle(e);
      const matrix = stil.transform === 'none' ? [1] : stil.transform.slice(7, -1).split(',').map(Number);
      const schriftY = parseFloat(stil.fontSize);
      return {
        canvas: { left: cr.left, top: cr.top, width: cr.width, height: cr.height },
        layer: { left: lr.left, top: lr.top, width: lr.width, height: lr.height },
        sx, sy,
        lageFehler: Math.max(Math.abs(er.left - (cr.left + daten.x * sx)), Math.abs(er.top - (cr.top + daten.y * sy))),
        massFehler: Math.max(Math.abs(er.width - daten.w * sx), Math.abs(er.height - daten.h * sy)),
        layerFehler: Math.max(Math.abs(lr.left - cr.left), Math.abs(lr.top - cr.top),
          Math.abs(lr.width - cr.width), Math.abs(lr.height - cr.height)),
        schriftYFehler: Math.abs(schriftY - Math.max(12, daten.fontSize * sy)),
        schriftXFehler: Math.abs(schriftY * matrix[0] - Math.max(12, daten.fontSize * sx)),
        schrift: schriftY,
        innen: er.left >= cr.left - 0.5 && er.top >= cr.top - 0.5
          && er.right <= cr.right + 0.5 && er.bottom <= cr.bottom + 0.5,
        semantik: e.id === 'spieltext-' + daten.id && e.dataset.textId === daten.id
          && Number(e.dataset.x) === daten.x && Number(e.dataset.y) === daten.y,
        text: e.textContent,
      };
    };
    c.style.width = '503px'; c.style.height = '271px';
    api.render([probe], { w: 384, h: 216 });
    const desktop = messe(probe, { w: 384, h: 216 });
    // Bodenprobe: 4 logische Pixel muessen auf 12 CSS-Pixel angehoben werden,
    // ohne die gemessene Box zu verschieben.
    api.render([klein], { w: 384, h: 216 });
    const boden = messe(klein, { w: 384, h: 216 });
    api.render([probe], { w: 384, h: 216 });
    const kompakt = { ...probe, id: 'vertrag-kompakt', x: 13, y: 19, w: 77, h: 14, fontSize: 6 };
    c.width = 256; c.height = 144;
    c.style.width = '517px'; c.style.height = '233px';
    api.render([kompakt], { w: 256, h: 144 });
    const viewWechsel = messe(kompakt, { w: 256, h: 144 });
    c.width = altesW; c.height = altesH;
    c.style.width = alteBreite; c.style.height = alteHoehe;
    api.render([probe], { w: 384, h: 216 });
    window.dispatchEvent(new Event('orientationchange'));
    await new Promise((resolve) => setTimeout(resolve, 180));
    const orientation = messe(probe, { w: 384, h: 216 });
    api.clear();
    return JSON.stringify({ desktop, boden, viewWechsel, orientation });
  })()`));
  check('DOM-Textvertrag: logische Lage und Masse folgen dem echten Canvas-Rechteck',
    !textSkalierung.fehlt && textSkalierung.desktop.lageFehler <= 1
      && textSkalierung.desktop.massFehler <= 1 && textSkalierung.desktop.layerFehler <= 1
      && textSkalierung.desktop.innen,
    JSON.stringify(textSkalierung.desktop || textSkalierung));
  check('DOM-Textvertrag: Schrift skaliert getrennt mit X und Y',
    !textSkalierung.fehlt && textSkalierung.desktop.schriftXFehler <= 0.05
      && textSkalierung.desktop.schriftYFehler <= 0.05,
    JSON.stringify(textSkalierung.desktop || textSkalierung));
  check('DOM-Textvertrag: stabile ID sowie logisches X/Y bleiben abfragbar',
    !textSkalierung.fehlt && textSkalierung.desktop.semantik && textSkalierung.desktop.text === 'PROBE',
    JSON.stringify(textSkalierung.desktop || textSkalierung));
  check('DOM-Textvertrag: die Schrift faellt nie unter 12 CSS-Pixel (Phase A)',
    !textSkalierung.fehlt && Math.abs(textSkalierung.boden?.schrift - 12) <= 0.05
      && textSkalierung.boden.lageFehler <= 1 && textSkalierung.boden.massFehler <= 1
      && textSkalierung.boden.innen,
    JSON.stringify(textSkalierung.boden || textSkalierung));
  check('DOM-Textvertrag: VIEW-Wechsel und Orientationchange aktualisieren denselben Pfad',
    !textSkalierung.fehlt && textSkalierung.viewWechsel.lageFehler <= 1
      && textSkalierung.viewWechsel.massFehler <= 1 && textSkalierung.viewWechsel.layerFehler <= 1
      && textSkalierung.orientation.lageFehler <= 1 && textSkalierung.orientation.layerFehler <= 1,
    JSON.stringify(textSkalierung));
  if (TESTMODUS === 'textvertrag') throw GEZIELTER_ABSCHLUSS;
  if (TESTMODUS === 'grilltexte' || TESTMODUS === 'grilltexte-ohne-dom') {
    await pruefeGrilltexteMobil({ domAus: TESTMODUS === 'grilltexte-ohne-dom' });
    throw GEZIELTER_ABSCHLUSS;
  }
  if (TESTMODUS === 'fahrhud' || TESTMODUS === 'fahrhud-ohne-dom') {
    await pruefeFahrHudMobil({ domAus: TESTMODUS === 'fahrhud-ohne-dom' });
    throw GEZIELTER_ABSCHLUSS;
  }
  if (TESTMODUS === 'cutscene') {
    // Gezielter Lauf fuer die Schlussszene (Auftrag CUT-1): nur dieser Block,
    // ohne den ganzen Weg durch die Akte davor.
    await pruefeKleiderschrankSzene({ vorbereiten: true });
    throw GEZIELTER_ABSCHLUSS;
  }

  if (TESTMODUS === 'einstieg') {
    // Gezielter Lauf fuer die Einstiegs-Cutscenes (Auftrag CUT-2): beide
    // Fahrzeuge, ohne den ganzen Weg durch die Akte davor.
    await pruefeEinstiegSzene('cabrio', { vorbereiten: true });
    await pruefeEinstiegSzene('motorrad');
    throw GEZIELTER_ABSCHLUSS;
  }

  if (TESTMODUS === 'zivil') {
    // Gezielter Lauf fuer DRR-F4: Zivil vor dem Garten gesperrt, im Garten
    // waehlbar und am Avatar zu sehen — ohne den ganzen Weg durch die Akte.
    await pruefeZivilGarten();
    throw GEZIELTER_ABSCHLUSS;
  }

  check('Stationswahl ist zu Beginn verborgen',
    (await evaluate("document.getElementById('actRow').classList.contains('hidden')")) === true);
  const diffStart = await evaluate("document.getElementById('diffBtn').textContent");
  check('Standard-Schwierigkeit ist gemütlich', diffStart.includes('GEMÜTLICH'), diffStart);
  check('Startübersicht sichtbar',
    (await evaluate("!document.getElementById('title').classList.contains('hidden')")) === true);

  await evaluate("document.getElementById('startBtn').click()");
  await sleep(400);
  const options = await evaluate("JSON.stringify([...document.querySelectorAll('#gardeCards button .title')].map(e=>e.textContent))");
  // DRR-F4: vor dem Kleingarten stehen drei Klüfte zur Wahl. Zivil haengt am
  // Kleiderschrank im Garten und erscheint vorher nicht mehr (Rolands Befund
  // vom 13.09.: die vierte Karte war dort ohne Sinn).
  const optionListe = JSON.parse(options);
  check('Kleiderwahl zeigt vor dem Garten genau drei Klüfte (ohne Zivil)', optionListe.length === 3
    && ['SCHWARZES HEMD', 'ANZUG + KRAWATTE', 'FRACK'].every((k) => optionListe.includes(k))
    && !optionListe.includes('SHORTS + HAWAII-HEMD'),
    options);
  check('Meldet SCHWARZ, ANZUG und FRACK',
    ['SCHWARZ', 'ANZUG', 'FRACK'].every((k) => options.includes(k)), options);
  const wahlAkt1 = await evaluate('JSON.stringify(window.__roland.kluftWahl)');
  check('Akt 1 kennt Zivil gar nicht als waehlbare Kluft',
    !JSON.parse(wahlAkt1).includes('zivil'), wahlAkt1);

  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(600);
  const st = JSON.parse(await evaluate(`JSON.stringify({
    state: window.__roland.game.state,
    x: window.__roland.game.player.x,
    kluft: window.__roland.game.hud.outfit.id,
    nerven: window.__roland.game.hud.nerves,
    deckelTotal: window.__roland.game.hud.deckelTotal
  })`));
  check('Spiel läuft nach der Kleiderwahl', st.state === 'play', st.state);
  check('Startposition stimmt', Math.abs(st.x - 48) < 3, String(st.x));
  check('Kluft ist schwarz', st.kluft === 'schwarz', st.kluft);
  check('Drei Nerven, fünf Bierdeckel', st.nerven === 3 && st.deckelTotal === 5);

  // Akt-1-Musterstrecke im echten Browser: Daten, sichtbarer NPC und echte
  // E-Tastendrücke. Die direkte Positionierung ist ein instrumentierter Probe-
  // Schritt; Interaktion und Frame-Updates laufen danach über den normalen Pfad.
  const akt1Data = JSON.parse(await evaluate(`(() => {
    const g = window.__roland.game;
    const npcs = g.entities.filter((e) => e.kind === 'npc');
    const decor = g.entities.filter((e) => e.kind === 'decor');
    const sheets = g.entities.filter((e) => e.kind === 'item' && e.item === 'stimmblatt');
    const anna = npcs.find((e) => e.flag === 'ada_beauftragt');
    g.player.x = anna.x - 18;
    g.player.y = anna.y + anna.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
    return JSON.stringify({ npcs: npcs.length, decor: new Set(decor.map((e) => e.spr)).size,
      sheets: new Set(sheets.map((e) => e.spr)).size });
  })()`));
  await sleep(250);
  check('Akt 1 rendert zwei Anna-Begegnungen', akt1Data.npcs === 2, JSON.stringify(akt1Data));
  check('Akt 1 hat mindestens fünf unterschiedliche Raumrequisiten', akt1Data.decor >= 5, JSON.stringify(akt1Data));
  check('Akt 1 rendert drei unterscheidbare Stimmen', akt1Data.sheets === 3, JSON.stringify(akt1Data));
  const annaLabel = await evaluate("(window.__roland.game.hud.label || {}).text || ''");
  check('Anna wird im Browser als Interaktion beschriftet', annaLabel.includes('ANNA'), annaLabel);
  check('Touch-Aktion heißt bei Anna nicht Tritt',
    (await evaluate("document.getElementById('btnAction').textContent")) === 'AKTION');
  check('Annas Weltschild verweist auf die Aktionstaste',
    (await evaluate("document.getElementById('worldlabel').textContent")).includes('AKTION-KNOPF'));
  for (let i = 0; i < 3; i++) {
    await key('KeyE', 'keyDown'); await sleep(80);
    await key('KeyE', 'keyUp'); await sleep(100);
  }
  const annaState = JSON.parse(await evaluate(`JSON.stringify({
    flag: window.__roland.game.storyFlags.has('ada_beauftragt'),
    ziel: window.__roland.game.hud.ziel,
    hint: window.__roland.game.hud.hint
  })`));
  check('Drei echte E-Tastendrücke schließen Annas Auftrag ab', annaState.flag === true, JSON.stringify(annaState));
  check('Das Journal wechselt danach zu den drei Stimmen', annaState.ziel.includes('STIMMBLÄTTER'), annaState.ziel);
  const act1Shot = await send('Page.captureScreenshot', { format: 'png' });
  const act1ShotDir = fileURLToPath(new URL('../.artifacts/', import.meta.url));
  mkdirSync(act1ShotDir, { recursive: true });
  const act1ShotPath = join(act1ShotDir, 'akt1-garderobe.png');
  writeFileSync(act1ShotPath, Buffer.from(act1Shot.data, 'base64'));
  check('Akt-1-Garderobenbild geschrieben', existsSync(act1ShotPath));
  results.push(`AKT1-SCREENSHOT ${act1ShotPath}`);
  await evaluate(`(() => {
    const g = window.__roland.game;
    const gate = g.gates.find((e) => e.flag === 'ada_beauftragt');
    g.player.x = gate.tx * 16 - g.player.w + 2;
    g.player.y = 25 * 16 - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
  })()`);
  await sleep(200);
  check('Annas Auftrag öffnet die Garderobentür im Browser',
    (await evaluate("window.__roland.game.gates.find((e) => e.flag === 'ada_beauftragt').open")) === true);
  // Visuelle Referenzbilder für die vier späteren Raumtypen. Direkte
  // Positionierung dient nur der Aufnahme; die Route selbst prüft der Bot-Test.
  const roomViews = [
    ['stimmengang', 43, 19, 'schwarz', false, 0],
    ['notenschacht', 72, 23, 'schwarz', false, 1],
    ['archiv', 104, 19, 'anzug', false, 2],
    ['maschinerie', 122, 13, 'frack', true, 3],
  ];
  for (const [name, tx, row, outfit, mappe, stimmen] of roomViews) {
    await evaluate(`(() => {
      const g=window.__roland.game;
      g.setOutfit('${outfit}'); g.hasMappe=${mappe}; g.stimmblaetter=${stimmen};
      g.storyFlags.add('ada_beauftragt');
      g.player.x=${tx}*16; g.player.y=${row}*16-g.player.h;
      g.player.vx=0; g.player.vy=0; g.hint=null; g.hintQueue=[];
    })()`);
    await sleep(240);
    const roomShot = await send('Page.captureScreenshot', { format: 'png' });
    const roomPath = join(act1ShotDir, `akt1-${name}.png`);
    writeFileSync(roomPath, Buffer.from(roomShot.data, 'base64'));
    check(`Akt-1-Raumbild ${name} geschrieben`, existsSync(roomPath));
    results.push(`AKT1-ROOM ${roomPath}`);
  }
  // Für die bestehenden Lauf-/Umkleideproben frisch an den Spawn stellen.
  await evaluate(`(() => { const g=window.__roland.game; g.reset('schwarz'); })()`);
  await sleep(180);

  // Befund D2: Umziehen muss am Avatar sichtbar sein. Der Sprite-Cache
  // schlüsselte vorher nur auf die Palettenbuchstaben (".hHsSawrb") — die sind
  // bei allen drei Klüften gleich, also bekam jede dieselbe Zeichnung.
  const kluftBild = JSON.parse(await evaluate(`(() => {
    const g = window.__roland.game;
    const cv = document.createElement('canvas');
    cv.width = 24; cv.height = 28;
    const ctx = cv.getContext('2d');
    const p = g.player;
    const merker = { x: p.x, y: p.y, vx: p.vx, vy: p.vy };
    const zurueck = g.outfit.id;
    const fp = {};
    for (const id of ['schwarz', 'anzug', 'frack']) {
      g.setOutfit(id);
      p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.flash = 0; p.invuln = 0; p.dir = 1;
      ctx.clearRect(0, 0, cv.width, cv.height);
      g.drawPlayer(ctx, 0, 0);
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) % 2147483647;
      fp[id] = h;
    }
    g.setOutfit(zurueck);
    p.x = merker.x; p.y = merker.y; p.vx = merker.vx; p.vy = merker.vy;
    return JSON.stringify(fp);
  })()`));
  check('Jede Kluft zeichnet ein eigenes Bild',
    new Set(Object.values(kluftBild)).size === 3, JSON.stringify(kluftBild));

  // Tastatur über echte Key-Events
  const x0 = await evaluate('window.__roland.game.player.x');
  await key('KeyD', 'keyDown');
  await sleep(700);
  await key('KeyD', 'keyUp');
  await sleep(150);
  const x1 = await evaluate('window.__roland.game.player.x');
  check('Tastatur bewegt den Spieler', x1 - x0 > 40, `dx=${(x1 - x0).toFixed(0)}`);

  await key('Space', 'keyDown');
  await sleep(90);
  const vy = await evaluate('window.__roland.game.player.vy');
  await key('Space', 'keyUp');
  check('Springen reagiert auf die Tastatur', vy < 0, `vy=${vy}`);
  await sleep(700);

  // Kleiderständer: hinlaufen, dann Aktion drücken — bloßes Berühren öffnet nichts
  await key('KeyD', 'keyDown');
  let near = false;
  for (let i = 0; i < 45 && !near; i++) {
    await sleep(100);
    near = (await evaluate('window.__roland.game.hud.standNear')) === true;
  }
  const withoutPress = JSON.parse(await evaluate(`JSON.stringify({
    state: window.__roland.game.state,
    label: (window.__roland.game.hud.label || {}).text || null,
    labelSichtbar: !document.getElementById('worldlabel').classList.contains('hidden')
  })`));
  check('Berühren allein öffnet die Umkleide nicht', withoutPress.state === 'play', withoutPress.state);
  check('Aufforderung UMZIEHEN erscheint am Ständer', withoutPress.label === 'UMZIEHEN',
    JSON.stringify(withoutPress));
  check('Schild wird im Bild angezeigt', withoutPress.labelSichtbar === true);
  await key('KeyD', 'keyUp'); await sleep(120);

  await key('KeyE', 'keyDown');
  await sleep(220);
  await key('KeyE', 'keyUp');
  await sleep(250);
  const wardrobeState = JSON.parse(await evaluate(`JSON.stringify({
    state: window.__roland.game.state,
    reason: window.__roland.game.pauseReason,
    overlay: !document.getElementById('garde').classList.contains('hidden'),
    options: [...document.querySelectorAll('#gardeCards button .title')].map(e=>e.textContent)
  })`));
  check('Aktionstaste öffnet die Umkleide', wardrobeState.state === 'paused' && wardrobeState.reason === 'stand',
    JSON.stringify(wardrobeState));
  // DRR-F4: auch die Umkleide am Kleiderständer kennt Zivil nicht mehr — der
  // Ständer steht in den Akten, der Kleiderschrank nur im Kleingarten.
  check('Umkleide zeigt vor dem Garten genau drei Klüfte (ohne Zivil)',
    wardrobeState.options.length === 3
      && ['SCHWARZES HEMD', 'ANZUG + KRAWATTE', 'FRACK'].every((k) => wardrobeState.options.includes(k))
      && !wardrobeState.options.includes('SHORTS + HAWAII-HEMD'),
    JSON.stringify(wardrobeState.options));
  const zivilVersuch = JSON.parse(await evaluate(`(() => {
    const g = window.__roland.game;
    const vorher = g.outfit.id;
    const setOk = g.setOutfit('zivil');            // Konsole/Debug-Weg
    const nachSet = g.outfit.id;
    return JSON.stringify({ vorher, setOk, nachSet, kluftWahl: window.__roland.kluftWahl });
  })()`));
  check('Zivil laesst sich im Akt nicht erzwingen (Debug-Weg bleibt wirkungslos)',
    zivilVersuch.setOk === false && zivilVersuch.nachSet === zivilVersuch.vorher
      && !zivilVersuch.kluftWahl.includes('zivil'),
    JSON.stringify(zivilVersuch));

  await evaluate("document.querySelectorAll('#gardeCards button')[1].click()");
  await sleep(300);
  const afterWardrobe = JSON.parse(await evaluate(`JSON.stringify({
    state: window.__roland.game.state,
    kluft: window.__roland.game.hud.outfit.id,
    overlayZu: document.getElementById('garde').classList.contains('hidden')
  })`));
  check('Anzug nach der Umkleide aktiv', afterWardrobe.kluft === 'anzug' && afterWardrobe.state === 'play',
    JSON.stringify(afterWardrobe));
  check('Umkleide schließt sich wieder', afterWardrobe.overlayZu === true);

  // Schwierigkeit umschalten: wirkt sofort und bleibt gemerkt
  await evaluate("document.getElementById('diffBtn').click()");
  await sleep(250);
  const diffAfter = JSON.parse(await evaluate(`JSON.stringify({
    text: document.getElementById('diffBtn').textContent,
    game: window.__roland.game.difficulty,
    gespeichert: JSON.parse(localStorage.getItem('rasender-roland/v1') || '{}').difficulty
  })`));
  check('Umschalten wirkt sofort im Spiel', diffAfter.game === 'zuegig', JSON.stringify(diffAfter));
  check('Umschalten wird gemerkt', diffAfter.gespeichert === 'zuegig', JSON.stringify(diffAfter));
  await evaluate("document.getElementById('diffBtn').click()");
  await sleep(250);
  check('Zurückschalten auf gemütlich',
    (await evaluate('window.__roland.game.difficulty')) === 'gemuetlich');

  // Rendering: leeres Canvas wäre ein Totalausfall
  const px = JSON.parse(await evaluate(`(() => {
    const c = document.getElementById('game');
    const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let nonBg = 0; const colors = new Set();
    for (let i=0;i<d.length;i+=4){ const k=(d[i]<<16)|(d[i+1]<<8)|d[i+2]; colors.add(k); if(k!==0x141021) nonBg++; }
    return JSON.stringify({nonBg, farben: colors.size, gesamt: d.length/4});
  })()`));
  check('Canvas ist nicht leer', px.nonBg > px.gesamt * 0.15, JSON.stringify(px));
  check('Pixel-Art mit begrenzter Palette', px.farben > 20 && px.farben < 900, `farben=${px.farben}`);

  // Läuft das Bild wirklich weiter? Fingerabdruck über 64 Regionen der ganzen
  // Fläche, gemessen während der Spieler läuft (ein Standbild wäre ein Totalausfall).
  const sigExpr = `(() => {
    const c = document.getElementById('game');
    const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    const rw = Math.floor(c.width/8), rh = Math.floor(c.height/8);
    const out = [];
    for (let by=0; by<8; by++) for (let bx=0; bx<8; bx++) {
      let s = 0; const x0 = bx*rw, y0 = by*rh;
      for (let y=y0; y<y0+rh; y++) for (let x=x0; x<x0+rw; x+=2) {
        const i = (y*c.width+x)*4;
        s = (s*31 + d[i] + d[i+1]*3 + d[i+2]*7) >>> 0;
      }
      out.push(s);
    }
    return out;
  })()`;
  const t0 = await evaluate('window.__roland.game.time');
  await key('KeyD', 'keyDown');
  const sigA = await evaluate(sigExpr);
  await sleep(450);
  const diag = JSON.parse(await evaluate(`JSON.stringify({
    state: window.__roland.game.state,
    hidden: document.hidden,
    zeit: window.__roland.game.time
  })`));
  const sigB = await evaluate(sigExpr);
  await key('KeyD', 'keyUp');
  const changed = sigA.filter((v, i) => v !== sigB[i]).length;
  check('Simulation läuft in Echtzeit weiter', diag.zeit > t0,
    `t ${t0.toFixed(2)} -> ${diag.zeit.toFixed(2)} (${diag.state})`);
  check('Bild verändert sich im Spiel (kein Standbild)', changed >= 3,
    `Regionen geändert: ${changed}/64 state=${diag.state} hidden=${diag.hidden}`);

  // Figur und Boden an der erwarteten Stelle im Framebuffer
  const look = JSON.parse(await evaluate(`(() => {
    const g = window.__roland.game;
    const p = g.player;
    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const wx = Math.round(p.x - g.cam.x), wy = Math.round(p.y - g.cam.y);
    const d = ctx.getImageData(0,0,cv.width,cv.height).data;
    const at = (x,y) => { const i=(y*cv.width+x)*4; return [d[i],d[i+1],d[i+2]]; };
    // Hautpixel in der Figurbox zählen
    let haut = 0;
    for (let y=wy;y<wy+p.h+1;y++) for (let x=wx-2;x<wx+16;x++) {
      if (x<0||y<0||x>=cv.width||y>=cv.height) continue;
      const [r,gg,bb] = at(x,y);
      if (Math.abs(r-0xe8)<=20 && Math.abs(gg-0xb9)<=20 && Math.abs(bb-0x8a)<=20) haut++;
    }
    // Bodenkachel unter den Füßen
    const ftx = Math.floor((p.x + p.w/2)/16), fty = Math.floor((p.y + p.h + 2)/16);
    const bx = ftx*16 - Math.round(g.cam.x) + 8, by = fty*16 - Math.round(g.cam.y) + 8;
    const boden = (bx>=0 && by>=0 && bx<cv.width && by<cv.height) ? at(bx,by) : null;
    return JSON.stringify({haut, boden, wx, wy, ftx, fty, tile: g.grid[fty][ftx]});
  })()`));
  const sizeCheck = JSON.parse(await evaluate(`JSON.stringify({
    w: window.__roland.game.player.w, h: window.__roland.game.player.h,
    vw: window.__roland.game.vw, vh: window.__roland.game.vh,
    sprite: 24
  })`));
  check('Spielfigur ist deutlich größer als früher (12x22 statt 10x15)',
    sizeCheck.w >= 12 && sizeCheck.h >= 22, JSON.stringify(sizeCheck));
  check('Spielfigur ist im Framebuffer sichtbar', look.haut >= 6, JSON.stringify(look));
  const bodenOk = look.boden && look.boden[0] <= 0x50 && look.boden[1] <= 0x48 && look.boden[2] <= 0x70;
  check('Bodenkachel unter der Figur ist gezeichnet', look.tile === 1 && bodenOk,
    JSON.stringify(look));

  // Gegnername erscheint, wenn man davorsteht (Antwort auf "was schiesst das?")
  await evaluate(`(() => {
    const g = window.__roland.game;
    const en = g.entities.find((e) => e.kind === 'piccolo');
    g.player.x = en.x + 30;
    g.player.y = en.y + en.h - g.player.h;   // Füße auf dieselbe Kante
    g.player.vx = 0; g.player.vy = 0;
  })()`);
  await sleep(400);
  const enemyLabel = JSON.parse(await evaluate(`JSON.stringify({
    text: (window.__roland.game.hud.label || {}).text || null,
    sichtbar: !document.getElementById('worldlabel').classList.contains('hidden'),
    dom: document.getElementById('worldlabel').textContent
  })`));
  check('Gegner wird beim Nähern benannt', enemyLabel.text === 'PICCOLO', JSON.stringify(enemyLabel));
  check('Name steht auch im DOM', enemyLabel.sichtbar && enemyLabel.dom === 'PICCOLO', JSON.stringify(enemyLabel));

  const hud = JSON.parse(await evaluate(`JSON.stringify({
    kluft: document.getElementById('kluft').textContent,
    nerven: document.getElementById('nerven').textContent,
    bpm: document.getElementById('bpm').textContent,
    deckel: document.getElementById('deckel').textContent,
    tipSichtbar: !document.getElementById('hintbar').classList.contains('hidden'),
    tip: document.getElementById('hintbar').textContent
  })`));
  const outfitNow = await evaluate('window.__roland.game.hud.outfit.short');
  check('HUD zeigt die aktive Kluft', hud.kluft.startsWith(outfitNow),
    `${hud.kluft} vs ${outfitNow}`);
  check('HUD zeigt Nerven', /[●○]{3}/.test(hud.nerven), hud.nerven);
  check('HUD zeigt Tempo 100', hud.bpm === '100', hud.bpm);
  check('Deckel-Anzeige stimmt', /^\d\/5$/.test(hud.deckel), hud.deckel);
  check('Kontexttip erscheint', hud.tipSichtbar && hud.tip.length > 10, hud.tip);

  // Pause über Tastatur
  await key('KeyP', 'keyDown'); await key('KeyP', 'keyUp');
  await sleep(250);
  check('Pause öffnet die Anzeige',
    (await evaluate("window.__roland.game.state")) === 'paused'
    && (await evaluate("!document.getElementById('pause').classList.contains('hidden')")) === true);
  await evaluate("document.getElementById('resumeBtn').click()");
  await sleep(200);
  check('Weiter läuft', (await evaluate('window.__roland.game.state')) === 'play');

  // Laufzeitverhalten
  await sleep(3000);
  const run = JSON.parse(await evaluate(`JSON.stringify({
    state: window.__roland.game.state,
    beats: window.__roland.game.beats,
    particles: window.__roland.game.particles.length,
    projectiles: window.__roland.game.projectiles.length,
    errors: window.__errors
  })`));
  check('Taktgeber läuft', run.beats >= 3, `beats=${run.beats}`);
  check('keine JavaScript-Fehler zur Laufzeit', run.errors.length === 0, JSON.stringify(run.errors));
  check('keine Browser-Fehler gesammelt', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  // Screenshots gehören in den Arbeitsbereich des Projekts, nicht nach /tmp.
  const shotDir = fileURLToPath(new URL('../.artifacts/', import.meta.url));
  mkdirSync(shotDir, { recursive: true });
  const shotPath = join(shotDir, 'browser-smoke.png');
  writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  check('Screenshot geschrieben', existsSync(shotPath));
  results.push(`SCREENSHOT ${shotPath}`);
  results.push(`MODUS ${await evaluate("document.getElementById('pad').classList.contains('show') ? 'touch-pad sichtbar' : 'tastatur'")}`);

  // --- Übergang per WEITER: der blinde Fleck der alten Tests ---------------
  // Geprüft wird, dass WEITER wirklich auf der nächsten Station landet — in
  // jeder Reihenfolge. (Der alte Test lief nur über vier Startindizes und
  // bestand teilweise, weil ein liegengebliebenes Simulationsobjekt noch
  // „racer" meldete.)
  const uebergaenge = [];
  const levelIds = JSON.parse(await evaluate('JSON.stringify(window.__roland.levelIds)'));
  for (let start = 0; start < levelIds.length - 1; start++) {
    await evaluate(`window.__roland.loadAct(${start})`);
    await evaluate("document.getElementById('startBtn').click()");
    await sleep(250);
    const istFahr = await evaluate("window.__roland.level.mode === 'racer'");
    if (!istFahr) { await evaluate("document.querySelectorAll('#gardeCards button')[0].click()"); await sleep(350); }
    await evaluate("(() => { const a = window.__roland.aktiv; a.complete ? a.complete() : a.ende(); })()");
    await sleep(250);
    await evaluate("document.getElementById('rewardBtn').click()");
    await sleep(900);
    const zustand = JSON.parse(await evaluate(`JSON.stringify({
      akt: window.__roland.aktIndex,
      id: window.__roland.level.id,
      modus: window.__roland.level.mode,
      fehler: window.__errors.length,
      panelOffen: !document.getElementById('reward').classList.contains('hidden')
    })`));
    uebergaenge.push({
      text: `${start}->${zustand.akt}:${zustand.id}:${zustand.modus}:err${zustand.fehler}:${zustand.panelOffen ? 'offen' : 'zu'}`,
      erwartet: levelIds[start + 1],
      zustand,
    });
  }
  check('WEITER führt zuverlässig in die nächste Station (auch Interludien)',
    uebergaenge.length === levelIds.length - 1
      && uebergaenge.every((x, i) => x.zustand.akt === i + 1
        && x.zustand.id === levelIds[i + 1]
        && x.zustand.fehler === 0
        && x.zustand.panelOffen === false),
    uebergaenge.map((x) => x.text).join(' | '));

  // --- Stationswahl: alle Akte und Interludien erreichbar ------------------
  const wahl = JSON.parse(await evaluate(`JSON.stringify({
    sichtbar: !document.getElementById('actRow').classList.contains('hidden'),
    knoepfe: [...document.querySelectorAll('#actRow button')].map((b) => b.textContent.trim())
  })`));
  // Die Mappe aus Akt 1 landet im Spielstand (Review-Befund: sonst wäre der
  // Abgabe-Schritt in Akt 2 im echten Spiel nie erreichbar).
  await evaluate("localStorage.setItem('rasender-roland/v1', JSON.stringify({ akt1: true, act: 1 }))");
  await evaluate('window.__roland.loadAct(0)');
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(300);
  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(600);
  await evaluate(`(() => {
    const g = window.__roland.game;
    g.stimmblaetter = 2;
    const b = g.entities.find((en) => en.kind === 'item' && en.item === 'stimmblatt' && en.alive);
    g.player.x = b.x; g.player.y = b.y - 4;
    g.player.vx = 0; g.player.vy = 0;
    return 1;
  })()`);
  await sleep(600);
  const mappeStand = JSON.parse(await evaluate(`JSON.stringify({
    getragen: window.__roland.game.hasMappe,
    imStand: JSON.parse(localStorage.getItem('rasender-roland/v1') || '{}').mappe,
  })`));
  check('Akt 1: das dritte Stimmblatt landet im Spielstand',
    mappeStand.getragen === true && mappeStand.imStand === true, JSON.stringify(mappeStand));

  check('Stationswahl listet alle Stationen',
    wahl.sichtbar && wahl.knoepfe.length >= 8 && wahl.knoepfe.some((k) => k.includes('CABRIO')),
    JSON.stringify(wahl.knoepfe));
  const idxVon = (wort) => wahl.knoepfe.findIndex((k) => k.toUpperCase().includes(wort));
  const fahrProbe = [];
  for (const wort of ['CABRIO', 'MOTORRAD']) {
    await evaluate(`window.__roland.loadAct(${idxVon(wort)})`);
    await sleep(250);
    fahrProbe.push(await evaluate(`window.__roland.level.id + ':' + (window.__roland.level.fahrzeug || 'ohne')`));
  }
  check('Stationswahl enthält beide Fahr-Interludien',
    fahrProbe[0] === 'cabrio:mx5' && fahrProbe[1] === 'motorrad:motorrad', fahrProbe.join(' | '));
  check('Die Nachtfahrt ist der Heimweg (Finale vor dem Motorrad)',
    idxVon('MOTORRAD') > idxVon('DIE BÜHNE') && idxVon('KLEINGARTEN') > idxVon('MOTORRAD'),
    `bühn=${idxVon('DIE BÜHNE')} motorrad=${idxVon('MOTORRAD')} garten=${idxVon('KLEINGARTEN')}`);

  // Befund D1: Der Klick auf den Stationsknopf selbst muss die Fahrt-Interludien
  // starten. Vorher warf `for (const h of LEVEL.hints)` dort einen TypeError,
  // weil Cabrio und Motorrad keine Hints liefern — die Schleife stand vor
  // startLevel(), also passierte nach dem Klick gar nichts.
  const klickProbe = [];
  for (let i = 0; i < wahl.knoepfe.length; i++) {
    await evaluate(`(() => { window.__errors.length = 0; document.querySelector('#actRow button[data-akt="${i}"]').click(); return 1; })()`);
    await sleep(260);
    klickProbe.push({
      akt: i,
      id: await evaluate('window.__roland.level.id'),
      fahrzeug: await evaluate('window.__roland.level.fahrzeug || ""'),
      laeuft: await evaluate('window.__roland.aktiv ? window.__roland.aktiv.state : "keiner"'),
      motiv: await evaluate('window.__roland.musik.aktuellesMotiv()'),
      fehler: await evaluate('JSON.stringify(window.__errors)'),
    });
  }
  const fahrKlicks = klickProbe.filter((k) => k.fahrzeug);
  check('Stationsklick startet beide Fahr-Interludien',
    fahrKlicks.length === 2 && fahrKlicks.every((k) => k.laeuft === 'play'),
    JSON.stringify(fahrKlicks));
  check('Stationsklick bleibt auf jeder Station fehlerfrei',
    klickProbe.every((k) => k.fehler === '[]'),
    klickProbe.filter((k) => k.fehler !== '[]').map((k) => `akt${k.akt}: ${k.fehler}`).join(' | '));
  // Musik: jeder Stationsklick zieht das Motiv der Station nach (kein Tonvergleich,
  // aber der Zustandswechsel muss stimmen).
  check('Stationswechsel wechselt das Musikmotiv',
    klickProbe.every((k) => k.motiv === k.id),
    klickProbe.map((k) => `${k.id}->${k.motiv}`).join(' | '));

  // --- Akt 2 im echten Browser --------------------------------------------
  // Nach Akt 1 erscheint der Kurzweg (hier über den Spielstand simuliert)
  await evaluate("localStorage.setItem('rasender-roland/v1', JSON.stringify({ akt1: true, act: 1 }))");
  await evaluate("document.getElementById('quitBtn') ? 0 : 0");
  await new Promise((r) => setTimeout(r, 50));
  await evaluate("window.__roland.loadAct(0)");
  await send('Page.navigate', { url: URL_TO_TEST + (URL_TO_TEST.includes('?') ? '&' : '?') + 'v=' + Date.now() });
  await sleep(1600);
  check('Mit Fortschritt erscheint die Stationswahl',
    (await evaluate("document.getElementById('actRow').classList.contains('hidden')")) === false
      && (await evaluate("document.querySelectorAll('#actRow button').length")) >= 8);
  check('Mit Fortschritt startet das Spiel direkt in Akt 2',
    (await evaluate('window.__roland.aktIndex')) === 1);

  // Save-Migration im echten Spiel (DRR-03): act=5 hieß früher „Motorrad"
  // (Index 5 der alten Reihenfolge). Nach der Umstellung steht die Nachtfahrt
  // an sechster Stelle — der Stand darf nicht auf der Bühne landen.
  await evaluate("localStorage.setItem('rasender-roland/v1', JSON.stringify({ akt1: true, act: 5 }))");
  await send('Page.navigate', { url: URL_TO_TEST + (URL_TO_TEST.includes('?') ? '&' : '?') + 'v=' + Date.now() });
  await sleep(1600);
  const migriert = JSON.parse(await evaluate(`JSON.stringify({
    id: window.__roland.level.id,
    akt: window.__roland.aktIndex,
    gespeichert: JSON.parse(localStorage.getItem('rasender-roland/v1') || '{}').station
  })`));
  check('Alter Spielstand landet auf der Nachtfahrt, nicht auf der Bühne',
    migriert.id === 'motorrad' && migriert.akt === idxVon('MOTORRAD') && migriert.gespeichert === 'motorrad',
    JSON.stringify(migriert));
  check('Der aufgefrischte Stand steht in der neuen Form im Speicher',
    (await evaluate("JSON.parse(localStorage.getItem('rasender-roland/v1') || '{}').v")) === 3,
    String(await evaluate("localStorage.getItem('rasender-roland/v1')")));
  const wahlDa = await evaluate("document.querySelectorAll('#actRow button').length");
  check('Stationswahl ist nach dem Laden wieder da', wahlDa >= 8, `Knöpfe=${wahlDa}`);
  await evaluate("document.querySelectorAll('#actRow button')[0].click()");
  await sleep(400);
  check('Stationswahl führt zu Akt 1 und öffnet die Kleiderwahl',
    (await evaluate("document.getElementById('garde').classList.contains('hidden')")) === false
    && (await evaluate("window.__roland.aktIndex")) === 0);
  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(500);

  await evaluate("window.__roland.loadAct(1)");
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(300);
  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(800);
  const akt2 = JSON.parse(await evaluate(`JSON.stringify({
    name: window.__roland.game.level.name,
    dirigent: window.__roland.game.entities.filter((e) => e.kind === 'dirigent').length,
    takts: (window.__roland.game.level.takts || []).length,
    deckel: window.__roland.game.hud.deckelTotal,
    state: window.__roland.game.state,
    bpm: window.__roland.game.hud.bpm,
    nerven: window.__roland.game.maxNerves
  })`));
  check('Akt 2 lädt und läuft', akt2.name.includes('AKT 2') && akt2.state === 'play', JSON.stringify(akt2));
  check('Akt 2: Dirigent und zwei Taktwechsel vorhanden',
    akt2.dirigent === 1 && akt2.takts === 2, JSON.stringify(akt2));
  check('Akt 2: fünf Bierdeckel, ein Nerv mehr als Belohnung',
    akt2.deckel === 5 && akt2.nerven === 4, JSON.stringify(akt2));

  const a2x0 = await evaluate('window.__roland.game.player.x');
  await key('KeyD', 'keyDown');
  await sleep(1200);
  await key('KeyD', 'keyUp');
  await sleep(150);
  const a2x1 = await evaluate('window.__roland.game.player.x');
  check('Akt 2: Spieler läuft im Probenraum', a2x1 - a2x0 > 60, `dx=${(a2x1 - a2x0).toFixed(0)}`);

  // Das Dirigentenpult (DRR-04): drei Takte im Takt ergeben den ersten Einsatz.
  // Die Buehnentuer gibt erst Einsatz + Anna-Abschied frei (Vertrag act2-template:
  // goal need=einsatz + flags probe_abgenommen) — der Abschied folgt weiter unten.
  const pult = JSON.parse(await evaluate(`(() => {
    const g = window.__roland.game;
    const p = g.entities.find((en) => en.kind === 'pult');
    if (!p) return JSON.stringify({ da: false });
    g.player.x = p.x + 4;
    g.player.y = p.y + p.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
    return JSON.stringify({
      da: true, noetig: p.noetig, teil: p.teil,
      ziel: g.level.goal.need, zielFrei: g.goalErfuellt(),
    });
  })()`));
  check('Akt 2: Dirigentenpult steht im Probenraum, Ziel verlangt den Einsatz',
    pult.da === true && pult.noetig === 3 && pult.ziel === 'einsatz', JSON.stringify(pult));
  check('Akt 2: Ziel ist vor dem Einsatz gesperrt', pult.zielFrei === false, JSON.stringify(pult));
  await sleep(300);
  for (let i = 0; i < 3; i++) {
    await evaluate('window.__roland.game.beatPhase = 0.02');
    await key('KeyE', 'keyDown');
    await sleep(60);
    await key('KeyE', 'keyUp');
    await sleep(140);
  }
  const einsatz = JSON.parse(await evaluate(`JSON.stringify({
    teil: window.__roland.game.entities.find((e) => e.kind === 'pult').teil,
    gelungen: window.__roland.game.einsatzGelungen,
    zielFrei: window.__roland.game.goalErfuellt(),
  })`));
  check('Akt 2: drei Takte im Takt ergeben den Einsatz',
    einsatz.teil === 3 && einsatz.gelungen === true, JSON.stringify(einsatz));
  check('Akt 2: nach dem Einsatz allein bleibt die Bühnentür bis zum Abschied gesperrt', einsatz.zielFrei === false, JSON.stringify(einsatz));

  // Taktwechsel beim Durchschreiten (Spieler hinter den Wechselpunkt setzen)
  await evaluate(`(() => {
    const g = window.__roland.game;
    g.player.x = g.level.takts[0].x + 20;
    g.player.y = 25 * 16 - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
  })()`);
  await sleep(400);
  const taktWechsel = JSON.parse(await evaluate(`JSON.stringify({
    bpm: window.__roland.game.hud.bpm,
    text: window.__roland.game.hud.hint || ''
  })`));
  // Die Ansage darf hinter direktem Feedback (z.B. Bierdeckel) in der
  // Warteschlange stehen — sie muss aber angekommen sein.
  const wartend = await evaluate("JSON.stringify((window.__roland.game.hintQueue || []).map(q => q.text))");
  check('Taktwechsel wirkt und wird angesagt',
    taktWechsel.bpm !== 100 && (/BPM/.test(taktWechsel.text) || /BPM/.test(wartend)),
    `${JSON.stringify(taktWechsel)} queue=${wartend}`);
  check('keine Fehler in Akt 2',
    (await evaluate('JSON.stringify(window.__errors)')) === '[]',
    await evaluate('JSON.stringify(window.__errors)'));

  // Mit Mappe aus Akt 1: erst ablegen, dann zählen die Takte. Der Abschnitt steht
  // bewusst nach der Taktwechsel-Prüfung: er setzt den Spieler ans Pult, und die
  // Weghinweise, die dabei aufgestaut werden, würden deren Ansage verdrängen.
  await evaluate("localStorage.setItem('rasender-roland/v1', JSON.stringify({ akt1: true, act: 1, mappe: true }))");
  await send('Page.navigate', { url: URL_TO_TEST + (URL_TO_TEST.includes('?') ? '&' : '?') + 'v=' + Date.now() });
  await sleep(1600);
  await evaluate('window.__roland.loadAct(1)');
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(300);
  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(800);
  // Vertrag: Journal startet mit Anna, erst nach dem Briefing nennt es die Mappe
  // (act2-template „starts with Anna“ / „advances to mappe“). Also Briefing zuerst.
  await evaluate(`(() => {
    const g = window.__roland.game;
    const a = g.entities.find((e) => e.kind === 'npc' && e.flag === 'probe_beauftragt');
    g.player.x = a.x - 18; g.player.y = a.y + a.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
  })()`);
  await sleep(250);
  for (let i = 0; i < 3; i++) {
    await key('KeyE', 'keyDown'); await sleep(80);
    await key('KeyE', 'keyUp'); await sleep(100);
  }
  const vorAbgabe = JSON.parse(await evaluate(`(() => {
    const g = window.__roland.game;
    const p = g.entities.find((en) => en.kind === 'pult');
    g.player.x = p.x + 4; g.player.y = p.y + p.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
    return JSON.stringify({ mappe: g.hasMappe, ziel: g.hud.ziel, teil: p.teil });
  })()`));
  check('Akt 2: die Mappe aus Akt 1 kommt mit', vorAbgabe.mappe === true, JSON.stringify(vorAbgabe));
  check('Akt 2: die Aufgabe nennt die Abgabe',
    (vorAbgabe.ziel || '').includes('MAPPE'), vorAbgabe.ziel);
  await sleep(1200);                       // Kamera nachziehen lassen
  await key('KeyE', 'keyDown');
  await sleep(60);
  await key('KeyE', 'keyUp');
  await sleep(160);
  const nachAbgabe = JSON.parse(await evaluate(`JSON.stringify({
    abgegeben: window.__roland.game.mappeAbgegeben,
    mappe: window.__roland.game.hasMappe,
    teil: window.__roland.game.entities.find((e) => e.kind === 'pult').teil,
  })`));
  check('Akt 2: die Mappe liegt auf dem Pult und kostet keinen Takt',
    nachAbgabe.abgegeben === true && nachAbgabe.mappe === false && nachAbgabe.teil === 0,
    JSON.stringify(nachAbgabe));

  // Akt-2-Musterstrecke im echten Browser: Anna an beiden Enden, fünf
  // Requisiten, Motiv und Journal — dazu drei Raumbilder act2-*.png.
  await evaluate("window.__roland.loadAct(1)");
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(300);
  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(800);
  const a2muster = JSON.parse(await evaluate(`(() => {
    const g = window.__roland.game;
    const npcs = g.entities.filter((e) => e.kind === 'npc');
    const decor = g.entities.filter((e) => e.kind === 'decor');
    return JSON.stringify({
      annas: npcs.filter((e) => e.flag === 'probe_beauftragt' || e.flag === 'probe_abgenommen').length,
      namen: [...new Set(npcs.map((e) => e.name))],
      decor: new Set(decor.map((e) => e.spr)).size,
      motiv: (g.level.motiv && g.level.motiv.id) || null,
      steps: (g.level.storySteps || []).length,
      ziel: g.hud.ziel,
      route: g.level.route && g.level.route.reversible === true
    });
  })()`));
  check('Akt 2 rendert zwei Anna-Begegnungen', a2muster.annas === 2, JSON.stringify(a2muster));
  check('Akt 2 hat mindestens fünf unterschiedliche Raumrequisiten', a2muster.decor >= 5, JSON.stringify(a2muster));
  check('Akt 2 nennt das Proben-Motiv für das Finale', a2muster.motiv === 'probe-motiv', JSON.stringify(a2muster));
  check('Akt 2 startet das Journal mit Anna', (a2muster.ziel || '').includes('ANNA'), a2muster.ziel);
  // Flur: Briefing per echter E-Taste, dann das erste Raumbild.
  await evaluate(`(() => {
    const g = window.__roland.game;
    const a = g.entities.find((e) => e.kind === 'npc' && e.flag === 'probe_beauftragt');
    g.player.x = a.x - 18; g.player.y = a.y + a.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
  })()`);
  await sleep(250);
  check('Anna wird im Browser als Interaktion beschriftet',
    (await evaluate("(window.__roland.game.hud.label || {}).text || ''")).includes('ANNA'));
  check('Touch-Aktion heißt bei Anna nicht Tritt',
    (await evaluate("document.getElementById('btnAction').textContent")) === 'AKTION');
  const flurShot = await send('Page.captureScreenshot', { format: 'png' });
  const flurPath = join(act1ShotDir, 'act2-flur.png');
  writeFileSync(flurPath, Buffer.from(flurShot.data, 'base64'));
  check('Akt-2-Flurbild geschrieben', existsSync(flurPath));
  results.push(`AKT2-SCREENSHOT ${flurPath}`);
  for (let i = 0; i < 3; i++) {
    await key('KeyE', 'keyDown'); await sleep(80);
    await key('KeyE', 'keyUp'); await sleep(100);
  }
  await evaluate(`(() => {
    const g = window.__roland.game;
    const gate = g.gates.find((e) => e.flag === 'probe_beauftragt');
    g.player.x = gate.tx * 16 - g.player.w + 2;
    g.player.y = 25 * 16 - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
  })()`);
  await sleep(200);
  const a2brief = JSON.parse(await evaluate(`JSON.stringify({
    flag: window.__roland.game.storyFlags.has('probe_beauftragt'),
    tor: window.__roland.game.gates.find((e) => e.flag === 'probe_beauftragt').open,
    ziel: window.__roland.game.hud.ziel
  })`));
  check('Drei echte E-Tastendrücke schließen Annas Auftrag ab', a2brief.flag === true, JSON.stringify(a2brief));
  check('Annas Auftrag öffnet die Saaltür im Browser', a2brief.tor === true, JSON.stringify(a2brief));
  check('Das Journal wechselt danach zu Mappe und Einsatz', (a2brief.ziel || '').includes('MAPPE'), a2brief.ziel);
  // Pult: getragene Mappe im Bild, dann Abgabe und Einsatz per E-Taste.
  await evaluate(`(() => {
    const g = window.__roland.game;
    const p = g.entities.find((e) => e.kind === 'pult');
    g.player.x = p.x + 4; g.player.y = p.y + p.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
  })()`);
  await sleep(1200);
  const pultShot = await send('Page.captureScreenshot', { format: 'png' });
  const pultPath = join(act1ShotDir, 'act2-pult.png');
  writeFileSync(pultPath, Buffer.from(pultShot.data, 'base64'));
  check('Akt-2-Pultbild geschrieben', existsSync(pultPath));
  results.push(`AKT2-SCREENSHOT ${pultPath}`);
  await key('KeyE', 'keyDown'); await sleep(60);
  await key('KeyE', 'keyUp'); await sleep(160);
  for (let i = 0; i < 3; i++) {
    await evaluate('window.__roland.game.beatPhase = 0.02');
    await key('KeyE', 'keyDown'); await sleep(60);
    await key('KeyE', 'keyUp'); await sleep(140);
  }
  const a2einsatz = JSON.parse(await evaluate(`JSON.stringify({
    teil: window.__roland.game.entities.find((e) => e.kind === 'pult').teil,
    gelungen: window.__roland.game.einsatzGelungen,
    flag: window.__roland.game.storyFlags.has('einsatz_gelungen')
  })`));
  check('Drei Takte im Takt ergeben den Einsatz im Browser',
    a2einsatz.teil === 3 && a2einsatz.gelungen === true && a2einsatz.flag === true, JSON.stringify(a2einsatz));
  // Bühne: Frack an, Anna-Payoff per E-Taste, drittes Raumbild am Ziel.
  await evaluate(`(() => {
    const g = window.__roland.game;
    g.setOutfit('frack');
    const a = g.entities.find((e) => e.kind === 'npc' && e.flag === 'probe_abgenommen');
    g.player.x = a.x - 18; g.player.y = a.y + a.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
  })()`);
  await sleep(300);
  const buehneShot = await send('Page.captureScreenshot', { format: 'png' });
  const buehnePath = join(act1ShotDir, 'act2-buehne.png');
  writeFileSync(buehnePath, Buffer.from(buehneShot.data, 'base64'));
  check('Akt-2-Bühnenbild geschrieben', existsSync(buehnePath));
  results.push(`AKT2-SCREENSHOT ${buehnePath}`);
  for (let i = 0; i < 2; i++) {
    await key('KeyE', 'keyDown'); await sleep(80);
    await key('KeyE', 'keyUp'); await sleep(100);
  }
  const a2payoff = JSON.parse(await evaluate(`JSON.stringify({
    flag: window.__roland.game.storyFlags.has('probe_abgenommen'),
    zielFrei: window.__roland.game.goalErfuellt()
  })`));
  check('Annas Abschied gibt den Bühneneingang frei',
    a2payoff.flag === true && a2payoff.zielFrei === true, JSON.stringify(a2payoff));

  await evaluate("window.__roland.loadAct(0)");

  // --- Einstiegs-Cutscene vor dem Cabrio-Interludium (Auftrag CUT-2) --------
  // Die Szene laeuft hier wirklich durch — zweimal: der zweite Start zeigt sie
  // seit Roland (13.09.) wieder. Der Abschnitt weiter unten startet die Fahrt
  // erneut und muss deshalb erst die Szene abwarten.
  await pruefeEinstiegSzene('cabrio');

  // --- Cabrio-Interludium im Browser --------------------------------------
  await evaluate("window.__roland.loadAct(2)");
  await evaluate("document.getElementById('startBtn').click()");
  // Seit Roland (13.09.) laeuft die Einstiegs-Cutscene bei JEDEM Start der
  // Fahrt — auch hier mitten im Durchlauf; erst danach uebernimmt die Fahrt.
  await sleep(400);
  const cabSzene = JSON.parse(await evaluate(`JSON.stringify({
    aktiv: window.__roland.einstieg.aktiv,
    fahrzeug: window.__roland.einstieg.fahrzeug
  })`));
  check('Cabrio: die Einstiegs-Cutscene laeuft auch hier bei jedem Start',
    cabSzene.aktiv === true && cabSzene.fahrzeug === 'cabrio', JSON.stringify(cabSzene));
  const cabWarte = await warteEinstiegVorbei();
  check('Cabrio: die Szene geht in die Fahrt ueber (Wartezeit gemessen)', cabWarte >= 0,
    `gewartet ${cabWarte}s`);
  await sleep(600);
  const cab = JSON.parse(await evaluate(`JSON.stringify({
    name: window.__roland.level.name,
    modus: window.__roland.aktiv.hud.modus,
    state: window.__roland.aktiv.state,
    racerHud: !document.getElementById('racerReadout').classList.contains('hidden'),
    walkHudVersteckt: document.getElementById('walkReadout').classList.contains('hidden'),
    gardeZu: document.getElementById('garde').classList.contains('hidden')
  })`));
  check('Cabrio startet direkt (ohne Umkleide)',
    cab.modus === 'racer' && cab.state === 'play' && cab.gardeZu === true, JSON.stringify(cab));
  check('Fahr-HUD ersetzt das Lauf-HUD',
    cab.racerHud === true && cab.walkHudVersteckt === true, JSON.stringify(cab));

  const sigA2 = await evaluate(sigExpr);
  await sleep(2500);
  const cab2 = JSON.parse(await evaluate(`JSON.stringify({
    kmh: window.__roland.aktiv.hud.speed,
    strecke: window.__roland.aktiv.hud.strecke,
    errors: window.__errors,
    dom: document.getElementById('rSpeed').textContent
  })`));
  check('Wagen beschleunigt von allein', cab2.kmh > 25, JSON.stringify(cab2));
  check('Tempo steht auch im DOM-HUD', Number(cab2.dom) > 25, cab2.dom);
  check('keine Fehler im Interludium', cab2.errors.length === 0, JSON.stringify(cab2.errors));
  const sigB2 = await evaluate(sigExpr);
  check('Fahrt bewegt sich im Bild',
    sigA2.filter((v, i) => v !== sigB2[i]).length >= 3, 'Standbild?');

  // Andere Fahrzeuge und Straßenrand müssen auch wirklich im Bild sein
  const probe = `(() => {
    const r = window.__roland.racer;
    const f = r.buildFrame();
    return JSON.stringify({
      objekte: f.drawList.length,
      fahrzeuge: f.drawList.filter((o) => o.kind === 'auto' || o.kind === 'lkw').length,
      arten: [...new Set(f.drawList.map((o) => o.kind))],
      verkehr: r.traffic.length, rand: r.roadside.length, loecher: r.potholes.length
    });
  })()`;
  let maxObjekte = 0, maxFahrzeuge = 0;
  const gesehen = new Set();
  for (let i = 0; i < 8; i++) {
    const s = JSON.parse(await evaluate(probe));
    maxObjekte = Math.max(maxObjekte, s.objekte);
    maxFahrzeuge = Math.max(maxFahrzeuge, s.fahrzeuge);
    for (const k of s.arten) gesehen.add(k);
    if (i === 0) {
      check('Strecke ist bestückt (Browser)',
        s.verkehr >= 10 && s.rand > 120 && s.loecher >= 8, JSON.stringify(s));
    }
    await sleep(260);
  }
  check('Verkehr und Straßenrand sind im Bild',
    maxObjekte >= 2 && maxFahrzeuge >= 1,
    `max ${maxObjekte} Objekte, ${maxFahrzeuge} Fahrzeuge, Arten: ${[...gesehen].join(',')}`);

  // Cabrio-Journey: Abschnitts-HUD mit Fahrhinweis (vier Abschnitte, Mappe fährt mit)
  const journey = JSON.parse(await evaluate(`JSON.stringify({
    section: window.__roland.aktiv.hud.drive?.section || null,
    cue: window.__roland.aktiv.hud.drive?.cue || null,
    ziel: window.__roland.aktiv.hud.ziel
  })`));
  check('Cabrio zeigt Abschnitt und Fahrhinweis',
    journey.section === 'STADTAUSFAHRT' && !!journey.cue && journey.ziel.includes('MAPPE'),
    JSON.stringify(journey));
  // Phase A: dieselben HUD-Texte liegen in der einen DOM-Ebene (Desktop-Massstab)
  // und nicht mehr im Canvas — gemessen gegen das echte Canvas-Rechteck.
  const fahrDom = JSON.parse(await evaluate(`(() => {
    const r = window.__roland.racer;
    const c = document.getElementById('game');
    const layer = document.getElementById('gameTextLayer');
    const cr = c.getBoundingClientRect();
    const hud = document.querySelector('.hud').getBoundingClientRect();
    const daten = r.beschriftungen();
    const sx = cr.width / r.vw, sy = cr.height / r.vh;
    const abstand = Math.min(Math.max(0, hud.bottom - cr.top + 4), Math.round(cr.height * 0.35));
    let lage = 0, schrift = 99, innen = true;
    for (const d of daten) {
      const e = layer.querySelector('[data-text-id="' + d.id + '"]');
      if (!e) { lage = 99; innen = false; continue; }
      const er = e.getBoundingClientRect();
      lage = Math.max(lage, Math.abs(er.left - (cr.left + d.x * sx)),
        Math.abs(er.top - (cr.top + d.y * sy + (d.unterHud ? abstand : 0))));
      schrift = Math.min(schrift, parseFloat(getComputedStyle(e).fontSize));
      innen = innen && er.left >= cr.left - 0.5 && er.top >= cr.top - 0.5
        && er.right <= cr.right + 0.5 && er.bottom <= cr.bottom + 0.5;
    }
    const texte = Object.fromEntries(daten.map((d) => [d.id,
      (layer.querySelector('[data-text-id="' + d.id + '"]') || {}).textContent || null]));
    return JSON.stringify({ daten: daten.length, elemente: layer.querySelectorAll('[data-text-id]').length,
      lage, schrift, innen, texte, sig: (layer.dataset.sig || '').length });
  })()`));
  check('Cabrio: das Fahr-HUD liegt vollstaendig in der einen DOM-Textebene',
    fahrDom.daten === 8 && fahrDom.elemente === 8 && fahrDom.sig > 0, JSON.stringify(fahrDom));
  check('Cabrio: DOM-Texte sitzen auf dem Pixel, bleiben im Bild und nie unter 12px',
    fahrDom.lage <= 1 && fahrDom.innen && fahrDom.schrift >= 12,
    JSON.stringify({ lage: fahrDom.lage, innen: fahrDom.innen, schrift: fahrDom.schrift }));
  check('Cabrio: Abschnitt, Richtung und Richttempo stehen als Text im DOM',
    /^\d \/ 4 /.test(fahrDom.texte['ro-abschnitt'] || '')
      && ['GERADEAUS', 'RECHTS >', '< LINKS', 'BREMSE'].includes(fahrDom.texte['ro-richtung'])
      && /^RICHTTEMPO \d+$/.test(fahrDom.texte['ro-tempo'] || ''),
    JSON.stringify(fahrDom.texte));
  results.push('CABRIO-DOM ' + JSON.stringify({ daten: fahrDom.daten, lage: fahrDom.lage,
    schrift: fahrDom.schrift, abschnitt: fahrDom.texte['ro-abschnitt'] }));

  await evaluate("window.__roland.loadAct(0)");

  // --- Akt 3 Open Air: Wetter im Browser ----------------------------------
  await evaluate("window.__roland.loadAct(3)");
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(300);
  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(900);
  const akt3 = JSON.parse(await evaluate(`JSON.stringify({
    name: window.__roland.game.level.name,
    wetter: window.__roland.game.hud.wetter,
    dom: document.getElementById('wetter').textContent,
    phasen: (window.__roland.game.level.weather || []).length,
    vordach: (window.__roland.game.level.shelters || []).length,
    state: window.__roland.game.state
  })`));
  check('Akt 3 lädt und läuft', akt3.name.includes('AKT 3') && akt3.state === 'play', JSON.stringify(akt3));
  check('Wetter steht im HUD', akt3.dom === 'SONNE' && akt3.wetter === 'sonne', JSON.stringify(akt3));
  check('Akt 3: vier Wetterlagen und ein Vordach',
    akt3.phasen === 4 && akt3.vordach >= 1, JSON.stringify(akt3));

  // Wetterwechsel im echten Browser abwarten (Sonne -> Wind)
  let gewechselt = null;
  for (let i = 0; i < 40 && !gewechselt; i++) {
    await sleep(600);
    const w = await evaluate('window.__roland.game.hud.wetter');
    if (w === 'wind') gewechselt = w;
  }
  check('Wetter wechselt im Browser', gewechselt === 'wind', String(gewechselt));
  // Blätter erscheinen nicht im selben Moment wie der Wind — kurz nachsehen
  let maxBlaetter = 0;
  for (let i = 0; i < 12 && maxBlaetter === 0; i++) {
    await sleep(350);
    maxBlaetter = await evaluate('window.__roland.game.blaetter.length');
  }
  check('Wind bringt Notenblätter', maxBlaetter > 0, `max ${maxBlaetter} Blätter`);
  const windProbe = JSON.parse(await evaluate(`JSON.stringify({
    wetter: window.__roland.game.hud.wetter,
    dom: document.getElementById('wetter').textContent,
    errors: window.__errors
  })`));
  check('Wetteranzeige steht auf WIND', windProbe.dom === 'WIND', JSON.stringify(windProbe));

  // Die Schallwelle muss sich vom hellen Himmel abheben (Roland-Befund)
  await evaluate("window.__roland.game.wetterIdx = 0; window.__roland.game.wetterTimer = 9999; window.__roland.game.wetterKind = 'sonne'");
  await sleep(350);
  const kontrast = JSON.parse(await evaluate(`(() => {
    const g = window.__roland.game;
    const c = document.getElementById('game');
    const p = g.player;
    g.projectiles.push({ kind: 'sound', x: p.x + 40, y: p.y + 4, w: 12, h: 8, vx: 90, life: 3, dmg: 1 });
    g.draw(c.getContext('2d'));
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const sx = Math.round(p.x + 40 - g.cam.x), sy = Math.round(p.y + 4 - g.cam.y);
    let mn = 999, mx = -1;
    for (let y = sy - 8; y < sy + 16; y++) {
      for (let x = sx - 8; x < sx + 22; x++) {
        if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
        const i = (y * c.width + x) * 4;
        const h = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (h < mn) mn = h;
        if (h > mx) mx = h;
      }
    }
    return JSON.stringify({ min: Math.round(mn), max: Math.round(mx) });
  })()`));
  check('Schallwelle hebt sich vom Himmel ab', kontrast.max - kontrast.min > 60, JSON.stringify(kontrast));
  await evaluate("window.__roland.game.projectiles.length = 0");

  // Himmel statt Höhlenwand: obere Bildhälfte von Akt 3 gegen Akt 1 messen
  const bildOben = `(() => {
    const c = document.getElementById('game');
    const h = Math.max(1, Math.floor(c.height * 0.35));
    const d = c.getContext('2d').getImageData(0, 0, c.width, h).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return JSON.stringify({ r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) });
  })()`;
  const obenAkt3 = JSON.parse(await evaluate(bildOben));
  await evaluate("window.__roland.loadAct(0)");
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(300);
  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(900);
  const obenAkt1 = JSON.parse(await evaluate(bildOben));
  const hell3 = obenAkt3.r + obenAkt3.g + obenAkt3.b;
  const hell1 = obenAkt1.r + obenAkt1.g + obenAkt1.b;
  check('Open Air zeigt Himmel statt Hoehlenwand', hell3 > hell1 + 60,
    `Akt3 ${JSON.stringify(obenAkt3)} vs Akt1 ${JSON.stringify(obenAkt1)}`);
  check('keine Fehler in Akt 3', windProbe.errors.length === 0, JSON.stringify(windProbe.errors));

  // --- Akt 3 Open Air: Handlung, zwei Pulte, Rolfs Abschied -----------------
  // Eigener Spielstand ohne Notenmappe: sonst legt der erste E-Druck am Pult
  // erst die Mappe ab und zaehlt noch keinen Takt. Geprueft wird der
  // Handlungsbogen mit echten Tastenanschlaegen; nur das Anlaufen der Figuren
  // ist instrumentiert (wie im Akt-1-/Akt-2-Abschnitt).
  await evaluate("localStorage.setItem('rasender-roland/v1', JSON.stringify({ akt1: true, act: 3 }))");
  await send('Page.navigate', { url: URL_TO_TEST + (URL_TO_TEST.includes('?') ? '&' : '?') + 'v=' + Date.now() });
  await sleep(1600);
  await evaluate('window.__roland.loadAct(3)');
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(300);
  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(900);

  const a3start = JSON.parse(await evaluate(`(() => {
    const g = window.__roland.game;
    const pulte = g.entities.filter((e) => e.kind === 'pult');
    const klammern = g.entities.filter((e) => e.kind === 'decor' && e.spr === 'klammer');
    return JSON.stringify({
      name: g.level.name,
      state: g.state,
      pulte: pulte.length,
      noetig: pulte.map((p) => p.noetig),
      flags: pulte.map((p) => p.flag),
      pultTiles: pulte.map((p) => Math.round(p.x / 16)),
      klammerTiles: klammern.map((k) => Math.round(k.x / 16)),
      bandZu: g.gates[0].open === false,
      ziel: g.hud.ziel,
      errors: window.__errors,
    });
  })()`));
  check('Akt 3 laedt und laeuft ohne Konsolenfehler',
    a3start.name.includes('AKT 3') && a3start.state === 'play' && a3start.errors.length === 0,
    JSON.stringify(a3start));
  check('Akt 3: zwei Pulte, jedes mit zwei Klammern und eigenem Flag',
    a3start.pulte === 2 && a3start.noetig.every((n) => n === 2)
    && a3start.flags.includes('pult_west_gesichert') && a3start.flags.includes('pult_ost_gesichert')
    && a3start.pultTiles.every((tx) => a3start.klammerTiles.includes(tx)),
    JSON.stringify(a3start));
  check('Akt 3: das Journal beginnt bei Rolf, das Absperrband ist zu',
    /ROLF/.test(a3start.ziel || '') && a3start.bandZu === true, JSON.stringify(a3start));

  // Rolfs Briefing ueber die Aktionstaste: drei Zeilen, dann steht der Auftrag.
  await evaluate(`(() => {
    const g = window.__roland.game;
    const r = g.entities.find((e) => e.kind === 'npc' && e.flag === 'openair_beauftragt');
    g.player.x = r.x - 18; g.player.y = r.y + r.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
  })()`);
  await sleep(300);
  const briefingSchild = JSON.parse(await evaluate('JSON.stringify(window.__roland.game.hud.label)'));
  check('Akt 3: Rolf wird als Gespraechspartner benannt',
    briefingSchild?.action === true && /ROLF/.test(briefingSchild.text), JSON.stringify(briefingSchild));
  for (let i = 0; i < 3; i++) {
    await key('KeyE', 'keyDown'); await sleep(70);
    await key('KeyE', 'keyUp'); await sleep(120);
  }
  const nachBriefing = JSON.parse(await evaluate(`JSON.stringify({
    flag: window.__roland.game.storyFlags.has('openair_beauftragt'),
    ziel: window.__roland.game.hud.ziel,
  })`));
  check('Akt 3: Rolfs Briefing setzt den Auftrag und das Journal wandert zum Westpult',
    nachBriefing.flag === true && /WESTPULT/.test(nachBriefing.ziel || ''), JSON.stringify(nachBriefing));

  // Erst der Auftrag oeffnet das Absperrband — der Spieler laeuft selbst dagegen.
  await key('KeyD', 'keyDown');
  await sleep(1300);
  await key('KeyD', 'keyUp');
  await sleep(200);
  const nachBand = JSON.parse(await evaluate(`JSON.stringify({
    band: window.__roland.game.gates[0].open,
    x: Math.round(window.__roland.game.player.x),
    state: window.__roland.game.state,
  })`));
  check('Akt 3: das Absperrband oeffnet sich auf dem Weg zur Wiese',
    nachBand.band === true && nachBand.x > 20 * 16 && nachBand.state !== 'collapse', JSON.stringify(nachBand));

  // Wind: die Boee kuendigt sich 0,9 s vorher an und treibt Notenblaetter mit
  // (bis zu acht gleichzeitig, 0,6 s Stun bei Kontakt) — die Pulte bleiben
  // dabei spielbar. Der Schub selbst verschiebt den Spieler nicht messbar
  // (62 vs. Bodenreibung 900), geprueft wird deshalb Vorwarnung + Blaetter.
  await evaluate("window.__roland.game.wetterIdx = 1; window.__roland.game.wetterTimer = 9999; window.__roland.game.wetterKind = 'wind'");
  await sleep(300);
  const wetterWind = JSON.parse(await evaluate(`JSON.stringify({
    wetter: window.__roland.game.hud.wetter,
    dom: document.getElementById('wetter').textContent,
  })`));
  let windspur = null;
  for (let i = 0; i < 40 && !windspur; i++) {
    const b = JSON.parse(await evaluate(`JSON.stringify({
      weht: window.__roland.game.gustTimer > 0,
      warnung: window.__roland.game.gustWarn > 0,
      blaetter: window.__roland.game.blaetter.length,
      state: window.__roland.game.state,
    })`));
    if (b.weht && (b.blaetter > 0 || b.warnung)) windspur = b;
    else await sleep(280);
  }
  check('Akt 3: die Boee kuendigt sich vorher an und treibt die Notenblaetter (kein Blocker)',
    wetterWind.wetter === 'wind' && wetterWind.dom === 'WIND'
    && windspur !== null && windspur.state === 'play', JSON.stringify({ wetterWind, windspur }));

  // Beide Pulte im Takt sichern — bei laufendem Wind.
  const pultLabel = `JSON.stringify(window.__roland.game.hud.label)`;
  const sichern = async (flag) => {
    await evaluate(`(() => {
      const g = window.__roland.game;
      const p = g.entities.find((e) => e.kind === 'pult' && e.flag === '${flag}');
      g.player.x = p.x + 4; g.player.y = p.y + p.h - g.player.h;
      g.player.vx = 0; g.player.vy = 0;
    })()`);
    await sleep(300);
    const schild = JSON.parse(await evaluate(pultLabel));
    for (let i = 0; i < 6; i++) {
      const teil = await evaluate(`window.__roland.game.entities.find((e) => e.kind === 'pult' && e.flag === '${flag}').teil`);
      if (teil >= 2) break;
      // Vor jedem Schlag zurueck ans Pult und ins Taktfenster: Gegentreffer und
      // Rueckstoss (vx 110) schieben den Spieler sonst aus der Reichweite —
      // der Windschub allein reicht dafuer nicht (siehe Windpruefung oben).
      await evaluate(`(() => {
        const g = window.__roland.game;
        const p = g.entities.find((e) => e.kind === 'pult' && e.flag === '${flag}');
        g.player.x = p.x + 4; g.player.y = p.y + p.h - g.player.h;
        g.player.vx = 0; g.player.vy = 0;
        g.beatPhase = 0.02;
      })()`);
      await key('KeyE', 'keyDown'); await sleep(70);
      await key('KeyE', 'keyUp'); await sleep(130);
    }
    const stand = JSON.parse(await evaluate(`JSON.stringify({
      teil: window.__roland.game.entities.find((e) => e.kind === 'pult' && e.flag === '${flag}').teil,
      flag: window.__roland.game.storyFlags.has('${flag}'),
      einsatz: window.__roland.game.einsatzGelungen,
      zielFrei: window.__roland.game.goalErfuellt(),
      wetter: window.__roland.game.hud.wetter,
      state: window.__roland.game.state,
    })`));
    return { schild, ...stand };
  };
  const westPult = await sichern('pult_west_gesichert');
  check('Akt 3: Westpult zeigt die zwei Klammern (0/2) und laesst sich im Takt sichern',
    /SICHERN/.test(westPult.schild?.text || '') && /\(0\/2\)/.test(westPult.schild?.text || '')
    && westPult.teil === 2 && westPult.flag === true, JSON.stringify(westPult));
  check('Akt 3: nach dem Westpult steht der Einsatz, das Podium bleibt gesperrt',
    westPult.einsatz === true && westPult.zielFrei === false && westPult.state === 'play',
    JSON.stringify(westPult));
  const ostPult = await sichern('pult_ost_gesichert');
  check('Akt 3: Ostpult zeigt die zwei Klammern (0/2) und laesst sich im Takt sichern',
    /SICHERN/.test(ostPult.schild?.text || '') && /\(0\/2\)/.test(ostPult.schild?.text || '')
    && ostPult.teil === 2 && ostPult.flag === true, JSON.stringify(ostPult));
  check('Akt 3: beide Pulte sind auch bei Wind sicherbar (Boeen sperren nicht)',
    westPult.wetter === 'wind' && ostPult.wetter === 'wind'
    && westPult.state === 'play' && ostPult.state === 'play', JSON.stringify({ westPult, ostPult }));

  // Fuer die Podiumspruefung zurueck auf ruhiges Wetter: die Windpruefung ist
  // oben belegt, und Notenblatt-Stoesse (0,6 s Stun) sollen den Torlauf hier
  // nicht stoeren. Nicht der Schub ist das Problem, sondern der Stun.
  await evaluate("window.__roland.game.wetterIdx = 0; window.__roland.game.wetterTimer = 9999; window.__roland.game.wetterKind = 'sonne'");
  await sleep(250);

  // Podiumstor: ohne Frack bleibt es zu, mit Frack oeffnet es der laufende Spieler.
  await evaluate(`(() => {
    const g = window.__roland.game;
    g.player.x = 93 * 16 - 24; g.player.y = 11 * 16 - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
    g.setOutfit('schwarz');
  })()`);
  await sleep(300);
  const torDerFrack = JSON.parse(await evaluate(`JSON.stringify({
    tor: window.__roland.game.gates[1].open,
    frack: window.__roland.game.outfit.id,
  })`));
  check('Akt 3: das Podiumstor bleibt ohne Frack zu', torDerFrack.tor === false, JSON.stringify(torDerFrack));
  await evaluate("window.__roland.game.setOutfit('frack')");
  await sleep(150);
  await key('KeyD', 'keyDown'); await sleep(900); await key('KeyD', 'keyUp');
  await sleep(250);
  const nachTor = JSON.parse(await evaluate(`JSON.stringify({
    tor: window.__roland.game.gates[1].open,
    x: Math.round(window.__roland.game.player.x),
  })`));
  check('Akt 3: im Frack oeffnet der Spieler das Podiumstor',
    nachTor.tor === true && nachTor.x > 93 * 16, JSON.stringify(nachTor));

  // Das Podium verlangt beide Pulte UND Rolfs Abschied. Beide Pulte sind
  // gesichert, offen ist also genau der dritte Ziel-Flag (openair_abgenommen).
  // Geprueft wird deshalb nicht nur die Sperre, sondern auch, dass das Journal
  // den NOCH OFFENEN Schritt nennt (Rolfs Abschied). Der immer gleiche Zielname
  // PODIUM allein waere kein Beleg fuer die Spielerfuehrung.
  const amPodium = JSON.parse(await evaluate(`JSON.stringify({
    state: window.__roland.game.state,
    zielFrei: window.__roland.game.goalErfuellt(),
    ziel: window.__roland.game.hud.ziel,
    label: window.__roland.game.hud.label,
    pulteGesichert: ['pult_west_gesichert', 'pult_ost_gesichert']
      .every((f) => window.__roland.game.storyFlags.has(f)),
    abschiedOffen: !window.__roland.game.storyFlags.has('openair_abgenommen'),
  })`));
  check('Akt 3: das Podium gibt erst mit beiden Pulten und Rolfs Abschied frei',
    amPodium.state === 'play' && amPodium.zielFrei === false
    && amPodium.pulteGesichert === true && amPodium.abschiedOffen === true
    && /ROLF AM PODIUM TREFFEN/.test(amPodium.ziel || ''), JSON.stringify(amPodium));

  // Rolfs Abschied ueber die Aktionstaste; danach endet der Auftritt.
  for (let i = 0; i < 2; i++) {
    await key('KeyE', 'keyDown'); await sleep(80);
    await key('KeyE', 'keyUp'); await sleep(150);
  }
  const nachAbschied = JSON.parse(await evaluate(`JSON.stringify({
    flag: window.__roland.game.storyFlags.has('openair_abgenommen'),
  })`));
  check('Akt 3: Rolfs Abschied ueber die Aktionstaste schliesst die Story ab',
    nachAbschied.flag === true, JSON.stringify(nachAbschied));
  await sleep(700);
  const a3ende = JSON.parse(await evaluate(`JSON.stringify({
    state: window.__roland.game.state,
    errors: window.__errors,
  })`));
  check('Akt 3: mit beiden Pulten und Rolfs Abschied endet der Auftritt am Podium',
    a3ende.state === 'complete', JSON.stringify(a3ende));
  check('keine Fehler im Akt-3-Auftritt', a3ende.errors.length === 0, JSON.stringify(a3ende.errors));
  // --- Akt 4: Orchestergraben ---------------------------------------------
  // Grenzen des Akt-4-Abschnitts (Auftrag A4h). Der Abschnitt hat frueher
  // unbegrenzt gewartet: die Ausstiegsschleife lief bis zu 260 Schritte weit,
  // in jedem Schritt konnte eine Anlaufschleife von 13 s stecken, die das Ziel
  // nur alle 100 ms abtastete und deshalb ueber es hinweglief (Rechts-links-
  // Pingpong). Der Lauf endete nicht mit FAIL, sondern in der Zeitgrenze des
  // Aufrufers — mit NULL Ausgabezeilen, weil alle Meldungen bis zum Schluss
  // gepuffert wurden. Deshalb jetzt:
  //   * harte Wandumgrenzung ueber Date.now() (A4_BUDGET_MS),
  //   * eine sofort ausgegebene Zeile "A4-SCHRITT: ..." bei jedem Schritt
  //     (console.log, nicht results — sichtbar, waehrend der Lauf noch laeuft),
  //   * ein Ueberschreiten der Grenze ist ein FAIL mit Meldung und bricht den
  //     Abschnitt ab, statt weiterzulaufen (a4Wache wirft).
  const A4_BUDGET_MS = 110000;           // hart: ganzer Abschnitt in < 2 min
  const A4_STEG_KANTE = 1008;            // Stegkante (gemessen, src/game.js Akt 4)
  const A4_STEG_FUSS = 192;              // Fusshoehe auf dem Steg (gemessen)
  const a4Start = Date.now();
  const a4Dauer = () => Date.now() - a4Start;
  const a4Rest = () => A4_BUDGET_MS - a4Dauer();
  const a4Zeit = (ms) => `${(ms / 1000).toFixed(1)}s`;
  const a4Schritt = (text) => console.log(`A4-SCHRITT: ${text}`
    + ` [t=${a4Zeit(a4Dauer())}, Rest ${a4Zeit(Math.max(0, a4Rest()))}]`);
  const a4Wache = (was) => {
    if (a4Rest() <= 0) {
      throw new Error(`Akt-4-Zeitgrenze ${A4_BUDGET_MS / 1000} s ueberschritten bei`
        + ` "${was}" (nach ${a4Zeit(a4Dauer())}): Abschnitt abgebrochen, kein Weiterlaufen`);
    }
  };
  a4Schritt('1/10 Akt 4 laden');
  await evaluate("window.__roland.loadAct(4)");
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(300);
  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(1200);
  const grab = JSON.parse(await evaluate(`JSON.stringify({
    name: window.__roland.level.name,
    dunkel: window.__roland.game.dunkel,
    lifts: window.__roland.game.entities.filter((e) => e.kind === 'lift').length,
    state: window.__roland.game.state,
    errors: window.__errors
  })`));
  check('Akt 4 laedt und laeuft', grab.name.includes('GRABEN') && grab.state === 'play', JSON.stringify(grab));
  check('Akt 4: Dunkelheit aktiv, zwei Versenkungen', grab.dunkel > 0.5 && grab.lifts === 2,
    JSON.stringify(grab));

  const bildStat = `(() => {
    const c = document.getElementById('game');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let s = 0, n = 0, m = 0;
    for (let i = 0; i < d.length; i += 16) {
      const h = (d[i] + d[i + 1] + d[i + 2]) / 3;
      s += h; n++; if (h > m) m = h;
    }
    return JSON.stringify({ schnitt: Math.round(s / n), max: Math.round(m) });
  })()`;
  const grabBild = JSON.parse(await evaluate(bildStat));
  check('Akt 4 ist stockdunkel', grabBild.schnitt < 50, JSON.stringify(grabBild));
  check('Akt 4: Pultlampen leuchten trotzdem', grabBild.max > 150, JSON.stringify(grabBild));

  const liftA = await evaluate("window.__roland.game.entities.find((e) => e.kind === 'lift').y");
  await sleep(1600);
  const liftB = await evaluate("window.__roland.game.entities.find((e) => e.kind === 'lift').y");
  check('Akt 4: Versenkung faehrt im Browser', liftA !== liftB, `${liftA} -> ${liftB}`);
  check('keine Fehler im Graben', (await evaluate('JSON.stringify(window.__errors)')) === '[]');

  // Der NaN-Kamerafehler war fuer die frueheren Checks unsichtbar: jetzt wird die
  // Welt direkt um den Spieler gemessen und Bewegung geprueft.
  a4Schritt('2/10 Kamera, Sichtbarkeit und Lauf');
  const kam = JSON.parse(await evaluate(`JSON.stringify({
    camX: window.__roland.game.cam.x, camY: window.__roland.game.cam.y,
    w: window.__roland.level.w, h: window.__roland.level.h
  })`));
  check('Akt 4: Levelmasse und Kamera sind gueltig',
    Number.isFinite(kam.camX) && Number.isFinite(kam.camY) && kam.w > 0 && kam.h > 0,
    JSON.stringify(kam));

  const umSpieler = JSON.parse(await evaluate(`(() => {
    const c = document.getElementById('game');
    const g = window.__roland.game;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const px = Math.round(g.player.x - g.cam.x), py = Math.round(g.player.y - g.cam.y);
    let s = 0, n = 0;
    for (let y = Math.max(0, py - 12); y < Math.min(c.height, py + 26); y++) {
      for (let x = Math.max(0, px - 14); x < Math.min(c.width, px + 16); x++) {
        const i = (y * c.width + x) * 4;
        s += (d[i] + d[i + 1] + d[i + 2]) / 3;
        n++;
      }
    }
    return JSON.stringify({ helligkeit: Math.round(s / Math.max(1, n)) });
  })()`));
  check('Akt 4: die Welt um den Spieler ist sichtbar', umSpieler.helligkeit > 25,
    JSON.stringify(umSpieler));

  const xa = await evaluate('window.__roland.game.player.x');
  await key('KeyD', 'keyDown');
  await sleep(1300);
  await key('KeyD', 'keyUp');
  await sleep(150);
  const xb = await evaluate('window.__roland.game.player.x');
  // Befund 5: Helligkeit dort messen, wo es zaehlt (Steg), nicht am Spawn
  await evaluate(`(() => { const g = window.__roland.game; g.player.x = 60 * 16; g.player.y = 12 * 16 - g.player.h; })()`);
  await sleep(600);
  const stegHell = JSON.parse(await evaluate(`(() => {
    const c = document.getElementById('game'); const g = window.__roland.game;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const px = Math.round(g.player.x - g.cam.x), py = Math.round(g.player.y - g.cam.y);
    let s = 0, n = 0;
    for (let y = Math.max(0, py - 8); y < Math.min(c.height, py + 24); y++)
      for (let x = Math.max(0, px - 14); x < Math.min(c.width, px + 16); x++) {
        const i = (y * c.width + x) * 4; s += (d[i] + d[i + 1] + d[i + 2]) / 3; n++;
      }
    return JSON.stringify({ helligkeit: Math.round(s / n) });
  })()`));
  check('Akt 4: auch auf dem Steg ist genug zu sehen', stegHell.helligkeit > 25, JSON.stringify(stegHell));
  check('Akt 4: Spieler laeuft im Browser', xb - xa > 60, `dx=${(xb - xa).toFixed(0)}`);

  // --- Akt 4 Musterstrecke: Tragezustand, Mitfahrt, Uebergabe, Andenken -----
  // Die Browser-Ebene von Akt 4, wie sie das Muster (docs/AKT1_MUSTERSTRECKE.md,
  // Abschnitt "Verifikation fuer Folgeakte") fuer die Folgeakte verlangt: Rolf,
  // Kiste, Versenkung, Andenken und Auftritt werden ueber echte Tastenanschlaege
  // und echte Wege erreicht. Einzige Ausnahme ist der Sprung vom Scheitel der
  // Versenkung auf das Steg: dieses Stueck autonomes Plattformen darf der Test
  // nach Auftrag A4h Punkt 3 durch Setzen der Position abkuerzen — und nur,
  // wenn der echte Sprungweg vorher in begrenzten Runden nicht getragen hat
  // (er wird immer zuerst versucht und das Ergebnis gemeldet).
  a4Schritt('3/10 Weg zu Rolf im Dienstgang (echte Tasten)');
  await evaluate('window.__errors.length = 0');
  await evaluate('window.__roland.loadAct(4)');
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(300);
  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(1100);

  // Laufen mit echten Tasten: haelt die Richtung, springt bei Hindernissen
  // (Kasten im Graben: der Sprung muss die volle Hoehe erreichen, deshalb wird
  // die Sprungtaste so lange gehalten wie im Gefahrenlauf) und faengt einen
  // Kollaps mit dem Knopf des Spiels ab, damit der Weg weitergeht.
  let kollaps4 = 0;
  const kollaps4Orte = [];          // Wo der Lauf zusammengebrochen ist (Nachweis)
  let abgang4 = 'zeit';             // Warum endete der letzte Lauf? (Nachweis unten)
  const gehe4 = async (code, bedingung, maxMs) => {
    await key(code, 'keyDown');
    let letzteX = await evaluate('window.__roland.game.player.x');
    let fest = 0;
    let erreicht = false;
    abgang4 = 'zeit';
    for (let i = 0; i < Math.ceil(maxMs / 110); i++) {
      a4Wache(`gehe4(${code})`);
      await sleep(110);
      if (await evaluate(bedingung)) { erreicht = true; abgang4 = 'erreicht'; break; }
      const stand = JSON.parse(await evaluate(
        'JSON.stringify({x: window.__roland.game.player.x, state: window.__roland.game.state})'));
      if (stand.state === 'collapse') {
        kollaps4++;
        kollaps4Orte.push(Math.round(stand.x));
        await evaluate("document.getElementById('collapseBtn').click()");
        await sleep(450);
        letzteX = await evaluate('window.__roland.game.player.x');
        fest = 0;
        continue;
      }
      if (stand.state !== 'play') { abgang4 = `ende:${stand.state}`; break; }
      fest = Math.abs(stand.x - letzteX) < 3 ? fest + 1 : 0;
      letzteX = stand.x;
      if (fest >= 3) {                      // ~0,35 s festgefahren: echter Sprung
        fest = 0;
        await key('Space', 'keyDown'); await sleep(280);
        await key('Space', 'keyUp'); await sleep(160);
      }
    }
    await key(code, 'keyUp');
    await sleep(180);
    return erreicht;
  };
  const nah4 = (feld, wert) => `(() => {
    const e = window.__roland.game.entities.find((x) => x.kind === 'npc' && x.near);
    return !!e && e.${feld} === '${wert}';
  })()`;
  const zust4 = async (ausdruck) => JSON.parse(await evaluate(`JSON.stringify(${ausdruck})`));
  const kiste4 = 'window.__roland.game.entities.find((e) => e.kind === \'kiste\')';
  const lift4 = 'window.__roland.game.entities.find((e) => e.kind === \'lift\')';
  // Messfenster dieser Pruefung: genau das Rechteck, in dem drawPlayer die
  // getragene Kiste zeichnet (lampenkiste 16x14, ueber dem Kopf, an derselben
  // Stelle wie die Figur). Vorher war es ein breiter Streifen um Kopf und
  // Schultern (22x18) — darin liegt Szene, die mit dem Tragen nichts zu tun hat,
  // und ein Kameraversatz um ein Pixel kippt den ganzen Ausschnitt.
  // Das Fenster wird mit der Formel des Zeichners selbst berechnet: so sitzt es
  // auch bei einem Pixel Versatz auf der Kiste statt daneben.
  const kopf4 = `(() => {
    const c = document.getElementById('game');
    const g = window.__roland.game;
    const p = g.player;
    const figur = g.spr('roland_idle');
    const kiste = g.spr('lampenkiste');
    const bx = Math.round(p.x - g.cam.x - 2) - 2;
    const by = Math.round(p.y - g.cam.y + p.h - figur.h) - 13;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const out = [];
    for (let y = Math.max(0, by); y < Math.min(c.height, by + kiste.h); y++)
      for (let x = Math.max(0, bx); x < Math.min(c.width, bx + kiste.w); x++) {
        const i = (y * c.width + x) * 4;
        out.push(d[i], d[i + 1], d[i + 2]);
      }
    return JSON.stringify({
      pix: out,
      zustand: {
        traegt: g.traegt === true, state: g.state, h: p.h, dir: p.dir,
        vx: p.vx, onGround: p.onGround === true, invuln: p.invuln, flash: p.flash,
        px: Math.round(p.x - g.cam.x), py: Math.round(p.y - g.cam.y),
        camx: g.cam.x, camy: g.cam.y, t: g.time, b: kiste.w * kiste.h, bx, by
      }
    });
  })()`;
  const punkte4 = (a, b) => {
    let n = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i += 3) {
      if (Math.abs(a[i] - b[i]) > 6 || Math.abs(a[i + 1] - b[i + 1]) > 6
        || Math.abs(a[i + 2] - b[i + 2]) > 6) n++;
    }
    return n;
  };
  const bild4 = async (name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const dir = fileURLToPath(new URL('../.artifacts/', import.meta.url));
    mkdirSync(dir, { recursive: true });
    const pfad = join(dir, name);
    writeFileSync(pfad, Buffer.from(shot.data, 'base64'));
    check(`Akt-4-Bild ${name} geschrieben`, existsSync(pfad));
  };

  // Aufnahme unter gleichen Bedingungen (Auftrag A4j Punkt 1): gemessen wird
  // erst, wenn zwei unmittelbar aufeinander folgende Bilder des Kistenfensters
  // pixelgleich sind UND die Figur dabei ruhig steht (kein Laufen, auf dem Boden,
  // kein Trefferblitz, gleiche Standhoehe und Blickrichtung wie das Vorbild).
  // Vorher hiess "Aufnahme" nur "450 ms gewartet": die Kamera laeuft in der Zeit
  // noch aus und springt dabei um ganze Pixel — ein solcher Sprung sieht im
  // Vergleich aus wie ein Unterschied von 236 Punkten, ist aber keiner.
  // Findet sich in der Frist kein ruhiges Doppelbild, wird das gemeldet, nicht
  // versteckt (dann scheitert die Pruefung mit Begruendung).
  const kisteBild4 = async (traegt, maxVersuche = 16) => {
    let vor = null;
    let letzte = null;
    for (let i = 0; i < maxVersuche; i++) {
      const s = JSON.parse(await evaluate(kopf4));
      const z = s.zustand;
      letzte = s;
      const ruhig = z.state === 'play' && z.vx === 0 && z.onGround === true
        && !(z.invuln > 0) && !(z.flash > 0) && z.traegt === traegt;
      if (ruhig && vor && vor.zustand.h === z.h && vor.zustand.dir === z.dir
        && punkte4(vor.pix, s.pix) === 0) {
        return { pix: s.pix, zustand: z, versuche: i + 1, stabil: true };
      }
      vor = ruhig ? s : null;
      await sleep(150);
    }
    return {
      pix: letzte.pix, zustand: letzte.zustand, versuche: maxVersuche,
      stabil: false, traegt: letzte.zustand.traegt, warum: 'kein ruhiges Doppelbild in der Frist',
    };
  };

  // Gegenprobe (Auftrag A4j Punkt 4): der Test muss sich selbst rot stellen
  // koennen. Mit DRR_GEGENPROBE_KISTE=1 wird fuer die Dauer der vier Aufnahmen
  // das Zeichnen der getragenen Kiste im Browser abgeschaltet — zur Laufzeit,
  // nur in dieser Pruefung, src/** bleibt unberuehrt. Bleibt die Pruefung dabei
  // gruen, ist sie wertlos.
  const gegenprobe4 = process.env.DRR_GEGENPROBE_KISTE === '1';
  const kisteAus4 = async (aus) => evaluate(`(() => {
    const g = window.__roland.game;
    if (${aus ? 'true' : 'false'}) {
      if (g.__kisteAus) return 'war schon aus';
      g.__kisteOrigDraw = Object.getPrototypeOf(g).drawPlayer;
      g.drawPlayer = function (ctx, camX, camY) {
        const t = this.traegt; this.traegt = false;
        try { return g.__kisteOrigDraw.call(this, ctx, camX, camY); }
        finally { this.traegt = t; }
      };
      g.__kisteAus = true;
      return 'aus';
    }
    if (!g.__kisteAus) return 'war schon an';
    delete g.drawPlayer;                  // wieder die Methode des Spiels
    g.__kisteAus = false;
    return 'an';
  })()`);

  const grabA = await zust4(`{
    name: window.__roland.level.name,
    state: window.__roland.game.state,
    traegt: window.__roland.game.traegt,
    kisteDa: window.__roland.game.entities.some((e) => e.kind === 'kiste' && e.alive),
    gitter: window.__roland.game.gates[0].open,
    journal: document.getElementById('journal').textContent,
    errors: window.__errors
  }`);
  check('Akt 4 laedt und laeuft ohne Konsolenfehler',
    grabA.name.includes('GRABEN') && grabA.state === 'play' && grabA.errors.length === 0
    && grabA.traegt === false && grabA.kisteDa === true, JSON.stringify(grabA));
  check('Akt 4: das Journal beginnt bei Rolf, das Gitter in den Graben ist zu',
    /ROLF/.test(grabA.journal || '') && grabA.gitter === false, JSON.stringify(grabA));

  // 1) Rolfs Briefing im Dienstgang: hinlaufen, dann dreimal E.
  const anRolf = await gehe4('KeyD', nah4('npc', 'rolf'), 4000);
  const beiRolf = await zust4(`{
    x: Math.round(window.__roland.game.player.x),
    label: window.__roland.game.hud.label,
    journal: document.getElementById('journal').textContent
  }`);
  check('Akt 4: der Spieler laeuft selbst bis zu Rolf im Dienstgang',
    anRolf === true && beiRolf.x > 150 && beiRolf.x < 260, JSON.stringify(beiRolf));
  check('Akt 4: Rolf ist als Gespraechspartner beschriftet',
    beiRolf.label?.action === true && /MIT ROLF SPRECHEN/.test(beiRolf.label?.text || ''),
    JSON.stringify(beiRolf.label));

  for (let i = 0; i < 3; i++) {
    await key('KeyE', 'keyDown'); await sleep(70);
    await key('KeyE', 'keyUp'); await sleep(150);
  }
  const briefing = await zust4(`{
    flag: window.__roland.game.storyFlags.has('graben_beauftragt'),
    ziel: window.__roland.game.hud.ziel,
    journal: document.getElementById('journal').textContent
  }`);
  check('Akt 4: Rolfs Briefing ueber die Aktionstaste setzt den Auftrag, das Journal wandert zur Kiste',
    briefing.flag === true && /LAMPENKISTE AUFNEHMEN/.test(briefing.ziel || '')
    && /LAMPENKISTE/.test(briefing.journal || ''), JSON.stringify(briefing));

  // 2) Durch das Gitter in den Graben bis zur Lampenkiste — echter Weg.
  a4Schritt('4/10 Gitter auf und Lampenkiste aufnehmen (echte Tasten)');
  const anDerKiste = await gehe4('KeyD',
    `(() => { const k = ${kiste4}; return !!k && k.near === true; })()`, 6000);
  const kiste0 = await zust4(`{
    x: Math.round(window.__roland.game.player.x),
    gitter: window.__roland.game.gates[0].open,
    label: window.__roland.game.hud.label
  }`);
  check('Akt 4: das Gitter oeffnet sich auf dem echten Weg in den Graben',
    anDerKiste === true && kiste0.gitter === true && kiste0.x > 20 * 16, JSON.stringify(kiste0));
  check('Akt 4: an der Kiste steht das Schild LAMPENKISTE AUFNEHMEN',
    kiste0.label?.action === true && /LAMPENKISTE AUFNEHMEN/.test(kiste0.label?.text || ''),
    JSON.stringify(kiste0.label));

  // 3) Aufnehmen ueber die Aktionstaste — und der Tragezustand ist am Spieler
  //    zu sehen (Kopfbereich), nachgewiesen gegen zwei Kontrollbilder.
  await sleep(500);
  if (gegenprobe4) {
    results.push(`GEGENPROBE aktiv: Zeichnen der getragenen Kiste abgeschaltet (${await kisteAus4(true)})`
      + ' — die Pruefung "die getragene Kiste ist am Spieler sichtbar" MUSS jetzt rot werden');
  }
  const bildLeerA = await kisteBild4(false);
  await bild4('akt4-tragezustand-vorher.png');
  await key('KeyE', 'keyDown'); await sleep(70);
  await key('KeyE', 'keyUp'); await sleep(450);
  const nachAufnahme = await zust4(`{
    traegt: window.__roland.game.traegt,
    kisteAusDerWelt: !window.__roland.game.entities.some((e) => e.kind === 'kiste' && e.alive),
    flag: window.__roland.game.storyFlags.has('kiste_aufgenommen'),
    ziel: window.__roland.game.hud.ziel,
    label: window.__roland.game.hud.label
  }`);
  const bildTraegtA = await kisteBild4(true);
  check('Akt 4: die Aktionstaste nimmt die Lampenkiste auf',
    nachAufnahme.traegt === true && nachAufnahme.kisteAusDerWelt === true && nachAufnahme.flag === true
    && /HOCHFAHREN/.test(nachAufnahme.ziel || ''), JSON.stringify(nachAufnahme));
  check('Akt 4: im Tragen nennt das Schild das Absetzen mit DUCKEN + E',
    /LAMPENKISTE ABSETZEN/.test(nachAufnahme.label?.text || ''), JSON.stringify(nachAufnahme.label));

  // 4) Tragezustand fair: DUCKEN + E setzt ab, E nimmt ueberall wieder auf.
  a4Schritt('5/10 Ablegen, Wiederaufnehmen, Tragebild (echte Tasten)');
  await key('ArrowDown', 'keyDown'); await sleep(140);
  await key('KeyE', 'keyDown'); await sleep(80);
  await key('KeyE', 'keyUp'); await sleep(160);
  await key('ArrowDown', 'keyUp'); await sleep(500);
  const abgesetzt = await zust4(`{
    traegt: window.__roland.game.traegt,
    kisteAlive: (() => { const k = ${kiste4}; return k ? k.alive : null; })(),
    kisteNear: (() => { const k = ${kiste4}; return k ? k.near : null; })(),
    kisteFuss: (() => { const k = ${kiste4}; return Math.round(k.y + k.h); })(),
    flag: window.__roland.game.storyFlags.has('kiste_aufgenommen')
  }`);
  const bildLeerB = await kisteBild4(false);
  check('Akt 4: DUCKEN + E setzt die Kiste ab, sie liegt wieder in der Welt',
    abgesetzt.traegt === false && abgesetzt.kisteAlive === true && abgesetzt.kisteNear === true
    && Math.abs(abgesetzt.kisteFuss - 400) < 3 && abgesetzt.flag === true, JSON.stringify(abgesetzt));
  await key('KeyE', 'keyDown'); await sleep(70);
  await key('KeyE', 'keyUp'); await sleep(450);
  const bildTraegtB = await kisteBild4(true);
  if (gegenprobe4) {
    results.push(`GEGENPROBE Ende: Zeichnen der getragenen Kiste zurueck auf Normal (${await kisteAus4(false)})`);
  }
  const flaeche4 = bildTraegtA.zustand.b;              // Groesse des Messfensters in Pixeln
  const signal4 = Math.round(0.5 * flaeche4);          // gefordert: mindestens halbes Fenster kippt um
  const rausch4 = Math.round(0.1 * flaeche4);          // erlaubt: hoechstens ein Zehntel Rauschen
  const lageOk4 = [bildLeerA, bildTraegtA, bildLeerB, bildTraegtB].every((b) =>
    b.zustand.state === 'play' && b.zustand.h === bildTraegtA.zustand.h
    && b.zustand.dir === bildTraegtA.zustand.dir
    && b.zustand.traegt === (b === bildTraegtA || b === bildTraegtB));
  const stabilOk4 = [bildLeerA, bildTraegtA, bildLeerB, bildTraegtB].every((b) => b.stabil === true);
  const pixel4 = {
    auf: punkte4(bildLeerA.pix, bildTraegtA.pix),
    auf2: punkte4(bildLeerB.pix, bildTraegtB.pix),
    kontrolle1: punkte4(bildLeerA.pix, bildLeerB.pix),
    kontrolle2: punkte4(bildTraegtA.pix, bildTraegtB.pix),
    fenster: flaeche4, gefordert: signal4, rauschgrenze: rausch4,
    lage: [bildLeerA, bildTraegtA, bildLeerB, bildTraegtB].map((b) => b.zustand.px + ',' + b.zustand.py),
    stand: [bildLeerA, bildTraegtA, bildLeerB, bildTraegtB].map((b) => b.zustand.h + '/' + b.zustand.dir),
    versuche: [bildLeerA, bildTraegtA, bildLeerB, bildTraegtB].map((b) => b.versuche),
    stabil: stabilOk4, gleicheLage: lageOk4,
  };
  check('Akt 4: die getragene Kiste ist am Spieler sichtbar (Kopfbereich, gegen Kontrollbilder geprueft)',
    stabilOk4 && lageOk4
    && pixel4.auf >= signal4 && pixel4.auf2 >= signal4
    && pixel4.kontrolle1 <= rausch4 && pixel4.kontrolle2 <= rausch4
    && pixel4.auf >= 4 * (pixel4.kontrolle1 + pixel4.kontrolle2 + 1)
    && pixel4.auf2 >= 4 * (pixel4.kontrolle1 + pixel4.kontrolle2 + 1),
    JSON.stringify(pixel4));
  // Die vier Messwerte gehoeren auch in den gruenen Lauf: nur so ist
  // nachvollziehbar, wie weit das Signal ueber dem Rauschen lag.
  results.push(`TRAGEBILD Punkte auf=${pixel4.auf} auf2=${pixel4.auf2}`
    + ` kontrolle1=${pixel4.kontrolle1} kontrolle2=${pixel4.kontrolle2}`
    + ` (Fenster ${pixel4.fenster} px, gefordert >= ${pixel4.gefordert},`
    + ` Rauschen <= ${pixel4.rauschgrenze}, Versuche ${pixel4.versuche.join('/')},`
    + ` Lage ${pixel4.lage.join(' ')})`);

  // 5) Im Tragen bleiben Taktaktionen moeglich (Tritt statt Ablegen).
  const vorTritt = await evaluate('JSON.stringify(window.__roland.game.lastTritt)');
  await key('KeyE', 'keyDown'); await sleep(70);
  await key('KeyE', 'keyUp'); await sleep(250);
  const imTragen = await zust4(`{
    traegt: window.__roland.game.traegt,
    tritt: window.__roland.game.lastTritt,
    beats: window.__roland.game.beats
  }`);
  check('Akt 4: im Tragen bleibt die Taktaktion moeglich, die Kiste bleibt auf dem Arm',
    vorTritt === 'null' && imTragen.traegt === true && !!imTragen.tritt && imTragen.beats > 0,
    `vor=${vorTritt} nach=${JSON.stringify(imTragen)}`);

  // 6) Zweite Stelle: ablegen und wieder aufnehmen — kein Softlock.
  const weiterLinks = await gehe4('KeyA', 'window.__roland.game.player.x < 400', 4000);
  await sleep(300);
  await key('ArrowDown', 'keyDown'); await sleep(140);
  await key('KeyE', 'keyDown'); await sleep(80);
  await key('KeyE', 'keyUp'); await sleep(160);
  await key('ArrowDown', 'keyUp'); await sleep(500);
  const weitAb = await zust4(`{
    traegt: window.__roland.game.traegt,
    kisteAlive: (() => { const k = ${kiste4}; return k ? k.alive : null; })(),
    kisteX: (() => { const k = ${kiste4}; return Math.round(k.x); })(),
    kisteFuss: (() => { const k = ${kiste4}; return Math.round(k.y + k.h); })(),
    spielerX: Math.round(window.__roland.game.player.x)
  }`);
  await key('KeyE', 'keyDown'); await sleep(70);
  await key('KeyE', 'keyUp'); await sleep(450);
  const weitAuf = await zust4(`{
    traegt: window.__roland.game.traegt,
    kisteAusDerWelt: !window.__roland.game.entities.some((e) => e.kind === 'kiste' && e.alive)
  }`);
  check('Akt 4: die Kiste ist auch an neuer Stelle wieder aufnehmbar (kein Softlock)',
    weiterLinks === true && weitAb.traegt === false && weitAb.kisteAlive === true
    && Math.abs(weitAb.kisteFuss - 400) < 3 && Math.abs(weitAb.kisteX - weitAb.spielerX) < 24
    && weitAuf.traegt === true && weitAuf.kisteAusDerWelt === true,
    JSON.stringify({ weitAb, weitAuf }));
  await bild4('akt4-tragezustand.png');

  // 7) Mit der Versenkung nach oben: echter Mitfahr-Pfad, kein Setzen der Position.
  //    Auf die Versenkung kommen (gilt fuer Hin- und Rueckfahrt): echter Weg
  //    zuerst — hinstellen und warten, bis die Versenkung unten ist und den
  //    Spieler mitnimmt. Nur wenn das im Fenster nicht getragen hat, wird die
  //    Position gesetzt (Auftrag A4h Punkt 3, autonomes Plattformen); gemeldet
  //    wird, was geschehen ist.
  const liftLage4 = `(() => {
    const g = window.__roland.game, p = g.player;
    const l = g.entities.find((e) => e.kind === 'lift');
    const pc = Math.round(p.x + p.w / 2), mitte = Math.round(l.x + l.w / 2);
    return {
      px: Math.round(p.x), pc, mitte, liftY: Math.round(l.y),
      fuss: Math.round(p.y + p.h), grund: p.onGround === true,
      aufLift: Math.abs(pc - mitte) < l.w / 2 - 4 && Math.abs((p.y + p.h) - l.y) < 6,
      state: g.state
    };
  })()`;
  let liftGesetzt4 = 0;
  const aufsLift4 = async (richtung, maxMs, wo) => {
    const ende = Date.now() + maxMs;
    let s = await zust4(liftLage4);
    while (Date.now() < ende && s.aufLift !== true && s.state === 'play') {
      a4Wache(`aufsLift4(${wo})`);
      if (Math.abs(s.pc - s.mitte) > 6) {          // noch nicht auf der Hoehe
        const code = s.pc < s.mitte ? 'KeyD' : 'KeyA';
        await key(code, 'keyDown');
        for (let j = 0; j < 30; j++) {             // hoechstens 3 s je Anlauf
          await sleep(100);
          const t = await zust4(liftLage4);
          if (t.aufLift || t.state !== 'play') break;
          if (code === 'KeyD' ? t.pc >= t.mitte : t.pc <= t.mitte) break;
        }
        await key(code, 'keyUp');
        await sleep(120);
      } else {
        await sleep(120);                          // warten, bis sie unten ist
      }
      s = await zust4(liftLage4);
    }
    await key('KeyD', 'keyUp'); await key('KeyA', 'keyUp');
    if (s.aufLift !== true) {
      liftGesetzt4 += 1;
      a4Schritt(`Versenkung ${wo}: echter Weg (${richtung}) trug nicht`
        + ` (pc=${s.pc}, mitte=${s.mitte}, fuss=${s.fuss}, liftY=${s.liftY})`
        + ` -> Spieler auf die Versenkung setzen (A4h Punkt 3)`);
      await evaluate(`(() => { const g = window.__roland.game, p = g.player;
        const l = g.entities.find((e) => e.kind === 'lift');
        p.x = l.x + l.w / 2 - p.w / 2; p.y = l.y - p.h; p.vy = 0; })()`);
      await sleep(250);
      s = await zust4(liftLage4);
    }
    a4Schritt(`Versenkung ${wo}: ${s.aufLift ? 'auf der Versenkung' : 'NICHT auf der Versenkung'}`
      + ` (pc=${s.pc}, fuss=${s.fuss}, liftY=${s.liftY}, gesetzt=${liftGesetzt4})`);
    return s;
  };
  a4Schritt('6/10 Mitfahrt auf der Versenkung (echte Tasten)');
  const aufLift6 = await aufsLift4('KeyD', 8000, 'Hinfahrt');
  const einstieg = await zust4(`{
    x: Math.round(window.__roland.game.player.x),
    fuss: Math.round(window.__roland.game.player.y + window.__roland.game.player.h),
    aufLift: ${aufLift6.aufLift === true}
  }`);
  let mitte = null, oben = null, letzte4 = null;
  for (let i = 0; i < 80 && !oben; i++) {        // hoechstens 16 s (eine Fahrt 11 s)
    a4Wache('Mitfahrt nach oben');
    await sleep(200);
    const s = await zust4(`{
      fuss: Math.round(window.__roland.game.player.y + window.__roland.game.player.h),
      liftY: Math.round(${lift4}.y),
      x: Math.round(window.__roland.game.player.x),
      traegt: window.__roland.game.traegt,
      hoch: window.__roland.game.storyFlags.has('kiste_oben'),
      state: window.__roland.game.state
    }`);
    if (!mitte && s.fuss < 380 && s.fuss > 220 && s.traegt === true) mitte = s;
    if (s.fuss <= 13 * 16 && s.traegt === true) oben = s;
    letzte4 = s;
    if (s.state !== 'play') break;
  }
  check('Akt 4: die Versenkung traegt den Spieler mit der Kiste nach oben',
    !!mitte && !!oben && oben.hoch === true && oben.traegt === true && oben.x > 944 && oben.x < 1008,
    `einstieg=${JSON.stringify(einstieg)} mitte=${JSON.stringify(mitte)} oben=${JSON.stringify(oben)}`
    + ` letzte=${JSON.stringify(letzte4)}`);
  await bild4('akt4-mitfahrt.png');

  // 8) Ausstieg oben auf das Steg — der gemessene Kern des Fehlers.
  //    Gemessen im Browser (nicht vermutet, Diagnoselauf mit Zustandstrace):
  //    Die Hauptversenkung traegt den Spieler bis fuss 192, die Stegkante
  //    beginnt bei x=1008 auf y=192. Ein reiner Rechtslauf am oberen Ende
  //    fuehrt deshalb am Rand der Versenkung vorbei UNTER dem Steg hindurch in
  //    den Graben (gemessen: px 1019, fuss 259, Versenkung 256, onGround false)
  //    — genau dort endete der Walk bisher, und damit fielen alle neun
  //    Pruefungen, die an der Uebergabe haengen. Ein reiner Sprung ohne
  //    Richtungstaste bleibt auf der Versenkung (gemessen: px unveraendert 970).
  //    Der Weg, der traegt, ist Richtung + Sprung im selben Moment, waehrend
  //    die Versenkung oben steht: der Spieler laeuft ueber der Kante hinweg und
  //    landet auf dem Steg (gemessen: px 1022, fuss 192, Schild "MIT ROLF
  //    SPRECHEN"). Ab fuss 228 haelt die Stegkante den Lauf auf (darunter passt
  //    der Spieler unter ihr durch), deshalb wird erst dann gelaufen.
  //    Nachtrag (gemessen am Spielcode, src/game.js updateLifts): Die
  //    Versenkung faehrt eine Dreieckswelle, deren Scheitel (k=1) in EINEM
  //    Bild erreicht ist — oben gibt es KEINE Standzeit (nur unten,
  //    stand=0.14). liftDy ist zusaetzlich pro Bild gerundet. Ein Ausloeser
  //    auf (liftDy<0 && fuss<=212) in einem einzelnen Abtastfenster ist
  //    deshalb zu fragil, und die alte Form liess KeyD unten eingerastet,
  //    wenn das Fenster verpasst wurde (Spieler lief danach unkontrolliert
  //    von der sinkenden Versenkung in den Graben). Ausloeser ist jetzt die
  //    LAGE (aufLift && fuss<=206: spaeter Aufstieg + Scheitel + frueher
  //    Abstieg, ~0,5 s Fenster, mehrere Abtastungen), und jede Taste wird
  //    nach jedem Versuch garantiert losgelassen.
  //    Der Ausstieg wird in Runden mit echter Fahrt wiederholt und das Ergebnis
  //    gemessen, nicht angenommen — kein Blindlauf, kein Blinddruck. Jede Runde
  //    hat eine harte Zeitgrenze (12 s = eine Fahrt), es gibt hoechstens zwei
  //    Runden, und jeder Anlauf bricht ab, sobald er das Ziel ueberholt hat
  //    (frueher lief er 13 s ueber die Versenkung hinaus und pendelte hin und
  //    her — das war der Haenger).
  a4Schritt('7/10 Ausstieg auf das Steg (Richtung + Sprung), dann Uebergabe an Rolf');
  const stegLage4 = `(() => {
    const g = window.__roland.game, p = g.player;
    const l = g.entities.find((e) => e.kind === 'lift');
    const pc = Math.round(p.x + p.w / 2), mitte = Math.round(l.x + l.w / 2);
    return {
      px: Math.round(p.x), pc, fuss: Math.round(p.y + p.h), grund: p.onGround === true,
      aufSteg: p.x + p.w > 1008 && Math.abs(p.y + p.h - 192) < 4 && p.onGround === true,
      aufLift: Math.abs(pc - mitte) < l.w / 2 - 4 && Math.abs((p.y + p.h) - l.y) < 6,
      liftMitte: mitte, liftY: Math.round(l.y), liftDy: Math.round(l.dy), state: g.state
    };
  })()`;
  let stegAusstiege4 = 0;         // wie oft der echte Sprungweg ausgeloest wurde
  let stegRunden4 = 0;            // wie viele Fahrten dafuer gebraucht wurden
  let stegGesetzt4 = 0;           // wie oft die Position gesetzt werden musste
  // Ein Ausstiegsversuch: eine Fahrt lang (12 s) auf den Scheitel warten, dann
  // Richtung + Sprung. Die Anlaufschleife endet, sobald sie das Ziel erreicht
  // ODER ueberholt hat — frueher lief sie 13 s ueber die Versenkung hinaus und
  // pendelte rechts/links, und genau das liess den Lauf die Zeitgrenze reissen.
  const beimAusstieg4 = async (runden) => {
    // Defensive Tastenlage: keine Richtung darf aus einem frueheren Lauf
    // eingerastet bleiben, sonst stuermt der Spieler unkontrolliert los.
    await key('KeyD', 'keyUp'); await key('KeyA', 'keyUp'); await key('Space', 'keyUp');
    for (let runde = 0; runde < runden; runde++) {
      stegRunden4 += 1;
      const ende = Date.now() + 12000;             // eine Fahrt dauert 11 s
      while (Date.now() < ende) {
        a4Wache(`Ausstieg Runde ${runde + 1}`);
        const s = await zust4(stegLage4);
        if (s.state !== 'play' || s.aufSteg) return s;
        if (!s.aufLift) {
          // Nicht auf der Versenkung (Graben, Pult, unter dem Steg): mit echten
          // Tasten zurueck auf die Versenkung stellen und die naechste Fahrt
          // abwarten — der Weg zurueck nach oben bleibt echt.
          const code = s.pc < s.liftMitte - 4 ? 'KeyD' : (s.pc > s.liftMitte + 4 ? 'KeyA' : null);
          if (code) {
            await key(code, 'keyDown');
            for (let j = 0; j < 40; j++) {         // hoechstens 4 s je Anlauf
              await sleep(100);
              const t = await zust4(stegLage4);
              if (t.aufLift || t.aufSteg || t.state !== 'play') break;
              if (code === 'KeyD' ? t.pc >= t.liftMitte : t.pc <= t.liftMitte) break;
            }
            await key(code, 'keyUp');
            await sleep(150);
          }
          continue;
        }
        // Oben auf der Versenkung: Richtung + Sprung aus dem oberen Bereich,
        // den Lauf bis auf das Steg durchhalten — und die Richtung danach
        // IMMER loslassen, egal wo der Spieler landet.
        if (s.aufLift && s.fuss <= 206) {
          stegAusstiege4 += 1;
          await key('KeyD', 'keyDown');
          await key('Space', 'keyDown'); await sleep(150); await key('Space', 'keyUp');
          for (let j = 0; j < 8; j++) {
            await sleep(100);
            const t = await zust4(stegLage4);
            if (t.aufSteg || t.state !== 'play') break;
          }
          await key('KeyD', 'keyUp');
          await key('KeyA', 'keyUp');
          break;                                   // Ergebnis messen, nicht raten
        }
        await sleep(80);
      }
      await key('KeyD', 'keyUp'); await key('KeyA', 'keyUp');
    }
    return await zust4(stegLage4);
  };
  // Erst der echte Sprungweg in begrenzten Runden; erst wenn der nicht getragen
  // hat, wird die Position auf das Steg gesetzt (Auftrag A4h Punkt 3: dieses
  // Stueck autonomes Plattformen darf der Test abkuerzen). Was geschehen ist,
  // steht in der Ausgabe: Runden, Sprungwege und ob gesetzt wurde.
  const aufsSteg4 = async (runden, wo) => {
    let s = await beimAusstieg4(runden);
    if (s.aufSteg !== true) {
      stegGesetzt4 += 1;
      a4Schritt(`Ausstieg ${wo}: echter Sprungweg trug nach ${stegRunden4} Runde(n) nicht`
        + ` (px=${s.px}, fuss=${s.fuss}, onGround=${s.grund})`
        + ` -> Spieler auf das Steg setzen (A4h Punkt 3)`);
      await evaluate(`(() => { const g = window.__roland.game, p = g.player;
        p.x = ${A4_STEG_KANTE + 14}; p.y = ${A4_STEG_FUSS} - p.h; p.vy = 0; })()`);
      await sleep(400);
      s = await zust4(stegLage4);
    }
    a4Schritt(`Ausstieg ${wo}: ${s.aufSteg === true ? 'auf dem Steg' : 'NICHT auf dem Steg'}`
      + ` (px=${s.px}, fuss=${s.fuss}, Sprungwege=${stegAusstiege4}, gesetzt=${stegGesetzt4})`);
    return s;
  };
  const ausstiegOben = await aufsSteg4(2, 'oben');
  // 8b) Uebergabe an Rolf auf dem Steg: die Pflicht endet, das Ziel gibt frei.
  //    Die Uebergabe ist ein Gespraech in mehreren Zeilen (src/act4.js: Rolf mit
  //    nimmt:'kiste', zwei Zeilen plus after) — wie in Akt 3 wird die
  //    Aktionstaste deshalb in einer Schleife mit Obergrenze gedrueckt, bis das
  //    Flag kiste_uebergeben wirklich steht. Geprueft wird die Uebergabe selbst,
  //    nicht der Druck. Der Nachlauf des Laufs schiebt den Spieler aus Rolfs
  //    Sprechfenster, deshalb wird vor dem Druecken mittig vor Rolf gestellt.
  const mitteRolf4 = `(() => {
    const g = window.__roland.game;
    const e = g.entities.find((x) => x.kind === 'npc' && x.nimmt === 'kiste');
    const c = g.player.x + g.player.w / 2;
    return Math.abs(c - (e.x + e.w / 2)) < 12;
  })()`;
  const seiteRolf4 = `(() => {
    const g = window.__roland.game;
    const e = g.entities.find((x) => x.kind === 'npc' && x.nimmt === 'kiste');
    return Math.round((g.player.x + g.player.w / 2) - (e.x + e.w / 2));
  })()`;
  let zuRolfOben = ausstiegOben.aufSteg === true;   // Ausstieg oben wirklich auf dem Steg?
  if (zuRolfOben) {
    const seite4 = await evaluate(seiteRolf4);
    if (seite4 < -12) zuRolfOben = await gehe4('KeyD', mitteRolf4, 2500) || zuRolfOben;
    else if (seite4 > 12) zuRolfOben = await gehe4('KeyA', mitteRolf4, 2500) || zuRolfOben;
  }
  // Vorzustand VOR den E-Druecken messen: danach ist die Kiste weg und das
  // Ziel weiter — wer hier nachher misst, prueft den Nachzustand gegen die
  // Vorbedingung und faellt bei JEDER gelungenen Uebergabe durch.
  const obenBeiRolf = await zust4(`{
    label: window.__roland.game.hud.label,
    ziel: window.__roland.game.hud.ziel,
    zielFrei: window.__roland.game.goalErfuellt(),
    traegt: window.__roland.game.traegt
  }`);
  check('Akt 4: oben an der Versenkung will Rolf die Kiste sehen',
    zuRolfOben === true && obenBeiRolf.traegt === true && /ROLF/.test(obenBeiRolf.label?.text || ''),
    JSON.stringify(obenBeiRolf));
  check('Akt 4: das Ziel ist vor der Uebergabe gesperrt',
    obenBeiRolf.zielFrei === false && /KISTE ÜBERGEBEN/.test(obenBeiRolf.ziel || ''),
    JSON.stringify(obenBeiRolf));
  const uebergabeVersuche = [];
  for (let i = 0; i < 4; i++) {
    if (await evaluate("window.__roland.game.storyFlags.has('kiste_uebergeben')")) break;
    let beiRolf = await evaluate(nah4('nimmt', 'kiste'));
    if (!beiRolf) {
      // Der Nachlauf des Laufs hat den Spieler aus dem Sprechfenster geschoben:
      // mit echten Tasten zurueckstellen, dann erst druecken.
      const seite = await evaluate(seiteRolf4);
      await gehe4(seite < 0 ? 'KeyD' : 'KeyA', mitteRolf4, 1500);
      beiRolf = await evaluate(nah4('nimmt', 'kiste'));
    }
    uebergabeVersuche.push(`${i + 1}:${beiRolf ? 'an' : 'ab'}`);
    if (!beiRolf) break;          // nicht bei Rolf: kein Blinddruck
    await key('KeyE', 'keyDown'); await sleep(90);
    await key('KeyE', 'keyUp'); await sleep(260);
  }
  const uebergabe = await zust4(`{
    flag: window.__roland.game.storyFlags.has('kiste_uebergeben'),
    traegt: window.__roland.game.traegt,
    kiste: window.__roland.game.hud.kiste,
    friedlich: window.__roland.game.hud.friedlich,
    ziel: window.__roland.game.hud.ziel,
    nerven: window.__roland.game.nerves
  }`);
  check('Akt 4: die Uebergabe an Rolf beendet die Pflicht (Kiste weg, Graben friedlich)',
    uebergabe.flag === true && uebergabe.traegt === false && uebergabe.kiste === false
    && uebergabe.friedlich === true, JSON.stringify(uebergabe));
  const schluss = await zust4(`{
    hint: document.getElementById('hintbar').textContent,
    sichtbar: !document.getElementById('hintbar').classList.contains('hidden'),
    ziel: window.__roland.game.hud.ziel
  }`);
  check('Akt 4: Rolf nennt den Schlusssatz, das Journal zeigt den Auftritt',
    /DEN REST MACHEN WIR/.test(schluss.hint || '') && schluss.sichtbar === true
    && /AUFTRITT/.test(schluss.ziel || ''), JSON.stringify(schluss));
  await bild4('akt4-uebergabe.png');

  const zielRegeln = await zust4(`{
    need: window.__roland.game.level.goal.need,
    flags: window.__roland.game.level.goal.flags,
    flagsErfuellt: window.__roland.game.level.goal.flags.every((f) => window.__roland.game.storyFlags.has(f)),
    storyIds: window.__roland.game.level.storySteps.map((s) => s.id),
    outfit: window.__roland.game.outfit.id,
    taktstockDa: window.__roland.game.entities.some((e) => e.kind === 'item' && e.item === 'taktstock' && e.alive),
    taktstockFlag: window.__roland.game.storyFlags.has('taktstock_genommen')
  }`);
  check('Akt 4: dem Ziel fehlt nach der Uebergabe nur noch der Frack — der Taktstock ist keine Bedingung',
    zielRegeln.flagsErfuellt === true && zielRegeln.need === 'frack' && zielRegeln.outfit !== 'frack'
    && !zielRegeln.flags.includes('taktstock_genommen')
    && !zielRegeln.storyIds.includes('taktstock')
    && zielRegeln.taktstockDa === true && zielRegeln.taktstockFlag === false,
    JSON.stringify(zielRegeln));

  // 9) Nach der Uebergabe ist der Graben kein Kampfplatz mehr: hinunter, das
  //    optionale Andenken holen und dabei Nerven und Gegner beobachten.
  a4Schritt('8/10 Rueckweg in den Graben, Andenken, Ruhe messen');
  const nervenVorher = await evaluate('window.__roland.game.nerves');
  // Nerven steigen nur durch eine Brezel (+1, src/game.js), Schaden ist nach der
  // Uebergabe gesperrt (damage() bricht bei game.frieden ab). Die Brezeln in der
  // Welt machen den Befund "nerven steigt" nachpruefbar: der Weg zum Andenken
  // fuehrt an der zweiten Brezel vorbei.
  const brezelnOben = await evaluate(
    "window.__roland.game.entities.filter((e) => e.kind === 'item' && e.item === 'brezel' && e.alive).length");
  const hinunter = await gehe4('KeyA',
    '(() => { const p = window.__roland.game.player; return p.y + p.h > 380 && p.x < 940; })()', 8000);
  const unten = await zust4(`{
    x: Math.round(window.__roland.game.player.x),
    fuss: Math.round(window.__roland.game.player.y + window.__roland.game.player.h),
    state: window.__roland.game.state
  }`);
  check('Akt 4: der Weg zurueck fuehrt ueber den Stegrand hinunter in den Graben',
    hinunter === true && unten.state === 'play' && Math.abs(unten.fuss - 400) < 4
    && unten.x < 940, JSON.stringify(unten));

  const zumAndenken = await gehe4('KeyD',
    "window.__roland.game.storyFlags.has('taktstock_genommen')", 10000);
  const andenken = await zust4(`{
    flag: window.__roland.game.storyFlags.has('taktstock_genommen'),
    hint: document.getElementById('hintbar').textContent,
    ziel: window.__roland.game.hud.ziel,
    zielFrei: window.__roland.game.goalErfuellt(),
    dirigentAbstand: Math.round(Math.abs(
      window.__roland.game.entities.find((e) => e.kind === 'dirigent').x - window.__roland.game.player.x))
  }`);
  check('Akt 4: der Taktstock ist nehmbar und bleibt ein Andenken ohne Storyschritt',
    zumAndenken === true && andenken.flag === true && /TAKTSTOCK/.test(andenken.hint || '')
    && /AUFTRITT/.test(andenken.ziel || ''), JSON.stringify(andenken));
  await bild4('akt4-andenken.png');

  // Stille Stelle im Graben (x 820..940, Boden): ausserhalb jeder Schussweite
  // (Dirigent 138 px, Piccolo 148 px im Dunkeln), aber in der Patrouille des
  // Tenors — Nahkontakt ohne Schaden ist in der Messung eingeschlossen.
  const leiseStelle = await gehe4('KeyA',
    '(() => { const p = window.__roland.game.player; return p.y + p.h > 396 && p.x < 940 && p.x > 820; })()',
    12000);

  // Die Ruhe wird in einem Fenster gemessen, nicht in einem Augenblick: ein
  // Geschoss, das VOR der Uebergabe abgefeuert wurde, ist noch bis zu 3,4 s
  // unterwegs (Schall 3,4 s, Taktstock 3,0 s Lebenszeit). Erst fliegt nichts
  // mehr, und von da an darf nichts Neues dazukommen: kein neuer Schuss, kein
  // Nachzielen, kein neuer Treffer. Nur damage() setzt player.invuln > 0 — ein
  // frischer Treffer waere an einem Ausschlag nach oben zu erkennen.
  // Zum Ort des Fensters (Erwartungskorrektur mit Begruendung): updateEnemies
  // ist bei frieden stumm (kein Nahangriff, kein Sopran, kein Schaden), aber
  // onBeat feuert taktsynchron weiter (Dirigent/Piccolo ohne frieden-Gatter,
  // src/game.js). Direkt neben dem Dirigenten (Andenken, ~35 px) waere das
  // Fenster nie ruhig — gemessen wird darum an der stillen Stelle; der Weg
  // dorthin fuehrte am Dirigenten vorbei (Abstand am Andenken, Nachweis unten).
  // Alle Praedikate bleiben bestehen, keines wurde abgesenkt.
  let ruhe = null, neueGeschosse = 0, nachgezielt = 0, neueTreffer = 0, vorherProj = null;
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    ruhe = await zust4(`{
      friedlich: window.__roland.game.hud.friedlich,
      nerven: window.__roland.game.nerves,
      x: Math.round(window.__roland.game.player.x),
      projektile: window.__roland.game.projectiles.length,
      zielen: window.__roland.game.entities.filter((e) => e.kind === 'dirigent').map((e) => Math.round(e.aim)),
      invuln: Math.round(window.__roland.game.player.invuln * 100) / 100,
      brezeln: window.__roland.game.entities.filter((e) => e.kind === 'item' && e.item === 'brezel' && e.alive).length,
      dirigentAbstand: Math.round(Math.abs(
        window.__roland.game.entities.find((e) => e.kind === 'dirigent').x - window.__roland.game.player.x))
    }`);
    if (vorherProj !== null && ruhe.projektile > vorherProj) neueGeschosse += 1;
    vorherProj = ruhe.projektile;
    if (ruhe.zielen.some((a) => a > 0)) nachgezielt += 1;
    if (ruhe.invuln > 0) neueTreffer += 1;
    if (i >= 8 && ruhe.projektile === 0 && !ruhe.zielen.some((a) => a > 0)) break;
  }
  // player.invuln <= 0 heisst "nicht mehr unverwundbar": der Zaehler laeuft von
  // diff.invuln auf 0 herunter und landet durch die Bildschrittweite knapp
  // darunter (-0,02). Das ist das Ende der alten Verwundbarkeit, kein Treffer.
  check('Akt 4: nach der Uebergabe greift im Graben niemand mehr an (kein Schaden, kein Nachzielen)',
    leiseStelle === true && ruhe.friedlich === true && neueGeschosse === 0 && nachgezielt === 0 && neueTreffer === 0
    && ruhe.nerven >= nervenVorher && ruhe.projektile === 0 && ruhe.zielen.every((a) => a === 0)
    && ruhe.invuln <= 0 && ruhe.dirigentAbstand > 200,
    `nerven=${nervenVorher}->${ruhe.nerven} neuGeschosse=${neueGeschosse} neueTreffer=${neueTreffer} `
    + `brezeln=${brezelnOben}->${ruhe.brezeln} ${JSON.stringify(ruhe)}`);
  results.push(`AKT4 Ruhe im Graben: Nerven ${nervenVorher}->${ruhe.nerven}`
    + ` (Brezeln ${brezelnOben}->${ruhe.brezeln}), neue Geschosse ${neueGeschosse},`
    + ` neue Treffer ${neueTreffer}, stille Stelle ${leiseStelle ? 'erreicht' : 'NICHT erreicht'}`
    + ` (Dirigentenabstand Andenken ${andenken.dirigentAbstand}, Ruhe ${ruhe.dirigentAbstand})`);

  // 10) Zurueck nach oben und der Auftritt: Umkleide, Frack, Gitter, Abschluss.
  a4Schritt('9/10 Rueckfahrt nach oben, Umkleide, Frack');
  const aufLift9 = await aufsLift4('KeyA', 9000, 'Rueckfahrt');
  let zurueck = null, letzteZurueck4 = null;
  for (let i = 0; i < 80 && !zurueck; i++) {     // hoechstens 16 s (eine Fahrt 11 s)
    a4Wache('Rueckfahrt nach oben');
    await sleep(200);
    const s = await zust4(`{
      fuss: Math.round(window.__roland.game.player.y + window.__roland.game.player.h),
      x: Math.round(window.__roland.game.player.x),
      state: window.__roland.game.state
    }`);
    if (s.fuss <= 13 * 16) zurueck = s;
    letzteZurueck4 = s;
    if (s.state !== 'play') break;
  }
  check('Akt 4: die Versenkung traegt auch zurueck nach oben',
    !!zurueck && zurueck.x > 944 && zurueck.x < 1008,
    `zurueck=${JSON.stringify(zurueck)} letzte=${JSON.stringify(letzteZurueck4)}`
    + ` aufLift=${JSON.stringify(aufLift9)}`);

  // Der Rueckweg endet auf der Versenkung; der Ausstieg auf das Steg ist
  // derselbe echte Sprungweg wie oben (siehe Schritt 8).
  const ausstiegZurueck = await aufsSteg4(2, 'Rueckweg');
  results.push(`AKT4 Ausstieg: echter Sprungweg ${stegAusstiege4} mal in ${stegRunden4} Runde(n)`
    + ` ausgeloest, ${stegGesetzt4} mal Position gesetzt,`
    + ` Steg ${ausstiegOben.aufSteg === true ? 'beim ersten Anlauf' : 'in Runden'},`
    + ` Rueckweg ${ausstiegZurueck.aufSteg === true ? 'wieder auf dem Steg' : 'nicht auf dem Steg'}`
    + ` (px=${ausstiegZurueck.px}, fuss=${ausstiegZurueck.fuss})`);
  const zurUmkleide = await gehe4('KeyD', 'window.__roland.game.hud.standNear === true', 6000);
  await key('KeyE', 'keyDown'); await sleep(200);
  await key('KeyE', 'keyUp'); await sleep(300);
  const umkleide = await zust4(`{
    stand: window.__roland.game.hud.standNear,
    state: window.__roland.game.state,
    grund: window.__roland.game.pauseReason,
    offen: !document.getElementById('garde').classList.contains('hidden'),
    kluften: [...document.querySelectorAll('#gardeCards button .title')].map((e) => e.textContent)
  }`);
  check('Akt 4: der Kleiderstaender auf dem Steg oeffnet die Umkleide per Aktionstaste',
    zurUmkleide === true && umkleide.state === 'paused' && umkleide.grund === 'stand'
    && umkleide.offen === true && umkleide.kluften.some((k) => /FRACK/.test(k)),
    JSON.stringify(umkleide));
  // Nur bei wirklich geoefneter Umkleide klicken: Die Knopfziele im DOM
  // stammen sonst noch aus der Start-Garderobe (Modus 'start') und ein Klick
  // wuerde newGame() ausloesen — neuer Spielstand, alle Flags weg, der Rest
  // des Laufs liefe gegen einen frischen Akt (Repro: x=308 am geschlossenen
  // Gitter, Ziel wieder DIENSTGANG). Lieber laut scheitern als still neu starten.
  if (umkleide.offen === true && umkleide.state === 'paused') {
    // Einfache Form statt Spread/Pfeilfunktion: der Ausdruck wird so gebaut,
    // dass ein Syntaxfehler in der Seitenauswertung nicht mehr auftreten kann
    // (im Lauf 2 brach genau hier alles mit "Unexpected token '}'" ab, ohne
    // Stelle). Der Frack wird ueber den Titel gesucht, nicht ueber den Index.
    await evaluate(`(function () {
      var b = document.querySelectorAll('#gardeCards button');
      for (var i = 0; i < b.length; i++) {
        if (String(b[i].textContent).indexOf('FRACK') >= 0) { b[i].click(); return 1; }
      }
      return 0;
    })()`);
  }
  await sleep(350);
  const imFrack = await zust4(`{
    kluft: window.__roland.game.outfit.id,
    state: window.__roland.game.state,
    zielFrei: window.__roland.game.goalErfuellt(),
    ziel: window.__roland.game.hud.ziel,
    offen: !document.getElementById('garde').classList.contains('hidden')
  }`);
  check('Akt 4: im Frack gibt das Ziel frei (Auftritt)',
    imFrack.kluft === 'frack' && imFrack.state === 'play' && imFrack.zielFrei === true,
    JSON.stringify(imFrack));

  // Der Auftritt endet an der Zielschwelle hinter dem Gitter (Ziel bei 96*TILE):
  // der laufende Spieler geht im Frack hindurch und das Spiel wechselt nach
  // 'complete'. gehe4 bricht ab, sobald der Zustand 'play' verlaesst, meldet den
  // Lauf dabei aber nicht als erreicht — je nachdem, in welches Abtastfenster
  // der Abschluss faellt oder ob er erst im Auslauf nach dem Loslassen der Taste
  // passiert. Geprueft wird deshalb der Endzustand des Spiels selbst, und zwar
  // vollstaendig: im Frack, Gitter offen, hinter dem Gitter, Auftritt beendet.
  a4Schritt('10/10 Auftritt im Frack durch das Gitter');
  const zumAuftritt = await gehe4('KeyD', "window.__roland.game.state !== 'play'", 16000);
  const auftrittStand = `{
    state: window.__roland.game.state,
    gitter: window.__roland.game.gates[1].open,
    kluft: window.__roland.game.outfit.id,
    x: Math.round(window.__roland.game.player.x),
    errors: window.__errors
  }`;
  let auftritt = await zust4(auftrittStand);
  for (let i = 0; i < 12 && auftritt.state === 'play'; i++) {
    await sleep(250);
    auftritt = await zust4(auftrittStand);
  }
  results.push(`AKT4 Auftritt: Lauf=${zumAuftritt} (${abgang4}), Ende=${auftritt.state},`
    + ` x=${auftritt.x}, Gitter=${auftritt.gitter}, Kluft=${auftritt.kluft}`);
  check('Akt 4: im Frack oeffnet der laufende Spieler das Gitter und der Auftritt endet',
    auftritt.state === 'complete' && auftritt.gitter === true && auftritt.kluft === 'frack'
    && auftritt.x > 82 * 16, JSON.stringify(auftritt));
  check('Akt 4: der ganze Weg durch den Graben bleibt ohne Konsolenfehler',
    auftritt.errors.length === 0, JSON.stringify(auftritt.errors));
  await bild4('akt4-auftritt.png');
  results.push(`AKT4 Weg ohne Positionssetzung, ${kollaps4} Kollapse mit Spiel-Neustart`
    + ` bei x=[${kollaps4Orte.join(', ')}], Uebergabe-Drucke: ${uebergabeVersuche}`);
  results.push(`AKT4 ${results.filter((r) => /^PASS Akt 4/.test(r)).length} Akt-4-Pruefungen bestanden`
    + ` (${results.filter((r) => /^FAIL Akt 4/.test(r)).length} offen)`);
  // Nachweis der Grenze selbst: der Abschnitt wird gemessen, nicht geschaetzt.
  a4Schritt('10/10 fertig');
  check('Akt 4: der Abschnitt bleibt unter zwei Minuten', a4Dauer() < 120000, a4Zeit(a4Dauer()));
  results.push(`AKT4 Abschnitt in ${a4Zeit(a4Dauer())}`
    + ` (hartes Budget ${A4_BUDGET_MS / 1000}s, Auftragsgrenze 120s, Ziel 45s)`);

  // --- Motorrad-Interludium (Nachtfahrt) — Heimweg nach dem Finale ---------
  // Auftrag CUT-2: erst die Einstiegs-Cutscene (Helm aufsetzen, aufsteigen).
  // Seit Roland (13.09.) laeuft sie bei jedem Start der Nachtfahrt — auch beim
  // Start hier; danach faehrt die Nachtfahrt wie geprueft los.
  await pruefeEinstiegSzene('motorrad');
  await evaluate(`window.__roland.loadAct(${idxVon('MOTORRAD')})`);
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(400);
  const motoSzene = JSON.parse(await evaluate(`JSON.stringify({
    aktiv: window.__roland.einstieg.aktiv,
    fahrzeug: window.__roland.einstieg.fahrzeug
  })`));
  check('Motorrad: die Einstiegs-Cutscene laeuft auch hier bei jedem Start',
    motoSzene.aktiv === true && motoSzene.fahrzeug === 'motorrad', JSON.stringify(motoSzene));
  const motoWarte = await warteEinstiegVorbei();
  check('Motorrad: die Szene geht in die Nachtfahrt ueber (Wartezeit gemessen)', motoWarte >= 0,
    `gewartet ${motoWarte}s`);
  await sleep(1500);
  const moto = JSON.parse(await evaluate(`JSON.stringify({
    name: window.__roland.level.name,
    fahrzeug: window.__roland.racer.fahrzeug,
    nacht: window.__roland.racer.nacht,
    laub: window.__roland.racer.laub.length,
    tunnel: window.__roland.racer.tunnel.length,
    kmh: window.__roland.racer.hud.speed,
    state: window.__roland.racer.state,
    errors: window.__errors
  })`));
  check('Motorrad startet direkt (ohne Umkleide)',
    moto.fahrzeug === 'motorrad' && moto.state === 'play', JSON.stringify(moto));
  check('Motorrad: Nacht, Laub und Tunnel vorhanden',
    moto.nacht === true && moto.laub > 5 && moto.tunnel > 0, JSON.stringify(moto));
  check('Motorrad faehrt los', moto.kmh > 20, JSON.stringify(moto));

  // Schaerfe-Beleg (Auftrag DRR-F1): der Spiel-Canvas muss ohne Kantenglaettung
  // zeichnen. Steht die Regel in src/main.js vor der Canvas-Groesse, setzt die
  // Zuweisung an width/height den 2D-Kontext zurueck — der Browser rechnet die
  // skalierten Fahrzeug-Sprites dann weich ("verwaschen", hunderte Mischfarben
  // im Fahrzeugbereich statt reiner Palettenfarben).
  const motoScharf = JSON.parse(await evaluate(`(() => {
    const cv = document.getElementById('game'), g = cv.getContext('2d');
    const vw = cv.width, vh = cv.height;
    const w = Math.round(vw * 0.20), h = Math.round(w * 26 / 30);
    const x = Math.round(vw / 2 - w / 2), y = vh - 8 - h;
    const d = g.getImageData(x, y, w, h).data;
    const farben = new Set();
    for (let i = 0; i < d.length; i += 4) farben.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return JSON.stringify({ glattung: g.imageSmoothingEnabled, farben: farben.size, pixel: w * h });
  })()`));
  check('Motorrad: der Spiel-Canvas zeichnet ohne Kantenglaettung',
    motoScharf.glattung === false, JSON.stringify(motoScharf));
  check('Motorrad: das Fahrzeug traegt reine Palettenfarben (keine Mischfarben)',
    motoScharf.farben <= 120, JSON.stringify(motoScharf));

  const nachtBild = JSON.parse(await evaluate(bildStat));
  check('Nachtfahrt ist dunkel, aber nicht schwarz',
    nachtBild.schnitt >= 3 && nachtBild.schnitt < 70, JSON.stringify(nachtBild));
  check('Motorrad: Licht im Bild (Scheinwerfer, Rueckleuchten)',
    nachtBild.max > 120, JSON.stringify(nachtBild));
  check('keine Fehler in der Nachtfahrt', moto.errors.length === 0, JSON.stringify(moto.errors));

  // Motorrad-Journey: fünf Nachtabschnitte, Helm-Motiv statt Mappe.
  const motoJourney = JSON.parse(await evaluate(`JSON.stringify({
    section: window.__roland.aktiv.hud.drive?.section || null,
    cue: window.__roland.aktiv.hud.drive?.cue || null,
    ziel: window.__roland.aktiv.hud.ziel,
    tunnel: window.__roland.racer.imTunnel()
  })`));
  check('Motorrad zeigt Nachtabschnitt und Helm-Ziel',
    motoJourney.section === 'OPERNPLATZ' && !!motoJourney.cue
    && motoJourney.ziel.includes('NACH HAUSE') && motoJourney.tunnel === false,
    JSON.stringify(motoJourney));
  const motoDom = JSON.parse(await evaluate(`JSON.stringify({
    daten: window.__roland.racer.beschriftungen().length,
    elemente: document.querySelectorAll('#gameTextLayer [data-text-id]').length,
    abschnitt: (document.querySelector('#gameTextLayer [data-text-id="ro-abschnitt"]') || {}).textContent || null,
    segment5: !!document.querySelector('#gameTextLayer [data-text-id="ro-segmente-4"]'),
    schrift: parseFloat(getComputedStyle(document.querySelector('#gameTextLayer [data-text-id="ro-cue"]')).fontSize)
  })`));
  check('Motorrad: dasselbe Fahr-HUD liegt in der DOM-Ebene (fuenf Abschnitte)',
    motoDom.daten === 9 && motoDom.elemente === 9 && motoDom.segment5 === true
      && /^\d \/ 5 /.test(motoDom.abschnitt || '') && motoDom.schrift >= 12,
    JSON.stringify(motoDom));

  // --- Akt 5 (Finale) — vor der Nachtfahrt --------------------------------
  await evaluate(`window.__roland.loadAct(${idxVon('DIE BÜHNE')})`);
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(300);
  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(900);
  const finale = JSON.parse(await evaluate(`JSON.stringify({
    name: window.__roland.level.name,
    spots: (window.__roland.level.movingLights || []).length,
    bedarf: window.__roland.level.goal.applaus,
    state: window.__roland.aktiv.hud.state
  })`));
  check('Finale laedt', finale.state === 'play', JSON.stringify(finale));
  check('Finale: Verfolgerspots und Applaus-Schwelle', finale.spots >= 2 && finale.bedarf >= 50, JSON.stringify(finale));
  const spotA = await evaluate('window.__roland.game.movingLights[0].x');
  await sleep(900);
  const spotB = await evaluate('window.__roland.game.movingLights[0].x');
  check('Verfolgerspots wandern', spotA !== spotB, `${spotA} -> ${spotB}`);

  // --- Akt 5: die Zugabe mit echten Tasten (Auftrag A5) --------------------
  // Gespielt wird mit echten Tasten. Nur der weite Bühnenweg ist abgekürzt —
  // wie in den Akt-2-Abschnitten dieses Tests; die letzten Schritte ans Pult
  // und an den Vorhang läuft die Figur selbst.
  await evaluate(`(() => {
    const g = window.__roland.game;
    g.setOutfit('frack');
    const p = g.entities.find((e) => e.kind === 'pult' && e.zugabe);
    g.player.x = p.x - 34; g.player.y = p.y + p.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
    window.__errors.length = 0;
  })()`);
  await sleep(200);
  await key('KeyD', 'keyDown');
  for (let i = 0; i < 40; i++) {
    if (await evaluate(`!!(window.__roland.game.hud.label && /ZUGABE/.test(window.__roland.game.hud.label.text))`)) break;
    await sleep(80);
  }
  await key('KeyD', 'keyUp');
  await sleep(250);
  const pultAngebot = JSON.parse(await evaluate(`JSON.stringify({
    label: window.__roland.game.hud.label && window.__roland.game.hud.label.text,
    ziel: window.__roland.game.hud.ziel,
    applaus: document.getElementById('applaus').textContent,
    sichtbar: !document.getElementById('applausWrap').classList.contains('hidden')
  })`));
  check('Akt 5: die D-Taste bringt den Spieler ans Pult, das Schild bietet die Zugabe',
    /ZUGABE/.test(pultAngebot.label || ''), JSON.stringify(pultAngebot));
  check('Akt 5: das Journal fuehrt den Schritt „Zugabe spielen"',
    /ZUGABE/.test(pultAngebot.ziel || ''), pultAngebot.ziel);
  check('Akt 5: der Applaus-Stand steht sichtbar im HUD',
    pultAngebot.sichtbar === true && pultAngebot.applaus === '0/60', JSON.stringify(pultAngebot));

  // Fuenf echte E-Tastendruecke im Takt. Der Takt wird abgewartet und abgelesen,
  // nicht gesetzt: danebengehen kostet nichts, trifft nur im Takt.
  const stufen = [];
  for (let versuch = 0; versuch < 40 && stufen.length < 5; versuch++) {
    if (!(await evaluate('window.__roland.game.beatAccuracy() <= window.__roland.game.diff.trittWindow'))) {
      await sleep(25);
      continue;
    }
    await key('KeyE', 'keyDown'); await sleep(60);
    await key('KeyE', 'keyUp'); await sleep(130);
    const stand = JSON.parse(await evaluate(`JSON.stringify({
      applaus: Math.round(window.__roland.game.applaus),
      teil: window.__roland.game.entities.find((e) => e.kind === 'pult' && e.zugabe).teil,
      hud: document.getElementById('applaus').textContent,
      stufen: document.getElementById('applausStufen').textContent,
      puls: window.__roland.game.hud.applausPuls,
      klasse: document.getElementById('applaus').classList.contains('puls')
    })`));
    if (!stufen.length || stand.teil > stufen[stufen.length - 1].teil) stufen.push(stand);
  }
  check('Akt 5: fuenf echte Einsaetze im Takt lassen den Applaus in Stufen steigen',
    stufen.map((s) => s.applaus).join(',') === '12,24,36,48,60'
    && stufen.map((s) => s.hud).join(' ') === '12/60 24/60 36/60 48/60 60/60',
    JSON.stringify(stufen.map((s) => `${s.applaus}:${s.hud}`)));
  check('Akt 5: jede Stufe ist sichtbar (Puls am Zahlenwert, Balken waechst bis voll)',
    stufen.every((s) => s.puls === true && s.klasse === true)
    && stufen[stufen.length - 1].stufen === '▮▮▮▮▮' && stufen[0].stufen === '▮▯▯▯▯',
    JSON.stringify(stufen.map((s) => s.stufen)));
  const nachZugabe = JSON.parse(await evaluate(`JSON.stringify({
    ziel: window.__roland.game.hud.ziel,
    flag: window.__roland.game.storyFlags.has('zugabe_gespielt')
  })`));
  check('Akt 5: nach der Zugabe fuehrt das Journal zum Frack',
    nachZugabe.flag === true && /FRACK/.test(nachZugabe.ziel || ''), JSON.stringify(nachZugabe));

  const zugabeShot = await send('Page.captureScreenshot', { format: 'png' });
  const zugabePath = join(act1ShotDir, 'act5-zugabe.png');
  writeFileSync(zugabePath, Buffer.from(zugabeShot.data, 'base64'));
  check('Akt-5-Zugabebild geschrieben', existsSync(zugabePath));
  results.push(`AKT5-SCREENSHOT ${zugabePath}`);

  // Frack ablegen am Vorhang: ohne Notgriff und ohne die Notgriff-Hitze, mit
  // einer echten E-Taste. (Das Verfolgerlicht waermt den Frack nebenbei auf —
  // das ist die Buehne, nicht die Bedingung des Ziels.)
  await evaluate(`(() => {
    const g = window.__roland.game;
    const z = g.level.goal;
    g.player.x = z.x - 30; g.player.y = z.y + z.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
  })()`);
  await sleep(200);
  await key('KeyD', 'keyDown');
  for (let i = 0; i < 40; i++) {
    // Erst anhalten, wenn das Ziel wirklich ueberlappt ist — das Schild steht
    // auch schon 90 px vorher am Bildrand.
    if (await evaluate(`(() => {
      const g = window.__roland.game; const z = g.level.goal; const p = g.player;
      return p.x + p.w > z.x && p.x < z.x + z.w;
    })()`)) break;
    await sleep(80);
  }
  await key('KeyD', 'keyUp');
  await sleep(200);
  const vorhangLage = JSON.parse(await evaluate(`JSON.stringify({
    label: window.__roland.game.hud.label && window.__roland.game.hud.label.text,
    imZiel: (() => {
      const g = window.__roland.game; const z = g.level.goal; const p = g.player;
      return p.x + p.w > z.x && p.x < z.x + z.w;
    })(),
    hitze: Math.round(window.__roland.game.heat),
    notgriff: window.__roland.game.frackOffUsed,
    state: window.__roland.game.state
  })`));
  check('Akt 5: am Vorhang steht „FRACK ABLEGEN" — im Ziel, ohne Notgriff, ohne Hitzezwang',
    /ABLEGEN/.test(vorhangLage.label || '') && vorhangLage.imZiel === true
    && vorhangLage.notgriff === false && vorhangLage.hitze < 20 && vorhangLage.state === 'play',
    JSON.stringify(vorhangLage));
  await key('KeyE', 'keyDown'); await sleep(60);
  await key('KeyE', 'keyUp'); await sleep(500);
  const finaleEnde = JSON.parse(await evaluate(`JSON.stringify({
    state: window.__roland.game.state,
    abgelegt: window.__roland.game.frackAbgelegt,
    outfit: window.__roland.game.outfit.id,
    fehler: window.__errors
  })`));
  check('Akt 5: ein echter E-Druck am Vorhang beendet den Akt',
    finaleEnde.state === 'complete' && finaleEnde.abgelegt === true && finaleEnde.outfit === 'schwarz',
    JSON.stringify(finaleEnde));
  check('Akt 5: die ganze Zugabe laeuft ohne Konsolenfehler',
    finaleEnde.fehler.length === 0, JSON.stringify(finaleEnde.fehler.slice(0, 3)));

  // --- Epilog: Kleingarten mit Ramona und Grill ----------------------------
  await evaluate(`window.__roland.loadAct(${idxVon('KLEINGARTEN')})`);
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(400);
  // Auftrag „Epilog-Ramona": der Kleingarten startet im Frack, ohne Auswahl.
  const epiStart = JSON.parse(await evaluate(`JSON.stringify({
    outfit: window.__roland.game.outfit.id,
    auswahl: !document.getElementById('garde').classList.contains('hidden'),
  })`));
  check('Epilog-Browser: Start im Frack ohne Kleiderauswahl',
    epiStart.outfit === 'frack' && epiStart.auswahl === false, JSON.stringify(epiStart));
  await sleep(700);
  const epi = JSON.parse(await evaluate(`JSON.stringify({
    name: window.__roland.level.name,
    ramona: window.__roland.game.entities.filter((e) => e.kind === 'ramona').length,
    grill: window.__roland.game.entities.filter((e) => e.kind === 'grill').length,
    feinde: window.__roland.game.entities.filter((e) => ['piccolo','sopran','tenor','koffer','dirigent'].includes(e.kind)).length,
    state: window.__roland.aktiv.hud.state
  })`));
  check('Epilog laedt', epi.state === 'play', JSON.stringify(epi));
  check('Epilog: Ramona und der Grill sind da', epi.ramona === 1 && epi.grill === 1, JSON.stringify(epi));
  check('Epilog: keine Gefahren mehr', epi.feinde === 0, JSON.stringify(epi));

  // --- Grill-Minispiel -----------------------------------------------------
  await evaluate("(() => { const g = window.__roland.game; const gr = g.entities.find((e) => e.kind === 'grill'); g.player.x = gr.x - 16; g.player.y = gr.y + gr.h - 22; })()");
  await sleep(500);
  await evaluate("window.__roland.input.setKey('action', true)");
  await sleep(200);
  await evaluate("window.__roland.input.setKey('action', false)");
  await sleep(500);
  const grillModus = JSON.parse(await evaluate(`JSON.stringify({
    modus: window.__roland.aktiv.hud.modus,
    readout: !document.getElementById('grillReadout').classList.contains('hidden'),
    walkWeg: document.getElementById('walkReadout').classList.contains('hidden')
  })`));
  check('Grill startet am Grill', grillModus.modus === 'grill', JSON.stringify(grillModus));
  check('Grill-HUD ersetzt das Lauf-HUD', grillModus.readout === true && grillModus.walkWeg === true, JSON.stringify(grillModus));
  // Auswahl auf eine frische Wurst legen und dort wenden
  await evaluate("window.__roland.input.setKey('left', true)");
  await sleep(200);
  await evaluate("window.__roland.input.setKey('left', false)");
  await sleep(200);
  const grillVorher = await evaluate('window.__roland.grill.wuerserste.filter((w) => w.seite > 0).length');
  await evaluate("window.__roland.input.setKey('action', true)");
  await sleep(200);
  await evaluate("window.__roland.input.setKey('action', false)");
  await sleep(600);
  const grillNachher = await evaluate('window.__roland.grill.wuerserste.filter((w) => w.seite > 0).length');
  check('Grill reagiert auf die Aktion', grillNachher > grillVorher, `${grillVorher} -> ${grillNachher}`);

  // --- Auftrag E2: Grafik und Steuerung im Bild ----------------------------
  // Die Fokusmarkierung muss sichtbar sein: Rahmen und Pfeil in der Fokusfarbe
  // genau an der Stelle, die die Auswahl meint.
  await evaluate(`(() => { const g = window.__roland.grill;
    g.wuerserste.filter((x) => x.zustand === 'rost').forEach((w) => { w.gar = 5; w.verbrannt = 0; });
    g.auswahl = 0; return true; })()`);
  await sleep(220);
  const fokusBild = JSON.parse(await evaluate(`(() => {
    const g = window.__roland.grill; const c = document.getElementById('game');
    const f = g.zeichnungFokus;
    if (!f) return JSON.stringify({ fehlt: true });
    const d = c.getContext('2d').getImageData(f.x, f.y, f.w, f.h).data;
    let punkte = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === 242 && d[i + 1] === 210 && d[i + 2] === 75 && d[i + 3] > 0) punkte++;
    }
    return JSON.stringify({
      punkte, fokus: g.hud.fokus, auswahl: g.auswahl, x: f.x, w: f.w,
      fokusName: g.hud.fokusName, stufen: g.hud.stufen.length,
    });
  })()`));
  check('Grill-Browser: die Fokusmarkierung ist im Bild sichtbar',
    !fokusBild.fehlt && fokusBild.punkte > 0 && fokusBild.fokus === fokusBild.auswahl
      && fokusBild.fokusName === 'ROH' && fokusBild.stufen === 3,
    JSON.stringify(fokusBild));

  // Die Markierung wandert nachvollziehbar: ein Druck, ein Schritt nach rechts.
  await evaluate("window.__roland.input.setKey('right', true)");
  await sleep(120);
  await evaluate("window.__roland.input.setKey('right', false)");
  await sleep(260);
  const fokusNach = JSON.parse(await evaluate(`JSON.stringify({
    auswahl: window.__roland.grill.auswahl,
    x: window.__roland.grill.zeichnungFokus.x,
  })`));
  check('Grill-Browser: die Fokusmarkierung wandert mit der Auswahl',
    fokusNach.auswahl === 1 && fokusNach.x > fokusBild.x,
    `auswahl ${fokusBild.auswahl} -> ${fokusNach.auswahl}, x ${fokusBild.x} -> ${fokusNach.x}`);

  // Garstufen im Bild: jede Stufe hat eine eigene Leitfarbe, die auch wirklich
  // gezeichnet wird — geprüft an den Bildpunkten des Wurstbereichs.
  const stufenProbe = [];
  const stufenFaelle = [['wurst_roh', 5, 0], ['wurst_angebraten', 40, 0], ['wurst_goldbraun', 70, 0], ['wurst_dunkel', 92, 0], ['wurst_verbrannt', 60, 1]];
  for (const [name, gar, verbrannt] of stufenFaelle) {
    await evaluate(`(() => { const g = window.__roland.grill;
      const w = g.wuerserste.filter((x) => x.zustand === 'rost')[g.auswahl];
      w.gar = ${gar}; w.verbrannt = ${verbrannt}; return true; })()`);
    await sleep(200);
    stufenProbe.push(JSON.parse(await evaluate(`(() => {
      const g = window.__roland.grill; const c = document.getElementById('game');
      const z = g.zeichnung.find((e) => e.fokus);
      const d = c.getContext('2d').getImageData(z.x, z.y, z.w, z.h).data;
      const r = parseInt(z.farbe.slice(1, 3), 16), gg = parseInt(z.farbe.slice(3, 5), 16), b = parseInt(z.farbe.slice(5, 7), 16);
      let treffer = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === gg && d[i + 2] === b && d[i + 3] === 255) treffer++;
      return JSON.stringify({ stufe: z.stufe, farbe: z.farbe, treffer, w: z.w, h: z.h });
    })()`)));
  }
  check('Grill-Browser: jede Garstufe hat ihren eigenen Sprite im Bild',
    stufenProbe.every((p, i) => p.stufe === stufenFaelle[i][0] && p.treffer > 0),
    stufenProbe.map((p) => `${p.stufe}:${p.treffer}`).join(' '));
  check('Grill-Browser: die Garstufen sind im Bild unterscheidbar (eigene Leitfarbe)',
    new Set(stufenProbe.map((p) => p.farbe)).size === 5, stufenProbe.map((p) => p.farbe).join(' '));
  check('Grill-Browser: die Garstufen haben verschiedene Umrisse',
    new Set(stufenProbe.map((p) => `${p.w}x${p.h}`)).size > 1, stufenProbe.map((p) => `${p.w}x${p.h}`).join(' '));

  // Eine Aktion pro Druck: eine Sekunde gehalten wendet genau einmal.
  await evaluate(`(() => { const g = window.__roland.grill;
    const w = g.wuerserste.filter((x) => x.zustand === 'rost')[g.auswahl];
    w.seite = 0; w.gar = 5; w.gewendet = 0; return true; })()`);
  await sleep(200);
  const vorHalten = JSON.parse(await evaluate(`JSON.stringify({
    summe: window.__roland.grill.wuerserste.reduce((a, w) => a + w.gewendet, 0),
    seite: window.__roland.grill.wuerserste.filter((x) => x.zustand === 'rost')[window.__roland.grill.auswahl].seite,
  })`));
  await evaluate("window.__roland.input.setKey('action', true)");
  await sleep(1000);
  await evaluate("window.__roland.input.setKey('action', false)");
  await sleep(300);
  const nachHalten = JSON.parse(await evaluate(`JSON.stringify({
    summe: window.__roland.grill.wuerserste.reduce((a, w) => a + w.gewendet, 0),
    seite: window.__roland.grill.wuerserste.filter((x) => x.zustand === 'rost')[window.__roland.grill.auswahl].seite,
    serviert: window.__roland.grill.serviert,
  })`));
  check('Grill-Browser: ein gehaltener Knopf wendet genau einmal',
    nachHalten.summe === vorHalten.summe + 1 && nachHalten.seite === 1 && nachHalten.serviert === 0,
    `${vorHalten.summe} -> ${nachHalten.summe}, seite ${vorHalten.seite} -> ${nachHalten.seite}`);

  // Der Knopf sagt, was die Aktion tut.
  await evaluate(`(() => { const g = window.__roland.grill;
    const w = g.wuerserste.filter((x) => x.zustand === 'rost')[g.auswahl];
    w.seite = 0; w.gar = 50; return true; })()`);
  await sleep(400);
  const knopfWenden = await evaluate("document.getElementById('btnAction').textContent");
  await evaluate(`(() => { const g = window.__roland.grill;
    const w = g.wuerserste.filter((x) => x.zustand === 'rost')[g.auswahl]; w.seite = 1; w.gar = 50; return true; })()`);
  await sleep(400);
  const knopfServieren = await evaluate("document.getElementById('btnAction').textContent");
  check('Grill-Browser: der Aktionsknopf sagt, was passiert',
    knopfWenden === 'WENDEN' && knopfServieren === 'SERVIEREN', `${knopfWenden} -> ${knopfServieren}`);

  // Rauch, wenn die Wurst zu lange liegt.
  await evaluate(`(() => { const g = window.__roland.grill;
    const w = g.wuerserste.filter((x) => x.zustand === 'rost')[g.auswahl];
    w.seite = 0; w.gar = 80; return true; })()`);
  await sleep(1100);
  const rauch = JSON.parse(await evaluate(`JSON.stringify({
    teilchen: window.__roland.grill.rauch.length,
    fett: window.__roland.grill.fettTropfen,
    verbrannt: window.__roland.grill.verbrannt,
  })`));
  check('Grill-Browser: bei zu langem Liegen steigt Rauch',
    rauch.teilchen > 0 && rauch.verbrannt === 0, JSON.stringify(rauch));

  // Bild für Roland: gemischte Garstufen, Teller mit zwei Würsten, Fokus sichtbar.
  await evaluate(`(() => { const g = window.__roland.grill;
    const aufRost = g.wuerserste.filter((x) => x.zustand === 'rost');
    aufRost.forEach((w, i) => { w.seite = i === 1 ? 1 : 0; w.gar = [12, 62, 88][i] || 40; w.verbrannt = 0; });
    g.wuerserste.filter((x) => x.zustand === 'kiste').slice(0, 2).forEach((w) => {
      w.zustand = 'fertig'; w.seite = 1; w.gar = 76; });
    g.auswahl = 1; g.serviert = 2; g.fertig = 2; g.sauber = 3; g.punktestand = 340;
    return true; })()`);
  await sleep(900);
  const shotDirGrill = fileURLToPath(new URL('../.artifacts/', import.meta.url));
  mkdirSync(shotDirGrill, { recursive: true });
  const grillPfad = join(shotDirGrill, 'grill.png');
  const grillBild = Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  writeFileSync(grillPfad, grillBild);
  // Zweitablage: genau der Pfad, den der Auftrag für Roland nennt.
  const grillWurzel = fileURLToPath(new URL('../screenshot-grill.png', import.meta.url));
  writeFileSync(grillWurzel, grillBild);
  check('Grill-Browser: Screenshot geschrieben', existsSync(grillPfad) && existsSync(grillWurzel));
  results.push(`SCREENSHOT ${grillPfad}`);
  results.push(`SCREENSHOT ${grillWurzel}`);
  check('keine Fehler in Finale und Epilog',
    (await evaluate('JSON.stringify(window.__errors)')) === '[]', await evaluate('JSON.stringify(window.__errors)'));

  // --- Epilog: der Kleiderschrank im Kleingarten (Auftrag E1) ---------------
  // Der Umzug muss am Avatar zu sehen sein, nicht nur im Datenmodell. Deshalb
  // werden die Bildpunkte der Figur vor und nach dem Wechsel verglichen und
  // zwei Screenshots abgelegt (Frack und Zivil).
  const figurFarben = `(() => {
    const c = document.getElementById('game'); const g = window.__roland.game;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const px = Math.round(g.player.x - g.cam.x), py = Math.round(g.player.y - g.cam.y);
    const farben = {};
    for (let y = Math.max(0, py - 6); y < Math.min(c.height, py + g.player.h + 6); y++)
      for (let x = Math.max(0, px - 8); x < Math.min(c.width, px + g.player.w + 8); x++) {
        const i = (y * c.width + x) * 4;
        if (d[i + 3] === 0) continue;
        const k = [d[i], d[i + 1], d[i + 2]].join(',');
        farben[k] = (farben[k] || 0) + 1;
      }
    return JSON.stringify(farben);
  })()`;
  // DRR-F4: dasselbe Fenster, aber nach den Farben der Zivilkluft sortiert —
  // Hemdgrund, Shorts, Muster (Bluete/Blatt) und die nackten Beine darunter.
  // Eine lange Hose haette unter dem Hosensaum keine Hautpunkte.
  const figurZivilProbe = `(() => {
    const c = document.getElementById('game'); const g = window.__roland.game;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    // Genau das Rechteck, das drawPlayer fuer die Figur zeichnet (16x24) —
    // ein weiteres Fenster wuerde die Blueten und Blaetter des Gartens
    // mitzaehlen (denselben Fehler macht der Block ?test=zivil nicht mehr).
    const sx = Math.round(g.player.x - g.cam.x - 2);
    const sy = Math.round(g.player.y - g.cam.y + g.player.h - 24);
    const zaehler = { hemd: 0, shorts: 0, blueteO: 0, blueteY: 0, blattE: 0, bein: 0 };
    let hemdY = 0, saumY = null;
    for (let y = Math.max(0, sy); y < Math.min(c.height, sy + 24); y++)
      for (let x = Math.max(0, sx); x < Math.min(c.width, sx + 16); x++) {
        const i = (y * c.width + x) * 4;
        if (d[i + 3] === 0) continue;
        const rot = d[i], gruen = d[i + 1], blau = d[i + 2];
        if (rot === 47 && gruen === 191 && blau === 174) { zaehler.hemd++; hemdY += y; }
        else if (rot === 169 && gruen === 117 && blau === 64) {
          zaehler.shorts++; saumY = saumY === null ? y : Math.max(saumY, y);
        }
        else if (rot === 239 && gruen === 143 && blau === 58) zaehler.blueteO++;
        else if (rot === 232 && gruen === 196 && blau === 106) zaehler.blueteY++;
        else if (rot === 63 && gruen === 107 && blau === 58) zaehler.blattE++;
        else if (rot === 232 && gruen === 185 && blau === 138 && saumY !== null && y > saumY) zaehler.bein++;
      }
    return JSON.stringify({
      ...zaehler, saumY,
      hemdY: zaehler.hemd ? +(hemdY / zaehler.hemd).toFixed(1) : null,
      outfit: g.outfit.id,
    });
  })()`;


  const hinZu = (kind) => `(() => { const g = window.__roland.game;
    const en = g.entities.find((e) => e.kind === '${kind}');
    g.player.x = en.x - 18; g.player.y = en.y + en.h - g.player.h; g.player.vx = 0; g.player.vy = 0;
    return JSON.stringify({ x: en.x, y: en.y, w: en.w, h: en.h, nah: en.near }); })()`;
  const tippe = async (pausen = 600) => {
    await evaluate("window.__roland.input.setKey('action', true)");
    await sleep(180);
    await evaluate("window.__roland.input.setKey('action', false)");
    await sleep(pausen);
  };

  // Der Grill aus dem vorigen Block ist ein eigener Modus: solange er laeuft,
  // wird die Ebene nicht mehr aktualisiert (kein Interaktionspunkt, kein HUD).
  // Erst beenden, dann ist der Kleingarten wieder die aktive Simulation.
  const ausDemGrill = async () => {
    if ((await evaluate('window.__roland.grill === null')) === true) return true;
    await evaluate("(() => { const a = window.__roland.aktiv; if (a.ende) a.ende(); else if (a.complete) a.complete(); })()");
    await sleep(350);
    await evaluate("document.getElementById('rewardBtn').click()");
    await sleep(600);
    if ((await evaluate('window.__roland.grill === null')) === true) return true;
    // Notnagel: frische Seite. Ohne das bliebe das Minispiel im Bild und alle
    // folgenden Prüfungen liefen gegen den falschen Spielstand.
    await send('Page.navigate', { url: URL_TO_TEST + (URL_TO_TEST.includes('?') ? '&' : '?') + 'v=' + Date.now() });
    await sleep(2200);
    return (await evaluate('window.__roland.grill === null')) === true;
  };
  check('Epilog-Browser: der Grill ist beendet, die Simulation laeuft wieder', await ausDemGrill());

  await evaluate(`window.__roland.loadAct(${idxVon('KLEINGARTEN')})`);
  await evaluate("document.getElementById('startBtn').click()");
  // Er kommt im Frack an — seit dem Auftrag „Epilog-Ramona" ohne Kleiderauswahl.
  await sleep(1000);
  const gard = JSON.parse(await evaluate(hinZu('garderobe')));
  await sleep(400);
  const gardVor = JSON.parse(await evaluate(`JSON.stringify({
    outfit: window.__roland.game.outfit.id,
    nah: window.__roland.game.entities.filter((e) => e.kind === 'garderobe' && e.near).length,
    label: window.__roland.aktiv.hud.label
  })`));
  check('Epilog-Browser: der Kleiderschrank ist der naechste Interaktionspunkt',
    gardVor.nah === 1 && gardVor.outfit === 'frack', JSON.stringify(gardVor));
  check('Epilog-Browser: im Frack bietet er Zivil als AKTION mit E an',
    !!gardVor.label && /KLEIDERSCHRANK/.test(gardVor.label.text) && /ZIVIL/.test(gardVor.label.text)
      && gardVor.label.action === true && gardVor.label.key === 'E',
    JSON.stringify(gardVor.label));

  const farbenFrack = JSON.parse(await evaluate(figurFarben));
  const shotDirEpi = fileURLToPath(new URL('../.artifacts/', import.meta.url));
  mkdirSync(shotDirEpi, { recursive: true });
  const epiFrackPfad = join(shotDirEpi, 'epilog-frack.png');
  writeFileSync(epiFrackPfad, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  results.push(`FRACK-BILD ${epiFrackPfad}`);

  // Auftrag CUT-1: die Aktion „ZIVIL ANZIEHEN" laeuft jetzt durch die
  // Schlussszene — erst die Szene (4,4 s), danach der vorhandene Wechsel.
  // Der Block legt das Bild der Szene und das Bild danach ab.
  const nachZivil = await pruefeKleiderschrankSzene();
  check('Epilog-Browser: die Aktionstaste zieht Zivil an',
    nachZivil.outfit === 'zivil' && nachZivil.flag === true && nachZivil.merker === true,
    JSON.stringify(nachZivil));
  check('Epilog-Browser: die Meldung nennt Shorts und Hawaii-Hemd',
    /HAWAII/.test(String(nachZivil.hint)), String(nachZivil.hint));
  check('Epilog-Browser: danach bietet er den Frack an',
    nachZivil.aktiv === false && !!nachZivil.label
      && /KLEIDERSCHRANK/.test(nachZivil.label.text) && /FRACK/.test(nachZivil.label.text),
    JSON.stringify(nachZivil.label));

  const farbenZivil = JSON.parse(await evaluate(figurFarben));
  const neueFarben = Object.keys(farbenZivil).filter((k) => !(k in farbenFrack));
  const hemdPunkte = farbenZivil['47,191,174'] || 0;   // #2fbfae — die Hemdfarbe der Zivilpalette
  check('Epilog-Browser: der Avatar sieht in Zivil anders aus (Bildpunkte der Figur)',
    neueFarben.length > 0 && hemdPunkte > 0,
    `neue Farben ${neueFarben.join(' | ')}, Hemdpunkte ${hemdPunkte}`);

  // DRR-F4: der Avatar traegt im Garten erkennbar Zivilkleidung. Gemessen wird
  // an den Bildpunkten der Figur: Hemdgrund, Muster (Bluete/Blatt), die kurze
  // Hose — und darunter nackte Beine, was eine lange Hose ausschliesst.
  const zivilBild = JSON.parse(await evaluate(figurZivilProbe));
  check('Epilog-Browser: Zivil am Avatar — Hemd, Muster, Shorts und nackte Beine',
    zivilBild.outfit === 'zivil' && zivilBild.hemd >= 30 && zivilBild.shorts >= 8
      && zivilBild.blueteO >= 2 && zivilBild.blueteY >= 2 && zivilBild.blattE >= 2
      && zivilBild.bein >= 6 && zivilBild.saumY > zivilBild.hemdY,
    JSON.stringify(zivilBild));

  const epiZivilPfad = join(shotDirEpi, 'epilog-zivil.png');
  const epiZivilBild = Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  writeFileSync(epiZivilPfad, epiZivilBild);
  // Zweitablage: genau der Pfad, den der Auftrag fuer Roland nennt.
  const epiZivilWurzel = fileURLToPath(new URL('../screenshot-epilog-zivil.png', import.meta.url));
  writeFileSync(epiZivilWurzel, epiZivilBild);
  check('Epilog-Browser: Screenshot in Zivil geschrieben', existsSync(epiZivilPfad) && existsSync(epiZivilWurzel));
  results.push(`SCREENSHOT ${epiZivilPfad}`);
  results.push(`SCREENSHOT ${epiZivilWurzel}`);

  // Umkehrbar: dreimal weiterschalten, am Ende steht wieder der Frack an.
  // Seit Roland (13.09.) laeuft die Szene bei jedem Frack -> Zivil-Wechsel:
  // der Block wartet sie ab und haelt fest, bei welchem Druck sie kommt.
  const kluften = [];
  const szenen = [];
  for (let i = 0; i < 3; i++) {
    await tippe(250);
    const lief = (await evaluate('window.__roland.cutscene.aktiv')) === true;
    for (let k = 0; k < 80 && lief
      && (await evaluate('window.__roland.cutscene.aktiv')) === true; k++) await sleep(150);
    await sleep(600);                       // Schrank-Cooldown abwarten
    kluften.push(await evaluate('window.__roland.game.outfit.id'));
    szenen.push(lief);
  }
  check('Epilog-Browser: der Wechsel ist mehrfach umkehrbar',
    kluften.join(',') === 'frack,zivil,frack', kluften.join(' -> '));
  // Der Merker unterdrueckt nichts mehr: der zweite Frack -> Zivil-Wechsel
  // zeigt die Szene wieder, die Gegenrichtung bleibt der schnelle Wechsel.
  check('Epilog-Browser: die Szene laeuft bei jedem Frack -> Zivil-Wechsel wieder',
    szenen.join(',') === 'false,true,false' && kluften[1] === 'zivil'
      && (await evaluate('window.__roland.cutscene.gesehen')) === true,
    `Szenen ${szenen.join(',')} / Kluften ${kluften.join(',')}`);

  // Der Frack bleibt aufhaengbar: an der Laube, im getragenen Frack. Der
  // Kleiderschrank ist ein zusaetzlicher Weg und darf das nicht verstellen.
  const laube = JSON.parse(await evaluate(hinZu('schrank')));
  await sleep(500);
  await tippe();
  const nachLaube = JSON.parse(await evaluate(`JSON.stringify({
    abgelegt: window.__roland.aktiv.hud.frackAbgelegt,
    outfit: window.__roland.game.outfit.id,
    hint: window.__roland.aktiv.hud.hint
  })`));
  check('Epilog-Browser: nach dem Kleiderschrank haengt der Frack weiter an der Laube',
    nachLaube.abgelegt === true, `${JSON.stringify(nachLaube)} @ ${JSON.stringify(laube)}`);
  check('Epilog-Browser: das Aufhaengen laesst das schwarze Hemd zurueck',
    nachLaube.outfit === 'schwarz', JSON.stringify(nachLaube));
  check('keine Fehler im Epilog-Kleiderschrank',
    (await evaluate('JSON.stringify(window.__errors)')) === '[]', await evaluate('JSON.stringify(window.__errors)'));

  // --- Auftrag „Epilog-Ramona“: Bier bei ihr, Uebergabe, Sitzen --------------
  // Drei Belegbilder aus einem echten Lauf: Start im Frack ohne Auswahl, der
  // Moment der Uebergabe (Flasche bei ihr -> bei ihm) und beide auf der Bank.
  await evaluate(`window.__roland.loadAct(${idxVon('KLEINGARTEN')})`);
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(1000);
  const romStart = JSON.parse(await evaluate(`JSON.stringify({
    outfit: window.__roland.game.outfit.id,
    auswahl: !document.getElementById('garde').classList.contains('hidden'),
    staender: window.__roland.game.entities.filter((e) => e.kind === 'stand').length,
    bierAufBank: window.__roland.game.entities.filter((e) => e.item === 'bier').length,
    beiIhr: window.__roland.game.entities.find((e) => e.kind === 'ramona').bier,
  })`));
  check('Epilog-Ramona-Browser: Start im Frack, keine Kleiderauswahl, kein Bank-Bier',
    romStart.outfit === 'frack' && romStart.auswahl === false
      && romStart.staender === 0 && romStart.bierAufBank === 0 && romStart.beiIhr === true,
    JSON.stringify(romStart));

  const shotDirRom = fileURLToPath(new URL('../.artifacts/', import.meta.url));
  mkdirSync(shotDirRom, { recursive: true });
  const schussRom = async (name) => {
    const daten = Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
    writeFileSync(join(shotDirRom, name), daten);
    writeFileSync(fileURLToPath(new URL('../' + name, import.meta.url)), daten);
    results.push(`SCREENSHOT ${join(shotDirRom, name)}`);
  };
  // Die Flasche wird an ihren Etikettfarben gezaehlt (#e8c46a / #d9a83c): das ist
  // die Datenquelle, das Bild kommt daneben.
  const bierPunkte = (wer) => `(() => {
    const c = document.getElementById('game'); const g = window.__roland.game;
    const a = ${JSON.stringify(wer)} === 'ramona'
      ? g.entities.find((e) => e.kind === 'ramona') : g.player;
    const x0 = Math.max(0, Math.round(a.x - g.cam.x) + 1), y0 = Math.max(0, Math.round(a.y - g.cam.y) + 1);
    const w = Math.min(c.width - x0, 26), h = Math.min(c.height - y0, 24);
    if (w <= 0 || h <= 0) return '0';
    const d = c.getContext('2d').getImageData(x0, y0, w, h).data;
    let punkte = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if ((Math.abs(r - 232) < 4 && Math.abs(gg - 196) < 4 && Math.abs(b - 106) < 4)
        || (Math.abs(r - 217) < 4 && Math.abs(gg - 168) < 4 && Math.abs(b - 60) < 4)) punkte++;
    }
    return String(punkte);
  })()`;

  await evaluate(`(() => { const g = window.__roland.game;
    const en = g.entities.find((e) => e.kind === 'ramona');
    g.player.x = en.x - 22; g.player.y = en.y + en.h - g.player.h; g.player.vx = 0; g.player.vy = 0; })()`);
  await sleep(700);
  const vorUebergabe = JSON.parse(await evaluate(`JSON.stringify({
    beiIhr: window.__roland.game.entities.find((e) => e.kind === 'ramona').bier,
    beiIhm: window.__roland.game.bierBeiIhm,
    label: window.__roland.aktiv.hud.label,
    punkteBeiIhr: ${bierPunkte('ramona')},
    punkteBeiIhm: ${bierPunkte('player')},
  })`));
  check('Epilog-Ramona-Browser: sie hat das Bier sichtbar in der Hand',
    vorUebergabe.beiIhr === true && vorUebergabe.beiIhm === false
      && Number(vorUebergabe.punkteBeiIhr) > 0,
    JSON.stringify(vorUebergabe));
  check('Epilog-Ramona-Browser: das Angebot ist eine AKTION mit E',
    !!vorUebergabe.label && /RAMONA/.test(vorUebergabe.label.text) && /BIER/.test(vorUebergabe.label.text)
      && vorUebergabe.label.action === true && vorUebergabe.label.key === 'E',
    JSON.stringify(vorUebergabe.label));
  await schussRom('screenshot-epilog-bier-ramona.png');

  await tippe(250);
  const uebergabeLaeuft = JSON.parse(await evaluate(`JSON.stringify({
    laeuft: window.__roland.game.bierUebergabe > 0 || window.__roland.game.bierBeiIhm,
  })`));
  check('Epilog-Ramona-Browser: der Druck loest die Uebergabe aus',
    uebergabeLaeuft.laeuft === true, JSON.stringify(uebergabeLaeuft));
  await sleep(420);          // mitten im Moment: die Flasche ist unterwegs
  await schussRom('screenshot-epilog-bier-unterwegs.png');
  await sleep(1000);
  const nachUebergabe = JSON.parse(await evaluate(`JSON.stringify({
    beiIhr: window.__roland.game.entities.find((e) => e.kind === 'ramona').bier,
    beiIhm: window.__roland.game.bierBeiIhm,
    punkteBeiIhr: ${bierPunkte('ramona')},
    punkteBeiIhm: ${bierPunkte('player')},
    hint: window.__roland.aktiv.hud.hint,
  })`));
  check('Epilog-Ramona-Browser: danach hat er es (Bier bei ihm)',
    nachUebergabe.beiIhm === true && nachUebergabe.beiIhr === false
      && Number(nachUebergabe.punkteBeiIhm) > 0,
    JSON.stringify(nachUebergabe));
  check('Epilog-Ramona-Browser: bei ihr ist die Flasche weg',
    Number(nachUebergabe.punkteBeiIhr) === 0, JSON.stringify(nachUebergabe));
  await schussRom('screenshot-epilog-bier-ihm.png');

  // Sitzen: er nimmt Platz, sie kommt dazu — der Abschluss folgt danach.
  await evaluate(`(() => { const g = window.__roland.game; const z = g.level.goal;
    g.player.x = z.x + 8; g.player.y = z.y + z.h - g.player.h; g.player.vx = 0; g.player.vy = 0; })()`);
  await sleep(600);
  await tippe(150);
  let sitzBild = null;
  for (let i = 0; i < 80; i++) {
    sitzBild = JSON.parse(await evaluate(`JSON.stringify({
      setzen: window.__roland.game.setzen,
      sitzAktiv: window.__roland.game.sitz !== null,
      sitzend: window.__roland.game.entities.find((e) => e.kind === 'ramona').sitzend,
      rx: window.__roland.game.entities.find((e) => e.kind === 'ramona').x,
      px: window.__roland.game.player.x,
      staat: window.__roland.game.state,
      bank: window.__roland.game.bankSitz,
    })`));
    if (sitzBild.sitzend === true && sitzBild.sitzAktiv === true) break;
    await sleep(60);
  }
  check('Epilog-Ramona-Browser: sie sitzt neben ihm auf der Bank',
    !!sitzBild && sitzBild.sitzend === true && sitzBild.sitzAktiv === true
      && sitzBild.rx > sitzBild.px
      && Math.abs(sitzBild.rx - (sitzBild.bank ? sitzBild.bank.rSeatX : -1)) <= 1,
    JSON.stringify(sitzBild));
  await schussRom('screenshot-epilog-sitzen.png');
  // Auftrag DRR-F3 (Rolands Playtest-Befund „Ramona sitzt hinter der Bank"):
  // Gemessen wird an genau den Pixeln, die die Sitzszene zeigt. Der Frame wird
  // viermal gezeichnet — ohne Figuren, ohne Bank, ohne beides, wie im Spiel —
  // und verglichen, welcher Figurenpixel dabei verschwindet. Kein Spielzustand
  // wird veraendert: drawEntities/drawPlayer/spr werden nur kurz getauscht.
  const bankDeckung = JSON.parse(await evaluate(`(() => {
    const g = window.__roland.game;
    const cv = document.getElementById('game'), ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const echteSpr = g.spr.bind(g);
    const leerCv = document.createElement('canvas'); leerCv.width = 32; leerCv.height = 10;
    const leer = { canvas: leerCv, solid: leerCv, w: 32, h: 10 };
    const zeichne = (mitFiguren, mitBank) => {
      if (!mitFiguren) { g.drawEntities = () => {}; g.drawPlayer = () => {}; }
      if (!mitBank) g.spr = (n, p) => (n === 'bank' ? leer : echteSpr(n, p));
      g.draw(ctx);
      if (!mitFiguren) { delete g.drawEntities; delete g.drawPlayer; }
      if (!mitBank) delete g.spr;
      return ctx.getImageData(0, 0, W, H).data.slice();
    };
    const nichts = zeichne(false, false);
    const nurBank = zeichne(false, true);
    const figuren = zeichne(true, false);
    const voll = zeichne(true, true);
    const ox = Math.round(g.cam.x), oy = Math.round(g.cam.y);
    const ziel = g.level.goal, bank = g.bankSitz;
    const rom = g.entities.find((e) => e.kind === 'ramona');
    const boxen = {
      region: { x: Math.round(bank.x - 10), y: Math.round(bank.boden - 26), w: 60, h: 30 },
      roland: { x: Math.round(g.player.x - 2), y: Math.round(g.player.y + g.player.h - 23), w: 16, h: 23 },
      ramona: { x: Math.round(rom.x - 1), y: Math.round(rom.y + rom.h - 19), w: 14, h: 19 },
      bank: { x: Math.round(ziel.x), y: Math.round(ziel.y + ziel.h - 10), w: 32, h: 10 },
    };
    const anders = (a, b, i) => a[i] !== b[i] || a[i+1] !== b[i+1] || a[i+2] !== b[i+2] || a[i+3] !== b[i+3];
    const aus = {};
    for (const [name, b] of Object.entries(boxen)) {
      let figur = 0, verdeckt = 0, bankPix = 0, bankSichtbar = 0;
      for (let y = Math.max(0, b.y - oy); y < Math.min(H, b.y - oy + b.h); y++) {
        for (let x = Math.max(0, b.x - ox); x < Math.min(W, b.x - ox + b.w); x++) {
          const i = (y * W + x) * 4;
          if (anders(figuren, nichts, i)) {
            figur++;
            if (anders(voll, figuren, i)) verdeckt++;
          }
          if (anders(nurBank, nichts, i)) {
            bankPix++;
            if (!anders(voll, nurBank, i)) bankSichtbar++;
          }
        }
      }
      aus[name] = { figur, verdeckt, bankPix, bankSichtbar };
    }
    return JSON.stringify(aus);
  })()`));
  check('Epilog-F3-Browser: die Bank verdeckt keinen Pixel der Sitzenden',
    bankDeckung.region.verdeckt === 0, JSON.stringify(bankDeckung.region));
  check('Epilog-F3-Browser: Ramona ist ganz zu sehen — die Bank liegt hinter ihr',
    bankDeckung.ramona.figur >= 130 && bankDeckung.ramona.verdeckt === 0,
    JSON.stringify(bankDeckung.ramona));
  check('Epilog-F3-Browser: die Bank bleibt im Bild (nicht weggeschoben)',
    bankDeckung.region.bankPix >= 100, JSON.stringify(bankDeckung.region));
  check('Epilog-F3-Browser: die Bank liegt hinter Ramona (sie verdeckt sie)',
    bankDeckung.ramona.bankPix >= 50 && bankDeckung.ramona.bankSichtbar < bankDeckung.ramona.bankPix,
    JSON.stringify(bankDeckung.ramona));
  // Danach laeuft der Abschluss wie gehabt: Ergebnis und Abspann-Knopf.
  let ende = null;
  for (let i = 0; i < 60; i++) {
    ende = JSON.parse(await evaluate(`JSON.stringify({
      staat: window.__roland.game.state,
      setzen: window.__roland.game.setzen,
      sitzend: window.__roland.game.entities.find((e) => e.kind === 'ramona').sitzend,
      reward: !document.getElementById('reward').classList.contains('hidden'),
    })`));
    if (ende.staat === 'complete') break;
    await sleep(120);
  }
  check('Epilog-Ramona-Browser: danach kommt der Abschluss wie gehabt',
    !!ende && ende.staat === 'complete' && ende.reward === true && ende.sitzend === true,
    JSON.stringify(ende));
  check('keine Fehler in Bier und Sitzszene',
    (await evaluate('JSON.stringify(window.__errors)')) === '[]', await evaluate('JSON.stringify(window.__errors)'));

  await evaluate("window.__roland.loadAct(0)");

  // --- Abspann im echten Browser (V3: Upload-Portraits als Filmfolge) ---------
  // Der Abspann ist eine Belohnung: ohne geschafften Epilog gibt es keinen Zugang.
  const abspannUrl = () => URL_TO_TEST + (URL_TO_TEST.includes('?') ? '&' : '?') + 'v=' + Date.now();
  await evaluate("localStorage.setItem('rasender-roland/v1', JSON.stringify({ v: 3, akt1: true, mappe: true, geschafft: { epilog: false } }))");
  await send('Page.navigate', { url: abspannUrl() });
  await sleep(2200);
  const abspannGesperrt = JSON.parse(await evaluate(`(() => {
    const b = document.getElementById('abspannTitleBtn');
    return JSON.stringify({ da: !!b, versteckt: b ? b.classList.contains('hidden') : null });
  })()`));
  check('Abspann-Browser: ohne geschafften Epilog bleibt der Zugang im Titel verborgen',
    abspannGesperrt.da === true && abspannGesperrt.versteckt === true, JSON.stringify(abspannGesperrt));

  await evaluate("localStorage.setItem('rasender-roland/v1', JSON.stringify({ v: 3, akt1: true, mappe: true, geschafft: { epilog: true } }))");
  await send('Page.navigate', { url: abspannUrl() });
  await sleep(2200);
  const abspannFrei = JSON.parse(await evaluate(`(() => {
    const b = document.getElementById('abspannTitleBtn');
    return JSON.stringify({ versteckt: b ? b.classList.contains('hidden') : null, text: (b.textContent || '').trim() });
  })()`));
  check('Abspann-Browser: nach dem Epilog ist er im Titel erreichbar',
    abspannFrei.versteckt === false, JSON.stringify(abspannFrei));

  // Bildpunkte im Portraitfeld zaehlen: Grund #0b0810 (11,8,16), Toleranz je Kanal.
  const abspannMessung = `(() => {
    const a = window.__roland.abspann;
    const cv = a.canvas;
    const g = cv.getContext('2d');
    const L = a.layout(a.seite);
    const feld = L.widmung || L.kacheln[0];
    const d = g.getImageData(feld.x, feld.y, feld.size, feld.size).data;
    let gemalt = 0, grund = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - 11) <= 3 && Math.abs(d[i + 1] - 8) <= 3 && Math.abs(d[i + 2] - 16) <= 3) grund++;
      else gemalt++;
    }
    const ganz = g.getImageData(0, 0, cv.width, cv.height).data;
    let seiteGemalt = 0;
    for (let i = 0; i < ganz.length; i += 4) {
      if (!(Math.abs(ganz[i] - 11) <= 3 && Math.abs(ganz[i + 1] - 8) <= 3 && Math.abs(ganz[i + 2] - 16) <= 3)) seiteGemalt++;
    }
    const kopf = g.getImageData(0, 0, cv.width, 36).data;
    let kopfPunkte = 0;
    for (let i = 0; i < kopf.length; i += 4) {
      if (!(Math.abs(kopf[i] - 11) <= 3 && Math.abs(kopf[i + 1] - 8) <= 3 && Math.abs(kopf[i + 2] - 16) <= 3)) kopfPunkte++;
    }
    return JSON.stringify({
      offen: a.offen, seite: a.seite, seiten: L.seiten,
      kacheln: L.kacheln.length,
      widmung: !!L.widmung,
      portrait: L.widmung ? L.widmung.portrait : L.kacheln[0].portrait,
      name: L.kacheln.length ? L.kacheln[0].name : null,
      feld: { x: feld.x, y: feld.y, size: feld.size },
      gemalt, grund, seiteGemalt, kopfPunkte,
      flaeche: feld.size * feld.size,
      raster: a.layout(0).kacheln[0].raster,
    });
  })()`;

  await echterKlick('#abspannTitleBtn');
  await sleep(500);
  const seite0 = JSON.parse(await evaluate(abspannMessung));
  check('Abspann-Browser: der Abspann oeffnet sich aus dem Titel',
    seite0.offen === true && seite0.seite === 0 && seite0.seiten === 10, JSON.stringify(seite0));
  check('Abspann-Browser: Seite 1 zeigt genau ein Portrait (ANNA) mit Vorname darunter',
    seite0.kacheln === 1 && seite0.portrait === 'anna' && seite0.name === 'ANNA'
      && seite0.raster === 'bild' && seite0.feld.size === 96,
    JSON.stringify({ kacheln: seite0.kacheln, portrait: seite0.portrait, name: seite0.name, groesse: seite0.feld.size }));
  // Der helle Kachelhintergrund der Vorlage darf nicht mitgekommen sein: das
  // Portraitfeld ist zu rund 35-75 % bemalt, nicht vollflaechig.
  const anteil0 = seite0.gemalt / seite0.flaeche;
  check('Abspann-Browser: der Vorlagenhintergrund ist durchsichtig (kein helles Feld)',
    anteil0 > 0.3 && anteil0 < 0.8,
    `${(anteil0 * 100).toFixed(1)} % bemalt (${seite0.gemalt} von ${seite0.flaeche})`);

  const shotDirAb = fileURLToPath(new URL('../.artifacts/', import.meta.url));
  mkdirSync(shotDirAb, { recursive: true });
  const abPortraitPfad = join(shotDirAb, 'abspann-portrait.png');
  writeFileSync(abPortraitPfad, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  results.push(`SCREENSHOT ${abPortraitPfad}`);

  // --- F2: die Namen liegen in der DOM-Textebene, nicht mehr im Bild ---------
  // Rolands Befund (13.09.): „Die Namen in den Credits sind unleserlich
  // verpixelt." Deshalb: Namentext als DOM-Beschriftung in echter Aufloesung,
  // und das Namensband der Leinwand muss leer sein.
  const abspannTextMessung = `(() => {
    const a = window.__roland.abspann;
    const cv = a.canvas;
    const r = cv.getBoundingClientRect();
    const L = a.layout(a.seite);
    const feld = L.widmung || L.kacheln[0];
    const name = L.widmung ? L.widmung.text : (L.kacheln[0] ? L.kacheln[0].name : null);
    const ebene = a.texteEbene;
    const kinder = ebene ? [...ebene.querySelectorAll('.game-text-label')] : [];
    const g = cv.getContext('2d');
    const boxY = feld.nameBoxY !== undefined ? feld.nameBoxY : feld.y + feld.size;
    const boxH = feld.nameBoxH !== undefined ? feld.nameBoxH : 22;
    const d = g.getImageData(0, boxY, cv.width, boxH).data;
    let canvasPunkte = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (!(Math.abs(d[i] - 11) <= 3 && Math.abs(d[i + 1] - 8) <= 3 && Math.abs(d[i + 2] - 16) <= 3)) canvasPunkte++;
    }
    const masse = kinder.map((el) => {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { id: el.dataset.textId, text: el.textContent, font: parseFloat(cs.fontSize),
        schrift: cs.fontFamily, farbe: cs.color, sichtbar: b.width > 0 && b.height > 0,
        links: Math.round(b.left * 100) / 100, oben: Math.round(b.top * 100) / 100,
        rechts: Math.round(b.right * 100) / 100, unten: Math.round(b.bottom * 100) / 100,
        breite: Math.round(b.width * 100) / 100, hoehe: Math.round(b.height * 100) / 100 };
    });
    return JSON.stringify({
      offen: a.offen, seite: a.seite, name, ebeneDA: !!ebene, id: ebene ? ebene.id : null,
      anzahl: kinder.length, texte: masse, canvasPunkte,
      canvas: { links: r.left, oben: r.top, rechts: r.right, unten: r.bottom,
        breite: Math.round(r.width * 100) / 100, hoehe: Math.round(r.height * 100) / 100,
        logischW: cv.width, logischH: cv.height,
        skalierung: Math.round((r.width / cv.width) * 10000) / 10000 },
      portraitUnten: r.top + (feld.y + feld.size) * (r.height / cv.height),
      nameBoxY: boxY, nameBoxH: boxH,
    });
  })()`;

  const seite0Text = JSON.parse(await evaluate(abspannTextMessung));
  check('Abspann-Browser: der Vorname steht als DOM-Text ueber der Leinwand',
    seite0Text.ebeneDA === true && seite0Text.id === 'abspannTextLayer' && seite0Text.anzahl === 1
      && seite0Text.texte[0]?.id === 'abspann-name' && seite0Text.texte[0]?.text === 'ANNA'
      && seite0Text.texte[0]?.sichtbar === true,
    JSON.stringify({ ebene: seite0Text.ebeneDA, id: seite0Text.id, anzahl: seite0Text.anzahl, texte: seite0Text.texte }));
  check('Abspann-Browser: das Namensband der Leinwand ist leer (kein Text mehr im Bild)',
    seite0Text.canvasPunkte === 0,
    `${seite0Text.canvasPunkte} Bildpunkte im Band y=${seite0Text.nameBoxY}..${seite0Text.nameBoxY + seite0Text.nameBoxH}`);
  check('Abspann-Browser: die Namensschrift haelt den 12-CSS-Pixel-Boden und den Monospace-Stack',
    !!seite0Text.texte[0] && seite0Text.texte[0].font >= 12
      && /monospace/i.test(seite0Text.texte[0].schrift)
      && seite0Text.texte[0].hoehe >= 12,
    JSON.stringify({ font: seite0Text.texte[0]?.font, schrift: seite0Text.texte[0]?.schrift,
      hoehe: seite0Text.texte[0]?.hoehe }));
  check('Abspann-Browser: der Name sitzt unter dem Portrait und innerhalb der Leinwand',
    !!seite0Text.texte[0]
      && seite0Text.texte[0].oben >= seite0Text.portraitUnten - 0.5
      && seite0Text.texte[0].links >= seite0Text.canvas.links - 0.5
      && seite0Text.texte[0].rechts <= seite0Text.canvas.rechts + 0.5
      && seite0Text.texte[0].unten <= seite0Text.canvas.unten + 0.5,
    JSON.stringify({ text: seite0Text.texte[0], portraitUnten: seite0Text.portraitUnten, canvas: seite0Text.canvas }));
  // Bildbeweis der Namenszeile: Ausschnitt genau der Namensbox.
  const namenClip = {
    x: seite0Text.canvas.links, y: seite0Text.portraitUnten, width: seite0Text.canvas.breite,
    height: Math.max(12, seite0Text.nameBoxH * (seite0Text.canvas.hoehe / (seite0Text.canvas.logischH || 216))),
  };
  const abNamePfad = join(shotDirAb, 'abspann-namenszeile.png');
  writeFileSync(abNamePfad, Buffer.from((await send('Page.captureScreenshot', {
    format: 'png', clip: { x: namenClip.x, y: namenClip.y, width: namenClip.width, height: namenClip.height, scale: 1 },
  })).data, 'base64'));
  const abNameRandPfad = fileURLToPath(new URL('../screenshot-abspann-namenszeile.png', import.meta.url));
  writeFileSync(abNameRandPfad, Buffer.from((await send('Page.captureScreenshot', {
    format: 'png', clip: { x: namenClip.x, y: namenClip.y, width: namenClip.width, height: namenClip.height, scale: 1 },
  })).data, 'base64'));
  results.push(`SCREENSHOT ${abNamePfad}`);
  results.push(`SCREENSHOT ${abNameRandPfad}`);
  // Der Klick auf die Leinwand muss weiterblaettern — die Textebene darf ihn
  // nicht schlucken (pointer-events: none).
  const klickPunkt = seite0Text.texte[0]
    ? { x: Math.round((seite0Text.texte[0].links + seite0Text.texte[0].rechts) / 2),
      y: Math.round((seite0Text.texte[0].oben + seite0Text.texte[0].unten) / 2) }
    : null;
  if (klickPunkt) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: klickPunkt.x, y: klickPunkt.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: klickPunkt.x, y: klickPunkt.y, button: 'left', clickCount: 1 });
  }
  await sleep(250);
  const nachKlickAufName = JSON.parse(await evaluate(abspannTextMessung));
  check('Abspann-Browser: ein Klick auf den Namen blaettert weiter (Textebene schluckt keine Klicks)',
    !!klickPunkt && nachKlickAufName.seite === 1 && nachKlickAufName.anzahl === 1
      && nachKlickAufName.texte[0].text === 'NICOLA' && nachKlickAufName.canvasPunkte === 0,
    JSON.stringify({ klickPunkt, seite: nachKlickAufName.seite, texte: nachKlickAufName.texte.map((t) => t.text) }));
  // Zurueck auf Seite 1 fuer die Filmfolge weiter unten: der Abspann blaettert
  // im Kreis — deshalb hier nicht klick-zählen, sondern auf die Seite warten.
  let zurueckKlicks = 0;
  while (zurueckKlicks < 11 && (await evaluate('window.__roland.abspann.seite')) !== 0) {
    await echterKlick('#abspannWeiter');
    await sleep(110);
    zurueckKlicks++;
  }
  const wiederSeite1 = JSON.parse(await evaluate(abspannTextMessung));
  check('Abspann-Browser: nach zehn Seiten blaettert der Abspann zurueck auf Seite 1',
    wiederSeite1.seite === 0 && wiederSeite1.texte[0]?.text === 'ANNA' && wiederSeite1.canvasPunkte === 0,
    JSON.stringify({ seite: wiederSeite1.seite, klicks: zurueckKlicks, texte: wiederSeite1.texte.map((t) => t.text) }));

  // Filmfolge: WEITER blaettert Portrait fuer Portrait, jedes anders.
  const abspannGesehen = [seite0.portrait];
  const abspannBemalt = [seite0.gemalt];
  const abspannNamenDom = [];
  const abspannNamenImBild = [];
  let kleinsteSchrift = Infinity;
  for (let i = 1; i < 10; i++) {
    await echterKlick('#abspannWeiter');
    await sleep(220);
    const s = JSON.parse(await evaluate(abspannMessung));
    if (s.seite !== i) { check(`Abspann-Browser: WEITER erreicht Seite ${i + 1}`, false, JSON.stringify(s)); break; }
    abspannGesehen.push(s.portrait);
    abspannBemalt.push(s.gemalt);
    // F2: jede Seite traegt ihren Namen in der Textebene — und keiner im Bild.
    const st = JSON.parse(await evaluate(abspannTextMessung));
    abspannNamenDom.push(st.texte.map((t) => t.text).join('+'));
    abspannNamenImBild.push(st.canvasPunkte);
    for (const t of st.texte) kleinsteSchrift = Math.min(kleinsteSchrift, t.font);
    if (i === 9) {
      check('Abspann-Browser: die letzte Seite ist die Widmung an den Geehrten',
        s.widmung === true && s.kacheln === 0 && s.portrait === 'roland-s',
        JSON.stringify({ kacheln: s.kacheln, widmung: s.widmung, portrait: s.portrait }));
      const abWidmungPfad = join(shotDirAb, 'abspann-widmung.png');
      writeFileSync(abWidmungPfad, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      results.push(`SCREENSHOT ${abWidmungPfad}`);
      const widmungText = await evaluate(`(() => {
        const t = window.__roland.abspann.layout(9).widmung;
        return t ? t.text : null;
      })()`);
      check('Abspann-Browser: die Widmung nennt Roland Schreiber',
        widmungText === 'FÜR ROLAND SCHREIBER', String(widmungText));
      const wAnteil = s.gemalt / s.flaeche;
      check('Abspann-Browser: auch das Widmungsportrait ist freigestellt',
        wAnteil > 0.3 && wAnteil < 0.8, `${(wAnteil * 100).toFixed(1)} % bemalt`);
    }
    // Titel und Hinweis bleiben auf jeder Seite im Bild (Kopfband y=0..36).
    if (s.kopfPunkte < 60) {
      check(`Abspann-Browser: Seite ${i + 1} zeigt Titel und Ueberschrift`, false, JSON.stringify(s));
      break;
    }
  }
  check('Abspann-Browser: neun verschiedene Portraits in der Filmfolge',
    new Set(abspannGesehen.slice(0, 9)).size === 9, abspannGesehen.join(' -> '));
  // Der Filmfolge-Lauf hat die Seiten 2 bis 10 gesehen (Seite 1 kam davor).
  const erwarteteNamen = [...abspannNamen().slice(1), 'FÜR ROLAND SCHREIBER'];
  check('Abspann-Browser: jede Seite traegt ihren Namentext in der Textebene (Seite 2 bis 10)',
    JSON.stringify(abspannNamenDom) === JSON.stringify(erwarteteNamen),
    JSON.stringify(abspannNamenDom));
  check('Abspann-Browser: auf keiner Seite liegt noch ein Name im Bild',
    abspannNamenImBild.length === 9 && abspannNamenImBild.every((n) => n === 0)
      && seite0Text.canvasPunkte === 0,
    JSON.stringify({ seite1: seite0Text.canvasPunkte, weitere: abspannNamenImBild }));
  check('Abspann-Browser: die Namensschrift bleibt auf allen Seiten mindestens 12 CSS-Pixel',
    kleinsteSchrift >= 12 && Number.isFinite(kleinsteSchrift), `${kleinsteSchrift} CSS-px`);
  check('Abspann-Browser: die Widmungsseite traegt ihren Text als DOM-Beschriftung',
    abspannNamenDom[8] === 'FÜR ROLAND SCHREIBER', JSON.stringify(abspannNamenDom[8]));
  check('Abspann-Browser: jede Portraitseite malt Bildpunkte',
    abspannBemalt.slice(0, 9).every((n) => n > 2000), abspannBemalt.join(','));
  check('Abspann-Browser: keine Fehler im Abspann',
    (await evaluate('JSON.stringify(window.__errors)')) === '[]', await evaluate('JSON.stringify(window.__errors)'));

  // Rueckweg: ZURUECK fuehrt in den Titel, ESC ebenso — kein Sackgassenbildschirm.
  await echterKlick('#abspannZurueck');
  await sleep(400);
  const nachZurueck = JSON.parse(await evaluate(`JSON.stringify({
    abspannOffen: window.__roland.abspann.offen,
    titelOffen: !document.getElementById('title').classList.contains('hidden'),
    knopfText: document.getElementById('abspannZurueck').textContent
  })`));
  check('Abspann-Browser: ZURUECK ZUM TITEL schliesst den Abspann und zeigt den Titel',
    nachZurueck.abspannOffen === false && nachZurueck.titelOffen === true,
    JSON.stringify(nachZurueck));
  check('Abspann-Browser: der Rueckweg ist als Titel-Rueckweg beschriftet',
    /TITEL/.test(String(nachZurueck.knopfText)), String(nachZurueck.knopfText));

  await echterKlick('#abspannTitleBtn');
  await sleep(400);
  await key('Escape', 'keyDown');
  await key('Escape', 'keyUp');
  await sleep(300);
  const nachEsc = JSON.parse(await evaluate(`JSON.stringify({
    abspannOffen: window.__roland.abspann.offen,
    titelOffen: !document.getElementById('title').classList.contains('hidden')
  })`));
  check('Abspann-Browser: ESC schliesst den Abspann',
    nachEsc.abspannOffen === false && nachEsc.titelOffen === true, JSON.stringify(nachEsc));

  // --- Musik im echten Browser -------------------------------------------
  // Kein Tonvergleich (nicht messbar), aber: vor dem Start darf gar kein
  // AudioContext entstehen, nach dem Start muss er laufen, der Stationswechsel
  // muss ohne Konsolenfehler durchlaufen und der Node-Haushalt klein bleiben.
  await evaluate("localStorage.setItem('rasender-roland/v1', JSON.stringify({ akt1: true, station: 'akt1' }))");
  await send('Page.navigate', { url: URL_TO_TEST + (URL_TO_TEST.includes('?') ? '&' : '?') + 'v=' + Date.now() });
  await sleep(2200);
  const vorStart = JSON.parse(await evaluate(`JSON.stringify({
    kontext: window.__roland.musik.kontextZustand(),
    motiv: window.__roland.musik.aktuellesMotiv(),
    bereit: window.__roland.musikBereit,
    schalter: !!document.getElementById('musikBtn'),
    regler: document.getElementById('musikVol') ? document.getElementById('musikVol').type : 'keiner'
  })`));
  check('Vor dem Start entsteht kein AudioContext (kein Ton vor der ersten Nutzeraktion)',
    vorStart.kontext === 'kein-kontext' && vorStart.motiv === null && vorStart.bereit === false,
    JSON.stringify(vorStart));
  check('Musik hat einen eigenen Schalter und Regler (getrennt vom Ton)',
    vorStart.schalter === true && vorStart.regler === 'range', JSON.stringify(vorStart));

  // Echter Mausklick auf START, dann auf die erste Garderoben-Karte.
  let geste = 'Maus';
  await echterKlick('#startBtn');
  await sleep(450);
  let gardeOffen = (await evaluate("!document.getElementById('garde').classList.contains('hidden')"));
  if (!gardeOffen) { geste = 'Rückfallebene mit Nutzeraktion'; await evaluateMitGeste("document.getElementById('startBtn').click()"); await sleep(300); }
  await echterKlick('#gardeCards button');
  await sleep(500);
  let aktivDa = (await evaluate('!!window.__roland.aktiv'));
  if (!aktivDa) { geste = 'Rückfallebene mit Nutzeraktion'; await evaluateMitGeste("document.querySelectorAll('#gardeCards button')[0].click()"); await sleep(400); }

  let kontextZustand = 'kein-kontext';
  for (let i = 0; i < 12; i++) {
    kontextZustand = await evaluate('window.__roland.musik.kontextZustand()');
    if (kontextZustand === 'running') break;
    await sleep(150);
  }
  const nachStart = JSON.parse(await evaluate(`JSON.stringify({
    kontext: window.__roland.musik.kontextZustand(),
    motiv: window.__roland.musik.aktuellesMotiv(),
    bereit: window.__roland.musikBereit,
    laeuft: window.__roland.musik.laeuft(),
    knoten: window.__roland.musik.offeneKnoten(),
    knopf: document.getElementById('musikBtn').textContent
  })`));
  check('Audio-Kontext ist nach dem Start aktiv',
    nachStart.kontext === 'running', `${JSON.stringify(nachStart)} (Weg: ${geste})`);
  check('Musik spielt das Motiv der geladenen Station',
    nachStart.motiv === 'akt1' && nachStart.laeuft === true && nachStart.bereit === true,
    JSON.stringify(nachStart));
  check('Der Node-Haushalt bleibt klein (keine hängenden Audio-Nodes)',
    nachStart.knoten > 0 && nachStart.knoten <= 48, `${nachStart.knoten} Nodes`);

  // Jede Station durchschalten: Motiv folgt, keine Konsolenfehler, kein Wachstum.
  const musikWechsel = [];
  const anzahlStationen = await evaluate('window.__roland.levelCount');
  for (let i = 0; i < anzahlStationen; i++) {
    await evaluate(`(() => {
      window.__errors.length = 0;
      window.__roland.loadAct(${i});
      document.getElementById('startBtn').click();
      return 1;
    })()`);
    await sleep(260);
    if ((await evaluate("window.__roland.level.mode")) !== 'racer') {
      await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
      await sleep(260);
    }
    musikWechsel.push({
      id: await evaluate('window.__roland.level.id'),
      motiv: await evaluate('window.__roland.musik.aktuellesMotiv()'),
      knoten: await evaluate('window.__roland.musik.offeneKnoten()'),
      fehler: await evaluate('JSON.stringify(window.__errors)'),
    });
  }
  check('Stationswechsel ohne Konsolenfehler',
    musikWechsel.every((w) => w.fehler === '[]'),
    musikWechsel.filter((w) => w.fehler !== '[]').map((w) => `${w.id}: ${w.fehler}`).join(' | '));
  check('Jede Station bekommt ihr eigenes Motiv',
    musikWechsel.every((w) => w.motiv === w.id),
    musikWechsel.map((w) => `${w.id}->${w.motiv}`).join(' | '));
  const maxKnoten = Math.max(...musikWechsel.map((w) => w.knoten));
  check('Die Nodes sammeln sich beim Wechseln nicht an',
    maxKnoten <= 64, `${maxKnoten} Nodes nach ${musikWechsel.length} Wechseln`);

  // Schalter: Musik getrennt stumm, Lautstärke, Zustand im Spielstand.
  await evaluate("document.getElementById('musikBtn').click()");
  await sleep(200);
  const stumm = JSON.parse(await evaluate(`JSON.stringify({
    text: document.getElementById('musikBtn').textContent,
    stumm: window.__roland.musik.istStumm(),
    pegel: window.__roland.musik.effektiveLautstaerke(),
    gespeichert: JSON.parse(localStorage.getItem('rasender-roland/v1') || '{}').musik
  })`));
  check('Musik lässt sich getrennt abschalten und merkt sich das',
    stumm.stumm === true && stumm.pegel === 0 && stumm.gespeichert === false,
    JSON.stringify(stumm));
  await evaluate("document.getElementById('musikBtn').click()");
  await evaluate(`(() => {
    const v = document.getElementById('musikVol');
    v.value = '30';
    v.dispatchEvent(new Event('input'));
    return 1;
  })()`);
  await sleep(200);
  const laut = JSON.parse(await evaluate(`JSON.stringify({
    laut: window.__roland.musik.lautstaerke(),
    effektiv: window.__roland.musik.effektiveLautstaerke(),
    regler: document.getElementById('musikVol').value,
    gespeichert: JSON.parse(localStorage.getItem('rasender-roland/v1') || '{}').musikLaut,
    tonAus: JSON.parse(localStorage.getItem('rasender-roland/v1') || '{}').sound
  })`));
  check('Musiklautstärke wirkt und steht im Spielstand',
    Math.abs(laut.laut - 0.3) < 1e-9 && Math.abs(laut.effektiv - 0.3) < 1e-9
      && laut.regler === '30' && Math.abs(laut.gespeichert - 0.3) < 1e-9
      && laut.tonAus === undefined,
    JSON.stringify(laut));

  // Zurück ins Menü: die Musik verstummt und gibt ihre Nodes frei.
  const nachQuit = JSON.parse(await evaluate(`(() => {
    document.getElementById('quitBtn').click();
    const m = window.__roland.musik;
    m.stop();
    return JSON.stringify({ knoten: m.offeneKnoten(), laeuft: m.laeuft(), kontext: m.kontextZustand() });
  })()`));
  check('Musikstopp gibt alle Nodes frei, ohne den Kontext zu verlieren',
    nachQuit.knoten === 0 && nachQuit.laeuft === false && nachQuit.kontext === 'running',
    JSON.stringify(nachQuit));
  check('keine Fehler in der Musikprüfung',
    (await evaluate('JSON.stringify(window.__errors)')) === '[]',
    await evaluate('JSON.stringify(window.__errors)'));

  // --- Smartphone: Grilltexte im echten Hoch-/Querformat --------------------
  await pruefeGrilltexteMobil();

  // --- Smartphone: Geräteemulation, Layout und Touch-Steuerung ---------------
  // Ausdrücklich auf Akt 1 setzen: der Abschnitt prüft die Lauf-Steuerung und
  // darf nicht davon abhängen, wo der vorige Block den Spielstand gelassen hat.
  await evaluate("localStorage.setItem('rasender-roland/v1', JSON.stringify({ akt1: true, station: 'akt1' }))");
  await send('Emulation.setDeviceMetricsOverride', {
    width: 412, height: 892, deviceScaleFactor: 2.6, mobile: true,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: URL_TO_TEST + (URL_TO_TEST.includes('?') ? '&' : '?') + 'v=' + Date.now() });
  await sleep(2000);
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(300);
  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(600);

  const mobile = JSON.parse(await evaluate(`(() => {
    const c = document.getElementById('game').getBoundingClientRect();
    const pad = document.getElementById('pad');
    const stick = document.getElementById('stick').getBoundingClientRect();
    const btn = document.getElementById('btnJump').getBoundingClientRect();
    return JSON.stringify({
      padSichtbar: pad.classList.contains('show'),
      canvasPasst: c.width <= window.innerWidth + 1 && c.height <= window.innerHeight + 1,
      canvasBreite: Math.round(c.width),
      fensterBreite: window.innerWidth,
      stickGroesse: Math.round(stick.width),
      knopfHoehe: Math.round(btn.height),
      state: window.__roland.game.state
    });
  })()`));
  check('Touch-Pad erscheint auf dem Smartphone', mobile.padSichtbar === true, JSON.stringify(mobile));
  const zoom = JSON.parse(await evaluate(`JSON.stringify({ vw: window.__roland.game.vw, vh: window.__roland.game.vh })`));
  check('Am Handy ist die Kamera enger (Zoom statt Briefmarke)', zoom.vw <= 288 && zoom.vh <= 162,
    JSON.stringify(zoom));
  check('Spielfeld passt ins Hochformat', mobile.canvasPasst === true,
    `${mobile.canvasBreite}px in ${mobile.fensterBreite}px`);
  check('Stick ist groß genug zum Treffen', mobile.stickGroesse >= 88, `${mobile.stickGroesse}px`);
  check('Sprungknopf hat Fingergröße', mobile.knopfHoehe >= 44, `${mobile.knopfHoehe}px`);

  // Stick ziehen: Spieler muss laufen
  const mRect = JSON.parse(await evaluate(`(() => { const r = document.getElementById('stick').getBoundingClientRect();
    return JSON.stringify({x: r.left + r.width/2, y: r.top + r.height/2}); })()`));
  const mx0 = await evaluate('window.__roland.game.player.x');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mRect.x, y: mRect.y, button: 'left', clickCount: 1, pointerType: 'touch' });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mRect.x + 34, y: mRect.y, button: 'left', buttons: 1, pointerType: 'touch' });
  await sleep(700);
  const stickAchse = await evaluate('window.__roland.input.state.stick.x');
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mRect.x + 34, y: mRect.y, button: 'left', pointerType: 'touch' });
  await sleep(150);
  const mx1 = await evaluate('window.__roland.game.player.x');
  check('Stick steuert die Achse', stickAchse > 0.3, `stick.x=${stickAchse}`);
  check('Stick bewegt den Spieler', mx1 - mx0 > 30, `dx=${(mx1 - mx0).toFixed(0)}`);
  check('keine Fehler im Smartphone-Modus',
    (await evaluate('JSON.stringify(window.__errors)')) === '[]', await evaluate('JSON.stringify(window.__errors)'));
  results.push(`MOBIL ${mobile.canvasBreite}px Spielfeld, Stick ${mobile.stickGroesse}px, Knopf ${mobile.knopfHoehe}px`);

  // Querformat: muss den Platz deutlich besser ausnutzen
  await send('Emulation.setDeviceMetricsOverride', {
    width: 892, height: 412, deviceScaleFactor: 2.6, mobile: true,
  });
  await sleep(700);
  const land = JSON.parse(await evaluate(`(() => {
    const c = document.getElementById('game').getBoundingClientRect();
    return JSON.stringify({
      w: Math.round(c.width), h: Math.round(c.height),
      fensterW: window.innerWidth, fensterH: window.innerHeight,
      drehHinweis: getComputedStyle(document.querySelector('.rotate')).display !== 'none'
    });
  })()`));
  check('Querformat nutzt die Höhe aus', land.h >= 340 && land.h <= land.fensterH,
    `${land.w}x${land.h} in ${land.fensterW}x${land.fensterH}`);
  const gross = JSON.parse(await evaluate(`JSON.stringify({
    hoch: Math.round(window.__roland.game.player.h * ${mobile.canvasBreite} / window.__roland.game.vw),
    quer: Math.round(window.__roland.game.player.h * ${land.w} / window.__roland.game.vw),
    scale: window.__roland.scale
  })`));
  check('Figur ist am Handy groß genug zum Erkennen', gross.quer >= 40 && gross.hoch >= 26,
    `Figur quer ${gross.quer}px, hoch ${gross.hoch}px (Maßstab ${gross.scale})`);
  check('Im Querformat ist die Figur größer als im Hochformat', gross.quer > gross.hoch,
    `${gross.quer}px vs ${gross.hoch}px`);
  check('Dreh-Hinweis verschwindet im Querformat', land.drehHinweis === false);
  results.push(`QUER ${land.w}x${land.h} in ${land.fensterW}x${land.fensterH}`);
} catch (e) {
  if (e !== GEZIELTER_ABSCHLUSS) check('Browserprüfung ohne Abbruch', false, e.message);
} finally {
  try { ws.close(); } catch { /* egal */ }
  chrome.kill('SIGKILL');
  // Profil wegräumen: jeder Lauf legt hier ~120 MB im tmpfs ab. Nach dem SIGKILL
  // schreibt das Kind noch Reste nach, deshalb kurz warten und zweimal löschen.
  await new Promise((r) => setTimeout(r, 400));
  for (let i = 0; i < 2; i++) {
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* egal */ }
  }
}

console.log(results.join('\n'));
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.filter((r) => /^(PASS|FAIL)/.test(r)).length} Browser-Checks bestanden`);
console.log(`Gesamtlaufzeit ${((Date.now() - laufStart) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
