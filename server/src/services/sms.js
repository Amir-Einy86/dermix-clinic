/* sms.js — ارسال پیامک (کد تأیید، ثبت نوبت، تأیید/لغو، یادآوری)
   SMS_DRIVER در .env:
     log        → پیامک فرستاده نمی‌شود؛ فقط در لاگ سرور نوشته می‌شود (برای توسعه و تست)
     kavenegar  → ارسال واقعی با سرویس «کاوه‌نگار» و قالب‌های تأییدشده (verify/lookup)
   برای سرویس دیگر (SMS.ir، ملی پیامک و …) فقط یک تابع مثل kavenegar در DRIVERS اضافه کنید.

   همه‌ی پیامک‌ها با «قالب» فرستاده می‌شوند (الزام اپراتورهای ایران برای پیامک خدماتی).
   متغیرهای قالب‌ها (در پنل کاوه‌نگار): token، token2، token3 بدون فاصله‌اند؛ token10 تا ۵ فاصله مجاز است. */
const env = require('../config/env');

const TEMPLATES = {
  otp: env.sms.templates.otp,           // %token% = کد تأیید
  booked: env.sms.templates.booked,     // %token% = شماره پیگیری، %token2% = تاریخ، %token3% = ساعت، %token10% = شعبه
  status: env.sms.templates.status,     // %token% = شماره پیگیری، %token10% = وضعیت (مثلاً «تأیید شد» / «لغو شد»)
  reminder: env.sms.templates.reminder, // %token% = شماره پیگیری، %token2% = تاریخ، %token3% = ساعت، %token10% = شعبه
};

// شماره را در لاگ کامل نمی‌نویسیم (اطلاعات شخصی بیمار)
const mask = (phone) => String(phone).replace(/^(\d{4})\d{4}(\d{3})$/, '$1****$2');

// در تست‌ها پیامک‌های «فرستاده‌شده» اینجا جمع می‌شوند تا بررسی شوند
const outbox = [];

const DRIVERS = {
  log: async (phone, kind, tokens) => {
    outbox.push({ phone, kind, tokens, at: new Date() });
    if (outbox.length > 200) outbox.shift();
    if (process.env.NODE_ENV !== 'test') console.log('📱 [پیامک آزمایشی] ' + kind + ' → ' + mask(phone) + ' ' + JSON.stringify(tokens));
  },
  kavenegar: async (phone, kind, tokens) => {
    const template = TEMPLATES[kind];
    if (!template) throw new Error('قالب پیامک «' + kind + '» در .env تنظیم نشده است');
    const qs = new URLSearchParams({ receptor: phone, template });
    Object.entries(tokens).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, String(v)); });
    const url = 'https://api.kavenegar.com/v1/' + encodeURIComponent(env.sms.apiKey) + '/verify/lookup.json';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(url, { method: 'POST', body: qs, signal: ctrl.signal });
      const j = await r.json().catch(() => ({}));
      const status = j && j.return && j.return.status;
      if (status !== 200) throw new Error('کاوه‌نگار خطا داد (HTTP ' + r.status + ').');
    } finally { clearTimeout(timer); }
  },
};

const enabled = () => !!DRIVERS[env.sms.driver];

/* ارسال پیامک. برای کد تأیید منتظر نتیجه می‌مانیم (اگر نرسد، کاربر باید بداند)؛
   برای اطلاع‌رسانی‌ها از notify استفاده کنید که شکستش هرگز جلوی ثبت نوبت را نمی‌گیرد. */
const send = async (phone, kind, tokens) => {
  const driver = DRIVERS[env.sms.driver];
  if (!driver) return false;
  await driver(phone, kind, tokens);
  return true;
};
const notify = (phone, kind, tokens) => send(phone, kind, tokens).catch((e) => {
  if (process.env.NODE_ENV !== 'test') console.error('✖ ارسال پیامک ' + kind + ' به ' + mask(phone) + ' ناموفق بود: ' + e.message);
  return false;
});

// متن کوتاه بدون فاصله برای متغیرهای قالب (token تا token3 در کاوه‌نگار فاصله نمی‌پذیرند)
const FA = '۰۱۲۳۴۵۶۷۸۹';
const faDigits = (s) => String(s).replace(/\d/g, (d) => FA[d]);
const jalali = (date) => {
  const p = new Intl.DateTimeFormat('en-US-u-ca-persian', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(date + 'T00:00:00Z')).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
  return faDigits(p.year + '/' + p.month + '/' + p.day);
};
const branchLabel = (a) => String(a.branchName || a.branch || '').split(/\s+/).slice(0, 5).join(' ');
const apptTokens = (a) => ({ token: a.referenceNumber, token2: a.date ? jalali(a.date) : '-', token3: a.time ? faDigits(a.time) : '-', token10: branchLabel(a) });

module.exports = { send, notify, enabled, outbox, mask, apptTokens, jalali };
