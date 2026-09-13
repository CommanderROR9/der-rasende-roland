// tests/cutscene-einstieg.test.mjs — Auftrag CUT-2: die Einstiegs-Cutscenes
// vor den beiden Fahr-Interludien.
//
// Prueft den Ausloeser (der Start des Interludiums), den Ablauf beider Szenen
// (Schluessel, Tuer, einsteigen / Helm, aufsteigen), das Ende und dass die Fahrt
// danach unveraendert weitergeht. Seit Rolands Rueckmeldung vom 13.09. laeuft
// die Szene bei JEDEM Start des jeweiligen Interludiums; der Merker je Fahrzeug
// ist nur noch eine Aufzeichnung im Spielstand (er unterdrueckt nichts mehr).
// Der Bildbeweis kommt aus dem Browserlauf tests/browser-smoke.mjs; eine
// Palette allein beweist kein Bild.
//
// Start mit `node tests/cutscene-einstieg.test.mjs`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCabrio, buildMotorrad, buildAkt2 } from '../src/world.js';
import { Racer } from '../src/racer.js';
import { createInput } from '../src/input.js';
import { VIEW_DESKTOP, PAL } from '../src/config.js';
import { SPRITES } from '../src/sprites.js';
import {
  EINSTIEG_MERKER, EINSTIEG_DAUER, EINSTIEG_BEATS, EINSTIEG_SPRITES, EINSTIEG_FIGUREN,
  CABRIO_TUER_AB, CABRIO_TUER_BIS, CABRIO_WEG_AB, CABRIO_FAHRER_AB, CABRIO_SCHLIESS_AB,
  CABRIO_ZU_BIS, MOTORRAD_GREIF_AB, MOTORRAD_HELM_AB, MOTORRAD_SITZT_AB, TUER_WEITE,
  beatBei, einstiegGelaufen, einstiegMoeglichFuerLevel, einstiegStarten, EinstiegSzene,
  zeichenInPalette, mitHelm,
} from '../src/cutscene-einstieg.js';

const WURZEL = fileURLToPath(new URL('..', import.meta.url));
const QUELLE = readFileSync(join(WURZEL, 'src/cutscene-einstieg.js'), 'utf8');
const MAIN = readFileSync(join(WURZEL, 'src/main.js'), 'utf8');
const CABRIO_QUELLE = readFileSync(join(WURZEL, 'src/cabrio.js'), 'utf8');
const MOTORRAD_QUELLE = readFileSync(join(WURZEL, 'src/motorrad.js'), 'utf8');
const CABRIO_ART = readFileSync(join(WURZEL, 'src/cabrio-art.js'), 'utf8');
const MOTORRAD_ART = readFileSync(join(WURZEL, 'src/motorrad-art.js'), 'utf8');

