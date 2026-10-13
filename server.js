const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

let users = {};
let messages = {};

if (fs.existsSync('database.json')) {
  try {
    const db = JSON.parse(fs.readFileSync('database.json'));
    users = db.users || {}; messages = db.messages || {};
  } catch(e){}
}
function saveDB(){ fs.writeFileSync('database.json', JSON.stringify({users, messages}, null, 2)); }

app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'index.html')));

io.on('connection', socket => {
  socket.on('join', data => {
    users[data.phone] = { id: data.phone, name: data.name, phone: data.phone, socketId: socket.id, online: true };
    socket.userId = data.phone;
    saveDB();
    io.emit('users', Object.values(users));
    socket.emit('myId', data.phone);
  });
  socket.on('getMessages', withUser => {
    const me = socket.userId; const key = [me, withUser].sort().join('_');
    socket.emit('chatHistory', { withUser, msgs: messages[key] || [] });
  });
  socket.on('sendMessage', data => {
    const me = socket.userId; const key = [me, data.to].sort().join('_');
    if(!messages[key]) messages[key] = [];
    const msg = { from: me, to: data.to, text: data.text, time: new Date().toLocaleTimeString(), type: 'text' };
    messages[key].push(msg); saveDB();
    const toUser = users[data.to]; if(toUser) io.to(toUser.socketId).emit('newMessage', msg);
    socket.emit('newMessage', msg);
  });
  // CALL
  socket.on('call-user', data => { const u = users[data.to]; if(u) io.to(u.socketId).emit('incoming-call', { from: socket.userId, fromName: users[socket.userId]?.name, offer: data.offer, isVideo: data.isVideo }); });
  socket.on('answer-call', data => { const u = users[data.to]; if(u) io.to(u.socketId).emit('call-answered', { answer: data.answer }); });
  socket.on('ice-candidate', data => { const u = users[data.to]; if(u) io.to(u.socketId).emit('ice-candidate', data.candidate); });
  socket.on('end-call', data => { const u = users[data.to]; if(u) io.to(u.socketId).emit('call-ended'); });
  socket.on('switch-to-voice', data => { const u = users[data.to]; if(u) io.to(u.socketId).emit('switched-to-voice'); });
  socket.on('switch-to-video', data => { const u = users[data.to]; if(u) io.to(u.socketId).emit('switched-to-video', { offer: data.offer }); });
  socket.on('disconnect', () => { if(socket.userId && users[socket.userId]){ users[socket.userId].online=false; io.emit('users', Object.values(users)); saveDB(); } });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log('LIVE on '+PORT));
