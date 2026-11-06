const W = 1080, H = 1920;
const canvas = document.getElementById('c');
const g = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const ROOM = params.get('room') || '';

const state = {
  title: 'CHÙA ONLINE',
  status: 'offline',
  maxSeats: 120,
  top: [],
  viewers: new Map(),
  seats: [],
  queue: [],
  current: null,
  banner: null,
  petals: [],
  smoke: [],
  hearts: [],
  time: 0
};

const BLESSINGS = [
  'Thân tâm an lạc, vạn sự bình an',
  'Gia đạo hòa thuận, sức khỏe dồi dào',
  'Học hành tấn tới, công việc hanh thông',
  'Lòng nhẹ như mây, tâm sáng như trăng',
  'Gieo nhân lành, gặt quả ngọt',
  'Phiền não tiêu tan, trí tuệ khai mở',
  'Cha mẹ mạnh khỏe, người thân bình an'
];

const ROBE_COLORS = ['#9fb3d1', '#b7c4dc', '#a9b7a0', '#c2b6d6', '#d9d2c3', '#8fa9c9', '#b9c9b0', '#cbbfe0'];

const camera = { x: W / 2, y: H / 2, z: 1, tween: null };
const ALTAR = { x: W / 2, y: 700 };
const KNEEL = { x: W / 2, y: 1240 };
const avatarCache = new Map();

function buildSeats() {
  const rows = 9, perSide = 6;
  const top = 1290, bottom = 1850;
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = top + (bottom - top) * t;
    const s = 0.8 + 0.32 * t;
    const gap = 190;
    const spacing = 58 * s;
    for (let side = -1; side <= 1; side += 2) {
      for (let c = 0; c < perSide; c++) {
        const x = W / 2 + side * (gap + spacing * (c + 0.5));
        if (x < 30 || x > W - 30) continue;
        state.seats.push({ x, y, s, taken: null });
      }
    }
  }
  state.seats.sort((a, b) => a.y - b.y || Math.abs(a.x - W / 2) - Math.abs(b.x - W / 2));
}

function getAvatar(url) {
  if (!url) return null;
  if (avatarCache.has(url)) return avatarCache.get(url);
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.src = url;
  avatarCache.set(url, img);
  if (avatarCache.size > 400) avatarCache.delete(avatarCache.keys().next().value);
  return img;
}

function hashColor(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ROBE_COLORS[Math.abs(h) % ROBE_COLORS.length];
}

function freeSeat() {
  const limit = Math.min(state.maxSeats, state.seats.length);
  for (let i = 0; i < limit; i++) if (!state.seats[i].taken) return state.seats[i];
  let oldest = null;
  for (const v of state.viewers.values()) {
    if (v === state.current?.viewer || v.points > 0) continue;
    if (!oldest || v.lastActive < oldest.lastActive) oldest = v;
  }
  if (!oldest) {
    for (const v of state.viewers.values()) {
      if (v === state.current?.viewer) continue;
      if (!oldest || v.lastActive < oldest.lastActive) oldest = v;
    }
  }
  if (!oldest) return null;
  state.viewers.delete(oldest.id);
  oldest.seat.taken = null;
  return oldest.seat;
}

