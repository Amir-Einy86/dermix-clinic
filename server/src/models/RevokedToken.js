/* RevokedToken — توکن‌هایی که با «خروج» باطل شده‌اند.
   هر توکن ورود یک شناسه‌ی یکتا (jti) دارد؛ با خروج، همان شناسه اینجا ثبت می‌شود و دیگر پذیرفته نمی‌شود.
   رکورد بعد از تاریخ انقضای خود توکن خودکار پاک می‌شود (TTL index)، پس این جدول بزرگ نمی‌شود. */
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('RevokedToken', schema);
