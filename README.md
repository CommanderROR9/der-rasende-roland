# Der Rasende Roland

Pixel-Art-Sidescroller über 41 Dienstjahre im Orchester — vom zweiten Untergeschoss
bis in den Kleingarten. Browser-Spiel, keine Installation, keine Abhängigkeiten.

**Spielen:** https://commanderror9.github.io/der-rasende-roland/

## Die Akte

**Akt 1 — Die Katakomben.** Aus der Garderobe über Notenblatt-Stufen nach oben, durch
eine Luke wieder hinunter, an Piccolo und Sopran vorbei, durch die Diensttür ins Archiv,
über das Absperrband zur Obermaschinerie — Ende am Materialaufzug. Belohnung:
**Feierabendbier**.

**Akt 2 — Die Probe.** Oben angekommen geht es durch den Flur in den Probenraum.
Zwei Wege führen durch den Saal: unten zwischen den Stühlen an Sopran und Piccolo-Duo
vorbei, oder oben über die Notenpulte und die Beleuchtungsbrücke. In der Mitte steht
der Dirigent auf dem Podium und wirft Taktstöcke. Hinter der Bühne sperrt die
Bühnentür, und die geht nur im **Frack** auf. Belohnung: **Pausenbrot** — und für den
nächsten Akt ein Nerv mehr.

Zwischendurch wechselt das Tempo: unterwegs gibt der Dirigent **Allegro** und später
**Andante** vor, sichtbar im HUD und angesagt als Meldung.

**Interludium — Cabrio zum Open Air.** Pseudo-3D-Landstraße in der Abendsonne, Sicht
von hinten aufs offene Cabrio. Unterwegs ist einiges los: Kolonnen und Gegenverkehr,
parkende LKW, Radarfallen (wer zu schnell vorbeifährt, wird geblitzt), Schlaglöcher,
Bäume und Schilder am Rand. **Gas gibt es von allein**, man lenkt nur (`A`/`D`,
am Handy der Stick), `E` bzw. der `TRITT`-Knopf bremst. Unterwegs: Gegenverkehr,
Baustellen-LKW, ein Regenguss mit weniger Grip, Radarfallen am Straßenrand — und der
Notenständer auf dem Beifahrersitz, der in jeder engen Kurve umkippt. Angekommen ist,
wer die Strecke einmal durchfährt; die Abschlusstafel zeigt Fahrzeit, Höchsttempo,
Kontakte und ob es geregnet hat.

