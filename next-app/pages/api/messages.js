// pages/api/messages.js — example Next API route using service role (server-side only)
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE)

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).end();
  const { server_id, channel_id, author_id, content } = req.body;
  const { data, error } = await supabase.from('messages').insert([{ server_id, channel_id, author_id, content }]);
  if(error) return res.status(500).json({error});
  res.status(200).json(data[0]);
}
