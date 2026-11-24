# WebRTC Screen Share

Proyección inalámbrica de la pantalla de un portátil al PC conectado al proyector, usando
solo el navegador. No hay que instalar nada en los portátiles.

- El **PC del proyector** ejecuta `server.js`, que abre Chrome a pantalla completa (kiosko)
  mostrando la URL y un QR.
- El **portátil** abre esa URL, pulsa **Start sharing** y elige la pantalla en el diálogo
  del navegador. La imagen y el audio van directamente del portátil al proyector (WebRTC).
  El servidor solo intercambia los mensajes iniciales.

Pensado para proyectores de aula, pantallas permanentes, cartelería y demos.

## Cómo funciona

1. `server.js` arranca:
   - HTTPS en el puerto **443**, con señalización WSS en el mismo puerto.
   - Redirección HTTP → HTTPS en el **80**.
   - Chrome en **modo kiosko** con `receiver.html`.
2. El **receptor** se conecta por WSS, se registra con el token que le pasa el servidor y
   espera, mostrando la URL y el QR.
3. El **emisor** abre `https://<equipo>.gnd.upv.es/`. Al pulsar *Start*, captura la
   pantalla con `getDisplayMedia` y negocia la conexión WebRTC a través del WSS.
4. Cuando ICE conecta, la imagen y el audio van **de igual a igual (P2P)** entre el portátil y el
   proyector. El servidor ya no está en el camino de los datos.
5. Si se corta la conexión, los dos lados se reconectan y renegocian solos. Al cerrar el
   kiosko (Alt+F4), el servidor también se cierra.

## Contenido de la carpeta

```
server.js             Servidor HTTPS (443) + redirección HTTP (80) + señalización WSS + lanzador del kiosko
index.html            Página del emisor (portátil)
receiver.html         Página del receptor (kiosko del proyector)
kiosk-display.js      Elige la pantalla del kiosko (con 2+ pantallas, la secundaria)
vendor/qrcode.min.js  Librería del QR (qrcode 1.5.1), servida localmente
start.cmd             Arranque con doble clic (ventana minimizada)
test/server.test.js   Pruebas del servidor (npm test)
<equipo>/             Certificado de cada PC: cdavid/, radio7/, D214/ ...
node_modules/         Dependencia "ws" (se incluye para no necesitar npm install en los PCs)
```

## Puesta en marcha en un PC del proyector

Pasos que hace **un administrador una sola vez** (o que se incluyen en la imagen de OpenGnsys):

1. Instalar Node.js LTS para todo el equipo:
   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```
2. Copiar esta carpeta a un disco local, por ejemplo `C:\webrtc-screen-share`, con `node_modules` incluido.
3. Abrir los puertos en el firewall. Un usuario sin permisos no puede aceptar el aviso del firewall:
   ```powershell
   New-NetFirewallRule -DisplayName "WebRTC screen share" -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow -Profile Any
   ```
4. Comprobar que existe la carpeta del certificado de ese equipo (ver más abajo).

Para arrancarlo, cualquier usuario (no hace falta que sea administrador):

- Doble clic en **`start.cmd`**. También funciona `node server.js` o `npm start`.
- Para que arranque al iniciar sesión, pon un acceso directo a `start.cmd` en `shell:startup`.
- Para cerrarlo, pulsa **Alt+F4** en el kiosko: se cierran Chrome y el servidor.

Al arrancar, el servidor cierra los Chrome abiertos del usuario y abre el kiosko en
`https://<equipo>.gnd.upv.es/receiver.html`.

**Pantalla del kiosko:**
- Con una sola pantalla, el kiosko va en ella.
- Con **dos o más**, va en la que **no es la principal**. Con el proyector en modo
  *Extender*, es la "Pantalla 2".
- Para forzar otra, usa `KIOSK_DISPLAY=primary`, o `KIOSK_DISPLAY=1`, `2`… (contando de
  izquierda a derecha).
- Para ver qué pantallas detecta un PC: `node kiosk-display.js`.

## Uso desde el portátil

1. Abrir `https://<equipo>.gnd.upv.es/` o escanear el QR del proyector.
2. Pulsar **Start sharing** y elegir *Pantalla completa*, que ya viene preseleccionada junto con el audio del sistema.
3. Para terminar, pulsar **Stop** o *Dejar de compartir* en la barra del navegador.

Si otro portátil empieza a compartir, sustituye al anterior, y al anterior se le avisa.
El audio del sistema con pantalla completa solo funciona en Windows con Chrome o Edge.
Los dispositivos sin captura de pantalla (móviles) envían la cámara, sin micrófono.

## Certificados

El servidor busca una carpeta con el **nombre del equipo** de Windows. Mayúsculas y
minúsculas dan igual.

```
<equipo>/privateKey.pem    clave privada (puede estar cifrada)
<equipo>/Cert_bundle.pem   certificado + intermedios ("PEM bundle" de HARICA)
<equipo>/pass.txt          solo si la clave está cifrada: su contraseña
```