const results = [];
let failed = 0;
function check(name, condition, extra = '') {
  const ok = !!condition;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ` — ${extra}`}`);
}

const AUDIO = { play() {}, engine() {}, engineOff() {}, resume() {} };
/** Eine Szene bis `sekunden` laufen lassen (feste Schritte, wie im Spiel). */
function lauf(szene, sekunden, dt = 1 / 60) {
  let t = 0;
  const ende = Math.min(sekunden, szene.dauer);
  while (t < ende - 1e-9) {
    szene.update(dt);
    t += dt;
  }
  return szene;
}
const szeneFuer = (fahrzeug, extra = {}) => new EinstiegSzene({
  level: fahrzeug === 'cabrio' ? buildCabrio() : buildMotorrad(),
  view: VIEW_DESKTOP, fahrzeug, ...extra,
});

// ------------------------------------------------------------- Das Modul -----
{
  check('Einstieg: beide Szenen liegen in Rolands Rahmen (2 bis 4 Sekunden)',
    EINSTIEG_DAUER.cabrio >= 2 && EINSTIEG_DAUER.cabrio <= 4
      && EINSTIEG_DAUER.motorrad >= 2 && EINSTIEG_DAUER.motorrad <= 4,
    JSON.stringify(EINSTIEG_DAUER));
  check('Einstieg: je Fahrzeug ein eigener Merker im Spielstand',
    EINSTIEG_MERKER.cabrio && EINSTIEG_MERKER.motorrad
      && EINSTIEG_MERKER.cabrio !== EINSTIEG_MERKER.motorrad,
    JSON.stringify(EINSTIEG_MERKER));

  for (const [fahrzeug, beats] of Object.entries(EINSTIEG_BEATS)) {
    const bis = beats.map((b) => b.bis);
    check(`Einstieg ${fahrzeug}: die Abschnitte wachsen und decken die Dauer ab`,
      bis.every((v, i) => v > (bis[i - 1] || 0)) && bis[bis.length - 1] === EINSTIEG_DAUER[fahrzeug],
      JSON.stringify(beats));
  }
  check('Einstieg Cabrio: die Abschnitte heissen wie Rolands Wunsch',
    EINSTIEG_BEATS.cabrio.map((b) => b.name).join(',') === 'gehen,schluessel,tuer,einsteigen,zu',
    EINSTIEG_BEATS.cabrio.map((b) => b.name).join(','));
  check('Einstieg Motorrad: die Abschnitte heissen wie Rolands Wunsch',
    EINSTIEG_BEATS.motorrad.map((b) => b.name).join(',') === 'gehen,helm,aufsteigen,sitzen',
    EINSTIEG_BEATS.motorrad.map((b) => b.name).join(','));
  check('Einstieg: der Abschnitt steht an jeder Zeit fest',
    beatBei('cabrio', 0) === 'gehen' && beatBei('cabrio', 1.2) === 'schluessel'
      && beatBei('cabrio', 2.0) === 'tuer' && beatBei('cabrio', 2.6) === 'einsteigen'
      && beatBei('cabrio', 3.9) === 'zu' && beatBei('cabrio', 99) === 'zu'
      && beatBei('motorrad', 0.4) === 'gehen' && beatBei('motorrad', 1.0) === 'helm'
      && beatBei('motorrad', 2.0) === 'aufsteigen' && beatBei('motorrad', 3.5) === 'sitzen',
    [0, 1.2, 2.0, 2.6, 3.9, 99].map((t) => beatBei('cabrio', t)).join(','));

  const namen = Object.keys(EINSTIEG_SPRITES);
  check('Einstieg: jedes neue Bild benutzt nur Farben der Palette (nichts bleibt unsichtbar)',
    ['cabrio_seite', 'cabrio_besetzt', 'schluessel', 'motorrad_seite', 'helm']
      .every((n) => EINSTIEG_SPRITES[n] && zeichenInPalette(EINSTIEG_SPRITES[n]))
      && namen.every((n) => zeichenInPalette(EINSTIEG_SPRITES[n])), namen.join(','));
  check('Einstieg: jedes Figurenbild benutzt nur Farben der Palette',
    Object.keys(EINSTIEG_FIGUREN).every((n) => zeichenInPalette(EINSTIEG_FIGUREN[n])),
    Object.keys(EINSTIEG_FIGUREN).join(','));
  check('Einstieg: die Palette kennt wirklich jede benutzte Farbe',
    [...Object.values(EINSTIEG_SPRITES), ...Object.values(EINSTIEG_FIGUREN)]
      .every((rows) => zeichenInPalette(rows))
      && ['R', 'r', 'c', 'y', 'Y', 'G', 'g', 'K', 'b', 'a', 'd', 'w', 'h', 'H', 's', 'S', '.', ' ']
        .every((c) => c === ' ' || PAL[c]),
    Object.keys(PAL).join(''));

  check('Einstieg: keine fremden Bilder, keine Schrift, kein Zufall',
    !/https?:|data:|fetch\(|@font-face|Math\.random/.test(QUELLE));
  check('Einstieg: das Modul zeichnet nichts, bevor es gezeichnet wird (kein DOM beim Import)',
    !/document\.|window\./.test(QUELLE));
  check('Einstieg: die Szene liest keine Eingabe (kein Skip, keine Tasten)',
    !/input|keyDown|action\(\)/.test(QUELLE));

  // Wiederverwendung statt Nachbau: die Figur kommt aus sprites.js.
  check('Einstieg: der Koerper der Figur ist der vorhandene Roland (sprites.js)',
    EINSTIEG_FIGUREN.helm_steht.length === SPRITES.roland_idle.length
      && EINSTIEG_FIGUREN.helm_steht[0].length === SPRITES.roland_idle[0].length
      && SPRITES.roland_idle.slice(9).every((z, i) => EINSTIEG_FIGUREN.helm_steht[i + 9] === z),
    `${EINSTIEG_FIGUREN.helm_steht.length}x${EINSTIEG_FIGUREN.helm_steht[0].length}`);
  check('Einstieg: der Helm ersetzt nur den Kopf (Rumpf bleibt unveraendert)',
    mitHelm(SPRITES.roland_idle).slice(9).join('|') === SPRITES.roland_idle.slice(9).join('|'));
  check('Einstieg: das Fahrzeug steht auf der Standlinie (Raeder und Fuesse auf gleicher Hoehe)',
    (() => {
      const s = szeneFuer('cabrio');
      const auto = EINSTIEG_SPRITES.cabrio_seite;
      const unterste = auto.length - 1;
      return s.fahrzeugY + unterste === s.boden && s.boden - SPRITES.roland_idle.length + 1
        + (SPRITES.roland_idle.length - 1) === s.boden;
    })(),
    JSON.stringify({ boden: szeneFuer('cabrio').boden, y: szeneFuer('cabrio').fahrzeugY }));
  check('Einstieg: das Cabrio ist nicht hoeher als die Figur (sonst kippt der Massstab)',
    EINSTIEG_SPRITES.cabrio_seite.length <= SPRITES.roland_idle.length + 4
      && EINSTIEG_SPRITES.motorrad_seite.length < SPRITES.roland_idle.length,
    `Cabrio ${EINSTIEG_SPRITES.cabrio_seite.length}, Motorrad ${EINSTIEG_SPRITES.motorrad_seite.length}, Figur ${SPRITES.roland_idle.length}`);

  // Die Interludien bleiben unangetastet: nur der Import, kein Umbau.
  check('Einstieg: die Interludien-Dateien sind unveraendert (keine Szenen-Aufrufe darin)',
    !/einstieg|cutscene/i.test(CABRIO_QUELLE) && !/einstieg|cutscene/i.test(MOTORRAD_QUELLE)
      && !/einstieg|cutscene/i.test(CABRIO_ART) && !/einstieg|cutscene/i.test(MOTORRAD_ART));
  check('Einstieg: die Kulisse kommt aus den vorhandenen Zeichnern der Fahrt',
    /from '\.\/cabrio-art\.js'/.test(QUELLE) && /from '\.\/motorrad-art\.js'/.test(QUELLE)
      && /drawJourneySky/.test(QUELLE) && /drawNightSky/.test(QUELLE));
}

// ------------------------------------------------------- Der Ausloeser -------
{
  check('Ausloeser: nur die beiden Fahr-Interludien haben eine Szene',
    einstiegMoeglichFuerLevel(buildCabrio()) === true
      && einstiegMoeglichFuerLevel(buildMotorrad()) === true
      && einstiegMoeglichFuerLevel(buildAkt2()) === false
      && einstiegMoeglichFuerLevel(null) === false);

  const ereignisse = [];
  const neu = einstiegStarten(buildCabrio(), { view: VIEW_DESKTOP, events: (e) => ereignisse.push(e) });
  check('Ausloeser: der Start des Interludiums setzt die Szene',
    !!neu && neu.fahrzeug === 'cabrio' && neu.t === 0 && neu.fertig === false,
    JSON.stringify({ fahrzeug: neu && neu.fahrzeug, t: neu && neu.t }));
  check('Ausloeser: die Szene meldet sich mit Fahrzeug und Merker (main.js schreibt ihn)',
    ereignisse.length === 1 && ereignisse[0].type === 'einstieg'
      && ereignisse[0].fahrzeug === 'cabrio' && ereignisse[0].merker === EINSTIEG_MERKER.cabrio,
    JSON.stringify(ereignisse));
  check('Ausloeser: ein Akt ohne Fahrt bekommt keine Szene',
    einstiegStarten(buildAkt2(), { view: VIEW_DESKTOP }) === null
      && einstiegStarten(null, { view: VIEW_DESKTOP }) === null);
  check('Ausloeser: ein fremdes Fahrzeug bekommt keine Szene',
    einstiegStarten({ mode: 'racer', journey: { art: 'raumschiff' } }, { view: VIEW_DESKTOP }) === null);
  // Der Startpfad liest den Spielstand nicht mehr: der Merker kann den zweiten
  // Lauf nicht unterdruecken. Die Aufzeichnung selbst bleibt lesbar.
  check('Ausloeser: der Startpfad liest den Merker nicht mehr (keine Unterdrueckung)',
    (() => {
      const koerper = (QUELLE.match(/export function einstiegStarten\([\s\S]*?\n}/) || [''])[0];
      return koerper.length > 0 && !/save\[|einstiegGelaufen|einstiegMoeglich/.test(koerper);
    })(),
    (QUELLE.match(/export function einstiegStarten\([\s\S]*?\n}/) || [''])[0].split('\n')[0]);
  check('Ausloeser: die Aufzeichnung im Spielstand bleibt lesbar (einstiegGelaufen)',
    einstiegGelaufen('cabrio', {}) === false
      && einstiegGelaufen('cabrio', { [EINSTIEG_MERKER.cabrio]: true }) === true
      && einstiegGelaufen('raumschiff', { [EINSTIEG_MERKER.cabrio]: true }) === false,
    JSON.stringify(EINSTIEG_MERKER));
}

// --------------------------- Bei jedem Start (Roland, 13.09.) ----------------
// Der Live-Test zeigte: die Einstiegs-Szene kam nur einmal je Fahrzeug. Rolands
// Auflage: bei jedem Start des jeweiligen Fahr-Interludiums laeuft sie wieder.
// Drei volle Runden je Fahrzeug — jede mit Ausloeser, Ereignis und durchgelaufener
// Szene; der Spielstand wird dabei genau wie in main.js gefuehrt (der Merker
// steht ab der ersten Runde drin und aendert am naechsten Lauf nichts).
{
  const szenen = [];
  const ereignis = [];
  const merkerSpur = { cabrio: [], motorrad: [] };
  for (const fahrzeug of ['cabrio', 'motorrad']) {
    const level = fahrzeug === 'cabrio' ? buildCabrio() : buildMotorrad();
    const save = {};
    for (let runde = 1; runde <= 3; runde++) {
      const vorher = save[EINSTIEG_MERKER[fahrzeug]] === true;
      const s = einstiegStarten(level, {
        save,
        view: VIEW_DESKTOP,
        events: (e) => { ereignis.push(e); save[e.merker] = true; },
      });
      if (!s) { szenen.push(`${fahrzeug}:${runde}:keine`); continue; }
      szenen.push(`${fahrzeug}:${runde}:${s.beat}`);
      merkerSpur[fahrzeug].push(`${vorher ? 'war' : 'leer'}->${save[EINSTIEG_MERKER[fahrzeug]] === true}`);
      lauf(s, s.dauer);
    }
  }
  check('Jeder Start: die Szene laeuft in allen drei Runden je Fahrzeug wieder an',
    szenen.join(',') === 'cabrio:1:gehen,cabrio:2:gehen,cabrio:3:gehen,'
      + 'motorrad:1:gehen,motorrad:2:gehen,motorrad:3:gehen',
    szenen.join(',') || 'keine Szene');
  check('Jeder Start: jeder Lauf meldet sein Ereignis (sechs Laeufe, sechs Schreibungen)',
    ereignis.filter((e) => e.type === 'einstieg').length === 6
      && ereignis.every((e) => e.merker === EINSTIEG_MERKER[e.fahrzeug]),
    `${ereignis.length} Ereignisse`);
  check('Jeder Start: der Merker steht ab der zweiten Runde im Spielstand — die Szene laeuft trotzdem',
    merkerSpur.cabrio.join(',') === 'leer->true,war->true,war->true'
      && merkerSpur.motorrad.join(',') === 'leer->true,war->true,war->true',
    JSON.stringify(merkerSpur));
}

// ------------------------------------------------------- Die Cabrio-Szene ----
{
  const s = szeneFuer('cabrio');
  check('Cabrio: die Figur tritt von links an und steht am Anfang ausserhalb des Bildes',
    s.figurlage().x < 0 && s.figurlage().x === s.startX(), String(s.figurlage().x));

  lauf(s, 0.55);
  check('Cabrio: die Figur geht (Laufbild, noch nicht an der Tuer)',
    s.beat === 'gehen' && ['gehen1', 'gehen2'].includes(s.figurlage().art) && s.figurX() > s.startX()
      && s.figurX() < s.stehX(), JSON.stringify({ x: s.figurX(), steh: s.stehX() }));

  lauf(s, 0.6);   // t = 1.15
  check('Cabrio: mit dem Schluessel steht sie an der Tuer',
    s.beat === 'schluessel' && s.figurX() === s.stehX() && s.figurlage().art === 'stehen'
      && s.schluesselInHand() === true,
    JSON.stringify({ x: s.figurX(), steh: s.stehX(), keys: s.schluesselInHand() }));
  check('Cabrio: die Tuer ist noch zu, solange der Schluessel in der Hand ist',
    s.tuerWeite() === 0 && s.wagenZustand() === 'zu', `${s.tuerWeite()}px`);

  lauf(s, 0.85);  // t = 2.00
  check('Cabrio: danach geht die Tuer auf (die Oeffnung waechst)',
    s.tuerWeite() > 0 && s.tuerWeite() < TUER_WEITE && s.wagenZustand() === 'zu',
    JSON.stringify({ weite: s.tuerWeite(), zustand: s.wagenZustand() }));

  lauf(s, 0.40);  // t = 2.40
  check('Cabrio: die Tuer steht ganz offen',
    s.tuerWeite() === TUER_WEITE && s.beat === 'einsteigen',
    JSON.stringify({ weite: s.tuerWeite(), beat: s.beat }));

  lauf(s, 0.20);  // t = 2.60
  check('Cabrio: beim Einsteigen sinkt die Figur sichtbar in den Wagen',
    s.beat === 'einsteigen' && s.sinkTiefe() > 0 && s.figurDraussen() === true,
    JSON.stringify({ sink: s.sinkTiefe(), draussen: s.figurDraussen() }));

  lauf(s, 0.30);  // t = 2.90
  check('Cabrio: danach ist sie im Wagen (keine Figur mehr draussen) und der Fahrer sitzt drin',
    s.figurDraussen() === false && s.figurlage() === null
      && s.wagenZustand() === 'besetzt' && s.tuerWeite() > 0,
    JSON.stringify({ draussen: s.figurDraussen(), zustand: s.wagenZustand() }));
  check('Cabrio: der Schluessel ist mit ihr im Wagen verschwunden',
    s.schluesselInHand() === false || s.figurDraussen(), String(s.schluesselInHand()));

  lauf(s, s.dauer);
  check('Cabrio: die Szene endet nach der Dauer',
    s.fertig === true && s.t === EINSTIEG_DAUER.cabrio && s.beat === 'zu' && s.fortschritt === 1,
    JSON.stringify({ t: s.t, fertig: s.fertig }));
  check('Cabrio: am Ende ist die Tuer wieder zu und der Fahrer sitzt im Wagen',
    s.tuerWeite() === 0 && s.wagenZustand() === 'besetzt',
    JSON.stringify({ weite: s.tuerWeite(), zustand: s.wagenZustand() }));
  check('Cabrio: die Schaltzeiten liegen in der richtigen Reihenfolge',
    EINSTIEG_BEATS.cabrio[1].bis <= CABRIO_TUER_AB && CABRIO_TUER_BIS <= EINSTIEG_BEATS.cabrio[2].bis
      && EINSTIEG_BEATS.cabrio[2].bis <= CABRIO_WEG_AB && CABRIO_WEG_AB <= CABRIO_FAHRER_AB
      && CABRIO_FAHRER_AB <= CABRIO_SCHLIESS_AB && CABRIO_ZU_BIS <= s.dauer,
    JSON.stringify({ tuer: CABRIO_TUER_AB, offen: CABRIO_TUER_BIS, weg: CABRIO_WEG_AB,
      fahrer: CABRIO_FAHRER_AB, schliessen: CABRIO_SCHLIESS_AB, zu: CABRIO_ZU_BIS }));
  check('Cabrio: update meldet am Ende fertig', s.update(1 / 60) === true && s.t === EINSTIEG_DAUER.cabrio);
}

// ----------------------------------------------------- Die Motorrad-Szene ---
{
  const s = szeneFuer('motorrad');
  lauf(s, 0.45);
  check('Motorrad: die Figur geht zur Maschine', s.beat === 'gehen' && ['gehen1', 'gehen2'].includes(s.figurlage().art),
    s.beat);
  check('Motorrad: der Helm steht am Anfang auf dem Sitz (in keiner Hand)',
    s.helmInHand() === null && s.helmAuf() === false, JSON.stringify(s.helmInHand()));

  lauf(s, 0.55);  // t ~ 1.00, mitten im Greifen
  check('Motorrad: der Helm ist beim Aufsetzen in der Hand, aber noch nicht auf',
    s.helmAuf() === false && !!s.helmInHand()
      && s.helmInHand().y < s.fahrzeugY + 6,
    JSON.stringify({ t: s.t, hand: s.helmInHand() }));
  check('Motorrad: der Helm liegt nicht mehr auf dem Sitz, solange er getragen wird',
    s.helmInHand() === null || s.helmInHand().x > s.motorradX() + 7,
    JSON.stringify(s.helmInHand()));
  lauf(s, 0.60);  // t ~ 1.60, der Helm sitzt
  check('Motorrad: danach sitzt der Helm auf dem Kopf',
    s.helmAuf() === true && s.helmInHand() === null && s.figurlage().rows === EINSTIEG_FIGUREN.helm_steht,
    JSON.stringify({ t: s.t, auf: s.helmAuf() }));
  check('Motorrad: der Helm liegt nicht mehr auf dem Sitz, solange er getragen wird',
    s.helmInHand() === null, 'Helm zweimal im Bild');

  lauf(s, 1.00);  // t ~ 2.60
  check('Motorrad: danach sitzt die Figur auf der Maschine',
    s.sitztAuf() === true && s.figurDraussen() === false && !!s.sitzlage()
      && s.sitzlage().rows === EINSTIEG_FIGUREN.sitzt_helm,
    JSON.stringify({ t: s.t, sitzt: s.sitztAuf(), lage: s.sitzlage() && s.sitzlage().x }));

  lauf(s, s.dauer);
  check('Motorrad: die Szene endet nach der Dauer',
    s.fertig === true && s.t === EINSTIEG_DAUER.motorrad && s.beat === 'sitzen',
    JSON.stringify({ t: s.t, beat: s.beat }));
  check('Motorrad: die Schaltzeiten liegen in der richtigen Reihenfolge',
    EINSTIEG_BEATS.motorrad[1].bis < MOTORRAD_SITZT_AB && MOTORRAD_HELM_AB
      < EINSTIEG_BEATS.motorrad[1].bis && MOTORRAD_SITZT_AB < s.dauer,
    JSON.stringify({ helm: MOTORRAD_HELM_AB, sitzt: MOTORRAD_SITZT_AB }));
  check('Motorrad: die sitzende Figur ist nicht groesser als die stehende',
    EINSTIEG_FIGUREN.sitzt.length <= SPRITES.roland_idle.length,
    `${EINSTIEG_FIGUREN.sitzt.length} zu ${SPRITES.roland_idle.length}`);
}

// ---------------------------------------------- Bildnamen und Sprite-Cache ---
// `spriteCanvas` cacht über (Name + Palette). Ohne eigenen Namen je Haltung
// zeigt der Cache das ERSTE Bild in jeder Haltung — der Fahrer säße dann mit
// dem Standbild im Sattel und die Laufbilder wären identisch.
{
  const gesehen = new Map();       // Bildname -> Inhalt der Zeilen
  const mehrdeutig = [];
  for (const fahrzeug of ['cabrio', 'motorrad']) {
    const s = szeneFuer(fahrzeug);
    for (let i = 0; i <= 400; i++) {
      const lagen = [s.figurlage(), s.sitzlage()].filter(Boolean);
      for (const lage of lagen) {
        const inhalt = lage.rows.join('|');
        if (gesehen.has(lage.art) && gesehen.get(lage.art) !== inhalt) {
          mehrdeutig.push(`${fahrzeug}:${lage.art}`);
        }
        gesehen.set(lage.art, inhalt);
      }
      s.update(1 / 60);
    }
  }
  check('Einstieg: jede Haltung hat einen eigenen Bildnamen (kein Sprite-Cache-Fehler)',
    mehrdeutig.length === 0, mehrdeutig.join(','));
  check('Einstieg: Lauf-, Stand-, Helm- und Sitzbilder kommen wirklich vor',
    ['gehen1', 'gehen2', 'stehen', 'helm', 'sitz-helm'].every((n) => gesehen.has(n)),
    [...gesehen.keys()].join(','));
}

// --------------------------------------- Die Fahrt bleibt unveraendert -------
{
  const level = buildCabrio();
  const vorher = JSON.stringify(level);
  const s = szeneFuer('cabrio');
  const racer = new Racer({ level, input: createInput(null), audio: AUDIO, view: VIEW_DESKTOP });
  const start = JSON.stringify(racer.hud);
  lauf(s, s.dauer);
  check('Fahrt: die Szene fasst den Racer nicht an (kein Zugriff, keine Referenz)',
    !('racer' in s) && racer.position === 0 && racer.time === 0 && racer.state === 'play',
    JSON.stringify({ position: racer.position, time: racer.time, state: racer.state }));
  check('Fahrt: das Level bleibt unveraendert (die Kulisse schreibt nichts hinein)',
    JSON.stringify(level) === vorher);
  check('Fahrt: der Wagen steht waehrend der Szene still (kein Tacho, keine Strecke)',
    racer.hud.speed === 0 && racer.hud.zeit === 0 && racer.hud.strecke === 0,
    JSON.stringify({ speed: racer.hud.speed, zeit: racer.hud.zeit }));
  for (let i = 0; i < 120; i++) racer.update(1 / 60);   // 2 s nach dem Ende der Szene
  check('Fahrt: danach faehrt sie unveraendert los',
    racer.position > 0 && racer.time > 1.9 && racer.state === 'play'
      && racer.hud.modus === 'racer' && racer.hud.speed > 25,
    JSON.stringify({ position: Math.round(racer.position), time: racer.time, speed: racer.hud.speed }));
  check('Fahrt: die Fahr-HUD-Form ist vor und nach der Szene dieselbe',
    JSON.stringify(racer.hud) !== start && Object.keys(racer.hud).join(',')
      === Object.keys(JSON.parse(start)).join(','),
    Object.keys(racer.hud).join(','));

  // Das Motorrad ebenso: Szene danach, Fahrt unveraendert.
  const mlevel = buildMotorrad();
  const vorherM = JSON.stringify(mlevel);
  const ms = szeneFuer('motorrad');
  const mracer = new Racer({ level: mlevel, input: createInput(null), audio: AUDIO, view: VIEW_DESKTOP });
  lauf(ms, ms.dauer);
  for (let i = 0; i < 120; i++) mracer.update(1 / 60);
  check('Fahrt Motorrad: die Szene laesst die Nachtfahrt unveraendert',
    mracer.position > 0 && mracer.state === 'play' && mracer.nacht === true
      && JSON.stringify(mlevel) === vorherM,
    JSON.stringify({ position: Math.round(mracer.position), nacht: mracer.nacht }));
}

// ------------------------------------------------- Verdrahtung in main.js ---
{
  check('Verdrahtung: main.js kennt das Szenen-Modul',
    /from '\.\/cutscene-einstieg\.js'/.test(MAIN) && /einstiegStarten/.test(MAIN));
  check('Verdrahtung: genau ein Aufruf am Start der Fahrt (in newGame), daneben nur der Pruefhaken',
    (MAIN.match(/einstiegStarten\(/g) || []).length === 2
      && /racer = new Racer\([\s\S]{0,400}?einstieg = einstiegStarten\(LEVEL, \{ save: loadSave\(\), view: VIEW, events: onGameEvent \}\)/.test(MAIN)
      && /starten: \(level = LEVEL\)/.test(MAIN),
    String((MAIN.match(/einstiegStarten\(/g) || []).length));
  check('Verdrahtung: kein Doppelstart, waehrend die Szene laeuft (der Pruefhaken startet keine zweite)',
    /starten: \(level = LEVEL\) => \{[\s\S]{0,300}?if \(einstieg\) return false;/.test(MAIN),
    'starten-Haken ohne Guard');
  check('Verdrahtung: die Aufzeichnung im Spielstand bleibt lesbar (einstieg.gesehen ueber einstiegGelaufen)',
    /gesehen\(\) \{[\s\S]{0,240}?einstiegGelaufen\('cabrio'/.test(MAIN)
      && /einstiegGelaufen\('motorrad'/.test(MAIN));
  check('Verdrahtung: ein Merker wird beim Start der Szene in den Spielstand geschrieben',
    /e\.type === 'einstieg'\)\s*writeSave\(\{ \[e\.merker\]: true \}\)/.test(MAIN)
      || /type === 'einstieg'[\s\S]{0,80}writeSave\(\{ \[e\.merker\]: true \}\)/.test(MAIN));
  check('Verdrahtung: die Schleife zeigt die Szene statt der Fahrt und laesst danach den Racer weiterlaufen',
    /if \(einstieg\)/.test(MAIN) && /einstieg\.update\(dt\)/.test(MAIN) && /einstieg = null/.test(MAIN));
  check('Verdrahtung: die Szene wird beim Verlassen des Spiels mit abgeraeumt',
    /quitBtn\.onclick[\s\S]{0,200}einstieg = null/.test(MAIN));
  check('Verdrahtung: der Zustand steht fuer die Pruefungen bereit (window.__roland.einstieg)',
    /einstieg: \{/.test(MAIN) && /get aktiv\(\) \{ return !!einstieg; \}/.test(MAIN));
}

console.log(results.join('\n'));
const geprueft = results.filter((r) => /^(PASS|FAIL)/.test(r)).length;
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${geprueft} Einstiegs-Checks bestanden`);
process.exit(failed ? 1 : 0);
