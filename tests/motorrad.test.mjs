import assert from 'node:assert/strict';
import { buildMotorrad, buildCabrio } from '../src/world.js';
import { Racer, buildTrack, SEG_LEN, project, CAM_H } from '../src/racer.js';
import { createInput } from '../src/input.js';
import { MOTORRAD_SPRITES, drawNightBike, drawNightSky } from '../src/motorrad-art.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function make(level = buildMotorrad(), difficulty = 'gemuetlich') {
  const input = createInput(null), events = [];
  const racer = new Racer({ level, input, events: e => events.push(e),
    audio: { play() {}, engine() {}, engineOff() {} }, view: { w: 384, h: 216 }, difficulty });
  return { racer, input, events };
}

test('Motorrad has five complete night journey sections and stays longer than Cabrio', () => {
  const level = buildMotorrad();
  assert.equal(level.journey?.sections?.length, 5);
  assert.equal(level.journey.art, 'motorrad');
  assert.equal(level.nacht, true);
  assert.equal(level.fahrzeug, 'motorrad');
  assert.ok(level.laub > 0);
  assert.ok(Array.isArray(level.tunnel) && level.tunnel.length > 0);
  const sections = level.journey.sections;
  assert.equal(sections[0].from, 0);
  const built = buildTrack(level.track);
  assert.equal(sections.at(-1).to, built.segments.length);
  assert.ok(built.segments.length > 1800, `${built.segments.length} segments`);
  const cabrio = buildTrack(buildCabrio().track);
  assert.ok(built.segments.length > cabrio.segments.length, 'longer than Cabrio');
  for (let i = 0; i < sections.length; i++) {
    assert.ok(sections[i].title && sections[i].story && sections[i].theme);
    if (i) assert.equal(sections[i].from, sections[i - 1].to);
  }
});

test('Motorrad keeps its rules: leaves, radar, tunnel, faster, home arrival', () => {
  const { racer: r } = make();
  assert.ok(r.roadside.some(o => o.kind === 'blitzer')), 'radar kept';
  assert.ok(r.laub.length > 5, `${r.laub.length} leaves`);
  const tun = buildMotorrad().tunnel[0];
  r.position = (tun.from + 3) * SEG_LEN;
  assert.equal(r.imTunnel(), true);
  r.position = 0;
  assert.equal(r.imTunnel(), false);
  const cab = make(buildCabrio()).racer;
  assert.ok(r.maxSpeed > cab.maxSpeed * 1.1);
  r.position = r.trackLength - 100; r.speed = r.maxSpeed;
  r.update(1 / 60);
  assert.equal(r.state, 'complete');
  assert.ok(r.rows.some(([, t]) => t.includes('HELM')), JSON.stringify(r.rows));
  assert.ok(r.rows.some(([k]) => k === 'FAHRZEIT'));
  assert.ok(r.rows.some(([k]) => k === 'KONTAKTE'));
  assert.match(r.hud.ziel, /NACH HAUSE/);
});

test('Motorrad art is a dedicated night module', async () => {
  const { MOTORRAD_SPRITES, MOTORRAD_PALETTE, NIGHT_SCENES } = await import('../src/motorrad-art.js');
  for (const name of ['motorrad', 'motorrad_brake', 'auto', 'oncoming', 'house_night', 'pine', 'reed', 'lamp', 'home']) {
    const rows = MOTORRAD_SPRITES[name];
    assert.ok(Array.isArray(rows) && rows.length >= 10, name);
    assert.ok(rows.every(x => x.length === rows[0].length), `rectangular ${name}`);
    for (const ch of rows.join('')) assert.ok(ch === ' ' || MOTORRAD_PALETTE[ch], `${name} unknown ${ch}`);
  }
  assert.notDeepEqual(MOTORRAD_SPRITES.auto, MOTORRAD_SPRITES.oncoming);
  assert.notDeepEqual(MOTORRAD_SPRITES.motorrad, MOTORRAD_SPRITES.motorrad_brake);
  assert.equal(new Set(Object.values(NIGHT_SCENES).map(s => s.sky.join(','))).size, 5);
});

