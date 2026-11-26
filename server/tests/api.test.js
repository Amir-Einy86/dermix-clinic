/*
  api.test.js — تست کامل API: ورود و امنیت، نوبت‌دهی (ظرفیت، هم‌زمانی، لغو، جابجایی)، نقش‌ها و CRUD
  اجرا: npm test   (MongoDB موقت در حافظه بالا می‌آید؛ یا MONGODB_URI_TEST را تنظیم کنید)
*/
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const db = require('./helpers/memoryDb');
const M = require('../src/models');
const T = require('../src/utils/time');
const createApp = require('../src/app');

let app; let boss; let editor; let desk;
const PASS = 'Password-123';
const agent = () => request.agent(app);
const login = async (email, password) => { const a = agent(); const r = await a.post('/api/auth/login').send({ email, password }); return { a, r }; };
const DAY = T.addDays(T.localDate(), 1); // فردا — همیشه در آینده
const sms = require('../src/services/sms');
const reminders = require('../src/services/reminders');
const BASE = { fullName: 'علی رضایی', phone: '09123456789', branch: 'fardis', woundType: 'pressure', date: DAY, time: '10:00', consent: true };
// کد تأیید پیامکی واقعی: درخواست کد → خواندن کد از صندوق پیامک‌های آزمایشی (SMS_DRIVER=log)
const getOtp = async (phone) => {
  await M.PhoneOtp.deleteOne({ phone }); // فاصله‌ی ۶۰ ثانیه‌ای ارسال دوباره را برای تست دور می‌زنیم
  const r = await request(app).post('/api/appointments/otp').send({ phone });
  if (r.status !== 200) return '';
  return [...sms.outbox].reverse().find((m) => m.phone === phone && m.kind === 'otp').tokens.token;
};
const book = async (extra) => {
  const body = Object.assign({}, BASE, extra);
  const phone = String(body.phone).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  if (!('otp' in body) && /^09\d{9}$/.test(phone) && !body.website) body.otp = await getOtp(phone);
  return request(app).post('/api/appointments').send(body);
};
const counter = async (time) => ((await M.SlotCounter.findOne({ branch: 'fardis', date: DAY, time })) || { count: 0 }).count;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '08:00', end: '20:00' }));

test.before(async () => {
  await db.setup();
  app = createApp();
  const hash = await M.User.hashPassword(PASS);
  await M.User.create({ name: 'مدیر', email: 'boss@test.com', role: 'super_admin', passwordHash: hash });
  await M.User.create({ name: 'ویرایشگر', email: 'editor@test.com', role: 'content_manager', passwordHash: hash });
  await M.User.create({ name: 'پذیرش', email: 'desk@test.com', role: 'receptionist', passwordHash: hash });
  await M.User.create({ name: 'قفل', email: 'lock@test.com', role: 'content_manager', passwordHash: hash });
  await M.Branch.create({ name: 'فردیس', slug: 'fardis', active: true, homeVisit: true, booking: { slotMinutes: 30, capacity: 2, leadMinutes: 0, shifts: ALL_DAYS } });
  await M.Branch.create({ name: 'مخفی', slug: 'hidden', active: false });
  await M.Branch.create({ name: 'تعطیل', slug: 'closed', active: true, booking: { shifts: ALL_DAYS, closedDates: [DAY] } });
  await M.Service.create({ title: 'وکیوم', slug: 'vacuum', published: true });
  await M.Service.create({ title: 'پیش‌نویس', slug: 'draft', published: false });
  await M.TeamMember.create({ name: 'دکتر نمونه', slug: 'doc' });
  boss = (await login('boss@test.com', PASS)).a;
  editor = (await login('editor@test.com', PASS)).a;
  desk = (await login('desk@test.com', PASS)).a;
});
test.after(() => db.teardown());

// ================= محتوای عمومی =================
test('عمومی: فقط محتوای منتشرشده نمایش داده می‌شود', async () => {
  const list = await request(app).get('/api/services');
  assert.deepEqual(list.body.data.map((s) => s.slug), ['vacuum']);
  assert.ok(list.body.data[0].id && !list.body.data[0]._id);
  assert.equal((await request(app).get('/api/services/draft')).status, 404);
  const br = await request(app).get('/api/branches');
  assert.deepEqual(br.body.data.map((b) => b.slug).sort(), ['closed', 'fardis']);
  assert.ok(br.body.data.find((b) => b.slug === 'fardis').booking.shifts.length); // تنظیمات نوبت‌دهی همراه شعبه
});

test('عمومی: تنظیمات و آمار', async () => {
  const s = await request(app).get('/api/statistics');
  assert.equal(s.body.data.patients, null);
  assert.equal(s.body.data.branches, 2);
});

