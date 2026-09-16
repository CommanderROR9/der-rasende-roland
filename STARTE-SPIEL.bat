@echo off
rem Startet "Der Rasende Roland" mit erlaubtem lokalem Dateizugriff (Windows).
rem Eigenes, leeres Browser-Profil ist noetig, damit die Freigabe auch greift,
rem wenn Chrome bereits laeuft. Die Ersteinrichtungs-Dialoge (Konto,
rem Suchmaschine, Standardbrowser) sind bewusst unterdrueckt.
cd /d "%~dp0"
set "P1=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "P2=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "P3=%LocalAppData%\Google\Chrome\Application\chrome.exe"
set "E1=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "E2=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "PROF=%TEMP%\der-rasende-roland"
if exist "%P1%" (start "" "%P1%" --allow-file-access-from-files --no-first-run --no-default-browser-check --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
if exist "%P2%" (start "" "%P2%" --allow-file-access-from-files --no-first-run --no-default-browser-check --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
if exist "%P3%" (start "" "%P3%" --allow-file-access-from-files --no-first-run --no-default-browser-check --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
if exist "%E1%" (start "" "%E1%" --allow-file-access-from-files --no-first-run --no-default-browser-check --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
if exist "%E2%" (start "" "%E2%" --allow-file-access-from-files --no-first-run --no-default-browser-check --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
echo Chrome/Edge nicht gefunden - Standardbrowser wird geoeffnet. Falls das Spiel
echo dort leer bleibt: bitte Chrome oder Edge installieren und diese Datei erneut starten.
start "" "%~dp0index.html"
