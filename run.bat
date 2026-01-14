@echo off
echo ============================================
echo   Script-to-Scene Video Editor
echo ============================================
echo.

:: Set FFmpeg path from backend/bin folder if it exists
set "FFMPEG_DIR=%~dp0backend\bin"
if exist "%FFMPEG_DIR%\ffmpeg.exe" (
    echo [OK] Using local FFmpeg from backend\bin
    set "PATH=%FFMPEG_DIR%;%PATH%"
) else (
    :: Check if FFmpeg is in system PATH
    where ffmpeg >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [WARNING] FFmpeg not found!
        echo.
        echo Please install FFmpeg to: %~dp0backend\bin\
        echo   ^(put ffmpeg.exe in backend\bin\^)
        echo.
        echo Download from: https://www.gyan.dev/ffmpeg/builds/
        echo.
        pause
    ) else (
        echo [OK] Using FFmpeg from system PATH
    )
)

:: Check Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python not found!
    echo Please install Python 3.8+
    pause
    exit /b 1
)
echo [OK] Python found

:: Check if venv exists
if not exist "%~dp0backend\venv" (
    echo [ERROR] Virtual environment not found!
    echo Please run setup.bat first.
    pause
    exit /b 1
)
echo [OK] Virtual environment found

:: Start Backend Server with venv
echo.
echo Starting Backend Server on port 5000...
cd /d "%~dp0backend"
start "Backend Server" cmd /k "set PATH=%FFMPEG_DIR%;%PATH% && call venv\Scripts\activate.bat && python server.py"
cd /d "%~dp0"

:: Wait for backend to start
timeout /t 2 /nobreak >nul

:: Start Frontend Server
echo Starting Frontend Server on port 8000...
cd /d "%~dp0timeline-editor"
start "Frontend Server" cmd /k "python -m http.server 8000"
cd /d "%~dp0"

:: Wait for frontend to start
timeout /t 1 /nobreak >nul

:: Open browser
echo Opening browser...
start http://localhost:8000

echo.
echo ============================================
echo   Servers Running
echo ============================================
echo   Frontend: http://localhost:8000
echo   Backend:  http://localhost:5000
echo ============================================
echo.
echo Press any key to stop servers...
pause >nul

:: Kill servers (optional - user can close windows manually)
taskkill /FI "WINDOWTITLE eq Frontend Server*" >nul 2>&1
taskkill /FI "WINDOWTITLE eq Backend Server*" >nul 2>&1