// ================= ورود و امنیت =================
test('ورود: پیام یکسان برای رمز غلط و ایمیل ناموجود، کوکی HttpOnly و SameSite=Strict', async () => {
  const bad = await request(app).post('/api/auth/login').send({ email: 'boss@test.com', password: 'wrong-password' });
  const none = await request(app).post('/api/auth/login').send({ email: 'nobody@test.com', password: 'wrong-password' });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.message, none.body.message);
  const ok = await request(app).post('/api/auth/login').send({ email: 'boss@test.com', password: PASS });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.passwordHash, undefined);
  assert.match(ok.headers['set-cookie'][0], /HttpOnly/i);
  assert.match(ok.headers['set-cookie'][0], /SameSite=Strict/i);
});

test('ورود: تزریق NoSQL رد می‌شود', async () => {
  const r = await request(app).post('/api/auth/login').send({ email: { $ne: '' }, password: { $ne: '' } });
  assert.equal(r.status, 422);
});

test('ورود: قفل موقت بعد از ۵ تلاش ناموفق، بدون لو دادن وجود حساب', async () => {
  for (let i = 0; i < 5; i += 1) await request(app).post('/api/auth/login').send({ email: 'lock@test.com', password: 'wrong-password' });
  const locked = await request(app).post('/api/auth/login').send({ email: 'lock@test.com', password: PASS }); // حتی با رمز درست
  assert.equal(locked.status, 401);
  assert.equal(locked.headers['set-cookie'], undefined); // واقعاً قفل است: کوکی ورود صادر نشد
  // پاسخ حساب قفل‌شده باید دقیقاً مثل ایمیلی باشد که اصلاً وجود ندارد (همان تعداد تلاش)
  let missing;
  for (let i = 0; i < 6; i += 1) missing = await request(app).post('/api/auth/login').send({ email: 'ghost@test.com', password: 'wrong-password' });
  assert.equal(locked.status, missing.status);
  assert.deepEqual(locked.body, missing.body);
  assert.ok((await M.AuditLog.countDocuments({ action: 'login_failed' })) >= 5);
  assert.ok((await M.AuditLog.countDocuments({ action: 'login_locked' })) >= 1); // ولی مدیر ارشد در گزارش فعالیت می‌بیند
});

test('خروج: توکن دزدیده‌شده بعد از خروج دیگر کار نمی‌کند، ولی دستگاه دیگر وارد می‌ماند', async () => {
  const r = await request(app).post('/api/auth/login').send({ email: 'boss@test.com', password: PASS });
  const stolen = r.headers['set-cookie'][0].split(';')[0]; // مهاجم کوکی را کپی کرده است
  const other = (await login('boss@test.com', PASS)).a;
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', stolen)).status, 200);
  await request(app).post('/api/auth/logout').set('Cookie', stolen);
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', stolen)).status, 401);
  assert.equal((await request(app).get('/api/admin/patients').set('Cookie', stolen)).status, 401);
  assert.equal((await other.get('/api/auth/me')).status, 200);
});

test('خروج و خروج از همه‌ی دستگاه‌ها', async () => {
  const { a } = await login('editor@test.com', PASS);
  await a.post('/api/auth/logout');
  assert.equal((await a.get('/api/auth/me')).status, 401);
  const s1 = (await login('editor@test.com', PASS)).a;
  const s2 = (await login('editor@test.com', PASS)).a;
  assert.equal((await s1.post('/api/auth/logout-all')).status, 200);
  assert.equal((await s2.get('/api/auth/me')).status, 401); // نشست دیگر هم باطل شد
  editor = (await login('editor@test.com', PASS)).a;
});

test('تغییر رمز: سیاست رمز، باطل شدن نشست‌های دیگر، ادامه‌ی نشست فعلی', async () => {
  await M.User.create({ name: 'رمز', email: 'pw@test.com', role: 'content_manager', passwordHash: await M.User.hashPassword(PASS) });
  const a = (await login('pw@test.com', PASS)).a;
  const other = (await login('pw@test.com', PASS)).a;
  assert.equal((await a.put('/api/auth/password').send({ currentPassword: 'nope-nope-1', newPassword: 'NewPass-2025' })).status, 422);
  assert.equal((await a.put('/api/auth/password').send({ currentPassword: PASS, newPassword: 'short1' })).status, 422);
  assert.equal((await a.put('/api/auth/password').send({ currentPassword: PASS, newPassword: 'onlyletterspass' })).status, 422);
  assert.equal((await a.put('/api/auth/password').send({ currentPassword: PASS, newPassword: 'NewPass-2025' })).status, 200);
  assert.equal((await a.get('/api/auth/me')).status, 200);
  assert.equal((await other.get('/api/auth/me')).status, 401);
  assert.equal((await login('pw@test.com', 'NewPass-2025')).r.status, 200);
});

