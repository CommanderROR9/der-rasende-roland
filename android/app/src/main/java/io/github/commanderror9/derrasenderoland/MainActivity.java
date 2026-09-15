package io.github.commanderror9.derrasenderoland;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Schlanke Huelle um das Pixel-Art-Spiel "Der Rasende Roland".
 *
 * Es wird kein Spielcode dupliziert: index.html und src/ werden beim Bauen nach
 * assets/www/ gespiegelt (Gradle-Task "syncGameAssets") und ueber den
 * WebViewAssetLoader unter https://appassets.androidplatform.net/assets/www/
 * ausgeliefert. Dieser Ursprung ist ein echter https-Ursprung, deshalb laufen
 * die ES-Module des Spiels; file:// wuerde sie blockieren.
 *
 * Kein Internet: der AssetLoader faengt alles ab, externe Anfragen gibt es nicht,
 * und die App hat keine INTERNET-Berechtigung.
 *
 * Startrobustheit: Auf manchen Samsung-Geraeten mit sehr neuen Android-Versionen
 * schlaegt der allererste WebView-Zugriff im Prozess mit
 * "Resources$NotFoundException: failed to redirect ResourcesImpl" fehl (bekanntes
 * Plattform-Problem). Der WebView wird deshalb mit kurzen Wiederholungspausen
 * aufgebaut; schlaegt alles fehl, zeigt die App einen Fehlerbericht statt wortlos
 * zu verschwinden (Bericht siehe DRRApp).
 */
public class MainActivity extends Activity {

    private static final String TAG = "DRR";

    private static final String ASSET_PREFIX = "https://appassets.androidplatform.net/assets/";
    private static final String START_URL = ASSET_PREFIX + "www/index.html";

    private static final int BACKGROUND_COLOR = 0xFF07050C;

    /** Obergrenze der Startspur-Datei; darueber wird sie beim Start gekuerzt. */
    private static final int SPUR_MAX_BYTES = 16 * 1024;

    /**
     * Zurueck-Taste = ESC. Das Spiel oeffnet damit die Pause. Ist bereits pausiert
     * (oder laeuft gar nichts), verlaesst die Taste die App.
     */
    private static final String BACK_JS =
            "(function(){"
                    + "var p=document.getElementById('pause');"
                    + "var vorher=!!(p&&!p.classList.contains('hidden'));"
                    + "if(!vorher){window.dispatchEvent(new KeyboardEvent('keydown',"
                    + "{code:'Escape',key:'Escape',keyCode:27,which:27,bubbles:true}));}"
                    + "var nachher=!!(p&&!p.classList.contains('hidden'));"
                    + "return vorher?'exit':(nachher?'paused':'exit');"
                    + "})()";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Solange das Spiel laeuft, bleibt der Bildschirm an.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setBackgroundDrawable(new ColorDrawable(BACKGROUND_COLOR));

        vollbildEinrichten();

        // Startdiagnose: Liegt ein Absturzbericht vom letzten Mal vor, wird er
        // angezeigt - dann verschwindet die App nicht mehr wortlos.
        String absturzbericht = liesText(DRRApp.CRASH_DATEI);
        if (absturzbericht != null) {
            zeigeDiagnose(absturzbericht);
            return;
        }

        spurBeginne();

        try {
            webView = baueWebViewMitWiederholung();
        } catch (RuntimeException fehler) {
            // Alle Versuche fehlgeschlagen: Bericht sichern und auf dem Bildschirm
            // anzeigen, statt die App erneut wortlos schliessen zu lassen.
            String bericht = "Der eingebaute Browser (WebView) liess sich nicht anlegen.\n\n"
                    + fehler + "\n\nLetzte Startspur:\n" + spurEnde();
            DRRApp.schreibeText(this, DRRApp.CRASH_DATEI, bericht);
            zeigeDiagnose(bericht);
            return;
        }

