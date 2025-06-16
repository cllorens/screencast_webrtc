# WebRTC Screen Sharing via WebSocket Signaling

This project demonstrates how to share your screen from one browser to another using WebRTC, with a simple WebSocket signaling server.

It consists of:

- `sender.html`: Captures and sends your screen.
- `receiver.html`: Receives and displays the screen (fullscreen).
- `server.js`: A WebSocket signaling server that facilitates the exchange of WebRTC negotiation messages.

---

## 🔧 How It Works

1. The sender opens a WebSocket connection and identifies itself.
2. It captures the screen and creates an offer (SDP).
3. The receiver connects, responds with an answer.
4. ICE candidates are exchanged over the WebSocket connection.
5. Once connected, the receiver shows the shared screen in real time.

---

## 📦 Files Included

- `sender.html`
- `receiver.html`
- `server.js` (signaling server in Node.js)

---

## ▶️ Running the Project

### 1. Clone or download the project

Place the following files in a single directory:

- `sender.html`
- `receiver.html`
- `server.js`

### 2. Install dependencies

You’ll need Node.js installed. Then run:

```bash
npm install ws
```

### 3. Start the signaling server

```bash
node server.js
```

This starts a WebSocket server on `ws://localhost:8080`.

### 4. Open the sender

Open `sender.html` in a browser (Chrome or Firefox recommended), and allow screen sharing when prompted.

### 5. Open the receiver

Open `receiver.html` in another browser window, tab, or device on the same network.

---

## 🌐 Notes

- To test across devices, replace `localhost` in the WebSocket URL with your computer’s local IP address.
- Some browsers block `file://` WebRTC access — serve files using a local web server if needed (e.g. `npx serve .`).

---

## 👤 Credits

This project was developed by **Carlos Llorens**, with the **invaluable assistance of ChatGPT** by [OpenAI](https://openai.com).  
ChatGPT contributed ideas, code structure, debugging strategies, and helped shape the project from concept to completion.

---

## 📝 License

MIT License