function ensureViewer(user) {
  let v = state.viewers.get(user.id);
  if (v) {
    v.lastActive = performance.now();
    if (user.avatar) v.avatar = user.avatar;
    if (user.name) v.name = user.name;
    return v;
  }
  const seat = freeSeat();
  if (!seat) return null;
  v = {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    color: hashColor(user.id),
    bun: hashColor(user.id + 'b') > '#b',
    seat,
    x: seat.x, y: seat.y, s: seat.s,
    mode: 'sit',
    bow: 0,
    pray: 0,
    bubble: null,
    points: 0,
    glow: 0,
    appear: 0,
    lastActive: performance.now()
  };
  seat.taken = v;
  state.viewers.set(user.id, v);
  return v;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function moveCamera(x, y, z, duration) {
  camera.tween = { fx: camera.x, fy: camera.y, fz: camera.z, tx: x, ty: y, tz: z, t: 0, d: duration };
}

function clampCamera() {
  const halfW = W / 2 / camera.z, halfH = H / 2 / camera.z;
  camera.x = Math.min(Math.max(camera.x, halfW), W - halfW);
  camera.y = Math.min(Math.max(camera.y, halfH), H - halfH);
}

function enqueueGift(msg) {
  const v = ensureViewer(msg.user);
  if (!v) return;
  v.points += msg.points;
  state.queue.push({ viewer: v, msg });
}

const BIG_GIFT_XU = 10;

function giftValue(msg) {
  if (typeof msg.value === 'number') return msg.value;
  return (msg.diamonds || 1) * (msg.count || 1);
}

function startNextGift() {
  const item = state.queue.shift();
  if (!item) return;
  const fast = state.queue.length > 4;
  const big = giftValue(item.msg) >= BIG_GIFT_XU;
  const v = item.viewer;
  item.phase = 'zoom';
  item.t = 0;
  item.speed = fast ? 2 : 1;
  item.big = big;
  item.blessing = BLESSINGS[Math.floor(Math.random() * BLESSINGS.length)];
  state.current = item;
  v.glow = 1;
  v.lastActive = performance.now();
  moveCamera(v.x, v.y - 60, 2.4, 1.1 / item.speed);
  TempleAudio.bell(big ? 3 : 1);
  state.banner = {
    name: v.name,
    avatar: v.avatar,
    line1: `dâng ${item.msg.count} ${item.msg.giftName}`,
    line2: item.blessing,
    points: item.msg.points,
    t: 0,
    d: (big ? 9 : 6.5) / item.speed
  };
}

function updateGift(dt) {
  const item = state.current;
  if (!item) {
    if (state.queue.length) startNextGift();
    return;
  }
  const v = item.viewer;
  item.t += dt * item.speed;

  if (item.phase === 'zoom' && item.t > 1.4) {
    item.phase = 'walk';
    item.t = 0;
    v.mode = 'walk';
    item.from = { x: v.x, y: v.y, s: v.s };
    item.to = { x: KNEEL.x, y: KNEEL.y, s: 0.72 };
  } else if (item.phase === 'walk') {
    const p = Math.min(item.t / 2.4, 1);
    const e = easeInOut(p);
    const midX = W / 2;
    const toCarpet = Math.min(p / 0.25, 1);
    v.x = p < 0.25 ? item.from.x + (midX - item.from.x) * easeInOut(toCarpet) : midX;
    v.y = item.from.y + (item.to.y - item.from.y) * e;
    v.s = item.from.s + (item.to.s - item.from.s) * e;
    camera.x = v.x;
    camera.y = v.y - 160;
    camera.z = 2.4 - 0.6 * e;
    camera.tween = null;
    if (p >= 1) {
      item.phase = 'bow';
      item.t = 0;
      v.mode = 'bow';
      for (let i = 0; i < 25; i++) spawnPetal(true);
    }
  } else if (item.phase === 'bow') {
    v.bow = Math.max(0, Math.sin((item.t / 3) * Math.PI * 3));
    if (Math.random() < 0.5) burnerSmoke();
    if (item.t > 3) {
      v.bow = 0;
      item.phase = 'back';
      item.t = 0;
      moveCamera(W / 2, H / 2, 1, 1.2 / item.speed);
    }
  } else if (item.phase === 'back') {
    if (item.t > 0.3 && v.mode !== 'return') {
      v.mode = 'return';
      v.returnFrom = { x: v.x, y: v.y, s: v.s };
      v.returnT = 0;
    }
    if (item.t > 1.3) {
      state.current = null;
    }
  }
}

function updateViewers(dt) {
  for (const v of state.viewers.values()) {
    v.appear = Math.min(1, v.appear + dt * 2);
    if (v.glow > 0 && v !== state.current?.viewer) v.glow = Math.max(0, v.glow - dt * 0.3);
    if (v.pray > 0) v.pray = Math.max(0, v.pray - dt * 0.5);
    if (v.bubble) {
      v.bubble.t -= dt;
      if (v.bubble.t <= 0) v.bubble = null;
    }
    if (v.mode === 'return') {
      v.returnT += dt / 1.8;
      const e = easeInOut(Math.min(v.returnT, 1));
      v.x = v.returnFrom.x + (v.seat.x - v.returnFrom.x) * e;
      v.y = v.returnFrom.y + (v.seat.y - v.returnFrom.y) * e;
      v.s = v.returnFrom.s + (v.seat.s - v.returnFrom.s) * e;
      if (v.returnT >= 1) v.mode = 'sit';
    }
  }
}

function spawnPetal(burst) {
  state.petals.push({
    x: burst ? ALTAR.x + (Math.random() - 0.5) * 400 : Math.random() * W,
    y: burst ? ALTAR.y - 300 - Math.random() * 200 : -20,
    vx: (Math.random() - 0.5) * 30,
    vy: 40 + Math.random() * 50,
    r: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 3,
    size: 6 + Math.random() * 6,
    life: 12
  });
}

function burnerSmoke() {
  const p = BURNERS[Math.random() < 0.5 ? 0 : 1];
  spawnSmoke(p.x + (Math.random() - 0.5) * 40, p.y - 150);
}

function spawnSmoke(x, y) {
  state.smoke.push({ x, y, vx: (Math.random() - 0.5) * 8, vy: -25 - Math.random() * 20, size: 6, life: 3, max: 3 });
}

function updateParticles(dt) {
  if (Math.random() < dt * 1.2) spawnPetal(false);
  if (Math.random() < dt * 6) burnerSmoke();
  for (const p of state.petals) {
    p.x += (p.vx + Math.sin(state.time + p.r) * 15) * dt;
    p.y += p.vy * dt;
    p.r += p.vr * dt;
    p.life -= dt;
  }
  state.petals = state.petals.filter(p => p.life > 0 && p.y < H + 20);
  for (const s of state.smoke) {
    s.x += (s.vx + Math.sin(state.time * 1.5 + s.y * 0.02) * 10) * dt;
    s.y += s.vy * dt;
    s.size += dt * 14;
    s.life -= dt;
  }
  state.smoke = state.smoke.filter(s => s.life > 0);
  for (const h of state.hearts) {
    h.y -= 60 * dt;
    h.life -= dt;
  }
  state.hearts = state.hearts.filter(h => h.life > 0);
  if (state.petals.length > 200) state.petals.splice(0, state.petals.length - 200);
}

function updateCamera(dt) {
  const tw = camera.tween;
  if (tw) {
    tw.t += dt;
    const e = easeInOut(Math.min(tw.t / tw.d, 1));
    camera.x = tw.fx + (tw.tx - tw.fx) * e;
    camera.y = tw.fy + (tw.ty - tw.fy) * e;
    camera.z = tw.fz + (tw.tz - tw.fz) * e;
    if (tw.t >= tw.d) camera.tween = null;
  }
  clampCamera();
}

const bg = document.createElement('canvas');
bg.width = W;
bg.height = H;
const vignette = document.createElement('canvas');
vignette.width = W;
vignette.height = H;

const ALTAR_IMG = { y: 90, h: 900 };
const altarImg = new Image();
altarImg.src = 'img/altar.jpg';
altarImg.onload = () => drawBackground();

const MONK = { x: W / 2, bottom: 1200, w: 340 };
const monkVideo = document.createElement('video');
monkVideo.src = 'video/monk.webm';
monkVideo.muted = true;
monkVideo.loop = true;
monkVideo.playsInline = true;
monkVideo.autoplay = true;
monkVideo.addEventListener('canplay', () => monkVideo.play().catch(() => {}), { once: true });
setInterval(() => {
  if (monkVideo.paused && monkVideo.readyState >= 2) monkVideo.play().catch(() => {});
}, 3000);

const BURNERS = [{ x: W / 2 - 290, y: 1150 }, { x: W / 2 + 290, y: 1150 }];
const SPARKLES = Array.from({ length: 26 }, () => ({
  x: 260 + Math.random() * 560,
  y: 120 + Math.random() * 560,
  p: Math.random() * Math.PI * 2,
  sp: 0.8 + Math.random() * 1.6,
  r: 6 + Math.random() * 9
}));
const HALOS = [
  { x: 540, y: 300, r: 120 }, { x: 540, y: 470, r: 90 }, { x: 540, y: 690, r: 80 },
  { x: 370, y: 470, r: 70 }, { x: 710, y: 470, r: 70 }
];

function goldGradient(c, x0, y0, x1, y1) {
  const gr = c.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, '#fff1b8');
  gr.addColorStop(0.35, '#f0c457');
  gr.addColorStop(0.65, '#b9822a');
  gr.addColorStop(1, '#ffe08a');
  return gr;
}

