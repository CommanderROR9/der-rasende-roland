// tests/browser-smoke.mjs — prüft das echte Spiel in einem echten Browser.
// Startet Chromium headless, steuert es über das DevTools-Protokoll, prüft
// Laden, Start, Umziehen, Tastatur, Rendering und Fehlerfreiheit und legt einen
// Screenshot ab. Aufruf: node tests/browser-smoke.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_TO_TEST = process.argv[2] || 'http://127.0.0.1:8123/';
const PORT = 9333;
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
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1280,720', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}
async function key(code, type) {
  const map = { KeyD: [68, 'd'], KeyA: [65, 'a'], Space: [32, ' '], KeyE: [69, 'e'], KeyP: [80, 'p'] };
  const [vk, k] = map[code];
  await send('Input.dispatchKeyEvent', {
    type, code, key: k, text: type === 'char' ? k : undefined,
    windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
  });
}

try {
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: URL_TO_TEST });
  await sleep(2200);

  check('Seite geladen', (await evaluate('document.readyState')) === 'complete');
  check('Titel gesetzt', (await evaluate('document.title')) === 'Der Rasende Roland');
  check('Fehlersammler installiert', Array.isArray(await evaluate('window.__errors')));
  check('Spielmodul geladen', (await evaluate('typeof window.__roland')) === 'object');
  check('Startübersicht sichtbar',
    (await evaluate("!document.getElementById('title').classList.contains('hidden')")) === true);

  await evaluate("document.getElementById('startBtn').click()");
  await sleep(400);
  const options = await evaluate("JSON.stringify([...document.querySelectorAll('#gardeCards button .title')].map(e=>e.textContent))");
  check('Kleiderwahl zeigt drei Klüfte', JSON.parse(options).length === 3, options);
  check('Meldet SCHWARZ, ANZUG und FRACK',
    ['SCHWARZ', 'ANZUG', 'FRACK'].every((k) => options.includes(k)), options);

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

  // Kleiderständer: beim Betreten öffnet sich die Umkleide
  await key('KeyD', 'keyDown');
  let wardrobe = false;
  for (let i = 0; i < 40 && !wardrobe; i++) {
    await sleep(100);
    wardrobe = (await evaluate('window.__roland.game.state')) === 'paused';
  }
  await key('KeyD', 'keyUp');
  const wardrobeState = JSON.parse(await evaluate(`JSON.stringify({
    reason: window.__roland.game.pauseReason,
    overlay: !document.getElementById('garde').classList.contains('hidden'),
    options: [...document.querySelectorAll('#gardeCards button .title')].map(e=>e.textContent)
  })`));
  check('Kleiderständer öffnet die Umkleide', wardrobe && wardrobeState.reason === 'stand',
    JSON.stringify(wardrobeState));
  check('Umkleide zeigt die Klüfte zur Wahl', wardrobeState.options.length === 3,
    JSON.stringify(wardrobeState.options));

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
    const out = [];
    for (let by=0; by<8; by++) for (let bx=0; bx<8; bx++) {
      let s = 0; const x0 = bx*48, y0 = by*27;
      for (let y=y0; y<y0+27; y++) for (let x=x0; x<x0+48; x+=2) {
        const i = (y*384+x)*4;
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
    const ctx = document.getElementById('game').getContext('2d');
    const wx = Math.round(p.x - g.cam.x), wy = Math.round(p.y - g.cam.y);
    const d = ctx.getImageData(0,0,384,216).data;
    const at = (x,y) => { const i=(y*384+x)*4; return [d[i],d[i+1],d[i+2]]; };
    // Hautpixel in der Figurbox zählen
    let haut = 0;
    for (let y=wy;y<wy+16;y++) for (let x=wx-2;x<wx+14;x++) {
      if (x<0||y<0||x>=384||y>=216) continue;
      const [r,gg,bb] = at(x,y);
      if (Math.abs(r-0xe8)<=20 && Math.abs(gg-0xb9)<=20 && Math.abs(bb-0x8a)<=20) haut++;
    }
    // Bodenkachel unter den Füßen
    const ftx = Math.floor((p.x + p.w/2)/16), fty = Math.floor((p.y + p.h + 2)/16);
    const bx = ftx*16 - Math.round(g.cam.x) + 8, by = fty*16 - Math.round(g.cam.y) + 8;
    const boden = (bx>=0 && by>=0 && bx<384 && by<216) ? at(bx,by) : null;
    return JSON.stringify({haut, boden, wx, wy, ftx, fty, tile: g.grid[fty][ftx]});
  })()`));
  check('Spielfigur ist im Framebuffer sichtbar', look.haut >= 6, JSON.stringify(look));
  const bodenOk = look.boden && look.boden[0] <= 0x50 && look.boden[1] <= 0x48 && look.boden[2] <= 0x70;
  check('Bodenkachel unter der Figur ist gezeichnet', look.tile === 1 && bodenOk,
    JSON.stringify(look));

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
  const shotPath = '/tmp/roland-browser.png';
  writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  check('Screenshot geschrieben', existsSync(shotPath));
  results.push(`SCREENSHOT ${shotPath}`);
  results.push(`MODUS ${await evaluate("document.getElementById('pad').classList.contains('show') ? 'touch-pad sichtbar' : 'tastatur'")}`);
} catch (e) {
  check('Browserprüfung ohne Abbruch', false, e.message);
} finally {
  try { ws.close(); } catch { /* egal */ }
  chrome.kill('SIGKILL');
}

console.log(results.join('\n'));
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.filter((r) => /^(PASS|FAIL)/.test(r)).length} Browser-Checks bestanden`);
process.exit(failed ? 1 : 0);
