/* time.js — تاریخ و ساعت به وقت کلینیک (پیش‌فرض Asia/Tehran)
   همه‌ی نوبت‌ها با دو شکل ذخیره می‌شوند:
     date: 'YYYY-MM-DD' (تاریخ میلادی محلی)  و  time: 'HH:MM'  ← برای نمایش و گروه‌بندی
     startAt: Date (UTC)                                      ← برای مرتب‌سازی و مقایسه با «الان»
   تبدیل محلی ↔ UTC با Intl انجام می‌شود تا به منطقه‌ی زمانی سرور وابسته نباشد. */
const TZ = process.env.CLINIC_TZ || 'Asia/Tehran';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const parts = (d) => fmt.formatToParts(d).reduce((o, p) => { o[p.type] = p.value; return o; }, {});

// تاریخ محلی کلینیک برای یک لحظه
const localDate = (d = new Date()) => { const p = parts(d); return p.year + '-' + p.month + '-' + p.day; };
const localTime = (d = new Date()) => { const p = parts(d); return p.hour + ':' + p.minute; };

// اختلاف منطقه‌ی زمانی با UTC (دقیقه) در یک لحظه‌ی مشخص
const offsetAt = (d) => {
  const p = parts(d);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000);
};

// 'YYYY-MM-DD' + 'HH:MM' به وقت کلینیک → Date (UTC)
const toUtc = (date, time) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ts = guess - offsetAt(new Date(guess)) * 60000;
  ts = guess - offsetAt(new Date(ts)) * 60000; // اصلاح دوباره برای مرز تغییر ساعت
  return new Date(ts);
};

const isValidDate = (s) => {
  if (!DATE_RE.test(String(s))) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
// روز هفته‌ی تقویمی (۰ = یکشنبه … ۶ = شنبه) — مستقل از منطقه‌ی زمانی
const weekday = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const addDays = (date, n) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMinutes = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');

module.exports = { TZ, DATE_RE, TIME_RE, localDate, localTime, toUtc, isValidDate, weekday, addDays, toMinutes, fromMinutes };
