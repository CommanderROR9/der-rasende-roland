@echo off
rem Startet "Der Rasende Roland" mit erlaubtem lokalem Dateizugriff (Windows).
cd /d "%~dp0"
set "P1=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "P2=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "P3=%LocalAppData%\Google\Chrome\Application\chrome.exe"
set "E1=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "E2=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "PROF=%TEMP%\der-rasende-roland"
if exist "%P1%" (start "" "%P1%" --allow-file-access-from-files --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
if exist "%P2%" (start "" "%P2%" --allow-file-access-from-files --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
if exist "%P3%" (start "" "%P3%" --allow-file-access-from-files --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
if exist "%E1%" (start "" "%E1%" --allow-file-access-from-files --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
if exist "%E2%" (start "" "%E2%" --allow-file-access-from-files --user-data-dir="%PROF%" "%~dp0index.html" & exit /b)
echo Chrome/Edge nicht gefunden - Standardbrowser wird geoeffnet (am besten Firefox nutzen).
start "" "%~dp0index.html"
