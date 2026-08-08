// Bu dosyayı proje kök dizinine koy (taskflow-api/test-websocket.js)
// Çalıştırma: TEST_ACCESS_TOKEN=eyJ... TEST_WORKSPACE_ID=xxx node test-websocket.js
//
// GÜVENLİK: Access token'ı asla kod içine hardcode etme, commit etme.
// Environment variable ile geçir — bu, testin kendisi kadar kolay ama
// git geçmişine sızma riski taşımaz.

const { io } = require('socket.io-client');

const ACCESS_TOKEN = process.env.TEST_ACCESS_TOKEN;
const WORKSPACE_ID = process.env.TEST_WORKSPACE_ID;

if (!ACCESS_TOKEN || !WORKSPACE_ID) {
  console.error(
    '❌ TEST_ACCESS_TOKEN ve TEST_WORKSPACE_ID environment variable\'ları gerekli.\n' +
    'Örnek: TEST_ACCESS_TOKEN=eyJ... TEST_WORKSPACE_ID=xxx node test-websocket.js',
  );
  process.exit(1);
}

const socket = io('http://localhost:8000', {
  auth: { token: ACCESS_TOKEN },
});

socket.on('connect', () => {
  console.log('✅ Bağlandı:', socket.id);
  socket.emit('workspace:join', { workspaceId: WORKSPACE_ID });
});

socket.on('workspace:joined', (data) => {
  console.log('✅ Workspace odasına katıldı:', data);
});

socket.on('exception', (err) => {
  console.error('❌ Sunucu hatası (muhtemelen yetkisiz erişim):', err);
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