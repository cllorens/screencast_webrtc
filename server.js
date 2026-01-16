const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const { exec, spawn } = require("child_process"); // <-- spawn added (minimal)

// Certificado autofirmado
const credentials = {
  key: fs.readFileSync("certificado.key"),
  cert: fs.readFileSync("certificado.pem"),
};

// Servir archivos estáticos (mismo comportamiento que tu servidor anterior)
function serveStatic(req, res) {
  console.log(`[HTTPS] ${req.method} ${req.url}`);

  const urlPath = req.url.split("?")[0];
  let filePath = "." + urlPath;
  if (filePath === "./") filePath = "./index.html";

  const extname = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
  };
  const contentType = mimeTypes[extname] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      console.error(`[HTTPS] Not found: ${filePath}`);
      res.writeHead(404);
      res.end("404 - File not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
}

// HTTPS server (443)
const httpsServer = https.createServer(credentials, serveStatic);

// HTTP -> HTTPS redirect (80)
const httpServer = http
  .createServer((req, res) => {
    const host = req.headers.host ? req.headers.host.split(":")[0] : "localhost";
    const location = `https://${host}${req.url}`;
    res.writeHead(301, { Location: location });
    res.end();
  })
  .listen(80, () => {
    console.log("🌐 HTTP redirect listening on http://0.0.0.0:80");
  });

// WSS sobre el mismo servidor HTTPS (puerto 443)
const wss = new WebSocket.Server({ server: httpsServer });

let sender = null;
let receiver = null;

wss.on("connection", (ws) => {
  console.log("🔌 WSS client connected");

  ws.on("message", (message) => {
    const msgStr = typeof message === "string" ? message : message.toString();
    console.log("📩 WSS message:", msgStr);

    let data;
    try {
      data = JSON.parse(msgStr);
    } catch (e) {
      console.error("❌ Invalid JSON:", e);
      return;
    }

    if (data.type === "sender") {
      sender = ws;
      console.log("📤 Registered sender");
      return;
    }
    if (data.type === "receiver") {
      receiver = ws;
      console.log("📥 Registered receiver");
      return;
    }

    // Relay signaling messages
    if (ws === sender && receiver) {
      receiver.send(msgStr);
    } else if (ws === receiver && sender) {
      sender.send(msgStr);
    } else {
      console.log("⚠️ No peer available to relay");
    }
  });

  ws.on("close", () => {
    console.log("❌ WSS client disconnected");
    if (ws === sender) sender = null;
    if (ws === receiver) receiver = null;
  });

  ws.on("error", (err) => {
    console.error("❌ WSS error:", err);
  });
});

function shutdown(reason) {
  console.log(`🛑 Shutting down (${reason})...`);

  try { wss.close(); } catch {}
  try { httpsServer.close(); } catch {}
  try { httpServer.close(); } catch {}

  // give a moment to close sockets cleanly
  setTimeout(() => process.exit(0), 200);
}

httpsServer.listen(443, () => {
  console.log("🔒 HTTPS server listening on https://0.0.0.0:443");

  // ---- Launch Chrome in kiosk mode ----
  const url = "https://cdavid.gnd.upv.es/receiver.html";

  // Typical Chrome paths on Windows
  const chromeCandidates = [
    "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
    "C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
  ];

  const chromePath = chromeCandidates.find((p) => fs.existsSync(p));
  if (!chromePath) {
    console.error("❌ Chrome not found. Adjust Chrome path in server.js.");
    return;
  }

  // 1) Kill any existing Chrome (otherwise flags can be ignored)
  const killCmd = `taskkill /IM chrome.exe /F`;
  console.log("🧹 Killing existing Chrome (if any):", killCmd);

  exec(killCmd, (killErr) => {
    if (killErr) console.log("ℹ️ taskkill:", killErr.message);
    else console.log("✅ Chrome processes terminated");

    // IMPORTANT: with spawn(), Windows env vars like %TEMP% are NOT expanded.
    // Use a real path from Node instead of "%TEMP%..."
    const tempDir = process.env.TEMP || process.env.TMP || "C:\\Windows\\Temp";
    const userDataDir = path.join(tempDir, "kiosk-profile");
    try { fs.mkdirSync(userDataDir, { recursive: true }); } catch {}

    const args = [
      "--kiosk",
      "--start-fullscreen",
      "--no-first-run",
      "--disable-infobars",
      "--disable-pinch",
      "--overscroll-history-navigation=0",
      `--user-data-dir=${userDataDir}`,
      url, // URL last
    ];

    console.log("🧭 Launching Chrome kiosk:", chromePath, args.join(" "));

    const chromeProc = spawn(chromePath, args, {
      stdio: "ignore",
      windowsHide: false,
      detached: false, // keep attached so we can detect Alt+F4 close
    });

    chromeProc.on("error", (err) => {
      console.error("❌ Error launching Chrome:", err);
    });

    // When you close Chrome (Alt+F4), exit Node
    chromeProc.on("exit", (code, signal) => {
      console.log(`👋 Chrome exited (code=${code}, signal=${signal}). Exiting server.js...`);
      shutdown("chrome closed");
    });

    console.log("✅ Chrome launched in kiosk mode.");
  });
});

// Exit cleanly on Ctrl+C / stop service
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
