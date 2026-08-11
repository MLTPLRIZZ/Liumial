require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Server } = require('socket.io');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const db = new sqlite3.Database(DB_PATH);

// Init DB schema (simple)
const initSql = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  verified INTEGER DEFAULT 0,
  verification_token TEXT,
  avatar TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, friend_id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(friend_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(from_id) REFERENCES users(id),
  FOREIGN KEY(to_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  is_direct INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS channel_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  FOREIGN KEY(channel_id) REFERENCES channels(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER,
  from_id INTEGER NOT NULL,
  to_id INTEGER,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(channel_id) REFERENCES channels(id),
  FOREIGN KEY(from_id) REFERENCES users(id),
  FOREIGN KEY(to_id) REFERENCES users(id)
);
`;

db.exec(initSql, (err) => {
  if (err) console.error('DB init error', err);
  else console.log('Database initialized at', DB_PATH);
});

// Nodemailer transporter
function createTransporter() {
  const provider = process.env.MAIL_PROVIDER || 'smtp';
  if (provider === 'gmail_smtp') {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  // default: generic SMTP
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: Number(process.env.SMTP_PORT) || 1025,
    secure: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
}
const transporter = createTransporter();

function sendVerificationEmail(email, code) {
  const mail = {
    from: process.env.EMAIL_FROM || 'no-reply@example.com',
    to: email,
    subject: 'Liumial verification code',
    text: `Your Liumial verification code is: ${code}`,
    html: `<p>Your Liumial verification code is: <strong>${code}</strong></p>`
  };
  return transporter.sendMail(mail);
}

// JWT helpers
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// Helper to generate 6-digit code
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Passport Google
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/callback`
}, (accessToken, refreshToken, profile, cb) => {
  // find or create user
  const email = profile.emails && profile.emails[0] && profile.emails[0].value;
  db.get('SELECT * FROM users WHERE google_id = ? OR email = ?', [profile.id, email], (err, row) => {
    if (err) return cb(err);
    if (row) return cb(null, row);
    const code = generateCode();
    db.run('INSERT INTO users (username, email, google_id, verified, verification_token) VALUES (?,?,?,?,?)', [profile.displayName || ('g_' + profile.id), email, profile.id, 0, code], function (err) {
      if (err) return cb(err);
      db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err2, newUser) => cb(err2, newUser));
    });
  });
}
));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
  const user = req.user;
  if (!user.verified) {
    const code = user.verification_token || generateCode();
    db.run('UPDATE users SET verification_token = ? WHERE id = ?', [code, user.id]);
    sendVerificationEmail(user.email, code).catch(e => console.error('sendmail', e));
    const redirect = `${process.env.BASE_URL || 'http://localhost:3000'}/?email=${encodeURIComponent(user.email)}&verify=1`;
    return res.redirect(redirect);
  }
  const token = signToken({ id: user.id, username: user.username });
  const redirect = `${process.env.BASE_URL || 'http://localhost:3000'}/?token=${token}`;
  res.redirect(redirect);
});

// Auth endpoints
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'username,email,password required' });
  const password_hash = await bcrypt.hash(password, 10);
  const code = generateCode();
  db.run('INSERT INTO users (username, email, password_hash, verification_token) VALUES (?,?,?,?)', [username, email, password_hash, code], function (err) {
    if (err) return res.status(400).json({ error: 'user exists or invalid' });
    // send verification email
    sendVerificationEmail(email, code).catch(e => console.error('sendmail', e));
    res.json({ ok: true, message: 'registered; verification code sent', email });
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email,password required' });
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'db error' });
    if (!user) return res.status(400).json({ error: 'invalid' });
    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) return res.status(400).json({ error: 'invalid' });
    // if not verified, send verification code and do not return token
    if (!user.verified) {
      const code = user.verification_token || generateCode();
      db.run('UPDATE users SET verification_token = ? WHERE id = ?', [code, user.id]);
      sendVerificationEmail(user.email, code).catch(e => console.error('sendmail', e));
      return res.json({ verified: false, message: 'verification code sent', email: user.email });
    }
    const t = signToken({ id: user.id, username: user.username });
    res.json({ token: t, verified: true });
  });
});

