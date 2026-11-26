/* unit.test.js — تست بخش‌های بدون نیاز به دیتابیس (اجرا: npm test) */
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { jalaliToGregorian, parseJalali } = require('../src/utils/jalali');
const { normalizeDigits, slugify, escapeRegex } = require('../src/utils/text');
const T = require('../src/utils/time');
const { validateAppointment, validateMessage, validateLogin, validateLookup } = require('../src/validators/forms');
const { makeRef } = require('../src/controllers/publicController');
const { slotTimes, settingsOf } = require('../src/services/booking');
const { clean } = require('../src/middleware/sanitize');
const M = require('../src/models');

test('jalali: تبدیل تاریخ', () => {
  assert.deepEqual(jalaliToGregorian(1405, 8, 19), [2026, 11, 10]);
  assert.deepEqual(jalaliToGregorian(1404, 1, 1), [2025, 3, 21]);
  assert.equal(parseJalali('1405/13/01'), null);
  assert.ok(parseJalali('۱۴۰۵/۰۹/۲۰') instanceof Date);
});

test('text: ارقام، slug و regex', () => {
  assert.equal(normalizeDigits('۰۹۱۲٣'), '09123');
  assert.equal(slugify('  زخم بستر  '), 'زخم-بستر');
  assert.equal(escapeRegex('a.b(c)'), 'a\\.b\\(c\\)');
});

test('time: وقت تهران (+۰۳:۳۰) و ابزار تاریخ', () => {
  assert.equal(T.toUtc('2026-11-12', '10:00').toISOString(), '2026-11-12T06:30:00.000Z');
  assert.equal(T.localDate(new Date('2026-11-12T21:00:00Z')), '2026-11-13'); // ساعت ۰۰:۳۰ بامداد تهران
  assert.equal(T.localTime(new Date('2026-11-12T06:30:00Z')), '10:00');
  assert.equal(T.weekday('2026-11-14'), 6); // شنبه
  assert.equal(T.addDays('2026-12-31', 1), '2027-01-01');
  assert.ok(T.isValidDate('2028-02-29'));
  assert.ok(!T.isValidDate('2027-02-29'));
  assert.ok(!T.isValidDate('2026-1-1'));
});

test('booking: ساخت بازه‌ها از شیفت‌ها، تعطیلی و غیرفعال بودن', () => {
  const s = settingsOf({ booking: { slotMinutes: 45, shifts: [{ day: 6, start: '09:00', end: '11:00' }, { day: 6, start: '16:00', end: '17:30' }], closedDates: ['2026-11-21'] } });
  assert.deepEqual(slotTimes(s, '2026-11-14'), ['09:00', '09:45', '16:00', '16:45']); // ۱۰:۳۰+۴۵ از ۱۱ رد می‌شود
  assert.deepEqual(slotTimes(s, '2026-11-15'), []); // یکشنبه شیفت ندارد
  assert.deepEqual(slotTimes(s, '2026-11-21'), []); // تعطیل
  assert.deepEqual(slotTimes(Object.assign({}, s, { enabled: false }), '2026-11-14'), []);
});

test('validateAppointment: ورودی درست و غلط', () => {
  const good = { fullName: 'علی رضایی', phone: '۰۹۱۲۳۴۵۶۷۸۹', branch: 'fardis', woundType: 'pressure', date: '2026-11-14', time: '۱۰:۰۰', consent: true };
  const r = validateAppointment(good);
  assert.deepEqual(r.errors, {});
  assert.equal(r.data.phone, '09123456789');
  assert.equal(r.data.time, '10:00');
  const bad = validateAppointment({ fullName: 'a', phone: '1', woundType: 'x', visitType: 'home', date: '2026-02-30', time: '25:00' });
  ['fullName', 'phone', 'branch', 'woundType', 'address', 'date', 'time', 'consent'].forEach((k) => assert.ok(bad.errors[k], k));
  assert.equal(validateAppointment(Object.assign({}, good, { consent: false }), { staff: true }).errors.consent, undefined);
});

