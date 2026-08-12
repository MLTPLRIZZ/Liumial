const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get('/health', (req,res)=>res.json({ok:true}));

app.post('/messages', async (req,res)=>{
  try{
    const { server_id, channel_id, author_id, content } = req.body;
    const { rows } = await pool.query('INSERT INTO messages(server_id, channel_id, author_id, content, ts) VALUES($1,$2,$3,$4,now()) RETURNING *', [server_id, channel_id, author_id, content]);
    const msg = rows[0];
    io.to(channel_id).emit('message', msg);
    res.json(msg);
  }catch(e){ console.error(e); res.status(500).json({error:'db error'}); }
});

io.on('connection', socket=>{
  socket.on('join', channelId => socket.join(channelId));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, ()=>console.log('server listening on',PORT));
