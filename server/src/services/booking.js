/* booking.js — منطق نوبت‌دهی: ساخت بازه‌های زمانی، بررسی ظرفیت، رزرو و آزادسازی */
const M = require('../models');
const AppError = require('../utils/appError');
const T = require('../utils/time');

const settingsOf = (branch) => {
  const b = (branch && branch.booking) || {};
  return {
    enabled: b.enabled !== false, slotMinutes: b.slotMinutes || 30, capacity: b.capacity || 1,
    leadMinutes: b.leadMinutes == null ? 120 : b.leadMinutes, horizonDays: b.horizonDays || 30,
    shifts: b.shifts || [], closedDates: b.closedDates || [],
  };
};

// بازه‌های یک روز طبق شیفت‌ها (بدون در نظر گرفتن رزروها)
const slotTimes = (s, date) => {
  if (!s.enabled || s.closedDates.includes(date)) return [];
  const wd = T.weekday(date);
  const times = new Set();
  s.shifts.filter((sh) => sh.day === wd).forEach((sh) => {
    for (let m = T.toMinutes(sh.start); m + s.slotMinutes <= T.toMinutes(sh.end); m += s.slotMinutes) times.add(T.fromMinutes(m));
  });
  return [...times].sort();
};

/* دسترسی‌پذیری چند روز:
   [{ date, weekday, closed, slots: [{ time, left, available }] }]
   opts.ignoreLead: برای پنل مدیریت (نمایش همه‌ی بازه‌ها، حتی گذشته) */
const availability = async (branch, from, days, opts = {}) => {
  const s = settingsOf(branch);
  const today = T.localDate();
  const start = from && T.isValidDate(from) && from > today ? from : today;
  const lastAllowed = T.addDays(today, s.horizonDays);
  const n = Math.max(1, Math.min(opts.ignoreLead ? 62 : 31, Number(days) || 14));
  const dates = [];
  for (let i = 0; i < n; i += 1) { const d = T.addDays(start, i); if (opts.ignoreLead || d <= lastAllowed) dates.push(d); }
  if (!dates.length) return [];
  const counters = await M.SlotCounter.find({ branch: branch.slug, date: { $gte: dates[0], $lte: dates[dates.length - 1] } });
  const taken = new Map(counters.map((c) => [c.date + ' ' + c.time, c.count]));
  const minStart = Date.now() + (opts.ignoreLead ? -Infinity : s.leadMinutes * 60000);
  return dates.map((date) => {
    const slots = slotTimes(s, date).map((time) => {
      const left = Math.max(0, s.capacity - (taken.get(date + ' ' + time) || 0));
      return { time, left, available: left > 0 && T.toUtc(date, time).getTime() >= minStart };
    });
    return { date, weekday: T.weekday(date), closed: slots.length === 0, slots };
  });
};

// اطمینان از این‌که بازه در برنامه‌ی شعبه وجود دارد و (برای رزرو آنلاین) هنوز قابل رزرو است
const assertBookable = (branch, date, time, { online }) => {
  const s = settingsOf(branch);
  if (!T.isValidDate(date)) throw new AppError(422, 'لطفاً خطاهای فرم را اصلاح کنید.', { date: 'روز نوبت را انتخاب کنید.' });
  if (!T.TIME_RE.test(time || '')) throw new AppError(422, 'لطفاً خطاهای فرم را اصلاح کنید.', { time: 'ساعت نوبت را انتخاب کنید.' });
  if (!s.enabled) throw new AppError(422, 'نوبت‌دهی این شعبه فعلاً غیرفعال است.', { branch: 'نوبت‌دهی این شعبه غیرفعال است.' });
  if (!slotTimes(s, date).includes(time)) throw new AppError(422, 'این ساعت در برنامه‌ی کاری شعبه نیست.', { time: 'این ساعت در برنامه‌ی کاری شعبه نیست.' });
  const startAt = T.toUtc(date, time);
  if (online) {
    if (startAt.getTime() < Date.now() + s.leadMinutes * 60000) throw new AppError(422, 'زمان این نوبت گذشته یا خیلی نزدیک است.', { time: 'این ساعت دیگر قابل رزرو نیست؛ ساعت دیگری انتخاب کنید.' });
    if (date > T.addDays(T.localDate(), s.horizonDays)) throw new AppError(422, 'این تاریخ هنوز برای رزرو باز نشده است.', { date: 'این تاریخ هنوز برای رزرو باز نشده است.' });
  }
  return { startAt, durationMin: s.slotMinutes, capacity: s.capacity };
};

// رزرو اتمیک یک جای خالی؛ اگر ظرفیت پر باشد 409 می‌دهد
const reserve = async (branchSlug, date, time, capacity) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await M.SlotCounter.findOneAndUpdate(
        { branch: branchSlug, date, time, count: { $lt: capacity } },
        { $inc: { count: 1 } },
        { upsert: true, returnDocument: 'after' },
      );
      return;
    } catch (e) {
      // 11000: یا ظرفیت پر است (سند هست ولی شرط برقرار نیست) یا دو درج هم‌زمان؛ یک‌بار دیگر تلاش می‌کنیم
      if (e.code !== 11000) throw e;
    }
  }
  throw new AppError(409, 'متأسفانه این ساعت همین حالا پر شد. لطفاً ساعت دیگری انتخاب کنید.', { time: 'این ساعت پر شده است.' });
};

const release = (branchSlug, date, time) => {
  if (!branchSlug || !date || !time) return Promise.resolve();
  return M.SlotCounter.updateOne({ branch: branchSlug, date, time, count: { $gt: 0 } }, { $inc: { count: -1 } });
};

module.exports = { settingsOf, slotTimes, availability, assertBookable, reserve, release };
