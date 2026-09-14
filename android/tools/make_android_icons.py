#!/usr/bin/env python3
"""Baut die Launcher-Icons der Android-Huelle aus den Spiel-Sprites.

Quelle sind *keine* neuen Bilder, sondern die Textmatrix ROLAND_FRAMES.idle und
die Palette OUTFIT_PALETTES.frack aus src/sprites.js — das Icon zeigt also genau
den Geiger im Frack, den das Spiel zeichnet. Skaliert wird ohne Glaettung
(nearest neighbour), damit die Pixel scharf bleiben.

Erzeugt:
  app/src/main/res/mipmap-<density>/ic_launcher.png           (48..192 px)
  app/src/main/res/mipmap-<density>/ic_launcher_round.png     (rund maskiert)
  app/src/main/res/drawable-<density>/ic_launcher_foreground.png  (108..432 dp)

Aufruf (aus dem Repo-Wurzelverzeichnis):
    python3 android/tools/make_android_icons.py

Nur Standardbibliothek (zlib/struct/re) — kein Pillow noetig.
"""
from __future__ import annotations

import os
import re
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ANDROID_DIR = os.path.dirname(HERE)
REPO_ROOT = os.path.dirname(ANDROID_DIR)
RES_DIR = os.path.join(ANDROID_DIR, "app", "src", "main", "res")
SPRITES = os.path.join(REPO_ROOT, "src", "sprites.js")

# Farben aus dem Spiel (index.html: --red, --amber).
CURTAIN = (0xB0, 0x39, 0x2F, 255)   # roter Vorhang (Grund)
STAGE = (0xE8, 0xC4, 0x6A, 255)     # goldener Buehnenboden (--amber): trennt die
                                    # dunklen Frackschuhe sichtbar vom Grund

MIPMAP_DENSITIES = {
    "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192,
}
FOREGROUND_DENSITIES = {
    "mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432,
}


def png_bytes(width: int, height: int, rows: list[bytearray]) -> bytes:
    """Minimaler PNG-Schreiber (8 bit RGBA, ohne Filter)."""
    raw = bytearray()
    for row in rows:
        raw.append(0)
        raw.extend(row)

    def chunk(typ: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + typ + data
                + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b""))


class Bild:
    """Einfache RGBA-Bitmap mit nearest-neighbour-Skalierung."""

    def __init__(self, breite: int, hoehe: int, farbe=(0, 0, 0, 0)):
        self.breite = breite
        self.hoehe = hoehe
        self.pixel = [list(farbe) for _ in range(breite * hoehe)]

    def setze(self, x: int, y: int, farbe):
        if 0 <= x < self.breite and 0 <= y < self.hoehe:
            self.pixel[y * self.breite + x] = list(farbe)

    def hole(self, x: int, y: int):
        return self.pixel[y * self.breite + x]

    def rechteck(self, x0, y0, x1, y1, farbe):
        for y in range(max(0, y0), min(self.hoehe, y1)):
            for x in range(max(0, x0), min(self.breite, x1)):
                self.setze(x, y, farbe)

    def kreismaske(self):
        """Runde Variante: alles ausserhalb des Inkreises wird durchsichtig."""
        cx = (self.breite - 1) / 2.0
        cy = (self.hoehe - 1) / 2.0
        r = self.breite / 2.0
        for y in range(self.hoehe):
            for x in range(self.breite):
                if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
                    self.pixel[y * self.breite + x] = [0, 0, 0, 0]

    def zeichne(self, quelle: "Bild", x0: int, y0: int, skalierung: int):
        for qy in range(quelle.hoehe):
            for qx in range(quelle.breite):
                farbe = quelle.hole(qx, qy)
                if farbe[3] == 0:
                    continue
                for dy in range(skalierung):
                    for dx in range(skalierung):
                        self.setze(x0 + qx * skalierung + dx, y0 + qy * skalierung + dy, farbe)

    def zeilen(self):
        return [bytearray(row) for row in
                (b"".join(bytes(px) for px in self.pixel[y * self.breite:(y + 1) * self.breite])
                 for y in range(self.hoehe))]

    def schreibe(self, pfad: str):
        os.makedirs(os.path.dirname(pfad), exist_ok=True)
        with open(pfad, "wb") as fh:
            fh.write(png_bytes(self.breite, self.hoehe, self.zeilen()))
        return pfad


