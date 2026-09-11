// tests/diag.mjs — einmalige Diagnose für gemeldete Fehler. Kein Teil der Suite.
// Aufruf: node tests/diag.mjs <url> <akt-index>
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_TO_TEST = process.argv[2] || 'http://127.0.0.1:8123/';
const AKT = Number(process.argv[3] || 4);
const PORT = 9381 + Math.floor(Math.random() * 50);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn('chromium', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'diag-'))}`,
  '--window-size=900,600', 'about:blank',
], { stdio: 'ignore' });

const hol = async (pfad) => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${pfad}`); return await r.json(); }
    catch { await sleep(250); }
  }
  throw new Error('DevTools nicht erreichbar');
};

(async () => {
  try {
    const liste = await hol('/json/list');
    const ziel = liste.find((t) => t.type === 'page');
    const ws = new WebSocket(ziel.webSocketDebuggerUrl);
    await new Promise((res) => { ws.onopen = res; });
    let id = 0;
    const wartend = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && wartend.has(m.id)) { wartend.get(m.id)(m.result); wartend.delete(m.id); }
    };
    const send = (method, params = {}) => new Promise((res) => {
      const n = ++id; wartend.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
    });
    const evalJs = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return { fehler: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '') };
      return r.result.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: URL_TO_TEST });
    await sleep(2500);
    await evalJs(`window.__roland.loadAct(${AKT})`);
    await sleep(300);
    await evalJs("document.getElementById('startBtn').click()");
    await sleep(500);
    const istRacer = await evalJs("window.__roland.level.mode === 'racer'");
    if (!istRacer) {
      await evalJs("document.querySelectorAll('#gardeCards button')[0].click()");
    }
    await sleep(2000);

    console.log('== Zustand ==');
    console.log(await evalJs(`JSON.stringify({
      akt: window.__roland.level.id,
      setting: window.__roland.level.setting,
      dunkel: window.__roland.game && window.__roland.game.dunkel,
      sicht: window.__roland.game && window.__roland.game.diff && window.__roland.game.diff.sicht,
      state: (window.__roland.game || window.__roland.racer).state,
      spieler: window.__roland.game ? { x: Math.round(window.__roland.game.player.x), y: Math.round(window.__roland.game.player.y), onGround: window.__roland.game.player.onGround } : null,
      tileUnterSpieler: window.__roland.game ? window.__roland.game.tileVal(Math.floor(window.__roland.game.player.x/16), Math.floor((window.__roland.game.player.y+22+2)/16)) : null,
      lichtAmSpieler: window.__roland.game ? window.__roland.game.lightAt(Math.floor(window.__roland.game.player.x/16), Math.floor(window.__roland.game.player.y/16)).toFixed(3) : null,
      fehler: window.__errors
    })`, 2));

    // Bewegung per Tastatur
    const x0 = await evalJs('window.__roland.game.player.x');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
    await sleep(1500);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
    await sleep(200);
    const x1 = await evalJs('window.__roland.game.player.x');
    console.log(`== Bewegung ==  x: ${x0} -> ${x1}  (dx=${(x1 - x0).toFixed(1)})`);

    // Helligkeit im Spielerbereich
    const bild = await evalJs(`(() => {
      const c = document.getElementById('game');
      const g = window.__roland.game;
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const px = Math.round(g.player.x - g.cam.x), py = Math.round(g.player.y - g.cam.y);
      let sum = 0, n = 0, mx = 0;
      for (let y = Math.max(0, py - 24); y < Math.min(c.height, py + 32); y++) {
        for (let x = Math.max(0, px - 24); x < Math.min(c.width, px + 32); x++) {
          const i = (y * c.width + x) * 4;
          const h = (d[i] + d[i+1] + d[i+2]) / 3;
          sum += h; n++; if (h > mx) mx = h;
        }
      }
      const ganz = (() => { let s = 0, k = 0; for (let i = 0; i < d.length; i += 64) { s += (d[i]+d[i+1]+d[i+2])/3; k++; } return Math.round(s / k); })();
      return JSON.stringify({ umSpieler: Math.round(sum / Math.max(1, n)), maxUmSpieler: Math.round(mx), ganzesBild: ganz, camY: Math.round(g.cam.y) });
    })()`);
    console.log('== Helligkeit ==', bild);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const pfad = `/tmp/diag-akt${AKT}.png`;
    writeFileSync(pfad, Buffer.from(shot.data, 'base64'));
    console.log('Screenshot:', pfad);
    ws.close();
  } catch (e) {
    console.log('DIAG-FEHLER:', e.message);
  } finally {
    chrome.kill();
    process.exit(0);
  }
})();
