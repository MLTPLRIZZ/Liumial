// app.js — client chat app refactored to support Supabase realtime via server-sync.js
(function(){
  const DB_KEY = 'liumial_db_v1';
  const defaultState = ()=>({
    users:[], servers:[], messages:[], quests:[], createdAt:Date.now()
  });

  function loadDB(){
    try{const raw=localStorage.getItem(DB_KEY); if(!raw) return defaultState(); return JSON.parse(raw);}catch(e){console.error('DB load',e);return defaultState();}
  }
  function saveDB(db){ try{localStorage.setItem(DB_KEY,JSON.stringify(db))}catch(e){console.warn(e)} }
  const db = loadDB();

  // simple utils
  const uid = (p='id') => p+Math.random().toString(36).slice(2,9);
  const now = ()=>Date.now();
  const escapeHtml = s => (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // App state
  let state = {
    currentUserId: null,
    currentServerId: db.servers[0]?.id || null,
    currentChannelId: db.servers[0]?.channels?.[0]?.id || null
  };

  // DOM refs
  const loadingOverlay = document.getElementById('loading-overlay');
  const serversCol = document.getElementById('servers-col');
  const authArea = document.getElementById('auth-area');
  const serversList = document.getElementById('servers-list');
  const createServerBtn = document.getElementById('create-server-btn');
  const profileCompact = document.getElementById('profile-compact');
  const serverTitle = document.getElementById('server-title');
  const channelsList = document.getElementById('channels-list');
  const messagesEl = document.getElementById('messages');
  const messageForm = document.getElementById('message-form');
  const messageInput = document.getElementById('message-input');
  const profilePanel = document.getElementById('profile-panel');
  const questsPanel = document.getElementById('quests-panel');

  // Seed demo data if empty
  if(db.users.length===0){
    const bot = {id:uid('u'), username:'HelperBot', displayName:'Helper Bot', avatarColor:'#6ee7b7', bg:'', bio:'Community helper', xp:100, badges:[]};
    const admin = {id:uid('u'), username:'admin', displayName:'Admin', avatarColor:'#f97316', bg:'', bio:'I run this demo', xp:200, badges:['founder'], roles:['Admin']};
    db.users.push(bot,admin);
    const s = {id:uid('s'), name:'Welcome Server', ownerId:admin.id, channels:[{id:uid('c'),name:'general'},{id:uid('c'),name:'quests'}], members:[admin.id,bot.id], createdAt:now()};
    db.servers.push(s);
    db.messages.push({id:uid('m'), serverId:s.id, channelId:s.channels[0].id, authorId:bot.id, content:'Welcome! Type /help for commands.', ts:now()});
    db.quests = [ {id:'q1', title:'Introduce Yourself', desc:'Send a message in #general', reward:20, check:({messages,userId})=>messages.some(m=>m.authorId===userId)} ];
    saveDB(db);
  }

  // Render functions
  function renderServersCol(){
    if(!serversCol) return;
    serversCol.innerHTML='';
    db.servers.forEach(s=>{
      const icon = document.createElement('div'); icon.className='server-icon'+(s.id===state.currentServerId?' active':''); icon.title=s.name; icon.textContent=s.name[0]||'S';
      icon.onclick = ()=>{ state.currentServerId=s.id; state.currentChannelId=s.channels?.[0]?.id; renderAll(); };
      serversCol.appendChild(icon);
    });
  }

  function renderAuth(){
    authArea.innerHTML='';
    if(state.currentUserId){
      const u = db.users.find(x=>x.id===state.currentUserId);
      const el = document.createElement('div'); el.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div style="width:36px;height:36px;border-radius:8px;background:${u.avatarColor}"></div><div><div>${escapeHtml(u.displayName)}</div><div class="small-muted">@${escapeHtml(u.username)}</div></div></div>`;
      authArea.appendChild(el);
    } else {
      const btn = document.createElement('button'); btn.className='btn'; btn.textContent='Log in / Sign up'; btn.onclick=showAuthModal; authArea.appendChild(btn);
    }
  }

  function renderServers(){
    serversList.innerHTML='';
    db.servers.forEach(s=>{ const item=document.createElement('div'); item.className='server-item'+(s.id===state.currentServerId?' active':''); item.textContent=s.name+' ('+(s.members?.length||0)+')'; item.onclick=()=>{state.currentServerId=s.id; state.currentChannelId=s.channels?.[0]?.id; renderAll();}; serversList.appendChild(item); });
  }

  function renderChannels(){
    channelsList.innerHTML='';
    const s = db.servers.find(x=>x.id===state.currentServerId);
    if(!s){ channelsList.innerHTML='<div class="small-muted">No server selected</div>'; serverTitle.textContent='No server'; return; }
    serverTitle.textContent = s.name;
    s.channels.forEach(ch=>{ const el=document.createElement('div'); el.className='channel-item'+(ch.id===state.currentChannelId?' active':''); el.textContent='# '+ch.name; el.onclick=()=>{ state.currentChannelId=ch.id; renderAll(); }; channelsList.appendChild(el); });
  }

  function renderMessages(){
    messagesEl.innerHTML='';
    const msgs = db.messages.filter(m=>m.serverId===state.currentServerId && m.channelId===state.currentChannelId).sort((a,b)=>a.ts-b.ts);
    msgs.forEach(m=>{
      const author = db.users.find(u=>u.id===m.authorId) || {displayName:'Unknown', avatarColor:'#64748b', username:'unknown'};
      const row = document.createElement('div'); row.className='message-row';
      row.innerHTML = `<img class="message-avatar" src="" style="background:${author.avatarColor}" alt="${escapeHtml(author.displayName)}" /><div class="message-body"><div class="message-meta"><strong>${escapeHtml(author.displayName)}</strong> <span class="small-muted">@${escapeHtml(author.username)} • ${new Date(m.ts).toLocaleTimeString()}</span></div><div class="message-text">${escapeHtml(m.content)}</div></div>`;
      // wire avatar click to open profile
      const avatarEl = row.querySelector('.message-avatar');
      if(avatarEl){ avatarEl.style.cursor = 'pointer'; avatarEl.onclick = ()=> showProfile(author.id); }
      messagesEl.appendChild(row);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderProfilePanel(){
    profilePanel.innerHTML=''; if(!state.currentUserId){ profilePanel.innerHTML='<div class="small-muted">Log in to see your profile.</div>'; return; }
    const u = db.users.find(x=>x.id===state.currentUserId);
    profilePanel.innerHTML = `<div style="display:flex;gap:10px;align-items:center"><div style="width:64px;height:64px;border-radius:10px;background:${u.avatarColor}"></div><div><strong>${escapeHtml(u.displayName)}</strong><div class="small-muted">@${escapeHtml(u.username)}</div></div></div><div style="margin-top:8px"><button id="edit-profile-btn" class="btn">Edit</button></div>`;
    const btn = document.getElementById('edit-profile-btn'); if(btn) btn.onclick=showEditProfile;
  }

  function renderProfileCompact(){ profileCompact.innerHTML=''; if(!state.currentUserId) return; const u = db.users.find(x=>x.id===state.currentUserId); profileCompact.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div style="width:36px;height:36px;border-radius:8px;background:${u.avatarColor}"></div><div>${escapeHtml(u.displayName)}</div><button id="logout-btn" class="btn">Log out</button></div>`; document.getElementById('logout-btn').onclick = ()=>{ state.currentUserId=null; renderAll(); saveState(); } }

  function renderQuests(){ questsPanel.innerHTML=''; const list = db.quests||[]; questsPanel.innerHTML='<h3>Quests</h3>'; list.forEach(q=>{ const el=document.createElement('div'); el.style.marginBottom='8px'; const done = checkQuestDone(q.id); el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${escapeHtml(q.title)}</strong><div class="small-muted">${escapeHtml(q.desc)}</div></div><div>${done?'<span class="tag">Done</span>':'<button class="btn small start-quest">Start</button>'}</div></div>`; questsPanel.appendChild(el); if(!done){ el.querySelector('.start-quest').onclick=()=>{ alert('Quest started: '+q.title); } } }); }

  function checkQuestDone(qid){ if(!state.currentUserId) return false; const q = db.quests.find(x=>x.id===qid); const user = db.users.find(u=>u.id===state.currentUserId); const messages = db.messages; try{return q && q.check({messages,userId:state.currentUserId,user,server:db.servers.find(s=>s.id===state.currentServerId)})}catch(e){return false} }

  // Modal helpers (simple)
  function showModal(html){ const root = document.getElementById('modal-root'); root.innerHTML = `<div class="modal-backdrop"></div><div class="modal">${html}</div>`; root.querySelector('.modal-backdrop').onclick=closeModal; }
  function closeModal(){ document.getElementById('modal-root').innerHTML=''; }

  // Show Discord-style profile modal for a user
  function showProfile(userId){
    const user = db.users.find(u => u.id === userId);
    if(!user) return;

    // find mutual servers with current user
    const mutuals = [];
    if(state.currentUserId){
      db.servers.forEach(s => {
        const members = s.members || [];
        if(members.includes(userId) && members.includes(state.currentUserId)){
          mutuals.push(s);
        }
      });
    }

    const rolesHtml = (user.roles || []).map(r => `<span class="profile-role">${escapeHtml(r)}</span>`).join('');
    const mutualsHtml = mutuals.map(s => `<div class="mutual-server" title="${escapeHtml(s.name)}">${escapeHtml((s.name||'')[0]||'S')}</div>`).join('');

    const bannerStyle = user.bg ? `style="background:${escapeHtml(user.bg)}"` : '';
    const avatarStyle = `style="background:${escapeHtml(user.avatarColor||'#6ee7b7')}"`;

    const html = `
      <div class="profile-modal" role="dialog" aria-modal="true" aria-label="User profile">
        <div class="profile-banner" ${bannerStyle}></div>
        <div class="profile-content">
          <div>
            <img class="profile-avatar-large" ${avatarStyle} alt="${escapeHtml(user.displayName||user.username)}" />
          </div>
          <div class="profile-main">
            <div class="profile-name">${escapeHtml(user.displayName||user.username)}</div>
            <div class="profile-username">@${escapeHtml(user.username)}</div>
            <div class="profile-bio">${escapeHtml(user.bio||'')}</div>

            <div class="profile-actions">
              <button class="btn" id="pm-btn">Message</button>
              <button class="btn" id="friend-btn">Add Friend</button>
              <button class="btn" id="close-profile">Close</button>
            </div>

            <div class="profile-roles">${rolesHtml || ''}</div>
            <div class="profile-mutuals">${mutualsHtml || '<div class="small-muted">No mutual servers</div>'}</div>
          </div>
        </div>
      </div>
    `;

    showModal(html);

    // wire up actions
    const pmBtn = document.getElementById('pm-btn');
    if(pmBtn) pmBtn.onclick = () => { closeModal(); alert('Open DM with ' + (user.displayName || user.username)); };
    const friendBtn = document.getElementById('friend-btn');
    if(friendBtn) friendBtn.onclick = () => { alert('Friend request sent to ' + (user.displayName || user.username)); };
    const closeBtn = document.getElementById('close-profile');
    if(closeBtn) closeBtn.onclick = closeModal;
  }

  function showAuthModal(){ showModal(`<h3>Log in / Sign up</h3><div style="display:flex;gap:8px;margin-top:8px"><input id="auth-username" class="input" placeholder="username" /><input id="auth-password" type="password" class="input" placeholder="password" /></div><div style="margin-top:8px;display:flex;gap:8px"><button class="btn" id="auth-login">Log in</button><button class="btn" id="auth-signup">Sign up</button></div><div class="small-muted footer-note" style="margin-top:8px">This demo stores accounts locally in your browser. For production use proper auth.</div>`);
    document.getElementById('auth-login').onclick = ()=>{ const u=document.getElementById('auth-username').value.trim(); const p=document.getElementById('auth-password').value; const found = db.users.find(x=>x.username.toLowerCase()===u.toLowerCase()); if(!found){ alert('User not found — sign up instead'); return; } if(found.password && found.password !== btoa(p)){ alert('Wrong password'); return; } state.currentUserId = found.id; closeModal(); renderAll(); saveState(); }
    document.getElementById('auth-signup').onclick = ()=>{ const u=document.getElementById('auth-username').value.trim(); const p=document.getElementById('auth-password').value; if(!u||!p){ alert('Choose username and password'); return; } if(db.users.find(x=>x.username.toLowerCase()===u.toLowerCase())){ alert('Username taken'); return; } const newUser = {id:uid('u'), username:u, displayName:u, password:btoa(p), avatarColor:['#6ee7b7','#60a5fa','#f97316','#f472b6','#a78bfa'][Math.floor(Math.random()*5)], bg:'', bio:'', xp:0, badges:[], roles:[]}; db.users.push(newUser); saveDB(db); state.currentUserId=newUser.id; closeModal(); renderAll(); saveState(); }
  }

  function showEditProfile(){ const u = db.users.find(x=>x.id===state.currentUserId); showModal(`<h3>Edit Profile</h3><div style="display:flex;flex-direction:column;gap:8px"><input id="ep-display" class="input" value="${escapeHtml(u.displayName||'')}" placeholder="Display name" /><input id="ep-bio" class="input" value="${escapeHtml(u.bio||'')}" placeholder="Bio" /><input id="ep-color" class="input" value="${escapeHtml(u.avatarColor||'')}" placeholder="Avatar color" /><input id="ep-bg" class="input" value="${escapeHtml(u.bg||'')}" placeholder="Background CSS" /></div><div style="margin-top:8px;display:flex;gap:8px"><button class="btn" id="save-profile">Save</button><button class="btn" id="cancel-profile">Cancel</button></div>`);
    document.getElementById('save-profile').onclick=()=>{ u.displayName = document.getElementById('ep-display').value||u.displayName; u.bio = document.getElementById('ep-bio').value; u.avatarColor = document.getElementById('ep-color').value; u.bg = document.getElementById('ep-bg').value; saveDB(db); closeModal(); renderAll(); saveState(); };
    document.getElementById('cancel-profile').onclick = closeModal;
  }

  // Save/load UI state
  function saveState(){ try{ localStorage.setItem('liumial_ui_state', JSON.stringify(state)); }catch(e){} }
  function loadState(){ try{ const s=JSON.parse(localStorage.getItem('liumial_ui_state')||'{}'); state=Object.assign(state,s);}catch(e){} }

  // Message sending
  messageForm.addEventListener('submit', async (e)=>{
    e.preventDefault(); const text = messageInput.value.trim(); if(!text) return; if(!state.currentUserId){ alert('Log in to send messages'); return; }
    const msg = { id:uid('m'), serverId:state.currentServerId, channelId:state.currentChannelId, authorId:state.currentUserId, content:text, ts:now() };
    // if server-sync available, send to server, otherwise local
    if(window._serverSync && window._serverSync.enabled){
      try{
        await window._serverSync.sendMessage({ serverId: msg.serverId, channelId: msg.channelId, authorId: msg.authorId, content: msg.content, ts: new Date().toISOString() });
        messageInput.value='';
      }catch(err){ console.error('send failed',err); // fallback
        db.messages.push(msg); saveDB(db); messageInput.value=''; renderAll();
      }
    } else {
      db.messages.push(msg); saveDB(db); messageInput.value=''; renderAll();
    }
  });

  // Post message triggers (bot)
  function runPostMessageTriggers(msg){
    // helper bot: respond to /help etc
    if(msg.content.startsWith('/')){ handleCommand(msg, msg.content); }
    else if(/help|assist|how do/i.test(msg.content) || msg.content.toLowerCase().includes('helperbot')){
      const bot = db.users[0]; db.messages.push({id:uid('m'), serverId:msg.serverId, channelId:msg.channelId, authorId:bot.id, content:`I am HelperBot — try /help to see commands.`, ts:now()}); saveDB(db);
    }
  }
  function handleCommand(msg, content){ const parts = content.slice(1).split(' '); const cmd = parts[0].toLowerCase(); const args = parts.slice(1); const botId = db.users[0].id; if(cmd==='help'){db.messages.push({id:uid('m'), serverId:msg.serverId, channelId:msg.channelId, authorId:botId, content:'Commands: /help /quests /profile /bg <color or gradient>', ts:now()+60});} else if(cmd==='quests'){ const list=(db.quests||[]).map(q=>`- ${q.title}: ${q.desc}`).join('\n'); db.messages.push({id:uid('m'), serverId:msg.serverId, channelId:msg.channelId, authorId:botId, content:'Quests:\n'+list, ts:now()+60}); } else if(cmd==='bg'){ if(!state.currentUserId){ db.messages.push({id:uid('m'), serverId:msg.serverId, channelId:msg.channelId, authorId:botId, content:'Log in to change your background.', ts:now()+60}); return; } const val=args.join(' '); const u=db.users.find(x=>x.id===state.currentUserId); if(u){ u.bg=val; saveDB(db); db.messages.push({id:uid('m'), serverId:msg.serverId, channelId:msg.channelId, authorId:botId, content:`Background updated to ${val}`, ts:now()+60}); } } else { db.messages.push({id:uid('m'), serverId:msg.serverId, channelId:msg.channelId, authorId:botId, content:`Unknown command: ${cmd}. Use /help.`, ts:now()+60}); } saveDB(db); }

  // Initialization with server-sync
  async function init(){
    loadState();
    // if server-sync available, fetch initial data and subscribe
    if(window._serverSync && window._serverSync.enabled){
      try{
        const initial = await window._serverSync.fetchInitial();
        // map servers
        if(initial.servers && initial.servers.length){ db.servers = initial.servers.map(s=>({ id:s.id, name:s.name, ownerId:s.owner_id, channels:(s.channels||[]).map(c=>({id:c.id,name:c.name})), members:s.members||[], createdAt: new Date(s.created_at).getTime() })); }
        if(initial.users) db.users = initial.users.map(u=>({ id:u.id, username:u.username, displayName:u.display_name||u.username, avatarColor:u.avatar_color||'#6ee7b7', bg:u.bg, bio:u.bio, xp:u.xp, badges:u.badges, roles:u.roles||[] }));
        if(initial.messages) db.messages = initial.messages.map(m=>({ id:m.id, serverId:m.server_id, channelId:m.channel_id, authorId:m.author_id, content:m.content, ts:new Date(m.ts).getTime() }));
      }catch(e){ console.warn('fetchInitial failed',e); }
      // subscribe to new messages
      try{
        window._serverSync.onMessage((newMsg)=>{
          if(!db.messages.find(mm=>mm.id===newMsg.id)){
            db.messages.push({ id:newMsg.id, serverId:newMsg.server_id, channelId:newMsg.channel_id, authorId:newMsg.author_id, content:newMsg.content, ts:new Date(newMsg.ts).getTime() });
            saveDB(db); renderMessages(); renderQuests();
          }
        });
      }catch(e){console.warn('subscribe failed',e)}
    }
    renderAll();
    // hide loading overlay
    if(loadingOverlay){ loadingOverlay.classList.add('hidden'); setTimeout(()=>{ if(loadingOverlay) loadingOverlay.style.display='none'; },500); }
  }

  function renderAll(){ renderAuth(); renderServersCol(); renderServers(); renderChannels(); renderMessages(); renderProfilePanel(); renderProfileCompact(); renderQuests(); }

  // Expose for debugging
  window._liumial = { db, state, saveDB, saveState };

  // attach createServer button
  if(createServerBtn) createServerBtn.onclick = ()=>{ showModal(`<h3>Create Server</h3><input id="new-server-name" class="input" placeholder="Server name" /><div style="margin-top:8px"><button class="btn" id="create-server-do">Create</button></div>`); document.getElementById('create-server-do').onclick = ()=>{ const name=document.getElementById('new-server-name').value.trim()||'New Server'; const ownerId = state.currentUserId || db.users[1].id; const s={id:uid('s'), name, ownerId, channels:[{id:uid('c'),name:'general'}], members:[ownerId], createdAt:now()}; db.servers.push(s); saveDB(db); closeModal(); state.currentServerId=s.id; state.currentChannelId=s.channels[0].id; renderAll(); saveState(); } };

  // start
  document.addEventListener('DOMContentLoaded', ()=>{ init(); });
})();