**Fortschritt:** Nach Akt 1 startet das Spiel beim nächsten Mal direkt in Akt 2. Im
Titelbild gibt es dafür einen Wechsler („AKT 1 NOCHMAL SPIELEN"), und der Startknopf
setzt dort fort, wo man zuletzt war. `Fortschritt zurücksetzen` löscht das.

**Steuerung**

| Taste | Wirkung |
|---|---|
| `A` / `D` bzw. `←` `→` | gehen |
| `SPACE` / `W` / `↑` | springen (`↓` + springen = durch Plattform fallen) |
| `E` / `J` | Tritt — im Takt getroffen wird jeder Gegner still. Am Kleiderständer: umziehen |
| `S` / `↓` | ducken (und in Nischen verschwinden) |
| `P` / `ESC` | Pause |

Auf dem Smartphone: Stick unten links, `SPRUNG` und `TRITT` unten rechts — bewusst
nicht in der unteren Bildschirmkante, damit man nicht versehentlich die Systemgeste
auslöst. Für mehr Übersicht quer halten.

**Umziehen** passiert nicht mehr beim bloßen Berühren: davorstellen und `E` drücken
(am Handy den `TRITT`-Knopf). Ein Schild über dem Ständer sagt es an, und Fundstücke
tragen in Reichweite ihren Namen („BIERDECKEL", „OHROPAX"), damit man nicht raten muss.
Ton lässt sich im Titelbild abschalten; das Metronom tickt ohnehin nur, wenn eine
Gefahr in Hörweite ist.

## Mechaniken

**Kleiderordnung ist Werkzeug.** Umgezogen wird am Kleiderständer:

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

**Gefahren:** Beim ersten Kontakt stellt sich jede von selbst vor — Name über der Figur,
ein Satz in der Hinweisleiste, und ein Schild zeigt beim Annähern den Namen:

| Gegner | Verhalten | Konter |
|---|---|---|
| **Piccolo** | schießt sichtbare Schallwellen (drei Bögen, ein Schlag Vorwarnung mit `!` und Schusslinie) | drüberspringen oder im Takt treffen |
| **Sopran** | lebensgefährlich laut, langer Anlauf mit sichtbarem Kegel | Ohropax oder Deckung in einer Nische |
| **Tenor** | verschleppt das Tempo, alles wird zäh | im Takt treffen, Abstand gewinnen |
| **Instrumentenkoffer** | rollt, blockiert, wartet an den Enden | im Fenster drüberspringen |
| **Dirigent** | wirft Taktstöcke im Bogen auf die Stelle, an der man steht | ducken, zur Seite weg oder im Takt treffen (dann verliert er den Stock) |

Morsche Notenblätter brechen nach kurzer Zeit weg, wachsen aber nach.

**Schwierigkeit:** Voreinstellung ist **GEMÜTLICH**, weil das Spiel ein Geschenk ist.
Dort sind Gegner halb so schnell, der erste Schuss kommt erst nach einer Schonfrist,
Schallwellen fliegen langsamer, nach einem Treffer gibt es zwei Sekunden Unverwundbarkeit,
das Taktfenster ist deutlich größer und der Sopran kostet nur einen Nerv statt zwei.
Umschaltbar im Titelbild und in der Pause (`SCHWIERIGKEIT`), die Wahl bleibt gemerkt.
Wichtig: Gegner schießen nur innerhalb des sichtbaren Bildes — nie von außerhalb.

**Belohnung:** Am Ende von Akt 1 wartet das **Feierabendbier**. Bierdeckel sind die
Sammelobjekte, für einen davon muss man auf die morsche Kante steigen.

## Technik

- Vanilla ES-Module + Canvas 2D, **kein Bundler, kein Framework, keine externen Requests**
- Sichtbereich 384×216 am Rechner (ganzzahlige Skalierung), 256×144 auf Touchgeräten —
  dort also deutlich näher dran, damit die Figur nicht zur Briefmarke wird
- Spielfigur 16×24 px (Trefferfläche 12×22), Kleidung über Palettenvarianten desselben Körpers
- Grafik komplett code-nativ (Sprite-Matrizen), keine Binärassets
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
tests/smoke.test.mjs 175 headless Checks
```

## Tests

```bash
npm test                        # 175 headless Checks: node tests/smoke.test.mjs
npm run serve                   # lokaler Server auf http://127.0.0.1:8123
npm run browser                 # 72 Checks in echtem Chromium
npm run browser -- <url>        # dieselbe Prüfung gegen eine deployte URL
```

`tests/smoke.test.mjs` fährt dieselbe Simulation wie das Spiel, nur ohne Browser.
Geprüft werden Physik, Takt, alle Gegnertypen, Kleiderwechsel und Türen, Hitze und
Frack-Off, Items, Speicherpunkte, Aktabschluss und Langzeitstabilität — und mit einem
Bot ein kompletter Durchlauf über die gebaute Route bis zum Aufzug. Damit ist belegt,
dass jede Stufe innerhalb der Sprunghöhe liegt und es keinen Abkürzungsweg am Boden gibt.

`tests/browser-smoke.mjs` startet Chromium, steuert ihn über das DevTools-Protokoll und
prüft das echte Spiel: Laden ohne JavaScript-Fehler, Start, Kleiderwahl, Standard-
Schwierigkeit GEMÜTLICH samt Umschalten, Tastatur, Umkleide erst auf Tastendruck,
Objekt- und Gegnerbeschriftung, Zeichnung im Framebuffer (Figur,
Bodenkachel, kein Standbild), HUD, Pause — und in Geräteemulation das Smartphone:
Touch-Pad sichtbar, Kamera enger, Figur groß genug, Stick bewegt den Spieler. Beide
Suiten laufen gegen die Live-URL.

## Als Nächstes

Akt 3 Open Air mit Wetter (Wind, Regen, Hitze) · Akt 4 Orchestergraben ·
Motorrad-Interludium (Nacht, Tunnel) · Finale mit Frack-Off · Epilog Kleingarten
mit **Bratwurst-Grill** als kleinem Bonusspiel. Konzept und Stand:
[docs/KONZEPT.md](docs/KONZEPT.md)