| Equipo | Certificado              | Caduca     |
|--------|--------------------------|------------|
| cdavid | HARICA                   | 13/01/2027 |
| D214   | HARICA (clave cifrada)   | 03/02/2027 |
| radio7 | Autofirmado              | 26/02/2029 |

**Certificado oficial (HARICA).** El procedimiento está en la wiki de la UPV:
[Solicitud de un certificado SSL](https://wiki.upv.es/confluence/spaces/MANUALES/pages/1074954357/1+-+Solicitud+de+un+certificado+SSL).
Al descargarlo, elige **PEM bundle** y guárdalo como `Cert_bundle.pem`.

**Certificado autofirmado** (provisional, mientras no haya uno oficial). Se genera con el
openssl de Git Bash, cambiando el nombre y la IP:

```bash
mkdir radio7 && cd radio7
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -sha256 -days 825 \
  -keyout privateKey.pem -out Cert_bundle.pem \
  -subj "/C=ES/O=Universitat Politecnica de Valencia/CN=radio7.gnd.upv.es" \
  -addext "subjectAltName=DNS:radio7.gnd.upv.es,DNS:radio7,IP:158.42.148.181" \
  -addext "basicConstraints=critical,CA:FALSE" -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=serverAuth"
```

Con un certificado autofirmado, el proyector no muestra avisos, porque el kiosko confía en
el certificado del servidor. Los portátiles sí verán el aviso *"La conexión no es privada"*
la primera vez. Para evitarlo, se puede instalar `Cert_bundle.pem` (renombrado a `.crt`)
en *Entidades de certificación raíz de confianza* del portátil.

## Seguridad

- **Ficheros servidos:** solo se sirven `index.html`, `receiver.html` y `vendor/qrcode.min.js`.
  Las claves, el código y el resto de la carpeta no son accesibles por web.
- **Receptor:** solo puede registrarse el kiosko lanzado por `server.js`, mediante un token
  aleatorio que se genera en cada arranque.
- **Emisores:** no hay PIN. Cualquiera que llegue a la URL puede proyectar, porque la red está tras el firewall de la UPV.

## Variables de entorno (opcionales)

| Variable         | Por defecto                              | Uso                                       |
|------------------|------------------------------------------|-------------------------------------------|
| `KIOSK_URL`      | `https://<equipo>.gnd.upv.es/receiver.html` | URL que abre el kiosko                 |
| `DOMAIN`         | `gnd.upv.es`                             | Dominio que se añade al nombre del equipo |
| `CERT_KEY`       | `<equipo>/privateKey.pem`                | Clave privada                             |
| `CERT_PEM`       | `<equipo>/Cert_bundle.pem`               | Certificado                               |
| `CERT_PASS_FILE` | `pass.txt` junto a la clave              | Contraseña de la clave cifrada            |
| `KIOSK_DISPLAY`  | `auto` (secundaria si hay 2+)            | `primary` o número de pantalla (1, 2…, de izquierda a derecha) |
| `HTTPS_PORT`     | `443`                                    | Puerto HTTPS/WSS                          |
| `HTTP_PORT`      | `80`                                     | Puerto de redirección HTTP                |
| `NO_KIOSK`       | —                                        | `1` = no cierra ni abre Chrome (pruebas)  |
| `RECEIVER_TOKEN` | aleatorio                                | Token fijo del receptor (pruebas)         |

`start.cmd` borra `NO_KIOSK`, `HTTPS_PORT`, `HTTP_PORT` y `RECEIVER_TOKEN` antes de arrancar.

## Pruebas

```powershell
npm test
```

Arranca el servidor en 8443/8080 sin kiosko. Comprueba qué ficheros se sirven y que la
señalización funciona: registro, relevo de emisores y avisos de desconexión.

Para probarlo en un navegador sin cerrar tu Chrome:

```powershell
$env:NO_KIOSK="1"; $env:RECEIVER_TOKEN="prueba"; node server.js
```

Después abre `https://<equipo>.gnd.upv.es/receiver.html?token=prueba` en una ventana y
`https://<equipo>.gnd.upv.es/` en otra.

## Problemas frecuentes

- **`EADDRINUSE` al arrancar:** otro programa (IIS, por ejemplo) usa el puerto 80 o el 443.
  Para ver cuál: `Get-NetTCPConnection -LocalPort 80,443 -State Listen`.
- **`Missing ...privateKey.pem`:** falta la carpeta del certificado de ese equipo.
- **Los portátiles no cargan la página:** revisa la regla del firewall.
- **La página carga pero no llega imagen:** mira la consola del navegador (F12) en el
  portátil. Las líneas `[PC]` muestran el estado de la conexión WebRTC.

## Créditos

Desarrollado por el autor con la ayuda de **ChatGPT (OpenAI)** en la versión inicial
(diseño de la señalización, depuración de ICE/WSS, HTTPS y kiosko) y de **Claude (Anthropic)** en la
versión 2. Claude hizo la revisión de seguridad, la reconexión y renegociación automáticas,
los certificados por equipo, las pruebas y la documentación.

## Licencia

MIT
