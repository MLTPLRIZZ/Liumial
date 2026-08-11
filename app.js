// Minimal client-side code to talk to the new server with verification code flow
let token = new URLSearchParams(window.location.search).get('token') || localStorage.getItem('liumial_token');
const urlEmail = new URLSearchParams(window.location.search).get('email');
const urlVerify = new URLSearchParams(window.location.search).get('verify');
let pendingEmail = null;
if (token) localStorage.setItem('liumial_token', token);

const btnGoogle = document.getElementById('btn-google');
btnGoogle.onclick = () => { window.location.href = '/auth/google'; };

const btnLogin = document.getElementById('btn-login');
const btnRegister = document.getElementById('btn-register');
const btnLogout = document.getElementById('btn-logout');
const emailEl = document.getElementById('email');
const passEl = document.getElementById('password');
const meBox = document.getElementById('me');
const loggedInBox = document.getElementById('logged-in');
const loggedOutBox = document.getElementById('logged-out');
const verifyBox = document.getElementById('verify-box');
const verifyEmailSpan = document.getElementById('verify-email');
const verifyCodeInput = document.getElementById('verify-code');
const btnVerify = document.getElementById('btn-verify');

async function api(path, opts={}){
  opts.headers = opts.headers || {};
  if (localStorage.getItem('liumial_token')) opts.headers['Authorization'] = 'Bearer ' + localStorage.getItem('liumial_token');
  opts.headers['Content-Type'] = 'application/json';
  const res = await fetch('/api'+path, opts);
  if (res.status === 401) { logout(); throw new Error('unauthorized'); }
  return res.json();
}

btnRegister.onclick = async () => {
  try {
    const payload = { username: (emailEl.value||'').split('@')[0], email: emailEl.value, password: passEl.value };
    const r = await fetch('/api/auth/register', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
    const j = await r.json();
    if (j.token) { localStorage.setItem('liumial_token', j.token); token = j.token; connectSocket(); showMe(); }
    if (j.email) {
      pendingEmail = j.email;
      showVerify(pendingEmail);
    }
    alert(j.message || JSON.stringify(j));
  } catch (e) { alert('error'); }
};

btnLogin.onclick = async () => {
  try {
    const r = await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: emailEl.value, password: passEl.value }), headers: { 'Content-Type': 'application/json' } });
    const j = await r.json();
    if (j.token) { localStorage.setItem('liumial_token', j.token); token = j.token; connectSocket(); showMe(); }
    else if (j.verified === false || j.message) {
      pendingEmail = j.email || emailEl.value;
      showVerify(pendingEmail);
      alert(j.message || 'Verification code sent');
    }
  } catch (e) { alert('login failed'); }
};

btnVerify.onclick = async () => {
  const code = verifyCodeInput.value.trim();
  if (!code || !pendingEmail) return alert('code and email required');
  try {
    const r = await fetch('/api/auth/verify', { method: 'POST', body: JSON.stringify({ email: pendingEmail, code }), headers: { 'Content-Type': 'application/json' } });
    const j = await r.json();
    if (j.token) { localStorage.setItem('liumial_token', j.token); token = j.token; connectSocket(); showMe(); hideVerify(); alert('Verified and logged in'); }
    else { alert(JSON.stringify(j)); }
  } catch (e) { alert('verify failed'); }
};

function showVerify(email) {
  verifyEmailSpan.innerText = email;
  verifyBox.style.display = 'block';
  loggedOutBox.style.display = 'none';
}
function hideVerify(){ verifyBox.style.display = 'none'; loggedOutBox.style.display = 'block'; }

btnLogout.onclick = () => { logout(); };

async function showMe(){
  try {
    const me = await api('/me');
    meBox.innerText = `@${me.username} (${me.email})`;
    loggedInBox.style.display = 'block'; loggedOutBox.style.display = 'none'; hideVerify();
  } catch (e) { console.error(e); }
}

function logout(){ localStorage.removeItem('liumial_token'); token = null; loggedInBox.style.display = 'none'; loggedOutBox.style.display = 'block'; }

// Socket
let socket;
function connectSocket(){
  if (!localStorage.getItem('liumial_token')) return;
  socket = io({ auth: { token: localStorage.getItem('liumial_token') } });
  socket.on('connect', () => console.log('socket connected'));
  socket.on('message', (m) => {
    addMessage(m);
  });
  socket.on('friend-request', (r) => alert('Friend request received'));
}

function addMessage(m){
  const el = document.createElement('div'); el.className = 'message';
  el.innerText = `${m.from_id}: ${m.content}`;
  document.getElementById('chat').appendChild(el);
}

document.getElementById('btn-send').onclick = async () => {
  const content = document.getElementById('msg').value;
  if (!content) return;
  try {
    const r = await api('/messages', { method: 'POST', body: JSON.stringify({ content }) });
    const j = await r;
    if (j.message) addMessage(j.message);
    document.getElementById('msg').value = '';
  } catch (e) { console.error(e); }
};

// If user was redirected from Google with email=...&verify=1, show verify box
if (urlEmail && urlVerify) { pendingEmail = urlEmail; showVerify(pendingEmail); }
// If token present, connect and fetch me
if (localStorage.getItem('liumial_token')) { connectSocket(); showMe(); }
