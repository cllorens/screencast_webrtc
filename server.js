const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// Servidor HTTP en puerto 80 para servir archivos estáticos
const httpServer = http.createServer((req, res) => {
  console.log(`[HTTP] Petición: ${req.method} ${req.url}`);

  let filePath = '.' + req.url;
  if (filePath === './') filePath = './index.html';

  const extname = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      console.error(`[HTTP] Archivo no encontrado: ${filePath}`);
      res.writeHead(404);
      res.end('404 - Archivo no encontrado');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

httpServer.listen(80, () => {
  console.log('Servidor HTTP escuchando en puerto 80');
});

// Servidor WebSocket en puerto 8080
const wss = new WebSocket.Server({ port: 8080 });

let sender = null;
let receiver = null;

wss.on('connection', (ws) => {
  console.log('🔌 Cliente WebSocket conectado');

  ws.on('message', (message) => {
    console.log('📩 Mensaje recibido:', message);

    let data;
    try {
      // Convertir message a string si es buffer para parsear JSON
      const msgStr = (typeof message === 'string') ? message : message.toString();
      data = JSON.parse(msgStr);
    } catch (e) {
      console.error('❌ JSON inválido recibido:', e);
      return;
    }

    if (data.type === 'sender') {
      sender = ws;
      console.log('📤 Cliente registrado como sender');
    } else if (data.type === 'receiver') {
      receiver = ws;
      console.log('📥 Cliente registrado como receiver');
    } else {
      if (ws === sender && receiver) {
        const msgStr = (typeof message === 'string') ? message : message.toString();
        console.log('➡️ Enviando mensaje del sender al receiver', typeof msgStr);
        receiver.send(msgStr);
      } else if (ws === receiver && sender) {
        const msgStr = (typeof message === 'string') ? message : message.toString();
        console.log('⬅️ Enviando mensaje del receiver al sender', typeof msgStr);
        sender.send(msgStr);
      } else {
        console.log('⚠️ No hay destinatario válido para este mensaje');
      }
    }
  });

  ws.on('close', () => {
    console.log('❌ Cliente WebSocket desconectado');
    if (ws === sender) {
      sender = null;
      console.log('🔴 Sender desconectado');
    } else if (ws === receiver) {
      receiver = null;
      console.log('🔴 Receiver desconectado');
    }
  });

  ws.on('error', (error) => {
    console.error('❌ Error en WebSocket:', error);
  });
});

console.log('Servidor WebSocket escuchando en puerto 8080');