// New verification endpoint (POST with email + code)
app.post('/api/auth/verify', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'email and code required' });
  db.get('SELECT * FROM users WHERE email = ? AND verification_token = ?', [email, code], (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'invalid code or email' });
    db.run('UPDATE users SET verified = 1, verification_token = NULL WHERE id = ?', [user.id], (e) => {
      if (e) return res.status(500).json({ error: 'DB error' });
      const t = signToken({ id: user.id, username: user.username });
      res.json({ token: t, message: 'verified' });
    });
  });
});

app.get('/api/auth/verify/:token', (req, res) => {
  const { token } = req.params;
  db.get('SELECT * FROM users WHERE verification_token = ?', [token], (err, user) => {
    if (err || !user) return res.status(400).send('Invalid token/code');
    db.run('UPDATE users SET verified = 1, verification_token = NULL WHERE id = ?', [user.id], (e) => {
      if (e) return res.status(500).send('DB error');
      res.send('Verified — you can now return to the app and log in.');
    });
  });
});

// Middleware to authenticate JWT
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing token' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'bad token' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; next();
  } catch (e) {
    res.status(401).json({ error: 'invalid token' });
  }
}

// Basic endpoints used by client
app.get('/api/me', authMiddleware, (req, res) => {
  db.get('SELECT id, username, email, verified, avatar FROM users WHERE id = ?', [req.user.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  });
});

// Friend requests
app.post('/api/friend-request', authMiddleware, (req, res) => {
  const { to_email } = req.body;
  if (!to_email) return res.status(400).json({ error: 'to_email required' });
  db.get('SELECT id FROM users WHERE email = ?', [to_email], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'user not found' });
    db.run('INSERT INTO friend_requests (from_id,to_id) VALUES (?,?)', [req.user.id, row.id], function (e) {
      if (e) return res.status(400).json({ error: 'request exists or error' });
      // notify recipient if online
      const reqObj = { id: this.lastID, from_id: req.user.id, to_id: row.id, status: 'pending' };
      if (online[row.id]) io.to(online[row.id]).emit('friend-request', reqObj);
      res.json({ ok: true });
    });
  });
});

app.post('/api/friend-request/respond', authMiddleware, (req, res) => {
  const { request_id, accept } = req.body;
  db.get('SELECT * FROM friend_requests WHERE id = ? AND to_id = ?', [request_id, req.user.id], (err, fr) => {
    if (err || !fr) return res.status(404).json({ error: 'not found' });
    const status = accept ? 'accepted' : 'rejected';
    db.run('UPDATE friend_requests SET status = ? WHERE id = ?', [status, request_id], (e) => {
      if (e) return res.status(500).json({ error: 'db' });
      if (accept) {
        db.run('INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?,?),(?,?)', [req.user.id, fr.from_id, fr.from_id, req.user.id]);
      }
      // notify original requester
      if (online[fr.from_id]) io.to(online[fr.from_id]).emit('friend-request-updated', { id: fr.id, status });
      res.json({ ok: true });
    });
  });
});

// Messages: send DM or channel
app.post('/api/messages', authMiddleware, (req, res) => {
  const { to_id, channel_id, content } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  db.run('INSERT INTO messages (channel_id, from_id, to_id, content) VALUES (?,?,?,?)', [channel_id || null, req.user.id, to_id || null, content], function (err) {
    if (err) return res.status(500).json({ error: 'db' });
    const message = { id: this.lastID, channel_id: channel_id || null, from_id: req.user.id, to_id: to_id || null, content, created_at: new Date() };
    // deliver via socket
    if (to_id && online[to_id]) io.to(online[to_id]).emit('message', message);
    if (channel_id) io.to(`channel_${channel_id}`).emit('message', message);
    res.json({ ok: true, message });
  });
});

// Serve static client from repo root (if present)
app.use(express.static(path.join(__dirname, '..')));

// Socket.io auth and presence
const online = {}; // userId -> socketId
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next(new Error('missing token'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.user = payload; next();
  } catch (e) { next(new Error('invalid token')); }
});

io.on('connection', (socket) => {
  const uid = socket.user.id;
  online[uid] = socket.id;
  socket.join(`user_${uid}`);
  console.log('socket connect', uid);
  socket.on('join-channel', (channelId) => {
    socket.join(`channel_${channelId}`);
  });
  socket.on('leave-channel', (channelId) => {
    socket.leave(`channel_${channelId}`);
  });
  socket.on('disconnect', () => {
    delete online[uid];
    console.log('socket disconnect', uid);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server started on', PORT));
