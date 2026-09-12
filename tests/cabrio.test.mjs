import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { buildCabrio, buildMotorrad } from '../src/world.js';
import { Racer, buildTrack, SEG_LEN, project, CAM_H } from '../src/racer.js';
import { createInput } from '../src/input.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function make(level = buildCabrio(), difficulty = 'gemuetlich') {
  const input = createInput(null), events = [];
  const racer = new Racer({ level, input, events: e => events.push(e),
    audio: { play() {}, engine() {}, engineOff() {} }, view: { w: 384, h: 216 }, difficulty });
  return { racer, input, events };
}

test('Cabrio has four complete, contiguous authored journey sections', () => {
  const level = buildCabrio();
  assert.equal(level.journey?.sections?.length, 4);
  const sections = level.journey.sections;
  assert.equal(sections[0].from, 0);
  const built = buildTrack(level.track);
  assert.equal(sections.at(-1).to, built.segments.length);
  for (let i = 0; i < sections.length; i++) {
    assert.ok(sections[i].title && sections[i].story && sections[i].theme);
    if (i) assert.equal(sections[i].from, sections[i - 1].to);
  }
  assert.equal(new Set(sections.map(s => s.theme)).size, 4);
  assert.ok(built.segments.some(s => s.curve > 0) && built.segments.some(s => s.curve < 0));
  for (let i = 1; i < built.segments.length; i++) {
    assert.ok(Math.abs(built.segments[i].curve - built.segments[i - 1].curve) < 0.3, `curve seam ${i}`);
  }
});

test('road object projection uses absolute segment fraction, not camera-relative fraction', () => {
  const { racer: r } = make();
  r.position = 31 * SEG_LEN + 87;
  const z = 38 * SEG_LEN + 32;
  r.roadside = [{ z, x: 1.3, kind: 'schild' }]; r.traffic = []; r.potholes = []; r.laub = [];
  const f = r.buildFrame(), o = f.drawList.find(o => o.kind === 'schild');
  const seg = r.segmentAt(z), t = (z % SEG_LEN) / SEG_LEN;
  const mix = (a,b) => a + (b-a)*t;
  const expected = mix(seg.p1.screen.x, seg.p2.screen.x) + 1.3 * mix(seg.p1.screen.w, seg.p2.screen.w);
  assert.ok(Math.abs(o.sx - expected) < 0.001, `${o.sx} != ${expected}`);
});

test('driver receives curve direction and safe speed before the bend, brake makes it manageable', () => {
  const { racer: r, input } = make();
  const bend = r.segments.find(s => s.curve > 2);
  r.position = (bend.index - 50) * SEG_LEN; r.speed = r.maxSpeed;
  r.update(1 / 60);
  assert.equal(r.hud.drive?.direction, 'right');
  assert.ok(r.hud.drive.distance > 0, 'advance warning, not a post-hit message');
  assert.ok(r.hud.drive.advisedSpeed < r.hud.speed);
  assert.match(r.hud.drive.cue, /RECHTS/);
  const before = r.speed;
  input.setKey('action', true);
  for (let n = 0; n < 60; n++) r.update(1 / 60);
  assert.ok(r.speed < before * 0.65);
  assert.equal(r.hud.drive.braking, true);
});

test('journey evaluates each section once, preserves the mappe, and resets cleanly', () => {
  const { racer: r } = make();
  assert.deepEqual(r.journeyState?.results, []);
  r.hits = 1;
  r.position = r.level.journey.sections[1].from * SEG_LEN;
  r.update(1 / 60);
  assert.equal(r.journeyState.results.length, 1);
  assert.equal(r.journeyState.results[0].clean, false);
  assert.match(r.hud.ziel, /ABENDALLEE/);
  for (let i = 0; i < 10; i++) r.update(1 / 60);
  assert.equal(r.journeyState.results.length, 1);
  r.position = r.trackLength - 100; r.speed = r.maxSpeed;
  r.update(1 / 60);
  assert.equal(r.state, 'complete');
  assert.equal(r.hud.strecke, 1, 'route cannot wrap to 0% on arrival');
  assert.equal(r.journeyState.results.length, 4);
  assert.ok(r.rows.some(([label]) => label === 'RUHIGE ABSCHNITTE'));
  assert.ok(r.rows.some(([,text]) => text.includes('MAPPE')));
  r.reset();
  assert.equal(r.journeyState.results.length, 0);
  assert.equal(r.hud.strecke, 0);
});

