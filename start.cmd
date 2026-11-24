@echo off
rem Arranca el servidor WebRTC (puertos 80/443 + Chrome en kiosko) con esta ventana minimizada.

rem Si no venimos ya relanzados, nos relanzamos minimizados y cerramos esta ventana
if /i not "%~1"=="min" (
  start "WebRTC screen share" /min cmd /c ""%~f0" min"
  exit /b
)

title WebRTC screen share
cd /d "%~dp0"

rem Evita que queden activas variables de las pruebas (puertos 8443/8080, sin kiosko...)
set "NO_KIOSK="
set "HTTPS_PORT="
set "HTTP_PORT="
set "RECEIVER_TOKEN="

rem Localizar node.exe
set "NODE=node"
where node >nul 2>&1 || set "NODE=%ProgramFiles%\nodejs\node.exe"
if not "%NODE%"=="node" if not exist "%NODE%" (
  echo No se encuentra Node.js. Instalalo con: winget install OpenJS.NodeJS.LTS
  pause
  exit /b 1
)

rem Instalar dependencias la primera vez
if not exist "node_modules\ws" (
  echo Instalando dependencias...
  call npm install || (pause & exit /b 1)
)

"%NODE%" server.js

rem server.js sale con 0 al cerrar Chrome (Alt+F4). Si sale con error, dejamos ver el mensaje.
if errorlevel 1 (
  echo.
  echo El servidor ha terminado con error. Revisa el mensaje de arriba.
  pause
)
