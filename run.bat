@echo off
echo Starting Script-to-Scene Editor...
cd timeline-editor
start http://localhost:8000
python -m http.server 8000
pause
