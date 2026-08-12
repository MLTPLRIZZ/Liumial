// server-sync.js — Supabase client wrapper for Liumial frontend
// This file enables realtime messaging via Supabase Realtime. If Supabase is not configured
// the client will fall back to localStorage-only mode. Add the CDN in index.html for no-build usage:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/bundle.min.js"></script>

(function(){
  // Configuration: try multiple places for runtime/ build-time env injection
  const SUPABASE_URL = window.__ENV__?.NEXT_PUBLIC_SUPABASE_URL || window.NEXT_PUBLIC_SUPABASE_URL || window.SUPABASE_URL || null;
  const SUPABASE_ANON = window.__ENV__?.NEXT_PUBLIC_SUPABASE_ANON_KEY || window.NEXT_PUBLIC_SUPABASE_ANON_KEY || window.SUPABASE_ANON || null;

  if(!SUPABASE_URL || !SUPABASE_ANON){
    console.warn('server-sync: Supabase not configured. Falling back to localStorage mode.');
    window._serverSync = { enabled: false };
    return;
  }

  // Ensure the supabase library is available. If not, we expect the page to include the CDN bundle.
  const createClient = (window.supabase && window.supabase.createClient) ? window.supabase.createClient : (window.supabase_createClient || null);
  if(!createClient){
    console.warn('server-sync: @supabase/supabase-js not found. Include the CDN script or bundle the package. Falling back to localStorage mode.');
    window._serverSync = { enabled: false };
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { realtime: { params: { eventsPerSecond: 25 } } });

  // Helper: normalize server rows with channels
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
    // Use the channel API (v2) to subscribe to INSERT events on messages table
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

  async function sendMessage(msg){
    try{
      const { data, error } = await supabase.from('messages').insert([{
        server_id: msg.serverId,
        channel_id: msg.channelId,
        author_id: msg.authorId,
        content: msg.content,
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
    return supabase.from('servers').insert([payload]);
  }
  async function createChannel(payload){
    return supabase.from('channels').insert([payload]);
  }
  async function updateProfile(id, patch){
    return supabase.from('profiles').update(patch).eq('id', id);
  }

  window._serverSync = {
    enabled: true,
    supabase,
    fetchInitial,
    onMessage,
    sendMessage,
    createServer,
    createChannel,
    updateProfile
  };

  console.log('server-sync: initialized (Supabase)');
})();
