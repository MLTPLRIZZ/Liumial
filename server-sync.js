// server-sync.js — Supabase client wrapper for Liumial frontend
// Enhanced: supports image_url, reply_to, public/private servers, invite codes, join/update servers and server change subscriptions
(function(){
  const SUPABASE_URL = window.__ENV__?.NEXT_PUBLIC_SUPABASE_URL || window.NEXT_PUBLIC_SUPABASE_URL || window.SUPABASE_URL || null;
  const SUPABASE_ANON = window.__ENV__?.NEXT_PUBLIC_SUPABASE_ANON_KEY || window.NEXT_PUBLIC_SUPABASE_ANON_KEY || window.SUPABASE_ANON || null;

  if(!SUPABASE_URL || !SUPABASE_ANON){
    console.warn('server-sync: Supabase not configured. Falling back to localStorage mode.');
    window._serverSync = { enabled: false };
    return;
  }

  const createClient = (window.supabase && window.supabase.createClient) ? window.supabase.createClient : (window.supabase_createClient || null);
  if(!createClient){
    console.warn('server-sync: @supabase/supabase-js not found. Include the CDN script or bundle the package. Falling back to localStorage mode.');
    window._serverSync = { enabled: false };
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { realtime: { params: { eventsPerSecond: 25 } } });

  async function fetchInitial(){
    try{
      const { data: servers, error: sErr } = await supabase.from('servers').select('*, channels(*)').order('created_at', { ascending: true });
      if(sErr) throw sErr;
      const { data: users, error: uErr } = await supabase.from('profiles').select('*');
      if(uErr) throw uErr;
      const { data: messages, error: mErr } = await supabase.from('messages').select('*').order('ts', { ascending: true }).limit(1000);
      if(mErr) throw mErr;
      return { servers: servers || [], users: users || [], messages: messages || [] };
    }catch(e){
      console.error('server-sync.fetchInitial error', e);
      return { servers: [], users: [], messages: [] };
    }
  }

  function onMessage(cb){
    try{
      const channel = supabase.channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
          if(cb) cb(payload.new);
        })
        .subscribe();
      return channel;
    }catch(e){
      console.error('server-sync.onMessage error', e);
      return null;
    }
  }

  function onServerChange(cb){
    try{
      const channel = supabase.channel('public:servers')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'servers' }, payload => {
          if(cb) cb(payload.new);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'servers' }, payload => {
          if(cb) cb(payload.new);
        })
        .subscribe();
      return channel;
    }catch(e){
      console.error('server-sync.onServerChange error', e);
      return null;
    }
  }

  async function sendMessage(msg){
    try{
      const { data, error } = await supabase.from('messages').insert([{
        server_id: msg.serverId,
        channel_id: msg.channelId || null,
        conversation_id: msg.conversationId || null,
        author_id: msg.authorId,
        content: msg.content,
        image_url: msg.image_url || null,
        reply_to: msg.reply_to || null,
        ts: msg.ts ? msg.ts : new Date().toISOString()
      }]);
      if(error) throw error;
      return data && data[0];
    }catch(e){
      console.error('server-sync.sendMessage error', e);
      throw e;
    }
  }

  async function createServer(payload){
    // payload should include: id (optional), name, owner_id, channels (array), members (array), public (bool), invite_code (text), roles (json)
    try{
      const rec = Object.assign({}, payload);
      if(!rec.members) rec.members = rec.owner_id ? [rec.owner_id] : [];
      if(!('public' in rec)) rec.public = true;
      if(!rec.roles) rec.roles = {};
      const { data, error } = await supabase.from('servers').insert([rec]).select();
      if(error) throw error;
      return data && data[0];
    }catch(e){
      console.error('server-sync.createServer error', e);
      throw e;
    }
  }

  async function joinServer(serverId, userId, inviteCode){
    try{
      const { data: server, error: fErr } = await supabase.from('servers').select('*').eq('id', serverId).maybeSingle();
      if(fErr) throw fErr;
      if(!server) throw new Error('Server not found');
      if(!server.public){
        if(!inviteCode || inviteCode !== server.invite_code) throw new Error('Invalid invite code');
      }
      const members = server.members || [];
      if(!members.includes(userId)) members.push(userId);
      const { data, error } = await supabase.from('servers').update({ members }).eq('id', serverId).select();
      if(error) throw error;
      return data && data[0];
    }catch(e){
      console.error('server-sync.joinServer error', e);
      throw e;
    }
  }

  async function updateServerRoles(serverId, roles){
    try{
      const { data, error } = await supabase.from('servers').update({ roles }).eq('id', serverId).select();
      if(error) throw error;
      return data && data[0];
    }catch(e){
      console.error('server-sync.updateServerRoles error', e);
      throw e;
    }
  }

  async function updateProfile(id, patch){
    return supabase.from('profiles').update(patch).eq('id', id);
  }

  window._serverSync = {
    enabled: true,
    supabase,
    fetchInitial,
    onMessage,
    onServerChange,
    sendMessage,
    createServer,
    joinServer,
    updateServerRoles,
    updateProfile
  };

  console.log('server-sync: initialized (Supabase)');
});
