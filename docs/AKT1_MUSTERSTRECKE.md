# Akt 1 als Musterstrecke

## Ziel

Akt 1 soll zeigen, wie die übrigen Stationen ausgebaut werden: ein eigener kleiner Handlungsbogen, klar unterscheidbare Räume, eine Mechanik pro Abschnitt, sichtbare Folgen und ein kurzer Rückbezug am Ende. Die Vorlage bleibt mit Vanilla-ES-Modulen, Canvas, WebAudio und lokalem Spielstand kompatibel.

**Ada ist eine ausdrücklich fiktive Notenwartin.** Der Text behauptet keine reale Kollegin oder private Anekdote.

## Handlungsbogen

1. **Auftrag in der Garderobe:** Ada bittet Roland, drei verstreute Stimmen der letzten Zugabe zu finden.
2. **Können statt Laufband:** Jede Stimme liegt in einem anders lesbaren Raum und ist mit einer bereits vorhandenen Mechanik verbunden.
3. **Rückkehr ohne Sackgasse:** Alle Pflichtgegenstände bleiben erreichbar; die alte Einweg-Luke entfällt zugunsten einer beidseitig begehbaren Treppe.
4. **Auszahlung:** Ada wartet an der Obermaschinerie, erkennt die vollständige Mappe an und schickt Roland mit einem persönlichen Satz nach oben.
5. **Übergang:** Der Materialaufzug öffnet erst mit vollständiger Mappe und abgeschlossenem Gespräch.

## Räume und Lernkurve

| Raum | Hauptmechanik | Visuelles Motiv |
|---|---|---|
| Garderobe | Gehen, Interaktion, Kleiderwahl | Spinde, Geigenkasten, Dienstplan „41“ |
| Stimmengang | Springen und Piccolo im Takt beruhigen | Rohre, Warnleuchte, erste Violinstimme |
| Notenschacht | reversible Vertikalroute, Sopran/Deckung; morsches Papier als Risiko | Rohrventil, flatternde Stapel, zweite Stimme |
| Archiv | Anzugtür, reversible Regalroute, rollender Koffer | hohe Notenregale, Archivwagen, dritte Stimme |
| Obermaschinerie | Frackband, letzter Aufstieg, Rückgespräch | Lastenhaken, Seilrolle, Gegengewicht, beleuchteter Aufzug |

## Wiederverwendbare Bausteine

- Datengetriebene `npc`-Entität mit Dialogzeilen, Voraussetzung und Abschluss-Flag.
- Datengetriebene `storySteps` für ein dynamisches Journalziel.
- Story-Gates mit `flag`, `locked` und `opened`, nicht nur Kleidungsschlösser.
- Dekorative `decor`-Entitäten mit Code-Sprites, ohne neue Physik.
- Item-Sprites mit unterschiedlichen Außenformen und eigenen Fundtexten pro Stimme.
- Sichtbar getragene Notenmappe am Spieler.
- Kontextabhängige Touch-Beschriftung `AKTION` statt `TRITT` bei Gesprächen und Gegenständen.
- Ein beidseitig erreichbarer Kleiderständer am Archiv: Anzug öffnet die Tür; danach ist Schwarz die schnelle, kühle Regaloption.

## Abnahme

- Das erste Journalziel lautet „MIT ADA SPRECHEN“.
- Ein Gespräch wird bewusst mit der Aktionstaste fortgesetzt; in ihrer Nähe wird kein Tritt ausgelöst.
- Drei Stimmen haben unterschiedliche Sprites und bilden weiterhin die Mappe.
- Pflichtgegenstände sind nicht durch eine Einwegstelle dauerhaft verpassbar.
- Ada am Aufzug reagiert vor und nach vollständiger Mappe unterschiedlich.
- Der Aufzug schließt Akt 1 erst nach Mappe und Abschlussgespräch ab.
- Mindestens fünf Raumrequisiten sind im Level sichtbar und verwenden wiederverwendbare Code-Sprites.
- Die normale Route ist ohne Teleport und ohne Gegner-Unsterblichkeit durchspielbar; „Gemütlich“ bleibt Standard.
- Browser- und Mobile-Checks bleiben fehlerfrei; neue Dialog- und Spritepfade sind in echten Chromium-Checks enthalten.

## Verifikation für Folgeakte

Jeder ausgebaute Akt soll dieselben drei Ebenen nachweisen:

1. **Vertragstest:** Storyschritte, Voraussetzungen, Sprites und Abschlusszustand.
2. **Geometrie-Bot:** exakte Route ohne Gegnerstörung, damit Sprunghöhen und Rückwege messbar bleiben.
3. **Gefahren-Bot:** echte Gegner, drei Nerven, normale Rhythmusaktion und Checkpoint-Respawns; kein Teleport und kein Entfernen von Gegnern.

Akt 1 liefert dafür `tests/act1-template.test.mjs`, den Akt-1-Abschnitt in `tests/smoke.test.mjs` und `tests/act1-hazard-route.test.mjs`. Die Browserprüfung erzeugt fünf Referenzbilder unter `.artifacts/akt1-*.png`.
