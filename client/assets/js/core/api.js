/* ==========================================================
   api.js — ارتباط با سرور + حالت نمایشی (Mock)
   ----------------------------------------------------------
   Clinic.api.request(method, path, body) دقیقاً شبیه یک REST API رفتار می‌کند:
     - موفق:   {success:true, data, meta?}
     - ناموفق: reject با {success:false, status, message, errors?}
   اگر سرور Express در دسترس باشد (/api/health) از API واقعی استفاده می‌شود؛ وگرنه (مثلاً باز کردن
   فایل از دیسک) حالت نمایشی با localStorage فعال است و همان قواعد سرور (ظرفیت، نقش‌ها و…) را شبیه‌سازی می‌کند.
   ========================================================== */
(function () {
  'use strict';
  window.Clinic = window.Clinic || {};
  const U = () => Clinic.utils;
  const S = () => Clinic.schedule;
  const DB_KEY = 'clinic.db.v3'; // v3: نام درمیکس و دو شعبه‌ی جدید
  const SESSION_KEY = 'clinic.session.v2';
  const COLLECTIONS = ['services', 'wounds', 'branches', 'team', 'gallery', 'testimonials', 'articles', 'journal', 'messages', 'users'];
  const STATUSES = ['جدید', 'در حال بررسی', 'تأیید شده', 'تکمیل شده', 'لغو شده', 'عدم مراجعه'];
  const HOLDING = ['جدید', 'در حال بررسی', 'تأیید شده', 'تکمیل شده', 'عدم مراجعه'];
  const CANCELLABLE = ['جدید', 'در حال بررسی', 'تأیید شده'];
  const ROLES = { super_admin: 'مدیر ارشد', receptionist: 'پذیرش', content_manager: 'مدیر محتوا' };

  // ---------- storage ----------
  let memoryDb = null;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const load = () => { try { const raw = localStorage.getItem(DB_KEY); if (raw) return JSON.parse(raw); } catch (e) { /* ignore */ } return memoryDb; };
  const save = (db) => { memoryDb = db; try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { /* ignore */ } };
  const db = () => {
    let d = load();
    if (!d) { d = clone(Clinic.mockData); save(d); }
    if (d.settings.heroDoctor === undefined) {
      const fresh = Clinic.mockData.settings;
      Object.assign(d.settings, { phone1: fresh.phone1, phone2: fresh.phone2, heroDoctor: fresh.heroDoctor, showTestimonials: false });
      d.team = d.team.filter((member) => !member.isPlaceholder && !Clinic.mockData.team.some((item) => item.name === member.name));
      d.team.push(...clone(Clinic.mockData.team));
      save(d);
    }
    ['appointments', 'messages', 'users', 'patients', 'audit'].forEach((k) => { d[k] = d[k] || []; });
    d.slots = d.slots || {};
    return d;
  };
  const getSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } };
  const setSession = (s) => { try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } };

  const fail = (status, message, errors) => ({ success: false, status, message, errors: errors || null });
  const ok = (data, meta) => ({ success: true, data, meta: meta || undefined });

  // ---------- helpers ----------
  const paginate = (list, query) => {
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 12));
    const page = Math.max(1, Number(query.page) || 1);
    const pages = Math.max(1, Math.ceil(list.length / limit));
    return { items: list.slice((page - 1) * limit, page * limit), meta: { total: list.length, page: Math.min(page, pages), pages, limit } };
  };
  const searchIn = (item, q, fields) => {
    if (!q) return true;
    const needle = U().normalizeDigits(q).toLowerCase();
    return fields.some((f) => U().normalizeDigits(String(item[f] || '')).toLowerCase().includes(needle));
  };
  const parsePath = (path) => {
    const [p, qstr] = path.split('?');
    const query = {}; new URLSearchParams(qstr || '').forEach((v, k) => { query[k] = v; });
    return { parts: p.split('/').filter(Boolean), query };
  };
  const uid = () => 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const requireAuth = (roles) => {
    const s = getSession();
    if (!s) throw fail(401, 'برای ادامه باید وارد پنل مدیریت شوید.');
    if (roles && !roles.includes(s.role)) throw fail(403, 'شما دسترسی لازم برای این کار را ندارید.');
    return s;
  };
  const DESK = ['super_admin', 'receptionist'];
  const CONTENT = ['super_admin', 'content_manager'];
  const sortByOrder = (list) => list.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const slugify = (text) => String(text || '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^؀-ۿa-z0-9-]/g, '') || uid();
  const nowIso = () => new Date().toISOString();
  const logAudit = (data, action, resource, summary) => {
    const s = getSession();
    data.audit.unshift({ id: uid(), action, resource, summary: summary || '', userName: s ? s.name + ' <' + s.email + '>' : '', ip: '127.0.0.1', createdAt: nowIso() });
    data.audit = data.audit.slice(0, 300);
  };

  // ---------- نوبت‌دهی ----------
  const makeRef = () => {
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return 'DMX-' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  };
  const slotKey = (b, d, t) => b + '|' + d + '|' + t;
  const branchBy = (data, slug, activeOnly) => data.branches.find((b) => b.slug === slug && (!activeOnly || b.active !== false));

  const availability = (data, branch, from, days, ignoreLead) => {
    const s = S().settingsOf(branch); const today = S().localDate();
    const start = from && S().DATE_RE.test(from) && from > today ? from : today;
    const last = S().addDays(today, s.horizonDays);
    const n = Math.max(1, Math.min(ignoreLead ? 62 : 31, Number(days) || 14));
    const minStart = ignoreLead ? -Infinity : Date.now() + s.leadMinutes * 60000;
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const date = S().addDays(start, i);
      if (!ignoreLead && date > last) break;
      const slots = S().slotTimes(s, date).map((time) => {
        const left = Math.max(0, s.capacity - (data.slots[slotKey(branch.slug, date, time)] || 0));
        return { time, left, available: left > 0 && S().toUtc(date, time).getTime() >= minStart };
      });
      out.push({ date, weekday: S().weekday(date), closed: !slots.length, slots });
    }
    return out;
  };
  const assertBookable = (branch, date, time, online) => {
    const s = S().settingsOf(branch);
    if (!S().DATE_RE.test(date || '')) throw fail(422, 'لطفاً خطاهای فرم را اصلاح کنید.', { date: 'روز نوبت را انتخاب کنید.' });
    if (!S().TIME_RE.test(time || '')) throw fail(422, 'لطفاً خطاهای فرم را اصلاح کنید.', { time: 'ساعت نوبت را انتخاب کنید.' });
    if (!S().slotTimes(s, date).includes(time)) throw fail(422, 'این ساعت در برنامه‌ی کاری شعبه نیست.', { time: 'این ساعت در برنامه‌ی کاری شعبه نیست.' });
    const startAt = S().toUtc(date, time);
    if (online && startAt.getTime() < Date.now() + s.leadMinutes * 60000) throw fail(422, 'زمان این نوبت گذشته یا خیلی نزدیک است.', { time: 'این ساعت دیگر قابل رزرو نیست.' });
    return { startAt: startAt.toISOString(), durationMin: s.slotMinutes, capacity: s.capacity };
  };
  const reserve = (data, b, d, t, cap) => {
    const k = slotKey(b, d, t);
    if ((data.slots[k] || 0) >= cap) throw fail(409, 'متأسفانه این ساعت همین حالا پر شد. لطفاً ساعت دیگری انتخاب کنید.', { time: 'این ساعت پر شده است.' });
    data.slots[k] = (data.slots[k] || 0) + 1;
  };
  const release = (data, b, d, t) => { const k = slotKey(b, d, t); if (b && d && t && data.slots[k] > 0) data.slots[k] -= 1; };

  const validateAppointment = (body, staff) => {
    const v = U().validators; const errors = {};
    const e1 = v.name(body.fullName); if (e1) errors.fullName = e1;
    const e2 = v.phone(body.phone); if (e2) errors.phone = e2;
    if (!body.branch) errors.branch = 'شعبه را انتخاب کنید.';
    if (!body.woundType) errors.woundType = 'نوع زخم را انتخاب کنید.';
    if (!S().DATE_RE.test(body.date || '')) errors.date = 'روز نوبت را انتخاب کنید.';
    if (!S().TIME_RE.test(body.time || '')) errors.time = 'ساعت نوبت را انتخاب کنید.';
    if (body.visitType === 'home' && String(body.address || '').trim().length < 10) errors.address = 'برای ویزیت در منزل، آدرس کامل را وارد کنید.';
    if (!staff && body.consent !== true) errors.consent = 'برای ثبت نوبت باید با تماس کلینیک موافقت کنید.';
    if (Object.keys(errors).length) throw fail(422, 'لطفاً خطاهای فرم را اصلاح کنید.', errors);
  };
  const book = (data, body, opts) => {
    validateAppointment(body, opts.staff);
    const branch = branchBy(data, body.branch, true);
    if (!branch) throw fail(422, 'لطفاً خطاهای فرم را اصلاح کنید.', { branch: 'شعبه‌ی انتخابی معتبر نیست.' });
    const slot = assertBookable(branch, body.date, body.time, !opts.staff);
    const phone = U().normalizeDigits(body.phone).replace(/[\s-]/g, '');
    if (!opts.staff) {
      const same = data.appointments.find((a) => a.phone === phone && a.branch === branch.slug && a.date === body.date && CANCELLABLE.includes(a.status));
      if (same) throw fail(409, 'شما برای همین روز در این شعبه نوبت دارید. شماره‌ی پیگیری: ' + same.referenceNumber);
    }
    reserve(data, branch.slug, body.date, body.time, slot.capacity);
    let patient = data.patients.find((p) => p.phone === phone);
    if (!patient) { patient = { id: uid(), phone, fullName: '', notes: '', appointmentsCount: 0, createdAt: nowIso() }; data.patients.unshift(patient); }
    patient.fullName = String(body.fullName).trim(); patient.appointmentsCount += 1;
    if (!patient.lastAppointmentAt || patient.lastAppointmentAt < slot.startAt) patient.lastAppointmentAt = slot.startAt;
    const s = getSession();
    const item = {
      id: uid(), referenceNumber: makeRef(), status: opts.status || 'جدید', source: opts.source || 'online', patient: patient.id,
      fullName: patient.fullName, phone, branch: branch.slug, branchName: branch.name, woundType: body.woundType,
      visitType: body.visitType === 'home' ? 'home' : 'clinic', address: String(body.address || '').trim(),
      date: body.date, time: body.time, startAt: slot.startAt, durationMin: slot.durationMin,
      description: String(body.description || '').trim().slice(0, 1000), internalNote: '', cancelReason: '',
      history: [{ at: nowIso(), action: 'created', byName: opts.staff && s ? s.name : 'بیمار (آنلاین)', note: '' }], createdAt: nowIso(),
    };
    data.appointments.unshift(item);
    save(data);
    return item;
  };
  const receipt = (a) => ({
    referenceNumber: a.referenceNumber, status: a.status, date: a.date || '', time: a.time || '', branchName: a.branchName || a.branch, visitType: a.visitType,
    fullName: String(a.fullName).split(' ')[0] + ' …', canCancel: CANCELLABLE.includes(a.status) && (!a.startAt || new Date(a.startAt).getTime() > Date.now() + 7200000),
    preferredDate: a.preferredDate || '', createdAt: a.createdAt,
  });
  const findOwn = (data, body) => {
    const ref = U().normalizeDigits(String(body.referenceNumber || '')).trim().toUpperCase();
    const phone = U().normalizeDigits(String(body.phone || '')).replace(/[\s-]/g, '');
    const errors = {};
    if (!/^(DMX|ALT)-\d{6}-[A-Z2-9]{4}$/.test(ref)) errors.referenceNumber = 'شماره‌ی پیگیری را مثل DMX-050820-AB12 وارد کنید.';
    const e = U().validators.phone(phone); if (e) errors.phone = e;
    if (Object.keys(errors).length) throw fail(422, 'لطفاً خطاهای فرم را اصلاح کنید.', errors);
    const a = data.appointments.find((x) => x.referenceNumber === ref && x.phone === phone);
    if (!a) throw fail(404, 'نوبتی با این شماره‌ی پیگیری و موبایل پیدا نشد.');
    return a;
  };

  const createMessage = (body, data) => {
    if (body.website) return ok({ received: true });
    const v = U().validators; const errors = {};
    const e1 = v.name(body.name); if (e1) errors.name = e1;
    const e2 = v.phone(body.phone); if (e2) errors.phone = e2;
    const e3 = v.required(body.message, 'متن پیام را بنویسید.'); if (e3) errors.message = e3;
    if (Object.keys(errors).length) throw fail(422, 'لطفاً خطاهای فرم را اصلاح کنید.', errors);
    data.messages.unshift({ id: uid(), name: body.name.trim(), phone: U().normalizeDigits(body.phone).trim(), message: body.message.trim().slice(0, 2000), read: false, createdAt: nowIso() });
    save(data);
    return ok({ received: true });
  };

  // ---------- public ----------
  const publishedOnly = (list) => list.filter((x) => x.published !== false && x.active !== false);
  const publicRoute = (method, parts, query, body, data) => {
    const [r, slug] = parts;
    if (method === 'POST') {
      if (r === 'appointments' && !slug) {
        if (body.website) return ok({ referenceNumber: makeRef(), status: 'جدید' });
        const a = book(data, body, {});
        return ok({ referenceNumber: a.referenceNumber, status: a.status, date: a.date, time: a.time, branchName: a.branchName, visitType: a.visitType });
      }
      if (r === 'appointments' && slug === 'otp') return ok({ required: false }); // حالت نمایشی: کد تأیید پیامکی ندارد
      if (r === 'appointments' && slug === 'lookup') return ok(receipt(findOwn(data, body)));
      if (r === 'appointments' && slug === 'cancel') {
        const a = findOwn(data, body);
        if (!receipt(a).canCancel) throw fail(409, 'این نوبت دیگر از طریق سایت قابل لغو نیست؛ لطفاً با کلینیک تماس بگیرید.');
        a.status = 'لغو شده'; a.cancelledAt = nowIso(); a.cancelReason = String(body.reason || '').slice(0, 300);
        a.history.push({ at: nowIso(), action: 'cancel', byName: 'بیمار (آنلاین)', note: a.cancelReason });
        release(data, a.branch, a.date, a.time); save(data);
        return ok(receipt(a));
      }
      if (r === 'messages') return createMessage(body, data);
      throw fail(405, 'متد مجاز نیست.');
    }
    switch (r) {
      case 'settings': return ok(data.settings);
      case 'statistics': return ok(Object.assign({}, data.statistics, { branches: data.branches.filter((b) => b.active).length }));
      case 'availability': {
        const branch = branchBy(data, query.branch, true);
        if (!branch) throw fail(422, 'لطفاً خطاهای فرم را اصلاح کنید.', { branch: 'شعبه‌ی انتخابی معتبر نیست.' });
        const s = S().settingsOf(branch);
        return ok({ branch: branch.slug, enabled: s.enabled, slotMinutes: s.slotMinutes, days: availability(data, branch, query.from, query.days) });
      }
      case 'services': case 'wounds': case 'branches': case 'team': {
        const list = sortByOrder(publishedOnly(data[r]));
        if (slug) { const item = list.find((x) => x.slug === slug || x.id === slug); if (!item) throw fail(404, 'مورد درخواستی پیدا نشد.'); return ok(item); }
        return ok(list);
      }
      case 'gallery': {
        let list = sortByOrder(publishedOnly(data.gallery));
        if (query.category && query.category !== 'all') list = list.filter((x) => x.category === query.category);
        return ok(list);
      }
      case 'testimonials': {
        if (!data.settings.showTestimonials) throw fail(404, 'صفحه پیدا نشد.');
        let list = sortByOrder(publishedOnly(data.testimonials).filter((item) => item.consent && item.videoUrl));
        if (query.category && query.category !== 'all') list = list.filter((x) => x.category === query.category);
        const { items, meta } = paginate(list, { page: query.page, limit: query.limit || 12 });
        return ok(items, meta);
      }
      case 'articles': case 'journal': {
        let list = publishedOnly(data[r]).slice().sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
        if (slug) { const item = list.find((x) => x.slug === slug); if (!item) throw fail(404, 'مقاله‌ی درخواستی پیدا نشد.'); return ok(item); }
        if (query.category && query.category !== 'all') list = list.filter((x) => x.category === query.category);
        if (query.q) list = list.filter((x) => searchIn(x, query.q, ['title', 'excerpt']));
        const { items, meta } = paginate(list, { page: query.page, limit: query.limit || 9 });
        return ok(items, meta);
      }
      case 'article-categories': return ok(data.articleCategories);
      case 'journal-categories': return ok(data.journalCategories);
      default: throw fail(404, 'مسیر پیدا نشد.');
    }
  };

  // ---------- admin: نوبت‌ها، تقویم، بیماران ----------
  const appointmentsAdmin = (method, id, query, body, data) => {
    const s = requireAuth(method === 'DELETE' ? ['super_admin'] : DESK);
    const list = data.appointments;
    if (method === 'GET' && !id) {
      let items = list.slice();
      ['status', 'branch', 'source'].forEach((k) => { if (query[k] && query[k] !== 'all') items = items.filter((x) => x[k] === query[k]); });
      if (query.date) items = items.filter((x) => x.date === query.date);
      if (query.from) items = items.filter((x) => x.date && x.date >= query.from);
      if (query.to) items = items.filter((x) => x.date && x.date <= query.to);
      if (query.patient) items = items.filter((x) => x.patient === query.patient);
      if (query.upcoming === '1') items = items.filter((x) => x.startAt && new Date(x.startAt) >= new Date());
      if (query.q) items = items.filter((x) => searchIn(x, query.q, ['fullName', 'phone', 'referenceNumber']));
      if (query.sort === 'time' || query.upcoming === '1' || query.date || query.from || query.to) items.sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')));
      const { items: page, meta } = paginate(items, { page: query.page, limit: query.limit || 20 });
      return ok(page, meta);
    }
    if (method === 'POST' && !id) {
      const a = book(data, body, { staff: true, source: ['phone', 'walk_in', 'admin'].includes(body.source) ? body.source : 'phone', status: HOLDING.includes(body.status) ? body.status : 'تأیید شده' });
      logAudit(data, 'create', 'appointments', a.referenceNumber + ' — ' + a.date + ' ' + a.time); save(data);
      return ok(a);
    }
    const a = list.find((x) => x.id === id);
    if (!a) throw fail(404, 'مورد پیدا نشد.');
    if (method === 'GET') return ok(Object.assign({}, a, { patientVisits: list.filter((x) => x.patient && x.patient === a.patient).length || 1 }));
    if (method === 'DELETE') {
      if (HOLDING.includes(a.status)) release(data, a.branch, a.date, a.time);
      data.appointments = list.filter((x) => x !== a);
      logAudit(data, 'delete', 'appointments', a.referenceNumber); save(data);
      return ok({ deleted: id });
    }
    // PUT / PATCH
    const by = { at: nowIso(), byName: s.name };
    const before = { status: a.status, branch: a.branch, date: a.date, time: a.time };
    const next = Object.assign({}, a, { history: a.history ? a.history.slice() : [] });
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) throw fail(422, 'وضعیت نامعتبر است.', { status: 'وضعیت نامعتبر است.' });
      if (body.status !== a.status) { next.history.push(Object.assign({ action: 'status', note: a.status + ' ← ' + body.status }, by)); next.status = body.status; if (body.status === 'لغو شده') { next.cancelledAt = nowIso(); next.cancelReason = body.cancelReason || ''; } }
    }
    if (typeof body.internalNote === 'string' && body.internalNote !== a.internalNote) { next.internalNote = body.internalNote; next.history.push(Object.assign({ action: 'note', note: '' }, by)); }
    if (body.assignedTo !== undefined) {
      if (body.assignedTo && !data.team.find((t) => t.id === body.assignedTo)) throw fail(422, 'عضو تیم معتبر نیست.', { assignedTo: 'عضو تیم معتبر نیست.' });
      next.assignedTo = body.assignedTo || undefined; next.history.push(Object.assign({ action: 'assign', note: '' }, by));
    }
    let cap = null;
    if ((body.date && body.date !== a.date) || (body.time && body.time !== a.time) || (body.branch && body.branch !== a.branch)) {
      const br = branchBy(data, body.branch || a.branch);
      if (!br) throw fail(422, 'شعبه معتبر نیست.', { branch: 'شعبه معتبر نیست.' });
      const date = body.date || a.date; const time = body.time || a.time;
      const slot = assertBookable(br, date, time, false);
      next.history.push(Object.assign({ action: 'reschedule', note: (a.date || '—') + ' ' + (a.time || '') + ' ← ' + date + ' ' + time }, by));
      Object.assign(next, { branch: br.slug, branchName: br.name, date, time, startAt: slot.startAt, durationMin: slot.durationMin });
      cap = slot.capacity;
    }
    const key = (x) => slotKey(x.branch, x.date, x.time);
    const heldBefore = HOLDING.includes(before.status) && before.date && before.time;
    const holdsAfter = HOLDING.includes(next.status) && next.date && next.time;
    if (holdsAfter && (!heldBefore || key(before) !== key(next))) reserve(data, next.branch, next.date, next.time, cap == null ? S().settingsOf(branchBy(data, next.branch)).capacity : cap);
    if (heldBefore && (!holdsAfter || key(before) !== key(next))) release(data, before.branch, before.date, before.time);
    next.updatedAt = nowIso();
    Object.assign(a, next);
    logAudit(data, 'update', 'appointments', a.referenceNumber); save(data);
    return ok(a);
  };

  const adminRoute = (method, parts, query, body, data) => {
    const [, coll, id] = parts;
    if (coll === 'dashboard') {
      requireAuth();
      const today = S().localDate();
      const hold = data.appointments.filter((a) => HOLDING.includes(a.status));
      const week = Array.from({ length: 7 }, (_, i) => { const d = S().addDays(today, i); return { date: d, weekday: S().weekday(d), count: hold.filter((a) => a.date === d).length }; });
      const todayList = hold.filter((a) => a.date === today).sort((a, b) => a.time.localeCompare(b.time));
      return ok({
        today, appointmentsTotal: data.appointments.length, appointmentsNew: data.appointments.filter((a) => a.status === 'جدید').length,
        messagesUnread: data.messages.filter((m) => !m.read).length, articlesTotal: data.articles.length + data.journal.length, patientsTotal: data.patients.length,
        recent: data.appointments.slice(0, 6), todayCount: todayList.length, todayList, week, weekTotal: week.reduce((s, d) => s + d.count, 0),
        byStatus: STATUSES.map((st) => ({ status: st, count: data.appointments.filter((a) => a.status === st).length })),
      });
    }
    if (coll === 'appointments') return appointmentsAdmin(method, id, query, body, data);
    if (coll === 'calendar') {
      requireAuth(DESK);
      const br = branchBy(data, query.branch);
      if (!br) throw fail(422, 'شعبه را انتخاب کنید.');
      const date = S().DATE_RE.test(query.date || '') ? query.date : S().localDate();
      const s = S().settingsOf(br); const [day] = availability(data, br, date, 1, true);
      return ok({ date, weekday: S().weekday(date), branch: { slug: br.slug, name: br.name }, capacity: s.capacity, slotMinutes: s.slotMinutes, closed: day.closed, slots: day.slots,
        appointments: data.appointments.filter((a) => a.branch === br.slug && a.date === date).sort((a, b) => a.time.localeCompare(b.time)) });
    }
    if (coll === 'patients') {
      requireAuth(DESK);
      if (method === 'GET' && !id) {
        const items = data.patients.filter((p) => searchIn(p, query.q, ['fullName', 'phone'])).sort((a, b) => String(b.lastAppointmentAt || '').localeCompare(String(a.lastAppointmentAt || '')));
        const { items: page, meta } = paginate(items, { page: query.page, limit: query.limit || 20 });
        return ok(page, meta);
      }
      const p = data.patients.find((x) => x.id === id);
      if (!p) throw fail(404, 'بیمار پیدا نشد.');
      if (method === 'GET') return ok(Object.assign({}, p, { appointments: data.appointments.filter((a) => a.patient === p.id) }));
      if (typeof body.notes === 'string') p.notes = body.notes;
      if (typeof body.fullName === 'string' && body.fullName.trim().length >= 3) p.fullName = body.fullName.trim();
      logAudit(data, 'update', 'patients', p.fullName); save(data);
      return ok(p);
    }
    if (coll === 'audit') {
      requireAuth(['super_admin']);
      let items = data.audit;
      if (query.action && query.action !== 'all') items = items.filter((x) => x.action === query.action);
      if (query.resource && query.resource !== 'all') items = items.filter((x) => x.resource === query.resource);
      if (query.q) items = items.filter((x) => searchIn(x, query.q, ['userName', 'summary']));
      const { items: page, meta } = paginate(items, { page: query.page, limit: query.limit || 30 });
      return ok(page, meta);
    }
    if (coll === 'settings' || coll === 'statistics') {
      requireAuth(CONTENT);
      if (['PUT', 'PATCH'].includes(method)) {
        data[coll] = Object.assign({}, data[coll], body);
        if (coll === 'settings') data.settings.isPlaceholder = false;
        logAudit(data, 'update', coll, ''); save(data);
      }
      return ok(data[coll]);
    }
    if (!COLLECTIONS.includes(coll)) throw fail(404, 'مسیر پیدا نشد.');
    requireAuth(coll === 'users' ? ['super_admin'] : coll === 'messages' ? DESK : CONTENT);

    const list = data[coll];
    if (method === 'GET' && !id) {
      const items = list.filter((x) => searchIn(x, query.q, ['title', 'name', 'message', 'email', 'phone', 'city']));
      const { items: page, meta } = paginate(items, { page: query.page, limit: query.limit || 20 });
      return ok(page, meta);
    }
    if (method === 'GET') { const item = list.find((x) => x.id === id); if (!item) throw fail(404, 'مورد پیدا نشد.'); return ok(item); }
    if (method === 'POST') {
      if (coll === 'users' && body.password && (String(body.password).length < 10 || !/\d/.test(body.password))) throw fail(422, 'اطلاعات واردشده معتبر نیست.', { password: 'رمز عبور باید حداقل ۱۰ نویسه و شامل عدد باشد.' });
      const item = Object.assign({}, body, { id: uid() });
      delete item.password;
      if (!item.slug && (item.title || item.name) && coll !== 'users') item.slug = slugify(item.title || item.name);
      if (['articles', 'journal'].includes(coll) && !item.publishedAt) item.publishedAt = nowIso();
      item.createdAt = nowIso();
      list.unshift(item);
      logAudit(data, 'create', coll, item.title || item.name || ''); save(data);
      return ok(item);
    }
    const idx = list.findIndex((x) => x.id === id);
    if (idx < 0) throw fail(404, 'مورد پیدا نشد.');
    if (method === 'PUT' || method === 'PATCH') {
      const patch = Object.assign({}, body); delete patch.password;
      list[idx] = Object.assign({}, list[idx], patch, { id: list[idx].id, updatedAt: nowIso() });
      logAudit(data, 'update', coll, list[idx].title || list[idx].name || ''); save(data);
      return ok(list[idx]);
    }
    if (method === 'DELETE') {
      const [gone] = list.splice(idx, 1);
      logAudit(data, 'delete', coll, gone.title || gone.name || ''); save(data);
      return ok({ deleted: id });
    }
    throw fail(405, 'متد مجاز نیست.');
  };

  // ---------- auth (نمایشی) ----------
  const authRoute = (method, parts, body, data) => {
    const action = parts[1];
    if (action === 'login' && method === 'POST') {
      const email = String(body.email || '').trim(); const errors = {};
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'ایمیل معتبر وارد کنید.';
      if (String(body.password || '').length < 8) errors.password = 'رمز عبور حداقل ۸ نویسه است.';
      if (Object.keys(errors).length) throw fail(422, 'اطلاعات ورود نادرست است.', errors);
      const role = ROLES[body.role] ? body.role : 'super_admin';
      const session = { id: 'demo', email, role, name: email.split('@')[0], demo: true, lastLoginAt: nowIso() };
      setSession(session); logAudit(data, 'login', 'auth', ''); save(data);
      return ok(session);
    }
    if (action === 'me' && method === 'GET') { const s = getSession(); if (!s) throw fail(401, 'وارد نشده‌اید.'); return ok(s); }
    if ((action === 'logout' || action === 'logout-all') && method === 'POST') { setSession(null); return ok({ loggedOut: true }); }
    if (action === 'password' && method === 'PUT') {
      requireAuth();
      const p = String(body.newPassword || '');
      if (p.length < 10 || !/\d/.test(p) || !/[^\d]/.test(p)) throw fail(422, 'رمز عبور باید حداقل ۱۰ نویسه و شامل حرف و عدد باشد.', { newPassword: 'رمز عبور باید حداقل ۱۰ نویسه و شامل حرف و عدد باشد.' });
      return ok({ changed: true });
    }
    throw fail(404, 'مسیر پیدا نشد.');
  };

  const mockRequest = (method, path, body) => new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        const m = String(method || 'GET').toUpperCase();
        const { parts, query } = parsePath(path);
        const data = db();
        let result;
        if (parts[0] === 'auth') result = authRoute(m, parts, body || {}, data);
        else if (parts[0] === 'admin') result = adminRoute(m, parts, query, body || {}, data);
        else result = publicRoute(m, parts, query, body || {}, data);
        resolve(clone(result));
      } catch (err) {
        if (!(err && err.success === false)) console.error(err);
        reject(err && err.success === false ? err : fail(500, 'خطای غیرمنتظره رخ داد. لطفاً دوباره تلاش کنید.'));
      }
    }, 120);
  });

  // ---------- حالت واقعی ----------
  /* حالت نمایشی (داده‌ی ساختگی در مرورگر) فقط برای توسعه است: باز کردن فایل از دیسک، یا localhost بدون سرور.
     روی دامنه‌ی واقعی اگر سرور جواب ندهد، سایت باید «خطا» نشان بدهد؛ وگرنه بیمار نوبتی «ثبت» می‌کند
     که هیچ‌وقت به کلینیک نمی‌رسد، و صفحه‌ی ورود مدیران هر رمزی را قبول می‌کند. */
  const LOCAL_DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;
  let detectPromise = null;
  const detect = () => {
    if (!detectPromise) {
      detectPromise = (async () => {
        if (!/^https?:$/.test(window.location.protocol)) return 'mock';
        const whenDown = LOCAL_DEV_HOST.test(window.location.hostname) ? 'mock' : 'real';
        try { const r = await fetch('/api/health', { credentials: 'same-origin' }); const j = await r.json(); return j && j.success ? 'real' : whenDown; } catch (e) { return whenDown; }
      })().then((m) => { api.mode = m; return m; });
    }
    return detectPromise;
  };
  const realRequest = async (method, path, body) => {
    const opt = { method, credentials: 'same-origin', headers: {} };
    if (body instanceof FormData) opt.body = body;
    else if (body !== undefined && method !== 'GET') { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    let res;
    try { res = await fetch('/api' + path, opt); } catch (e) { throw fail(0, 'ارتباط با سرور برقرار نشد. اینترنت یا سرور را بررسی کنید.'); }
    let json = null;
    try { json = await res.json(); } catch (e) { /* ignore */ }
    if (res.ok && json && json.success) return json;
    // پاسخ غیر JSON یعنی خود سرور برنامه جواب نداده (مثلاً صفحه‌ی خطای پراکسی یا هاست)
    throw fail(res.status, (json && json.message) || 'سرور در دسترس نیست. لطفاً چند دقیقه‌ی دیگر دوباره تلاش کنید.', (json && json.errors) || null);
  };
  const request = async (method, path, body) => ((await detect()) === 'real' ? realRequest(method, path, body) : mockRequest(method, path, body));

  const api = Clinic.api = {
    mode: 'mock', detect, request,
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    upload: async (file) => {
      if (await detect() !== 'real') throw fail(0, 'برای بارگذاری عکس، سایت را با سرور پروژه باز کنید.');
      const form = new FormData();
      form.append('file', file);
      return realRequest('POST', '/admin/uploads', form);
    },
    put: (path, body) => request('PUT', path, body),
    del: (path) => request('DELETE', path),
    session: getSession,
    statuses: STATUSES, holding: HOLDING, roles: ROLES,
    resetDemoData: () => { try { localStorage.removeItem(DB_KEY); } catch (e) { /* ignore */ } memoryDb = null; },
  };
})();
