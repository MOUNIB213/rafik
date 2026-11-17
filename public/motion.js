// Tiny spring engine from Motion Studies (DesignBookmark) — https://designbookmark.com/motion
// Springs, sim-time timers, one rAF loop, and token readers.
window.Motion = (() => {
  const setTheme = t => { document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark'; };
  try { setTheme(localStorage.getItem('ms-theme')); } catch { setTheme('dark'); }
  addEventListener('storage', e => { if (e.key === 'ms-theme') setTheme(e.newValue); });

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S = (x, k = 400, c = 30) => ({ x, v: 0, t: x, k, c });
  const tune = (s, k, c) => { s.k = k; s.c = reduce ? 2 * Math.sqrt(k) : c; };
  const step = (s, dt) => { const a = -s.k * (s.x - s.t) - s.c * s.v; s.v += a * dt; s.x += s.v * dt; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const settled = (s, e = 0.002) => Math.abs(s.x - s.t) < e && Math.abs(s.v) < e * 5;

  const token = (name, fallback = '') => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const num = (name, fallback) => parseFloat(token(name, String(fallback)));
  const spring = (name, fallback) => token(name, fallback).split(/\s+/).map(Number);

  let timeScale = 1;
  const timers = [];
  const after = (sec, fn) => { const t = { t: sec, fn }; timers.push(t); return t; };
  const cancel = t => { const i = timers.indexOf(t); if (i > -1) timers.splice(i, 1); };

  const comps = [];
  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30) * timeScale; last = now;
    for (let i = timers.length - 1; i >= 0; i--) {
      if ((timers[i].t -= dt) <= 0) timers.splice(i, 1)[0].fn();
    }
    const sub = 4;
    for (let k = 0; k < sub; k++) comps.forEach(c => c.frame(dt / sub));
    comps.forEach(c => c.render());
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    S, tune, step, clamp, settled, token, num, spring, after, cancel, setTheme,
    register: c => comps.push(c),
    get reduce() { return reduce; },
  };
})();