function drawFloor(b) {
  const top = 940;
  const gr = b.createLinearGradient(0, top, 0, H);
  gr.addColorStop(0, '#6e4325');
  gr.addColorStop(1, '#a8754a');
  b.fillStyle = gr;
  b.fillRect(0, top, W, H - top);

  let y = top, step = 18, row = 0;
  while (y < H) {
    const ny = y + step;
    b.fillStyle = row % 2 ? 'rgba(255,220,170,.05)' : 'rgba(60,30,10,.06)';
    b.fillRect(0, y, W, step);
    b.strokeStyle = 'rgba(50,25,10,.35)';
    b.lineWidth = 1.5;
    b.beginPath();
    b.moveTo(0, ny);
    b.lineTo(W, ny);
    b.stroke();
    const off = (row * 137) % 260;
    for (let x = -off; x < W; x += 260) {
      b.beginPath();
      b.moveTo(x, y);
      b.lineTo(x, ny);
      b.stroke();
    }
    y = ny;
    step *= 1.14;
    row++;
  }
  const refl = b.createRadialGradient(W / 2, top + 40, 20, W / 2, top + 40, 620);
  refl.addColorStop(0, 'rgba(255,215,130,.45)');
  refl.addColorStop(1, 'rgba(255,215,130,0)');
  b.fillStyle = refl;
  b.fillRect(0, top, W, 760);

  const cTop = 150, cBot = 150, cy = 1150;
  b.fillStyle = 'rgba(0,0,0,.25)';
  b.beginPath();
  b.moveTo(W / 2 - cTop - 6, cy);
  b.lineTo(W / 2 + cTop + 6, cy);
  b.lineTo(W / 2 + cBot + 10, H);
  b.lineTo(W / 2 - cBot - 10, H);
  b.closePath();
  b.fill();
  const cg = b.createLinearGradient(0, cy, 0, H);
  cg.addColorStop(0, '#a3201a');
  cg.addColorStop(1, '#7a1410');
  b.fillStyle = cg;
  b.beginPath();
  b.moveTo(W / 2 - cTop, cy);
  b.lineTo(W / 2 + cTop, cy);
  b.lineTo(W / 2 + cBot, H);
  b.lineTo(W / 2 - cBot, H);
  b.closePath();
  b.fill();
  for (const side of [-1, 1]) {
    b.strokeStyle = '#e8b84e';
    b.lineWidth = 6;
    b.beginPath();
    b.moveTo(W / 2 + side * (cTop - 8), cy);
    b.lineTo(W / 2 + side * (cBot - 8), H);
    b.stroke();
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(W / 2 + side * (cTop - 22), cy);
    b.lineTo(W / 2 + side * (cBot - 22), H);
    b.stroke();
  }
  for (let my = cy + 90; my < H; my += 110) {
    b.save();
    b.translate(W / 2, my);
    b.scale(1, 0.55);
    b.fillStyle = 'rgba(240,190,80,.8)';
    for (let k = 0; k < 8; k++) {
      b.rotate(Math.PI / 4);
      b.beginPath();
      b.ellipse(0, -26, 9, 22, 0, 0, Math.PI * 2);
      b.fill();
    }
    b.fillStyle = '#a3201a';
    b.beginPath();
    b.arc(0, 0, 10, 0, Math.PI * 2);
    b.fill();
    b.restore();
  }

  for (const seat of state.seats) {
    const s = seat.s;
    b.fillStyle = 'rgba(30,15,5,.3)';
    b.beginPath();
    b.ellipse(seat.x, seat.y + 10 * s, 34 * s, 11 * s, 0, 0, Math.PI * 2);
    b.fill();
    const cu = b.createRadialGradient(seat.x - 8 * s, seat.y, 2, seat.x, seat.y + 4 * s, 32 * s);
    cu.addColorStop(0, '#d9a25e');
    cu.addColorStop(1, '#7a4a22');
    b.fillStyle = cu;
    b.beginPath();
    b.ellipse(seat.x, seat.y + 4 * s, 30 * s, 11 * s, 0, 0, Math.PI * 2);
    b.fill();
    b.strokeStyle = 'rgba(60,30,10,.6)';
    b.lineWidth = 1.2;
    b.stroke();
  }
}

