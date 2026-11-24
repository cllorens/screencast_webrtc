const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");
const os = require("os");
const { exec, spawn } = require("child_process");

// ---- Configuración según el PC (sobrescribible con variables de entorno)
// Cada equipo tiene una carpeta con su nombre (cdavid/, radio7/, D214/...) con:
//   privateKey.pem   clave privada (puede estar cifrada)
//   Cert_bundle.pem  certificado + intermedios
//   pass.txt         (opcional) contraseña de la clave cifrada
// El kiosko abre https://<equipo>.gnd.upv.es/receiver.html
const HOST = os.hostname().toLowerCase();
const DOMAIN = process.env.DOMAIN || "gnd.upv.es";
const hostDir = path.join(__dirname, HOST);

const KIOSK_URL = process.env.KIOSK_URL || `https://${HOST}.${DOMAIN}/receiver.html`;
const CERT_KEY = process.env.CERT_KEY || path.join(hostDir, "privateKey.pem");
const CERT_PEM = process.env.CERT_PEM || path.join(hostDir, "Cert_bundle.pem");
const CERT_PASS_FILE = process.env.CERT_PASS_FILE || path.join(path.dirname(CERT_KEY), "pass.txt");

for (const f of [CERT_KEY, CERT_PEM]) {
  if (!fs.existsSync(f)) {
    console.error(`❌ Missing ${f}\n   Create the folder "${HOST}" next to server.js with privateKey.pem and Cert_bundle.pem.`);
    process.exit(1);
  }
}
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 443;
const HTTP_PORT = Number(process.env.HTTP_PORT) || 80;
// NO_KIOSK=1 → no cierra ni lanza Chrome (para pruebas en un PC de desarrollo)
const NO_KIOSK = process.env.NO_KIOSK === "1";

const credentials = {
  key: fs.readFileSync(CERT_KEY),
  cert: fs.readFileSync(CERT_PEM),
};
if (fs.existsSync(CERT_PASS_FILE)) {
  credentials.passphrase = fs.readFileSync(CERT_PASS_FILE, "utf8").trim();
}

// Huella SPKI del certificado: el Chrome del kiosko confía en él aunque sea autofirmado
// (--ignore-certificate-errors-spki-list, solo válido junto con --user-data-dir)
const leafCert = new crypto.X509Certificate(credentials.cert);
const CERT_SPKI = crypto
  .createHash("sha256")
  .update(leafCert.publicKey.export({ type: "spki", format: "der" }))
  .digest("base64");
const SELF_SIGNED = leafCert.issuer === leafCert.subject;
console.log(`📜 Host=${HOST}  cert=${path.relative(__dirname, CERT_PEM)}  ${leafCert.subject.replace(/\n/g, ", ")}` +
            `  valid until ${leafCert.validTo}${SELF_SIGNED ? "  (self-signed)" : ""}`);
console.log(`🧭 Kiosk URL: ${KIOSK_URL}`);

// ---- Ficheros estáticos: SOLO lista blanca (nunca se sirve nada más de la carpeta)
const STATIC_FILES = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/receiver.html": { file: "receiver.html", type: "text/html; charset=utf-8" },
  "/vendor/qrcode.min.js": { file: "vendor/qrcode.min.js", type: "application/javascript; charset=utf-8" },
};

function serveStatic(req, res) {
  const urlPath = (req.url || "/").split("?")[0];
  const entry = STATIC_FILES[urlPath];
  console.log(`[HTTPS] ${req.method} ${urlPath}${entry ? "" : " (404)"}`);

  if (!entry || (req.method !== "GET" && req.method !== "HEAD")) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 - Not found");
    return;
  }

  fs.readFile(path.join(__dirname, entry.file), (err, content) => {
    if (err) {
      console.error(`[HTTPS] Error reading ${entry.file}:`, err.message);
      res.writeHead(500);
      res.end("500 - Internal error");
      return;
    }
    res.writeHead(200, { "Content-Type": entry.type, "Cache-Control": "no-cache" });
    res.end(req.method === "HEAD" ? undefined : content);
  });
}

// HTTPS server (443)
const httpsServer = https.createServer(credentials, serveStatic);

// HTTP -> HTTPS redirect (80)
const httpServer = http
  .createServer((req, res) => {
    const host = req.headers.host ? req.headers.host.split(":")[0] : "localhost";
    const port = HTTPS_PORT === 443 ? "" : `:${HTTPS_PORT}`;
    res.writeHead(301, { Location: `https://${host}${port}${req.url}` });
    res.end();
  })
  .listen(HTTP_PORT, () => console.log(`🌐 HTTP redirect listening on http://0.0.0.0:${HTTP_PORT}`));

// ---- Solo el kiosko lanzado por este servidor puede registrarse como receptor.
// Se le pasa un token aleatorio en la URL (?token=...). No dependemos de la IP de origen
// porque el kiosko entra por el nombre público y, según la red, puede llegar con
// la IP del PC, la del firewall/NAT, etc.
const RECEIVER_TOKEN = process.env.RECEIVER_TOKEN || crypto.randomBytes(16).toString("hex");