test('Cabrio collision point follows the visible rear wheels on every viewport', () => {
  const { racer: r } = make();
  for (const [w,h] of [[384,216],[300,240],[480,216]]) {
    r.vw=w; r.vh=h; r.position=0; r.buildFrame();
    const p = { world: { x: 0, y: 0, z: r.playerZ }, camera: {}, screen: {} };
    project(p, 0, CAM_H, 0, w, h);
    assert.ok(Math.abs(p.screen.y - (h-8)) <= 1, `${w}x${h} ground=${p.screen.y}`);
  }
});

test('Cabrio art is a dedicated local module', () => {
  assert.ok(existsSync(new URL('../src/cabrio-art.js', import.meta.url)));
});
const { CABRIO_SPRITES, CABRIO_PALETTE, SCENES } = await import('../src/cabrio-art.js');
test('art provides distinct traffic directions, brake state and four landscape palettes', () => {
  for (const name of ['mx5','mx5_brake','auto','oncoming','lkw','oak','poplar','house','stage','pennant']) {
    const rows = CABRIO_SPRITES[name];
    assert.ok(Array.isArray(rows) && rows.length >= 10, name);
    assert.ok(rows.every(r => r.length === rows[0].length), `rectangular ${name}`);
    for (const ch of rows.join('')) assert.ok(ch === ' ' || CABRIO_PALETTE[ch], `${name} unknown ${ch}`);
  }
  assert.notDeepEqual(CABRIO_SPRITES.auto, CABRIO_SPRITES.oncoming);
  assert.notDeepEqual(CABRIO_SPRITES.mx5, CABRIO_SPRITES.mx5_brake);
  assert.equal(new Set(Object.values(SCENES).map(s => s.sky.join(','))).size,4);
});
test('authored scenery reaches runtime projection and the departure has a hazard-free lead-in', () => {
  const { racer: r } = make();
  assert.ok(r.roadside.some(o => o.kind === 'house'));
  assert.ok(r.roadside.some(o => o.kind === 'stage'));
  assert.ok(r.traffic.every(c => c.z >= 30 * SEG_LEN));
  assert.ok(r.potholes.every(c => c.z >= 100 * SEG_LEN));
  assert.equal(r.laub.length, 0, 'wet rear-tyre leaves belong to the motorcycle');
  assert.ok(r.buildFrame().drawList.some(o=>o.kind==='house'));
});
test('distant traffic remains visible when rounded road strips share a pixel row', () => {
  const { racer:r }=make(); r.position=0; r.roadside=[];r.potholes=[];
  r.traffic=Array.from({length:12},(_,i)=>({z:(20+i)*SEG_LEN,lane:.5,kind:'auto',speed:0}));
  const frame=r.buildFrame();
  assert.equal(frame.drawList.filter(o=>o.kind==='auto').length,12);
});
test('natural drive completes with real traffic and hazards, calm beats reckless', () => {
  const drive = (difficulty, braking) => {
    const { racer: r, input } = make(buildCabrio(), difficulty);
    for (let i = 0; i < 60 * 120 && r.state === 'play'; i++) {
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
    assert.equal(calm.state, 'complete', `${difficulty} calm should arrive`);
    assert.equal(calm.journeyState.results.length, 4);
    assert.ok(calm.rows.some(([, t]) => t.includes('MAPPE')));
    const wild = drive(difficulty, false);
    assert.equal(wild.state, 'complete', `${difficulty} wild should still arrive`);
    const calmClean = calm.journeyState.results.filter(s => s.clean).length;
    const wildClean = wild.journeyState.results.filter(s => s.clean).length;
    assert.ok(calmClean >= wildClean, `${difficulty}: calm ${calmClean} vs wild ${wildClean}`);
  }
});
console.log(`${passed} Cabrio tests passed`);
