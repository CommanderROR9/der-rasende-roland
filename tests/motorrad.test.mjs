import assert from 'node:assert/strict';
import { buildMotorrad, buildCabrio } from '../src/world.js';
import { Racer, buildTrack, SEG_LEN, project, CAM_H } from '../src/racer.js';
import { createInput } from '../src/input.js';

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
console.log(`${passed} Motorrad tests passed`);
