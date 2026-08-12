// app.js — updated for serverless deployers (Vercel/Supabase) with realtime sync, image uploads,
// unsent handling, replies/mentions notifications, delete message, daily quest currency (luminal), and more.
(() => {
  const DB_KEY = 'liumial_db_v1';

  const defaultState = () => ({
    users: [],
    servers: [],
    messages: [],
    quests: [],
    createdAt: Date.now()
  });

  function loadDB(){
    try{ const raw = localStorage.getItem(DB_KEY); if(!raw) return defaultState(); return JSON.parse(raw);}catch(e){console.error('DB load',e);return defaultState();}
  }
  function saveDB(db){ localStorage.setItem(DB_KEY,JSON.stringify(db)); }
  const db = loadDB();

  // Utilities
  function uid(prefix='id'){return prefix+Math.random().toString(36).slice(2,9)}
  function now(){return Date.now()}
  function findUserByUsername(u){return db.users.find(x=>x.username && x.username.toLowerCase()===u.toLowerCase())}
  function hash(p){return btoa(p)}

  // Ensure currency fields on users
  function ensureUserFields(u){ if(!u.luminal) u.luminal = 0; if(!u.lastDailyClaim) u.lastDailyClaim = 0; return u }

  // Seed if empty
  if(db.users.length===0){
    const bot = {id:uid('u'),username:'helperbot',displayName:'Helper Bot',password:hash('bot'),avatarColor:'#6ee7b7',bg:'linear-gradient(90deg,#0ea5a7,#6ee7b7)',bio:'Community helper',xp:100,badges:['bot'],luminal:0,lastDailyClaim:0}
    const admin = {id:uid('u'),username:'admin',displayName:'Admin',password:hash('admin'),avatarColor:'#f97316',bg:'#071226',bio:'I run this demo',xp:200,badges:['founder'],luminal:0,lastDailyClaim:0}
    db.users.push(bot,admin)
    const server = {id:uid('s'),name:'Welcome Server',ownerId:admin.id,channels:[{id:uid('c'),name:'general'},{id:uid('c'),name:'quests'}],members:[admin.id,bot.id],createdAt:now()}
    db.servers.push(server)
    db.messages.push({id:uid('m'),serverId:server.id,channelId:server.channels[0].id,authorId:bot.id,content:'Welcome! Type /help for commands or introduce yourself to get quests.',ts:now()})
    db.quests = [
      {id:'q1',title:'Introduce Yourself',desc:'Send a message in #general introducing yourself',reward:20,check:({messages,userId,server})=> messages.some(m=>m.authorId===userId && (m.content.toLowerCase().includes('hi')||m.content.toLowerCase().includes('hello')))},
      {id:'q2',title:'Customize Profile',desc:'Change your profile background or color',reward:10,check:({user})=>!!user.bg||!!user.avatarColor},
      {id:'daily',title:'Daily Luminal',desc:'Claim daily reward of 50 luminal',reward:50,check:({user})=>{ // special daily; check handled separately
        return false
      }}
    ]
    saveDB(db)
  }

  // App state
  let state = {
    currentUserId: null,
    currentServerId: db.servers[0]?.id,
    currentChannelId: db.servers[0]?.channels[0]?.id,
    replyTo: null,
    mentionsUnread: 0
  }

  // DOM refs
  const authArea = document.getElementById('auth-area')
  const serversList = document.getElementById('servers-list')
  const createServerBtn = document.getElementById('create-server-btn')
  const profileCompact = document.getElementById('profile-compact')
  const serverTitle = document.getElementById('server-title')
  const channelsList = document.getElementById('channels-list')
  const messagesEl = document.getElementById('messages')
  const messageForm = document.getElementById('message-form')
  const messageInput = document.getElementById('message-input')
  const profilePanel = document.getElementById('profile-panel')
  const questsPanel = document.getElementById('quests-panel')
  const modalRoot = document.getElementById('modal-root')
  const openSettings = document.getElementById('open-settings')

  // create file input for images (allows attach)
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'image/*'
  fileInput.id = 'message-file'
  fileInput.style.display = 'none'
  messageForm.appendChild(fileInput)

  // Toast area
  const toastRoot = document.createElement('div')
  toastRoot.style.position = 'fixed'
  toastRoot.style.top = '16px'
  toastRoot.style.right = '16px'
  toastRoot.style.zIndex = 99999
  document.body.appendChild(toastRoot)

  function showToast(msg, timeout=5000){
    const t = document.createElement('div')
    t.style.background = 'rgba(0,0,0,0.7)'
    t.style.color = 'white'
    t.style.padding = '10px 14px'
    t.style.borderRadius = '8px'
    t.style.marginTop = '8px'
    t.textContent = msg
    toastRoot.appendChild(t)
    setTimeout(()=>{ t.style.opacity = '0'; setTimeout(()=>t.remove(),300)}, timeout)
  }

  // Browser notification helper
  function maybeNotify(title, body){
    if(!('Notification' in window)) return
    if(Notification.permission === 'granted'){
      new Notification(title, { body })
    }else if(Notification.permission !== 'denied'){
      Notification.requestPermission().then(p=>{ if(p==='granted') new Notification(title,{body}) })
    }
  }

  // Server-sync initialization (if Supabase configured)
  let serverSyncReady = false
  async function initServerSync(){
    if(window._serverSync && window._serverSync.enabled){
      try{
        const initial = await window._serverSync.fetchInitial()
        // Normalize and replace local db with server data where appropriate
        if(initial){
          // users
          if(Array.isArray(initial.users) && initial.users.length>0){
            db.users = initial.users.map(u=>ensureUserFields({ id: u.id, username: u.username||u.id, displayName: u.display_name||u.username||u.id, avatarColor: u.avatar_color||'#6ee7b7', bg: u.bg||'', bio: u.bio||'', xp: u.xp||0, badges: u.badges||[], luminal: u.luminal||0, lastDailyClaim: u.last_daily_claim||0 }))
          }
          // servers
          if(Array.isArray(initial.servers) && initial.servers.length>0){
            db.servers = initial.servers.map(s=>({ id: s.id, name: s.name, ownerId: s.owner_id, channels: (s.channels||[]).map(c=>({id:c.id,name:c.name})), members: s.members||[], createdAt: s.created_at }))
          }
          // messages
          if(Array.isArray(initial.messages)){
            db.messages = initial.messages.map(m=>({ id: 'srv_'+m.id, remoteId: m.id, serverId: m.server_id, channelId: m.channel_id, authorId: m.author_id, content: m.content, ts: (m.ts? (new Date(m.ts)).getTime(): now()), image: m.image_url||null, replyTo: m.reply_to||null }))
          }
          saveDB(db)
          renderAll()
        }

        // subscribe to new messages
        window._serverSync.onMessage(payload => {
          if(!payload) return
          // convert and append if not present
          const exists = db.messages.some(m=>m.remoteId && (''+m.remoteId) === (''+payload.id))
          if(!exists){
            db.messages.push({ id: 'srv_'+payload.id, remoteId: payload.id, serverId: payload.server_id, channelId: payload.channel_id, authorId: payload.author_id, content: payload.content, ts: (payload.ts? (new Date(payload.ts)).getTime(): now()), image: payload.image_url||null, replyTo: payload.reply_to||null })
            saveDB(db)
            renderAll()
            handleMentionOrReplyNotifications(db.messages[db.messages.length-1])
          }
        })

        serverSyncReady = true
        console.log('app: server-sync ready')
      }catch(e){
        console.warn('app: server-sync init failed', e)
        serverSyncReady = false
      }
    }else{
      serverSyncReady = false
    }
  }

  // call initServerSync shortly after load; server-sync.js is loaded before app.js via defer ordering
  setTimeout(()=>initServerSync(), 200)

  // handle mention/reply notifications
  function handleMentionOrReplyNotifications(message){
    if(!state.currentUserId) return
    const me = db.users.find(u=>u.id===state.currentUserId)
    if(!me) return
    // mentions via @username
    const mentionRegex = /@([a-zA-Z0-9_\-]+)/g
    let m;
    let notified = false
    while((m = mentionRegex.exec(message.content)) !== null){
      const uname = m[1]
      if(uname.toLowerCase() === me.username.toLowerCase()){ // mentioned
        showToast(`You were mentioned by @${getUsernameById(message.authorId)}: "${truncate(message.content,50)}"`)
        maybeNotify('@'+me.username+' mentioned', `${getUsernameById(message.authorId)}: ${truncate(message.content,80)}`)
        state.mentionsUnread++
        notified = true
        break
      }
    }
    // reply to a message authored by current user
    if(message.replyTo){
      const replied = db.messages.find(x=>x.id===message.replyTo || x.remoteId==message.replyTo)
      if(replied && replied.authorId === state.currentUserId){
        showToast(`Your message got a reply from ${getUsernameById(message.authorId)}`)
        maybeNotify('New reply', `${getUsernameById(message.authorId)} replied to you: ${truncate(message.content,80)}`)
        notified = true
      }
    }
    return notified
  }

  function getUsernameById(id){ const u = db.users.find(x=>x.id===id); return u ? (u.displayName||u.username) : 'Unknown' }
  function truncate(s, n){ if(!s) return ''; return s.length>n? s.slice(0,n-1)+'…':s }

  // Message sending logic including image upload and retry
  async function trySendToServer(localMsg){
    try{
      if(!(window._serverSync && window._serverSync.enabled)) throw new Error('server-sync not available')

      const payload = { serverId: localMsg.serverId, channelId: localMsg.channelId, authorId: localMsg.authorId, content: localMsg.content, ts: new Date(localMsg.ts).toISOString() }
      // handle reply
      if(localMsg.replyTo) payload.reply_to = localMsg.replyTo
      // handle image upload
      if(localMsg.imageFile){
        // upload to supabase storage 'uploads' bucket (must exist and be public)
        const supabase = window._serverSync.supabase
        const ext = localMsg.imageFile.name.split('.').pop() || 'png'
        const path = `messages/${uid('f')}.${ext}`
        const file = localMsg.imageFile
        const { error: upErr } = await supabase.storage.from('uploads').upload(path, file, { cacheControl: '3600', upsert: false })
        if(upErr){ console.warn('storage upload failed', upErr); throw upErr }
        const { data } = supabase.storage.from('uploads').getPublicUrl(path)
        payload.image_url = data.publicUrl
      }

      const serverRow = await window._serverSync.sendMessage({ serverId: payload.serverId, channelId: payload.channelId, authorId: payload.authorId, content: payload.content, ts: payload.ts, image_url: payload.image_url, reply_to: payload.reply_to })
      return serverRow
    }catch(e){
      console.warn('trySendToServer error', e)
      throw e
    }
  }

  // delete message on server/local
  async function deleteMessage(msg){
    // remove locally
    const idx = db.messages.findIndex(m=>m.id===msg.id)
    if(idx!==-1) db.messages.splice(idx,1)
    saveDB(db); renderAll()
    // attempt server-side delete if remoteId exists
    if(msg.remoteId && window._serverSync && window._serverSync.enabled){
      try{
        await window._serverSync.supabase.from('messages').delete().eq('id', msg.remoteId)
      }catch(e){ console.warn('server delete failed', e) }
    }
  }

  // UI: render functions
  function renderAuth(){
    authArea.innerHTML = ''
    if(state.currentUserId){
      const u = db.users.find(x=>x.id===state.currentUserId)
      const el = document.createElement('div')
      el.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div style="width:44px;height:44px;border-radius:8px;background:${u.avatarColor};display:flex;align-items:center;justify-content:center;color:#032; font-weight:700">${(u.displayName||u.username).charAt(0).toUpperCase()}</div><div style="flex:1"><div style="font-weight:600">${escapeHtml(u.displayName||u.username)}</div><div class="small-muted" style="font-size:12px">@${escapeHtml(u.username)} • ⭐ ${u.luminal||0}</div></div><div><button id="logout-btn" class="btn small">Log out</button></div></div>`
      authArea.appendChild(el)
      document.getElementById('logout-btn').onclick = ()=>{state.currentUserId=null;renderAll();saveState()}
    }else{
      const btnLogin = document.createElement('button')
      btnLogin.className='btn'
      btnLogin.textContent='Log in / Sign up'
      btnLogin.onclick = showAuthModal
      authArea.appendChild(btnLogin)
    }
  }

  function renderServers(){ serversList.innerHTML=''; db.servers.forEach(s=>{ const item=document.createElement('div'); item.className='server-item'; if(s.id===state.currentServerId) item.classList.add('active'); item.textContent = s.name + ' ('+ (s.members? s.members.length:0) +')'; item.onclick = ()=>{state.currentServerId=s.id; state.currentChannelId=s.channels[0]?.id; renderAll()}; serversList.appendChild(item) }) }

  function renderChannels(){
    channelsList.innerHTML=''
    const s = db.servers.find(x=>x.id===state.currentServerId)
    if(!s){channelsList.innerHTML='<div class="small-muted">No server selected</div>';serverTitle.textContent='No server';return}
    serverTitle.textContent = s.name
    s.channels.forEach(ch=>{ const el=document.createElement('div'); el.className='channel-item'; if(ch.id===state.currentChannelId) el.classList.add('active'); el.textContent = '# '+ch.name; el.onclick = ()=>{state.currentChannelId=ch.id;renderAll()}; channelsList.appendChild(el) })
    const add = document.createElement('button'); add.className='btn'; add.textContent='New Channel'; add.onclick = ()=>createChannelModal(s); channelsList.appendChild(add)
  }

  function renderMessages(){
    messagesEl.innerHTML=''
    const msgs = db.messages.filter(m=>m.serverId===state.currentServerId && m.channelId===state.currentChannelId).sort((a,b)=>a.ts-b.ts)
    msgs.forEach(m=>{
      const author = db.users.find(u=>u.id===m.authorId) || {displayName:'Unknown',avatarColor:'#64748b',username:'unknown'}
      const me = (m.authorId===state.currentUserId)
      const wrapper = document.createElement('div')
      wrapper.className = 'message' + (me? ' me':'')
      const row = document.createElement('div')
      row.className = 'message-row'
      const avatar = document.createElement('div')
      avatar.className = 'avatar'
      avatar.style.cssText = `width:36px;height:36px;border-radius:8px;background:${author.avatarColor};display:flex;align-items:center;justify-content:center;color:#022;font-weight:700;flex-shrink:0`
      avatar.textContent = (author.displayName||author.username).charAt(0).toUpperCase()
      const body = document.createElement('div')
      body.style.flex='1'
      const meta = `<div class="meta"><strong>${escapeHtml(author.displayName||author.username)}</strong> <span class="small-muted">@${escapeHtml(author.username)} • ${new Date(m.ts).toLocaleTimeString()}</span></div>`
      const content = `<div class="body">${escapeHtml(m.content||'')}</div>`
      let imageHtml = ''
      if(m.image){ imageHtml = `<div style="margin-top:8px"><img src="${escapeHtml(m.image)}" style="max-width:360px;border-radius:8px;display:block"/></div>` }
      let replyHtml = ''
      if(m.replyTo){
        const r = db.messages.find(x=>x.id===m.replyTo||x.remoteId==m.replyTo)
        if(r){ const ra = db.users.find(u=>u.id===r.authorId) || {displayName:'Unknown',username:'unknown'}; replyHtml = `<div style="padding:8px;border-left:3px solid rgba(255,255,255,0.03);margin-bottom:6px;border-radius:6px;background:rgba(255,255,255,0.01)"><small class="small-muted">Reply to ${escapeHtml(ra.displayName||ra.username)}: ${escapeHtml(truncate(r.content,80))}</small></div>` }
      }

      const unsentBadge = m.unsent? '<span style="color:#f8d7da;background:rgba(255,0,0,0.06);padding:4px 8px;border-radius:8px;margin-left:8px;font-size:12px">Unsent</span>': ''

      body.innerHTML = meta + replyHtml + content + imageHtml + `<div style="margin-top:8px;display:flex;gap:8px;align-items:center"><button class="btn small reply-btn">Reply</button>${me?'<button class="btn small delete-btn">Delete</button>':''}${m.unsent?'<button class="btn small retry-btn">Retry</button>':''}${unsentBadge}</div>`
      row.appendChild(avatar)
      row.appendChild(body)
      wrapper.appendChild(row)
      messagesEl.appendChild(wrapper)

      // actions
      const replyBtn = wrapper.querySelector('.reply-btn')
      if(replyBtn) replyBtn.onclick = ()=>{ state.replyTo = m.id || m.remoteId; messageInput.focus(); messageInput.value = `@${getUsernameById(m.authorId)} ` }
      const deleteBtn = wrapper.querySelector('.delete-btn')
      if(deleteBtn) deleteBtn.onclick = ()=>{ if(confirm('Delete this message?')) deleteMessage(m) }
      const retryBtn = wrapper.querySelector('.retry-btn')
      if(retryBtn) retryBtn.onclick = async ()=>{ try{ delete m.unsent; if(m.imageFile && !m.image) { /* ensure file is present */ }
          const serverRow = await trySendToServer(m); if(serverRow){ m.remoteId = serverRow.id || serverRow.remote_id || null; m.id = 'srv_'+ (m.remoteId||uid('s')); delete m.unsent; saveDB(db); renderAll() } }catch(e){ showToast('Retry failed') } }

    })
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  function escapeHtml(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

  function renderProfilePanel(){
    profilePanel.innerHTML=''
    if(!state.currentUserId){ profilePanel.innerHTML='<div class="small-muted">Log in to see your profile and customize it.</div>'; return }
    const u = db.users.find(x=>x.id===state.currentUserId)
    const html = `<div style="display:flex;gap:10px;align-items:center"><div style="width:64px;height:64px;border-radius:10px;background:${u.avatarColor};display:flex;align-items:center;justify-content:center;font-weight:700">${(u.displayName||u.username).charAt(0).toUpperCase()}</div><div style="flex:1"><div style="font-weight:700">${escapeHtml(u.displayName||u.username)}</div><div class="small-muted">@${escapeHtml(u.username)}</div><div style="margin-top:8px">⭐ Luminal: <strong>${u.luminal||0}</strong></div><div style="margin-top:8px"><button id="edit-profile-btn" class="btn small">Edit profile</button></div></div></div>`
    profilePanel.innerHTML = html
    document.getElementById('edit-profile-btn').onclick = showEditProfile
  }

  function renderProfileCompact(){ profileCompact.innerHTML=''; if(!state.currentUserId) return; const u = db.users.find(x=>x.id===state.currentUserId); profileCompact.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div style="width:36px;height:36px;border-radius:8px;background:${u.avatarColor};display:flex;align-items:center;justify-content:center;font-weight:700">${(u.displayName||u.username).charAt(0).toUpperCase()}</div><div style="flex:1"><div style="font-weight:600">${escapeHtml(u.displayName||u.username)}</div><div class="small-muted">@${escapeHtml(u.username)}</div></div><div><button id="logout-btn" class="btn small">Log out</button></div></div>`; const logoutBtn=document.getElementById('logout-btn'); if(logoutBtn) logoutBtn.onclick=()=>{state.currentUserId=null; renderAll(); saveState() } }

  function renderQuests(){ questsPanel.innerHTML=''; const list = db.quests || []; questsPanel.innerHTML = '<h3>Quests</h3>'; list.forEach(q=>{ const el=document.createElement('div'); el.style.marginBottom='8px'; if(q.id==='daily'){ // daily special
        const btn = `<button class="btn small claim-daily">Claim Daily</button>`
        el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${q.title}</strong><div class="small-muted">${q.desc}</div></div><div>${btn}</div></div>`
        questsPanel.appendChild(el)
        el.querySelector('.claim-daily').onclick = claimDaily
      } else {
        const done = checkQuestDone(q.id)
        el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${q.title}</strong><div class="small-muted">${q.desc}</div></div><div>${done?'<span class="tag">Done</span>':'<button class="btn small start-quest">Start</button>'}</div></div>`
        questsPanel.appendChild(el)
        if(!done){ const btn = el.querySelector('.start-quest'); if(btn) btn.onclick = ()=>{ alert('Quest started: '+q.title) } }
      } }) }

  function checkQuestDone(qid){ if(!state.currentUserId) return false; const q = db.quests.find(x=>x.id===qid); const user = db.users.find(u=>u.id===state.currentUserId); const messages = db.messages; try{return q.check({messages,userId:state.currentUserId,user,server:db.servers.find(s=>s.id===state.currentServerId)})}catch(e){return false} }

  async function claimDaily(){ if(!state.currentUserId){ alert('Log in to claim daily'); return } const u = db.users.find(x=>x.id===state.currentUserId); const nowTs = now(); if(nowTs - (u.lastDailyClaim||0) < 24*60*60*1000){ alert('Daily already claimed. Come back later.'); return } u.luminal = (u.luminal||0) + 50; u.lastDailyClaim = nowTs; saveDB(db); renderAll(); showToast('You claimed 50 luminal!'); // optionally sync profile to server
    if(window._serverSync && window._serverSync.enabled){ try{ await window._serverSync.updateProfile(u.id, { luminal: u.luminal, last_daily_claim: u.lastDailyClaim }) }catch(e){ console.warn('profile sync failed', e) } }
  }

  // Message form behavior
  messageForm.addEventListener('submit', async (e)=>{
    e.preventDefault()
    const text = messageInput.value.trim()
    const file = fileInput.files && fileInput.files[0]
    if(!text && !file) return
    if(!state.currentUserId){ alert('Log in to send messages'); return }

    const localMsg = { id: uid('m'), serverId: state.currentServerId, channelId: state.currentChannelId, authorId: state.currentUserId, content: text || '', ts: now(), replyTo: state.replyTo || null }
    if(file) localMsg.imageFile = file

    // optimistic add
    localMsg.unsent = true
    db.messages.push(localMsg)
    saveDB(db); renderAll()
    // reset
    messageInput.value=''; fileInput.value=''; state.replyTo = null

    // try to send
    try{
      const serverRow = await trySendToServer(localMsg)
      if(serverRow){
        // mark synced: set remoteId and remove unsent
        localMsg.remoteId = serverRow.id || serverRow.remote_id || null
        localMsg.id = 'srv_'+(localMsg.remoteId||uid('s'))
        delete localMsg.unsent
        // if server provided ts, normalize
        if(serverRow.ts) localMsg.ts = (new Date(serverRow.ts)).getTime()
        // if server returned image_url, set image
        if(serverRow.image_url) localMsg.image = serverRow.image_url
        saveDB(db); renderAll()
      }
    }catch(err){
      console.warn('send failed, message left unsent', err)
      showToast('Message could not be sent to server — saved locally (unsent)')
    }
  })

  // attempt to send a local unsent message (used by retry)
  async function retrySend(localMsg){ try{ const serverRow = await trySendToServer(localMsg); if(serverRow){ localMsg.remoteId = serverRow.id || serverRow.remote_id || null; localMsg.id = 'srv_'+(localMsg.remoteId||uid('s')); delete localMsg.unsent; if(serverRow.ts) localMsg.ts = (new Date(serverRow.ts)).getTime(); if(serverRow.image_url) localMsg.image = serverRow.image_url; saveDB(db); renderAll(); return true } }catch(e){ console.warn('retry failed', e) } return false }

  function runPostMessageTriggers(msg){
    // check quests (non-daily)
    db.quests.forEach(q=>{
      if(q.id!=='daily' && checkQuestDone(q.id)){
        const u = db.users.find(x=>x.id===msg.authorId)
        if(!u._completed) u._completed = {}
        if(!u._completed[q.id]){
          u._completed[q.id]=true
          u.xp = (u.xp||0) + (q.reward||0)
          (u.badges = u.badges||[]).push('q:'+q.id)
          db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:db.users[0].id,content:`Congrats ${u.displayName}! You completed quest: ${q.title} and earned ${q.reward} XP.`,ts:now()+50})
        }
      }
    })

    // helper bot & replies
    const content = msg.content
    if(content && content.startsWith('/')){ handleCommand(msg,content) }
    else{
      if(/help|assist|how do/i.test(content) || content.toLowerCase().includes('helperbot')){
        const botReply = {id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:db.users[0].id,content:`I am HelperBot — try /help to see commands, or /quests to view quests.`,ts:now()+50}
        db.messages.push(botReply)
      }
    }

    // persist local DB
    saveDB(db)
  }

  function handleCommand(msg,content){
    const parts = content.slice(1).split(' ')
    const cmd = parts[0].toLowerCase()
    const args = parts.slice(1)
    const botId = db.users[0].id
    if(cmd==='help') db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:botId,content:'Commands: /help /quests /profile /recommend /bg <color or gradient> /daily',ts:now()+60})
    else if(cmd==='quests'){ const list = db.quests.map(q=>`- ${q.title}: ${q.desc}`).join('\n'); db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:botId,content:'Quests:\n'+list,ts:now()+60}) }
    else if(cmd==='profile'){ const u=db.users.find(x=>x.id===msg.authorId); db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:botId,content:`Profile for ${u.displayName}: XP ${u.xp||0}, luminal ${u.luminal||0}, badges ${(u.badges||[]).join(', ')}`,ts:now()+60}) }
    else if(cmd==='recommend'){ db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:botId,content:'Recommendation: Customize your profile background, complete quests, and invite friends!',ts:now()+60}) }
    else if(cmd==='bg'){ if(!state.currentUserId){db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:botId,content:'Log in to change your background.',ts:now()+60});return} const val = args.join(' '); const u = db.users.find(x=>x.id===state.currentUserId); if(!u) return; u.bg = val; saveDB(db); db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:botId,content:`Background updated to ${val}`,ts:now()+60}) }
    else if(cmd==='daily'){ claimDaily() }
    else db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:botId,content:`Unknown command: ${cmd}. Use /help.`,ts:now()+60})
    saveDB(db)
  }

  // Modal helpers and UI actions (similar to previous but with small updates)
  function showAuthModal(){ showModal(`<h3>Log in / Sign up</h3><div style="display:flex;gap:8px;margin-top:8px"><input id="auth-username" class="input" placeholder="username" /><input id="auth-password" type="password" class="input" placeholder="password" /></div><div style="margin-top:8px;display:flex;gap:8px"><button class="btn" id="auth-login">Log in</button><button class="btn" id="auth-signup">Sign up</button></div><div class="small-muted footer-note">This demo stores accounts and data locally in your browser (localStorage). Not secure for production.</div>`) 
    document.getElementById('auth-login').onclick = ()=>{ const u=document.getElementById('auth-username').value.trim(); const p=document.getElementById('auth-password').value; const found=findUserByUsername(u); if(!found){alert('User not found — sign up instead');return} if(found.password!==hash(p)){alert('Wrong password');return} state.currentUserId=found.id; closeModal(); renderAll(); saveState() }
    document.getElementById('auth-signup').onclick = ()=>{ const u=document.getElementById('auth-username').value.trim(); const p=document.getElementById('auth-password').value; if(!u||!p){alert('Choose username and password');return} if(findUserByUsername(u)){alert('Username taken');return} const newUser={id:uid('u'),username:u,displayName:u,password:hash(p),avatarColor:randomColor(),bg:'',bio:'',xp:0,badges:[],luminal:0,lastDailyClaim:0}; db.users.push(newUser); saveDB(db); state.currentUserId=newUser.id; closeModal(); renderAll(); saveState() }
  }

  function showEditProfile(){ const u=db.users.find(x=>x.id===state.currentUserId); showModal(`<h3>Edit Profile</h3><div style="display:flex;flex-direction:column;gap:8px"><input id="ep-display" class="input" value="${escapeHtml(u.displayName||'')}" placeholder="Display name" /><input id="ep-bio" class="input" value="${escapeHtml(u.bio||'')}" placeholder="Bio" /><label>Avatar color: <input id="ep-color" type="color" value="${u.avatarColor||'#6ee7b7'}" /></label><input id="ep-bg" class="input" value="${escapeHtml(u.bg||'')}" placeholder="Profile background CSS or color" /><div style="display:flex;gap:8px;margin-top:8px"><button class="btn" id="save-profile">Save</button><button class="btn small" id="cancel-profile">Cancel</button></div></div>`); document.getElementById('save-profile').onclick = ()=>{ u.displayName=document.getElementById('ep-display').value||u.displayName; u.bio=document.getElementById('ep-bio').value; u.avatarColor=document.getElementById('ep-color').value; u.bg=document.getElementById('ep-bg').value; saveDB(db); closeModal(); renderAll(); saveState(); if(window._serverSync && window._serverSync.enabled){ window._serverSync.updateProfile(u.id, { display_name: u.displayName, bio: u.bio, avatar_color: u.avatarColor, bg: u.bg, luminal: u.luminal, last_daily_claim: u.lastDailyClaim }).catch(e=>console.warn('updateProfile failed',e)) } }; document.getElementById('cancel-profile').onclick = closeModal }

  function createChannelModal(server){ showModal(`<h3>New Channel in ${escapeHtml(server.name)}</h3><input id="new-channel-name" class="input" placeholder="channel name" /><div style="margin-top:8px"><button class="btn" id="create-channel-do">Create</button></div>`); document.getElementById('create-channel-do').onclick = ()=>{ const name=document.getElementById('new-channel-name').value.trim()||'new'; server.channels.push({id:uid('c'),name}); saveDB(db); closeModal(); renderAll(); saveState(); if(window._serverSync && window._serverSync.enabled){ window._serverSync.createChannel({ server_id: server.id, name }).catch(e=>console.warn('createChannel failed',e)) } } }

  function createServerModal(){ showModal(`<h3>Create Server</h3><input id="new-server-name" class="input" placeholder="Server name" /><div style="margin-top:8px"><button class="btn" id="create-server-do">Create</button></div>`); document.getElementById('create-server-do').onclick = ()=>{ const name=document.getElementById('new-server-name').value.trim()||'New Server'; const ownerId = state.currentUserId || db.users[1].id; const s={id:uid('s'),name,ownerId,channels:[{id:uid('c'),name:'general'}],members:[ownerId],createdAt:now()}; db.servers.push(s); saveDB(db); closeModal(); state.currentServerId=s.id; state.currentChannelId=s.channels[0].id; renderAll(); saveState(); if(window._serverSync && window._serverSync.enabled){ window._serverSync.createServer({ id: s.id, name: s.name, owner_id: s.ownerId }).catch(e=>console.warn('createServer failed', e)) } } }

  createServerBtn.onclick = ()=>createServerModal()

  function showModal(innerHtml){ modalRoot.innerHTML = `<div class="modal-backdrop"></div><div class="modal">${innerHtml}</div>`; modalRoot.querySelector('.modal-backdrop').onclick = closeModal }
  function closeModal(){ modalRoot.innerHTML = '' }

  openSettings.onclick = ()=>{ showModal(`<h3>Settings & Theme</h3><div class="setting-row">Accent color: <input id="set-accent" type="color" value="#6ee7b7" /></div><div class="setting-row">Background color: <input id="set-bg" type="color" value="#071226" /></div><div class="setting-row">Or enter gradient CSS: <input id="set-gradient" class="input" placeholder="linear-gradient(90deg,#123,#456)" /></div><div style="margin-top:8px"><button class="btn" id="apply-theme">Apply</button></div><div class="small-muted footer-note">You can set a single color or complex gradient (CSS) for your profile background via /bg command.</div>`); document.getElementById('apply-theme').onclick = ()=>{ const accent=document.getElementById('set-accent').value; const bgc=document.getElementById('set-bg').value; const grad=document.getElementById('set-gradient').value; if(grad){ document.documentElement.style.setProperty('--bg', bgc); document.body.style.background = grad } else { document.documentElement.style.setProperty('--accent', accent); document.body.style.background = `linear-gradient(180deg, ${bgc} 0%, #071226 100%)` } closeModal() } }

  // helpers
  function saveState(){ try{ localStorage.setItem('liumial_ui_state', JSON.stringify(state)) }catch(e){ console.warn(e) } }
  function loadState(){ try{ const s = JSON.parse(localStorage.getItem('liumial_ui_state')||'{}'); state = Object.assign(state, s) }catch(e){} }
  function randomColor(){ return ['#6ee7b7','#60a5fa','#f97316','#f472b6','#a78bfa'][Math.floor(Math.random()*5)] }

  // render all
  function renderAll(){ renderAuth(); renderServers(); renderChannels(); renderMessages(); renderProfilePanel(); renderProfileCompact(); renderQuests() ; if(state.currentUserId){ const u = db.users.find(x=>x.id===state.currentUserId); if(u?.bg) document.body.style.background = u.bg } }

  // hide loading overlay
  function hideLoadingOverlay(){ const ov=document.getElementById('loading-overlay'); if(!ov) return; ov.classList.add('hidden'); setTimeout(()=>{ if(ov && ov.parentNode) ov.parentNode.removeChild(ov) }, 600) }

  // message notification handler
  function handleMentionOrReplyNotifications(message){ handleMentionOrReplyNotifications // placeholder (already used in server message handling) }

  // try to send message to server (uploads handled here)
  async function trySendToServer(localMsg){
    if(!(window._serverSync && window._serverSync.enabled)) throw new Error('server-sync not available')
    const supabase = window._serverSync.supabase
    const payload = { server_id: localMsg.serverId, channel_id: localMsg.channelId, author_id: localMsg.authorId, content: localMsg.content, ts: new Date(localMsg.ts).toISOString() }
    if(localMsg.replyTo) payload.reply_to = localMsg.replyTo
    if(localMsg.imageFile){
      try{
        const ext = (localMsg.imageFile.name || 'img').split('.').pop()
        const path = `messages/${uid('f')}.${ext}`
        const { error: upErr } = await supabase.storage.from('uploads').upload(path, localMsg.imageFile, { cacheControl: '3600', upsert: false })
        if(upErr) throw upErr
        const { data } = supabase.storage.from('uploads').getPublicUrl(path)
        payload.image_url = data.publicUrl
      }catch(e){ console.warn('image upload failed', e); throw e }
    }
    // call server-sync sendMessage, mapping params expected by it
    const serverRow = await window._serverSync.sendMessage({ serverId: payload.server_id, channelId: payload.channel_id, authorId: payload.author_id, content: payload.content, ts: payload.ts, image_url: payload.image_url, reply_to: payload.reply_to })
    return serverRow
  }

  // deleteMessage function defined earlier
  async function deleteMessage(msg){ const idx = db.messages.findIndex(m=>m.id===msg.id); if(idx!==-1) db.messages.splice(idx,1); saveDB(db); renderAll(); if(msg.remoteId && window._serverSync && window._serverSync.enabled){ try{ await window._serverSync.supabase.from('messages').delete().eq('id', msg.remoteId) }catch(e){ console.warn('server delete failed', e) } } }

  // wire up initial state and hide loading
  loadState(); renderAll(); hideLoadingOverlay();

  // expose for debugging
  window._liumial = { db, state, saveDB, saveState, retrySend }

})();
