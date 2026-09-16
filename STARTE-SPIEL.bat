@echo off
rem Startet "Der Rasende Roland" mit erlaubtem lokalem Dateizugriff (Windows).
rem Nutzt ein eigenes, leeres Browser-Profil (noetig, damit die Freigabe auch
rem greift, wenn der Browser schon laeuft). Ersteinrichtungs-Dialoge sind aus.
rem Reihenfolge: Chrome, Edge, Firefox - was installiert ist.
cd /d "%~dp0"
set "P1=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "P2=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "P3=%LocalAppData%\Google\Chrome\Application\chrome.exe"
set "E1=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "E2=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "F1=%ProgramFiles%\Mozilla Firefox\firefox.exe"
set "F2=%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"
set "PROF=%TEMP%\der-rasende-roland"
set "FFPROF=%TEMP%\der-rasende-roland-firefox"
if exist "%P1%" (start "" "%P1%" --allow-file-access-from-files --no-first-run --no-default-browser-check --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
if exist "%P2%" (start "" "%P2%" --allow-file-access-from-files --no-first-run --no-default-browser-check --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
if exist "%P3%" (start "" "%P3%" --allow-file-access-from-files --no-first-run --no-default-browser-check --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
if exist "%E1%" (start "" "%E1%" --allow-file-access-from-files --no-first-run --no-default-browser-check --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
if exist "%E2%" (start "" "%E2%" --allow-file-access-from-files --no-first-run --no-default-browser-check --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
rem Firefox braucht ein vorbereitetes Profil, das lokale Spielmodule erlaubt.
if not exist "%FFPROF%" mkdir "%FFPROF%"
>"%FFPROF%\user.js" echo user_pref("privacy.file_unique_origin", false);
>>"%FFPROF%\user.js" echo user_pref("security.fileuri.strict_origin_policy", false);
if exist "%F1%" (start "" "%F1%" -profile "%FFPROF%" "%~dp0index.html" & exit /b)
if exist "%F2%" (start "" "%F2%" -profile "%FFPROF%" "%~dp0index.html" & exit /b)
echo Kein Chrome, Edge oder Firefox gefunden - Standardbrowser wird geoeffnet.
echo Falls das Spiel dort leer bleibt: bitte Chrome, Edge oder Firefox installieren
echo und diese Datei erneut starten.
start "" "%~dp0index.html"
