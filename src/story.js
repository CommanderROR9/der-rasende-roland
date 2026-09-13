// story.js — das Gerüst der Reise an einer Stelle (Arbeitspaket DRR-03).
//
// Hier steht, in welcher Reihenfolge die Stationen kommen, was an jeder Station
// das Ziel ist und wie ein alter Spielstand dorthin überführt wird. Die
// Geometrie der Level bleibt in world.js, die Mechanik in game.js.
//
// Warum überhaupt: Der Spielstand speicherte früher nur einen numerischen Index.
// Seit die Nachtfahrt der Heimweg ist (Finale → Motorrad → Garten), würde ein
// alter Index auf die falsche Station zeigen. Deshalb speichern wir stabile
// Stations-IDs und rechnen alte Stände einmalig um.

export const SAVE_VERSION = 3;

/** Alte Reihenfolge (Motorrad VOR dem Finale) — nur für die Migration. */
export const STATION_ORDER_ALT = [
  'akt1', 'akt2', 'cabrio', 'akt3', 'akt4', 'motorrad', 'akt5', 'epilog',
];

/**
 * Die Stationen in der verbindlichen Reihenfolge.
 * `ziel` ist der Satz, der im HUD als Aufgabe steht (Journal, DRR-03).
 */
export const STATIONEN = [
  {
    id: 'akt1', name: 'AKT 1 — DIE KATAKOMBEN', mode: 'sidescroller',
    ziel: 'DREI STIMMBLÄTTER FINDEN UND DEN MATERIALAUFZUG NEHMEN',
  },
  {
    id: 'akt2', name: 'AKT 2 — DIE PROBE', mode: 'sidescroller',
    ziel: 'DIE MAPPE ABGEBEN UND DEN ERSTEN EINSATZ IM TAKT SPIELEN',
  },
  {
    id: 'cabrio', name: 'INTERLUDIUM — CABRIO ZUM OPEN AIR', mode: 'racer',
    ziel: 'ZUM OPEN AIR FAHREN — DIE MAPPE LIEGT AUF DEM BEIFAHRERSITZ',
  },
  {
    id: 'akt3', name: 'AKT 3 — OPEN AIR', mode: 'sidescroller',
    ziel: 'ÜBER BÜHNE UND GERÜST BIS ZUM PODIUM — ZUM AUFTRITT NUR IM FRACK',
  },
  {
    id: 'akt4', name: 'AKT 4 — DER ORCHESTERGRABEN', mode: 'sidescroller',
    ziel: 'DIE LAMPENKISTE ZUR HAUPTVERSENKUNG BRINGEN UND HOCHFAHREN',
  },
  {
    id: 'akt5', name: 'AKT 5 — DIE BÜHNE', mode: 'sidescroller',
    ziel: 'AUFTRITT IM FRACK: APPLAUS SAMMELN, DANN DEN FRACK AM VORHANG ABLEGEN',
  },
  {
    id: 'motorrad', name: 'INTERLUDIUM — MOTORRAD NACH HAUSE', mode: 'racer',
    ziel: 'NACH HAUSE FAHREN — DAS MOTIV BLEIBT IM HELM',
  },
  {
    id: 'epilog', name: 'EPILOG — DER KLEINGARTEN', mode: 'sidescroller',
    ziel: 'HEIMKOMMEN: RAMONA BEGRÜSSEN, DAS BIER ANNEHMEN, AUF DIE BANK',
  },
];

/** Belohnungstexte je Station (vorher in main.js). */
export const BELOHNUNGEN = {
  akt1: {
    title: 'BELOHNUNG: FEIERABENDBIER',
    text: 'Der Aufzug fährt nach oben, erster Stock: Probenraum. Und in der Hand ein Bier, das niemand mehr wegnehmen kann.',
  },
  akt2: {
    title: 'BELOHNUNG: PAUSENBROT',
    text: 'Hinter der Bühnentür wird es dunkel und warm. Ein Pausenbrot für die nächste Runde — und ein Nerv mehr.',
  },
  cabrio: {
    title: 'ANGEKOMMEN: OPEN-AIR-BÜHNE',
    text: 'Motor aus, Verdeck bleibt offen. Die Bühne steht schon, der Wind hat die Noten schon einmal verteilt — Akt 3 wartet.',
  },
  akt3: {
    title: 'BELOHNUNG: KANTINENKAFFEE',
    text: 'Lauwarm, mit Kondenswasser am Becherrand. Der Applaus hallt noch im Park, '
      + 'und für einen Moment ist der Frack gar nicht mehr so schlimm.',
  },
  akt4: {
    title: 'BELOHNUNG: DER TAKTSTOCK',
    text: 'Der Dirigent hat ihn liegen lassen. Ab jetzt liegt er im Handschuhfach, '
      + 'zwischen Parkmünzen und einem Fahrschein von 1987.',
  },
  akt5: {
    title: 'STEHENDE OVATIONEN',
    text: 'Der Vorhang ist gefallen und das Haus steht. Einundvierzig Jahre lang war das '
      + 'Bühnenlicht unangenehm hell — heute Abend nicht mehr.',
  },
  motorrad: {
    title: 'BELOHNUNG: KUEHLE NACHTLUFT',
    text: 'Zwei Stunden Landstraße, ein Tunnel und kein Mensch mehr auf der Straße. '
      + 'Der Frack hängt im Schrank der Laube — der Helm riecht nach Sommerregen.',
  },
  epilog: {
    title: 'FEIERABEND',
    text: 'Ramona hat das Bier gereicht, der Grill ist an, und der Frack hängt im '
      + 'Schrank der Laube. 41 Jahre. Und jetzt: Feierabend.',
  },
};

export function stationIds() { return STATIONEN.map((s) => s.id); }

/**
 * Überführt jeden alten Spielstand in die aktuelle Form.
 * v1/v2 kannten nur `act` (Index in STATION_ORDER_ALT) — daraus wird eine ID.
 */
export function migriereSave(raw) {
  const s = { ...(raw || {}) };
  const ids = stationIds();
  if (typeof s.station !== 'string' || !ids.includes(s.station)) {
    const roh = Number(s.act);
    const idx = Number.isFinite(roh)
      ? Math.max(0, Math.min(STATION_ORDER_ALT.length - 1, Math.round(roh)))
      : 0;
    s.station = STATION_ORDER_ALT[idx] || ids[0];
  }
  if (s.v !== SAVE_VERSION) s.v = SAVE_VERSION;
  if (!s.geschafft || typeof s.geschafft !== 'object') s.geschafft = {};
  return s;
}

/** Index der gespeicherten Station in der aktuellen Reihenfolge. */
export function stationIndex(save) {
  const i = stationIds().indexOf(save && save.station);
  return i < 0 ? 0 : i;
}
