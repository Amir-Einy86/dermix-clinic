/* env.js — خواندن تنظیمات از متغیرهای محیطی (فایل .env) */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const isProd = process.env.NODE_ENV === 'production';
const need = (name, fallback) => {
  const v = process.env[name];
  if (v) return v;
  if (fallback !== undefined && !isProd) return fallback;
  throw new Error('متغیر محیطی ' + name + ' تنظیم نشده است (فایل .env را ببینید).');
};

/* TRUST_PROXY — چند پراکسی قابل‌اعتماد جلوی برنامه است؟ (برای تشخیص IP واقعی بازدیدکننده در rate limit)
     0 یا false → برنامه مستقیم به اینترنت وصل است؛ هدر X-Forwarded-For نادیده گرفته می‌شود
     1          → دقیقاً یک پراکسی جلوی برنامه است (Nginx، لیارا، Render و …)
     فهرست آدرس/شبکه (مثل loopback یا 10.0.0.0/8) هم پذیرفته می‌شود
   مقدار اشتباه یعنی یا مهاجم با هدر جعلی محدودیت‌ها را دور می‌زند، یا همه‌ی کاربران یک IP دیده می‌شوند. */
const parseTrustProxy = (raw) => {
  const v = String(raw == null ? '' : raw).trim().toLowerCase();
  if (v === '') return undefined;
  if (v === '0' || v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  if (v === 'true') throw new Error('TRUST_PROXY=true ناامن است (به هر هدر جعلی اعتماد می‌کند)؛ تعداد پراکسی‌ها را بنویسید، مثلاً 1.');
  return v;
};

module.exports = {
  isProd,
  parseTrustProxy,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // نمایش جزئیات فنی خطا (stack) در پاسخ: فقط در توسعه و فقط با درخواست صریح؛ در production همیشه خاموش
  debugErrors: !isProd && process.env.DEBUG_ERRORS === 'true',
  port: Number(process.env.PORT) || 5000,
  host: process.env.BIND_HOST || undefined,
  mongoUri: need('MONGODB_URI', 'mongodb://127.0.0.1:27017/clinic'),
  // در حالت توسعه یک مقدار موقت داریم؛ در production حتماً باید در .env باشد و حداقل ۳۲ نویسه
  jwtSecret: need('JWT_SECRET', 'dev-only-secret-change-me-dev-only-secret'),
  jwtExpires: process.env.JWT_EXPIRES || '8h',
  cookieName: 'clinic_token',
  clientDir: path.resolve(__dirname, '../../', process.env.CLIENT_DIR || '../client'),
  serveClient: process.env.SERVE_CLIENT !== 'false',
  // محل ذخیره‌ی فایل‌های آپلودی؛ روی هاست‌هایی که دیسک برنامه با هر انتشار پاک می‌شود، یک دیسک دائمی بدهید
  uploadDir: path.resolve(__dirname, '../../', process.env.UPLOAD_DIR || 'uploads'),
  // آدرس اصلی سایت (مثل https://dermix.ir) — برای sitemap.xml، robots.txt و ریدایرکت به https
  siteUrl: (() => {
    const v = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
    if (!v) return '';
    let u; try { u = new URL(v); } catch (e) { throw new Error('SITE_URL معتبر نیست؛ مثال: https://dermix.ir'); }
    if (!/^https?:$/.test(u.protocol)) throw new Error('SITE_URL باید با http:// یا https:// شروع شود.');
    return u.origin;
  })(),
  // در production همیشه HTTPS اجباری است. FORCE_HTTPS برای محیط توسعه است.
  forceHttps: isProd || process.env.FORCE_HTTPS === 'true',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 8,
  corsOrigin: process.env.CORS_ORIGIN || '',
  // پیامک (services/sms.js): log = فقط لاگ (توسعه)، kavenegar = ارسال واقعی
  sms: {
    driver: (process.env.SMS_DRIVER || (isProd ? 'off' : 'log')).trim().toLowerCase(),
    apiKey: process.env.SMS_API_KEY || '',
    templates: {
      otp: process.env.SMS_TEMPLATE_OTP || '',
      booked: process.env.SMS_TEMPLATE_BOOKED || '',
      status: process.env.SMS_TEMPLATE_STATUS || '',
      reminder: process.env.SMS_TEMPLATE_REMINDER || '',
    },
    otpRequired: process.env.SMS_OTP_REQUIRED !== 'false',
    reminderHour: Math.min(20, Math.max(6, Number(process.env.SMS_REMINDER_HOUR) || 10)),
  },
};
if (isProd && module.exports.jwtSecret.length < 32) throw new Error('JWT_SECRET باید حداقل ۳۲ نویسه باشد.');
if (isProd && !module.exports.siteUrl.startsWith('https://')) throw new Error('در production، SITE_URL باید آدرس HTTPS دامنه باشد.');
if (!['log', 'kavenegar', 'off'].includes(module.exports.sms.driver)) throw new Error('SMS_DRIVER نامعتبر است (log، kavenegar یا off).');
if (isProd && module.exports.sms.driver === 'log') throw new Error('در production، SMS_DRIVER باید off یا kavenegar باشد.');
if (module.exports.sms.driver === 'kavenegar' && !module.exports.sms.apiKey) throw new Error('SMS_DRIVER=kavenegar است ولی SMS_API_KEY تنظیم نشده است.');
if (isProd && module.exports.sms.driver === 'kavenegar' && module.exports.sms.otpRequired && !module.exports.sms.templates.otp) {
  throw new Error('قالب SMS_TEMPLATE_OTP برای تأیید موبایل تنظیم نشده است.');
}
// در production باید آگاهانه انتخاب شود (حدس زدن در هر دو جهت خطرناک است)
if (isProd && module.exports.trustProxy === undefined) throw new Error('TRUST_PROXY تنظیم نشده است: اگر برنامه پشت Nginx یا هاست ابری است 1 بگذارید؛ اگر مستقیم به اینترنت وصل است 0.');
