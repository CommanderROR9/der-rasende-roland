// Cabrio-only driving feedback; no DOM and no change to motorcycle rules.
const unit = r => r.trackLength / r.segments.length;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function journeySection(r) {
  const index = Math.floor((r.position + r.playerZ) / unit(r));
  const sections = r.level.journey.sections;
  return sections.find(s => index < s.to) || sections[sections.length - 1];
}
export function safePace(r, curve, rain = r.rain) {
  const strength = Math.abs(curve);
  return r.maxSpeed * (strength > 1.7 ? (rain ? 0.49 : 0.66) : (rain ? 0.79 : 1));
}
export function drivingCue(r) {
  const z = r.position + r.playerZ, size = unit(r);
  // At least ~2 seconds of notice at cruise speed. Never inspect behind the car.
  const lookahead = Math.max(r.maxSpeed * 2.3, 50 * size);
  const here = r.segmentAt(z);
  let bend = Math.abs(here.curve) > 1.7 ? here : null;
  if (!bend) {
    for (let n = Math.floor(z / size) + 1; n < Math.min(r.segments.length, (z + lookahead) / size); n++) {
      if (Math.abs(r.segments[n].curve) > 1.7) { bend = r.segments[n]; break; }
    }
  }
  const section = journeySection(r);
  const limit = safePace(r, bend?.curve || 0);
  const direction = bend ? (bend.curve > 0 ? 'right' : 'left') : 'straight';
  const sections = r.level.journey.sections;
  const last = sections[sections.length - 1];
  const arrivalCue = r.level.journey.arrivalCue || 'RUHIG ANKOMMEN';
  return {
    section: section.title, sectionId: section.id, theme: section.theme,
    direction, distance: bend ? Math.max(0, bend.index * size - z) : 0,
    advisedSpeed: Math.round(limit / size * 3), braking: !!r.input.action(),
    cue: bend ? `${direction === 'right' ? 'RECHTS' : 'LINKS'} · VOR DER KURVE BREMSEN`
      : (section.id === last.id || section.theme === 'festival') ? arrivalCue
      : r.rain ? 'NASS · ABSTAND HALTEN' : 'LENKEN · E / BREMSE HALTEN',
  };
}

export function resetJourney(r) {
  r.journeyState = { results: [], hits: 0, bumps: 0, offRoad: 0, stress: 0, sway: 0 };
  r.playerX = 0.48;
  const size = unit(r), count = r.segments.length;
  const J = r.level.journey, F = J.features || {};
  // Separate traffic directions and leave enough time to learn the controls.
  r.traffic = [];
  // Night traffic runs sparser; everyone else keeps the proven density.
  const gap = Math.max(40, Math.round((count - 150) / (F.night ? 20 : 24)))
    * (r.difficulty === 'gemuetlich' ? 1 : 0.8);
  for (let i=40,n=0; i<count-110; i+=gap,n++) {
    r.traffic.push({z:i*size,lane:n%3===0?-.52:.52,
      speed:size*(n%3===0?-9:12),kind:n%5===4?'lkw':'auto',passed:false});
  }
  // Wet leaves are the motorcycle's signature; the Cabrio stays leaf-free.
  r.laub = []; r.laubTreffer = 0;
  if (F.leaves) {
    const forest = J.sections.find(s => s.id === 'wald') || J.sections[2];
    for (let i=0;i<F.leaves;i++) {
      const seg = forest.from + 30 + Math.floor((forest.to - forest.from - 60) * (i / F.leaves));
      r.laub.push({ z: seg*size, lane: (i%2===0?.48:-.5), done: false });
    }
  }
  r.potholes = [];
  for(let i=170,n=0;i<count-100;i+=108,n++)
    r.potholes.push({z:i*size,lane:n%2===0?.48:-.5,done:false});
  r.roadside = [];
  for (const section of r.level.journey.sections) {
    for(let i=section.from+9,n=0;i<section.to;i+=13,n++) {
      const side=n%2?1:-1;
      const fixed=(J.scenery||{})[section.theme];
      const kind=fixed || (n%3?'oak':'poplar');
      r.roadside.push({z:i*size,x:side*(kind==='house'||kind==='house_night'?1.85:1.6),kind,done:false});
      if (n%2===0) r.roadside.push({z:(i+2)*size,x:side*1.07,kind:'post',done:false});
    }
  }
  // Radar traps only where the night ride keeps them.
  if (F.radar) {
    for (let i=0;i<F.radar;i++) {
      const seg = Math.floor(count*(0.3+0.3*i));
      r.roadside.push({ z: seg*size, x: (i%2?1:-1)*1.35, kind: 'blitzer', done: false });
    }
  }
  for(let i=1;i<count;i++){
    if(Math.abs(r.segments[i].curve)>1.7 && Math.abs(r.segments[i-1].curve)<=1.7)
      r.roadside.push({z:(i-14)*size,x:r.segments[i].curve>0?-1.23:1.23,kind:'arrow',flip:r.segments[i].curve<0});
  }
  r.roadside.push({z:(count-52)*size,x:1.9,kind:J.finale || 'stage'});
  r.message(r.level.journey.sections[0].story, 6, 2);
}
function recordSection(r) {
  const j = r.journeyState, section = r.level.journey.sections[j.results.length];
  if (!section) return;
  j.results.push({ id: section.id, clean: r.hits === j.hits && r.bumps === j.bumps && j.offRoad < 1.2 && j.stress < 1.2 });
  j.hits = r.hits; j.bumps = r.bumps; j.offRoad = 0; j.stress = 0;
}
export function updateJourney(r, dt) {
  const j = r.journeyState;
  const current = journeySection(r);
  const curve = r.segmentAt(r.position + r.playerZ).curve;
  const overspeed = Math.abs(curve) > 1.7 && r.speed > safePace(r, curve) * 1.08;
  if (overspeed) j.stress += dt;
  if (Math.abs(r.playerX) > 1) j.offRoad += dt;
  j.sway += ((overspeed ? Math.sign(curve) : 0) - j.sway) * Math.min(1, dt * 4);
  while (j.results.length < r.level.journey.sections.indexOf(current)) {
    recordSection(r);
    r.message(current.story, 6, 3);
  }
}
export function finishJourney(r) {
  while (r.journeyState.results.length < r.level.journey.sections.length) recordSection(r);
  const clean = r.journeyState.results.filter(s => s.clean).length;
  const arrival = r.level.journey.arrival || ['ANGEKOMMEN', ''];
  r.rows.push(['RUHIGE ABSCHNITTE', `${clean}/${r.level.journey.sections.length}`], arrival);
}
