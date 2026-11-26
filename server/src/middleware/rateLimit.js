/* rateLimit.js — محدودیت تعداد درخواست (ضد حدس رمز و ضد اسپم) */
const rateLimit = require('express-rate-limit');
const skip = () => process.env.NODE_ENV === 'test';
const make = (windowMin, limit, message) => rateLimit({
  windowMs: windowMin * 60 * 1000, limit, skip, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ success: false, message }),
});
exports.loginLimiter = make(15, 10, 'تعداد تلاش‌های ورود زیاد بود. ۱۵ دقیقه‌ی دیگر دوباره تلاش کنید.');
exports.formLimiter = make(60, 15, 'تعداد درخواست‌های شما زیاد بود. کمی بعد دوباره تلاش کنید.');
exports.lookupLimiter = make(15, 20, 'تعداد تلاش‌های پیگیری زیاد بود. کمی بعد دوباره تلاش کنید.');
exports.otpLimiter = make(15, 8, 'تعداد درخواست کد تأیید زیاد بود. کمی بعد دوباره تلاش کنید.');
exports.apiLimiter = make(1, 300, 'تعداد درخواست‌ها زیاد است. کمی صبر کنید.');
