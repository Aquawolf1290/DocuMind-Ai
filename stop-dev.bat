@echo off
echo Stopping DocuMind AI dev servers on ports 5173 and 8010...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /PID %%a /F
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8010" ^| findstr "LISTENING"') do taskkill /PID %%a /F

echo Done.
pause
