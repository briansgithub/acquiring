@echo off
setlocal

pushd "%~dp0.."
if errorlevel 1 (
    echo Unable to open the diatonic_ring repository folder.
    pause
    exit /b 1
)

node "tools\midi-tools\index.mjs" doctor %*
set "MIDI_TOOLS_EXIT=%ERRORLEVEL%"

if not "%MIDI_TOOLS_EXIT%"=="0" (
    echo.
    echo The setup check found a problem ^(error code %MIDI_TOOLS_EXIT%^).
    echo Review the message above, then press any key to close this window.
    pause >nul
)

popd
exit /b %MIDI_TOOLS_EXIT%
