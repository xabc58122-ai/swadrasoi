import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '../client');

const PORT = parseInt(process.env.PORT || '8443', 10);
const TOKEN_ALICE = process.env.TOKEN_ALICE || 'zk_auth_alice_98f4c1e2b5d7a8904321fedcba654321';
const TOKEN_BOB = process.env.TOKEN_BOB || 'zk_auth_bob_12a3b4c5d6e7f89012345678abcdef01';

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// 1. Minimal HTTP Server for Static Assets with Hardened Security Headers
const server = http.createServer((req, res) => {
  // Enforce security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' ws: wss:;");

  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  // Prevent directory traversal
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(CLIENT_DIR, safePath);

  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

// 2. Zero-Knowledge In-Memory WebSocket Relay
const wss = new WebSocketServer({ noServer: true });

// Strictly tracks only active sockets in memory (RAM only, ZERO disk persistence)
const activePeers = {
  alice: null,
  bob: null,
};

// Map token to identity
function authenticateToken(token) {
  if (token === TOKEN_ALICE) return 'alice';
  if (token === TOKEN_BOB) return 'bob';
  return null;
}

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const token = url.searchParams.get('token');

  const identity = authenticateToken(token);
  if (!identity) {
    console.warn(`[SECURITY ALERT] Unauthorized WebSocket connection attempt rejected. Remote IP: ${request.socket.remoteAddress}`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request, identity);
  });
});

wss.on('connection', (ws, req, identity) => {
  const peerIdentity = identity === 'alice' ? 'bob' : 'alice';

  // If already connected, gracefully replace previous socket
  if (activePeers[identity]) {
    try {
      activePeers[identity].terminate();
    } catch (_) {}
  }

  activePeers[identity] = ws;
  console.log(`[AUTH SUCCESS] Peer "${identity}" connected.`);

  // Inform connecting peer of their identity and current partner status
  const partnerOnline = activePeers[peerIdentity] && activePeers[peerIdentity].readyState === WebSocket.OPEN;
  ws.send(JSON.stringify({
    type: 'system:init',
    yourIdentity: identity,
    partnerOnline: partnerOnline,
  }));

  // Notify partner that peer joined
  if (partnerOnline) {
    activePeers[peerIdentity].send(JSON.stringify({
      type: 'system:partner_status',
      online: true,
    }));
  }

  // Pure blind in-memory forwarding
  ws.on('message', (data, isBinary) => {
    const partnerSocket = activePeers[peerIdentity];

    if (partnerSocket && partnerSocket.readyState === WebSocket.OPEN) {
      // Blindly forward the raw packet in memory without parsing or logging payload
      partnerSocket.send(data, { binary: isBinary });
    } else {
      // If partner is not online, notify sender that packet was undeliverable
      // (We do NOT store offline messages to disk to adhere to the strict zero-disk guarantee)
      ws.send(JSON.stringify({
        type: 'system:undelivered',
        reason: 'Partner offline. Server does not store offline messages to disk.',
      }));
    }
  });

  ws.on('close', () => {
    console.log(`[DISCONNECT] Peer "${identity}" disconnected.`);
    if (activePeers[identity] === ws) {
      activePeers[identity] = null;
    }

    const partnerSocket = activePeers[peerIdentity];
    if (partnerSocket && partnerSocket.readyState === WebSocket.OPEN) {
      partnerSocket.send(JSON.stringify({
        type: 'system:partner_status',
        online: false,
      }));
    }
  });

  ws.on('error', (err) => {
    console.error(`[SOCKET ERROR] ${identity}:`, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  ZERO-KNOWLEDGE RELAY RUNNING ON PORT ${PORT}`);
  console.log(`  Zero-Disk Persistence: ACTIVE`);
  console.log(`  Authorized Identities: Alice & Bob`);
  console.log(`=======================================================`);
});