        setContentView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::zurueckBehandeln);
        }

        DRRApp.haengeAn(this, DRRApp.SPUR_DATEI,
                "Spiel gestartet. WebView: " + DRRApp.webViewVersion(this) + "\n");
    }

    /**
     * Baut die komplette WebView-Huelle auf. Der erste WebView-Zugriff eines
     * Prozesses kann auf betroffenen Geraeten fehlschlagen (siehe Klassenkopf);
     * ein zweiter Anlauf nach kurzer Pause funktioniert dort erfahrungsgemaess.
     */
    private WebView baueWebViewMitWiederholung() {
        final long[] pausenNachFehler = {250L, 750L, 1500L};
        RuntimeException letzterFehler = null;
        for (int versuch = 0; versuch <= pausenNachFehler.length; versuch++) {
            try {
                return baueWebView();
            } catch (RuntimeException fehler) {
                letzterFehler = fehler;
                Log.e(TAG, "WebView-Aufbau fehlgeschlagen (Versuch " + (versuch + 1)
                        + " von " + (pausenNachFehler.length + 1) + ")", fehler);
                DRRApp.haengeAn(this, DRRApp.SPUR_DATEI,
                        "Fehlversuch " + (versuch + 1) + ": "
                                + fehler.getClass().getSimpleName() + ": "
                                + fehler.getMessage() + "\n");
                if (versuch < pausenNachFehler.length) {
                    SystemClock.sleep(pausenNachFehler[versuch]);
                }
            }
        }
        throw letzterFehler;
    }

    /** Ein einzelner kompletter Aufbau von WebView samt Einstellungen und Loader. */
    private WebView baueWebView() {
        WebView neu = new WebView(this);
        neu.setBackgroundColor(BACKGROUND_COLOR);
        neu.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebView.setWebContentsDebuggingEnabled(false);

        neu.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                Log.i(TAG, "console: " + message.message()
                        + " (" + message.sourceId() + ":" + message.lineNumber() + ")");
                return true;
            }
        });

        WebSettings settings = neu.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);            // Spielstand (localStorage)
        settings.setMediaPlaybackRequiresUserGesture(false); // WebAudio ohne Extra-Tipp
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setGeolocationEnabled(false);
        settings.setSaveFormData(false);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        neu.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Nur der eingebaute Asset-Ursprung wird geladen; alles andere
                // (das Spiel hat keine externen Ziele) wird verworfen.
                return !request.getUrl().toString().startsWith(ASSET_PREFIX);
            }
        });

        return neu;
    }

    /** Vollbild/Edge-to-edge inkl. Notch; Wisch holt die Systemleisten kurz zurueck. */
    private void vollbildEinrichten() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }
    }

    @SuppressLint("GestureBackNavigation")
    private void zurueckBehandeln() {
        if (webView == null) {
            finish();
            return;
        }
        webView.evaluateJavascript(BACK_JS, ergebnis -> {
            // "\"paused\"" heisst: das Spiel hat gerade pausiert -> in der App bleiben.
            if (!"\"paused\"".equals(ergebnis)) {
                finish();
            }
        });
    }

    /** Fallback fuer Android 12 und aelter (dort gibt es keine Back-Callbacks). */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            super.onBackPressed();
        } else {
            zurueckBehandeln();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
        vollbildEinrichten();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    // ------------------------------------------------------------------
    // Startspur und Diagnose-Tafel
    // ------------------------------------------------------------------

    /** Zeigt einen Startbericht auf dem Bildschirm an, damit nichts verloren geht. */
    private void zeigeDiagnose(String absturzbericht) {
        int rand = (int) (getResources().getDisplayMetrics().density * 16);

        LinearLayout inhalt = new LinearLayout(this);
        inhalt.setOrientation(LinearLayout.VERTICAL);
        inhalt.setPadding(rand, rand, rand, rand);

        TextView titel = new TextView(this);
        titel.setText("Der Rasende Roland: Startproblem");
        titel.setTextSize(20f);
        titel.setTextColor(COLOR_HELL);
        inhalt.addView(titel);

        TextView hinweis = new TextView(this);
        hinweis.setText("Die App konnte den eingebauten Browser (WebView) nicht starten. "
                + "Das ist ein bekanntes Problem mancher Samsung-Geraete mit sehr neuen "
                + "Android-Versionen - nicht das Spiel selbst.\n\n"
                + "Bitte diesen Text kopieren (Knopf unten) oder als Foto an Hermes schicken.");
        hinweis.setTextColor(COLOR_GEDAEMPFT);
        hinweis.setPadding(0, rand / 2, 0, rand / 2);
        inhalt.addView(hinweis);

        final TextView text = new TextView(this);
        text.setText(absturzbericht + "\n\nLetzte Startspur:\n" + spurEnde());
        text.setTextSize(12f);
        text.setTextColor(COLOR_HELL);
        text.setTextIsSelectable(true);

        ScrollView scroller = new ScrollView(this);
        scroller.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        scroller.addView(text);
        inhalt.addView(scroller);

        Button kopieren = new Button(this);
        kopieren.setText("Text kopieren");
        kopieren.setOnClickListener(v -> {
            ClipboardManager ablage =
                    (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (ablage != null) {
                ablage.setPrimaryClip(ClipData.newPlainText(
                        "DRR-Startbericht", text.getText()));
                Toast.makeText(this, "Bericht kopiert", Toast.LENGTH_SHORT).show();
            }
        });
        inhalt.addView(kopieren);

        Button nochmal = new Button(this);
        nochmal.setText("Noch einmal versuchen");
        nochmal.setOnClickListener(v -> {
            new File(getFilesDir(), DRRApp.CRASH_DATEI).delete();
            recreate();
        });
        inhalt.addView(nochmal);

        setContentView(inhalt, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    }

    private static final int COLOR_HELL = 0xFFE9E5D8;
    private static final int COLOR_GEDAEMPFT = 0xFF9B93B0;

    /** Haelt die Startspur klein und vermerkt den Beginn dieses Starts. */
    private void spurBeginne() {
        File datei = new File(getFilesDir(), DRRApp.SPUR_DATEI);
        if (datei.isFile() && datei.length() > SPUR_MAX_BYTES) {
            String alt = liesText(DRRApp.SPUR_DATEI);
            if (alt != null) {
                DRRApp.schreibeText(this, DRRApp.SPUR_DATEI,
                        "(gekuerzt)\n" + letzteZeilen(alt, 30));
            }
        }
        DRRApp.haengeAn(this, DRRApp.SPUR_DATEI, "--- Start " + zeitJetzt()
                + " (v1.0.1) " + Build.MANUFACTURER + " " + Build.MODEL
                + ", Android " + Build.VERSION.RELEASE + " ---\n");
    }

    private String spurEnde() {
        String spur = liesText(DRRApp.SPUR_DATEI);
        return spur == null ? "(keine)" : letzteZeilen(spur, 25);
    }

    private String liesText(String name) {
        File datei = new File(getFilesDir(), name);
        if (!datei.isFile()) {
            return null;
        }
        try (BufferedReader r = new BufferedReader(new FileReader(datei))) {
            StringBuilder sb = new StringBuilder();
            String zeile;
            while ((zeile = r.readLine()) != null) {
                sb.append(zeile).append('\n');
            }
            return sb.toString();
        } catch (Throwable t) {
            return null;
        }
    }

    private static String letzteZeilen(String text, int anzahl) {
        String[] zeilen = text.split("\n");
        int start = Math.max(0, zeilen.length - anzahl);
        StringBuilder sb = new StringBuilder();
        for (int i = start; i < zeilen.length; i++) {
            sb.append(zeilen[i]).append('\n');
        }
        return sb.toString();
    }

    private static String zeitJetzt() {
        return new SimpleDateFormat("dd.MM.yyyy HH:mm:ss", Locale.GERMANY).format(new Date());
    }
}
