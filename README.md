# WebRTC Screen Sharing (HTTPS + Kiosk Receiver)

This project provides a **minimal, self‑hosted WebRTC screen sharing solution** using:

- WebRTC for media transport  
- Secure WebSocket (WSS) for signaling  
- HTTPS with certificates  
- Automatic Chrome **kiosk mode** for the receiver display

It is designed to work reliably **locally and across devices**, including remote senders, as long as HTTPS is used.

---

## 📦 Project Overview

The system consists of:

- **Sender (`index.html`)**  
  Captures and shares the screen using WebRTC.

- **Receiver (`receiver.html`)**  
  Receives and displays the shared screen fullscreen.  
  This page is automatically opened in **Chrome kiosk mode** by the server.

- **Server (`server.js`)**  
  - Serves files over **HTTPS (port 443)**  
  - Redirects HTTP → HTTPS (port 80)  
  - Hosts a **secure WebSocket signaling server (WSS)**  
  - Automatically launches Chrome in kiosk mode  
  - Exits cleanly when Chrome is closed (Alt+F4)

---

## 🔧 How It Works

1. `server.js` starts:
   - HTTPS server on **443**
   - HTTP redirect on **80**
   - WSS signaling on **443**
   - Launches Chrome in **kiosk mode** pointing to the receiver page

2. The **receiver**:
   - Connects to the WSS server
   - Waits for a sender
   - Displays the incoming screen stream fullscreen

3. The **sender**:
   - Opens `https://<server-host>/`
   - Captures the screen using `getDisplayMedia`
   - Negotiates WebRTC via WSS

4. Once ICE negotiation succeeds:
   - Media flows **peer‑to‑peer**
   - The server is no longer in the media path

---

## 🔐 HTTPS & Certificates (Required)

WebRTC **requires HTTPS** when used across devices.

This project uses **real or self‑signed certificates**.

### Required certificate files

Place these next to `server.js`:

```
certificado.pem   # public certificate (PEM)
certificado.key   # private key
```

They are loaded directly by Node.js.

Certificates can be:
- Self‑signed (for testing)
- Issued by a CA (HARICA, Let’s Encrypt, etc.)

---

## ▶️ Running the Project

### 1. Install dependencies

```bash
npm install ws
```

### 2. Start the server

```bash
node server.js
```

This will:
- Start HTTPS and WSS
- Launch Chrome in kiosk mode
- Exit Node.js automatically when Chrome is closed

---

## 🌐 Accessing the Pages

### Sender (screen capture)

Open in any modern browser:

```
https://<server-host>/
```

Examples:
- Desktop Chrome / Chromium
- Linux Chromium
- Android Chrome (screen capture depends on Android version)

### Receiver

Automatically opened by the server in **Chrome kiosk mode**:

```
https://<server-host>/receiver.html
```

---

## 🧭 Chrome Kiosk Mode

When `server.js` starts:

- Existing Chrome processes are closed
- Chrome is launched with:
  - `--kiosk`
  - `--start-fullscreen`
  - Dedicated user profile
- When Chrome is closed (**Alt+F4**):
  - `server.js` exits automatically

This makes the system suitable for:
- Permanent displays
- Projectors
- Digital signage
- Demo setups

---

## 📱 Android Notes

- WebRTC works in Android Chrome
- Screen capture availability depends on Android version and permissions
- HTTPS is mandatory
- Receiver kiosk mode is intended for desktop Chrome

---

## 👤 Credits

This project was developed by the author with the **invaluable assistance of ChatGPT (OpenAI)**.

ChatGPT contributed significantly to:
- WebRTC signaling design
- ICE / WSS debugging
- HTTPS and certificate integration
- Chrome kiosk automation
- Cross‑platform troubleshooting
- Code refinement and documentation

---

## 📝 License

MIT License

