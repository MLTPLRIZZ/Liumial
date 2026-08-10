// app.js — client-only chat app using localStorage
(() => {
  // Simple local DB stored in localStorage under "liumial_db_v1"
  const DB_KEY = 'liumial_db_v1';

  const defaultState = () => ({
    users: [], // {id, username, displayName, password, avatarColor, bg, bio, xp, badges}
    servers: [], // {id,name,ownerId,channels: [{id,name}], members: [userId], createdAt}
    messages: [], // {id,serverId,channelId,authorId,content,ts}
    quests: [], // quest templates
    createdAt: Date.now()
  });

  function loadDB(){
    try{
      const raw = localStorage.getItem(DB_KEY);
      if(!raw) return defaultState();
      return JSON.parse(raw);
    }catch(e){console.error('DB load',e);return defaultState();}
  }
  function saveDB(db){
    localStorage.setItem(DB_KEY,JSON.stringify(db));
  }

  const db = loadDB();

  // Utilities
  function uid(prefix='id'){return prefix+Math.random().toString(36).slice(2,9)}
  function now(){return Date.now()}
  function findUserByUsername(u){return db.users.find(x=>x.username.toLowerCase()===u.toLowerCase())}
  function hash(p){return btoa(p)} // tiny obfuscation only

  // Seed initial data if empty
  if(db.users.length===0){
    const bot = {id:uid('u'),username:'HelperBot',displayName:'Helper Bot',password:hash('bot'),avatarColor:'#6ee7b7',bg:'linear-gradient(90deg,#0ea5a7,#6ee7b7)',bio:'Community helper',xp:100,badges:['bot']}
    const admin = {id:uid('u'),username:'admin',displayName:'Admin',password:hash('admin'),avatarColor:'#f97316',bg:'#071226',bio:'I run this demo',xp:200,badges:['founder']}
    db.users.push(bot,admin)
    const server = {id:uid('s'),name:'Welcome Server',ownerId:admin.id,channels:[{id:uid('c'),name:'general'},{id:uid('c'),name:'quests'}],members:[admin.id,bot.id],createdAt:now()}
    db.servers.push(server)
    db.messages.push({id:uid('m'),serverId:server.id,channelId:server.channels[0].id,authorId:bot.id,content:'Welcome! Type /help for commands or introduce yourself to get quests.',ts:now()})
    db.quests = [
      {id:'q1',title:'Introduce Yourself',desc:'Send a message in #general introducing yourself',reward:20,check:({messages,userId,server})=> messages.some(m=>m.authorId===userId && (m.content.toLowerCase().includes('hi')||m.content.toLowerCase().includes('hello')))},
      {id:'q2',title:'Customize Profile',desc:'Change your profile background or color',reward:10,check:({user})=>!!user.bg||!!user.avatarColor},
      {id:'q3',title:'Send First Message',desc:'Send your first message anywhere',reward:5,check:({messages,userId})=> messages.some(m=>m.authorId===userId)}
    ]
    saveDB(db)
  }

  // App state
  let state = {
    currentUserId: null,
    currentServerId: db.servers[0]?.id,
    currentChannelId: db.servers[0]?.channels[0]?.id
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

  // Render utilities
  function renderAuth(){
    authArea.innerHTML = ''
    if(state.currentUserId){
      const u = db.users.find(x=>x.id===state.currentUserId)
      const el = document.createElement('div')
      el.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div style="width:44px;height:44px;border-radius:8px;background:${u.avatarColor};display:flex;align-items:center;justify-content:center;font-weight:700">${u.displayName[0]||u.username[0]}</div><div><div style="font-weight:700">${u.displayName}</div><div class="small-muted">@${u.username}</div></div></div>`
      authArea.appendChild(el)
    }else{
      const btnLogin = document.createElement('button')
      btnLogin.className='btn'
      btnLogin.textContent='Log in / Sign up'
      btnLogin.onclick = showAuthModal
      authArea.appendChild(btnLogin)
    }
  }

  function renderServers(){
    serversList.innerHTML=''
    db.servers.forEach(s=>{
      const item = document.createElement('div')
      item.className='server-item'
      if(s.id===state.currentServerId) item.classList.add('active')
      item.textContent = s.name + ' ('+s.members.length+')'
      item.onclick = ()=>{state.currentServerId=s.id; state.currentChannelId=s.channels[0]?.id; renderAll()}
      serversList.appendChild(item)
    })
  }

  function renderChannels(){
    channelsList.innerHTML=''
    const s = db.servers.find(x=>x.id===state.currentServerId)
    if(!s){channelsList.innerHTML='<div class="small-muted">No server selected</div>';serverTitle.textContent='No server';return}
    serverTitle.textContent = s.name
    s.channels.forEach(ch=>{
      const el = document.createElement('div')
      el.className='channel-item'
      if(ch.id===state.currentChannelId) el.classList.add('active')
      el.textContent = '# '+ch.name
      el.onclick = ()=>{state.currentChannelId=ch.id;renderAll()}
      channelsList.appendChild(el)
    })
    const add = document.createElement('button')
    add.className='btn'
    add.textContent='New Channel'
    add.onclick = ()=>createChannelModal(s)
    channelsList.appendChild(add)
  }

  function renderMessages(){
    messagesEl.innerHTML=''
    const msgs = db.messages.filter(m=>m.serverId===state.currentServerId && m.channelId===state.currentChannelId).sort((a,b)=>a.ts-b.ts)
    msgs.forEach(m=>{
      const author = db.users.find(u=>u.id===m.authorId) || {displayName:'Unknown',avatarColor:'#64748b'}
      const me = (m.authorId===state.currentUserId)
      const div = document.createElement('div')
      div.className = 'message' + (me? ' me':'')
      div.innerHTML = `<div class="meta"><strong>${author.displayName}</strong> <span class="small-muted">@${author.username} • ${new Date(m.ts).toLocaleTimeString()}</span></div><div class="body">${escapeHtml(m.content)}</div>`
      messagesEl.appendChild(div)
    })
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  function escapeHtml(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

  function renderProfilePanel(){
    profilePanel.innerHTML=''
    if(!state.currentUserId){profilePanel.innerHTML='<div class="small-muted">Log in to see your profile and customize it.</div>';return}
    const u = db.users.find(x=>x.id===state.currentUserId)
    const html = `<div style="display:flex;gap:10px;align-items:center"><div style="width:64px;height:64px;border-radius:10px;background:${u.avatarColor};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px">${u.displayName[0]||u.username[0]}</div><div><div style="font-weight:700">${u.displayName}</div><div class="small-muted">@${u.username}</div></div></div><div style="margin-top:10px">Bio: <div>${escapeHtml(u.bio||'')}</div></div><div style="margin-top:8px"><strong>XP:</strong> ${u.xp||0}</div><div style="margin-top:8px"><strong>Badges:</strong> ${ (u.badges||[]).map(b=>`<span class="badge">${b}</span>`).join(' ') }</div><div style="margin-top:10px"><button class="btn" id="edit-profile-btn">Edit Profile</button></div>`
    profilePanel.innerHTML = html
    document.getElementById('edit-profile-btn').onclick = showEditProfile
  }

  function renderProfileCompact(){
    profileCompact.innerHTML=''
    if(!state.currentUserId) return
    const u = db.users.find(x=>x.id===state.currentUserId)
    profileCompact.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div style="width:36px;height:36px;border-radius:8px;background:${u.avatarColor};display:flex;align-items:center;justify-content:center;font-weight:700">${u.displayName[0]||u.username[0]}</div><div style="flex:1"><div style="font-weight:700">${u.displayName}</div><div class="small-muted">@${u.username}</div></div><button class="btn small" id="logout-btn">Log out</button></div>`
    document.getElementById('logout-btn').onclick = ()=>{state.currentUserId=null;renderAll();saveState()
    }
  }

  function renderQuests(){
    questsPanel.innerHTML=''
    const list = db.quests || []
    questsPanel.innerHTML = '<h3>Quests</h3>'
    list.forEach(q=>{
      const el = document.createElement('div')
      el.style.marginBottom='8px'
      const done = checkQuestDone(q.id)
      el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${q.title}</strong><div class="small-muted">${q.desc}</div></div><div>${done?'<span class="tag">Completed</span>':'<button class="btn small start-quest">Start</button>'}</div></div>`
      questsPanel.appendChild(el)
      if(!done){el.querySelector('.start-quest').onclick = ()=>{alert('Quest started: '+q.title)} }
    })
  }

  function checkQuestDone(qid){
    if(!state.currentUserId) return false
    const q = db.quests.find(x=>x.id===qid)
    const user = db.users.find(u=>u.id===state.currentUserId)
    const messages = db.messages
    try{return q.check({messages,userId:state.currentUserId,user,server:db.servers.find(s=>s.id===state.currentServerId)})}catch(e){return false}
  }

  // Message sending & helper bot
  messageForm.addEventListener('submit',e=>{
    e.preventDefault()
    const text = messageInput.value.trim()
    if(!text) return
    if(!state.currentUserId){alert('Log in to send messages');return}
    const msg = {id:uid('m'),serverId:state.currentServerId,channelId:state.currentChannelId,authorId:state.currentUserId,content:text,ts:now()}
    db.messages.push(msg)
    saveDB(db)
    messageInput.value=''
    runPostMessageTriggers(msg)
    renderAll()
  })

  function runPostMessageTriggers(msg){
    // check quests
    db.quests.forEach(q=>{
      if(checkQuestDone(q.id)){
        const u = db.users.find(x=>x.id===msg.authorId)
        if(!u._completed) u._completed = {}
        if(!u._completed[q.id]){
          u._completed[q.id]=true
          u.xp = (u.xp||0) + (q.reward||0)
          (u.badges = u.badges||[]).push('q:'+q.id)
          db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:db.users[0].id,content:`Congrats ${u.displayName}! You completed quest: ${q.title} and earned ${q.reward} XP.`,ts:now()})
        }
      }
    })

    // helper bot simple commands
    const content = msg.content
    if(content.startsWith('/')){
      handleCommand(msg,content)
    }else{
      // if someone says 'help' or mentions HelperBot, bot replies
      if(/help|assist|how do/i.test(content) || content.toLowerCase().includes('helperbot')){
        const botReply = {id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:db.users[0].id,content:`I am HelperBot — try /help to see commands, or /quests to view quests.`,ts:now()+50}
        db.messages.push(botReply)
      }
    }
    saveDB(db)
  }

  function handleCommand(msg,content){
    const parts = content.slice(1).split(' ')
    const cmd = parts[0].toLowerCase()
    const args = parts.slice(1)
    const botId = db.users[0].id
    if(cmd==='help'){
      db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:botId,content:'Commands: /help /quests /profile /recommend /bg <color or gradient> ',ts:now()+60})
    }else if(cmd==='quests'){
      const list = db.quests.map(q=>`- ${q.title}: ${q.desc}`).join('\n')
      db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:botId,content:'Quests:\n'+list,ts:now()+60})
    }else if(cmd==='profile'){
      const u = db.users.find(x=>x.id===msg.authorId)
      db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:botId,content:`Profile for ${u.displayName}: XP ${u.xp||0}, badges ${(u.badges||[]).join(', ')}`,ts:now()+60})
    }else if(cmd==='recommend'){
      db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:botId,content:'Recommendation: Customize your profile background, complete quests, and invite friends!',ts:now()+60})
    }else if(cmd==='bg'){
      if(!state.currentUserId){db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:botId,content:'Log in to change your background.',ts:now()+60});return}
      const val = args.join(' ')
      const u = db.users.find(x=>x.id===state.currentUserId)
      if(!u){return}
      u.bg = val
      saveDB(db)
      db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:botId,content:`Background updated to ${val}`,ts:now()+60})
    } else {
      db.messages.push({id:uid('m'),serverId:msg.serverId,channelId:msg.channelId,authorId:botId,content:`Unknown command: ${cmd}. Use /help.`,ts:now()+60})
    }
  }

  // Modals & UI actions
  function showAuthModal(){
    showModal(`<h3>Log in / Sign up</h3>
      <div style="display:flex;gap:8px;margin-top:8px"><input id="auth-username" class="input" placeholder="username" /><input id="auth-password" type="password" class="input" placeholder="password" /></div>
      <div style="margin-top:8px;display:flex;gap:8px"><button class="btn" id="auth-login">Log in</button><button class="btn" id="auth-signup">Sign up</button></div>
      <div class="small-muted footer-note">This demo stores accounts and data locally in your browser (localStorage). Not secure for production.</div>`)
    document.getElementById('auth-login').onclick = ()=>{
      const u = document.getElementById('auth-username').value.trim()
      const p = document.getElementById('auth-password').value
      const found = findUserByUsername(u)
      if(!found){alert('User not found — sign up instead') ; return}
      if(found.password!==hash(p)){alert('Wrong password');return}
      state.currentUserId = found.id
      closeModal(); renderAll(); saveState()
    }
    document.getElementById('auth-signup').onclick = ()=>{
      const u = document.getElementById('auth-username').value.trim()
      const p = document.getElementById('auth-password').value
      if(!u || !p){alert('Choose username and password');return}
      if(findUserByUsername(u)){alert('Username taken');return}
      const newUser = {id:uid('u'),username:u,displayName:u,password:hash(p),avatarColor:randomColor(),bg:'',bio:'',xp:0,badges:[]}
      db.users.push(newUser)
      saveDB(db)
      state.currentUserId = newUser.id
      closeModal(); renderAll(); saveState()
    }
  }

  function showEditProfile(){
    const u = db.users.find(x=>x.id===state.currentUserId)
    showModal(`<h3>Edit Profile</h3>
      <div style="display:flex;flex-direction:column;gap:8px"><input id="ep-display" class="input" value="${escapeHtml(u.displayName||'')}" placeholder="Display name" /><input id="ep-bio" class="input" value="${escapeHtml(u.bio||'')}" placeholder="Short bio" /><div style="display:flex;gap:8px;align-items:center"><div>Avatar color:</div><input id="ep-color" type="color" value="${u.avatarColor||'#6ee7b7'}" /></div><div style="display:flex;gap:8px;align-items:center"><div>Background (any CSS):</div><input id="ep-bg" class="input" value="${escapeHtml(u.bg||'')}" placeholder="e.g. linear-gradient(...) or #123456" /></div><div style="display:flex;gap:8px"><button class="btn" id="save-profile">Save</button><button class="btn" id="cancel-profile">Cancel</button></div></div>`)
    document.getElementById('save-profile').onclick = ()=>{
      u.displayName = document.getElementById('ep-display').value || u.displayName
      u.bio = document.getElementById('ep-bio').value
      u.avatarColor = document.getElementById('ep-color').value
      u.bg = document.getElementById('ep-bg').value
      saveDB(db); closeModal(); renderAll(); saveState()
    }
    document.getElementById('cancel-profile').onclick = closeModal
  }

  function createChannelModal(server){
    showModal(`<h3>New Channel in ${server.name}</h3><input id="new-channel-name" class="input" placeholder="channel name" /><div style="margin-top:8px"><button class="btn" id="create-channel-do">Create</button></div>`)
    document.getElementById('create-channel-do').onclick = ()=>{
      const name = document.getElementById('new-channel-name').value.trim()||'new'
      server.channels.push({id:uid('c'),name})
      saveDB(db); closeModal(); renderAll(); saveState()
    }
  }

  function createServerModal(){
    showModal(`<h3>Create Server</h3><input id="new-server-name" class="input" placeholder="Server name" /><div style="margin-top:8px"><button class="btn" id="create-server-do">Create</button></div>`)
    document.getElementById('create-server-do').onclick = ()=>{
      const name = document.getElementById('new-server-name').value.trim()||'New Server'
      const ownerId = state.currentUserId || db.users[1].id
      const s = {id:uid('s'),name,ownerId,channels:[{id:uid('c'),name:'general'}],members:[ownerId],createdAt:now()}
      db.servers.push(s)
      saveDB(db); closeModal(); state.currentServerId=s.id; state.currentChannelId=s.channels[0].id; renderAll(); saveState()
    }
  }

  createServerBtn.onclick = ()=>createServerModal()

  // Modal helpers
  function showModal(innerHtml){
    modalRoot.innerHTML = `<div class="modal-backdrop"></div><div class="modal">${innerHtml}</div>`
    modalRoot.querySelector('.modal-backdrop').onclick = closeModal
  }
  function closeModal(){modalRoot.innerHTML=''}

  // Settings / Theme
  openSettings.onclick = ()=>{
    showModal(`<h3>Settings & Theme</h3>
      <div class="setting-row">Accent color: <input id="set-accent" type="color" value="#6ee7b7" /></div>
      <div class="setting-row">Background color: <input id="set-bg" type="color" value="#071226" /></div>
      <div class="setting-row">Or enter gradient CSS: <input id="set-gradient" class="input" placeholder="linear-gradient(90deg,#123,#456)" /></div>
      <div style="margin-top:8px"><button class="btn" id="apply-theme">Apply</button></div>
      <div class="small-muted footer-note">You can set a single color or complex gradient (CSS) for your profile background via /bg command.</div>`)
    document.getElementById('apply-theme').onclick = ()=>{
      const accent = document.getElementById('set-accent').value
      const bgc = document.getElementById('set-bg').value
      const grad = document.getElementById('set-gradient').value
      if(grad){document.documentElement.style.setProperty('--bg', bgc); document.body.style.background = grad}
      else{document.documentElement.style.setProperty('--accent', accent); document.body.style.background = `linear-gradient(180deg, ${bgc} 0%, #071226 100%)`}
      closeModal()
    }
  }

  // Helpers
  function saveState(){
    try{localStorage.setItem('liumial_ui_state',JSON.stringify(state))}catch(e){console.warn(e)}
  }
  function loadState(){
    try{const s = JSON.parse(localStorage.getItem('liumial_ui_state')||'{}');state=Object.assign(state,s)}catch(e){}
  }
  function randomColor(){
    return ['#6ee7b7','#60a5fa','#f97316','#f472b6','#a78bfa'][Math.floor(Math.random()*5)]
  }

  // Initial render
  function renderAll(){
    renderAuth();renderServers();renderChannels();renderMessages();renderProfilePanel();renderProfileCompact();renderQuests()
    // apply profile bg if user has
    if(state.currentUserId){
      const u = db.users.find(x=>x.id===state.currentUserId)
      if(u?.bg) document.body.style.background = u.bg
    }
  }

  // load saved UI state and render
  loadState(); renderAll()

  // Expose for debugging
  window._liumial = {db,state,saveDB,saveState}

})();
