@echo off
echo ============================================
echo   Script-to-Scene Setup
echo ============================================
echo.

:: Check Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python not found!
    echo Please install Python 3.8+ from https://python.org
    pause
    exit /b 1
)

echo [OK] Python found
python --version
echo.

:: Create lib folder if it doesn't exist
if not exist "%~dp0lib" mkdir "%~dp0lib"

:: Create virtual environment if it doesn't exist
cd /d "%~dp0backend"
if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
    echo [OK] Virtual environment created
) else (
    echo [OK] Virtual environment exists
)
echo.

:: Activate venv and install dependencies
echo Installing Python dependencies...
call venv\Scripts\activate.bat
pip install -r requirements.txt
call venv\Scripts\deactivate.bat
cd /d "%~dp0"
echo.

:: Check FFmpeg (local or system)
echo Checking FFmpeg...
set "FFMPEG_DIR=%~dp0backend\bin"

if exist "%FFMPEG_DIR%\ffmpeg.exe" (
    echo [OK] FFmpeg found in lib\ffmpeg\bin
    "%FFMPEG_DIR%\ffmpeg.exe" -version 2>&1 | findstr /R "^ffmpeg"
) else (
    where ffmpeg >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [WARNING] FFmpeg not found!
        echo.
        echo FFmpeg is REQUIRED for video export.
        echo.
        echo Installation steps:
        echo   1. Download FFmpeg from https://www.gyan.dev/ffmpeg/builds/
        echo   2. Download "ffmpeg-release-essentials.zip"
        echo   3. Extract ffmpeg.exe and ffprobe.exe to: %~dp0backend\bin\
        echo   4. Make sure ffmpeg.exe is at: backend\bin\ffmpeg.exe
        echo.
    ) else (
        echo [OK] FFmpeg found in system PATH
        ffmpeg -version 2>&1 | findstr /R "^ffmpeg"
    )
)

echo.
echo ============================================
echo   Setup Complete!
echo ============================================
echo.
echo Expected folder structure:
echo   backend\
echo     bin\
echo       ffmpeg.exe
echo       ffprobe.exe
echo.
echo To start the application, run: run.bat
echo.
echo The editor will be available at:
echo   Frontend: http://localhost:8000
echo   Backend:  http://localhost:5000
echo.
pause
