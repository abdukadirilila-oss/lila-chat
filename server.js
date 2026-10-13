const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8, cors: { origin: "*" } });

app.use(express.static(__dirname));
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');

// Unda database kama haipo
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ messages: [], users: [] }, null, 2));
}

function getDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

let onlineUsers = [];

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// API ya kupata meseji zote zilizohifadhiwa
app.get('/api/messages', (req, res) => {
  const db = getDB();
  res.json(db.messages);
});

// API ya kufuta meseji
app.delete('/api/messages/:id', (req, res) => {
  const db = getDB();
  db.messages = db.messages.filter(m => m.id!== req.params.id);
  saveDB(db);
  io.emit('message_deleted', req.params.id);
  res.json({ success: true });
});

io.on('connection', (socket) => {

  socket.on('join', (userData) => {
    const { name, phone } = userData;
    onlineUsers = onlineUsers.filter(u => u.id!== socket.id);
    onlineUsers.push({ id: socket.id, name, phone });

    // Hifadhi user kwenye DB
    const db = getDB();
    if (!db.users.find(u => u.phone === phone)) {
      db.users.push({ name, phone, joined: new Date().toISOString() });
      saveDB(db);
    }

    io.emit('online_list', onlineUsers);

    // Tuma meseji zote zilizohifadhiwa kwa user mpya
    socket.emit('load_old_messages', db.messages);
  });

  socket.on('send_message', (data) => {
    const db = getDB();
    const msg = {...data, id: Date.now().toString(), type: 'text' };
    db.messages.push(msg);
    // Hifadhi meseji 1000 za mwisho tu
    if (db.messages.length > 1000) db.messages = db.messages.slice(-1000);
    saveDB(db);

    io.emit('receive_message', msg);
  });

  socket.on('send_file', (data) => {
    const db = getDB();
    const msg = {...data, id: Date.now().toString(), type: 'file' };
    db.messages.push(msg);
    if (db.messages.length > 1000) db.messages = db.messages.slice(-1000);
    saveDB(db);

    io.emit('receive_file', msg);
  });

  socket.on('delete_message', (id) => {
    const db = getDB();
    db.messages = db.messages.filter(m => m.id!== id);
    saveDB(db);
    io.emit('message_deleted', id);
  });

  // Calls
  socket.on('call_user', (data) => io.to(data.to).emit('incoming_call', { from: socket.id, fromName: onlineUsers.find(u=>u.id===socket.id)?.name, offer: data.offer, type: data.type }));
  socket.on('answer_call', (data) => io.to(data.to).emit('call_answered', { answer: data.answer }));
  socket.on('ice_candidate', (data) => io.to(data.to).emit('ice_candidate', { candidate: data.candidate }));
  socket.on('end_call', (data) => io.to(data.to).emit('call_ended'));

  socket.on('disconnect', () => {
    onlineUsers = onlineUsers.filter(u => u.id!== socket.id);
    io.emit('online_list', onlineUsers);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT,()=>console.log("✅ LILA LIVE kwenye port "+PORT));