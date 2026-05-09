@echo off
set ROOT=%~dp0

echo Starting DocuMind AI mobile app with Expo
echo.
echo Android emulator API base: http://10.0.2.2:8010/api
echo iOS simulator API base: http://127.0.0.1:8010/api
echo Real phone: edit the API endpoint in the app to your laptop IP, for example http://192.168.1.10:8010/api
echo.

cd /d "%ROOT%mobile"
npm.cmd run start