test('natural night drive completes, calm beats reckless', () => {
  const drive = (difficulty, braking) => {
    const { racer: r, input } = make(buildMotorrad(), difficulty);
    for (let i = 0; i < 60 * 150 && r.state === 'play'; i++) {
      const d = r.hud.drive;
      const wantBrake = braking && d && d.direction !== 'straight' && d.distance < r.maxSpeed * 0.85;
      input.setKey('action', wantBrake);
      input.setKey('left', r.playerX > 0.06);
      input.setKey('right', r.playerX < -0.06);
      r.update(1 / 60);
    }
    return r;
  };
  for (const difficulty of ['gemuetlich', 'zuegig']) {
    const calm = drive(difficulty, true);
    assert.equal(calm.state, 'complete', `${difficulty} calm should arrive in ${calm.time.toFixed(0)}s`);
    assert.equal(calm.journeyState.results.length, 5);
    const wild = drive(difficulty, false);
    assert.equal(wild.state, 'complete', `${difficulty} wild should still arrive`);
    const cc = calm.journeyState.results.filter(s => s.clean).length;
    const wc = wild.journeyState.results.filter(s => s.clean).length;
    assert.ok(cc >= wc, `${difficulty}: calm ${cc} vs wild ${wc}`);
  }
});
test('night roadside does not flicker', () => {
  const { racer: r } = make();
  r.position = 200 * SEG_LEN;
  r.speed = r.maxSpeed * 0.6;
  const target = { z: r.position + 120 * SEG_LEN, x: 1.6, kind: 'pine' };
  r.roadside = [target]; r.traffic = []; r.potholes = []; r.laub = [];
  let flips = 0, last = null;
  for (let i = 0; i < 600; i++) {
    r.position += r.speed * (1 / 60);
    if (r.position >= r.trackLength - r.playerZ) break;
    const now = r.buildFrame().drawList.some((o) => o.kind === 'pine');
    if (last !== null && now !== last) flips++;
    last = now;
  }
  assert.ok(flips <= 4, `${flips} flips`);
});
// --- Darstellung: Roland sah ein Auto mit zwei Rädern nebeneinander ----------
function spurLaeufe(zeile) {
  const out = [];
  let von = -1;
  for (let x = 0; x <= zeile.length; x++) {
    if (x < zeile.length && zeile[x] !== ' ' && von < 0) von = x;
    else if ((x === zeile.length || zeile[x] === ' ') && von >= 0) { out.push([von, x - 1]); von = -1; }
  }
  return out;
}
test('Fahrzeug-Sprite ist ein Motorrad, kein zweispuriges Auto', () => {
  for (const name of ['motorrad', 'motorrad_brake']) {
    const rows = MOTORRAD_SPRITES[name];
    const mitte = (rows[0].length - 1) / 2;
    // Heckansicht: genau EIN Hinterrad, mittig. Zwei Räder nebeneinander = Auto.
    for (let y = rows.length - 8; y < rows.length; y++) {
      const spur = spurLaeufe(rows[y]);
      assert.equal(spur.length, 1, `${name} Zeile ${y}: ${spur.length} Spuren statt einem Hinterrad`);
      const [von, bis] = spur[0];
      assert.ok(bis - von + 1 >= 5, `${name} Zeile ${y}: Hinterrad zu schmal (${bis - von + 1} px)`);
      assert.ok(Math.abs((von + bis) / 2 - mitte) <= 2, `${name} Zeile ${y}: Hinterrad nicht mittig`);
    }
    // Schmaler Aufbau: der alte Auto-Sprite war 26 Pixel breit.
    const breit = Math.max(...rows.map((row) => Math.max(0, ...spurLaeufe(row).map(([a, b]) => b - a + 1))));
    assert.ok(breit <= 20, `${name} ist ${breit} px breit — das liest sich als Auto`);
    assert.match(rows.slice(12, 18).join(''), /[Rry]/, `${name} ohne Rücklicht/Blinker`);
    assert.match(rows.slice(0, 8).join(''), /h/, `${name} ohne Helm/Fahrer von hinten`);
  }
});

