const { io } = require('socket.io-client');

const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbXIxMnJ3YTMwMDBwc3c3NXBiaXZiZ2ozIiwiZW1haWwiOiJuZXduZXdAZ21haWwuY29tIiwiaWF0IjoxNzg2MTAwMjU3LCJleHAiOjE3ODYxMDExNTd9.GGt04rmyyOybPTiSf7uIhMBXyreP2ndQlitrlyzvzPQ';
const WORKSPACE_ID = 'cmrajtgs90002jfkoh1sil9bt';

const socket = io('http://localhost:8000', {
  auth: { token: ACCESS_TOKEN },
});

socket.on('connect', () => {
  console.log('✅ Bağlandı:', socket.id);
  socket.emit('workspace:join', { workspaceId: WORKSPACE_ID });
});

// NestJS'te { event, data } formatında return edilen değerler, emit'in
// callback'ine değil, ayrı bir event olarak client'a geri gönderilir —
// bu yüzden ack callback yerine bu event'i dinliyoruz.
socket.on('workspace:joined', (data) => {
  console.log('✅ Workspace odasına katıldı:', data);
});

socket.on('task:created', (task) => {
  console.log('📩 task:created event alındı:', task);
});

socket.on('task:updated', (task) => {
  console.log('📩 task:updated event alındı:', task);
});

socket.on('connect_error', (err) => {
  console.error('❌ Bağlantı hatası:', err.message);
});

socket.on('disconnect', () => {
  console.log('🔌 Bağlantı kesildi');
});