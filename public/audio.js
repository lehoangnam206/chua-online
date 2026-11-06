const TempleAudio = (() => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const chantGain = ctx.createGain();
  chantGain.gain.value = 1;
  chantGain.connect(master);

  const fxGain = ctx.createGain();
  fxGain.gain.value = 1;
  fxGain.connect(master);

  let bellBuffer = null;
  let started = false;
  let synthTimer = null;

  async function loadBuffer(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  let chantEl = null;

  function keepAlive(el, url) {
    let lastTime = -1, stuck = 0;
    el.addEventListener('ended', () => {
      el.currentTime = 0;
      el.play().catch(() => {});
    });
    el.addEventListener('error', () => {
      setTimeout(() => {
        const pos = el.currentTime || 0;
        el.src = url;
        el.load();
        el.addEventListener('canplay', () => {
          el.currentTime = pos;
          el.play().catch(() => {});
        }, { once: true });
      }, 1500);
    });
    setInterval(() => {
      if (ctx.state !== 'running') return;
      if (el.paused) el.play().catch(() => {});
      if (el.currentTime === lastTime) stuck++;
      else stuck = 0;
      lastTime = el.currentTime;
      if (stuck >= 3) {
        stuck = 0;
        const pos = el.currentTime;
        el.src = url;
        el.load();
        el.addEventListener('canplay', () => {
          el.currentTime = pos;
          el.play().catch(() => {});
        }, { once: true });
      }
    }, 2000);
  }

  async function playStream(url, gainValue) {
    const el = new Audio();
    el.src = url;
    el.loop = true;
    el.preload = 'auto';
    try {
      await new Promise((resolve, reject) => {
        el.addEventListener('canplay', resolve, { once: true });
        el.addEventListener('error', reject, { once: true });
      });
      const src = ctx.createMediaElementSource(el);
      const g = ctx.createGain();
      g.gain.value = gainValue;
      src.connect(g).connect(chantGain);
      el.currentTime = Math.random() * Math.max(0, (el.duration || 0) - 60);
      await el.play();
      chantEl = el;
      keepAlive(el, url);
      return true;
    } catch {
      return false;
    }
  }

  function woodBlock(time, accent) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(accent ? 520 : 600, time);
    osc.frequency.exponentialRampToValueAtTime(380, time + 0.08);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.32, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    osc.connect(g).connect(chantGain);
    osc.start(time);
    osc.stop(time + 0.15);
  }

  function startDrone() {
    const g = ctx.createGain();
    g.gain.value = 0.035;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    [110, 164.8, 220.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sawtooth' : 'sine';
      o.frequency.value = f;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.07 + i * 0.03;
      lfoGain.gain.value = 0.6;
      lfo.connect(lfoGain).connect(o.frequency);
      lfo.start();
      o.connect(filter);
      o.start();
    });
    filter.connect(g).connect(chantGain);
  }

  function startSynthChant() {
    startDrone();
    let next = ctx.currentTime + 0.2;
    let beat = 0;
    synthTimer = setInterval(() => {
      while (next < ctx.currentTime + 0.5) {
        woodBlock(next, beat % 8 === 0);
        next += 0.75;
        beat++;
      }
    }, 100);
  }

  function synthBell(time, strength) {
    const f0 = 98;
    const partials = [
      [0.5, 0.5, 9], [1, 1, 7], [2.0, 0.6, 5], [2.76, 0.45, 4],
      [3.2, 0.25, 3], [5.4, 0.2, 2.2], [8.93, 0.1, 1.4]
    ];
    const out = ctx.createGain();
    out.gain.value = 0.22 * strength;
    out.connect(fxGain);
    partials.forEach(([ratio, amp, decay]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f0 * ratio * (1 + (Math.random() - 0.5) * 0.004);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(amp, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
      o.connect(g).connect(out);
      o.start(time);
      o.stop(time + decay + 0.1);
    });
    const noise = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const ns = ctx.createBufferSource();
    const nf = ctx.createBiquadFilter();
    const ng = ctx.createGain();
    ns.buffer = noise;
    nf.type = 'bandpass';
    nf.frequency.value = 1200;
    ng.gain.value = 0.3;
    ns.connect(nf).connect(ng).connect(out);
    ns.start(time);
  }

  function duck(seconds) {
    const t = ctx.currentTime;
    chantGain.gain.cancelScheduledValues(t);
    chantGain.gain.setTargetAtTime(0.25, t, 0.08);
    chantGain.gain.setTargetAtTime(1, t + seconds, 0.6);
  }

  async function start() {
    if (started) return;
    started = true;
    bellBuffer = await loadBuffer('audio/bell.mp3');
    const ok = await playStream('audio/chant.mp3', 0.85);
    if (!ok) startSynthChant();
  }

  function bell(times = 1) {
    if (ctx.state !== 'running') return;
    duck(3 + times * 1.5);
    for (let i = 0; i < times; i++) {
      const t = ctx.currentTime + 0.05 + i * 1.6;
      if (bellBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = bellBuffer;
        src.connect(fxGain);
        src.start(t);
      } else {
        synthBell(t, i === 0 ? 1 : 0.85);
      }
    }
  }

  async function unlock() {
    if (ctx.state !== 'running') await ctx.resume();
    await start();
    return ctx.state === 'running';
  }

  return { ctx, unlock, bell };
})();
