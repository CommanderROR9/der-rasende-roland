// Declarative Cabrio journey. Distances are segment indices, never save indices.
export function buildCabrioJourney() {
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
  section('stadt', 'STADTAUSFAHRT', 'town', 'DIE PROBE KLINGT NACH. DIE MAPPE FÄHRT MIT.',
    [[0, 0, 90], [1.2, 9, 100], [-1.2, -9, 100], [0, 0, 70]]);
  section('allee', 'ABENDALLEE', 'fields', 'ZUR BÜHNE GEHT ES DURCH DIE ALLEE. RUHIG IN DIE KURVEN.',
    [[2.4, 10, 115], [-2.6, -10, 120], [0, 0, 70], [2, 6, 95]]);
  section('regen', 'REGENSCHAUER', 'rain', 'REGEN AUF DEM ASPHALT. DIE MAPPE BLEIBT GESCHLOSSEN.',
    [[0, -6, 65], [-3.2, 7, 125], [3, -7, 125], [0, 0, 85]]);
  section('buehne', 'OPEN AIR', 'festival', 'HINTER DEN WIMPELN WARTET DAS ORCHESTER.',
    [[-1.8, 5, 100], [1.4, -5, 100], [0, 0, 120]]);
  return {
    id: 'cabrio', mode: 'racer', fahrzeug: 'mx5',
    name: 'INTERLUDIUM — CABRIO ZUM OPEN AIR',
    subtitle: 'Die Mappe fährt mit. Lenken und vor engen Kurven bremsen.',
    bpm: 104, track,
    journey: { version: 1, sections, cruise: 10800 },
    weather: [
      { at: sections[2].from / cursor, rain: true, label: 'REGENSCHAUER — FRÜHER BREMSEN' },
      { at: sections[3].from / cursor, rain: false, label: 'DIE BÜHNE IN SICHT — GLEICH GESCHAFFT' },
    ],
    takts: [{ at: sections[3].from / cursor, bpm: 116, label: 'DIE ZUGABE WARTET' }],
    goals: { distance: null },
  };
}
