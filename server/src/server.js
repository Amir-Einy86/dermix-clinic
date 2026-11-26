/* server.js — نقطه‌ی شروع: اتصال به دیتابیس و اجرای سرور */
const env = require('./config/env');
const connectDb = require('./config/db');
const createApp = require('./app');
const reminders = require('./services/reminders');
const models = require('./models');

(async () => {
  try {
    if (!env.isProd) console.warn('⚠ NODE_ENV=production نیست: این حالت فقط برای توسعه روی سیستم خودتان است (کوکی ورود بدون Secure فرستاده می‌شود). برای انتشار NODE_ENV=production بگذارید.');
    await connectDb();
    await Promise.all(Object.values(models).map((model) => model.init()));
    console.log('✔ به MongoDB وصل شد');
    const server = createApp().listen(env.port, env.host, () => console.log('✔ سرور روی پورت ' + env.port + ' اجرا شد' + (env.siteUrl ? ' — ' + env.siteUrl : '')));
    reminders.start(); // پیامک یادآوری روز قبل از نوبت (اگر سرویس پیامک فعال باشد)
    if (env.sms.driver === 'log') console.warn('⚠ SMS_DRIVER=log: پیامک‌ها فقط در لاگ توسعه نوشته می‌شوند.');
    if (env.isProd && (env.sms.driver === 'off' || !env.sms.otpRequired)) console.warn('⚠ رزرو آنلاین تا فعال شدن تأیید پیامکی غیرفعال است. ثبت نوبت توسط پذیرش فعال است.');
    const stop = () => { reminders.stop(); server.close(() => process.exit(0)); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  } catch (err) {
    console.error('✖ اجرای سرور ناموفق بود:', err.message);
    process.exit(1);
  }
})();
