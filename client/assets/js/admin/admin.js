/* ==========================================================
   admin.js — پنل مدیریت (SPA با مسیرهای hash)
   بخش‌ها بر اساس نقش:
     همه                       داشبورد، حساب من
     مدیر ارشد + پذیرش          نوبت‌ها، تقویم روزانه، بیماران، پیام‌ها
     مدیر ارشد + مدیر محتوا     محتوا، شعبه‌ها و برنامه‌ی نوبت‌دهی، آمار، اطلاعات کلینیک
     مدیر ارشد                  مدیران، گزارش فعالیت
   ========================================================== */
(function () {
  'use strict';
  window.Clinic = window.Clinic || {}; Clinic.pages = Clinic.pages || {};
  const { $, $$, esc, faDateTime, faNumber, toast, debounce, lines, pairsFromText, pairsToText, normalizeDigits } = Clinic.utils;
  const S = Clinic.schedule;
  const icon = Clinic.icon, ui = Clinic.ui, api = Clinic.api;
  const app = () => document.getElementById('app');
  const ROLE = api.roles;
  const DESK = ['super_admin', 'receptionist'];
  const CONTENT = ['super_admin', 'content_manager'];
  const SUPER = ['super_admin'];
  const WOUND_CATS = [['diabetic', 'دیابتی'], ['pressure', 'بستر'], ['venous', 'وریدی'], ['arterial', 'شریانی'], ['burn', 'سوختگی'], ['surgical', 'جراحی']];
  const WOUND = { diabetic: 'زخم پای دیابتی', pressure: 'زخم بستر', venous: 'زخم وریدی', arterial: 'زخم شریانی', burn: 'سوختگی', surgical: 'زخم جراحی', unknown: 'نامشخص / سایر' };
  const TONE = { 'جدید': 'info', 'در حال بررسی': 'warning', 'تأیید شده': 'success', 'تکمیل شده': 'primary', 'لغو شده': 'danger', 'عدم مراجعه': 'neutral' };
  const SOURCE = { online: 'آنلاین', phone: 'تلفنی', walk_in: 'حضوری', admin: 'پنل' };
  const ACTION = { login: 'ورود', login_failed: 'ورود ناموفق', login_locked: 'ورود مسدود', logout_all: 'خروج از همه‌ی دستگاه‌ها', password_change: 'تغییر رمز', create: 'ایجاد', update: 'ویرایش', delete: 'حذف', upload: 'بارگذاری' };
  const HIST = { created: 'ثبت نوبت', status: 'تغییر وضعیت', reschedule: 'جابجایی زمان', note: 'یادداشت داخلی', assign: 'تعیین مسئول', cancel: 'لغو توسط بیمار' };
  const statusBadge = (s) => '<span class="badge badge--' + (TONE[s] || 'neutral') + ' badge--dot">' + esc(s) + '</span>';
  const when = (a) => (a.date ? '<span class="when"><strong>' + S.faTime(a.time) + '</strong><span>' + S.faShort(a.date) + '</span></span>' : '<span class="muted small">بدون زمان</span>');
  const DEMO_HTML = '<div class="demo-banner">' + icon('info', 'icon--sm') + 'حالت نمایشی: سرور وصل نیست و داده‌ها فقط در همین مرورگر ذخیره می‌شوند.</div>';
  const demo = () => (api.mode === 'mock' ? DEMO_HTML : '');
  let session = null;
  let teamCache = null;
  let branchCache = null;
  const can = (roles) => session && roles.includes(session.role);
  const team = async () => (teamCache = teamCache || (await api.get('/team')).data);
  const branches = async () => (branchCache = branchCache || (await api.get('/branches')).data);

  // ---------- پیکربندی CRUD محتوا ----------
  const T = (name, label, extra) => Object.assign({ name, label, type: 'text' }, extra);
  const CRUD = {
    services: { title: 'خدمات', icon: 'layers', cols: ['title', 'order', 'published'], fields: [T('title', 'عنوان', { req: 1 }), T('slug', 'نشانی (slug)'), T('summary', 'خلاصه', { type: 'textarea' }), T('intro', 'مقدمه', { type: 'textarea' }), T('description', 'توضیح کامل', { type: 'textarea' }), T('applications', 'کاربردها (هر خط یک مورد)', { type: 'lines' }), T('process', 'مراحل (هر خط یک مورد)', { type: 'lines' }), T('considerations', 'نکات (هر خط یک مورد)', { type: 'lines' }), T('faqs', 'سؤالات متداول (هر خط: سؤال | پاسخ)', { type: 'faq' }), T('order', 'ترتیب', { type: 'number' }), T('published', 'منتشر شود', { type: 'check' })] },
    wounds: { title: 'انواع زخم', icon: 'activity', cols: ['title', 'order', 'published'], fields: [T('title', 'عنوان', { req: 1 }), T('slug', 'نشانی (slug)'), T('en', 'عنوان انگلیسی'), T('intro', 'مقدمه', { type: 'textarea' }), T('causes', 'علل', { type: 'lines' }), T('symptoms', 'علائم', { type: 'lines' }), T('warnings', 'علائم هشدار', { type: 'lines' }), T('approaches', 'رویکرد درمان', { type: 'lines' }), T('whenToSeek', 'چه زمانی مراجعه کنیم', { type: 'textarea' }), T('faqs', 'سؤالات متداول', { type: 'faq' }), T('order', 'ترتیب', { type: 'number' }), T('published', 'منتشر شود', { type: 'check' })] },
    branches: { title: 'شعبه‌ها و نوبت‌دهی', icon: 'pin', cols: ['name', 'booking', 'active'], wide: true, fields: [T('name', 'نام شعبه', { req: 1 }), T('slug', 'نشانی (slug)'), T('city', 'شهر'), T('address', 'آدرس', { type: 'textarea' }), T('mapUrl', 'لینک نقشه (embed)'), T('homeVisit', 'ویزیت در منزل دارد', { type: 'check' }), T('order', 'ترتیب', { type: 'number' }), T('active', 'فعال', { type: 'check' }), T('booking', 'برنامه‌ی نوبت‌دهی', { type: 'schedule' })] },
    team: { title: 'تیم درمان', icon: 'users', cols: ['name', 'title', 'active'], fields: [T('name', 'نام', { req: 1 }), T('title', 'سمت'), T('phone', 'شماره تماس عمومی'), T('education', 'تحصیلات'), T('qualifications', 'مدارک'), T('specialization', 'تخصص'), T('bio', 'معرفی', { type: 'textarea' }), T('order', 'ترتیب', { type: 'number' }), T('active', 'فعال', { type: 'check' })] },
    gallery: { title: 'گالری قبل و بعد', icon: 'image', cols: ['title', 'category', 'published'], needConsent: true, fields: [T('title', 'عنوان', { req: 1 }), T('category', 'نوع زخم', { type: 'select', options: WOUND_CATS }), T('beforeImage', 'عکس قبل از درمان', { type: 'image' }), T('afterImage', 'عکس بعد از درمان', { type: 'image' }), T('method', 'روش درمان'), T('duration', 'مدت درمان'), T('description', 'توضیحات نمونه‌کار', { type: 'textarea' }), T('consent', 'رضایت‌نامه‌ی کتبی بیمار دریافت شده', { type: 'check' }), T('published', 'منتشر شود (فقط با رضایت)', { type: 'check' }), T('order', 'ترتیب', { type: 'number' })] },
    testimonials: { title: 'ویدیوهای رضایت', icon: 'video', cols: ['title', 'category', 'published'], needConsent: true, fields: [T('title', 'عنوان', { req: 1 }), T('category', 'دسته', { type: 'select', options: WOUND_CATS }), T('description', 'توضیح', { type: 'textarea' }), T('videoUrl', 'آدرس ویدیو'), T('consent', 'رضایت‌نامه‌ی کتبی بیمار دریافت شده', { type: 'check' }), T('published', 'منتشر شود (فقط با رضایت)', { type: 'check' }), T('order', 'ترتیب', { type: 'number' })] },
    articles: { title: 'مقالات', icon: 'file', cols: ['title', 'category', 'published'], fields: [T('title', 'عنوان', { req: 1 }), T('slug', 'نشانی (slug)'), T('category', 'دسته', { type: 'select', options: [['patient-education', 'آموزش بیمار'], ['home-care', 'مراقبت در منزل'], ['prevention', 'پیشگیری']] }), T('excerpt', 'خلاصه', { type: 'textarea' }), T('body', 'متن (هر خط یک پاراگراف)', { type: 'lines' }), T('published', 'منتشر شود', { type: 'check' })] },
    journal: { title: 'ژورنال تاک', icon: 'book', cols: ['title', 'category', 'published'], fields: [T('title', 'عنوان', { req: 1 }), T('slug', 'نشانی (slug)'), T('category', 'دسته', { type: 'select', options: [['clinical-review', 'مرور بالینی'], ['practitioner-education', 'آموزش درمانگران']] }), T('excerpt', 'خلاصه', { type: 'textarea' }), T('body', 'متن (هر خط یک پاراگراف)', { type: 'lines' }), T('published', 'منتشر شود', { type: 'check' })] },
    users: { title: 'مدیران و کاربران', icon: 'lock', only: SUPER, cols: ['name', 'email', 'role', 'active'], fields: [T('name', 'نام', { req: 1 }), T('email', 'ایمیل', { req: 1 }), T('role', 'نقش', { type: 'select', options: [['receptionist', 'پذیرش (نوبت‌ها و بیماران)'], ['content_manager', 'مدیر محتوا'], ['super_admin', 'مدیر ارشد (همه‌ی دسترسی‌ها)']] }), T('password', 'رمز عبور (حداقل ۱۰ نویسه، حرف و عدد؛ هنگام ویرایش خالی = بدون تغییر)', { type: 'password' }), T('active', 'حساب فعال', { type: 'check' })] },
  };
  const COLNAME = { title: 'عنوان', name: 'نام', order: 'ترتیب', published: 'وضعیت', active: 'وضعیت', phone: 'تلفن', category: 'دسته', email: 'ایمیل', role: 'نقش', booking: 'نوبت‌دهی' };
  const cell = (it, c) => {
    const v = it[c];
    if (c === 'published' || c === 'active') return v === false ? '<span class="badge">غیرفعال</span>' : '<span class="badge badge--success">فعال</span>';
    if (c === 'role') return '<span class="badge badge--primary">' + esc(ROLE[v] || v) + '</span>';
    if (c === 'booking') { const s = S.settingsOf(it); return s.enabled ? '<span class="small">هر ' + faNumber(s.slotMinutes) + ' دقیقه · ظرفیت ' + faNumber(s.capacity) + '</span>' : '<span class="badge badge--warning">خاموش</span>'; }
    return esc(v == null || v === '' ? '—' : v);
  };

  const NAV = [
    ['dashboard', 'داشبورد', 'grid', null],
    ['g', 'پذیرش', DESK], ['appointments', 'نوبت‌ها', 'calendar', DESK], ['calendar', 'تقویم روزانه', 'clock', DESK], ['patients', 'بیماران', 'users', DESK], ['messages', 'پیام‌ها', 'inbox', DESK],
    ['g', 'محتوای سایت', CONTENT], ['branches', 'شعبه‌ها و نوبت‌دهی', 'pin', CONTENT], ['services', 'خدمات', 'layers', CONTENT], ['wounds', 'انواع زخم', 'activity', CONTENT], ['team', 'تیم درمان', 'stethoscope', CONTENT], ['gallery', 'گالری', 'image', CONTENT], ['testimonials', 'ویدیوهای رضایت', 'video', CONTENT], ['articles', 'مقالات', 'file', CONTENT], ['journal', 'ژورنال تاک', 'book', CONTENT],
    ['g', 'تنظیمات', null], ['statistics', 'آمار سایت', 'chart', CONTENT], ['settings', 'اطلاعات کلینیک', 'settings', CONTENT], ['users', 'مدیران', 'lock', SUPER], ['audit', 'گزارش فعالیت', 'clipboard', SUPER], ['profile', 'حساب من', 'user', null],
  ];
  const ACCESS = NAV.reduce((o, n) => { if (n[0] !== 'g') o[n[0]] = n[3]; return o; }, {});

  // ---------- کشوی کناری (drawer) دسترس‌پذیر ----------
  const drawer = ({ title, body, wide, onClose }) => {
    const prev = document.activeElement;
    const el = document.createElement('div'); el.className = 'adrawer';
    el.innerHTML = '<div class="adrawer__panel' + (wide ? ' adrawer__panel--wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><header class="adrawer__head"><h2>' + esc(title) + '</h2><button type="button" class="btn btn--subtle btn--icon" data-x aria-label="بستن">' + icon('x') + '</button></header><div class="adrawer__body">' + (body || '') + '</div></div>';
    document.body.appendChild(el); document.body.classList.add('no-scroll');
    const close = () => { if (!el.isConnected) return; el.remove(); document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); if (onClose) onClose(); };
    const onKey = (e) => { const all = $$('.adrawer'); if (e.key === 'Escape' && all[all.length - 1] === el) close(); };
    el._close = close;
    document.addEventListener('keydown', onKey);
    el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
    $('[data-x]', el).addEventListener('click', close);
    setTimeout(() => { const f = $('.adrawer__body input:not([type=hidden]),.adrawer__body textarea,.adrawer__body select,.adrawer__body button', el) || $('[data-x]', el); f.focus(); }, 30);
    return { el, body: $('.adrawer__body', el), close };
  };
  const confirmBox = (msg) => window.confirm(msg);

  // ---------- ورود ----------
  Clinic.pages['admin-login'] = { async init() {
    await api.detect();
    if (api.mode === 'real') { try { await api.get('/auth/me'); location.replace('index.html'); return; } catch (e) { /* وارد نشده */ } }
    else if (api.session()) { location.replace('index.html'); return; }
    const mock = api.mode === 'mock';
    app().innerHTML = demo() + '<div class="login-wrap"><div class="login-art" aria-hidden="true"><div class="login-art__inner"><span class="brand__mark">' + icon('cross', 'icon--lg') + '</span><h2>پنل مدیریت کلینیک</h2><p>نوبت‌ها، بیماران و محتوای سایت را از یک‌جا مدیریت کنید.</p>' +
      '<ul><li>' + icon('check-circle', 'icon--sm') + 'تقویم روزانه و ظرفیت هر ساعت</li><li>' + icon('check-circle', 'icon--sm') + 'پرونده و سابقه‌ی مراجعه‌ی بیماران</li><li>' + icon('check-circle', 'icon--sm') + 'گزارش کامل فعالیت مدیران</li></ul></div></div>' +
      '<form class="login-card" id="lf" novalidate><div><h1>ورود به پنل</h1><p class="muted">با ایمیل و رمز عبور مدیریتی وارد شوید.</p></div>' +
      (mock ? '<div class="alert alert--warning">' + icon('info', 'icon--sm') + '<div>حالت نمایشی: هر ایمیل معتبر و رمز حداقل ۸ نویسه پذیرفته می‌شود.</div></div>' : '') +
      '<div class="field"><label for="email">ایمیل</label><input class="input ltr" id="email" name="email" type="email" autocomplete="username" required><p class="field__error" id="e-email" role="alert"></p></div>' +
      '<div class="field"><label for="password">رمز عبور</label><div class="pw"><input class="input ltr" id="password" name="password" type="password" autocomplete="current-password" required><button type="button" class="btn btn--subtle btn--icon btn--sm" id="pwt" aria-label="نمایش رمز">' + icon('eye', 'icon--sm') + '</button></div><p class="field__error" id="e-password" role="alert"></p></div>' +
      (mock ? '<div class="field"><label for="role">نقش (نمایشی)</label><select class="select" id="role" name="role">' + Object.keys(ROLE).map((k) => '<option value="' + k + '">' + ROLE[k] + '</option>').join('') + '</select></div>' : '') +
      '<button class="btn btn--primary btn--lg btn--block" type="submit">ورود</button><a class="small center" href="../index.html">بازگشت به سایت</a></form></div>';
    $('#pwt').addEventListener('click', () => { const p = $('#password'); p.type = p.type === 'password' ? 'text' : 'password'; });
    $('#lf').addEventListener('submit', async (e) => {
      e.preventDefault(); $$('.field__error').forEach((p) => { p.textContent = ''; });
      const btn = $('button[type=submit]', e.target); btn.classList.add('is-loading');
      try { await api.post('/auth/login', Object.fromEntries(new FormData(e.target))); location.href = 'index.html'; }
      catch (err) { Object.entries(err.errors || {}).forEach(([k, v]) => { const el = $('#e-' + k); if (el) el.textContent = v; }); toast(err.message, 'error'); btn.classList.remove('is-loading'); }
    });
  } };

  // ---------- پوسته ----------
  Clinic.pages.admin = { async init() {
    await api.detect();
    try { session = (await api.get('/auth/me')).data; } catch (e) { location.replace('login.html'); return; }
    const visible = NAV.filter((n) => !n[n[0] === 'g' ? 2 : 3] || can(n[n[0] === 'g' ? 2 : 3]));
    const nav = visible.map((n) => n[0] === 'g' ? '<div class="admin-nav__group">' + n[1] + '</div>' : '<a href="#/' + n[0] + '" data-r="' + n[0] + '">' + icon(n[2], 'icon--sm') + '<span>' + n[1] + '</span><span class="admin-nav__count" data-count="' + n[0] + '"></span></a>').join('');
    const initials = esc(String(session.name || session.email).trim().slice(0, 1));
    app().innerHTML = demo() + '<div class="admin-shell"><aside class="admin-side" id="side"><div class="admin-side__brand"><a class="brand" href="#/dashboard"><span class="brand__mark">' + icon('cross') + '</span><span class="brand__text"><span class="brand__name">پنل مدیریت</span><span class="brand__tag">کلینیک زخم</span></span></a>' +
      '<button class="btn btn--subtle btn--icon admin-side__close" id="mc" aria-label="بستن منو">' + icon('x') + '</button></div><nav class="admin-nav" aria-label="منوی مدیریت">' + nav + '</nav>' +
      '<a class="admin-side__site" href="../index.html" target="_blank" rel="noopener">' + icon('eye', 'icon--sm') + 'مشاهده‌ی سایت</a></aside><div class="admin-scrim" id="scrim"></div>' +
      '<div class="admin-main"><header class="admin-top"><button class="btn btn--subtle btn--icon admin-top__menu" id="mt" aria-label="منو" aria-controls="side">' + icon('menu') + '</button>' +
      (can(DESK) ? '<form class="admin-search" id="gs" role="search"><label class="sr-only" for="gq">جستجوی نوبت</label>' + icon('search', 'icon--sm') + '<input id="gq" type="search" placeholder="جستجوی نوبت: نام، موبایل یا شماره‌ی پیگیری"></form>' : '<span class="spacer"></span>') +
      (can(DESK) ? '<button class="btn btn--primary btn--sm" id="na">' + icon('plus', 'icon--sm') + '<span class="hide-sm">نوبت جدید</span></button>' : '') +
      '<div class="user-menu"><button class="user-menu__btn" id="um" aria-haspopup="true" aria-expanded="false"><span class="avatar">' + initials + '</span><span class="user-menu__text"><strong>' + esc(session.name || session.email) + '</strong><small>' + esc(ROLE[session.role] || session.role) + '</small></span>' + icon('chevron-down', 'icon--sm') + '</button>' +
      '<div class="user-menu__pop" id="ump" hidden><div class="user-menu__email ltr">' + esc(session.email) + '</div><a href="#/profile">' + icon('user', 'icon--sm') + 'حساب من و تغییر رمز</a><a href="../index.html" target="_blank" rel="noopener">' + icon('eye', 'icon--sm') + 'مشاهده‌ی سایت</a><button type="button" id="lo">' + icon('logout', 'icon--sm') + 'خروج</button></div></div></header>' +
      '<main id="view" class="admin-content" tabindex="-1"></main></div></div>';

    const side = $('#side'), scrim = $('#scrim');
    const openSide = (on) => { side.classList.toggle('is-open', on); scrim.classList.toggle('is-open', on); };
    $('#mt').addEventListener('click', () => openSide(true));
    $('#mc').addEventListener('click', () => openSide(false));
    scrim.addEventListener('click', () => openSide(false));
    side.addEventListener('click', (e) => { if (e.target.closest('a')) openSide(false); });
    const um = $('#um'), ump = $('#ump');
    um.addEventListener('click', (e) => { e.stopPropagation(); ump.hidden = !ump.hidden; um.setAttribute('aria-expanded', String(!ump.hidden)); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.user-menu')) { ump.hidden = true; um.setAttribute('aria-expanded', 'false'); } });
    $('#lo').addEventListener('click', async () => { await api.post('/auth/logout'); location.href = 'login.html'; });
    if ($('#gs')) $('#gs').addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#/appointments?q=' + encodeURIComponent($('#gq').value.trim()); });
    if ($('#na')) $('#na').addEventListener('click', () => newAppointment({}));
    window.addEventListener('hashchange', route); route();
    refreshCounts();
  } };

  const refreshCounts = async () => {
    try {
      const d = (await api.get('/admin/dashboard')).data;
      const set = (k, n) => { const el = $('[data-count="' + k + '"]'); if (el) el.textContent = n ? faNumber(n) : ''; };
      if (can(DESK)) { set('appointments', d.appointmentsNew); set('messages', d.messagesUnread); }
    } catch (e) { /* ignore */ }
  };

  const params = () => new URLSearchParams((location.hash.split('?')[1] || ''));
  const route = () => {
    $$('.adrawer').forEach((x) => x._close && x._close()); // با تغییر صفحه، کشوهای باز بسته شوند
    const r =(location.hash.replace('#/', '') || 'dashboard').split('?')[0];
    $$('.admin-nav a').forEach((a) => { if (a.dataset.r === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const v = $('#view'); v.innerHTML = '<div class="skeleton" style="height:44px;width:240px"></div><div class="skeleton skeleton-card"></div>';
    const views = { dashboard, appointments, calendar, patients, messages, settings: singleForm, statistics: singleForm, audit, profile };
    const fn = views[r] || (CRUD[r] ? crud : null);
    if (!fn) { v.innerHTML = ui.state({ type: 'error', title: 'صفحه پیدا نشد' }); return; }
    if (ACCESS[r] && !can(ACCESS[r])) { v.innerHTML = ui.state({ type: 'error', title: 'دسترسی ندارید', text: 'این بخش برای نقش شما فعال نیست.' }); return; }
    document.title = ((NAV.find((n) => n[0] === r) || [])[1] || 'پنل') + ' | پنل مدیریت';
    fn(r, v).then(() => v.focus({ preventScroll: true })).catch((e) => { v.innerHTML = ui.state({ type: 'error', title: e.message || 'خطا', text: e.status === 403 ? 'این بخش برای نقش شما فعال نیست.' : 'دوباره تلاش کنید.' }); if (e.status === 401) location.replace('login.html'); });
  };
  const head = (t, sub, right) => '<div class="admin-title"><div><h1>' + t + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><div class="row">' + (right || '') + '</div></div>';

  // ================= داشبورد =================
  async function dashboard(r, v) {
    const d = (await api.get('/admin/dashboard')).data;
    const desk = can(DESK);
    const kpi = (ic, val, label, hint, href, tone) => '<' + (href ? 'a href="' + href + '"' : 'div') + ' class="kpi' + (tone ? ' kpi--' + tone : '') + '"><span class="kpi__icon">' + icon(ic) + '</span><div><div class="kpi__value">' + faNumber(val) + '</div><div class="kpi__label">' + label + '</div>' + (hint ? '<div class="kpi__hint">' + hint + '</div>' : '') + '</div></' + (href ? 'a' : 'div') + '>';
    const hello = '<div class="admin-title"><div><h1>سلام، ' + esc(session.name || '') + '</h1><p>' + S.faFull(d.today) + '</p></div>' + (desk ? '<div class="row"><a class="btn btn--secondary" href="#/calendar">' + icon('clock', 'icon--sm') + 'تقویم امروز</a></div>' : '') + '</div>';
    if (!desk) {
      v.innerHTML = hello + '<div class="kpis">' + kpi('file', d.articlesTotal, 'مقاله و ژورنال', '', '#/articles') + kpi('users', d.patientsTotal, 'بیمار ثبت‌شده', '') + kpi('calendar', d.weekTotal, 'نوبت در ۷ روز آینده', '') + '</div>' +
        '<div class="card"><h2>دسترسی سریع</h2><div class="quick">' + [['branches', 'pin', 'شعبه‌ها و برنامه‌ی نوبت‌دهی'], ['services', 'layers', 'خدمات'], ['articles', 'file', 'مقالات'], ['settings', 'settings', 'اطلاعات کلینیک']].map((x) => '<a href="#/' + x[0] + '">' + icon(x[1]) + x[2] + '</a>').join('') + '</div></div>';
      return;
    }
    const max = Math.max(1, ...d.week.map((x) => x.count));
    const chart = '<div class="bars" role="img" aria-label="نوبت‌های ۷ روز آینده">' + d.week.map((x, i) => '<a class="bars__col" href="#/calendar?date=' + x.date + '" title="' + S.faFull(x.date) + ': ' + faNumber(x.count) + ' نوبت">' +
      '<span class="bars__val">' + faNumber(x.count) + '</span><span class="bars__track"><span class="bars__bar" style="height:' + Math.max(x.count ? 6 : 0, Math.round(x.count / max * 100)) + '%"></span></span><span class="bars__lbl">' + (i === 0 ? 'امروز' : S.WEEKDAYS[x.weekday]) + '</span></a>').join('') + '</div>' +
      '<table class="sr-only"><caption>نوبت‌های ۷ روز آینده</caption><tbody>' + d.week.map((x) => '<tr><th>' + S.faFull(x.date) + '</th><td>' + faNumber(x.count) + '</td></tr>').join('') + '</tbody></table>';
    const totalStatus = d.byStatus.reduce((s, x) => s + x.count, 0) || 1;
    const statusList = '<ul class="status-list">' + d.byStatus.map((x) => '<li><a href="#/appointments?status=' + encodeURIComponent(x.status) + '">' + statusBadge(x.status) + '<span class="status-list__bar"><span class="tone-' + TONE[x.status] + '" style="width:' + Math.round(x.count / totalStatus * 100) + '%"></span></span><strong>' + faNumber(x.count) + '</strong></a></li>').join('') + '</ul>';
    const agenda = d.todayList.length ? '<ul class="agenda">' + d.todayList.map((a) => '<li><button type="button" data-open="' + a.id + '"><span class="agenda__time">' + S.faTime(a.time) + '</span><span class="agenda__who"><strong>' + esc(a.fullName) + '</strong><small>' + esc(a.branchName || a.branch) + ' · ' + (a.visitType === 'home' ? 'منزل' : 'کلینیک') + '</small></span>' + statusBadge(a.status) + '</button></li>').join('') + '</ul>'
      : ui.state({ title: 'امروز نوبتی ثبت نشده است', text: 'نوبت‌های تلفنی را با دکمه‌ی «نوبت جدید» ثبت کنید.' });
    v.innerHTML = hello + '<div class="kpis">' +
      kpi('calendar', d.todayCount, 'نوبت امروز', '', '#/calendar', 'primary') + kpi('alert', d.appointmentsNew, 'در انتظار بررسی', 'وضعیت «جدید»', '#/appointments?status=' + encodeURIComponent('جدید'), d.appointmentsNew ? 'warning' : '') +
      kpi('activity', d.weekTotal, '۷ روز آینده', '', '#/appointments?range=week') + kpi('users', d.patientsTotal, 'بیمار', '', '#/patients') + kpi('inbox', d.messagesUnread, 'پیام خوانده‌نشده', '', '#/messages', d.messagesUnread ? 'warning' : '') + '</div>' +
      '<div class="cols"><section class="card col-lg-8"><div class="card-head"><h2>بار کاری هفته‌ی پیش رو</h2><span class="muted small">مجموع ' + faNumber(d.weekTotal) + ' نوبت</span></div>' + chart + '</section>' +
      '<section class="card col-lg-4"><div class="card-head"><h2>وضعیت همه‌ی نوبت‌ها</h2></div>' + statusList + '</section>' +
      '<section class="card col-lg-7"><div class="card-head"><h2>برنامه‌ی امروز</h2><a class="btn btn--ghost btn--sm" href="#/calendar">تقویم</a></div>' + agenda + '</section>' +
      '<section class="card col-lg-5"><div class="card-head"><h2>آخرین ثبت‌ها</h2><a class="btn btn--ghost btn--sm" href="#/appointments">همه</a></div>' +
      (d.recent.length ? '<ul class="feed">' + d.recent.map((a) => '<li><button type="button" data-open="' + a.id + '"><span class="feed__dot tone-' + TONE[a.status] + '"></span><span><strong>' + esc(a.fullName) + '</strong><small>' + (a.date ? S.faShort(a.date) + ' · ' + S.faTime(a.time) : '—') + ' · ' + esc(SOURCE[a.source] || 'آنلاین') + '</small></span><small class="muted">' + faDateTime(a.createdAt) + '</small></button></li>').join('') + '</ul>' : '<p class="muted">هنوز نوبتی ثبت نشده است.</p>') + '</section></div>';
    v.onclick = (e) => { const b = e.target.closest('[data-open]'); if (b) openAppointment(b.dataset.open, () => dashboard(r, v)); };
  }

  // ================= نوبت‌ها =================
  const RANGES = [['today', 'امروز'], ['tomorrow', 'فردا'], ['week', '۷ روز آینده'], ['upcoming', 'همه‌ی آینده'], ['all', 'همه']];
  const rangeQuery = (k) => {
    const t = S.localDate();
    if (k === 'today') return '&date=' + t;
    if (k === 'tomorrow') return '&date=' + S.addDays(t, 1);
    if (k === 'week') return '&from=' + t + '&to=' + S.addDays(t, 6);
    if (k === 'upcoming') return '&upcoming=1';
    return '';
  };
  async function appointments(r, v) {
    const p = params();
    const st = { q: p.get('q') || '', status: p.get('status') || 'all', branch: 'all', range: p.get('range') || (p.get('q') || p.get('status') ? 'all' : 'upcoming'), page: 1 };
    const br = await branches();
    v.innerHTML = head('نوبت‌ها', 'همه‌ی نوبت‌های آنلاین و تلفنی', '<button class="btn btn--primary" id="add">' + icon('plus', 'icon--sm') + 'نوبت جدید</button>') +
      '<div class="toolbar-card"><div class="chips" role="tablist" aria-label="بازه‌ی زمانی">' + RANGES.map((x) => '<button type="button" class="chip" role="tab" data-range="' + x[0] + '" aria-selected="' + (x[0] === st.range) + '">' + x[1] + '</button>').join('') + '</div>' +
      '<div class="filters"><div class="search"><label class="sr-only" for="aq">جستجو</label>' + icon('search') + '<input class="input" id="aq" type="search" placeholder="نام، موبایل یا شماره‌ی پیگیری" value="' + esc(st.q) + '"></div>' +
      '<select class="select" id="as" aria-label="وضعیت"><option value="all">همه‌ی وضعیت‌ها</option>' + api.statuses.map((s) => '<option' + (s === st.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>' +
      '<select class="select" id="ab" aria-label="شعبه"><option value="all">همه‌ی شعبه‌ها</option>' + br.map((b) => '<option value="' + esc(b.slug) + '">' + esc(b.name) + '</option>').join('') + '</select></div></div><div id="tb"></div>';
    const draw = async () => {
      const res = await api.get('/admin/appointments?q=' + encodeURIComponent(st.q) + '&status=' + encodeURIComponent(st.status) + '&branch=' + encodeURIComponent(st.branch) + rangeQuery(st.range) + '&page=' + st.page + '&limit=15');
      $('#tb').innerHTML = res.data.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>زمان</th><th>بیمار</th><th>شعبه</th><th>نوع</th><th>وضعیت</th><th>پیگیری</th><th><span class="sr-only">عملیات</span></th></tr></thead><tbody>' +
        res.data.map((a) => '<tr class="is-clickable" data-open="' + a.id + '"><td>' + when(a) + '</td><td><strong>' + esc(a.fullName) + '</strong><div class="small muted ltr-text">' + esc(a.phone) + '</div></td><td>' + esc(a.branchName || a.branch) + '</td>' +
          '<td><span class="small">' + (a.visitType === 'home' ? 'منزل' : 'کلینیک') + ' · ' + esc(SOURCE[a.source] || 'آنلاین') + '</span></td>' +
          '<td><select class="select status-select tone-sel-' + TONE[a.status] + '" data-st="' + a.id + '" aria-label="وضعیت نوبت ' + esc(a.fullName) + '">' + api.statuses.map((s) => '<option' + (s === a.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></td>' +
          '<td class="mono small ltr-text">' + esc(a.referenceNumber) + '</td><td class="actions"><button class="btn btn--subtle btn--icon btn--sm" data-open="' + a.id + '" aria-label="جزئیات">' + icon('chevron-left', 'icon--sm') + '</button></td></tr>').join('') + '</tbody></table></div>' + ui.pagination(res.meta)
        : ui.state({ title: 'نوبتی پیدا نشد', text: 'فیلترها یا بازه‌ی زمانی را تغییر دهید.' });
    };
    v.querySelector('[role=tablist]').addEventListener('click', (e) => { const c = e.target.closest('[data-range]'); if (!c) return; st.range = c.dataset.range; st.page = 1; $$('[data-range]').forEach((x) => x.setAttribute('aria-selected', String(x === c))); draw(); });
    $('#aq').addEventListener('input', debounce((e) => { st.q = e.target.value; st.page = 1; draw(); }, 300));
    $('#as').addEventListener('change', (e) => { st.status = e.target.value; st.page = 1; draw(); });
    $('#ab').addEventListener('change', (e) => { st.branch = e.target.value; st.page = 1; draw(); });
    $('#add').addEventListener('click', () => newAppointment({}, draw));
    $('#tb').addEventListener('change', async (e) => {
      const s = e.target.closest('[data-st]'); if (!s) return;
      try { await api.put('/admin/appointments/' + s.dataset.st, { status: s.value }); toast('وضعیت به «' + s.value + '» تغییر کرد', 'success'); draw(); refreshCounts(); }
      catch (er) { toast(er.message, 'error'); draw(); }
    });
    $('#tb').addEventListener('click', (e) => {
      if (e.target.closest('select')) return;
      const pg = e.target.closest('.page-btn'); if (pg && !pg.disabled) { st.page = Number(pg.dataset.page); draw(); return; }
      const o = e.target.closest('[data-open]'); if (o) openAppointment(o.dataset.open, draw);
    });
    await draw();
  }

  // ---------- انتخابگر روز و ساعت (برای ثبت و جابجایی) ----------
  const slotPicker = (box, state, onPick) => {
    const today = S.localDate();
    const days = Array.from({ length: 21 }, (_, i) => S.addDays(today, i));
    if (!state.date) state.date = today;
    const drawDays = () => '<div class="date-strip date-strip--sm">' + days.map((d) => { const p = S.dayParts(d); return '<button type="button" class="date-chip' + (d === state.date ? ' is-selected' : '') + '" data-d="' + d + '"><span class="date-chip__wd">' + (d === today ? 'امروز' : p.weekday) + '</span><span class="date-chip__d">' + p.day + '</span><span class="date-chip__m">' + p.month + '</span></button>'; }).join('') + '</div><div class="pick-slots"></div>';
    const loadSlots = async () => {
      const ps = $('.pick-slots', box); ps.innerHTML = '<div class="skeleton" style="height:90px"></div>';
      if (!state.branch) { ps.innerHTML = '<p class="muted small">ابتدا شعبه را انتخاب کنید.</p>'; return; }
      try {
        const c = (await api.get('/admin/calendar?branch=' + encodeURIComponent(state.branch) + '&date=' + state.date)).data;
        ps.innerHTML = c.closed ? '<p class="muted small">این روز در برنامه‌ی شعبه تعطیل است.</p>' : '<div class="slot-grid slot-grid--sm">' + c.slots.map((s) => {
          const mine = state.keep && state.keep.date === state.date && state.keep.time === s.time && state.keep.branch === state.branch;
          const left = s.left + (mine ? 1 : 0);
          return '<button type="button" class="slot' + (s.time === state.time ? ' is-selected' : '') + '" data-t="' + s.time + '"' + (left > 0 ? '' : ' disabled') + '>' + S.faTime(s.time) + '<small>' + (left > 0 ? faNumber(left) + ' خالی' : 'پر') + '</small></button>';
        }).join('') + '</div>';
      } catch (e) { ps.innerHTML = '<p class="field__error">' + esc(e.message) + '</p>'; }
    };
    box.innerHTML = drawDays();
    box.onclick = (e) => {
      const d = e.target.closest('[data-d]'); if (d) { state.date = d.dataset.d; state.time = ''; $$('[data-d]', box).forEach((x) => x.classList.toggle('is-selected', x === d)); loadSlots(); onPick(); return; }
      const t = e.target.closest('[data-t]'); if (t && !t.disabled) { state.time = t.dataset.t; $$('[data-t]', box).forEach((x) => x.classList.toggle('is-selected', x === t)); onPick(); }
    };
    loadSlots();
    const sel = $('.date-chip.is-selected', box); if (sel) setTimeout(() => sel.scrollIntoView({ block: 'nearest', inline: 'center' }), 50);
    return { reload: loadSlots };
  };

  // ---------- ثبت نوبت جدید (تلفنی / حضوری) ----------
  async function newAppointment(pre, after) {
    const br = (await branches()).filter((b) => b.active !== false);
    const st = { branch: pre.branch || (br[0] && br[0].slug) || '', date: pre.date || '', time: pre.time || '' };
    const d = drawer({ title: 'ثبت نوبت جدید', wide: true, body: '<form id="nf" class="stack" novalidate><div class="form-grid">' +
      '<div class="field"><label for="n-phone">موبایل بیمار <span class="req">*</span></label><input class="input ltr" id="n-phone" name="phone" inputmode="tel" value="' + esc(pre.phone || '') + '" placeholder="09123456789"><p class="field__hint" id="n-hint"></p></div>' +
      '<div class="field"><label for="n-name">نام و نام خانوادگی <span class="req">*</span></label><input class="input" id="n-name" name="fullName" value="' + esc(pre.fullName || '') + '"></div>' +
      '<div class="field"><label for="n-wound">نوع زخم <span class="req">*</span></label><select class="select" id="n-wound" name="woundType">' + Object.keys(WOUND).map((k) => '<option value="' + k + '">' + WOUND[k] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="n-src">نحوه‌ی ثبت</label><select class="select" id="n-src" name="source"><option value="phone">تماس تلفنی</option><option value="walk_in">مراجعه‌ی حضوری</option></select></div>' +
      '<div class="field"><label for="n-type">نوع مراجعه</label><select class="select" id="n-type" name="visitType"><option value="clinic">کلینیک</option><option value="home">ویزیت در منزل</option></select></div>' +
      '<div class="field"><label for="n-branch">شعبه <span class="req">*</span></label><select class="select" id="n-branch" name="branch">' + br.map((b) => '<option value="' + esc(b.slug) + '"' + (b.slug === st.branch ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div>' +
      '<div class="field field--full" id="n-addr" hidden><label for="n-address">آدرس</label><textarea class="textarea" id="n-address" name="address" rows="2"></textarea></div>' +
      '<div class="field field--full"><span class="label">روز و ساعت <span class="req">*</span></span><div id="n-pick"></div></div>' +
      '<div class="field field--full"><label for="n-desc">توضیح</label><textarea class="textarea" id="n-desc" name="description" rows="2"></textarea></div></div>' +
      '<div class="adrawer__foot"><span class="muted small" id="n-sum">زمان انتخاب نشده</span><button class="btn btn--primary" type="submit">' + icon('check', 'icon--sm') + 'ثبت نوبت (تأیید شده)</button></div></form>' });
    const pick = slotPicker($('#n-pick', d.el), st, () => { $('#n-sum', d.el).textContent = st.time ? S.faFull(st.date) + ' — ساعت ' + S.faTime(st.time) : 'زمان انتخاب نشده'; });
    $('#n-sum', d.el).textContent = st.time ? S.faFull(st.date) + ' — ساعت ' + S.faTime(st.time) : 'زمان انتخاب نشده';
    $('#n-branch', d.el).addEventListener('change', (e) => { st.branch = e.target.value; st.time = ''; pick.reload(); });
    $('#n-type', d.el).addEventListener('change', (e) => { $('#n-addr', d.el).hidden = e.target.value !== 'home'; });
    // جستجوی بیمار قبلی با شماره موبایل
    $('#n-phone', d.el).addEventListener('input', debounce(async (e) => {
      const ph = normalizeDigits(e.target.value).replace(/\D/g, '');
      const hint = $('#n-hint', d.el); hint.textContent = '';
      if (ph.length !== 11) return;
      try { const p = (await api.get('/admin/patients?q=' + ph)).data.find((x) => x.phone === ph); if (p) { hint.innerHTML = icon('check-circle', 'icon--sm') + ' بیمار قبلی: ' + esc(p.fullName) + ' (' + faNumber(p.appointmentsCount) + ' نوبت)'; if (!$('#n-name', d.el).value) $('#n-name', d.el).value = p.fullName; } } catch (er) { /* ignore */ }
    }, 350));
    $('#nf', d.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const o = Object.fromEntries(new FormData(e.target)); o.date = st.date; o.time = st.time;
      if (!o.time) { toast('یک ساعت خالی انتخاب کنید.', 'error'); return; }
      const btn = $('button[type=submit]', e.target); btn.classList.add('is-loading');
      try { const res = await api.post('/admin/appointments', o); toast('نوبت ثبت شد — ' + res.data.referenceNumber, 'success'); d.close(); refreshCounts(); if (after) after(); else if (/appointments|calendar|dashboard/.test(location.hash) || !location.hash) route(); }
      catch (er) { toast(Object.values(er.errors || {}).find((x) => typeof x === 'string') || er.message, 'error'); btn.classList.remove('is-loading'); if (er.status === 409) pick.reload(); }
    });
  }

  // ---------- جزئیات نوبت ----------
  async function openAppointment(id, after) {
    const d = drawer({ title: 'جزئیات نوبت', wide: true, body: '<div class="skeleton skeleton-card"></div>' });
    const changed = () => { refreshCounts(); if (after) after(); };
    const render = async () => {
      let a;
      try { a = (await api.get('/admin/appointments/' + id)).data; } catch (e) { d.body.innerHTML = ui.state({ type: 'error', title: e.message }); return; }
      const tm = await team().catch(() => []);
      const statusBtns = api.statuses.map((s) => '<button type="button" class="seg__btn' + (s === a.status ? ' is-on tone-' + TONE[s] : '') + '" data-status="' + s + '"' + (s === a.status ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + s + '</button>').join('');
      d.body.innerHTML = '<div class="appt-head"><div><span class="muted small">شماره‌ی پیگیری</span><div class="ref-code ref-code--sm">' + esc(a.referenceNumber) + '</div></div><div class="row">' + statusBadge(a.status) + '<span class="badge">' + esc(SOURCE[a.source] || 'آنلاین') + '</span></div></div>' +
        '<div class="appt-when">' + (a.date ? '<div><strong>' + S.faFull(a.date) + '</strong><span>' + icon('clock', 'icon--sm') + 'ساعت ' + S.faTime(a.time) + ' · ' + faNumber(a.durationMin || 30) + ' دقیقه · شعبه‌ی ' + esc(a.branchName || a.branch) + '</span></div>' : '<div><strong>بدون زمان مشخص</strong><span>' + esc(a.preferredDate || '') + ' ' + esc(a.preferredTime || '') + '</span></div>') +
        '<button type="button" class="btn btn--secondary btn--sm" id="mv">' + icon('calendar', 'icon--sm') + 'جابجایی</button></div><div id="mvbox" hidden class="card card--soft"></div>' +
        '<section><h3 class="h5">وضعیت</h3><div class="seg" role="group" aria-label="تغییر وضعیت">' + statusBtns + '</div></section>' +
        '<section class="cols"><dl class="kv col-md-7"><dt>بیمار</dt><dd><strong>' + esc(a.fullName) + '</strong>' + (a.patientVisits > 1 ? ' <span class="badge badge--primary">' + faNumber(a.patientVisits) + ' مراجعه</span>' : ' <span class="badge">بیمار جدید</span>') + '</dd>' +
        '<dt>موبایل</dt><dd><a class="ltr-text" href="tel:' + esc(a.phone) + '">' + esc(a.phone) + '</a></dd><dt>نوع زخم</dt><dd>' + esc(WOUND[a.woundType] || a.woundType) + '</dd><dt>نوع مراجعه</dt><dd>' + (a.visitType === 'home' ? 'ویزیت در منزل' : 'کلینیک') + '</dd>' +
        (a.address ? '<dt>آدرس</dt><dd>' + esc(a.address) + '</dd>' : '') + '<dt>توضیح بیمار</dt><dd>' + esc(a.description || '—') + '</dd>' + (a.cancelReason ? '<dt>دلیل لغو</dt><dd>' + esc(a.cancelReason) + '</dd>' : '') + '<dt>ثبت</dt><dd>' + faDateTime(a.createdAt) + '</dd></dl>' +
        '<div class="col-md-5 stack"><div class="field"><label for="as-team">مسئول درمان</label><select class="select" id="as-team"><option value="">— تعیین نشده —</option>' + tm.map((t) => '<option value="' + esc(t.id) + '"' + (t.id === a.assignedTo ? ' selected' : '') + '>' + esc(t.name) + '</option>').join('') + '</select></div>' +
        (a.patient ? '<a class="btn btn--ghost btn--sm" href="#/patients?id=' + esc(a.patient) + '">' + icon('user', 'icon--sm') + 'پرونده‌ی بیمار</a>' : '') + '</div></section>' +
        '<section class="field"><label for="note">یادداشت داخلی <span class="muted small">(فقط کادر کلینیک می‌بیند)</span></label><textarea class="textarea" id="note" rows="3">' + esc(a.internalNote) + '</textarea><div><button class="btn btn--secondary btn--sm" id="sn">ذخیره‌ی یادداشت</button></div></section>' +
        '<section><h3 class="h5">تاریخچه</h3><ol class="timeline">' + (a.history || []).slice().reverse().map((h) => '<li><span class="timeline__dot"></span><div><strong>' + esc(HIST[h.action] || h.action) + '</strong>' + (h.note ? ' <span class="muted">' + esc(h.note) + '</span>' : '') + '<small>' + esc(h.byName || '') + ' · ' + faDateTime(h.at) + '</small></div></li>').join('') + '</ol></section>' +
        (can(SUPER) ? '<div class="danger-zone"><button class="btn btn--danger-ghost btn--sm" id="del">' + icon('trash', 'icon--sm') + 'حذف کامل نوبت</button></div>' : '');
      const put = async (body, msg) => { try { await api.put('/admin/appointments/' + id, body); toast(msg, 'success'); changed(); render(); } catch (er) { toast(Object.values(er.errors || {}).find((x) => typeof x === 'string') || er.message, 'error'); } };
      $$('[data-status]', d.body).forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.status === a.status) return;
        const body = { status: b.dataset.status };
        if (b.dataset.status === 'لغو شده') { const why = window.prompt('دلیل لغو (اختیاری):', ''); if (why === null) return; body.cancelReason = why; }
        put(body, 'وضعیت به «' + b.dataset.status + '» تغییر کرد');
      }));
      $('#as-team', d.body).addEventListener('change', (e) => put({ assignedTo: e.target.value }, 'مسئول درمان ثبت شد'));
      $('#sn', d.body).addEventListener('click', () => put({ internalNote: $('#note', d.body).value }, 'یادداشت ذخیره شد'));
      $('#mv', d.body).addEventListener('click', () => {
        const box = $('#mvbox', d.body); box.hidden = !box.hidden; if (box.hidden) return;
        const ms = { branch: a.branch, date: a.date || '', time: a.time || '', keep: { branch: a.branch, date: a.date, time: a.time } };
        box.innerHTML = '<div class="row row--between"><strong>زمان جدید</strong><select class="select select--sm" id="mv-b" aria-label="شعبه"></select></div><div id="mv-p" class="mt-2"></div><div class="row mt-4"><button class="btn btn--primary btn--sm" id="mv-ok" disabled>انتقال به زمان انتخابی</button></div>';
        branches().then((bs) => { $('#mv-b', box).innerHTML = bs.map((b) => '<option value="' + esc(b.slug) + '"' + (b.slug === a.branch ? ' selected' : '') + '>' + esc(b.name) + '</option>').join(''); });
        const okBtn = $('#mv-ok', box);
        const sync = () => { okBtn.disabled = !ms.time || (ms.date === a.date && ms.time === a.time && ms.branch === a.branch); };
        const pk = slotPicker($('#mv-p', box), ms, sync);
        $('#mv-b', box).addEventListener('change', (e) => { ms.branch = e.target.value; ms.time = ''; pk.reload(); sync(); });
        okBtn.addEventListener('click', () => put({ branch: ms.branch, date: ms.date, time: ms.time }, 'نوبت جابجا شد'));
      });
      const del = $('#del', d.body);
      if (del) del.addEventListener('click', async () => { if (!confirmBox('این نوبت برای همیشه حذف شود؟ (برای بیشتر موارد «لغو» کافی است)')) return; try { await api.del('/admin/appointments/' + id); toast('حذف شد', 'success'); d.close(); changed(); } catch (er) { toast(er.message, 'error'); } });
    };
    render();
  }

  // ================= تقویم روزانه =================
  async function calendar(r, v) {
    const br = await branches();
    const p = params();
    const st = { branch: p.get('branch') || (br[0] && br[0].slug) || '', date: p.get('date') || S.localDate() };
    v.innerHTML = head('تقویم روزانه', 'ظرفیت و نوبت‌های هر ساعت', '<select class="select" id="cb" aria-label="شعبه">' + br.map((b) => '<option value="' + esc(b.slug) + '"' + (b.slug === st.branch ? ' selected' : '') + '>شعبه‌ی ' + esc(b.name) + '</option>').join('') + '</select>') +
      '<div class="day-nav card"><button class="btn btn--subtle btn--icon" data-step="-1" aria-label="روز قبل">' + icon('chevron-right') + '</button><div class="day-nav__title"><strong id="cd"></strong><button class="btn btn--ghost btn--sm" data-today>امروز</button></div><button class="btn btn--subtle btn--icon" data-step="1" aria-label="روز بعد">' + icon('chevron-left') + '</button></div><div id="cal"></div>';
    const draw = async () => {
      $('#cd').textContent = S.faFull(st.date);
      $('#cal').innerHTML = '<div class="skeleton skeleton-card"></div>';
      const c = (await api.get('/admin/calendar?branch=' + encodeURIComponent(st.branch) + '&date=' + st.date)).data;
      const byTime = {}; c.appointments.forEach((a) => { (byTime[a.time] = byTime[a.time] || []).push(a); });
      const times = new Set(c.slots.map((s) => s.time));
      const extra = c.appointments.filter((a) => !times.has(a.time));
      const active = c.appointments.filter((a) => api.holding.includes(a.status)).length;
      const capTotal = c.slots.length * c.capacity;
      const pill = (a) => '<button type="button" class="appt-pill tone-' + TONE[a.status] + (api.holding.includes(a.status) ? '' : ' is-off') + '" data-open="' + a.id + '"><strong>' + esc(a.fullName) + '</strong><span>' + esc(a.status) + (a.visitType === 'home' ? ' · منزل' : '') + '</span></button>';
      $('#cal').innerHTML = (c.closed ? '<div class="alert alert--neutral">' + icon('info') + '<div>این روز طبق برنامه‌ی شعبه تعطیل است' + (c.appointments.length ? '؛ نوبت‌های ثبت‌شده در پایین آمده‌اند.' : '.') + '</div></div>' :
        '<div class="cal-summary"><span>' + faNumber(c.slots.length) + ' بازه‌ی ' + faNumber(c.slotMinutes) + ' دقیقه‌ای</span><span>ظرفیت هر بازه: ' + faNumber(c.capacity) + '</span><span>پر شده: <strong>' + faNumber(active) + ' از ' + faNumber(capTotal) + '</strong></span><span class="cal-summary__bar"><span style="width:' + Math.round(active / Math.max(1, capTotal) * 100) + '%"></span></span></div>' +
        '<div class="timeline-day">' + c.slots.map((s) => {
          const list = byTime[s.time] || []; const used = c.capacity - s.left;
          const past = S.toUtc(st.date, s.time).getTime() < Date.now();
          return '<div class="tslot' + (s.left === 0 ? ' is-full' : '') + (past ? ' is-past' : '') + '"><div class="tslot__time">' + S.faTime(s.time) + '<small>' + faNumber(used) + '/' + faNumber(c.capacity) + '</small></div><div class="tslot__items">' + list.map(pill).join('') +
            (s.left > 0 ? '<button type="button" class="tslot__add" data-add="' + s.time + '" aria-label="نوبت جدید ساعت ' + S.faTime(s.time) + '">' + icon('plus', 'icon--sm') + (list.length ? '' : '<span>خالی</span>') + '</button>' : '') + '</div></div>';
        }).join('') + '</div>') +
        (extra.length ? '<h3 class="h5 mt-6">نوبت‌های خارج از برنامه</h3><div class="row">' + extra.map(pill).join('') + '</div>' : '');
    };
    $('#cb').addEventListener('change', (e) => { st.branch = e.target.value; draw(); });
    v.addEventListener('click', (e) => {
      const s = e.target.closest('[data-step]'); if (s) { st.date = S.addDays(st.date, Number(s.dataset.step)); draw(); return; }
      if (e.target.closest('[data-today]')) { st.date = S.localDate(); draw(); return; }
      const o = e.target.closest('[data-open]'); if (o) { openAppointment(o.dataset.open, draw); return; }
      const a = e.target.closest('[data-add]'); if (a) newAppointment({ branch: st.branch, date: st.date, time: a.dataset.add }, draw);
    });
    await draw();
  }

  // ================= بیماران =================
  async function patients(r, v) {
    const st = { q: '', page: 1 };
    v.innerHTML = head('بیماران', 'پرونده‌ها به‌صورت خودکار از روی شماره موبایل ساخته می‌شوند') +
      '<div class="filters"><div class="search"><label class="sr-only" for="pq">جستجو</label>' + icon('search') + '<input class="input" id="pq" type="search" placeholder="نام یا موبایل"></div></div><div id="tb"></div>';
    const draw = async () => {
      const res = await api.get('/admin/patients?q=' + encodeURIComponent(st.q) + '&page=' + st.page + '&limit=20');
      $('#tb').innerHTML = res.data.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>بیمار</th><th>موبایل</th><th class="num">تعداد نوبت</th><th>آخرین نوبت</th><th></th></tr></thead><tbody>' +
        res.data.map((p) => '<tr class="is-clickable" data-p="' + p.id + '"><td><span class="row row--nowrap"><span class="avatar avatar--sm">' + esc(String(p.fullName).slice(0, 1)) + '</span><strong>' + esc(p.fullName) + '</strong></span></td><td class="ltr-text">' + esc(p.phone) + '</td><td class="num">' + faNumber(p.appointmentsCount) + '</td><td>' + (p.lastAppointmentAt ? faDateTime(p.lastAppointmentAt) : '—') + '</td><td class="actions">' + icon('chevron-left', 'icon--sm') + '</td></tr>').join('') + '</tbody></table></div>' + ui.pagination(res.meta)
        : ui.state({ title: 'بیماری پیدا نشد', text: 'با اولین نوبت، پرونده‌ی بیمار خودکار ساخته می‌شود.' });
    };
    $('#pq').addEventListener('input', debounce((e) => { st.q = e.target.value; st.page = 1; draw(); }, 300));
    $('#tb').addEventListener('click', (e) => {
      const pg = e.target.closest('.page-btn'); if (pg && !pg.disabled) { st.page = Number(pg.dataset.page); draw(); return; }
      const row = e.target.closest('[data-p]'); if (row) openPatient(row.dataset.p, draw);
    });
    await draw();
    if (params().get('id')) openPatient(params().get('id'), draw);
  }
  async function openPatient(id, after) {
    const d = drawer({ title: 'پرونده‌ی بیمار', wide: true, body: '<div class="skeleton skeleton-card"></div>' });
    let p;
    try { p = (await api.get('/admin/patients/' + id)).data; } catch (e) { d.body.innerHTML = ui.state({ type: 'error', title: e.message }); return; }
    const appts = p.appointments || [];
    const count = (s) => appts.filter((a) => a.status === s).length;
    d.body.innerHTML = '<div class="patient-head"><span class="avatar avatar--lg">' + esc(String(p.fullName).slice(0, 1)) + '</span><div><h3>' + esc(p.fullName) + '</h3><a class="ltr-text" href="tel:' + esc(p.phone) + '">' + esc(p.phone) + '</a></div>' +
      '<button class="btn btn--primary btn--sm" id="pn">' + icon('plus', 'icon--sm') + 'نوبت جدید</button></div>' +
      '<div class="mini-stats"><div><strong>' + faNumber(appts.length) + '</strong><span>کل نوبت‌ها</span></div><div><strong>' + faNumber(count('تکمیل شده')) + '</strong><span>تکمیل‌شده</span></div><div><strong>' + faNumber(count('لغو شده')) + '</strong><span>لغو</span></div><div><strong>' + faNumber(count('عدم مراجعه')) + '</strong><span>عدم مراجعه</span></div></div>' +
      '<div class="field"><label for="pnotes">یادداشت پرونده <span class="muted small">(سابقه‌ی بیماری، حساسیت‌ها و…)</span></label><textarea class="textarea" id="pnotes" rows="4">' + esc(p.notes) + '</textarea><div><button class="btn btn--secondary btn--sm" id="psave">ذخیره‌ی یادداشت</button></div></div>' +
      '<h3 class="h5">سابقه‌ی نوبت‌ها</h3>' + (appts.length ? '<ul class="feed">' + appts.map((a) => '<li><button type="button" data-open="' + a.id + '"><span class="feed__dot tone-' + TONE[a.status] + '"></span><span><strong>' + (a.date ? S.faFull(a.date) + ' · ' + S.faTime(a.time) : 'بدون زمان') + '</strong><small>' + esc(a.branchName || a.branch) + ' · ' + esc(WOUND[a.woundType] || a.woundType) + '</small></span>' + statusBadge(a.status) + '</button></li>').join('') + '</ul>' : '<p class="muted">نوبتی ثبت نشده است.</p>');
    $('#psave', d.body).addEventListener('click', async () => { try { await api.put('/admin/patients/' + id, { notes: $('#pnotes', d.body).value }); toast('ذخیره شد', 'success'); if (after) after(); } catch (e) { toast(e.message, 'error'); } });
    $('#pn', d.body).addEventListener('click', () => newAppointment({ phone: p.phone, fullName: p.fullName }));
    d.body.addEventListener('click', (e) => { const o = e.target.closest('[data-open]'); if (o) openAppointment(o.dataset.open); });
  }

  // ================= پیام‌ها =================
  async function messages(r, v) {
    const res = (await api.get('/admin/messages?limit=50')).data;
    v.innerHTML = head('پیام‌ها', faNumber(res.filter((m) => !m.read).length) + ' پیام خوانده‌نشده') + (res.length ? '<div class="msg-list">' + res.map((m) => '<article class="card msg' + (m.read ? '' : ' is-unread') + '"><header class="row row--between"><span class="row"><span class="avatar avatar--sm">' + esc(String(m.name).slice(0, 1)) + '</span><strong>' + esc(m.name) + '</strong><a class="ltr-text small" href="tel:' + esc(m.phone) + '">' + esc(m.phone) + '</a></span><small class="muted">' + faDateTime(m.createdAt) + '</small></header><p>' + esc(m.message) + '</p>' +
      '<div class="row">' + (m.read ? '<span class="badge badge--success">خوانده شد</span>' : '<button class="btn btn--secondary btn--sm" data-read="' + m.id + '">' + icon('check', 'icon--sm') + 'علامت خوانده‌شده</button>') + '<button class="btn btn--subtle btn--sm" data-newp="' + m.id + '">' + icon('calendar', 'icon--sm') + 'ثبت نوبت</button><button class="btn btn--subtle btn--sm" data-del="' + m.id + '">' + icon('trash', 'icon--sm') + 'حذف</button></div></article>').join('') + '</div>' : ui.state({ title: 'پیامی نیست' }));
    v.onclick = async (e) => {
      const n = e.target.closest('[data-newp]'); if (n) { const m = res.find((x) => x.id === n.dataset.newp); newAppointment({ phone: m.phone, fullName: m.name }); return; }
      const b = e.target.closest('[data-read],[data-del]'); if (!b) return;
      try { if (b.dataset.del) { if (!confirmBox('این پیام حذف شود؟')) return; await api.del('/admin/messages/' + b.dataset.del); } else await api.put('/admin/messages/' + b.dataset.read, { read: true }); refreshCounts(); messages(r, v); } catch (er) { toast(er.message, 'error'); }
    };
  }

  // ================= تنظیمات تک‌فرمی =================
  async function singleForm(r, v) {
    const d = (await api.get('/admin/' + r)).data;
    const F = r === 'settings'
      ? [['clinicName', 'نام کلینیک'], ['tagline', 'شعار'], ['phone1', 'تلفن ۱'], ['phone2', 'تلفن ۲'], ['whatsapp', 'واتساپ (با کد کشور)'], ['email', 'ایمیل'], ['coverageText', 'متن پوشش خدمات'], ['heroTitle', 'تیتر صفحه‌ی اصلی'], ['heroAccent', 'ادامه‌ی تیتر'], ['heroDoctor', 'معرفی پزشک در صفحه‌ی اصلی'], ['heroLead', 'متن معرفی', 'ta'], ['introText', 'درباره‌ی کلینیک', 'ta'], ['showTestimonials', 'نمایش بخش ویدیوهای رضایت در سایت', 'check']]
      : [['wounds', 'تعداد زخم‌های بررسی‌شده', 'n']];
    v.innerHTML = head(r === 'settings' ? 'اطلاعات کلینیک' : 'آمار سایت', r === 'settings' ? 'این اطلاعات در هدر، فوتر و صفحه‌ی اصلی سایت نمایش داده می‌شود' : '') + (r === 'statistics' ? '<div class="alert alert--neutral">' + icon('info') + '<div>تعداد زخم‌های بررسی‌شده دستی وارد می‌شود و در صورت خالی بودن در سایت نمایش داده نمی‌شود.</div></div>' : '') +
      '<form class="card card--pad-lg form" id="sf"><div class="form-grid">' + F.map((f) => {
        if (f[2] === 'check') return '<label class="check field--full"><input type="checkbox" name="' + f[0] + '"' + (d[f[0]] ? ' checked' : '') + '><span>' + f[1] + '</span></label>';
        const input = f[2] === 'ta' ? '<textarea class="textarea" id="' + f[0] + '" name="' + f[0] + '" rows="3">' + esc(d[f[0]]) + '</textarea>' :
          '<input class="input' + (f[2] === 'n' ? ' ltr' : '') + '" id="' + f[0] + '" name="' + f[0] + '"' + (f[2] === 'n' ? ' inputmode="numeric"' : '') + ' value="' + esc(d[f[0]] == null ? '' : d[f[0]]) + '">';
        return '<div class="field' + (f[2] === 'ta' ? ' field--full' : '') + '"><label for="' + f[0] + '">' + f[1] + '</label>' + input + '</div>';
      }).join('') + '</div><div><button class="btn btn--primary" type="submit">ذخیره‌ی تغییرات</button></div></form>';
    $('#sf').addEventListener('submit', async (e) => {
      e.preventDefault(); const o = Object.fromEntries(new FormData(e.target));
      F.filter((f) => f[2] === 'check').forEach(([key]) => { o[key] = key in o; });
      if (r === 'statistics') F.forEach((f) => { const n = normalizeDigits(o[f[0]]).trim(); o[f[0]] = n === '' ? null : Number(n); if (o[f[0]] !== null && (isNaN(o[f[0]]) || o[f[0]] < 0)) o[f[0]] = null; });
      try { await api.put('/admin/' + r, o); toast('ذخیره شد', 'success'); } catch (er) { toast(er.message, 'error'); }
    });
  }

  // ================= گزارش فعالیت =================
  async function audit(r, v) {
    const st = { q: '', action: 'all', page: 1 };
    v.innerHTML = head('گزارش فعالیت', 'هر ورود، ویرایش و حذف ثبت می‌شود (نگه‌داری ۴۰۰ روز)') +
      '<div class="filters"><div class="search"><label class="sr-only" for="lq">جستجو</label>' + icon('search') + '<input class="input" id="lq" type="search" placeholder="کاربر، شرح یا IP"></div><select class="select" id="la" aria-label="نوع فعالیت"><option value="all">همه‌ی فعالیت‌ها</option>' + Object.keys(ACTION).map((k) => '<option value="' + k + '">' + ACTION[k] + '</option>').join('') + '</select></div><div id="tb"></div>';
    const draw = async () => {
      const res = await api.get('/admin/audit?q=' + encodeURIComponent(st.q) + '&action=' + st.action + '&page=' + st.page);
      $('#tb').innerHTML = res.data.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>زمان</th><th>کاربر</th><th>فعالیت</th><th>بخش</th><th>شرح</th><th>IP</th></tr></thead><tbody>' +
        res.data.map((l) => '<tr><td class="small">' + faDateTime(l.createdAt) + '</td><td class="small ltr-text">' + esc(l.userName) + '</td><td><span class="badge badge--' + (/fail|lock|delete/.test(l.action) ? 'danger' : l.action === 'login' ? 'success' : 'neutral') + '">' + esc(ACTION[l.action] || l.action) + '</span></td><td class="small">' + esc(l.resource) + '</td><td class="small">' + esc(l.summary) + '</td><td class="small mono ltr-text">' + esc(l.ip) + '</td></tr>').join('') + '</tbody></table></div>' + ui.pagination(res.meta)
        : ui.state({ title: 'رکوردی نیست' });
    };
    $('#lq').addEventListener('input', debounce((e) => { st.q = e.target.value; st.page = 1; draw(); }, 300));
    $('#la').addEventListener('change', (e) => { st.action = e.target.value; st.page = 1; draw(); });
    $('#tb').addEventListener('click', (e) => { const pg = e.target.closest('.page-btn'); if (pg && !pg.disabled) { st.page = Number(pg.dataset.page); draw(); } });
    await draw();
  }

  // ================= حساب من =================
  async function profile(r, v) {
    v.innerHTML = head('حساب من') + '<div class="cols"><section class="card card--pad-lg col-lg-5"><div class="patient-head"><span class="avatar avatar--lg">' + esc(String(session.name || session.email).slice(0, 1)) + '</span><div><h3>' + esc(session.name || '') + '</h3><span class="ltr-text muted">' + esc(session.email) + '</span></div></div>' +
      '<dl class="kv mt-4"><dt>نقش</dt><dd>' + esc(ROLE[session.role] || session.role) + '</dd><dt>آخرین ورود</dt><dd>' + faDateTime(session.lastLoginAt) + '</dd><dt>آخرین تغییر رمز</dt><dd>' + (session.passwordChangedAt ? faDateTime(session.passwordChangedAt) : '—') + '</dd></dl>' +
      '<hr><h3 class="h5">امنیت نشست‌ها</h3><p class="muted small">اگر روی دستگاه دیگری وارد شده‌اید و به آن دسترسی ندارید، از همه‌ی دستگاه‌ها خارج شوید.</p><button class="btn btn--danger-ghost" id="loa">' + icon('logout', 'icon--sm') + 'خروج از همه‌ی دستگاه‌ها</button></section>' +
      '<form class="card card--pad-lg col-lg-7 form" id="pwf" novalidate><h2>تغییر رمز عبور</h2><div class="field"><label for="currentPassword">رمز فعلی</label><input class="input ltr" type="password" id="currentPassword" name="currentPassword" autocomplete="current-password"><p class="field__error" id="e-currentPassword"></p></div>' +
      '<div class="field"><label for="newPassword">رمز جدید</label><input class="input ltr" type="password" id="newPassword" name="newPassword" autocomplete="new-password"><div class="pw-meter" aria-hidden="true"><span id="pwm"></span></div><p class="field__hint">حداقل ۱۰ نویسه، شامل حرف و عدد. پس از تغییر، نشست‌های دیگر شما بسته می‌شوند.</p><p class="field__error" id="e-newPassword"></p></div>' +
      '<div class="field"><label for="confirmPassword">تکرار رمز جدید</label><input class="input ltr" type="password" id="confirmPassword" autocomplete="new-password"><p class="field__error" id="e-confirmPassword"></p></div><div><button class="btn btn--primary" type="submit">تغییر رمز</button></div></form></div>';
    $('#newPassword').addEventListener('input', (e) => {
      const p = e.target.value; let s = 0;
      if (p.length >= 10) s += 1; if (p.length >= 14) s += 1; if (/\d/.test(p) && /[^\d]/.test(p)) s += 1; if (/[^A-Za-z0-9؀-ۿ]/.test(p)) s += 1;
      const m = $('#pwm'); m.style.width = (s * 25) + '%'; m.className = s >= 3 ? 'ok' : s >= 2 ? 'mid' : 'weak';
    });
    $('#pwf').addEventListener('submit', async (e) => {
      e.preventDefault(); $$('.field__error', e.target).forEach((x) => { x.textContent = ''; });
      if ($('#newPassword').value !== $('#confirmPassword').value) { $('#e-confirmPassword').textContent = 'تکرار رمز با رمز جدید یکسان نیست.'; return; }
      try { await api.put('/auth/password', { currentPassword: $('#currentPassword').value, newPassword: $('#newPassword').value }); toast('رمز عبور تغییر کرد', 'success'); e.target.reset(); $('#pwm').style.width = '0'; }
      catch (er) { Object.entries(er.errors || {}).forEach(([k, val]) => { const el = $('#e-' + k); if (el) el.textContent = val; }); if (!er.errors) toast(er.message, 'error'); }
    });
    $('#loa').addEventListener('click', async () => { if (!confirmBox('از همه‌ی دستگاه‌ها (از جمله همین مرورگر) خارج شوید؟')) return; await api.post('/auth/logout-all'); location.href = 'login.html'; });
  }

  // ================= CRUD محتوا =================
  const toJalali = (g) => { const p = new Intl.DateTimeFormat('en-US-u-ca-persian', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(g + 'T00:00:00Z')).reduce((o, x) => { o[x.type] = x.value; return o; }, {}); return p.year + '/' + p.month + '/' + p.day; };
  const fromJalali = (j) => { const d = Clinic.utils.parseJalali(j); if (!d) return null; return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const scheduleField = (val) => {
    const s = S.settingsOf({ booking: val });
    const byDay = {}; s.shifts.forEach((sh) => { (byDay[sh.day] = byDay[sh.day] || []).push(sh.start + '-' + sh.end); });
    return '<fieldset class="sched"><legend>' + icon('calendar', 'icon--sm') + 'برنامه‌ی نوبت‌دهی آنلاین</legend>' +
      '<label class="check"><input type="checkbox" name="b_enabled"' + (s.enabled ? ' checked' : '') + '><span>نوبت‌دهی آنلاین برای این شعبه فعال باشد</span></label>' +
      '<div class="form-grid form-grid--4"><div class="field"><label for="b_slot">طول هر نوبت (دقیقه)</label><input class="input ltr" id="b_slot" name="b_slot" inputmode="numeric" value="' + s.slotMinutes + '"></div>' +
      '<div class="field"><label for="b_cap">ظرفیت هر بازه</label><input class="input ltr" id="b_cap" name="b_cap" inputmode="numeric" value="' + s.capacity + '"></div>' +
      '<div class="field"><label for="b_lead">حداقل فاصله تا نوبت (ساعت)</label><input class="input ltr" id="b_lead" name="b_lead" inputmode="numeric" value="' + Math.round(s.leadMinutes / 60 * 10) / 10 + '"></div>' +
      '<div class="field"><label for="b_hor">رزرو تا چند روز آینده</label><input class="input ltr" id="b_hor" name="b_hor" inputmode="numeric" value="' + s.horizonDays + '"></div></div>' +
      '<div class="sched__week"><div class="sched__help small muted">ساعت‌های کاری هر روز را به شکل <span class="ltr-text mono">09:00-13:00, 16:00-20:00</span> بنویسید. خالی یعنی تعطیل.</div>' +
      S.WEEK_ORDER.map((d) => '<div class="sched__day"><label for="b_d' + d + '">' + S.WEEKDAYS[d] + '</label><input class="input ltr mono" id="b_d' + d + '" name="b_d' + d + '" placeholder="تعطیل" value="' + esc((byDay[d] || []).join(', ')) + '"></div>').join('') + '</div>' +
      '<div class="field"><label for="b_closed">روزهای تعطیل خاص (هر خط یک تاریخ شمسی، مثل ۱۴۰۵/۰۱/۰۱)</label><textarea class="textarea ltr mono" id="b_closed" name="b_closed" rows="3">' + esc(s.closedDates.map(toJalali).join('\n')) + '</textarea></div></fieldset>';
  };
  const readSchedule = (fd) => {
    const n = (k, def) => { const x = Number(normalizeDigits(fd.get(k))); return isNaN(x) || fd.get(k) === '' ? def : x; };
    const shifts = []; const errs = [];
    S.WEEK_ORDER.forEach((d) => {
      String(normalizeDigits(fd.get('b_d' + d) || '')).split(/[,،]/).map((x) => x.trim()).filter(Boolean).forEach((rng) => {
        const m = rng.replace(/\s/g, '').match(/^(\d{1,2}):?(\d{2})-(\d{1,2}):?(\d{2})$/);
        if (!m) { errs.push(S.WEEKDAYS[d] + ': «' + rng + '» نامعتبر است'); return; }
        const start = m[1].padStart(2, '0') + ':' + m[2]; const end = m[3].padStart(2, '0') + ':' + m[4];
        if (!S.TIME_RE.test(start) || !S.TIME_RE.test(end) || S.toMinutes(end) <= S.toMinutes(start)) { errs.push(S.WEEKDAYS[d] + ': بازه‌ی ' + rng + ' نامعتبر است'); return; }
        shifts.push({ day: d, start, end });
      });
    });
    const closedDates = lines(normalizeDigits(fd.get('b_closed') || '')).map((j) => { const g = fromJalali(j); if (!g) errs.push('تاریخ تعطیل «' + j + '» نامعتبر است'); return g; }).filter(Boolean);
    return { errs, value: { enabled: fd.has('b_enabled'), slotMinutes: n('b_slot', 30), capacity: n('b_cap', 1), leadMinutes: Math.round(n('b_lead', 2) * 60), horizonDays: n('b_hor', 30), shifts, closedDates } };
  };

  async function crud(r, v) {
    const c = CRUD[r]; const st = { q: '', page: 1 };
    v.innerHTML = head(c.title, r === 'branches' ? 'اطلاعات شعبه و ساعت‌های کاری قابل رزرو' : '', '<button class="btn btn--primary" id="add">' + icon('plus', 'icon--sm') + 'افزودن</button>') + '<div class="filters"><div class="search"><label class="sr-only" for="cq">جستجو</label>' + icon('search') + '<input class="input" id="cq" type="search" placeholder="جستجو"></div></div><div id="tb"></div>';
    let rows = [];
    const draw = async () => {
      const res = await api.get('/admin/' + r + '?q=' + encodeURIComponent(st.q) + '&page=' + st.page + '&limit=15');
      rows = res.data;
      $('#tb').innerHTML = rows.length ? '<div class="table-wrap"><table class="table"><thead><tr>' + c.cols.map((x) => '<th>' + (COLNAME[x] || x) + '</th>').join('') + '<th><span class="sr-only">عملیات</span></th></tr></thead><tbody>' +
        rows.map((it) => '<tr>' + c.cols.map((x, i) => '<td>' + (i === 0 ? '<strong>' + cell(it, x) + '</strong>' : cell(it, x)) + '</td>').join('') + '<td class="actions"><button class="btn btn--subtle btn--icon btn--sm" data-edit="' + it.id + '" aria-label="ویرایش">' + icon('edit', 'icon--sm') + '</button><button class="btn btn--subtle btn--icon btn--sm" data-del="' + it.id + '" aria-label="حذف">' + icon('trash', 'icon--sm') + '</button></td></tr>').join('') + '</tbody></table></div>' + ui.pagination(res.meta)
        : ui.state({ title: 'موردی نیست', text: 'با دکمه‌ی «افزودن» اولین مورد را بسازید.' });
    };
    const open = (it) => {
      it = it || {};
      const body = c.fields.map((f) => {
        const val = it[f.name]; const id = 'f_' + f.name; let inp;
        if (f.type === 'schedule') return '<div class="field--full">' + scheduleField(val) + '</div>';
        if (f.type === 'image') inp = '<input class="input" type="file" id="' + id + '" name="' + f.name + '_file" accept="image/jpeg,image/png,image/webp">' +
          '<input type="hidden" name="' + f.name + '" value="' + esc(val || '') + '">' +
          '<label class="check"' + (val ? '' : ' hidden') + '><input type="checkbox" name="' + f.name + '_remove"><span>عکس فعلی حذف شود</span></label>';
        else if (f.type === 'textarea') inp = '<textarea class="textarea" id="' + id + '" name="' + f.name + '" rows="3">' + esc(val) + '</textarea>';
        else if (f.type === 'lines') inp = '<textarea class="textarea" id="' + id + '" name="' + f.name + '" rows="4">' + esc((val || []).join('\n')) + '</textarea>';
        else if (f.type === 'faq') inp = '<textarea class="textarea" id="' + id + '" name="' + f.name + '" rows="4">' + esc(pairsToText(val)) + '</textarea>';
        else if (f.type === 'select') inp = '<select class="select" id="' + id + '" name="' + f.name + '">' + f.options.map((o) => '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
        else if (f.type === 'check') return '<label class="check field--full"><input type="checkbox" name="' + f.name + '"' + (val || (val === undefined && !it.id && !c.needConsent) ? ' checked' : '') + '><span>' + f.label + '</span></label>';
        else if (f.type === 'password') inp = '<input class="input ltr" type="password" autocomplete="new-password" id="' + id + '" name="' + f.name + '">';
        else inp = '<input class="input' + (f.type === 'number' ? ' ltr' : '') + '" id="' + id + '" name="' + f.name + '" value="' + esc(val == null ? '' : val) + '"' + (f.type === 'number' ? ' inputmode="numeric"' : '') + '>';
        return '<div class="field' + (['textarea', 'lines', 'faq'].includes(f.type) ? ' field--full' : '') + '"><label for="' + id + '">' + f.label + (f.req ? ' <span class="req">*</span>' : '') + '</label>' + inp + '</div>';
      }).join('');
      const d = drawer({ title: (it.id ? 'ویرایش' : 'افزودن') + ' — ' + c.title, wide: c.wide, body: '<form class="stack" novalidate><div class="form-grid">' + body + '</div>' +
        (c.needConsent ? '<div class="alert alert--warning">' + icon('alert', 'icon--sm') + '<div>بدون تأیید رضایت‌نامه‌ی کتبی بیمار، مورد منتشر نمی‌شود.</div></div>' : '') +
        '<div class="adrawer__foot"><button type="button" class="btn btn--subtle" data-cancel>انصراف</button><button class="btn btn--primary" type="submit">ذخیره</button></div></form>' });
      $('[data-cancel]', d.el).addEventListener('click', d.close);
      $('form', d.el).addEventListener('submit', async (e) => {
        e.preventDefault(); const fd = new FormData(e.target); const o = {};
        for (const f of c.fields) {
          if (f.type === 'check') o[f.name] = fd.has(f.name);
          else if (f.type === 'lines') o[f.name] = lines(fd.get(f.name));
          else if (f.type === 'faq') o[f.name] = pairsFromText(fd.get(f.name));
          else if (f.type === 'number') o[f.name] = Number(normalizeDigits(fd.get(f.name))) || 0;
          else if (f.type === 'password') { const pw = String(fd.get(f.name) || ''); if (pw) o[f.name] = pw; }
          else if (f.type === 'schedule') { const sc = readSchedule(fd); if (sc.errs.length) { toast(sc.errs[0], 'error'); return; } o[f.name] = sc.value; }
          else o[f.name] = String(fd.get(f.name) || '').trim();
        }
        const req = c.fields.find((f) => f.req && !o[f.name]); if (req) { toast('«' + req.label + '» الزامی است', 'error'); return; }
        if (c.needConsent && o.published && !o.consent) { toast('برای انتشار، رضایت‌نامه‌ی کتبی باید تأیید شود.', 'error'); return; }
        if (c.needConsent && o.consent) o.isPlaceholder = false;
        const form = e.currentTarget;
        const submit = $('button[type="submit"]', form);
        if (submit.disabled) return;
        submit.disabled = true;
        try {
          for (const field of c.fields.filter((f) => f.type === 'image')) {
            const file = fd.get(field.name + '_file');
            if (file && file.size > 0) {
              const { data } = await api.upload(file);
              o[field.name] = data.url;
              form.elements.namedItem(field.name).value = data.url;
              form.elements.namedItem(field.name + '_file').value = '';
              const remove = form.elements.namedItem(field.name + '_remove');
              remove.checked = false;
              remove.closest('label').hidden = false;
            } else if (fd.has(field.name + '_remove')) o[field.name] = '';
          }
          it.id ? await api.put('/admin/' + r + '/' + it.id, o) : await api.post('/admin/' + r, o);
          toast('ذخیره شد', 'success'); d.close(); if (r === 'branches') branchCache = null; if (r === 'team') teamCache = null; draw();
        }
        catch (er) { toast(Object.values(er.errors || {}).find((x) => typeof x === 'string') || er.message, 'error'); }
        finally { submit.disabled = false; }
      });
    };
    $('#add').addEventListener('click', () => open());
    $('#cq').addEventListener('input', debounce((e) => { st.q = e.target.value; st.page = 1; draw(); }, 300));
    $('#tb').addEventListener('click', async (e) => {
      const pg = e.target.closest('.page-btn'); if (pg && !pg.disabled) { st.page = Number(pg.dataset.page); draw(); return; }
      const ed = e.target.closest('[data-edit]'); if (ed) { open(rows.find((x) => x.id === ed.dataset.edit)); return; }
      const dl = e.target.closest('[data-del]'); if (dl && confirmBox('این مورد حذف شود؟')) { try { await api.del('/admin/' + r + '/' + dl.dataset.del); toast('حذف شد', 'success'); if (r === 'branches') branchCache = null; draw(); } catch (er) { toast(er.message, 'error'); } }
    });
    await draw();
  }
})();
