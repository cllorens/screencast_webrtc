# CLAUDE.md

Proyección de pantalla por WebRTC: un portátil (emisor) envía su pantalla al PC del
proyector (receptor, Chrome en kiosko). Vanilla JS sin build. Única dependencia: `ws`.
Ver README.md para el despliegue.

## Archivos

- `server.js`: HTTPS 443 + redirección HTTP 80 + señalización WSS en el mismo puerto + lanzador de Chrome en kiosko. Se cierra cuando se cierra Chrome.
- `index.html`: emisor (portátil). `receiver.html`: receptor (kiosko).
- `vendor/qrcode.min.js`: qrcode 1.5.1 servido localmente (no usar CDN).
- `<equipo>/` (cdavid, radio7, D214): `privateKey.pem`, `Cert_bundle.pem` y, opcionalmente, `pass.txt`. **Son secretos.**
- `test/server.test.js`: pruebas del servidor, se ejecutan con `npm test`.

## Reglas importantes

- **No ejecutes `node server.js` ni `start.cmd` tal cual en el PC de desarrollo.** Hacen `taskkill /IM chrome.exe /F` y cierran el Chrome del usuario. Para probar, usa `npm test` o `NO_KIOSK=1`.
- **No muestres el contenido** de `pass.txt` ni de las claves privadas.
- **Ficheros servidos:** se sirven solo los de la lista blanca `STATIC_FILES` de `server.js`. Si se añade un fichero web, se añade ahí y en la lista de 200 de las pruebas. Nunca sirvas la carpeta entera.
- **Certificado por equipo:** se elige por `os.hostname()` en minúsculas, buscando `<equipo>/`. El kiosko abre `https://<equipo>.gnd.upv.es/receiver.html` y confía en el certificado mediante `--ignore-certificate-errors-spki-list` (requiere `--user-data-dir`), así que los autofirmados funcionan en el proyector.

## Requisitos del usuario (decisiones tomadas)

- **Cero preguntas al usuario del portátil:** ni PIN, ni selector de fuente, ni casilla de audio. Solo Start y Stop. El diálogo de `getDisplayMedia` del navegador no se puede evitar.
- **Audio siempre activado** en la captura de pantalla (`systemAudio: "include"`). La cámara (móviles sin captura de pantalla) va sin micrófono, para evitar acoples.
- **Los portátiles van siempre por cable.** La red es de la UPV, detrás de un firewall. La seguridad de los PCs no es crítica, porque se restauran con OpenGnsys.
- Debe poder ejecutarlo un usuario de Windows **sin permisos de administrador**.
- Interfaz en inglés y comentarios del código en español (convención actual).

## Protocolo de señalización (JSON por WSS)

Registro:
- `{type:"receiver", token}`: solo es válido con el `RECEIVER_TOKEN` que el servidor pasa al kiosko en `?token=`.
- `{type:"sender"}`: se envía al pulsar Start (abrir la página no registra). Un emisor nuevo sustituye al anterior.

Mensajes del servidor:
- `registered`
- `receiver-ready`: se envía al emisor cuando hay receptor, también si el receptor se reconecta.
- `kicked`: al emisor sustituido.
- `peer-left`: cuando el otro extremo se desconecta.
- `error`: token del receptor incorrecto.

Mensajes reenviados entre emisor y receptor registrados:
- `{offer|answer|candidate, sid}`
- `{type:"request-offer"}`: del receptor al emisor, para renegociar tras un fallo.
- `{type:"stopped"}`: del emisor al receptor.

Cada negociación tiene un `sid` y los dos lados ignoran los mensajes de un `sid` antiguo.
El receptor crea un `RTCPeerConnection` nuevo por cada oferta. Ninguna página se recarga:
los WS se reconectan con espera creciente, y ICE `disconnected` tiene 5 s de margen antes de renegociar.
El servidor hace ping cada 15 s y cierra los sockets muertos.

## Entorno de desarrollo

- Windows. Node está en `C:\Program Files\nodejs`. En PowerShell puede hacer falta recargar el PATH:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + $env:Path`
- openssl: el de Git Bash. Usa `MSYS_NO_PATHCONV=1` con `-subj "/CN=..."`.
- No es un repositorio git. La carpeta está en Google Drive.
- Para comprobar la sintaxis de los HTML, extrae el `<script>` inline y pásalo por `node --check`.
- Las pruebas no cubren la parte WebRTC del navegador; hay que probarla a mano (ver README).
