package io.github.commanderror9.derrasenderoland;

import android.app.Application;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.util.Log;

import androidx.webkit.WebViewCompat;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Kleine Diagnose-Hilfe fuer die WebView-Huelle.
 *
 * Ein Teil der Samsung-Geraete mit sehr neuen Android-Versionen stuerzt beim
 * ersten WebView-Zugriff ab ("failed to redirect ResourcesImpl" - ein bekanntes
 * Plattform-Problem, kein Fehler der App). Ohne Gegenmassnahme schliesst sich
 * die App dann wortlos. Diese Klasse schreibt den Absturzbericht in eine Datei;
 * MainActivity zeigt ihn beim naechsten Start an, statt wieder einfach zu
 * verschwinden.
 */
public class DRRApp extends Application {

    static final String CRASH_DATEI = "letzter-crash.txt";
    static final String SPUR_DATEI = "start-spur.txt";

    @Override
    public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler vorgaenger =
                Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, fehler) -> {
            try {
                schreibeText(getApplicationContext(), CRASH_DATEI, bericht(fehler));
            } catch (Throwable ignoriert) {
                // Hier ist nichts mehr zu retten.
            }
            if (vorgaenger != null) {
                vorgaenger.uncaughtException(thread, fehler);
            } else {
                android.os.Process.killProcess(android.os.Process.myPid());
            }
        });
    }

    private String bericht(Throwable fehler) {
        StringWriter text = new StringWriter();
        fehler.printStackTrace(new PrintWriter(text));
        String zeit = new SimpleDateFormat("dd.MM.yyyy HH:mm:ss", Locale.GERMANY)
                .format(new Date());
        StringBuilder sb = new StringBuilder();
        sb.append("Der Rasende Roland - Startabsturz\n");
        sb.append("Zeit: ").append(zeit).append('\n');
        sb.append("Geraet: ").append(Build.MANUFACTURER).append(' ')
                .append(Build.MODEL).append('\n');
        sb.append("Android: ").append(Build.VERSION.RELEASE)
                .append(" (API ").append(Build.VERSION.SDK_INT).append(")\n");
        sb.append("WebView: ").append(webViewVersion(this)).append('\n');
        sb.append('\n').append(text);
        return sb.toString();
    }

    static String webViewVersion(Context ctx) {
        try {
            PackageInfo info = WebViewCompat.getCurrentWebViewPackage(ctx);
            if (info != null) {
                return info.packageName + " " + info.versionName;
            }
        } catch (Throwable t) {
            // Auf aelteren WebView-Versionen nicht ermittelbar - ignorieren.
        }
        return "(nicht ermittelbar)";
    }

    static void schreibeText(Context ctx, String name, String text) {
        try (FileWriter w = new FileWriter(new File(ctx.getFilesDir(), name))) {
            w.write(text);
        } catch (Throwable t) {
            Log.e("DRR", "Konnte " + name + " nicht schreiben", t);
        }
    }

    static void haengeAn(Context ctx, String name, String text) {
        try (FileWriter w = new FileWriter(new File(ctx.getFilesDir(), name), true)) {
            w.write(text);
        } catch (Throwable t) {
            Log.e("DRR", "Konnte " + name + " nicht ergaenzen", t);
        }
    }
}