function drawAltarImage(b) {
  const { y, h } = ALTAR_IMG;
  if (!(altarImg.complete && altarImg.naturalWidth)) {
    b.fillStyle = '#5a2412';
    b.fillRect(0, y, W, h);
    return;
  }
  const tmp = document.createElement('canvas');
  tmp.width = W;
  tmp.height = h;
  const t = tmp.getContext('2d');
  t.drawImage(altarImg, 0, 0, W, h);
  t.globalCompositeOperation = 'destination-in';
  const fade = t.createLinearGradient(0, h - 90, 0, h);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  t.fillStyle = fade;
  t.fillRect(0, 0, W, h);
  b.drawImage(tmp, 0, y);
}

function drawBurner(b, x, y) {
  b.fillStyle = 'rgba(0,0,0,.35)';
  b.beginPath();
  b.ellipse(x, y + 4, 56, 14, 0, 0, Math.PI * 2);
  b.fill();
  const body = b.createLinearGradient(x - 50, 0, x + 50, 0);
  body.addColorStop(0, '#5a3a12');
  body.addColorStop(0.4, '#d4a243');
  body.addColorStop(0.6, '#f5d27a');
  body.addColorStop(1, '#6a4414');
  b.fillStyle = body;
  for (const dx of [-30, 30]) {
    b.beginPath();
    b.moveTo(x + dx - 6, y);
    b.lineTo(x + dx * 1.3, y - 4);
    b.lineTo(x + dx, y - 40);
    b.closePath();
    b.fill();
  }
  b.beginPath();
  b.moveTo(x - 50, y - 90);
  b.bezierCurveTo(x - 58, y - 40, x - 36, y - 30, x - 24, y - 28);
  b.lineTo(x + 24, y - 28);
  b.bezierCurveTo(x + 36, y - 30, x + 58, y - 40, x + 50, y - 90);
  b.closePath();
  b.fill();
  b.fillRect(x - 56, y - 98, 112, 12);
  b.strokeStyle = '#4a2c08';
  b.lineWidth = 2;
  b.strokeRect(x - 56, y - 98, 112, 12);
  for (const dx of [-62, 62]) {
    b.beginPath();
    b.ellipse(x + dx, y - 80, 9, 14, 0, 0, Math.PI * 2);
    b.stroke();
  }
  b.fillStyle = '#c99a3a';
  b.beginPath();
  b.ellipse(x, y - 58, 16, 9, 0, 0, Math.PI * 2);
  b.fill();
  for (let i = -2; i <= 2; i++) {
    b.strokeStyle = '#b5413a';
    b.lineWidth = 3;
    b.beginPath();
    b.moveTo(x + i * 9, y - 98);
    b.lineTo(x + i * 12, y - 150);
    b.stroke();
  }
}

