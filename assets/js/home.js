/* Ana sayfa: dönen noktalı küre ve limanlar arası rotalar */
import { initCommon } from "./common.js";

initCommon();
initGlobe(document.getElementById("globe"));

function initGlobe(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const DEG = Math.PI / 180;
  const N = window.innerWidth < 700 ? 1800 : 3400;
  const dots = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    dots.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }

  // Büyük limanlar (enlem, boylam)
  const PORTS = [
    [41.0, 28.98], [36.8, 34.63], [53.55, 9.99], [51.95, 4.14], [31.23, 121.47],
    [1.26, 103.84], [25.01, 55.06], [40.67, -74.04], [33.74, -118.27], [-23.96, -46.33],
    [6.45, 3.39], [18.95, 72.84], [39.45, -0.32], [54.4, 18.67], [35.45, 139.65],
    [22.3, 114.17], [-33.92, 18.42], [29.95, 32.55], [43.3, 5.37], [45.44, 12.32]
  ];
  const toVec = ([lat, lon]) => {
    const la = lat * DEG, lo = lon * DEG;
    return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  };
  const ports = PORTS.map(toVec);

  let w = 0, h = 0, dpr = 1, cx = 0, cy = 0, R = 0;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width; h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(w * 0.5, h * 0.6, 680);
    if (w < 700) R = Math.min(w * 0.62, h * 0.42);
    cx = w * 0.5;
    cy = h * 0.66;
  }

  const tilt = -0.32;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  function project(v, rot) {
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const x = v[0] * cr + v[2] * sr;
    const z0 = -v[0] * sr + v[2] * cr;
    const y = v[1] * ct - z0 * st;
    const z = v[1] * st + z0 * ct;
    return [cx + x * R, cy - y * R, z];
  }

  function slerp(a, b, t) {
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const om = Math.acos(dot);
    if (om < 1e-4) return a.slice();
    const s = Math.sin(om);
    const k1 = Math.sin((1 - t) * om) / s, k2 = Math.sin(t * om) / s;
    return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
  }

  const routes = [];
  function spawnRoute(now) {
    let i = Math.floor(Math.random() * ports.length);
    let j = Math.floor(Math.random() * ports.length);
    if (i === j) j = (j + 3) % ports.length;
    const a = ports[i], b = ports[j];
    const ang = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
    const pts = [];
    const steps = 48;
    const lift = 0.06 + 0.18 * (ang / Math.PI);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const p = slerp(a, b, t);
      const m = 1 + lift * Math.sin(Math.PI * t);
      pts.push([p[0] * m, p[1] * m, p[2] * m]);
    }
    routes.push({ pts, start: now, dur: 2600 + Math.random() * 1400 });
  }

  let rot = 0.6;
  let last = performance.now();
  let nextSpawn = 0;
  let running = false;
  let raf = 0;

  function frame(now) {
    const dt = Math.min(64, now - last);
    last = now;
    if (!reduce) rot += dt * 0.000055;

    ctx.clearRect(0, 0, w, h);

    // Atmosfer: dış hale
    const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.32);
    halo.addColorStop(0, "rgba(0,130,124,0.22)");
    halo.addColorStop(0.35, "rgba(0,130,124,0.08)");
    halo.addColorStop(1, "rgba(0,130,124,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.32, 0, Math.PI * 2);
    ctx.fill();

    // Küre gövdesi: hacim veren iç gradyan
    const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.1, cx, cy, R);
    body.addColorStop(0, "rgba(0,130,124,0.20)");
    body.addColorStop(0.6, "rgba(0,55,52,0.18)");
    body.addColorStop(1, "rgba(0,55,52,0.05)");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // Kenar çizgisi
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(98,198,192,0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Noktalar
    for (let i = 0; i < dots.length; i++) {
      const [x, y, z] = project(dots[i], rot);
      if (z < 0) {
        if (z > -0.35) {
          ctx.fillStyle = `rgba(0,130,124,${0.08 + 0.18 * (1 + z / 0.35)})`;
          ctx.fillRect(x, y, 1, 1);
        }
      } else {
        const a = 0.22 + 0.7 * z;
        const s = 1 + 1.3 * z;
        ctx.fillStyle = z > 0.7 ? `rgba(203,255,252,${a})` : `rgba(98,198,192,${a})`;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }

    // Limanlar
    for (const p of ports) {
      const [x, y, z] = project(p, rot);
      if (z <= 0.02) continue;
      ctx.beginPath();
      ctx.arc(x, y, 2 + 1.6 * z, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(203,255,252,${0.35 + 0.6 * z})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 6 + 4 * z, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(98,198,192,${0.18 * z})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Rotalar
    if (!reduce && now > nextSpawn && routes.length < 7) {
      spawnRoute(now);
      nextSpawn = now + 650 + Math.random() * 700;
    }
    for (let r = routes.length - 1; r >= 0; r--) {
      const route = routes[r];
      const t = reduce ? 0.75 : (now - route.start) / route.dur;
      if (t >= 1.6) { routes.splice(r, 1); continue; }
      const head = Math.min(1, t);
      const tail = Math.max(0, Math.min(1, t - 0.6));
      const n = route.pts.length - 1;
      const i0 = Math.floor(tail * n), i1 = Math.floor(head * n);
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      for (let k = i0; k < i1; k++) {
        const p = project(route.pts[k], rot);
        const q = project(route.pts[k + 1], rot);
        if (p[2] < -0.05 && q[2] < -0.05) continue;
        const along = (k - i0) / Math.max(1, i1 - i0);
        const alpha = (0.15 + 0.75 * along) * Math.max(0.15, Math.min(1, (p[2] + 0.3)));
        ctx.strokeStyle = `rgba(203,255,252,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
      }
      if (head < 1) {
        const hp = project(route.pts[i1], rot);
        if (hp[2] > -0.05) {
          ctx.beginPath();
          ctx.arc(hp[0], hp[1], 2.6, 0, Math.PI * 2);
          ctx.fillStyle = "#cbfffc";
          ctx.fill();
        }
      }
    }

    if (running && !reduce) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  resize();
  if (reduce) {
    for (let i = 0; i < 5; i++) spawnRoute(performance.now());
    frame(performance.now());
  } else {
    start();
  }

  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { resize(); if (reduce || !running) frame(performance.now()); }, 120);
  });

  if ("IntersectionObserver" in window && !reduce) {
    new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())).observe(canvas);
  }
  document.addEventListener("visibilitychange", () => {
    if (reduce) return;
    if (document.hidden) stop(); else start();
  });
}
