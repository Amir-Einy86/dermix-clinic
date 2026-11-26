/* ==========================================================
   background.js — پس‌زمینه‌ی هندسی «بافت در حال ترمیم» (فقط صفحه‌های کاربران)
   یک شبکه‌ی شش‌ضلعی خیلی کم‌رنگ (مثل سلول‌های بافت) پشت کل سایت.
   هر چند ثانیه از یک نقطه یک «موج ترمیم» شروع می‌شود: شش‌ضلعی‌ها حلقه‌به‌حلقه
   فیروزه‌ای پر می‌شوند و آرام محو می‌شوند.
   - یک <canvas> ثابت (fixed) پشت همه‌ی محتوا؛ کلیک‌ها از آن رد می‌شوند.
   - شبکه فقط یک بار (هنگام تغییر اندازه) کشیده می‌شود؛ در هر فریم فقط موج‌ها کشیده می‌شوند.
   - وقتی موجی فعال نیست، هیچ حلقه‌ی انیمیشنی اجرا نمی‌شود (مصرف CPU نزدیک صفر).
   - تب پنهان = توقف کامل. «حرکت کمتر» = شبکه‌ی ثابت با یک موج ایستا.
   ========================================================== */
(function () {
  'use strict';

  /* ---------- تنظیمات (برای تغییر شدت، همین‌جا را عوض کنید) ---------- */
  const CONFIG = {
    size: 30,          // شعاع هر شش‌ضلعی (پیکسل)
    lineAlpha: 0.055,  // پررنگی خطوط شبکه (۰ تا ۱)
    fillAlpha: 0.2,    // پررنگی پر شدن شش‌ضلعی در اوج موج
    edgeAlpha: 0.45,   // پررنگی لبه‌ی شش‌ضلعی در اوج موج
    rings: 4,          // موج تا چند حلقه پخش شود
    ringDelay: 0.22,   // فاصله‌ی زمانی بین حلقه‌ها (ثانیه)
    life: 2.4,         // عمر هر شش‌ضلعی روشن (ثانیه)
    every: 2.8,        // هر چند ثانیه یک موج جدید (میانگین)
    maxWaves: 3,       // حداکثر موج هم‌زمان
  };
  const MOBILE = { size: 26, rings: 3, every: 4, maxWaves: 2 };

  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => reduceQuery.matches;

  // رنگ‌ها از متغیرهای CSS سایت (tokens.css)
  const rgb = (name, fallback) => {
    const hex = (getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim() || fallback;
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
  };

  function init() {
    // فقط صفحه‌های کاربران؛ پنل مدیریت و صفحه‌ی ورود ادمین پس‌زمینه ندارند
    if (document.body.classList.contains('admin-body')) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'geo-bg';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);
    document.body.classList.add('has-geo-bg');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ink = rgb('--on-surface', '#11212a');
    const brand = rgb('--primary-container', '#13877f');
    const grid = document.createElement('canvas'); // لایه‌ی ثابت شبکه (یک بار کشیده می‌شود)
    const gctx = grid.getContext('2d');
    let w = 0, h = 0, dpr = 1, opts = CONFIG, cells = [], waves = [];
    let raf = 0, last = 0, timer = 0;

    // مسیر یک شش‌ضلعی «نوک‌بالا» با مرکز (x,y)
    const hexPath = (c, x, y, s) => {
      c.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = Math.PI / 180 * (60 * i - 30);
        const px = x + s * Math.cos(a), py = y + s * Math.sin(a);
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
    };

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      opts = Object.assign({}, CONFIG, w < 640 ? MOBILE : {});
      [canvas, grid].forEach((c) => { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // مرکز همه‌ی شش‌ضلعی‌ها: ردیف‌ها با فاصله‌ی ۱.۵s، ردیف‌های فرد نیم‌خانه جابه‌جا
      const s = opts.size, cw = Math.sqrt(3) * s, rh = 1.5 * s;
      cells = [];
      for (let row = -1, y = 0; y < h + s * 2; row += 1, y = row * rh) {
        for (let x = (row % 2 ? cw / 2 : 0) - cw; x < w + cw; x += cw) cells.push({ x, y });
      }
      gctx.clearRect(0, 0, w, h);
      gctx.strokeStyle = 'rgba(' + ink + ',' + opts.lineAlpha + ')';
      gctx.lineWidth = 1;
      cells.forEach((c) => { hexPath(gctx, c.x, c.y, s); gctx.stroke(); });
      waves = [];
      if (reduced()) { spawn(w * 0.72, h * 0.3); waves[0].t = opts.ringDelay * 2; }
      draw();
    }

    // نقطه‌ای تصادفی که زیر کارت، متن یا دکمه نباشد (تا موج پنهان نماند)؛ حداکثر ۱۰ تلاش
    const SOLID = '.card, .btn, a, p, h1, h2, h3, li, .next-slots, .site-header, .topbar, .site-footer, .mobile-bar, input, select, textarea, .stat, .media';
    const freePoint = () => {
      let pt = [Math.random() * w, Math.random() * h];
      for (let i = 0; i < 10; i += 1) {
        const el = document.elementFromPoint(pt[0], pt[1]);
        if (!el || !el.closest(SOLID)) return pt;
        pt = [Math.random() * w, Math.random() * h];
      }
      return pt;
    };

    // یک موج جدید: شش‌ضلعی‌های اطراف یک نقطه، هر کدام با شماره‌ی حلقه‌اش
    function spawn(x, y) {
      const s = opts.size, cw = Math.sqrt(3) * s;
      const [ox, oy] = x == null ? freePoint() : [x, y];
      let origin = cells[0], best = Infinity;
      cells.forEach((c) => { const d = (c.x - ox) ** 2 + (c.y - oy) ** 2; if (d < best) { best = d; origin = c; } });
      const lit = [];
      cells.forEach((c) => {
        const ring = Math.round(Math.hypot(c.x - origin.x, c.y - origin.y) / cw);
        if (ring <= opts.rings && (ring === 0 || Math.random() > 0.25)) lit.push({ c, ring }); // چند خانه جا می‌افتند تا طبیعی‌تر باشد
      });
      waves.push({ lit, t: 0 });
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(grid, 0, 0, w, h);
      const s = opts.size;
      waves.forEach((wv) => {
        wv.lit.forEach(({ c, ring }) => {
          const local = wv.t - ring * opts.ringDelay; // هر حلقه کمی دیرتر روشن می‌شود
          if (local <= 0 || local >= opts.life) return;
          const p = local / opts.life;
          const k = Math.sin(Math.PI * p) * (1 - ring / (opts.rings + 1.5)); // نرم بالا و نرم پایین؛ حلقه‌های دورتر کم‌رنگ‌تر
          hexPath(ctx, c.x, c.y, s - 1.5);
          ctx.fillStyle = 'rgba(' + brand + ',' + (opts.fillAlpha * k) + ')';
          ctx.fill();
          ctx.strokeStyle = 'rgba(' + brand + ',' + (opts.edgeAlpha * k) + ')';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        });
      });
    }

    const waveDone = (wv) => wv.t > opts.rings * opts.ringDelay + opts.life;

    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - (last || now)) / 1000); // حداکثر ۵۰ms تا بعد از برگشت به تب پرش نکند
      last = now;
      waves.forEach((wv) => { wv.t += dt; });
      waves = waves.filter((wv) => !waveDone(wv));
      draw();
      if (waves.length) raf = requestAnimationFrame(frame);
      else last = 0; // موجی نمانده: حلقه متوقف می‌شود تا موج بعدی
    }

    // زمان‌بندی موج بعدی (با کمی تصادف تا یکنواخت نباشد)
    function schedule() {
      clearTimeout(timer);
      if (reduced() || document.hidden) return;
      timer = setTimeout(() => {
        if (waves.length < opts.maxWaves) spawn();
        if (!raf) raf = requestAnimationFrame(frame);
        schedule();
      }, opts.every * 1000 * (0.7 + Math.random() * 0.6));
    }

    let resizeT = 0;
    window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(resize, 150); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { clearTimeout(timer); if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
      else schedule();
    });
    reduceQuery.addEventListener('change', () => { resize(); schedule(); });

    resize();
    requestAnimationFrame(() => canvas.classList.add('is-ready'));
    if (!reduced()) { setTimeout(() => { spawn(); if (!raf) raf = requestAnimationFrame(frame); }, 900); } // اولین موج بعد از ورود hero
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
