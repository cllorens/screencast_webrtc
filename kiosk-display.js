// Elige en qué pantalla se abre el kiosko.
// Chrome no permite elegir monitor, pero --kiosk se pone a pantalla completa en el monitor
// donde cae --window-position, así que pasamos un punto en el centro de la pantalla elegida.
//
// KIOSK_DISPLAY (opcional):
//   (vacío) / auto  → con 2+ pantallas, la primera que NO es la principal; si no, la principal
//   primary         → siempre la principal
//   1, 2, 3...      → la N-ésima contando de izquierda a derecha (y de arriba abajo)
const { execFileSync } = require("child_process");

// Coordenadas físicas (proceso DPI-aware). Usamos el centro de la pantalla para que el punto
// caiga dentro tanto si Chrome lo interpreta en píxeles físicos como en DIP (escalado ≠ 100 %).
const PS_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class DpiAware{[DllImport(\"user32.dll\")]public static extern bool SetProcessDPIAware();}'",
  "[DpiAware]::SetProcessDPIAware() | Out-Null",
  "Add-Type -AssemblyName System.Windows.Forms",
  "@([System.Windows.Forms.Screen]::AllScreens | ForEach-Object { [pscustomobject]@{name=$_.DeviceName; primary=$_.Primary; x=$_.Bounds.X; y=$_.Bounds.Y; w=$_.Bounds.Width; h=$_.Bounds.Height} }) | ConvertTo-Json -Compress",
].join("; ");

function listDisplays() {
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT], {
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
  });
  const parsed = JSON.parse(out.trim());
  const list = Array.isArray(parsed) ? parsed : [parsed]; // con una sola pantalla no viene como array
  return list.sort((a, b) => a.x - b.x || a.y - b.y);
}

function pickDisplay(displays, choice = (process.env.KIOSK_DISPLAY || "auto").trim().toLowerCase()) {
  const primary = displays.find((d) => d.primary) || displays[0];
  if (choice === "primary") return primary;
  if (/^\d+$/.test(choice)) {
    const d = displays[Number(choice) - 1];
    if (d) return d;
    console.warn(`⚠️ KIOSK_DISPLAY=${choice} but only ${displays.length} display(s); using auto`);
  }
  return displays.find((d) => !d.primary) || primary;
}

// Devuelve los argumentos de Chrome para abrir en la pantalla elegida ([] si no hace falta)
function kioskDisplayArgs() {
  let displays;
  try {
    displays = listDisplays();
  } catch (e) {
    console.warn("⚠️ Could not list displays, kiosk will open on the default one:", e.message.split("\n")[0]);
    return [];
  }
  const d = pickDisplay(displays);
  console.log(`🖥️ Displays: ${displays.map((s) => `${s.w}x${s.h}@${s.x},${s.y}${s.primary ? " (primary)" : ""}`).join(" | ")}`);
  console.log(`🖥️ Kiosk on: ${d.w}x${d.h}@${d.x},${d.y}${d.primary ? " (primary)" : ""}`);
  // Ventana pequeña centrada en esa pantalla: Chrome la asigna al monitor con el que más
  // se solapa y --kiosk la pone a pantalla completa en él.
  const W = 800, H = 600;
  const x = d.x + Math.floor((d.w - W) / 2);
  const y = d.y + Math.floor((d.h - H) / 2);
  return [`--window-position=${x},${y}`, `--window-size=${W},${H}`];
}

module.exports = { listDisplays, pickDisplay, kioskDisplayArgs };

if (require.main === module) kioskDisplayArgs().forEach((a) => console.log(a));
