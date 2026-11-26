/* ==========================================================
   animations.js — موتور آشکارسازی هنگام اسکرول + حرکت‌های کوچک (micro-interactions)
   در <head> بارگذاری می‌شود تا کلاس js قبل از نمایش صفحه روی <html> بنشیند.
   محتوای این سایت را JS بعد از دریافت داده می‌سازد؛ برای همین با MutationObserver
   هر عنصر تازه‌ساخته‌شده را هم پیدا می‌کنیم.
   ========================================================== */
(function () {
  'use strict';
  const root = document.documentElement;
  root.classList.add('js');

  window.Clinic = window.Clinic || {};
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = () => reduceQuery.matches;
  const MAX_STAGGER = 8; // بیش از ۸ آیتم پشت‌سرهم معطل نمی‌شوند

  /* ================= ۱) موتور آشکارسازی ================= */
  /* هر قانون: { sel: انتخابگر، effect: نوع حرکت، stagger: پله‌ای بودن آیتم‌های هم‌والد، admin: برای پنل مدیریت هم فعال باشد } */
  const RULES = [];
  const HOOKS = []; // کارهایی که هنگام دیده شدن عنصر انجام می‌شوند (مثل شمارش عدد)
  const register = (sel, effect, opts) => { RULES.push(Object.assign({ sel, effect, stagger: false, admin: false }, opts)); schedule(); };
  const onReveal = (sel, fn) => HOOKS.push({ sel, fn });

  const show = (el) => {
    el.classList.add('is-in');
    HOOKS.forEach((h) => { if (el.matches(h.sel)) h.fn(el); else el.querySelectorAll(h.sel).forEach(h.fn); });
    // بعد از پایان ورود، data-reveal برداشته می‌شود تا transitionهای خود عنصر (مثل hover کارت) دوباره عادی کار کنند
    const i = parseFloat(el.style.getPropertyValue('--i')) || 0;
    setTimeout(() => { el.removeAttribute('data-reveal'); el.classList.remove('is-in'); el.style.removeProperty('--i'); }, 760 + i * 70);
  };
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); show(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
    : null;

  const seen = new WeakSet(); // هر عنصر فقط یک‌بار آشکار می‌شود
  const scan = () => {
    if (reduce() || !io) return; // حرکت کمتر یا مرورگر قدیمی: هیچ‌چیز پنهان نمی‌شود
    const isAdmin = document.body.classList.contains('admin-body');
    RULES.forEach((r) => {
      if (isAdmin && !r.admin) return;
      const counters = new Map();
      document.querySelectorAll(r.sel).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        el.setAttribute('data-reveal', r.effect);
        if (r.stagger) {
          const n = counters.get(el.parentElement) || 0;
          counters.set(el.parentElement, n + 1);
          el.style.setProperty('--i', String(Math.min(n, MAX_STAGGER)));
        }
        io.observe(el);
      });
    });
  };
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(); });
  }

  /* ================= ۲) شمارش اعداد (۰ تا مقدار واقعی) ================= */
  const FA = '۰۱۲۳۴۵۶۷۸۹';
  const toLatin = (s) => s.replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٬,]/g, '');
  const countUp = (el) => {
    if (reduce() || el.dataset.counted) return;
    const raw = toLatin(el.textContent.trim());
    if (!/^\d+$/.test(raw)) return; // «—» یا متن: دست نمی‌خورد
    const target = Number(raw);
    if (!target) return;
    el.dataset.counted = '1';
    const fmt = new Intl.NumberFormat('fa-IR');
    const final = el.textContent;
    const dur = 900; const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // شروع سریع، پایان نرم
      el.textContent = p < 1 ? fmt.format(Math.round(target * eased)) : final;
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = fmt.format(0);
    requestAnimationFrame(step);
  };

  /* ================= ۳) حرکت‌های کوچک (micro-interactions) ================= */
  // هدر هنگام اسکرول سایه می‌گیرد (ارتفاعش عوض نمی‌شود، پس صفحه تکان نمی‌خورد)
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const h = document.querySelector('.site-header');
      if (h) h.classList.toggle('is-scrolled', window.scrollY > 8);
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // نوبت‌دهی: جهت رفتن به مرحله‌ی بعد/قبل برای لغزیدن از سمت درست
  // و «ساکت» کردن نوار روزها وقتی کاربر فقط روی یک روز کلیک می‌کند (تا همه‌ی روزها دوباره انیمیشن نگیرند)
  document.addEventListener('click', (e) => {
    const step = document.getElementById('step');
    if (step && e.target.closest('#panel')) {
      const dir = e.target.closest('[data-next]') ? 'next' : e.target.closest('[data-back]') ? 'back' : '';
      if (dir) { step.dataset.dir = dir; clearTimeout(step._t); step._t = setTimeout(() => { delete step.dataset.dir; }, 700); }
      if (e.target.closest('[data-date]')) {
        const panel = document.getElementById('panel');
        panel.dataset.quiet = '1'; clearTimeout(panel._q); panel._q = setTimeout(() => { delete panel.dataset.quiet; }, 600);
      }
    }
  }, true); // capture: قبل از کد خود صفحه اجرا شود

  /* انیمیشن خروج برای مودال، کشوی پنل و اعلان‌ها
     کد سایت این عنصرها را با el.remove() حذف می‌کند. اینجا remove را برای فقط همین سه نوع عنصر
     ۲۰۰ میلی‌ثانیه به تأخیر می‌اندازیم تا انیمیشن خروج (کلاس is-leaving در CSS) دیده شود.
     برای حذف این رفتار، کل این بلوک را پاک کنید. */
  const LEAVING = '.modal, .adrawer, .toast';
  const nativeRemove = Element.prototype.remove;
  Element.prototype.remove = function () {
    if (!reduce() && !this.__leaving && this.isConnected && this.matches && this.matches(LEAVING)) {
      this.__leaving = true;
      this.classList.add('is-leaving');
      setTimeout(() => nativeRemove.call(this), 200);
      return undefined;
    }
    return nativeRemove.call(this);
  };

  /* ================= ۴) راه‌اندازی ================= */
  const start = () => {
    scan(); onScroll();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // اگر کاربر وسط کار «حرکت کمتر» را روشن کرد، هر چه پنهان مانده فوراً دیده شود
  reduceQuery.addEventListener('change', () => { if (reduce()) document.querySelectorAll('[data-reveal]').forEach((el) => el.removeAttribute('data-reveal')); });

  Clinic.motion = { register, onReveal, reduce, countUp };

  /* ================= ۵) قانون‌های هر بخش =================
     ترتیب مهم است: اولین قانونی که با یک عنصر جور شود برنده است، پس قانون‌های خاص‌تر بالاترند. */
  // --- سرتیترها ---
  register('.section-head, .section__head', 'rise');
  // --- خانه ---
  register('.stats > .stat', 'rise', { stagger: true });
  onReveal('.stat__value', countUp);
  register('.why .card__icon', 'bloom');
  register('.grid > .why', 'fade', { stagger: true });
  register('.grid > .branch-card', 'start', { stagger: true });
  register('.article-card .media', 'mask');
  register('.grid > .article-card', 'fade', { stagger: true });
  register('.cta-band', 'scale');
  // --- شبکه‌ی کارت‌ها (خدمات، زخم‌ها، تیم، …) ---
  register('.grid > .card--link, .grid > .card', 'rise', { stagger: true });
  register('.grid > .case-card, .grid > .video-card, .grid > .member', 'scale', { stagger: true });
  // --- صفحه‌های جزئیات و مقاله: متن طولانی فقط محو می‌شود، بدون جابه‌جایی ---
  register('.prose > *, .article-body > *', 'fade');
  register('.sidebar > *', 'fade', { stagger: true });
  register('.accordion > .acc-item', 'rise', { stagger: true });
  register('.map-box', 'mask');
  register('.disclaimer, .toolbar', 'fade');
  register('.not-found > *', 'rise', { stagger: true });
  // --- نوبت‌دهی و پیگیری ---
  register('.booking__side > *', 'fade', { stagger: true });
  register('.narrow > form.card', 'rise');
  // --- فوتر ---
  register('.footer__grid > .footer__col', 'fade', { stagger: true });
  // --- پنل مدیریت (سبک) ---
  register('.kpis > .kpi', 'rise', { stagger: true, admin: true });
  onReveal('.kpi__value', countUp);
})();
