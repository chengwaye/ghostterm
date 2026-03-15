const WebSocket = require('ws');
const os = require('os');
const path = require('path');
const fs = require('fs');

let pty;
try {
  pty = require('node-pty');
} catch (e) {
  console.error('node-pty failed to load:', e.message);
  process.exit(1);
}

const RELAY_URL = process.env.RELAY_URL || 'ws://localhost:4000?role=companion';
const MAX_SESSIONS = 4;
const UPLOAD_DIR = path.join(os.homedir(), 'Desktop', 'claude-uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ==================== Terminal Sessions ====================
const sessions = new Map();
let nextSessionId = 1;
const OUTPUT_BUFFER_MAX = 500 * 1024;

function createSession() {
  const id = nextSessionId++;
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  const term = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: path.join(os.homedir(), 'Desktop'),
    env: (() => { const e = { ...process.env, TERM: 'xterm-256color' }; delete e.CLAUDECODE; delete e.CLAUDE_CODE; return e; })(),
  });

  const session = {
    id,
    term,
    outputBuffer: '',
    bufferSeq: 0,
    exited: false,
  };

  console.log(`Terminal ${id} spawned (PID: ${term.pid})`);

  term.onData((data) => {
    session.outputBuffer += data;
    session.bufferSeq += data.length;
    if (session.outputBuffer.length > OUTPUT_BUFFER_MAX) {
      session.outputBuffer = session.outputBuffer.slice(-OUTPUT_BUFFER_MAX);
    }
    // Send to relay → mobile
    sendToRelay({ type: 'output', data, seq: session.bufferSeq, id });
  });

  term.onExit(({ exitCode }) => {
    console.log(`Terminal ${id} exited (code: ${exitCode})`);
    session.exited = true;
    sessions.delete(id);
    sendToRelay({ type: 'exit', code: exitCode, id });
    sendToRelay({ type: 'sessions', list: getSessionList() });
  });

  sessions.set(id, session);
  return session;
}

function getSessionList() {
  return Array.from(sessions.values()).map(s => ({
    id: s.id,
    exited: s.exited,
  }));
}

// ==================== Relay Connection ====================
let relayWs = null;
let pairCode = null;
let reconnectTimer = null;

function connectToRelay() {
  console.log(`Connecting to relay: ${RELAY_URL}`);
  relayWs = new WebSocket(RELAY_URL);

  relayWs.on('open', () => {
    console.log('Connected to relay');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  relayWs.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    handleRelayMessage(msg);
  });

  relayWs.on('close', () => {
    console.log('Disconnected from relay, reconnecting in 3s...');
    relayWs = null;
    reconnectTimer = setTimeout(connectToRelay, 3000);
  });

  relayWs.on('error', (err) => {
    console.error('Relay error:', err.message);
  });
}

function sendToRelay(msg) {
  if (relayWs?.readyState === WebSocket.OPEN) {
    relayWs.send(JSON.stringify(msg));
  }
}

// ==================== Handle Messages from Mobile ====================
function handleRelayMessage(msg) {
  switch (msg.type) {
    case 'pair_code':
      pairCode = msg.code;
      console.log('');
      console.log('========================================');
      console.log(`  Pairing Code:  ${pairCode}`);
      console.log('  Enter this code on your phone');
      console.log('========================================');
      console.log('');
      break;

    case 'code_expired':
      console.log('Pairing code expired, reconnecting...');
      relayWs?.close();
      break;

    case 'mobile_connected':
      console.log('Mobile connected!');
      // Create first session if none exist
      if (sessions.size === 0) {
        createSession();
      }
      // Send session list + auto-attach to first
      sendToRelay({ type: 'sessions', list: getSessionList() });
      const first = sessions.values().next().value;
      if (first) {
        sendToRelay({ type: 'attached', id: first.id });
      }
      break;

    case 'mobile_disconnected':
      console.log('Mobile disconnected');
      break;

    case 'input':
      // Terminal input from mobile
      if (msg.sessionId) {
        const session = sessions.get(msg.sessionId);
        if (session && !session.exited) {
          session.term.write(msg.data);
        }
      }
      break;

    case 'resize':
      if (msg.sessionId) {
        const session = sessions.get(msg.sessionId);
        if (session && !session.exited) {
          try {
            session.term.resize(Math.max(msg.cols, 10), Math.max(msg.rows, 4));
          } catch {}
        }
      }
      break;

    case 'create-session':
      if (sessions.size < MAX_SESSIONS) {
        const session = createSession();
        sendToRelay({ type: 'sessions', list: getSessionList() });
        sendToRelay({ type: 'attached', id: session.id });
      } else {
        sendToRelay({ type: 'error_msg', message: `Max ${MAX_SESSIONS} sessions` });
      }
      break;

    case 'close-session':
      const s = sessions.get(msg.id);
      if (s && !s.exited) {
        s.term.kill();
      }
      break;

    case 'attach':
      const session = sessions.get(msg.id);
      if (session && !session.exited) {
        sendToRelay({ type: 'attached', id: msg.id });
      }
      break;

    case 'sync':
      const syncSession = sessions.get(msg.id);
      if (!syncSession || syncSession.exited) return;
      const bufStart = syncSession.bufferSeq - syncSession.outputBuffer.length;
      if (msg.clientSeq >= syncSession.bufferSeq) {
        sendToRelay({ type: 'delta', data: '', seq: syncSession.bufferSeq, id: msg.id });
      } else if (msg.clientSeq >= bufStart) {
        const offset = msg.clientSeq - bufStart;
        sendToRelay({ type: 'delta', data: syncSession.outputBuffer.slice(offset), seq: syncSession.bufferSeq, id: msg.id });
      } else {
        sendToRelay({ type: 'history', data: syncSession.outputBuffer, seq: syncSession.bufferSeq, id: msg.id });
      }
      break;

    case 'upload':
      // Base64 file upload from mobile
      try {
        const buf = Buffer.from(msg.data, 'base64');
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}${msg.ext || '.png'}`;
        const filePath = path.join(UPLOAD_DIR, filename);
        fs.writeFileSync(filePath, buf);
        sendToRelay({ type: 'upload_result', path: filePath, filename, size: buf.length });
        console.log(`File saved: ${filePath}`);
      } catch (err) {
        sendToRelay({ type: 'upload_error', message: err.message });
      }
      break;
  }
}

// ==================== Start ====================
console.log('');
console.log('=================================');
console.log('  Claude Remote Companion');
console.log('=================================');
console.log('');

connectToRelay();
