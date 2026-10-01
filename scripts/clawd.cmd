@echo off
rem Control the installed Clawd desktop pet from cmd or PowerShell.
rem   clawd [show]           start Clawd or bring it back
rem   clawd hide             hide Clawd (keeps running in the tray)
rem   clawd quit             close Clawd (it comes back with the next Claude Code session)
rem   clawd off              close Clawd and stop it coming back with Claude Code
rem   clawd on               allow that again and start Clawd
rem   clawd size SIZE        small, medium, large or pixels (64-512)
rem   clawd status           print what Clawd is doing (JSON)
rem   clawd startup on|off    enable/disable start with Windows
setlocal
set "EXE=%LOCALAPPDATA%\Programs\clawd-desktop\ClaudePet.exe"
if not exist "%EXE%" (
  echo Clawd belum terpasang: "%EXE%"
  exit /b 1
)

set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=show"
if /i "%ACTION%"=="start" set "ACTION=show"

if /i "%ACTION%"=="show" goto run
if /i "%ACTION%"=="hide" goto run
if /i "%ACTION%"=="quit" goto run
if /i "%ACTION%"=="on" goto on
if /i "%ACTION%"=="off" goto off
if /i "%ACTION%"=="size" goto size
if /i "%ACTION%"=="status" goto status
if /i "%ACTION%"=="startup" goto startup
goto usage

:run
start "" "%EXE%" --%ACTION%
exit /b 0

:on
start "" "%EXE%" --launch-on --show
exit /b 0

:off
start "" "%EXE%" --launch-off --quit
exit /b 0

:size
if "%~2"=="" goto usage
start "" "%EXE%" --size=%~2
exit /b 0

:startup
if /i "%~2"=="on" (
  start "" "%EXE%" --startup-on
  exit /b 0
)
if /i "%~2"=="off" (
  start "" "%EXE%" --startup-off
  exit /b 0
)
goto usage

:status
curl -s -m 2 http://127.0.0.1:47321/status
if errorlevel 1 (
  echo Clawd tidak berjalan.
  exit /b 1
)
echo.
exit /b 0

:usage
echo Pakai: clawd [show^|hide^|quit^|on^|off^|status]
echo        clawd size small^|medium^|large^|PIXEL
echo        clawd startup on^|off
exit /b 1
