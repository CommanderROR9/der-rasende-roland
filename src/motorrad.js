// Declarative Motorrad night journey. Longer than Cabrio (~2000 segments).
// Distances are segment indices, never save indices.
export function buildMotorradJourney() {
  const track = [], sections = [];
  let cursor = 0;
  const section = (id, title, theme, story, parts) => {
    const from = cursor;
    for (const [curve, hill, len] of parts) {
      track.push({ curve, hill, len, ease: 26 });
      cursor += len;
    }
    sections.push({ id, title, theme, story, from, to: cursor });
  };
  section('oper', 'OPERNPLATZ', 'plaza', 'VORHANG ZU. HELM AUF. DAS MOTIV FÄHRT MIT.',
    [[0, 0, 90], [1.4, 8, 110], [-1.4, -8, 110], [0, 0, 60]]);
  section('fluss', 'FLUSSKURVEN', 'river', 'DER MOND LIEGT AUF DEM WASSER. WEICH DURCH DIE WECHSEL.',
    [[-2.4, 6, 120], [2.6, -6, 120], [-2, 5, 90], [0, 0, 70]]);
  section('tunnel', 'TUNNEL', 'tunnel', 'LICHT AN. IM TUNNEL ZIEHEN DIE LAMPEN VORBEI.',
    [[2, 0, 120], [-2, 0, 120], [1.6, 6, 80], [0, 0, 60]]);
  section('wald', 'WALDLAUB', 'forest', 'NASSES LAUB UNTER DEN REIFEN. RUHIG DURCH DEN WALD.',
    [[3, 6, 120], [-3.2, -6, 125], [2.6, 8, 115], [0, 0, 80]]);
  section('heim', 'HEIMWEG', 'village', 'DIE FENSTER SIND SCHON AN. FAST ZU HAUSE.',
    [[-1.8, -5, 130], [1.6, 5, 130], [0, 0, 150]]);
  const tunnelSection = sections.find(s => s.id === 'tunnel');
  return {
    id: 'motorrad', mode: 'racer', fahrzeug: 'motorrad', nacht: true,
    name: 'INTERLUDIUM — MOTORRAD NACH HAUSE',
    subtitle: 'Nach der Oper. Scheinwerfer, Tunnel, nasses Laub. Und endlich kühle Luft.',
    bpm: 112, track,
    journey: {
      version: 1, art: 'motorrad', sections, cruise: 13200,
      arrival: ['ZU HAUSE', 'DAS MOTIV BLEIBT IM HELM.'],
      arrivalCue: 'ZU HAUSE · RUHIG ANKOMMEN',
      goalSuffix: 'DAS MOTIV NACH HAUSE BRINGEN',
      scenery: { plaza: 'house_night', river: 'reed', tunnel: 'lamp', forest: 'pine', village: 'house_night' },
      finale: 'home',
      features: { leaves: 26, radar: 2, night: true },
    },
    tunnel: [{ from: tunnelSection.from, to: tunnelSection.to }],
    laub: 26,
    weather: [
      { at: sections[1].from / cursor, rain: true, label: 'NIESELREGEN — DIE STRASSE GLÄNZT' },
      { at: sections[4].from / cursor, rain: false, label: 'DER REGEN HÖRT AUF. GUTE NACHT.' },
    ],
    takts: [{ at: sections[4].from / cursor, bpm: 120, label: 'ZU HAUSE WARTET DIE STILLE' }],
    goals: { distance: null },
    goalText: 'ZU HAUSE ANGEKOMMEN',
  };
}
