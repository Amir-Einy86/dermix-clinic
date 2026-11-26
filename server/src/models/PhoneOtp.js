/* PhoneOtp — کد تأیید پیامکی موبایل (برای ثبت نوبت آنلاین)
   هش کد و شمارنده‌ی ارسال تا پایان بازه‌ی یک‌ساعته نگه داشته می‌شوند. */
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },          // تلاش‌های اشتباه برای همین کد
  sentCount: { type: Number, default: 1 },         // تعداد ارسال در بازه‌ی فعلی
  windowStart: { type: Date, default: Date.now },  // شروع بازه‌ی یک‌ساعته‌ی شمارش ارسال
  lastSentAt: { type: Date, default: Date.now },
  verifiedUntil: Date,                             // بعد از وارد کردن کد درست، تا این زمان برای ثبت نوبت معتبر است
  validUntil: Date,
  claimId: String,
  consumed: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('PhoneOtp', schema);
