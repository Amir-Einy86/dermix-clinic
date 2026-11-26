/* reminders.js — پیامک یادآوری یک روز قبل از نوبت
   هر ۱۰ دقیقه اجرا می‌شود. از ساعت REMINDER_HOUR (پیش‌فرض ۱۰ صبح به وقت تهران) تا ۲۱،
   برای نوبت‌های «جدید» و «تأیید شده»ی فردا یک پیامک می‌فرستد.
   - هر نوبت فقط یک بار (فیلد reminderSentAt با به‌روزرسانی اتمیک «ادعا» می‌شود؛ حتی با چند نسخه‌ی برنامه تکراری نمی‌شود)
   - نوبت‌هایی که کمتر از ۶ ساعت پیش ثبت شده‌اند یادآوری نمی‌گیرند (همین الان پیامک ثبت گرفته‌اند) */
const M = require('../models');
const T = require('../utils/time');
const env = require('../config/env');
const sms = require('./sms');

const run = async (now = new Date()) => {
  if (!sms.enabled()) return 0;
  const hour = Number(T.localTime(now).slice(0, 2));
  if (hour < env.sms.reminderHour || hour >= 21) return 0;
  const tomorrow = T.addDays(T.localDate(now), 1);
  const candidates = await M.Appointment.find({
    date: tomorrow, status: { $in: ['جدید', 'تأیید شده'] }, reminderSentAt: null,
    createdAt: { $lt: new Date(now.getTime() - 6 * 3600 * 1000) },
  }).select('_id').limit(500);
  let sent = 0;
  for (const c of candidates) {
    const a = await M.Appointment.findOneAndUpdate({ _id: c._id, reminderSentAt: null }, { $set: { reminderSentAt: now } }, { returnDocument: 'after' });
    if (!a) continue; // نسخه‌ی دیگری از برنامه زودتر برداشت
    if (await sms.notify(a.phone, 'reminder', sms.apptTokens(a))) sent += 1;
  }
  return sent;
};

let timer = null;
const start = () => {
  if (timer || !sms.enabled() || process.env.NODE_ENV === 'test') return;
  const tick = () => run().catch((e) => console.error('✖ یادآوری نوبت‌ها ناموفق بود:', e.message));
  timer = setInterval(tick, 10 * 60 * 1000);
  timer.unref();
  setTimeout(tick, 30 * 1000).unref();
};
const stop = () => { if (timer) clearInterval(timer); timer = null; };

module.exports = { run, start, stop };