function drawBackground() {
  const b = bg.getContext('2d');
  b.clearRect(0, 0, W, H);
  b.fillStyle = '#2a1408';
  b.fillRect(0, 0, W, ALTAR_IMG.y + 10);
  drawFloor(b);
  drawAltarImage(b);
  BURNERS.forEach(p => drawBurner(b, p.x, p.y));

  const v = vignette.getContext('2d');
  v.clearRect(0, 0, W, H);
  const top = v.createLinearGradient(0, 0, 0, 220);
  top.addColorStop(0, 'rgba(30,10,4,.85)');
  top.addColorStop(1, 'rgba(30,10,4,0)');
  v.fillStyle = top;
  v.fillRect(0, 0, W, 220);
  const vg = v.createRadialGradient(W / 2, H * 0.5, H * 0.32, W / 2, H * 0.5, H * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(20,6,0,.5)');
  v.fillStyle = vg;
  v.fillRect(0, 0, W, H);
}

function drawMonk() {
  const w = MONK.w;
  const ratio = monkVideo.videoWidth ? monkVideo.videoHeight / monkVideo.videoWidth : 546 / 886;
  const h = w * ratio;
  const x = MONK.x - w / 2, y = MONK.bottom - h;
  g.fillStyle = 'rgba(30,12,4,.35)';
  g.beginPath();
  g.ellipse(MONK.x, MONK.bottom - 8, w * 0.42, 16, 0, 0, Math.PI * 2);
  g.fill();
  if (monkVideo.readyState >= 2) g.drawImage(monkVideo, x, y, w, h);
}

function drawLightFx() {
  const t = state.time;
  g.save();
  g.globalCompositeOperation = 'lighter';
  HALOS.forEach((h, i) => {
    const pulse = 0.14 + 0.07 * Math.sin(t * 1.2 + i * 1.3);
    const gr = g.createRadialGradient(h.x, h.y, 4, h.x, h.y, h.r);
    gr.addColorStop(0, `rgba(255,236,170,${pulse})`);
    gr.addColorStop(1, 'rgba(255,210,120,0)');
    g.fillStyle = gr;
    g.fillRect(h.x - h.r, h.y - h.r, h.r * 2, h.r * 2);
  });
  for (const s of SPARKLES) {
    const a = Math.max(0, Math.sin(t * s.sp + s.p));
    if (a < 0.05) continue;
    const r = s.r * a;
    g.fillStyle = `rgba(255,248,210,${0.85 * a})`;
    g.beginPath();
    g.moveTo(s.x, s.y - r);
    g.quadraticCurveTo(s.x, s.y, s.x + r, s.y);
    g.quadraticCurveTo(s.x, s.y, s.x, s.y + r);
    g.quadraticCurveTo(s.x, s.y, s.x - r, s.y);
    g.quadraticCurveTo(s.x, s.y, s.x, s.y - r);
    g.fill();
  }
  for (const p of BURNERS) {
    for (let i = -2; i <= 2; i++) {
      const tx = p.x + i * 12, ty = p.y - 150;
      const gl = g.createRadialGradient(tx, ty, 1, tx, ty, 10);
      gl.addColorStop(0, `rgba(255,${120 + 60 * Math.sin(t * 6 + i)},60,.9)`);
      gl.addColorStop(1, 'rgba(255,80,30,0)');
      g.fillStyle = gl;
      g.fillRect(tx - 10, ty - 10, 20, 20);
    }
  }
  g.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawAvatarCircle(c, url, x, y, r, fallbackColor) {
  const img = getAvatar(url);
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.closePath();
  if (img && img.complete && img.naturalWidth) {
    c.clip();
    c.drawImage(img, x - r, y - r, r * 2, r * 2);
  } else {
    c.fillStyle = fallbackColor;
    c.fill();
  }
  c.restore();
  c.strokeStyle = '#f5d27a';
  c.lineWidth = Math.max(1.5, r * 0.12);
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const gg = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt));
  const bb = Math.min(255, Math.max(0, (n & 255) + amt));
  return `rgb(${r},${gg},${bb})`;
}

const INK = '#3b2414';
const HAIR = ['#1a120d', '#2a1a12', '#3a2618', '#8a8580', '#1a120d', '#24170f'];

function hashNum(id, mod) {
  let h = 7;
  for (const ch of id) h = (h * 131 + ch.charCodeAt(0)) >>> 0;
  return h % mod;
}

