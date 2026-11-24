// Prueba de la elección de pantalla del kiosko (kiosk-display.js). Uso: npm test
const { pickDisplay, listDisplays } = require("../kiosk-display");

let fails = 0;
const ok = (cond, name) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fails++; };

const P = { name: "A", primary: true, x: 0, y: 0, w: 1920, h: 1080 };
const R = { name: "B", primary: false, x: 1920, y: 0, w: 1280, h: 720 };   // proyector a la derecha
const L = { name: "C", primary: false, x: -1024, y: 0, w: 1024, h: 768 };  // monitor a la izquierda
const byX = (list) => [...list].sort((a, b) => a.x - b.x || a.y - b.y);

ok(pickDisplay([P], "auto") === P, "1 display → primary");
ok(pickDisplay(byX([P, R]), "auto") === R, "2 displays → secondary (right)");
ok(pickDisplay(byX([L, P]), "auto") === L, "2 displays → secondary (left)");
ok(pickDisplay(byX([P, R]), "primary") === P, "KIOSK_DISPLAY=primary");
ok(pickDisplay(byX([L, P, R]), "3") === R, "KIOSK_DISPLAY=3 → third from the left");
ok(pickDisplay(byX([L, P, R]), "1") === L, "KIOSK_DISPLAY=1 → leftmost");
ok(pickDisplay(byX([P, R]), "5") === R, "KIOSK_DISPLAY out of range → auto");

const real = listDisplays();
ok(Array.isArray(real) && real.length >= 1 && real.some((d) => d.primary), `real displays detected: ${real.length}`);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
