import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
if (process.env.PORT) config.port = Number(process.env.PORT);
if (process.env.SIGN_API_KEY) config.signApiKey = process.env.SIGN_API_KEY;
if (process.env.TIKTOK_USERNAMES) {
  config.accounts = process.env.TIKTOK_USERNAMES.split(',').map(u => u.trim().replace(/^@/, '')).filter(Boolean).map(username => ({ username, title: process.env.SCENE_TITLE || 'CHÙA ONLINE' }));
}
const DATA_DIR = path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json'
};

const rooms = new Map();

function loadScores(username) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${username}.json`), 'utf8'));
  } catch {
    return {};
  }
}

function saveScores(room) {
  fs.writeFile(path.join(DATA_DIR, `${room.username}.json`), JSON.stringify(room.scores), () => {});
}

function pickAvatar(user) {
  return user?.profilePictureUrl
    || user?.profilePicture?.url?.[0]
    || user?.profilePictureMedium?.url?.[0]
    || user?.avatarThumb?.url?.[0]
    || '';
}

function toUser(user) {
  return {
    id: user?.uniqueId || user?.userId || 'unknown',
    name: user?.nickname || user?.uniqueId || 'Phật tử',
    avatar: pickAvatar(user)
  };
}

function leaderboard(room) {
  return Object.values(room.scores)
    .sort((a, b) => b.points - a.points)
    .slice(0, 5)
    .map(s => ({ name: s.name, points: s.points }));
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const ws of room.clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

function handleGift(room, user, giftName, count, diamonds) {
  const u = toUser(user);
  const points = Math.max(1, diamonds * count * config.pointsPerDiamond);
  const prev = room.scores[u.id] || { name: u.name, points: 0 };
  room.scores[u.id] = { name: u.name, points: prev.points + points };
  saveScores(room);
  broadcast(room, { type: 'gift', user: u, giftName, count, diamonds, value: diamonds * count, points });
  broadcast(room, { type: 'leaderboard', top: leaderboard(room) });
}

function createRoom(account) {
  const room = {
    username: account.username,
    title: account.title || 'CHÙA ONLINE',
    clients: new Set(),
    scores: loadScores(account.username),
    status: 'offline',
    connection: null,
    retryTimer: null
  };
  rooms.set(account.username, room);
  return room;
}

function setStatus(room, status, detail = '') {
  room.status = status;
  console.log(`[${room.username}] ${status}${detail ? ' - ' + detail : ''}`);
  broadcast(room, { type: 'status', status, detail });
}

function connectTikTok(room) {
  clearTimeout(room.retryTimer);
  const options = { enableExtendedGiftInfo: true, fetchRoomInfoOnConnect: false };
  if (config.signApiKey) options.signApiKey = config.signApiKey;
  const conn = new TikTokLiveConnection(room.username, options);
  room.connection = conn;

  conn.on(WebcastEvent.MEMBER, data => {
    broadcast(room, { type: 'join', user: toUser(data.user) });
  });

  conn.on(WebcastEvent.CHAT, data => {
    broadcast(room, { type: 'chat', user: toUser(data.user), text: String(data.comment || '').slice(0, 60) });
  });

  conn.on(WebcastEvent.LIKE, data => {
    broadcast(room, { type: 'like', user: toUser(data.user), count: data.likeCount || 1 });
  });

  conn.on(WebcastEvent.FOLLOW, data => {
    broadcast(room, { type: 'follow', user: toUser(data.user) });
  });

  conn.on(WebcastEvent.GIFT, data => {
    const giftType = data.giftDetails?.giftType;
    if (giftType === 1 && !data.repeatEnd) return;
    const giftName = data.giftDetails?.giftName || data.extendedGiftInfo?.name || 'quà';
    const diamonds = data.giftDetails?.diamondCount || data.extendedGiftInfo?.diamond_count || 1;
    handleGift(room, data.user, giftName, data.repeatCount || 1, diamonds);
  });

  conn.on(ControlEvent.DISCONNECTED, () => {
    setStatus(room, 'offline', 'mất kết nối, thử lại sau 30 giây');
    clearTimeout(room.retryTimer);
    room.retryTimer = setTimeout(() => connectTikTok(room), 30000);
  });

  conn.on(WebcastEvent.STREAM_END, () => {
    setStatus(room, 'offline', 'phiên live đã kết thúc, chờ phiên mới');
    clearTimeout(room.retryTimer);
    room.retryTimer = setTimeout(() => connectTikTok(room), 60000);
  });

  conn.connect()
    .then(state => setStatus(room, 'live', `roomId ${state.roomId}`))
    .catch(err => {
      const name = err?.constructor?.name || 'Error';
      const hint = {
        UserOfflineError: 'TikTok báo tài khoản chưa live (hoặc live chưa công khai)',
        SignatureMissingTokensError: 'máy chủ ký kết nối từ chối, nên thêm signApiKey vào config.json',
        SignatureRateLimitError: 'vượt giới hạn miễn phí, nên thêm signApiKey vào config.json'
      }[name] || 'lỗi kết nối';
      setStatus(room, 'offline', `${name}: ${hint}. Chi tiết: ${String(err?.message || '').slice(0, 160)}. Thử lại sau 20 giây`);
      room.retryTimer = setTimeout(() => connectTikTok(room), 20000);
    });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/scene.html' + url.search });
    return res.end();
  }

  if (url.pathname === '/rooms') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const links = [...rooms.values()]
      .map(r => `<li><a href="/scene.html?room=${encodeURIComponent(r.username)}">${r.username}</a> (${r.status})</li>`)
      .join('');
    return res.end(`<meta charset="utf-8"><h2>Chùa Online - các phòng</h2><ul>${links}</ul><p>Thêm link phòng vào OBS dạng Browser Source, kích thước 1080x1920.</p>`);
  }

  const file = path.normalize(path.join(ROOT, 'public', url.pathname));
  if (!file.startsWith(path.join(ROOT, 'public'))) {
    res.writeHead(403);
    return res.end();
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      return res.end('not found');
    }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const room = rooms.get(url.searchParams.get('room')) || rooms.values().next().value;
  room.clients.add(ws);
  ws.send(JSON.stringify({ type: 'init', title: room.title, maxSeats: config.maxSeats, status: room.status, top: leaderboard(room) }));
  ws.on('close', () => room.clients.delete(ws));
});

for (const account of config.accounts) {
  const room = createRoom(account);
  connectTikTok(room);
}

server.listen(config.port, () => {
  console.log(`Mở http://localhost:${config.port} để vào game, /rooms để xem danh sách phòng`);
});
