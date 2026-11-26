/* ==========================================================
   schedule.js — تاریخ و ساعت نوبت‌ها (هم‌سان با server/src/utils/time.js و services/booking.js)
   تاریخ‌ها در API به شکل 'YYYY-MM-DD' (میلادی، به وقت کلینیک) و ساعت 'HH:MM' هستند؛
   این فایل آن‌ها را به شمسی و ارقام فارسی نمایش می‌دهد.
   ========================================================== */
(function () {
  'use strict';
  window.Clinic = window.Clinic || {};
  const TZ = 'Asia/Tehran';
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // ---------- وقت کلینیک ----------
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = (d) => fmt.formatToParts(d).reduce((o, p) => { o[p.type] = p.value; return o; }, {});
  const localDate = (d) => { const p = parts(d || new Date()); return p.year + '-' + p.month + '-' + p.day; };
  const offsetAt = (d) => { const p = parts(d); return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(d.getTime() / 60000) * 60000) / 60000); };
  const toUtc = (date, time) => {
    const [y, m, d] = date.split('-').map(Number); const [h, mi] = time.split(':').map(Number);
    const guess = Date.UTC(y, m - 1, d, h, mi);
    let ts = guess - offsetAt(new Date(guess)) * 60000;
    ts = guess - offsetAt(new Date(ts)) * 60000;
    return new Date(ts);
  };
  const utcDate = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const weekday = (date) => utcDate(date).getUTCDay();
  const addDays = (date, n) => { const d = utcDate(date); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fromMinutes = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');

  // ---------- نمایش شمسی ----------
  const fa = (opts) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', Object.assign({ timeZone: 'UTC' }, opts));
  const F = { wd: fa({ weekday: 'long' }), d: fa({ day: 'numeric' }), m: fa({ month: 'long' }), full: fa({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), short: fa({ day: 'numeric', month: 'long' }) };
  const dayParts = (date) => { const d = utcDate(date); return { weekday: F.wd.format(d), day: F.d.format(d), month: F.m.format(d) }; };
  // ترتیب را خودمان می‌سازیم (خروجی Intl در مرورگرهای مختلف ترتیب یکسانی ندارد): «پنجشنبه ۲۱ آبان ۱۴۰۵»
  const F_Y = fa({ year: 'numeric' });
  const faFull = (date) => { if (!DATE_RE.test(date || '')) return '—'; const d = utcDate(date); return F.wd.format(d) + ' ' + F.d.format(d) + ' ' + F.m.format(d) + ' ' + F_Y.format(d); };
  const faShort = (date) => { if (!DATE_RE.test(date || '')) return '—'; const d = utcDate(date); return F.d.format(d) + ' ' + F.m.format(d); };
  const faTime = (t) => (TIME_RE.test(t || '') ? t.replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[x]) : '');
  const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']; // اندیس = getUTCDay
  const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]; // شنبه تا جمعه
  const period = (t) => { const m = toMinutes(t); return m < 720 ? 'صبح' : m < 960 ? 'ظهر' : 'عصر'; };

  // ---------- برنامه‌ی کاری شعبه ----------
  const DEFAULT_SHIFTS = () => [6, 0, 1, 2, 3].flatMap((day) => [{ day, start: '09:00', end: '13:00' }, { day, start: '16:00', end: '20:00' }]).concat([{ day: 4, start: '09:00', end: '13:00' }]);
  const settingsOf = (branch) => {
    const b = (branch && branch.booking) || {};
    return { enabled: b.enabled !== false, slotMinutes: b.slotMinutes || 30, capacity: b.capacity || 1, leadMinutes: b.leadMinutes == null ? 120 : b.leadMinutes, horizonDays: b.horizonDays || 30, shifts: b.shifts || DEFAULT_SHIFTS(), closedDates: b.closedDates || [] };
  };
  const workingHours = (branch) => {
    const groups = new Map();
    for (const day of WEEK_ORDER) {
      const ranges = settingsOf(branch).shifts.filter((shift) => shift.day === day)
        .sort((a, b) => a.start.localeCompare(b.start))
        .map(({ start, end }) => faTime(start) + ' تا ' + faTime(end)).join(' و ');
      if (ranges) groups.set(ranges, [...(groups.get(ranges) || []), WEEKDAYS[day]]);
    }
    return Array.from(groups, ([ranges, days]) => days.join('، ') + ' · ' + ranges).join(' | ');
  };
  const slotTimes = (s, date) => {
    if (!s.enabled || s.closedDates.includes(date)) return [];
    const wd = weekday(date); const set = new Set();
    s.shifts.filter((sh) => sh.day === wd).forEach((sh) => { for (let m = toMinutes(sh.start); m + s.slotMinutes <= toMinutes(sh.end); m += s.slotMinutes) set.add(fromMinutes(m)); });
    return Array.from(set).sort();
  };

  Clinic.schedule = { TZ, TIME_RE, DATE_RE, localDate, toUtc, weekday, addDays, toMinutes, fromMinutes, dayParts, faFull, faShort, faTime, WEEKDAYS, WEEK_ORDER, period, DEFAULT_SHIFTS, settingsOf, workingHours, slotTimes };
})();
