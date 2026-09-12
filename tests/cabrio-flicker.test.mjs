// Flicker-Metrik: Wie oft wechselt ein weit entferntes Objekt zwischen
// sichtbar/unsichtbar, obwohl es im Sichtbereich bleibt?
import { buildCabrio } from '../src/world.js';
import { Racer } from '../src/racer.js';
import { createInput } from '../src/input.js';

const input = createInput(null);
const r = new Racer({ level: buildCabrio(), input,
  audio: { play() {}, engine() {}, engineOff() {} }, events: () => {},
  view: { w: 384, h: 216 }, difficulty: 'gemuetlich' });
r.position = 200 * 200;
r.speed = r.maxSpeed * 0.6;

// Ein festes Objekt weit vorn auf gerader Strecke fixieren.
const target = { z: r.position + 120 * 200, x: 1.6, kind: 'oak' };
r.roadside = [target]; r.traffic = []; r.potholes = []; r.laub = [];

let flips = 0, visible = 0, frames = 0, last = null;
for (let i = 0; i < 600; i++) {
  r.position += r.speed * (1 / 60);
  if (r.position >= r.trackLength - r.playerZ) break;
  const f = r.buildFrame();
  const now = f.drawList.some((o) => o.kind === 'oak');
  if (now) visible++;
  if (last !== null && now !== last) flips++;
  last = now;
  frames++;
}
console.log(JSON.stringify({ frames, visible, flips }));
const ok = flips <= 4;
console.log(`${ok ? 'PASS' : 'FAIL'} no roadside flicker (flips=${flips})`);
process.exit(ok ? 0 : 1);
