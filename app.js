// Minimal client-side code to talk to the new server
let token = new URLSearchParams(window.location.search).get('token') || localStorage.getItem('liumial_token');
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
    const r = await fetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ username: (emailEl.value||'').split('@')[0], email: emailEl.value, password: passEl.value }), headers: { 'Content-Type': 'application/json' } });
    const j = await r.json();
    if (j.token) { localStorage.setItem('liumial_token', j.token); token = j.token; connectSocket(); }
    alert(j.message || JSON.stringify(j));
  } catch (e) { alert('error'); }
};

btnLogin.onclick = async () => {
  try {
    const r = await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: emailEl.value, password: passEl.value }), headers: { 'Content-Type': 'application/json' } });
    const j = await r.json();
    if (j.token) { localStorage.setItem('liumial_token', j.token); token = j.token; connectSocket(); }
    else if (j.token === undefined && j.verified !== undefined) { // fallback
      // request didn't return token, but server may have responded earlier
      if (j.verified) {
        alert('Logged in');
      } else {
        alert('Verification email sent; please check your inbox.');
      }
    }
    if (j.token) showMe();
  } catch (e) { alert('login failed'); }
};

btnLogout.onclick = () => { logout(); };

async function showMe(){
  try {
    const me = await api('/me');
    meBox.innerText = `@${me.username} (${me.email})`;
    loggedInBox.style.display = 'block'; loggedOutBox.style.display = 'none';
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

// If token present, connect and fetch me
if (localStorage.getItem('liumial_token')) { connectSocket(); showMe(); }
