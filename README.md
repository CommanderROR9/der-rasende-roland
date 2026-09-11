# Der Rasende Roland

Pixel-Art-Sidescroller über 41 Dienstjahre im Orchester — vom zweiten Untergeschoss
bis in den Kleingarten. Browser-Spiel, keine Installation, keine Abhängigkeiten.

**Spielen:** https://commanderror9.github.io/der-rasende-roland/

## Akt 1 — Die Katakomben (spielbar)

Der Weg führt aus der Garderobe über Notenblatt-Stufen nach oben, durch eine Luke
wieder hinunter, an Piccolo und Sopran vorbei, durch die Diensttür ins Archiv,
über das Absperrband zur Obermaschinerie und endet am Materialaufzug.

**Steuerung**

| Taste | Wirkung |
|---|---|
| `A` / `D` bzw. `←` `→` | gehen |
| `SPACE` / `W` / `↑` | springen (`↓` + springen = durch Plattform fallen) |
| `E` / `J` | Tritt — im Takt getroffen wird jeder Gegner still |
| `S` / `↓` | ducken (und in Nischen verschwinden) |
| `P` / `ESC` | Pause |

Auf dem Smartphone: Stick unten links, `SPRUNG` und `TRITT` unten rechts.
Für mehr Übersicht quer halten.

## Mechaniken

**Kleiderordnung ist Werkzeug.** Umgezogen wird am Kleiderständer (einfach berühren):

| Kluft | Tempo | Wirkung |
|---|---|---|
| Schwarzes Hemd | 118 | leise und schnell, öffnet nichts |
| Anzug + Krawatte | 104 | öffnet Diensttüren |
| Frack | 92 | öffnet Absperrbänder, aber Hitze steigt, Glanzalarm auf dem Haarkranz |

**Frack:** Hitze steigt im Frack und unter Scheinwerfern. Bei 100 % gibt es einen
Kreislauf — kein Tod, nur ein paar Sekunden Schwäche. Ist es zu heiß, reißt `E`
den Frack auf: **Frack-Off**, einmal pro Durchgang, Hitze auf null und kurz schneller.

**Takt:** Die Welt läuft auf 100 bpm (sichtbarer Puls am Bildrand). Piccolos feuern
auf den Schlag, der **Beton-Tritt** im Takt (`E`) betäubt jeden Gegner in Reichweite.

**Gefahren:** Piccolo (Schallwellen, Stumpf), Sopran (lebensgefährlich laut — nur
Ohropax oder Deckung in einer Nische hilft), Tenor (verschleppt das Tempo und macht
alles zäh), rollender Instrumentenkoffer (drüberspringen), morsche Notenblätter
(brechen nach kurzer Zeit weg, wachsen aber nach).

**Belohnung:** Am Ende von Akt 1 wartet das **Feierabendbier**. Bierdeckel sind die
Sammelobjekte, für einen davon muss man auf die morsche Kante steigen.

## Technik

- Vanilla ES-Module + Canvas 2D, **kein Bundler, kein Framework, keine externen Requests**
- interne Auflösung 384×216, ganzzahlige Skalierung, `image-rendering: pixelated`
- Grafik komplett code-nativ (Sprite-Matrizen + Palettenvarianten je Kluft), keine Binärassets
- Sound per WebAudio-Synth (Chiptune), keine Audiodateien
- Fortschritt nur lokal in `localStorage`, kein Server, kein Tracking

```
index.html          Shell, HUD, Overlays
src/config.js       Konstanten, Palette, Kleiderordnung, Physik
src/sprites.js      Pixel-Art als Textmatrizen
src/render.js       Pixel-Renderer, Sprite-Cache
src/input.js        Tastatur + Touch
src/audio.js        WebAudio-Synth
src/world.js        Leveldaten Akt 1 (Fels wird zu Hohlräumen geschnitten)
src/game.js         Simulation (bewusst DOM-frei)
src/main.js         Verkabelung, Overlays, Speicherung
tests/smoke.test.mjs 106 headless Checks
```

## Tests

```bash
npm test          # oder: node tests/smoke.test.mjs
npm run serve     # lokaler Server auf http://127.0.0.1:8123
```

Die Tests fahren dieselbe Simulation wie das Spiel ohne Browser. Geprüft werden
Physik, Takt, alle Gegnertypen, Kleiderwechsel und Türen, Hitze und Frack-Off,
Items, Speicherpunkte, Aktabschluss, Langzeitstabilität — und mit einem Bot ein
kompletter Durchlauf über die gebaute Route bis zum Aufzug. Damit ist belegt, dass
jede Stufe innerhalb der Sprunghöhe liegt und es keinen Abkürzungsweg am Boden gibt.

## Nächste Akte (geplant)

Akt 2 Probenraum · Cabrio-Interludium (Pseudo-3D) · Akt 3 Open Air mit Wetter ·
Akt 4 Orchestergraben · Motorrad-Interludium · Finale mit Frack-Off · Epilog
Kleingarten. Konzept: [docs/KONZEPT.md](docs/KONZEPT.md)
