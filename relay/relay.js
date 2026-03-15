const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 4000;

// ==================== Pairing & Session Store ====================
const pairings = new Map();    // pairCode → { companionWs, mobileWs, createdAt }
const CODE_EXPIRY = 5 * 60 * 1000; // 5 minutes

function generatePairCode() {
  let code;
  do {
    code = crypto.randomInt(100000, 999999).toString();
  } while (pairings.has(code));
  return code;
}

// Clean expired codes every 30s
setInterval(() => {
  const now = Date.now();
  for (const [code, session] of pairings) {
    if (!session.mobileWs && now - session.createdAt > CODE_EXPIRY) {
      console.log(`Expired pairing code: ${code}`);
      if (session.companionWs?.readyState === 1) {
        session.companionWs.send(JSON.stringify({ type: 'code_expired' }));
        session.companionWs.close();
      }
      pairings.delete(code);
    }
  }
}, 30000);

// ==================== HTTP Server ====================
const server = http.createServer((req, res) => {
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      connections: pairings.size,
      uptime: process.uptime()
    }));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

// ==================== WebSocket Server ====================
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const role = url.searchParams.get('role'); // 'companion' or 'mobile'

  console.log(`New connection: role=${role}`);

  if (role === 'companion') {
    handleCompanion(ws);
  } else if (role === 'mobile') {
    handleMobile(ws);
  } else {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing role parameter' }));
    ws.close();
  }
});

// ==================== Companion (PC side) ====================
function handleCompanion(ws) {
  const code = generatePairCode();

  pairings.set(code, {
    companionWs: ws,
    mobileWs: null,
    createdAt: Date.now(),
  });

  // Send pairing code to companion
  ws.send(JSON.stringify({ type: 'pair_code', code }));
  console.log(`Companion connected, pair code: ${code}`);

  ws.on('message', (data) => {
    const session = findSessionByCompanion(ws);
    if (!session || !session.mobileWs) return;
    // Forward everything to mobile
    if (session.mobileWs.readyState === 1) {
      session.mobileWs.send(data);
    }
  });

  ws.on('close', () => {
    console.log(`Companion disconnected`);
    const [code, session] = findSessionEntryByCompanion(ws);
    if (session) {
      if (session.mobileWs?.readyState === 1) {
        session.mobileWs.send(JSON.stringify({ type: 'companion_disconnected' }));
      }
      pairings.delete(code);
    }
  });
}

// ==================== Mobile (Phone side) ====================
function handleMobile(ws) {
  let pairedCode = null;

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { msg = null; }

    // Pairing request
    if (msg && msg.type === 'pair' && msg.code) {
      const session = pairings.get(msg.code);
      if (!session) {
        ws.send(JSON.stringify({ type: 'pair_error', message: 'Invalid or expired code' }));
        return;
      }
      if (session.mobileWs) {
        ws.send(JSON.stringify({ type: 'pair_error', message: 'Code already used' }));
        return;
      }

      // Pair success
      session.mobileWs = ws;
      pairedCode = msg.code;
      ws.send(JSON.stringify({ type: 'paired' }));
      if (session.companionWs?.readyState === 1) {
        session.companionWs.send(JSON.stringify({ type: 'mobile_connected' }));
      }
      console.log(`Mobile paired with code: ${msg.code}`);
      return;
    }

    // Forward everything to companion
    if (pairedCode) {
      const session = pairings.get(pairedCode);
      if (session?.companionWs?.readyState === 1) {
        session.companionWs.send(data);
      }
    }
  });

  ws.on('close', () => {
    console.log(`Mobile disconnected`);
    if (pairedCode) {
      const session = pairings.get(pairedCode);
      if (session) {
        session.mobileWs = null;
        if (session.companionWs?.readyState === 1) {
          session.companionWs.send(JSON.stringify({ type: 'mobile_disconnected' }));
        }
      }
    }
  });
}

// ==================== Helpers ====================
function findSessionByCompanion(ws) {
  for (const session of pairings.values()) {
    if (session.companionWs === ws) return session;
  }
  return null;
}

function findSessionEntryByCompanion(ws) {
  for (const [code, session] of pairings) {
    if (session.companionWs === ws) return [code, session];
  }
  return [null, null];
}

// ==================== Start ====================
server.listen(PORT, () => {
  console.log('');
  console.log('=================================');
  console.log('  Claude Remote Relay Server');
  console.log('=================================');
  console.log(`  Port: ${PORT}`);
  console.log(`  ws://localhost:${PORT}?role=companion`);
  console.log(`  ws://localhost:${PORT}?role=mobile`);
  console.log('=================================');
  console.log('');
});
