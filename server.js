const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

let pty;
try {
  pty = require('node-pty');
} catch (e) {
  console.error('node-pty failed to load:', e.message);
  console.error('Run: npm install --global windows-build-tools');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 10000,
  pingTimeout: 30000,
});

const PORT = process.env.PORT || 3777;
const UPLOAD_DIR = path.join(os.homedir(), 'Desktop', 'claude-uploads');
const ACCESS_CODE = process.env.ACCESS_CODE || '';
const MAX_SESSIONS = 4;

// Ensure upload dir
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// File upload config
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function checkAuth(req, res, next) {
  if (!ACCESS_CODE) return next();
  const code = req.headers['x-access-code'] || req.query.code;
  if (code === ACCESS_CODE) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Upload endpoint
app.post('/upload', checkAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const filePath = req.file.path.replace(/\\/g, '/');
  const windowsPath = req.file.path;
  res.json({
    path: windowsPath,
    unixPath: filePath,
    filename: req.file.filename,
    size: req.file.size
  });
});

// List uploads
app.get('/uploads', checkAuth, (_req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR)
      .map(f => ({
        name: f,
        path: path.join(UPLOAD_DIR, f).replace(/\\/g, '\\'),
        time: fs.statSync(path.join(UPLOAD_DIR, f)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 20);
    res.json(files);
  } catch {
    res.json([]);
  }
});

// ==================== Multi-Terminal Sessions ====================
const sessions = new Map(); // id → { term, outputBuffer, bufferSeq, exited }
let nextSessionId = 1;

const OUTPUT_BUFFER_MAX = 500 * 1024;

function createSession(id) {
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
    sockets: new Set(), // All clients watching this session
    exited: false,
  };

  console.log(`Terminal ${id} spawned (PID: ${term.pid})`);

  term.onData((data) => {
    session.outputBuffer += data;
    session.bufferSeq += data.length;
    if (session.outputBuffer.length > OUTPUT_BUFFER_MAX) {
      session.outputBuffer = session.outputBuffer.slice(-OUTPUT_BUFFER_MAX);
    }
    // Broadcast to all clients watching this session
    for (const s of session.sockets) {
      s.emit('output', data, session.bufferSeq, id);
    }
  });

  term.onExit(({ exitCode }) => {
    console.log(`Terminal ${id} exited (code: ${exitCode})`);
    session.exited = true;
    for (const s of session.sockets) {
      s.emit('exit', exitCode, id);
    }
    sessions.delete(id);
    // Notify all clients of updated session list
    io.emit('sessions', getSessionList());
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

// ==================== Socket.IO ====================
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Auth check
  if (ACCESS_CODE && socket.handshake.auth?.code !== ACCESS_CODE) {
    socket.emit('auth_error', 'Invalid access code');
    socket.disconnect();
    return;
  }

  // Create default session if none exist
  if (sessions.size === 0) {
    createSession(nextSessionId++);
  }

  // Send session list
  socket.emit('sessions', getSessionList());

  // Track which session this client is attached to
  let currentSession = null;

  // Attach to a session
  function attachToSession(id) {
    const session = sessions.get(id);
    if (!session || session.exited) return false;

    // Detach from current
    if (currentSession) {
      currentSession.sockets.delete(socket);
    }

    currentSession = session;
    session.sockets.add(socket);
    socket.emit('attached', id);
    return true;
  }

  // Auto-attach to first session
  const firstSession = sessions.values().next().value;
  if (firstSession) {
    attachToSession(firstSession.id);
  }

  // Client requests to switch session
  socket.on('attach', (id) => {
    if (attachToSession(id)) {
      console.log(`Client ${socket.id} attached to terminal ${id}`);
    }
  });

  // Client requests to create new session
  socket.on('create-session', () => {
    if (sessions.size >= MAX_SESSIONS) {
      socket.emit('error_msg', `Max ${MAX_SESSIONS} sessions`);
      return;
    }
    const session = createSession(nextSessionId++);
    io.emit('sessions', getSessionList());
    attachToSession(session.id);
    console.log(`Client ${socket.id} created terminal ${session.id}`);
  });

  // Client requests to close a session
  socket.on('close-session', (id) => {
    const session = sessions.get(id);
    if (!session || session.exited) return;
    console.log(`Closing terminal ${id}`);
    session.term.kill();
  });

  // Delta sync for a specific session
  socket.on('sync', (clientSeq, id) => {
    // Support old format (no id) for backward compatibility
    const sessionId = id || (currentSession && currentSession.id);
    const session = sessions.get(sessionId);
    if (!session || session.exited) return;

    const bufStart = session.bufferSeq - session.outputBuffer.length;
    if (clientSeq >= session.bufferSeq) {
      socket.emit('delta', '', session.bufferSeq, sessionId);
    } else if (clientSeq >= bufStart) {
      const offset = clientSeq - bufStart;
      socket.emit('delta', session.outputBuffer.slice(offset), session.bufferSeq, sessionId);
    } else {
      socket.emit('history', session.outputBuffer, session.bufferSeq, sessionId);
    }
  });

  socket.on('input', (data) => {
    if (currentSession && currentSession.term && !currentSession.exited) {
      currentSession.term.write(data);
    }
  });

  socket.on('resize', ({ cols, rows }) => {
    try {
      if (currentSession && currentSession.term && !currentSession.exited) {
        currentSession.term.resize(Math.max(cols, 10), Math.max(rows, 4));
      }
    } catch (e) {
      // ignore resize errors
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (currentSession) {
      currentSession.sockets.delete(socket);
    }
  });
});

// Find Tailscale IP
function getTailscaleIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && iface.address.startsWith('100.')) {
        return iface.address;
      }
    }
  }
  return null;
}

// Start server
const TAILSCALE_IP = getTailscaleIP();
const BIND_HOST = TAILSCALE_IP || '127.0.0.1';

server.listen(PORT, BIND_HOST, () => {
  const url = `http://${BIND_HOST}:${PORT}`;

  console.log('');
  console.log('=================================');
  console.log('  Claude Remote Control');
  console.log('=================================');
  console.log(`  Local:  http://localhost:${PORT}`);
  console.log(`  Mobile: ${url}`);
  if (ACCESS_CODE) {
    console.log(`  Code:   ${ACCESS_CODE}`);
  }
  console.log('=================================');
  console.log('');

  try {
    const qr = require('qrcode-terminal');
    qr.generate(url, { small: true }, (code) => {
      console.log('Scan with your phone:');
      console.log(code);
    });
  } catch {
    console.log(`Open on phone: ${url}`);
  }
});
