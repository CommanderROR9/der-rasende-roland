// tests/storage-haertung.test.mjs — Wächter für die Speicher-Härtung (Release 1.1):
// Ist localStorage gesperrt (file://-Seiten mit blockierten Cookies, Sandbox-Iframes,
// privater Modus), darf KEIN Speicherzugriff werfen — das Spiel läuft dann mit einem
// Speicher im Arbeitsspeicher weiter (ohne Persistenz über den Neustart hinweg).
// Mit funktionierendem localStorage bleibt das Verhalten unverändert.
//
// Geprüft wird (1) die Kapsel src/speicher.js funktional gegen einen gesperrten,
// einen werfenden und einen arbeitenden Speicher und (2) dass src/ keinen direkten
// localStorage-Zugriff mehr hat.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const results = [];
let failed = 0;
function check(name, condition, extra = '') {
  const ok = !!condition;
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !extra ? '' : ` — ${extra}`}`);
}

// --- Attrappen für den Außenspeicher ----------------------------------------
function werfendeMethoden() {
  const wirf = () => { throw new Error('SecurityError: Zugriff auf den Speicher verweigert'); };
  return { getItem: wirf, setItem: wirf, removeItem: wirf, daten: null };
}
function arbeitsSpeicher(start = {}) {
  const daten = new Map(Object.entries(start));
  return {
    daten,
    getItem: (k) => (daten.has(k) ? daten.get(k) : null),
    setItem: (k, v) => { daten.set(k, String(v)); },
    removeItem: (k) => { daten.delete(k); },
  };
}
function vollerSpeicher(start = {}) {
  const s = arbeitsSpeicher(start);
  return { ...s, setItem: () => { throw new Error('QuotaExceededError'); } };
}

const URSPRUNG = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
function setzeAussenspeicher(s) {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => s });
}
function sperreZugriff() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => { throw new Error('SecurityError: localStorage ist gesperrt'); },
  });
}

// --- 1. Die Kapsel laden (fehlt sie, wird das hier rot statt zu crashen) ----
let kapsel = null;
try { kapsel = await import('../src/speicher.js'); }
catch (e) { /* Befund unten */ }
check('Kapsel: src/speicher.js lädt (speicherLesen/Schreiben/Loeschen vorhanden)',
  !!(kapsel && kapsel.speicherLesen && kapsel.speicherSchreiben && kapsel.speicherLoeschen),
  kapsel ? 'Exporte fehlen' : 'Modul nicht gefunden');

if (kapsel) {
  // --- 2. Der Zugriff auf localStorage selbst wirft (Chrome-SecurityError) ---
  {
    sperreZugriff();
    let fehler = '';
    try {
      kapsel.speicherSchreiben('probe/gesperrt', 'wert');
      kapsel.speicherLesen('probe/gesperrt');
    } catch (e) { fehler = e.message; }
    check('Gesperrter Zugriff: Lesen/Schreiben/Löschen werfen nicht', fehler === '', fehler);
    check('Gesperrter Zugriff: der Wert bleibt im Arbeitsspeicher lesbar',
      kapsel.speicherLesen('probe/gesperrt') === 'wert');
    let loeschFehler = '';
    try { kapsel.speicherLoeschen('probe/gesperrt'); } catch (e) { loeschFehler = e.message; }
    check('Gesperrter Zugriff: Löschen wirft nicht und räumt auch den Arbeitsspeicher',
      loeschFehler === '' && kapsel.speicherLesen('probe/gesperrt') === null, loeschFehler);
  }

  // --- 3. Der Speicher ist da, jede Methode wirft ---------------------------
  {
    setzeAussenspeicher(werfendeMethoden());
    let fehler = '';
    try { kapsel.speicherSchreiben('probe/werfend', '2'); } catch (e) { fehler = e.message; }
    check('Werfende Methoden: Schreiben wirft nicht', fehler === '', fehler);
    check('Werfende Methoden: Rückfall auf den Arbeitsspeicher greift',
      kapsel.speicherLesen('probe/werfend') === '2');
    check('Werfende Methoden: Löschen wirft nicht und räumt auf',
      kapsel.speicherLoeschen('probe/werfend') === false && kapsel.speicherLesen('probe/werfend') === null);
  }

  // --- 4. Arbeitender Speicher: Verhalten unverändert ----------------------
  {
    const echt = arbeitsSpeicher();
    setzeAussenspeicher(echt);
    check('Arbeitender Speicher: Schreiben landet unverändert im Außenspeicher',
      kapsel.speicherSchreiben('probe/echt', 'abc') === true && echt.daten.get('probe/echt') === 'abc');
    echt.daten.set('probe/fremd', 'von-aussen');
    check('Arbeitender Speicher: Lesen kommt weiter aus dem Außenspeicher',
      kapsel.speicherLesen('probe/fremd') === 'von-aussen');
    check('Arbeitender Speicher: Löschen entfernt den Wert außen',
      kapsel.speicherLoeschen('probe/echt') === true && echt.daten.has('probe/echt') === false);
  }

  // --- 5. Kontingent voll: nur setItem wirft ------------------------------
  {
    const voll = vollerSpeicher();
    setzeAussenspeicher(voll);
    let fehler = '';
    let geschrieben = null;
    try { geschrieben = kapsel.speicherSchreiben('probe/voll', '3'); } catch (e) { fehler = e.message; }
    check('Volles Kontingent: Schreiben wirft nicht', fehler === '', fehler);
    check('Volles Kontingent: der Wert ist trotzdem lesbar (Arbeitsspeicher)',
      geschrieben === false && kapsel.speicherLesen('probe/voll') === '3');
    kapsel.speicherLoeschen('probe/voll');
  }
}

if (URSPRUNG) Object.defineProperty(globalThis, 'localStorage', URSPRUNG);

// --- 6. Kein direkter Zugriff mehr in src/ --------------------------------
{
  const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
  const dateien = readdirSync(srcDir).filter((n) => n.endsWith('.js'));
  const direkt = dateien.filter((f) =>
    readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
      .split('\n')
      .some((z) => /localStorage/.test(z) && !z.trimStart().startsWith('//')));
  check('Kapselung: nur src/speicher.js nennt localStorage direkt',
    direkt.length === 1 && direkt[0] === 'speicher.js', direkt.join(', '));

  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  check('Kapselung: src/main.js speichert über die Kapsel (Lesen/Schreiben/Löschen)',
    main.includes('speicherLesen(SAVE_KEY') && main.includes('speicherSchreiben(SAVE_KEY')
    && main.includes('speicherLoeschen(SAVE_KEY'));
  check('Spielstand: der Lesepfad migriert weiter über migriereSave',
    main.includes('migriereSave(JSON.parse(speicherLesen(SAVE_KEY))'));
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} Speicher-Härtungs-Checks bestanden`);
process.exit(failed ? 1 : 0);
