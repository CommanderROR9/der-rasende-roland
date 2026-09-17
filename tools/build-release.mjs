// tools/build-release.mjs — baut das Ein-Datei-Artefakt „Doppelklick läuft".
//
// Warum: `index.html` lädt das Spiel als ES-Modul (`<script type="module"
// src="./src/main.js">`). Über `file://` blockieren Chrome und Edge das
// (CORS, origin null) — der Titelscreen steht, alles Interaktive bleibt tot.
// Ein klassisches IIFE-Bundle, direkt in die HTML-Datei eingebettet, hat
// dieses Problem nicht: EINE Datei, Doppelklick, kein Server, kein Flag.
//
// Ablauf: src/main.js mit esbuild bündeln -> Bundle inline in eine Kopie von
// index.html einsetzen -> dist/der-rasende-roland.html schreiben.
// Aufruf: npm run build:release

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = fileURLToPath(new URL('..', import.meta.url));
const QUELLE = join(WURZEL, 'index.html');
const ZIEL = join(WURZEL, 'dist', 'der-rasende-roland.html');

// Genau dieser Marker wird ersetzt — ändert er sich, bricht der Bau ab,
// statt still ein Artefakt ohne Spiel auszuliefern.
const MARKER = '<script type="module" src="./src/main.js"></script>';

const html = readFileSync(QUELLE, 'utf8');

const treffer = html.split(MARKER).length - 1;
if (treffer !== 1) {
  console.error(`FEHLER: Marker ${JSON.stringify(MARKER)} kommt ${treffer}× in index.html vor (erwartet: genau 1×).`);
  process.exit(1);
}

const ergebnis = await build({
  entryPoints: [join(WURZEL, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  charset: 'utf8',
  write: false,
  legalComments: 'none',
});
const bundle = ergebnis.outputFiles[0].text;

if (bundle.includes('</script')) {
  console.error('FEHLER: Das Bundle enthält "</script" — würde die HTML-Datei zerschneiden.');
  process.exit(1);
}
if (bundle.includes('<!--')) {
  console.error('FEHLER: Das Bundle enthält "<!--" — im Inline-Script ein Parser-Risiko.');
  process.exit(1);
}

// Sicherheitsnetz: schließt das Bundle doch eine Script-Endmarke, wird sie
// entschärft (JS sieht durch den Backslash dieselbe Zeichenkette).
const safe = bundle.replace(/<\/script/gi, '<\\/script');

const artefakt = html.replace(MARKER, () => `<script>\n${safe}\n</script>`);
mkdirSync(join(WURZEL, 'dist'), { recursive: true });
writeFileSync(ZIEL, artefakt, 'utf8');

const sha = createHash('sha256').update(artefakt, 'utf8').digest('hex');
const bytes = Buffer.byteLength(artefakt, 'utf8');
console.log(`Artefakt: ${ZIEL}`);
console.log(`Bytes:    ${bytes}`);
console.log(`sha256:   ${sha}`);
console.log(`Bundle:   ${Buffer.byteLength(bundle, 'utf8')} Bytes (esbuild, iife, minify)`);
