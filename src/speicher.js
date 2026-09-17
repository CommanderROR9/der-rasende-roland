// speicher.js — gekapselter Zugriff auf den Browserspeicher (localStorage).
//
// Warum: Manche Umgebungen sperren localStorage komplett — etwa `file://`-Seiten
// mit blockierten Cookies, Sandbox-Iframes oder der private Modus. Schon der
// Zugriff auf `window.localStorage` kann dort werfen. Diese Kapsel fängt das ab
// und arbeitet dann mit einem Speicher im Arbeitsspeicher weiter: das Spiel
// läuft ohne Persistenz über den Neustart hinweg weiter, statt abzustürzen.
// Mit funktionierendem localStorage ist das Verhalten unverändert.

const SPEICHER = new Map();    // Rückfall: hält die Werte dieser Sitzung
const NUR_MEMORY = new Set();  // Schlüssel, die der Außenspeicher nicht annimmt

/** Der Außenspeicher — oder null, wenn schon der Zugriff verboten ist. */
function aussen() {
  try {
    const s = globalThis.localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch { return null; }
}

/** Liest einen Wert; ohne Außenspeicher aus dem Arbeitsspeicher. */
export function speicherLesen(schluessel) {
  if (!NUR_MEMORY.has(schluessel)) {
    const s = aussen();
    if (s) {
      try { return s.getItem(schluessel); }
      catch { NUR_MEMORY.add(schluessel); }
    }
  }
  return SPEICHER.has(schluessel) ? SPEICHER.get(schluessel) : null;
}

/** Schreibt einen Wert; nimmt der Außenspeicher ihn nicht an, gilt der Wert
 *  aus dem Arbeitsspeicher. @returns true, wenn der Außenspeicher ihn hat. */
export function speicherSchreiben(schluessel, wert) {
  const text = String(wert);
  SPEICHER.set(schluessel, text);
  const s = aussen();
  if (!s) return false;
  try { s.setItem(schluessel, text); NUR_MEMORY.delete(schluessel); return true; }
  catch { NUR_MEMORY.add(schluessel); return false; }
}

/** Löscht einen Wert aus beiden Speichern. */
export function speicherLoeschen(schluessel) {
  SPEICHER.delete(schluessel);
  NUR_MEMORY.delete(schluessel);
  const s = aussen();
  if (!s) return false;
  try { s.removeItem(schluessel); return true; } catch { return false; }
}