test('validateAppointment: فیلدهای اضافه و آبجکت‌ها نادیده گرفته می‌شوند', () => {
  const r = validateAppointment({ fullName: { $gt: '' }, phone: ['0912'], branch: 'b', woundType: 'burn', status: 'تأیید شده', role: 'admin', internalNote: 'x' });
  assert.equal(r.data.fullName, '');
  assert.equal(r.data.status, undefined);
  assert.equal(r.data.internalNote, undefined);
});

test('validateLookup، validateMessage و validateLogin', () => {
  assert.deepEqual(validateLookup({ referenceNumber: 'dmx-261112-ab2c', phone: '09123456789' }).errors, {});
  assert.deepEqual(validateLookup({ referenceNumber: 'ALT-261112-AB2C', phone: '09123456789' }).errors, {}); // شماره‌های قدیمی هنوز معتبرند
  assert.ok(validateLookup({ referenceNumber: 'x', phone: '1' }).errors.referenceNumber);
  assert.ok(validateMessage({ name: 'ab', phone: '1', message: '' }).errors.message);
  assert.deepEqual(validateLogin({ email: 'A@B.com', password: '12345678' }).errors, {});
  assert.ok(validateLogin({ email: 'a@b.com', password: { $ne: 1 } }).errors.password);
});

test('sanitize: حذف عملگرهای Mongo و prototype pollution', () => {
  const out = clean(JSON.parse('{"a":{"$gt":1,"ok":2},"b.c":1,"__proto__":{"x":1},"list":[{"$where":"1"}],"constructor":1}'));
  assert.deepEqual(out, { a: { ok: 2 }, list: [{}] });
  assert.equal({}.x, undefined);
});

test('TRUST_PROXY: فقط مقدار صریح و امن پذیرفته می‌شود', () => {
  const { parseTrustProxy } = require('../src/config/env');
  assert.equal(parseTrustProxy(undefined), undefined);
  assert.equal(parseTrustProxy(''), undefined);
  assert.equal(parseTrustProxy('0'), false);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy(' 2 '), 2);
  assert.equal(parseTrustProxy('loopback, 10.0.0.0/8'), 'loopback, 10.0.0.0/8');
  assert.throws(() => parseTrustProxy('true'), /ناامن/); // «به همه اعتماد کن» پذیرفته نمی‌شود
});

test('makeRef: قالب شماره‌ی پیگیری', () => {
  assert.match(makeRef(), /^DMX-\d{6}-[A-Z2-9]{10}$/);
  assert.notEqual(makeRef(), makeRef());
});

test('مدل‌ها و اعتبارسنجی', async () => {
  assert.equal(Object.keys(M).length, 19);
  await assert.rejects(new M.GalleryCase({ title: 't', category: 'burn', published: true, consent: false }).validate(), /رضایت/);
  await assert.rejects(new M.Service({ title: 'x', slug: 'bad slug!' }).validate());
  await assert.rejects(new M.Appointment({ referenceNumber: 'r', fullName: 'علی رضایی', phone: '123', branch: 'b', woundType: 'w' }).validate());
  await assert.rejects(new M.Branch({ name: 'x', slug: 'x', booking: { shifts: [{ day: 1, start: '12:00', end: '10:00' }] } }).validate(), /بعد از ساعت شروع/);
  const br = new M.Branch({ name: 'x', slug: 'x' });
  assert.equal(br.booking.shifts.length, 11); // برنامه‌ی پیش‌فرض
  assert.equal(M.User.passwordProblem('abc'), 'رمز عبور باید حداقل ۱۰ نویسه باشد.');
  assert.equal(M.User.passwordProblem('Strong-Pass-9'), '');
  const u = new M.User({ name: 'علی', email: 'A@B.com', passwordHash: 'secret-hash' });
  assert.equal(u.email, 'a@b.com');
  const j = u.toJSON();
  assert.equal(j.passwordHash, undefined);
  assert.equal(j.tokenVersion, undefined);
  assert.ok(j.id);
});