test('Scheinwerferkegel liegt auf der Straße, nicht am Himmel', () => {
  const rects = [];
  const ctx = {
    fillStyle: '', font: '', textAlign: 'left',
    fillRect(x, y, w, h) { rects.push({ stil: this.fillStyle, x, y, w, h }); },
    drawImage() {}, fillText() {},
  };
  const r = { vw: 384, vh: 216, lenkung: 0, panneTimer: 0,
    input: { action: () => false }, sprite: () => ({ canvas: {}, w: 30, h: 26 }) };
  drawNightBike(r, ctx);
  const horizont = Math.ceil(r.vh / 2);
  const alpha = (q) => Number((q.stil.match(/,([\d.]+)\)$/) || [])[1]);
  const kegel = rects.filter((q) => /^rgba\(255,2(32|36)/.test(q.stil));
  assert.ok(kegel.length >= 20, `${kegel.length} Kegelstreifen`);
  for (const q of kegel) {
    assert.ok(q.y >= horizont, `Kegel bei y=${q.y} hängt am Himmel (Horizont ${horizont})`);
  }
  const oben = Math.min(...kegel.map((q) => q.y));
  assert.ok(oben - horizont <= 8, `Kegel beginnt ${oben - horizont} px unter dem Horizont`);
  const nah = kegel.filter((q) => q.y >= r.vh - 40), fern = kegel.filter((q) => q.y <= oben + 20);
  assert.ok(Math.max(...fern.map((q) => q.w)) > Math.max(...nah.map((q) => q.w)),
    'Kegel verbreitert sich nicht zum Fluchtpunkt hin');
  assert.ok(Math.max(...nah.map(alpha)) > Math.max(...fern.map(alpha)),
    'kein heller Lichtsee direkt vor dem Vorderrad');
});

test('Tunnellampen hängen mit Perspektive an der Decke, nicht als seitliches Band', () => {
  const segs = [];
  for (let n = 0; n < 170; n++) {
    const rel = 300 / (n + 1.5);
    segs.push({ index: 800 + n, p1: { screen: { x: 192 + Math.round(n * 0.4), fy: 108 + rel, w: Math.round(rel * 6) } } });
  }
  const rects = [];
  const ctx = {
    fillStyle: '',
    fillRect(x, y, w, h) { rects.push({ stil: this.fillStyle, x, y, w, h }); },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
  };
  const r = { vw: 384, vh: 216, position: 160000, imTunnel: () => true, tunnel: [{ from: 770, to: 1150 }] };
  drawNightSky(r, ctx, segs);
  const horizont = Math.ceil(r.vh / 2);
  const lampen = rects.filter((q) => q.stil === '#ffe2a8');
  assert.ok(lampen.length >= 4, `${lampen.length} Deckenlampen`);
  // Vorher: alle auf einer Höhe, 30 px breit, seitlich durchlaufend (sah wie ein Zug aus).
  assert.ok(new Set(lampen.map((q) => q.y)).size >= 3,
    `alle Lampen auf einer Höhe (${[...new Set(lampen.map((q) => q.y))].join(',')})`);
  for (const q of lampen) assert.ok(q.y < horizont - 2, `Lampe bei y=${q.y} hängt nicht an der Decke`);
  assert.ok(Math.max(...lampen.map((q) => q.w)) >= 2 * Math.min(...lampen.map((q) => q.w)),
    'Lampen werden zum Fluchtpunkt hin nicht schmaler');
});
console.log(`${passed} Motorrad tests passed`);
