# Cabrio — Fahrt zur Open-Air-Bühne

## Umfang und Zusammenarbeit

Eigener vertikaler Schnitt auf Basis `8bedb9d`. Keine Änderungen an Seitenläufer-Akten, Figurenbenennungen, Spielstandformat oder globaler Reihenfolge. Cabrio-Daten, Kunst und Fahrhilfen leben in eigenen Modulen; `racer.js` aktiviert sie nur bei deklarierter `journey`. Das Motorrad behält seine Nachtfahrt und Regeln.

## Spielerlebnis

Die Mappe fährt mit. Vier Abschnitte bilden eine Reise statt einer endlosen Rennstrecke:

1. **Stadtausfahrt:** warme Fassaden, langsames Anfahren und sichere Gerade; Lenken/Bremse werden sichtbar erklärt.
2. **Abendallee:** Baumkronen und Felder, weich eingeleitete Kurven, sichtbarer Vor-/Gegenverkehr. Gegenlenken und vor der Kurve bremsen.
3. **Regenschauer:** kühle Palette, nasse Fahrbahn und gefährlichere Bögen; Bremshinweis und Tempoempfehlung kommen vorher, nicht erst nach einem Kontakt.
4. **Open Air:** Regen zieht ab, Wimpel und Bühnenportal ersetzen Bäume, letzter ruhiger Anlauf als erzählerischer Abschluss.

Keine zusätzliche Taste, kein Timer-Softlock, kein Verlust der kampagnenrelevanten Mappe. Fahrfehler kosten Tempo und die optionale Bewertung „ruhige Abschnitte“, nicht die Möglichkeit, anzukommen. Kontakte, Schlaglöcher und längeres Rasen durch enge Kurven zählen; langsam und sauber fahren muss messbar besser abschneiden als blind Vollgas.

## Optische Regeln

- Eigene offene Cabrio-Silhouette mit grauem Fahrerkopf, sichtbarer Mappe, Bremslichtern und Lenkausrichtung.
- Rücklichter für Vorausverkehr, helle Scheinwerfer für Gegenverkehr; keine unsichtbaren Kollisionsobjekte.
- Zweispurige Landstraße, klare Außenkanten, gebrochene Mittellinie, Leitpfosten, Tiefenstaffelung und abschnittsspezifische Großformen.
- HUD mit Abschnittsfortschritt und persistentem nächsten Fahrhinweis. Keine kleinen Textblöcke über dem Fluchtpunkt.
- Kunst bleibt lokal generierte Pixel-Art ohne externe Assets, Fonts oder Laufzeitabhängigkeiten.

## Abnahme

- Basistests einschließlich Motorrad bleiben grün.
- Kurven werden weich eingeleitet; Projektion und Kollision verwenden denselben Streckenpunkt, auch zwischen Segmentgrenzen und bei angepasstem Seitenverhältnis.
- Test-first: Warnung vor Kurve, wirksame Bremse, einmalige Abschnittswertung, saubere Reset-/Pause-/Zielzustände.
- Fahrt mit echten Verkehrs-/Straßenobjekten durch reine Eingaben bis zum Ziel auf beiden Schwierigkeitsstufen; keine direkte Positionskorrektur oder ausgeschalteten Gefahren.
- Browser: echte Tastatur-/Touchbremse, Fahrt, Pause, Endauswertung und Übergang zu Akt 3 ohne JavaScript-Fehler; Portrait und Querformat.
- Instrumentierte Bilder aller Abschnitte sind Kunst-/Layoutnachweise, kein Beleg für eine natürliche Durchfahrt oder tatsächliche Erstspieler-Spielzeit.
- Vor PR: volle Tests, Syntax/Diffcheck, unabhängiger Review. Nach verifiziertem Push Cortana um Merge und Liveprüfung bitten, nicht selbst veröffentlichen.