test('health check: با دیتابیس وصل ۲۰۰، بدون اطلاعات داخلی', async () => {
  const r = await request(app).get('/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { success: true, data: { status: 'ok', db: 'up' } });
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('امنیت: Origin بیگانه، هدرها، Cache-Control مدیریتی', async () => {
  assert.equal((await boss.post('/api/admin/services').set('Origin', 'https://evil.example').send({ title: 'x' })).status, 403);
  const r = await request(app).get('/api/health');
  assert.equal(r.headers['x-powered-by'], undefined);
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal((await boss.get('/api/admin/dashboard')).headers['cache-control'], 'no-store');
});

test('امنیت: خطای غیرمنتظره جزئیات فنی (stack) را به کاربر نمی‌دهد، حتی بیرون از production', async () => {
  const r = await request(app).get('/api/services/%E0%A4%A'); // آدرس خراب → خطای داخلی Express
  assert.equal(r.status, 400); // درخواست نادرست است، نه خطای سرور
  assert.equal(r.body.success, false);
  assert.equal(r.body.stack, undefined);
  assert.ok(!JSON.stringify(r.body).includes('node_modules'));
});

// ================= نوبت‌دهی آنلاین =================
test('دسترس‌پذیری: بازه‌های روز، و شعبه‌ی تعطیل/غیرفعال', async () => {
  const r = await request(app).get('/api/availability?branch=fardis&from=' + DAY + '&days=3');
  assert.equal(r.status, 200);
  const day = r.body.data.days[0];
  assert.equal(day.date, DAY);
  assert.equal(day.slots.length, 24); // ۰۸:۰۰ تا ۲۰:۰۰ با بازه‌ی ۳۰ دقیقه
  assert.deepEqual(day.slots.find((s) => s.time === '10:00'), { time: '10:00', left: 2, available: true });
  const closed = await request(app).get('/api/availability?branch=closed&from=' + DAY + '&days=1');
  assert.equal(closed.body.data.days[0].closed, true);
  assert.equal((await request(app).get('/api/availability?branch=hidden')).status, 422);
});

test('رزرو: موفق، فیلدهای تحمیلی نادیده، پرونده‌ی بیمار و شمارنده', async () => {
  const r = await book({ phone: '۰۹۱۲۳۴۵۶۷۸۹', status: 'تکمیل شده', internalNote: 'hack', source: 'admin' });
  assert.equal(r.status, 201);
  assert.match(r.body.data.referenceNumber, /^DMX-\d{6}-[A-Z2-9]{10}$/);
  assert.equal(r.body.data.time, '10:00');
  assert.equal(r.body.data.phone, undefined); // اطلاعات شخصی برنمی‌گردد
  const saved = await M.Appointment.findOne({ referenceNumber: r.body.data.referenceNumber });
  assert.equal(saved.status, 'جدید');
  assert.equal(saved.source, 'online');
  assert.equal(saved.internalNote, '');
  assert.ok(saved.startAt instanceof Date);
  assert.equal(saved.history[0].action, 'created');
  const p = await M.Patient.findOne({ phone: '09123456789' });
  assert.equal(p.appointmentsCount, 1);
  assert.equal(await counter('10:00'), 1);
  assert.equal((await book({ time: '12:00' })).status, 409); // همان روز همان شعبه
});

test('رزرو: ظرفیت پر می‌شود', async () => {
  assert.equal((await book({ phone: '09120000001', time: '10:30' })).status, 201);
  assert.equal((await book({ phone: '09120000002', time: '10:30' })).status, 201);
  const third = await book({ phone: '09120000003', time: '10:30' });
  assert.equal(third.status, 409);
  assert.ok(third.body.errors.time);
  const day = (await request(app).get('/api/availability?branch=fardis&from=' + DAY + '&days=1')).body.data.days[0];
  assert.deepEqual(day.slots.find((s) => s.time === '10:30'), { time: '10:30', left: 0, available: false });
});

test('رزرو: درخواست‌های هم‌زمان هرگز از ظرفیت جلو نمی‌زنند', async () => {
  const phones = ['09121000001', '09121000002', '09121000003', '09121000004', '09121000005', '09121000006'];
  const codes = []; for (const phone of phones) codes.push(await getOtp(phone)); // اول همه‌ی کدها…
  const res = await Promise.all(phones.map((phone, i) => book({ phone, time: '11:00', otp: codes[i] }))); // …بعد همه‌ی رزروها هم‌زمان
  assert.equal(res.filter((r) => r.status === 201).length, 2);
  assert.equal(res.filter((r) => r.status === 409).length, 4);
  assert.equal(await counter('11:00'), 2);
  assert.equal(await M.Appointment.countDocuments({ date: DAY, time: '11:00' }), 2);
});

test('رزرو: خطاهای اعتبارسنجی، ساعت خارج از برنامه، روز تعطیل، شعبه‌ی غیرفعال، honeypot', async () => {
  const bad = await request(app).post('/api/appointments').send({ fullName: 'x' });
  assert.equal(bad.status, 422);
  ['phone', 'date', 'time', 'consent'].forEach((k) => assert.ok(bad.body.errors[k], k));
  assert.equal((await book({ phone: '09122000001', time: '10:15' })).status, 422);
  assert.equal((await book({ phone: '09122000001', time: '21:00' })).status, 422);
  assert.equal((await book({ phone: '09122000001', date: T.addDays(T.localDate(), -1) })).status, 422);
  assert.equal((await book({ phone: '09122000001', branch: 'closed' })).status, 422);
  assert.ok((await book({ phone: '09122000001', branch: 'hidden' })).body.errors.branch);
  assert.ok((await book({ phone: '09122000001', visitType: 'home', address: 'کوتاه' })).body.errors.address);
  const before = await M.Appointment.countDocuments();
  assert.equal((await book({ phone: '09122222222', website: 'spam.com' })).status, 201);
  assert.equal(await M.Appointment.countDocuments(), before);
});

test('پیگیری و لغو توسط بیمار', async () => {
  const r = await book({ phone: '09123000001', time: '13:00' });
  const ref = r.body.data.referenceNumber;
  assert.equal((await request(app).post('/api/appointments/lookup').send({ referenceNumber: ref, phone: '09129999999' })).status, 404);
  const found = await request(app).post('/api/appointments/lookup').send({ referenceNumber: ref.toLowerCase(), phone: '۰۹۱۲۳۰۰۰۰۰۱' });
  assert.equal(found.status, 200);
  assert.equal(found.body.data.canCancel, true);
  assert.equal(found.body.data.phone, undefined);
  assert.equal(await counter('13:00'), 1);
  const cancel = () => request(app).post('/api/appointments/cancel').send({ referenceNumber: ref, phone: '09123000001', reason: 'بهبود یافتم' });
  const cancellations = await Promise.all([cancel(), cancel()]);
  assert.deepEqual(cancellations.map((response) => response.status).sort(), [200, 409]);
  assert.equal(cancellations.find((response) => response.status === 200).body.data.status, 'لغو شده');
  assert.equal(await counter('13:00'), 0); // ظرفیت آزاد شد
  assert.equal((await request(app).post('/api/appointments/cancel').send({ referenceNumber: ref, phone: '09123000001' })).status, 409);
});

// ================= پیامک: کد تأیید، شماره‌ی پیگیری، تأیید/لغو، یادآوری =================
test('کد تأیید: بدون کد، کد اشتباه، قفل بعد از ۵ اشتباه، کد درست، و مصرف یک‌باره', async () => {
  const phone = '09125550001';
  const base = { phone, time: '17:00' };
  assert.equal((await request(app).get('/api/availability?branch=fardis&days=1')).body.data.otpRequired, true);
  // بدون کد
  const none = await request(app).post('/api/appointments').send(Object.assign({}, BASE, base));
  assert.equal(none.status, 422);
  assert.ok(none.body.errors.otp);
  // خطاهای فرم قبل از کد نشان داده می‌شوند
  assert.ok((await request(app).post('/api/appointments').send({ fullName: 'x' })).body.errors.date);
  // کد اشتباه و قفل
  const code = await getOtp(phone);
  assert.match(code, /^\d{5}$/);
  const wrong = code === '11111' ? '22222' : '11111';
  for (let i = 0; i < 5; i += 1) assert.equal((await book(Object.assign({}, base, { otp: wrong }))).body.errors.otp, 'کد تأیید نادرست است.');
  assert.match((await book(Object.assign({}, base, { otp: code }))).body.errors.otp, /چند بار اشتباه/); // حتی کد درست بعد از ۵ اشتباه
  // کد تازه و درست
  const fresh = await getOtp(phone);
  const okRes = await book(Object.assign({}, base, { otp: fresh }));
  assert.equal(okRes.status, 201);
  // پیامک شماره‌ی پیگیری فرستاده شد (با تاریخ شمسی و ساعت)
  const booked = [...sms.outbox].reverse().find((m) => m.phone === phone && m.kind === 'booked');
  assert.equal(booked.tokens.token, okRes.body.data.referenceNumber);
  assert.match(booked.tokens.token2, /^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/);
  assert.equal(booked.tokens.token3, '۱۷:۰۰');
  // همان کد دوباره قابل استفاده نیست
  assert.ok((await book(Object.assign({}, base, { time: '17:30', otp: fresh }))).body.errors.otp);
  // کد خام هرگز در دیتابیس ذخیره نمی‌شود
  await getOtp('09125550009');
  const stored = await M.PhoneOtp.findOne({ phone: '09125550009' }).lean();
  assert.ok(!JSON.stringify(stored).includes(sms.outbox[sms.outbox.length - 1].tokens.token));
});

test('کد تأیید: فاصله‌ی ۶۰ ثانیه برای ارسال دوباره و شماره‌ی نامعتبر', async () => {
  await M.PhoneOtp.deleteOne({ phone: '09125550002' });
  assert.equal((await request(app).post('/api/appointments/otp').send({ phone: '09125550002' })).status, 200);
  const again = await request(app).post('/api/appointments/otp').send({ phone: '09125550002' });
  assert.equal(again.status, 429);
  assert.ok(again.body.errors.retryAfter > 0);
  assert.equal((await request(app).post('/api/appointments/otp').send({ phone: '123' })).status, 422);
  assert.equal((await request(app).post('/api/appointments/otp').send({ phone: { $ne: '' } })).status, 422);
});

test('OTP serializes sending and booking and retains the hourly quota after use', async () => {
  const phone = '09125550016';
  const send = () => request(app).post('/api/appointments/otp').send({ phone });
  const sends = await Promise.all([send(), send(), send()]);
  assert.deepEqual(sends.map((r) => r.status).sort(), [200, 429, 429]);
  const code = sms.outbox.findLast((message) => message.phone === phone).tokens.token;
  const reservations = await Promise.all(['18:00', '18:30'].map((time) => book({ phone, time, otp: code })));
  assert.deepEqual(reservations.map((r) => r.status).sort(), [201, 422]);
  const entry = await M.PhoneOtp.findOne({ phone });
  assert.equal(entry.consumed, true);
  assert.equal(entry.sentCount, 1);
  await M.PhoneOtp.updateOne({ phone }, { $set: { sentCount: 5, lastSentAt: new Date(Date.now() - 61_000) } });
  assert.equal((await send()).status, 429);
});

test('production without verified SMS keeps public booking closed and redirects to the configured HTTPS site', async () => {
  const env = require('../src/config/env');
  const previous = { ...env };
  Object.assign(env, { isProd: true, forceHttps: true, trustProxy: 1, siteUrl: 'https://clinic.example', sms: { ...env.sms, driver: 'off' } });
  try {
    const production = request(createApp());
    const offline = await production.get('/api/availability?branch=fardis').set('X-Forwarded-Proto', 'https');
    assert.equal(offline.body.data.enabled, false);
    assert.deepEqual(offline.body.data.days, []);
    assert.equal((await production.post('/api/appointments').set('X-Forwarded-Proto', 'https').send(BASE)).status, 503);
    const redirect = await production.get('/track.html').set('Host', 'unrelated.example');
    assert.equal(redirect.headers.location, 'https://clinic.example/track.html');
  } finally {
    Object.assign(env, previous);
  }
});

test('پیامک تأیید و لغو توسط کلینیک، و پیامک ثبت تلفنی', async () => {
  const ref = (await book({ phone: '09125550003', time: '18:00' })).body.data.referenceNumber;
  const a = (await desk.get('/api/admin/appointments?q=' + ref)).body.data[0];
  const last = (kind) => [...sms.outbox].reverse().find((m) => m.phone === '09125550003' && m.kind === kind);
  await desk.put('/api/admin/appointments/' + a.id).send({ status: 'تأیید شده' });
  assert.deepEqual(last('status').tokens, { token: ref, token10: 'تأیید شد' });
  await desk.put('/api/admin/appointments/' + a.id).send({ status: 'لغو شده' });
  assert.deepEqual(last('status').tokens, { token: ref, token10: 'لغو شد' });
  const n = sms.outbox.length;
  await desk.put('/api/admin/appointments/' + a.id).send({ internalNote: 'فقط یادداشت' });
  assert.equal(sms.outbox.length, n); // تغییر بی‌ربط پیامک نمی‌فرستد
  const phoneBooking = await desk.post('/api/admin/appointments').send({ fullName: 'تلفنی تست', phone: '09125550004', branch: 'fardis', woundType: 'burn', date: DAY, time: '18:30' });
  assert.equal(phoneBooking.status, 201); // پذیرش کد تأیید لازم ندارد
  assert.equal([...sms.outbox].reverse().find((m) => m.phone === '09125550004').kind, 'booked');
});

test('یادآوری روز قبل: فقط یک بار، فقط در ساعت مجاز، فقط نوبت‌های فعال', async () => {
  const ref = (await book({ phone: '09125550005', time: '19:00' })).body.data.referenceNumber;
  // نوبت را «۸ ساعت پیش ثبت‌شده» می‌کنیم (نوبت تازه‌ثبت‌شده یادآوری نمی‌گیرد)
  const today = T.localDate();
  const at = (hhmm) => T.toUtc(today, hhmm);
  await M.Appointment.collection.updateOne({ referenceNumber: ref }, { $set: { createdAt: new Date(at('11:00').getTime() - 8 * 3600 * 1000) } });
  const mine = () => sms.outbox.filter((m) => m.phone === '09125550005' && m.kind === 'reminder').length;
  await reminders.run(at('08:00'));
  assert.equal(mine(), 0); // قبل از ساعت ۱۰ نه
  await reminders.run(at('11:00'));
  assert.equal(mine(), 1);
  await reminders.run(at('12:00'));
  assert.equal(mine(), 1); // تکراری نه
  const r = [...sms.outbox].reverse().find((m) => m.kind === 'reminder' && m.phone === '09125550005');
  assert.equal(r.tokens.token, ref);
});

test('پیام تماس', async () => {
  assert.equal((await request(app).post('/api/messages').send({ name: 'علی رضایی', phone: '09123456789', message: 'سلام' })).status, 201);
  assert.equal((await request(app).post('/api/messages').send({ name: 'x' })).status, 422);
});

// ================= پنل مدیریت: نقش‌ها =================
test('نقش‌ها: پذیرش فقط نوبت/بیمار/پیام، مدیر محتوا فقط محتوا', async () => {
  assert.equal((await request(app).get('/api/admin/dashboard')).status, 401);
  assert.equal((await desk.get('/api/admin/appointments')).status, 200);
  assert.equal((await desk.get('/api/admin/patients')).status, 200);
  assert.equal((await desk.get('/api/admin/messages')).status, 200);
  assert.equal((await desk.get('/api/admin/services')).status, 403);
  assert.equal((await desk.put('/api/admin/settings').send({ clinicName: 'x' })).status, 403);
  assert.equal((await editor.get('/api/admin/appointments')).status, 403);
  assert.equal((await editor.get('/api/admin/services')).status, 200);
  assert.equal((await desk.get('/api/admin/users')).status, 403);
  assert.equal((await desk.get('/api/admin/audit')).status, 403);
  assert.equal((await boss.get('/api/admin/audit')).status, 200);
  const id = (await desk.get('/api/admin/appointments')).body.data[0].id;
  assert.equal((await desk.delete('/api/admin/appointments/' + id)).status, 403); // حذف فقط مدیر ارشد
});

test('مدیریت نوبت: لیست با فیلتر روز، وضعیت، و فیلدهای غیرمجاز', async () => {
  const list = await desk.get('/api/admin/appointments?date=' + DAY + '&branch=fardis');
  assert.ok(list.body.data.length >= 5);
  assert.ok(list.body.data.every((a) => a.date === DAY));
  const item = (await desk.get('/api/admin/appointments?q=09123456789')).body.data[0];
  const r = await desk.put('/api/admin/appointments/' + item.id).send({ status: 'تأیید شده', internalNote: 'تماس گرفته شد', phone: '09999999999', fullName: 'هک' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'تأیید شده');
  assert.equal(r.body.data.phone, '09123456789');
  assert.equal(r.body.data.fullName, 'علی رضایی');
  assert.deepEqual(r.body.data.history.map((h) => h.action), ['created', 'status', 'note']);
  assert.equal((await desk.put('/api/admin/appointments/' + item.id).send({ status: 'نامعتبر' })).status, 422);
});

test('مدیریت نوبت: لغو و بازگشت ظرفیت را درست نگه می‌دارد، جابجایی شمارنده‌ها را منتقل می‌کند', async () => {
  const ref = (await book({ phone: '09124000001', time: '14:00' })).body.data.referenceNumber;
  const a = (await desk.get('/api/admin/appointments?q=' + ref)).body.data[0];
  assert.equal(await counter('14:00'), 1);
  await desk.put('/api/admin/appointments/' + a.id).send({ status: 'لغو شده' });
  assert.equal(await counter('14:00'), 0);
  await desk.put('/api/admin/appointments/' + a.id).send({ status: 'تأیید شده' });
  assert.equal(await counter('14:00'), 1);
  const mv = await desk.put('/api/admin/appointments/' + a.id).send({ time: '15:00' });
  assert.equal(mv.status, 200);
  assert.equal(mv.body.data.time, '15:00');
  assert.equal(await counter('14:00'), 0);
  assert.equal(await counter('15:00'), 1);
  assert.equal((await desk.put('/api/admin/appointments/' + a.id).send({ time: '10:30' })).status, 409); // پر است
  assert.equal(await counter('15:00'), 1);
  const team = await M.TeamMember.findOne();
  assert.equal((await desk.put('/api/admin/appointments/' + a.id).send({ assignedTo: String(team._id) })).body.data.assignedTo, String(team._id));
  assert.equal((await desk.put('/api/admin/appointments/' + a.id).send({ assignedTo: 'bad' })).status, 422);
  assert.equal((await boss.delete('/api/admin/appointments/' + a.id)).status, 200);
  assert.equal(await counter('15:00'), 0);
});

test('مدیریت نوبت: ثبت تلفنی توسط پذیرش (بدون رضایت آنلاین)، تقویم روز و بیماران', async () => {
  const c = await desk.post('/api/admin/appointments').send({ fullName: 'مریم نوری', phone: '09125000001', branch: 'fardis', woundType: 'burn', date: DAY, time: '16:00' });
  assert.equal(c.status, 201);
  assert.equal(c.body.data.source, 'phone');
  assert.equal(c.body.data.status, 'تأیید شده');
  assert.equal(c.body.data.history[0].byName, 'پذیرش');
  const cal = await desk.get('/api/admin/calendar?branch=fardis&date=' + DAY);
  assert.equal(cal.status, 200);
  assert.equal(cal.body.data.capacity, 2);
  assert.ok(cal.body.data.appointments.some((a) => a.time === '16:00'));
  assert.equal(cal.body.data.slots.find((s) => s.time === '16:00').left, 1);
  const pts = await desk.get('/api/admin/patients?q=مریم');
  assert.equal(pts.body.data.length, 1);
  const detail = await desk.get('/api/admin/patients/' + pts.body.data[0].id);
  assert.equal(detail.body.data.appointments.length, 1);
  assert.equal((await desk.put('/api/admin/patients/' + pts.body.data[0].id).send({ notes: 'دیابت نوع ۲' })).body.data.notes, 'دیابت نوع ۲');
  // گزارش فعالیت نباید نام بیمار یا فرستنده‌ی پیام را تکرار کند (فقط شناسه)
  const msg = await M.ContactMessage.create({ name: 'زهرا محمدی', phone: '09120001122', message: 'سلام' });
  await desk.put('/api/admin/messages/' + msg._id).send({ read: true });
  await new Promise((r) => setTimeout(r, 80));
  const logs = await M.AuditLog.find({ resource: { $in: ['patients', 'messages'] } });
  assert.ok(logs.length >= 2);
  assert.ok(logs.every((l) => !/مریم|نوری|زهرا|محمدی/.test(l.summary)));
  assert.ok(logs.every((l) => l.resourceId)); // ولی شناسه‌ی رکورد ثبت شده است
});

test('داشبورد: هفت روز آینده، وضعیت‌ها و امروز', async () => {
  const d = await boss.get('/api/admin/dashboard');
  assert.equal(d.status, 200);
  assert.equal(d.body.data.week.length, 7);
  assert.ok(d.body.data.week[1].count >= 5);
  assert.ok(d.body.data.patientsTotal >= 5);
  assert.equal(d.body.data.byStatus.length, M.Appointment.STATUSES.length);
  const e = (await editor.get('/api/admin/dashboard')).body.data;
  assert.equal(e.recent.length, 0); // مدیر محتوا نام بیماران را نمی‌بیند
  assert.ok(e.weekTotal >= 5);
});

// ================= محتوا =================
test('CRUD خدمات با اسلاگ خودکار و ثبت در گزارش فعالیت', async () => {
  const c = await editor.post('/api/admin/services').send({ title: 'لیزر کم‌توان', summary: 'خلاصه', isEvil: true });
  assert.equal(c.status, 201);
  const again = await editor.post('/api/admin/services').send({ title: 'لیزر کم‌توان' });
  assert.notEqual(again.body.data.slug, c.body.data.slug);
  const u = await editor.put('/api/admin/services/' + c.body.data.id).send({ summary: 'جدید', published: false });
  assert.equal(u.body.data.summary, 'جدید');
  assert.equal((await request(app).get('/api/services/' + c.body.data.slug)).status, 404);
  assert.equal((await editor.delete('/api/admin/services/' + c.body.data.id)).status, 200);
  await new Promise((r) => setTimeout(r, 50));
  const log = (await boss.get('/api/admin/audit?resource=services')).body.data;
  assert.deepEqual(log.slice(0, 2).map((l) => l.action), ['delete', 'update']);
  assert.match(log[0].userName, /editor@test.com/);
});

test('شعبه: ویرایش برنامه‌ی نوبت‌دهی با اعتبارسنجی', async () => {
  const b = (await editor.get('/api/admin/branches?q=فردیس')).body.data[0];
  const bad = await editor.put('/api/admin/branches/' + b.id).send({ booking: { ...b.booking, shifts: [{ day: 1, start: '14:00', end: '09:00' }] } });
  assert.equal(bad.status, 422);
  const ok = await editor.put('/api/admin/branches/' + b.id).send({ booking: { ...b.booking, capacity: 3 } });
  assert.equal(ok.body.data.booking.capacity, 3);
});

test('گالری بدون رضایت‌نامه منتشر نمی‌شود', async () => {
  assert.equal((await editor.post('/api/admin/gallery').send({ title: 'مورد ۱', category: 'burn', published: true, consent: false })).status, 422);
  assert.equal((await editor.post('/api/admin/gallery').send({ title: 'مورد ۱', category: 'burn', published: true, consent: true })).status, 201);
});

test('آمار و تنظیمات', async () => {
  const s = await editor.put('/api/admin/statistics').send({ patients: 120, wounds: null, years: '5' });
  assert.equal(s.body.data.patients, 120);
  assert.equal((await editor.put('/api/admin/statistics').send({ patients: -3 })).status, 422);
  const st = await editor.put('/api/admin/settings').send({ clinicName: 'درمیکس', evil: 'x' });
  assert.equal(st.body.data.clinicName, 'درمیکس');
});

test('نمایش ویدیوهای رضایت با تنظیمات مدیر محتوا کنترل می‌شود', async () => {
  const publicApi = request(app);
  await M.Testimonial.create([
    { title: 'ویدیوی تأییدشده', category: 'burn', published: true, consent: true, videoUrl: '/uploads/example.mp4' },
    { title: 'جایگاه بدون ویدیو', category: 'burn', published: true, isPlaceholder: true },
  ]);
  assert.equal((await publicApi.get('/api/testimonials')).status, 404);
  assert.equal((await editor.put('/api/admin/settings').send({ showTestimonials: true })).body.data.showTestimonials, true);
  assert.deepEqual((await publicApi.get('/api/testimonials')).body.data.map((item) => item.title), ['ویدیوی تأییدشده']);
  assert.equal((await editor.put('/api/admin/settings').send({ showTestimonials: false })).body.data.showTestimonials, false);
  assert.equal((await publicApi.get('/api/testimonials')).status, 404);
});

test('مدیران: سیاست رمز، نقش پذیرش، محافظ آخرین مدیر ارشد، باطل شدن نشست با غیرفعال‌سازی', async () => {
  assert.equal((await boss.post('/api/admin/users').send({ name: 'ضعیف', email: 'w@test.com', password: '12345678' })).status, 422);
  assert.equal((await boss.post('/api/admin/users').send({ name: 'بد', email: 'r@test.com', role: 'god', password: 'Another-Pass-1' })).status, 422);
  const c = await boss.post('/api/admin/users').send({ name: 'تازه', email: 'new@test.com', role: 'receptionist', password: 'Another-Pass-1' });
  assert.equal(c.status, 201);
  assert.equal(c.body.data.tokenVersion, undefined);
  const s = (await login('new@test.com', 'Another-Pass-1')).a;
  assert.equal((await s.get('/api/admin/appointments')).status, 200);
  await boss.put('/api/admin/users/' + c.body.data.id).send({ active: false });
  assert.equal((await s.get('/api/admin/appointments')).status, 401);
  const me = (await boss.get('/api/admin/users')).body.data.find((u) => u.email === 'boss@test.com');
  assert.equal((await boss.delete('/api/admin/users/' + me.id)).status, 400);
  assert.equal((await boss.put('/api/admin/users/' + me.id).send({ role: 'content_manager' })).status, 400);
});

test('آپلود: فقط تصویر/ویدیوی مجاز', async () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const ok = await editor.post('/api/admin/uploads').attach('file', png, { filename: 'a.png', contentType: 'image/png' });
  assert.equal(ok.status, 201);
  assert.match(ok.body.data.url, /^\/uploads\/[0-9a-f]{32}\.png$/);
  const url = ok.body.data.url;
  try {
    assert.equal((await request(app).get(url)).status, 404);
    assert.equal((await editor.get(url)).status, 200);
    assert.equal((await desk.get(url)).status, 403);
    const gallery = await editor.post('/api/admin/gallery').send({ title: 'آزمایش انتشار', category: 'burn', beforeImage: url, published: false });
    assert.equal(gallery.status, 201);
    const endpoint = '/api/admin/gallery/' + gallery.body.data.id;
    assert.equal((await editor.patch(endpoint).send({ published: true, isPlaceholder: true })).status, 422);
    assert.equal((await request(app).get(url)).status, 404);
    assert.equal((await editor.patch(endpoint).send({ published: true, consent: true })).status, 200);
    const publicFile = await request(app).get(url);
    assert.equal(publicFile.status, 200);
    assert.equal(publicFile.headers['cache-control'], 'no-store');
    assert.equal((await editor.patch(endpoint).send({ published: false, consent: false })).status, 200);
    assert.equal((await request(app).get(url)).status, 404);
  } finally {
    require('fs').unlinkSync(require('path').join(__dirname, '..', url));
  }
  assert.equal((await editor.post('/api/admin/uploads').attach('file', Buffer.from('<script>'), { filename: 'x.html', contentType: 'text/html' })).status, 415);
  assert.equal((await desk.post('/api/admin/uploads').attach('file', png, { filename: 'a.png', contentType: 'image/png' })).status, 403);
  // فایل HTML با برچسب جعلی image/png: باید رد شود و چیزی روی دیسک نماند
  const dir = require('path').join(__dirname, '..', 'uploads');
  const before = require('fs').readdirSync(dir).length;
  const fake = await editor.post('/api/admin/uploads').attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.png', contentType: 'image/png' });
  assert.equal(fake.status, 415);
  assert.equal(require('fs').readdirSync(dir).length, before);
});