def lade_sprite() -> Bild:
    """ROLAND_FRAMES.idle + OUTFIT_PALETTES.frack aus src/sprites.js lesen."""
    with open(SPRITES, encoding="utf-8") as fh:
        quelle = fh.read()

    treffer = re.search(r"export const ROLAND_FRAMES = \{\s*idle: \[(.*?)\],", quelle, re.S)
    if not treffer:
        raise SystemExit("ROLAND_FRAMES.idle nicht gefunden in " + SPRITES)
    zeilen = re.findall(r"'([^']*)'", treffer.group(1))

    pal = re.search(r"OUTFIT_PALETTES = \{.*?frack:\s*\{(.*?)\n  \},", quelle, re.S)
    if not pal:
        raise SystemExit("OUTFIT_PALETTES.frack nicht gefunden in " + SPRITES)
    farben = {}
    for key, wert in re.findall(r"(\w+|\.)\s*:\s*'(#[0-9a-fA-F]{6})'", pal.group(1)):
        h = wert.lstrip("#")
        farben[key] = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)

    breite = max(len(z) for z in zeilen)
    hoehe = len(zeilen)
    sprite = Bild(breite, hoehe)
    for y, zeile in enumerate(zeilen):
        for x, zeichen in enumerate(zeile):
            farbe = farben.get(zeichen)
            if farbe is None:      # '.' und Unbekanntes bleiben durchsichtig
                continue
            sprite.setze(x, y, farbe)
    return sprite


def bodenbalken(hoehe: int, breite: int) -> int:
    """Hoehe des dunklen Buehnenbodens fuer eine gegebene Bildgroesse."""
    return max(2, round(hoehe * 0.10))


def vollflaechig(groesse: int, sprite: Bild) -> Bild:
    """Klassisches Launcher-Icon: Vorhang, Buehnenboden, Geiger darauf."""
    bild = Bild(groesse, groesse, CURTAIN)
    band = bodenbalken(groesse, groesse)
    bild.rechteck(0, groesse - band, groesse, groesse, STAGE)

    skala = max(1, round(groesse * 0.72 / sprite.hoehe))
    skala = min(skala, max(1, (groesse - band - 1) // sprite.hoehe))
    x0 = (groesse - sprite.breite * skala) // 2
    y0 = groesse - band - sprite.hoehe * skala
    bild.zeichne(sprite, x0, y0, skala)
    return bild


def adaptive_vordergrund(groesse: int, sprite: Bild) -> Bild:
    """Vordergrund der adaptiven Icons: Inhalt sicher in der 66-dp-Maske."""
    bild = Bild(groesse, groesse)
    skala = max(1, round(groesse * 0.42 / sprite.hoehe))
    band = max(2, round(groesse * 0.055))

    breite = sprite.breite * skala
    hoehe = sprite.hoehe * skala + band
    x0 = (groesse - breite) // 2
    y0 = (groesse - hoehe) // 2
    bild.rechteck(x0 - skala, y0 + sprite.hoehe * skala, x0 + breite + skala, y0 + hoehe, STAGE)
    bild.zeichne(sprite, x0, y0, skala)
    return bild


def main() -> int:
    sprite = lade_sprite()
    print(f"Sprite: {sprite.breite}x{sprite.hoehe} (ROLAND_FRAMES.idle, Palette frack)")

    geschrieben = []
    for dichte, groesse in MIPMAP_DENSITIES.items():
        grund = vollflaechig(groesse, sprite)
        geschrieben.append(grund.schreibe(os.path.join(
            RES_DIR, f"mipmap-{dichte}", "ic_launcher.png")))

        rund = vollflaechig(groesse, sprite)
        rund.kreismaske()
        geschrieben.append(rund.schreibe(os.path.join(
            RES_DIR, f"mipmap-{dichte}", "ic_launcher_round.png")))

    for dichte, groesse in FOREGROUND_DENSITIES.items():
        geschrieben.append(adaptive_vordergrund(groesse, sprite).schreibe(os.path.join(
            RES_DIR, f"drawable-{dichte}", "ic_launcher_foreground.png")))

    for pfad in geschrieben:
        print(f"  {os.path.relpath(pfad, REPO_ROOT)}  {os.path.getsize(pfad)} B")
    print(f"{len(geschrieben)} Dateien geschrieben.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
