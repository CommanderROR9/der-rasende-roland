package io.github.commanderror9.derrasenderoland;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
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
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

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
 */
public class MainActivity extends Activity {

    private static final String TAG = "DRR";

    private static final String ASSET_PREFIX = "https://appassets.androidplatform.net/assets/";
    private static final String START_URL = ASSET_PREFIX + "www/index.html";

    private static final int BACKGROUND_COLOR = 0xFF07050C;

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

        webView = new WebView(this);
        webView.setBackgroundColor(BACKGROUND_COLOR);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebView.setWebContentsDebuggingEnabled(false);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                Log.i(TAG, "console: " + message.message()
                        + " (" + message.sourceId() + ":" + message.lineNumber() + ")");
                return true;
            }
        });

        WebSettings settings = webView.getSettings();
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

        webView.setWebViewClient(new WebViewClientCompat() {
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

        setContentView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::zurueckBehandeln);
        }
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
}
