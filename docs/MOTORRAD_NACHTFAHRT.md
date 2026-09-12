# Motorrad — Nachtfahrt nach Hause

## Umfang

Eigener Schnitt auf aktuellem main, Branch feature/motorrad-nachtfahrt. Keine
Änderungen an Akten, Figuren, Spielstand oder Reihenfolge. Cabrio-Module und
Tests bleiben unangetastet; gemeinsame Journey-Logik wird wiederverwendet und
nur parametrisiert (Ankunftstext, Nacht/Laub/Radar-Merkmale).

## Fahrt

Fünf Nachtabschnitte, ca. 2000 Segmente (länger als Cabrio mit 1480):

1. OPERNPLATZ: warme Fenster, sichere Abfahrt, Steuerung erklären.
2. FLUSSKURVEN: schnelle Wechselkurven am Wasser, Mond, Gegenverkehr.
3. TUNNEL: enge Kurven unter Deckenlampen, echter Tunnelbereich.
4. WALDLAUB: nasses Laub als Signatur, Glühwürmchen, dichte Bäume.
5. HEIMWEG: Dorffenster, ruhiger Anlauf, Ankunft zu Hause.

Keine neue Taste, keine Pflicht-Sammelei. Das Motiv (nicht die Mappe) fährt
im Helm mit. Fehler kosten Tempo und die Abschnittswertung, nicht die Ankunft.

## Technik

- Neues src/motorrad.js (Journey-Daten) und src/motorrad-art.js (Nacht,
  Tunnel, Motorrad mit Fahrer und Scheinwerfer).
- Journey-Engine (cabrio-drive.js) wird über journey.features parametrisiert:
  Nacht, Laub, Radar, Tunnelabschnitt, Ankunftstext. Cabrio nutzt dieselben
  Hooks mit seinen bisherigen Werten.
- Racer wählt die Kunst pro journey.art (cabrio/motorrad); Motorrad-Regeln
  (Tempoverhältnis 1,22, Laub-Grip, Radar, Tunnel) bleiben erhalten.
- Bestehende Smoke-Erwartungen (Tunnelbereich, Laubanzahl, Blitzer, Bot-Ankunft
  in 120 s, FAHRZEIT/KONTAKTE-Zeilen) gelten weiter.

## Abnahme

- Neue tests/motorrad.test.mjs: Journey-Vertrag, Kurvenwarnung, Abschnitts-
  wertung, natürliche Durchfahrt ruhig-gegen-wild auf beiden Stufen.
- Volle Suite grün, Browser inkl. Nacht-/Tunnel-/Ankunftsnachweis, Pixel-
  Readback pro Abschnitt.
- Review, PR, manueller Merge durch Roland.
