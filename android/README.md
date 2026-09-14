# Der Rasende Roland — Android-Hülle

Eine schlanke WebView-Hülle, die das Spiel **offline** als installierbare APK
ausliefert. Das Spiel selbst wird nicht verändert: `index.html` und `src/`
bleiben die einzige Quelle, die Android-Seite spiegelt sie beim Bauen.

## Was die APK tut

* lädt `https://appassets.androidplatform.net/assets/www/index.html` über den
  `WebViewAssetLoader` (ein echter https-Ursprung — nur so laufen die
  ES-Module des Spiels; `file://` würde sie blockieren),
* hat **keine Internet-Berechtigung** und lädt nichts von außen: alle Dateien
  stecken in der APK,
* lässt Bildschirm an (`FLAG_KEEP_SCREEN_ON`), läuft Vollbild/Edge-to-edge
  (Notch eingeschlossen), Orientierung frei (Hoch + Quer),
* erlaubt DOM-Storage, damit der Spielstand (`localStorage`) bleibt,
* lässt WebAudio ohne Extra-Tipp starten (`setMediaPlaybackRequiresUserGesture(false)`);
  das Spiel startet den Ton ohnehin erst nach einer Berührung,
* legt die Zurück-Taste auf **ESC**: im Spiel öffnet sie die Pause, ist das
  Spiel schon pausiert (oder läuft nichts), verlässt sie die App.

## Bauen

Lokal (braucht JDK 17 + Android SDK):

```bash
gradle -p android assembleRelease      # ohne Signaturwerte: unsignierte APK
```

Signiert (Werte kommen aus `-P…` oder aus der Umgebung):

```bash
gradle -p android assembleRelease \
  -PdrrStoreFile=/pfad/sideload.keystore -PdrrStorePassword=… \
  -PdrrKeyAlias=drr -PdrrKeyPassword=…
# oder: DRR_STORE_FILE / DRR_STORE_PASSWORD / DRR_KEY_ALIAS / DRR_KEY_PASSWORD
```

Ergebnis: `android/app/build/outputs/apk/release/der-rasende-roland-v1.0.apk`.

In der CI macht dasselbe der Workflow `.github/workflows/android.yml`
(JDK 17, Gradle 8.9, SDK 35): er erzeugt den Signaturschlüssel selbst
(`keytool`, kein Secret im Repo), prüft den APK-Inhalt, legt die APK als
Artefakt ab und hängt sie an das Release **v1.0**.

## Launcher-Icon

`tools/make_android_icons.py` zeichnet die Icons aus den Spieldaten selbst:
`ROLAND_FRAMES.idle` (16×24-Textmatrix) mit der Palette `OUTFIT_PALETTES.frack`
aus `../src/sprites.js`, nearest-neighbour skaliert auf rotem Vorhang mit
goldenem Bühnenboden. Erzeugt alle `mipmap-*`- und `drawable-*`-Größen
(adaptives Icon inklusive) — nur Standardbibliothek, kein Pillow.

```bash
python3 android/tools/make_android_icons.py
```

## Spiel-Assets

`app/src/main/assets/www/` wird beim Bauen von `syncGameAssets` (Gradle-`Sync`)
aus `index.html` + `src/` gefüllt und ist **nicht** eingecheckt (siehe
`.gitignore`) — keine zweite Kopie des Spiels im Repo.
