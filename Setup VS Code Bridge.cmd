@echo off
setlocal
cd /d "%~dp0"
echo ShanGyi Usage - VS Code bridge setup
echo This backs up and sets claudeCode.claudeProcessWrapper in your VS Code user settings.
echo VS Code itself will stay open. Save your work before reloading it later.
if not exist "%~dp0ShanGyiClaudeBridge.exe" goto missing
if not exist "%~dp0ShanGyi Usage.exe" goto missing
taskkill.exe /IM "ShanGyi Usage.exe" /T /F >nul 2>&1
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0ShanGyi Usage.exe" "%~dp0resources\app\app\setup-vscode.cjs" "%~dp0ShanGyiClaudeBridge.exe"
if errorlevel 1 goto failed
set "ELECTRON_RUN_AS_NODE="
start "" "%~dp0ShanGyi Usage.exe"
echo.
echo Setup finished. In VS Code run Developer: Reload Window, then use Claude Code normally.
pause
exit /b 0
:missing
echo Extract the entire ShanGyi Usage Windows ZIP before running this setup file.
pause
exit /b 1
:failed
set "ELECTRON_RUN_AS_NODE="
echo Setup did not finish. Open the widget Settings to review the connection.
start "" "%~dp0ShanGyi Usage.exe"
pause
exit /b 1
