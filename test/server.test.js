// Prueba de server.js: ficheros servidos + señalización WSS. Uso: npm test
// Arranca server.js en 8443/8080 con NO_KIOSK=1 (no toca Chrome). Para probar el
// certificado de otro PC: CERT_KEY=D214\privateKey.pem CERT_PEM=D214\Cert_bundle.pem
const path = require("path");
const https = require("https");
const http = require("http");
const { spawn } = require("child_process");
const proj = process.argv[2] || path.join(__dirname, "..");
const WebSocket = require(path.join(proj, "node_modules", "ws"));

const TOKEN = "testtoken123";
const HTTPS_PORT = 8443, HTTP_PORT = 8080;
let fails = 0;
const ok = (cond, name) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(p, port = HTTPS_PORT, mod = https) {
  return new Promise((resolve) => {
    const req = mod.request({ host: "127.0.0.1", port, path: p, method: "GET", rejectUnauthorized: false }, (res) => {
      res.resume(); res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location }));
    });
    req.on("error", (e) => resolve({ status: "ERR " + e.message }));
    req.end();
  });
}

function client() {
  const ws = new WebSocket(`wss://127.0.0.1:${HTTPS_PORT}`, { rejectUnauthorized: false });
  ws.msgs = [];
  ws.on("message", (m) => ws.msgs.push(JSON.parse(m.toString())));
  ws.closed = false;
  ws.on("close", () => (ws.closed = true));
  return new Promise((r) => ws.on("open", () => r(ws)));
}
const has = (ws, pred) => ws.msgs.some(pred);

(async () => {
  const srv = spawn(process.execPath, ["server.js"], {
    cwd: proj,
    env: { ...process.env, NO_KIOSK: "1", HTTPS_PORT, HTTP_PORT, RECEIVER_TOKEN: TOKEN },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  srv.stdout.on("data", (d) => (log += d));
  srv.stderr.on("data", (d) => (log += d));
  await sleep(1500);

  try {
    // --- Ficheros
    for (const p of ["/", "/index.html", "/receiver.html", "/vendor/qrcode.min.js", "/receiver.html?token=x"])
      ok((await get(p)).status === 200, `200 ${p}`);
    for (const p of ["/cdavid/privateKey.pem", "/radio7/privateKey.pem", "/D214/pass.txt", "/D214/privateKey.pem",
                     "/server.js", "/package.json", "/start.cmd", "/../server.js", "/..%2fserver.js",
                     "/test/server.test.js", "/node_modules/ws/package.json"])
      ok((await get(p)).status === 404, `404 ${p}`);
    const r = await get("/receiver.html", HTTP_PORT, http);
    ok(r.status === 301 && r.location === `https://127.0.0.1:${HTTPS_PORT}/receiver.html`, `HTTP redirect -> ${r.location}`);

    // --- Receptor con token malo
    const bad = await client();
    bad.send(JSON.stringify({ type: "receiver", token: "nope" }));
    await sleep(300);
    ok(has(bad, (m) => m.type === "error") && bad.closed, "receiver with bad token rejected");

    // --- Receptor bueno + emisor A
    const rx = await client();
    rx.send(JSON.stringify({ type: "receiver", token: TOKEN }));
    const a = await client();
    await sleep(200);
    a.send(JSON.stringify({ offer: { type: "offer", sdp: "x" }, sid: "s0" }));
    await sleep(200);
    ok(!has(rx, (m) => m.offer), "unregistered client cannot send offers to the receiver");

    a.send(JSON.stringify({ type: "sender" }));
    await sleep(200);
    ok(has(a, (m) => m.type === "registered") && has(a, (m) => m.type === "receiver-ready"), "sender A registered + receiver-ready");

    a.send(JSON.stringify({ offer: { type: "offer", sdp: "x" }, sid: "s1" }));
    await sleep(200);
    ok(has(rx, (m) => m.offer && m.sid === "s1"), "offer A -> receiver");
    rx.send(JSON.stringify({ answer: { type: "answer", sdp: "y" }, sid: "s1" }));
    rx.send(JSON.stringify({ type: "request-offer" }));
    await sleep(200);
    ok(has(a, (m) => m.answer && m.sid === "s1"), "answer receiver -> A");
    ok(has(a, (m) => m.type === "request-offer"), "request-offer receiver -> A");

    // --- Emisor B toma el relevo
    const b = await client();
    b.send(JSON.stringify({ type: "sender" }));
    await sleep(200);
    ok(has(a, (m) => m.type === "kicked"), "A is told it was replaced");
    ok(has(b, (m) => m.type === "receiver-ready"), "B registered + receiver-ready");
    rx.msgs = [];
    a.send(JSON.stringify({ type: "stopped" }));
    await sleep(200);
    ok(rx.msgs.length === 0, "old sender A can no longer reach the receiver");

    b.send(JSON.stringify({ type: "stopped" }));
    await sleep(200);
    ok(has(rx, (m) => m.type === "stopped"), "stopped B -> receiver");

    b.close();
    await sleep(300);
    ok(has(rx, (m) => m.type === "peer-left"), "receiver gets peer-left when B disconnects");

    // --- Receptor se reconecta con un emisor activo
    const c = await client();
    c.send(JSON.stringify({ type: "sender" }));
    await sleep(200);
    rx.close();
    await sleep(300);
    ok(has(c, (m) => m.type === "peer-left"), "sender gets peer-left when receiver disconnects");
    c.msgs = [];
    const rx2 = await client();
    rx2.send(JSON.stringify({ type: "receiver", token: TOKEN }));
    await sleep(200);
    ok(has(c, (m) => m.type === "receiver-ready"), "sender gets receiver-ready when the projector comes back");

    [bad, a, c, rx2].forEach((w) => w.terminate());
  } finally {
    srv.kill();
    await sleep(300);
    console.log("\n--- server log ---\n" + log);
    console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
    process.exit(fails ? 1 : 0);
  }
})();
