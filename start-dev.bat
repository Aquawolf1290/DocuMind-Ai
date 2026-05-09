@echo off
set ROOT=%~dp0

echo Starting DocuMind AI backend on http://0.0.0.0:8010
echo Mobile devices on the same Wi-Fi can use your laptop IP, for example http://192.168.1.3:8010/api
start "DocuMind AI Backend" cmd /k "cd /d %ROOT%backend && ..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8010"

echo Starting DocuMind AI frontend on http://127.0.0.1:5173
start "DocuMind AI Frontend" cmd /k "cd /d %ROOT%frontend && npm.cmd run dev -- --port 5173"

echo.
echo Open this URL in your browser:
echo http://127.0.0.1:5173
echo.
pause
