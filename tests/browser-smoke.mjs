// tests/browser-smoke.mjs — prüft das echte Spiel in einem echten Browser.
// Startet Chromium headless, steuert es über das DevTools-Protokoll, prüft
// Laden, Start, Umziehen, Tastatur, Rendering und Fehlerfreiheit und legt einen
// Screenshot ab. Aufruf: node tests/browser-smoke.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_TO_TEST = process.argv[2] || 'http://127.0.0.1:8123/';
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
  check('Stationswahl ist zu Beginn verborgen',
    (await evaluate("document.getElementById('actRow').classList.contains('hidden')")) === true);
  const diffStart = await evaluate("document.getElementById('diffBtn').textContent");
  check('Standard-Schwierigkeit ist gemütlich', diffStart.includes('GEMÜTLICH'), diffStart);
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

  // Das Dirigentenpult (DRR-04): drei Takte im Takt ergeben den ersten Einsatz, und
  // erst danach gibt die Bühnentür den Akt frei.
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
  check('Akt 2: danach gibt die Bühnentür den Akt frei', einsatz.zielFrei === true, JSON.stringify(einsatz));

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

  await evaluate("window.__roland.loadAct(0)");

  // --- Cabrio-Interludium im Browser --------------------------------------
  await evaluate("window.__roland.loadAct(2)");
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(900);
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
  // --- Akt 4: Orchestergraben ---------------------------------------------
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

  // --- Motorrad-Interludium (Nachtfahrt) — Heimweg nach dem Finale ---------
  await evaluate(`window.__roland.loadAct(${idxVon('MOTORRAD')})`);
  await evaluate("document.getElementById('startBtn').click()");
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

  const nachtBild = JSON.parse(await evaluate(bildStat));
  check('Nachtfahrt ist dunkel, aber nicht schwarz',
    nachtBild.schnitt >= 3 && nachtBild.schnitt < 70, JSON.stringify(nachtBild));
  check('Motorrad: Licht im Bild (Scheinwerfer, Rueckleuchten)',
    nachtBild.max > 120, JSON.stringify(nachtBild));
  check('keine Fehler in der Nachtfahrt', moto.errors.length === 0, JSON.stringify(moto.errors));

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

  // --- Epilog: Kleingarten mit Ramona und Grill ----------------------------
  await evaluate(`window.__roland.loadAct(${idxVon('KLEINGARTEN')})`);
  await evaluate("document.getElementById('startBtn').click()");
  await sleep(300);
  await evaluate("document.querySelectorAll('#gardeCards button')[0].click()");
  await sleep(900);
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
  check('keine Fehler in Finale und Epilog',
    (await evaluate('JSON.stringify(window.__errors)')) === '[]', await evaluate('JSON.stringify(window.__errors)'));

  await evaluate("window.__roland.loadAct(0)");

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
  check('Browserprüfung ohne Abbruch', false, e.message);
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
process.exit(failed ? 1 : 0);