function isValidReceiverToken(token) {
  const a = Buffer.from(String(token || ""));
  const b = Buffer.from(RECEIVER_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- Señalización WSS sobre el mismo servidor HTTPS (443)
const wss = new WebSocket.Server({ server: httpsServer, maxPayload: 256 * 1024 });

let sender = null;
let receiver = null;

function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function summarize(msg) {
  if (msg.offer) return `offer sid=${msg.sid}`;
  if (msg.answer) return `answer sid=${msg.sid}`;
  if (msg.candidate) return `candidate sid=${msg.sid}`;
  return JSON.stringify(msg);
}

wss.on("connection", (ws, req) => {
  const addr = req.socket.remoteAddress;
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));
  console.log(`🔌 WSS client connected from ${addr}`);

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch (e) {
      console.error("❌ Invalid JSON from", addr);
      return;
    }

    if (data.type === "receiver") {
      if (!isValidReceiverToken(data.token)) {
        console.warn(`⛔ Rejected receiver registration from ${addr} (bad token)`);
        send(ws, { type: "error", reason: "receiver-not-allowed" });
        ws.close();
        return;
      }
      if (receiver && receiver !== ws) receiver.close();
      receiver = ws;
      console.log("📥 Registered receiver");
      // Si ya hay alguien compartiendo, que vuelva a negociar con este receptor
      send(sender, { type: "receiver-ready" });
      return;
    }

    if (data.type === "sender") {
      if (sender && sender !== ws) {
        console.log("🔁 New sender replaces the previous one");
        send(sender, { type: "kicked" });
      }
      sender = ws;
      console.log(`📤 Registered sender ${addr}`);
      send(sender, { type: "registered" });
      if (receiver) send(sender, { type: "receiver-ready" });
      return;
    }

    // Reenvío de señalización: solo entre el emisor y el receptor registrados
    const target = ws === sender ? receiver : ws === receiver ? sender : null;
    if (!target) {
      console.log(`⚠️ Not relayed (${ws === sender || ws === receiver ? "no peer" : "unregistered client"}): ${summarize(data)}`);
      return;
    }
    console.log(`📩 ${ws === sender ? "sender→receiver" : "receiver→sender"}: ${summarize(data)}`);
    send(target, data);
  });

  ws.on("close", () => {
    console.log(`❌ WSS client disconnected (${addr})`);
    if (ws === sender) {
      sender = null;
      send(receiver, { type: "peer-left" });
    }
    if (ws === receiver) {
      receiver = null;
      send(sender, { type: "peer-left" });
    }
  });

  ws.on("error", (err) => console.error("❌ WSS error:", err.message));
});

// Latido: detecta portátiles que cierran la tapa o pierden el WiFi sin cerrar el socket
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 15000);

function shutdown(reason) {
  console.log(`🛑 Shutting down (${reason})...`);
  clearInterval(heartbeat);
  try { wss.close(); } catch {}
  try { httpsServer.close(); } catch {}
  try { httpServer.close(); } catch {}
  setTimeout(() => process.exit(0), 200);
}

httpsServer.listen(HTTPS_PORT, () => {
  console.log(`🔒 HTTPS server listening on https://0.0.0.0:${HTTPS_PORT}`);

  if (NO_KIOSK) {
    console.log("ℹ️ NO_KIOSK=1: Chrome kiosk not launched.");
    return;
  }

  // ---- Lanzar Chrome en modo kiosko
  const chromeCandidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];

  const chromePath = chromeCandidates.find((p) => fs.existsSync(p));
  if (!chromePath) {
    console.error("❌ Chrome not found. Adjust Chrome path in server.js.");
    return;
  }

  // 1) Cerrar Chrome existente (si no, ignora los flags)
  exec("taskkill /IM chrome.exe /F", (killErr) => {
    if (killErr) console.log("ℹ️ taskkill:", killErr.message.trim());
    else console.log("✅ Chrome processes terminated");

    const tempDir = process.env.TEMP || process.env.TMP || "C:\\Windows\\Temp";
    const userDataDir = path.join(tempDir, "kiosk-profile");
    try { fs.mkdirSync(userDataDir, { recursive: true }); } catch {}

    const u = new URL(KIOSK_URL);
    u.searchParams.set("token", RECEIVER_TOKEN);
    const kioskUrl = u.toString();

    const args = [
      "--kiosk",
      "--start-fullscreen",
      "--no-first-run",
      "--disable-infobars",
      "--disable-pinch",
      "--overscroll-history-navigation=0",
      // Expone las IPs reales en los candidatos ICE (sin esto salen como *.local vía mDNS,
      // que no resuelve si emisor y proyector están en subredes distintas)
      "--disable-features=WebRtcHideLocalIpsWithMdns",
      // Permite reproducir el audio del emisor sin interacción del usuario
      "--autoplay-policy=no-user-gesture-required",
      `--user-data-dir=${userDataDir}`,
      // Acepta el certificado del propio servidor sin avisos (necesario si es autofirmado)
      `--ignore-certificate-errors-spki-list=${CERT_SPKI}`,
      kioskUrl, // URL al final
    ];

    console.log("🧭 Launching Chrome kiosk:", chromePath, args.join(" ").replace(RECEIVER_TOKEN, "<token>"));

    const chromeProc = spawn(chromePath, args, {
      stdio: "ignore",
      windowsHide: false,
      detached: false, // seguimos enganchados para detectar Alt+F4
    });

    chromeProc.on("error", (err) => console.error("❌ Error launching Chrome:", err));

    // Al cerrar Chrome (Alt+F4) se cierra también el servidor
    chromeProc.on("exit", (code, signal) => {
      console.log(`👋 Chrome exited (code=${code}, signal=${signal}). Exiting server.js...`);
      shutdown("chrome closed");
    });

    console.log("✅ Chrome launched in kiosk mode.");
  });
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