function drawViewer(v) {
  const s = v.s * (0.6 + 0.4 * v.appear);
  const x = v.x, y = v.y;
  const standing = v.mode === 'walk' || v.mode === 'return';
  const bow = v.bow;
  const bodyH = (standing ? 78 : 46) * s * (1 - bow * 0.3);
  const shoulder = 21 * s;
  const base = 31 * s;
  const hairColor = HAIR[hashNum(v.id, HAIR.length)];
  const style = hashNum(v.id + 'h', 3);
  const step = standing ? Math.sin(state.time * 10) * 3 * s : 0;

  if (standing) {
    g.fillStyle = 'rgba(30,15,5,.3)';
    g.beginPath();
    g.ellipse(x, y + 4 * s, 26 * s, 8 * s, 0, 0, Math.PI * 2);
    g.fill();
  }

  if (v.glow > 0) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(x, y - bodyH / 2, 4, x, y - bodyH / 2, 85 * s);
    gr.addColorStop(0, `rgba(255,215,110,${0.75 * v.glow})`);
    gr.addColorStop(1, 'rgba(255,200,90,0)');
    g.fillStyle = gr;
    g.fillRect(x - 85 * s, y - bodyH / 2 - 85 * s, 170 * s, 170 * s);
    g.restore();
  }

  g.lineJoin = 'round';
  g.lineWidth = Math.max(1, 1.8 * s);
  g.strokeStyle = INK;

  if (!standing) {
    g.fillStyle = shade(v.color, -20);
    g.beginPath();
    g.ellipse(x, y - 2 * s, base, 11 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }

  const robe = g.createLinearGradient(x - base, y - bodyH, x + base, y);
  robe.addColorStop(0, shade(v.color, 40));
  robe.addColorStop(0.5, v.color);
  robe.addColorStop(1, shade(v.color, -40));
  g.fillStyle = robe;
  const bottomW = standing ? 22 * s : base * 0.95;
  g.beginPath();
  g.moveTo(x - bottomW, y - 3 * s + step);
  g.bezierCurveTo(x - bottomW - 2 * s, y - bodyH * 0.55, x - shoulder - 3 * s, y - bodyH * 0.9, x - shoulder * 0.55, y - bodyH);
  g.quadraticCurveTo(x, y - bodyH - 3 * s, x + shoulder * 0.55, y - bodyH);
  g.bezierCurveTo(x + shoulder + 3 * s, y - bodyH * 0.9, x + bottomW + 2 * s, y - bodyH * 0.55, x + bottomW, y - 3 * s - step);
  g.quadraticCurveTo(x, y + 2 * s, x - bottomW, y - 3 * s + step);
  g.closePath();
  g.fill();
  g.stroke();

  g.strokeStyle = shade(v.color, -55);
  g.lineWidth = Math.max(0.8, 1.1 * s);
  for (const dx of [-0.45, 0.45]) {
    g.beginPath();
    g.moveTo(x + dx * shoulder, y - bodyH * 0.8);
    g.quadraticCurveTo(x + dx * shoulder * 1.4, y - bodyH * 0.45, x + dx * bottomW * 0.9, y - 6 * s);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(x, y - bodyH + 4 * s);
  g.lineTo(x, y - 5 * s);
  g.stroke();

  const arm = standing ? 0 : 1;
  if (arm) {
    g.fillStyle = shade(v.color, 10);
    g.strokeStyle = INK;
    g.lineWidth = Math.max(1, 1.8 * s);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.ellipse(x + side * (shoulder + 1 * s), y - bodyH * 0.45, 7 * s, bodyH * 0.38, side * 0.18, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  const headR = 13.5 * s;
  const headY = y - bodyH - headR * 0.75 + bow * 10 * s;
  g.fillStyle = '#e2bc9a';
  g.beginPath();
  g.ellipse(x, headY + headR * 0.85, 5.5 * s, 5 * s, 0, 0, Math.PI * 2);
  g.fill();
  for (const side of [-1, 1]) {
    g.beginPath();
    g.ellipse(x + side * headR * 0.95, headY + 1 * s, 2.6 * s, 4 * s, 0, 0, Math.PI * 2);
    g.fill();
  }
  const hg = g.createRadialGradient(x - headR * 0.35, headY - headR * 0.45, 1, x, headY, headR * 1.15);
  hg.addColorStop(0, shade(hairColor.length === 7 ? hairColor : '#1a120d', 55));
  hg.addColorStop(1, hairColor);
  g.fillStyle = hg;
  g.strokeStyle = INK;
  g.lineWidth = Math.max(1, 1.6 * s);
  g.beginPath();
  g.ellipse(x, headY, headR, headR * 1.05, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  if (style === 1) {
    g.beginPath();
    g.arc(x, headY + headR * 0.55, headR * 0.48, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#c0392b';
    g.fillRect(x - 3 * s, headY + headR * 0.1, 6 * s, 2 * s);
  } else if (style === 2) {
    g.fillStyle = hairColor;
    g.beginPath();
    g.moveTo(x - headR * 0.9, headY + headR * 0.2);
    g.quadraticCurveTo(x, headY + headR * 2.3, x + headR * 0.9, headY + headR * 0.2);
    g.fill();
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,.18)';
  g.lineWidth = Math.max(1, 2 * s);
  g.beginPath();
  g.arc(x, headY, headR * 0.7, Math.PI * 1.15, Math.PI * 1.55);
  g.stroke();

  if (v.pray > 0) {
    g.globalAlpha = v.pray;
    g.font = `${22 * s}px serif`;
    g.textAlign = 'center';
    g.fillText('🙏', x, headY - 22 * s);
    g.globalAlpha = 1;
  }

  const recent = performance.now() - v.lastActive < 8000;
  const showLabel = camera.z > 1.3 || v.points > 0 || recent || v.mode !== 'sit';
  if (showLabel) drawLabel(v, x, y, s);
  if (v.bubble) drawBubble(v, x, headY, s);
}

function drawLabel(v, x, y, s) {
  const labelY = y + 18 * s;
  const fs = Math.max(9, 13 * s);
  g.font = `600 ${fs}px system-ui, sans-serif`;
  const name = v.name.length > 10 ? v.name.slice(0, 9) + '…' : v.name;
  const tw = g.measureText(name).width;
  const ar = 8 * s;
  g.fillStyle = v.points > 0 ? 'rgba(90,20,10,.8)' : 'rgba(0,0,0,.5)';
  roundRect(g, x - tw / 2 - ar - 6 * s, labelY - fs * 0.8, tw + ar * 2 + 10 * s, fs * 1.4, fs * 0.7);
  g.fill();
  if (v.points > 0) {
    g.strokeStyle = '#e0b04a';
    g.lineWidth = 1;
    g.stroke();
  }
  drawAvatarCircle(g, v.avatar, x - tw / 2 - 2 * s, labelY - fs * 0.1, ar, v.color);
  g.fillStyle = v.points > 0 ? '#ffd86b' : '#f2efe8';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(name, x - tw / 2 + ar + 2 * s, labelY - fs * 0.1);
  g.textBaseline = 'alphabetic';
}

function drawBubble(v, x, headY, s) {
  const bfs = Math.max(11, 16 * s);
  g.font = `500 ${bfs}px system-ui, sans-serif`;
  const text = v.bubble.text;
  const bw = Math.min(g.measureText(text).width, 260 * s) + 20 * s;
  const by = headY - 30 * s - bfs;
  g.globalAlpha = Math.min(1, v.bubble.t);
  g.fillStyle = 'rgba(255,250,240,.94)';
  roundRect(g, x - bw / 2, by - bfs, bw, bfs * 1.6, bfs * 0.6);
  g.fill();
  g.beginPath();
  g.moveTo(x - 6 * s, by + bfs * 0.6);
  g.lineTo(x + 6 * s, by + bfs * 0.6);
  g.lineTo(x, by + bfs * 0.6 + 8 * s);
  g.fill();
  g.fillStyle = '#3a2a20';
  g.textAlign = 'center';
  g.fillText(text, x, by + bfs * 0.1, 260 * s);
  g.globalAlpha = 1;
}

function drawWorld() {
  g.drawImage(bg, 0, 0);
  drawLightFx();
  for (const sm of state.smoke) {
    g.fillStyle = `rgba(235,230,225,${0.22 * (sm.life / sm.max)})`;
    g.beginPath();
    g.arc(sm.x, sm.y, sm.size, 0, Math.PI * 2);
    g.fill();
  }
  drawMonk();
  const list = [...state.viewers.values()].sort((a, b) => a.y - b.y);
  for (const v of list) drawViewer(v);
  for (const h of state.hearts) {
    g.globalAlpha = Math.min(1, h.life);
    g.font = '22px serif';
    g.textAlign = 'center';
    g.fillText('❤️', h.x, h.y);
  }
  g.globalAlpha = 1;
  for (const p of state.petals) {
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.r);
    const pg = g.createLinearGradient(-p.size, 0, p.size, 0);
    pg.addColorStop(0, 'rgba(255,200,215,.95)');
    pg.addColorStop(1, 'rgba(240,120,160,.85)');
    g.fillStyle = pg;
    g.beginPath();
    g.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

function ornatePanel(x, y, w, h, r) {
  g.save();
  g.shadowColor = 'rgba(0,0,0,.6)';
  g.shadowBlur = 18;
  const fill = g.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, 'rgba(110,20,12,.92)');
  fill.addColorStop(1, 'rgba(55,8,4,.92)');
  g.fillStyle = fill;
  roundRect(g, x, y, w, h, r);
  g.fill();
  g.restore();
  g.lineWidth = 4;
  g.strokeStyle = goldGradient(g, x, y, x + w, y + h);
  roundRect(g, x, y, w, h, r);
  g.stroke();
  g.lineWidth = 1.5;
  g.strokeStyle = 'rgba(240,196,87,.6)';
  roundRect(g, x + 7, y + 7, w - 14, h - 14, Math.max(4, r - 6));
  g.stroke();
  g.fillStyle = goldGradient(g, x, y, x + w, y);
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    g.beginPath();
    g.moveTo(cx, cy - 9);
    g.lineTo(cx + 9, cy);
    g.lineTo(cx, cy + 9);
    g.lineTo(cx - 9, cy);
    g.closePath();
    g.fill();
  }
}

function drawHUD() {
  g.drawImage(vignette, 0, 0);

  g.textAlign = 'center';
  g.font = '800 70px "Times New Roman", serif';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(60,15,5,.9)';
  g.strokeText(state.title, W / 2, 105);
  g.fillStyle = goldGradient(g, 0, 50, 0, 110);
  g.fillText(state.title, W / 2, 105);
  g.font = '500 30px system-ui, sans-serif';
  g.fillStyle = '#fff3d6';
  g.shadowColor = 'rgba(0,0,0,.8)';
  g.shadowBlur = 8;
  g.fillText(`Nam Mô A Di Đà Phật · ${state.viewers.size} Phật tử đang có mặt`, W / 2, 152);
  g.shadowBlur = 0;

  const lx = W - 340, ly = 196, lw = 316;
  const lh = 78 + Math.max(1, state.top.length) * 54;
  ornatePanel(lx, ly, lw, lh, 18);
  g.textAlign = 'center';
  g.fillStyle = goldGradient(g, 0, ly + 20, 0, ly + 50);
  g.font = '800 28px system-ui, sans-serif';
  g.fillText('BẢNG CÔNG ĐỨC', lx + lw / 2, ly + 48);
  const medal = ['#ffd24a', '#d9dde3', '#d68a4a'];
  if (!state.top.length) {
    g.fillStyle = 'rgba(255,240,210,.7)';
    g.font = 'italic 22px system-ui, sans-serif';
    g.fillText('Chưa có ai, hãy là người đầu tiên', lx + lw / 2, ly + 100, lw - 30);
  }
  state.top.forEach((t, i) => {
    const y = ly + 100 + i * 54;
    g.fillStyle = medal[i] || 'rgba(255,255,255,.25)';
    g.beginPath();
    g.arc(lx + 34, y - 8, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = i < 3 ? '#3a1a06' : '#fff';
    g.font = '800 20px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(`${i + 1}`, lx + 34, y - 1);
    g.textAlign = 'left';
    g.fillStyle = i === 0 ? '#ffd86b' : '#f6efe2';
    g.font = '600 23px system-ui, sans-serif';
    const n = t.name.length > 11 ? t.name.slice(0, 10) + '…' : t.name;
    g.fillText(n, lx + 60, y);
    g.textAlign = 'right';
    g.fillStyle = '#ffd86b';
    g.fillText(`${t.points}`, lx + lw - 20, y);
  });

  const b = state.banner;
  if (b) {
    const p = b.t / b.d;
    const a = p < 0.08 ? p / 0.08 : p > 0.88 ? (1 - p) / 0.12 : 1;
    const slide = p < 0.08 ? (1 - p / 0.08) * -40 : 0;
    g.globalAlpha = Math.max(0, a);
    const bx = 40, by = 200 + slide, bw = W - 400, bh = 240;
    ornatePanel(bx, by, bw, bh, 26);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const ag = g.createRadialGradient(bx + 90, by + 95, 10, bx + 90, by + 95, 90);
    ag.addColorStop(0, 'rgba(255,210,110,.5)');
    ag.addColorStop(1, 'rgba(255,210,110,0)');
    g.fillStyle = ag;
    g.fillRect(bx, by, 180, 190);
    g.restore();
    drawAvatarCircle(g, b.avatar, bx + 90, by + 95, 56, '#9fb3d1');
    g.textAlign = 'left';
    g.fillStyle = goldGradient(g, 0, by + 40, 0, by + 80);
    g.font = '800 36px system-ui, sans-serif';
    const n = b.name.length > 14 ? b.name.slice(0, 13) + '…' : b.name;
    g.fillText(n, bx + 165, by + 76);
    g.fillStyle = '#fff3d6';
    g.font = '600 27px system-ui, sans-serif';
    g.fillText(`${b.line1} · công đức +${b.points}`, bx + 165, by + 120, bw - 185);
    g.strokeStyle = 'rgba(240,196,87,.5)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(bx + 40, by + 160);
    g.lineTo(bx + bw - 40, by + 160);
    g.stroke();
    g.font = 'italic 600 30px "Times New Roman", serif';
    g.fillStyle = '#ffe7a3';
    g.textAlign = 'center';
    g.fillText(`“${b.line2}”`, bx + bw / 2, by + 205, bw - 50);
    g.globalAlpha = 1;
  }

  if (state.queue.length) {
    ornatePanel(40, 470, 400, 56, 14);
    g.textAlign = 'center';
    g.fillStyle = '#ffd86b';
    g.font = '700 24px system-ui, sans-serif';
    g.fillText(`Đang chờ lên thắp hương: ${state.queue.length}`, 240, 507);
  }

  ornatePanel(40, H - 160, W - 80, 110, 22);
  g.textAlign = 'center';
  g.fillStyle = '#ffe7a3';
  g.font = '700 30px system-ui, sans-serif';
  g.fillText('🌹 Tặng quà → lên thắp hương · từ 10 xu → chuông lớn', W / 2, H - 112, W - 140);
  g.fillStyle = '#fff3d6';
  g.font = '500 25px system-ui, sans-serif';
  g.fillText('Bình luận "A Di Đà Phật" → chắp tay vái lạy', W / 2, H - 74, W - 140);



}

function render() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.setTransform(camera.z, 0, 0, camera.z, W / 2 - camera.x * camera.z, H / 2 - camera.y * camera.z);
  drawWorld();
  g.setTransform(1, 0, 0, 1, 0, 0);
  drawHUD();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  state.time += dt;
  updateGift(dt);
  updateViewers(dt);
  updateParticles(dt);
  updateCamera(dt);
  if (state.banner) {
    state.banner.t += dt;
    if (state.banner.t >= state.banner.d) state.banner = null;
  }
  render();
  requestAnimationFrame(loop);
}

function handle(msg) {
  switch (msg.type) {
    case 'init':
      state.title = msg.title || state.title;
      state.maxSeats = msg.maxSeats || state.maxSeats;
      state.status = msg.status;
      state.top = msg.top || [];
      break;
    case 'status':
      state.status = msg.status;
      break;
    case 'leaderboard':
      state.top = msg.top;
      break;
    case 'join':
    case 'follow':
      ensureViewer(msg.user);
      break;
    case 'chat': {
      const v = ensureViewer(msg.user);
      if (!v) break;
      v.bubble = { text: msg.text, t: 5 };
      if (/a\s*di\s*đà|nam\s*mô|adidaphat|a di da/i.test(msg.text)) v.pray = 1;
      break;
    }
    case 'like': {
      const v = ensureViewer(msg.user);
      if (v && state.hearts.length < 60) state.hearts.push({ x: v.x, y: v.y - 60 * v.s, life: 1.5 });
      break;
    }
    case 'gift':
      enqueueGift(msg);
      break;
  }
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/?room=${encodeURIComponent(ROOM)}`);
  ws.onmessage = e => handle(JSON.parse(e.data));
  ws.onclose = () => setTimeout(connect, 2000);
}

const unlockEl = document.getElementById('unlock');
let wakeLock = null;
async function keepScreenOn() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepScreenOn();
});

async function unlockAudio(e) {
  if (e && e.type === 'click' && !window.obsstudio && document.documentElement.requestFullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  keepScreenOn();
  const ok = await TempleAudio.unlock();
  unlockEl.style.display = ok || window.obsstudio ? 'none' : 'flex';
}
unlockEl.addEventListener('click', unlockAudio);
canvas.addEventListener('click', unlockAudio);
window.addEventListener('keydown', unlockAudio);

setInterval(() => fetch('/ping').catch(() => {}), 4 * 60 * 1000);

buildSeats();
drawBackground();
connect();
requestAnimationFrame(loop);
unlockAudio();
setTimeout(() => {
  if (!window.obsstudio && TempleAudio.ctx.state !== 'running') unlockEl.style.display = 'flex';
}, 800);
